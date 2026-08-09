import { io, type Socket } from "socket.io-client";
import type {
  Conversation,
  ContextPayload,
  Message,
  MessageAuthorType,
  PlatformUser,
  PreChatField,
  WebChatInitOptions,
} from "@web-chat/shared";
import { ApiClient } from "./api.js";
import { capturePageSnapshot } from "./snapshot.js";
import { buildStyles } from "./styles.js";
import {
  createLauncher,
  createPanel,
  renderContextCard,
  renderFileMessage,
  renderPreChatForm,
  renderSystemMessage,
  renderTeamConversationList,
  renderTeamFileMessage,
  renderTeamMessage,
  renderTeamPicker,
  renderTeamThreadHeader,
  renderTextMessage,
  teamConversationLabel,
} from "./ui.js";

export type { WebChatInitOptions } from "@web-chat/shared";

type ShareableContext = Omit<ContextPayload, "id" | "appId" | "capturedAt">;
type Visitor = NonNullable<WebChatInitOptions["visitor"]>;
type PanelTab = "chat" | "team";

const DEFAULT_SERVER_URL = "http://localhost:4000";

class WebChatClient {
  private options?: WebChatInitOptions;
  private api?: ApiClient;
  private socket?: Socket;
  private conversationId: string | null = null;
  private latestContext: ShareableContext | null = null;
  private els?: ReturnType<typeof createPanel>;
  private launcher?: ReturnType<typeof createLauncher>;
  private isOpen = false;
  private renderedContextIds = new Set<string>();
  private preChatFields: PreChatField[] = [];
  /** From GET /api/apps/widget-config — default true so nothing hides before the fetch resolves. */
  private widgetChatEnabled = true;
  private teamChatEnabled = true;
  private collectedVisitor: Visitor | null = null;
  private preChatFormShown = false;
  /** Tracks the previous rendered message's side, so consecutive messages from the same side collapse into one visual group (no repeated avatar). Reset to null by anything that breaks the visual sequence (context cards, system messages, a cleared thread). */
  private lastSupportAuthorType: MessageAuthorType | null = null;
  private unreadChatCount = 0;
  private unreadTeamCount = 0;

  // --- Team chat (staff-to-staff DMs/groups) — additive to, and entirely
  // separate state from, the support-conversation fields above. Only ever
  // active once identityToken resolves to a real PlatformUser; an
  // anonymous visitor never touches any of this. See index.ts's
  // handleTabChange/openTeamConversation for the small list<->thread
  // navigation this drives inside the one small panel.
  private teamUserId: string | null = null;
  private teamUsers: PlatformUser[] = [];
  private teamConversations: Conversation[] = [];
  private teamDataLoaded = false;
  private activeTeamConversationId: string | null = null;
  private activeTeamParticipants = new Map<string, PlatformUser>();
  /**
   * Dedupes the open team thread's messages between its history fetch and
   * live socket delivery — the same race the dashboard's ConversationView
   * had (a "message:new" event can arrive before the fetch it was
   * triggered alongside resolves), fixed there by id-based dedup; applying
   * the identical fix here rather than reintroducing that bug.
   */
  private renderedTeamMessageIds = new Set<string>();
  /** Same grouping purpose as `lastSupportAuthorType`, keyed by participant id since a team thread can have more than two sides. Reset whenever a thread is (re)opened. */
  private lastTeamAuthorId: string | null = null;
  private currentTab: PanelTab = "chat";
  /**
   * Resolves once we know whether a pre-chat form is needed (either the
   * widget-config fetch settled, or it was skipped because the visitor is
   * already identified). `needsPreChat()` reads `preChatFields`, which
   * this fetch populates asynchronously — anything that acts on
   * `needsPreChat()`'s answer (open(), ensureConversation()) must await
   * this first. Without it, a host page calling init() then immediately
   * open() (or a fast click) would race the fetch: preChatFields would
   * still be [], needsPreChat() would wrongly say "no", and
   * ensureConversation() would POST with no visitor at all — a 400 the
   * widget had no way to recover from or show the visitor.
   */
  private configReady: Promise<void> = Promise.resolve();

