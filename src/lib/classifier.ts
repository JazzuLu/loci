import type { Scope, Kind } from "../core/types.js";

export interface ClassifyInput {
  title: string;
  summary: string;
  keywords: string[];
}

export interface ClassifyResult {
  scope: Scope;
  kind: Kind;
}

const SCOPE_RULES: Array<{ terms: string[]; scope: Scope }> = [
  { terms: ["cross-project", "cross_project", "global", "everywhere", "all projects", "any project"], scope: "cross_project" },
  { terms: ["personal", "preference", "i always", "i prefer", "my default", "my setup"], scope: "personal" },
  { terms: ["team", "shared", "our team", "we always", "organization", "org-wide"], scope: "team" },
  { terms: ["session", "this session", "temporary", "right now", "current session"], scope: "session" },
  { terms: ["project", "repo", "repository", "workspace", "this project", "codebase"], scope: "project" },
];

const KIND_RULES: Array<{ terms: string[]; kind: Kind }> = [
  { terms: ["prefer", "like", "always use", "i use", "favorite", "i prefer", "my preference", "default to"], kind: "preference" },
  { terms: ["decided", "chose", "agreed", "decision", "we decided", "resolved", "chosen", "adopted"], kind: "decision" },
  { terms: ["bug", "error", "fix", "incident", "outage", "broke", "crash", "failure", "issue"], kind: "incident" },
  { terms: ["workflow", "process", "steps", "procedure", "how to", "pipeline", "checklist"], kind: "workflow" },
  { terms: ["learned", "discovered", "found", "noticed", "realized", "turns out", "figured out"], kind: "fact" },
];

function matchesTerms(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

/**
 * Classify content into scope and kind based on keyword heuristics.
 */
export function classifyContent(input: ClassifyInput): ClassifyResult {
  const combined = [input.title, input.summary, ...input.keywords].join(" ");

  // Scope classification — ordered: most-specific first
  let scope: Scope = "project"; // default
  for (const rule of SCOPE_RULES) {
    if (matchesTerms(combined, rule.terms)) {
      scope = rule.scope;
      break;
    }
  }

  // Kind classification
  let kind: Kind = "reference"; // default
  for (const rule of KIND_RULES) {
    if (matchesTerms(combined, rule.terms)) {
      kind = rule.kind;
      break;
    }
  }

  return { scope, kind };
}
