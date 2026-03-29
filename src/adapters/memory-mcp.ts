import type { MemoryAdapter, ReadResult, WriteResult, SyncScanResult } from "./base.js";
import type { AdapterCapability, IndexRecord } from "../core/schema.js";

export interface McpCapabilityReport {
  tools: string[];
  resources?: string[];
}

const READ_KEYWORDS = ["memory", "remember", "recall", "get", "list"];
const WRITE_KEYWORDS = ["memory", "remember", "store", "add"];
const SEARCH_KEYWORDS = ["search", "recall"];
const SYNC_KEYWORDS = ["memory", "list", "get"];

function toolsMatchAny(tools: string[], keywords: string[]): boolean {
  return tools.some((tool) =>
    keywords.some((kw) => tool.toLowerCase().includes(kw))
  );
}

export function detectMemoryCapabilities(report: McpCapabilityReport): {
  canRead: boolean;
  canWrite: boolean;
  canSearch: boolean;
  canSync: boolean;
} {
  const { tools } = report;
  return {
    canRead: toolsMatchAny(tools, READ_KEYWORDS),
    canWrite: toolsMatchAny(tools, WRITE_KEYWORDS),
    canSearch: toolsMatchAny(tools, SEARCH_KEYWORDS),
    canSync: toolsMatchAny(tools, SYNC_KEYWORDS),
  };
}

export function isMemoryMcpServer(report: McpCapabilityReport): boolean {
  const { canRead, canWrite, canSearch } = detectMemoryCapabilities(report);
  return canRead && (canWrite || canSearch);
}

export class MemoryMcpAdapter implements MemoryAdapter {
  readonly capability: AdapterCapability;

  constructor(
    serverId: string,
    displayName: string,
    caps: { canRead: boolean; canWrite: boolean; canSearch: boolean; canSync: boolean }
  ) {
    this.capability = {
      adapter_id: serverId,
      adapter_class: "memory_mcp",
      display_name: displayName,
      can_read: caps.canRead,
      can_write: caps.canWrite,
      can_search: caps.canSearch,
      can_sync: caps.canSync,
      can_auto_capture: false,
      source_of_truth_role: "delegated_truth",
      supported_scopes: ["project", "cross_project"],
    };
  }

  async read(): Promise<ReadResult> {
    return { records: [], partial: true, errors: ["MCP read requires runtime connection"] };
  }

  async write(_record: IndexRecord): Promise<WriteResult> {
    return { success: false, error: "MCP write requires runtime connection" };
  }

  async sync(_existingRecords: IndexRecord[]): Promise<SyncScanResult> {
    return { added: [], updated: [], removed: [], unchanged: 0, errors: ["MCP sync requires runtime connection"] };
  }
}
