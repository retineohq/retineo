/**
 * ECHO Core — Bridge Routes
 * Phase 5: Fastify route definitions.
 */

import type { FastifyInstance } from 'fastify';
import type { BridgeHandlersDeps } from './handlers.js';
import { createHandlers } from './handlers.js';

export async function registerRoutes(fastify: FastifyInstance, deps: BridgeHandlersDeps) {
  const handlers = createHandlers(deps);

  fastify.post('/v1/search', handlers.search);
  fastify.post('/v1/search/stream', handlers.searchStream);
  fastify.post('/v1/ingest', handlers.ingest);
  fastify.get('/v1/status', handlers.status);
  fastify.get('/v1/nodes/:hash', handlers.getNode);
  fastify.get('/v1/sources/:id', handlers.getSource);
  fastify.get('/v1/jobs/:id', handlers.getJob);
  fastify.get('/v1/jobs/:id/events', handlers.jobEvents);
}
