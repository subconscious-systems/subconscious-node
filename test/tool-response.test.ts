/**
 * Tests for the ToolResponse envelope + ToolResponseBuilder.
 * Ported from subconscious-python/tests/test_tool_response.py.
 */

import { describe, it, expect } from 'vitest';
import { Image } from '../src/image.js';
import { ToolResponseBuilder } from '../src/helpers.js';
import {
  AudioContentSchema,
  FileContentSchema,
  ToolResponseSchema,
  type AudioContent,
  type FileContent,
  type ImageContent,
  type TextContent,
} from '../src/types.js';

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 0),
]);

// ---------------------------------------------------------------------------
// ToolResponseBuilder.build()
// ---------------------------------------------------------------------------

describe('ToolResponseBuilder.build', () => {
  it('builds from a string', () => {
    const resp = ToolResponseBuilder.build('tc_1', 'done');
    expect(resp).toEqual({
      tool_call_id: 'tc_1',
      content: [{ type: 'text', text: 'done' }],
      is_error: false,
    });
  });

  it('builds from an image', () => {
    const resp = ToolResponseBuilder.build('tc_1', Image.fromBytes(PNG_BYTES));
    expect(resp.content).toHaveLength(1);
    const block = resp.content[0] as ImageContent;
    expect(block.type).toBe('image');
    expect(block.source.kind).toBe('base64');
    if (block.source.kind === 'base64') {
      expect(block.source.mime).toBe('image/png');
    }
  });

  it('builds from a mixed list', () => {
    const resp = ToolResponseBuilder.build('tc_1', ['here:', Image.fromBytes(PNG_BYTES)]);
    expect(resp.content).toHaveLength(2);
    expect((resp.content[0] as TextContent).type).toBe('text');
    expect((resp.content[0] as TextContent).text).toBe('here:');
    expect((resp.content[1] as ImageContent).type).toBe('image');
  });

  it('preserves isError flag', () => {
    const resp = ToolResponseBuilder.build('tc_err', 'rate limited', { isError: true });
    expect(resp.is_error).toBe(true);
  });

  it('round-trips through the schema from a strict-shaped object', () => {
    const resp = ToolResponseSchema.parse({
      tool_call_id: 'tc_1',
      content: [{ type: 'text', text: 'hi' }, Image.fromBytes(PNG_BYTES)],
    });
    expect(resp.content[0]).toEqual({ type: 'text', text: 'hi' });
  });
});

// ---------------------------------------------------------------------------
// Canonical wire-shape contract
// ---------------------------------------------------------------------------

describe('ToolResponse wire shape', () => {
  it('text-only shape is exactly {tool_call_id, content, is_error}', () => {
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', 'ok')));
    expect(Object.keys(dumped).sort()).toEqual(['content', 'is_error', 'tool_call_id']);
    expect(dumped.content).toEqual([{ type: 'text', text: 'ok' }]);
  });

  it('image base64 source has exactly {kind, data, mime}', () => {
    const dumped = JSON.parse(
      JSON.stringify(ToolResponseBuilder.build('tc_1', Image.fromBytes(PNG_BYTES))),
    );
    const source = dumped.content[0].source;
    expect(Object.keys(source).sort()).toEqual(['data', 'kind', 'mime']);
    expect(source.kind).toBe('base64');
    expect(source.mime).toBe('image/png');
    expect(typeof source.data).toBe('string');
    expect(source.data.length).toBeGreaterThan(0);
  });

  it('image url source is {kind, url}', async () => {
    const img = await Image.fromUrl('https://example.com/x.png');
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', img)));
    const source = dumped.content[0].source;
    expect(source.kind).toBe('url');
    expect(source.url).toBe('https://example.com/x.png');
  });

  it('image blob_ref source excludes optional fields when unset', () => {
    const img = Image.fromBlobRef(
      'org/00000000-0000-0000-0000-000000000000/run/r/x.png',
      'image/png',
    );
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', img)));
    const source = dumped.content[0].source;
    expect(source.kind).toBe('blob_ref');
    expect(source.blob_key.startsWith('org/')).toBe(true);
    expect(source.mime).toBe('image/png');
    expect(source).not.toHaveProperty('attachment_id');
    expect(source).not.toHaveProperty('size_bytes');
  });
});

