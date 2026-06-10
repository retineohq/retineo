/**
 * RETINEO Core — MCP Server
 * Phase 5: Model Context Protocol server over stdio.
 */

import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ALL_TOOLS } from './tools.js';
import { createHandlers } from './handlers.js';
import type { MCPHandlersDeps } from './handlers.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface MCPServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface MCPServerOptions {
  deps: MCPHandlersDeps;
  logger?: Logger;
}

export class RetineoMCPServer implements MCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private deps: MCPHandlersDeps;
  private logger: Logger;

  constructor(opts: MCPServerOptions) {
    this.deps = opts.deps;
    this.logger = opts.logger ?? getGlobalLogger().child({ layer: 'mcp' });
    this.server = new Server(
      { name: 'retineo', version: opts.deps.version },
      { capabilities: { tools: {} } }
    );
    this.transport = new StdioServerTransport();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: ALL_TOOLS };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const handlers = createHandlers(this.deps);
      const name = request.params.name as keyof typeof handlers;
      const handler = handlers[name];
      const traceId = randomUUID();
      this.logger.info('mcp.tool.call', { traceId, tool: String(name) });
      if (!handler) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${String(name)}` }],
          isError: true,
        };
      }
      try {
        const args = request.params.arguments ?? {};
        const result = await (handler as (args: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>)(args);
        this.logger.info('mcp.tool.result', { traceId, tool: String(name), isError: result.isError ?? false });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('mcp.tool.result', { traceId, tool: String(name), error: msg });
        return {
          content: [{ type: 'text', text: `Error: ${msg}` }],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    await this.server.connect(this.transport);
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}
