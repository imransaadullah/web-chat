import { useState } from "react";
import type { ApiKey, PreChatField } from "@web-chat/shared";
import { DashboardApi } from "../api";

/**
 * Configures the small form the widget shows to anonymous visitors (no
 * identity token, no host-supplied visitor.id — e.g. a public landing
 * page) before relaying their first message. Only "name"/"email" keys
 * currently map onto stored visitor identity; see widget-sdk/src/index.ts.
 */
export function PreChatSettings({ api, app, onUpdated }: { api: DashboardApi; app: ApiKey; onUpdated: (a: ApiKey) => void }) {
  const [fields, setFields] = useState<PreChatField[]>(app.preChatFields ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function updateField(i: number, patch: Partial<PreChatField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function addField() {
    setFields((prev) => [...prev, { key: "", label: "", type: "text", required: true }]);
  }

  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateSettings({ preChatFields: fields.filter((f) => f.key && f.label) });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h3>Pre-chat form</h3>
      <p className="muted small">
        Shown to visitors the widget can't otherwise identify (no identity token, no host-supplied
        visitor id) before their first message — e.g. a public landing page. Leave empty to skip
        straight to chat for anonymous visitors.
      </p>
      {fields.map((f, i) => (
        <div key={i} className="prechat-field-row">
          <input placeholder="key (name / email)" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} />
          <input placeholder="Label shown to visitor" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
          <select value={f.type} onChange={(e) => updateField(i, { type: e.target.value as PreChatField["type"] })}>
            <option value="text">text</option>
            <option value="email">email</option>
          </select>
          <label className="prechat-required">
            <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
            required
          </label>
          <button className="secondary" onClick={() => removeField(i)}>
            Remove
          </button>
        </div>
      ))}
      <button className="secondary" onClick={addField}>
        Add field
      </button>
      <div style={{ marginTop: 12 }}>
        <button className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </section>
  );
}
