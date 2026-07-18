/**
 * Findings engine: turns metric results into concrete Finding objects.
 */

import type { Hash } from '../domain/types.js';
import type { Finding, MetricResult } from './types.js';

export function generateFindings(metrics: MetricResult<unknown>[]): Finding[] {
  const findings: Finding[] = [];

  const duplicates = getMetricValue(metrics, 'duplicateConcepts', []) as Array<{
    rootA: Hash;
    rootB: Hash;
    similarity: number;
  }>;
  for (const dup of duplicates) {
    findings.push({
      type: 'duplicate',
      severity: 'warning',
      documents: [dup.rootA, dup.rootB],
      reason: `L3 embeddings are highly similar (cosine ${dup.similarity}), likely duplicate concepts`,
    });
  }

  const ghost = getMetricValue(metrics, 'ghosts', []) as Hash[];
  for (const hash of ghost) {
    findings.push({
      type: 'ghost',
      severity: 'warning',
      documents: [hash],
      reason: 'Source was deleted or is no longer present in the source adapter',
    });
  }

  const orphan = getMetricValue(metrics, 'orphans', []) as Hash[];
  for (const hash of orphan) {
    findings.push({
      type: 'orphan',
      severity: 'warning',
      documents: [hash],
      reason: 'Document has no semantic links and no inbound chunk references',
    });
  }

  return findings;
}

function getMetricValue<T>(metrics: MetricResult<unknown>[], name: string, fallback: T): T {
  const m = metrics.find((x) => x.name === name);
  return m ? (m.value as T) : fallback;
}
