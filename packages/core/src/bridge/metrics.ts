/**
 * RETINEO Core — Metrics Service
 * Phase 7: Operational metrics for monitoring.
 */

import type { Registry } from '../storage/registry.js';
import type { CASStorage } from '../storage/cas.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface MetricsSnapshot {
  nodes: number;
  sources: number;
  jobs: { pending: number; running: number; completed: number; failed: number };
  index: { vectorCount: number; lastIndexed: string };
  adapters: Record<string, number>;
  searches: { total: number; avgDurationMs: number };
  llm: { requests: number; errors: number; avgLatencyMs: number };
}

export interface MetricsService {
  collect(): Promise<MetricsSnapshot>;
}

export interface MetricsCounters {
  searchTotal: number;
  searchDurationMs: number;
  llmRequests: number;
  llmErrors: number;
  llmLatencyMs: number;
  adapterIngests: Record<string, number>;
}

export interface MetricsServiceDeps {
  registry: Registry;
  cas: CASStorage;
  indexDir: string;
  counters: MetricsCounters;
}

export class DefaultMetricsService implements MetricsService {
  private deps: MetricsServiceDeps;

  constructor(deps: MetricsServiceDeps) {
    this.deps = deps;
  }

  async collect(): Promise<MetricsSnapshot> {
    const sources = this.deps.registry.listSources();
    const pending = this.deps.registry.getPendingJobs(10000);

    // Approximate running jobs via any-cast (registry has private getJob)
    const registryAny = this.deps.registry as unknown as {
      db?: { prepare: (sql: string) => { all: () => Array<Record<string, unknown>> } };
    };
    let running = 0;
    let completed = 0;
    let failed = 0;
    if (registryAny.db) {
      const rows = registryAny.db.prepare("SELECT status, COUNT(*) as c FROM jobs GROUP BY status").all();
      for (const row of rows) {
        const count = Number(row.c);
        if (row.status === 'RUNNING') running = count;
        else if (row.status === 'COMPLETED') completed = count;
        else if (row.status === 'DEAD') failed = count;
      }
    }

    const vectorCount = await this.countVectors();
    const counters = this.deps.counters;

    const searchTotal = counters.searchTotal;
    const avgSearchDuration = searchTotal > 0 ? Math.round(counters.searchDurationMs / searchTotal) : 0;
    const avgLlmLatency = counters.llmRequests > 0 ? Math.round(counters.llmLatencyMs / counters.llmRequests) : 0;

    return {
      nodes: sources.length,
      sources: sources.length,
      jobs: {
        pending: pending.length,
        running,
        completed,
        failed,
      },
      index: {
        vectorCount,
        lastIndexed: new Date().toISOString(),
      },
      adapters: { ...counters.adapterIngests },
      searches: {
        total: searchTotal,
        avgDurationMs: avgSearchDuration,
      },
      llm: {
        requests: counters.llmRequests,
        errors: counters.llmErrors,
        avgLatencyMs: avgLlmLatency,
      },
    };
  }

  private async countVectors(): Promise<number> {
    const embeddingsPath = path.join(this.deps.indexDir, 'embeddings.jsonl');
    if (!existsSync(embeddingsPath)) return 0;
    try {
      const raw = await readFile(embeddingsPath, 'utf-8');
      return raw.trim().split('\n').filter((l) => l.trim()).length;
    } catch {
      return 0;
    }
  }
}

/** Format metrics as Prometheus text */
export function formatPrometheus(snapshot: MetricsSnapshot): string {
  const lines: string[] = [];
  lines.push('# TYPE retineo_nodes gauge');
  lines.push(`retineo_nodes ${snapshot.nodes}`);
  lines.push('# TYPE retineo_sources gauge');
  lines.push(`retineo_sources ${snapshot.sources}`);
  lines.push('# TYPE retineo_jobs_pending gauge');
  lines.push(`retineo_jobs_pending ${snapshot.jobs.pending}`);
  lines.push('# TYPE retineo_jobs_running gauge');
  lines.push(`retineo_jobs_running ${snapshot.jobs.running}`);
  lines.push('# TYPE retineo_jobs_completed counter');
  lines.push(`retineo_jobs_completed ${snapshot.jobs.completed}`);
  lines.push('# TYPE retineo_jobs_failed counter');
  lines.push(`retineo_jobs_failed ${snapshot.jobs.failed}`);
  lines.push('# TYPE retineo_index_vectors gauge');
  lines.push(`retineo_index_vectors ${snapshot.index.vectorCount}`);
  lines.push('# TYPE retineo_searches_total counter');
  lines.push(`retineo_searches_total ${snapshot.searches.total}`);
  lines.push('# TYPE retineo_searches_avg_duration_ms gauge');
  lines.push(`retineo_searches_avg_duration_ms ${snapshot.searches.avgDurationMs}`);
  lines.push('# TYPE retineo_llm_requests_total counter');
  lines.push(`retineo_llm_requests_total ${snapshot.llm.requests}`);
  lines.push('# TYPE retineo_llm_errors_total counter');
  lines.push(`retineo_llm_errors_total ${snapshot.llm.errors}`);
  lines.push('# TYPE retineo_llm_avg_latency_ms gauge');
  lines.push(`retineo_llm_avg_latency_ms ${snapshot.llm.avgLatencyMs}`);
  for (const [adapter, count] of Object.entries(snapshot.adapters)) {
    lines.push(`# TYPE retineo_adapter_ingests_total counter`);
    lines.push(`retineo_adapter_ingests_total{adapter="${adapter}"} ${count}`);
  }
  return lines.join('\n') + '\n';
}

/** Global metrics counters (reset on restart) */
export function createMetricsCounters(): MetricsCounters {
  return {
    searchTotal: 0,
    searchDurationMs: 0,
    llmRequests: 0,
    llmErrors: 0,
    llmLatencyMs: 0,
    adapterIngests: {},
  };
}
