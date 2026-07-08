/**
 * RETINEO Core — Bridge Types
 * Phase 5: HTTP API request/response interfaces.
 */

import type { SearchOptions } from '../search/retrieval-service.js';
import type { RetrievalResult } from '../search/retrieval-service.js';
import type { AssembledContext } from '../search/context-assembler.js';
import type { ContextNode, JobRecord } from '../domain/types.js';

export interface SearchRequest {
  query: string;
  options?: SearchOptions;
  sessionId?: string;
}

export interface SearchResponse {
  query: string;
  language: string;
  intent: string;
  results: RetrievalResult;
  assembled: AssembledContext;
  citations: CitationDTO[];
  durationMs: number;
}

export interface IngestRequest {
  sourcePath: string;
  mimeType?: string;
  adapterId?: string;
}

export interface IngestResponse {
  sourceId: string;
  rootHash: string;
  status: 'queued' | 'compiling' | 'complete';
  jobs: string[];
}

export interface StatusResponse {
  version: string;
  nodeCount: number;
  sourceCount: number;
  jobCount: { pending: number; running: number; completed: number; failed: number };
  indexStatus: { vectorCount: number; lastIndexed: string };
}

export interface NodeResponse {
  node: ContextNode;
  artifacts: { l0?: string; l1?: string; l2?: string };
  build: unknown;
}

export interface SourceResponse {
  sourceId: string;
  externalId: string;
  contentHash: string;
  etag: string;
  status: string;
  deletedAt: number | null;
  lastSeenAt: string;
}

export interface JobResponse {
  id: string;
  type: string;
  status: string;
  progress?: number;
  result?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CitationDTO {
  nodeId: string;
  contentHash?: string;
  chunkHash?: string;
  level: 'L2' | 'L1' | 'L0';
  content: string;
  score?: number;
  span?: { start: number; end: number };
  sourceRef?: { protocol: string; uri: string; mimeType: string };
  sourcePath?: string;
  isGhost?: boolean;
}

export interface BridgeError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BridgeConfig {
  enabled: boolean;
  host: string;
  port: number;
  sse: {
    heartbeatIntervalMs: number;
    maxConnections: number;
  };
}
