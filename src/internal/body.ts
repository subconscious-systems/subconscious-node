import { RequestTooLargeError } from '../types/error.js';
import type { Engine, RunInput, RunOptions } from '../types/run.js';

const MAX_REQUEST_BYTES = 5 * 1024 * 1024;

type WireOptions = {
  timeout?: number;
  max_step_tokens?: number;
};

type WireOutput = {
  callbackUrl?: string;
  responseContent?: 'full' | 'answer_only';
};

type WireBody = {
  engine: Engine;
  input: RunInput;
  options?: WireOptions;
  output?: WireOutput;
};

/**
 * Extract the server-side `options` subset from user-facing `RunOptions`,
 * renaming to the wire format keys. Returns `undefined` when every field is
 * unset so the key is omitted from the body entirely.
 *
 * `awaitCompletion` is intentionally excluded — it's a client-side polling
 * toggle and must not reach the server.
 */
function wireOptions(options?: RunOptions): WireOptions | undefined {
  if (!options) return undefined;
  const wire: WireOptions = {};
  if (options.timeout !== undefined) wire.timeout = options.timeout;
  if (options.maxStepTokens !== undefined) wire.max_step_tokens = options.maxStepTokens;
  return Object.keys(wire).length === 0 ? undefined : wire;
}

/**
 * Extract the server-side `output` block. Wire-format keys are camelCase
 * (`callbackUrl`, `responseContent`) matching the server Zod schema.
 */
function wireOutput(output?: RunOptions['output']): WireOutput | undefined {
  if (!output) return undefined;
  const wire: WireOutput = {};
  if (output.callbackUrl !== undefined) wire.callbackUrl = output.callbackUrl;
  if (output.responseContent !== undefined) wire.responseContent = output.responseContent;
  return Object.keys(wire).length === 0 ? undefined : wire;
}

/**
 * Serialize the POST /v1/runs body and size-check it before the network call.
 *
 * Mirrors `CreateRunBody.to_dict()` in the Python SDK: the same 5MB limit,
 * the same `RequestTooLargeError` surface. Callers that exceed the limit
 * should split images across multiple turns or upload via
 * `/v1/internal/attachments` first.
 */
export function buildRunBody(engine: Engine, input: RunInput, options?: RunOptions): string {
  const wire: WireBody = { engine, input };
  const opts = wireOptions(options);
  if (opts) wire.options = opts;
  const out = wireOutput(options?.output);
  if (out) wire.output = out;

  const body = JSON.stringify(wire);
  const byteLen = Buffer.byteLength(body, 'utf-8');
  if (byteLen > MAX_REQUEST_BYTES) {
    throw new RequestTooLargeError(
      `request body exceeds ${MAX_REQUEST_BYTES} bytes — split images ` +
        'across multiple turns or upload via /v1/internal/attachments first',
    );
  }
  return body;
}
