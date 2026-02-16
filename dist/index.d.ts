/**
 * JSON Schema types for structured output.
 *
 * Use `zodToJsonSchema()` to convert a Zod schema to this format.
 */
/** Supported JSON Schema property types */
type JSONSchemaProperty = JSONSchemaString | JSONSchemaNumber | JSONSchemaBoolean | JSONSchemaArray | JSONSchemaObject | JSONSchemaEnum | JSONSchemaAnyOf;
type JSONSchemaString = {
    type: 'string';
    description?: string;
    format?: 'date' | 'date-time' | 'email' | 'uuid';
    pattern?: string;
};
type JSONSchemaNumber = {
    type: 'number' | 'integer';
    description?: string;
};
type JSONSchemaBoolean = {
    type: 'boolean';
    description?: string;
};
type JSONSchemaArray = {
    type: 'array';
    items: JSONSchemaProperty;
    description?: string;
};
type JSONSchemaObject = {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
    additionalProperties?: false;
    description?: string;
    $defs?: Record<string, unknown>;
};
type JSONSchemaEnum = {
    type: 'string';
    enum: string[];
    description?: string;
};
type JSONSchemaAnyOf = {
    anyOf: JSONSchemaProperty[];
    description?: string;
};
/**
 * The format expected by answerFormat and reasoningFormat.
 * A JSON Schema object with a title.
 */
type OutputSchema = {
    $defs?: Record<string, unknown>;
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
    title: string;
    type: 'object';
};
/**
 * Convert a Zod schema to the JSON Schema format expected by Subconscious.
 *
 * @param schema - A Zod object schema (z.object(...))
 * @param title - The title for the schema (required)
 * @returns A JSON Schema compatible with answerFormat/reasoningFormat
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { zodToJsonSchema } from 'subconscious';
 *
 * const schema = z.object({
 *   summary: z.string().describe('A brief summary'),
 *   score: z.number().describe('Score from 1-10'),
 *   tags: z.array(z.string()),
 * });
 *
 * const answerFormat = zodToJsonSchema(schema, 'AnalysisResult');
 *
 * const run = await client.run({
 *   engine: 'tim-large',
 *   input: {
 *     instructions: 'Analyze this article...',
 *     tools: [],
 *     answerFormat,
 *   },
 * });
 * ```
 */
declare function zodToJsonSchema(schema: unknown, title: string): OutputSchema;

type PlatformTool = {
    type: 'platform';
    id: string;
    options: Record<string, unknown>;
};
type FunctionTool = {
    type: 'function';
    name: string;
    description: string;
    url: string;
    method: 'GET' | 'POST';
    timeout?: number;
    parameters: Record<string, unknown>;
    headers?: Record<string, string>;
    defaults?: Record<string, unknown>;
};
type MCPTool = {
    type: 'mcp';
    url: string;
    allow?: string[];
};
type Tool = PlatformTool | FunctionTool | MCPTool;

type Engine = 'tim-edge' | 'tim-gpt' | 'tim-gpt-heavy' | (string & {});
type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'timed_out';
type ReasoningNode = {
    title: string;
    thought: string;
    tooluse: unknown[];
    subtask: ReasoningNode[];
    conclusion: string;
};
type RunResult = {
    answer: string;
    reasoning: ReasoningNode;
};
type Run = {
    runId: string;
    status?: RunStatus;
    result?: RunResult;
    usage?: Usage;
};
type Usage = {
    models: ModelUsage[];
    platformTools: PlatformToolUsage[];
};
type ModelUsage = {
    engine: Engine;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
};
type PlatformToolUsage = {
    toolId: string;
    calls: number;
};
type RunInput = {
    instructions: string;
    tools?: Tool[];
    /** JSON Schema for the answer output format. Use zodToJsonSchema() to generate from Zod. */
    answerFormat?: OutputSchema;
    /** JSON Schema for the reasoning output format. Use zodToJsonSchema() to generate from Zod. */
    reasoningFormat?: OutputSchema;
};
type RunOptions = {
    awaitCompletion?: boolean;
};
type RunParams = {
    engine: Engine;
    input: RunInput;
    options?: RunOptions;
};

type PollOptions = {
    intervalMs?: number;
    maxAttempts?: number;
    signal?: AbortSignal;
};

/**
 * Text delta event - emitted as text is generated.
 */
type DeltaEvent = {
    type: 'delta';
    runId: string;
    content: string;
};
/**
 * Stream completed successfully.
 */
type DoneEvent = {
    type: 'done';
    runId: string;
};
/**
 * Stream encountered an error.
 */
