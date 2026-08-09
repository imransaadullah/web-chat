import type {
  ApiKey,
  ContextPayload,
  Conversation,
  Message,
  PlatformUser,
  PreChatField,
  ResponderGroup,
  RoutingRule,
  Ticket,
  TicketWithConversation,
} from "@web-chat/shared";
import { IDENTITY_TOKEN_HEADER } from "@web-chat/shared";

// Build-time default for the standalone Vite app (see App.tsx). Embedders
// (e.g. trustmail rendering <Dashboard> inside their own React app) pass
// serverUrl explicitly instead — this constant is never read in that path.
// Optional chaining on .env itself (not just the var under it) matters for
// the library build: under tsup's CJS output, esbuild rewrites `import.meta`
// to `{}`, so `.env` is undefined — `.env.VITE_SERVER_URL` would throw at
// import time, `.env?.VITE_SERVER_URL` safely falls through instead.
const DEFAULT_SERVER_URL = import.meta.env?.VITE_SERVER_URL ?? "http://localhost:4000";

export class DashboardApi {
  readonly serverUrl: string;

  constructor(
    private secretKey: string,
    private identityToken?: string,
    serverUrl?: string,
  ) {
    this.serverUrl = serverUrl ?? DEFAULT_SERVER_URL;
  }

  private get SERVER_URL() {
    return this.serverUrl;
  }

  private headers() {
    return {
      "content-type": "application/json",
      "x-app-secret": this.secretKey,
      ...(this.identityToken ? { [IDENTITY_TOKEN_HEADER]: this.identityToken } : {}),
    };
  }

  static async validateKey(secretKey: string, serverUrl = DEFAULT_SERVER_URL): Promise<ApiKey | null> {
    const res = await fetch(`${serverUrl}/api/apps/me`, {
      headers: { "x-app-secret": secretKey },
    });
    if (!res.ok) return null;
    return res.json();
  }

  async me(): Promise<ApiKey> {
    const res = await fetch(`${this.SERVER_URL}/api/apps/me`, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load app info");
    return res.json();
  }

  async updateSettings(body: {
    name?: string;
    webhookUrl?: string | null;
    preChatFields?: PreChatField[];
    ticketingEnabled?: boolean;
    widgetChatEnabled?: boolean;
    teamChatEnabled?: boolean;
  }): Promise<ApiKey> {
    const res = await fetch(`${this.SERVER_URL}/api/apps/me`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update settings");
    return res.json();
  }

  async listConversations(status?: string, responderGroupId?: string): Promise<Conversation[]> {
    const url = new URL(`${this.SERVER_URL}/api/conversations`);
    if (status && status !== "all") url.searchParams.set("status", status);
    if (responderGroupId) url.searchParams.set("responderGroupId", responderGroupId);
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load conversations");
    return res.json();
  }

  async listResponderGroups(): Promise<ResponderGroup[]> {
    const res = await fetch(`${this.SERVER_URL}/api/responder-groups`, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load responder groups");
    return res.json();
  }

  async createResponderGroup(key: string, name: string): Promise<ResponderGroup> {
    const res = await fetch(`${this.SERVER_URL}/api/responder-groups`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ key, name }),
    });
    if (!res.ok) throw new Error("Failed to create responder group");
    return res.json();
  }

