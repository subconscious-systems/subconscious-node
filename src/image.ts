/**
 * Multimodal content helpers — `Image` constructor for building canonical
 * ImageContent blocks from a path, raw bytes, a remote URL, or a server-side
 * blob_ref. Mirrors the Python SDK `Image` helper.
 *
 * @example
 * ```ts
 * import { Subconscious, Image } from 'subconscious';
 *
 * const client = new Subconscious();
 * await client.run({
 *   engine: 'tim-claude',
 *   input: {
 *     instructions: 'What is in this image?',
 *     content: [Image.fromPath('shot.png')],
 *   },
 * });
 * ```
 */

import { readFileSync } from 'node:fs';
import type { ImageContent } from './types.js';

const MIME_ALLOWED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Magic-byte mime detection — mirrors
 * `apps/api/src/core/blob-store/image-utils.ts` in the monorepo and the
 * Python SDK's `_detect_mime`.
 */
function detectMime(data: Uint8Array): string {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    data.length >= 6 &&
    data[0] === 0x47 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x38 &&
    (data[4] === 0x37 || data[4] === 0x39) &&
    data[5] === 0x61
  ) {
    return 'image/gif';
  }
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return 'image/webp';
  }
  throw new Error('unsupported image type — only PNG, JPEG, GIF, and WebP are accepted');
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

export const Image = {
  /** Read an image file from disk and emit an ImageContent(base64) block. */
  fromPath(path: string): ImageContent {
    const data = readFileSync(path);
    const mime = detectMime(data);
    return {
      type: 'image',
      source: { kind: 'base64', data: toBase64(data), mime },
    };
  },

  /** Wrap raw bytes as an ImageContent(base64) block. Mime is detected if not provided. */
  fromBytes(data: Uint8Array | Buffer, mime?: string): ImageContent {
    const bytes = data instanceof Buffer ? new Uint8Array(data) : data;
    const resolvedMime = mime ?? detectMime(bytes);
    if (!MIME_ALLOWED.has(resolvedMime)) {
      throw new Error(`mime ${resolvedMime} not allowed`);
    }
    return {
      type: 'image',
      source: { kind: 'base64', data: toBase64(bytes), mime: resolvedMime },
    };
  },

  /**
   * Reference a remote image by URL. `fetch: false` (default) sends the URL
   * through to the server. `fetch: true` downloads the bytes client-side and
   * embeds them as base64.
   */
  async fromUrl(url: string, opts: { fetch?: boolean } = {}): Promise<ImageContent> {
    if (opts.fetch) {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`failed to fetch image: ${res.status} ${res.statusText}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      return Image.fromBytes(buf);
    }
    return { type: 'image', source: { kind: 'url', url } };
  },

  /** Reference an asset already stored server-side. Skip an upload roundtrip. */
  fromBlobRef(blob_key: string, mime: string): ImageContent {
    return {
      type: 'image',
      source: { kind: 'blob_ref', blob_key, mime },
    };
  },
};
