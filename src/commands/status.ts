import { IndexStore } from "../core/index-store.js";
import type { IndexRecord } from "../core/schema.js";

interface AdapterStatusEntry {
  id: string;
  displayName: string;
  available: boolean;
  note: string;
}

const MVP_ADAPTERS_STATUS: AdapterStatusEntry[] = [
  {
    id: "loci_canonical",
    displayName: "Loci Canonical Store",
    available: true,
    note: "active — local JSON index at ~/.loci/index.json",
  },
  {
    id: "claude_native",
    displayName: "Claude Native Memory",
    available: false,
    note: "not connected (planned: hook_driven sync)",
  },
  {
    id: "cursor_rules",
    displayName: "Cursor Rules (.cursor/rules/)",
    available: false,
    note: "not connected (planned: scan_on_demand sync)",
  },
  {
    id: "memory_mcp",
    displayName: "Memory MCP Server",
    available: false,
    note: "not connected (planned: hook_driven sync)",
  },
];

function countBy<T>(records: T[], key: keyof T): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    const val = String(r[key]);
    counts[val] = (counts[val] ?? 0) + 1;
  }
  return counts;
}

function printCounts(counts: Record<string, number>): void {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) {
    console.log("    (none)");
    return;
  }
  for (const [label, count] of entries) {
    console.log(`    ${label}: ${count}`);
  }
}

export async function status(): Promise<void> {
  const store = new IndexStore();
  const allRecords: IndexRecord[] = await store.query({});
  const total = allRecords.length;

  console.log("loci status\n");

  // --- Index stats ---
  console.log(`  Total records: ${total}`);
  console.log();

  console.log("  By source_system:");
  printCounts(countBy(allRecords, "source_system"));
  console.log();

  console.log("  By status:");
  printCounts(countBy(allRecords, "status"));
  console.log();

  console.log("  By scope:");
  printCounts(countBy(allRecords, "scope"));
  console.log();

  // --- Adapter availability ---
  console.log("  Adapters:");
  for (const adapter of MVP_ADAPTERS_STATUS) {
    const flag = adapter.available ? "✓" : " ";
    console.log(`    [${flag}] ${adapter.displayName}`);
    console.log(`          ${adapter.note}`);
  }
}
