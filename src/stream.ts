import { requestStream } from "./internal/http.js";
import { parseSSEStream } from "./internal/sse.js";
import type { StreamEvent } from "./types/events.js";
import type { RunInput, Engine, Run } from "./types/run.js";

export type StreamOptions = {
  signal?: AbortSignal;
};

export type RunStream = AsyncGenerator<StreamEvent, Run, undefined>;

/**
 * Create a streaming run that yields events as they arrive.
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
  const response = await requestStream(`${baseUrl}/runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      engine: params.engine,
      input: params.input,
      stream: true,
    }),
    signal: options.signal,
  });

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  let finalRun: Run | undefined;

  try {
    for await (const event of parseSSEStream(reader)) {
      yield event;

      if (event.type === "run.completed") {
        finalRun = {
          runId: event.runId,
          status: "succeeded",
          result: event.result,
          usage: event.usage,
        };
      } else if (event.type === "run.failed") {
        finalRun = {
          runId: event.runId,
          status: "failed",
        };
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!finalRun) {
    throw new Error("Stream ended without completion event");
  }

  return finalRun;
}

