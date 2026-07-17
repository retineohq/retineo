/**
 * RETINEO Core — Health Analyzer Types
 * Read-only consumer of L0–L3 artifacts and Registry data.
 */

import type { Hash } from '../domain/types.js';

export type FindingType = 'duplicate' | 'ghost' | 'orphan';
export type Severity = 'warning' | 'info';

export interface Finding {
  type: FindingType;
  severity: Severity;
  documents: Hash[];
  reason: string;
}

export interface Recommendation {
  text: string;
}

export interface AdvancedMetricHint {
  metric: string;
  availableIn: string;
}

export interface HealthReport {
  score: number;
  strong: string[];
  attention: Finding[];
  recommendations: string[];
  advancedMetrics: AdvancedMetricHint[];
}

export interface MetricDetail {
  hash: Hash;
  externalId?: string;
  value?: number;
  reason?: string;
}

export interface MetricResult<T = unknown> {
  name: string;
  value: T;
  details: MetricDetail[];
}

export interface HealthAnalyzerDeps {
  cas: {
    readObject(hash: Hash): Promise<{ node: { semanticLinks?: Array<{ targetHash: Hash; reason: string }> }; artifacts: { content?: string; l1?: string; l2?: { summary?: string; claims?: string[] } } }>;
    getObjectPath(hash: Hash): string;
    exists(hash: Hash): boolean;
  };
  registry: {
    listBySourceId(sourceId: string): Array<{ sourceId: string; externalId: string; contentHash: Hash; status: 'active' | 'ghost' | 'deleted'; lastSeenAt: number; createdAt: number }>;
    getChildSegments(parentHash: Hash): Array<{ hash: Hash }>;
  };
  indexDir: string;
}
