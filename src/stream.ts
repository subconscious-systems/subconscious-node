import { requestStream } from './internal/http.js';
import type { ErrorCode } from './types/error.js';
import type {
  ErrorEvent,
  ReasoningNodeEvent,
  ResultEvent,
  StartedEvent,
  StreamEvent,
  ToolCallEvent,
} from './types/events.js';
import type { Engine, Run, RunInput, RunStatus } from './types/run.js';

export type StreamOptions = {
  signal?: AbortSignal;
};

type ParsedStreamState<T> = Pick<Run<T>, 'runId' | 'status' | 'result' | 'usage'>;

function statusFromErrorCode(code: ErrorCode): RunStatus {
  if (code === 'canceled') return 'canceled';
  if (code === 'timeout') return 'timed_out';
  return 'failed';
}

/**
 * Stream Events v2 (R8, R15): the SDK emits a typed discriminated union.
 *
 * Yielded order:
 *   1. `started` — always first; carries runId synchronously.
 *   2. zero or more `delta` / `reasoning_node` / `tool_call` events.
 *   3. exactly one `result` (success) or `error` (failure).
 *   4. `done` — always last.
 *
 * Generic `T` narrows the `result.answer` shape when paired with
 * `answerFormat`. Defaults to `unknown` so consumers without structured
 * output get the historical `string` answer.
 */
export type RunStream<T = unknown> = AsyncGenerator<
  StreamEvent<T>,
  Run<T> | undefined,
  undefined
>;

/** Internal helper — yields parsed StreamEvents from an SSE Response body. */
async function* parseSSEStream<T>(
  body: ReadableStream<Uint8Array>,
  initialRunId: string,
): AsyncGenerator<StreamEvent<T>, ParsedStreamState<T>, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let runId = initialRunId;
  const state: ParsedStreamState<T> = { runId };
  let pendingEvent: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        // Comment / heartbeat — `:keep-alive\n\n`
        if (line.startsWith(':')) continue;

        if (line === '') {
          // Blank line = end of one SSE record. Reset event tag.
          pendingEvent = null;
          continue;
        }

        if (line.startsWith('event:')) {
          pendingEvent = line.slice(6).trim();
          continue;
        }

        if (!line.startsWith('data:')) continue;
        const dataContent = line.slice(5).trim();

        if (dataContent === '[DONE]') {
          yield { type: 'done', runId } as StreamEvent<T>;
          pendingEvent = null;
          continue;
        }

        let payload: any;
        try {
          payload = JSON.parse(dataContent);
        } catch {
          // Malformed JSON — drop frame.
          continue;
        }

        switch (pendingEvent) {
          case 'started':
          case 'meta': {
            // Both shapes carry the runId. We always emit `started` once.
            // Canonical wire key is `runId` (camelCase). The legacy
            // `run_id` snake_case form is accepted for one minor release
            // of back-compat with older API builds.
            const id = payload.runId ?? payload.run_id;
            if (typeof id === 'string' && id.length > 0) {
              if (runId !== id) {
                runId = id;
                state.runId = id;
                yield { type: 'started', runId } as StartedEvent as StreamEvent<T>;
              } else if (pendingEvent === 'started') {
                yield { type: 'started', runId } as StartedEvent as StreamEvent<T>;
              }
            }
            break;
          }

          case 'reasoning_node': {
            const node = payload.node ?? payload;
            yield {
              type: 'reasoning_node',
              runId,
              node,
            } as ReasoningNodeEvent as StreamEvent<T>;
            break;
          }

          case 'tool_call': {
            const call = payload.call ?? payload;
            yield {
              type: 'tool_call',
              runId,
              call,
            } as ToolCallEvent as StreamEvent<T>;
            break;
          }

          case 'result': {
            const result = payload.result ?? payload;
            const event = {
              type: 'result',
              runId,
              result,
              ...(payload.usage ? { usage: payload.usage } : {}),
            } as ResultEvent<T>;
            state.status = 'succeeded';
            state.result = event.result;
            if (event.usage) state.usage = event.usage;
            yield event as StreamEvent<T>;
            break;
          }

          case 'error': {
            const code: ErrorCode = (payload.code as ErrorCode) ?? 'internal_error';
            const message = payload.message ?? payload.details ?? payload.error ?? 'Unknown error';
            state.status = statusFromErrorCode(code);
            yield {
              type: 'error',
              runId,
              code,
              message,
              ...(payload.details ? { details: payload.details } : {}),
            } as ErrorEvent as StreamEvent<T>;
            break;
          }

          default: {
            // Untagged data frames are OpenAI-compat delta chunks.
            const content = payload.choices?.[0]?.delta?.content;
            if (typeof content === 'string' && content.length > 0) {
              yield { type: 'delta', runId, content } as StreamEvent<T>;
            }
            break;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  state.runId = runId;
  return state;
}

/**
 * Create a streaming run that yields events as they arrive.
 *
 * Stream Events v2 (R8, R15): yields a typed discriminated union including
 * `started`, `reasoning_node`, `tool_call`, and `result` in addition to
 * the legacy `delta` / `error` / `done` events.
 *
 * @internal Used by Subconscious.stream()
 */
export async function* createStream<T = unknown>(
  baseUrl: string,
  apiKey: string,
  params: {
    engine: Engine;
    input: RunInput;
  },
  options: StreamOptions = {},
): RunStream<T> {
  const response = await requestStream(`${baseUrl}/runs/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      engine: params.engine,
      input: params.input,
    }),
    signal: options.signal,
  });

  const headerRunId = response.headers.get('x-run-id') ?? '';

  if (!response.body) {
    throw new Error('Response body is not readable');
  }

  // R8: emit `started` synchronously the moment we have a runId, even
  // before the first server frame, so consumers can register cancellation
  // before any deltas. The parser will not double-emit if the server's
  // `started` frame carries the same id.
  let synthesizedStarted = false;
  if (headerRunId) {
    yield { type: 'started', runId: headerRunId } as StartedEvent as StreamEvent<T>;
    synthesizedStarted = true;
  }

  const finalState = yield* (async function* () {
    const inner = parseSSEStream<T>(response.body!, headerRunId);
    let firstStartedSkipped = !synthesizedStarted;
    while (true) {
      const next = await inner.next();
      if (next.done) return next.value;
      // Skip the parser's first `started` if we already synthesized one
      // for the same id.
      if (
        !firstStartedSkipped &&
        next.value.type === 'started' &&
        next.value.runId === headerRunId
      ) {
        firstStartedSkipped = true;
        continue;
      }
      firstStartedSkipped = true;
      yield next.value;
    }
  })();

  return finalState.runId ? (finalState as Run<T>) : undefined;
}

/**
 * Re-attach to an in-flight (or already finished) run and stream its
 * events. Same wire format as `createStream`. (R16.)
 *
 * @internal Used by Subconscious.observe()
 */
export async function* createObserveStream<T = unknown>(
  baseUrl: string,
  apiKey: string,
  runId: string,
  options: StreamOptions = {},
): RunStream<T> {
  const response = await requestStream(`${baseUrl}/runs/${runId}/stream`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: options.signal,
  });

  if (!response.body) {
    throw new Error('Response body is not readable');
  }

  const finalState = yield* parseSSEStream<T>(response.body, runId);
  return finalState.runId ? (finalState as Run<T>) : undefined;
}
