import { describe, it, expect, afterEach, vi } from 'vitest';
import { Subconscious } from '../src/client.js';
import { pollUntilComplete } from '../src/internal/poll.js';

type FetchCall = { url: string; init: RequestInit };

function mockFetchSequence(responses: Array<{ body: unknown; status?: number }>) {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { calls, fetchMock };
}

describe('polling via client.wait()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('polls through non-terminal states until a terminal status is returned', async () => {
    const { calls } = mockFetchSequence([
      { body: { runId: 'r-1', status: 'queued' } },
      { body: { runId: 'r-1', status: 'running' } },
      { body: { runId: 'r-1', status: 'running' } },
      { body: { runId: 'r-1', status: 'succeeded', result: { answer: 'done' } } },
    ]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.wait('r-1', { intervalMs: 0 });

    expect(run.status).toBe('succeeded');
    expect(run.result?.answer).toBe('done');
    expect(calls).toHaveLength(4);
    for (const c of calls) expect(c.url).toMatch(/\/v1\/runs\/r-1$/);
  });

  it('returns (does not throw) when terminal status is "failed"', async () => {
    mockFetchSequence([
      {
        body: {
          runId: 'r-2',
          status: 'failed',
          error: { code: 'engine_error', message: 'boom' },
        },
      },
    ]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.wait('r-2', { intervalMs: 0 });
    expect(run.status).toBe('failed');
    expect(run.error?.code).toBe('engine_error');
  });

  it.each(['succeeded', 'failed', 'canceled', 'timed_out'] as const)(
    'treats "%s" as terminal and returns the run',
    async (terminalStatus) => {
      mockFetchSequence([{ body: { runId: 'r-t', status: terminalStatus } }]);
      const client = new Subconscious({ apiKey: 'test-key' });
      const run = await client.wait('r-t', { intervalMs: 0 });
      expect(run.status).toBe(terminalStatus);
    },
  );

  it('throws when maxAttempts is exhausted without reaching a terminal state', async () => {
    mockFetchSequence([
      { body: { runId: 'r-3', status: 'running' } },
      { body: { runId: 'r-3', status: 'running' } },
      { body: { runId: 'r-3', status: 'running' } },
      { body: { runId: 'r-3', status: 'running' } },
    ]);
    const client = new Subconscious({ apiKey: 'test-key' });

    await expect(client.wait('r-3', { intervalMs: 0, maxAttempts: 3 })).rejects.toThrow(
      /exceeded max attempts/,
    );
  });

  it('honors AbortSignal passed through options', async () => {
    mockFetchSequence([{ body: { runId: 'r-4', status: 'running' } }]);
    const client = new Subconscious({ apiKey: 'test-key' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.wait('r-4', { intervalMs: 1000, signal: controller.signal }),
    ).rejects.toThrow(/aborted/i);
  });
});

describe('pollUntilComplete (direct)', () => {
  it('returns immediately when the first response is already terminal', async () => {
    const { calls } = mockFetchSequence([{ body: { runId: 'r-5', status: 'succeeded' } }]);
    const run = await pollUntilComplete('http://localhost/runs/r-5', {}, { intervalMs: 0 });
    expect(run.status).toBe('succeeded');
    expect(calls).toHaveLength(1);
  });

  it('does not sleep after the terminal response (no extra poll)', async () => {
    const { calls } = mockFetchSequence([
      { body: { runId: 'r-6', status: 'running' } },
      { body: { runId: 'r-6', status: 'succeeded' } },
    ]);
    await pollUntilComplete('http://localhost/runs/r-6', {}, { intervalMs: 0 });
    // Exactly 2 GETs — no extra poll after terminal.
    expect(calls).toHaveLength(2);
  });
});

describe('client.run({ awaitCompletion: true }) end-to-end polling', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('POSTs then polls through queued/running to a terminal response', async () => {
    // Use fake timers so the default 1000ms interval doesn't stall the test.
    vi.useFakeTimers();

    const { calls } = mockFetchSequence([
      { body: { runId: 'r-7' } }, // POST response
      { body: { runId: 'r-7', status: 'queued' } }, // poll #1
      { body: { runId: 'r-7', status: 'running' } }, // poll #2
      { body: { runId: 'r-7', status: 'succeeded', result: { answer: '42' } } }, // poll #3
    ]);

    const client = new Subconscious({ apiKey: 'test-key' });
    const runPromise = client.run({
      engine: 'tim',
      input: { instructions: 'hi' },
      options: { awaitCompletion: true },
    });

    // Advance past each 1000ms sleep between polls.
    await vi.advanceTimersByTimeAsync(3500);

    const run = await runPromise;
    expect(run.status).toBe('succeeded');
    expect(run.result?.answer).toBe('42');

    // 1 POST + 3 polls = 4 calls
    expect(calls).toHaveLength(4);
    expect(calls[0]!.url).toMatch(/\/v1\/runs$/);
    for (const c of calls.slice(1)) expect(c.url).toMatch(/\/v1\/runs\/r-7$/);
  });
});
