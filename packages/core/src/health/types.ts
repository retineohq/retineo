/**
 * RETINEO Core — Health Analyzer Types
 * Read-only consumer of L0–L3 artifacts and Registry data.
 */

import type { Hash } from '../domain/types.js';
import type { RegistryEntry } from '../storage/types.js';
import type { JobStatus } from '../domain/types.js';
import type { L2Status } from '../storage/registry.js';

export type FindingType = 'duplicate' | 'ghost' | 'orphan';
export type Severity = 'warning' | 'info';

export interface FindingDocumentRef {
  contentHash: Hash;
  sourcePath?: string;
}

export interface Finding {
  type: FindingType;
  severity: Severity;
  documents: FindingDocumentRef[];
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
  /** Number of distinct nodes whose L2 generation terminally failed. */
  l2FailedNodes?: number;
  /** Number of distinct nodes with L2 still pending or running. */
  l2Pending?: number;
  /** Terminally failed pipeline jobs (FAILED/DEAD), newest first, capped. */
  failedJobs?: Array<{
    jobId: string;
    type: string;
    nodeHash: string;
    status: JobStatus;
  }>;
  /** Node-level L2 readiness snapshot from the registry. */
  l2Status?: L2Status;
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
    listByContentHash(hash: Hash): RegistryEntry[];
    getChildSegments(parentHash: Hash): Array<{ hash: Hash }>;
    getL2Status?(): L2Status;
    getFailedJobs?(limit: number): Array<{ id: string; type: string; payload: string; status: JobStatus }>;
  };
  indexDir: string;
}
