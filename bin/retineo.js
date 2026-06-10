#!/usr/bin/env node
/**
 * RETINEO Core — CLI Entry Point
 * Wires real services: SQLite registry, CAS, ingestion, search, logger.
 */

import { createCLI } from '../dist/cli/index.js';
import { FileConfigManager } from '../dist/storage/config.js';
import { LocalCASStorage, computeHash } from '../dist/storage/cas.js';
import { SQLiteRegistry } from '../dist/storage/registry.js';
import { DefaultNodeBuilder } from '../dist/storage/node-builder.js';
import { FileSecretsManager } from '../dist/storage/secrets.js';
import { DefaultAdapterManager } from '../dist/adapters/manager.js';
import { DefaultAdapterProcessRunner } from '../dist/adapters/runner.js';
import { DefaultIngestionService } from '../dist/adapters/ingestion.js';
import { DefaultQueryAnalyzer } from '../dist/search/query-analyzer.js';
import { DefaultRetrievalService } from '../dist/search/retrieval-service.js';
import { DefaultContextAssembler } from '../dist/search/context-assembler.js';
import { DefaultLLMProviderFactory, DefaultEmbeddingProviderFactory } from '../dist/llm/factory.js';
import { DefaultCompilationPipeline } from '../dist/layers/pipeline.js';
import { createLogger } from '../dist/utils/logger.js';
import path from 'path';
import os from 'os';

const VERSION = '0.1.0';

