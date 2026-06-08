/**
 * ECHO Core — Bridge Handlers
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
import type { IngestionService } from '../adapters/ingestion.js';
import type { Registry } from '../storage/registry.js';
import type { CASStorage } from '../storage/cas.js';
import type { ConfigManager } from '../storage/config.js';
import type { JobRecord } from '../domain/types.js';
import { createSSEStream } from './sse.js';
import { readFile, existsSync } from 'fs';
import { promisify } from 'util';
import path from 'path';

const readFileAsync = promisify(readFile);

export interface BridgeHandlersDeps {
  queryAnalyzer: QueryAnalyzer;
  retrievalService: RetrievalService;
  contextAssembler: ContextAssembler;
  ingestionService: IngestionService;
  registry: Registry;
  cas: CASStorage;
  configManager: ConfigManager;
  version: string;
  indexDir: string;
}

function errorReply(reply: FastifyReply, status: number, code: string, message: string, details?: Record<string, unknown>) {
  const body: { error: BridgeError } = {
    error: { code, message, details },
  };
  return reply.status(status).send(body);
}

export function createHandlers(deps: BridgeHandlersDeps) {
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
        const msg = err instanceof Error ? err.message : String(err);
        return errorReply(reply, 500, 'SEARCH_FAILED', msg);
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
        const msg = err instanceof Error ? err.message : String(err);
        stream.write('error', { event: 'error', message: msg });
        stream.close();
      }
    },

    async ingest(request: FastifyRequest<{ Body: IngestRequest }>, reply: FastifyReply) {
      const { sourcePath, mimeType, adapterId } = request.body;
      if (!sourcePath || typeof sourcePath !== 'string') {
        return errorReply(reply, 400, 'INVALID_REQUEST', 'sourcePath is required');
      }
      try {
        const node = await deps.ingestionService.ingestFile(sourcePath);
        const sourceId = node.sourceRef.uri; // simplistic mapping
        const jobs: string[] = [];
        // Jobs were queued inside ingestion service; we don't have IDs here in MVP
        return reply.send({
          sourceId,
          rootHash: node.id,
          status: 'queued',
          jobs,
        });
      } catch (err) {
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
        const msg = err instanceof Error ? err.message : String(err);
        return errorReply(reply, 500, 'INTERNAL_ERROR', msg);
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
        const msg = err instanceof Error ? err.message : String(err);
        return errorReply(reply, 500, 'INTERNAL_ERROR', msg);
      }
    },

    async listNodes(_request: FastifyRequest, reply: FastifyReply) {
      try {
        const sources = deps.registry.listSources();
        const nodes: Array<{ hash: string; uri: string; lastSeenAt: string }> = [];
        for (const src of sources) {
          if (src.rootHash) {
            nodes.push({
              hash: src.rootHash,
              uri: src.uri,
              lastSeenAt: src.lastSeenAt,
            });
          }
        }
        return reply.send({ nodes, total: nodes.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorReply(reply, 500, 'INTERNAL_ERROR', msg);
      }
    },

    async getSource(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const { id } = request.params;
      const source = deps.registry.getSource(id);
      if (!source) {
        return errorReply(reply, 404, 'NOT_FOUND', `Source not found: ${id}`);
      }
      const body: SourceResponse = {
        id: source.id,
        protocol: source.protocol,
        uri: source.uri,
        mimeType: source.mimeType,
        adapterId: source.adapterId,
        rootHash: source.rootHash,
        lastSeenAt: source.lastSeenAt,
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

    async jobEvents(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const { id } = request.params;
      const stream = createSSEStream(reply);
      // MVP: emit a single progress then complete since we have no live job tracker
      stream.write('progress', { event: 'progress', jobId: id, percent: 100, stage: 'done' });
      stream.write('complete', { event: 'complete', jobId: id, result: {} });
      stream.close();
    },
  };
}
