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
  /**
   * Optional structural capture of the visitor's page at share time, so an
   * agent who has no login/access to the host app can still see roughly
   * what the visitor was looking at. See `PageSnapshot` below.
   */
  pageSnapshot?: PageSnapshot;
  capturedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Page snapshot — a sanitized structural capture of the DOM, NOT a
// screenshot and NOT raw HTML.
//
// Deliberately not "capture outerHTML and render it (even sandboxed) on the
// receiving end": a sandboxed iframe still lets captured <img>/<link>/CSS
// url(...) issue real network requests from the agent's browser back out to
// wherever those URLs point, which both defeats the "agent has no access"
// premise and opens a beaconing/exfiltration vector if a visitor's page
// (or a malicious visitor) crafts those URLs. Instead we walk the live DOM,
// pull only tag name + text content + an allowlisted subset of *computed*
// style properties (already browser-normalized safe tokens, never raw CSS
// text, so there's no `url(...)`/`expression(...)` surface at all), and
// serialize that into plain JSON. The receiving end renders this JSON tree
// through its own small set of React elements — never `innerHTML`, never a
// network fetch. Approximate visual fidelity in exchange for zero ambient
// authority.
// ---------------------------------------------------------------------------

/**
 * Curated, non-executable subset of computed CSS used to redraw a node.
 *
 * Deliberately excludes `width`/`height`/`margin`: computed values for
 * these resolve `auto` against the *original* page's viewport (e.g. a
 * centered `max-width: 720px; margin: 0 auto` container becomes a literal
 * `margin: 0px 650px` at capture time), which is meaningless — and often
 * badly wrong — once replayed inside a panel of a different width. Layout
 * here is approximate by design; only container-relative properties are
 * carried over.
 */
export interface SnapshotStyle {
  display?: string;
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  textDecoration?: string;
  lineHeight?: string;
  padding?: string;
  border?: string;
  borderRadius?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
  opacity?: string;
}

export interface SnapshotNode {
  /** Lowercase HTML tag name, e.g. "div", "p", "td". Never "script"/"style"/etc. */
  tag: string;
  /** Leaf text content (or a current form-control value), if any. Plain text — never HTML. */
  text?: string;
  style?: SnapshotStyle;
  children?: SnapshotNode[];
}

export interface PageSnapshot {
  capturedAt: string; // ISO 8601
  /** True if the walk hit MAX_SNAPSHOT_NODES and stopped early. */
  truncated: boolean;
  nodeCount: number;
  tree: SnapshotNode;
}

/** Hard cap on nodes walked per capture — keeps payloads small and capture fast. */
export const MAX_SNAPSHOT_NODES = 4000;
/** Hard cap on characters kept per text/value node. */
export const MAX_SNAPSHOT_TEXT_LENGTH = 400;
/** Server-side cap on serialized snapshot size; oversized snapshots are dropped, not rejected. */
export const MAX_SNAPSHOT_BYTES = 400_000;
/**
 * Hard cap on render recursion depth, checked by every renderer. A
 * PageSnapshot can arrive from a party we don't fully trust (any caller
 * holding an app's public key can POST one directly, bypassing the
 * widget's own capture code entirely) — small-in-bytes-but-deeply-nested
 * trees are still possible under MAX_SNAPSHOT_BYTES, so byte size alone
 * isn't a sufficient guard against a renderer blowing its call stack.
 */
export const MAX_SNAPSHOT_RENDER_DEPTH = 200;

/**
 * Tag-mapping rules shared by every PageSnapshot renderer (currently the
 * dashboard's React renderer and the widget's vanilla-DOM renderer). Both
 * must apply the *same* allowlist/fallback logic — centralizing it here is
 * what keeps them from silently drifting apart on what's safe to render.
 *
 * - Unmapped tags, and all form controls, fall back to "span": span is
 *   valid phrasing content almost anywhere (including inside <p>), so a
 *   surprise tag can never produce invalid/broken nesting. Actual layout
 *   comes entirely from each node's captured `display` style, not from the
 *   tag itself.
 * - "a" deliberately maps to "span", not "a": we never carry an original
 *   href into the render, so there's nothing to navigate to anyway.
 */
