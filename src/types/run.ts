export type Engine = 'tim-small-preview' | 'tim-large' | 'timini' | (string & {});

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'timed_out';

export type ReasoningNode = {
  title: string;
  thought: string;
  tooluse: unknown[];
  subtask: ReasoningNode[];
  conclusion: string;
};

export type RunResult = {
  answer: string;
  reasoning: ReasoningNode;
};

export type Run = {
  runId: string;
  status?: RunStatus;
  result?: RunResult;
  usage?: Usage;
};

export type Usage = {
  models: ModelUsage[];
  platformTools: PlatformToolUsage[];
};

export type ModelUsage = {
  engine: Engine;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type PlatformToolUsage = {
  toolId: string;
  calls: number;
};

export type RunInput = {
  instructions: string;
  tools?: import('./tool.js').Tool[];
  /** JSON Schema for the answer output format. Use zodToJsonSchema() to generate from Zod. */
  answerFormat?: import('./schema.js').OutputSchema;
  /** JSON Schema for the reasoning output format. Use zodToJsonSchema() to generate from Zod. */
  reasoningFormat?: import('./schema.js').OutputSchema;
};

export type RunOptions = {
  awaitCompletion?: boolean;
};

export type RunParams = {
  engine: Engine;
  input: RunInput;
  options?: RunOptions;
};
