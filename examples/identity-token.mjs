// Reference implementation of identity-token signing/verification for
// web-chat's identity verification feature.
//
// Run this on YOUR backend (any language — this is just the Node/crypto
// version) once you know who's logged in, then hand the resulting token to
// the page that calls WebChat.init({ identityToken }). It proves who a
// visitor is (instead of trusting a client-supplied id) and can carry a
// `role` that routing rules match on.
//
// Zero dependencies, ~15 lines of actual logic — port it into whatever
// language/framework your backend runs. This mirrors the exact algorithm
// packages/server/src/identity.ts uses to verify, and the HMAC pattern
// already used for webhook signing (examples/webhook-receiver.mjs).
//
// Run: node examples/identity-token.mjs
// Then set WEB_CHAT_SECRET below (or via env) to your app's secretKey.

import { createHmac } from "node:crypto";

const SECRET = process.env.WEB_CHAT_SECRET ?? "sk_replace_me";

function base64url(input) {
  return Buffer.from(input, "utf8").toString("base64url");
}

/**
 * Mints a token for one user. Call this per request/session — tokens are
 * deliberately short-lived (5 minutes by default) so a leaked token (e.g.
 * via a referrer header or browser history) isn't useful for long.
 */
export function signIdentityToken({ userId, name, email, role }, secretKey = SECRET, ttlSeconds = 300) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = { userId, name, email, role, iat, exp: iat + ttlSeconds };
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secretKey).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

// --- Demo ---------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const token = signIdentityToken({
    userId: "user_42",
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "provider", // matched by a RoutingRule in the dashboard's Settings -> Routing
  });

  console.log("Identity token (paste into WebChat.init({ identityToken })):\n");
  console.log(token);
  console.log("\nDecoded payload:\n");
  const [encoded] = token.split(".");
  console.log(JSON.stringify(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")), null, 2));
}
