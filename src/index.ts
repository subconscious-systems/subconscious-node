// Main client
export { Subconscious, type SubconsciousOptions } from './client.js';

// Types - Run
export type {
  Run,
  RunStatus,
  RunResult,
  RunInput,
  RunOptions,
  RunParams,
  ReasoningNode,
  Engine,
  Usage,
  ModelUsage,
  PlatformToolUsage,
} from './types/run.js';

// Types - Tools
export type { Tool, PlatformTool, FunctionTool, MCPTool } from './types/tool.js';

// Types - Events
export type {
  StreamEvent,
  RunStartedEvent,
  RunStatusEvent,
  RunCompletedEvent,
  RunFailedEvent,
  ReasoningEvent,
  ToolCallEvent,
  ToolResultEvent,
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
