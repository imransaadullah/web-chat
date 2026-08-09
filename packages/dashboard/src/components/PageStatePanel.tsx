import type { ContextPayload } from "@web-chat/shared";
import { SnapshotRenderer } from "./SnapshotRenderer";

export function PageStatePanel({ context }: { context: ContextPayload | null }) {
  if (!context?.pageSnapshot) {
    return (
      <div className="page-state-panel empty">
        <div className="page-state-header">Page state</div>
        <div className="muted small" style={{ padding: 16 }}>
          No page snapshot shared yet.
        </div>
      </div>
    );
  }

  const { pageSnapshot } = context;

  return (
    <div className="page-state-panel">
      <div className="page-state-header">
        <div>
          <div className="page-state-title">{context.title}</div>
          <div className="muted small">
            Reconstructed from a DOM snapshot — not live, not a screenshot.
          </div>
        </div>
      </div>
      <div className="page-state-frame">
        <SnapshotRenderer node={pageSnapshot.tree} />
      </div>
      {pageSnapshot.truncated && (
        <div className="page-state-footer muted small">
          Truncated at {pageSnapshot.nodeCount} elements.
        </div>
      )}
    </div>
  );
}
