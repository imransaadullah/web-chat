# web-chat

Embeddable, **context-aware** chat for web products. The point of difference
from Intercom/Zendesk/Crisp/Tawk-style widgets: instead of just linking out,
a host app can hand the conversation a structured snapshot of what the user
is actually looking at — filters applied, records selected, whatever view
state matters — and it shows up as an actionable card in the thread, not a
bare URL.

Everything else (chat widget, agent dashboard, webhooks, ticket handoff) is
intentionally kept thin. This is not trying to out-feature Intercom; it's
trying to nail the one thing those tools don't do.

## How it's put together

```
packages/
  shared/       Types shared by every package. ContextPayload (the core
                 differentiator) lives here — read this file first.
  server/        Fastify + Prisma(SQLite) + Socket.IO. REST API, realtime,
                 signed webhook dispatch. No built-in ticketing system —
                 "convert to ticket" fires a webhook with full context
                 instead, so you pipe it into Linear/Jira/Asana/Slack/etc.
  widget-sdk/    Vanilla TS embeddable widget (Shadow DOM, zero framework
                 dependency for the host page). WebChat.init/setContext/
                 shareContext.
  dashboard/     React + Vite agent console: inbox, thread view with
                 rendered context cards, convert-to-ticket, settings.
examples/
  webhook-receiver.mjs   ~50-line reference receiver showing signature
                          verification, to adapt into your real backend.
```

## Quickstart

Requires Node 18+. All commands from the repo root unless noted.

```bash
npm install

# server: set up the database
cp packages/server/.env.example packages/server/.env
npm run db:migrate      # creates packages/server/prisma/dev.db
npm run db:seed         # prints a demo app's publicKey / secretKey — save these

# run everything (three terminals)
npm run dev:server      # http://localhost:4000
npm run dev:dashboard   # http://localhost:5174 — paste the secretKey to log in
npm run dev:widget      # builds the widget in watch mode -> packages/widget-sdk/dist

# try the widget against a fake "host app" with filters
cd packages/widget-sdk && npm run demo   # http://localhost:5173
# paste the publicKey from db:seed into the demo page's input
```

Change a filter on the demo page and hit "Share this view in chat" — the
context lands as a card in both the widget and the dashboard thread.

## The core type

Everything hangs off `ContextPayload` in `packages/shared/src/index.ts`:

```ts
interface ContextPayload {
  id: string;
  appId: string;
  kind: string;              // "view" | "record" | anything you define
  title: string;             // "Invoices — Overdue, Q2 2026"
  summary?: string;
  url?: string;               // deep link that reproduces this exact state
  data?: Record<string, unknown>;   // opaque — filters, ids, whatever
  snapshot?: { label: string; value: string }[]; // rendered inline as a table
  capturedAt: string;
}
```

Host apps call `WebChat.setContext(payload)` whenever their view/filters
change (ambient — doesn't interrupt the thread), and
`WebChat.shareContext(payload?)` when the user explicitly wants to hand it
to the agent (falls back to the last `setContext` payload if none given).

## Webhooks

Configured per-app in the dashboard's Settings tab. Events fire for
`conversation.created`, `message.created`, `context.shared`,
`conversation.converted_to_ticket`, `conversation.status_changed`. Payloads
are signed HMAC-SHA256 (see `packages/server/src/webhooks.ts` and
`examples/webhook-receiver.mjs` for verification code) — the same shape as
Stripe/GitHub webhook signing, so it should feel familiar.

This is the intended integration point for tickets: rather than web-chat
owning a ticketing system, `conversation.converted_to_ticket` carries the
full conversation + context, and your receiver creates the real ticket
wherever you already track work. If your receiver reports back an id/url via
`PATCH /api/tickets/:id/callback`, the dashboard links out to it.

## Known simplifications (read before going further than a demo)

This was built as a working starting point, not a production-hardened
multi-tenant service. Things to shore up before it's carrying real traffic:

- **Visitor auth**: the widget currently trusts a client-supplied
  `visitor.id` scoped only by the app's public key. Fine for a first pass;
  swap in short-lived signed visitor session tokens before this is
  customer-facing, so one visitor can't read another's conversation by
  guessing an id.
- **Onboarding**: `POST /api/apps` (creating a new app/workspace) is
  currently open — wire it up behind your own account system before
  exposing it publicly.
- **Webhook delivery**: dispatch is fire-and-forget with a few in-process
  retries (see `dispatchWebhook` in `webhooks.ts`). Good enough for a demo;
  swap in a durable queue (BullMQ, etc.) once a missed webhook actually
  matters.
- **Database**: SQLite is configured for zero-friction local dev. Swap the
  `datasource` in `packages/server/prisma/schema.prisma` to Postgres for
  anything beyond a single instance.
- **Widget hosting**: the demo loads `dist/web-chat.js` from a local static
  server. For real integrators you'd publish the built bundle to a CDN (or
  npm) and update the snippet in the dashboard's Settings tab accordingly.

## A note on I/O in this sandbox

This code was generated and reviewed in a sandboxed session without outbound
package-registry access, so `npm install` / build / typecheck could not be
run end-to-end here — the review was manual instead. Run `npm run typecheck`
after your first `npm install` and treat anything it flags as the first
thing to fix.
# web-chat
