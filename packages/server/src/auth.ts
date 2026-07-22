import type { App } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db.js";

declare module "fastify" {
  interface FastifyRequest {
    app?: App;
    /** Set when the caller authenticated with the secret key (dashboard/agent side). */
    isAgentContext?: boolean;
  }
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
 */
export async function requireSecretKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
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
