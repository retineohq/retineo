/**
 * Knowledge density: claims per chunk, or summary length per body length.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { Hash } from '../../domain/types.js';
import type { MetricResult, MetricDetail, HealthAnalyzerDeps } from '../types.js';
import type { L1Index } from '../../layers/l1-generator.js';

interface Entry {
  contentHash: Hash;
}

export async function knowledgeDensity(
  entries: Entry[],
  cas: HealthAnalyzerDeps['cas']
): Promise<MetricResult<number>> {
  if (entries.length === 0) {
    return { name: 'knowledgeDensity', value: 0, details: [] };
  }

  let totalDensity = 0;
  const details: MetricDetail[] = [];

  for (const entry of entries) {
    const hash = entry.contentHash;
    if (!cas.exists(hash)) {
      details.push({ hash, value: 0, reason: 'CAS object missing' });
      continue;
    }

    let density = 0;
    let reason = 'no L2 artifact';

    try {
      const obj = await cas.readObject(hash);
      const l2 = obj.artifacts.l2;
      const content = obj.artifacts.content ?? '';

      if (l2) {
        const claims = l2.claims ?? [];
        const l1Path = path.join(cas.getObjectPath(hash), 'L1.index.json');
        let chunkCount = 0;
        if (existsSync(l1Path)) {
          const l1Raw = await readFile(l1Path, 'utf-8');
          const l1Index = JSON.parse(l1Raw) as L1Index;
          chunkCount = l1Index.chunks?.length ?? 0;
        }

        if (chunkCount > 0 && claims.length > 0) {
          density = claims.length / chunkCount;
          reason = 'claims per chunk';
        } else if (content.length > 0 && l2.summary) {
          density = l2.summary.length / content.length;
          reason = 'summary length per body length';
        }
      }
    } catch {
      reason = 'failed to load CAS object';
    }

    totalDensity += density;
    details.push({ hash, value: density, reason });
  }

  return { name: 'knowledgeDensity', value: totalDensity / entries.length, details };
}
