import { nanoid } from "nanoid";
import type { App } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { VerifiedIdentityPayload } from "@web-chat/shared";
import { IDENTITY_TOKEN_HEADER } from "@web-chat/shared";
import { prisma } from "./db.js";
import { verifyIdentityToken } from "./identity.js";

declare module "fastify" {
  interface FastifyRequest {
    app?: App;
    /** Set when the caller authenticated with the secret key (dashboard/agent side) — also true for the master-key path below, same privilege level. */
    isAgentContext?: boolean;
  }
}

const MASTER_KEY_HEADER = "x-webchat-master";
const ORG_HEADER = "x-trustmail-org";

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Trustmail-hosted deployment path (TRUSTMAIL_SERVICE_GUIDE.md §3.1): a
 * request TrustMail's own backend forwards *after* validating the caller's
 * session, subscription, and wallet itself — this service never sees the
 * end user's credentials, only TrustMail's own long-lived master key plus
 * which org the call is for.
 *
 * Only called when the master-key header is present at all, so "present
 * but wrong" is a hard failure (401), not a silent fall-through to legacy
 * key auth — an attacker probing with a bad master key should not get to
 * retry as if they'd sent no credential.
 *
 * Auto-provisions the App on first sight of a given orgId: there's no
 * separate signup step in this deployment mode, since TrustMail's own
 * subscribe/wallet-debit flow is what decided this call was allowed to
 * happen at all — a trustmail org's first authenticated call *is* its
 * signup here.
 */
async function resolveMasterKeyApp(request: FastifyRequest, reply: FastifyReply): Promise<App | null> {
  const masterKey = request.headers[MASTER_KEY_HEADER];
  const configured = process.env.WEBCHAT_MASTER_KEY;
  if (typeof masterKey !== "string" || !configured || !constantTimeEquals(masterKey, configured)) {
    reply.code(401).send({ error: "Invalid master key" });
    return null;
  }

  const orgId = request.headers[ORG_HEADER];
  if (typeof orgId !== "string" || !orgId) {
    reply.code(400).send({ error: `Missing ${ORG_HEADER} header` });
    return null;
  }

  const existing = await prisma.app.findUnique({ where: { orgId } });
  if (existing) return existing;

  // publicKey/secretKey are still generated even here — the embeddable
  // widget snippet on the org's own site needs *some* public key to
  // identify itself with, whether or not the dashboard side is also
  // proxied through TrustMail.
  return prisma.app.create({
    data: {
      orgId,
      name: orgId,
      publicKey: `pk_${nanoid(24)}`,
      secretKey: `sk_${nanoid(32)}`,
    },
  });
}

/**
 * For widget-facing routes: the browser sends the app's *public* key
 * (safe to embed client-side) in the `x-app-key` header.
 */
export async function requirePublicKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const key = request.headers["x-app-key"];
  if (typeof key !== "string") {
    return reply.code(401).send({ error: "Missing x-app-key header" });
  }
  const app = await prisma.app.findUnique({ where: { publicKey: key } });
  if (!app) {
    return reply.code(401).send({ error: "Invalid app key" });
  }
  request.app = app;
  request.isAgentContext = false;
}

/**
 * For dashboard/server-to-server routes: the caller sends the app's
 * *secret* key in the `x-app-secret` header. Never expose this client-side.
 *
 * Also accepts the trustmail master-key path (see resolveMasterKeyApp) as
 * an alternative credential — same privilege level, different deployment
 * mode. Every route already gated by this function gets that support for
 * free; no other route file needs to change once WEBCHAT_MASTER_KEY is set.
 */
export async function requireSecretKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (typeof request.headers[MASTER_KEY_HEADER] === "string") {
    const app = await resolveMasterKeyApp(request, reply);
    if (!app) return; // resolveMasterKeyApp already sent the error response
    request.app = app;
    request.isAgentContext = true;
    return;
  }

  const key = request.headers["x-app-secret"];
  if (typeof key !== "string") {
    return reply.code(401).send({ error: "Missing x-app-secret header" });
  }
  const app = await prisma.app.findUnique({ where: { secretKey: key } });
  if (!app) {
    return reply.code(401).send({ error: "Invalid app secret" });
  }
  request.app = app;
  request.isAgentContext = true;
}

/**
 * For routes both the widget (visitor, public key) and dashboard (agent,
 * secret key) call — e.g. posting a message. Tries the secret key first
 * (agent), falls back to public key (visitor). Sets `request.isAgentContext`
 * so the handler knows which side of the conversation is talking.
 *
 * Note: for the MVP this does not verify that a *visitor's* public-key
 * request actually owns the conversation/visitorId in question beyond
 * appId scoping — a production deployment should issue short-lived visitor
 * session tokens instead of trusting a client-supplied visitorId outright.
 */
export async function requireAnyKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (typeof request.headers[MASTER_KEY_HEADER] === "string") {
    const app = await resolveMasterKeyApp(request, reply);
    if (!app) return; // resolveMasterKeyApp already sent the error response
    request.app = app;
    request.isAgentContext = true;
    return;
  }

  const secret = request.headers["x-app-secret"];
  if (typeof secret === "string") {
    const app = await prisma.app.findUnique({ where: { secretKey: secret } });
    if (app) {
      request.app = app;
      request.isAgentContext = true;
      return;
    }
  }
  const pub = request.headers["x-app-key"];
  if (typeof pub === "string") {
    const app = await prisma.app.findUnique({ where: { publicKey: pub } });
    if (app) {
      request.app = app;
      request.isAgentContext = false;
      return;
    }
  }
  return reply.code(401).send({ error: "Missing or invalid app credentials" });
}

/**
 * Best-effort: verifies the `x-identity-token` header (if present) against
 * `request.app`'s secret key. Returns null — never rejects the request —
 * on anything missing/malformed/expired, so a bad token just falls back to
 * the legacy anonymous-visitor path rather than breaking chat. Must run
 * after a preHandler that sets `request.app` (requirePublicKey et al.).
 */
export function resolveIdentity(request: FastifyRequest): VerifiedIdentityPayload | null {
  const token = request.headers[IDENTITY_TOKEN_HEADER];
  if (typeof token !== "string" || !request.app) return null;
  return verifyIdentityToken(token, request.app.secretKey);
}
