/**
 * RETINEO Core — Programmatic Runtime API
 *
 * A single facade that wires together the existing internal services
 * (ingestion, health, similarity, registry, CAS) so external consumers
 * can embed Core without spawning CLI/bridge processes.
 *
 * This file intentionally does NOT contain business logic; it only
 * composes public interfaces from the rest of the codebase.
 */

import path from 'path';
import { existsSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import type { RetineoConfig, LLMConfig, EmbeddingConfig, SearchConfig, LoggingConfig, I18nConfig } from '../storage/config.js';
import { FileConfigManager } from '../storage/config.js';
import { LocalCASStorage, type NodeArtifacts as CASNodeArtifacts, computeHash } from '../storage/cas.js';
import { SQLiteRegistry, type Registry } from '../storage/registry.js';
import { DefaultNodeBuilder } from '../storage/node-builder.js';
import { DefaultContextNodeRepository } from '../storage/context-node-repository.js';
import { FileSecretsManager } from '../storage/secrets.js';
import { DefaultAdapterManager } from '../adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../adapters/runner.js';
import { DefaultIngestionService } from '../services/ingestion-service.js';
import { DefaultRetrievalService } from '../search/retrieval-service.js';
import { createSimilarityService, type SimilarOptions, type SimilarDocument } from '../search/similarity-service.js';
import { DefaultCompilationPipeline, type CompilationPipeline } from '../layers/pipeline.js';
import { DefaultL1Generator } from '../layers/l1-generator.js';
import { DefaultL2Generator } from '../layers/l2-generator.js';
import { DefaultL3Generator } from '../layers/l3-generator.js';
import { DefaultQueueWorker } from '../layers/worker.js';
import { DefaultHealthAnalyzer } from '../health/health-analyzer.js';
import type { HealthReport } from '../health/types.js';
import { DefaultLLMProviderFactory, DefaultEmbeddingProviderFactory } from '../llm/factory.js';
import { MockLLMProvider } from '../llm/providers/mock.js';
import { createLogger, type Logger } from '../utils/logger.js';

export interface CreateCoreOptions {
  /** Data directory for CAS, registry, indexes, and config. */
  dataDir: string;
  /** Optional config overrides (same shape as config.yaml). */
  config?: Partial<RetineoConfig>;
  /** Optional logger. Defaults to a console+file logger from config. */
  logger?: Logger;
}

export interface CoreHandle {
  ingest(path: string, opts?: { force?: boolean }): Promise<IngestResult>;
  health(): Promise<HealthReport>;
  findSimilar(contentHash: string, opts?: SimilarOptions): Promise<SimilarDocument[]>;
  listDocuments(opts?: { includeGhosts?: boolean }): Promise<DocumentSummary[]>;
  getNode(contentHash: string): Promise<NodeArtifacts | null>;
  close(): Promise<void>;
}

export interface DocumentSummary {
  contentHash: string;
  sourcePath?: string;
  status: 'active' | 'ghost';
  createdAt?: string;
  lastSeenAt?: string;
}

export interface NodeArtifacts {
  contentHash: string;
  sourcePath?: string;
  l0Excerpt?: string;
  l1?: unknown;
  l2Summary?: string;
}

export interface IngestResult {
  discovered: number;
  ingested: number;
  skipped: number;
  failed: Array<{ path: string; error: string }>;
}

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

const DEFAULT_MOCK_LLM = new MockLLMProvider({ id: 'mock-llm', type: 'mock', model: 'mock-llm' });
const DEFAULT_MOCK_EMBEDDER = new MockLLMProvider({ id: 'mock-embedder', type: 'mock', model: 'mock-embedder', dimension: 384 });

function mergeConfig(base: RetineoConfig, overrides: DeepPartial<RetineoConfig>): RetineoConfig {
  const merged: RetineoConfig = { ...base };

  if (overrides.dataDir !== undefined) merged.dataDir = overrides.dataDir;
  if (overrides.defaultAdapter !== undefined) merged.defaultAdapter = overrides.defaultAdapter;
  if (overrides.llmProvider !== undefined) merged.llmProvider = overrides.llmProvider;
  if (overrides.embeddingModel !== undefined) merged.embeddingModel = overrides.embeddingModel;

  if (overrides.llm !== undefined) {
    merged.llm = {
      defaultProvider: (overrides.llm as LLMConfig).defaultProvider ?? base.llm.defaultProvider,
      providers: (overrides.llm as LLMConfig).providers ?? base.llm.providers,
    };
  }
  if (overrides.embedding !== undefined) {
    merged.embedding = {
      defaultProvider: (overrides.embedding as EmbeddingConfig).defaultProvider ?? base.embedding.defaultProvider,
      providers: (overrides.embedding as EmbeddingConfig).providers ?? base.embedding.providers,
    };
  }
  if (overrides.search !== undefined) {
    merged.search = { ...base.search, ...(overrides.search as SearchConfig) };
  }
  if (overrides.i18n !== undefined) {
    merged.i18n = { ...base.i18n, ...(overrides.i18n as I18nConfig) };
  }
  if (overrides.bridge !== undefined) {
    merged.bridge = { ...base.bridge, ...(overrides.bridge as RetineoConfig['bridge']) };
  }
  if (overrides.logging !== undefined) {
    merged.logging = { ...base.logging, ...(overrides.logging as LoggingConfig) };
  }

  return merged;
}

function hasAdapterManifest(dir: string): boolean {
  return existsSync(path.join(dir, 'markdown', 'manifest.json')) || existsSync(path.join(dir, 'text', 'manifest.json'));
}

function resolveAdaptersDir(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Compiled layout: dist/runtime -> dist/adapters
    path.join(here, '..', 'adapters'),
    // Source layout: packages/core/src/runtime -> packages/core/adapters
    path.join(here, '..', '..', 'adapters'),
    // Source layout alternate: packages/core/src/runtime -> packages/core/src/adapters
    path.join(here, '..', '..', 'src', 'adapters'),
    // Test/process CWD fallbacks
    path.join(process.cwd(), 'packages', 'core', 'adapters'),
    path.join(process.cwd(), 'dist', 'adapters'),
  ];
  for (const dir of candidates) {
    if (hasAdapterManifest(dir)) return dir;
  }
  return undefined;
}

