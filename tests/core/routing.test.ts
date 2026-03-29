import { describe, it, expect } from "vitest";
import { routeWrite } from "../../src/core/routing.js";
import type { AdapterCapability } from "../../src/core/schema.js";
import type { RoutingInput } from "../../src/core/routing.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const nativeAdapter: AdapterCapability = {
  adapter_id: "claude_code",
  adapter_class: "native_memory",
  display_name: "Claude Code Memory",
  can_read: true,
  can_write: true,
  can_search: true,
  can_sync: true,
  can_auto_capture: true,
  source_of_truth_role: "native_project_truth",
  supported_scopes: ["session", "project"],
};

const canonicalAdapter: AdapterCapability = {
  adapter_id: "loci_canonical",
  adapter_class: "canonical_memory",
  display_name: "Loci Canonical Store",
  can_read: true,
  can_write: true,
  can_search: true,
  can_sync: true,
  can_auto_capture: false,
  source_of_truth_role: "canonical_truth",
  supported_scopes: ["cross_project", "personal", "team"],
};

const readOnlyAdapter: AdapterCapability = {
  adapter_id: "cursor_readonly",
  adapter_class: "native_memory",
  display_name: "Cursor Read-Only",
  can_read: true,
  can_write: false,
  can_search: true,
  can_sync: false,
  can_auto_capture: false,
  source_of_truth_role: "delegated_truth",
  supported_scopes: ["session", "project"],
};

const allAdapters = [nativeAdapter, canonicalAdapter, readOnlyAdapter];

// ---------------------------------------------------------------------------
// Helper to build a RoutingInput quickly
// ---------------------------------------------------------------------------
function makeInput(
  overrides: Partial<RoutingInput> & { keywords?: string[] }
): RoutingInput {
  return {
    title: overrides.title ?? "test memory",
    summary: overrides.summary ?? "some summary",
    keywords: overrides.keywords ?? ["test"],
    explicit_target: overrides.explicit_target,
    adapter_capabilities: overrides.adapter_capabilities ?? allAdapters,
  };
}

// ---------------------------------------------------------------------------
// 1. Explicit user target override
// ---------------------------------------------------------------------------
describe("explicit target override", () => {
  it("routes to the explicitly requested writable adapter", () => {
    const decision = routeWrite(
      makeInput({
        title: "project config",
        summary: "use tabs in this repo",
        keywords: ["project"],
        explicit_target: "claude_code",
      })
    );

    expect(decision.target_adapter_id).toBe("claude_code");
    expect(decision.action).toBe("native_write");
    expect(decision.reason).toContain("claude_code");
  });

  it("routes to canonical adapter when user explicitly requests it", () => {
    const decision = routeWrite(
      makeInput({
        title: "global preference",
        summary: "I prefer tabs everywhere",
        keywords: ["personal", "preference"],
        explicit_target: "loci_canonical",
      })
    );

    expect(decision.target_adapter_id).toBe("loci_canonical");
    expect(decision.action).toBe("canonical_write");
  });
});

// ---------------------------------------------------------------------------
// 2. Default routing rules
// ---------------------------------------------------------------------------
describe("default routing", () => {
  it("routes project-scoped content to native adapter", () => {
    const decision = routeWrite(
      makeInput({
        title: "repo style guide",
        summary: "we use 2-space indentation in this project",
        keywords: ["project", "workspace"],
      })
    );

    expect(decision.target_adapter_id).toBe("claude_code");
    expect(decision.action).toBe("native_write");
    expect(decision.scope).toBe("project");
  });

  it("routes session-scoped content to native/context adapter", () => {
    const decision = routeWrite(
      makeInput({
        title: "session scratch",
        summary: "temporary note for this session only",
        keywords: ["session", "temporary"],
      })
    );

    expect(decision.action).toBe("native_write");
    expect(decision.scope).toBe("session");
  });

  it("routes cross-project content to loci canonical adapter", () => {
    const decision = routeWrite(
      makeInput({
        title: "global linting rule",
        summary: "I use eslint everywhere across all projects",
        keywords: ["global", "cross-project"],
      })
    );

    expect(decision.target_adapter_id).toBe("loci_canonical");
    expect(decision.action).toBe("canonical_write");
    expect(decision.scope).toBe("cross_project");
  });

  it("routes personal-scoped content to canonical adapter", () => {
    const decision = routeWrite(
      makeInput({
        title: "personal style",
        summary: "I prefer dark mode always",
        keywords: ["personal", "preference"],
      })
    );

    expect(decision.target_adapter_id).toBe("loci_canonical");
    expect(decision.action).toBe("canonical_write");
    expect(decision.scope).toBe("personal");
  });

  it("falls back to index_only when no matching adapter exists", () => {
    const decision = routeWrite(
      makeInput({
        title: "external library note",
        summary: "react docs tip",
        keywords: ["global", "everywhere"],
        // Only provide read-only adapters → no writable canonical
        adapter_capabilities: [readOnlyAdapter],
      })
    );

    expect(decision.action).toBe("index_only");
    expect(decision.target_adapter_id).toBe("loci_index");
  });

  it("falls back to index_only for project scope when no native adapter is writable", () => {
    const decision = routeWrite(
      makeInput({
        title: "repo config",
        summary: "project specific setting",
        keywords: ["project", "repo"],
        adapter_capabilities: [readOnlyAdapter],
      })
    );

    expect(decision.action).toBe("index_only");
  });
});

