/**
 * JSON Schema types for structured output.
 *
 * Use `zodToJsonSchema()` to convert a Zod schema to this format.
 */

/** Supported JSON Schema property types */
export type JSONSchemaProperty =
  | JSONSchemaString
  | JSONSchemaNumber
  | JSONSchemaBoolean
  | JSONSchemaArray
  | JSONSchemaObject
  | JSONSchemaEnum
  | JSONSchemaAnyOf;

export type JSONSchemaString = {
  type: 'string';
  description?: string;
  format?: 'date' | 'date-time' | 'email' | 'uuid';
  pattern?: string;
};

export type JSONSchemaNumber = {
  type: 'number' | 'integer';
  description?: string;
};

export type JSONSchemaBoolean = {
  type: 'boolean';
  description?: string;
};

export type JSONSchemaArray = {
  type: 'array';
  items: JSONSchemaProperty;
  description?: string;
};

export type JSONSchemaObject = {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required: string[];
  additionalProperties?: false;
  description?: string;
  $defs?: Record<string, unknown>;
};

export type JSONSchemaEnum = {
  type: 'string';
  enum: string[];
  description?: string;
};

export type JSONSchemaAnyOf = {
  anyOf: JSONSchemaProperty[];
  description?: string;
};

/**
 * The format expected by answerFormat and reasoningFormat.
 * A JSON Schema object with a title.
 */
export type OutputSchema = {
  $defs?: Record<string, unknown>;
  properties: Record<string, JSONSchemaProperty>;
  required: string[];
  title: string;
  type: 'object';
};

/**
 * Convert a Zod schema to the JSON Schema format expected by Subconscious.
 *
 * @param schema - A Zod object schema (z.object(...))
 * @param title - The title for the schema (required)
 * @returns A JSON Schema compatible with answerFormat/reasoningFormat
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { zodToJsonSchema } from 'subconscious';
 *
 * const schema = z.object({
 *   summary: z.string().describe('A brief summary'),
 *   score: z.number().describe('Score from 1-10'),
 *   tags: z.array(z.string()),
 * });
 *
 * const answerFormat = zodToJsonSchema(schema, 'AnalysisResult');
 *
 * const run = await client.run({
 *   engine: 'tim-large',
 *   input: {
 *     instructions: 'Analyze this article...',
 *     tools: [],
 *     answerFormat,
 *   },
 * });
 * ```
 */
export function zodToJsonSchema(schema: unknown, title: string): OutputSchema {
  // Handle Zod schema by accessing its internal shape
  const zodSchema = schema as {
    _def?: {
      typeName?: string;
      shape?: () => Record<string, unknown>;
    };
    shape?: Record<string, unknown>;
  };

  // Get the shape - Zod v3 uses _def.shape() function, some versions use .shape directly
  let shape: Record<string, unknown>;
  if (typeof zodSchema._def?.shape === 'function') {
    shape = zodSchema._def.shape();
  } else if (zodSchema.shape && typeof zodSchema.shape === 'object') {
    shape = zodSchema.shape as Record<string, unknown>;
  } else {
    throw new Error(
      'zodToJsonSchema expects a Zod object schema (z.object(...)). Received: ' +
        (zodSchema._def?.typeName || typeof schema),
    );
  }

  const properties: Record<string, JSONSchemaProperty> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const { property, isOptional } = convertZodField(field);
    properties[key] = property;
    if (!isOptional) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    title,
    properties,
    required,
  };
}

type ZodDef = {
  typeName?: string;
  description?: string;
  innerType?: { _def?: ZodDef };
  type?: { _def?: ZodDef };
  values?: string[] | Record<string, unknown>;
  options?: Array<{ _def?: ZodDef }>;
  checks?: Array<{ kind: string; value?: unknown }>;
  shape?: () => Record<string, unknown>;
};

type ZodField = {
  _def?: ZodDef;
  shape?: Record<string, unknown>;
};

