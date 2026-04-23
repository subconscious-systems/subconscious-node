// Main client
export { Subconscious, type SubconsciousOptions } from './client.js';

// Multimodal content helper
export { Image } from './image.js';

// Types - Run
export type {
  Run,
  RunStatus,
  RunResult,
  RunInput,
  RunOptions,
  RunOutput,
  RunParams,
  RunError,
  ReasoningTask,
  AgentToolUse,
  Usage,
  Engine,
} from './types/run.js';

// Types - Tools
export type { Tool, PlatformTool, FunctionTool, MCPTool, McpAuth } from './types/tool.js';

// Types - Multimodal content
export type {
  ContentBlock,
  TextContent,
  ImageContent,
  AudioContent,
  FileContent,
  Source,
  SourceBase64,
  SourceBlobRef,
  SourceUrl,
  ToolResponse,
} from './types/content.js';

// Schema types and utilities
export { zodToJsonSchema } from './types/schema.js';
export type {
  OutputSchema,
  JSONSchemaProperty,
  JSONSchemaString,
  JSONSchemaNumber,
  JSONSchemaBoolean,
  JSONSchemaArray,
  JSONSchemaObject,
  JSONSchemaEnum,
  JSONSchemaAnyOf,
} from './types/schema.js';

// Types - Stream Events
export type { StreamEvent, DeltaEvent, DoneEvent, ErrorEvent } from './types/events.js';

// Types - Errors
export {
  SubconsciousError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  RequestTooLargeError,
  type ErrorCode,
  type APIErrorResponse,
} from './types/error.js';

// Stream types
export type { RunStream, StreamOptions } from './stream.js';

// Polling options
export type { PollOptions } from './internal/poll.js';