async function main() {
  // --- Config (load first so we can use logging settings) ---
  const configManager = new FileConfigManager();
  let config;
  try {
    config = await configManager.load();
  } catch {
    // Not initialized yet — use defaults
    const dataDir = path.join(os.homedir(), '.retineo');
    config = {
      dataDir,
      defaultAdapter: 'file',
      llmProvider: 'ollama',
      embeddingModel: 'nomic-embed-text',
      llm: {
        defaultProvider: 'ollama',
        providers: [
          { id: 'ollama', type: 'ollama', baseUrl: 'http://localhost:11434', model: 'rnj-1:8b-cloud', temperature: 0.3, maxTokens: 4096, concurrency: 1, timeoutMs: 60000 },
        ],
      },
      embedding: {
        defaultProvider: 'ollama',
        providers: [
          { id: 'ollama', type: 'ollama', baseUrl: 'http://localhost:11434', model: 'nomic-embed-text', concurrency: 1, timeoutMs: 60000, dimension: 768 },
        ],
      },
      bridge: { host: '127.0.0.1', port: 37891 },
      search: {
        defaultLanguage: 'en',
        languageDetection: { provider: 'franc', fallback: 'heuristic', confidenceThreshold: 0.7 },
        semantic: { topK: 100, threshold: 0.5, hybridWeight: 0.7 },
        rerank: { topK: 10, weights: { concept: 1.0, claim: 0.5, summary: 0.8, language: 0.3 } },
        cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
        citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
        prompts: {},
        crossLingual: { enabled: true },
      },
      i18n: { defaultLanguage: 'en', packs: [] },
      logging: {
        level: 'info',
        console: true,
        file: true,
        filePath: path.join(dataDir, 'logs', 'retineo.log'),
        pretty: false,
      },
    };
  }

  // --- Logger (DualLogger: console + file) ---
  // Check for --verbose in process.argv before creating logger
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  if (verbose) {
    process.env.RETINEO_LOG_LEVEL = 'debug';
    process.env.RETINEO_LOG_CONSOLE = 'true';
    process.env.RETINEO_LOG_PRETTY = 'true';
  }
  const logConfig = config.logging || {
    level: 'info',
    console: true,
    file: true,
    filePath: path.join(config.dataDir, 'logs', 'retineo.log'),
    pretty: false,
  };
  if (verbose) {
    logConfig.level = 'debug';
    logConfig.pretty = true;
    logConfig.console = true;
  }
  const logger = createLogger(logConfig);

  const resolvedDataDir = config.dataDir || dataDir;

  // --- Storage ---
  const cas = new LocalCASStorage(resolvedDataDir);
  const dbPath = path.join(resolvedDataDir, 'retineo.sqlite');
  const registry = new SQLiteRegistry(dbPath);

  // --- Node builder ---
  const nodeBuilder = new DefaultNodeBuilder();

  // --- Adapter manager ---
  // Adapters live in the package directory, not cwd
  // Try multiple locations: dev (packages/core/adapters), installed (dist/adapters), global (../packages/core/adapters)
  const packageDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
  const possibleAdapterDirs = [
    path.join(packageDir, '..', 'packages', 'core', 'adapters'),
    path.join(packageDir, '..', 'dist', 'adapters'),
    path.join(packageDir, '..', 'adapters'),
  ];
  let adaptersDir = possibleAdapterDirs[0];
  for (const dir of possibleAdapterDirs) {
    try {
      const { existsSync } = await import('fs');
      if (existsSync(dir)) {
        adaptersDir = dir;
        break;
      }
    } catch {
      // ignore
    }
  }
  const adapterRunner = new DefaultAdapterProcessRunner(resolvedDataDir, logger);
  const adapterManager = new DefaultAdapterManager(adaptersDir, adapterRunner);
  try {
    await adapterManager.loadBuiltIn();
  } catch {
    // No adapters dir — ingestion will fail with clear error later
  }

  // --- Ingestion service (real) ---
  const ingestionService = new DefaultIngestionService(
    cas,
    registry,
    nodeBuilder,
    adapterManager,
    computeHash,
    logger,
  );

  // --- Search ---
  const secretsManager = new FileSecretsManager(path.join(resolvedDataDir, 'secrets.json'));
  const queryAnalyzer = new DefaultQueryAnalyzer({ searchConfig: config.search });

  // --- LLM / Embedding providers from config ---
  const llmFactory = new DefaultLLMProviderFactory();
  const embedFactory = new DefaultEmbeddingProviderFactory();
  try {
    await llmFactory.loadFromConfig(config, secretsManager);
    await embedFactory.loadFromConfig(config, secretsManager);
  } catch (err) {
    logger.warn('cli.providerLoadFailed', { error: err instanceof Error ? err.message : String(err) });
  }

  const llmProvider = llmFactory.list().length > 0 ? llmFactory.getDefault() : null;
  const embedder = embedFactory.list().length > 0 ? embedFactory.getDefault() : null;

  if (!llmProvider) {
    logger.warn('cli.noLlmProvider', { message: 'No LLM provider configured. L2 generation will fail. Run retineo init to configure.' });
  }
  if (!embedder) {
    logger.warn('cli.noEmbedProvider', { message: 'No embedding provider configured. L3 generation will fail. Run retineo init to configure.' });
  }

  const retrievalService = new DefaultRetrievalService({
    embeddingProvider: embedder || new (await import('../dist/llm/providers/mock.js')).MockLLMProvider({ id: 'mock-embedder', type: 'mock', dimension: 384 }),
    casStorage: cas,
    indexDir: path.join(resolvedDataDir, 'index'),
    config: config.search,
    logger,
  });
  const contextAssembler = new DefaultContextAssembler({ config: config.search });

  // --- Pipeline ---
  const l1Generator = new (await import('../dist/layers/l1-generator.js')).DefaultL1Generator();
  const l2Generator = new (await import('../dist/layers/l2-generator.js')).DefaultL2Generator();
  const l3Generator = new (await import('../dist/layers/l3-generator.js')).DefaultL3Generator();

  const pipeline = new DefaultCompilationPipeline({
    cas,
    registry,
    l1Generator,
    l2Generator,
    l3Generator,
    llmProvider,
    embeddingProvider: embedder,
    dataDir: resolvedDataDir,
    logger,
  });

  // --- Wire CLI ---
  const deps = {
    version: VERSION,
    ingestionService,
    retrievalService,
    queryAnalyzer,
    contextAssembler,
    registry,
    configManager,
    pipeline,
    secretsManager,
    cas,
  };

  const program = createCLI(deps);

  try {
    await program.parseAsync(process.argv);
  } finally {
    registry.close();
  }
}

main().catch((err) => {
  console.error('RETINEO Core CLI error:', err.message);
  process.exit(1);
});
