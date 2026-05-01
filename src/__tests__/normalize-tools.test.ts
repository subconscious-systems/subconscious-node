import { describe, expect, it } from 'vitest';
import { tools } from '../builders.js';
import { normalizeTools } from '../internal/normalize-tools.js';

describe('normalizeTools — R12 auto-promote defaults to properties', () => {
  it('adds defaults-only keys to parameters.properties so the engine can dispatch them', () => {
    const input = [
      tools.function({
        name: 'sendEmail',
        url: 'https://api.example.com/email',
        parameters: {
          type: 'object',
          properties: { to: { type: 'string' } },
          required: ['to'],
        },
        defaults: { sender_id: 'svc_abc' },
      }),
    ];
    const out = normalizeTools(input, {})!;
    const params = (out[0] as any).function.parameters;
    expect(params.properties.sender_id).toEqual({ type: 'string' });
    expect(params.properties.to).toEqual({ type: 'string' });
  });

  it('does not overwrite an explicit property if the user already declared it', () => {
    const input = [
      tools.function({
        name: 'sendEmail',
        url: 'https://api.example.com/email',
        parameters: {
          type: 'object',
          properties: {
            sender_id: { type: 'string', description: 'explicit' },
          },
          required: [],
        },
        defaults: { sender_id: 'svc_abc' },
      }),
    ];
    const out = normalizeTools(input, {})!;
    expect((out[0] as any).function.parameters.properties.sender_id).toEqual({
      type: 'string',
      description: 'explicit',
    });
  });

  it('infers reasonable shapes for non-string defaults', () => {
    const input = [
      tools.function({
        name: 'createTicket',
        url: 'https://api.example.com/tickets',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        defaults: { priority: 3, urgent: true, tags: ['ops'], extra: { foo: 1 } },
      }),
    ];
    const out = normalizeTools(input, {})!;
    const props = (out[0] as any).function.parameters.properties;
    expect(props.priority).toEqual({ type: 'number' });
    expect(props.urgent).toEqual({ type: 'boolean' });
    expect(props.tags).toEqual({ type: 'array', items: { type: 'string' } });
    expect(props.extra).toEqual({ type: 'object' });
  });
});

describe('normalizeTools — R9 client-level overlays', () => {
  it('merges defaultFunctionToolHeaders into every function tool', () => {
    const input = [
      tools.function({
        name: 'sendEmail',
        url: 'https://api.example.com/email',
        parameters: { type: 'object', properties: {}, required: [] },
      }),
    ];
    const out = normalizeTools(input, {
      defaultFunctionToolHeaders: { 'X-Tenant': 'acme' },
    })!;
    expect((out[0] as any).function.headers).toEqual({ 'X-Tenant': 'acme' });
  });

  it('per-tool headers win on key conflict', () => {
    const input = [
      tools.function({
        name: 'sendEmail',
        url: 'https://api.example.com/email',
        parameters: { type: 'object', properties: {}, required: [] },
        headers: { 'X-Tenant': 'beta' },
      }),
    ];
    const out = normalizeTools(input, {
      defaultFunctionToolHeaders: { 'X-Tenant': 'acme', 'X-Trace': 't1' },
    })!;
    expect((out[0] as any).function.headers).toEqual({
      'X-Tenant': 'beta',
      'X-Trace': 't1',
    });
  });

  it('merges defaultFunctionToolDefaults and promotes the lifted keys to properties', () => {
    const input = [
      tools.function({
        name: 'sendEmail',
        url: 'https://api.example.com/email',
        parameters: { type: 'object', properties: {}, required: [] },
      }),
    ];
    const out = normalizeTools(input, {
      defaultFunctionToolDefaults: { tenant_id: 't_xyz' },
    })!;
    expect((out[0] as any).function.defaults).toEqual({ tenant_id: 't_xyz' });
    expect((out[0] as any).function.parameters.properties.tenant_id).toEqual({
      type: 'string',
    });
  });

  it('leaves non-function tools untouched', () => {
    const input = [tools.platform('parallel_search'), tools.resource('sandbox')];
    expect(
      normalizeTools(input, { defaultFunctionToolHeaders: { 'X-Tenant': 'acme' } }),
    ).toEqual(input);
  });
});
