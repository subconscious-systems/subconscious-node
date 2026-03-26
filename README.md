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
  engine: 'tim-gpt',
  input: {
    instructions: 'Search for the latest AI news and summarize the top 3 stories',
    tools: [{ type: 'platform', id: 'fast_search', options: {} }],
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
  engine: 'tim-gpt',
  input: {
    instructions: 'Analyze the latest trends in renewable energy',
    tools: [{ type: 'platform', id: 'fast_search', options: {} }],
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
  engine: 'tim-gpt',
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
  engine: 'tim-gpt',
  input: {
    instructions: 'Complex task',
    tools: [{ type: 'platform', id: 'fast_search' }],
  },
});

// Wait with custom polling options
const result = await client.wait(run.runId, {
  intervalMs: 2000, // Poll every 2 seconds
  maxAttempts: 60, // Give up after 60 attempts
});
```

### Streaming (Text Deltas)

Stream text as it's generated:

```typescript
const stream = client.stream({
  engine: 'tim-gpt',
  input: {
    instructions: 'Write a short essay about space exploration',
    tools: [{ type: 'platform', id: 'fast_search' }],
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

**Simple Search Tools** — Use these tools to get started quickly in our playground or with our API. For example: `{ type: 'platform', id: 'fast_search' }`.

| Tool Name             | API Name                | Description                                                |
| --------------------- | ----------------------- | ---------------------------------------------------------- |
| Fast Search            | `fast_search`           | Extremely fast search for simple factual lookups           |
| Web Search             | `web_search`            | Comprehensive web search for detailed research            |
| Fresh Search           | `fresh_search`          | Search the web for content from the last 7 days            |
| Page Reader            | `page_reader`           | Extract content from a specific webpage URL                 |
| Find Similar           | `find_similar`          | Find similar links to a given URL                           |
| People Search          | `people_search`         | Search for people, profiles, and bios                      |
| Company Search         | `company_search`        | Search for companies, funding info, and business details   |
| News Search            | `news_search`           | Search for news articles and press coverage                |
| Tweet Search           | `tweet_search`          | Search for tweets and Twitter/X discussions                |
| Research Paper Search  | `research_paper_search` | Search for academic research papers and studies            |
| Google Search          | `google_search`         | Search the web using Google                                 |

```typescript
// Platform tools (hosted by Subconscious)
const fastSearch = {
  type: 'platform',
  id: 'fast_search',
  options: {},
};

// Function tools (your own HTTP endpoints)
const customFunction = {
  type: 'function',
  name: 'get_weather',
  description: 'Get current weather for a location',
  url: 'https://api.example.com/weather',
  method: 'GET',
  timeout: 30,
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' },
    },
    required: ['location'],
  },
};

// MCP tools (connect to any MCP server)
const mcpTool = {
  type: 'mcp',
  url: 'https://mcp.example.com',
  allowedTools: ['search', 'get_page'],
};
```

### Tool Headers & Default Arguments

Function tools support two powerful features for injecting data at call time:

- **`headers`**: HTTP headers sent with the request to your tool endpoint
- **`defaults`**: Parameter values hidden from the model and injected automatically

```typescript
const toolWithHeadersAndDefaults = {
  type: 'function',
  name: 'search_database',
  description: 'Search the database',
  url: 'https://api.example.com/search',
  method: 'POST',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      // Define these for validation, but they'll be hidden from the model
      sessionId: { type: 'string' },
      apiKey: { type: 'string' },
    },
    required: ['query'], // Only query is required - model generates this
  },

  // HEADERS: Sent as HTTP headers when this tool's endpoint is called
  headers: {
    'x-custom-auth': 'my-secret-token',
    'x-request-source': 'my-app',
  },

  // DEFAULTS: Injected into parameters, hidden from model
  defaults: {
    sessionId: 'user-session-abc123',
    apiKey: 'secret-api-key',
  },
};
```

**How it works:**

| Feature    | Where it goes                         | When                    |
| ---------- | ------------------------------------- | ----------------------- |
| `headers`  | HTTP request headers                  | Sent to your tool's URL |
| `defaults` | Merged into request body `parameters` | At tool call time       |

**Default arguments flow:**

1. Define all parameters in `properties` (required for validation)
2. Parameters with defaults are **stripped from the schema** before the model sees them
3. Model only generates values for non-defaulted parameters (e.g., `query`)
4. At call time, defaults are merged into the request body
5. Default values always take precedence over model-generated values

Each tool can have its own headers and defaults - they're only applied when that specific tool is called.

### MCP Tools

Connect to any [Model Context Protocol](https://modelcontextprotocol.io/) server and use its tools in your runs. Subconscious discovers tools from the server, filters by your `allowedTools` list, and proxies calls automatically.

#### Authentication

MCP servers that require authentication accept an `auth` object. The auth translates to an HTTP header sent with every tool call:

| Method | When to use | Header sent |
| --- | --- | --- |
| **Bearer** | Most common — OAuth tokens, JWTs, etc. | `Authorization: Bearer <token>` |
| **API key** | Service-specific API keys | `<header>: <token>` (header is typically `X-Api-Key` — check your MCP server's docs) |

```typescript
import type { MCPTool, McpAuth } from 'subconscious';

/**
 * McpAuth translates to an HTTP header sent with every tool call:
 *
 * Bearer auth (most common):
 *   { type: 'bearer', token: '<your-oauth-or-jwt-token>' }
 *   → header: { "Authorization": "Bearer <token>" }
 *
 * API key auth:
 *   { type: 'api_key', token: '<your-api-key>', header: 'X-Api-Key' }
 *   → header: { "X-Api-Key": "<token>" }
 *   The header name varies by provider — check the MCP server you're connecting to.
 */
```

#### Examples

```typescript
// Basic — use all tools from an MCP server (no auth)
const run = await client.run({
  engine: 'tim-gpt',
  input: {
    instructions: 'Find my recent meeting notes',
    tools: [
      { type: 'mcp', url: 'https://mcp.notion.so/v1' },
    ],
  },
  options: { awaitCompletion: true },
});

// Filter to specific tools (case-insensitive)
const run2 = await client.run({
  engine: 'tim-gpt',
  input: {
    instructions: 'Search my documents',
    tools: [
      {
        type: 'mcp',
        url: 'https://mcp.notion.so/v1',
        allowedTools: ['search', 'get_page'],
      },
    ],
  },
  options: { awaitCompletion: true },
});

// Bearer auth — most common, used with OAuth/JWT tokens
const run3 = await client.run({
  engine: 'tim-gpt',
  input: {
    instructions: 'Check my calendar',
    tools: [
      {
        type: 'mcp',
        url: 'https://mcp.google.com/v1',
        auth: { type: 'bearer', token: 'your-oauth-token' },
      },
    ],
  },
  options: { awaitCompletion: true },
});

// API key auth — header is usually X-Api-Key, but check your provider's docs
const run4 = await client.run({
  engine: 'tim-gpt',
  input: {
    instructions: 'Query the database',
    tools: [
      {
        type: 'mcp',
        url: 'https://mcp.example.com',
        auth: { type: 'api_key', token: 'key123', header: 'X-Api-Key' },
      },
    ],
  },
  options: { awaitCompletion: true },
});
```

**`allowedTools` filtering:**

| Value | Behavior |
| --- | --- |
| Omitted / `undefined` | All tools from the server are enabled |
| `["*"]` | All tools enabled (explicit wildcard) |
| `["search", "fetch"]` | Only these tools (case-insensitive) |
| `[]` | No tools (blocks all) |

### Structured Output

Get structured responses using JSON Schema. We recommend using [Zod](https://zod.dev) to define your schema, then convert it with `zodToJsonSchema()`:

```typescript
import { z } from 'zod';
import { Subconscious, zodToJsonSchema } from 'subconscious';

const client = new Subconscious({ apiKey: process.env.SUBCONSCIOUS_API_KEY! });

// Define your output schema with Zod
const AnalysisSchema = z.object({
  summary: z.string().describe('A brief summary of the findings'),
  keyPoints: z.array(z.string()).describe('Main takeaways'),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  confidence: z.number().describe('Confidence score from 0 to 1'),
});

const run = await client.run({
  engine: 'tim-gpt',
  input: {
    instructions: 'Analyze the latest news about electric vehicles',
    tools: [{ type: 'platform', id: 'fast_search', options: {} }],
    answerFormat: zodToJsonSchema(AnalysisSchema, 'Analysis'),
  },
  options: { awaitCompletion: true },
});

// Result is typed according to your schema
const result = run.result?.answer as z.infer<typeof AnalysisSchema>;
console.log(result.summary);
console.log(result.keyPoints);
```

You can also define a `reasoningFormat` to structure the agent's reasoning:

```typescript
const ReasoningSchema = z.object({
  steps: z.array(
    z.object({
      thought: z.string(),
      action: z.string(),
    }),
  ),
  conclusion: z.string(),
});

const run = await client.run({
  engine: 'tim-gpt',
  input: {
    instructions: 'Research and explain quantum computing',
    tools: [{ type: 'platform', id: 'fast_search', options: {} }],
    answerFormat: zodToJsonSchema(AnalysisSchema, 'Analysis'),
    reasoningFormat: zodToJsonSchema(ReasoningSchema, 'Reasoning'),
  },
  options: { awaitCompletion: true },
});
```

#### Manual JSON Schema

You can also provide the JSON Schema directly without Zod:

```typescript
const run = await client.run({
  engine: 'tim-gpt',
  input: {
    instructions: 'Analyze this topic',
    tools: [],
    answerFormat: {
      title: 'Analysis',
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary' },
        score: { type: 'number', description: 'Score from 1-10' },
      },
      required: ['summary', 'score'],
    },
  },
  options: { awaitCompletion: true },
});
```

### Error Handling

```typescript
import { SubconsciousError, AuthenticationError, RateLimitError } from 'subconscious';

try {
  const run = await client.run({
    /* ... */
  });
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

| Method                     | Description           |
| -------------------------- | --------------------- |
| `run(params)`              | Create a new run      |
| `stream(params, options?)` | Stream text deltas    |
| `get(runId)`               | Get run status        |
| `wait(runId, options?)`    | Poll until completion |
| `cancel(runId)`            | Cancel a running run  |

### `zodToJsonSchema(schema, title)`

Convert a Zod schema to the JSON Schema format expected by `answerFormat` and `reasoningFormat`.

| Param    | Type       | Description                        |
| -------- | ---------- | ---------------------------------- |
| `schema` | Zod object | A Zod object schema (`z.object()`) |
| `title`  | `string`   | Title for the schema               |

Returns an `OutputSchema` compatible with `answerFormat` and `reasoningFormat`.

### Engines

| Engine          | Type     | Description                                                                     |
| --------------- | -------- | ------------------------------------------------------------------------------- |
| `tim`           | Unified  | Our flagship unified agent engine for a wide range of tasks                     |
| `tim-edge`      | Unified  | Highly efficient engine tuned for performance with search tools                 |
| `timini`        | Compound | Complex reasoning engine for long-context and tool use backed by Gemini-3 Flash |
| `tim-gpt`       | Compound | Complex reasoning engine for long-context and tool use backed by OpenAI GPT-4.1 |
| `tim-gpt-heavy` | Compound | Complex reasoning engine for long-context and tool use backed by OpenAI GPT-5.2 |

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

Apache-2.0

## Support

For support and questions:

- Documentation: https://docs.subconscious.dev
- Email: {hongyin,jack}@subconscious.dev

## License

Apache-2.0
