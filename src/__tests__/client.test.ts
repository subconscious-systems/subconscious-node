import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { tools } from '../builders.js';
import { Subconscious } from '../client.js';

function mockFetchJSON(handlers: Record<string, (init: RequestInit) => unknown>): typeof fetch {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (u.endsWith(pattern)) {
        const body = handler(init);
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    throw new Error(`unhandled fetch: ${u}`);
  }) as unknown as typeof fetch;
}

describe('client.run vs client.runAndWait (R18)', () => {
  it('run returns immediately with just a runId', async () => {
    const fetchMock = mockFetchJSON({
      '/runs': () => ({ runId: 'run_abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    const run = await client.run({
      engine: 'tim-claude',
      input: { instructions: 'hi' },
    });
    vi.unstubAllGlobals();

    expect(run).toEqual({ runId: 'run_abc' });
  });

  it('runAndWait polls until terminal and returns the final run', async () => {
    let pollCount = 0;
    const fetchMock = mockFetchJSON({
      '/runs': () => ({ runId: 'run_xyz' }),
      '/runs/run_xyz': () => {
        pollCount++;
        if (pollCount < 2) return { runId: 'run_xyz', status: 'running' };
        return {
          runId: 'run_xyz',
          status: 'succeeded',
          result: { answer: 'done', reasoning: null },
        };
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    const run = await client.runAndWait(
      { engine: 'tim-claude', input: { instructions: 'hi' } },
      { intervalMs: 1 },
    );
    vi.unstubAllGlobals();

    expect(run.status).toBe('succeeded');
    expect(run.result?.answer).toBe('done');
    expect(pollCount).toBeGreaterThanOrEqual(2);
  });

  it('runAndWait<T> typechecks structured answers (compile-time only)', async () => {
    type Out = { summary: string; score: number };
    const fetchMock = mockFetchJSON({
      '/runs': () => ({ runId: 'r' }),
      '/runs/r': () => ({
        runId: 'r',
        status: 'succeeded',
        result: { answer: { summary: 'ok', score: 7 }, reasoning: null },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    const run = await client.runAndWait<Out>(
      { engine: 'tim-claude', input: { instructions: 'rate this' } },
      { intervalMs: 1 },
    );
    vi.unstubAllGlobals();

    expect(run.result?.answer.summary).toBe('ok');
    expect(run.result?.answer.score).toBe(7);
  });
});

describe('client constructor — defaults (R9)', () => {
  it('merges defaultFunctionToolHeaders into the create-run body', async () => {
    let captured: any;
    const fetchMock = mockFetchJSON({
      '/runs': (init) => {
        captured = JSON.parse(String(init.body));
        return { runId: 'r' };
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({
      apiKey: 'k',
      defaultFunctionToolHeaders: { Authorization: 'Bearer xyz' },
    });
    await client.run({
      engine: 'tim-claude',
      input: {
        instructions: 'hi',
        tools: [
          tools.function({
            name: 'send',
            url: 'https://api.example.com',
            parameters: { type: 'object', properties: {}, required: [] },
          }),
        ],
      },
    });
    vi.unstubAllGlobals();

    expect(captured.input.tools[0].function.headers).toEqual({
      Authorization: 'Bearer xyz',
    });
  });
});

describe('client.run — back-compat: options.awaitCompletion (deprecated)', () => {
  it('routes through runAndWait and emits a one-shot deprecation warning', async () => {
    let pollCount = 0;
    const fetchMock = mockFetchJSON({
      '/runs': () => ({ runId: 'run_legacy' }),
      '/runs/run_legacy': () => {
        pollCount++;
        return {
          runId: 'run_legacy',
          status: 'succeeded',
          result: { answer: 'ok', reasoning: null },
        };
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const client = new Subconscious({ apiKey: 'k' });
    // The mock returns `succeeded` on the first poll so we never hit the
    // 1000ms sleep — no need to override pollOptions in the test.
    const run = await client.run({
      engine: 'tim-claude',
      input: { instructions: 'hi' },
      options: { awaitCompletion: true },
    });
    vi.unstubAllGlobals();

    expect(run.status).toBe('succeeded');
    expect(run.result?.answer).toBe('ok');
    expect(pollCount).toBeGreaterThanOrEqual(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/options\.awaitCompletion/);
    warn.mockRestore();
  });

  it('without options.awaitCompletion still fire-and-forgets', async () => {
    let polled = false;
    const fetchMock = mockFetchJSON({
      '/runs': () => ({ runId: 'r' }),
      '/runs/r': () => {
        polled = true;
        return { runId: 'r', status: 'succeeded', result: { answer: '', reasoning: null } };
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    const run = await client.run({
      engine: 'tim-claude',
      input: { instructions: 'hi' },
      options: {},
    });
    vi.unstubAllGlobals();

    expect(run).toEqual({ runId: 'r' });
    expect(polled).toBe(false);
  });
});

describe('client.run — R13 accepts Zod directly for answerFormat', () => {
  it('coerces a Zod schema before sending', async () => {
    let captured: any;
    const fetchMock = mockFetchJSON({
      '/runs': (init) => {
        captured = JSON.parse(String(init.body));
        return { runId: 'r' };
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    await client.run({
      engine: 'tim-claude',
      input: {
        instructions: 'rate',
        answerFormat: z.object({ summary: z.string(), score: z.number() }),
      },
    });
    vi.unstubAllGlobals();

    const af = captured.input.answerFormat;
    expect(af.type).toBe('object');
    expect(Object.keys(af.properties).sort()).toEqual(['score', 'summary']);
    expect(af.title).toBeTypeOf('string');
  });
});
