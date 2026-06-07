/**
 * ECHO Core — Daemon
 *
 * Runs the worker and bridge in a single process. Graceful shutdown order:
 * bridge → worker → registry.
 *
 * MCP is intentionally NOT started here because it owns stdio (which would
 * conflict with the daemon's CLI output). Use the standalone `echo-mcp`
 * entry point for MCP clients.
 */

import { FileConfigManager } from '../storage/config.js';
import { LocalCASStorage, computeHash } from '../storage/cas.js';
import { SQLiteRegistry } from '../storage/registry.js';
import { DefaultNodeBuilder } from '../storage/node-builder.js';
import { DefaultAdapterManager } from '../adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../adapters/runner.js';
import { DefaultIngestionService } from '../adapters/ingestion.js';
import { DefaultQueryAnalyzer } from '../search/query-analyzer.js';
import { DefaultRetrievalService } from '../search/retrieval-service.js';
import { DefaultContextAssembler } from '../search/context-assembler.js';
import { DefaultLLMProviderFactory, DefaultEmbeddingProviderFactory } from '../llm/factory.js';
import { FileSecretsManager } from '../storage/secrets.js';
import { DefaultCompilationPipeline } from '../layers/pipeline.js';
import { DefaultQueueWorker } from '../layers/worker.js';
import { DefaultL1Generator } from '../layers/l1-generator.js';
import { DefaultL2Generator } from '../layers/l2-generator.js';
import { DefaultL3Generator } from '../layers/l3-generator.js';
import { FastifyBridgeServer } from '../bridge/server.js';
import { createHandlers } from '../bridge/handlers.js';
import { registerRoutes } from '../bridge/routes.js';
import { registerHealthRoutes } from '../bridge/routes-health.js';
import { DefaultHealthService } from '../bridge/health.js';
import { DefaultMetricsService } from '../bridge/metrics.js';
import { createLogger } from '../utils/logger.js';
import { DefaultShutdownManager } from '../utils/shutdown.js';
import path from 'path';

const VERSION = '0.1.0';

export interface DaemonServices {
  worker: DefaultQueueWorker;
  bridge: FastifyBridgeServer;
  registry: SQLiteRegistry;
  shutdownManager: DefaultShutdownManager;
  logger: ReturnType<typeof createLogger>;
}

function resolveAdaptersDir(): string {
  const here = path.dirname(new URL(import.meta.url).pathname);
  return path.join(here, '..', '..', 'adapters');
}

export async function startDaemonServices(): Promise<DaemonServices> {
  const configManager = new FileConfigManager(process.env.ECHO_DATA_DIR);
  const config = await configManager.load();
  const dataDir = config.dataDir;
  const indexDir = path.join(dataDir, 'index');

  const logger = createLogger(config.logging);

  // Storage
  const cas = new LocalCASStorage(dataDir);
  const registry = new SQLiteRegistry(path.join(dataDir, 'echo.sqlite'));

  // Adapters
  const adapterRunner = new DefaultAdapterProcessRunner(dataDir, logger);
  const adapterManager = new DefaultAdapterManager(resolveAdaptersDir(), adapterRunner);
  try {
    await adapterManager.loadBuiltIn();
  } catch {
    // ignore
  }

  // LLM providers from config
  const secrets = new FileSecretsManager(path.join(dataDir, 'secrets.json'));
  const llmFactory = new DefaultLLMProviderFactory();
  const embedFactory = new DefaultEmbeddingProviderFactory();
  await llmFactory.loadFromConfig(config, secrets);
  await embedFactory.loadFromConfig(config, secrets);

  const llmProvider = llmFactory.getDefault();
  const embedder = embedFactory.getDefault();

  // Generators
  const nodeBuilder = new DefaultNodeBuilder();
  const l1Generator = new DefaultL1Generator();
  const l2Generator = new DefaultL2Generator();
  const l3Generator = new DefaultL3Generator();

  const pipeline = new DefaultCompilationPipeline({
    cas,
    registry,
    l1Generator,
    l2Generator,
    l3Generator,
    llmProvider,
    embeddingProvider: embedder,
    dataDir,
    logger,
  });

  // Search
  const queryAnalyzer = new DefaultQueryAnalyzer({ searchConfig: config.search });
  const retrievalService = new DefaultRetrievalService({
    embeddingProvider: embedder,
    casStorage: cas,
    indexDir,
    config: config.search,
    logger,
  });
  const contextAssembler = new DefaultContextAssembler({ config: config.search });

  // Ingestion
  const ingestionService = new DefaultIngestionService(
    cas,
    registry,
    nodeBuilder,
    adapterManager,
    computeHash,
    logger,
  );

  // Worker
  const shutdownManager = new DefaultShutdownManager({ logger, timeoutMs: 10000 });
  const worker = new DefaultQueueWorker({
    workerId: `daemon-${process.pid}`,
    registry,
    pipeline,
    logger,
    shutdownManager,
  });

  // Bridge — direct Fastify wiring
  const bridge = new FastifyBridgeServer({
    host: config.bridge.host,
    port: config.bridge.port,
    deps: {
      queryAnalyzer,
      retrievalService,
      contextAssembler,
      ingestionService,
      registry,
      cas,
      configManager,
      version: VERSION,
      indexDir,
    },
    healthDeps: {
      healthService: new DefaultHealthService({
        registry,
        cas,
        llmProvider,
        indexDir,
        shutdownManager,
      }),
      metricsService: new DefaultMetricsService({
        registry,
        cas,
        indexDir,
        counters: {
          searchTotal: 0,
          searchDurationMs: 0,
          llmRequests: 0,
          llmErrors: 0,
          llmLatencyMs: 0,
          adapterIngests: {},
        },
      }),
    },
    logger,
    shutdownManager,
  });

  return { worker, bridge, registry, shutdownManager, logger };
}

/**
 * Run daemon: starts worker + bridge. Blocks until SIGTERM.
 */
export async function runDaemon(): Promise<void> {
  const services = await startDaemonServices();

  process.on('SIGTERM', () => {
    services.logger.info('daemon.signal', { signal: 'SIGTERM' });
    void services.shutdownManager.initiate('SIGTERM');
  });
  process.on('SIGINT', () => {
    services.logger.info('daemon.signal', { signal: 'SIGINT' });
    void services.shutdownManager.initiate('SIGINT');
  });

  // Shutdown order: bridge → worker → registry
  services.shutdownManager.register(async () => {
    await services.bridge.stop();
  });
  services.shutdownManager.register(async () => {
    await services.worker.stop();
  });
  services.shutdownManager.register(async () => {
    services.registry.close();
  });

  await services.bridge.start();
  services.logger.info('daemon.bridge.ready', { port: services.bridge.getPort() });
  await services.worker.start();
  services.logger.info('daemon.worker.ready', { pid: process.pid });
}

if (process.env.ECHO_DAEMON === '1' || process.argv[1]?.endsWith('daemon.js')) {
  runDaemon().catch((err) => {
    console.error('Daemon failed:', err);
    process.exit(1);
  });
}
