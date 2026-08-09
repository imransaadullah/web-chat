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
  pageSnapshot?: PageSnapshot;      // structural DOM capture — see below
  capturedAt: string;
}
```

Host apps call `WebChat.setContext(payload)` whenever their view/filters
change (ambient — doesn't interrupt the thread), and
`WebChat.shareContext(payload?)` when the user explicitly wants to hand it
to the agent (falls back to the last `setContext` payload if none given).

### Page snapshots — for when the agent has no access to the host app

`url` is a nice-to-have deep link, but it's useless if the agent doesn't
have their own login into the host app. So on `shareContext()` (and on the
first message of a conversation), the widget SDK also walks the visitor's
DOM and captures a `PageSnapshot`: tag name + text content + a small
allowlist of *computed* style properties per node, as plain JSON — see
`packages/widget-sdk/src/snapshot.ts`.

This is deliberately **not** "capture `outerHTML` and render it (even in a
sandboxed iframe) on the receiving end." A sandboxed iframe still lets
captured `<img>`/`<link>`/CSS `url(...)` issue real network requests from
the agent's browser back out to wherever those URLs point — which both
defeats the "agent has no access" premise and opens a beaconing/exfiltration
vector if a visitor's page (or a malicious visitor) crafts those URLs.
Instead the dashboard renders the JSON tree through its own small set of
React elements (`packages/dashboard/src/components/SnapshotRenderer.tsx`) —
never `innerHTML`, never a fetch, unmapped/form tags fall back to inert
`<span>`s. Layout fidelity is approximate (only container-relative style
props are kept — `width`/`height`/`margin` are dropped because `getComputedStyle`
resolves `auto` against the *visitor's* viewport, which is meaningless once
replayed in a differently-sized panel) in exchange for zero ambient
authority: the dashboard makes no network request to render it at all.
`pageSnapshot` is stripped from webhook payloads (see `toWebhookContextDTO`
in `mappers.ts`) since it's a dashboard-only render payload, not something
to forward to third-party ticketing systems by default.

## Identity verification, routing, and pre-chat capture

Beyond visitor-support chat, web-chat can also work as in-house/authenticated
communication: a tenant's own backend vouches for who's chatting, and that
identity drives which admin queue a conversation lands in.

**Identity verification** (`packages/server/src/identity.ts`,
`examples/identity-token.mjs`): the tenant's backend signs a short-lived
`VerifiedIdentityPayload` (`userId`, `name`, `email`, `role`, `iat`/`exp`)
with the app's own `secretKey` and hands the resulting token to
`WebChat.init({ identityToken })`. The server verifies the signature and
freshness (5-minute max age, mirrors the webhook signature's replay window)
and — if valid — ignores whatever the client claims in `visitor` entirely,
using the verified identity instead.

This is deliberately a **signed token, not a live "call our API to verify
this session" callback**: a callback makes every chat init depend on the
tenant's API being reachable and fast, and means trusting an outbound URL
call initiated by us. A signed token needs no network round-trip on either
side and reuses the exact HMAC pattern already used for webhook signing —
one signing mechanism to reason about in this codebase, not two.

A verified identity is upserted lazily into `PlatformUser` — the first time
a valid token for a given `userId` shows up, not via any bulk directory
sync/import endpoint. There's no "load all our users in" step.

**Routing** (`ResponderGroup` / `RoutingRule`, configured in the dashboard's
Settings → Routing): a verified user's `role` (e.g. `"provider"`) is matched
against routing rules to a responder group (a named admin-side queue), set
on the conversation at creation time. The dashboard's Inbox can filter to
one queue via `GET /api/conversations?responderGroupId=...`, so e.g.
provider messages only show up for the admins staffing "Provider Support."

**Pre-chat capture** (dashboard Settings → Pre-chat form): for visitors the
widget can't otherwise identify — no identity token, no host-supplied
`visitor.id`, e.g. a public marketing/landing page — configure a small form
(name/email/etc.) the widget shows before relaying the visitor's first
message, so there's at least a name and a way to reach them. Only `name`/
`email` keys currently map onto stored visitor identity.

**Admin identity**: the same signed-token mechanism also identifies whoever's
*using* the dashboard — deep-link into it with `?identityToken=...` (any
`role`, e.g. `"admin"`) and it resolves once at load into a real
`PlatformUser`, shown in Settings → Identity verification. Deliberately
resolved once, not re-verified per request: tokens are short-lived (5
minutes) by design, but a dashboard session lasts a shift, so the resolved
`PlatformUser.id` is what gets attached to messages an admin sends from then
on (the existing `agentId` field) — same trust boundary as before
(`secretKey` is what actually authorizes the dashboard; the resolved
identity is an attribution label on top of that, not a fresh proof-of-identity
on every send). No identity token still works exactly as before — replies
just go out unattributed (`authorId: "agent"`).

### Sharing a page from the admin side

An admin can share a page from *their own* internal tools — a site web-chat
was never embedded on and can't reach into — via the "Share a page" button
on an open conversation. This is deliberately not a live cross-tab handshake;
it's two steps:

1. The dashboard mints a short-lived (10 min), single-use, conversation-
   scoped `ShareToken` (`packages/server/src/routes/shareTokens.ts`) —
   requires a *fresh* identity token (unlike message-sending above), since
   this is an occasional action, not something sent on every keystroke.
2. A static, reusable bookmarklet — installed once, shown in the same
   modal — loads `packages/widget-sdk/src/bookmarklet.ts` (built as
   `dist/bookmarklet.js`, hosted wherever you publish `web-chat.js` itself)
   on whatever page the admin is looking at. It runs the exact same
   `capturePageSnapshot()` the visitor widget uses, prompts for the token
   copied from the dashboard, and POSTs straight to the conversation the
   token was scoped to — no ambiguity about which conversation it lands in,
   same as the visitor's own `shareContext()` flow.

The capture endpoint (`POST /api/share-tokens/:token/capture`) is
deliberately public — no app key — since it's called from a third-party
page we have no other credential for. The token itself is the entire
credential, which is exactly why it's short-lived and single-use rather
than a general-purpose API key.

## Team chat (staff-to-staff)

Additive to, and completely separate from, the visitor<->admin support flow
above — the dashboard's "Team" tab is DMs and group chat between an app's own
verified staff, with no visitor/agent asymmetry. Every participant is a
`PlatformUser` (same identity-token mechanism used for admin identity and
visitor routing), so this needs at least two people who've had their
identity resolved at least once (see Identity verification above) before
either shows up in the other's people-picker.

`Conversation` gained a `kind: "support" | "team"` discriminator — one table
for both, since `Message` already references `Conversation` generically and
a second, separate conversation type would mean either duplicating
messaging end-to-end or a relation Prisma can't express cleanly. `kind:
"support"` conversations are completely unchanged; the support inbox
(`GET /api/conversations`) explicitly filters to that kind so team DMs never
mix into it.

Starting a DM between the same two people reuses the existing thread rather
than creating a new one each time (`POST /api/team/conversations`); group
conversations (3+ participants, optional `title`) work the same way minus
the reuse. `packages/server/src/routes/team.ts` has the full route list.

**Also available from the widget, not just the dashboard.** The widget's
small panel gains a "Chat / Team" tab bar whenever it's initialized with an
`identityToken` — a compact conversation list (with a "+ New" people-picker)
that swaps to a thread view on selection, reusing the exact same
capture/render/socket machinery as the support side. This only appears for
a resolved identity; an anonymous visitor's panel is pixel-identical to
before, zero added footprint. See `packages/widget-sdk/src/index.ts`'s
`handleTabChange`/`openTeamConversation` for the list<->thread navigation.

**On privacy**: every team-chat route accepts either key (public or secret),
but requires the *caller's own* resolved identity token regardless — there's
no client-supplied user id anywhere in these routes; the list endpoint,
message authorship, and the participant check on posting (a non-participant
gets 403, tested) all derive "who is this" from the verified token, never
from a query param or request body. That's what makes it safe to expose
beyond the secretKey-holding dashboard to a public-key widget instance: a
public key with no valid identity token can't create, list, or post
anything here. Same directory endpoint (`GET /api/users`) backing the
people-picker follows the same rule — reachable from either side, but only
once you're a verified member of the app.

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

- **Visitor auth**: identity verification (see above) solves this when a
  tenant opts in — a verified `visitor.id` can't be spoofed. But it's
  opt-in, not enforced: a widget init with no `identityToken` still falls
  back to trusting whatever client-supplied `visitor.id` shows up, scoped
  only by the app's public key. Anyone building customer-facing chat should
  require `identityToken` server-side (reject conversation-create calls
  without one) rather than leaving the fallback reachable.
- **Onboarding**: `POST /api/apps` (creating a new app/workspace) is
  currently open — wire it up behind your own account system before
  exposing it publicly.
- **Page snapshots are approximate, not pixel-perfect**: images render as
  `[image: alt text]` placeholders (never fetched), custom `@font-face`s
  aren't captured, and layout is best-effort since `width`/`height`/`margin`
  are intentionally dropped from the captured style set. It's meant to give
  an agent the gist of what a visitor was looking at, not a pixel-accurate
  replica.
- **Webhook delivery**: dispatch is fire-and-forget with a few in-process
  retries (see `dispatchWebhook` in `webhooks.ts`). Good enough for a demo;
  swap in a durable queue (BullMQ, etc.) once a missed webhook actually
  matters.
- **Database**: SQLite is configured for zero-friction local dev. Swap the
  `datasource` in `packages/server/prisma/schema.prisma` to Postgres for
  anything beyond a single instance.
- **Widget hosting**: the demo loads `dist/web-chat.js` from a local static
  server. For real integrators you'd publish the built bundle to a CDN (or
  npm) and update the snippet in the dashboard's Settings tab accordingly —
  same applies to `dist/bookmarklet.js`.
- **Sharing bookmarklet UX**: the admin pastes the share token by hand into
  a `prompt()` dialog each time, rather than it being carried automatically.
  That's a deliberate v1 tradeoff (keeps the bookmarklet itself static and
  installed once, with no cross-tab signaling machinery), not a polished
  final UX.
- **No way to mint admin identity tokens from the dashboard itself**: like
  the visitor-side identity flow, the host app's own backend is expected to
  sign these (`examples/identity-token.mjs`). For local testing without a
  host app in the loop, mint one with that script and append it to the
  dashboard's URL as `?identityToken=...`.

## A note on I/O in this sandbox

This code was generated and reviewed in a sandboxed session without outbound
package-registry access, so `npm install` / build / typecheck could not be
run end-to-end here — the review was manual instead. Run `npm run typecheck`
after your first `npm install` and treat anything it flags as the first
thing to fix.
# web-chat
