/** Scope of a memory record */
export type Scope = "session" | "project" | "cross_project" | "personal" | "team";

/** Kind of memory content */
export type Kind = "preference" | "fact" | "workflow" | "decision" | "incident" | "reference";

/** Visibility level */
export type Visibility = "private" | "project" | "team";

/** Record lifecycle status */
export type Status = "active" | "stale" | "superseded" | "archived" | "conflicted";

/** How the memory was captured */
export type CaptureMode = "manual" | "auto_native" | "auto_hook" | "sync_scan" | "import";

/** Sync strategy between Loci and the source */
export type SyncStrategy = "manual_only" | "scan_on_demand" | "periodic" | "hook_driven";

/** Read strategy for recall */
export type ReadStrategy = "index_only" | "fetch_on_recall" | "eager_cache";

/** Conflict resolution policy */
export type ConflictPolicy = "source_wins" | "luci_wins" | "latest_wins" | "manual_review" | "scoped_merge";

/** Adapter class — the four categories of memory sources */
export type AdapterClass = "native_memory" | "context_memory" | "canonical_memory" | "memory_mcp";

/** Source-of-truth role for an adapter */
export type TruthRole =
  | "native_project_truth"
  | "workspace_truth"
  | "context_truth"
  | "canonical_truth"
  | "delegated_truth";

/** Write action chosen by the routing engine */
export type WriteAction = "native_write" | "canonical_write" | "index_only" | "dual_action";

/** Embedding processing status (reserved for Phase 2+) */
export type EmbeddingStatus = "pending" | "processing" | "ready" | "failed" | "skipped";
