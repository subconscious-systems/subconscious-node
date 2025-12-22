/**
 * Text delta event - emitted as text is generated.
 */
export type DeltaEvent = {
  type: 'delta';
  runId: string;
  content: string;
};

/**
 * Stream completed successfully.
 */
export type DoneEvent = {
  type: 'done';
  runId: string;
};

/**
 * Stream encountered an error.
 */
export type ErrorEvent = {
  type: 'error';
  runId: string;
  message: string;
  code?: string;
};

/**
 * All possible stream events.
 *
 * Currently supports text deltas. Rich events (reasoning, tool calls)
 * are coming soon.
 */
export type StreamEvent = DeltaEvent | DoneEvent | ErrorEvent;
