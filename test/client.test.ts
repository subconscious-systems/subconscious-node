import { describe, it, expect, afterEach, vi } from 'vitest';
import { Subconscious } from '../src/client.js';

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

describe('Subconscious.run', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs { engine, input } and returns { runId } when awaitCompletion is not set', async () => {
    const { calls } = mockFetchSequence([{ body: { runId: 'r-1' } }]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.run({
      engine: 'tim',
      input: { instructions: 'hi' },
    });

    expect(run).toEqual({ runId: 'r-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/v1\/runs$/);

    const sentBody = JSON.parse(calls[0]!.init.body as string);
    expect(sentBody).toEqual({
      engine: 'tim',
      input: { instructions: 'hi', tools: [] },
    });
  });

  it('includes skills on input.skills in the POST body', async () => {
    const { calls } = mockFetchSequence([{ body: { runId: 'r-2' } }]);
    const client = new Subconscious({ apiKey: 'test-key' });

    await client.run({
      engine: 'tim',
      input: { instructions: 'hi', skills: ['web-search'] },
    });

    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent.input.skills).toEqual(['web-search']);
  });

  it('serializes server-side options and strips awaitCompletion from the wire', async () => {
    const { calls } = mockFetchSequence([
      { body: { runId: 'r-3' } },
      { body: { runId: 'r-3', status: 'succeeded', result: { answer: 'done' } } },
    ]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.run({
      engine: 'tim',
      input: { instructions: 'hi' },
      options: {
        awaitCompletion: true,
        timeout: 60,
        maxStepTokens: 1000,
        output: { callbackUrl: 'https://x.com/hook', responseContent: 'answer_only' },
      },
    });

    // Terminal polling call returned the final run
    expect(run.status).toBe('succeeded');
    expect(run.result?.answer).toBe('done');

    const firstCall = calls[0]!;
    expect(firstCall.url).toMatch(/\/v1\/runs$/);
    const sent = JSON.parse(firstCall.init.body as string);
    expect(sent).toEqual({
      engine: 'tim',
      input: { instructions: 'hi', tools: [] },
      options: { timeout: 60, max_step_tokens: 1000 },
      output: { callbackUrl: 'https://x.com/hook', responseContent: 'answer_only' },
    });
    // awaitCompletion must never appear on the wire
    expect(firstCall.init.body as string).not.toContain('awaitCompletion');
    expect(firstCall.init.body as string).not.toContain('await_completion');

    // Second call is a GET poll against /runs/:id
    expect(calls[1]!.url).toMatch(/\/v1\/runs\/r-3$/);
  });

  it('does not poll when awaitCompletion is false', async () => {
    const { calls } = mockFetchSequence([{ body: { runId: 'r-4' } }]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.run({
      engine: 'tim',
      input: { instructions: 'hi' },
      options: { awaitCompletion: false, timeout: 10 },
    });

    expect(run).toEqual({ runId: 'r-4' });
    expect(calls).toHaveLength(1); // no poll
    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent.options).toEqual({ timeout: 10 });
  });

  it('populates parsedAnswer on the awaited run when answer is JSON', async () => {
    mockFetchSequence([
      { body: { runId: 'r-5' } },
      {
        body: {
          runId: 'r-5',
          status: 'succeeded',
          result: { answer: '{"name":"ada","age":36}' },
        },
      },
    ]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.run({
      engine: 'tim',
      input: { instructions: 'hi' },
      options: { awaitCompletion: true },
    });

    expect(run.result?.answer).toBe('{"name":"ada","age":36}');
    expect(run.result?.parsedAnswer).toEqual({ name: 'ada', age: 36 });
  });

  it('leaves parsedAnswer undefined on the awaited run when answer is plain text', async () => {
    mockFetchSequence([
      { body: { runId: 'r-6' } },
      { body: { runId: 'r-6', status: 'succeeded', result: { answer: 'hello world' } } },
    ]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.run({
      engine: 'tim',
      input: { instructions: 'hi' },
      options: { awaitCompletion: true },
    });

    expect(run.result?.answer).toBe('hello world');
    expect(run.result?.parsedAnswer).toBeUndefined();
  });
});

describe('Subconscious.get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('populates parsedAnswer when the response answer is JSON', async () => {
    mockFetchSequence([
      {
        body: {
          runId: 'r-g',
          status: 'succeeded',
          result: { answer: '[1,2,3]' },
        },
      },
    ]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.get('r-g');
    expect(run.result?.parsedAnswer).toEqual([1, 2, 3]);
  });

  it('leaves parsedAnswer undefined when the response answer is not JSON', async () => {
    mockFetchSequence([
      {
        body: {
          runId: 'r-g2',
          status: 'succeeded',
          result: { answer: 'free text' },
        },
      },
    ]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.get('r-g2');
    expect(run.result?.parsedAnswer).toBeUndefined();
  });
});

describe('Subconscious.cancel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('augments the cancel response with parsedAnswer when present', async () => {
    mockFetchSequence([
      {
        body: {
          runId: 'r-c',
          status: 'canceled',
          result: { answer: '{"partial":true}' },
        },
      },
    ]);
    const client = new Subconscious({ apiKey: 'test-key' });

    const run = await client.cancel('r-c');
    expect(run.status).toBe('canceled');
    expect(run.result?.parsedAnswer).toEqual({ partial: true });
  });
});
