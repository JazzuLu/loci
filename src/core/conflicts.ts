import type { IndexRecord } from "./schema.js";
import type { ConflictPolicy } from "./types.js";

/**
 * Find records in `existingRecords` that have the same
 * source_system + source_object_id as `newRecord`.
 */
export function detectDuplicates(
  newRecord: IndexRecord,
  existingRecords: IndexRecord[],
): IndexRecord[] {
  return existingRecords.filter(
    (r) =>
      r.record_id !== newRecord.record_id &&
      r.source_system === newRecord.source_system &&
      r.source_object_id === newRecord.source_object_id,
  );
}

/**
 * Returns true when the record's stored version_hash differs from
 * the hash observed at the source (indicating the source has changed).
 */
export function detectStale(record: IndexRecord, currentHash: string): boolean {
  return record.version_hash !== currentHash;
}

/**
 * Apply a conflict resolution policy.
 *
 * - source_wins   → return the incoming source record unchanged
 * - latest_wins   → compare updated_at timestamps, return the newer one
 * - manual_review → set existing record status to "conflicted" and return it
 * - luci_wins     → return the existing (canonical) record unchanged
 * - scoped_merge  → treated as manual_review (merge logic is caller's responsibility)
 */
export function resolveConflict(
  policy: ConflictPolicy,
  source: IndexRecord,
  existing: IndexRecord,
): IndexRecord {
  switch (policy) {
    case "source_wins":
      return source;

    case "latest_wins": {
      const sourceTime = new Date(source.updated_at).getTime();
      const existingTime = new Date(existing.updated_at).getTime();
      return sourceTime >= existingTime ? source : existing;
    }

    case "manual_review":
    case "scoped_merge":
      return { ...existing, status: "conflicted" };

    case "luci_wins":
      return existing;
  }
}

/**
 * Run post-write checks against all known records.
 * Returns:
 *  - duplicates: existing records sharing the same source coordinates
 *  - stale: whether newRecord's version_hash differs from the canonical hash
 *    (we use newRecord.version_hash as the "current" hash for the check; callers
 *     can pass an override via the optional currentHash parameter)
 *  - superseded: active records that newRecord explicitly supersedes
 */
export function runPostWriteChecks(
  newRecord: IndexRecord,
  allRecords: IndexRecord[],
  currentHash?: string,
): {
  duplicates: IndexRecord[];
  stale: boolean;
  superseded: IndexRecord[];
} {
  const others = allRecords.filter((r) => r.record_id !== newRecord.record_id);

  const duplicates = detectDuplicates(newRecord, others);

  const stale = detectStale(newRecord, currentHash ?? newRecord.version_hash);

  // Records that newRecord explicitly declares it supersedes and are still active
  const supersededIds = new Set(newRecord.supersedes ?? []);
  const superseded = others.filter(
    (r) => supersededIds.has(r.record_id) && r.status === "active",
  );

  return { duplicates, stale, superseded };
}
