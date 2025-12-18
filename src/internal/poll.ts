import { request } from './http.js';
import type { Run, RunStatus } from '../types/run.js';

const TERMINAL_STATUSES: RunStatus[] = ['succeeded', 'failed', 'canceled', 'timed_out'];

export type PollOptions = {
  intervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
};

export async function pollUntilComplete(
  url: string,
  headers: Record<string, string>,
  options: PollOptions = {},
): Promise<Run> {
  const { intervalMs = 1000, maxAttempts, signal } = options;

  let attempts = 0;

  while (true) {
    if (signal?.aborted) {
      throw new Error('Polling aborted');
    }

    const run = await request<Run>(url, { headers, signal });

    if (run.status && TERMINAL_STATUSES.includes(run.status)) {
      return run;
    }

    attempts++;
    if (maxAttempts !== undefined && attempts >= maxAttempts) {
      throw new Error(`Polling exceeded max attempts (${maxAttempts})`);
    }

    await sleep(intervalMs, signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeoutId);
          reject(new Error('Sleep aborted'));
        },
        { once: true },
      );
    }
  });
}
