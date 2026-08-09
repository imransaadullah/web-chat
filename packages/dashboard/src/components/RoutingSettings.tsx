import { useEffect, useState } from "react";
import type { ResponderGroup, RoutingRule } from "@web-chat/shared";
import { DashboardApi } from "../api";

/**
 * Configures where a verified user's messages go based on their role
 * (from the identity token — see VerifiedIdentityPayload). Two pieces:
 * responder groups (named queues, e.g. "Provider support") and routing
 * rules (role -> group). A conversation is routed once, at creation time,
 * based on the rule that matches the verified user's role.
 */
export function RoutingSettings({ api }: { api: DashboardApi }) {
  const [groups, setGroups] = useState<ResponderGroup[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [groupKey, setGroupKey] = useState("");
  const [groupName, setGroupName] = useState("");
  const [ruleRole, setRuleRole] = useState("");
  const [ruleGroupId, setRuleGroupId] = useState("");

  async function refresh() {
    const [g, r] = await Promise.all([api.listResponderGroups(), api.listRoutingRules()]);
    setGroups(g);
    setRules(r);
    if (!ruleGroupId && g.length) setRuleGroupId(g[0].id);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function addGroup() {
    if (!groupKey.trim() || !groupName.trim()) return;
    await api.createResponderGroup(groupKey.trim(), groupName.trim());
    setGroupKey("");
    setGroupName("");
    void refresh();
  }

  async function removeGroup(id: string) {
    await api.deleteResponderGroup(id);
    void refresh();
  }

  async function addRule() {
    if (!ruleRole.trim() || !ruleGroupId) return;
    await api.createRoutingRule(ruleRole.trim(), ruleGroupId);
    setRuleRole("");
    void refresh();
  }

  async function removeRule(id: string) {
    await api.deleteRoutingRule(id);
    void refresh();
  }

  const groupName_ = (id: string) => groups.find((g) => g.id === id)?.name ?? id;

  return (
    <section>
      <h3>Routing</h3>
      <p className="muted small">
        Verified users (via an identity token — see the docs) carry a <code>role</code>, e.g.{" "}
        <code>"provider"</code>. Route each role to a responder group, then filter the Inbox by
        group so the right admins see the right conversations.
      </p>

      <label>Responder groups</label>
      {groups.length === 0 && <p className="muted small">No responder groups yet.</p>}
      {groups.map((g) => (
        <div key={g.id} className="routing-row">
          <span className="routing-row-label">
            {g.name} <span className="muted small">({g.key})</span>
          </span>
          <button className="secondary" onClick={() => void removeGroup(g.id)}>
            Remove
          </button>
        </div>
      ))}
      <div className="routing-add-row">
        <input placeholder="key, e.g. provider-support" value={groupKey} onChange={(e) => setGroupKey(e.target.value)} />
        <input placeholder="Display name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
        <button className="secondary" onClick={() => void addGroup()}>
          Add group
        </button>
      </div>

      <label>Routing rules</label>
      {rules.length === 0 && <p className="muted small">No routing rules yet — unmatched conversations go to the default inbox.</p>}
      {rules.map((r) => (
        <div key={r.id} className="routing-row">
          <span className="routing-row-label">
            role <code>{r.matchRole}</code> → {groupName_(r.responderGroupId)}
          </span>
          <button className="secondary" onClick={() => void removeRule(r.id)}>
            Remove
          </button>
        </div>
      ))}
      {groups.length > 0 && (
        <div className="routing-add-row">
          <input placeholder="role, e.g. provider" value={ruleRole} onChange={(e) => setRuleRole(e.target.value)} />
          <select value={ruleGroupId} onChange={(e) => setRuleGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={() => void addRule()}>
            Add rule
          </button>
        </div>
      )}
    </section>
  );
}
