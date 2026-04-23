// Main client
export { Subconscious, type SubconsciousOptions } from './client.js';

// Multimodal content helper
export { Image } from './image.js';

// Stream
export type { RunStream, StreamOptions } from './stream.js';

// All types and Zod schemas
export {
  // Engine + status
  EngineSchema,
  RunStatusSchema,
  type Engine,
  type RunStatus,

  // Structured output
  JSONSchemaStringSchema,
  JSONSchemaNumberSchema,
  JSONSchemaBooleanSchema,
  JSONSchemaEnumSchema,
  type OutputSchema,
  type JSONSchemaProperty,
  type JSONSchemaString,
  type JSONSchemaNumber,
  type JSONSchemaBoolean,
  type JSONSchemaArray,
  type JSONSchemaObject,
  type JSONSchemaEnum,
  type JSONSchemaAnyOf,

  // Run response types
  AgentToolUseSchema,
  ReasoningTaskSchema,
  RunResultSchema,
  UsageSchema,
  RunErrorSchema,
  RunSchema,
  type AgentToolUse,
  type ReasoningTask,
  type RunResult,
  type Usage,
  type RunError,
  type Run,

  // Tool types
  PlatformToolSchema,
  FunctionToolSchema,
  McpAuthSchema,
  MCPToolSchema,
  ToolSchema,
  type PlatformTool,
  type FunctionTool,
  type McpAuth,
  type MCPTool,
  type Tool,

  // Content types
  SourceBase64Schema,
  SourceBlobRefSchema,
  SourceUrlSchema,
  SourceSchema,
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  FileContentSchema,
  ContentBlockSchema,
  type SourceBase64,
  type SourceBlobRef,
  type SourceUrl,
  type Source,
  type TextContent,
  type ImageContent,
  type AudioContent,
  type FileContent,
  type ContentBlock,

  // Tool response envelope (schema + type)
  ToolResponseSchema,
  type ToolResponse,

  // User input types
  type RunInput,
  type RunOutput,
  type RunOptions,
  type RunParams,
  type PollOptions,

  // Stream events
  DeltaEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
  StreamEventSchema,
  type DeltaEvent,
  type DoneEvent,
  type ErrorEvent,
  type StreamEvent,
} from './types.js';

// Helpers — functions, wire schemas, body builders, ToolResponseBuilder
export {
  zodToOutputSchema,
  zodToJsonSchema,
  ToolResponseBuilder,
  type ToolResponseContent,
  CreateRunBodySchema,
  buildCreateRunBody,
  toWireBody,
  buildRunBody,
  type CreateRunBody,
  type RunInputWire,
  type RunOptionsWire,
  type RunOutputWire,
  parseAnswer,
  augmentRun,
} from './helpers.js';

// Errors
export {
  SubconsciousError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  RequestTooLargeError,
  ResponseValidationError,
  type ErrorCode,
  type APIErrorResponse,
} from './errors.js';
