import { request } from './internal/http.js';
import { normalizeTools } from './internal/normalize-tools.js';
import { pollUntilComplete, type PollOptions } from './internal/poll.js';
import {
  createObserveStream,
  createStream,
  type RunStream,
  type StreamOptions,
} from './stream.js';
import { coerceAnswerFormat } from './types/schema.js';
import type { OutputSchema } from './types/schema.js';
import type { Engine, Run, RunInput, RunOptions, RunParams } from './types/run.js';

export type SubconsciousOptions = {
  apiKey: string;
  baseUrl?: string;
  /**
   * Headers merged into every FunctionTool dispatch. Use this for
   * cross-cutting auth (e.g. an HMAC shared secret) instead of
   * duplicating `headers` on every function tool. Per-tool headers
   * take precedence on conflict. (R9.)
   */
  defaultFunctionToolHeaders?: Record<string, string>;
  /**
   * Hidden parameter values merged into every FunctionTool's `defaults`.
   * Keys collide last-wins toward the per-tool definition. (R9.)
   *
   * Example: `defaultFunctionToolDefaults: { tenant_id: 't_abc' }`
   * lets every dispatched function call carry the tenant id without
   * re-declaring it on each tool.
   */
  defaultFunctionToolDefaults?: Record<string, unknown>;
};

/**
 * Generic params for `run<T>` / `runAndWait<T>` / `stream<T>`. The `input`
 * accepts either a JSON Schema `OutputSchema` or a Zod schema (R13);
 * the client coerces Zod to JSON Schema before dispatch.
 */
export type GenericRunParams = Omit<RunParams, 'input'> & {
  input: Omit<RunInput, 'answerFormat' | 'reasoningFormat'> & {
    /** JSON Schema or Zod schema (R13). */
    answerFormat?: OutputSchema | unknown;
    /** JSON Schema or Zod schema (R13). */
    reasoningFormat?: OutputSchema | unknown;
  };
  /**
   * @deprecated Use `client.runAndWait()` instead of `options.awaitCompletion`.
   *   Passing `options.awaitCompletion: true` to `client.run()` transparently
   *   routes through `runAndWait()` and emits a one-shot console warning.
   */
  options?: RunOptions;
};

let awaitCompletionWarningShown = false;
function warnAwaitCompletionDeprecated() {
  if (awaitCompletionWarningShown) return;
  awaitCompletionWarningShown = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[subconscious] `options.awaitCompletion` is deprecated. ' +
      'Call `client.runAndWait(...)` instead of `client.run({ ..., options: { awaitCompletion: true } })`. ' +
      'The legacy field will be removed in a future minor release.',
  );
}

/**
 * The main Subconscious API client.
 *
 * @example Fire-and-forget (R18)
 * ```ts
 * const { runId } = await client.run({
 *   engine: 'tim-claude',
 *   input: { instructions: 'Search the latest AI news' },
 * });
 * ```
 *
 * @example Wait for completion (R18, R10)
 * ```ts
 * const run = await client.runAndWait<{ summary: string }>({
 *   engine: 'tim-claude',
 *   input: {
 *     instructions: 'Summarize this article…',
 *     answerFormat: SummarySchema, // pass Zod directly (R13)
 *   },
 * });
 * console.log(run.result?.answer.summary); //   typed
 * ```
 *
 * @example Streaming
 * ```ts
 * for await (const event of client.stream({ engine: 'tim-claude', input })) {
 *   if (event.type === 'started') console.log('runId:', event.runId);
 *   if (event.type === 'delta')   process.stdout.write(event.content);
 *   if (event.type === 'result')  console.log('answer:', event.result.answer);
 * }
 * ```
 */
export class Subconscious {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultFunctionToolHeaders?: Record<string, string>;
  private readonly defaultFunctionToolDefaults?: Record<string, unknown>;

  constructor(opts: SubconsciousOptions) {
    if (!opts.apiKey) {
      throw new Error('apiKey is required');
    }
    this.baseUrl = opts.baseUrl ?? 'https://api.subconscious.dev/v1';
    this.apiKey = opts.apiKey;
    this.defaultFunctionToolHeaders = opts.defaultFunctionToolHeaders;
    this.defaultFunctionToolDefaults = opts.defaultFunctionToolDefaults;
  }

  /**
   * Create a run and return its `runId` immediately. Fire-and-forget.
   *
   * Use `client.runAndWait()` if you want to block until the run reaches
   * a terminal state. (R18.)
   *
   * Back-compat: if `params.options?.awaitCompletion === true`, this method
   * transparently routes through `runAndWait()` and emits a one-shot
   * deprecation warning. New code should call `runAndWait()` directly.
   *
   * @returns The created run, with only `runId` populated (or a fully
   *   resolved run when the deprecated `awaitCompletion` is true).
   */
  async run<T = unknown>(params: GenericRunParams): Promise<Run<T>> {
    if (params.options?.awaitCompletion) {
      warnAwaitCompletionDeprecated();
      return this.runAndWait<T>(params);
    }
    return this.createRunOnly<T>(params);
  }

