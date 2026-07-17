/**
 * Memory health score: weighted sum of normalized metrics.
 * Internal formula — not exposed outside this module.
 */

import type { MetricResult } from '../types.js';

export function memoryScore(metrics: MetricResult<unknown>[]): number {
  const coverage = metricValue(metrics, 'coverage', 0) as number;
  const density = metricValue(metrics, 'knowledgeDensity', 0) as number;
  const duplicates = metricValue(metrics, 'duplicateConcepts', []) as Array<{ rootA: string; rootB: string }>;
  const ghost = metricValue(metrics, 'ghosts', []) as string[];
  const orphan = metricValue(metrics, 'orphans', []) as string[];

  // Normalize each sub-metric to 0–100
  const coverageScore = coverage * 100;
  const densityScore = Math.min(100, Math.max(0, density * 100));
  const duplicatePenalty = Math.min(30, duplicates.length * 10);
  const ghostPenalty = Math.min(30, ghost.length * 10);
  const orphanPenalty = Math.min(20, orphan.length * 10);

  const raw =
    coverageScore * 0.35 +
    densityScore * 0.25 +
    40 -
    duplicatePenalty -
    ghostPenalty -
    orphanPenalty;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

function metricValue(metrics: MetricResult<unknown>[], name: string, fallback: unknown): unknown {
  const m = metrics.find((x) => x.name === name);
  return m ? m.value : fallback;
}
