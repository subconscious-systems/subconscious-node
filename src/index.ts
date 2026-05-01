// Main client
export {
  Subconscious,
  type SubconsciousOptions,
  type GenericRunParams,
} from './client.js';

// Tool builders (R11) — recommended way to construct tools.
export { tools } from './builders.js';

// Types - Run
export type {
  Run,
  RunStatus,
  RunResult,
  RunInput,
  RunParams,
  ReasoningNode,
  ToolUse,
  Engine,
  Usage,
  ModelUsage,
  PlatformToolUsage,
} from './types/run.js';

// Types - Tools
export type {
  Tool,
  PlatformTool,
  FunctionTool,
  MCPTool,
  MCPAuth,
  ResourceTool,
} from './types/tool.js';

// Schema types and utilities
export { zodToJsonSchema, coerceAnswerFormat } from './types/schema.js';
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

// Types - Stream Events (Stream Events v2)
export type {
  StreamEvent,
  StartedEvent,
  DeltaEvent,
  ReasoningNodeEvent,
  ToolCallEvent,
  ResultEvent,
  DoneEvent,
  ErrorEvent,
} from './types/events.js';

// Types - Errors
export {
  SubconsciousError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  type ErrorCode,
  type APIErrorResponse,
} from './types/error.js';

// Stream types
export type { RunStream, StreamOptions } from './stream.js';

// Polling type
export type { PollOptions } from './internal/poll.js';
