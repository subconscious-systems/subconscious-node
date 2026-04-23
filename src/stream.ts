import { requestStream } from './internal/http.js';
import { buildRunBody } from './helpers.js';
import {
  StreamEventSchema,
  type Engine,
  type Run,
  type RunInput,
  type StreamEvent,
} from './types.js';

export type StreamOptions = {
  signal?: AbortSignal;
};

export type RunStream = AsyncGenerator<StreamEvent, Run | undefined, undefined>;

/**
 * Create a streaming run that yields events as they arrive.
 *
 * The API uses OpenAI-compatible SSE format:
 *  - event: meta → { run_id }
 *  - data: { choices: [{ delta: { content } }] }
 *  - event: error → { error, details }
 *  - data: [DONE]
 *
 * Event payloads are validated defensively — malformed events are dropped
 * rather than killing the stream. Mirrors the Python stream parser's
 * tolerant posture.
 *
 * @internal Used by Subconscious.stream()
 */
export async function* createStream(
  baseUrl: string,
  apiKey: string,
  params: {
    engine: Engine;
    input: RunInput;
  },
  options: StreamOptions = {},
): RunStream {
  const body = buildRunBody(params.engine, params.input);

  const response = await requestStream(`${baseUrl}/runs/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body,
    signal: options.signal,
  });

  // Extract run ID from headers if available
  let runId = response.headers.get('x-run-id') || '';

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let isError = false;

  const emit = (event: unknown): StreamEvent | null => {
    const result = StreamEventSchema.safeParse(event);
    return result.success ? result.data : null;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('event:')) {
          const eventType = trimmed.slice(6).trim();
          isError = eventType === 'error';
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const dataContent = trimmed.slice(5).trim();

          if (dataContent === '[DONE]') {
            const evt = emit({ type: 'done', runId });
            if (evt) yield evt;
            continue;
          }

          try {
            const payload = JSON.parse(dataContent);

            if (payload.run_id) {
              runId = payload.run_id;
              continue;
            }

            if (isError || payload.error) {
              const evt = emit({
                type: 'error',
                runId,
                message: payload.details || payload.error || 'Unknown error',
                code: payload.code,
              });
              if (evt) yield evt;
              isError = false;
              continue;
            }

            const content = payload.choices?.[0]?.delta?.content;
            if (typeof content === 'string' && content.length > 0) {
              const evt = emit({ type: 'delta', runId, content });
              if (evt) yield evt;
            }
          } catch {
            // Skip malformed JSON — stream continues.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return runId ? { runId, status: 'succeeded' } : undefined;
}
