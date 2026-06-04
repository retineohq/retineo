/**
 * ECHO Core — CLI Commands
 * Phase 7: Added key management commands.
 */

import type { IngestionService } from '../adapters/ingestion.js';
import type { RetrievalService } from '../search/retrieval-service.js';
import type { QueryAnalyzer } from '../search/query-analyzer.js';
import type { ContextAssembler } from '../search/context-assembler.js';
import type { Registry } from '../storage/registry.js';
import type { ConfigManager, EchoConfig } from '../storage/config.js';
import type { CompilationPipeline } from '../layers/pipeline.js';
import type { SecretsManager } from '../storage/secrets.js';
import { formatSearchResult, formatStatus, formatJobs, formatIngestResult, formatConfig, formatRecoverResult } from './formatters.js';

export interface IngestCLIOptions {
  adapter?: string;
}

export interface SearchCLIOptions {
  language?: string;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  topK?: number;
  json?: boolean;
}

export interface CLICommandsDeps {
  ingestionService: IngestionService;
  retrievalService: RetrievalService;
  queryAnalyzer: QueryAnalyzer;
  contextAssembler: ContextAssembler;
  registry: Registry;
  configManager: ConfigManager;
  pipeline: CompilationPipeline;
  secretsManager: SecretsManager;
  version: string;
}

export class CLICommands {
  private deps: CLICommandsDeps;

  constructor(deps: CLICommandsDeps) {
    this.deps = deps;
  }

  async ingest(filePath: string, options?: IngestCLIOptions): Promise<void> {
    const node = await this.deps.ingestionService.ingestFile(filePath);
    console.log(formatIngestResult(node.sourceRef.uri, node.id, []));
  }

  async search(query: string, options?: SearchCLIOptions): Promise<void> {
    const analyzed = await this.deps.queryAnalyzer.analyze(query);
    const results = await this.deps.retrievalService.search(analyzed, {
      language: options?.language,
      mode: options?.mode,
      topK: options?.topK,
    });
    const assembled = await this.deps.contextAssembler.assemble(analyzed, results.selected, {
      maxTokens: 8000,
    });
    const payload = {
      query,
      language: analyzed.language,
      intent: analyzed.intent,
      results,
      assembled,
      citations: results.citations,
      durationMs: results.trace.durationMs,
    };
    console.log(formatSearchResult(payload, { json: options?.json }));
  }

  async status(): Promise<void> {
    const sources = this.deps.registry.listSources();
    const pending = this.deps.registry.getPendingJobs(1000);
    const status = {
      version: this.deps.version,
      nodeCount: sources.length,
      sourceCount: sources.length,
      jobCount: {
        pending: pending.length,
        running: 0,
        completed: 0,
        failed: 0,
      },
      indexStatus: {
        vectorCount: 0,
        lastIndexed: new Date().toISOString(),
      },
    };
    console.log(formatStatus(status));
  }

  async compile(filePath?: string): Promise<void> {
    if (filePath) {
      await this.deps.ingestionService.ingestFile(filePath);
      console.log(`Compiled: ${filePath}`);
    } else {
      const pending = this.deps.registry.getPendingJobs(100);
      console.log(`Compiling ${pending.length} pending jobs...`);
    }
  }

  async config(key?: string, value?: string): Promise<void> {
    const cfg = await this.deps.configManager.load();
    if (!key) {
      console.log(formatConfig(cfg));
      return;
    }
    if (value === undefined) {
      const val = getPath(cfg, key);
      console.log(val !== undefined ? JSON.stringify(val) : 'undefined');
      return;
    }
    setPath(cfg, key, parseValue(value));
    await this.deps.configManager.save(cfg);
    console.log(`Set ${key} = ${value}`);
  }

  async jobs(): Promise<void> {
    const pending = this.deps.registry.getPendingJobs(50);
    const mapped = pending.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      createdAt: j.createdAt,
    }));
    console.log(formatJobs(mapped));
  }

  async recover(hash: string): Promise<void> {
    this.deps.registry.recoverOrphan(hash);
    const orphan = this.deps.registry.getOrphan(hash);
    console.log(formatRecoverResult(hash, orphan?.originalSourceId ?? 'unknown'));
  }

  // --- Key management ---

  async keySet(provider: string, apiKey: string): Promise<void> {
    await this.deps.secretsManager.set(provider, apiKey);
    console.log(`Key set for ${provider}`);
  }

  async keyGet(provider: string): Promise<void> {
    const value = await this.deps.secretsManager.get(provider);
    if (value === undefined) {
      console.log(`No key found for ${provider}`);
      return;
    }
    const masked = value.length <= 8 ? '****' : value.slice(0, 4) + '...' + value.slice(-4);
    console.log(`${provider}: ${masked}`);
  }

  async keyDelete(provider: string): Promise<void> {
    await this.deps.secretsManager.delete(provider);
    console.log(`Key deleted for ${provider}`);
  }

  async keyList(): Promise<void> {
    const keys = await this.deps.secretsManager.list();
    if (keys.length === 0) {
      console.log('No keys stored');
      return;
    }
    const masked = await (this.deps.secretsManager as unknown as { listMasked(): Promise<Record<string, string>> }).listMasked?.() ?? {};
    for (const k of keys) {
      console.log(`${k}: ${masked[k] ?? '****'}`);
    }
  }
}

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function setPath(obj: unknown, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur && typeof cur === 'object') {
      if ((cur as Record<string, unknown>)[p] === undefined) {
        (cur as Record<string, unknown>)[p] = {};
      }
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  const last = parts[parts.length - 1];
  if (cur && typeof cur === 'object') {
    (cur as Record<string, unknown>)[last] = value;
  }
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
