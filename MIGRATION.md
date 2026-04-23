# Migration Guide: v0.x → v1.0

v1.0 brings the Node SDK in line with the Python SDK and the monorepo's canonical schemas. The release is **breaking** — no 0.x compat shims are included. This guide lists every public change.

If you only call `client.run`, `client.stream`, `client.get`, `client.wait`, and `client.cancel` with `engine: 'tim'` or `'tim-edge'`, your code will keep working unchanged.

## 1. `Run.usage` shape is flat now

**Before (0.x):**

```ts
type Usage = {
  models: ModelUsage[];
  platformTools: PlatformToolUsage[];
};
```

**After (1.0):**

```ts
type Usage = {
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
};
```

The `models[]` / `platformTools[]` nesting was never emitted by the API. Access tokens directly:

```ts
console.log(run.usage?.inputTokens, run.usage?.outputTokens);
```

## 2. `ReasoningNode` → `ReasoningTask` (renamed, field fixes)

**Before:**

```ts
type ReasoningNode = {
  title: string;
  thought: string;
  tooluse: unknown[];
  subtask: ReasoningNode[]; // singular, wrong
  conclusion: string;
};
```

**After:**

```ts
type ReasoningTask = {
  title?: string;
  thought?: string;
  tooluse?: AgentToolUse;       // object, not array
  subtasks?: ReasoningTask[];   // plural — fixes a bug
  conclusion?: string;
};

type AgentToolUse = {
  tool_name: string;
  tool_call_id?: string | null;
  parameters: Record<string, unknown>;
  tool_result?: unknown;
};
```

Also, `RunResult.reasoning` is now `ReasoningTask[]` (matches the wire format). If you were walking the tree:

```diff
- for (const sub of node.subtask ?? []) walk(sub);
+ for (const sub of node.subtasks ?? []) walk(sub);
```

And if you were treating `tooluse` as an array:

```diff
- for (const tu of node.tooluse ?? []) { console.log(tu.tool_name); }
+ if (node.tooluse) { console.log(node.tooluse.tool_name); }
```

`ReasoningNode` is removed. Import `ReasoningTask` instead.

## 3. `Run.error` is now typed

```ts
type Run = {
  runId: string;
  status?: RunStatus;
  result?: RunResult;
  usage?: Usage;
  error?: RunError;              // NEW
};

type RunError = { code: string; message: string };
```

Use it when `status === 'failed'`:

```ts
if (run.status === 'failed') {
  console.error(run.error?.code, run.error?.message);
}
```

## 4. `Engine` union updated

**Before:** `'tim-edge' | 'tim-gpt' | 'tim-gpt-heavy' | (string & {})`
**After:** `'tim' | 'tim-edge' | 'tim-claude' | 'tim-claude-heavy' | 'tim-oss-local' | 'tim-1.5' | 'tim-gpt-heavy-tc' | (string & {})`

Deprecated engines (`tim-gpt`, `tim-gpt-heavy`, `timini`) still resolve server-side to `tim-claude`, but are no longer in the type union. If you want to pin the replacement explicitly:

```diff
- engine: 'tim-gpt'
+ engine: 'tim-claude'
```

Unknown strings still compile because of the `(string & {})` escape hatch.

## 5. `PlatformTool.options` is optional

```diff
  type PlatformTool = {
    type: 'platform';
    id: string;
-   options: Record<string, unknown>;   // required
+   options?: Record<string, unknown>;  // optional
  };
```

You can now write:

```ts
tools: [{ type: 'platform', id: 'web_search' }];
```

Any existing `options: {}` calls keep working.

## 6. `FunctionTool` fields are optional where the API allows

`description`, `url`, `method` are now `?` on `FunctionTool`. `parameters` remains required.

## 7. New: multimodal content

`RunInput.content` accepts `ContentBlock[]` (text / image / audio / file). Use the `Image` helper:

```ts
import { Subconscious, Image } from 'subconscious';

await client.run({
  engine: 'tim-claude',
  input: {
    instructions: 'What is in this image?',
    content: [Image.fromPath('shot.png')],
  },
});
```

Constructors: `Image.fromPath` / `fromBytes` / `fromUrl` / `fromBlobRef`.

## 8. New: `resources`

Attach lifecycle-managed services (e.g. E2B sandbox):

```ts
input: {
  instructions: '...',
  resources: ['sandbox'],
}
```

## 9. New: `RequestTooLargeError`

The client now validates serialized body size before the network call. Anything over 5MB throws:

```ts
import { RequestTooLargeError } from 'subconscious';

try {
  await client.run({ ... });
} catch (e) {
  if (e instanceof RequestTooLargeError) {
    // Split images across turns or upload via /v1/internal/attachments first
  }
}
```

## 10. New: `ToolResponse` envelope type

If you build FunctionTool servers in TypeScript, you can type the response against the canonical envelope:

```ts
import type { ToolResponse } from 'subconscious';

const res: ToolResponse = {
  tool_call_id: req.body.tool_call_id,
  content: [{ type: 'text', text: 'ok' }],
  is_error: false,
};
```

## 11. New type exports

Now exported from the package root: `Image`, `ContentBlock`, `TextContent`, `ImageContent`, `AudioContent`, `FileContent`, `Source`, `SourceBase64`, `SourceBlobRef`, `SourceUrl`, `ToolResponse`, `RequestTooLargeError`, `AgentToolUse`, `ReasoningTask`, `RunError`, `PollOptions`.

Removed: `ReasoningNode`, `ModelUsage`, `PlatformToolUsage` — replaced by `ReasoningTask` / the new flat `Usage` shape.

## 12. `reasoningFormat` removed from `RunInput`

The `reasoningFormat` field is gone. If you were shaping the reasoning trace with a JSON/Zod schema, fold that guidance into your `instructions` or into `answerFormat` instead — the agent's final output is the contract, and the reasoning trace is best treated as a read-only byproduct.

**Before:**

```ts
await client.run({
  engine: 'tim',
  input: {
    instructions: '...',
    answerFormat: AnswerSchema,
    reasoningFormat: ReasoningSchema,
  },
});
```

**After:**

```ts
await client.run({
  engine: 'tim',
  input: {
    instructions: '...',
    answerFormat: AnswerSchema,
  },
});
```

Requests that still include `reasoningFormat` are rejected by the API.

## 13. `RunResult.parsedAnswer`

`result.answer` is always a `string` on the wire, even when `answerFormat` is supplied — the API JSON-encodes the structured value. The SDK now attaches a `parsedAnswer` companion field on every response that runs through the client (`run`, `get`, `wait`, `cancel`), populated via a best-effort `JSON.parse` of `answer`.

```ts
const run = await client.run({
  engine: 'tim',
  input: {
    instructions: 'return JSON for a person',
    answerFormat: z.object({ name: z.string(), age: z.number() }),
  },
  options: { awaitCompletion: true },
});

run.result?.answer;       // '{"name":"ada","age":36}'  (raw string)
run.result?.parsedAnswer; // { name: 'ada', age: 36 }    (decoded)
```

`parsedAnswer` is typed as `unknown` — cast or validate with your schema of choice. It is `undefined` when `answer` is empty or not valid JSON.

## Upgrading

```bash
pnpm add subconscious@^1
# or
npm install subconscious@^1
```

If you hit a rough edge, please [open an issue](https://github.com/subconscious-systems/subconscious-node/issues).
