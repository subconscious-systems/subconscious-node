import { describe, expect, it, vi } from 'vitest';
import { Subconscious } from '../client.js';
import type { StreamEvent } from '../types/events.js';

/**
 * Build a fake `fetch` returning a chunked SSE stream of `frames`. Each
 * frame is a string already terminated with `\n\n`.
 */
function mockFetchSSE(frames: string[], headerRunId?: string): typeof fetch {
  return vi.fn(async (_url, _init) => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        for (const f of frames) {
          controller.enqueue(encoder.encode(f));
        }
        controller.close();
      },
    });
    const headers = new Headers({ 'content-type': 'text/event-stream' });
    if (headerRunId) headers.set('x-run-id', headerRunId);
    return new Response(body, { status: 200, headers });
  }) as unknown as typeof fetch;
}

async function collect<T>(stream: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const ev of stream) out.push(ev);
  return out;
}

describe('client.stream — Stream Events v2 (R8, R15)', () => {
  it('emits StartedEvent first using the x-run-id header before any server frame', async () => {
    // Canonical wire shape uses camelCase `runId` (matches REST responses).
    const fetchMock = mockFetchSSE(
      [
        'event: meta\ndata: {"runId":"run_abc"}\n\n',
        'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
        'event: result\ndata: {"result":{"answer":"hi","reasoning":null}}\n\n',
        'data: [DONE]\n\n',
      ],
      'run_abc',
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    const events = (await collect(
      client.stream({
        engine: 'tim-claude',
        input: { instructions: 'hi' },
      }),
    )) as StreamEvent[];

    vi.unstubAllGlobals();

    expect(events[0]).toEqual({ type: 'started', runId: 'run_abc' });
    expect(events.at(-1)).toEqual({ type: 'done', runId: 'run_abc' });
    const types = events.map((e) => e.type);
    expect(types).toContain('delta');
    expect(types).toContain('result');
  });

  it('parses event: result with usage', async () => {
    const fetchMock = mockFetchSSE(
      [
        'event: started\ndata: {"run_id":"r1"}\n\n',
        'event: result\ndata: {"result":{"answer":"42","reasoning":null},"usage":{"inputTokens":1,"outputTokens":2}}\n\n',
        'data: [DONE]\n\n',
      ],
      'r1',
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    const events = (await collect(
      client.stream<string>({
        engine: 'tim-claude',
        input: { instructions: 'hi' },
      }),
    )) as StreamEvent<string>[];
    vi.unstubAllGlobals();

    const result = events.find((e) => e.type === 'result');
    expect(result).toBeDefined();
    if (result?.type !== 'result') throw new Error('unreachable');
    expect(result.result.answer).toBe('42');
    expect(result.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
  });

  it('parses event: tool_call into ToolCallEvent', async () => {
    const fetchMock = mockFetchSSE(
      [
        'event: started\ndata: {"run_id":"r1"}\n\n',
        'event: tool_call\ndata: {"call":{"tool_name":"web_search","parameters":{"q":"x"},"tool_result":{"docs":[]}}}\n\n',
        'event: result\ndata: {"result":{"answer":"done","reasoning":null}}\n\n',
        'data: [DONE]\n\n',
      ],
      'r1',
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    const events = (await collect(
      client.stream({ engine: 'tim-claude', input: { instructions: 'hi' } }),
    )) as StreamEvent[];
    vi.unstubAllGlobals();

    const toolCall = events.find((e) => e.type === 'tool_call');
    if (toolCall?.type !== 'tool_call') throw new Error('expected tool_call');
    expect(toolCall.call.tool_name).toBe('web_search');
  });

  it('back-compat: legacy run_id (snake_case) on the wire still parses', async () => {
    // Older API builds emitted snake_case `run_id`. SDKs MUST keep
    // accepting the legacy shape for at least one minor release.
    const fetchMock = mockFetchSSE(
      [
        'event: started\ndata: {"run_id":"r_legacy"}\n\n',
        'event: result\ndata: {"result":{"answer":"ok","reasoning":null}}\n\n',
        'data: [DONE]\n\n',
      ],
      'r_legacy',
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new Subconscious({ apiKey: 'k' });
    const events = (await collect(
      client.stream({ engine: 'tim-claude', input: { instructions: 'hi' } }),
    )) as StreamEvent[];
    vi.unstubAllGlobals();

    expect(events[0]).toEqual({ type: 'started', runId: 'r_legacy' });
  });

  it('parses event: error with code "canceled" (one l)', async () => {
    const fetchMock = mockFetchSSE(
      [
        'event: started\ndata: {"runId":"r1"}\n\n',
        'event: error\ndata: {"code":"canceled","message":"The run was canceled"}\n\n',
        'data: [DONE]\n\n',
      ],
      'r1',
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new Subconscious({ apiKey: 'k' });
    const events = (await collect(
      client.stream({ engine: 'tim-claude', input: { instructions: 'hi' } }),
    )) as StreamEvent[];
    vi.unstubAllGlobals();

    const err = events.find((e) => e.type === 'error');
    if (err?.type !== 'error') throw new Error('expected error');
    expect(err.code).toBe('canceled');
  });

  it('parses event: error with required code (R5)', async () => {
    const fetchMock = mockFetchSSE(
      [
        'event: started\ndata: {"run_id":"r1"}\n\n',
        'event: error\ndata: {"code":"rate_limited","message":"slow down","details":{"retryAfterMs":1000}}\n\n',
        'data: [DONE]\n\n',
      ],
      'r1',
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    const events = (await collect(
      client.stream({ engine: 'tim-claude', input: { instructions: 'hi' } }),
    )) as StreamEvent[];
    vi.unstubAllGlobals();

    const err = events.find((e) => e.type === 'error');
    if (err?.type !== 'error') throw new Error('expected error');
    expect(err.code).toBe('rate_limited');
    expect(err.message).toBe('slow down');
    expect(err.details).toEqual({ retryAfterMs: 1000 });
  });
});

describe('client.observe (R16)', () => {
  it('reads from /v1/runs/:runId/stream and parses events', async () => {
    const fetchMock = mockFetchSSE([
      'event: started\ndata: {"run_id":"r_obs"}\n\n',
      'data: {"choices":[{"delta":{"content":"replay"}}]}\n\n',
      'event: result\ndata: {"result":{"answer":"replay","reasoning":null}}\n\n',
      'data: [DONE]\n\n',
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const client = new Subconscious({ apiKey: 'k' });
    const events = (await collect(client.observe('r_obs'))) as StreamEvent[];
    vi.unstubAllGlobals();

    expect(events[0]).toEqual({ type: 'started', runId: 'r_obs' });
    expect(events.some((e) => e.type === 'delta' && e.content === 'replay')).toBe(true);
  });
});
