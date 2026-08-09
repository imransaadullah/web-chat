import { createHmac } from "node:crypto";
import type { VerifiedIdentityPayload } from "@web-chat/shared";
import { IDENTITY_TOKEN_MAX_AGE_SECONDS } from "@web-chat/shared";

/**
 * Identity verification: a tenant's backend signs a short-lived payload
 * proving who a visitor actually is (see VerifiedIdentityPayload in
 * @web-chat/shared for why this is a signed token, not a live callback).
 *
 * Token shape is a minimal HS256-style construction — base64url(payload)
 * + "." + hex(HMAC-SHA256(secretKey, payload)) — deliberately not a full
 * JWT: no algorithm-negotiation field for a caller to downgrade, no
 * library dependency, and it reuses the exact signing shape already used
 * for webhooks (`webhooks.ts`), so there's one HMAC pattern to reason
 * about in this codebase, not two.
 */

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(encodedPayload: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(encodedPayload).digest("hex");
}

/**
 * Reference implementation of what a tenant's backend does to mint a
 * token. Not called by this server at runtime — exported for docs/tests
 * and for `examples/` to demonstrate the real thing tenants need to write
 * in their own stack.
 */
export function signIdentityToken(
  payload: Omit<VerifiedIdentityPayload, "iat" | "exp"> & { exp?: number },
  secretKey: string,
  ttlSeconds = IDENTITY_TOKEN_MAX_AGE_SECONDS,
): string {
  const iat = Math.floor(Date.now() / 1000);
  const full: VerifiedIdentityPayload = {
    ...payload,
    iat,
    exp: payload.exp ?? iat + ttlSeconds,
  };
  const encoded = base64url(JSON.stringify(full));
  return `${encoded}.${sign(encoded, secretKey)}`;
}

/**
 * Verifies a token's signature and freshness and returns its payload, or
 * null if the token is missing, malformed, forged, or expired. Never
 * throws — this sits on a hot path (every conversation-create call) and a
 * bad/expired token should just fall back to anonymous, not 500.
 */
export function verifyIdentityToken(token: string, secretKey: string): VerifiedIdentityPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  const expected = sign(encoded, secretKey);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  let payload: VerifiedIdentityPayload;
  try {
    payload = JSON.parse(fromBase64url(encoded));
  } catch {
    return null;
  }
  if (!payload || typeof payload.userId !== "string" || !payload.userId) return null;
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null; // expired
  if (now - payload.iat > IDENTITY_TOKEN_MAX_AGE_SECONDS) return null; // too old regardless of claimed exp
  if (payload.iat > now + 60) return null; // clock-skew guard against a future-dated token

  return payload;
}
