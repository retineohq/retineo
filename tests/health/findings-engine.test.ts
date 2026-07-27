/**
 * Findings engine tests
 */

import { describe, it, expect } from 'vitest';
import { generateFindings } from '../../packages/core/src/health/findings-engine.js';
import type { MetricResult } from '../../packages/core/src/health/types.js';

describe('generateFindings', () => {
  it('creates findings referencing contentHash and sourcePath', () => {
    const hA = 'a'.repeat(64);
    const hB = 'b'.repeat(64);
    const hGhost = 'c'.repeat(64);
    const hOrphan = 'd'.repeat(64);

    const paths: Record<string, string> = {
      [hA]: '/notes/a.md',
      [hB]: '/notes/b.md',
      [hGhost]: '/notes/ghost.md',
      [hOrphan]: '/notes/orphan.md',
    };

    const metrics: MetricResult<unknown>[] = [
      { name: 'coverage', value: 1, details: [] },
      { name: 'duplicateConcepts', value: [{ rootA: hA, rootB: hB, similarity: 0.99 }], details: [] },
      { name: 'ghosts', value: [hGhost], details: [] },
      { name: 'orphans', value: [hOrphan], details: [] },
    ];

    const findings = generateFindings(metrics, (hash) => paths[hash]);
    expect(findings).toHaveLength(3);

    const duplicate = findings.find((f) => f.type === 'duplicate');
    expect(duplicate).toBeDefined();
    expect(duplicate!.documents).toEqual([
      { contentHash: hA, sourcePath: '/notes/a.md' },
      { contentHash: hB, sourcePath: '/notes/b.md' },
    ]);

    const ghost = findings.find((f) => f.type === 'ghost');
    expect(ghost!.documents).toEqual([{ contentHash: hGhost, sourcePath: '/notes/ghost.md' }]);

    const orphan = findings.find((f) => f.type === 'orphan');
    expect(orphan!.documents).toEqual([{ contentHash: hOrphan, sourcePath: '/notes/orphan.md' }]);
  });

  it('omits sourcePath when resolver returns undefined', () => {
    const hOrphan = 'd'.repeat(64);
    const metrics: MetricResult<unknown>[] = [
      { name: 'orphans', value: [hOrphan], details: [] },
    ];

    const findings = generateFindings(metrics, () => undefined);
    expect(findings).toHaveLength(1);
    expect(findings[0].documents).toEqual([{ contentHash: hOrphan }]);
    expect(findings[0].documents[0]).not.toHaveProperty('sourcePath');
  });
});
