/**
 * RETINEO Core — Zod Schemas
 * Runtime validation for all domain types
 */

import { z } from 'zod';

export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const SourceRefSchema = z.object({
  protocol: z.enum(['file', 'http', 'https']),
  uri: z.string().min(1),
  mimeType: z.string().min(1),
});

export const GeneratorInfoSchema = z.object({
  id: z.string(),
  version: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const BuildManifestSchema = z.object({
  schemaVersion: z.number().int().min(1),
  nodeVersion: z.number().int().min(1),
  rawHash: HashSchema,
  contentHash: HashSchema,
  generators: z.object({
    l1: GeneratorInfoSchema,
    l2: GeneratorInfoSchema,
    embedding: GeneratorInfoSchema,
  }),
  buildTimestamp: z.string().datetime(),
});

export const RelationSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.string(),
});

export const L2ArtifactSchema = z.object({
  summary: z.string(),
  concepts: z.array(z.string()),
  entities: z.array(z.string()),
  claims: z.array(z.string()),
  relations: z.array(RelationSchema),
});

export const MetaBlockSchema = z.object({
  type: z.enum(['speech', 'ocr', 'frame', 'heading']),
  offset: z.number().int().min(0),
  length: z.number().int().min(0),
  timestamp: z.number().optional(),
  speaker: z.string().optional(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const ContentMetaSchema = z.object({
  blocks: z.array(MetaBlockSchema),
});

export const SegmentRefSchema = z.object({
  spanStart: z.number(),
  spanEnd: z.number(),
  content: z.string(),
  metadata: ContentMetaSchema,
});

export const NormalizedContentSchema = z.object({
  content: z.string(),
  metadata: ContentMetaSchema,
  segments: z.array(SegmentRefSchema).optional(),
});

export const HNSWManifestSchema = z.object({
  schemaVersion: z.number().int().min(1),
  indexVersion: z.number().int().min(1),
  embeddingModel: z.string(),
  embeddingProvider: z.string(),
  dimension: z.number().int().positive(),
  metric: z.enum(['cosine', 'l2', 'ip']),
  vectorCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
});

export const JobStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD']);

export const JobRecordSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['GENERATE_L1', 'GENERATE_L2', 'GENERATE_L3', 'RECONCILE']),
  payload: z.string(), // JSON
  priority: z.number().int().default(0),
  attempts: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  status: JobStatusSchema,
  leaseUntil: z.string().datetime().nullable(),
  workerId: z.string().nullable(),
  heartbeatAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export const AdapterCapabilitiesSchema = z.object({
  mimeTypes: z.array(z.string()),
  extensions: z.array(z.string()),
});

export const SearchOptionsSchema = z.object({
  topK: z.number().int().positive().optional(),
  threshold: z.number().min(0).max(1).optional(),
  mode: z.enum(['semantic', 'keyword', 'hybrid']).optional(),
});
