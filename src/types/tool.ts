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
export type MCPTool = {
  type: 'mcp';
  url: string;
  allow?: string[];
};

export type Tool = PlatformTool | FunctionTool | MCPTool;
