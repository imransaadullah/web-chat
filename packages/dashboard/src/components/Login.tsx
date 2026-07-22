import { useState } from "react";
import { DashboardApi } from "../api";
import type { ApiKey } from "@web-chat/shared";

export function Login({ onLoggedIn }: { onLoggedIn: (key: string, app: ApiKey) => void }) {
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const app = await DashboardApi.validateKey(secretKey.trim());
    setLoading(false);
    if (!app) {
      setError("That secret key doesn't match any app. Check the server and try again.");
      return;
    }
    onLoggedIn(secretKey.trim(), app);
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>web-chat dashboard</h1>
        <p className="muted">
          Paste your app's secret key (from <code>npm run db:seed</code> or the onboarding API).
        </p>
        <input
          type="password"
          placeholder="sk_..."
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          autoFocus
        />
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={loading || !secretKey.trim()}>
          {loading ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
