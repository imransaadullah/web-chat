import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { PreChatField } from "@web-chat/shared";
import { prisma } from "../db.js";
import {
  constantTimeEquals,
  MASTER_KEY_HEADER,
  requireAnyKey,
  requirePublicKey,
  requireSecretKey,
  resolveIdentity,
} from "../auth.js";
import { toApiKeyDTO, toPlatformUserDTO } from "../mappers.js";
import { resolveVerifiedUser } from "../routing.js";

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

  fastify.patch<{
    Body: {
      name?: string;
      webhookUrl?: string | null;
      preChatFields?: PreChatField[];
      ticketingEnabled?: boolean;
      widgetChatEnabled?: boolean;
      teamChatEnabled?: boolean;
    };
  }>(
    "/api/apps/me",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const { name, webhookUrl, preChatFields, ticketingEnabled, widgetChatEnabled, teamChatEnabled } =
        request.body ?? ({} as NonNullable<typeof request.body>);
      const app = await prisma.app.update({
        where: { id: request.app!.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(webhookUrl !== undefined ? { webhookUrl } : {}),
          ...(preChatFields !== undefined ? { preChatFields: JSON.stringify(preChatFields) } : {}),
          ...(ticketingEnabled !== undefined ? { ticketingEnabled } : {}),
          ...(widgetChatEnabled !== undefined ? { widgetChatEnabled } : {}),
          ...(teamChatEnabled !== undefined ? { teamChatEnabled } : {}),
        },
      });
      return reply.send(toApiKeyDTO(app));
    },
  );

  // Widget-facing: the small, non-secret subset of app config the widget
  // needs before a conversation exists (pre-chat form + which deployment
  // modes are active). Public-key gated like everything else the widget
  // calls — must never leak secretKey/webhookUrl.
  fastify.get(
    "/api/apps/widget-config",
    { preHandler: requirePublicKey },
    async (request, reply) => {
      const app = request.app!;
      return reply.send({
        preChatFields: app.preChatFields ? (JSON.parse(app.preChatFields) as PreChatField[]) : [],
        widgetChatEnabled: app.widgetChatEnabled,
        teamChatEnabled: app.teamChatEnabled,
      });
    },
  );

  // Resolves a caller's identity token (deep-linked into the dashboard as
  // ?identityToken=..., or passed to WebChat.init({ identityToken }) in the
  // widget) into a durable PlatformUser once at load. Deliberately a
  // one-time resolution, not something re-sent per request afterward:
  // identity tokens are short-lived (IDENTITY_TOKEN_MAX_AGE_SECONDS) by
  // design, but a session lasts a whole shift — the resolved
  // PlatformUser.id is what the caller then attaches to messages it sends
  // (the dashboard's existing `agentId` field; the widget's team-chat
  // calls). Accepts either key: the actual authorization for anything
  // identity-gated (team chat, this resolution itself) comes from the
  // token, not from which key type the caller happens to hold — a public
  // key with no valid identity token still can't do anything identity
  // requires.
  // Entitlement sync: trustmail is the single billing authority (trial
  // status, subscription state) — this service just enforces whatever
  // trustmail last told it. Master-key only, no session/identity involved,
  // since the caller is trustmail's own backend, not a logged-in user.
  // Upserts by orgId so this works regardless of whether the App was already
  // provisioned (e.g. a subscription purchased before the org ever opened
  // the dashboard).
  fastify.patch<{ Body: { orgId?: string; suspended?: boolean } }>(
    "/api/apps/entitlement",
    async (request, reply) => {
      const masterKey = request.headers[MASTER_KEY_HEADER];
      const configured = process.env.WEBCHAT_MASTER_KEY;
      if (typeof masterKey !== "string" || !configured || !constantTimeEquals(masterKey, configured)) {
        return reply.code(401).send({ error: "Invalid master key" });
      }

      const { orgId, suspended } = request.body ?? {};
      if (typeof orgId !== "string" || !orgId) {
        return reply.code(400).send({ error: "orgId is required" });
      }
      if (typeof suspended !== "boolean") {
        return reply.code(400).send({ error: "suspended must be a boolean" });
      }

      const app = await prisma.app.upsert({
        where: { orgId },
        update: { suspended },
        create: {
          orgId,
          name: orgId,
          publicKey: `pk_${nanoid(24)}`,
          secretKey: `sk_${nanoid(32)}`,
          suspended,
        },
      });

      return reply.send({ ok: true, orgId: app.orgId, suspended: app.suspended });
    },
  );

  fastify.post(
    "/api/apps/admin-identity",
    { preHandler: requireAnyKey },
    async (request, reply) => {
      const identity = resolveIdentity(request);
      if (!identity) {
        return reply.code(401).send({ error: "Missing or invalid x-identity-token header" });
      }
      const { user } = await resolveVerifiedUser(request.app!.id, identity);
      return reply.send({ user: toPlatformUserDTO(user) });
    },
  );
}
