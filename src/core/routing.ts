import type { AdapterCapability } from "./schema.js";
import type { Scope, Kind, WriteAction } from "./types.js";
import { classifyContent } from "../lib/classifier.js";

export interface RoutingInput {
  title: string;
  summary: string;
  keywords: string[];
  explicit_target?: string;
  adapter_capabilities: AdapterCapability[];
}

export interface RoutingDecision {
  action: WriteAction;
  target_adapter_id: string;
  scope: Scope;
  kind: Kind;
  reason: string;
}

/**
 * Find an adapter by ID.
 */
function findAdapter(
  capabilities: AdapterCapability[],
  adapterId: string
): AdapterCapability | undefined {
  return capabilities.find((c) => c.adapter_id === adapterId);
}

/**
 * Find the first writable adapter matching one of the preferred adapter classes.
 */
function findWritableAdapterByClass(
  capabilities: AdapterCapability[],
  adapterClasses: AdapterCapability["adapter_class"][]
): AdapterCapability | undefined {
  for (const cls of adapterClasses) {
    const match = capabilities.find(
      (c) => c.can_write && c.adapter_class === cls
    );
    if (match) return match;
  }
  return undefined;
}

/**
 * Determine the write action based on adapter class.
 */
function writeActionFor(
  adapter: AdapterCapability
): WriteAction {
  switch (adapter.adapter_class) {
    case "native_memory":
      return "native_write";
    case "canonical_memory":
      return "canonical_write";
    case "context_memory":
      return "index_only";
    case "memory_mcp":
      return "canonical_write";
  }
}

/**
 * Route a write operation to the appropriate adapter.
 *
 * Decision flow:
 *  1. Classify content → scope + kind
 *  2. If explicit_target provided → validate writable → use it
 *  3. Apply default routing rules by scope
 *  4. If no matching adapter → index_only with a synthetic adapter id
 */
export function routeWrite(input: RoutingInput): RoutingDecision {
  const { scope, kind } = classifyContent({
    title: input.title,
    summary: input.summary,
    keywords: input.keywords,
  });

  // --- Explicit target override ---
  if (input.explicit_target !== undefined) {
    const adapter = findAdapter(
      input.adapter_capabilities,
      input.explicit_target
    );

    if (!adapter) {
      throw new Error(
        `Explicit target adapter "${input.explicit_target}" not found in adapter_capabilities`
      );
    }

    if (!adapter.can_write) {
      throw new Error(
        `Explicit target adapter "${input.explicit_target}" is read-only (can_write=false)`
      );
    }

    // Validate semantic appropriateness: the adapter must support the classified scope
    if (!adapter.supported_scopes.includes(scope)) {
      throw new Error(
        `Explicit target adapter "${input.explicit_target}" does not support scope "${scope}"`
      );
    }

    return {
      action: writeActionFor(adapter),
      target_adapter_id: adapter.adapter_id,
      scope,
      kind,
      reason: `Explicit user target "${adapter.adapter_id}" selected; adapter supports scope "${scope}"`,
    };
  }

  // --- Default routing by scope ---

  // project/session → prefer native adapter
  if (scope === "project" || scope === "session") {
    const adapter = findWritableAdapterByClass(input.adapter_capabilities, [
      "native_memory",
      "context_memory",
    ]);
    if (adapter) {
      return {
        action: writeActionFor(adapter),
        target_adapter_id: adapter.adapter_id,
        scope,
        kind,
        reason: `Scope "${scope}" maps to native/context adapter "${adapter.adapter_id}"`,
      };
    }
  }

  // cross_project/personal/team → prefer canonical adapter
  if (
    scope === "cross_project" ||
    scope === "personal" ||
    scope === "team"
  ) {
    const adapter = findWritableAdapterByClass(input.adapter_capabilities, [
      "canonical_memory",
      "memory_mcp",
    ]);
    if (adapter) {
      return {
        action: writeActionFor(adapter),
        target_adapter_id: adapter.adapter_id,
        scope,
        kind,
        reason: `Scope "${scope}" maps to canonical adapter "${adapter.adapter_id}"`,
      };
    }
  }

  // Fallback: no matching adapter → index_only
  return {
    action: "index_only",
    target_adapter_id: "loci_index",
    scope,
    kind,
    reason: `No writable adapter found for scope "${scope}"; falling back to index_only`,
  };
}
