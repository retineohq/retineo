/**
 * RETINEO Core — Domain Types
 * Phase 0: Interfaces & Type Definitions
 */

export type Hash = string; // SHA-256 hex

export interface SourceRef {
  protocol: 'file' | 'http' | 'https';
  uri: string;
  mimeType: string;
}



export interface SegmentRecord {
  hash: Hash;         // PRIMARY KEY, contentHash of normalized text
  sourceId: string;   // sources.source_id
  externalId: string; // sources.external_id
  spanStart: number;  // char offset or ms
  spanEnd: number;
  adapterId: string;
  parentHash: Hash | null;
}

export interface SemanticLink {
  targetHash: Hash;
  reason: string;
}

export interface ContextNode {
  id: Hash;           // contentHash
  sourceRef: SourceRef; // retained for runtime convenience; NOT persisted in node.json
  parentHash?: Hash;  // contentHash of parent segment
  childrenIds: Hash[];
  depth: number;
  artifacts: {
    l0?: L0Artifact;
    l1?: L1Artifact;
    l2?: L2Artifact;
  };
  semanticLinks?: SemanticLink[];
  build: BuildManifest;
  createdAt: string;
  updatedAt: string;
}

export interface L0Artifact {
  contentPath: string;      // objects/{hash}/content.md
  metaPath: string;         // objects/{hash}/content.meta.json
  wordCount: number;
  charCount: number;
}

export interface L1Artifact {
  markdownPath: string;     // objects/{hash}/L1.md
  indexPath: string;        // objects/{hash}/L1.index.json (derived)
  sectionCount: number;
  headingCount: number;
}

export interface L2Artifact {
  summary: string;
  language?: string;
  concepts: string[];
  conceptsEn?: string[];
  entities: string[];
  claims: string[];
  relations: Relation[];
}

export interface Relation {
  source: string;
  target: string;
  type: string;
}

export interface BuildManifest {
  schemaVersion: number;
  nodeVersion: number;
  rawHash: Hash;        // SHA-256 of original source file
  contentHash: Hash;    // SHA-256 of normalized text (CAS key)
  generators: {
    l1: GeneratorInfo;
    l2: GeneratorInfo;
    embedding: GeneratorInfo;
  };
  buildTimestamp: string; // ISO 8601
}

export interface GeneratorInfo {
  id: string;
  version: string;
  provider?: string;
  model?: string;
}

export interface HNSWManifest {
  schemaVersion: number;
  indexVersion: number;
  embeddingModel: string;
  embeddingProvider: string;
  dimension: number;
  metric: 'cosine' | 'l2' | 'ip';
  vectorCount: number;
  createdAt: string; // ISO 8601
}

export interface ContentMeta {
  blocks: MetaBlock[];
}

export interface MetaBlock {
  type: 'speech' | 'ocr' | 'frame' | 'heading';
  offset: number;
  length: number;
  timestamp?: number;   // ms for audio/video
  speaker?: string;
  bbox?: [number, number, number, number]; // x,y,w,h for OCR
  confidence?: number;
}

// Queue
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'DEAD';

export interface JobRecord {
  id: string;
  type: 'GENERATE_L1' | 'GENERATE_L2' | 'GENERATE_L3' | 'RECONCILE';
  payload: string;      // JSON string
  priority: number;
  attempts: number;
  maxAttempts: number;
  status: JobStatus;
  leaseUntil: string | null;  // ISO 8601
  workerId: string | null;
  heartbeatAt: string | null; // ISO 8601
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// Adapter IPC
export interface AdapterCapabilities {
  mimeTypes: string[];
  extensions: string[];
}

export interface NormalizedContent {
  content: string;           // normalized markdown text
  metadata: ContentMeta;
  segments?: SegmentRef[];   // optional: for large files
}

export interface SegmentRef {
  spanStart: number;
  spanEnd: number;
  content: string;
  metadata: ContentMeta;
}

// Search / Retrieval
export interface SearchOptions {
  topK?: number;
  threshold?: number;
  mode?: 'semantic' | 'keyword' | 'hybrid';
}

export interface RetrievalResult {
  query: string;
  candidates: CandidateNode[];
  selected: CandidateNode[];
  citations: Citation[];
  trace: RetrievalTrace;
}

export interface CandidateNode {
  nodeId: Hash;
  score: number;
  l2Summary?: string;
  l1Preview?: string;
}

export interface Citation {
  nodeId: Hash;
  level: 'L2' | 'L1' | 'L0';
  content: string;
  span?: { start: number; end: number };
  sourceRef: SourceRef;
}

export interface RetrievalTrace {
  steps: string[];
  durationMs: number;
}
