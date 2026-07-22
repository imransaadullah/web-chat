import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { initRealtime } from "./realtime.js";
import { appsRoutes } from "./routes/apps.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { contextRoutes } from "./routes/context.js";
import { ticketsRoutes } from "./routes/tickets.js";

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN ?? "*",
});

fastify.get("/health", async () => ({ ok: true }));

await fastify.register(appsRoutes);
await fastify.register(conversationsRoutes);
await fastify.register(contextRoutes);
await fastify.register(ticketsRoutes);

const port = Number(process.env.PORT ?? 4000);

await fastify.listen({ port, host: "0.0.0.0" });

// Socket.IO needs the raw http server Fastify is built on.
initRealtime(fastify.server);

fastify.log.info(`web-chat server listening on :${port}`);
