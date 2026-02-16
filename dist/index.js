// src/types/error.ts
var SubconsciousError = class extends Error {
  code;
  status;
  details;
  constructor(code, message, status, details) {
    super(message);
    this.name = "SubconsciousError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};
var AuthenticationError = class extends SubconsciousError {
  constructor(message = "Invalid API key") {
    super("authentication_failed", message, 401);
    this.name = "AuthenticationError";
  }
};
var RateLimitError = class extends SubconsciousError {
  constructor(message = "Rate limit exceeded") {
    super("rate_limited", message, 429);
    this.name = "RateLimitError";
  }
};
var NotFoundError = class extends SubconsciousError {
  constructor(message = "Resource not found") {
    super("not_found", message, 404);
    this.name = "NotFoundError";
  }
};
var ValidationError = class extends SubconsciousError {
  constructor(message, details) {
    super("invalid_request", message, 400, details);
    this.name = "ValidationError";
  }
};

// src/internal/http.ts
async function parseErrorResponse(res) {
  try {
    const body = await res.json();
    const { code, message, details } = body.error;
    switch (code) {
      case "authentication_failed":
        return new AuthenticationError(message);
      case "rate_limited":
        return new RateLimitError(message);
      case "not_found":
        return new NotFoundError(message);
      case "invalid_request":
        return new ValidationError(message, details);
      default:
        return new SubconsciousError(code, message, res.status, details);
    }
  } catch {
    return new SubconsciousError(
      mapStatusToCode(res.status),
      res.statusText || `HTTP ${res.status}`,
      res.status
    );
  }
}
function mapStatusToCode(status) {
  switch (status) {
    case 400:
      return "invalid_request";
    case 401:
      return "authentication_failed";
    case 403:
      return "permission_denied";
    case 404:
      return "not_found";
    case 429:
      return "rate_limited";
    case 503:
      return "service_unavailable";
    case 504:
      return "timeout";
    default:
      return "internal_error";
  }
}
async function request(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...opts.headers
    }
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return res.json();
}
async function requestStream(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: "text/event-stream",
      ...opts.headers
    }
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return res;
}

// src/internal/poll.ts
var TERMINAL_STATUSES = ["succeeded", "failed", "canceled", "timed_out"];
async function pollUntilComplete(url, headers, options = {}) {
  const { intervalMs = 1e3, maxAttempts, signal } = options;
  let attempts = 0;
  while (true) {
    if (signal?.aborted) {
      throw new Error("Polling aborted");
    }
    const run = await request(url, { headers, signal });
    if (run.status && TERMINAL_STATUSES.includes(run.status)) {
      return run;
    }
    attempts++;
    if (maxAttempts !== void 0 && attempts >= maxAttempts) {
      throw new Error(`Polling exceeded max attempts (${maxAttempts})`);
    }
    await sleep(intervalMs, signal);
  }
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeoutId);
          reject(new Error("Sleep aborted"));
        },
        { once: true }
      );
    }
  });
}

