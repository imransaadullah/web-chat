import { useEffect, useMemo, useState } from "react";
import type { ApiKey, Conversation, PlatformUser, ResponderGroup, TicketWithConversation } from "@web-chat/shared";
import { DashboardApi } from "./api";
import { Inbox } from "./components/Inbox";
import { ConversationView } from "./components/ConversationView";
import { TeamInbox } from "./components/TeamInbox";
import { TeamConversationView } from "./components/TeamConversationView";
import { Tickets } from "./components/Tickets";
import { Settings } from "./components/Settings";
import { getSocket } from "./socket";

export interface DashboardProps {
  /** Base URL of the web-chat server this org's App lives on. */
  serverUrl: string;
  /**
   * The App's secret key. The host app (e.g. trustmail's backend, via the
   * x-webchat-master + x-trustmail-org path — see auth.ts) owns fetching
   * and rotating this; Dashboard never persists it (no localStorage) and
   * never shows its own key-entry UI, unlike the standalone App below.
   */
  secretKey: string;
  /** Deep-linked identity token — same semantics as ?identityToken= for the standalone app. */
  identityToken?: string;
  /**
   * Called when `secretKey` is rejected by the server (revoked, wrong org,
   * etc). Dashboard renders a minimal inline error either way; the host app
   * should use this to re-mint a key and re-render with a fresh one, or to
   * fall back to its own error UI.
   */
  onAuthError?: (error: Error) => void;
  /** Renders a "Log out" button in the sidebar when provided; omitted (not disabled-but-shown) otherwise, since the host app owns the session. */
  onLogout?: () => void;
}

/**
 * The dashboard's actual UI, decoupled from the standalone app's
 * localStorage/Login/env-var wiring (see App.tsx) so it can be mounted
 * directly inside a host app's own React tree — e.g.
 * `<Dashboard serverUrl={...} secretKey={orgSecretKey} />` inside
 * trustmail's own admin panel, no iframe. Exported from ./lib for that use.
 */
