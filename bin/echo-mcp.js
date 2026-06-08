#!/usr/bin/env node
/**
 * ECHO Core — MCP Server Entry Point
 * Starts EchoMCPServer over stdio transport with wired services.
 */

import { EchoMCPServer } from '../dist/mcp/server.js';
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
import { MockLLMProvider } from '../dist/llm/providers/mock.js';
import { createLogger } from '../dist/utils/logger.js';
import path from 'path';
import os from 'os';

const VERSION = '0.1.0';

async function main() {
  const logger = createLogger({ level: 'info', format: 'json' });

  const configManager = new FileConfigManager();
  const config = await configManager.load();
  const dataDir = config.dataDir || path.join(os.homedir(), '.echo');
  const secretsManager = new FileSecretsManager(path.join(dataDir, 'secrets.json'));

  const cas = new LocalCASStorage(dataDir);
  const dbPath = path.join(dataDir, 'echo.sqlite');
  const registry = new SQLiteRegistry(dbPath);

  const nodeBuilder = new DefaultNodeBuilder();
  const adapterRunner = new DefaultAdapterProcessRunner(dataDir);
  // Resolve adapters relative to this script, not cwd
  const here = path.dirname(new URL(import.meta.url).pathname);
  const adaptersDir = path.join(here, '..', 'packages', 'core', 'adapters');
  const adapterManager = new DefaultAdapterManager(adaptersDir, adapterRunner);
  try {
    await adapterManager.loadBuiltIn();
  } catch {
    // fallback: try relative to cwd
    const fallbackDir = path.join(process.cwd(), 'packages', 'core', 'adapters');
    const fallbackManager = new DefaultAdapterManager(fallbackDir, adapterRunner);
    try {
      await fallbackManager.loadBuiltIn();
    } catch {
      // no adapters — ingestion will fail with clear error
    }
  }

  const ingestionService = new DefaultIngestionService(cas, registry, nodeBuilder, adapterManager, computeHash, logger);

  const queryAnalyzer = new DefaultQueryAnalyzer({ searchConfig: config.search });

  // Load real embedding provider from config (same as echo-core.js)
  const { DefaultEmbeddingProviderFactory } = await import('../dist/llm/factory.js');
  const embedFactory = new DefaultEmbeddingProviderFactory();
  try {
    await embedFactory.loadFromConfig(config, secretsManager);
  } catch {
    // fallback to mock
  }
  const embedder = embedFactory.list().length > 0 ? embedFactory.getDefault() : new MockLLMProvider({ id: 'mock-embedder', type: 'mock', dimension: 384 });
  const retrievalService = new DefaultRetrievalService({
    embeddingProvider: embedder,
    casStorage: cas,
    indexDir: path.join(dataDir, 'index'),
    config: config.search,
    logger,
  });

  const contextAssembler = new DefaultContextAssembler({ config: config.search });

  const server = new EchoMCPServer({
    deps: {
      queryAnalyzer,
      retrievalService,
      contextAssembler,
      ingestionService,
      registry,
      cas,
      version: VERSION,
    },
    logger,
  });

  logger.info('mcp.starting', { version: VERSION });
  await server.start();
}

main().catch((err) => {
  console.error('MCP Server failed:', err);
  process.exit(1);
});
