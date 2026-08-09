import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PageSnapshot } from "@web-chat/shared";
import { prisma } from "../db.js";
import { requireSecretKey, resolveIdentity } from "../auth.js";
import { toContextDTO, toMessageDTO } from "../mappers.js";
import { emitMessage } from "../realtime.js";
import { dispatchWebhook } from "../webhooks.js";
import { serializePageSnapshot } from "../pageSnapshot.js";
import { resolveVerifiedUser } from "../routing.js";

const SHARE_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough to switch tabs and paste, short enough that a leaked token isn't useful for long

/**
 * Lets an admin, from inside an open conversation in the dashboard, share a
 * page they're looking at *elsewhere* (their own internal tool — a site we
 * don't control and can't reach into). Two-step flow: mint a short-lived,
 * single-use, conversation-scoped token here; the bookmarklet running on
 * the target page later redeems it via the public capture endpoint below.
 * See README's "Sharing a page from the admin side" section for the full
 * flow and why this isn't a live cross-tab handshake.
 */
export async function shareTokensRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>(
    "/api/conversations/:id/share-token",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const app = request.app!;
      const conversation = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: app.id },
      });
      if (!conversation) {
        return reply.code(404).send({ error: "Conversation not found" });
      }

      // Requires a verified admin identity — an anonymous share-token
      // would defeat the point of attributing who shared what. This is a
      // new capability, not a change to the existing secretKey-only flows
      // (sending a plain text reply still works with no identity token).
      const identity = resolveIdentity(request);
      if (!identity) {
        return reply.code(401).send({
          error:
            "Sharing a page requires a verified admin identity token (x-identity-token header). Plain secretKey access isn't enough to attribute a share.",
        });
      }
      const { user } = await resolveVerifiedUser(app.id, identity);

      const token = randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_MS);
      await prisma.shareToken.create({
        data: {
          appId: app.id,
          conversationId: conversation.id,
          token,
          issuedByUserId: user.id,
          expiresAt,
        },
      });

      return reply.code(201).send({ token, expiresAt: expiresAt.toISOString() });
    },
  );

  // Public: no app-key header. This runs from the bookmarklet, executing on
  // a third-party page we have no other credential for — the token itself
  // is the entire credential, which is exactly why it's short-lived,
  // single-use, and scoped to one conversation rather than a general-
  // purpose API key.
  fastify.post<{
    Params: { token: string };
    Body: { title?: string; url?: string; pageSnapshot?: PageSnapshot };
  }>("/api/share-tokens/:token/capture", async (request, reply) => {
    const shareToken = await prisma.shareToken.findUnique({
      where: { token: request.params.token },
      include: { conversation: true, app: true },
    });
    if (!shareToken) {
      return reply.code(404).send({ error: "Invalid share token" });
    }
    if (shareToken.usedAt) {
      return reply.code(409).send({ error: "This share token has already been used" });
    }
    if (shareToken.expiresAt < new Date()) {
      return reply.code(410).send({ error: "This share token has expired" });
    }

    const { title, url, pageSnapshot } = request.body ?? ({} as typeof request.body);
    if (!pageSnapshot) {
      return reply.code(400).send({ error: "pageSnapshot is required" });
    }

    const app = shareToken.app;
    const conversation = shareToken.conversation;

    const context = await prisma.context.create({
      data: {
        appId: app.id,
        kind: "page",
        title: title || url || "Shared page",
        url,
        pageSnapshot: serializePageSnapshot(pageSnapshot, request.log) ?? null,
      },
    });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        authorType: "agent",
        authorId: shareToken.issuedByUserId ?? shareToken.issuedByLabel ?? "agent",
        type: "context_card",
        contextId: context.id,
      },
    });
    await prisma.shareToken.update({ where: { id: shareToken.id }, data: { usedAt: new Date() } });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    const contextDTO = toContextDTO(context);
    const messageDTO = toMessageDTO(message);
    emitMessage(conversation.id, { message: messageDTO, context: contextDTO });

    void dispatchWebhook({
      webhookUrl: app.webhookUrl,
      secretKey: app.secretKey,
      appId: app.id,
      type: "context.shared",
      data: {
        context: { ...contextDTO, pageSnapshot: undefined },
        conversation: { id: conversation.id, visitorId: conversation.visitorId },
      },
    });

    return reply.code(201).send({ context: contextDTO, message: messageDTO });
  });
}
