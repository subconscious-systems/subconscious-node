import type { FunctionTool, Tool } from '../types/tool.js';

export type NormalizeOpts = {
  defaultFunctionToolHeaders?: Record<string, string>;
  defaultFunctionToolDefaults?: Record<string, unknown>;
};

/**
 * Pre-flight tool normalization (R9, R12).
 *
 * Two responsibilities:
 *
 * 1. **Inject client-level FunctionTool overlays.** When the SDK was
 *    constructed with `defaultFunctionToolHeaders` / `…Defaults`, merge
 *    those into every FunctionTool. Per-tool values win on conflict so
 *    consumers can still override.
 *
 * 2. **Auto-promote `defaults` keys into the JSON Schema** (R12). Defaults
 *    are hidden values the engine never sees as model-controlled
 *    parameters, but the schema needs to declare them anyway so the engine
 *    can dispatch a complete payload. We synthesize a minimal property
 *    descriptor (`{ type: 'string' }`) for each defaults-only key that is
 *    missing from `parameters.properties`. Existing properties are left
 *    untouched.
 *
 *    This eliminates the "I declared `user_id` in defaults but the engine
 *    sent `{}`" footgun documented in the friction report.
 */
export function normalizeTools(
  tools: Tool[] | undefined,
  opts: NormalizeOpts,
): Tool[] | undefined {
  if (!tools) return tools;
  return tools.map((t) => normalizeOne(t, opts));
}

function normalizeOne(tool: Tool, opts: NormalizeOpts): Tool {
  if (tool.type !== 'function') return tool;
  return normalizeFunctionTool(tool, opts);
}

function normalizeFunctionTool(tool: FunctionTool, opts: NormalizeOpts): FunctionTool {
  const fn = tool.function;

  // R9: merge SDK-level overlays. Per-tool values win on conflict.
  const mergedHeaders =
    opts.defaultFunctionToolHeaders || fn.headers
      ? { ...(opts.defaultFunctionToolHeaders ?? {}), ...(fn.headers ?? {}) }
      : undefined;

  const mergedDefaults =
    opts.defaultFunctionToolDefaults || fn.defaults
      ? { ...(opts.defaultFunctionToolDefaults ?? {}), ...(fn.defaults ?? {}) }
      : undefined;

  // R12: ensure every defaults-only key is declared in parameters.properties.
  const parameters = promoteDefaultsToProperties(fn.parameters, mergedDefaults);

  return {
    ...tool,
    function: {
      ...fn,
      parameters,
      ...(mergedHeaders ? { headers: mergedHeaders } : {}),
      ...(mergedDefaults ? { defaults: mergedDefaults } : {}),
    },
  };
}

function promoteDefaultsToProperties(
  parameters: Record<string, unknown>,
  defaults: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!defaults) return parameters;

  const next: Record<string, unknown> = { ...parameters };
  // The expected shape is a JSON Schema object with `properties: {…}`. If
  // it isn't, leave it alone (the user supplied a custom schema we don't
  // want to mutate).
  if (next['type'] !== 'object') return next;

  const properties = isObject(next['properties']) ? { ...next['properties'] } : {};
  let mutated = false;

  for (const key of Object.keys(defaults)) {
    if (!(key in properties)) {
      properties[key] = inferPropertyShape(defaults[key]);
      mutated = true;
    }
  }

  if (!mutated) return parameters;

  return { ...next, properties };
}

function inferPropertyShape(value: unknown): Record<string, unknown> {
  switch (typeof value) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'object':
      if (value === null) return { type: 'string' };
      if (Array.isArray(value)) return { type: 'array', items: { type: 'string' } };
      return { type: 'object' };
    default:
      return { type: 'string' };
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
