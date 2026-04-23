/**
 * Helper functions and builders for the Subconscious SDK.
 *
 * Contains all transformation / serialization logic that was previously
 * inlined in `types.ts` and `internal/body.ts`, plus the
 * {@link ToolResponseBuilder} convenience object.
 */

import { z } from 'zod';
import { RequestTooLargeError } from './errors.js';
import {
  EngineSchema,
  ContentBlockSchema,
  type OutputSchema,
  type Tool,
  type ContentBlock,
  type TextContent,
  type ImageContent,
  type AudioContent,
  type FileContent,
  type ToolResponse,
  type RunInput,
  type RunOptions,
  type Engine,
} from './types.js';

// ---------------------------------------------------------------------------
// Zod → JSON Schema helpers
// ---------------------------------------------------------------------------

function isZodType(x: unknown): x is z.ZodType {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { parse?: unknown }).parse === 'function' &&
    '_zod' in x
  );
}

/**
 * Convert a Zod schema to the JSON Schema format expected by Subconscious.
 *
 * @param schema - A Zod schema (typically `z.object(...)`)
 * @param title - The title for the schema (required)
 * @returns A JSON Schema compatible with `answerFormat` / `reasoningFormat`
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { zodToOutputSchema } from 'subconscious';
 *
 * const schema = z.object({
 *   summary: z.string().describe('A brief summary'),
 *   score: z.number().describe('Score from 1-10'),
 *   tags: z.array(z.string()),
 * });
 *
 * const answerFormat = zodToOutputSchema(schema, 'AnalysisResult');
 * ```
 */
export function zodToOutputSchema(schema: z.ZodType, title: string): OutputSchema {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as {
    properties?: Record<string, import('./types.js').JSONSchemaProperty>;
    required?: string[];
    $defs?: Record<string, unknown>;
  };
  const result: OutputSchema = {
    type: 'object',
    title,
    properties: json.properties ?? {},
    required: json.required ?? Object.keys(json.properties ?? {}),
  };
  if (json.$defs) result.$defs = json.$defs;
  return result;
}

/**
 * @deprecated Use {@link zodToOutputSchema} instead. Kept for one release as
 * a drop-in alias.
 */
export const zodToJsonSchema = zodToOutputSchema;

// ---------------------------------------------------------------------------
// Tool normalization
// ---------------------------------------------------------------------------

const TOOL_KEY_MAP: Record<string, string> = {
  allowed_tools: 'allowedTools',
};

/** Strip `undefined` values from a record and rename snake_case → camelCase keys that the wire expects. */
function normalizeToolFields(t: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) {
    if (v === undefined || v === null) continue;
    const mappedKey = TOOL_KEY_MAP[k] ?? k;
    if (typeof v === 'object' && !Array.isArray(v) && v !== null) {
      const inner: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
        if (nv === undefined || nv === null) continue;
        inner[TOOL_KEY_MAP[nk] ?? nk] = nv;
      }
      out[mappedKey] = inner;
    } else {
      out[mappedKey] = v;
    }
  }
  return out;
}

function normalizeTool(tool: Tool): Record<string, unknown> {
  return normalizeToolFields(tool as Record<string, unknown>);
}

function normalizeContentBlock(block: ContentBlock): Record<string, unknown> {
  return ContentBlockSchema.parse(block) as unknown as Record<string, unknown>;
}

