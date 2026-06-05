/**
 * ECHO Core — Metrics Endpoint Tests
 * Phase 7
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { DefaultMetricsService, createMetricsCounters, formatPrometheus } from '../../packages/core/src/bridge/metrics.js';
import { DefaultHealthService } from '../../packages/core/src/bridge/health.js';
import { registerHealthRoutes } from '../../packages/core/src/bridge/routes-health.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import { LocalCASStorage } from '../../packages/core/src/storage/cas.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

describe('Metrics Endpoints', () => {
  let tmpDir: string;
  let registry: SQLiteRegistry;
  let cas: LocalCASStorage;
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'echo-metrics-'));
    registry = new SQLiteRegistry(path.join(tmpDir, 'registry.db'));
    cas = new LocalCASStorage(tmpDir);
    const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'mock' });
    const counters = createMetricsCounters();
    counters.searchTotal = 10;
    counters.searchDurationMs = 500;
    counters.llmRequests = 20;
    counters.llmErrors = 1;
    counters.llmLatencyMs = 2000;
    counters.adapterIngests = { text: 5, pdf: 3 };

    const metricsService = new DefaultMetricsService({ registry, cas, indexDir: tmpDir, counters });
    const healthService = new DefaultHealthService({ registry, cas, llmProvider: provider, indexDir: tmpDir });
    fastify = Fastify({ logger: false });
    registerHealthRoutes(fastify, { healthService, metricsService });
  });

  afterAll(() => {
    registry.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /v1/metrics returns JSON snapshot', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/metrics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      nodes: number;
      sources: number;
      jobs: { pending: number; running: number; completed: number; failed: number };
      searches: { total: number; avgDurationMs: number };
      llm: { requests: number; errors: number; avgLatencyMs: number };
      adapters: Record<string, number>;
    };
    expect(body.nodes).toBe(0);
    expect(body.searches.total).toBe(10);
    expect(body.searches.avgDurationMs).toBe(50);
    expect(body.llm.requests).toBe(20);
    expect(body.llm.errors).toBe(1);
    expect(body.llm.avgLatencyMs).toBe(100);
    expect(body.adapters.text).toBe(5);
    expect(body.adapters.pdf).toBe(3);
  });

  it('GET /v1/metrics/prometheus returns text format', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/metrics/prometheus' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    const text = res.body as string;
    expect(text).toContain('echo_nodes');
    expect(text).toContain('echo_searches_total');
    expect(text).toContain('echo_llm_requests_total');
    expect(text).toContain('echo_adapter_ingests_total{adapter="text"}');
  });
});

describe('formatPrometheus', () => {
  it('formats snapshot correctly', () => {
    const snapshot = {
      nodes: 5,
      sources: 5,
      jobs: { pending: 1, running: 2, completed: 3, failed: 0 },
      index: { vectorCount: 100, lastIndexed: '2024-01-01' },
      adapters: { text: 10 },
      searches: { total: 20, avgDurationMs: 30 },
      llm: { requests: 40, errors: 2, avgLatencyMs: 100 },
    };
    const text = formatPrometheus(snapshot);
    expect(text).toContain('echo_nodes 5');
    expect(text).toContain('echo_jobs_pending 1');
    expect(text).toContain('echo_jobs_running 2');
    expect(text).toContain('echo_index_vectors 100');
    expect(text).toContain('echo_searches_total 20');
    expect(text).toContain('echo_llm_errors_total 2');
    expect(text).toContain('echo_adapter_ingests_total{adapter="text"} 10');
  });
});