export function Dashboard({ serverUrl, secretKey, identityToken, onAuthError, onLogout }: DashboardProps) {
  const [app, setApp] = useState<ApiKey | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<PlatformUser | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<ResponderGroup[]>([]);
  const [filter, setFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"inbox" | "team" | "tickets" | "settings">("inbox");
  const [teamConversations, setTeamConversations] = useState<Conversation[]>([]);
  const [teamUsers, setTeamUsers] = useState<PlatformUser[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketWithConversation[]>([]);
  const [ticketStatus, setTicketStatus] = useState("all");
  const [ticketPriority, setTicketPriority] = useState("all");
  const [selectedTicketConversationId, setSelectedTicketConversationId] = useState<string | null>(null);

  // Memoized on the (secretKey, identityToken, serverUrl) triple — see
  // App.tsx's original note: several child effects key off `api` identity,
  // so a fresh instance every render would loop.
  const api = useMemo(
    () => new DashboardApi(secretKey, identityToken, serverUrl),
    [secretKey, identityToken, serverUrl],
  );

  useEffect(() => {
    let cancelled = false;
    setApp(null);
    setAuthError(null);
    api
      .me()
      .then((a) => {
        if (!cancelled) setApp(a);
      })
      .catch((err) => {
        if (cancelled) return;
        setAuthError(err instanceof Error ? err.message : "Failed to authenticate");
        onAuthError?.(err instanceof Error ? err : new Error("Failed to authenticate"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    void api.resolveAdminIdentity().then(setAdminUser);
  }, [api]);

  useEffect(() => {
    if (!app) return;
    void api.listConversations(filter, groupFilter || undefined).then(setConversations);
  }, [api, app, filter, groupFilter]);

  useEffect(() => {
    if (!app) return;
    void api.listResponderGroups().then(setGroups);
  }, [api, app]);

  useEffect(() => {
    if (!app?.ticketingEnabled) return;
    void api.listTickets(ticketStatus, ticketPriority).then(setTickets);
  }, [api, app?.ticketingEnabled, ticketStatus, ticketPriority]);

  useEffect(() => {
    if (!app) return;
    const socket = getSocket(serverUrl);
    socket.emit("join:app", app.appId);
    const refresh = () => void api.listConversations(filter, groupFilter || undefined).then(setConversations);
    const refreshTickets = () => {
      if (app.ticketingEnabled) void api.listTickets(ticketStatus, ticketPriority).then(setTickets);
    };
    socket.on("conversation:new", refresh);
    socket.on("conversation:new", refreshTickets);
    socket.on("conversation:update", refresh);
    socket.on("conversation:update", refreshTickets);
    return () => {
      socket.off("conversation:new", refresh);
      socket.off("conversation:new", refreshTickets);
      socket.off("conversation:update", refresh);
      socket.off("conversation:update", refreshTickets);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, serverUrl, filter, groupFilter, ticketStatus, ticketPriority]);

  useEffect(() => {
    if (!adminUser) return;
    void api.listUsers().then(setTeamUsers);
    void api.listTeamConversations().then(setTeamConversations);
  }, [api, adminUser]);

  useEffect(() => {
    if (!adminUser) return;
    const socket = getSocket(serverUrl);
    socket.emit("join:user", adminUser.id);
    const refresh = () => void api.listTeamConversations().then(setTeamConversations);
    socket.on("team-conversation:new", refresh);
    return () => {
      socket.off("team-conversation:new", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser, serverUrl]);

  async function handleCreateTeamConversation(participantIds: string[], title?: string) {
    try {
      const conversation = await api.createTeamConversation(participantIds, title);
      setTeamConversations((prev) =>
        prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev],
      );
      setSelectedTeamId(conversation.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to start conversation");
    }
  }

  useEffect(() => {
    if (!app) return;
    const enabled = { inbox: app.widgetChatEnabled, tickets: app.ticketingEnabled, team: app.teamChatEnabled, settings: true };
    if (!enabled[tab]) setTab("settings");
  }, [app, tab]);

  if (authError) {
    return <div className="conversation-view empty">Couldn't load this workspace: {authError}</div>;
  }

  if (!app) {
    return <div className="conversation-view empty">Loading…</div>;
  }

  return (
    <div className="app-shell">
      <div className="sidebar">
        <div className="brand">
          <span className="brand-mark">{app.appName.slice(0, 1).toUpperCase()}</span>
          <span className="brand-name">{app.appName}</span>
        </div>
        <nav>
          {app.widgetChatEnabled && (
            <button className={tab === "inbox" ? "active" : ""} onClick={() => setTab("inbox")}>
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.7a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 1 1 21 11.5z" />
              </svg>
              Inbox
            </button>
          )}
          {app.ticketingEnabled && (
            <button className={tab === "tickets" ? "active" : ""} onClick={() => setTab("tickets")}>
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
              </svg>
              Tickets
            </button>
          )}
          {app.teamChatEnabled && (
            <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                <circle cx="10" cy="7" r="4" />
                <path d="M22.5 21v-2a4 4 0 0 0-3-3.87M16.5 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Team
            </button>
          )}
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </nav>
        {onLogout && (
          <button className="logout" onClick={onLogout}>
            Log out
          </button>
        )}
      </div>

      {tab === "inbox" && (
        <>
          <Inbox
            conversations={conversations}
            selectedId={selectedId}
            filter={filter}
            onFilterChange={setFilter}
            groups={groups}
            groupFilter={groupFilter}
            onGroupFilterChange={setGroupFilter}
            onSelect={setSelectedId}
          />
          {selectedId ? (
            <ConversationView api={api} conversationId={selectedId} adminUser={adminUser} />
          ) : (
            <div className="conversation-view empty">Select a conversation.</div>
          )}
        </>
      )}

      {tab === "tickets" && (
        <>
          <Tickets
            api={api}
            tickets={tickets}
            selectedId={selectedTicketConversationId}
            status={ticketStatus}
            onStatusChange={setTicketStatus}
            priority={ticketPriority}
            onPriorityChange={setTicketPriority}
            onSelect={setSelectedTicketConversationId}
            onCreated={(t) => setTickets((prev) => [t, ...prev])}
          />
          {selectedTicketConversationId ? (
            <ConversationView api={api} conversationId={selectedTicketConversationId} adminUser={adminUser} />
          ) : (
            <div className="conversation-view empty">Select a ticket.</div>
          )}
        </>
      )}

      {tab === "team" && (
        <>
          <TeamInbox
            conversations={teamConversations}
            selectedId={selectedTeamId}
            onSelect={setSelectedTeamId}
            users={teamUsers}
            currentUserId={adminUser?.id ?? null}
            onCreateConversation={(ids, title) => void handleCreateTeamConversation(ids, title)}
          />
          {!adminUser ? (
            <div className="conversation-view empty">
              Team chat needs an admin identity — see Settings → Identity verification.
            </div>
          ) : selectedTeamId ? (
            <TeamConversationView api={api} conversationId={selectedTeamId} currentUserId={adminUser.id} />
          ) : (
            <div className="conversation-view empty">Select a conversation.</div>
          )}
        </>
      )}

      {tab === "settings" && <Settings api={api} app={app} onUpdated={setApp} adminUser={adminUser} />}
    </div>
  );
}
