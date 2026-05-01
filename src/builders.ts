import { coerceAnswerFormat } from './types/schema.js';
import type {
  FunctionTool,
  MCPAuth,
  MCPTool,
  PlatformTool,
  ResourceTool,
} from './types/tool.js';

/**
 * Tool builders (R11). Tiny helpers that turn the discriminated-union
 * verbosity of `Tool` into a one-call API while preserving full type
 * safety. Use these in preference to building tool literals by hand.
 *
 * @example
 * ```ts
 * import { tools } from 'subconscious';
 *
 * const input = {
 *   instructions: 'Search the web for X and write to my sandbox',
 *   tools: [
 *     tools.platform('parallel_search'),
 *     tools.resource('sandbox'),
 *     tools.function({
 *       name: 'sendEmail',
 *       description: 'Send an email',
 *       url: 'https://api.example.com/email',
 *       parameters: EmailSchema,           // Zod or JSON Schema
 *       defaults: { sender_id: 'svc_abc' }, // hidden from model (R12)
 *       headers: { Authorization: 'Bearer …' },
 *     }),
 *     tools.mcp({
 *       url: 'https://mcp.example.com',
 *       headers: { Authorization: 'Bearer …' }, // R7
 *     }),
 *   ],
 * };
 * ```
 */
export const tools = {
  platform(id: string, options?: Record<string, unknown>): PlatformTool {
    return options ? { type: 'platform', id, options } : { type: 'platform', id };
  },

  /**
   * Function tool. `parameters` accepts a Zod schema OR a raw JSON Schema
   * object. (R13.) Defaults declared here are merged into the dispatched
   * body server-side; consumers can omit them from `parameters` and they
   * will be auto-promoted at SDK normalization time. (R12.)
   */
  function(args: {
    name: string;
    description?: string;
    url: string;
    parameters: unknown;
    headers?: Record<string, string>;
    defaults?: Record<string, unknown>;
  }): FunctionTool {
    const schema = coerceAnswerFormat(args.parameters, args.name);
    return {
      type: 'function',
      function: {
        name: args.name,
        ...(args.description ? { description: args.description } : {}),
        url: args.url,
        parameters: schema,
        ...(args.headers ? { headers: args.headers } : {}),
        ...(args.defaults ? { defaults: args.defaults } : {}),
      },
    };
  },

  /**
   * MCP (Model Context Protocol) tool. Use `headers` for header-based
   * auth (R7) or `auth` for the structured Bearer / API-key shape.
   */
  mcp(args: {
    url: string;
    allowedTools?: string[];
    headers?: Record<string, string>;
    auth?: MCPAuth;
  }): MCPTool {
    return {
      type: 'mcp',
      url: args.url,
      ...(args.allowedTools ? { allowedTools: args.allowedTools } : {}),
      ...(args.headers ? { headers: args.headers } : {}),
      ...(args.auth ? { auth: args.auth } : {}),
    };
  },

  /**
   * Hosted runtime resource — sandbox, memory, or browser. (R17.)
   */
  resource(id: ResourceTool['id']): ResourceTool {
    return { type: 'resource', id };
  },
};
