import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requirePublicKey, requireSecretKey, requireAnyKey } from "../auth.js";
import {
  toContextDTO,
  toConversationDTO,
  toMessageDTO,
} from "../mappers.js";
import { emitConversation, emitConversationUpdate, emitMessage } from "../realtime.js";
import { dispatchWebhook } from "../webhooks.js";

interface CreateConversationBody {
  visitor: { id: string; name?: string; email?: string };
  initialContext?: {
    kind: string;
    title: string;
    summary?: string;
    url?: string;
    data?: Record<string, unknown>;
    snapshot?: { label: string; value: string }[];
  };
  /** First message the visitor typed, if any. */
  firstMessage?: string;
}

export async function conversationsRoutes(fastify: FastifyInstance) {
  // Widget: start a conversation, optionally carrying the app state the
  // visitor was looking at when they opened the chat.
  fastify.post<{ Body: CreateConversationBody }>(
    "/api/conversations",
    { preHandler: requirePublicKey },
    async (request, reply) => {
      const app = request.app!;
      const { visitor, initialContext, firstMessage } =
        request.body ?? ({} as Partial<CreateConversationBody>);
      if (!visitor?.id) {
        return reply.code(400).send({ error: "visitor.id is required" });
      }

      let contextId: string | null = null;
      let contextDTO;
      if (initialContext) {
        const context = await prisma.context.create({
          data: {
            appId: app.id,
            kind: initialContext.kind,
            title: initialContext.title,
            summary: initialContext.summary,
            url: initialContext.url,
            data: initialContext.data ? JSON.stringify(initialContext.data) : null,
            snapshot: initialContext.snapshot
              ? JSON.stringify(initialContext.snapshot)
              : null,
          },
        });
        contextId = context.id;
        contextDTO = toContextDTO(context);
      }

      const conversation = await prisma.conversation.create({
        data: {
          appId: app.id,
          visitorId: visitor.id,
          visitorName: visitor.name,
          visitorEmail: visitor.email,
          initialContextId: contextId,
        },
      });

      const messages = [];
      if (contextId) {
        const contextMsg = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            authorType: "visitor",
            authorId: visitor.id,
            type: "context_card",
            contextId,
          },
        });
        messages.push(toMessageDTO(contextMsg));
      }
      if (firstMessage) {
        const textMsg = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            authorType: "visitor",
            authorId: visitor.id,
            type: "text",
            body: firstMessage,
          },
        });
        messages.push(toMessageDTO(textMsg));
      }

      const conversationDTO = toConversationDTO(conversation);
      emitConversation(app.id, { conversation: conversationDTO, context: contextDTO, messages });

      void dispatchWebhook({
        webhookUrl: app.webhookUrl,
        secretKey: app.secretKey,
        appId: app.id,
        type: "conversation.created",
        data: { conversation: conversationDTO, context: contextDTO },
      });

      return reply.code(201).send({
        conversation: conversationDTO,
        context: contextDTO,
        messages,
      });
    },
  );

  // Dashboard: list conversations for the inbox, newest first.
  fastify.get<{ Querystring: { status?: string } }>(
    "/api/conversations",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const { status } = request.query;
      const conversations = await prisma.conversation.findMany({
        where: { appId: request.app!.id, ...(status ? { status } : {}) },
        orderBy: { updatedAt: "desc" },
      });
      return reply.send(conversations.map(toConversationDTO));
    },
  );

  // Either side: fetch a conversation's full thread (messages + resolved
  // context payloads for any context_card messages).
  fastify.get<{ Params: { id: string } }>(
    "/api/conversations/:id",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const conversation = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: request.app!.id },
      });
      if (!conversation) {
        return reply.code(404).send({ error: "Conversation not found" });
      }
      const messages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
      });
      const contextIds = messages
        .map((m) => m.contextId)
        .filter((id): id is string => !!id);
      const contexts = contextIds.length
        ? await prisma.context.findMany({ where: { id: { in: contextIds } } })
        : [];
      const ticket = await prisma.ticket.findUnique({
        where: { conversationId: conversation.id },
      });

      return reply.send({
        conversation: toConversationDTO(conversation),
        messages: messages.map(toMessageDTO),
        contexts: contexts.map(toContextDTO),
        ticket: ticket ? { ...ticket, createdAt: ticket.createdAt.toISOString() } : null,
      });
    },
  );

  // Either side: post a message. authorType/authorId are derived from which
  // credential authenticated the request, not trusted from the body.
  fastify.post<{ Params: { id: string }; Body: { body: string; agentId?: string } }>(
    "/api/conversations/:id/messages",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const app = request.app!;
      const conversation = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: app.id },
      });
      if (!conversation) {
        return reply.code(404).send({ error: "Conversation not found" });
      }
      const { body, agentId } = request.body ?? ({} as { body: string; agentId?: string });
      if (!body || typeof body !== "string") {
        return reply.code(400).send({ error: "body is required" });
      }

      const isAgent = request.isAgentContext === true;
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          authorType: isAgent ? "agent" : "visitor",
          authorId: isAgent ? agentId ?? "agent" : conversation.visitorId,
          type: "text",
          body,
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      const messageDTO = toMessageDTO(message);
      emitMessage(conversation.id, { message: messageDTO });

      void dispatchWebhook({
        webhookUrl: app.webhookUrl,
        secretKey: app.secretKey,
        appId: app.id,
        type: "message.created",
        data: { message: messageDTO, conversation: toConversationDTO(conversation) },
      });

      return reply.code(201).send(messageDTO);
    },
  );

  // Dashboard: change status / assignment.
  fastify.patch<{
    Params: { id: string };
    Body: { status?: string; assignedAgentId?: string | null };
  }>(
    "/api/conversations/:id",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const app = request.app!;
      const existing = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: app.id },
      });
      if (!existing) {
        return reply.code(404).send({ error: "Conversation not found" });
      }
      const { status, assignedAgentId } = request.body ?? ({} as {
        status?: string;
        assignedAgentId?: string | null;
      });
      const conversation = await prisma.conversation.update({
        where: { id: existing.id },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(assignedAgentId !== undefined ? { assignedAgentId } : {}),
        },
      });
      const dto = toConversationDTO(conversation);
      emitConversationUpdate(app.id, dto);

      if (status && status !== existing.status) {
        void dispatchWebhook({
          webhookUrl: app.webhookUrl,
          secretKey: app.secretKey,
          appId: app.id,
          type: "conversation.status_changed",
          data: { conversation: dto, previousStatus: existing.status },
        });
      }

      return reply.send(dto);
    },
  );
}
