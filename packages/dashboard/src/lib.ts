// Library entry point for embedding the dashboard inside a host app's own
// React tree (e.g. trustmail's admin panel) — see Dashboard.tsx's doc
// comment. Not used by the standalone Vite app, which renders App.tsx
// (main.tsx) instead. Built separately via tsup — see tsup.config.ts.
export { Dashboard } from "./Dashboard";
export type { DashboardProps } from "./Dashboard";
export { DashboardApi } from "./api";

// Consumers still need this stylesheet — it's not auto-injected so a
// bundler-driven host app controls exactly when/how CSS lands, same
// convention as most component libraries. Import it explicitly:
// `import "@imransaadullah/web-chat-dashboard/style.css"`.
import "./styles.css";
