import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { request } from './internal/http.js';
import { pollUntilComplete, type PollOptions } from './internal/poll.js';
import { createStream, type StreamOptions, type RunStream } from './stream.js';
import { buildRunBody } from './internal/body.js';
import type { Run, Engine, RunInput, RunParams } from './types/run.js';

export type SubconsciousOptions = {
  apiKey?: string;
  baseUrl?: string;
};

/**
 * Resolve the API key using a standard precedence chain:
 *  1. Explicitly passed `apiKey` option
 *  2. `SUBCONSCIOUS_API_KEY` environment variable
 *  3. `~/.subcon/config.json` (written by `subconscious login`)
 */
function resolveApiKey(explicit?: string): string {
  if (explicit) return explicit;

  const envKey = process.env['SUBCONSCIOUS_API_KEY'];
  if (envKey) return envKey;

  try {
    const configPath = join(homedir(), '.subcon', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.subconscious_api_key) return config.subconscious_api_key;
  } catch {
    // Config file doesn't exist or is malformed — fall through
  }

  throw new Error(
    'No API key found. Either:\n' +
      '  • Pass { apiKey } to the Subconscious constructor\n' +
      '  • Set SUBCONSCIOUS_API_KEY environment variable\n' +
      '  • Run `npx subconscious login` to authenticate',
  );
}

/**
 * The main Subconscious API client.
 *
 * The API key is resolved automatically if not provided:
 * `apiKey` option → `SUBCONSCIOUS_API_KEY` env var → `~/.subcon/config.json`.
 *
 * @example
 * ```ts
 * import { Subconscious } from "subconscious";
 *
 * // Key auto-resolved from env or ~/.subcon/config.json
 * const client = new Subconscious();
 *
 * const run = await client.run({
 *   engine: "tim",
 *   input: {
 *     instructions: "Search for the latest news about AI",
 *     tools: [{ type: "platform", id: "web_search" }],
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

  constructor(opts: SubconsciousOptions = {}) {
    this.apiKey = resolveApiKey(opts.apiKey);
    this.baseUrl = opts.baseUrl ?? 'https://api.subconscious.dev/v1';
  }

  /**
   * Create a new run.
   *
   * @param params.engine - The engine to use for the run
   * @param params.input - The input configuration including instructions, tools, skills
   * @param params.options.awaitCompletion - Client-side only. If true, poll until the run completes.
   * @param params.options.timeout - Server-side max run duration (1–3600s).
   * @param params.options.maxStepTokens - Server-side per-step token cap (256–20000).
   * @param params.options.output - Server-side output delivery (webhook, response shape).
   * @returns The created run, optionally with results if awaitCompletion is true
   */
  async run(params: RunParams): Promise<Run> {
    const body = buildRunBody(params.engine, params.input, params.options);
    const { runId } = await request<{ runId: string }>(`${this.baseUrl}/runs`, {
      method: 'POST',
      headers: this.authHeaders(),
      body,
    });

    if (!params.options?.awaitCompletion) {
      return { runId };
    }

    return this.wait(runId);
  }

  /**
   * Create a streaming run that yields text deltas as they arrive.
   *
   * @example
   * ```ts
   * const stream = client.stream({
   *   engine: "tim",
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
  stream(params: { engine: Engine; input: RunInput }, options?: StreamOptions): RunStream {
    return createStream(this.baseUrl, this.apiKey, params, options);
  }

  /** Get the current state of a run. */
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
    return pollUntilComplete(`${this.baseUrl}/runs/${runId}`, this.authHeaders(), options);
  }

  /** Cancel a running run. */
  async cancel(runId: string): Promise<Run> {
    return request<Run>(`${this.baseUrl}/runs/${runId}/cancel`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
}
