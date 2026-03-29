import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IndexStore } from "../../src/core/index-store.js";
import { SyncEngine } from "../../src/core/sync-engine.js";
import type { MemoryAdapter, ReadResult, WriteResult, SyncScanResult } from "../../src/adapters/base.js";
import type { AdapterCapability, IndexRecord } from "../../src/core/schema.js";

function makeRecord(overrides: Partial<IndexRecord> = {}): IndexRecord {
  return {
    record_id: "rec_test001",
    source_system: "test_system",
    source_object_id: "obj_001",
    source_path: "/test/path/obj_001",
    scope: "project",
    kind: "fact",
    truth_mode: "native_project_truth",
    status: "active",
    title: "Test record",
    summary: "A test record for sync engine tests",
    keywords: ["test"],
    created_at: "2026-03-29T10:00:00Z",
    updated_at: "2026-03-29T10:00:00Z",
    capture_mode: "sync_scan",
    preferred_write_target: "test_adapter",
    sync_strategy: "scan_on_demand",
    version_hash: "sha256:aaa111",
    source_adapter_id: "test_adapter",
    ...overrides,
  };
}

function makeCapability(adapterId: string): AdapterCapability {
  return {
    adapter_id: adapterId,
    adapter_class: "native_memory",
    display_name: `Test Adapter ${adapterId}`,
    can_read: true,
    can_write: false,
    can_search: false,
    can_sync: true,
    can_auto_capture: false,
    source_of_truth_role: "native_project_truth",
    supported_scopes: ["project"],
  };
}

function makeMockAdapter(
  adapterId: string,
  _sourceSystem: string,
  syncResult: SyncScanResult,
): MemoryAdapter {
  return {
    capability: makeCapability(adapterId),
    read: vi.fn<() => Promise<ReadResult>>().mockResolvedValue({
      records: [],
      partial: false,
      errors: [],
    }),
    write: vi.fn<(record: IndexRecord) => Promise<WriteResult>>().mockResolvedValue({
      success: false,
      error: "not implemented",
    }),
    sync: vi.fn<(existing: IndexRecord[]) => Promise<SyncScanResult>>().mockResolvedValue(syncResult),
  };
}

