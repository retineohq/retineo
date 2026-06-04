/**
 * ECHO Core — Bridge Routes
 * Phase 7: Fastify route definitions with health/metrics.
 */

import type { FastifyInstance } from 'fastify';
import type { BridgeHandlersDeps } from './handlers.js';
import { createHandlers } from './handlers.js';
import type { HealthRoutesDeps } from './routes-health.js';
import { registerHealthRoutes } from './routes-health.js';

export async function registerRoutes(fastify: FastifyInstance, deps: BridgeHandlersDeps, healthDeps: HealthRoutesDeps) {
  const handlers = createHandlers(deps);

  fastify.post('/v1/search', handlers.search);
  fastify.post('/v1/search/stream', handlers.searchStream);
  fastify.post('/v1/ingest', handlers.ingest);
  fastify.get('/v1/status', handlers.status);
  fastify.get('/v1/nodes/:hash', handlers.getNode);
  fastify.get('/v1/sources/:id', handlers.getSource);
  fastify.get('/v1/jobs/:id', handlers.getJob);
  fastify.get('/v1/jobs/:id/events', handlers.jobEvents);

  await registerHealthRoutes(fastify, healthDeps);
}
