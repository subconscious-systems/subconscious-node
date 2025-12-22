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
  <a href="https://docs.subconscious.dev"><img src="https://img.shields.io/badge/docs-subconscious.dev-blue" alt="docs"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="node version">
  <a href="https://github.com/subconscious-systems/subconscious-node"><img src="https://img.shields.io/npm/l/subconscious.svg" alt="license"></a>
</p>

---

## Installation

```bash
pnpm add subconscious
# or
npm install subconscious
# or
yarn add subconscious
```

## Quick Start

```typescript
import { Subconscious } from 'subconscious';

const client = new Subconscious({
  apiKey: process.env.SUBCONSCIOUS_API_KEY!,
});

const run = await client.run({
  engine: 'tim-large',
  input: {
    instructions: 'Search for the latest AI news and summarize the top 3 stories',
    tools: [{ type: 'platform', id: 'parallel_search', options: {} }],
  },
  options: { awaitCompletion: true },
});

console.log(run.result?.answer);
```

## Get Your API Key

Create an API key in the [Subconscious dashboard](https://www.subconscious.dev/platform).

## Usage

### Run and Wait

The simplest way to use the SDK—create a run and wait for completion:

```typescript
const run = await client.run({
  engine: 'tim-large',
  input: {
    instructions: 'Analyze the latest trends in renewable energy',
    tools: [{ type: 'platform', id: 'parallel_search', options: {} }],
  },
  options: { awaitCompletion: true },
});

console.log(run.result?.answer);
console.log(run.result?.reasoning); // Structured reasoning nodes
```

### Fire and Forget

Start a run without waiting, then check status later:

```typescript
const run = await client.run({
  engine: 'tim-large',
  input: {
    instructions: 'Generate a comprehensive report',
    tools: [],
  },
});

console.log(`Run started: ${run.runId}`);

// Check status later
const status = await client.get(run.runId);
console.log(status.status); // 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'timed_out'
```

### Poll with Custom Options

```typescript
const run = await client.run({
  engine: 'tim-large',
  input: {
    instructions: 'Complex task',
    tools: [{ type: 'platform', id: 'parallel_search' }],
  },
});

// Wait with custom polling options
const result = await client.wait(run.runId, {
  intervalMs: 2000,  // Poll every 2 seconds
  maxAttempts: 60,   // Give up after 60 attempts
});
```

### Streaming (Text Deltas)

Stream text as it's generated:

```typescript
const stream = client.stream({
  engine: 'tim-large',
  input: {
    instructions: 'Write a short essay about space exploration',
    tools: [{ type: 'platform', id: 'parallel_search' }],
  },
});

for await (const event of stream) {
  if (event.type === 'delta') {
    process.stdout.write(event.content);
  } else if (event.type === 'done') {
    console.log('\n\nRun completed:', event.runId);
  } else if (event.type === 'error') {
    console.error('Error:', event.message);
  }
}
```

> **Note**: Rich streaming events (reasoning steps, tool calls) are coming soon. Currently, the stream provides text deltas as they're generated.

### Tools

```typescript
// Platform tools (hosted by Subconscious)
const parallelSearch = {
  type: 'platform',
  id: 'parallel_search',
  options: {},
};

// Function tools (your own functions)
const customFunction = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
      },
      required: ['location'],
    },
    url: 'https://api.example.com/weather',
    method: 'GET',
    timeout: 30,
  },
};

// MCP tools
const mcpTool = {
  type: 'mcp',
  url: 'https://mcp.example.com',
  allow: ['read', 'write'],
};
```

### Error Handling

```typescript
import { SubconsciousError, AuthenticationError, RateLimitError } from 'subconscious';

try {
  const run = await client.run({ /* ... */ });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.error('Rate limited, retry later');
  } else if (error instanceof SubconsciousError) {
    console.error(`API error: ${error.code} - ${error.message}`);
  }
}
```

### Cancellation

```typescript
// Cancel via AbortController
const controller = new AbortController();
const stream = client.stream(params, { signal: controller.signal });
setTimeout(() => controller.abort(), 30000);

// Or cancel a running run
await client.cancel(run.runId);
```

## API Reference

### `Subconscious`

The main client class.

#### Constructor Options

| Option    | Type     | Required | Default                           |
| --------- | -------- | -------- | --------------------------------- |
| `apiKey`  | `string` | Yes      | -                                 |
| `baseUrl` | `string` | No       | `https://api.subconscious.dev/v1` |

#### Methods

| Method                     | Description              |
| -------------------------- | ------------------------ |
| `run(params)`              | Create a new run         |
| `stream(params, options?)` | Stream text deltas       |
| `get(runId)`               | Get run status           |
| `wait(runId, options?)`    | Poll until completion    |
| `cancel(runId)`            | Cancel a running run     |

### Engines

| Engine              | Type     | Availability | Description                                                       |
| ------------------- | -------- | ------------ | ----------------------------------------------------------------- |
| `tim-small-preview` | Unified  | Available    | Fast and tuned for search tasks                                   |
| `tim-large`         | Compound | Available    | Generalized reasoning engine backed by the power of OpenAI        |
| `timini`            | Compound | Coming soon  | Generalized reasoning engine backed by the power of Google Gemini |

### Run Status

| Status      | Description            |
| ----------- | ---------------------- |
| `queued`    | Waiting to start       |
| `running`   | Currently executing    |
| `succeeded` | Completed successfully |
| `failed`    | Encountered an error   |
| `canceled`  | Manually canceled      |
| `timed_out` | Exceeded time limit    |

## Requirements

- Node.js ≥ 18
- ESM only

## Contributing

Contributions are welcome! Please feel free to submit a pull request.

## License

ISC

## Support

For support and questions:
- Documentation: https://docs.subconscious.dev
- Email: {hongyin,jack}@subconscious.dev

## License

ISC
