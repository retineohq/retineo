/**
 * ECHO Core — MCP Server
 * Phase 5: Model Context Protocol server over stdio.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ALL_TOOLS } from './tools.js';
import { createHandlers } from './handlers.js';
import type { MCPHandlersDeps } from './handlers.js';

export interface MCPServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface MCPServerOptions {
  deps: MCPHandlersDeps;
}

export class EchoMCPServer implements MCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private deps: MCPHandlersDeps;

  constructor(opts: MCPServerOptions) {
    this.deps = opts.deps;
    this.server = new Server(
      { name: 'echo-core', version: opts.deps.version },
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
      if (!handler) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${String(name)}` }],
          isError: true,
        };
      }
      try {
        const args = request.params.arguments ?? {};
        const result = await (handler as (args: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>)(args);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
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
