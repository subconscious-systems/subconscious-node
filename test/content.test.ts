/**
 * Tests for the multimodal Image helper and wire-format serialization.
 * Ported from subconscious-python/tests/test_content.py.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Image } from '../src/image.js';
import { type RunInput } from '../src/types.js';
import { buildCreateRunBody, toWireBody } from '../src/helpers.js';
import { RequestTooLargeError } from '../src/errors.js';

// 1x1 PNG magic bytes + padding
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BYTES = Buffer.concat([PNG_HEAD, Buffer.alloc(100, 0)]);

describe('Image helper', () => {
  it('detects MIME from bytes and base64-encodes', () => {
    const img = Image.fromBytes(PNG_BYTES);
    expect(img.type).toBe('image');
    expect(img.source.kind).toBe('base64');
    if (img.source.kind === 'base64') {
      expect(img.source.mime).toBe('image/png');
      const decoded = Buffer.from(img.source.data, 'base64');
      expect(decoded.equals(PNG_BYTES)).toBe(true);
    }
  });

  it('reads an image from a file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'subcon-test-'));
    try {
      const p = join(dir, 'shot.png');
      writeFileSync(p, PNG_BYTES);
      const img = Image.fromPath(p);
      expect(img.source.kind).toBe('base64');
      if (img.source.kind === 'base64') {
        expect(img.source.mime).toBe('image/png');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fromUrl with default does not fetch — emits URL source', async () => {
    const img = await Image.fromUrl('https://example.com/x.png');
    expect(img.source.kind).toBe('url');
    if (img.source.kind === 'url') {
      expect(img.source.url).toBe('https://example.com/x.png');
    }
  });

  it('fromBlobRef emits a blob_ref source', () => {
    const img = Image.fromBlobRef(
      'org/00000000-0000-0000-0000-000000000000/run/r1/screenshot/x.png',
      'image/png',
    );
    expect(img.source.kind).toBe('blob_ref');
    if (img.source.kind === 'blob_ref') {
      expect(img.source.mime).toBe('image/png');
    }
  });

  it('rejects non-image bytes', () => {
    expect(() => Image.fromBytes(Buffer.from('not an image at all'))).toThrow(
      /unsupported image type/,
    );
  });

  it('rejects disallowed MIME', () => {
    expect(() => Image.fromBytes(Buffer.from('whatever'), 'image/bmp')).toThrow(/not allowed/);
  });
});

describe('Oversize payload', () => {
  it('rejects bodies larger than 5 MB', () => {
    const huge = 'x'.repeat(6 * 1024 * 1024);
    const body = buildCreateRunBody('tim-claude', { instructions: huge });
    expect(() => toWireBody(body)).toThrow(RequestTooLargeError);
  });
});

// ---------------------------------------------------------------------------
// Wire-format serialization via buildCreateRunBody
// ---------------------------------------------------------------------------

describe('buildCreateRunBody (wire-format)', () => {
  it('builds a basic body with raw-dict tools', () => {
    const body = buildCreateRunBody('tim', {
      instructions: 'do stuff',
      tools: [{ type: 'platform', id: 'fast_search' }],
    });
    expect(body.input.instructions).toBe('do stuff');
    expect(body.input.tools).toEqual([{ type: 'platform', id: 'fast_search' }]);
    expect(body.input.answerFormat).toBeUndefined();
  });

  it('resolves a Zod schema passed as answerFormat', () => {
    const MyFormat = z.object({ answer: z.string() });
    const body = buildCreateRunBody('tim', {
      instructions: 'go',
      answerFormat: MyFormat,
    });
    expect(body.input.answerFormat).toBeDefined();
    const af = body.input.answerFormat as { properties: Record<string, unknown> };
    expect(af.properties['answer']).toBeDefined();
  });

  it('converts PlatformTool from user input to wire dict', () => {
    const input: RunInput = {
      instructions: 'hello',
      tools: [{ type: 'platform', id: 'fast_search' }],
    };
    const body = buildCreateRunBody('tim', input);
    expect(body.input.tools[0]?.['type']).toBe('platform');
    expect(body.input.tools[0]?.['id']).toBe('fast_search');
  });

  it('emits camelCase answerFormat key on the wire', () => {
    const schema = z.object({ value: z.number() });
    const body = buildCreateRunBody('tim', {
      instructions: 'test',
      answerFormat: schema,
    });
    const wire = JSON.parse(toWireBody(body));
    expect(wire.input).toHaveProperty('answerFormat');
    expect(wire.input).not.toHaveProperty('answer_format');
  });

  it('excludes absent optional fields from the wire output', () => {
    const body = buildCreateRunBody('tim', { instructions: 'minimal' });
    const wire = JSON.parse(toWireBody(body));
    expect(wire.input).not.toHaveProperty('answerFormat');
    expect(wire.input).not.toHaveProperty('content');
    expect(wire.input).toHaveProperty('instructions');
    expect(wire.input).toHaveProperty('tools');
  });

  it('serializes content blocks through the wire', () => {
    const img = Image.fromBytes(PNG_BYTES);
    const body = buildCreateRunBody('tim', {
      instructions: 'look',
      content: [img],
    });
    expect(body.input.content).toBeDefined();
    const block = body.input.content![0]!;
    expect(block['type']).toBe('image');
    const source = block['source'] as { kind: string };
    expect(source.kind).toBe('base64');
  });

  it('round-trips an engine + instructions through toWireBody', () => {
    const body = buildCreateRunBody('tim-claude', {
      instructions: 'search',
      tools: [],
    });
    const wire = JSON.parse(toWireBody(body));
    expect(wire.engine).toBe('tim-claude');
    expect(wire.input.instructions).toBe('search');
    expect(wire.input.tools).toEqual([]);
  });

  it('round-trips content blocks through toWireBody', () => {
    const img = Image.fromBytes(PNG_BYTES);
    const body = buildCreateRunBody('tim-edge', {
      instructions: 'look',
      content: [img],
    });
    const wire = JSON.parse(toWireBody(body));
    expect(wire.input.content[0].type).toBe('image');
  });
});
