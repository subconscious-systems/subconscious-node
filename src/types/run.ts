/**
 * Engine identity. The canonical live set is sourced from the API's
 * `packages/common/engines.ts` ENGINE_DATA. Old aliases (tim-gpt, tim-large,
 * timini, tim-small, etc.) are still accepted for back-compat by the server,
 * which resolves them to the live engine; SDK consumers writing new code
 * should reach for one of the live names below.
 *
 * The string-and-string-shaped fallback (`(string & {})`) keeps autocomplete
 * narrow without blocking forward-compatible engine names.
 */
export type Engine =
  | 'tim'
  | 'tim-edge'
  | 'tim-claude'
  | 'tim-claude-heavy'
  | 'tim-omni'
  | 'tim-omni-mini'
  // Legacy aliases — accepted by the server, resolved to a live engine.
  | 'tim-large'
  | 'tim-small'
  | 'tim-small-preview'
  | 'tim-gpt'
  | 'tim-gpt-heavy'
  | 'timini'
  | (string & {});

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'timed_out';

/**
 * One completed tool invocation captured inside a reasoning node. (R3.)
 *
 * Pre-1.0 the SDK typed the tool envelope as `unknown[]`, forcing every
 * consumer to cast and JSON.parse. We now expose the concrete shape the
 * engine emits so consumers can read parameters and results directly.
 */
export type ToolUse = {
  tool_name: string;
  parameters?: unknown;
  tool_result?: unknown;
};

/**
 * Single node in the reasoning tree.
 *
 * Note `subtasks` (plural). Earlier versions shipped `subtask` (singular)
 * which differed from the Python SDK and from what the engine actually
 * emits. (R2.)
 *
 * `tooluse` is `ToolUse | null` (singular, not an array) — engines emit at
 * most one tool call per node. (R3.)
 */
export type ReasoningNode = {
  title: string;
  thought: string;
  tooluse: ToolUse | null;
  subtasks: ReasoningNode[];
  conclusion: string;
};

/**
 * Final structured result.
 *
 * Generic `T` defaults to `unknown` so consumers using `answerFormat` can
 * narrow it: `client.runAndWait<MySchema>({...})`. When unset the engine
 * returns `answer: string` for free-form completions. (R10.)
 */
export type RunResult<T = unknown> = {
  answer: T;
  reasoning: ReasoningNode[] | null;
};

export type Run<T = unknown> = {
  runId: string;
  status?: RunStatus;
  result?: RunResult<T>;
  usage?: Usage;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
};

export type ModelUsage = {
  engine: Engine;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type PlatformToolUsage = {
  toolId: string;
  calls: number;
};

export type RunInput = {
  instructions: string;
  tools?: import('./tool.js').Tool[];
  /**
   * Inline image inputs. Each entry is either a public URL or a base64
   * data URI. The server folds these into `content[]` at ingest. (R1.)
   */
  images?: string[];
  /**
   * **Deprecated** — pass `{ type: 'resource', id }` blocks inside
   * `tools[]` instead. Still accepted by the server for one minor
   * release of back-compat. (R17.)
   */
  resources?: string[];
  /**
   * Skill IDs. The server resolves these into a manifest the engine
   * sees alongside `instructions`. (R1.)
   */
  skills?: string[];
  /**
   * Optional agent identifier — the run is associated with this agent's
   * config + memory. (R1.)
   */
  agentId?: string;
  /** JSON Schema for the answer output format. Use zodToJsonSchema() to generate from Zod. */
  answerFormat?: import('./schema.js').OutputSchema;
  /** JSON Schema for the reasoning output format. Use zodToJsonSchema() to generate from Zod. */
  reasoningFormat?: import('./schema.js').OutputSchema;
};

export type RunParams = {
  engine: Engine;
  input: RunInput;
};
