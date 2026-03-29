import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GeminiAdapter } from "../../src/adapters/gemini.js";
import { IndexRecordSchema } from "../../src/core/schema.js";
import type { IndexRecord } from "../../src/core/schema.js";

describe("GeminiAdapter", () => {
  let tmpDir: string;
  let adapter: GeminiAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-gemini-test-"));
    adapter = new GeminiAdapter(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // --- Capability ---

  it("declares context_memory adapter class", () => {
    expect(adapter.capability.adapter_class).toBe("context_memory");
  });

  it("declares context_truth source_of_truth_role", () => {
    expect(adapter.capability.source_of_truth_role).toBe("context_truth");
  });

  it("declares adapter_id as gemini", () => {
    expect(adapter.capability.adapter_id).toBe("gemini");
  });

  it("declares display_name as Gemini CLI", () => {
    expect(adapter.capability.display_name).toBe("Gemini CLI");
  });

  it("declares can_read=true, can_write=false, can_sync=true, can_search=false, can_auto_capture=false", () => {
    expect(adapter.capability.can_read).toBe(true);
    expect(adapter.capability.can_write).toBe(false);
    expect(adapter.capability.can_sync).toBe(true);
    expect(adapter.capability.can_search).toBe(false);
    expect(adapter.capability.can_auto_capture).toBe(false);
  });

  it("declares supported_scopes including project", () => {
    expect(adapter.capability.supported_scopes).toContain("project");
  });

  // --- read(): no GEMINI.md files ---

  it("read returns empty records when no GEMINI.md exists", async () => {
    const result = await adapter.read();
    expect(result.records).toHaveLength(0);
    expect(result.partial).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  // --- read(): single GEMINI.md at projectDir root ---

  it("read discovers GEMINI.md at project root", async () => {
    await writeFile(
      join(tmpDir, "GEMINI.md"),
      "# Gemini Context\n\nThis is the root context file.\n",
    );

    const result = await adapter.read();
    expect(result.records).toHaveLength(1);
    const rec = result.records[0]!;
    expect(rec.source_system).toBe("gemini");
    expect(rec.kind).toBe("reference");
    expect(rec.source_path).toContain("GEMINI.md");
  });

  // --- read(): layered GEMINI.md files ---

  it("read discovers layered GEMINI.md files in subdirectories", async () => {
    // Root GEMINI.md
    await writeFile(
      join(tmpDir, "GEMINI.md"),
      "# Root Gemini Context\n\nRoot level instructions.\n",
    );

    // Subdirectory GEMINI.md
    const subDir = join(tmpDir, "subproject");
    await mkdir(subDir, { recursive: true });
    await writeFile(
      join(subDir, "GEMINI.md"),
      "# Sub Gemini Context\n\nSub-project instructions.\n",
    );

    const result = await adapter.read();
    expect(result.records.length).toBeGreaterThanOrEqual(2);

    const paths = result.records.map((r) => r.source_path);
    const hasRoot = paths.some((p) => p.endsWith(join(tmpDir, "GEMINI.md")));
    const hasSub = paths.some((p) => p.endsWith(join(subDir, "GEMINI.md")));
    expect(hasRoot).toBe(true);
    expect(hasSub).toBe(true);
  });

  // --- read(): returns valid IndexRecords ---

  it("read returns valid IndexRecord objects passing schema validation", async () => {
    await writeFile(
      join(tmpDir, "GEMINI.md"),
      "# Context\n\nSome context content here.\n",
    );

    const result = await adapter.read();
    expect(result.records.length).toBeGreaterThan(0);

    for (const rec of result.records) {
      const parsed = IndexRecordSchema.safeParse(rec);
      expect(parsed.success).toBe(true);
    }
  });

  // --- read(): userHome global GEMINI.md ---

  it("read discovers userHome/.gemini/GEMINI.md when provided", async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), "loci-gemini-home-"));
    try {
      const geminiDir = join(fakeHome, ".gemini");
      await mkdir(geminiDir, { recursive: true });
      await writeFile(
        join(geminiDir, "GEMINI.md"),
        "# Global Gemini Context\n\nGlobal user instructions.\n",
      );

      const adapterWithHome = new GeminiAdapter(tmpDir, fakeHome);
      const result = await adapterWithHome.read();

      const paths = result.records.map((r) => r.source_path);
      const hasGlobal = paths.some((p) =>
        p.includes(join(".gemini", "GEMINI.md")),
      );
      expect(hasGlobal).toBe(true);
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  // --- write(): MVP returns success=false ---

  it("write returns success=false with error message", async () => {
    const record = makeRecord();
    const result = await adapter.write(record);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("not supported");
  });

  // --- sync(): hash-based change detection ---

  it("sync detects newly added GEMINI.md as added record", async () => {
    await writeFile(
      join(tmpDir, "GEMINI.md"),
      "# Context\n\nNew content.\n",
    );

    const syncResult = await adapter.sync([]);
    expect(syncResult.added).toHaveLength(1);
    expect(syncResult.updated).toHaveLength(0);
    expect(syncResult.removed).toHaveLength(0);
  });

  it("sync detects unchanged entries when hash matches", async () => {
    await writeFile(
      join(tmpDir, "GEMINI.md"),
      "# Context\n\nStable content.\n",
    );

    const { records } = await adapter.read();
    const syncResult = await adapter.sync(records);

    expect(syncResult.unchanged).toBe(1);
    expect(syncResult.added).toHaveLength(0);
    expect(syncResult.updated).toHaveLength(0);
    expect(syncResult.removed).toHaveLength(0);
  });

  it("sync detects updated entries when content changes", async () => {
    const filePath = join(tmpDir, "GEMINI.md");
    await writeFile(filePath, "# Context\n\nOriginal content.\n");

    const { records } = await adapter.read();

    // Modify content
    await writeFile(filePath, "# Context\n\nModified content.\n");

    const syncResult = await adapter.sync(records);
    expect(syncResult.updated).toHaveLength(1);
    expect(syncResult.added).toHaveLength(0);
    expect(syncResult.unchanged).toBe(0);
  });

  it("sync detects removed entries when file disappears", async () => {
    const filePath = join(tmpDir, "GEMINI.md");
    await writeFile(filePath, "# Context\n\nContent to remove.\n");

    const { records } = await adapter.read();

    // Remove file
    await rm(filePath);

    const syncResult = await adapter.sync(records);
    expect(syncResult.removed).toHaveLength(1);
    expect(syncResult.added).toHaveLength(0);
    expect(syncResult.unchanged).toBe(0);
  });
});

// --- helpers ---

function makeRecord(overrides: Partial<IndexRecord> = {}): IndexRecord {
  return {
    record_id: "rec_gemini001",
    source_system: "gemini",
    source_object_id: "/some/path/GEMINI.md",
    source_path: "/some/path/GEMINI.md",
    scope: "project",
    kind: "reference",
    truth_mode: "context_truth",
    title: "Gemini Context: /some/path/GEMINI.md",
    summary: "Gemini CLI context memory file.",
    keywords: ["gemini", "context"],
    created_at: "2026-03-29T10:00:00Z",
    updated_at: "2026-03-29T10:00:00Z",
    capture_mode: "sync_scan",
    preferred_write_target: "gemini",
    sync_strategy: "scan_on_demand",
    version_hash: "sha256:aaa111",
    status: "active",
    ...overrides,
  };
}
