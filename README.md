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

> **v1.0** — If you're upgrading from `0.x`, read the [Migration Guide](./MIGRATION.md).

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
  engine: 'tim',
  input: {
    instructions: 'Search for the latest AI news and summarize the top 3 stories',
    tools: [{ type: 'platform', id: 'web_search' }],
  },
  options: { awaitCompletion: true },
});

console.log(run.result?.answer);
```

## Get Your API Key

Create an API key in the [Subconscious dashboard](https://www.subconscious.dev/platform).

## Usage

### Run and Wait

```typescript
const run = await client.run({
  engine: 'tim',
  input: {
    instructions: 'Analyze the latest trends in renewable energy',
    tools: [{ type: 'platform', id: 'web_search' }],
  },
  options: { awaitCompletion: true },
});

console.log(run.result?.answer);
console.log(run.result?.reasoning); // ReasoningTask[]
```

### Fire and Forget

```typescript
const run = await client.run({
  engine: 'tim',
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
  engine: 'tim',
  input: {
    instructions: 'Complex task',
    tools: [{ type: 'platform', id: 'web_search' }],
  },
});

const result = await client.wait(run.runId, {
  intervalMs: 2000,
  maxAttempts: 60,
});
```

### Streaming (Text Deltas)

```typescript
const stream = client.stream({
  engine: 'tim',
  input: {
    instructions: 'Write a short essay about space exploration',
    tools: [{ type: 'platform', id: 'web_search' }],
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

> **Note**: Rich streaming events (reasoning steps, tool calls) are coming soon. The stream currently provides text deltas as they're generated.

### Multimodal Input

Pass images alongside instructions using the `content` field:

```typescript
import { Subconscious, Image } from 'subconscious';

const client = new Subconscious();

const run = await client.run({
  engine: 'tim-claude',
  input: {
    instructions: 'What is in this image?',
    content: [Image.fromPath('shot.png')],
  },
  options: { awaitCompletion: true },
});
```

`Image` factory constructors:

| Constructor                     | When to use                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `Image.fromPath(path)`          | Read a local file from disk                                       |
| `Image.fromBytes(buf, mime?)`   | Wrap raw bytes you already have in memory                         |
| `Image.fromUrl(url)`            | Reference a public URL (server fetches on your behalf)            |
| `Image.fromUrl(url, {fetch:1})` | Download client-side and embed as base64                          |
| `Image.fromBlobRef(key, mime)`  | Reference an asset already in Subconscious storage                |

Supported MIME types: `image/png`, `image/jpeg`, `image/gif`, `image/webp`. Requests larger than 5MB throw `RequestTooLargeError` — upload via `/v1/internal/attachments` first, then pass `Image.fromBlobRef(...)`.

### Resources

Attach lifecycle-managed services (sandboxes, browsers, memory stores) to your run via `resources`:

```typescript
const run = await client.run({
  engine: 'tim',
  input: {
    instructions: 'Analyze data.csv and output a chart',
    resources: ['sandbox'], // E2B sandbox
  },
  options: { awaitCompletion: true },
});
```

### Skills

Attach reusable knowledge packages to your runs. Skills inject custom instructions into the agent's system prompt at request time.

```typescript
const run = await client.run({
  engine: 'tim',
  input: {
    instructions: 'Build a REST API following our team standards',
    tools: [{ type: 'platform', id: 'web_search' }],
    skills: ['api-design', 'error-handling'],
  },
  options: { awaitCompletion: true },
});
```

Skills are resolved by name. Browse and create skills at [subconscious.dev/platform/skills](https://www.subconscious.dev/platform/skills).

### Tools

**Platform Tools** — built-in tools hosted by Subconscious:

| Tool Name             | API Name                | Description                                              |
| --------------------- | ----------------------- | -------------------------------------------------------- |
| Fast Search           | `fast_search`           | Extremely fast search for simple factual lookups         |
| Web Search            | `web_search`            | Comprehensive web search for detailed research           |
| Fresh Search          | `fresh_search`          | Search the web for content from the last 7 days          |
| Page Reader           | `page_reader`           | Extract content from a specific webpage URL              |
| Find Similar          | `find_similar`          | Find similar links to a given URL                        |
| People Search         | `people_search`         | Search for people, profiles, and bios                    |
| Company Search        | `company_search`        | Search for companies, funding info, and business details |
| News Search           | `news_search`           | Search for news articles and press coverage              |
| Tweet Search          | `tweet_search`          | Search for tweets and Twitter/X discussions              |
| Research Paper Search | `research_paper_search` | Search for academic research papers and studies          |
| Google Search         | `google_search`         | Search the web using Google                              |

```typescript
// Platform tool (hosted by Subconscious)
const fastSearch = { type: 'platform', id: 'fast_search' };

// Function tool (your own HTTP endpoint)
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

// MCP tool (any MCP-compatible server)
const mcpTool = {
  type: 'mcp',
  url: 'https://mcp.example.com',
  allowedTools: ['search', 'get_page'],
};
```

### Tool Headers & Default Arguments

Function tools support two features for injecting data at call time:

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
      sessionId: { type: 'string' },
      apiKey: { type: 'string' },
    },
    required: ['query'],
  },
  headers: {
    'x-custom-auth': 'my-secret-token',
  },
  defaults: {
    sessionId: 'user-session-abc123',
    apiKey: 'secret-api-key',
  },
};
```

### MCP Tools

Connect to any [Model Context Protocol](https://modelcontextprotocol.io/) server. Subconscious discovers tools from the server, filters by your `allowedTools` list, and proxies calls automatically.

MCP servers requiring authentication accept an `auth` object:

| Method      | When to use                            | Header sent                                   |
| ----------- | -------------------------------------- | --------------------------------------------- |
| **Bearer**  | OAuth tokens, JWTs — most common       | `Authorization: Bearer <token>`               |
| **API key** | Service-specific API keys              | `<header>: <token>` (typically `X-Api-Key`)   |

```typescript
// Bearer auth (most common)
{ type: 'mcp', url: 'https://mcp.google.com/v1',
  auth: { type: 'bearer', token: 'your-oauth-token' } }

// API key auth
{ type: 'mcp', url: 'https://mcp.example.com',
  auth: { type: 'api_key', token: 'key123', header: 'X-Api-Key' } }
```

**`allowedTools` filtering:**

| Value                 | Behavior                              |
| --------------------- | ------------------------------------- |
| Omitted / `undefined` | All tools from the server are enabled |
| `["*"]`               | All tools enabled (explicit wildcard) |
| `["search", "fetch"]` | Only these tools (case-insensitive)   |
| `[]`                  | No tools (blocks all)                 |

### Structured Output

Get structured responses using JSON Schema. We recommend using [Zod](https://zod.dev) and converting with `zodToJsonSchema()`:

```typescript
import { z } from 'zod';
import { Subconscious, zodToJsonSchema } from 'subconscious';

const client = new Subconscious();

const AnalysisSchema = z.object({
  summary: z.string().describe('A brief summary of the findings'),
  keyPoints: z.array(z.string()).describe('Main takeaways'),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  confidence: z.number().describe('Confidence score from 0 to 1'),
});

const run = await client.run({
  engine: 'tim',
  input: {
    instructions: 'Analyze the latest news about electric vehicles',
    tools: [{ type: 'platform', id: 'web_search' }],
    answerFormat: zodToJsonSchema(AnalysisSchema, 'Analysis'),
  },
  options: { awaitCompletion: true },
});

const result = run.result?.answer as z.infer<typeof AnalysisSchema>;
console.log(result.summary);
```

Pass `reasoningFormat` to also structure the agent's reasoning trace:

```typescript
const ReasoningSchema = z.object({
  steps: z.array(z.object({ thought: z.string(), action: z.string() })),
  conclusion: z.string(),
});

const run = await client.run({
  engine: 'tim',
  input: {
    instructions: 'Research and explain quantum computing',
    tools: [{ type: 'platform', id: 'web_search' }],
    answerFormat: zodToJsonSchema(AnalysisSchema, 'Analysis'),
    reasoningFormat: zodToJsonSchema(ReasoningSchema, 'Reasoning'),
  },
  options: { awaitCompletion: true },
});
```

### Error Handling

```typescript
import {
  SubconsciousError,
  AuthenticationError,
  RateLimitError,
  RequestTooLargeError,
} from 'subconscious';

try {
  const run = await client.run({
    /* ... */
  });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.error('Rate limited, retry later');
  } else if (error instanceof RequestTooLargeError) {
    console.error('Payload over 5MB — split images across turns or upload via /v1/internal/attachments');
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

### Output Options

Control how results are delivered via `options.output`.

**Per-run webhook** — receive a POST to your server when the run reaches a terminal state:

```typescript
const run = await client.run({
  engine: 'tim',
  input: { instructions: 'Generate a report', tools: [] },
  options: {
    output: { callbackUrl: 'https://your-server.com/webhook' },
  },
});
```

**Response shape** — return only the final answer instead of the full reasoning tree:

```typescript
options: {
  output: { responseContent: 'answer_only' }, // 'full' (default) | 'answer_only'
}
```

## API Reference

### `Subconscious`

The main client class.

#### Constructor Options

| Option    | Type     | Required | Default                           |
| --------- | -------- | -------- | --------------------------------- |
| `apiKey`  | `string` | No\*     | —                                 |
| `baseUrl` | `string` | No       | `https://api-legacy.subconscious.dev/v1` |

\* If not passed, resolved from `SUBCONSCIOUS_API_KEY` env var or `~/.subcon/config.json`.

#### Methods

| Method                     | Description           |
| -------------------------- | --------------------- |
| `run(params)`              | Create a new run      |
| `stream(params, options?)` | Stream text deltas    |
| `get(runId)`               | Get run status        |
| `wait(runId, options?)`    | Poll until completion |
| `cancel(runId)`            | Cancel a running run  |

### Engines

| Engine             | Type     | Description                                                                      |
| ------------------ | -------- | -------------------------------------------------------------------------------- |
| `tim`              | Unified  | Flagship unified agent engine for a wide range of tasks                          |
| `tim-edge`         | Unified  | Highly efficient engine tuned for performance with search tools                  |
| `tim-claude`       | Compound | Complex reasoning engine backed by Anthropic Claude Sonnet                       |
| `tim-claude-heavy` | Compound | Complex reasoning engine backed by Anthropic Claude Opus                         |
| `tim-oss-local`    | Compound | Tool-calling engine for TIM-trained OSS models                                   |
| `tim-1.5`          | Compound | Tool-calling engine for large OSS models v1.5                                    |

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

- Documentation: https://docs.subconscious.dev
- Email: {hongyin,jack,dana,wei}@subconscious.dev
