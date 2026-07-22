/**
 * @web-chat/shared
 *
 * Types shared across the server, widget SDK, and dashboard.
 *
 * The one type that matters most here is `ContextPayload` — it's the whole
 * differentiator of this product. Everything else (messages, conversations,
 * tickets, webhooks) is standard support-chat plumbing you could find in any
 * chat widget. ContextPayload is not: it's a structured, host-app-defined
 * snapshot of "what the user is looking at right now" that can be attached
 * to a conversation and rendered as an actionable card instead of a bare link.
 */

// ---------------------------------------------------------------------------
// Context sharing — the core differentiator
// ---------------------------------------------------------------------------

/** A single human-readable key/value row for a context snapshot preview. */
export interface ContextSnapshotField {
  label: string;
  value: string;
}

/**
 * A structured snapshot of application state, captured by the host app and
 * attached to a conversation.
 *
 * Host apps produce this via `WebChat.setContext(...)` (ambient — updates as
 * the user navigates) or `WebChat.shareContext(...)` (explicit — user hits
 * "share this view" and it's inserted into the conversation as a message).
 */
export interface ContextPayload {
  /** Unique id for this captured context instance. */
  id: string;
  /** The integrating app's identifier (see ApiKey.appId). */
  appId: string;
  /** Free-form category the host app assigns, e.g. "view", "record", "report". */
  kind: string;
  /** Short human title, e.g. "Invoices — Overdue, Q2 2026". */
  title: string;
  /** Optional one-line description of what's being shared. */
  summary?: string;
  /**
   * Deep link back into the host app that reproduces this exact state
   * (e.g. a URL with the same filters/query params applied).
   */
  url?: string;
  /**
   * Arbitrary structured data describing the state — filters, selected ids,
   * view mode, date ranges, whatever the host app wants to pass through.
   * This is opaque to web-chat; it's stored and forwarded as-is.
   */
  data?: Record<string, unknown>;
  /**
   * Optional small set of fields rendered directly in the chat as a preview
   * table, so the agent doesn't have to click through to see the gist.
   */
  snapshot?: ContextSnapshotField[];
  capturedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Conversations & messages
// ---------------------------------------------------------------------------

export type ConversationStatus = "open" | "pending" | "ticket" | "closed";

export interface Conversation {
  id: string;
  appId: string;
  status: ConversationStatus;
  /** End-user identity, supplied by the host app at init time. */
  visitorId: string;
  visitorName?: string;
  visitorEmail?: string;
  /** The context that was active when the conversation started, if any. */
  initialContextId?: string | null;
  assignedAgentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageAuthorType = "visitor" | "agent" | "system";

export type MessageType = "text" | "context_card" | "system";

export interface Message {
  id: string;
  conversationId: string;
  authorType: MessageAuthorType;
  authorId: string;
  type: MessageType;
  /** Present for type === "text" | "system". */
  body?: string;
  /** Present for type === "context_card": the id of a ContextPayload. */
  contextId?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Tickets — we deliberately don't build a full ticketing system. Converting
// a conversation to a "ticket" just flips its status and fires a webhook
// with the full conversation + context payload, so the receiving system
// (Linear, Jira, Asana, Zendesk, a Slack channel, anything) can create the
// real ticket. `externalRef` lets that system report back what it created.
// ---------------------------------------------------------------------------

export interface Ticket {
  id: string;
  conversationId: string;
  title: string;
  /** Set by the receiving system via the callback API, if it reports back. */
  externalRef?: string | null;
  externalUrl?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API keys / app identity
// ---------------------------------------------------------------------------

export interface ApiKey {
  appId: string;
  appName: string;
  /** Safe to embed client-side in the widget snippet. */
  publicKey: string;
  /** Server-side only: authenticates dashboard/API calls and signs webhooks. */
  secretKey: string;
  webhookUrl?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | "conversation.created"
  | "message.created"
  | "context.shared"
  | "conversation.converted_to_ticket"
  | "conversation.status_changed";

export interface WebhookEvent<T = unknown> {
  id: string;
  type: WebhookEventType;
  appId: string;
  createdAt: string;
  data: T;
}

export interface WebhookEventConversationCreated {
  conversation: Conversation;
  context?: ContextPayload;
}

export interface WebhookEventMessageCreated {
  message: Message;
  conversation: Conversation;
}

export interface WebhookEventContextShared {
  context: ContextPayload;
  conversation: Conversation;
}

export interface WebhookEventTicketConverted {
  ticket: Ticket;
  conversation: Conversation;
  messages: Message[];
  context?: ContextPayload;
}

// ---------------------------------------------------------------------------
// Widget SDK init options (used by widget-sdk + documented for integrators)
// ---------------------------------------------------------------------------

export interface WebChatInitOptions {
  /** Public key from the dashboard's Settings page. */
  appId: string;
  /** Where the server is hosted; defaults to the widget's configured host. */
  serverUrl?: string;
  visitor: {
    id: string;
    name?: string;
    email?: string;
  };
  /** Visual placement of the launcher bubble. */
  position?: "bottom-right" | "bottom-left";
  /** Optional brand color for the launcher/header. */
  accentColor?: string;
}

export const WEBHOOK_SIGNATURE_HEADER = "x-web-chat-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-web-chat-timestamp";