// ---------------------------------------------------------------------------
// 3. Illegal target rejection
// ---------------------------------------------------------------------------
describe("illegal target rejection", () => {
  it("throws when explicit target adapter does not exist", () => {
    expect(() =>
      routeWrite(
        makeInput({
          title: "test",
          summary: "summary",
          keywords: ["project"],
          explicit_target: "nonexistent_adapter",
        })
      )
    ).toThrow(/not found/);
  });

  it("throws when explicit target adapter is read-only", () => {
    expect(() =>
      routeWrite(
        makeInput({
          title: "test",
          summary: "summary",
          keywords: ["project"],
          explicit_target: "cursor_readonly",
        })
      )
    ).toThrow(/read-only/);
  });

  it("throws when explicit target does not support the classified scope", () => {
    // nativeAdapter only supports session and project scopes
    // content is classified as "personal" scope
    expect(() =>
      routeWrite(
        makeInput({
          title: "personal preference",
          summary: "I always prefer tabs globally everywhere",
          keywords: ["personal", "preference", "global"],
          explicit_target: "claude_code", // only supports session/project
        })
      )
    ).toThrow(/does not support scope/);
  });
});

// ---------------------------------------------------------------------------
// 4. Content classification
// ---------------------------------------------------------------------------
describe("content classification", () => {
  it("classifies preference content correctly", () => {
    const decision = routeWrite(
      makeInput({
        title: "editor preference",
        summary: "I always use vim keybindings",
        keywords: ["personal", "preference"],
      })
    );
    expect(decision.kind).toBe("preference");
    expect(decision.scope).toBe("personal");
  });

  it("classifies decision content correctly", () => {
    const decision = routeWrite(
      makeInput({
        title: "architecture decision",
        summary: "we decided to use postgres for this project",
        keywords: ["project", "decided"],
      })
    );
    expect(decision.kind).toBe("decision");
    expect(decision.scope).toBe("project");
  });

  it("classifies incident content correctly", () => {
    const decision = routeWrite(
      makeInput({
        title: "deploy bug",
        summary: "there was an error in the deploy pipeline",
        keywords: ["bug", "project"],
      })
    );
    expect(decision.kind).toBe("incident");
  });

  it("classifies workflow content correctly", () => {
    const decision = routeWrite(
      makeInput({
        title: "release process",
        summary: "the workflow for releasing a new version",
        keywords: ["workflow", "project"],
      })
    );
    expect(decision.kind).toBe("workflow");
  });

  it("classifies fact content correctly", () => {
    const decision = routeWrite(
      makeInput({
        title: "discovery",
        summary: "I discovered that vite is faster than webpack",
        keywords: ["learned", "project"],
      })
    );
    expect(decision.kind).toBe("fact");
  });

  it("defaults kind to reference when no keyword matches", () => {
    const decision = routeWrite(
      makeInput({
        title: "some note",
        summary: "just a note about something",
        keywords: ["project"],
      })
    );
    expect(decision.kind).toBe("reference");
  });

  it("defaults scope to project when no keyword matches", () => {
    const decision = routeWrite(
      makeInput({
        title: "random note",
        summary: "just a note",
        keywords: ["code"],
        adapter_capabilities: allAdapters,
      })
    );
    // "code" doesn't trigger any scope keyword → falls back to project
    expect(decision.scope).toBe("project");
  });
});
