import { useEffect, useRef, useState } from "react";
import type { ContextPayload, Conversation, Message, Ticket } from "@web-chat/shared";
import { DashboardApi } from "../api";
import { getSocket } from "../socket";

function ContextCard({ context }: { context: ContextPayload }) {
  return (
    <div className="context-card">
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
      {context.url && (
        <a href={context.url} target="_blank" rel="noopener noreferrer">
          Open exact state in product →
        </a>
      )}
    </div>
  );
}

export function ConversationView({ api, conversationId }: { api: DashboardApi; conversationId: string }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contexts, setContexts] = useState<Record<string, ContextPayload>>({});
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      setMessages((prev) => [...prev, payload.message]);
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
      const message = await api.sendMessage(conversationId, text);
      setMessages((prev) => [...prev, message]);
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

  if (!conversation) return <div className="conversation-view empty">Loading…</div>;

  return (
    <div className="conversation-view">
      <div className="conversation-header">
        <div>
          <div className="visitor-name">{conversation.visitorName || conversation.visitorId}</div>
          {conversation.visitorEmail && <div className="muted small">{conversation.visitorEmail}</div>}
        </div>
        <div className="conversation-actions">
          <select value={conversation.status} onChange={(e) => void setStatus(e.target.value)}>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </select>
          {ticket ? (
            <span className="ticket-badge">
              Ticket created
              {ticket.externalUrl && (
                <>
                  {" "}
                  ·{" "}
                  <a href={ticket.externalUrl} target="_blank" rel="noopener noreferrer">
                    View →
                  </a>
                </>
              )}
            </span>
          ) : (
            <button className="secondary" onClick={() => void convertToTicket()}>
              Convert to ticket
            </button>
          )}
        </div>
      </div>

      <div className="thread">
        {messages.map((m) => {
          if (m.type === "context_card" && m.contextId && contexts[m.contextId]) {
            return <ContextCard key={m.id} context={contexts[m.contextId]} />;
          }
          if (m.type === "system") {
            return (
              <div key={m.id} className="thread-system">
                {m.body}
              </div>
            );
          }
          return (
            <div key={m.id} className={`thread-msg ${m.authorType}`}>
              {m.body}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="reply-box">
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
  );
}
