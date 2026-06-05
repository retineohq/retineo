/**
 * ECHO Core — Health & Metrics Routes
 * Phase 7: Register /v1/health, /v1/ready, /v1/metrics.
 */

import type { FastifyInstance } from 'fastify';
import type { HealthService } from './health.js';
import type { MetricsService } from './metrics.js';
import { formatPrometheus } from './metrics.js';

export interface HealthRoutesDeps {
  healthService: HealthService;
  metricsService: MetricsService;
}

export async function registerHealthRoutes(fastify: FastifyInstance, deps: HealthRoutesDeps) {
  fastify.get('/v1/health', async (_req, reply) => {
    const result = await deps.healthService.check();
    const statusCode = result.status === 'healthy' ? 200 : 503;
    return reply.status(statusCode).send(result);
  });

  fastify.get('/v1/ready', async (_req, reply) => {
    const result = await deps.healthService.ready();
    const statusCode = result.ready ? 200 : 503;
    return reply.status(statusCode).send(result);
  });

  fastify.get('/v1/metrics', async (_req, reply) => {
    const snapshot = await deps.metricsService.collect();
    return reply.send(snapshot);
  });

  fastify.get('/v1/metrics/prometheus', async (_req, reply) => {
    const snapshot = await deps.metricsService.collect();
    const text = formatPrometheus(snapshot);
    return reply.type('text/plain').send(text);
  });
}
