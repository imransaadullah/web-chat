import { useState } from "react";
import { DashboardApi } from "../api";

// Where the bookmarklet's loader script lives. In dev this is widget-sdk's
// own static demo server (which already serves everything under dist/ —
// see packages/widget-sdk/demo/serve.mjs); in production, wherever you
// publish the built widget-sdk bundle (same CDN/host as web-chat.js itself
// — see the README's "Widget hosting" note).
const BOOKMARKLET_SCRIPT_URL =
  import.meta.env?.VITE_BOOKMARKLET_SCRIPT_URL ?? "http://localhost:5173/dist/bookmarklet.js";

// Reads serverUrl off the caller's own api instance, not a build-time
// default — an embedded Dashboard (see Dashboard.tsx) may point at a
// different web-chat server than the standalone app's env var.
function buildBookmarkletHref(serverUrl: string): string {
  const src = `${BOOKMARKLET_SCRIPT_URL}?serverUrl=${encodeURIComponent(serverUrl)}`;
  const code = `(function(){var s=document.createElement('script');s.src=${JSON.stringify(src)};document.body.appendChild(s);})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function ShareModal({ api, conversationId, onClose }: { api: DashboardApi; conversationId: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await api.createShareToken(conversationId);
      setToken(result.token);
      setExpiresAt(result.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share token");
    } finally {
      setGenerating(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      /* clipboard access denied — the token is still shown, selectable by hand */
    }
  }

  return (
    <div className="share-modal-backdrop" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Share a page into this conversation</h3>
        <p className="muted small">
          For pages on your own internal tools — not something web-chat is embedded on. See{" "}
          <em>Settings → Identity verification</em> for the identity token this needs.
        </p>
        <ol>
          <li>
            Drag this to your bookmarks bar (once):{" "}
            <a className="bookmarklet-link" href={buildBookmarkletHref(api.serverUrl)} onClick={(e) => e.preventDefault()}>
              Share to web-chat
            </a>
          </li>
          <li>Generate a token below, and copy it.</li>
          <li>Go to the page you want to share, click the bookmarklet, and paste the token when prompted.</li>
        </ol>

        {token ? (
          <>
            <div className="share-token-box">
              <code>{token}</code>
              <button className="secondary" onClick={() => void copyToken()}>
                Copy
              </button>
            </div>
            {expiresAt && (
              <div className="share-modal-expiry">Expires {new Date(expiresAt).toLocaleTimeString()}</div>
            )}
          </>
        ) : (
          <button className="primary" disabled={generating} onClick={() => void generate()}>
            {generating ? "Generating…" : "Generate share token"}
          </button>
        )}
        {error && <div className="share-modal-error">{error}</div>}

        <div className="share-modal-close">
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
