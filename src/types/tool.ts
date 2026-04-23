/**
 * Tool types — mirror the canonical Zod tool schemas in
 * `subconscious-monorepo/packages/common/schemas/index.ts`.
 */

export type PlatformTool = {
  type: 'platform';
  id: string;
  options?: Record<string, unknown>;
};

export type FunctionTool = {
  type: 'function';
  name: string;
  description?: string;
  url?: string;
  method?: 'GET' | 'POST';
  timeout?: number;
  parameters: Record<string, unknown>;
  /** HTTP headers sent when calling this tool's endpoint. */
  headers?: Record<string, string>;
  /** Parameter values hidden from the model and injected at call time. */
  defaults?: Record<string, unknown>;
};

/**
 * MCP Authentication. Translates to an HTTP header sent with every tool call:
 *   - Bearer:  `{ "Authorization": "Bearer <token>" }`
 *   - API key: `{ "<header>": "<token>" }`
 *
 * Bearer auth is the most common method (e.g. OAuth tokens). For API key auth,
 * the header is typically `X-Api-Key` but may vary — check the docs of the MCP
 * server you are connecting to.
 */
export type McpAuth = {
  type: 'bearer' | 'api_key';
  token: string;
  /** For `api_key` auth, the header name to send the token in (e.g. `X-Api-Key`). */
  header?: string;
};

export type MCPTool = {
  type: 'mcp';
  /** URL of the MCP server. */
  url: string;
  /**
   * Tool names to enable. Case-insensitive.
   *   - `["*"]` or omit for all tools.
   *   - `[]` blocks all.
   */
  allowedTools?: string[];
  auth?: McpAuth;
};

export type Tool = PlatformTool | FunctionTool | MCPTool;
