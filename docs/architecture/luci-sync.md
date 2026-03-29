# Loci Sync Model

## Principle

Manual-first, automation-later. This is intentional:
- Safer
- Easier to reason about
- Avoids silent drift
- Makes source-of-truth ownership explicit

## Sync Phases

| Phase | Mode | Status |
|-------|------|--------|
| 1 (MVP) | Manual sync only | Implemented |
| 1.5 | Scan-on-demand with incremental detection | Planned |
| 2 | Hook-driven or scheduled sync | Planned |

## What Sync Does

By default:
- Detects additions, modifications, and removals
- Updates loci index records
- Refreshes source paths, hashes, timestamps
- Re-runs classification if needed

By default sync does NOT:
- Copy full source content into loci
- Overwrite native memory without explicit policy
- Treat unknown MCP servers as memory sources

## SyncEngine

The `SyncEngine` class coordinates sync across all registered adapters.

### Per-Adapter Sync
1. Query index for existing records matching the adapter's source_system
2. Call `adapter.sync(existingRecords)` to get a `SyncScanResult`
3. Apply changes: create added records, update changed records, mark removed as stale

### Sync All
Iterates all registered adapters and aggregates results into a `SyncSummary`.

## Conflict Handling

Post-sync, the conflict engine checks for:
- Duplicate records (same source_system + source_object_id)
- Supersession chains
- Contradictions (same keywords, different content)
- Stale records (version_hash mismatch)

Resolution follows the record's `conflict_policy`: `source_wins`, `latest_wins`, `manual_review`, `luci_wins`, or `scoped_merge`.
