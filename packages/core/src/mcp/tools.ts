/**
 * RETINEO Core — MCP Tools
 * Phase 5: Tool definitions for Model Context Protocol.
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}

export const RETINEO_SEARCH_TOOL: MCPTool = {
  name: 'retineo_search',
  description: 'Search the knowledge base for relevant context',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      language: { type: 'string', description: 'Query language (optional, auto-detected)' },
      topK: { type: 'number', description: 'Number of results (default 5)' },
    },
    required: ['query'],
  },
};

export const RETINEO_INGEST_TOOL: MCPTool = {
  name: 'retineo_ingest',
  description: 'Ingest a file into the knowledge base',
  inputSchema: {
    type: 'object',
    properties: {
      sourcePath: { type: 'string', description: 'Absolute path to file' },
      mimeType: { type: 'string', description: 'Optional MIME type override' },
    },
    required: ['sourcePath'],
  },
};

export const RETINEO_STATUS_TOOL: MCPTool = {
  name: 'retineo_status',
  description: 'Get RETINEO Core engine status',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const RETINEO_GET_NODE_TOOL: MCPTool = {
  name: 'retineo_get_node',
  description: 'Get a specific node by hash',
  inputSchema: {
    type: 'object',
    properties: {
      hash: { type: 'string', description: 'Content hash' },
    },
    required: ['hash'],
  },
};

export const ALL_TOOLS: MCPTool[] = [
  RETINEO_SEARCH_TOOL,
  RETINEO_INGEST_TOOL,
  RETINEO_STATUS_TOOL,
  RETINEO_GET_NODE_TOOL,
];
