import { z } from "zod";

// --- Enums as Zod schemas ---

export const ScopeSchema = z.enum(["session", "project", "cross_project", "personal", "team"]);
export const KindSchema = z.enum(["preference", "fact", "workflow", "decision", "incident", "reference"]);
export const VisibilitySchema = z.enum(["private", "project", "team"]);
export const StatusSchema = z.enum(["active", "stale", "superseded", "archived", "conflicted"]);
export const CaptureModeSchema = z.enum(["manual", "auto_native", "auto_hook", "sync_scan", "import"]);
export const SyncStrategySchema = z.enum(["manual_only", "scan_on_demand", "periodic", "hook_driven"]);
export const ReadStrategySchema = z.enum(["index_only", "fetch_on_recall", "eager_cache"]);
export const ConflictPolicySchema = z.enum(["source_wins", "luci_wins", "latest_wins", "manual_review", "scoped_merge"]);
export const AdapterClassSchema = z.enum(["native_memory", "context_memory", "canonical_memory", "memory_mcp"]);
export const TruthRoleSchema = z.enum(["native_project_truth", "workspace_truth", "context_truth", "canonical_truth", "delegated_truth"]);
export const WriteActionSchema = z.enum(["native_write", "canonical_write", "index_only", "dual_action"]);
export const EmbeddingStatusSchema = z.enum(["pending", "processing", "ready", "failed", "skipped"]);

// --- Index Record Schema ---

export const IndexRecordSchema = z.object({
  // Identity (required)
  record_id: z.string().min(1),
  source_system: z.string().min(1),
  source_object_id: z.string().min(1),
  source_path: z.string().min(1),

  // Identity (optional)
  source_uri: z.string().optional(),
  source_adapter_id: z.string().optional(),
  project_id: z.string().optional(),
  workspace_id: z.string().optional(),
  user_scope: z.string().optional(),

  // Classification (required)
  scope: ScopeSchema,
  kind: KindSchema,
  truth_mode: z.string().min(1),
  status: StatusSchema,

  // Classification (optional)
  visibility: VisibilitySchema.optional(),

  // Content summary (required)
  title: z.string().min(1),
  summary: z.string().min(1),
  keywords: z.array(z.string()).min(1),

  // Content summary (optional)
  aliases: z.array(z.string()).optional(),
  entities: z.array(z.string()).optional(),
  intent_tags: z.array(z.string()).optional(),

  // Provenance (required)
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  capture_mode: CaptureModeSchema,
  version_hash: z.string().min(1),

  // Provenance (optional)
  last_seen_at: z.string().optional(),
  created_by: z.string().optional(),
  original_authority: z.string().optional(),
  source_revision: z.string().optional(),

  // Routing and sync (required)
  preferred_write_target: z.string().min(1),
  sync_strategy: SyncStrategySchema,

  // Routing and sync (optional)
  allowed_write_targets: z.array(z.string()).optional(),
  read_strategy: ReadStrategySchema.optional(),
  refresh_policy: z.string().optional(),
  conflict_policy: ConflictPolicySchema.optional(),

  // Relations (optional)
  related_record_ids: z.array(z.string()).optional(),
  supersedes: z.array(z.string()).optional(),
  superseded_by: z.array(z.string()).optional(),
  derived_from: z.array(z.string()).optional(),
  duplicates: z.array(z.string()).optional(),
  contradicts: z.array(z.string()).optional(),
  supports: z.array(z.string()).optional(),
  same_topic_cluster: z.string().optional(),

  // Embedding (reserved, all optional)
  embedding_status: EmbeddingStatusSchema.optional(),
  embedding_model: z.string().optional(),
  embedding_vector_ref: z.string().optional(),
  semantic_search_ready: z.boolean().optional(),
  chunk_refs: z.array(z.string()).optional(),
});

export type IndexRecord = z.infer<typeof IndexRecordSchema>;

// --- Adapter Capability Schema ---

export const AdapterCapabilitySchema = z.object({
  adapter_id: z.string().min(1),
  adapter_class: AdapterClassSchema,
  display_name: z.string().min(1),
  can_read: z.boolean(),
  can_write: z.boolean(),
  can_search: z.boolean(),
  can_sync: z.boolean(),
  can_auto_capture: z.boolean(),
  source_of_truth_role: TruthRoleSchema,
  supported_scopes: z.array(ScopeSchema).min(1),
});

export type AdapterCapability = z.infer<typeof AdapterCapabilitySchema>;
