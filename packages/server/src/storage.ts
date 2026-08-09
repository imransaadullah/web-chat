import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "minio";

/**
 * File storage for chat attachments. S3-compatible (MinIO) in production —
 * same env var names as trustmail-api's own `lib/s3Storage.js`
 * (S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET/S3_REGION/S3_USE_SSL),
 * so once web-chat runs as a trustmail-hosted service sharing that env,
 * this is a zero-config drop-in against the same bucket/instance.
 *
 * Falls back to local disk when S3 isn't configured, so attachments work in
 * plain local dev without standing up MinIO — same "stub when unconfigured"
 * shape webhooks/identity already use elsewhere in this codebase.
 */

const uploadsDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "uploads");

let client: Client | null = null;

function s3Config() {
  return {
    endpoint: process.env.S3_ENDPOINT || null,
    accessKey: process.env.S3_ACCESS_KEY || null,
    secretKey: process.env.S3_SECRET_KEY || null,
    bucket: process.env.S3_BUCKET || null,
    region: process.env.S3_REGION || "us-east-1",
    useSSL: process.env.S3_USE_SSL !== "false",
  };
}

export function isS3Configured(): boolean {
  const cfg = s3Config();
  return !!(cfg.endpoint && cfg.accessKey && cfg.secretKey && cfg.bucket);
}

function getClient(): Client | null {
  if (!isS3Configured()) return null;
  if (client) return client;
  const cfg = s3Config();
  const endpoint = String(cfg.endpoint).replace(/^https?:\/\//, "").replace(/\/$/, "");
  const [host, port] = endpoint.split(":");
  client = new Client({
    endPoint: host,
    port: port ? Number(port) : cfg.useSSL ? 443 : 80,
    useSSL: cfg.useSSL,
    accessKey: cfg.accessKey!,
    secretKey: cfg.secretKey!,
    region: cfg.region,
  });
  return client;
}

async function ensureBucket(): Promise<void> {
  const c = getClient();
  const bucket = s3Config().bucket;
  if (!c || !bucket) return;
  const exists = await c.bucketExists(bucket).catch(() => false);
  if (!exists) await c.makeBucket(bucket, s3Config().region);
}

export interface StoredFile {
  /** Opaque key to hand back to downloadUrl()/deleteFile() later. */
  key: string;
}

/**
 * Stores a file under a conversation-scoped key (`webchat/{conversationId}/{uuid}-{filename}`)
 * so keys can't collide with anything else that might share the bucket.
 */
export async function storeFile(params: {
  conversationId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
}): Promise<StoredFile> {
  const { conversationId, filename, contentType, buffer } = params;
  const key = `webchat/${conversationId}/${randomUUID()}-${sanitizeFilename(filename)}`;

  const c = getClient();
  if (c) {
    await ensureBucket();
    await c.putObject(s3Config().bucket!, key, buffer, buffer.length, {
      "Content-Type": contentType,
    });
    return { key };
  }

  const localPath = join(uploadsDir, key);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, buffer);
  return { key };
}

/** Resolves a stored key to something the caller can fetch the bytes from. */
export async function resolveFile(
  key: string,
): Promise<{ kind: "url"; url: string } | { kind: "buffer"; buffer: Buffer }> {
  const c = getClient();
  if (c) {
    const url = await c.presignedGetObject(s3Config().bucket!, key, 3600);
    return { kind: "url", url };
  }
  const buffer = await readFile(join(uploadsDir, key));
  return { kind: "buffer", buffer };
}

export async function deleteFile(key: string): Promise<void> {
  const c = getClient();
  if (c) {
    await c.removeObject(s3Config().bucket!, key).catch(() => {});
    return;
  }
  await rm(join(uploadsDir, key), { force: true });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}
