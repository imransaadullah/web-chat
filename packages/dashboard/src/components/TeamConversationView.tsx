import { useEffect, useRef, useState } from "react";
import type { Conversation, Message, PlatformUser } from "@web-chat/shared";
import { DashboardApi } from "../api";
import { getSocket } from "../socket";
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

function displayName(conversation: Conversation, currentUserId: string): string {
  if (conversation.title) return conversation.title;
  const others = (conversation.participants ?? []).filter((p) => p.id !== currentUserId);
  if (others.length === 0) return "(just you)";
  return others.map((p) => p.name ?? p.externalId).join(", ");
}

export function TeamConversationView({
  api,
  conversationId,
  currentUserId,
}: {
  api: DashboardApi;
  conversationId: string;
  currentUserId: string | null;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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
    })();

    const socket = getSocket();
    socket.emit("join:conversation", conversationId);
    const onMessage = (payload: { message: Message }) => {
      if (payload.message.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]));
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
      const message = await api.sendTeamMessage(conversationId, text);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    const message = await api.sendAttachment(conversationId, file);
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }

  if (!conversation) return <div className="conversation-view empty">Loading…</div>;

  const participantsById = new Map((conversation.participants ?? []).map((p) => [p.id, p]));
  const senderName = (id: string): string => {
    const p = participantsById.get(id);
    return p?.name ?? p?.externalId ?? id;
  };

  return (
    <div className="conversation-view">
      <div className="conversation-main">
        <div className="conversation-header">
          <div className="conversation-header-identity">
            <Avatar name={displayName(conversation, currentUserId ?? "")} seed={conversation.id} size={36} />
            <div className="visitor-name">{displayName(conversation, currentUserId ?? "")}</div>
          </div>
        </div>

        <div className="thread">
          {messages.map((m) => {
            if (m.type === "system") {
              return (
                <div key={m.id} className="thread-system">
                  {m.body}
                </div>
              );
            }
            const mine = m.authorId === currentUserId;
            return (
              <div key={m.id} className={`thread-msg-row ${mine ? "mine" : "theirs"}`}>
                {!mine && <Avatar name={senderName(m.authorId)} seed={m.authorId} size={26} />}
                <div className={`thread-msg-group ${mine ? "me" : "them"}`}>
                  {!mine && <div className="thread-sender">{senderName(m.authorId)}</div>}
                  {m.type === "file" ? (
                    <AttachmentBubble api={api} message={m} />
                  ) : (
                    <div className={`thread-msg ${mine ? "agent" : "visitor"}`}>{m.body}</div>
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
            placeholder="Message…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendReply()}
          />
          <button className="primary" disabled={sending || !reply.trim()} onClick={() => void sendReply()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