function resolveFormat(
  schema: OutputSchema | z.ZodType | undefined,
): Record<string, unknown> | undefined {
  if (!schema) return undefined;
  if (isZodType(schema)) {
    return zodToOutputSchema(schema, 'Schema') as unknown as Record<string, unknown>;
  }
  return schema as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Wire-format schemas — validated shape for the POST /v1/runs body.
// Mirrors `CreateRunBody` / `RunInputWire` / `RunOptionsWire` / `RunOutputWire`
// from the Python SDK.
// ---------------------------------------------------------------------------

const RunInputWireSchema = z.object({
  instructions: z.string(),
  tools: z.array(z.record(z.string(), z.unknown())).default([]),
  content: z.array(z.record(z.string(), z.unknown())).optional(),
  resources: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  answerFormat: z.record(z.string(), z.unknown()).optional(),
  reasoningFormat: z.record(z.string(), z.unknown()).optional(),
});
export type RunInputWire = z.infer<typeof RunInputWireSchema>;

function buildRunInputWire(input: RunInput): RunInputWire {
  return RunInputWireSchema.parse({
    instructions: input.instructions,
    tools: (input.tools ?? []).map(normalizeTool),
    content: input.content?.map(normalizeContentBlock),
    resources: input.resources && input.resources.length > 0 ? input.resources : undefined,
    skills: input.skills && input.skills.length > 0 ? input.skills : undefined,
    answerFormat: resolveFormat(input.answerFormat),
    reasoningFormat: resolveFormat(input.reasoningFormat),
  });
}

/**
 * Wire schema for the `options` field of POST /v1/runs. Uses snake_case
 * (`max_step_tokens`) to match the server Zod schema. Client-side flags like
 * `awaitCompletion` are stripped before building this — they never reach the
 * server.
 */
const RunOptionsWireSchema = z.object({
  timeout: z.number().optional(),
  max_step_tokens: z.number().optional(),
});
export type RunOptionsWire = z.infer<typeof RunOptionsWireSchema>;

function buildRunOptionsWire(options?: RunOptions): RunOptionsWire | undefined {
  if (!options) return undefined;
  if (options.timeout === undefined && options.maxStepTokens === undefined) return undefined;
  const wire: RunOptionsWire = {};
  if (options.timeout !== undefined) wire.timeout = options.timeout;
  if (options.maxStepTokens !== undefined) wire.max_step_tokens = options.maxStepTokens;
  return wire;
}

/**
 * Wire schema for the `output` field of POST /v1/runs. Server Zod schema
 * uses camelCase (`callbackUrl`, `responseContent`) — we mirror that exactly.
 */
const RunOutputWireSchema = z.object({
  callbackUrl: z.string().optional(),
  responseContent: z.enum(['full', 'answer_only']).optional(),
});
export type RunOutputWire = z.infer<typeof RunOutputWireSchema>;

function buildRunOutputWire(options?: RunOptions): RunOutputWire | undefined {
  const out = options?.output;
  if (!out) return undefined;
  if (out.callbackUrl === undefined && out.responseContent === undefined) return undefined;
  const wire: RunOutputWire = {};
  if (out.callbackUrl !== undefined) wire.callbackUrl = out.callbackUrl;
  if (out.responseContent !== undefined) wire.responseContent = out.responseContent;
  return wire;
}

const MAX_REQUEST_BYTES = 5 * 1024 * 1024;

/**
 * Wire schema for the full POST /v1/runs request body.
 *
 * Mirrors `CreateRunBody.build()` + `.to_dict()` in the Python SDK:
 * validates top-level shape, enforces the 5 MB request limit via
 * {@link RequestTooLargeError}.
 */
export const CreateRunBodySchema = z.object({
  engine: EngineSchema,
  input: RunInputWireSchema,
  options: RunOptionsWireSchema.optional(),
  output: RunOutputWireSchema.optional(),
});
export type CreateRunBody = z.infer<typeof CreateRunBodySchema>;

/** Construct a validated wire body from user-facing run parameters. */
export function buildCreateRunBody(
  engine: Engine,
  input: RunInput,
  options?: RunOptions,
): CreateRunBody {
  const body: CreateRunBody = {
    engine,
    input: buildRunInputWire(input),
  };
  const opts = buildRunOptionsWire(options);
  if (opts) body.options = opts;
  const out = buildRunOutputWire(options);
  if (out) body.output = out;
  return CreateRunBodySchema.parse(body);
}

/**
 * Serialize a validated `CreateRunBody` to the JSON string sent over the
 * wire, enforcing the API's 5 MB size limit.
 *
 * Throws {@link RequestTooLargeError} if the serialized body exceeds the
 * limit — callers should split images across multiple turns or upload via
 * `/v1/internal/attachments` first.
 */
export function toWireBody(body: CreateRunBody): string {
  const json = JSON.stringify(body);
  const bytes = Buffer.byteLength(json, 'utf-8');
  if (bytes > MAX_REQUEST_BYTES) {
    throw new RequestTooLargeError(
      `request body exceeds ${MAX_REQUEST_BYTES} bytes — split images ` +
        'across multiple turns or upload via /v1/internal/attachments first',
    );
  }
  return json;
}

/**
 * Serialize the POST /v1/runs body and size-check it before the network
 * call. Mirrors `CreateRunBody.build().to_dict()` in the Python SDK.
 *
 * `awaitCompletion` is intentionally stripped — it's a client-side polling
 * toggle and must not reach the server.
 */
export function buildRunBody(engine: Engine, input: RunInput, options?: RunOptions): string {
  return toWireBody(buildCreateRunBody(engine, input, options));
}

// ---------------------------------------------------------------------------
// ToolResponseBuilder — convenience builder for ToolResponse envelopes.
// ---------------------------------------------------------------------------

type ToolResponseItem = string | TextContent | ImageContent | AudioContent | FileContent;
export type ToolResponseContent = ToolResponseItem | ToolResponseItem[];

/**
 * Build helpers for {@link ToolResponse}. Lets callers wrap plain strings, a
 * single content block, or a mixed list without constructing `content`
 * blocks manually. Mirrors Python's `ToolResponse.build()` classmethod.
 */
export const ToolResponseBuilder = {
  build(
    toolCallId: string | null | undefined,
    content: ToolResponseContent,
    opts: { isError?: boolean } = {},
  ): ToolResponse {
    const wrap = (item: ToolResponseItem): ContentBlock => {
      if (typeof item === 'string') return { type: 'text', text: item };
      return item;
    };
    const blocks = Array.isArray(content) ? content.map(wrap) : [wrap(content)];
    return {
      tool_call_id: toolCallId ?? null,
      content: blocks,
      is_error: opts.isError ?? false,
    };
  },
};
