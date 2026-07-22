import { useState } from "react";
import type { ApiKey } from "@web-chat/shared";
import { DashboardApi } from "../api";

export function Settings({ api, app, onUpdated }: { api: DashboardApi; app: ApiKey; onUpdated: (a: ApiKey) => void }) {
  const [webhookUrl, setWebhookUrl] = useState(app.webhookUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    const updated = await api.updateSettings({ webhookUrl: webhookUrl || null });
    onUpdated(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const snippet = `<script src="https://YOUR_CDN_OR_HOST/web-chat.js"></script>
<script>
  WebChat.init({
    appId: "${app.publicKey}",
    serverUrl: "http://localhost:4000",
    visitor: { id: currentUser.id, name: currentUser.name, email: currentUser.email },
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

  return (
    <div className="settings">
      <h2>Settings</h2>

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
    </div>
  );
}
