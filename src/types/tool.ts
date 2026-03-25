export type PlatformTool = {
  type: 'platform';
  id: string;
  options: Record<string, unknown>;
};

export type FunctionTool = {
  type: 'function';
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST';
  timeout?: number;
  parameters: Record<string, unknown>;
  headers?: Record<string, string>;
  defaults?: Record<string, unknown>;
};

export type McpAuth = {
  type: 'bearer' | 'api_key';
  token?: string;
  /** For api_key auth, the header name to send the token in. */
  header?: string;
};

export type MCPTool = {
  type: 'mcp';
  /** URL of the MCP server. */
  server: string;
  /**
   * Tool names to enable. Case-insensitive.
   * - `["*"]` or omit for all tools.
   * - `[]` blocks all.
   */
  allowedTools?: string[];
  /** Optional authentication for the MCP server. */
  auth?: McpAuth;
};

export type Tool = PlatformTool | FunctionTool | MCPTool;
