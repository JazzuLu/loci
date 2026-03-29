import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IndexStore } from "../../src/core/index-store.js";
import type { IndexRecord } from "../../src/core/schema.js";
import { recall } from "../../src/core/retrieval.js";

function makeRecord(overrides: Partial<IndexRecord> = {}): IndexRecord {
  return {
    record_id: "rec_test001",
    source_system: "claude_code",
    source_object_id: "mem_001",
    source_path: "~/.claude/projects/test/memory/test.md",
    scope: "project",
    kind: "fact",
    truth_mode: "native_project_truth",
    title: "Test memory",
    summary: "A test memory for unit tests",
    keywords: ["test"],
    created_at: "2026-03-29T10:00:00Z",
    updated_at: "2026-03-29T10:00:00Z",
    capture_mode: "manual",
    preferred_write_target: "claude_code",
    sync_strategy: "manual_only",
    version_hash: "sha256:aaa111",
    status: "active",
    ...overrides,
  };
}

describe("recall", () => {
  let tmpDir: string;
  let store: IndexStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-recall-test-"));
    store = new IndexStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("keyword match: query 'tdd' finds record with keyword 'tdd'", async () => {
    await store.create(makeRecord({ record_id: "rec_a", keywords: ["tdd", "testing"] }));
    const results = await recall(store, { terms: ["tdd"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.record.record_id).toBe("rec_a");
    expect(results[0]?.score).toBe(10);
    expect(results[0]?.match_reasons.some((r) => r.includes("exact keyword"))).toBe(true);
  });

  it("partial keyword match: query 'test' matches keyword 'testing'", async () => {
    await store.create(makeRecord({ record_id: "rec_b", keywords: ["testing"] }));
    const results = await recall(store, { terms: ["test"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.record.record_id).toBe("rec_b");
    expect(results[0]?.score).toBe(5);
    expect(results[0]?.match_reasons.some((r) => r.includes("partial keyword"))).toBe(true);
  });

  it("title substring match: query matches part of title", async () => {
    await store.create(
      makeRecord({ record_id: "rec_c", keywords: ["unrelated"], title: "My workflow guide" })
    );
    const results = await recall(store, { terms: ["workflow"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.record.record_id).toBe("rec_c");
    expect(results[0]?.score).toBe(3);
    expect(results[0]?.match_reasons.some((r) => r.includes("title match"))).toBe(true);
  });

  it("alias match: query matches an alias", async () => {
    await store.create(
      makeRecord({ record_id: "rec_d", keywords: ["unrelated"], aliases: ["tdd", "bdd"] })
    );
    const results = await recall(store, { terms: ["tdd"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.record.record_id).toBe("rec_d");
    expect(results[0]?.score).toBe(8);
    expect(results[0]?.match_reasons.some((r) => r.includes("alias match"))).toBe(true);
  });

  it("entity match: query matches an entity", async () => {
    await store.create(
      makeRecord({ record_id: "rec_e", keywords: ["unrelated"], entities: ["GitHub Actions"] })
    );
    const results = await recall(store, { terms: ["github actions"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.record.record_id).toBe("rec_e");
    expect(results[0]?.score).toBe(7);
    expect(results[0]?.match_reasons.some((r) => r.includes("entity match"))).toBe(true);
  });

  it("multi-term query: 'tdd workflow' matches records with either term", async () => {
    await store.create(makeRecord({ record_id: "rec_f", keywords: ["tdd"] }));
    await store.create(
      makeRecord({ record_id: "rec_g", keywords: ["unrelated"], title: "My workflow process" })
    );
    const results = await recall(store, { terms: ["tdd", "workflow"] });
    const ids = results.map((r) => r.record.record_id);
    expect(ids).toContain("rec_f");
    expect(ids).toContain("rec_g");
  });

  it("scope filter: recall only within scope 'project'", async () => {
    await store.create(makeRecord({ record_id: "rec_h", scope: "project", keywords: ["tdd"] }));
    await store.create(makeRecord({ record_id: "rec_i", scope: "personal", keywords: ["tdd"] }));
    const results = await recall(store, { terms: ["tdd"], scope: "project" });
    expect(results).toHaveLength(1);
    expect(results[0]?.record.record_id).toBe("rec_h");
  });

  it("status filter: exclude 'archived' records by default", async () => {
    await store.create(makeRecord({ record_id: "rec_j", status: "active", keywords: ["tdd"] }));
    await store.create(makeRecord({ record_id: "rec_k", status: "archived", keywords: ["tdd"] }));
    const results = await recall(store, { terms: ["tdd"] });
    const ids = results.map((r) => r.record.record_id);
    expect(ids).toContain("rec_j");
    expect(ids).not.toContain("rec_k");
  });

  it("relation traversal: if record A supports record B, recalling A also surfaces B", async () => {
    await store.create(
      makeRecord({ record_id: "rec_a_rel", keywords: ["tdd"], supports: ["rec_b_rel"] })
    );
    await store.create(
      makeRecord({ record_id: "rec_b_rel", keywords: ["unrelated"], title: "Related record" })
    );
    const results = await recall(store, { terms: ["tdd"], include_relations: true });
    const ids = results.map((r) => r.record.record_id);
    expect(ids).toContain("rec_a_rel");
    expect(ids).toContain("rec_b_rel");
    const relatedResult = results.find((r) => r.record.record_id === "rec_b_rel");
    expect(relatedResult?.match_reasons.some((r) => r.includes("related to"))).toBe(true);
  });

  it("empty results: returns empty array, not error", async () => {
    await store.create(makeRecord({ record_id: "rec_l", keywords: ["typescript"] }));
    const results = await recall(store, { terms: ["python"] });
    expect(results).toEqual([]);
  });

  it("ranking: exact keyword match ranks higher than partial title match", async () => {
    await store.create(
      makeRecord({ record_id: "rec_exact", keywords: ["tdd"] })
    );
    await store.create(
      makeRecord({ record_id: "rec_title", keywords: ["unrelated"], title: "Guide to tdd approach" })
    );
    const results = await recall(store, { terms: ["tdd"] });
    expect(results[0]?.record.record_id).toBe("rec_exact");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });
});
