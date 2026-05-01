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

## Quick start

```ts
import { Subconscious, tools } from 'subconscious';
import { z } from 'zod';

const client = new Subconscious({ apiKey: process.env.SUBCONSCIOUS_API_KEY! });

const Summary = z.object({
  summary: z.string(),
  score: z.number(),
});

// Block until done — type-narrowed by the answerFormat schema:
const run = await client.runAndWait<{ summary: string; score: number }>({
  engine: 'tim-claude',
  input: {
    instructions: 'Summarize and score this article: …',
    tools: [tools.platform('parallel_search')],
    answerFormat: Summary, // pass Zod directly
  },
});

console.log(run.result?.answer.summary); // string, typed
console.log(run.result?.answer.score);   // number, typed
```

## Three ways to start a run

### 1. Fire-and-forget — `client.run`

Returns the `runId` immediately. Use this when a background process polls or
when you've persisted the run id and will pick it up later.

```ts
const { runId } = await client.run({
  engine: 'tim-claude',
  input: { instructions: 'Search AI news' },
});

await db.insert({ runId, status: 'queued' });
```

### 2. Block until done — `client.runAndWait`

Creates the run and polls until it reaches a terminal state.

```ts
const run = await client.runAndWait({
  engine: 'tim-claude',
  input: { instructions: 'Search AI news' },
});

console.log(run.result?.answer);
```

### 3. Stream — `client.stream`

Returns an async iterable of typed events. The first event is always
`started` (carrying `runId`); the last is always `done`. Exactly one
`result` (success) or `error` (failure) event fires before `done`.

```ts
for await (const event of client.stream({
  engine: 'tim-claude',
  input: { instructions: 'Write an essay about ravens' },
})) {
  switch (event.type) {
    case 'started':
      console.log('runId:', event.runId);
      break;
    case 'delta':
      process.stdout.write(event.content);
      break;
    case 'reasoning_node':
      console.log('\nstep:', event.node.title);
      break;
    case 'tool_call':
      console.log('tool:', event.call.tool_name, event.call.parameters);
      break;
    case 'result':
      console.log('\nfinal answer:', event.result.answer);
      break;
    case 'error':
      console.error(`[${event.code}] ${event.message}`);
      break;
  }
}
```

## Re-attaching to a run — `client.observe`

Pick up a live or already-finished run and stream its events from the
durable buffer. Same wire format as `stream()`. Useful when a worker
restarts.

```ts
const { runId } = await client.run({ engine: 'tim-claude', input });
await db.persist(runId);

// … later, possibly in a different process:
for await (const event of client.observe(runId)) {
  if (event.type === 'result') console.log(event.result.answer);
}
```

## Tools

Use the `tools` builder to construct tool blocks without juggling the
discriminated union by hand:

```ts
import { tools } from 'subconscious';
import { z } from 'zod';

const input = {
  instructions: 'Look up customers and send a follow-up email',
  tools: [
    // Hosted platform tools (search, summarize, etc.)
    tools.platform('parallel_search'),

    // Hosted runtime resources — sandbox / memory / browser
    tools.resource('sandbox'),

    // Function tools the engine dispatches via HTTP POST
    tools.function({
      name: 'sendEmail',
      url: 'https://api.example.com/email',
      parameters: z.object({
        to: z.string(),
        body: z.string(),
      }),
      // Hidden values merged into the dispatched body. The model never
      // sees these and the SDK auto-promotes them into `parameters` so
      // the engine has a complete schema:
      defaults: { sender_id: 'svc_abc' },
      headers: { Authorization: 'Bearer xyz' },
    }),

    // MCP servers — supports header-based auth (no URL placeholder hacks)
    tools.mcp({
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer xyz' },
    }),
  ],
};
```

### Client-level FunctionTool overlays

Avoid duplicating shared auth on every function tool:

```ts
const client = new Subconscious({
  apiKey: process.env.SUBCONSCIOUS_API_KEY!,
  defaultFunctionToolHeaders: { Authorization: 'Bearer xyz' },
  defaultFunctionToolDefaults: { tenant_id: 't_abc' },
});
```

Per-tool values win on conflict.

## Structured output

Pass a Zod schema directly — the SDK converts it for you:

```ts
import { z } from 'zod';

const Result = z.object({
  summary: z.string(),
  score: z.number(),
});

const run = await client.runAndWait<{ summary: string; score: number }>({
  engine: 'tim-claude',
  input: {
    instructions: 'Rate this article…',
    answerFormat: Result,
  },
});

run.result?.answer.summary; //   string, typed
```

You can still pass a hand-built JSON Schema if you'd rather not depend
on Zod. `zodToJsonSchema()` is exported but seldom needed.

## Cancelling a run

`client.cancel(runId)` is **idempotent**. You can call it whether the run
is running, queued, or already terminal — it returns the run's current
shape with a 200. Errors are only thrown for network / auth failures, so
you don't need a `.catch(() => undefined)` wrap for the common case.

```ts
const { runId } = await client.run({ engine, input });
// safe to call regardless of state:
await client.cancel(runId);
await client.cancel(runId); // also safe
```

## Error codes (R5)

Every `error` stream event and every thrown `SubconsciousError` carries a
canonical `code` from the `ErrorCode` enum:

```ts
type ErrorCode =
  | 'invalid_request'
  | 'authentication_failed'
  | 'permission_denied'
  | 'not_found'
  | 'rate_limited'
  | 'internal_error'
  | 'service_unavailable'
  | 'timeout'
  | 'canceled';
```

Pattern-match on `code`, never on `message.includes(...)`.

## Engines

The SDK accepts any engine name as a string; canonical live names are:

- `tim`, `tim-edge`
- `tim-claude`, `tim-claude-heavy`
- `tim-omni`, `tim-omni-mini`

Legacy names (`tim-large`, `tim-gpt`, `tim-small`, `timini`, …) are still
accepted and resolved to a live engine server-side.

## Back-compat & deprecations

The SDK keeps a thin compatibility shim for callers from before the
run/runAndWait split and the wire-format normalization. Existing code
keeps working without changes; new code should reach for the new
spellings:

### `options.awaitCompletion` — deprecated

The single-method `client.run({ ..., options: { awaitCompletion: true } })`
shape from older releases is still accepted. It transparently routes
through `client.runAndWait()` and emits a one-shot `console.warn` so the
deprecation is visible in dev. Migrate by calling `runAndWait()` directly:

```ts
// Before (still works, prints a deprecation warning once):
const run = await client.run({
  engine: 'tim-claude',
  input,
  options: { awaitCompletion: true },
});

// After:
const run = await client.runAndWait({ engine: 'tim-claude', input });
```

`RunOptions` will be removed in a future minor release.

### Wire-format `runId`

The canonical SSE event payload key is `runId` (camelCase, matching REST
responses). The SDK also accepts the legacy snake_case `run_id` shape so
callers running against older API builds keep working — but emitters
inside this codebase should always write `runId`.

### Error code spelling: `canceled` (one `l`)

`ErrorCode` and `RunStatus` both use `canceled` (one `l`). The earlier
double-`l` `cancelled` form was removed.

## License

Apache-2.0. See `LICENSE`.
