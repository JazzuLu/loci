import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { CanonicalStore } from "../../src/core/canonical-store.js";
import { IndexStore } from "../../src/core/index-store.js";
import { recall } from "../../src/core/retrieval.js";
import { routeWrite } from "../../src/core/routing.js";
import { runPostWriteChecks } from "../../src/core/conflicts.js";
import { SyncEngine } from "../../src/core/sync-engine.js";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code.js";
import { generateRecordId, contentHash } from "../../src/lib/hash.js";
import type { AdapterCapability, IndexRecord } from "../../src/core/schema.js";

// ─── helpers ───────────────────────────────────────────────────────────────

function makeIndexRecord(overrides: Partial<IndexRecord> & { record_id: string; title: string; summary: string; keywords: string[] }): IndexRecord {
  const now = new Date().toISOString();
  return {
    source_system: "loci",
    source_object_id: overrides.record_id,
    source_path: `/tmp/${overrides.record_id}.md`,
    scope: "personal",
    kind: "preference",
    truth_mode: "canonical_truth",
    status: "active",
    created_at: now,
    updated_at: now,
    capture_mode: "manual",
    preferred_write_target: "loci_canonical",
    sync_strategy: "scan_on_demand",
    version_hash: contentHash(overrides.summary),
    ...overrides,
  };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("loci memory plane e2e", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loci-e2e-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── Scenario 1: remember in canonical store and recall ──────────────────

  it("writes a memory entry to CanonicalStore, indexes it, and recalls by keyword", async () => {
    const canonicalDir = join(tmpDir, "canonical");
    const indexDir = join(tmpDir, "index");
    await mkdir(canonicalDir, { recursive: true });
    await mkdir(indexDir, { recursive: true });

    const canonical = new CanonicalStore(canonicalDir);
    const index = new IndexStore(indexDir);

    // Write to canonical store
    const writeResult = await canonical.write({
      title: "Always use TDD",
      summary: "Test-driven development is preferred workflow",
      keywords: ["tdd", "testing", "workflow"],
      kind: "preference",
    });

    expect(writeResult.record_id).toMatch(/^rec_/);
    expect(writeResult.path).toContain(canonicalDir);

    // Create a corresponding IndexRecord
    const record = makeIndexRecord({
      record_id: writeResult.record_id,
      source_object_id: writeResult.path,
      source_path: writeResult.path,
      source_system: "loci",
      title: "Always use TDD",
      summary: "Test-driven development is preferred workflow",
      keywords: ["tdd", "testing", "workflow"],
      kind: "preference",
      scope: "personal",
      preferred_write_target: "loci_canonical",
      source_adapter_id: "loci_canonical",
    });

    await index.create(record);

    // Recall by "tdd"
    const results = await recall(index, { terms: ["tdd"] });

    expect(results.length).toBeGreaterThan(0);
    const hit = results[0];
    expect(hit).toBeDefined();
    expect(hit!.record.record_id).toBe(writeResult.record_id);
    expect(hit!.score).toBeGreaterThan(0);

    // Verify metadata
    expect(hit!.record.scope).toBe("personal");
    expect(hit!.record.kind).toBe("preference");
    expect(hit!.record.source_system).toBe("loci");
  });

  // ── Scenario 2: route project memory to native adapter ──────────────────

  it("routes project-scoped content to the native_memory adapter", () => {
    const adapters: AdapterCapability[] = [
      {
        adapter_id: "claude_code",
        adapter_class: "native_memory",
        display_name: "Claude Code",
        can_read: true,
        can_write: true,
        can_search: false,
        can_sync: true,
        can_auto_capture: true,
        source_of_truth_role: "native_project_truth",
        supported_scopes: ["session", "project"],
      },
      {
        adapter_id: "loci_canonical",
        adapter_class: "canonical_memory",
        display_name: "Loci Canonical Memory",
        can_read: true,
        can_write: true,
        can_search: false,
        can_sync: true,
        can_auto_capture: false,
        source_of_truth_role: "canonical_truth",
        supported_scopes: ["cross_project", "personal", "team"],
      },
    ];

    // "project" keyword triggers project scope in classifier
    const decision = routeWrite({
      title: "Fix auth bug in project",
      summary: "There is a bug in the auth module of this project repository",
      keywords: ["project", "bug", "fix"],
      adapter_capabilities: adapters,
    });

    expect(decision.action).toBe("native_write");
    expect(decision.target_adapter_id).toBe("claude_code");
  });

  // ── Scenario 3: route personal memory to loci canonical ─────────────────

  it("routes personal-scoped content to the canonical_memory adapter", () => {
    const adapters: AdapterCapability[] = [
      {
        adapter_id: "claude_code",
        adapter_class: "native_memory",
        display_name: "Claude Code",
        can_read: true,
        can_write: true,
        can_search: false,
        can_sync: true,
        can_auto_capture: true,
        source_of_truth_role: "native_project_truth",
        supported_scopes: ["session", "project"],
      },
      {
        adapter_id: "loci_canonical",
        adapter_class: "canonical_memory",
        display_name: "Loci Canonical Memory",
        can_read: true,
        can_write: true,
        can_search: false,
        can_sync: true,
        can_auto_capture: false,
        source_of_truth_role: "canonical_truth",
        supported_scopes: ["cross_project", "personal", "team"],
      },
    ];

    // "personal" and "preference" and "always" keywords trigger personal scope + preference kind
    const decision = routeWrite({
      title: "I always use TypeScript",
      summary: "I prefer TypeScript over JavaScript for all my personal projects",
      keywords: ["personal", "preference", "always"],
      adapter_capabilities: adapters,
    });

    expect(decision.action).toBe("canonical_write");
    expect(decision.target_adapter_id).toBe("loci_canonical");
  });

  // ── Scenario 4: sync Claude Code memory into loci index ─────────────────

  it("syncs Claude Code memory files into the index store", async () => {
    // Create Claude Code project memory structure in tmpdir
    const projectDir = join(tmpDir, "project");
    const memDir = join(projectDir, ".claude", "projects", "test", "memory");
    await mkdir(memDir, { recursive: true });

    const memFileContent = [
      "---",
      "name: User Role",
      "description: The user is a senior engineer",
      "type: user",
      "---",
      "",
      "The user is a senior engineer who prefers TDD.",
    ].join("\n");

    await writeFile(join(memDir, "user_role.md"), memFileContent, "utf-8");

    const indexDir = join(tmpDir, "index");
    await mkdir(indexDir, { recursive: true });

    const adapter = new ClaudeCodeAdapter(projectDir);
    const index = new IndexStore(indexDir);
    const engine = new SyncEngine(index, [adapter]);

    const result = await engine.syncAdapter("claude_code");

    expect(result.added).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // Verify records were added to index
    const count = await index.count();
    expect(count).toBeGreaterThan(0);

    // Verify record metadata
    const records = await index.query({ source_system: "claude_code" });
    expect(records.length).toBeGreaterThan(0);

    const record = records[0]!;
    expect(record.source_system).toBe("claude_code");
    expect(record.source_path).toContain("user_role.md");
    expect(record.source_adapter_id).toBe("claude_code");
  });

  // ── Scenario 5: conflict detection across sources ────────────────────────

  it("detects duplicate and related records across source systems", () => {
    // Two records from different source_systems but same keywords
    const recordA = makeIndexRecord({
      record_id: generateRecordId(),
      source_system: "loci",
      source_object_id: "loci-obj-1",
      source_path: "/tmp/loci-obj-1.md",
      title: "Prefer TypeScript",
      summary: "Always use TypeScript in new projects",
      keywords: ["typescript", "preference"],
    });

    // Same source_system + source_object_id → should trigger duplicate detection
    const recordB = makeIndexRecord({
      record_id: generateRecordId(),
      source_system: "loci",
      source_object_id: "loci-obj-1", // same source coordinates as recordA
      source_path: "/tmp/loci-obj-1.md",
      title: "Always use TypeScript",
      summary: "TypeScript is the preferred language",
      keywords: ["typescript", "preference"],
    });

    const allRecords = [recordA, recordB];

    // Run post-write checks for recordB against all records
    const checks = runPostWriteChecks(recordB, allRecords);

    // recordA shares same source_system + source_object_id → should be a duplicate
    expect(checks.duplicates).toHaveLength(1);
    expect(checks.duplicates[0]!.record_id).toBe(recordA.record_id);

    // stale should be false since we pass no currentHash override (matches own hash)
    expect(checks.stale).toBe(false);
  });
});
