/**
 * ECHO Core — Bridge Server
 * Phase 5: Fastify-based HTTP server (localhost-only).
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerRoutes } from './routes.js';
import type { BridgeHandlersDeps } from './handlers.js';

export interface BridgeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPort(): number;
}

export interface BridgeServerOptions {
  port?: number;
  host?: string;
  deps: BridgeHandlersDeps;
}

export class FastifyBridgeServer implements BridgeServer {
  private fastify: FastifyInstance;
  private port: number;
  private host: string;
  private deps: BridgeHandlersDeps;

  constructor(opts: BridgeServerOptions) {
    this.port = opts.port ?? 37891;
    this.host = opts.host ?? '127.0.0.1';
    this.deps = opts.deps;
    this.fastify = Fastify({
      logger: false,
      bodyLimit: 1048576, // 1 MB
    });
  }

  async start(): Promise<void> {
    await registerRoutes(this.fastify, this.deps);
    await this.fastify.listen({ port: this.port, host: this.host });
  }

  async stop(): Promise<void> {
    await this.fastify.close();
  }

  getPort(): number {
    const address = this.fastify.server.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    return this.port;
  }
}
