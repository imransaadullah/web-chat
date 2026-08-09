import type { PageSnapshot, SnapshotNode, SnapshotStyle } from "@web-chat/shared";
import { MAX_SNAPSHOT_NODES, MAX_SNAPSHOT_TEXT_LENGTH } from "@web-chat/shared";

/**
 * Captures a sanitized structural snapshot of the host page's DOM — not a
 * screenshot, not raw HTML. See the doc comment on `PageSnapshot` in
 * @web-chat/shared for why: this never hands the receiving end a string of
 * HTML to render, so there's no way for it to trigger a network request or
 * execute anything. It's read-only, best-effort, and safe to fail silently.
 */

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "canvas",
  "svg",
  "link",
  "meta",
  "head",
  "template",
  "object",
  "embed",
]);

const VALUE_TAGS = new Set(["input", "textarea", "select"]);

const STYLE_PROPS: (keyof SnapshotStyle)[] = [
  "display",
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textAlign",
  "textDecoration",
  "lineHeight",
  "padding",
  "border",
  "borderRadius",
  "flexDirection",
  "justifyContent",
  "alignItems",
  "gap",
  "opacity",
];

function readValue(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) {
    if (el.type === "password") return "••••••••";
    return el.value || el.placeholder || undefined;
  }
  if (el instanceof HTMLTextAreaElement) return el.value || undefined;
  if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.text;
  return undefined;
}

function readStyle(el: Element): SnapshotStyle | undefined {
  const computed = getComputedStyle(el);
  const style: SnapshotStyle = {};
  for (const prop of STYLE_PROPS) {
    // computed style values are browser-normalized tokens (e.g. "16px",
    // "rgb(1,2,3)") — never raw attacker-controlled CSS text, so there's no
    // url(...)/expression(...) surface here even without extra sanitizing.
    const value = computed[prop];
    if (value) style[prop] = value;
  }
  return Object.keys(style).length ? style : undefined;
}

interface WalkState {
  count: number;
  truncated: boolean;
}

function walk(el: Element, state: WalkState): SnapshotNode | undefined {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return undefined;
  if (el.id === "web-chat-widget-root") return undefined;
  if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return undefined;

  const computed = getComputedStyle(el);
  if (computed.display === "none" || computed.visibility === "hidden") return undefined;

  if (state.count >= MAX_SNAPSHOT_NODES) {
    state.truncated = true;
    return undefined;
  }
  state.count++;

  const node: SnapshotNode = { tag, style: readStyle(el) };

  if (VALUE_TAGS.has(tag)) {
    const value = readValue(el);
    if (value) node.text = value.slice(0, MAX_SNAPSHOT_TEXT_LENGTH);
    return node;
  }

  if (tag === "img") {
    const alt = el.getAttribute("alt");
    if (alt) node.text = alt.slice(0, MAX_SNAPSHOT_TEXT_LENGTH);
    return node;
  }

  const children: SnapshotNode[] = [];
  let directText = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      directText += child.textContent ?? "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childNode = walk(child as Element, state);
      if (childNode) children.push(childNode);
      if (state.truncated) break;
    }
  }
  const trimmed = directText.trim();
  if (trimmed) node.text = trimmed.slice(0, MAX_SNAPSHOT_TEXT_LENGTH);
  if (children.length) node.children = children;

  return node;
}

export function capturePageSnapshot(options?: { selector?: string }): PageSnapshot | undefined {
  if (typeof document === "undefined") return undefined;
  const root = options?.selector ? document.querySelector(options.selector) : document.body;
  if (!root) return undefined;

  const state: WalkState = { count: 0, truncated: false };
  const tree = walk(root, state);
  if (!tree) return undefined;

  return {
    capturedAt: new Date().toISOString(),
    truncated: state.truncated,
    nodeCount: state.count,
    tree,
  };
}