export const SNAPSHOT_TAG_MAP: Record<string, string> = {
  p: "p",
  span: "span",
  a: "span",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  ul: "ul",
  ol: "ol",
  li: "li",
  table: "table",
  thead: "thead",
  tbody: "tbody",
  tr: "tr",
  td: "td",
  th: "th",
  label: "label",
  strong: "strong",
  em: "em",
  b: "b",
  i: "i",
  small: "small",
  code: "code",
  pre: "pre",
  hr: "hr",
  br: "br",
};

export const SNAPSHOT_FORM_TAGS = new Set(["input", "textarea", "select"]);
/** Tags whose captured `text` is structural noise, not content to render. */
export const SNAPSHOT_NO_TEXT_TAGS = new Set(["hr", "br"]);

// ---------------------------------------------------------------------------
// Conversations & messages
// ---------------------------------------------------------------------------

export type ConversationStatus = "open" | "pending" | "ticket" | "closed";

/**
 * "support": the original visitor<->admin shape — one Conversation per
 * visitor, `visitorId`/`visitorName`/`visitorEmail`/routing all apply
 * exactly as documented below, completely unchanged.
 * "team": staff-to-staff DMs and group chat — every participant is a
 * verified `PlatformUser` (see `participants`), no visitor/agent asymmetry.
 * Both share one `Conversation` shape (and the same `Message` stream)
 * because introducing a second, separate conversation type would mean
 * either duplicating messaging end-to-end or a polymorphic relation.
 */
export type ConversationKind = "support" | "team";

export interface Conversation {
  id: string;
  appId: string;
  kind: ConversationKind;
  status: ConversationStatus;
  /**
   * kind:"support" only. End-user identity. Either client-supplied at
   * widget init time (legacy/anonymous path), or — when a valid identity
   * token was presented — taken from the verified token instead, ignoring
   * whatever the client sent. See `verifiedUser` for which case this was.
   */
  visitorId?: string;
  visitorName?: string;
  visitorEmail?: string;
  /** kind:"support" only. The context active when the conversation started, if any. */
  initialContextId?: string | null;
  assignedAgentId?: string | null;
  /** kind:"support" only. Set when the visitor came in via a verified identity token. */
  verifiedUser?: PlatformUser | null;
  /** kind:"support" only. Set from a RoutingRule match against the verified user's role, if any. */
  responderGroupId?: string | null;
  /** kind:"team" only. Optional group name — DMs (2 participants, no title) derive a display name from participants instead. */
  title?: string | null;
  /** kind:"team" only. Every member of this DM/group. */
  participants?: PlatformUser[];
  createdAt: string;
  updatedAt: string;
}

export type MessageAuthorType = "visitor" | "agent" | "member" | "system";