  init(options: WebChatInitOptions): void {
    if (this.options) {
      console.warn("[WebChat] init() called more than once — ignoring.");
      return;
    }
    this.options = options;
    const serverUrl = options.serverUrl ?? DEFAULT_SERVER_URL;
    this.api = new ApiClient(serverUrl, options.appId, options.identityToken);

    const hostEl = document.createElement("div");
    hostEl.id = "web-chat-widget-root";
    document.body.appendChild(hostEl);
    const shadow = hostEl.attachShadow({ mode: "open" });

    const styleEl = document.createElement("style");
    styleEl.textContent = buildStyles(options.accentColor ?? "#5850ec");
    shadow.appendChild(styleEl);

    const position = options.position ?? "bottom-right";
    this.launcher = createLauncher(() => this.toggle());
    this.launcher.root.style[position === "bottom-right" ? "right" : "left"] = "20px";
    shadow.appendChild(this.launcher.root);

    this.els = createPanel({
      position,
      onClose: () => this.toggle(),
      onSend: (text) => void this.handleComposerSend(text),
      onTabChange: (tab) => this.handleTabChange(tab),
    });
    shadow.appendChild(this.els.root);

    this.restoreConversation();
    this.restoreCollectedVisitor();
    this.connectSocketIfNeeded(serverUrl);

    // Always fetched (not just for anonymous visitors, unlike before adding
    // deployment-mode flags) — needed to decide whether the launcher/panel
    // should even be usable for this app. Doesn't block panel paint (that
    // already happened above) — pre-chat's own gating still only applies to
    // unverified/no-visitor visitors, per needsPreChat().
    this.configReady = this.api
      .getWidgetConfig()
      .then((config) => {
        this.preChatFields = config.preChatFields;
        this.widgetChatEnabled = config.widgetChatEnabled;
        this.teamChatEnabled = config.teamChatEnabled;
        this.applyModeGating();
      })
      .catch(() => {
        // Non-critical: worst case, defaults (everything on) stand.
      });

    // Team chat only ever surfaces for a resolved identity — an anonymous
    // visitor's panel looks and behaves exactly as before, zero added
    // footprint. Resolution happens once, same reasoning as the
    // dashboard's admin identity (tokens are short-lived by design, the
    // widget session isn't).
    if (options.identityToken) {
      void this.api.resolveIdentity().then((user) => {
        if (!user) return;
        this.teamUserId = user.id;
        this.socket?.emit("join:user", user.id);
        this.applyModeGating();
      });
    }
  }

