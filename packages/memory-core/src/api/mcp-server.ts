import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { MemoryCore } from '../core/memory-core.js';
import type { QueryEngine } from '../core/query-engine.js';

const TOOLS = [
  {
    name: 'memory_get_object',
    description: 'Get object by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'memory_get_claim',
    description: 'Get claim by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'memory_get_context',
    description: 'Get context by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'memory_create_object',
    description: 'Create a memory object',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['type', 'name'],
    },
  },
  {
    name: 'memory_query_entry_points',
    description: 'Find entry points by essence matching',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: { type: 'string', enum: ['summary', 'essence_nl', 'essence_structured', 'embedding'] },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_query_knowledge',
    description: 'Query claims and relationships by keyword',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'memory_query_context',
    description: 'Reconstruct context from a start object',
    inputSchema: {
      type: 'object',
      properties: {
        startObjectId: { type: 'string' },
        maxDepth: { type: 'number' },
      },
      required: ['startObjectId'],
    },
  },
  {
    name: 'memory_get_journal',
    description: 'Get journal events',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'memory_get_segment',
    description: 'Get segment by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
];

export interface MCPServerOptions {
  core: MemoryCore;
  engine: QueryEngine;
}

export class MemoryCoreMCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private core: MemoryCore;
  private engine: QueryEngine;

  constructor(options: MCPServerOptions) {
    this.core = options.core;
    this.engine = options.engine;
    this.server = new Server(
      { name: 'retineo-memory-core', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    this.transport = new StdioServerTransport();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params as any;
      try {
        const result = await this.callTool(name, args ?? {});
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  private async callTool(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      case 'memory_get_object':
        return this.core.getObject(args.id);
      case 'memory_get_claim':
        return this.core.getClaim(args.id);
      case 'memory_get_context':
        return this.core.getContext(args.id);
      case 'memory_create_object':
        return this.core.createObject({
          type: args.type,
          name: args.name,
          actor: 'mcp',
        });
      case 'memory_query_entry_points':
        return this.engine.findEntryPoints(args.query, args.type ?? 'essence_nl');
      case 'memory_query_knowledge':
        return this.engine.knowledgeQuery(args.query);
      case 'memory_query_context':
        return this.engine.reconstructContext(args.startObjectId, args.maxDepth ?? 3);
      case 'memory_get_journal':
        return this.core.getJournal();
      case 'memory_get_segment':
        return this.core.getSegment(args.id);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async start(): Promise<void> {
    await this.server.connect(this.transport);
  }
}
