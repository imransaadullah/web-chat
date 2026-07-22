import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { prisma } from "../db.js";
import { requireSecretKey } from "../auth.js";
import { toApiKeyDTO } from "../mappers.js";

export async function appsRoutes(fastify: FastifyInstance) {
  // Onboarding: create a new app/workspace. In a real deployment this would
  // sit behind your own user auth (sign up, log in, then create an app) --
  // left open here since this is a self-hosted starter, not a hosted
  // multi-tenant service yet.
  fastify.post<{ Body: { name: string } }>("/api/apps", async (request, reply) => {
    const { name } = request.body ?? ({} as { name: string });
    if (!name || typeof name !== "string") {
      return reply.code(400).send({ error: "name is required" });
    }
    const app = await prisma.app.create({
      data: {
        name,
        publicKey: `pk_${nanoid(24)}`,
        secretKey: `sk_${nanoid(32)}`,
      },
    });
    return reply.code(201).send(toApiKeyDTO(app));
  });

  // Fetch the current app's own settings (dashboard "Settings" page).
  fastify.get(
    "/api/apps/me",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      return reply.send(toApiKeyDTO(request.app!));
    },
  );

  fastify.patch<{ Body: { name?: string; webhookUrl?: string | null } }>(
    "/api/apps/me",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const { name, webhookUrl } = request.body ?? ({} as { name?: string; webhookUrl?: string | null });
      const app = await prisma.app.update({
        where: { id: request.app!.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(webhookUrl !== undefined ? { webhookUrl } : {}),
        },
      });
      return reply.send(toApiKeyDTO(app));
    },
  );
}
