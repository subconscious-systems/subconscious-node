import type { RunStatus, RunResult, Usage } from "./run.js";

export type RunStartedEvent = {
  type: "run.started";
  runId: string;
};

export type RunStatusEvent = {
  type: "run.status";
  runId: string;
  status: RunStatus;
};

export type RunCompletedEvent = {
  type: "run.completed";
  runId: string;
  result: RunResult;
  usage: Usage;
};

export type RunFailedEvent = {
  type: "run.failed";
  runId: string;
  error: {
    code: string;
    message: string;
  };
};

export type ReasoningEvent = {
  type: "reasoning";
  runId: string;
  node: {
    title: string;
    thought: string;
  };
};

export type ToolCallEvent = {
  type: "tool.call";
  runId: string;
  toolId: string;
  input: unknown;
};

export type ToolResultEvent = {
  type: "tool.result";
  runId: string;
  toolId: string;
  output: unknown;
};

export type StreamEvent =
  | RunStartedEvent
  | RunStatusEvent
  | RunCompletedEvent
  | RunFailedEvent
  | ReasoningEvent
  | ToolCallEvent
  | ToolResultEvent;

