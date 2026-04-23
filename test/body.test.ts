import { describe, it, expect } from 'vitest';
import { buildRunBody } from '../src/internal/body.js';
import type { RunInput, RunOptions } from '../src/types/run.js';

const baseInput: RunInput = {
  instructions: 'do the thing',
};

function parseBody(engine: string, input: RunInput, options?: RunOptions) {
  return JSON.parse(buildRunBody(engine, input, options));
}

describe('buildRunBody', () => {
  it('emits minimal { engine, input } when no options are provided', () => {
    const body = parseBody('tim', baseInput);
    expect(body).toEqual({ engine: 'tim', input: { instructions: 'do the thing' } });
    expect(body).not.toHaveProperty('options');
    expect(body).not.toHaveProperty('output');
  });

  it('round-trips skills on input', () => {
    const body = parseBody('tim', { ...baseInput, skills: ['web-search', 'python'] });
    expect(body.input.skills).toEqual(['web-search', 'python']);
  });

  it('serializes server-side options with snake_case wire keys', () => {
    const body = parseBody('tim', baseInput, { timeout: 120, maxStepTokens: 1000 });
    expect(body.options).toEqual({ timeout: 120, max_step_tokens: 1000 });
  });

  it('serializes the output block with camelCase wire keys (matches server Zod schema)', () => {
    const body = parseBody('tim', baseInput, {
      output: { callbackUrl: 'https://example.com/hook', responseContent: 'answer_only' },
    });
    expect(body.output).toEqual({
      callbackUrl: 'https://example.com/hook',
      responseContent: 'answer_only',
    });
  });

  it('strips awaitCompletion from the wire body (client-side only)', () => {
    const body = parseBody('tim', baseInput, { awaitCompletion: true });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('awaitCompletion');
    expect(serialized).not.toContain('await_completion');
    expect(body).not.toHaveProperty('options');
  });

  it('omits the options block when only awaitCompletion is set', () => {
    const body = parseBody('tim', baseInput, { awaitCompletion: false });
    expect(body).not.toHaveProperty('options');
    expect(body).not.toHaveProperty('output');
  });

  it('omits the options block when awaitCompletion is true but no server options are set', () => {
    const body = parseBody('tim', baseInput, { awaitCompletion: true });
    expect(body).not.toHaveProperty('options');
  });

  it('carries options and output together when both are set', () => {
    const body = parseBody('tim', baseInput, {
      awaitCompletion: true,
      timeout: 60,
      maxStepTokens: 500,
      output: { responseContent: 'full' },
    });
    expect(body.options).toEqual({ timeout: 60, max_step_tokens: 500 });
    expect(body.output).toEqual({ responseContent: 'full' });
  });

  it('preserves input.skills alongside server options', () => {
    const body = parseBody(
      'tim',
      { ...baseInput, skills: ['s1'] },
      { timeout: 30, output: { callbackUrl: 'https://x.com' } },
    );
    expect(body.input.skills).toEqual(['s1']);
    expect(body.options).toEqual({ timeout: 30 });
    expect(body.output).toEqual({ callbackUrl: 'https://x.com' });
  });
});
