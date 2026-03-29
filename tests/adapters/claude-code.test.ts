import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { IndexRecordSchema } from "../../src/core/schema.js";

// --- fixture helpers ---

async function createMemoryFixture(projectDir: string): Promise<void> {
  const memDir = join(projectDir, ".claude", "projects", "testproject", "memory");
  await mkdir(memDir, { recursive: true });

  await writeFile(
    join(memDir, "coding-style.md"),
    `---
name: Coding Style
description: Always use TypeScript strict mode.
type: preference
---

Always use TypeScript strict mode.
`.trim(),
  );

  await writeFile(
    join(memDir, "deployment-workflow.md"),
    `---
name: Deployment Workflow
description: Run tests then deploy to staging first.
type: workflow
---

Run tests then deploy to staging first.
`.trim(),
  );
}

async function createClaudeMd(projectDir: string, content = "# Project Instructions\n\nUse TDD."): Promise<void> {
  await writeFile(join(projectDir, "CLAUDE.md"), content);
}

// --- tests ---

describe("ClaudeCodeAdapter capability", () => {
  let tmpDir: string;
  let adapter: ClaudeCodeAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-claude-code-test-"));
    adapter = new ClaudeCodeAdapter(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("declares adapter_class as native_memory", () => {
    expect(adapter.capability.adapter_class).toBe("native_memory");
  });

  it("declares source_of_truth_role as native_project_truth", () => {
    expect(adapter.capability.source_of_truth_role).toBe("native_project_truth");
  });

  it("declares can_read, can_write, can_sync true and can_search false", () => {
    expect(adapter.capability.can_read).toBe(true);
    expect(adapter.capability.can_write).toBe(true);
    expect(adapter.capability.can_sync).toBe(true);
    expect(adapter.capability.can_search).toBe(false);
  });

  it("declares can_auto_capture true", () => {
    expect(adapter.capability.can_auto_capture).toBe(true);
  });

  it("declares adapter_id as claude_code", () => {
    expect(adapter.capability.adapter_id).toBe("claude_code");
  });

  it("declares display_name as Claude Code", () => {
    expect(adapter.capability.display_name).toBe("Claude Code");
  });

  it("declares supported_scopes containing session and project", () => {
    expect(adapter.capability.supported_scopes).toContain("session");
    expect(adapter.capability.supported_scopes).toContain("project");
  });
});

describe("ClaudeCodeAdapter read()", () => {
  let tmpDir: string;
  let adapter: ClaudeCodeAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-claude-code-test-"));
    adapter = new ClaudeCodeAdapter(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty records when no .claude dir and no CLAUDE.md", async () => {
    const result = await adapter.read();
    expect(result.records).toHaveLength(0);
    expect(result.partial).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it("discovers memory files in .claude/projects/*/memory/", async () => {
    await createMemoryFixture(tmpDir);
    const result = await adapter.read();
    expect(result.records.length).toBeGreaterThanOrEqual(2);
    expect(result.errors).toHaveLength(0);
  });

  it("discovers CLAUDE.md in project root", async () => {
    await createClaudeMd(tmpDir);
    const result = await adapter.read();
    const claudeMdRecord = result.records.find((r) => r.title === "CLAUDE.md project instructions");
    expect(claudeMdRecord).toBeDefined();
  });

  it("discovers both memory files and CLAUDE.md", async () => {
    await createMemoryFixture(tmpDir);
    await createClaudeMd(tmpDir);
    const result = await adapter.read();
    expect(result.records.length).toBeGreaterThanOrEqual(3);
  });

  it("parses YAML frontmatter: name → title, description → summary, type → kind", async () => {
    await createMemoryFixture(tmpDir);
    const result = await adapter.read();
    const pref = result.records.find((r) => r.title === "Coding Style");
    expect(pref).toBeDefined();
    expect(pref?.summary).toBe("Always use TypeScript strict mode.");
    expect(pref?.kind).toBe("preference");
  });

  it("parses workflow type correctly", async () => {
    await createMemoryFixture(tmpDir);
    const result = await adapter.read();
    const wf = result.records.find((r) => r.title === "Deployment Workflow");
    expect(wf?.kind).toBe("workflow");
  });

  it("CLAUDE.md record has kind=reference and scope=project", async () => {
    await createClaudeMd(tmpDir);
    const result = await adapter.read();
    const rec = result.records.find((r) => r.title === "CLAUDE.md project instructions");
    expect(rec?.kind).toBe("reference");
    expect(rec?.scope).toBe("project");
  });

  it("sets source_system=claude_code on all records", async () => {
    await createMemoryFixture(tmpDir);
    await createClaudeMd(tmpDir);
    const result = await adapter.read();
    for (const rec of result.records) {
      expect(rec.source_system).toBe("claude_code");
    }
  });

  it("sets capture_mode=sync_scan on all records", async () => {
    await createMemoryFixture(tmpDir);
    const result = await adapter.read();
    for (const rec of result.records) {
      expect(rec.capture_mode).toBe("sync_scan");
    }
  });

  it("returns valid IndexRecord objects (schema-validated)", async () => {
    await createMemoryFixture(tmpDir);
    await createClaudeMd(tmpDir);
    const result = await adapter.read();
    expect(result.records.length).toBeGreaterThan(0);
    for (const rec of result.records) {
      const parsed = IndexRecordSchema.safeParse(rec);
      expect(parsed.success).toBe(true);
    }
  });

  it("sets version_hash with sha256: prefix", async () => {
    await createMemoryFixture(tmpDir);
    const result = await adapter.read();
    for (const rec of result.records) {
      expect(rec.version_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });
});

describe("ClaudeCodeAdapter write()", () => {
  let tmpDir: string;
  let adapter: ClaudeCodeAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-claude-code-test-"));
    adapter = new ClaudeCodeAdapter(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns success=false for MVP write policy", async () => {
    const record = makeRecord();
    const result = await adapter.write(record);
    expect(result.success).toBe(false);
  });

  it("returns error message explaining write is not yet implemented", async () => {
    const record = makeRecord();
    const result = await adapter.write(record);
    expect(result.error).toContain("not yet implemented");
  });
});

describe("ClaudeCodeAdapter sync()", () => {
  let tmpDir: string;
  let adapter: ClaudeCodeAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-claude-code-test-"));
    adapter = new ClaudeCodeAdapter(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects new files as added when existing records is empty", async () => {
    await createMemoryFixture(tmpDir);
    const result = await adapter.sync([]);
    expect(result.added.length).toBeGreaterThanOrEqual(2);
    expect(result.updated).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it("detects unchanged records when hashes match", async () => {
    await createMemoryFixture(tmpDir);
    const { records } = await adapter.read();
    const result = await adapter.sync(records);
    expect(result.unchanged).toBe(records.length);
    expect(result.added).toHaveLength(0);
    expect(result.updated).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it("detects changed file as updated when hash differs", async () => {
    await createMemoryFixture(tmpDir);
    const { records } = await adapter.read();
    // Tamper with the hash of one record to simulate stale index
    const staleRecords = records.map((r, i) =>
      i === 0 ? { ...r, version_hash: "sha256:000000" } : r,
    );
    const result = await adapter.sync(staleRecords);
    expect(result.updated).toHaveLength(1);
    expect(result.unchanged).toBe(records.length - 1);
  });

  it("detects removed files when they no longer exist on disk", async () => {
    await createMemoryFixture(tmpDir);
    const { records } = await adapter.read();
    // Remove all files from disk, adapter now sees nothing
    await rm(join(tmpDir, ".claude"), { recursive: true, force: true });
    const result = await adapter.sync(records);
    expect(result.removed).toHaveLength(records.length);
    expect(result.added).toHaveLength(0);
  });
});

// --- helpers ---

import type { IndexRecord } from "../../src/core/schema.js";

function makeRecord(overrides: Partial<IndexRecord> = {}): IndexRecord {
  return {
    record_id: "rec_test001",
    source_system: "claude_code",
    source_object_id: "/tmp/test/.claude/projects/test/memory/test.md",
    source_path: "/tmp/test/.claude/projects/test/memory/test.md",
    scope: "project",
    kind: "fact",
    truth_mode: "native_project_truth",
    title: "Test Memory Entry",
    summary: "A native memory for unit tests.",
    keywords: ["test", "native"],
    created_at: "2026-03-29T10:00:00Z",
    updated_at: "2026-03-29T10:00:00Z",
    capture_mode: "sync_scan",
    preferred_write_target: "claude_code",
    sync_strategy: "scan_on_demand",
    version_hash: "sha256:aaa111",
    status: "active",
    ...overrides,
  };
}
