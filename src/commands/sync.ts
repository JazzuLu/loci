/**
 * MVP sync command: shows available adapters and sync model status.
 * Real adapter sync is not yet connected.
 */

interface AdapterSyncInfo {
  id: string;
  displayName: string;
  syncStrategy: string;
  available: boolean;
}

const MVP_ADAPTER_SYNC_INFO: AdapterSyncInfo[] = [
  {
    id: "loci_canonical",
    displayName: "Loci Canonical Store",
    syncStrategy: "manual_only",
    available: true,
  },
  {
    id: "claude_native",
    displayName: "Claude Native Memory",
    syncStrategy: "hook_driven",
    available: false,
  },
  {
    id: "cursor_rules",
    displayName: "Cursor Rules (.cursor/rules/)",
    syncStrategy: "scan_on_demand",
    available: false,
  },
  {
    id: "memory_mcp",
    displayName: "Memory MCP Server",
    syncStrategy: "hook_driven",
    available: false,
  },
];

export async function sync(_args: string[]): Promise<void> {
  console.log("loci sync — adapter status\n");

  for (const adapter of MVP_ADAPTER_SYNC_INFO) {
    const statusStr = adapter.available ? "available" : "not connected";
    console.log(`  [${adapter.available ? "✓" : " "}] ${adapter.displayName}`);
    console.log(`        id:       ${adapter.id}`);
    console.log(`        strategy: ${adapter.syncStrategy}`);
    console.log(`        status:   ${statusStr}`);
    console.log();
  }

  console.log(
    "Note: Manual sync is not yet connected to real adapters. " +
      "The sync model is in place and will be wired in a future release."
  );
}
