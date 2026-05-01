import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { tools } from '../builders.js';

describe('tools.platform (R11)', () => {
  it('builds a minimal platform tool', () => {
    expect(tools.platform('parallel_search')).toEqual({
      type: 'platform',
      id: 'parallel_search',
    });
  });

  it('passes options when provided', () => {
    expect(tools.platform('parallel_search', { region: 'us' })).toEqual({
      type: 'platform',
      id: 'parallel_search',
      options: { region: 'us' },
    });
  });
});

describe('tools.function (R11, R12, R13)', () => {
  it('accepts a Zod schema for parameters and converts to JSON Schema', () => {
    const tool = tools.function({
      name: 'sendEmail',
      url: 'https://api.example.com/email',
      parameters: z.object({
        to: z.string(),
        body: z.string(),
      }),
    });
    expect(tool.type).toBe('function');
    expect(tool.function.name).toBe('sendEmail');
    expect(tool.function.url).toBe('https://api.example.com/email');
    const params = tool.function.parameters as {
      type: string;
      properties: Record<string, unknown>;
    };
    expect(params.type).toBe('object');
    expect(Object.keys(params.properties).sort()).toEqual(['body', 'to']);
  });

  it('accepts a raw JSON Schema verbatim', () => {
    const tool = tools.function({
      name: 'lookup',
      url: 'https://api.example.com/lookup',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    });
    expect((tool.function.parameters as any).properties.id).toEqual({ type: 'string' });
  });

  it('preserves headers and defaults so normalize-tools can promote them', () => {
    const tool = tools.function({
      name: 'sendEmail',
      url: 'https://api.example.com/email',
      parameters: z.object({ body: z.string() }),
      headers: { Authorization: 'Bearer xyz' },
      defaults: { sender_id: 'svc_abc' },
    });
    expect(tool.function.headers).toEqual({ Authorization: 'Bearer xyz' });
    expect(tool.function.defaults).toEqual({ sender_id: 'svc_abc' });
  });
});

describe('tools.mcp (R7)', () => {
  it('passes headers through', () => {
    const tool = tools.mcp({
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer xyz' },
    });
    expect(tool).toEqual({
      type: 'mcp',
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer xyz' },
    });
  });

  it('supports the structured auth shape', () => {
    expect(
      tools.mcp({
        url: 'https://mcp.example.com',
        auth: { type: 'bearer', token: 'xyz' },
      }),
    ).toEqual({
      type: 'mcp',
      url: 'https://mcp.example.com',
      auth: { type: 'bearer', token: 'xyz' },
    });
  });
});

describe('tools.resource (R17)', () => {
  it.each(['sandbox', 'memory', 'browser'] as const)('builds %s tool', (id) => {
    expect(tools.resource(id)).toEqual({ type: 'resource', id });
  });
});
