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

  const grouped = groupFindings(findings);
  const typeOrder: Finding['type'][] = ['duplicate', 'ghost', 'orphan'];

  for (const type of typeOrder) {
    const group = grouped.get(type) ?? [];
    if (group.length === 0) continue;

    if (group.length <= 3) {
      for (const finding of group) {
        if (type === 'duplicate') {
          const labels = finding.documents.map((d) => d.sourcePath ?? d.contentHash);
          recommendations.push(`Merge or deduplicate documents: ${labels.join(', ')}`);
        } else if (type === 'ghost') {
          const d = finding.documents[0];
          recommendations.push(`Review or recover ghost document: ${d?.sourcePath ?? d?.contentHash ?? 'unknown'}`);
        } else if (type === 'orphan') {
          const d = finding.documents[0];
          recommendations.push(`Add links or references to orphan document: ${d?.sourcePath ?? d?.contentHash ?? 'unknown'}`);
        }
      }
    } else {
      if (type === 'duplicate') {
        recommendations.push(`${group.length} duplicate document pairs detected. Merge or deduplicate them.`);
      } else if (type === 'ghost') {
        recommendations.push(`${group.length} ghost documents need review or recovery.`);
      } else if (type === 'orphan') {
        recommendations.push(`${group.length} documents have no links or references (orphans). Consider linking them into related topics or merging.`);
      }
    }
  }

  if (recommendations.length === 0) recommendations.push('No action required');

  if (recommendations.length > 10) {
    recommendations.length = 10;
  }

  return {
    score,
    strong,
    attention: findings,
    recommendations,
    advancedMetrics: ADVANCED_METRICS,
  };
}

function groupFindings(findings: Finding[]): Map<Finding['type'], Finding[]> {
  const grouped = new Map<Finding['type'], Finding[]>();
  for (const finding of findings) {
    const list = grouped.get(finding.type) ?? [];
    list.push(finding);
    grouped.set(finding.type, list);
  }
  return grouped;
}

function getMetricValue<T>(metrics: MetricResult<unknown>[], name: string, fallback: T): T {
  const m = metrics.find((x) => x.name === name);
  return m ? (m.value as T) : fallback;
}