type ErrorEvent = {
    type: 'error';
    runId: string;
    message: string;
    code?: string;
};
/**
 * All possible stream events.
 *
 * Currently supports text deltas. Rich events (reasoning, tool calls)
 * are coming soon.
 */
type StreamEvent = DeltaEvent | DoneEvent | ErrorEvent;

type StreamOptions = {
    signal?: AbortSignal;
};
type RunStream = AsyncGenerator<StreamEvent, Run | undefined, undefined>;

type SubconsciousOptions = {
    apiKey: string;
    baseUrl?: string;
};
/**
 * The main Subconscious API client.
 *
 * @example
 * ```ts
 * import { Subconscious } from "subconscious";
 *
 * const client = new Subconscious({ apiKey: process.env.SUBCONSCIOUS_API_KEY });
 *
 * const run = await client.run({
 *   engine: "tim-gpt",
 *   input: {
 *     instructions: "Search for the latest news about AI",
 *     tools: [{ type: "platform", id: "parallel_search", options: {} }],
 *   },
 *   options: { awaitCompletion: true },
 * });
 *
 * console.log(run.result?.answer);
 * ```
 */
declare class Subconscious {
    private readonly baseUrl;
    private readonly apiKey;
    constructor(opts: SubconsciousOptions);
    /**
     * Create a new run.
     *
     * @param params.engine - The engine to use for the run
     * @param params.input - The input configuration including instructions and tools
     * @param params.options.awaitCompletion - If true, poll until the run completes
     * @returns The created run, optionally with results if awaitCompletion is true
     */
    run(params: RunParams): Promise<Run>;
    /**
     * Create a streaming run that yields text deltas as they arrive.
     *
     * @param params.engine - The engine to use for the run
     * @param params.input - The input configuration including instructions and tools
     * @param options.signal - AbortSignal to cancel the stream
     * @returns An async generator yielding delta, done, or error events
     *
     * @example
   * ```ts
   * const stream = client.stream({
   *   engine: "tim-gpt",
   *   input: { instructions: "...", tools: [] },
   * });
   *
   * for await (const event of stream) {
   *   if (event.type === 'delta') {
   *     process.stdout.write(event.content);
   *   }
   * }
   * ```
     */
    stream(params: {
        engine: Engine;
        input: RunInput;
    }, options?: StreamOptions): RunStream;
    /**
     * Get the current state of a run.
     *
     * @param runId - The ID of the run to retrieve
     */
    get(runId: string): Promise<Run>;
    /**
     * Wait for a run to complete by polling.
     *
     * @param runId - The ID of the run to wait for
     * @param options.intervalMs - Polling interval in milliseconds (default: 1000)
     * @param options.maxAttempts - Maximum polling attempts before throwing
     * @param options.signal - AbortSignal to cancel polling
     */
    wait(runId: string, options?: PollOptions): Promise<Run>;
    /**
     * Cancel a running run.
     *
     * @param runId - The ID of the run to cancel
     */
    cancel(runId: string): Promise<Run>;
    private authHeaders;
}

type ErrorCode = 'invalid_request' | 'authentication_failed' | 'permission_denied' | 'not_found' | 'rate_limited' | 'internal_error' | 'service_unavailable' | 'timeout';
type APIErrorResponse = {
    error: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
    };
};
declare class SubconsciousError extends Error {
    readonly code: ErrorCode;
    readonly status: number;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message: string, status: number, details?: Record<string, unknown>);
}
declare class AuthenticationError extends SubconsciousError {
    constructor(message?: string);
}
declare class RateLimitError extends SubconsciousError {
    constructor(message?: string);
}
declare class NotFoundError extends SubconsciousError {
    constructor(message?: string);
}
declare class ValidationError extends SubconsciousError {
    constructor(message: string, details?: Record<string, unknown>);
}

export { type APIErrorResponse, AuthenticationError, type DeltaEvent, type DoneEvent, type Engine, type ErrorCode, type ErrorEvent, type FunctionTool, type JSONSchemaAnyOf, type JSONSchemaArray, type JSONSchemaBoolean, type JSONSchemaEnum, type JSONSchemaNumber, type JSONSchemaObject, type JSONSchemaProperty, type JSONSchemaString, type MCPTool, type ModelUsage, NotFoundError, type OutputSchema, type PlatformTool, type PlatformToolUsage, RateLimitError, type ReasoningNode, type Run, type RunInput, type RunOptions, type RunParams, type RunResult, type RunStatus, type RunStream, type StreamEvent, type StreamOptions, Subconscious, SubconsciousError, type SubconsciousOptions, type Tool, type Usage, ValidationError, zodToJsonSchema };
