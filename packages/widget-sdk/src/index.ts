import { io, type Socket } from "socket.io-client";
import type { ContextPayload, Message, WebChatInitOptions } from "@web-chat/shared";
import { ApiClient } from "./api.js";
import { buildStyles } from "./styles.js";
import { createLauncher, createPanel, renderContextCard, renderSystemMessage, renderTextMessage } from "./ui.js";

export type { WebChatInitOptions } from "@web-chat/shared";

type ShareableContext = Omit<ContextPayload, "id" | "appId" | "capturedAt">;

const DEFAULT_SERVER_URL = "http://localhost:4000";

class WebChatClient {
  private options?: WebChatInitOptions;
  private api?: ApiClient;
  private socket?: Socket;
  private conversationId: string | null = null;
  private latestContext: ShareableContext | null = null;
  private els?: ReturnType<typeof createPanel>;
  private launcherEl?: HTMLButtonElement;
  private isOpen = false;
  private renderedContextIds = new Set<string>();

  init(options: WebChatInitOptions): void {
    if (this.options) {
      console.warn("[WebChat] init() called more than once — ignoring.");
      return;
    }
    this.options = options;
    const serverUrl = options.serverUrl ?? DEFAULT_SERVER_URL;
    this.api = new ApiClient(serverUrl, options.appId);

    const hostEl = document.createElement("div");
    hostEl.id = "web-chat-widget-root";
    document.body.appendChild(hostEl);
    const shadow = hostEl.attachShadow({ mode: "open" });

    const styleEl = document.createElement("style");
    styleEl.textContent = buildStyles(options.accentColor ?? "#5850ec");
    shadow.appendChild(styleEl);

    const position = options.position ?? "bottom-right";
    this.launcherEl = createLauncher(() => this.toggle());
    this.launcherEl.style[position === "bottom-right" ? "right" : "left"] = "20px";
    shadow.appendChild(this.launcherEl);

    this.els = createPanel({
      position,
      onClose: () => this.toggle(),
      onSend: (text) => void this.sendMessage(text),
    });
    shadow.appendChild(this.els.root);

    this.restoreConversation();
    this.connectSocketIfNeeded(serverUrl);
  }

  /** Ambient context update — called whenever the host app's view/filters change. */
  setContext(payload: ShareableContext): void {
    this.latestContext = payload;
  }

  /**
   * Explicit share — inserts a context card into the conversation right now.
   * Falls back to the last setContext() payload if none is passed.
   */
  async shareContext(payload?: ShareableContext): Promise<void> {
    const ctx = payload ?? this.latestContext;
    if (!ctx) {
      console.warn("[WebChat] shareContext() called with no context available.");
      return;
    }
    await this.ensureConversation();
    if (!this.conversationId || !this.api) return;
    const { context, message } = await this.api.shareContext(this.conversationId, {
      ...ctx,
      postAsMessage: true,
    } as ShareableContext & { postAsMessage: boolean });
    if (message && this.els) {
      this.renderedContextIds.add(context.id);
      renderContextCard(this.els.messages, context);
    }
  }

  open(): void {
    if (!this.els || !this.launcherEl) return;
    this.els.root.classList.remove("wc-hidden");
    this.isOpen = true;
    void this.ensureConversation();
  }

  close(): void {
    this.els?.root.classList.add("wc-hidden");
    this.isOpen = false;
  }

  private toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  private storageKey(): string {
    return `web-chat:${this.options?.appId}:conversationId`;
  }

  private restoreConversation(): void {
    try {
      const saved = localStorage.getItem(this.storageKey());
      if (saved) this.conversationId = saved;
    } catch {
      // localStorage unavailable (privacy mode, etc.) — conversation just
      // won't persist across reloads.
    }
  }

  private async ensureConversation(): Promise<void> {
    if (this.conversationId || !this.api || !this.options) return;
    const { conversation, context } = await this.api.createConversation({
      visitor: this.options.visitor,
      initialContext: this.latestContext ?? undefined,
    });
    this.conversationId = conversation.id;
    try {
      localStorage.setItem(this.storageKey(), conversation.id);
    } catch {
      /* ignore */
    }
    if (context && this.els) {
      this.renderedContextIds.add(context.id);
      renderContextCard(this.els.messages, context);
    }
    this.socket?.emit("join:conversation", this.conversationId);
  }

  private async sendMessage(text: string): Promise<void> {
    await this.ensureConversation();
    if (!this.conversationId || !this.api || !this.els) return;
    const message = await this.api.postMessage(this.conversationId, text);
    renderTextMessage(this.els.messages, message);
  }

  private connectSocketIfNeeded(serverUrl: string): void {
    this.socket = io(serverUrl, { transports: ["websocket", "polling"] });
    this.socket.on("connect", () => {
      if (this.conversationId) this.socket?.emit("join:conversation", this.conversationId);
    });
    this.socket.on("message:new", (payload: { message: Message; context?: ContextPayload }) => {
      if (!this.els) return;
      // Don't double-render a message we already rendered optimistically.
      const { message, context } = payload;
      if (message.authorType === "visitor") return;
      if (message.type === "context_card" && context) {
        if (this.renderedContextIds.has(context.id)) return;
        this.renderedContextIds.add(context.id);
        renderContextCard(this.els.messages, context);
      } else if (message.type === "system") {
        renderSystemMessage(this.els.messages, message.body ?? "");
      } else {
        renderTextMessage(this.els.messages, message);
      }
      if (!this.isOpen) this.launcherEl?.classList.add("wc-has-unread");
    });
  }
}

declare global {
  interface Window {
    WebChat: WebChatClient;
  }
}

const instance = new WebChatClient();
if (typeof window !== "undefined") {
  window.WebChat = instance;
}

export default instance;
