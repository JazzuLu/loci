import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IndexStore } from "../../src/core/index-store.js";
import type { IndexRecord } from "../../src/core/schema.js";

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

describe("IndexStore", () => {
  let tmpDir: string;
  let store: IndexStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-test-"));
    store = new IndexStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("creates a record and retrieves it by id", async () => {
      const record = makeRecord();
      await store.create(record);
      const found = await store.get(record.record_id);
      expect(found).toEqual(record);
    });

    it("rejects duplicate record_id", async () => {
      const record = makeRecord();
      await store.create(record);
      await expect(store.create(record)).rejects.toThrow(/duplicate/i);
    });

    it("validates the record against schema", async () => {
      const bad = { ...makeRecord(), scope: "galaxy" } as unknown as IndexRecord;
      await expect(store.create(bad)).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("updates an existing record", async () => {
      const record = makeRecord();
      await store.create(record);
      const updated = { ...record, title: "Updated title", updated_at: "2026-03-29T11:00:00Z" };
      await store.update(updated);
      const found = await store.get(record.record_id);
      expect(found?.title).toBe("Updated title");
    });

    it("rejects update for nonexistent record", async () => {
      const record = makeRecord({ record_id: "rec_ghost" });
      await expect(store.update(record)).rejects.toThrow(/not found/i);
    });
  });

  describe("delete", () => {
    it("removes a record", async () => {
      const record = makeRecord();
      await store.create(record);
      await store.delete(record.record_id);
      const found = await store.get(record.record_id);
      expect(found).toBeNull();
    });
  });

  describe("query", () => {
    it("queries by source_system", async () => {
      await store.create(makeRecord({ record_id: "rec_a", source_system: "claude_code" }));
      await store.create(makeRecord({ record_id: "rec_b", source_system: "openclaw" }));
      const results = await store.query({ source_system: "claude_code" });
      expect(results).toHaveLength(1);
      expect(results[0]?.record_id).toBe("rec_a");
    });

    it("queries by scope", async () => {
      await store.create(makeRecord({ record_id: "rec_a", scope: "project" }));
      await store.create(makeRecord({ record_id: "rec_b", scope: "personal" }));
      const results = await store.query({ scope: "personal" });
      expect(results).toHaveLength(1);
      expect(results[0]?.record_id).toBe("rec_b");
    });

    it("queries by kind", async () => {
      await store.create(makeRecord({ record_id: "rec_a", kind: "fact" }));
      await store.create(makeRecord({ record_id: "rec_b", kind: "preference" }));
      const results = await store.query({ kind: "preference" });
      expect(results).toHaveLength(1);
    });

    it("queries by status", async () => {
      await store.create(makeRecord({ record_id: "rec_a", status: "active" }));
      await store.create(makeRecord({ record_id: "rec_b", status: "stale" }));
      const results = await store.query({ status: "active" });
      expect(results).toHaveLength(1);
    });

    it("returns all records with empty query", async () => {
      await store.create(makeRecord({ record_id: "rec_a" }));
      await store.create(makeRecord({ record_id: "rec_b" }));
      const results = await store.query({});
      expect(results).toHaveLength(2);
    });
  });

  describe("persistence", () => {
    it("persists records across store instances", async () => {
      await store.create(makeRecord({ record_id: "rec_persist" }));
      await store.flush();

      const store2 = new IndexStore(tmpDir);
      await store2.load();
      const found = await store2.get("rec_persist");
      expect(found).not.toBeNull();
      expect(found?.record_id).toBe("rec_persist");
    });
  });

  describe("version_hash update", () => {
    it("detects hash change on update", async () => {
      const record = makeRecord();
      await store.create(record);
      const updated = {
        ...record,
        version_hash: "sha256:bbb222",
        updated_at: "2026-03-29T12:00:00Z",
      };
      await store.update(updated);
      const found = await store.get(record.record_id);
      expect(found?.version_hash).toBe("sha256:bbb222");
    });
  });
});
