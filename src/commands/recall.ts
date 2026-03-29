import { IndexStore } from "../core/index-store.js";
import type { IndexRecord } from "../core/schema.js";

/**
 * Check if a record matches the query string.
 * Matches against: keywords (exact word), title (substring).
 */
function matchesQuery(record: IndexRecord, queryTerms: string[]): boolean {
  if (queryTerms.length === 0) return true;

  const titleLower = record.title.toLowerCase();
  const keywordsLower = record.keywords.map((k) => k.toLowerCase());

  return queryTerms.some((term) => {
    const t = term.toLowerCase();
    return titleLower.includes(t) || keywordsLower.some((k) => k.includes(t));
  });
}

export async function recall(args: string[]): Promise<void> {
  const query = args.join(" ").trim();
  const queryTerms = query.split(/\s+/).filter((t) => t.length > 0);

  const store = new IndexStore();
  const allRecords = await store.query({});

  const matches = allRecords.filter((r) => matchesQuery(r, queryTerms));

  if (matches.length === 0) {
    console.log("No memories found");
    return;
  }

  console.log(`Found ${matches.length} memory(ies):\n`);
  for (const record of matches) {
    console.log(`  ${record.title}`);
    console.log(`    id:     ${record.record_id}`);
    console.log(`    source: ${record.source_system}`);
    console.log(`    scope:  ${record.scope}`);
    console.log(`    kind:   ${record.kind}`);
    console.log(`    status: ${record.status}`);
    console.log(`    path:   ${record.source_path}`);
    console.log();
  }
}
