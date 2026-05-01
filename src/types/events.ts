import type { ErrorCode } from './error.js';
import type { ReasoningNode, RunResult, ToolUse, Usage } from './run.js';

/**
 * Stream emitted `started` — always the first event. Carries the runId
 * synchronously so consumers can register cancellation handlers before
 * any deltas arrive. (R8.)
 */
export type StartedEvent = {
  type: 'started';
  runId: string;
};

/**
 * Text delta event - emitted as text is generated.
 */
export type DeltaEvent = {
  type: 'delta';
  runId: string;
  content: string;
};

/**
 * One completed reasoning node from the live tree. Emitted by engines
 * that support structured streaming. (R15.)
 */
export type ReasoningNodeEvent = {
  type: 'reasoning_node';
  runId: string;
  node: ReasoningNode;
};

/**
 * One completed tool invocation. Emitted by engines that support
 * structured streaming. (R15.)
 */
export type ToolCallEvent = {
  type: 'tool_call';
  runId: string;
  call: ToolUse;
};

/**
 * Final structured run envelope. Emitted exactly once on success,
 * immediately before `done`. Eliminates the JSON.parse-the-accumulated-
 * delta-buffer pattern. (R15.)
 *
 * Generic `T` defaults to `unknown` so callers using `answerFormat` can
 * narrow it via the `client.stream<MySchema>(...)` overload.
 */
export type ResultEvent<T = unknown> = {
  type: 'result';
  runId: string;
  result: RunResult<T>;
  usage?: Usage;
};

/**
 * Stream completed successfully. Always the last event.
 */
export type DoneEvent = {
  type: 'done';
  runId: string;
};

/**
 * Stream encountered an error. Always carries a `code` (R5) so consumers
 * can pattern-match on the canonical enum without parsing message text.
 */
export type ErrorEvent = {
  type: 'error';
  runId: string;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Discriminated union of every stream event the SDK emits.
 *
 * Order invariants: `started` first, exactly one of `result`/`error`
 * before `done`, `done` last.
 */
export type StreamEvent<T = unknown> =
  | StartedEvent
  | DeltaEvent
  | ReasoningNodeEvent
  | ToolCallEvent
  | ResultEvent<T>
  | DoneEvent
  | ErrorEvent;
