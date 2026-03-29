import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CanonicalStore } from "../../src/core/canonical-store.js";
import { LociAdapter } from "../../src/adapters/loci.js";
import { IndexRecordSchema } from "../../src/core/schema.js";

describe("CanonicalStore", () => {
  let tmpDir: string;
  let store: CanonicalStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-canonical-test-"));
    store = new CanonicalStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes a canonical memory entry to palace structure", async () => {
    const result = await store.write({
      title: "My Test Skill",
      summary: "A summary of my test skill.",
      keywords: ["test", "skill"],
      kind: "fact",
      category: "general",
    });

    expect(result.record_id).toMatch(/^rec_[0-9a-f]{16}$/);
    expect(result.path).toContain("general");
    expect(result.path).toContain("my-test-skill");
    expect(result.path).toContain("SKILL.md");
  });

  it("defaults to inbox category when none specified", async () => {
    const result = await store.write({
      title: "Inbox Entry",
      summary: "Goes to inbox.",
      keywords: ["inbox"],
      kind: "reference",
    });

    expect(result.path).toContain("inbox");
  });

  it("reads a canonical entry back with correct fields", async () => {
    const written = await store.write({
      title: "Readable Memory",
      summary: "This is the summary content.",
      keywords: ["readable", "memory"],
      kind: "workflow",
      category: "tech",
    });

    const entry = await store.read(written.path);

    expect(entry).not.toBeNull();
    expect(entry?.title).toBe("Readable Memory");
    expect(entry?.summary).toBe("This is the summary content.");
    expect(entry?.keywords).toEqual(["readable", "memory"]);
    expect(entry?.kind).toBe("workflow");
    expect(entry?.created_at).toBeTruthy();
  });

  it("returns null when reading a nonexistent file", async () => {
    const result = await store.read(join(tmpDir, "nonexistent", "SKILL.md"));
    expect(result).toBeNull();
  });

  it("lists all SKILL.md files across categories", async () => {
    await store.write({ title: "Alpha", summary: "Alpha summary.", keywords: ["a"], kind: "fact", category: "cat1" });
    await store.write({ title: "Beta", summary: "Beta summary.", keywords: ["b"], kind: "fact", category: "cat2" });
    await store.write({ title: "Gamma", summary: "Gamma summary.", keywords: ["c"], kind: "fact", category: "cat1" });

    const listed = await store.list();
    expect(listed).toHaveLength(3);
    const titles = listed.map((l) => l.title).sort();
    expect(titles).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("returns empty list when no entries exist", async () => {
    const listed = await store.list();
    expect(listed).toHaveLength(0);
  });
});

describe("LociAdapter", () => {
  let tmpDir: string;
  let adapter: LociAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-adapter-test-"));
    adapter = new LociAdapter(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("declares canonical_memory adapter class", () => {
    expect(adapter.capability.adapter_class).toBe("canonical_memory");
  });

  it("declares canonical_truth source of truth role", () => {
    expect(adapter.capability.source_of_truth_role).toBe("canonical_truth");
  });

  it("declares can_read and can_write true, can_search false, can_auto_capture false", () => {
    expect(adapter.capability.can_read).toBe(true);
    expect(adapter.capability.can_write).toBe(true);
    expect(adapter.capability.can_sync).toBe(true);
    expect(adapter.capability.can_search).toBe(false);
    expect(adapter.capability.can_auto_capture).toBe(false);
  });

  it("declares supported_scopes including cross_project, personal, team", () => {
    expect(adapter.capability.supported_scopes).toContain("cross_project");
    expect(adapter.capability.supported_scopes).toContain("personal");
    expect(adapter.capability.supported_scopes).toContain("team");
  });

  it("write returns success and generates source_path", async () => {
    const record = makeRecord();
    const result = await adapter.write(record);

    expect(result.success).toBe(true);
    expect(result.source_path).toBeTruthy();
    expect(result.source_path).toContain("SKILL.md");
  });

  it("write generates an index record retrievable via read", async () => {
    const record = makeRecord();
    await adapter.write(record);

    const readResult = await adapter.read();
    expect(readResult.records).toHaveLength(1);
    expect(readResult.errors).toHaveLength(0);
  });

  it("read returns valid IndexRecord objects", async () => {
    await adapter.write(makeRecord({ title: "Valid Record", keywords: ["valid"] }));

    const readResult = await adapter.read();
    expect(readResult.records.length).toBeGreaterThan(0);

    for (const rec of readResult.records) {
      // Should not throw
      const parsed = IndexRecordSchema.safeParse(rec);
      expect(parsed.success).toBe(true);
    }
  });

  it("read returns empty records when store is empty", async () => {
    const readResult = await adapter.read();
    expect(readResult.records).toHaveLength(0);
    expect(readResult.partial).toBe(false);
  });

  it("sync detects newly added entries", async () => {
    await adapter.write(makeRecord({ title: "New Entry", keywords: ["new"] }));

    const syncResult = await adapter.sync([]);
    expect(syncResult.added).toHaveLength(1);
    expect(syncResult.updated).toHaveLength(0);
    expect(syncResult.removed).toHaveLength(0);
  });

  it("sync detects unchanged entries", async () => {
    await adapter.write(makeRecord({ title: "Stable", keywords: ["stable"] }));
    const { records } = await adapter.read();

    const syncResult = await adapter.sync(records);
    expect(syncResult.unchanged).toBe(1);
    expect(syncResult.added).toHaveLength(0);
    expect(syncResult.updated).toHaveLength(0);
  });
});

// --- helpers ---

import type { IndexRecord } from "../../src/core/schema.js";

function makeRecord(overrides: Partial<IndexRecord> = {}): IndexRecord {
  return {
    record_id: "rec_test001",
    source_system: "claude_code",
    source_object_id: "mem_001",
    source_path: "~/.claude/projects/test/memory/test.md",
    scope: "cross_project",
    kind: "fact",
    truth_mode: "canonical_truth",
    title: "Test Memory Entry",
    summary: "A canonical memory for unit tests.",
    keywords: ["test", "canonical"],
    created_at: "2026-03-29T10:00:00Z",
    updated_at: "2026-03-29T10:00:00Z",
    capture_mode: "manual",
    preferred_write_target: "loci_canonical",
    sync_strategy: "scan_on_demand",
    version_hash: "sha256:aaa111",
    status: "active",
    ...overrides,
  };
}
