import { request } from "./internal/http.js";
import { pollUntilComplete, type PollOptions } from "./internal/poll.js";
import { createStream, type StreamOptions, type RunStream } from "./stream.js";
import type { Run, Engine, RunInput, RunOptions, RunParams } from "./types/run.js";

export type SubconsciousOptions = {
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
 *   engine: "tim-large",
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
export class Subconscious {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: SubconsciousOptions) {
    if (!opts.apiKey) {
      throw new Error("apiKey is required");
    }
    this.baseUrl = opts.baseUrl ?? "https://api.subconscious.dev/v1";
    this.apiKey = opts.apiKey;
  }

  /**
   * Create a new run.
   *
   * @param params.engine - The engine to use for the run
   * @param params.input - The input configuration including instructions and tools
   * @param params.options.awaitCompletion - If true, poll until the run completes
   * @returns The created run, optionally with results if awaitCompletion is true
   */
  async run(params: RunParams): Promise<Run> {
    const { runId } = await request<{ runId: string }>(`${this.baseUrl}/runs`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({
        engine: params.engine,
        input: params.input,
      }),
    });

    if (!params.options?.awaitCompletion) {
      return { runId };
    }

    return this.wait(runId);
  }

  /**
   * Create a streaming run that yields events as they arrive.
   *
   * @param params.engine - The engine to use for the run
   * @param params.input - The input configuration including instructions and tools
   * @param options.signal - AbortSignal to cancel the stream
   * @returns An async generator yielding stream events
   *
   * @example
   * ```ts
   * const stream = client.stream({
   *   engine: "tim-large",
   *   input: { instructions: "...", tools: [] },
   * });
   *
   * for await (const event of stream) {
   *   console.log(event.type, event);
   * }
   * ```
   */
  stream(
    params: { engine: Engine; input: RunInput },
    options?: StreamOptions,
  ): RunStream {
    return createStream(this.baseUrl, this.apiKey, params, options);
  }

  /**
   * Get the current state of a run.
   *
   * @param runId - The ID of the run to retrieve
   */
  async get(runId: string): Promise<Run> {
    return request<Run>(`${this.baseUrl}/runs/${runId}`, {
      headers: this.authHeaders(),
    });
  }

  /**
   * Wait for a run to complete by polling.
   *
   * @param runId - The ID of the run to wait for
   * @param options.intervalMs - Polling interval in milliseconds (default: 1000)
   * @param options.maxAttempts - Maximum polling attempts before throwing
   * @param options.signal - AbortSignal to cancel polling
   */
  async wait(runId: string, options?: PollOptions): Promise<Run> {
    return pollUntilComplete(
      `${this.baseUrl}/runs/${runId}`,
      this.authHeaders(),
      options,
    );
  }

  /**
   * Cancel a running run.
   *
   * @param runId - The ID of the run to cancel
   */
  async cancel(runId: string): Promise<Run> {
    return request<Run>(`${this.baseUrl}/runs/${runId}/cancel`, {
      method: "POST",
      headers: this.authHeaders(),
    });
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
}

