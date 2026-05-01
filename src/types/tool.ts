/**
 * Tool definitions — one envelope per kind. The discriminator (`type`) is
 * the same axis the API uses, and matches `@subconscious/common` 1:1.
 *
 * Stream Events v2 (R7, R17) adds:
 *  - `MCPTool.headers` — arbitrary header-based auth that mirrors
 *    FunctionTool.headers. Use this in preference to URL placeholder
 *    substitution like `https://mcp.example.com/?api_key={api_key}`.
 *  - `ResourceTool` — hosted runtime resources (sandbox, memory, browser)
 *    promoted to first-class tool blocks.
 */

export type PlatformTool = {
  type: 'platform';
  id: string;
  options?: Record<string, unknown>;
};

export type FunctionTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    /** JSON Schema for tool parameters. */
    parameters: Record<string, unknown>;
    /**
     * URL the API POSTs to when the engine invokes this tool. The body is
     * flat JSON keyed by parameter name (no `tool_name` envelope).
     */
    url: string;
    /**
     * Header-based auth forwarded as-is on every dispatch. Use this for
     * Bearer tokens, X-Api-Key headers, etc.
     */
    headers?: Record<string, string>;
    /**
     * Hidden parameter values merged into the dispatched body server-side
     * before the tool sees it. The model never sees these values; they are
     * not declared in `parameters` and not sent to the engine. (R12.)
     *
     * Example: `defaults: { user_id: 'u_1234' }` lets the tool receive a
     * scoped user_id without surfacing it in the schema.
     */
    defaults?: Record<string, unknown>;
  };
};

/**
 * Bearer / API-key authentication for an MCP tool.
 */
export type MCPAuth =
  | { type: 'bearer'; token: string }
  | { type: 'api_key'; token: string; header?: string };

export type MCPTool = {
  type: 'mcp';
  url: string;
  /** Tool names to expose. `["*"]` or omit to expose all. `[]` blocks all. */
  allowedTools?: string[];
  /** Header-based auth forwarded on every MCP request. (R7.) */
  headers?: Record<string, string>;
  /** Bearer / API-key auth via dedicated `auth` block. */
  auth?: MCPAuth;
};

/**
 * Hosted runtime resource. The server materializes this into one or more
 * function tools (`Sandbox.exec`, `Browser.openTab`, …) before dispatch.
 * (R17.)
 */
export type ResourceTool = {
  type: 'resource';
  id: 'sandbox' | 'memory' | 'browser';
};

export type Tool = PlatformTool | FunctionTool | MCPTool | ResourceTool;