  async deleteResponderGroup(id: string): Promise<void> {
    const res = await fetch(`${this.SERVER_URL}/api/responder-groups/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error("Failed to delete responder group");
  }

  async listRoutingRules(): Promise<RoutingRule[]> {
    const res = await fetch(`${this.SERVER_URL}/api/routing-rules`, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load routing rules");
    return res.json();
  }

  async createRoutingRule(matchRole: string, responderGroupId: string, priority = 0): Promise<RoutingRule> {
    const res = await fetch(`${this.SERVER_URL}/api/routing-rules`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ matchRole, responderGroupId, priority }),
    });
    if (!res.ok) throw new Error("Failed to create routing rule");
    return res.json();
  }

  async deleteRoutingRule(id: string): Promise<void> {
    const res = await fetch(`${this.SERVER_URL}/api/routing-rules/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error("Failed to delete routing rule");
  }

  async listUsers(role?: string): Promise<PlatformUser[]> {
    const url = new URL(`${this.SERVER_URL}/api/users`);
    if (role) url.searchParams.set("role", role);
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load users");
    return res.json();
  }

  /**
   * One-time resolution of this session's identityToken into a durable
   * PlatformUser — see the admin-identity route for why this isn't
   * re-verified per request. Returns null if no identityToken was
   * provided or it's invalid/expired; callers should fall back to
   * unattributed sends in that case, not fail.
   */
  async resolveAdminIdentity(): Promise<PlatformUser | null> {
    if (!this.identityToken) return null;
    // Fastify rejects a POST with content-type: application/json and a
    // truly empty body, so send an empty object rather than dropping the
    // header — headers() always sets content-type since every other POST
    // in this client has a real body.
    const res = await fetch(`${this.SERVER_URL}/api/apps/admin-identity`, {
      method: "POST",
      headers: this.headers(),
      body: "{}",
    });
    if (!res.ok) return null;
    const { user } = (await res.json()) as { user: PlatformUser };
    return user;
  }

  /**
   * Mints a share token for the bookmarklet flow — requires a *fresh*
   * identityToken (unlike sendMessage's agentId), since this is an
   * occasional action, not something sent on every keystroke, so asking
   * for a just-minted token is reasonable. Throws with the server's error
   * message if the caller's identityToken has gone stale.
   */
  async createShareToken(conversationId: string): Promise<{ token: string; expiresAt: string }> {
    const res = await fetch(`${this.SERVER_URL}/api/conversations/${conversationId}/share-token`, {
      method: "POST",
      headers: this.headers(),
      body: "{}",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to create share token");
    }
    return res.json();
  }

  async getConversation(id: string): Promise<{
    conversation: Conversation;
    messages: Message[];
    contexts: ContextPayload[];
    ticket: Ticket | null;
  }> {
    const res = await fetch(`${this.SERVER_URL}/api/conversations/${id}`, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load conversation");
    return res.json();
  }

  async sendMessage(conversationId: string, body: string, agentId = "agent"): Promise<Message> {
    const res = await fetch(`${this.SERVER_URL}/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body, agentId }),
    });
    if (!res.ok) throw new Error("Failed to send message");
    return res.json();
  }

  async updateConversation(
    conversationId: string,
    body: { status?: string; assignedAgentId?: string | null },
  ): Promise<Conversation> {
    const res = await fetch(`${this.SERVER_URL}/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update conversation");
    return res.json();
  }

  async convertToTicket(conversationId: string, title?: string): Promise<Ticket> {
    const res = await fetch(`${this.SERVER_URL}/api/conversations/${conversationId}/ticket`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to convert to ticket");
    }
    return res.json();
  }

  /** Opens a ticket directly — no widget-created conversation needed (phone/email support). */
  async createTicket(body: {
    title?: string;
    description?: string;
    visitorName?: string;
    visitorEmail?: string;
    priority?: string;
  }): Promise<TicketWithConversation> {
    const res = await fetch(`${this.SERVER_URL}/api/tickets`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to create ticket");
    }
    return res.json();
  }

  async listTickets(status?: string, priority?: string): Promise<TicketWithConversation[]> {
    const url = new URL(`${this.SERVER_URL}/api/tickets`);
    if (status && status !== "all") url.searchParams.set("status", status);
    if (priority && priority !== "all") url.searchParams.set("priority", priority);
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load tickets");
    return res.json();
  }

  async updateTicket(
    ticketId: string,
    body: { status?: string; priority?: string },
  ): Promise<Ticket> {
    const res = await fetch(`${this.SERVER_URL}/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update ticket");
    return res.json();
  }

  /** Uploads a file into a conversation (support or team) as a new Message. */
  async sendAttachment(conversationId: string, file: File): Promise<Message> {
    const form = new FormData();
    form.append("file", file);
    const headers = this.headers() as Record<string, string>;
    const { "content-type": _contentType, ...uploadHeaders } = headers;
    const res = await fetch(`${this.SERVER_URL}/api/conversations/${conversationId}/attachments`, {
      method: "POST",
      headers: uploadHeaders,
      body: form,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to upload file");
    }
    return res.json();
  }

  /**
   * Fetches attachment bytes with this session's auth headers attached —
   * the download route requires the app key/identity token, so a plain
   * `<a href>`/`<img src>` (which can't carry custom headers) can't hit it
   * directly. Callers turn the blob into an object URL for previews/downloads.
   */
  async fetchAttachment(messageId: string): Promise<Blob> {
    const res = await fetch(`${this.SERVER_URL}/api/attachments/${messageId}`, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load attachment");
    return res.blob();
  }

  /** Starts (or reuses, for a 1:1 DM) a team conversation. Requires a fresh identityToken. */
  async createTeamConversation(participantIds: string[], title?: string): Promise<Conversation> {
    const res = await fetch(`${this.SERVER_URL}/api/team/conversations`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ participantIds, title }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to start conversation");
    }
    return res.json();
  }

  /** Always scoped to the caller's own resolved identity server-side — no id to pass here. */
  async listTeamConversations(): Promise<Conversation[]> {
    const res = await fetch(`${this.SERVER_URL}/api/team/conversations`, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load team conversations");
    return res.json();
  }

  async sendTeamMessage(conversationId: string, body: string): Promise<Message> {
    const res = await fetch(`${this.SERVER_URL}/api/team/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to send message");
    }
    return res.json();
  }
}

export { DEFAULT_SERVER_URL };