// ---------------------------------------------------------------------------
// Optional tool_call_id
// ---------------------------------------------------------------------------

describe('ToolResponse tool_call_id handling', () => {
  it('is optional in the schema', () => {
    const resp = ToolResponseSchema.parse({
      content: [{ type: 'text', text: 'hi' }],
    });
    expect(resp.tool_call_id ?? null).toBeNull();
  });

  it('build(null, ...) sets tool_call_id to null', () => {
    const resp = ToolResponseBuilder.build(null, 'done');
    expect(resp.tool_call_id).toBeNull();
    expect(resp.content).toEqual([{ type: 'text', text: 'done' }]);
  });

  it('build(id, ...) sets tool_call_id', () => {
    const resp = ToolResponseBuilder.build('call_abc', 'done');
    expect(resp.tool_call_id).toBe('call_abc');
  });
});

// ---------------------------------------------------------------------------
// AudioContent paths
// ---------------------------------------------------------------------------

describe('AudioContent', () => {
  it('wraps into ToolResponseBuilder.build', () => {
    const audio: AudioContent = {
      type: 'audio',
      source: { kind: 'base64', data: 'AAAA', mime: 'audio/wav' },
    };
    const resp = ToolResponseBuilder.build('tc_1', audio);
    expect(resp.content).toHaveLength(1);
    expect((resp.content[0] as AudioContent).type).toBe('audio');
  });

  it('base64 source wire shape', () => {
    const audio: AudioContent = {
      type: 'audio',
      source: { kind: 'base64', data: 'AAAA', mime: 'audio/mp3' },
    };
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', audio)));
    const block = dumped.content[0];
    expect(block.type).toBe('audio');
    expect(block.source).toEqual({ kind: 'base64', data: 'AAAA', mime: 'audio/mp3' });
  });

  it('url source wire shape', () => {
    const audio: AudioContent = {
      type: 'audio',
      source: { kind: 'url', url: 'https://example.com/clip.wav', mime: 'audio/wav' },
    };
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', audio)));
    const source = dumped.content[0].source;
    expect(source.kind).toBe('url');
    expect(source.url).toBe('https://example.com/clip.wav');
    expect(source.mime).toBe('audio/wav');
  });

  it('blob_ref source strips optional fields when absent', () => {
    const audio: AudioContent = {
      type: 'audio',
      source: { kind: 'blob_ref', blob_key: 'org/run/r1/clip.mp3', mime: 'audio/mp3' },
    };
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', audio)));
    const source = dumped.content[0].source;
    expect(source.kind).toBe('blob_ref');
    expect(source.blob_key).toBe('org/run/r1/clip.mp3');
    expect(source.mime).toBe('audio/mp3');
    expect(source).not.toHaveProperty('size_bytes');
    expect(source).not.toHaveProperty('attachment_id');
  });

  it('blob_ref source preserves metadata when set', () => {
    const audio: AudioContent = {
      type: 'audio',
      source: {
        kind: 'blob_ref',
        blob_key: 'org/run/r1/clip.mp3',
        mime: 'audio/mp3',
        size_bytes: 4096,
        attachment_id: 'att_xyz',
      },
    };
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', audio)));
    const source = dumped.content[0].source;
    expect(source.size_bytes).toBe(4096);
    expect(source.attachment_id).toBe('att_xyz');
  });
});

// ---------------------------------------------------------------------------
// FileContent paths
// ---------------------------------------------------------------------------