export type MessageType = "text" | "context_card" | "system" | "file";

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
  /** Present for type === "file". Fetch bytes via GET /api/attachments/:messageId. */
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Tickets — we deliberately don't build a full ticketing system. Converting
// a conversation to a "ticket" just flips its status and fires a webhook
// with the full conversation + context payload, so the receiving system
// (Linear, Jira, Asana, Zendesk, a Slack channel, anything) can create the
// real ticket. `externalRef` lets that system report back what it created.
// ---------------------------------------------------------------------------

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface Ticket {
  id: string;
  conversationId: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  /** Set by the receiving system via the callback API, if it reports back. */
  externalRef?: string | null;
  externalUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/tickets — a ticket with its conversation inlined, for list views. */
export interface TicketWithConversation extends Ticket {
  conversation: Conversation;
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
  /** Asked of unauthenticated visitors before their first message, if configured. */
  preChatFields?: PreChatField[];
  /**
   * Deployment-mode toggles — a tenant may only want a subset of what this
   * product does (e.g. ticketing only, no live widget chat). All default
   * true. Enforced both here (UI gating) and server-side (routes reject
   * writes for a disabled mode).
   */
  ticketingEnabled: boolean;
  widgetChatEnabled: boolean;
  teamChatEnabled: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Identity verification — lets a tenant vouch for who's chatting instead of
// trusting a client-supplied visitor id, and carries a `role` that routing
// rules can match on. See packages/server/src/identity.ts.
//
// Deliberately a *signed token* the tenant mints on their own backend, not
// a live "call our API to verify this session" callback: a callback makes
// every chat init depend on the tenant's API being up and fast, and means
// trusting an outbound URL. A signed token needs no network round-trip and
// reuses the same HMAC pattern already used for webhook signing (the app's
// own `secretKey`) — no new credential to issue or rotate.
// ---------------------------------------------------------------------------

/** The payload a tenant's backend signs and hands to `WebChat.init({ identityToken })`. */
export interface VerifiedIdentityPayload {
  /** The tenant's own id for this user — becomes PlatformUser.externalId. */
  userId: string;
  name?: string;
  email?: string;
  /** Tenant-defined segment (e.g. "provider", "customer") — drives routing. */
  role?: string;
  /** Unix seconds. Tokens older than IDENTITY_TOKEN_MAX_AGE_SECONDS are rejected regardless of `exp`. */
  iat: number;
  /** Unix seconds. Required — identity tokens are always short-lived. */
  exp: number;
}

/**
 * A tenant's end user, recognized via a verified identity token. Upserted
 * lazily the first time a valid token for them arrives — there's no bulk
 * directory import.
 */
export interface PlatformUser {
  id: string;
  appId: string;
  externalId: string;
  name?: string;
  email?: string;
  role?: string;
  verifiedAt: string;
}

/** A named queue on the admin/agent side, e.g. "Provider support". */
export interface ResponderGroup {
  id: string;
  appId: string;
  key: string;
  name: string;
  createdAt: string;
}

/** "Verified users with role X go to responder group Y." Highest priority match wins. */
export interface RoutingRule {
  id: string;
  appId: string;
  matchRole: string;
  responderGroupId: string;
  priority: number;
  createdAt: string;
}

export const IDENTITY_TOKEN_HEADER = "x-identity-token";
/**
 * Both a token-freshness cap (rejects anything with `iat` older than this,
 * regardless of what `exp` claims) and the recommended `exp` lifetime for
 * tokens tenants mint. Mirrors the webhook signature's replay-tolerance
 * window (`verifyWebhookSignature`'s default `toleranceSeconds`).
 */
export const IDENTITY_TOKEN_MAX_AGE_SECONDS = 300;

// ---------------------------------------------------------------------------
// Pre-chat lead capture — for unauthenticated visitors (no identity token,
// e.g. a public landing page). Asks a small, tenant-configured set of
// fields before relaying the visitor's first message, so there's at least
// a name/email/contact to follow up with.
// ---------------------------------------------------------------------------

export interface PreChatField {
  /** Stable key this value is stored under, e.g. "email". */
  key: string;
  label: string;
  type: "text" | "email";
  required: boolean;
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
  /**
   * Fallback/legacy identity, used only when `identityToken` isn't
   * supplied. Client-supplied and unverified — anyone can claim any id.
   * Omit entirely when relying on `identityToken`, or on the widget's
   * built-in pre-chat form (see `App.preChatFields`) to collect it instead.
   */
  visitor?: {
    id: string;
    name?: string;
    email?: string;
  };
  /**
   * A signed token minted by the tenant's own backend (see
   * `VerifiedIdentityPayload` / `signIdentityToken`), proving who this
   * visitor actually is. When present, the server ignores `visitor` and
   * uses the verified identity instead — this is what enables routing and
   * a real user directory instead of a trust-the-client visitor id.
   */
  identityToken?: string;
  /** Visual placement of the launcher bubble. */
  position?: "bottom-right" | "bottom-left";
  /** Optional brand color for the launcher/header. */
  accentColor?: string;
}

export const WEBHOOK_SIGNATURE_HEADER = "x-web-chat-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-web-chat-timestamp";
