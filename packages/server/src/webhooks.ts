import { createHmac, randomUUID } from "node:crypto";
import type {
  WebhookEvent,
  WebhookEventType,
} from "@web-chat/shared";
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "@web-chat/shared";

/**
 * Fires a signed webhook for an app, if it has a webhookUrl configured.
 *
 * Signing follows the same shape as Stripe/GitHub-style webhooks: sign
 * `${timestamp}.${rawBody}` with HMAC-SHA256 using the app's secret key, so
 * receivers can verify authenticity and reject replays.
 *
 * This is deliberately fire-and-forget with a short timeout and a couple of
 * retries — a slow or dead receiver should never block chat itself. For a
 * production deployment you'd want a durable queue (BullMQ, etc.) instead of
 * best-effort in-process retries; this is intentionally the simplest thing
 * that could work for an MVP.
 */
export async function dispatchWebhook<T>(params: {
  webhookUrl: string | null | undefined;
  secretKey: string;
  appId: string;
  type: WebhookEventType;
  data: T;
}): Promise<void> {
  const { webhookUrl, secretKey, appId, type, data } = params;
  if (!webhookUrl) return;

  const event: WebhookEvent<T> = {
    id: randomUUID(),
    type,
    appId,
    createdAt: new Date().toISOString(),
    data,
  };

  const rawBody = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secretKey)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [WEBHOOK_SIGNATURE_HEADER]: signature,
          [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
        },
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return;
      // Non-2xx: fall through to retry.
    } catch {
      // Network error / timeout: fall through to retry.
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  // Swallow final failure — a webhook receiver being down should not break
  // the chat experience. In production, log this to somewhere durable.
}

/**
 * Reference implementation for receivers: verify a webhook signature.
 * Not used by the server itself, but exported so integrators (and the
 * example receiver in /examples) can share the exact same logic.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string;
  timestamp: string;
  secretKey: string;
  toleranceSeconds?: number;
}): boolean {
  const { rawBody, signature, timestamp, secretKey, toleranceSeconds = 300 } =
    params;

  const now = Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceSeconds) {
    return false;
  }

  const expected = createHmac("sha256", secretKey)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
