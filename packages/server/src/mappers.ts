import type { App, Context, Conversation, Message, PlatformUser, Ticket } from "@prisma/client";
import type {
  ApiKey,
  ContextPayload,
  Conversation as ConversationDTO,
  Message as MessageDTO,
  PlatformUser as PlatformUserDTO,
  Ticket as TicketDTO,
} from "@web-chat/shared";

export function toApiKeyDTO(app: App): ApiKey {
  return {
    appId: app.id,
    appName: app.name,
    publicKey: app.publicKey,
    secretKey: app.secretKey,
    webhookUrl: app.webhookUrl,
    preChatFields: app.preChatFields ? JSON.parse(app.preChatFields) : undefined,
    ticketingEnabled: app.ticketingEnabled,
    widgetChatEnabled: app.widgetChatEnabled,
    teamChatEnabled: app.teamChatEnabled,
    createdAt: app.createdAt.toISOString(),
  };
}

export function toPlatformUserDTO(u: PlatformUser): PlatformUserDTO {
  return {
    id: u.id,
    appId: u.appId,
    externalId: u.externalId,
    name: u.name ?? undefined,
    email: u.email ?? undefined,
    role: u.role ?? undefined,
    verifiedAt: u.verifiedAt.toISOString(),
  };
}

export function toConversationDTO(
  c: Conversation & {
    verifiedUser?: PlatformUser | null;
    participants?: { user: PlatformUser }[];
  },
): ConversationDTO {
  return {
    id: c.id,
    appId: c.appId,
    kind: c.kind as ConversationDTO["kind"],
    status: c.status as ConversationDTO["status"],
    visitorId: c.visitorId ?? undefined,
    visitorName: c.visitorName ?? undefined,
    visitorEmail: c.visitorEmail ?? undefined,
    initialContextId: c.initialContextId,
    assignedAgentId: c.assignedAgentId,
    verifiedUser: c.verifiedUser ? toPlatformUserDTO(c.verifiedUser) : undefined,
    responderGroupId: c.responderGroupId,
    title: c.title,
    participants: c.participants?.map((p) => toPlatformUserDTO(p.user)),
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
    attachmentName: m.attachmentName ?? undefined,
    attachmentType: m.attachmentType ?? undefined,
    attachmentSize: m.attachmentSize ?? undefined,
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
    pageSnapshot: c.pageSnapshot ? JSON.parse(c.pageSnapshot) : undefined,
    capturedAt: c.capturedAt.toISOString(),
  };
}

/**
 * Context DTO for webhook payloads, which go to third-party systems
 * (Linear/Jira/Slack/etc.) — omits pageSnapshot. It's a large, potentially
 * sensitive structural DOM capture meant for the dashboard's own renderer,
 * not something to forward to arbitrary external receivers by default.
 */
export function toWebhookContextDTO(c: Context): ContextPayload {
  const dto = toContextDTO(c);
  delete dto.pageSnapshot;
  return dto;
}

export function toTicketDTO(t: Ticket): TicketDTO {
  return {
    id: t.id,
    conversationId: t.conversationId,
    title: t.title,
    status: t.status as TicketDTO["status"],
    priority: t.priority as TicketDTO["priority"],
    externalRef: t.externalRef,
    externalUrl: t.externalUrl,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
