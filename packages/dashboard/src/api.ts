import type { ApiKey, ContextPayload, Conversation, Message, Ticket } from "@web-chat/shared";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:4000";

export class DashboardApi {
  constructor(private secretKey: string) {}

  private headers() {
    return {
      "content-type": "application/json",
      "x-app-secret": this.secretKey,
    };
  }

  static async validateKey(secretKey: string): Promise<ApiKey | null> {
    const res = await fetch(`${SERVER_URL}/api/apps/me`, {
      headers: { "x-app-secret": secretKey },
    });
    if (!res.ok) return null;
    return res.json();
  }

  async me(): Promise<ApiKey> {
    const res = await fetch(`${SERVER_URL}/api/apps/me`, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load app info");
    return res.json();
  }

  async updateSettings(body: { name?: string; webhookUrl?: string | null }): Promise<ApiKey> {
    const res = await fetch(`${SERVER_URL}/api/apps/me`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update settings");
    return res.json();
  }

  async listConversations(status?: string): Promise<Conversation[]> {
    const url = new URL(`${SERVER_URL}/api/conversations`);
    if (status && status !== "all") url.searchParams.set("status", status);
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load conversations");
    return res.json();
  }

  async getConversation(id: string): Promise<{
    conversation: Conversation;
    messages: Message[];
    contexts: ContextPayload[];
    ticket: Ticket | null;
  }> {
    const res = await fetch(`${SERVER_URL}/api/conversations/${id}`, { headers: this.headers() });
    if (!res.ok) throw new Error("Failed to load conversation");
    return res.json();
  }

  async sendMessage(conversationId: string, body: string, agentId = "agent"): Promise<Message> {
    const res = await fetch(`${SERVER_URL}/api/conversations/${conversationId}/messages`, {
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
    const res = await fetch(`${SERVER_URL}/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update conversation");
    return res.json();
  }

  async convertToTicket(conversationId: string, title?: string): Promise<Ticket> {
    const res = await fetch(`${SERVER_URL}/api/conversations/${conversationId}/ticket`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error("Failed to convert to ticket");
    return res.json();
  }
}

export { SERVER_URL };
