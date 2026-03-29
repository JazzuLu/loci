import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CodexAdapter } from "../../src/adapters/codex.js";
import { IndexRecordSchema } from "../../src/core/schema.js";
import type { IndexRecord } from "../../src/core/schema.js";

describe("CodexAdapter", () => {
  let tmpDir: string;
  let adapter: CodexAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-codex-test-"));
    adapter = new CodexAdapter(tmpDir);
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

  it("declares adapter_id as codex", () => {
    expect(adapter.capability.adapter_id).toBe("codex");
  });

  it("declares display_name as Codex", () => {
    expect(adapter.capability.display_name).toBe("Codex");
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

  // --- read(): no AGENTS.md files ---

  it("read returns empty records when no AGENTS.md exists", async () => {
    const result = await adapter.read();
    expect(result.records).toHaveLength(0);
    expect(result.partial).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  // --- read(): single AGENTS.md at projectDir root ---

  it("read discovers AGENTS.md at project root", async () => {
    await writeFile(
      join(tmpDir, "AGENTS.md"),
      "# Codex Context\n\nThis is the root context file.\n",
    );

    const result = await adapter.read();
    expect(result.records).toHaveLength(1);
    const [first] = result.records;
    expect(first?.source_system).toBe("codex");
    expect(first?.kind).toBe("reference");
    expect(first?.source_path).toContain("AGENTS.md");
  });

  // --- read(): returns valid IndexRecords ---

  it("read returns valid IndexRecord objects passing schema validation", async () => {
    await writeFile(
      join(tmpDir, "AGENTS.md"),
      "# Context\n\nSome context content here.\n",
    );

    const result = await adapter.read();
    expect(result.records.length).toBeGreaterThan(0);

    for (const rec of result.records) {
      const parsed = IndexRecordSchema.safeParse(rec);
      expect(parsed.success).toBe(true);
    }
  });

  // --- read(): layered AGENTS.md (parent dirs) ---

  it("read discovers AGENTS.md in parent directories (layered)", async () => {
    // Create a subdirectory as the "project root" so the parent (tmpDir) is accessible
    const projectDir = join(tmpDir, "project");
    await mkdir(projectDir, { recursive: true });

    // Place AGENTS.md in parent
    await writeFile(
      join(tmpDir, "AGENTS.md"),
      "# Parent Codex Context\n\nParent level instructions.\n",
    );

    // Place AGENTS.md in project dir
    await writeFile(
      join(projectDir, "AGENTS.md"),
      "# Project Codex Context\n\nProject level instructions.\n",
    );

    const layeredAdapter = new CodexAdapter(projectDir);
    const result = await layeredAdapter.read();

    // Should find at least both files
    const paths = result.records.map((r) => r.source_path);
    const hasParent = paths.some((p) => p === join(tmpDir, "AGENTS.md"));
    const hasProject = paths.some((p) => p === join(projectDir, "AGENTS.md"));
    expect(hasParent).toBe(true);
    expect(hasProject).toBe(true);
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

  it("sync detects newly added AGENTS.md as added record", async () => {
    await writeFile(
      join(tmpDir, "AGENTS.md"),
      "# Context\n\nNew content.\n",
    );

    const syncResult = await adapter.sync([]);
    expect(syncResult.added).toHaveLength(1);
    expect(syncResult.updated).toHaveLength(0);
    expect(syncResult.removed).toHaveLength(0);
  });

  it("sync detects unchanged entries when hash matches", async () => {
    await writeFile(
      join(tmpDir, "AGENTS.md"),
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
    const filePath = join(tmpDir, "AGENTS.md");
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
    const filePath = join(tmpDir, "AGENTS.md");
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
    record_id: "rec_codex001",
    source_system: "codex",
    source_object_id: "/some/path/AGENTS.md",
    source_path: "/some/path/AGENTS.md",
    scope: "project",
    kind: "reference",
    truth_mode: "context_truth",
    title: "AGENTS.md (/some/path/AGENTS.md)",
    summary: "Codex context memory file.",
    keywords: ["agents", "context", "codex"],
    created_at: "2026-03-29T10:00:00Z",
    updated_at: "2026-03-29T10:00:00Z",
    capture_mode: "sync_scan",
    preferred_write_target: "codex",
    sync_strategy: "scan_on_demand",
    version_hash: "sha256:aaa111",
    status: "active",
    ...overrides,
  };
}
