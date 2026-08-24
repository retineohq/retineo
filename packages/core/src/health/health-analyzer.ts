/**
 * HealthAnalyzer orchestrator.
 * Reads L0–L3 from CAS + Registry and runs all metrics.
 */

import type { Hash, JobStatus } from '../domain/types.js';
import type { HealthAnalyzerDeps, HealthReport, MetricResult } from './types.js';
import { coverageScore } from './metrics/coverage-score.js';
import { knowledgeDensity } from './metrics/knowledge-density.js';
import { duplicateConcepts } from './metrics/duplicate-concepts.js';
import { orphans } from './metrics/orphans.js';
import { ghosts } from './metrics/ghosts.js';
import { knowledgeAge } from './metrics/knowledge-age.js';
import { generateFindings } from './findings-engine.js';
import { buildReport } from './report-builder.js';

export interface HealthAnalyzer {
  analyze(sourceId: string): Promise<HealthReport>;
}

export class DefaultHealthAnalyzer implements HealthAnalyzer {
  private cache: { sourceId: string; signature: string; report: HealthReport } | null = null;

  constructor(private deps: HealthAnalyzerDeps) {}

  async analyze(sourceId: string): Promise<HealthReport> {
    const entries = this.deps.registry.listBySourceId(sourceId);
    const uniqueEntries = Array.from(new Map(entries.map((e) => [e.contentHash, e])).values());
    const sourceHashes = new Set(uniqueEntries.map((e) => e.contentHash));

    // Surface diagnostics about partial L2 degradation (CORE-FIXES P2).
    const l2Status = this.deps.registry.getL2Status?.();
    const failedJobs = (this.deps.registry.getFailedJobs?.(50) ?? []).map((j) => ({
      jobId: j.id,
      type: j.type,
      nodeHash: extractNodeHash(j.payload),
      status: j.status as JobStatus,
    }));

    // Reuse the previous report when neither sources nor job state changed.
    const signature = JSON.stringify({
      sourceId,
      entries: uniqueEntries.map((e) => [e.contentHash, e.status, e.lastSeenAt, e.createdAt]),
      l2Status,
      failedJobs: failedJobs.map((f) => `${f.jobId}:${f.status}`),
    });
    if (this.cache && this.cache.sourceId === sourceId && this.cache.signature === signature) {
      return this.cache.report;
    }

    const metrics: MetricResult<unknown>[] = [];

    metrics.push(coverageScore(uniqueEntries));
    metrics.push(await knowledgeDensity(uniqueEntries, this.deps.cas));
    metrics.push(await duplicateConcepts(sourceHashes, this.deps.indexDir));
    metrics.push(await orphans(uniqueEntries, this.deps.cas, this.deps.registry));
    metrics.push(ghosts(uniqueEntries));
    metrics.push(knowledgeAge(uniqueEntries));

    const findings = generateFindings(metrics, (hash) => this.resolveSourcePath(hash));
    const report = buildReport(metrics, findings);

    if (l2Status) {
      report.l2FailedNodes = l2Status.failed;
      report.l2Pending = l2Status.pending;
      report.l2Status = l2Status;
    }
    if (failedJobs.length > 0) {
      report.failedJobs = failedJobs;
    }

    this.cache = { sourceId, signature, report };
    return report;
  }

  private resolveSourcePath(hash: Hash): string | undefined {
    const entries = this.deps.registry.listByContentHash(hash);
    const active = entries.find((e) => e.status === 'active');
    return active?.externalId ?? entries[0]?.externalId;
  }
}

function extractNodeHash(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as { nodeId?: string };
    return parsed.nodeId ?? '';
  } catch {
    return '';
  }
}

export async function analyzeSource(
  sourceId: string,
  deps: HealthAnalyzerDeps
): Promise<HealthReport> {
  const analyzer = new DefaultHealthAnalyzer(deps);
  return analyzer.analyze(sourceId);
}
