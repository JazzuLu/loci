import { createHash } from "node:crypto";

/**
 * Compute a normalized SHA-256 hash for content.
 * Normalizes line endings (CRLF -> LF), trims trailing whitespace,
 * and encodes as UTF-8 before hashing.
 */
export function contentHash(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const hash = createHash("sha256").update(normalized, "utf-8").digest("hex");
  return `sha256:${hash}`;
}

/** Generate a prefixed record ID */
export function generateRecordId(): string {
  const bytes = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
  return `rec_${bytes}`;
}
