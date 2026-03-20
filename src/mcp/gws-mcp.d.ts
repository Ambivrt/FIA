declare module "@alanse/mcp-server-google-workspace/dist/tools/index.js" {
  interface GwsMcpTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }
  export const tools: GwsMcpTool[];
}
