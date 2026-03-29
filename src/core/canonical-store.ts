import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { lociDataDir } from "../lib/paths.js";

export interface CanonicalEntry {
  title: string;
  summary: string;
  keywords: string[];
  kind: string;
  category?: string;
}

export interface CanonicalWriteResult {
  path: string;
  record_id: string;
}

export interface CanonicalReadResult {
  title: string;
  summary: string;
  keywords: string[];
  kind: string;
  created_at: string;
}

export interface CanonicalListItem {
  path: string;
  title: string;
  keywords: string[];
}

/** Slugify a title for use as a directory name */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

/** Build YAML frontmatter + body for a SKILL.md */
function buildSkillMd(entry: CanonicalEntry, recordId: string, createdAt: string): string {
  const keywordsYaml = entry.keywords.map((k) => `  - ${k}`).join("\n");
  return [
    "---",
    `title: "${entry.title.replace(/"/g, '\\"')}"`,
    `kind: ${entry.kind}`,
    `record_id: ${recordId}`,
    `created_at: ${createdAt}`,
    "keywords:",
    keywordsYaml,
    "---",
    "",
    entry.summary,
    "",
  ].join("\n");
}

/** Parse YAML frontmatter from a SKILL.md file */
function parseFrontmatter(content: string): Record<string, string | string[]> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const block = match[1] ?? "";
  const result: Record<string, string | string[]> = {};

  let currentKey: string | null = null;
  let inList = false;
  const listItems: string[] = [];

  for (const line of block.split("\n")) {
    const listMatch = line.match(/^  - (.+)$/);
    if (listMatch && inList && currentKey) {
      listItems.push(listMatch[1] ?? "");
      continue;
    }

    // If we were collecting a list, flush it
    if (inList && currentKey) {
      result[currentKey] = [...listItems];
      listItems.length = 0;
      inList = false;
      currentKey = null;
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1] ?? "";
      const val = kvMatch[2] ?? "";
      if (val === "") {
        // Start of a list
        currentKey = key;
        inList = true;
      } else {
        // Strip surrounding quotes if present
        result[key] = val.replace(/^"(.*)"$/, "$1");
      }
    }
  }

  // Flush final list
  if (inList && currentKey) {
    result[currentKey] = [...listItems];
  }

  return result;
}

/** Parse the summary body from a SKILL.md file (text after frontmatter) */
function parseSummary(content: string): string {
  const afterFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, "");
  return afterFrontmatter.trim();
}

/**
 * CanonicalStore manages SKILL.md files under a loci data directory.
 * Default root is ~/.loci/.
 */
export class CanonicalStore {
  readonly dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? lociDataDir();
  }

  /** Write a canonical memory entry; returns path and record_id */
  async write(entry: CanonicalEntry): Promise<CanonicalWriteResult> {
    const { createHash } = await import("node:crypto");
    const bytes = createHash("sha256")
      .update(`${Date.now()}-${Math.random()}`)
      .digest("hex")
      .slice(0, 16);
    const recordId = `rec_${bytes}`;

    const category = entry.category ?? "inbox";
    const slug = slugify(entry.title);
    const dirPath = join(this.dataDir, category, slug);
    const filePath = join(dirPath, "SKILL.md");
    const createdAt = new Date().toISOString();

    const content = buildSkillMd(entry, recordId, createdAt);

    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, content, "utf-8");

    return { path: filePath, record_id: recordId };
  }

  /** Read a SKILL.md file and return its parsed fields, or null if not found */
  async read(filePath: string): Promise<CanonicalReadResult | null> {
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }

    const fm = parseFrontmatter(content);
    if (!fm) return null;

    const keywords = fm["keywords"];
    return {
      title: String(fm["title"] ?? ""),
      summary: parseSummary(content),
      keywords: Array.isArray(keywords) ? keywords : [],
      kind: String(fm["kind"] ?? ""),
      created_at: String(fm["created_at"] ?? ""),
    };
  }

  /** List all SKILL.md files in the data directory */
  async list(): Promise<CanonicalListItem[]> {
    const items: CanonicalListItem[] = [];
    await this._scanDir(this.dataDir, items);
    return items;
  }

  private async _scanDir(dir: string, items: CanonicalListItem[]): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      if (entry === "SKILL.md") {
        const result = await this.read(fullPath);
        if (result) {
          items.push({ path: fullPath, title: result.title, keywords: result.keywords });
        }
      } else {
        // Recurse into subdirectories (skip index.json)
        if (!entry.includes(".")) {
          await this._scanDir(fullPath, items);
        }
      }
    }
  }
}
