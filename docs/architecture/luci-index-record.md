# Loci Index Record Schema

Every memory observed or owned by loci generates an index record. The record exists to support routing, sync, recall, and conflict management — not to replicate full content.

## Required Fields (MVP)

| Field | Type | Description |
|-------|------|-------------|
| `record_id` | string | Unique identifier (e.g. `rec_abc123`) |
| `source_system` | string | Origin system (e.g. `claude_code`, `openclaw`, `loci`) |
| `source_object_id` | string | Object identifier within the source |
| `source_path` | string | File path or URI to the source content |
| `scope` | enum | `session`, `project`, `cross_project`, `personal`, `team` |
| `kind` | enum | `preference`, `fact`, `workflow`, `decision`, `incident`, `reference` |
| `truth_mode` | string | Source-of-truth role (e.g. `native_project_truth`) |
| `title` | string | Short title |
| `summary` | string | Content summary |
| `keywords` | string[] | Searchable keywords (min 1) |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |
| `capture_mode` | enum | `manual`, `auto_native`, `auto_hook`, `sync_scan`, `import` |
| `preferred_write_target` | string | Default adapter for writes |
| `sync_strategy` | enum | `manual_only`, `scan_on_demand`, `periodic`, `hook_driven` |
| `version_hash` | string | SHA-256 content hash for change detection |
| `status` | enum | `active`, `stale`, `superseded`, `archived`, `conflicted` |

## Optional Fields

- **Identity**: `source_uri`, `source_adapter_id`, `project_id`, `workspace_id`, `user_scope`
- **Classification**: `visibility` (private/project/team)
- **Content**: `aliases`, `entities`, `intent_tags`
- **Provenance**: `last_seen_at`, `created_by`, `original_authority`, `source_revision`
- **Routing**: `allowed_write_targets`, `read_strategy`, `refresh_policy`, `conflict_policy`
- **Relations**: `related_record_ids`, `supersedes`, `superseded_by`, `derived_from`, `duplicates`, `contradicts`, `supports`, `same_topic_cluster`
- **Embedding (reserved)**: `embedding_status`, `embedding_model`, `embedding_vector_ref`, `semantic_search_ready`, `chunk_refs`

## Storage

MVP uses a single `index.json` file. The `IndexStore` class provides CRUD, query by filter, and file-backed persistence.

## Validation

All records are validated via Zod schema (`IndexRecordSchema`) on create and update. Invalid records are rejected.
