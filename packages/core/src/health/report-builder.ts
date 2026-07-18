/**
 * Report builder: assembles the final HealthReport JSON.
 */

import type { Finding, HealthReport, MetricResult, Recommendation } from './types.js';
import { memoryScore } from './metrics/memory-score.js';

const ADVANCED_METRICS = [
  { metric: 'fragmentation', availableIn: 'pro' },
  { metric: 'contradictions', availableIn: 'pro' },
  { metric: 'topicDistribution', availableIn: 'pro' },
];

export function buildReport(metrics: MetricResult<unknown>[], findings: Finding[]): HealthReport {
  const score = memoryScore(metrics);
  const strong: string[] = [];
  const recommendations: string[] = [];

  const coverage = getMetricValue(metrics, 'coverage', 0) as number;
  const density = getMetricValue(metrics, 'knowledgeDensity', 0) as number;
  const duplicateCount = (getMetricValue(metrics, 'duplicateConcepts', []) as unknown[]).length;
  const ghostCount = (getMetricValue(metrics, 'ghosts', []) as unknown[]).length;
  const orphanCount = (getMetricValue(metrics, 'orphans', []) as unknown[]).length;

  if (coverage >= 0.9) strong.push('good coverage');
  if (duplicateCount === 0) strong.push('few duplicates');
  if (ghostCount === 0) strong.push('no ghost entries');
  if (orphanCount === 0) strong.push('good connectivity');
  if (density > 0.2) strong.push('dense knowledge extraction');

  if (strong.length === 0) strong.push('health check completed');

  for (const finding of findings) {
    if (finding.type === 'duplicate') {
      recommendations.push(`Merge or deduplicate documents: ${finding.documents.join(', ')}`);
    } else if (finding.type === 'ghost') {
      recommendations.push(`Review or recover ghost document: ${finding.documents[0]}`);
    } else if (finding.type === 'orphan') {
      recommendations.push(`Add links or references to orphan document: ${finding.documents[0]}`);
    }
  }

  if (recommendations.length === 0) recommendations.push('No action required');

  return {
    score,
    strong,
    attention: findings,
    recommendations,
    advancedMetrics: ADVANCED_METRICS,
  };
}

function getMetricValue<T>(metrics: MetricResult<unknown>[], name: string, fallback: T): T {
  const m = metrics.find((x) => x.name === name);
  return m ? (m.value as T) : fallback;
}
