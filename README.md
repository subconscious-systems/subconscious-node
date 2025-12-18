<p align="center">
  <img src="https://www.subconscious.dev/logo.svg" alt="Subconscious" width="64" height="64">
</p>

<h1 align="center">Subconscious SDK</h1>

<p align="center">
  The official Node.js SDK for the <a href="https://subconscious.dev">Subconscious API</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/subconscious"><img src="https://img.shields.io/npm/v/subconscious.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/subconscious"><img src="https://img.shields.io/npm/dm/subconscious.svg" alt="npm downloads"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="node version">
  <a href="https://github.com/subconscious-systems/subconscious-node"><img src="https://img.shields.io/npm/l/subconscious.svg" alt="license"></a>
</p>

## Installation

```bash
pnpm add subconscious
# or
npm install subconscious
# or
yarn add subconscious
```


## Requirements

- Node.js ≥ 18
- ESM only


## Quick Start

```typescript
import { Subconscious } from "subconscious";

const client = new Subconscious({
  apiKey: process.env.SUBCONSCIOUS_API_KEY!,
});

// Create a run and wait for completion
const run = await client.run({
  engine: "tim-large",
  input: {
    instructions: "Search for the latest AI news and summarize the top 3 stories",
    tools: [{ type: "platform", id: "parallel_search", options: {} }],
  },
  options: { awaitCompletion: true },
});

console.log(run.result?.answer);
```

## Examples

### Fire and Forget

Create a run without waiting for completion:

```typescript
const run = await client.run({
  engine: "tim-small-preview",
  input: {
    instructions: "Generate a report",
    tools: [],
  },
});

console.log(`Run started: ${run.runId}`);

// Check status later
const status = await client.get(run.runId);
console.log(status.status);
```

### Polling with Custom Options

```typescript
const run = await client.run({
  engine: "tim-large",
  input: {
    instructions: "Complex task",
    tools: [{ type: "platform", id: "parallel_search", options: {} }],
  },
});

// Wait with custom polling options
const result = await client.wait(run.runId, {
  intervalMs: 2000,      // Poll every 2 seconds
  maxAttempts: 60,       // Give up after 60 attempts
});
```

### Streaming

Process events as they arrive:

```typescript
const stream = client.stream({
  engine: "tim-large",
  input: {
    instructions: "Search and analyze",
    tools: [{ type: "platform", id: "parallel_search", options: {} }],
  },
});

for await (const event of stream) {
  switch (event.type) {
    case "run.started":
      console.log(`Run started: ${event.runId}`);
      break;
    case "reasoning":
      console.log(`Thinking: ${event.node.title}`);
      break;
    case "tool.call":
      console.log(`Calling tool: ${event.toolId}`);
      break;
    case "run.completed":
      console.log(`Answer: ${event.result.answer}`);
      break;
    case "run.failed":
      console.error(`Failed: ${event.error.message}`);
      break;
  }
}
```

### Tool Configuration

Tools are plain JSON objects with a `type` discriminator:

```typescript
// Platform tools
const parallelSearch = {
  type: "platform",
  id: "parallel_search",
  options: {},
};

// Function tools
const customSearch = {
  type: "function",
  function: {
    name: "search_database",
    description: "Search the internal database",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
  },
};

// MCP tools
const mcpTool = {
  type: "mcp",
  url: "https://mcp.example.com",
  allow: ["read", "write"],
};

// Use in a run
await client.run({
  engine: "tim-large",
  input: {
    instructions: "...",
    tools: [parallelSearch, customSearch, mcpTool],
  },
});
```

### Error Handling

```typescript
import {
  Subconscious,
  SubconsciousError,
  AuthenticationError,
  RateLimitError,
} from "subconscious";

try {
  const run = await client.run({ /* ... */ });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error("Invalid API key");
  } else if (error instanceof RateLimitError) {
    console.error("Rate limited, retry later");
  } else if (error instanceof SubconsciousError) {
    console.error(`API error: ${error.code} - ${error.message}`);
  } else {
    throw error;
  }
}
```

### Cancellation

```typescript
// Cancel with AbortController
const controller = new AbortController();

const stream = client.stream(
  {
    engine: "tim-large",
    input: { instructions: "...", tools: [] },
  },
  { signal: controller.signal },
);

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30000);

// Or cancel a running run
await client.cancel(run.runId);
```

## API Reference

### `Subconscious`

The main client class.

#### Constructor Options

| Option | Type | Required | Default |
|--------|------|----------|---------|
| `apiKey` | `string` | Yes | - |
| `baseUrl` | `string` | No | `https://api.subconscious.dev/v1` |

#### Methods

| Method | Description |
|--------|-------------|
| `run(params)` | Create a new run |
| `stream(params, options?)` | Create a streaming run |
| `get(runId)` | Get run status |
| `wait(runId, options?)` | Poll until run completes |
| `cancel(runId)` | Cancel a running run |

### Tool Types

```typescript
type PlatformTool = {
  type: "platform";
  id: string;
  options: Record<string, unknown>;
};

type FunctionTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

type MCPTool = {
  type: "mcp";
  url: string;
  allow?: string[];
};

type Tool = PlatformTool | FunctionTool | MCPTool;
```

### Engines

| Engine | Type | Availability | Description |
|--------|------|--------------|-------------|
| `tim-small-preview` | Unified | Available | Fast and tuned for search tasks |
| `tim-large` | Compound | Available | Generalized reasoning engine backed by the power of OpenAI |
| `timini` | Compound | Coming soon | Generalized reasoning engine backed by the power of Google Gemini |

### Run Status

| Status | Description |
|--------|-------------|
| `queued` | Waiting to start |
| `running` | Currently executing |
| `succeeded` | Completed successfully |
| `failed` | Encountered an error |
| `canceled` | Manually canceled |
| `timed_out` | Exceeded time limit |

## Contributing

We welcome contributions! Please open an issue or submit a PR on [GitHub](https://github.com/subconscious-systems/subconscious-node).

## License

ISC