  /**
   * Reconciles the launcher/tabs against the two async, order-independent
   * inputs that decide them: the app's widgetChatEnabled/teamChatEnabled
   * flags (widget-config fetch) and whether this visitor's identity
   * resolved to a team member (resolveIdentity). Safe to call from either
   * once both may or may not have landed yet.
   *
   * Known simplification: if widgetChatEnabled is false but team chat *is*
   * available, this shows the launcher with both tabs rather than hiding
   * just the support tab — an app that wants "team chat only, on a
   * customer-facing page" isn't a real deployment shape today.
   */
  private applyModeGating(): void {
    if (!this.els || !this.launcher) return;
    const teamAvailable = this.teamChatEnabled && !!this.teamUserId;
    if (teamAvailable) this.els.tabs.classList.remove("wc-hidden");
    else this.els.tabs.classList.add("wc-hidden");

    if (!this.widgetChatEnabled && !teamAvailable) {
      this.launcher.root.classList.add("wc-hidden");
    } else {
      this.launcher.root.classList.remove("wc-hidden");
    }
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
      pageSnapshot: ctx.pageSnapshot ?? capturePageSnapshot(),
      postAsMessage: true,
    } as ShareableContext & { postAsMessage: boolean });
    if (message && this.els) {
      this.renderedContextIds.add(context.id);
      renderContextCard(this.els.messages, context);
      this.lastSupportAuthorType = null;
    }
  }

  /** Recomputes the launcher's total unread badge and each tab's unread dot from the two counters. */
  private updateBadges(): void {
    this.launcher?.setUnread(this.unreadChatCount + this.unreadTeamCount);
    this.els?.setTabUnread("chat", this.unreadChatCount > 0 && this.currentTab !== "chat");
    this.els?.setTabUnread("team", this.unreadTeamCount > 0 && this.currentTab !== "team");
  }

  /** Called whenever `tab` becomes the one the visitor is actually looking at. */
  private markTabSeen(tab: PanelTab): void {
    if (tab === "chat") this.unreadChatCount = 0;
    else this.unreadTeamCount = 0;
    this.updateBadges();
  }

  /** Renders a support-thread text/file message, tracking side-grouping for avatar suppression. */
  private renderSupportMessage(message: Message): void {
    if (!this.els) return;
    const continued = message.authorType === this.lastSupportAuthorType;
    if (message.type === "file") {
      renderFileMessage(this.els.messages, message, continued, (id) => this.downloadAttachment(id));
    } else {
      renderTextMessage(this.els.messages, message, continued);
    }
    this.lastSupportAuthorType = message.authorType;
  }

  /** Renders a team-thread text/file message, tracking sender-grouping for avatar suppression. */
  private renderTeamMsg(message: Message, mine: boolean): void {
    if (!this.els) return;
    const continued = message.authorId === this.lastTeamAuthorId;
    const senderName = mine ? undefined : this.teamParticipantName(message.authorId);
    if (message.type === "file") {
      renderTeamFileMessage(this.els.teamMessages, message, mine, senderName, continued, (id) =>
        this.downloadAttachment(id),
      );
    } else {
      renderTeamMessage(this.els.teamMessages, message, mine, senderName, continued);
    }
    this.lastTeamAuthorId = message.authorId;
  }

  private downloadAttachment(messageId: string): void {
    if (!this.api) return;
    void this.api.fetchAttachment(messageId).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  open(): void {
    if (!this.els || !this.launcher) return;
    // Panel chrome shows immediately — only the pre-chat-vs-conversation
    // decision below waits on configReady, so opening never feels delayed
    // even on a slow network.
    this.els.root.classList.remove("wc-hidden");
    this.isOpen = true;
    this.markTabSeen(this.currentTab);
    void this.openInternal();
  }

  private async openInternal(): Promise<void> {
    await this.configReady;
    if (this.needsPreChat()) {
      this.showPreChatForm();
      return;
    }
    await this.ensureConversation();
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

  private leadStorageKey(): string {
    return `web-chat:${this.options?.appId}:leadVisitor`;
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

  private restoreCollectedVisitor(): void {
    try {
      const saved = localStorage.getItem(this.leadStorageKey());
      if (saved) this.collectedVisitor = JSON.parse(saved);
    } catch {
      /* ignore */
    }
  }

  /** The identity this widget instance will send with the next conversation-create call, if any. */
  private resolvedVisitor(): Visitor | undefined {
    return this.options?.visitor ?? this.collectedVisitor ?? undefined;
  }

  /**
   * True when we have neither a verified identity token nor any client-
   * supplied/previously-collected visitor id, but the app *has* configured
   * a pre-chat form — i.e. an anonymous visitor (e.g. a public landing
   * page) who needs to be asked for at least a name/email before their
   * first message goes anywhere.
   */
  private needsPreChat(): boolean {
    if (this.options?.identityToken) return false;
    if (this.resolvedVisitor()?.id) return false;
    return this.preChatFields.length > 0 && !this.preChatFormShown;
  }

  private showPreChatForm(): void {
    if (!this.els) return;
    this.preChatFormShown = true;
    this.els.composer.classList.add("wc-hidden");
    renderPreChatForm(this.els.messages, this.preChatFields, (values) => {
      // Only "name"/"email" map onto visitor identity today — matches the
      // Conversation.visitorName/visitorEmail columns 1:1. Other field
      // keys are collected in the form but not currently persisted beyond
      // it; extend Conversation if that's needed.
      const id = `lead_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      this.collectedVisitor = { id, name: values.name, email: values.email };
      try {
        localStorage.setItem(this.leadStorageKey(), JSON.stringify(this.collectedVisitor));
      } catch {
        /* ignore */
      }
      this.els!.messages.innerHTML = "";
      this.lastSupportAuthorType = null;
      this.els!.composer.classList.remove("wc-hidden");
      void this.ensureConversation();
    });
  }

  private async ensureConversation(): Promise<void> {
    if (this.conversationId || !this.api || !this.options) return;
    // Always wait for the pre-chat-fields fetch to settle before deciding
    // — see the configReady doc comment for why skipping this races the
    // fetch and can POST a conversation with no visitor at all.
    await this.configReady;
    if (this.needsPreChat()) return; // caller must resolve the form first
    const initialContext = this.latestContext
      ? { ...this.latestContext, pageSnapshot: this.latestContext.pageSnapshot ?? capturePageSnapshot() }
      : undefined;
    const { conversation, context } = await this.api.createConversation({
      visitor: this.resolvedVisitor(),
      initialContext,
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
      this.lastSupportAuthorType = null;
    }
    this.socket?.emit("join:conversation", this.conversationId);
  }

  /** Composer is shared between the support thread and an open team thread — routes based on the active tab. */
  private async handleComposerSend(text: string): Promise<void> {
    if (this.currentTab === "team" && this.activeTeamConversationId) {
      await this.sendTeamMessage(text);
    } else {
      await this.sendMessage(text);
    }
  }

  private async sendMessage(text: string): Promise<void> {
    await this.ensureConversation();
    if (!this.conversationId || !this.api || !this.els) return;
    const message = await this.api.postMessage(this.conversationId, text);
    this.renderSupportMessage(message);
  }

  private connectSocketIfNeeded(serverUrl: string): void {
    this.socket = io(serverUrl, { transports: ["websocket", "polling"] });
    this.socket.on("connect", () => {
      if (this.conversationId) this.socket?.emit("join:conversation", this.conversationId);
      if (this.teamUserId) this.socket?.emit("join:user", this.teamUserId);
      if (this.activeTeamConversationId) this.socket?.emit("join:conversation", this.activeTeamConversationId);
    });
    this.socket.on("message:new", (payload: { message: Message; context?: ContextPayload }) => {
      if (!this.els) return;
      const { message, context } = payload;

      if (message.conversationId === this.conversationId) {
        // Support thread — unchanged from before team chat existed.
        if (message.authorType === "visitor") return; // already rendered optimistically
        if (this.currentTab !== "chat") {
          this.unreadChatCount++;
          this.updateBadges();
          return;
        }
        if (message.type === "context_card" && context) {
          if (this.renderedContextIds.has(context.id)) return;
          this.renderedContextIds.add(context.id);
          renderContextCard(this.els.messages, context);
          this.lastSupportAuthorType = null;
        } else if (message.type === "system") {
          renderSystemMessage(this.els.messages, message.body ?? "");
          this.lastSupportAuthorType = null;
        } else {
          this.renderSupportMessage(message);
        }
        if (!this.isOpen) {
          this.unreadChatCount++;
          this.updateBadges();
        }
        return;
      }

      if (message.conversationId === this.activeTeamConversationId) {
        // Dedupe by id, not authorId === teamUserId: the history fetch
        // (loadTeamThread) and this live event can race for *anyone's*
        // message, not just mine — see renderedTeamMessageIds' doc comment.
        if (this.renderedTeamMessageIds.has(message.id)) return;
        this.renderedTeamMessageIds.add(message.id);
        if (this.currentTab !== "team") {
          this.unreadTeamCount++;
          this.updateBadges();
          return;
        }
        const mine = message.authorId === this.teamUserId;
        this.renderTeamMsg(message, mine);
        if (!this.isOpen) {
          this.unreadTeamCount++;
          this.updateBadges();
        }
      }
      // Else: a message for some other team conversation not currently
      // open — v1 doesn't update its list-row preview; opening the Team
      // tab re-fetches the list anyway.
    });
    this.socket.on("team-conversation:new", (conversation: Conversation) => {
      this.teamConversations = [conversation, ...this.teamConversations.filter((c) => c.id !== conversation.id)];
      if (this.currentTab === "team" && !this.activeTeamConversationId) this.renderTeamListView();
    });
  }

  // --- Team chat -----------------------------------------------------------

  private teamParticipantName(userId: string): string {
    const p = this.activeTeamParticipants.get(userId);
    return p?.name ?? p?.externalId ?? userId;
  }

  private handleTabChange(tab: PanelTab): void {
    if (!this.els) return;
    this.currentTab = tab;
    this.els.setActiveTab(tab);
    this.els.messages.classList.toggle("wc-hidden", tab !== "chat");
    this.els.teamList.classList.toggle("wc-hidden", tab !== "team" || !!this.activeTeamConversationId);
    this.els.teamMessages.classList.toggle("wc-hidden", !(tab === "team" && this.activeTeamConversationId));
    this.els.composer.classList.toggle("wc-hidden", tab === "team" && !this.activeTeamConversationId);
    this.markTabSeen(tab);

    if (tab === "chat") {
      this.activeTeamConversationId = null;
      return;
    }
    if (!this.activeTeamConversationId) {
      void this.ensureTeamDataLoaded().then(() => this.renderTeamListView());
    }
  }

  private async ensureTeamDataLoaded(): Promise<void> {
    if (this.teamDataLoaded || !this.api) return;
    this.teamDataLoaded = true;
    const [users, conversations] = await Promise.all([
      this.api.listTeamUsers().catch(() => []),
      this.api.listTeamConversations().catch(() => []),
    ]);
    this.teamUsers = users;
    this.teamConversations = conversations;
  }

  private renderTeamListView(): void {
    if (!this.els || !this.teamUserId) return;
    this.activeTeamConversationId = null;
    this.els.teamList.classList.remove("wc-hidden");
    this.els.teamMessages.classList.add("wc-hidden");
    this.els.composer.classList.add("wc-hidden");
    renderTeamConversationList(
      this.els.teamList,
      this.teamConversations.map((c) => ({
        id: c.id,
        label: teamConversationLabel(c, this.teamUserId!),
        isGroup: (c.participants ?? []).length > 2,
      })),
      (id) => this.openTeamConversation(id),
      () => this.showTeamPicker(),
    );
  }

  private showTeamPicker(): void {
    if (!this.els || !this.teamUserId) return;
    renderTeamPicker(
      this.els.teamList,
      this.teamUsers.filter((u) => u.id !== this.teamUserId),
      (userIds, title) => void this.startTeamConversation(userIds, title),
      () => this.renderTeamListView(),
    );
  }

  private async startTeamConversation(userIds: string[], title?: string): Promise<void> {
    if (!this.api) return;
    try {
      const conversation = await this.api.createTeamConversation(userIds, title);
      this.teamConversations = [conversation, ...this.teamConversations.filter((c) => c.id !== conversation.id)];
      this.openTeamConversation(conversation.id);
    } catch {
      // Minimal v1: fall back to the list rather than surfacing an inline
      // error UI for what's usually a stale-identity-token edge case.
      this.renderTeamListView();
    }
  }

  private openTeamConversation(id: string): void {
    if (!this.els) return;
    this.activeTeamConversationId = id;
    this.renderedTeamMessageIds.clear();
    this.lastTeamAuthorId = null;
    this.els.teamList.classList.add("wc-hidden");
    this.els.teamMessages.classList.remove("wc-hidden");
    this.els.composer.classList.remove("wc-hidden");
    this.els.teamMessages.innerHTML = "";
    this.socket?.emit("join:conversation", id);
    void this.loadTeamThread(id);
  }

  private async loadTeamThread(id: string): Promise<void> {
    if (!this.api || !this.els || !this.teamUserId) return;
    const data = await this.api.getConversation(id);
    this.activeTeamParticipants = new Map((data.conversation.participants ?? []).map((p) => [p.id, p]));

    renderTeamThreadHeader(this.els.teamMessages, teamConversationLabel(data.conversation, this.teamUserId), () =>
      this.renderTeamListView(),
    );
    for (const m of data.messages) {
      if (m.type !== "text") continue; // context cards/system messages aren't part of team chat v1
      if (this.renderedTeamMessageIds.has(m.id)) continue; // already delivered live while this fetch was in flight
      this.renderedTeamMessageIds.add(m.id);
      const mine = m.authorId === this.teamUserId;
      this.renderTeamMsg(m, mine);
    }
  }

  private async sendTeamMessage(text: string): Promise<void> {
    if (!this.api || !this.els || !this.activeTeamConversationId) return;
    const message = await this.api.sendTeamMessage(this.activeTeamConversationId, text);
    if (this.renderedTeamMessageIds.has(message.id)) return; // the socket echo may have already rendered it
    this.renderedTeamMessageIds.add(message.id);
    this.renderTeamMsg(message, true);
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
