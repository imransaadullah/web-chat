import { useEffect, useRef, useState } from "react";
import type { ContextPayload, Conversation, Message, PlatformUser, Ticket } from "@web-chat/shared";
import { DashboardApi } from "../api";
import { getSocket } from "../socket";
import { PageStatePanel } from "./PageStatePanel";
import { ShareModal } from "./ShareModal";
import { Avatar } from "./Avatar";
import { AttachmentBubble } from "./Attachment";
import { AttachButton } from "./AttachButton";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function ContextCard({
  context,
  authorType,
  isActiveSnapshot,
  onViewPageState,
}: {
  context: ContextPayload;
  authorType: Message["authorType"];
  isActiveSnapshot: boolean;
  onViewPageState: (id: string) => void;
}) {
  return (
    <div className={`context-card ${authorType}`}>
      <div className="ctx-kind">{context.kind}</div>
      <div className="ctx-title">{context.title}</div>
      {context.summary && <div className="ctx-summary">{context.summary}</div>}
      {context.snapshot && context.snapshot.length > 0 && (
        <table>
          <tbody>
            {context.snapshot.map((f, i) => (
              <tr key={i}>
                <td>{f.label}</td>
                <td>{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {context.data && (
        <details>
          <summary>Raw context data</summary>
          <pre>{JSON.stringify(context.data, null, 2)}</pre>
        </details>
      )}
      {context.pageSnapshot && (
        <button className="ctx-view-snapshot" onClick={() => onViewPageState(context.id)} disabled={isActiveSnapshot}>
          {isActiveSnapshot ? "Showing in Page state →" : "View in Page state →"}
        </button>
      )}
      {context.url && (
        <a href={context.url} target="_blank" rel="noopener noreferrer">
          Open exact state in product →
        </a>
      )}
    </div>
  );
}

export function ConversationView({
  api,
  conversationId,
  adminUser,
}: {
  api: DashboardApi;
  conversationId: string;
  adminUser: PlatformUser | null;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contexts, setContexts] = useState<Record<string, ContextPayload>>({});
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [pinnedSnapshotId, setPinnedSnapshotId] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Default to the most recently shared context that has a page snapshot;
  // an agent can pin an older one via "View in Page state" on any card.
  const latestSnapshotContextId = [...messages]
    .reverse()
    .map((m) => m.contextId)
    .find((id): id is string => !!id && !!contexts[id]?.pageSnapshot);
  const activeSnapshotId = pinnedSnapshotId ?? latestSnapshotContextId ?? null;
  const activeSnapshotContext = activeSnapshotId ? contexts[activeSnapshotId] ?? null : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await api.getConversation(conversationId);
      if (cancelled) return;
      setConversation(data.conversation);
      setMessages(data.messages);
      setTicket(data.ticket);
      const map: Record<string, ContextPayload> = {};
      for (const c of data.contexts) map[c.id] = c;
      setContexts(map);
    })();

    const socket = getSocket();
    socket.emit("join:conversation", conversationId);
    const onMessage = (payload: { message: Message; context?: ContextPayload }) => {
      if (payload.message.conversationId !== conversationId) return;
      // The dashboard joins this same conversation's room, so a message an
      // agent just sent from *this* session arrives back over the socket
      // too, in addition to being appended optimistically from the
      // sendReply() response — dedupe by id rather than filtering by
      // authorType, since other agents' dashboards replying to the same
      // conversation still need their messages delivered live here.
      setMessages((prev) => (prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]));
      if (payload.context) {
        setContexts((prev) => ({ ...prev, [payload.context!.id]: payload.context! }));
      }
    };
    socket.on("message:new", onMessage);
    return () => {
      cancelled = true;
      socket.off("message:new", onMessage);
    };
  }, [api, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendReply() {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    setReply("");
    try {
      const message = await api.sendMessage(conversationId, text, adminUser?.id);
      // Same dedupe as the socket handler below, applied symmetrically:
      // the "message:new" socket event for this exact send can arrive
      // before this POST's response does, in which case it's already in
      // `messages` by the time we get here.
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } finally {
      setSending(false);
    }
  }

  async function convertToTicket() {
    const t = await api.convertToTicket(conversationId);
    setTicket(t);
    setConversation((c) => (c ? { ...c, status: "ticket" } : c));
  }

  async function setStatus(status: string) {
    const updated = await api.updateConversation(conversationId, { status });
    setConversation(updated);
  }

  async function setTicketField(field: "status" | "priority", value: string) {
    if (!ticket) return;
    const updated = await api.updateTicket(ticket.id, { [field]: value });
    setTicket(updated);
  }

  async function sendFile(file: File) {
    const message = await api.sendAttachment(conversationId, file);
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }

  if (!conversation) return <div className="conversation-view empty">Loading…</div>;

  return (
    <div className="conversation-view">
      <div className="conversation-main">
        <div className="conversation-header">
          <div className="conversation-header-identity">
            <Avatar name={conversation.visitorName || conversation.visitorId || "?"} seed={conversation.id} size={36} />
            <div>
              <div className="visitor-name">
                {conversation.visitorName || conversation.visitorId}{" "}
                {conversation.verifiedUser?.role && <span className="role-badge">{conversation.verifiedUser.role}</span>}{" "}
                {conversation.verifiedUser && <span className="verified-badge">✓ verified</span>}
              </div>
              {conversation.visitorEmail && <div className="muted small">{conversation.visitorEmail}</div>}
            </div>
          </div>
          <div className="conversation-actions">
            <select value={conversation.status} onChange={(e) => void setStatus(e.target.value)}>
              <option value="open">Open</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
            {ticket ? (
              <span className="ticket-controls">
                <select
                  className={`ticket-priority-select priority-${ticket.priority}`}
                  value={ticket.priority}
                  onChange={(e) => void setTicketField("priority", e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <select value={ticket.status} onChange={(e) => void setTicketField("status", e.target.value)}>
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                {ticket.externalUrl && (
                  <a href={ticket.externalUrl} target="_blank" rel="noopener noreferrer">
                    View →
                  </a>
                )}
              </span>
            ) : (
              <button className="secondary" onClick={() => void convertToTicket()}>
                Convert to ticket
              </button>
            )}
            <button className="secondary" onClick={() => setShareModalOpen(true)}>
              Share a page
            </button>
          </div>
        </div>

        <div className="thread">
          {messages.map((m) => {
            if (m.type === "context_card" && m.contextId && contexts[m.contextId]) {
              return (
                <ContextCard
                  key={m.id}
                  context={contexts[m.contextId]}
                  authorType={m.authorType}
                  isActiveSnapshot={m.contextId === activeSnapshotId}
                  onViewPageState={setPinnedSnapshotId}
                />
              );
            }
            if (m.type === "system") {
              return (
                <div key={m.id} className="thread-system">
                  {m.body}
                </div>
              );
            }
            const mine = m.authorType === "agent";
            return (
              <div key={m.id} className={`thread-msg-row ${mine ? "mine" : "theirs"}`}>
                {!mine && (
                  <Avatar name={conversation.visitorName || conversation.visitorId || "?"} seed={conversation.id} size={26} />
                )}
                <div className={`thread-msg-group ${mine ? "me" : "them"}`}>
                  {m.type === "file" ? (
                    <AttachmentBubble api={api} message={m} />
                  ) : (
                    <div className={`thread-msg ${m.authorType}`}>{m.body}</div>
                  )}
                  <div className="thread-time">{formatTime(m.createdAt)}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="reply-box">
          <AttachButton onFile={sendFile} />
          <input
            placeholder="Reply as agent…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendReply()}
          />
          <button className="primary" disabled={sending || !reply.trim()} onClick={() => void sendReply()}>
            Send
          </button>
        </div>
      </div>

      <PageStatePanel context={activeSnapshotContext} />

      {shareModalOpen && (
        <ShareModal api={api} conversationId={conversationId} onClose={() => setShareModalOpen(false)} />
      )}
    </div>
  );
}
