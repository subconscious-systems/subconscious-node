/**
 * Type definitions for the Subconscious SDK.
 *
 * Mirrors `subconscious-python/subconscious/types.py`. Zod schemas are the
 * canonical source of truth; TypeScript types are inferred via `z.infer`.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Engine + RunStatus literals
// ---------------------------------------------------------------------------

/**
 * The canonical list of public, non-deprecated engines. Exported for callers
 * who want a typed enum; the wire-format schema ({@link EngineSchema}) accepts
 * any string so the SDK can forward newly-released engines the client hasn't
 * been updated to know about yet.
 */
export const KNOWN_ENGINES = [
  'tim',
  'tim-edge',
  'tim-claude',
  'tim-claude-heavy',
  'tim-oss-local',
  'tim-1.5',
  'tim-gpt-heavy-tc',
] as const;

/** Engine identifier — accepts any string so forward-compat engines work. */
export const EngineSchema = z.string();
export type Engine = (typeof KNOWN_ENGINES)[number] | (string & {});

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'timed_out',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

// ---------------------------------------------------------------------------
// Structured output (JSON Schema format)
// ---------------------------------------------------------------------------

export const JSONSchemaStringSchema = z.object({
  type: z.literal('string'),
  description: z.string().optional(),
  format: z.enum(['date', 'date-time', 'email', 'uuid']).optional(),
  pattern: z.string().optional(),
});
export type JSONSchemaString = z.infer<typeof JSONSchemaStringSchema>;

export const JSONSchemaNumberSchema = z.object({
  type: z.enum(['number', 'integer']),
  description: z.string().optional(),
});
export type JSONSchemaNumber = z.infer<typeof JSONSchemaNumberSchema>;

export const JSONSchemaBooleanSchema = z.object({
  type: z.literal('boolean'),
  description: z.string().optional(),
});
export type JSONSchemaBoolean = z.infer<typeof JSONSchemaBooleanSchema>;

export const JSONSchemaEnumSchema = z.object({
  type: z.literal('string'),
  enum: z.array(z.string()),
  description: z.string().optional(),
});
export type JSONSchemaEnum = z.infer<typeof JSONSchemaEnumSchema>;

export type JSONSchemaArray = {
  type: 'array';
  items: JSONSchemaProperty;
  description?: string;
};

export type JSONSchemaObject = {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required: string[];
  additionalProperties?: false;
  description?: string;
  $defs?: Record<string, unknown>;
};

export type JSONSchemaAnyOf = {
  anyOf: JSONSchemaProperty[];
  description?: string;
};

export type JSONSchemaProperty =
  | JSONSchemaString
  | JSONSchemaNumber
  | JSONSchemaBoolean
  | JSONSchemaArray
  | JSONSchemaObject
  | JSONSchemaEnum
  | JSONSchemaAnyOf;

/**
 * The format expected by `answerFormat` / `reasoningFormat`.
 * A JSON Schema object with a title.
 */
export type OutputSchema = {
  $defs?: Record<string, unknown>;
  properties: Record<string, JSONSchemaProperty>;
  required: string[];
  title: string;
  type: 'object';
};

// ---------------------------------------------------------------------------
// Response types — mirror the API wire format 1:1.
// Unknown keys are stripped (matches Pydantic `extra='ignore'`).
// ---------------------------------------------------------------------------

