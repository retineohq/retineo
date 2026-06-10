/**
 * RETINEO Core — Health & Ready Endpoint Tests
 * Phase 7
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { DefaultHealthService } from '../../packages/core/src/bridge/health.js';
import { DefaultMetricsService, createMetricsCounters } from '../../packages/core/src/bridge/metrics.js';
import { registerHealthRoutes } from '../../packages/core/src/bridge/routes-health.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import { LocalCASStorage } from '../../packages/core/src/storage/cas.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

describe('Health Endpoints', () => {
  let tmpDir: string;
  let registry: SQLiteRegistry;
  let cas: LocalCASStorage;
  let provider: MockLLMProvider;
  let healthService: DefaultHealthService;
  let metricsService: DefaultMetricsService;
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'retineo-health-'));
    const dbPath = path.join(tmpDir, 'registry.db');
    registry = new SQLiteRegistry(dbPath);
    cas = new LocalCASStorage(tmpDir);
    // Ensure objects dir exists so CAS check passes
    const { mkdirSync } = require('fs');
    mkdirSync(path.join(tmpDir, 'objects'), { recursive: true });
    provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'mock' });
    healthService = new DefaultHealthService({
      registry,
      cas,
      llmProvider: provider,
      indexDir: tmpDir,
    });
    metricsService = new DefaultMetricsService({
      registry,
      cas,
      indexDir: tmpDir,
      counters: createMetricsCounters(),
    });
    fastify = Fastify({ logger: false });
  });

  afterAll(() => {
    registry.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /v1/health returns healthy when all checks pass', async () => {
    await registerHealthRoutes(fastify, { healthService, metricsService });
    const res = await fastify.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string; checks: Record<string, boolean> };
    expect(body.status).toBe('healthy');
    expect(body.checks.sqlite).toBe(true);
    expect(body.checks.cas).toBe(true);
    expect(body.checks.llmProvider).toBe(true);
    expect(body.checks.worker).toBe(true);
    expect(body).toHaveProperty('timestamp');
  });

  it('GET /v1/ready returns 503 when index not loaded', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body) as { ready: boolean; indexLoaded: boolean; queueHealthy: boolean };
    expect(body.ready).toBe(false);
    expect(body.indexLoaded).toBe(false);
    expect(body.queueHealthy).toBe(true);
  });

  it('GET /v1/ready returns 200 when index exists', async () => {
    // Create embeddings.jsonl to satisfy index loaded check
    const { writeFile } = await import('fs/promises');
    await writeFile(path.join(tmpDir, 'embeddings.jsonl'), '{"hash":"a","vector":[1]}\n', 'utf-8');
    const res = await fastify.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ready: boolean };
    expect(body.ready).toBe(true);
  });

  it('GET /v1/ready returns 503 during shutdown', async () => {
    const shutdownHealth = new DefaultHealthService({
      registry,
      cas,
      llmProvider: provider,
      indexDir: tmpDir,
      shutdownManager: { isShuttingDown: () => true },
    });
    const shutdownFastify = Fastify({ logger: false });
    await registerHealthRoutes(shutdownFastify, { healthService: shutdownHealth, metricsService });
    const res = await shutdownFastify.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body) as { ready: boolean; reason: string };
    expect(body.ready).toBe(false);
    expect(body.reason).toContain('Shutdown');
  });
});
