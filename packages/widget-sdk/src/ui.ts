import type { ContextPayload, Message } from "@web-chat/shared";

const CHAT_ICON = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
const CLOSE_ICON = "✕";

export function createLauncher(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "wc-launcher";
  btn.innerHTML = CHAT_ICON;
  btn.setAttribute("aria-label", "Open chat");
  btn.addEventListener("click", onClick);
  return btn;
}

export function createPanel(params: {
  position: "bottom-right" | "bottom-left";
  onClose: () => void;
  onSend: (text: string) => void;
}): {
  root: HTMLDivElement;
  messages: HTMLDivElement;
  input: HTMLInputElement;
  sendBtn: HTMLButtonElement;
} {
  const root = document.createElement("div");
  root.className = "wc-panel wc-hidden";
  root.style[params.position === "bottom-right" ? "right" : "left"] = "20px";

  const header = document.createElement("div");
  header.className = "wc-header";
  header.innerHTML = `<span>Chat with us</span>`;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = CLOSE_ICON;
  closeBtn.addEventListener("click", params.onClose);
  header.appendChild(closeBtn);

  const messages = document.createElement("div");
  messages.className = "wc-messages";

  const composer = document.createElement("div");
  composer.className = "wc-composer";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type a message…";
  const sendBtn = document.createElement("button");
  sendBtn.textContent = "Send";
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
  root.append(header, messages, composer);

  return { root, messages, input, sendBtn };
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

export function renderTextMessage(container: HTMLElement, message: Message): void {
  const el = document.createElement("div");
  el.className = `wc-msg ${message.authorType}`;
  el.textContent = message.body ?? "";
  container.appendChild(el);
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
    <div class="wc-ctx-kind">${escapeHtml(context.kind)}</div>
    <div class="wc-ctx-title">${escapeHtml(context.title)}</div>
    ${context.summary ? `<div class="wc-ctx-summary">${escapeHtml(context.summary)}</div>` : ""}
    ${rows ? `<table>${rows}</table>` : ""}
    ${context.url ? `<a href="${escapeHtml(context.url)}" target="_blank" rel="noopener">View this →</a>` : ""}
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}
