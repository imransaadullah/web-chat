import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAnyKey, resolveIdentity } from "../auth.js";
import { toMessageDTO } from "../mappers.js";
import { emitMessage } from "../realtime.js";
import { dispatchWebhook } from "../webhooks.js";
import { resolveVerifiedUser } from "../routing.js";
import { resolveFile, storeFile } from "../storage.js";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB

/**
 * File attachments — shared by both kind:"support" (visitor<->agent) and
 * kind:"team" (staff-to-staff) conversations, since the underlying Message
 * row is the same table either way. Authorization mirrors the existing
 * message-send routes exactly: routes/conversations.ts for "support",
 * routes/team.ts for "team" — this file just adds the file-upload/download
 * shape on top, same rules.
 */
export async function attachmentsRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>(
    "/api/conversations/:id/attachments",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const app = request.app!;
      const conversation = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: app.id },
        include: { participants: true },
      });
      if (!conversation) {
        return reply.code(404).send({ error: "Conversation not found" });
      }

      let authorType: string;
      let authorId: string;
      if (conversation.kind === "team") {
        if (!app.teamChatEnabled) {
          return reply.code(403).send({ error: "Team chat is not enabled for this app." });
        }
        const identity = resolveIdentity(request);
        if (!identity) {
          return reply.code(401).send({
            error: "Sending an attachment requires a verified identity token (x-identity-token header).",
          });
        }
        const { user: sender } = await resolveVerifiedUser(app.id, identity);
        if (!conversation.participants.some((p) => p.userId === sender.id)) {
          return reply.code(403).send({ error: "You're not a participant in this conversation" });
        }
        authorType = "member";
        authorId = sender.id;
      } else {
        const isAgent = request.isAgentContext === true;
        let agentAuthorId = "agent";
        if (isAgent) {
          const identity = resolveIdentity(request);
          if (identity) {
            const resolved = await resolveVerifiedUser(app.id, identity);
            agentAuthorId = resolved.user.id;
          }
        }
        authorType = isAgent ? "agent" : "visitor";
        authorId = isAgent ? agentAuthorId : conversation.visitorId!;
      }

      const file = await request.file({
        limits: { fileSize: MAX_ATTACHMENT_BYTES },
      });
      if (!file) {
        return reply.code(400).send({ error: "No file uploaded" });
      }
      const buffer = await file.toBuffer().catch(() => null);
      if (!buffer) {
        return reply.code(413).send({ error: `File exceeds the ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB limit` });
      }

      const stored = await storeFile({
        conversationId: conversation.id,
        filename: file.filename,
        contentType: file.mimetype,
        buffer,
      });

      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          authorType,
          authorId,
          type: "file",
          attachmentUrl: stored.key,
          attachmentName: file.filename,
          attachmentType: file.mimetype,
          attachmentSize: buffer.length,
        },
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

      const messageDTO = toMessageDTO(message);
      emitMessage(conversation.id, { message: messageDTO });

      if (conversation.kind === "support") {
        void dispatchWebhook({
          webhookUrl: app.webhookUrl,
          secretKey: app.secretKey,
          appId: app.id,
          type: "message.created",
          data: { message: messageDTO },
        });
      }

      return reply.code(201).send(messageDTO);
    },
  );

  // Streams/redirects to the actual file bytes. `support` conversations use
  // the same app-wide trust as GET /api/conversations/:id (any holder of
  // this app's key can fetch by id); `team` conversations additionally
  // require the caller to be a participant, matching every other team route.
  fastify.get<{ Params: { messageId: string } }>(
    "/api/attachments/:messageId",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const app = request.app!;
      const message = await prisma.message.findUnique({
        where: { id: request.params.messageId },
        include: { conversation: { include: { participants: true } } },
      });
      if (!message || message.conversation.appId !== app.id || message.type !== "file" || !message.attachmentUrl) {
        return reply.code(404).send({ error: "Attachment not found" });
      }

      if (message.conversation.kind === "team") {
        const identity = resolveIdentity(request);
        if (!identity) {
          return reply.code(401).send({ error: "Requires a verified identity token (x-identity-token header)." });
        }
        const { user } = await resolveVerifiedUser(app.id, identity);
        if (!message.conversation.participants.some((p) => p.userId === user.id)) {
          return reply.code(403).send({ error: "You're not a participant in this conversation" });
        }
      }

      const resolved = await resolveFile(message.attachmentUrl);
      if (resolved.kind === "url") {
        return reply.redirect(resolved.url);
      }
      return reply
        .header("content-type", message.attachmentType ?? "application/octet-stream")
        .header("content-disposition", `attachment; filename="${(message.attachmentName ?? "file").replace(/"/g, "")}"`)
        .send(resolved.buffer);
    },
  );
}
