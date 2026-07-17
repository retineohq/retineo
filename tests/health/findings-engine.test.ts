/**
 * Findings engine tests
 */

import { describe, it, expect } from 'vitest';
import { generateFindings } from '../../packages/core/src/health/findings-engine.js';
import type { MetricResult } from '../../packages/core/src/health/types.js';

describe('generateFindings', () => {
  it('creates findings referencing specific hashes', () => {
    const hA = 'a'.repeat(64);
    const hB = 'b'.repeat(64);
    const hGhost = 'c'.repeat(64);
    const hOrphan = 'd'.repeat(64);

    const metrics: MetricResult<unknown>[] = [
      { name: 'coverage', value: 1, details: [] },
      { name: 'duplicateConcepts', value: [{ rootA: hA, rootB: hB, similarity: 0.99 }], details: [] },
      { name: 'ghosts', value: [hGhost], details: [] },
      { name: 'orphans', value: [hOrphan], details: [] },
    ];

    const findings = generateFindings(metrics);
    expect(findings).toHaveLength(3);

    const duplicate = findings.find((f) => f.type === 'duplicate');
    expect(duplicate).toBeDefined();
    expect(duplicate!.documents).toEqual([hA, hB]);

    const ghost = findings.find((f) => f.type === 'ghost');
    expect(ghost!.documents).toEqual([hGhost]);

    const orphan = findings.find((f) => f.type === 'orphan');
    expect(orphan!.documents).toEqual([hOrphan]);
  });
});
