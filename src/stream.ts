import { requestStream } from './internal/http.js';
import type { StreamEvent } from './types/events.js';
import type { RunInput, Engine, Run } from './types/run.js';

export type StreamOptions = {
  signal?: AbortSignal;
};

export type RunStream = AsyncGenerator<StreamEvent, Run | undefined, undefined>;

/**
 * Create a streaming run that yields events as they arrive.
 *
 * The API uses OpenAI-compatible SSE format:
 * - event: meta → { run_id }
 * - data: { choices: [{ delta: { content } }] }
 * - event: error → { error, details }
 * - data: [DONE]
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

  // Extract run ID from headers if available
  let runId = response.headers.get('x-run-id') || '';

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let isError = false;

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

        // Handle event type markers
        if (trimmed.startsWith('event:')) {
          const eventType = trimmed.slice(6).trim();
          isError = eventType === 'error';
          continue;
        }

        // Handle data lines
        if (trimmed.startsWith('data:')) {
          const dataContent = trimmed.slice(5).trim();

          // Stream end
          if (dataContent === '[DONE]') {
            yield { type: 'done', runId };
            continue;
          }

          try {
            const payload = JSON.parse(dataContent);

            // Meta event with run_id
            if (payload.run_id) {
              runId = payload.run_id;
              continue;
            }

            // Error event
            if (isError || payload.error) {
              yield {
                type: 'error',
                runId,
                message: payload.details || payload.error || 'Unknown error',
                code: payload.code,
              };
              isError = false;
              continue;
            }

            // OpenAI-compatible chunk with text delta
            const content = payload.choices?.[0]?.delta?.content;
            if (typeof content === 'string' && content.length > 0) {
              yield { type: 'delta', runId, content };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return runId ? { runId, status: 'succeeded' } : undefined;
}
