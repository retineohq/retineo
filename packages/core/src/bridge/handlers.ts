/**
 * RETINEO Core — Bridge Handlers
 * Phase 5: Request handlers calling core services.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  SearchRequest,
  IngestRequest,
  StatusResponse,
  NodeResponse,
  SourceResponse,
  JobResponse,
  BridgeError,
} from './types.js';
import type { QueryAnalyzer } from '../search/query-analyzer.js';
import type { RetrievalService } from '../search/retrieval-service.js';
import type { ContextAssembler } from '../search/context-assembler.js';
import type { IngestionService } from '../services/ingestion-service.js';
import type { Registry } from '../storage/registry.js';
import type { CASStorage } from '../storage/cas.js';
import type { ConfigManager } from '../storage/config.js';
import type { AuditService } from '../storage/audit.js';
import type { JobRecord } from '../domain/types.js';
import type { HealthAnalyzer } from '../health/health-analyzer.js';
import type { HealthReport } from '../health/types.js';
import type { SimilarityService } from '../search/similarity-service.js';
import { BaseRetineoError } from '../utils/errors.js';
import { createSSEStream } from './sse.js';
import { readFile, existsSync } from 'fs';
import { promisify } from 'util';
import path from 'path';
import crypto from 'crypto';

const readFileAsync = promisify(readFile);

export interface BridgeHandlersDeps {
  queryAnalyzer: QueryAnalyzer;
  retrievalService: RetrievalService;
  contextAssembler: ContextAssembler;
  ingestionService: IngestionService;
  registry: Registry;
  cas: CASStorage;
  configManager: ConfigManager;
  auditService: AuditService;
  healthAnalyzer?: HealthAnalyzer;
  similarityService?: SimilarityService;
  version: string;
  indexDir: string;
}

function errorReply(reply: FastifyReply, status: number, code: string, message: string, details?: Record<string, unknown>) {
  const body: { error: BridgeError } = {
    error: { code, message, details },
  };
  return reply.status(status).send(body);
}

function handleKnownError(reply: FastifyReply, err: unknown) {
  if (err instanceof BaseRetineoError) {
    return reply.status(err.statusCode).send({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return errorReply(reply, 500, 'INTERNAL_ERROR', msg);
}

export function createHandlers(deps: BridgeHandlersDeps) {
  type HealthJob = {
    status: 'pending' | 'running' | 'completed' | 'failed';
    report?: HealthReport;
    error?: string;
  };
  const healthJobs = new Map<string, HealthJob>();

  async function runHealthJob(jobId: string, sourceId: string) {
    const job = healthJobs.get(jobId);
    if (!job) return;
    job.status = 'running';
    try {
      await deps.ingestionService.syncSource(sourceId);
      if (!deps.healthAnalyzer) {
        throw new Error('Health analyzer is not configured');
      }
      const report = await deps.healthAnalyzer.analyze(sourceId);
      job.report = report;
      job.status = 'completed';
    } catch (err) {
      job.error = err instanceof Error ? err.message : String(err);
      job.status = 'failed';
    }
  }

  return {
    async search(request: FastifyRequest<{ Body: SearchRequest }>, reply: FastifyReply) {
      const start = Date.now();
      const { query, options } = request.body;
      if (!query || typeof query !== 'string') {
        return errorReply(reply, 400, 'INVALID_REQUEST', 'query is required');
      }
      try {
        const analyzed = await deps.queryAnalyzer.analyze(query);
        const results = await deps.retrievalService.search(analyzed, options);
        const assembled = await deps.contextAssembler.assemble(analyzed, results.selected, {
          maxTokens: options?.maxTokens,
        });
        const durationMs = Date.now() - start;
        await deps.auditService.log('search', undefined, undefined, {
          query,
          mode: options?.mode ?? 'semantic',
          resultCount: results.selected.length,
        });
        return reply.send({
          query,
          language: analyzed.language,
          intent: analyzed.intent,
          results,
          assembled,
          citations: results.citations,
          durationMs,
        });
      } catch (err) {
        return handleKnownError(reply, err);
      }
    },

    async searchStream(request: FastifyRequest<{ Body: SearchRequest }>, reply: FastifyReply) {
      const { query, options } = request.body;
      if (!query || typeof query !== 'string') {
        return errorReply(reply, 400, 'INVALID_REQUEST', 'query is required');
      }
      const stream = createSSEStream(reply);
      try {
        stream.write('query_analyzed', { event: 'query_analyzed', query });
        const analyzed = await deps.queryAnalyzer.analyze(query);
        stream.write('query_analyzed', { event: 'query_analyzed', language: analyzed.language, intent: analyzed.intent });

        const results = await deps.retrievalService.search(analyzed, options);
        stream.write('candidates_found', { event: 'candidates_found', count: results.candidates.length });

        const assembled = await deps.contextAssembler.assemble(analyzed, results.selected, {
          maxTokens: options?.maxTokens,
        });
        stream.write('context_ready', {
          event: 'context_ready',
          tokens: assembled.totalTokens,
          citations: assembled.citations.length,
        });

        stream.write('complete', { event: 'complete', assembled });
        stream.close();
      } catch (err) {
        if (err instanceof BaseRetineoError) {
          stream.write('error', { event: 'error', code: err.code, message: err.message });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          stream.write('error', { event: 'error', message: msg });
        }
        stream.close();
      }
    },

    async ingest(request: FastifyRequest<{ Body: IngestRequest }>, reply: FastifyReply) {
      const { sourcePath, mimeType, adapterId } = request.body;
      if (!sourcePath || typeof sourcePath !== 'string') {
        return errorReply(reply, 400, 'INVALID_REQUEST', 'sourcePath is required');
      }
      try {
        const result = await deps.ingestionService.ingestFile(sourcePath);
        await deps.auditService.log('ingest', result.contentHash, undefined, { externalId: sourcePath });
        const sourceId = 'filesystem';
        return reply.send({
          sourceId,
          contentHash: result.contentHash,
          action: result.action,
          status: result.action === 'unchanged' ? 'skipped' : 'queued',
        });
      } catch (err) {
        if (err instanceof BaseRetineoError) {
          return reply.status(err.statusCode).send({
            error: { code: err.code, message: err.message, details: { ...err.details, sourcePath, adapterId } },
          });
        }
        const msg = err instanceof Error ? err.message : String(err);
        return errorReply(reply, 422, 'INGEST_FAILED', msg, { sourcePath, adapterId });
      }
    },

    async status(_request: FastifyRequest, reply: FastifyReply) {
      try {
        const sources = deps.registry.listSources();
        const pending = deps.registry.getPendingJobs(1000);
        const allJobs = pending;

        // Read actual vector count from embeddings.jsonl
        let vectorCount = 0;
        try {
          const embeddingsPath = path.join(deps.indexDir, 'embeddings.jsonl');
          if (existsSync(embeddingsPath)) {
            const { readFileSync } = await import('fs');
            const raw = readFileSync(embeddingsPath, 'utf-8').trim();
            if (raw) {
              vectorCount = raw.split('\n').filter((l: string) => l.trim()).length;
            }
          }
        } catch {
          // ignore — index may not exist yet
        }

        const body: StatusResponse = {
          version: deps.version,
          nodeCount: sources.length,
          sourceCount: sources.length,
          jobCount: {
            pending: allJobs.length,
            running: 0,
            completed: 0,
            failed: 0,
          },
          indexStatus: {
            vectorCount,
            lastIndexed: new Date().toISOString(),
          },
        };
        return reply.send(body);
      } catch (err) {
        return handleKnownError(reply, err);
      }
    },

    async getNode(request: FastifyRequest<{ Params: { hash: string } }>, reply: FastifyReply) {
      const { hash } = request.params;
      try {
        const objPath = deps.cas.getObjectPath(hash);
        const nodeJsonPath = path.join(objPath, 'node.json');
        if (!existsSync(nodeJsonPath)) {
          return errorReply(reply, 404, 'NOT_FOUND', `Node not found: ${hash}`);
        }
        const nodeRaw = await readFileAsync(nodeJsonPath, 'utf-8');
        const node = JSON.parse(nodeRaw) as NodeResponse['node'];
        const artifacts: NodeResponse['artifacts'] = {};
        if (existsSync(path.join(objPath, 'content.md'))) artifacts.l0 = path.join(objPath, 'content.md');
        if (existsSync(path.join(objPath, 'L1.md'))) artifacts.l1 = path.join(objPath, 'L1.md');
        if (existsSync(path.join(objPath, 'L2.json'))) artifacts.l2 = path.join(objPath, 'L2.json');
        const buildRaw = await readFileAsync(path.join(objPath, 'node.json'), 'utf-8');
        return reply.send({ node, artifacts, build: JSON.parse(buildRaw) });
      } catch (err) {
        return handleKnownError(reply, err);
      }
    },

    async listNodes(_request: FastifyRequest, reply: FastifyReply) {
      try {
        const sources = deps.registry.listSources();
        const nodes: Array<{ sourceId: string; externalId: string; contentHash: string; status: string; lastSeenAt: string }> = [];
        for (const src of sources) {
          nodes.push({
            sourceId: src.sourceId,
            externalId: src.externalId,
            contentHash: src.contentHash,
            status: src.status,
            lastSeenAt: new Date(src.lastSeenAt).toISOString(),
          });
        }
        return reply.send({ nodes, total: nodes.length });
      } catch (err) {
        return handleKnownError(reply, err);
      }
    },

    async getSource(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const { id } = request.params;
      // PR1: filesystem-only mapping; PR3 will introduce composite source keys
      const source = deps.registry.get('filesystem', id);
      if (!source) {
        return errorReply(reply, 404, 'NOT_FOUND', `Source not found: ${id}`);
      }
      const body: SourceResponse = {
        sourceId: source.sourceId,
        externalId: source.externalId,
        contentHash: source.contentHash,
        etag: source.etag,
        status: source.status,
        deletedAt: source.deletedAt,
        lastSeenAt: new Date(source.lastSeenAt).toISOString(),
      };
      return reply.send(body);
    },

    async getJob(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      // Registry lacks getJob public method; use internal via any cast for MVP
      const registryAny = deps.registry as unknown as { getJob?: (id: string) => JobRecord | null };
      const job = registryAny.getJob?.(request.params.id) ?? null;
      if (!job) {
        return errorReply(reply, 404, 'NOT_FOUND', `Job not found: ${request.params.id}`);
      }
      const body: JobResponse = {
        id: job.id,
        type: job.type,
        status: job.status,
        createdAt: job.createdAt,
        startedAt: job.startedAt ?? undefined,
        completedAt: job.completedAt ?? undefined,
      };
      return reply.send(body);
    },

    async health(request: FastifyRequest<{ Body: { sourceId?: string; path?: string } }>, reply: FastifyReply) {
      const { sourceId, path: sourcePath } = request.body ?? {};
      if (!sourceId && !sourcePath) {
        return errorReply(reply, 400, 'INVALID_REQUEST', 'sourceId or path is required');
      }
      if (!deps.healthAnalyzer) {
        return errorReply(reply, 503, 'NOT_CONFIGURED', 'Health analyzer is not configured');
      }

      try {
        const jobId = crypto.randomUUID();
        healthJobs.set(jobId, { status: 'pending' });

        let resolvedSourceId = sourceId;
        if (!resolvedSourceId && sourcePath) {
          const syncResult = await deps.ingestionService.syncDirectory(sourcePath);
          resolvedSourceId = syncResult.sourceId;
        }

        if (!resolvedSourceId) {
          healthJobs.delete(jobId);
          return errorReply(reply, 400, 'INVALID_REQUEST', 'Could not resolve source id');
        }

        void runHealthJob(jobId, resolvedSourceId);
        return reply.send({ jobId, status: 'pending' });
      } catch (err) {
        return handleKnownError(reply, err);
      }
    },

    async getHealthJob(request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) {
      const { jobId } = request.params;
      const job = healthJobs.get(jobId);
      if (!job) {
        return errorReply(reply, 404, 'NOT_FOUND', `Health job not found: ${jobId}`);
      }
      return reply.send({ jobId, status: job.status });
    },

    async getReport(request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) {
      const { jobId } = request.params;
      const job = healthJobs.get(jobId);
      if (!job) {
        return errorReply(reply, 404, 'NOT_FOUND', `Health job not found: ${jobId}`);
      }
      if (job.status === 'pending' || job.status === 'running') {
        return reply.status(202).send({ jobId, status: job.status });
      }
      if (job.status === 'failed') {
        return errorReply(reply, 500, 'HEALTH_FAILED', job.error ?? 'Health analysis failed');
      }
      return reply.send({ jobId, status: job.status, report: job.report });
    },

    async jobEvents(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const { id } = request.params;
      const stream = createSSEStream(reply);
      // MVP: emit a single progress then complete since we have no live job tracker
      stream.write('progress', { event: 'progress', jobId: id, percent: 100, stage: 'done' });
      stream.write('complete', { event: 'complete', jobId: id, result: {} });
      stream.close();
    },

    async similar(request: FastifyRequest<{ Body: import('./types.js').SimilarRequest }>, reply: FastifyReply) {
      const { hash, topK, threshold, includeGhosts } = request.body;
      if (!hash || typeof hash !== 'string') {
        return errorReply(reply, 400, 'INVALID_REQUEST', 'hash is required');
      }
      if (!deps.similarityService) {
        return errorReply(reply, 503, 'NOT_CONFIGURED', 'Similarity service is not configured');
      }
      try {
        const results = await deps.similarityService.findSimilar(hash, {
          topK,
          threshold,
          includeGhosts,
        });
        await deps.auditService.log('similar', hash, undefined, { resultCount: results.length });
        return reply.send({ results });
      } catch (err) {
        return handleKnownError(reply, err);
      }
    },
  };
}