function convertZodField(field: unknown): { property: JSONSchemaProperty; isOptional: boolean } {
  const zodField = field as ZodField;
  const def = zodField._def;

  if (!def?.typeName) {
    return { property: { type: 'string' }, isOptional: false };
  }

  let isOptional = false;
  let currentDef = def;

  // Unwrap optional and nullable
  while (
    currentDef.typeName === 'ZodOptional' ||
    currentDef.typeName === 'ZodNullable' ||
    currentDef.typeName === 'ZodDefault'
  ) {
    if (currentDef.typeName === 'ZodOptional') {
      isOptional = true;
    }
    currentDef = currentDef.innerType?._def || currentDef.type?._def || currentDef;
    if (!currentDef.typeName) break;
  }

  const description = currentDef.description;
  const property = convertType(currentDef, zodField);

  if (description && property) {
    (property as { description?: string }).description = description;
  }

  return { property, isOptional };
}

function convertType(def: ZodDef, field: ZodField): JSONSchemaProperty {
  switch (def.typeName) {
    case 'ZodString': {
      const prop: JSONSchemaString = { type: 'string' };
      // Check for format constraints
      const checks = def.checks || [];
      for (const check of checks) {
        if (check.kind === 'email') prop.format = 'email';
        if (check.kind === 'uuid') prop.format = 'uuid';
        if (check.kind === 'datetime') prop.format = 'date-time';
        if (check.kind === 'regex' && check.value) prop.pattern = String(check.value);
      }
      return prop;
    }

    case 'ZodNumber':
      return { type: 'number' };

    case 'ZodBoolean':
      return { type: 'boolean' };

    case 'ZodArray': {
      const itemsDef = def.type?._def;
      if (itemsDef) {
        return {
          type: 'array',
          items: convertType(itemsDef, { _def: itemsDef }),
        };
      }
      return { type: 'array', items: { type: 'string' } };
    }

    case 'ZodEnum': {
      const rawValues = def.values;
      if (!rawValues) {
        return { type: 'string', enum: [] };
      }
      // ZodEnum values are always string arrays
      const values = Array.isArray(rawValues) ? rawValues : [];
      return { type: 'string', enum: values.filter((v): v is string => typeof v === 'string') };
    }

    case 'ZodNativeEnum': {
      // Native enums store values differently - can be object or array
      const enumObj = def.values;
      if (!enumObj || typeof enumObj !== 'object') {
        return { type: 'string', enum: [] };
      }
      // Handle both array and object formats
      const values = Array.isArray(enumObj)
        ? enumObj
        : Object.values(enumObj as Record<string, unknown>);
      return { type: 'string', enum: values.filter((v): v is string => typeof v === 'string') };
    }

    case 'ZodObject': {
      // Nested object - recursively convert
      let shape: Record<string, unknown>;
      if (typeof def.shape === 'function') {
        shape = def.shape();
      } else if (field.shape && typeof field.shape === 'object') {
        shape = field.shape;
      } else {
        return { type: 'object', properties: {}, required: [] };
      }

      const properties: Record<string, JSONSchemaProperty> = {};
      const required: string[] = [];

      for (const [key, nestedField] of Object.entries(shape)) {
        const { property, isOptional } = convertZodField(nestedField);
        properties[key] = property;
        if (!isOptional) {
          required.push(key);
        }
      }

      return { type: 'object', properties, required };
    }

    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const options = def.options || [];
      const anyOf = options.map((opt) => {
        const optDef = opt._def;
        if (optDef) {
          return convertType(optDef, { _def: optDef });
        }
        return { type: 'string' } as JSONSchemaProperty;
      });
      return { anyOf };
    }

    case 'ZodLiteral': {
      // Literal string becomes enum with single value
      const value = (def as ZodDef & { value?: unknown }).value;
      if (typeof value === 'string') {
        return { type: 'string', enum: [value] };
      }
      if (typeof value === 'number') {
        return { type: 'number' };
      }
      if (typeof value === 'boolean') {
        return { type: 'boolean' };
      }
      return { type: 'string' };
    }

    default:
      // Fallback to string for unsupported types
      return { type: 'string' };
  }
}
