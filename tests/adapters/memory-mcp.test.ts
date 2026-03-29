import { describe, it, expect } from "vitest";
import {
  detectMemoryCapabilities,
  isMemoryMcpServer,
  MemoryMcpAdapter,
} from "../../src/adapters/memory-mcp.js";
import type { McpCapabilityReport } from "../../src/adapters/memory-mcp.js";
import { discoverMemoryMcpServers } from "../../src/lib/source-discovery.js";

// --- Capability detection ---

describe("detectMemoryCapabilities", () => {
  it("detects read capability from 'memory' tool name", () => {
    const report: McpCapabilityReport = { tools: ["get_memory", "store_memory"] };
    const caps = detectMemoryCapabilities(report);
    expect(caps.canRead).toBe(true);
  });

  it("detects write capability from 'store' tool name", () => {
    const report: McpCapabilityReport = { tools: ["store_note"] };
    const caps = detectMemoryCapabilities(report);
    expect(caps.canWrite).toBe(true);
  });

  it("detects search capability from 'search' tool name", () => {
    const report: McpCapabilityReport = { tools: ["search_memories"] };
    const caps = detectMemoryCapabilities(report);
    expect(caps.canSearch).toBe(true);
  });

  it("detects recall as both read and search", () => {
    const report: McpCapabilityReport = { tools: ["recall_fact"] };
    const caps = detectMemoryCapabilities(report);
    expect(caps.canRead).toBe(true);
    expect(caps.canSearch).toBe(true);
  });

  it("detects no capabilities for unrelated tools", () => {
    const report: McpCapabilityReport = { tools: ["run_query", "execute_sql", "fetch_row"] };
    const caps = detectMemoryCapabilities(report);
    expect(caps.canRead).toBe(false);
    expect(caps.canWrite).toBe(false);
    expect(caps.canSearch).toBe(false);
  });

  it("detects write via 'add' keyword", () => {
    const report: McpCapabilityReport = { tools: ["add_entry", "list_memories"] };
    const caps = detectMemoryCapabilities(report);
    expect(caps.canWrite).toBe(true);
  });

  it("detects write via 'remember' keyword", () => {
    const report: McpCapabilityReport = { tools: ["remember_this"] };
    const caps = detectMemoryCapabilities(report);
    expect(caps.canWrite).toBe(true);
    expect(caps.canRead).toBe(true);
  });
});

// --- isMemoryMcpServer ---

describe("isMemoryMcpServer", () => {
  it("returns true for server with read+write capabilities", () => {
    const report: McpCapabilityReport = {
      tools: ["get_memory", "store_memory"],
    };
    expect(isMemoryMcpServer(report)).toBe(true);
  });

  it("returns true for server with read+search capabilities", () => {
    const report: McpCapabilityReport = {
      tools: ["list_memories", "search_memories"],
    };
    expect(isMemoryMcpServer(report)).toBe(true);
  });

  it("returns false for server with only read capability", () => {
    const report: McpCapabilityReport = {
      tools: ["get_fact"],
    };
    // canRead=true, canWrite=false, canSearch=false -> rejected
    expect(isMemoryMcpServer(report)).toBe(false);
  });

  it("returns false for generic MCP server with no memory tools", () => {
    const report: McpCapabilityReport = {
      tools: ["run_query", "execute_sql", "create_table"],
    };
    expect(isMemoryMcpServer(report)).toBe(false);
  });

  it("returns false for empty tool list", () => {
    const report: McpCapabilityReport = { tools: [] };
    expect(isMemoryMcpServer(report)).toBe(false);
  });
});

// --- MemoryMcpAdapter ---

describe("MemoryMcpAdapter", () => {
  const caps = { canRead: true, canWrite: true, canSearch: false, canSync: true };

  it("declares adapter_class as memory_mcp", () => {
    const adapter = new MemoryMcpAdapter("my-memory-server", "My Memory Server", caps);
    expect(adapter.capability.adapter_class).toBe("memory_mcp");
  });

  it("sets adapter_id from serverId", () => {
    const adapter = new MemoryMcpAdapter("my-memory-server", "My Memory Server", caps);
    expect(adapter.capability.adapter_id).toBe("my-memory-server");
  });

  it("sets source_of_truth_role to delegated_truth", () => {
    const adapter = new MemoryMcpAdapter("srv", "Srv", caps);
    expect(adapter.capability.source_of_truth_role).toBe("delegated_truth");
  });

  it("supports project and cross_project scopes", () => {
    const adapter = new MemoryMcpAdapter("srv", "Srv", caps);
    expect(adapter.capability.supported_scopes).toContain("project");
    expect(adapter.capability.supported_scopes).toContain("cross_project");
  });

  it("maps capabilities from detectMemoryCapabilities", () => {
    const adapter = new MemoryMcpAdapter("srv", "Srv", caps);
    expect(adapter.capability.can_read).toBe(true);
    expect(adapter.capability.can_write).toBe(true);
    expect(adapter.capability.can_search).toBe(false);
    expect(adapter.capability.can_sync).toBe(true);
  });

  it("read() returns placeholder with error message", async () => {
    const adapter = new MemoryMcpAdapter("srv", "Srv", caps);
    const result = await adapter.read();
    expect(result.records).toEqual([]);
    expect(result.partial).toBe(true);
    expect(result.errors).toContain("MCP read requires runtime connection");
  });

  it("write() returns failure with error message", async () => {
    const adapter = new MemoryMcpAdapter("srv", "Srv", caps);
    const fakeRecord = {} as Parameters<typeof adapter.write>[0];
    const result = await adapter.write(fakeRecord);
    expect(result.success).toBe(false);
    expect(result.error).toBe("MCP write requires runtime connection");
  });

  it("sync() returns empty diff with error message", async () => {
    const adapter = new MemoryMcpAdapter("srv", "Srv", caps);
    const result = await adapter.sync([]);
    expect(result.added).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.unchanged).toBe(0);
    expect(result.errors).toContain("MCP sync requires runtime connection");
  });
});

// --- discoverMemoryMcpServers ---

describe("discoverMemoryMcpServers", () => {
  it("returns adapters only for valid memory MCP servers", () => {
    const config: Record<string, McpCapabilityReport> = {
      "memory-server": { tools: ["get_memory", "store_memory"] },
      "sql-server": { tools: ["run_query", "execute_sql"] },
    };
    const adapters = discoverMemoryMcpServers(config);
    expect(adapters).toHaveLength(1);
    expect(adapters[0]?.capability.adapter_id).toBe("memory-server");
  });

  it("returns empty array when no valid memory servers", () => {
    const config: Record<string, McpCapabilityReport> = {
      "sql-server": { tools: ["run_query"] },
      "file-server": { tools: ["read_file", "write_file"] },
    };
    const adapters = discoverMemoryMcpServers(config);
    expect(adapters).toHaveLength(0);
  });

  it("returns multiple adapters for multiple valid servers", () => {
    const config: Record<string, McpCapabilityReport> = {
      "mem-a": { tools: ["remember_this", "recall_fact"] },
      "mem-b": { tools: ["store_memory", "search_memory"] },
    };
    const adapters = discoverMemoryMcpServers(config);
    expect(adapters).toHaveLength(2);
  });

  it("sets adapter_class to memory_mcp on all returned adapters", () => {
    const config: Record<string, McpCapabilityReport> = {
      "mem-a": { tools: ["get_memory", "add_memory"] },
    };
    const adapters = discoverMemoryMcpServers(config);
    for (const adapter of adapters) {
      expect(adapter.capability.adapter_class).toBe("memory_mcp");
    }
  });
});
