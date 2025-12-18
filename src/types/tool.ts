export type PlatformTool = {
  type: "platform";
  id: string;
  options: Record<string, unknown>;
};

export type FunctionTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type MCPTool = {
  type: "mcp";
  url: string;
  allow?: string[];
};

export type Tool = PlatformTool | FunctionTool | MCPTool;

