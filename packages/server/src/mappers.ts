import type { App, Context, Conversation, Message, Ticket } from "@prisma/client";
import type {
  ApiKey,
  ContextPayload,
  Conversation as ConversationDTO,
  Message as MessageDTO,
  Ticket as TicketDTO,
} from "@web-chat/shared";

export function toApiKeyDTO(app: App): ApiKey {
  return {
    appId: app.id,
    appName: app.name,
    publicKey: app.publicKey,
    secretKey: app.secretKey,
    webhookUrl: app.webhookUrl,
    createdAt: app.createdAt.toISOString(),
  };
}

export function toConversationDTO(c: Conversation): ConversationDTO {
  return {
    id: c.id,
    appId: c.appId,
    status: c.status as ConversationDTO["status"],
    visitorId: c.visitorId,
    visitorName: c.visitorName ?? undefined,
    visitorEmail: c.visitorEmail ?? undefined,
    initialContextId: c.initialContextId,
    assignedAgentId: c.assignedAgentId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toMessageDTO(m: Message): MessageDTO {
  return {
    id: m.id,
    conversationId: m.conversationId,
    authorType: m.authorType as MessageDTO["authorType"],
    authorId: m.authorId,
    type: m.type as MessageDTO["type"],
    body: m.body ?? undefined,
    contextId: m.contextId ?? undefined,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toContextDTO(c: Context): ContextPayload {
  return {
    id: c.id,
    appId: c.appId,
    kind: c.kind,
    title: c.title,
    summary: c.summary ?? undefined,
    url: c.url ?? undefined,
    data: c.data ? JSON.parse(c.data) : undefined,
    snapshot: c.snapshot ? JSON.parse(c.snapshot) : undefined,
    capturedAt: c.capturedAt.toISOString(),
  };
}

export function toTicketDTO(t: Ticket): TicketDTO {
  return {
    id: t.id,
    conversationId: t.conversationId,
    title: t.title,
    externalRef: t.externalRef,
    externalUrl: t.externalUrl,
    createdAt: t.createdAt.toISOString(),
  };
}
