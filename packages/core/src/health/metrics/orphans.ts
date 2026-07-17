/**
 * Orphan metric: documents with no semantic links and no backlinks.
 * Uses Registry child segments as proxy for connectivity.
 */

import type { Hash } from '../../domain/types.js';
import type { MetricResult, MetricDetail, HealthAnalyzerDeps } from '../types.js';

interface Entry {
  contentHash: Hash;
}

export async function orphans(
  entries: Entry[],
  cas: HealthAnalyzerDeps['cas'],
  registry: HealthAnalyzerDeps['registry']
): Promise<MetricResult<Hash[]>> {
  const orphanHashes: Hash[] = [];
  const details: MetricDetail[] = [];

  for (const entry of entries) {
    const hash = entry.contentHash;
    let hasLinks = false;
    let hasBacklinks = false;

    if (cas.exists(hash)) {
      try {
        const obj = await cas.readObject(hash);
        hasLinks = (obj.node.semanticLinks?.length ?? 0) > 0;
      } catch {
        // treat as no links
      }
    }

    hasBacklinks = registry.getChildSegments(hash).length > 0;

    if (!hasLinks && !hasBacklinks) {
      orphanHashes.push(hash);
      details.push({ hash, reason: 'no semantic links and no inbound chunk references' });
    }
  }

  return { name: 'orphans', value: orphanHashes, details };
}
