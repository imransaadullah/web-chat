import { useState } from "react";
import type { Conversation, PlatformUser } from "@web-chat/shared";
import { Avatar } from "./Avatar";

function displayName(conversation: Conversation, currentUserId: string): string {
  if (conversation.title) return conversation.title;
  const others = (conversation.participants ?? []).filter((p) => p.id !== currentUserId);
  if (others.length === 0) return "(just you)";
  return others.map((p) => p.name ?? p.externalId).join(", ");
}

export function TeamInbox({
  conversations,
  selectedId,
  onSelect,
  users,
  currentUserId,
  onCreateConversation,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  users: PlatformUser[];
  currentUserId: string | null;
  onCreateConversation: (participantIds: string[], title?: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");

  const pickableUsers = users.filter((u) => u.id !== currentUserId);

  function toggleUser(id: string) {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function startConversation() {
    if (selectedUserIds.length === 0) return;
    onCreateConversation(selectedUserIds, selectedUserIds.length > 1 ? groupTitle || undefined : undefined);
    setPicking(false);
    setSelectedUserIds([]);
    setGroupTitle("");
  }

  return (
    <div className="inbox">
      <div className="inbox-header">
        <h2>Team</h2>
        <button className="secondary" onClick={() => setPicking((p) => !p)}>
          {picking ? "Cancel" : "+ New"}
        </button>
      </div>

      {picking && (
        <div className="team-picker">
          <p className="muted small">Pick one person for a DM, or several to start a group.</p>
          <div className="team-picker-list">
            {pickableUsers.length === 0 && <div className="empty">No other verified users yet.</div>}
            {pickableUsers.map((u) => (
              <label key={u.id} className="team-picker-row">
                <input type="checkbox" checked={selectedUserIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                <Avatar name={u.name ?? u.externalId} seed={u.id} size={22} />
                <span>{u.name ?? u.externalId}</span>
                {u.role && <span className="role-badge">{u.role}</span>}
              </label>
            ))}
          </div>
          {selectedUserIds.length > 1 && (
            <input
              placeholder="Group name (optional)"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
            />
          )}
          <button className="primary" disabled={selectedUserIds.length === 0} onClick={startConversation}>
            Start
          </button>
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
            <Avatar name={displayName(c, currentUserId ?? "")} seed={c.id} />
            <div className="inbox-row-body">
              <div className="inbox-row-top">
                <span className="visitor-name">{displayName(c, currentUserId ?? "")}</span>
                {(c.participants?.length ?? 0) > 2 && <span className="role-badge">group</span>}
              </div>
              <div className="inbox-row-time">{new Date(c.updatedAt).toLocaleString()}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
