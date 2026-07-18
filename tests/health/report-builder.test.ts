/**
 * Report builder tests
 */

import { describe, it, expect } from 'vitest';
import { buildReport } from '../../packages/core/src/health/report-builder.js';
import type { Finding, MetricResult } from '../../packages/core/src/health/types.js';

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
    const findings: Finding[] = [
      { type: 'duplicate', severity: 'warning', documents: ['a'.repeat(64), 'b'.repeat(64)], reason: 'dup' },
    ];
    const report = buildReport([], findings);
    expect(report.attention).toHaveLength(1);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});