export const AgentToolUseSchema = z.object({
  tool_name: z.string(),
  tool_call_id: z.string().nullish(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  tool_result: z.unknown().optional(),
});
export type AgentToolUse = z.infer<typeof AgentToolUseSchema>;

export type ReasoningTask = {
  title?: string;
  thought?: string;
  tooluse?: AgentToolUse;
  subtasks?: ReasoningTask[];
  conclusion?: string;
};

/**
 * A node in the reasoning tree. Recursive via `subtasks`. All fields are
 * optional because the tree is built incrementally during streaming.
 */
export const ReasoningTaskSchema: z.ZodType<ReasoningTask> = z.lazy(() =>
  z.object({
    title: z.string().optional(),
    thought: z.string().optional(),
    tooluse: AgentToolUseSchema.optional(),
    subtasks: z.array(ReasoningTaskSchema).optional(),
    conclusion: z.string().optional(),
  }),
);

export const RunResultSchema = z.object({
  answer: z.string().default(''),
  reasoning: z.array(ReasoningTaskSchema).optional(),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const UsageSchema = z.object({
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  durationMs: z.number().optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const RunErrorSchema = z.object({
  code: z.string().default(''),
  message: z.string().default(''),
});
export type RunError = z.infer<typeof RunErrorSchema>;

/** Represents an agent run — mirrors GET /v1/runs/:runId response. */
export const RunSchema = z.object({
  runId: z.string().default(''),
  status: RunStatusSchema.optional(),
  result: RunResultSchema.optional(),
  usage: UsageSchema.optional(),
  error: RunErrorSchema.optional(),
});
export type Run = z.infer<typeof RunSchema>;

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export const PlatformToolSchema = z.object({
  type: z.literal('platform'),
  id: z.string(),
  options: z.record(z.string(), z.unknown()).optional(),
});
export type PlatformTool = z.infer<typeof PlatformToolSchema>;

export const FunctionToolSchema = z.object({
  type: z.literal('function'),
  name: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  method: z.enum(['GET', 'POST']).optional(),
  timeout: z.number().optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  headers: z.record(z.string(), z.string()).optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type FunctionTool = z.infer<typeof FunctionToolSchema>;

/**
 * MCP Authentication. Translates to an HTTP header sent with every tool call:
 *   - Bearer:  `{ "Authorization": "Bearer <token>" }`
 *   - API key: `{ "<header>": "<token>" }`
 */
export const McpAuthSchema = z.object({
  type: z.enum(['bearer', 'api_key']),
  token: z.string(),
  header: z.string().optional(),
});
export type McpAuth = z.infer<typeof McpAuthSchema>;

export const MCPToolSchema = z.object({
  type: z.literal('mcp'),
  url: z.string(),
  allowedTools: z.array(z.string()).optional(),
  auth: McpAuthSchema.optional(),
});
export type MCPTool = z.infer<typeof MCPToolSchema>;

/**
 * Tool union. Accepts the three canonical tool shapes plus a plain record
 * escape hatch so callers can pass raw dicts (mirrors the Python
 * `Tool = PlatformTool | FunctionTool | MCPTool | dict[str, Any]` allowance).
 */
export const ToolSchema = z.union([
  PlatformToolSchema,
  FunctionToolSchema,
  MCPToolSchema,
  z.record(z.string(), z.unknown()),
]);
export type Tool = PlatformTool | FunctionTool | MCPTool | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Multimodal content — mirrors the canonical Source + ContentBlock unions.
// ---------------------------------------------------------------------------

export const SourceBase64Schema = z.object({
  kind: z.literal('base64'),
  data: z.string(),
  mime: z.string(),
});
export type SourceBase64 = z.infer<typeof SourceBase64Schema>;

export const SourceBlobRefSchema = z.object({
  kind: z.literal('blob_ref'),
  blob_key: z.string(),
  mime: z.string(),
  size_bytes: z.number().optional(),
  attachment_id: z.string().optional(),
  presigned_url: z.string().optional(),
  presigned_expires_at: z.string().optional(),
});
export type SourceBlobRef = z.infer<typeof SourceBlobRefSchema>;

export const SourceUrlSchema = z.object({
  kind: z.literal('url'),
  url: z.string(),
  mime: z.string().optional(),
});
export type SourceUrl = z.infer<typeof SourceUrlSchema>;

export const SourceSchema = z.discriminatedUnion('kind', [
  SourceBase64Schema,
  SourceBlobRefSchema,
  SourceUrlSchema,
]);
export type Source = z.infer<typeof SourceSchema>;

export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextContent = z.infer<typeof TextContentSchema>;

export const ImageContentSchema = z.object({
  type: z.literal('image'),
  source: SourceSchema,
});
export type ImageContent = z.infer<typeof ImageContentSchema>;

export const AudioContentSchema = z.object({
  type: z.literal('audio'),
  source: SourceSchema,
});
export type AudioContent = z.infer<typeof AudioContentSchema>;

export const FileContentSchema = z.object({
  type: z.literal('file'),
  source: SourceSchema,
  filename: z.string().optional(),
  mime: z.string().optional(),
});
export type FileContent = z.infer<typeof FileContentSchema>;

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  FileContentSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// ---------------------------------------------------------------------------
// ToolResponse — canonical envelope returned by a FunctionTool endpoint.
// ---------------------------------------------------------------------------

export const ToolResponseSchema = z.object({
  tool_call_id: z.string().nullish(),
  content: z.array(ContentBlockSchema),
  is_error: z.boolean().default(false),
});
export type ToolResponse = z.infer<typeof ToolResponseSchema>;

// ---------------------------------------------------------------------------
// User-facing input types (camelCase, TS-idiomatic).
// ---------------------------------------------------------------------------

export type RunInput = {
  instructions: string;
  tools?: Tool[];
  /** Resource names to initialize for this run (e.g. `["sandbox"]`). */
  resources?: string[];
  /**
   * Names of skills to inject into the system prompt for this run. Skills are
   * reusable prompt fragments resolved by name at request time. Unknown names
   * fail the request.
   */
  skills?: string[];
  /**
   * JSON Schema for the answer output format. Pass either an {@link OutputSchema}
   * (from {@link zodToOutputSchema}) or a Zod schema directly — the SDK converts.
   */
  answerFormat?: OutputSchema | z.ZodType;
  /** Same as `answerFormat` but for the reasoning output. */
  reasoningFormat?: OutputSchema | z.ZodType;
  /** Canonical multimodal content blocks. Use the `Image` helper to build image blocks. */
  content?: ContentBlock[];
};

export type RunOutput = {
  /**
   * Webhook URL the server POSTs to when the run reaches a terminal state.
   * Useful for async workflows where polling or streaming is impractical.
   */
  callbackUrl?: string;
  /**
   * Shape of the run result. `'full'` returns the complete reasoning tree and
   * answer; `'answer_only'` returns just the final answer. Defaults to `'full'`.
   */
  responseContent?: 'full' | 'answer_only';
};

/**
 * Options for creating a run.
 *
 * `awaitCompletion` is purely a client-side flag — it toggles polling inside
 * `Subconscious.run()` and is **never sent to the server**. The other fields
 * (`timeout`, `maxStepTokens`, `output`) become the server-side runtime
 * limits on the wire.
 */
export type RunOptions = {
  awaitCompletion?: boolean;
  /** Maximum run duration in seconds (1–3600). Server cancels if exceeded. */
  timeout?: number;
  /** Per-step token ceiling (256–20000). */
  maxStepTokens?: number;
  output?: RunOutput;
};

export type RunParams = {
  engine: Engine;
  input: RunInput;
  options?: RunOptions;
};

export type PollOptions = {
  intervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
};

// ---------------------------------------------------------------------------
// Stream events
// ---------------------------------------------------------------------------

export const DeltaEventSchema = z.object({
  type: z.literal('delta'),
  runId: z.string(),
  content: z.string(),
});
export type DeltaEvent = z.infer<typeof DeltaEventSchema>;

export const DoneEventSchema = z.object({
  type: z.literal('done'),
  runId: z.string(),
});
export type DoneEvent = z.infer<typeof DoneEventSchema>;

export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  runId: z.string(),
  message: z.string(),
  code: z.string().optional(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export const StreamEventSchema = z.discriminatedUnion('type', [
  DeltaEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
