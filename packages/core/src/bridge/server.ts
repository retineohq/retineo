/**
 * ECHO Core — Bridge Server
 * Phase 7: Fastify-based HTTP server with health routes.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerRoutes } from './routes.js';
import type { BridgeHandlersDeps } from './handlers.js';
import type { HealthRoutesDeps } from './routes-health.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface BridgeServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPort(): number;
}

export interface BridgeServerOptions {
  port?: number;
  host?: string;
  deps: BridgeHandlersDeps;
  healthDeps: HealthRoutesDeps;
  logger?: Logger;
  shutdownManager?: { isShuttingDown(): boolean };
}

export class FastifyBridgeServer implements BridgeServer {
  private fastify: FastifyInstance;
  private port: number;
  private host: string;
  private deps: BridgeHandlersDeps;
  private healthDeps: HealthRoutesDeps;
  private logger: Logger;
  private shutdownManager?: { isShuttingDown(): boolean };

  constructor(opts: BridgeServerOptions) {
    this.port = opts.port ?? 37891;
    this.host = opts.host ?? '127.0.0.1';
    this.deps = opts.deps;
    this.healthDeps = opts.healthDeps;
    this.logger = opts.logger ?? getGlobalLogger().child({ layer: 'bridge' });
    this.shutdownManager = opts.shutdownManager;
    this.fastify = Fastify({
      logger: false,
      bodyLimit: 1048576,
    });

    this.fastify.addHook('onRequest', async (req, reply) => {
      if (this.shutdownManager?.isShuttingDown()) {
        void reply.code(503).send({ error: 'Service unavailable — shutting down' });
      }
    });
  }

  async start(): Promise<void> {
    await registerRoutes(this.fastify, this.deps, this.healthDeps);
    await this.fastify.listen({ port: this.port, host: this.host });
    this.logger.info('http.request', { status: 'server.start', port: this.port, host: this.host });
  }

  async stop(): Promise<void> {
    await this.fastify.close();
    this.logger.info('http.response', { status: 'server.stop' });
  }

  getPort(): number {
    const address = this.fastify.server.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    return this.port;
  }
}
