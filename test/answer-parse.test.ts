/**
 * Unit tests for the client-side `parseAnswer` / `augmentRun` helpers that
 * decode the API's `answer` string back into a native JavaScript value.
 *
 * The API contract is `answer: string` in all cases — when the caller
 * supplied an `answerFormat`, the string is JSON-encoded. These helpers do a
 * best-effort `JSON.parse` and attach the result as `parsedAnswer`.
 */

import { describe, it, expect } from 'vitest';
import { parseAnswer, augmentRun } from '../src/helpers.js';
import { type Run } from '../src/types.js';

describe('parseAnswer', () => {
  it('returns the parsed object for a JSON object string', () => {
    expect(parseAnswer('{"name":"ada","age":36}')).toEqual({ name: 'ada', age: 36 });
  });

  it('returns the parsed array for a JSON array string', () => {
    expect(parseAnswer('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns the parsed primitive for a JSON number', () => {
    expect(parseAnswer('42')).toBe(42);
  });

  it('returns the parsed primitive for a JSON boolean', () => {
    expect(parseAnswer('true')).toBe(true);
  });

  it('returns null for a JSON null', () => {
    expect(parseAnswer('null')).toBeNull();
  });

  it('returns the parsed string for a JSON-encoded string', () => {
    expect(parseAnswer('"hello"')).toBe('hello');
  });

  it('returns undefined for a natural-language string', () => {
    expect(parseAnswer('hello world')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(parseAnswer('')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(parseAnswer(undefined)).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    expect(parseAnswer('{"name":')).toBeUndefined();
  });

  it('handles nested objects', () => {
    const input = '{"outer":{"inner":[1,2,{"deep":true}]}}';
    expect(parseAnswer(input)).toEqual({ outer: { inner: [1, 2, { deep: true }] } });
  });
});

describe('augmentRun', () => {
  it('populates result.parsedAnswer when answer is a JSON object string', () => {
    const run: Run = {
      runId: 'r-1',
      status: 'succeeded',
      result: { answer: '{"score":9}' },
    };
    const out = augmentRun(run);
    expect(out.result?.parsedAnswer).toEqual({ score: 9 });
  });

  it('leaves parsedAnswer undefined when answer is a natural-language string', () => {
    const run: Run = {
      runId: 'r-2',
      status: 'succeeded',
      result: { answer: 'The capital of France is Paris.' },
    };
    const out = augmentRun(run);
    expect(out.result?.parsedAnswer).toBeUndefined();
  });

  it('leaves result alone when there is no result', () => {
    const run: Run = { runId: 'r-3' };
    const out = augmentRun(run);
    expect(out).toEqual({ runId: 'r-3' });
  });

  it('leaves result alone when answer is empty', () => {
    const run: Run = {
      runId: 'r-4',
      status: 'succeeded',
      result: { answer: '' },
    };
    const out = augmentRun(run);
    expect(out.result?.parsedAnswer).toBeUndefined();
  });

  it('does not mutate the input run', () => {
    const run: Run = {
      runId: 'r-5',
      status: 'succeeded',
      result: { answer: '{"x":1}' },
    };
    augmentRun(run);
    expect(run.result).toEqual({ answer: '{"x":1}' });
    expect((run.result as { parsedAnswer?: unknown }).parsedAnswer).toBeUndefined();
  });

  it('preserves other result fields', () => {
    const run: Run = {
      runId: 'r-6',
      status: 'succeeded',
      result: {
        answer: '{"ok":true}',
        reasoning: [{ title: 'step', thought: 'thinking' }],
      },
    };
    const out = augmentRun(run);
    expect(out.result?.reasoning).toEqual([{ title: 'step', thought: 'thinking' }]);
    expect(out.result?.parsedAnswer).toEqual({ ok: true });
  });
});
