import { describe, it, expect } from "vitest";

// These imports will fail until we implement the modules
import {
  IndexRecordSchema,
  AdapterCapabilitySchema,
  type IndexRecord,
  type AdapterCapability,
} from "../../src/core/schema.js";

describe("IndexRecordSchema", () => {
  const validRecord: IndexRecord = {
    record_id: "rec_abc123",
    source_system: "claude_code",
    source_object_id: "memory_user_role",
    source_path: "~/.claude/projects/myproject/memory/user_role.md",
    scope: "project",
    kind: "preference",
    truth_mode: "native_project_truth",
    title: "User prefers TDD workflow",
    summary: "User is a senior engineer who prefers test-driven development",
    keywords: ["tdd", "testing", "workflow"],
    created_at: "2026-03-29T10:00:00Z",
    updated_at: "2026-03-29T10:00:00Z",
    capture_mode: "manual",
    preferred_write_target: "claude_code",
    sync_strategy: "manual_only",
    version_hash: "sha256:abc123def456",
    status: "active",
  };

  it("accepts a valid MVP record", () => {
    const result = IndexRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
  });

  it("rejects record missing required fields", () => {
    const { record_id: _, ...incomplete } = validRecord;
    const result = IndexRecordSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("rejects invalid scope value", () => {
    const result = IndexRecordSchema.safeParse({
      ...validRecord,
      scope: "galaxy",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid kind value", () => {
    const result = IndexRecordSchema.safeParse({
      ...validRecord,
      kind: "dream",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status value", () => {
    const result = IndexRecordSchema.safeParse({
      ...validRecord,
      status: "deleted",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid capture_mode", () => {
    const result = IndexRecordSchema.safeParse({
      ...validRecord,
      capture_mode: "telepathy",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sync_strategy", () => {
    const result = IndexRecordSchema.safeParse({
      ...validRecord,
      sync_strategy: "realtime",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional extended fields", () => {
    const extended = {
      ...validRecord,
      source_uri: "file:///home/user/.claude/memory/user_role.md",
      project_id: "proj_123",
      visibility: "private" as const,
      aliases: ["test-first"],
      entities: ["TDD"],
      related_record_ids: ["rec_xyz789"],
      embedding_status: "pending" as const,
    };
    const result = IndexRecordSchema.safeParse(extended);
    expect(result.success).toBe(true);
  });

  it("preserves all fields through parse", () => {
    const result = IndexRecordSchema.parse(validRecord);
    expect(result.record_id).toBe("rec_abc123");
    expect(result.source_system).toBe("claude_code");
    expect(result.keywords).toEqual(["tdd", "testing", "workflow"]);
  });
});

describe("AdapterCapabilitySchema", () => {
  const validCapability: AdapterCapability = {
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
  };

  it("accepts a valid adapter capability", () => {
    const result = AdapterCapabilitySchema.safeParse(validCapability);
    expect(result.success).toBe(true);
  });

  it("rejects invalid adapter_class", () => {
    const result = AdapterCapabilitySchema.safeParse({
      ...validCapability,
      adapter_class: "magic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty supported_scopes", () => {
    const result = AdapterCapabilitySchema.safeParse({
      ...validCapability,
      supported_scopes: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts memory_mcp adapter class", () => {
    const mcpAdapter = {
      ...validCapability,
      adapter_id: "mem0",
      adapter_class: "memory_mcp" as const,
      source_of_truth_role: "delegated_truth",
    };
    const result = AdapterCapabilitySchema.safeParse(mcpAdapter);
    expect(result.success).toBe(true);
  });
});
