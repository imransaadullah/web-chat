import type {
  Conversation,
  ContextPayload,
  Message,
  PlatformUser,
  PreChatField,
  WebChatInitOptions,
} from "@web-chat/shared";
import { IDENTITY_TOKEN_HEADER } from "@web-chat/shared";

export class ApiClient {
  constructor(
    private serverUrl: string,
    private appId: string,
    private identityToken?: string,
  ) {}

  private headers() {
    return {
      "content-type": "application/json",
      "x-app-key": this.appId,
      ...(this.identityToken ? { [IDENTITY_TOKEN_HEADER]: this.identityToken } : {}),
    };
  }

  async createConversation(body: {
    visitor?: WebChatInitOptions["visitor"];
    initialContext?: Omit<ContextPayload, "id" | "appId" | "capturedAt">;
    firstMessage?: string;
  }): Promise<{ conversation: Conversation; context?: ContextPayload; messages: Message[] }> {
    const res = await fetch(`${this.serverUrl}/api/conversations`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`createConversation failed: ${res.status}`);
    return res.json();
  }

  async getWidgetConfig(): Promise<{
    preChatFields: PreChatField[];
    widgetChatEnabled: boolean;
    teamChatEnabled: boolean;
  }> {
    const res = await fetch(`${this.serverUrl}/api/apps/widget-config`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`getWidgetConfig failed: ${res.status}`);
    return res.json();
  }

  async getConversation(id: string): Promise<{
    conversation: Conversation;
    messages: Message[];
    contexts: ContextPayload[];
  }> {
    const res = await fetch(`${this.serverUrl}/api/conversations/${id}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`getConversation failed: ${res.status}`);
    return res.json();
  }

  async postMessage(conversationId: string, body: string): Promise<Message> {
    const res = await fetch(`${this.serverUrl}/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`postMessage failed: ${res.status}`);
    return res.json();
  }

  async shareContext(
    conversationId: string,
    payload: Omit<ContextPayload, "id" | "appId" | "capturedAt"> & { postAsMessage?: boolean },
  ): Promise<{ context: ContextPayload; message?: Message }> {
    const res = await fetch(`${this.serverUrl}/api/conversations/${conversationId}/context`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`shareContext failed: ${res.status}`);
    return res.json();
  }

  /**
   * One-time resolution of this widget instance's identityToken into a
   * durable PlatformUser — same pattern and same reasoning as the
   * dashboard's resolveAdminIdentity: tokens are short-lived by design, a
   * widget session lasts as long as the page is open, so this is resolved
   * once and the id reused, not re-verified per team-chat call. Returns
   * null (not a throw) on anything missing/invalid — team chat just stays
   * unavailable in that case, same graceful-degradation as everywhere else
   * identity is optional.
   */
  async resolveIdentity(): Promise<PlatformUser | null> {
    if (!this.identityToken) return null;
    const res = await fetch(`${this.serverUrl}/api/apps/admin-identity`, {
      method: "POST",
      headers: this.headers(),
      body: "{}",
    });
    if (!res.ok) return null;
    const { user } = (await res.json()) as { user: PlatformUser };
    return user;
  }

  /** The app's verified-user directory, for the team-chat people-picker. Requires a resolved identity. */
  async listTeamUsers(): Promise<PlatformUser[]> {
    const res = await fetch(`${this.serverUrl}/api/users`, { headers: this.headers() });
    if (!res.ok) throw new Error(`listTeamUsers failed: ${res.status}`);
    return res.json();
  }

  /** Team DMs/groups this widget's identified user belongs to — scoped server-side, not by any id passed here. */
  async listTeamConversations(): Promise<Conversation[]> {
    const res = await fetch(`${this.serverUrl}/api/team/conversations`, { headers: this.headers() });
    if (!res.ok) throw new Error(`listTeamConversations failed: ${res.status}`);
    return res.json();
  }

  /** Starts (or reuses, for a 1:1 DM) a team conversation. */
  async createTeamConversation(participantIds: string[], title?: string): Promise<Conversation> {
    const res = await fetch(`${this.serverUrl}/api/team/conversations`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ participantIds, title }),
    });
    if (!res.ok) throw new Error(`createTeamConversation failed: ${res.status}`);
    return res.json();
  }

  async sendTeamMessage(conversationId: string, body: string): Promise<Message> {
    const res = await fetch(`${this.serverUrl}/api/team/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`sendTeamMessage failed: ${res.status}`);
    return res.json();
  }

  /** Fetches attachment bytes with this widget's auth headers — see renderFileMessage's onDownload. */
  async fetchAttachment(messageId: string): Promise<Blob> {
    const res = await fetch(`${this.serverUrl}/api/attachments/${messageId}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`fetchAttachment failed: ${res.status}`);
    return res.blob();
  }
}
