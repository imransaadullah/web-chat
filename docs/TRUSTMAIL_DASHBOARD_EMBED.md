# Embedding the web-chat dashboard in trustmail

Closes the gap noted in the master-key handoff: the dashboard is now an
importable React component, not only a standalone SPA. trustmail's admin
panel can render it inline — no iframe.

## What changed

`packages/dashboard` now builds two independent outputs:

- **Standalone app** (`npm run build`, unchanged): the self-hosted SPA at
  `dist/`, secret key pasted in and kept in `localStorage`. This is what
  self-hosted/standalone deployments still use.
- **Library** (`npm run build:lib`, new): `dist-lib/`, built with `tsup`.
  Exports a `Dashboard` React component with no `localStorage`, no
  login screen, and no assumption about where the secret key came from —
  the host app supplies it as a prop.

Both builds write to separate output directories (`dist/` vs `dist-lib/`)
so running one doesn't clobber the other.

## Consuming it from trustmail

> **This is a GitHub Packages install, not a public npm package.**
> `@imransaadullah/web-chat-dashboard` is published to GitHub's own npm
> registry, scoped to this repo — a plain `npm install` will 404 until
> trustmail's repo is configured to point that scope at GitHub Packages
> with a read token. See "Installing" immediately below before the code
> example after it will actually resolve.

### Installing

Add a `.npmrc` scoping `@imransaadullah` to GitHub Packages, plus a
read-only [personal access token](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages)
(classic PAT with `read:packages`, from a bot/service account, not a
personal one) with access to this repo:

```
# trustmail-repo/.npmrc
@imransaadullah:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Then a normal dependency. For "always up to date" (every auto-published
build off `main` — see "Releasing" below), install `@latest` explicitly
and re-run `npm install` on trustmail's own deploy; there's no dist-tag
npm will silently track for you otherwise:

```
npm install @imransaadullah/web-chat-dashboard@latest
```

Pinning to a caret range (`^0.1.0`) also works — every auto-published patch
satisfies it — but only picks up new patches when trustmail runs
`npm update`, not automatically.

### Usage

```tsx
import { Dashboard } from "@imransaadullah/web-chat-dashboard";
import "@imransaadullah/web-chat-dashboard/style.css";

function WebChatPanel({ orgId }: { orgId: string }) {
  const { serverUrl, secretKey } = useWebChatCredentials(orgId); // trustmail's own fetch, see below

  return (
    <Dashboard
      serverUrl={serverUrl}
      secretKey={secretKey}
      onAuthError={(err) => reportAndRefetchCredentials(err)}
    />
  );
}
```

`Dashboard` props (`packages/dashboard/src/Dashboard.tsx`):

| prop | required | purpose |
|---|---|---|
| `serverUrl` | yes | Base URL of the web-chat server this org's `App` lives on. |
| `secretKey` | yes | The org's `App.secretKey`. Never persisted by `Dashboard` — the host owns it. |
| `identityToken` | no | Same deep-link identity token the standalone app reads from `?identityToken=`. |
| `onAuthError` | no | Called if `secretKey` is rejected (revoked, wrong org). `Dashboard` renders a minimal inline error regardless; use this to re-fetch a key or show trustmail's own error UI. |
| `onLogout` | no | Shows a "Log out" button in the sidebar wired to this when provided; hidden otherwise, since trustmail owns the session, not `Dashboard`. |

`react` and `react-dom` (`^18.3.1`) are `peerDependencies`, not bundled — trustmail's own React instance is reused, avoiding duplicate-React / "Invalid hook call" issues.

### Getting `serverUrl` + `secretKey`

Both come from the master-key path already built (`auth.ts`'s
`resolveMasterKeyApp`), called **server-side** from trustmail-api, never
from the browser:

```
GET /api/apps/me
x-webchat-master: <WEBCHAT_MASTER_KEY>
x-trustmail-org: <orgId>
```

Auto-provisions the `App` on first call and returns `secretKey` (and
`publicKey`, for the org's own widget embed snippet — unrelated, unaffected
by this change). trustmail's backend fetches this once per org (subscribe
time, or lazily on first dashboard load, cached per its own policy) and
hands `secretKey` down to the already-authenticated browser session — the
same trust boundary the standalone app's "paste your secret key" flow has
always had, not a new or weaker one. `WEBCHAT_MASTER_KEY` itself must never
reach the browser.

### `serverUrl` must be browser-reachable

This is inherited from the existing widget-sdk embed, not new: `Dashboard`
talks to `serverUrl` directly from the browser (REST + a socket.io
connection for live updates), so it can't be the internal
`127.0.0.1`-only address from TRUSTMAIL_SERVICE_GUIDE.md §1. Pick one:

- Reverse-proxy a path (e.g. `/webchat-api/*` and its websocket upgrade) on
  trustmail's own public domain through to the internal service, and set
  `serverUrl` to that public path; or
- Expose web-chat's server on its own subdomain with `CORS_ORIGIN` locked
  to trustmail's admin panel origin.

Either way, `WEBCHAT_MASTER_KEY` is still only ever sent server-to-server
(step above) — the browser's traffic to `serverUrl` authenticates with
`secretKey`/`x-app-secret`, same as any other dashboard session.

## Packaging: GitHub Packages

Published as `@imransaadullah/web-chat-dashboard` on GitHub Packages'
npm registry (`https://npm.pkg.github.com`) — scoped to `@imransaadullah`
because GitHub Packages requires a scoped package's scope to match the
repository owner exactly, not an arbitrary org name like `@web-chat`. (See
"Installing" above for how trustmail's repo consumes it — this section is
the CI/publishing side, on web-chat's end.)

Note the internal workspace package is still named `@web-chat/shared` etc.
internally — only the dashboard's *published* artifact needed renaming,
since it's the only one leaving the monorepo. `@web-chat/shared` (types +
a couple of constants, no runtime deps of its own) is bundled directly
into `dist-lib/lib.{js,cjs}` at build time (`tsup.config.ts`'s
`noExternal`) rather than left as an external dependency — it's
unpublished and workspace-only, so trustmail's `npm install` could never
have resolved it otherwise. `socket.io-client` and the `react`/`react-dom`
peer deps stay external as normal, since those are real public packages
trustmail already has or can install plainly.

**Releasing** (`.github/workflows/publish-dashboard.yml`) is fully
automatic — no tag or manual version bump: every push to `main` that
touches `packages/dashboard/**` or `packages/shared/**` (the one it
bundles) typechecks, builds `dist-lib/`, and publishes, authenticated via
the workflow's own `GITHUB_TOKEN` (`packages: write` permission) — no
separate registry secret to manage. Each publish's patch version is that
run's `github.run_number` (monotonically increasing, unique, never
committed back to the repo — only the ephemeral CI checkout's
`package.json` is touched); the major.minor still comes from
`packages/dashboard/package.json` and is only bumped by hand for an
intentional breaking/feature release. `npm publish` moves the `latest`
dist-tag to whatever it just published, so `@latest` always resolves to
the newest build from `main`.
