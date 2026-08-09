import { useState } from "react";
import type { ApiKey } from "@web-chat/shared";
import { DEFAULT_SERVER_URL } from "./api";
import { Login } from "./components/Login";
import { Dashboard } from "./Dashboard";

const STORAGE_KEY = "web-chat-dashboard:secretKey";

// Read once at module load, not per-render — the token is meant to be
// consumed immediately (deep-linked in by the host app), not re-read after
// e.g. an in-app navigation changes the URL.
const identityTokenFromUrl = new URLSearchParams(window.location.search).get("identityToken") ?? undefined;

/**
 * Standalone entry point (self-hosted deployment, or local dev): owns the
 * secretKey via localStorage + the paste-your-key Login screen. Everything
 * that's actually reusable lives in Dashboard.tsx, which a host app (e.g.
 * trustmail rendering this inline instead of behind an iframe) imports
 * directly from the published @imransaadullah/web-chat-dashboard package
 * instead of this file — see docs/TRUSTMAIL_DASHBOARD_EMBED.md.
 */
export default function App() {
  const [secretKey, setSecretKey] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  function onLoggedIn(key: string, _appInfo: ApiKey) {
    localStorage.setItem(STORAGE_KEY, key);
    setSecretKey(key);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setSecretKey(null);
  }

  if (!secretKey) {
    return <Login onLoggedIn={onLoggedIn} />;
  }

  return (
    <Dashboard
      serverUrl={DEFAULT_SERVER_URL}
      secretKey={secretKey}
      identityToken={identityTokenFromUrl}
      onLogout={logout}
      onAuthError={logout}
    />
  );
}
