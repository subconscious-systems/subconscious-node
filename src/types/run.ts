import type { Tool } from './tool.js';
import type { OutputSchema } from './schema.js';
import type { ContentBlock } from './content.js';

/**
 * Engine identifier. Matches the public, non-deprecated engines from the
 * monorepo plus a `(string & {})` escape hatch so users can pass
 * newly-released engines the SDK hasn't been updated to know about yet.
 */
export type Engine =
  | 'tim'
  | 'tim-edge'
  | 'tim-claude'
  | 'tim-claude-heavy'
  | 'tim-oss-local'
  | 'tim-1.5'
  | 'tim-gpt-heavy-tc'
  | (string & {});

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'timed_out';

/** A tool call within a reasoning step. Maps to `AgentToolUse` in the monorepo. */
export type AgentToolUse = {
  tool_name: string;
  tool_call_id?: string | null;
  parameters: Record<string, unknown>;
  tool_result?: unknown;
};

/**
 * A node in the reasoning tree. Recursive via `subtasks`. All fields are
 * optional because the tree is built incrementally during streaming.
 */
export type ReasoningTask = {
  title?: string;
  thought?: string;
  tooluse?: AgentToolUse;
  subtasks?: ReasoningTask[];
  conclusion?: string;
};

/** The result of a completed run. Maps to `ReasoningOutput` in the monorepo. */
export type RunResult = {
  answer: string;
  reasoning?: ReasoningTask[];
};

/** Token usage for a run. Flat structure matching the API wire format exactly. */
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
};

/** Error details for a failed run. */
export type RunError = {
  code: string;
  message: string;
};

/** Represents an agent run — mirrors GET /v1/runs/:runId response. */
export type Run = {
  runId: string;
  status?: RunStatus;
  result?: RunResult;
  usage?: Usage;
  error?: RunError;
};

/** Input configuration for a run. */
export type RunInput = {
  instructions: string;
  tools?: Tool[];
  /** Resource names to initialize for this run (e.g. `["sandbox"]`). */
  resources?: string[];
  /**
   * Names of skills to inject into the system prompt for this run. Skills are
   * reusable prompt fragments resolved by name at request time (platform/public
   * skills are global; org skills are org-scoped). Unknown names fail the request.
   */
  skills?: string[];
  /** JSON Schema for the answer output format. Use `zodToJsonSchema()` to generate from Zod. */
  answerFormat?: OutputSchema;
  /** JSON Schema for the reasoning output format. Use `zodToJsonSchema()` to generate from Zod. */
  reasoningFormat?: OutputSchema;
  /**
   * Canonical multimodal content blocks (text, image, audio, file).
   * Use the `Image` helper to build ImageContent blocks from a path,
   * bytes, URL, or blob_key.
   */
  content?: ContentBlock[];
};

/**
 * Server-side output delivery options (webhook, response payload shape).
 * Carried in the request body as a top-level `output` object.
 */
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
 * `awaitCompletion` is purely a client-side flag that toggles polling inside
 * {@link Subconscious.run}; it is never sent to the server. The remaining
 * fields (`timeout`, `maxStepTokens`, `output`) are serialized into the
 * POST /v1/runs body as server-side runtime limits.
 */
export type RunOptions = {
  /**
   * Client-side only — **never sent to the server**. When true, `client.run()`
   * polls `GET /v1/runs/:id` until the run reaches a terminal state before
   * returning. When false (default), `run()` returns as soon as the run is
   * accepted, with only `runId` populated.
   */
  awaitCompletion?: boolean;
  /** Maximum run duration in seconds (1–3600). Server cancels the run if exceeded. */
  timeout?: number;
  /** Per-step token ceiling (256–20000). Caps tokens generated in any single reasoning step. */
  maxStepTokens?: number;
  /** Server-side output delivery options (webhook, response payload shape). */
  output?: RunOutput;
};

export type RunParams = {
  engine: Engine;
  input: RunInput;
  options?: RunOptions;
};
