import { describe, it, expect } from "vitest";
import type { IndexRecord } from "../../src/core/schema.js";
import {
  detectDuplicates,
  detectStale,
  resolveConflict,
  runPostWriteChecks,
} from "../../src/core/conflicts.js";
import {
  linkDuplicate,
  linkSupersession,
  linkContradiction,
  linkSupport,
} from "../../src/core/relations.js";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

let _seq = 0;
function makeRecord(overrides: Partial<IndexRecord> = {}): IndexRecord {
  const id = `rec-${++_seq}`;
  return {
    record_id: id,
    source_system: "claude-code",
    source_object_id: `obj-${id}`,
    source_path: `/project/memory/${id}.md`,
    scope: "project",
    kind: "fact",
    truth_mode: "canonical",
    status: "active",
    title: `Record ${id}`,
    summary: `Summary for ${id}`,
    keywords: ["test", "fixture"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    capture_mode: "manual",
    version_hash: "hash-v1",
    preferred_write_target: "loci-index",
    sync_strategy: "manual_only",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectDuplicates
// ---------------------------------------------------------------------------

describe("detectDuplicates", () => {
  it("returns empty array when no records share source coordinates", () => {
    const newRec = makeRecord({ source_system: "system-a", source_object_id: "obj-unique" });
    const existing = [
      makeRecord({ source_system: "system-b", source_object_id: "obj-unique" }),
      makeRecord({ source_system: "system-a", source_object_id: "obj-other" }),
    ];
    expect(detectDuplicates(newRec, existing)).toHaveLength(0);
  });

  it("detects a record with the same source_system + source_object_id", () => {
    const newRec = makeRecord({ source_system: "system-a", source_object_id: "shared-obj" });
    const twin = makeRecord({ source_system: "system-a", source_object_id: "shared-obj" });
    const unrelated = makeRecord({ source_system: "system-a", source_object_id: "other-obj" });
    const result = detectDuplicates(newRec, [twin, unrelated]);
    expect(result).toHaveLength(1);
    expect(result[0]!.record_id).toBe(twin.record_id);
  });

  it("does not include newRecord itself even if present in existingRecords", () => {
    const rec = makeRecord({ source_system: "s", source_object_id: "o" });
    expect(detectDuplicates(rec, [rec])).toHaveLength(0);
  });

  it("returns multiple duplicates when several records match", () => {
    const newRec = makeRecord({ source_system: "sys", source_object_id: "shared" });
    const twins = [
      makeRecord({ source_system: "sys", source_object_id: "shared" }),
      makeRecord({ source_system: "sys", source_object_id: "shared" }),
    ];
    expect(detectDuplicates(newRec, twins)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// detectStale
// ---------------------------------------------------------------------------

describe("detectStale", () => {
  it("returns false when hashes match", () => {
    const rec = makeRecord({ version_hash: "abc123" });
    expect(detectStale(rec, "abc123")).toBe(false);
  });

  it("returns true when version_hash has changed at source", () => {
    const rec = makeRecord({ version_hash: "old-hash" });
    expect(detectStale(rec, "new-hash")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveConflict
// ---------------------------------------------------------------------------

describe("resolveConflict", () => {
  it("source_wins: returns the incoming source record", () => {
    const source = makeRecord({ title: "source" });
    const existing = makeRecord({ title: "existing" });
    const result = resolveConflict("source_wins", source, existing);
    expect(result.record_id).toBe(source.record_id);
  });

  it("luci_wins: returns the existing (canonical) record", () => {
    const source = makeRecord({ title: "source" });
    const existing = makeRecord({ title: "existing" });
    const result = resolveConflict("luci_wins", source, existing);
    expect(result.record_id).toBe(existing.record_id);
  });

  it("latest_wins: returns source when source is newer", () => {
    const source = makeRecord({ updated_at: "2026-06-01T00:00:00Z" });
    const existing = makeRecord({ updated_at: "2026-01-01T00:00:00Z" });
    const result = resolveConflict("latest_wins", source, existing);
    expect(result.record_id).toBe(source.record_id);
  });

  it("latest_wins: returns existing when existing is newer", () => {
    const source = makeRecord({ updated_at: "2026-01-01T00:00:00Z" });
    const existing = makeRecord({ updated_at: "2026-06-01T00:00:00Z" });
    const result = resolveConflict("latest_wins", source, existing);
    expect(result.record_id).toBe(existing.record_id);
  });

  it("latest_wins: returns source on equal timestamps", () => {
    const ts = "2026-03-01T00:00:00Z";
    const source = makeRecord({ updated_at: ts });
    const existing = makeRecord({ updated_at: ts });
    const result = resolveConflict("latest_wins", source, existing);
    expect(result.record_id).toBe(source.record_id);
  });

  it("manual_review: sets status to conflicted on existing record", () => {
    const source = makeRecord();
    const existing = makeRecord({ status: "active" });
    const result = resolveConflict("manual_review", source, existing);
    expect(result.record_id).toBe(existing.record_id);
    expect(result.status).toBe("conflicted");
  });

  it("scoped_merge: also marks existing as conflicted (manual resolution required)", () => {
    const source = makeRecord();
    const existing = makeRecord({ status: "active" });
    const result = resolveConflict("scoped_merge", source, existing);
    expect(result.status).toBe("conflicted");
  });
});

// ---------------------------------------------------------------------------
// linkDuplicate (relations)
// ---------------------------------------------------------------------------

describe("linkDuplicate", () => {
  it("adds each record's ID to the other's duplicates array", () => {
    const a = makeRecord();
    const b = makeRecord();
    const { existing, duplicate } = linkDuplicate(a, b);
    expect(existing.duplicates).toContain(b.record_id);
    expect(duplicate.duplicates).toContain(a.record_id);
  });

  it("does not mutate the original records", () => {
    const a = makeRecord();
    const b = makeRecord();
    linkDuplicate(a, b);
    expect(a.duplicates).toBeUndefined();
    expect(b.duplicates).toBeUndefined();
  });

  it("preserves existing entries in the duplicates array", () => {
    const a = makeRecord({ duplicates: ["pre-existing"] });
    const b = makeRecord();
    const { existing } = linkDuplicate(a, b);
    expect(existing.duplicates).toContain("pre-existing");
    expect(existing.duplicates).toContain(b.record_id);
  });
});

// ---------------------------------------------------------------------------
// linkSupersession (relations)
// ---------------------------------------------------------------------------

describe("linkSupersession", () => {
  it("old record gets status superseded and superseded_by updated", () => {
    const oldRec = makeRecord({ status: "active" });
    const newRec = makeRecord({ status: "active" });
    const { old } = linkSupersession(oldRec, newRec);
    expect(old.status).toBe("superseded");
    expect(old.superseded_by).toContain(newRec.record_id);
  });

  it("new record gets supersedes updated with old record ID", () => {
    const oldRec = makeRecord();
    const newRec = makeRecord();
    const { new: updated } = linkSupersession(oldRec, newRec);
    expect(updated.supersedes).toContain(oldRec.record_id);
  });

  it("does not mutate original records", () => {
    const oldRec = makeRecord();
    const newRec = makeRecord();
    linkSupersession(oldRec, newRec);
    expect(oldRec.status).toBe("active");
    expect(oldRec.superseded_by).toBeUndefined();
    expect(newRec.supersedes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// linkContradiction (relations)
// ---------------------------------------------------------------------------

describe("linkContradiction", () => {
  it("adds each record's ID to the other's contradicts array", () => {
    const a = makeRecord();
    const b = makeRecord();
    const { a: updatedA, b: updatedB } = linkContradiction(a, b);
    expect(updatedA.contradicts).toContain(b.record_id);
    expect(updatedB.contradicts).toContain(a.record_id);
  });

  it("does not mutate originals", () => {
    const a = makeRecord();
    const b = makeRecord();
    linkContradiction(a, b);
    expect(a.contradicts).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// linkSupport (relations)
// ---------------------------------------------------------------------------

describe("linkSupport", () => {
  it("adds each record's ID to the other's supports array", () => {
    const a = makeRecord();
    const b = makeRecord();
    const { a: updatedA, b: updatedB } = linkSupport(a, b);
    expect(updatedA.supports).toContain(b.record_id);
    expect(updatedB.supports).toContain(a.record_id);
  });
});

// ---------------------------------------------------------------------------
// runPostWriteChecks
// ---------------------------------------------------------------------------

describe("runPostWriteChecks", () => {
  it("returns no duplicates, not stale, no superseded for a totally unique record", () => {
    const rec = makeRecord({ version_hash: "v1" });
    const result = runPostWriteChecks(rec, [rec]);
    expect(result.duplicates).toHaveLength(0);
    expect(result.stale).toBe(false);
    expect(result.superseded).toHaveLength(0);
  });

  it("detects a duplicate record in allRecords", () => {
    const rec = makeRecord({ source_system: "sys", source_object_id: "shared" });
    const twin = makeRecord({ source_system: "sys", source_object_id: "shared" });
    const result = runPostWriteChecks(rec, [rec, twin]);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]!.record_id).toBe(twin.record_id);
  });

  it("flags stale when currentHash differs from stored version_hash", () => {
    const rec = makeRecord({ version_hash: "old" });
    const result = runPostWriteChecks(rec, [rec], "new");
    expect(result.stale).toBe(true);
  });

  it("identifies active records that newRecord explicitly supersedes", () => {
    const oldRec = makeRecord({ status: "active" });
    const newRec = makeRecord({ supersedes: [oldRec.record_id] });
    const result = runPostWriteChecks(newRec, [newRec, oldRec]);
    expect(result.superseded).toHaveLength(1);
    expect(result.superseded[0]!.record_id).toBe(oldRec.record_id);
  });

  it("does not flag already-superseded records as superseded again", () => {
    const oldRec = makeRecord({ status: "superseded" });
    const newRec = makeRecord({ supersedes: [oldRec.record_id] });
    const result = runPostWriteChecks(newRec, [newRec, oldRec]);
    expect(result.superseded).toHaveLength(0);
  });
});