describe('FileContent', () => {
  it('wraps into ToolResponseBuilder.build', () => {
    const file: FileContent = {
      type: 'file',
      source: { kind: 'base64', data: 'AAAA', mime: 'application/pdf' },
      filename: 'report.pdf',
    };
    const resp = ToolResponseBuilder.build('tc_1', file);
    expect(resp.content).toHaveLength(1);
    expect((resp.content[0] as FileContent).type).toBe('file');
  });

  it('base64 wire shape with filename and mime', () => {
    const file: FileContent = {
      type: 'file',
      source: { kind: 'base64', data: 'AAAA', mime: 'application/pdf' },
      filename: 'doc.pdf',
      mime: 'application/pdf',
    };
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', file)));
    const block = dumped.content[0];
    expect(block.type).toBe('file');
    expect(block.source.mime).toBe('application/pdf');
    expect(block.filename).toBe('doc.pdf');
    expect(block.mime).toBe('application/pdf');
  });

  it('url wire shape', () => {
    const file: FileContent = {
      type: 'file',
      source: { kind: 'url', url: 'https://example.com/data.csv' },
      filename: 'data.csv',
    };
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', file)));
    const block = dumped.content[0];
    expect(block.type).toBe('file');
    expect(block.source.kind).toBe('url');
    expect(block.source.url).toBe('https://example.com/data.csv');
    expect(block.filename).toBe('data.csv');
  });

  it('strips optional filename/mime when unset', () => {
    const file: FileContent = {
      type: 'file',
      source: { kind: 'base64', data: 'AAAA', mime: 'text/plain' },
    };
    const dumped = JSON.parse(JSON.stringify(ToolResponseBuilder.build('tc_1', file)));
    const block = dumped.content[0];
    expect(block).not.toHaveProperty('filename');
    expect(block).not.toHaveProperty('mime');
  });
});

// ---------------------------------------------------------------------------
// Mixed-modality lists
// ---------------------------------------------------------------------------

describe('Mixed-modality content lists', () => {
  it('text + audio + file', () => {
    const resp = ToolResponseBuilder.build('tc_1', [
      'summary text',
      {
        type: 'audio',
        source: { kind: 'base64', data: 'AAAA', mime: 'audio/wav' },
      } satisfies AudioContent,
      {
        type: 'file',
        source: { kind: 'base64', data: 'BBBB', mime: 'application/pdf' },
        filename: 'report.pdf',
      } satisfies FileContent,
    ]);
    expect(resp.content).toHaveLength(3);
    expect(resp.content[0]?.type).toBe('text');
    expect(resp.content[1]?.type).toBe('audio');
    expect(resp.content[2]?.type).toBe('file');
  });

  it('image + audio', () => {
    const resp = ToolResponseBuilder.build('tc_1', [
      Image.fromBytes(PNG_BYTES),
      {
        type: 'audio',
        source: { kind: 'url', url: 'https://example.com/clip.wav' },
      } satisfies AudioContent,
    ]);
    expect(resp.content[0]?.type).toBe('image');
    expect(resp.content[1]?.type).toBe('audio');
  });
});

// ---------------------------------------------------------------------------
// Source discriminator validation
// ---------------------------------------------------------------------------

describe('Source discriminator validation', () => {
  it('rejects an unknown source kind', () => {
    expect(() =>
      AudioContentSchema.parse({
        type: 'audio',
        source: { kind: 'unknown', data: 'AAA', mime: 'audio/wav' },
      }),
    ).toThrow();
  });

  it('audio accepts arbitrary MIME', () => {
    const audio = AudioContentSchema.parse({
      type: 'audio',
      source: { kind: 'base64', data: 'AAAA', mime: 'audio/ogg; codecs=opus' },
    });
    if (audio.source.kind === 'base64') {
      expect(audio.source.mime).toBe('audio/ogg; codecs=opus');
    }
  });

  it('file accepts arbitrary MIME', () => {
    const file = FileContentSchema.parse({
      type: 'file',
      source: { kind: 'base64', data: 'AAAA', mime: 'application/vnd.ms-excel' },
    });
    if (file.source.kind === 'base64') {
      expect(file.source.mime).toBe('application/vnd.ms-excel');
    }
  });
});
