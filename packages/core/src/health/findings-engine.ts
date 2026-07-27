/**
 * Findings engine: turns metric results into concrete Finding objects.
 */

import type { Hash } from '../domain/types.js';
import type { Finding, FindingDocumentRef, MetricResult } from './types.js';

export function generateFindings(
  metrics: MetricResult<unknown>[],
  resolveSourcePath: (hash: Hash) => string | undefined
): Finding[] {
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
      documents: [makeRef(dup.rootA, resolveSourcePath), makeRef(dup.rootB, resolveSourcePath)],
      reason: `L3 embeddings are highly similar (cosine ${dup.similarity}), likely duplicate concepts`,
    });
  }

  const ghost = getMetricValue(metrics, 'ghosts', []) as Hash[];
  for (const hash of ghost) {
    findings.push({
      type: 'ghost',
      severity: 'warning',
      documents: [makeRef(hash, resolveSourcePath)],
      reason: 'Source was deleted or is no longer present in the source adapter',
    });
  }

  const orphan = getMetricValue(metrics, 'orphans', []) as Hash[];
  for (const hash of orphan) {
    findings.push({
      type: 'orphan',
      severity: 'warning',
      documents: [makeRef(hash, resolveSourcePath)],
      reason: 'Document has no semantic links and no inbound chunk references',
    });
  }

  return findings;
}

function makeRef(hash: Hash, resolveSourcePath: (hash: Hash) => string | undefined): FindingDocumentRef {
  const sourcePath = resolveSourcePath(hash);
  return sourcePath ? { contentHash: hash, sourcePath } : { contentHash: hash };
}

function getMetricValue<T>(metrics: MetricResult<unknown>[], name: string, fallback: T): T {
  const m = metrics.find((x) => x.name === name);
  return m ? (m.value as T) : fallback;
}
