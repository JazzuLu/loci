import type { IndexStore } from "./index-store.js";
import type { IndexRecord } from "./schema.js";

export interface RecallQuery {
  terms: string[];
  scope?: string;
  status_exclude?: string[];
  include_relations?: boolean;
  limit?: number;
}

export interface RecallResult {
  record: IndexRecord;
  score: number;
  match_reasons: string[];
}

function scoreRecord(record: IndexRecord, terms: string[]): { score: number; match_reasons: string[] } {
  let score = 0;
  const match_reasons: string[] = [];

  for (const term of terms) {
    const termLower = term.toLowerCase();

    // Exact keyword match: +10
    const exactKeyword = record.keywords.find((k) => k.toLowerCase() === termLower);
    if (exactKeyword) {
      score += 10;
      match_reasons.push(`exact keyword match: "${exactKeyword}"`);
      continue;
    }

    // Partial keyword match (substring): +5
    const partialKeyword = record.keywords.find((k) => k.toLowerCase().includes(termLower) || termLower.includes(k.toLowerCase()));
    if (partialKeyword) {
      score += 5;
      match_reasons.push(`partial keyword match: "${partialKeyword}"`);
      continue;
    }

    // Alias match: +8
    if (record.aliases) {
      const aliasMatch = record.aliases.find((a) => a.toLowerCase().includes(termLower) || termLower.includes(a.toLowerCase()));
      if (aliasMatch) {
        score += 8;
        match_reasons.push(`alias match: "${aliasMatch}"`);
        continue;
      }
    }

    // Entity match: +7
    if (record.entities) {
      const entityMatch = record.entities.find((e) => e.toLowerCase().includes(termLower) || termLower.includes(e.toLowerCase()));
      if (entityMatch) {
        score += 7;
        match_reasons.push(`entity match: "${entityMatch}"`);
        continue;
      }
    }

    // Title substring match: +3
    if (record.title.toLowerCase().includes(termLower)) {
      score += 3;
      match_reasons.push(`title match: "${term}"`);
      continue;
    }

    // Summary substring match: +1
    if (record.summary.toLowerCase().includes(termLower)) {
      score += 1;
      match_reasons.push(`summary match: "${term}"`);
    }
  }

  return { score, match_reasons };
}

export async function recall(store: IndexStore, query: RecallQuery): Promise<RecallResult[]> {
  const { terms, scope, include_relations = false, limit = 20 } = query;
  const status_exclude = query.status_exclude ?? ["archived"];

  // Load all records, excluding specified statuses
  let records = await store.query({});
  records = records.filter((r) => !status_exclude.includes(r.status));

  // Filter by scope if specified
  if (scope !== undefined) {
    records = records.filter((r) => r.scope === scope);
  }

  // Score each record
  const results: RecallResult[] = [];
  const scoredIds = new Set<string>();

  for (const record of records) {
    const { score, match_reasons } = scoreRecord(record, terms);
    if (score > 0) {
      results.push({ record, score, match_reasons });
      scoredIds.add(record.record_id);
    }
  }

  // Include related records if requested
  if (include_relations) {
    const relatedToAdd: RecallResult[] = [];

    for (const result of results) {
      const relIds: string[] = [
        ...(result.record.supports ?? []),
        ...(result.record.related_record_ids ?? []),
      ];

      for (const relId of relIds) {
        if (scoredIds.has(relId)) continue;
        const related = await store.get(relId);
        if (!related) continue;
        if (status_exclude.includes(related.status)) continue;
        if (scope !== undefined && related.scope !== scope) continue;

        scoredIds.add(relId);
        const reducedScore = Math.max(1, Math.floor(result.score / 2));
        relatedToAdd.push({
          record: related,
          score: reducedScore,
          match_reasons: [`related to "${result.record.title}"`],
        });
      }
    }

    results.push(...relatedToAdd);
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Apply limit
  return results.slice(0, limit);
}