async function loadAdapterManager(dataDir: string, logger: Logger): Promise<DefaultAdapterManager | undefined> {
  const adaptersDir = resolveAdaptersDir();
  if (!adaptersDir) return undefined;

  const runner = new DefaultAdapterProcessRunner(dataDir, logger);
  const manager = new DefaultAdapterManager(adaptersDir, runner);
  try {
    await manager.loadBuiltIn();
    return manager;
  } catch {
    return undefined;
  }
}

export interface DrainJobsOptions {
  /** Hard cap for the whole drain. Default: 30 minutes. */
  timeoutMs?: number;
  /** Progress log cadence. Default: 5 seconds. */
  progressEveryMs?: number;
}

async function drainJobs(
  registry: Registry,
  pipeline: CompilationPipeline,
  logger: Logger,
  options: DrainJobsOptions = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const progressEveryMs = options.progressEveryMs ?? 5000;
  const worker = new DefaultQueueWorker({
    workerId: `runtime-${Date.now()}`,
    registry,
    pipeline,
    logger,
    pollIntervalMs: 10,
  });
  const start = Date.now();
  let processed = 0;
  let lastProgressAt = 0;
  try {
    // Process every pending job once. processNext returns false when the queue is empty.
    let safety = 0;
    const maxIterations = 10000;
    while (safety < maxIterations) {
      if (Date.now() - start > timeoutMs) {
        const counts = registry.getJobCounts();
        logger.error('drainJobs.timeout', {
          timeoutMs,
          processed,
          remaining: counts.pending + counts.running,
        });
        return;
      }
      const didProcess = await worker.processNext();
      if (!didProcess) break;
      safety++;
      processed++;
      if (Date.now() - lastProgressAt >= progressEveryMs) {
        lastProgressAt = Date.now();
        const counts = registry.getJobCounts();
        const remaining = counts.pending + counts.running;
        logger.info('drainJobs.progress', {
          processed: `${processed}/${processed + remaining}`,
          remaining,
        });
      }
    }
    logger.info('drainJobs.complete', { processed, durationMs: Date.now() - start });
  } finally {
    await worker.stop();
  }
}

