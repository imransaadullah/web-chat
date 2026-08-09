import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { initRealtime } from "./realtime.js";
import { appsRoutes } from "./routes/apps.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { contextRoutes } from "./routes/context.js";
import { ticketsRoutes } from "./routes/tickets.js";
import { respondersRoutes } from "./routes/responders.js";
import { shareTokensRoutes } from "./routes/shareTokens.js";
import { teamRoutes } from "./routes/team.js";
import { attachmentsRoutes } from "./routes/attachments.js";

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN ?? "*",
});
await fastify.register(multipart);

fastify.get("/health", async () => ({ ok: true }));

await fastify.register(appsRoutes);
await fastify.register(conversationsRoutes);
await fastify.register(contextRoutes);
await fastify.register(ticketsRoutes);
await fastify.register(respondersRoutes);
await fastify.register(shareTokensRoutes);
await fastify.register(teamRoutes);
await fastify.register(attachmentsRoutes);

const port = Number(process.env.PORT ?? 4000);
// Defaults to all interfaces for local dev. Set HOST=127.0.0.1 in
// production once this runs behind trustmail's backend (per
// TRUSTMAIL_SERVICE_GUIDE.md §1: "your service has no public routes").
const host = process.env.HOST ?? "0.0.0.0";

await fastify.listen({ port, host });

// Socket.IO needs the raw http server Fastify is built on.
initRealtime(fastify.server);

fastify.log.info(`web-chat server listening on :${port}`);