// src/stream.ts
async function* createStream(baseUrl, apiKey, params, options = {}) {
  const response = await requestStream(`${baseUrl}/runs/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      engine: params.engine,
      input: params.input
    }),
    signal: options.signal
  });
  let runId = response.headers.get("x-run-id") || "";
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let isError = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("event:")) {
          const eventType = trimmed.slice(6).trim();
          isError = eventType === "error";
          continue;
        }
        if (trimmed.startsWith("data:")) {
          const dataContent = trimmed.slice(5).trim();
          if (dataContent === "[DONE]") {
            yield { type: "done", runId };
            continue;
          }
          try {
            const payload = JSON.parse(dataContent);
            if (payload.run_id) {
              runId = payload.run_id;
              continue;
            }
            if (isError || payload.error) {
              yield {
                type: "error",
                runId,
                message: payload.details || payload.error || "Unknown error",
                code: payload.code
              };
              isError = false;
              continue;
            }
            const content = payload.choices?.[0]?.delta?.content;
            if (typeof content === "string" && content.length > 0) {
              yield { type: "delta", runId, content };
            }
          } catch {
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return runId ? { runId, status: "succeeded" } : void 0;
}

// src/client.ts
var Subconscious = class {
  baseUrl;
  apiKey;
  constructor(opts) {
    if (!opts.apiKey) {
      throw new Error("apiKey is required");
    }
    this.baseUrl = opts.baseUrl ?? "https://api.subconscious.dev/v1";
    this.apiKey = opts.apiKey;
  }
  /**
   * Create a new run.
   *
   * @param params.engine - The engine to use for the run
   * @param params.input - The input configuration including instructions and tools
   * @param params.options.awaitCompletion - If true, poll until the run completes
   * @returns The created run, optionally with results if awaitCompletion is true
   */
  async run(params) {
    const { runId } = await request(`${this.baseUrl}/runs`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({
        engine: params.engine,
        input: params.input
      })
    });
    if (!params.options?.awaitCompletion) {
      return { runId };
    }
    return this.wait(runId);
  }
  /**
    * Create a streaming run that yields text deltas as they arrive.
    *
    * @param params.engine - The engine to use for the run
    * @param params.input - The input configuration including instructions and tools
    * @param options.signal - AbortSignal to cancel the stream
    * @returns An async generator yielding delta, done, or error events
    *
    * @example
  * ```ts
  * const stream = client.stream({
  *   engine: "tim-gpt",
  *   input: { instructions: "...", tools: [] },
  * });
  *
  * for await (const event of stream) {
  *   if (event.type === 'delta') {
  *     process.stdout.write(event.content);
  *   }
  * }
  * ```
    */
  stream(params, options) {
    return createStream(this.baseUrl, this.apiKey, params, options);
  }
  /**
   * Get the current state of a run.
   *
   * @param runId - The ID of the run to retrieve
   */
  async get(runId) {
    return request(`${this.baseUrl}/runs/${runId}`, {
      headers: this.authHeaders()
    });
  }
  /**
   * Wait for a run to complete by polling.
   *
   * @param runId - The ID of the run to wait for
   * @param options.intervalMs - Polling interval in milliseconds (default: 1000)
   * @param options.maxAttempts - Maximum polling attempts before throwing
   * @param options.signal - AbortSignal to cancel polling
   */
  async wait(runId, options) {
    return pollUntilComplete(`${this.baseUrl}/runs/${runId}`, this.authHeaders(), options);
  }
  /**
   * Cancel a running run.
   *
   * @param runId - The ID of the run to cancel
   */
  async cancel(runId) {
    return request(`${this.baseUrl}/runs/${runId}/cancel`, {
      method: "POST",
      headers: this.authHeaders()
    });
  }
  authHeaders() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
};

// src/types/schema.ts
function zodToJsonSchema(schema, title) {
  const zodSchema = schema;
  let shape;
  if (typeof zodSchema._def?.shape === "function") {
    shape = zodSchema._def.shape();
  } else if (zodSchema.shape && typeof zodSchema.shape === "object") {
    shape = zodSchema.shape;
  } else {
    throw new Error(
      "zodToJsonSchema expects a Zod object schema (z.object(...)). Received: " + (zodSchema._def?.typeName || typeof schema)
    );
  }
  const properties = {};
  const required = [];
  for (const [key, field] of Object.entries(shape)) {
    const { property, isOptional } = convertZodField(field);
    properties[key] = property;
    if (!isOptional) {
      required.push(key);
    }
  }
  return {
    type: "object",
    title,
    properties,
    required
  };
}
function convertZodField(field) {
  const zodField = field;
  const def = zodField._def;
  if (!def?.typeName) {
    return { property: { type: "string" }, isOptional: false };
  }
  let isOptional = false;
  let currentDef = def;
  while (currentDef.typeName === "ZodOptional" || currentDef.typeName === "ZodNullable" || currentDef.typeName === "ZodDefault") {
    if (currentDef.typeName === "ZodOptional") {
      isOptional = true;
    }
    currentDef = currentDef.innerType?._def || currentDef.type?._def || currentDef;
    if (!currentDef.typeName) break;
  }
  const description = currentDef.description;
  const property = convertType(currentDef, zodField);
  if (description && property) {
    property.description = description;
  }
  return { property, isOptional };
}
function convertType(def, field) {
  switch (def.typeName) {
    case "ZodString": {
      const prop = { type: "string" };
      const checks = def.checks || [];
      for (const check of checks) {
        if (check.kind === "email") prop.format = "email";
        if (check.kind === "uuid") prop.format = "uuid";
        if (check.kind === "datetime") prop.format = "date-time";
        if (check.kind === "regex" && check.value) prop.pattern = String(check.value);
      }
      return prop;
    }
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray": {
      const itemsDef = def.type?._def;
      if (itemsDef) {
        return {
          type: "array",
          items: convertType(itemsDef, { _def: itemsDef })
        };
      }
      return { type: "array", items: { type: "string" } };
    }
    case "ZodEnum": {
      const rawValues = def.values;
      if (!rawValues) {
        return { type: "string", enum: [] };
      }
      const values = Array.isArray(rawValues) ? rawValues : [];
      return { type: "string", enum: values.filter((v) => typeof v === "string") };
    }
    case "ZodNativeEnum": {
      const enumObj = def.values;
      if (!enumObj || typeof enumObj !== "object") {
        return { type: "string", enum: [] };
      }
      const values = Array.isArray(enumObj) ? enumObj : Object.values(enumObj);
      return { type: "string", enum: values.filter((v) => typeof v === "string") };
    }
    case "ZodObject": {
      let shape;
      if (typeof def.shape === "function") {
        shape = def.shape();
      } else if (field.shape && typeof field.shape === "object") {
        shape = field.shape;
      } else {
        return { type: "object", properties: {}, required: [] };
      }
      const properties = {};
      const required = [];
      for (const [key, nestedField] of Object.entries(shape)) {
        const { property, isOptional } = convertZodField(nestedField);
        properties[key] = property;
        if (!isOptional) {
          required.push(key);
        }
      }
      return { type: "object", properties, required };
    }
    case "ZodUnion":
    case "ZodDiscriminatedUnion": {
      const options = def.options || [];
      const anyOf = options.map((opt) => {
        const optDef = opt._def;
        if (optDef) {
          return convertType(optDef, { _def: optDef });
        }
        return { type: "string" };
      });
      return { anyOf };
    }
    case "ZodLiteral": {
      const value = def.value;
      if (typeof value === "string") {
        return { type: "string", enum: [value] };
      }
      if (typeof value === "number") {
        return { type: "number" };
      }
      if (typeof value === "boolean") {
        return { type: "boolean" };
      }
      return { type: "string" };
    }
    default:
      return { type: "string" };
  }
}
export {
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  Subconscious,
  SubconsciousError,
  ValidationError,
  zodToJsonSchema
};
