import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireSecretKey } from "../auth.js";
import {
  toContextDTO,
  toConversationDTO,
  toMessageDTO,
  toTicketDTO,
} from "../mappers.js";
import { emitConversationUpdate } from "../realtime.js";
import { dispatchWebhook } from "../webhooks.js";

/**
 * We deliberately don't implement a ticketing system here. "Convert to
 * ticket" records the intent locally (so the dashboard can show ticket
 * status) and fires a webhook carrying the full conversation + context, so
 * whatever the integrator already uses for task tracking (Linear, Jira,
 * Asana, a Slack channel, their own backlog) can create the real thing.
 * If that system reports back an id/url, PATCH /api/tickets/:id/callback
 * lets it link back so the dashboard can show "View in Linear ->".
 */
export async function ticketsRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }; Body: { title?: string } }>(
    "/api/conversations/:id/ticket",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const app = request.app!;
      const conversation = await prisma.conversation.findFirst({
        where: { id: request.params.id, appId: app.id },
      });
      if (!conversation) {
        return reply.code(404).send({ error: "Conversation not found" });
      }

      const existingTicket = await prisma.ticket.findUnique({
        where: { conversationId: conversation.id },
      });
      if (existingTicket) {
        return reply.code(409).send({
          error: "Conversation already converted to a ticket",
          ticket: toTicketDTO(existingTicket),
        });
      }

      const title =
        request.body?.title ??
        `Conversation with ${conversation.visitorName ?? conversation.visitorId}`;

      const ticket = await prisma.ticket.create({
        data: { conversationId: conversation.id, title },
      });
      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "ticket" },
      });

      const messages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
      });
      const contextIds = messages
        .map((m) => m.contextId)
        .filter((id): id is string => !!id);
      const contexts = contextIds.length
        ? await prisma.context.findMany({ where: { id: { in: contextIds } } })
        : [];

      const conversationDTO = toConversationDTO(updated);
      emitConversationUpdate(app.id, conversationDTO);

      void dispatchWebhook({
        webhookUrl: app.webhookUrl,
        secretKey: app.secretKey,
        appId: app.id,
        type: "conversation.converted_to_ticket",
        data: {
          ticket: toTicketDTO(ticket),
          conversation: conversationDTO,
          messages: messages.map(toMessageDTO),
          contexts: contexts.map(toContextDTO),
        },
      });

      return reply.code(201).send(toTicketDTO(ticket));
    },
  );

  // Called by the receiving system (or a small integration you write) once
  // it has actually created the ticket, so the dashboard can link to it.
  fastify.patch<{
    Params: { id: string };
    Body: { externalRef?: string; externalUrl?: string };
  }>(
    "/api/tickets/:id/callback",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: request.params.id },
        include: { conversation: true },
      });
      if (!ticket || ticket.conversation.appId !== request.app!.id) {
        return reply.code(404).send({ error: "Ticket not found" });
      }
      const updated = await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          externalRef: request.body?.externalRef,
          externalUrl: request.body?.externalUrl,
        },
      });
      return reply.send(toTicketDTO(updated));
    },
  );
}
