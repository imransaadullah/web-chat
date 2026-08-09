import type { Conversation, ContextPayload, Message, PlatformUser, PreChatField } from "@web-chat/shared";
import { renderSnapshotNode } from "./snapshotRenderer.js";

const CHAT_ICON = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const SEND_ICON = `<svg viewBox="0 0 24 24"><path d="M3.4 20.6 22 12 3.4 3.4l.02 6.4L16 12l-12.58 2.2z"/></svg>`;
const BACK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
const CHEVRON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
const PLUS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const AGENT_ICON = `<svg viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.8-3.6-5-8-5z"/></svg>`;
const DOC_ICON = `<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5z"/></svg>`;
const CONVO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** Short, deterministic initials for an avatar label, e.g. "Ben Ortiz" -> "BO". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Deterministic HSL background for a person's avatar, stable across renders/sessions for the same id. */
function avatarHue(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 55% 45%)`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function createLauncher(onClick: () => void): { root: HTMLButtonElement; setUnread: (count: number) => void } {
  const btn = document.createElement("button");
  btn.className = "wc-launcher";
  btn.innerHTML = CHAT_ICON;
  btn.setAttribute("aria-label", "Open chat");
  btn.addEventListener("click", onClick);

  const badge = document.createElement("span");
  badge.className = "wc-launcher-badge wc-hidden";
  btn.appendChild(badge);

  const setUnread = (count: number) => {
    if (count <= 0) {
      badge.classList.add("wc-hidden");
      return;
    }
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.classList.remove("wc-hidden");
  };

  return { root: btn, setUnread };
}

export function createPanel(params: {
  position: "bottom-right" | "bottom-left";
  onClose: () => void;
  onSend: (text: string) => void;
  onTabChange: (tab: "chat" | "team") => void;
}): {
  root: HTMLDivElement;
  messages: HTMLDivElement;
  input: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  composer: HTMLDivElement;
  tabs: HTMLDivElement;
  setActiveTab: (tab: "chat" | "team") => void;
  setTabUnread: (tab: "chat" | "team", unread: boolean) => void;
  teamList: HTMLDivElement;
  teamMessages: HTMLDivElement;
} {
  const root = document.createElement("div");
  root.className = "wc-panel wc-hidden";
  root.style[params.position === "bottom-right" ? "right" : "left"] = "20px";

  const header = document.createElement("div");
  header.className = "wc-header";

  const headerTop = document.createElement("div");
  headerTop.className = "wc-header-top";
  const headerText = document.createElement("div");
  headerText.className = "wc-header-text";
  headerText.innerHTML = `<div class="wc-header-title">Chat with us</div><div class="wc-header-subtitle">We typically reply in a few minutes</div>`;
  const closeBtn = document.createElement("button");
  closeBtn.className = "wc-header-close";
  closeBtn.innerHTML = CLOSE_ICON;
  closeBtn.setAttribute("aria-label", "Close chat");
  closeBtn.addEventListener("click", params.onClose);
  headerTop.append(headerText, closeBtn);
  header.appendChild(headerTop);

  // Hidden by default (wc-hidden) — only shown once a widget instance has
  // a resolved identity, since team chat needs one and anonymous visitors
  // are the overwhelmingly common case this must stay invisible for.
  const tabs = document.createElement("div");
  tabs.className = "wc-tabs wc-hidden";
  const chatTabBtn = document.createElement("button");
  chatTabBtn.type = "button";
  chatTabBtn.className = "wc-tab active";
  chatTabBtn.innerHTML = `Chat<span class="wc-tab-dot"></span>`;
  const teamTabBtn = document.createElement("button");
  teamTabBtn.type = "button";
  teamTabBtn.className = "wc-tab";
  teamTabBtn.innerHTML = `Team<span class="wc-tab-dot"></span>`;
  chatTabBtn.addEventListener("click", () => params.onTabChange("chat"));
  teamTabBtn.addEventListener("click", () => params.onTabChange("team"));
  tabs.append(chatTabBtn, teamTabBtn);
  header.appendChild(tabs);

  const setActiveTab = (tab: "chat" | "team") => {
    chatTabBtn.classList.toggle("active", tab === "chat");
    teamTabBtn.classList.toggle("active", tab === "team");
  };
  const setTabUnread = (tab: "chat" | "team", unread: boolean) => {
    (tab === "chat" ? chatTabBtn : teamTabBtn).classList.toggle("has-unread", unread);
  };

  const messages = document.createElement("div");
  messages.className = "wc-messages";

  // Separate containers (not reusing `messages`) for the team conversation
  // list/picker and the currently-open team thread, so switching tabs back
  // and forth never has to tear down and lose the support thread already
  // rendered in `messages`.
  const teamList = document.createElement("div");
  teamList.className = "wc-team-list wc-hidden";
  const teamMessages = document.createElement("div");
  teamMessages.className = "wc-messages wc-hidden";

  const composer = document.createElement("div");
  composer.className = "wc-composer";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type a message…";
  const sendBtn = document.createElement("button");
  sendBtn.className = "wc-composer-send";
  sendBtn.innerHTML = SEND_ICON;
  sendBtn.setAttribute("aria-label", "Send message");
  sendBtn.disabled = true;

  const trySend = () => {
    const text = input.value.trim();
    if (!text) return;
    params.onSend(text);
    input.value = "";
    sendBtn.disabled = true;
  };
  input.addEventListener("input", () => {
    sendBtn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") trySend();
  });
  sendBtn.addEventListener("click", trySend);

  composer.append(input, sendBtn);
  root.append(header, messages, teamList, teamMessages, composer);

  return { root, messages, input, sendBtn, composer, tabs, setActiveTab, setTabUnread, teamList, teamMessages };
}

/**
 * Renders a small lead-capture form for visitors with no known identity
 * (no identityToken, no host-supplied visitor.id) — asks for whatever
 * fields the app configured (Settings → pre-chat form) before the first
 * message is relayed. Plain form inputs, submitted via callback; nothing
 * here talks to the network directly.
 */
export function renderPreChatForm(
  container: HTMLElement,
  fields: PreChatField[],
  onSubmit: (values: Record<string, string>) => void,
): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "wc-prechat";

  const intro = document.createElement("div");
  intro.className = "wc-prechat-intro";
  intro.textContent = "Before we start, a couple of details so we can reach you:";
  wrap.appendChild(intro);

  const inputs: Record<string, HTMLInputElement> = {};
  for (const field of fields) {
    const label = document.createElement("label");
    label.textContent = field.label + (field.required ? " *" : "");
    const input = document.createElement("input");
    input.type = field.type === "email" ? "email" : "text";
    input.required = field.required;
    label.appendChild(input);
    wrap.appendChild(label);
    inputs[field.key] = input;
  }

  const error = document.createElement("div");
  error.className = "wc-prechat-error wc-hidden";
  error.textContent = "Please fill in the required fields.";
  wrap.appendChild(error);

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "wc-prechat-submit";
  submitBtn.textContent = "Start chat";
  submitBtn.addEventListener("click", () => {
    const values: Record<string, string> = {};
    for (const field of fields) {
      const value = inputs[field.key].value.trim();
      if (field.required && !value) {
        error.classList.remove("wc-hidden");
        return;
      }
      if (value) values[field.key] = value;
    }
    onSubmit(values);
  });
  wrap.appendChild(submitBtn);

  container.appendChild(wrap);
  return wrap;
}

/** Generic avatar for the support side — an "agent" identity beyond authorType isn't modeled, so this is intentionally impersonal. */
function agentAvatar(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "wc-avatar";
  el.innerHTML = AGENT_ICON;
  return el;
}

function personAvatar(label: string, seed: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "wc-avatar";
  el.style.background = avatarHue(seed);
  el.textContent = initials(label);
  return el;
}

/**
 * `continued` suppresses the avatar/sender-label repeat when the previous
 * message in the thread came from the same side — mirrors the
 * Slack/iMessage grouping convention instead of stamping an avatar on every
 * single bubble.
 */
export function renderTextMessage(container: HTMLElement, message: Message, continued = false): void {
  if (message.authorType === "system") {
    renderSystemMessage(container, message.body ?? "");
    return;
  }
  const mine = message.authorType === "visitor";
  const row = document.createElement("div");
  row.className = `wc-msg-row ${mine ? "mine" : "theirs"}`;

  if (!mine) {
    if (continued) {
      const spacer = document.createElement("div");
      spacer.className = "wc-avatar-spacer";
      row.appendChild(spacer);
    } else {
      row.appendChild(agentAvatar());
    }
  }

  const col = document.createElement("div");
  col.className = "wc-msg-col";
  const bubble = document.createElement("div");
  bubble.className = `wc-msg ${message.authorType}`;
  bubble.textContent = message.body ?? "";
  col.appendChild(bubble);
  const time = document.createElement("div");
  time.className = "wc-msg-time";
  time.textContent = formatTime(message.createdAt);
  col.appendChild(time);
  row.appendChild(col);

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** type:"file" messages — same grouping/bubble placement as renderTextMessage, a download button instead of text. */
export function renderFileMessage(
  container: HTMLElement,
  message: Message,
  continued: boolean,
  onDownload: (messageId: string) => void,
): void {
  const mine = message.authorType === "visitor";
  const row = document.createElement("div");
  row.className = `wc-msg-row ${mine ? "mine" : "theirs"}`;

  if (!mine) {
    if (continued) {
      const spacer = document.createElement("div");
      spacer.className = "wc-avatar-spacer";
      row.appendChild(spacer);
    } else {
      row.appendChild(agentAvatar());
    }
  }

  const col = document.createElement("div");
  col.className = "wc-msg-col";
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "wc-file-msg";
  bubble.innerHTML = `${DOC_ICON}<span class="wc-file-info"><span class="wc-file-name"></span><span class="wc-file-size"></span></span>`;
  bubble.querySelector<HTMLElement>(".wc-file-name")!.textContent = message.attachmentName ?? "file";
  bubble.querySelector<HTMLElement>(".wc-file-size")!.textContent = formatBytes(message.attachmentSize);
  bubble.addEventListener("click", () => onDownload(message.id));
  col.appendChild(bubble);
  const time = document.createElement("div");
  time.className = "wc-msg-time";
  time.textContent = formatTime(message.createdAt);
  col.appendChild(time);
  row.appendChild(col);

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

export function renderSystemMessage(container: HTMLElement, text: string): void {
  const el = document.createElement("div");
  el.className = "wc-msg system";
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

/**
 * Renders a ContextPayload as a compact, actionable card — this is the
 * whole point of the product, so it gets its own renderer instead of being
 * squeezed into the plain text bubble.
 */
export function renderContextCard(container: HTMLElement, context: ContextPayload): void {
  const el = document.createElement("div");
  el.className = "wc-context-card";

  const rows = (context.snapshot ?? [])
    .map((f) => `<tr><td>${escapeHtml(f.label)}</td><td>${escapeHtml(f.value)}</td></tr>`)
    .join("");

  el.innerHTML = `
    <div class="wc-ctx-head">
      <div class="wc-ctx-icon">${DOC_ICON}</div>
      <div class="wc-ctx-headtext">
        <div class="wc-ctx-kind">${escapeHtml(context.kind)}</div>
        <div class="wc-ctx-title">${escapeHtml(context.title)}</div>
      </div>
    </div>
    ${context.summary ? `<div class="wc-ctx-summary">${escapeHtml(context.summary)}</div>` : ""}
    ${rows ? `<table>${rows}</table>` : ""}
    ${context.url ? `<a href="${escapeHtml(context.url)}" target="_blank" rel="noopener">View this ${CHEVRON_ICON}</a>` : ""}
  `;

  if (context.pageSnapshot) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "wc-ctx-view-snapshot";
    toggle.textContent = "View page state ▾";

    const frame = document.createElement("div");
    frame.className = "wc-snapshot-frame wc-hidden";
    // Built lazily (only on first expand) via createElement/textContent —
    // never innerHTML — see snapshotRenderer.ts.
    let rendered = false;
    toggle.addEventListener("click", () => {
      const expanded = !frame.classList.contains("wc-hidden");
      if (!rendered) {
        frame.appendChild(renderSnapshotNode(context.pageSnapshot!.tree));
        rendered = true;
      }
      frame.classList.toggle("wc-hidden", expanded);
      toggle.textContent = expanded ? "View page state ▾" : "Hide page state ▴";
      container.scrollTop = container.scrollHeight;
    });

    el.appendChild(toggle);
    el.appendChild(frame);
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

/** Display label for a team conversation from `currentUserId`'s point of view — group title, or the other participant(s)' name(s) for a DM. */
export function teamConversationLabel(conversation: Conversation, currentUserId: string): string {
  if (conversation.title) return conversation.title;
  const others = (conversation.participants ?? []).filter((p) => p.id !== currentUserId);
  if (others.length === 0) return "(just you)";
  return others.map((p) => p.name ?? p.externalId).join(", ");
}

/** The compact list of a user's team DMs/groups, plus a "+ New" affordance — the widget's Team-tab home view. */
export function renderTeamConversationList(
  container: HTMLElement,
  conversations: { id: string; label: string; isGroup: boolean }[],
  onSelect: (id: string) => void,
  onStartNew: () => void,
): void {
  container.innerHTML = "";

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "wc-team-new";
  newBtn.innerHTML = `${PLUS_ICON}<span>New conversation</span>`;
  newBtn.addEventListener("click", onStartNew);
  container.appendChild(newBtn);

  if (conversations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "wc-team-empty";
    empty.innerHTML = `${CONVO_ICON}<span>No conversations yet.<br/>Start one with a teammate.</span>`;
    container.appendChild(empty);
    return;
  }

  for (const c of conversations) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "wc-team-row";
    row.appendChild(personAvatar(c.label, c.id));
    const label = document.createElement("span");
    label.className = "wc-team-row-label";
    label.textContent = c.label;
    row.appendChild(label);
    if (c.isGroup) {
      const badge = document.createElement("span");
      badge.className = "wc-team-row-badge";
      badge.textContent = "Group";
      row.appendChild(badge);
    }
    const chevron = document.createElement("span");
    chevron.className = "wc-team-chevron";
    chevron.innerHTML = CHEVRON_ICON;
    row.appendChild(chevron);
    row.addEventListener("click", () => onSelect(c.id));
    container.appendChild(row);
  }
}

/** Minimal inline picker for starting a new DM/group — one person for a DM, several for a group. */
export function renderTeamPicker(
  container: HTMLElement,
  users: PlatformUser[],
  onStart: (userIds: string[], title?: string) => void,
  onCancel: () => void,
): void {
  container.innerHTML = "";

  const intro = document.createElement("div");
  intro.className = "wc-prechat-intro";
  intro.textContent = "Pick one person for a DM, or several for a group.";
  container.appendChild(intro);

  if (users.length === 0) {
    const empty = document.createElement("div");
    empty.className = "wc-team-empty";
    empty.innerHTML = `${CONVO_ICON}<span>No other verified users yet.</span>`;
    container.appendChild(empty);
  }

  const checkboxes: Record<string, HTMLInputElement> = {};
  const titleInput = document.createElement("input");
  titleInput.placeholder = "Group name (optional)";
  titleInput.className = "wc-team-title-input wc-hidden";

  for (const u of users) {
    const label = document.createElement("label");
    label.className = "wc-team-picker-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.addEventListener("change", () => {
      const checkedCount = Object.values(checkboxes).filter((c) => c.checked).length;
      titleInput.classList.toggle("wc-hidden", checkedCount <= 1);
    });
    const name = u.name ?? u.externalId;
    const avatar = personAvatar(name, u.id);
    avatar.style.width = "22px";
    avatar.style.height = "22px";
    avatar.style.fontSize = "9px";
    label.append(cb, avatar, document.createTextNode(name));
    container.appendChild(label);
    checkboxes[u.id] = cb;
  }

  container.appendChild(titleInput);

  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "wc-prechat-submit";
  startBtn.textContent = "Start";
  startBtn.addEventListener("click", () => {
    const ids = Object.entries(checkboxes)
      .filter(([, cb]) => cb.checked)
      .map(([id]) => id);
    if (ids.length === 0) return;
    onStart(ids, titleInput.value.trim() || undefined);
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "wc-link-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", onCancel);

  container.append(startBtn, cancelBtn);
}

/** Header for an open team thread — back-to-list link plus the conversation's display name. */
export function renderTeamThreadHeader(container: HTMLElement, label: string, onBack: () => void): void {
  const head = document.createElement("div");
  head.className = "wc-team-thread-head";

  const back = document.createElement("button");
  back.type = "button";
  back.className = "wc-team-back";
  back.innerHTML = BACK_ICON;
  back.setAttribute("aria-label", "Back to conversations");
  back.addEventListener("click", onBack);

  const title = document.createElement("div");
  title.className = "wc-team-thread-title";
  title.textContent = label;

  head.append(back, title);
  container.appendChild(head);
}

/**
 * A team-thread message bubble, aligned relative to *who's viewing* rather
 * than a fixed visitor/agent side — reuses the existing wc-msg alignment
 * classes (visitor=right, agent=left) purely for their layout/color, not
 * their original visitor/agent meaning. `continued` suppresses the
 * avatar/sender label when the previous message was from the same sender.
 */
export function renderTeamMessage(
  container: HTMLElement,
  message: Message,
  isMine: boolean,
  senderName?: string,
  continued = false,
): void {
  const row = document.createElement("div");
  row.className = `wc-msg-row ${isMine ? "mine" : "theirs"}`;

  if (!isMine) {
    if (continued) {
      const spacer = document.createElement("div");
      spacer.className = "wc-avatar-spacer";
      row.appendChild(spacer);
    } else {
      row.appendChild(personAvatar(senderName ?? "?", message.authorId));
    }
  }

  const col = document.createElement("div");
  col.className = "wc-msg-col";
  if (!isMine && senderName && !continued) {
    const label = document.createElement("div");
    label.className = "wc-msg-sender";
    label.textContent = senderName;
    col.appendChild(label);
  }
  const bubble = document.createElement("div");
  bubble.className = `wc-msg ${isMine ? "visitor" : "agent"}`;
  bubble.textContent = message.body ?? "";
  col.appendChild(bubble);
  const time = document.createElement("div");
  time.className = "wc-msg-time";
  time.textContent = formatTime(message.createdAt);
  col.appendChild(time);
  row.appendChild(col);

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

/** Team-thread equivalent of renderFileMessage — same isMine/senderName shape as renderTeamMessage. */
export function renderTeamFileMessage(
  container: HTMLElement,
  message: Message,
  isMine: boolean,
  senderName: string | undefined,
  continued: boolean,
  onDownload: (messageId: string) => void,
): void {
  const row = document.createElement("div");
  row.className = `wc-msg-row ${isMine ? "mine" : "theirs"}`;

  if (!isMine) {
    if (continued) {
      const spacer = document.createElement("div");
      spacer.className = "wc-avatar-spacer";
      row.appendChild(spacer);
    } else {
      row.appendChild(personAvatar(senderName ?? "?", message.authorId));
    }
  }

  const col = document.createElement("div");
  col.className = "wc-msg-col";
  if (!isMine && senderName && !continued) {
    const label = document.createElement("div");
    label.className = "wc-msg-sender";
    label.textContent = senderName;
    col.appendChild(label);
  }
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "wc-file-msg";
  bubble.innerHTML = `${DOC_ICON}<span class="wc-file-info"><span class="wc-file-name"></span><span class="wc-file-size"></span></span>`;
  bubble.querySelector<HTMLElement>(".wc-file-name")!.textContent = message.attachmentName ?? "file";
  bubble.querySelector<HTMLElement>(".wc-file-size")!.textContent = formatBytes(message.attachmentSize);
  bubble.addEventListener("click", () => onDownload(message.id));
  col.appendChild(bubble);
  const time = document.createElement("div");
  time.className = "wc-msg-time";
  time.textContent = formatTime(message.createdAt);
  col.appendChild(time);
  row.appendChild(col);

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}