  /**
   * Create a run and poll until it reaches a terminal state.
   *
   * @example
   * ```ts
   * const run = await client.runAndWait<{ summary: string }>({...});
   * console.log(run.result?.answer.summary); // typed
   * ```
   */
  async runAndWait<T = unknown>(
    params: GenericRunParams,
    pollOptions?: PollOptions,
  ): Promise<Run<T>> {
    // Use `createRunOnly` (the bare POST) instead of `run()` to avoid
    // ping-ponging on the deprecated `options.awaitCompletion` back-compat
    // path: `run({ options: { awaitCompletion: true } })` calls
    // `runAndWait`, which would then call `run` again and recurse forever.
    const { runId } = await this.createRunOnly<T>(params);
    return this.wait<T>(runId, pollOptions);
  }

  /**
   * The bare "POST /runs and return the runId" path. Internal — public
   * callers should reach for `run()` (fire-and-forget) or `runAndWait()`
   * (polling).
   */
  private async createRunOnly<T = unknown>(params: GenericRunParams): Promise<Run<T>> {
    const body = this.buildCreateBody(params);
    const { runId } = await request<{ runId: string }>(`${this.baseUrl}/runs`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    return { runId } as Run<T>;
  }

  /**
   * Create a streaming run that yields typed events as they arrive.
   *
   * Stream Events v2 (R8, R15) — yields `started`, `delta`,
   * `reasoning_node`, `tool_call`, `result`, `error`, `done`.
   * The first event is always `started` and carries the runId
   * synchronously; the last event is always `done`.
   *
   * @example
   * ```ts
   * for await (const event of client.stream({ engine, input })) {
   *   switch (event.type) {
   *     case 'started':   registerCancel(event.runId); break;
   *     case 'delta':     write(event.content); break;
   *     case 'tool_call': console.log(event.call); break;
   *     case 'result':    console.log(event.result); break;
   *     case 'error':     handle(event.code, event.message); break;
   *   }
   * }
   * ```
   */
  stream<T = unknown>(params: GenericRunParams, options?: StreamOptions): RunStream<T> {
    const body = this.buildCreateBody(params);
    return createStream<T>(this.baseUrl, this.apiKey, body as { engine: Engine; input: RunInput }, options);
  }

  /**
   * Re-attach to an in-flight (or finished) run and stream its events
   * from the durable buffer. Same wire format as `stream()`. Useful when
   * a parent process restarts and needs to resume an existing run. (R16.)
   *
   * @example
   * ```ts
   * const { runId } = await client.run({ engine, input });
   * await persistToDb(runId);
   * // … later, possibly in a different process …
   * for await (const event of client.observe<MyAnswer>(runId)) { ... }
   * ```
   */
  observe<T = unknown>(runId: string, options?: StreamOptions): RunStream<T> {
    return createObserveStream<T>(this.baseUrl, this.apiKey, runId, options);
  }

  /**
   * Get the current state of a run.
   */
  async get<T = unknown>(runId: string): Promise<Run<T>> {
    return request<Run<T>>(`${this.baseUrl}/runs/${runId}`, {
      headers: this.authHeaders(),
    });
  }

  /**
   * Wait for a run to complete by polling.
   */
  async wait<T = unknown>(runId: string, options?: PollOptions): Promise<Run<T>> {
    return pollUntilComplete<T>(`${this.baseUrl}/runs/${runId}`, this.authHeaders(), options);
  }

  /**
   * Cancel a run. **Idempotent** (R9): callers may invoke this against a
   * run in any state (running, queued, already terminal) and receive the
   * run's current shape with a 200 response. Already-cancelled or already-
   * succeeded runs are returned unchanged with their existing status, so
   * you do not need to wrap this in a `try/catch` for the common case.
   *
   * Errors are only thrown for network/auth failures.
   */
  async cancel<T = unknown>(runId: string): Promise<Run<T>> {
    return request<Run<T>>(`${this.baseUrl}/runs/${runId}/cancel`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
  }

  /**
   * Build the POST /v1/runs body from a `GenericRunParams`. Handles the
   * R13 Zod-or-JSON-Schema coercion and R9 client-level header / defaults
   * injection on FunctionTools, then runs R12 normalize-tools (auto-promote
   * `defaults` keys into `parameters.properties`).
   */
  private buildCreateBody(params: GenericRunParams): { engine: Engine; input: RunInput } {
    const { engine, input } = params;

    const tools = normalizeTools(input.tools, {
      defaultFunctionToolHeaders: this.defaultFunctionToolHeaders,
      defaultFunctionToolDefaults: this.defaultFunctionToolDefaults,
    });

    const { answerFormat, reasoningFormat, ...rest } = input;

    const normalizedInput: RunInput = {
      ...rest,
      ...(tools !== undefined ? { tools } : {}),
      ...(answerFormat !== undefined && {
        answerFormat: coerceAnswerFormat(answerFormat, 'Answer'),
      }),
      ...(reasoningFormat !== undefined && {
        reasoningFormat: coerceAnswerFormat(reasoningFormat, 'Reasoning'),
      }),
    };

    return { engine, input: normalizedInput };
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
}
