/**
 * Report builder tests
 */

import { describe, it, expect } from 'vitest';
import { buildReport } from '../../packages/core/src/health/report-builder.js';
import type { Finding, MetricResult } from '../../packages/core/src/health/types.js';

function makeFinding(type: Finding['type'], sourcePath?: string): Finding {
  const hash = `${type}-${Math.random().toString(36).slice(2)}`.padEnd(64, '0');
  return {
    type,
    severity: 'warning',
    documents: sourcePath ? [{ contentHash: hash, sourcePath }] : [{ contentHash: hash }],
    reason: 'test',
  };
}

function makeOrphan(sourcePath?: string): Finding {
  return makeFinding('orphan', sourcePath);
}

function makeDuplicate(pathA?: string, pathB?: string): Finding {
  const hA = `dupA-${Math.random().toString(36).slice(2)}`.padEnd(64, '0');
  const hB = `dupB-${Math.random().toString(36).slice(2)}`.padEnd(64, '0');
  return {
    type: 'duplicate',
    severity: 'warning',
    documents: [
      pathA ? { contentHash: hA, sourcePath: pathA } : { contentHash: hA },
      pathB ? { contentHash: hB, sourcePath: pathB } : { contentHash: hB },
    ],
    reason: 'test',
  };
}

describe('buildReport', () => {
  it('produces valid HealthReport structure', () => {
    const metrics: MetricResult<unknown>[] = [
      { name: 'coverage', value: 0.95, details: [] },
      { name: 'knowledgeDensity', value: 0.3, details: [] },
      { name: 'duplicateConcepts', value: [], details: [] },
      { name: 'ghosts', value: [], details: [] },
      { name: 'orphans', value: [], details: [] },
    ];

    const findings: Finding[] = [];
    const report = buildReport(metrics, findings);

    expect(typeof report.score).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.strong).toBeInstanceOf(Array);
    expect(report.attention).toBeInstanceOf(Array);
    expect(report.recommendations).toBeInstanceOf(Array);
    expect(report.advancedMetrics).toHaveLength(3);
  });

  it('includes recommendations for findings', () => {
    const findings: Finding[] = [makeDuplicate('/notes/a.md', '/notes/b.md')];
    const report = buildReport([], findings);
    expect(report.attention).toHaveLength(1);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations[0]).toContain('/notes/a.md');
  });

  it('groups orphan recommendations when more than 3 orphans', () => {
    const findings: Finding[] = Array.from({ length: 11 }, (_, i) => makeOrphan(`/notes/doc-${i}.md`));
    const report = buildReport([], findings);
    expect(report.recommendations).toHaveLength(1);
    expect(report.recommendations[0]).toBe(
      '11 documents have no links or references (orphans). Consider linking them into related topics or merging.'
    );
  });

  it('lists per-document orphan recommendations when 3 or fewer', () => {
    const findings: Finding[] = [
      makeOrphan('/notes/alpha.md'),
      makeOrphan('/notes/beta.md'),
    ];
    const report = buildReport([], findings);
    expect(report.recommendations).toHaveLength(2);
    expect(report.recommendations[0]).toBe('Add links or references to orphan document: /notes/alpha.md');
    expect(report.recommendations[1]).toBe('Add links or references to orphan document: /notes/beta.md');
  });

  it('caps recommendations at 10', () => {
    const findings: Finding[] = [
      ...Array.from({ length: 5 }, () => makeDuplicate()),
      ...Array.from({ length: 5 }, () => makeOrphan()),
      ...Array.from({ length: 5 }, () => makeFinding('ghost')),
    ];
    const report = buildReport([], findings);
    expect(report.recommendations.length).toBeLessThanOrEqual(10);
  });
});
