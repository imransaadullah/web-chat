import { capturePageSnapshot } from "./snapshot.js";

/**
 * Runs on whatever page an admin wants to share into a conversation — a
 * page we don't control and often can't reach into (their own internal
 * CRM/ops tool, not something web-chat is embedded on). Loaded by a static,
 * reusable bookmarklet (installed once) via a plain <script src>, so this
 * file is a self-executing script, not a module other code imports.
 *
 * Design: the bookmarklet itself carries only `serverUrl` (baked into the
 * script tag's query string by whoever generated the bookmarklet link —
 * see the dashboard's Settings page). The per-share, conversation-scoped
 * credential — the actual thing that decides *where* this capture lands —
 * is entered by the admin at share-time via a plain prompt(), copied from
 * the dashboard's "Share a page" modal. That keeps the bookmarklet static
 * and reusable across every share, while each share stays scoped to
 * exactly the conversation the admin generated the token from.
 */

function getServerUrl(): string | null {
  const src = (document.currentScript as HTMLScriptElement | null)?.src ?? "";
  try {
    return new URL(src).searchParams.get("serverUrl");
  } catch {
    return null;
  }
}

function showBanner(text: string): void {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText =
    "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);" +
    "background:#1a1a1a;color:#fff;padding:10px 16px;border-radius:8px;" +
    "font:13px -apple-system,BlinkMacSystemFont,sans-serif;z-index:2147483647;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.25)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function run(): Promise<void> {
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    window.alert("[web-chat] Bookmarklet is missing its server URL — reinstall it from the dashboard.");
    return;
  }

  const token = window.prompt("Paste your web-chat share token (from the dashboard's \"Share a page\" button):");
  if (!token) return;

  const pageSnapshot = capturePageSnapshot();
  if (!pageSnapshot) {
    window.alert("[web-chat] Couldn't capture this page.");
    return;
  }

  try {
    const res = await fetch(`${serverUrl}/api/share-tokens/${encodeURIComponent(token.trim())}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: document.title, url: location.href, pageSnapshot }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(`[web-chat] Share failed: ${data.error ?? res.statusText}`);
      return;
    }
    showBanner("Shared to web-chat ✓");
  } catch {
    window.alert("[web-chat] Share failed: network error.");
  }
}

void run();
