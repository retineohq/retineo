/**
 * HealthAnalyzer orchestrator.
 * Reads L0–L3 from CAS + Registry and runs all metrics.
 */

import type { Hash } from '../domain/types.js';
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
  constructor(private deps: HealthAnalyzerDeps) {}

  async analyze(sourceId: string): Promise<HealthReport> {
    const entries = this.deps.registry.listBySourceId(sourceId);
    const uniqueEntries = Array.from(new Map(entries.map((e) => [e.contentHash, e])).values());
    const sourceHashes = new Set(uniqueEntries.map((e) => e.contentHash));

    const metrics: MetricResult<unknown>[] = [];

    metrics.push(coverageScore(uniqueEntries));
    metrics.push(await knowledgeDensity(uniqueEntries, this.deps.cas));
    metrics.push(await duplicateConcepts(sourceHashes, this.deps.indexDir));
    metrics.push(await orphans(uniqueEntries, this.deps.cas, this.deps.registry));
    metrics.push(ghosts(uniqueEntries));
    metrics.push(knowledgeAge(uniqueEntries));

    const findings = generateFindings(metrics, (hash) => this.resolveSourcePath(hash));
    return buildReport(metrics, findings);
  }

  private resolveSourcePath(hash: Hash): string | undefined {
    const entries = this.deps.registry.listByContentHash(hash);
    const active = entries.find((e) => e.status === 'active');
    return active?.externalId ?? entries[0]?.externalId;
  }
}

export async function analyzeSource(
  sourceId: string,
  deps: HealthAnalyzerDeps
): Promise<HealthReport> {
  const analyzer = new DefaultHealthAnalyzer(deps);
  return analyzer.analyze(sourceId);
}
