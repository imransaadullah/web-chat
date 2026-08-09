import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { prisma } from "../db.js";
import { requireSecretKey } from "../auth.js";
import {
  toConversationDTO,
  toMessageDTO,
  toTicketDTO,
  toWebhookContextDTO,
} from "../mappers.js";
import { emitConversation, emitConversationUpdate } from "../realtime.js";
import { dispatchWebhook } from "../webhooks.js";

/**
 * A ticket has its own status (open/pending/resolved/closed) and priority,
 * tracked locally — real workflow, not just a marker. "Convert to ticket"
 * still also fires a webhook carrying the full conversation + context, so a
 * team that wants tickets to *also* land in Linear/Jira/Asana/a Slack
 * channel can wire that up; that stays optional, not the only way to use
 * ticketing. If an external system reports back an id/url,
 * PATCH /api/tickets/:id/callback lets it link back so the dashboard can
 * show "View in Linear ->".
 */
export async function ticketsRoutes(fastify: FastifyInstance) {
  // Dashboard: list tickets across the app, newest-updated first. Optional
  // status/priority filters for the ticket-queue views.
  fastify.get<{ Querystring: { status?: string; priority?: string } }>(
    "/api/tickets",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const { status, priority } = request.query;
      const tickets = await prisma.ticket.findMany({
        where: {
          conversation: { appId: request.app!.id },
          ...(status ? { status } : {}),
          ...(priority ? { priority } : {}),
        },
        include: { conversation: true },
        orderBy: { updatedAt: "desc" },
      });
      return reply.send(
        tickets.map((t) => ({
          ...toTicketDTO(t),
          conversation: toConversationDTO(t.conversation),
        })),
      );
    },
  );

  // Dashboard: open a ticket directly, with no widget-created conversation
  // behind it — the manual-entry path for a "ticketing only" deployment
  // (phone/email support, no embedded widget). Creates the underlying
  // kind:"support" conversation and the Ticket in one step.
  fastify.post<{
    Body: { title?: string; description?: string; visitorName?: string; visitorEmail?: string; priority?: string };
  }>(
    "/api/tickets",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const app = request.app!;
      if (!app.ticketingEnabled) {
        return reply.code(403).send({ error: "Ticketing is not enabled for this app." });
      }
      const { title, description, visitorName, visitorEmail, priority } =
        request.body ?? ({} as NonNullable<typeof request.body>);
      if (!visitorName && !visitorEmail) {
        return reply.code(400).send({ error: "visitorName or visitorEmail is required" });
      }

      const conversation = await prisma.conversation.create({
        data: {
          appId: app.id,
          kind: "support",
          visitorId: `manual:${nanoid(12)}`,
          visitorName,
          visitorEmail,
        },
      });

      if (description) {
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            authorType: "visitor",
            authorId: conversation.visitorId!,
            type: "text",
            body: description,
          },
        });
      }

      const ticket = await prisma.ticket.create({
        data: {
          conversationId: conversation.id,
          title: title ?? `Ticket for ${visitorName ?? visitorEmail}`,
          ...(priority ? { priority } : {}),
        },
      });
      const updatedConversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "ticket" },
      });

      const conversationDTO = toConversationDTO(updatedConversation);
      emitConversation(app.id, { conversation: conversationDTO, messages: [] });

      void dispatchWebhook({
        webhookUrl: app.webhookUrl,
        secretKey: app.secretKey,
        appId: app.id,
        type: "conversation.converted_to_ticket",
        data: { ticket: toTicketDTO(ticket), conversation: conversationDTO, messages: [] },
      });

      return reply.code(201).send({ ...toTicketDTO(ticket), conversation: conversationDTO });
    },
  );

  // Dashboard: update a ticket's status/priority.
  fastify.patch<{
    Params: { id: string };
    Body: { status?: string; priority?: string };
  }>(
    "/api/tickets/:id",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: request.params.id },
        include: { conversation: true },
      });
      if (!ticket || ticket.conversation.appId !== request.app!.id) {
        return reply.code(404).send({ error: "Ticket not found" });
      }
      const { status, priority } = request.body ?? ({} as { status?: string; priority?: string });
      const updated = await prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(priority !== undefined ? { priority } : {}),
        },
      });
      const dto = toTicketDTO(updated);
      emitConversationUpdate(request.app!.id, toConversationDTO(ticket.conversation));
      return reply.send(dto);
    },
  );

  fastify.post<{ Params: { id: string }; Body: { title?: string } }>(
    "/api/conversations/:id/ticket",
    { preHandler: requireSecretKey },
    async (request, reply) => {
      const app = request.app!;
      if (!app.ticketingEnabled) {
        return reply.code(403).send({ error: "Ticketing is not enabled for this app." });
      }
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
          // pageSnapshot is a large, dashboard-only render payload — don't
          // forward it to third-party webhook receivers.
          contexts: contexts.map(toWebhookContextDTO),
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
