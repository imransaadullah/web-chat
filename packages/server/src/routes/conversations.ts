import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requirePublicKey, requireSecretKey, requireAnyKey, resolveIdentity } from "../auth.js";
import {
  toContextDTO,
  toConversationDTO,
  toMessageDTO,
} from "../mappers.js";
import { emitConversation, emitConversationUpdate, emitMessage } from "../realtime.js";
import { dispatchWebhook } from "../webhooks.js";
import { serializePageSnapshot } from "../pageSnapshot.js";
import { resolveVerifiedUser } from "../routing.js";
import type { PageSnapshot } from "@web-chat/shared";

interface CreateConversationBody {
  visitor?: { id: string; name?: string; email?: string };
  initialContext?: {
    kind: string;
    title: string;
    summary?: string;
    url?: string;
    data?: Record<string, unknown>;
    snapshot?: { label: string; value: string }[];
    pageSnapshot?: PageSnapshot;
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
      if (!app.widgetChatEnabled) {
        return reply.code(403).send({ error: "Widget chat is not enabled for this app." });
      }
      const { visitor, initialContext, firstMessage } =
        request.body ?? ({} as Partial<CreateConversationBody>);

      // A verified identity token, if present, always wins over whatever
      // the client claims in `visitor` — that's the whole point of
      // verification. Falls back to the legacy client-supplied visitor for
      // anonymous/unauthenticated flows (e.g. a public landing page).
      const identity = resolveIdentity(request);
      let verifiedUserId: string | null = null;
      let responderGroupId: string | null = null;
      let visitorId: string;
      let visitorName: string | undefined;
      let visitorEmail: string | undefined;

      if (identity) {
        const resolved = await resolveVerifiedUser(app.id, identity);
        verifiedUserId = resolved.user.id;
        responderGroupId = resolved.responderGroupId;
        visitorId = identity.userId;
        visitorName = identity.name;
        visitorEmail = identity.email;
      } else if (visitor?.id) {
        visitorId = visitor.id;
        visitorName = visitor.name;
        visitorEmail = visitor.email;
      } else {
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
            pageSnapshot: serializePageSnapshot(initialContext.pageSnapshot, request.log) ?? null,
          },
        });
        contextId = context.id;
        contextDTO = toContextDTO(context);
      }

      const conversation = await prisma.conversation.create({
        data: {
          appId: app.id,
          kind: "support",
          visitorId,
          visitorName,
          visitorEmail,
          initialContextId: contextId,
          verifiedUserId,
          responderGroupId,
        },
        include: { verifiedUser: true },
      });

      const messages = [];
      if (contextId) {
        const contextMsg = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            authorType: "visitor",
            authorId: visitorId,
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
            authorId: visitorId,
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
        data: {
          conversation: conversationDTO,
          // pageSnapshot is a large, dashboard-only render payload — don't
          // forward it to third-party webhook receivers.
          context: contextDTO ? { ...contextDTO, pageSnapshot: undefined } : undefined,
        },
      });

      return reply.code(201).send({
        conversation: conversationDTO,
        context: contextDTO,
        messages,
      });
    },
  );

  // Dashboard: list conversations for the support inbox, newest first.
  // Optionally scoped to one responder group's queue. Explicitly
  // kind:"support" so team DMs/groups (see routes/team.ts) never leak into
  // the support inbox — they have their own list endpoint.
  fastify.get<{ Querystring: { status?: string; responderGroupId?: string } }>(
    "/api/conversations",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const { status, responderGroupId } = request.query;
      const conversations = await prisma.conversation.findMany({
        where: {
          appId: request.app!.id,
          kind: "support",
          ...(status ? { status } : {}),
          ...(responderGroupId ? { responderGroupId } : {}),
        },
        orderBy: { updatedAt: "desc" },
        include: { verifiedUser: true },
      });
      return reply.send(conversations.map(toConversationDTO));
    },
  );

  // Either side: fetch a conversation's full thread (messages + resolved
  // context payloads for any context_card messages). Shared by both
  // kind:"support" and kind:"team" — `participants` is only populated for
  // the latter (see toConversationDTO).
  fastify.get<{ Params: { id: string } }>(
    "/api/conversations/:id",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const conversation = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: request.app!.id },
        include: { verifiedUser: true, participants: { include: { user: true } } },
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
      // kind:"support" only — team conversations have their own message
      // endpoint (POST /api/team/conversations/:id/messages) with
      // participant-based authorization instead of visitor/agent.
      const conversation = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: app.id, kind: "support" },
      });
      if (!conversation) {
        return reply.code(404).send({ error: "Conversation not found" });
      }
      const { body, agentId } = request.body ?? ({} as { body: string; agentId?: string });
      if (!body || typeof body !== "string") {
        return reply.code(400).send({ error: "body is required" });
      }

      const isAgent = request.isAgentContext === true;
      // If the caller (dashboard) presents a verified admin identity token,
      // attribute the message to that real PlatformUser instead of the
      // freeform agentId string — same resolveVerifiedUser() upsert path
      // visitor identity already uses, just scoped to whoever's replying.
      // No identity token still works exactly as before: falls back to the
      // freeform agentId.
      let agentAuthorId = agentId ?? "agent";
      if (isAgent) {
        const identity = resolveIdentity(request);
        if (identity) {
          const resolved = await resolveVerifiedUser(app.id, identity);
          agentAuthorId = resolved.user.id;
        }
      }
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          authorType: isAgent ? "agent" : "visitor",
          // Non-null: guaranteed set for kind:"support" (filtered above).
          authorId: isAgent ? agentAuthorId : conversation.visitorId!,
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
        include: { verifiedUser: true },
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
