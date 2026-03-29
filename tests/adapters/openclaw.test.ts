import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenClawAdapter } from "../../src/adapters/openclaw.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function createFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "openclaw-test-"));

  // MEMORY.md – workspace memory index
  await writeFile(
    join(dir, "MEMORY.md"),
    [
      "# OpenClaw Workspace Memory",
      "",
      "## Project conventions",
      "Always use TypeScript strict mode.",
      "",
      "## Tooling",
      "Use pnpm for package management.",
    ].join("\n"),
    "utf-8",
  );

  // memory/ directory with dated files
  await mkdir(join(dir, "memory"));

  await writeFile(
    join(dir, "memory", "2026-03-29.md"),
    [
      "# 2026-03-29 session notes",
      "",
      "Implemented OpenClaw adapter for loci memory plane.",
      "Key decision: MVP write returns success=false.",
    ].join("\n"),
    "utf-8",
  );

  await writeFile(
    join(dir, "memory", "2026-03-28.md"),
    [
      "# 2026-03-28 planning",
      "",
      "Drafted the adapter interface and capability schema.",
    ].join("\n"),
    "utf-8",
  );

  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenClawAdapter", () => {
  let tmpDir: string;
  let adapter: OpenClawAdapter;

  beforeEach(async () => {
    tmpDir = await createFixture();
    adapter = new OpenClawAdapter(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // --- capability -----------------------------------------------------------

  it("declares correct capability", () => {
    const cap = adapter.capability;
    expect(cap.adapter_id).toBe("openclaw");
    expect(cap.adapter_class).toBe("native_memory");
    expect(cap.display_name).toBe("OpenClaw");
    expect(cap.source_of_truth_role).toBe("workspace_truth");
    expect(cap.supported_scopes).toEqual(expect.arrayContaining(["session", "project"]));
    expect(cap.can_read).toBe(true);
    expect(cap.can_write).toBe(true);
    expect(cap.can_sync).toBe(true);
    expect(cap.can_search).toBe(false);
    expect(cap.can_auto_capture).toBe(true);
  });

  // --- read() ---------------------------------------------------------------

  it("reads MEMORY.md and returns an IndexRecord for it", async () => {
    const result = await adapter.read();
    expect(result.partial).toBe(false);
    expect(result.errors).toHaveLength(0);

    const memoryMd = result.records.find((r) => r.source_path.endsWith("MEMORY.md"));
    expect(memoryMd).toBeDefined();
    expect(memoryMd!.title).toBe("OpenClaw workspace memory index");
    expect(memoryMd!.kind).toBe("reference");
    expect(memoryMd!.source_system).toBe("openclaw");
    expect(memoryMd!.scope).toBe("project");
    expect(memoryMd!.status).toBe("active");
    expect(memoryMd!.version_hash).toMatch(/^sha256:/);
    expect(memoryMd!.keywords.length).toBeGreaterThan(0);
  });

  it("reads dated memory files and returns IndexRecords", async () => {
    const result = await adapter.read();

    const dated = result.records.filter((r) => r.source_path.includes("memory/"));
    expect(dated).toHaveLength(2);

    const mar29 = dated.find((r) => r.source_path.endsWith("2026-03-29.md"));
    expect(mar29).toBeDefined();
    expect(mar29!.kind).toBe("fact");
    expect(mar29!.title).toBe("2026-03-29 session notes");
    expect(mar29!.source_system).toBe("openclaw");
    expect(mar29!.version_hash).toMatch(/^sha256:/);
  });

  it("returns 3 records total (MEMORY.md + 2 dated files)", async () => {
    const result = await adapter.read();
    expect(result.records).toHaveLength(3);
  });

  it("returns partial=false and no errors when files exist", async () => {
    const result = await adapter.read();
    expect(result.partial).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it("reads an empty workspace (no MEMORY.md, no memory/ dir)", async () => {
    // create an empty dir with no files
    const emptyDir = await mkdtemp(join(tmpdir(), "openclaw-empty-"));
    try {
      const emptyAdapter = new OpenClawAdapter(emptyDir);
      const result = await emptyAdapter.read();
      expect(result.records).toHaveLength(0);
      expect(result.partial).toBe(false);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  // --- write() --------------------------------------------------------------

  it("write() returns success=false in MVP", async () => {
    const result = await adapter.read();
    const record = result.records[0]!;
    const writeResult = await adapter.write(record);
    expect(writeResult.success).toBe(false);
    expect(writeResult.error).toBeTruthy();
  });

  // --- sync() ---------------------------------------------------------------

  it("sync() detects all records as added when existing is empty", async () => {
    const scanResult = await adapter.sync([]);
    expect(scanResult.added).toHaveLength(3);
    expect(scanResult.updated).toHaveLength(0);
    expect(scanResult.removed).toHaveLength(0);
    expect(scanResult.unchanged).toBe(0);
    expect(scanResult.errors).toHaveLength(0);
  });

  it("sync() marks unchanged records when hashes match", async () => {
    const { records } = await adapter.read();
    const scanResult = await adapter.sync(records);
    expect(scanResult.added).toHaveLength(0);
    expect(scanResult.updated).toHaveLength(0);
    expect(scanResult.removed).toHaveLength(0);
    expect(scanResult.unchanged).toBe(3);
  });

  it("sync() detects updated record when hash changes", async () => {
    const { records } = await adapter.read();
    // Tamper the hash of the first record
    const tampered = records.map((r, i) =>
      i === 0 ? { ...r, version_hash: "sha256:deadbeef" } : r,
    );
    const scanResult = await adapter.sync(tampered);
    expect(scanResult.updated).toHaveLength(1);
    expect(scanResult.unchanged).toBe(2);
  });

  it("sync() detects removed record when file disappears from index", async () => {
    const { records } = await adapter.read();
    // Pretend there's an extra record that is no longer on disk
    const ghost: typeof records[0] = {
      ...records[0]!,
      record_id: "openclaw:ghost.md",
      source_object_id: join(tmpDir, "memory", "ghost.md"),
      source_path: join(tmpDir, "memory", "ghost.md"),
    };
    const scanResult = await adapter.sync([...records, ghost]);
    expect(scanResult.removed).toContain("openclaw:ghost.md");
    expect(scanResult.unchanged).toBe(3);
  });
});
