import { IndexStore } from "../core/index-store.js";
import { routeWrite } from "../core/routing.js";
import { runPostWriteChecks } from "../core/conflicts.js";
import { generateRecordId, contentHash } from "../lib/hash.js";
import { classifyContent } from "../lib/classifier.js";
import type { IndexRecord } from "../core/schema.js";
import type { AdapterCapability } from "../core/schema.js";

/**
 * MVP adapter capabilities: only loci canonical store is available.
 */
const MVP_ADAPTERS: AdapterCapability[] = [
  {
    adapter_id: "loci_canonical",
    adapter_class: "canonical_memory",
    display_name: "Loci Canonical Store",
    can_read: true,
    can_write: true,
    can_search: true,
    can_sync: false,
    can_auto_capture: false,
    source_of_truth_role: "canonical_truth",
    supported_scopes: ["session", "project", "cross_project", "personal", "team"],
  },
];

/**
 * Parse args into content and optional --target flag.
 * Returns { content, target }.
 */
function parseArgs(args: string[]): { content: string; target: string | undefined } {
  let target: string | undefined;
  const filtered: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--target") {
      target = args[i + 1];
      i++; // skip next
    } else {
      filtered.push(args[i] ?? "");
    }
  }

  return { content: filtered.join(" ").trim(), target };
}

export async function remember(args: string[]): Promise<void> {
  const { content, target } = parseArgs(args);

  if (!content) {
    console.error("Usage: loci remember <memory content> [--target <adapter_id>]");
    process.exit(1);
  }

  // Classify content
  const classification = classifyContent({
    title: content,
    summary: content,
    keywords: content.split(/\s+/).filter((w) => w.length > 3),
  });

  // Route the write
  const decision = routeWrite({
    title: content,
    summary: content,
    keywords: content.split(/\s+/).filter((w) => w.length > 3),
    explicit_target: target,
    adapter_capabilities: MVP_ADAPTERS,
  });

  const now = new Date().toISOString();
  const recordId = generateRecordId();
  const hash = contentHash(content);

  // For MVP: only canonical_write to loci store is fully implemented.
  // For other targets, print intent and create index_only record.
  if (decision.action !== "canonical_write" && decision.action !== "index_only") {
    console.log(`would route to ${decision.target_adapter_id} (action: ${decision.action})`);
  }

  // Build the index record
  const record: IndexRecord = {
    record_id: recordId,
    source_system: "loci_cli",
    source_object_id: recordId,
    source_path: `loci://cli/${recordId}`,

    scope: classification.scope,
    kind: classification.kind,
    truth_mode: decision.action === "canonical_write" ? "canonical_truth" : "index_only",
    status: "active",

    title: content,
    summary: content,
    keywords: content.split(/\s+/).filter((w) => w.length > 2),

    created_at: now,
    updated_at: now,
    capture_mode: "manual",
    version_hash: hash,

    preferred_write_target: decision.target_adapter_id,
    sync_strategy: "manual_only",
  };

  // Persist to index store
  const store = new IndexStore();
  await store.create(record);

  // Run post-write checks
  const allRecords = await store.query({});
  const checks = runPostWriteChecks(record, allRecords, hash);

  // Report result
  console.log(`Remembered: "${content}"`);
  console.log(`  id:     ${record.record_id}`);
  console.log(`  scope:  ${record.scope}`);
  console.log(`  kind:   ${record.kind}`);
  console.log(`  action: ${decision.action} → ${decision.target_adapter_id}`);
  console.log(`  reason: ${decision.reason}`);

  if (checks.duplicates.length > 0) {
    console.warn(`  warning: ${checks.duplicates.length} duplicate(s) detected`);
  }
  if (checks.superseded.length > 0) {
    console.log(`  supersedes: ${checks.superseded.map((r) => r.record_id).join(", ")}`);
  }
}
