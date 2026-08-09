import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAnyKey, resolveIdentity } from "../auth.js";
import { toConversationDTO, toMessageDTO } from "../mappers.js";
import { emitMessage, emitTeamConversationCreated } from "../realtime.js";
import { resolveVerifiedUser } from "../routing.js";

/**
 * Staff-to-staff DMs and group chat — additive to, and completely separate
 * from, the visitor<->admin support flow in routes/conversations.ts. Every
 * participant is a verified PlatformUser (see identity.ts); there's no
 * visitor/agent asymmetry here, just N members of a thread.
 *
 * Reachable from either the dashboard *or* the widget (see widget-sdk's
 * team-chat support) — accepts either key. The actual authorization is
 * always the caller's own resolved identity token, never the key type: a
 * public key holder with no valid identity token can't create/list/post
 * anything here, and — critically — every route derives "who is this" from
 * the token itself, never from a client-supplied user id, so a public-key
 * caller can never act as, or read, anyone else's conversations. That's
 * what makes this safe to expose beyond the secretKey-holding dashboard.
 */
export async function teamRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { participantIds: string[]; title?: string } }>(
    "/api/team/conversations",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const app = request.app!;
      if (!app.teamChatEnabled) {
        return reply.code(403).send({ error: "Team chat is not enabled for this app." });
      }
      const identity = resolveIdentity(request);
      if (!identity) {
        return reply.code(401).send({
          error: "Starting a team conversation requires a verified identity token (x-identity-token header).",
        });
      }
      const { user: creator } = await resolveVerifiedUser(app.id, identity);

      const { participantIds, title } = request.body ?? ({} as { participantIds: string[]; title?: string });
      const otherIds = [...new Set((participantIds ?? []).filter((id) => id && id !== creator.id))];
      if (otherIds.length === 0) {
        return reply.code(400).send({ error: "participantIds must include at least one other user" });
      }

      const others = await prisma.platformUser.findMany({
        where: { id: { in: otherIds }, appId: app.id },
      });
      if (others.length !== otherIds.length) {
        return reply.code(400).send({ error: "One or more participantIds do not belong to this app" });
      }

      const allParticipantIds = [creator.id, ...otherIds];

      // For a 1:1 DM (exactly 2 total participants), reuse an existing
      // thread between the same two people instead of creating a duplicate
      // every time someone hits "message" on the same colleague.
      if (allParticipantIds.length === 2) {
        const existing = await prisma.conversation.findFirst({
          where: {
            appId: app.id,
            kind: "team",
            participants: { every: { userId: { in: allParticipantIds } } },
            AND: allParticipantIds.map((userId) => ({ participants: { some: { userId } } })),
          },
          include: { participants: { include: { user: true } } },
        });
        if (existing && existing.participants.length === 2) {
          return reply.send(toConversationDTO(existing));
        }
      }

      const conversation = await prisma.conversation.create({
        data: {
          appId: app.id,
          kind: "team",
          title: title || null,
          participants: {
            create: allParticipantIds.map((userId) => ({ userId })),
          },
        },
        include: { participants: { include: { user: true } } },
      });

      const dto = toConversationDTO(conversation);
      emitTeamConversationCreated(allParticipantIds, dto);

      return reply.code(201).send(dto);
    },
  );

  // Lists team conversations the *caller* belongs to. Deliberately ignores
  // any client-supplied user id and always derives the filter from the
  // caller's own resolved identity token — trusting a query param here
  // would let anyone who can reach this route (now including public-key
  // widget callers) read someone else's DMs just by guessing their
  // PlatformUser id.
  fastify.get(
    "/api/team/conversations",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const identity = resolveIdentity(request);
      if (!identity) {
        return reply.code(401).send({
          error: "Listing team conversations requires a verified identity token (x-identity-token header).",
        });
      }
      const { user } = await resolveVerifiedUser(request.app!.id, identity);
      const conversations = await prisma.conversation.findMany({
        where: {
          appId: request.app!.id,
          kind: "team",
          participants: { some: { userId: user.id } },
        },
        orderBy: { updatedAt: "desc" },
        include: { participants: { include: { user: true } } },
      });
      return reply.send(conversations.map(toConversationDTO));
    },
  );

  fastify.post<{ Params: { id: string }; Body: { body: string } }>(
    "/api/team/conversations/:id/messages",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const app = request.app!;
      const identity = resolveIdentity(request);
      if (!identity) {
        return reply.code(401).send({
          error: "Sending a team message requires a verified identity token (x-identity-token header).",
        });
      }
      const { user: sender } = await resolveVerifiedUser(app.id, identity);

      const conversation = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: app.id, kind: "team" },
        include: { participants: true },
      });
      if (!conversation) {
        return reply.code(404).send({ error: "Team conversation not found" });
      }
      if (!conversation.participants.some((p) => p.userId === sender.id)) {
        return reply.code(403).send({ error: "You're not a participant in this conversation" });
      }

      const { body } = request.body ?? ({} as { body: string });
      if (!body || typeof body !== "string") {
        return reply.code(400).send({ error: "body is required" });
      }

      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          authorType: "member",
          authorId: sender.id,
          type: "text",
          body,
        },
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

      const messageDTO = toMessageDTO(message);
      emitMessage(conversation.id, { message: messageDTO });

      return reply.code(201).send(messageDTO);
    },
  );
}
