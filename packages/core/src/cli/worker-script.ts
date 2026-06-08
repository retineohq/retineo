/**
 * ECHO Core — Standalone Worker Script
 *
 * Used as the entry point for `child_process.fork()` from
 * `echoc worker start` and from `echoc daemon start`.
 *
 * Wires real services: SQLiteRegistry, CAS, IngestionService, Pipeline,
 * QueueWorker. Listens for SIGTERM for graceful shutdown.
 */

import { FileConfigManager } from '../storage/config.js';
import { LocalCASStorage, computeHash } from '../storage/cas.js';
import { SQLiteRegistry } from '../storage/registry.js';
import { DefaultNodeBuilder } from '../storage/node-builder.js';
import { DefaultAdapterManager } from '../adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../adapters/runner.js';
import { DefaultIngestionService } from '../adapters/ingestion.js';
import { DefaultLLMProviderFactory, DefaultEmbeddingProviderFactory } from '../llm/factory.js';
import { FileSecretsManager } from '../storage/secrets.js';
import { DefaultCompilationPipeline } from '../layers/pipeline.js';
import { DefaultQueueWorker } from '../layers/worker.js';
import { DefaultL1Generator } from '../layers/l1-generator.js';
import { DefaultL2Generator } from '../layers/l2-generator.js';
import { DefaultL3Generator } from '../layers/l3-generator.js';
import { createLogger } from '../utils/logger.js';
import { DefaultShutdownManager } from '../utils/shutdown.js';
import path from 'path';

export interface WorkerScriptOptions {
  /** Worker id (default: `worker-<pid>`) */
  workerId?: string;
  /** Override log level (default: config.logging.level) */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** Force pretty console output (default: false) */
  pretty?: boolean;
}

export interface RunningServices {
  worker: DefaultQueueWorker;
  registry: SQLiteRegistry;
  shutdownManager: DefaultShutdownManager;
  logger: ReturnType<typeof createLogger>;
}

function resolveAdaptersDir(): string {
  // worker-script.js → ../../cli → ../../..
  // packages/core/src/cli/worker-script.ts → packages/core/src
  // For compiled: dist/cli/worker-script.js → ../..
  const here = path.dirname(new URL(import.meta.url).pathname);
  // Try dev layout first
  const dev = path.join(here, '..', '..', 'adapters');
  return dev;
}

export async function startWorkerServices(
  options: WorkerScriptOptions = {}
): Promise<RunningServices> {
  const configManager = new FileConfigManager(process.env.ECHO_DATA_DIR);
  const config = await configManager.load();
  const dataDir = config.dataDir;

  const logConfig = {
    ...config.logging,
    ...(options.logLevel ? { level: options.logLevel } : {}),
    ...(options.pretty ? { pretty: true, console: true } : {}),
  };
  const logger = createLogger(logConfig);

  // Storage
  const cas = new LocalCASStorage(dataDir);
  const registry = new SQLiteRegistry(path.join(dataDir, 'echo.sqlite'));

  // Adapters (best-effort)
  const adaptersDir = resolveAdaptersDir();
  const adapterRunner = new DefaultAdapterProcessRunner(dataDir, logger);
  const adapterManager = new DefaultAdapterManager(adaptersDir, adapterRunner);
  try {
    await adapterManager.loadBuiltIn();
  } catch {
    // ignore — adapters dir may be empty in test envs
  }

  // LLM providers from config
  const secrets = new FileSecretsManager(path.join(dataDir, 'secrets.json'));
  const llmFactory = new DefaultLLMProviderFactory();
  const embedFactory = new DefaultEmbeddingProviderFactory();
  await llmFactory.loadFromConfig(config, secrets);
  await embedFactory.loadFromConfig(config, secrets);

  const llmProvider = llmFactory.getDefault();
  const embedder = embedFactory.getDefault();

  // Reset circuit breakers on worker start so transient failures (e.g. Ollama not warm) recover
  for (const id of llmFactory.list()) {
    llmFactory.resetCircuitBreaker(id);
  }
  for (const id of embedFactory.list()) {
    embedFactory.resetCircuitBreaker(id);
  }

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

  const shutdownManager = new DefaultShutdownManager({ logger, timeoutMs: 10000 });
  const worker = new DefaultQueueWorker({
    workerId: options.workerId ?? `worker-${process.pid}`,
    registry,
    pipeline,
    logger,
    shutdownManager,
  });

  return { worker, registry, shutdownManager, logger };
}

/**
 * Standalone entry point for `fork()`. Starts worker and waits for SIGTERM.
 */
async function main(): Promise<void> {
  const services = await startWorkerServices();

  // Wire signal handlers
  process.on('SIGTERM', () => {
    services.logger.info('worker.signal', { signal: 'SIGTERM' });
    void services.shutdownManager.initiate('SIGTERM');
  });
  process.on('SIGINT', () => {
    services.logger.info('worker.signal', { signal: 'SIGINT' });
    void services.shutdownManager.initiate('SIGINT');
  });

  services.shutdownManager.register(async () => {
    await services.worker.stop();
  });
  services.shutdownManager.register(async () => {
    services.registry.close();
  });

  await services.worker.start();
  services.logger.info('worker.ready', { pid: process.pid });
}

const isForked =
  typeof process.send === 'function' ||
  process.env.ECHO_WORKER_SCRIPT === '1';

if (isForked) {
  main().catch((err) => {
    console.error('Worker failed:', err);
    process.exit(1);
  });
}
