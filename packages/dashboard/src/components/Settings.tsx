import { useState } from "react";
import type { ApiKey, PlatformUser } from "@web-chat/shared";
import { DashboardApi } from "../api";
import { RoutingSettings } from "./RoutingSettings";
import { PreChatSettings } from "./PreChatSettings";

export function Settings({
  api,
  app,
  onUpdated,
  adminUser,
}: {
  api: DashboardApi;
  app: ApiKey;
  onUpdated: (a: ApiKey) => void;
  adminUser: PlatformUser | null;
}) {
  const [webhookUrl, setWebhookUrl] = useState(app.webhookUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [modesSaving, setModesSaving] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateSettings({ webhookUrl: webhookUrl || null });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function toggleMode(key: "ticketingEnabled" | "widgetChatEnabled" | "teamChatEnabled") {
    setModesSaving(true);
    try {
      const updated = await api.updateSettings({ [key]: !app[key] });
      onUpdated(updated);
    } finally {
      setModesSaving(false);
    }
  }

  const snippet = `<script src="https://YOUR_CDN_OR_HOST/web-chat.js"></script>
<script>
  WebChat.init({
    appId: "${app.publicKey}",
    serverUrl: "http://localhost:4000",
    // Preferred: a signed identity token from YOUR backend (see below) —
    // proves who this user is and carries their role for routing.
    identityToken: "{{ token your backend minted for this request }}",
    // Fallback if you don't want identity verification yet — unverified,
    // anyone can claim any id:
    // visitor: { id: currentUser.id, name: currentUser.name, email: currentUser.email },
  });

  // Call this any time your app's filters/view/state change:
  WebChat.setContext({
    kind: "view",
    title: "Invoices — Overdue, Q2 2026",
    url: window.location.href,
    data: { status: "overdue", range: "q2" },
    snapshot: [{ label: "Status filter", value: "overdue" }],
  });
</script>`;

  const identitySnippet = `// On YOUR backend (any language), once you know who's logged in — see
// examples/identity-token.mjs for a runnable reference:
//
//   payload = { userId: user.id, name: user.name, email: user.email,
//               role: user.role, iat: now, exp: now + 300 }
//   encoded = base64url(JSON.stringify(payload))
//   token   = encoded + "." + hex(HMAC_SHA256(encoded, "${app.secretKey}"))
//
// Hand that token to the page that calls WebChat.init({ identityToken: token }).
// Sign it fresh per page load/session — tokens expire after 5 minutes.`;

  return (
    <div className="settings">
      <h2>Settings</h2>

      <section>
        <h3>Deployment modes</h3>
        <p className="muted small">
          Turn off what you don't need. Each mode is independent — a pure ticketing desk with no live
          widget, a widget-only support inbox, or internal team chat on its own all work.
        </p>
        <div className="mode-toggle-list">
          <label className="mode-toggle">
            <div>
              <div className="mode-toggle-title">Ticketing</div>
              <div className="muted small">Convert conversations to tickets with a status/priority workflow.</div>
            </div>
            <input
              type="checkbox"
              checked={app.ticketingEnabled}
              disabled={modesSaving}
              onChange={() => void toggleMode("ticketingEnabled")}
            />
          </label>
          <label className="mode-toggle">
            <div>
              <div className="mode-toggle-title">Widget chat</div>
              <div className="muted small">The embeddable widget on your website, landing in this inbox.</div>
            </div>
            <input
              type="checkbox"
              checked={app.widgetChatEnabled}
              disabled={modesSaving}
              onChange={() => void toggleMode("widgetChatEnabled")}
            />
          </label>
          <label className="mode-toggle">
            <div>
              <div className="mode-toggle-title">Team chat</div>
              <div className="muted small">Internal staff-to-staff DMs/groups, with page and file sharing.</div>
            </div>
            <input
              type="checkbox"
              checked={app.teamChatEnabled}
              disabled={modesSaving}
              onChange={() => void toggleMode("teamChatEnabled")}
            />
          </label>
        </div>
      </section>

      <section>
        <h3>Keys</h3>
        <p className="muted small">The public key goes in your widget snippet (client-side, safe to expose). Keep the secret key server-side only — it authenticates the dashboard and signs webhooks.</p>
        <label>Public key</label>
        <code className="key-box">{app.publicKey}</code>
        <label>Secret key</label>
        <code className="key-box">{app.secretKey}</code>
      </section>

      <section>
        <h3>Webhook</h3>
        <p className="muted small">
          We'll POST signed events here for conversation.created, message.created, context.shared, and
          conversation.converted_to_ticket — pipe these into Linear/Jira/Slack/wherever tickets live.
        </p>
        <input
          placeholder="https://your-server.com/webhooks/web-chat"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
        />
        <button className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </section>

      <section>
        <h3>Widget snippet</h3>
        <pre className="snippet">{snippet}</pre>
      </section>

      <section>
        <h3>Identity verification</h3>
        <p className="muted small">
          Prove who a visitor is instead of trusting a client-supplied id — and carry a{" "}
          <code>role</code> that routing rules can match on. A signed token, not a live API call: no
          network round-trip on your side, and it reuses this app's existing secret key.
        </p>
        <pre className="snippet">{identitySnippet}</pre>
        <p className="muted small" style={{ marginTop: 12 }}>
          {adminUser ? (
            <>
              You're identified as <strong>{adminUser.name ?? adminUser.externalId}</strong>
              {adminUser.role ? ` (${adminUser.role})` : ""} — messages you send and pages you share are
              attributed to this identity.
            </>
          ) : (
            <>
              No admin identity resolved this session — replies are sent unattributed, and "Share a page"
              won't work until one is. The host app should deep-link into this dashboard with{" "}
              <code>?identityToken=...</code> (same signed-token mechanism as above, any <code>role</code>{" "}
              you like, e.g. <code>"admin"</code>). For local testing, mint one with{" "}
              <code>examples/identity-token.mjs</code> using this app's secret key and append it to this
              page's URL.
            </>
          )}
        </p>
      </section>

      <RoutingSettings api={api} />

      <PreChatSettings api={api} app={app} onUpdated={onUpdated} />
    </div>
  );
}
