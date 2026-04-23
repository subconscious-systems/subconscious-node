import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { request } from './internal/http.js';
import { pollUntilComplete } from './internal/poll.js';
import { createStream, type StreamOptions, type RunStream } from './stream.js';
import { buildRunBody } from './helpers.js';
import {
  RunSchema,
  type Engine,
  type PollOptions,
  type Run,
  type RunInput,
  type RunParams,
} from './types.js';

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

/** Response shape of POST /v1/runs — only `runId` is guaranteed. */
const CreateRunResponseSchema = z.object({ runId: z.string() });

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
 * const client = new Subconscious();
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

  async run(params: RunParams): Promise<Run> {
    const body = buildRunBody(params.engine, params.input, params.options);
    const { runId } = await request(`${this.baseUrl}/runs`, CreateRunResponseSchema, {
      method: 'POST',
      headers: this.authHeaders(),
      body,
    });

    if (!params.options?.awaitCompletion) {
      return { runId };
    }

    return this.wait(runId);
  }

  stream(params: { engine: Engine; input: RunInput }, options?: StreamOptions): RunStream {
    return createStream(this.baseUrl, this.apiKey, params, options);
  }

  async get(runId: string): Promise<Run> {
    return request(`${this.baseUrl}/runs/${runId}`, RunSchema, {
      headers: this.authHeaders(),
    });
  }

  async wait(runId: string, options?: PollOptions): Promise<Run> {
    return pollUntilComplete(`${this.baseUrl}/runs/${runId}`, this.authHeaders(), options);
  }

  async cancel(runId: string): Promise<Run> {
    return request(`${this.baseUrl}/runs/${runId}/cancel`, RunSchema, {
      method: 'POST',
      headers: this.authHeaders(),
    });
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
}
