import { createElement, type CSSProperties } from "react";
import type { SnapshotNode, SnapshotStyle } from "@web-chat/shared";
import {
  MAX_SNAPSHOT_RENDER_DEPTH,
  SNAPSHOT_FORM_TAGS,
  SNAPSHOT_NO_TEXT_TAGS,
  SNAPSHOT_TAG_MAP,
} from "@web-chat/shared";

/**
 * Renders a captured PageSnapshot tree as real React elements — never
 * `innerHTML`, never `dangerouslySetInnerHTML`, no <iframe>. There is
 * nothing here that can issue a network request or run script. Tag
 * mapping/allowlist rules live in @web-chat/shared (SNAPSHOT_TAG_MAP etc.)
 * so this stays in lockstep with the widget-sdk's own vanilla-DOM renderer
 * — either side of a conversation can be the one rendering a snapshot.
 */

function styleFor(s?: SnapshotStyle): CSSProperties | undefined {
  if (!s) return undefined;
  // Passed through as-is: values originate from getComputedStyle() on the
  // capturing side, i.e. already-normalized tokens like "16px" or
  // "rgb(1,2,3)" — never a raw string an attacker could put url(...) in.
  return s as CSSProperties;
}

export function SnapshotRenderer({ node, depth = 0 }: { node: SnapshotNode; depth?: number }): React.ReactElement {
  if (depth > MAX_SNAPSHOT_RENDER_DEPTH) {
    return <span className="snap-truncated">[snapshot too deeply nested]</span>;
  }

  // Default fallback is <span>, not <div>: span is valid "phrasing content"
  // almost anywhere (including inside <p>), so an unmapped/form-control tag
  // never produces invalid nesting. Visual layout still comes entirely from
  // the explicit `display` in the captured style, not the tag itself.
  const tag = SNAPSHOT_TAG_MAP[node.tag] ?? "span";
  const isImg = node.tag === "img";
  const isFormControl = SNAPSHOT_FORM_TAGS.has(node.tag);

  const children = (node.children ?? []).map((child, i) => (
    <SnapshotRenderer key={i} node={child} depth={depth + 1} />
  ));

  if (isImg) {
    return (
      <span className="snap-img-placeholder" style={styleFor(node.style)}>
        [image{node.text ? `: ${node.text}` : ""}]
      </span>
    );
  }

  if (isFormControl) {
    return (
      <span className="snap-field" style={styleFor(node.style)}>
        {node.text ?? ""}
      </span>
    );
  }

  return createElement(
    tag,
    { style: styleFor(node.style) },
    !SNAPSHOT_NO_TEXT_TAGS.has(node.tag) ? node.text : undefined,
    ...children,
  );
}
