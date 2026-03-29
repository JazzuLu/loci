import { MemoryMcpAdapter, isMemoryMcpServer, detectMemoryCapabilities } from "../adapters/memory-mcp.js";
import type { McpCapabilityReport } from "../adapters/memory-mcp.js";

export function discoverMemoryMcpServers(
  mcpConfig: Record<string, McpCapabilityReport>
): MemoryMcpAdapter[] {
  const adapters: MemoryMcpAdapter[] = [];
  for (const [serverId, report] of Object.entries(mcpConfig)) {
    if (!isMemoryMcpServer(report)) continue;
    const caps = detectMemoryCapabilities(report);
    adapters.push(new MemoryMcpAdapter(serverId, serverId, caps));
  }
  return adapters;
}
