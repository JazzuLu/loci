import { IndexRecordSchema, type IndexRecord } from "./schema.js";
import { readJsonFile, writeJsonFile } from "../lib/files.js";
import { indexFilePath } from "../lib/paths.js";

export interface QueryFilter {
  source_system?: string;
  scope?: string;
  kind?: string;
  status?: string;
  project_id?: string;
}

export class IndexStore {
  private records: Map<string, IndexRecord> = new Map();
  private readonly filePath: string;
  private loaded = false;

  constructor(dataDir?: string) {
    this.filePath = indexFilePath(dataDir);
  }

  /** Load index from disk */
  async load(): Promise<void> {
    const data = await readJsonFile<IndexRecord[]>(this.filePath);
    this.records.clear();
    if (data) {
      for (const raw of data) {
        const record = IndexRecordSchema.parse(raw);
        this.records.set(record.record_id, record);
      }
    }
    this.loaded = true;
  }

  /** Persist index to disk */
  async flush(): Promise<void> {
    const data = Array.from(this.records.values());
    await writeJsonFile(this.filePath, data);
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
  }

  /** Create a new record */
  async create(record: IndexRecord): Promise<void> {
    await this.ensureLoaded();
    const validated = IndexRecordSchema.parse(record);
    if (this.records.has(validated.record_id)) {
      throw new Error(`Duplicate record_id: ${validated.record_id}`);
    }
    this.records.set(validated.record_id, validated);
    await this.flush();
  }

  /** Get a record by ID, or null if not found */
  async get(recordId: string): Promise<IndexRecord | null> {
    await this.ensureLoaded();
    return this.records.get(recordId) ?? null;
  }

  /** Update an existing record */
  async update(record: IndexRecord): Promise<void> {
    await this.ensureLoaded();
    const validated = IndexRecordSchema.parse(record);
    if (!this.records.has(validated.record_id)) {
      throw new Error(`Record not found: ${validated.record_id}`);
    }
    this.records.set(validated.record_id, validated);
    await this.flush();
  }

  /** Delete a record by ID */
  async delete(recordId: string): Promise<void> {
    await this.ensureLoaded();
    this.records.delete(recordId);
    await this.flush();
  }

  /** Query records by filter criteria */
  async query(filter: QueryFilter): Promise<IndexRecord[]> {
    await this.ensureLoaded();
    let results = Array.from(this.records.values());

    if (filter.source_system) {
      results = results.filter((r) => r.source_system === filter.source_system);
    }
    if (filter.scope) {
      results = results.filter((r) => r.scope === filter.scope);
    }
    if (filter.kind) {
      results = results.filter((r) => r.kind === filter.kind);
    }
    if (filter.status) {
      results = results.filter((r) => r.status === filter.status);
    }
    if (filter.project_id) {
      results = results.filter((r) => r.project_id === filter.project_id);
    }

    return results;
  }

  /** Get total record count */
  async count(): Promise<number> {
    await this.ensureLoaded();
    return this.records.size;
  }
}