export async function createCore(options: CreateCoreOptions): Promise<CoreHandle> {
  if (!options.dataDir) {
    throw new Error('createCore requires options.dataDir');
  }

  const dataDir = path.resolve(options.dataDir);
  const configManager = new FileConfigManager(dataDir);
  const baseConfig = await configManager.load();
  const config = mergeConfig(baseConfig, (options.config ?? {}) as DeepPartial<RetineoConfig>);

  const logger = options.logger ?? createLogger(config.logging);

  const cas = new LocalCASStorage(dataDir);
  const dbPath = path.join(dataDir, 'retineo.sqlite');
  const registry = new SQLiteRegistry(dbPath);
  const nodeBuilder = new DefaultNodeBuilder();
  const contextNodeRepository = new DefaultContextNodeRepository(cas, registry);

  const adapterManager = await loadAdapterManager(dataDir, logger);

  const secretsManager = new FileSecretsManager(path.join(dataDir, 'secrets.json'));
  const llmFactory = new DefaultLLMProviderFactory();
  const embedFactory = new DefaultEmbeddingProviderFactory();

  try {
    await llmFactory.loadFromConfig(config, secretsManager);
  } catch (err) {
    logger.warn('runtime.providerLoadFailed', { type: 'llm', error: err instanceof Error ? err.message : String(err) });
  }
  try {
    await embedFactory.loadFromConfig(config, secretsManager);
  } catch (err) {
    logger.warn('runtime.providerLoadFailed', { type: 'embedding', error: err instanceof Error ? err.message : String(err) });
  }

  let llmProvider = llmFactory.list().length > 0 ? llmFactory.getDefault() : null;
  let embedder = embedFactory.list().length > 0 ? embedFactory.getDefault() : null;

  // Fall back to deterministic mock providers if the config has no usable providers.
  // This keeps the facade usable out-of-the-box, while still honoring explicit config.
  if (!llmProvider) llmProvider = DEFAULT_MOCK_LLM;
  if (!embedder) embedder = DEFAULT_MOCK_EMBEDDER;

  const indexDir = path.join(dataDir, 'index');
  const retrievalService = new DefaultRetrievalService({
    embeddingProvider: embedder,
    casStorage: cas,
    registry,
    indexDir,
    config: config.search,
    logger,
  });
  const similarityService = createSimilarityService({ retrievalService, registry, indexDir, logger });

  const l1Generator = new DefaultL1Generator();
  const l2Generator = new DefaultL2Generator();
  const l3Generator = new DefaultL3Generator();

  const pipeline = new DefaultCompilationPipeline({
    cas,
    registry,
    contextNodeRepository,
    l1Generator,
    l2Generator,
    l3Generator,
    llmProvider,
    embeddingProvider: embedder,
    retrievalService,
    dataDir,
    logger,
  });

  const ingestionService = new DefaultIngestionService(
    cas,
    registry,
    nodeBuilder,
    adapterManager,
    pipeline,
    computeHash,
    logger,
    registry,
  );

  const healthAnalyzer = new DefaultHealthAnalyzer({ cas, registry, indexDir });

  let lastSourceId: string | undefined;
  let closed = false;

  const assertOpen = (): void => {
    if (closed) throw new Error('Core handle has been closed');
  };

  return {
    async ingest(targetPath, opts = {}) {
      assertOpen();
      const absolutePath = path.resolve(targetPath);
      if (!existsSync(absolutePath)) {
        throw new Error(`Ingest path not found: ${targetPath}`);
      }

      const failed: Array<{ path: string; error: string }> = [];

      try {
        const stat = statSync(absolutePath);
        if (stat.isFile()) {
          const result = await ingestionService.ingestFile(absolutePath);
          lastSourceId = `filesystem:${path.dirname(absolutePath)}`;
          await drainJobs(registry, pipeline, logger);
          return {
            discovered: 1,
            ingested: result.action === 'unchanged' ? 0 : 1,
            skipped: result.action === 'unchanged' ? 1 : 0,
            failed,
          };
        }

        // Directory sync: use the existing service so ghost detection works.
        const sync = await ingestionService.syncDirectory(absolutePath);
        lastSourceId = sync.sourceId;

        if (opts.force) {
          // Force is accepted for API compatibility but the existing sync already
          // re-ingests changed files. A full force-resync would require resetting
          // etags; consumers that need that can delete and re-create the data dir.
          logger.debug('runtime.ingest.forceIgnored', { sourceId: sync.sourceId });
        }

        const entries = registry.listBySourceId(sync.sourceId);
        const activeCount = entries.filter((e) => e.status === 'active').length;
        const discovered = activeCount;
        const ingested = sync.processed;
        const skipped = Math.max(0, discovered - ingested);

        await drainJobs(registry, pipeline, logger);

        return { discovered, ingested, skipped, failed };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ path: targetPath, error: message });
        return { discovered: 0, ingested: 0, skipped: 0, failed };
      }
    },

    async health() {
      assertOpen();
      if (!lastSourceId) {
        throw new Error('No source has been ingested. Call ingest() before health().');
      }
      return healthAnalyzer.analyze(lastSourceId);
    },

    async findSimilar(contentHash, opts) {
      assertOpen();
      return similarityService.findSimilar(contentHash, opts);
    },

    async listDocuments(opts = {}) {
      assertOpen();
      const entries = registry.listSources();
      const summaries: DocumentSummary[] = [];
      for (const entry of entries) {
        const status = entry.status === 'active' ? 'active' : 'ghost';
        if (!opts.includeGhosts && status === 'ghost') continue;
        summaries.push({
          contentHash: entry.contentHash,
          sourcePath: entry.externalId,
          status,
          createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : undefined,
          lastSeenAt: entry.lastSeenAt ? new Date(entry.lastSeenAt).toISOString() : undefined,
        });
      }
      return summaries;
    },

    async getNode(contentHash) {
      assertOpen();
      const entries = registry.listByContentHash(contentHash);
      if (entries.length === 0 && !cas.exists(contentHash)) {
        return null;
      }

      let artifacts: CASNodeArtifacts;
      try {
        ({ artifacts } = await cas.readObject(contentHash));
      } catch {
        return null;
      }

      const active = entries.find((e) => e.status === 'active');
      const sourcePath = active?.externalId ?? entries[0]?.externalId;

      let l1: unknown = undefined;
      if (artifacts.l1) {
        try {
          const l1IndexPath = path.join(cas.getObjectPath(contentHash), 'L1.index.json');
          const raw = await readFile(l1IndexPath, 'utf-8');
          l1 = JSON.parse(raw);
        } catch {
          // If the derived index is unreadable, fall back to the raw markdown outline.
          l1 = artifacts.l1;
        }
      }

      return {
        contentHash,
        sourcePath,
        l0Excerpt: artifacts.content?.slice(0, 500),
        l1,
        l2Summary: artifacts.l2?.summary,
      };
    },

    async close() {
      if (closed) return;
      closed = true;
      registry.close();
    },
  };
}
