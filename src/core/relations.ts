import type { IndexRecord } from "./schema.js";

/**
 * Link two records as duplicates of each other.
 * Adds each record's ID to the other's `duplicates` array.
 */
export function linkDuplicate(
  existing: IndexRecord,
  duplicate: IndexRecord,
): { existing: IndexRecord; duplicate: IndexRecord } {
  const updatedExisting: IndexRecord = {
    ...existing,
    duplicates: [...(existing.duplicates ?? []), duplicate.record_id],
  };
  const updatedDuplicate: IndexRecord = {
    ...duplicate,
    duplicates: [...(duplicate.duplicates ?? []), existing.record_id],
  };
  return { existing: updatedExisting, duplicate: updatedDuplicate };
}

/**
 * Link two records in a supersession relationship.
 * The old record gets status "superseded" and has its `superseded_by` array updated.
 * The new record gets the old record's ID added to its `supersedes` array.
 */
export function linkSupersession(
  oldRecord: IndexRecord,
  newRecord: IndexRecord,
): { old: IndexRecord; new: IndexRecord } {
  const updatedOld: IndexRecord = {
    ...oldRecord,
    status: "superseded",
    superseded_by: [...(oldRecord.superseded_by ?? []), newRecord.record_id],
  };
  const updatedNew: IndexRecord = {
    ...newRecord,
    supersedes: [...(newRecord.supersedes ?? []), oldRecord.record_id],
  };
  return { old: updatedOld, new: updatedNew };
}

/**
 * Link two records as contradicting each other.
 * Adds each record's ID to the other's `contradicts` array.
 */
export function linkContradiction(
  a: IndexRecord,
  b: IndexRecord,
): { a: IndexRecord; b: IndexRecord } {
  const updatedA: IndexRecord = {
    ...a,
    contradicts: [...(a.contradicts ?? []), b.record_id],
  };
  const updatedB: IndexRecord = {
    ...b,
    contradicts: [...(b.contradicts ?? []), a.record_id],
  };
  return { a: updatedA, b: updatedB };
}

/**
 * Link two records in a support relationship.
 * Adds each record's ID to the other's `supports` array.
 */
export function linkSupport(
  a: IndexRecord,
  b: IndexRecord,
): { a: IndexRecord; b: IndexRecord } {
  const updatedA: IndexRecord = {
    ...a,
    supports: [...(a.supports ?? []), b.record_id],
  };
  const updatedB: IndexRecord = {
    ...b,
    supports: [...(b.supports ?? []), a.record_id],
  };
  return { a: updatedA, b: updatedB };
}
