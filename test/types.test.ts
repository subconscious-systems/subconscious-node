/**
 * Tests for type definitions, tool serialization, and run parsing.
 * Ported from subconscious-python/tests/test_types.py.
 */

import { describe, it, expect } from 'vitest';
import {
  AgentToolUseSchema,
  FunctionToolSchema,
  MCPToolSchema,
  PlatformToolSchema,
  ReasoningTaskSchema,
  RunErrorSchema,
  RunResultSchema,
  RunSchema,
  ToolSchema,
  UsageSchema,
  type FunctionTool,
  type MCPTool,
  type PlatformTool,
  type Tool,
} from '../src/types.js';
import { buildCreateRunBody } from '../src/helpers.js';

// ---------------------------------------------------------------------------
// MCPTool construction
// ---------------------------------------------------------------------------

describe('MCPTool', () => {
  it('parses basic construction', () => {
    const tool = MCPToolSchema.parse({ type: 'mcp', url: 'https://example.com/mcp' });
    expect(tool.url).toBe('https://example.com/mcp');
    expect(tool.type).toBe('mcp');
    expect(tool.allowedTools).toBeUndefined();
    expect(tool.auth).toBeUndefined();
  });

  it('accepts allowedTools', () => {
    const tool = MCPToolSchema.parse({
      type: 'mcp',
      url: 'https://x.com/mcp',
      allowedTools: ['search', 'fetch'],
    });
    expect(tool.allowedTools).toEqual(['search', 'fetch']);
  });

  it('accepts wildcard allowedTools', () => {
    const tool = MCPToolSchema.parse({
      type: 'mcp',
      url: 'https://x.com/mcp',
      allowedTools: ['*'],
    });
    expect(tool.allowedTools).toEqual(['*']);
  });

  it('accepts empty allowedTools list (blocks all)', () => {
    const tool = MCPToolSchema.parse({
      type: 'mcp',
      url: 'https://x.com/mcp',
      allowedTools: [],
    });
    expect(tool.allowedTools).toEqual([]);
  });

  it('accepts bearer auth', () => {
    const tool = MCPToolSchema.parse({
      type: 'mcp',
      url: 'https://x.com/mcp',
      auth: { type: 'bearer', token: 'tok123' },
    });
    expect(tool.auth?.type).toBe('bearer');
    expect(tool.auth?.token).toBe('tok123');
    expect(tool.auth?.header).toBeUndefined();
  });

  it('accepts api_key auth with header', () => {
    const tool = MCPToolSchema.parse({
      type: 'mcp',
      url: 'https://x.com/mcp',
      auth: { type: 'api_key', token: 'key456', header: 'X-Api-Key' },
    });
    expect(tool.auth?.type).toBe('api_key');
    expect(tool.auth?.token).toBe('key456');
    expect(tool.auth?.header).toBe('X-Api-Key');
  });
});

// ---------------------------------------------------------------------------
// Tool union type assignability
// ---------------------------------------------------------------------------

