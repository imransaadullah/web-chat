import { useState } from "react";
import type { TicketWithConversation } from "@web-chat/shared";
import { DashboardApi } from "../api";
import { Avatar } from "./Avatar";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

export function Tickets({
  api,
  tickets,
  selectedId,
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  onSelect,
  onCreated,
}: {
  api: DashboardApi;
  tickets: TicketWithConversation[];
  selectedId: string | null;
  status: string;
  onStatusChange: (s: string) => void;
  priority: string;
  onPriorityChange: (p: string) => void;
  onSelect: (conversationId: string) => void;
  onCreated: (ticket: TicketWithConversation) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createTicket() {
    if (!name.trim() && !email.trim()) {
      setError("Enter a name or email for who this ticket is for.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const ticket = await api.createTicket({
        visitorName: name || undefined,
        visitorEmail: email || undefined,
        title: title || undefined,
        description: description || undefined,
        priority: newPriority,
      });
      onCreated(ticket);
      onSelect(ticket.conversation.id);
      setShowNew(false);
      setName("");
      setEmail("");
      setTitle("");
      setDescription("");
      setNewPriority("normal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="inbox">
      <div className="inbox-header">
        <h2>Tickets</h2>
        <button className="primary small" onClick={() => setShowNew((v) => !v)}>
          {showNew ? "Cancel" : "New ticket"}
        </button>
      </div>
      <div className="inbox-header">
        <select value={status} onChange={(e) => onStatusChange(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select value={priority} onChange={(e) => onPriorityChange(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      {showNew && (
        <div className="new-ticket-form">
          <input placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Customer email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            placeholder="What's the issue? (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
            <option value="low">Low priority</option>
            <option value="normal">Normal priority</option>
            <option value="high">High priority</option>
            <option value="urgent">Urgent priority</option>
          </select>
          {error && <div className="form-error">{error}</div>}
          <button className="primary" disabled={creating} onClick={() => void createTicket()}>
            {creating ? "Creating…" : "Create ticket"}
          </button>
        </div>
      )}

      <div className="inbox-list">
        {tickets.length === 0 && <div className="empty">No tickets yet.</div>}
        {tickets.map((t) => (
          <button
            key={t.id}
            className={`inbox-row ${t.conversation.id === selectedId ? "active" : ""}`}
            onClick={() => onSelect(t.conversation.id)}
          >
            <Avatar name={t.conversation.visitorName || t.conversation.visitorId || "?"} seed={t.conversation.id} />
            <div className="inbox-row-body">
              <div className="inbox-row-top">
                <span className="visitor-name">{t.title}</span>
                <span className={`status-pill status-${t.status}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
              </div>
              <div className="inbox-row-top">
                <span className={`priority-pill priority-${t.priority}`}>{t.priority}</span>
                <span className="muted small">{t.conversation.visitorName || t.conversation.visitorEmail}</span>
              </div>
              <div className="inbox-row-time">{new Date(t.updatedAt).toLocaleString()}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
