import type { Conversation } from "@web-chat/shared";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  pending: "Pending",
  ticket: "Ticket",
  closed: "Closed",
};

export function Inbox(params: {
  conversations: Conversation[];
  selectedId: string | null;
  filter: string;
  onFilterChange: (f: string) => void;
  onSelect: (id: string) => void;
}) {
  const { conversations, selectedId, filter, onFilterChange, onSelect } = params;

  return (
    <div className="inbox">
      <div className="inbox-header">
        <h2>Inbox</h2>
        <select value={filter} onChange={(e) => onFilterChange(e.target.value)}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="ticket">Tickets</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div className="inbox-list">
        {conversations.length === 0 && <div className="empty">No conversations yet.</div>}
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`inbox-row ${c.id === selectedId ? "active" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <div className="inbox-row-top">
              <span className="visitor-name">{c.visitorName || c.visitorId}</span>
              <span className={`status-pill status-${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
            </div>
            <div className="inbox-row-time">{new Date(c.updatedAt).toLocaleString()}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
