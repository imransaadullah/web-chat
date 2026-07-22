import type { Conversation, ContextPayload, Message, WebChatInitOptions } from "@web-chat/shared";

export class ApiClient {
  constructor(
    private serverUrl: string,
    private appId: string,
  ) {}

  private headers() {
    return {
      "content-type": "application/json",
      "x-app-key": this.appId,
    };
  }

  async createConversation(body: {
    visitor: WebChatInitOptions["visitor"];
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
}
