# Spec: A wallet-billed notification-email endpoint for web-chat

**Audience:** trustmail-api team
**Author:** web-chat integration (written while scoping web-chat as a TrustMail-hosted service, per `TRUSTMAIL_SERVICE_GUIDE.md`)
**Status:** Proposal — no code in the web-chat repo depends on it existing yet

---

## 1. The problem, concretely

web-chat needs to email a human when a customer-support conversation goes unanswered (e.g. a visitor's message sits unreplied for N minutes). That email has to be billed to the org's TrustMail wallet — per the service guide's billing model, web-chat is `exemptFromCharges: true` and never touches billing itself; TrustMail owns the wallet.

web-chat cannot simply send this email itself (e.g. straight to local Postfix on the shared VPS). That would deliver the email but leave zero billing record — nothing would debit the org's wallet, and the wallet is the actual point of this ecosystem's monetization for add-on services.

So the send has to be a call *into* trustmail-api, which owns both the wallet and the mail-sending capability, and which can debit-and-send as a single atomic operation.

## 2. Precedent already in this codebase

This is not a new shape — SMS sending inside trustmail-api already solves the identical problem:

- `api/lib/addonQuota.js`: `getBalance(orgId, addonType)` / `deductBalance(orgId, addonType, amount, reason)` — generic prepaid-wallet primitives, already addon-type-agnostic.
- `api/lib/sms.js`: `sendSms(orgId, to, message)` — checks balance, delivers, deducts 1 credit, logs an `AddonTransaction` via `deductBalance`, returns `{ ok, creditsUsed, remainingBalance, reference }` or `null` on insufficient balance.
- `api/routes/addons.js` (`POST /api/addons/sms/send`): thin route wrapper around `sendSms`, returns `402` with the current balance when `sendSms` returns `null`.

The proposal below is the same pattern, generalized to email and called by an internal service instead of an interactive org-admin request.

## 3. Proposed endpoint

```
POST /internal/webchat/notify-email
```

- **Auth:** master-key gate, same shape as the rest of `TRUSTMAIL_SERVICE_GUIDE.md` §3 (an `x-webchat-master` header, long-lived secret generated once via `openssl rand -hex 32`, stored in trustmail's env, validated the same way `x-authcore-master` is). **Not** `req.user`/session auth — the caller is web-chat's own backend process, not a logged-in org member, so there's no session to check.
- **Listens on loopback only**, same as every other internal route in the guide.

### Request body

```json
{
  "orgId": "org_uuid",
  "to": "agent@theircompany.com",
  "subject": "New message needs a reply",
  "html": "<p>...</p>",
  "text": "...",
  "idempotencyKey": "conv_abc123:2026-08-08T19:40:00Z"
}
```

- `orgId` — which org's wallet to debit. web-chat already knows this from its own `App`/org mapping.
- `to` — resolved entirely on web-chat's side (its own `ResponderGroup.notifyEmail` or a `PlatformUser.email` for DM alerts) — trustmail-api doesn't need to know or care who this is, it's just an address.
- `idempotencyKey` — see §5, not present in the SMS precedent but needed here.

### Response

Mirrors `sendSms`'s shape:

```json
// 200 — sent and billed
{ "ok": true, "messageId": "...", "creditsUsed": 1, "remainingBalance": 42 }

// 402 — insufficient balance, nothing sent, nothing debited
{ "error": "Insufficient email credit.", "balance": 0 }
```

### Server-side logic (mirrors `sendSms` exactly)

1. `getBalance(orgId, 'email')` (or a dedicated `webchat_email` addon type — see §4).
2. If insufficient → `402`, no send attempted.
3. Send via trustmail-api's existing provider chain (the same Postfix/TrustMail/Resend/SMTP path AuthCore's `sendViaTrustmail`/`sendViaSmtp` already implement), `from: webchat@trustmail.ng`.
4. **On confirmed delivery success**, `deductBalance(orgId, addonType, 1, 'webchat_notification')`.
5. Return the result.

Note the ordering flip from step 4 vs. `sendSms`: the SMS stub deducts unconditionally after a mock "delivery" that can't fail, so send-then-deduct is safe there. A real transport can fail after accepting the request (provider rejects, times out, etc.) — deduct only after a confirmed send, so a failed send never bills the org.

## 4. Addon type: reuse `email`, or add `webchat_email`?

The service guide's own example env (`TRUSTMAIL_SERVICE_GUIDE.md` §5.1) already anticipates a generic `EMAIL_COST_PER_UNIT=50` (₦0.50/kobo) alongside `SMS_COST_PER_UNIT` — suggesting a generic `email` addon type was already expected to exist, not something webchat-specific. Whether to reuse a shared `email` wallet type (so any future service's email sends draw from the same balance) or give web-chat its own `webchat_email` type (cleaner cost attribution per service, matches how `mailbox` and `sms` are already separate types) is a trustmail-api-side product decision — either works from web-chat's side, it's just the `addonType` string passed around internally.

Either way, this needs a catalog entry in `PlatformSettings.addonCatalog` (via the existing `POST /api/addons/admin/catalog`) so orgs can actually top up the balance — no schema change required for that part, per the existing catalog design.

## 5. Idempotency (new concern, not present in the SMS precedent)

`dispatchWebhook`-style fire-and-forget retries (web-chat's existing webhook dispatch already does 3 attempts with backoff) mean this call could legitimately be retried by web-chat after a timeout even though the first attempt succeeded server-side. Without an idempotency key, a retry double-sends and double-bills. Recommend: `idempotencyKey` in the request body, checked against a short-lived record (e.g. an existing `AddonTransaction.referenceId` uniqueness constraint, or a small Redis dedupe key with a few minutes' TTL) before debiting — return the original result on a duplicate rather than sending/billing again.

## 6. What web-chat does NOT need from trustmail-api

To be explicit about scope: this endpoint only needs to accept `orgId` + message content and return success/failure. It does **not** need to expose org member lists, domain/mailbox data, or anything else — all recipient resolution happens inside web-chat's own data (routing rules, responder groups, verified-identity participant emails). This keeps the new surface area on the trustmail-api side minimal.
