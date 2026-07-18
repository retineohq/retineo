/**
 * Coverage metric: successful ingests / total sources.
 */

import type { Hash } from '../../domain/types.js';
import type { MetricResult, MetricDetail } from '../types.js';

interface Entry {
  contentHash: Hash;
  status: 'active' | 'ghost' | 'deleted';
}

export function coverageScore(entries: Entry[]): MetricResult<number> {
  if (entries.length === 0) {
    return { name: 'coverage', value: 0, details: [] };
  }

  const successful = entries.filter((e) => e.status === 'active' || e.status === 'ghost').length;
  const value = successful / entries.length;

  const details: MetricDetail[] = entries.map((e) => ({
    hash: e.contentHash,
    value: e.status === 'active' || e.status === 'ghost' ? 1 : 0,
    reason: e.status === 'deleted' ? 'source marked deleted' : 'source present in registry',
  }));

  return { name: 'coverage', value, details };
}
