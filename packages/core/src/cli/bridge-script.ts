/**
 * RETINEO Core — Standalone Bridge Script
 *
 * Used as the entry point for `child_process.fork()` from
 * `retineo bridge start`. Wires real services: SQLiteRegistry, CAS,
 * IngestionService, FastifyBridgeServer. Listens for SIGTERM.
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
import { FastifyBridgeServer } from '../bridge/server.js';
import { DefaultHealthService } from '../bridge/health.js';
import { DefaultMetricsService } from '../bridge/metrics.js';
import { createLogger } from '../utils/logger.js';
import { DefaultShutdownManager } from '../utils/shutdown.js';
import path from 'path';

function resolveAdaptersDir(): string {
  const here = path.dirname(new URL(import.meta.url).pathname);
  return path.join(here, '..', '..', 'adapters');
}

export interface RunningBridgeServices {
  bridge: FastifyBridgeServer;
  registry: SQLiteRegistry;
  shutdownManager: DefaultShutdownManager;
  logger: ReturnType<typeof createLogger>;
}

export async function startBridgeServices(): Promise<RunningBridgeServices> {
  const configManager = new FileConfigManager(process.env.RETINEO_DATA_DIR);
  const config = await configManager.load();
  const dataDir = config.dataDir;
  const indexDir = path.join(dataDir, 'index');

  const logger = createLogger(config.logging);

  const cas = new LocalCASStorage(dataDir);
  const registry = new SQLiteRegistry(path.join(dataDir, 'retineo.sqlite'));

  const adapterRunner = new DefaultAdapterProcessRunner(dataDir, logger);
  const adapterManager = new DefaultAdapterManager(resolveAdaptersDir(), adapterRunner);
  try {
    await adapterManager.loadBuiltIn();
  } catch {
    // ignore
  }

  const nodeBuilder = new DefaultNodeBuilder();

  // LLM providers from config
  const secrets = new FileSecretsManager(path.join(dataDir, 'secrets.json'));
  const llmFactory = new DefaultLLMProviderFactory();
  const embedFactory = new DefaultEmbeddingProviderFactory();
  await llmFactory.loadFromConfig(config, secrets);
  await embedFactory.loadFromConfig(config, secrets);

  const llmProvider = llmFactory.getDefault();
  const embedder = embedFactory.getDefault();

  const queryAnalyzer = new DefaultQueryAnalyzer({ searchConfig: config.search });
  const retrievalService = new DefaultRetrievalService({
    embeddingProvider: embedder,
    casStorage: cas,
    indexDir,
    config: config.search,
    logger,
  });
  const contextAssembler = new DefaultContextAssembler({ config: config.search });

  const ingestionService = new DefaultIngestionService(
    cas,
    registry,
    nodeBuilder,
    adapterManager,
    computeHash,
    logger,
  );

  const shutdownManager = new DefaultShutdownManager({ logger, timeoutMs: 10000 });
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
      version: '0.1.0',
      indexDir,
    },
    healthDeps: {
      healthService: new DefaultHealthService({ registry, cas, llmProvider, indexDir, shutdownManager }),
      metricsService: new DefaultMetricsService({
        registry,
        cas,
        indexDir,
        counters: { searchTotal: 0, searchDurationMs: 0, llmRequests: 0, llmErrors: 0, llmLatencyMs: 0, adapterIngests: {} },
      }),
    },
    logger,
    shutdownManager,
  });

  return { bridge, registry, shutdownManager, logger };
}

async function main(): Promise<void> {
  const services = await startBridgeServices();
  process.on('SIGTERM', () => {
    services.logger.info('bridge.signal', { signal: 'SIGTERM' });
    void services.shutdownManager.initiate('SIGTERM');
  });
  process.on('SIGINT', () => {
    services.logger.info('bridge.signal', { signal: 'SIGINT' });
    void services.shutdownManager.initiate('SIGINT');
  });
  services.shutdownManager.register(async () => {
    await services.bridge.stop();
  });
  services.shutdownManager.register(async () => {
    services.registry.close();
  });
  await services.bridge.start();
  services.logger.info('bridge.ready', { port: services.bridge.getPort() });
}

if (process.env.RETINEO_BRIDGE_SCRIPT === '1' || process.argv[1]?.endsWith('bridge-script.js')) {
  main().catch((err) => {
    console.error('Bridge failed:', err);
    process.exit(1);
  });
}
