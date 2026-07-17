/**
 * Knowledge age metric tests
 */

import { describe, it, expect } from 'vitest';
import { knowledgeAge } from '../../packages/core/src/health/metrics/knowledge-age.js';

describe('knowledgeAge', () => {
  it('computes age distribution', () => {
    const now = Date.now();
    const entries = [
      { contentHash: 'a'.repeat(64), lastSeenAt: now, createdAt: now - 10000 },
      { contentHash: 'b'.repeat(64), lastSeenAt: now, createdAt: now - 5000 },
    ];

    const result = knowledgeAge(entries);
    expect(result.value.averageAgeMs).toBe(7500);
    expect(result.value.oldestMs).toBe(10000);
    expect(result.value.newestMs).toBe(5000);
    expect(result.details).toHaveLength(2);
  });

  it('returns zero for empty entries', () => {
    const result = knowledgeAge([]);
    expect(result.value).toEqual({ averageAgeMs: 0, oldestMs: 0, newestMs: 0 });
  });
});
