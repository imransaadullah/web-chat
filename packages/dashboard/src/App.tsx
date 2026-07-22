import { useEffect, useState } from "react";
import type { ApiKey, Conversation } from "@web-chat/shared";
import { DashboardApi } from "./api";
import { Login } from "./components/Login";
import { Inbox } from "./components/Inbox";
import { ConversationView } from "./components/ConversationView";
import { Settings } from "./components/Settings";
import { getSocket } from "./socket";

const STORAGE_KEY = "web-chat-dashboard:secretKey";

export default function App() {
  const [secretKey, setSecretKey] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [app, setApp] = useState<ApiKey | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"inbox" | "settings">("inbox");

  const api = secretKey ? new DashboardApi(secretKey) : null;

  useEffect(() => {
    if (!secretKey) return;
    void DashboardApi.validateKey(secretKey).then((a) => {
      if (a) setApp(a);
      else {
        localStorage.removeItem(STORAGE_KEY);
        setSecretKey(null);
      }
    });
  }, [secretKey]);

  useEffect(() => {
    if (!api) return;
    void api.listConversations(filter).then(setConversations);
  }, [api, filter]);

  useEffect(() => {
    if (!app) return;
    const socket = getSocket();
    socket.emit("join:app", app.appId);
    const refresh = () => void api?.listConversations(filter).then(setConversations);
    socket.on("conversation:new", refresh);
    socket.on("conversation:update", refresh);
    return () => {
      socket.off("conversation:new", refresh);
      socket.off("conversation:update", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, filter]);

  function onLoggedIn(key: string, appInfo: ApiKey) {
    localStorage.setItem(STORAGE_KEY, key);
    setSecretKey(key);
    setApp(appInfo);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setSecretKey(null);
    setApp(null);
    setConversations([]);
    setSelectedId(null);
  }

  if (!secretKey || !api || !app) {
    return <Login onLoggedIn={onLoggedIn} />;
  }

  return (
    <div className="app-shell">
      <div className="sidebar">
        <div className="brand">{app.appName}</div>
        <nav>
          <button className={tab === "inbox" ? "active" : ""} onClick={() => setTab("inbox")}>
            Inbox
          </button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            Settings
          </button>
        </nav>
        <button className="logout" onClick={logout}>
          Log out
        </button>
      </div>

      {tab === "inbox" ? (
        <>
          <Inbox
            conversations={conversations}
            selectedId={selectedId}
            filter={filter}
            onFilterChange={setFilter}
            onSelect={setSelectedId}
          />
          {selectedId ? (
            <ConversationView api={api} conversationId={selectedId} />
          ) : (
            <div className="conversation-view empty">Select a conversation.</div>
          )}
        </>
      ) : (
        <Settings api={api} app={app} onUpdated={setApp} />
      )}
    </div>
  );
}
