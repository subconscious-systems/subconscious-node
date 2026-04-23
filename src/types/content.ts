/**
 * Multimodal content blocks — mirrors the Python SDK `ContentBlock` union
 * and the canonical Zod schemas in
 * `subconscious-monorepo/packages/common/schemas/index.ts`.
 *
 * A single `Source` union is shared across all content blocks
 * (text, image, audio, file).
 */

export type SourceBase64 = {
  kind: 'base64';
  data: string;
  mime: string;
};

export type SourceBlobRef = {
  kind: 'blob_ref';
  blob_key: string;
  mime: string;
  size_bytes?: number;
  attachment_id?: string;
  presigned_url?: string;
  presigned_expires_at?: string;
};

export type SourceUrl = {
  kind: 'url';
  url: string;
  mime?: string;
};

export type Source = SourceBase64 | SourceBlobRef | SourceUrl;

export type TextContent = {
  type: 'text';
  text: string;
};

export type ImageContent = {
  type: 'image';
  source: Source;
};

export type AudioContent = {
  type: 'audio';
  source: Source;
};

export type FileContent = {
  type: 'file';
  source: Source;
  filename?: string;
  mime?: string;
};

export type ContentBlock = TextContent | ImageContent | AudioContent | FileContent;

/**
 * Canonical envelope returned by a FunctionTool HTTP endpoint.
 * Reuses the ContentBlock union (text, image, audio, file) from run input.
 */
export type ToolResponse = {
  tool_call_id?: string | null;
  content: ContentBlock[];
  is_error?: boolean;
};
