import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CursorAdapter } from "../../src/adapters/cursor.js";
import { IndexRecordSchema } from "../../src/core/schema.js";

// --- Fixture helpers ---

async function createFixture(projectDir: string): Promise<void> {
  const rulesDir = join(projectDir, ".cursor", "rules");
  await mkdir(rulesDir, { recursive: true });

  // A .mdc file with frontmatter
  await writeFile(
    join(rulesDir, "my-rule.mdc"),
    `---
description: My custom rule for TypeScript
globs: **/*.ts
---

Always prefer const over let.
`,
    "utf-8"
  );

  // A plain .md file (no frontmatter)
  await writeFile(
    join(rulesDir, "README.md"),
    `# Rules\n\nThis directory contains Cursor rules.\n`,
    "utf-8"
  );
}

// --- Tests ---

describe("CursorAdapter", () => {
  let tmpDir: string;
  let adapter: CursorAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cursor-adapter-test-"));
    await createFixture(tmpDir);
    adapter = new CursorAdapter(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // --- capability ---

  it("declares adapter_class as context_memory", () => {
    expect(adapter.capability.adapter_class).toBe("context_memory");
  });

  it("declares source_of_truth_role as context_truth", () => {
    expect(adapter.capability.source_of_truth_role).toBe("context_truth");
  });

  it("declares adapter_id as cursor", () => {
    expect(adapter.capability.adapter_id).toBe("cursor");
  });

  it("declares can_read true, can_write false, can_sync true, can_search false, can_auto_capture false", () => {
    expect(adapter.capability.can_read).toBe(true);
    expect(adapter.capability.can_write).toBe(false);
    expect(adapter.capability.can_sync).toBe(true);
    expect(adapter.capability.can_search).toBe(false);
    expect(adapter.capability.can_auto_capture).toBe(false);
  });

  it("declares supported_scopes containing project", () => {
    expect(adapter.capability.supported_scopes).toContain("project");
  });

  // --- read() ---

  it("read() discovers .mdc and .md files in .cursor/rules/", async () => {
    const result = await adapter.read();
    expect(result.errors).toHaveLength(0);
    expect(result.partial).toBe(false);
    expect(result.records).toHaveLength(2);
  });

  it("read() returns valid IndexRecord objects", async () => {
    const result = await adapter.read();
    for (const rec of result.records) {
      const parsed = IndexRecordSchema.safeParse(rec);
      expect(parsed.success).toBe(true);
    }
  });

  it("read() sets source_system to cursor", async () => {
    const result = await adapter.read();
    for (const rec of result.records) {
      expect(rec.source_system).toBe("cursor");
    }
  });

  it("read() sets kind to reference", async () => {
    const result = await adapter.read();
    for (const rec of result.records) {
      expect(rec.kind).toBe("reference");
    }
  });

  it("read() sets scope to project", async () => {
    const result = await adapter.read();
    for (const rec of result.records) {
      expect(rec.scope).toBe("project");
    }
  });

  it("read() parses frontmatter description from .mdc file", async () => {
    const result = await adapter.read();
    const mdcRecord = result.records.find((r) => r.source_path.endsWith("my-rule.mdc"));
    expect(mdcRecord).toBeDefined();
    expect(mdcRecord?.summary).toBe("My custom rule for TypeScript");
  });

  it("read() sets title from filename for .mdc file", async () => {
    const result = await adapter.read();
    const mdcRecord = result.records.find((r) => r.source_path.endsWith("my-rule.mdc"));
    expect(mdcRecord?.title).toBe("my-rule");
  });

  it("read() sets title from filename for .md file", async () => {
    const result = await adapter.read();
    const mdRecord = result.records.find((r) => r.source_path.endsWith("README.md"));
    expect(mdRecord?.title).toBe("README");
  });

  it("read() generates a version_hash for each record", async () => {
    const result = await adapter.read();
    for (const rec of result.records) {
      expect(rec.version_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("read() returns empty records when .cursor/rules/ does not exist", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "cursor-empty-test-"));
    try {
      const emptyAdapter = new CursorAdapter(emptyDir);
      const result = await emptyAdapter.read();
      expect(result.records).toHaveLength(0);
      expect(result.partial).toBe(false);
      expect(result.errors).toHaveLength(0);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  // --- write() ---

  it("write() returns success=false with an error message", async () => {
    const { records } = await adapter.read();
    expect(records.length).toBeGreaterThan(0);
    const result = await adapter.write(records[0]!);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  // --- sync() ---

  it("sync() reports all records as added when existingRecords is empty", async () => {
    const result = await adapter.sync([]);
    expect(result.added).toHaveLength(2);
    expect(result.updated).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.unchanged).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("sync() reports unchanged when existing records match current hashes", async () => {
    const { records } = await adapter.read();
    const result = await adapter.sync(records);
    expect(result.unchanged).toBe(2);
    expect(result.added).toHaveLength(0);
    expect(result.updated).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it("sync() detects updated record when file content changes", async () => {
    const { records } = await adapter.read();

    // Modify the .mdc file
    const rulesDir = join(tmpDir, ".cursor", "rules");
    await writeFile(
      join(rulesDir, "my-rule.mdc"),
      `---
description: Updated description
globs: **/*.ts
---

New content here.
`,
      "utf-8"
    );

    const result = await adapter.sync(records);
    expect(result.updated).toHaveLength(1);
    expect(result.unchanged).toBe(1);
    expect(result.added).toHaveLength(0);
  });

  it("sync() detects removed record when file is deleted", async () => {
    const { records } = await adapter.read();

    // Delete the .md file
    await rm(join(tmpDir, ".cursor", "rules", "README.md"));

    const result = await adapter.sync(records);
    expect(result.removed).toHaveLength(1);
    expect(result.unchanged).toBe(1);
    expect(result.added).toHaveLength(0);
  });
});
