import type { PageSnapshot } from "@web-chat/shared";
import { MAX_SNAPSHOT_BYTES } from "@web-chat/shared";

/**
 * Serializes a captured page snapshot for storage, dropping it if it's
 * unreasonably large. Peripheral feature — an oversized snapshot should
 * never fail the surrounding request (creating a conversation, sharing
 * context), just silently go without one.
 */
export function serializePageSnapshot(
  snapshot: PageSnapshot | null | undefined,
  logger?: { warn: (msg: string) => void },
): string | undefined {
  if (!snapshot) return undefined;
  const json = JSON.stringify(snapshot);
  if (json.length > MAX_SNAPSHOT_BYTES) {
    logger?.warn(`[pageSnapshot] dropping oversized snapshot (${json.length} bytes)`);
    return undefined;
  }
  return json;
}