describe("SyncEngine", () => {
  let tmpDir: string;
  let store: IndexStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-sync-test-"));
    store = new IndexStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("syncAdapter", () => {
    it("calls adapter.sync() with existing records for that source_system", async () => {
      const existingRecord = makeRecord({ record_id: "rec_existing", source_system: "test_system" });
      await store.create(existingRecord);

      const syncResult: SyncScanResult = {
        added: [],
        updated: [],
        removed: [],
        unchanged: 1,
        errors: [],
      };
      const adapter = makeMockAdapter("test_adapter", "test_system", syncResult);
      // Override sync to capture the existingRecords argument
      let capturedExisting: IndexRecord[] = [];
      adapter.sync = vi.fn().mockImplementation(async (existing: IndexRecord[]) => {
        capturedExisting = existing;
        return syncResult;
      });

      const engine = new SyncEngine(store, [adapter]);
      await engine.syncAdapter("test_adapter");

      expect(capturedExisting).toHaveLength(1);
      expect(capturedExisting[0]?.record_id).toBe("rec_existing");
    });

    it("creates added records in index store", async () => {
      const newRecord = makeRecord({ record_id: "rec_new", source_system: "test_system" });
      const syncResult: SyncScanResult = {
        added: [newRecord],
        updated: [],
        removed: [],
        unchanged: 0,
        errors: [],
      };
      const adapter = makeMockAdapter("test_adapter", "test_system", syncResult);
      const engine = new SyncEngine(store, [adapter]);

      const result = await engine.syncAdapter("test_adapter");

      expect(result.added).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);
      const stored = await store.get("rec_new");
      expect(stored).not.toBeNull();
      expect(stored?.record_id).toBe("rec_new");
    });

    it("updates changed records in index store", async () => {
      const existing = makeRecord({ record_id: "rec_upd", source_system: "test_system" });
      await store.create(existing);

      const updated = { ...existing, title: "Updated Title", version_hash: "sha256:bbb222" };
      const syncResult: SyncScanResult = {
        added: [],
        updated: [updated],
        removed: [],
        unchanged: 0,
        errors: [],
      };
      const adapter = makeMockAdapter("test_adapter", "test_system", syncResult);
      const engine = new SyncEngine(store, [adapter]);

      const result = await engine.syncAdapter("test_adapter");

      expect(result.updated).toBe(1);
      const stored = await store.get("rec_upd");
      expect(stored?.title).toBe("Updated Title");
      expect(stored?.version_hash).toBe("sha256:bbb222");
    });

    it("marks removed records as stale (does not delete)", async () => {
      const existing = makeRecord({ record_id: "rec_del", source_system: "test_system" });
      await store.create(existing);

      const syncResult: SyncScanResult = {
        added: [],
        updated: [],
        removed: ["rec_del"],
        unchanged: 0,
        errors: [],
      };
      const adapter = makeMockAdapter("test_adapter", "test_system", syncResult);
      const engine = new SyncEngine(store, [adapter]);

      const result = await engine.syncAdapter("test_adapter");

      expect(result.removed).toBe(1);
      // Record should still exist but be stale
      const stored = await store.get("rec_del");
      expect(stored).not.toBeNull();
      expect(stored?.status).toBe("stale");
    });

    it("returns sync result with correct counts", async () => {
      const syncResult: SyncScanResult = {
        added: [makeRecord({ record_id: "rec_a1" }), makeRecord({ record_id: "rec_a2" })],
        updated: [],
        removed: [],
        unchanged: 5,
        errors: [],
      };
      const adapter = makeMockAdapter("test_adapter", "test_system", syncResult);
      const engine = new SyncEngine(store, [adapter]);

      const result = await engine.syncAdapter("test_adapter");

      expect(result.adapter_id).toBe("test_adapter");
      expect(result.added).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.unchanged).toBe(5);
      expect(result.errors).toEqual([]);
    });

    it("captures adapter errors in result", async () => {
      const syncResult: SyncScanResult = {
        added: [],
        updated: [],
        removed: [],
        unchanged: 0,
        errors: ["Failed to read /some/path: ENOENT"],
      };
      const adapter = makeMockAdapter("test_adapter", "test_system", syncResult);
      const engine = new SyncEngine(store, [adapter]);

      const result = await engine.syncAdapter("test_adapter");

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("ENOENT");
    });

    it("throws when adapter_id is not registered", async () => {
      const engine = new SyncEngine(store, []);

      await expect(engine.syncAdapter("nonexistent_adapter")).rejects.toThrow(/not found/i);
    });
  });

  describe("syncAll", () => {
    it("syncs all registered adapters and aggregates results", async () => {
      const adapter1 = makeMockAdapter("adapter_1", "system_1", {
        added: [makeRecord({ record_id: "rec_1a", source_system: "system_1", source_adapter_id: "adapter_1" })],
        updated: [],
        removed: [],
        unchanged: 2,
        errors: [],
      });
      const adapter2 = makeMockAdapter("adapter_2", "system_2", {
        added: [],
        updated: [makeRecord({ record_id: "rec_2u", source_system: "system_2", source_adapter_id: "adapter_2" })],
        removed: [],
        unchanged: 0,
        errors: [],
      });

      // Pre-populate the record that adapter2 will update
      await store.create(makeRecord({ record_id: "rec_2u", source_system: "system_2", source_adapter_id: "adapter_2" }));

      const engine = new SyncEngine(store, [adapter1, adapter2]);
      const summary = await engine.syncAll();

      expect(summary.results).toHaveLength(2);
      expect(summary.total_added).toBe(1);
      expect(summary.total_updated).toBe(1);
      expect(summary.total_removed).toBe(0);
      expect(summary.total_errors).toBe(0);
    });

    it("iterates all registered adapters", async () => {
      const adapter1 = makeMockAdapter("adapter_1", "system_1", {
        added: [], updated: [], removed: [], unchanged: 0, errors: [],
      });
      const adapter2 = makeMockAdapter("adapter_2", "system_2", {
        added: [], updated: [], removed: [], unchanged: 0, errors: [],
      });

      const engine = new SyncEngine(store, [adapter1, adapter2]);
      const summary = await engine.syncAll();

      expect(adapter1.sync).toHaveBeenCalledOnce();
      expect(adapter2.sync).toHaveBeenCalledOnce();
      expect(summary.results).toHaveLength(2);
      expect(summary.results.map((r) => r.adapter_id)).toEqual(
        expect.arrayContaining(["adapter_1", "adapter_2"]),
      );
    });

    it("returns empty summary when no adapters are registered", async () => {
      const engine = new SyncEngine(store, []);
      const summary = await engine.syncAll();

      expect(summary.results).toHaveLength(0);
      expect(summary.total_added).toBe(0);
      expect(summary.total_updated).toBe(0);
      expect(summary.total_removed).toBe(0);
      expect(summary.total_errors).toBe(0);
    });

    it("accumulates errors across adapters in total_errors", async () => {
      const adapter1 = makeMockAdapter("adapter_1", "system_1", {
        added: [], updated: [], removed: [], unchanged: 0,
        errors: ["error_a", "error_b"],
      });
      const adapter2 = makeMockAdapter("adapter_2", "system_2", {
        added: [], updated: [], removed: [], unchanged: 0,
        errors: ["error_c"],
      });

      const engine = new SyncEngine(store, [adapter1, adapter2]);
      const summary = await engine.syncAll();

      expect(summary.total_errors).toBe(3);
    });
  });

  describe("index-only refresh", () => {
    it("updates paths, hashes, and timestamps without requiring content copy", async () => {
      const existing = makeRecord({
        record_id: "rec_refresh",
        source_path: "/old/path",
        version_hash: "sha256:old",
        updated_at: "2026-03-01T00:00:00Z",
      });
      await store.create(existing);

      const refreshed = {
        ...existing,
        source_path: "/new/path",
        version_hash: "sha256:new",
        updated_at: "2026-03-29T00:00:00Z",
      };
      const syncResult: SyncScanResult = {
        added: [],
        updated: [refreshed],
        removed: [],
        unchanged: 0,
        errors: [],
      };
      const adapter = makeMockAdapter("test_adapter", "test_system", syncResult);
      const engine = new SyncEngine(store, [adapter]);

      await engine.syncAdapter("test_adapter");

      const stored = await store.get("rec_refresh");
      expect(stored?.source_path).toBe("/new/path");
      expect(stored?.version_hash).toBe("sha256:new");
      expect(stored?.updated_at).toBe("2026-03-29T00:00:00Z");
    });
  });
});
