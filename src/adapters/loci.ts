import { createHash } from "node:crypto";
import type { MemoryAdapter, ReadResult, WriteResult, SyncScanResult } from "./base.js";
import type { AdapterCapability, IndexRecord } from "../core/schema.js";
import { CanonicalStore } from "../core/canonical-store.js";
import { lociDataDir } from "../lib/paths.js";

const ADAPTER_ID = "loci_canonical";
const SOURCE_SYSTEM = "loci";

function contentHash(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  const hash = createHash("sha256").update(normalized, "utf-8").digest("hex");
  return `sha256:${hash}`;
}


/**
 * LociAdapter: canonical memory adapter backed by CanonicalStore (SKILL.md files).
 *
 * Capability:
 *   adapter_class: "canonical_memory"
 *   source_of_truth_role: "canonical_truth"
 *   can_read/write/sync: true
 *   can_search: false (MVP)
 *   can_auto_capture: false
 */
export class LociAdapter implements MemoryAdapter {
  readonly capability: AdapterCapability = {
    adapter_id: ADAPTER_ID,
    adapter_class: "canonical_memory",
    display_name: "Loci Canonical Memory",
    can_read: true,
    can_write: true,
    can_search: false,
    can_sync: true,
    can_auto_capture: false,
    source_of_truth_role: "canonical_truth",
    supported_scopes: ["cross_project", "personal", "team"],
  };

  private readonly store: CanonicalStore;

  constructor(dataDir?: string) {
    this.store = new CanonicalStore(dataDir ?? lociDataDir());
  }

  /** Scan the canonical store and return all entries as IndexRecords */
  async read(): Promise<ReadResult> {
    const records: IndexRecord[] = [];
    const errors: string[] = [];

    let listed: Awaited<ReturnType<CanonicalStore["list"]>>;
    try {
      listed = await this.store.list();
    } catch (err: unknown) {
      return { records: [], partial: true, errors: [String(err)] };
    }

    for (const item of listed) {
      try {
        const entry = await this.store.read(item.path);
        if (!entry) continue;

        const hash = contentHash(entry.summary);
        const record: IndexRecord = {
          record_id: `${ADAPTER_ID}:${item.path}`,
          source_system: SOURCE_SYSTEM,
          source_object_id: item.path,
          source_path: item.path,
          scope: "cross_project",
          kind: _mapKind(entry.kind),
          truth_mode: "canonical_truth",
          status: "active",
          title: entry.title,
          summary: entry.summary,
          keywords: entry.keywords,
          created_at: entry.created_at,
          updated_at: entry.created_at,
          capture_mode: "manual",
          preferred_write_target: ADAPTER_ID,
          sync_strategy: "scan_on_demand",
          version_hash: hash,
          source_adapter_id: ADAPTER_ID,
        };
        records.push(record);
      } catch (err: unknown) {
        errors.push(`Failed to read ${item.path}: ${String(err)}`);
      }
    }

    return { records, partial: errors.length > 0, errors };
  }

  /** Write an IndexRecord to the canonical store */
  async write(record: IndexRecord): Promise<WriteResult> {
    try {
      const result = await this.store.write({
        title: record.title,
        summary: record.summary,
        keywords: record.keywords,
        kind: record.kind,
        category: record.project_id ?? undefined,
      });

      return {
        success: true,
        source_object_id: result.record_id,
        source_path: result.path,
      };
    } catch (err: unknown) {
      return { success: false, error: String(err) };
    }
  }

  /** Compare canonical store entries with existing index records */
  async sync(existingRecords: IndexRecord[]): Promise<SyncScanResult> {
    const added: IndexRecord[] = [];
    const updated: IndexRecord[] = [];
    const removed: string[] = [];
    const errors: string[] = [];
    let unchanged = 0;

    const existingByPath = new Map<string, IndexRecord>();
    for (const r of existingRecords) {
      if (r.source_system === SOURCE_SYSTEM) {
        existingByPath.set(r.source_object_id, r);
      }
    }

    const { records: currentRecords, errors: readErrors } = await this.read();
    errors.push(...readErrors);

    const currentPaths = new Set<string>();

    for (const current of currentRecords) {
      currentPaths.add(current.source_object_id);
      const existing = existingByPath.get(current.source_object_id);

      if (!existing) {
        added.push(current);
      } else if (existing.version_hash !== current.version_hash) {
        updated.push({ ...current, record_id: existing.record_id });
      } else {
        unchanged++;
      }
    }

    // Find removed entries (were in index but no longer on disk)
    for (const [path, rec] of existingByPath) {
      if (!currentPaths.has(path)) {
        removed.push(rec.record_id);
      }
    }

    return { added, updated, removed, unchanged, errors };
  }
}

/** Map canonical kind string to a valid IndexRecord kind */
function _mapKind(kind: string): IndexRecord["kind"] {
  const valid = new Set<string>(["preference", "fact", "workflow", "decision", "incident", "reference"]);
  return valid.has(kind) ? (kind as IndexRecord["kind"]) : "reference";
}
