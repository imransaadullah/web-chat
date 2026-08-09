import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAnyKey, requireSecretKey, resolveIdentity } from "../auth.js";
import { toPlatformUserDTO } from "../mappers.js";

/**
 * Admin-side routing configuration: responder groups (queues) and the
 * rules that route a verified user's role to one. Both are scoped to the
 * calling app (secretKey) — one tenant's routing rules are invisible to
 * another's, same as everything else in this API.
 */
export async function respondersRoutes(fastify: FastifyInstance) {
  fastify.get("/api/responder-groups", { preHandler: requireSecretKey }, async (request, reply) => {
    const groups = await prisma.responderGroup.findMany({
      where: { appId: request.app!.id },
      orderBy: { createdAt: "asc" },
    });
    return reply.send(
      groups.map((g) => ({ id: g.id, appId: g.appId, key: g.key, name: g.name, createdAt: g.createdAt.toISOString() })),
    );
  });

  fastify.post<{ Body: { key: string; name: string } }>(
    "/api/responder-groups",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const { key, name } = request.body ?? ({} as { key: string; name: string });
      if (!key || !name) {
        return reply.code(400).send({ error: "key and name are required" });
      }
      const existing = await prisma.responderGroup.findUnique({
        where: { appId_key: { appId: request.app!.id, key } },
      });
      if (existing) {
        return reply.code(409).send({ error: "A responder group with this key already exists" });
      }
      const group = await prisma.responderGroup.create({
        data: { appId: request.app!.id, key, name },
      });
      return reply
        .code(201)
        .send({ id: group.id, appId: group.appId, key: group.key, name: group.name, createdAt: group.createdAt.toISOString() });
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/responder-groups/:id",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const group = await prisma.responderGroup.findFirst({
        where: { id: request.params.id, appId: request.app!.id },
      });
      if (!group) return reply.code(404).send({ error: "Not found" });
      // Conversations/rules referencing this group keep their (now dangling)
      // responderGroupId — acceptable for a queue label, not a hard FK a
      // conversation's integrity depends on.
      await prisma.routingRule.deleteMany({ where: { responderGroupId: group.id } });
      await prisma.responderGroup.delete({ where: { id: group.id } });
      return reply.code(204).send();
    },
  );

  fastify.get("/api/routing-rules", { preHandler: requireSecretKey }, async (request, reply) => {
    const rules = await prisma.routingRule.findMany({
      where: { appId: request.app!.id },
      orderBy: { priority: "desc" },
    });
    return reply.send(
      rules.map((r) => ({
        id: r.id,
        appId: r.appId,
        matchRole: r.matchRole,
        responderGroupId: r.responderGroupId,
        priority: r.priority,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  });

  fastify.post<{ Body: { matchRole: string; responderGroupId: string; priority?: number } }>(
    "/api/routing-rules",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const { matchRole, responderGroupId, priority } =
        request.body ?? ({} as { matchRole: string; responderGroupId: string; priority?: number });
      if (!matchRole || !responderGroupId) {
        return reply.code(400).send({ error: "matchRole and responderGroupId are required" });
      }
      const group = await prisma.responderGroup.findFirst({
        where: { id: responderGroupId, appId: request.app!.id },
      });
      if (!group) {
        return reply.code(400).send({ error: "responderGroupId does not belong to this app" });
      }
      const rule = await prisma.routingRule.create({
        data: { appId: request.app!.id, matchRole, responderGroupId, priority: priority ?? 0 },
      });
      return reply.code(201).send({
        id: rule.id,
        appId: rule.appId,
        matchRole: rule.matchRole,
        responderGroupId: rule.responderGroupId,
        priority: rule.priority,
        createdAt: rule.createdAt.toISOString(),
      });
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/routing-rules/:id",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const rule = await prisma.routingRule.findFirst({
        where: { id: request.params.id, appId: request.app!.id },
      });
      if (!rule) return reply.code(404).send({ error: "Not found" });
      await prisma.routingRule.delete({ where: { id: rule.id } });
      return reply.code(204).send();
    },
  );

  // Read-only view of the app's verified-user directory (built lazily as
  // identity tokens arrive — see routing.ts). No bulk import endpoint by
  // design.
  //
  // Accepts either key, but requires the *caller's own* valid identity
  // token regardless — this is reachable from the widget now (team chat's
  // people-picker), not just the dashboard, and a public key alone must
  // never be enough to enumerate everyone's name/email. Being a verified
  // member of the app is the bar to see the rest of the directory, same as
  // any normal team-chat product's member list.
  fastify.get<{ Querystring: { role?: string } }>(
    "/api/users",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const identity = resolveIdentity(request);
      if (!identity) {
        return reply.code(401).send({ error: "Missing or invalid x-identity-token header" });
      }
      const { role } = request.query;
      const users = await prisma.platformUser.findMany({
        where: { appId: request.app!.id, ...(role ? { role } : {}) },
        orderBy: { verifiedAt: "desc" },
        take: 200,
      });
      return reply.send(users.map(toPlatformUserDTO));
    },
  );
}
