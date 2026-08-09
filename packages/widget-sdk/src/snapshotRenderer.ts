import type { SnapshotNode, SnapshotStyle } from "@web-chat/shared";
import {
  MAX_SNAPSHOT_RENDER_DEPTH,
  SNAPSHOT_FORM_TAGS,
  SNAPSHOT_NO_TEXT_TAGS,
  SNAPSHOT_TAG_MAP,
} from "@web-chat/shared";

/**
 * Vanilla-DOM counterpart to the dashboard's React SnapshotRenderer — same
 * allowlist rules (shared via @web-chat/shared), same guarantees: built
 * entirely with `createElement`/`textContent`, never `innerHTML`, no
 * network fetch, no <iframe>. Either side of a conversation can be the one
 * rendering a shared PageSnapshot, so this has to carry the same safety
 * properties as the dashboard's renderer, not a looser vanilla-JS version
 * of them.
 */

function applyStyle(el: HTMLElement, style?: SnapshotStyle): void {
  if (!style) return;
  // Property-by-property CSSOM assignment (not a raw cssText string), so
  // there's no attribute-string injection surface even if a value were
  // attacker-controlled.
  for (const [prop, value] of Object.entries(style)) {
    if (value) (el.style as unknown as Record<string, string>)[prop] = value;
  }
}

export function renderSnapshotNode(node: SnapshotNode, depth = 0): HTMLElement {
  if (depth > MAX_SNAPSHOT_RENDER_DEPTH) {
    const truncated = document.createElement("span");
    truncated.className = "wc-snap-truncated";
    truncated.textContent = "[snapshot too deeply nested]";
    return truncated;
  }

  const tag = SNAPSHOT_TAG_MAP[node.tag] ?? "span";

  if (node.tag === "img") {
    const el = document.createElement("span");
    el.className = "wc-snap-img-placeholder";
    el.textContent = `[image${node.text ? `: ${node.text}` : ""}]`;
    applyStyle(el, node.style);
    return el;
  }

  if (SNAPSHOT_FORM_TAGS.has(node.tag)) {
    const el = document.createElement("span");
    el.className = "wc-snap-field";
    el.textContent = node.text ?? "";
    applyStyle(el, node.style);
    return el;
  }

  const el = document.createElement(tag);
  applyStyle(el, node.style);
  if (!SNAPSHOT_NO_TEXT_TAGS.has(node.tag) && node.text) {
    el.appendChild(document.createTextNode(node.text));
  }
  for (const child of node.children ?? []) {
    el.appendChild(renderSnapshotNode(child, depth + 1));
  }
  return el;
}