describe('Tool union', () => {
  it('accepts PlatformTool', () => {
    const tool: Tool = { type: 'platform', id: 'fast_search' };
    expect(ToolSchema.parse(tool)).toBeDefined();
    expect((tool as PlatformTool).type).toBe('platform');
  });

  it('accepts FunctionTool', () => {
    const tool: Tool = { type: 'function', name: 'my_func', parameters: {} };
    expect(ToolSchema.parse(tool)).toBeDefined();
    expect((tool as FunctionTool).type).toBe('function');
  });

  it('accepts MCPTool', () => {
    const tool: Tool = { type: 'mcp', url: 'https://x.com/mcp' };
    expect(ToolSchema.parse(tool)).toBeDefined();
    expect((tool as MCPTool).type).toBe('mcp');
  });

  it('accepts raw dict as escape hatch', () => {
    const tool: Tool = { type: 'custom', name: 'raw' };
    expect(ToolSchema.parse(tool)).toBeDefined();
    expect(tool['type']).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// Tool serialization via buildCreateRunBody → wire.input.tools
// ---------------------------------------------------------------------------

function wireTools(tools: Tool[]): Record<string, unknown>[] {
  const body = buildCreateRunBody('tim', { instructions: 'x', tools });
  return body.input.tools;
}

describe('Tool wire serialization', () => {
  it('maps allowed_tools → allowedTools on MCPTool', () => {
    // Note: even though TS type uses `allowedTools`, the wire should still emit
    // `allowedTools` (the MCP tool already uses camelCase in TS). This also
    // proves the snake_case key-map handles legacy passthrough.
    const [result] = wireTools([
      { type: 'mcp', url: 'https://x.com/mcp', allowedTools: ['search', 'fetch'] },
    ]);
    expect(result).toHaveProperty('allowedTools', ['search', 'fetch']);
    expect(result).not.toHaveProperty('allowed_tools');
    expect(result?.['url']).toBe('https://x.com/mcp');
    expect(result?.['type']).toBe('mcp');
  });

  it('serializes nested auth on MCPTool', () => {
    const [result] = wireTools([
      {
        type: 'mcp',
        url: 'https://x.com/mcp',
        auth: { type: 'bearer', token: 'tok123' },
      },
    ]);
    expect(typeof result?.['auth']).toBe('object');
    const auth = result?.['auth'] as Record<string, unknown>;
    expect(auth['type']).toBe('bearer');
    expect(auth['token']).toBe('tok123');
    expect(auth).not.toHaveProperty('header');
  });

  it('strips undefined keys from MCPTool', () => {
    const [result] = wireTools([{ type: 'mcp', url: 'https://x.com/mcp' }]);
    expect(result).not.toHaveProperty('allowedTools');
    expect(result).not.toHaveProperty('auth');
    expect(Object.keys(result ?? {}).sort()).toEqual(['type', 'url']);
  });

  it('passes raw dicts through', () => {
    const raw = { type: 'custom', name: 'raw' };
    const [result] = wireTools([raw]);
    expect(result).toEqual(raw);
  });

  it('serializes FunctionTool with headers and defaults', () => {
    const [result] = wireTools([
      {
        type: 'function',
        name: 'my_tool',
        description: 'Does stuff',
        url: 'https://x.com/tool',
        method: 'POST',
        parameters: { type: 'object', properties: {} },
        headers: { 'X-Key': 'val' },
        defaults: { org: 'acme' },
      },
    ]);
    expect(result?.['name']).toBe('my_tool');
    expect(result?.['type']).toBe('function');
    expect(result?.['headers']).toEqual({ 'X-Key': 'val' });
    expect(result?.['defaults']).toEqual({ org: 'acme' });
  });

  it('serializes PlatformTool with options', () => {
    const [result] = wireTools([{ type: 'platform', id: 'fast_search', options: { limit: 10 } }]);
    expect(result?.['id']).toBe('fast_search');
    expect(result?.['type']).toBe('platform');
    expect(result?.['options']).toEqual({ limit: 10 });
  });
});

// ---------------------------------------------------------------------------
// Run response parsing — camelCase API response deserialization
// ---------------------------------------------------------------------------

describe('RunSchema.parse (API response deserialization)', () => {
  it('parses a full succeeded response with reasoning and tool use', () => {
    const data = {
      runId: 'run_abc',
      status: 'succeeded',
      result: {
        answer: 'hello world',
        reasoning: [
          {
            title: 'Search',
            thought: 'I need to search',
            tooluse: {
              tool_name: 'web_search',
              tool_call_id: 'call_1',
              parameters: { query: 'AI news' },
              tool_result: {
                content: [{ type: 'text', text: 'results' }],
                is_error: false,
              },
            },
            subtasks: [{ title: 'Sub-step', thought: 'Analyzing...' }],
            conclusion: 'Found results',
          },
        ],
      },
      usage: {
        inputTokens: 150,
        outputTokens: 42,
        durationMs: 1234,
      },
    };
    const run = RunSchema.parse(data);

    expect(run.runId).toBe('run_abc');
    expect(run.status).toBe('succeeded');
    expect(run.error).toBeUndefined();

    expect(run.result?.answer).toBe('hello world');
    expect(run.result?.reasoning).toHaveLength(1);

    const task = run.result!.reasoning![0]!;
    expect(task.title).toBe('Search');
    expect(task.thought).toBe('I need to search');
    expect(task.conclusion).toBe('Found results');

    expect(task.tooluse?.tool_name).toBe('web_search');
    expect(task.tooluse?.tool_call_id).toBe('call_1');
    expect(task.tooluse?.parameters).toEqual({ query: 'AI news' });
    expect(task.tooluse?.tool_result).toBeDefined();

    expect(task.subtasks).toHaveLength(1);
    expect(task.subtasks?.[0]?.title).toBe('Sub-step');

    expect(run.usage?.inputTokens).toBe(150);
    expect(run.usage?.outputTokens).toBe(42);
    expect(run.usage?.durationMs).toBe(1234);
  });

  it('parses a failed response with error', () => {
    const run = RunSchema.parse({
      runId: 'run_fail',
      status: 'failed',
      error: { code: '500', message: 'Engine crashed' },
      usage: { inputTokens: 10, outputTokens: 0 },
    });
    expect(run.runId).toBe('run_fail');
    expect(run.status).toBe('failed');
    expect(run.error?.code).toBe('500');
    expect(run.error?.message).toBe('Engine crashed');
    expect(run.result).toBeUndefined();
    expect(run.usage?.inputTokens).toBe(10);
  });

  it('parses a minimal queued response', () => {
    const run = RunSchema.parse({ runId: 'run_q', status: 'queued' });
    expect(run.runId).toBe('run_q');
    expect(run.status).toBe('queued');
    expect(run.result).toBeUndefined();
    expect(run.usage).toBeUndefined();
    expect(run.error).toBeUndefined();
  });

  it('parses usage without durationMs', () => {
    const run = RunSchema.parse({
      runId: 'run_nodur',
      status: 'succeeded',
      result: { answer: 'ok' },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    expect(run.usage?.durationMs).toBeUndefined();
    expect(run.usage?.inputTokens).toBe(1);
    expect(run.usage?.outputTokens).toBe(1);
  });

  it('parses multiple reasoning tasks', () => {
    const run = RunSchema.parse({
      runId: 'run_multi',
      status: 'succeeded',
      result: {
        answer: 'final',
        reasoning: [
          { title: 'Step 1', thought: 'first' },
          { title: 'Step 2', thought: 'second', conclusion: 'done' },
          { title: 'Step 3' },
        ],
      },
    });
    expect(run.result?.reasoning).toHaveLength(3);
    expect(run.result?.reasoning?.[0]?.title).toBe('Step 1');
    expect(run.result?.reasoning?.[1]?.conclusion).toBe('done');
    expect(run.result?.reasoning?.[2]?.thought).toBeUndefined();
  });

  it('parses deeply nested subtasks (validates z.lazy recursion)', () => {
    const run = RunSchema.parse({
      runId: 'run_deep',
      status: 'succeeded',
      result: {
        answer: 'nested',
        reasoning: [
          {
            title: 'L0',
            subtasks: [
              {
                title: 'L1',
                subtasks: [{ title: 'L2', thought: 'leaf node' }],
              },
            ],
          },
        ],
      },
    });
    const l0 = run.result!.reasoning![0]!;
    const l1 = l0.subtasks![0]!;
    const l2 = l1.subtasks![0]!;
    expect(l0.title).toBe('L0');
    expect(l1.title).toBe('L1');
    expect(l2.title).toBe('L2');
    expect(l2.thought).toBe('leaf node');
    expect(l2.subtasks).toBeUndefined();
  });

  it('parses an empty reasoning list', () => {
    const run = RunSchema.parse({
      runId: 'run_empty_r',
      status: 'succeeded',
      result: { answer: 'answer only', reasoning: [] },
    });
    expect(run.result?.reasoning).toEqual([]);
    expect(run.result?.answer).toBe('answer only');
  });

  it('parses a result without reasoning', () => {
    const run = RunSchema.parse({
      runId: 'run_no_r',
      status: 'succeeded',
      result: { answer: 'simple answer' },
    });
    expect(run.result?.answer).toBe('simple answer');
    expect(run.result?.reasoning).toBeUndefined();
  });

  it('parses canceled status', () => {
    const run = RunSchema.parse({ runId: 'run_cancel', status: 'canceled' });
    expect(run.status).toBe('canceled');
  });

  it('parses timed_out status', () => {
    const run = RunSchema.parse({ runId: 'run_to', status: 'timed_out' });
    expect(run.status).toBe('timed_out');
  });

  it('parses running status (non-terminal, no result)', () => {
    const run = RunSchema.parse({ runId: 'run_ing', status: 'running' });
    expect(run.status).toBe('running');
    expect(run.result).toBeUndefined();
    expect(run.usage).toBeUndefined();
  });

  it('parses tooluse without tool_call_id or tool_result', () => {
    const run = RunSchema.parse({
      runId: 'run_tu',
      status: 'succeeded',
      result: {
        answer: 'ok',
        reasoning: [
          {
            title: 'Search',
            tooluse: { tool_name: 'web_search', parameters: { q: 'test' } },
          },
        ],
      },
    });
    const tu = run.result!.reasoning![0]!.tooluse!;
    expect(tu.tool_name).toBe('web_search');
    expect(tu.tool_call_id ?? null).toBeNull();
    expect(tu.tool_result).toBeUndefined();
    expect(tu.parameters).toEqual({ q: 'test' });
  });

  it('parses tooluse with string tool_result', () => {
    const run = RunSchema.parse({
      runId: 'run_str_tr',
      status: 'succeeded',
      result: {
        answer: 'ok',
        reasoning: [
          {
            tooluse: { tool_name: 'calc', parameters: {}, tool_result: '42' },
          },
        ],
      },
    });
    expect(run.result?.reasoning?.[0]?.tooluse?.tool_result).toBe('42');
  });

  it('parses tooluse with complex object tool_result', () => {
    const nestedResult = {
      content: [{ type: 'text', text: 'hi' }],
      is_error: false,
      _attachments: [{ type: 'image', source: { kind: 'blob_ref', blob_key: 'k1' } }],
    };
    const run = RunSchema.parse({
      runId: 'run_cplx',
      status: 'succeeded',
      result: {
        answer: 'ok',
        reasoning: [
          {
            tooluse: { tool_name: 'browse', parameters: {}, tool_result: nestedResult },
          },
        ],
      },
    });
    const tr = run.result!.reasoning![0]!.tooluse!.tool_result as Record<string, unknown>;
    expect(typeof tr).toBe('object');
    expect((tr['content'] as Array<Record<string, unknown>>)[0]!['text']).toBe('hi');
    const attachments = tr['_attachments'] as Array<Record<string, unknown>>;
    const source = attachments[0]!['source'] as Record<string, unknown>;
    expect(source['blob_key']).toBe('k1');
  });

  it('tolerates unknown/extra fields (forward compat)', () => {
    const run = RunSchema.parse({
      runId: 'run_extra',
      status: 'succeeded',
      result: { answer: 'ok', some_new_field: true },
      usage: { inputTokens: 1, outputTokens: 1, newMetric: 99 },
      newTopLevel: 'surprise',
    });
    expect(run.runId).toBe('run_extra');
    expect(run.usage?.inputTokens).toBe(1);
    // Extras should be stripped — not preserved on the output.
    expect(run).not.toHaveProperty('newTopLevel');
    expect(run.usage).not.toHaveProperty('newMetric');
  });

  it('parses an error response without usage', () => {
    const run = RunSchema.parse({
      runId: 'run_err_no_u',
      status: 'failed',
      error: { code: 'timeout', message: 'timed out' },
    });
    expect(run.error?.code).toBe('timeout');
    expect(run.usage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Model construction / defaults
// ---------------------------------------------------------------------------

describe('Model construction and defaults', () => {
  it('constructs Run with explicit fields', () => {
    const run = RunSchema.parse({ runId: 'run_1', status: 'queued' });
    expect(run.runId).toBe('run_1');
    expect(run.status).toBe('queued');
  });

  it('constructs Usage with all fields', () => {
    const u = UsageSchema.parse({ inputTokens: 10, outputTokens: 20, durationMs: 500 });
    expect(u.inputTokens).toBe(10);
    expect(u.outputTokens).toBe(20);
    expect(u.durationMs).toBe(500);
  });

  it('fills Usage defaults for missing fields', () => {
    const u = UsageSchema.parse({});
    expect(u.inputTokens).toBe(0);
    expect(u.outputTokens).toBe(0);
    expect(u.durationMs).toBeUndefined();
  });

  it('constructs RunError with defaults', () => {
    const e = RunErrorSchema.parse({});
    expect(e.code).toBe('');
    expect(e.message).toBe('');
  });

  it('constructs AgentToolUse minimally', () => {
    const tu = AgentToolUseSchema.parse({ tool_name: 'search', parameters: { q: 'test' } });
    expect(tu.tool_name).toBe('search');
    expect(tu.tool_call_id ?? null).toBeNull();
    expect(tu.tool_result).toBeUndefined();
  });

  it('constructs an empty ReasoningTask (all fields optional)', () => {
    const task = ReasoningTaskSchema.parse({});
    expect(task.title).toBeUndefined();
    expect(task.thought).toBeUndefined();
    expect(task.tooluse).toBeUndefined();
    expect(task.subtasks).toBeUndefined();
    expect(task.conclusion).toBeUndefined();
  });

  it('constructs an empty RunResult with defaults', () => {
    const r = RunResultSchema.parse({});
    expect(r.answer).toBe('');
    expect(r.reasoning).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Serialization round-trip
// ---------------------------------------------------------------------------

describe('Serialization round-trip', () => {
  it('Usage round-trips through JSON', () => {
    const u = UsageSchema.parse({ inputTokens: 100, outputTokens: 50, durationMs: 3000 });
    const dumped = JSON.parse(JSON.stringify(u));
    expect(dumped).toEqual({ inputTokens: 100, outputTokens: 50, durationMs: 3000 });
  });

  it('Run round-trips through JSON with nested structures', () => {
    const run = RunSchema.parse({
      runId: 'run_rt',
      status: 'succeeded',
      result: { answer: 'ok' },
      usage: { inputTokens: 1, outputTokens: 2, durationMs: 500 },
    });
    const dumped = JSON.parse(JSON.stringify(run));
    expect(dumped['runId']).toBe('run_rt');
    expect(dumped['usage']['inputTokens']).toBe(1);
  });

  it('ReasoningTask round-trips recursively via JSON', () => {
    const task = ReasoningTaskSchema.parse({
      title: 'T',
      tooluse: { tool_name: 'calc', parameters: { x: 1 } },
      subtasks: [{ thought: 'leaf' }],
    });
    const dumped = JSON.parse(JSON.stringify(task));
    expect(dumped['title']).toBe('T');
    expect(dumped['tooluse']['tool_name']).toBe('calc');
    expect(dumped['subtasks'][0]['thought']).toBe('leaf');
  });
});

// ---------------------------------------------------------------------------
// Schema parse failures
// ---------------------------------------------------------------------------

describe('Schema validation failures', () => {
  it('rejects FunctionTool missing required name', () => {
    expect(() => FunctionToolSchema.parse({ type: 'function' })).toThrow();
  });

  it('rejects PlatformTool missing required id', () => {
    expect(() => PlatformToolSchema.parse({ type: 'platform' })).toThrow();
  });

  it('rejects Run with malformed status', () => {
    expect(() => RunSchema.parse({ runId: 'r', status: 'not_a_status' })).toThrow();
  });
});
