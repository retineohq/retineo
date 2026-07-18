/**
 * Ghost metric: registry entries marked as ghost.
 */

import type { Hash } from '../../domain/types.js';
import type { MetricResult, MetricDetail } from '../types.js';

interface Entry {
  contentHash: Hash;
  externalId: string;
  status: 'active' | 'ghost' | 'deleted';
}

export function ghosts(entries: Entry[]): MetricResult<Hash[]> {
  const ghostHashes: Hash[] = [];
  const details: MetricDetail[] = [];

  for (const entry of entries) {
    if (entry.status === 'ghost') {
      ghostHashes.push(entry.contentHash);
      details.push({
        hash: entry.contentHash,
        externalId: entry.externalId,
        reason: 'source deleted or no longer present in adapter sync',
      });
    }
  }

  return { name: 'ghosts', value: ghostHashes, details };
}
