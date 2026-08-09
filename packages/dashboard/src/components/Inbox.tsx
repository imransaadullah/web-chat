import type { Conversation, ResponderGroup } from "@web-chat/shared";
import { Avatar } from "./Avatar";

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
  groups: ResponderGroup[];
  groupFilter: string;
  onGroupFilterChange: (g: string) => void;
  onSelect: (id: string) => void;
}) {
  const { conversations, selectedId, filter, onFilterChange, groups, groupFilter, onGroupFilterChange, onSelect } =
    params;

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
      {groups.length > 0 && (
        <div className="inbox-header">
          <select value={groupFilter} onChange={(e) => onGroupFilterChange(e.target.value)}>
            <option value="">All queues</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="inbox-list">
        {conversations.length === 0 && <div className="empty">No conversations yet.</div>}
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`inbox-row ${c.id === selectedId ? "active" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <Avatar name={c.visitorName || c.visitorId || "?"} seed={c.id} />
            <div className="inbox-row-body">
              <div className="inbox-row-top">
                <span className="visitor-name">{c.visitorName || c.visitorId}</span>
                <span className={`status-pill status-${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
              </div>
              <div className="inbox-row-top">
                {c.verifiedUser?.role && <span className="role-badge">{c.verifiedUser.role}</span>}
                {c.verifiedUser && <span className="verified-badge">✓ verified</span>}
              </div>
              <div className="inbox-row-time">{new Date(c.updatedAt).toLocaleString()}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
