import type { FastifyInstance } from "fastify";
import type { ContextSnapshotField } from "@web-chat/shared";
import { prisma } from "../db.js";
import { requirePublicKey } from "../auth.js";
import { toContextDTO, toMessageDTO } from "../mappers.js";
import { emitMessage } from "../realtime.js";
import { dispatchWebhook } from "../webhooks.js";

interface ShareContextBody {
  kind: string;
  title: string;
  summary?: string;
  url?: string;
  data?: Record<string, unknown>;
  snapshot?: ContextSnapshotField[];
  /**
   * If true, also drop a context_card message into the conversation
   * immediately (the "share this view" button). If false/omitted, the
   * context is just recorded (e.g. as ambient state via setContext) without
   * interrupting the thread.
   */
  postAsMessage?: boolean;
}

export async function contextRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }; Body: ShareContextBody }>(
    "/api/conversations/:id/context",
    { preHandler: requirePublicKey },
    async (request, reply) => {
      const app = request.app!;
      const conversation = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: app.id },
      });
      if (!conversation) {
        return reply.code(404).send({ error: "Conversation not found" });
      }

      const { kind, title, summary, url, data, snapshot, postAsMessage } =
        request.body;
      if (!kind || !title) {
        return reply.code(400).send({ error: "kind and title are required" });
      }

      const context = await prisma.context.create({
        data: {
          appId: app.id,
          kind,
          title,
          summary,
          url,
          data: data ? JSON.stringify(data) : null,
          snapshot: snapshot ? JSON.stringify(snapshot) : null,
        },
      });
      const contextDTO = toContextDTO(context);

      let messageDTO;
      if (postAsMessage) {
        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            authorType: "visitor",
            authorId: conversation.visitorId,
            type: "context_card",
            contextId: context.id,
          },
        });
        messageDTO = toMessageDTO(message);
        emitMessage(conversation.id, { message: messageDTO, context: contextDTO });
      }

      // Fire-and-forget: let the integrator's own systems know a user just
      // shared live app state, even if they don't render it themselves.
      void dispatchWebhook({
        webhookUrl: app.webhookUrl,
        secretKey: app.secretKey,
        appId: app.id,
        type: "context.shared",
        data: {
          context: contextDTO,
          conversation: {
            id: conversation.id,
            visitorId: conversation.visitorId,
          },
        },
      });

      return reply.code(201).send({ context: contextDTO, message: messageDTO });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/context/:id",
    { preHandler: requirePublicKey },
    async (request, reply) => {
      const context = await prisma.context.findFirst({
        where: { id: request.params.id, appId: request.app!.id },
      });
      if (!context) return reply.code(404).send({ error: "Not found" });
      return reply.send(toContextDTO(context));
    },
  );
}
