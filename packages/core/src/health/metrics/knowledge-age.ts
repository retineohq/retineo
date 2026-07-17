/**
 * Knowledge age distribution from Registry lastSeenAt / createdAt.
 */

import type { Hash } from '../../domain/types.js';
import type { MetricResult, MetricDetail } from '../types.js';

interface Entry {
  contentHash: Hash;
  lastSeenAt: number;
  createdAt: number;
}

export interface AgeDistribution {
  averageAgeMs: number;
  oldestMs: number;
  newestMs: number;
}

export function knowledgeAge(entries: Entry[]): MetricResult<AgeDistribution> {
  if (entries.length === 0) {
    return {
      name: 'knowledgeAge',
      value: { averageAgeMs: 0, oldestMs: 0, newestMs: 0 },
      details: [],
    };
  }

  let totalAge = 0;
  let oldest = 0;
  let newest = Number.MAX_SAFE_INTEGER;
  const details: MetricDetail[] = [];

  for (const entry of entries) {
    const age = Math.max(0, entry.lastSeenAt - entry.createdAt);
    totalAge += age;
    if (age > oldest) oldest = age;
    if (age < newest) newest = age;
    details.push({ hash: entry.contentHash, value: age, reason: 'lastSeenAt - createdAt' });
  }

  return {
    name: 'knowledgeAge',
    value: {
      averageAgeMs: Math.floor(totalAge / entries.length),
      oldestMs: oldest,
      newestMs: newest === Number.MAX_SAFE_INTEGER ? 0 : newest,
    },
    details,
  };
}
