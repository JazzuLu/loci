import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { MemoryAdapter, ReadResult, WriteResult, SyncScanResult } from "./base.js";
import type { AdapterCapability, IndexRecord } from "../core/schema.js";
import { contentHash } from "../lib/hash.js";

const ADAPTER_ID = "claude_code";
const SOURCE_SYSTEM = "claude_code";

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns the frontmatter fields and the body (content after the closing ---).
 */
function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!content.startsWith("---")) return result;

  const end = content.indexOf("\n---", 3);
  if (end === -1) return result;

  const block = content.slice(3, end).trim();
  for (const line of block.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
    if (key) result[key] = value;
  }
  return result;
}

/** Map a Claude Code memory type to a valid IndexRecord kind */
function mapKind(type: string | undefined): IndexRecord["kind"] {
  const valid = new Set<string>(["preference", "fact", "workflow", "decision", "incident", "reference"]);
  if (type && valid.has(type)) return type as IndexRecord["kind"];
  return "reference";
}

/**
 * ClaudeCodeAdapter: native memory adapter that reads Claude Code memory files.
 *
 * Capability:
 *   adapter_class: "native_memory"
 *   source_of_truth_role: "native_project_truth"
 *   can_read/write/sync: true
 *   can_search: false (MVP)
 *   can_auto_capture: true
 *
 * write() returns success=false with an error message — MVP does not modify Claude's memory files.
 */
export class ClaudeCodeAdapter implements MemoryAdapter {
  readonly capability: AdapterCapability = {
    adapter_id: ADAPTER_ID,
    adapter_class: "native_memory",
    display_name: "Claude Code",
    can_read: true,
    can_write: true,
    can_search: false,
    can_sync: true,
    can_auto_capture: true,
    source_of_truth_role: "native_project_truth",
    supported_scopes: ["session", "project"],
  };

  private readonly projectDir: string;

  // userHome reserved for future global memory scanning
  constructor(projectDir: string, _userHome?: string) {
    this.projectDir = projectDir;
  }

  /** Discover and return all Claude Code memory files as IndexRecords */
  async read(): Promise<ReadResult> {
    const records: IndexRecord[] = [];
    const errors: string[] = [];

    // Scan .claude/projects/*/memory/*.md
    const claudeDir = join(this.projectDir, ".claude", "projects");
    try {
      const projectDirs = await readdir(claudeDir);
      for (const proj of projectDirs) {
        const memDir = join(claudeDir, proj, "memory");
        let memFiles: string[];
        try {
          memFiles = await readdir(memDir);
        } catch {
          continue;
        }
        for (const file of memFiles) {
          if (!file.endsWith(".md")) continue;
          const filePath = join(memDir, file);
          try {
            const content = await readFile(filePath, "utf-8");
            const fm = parseFrontmatter(content);
            const name = fm["name"] ?? basename(file, ".md");
            const description = fm["description"] ?? content.trim().slice(0, 200);
            const now = new Date().toISOString();
            const hash = contentHash(content);
            const record: IndexRecord = {
              record_id: `${ADAPTER_ID}:${filePath}`,
              source_system: SOURCE_SYSTEM,
              source_object_id: filePath,
              source_path: filePath,
              source_adapter_id: ADAPTER_ID,
              scope: "project",
              kind: mapKind(fm["type"]),
              truth_mode: "native_project_truth",
              status: "active",
              title: name,
              summary: description || name,
              keywords: [name],
              created_at: now,
              updated_at: now,
              capture_mode: "sync_scan",
              preferred_write_target: ADAPTER_ID,
              sync_strategy: "scan_on_demand",
              version_hash: hash,
            };
            records.push(record);
          } catch (err: unknown) {
            errors.push(`Failed to read ${filePath}: ${String(err)}`);
          }
        }
      }
    } catch {
      // .claude/projects does not exist — not an error, just no memory files
    }

    // Scan CLAUDE.md in project root
    const claudeMd = join(this.projectDir, "CLAUDE.md");
    try {
      await stat(claudeMd);
      const content = await readFile(claudeMd, "utf-8");
      const now = new Date().toISOString();
      const hash = contentHash(content);
      const record: IndexRecord = {
        record_id: `${ADAPTER_ID}:${claudeMd}`,
        source_system: SOURCE_SYSTEM,
        source_object_id: claudeMd,
        source_path: claudeMd,
        source_adapter_id: ADAPTER_ID,
        scope: "project",
        kind: "reference",
        truth_mode: "native_project_truth",
        status: "active",
        title: "CLAUDE.md project instructions",
        summary: content.trim().slice(0, 200) || "CLAUDE.md project instructions",
        keywords: ["CLAUDE.md", "instructions"],
        created_at: now,
        updated_at: now,
        capture_mode: "sync_scan",
        preferred_write_target: ADAPTER_ID,
        sync_strategy: "scan_on_demand",
        version_hash: hash,
      };
      records.push(record);
    } catch {
      // CLAUDE.md does not exist — not an error
    }

    return { records, partial: errors.length > 0, errors };
  }

  /** Write is not implemented in MVP — Claude Code memory files are not auto-modified */
  async write(_record: IndexRecord): Promise<WriteResult> {
    return {
      success: false,
      error: "Claude Code native write not yet implemented in MVP",
    };
  }

  /** Compare discovered files with existing index records by source_path + version_hash */
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

    for (const [path, rec] of existingByPath) {
      if (!currentPaths.has(path)) {
        removed.push(rec.record_id);
      }
    }

    return { added, updated, removed, unchanged, errors };
  }
}
