/**
 * RETINEO Core — CLI Commands
 * Phase 8: Interactive init wizard, worker/bridge/daemon lifecycle, --watch.
 */

import type { CASStorage } from '../storage/cas.js';
import type { AuditService } from '../storage/audit.js';
import type { IngestionService, IngestResult, SyncResult } from '../services/ingestion-service.js';
import type { RetrievalService } from '../search/retrieval-service.js';
import type { QueryAnalyzer, QueryIntent } from '../search/query-analyzer.js';
import type { ContextAssembler } from '../search/context-assembler.js';
import type { SimilarityService } from '../search/similarity-service.js';
import type { Registry } from '../storage/registry.js';
import type { ConfigManager, RetineoConfig, ProviderConfigEntry } from '../storage/config.js';
import type { CompilationPipeline } from '../layers/pipeline.js';
import type { SecretsManager } from '../storage/secrets.js';
import type { HealthAnalyzer } from '../health/health-analyzer.js';
import { formatSearchResult, formatStatus, formatJobs, formatIngestResult, formatConfig, formatRecoverResult } from './formatters.js';
import { FileSystemSourceAdapter } from '../adapters/filesystem-adapter.js';
import { DefaultGhostRecoveryService } from '../ghost/recovery-service.js';
import type { L1Index } from '../layers/l1-generator.js';
import { runDoctor, formatDoctor } from './doctor.js';
import { ask, choose, confirm } from './prompt.js';
import {
  isPidAlive,
  readPidFile,
  writePidFile,
  removePidFile,
  stopProcess,
  tailLog,
  streamLog,
  ensureDataDirs,
  logFilePath,
  pidFilePath,
  dataDir,
} from './process-manager.js';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, lstatSync, readdirSync } from 'fs';
import { readFile as readFileAsync } from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

export interface IngestCLIOptions {
  adapter?: string;
  watch?: boolean;
  timeout?: number;
}

export interface CompileCLIOptions {
  layer?: string;
  provider?: string;
  watch?: boolean;
  timeout?: number;
  rebuildL1?: boolean;
  rebuildL2?: boolean;
  rebuildL3?: boolean;
}

export interface SearchCLIOptions {
  language?: string;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  topK?: number;
  json?: boolean;
  intent?: QueryIntent;
}

export interface SimilarCLIOptions {
  topK?: number;
  threshold?: number;
  json?: boolean;
}

export interface InitCLIOptions {
  nonInteractive?: boolean;
  llmModel?: string;
  embedModel?: string;
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
  cas: CASStorage;
  auditService: AuditService;
  healthAnalyzer?: HealthAnalyzer;
  similarityService?: SimilarityService;
  version: string;
}

export class CLICommands {
  private deps: CLICommandsDeps;

  constructor(deps: CLICommandsDeps) {
    this.deps = deps;
  }

  async ingest(filePath: string, options?: IngestCLIOptions): Promise<void> {
    const result = await this.deps.ingestionService.ingestFile(filePath);
    await this.deps.auditService.log('ingest', result.contentHash, undefined, { externalId: filePath });
    console.log(formatIngestResult(filePath, result));

    if (options?.watch) {
      const jobs = this.deps.registry.getJobsBySource(result.contentHash);
      const jobIds = jobs.map((j) => j.id);
      if (jobIds.length > 0) {
        await this.watchJobs(result.contentHash, { timeoutSec: options.timeout ?? 1800 });
      }
    }
  }

  async ingestBatch(paths: string[], options?: IngestCLIOptions): Promise<void> {
    const { existsSync, lstatSync } = await import('fs');
    const files: string[] = [];
    const dirs: string[] = [];

    for (const p of paths) {
      const resolved = path.resolve(p);
      if (!existsSync(resolved)) {
        console.error(`  Not found: ${p}`);
        continue;
      }
      const stat = lstatSync(resolved);
      if (stat.isDirectory()) {
        dirs.push(resolved);
      } else if (stat.isFile()) {
        files.push(resolved);
      }
    }

    if (files.length === 0 && dirs.length === 0) {
      console.log('No valid files or directories found.');
      return;
    }

    if (files.length === 1 && dirs.length === 0) {
      return this.ingest(files[0], options);
    }

    const allJobIds: string[] = [];
    const results: Array<{ path: string; result: IngestResult | SyncResult; sourceId?: string }> = [];

    for (const fp of files) {
      try {
        const res = await this.deps.ingestionService.ingestFile(fp);
        results.push({ path: fp, result: res });
        if (res.action !== 'unchanged') {
          const jobs = this.deps.registry.getJobsBySource(res.contentHash);
          allJobIds.push(...jobs.map((j) => j.id));
        }
        console.log(`  ✓ ${fp} → ${res.contentHash.slice(0, 12)}... (${res.action})`);
      } catch (err) {
        console.error(`  ✗ ${fp}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const dir of dirs) {
      try {
        const res = await this.deps.ingestionService.syncDirectory(dir);
        results.push({ path: dir, result: res, sourceId: res.sourceId });
        console.log(`  ✓ ${dir} → ${res.processed} processed, ${res.ghosts} ghosts (${res.sourceId})`);
      } catch (err) {
        console.error(`  ✗ ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (options?.watch) {
      if (dirs.length === 1 && files.length === 0) {
        const dir = dirs[0];
        const sourceId = (results.find((r) => r.path === dir)?.sourceId) ?? `filesystem:${dir}`;
        await this.watchSourceSync(sourceId, { timeoutSec: options.timeout ?? 1800 });
      } else if (allJobIds.length > 0) {
        const startIds = new Set(allJobIds);
        await this.watchAnyJobCompletion(startIds, { timeoutSec: options.timeout ?? 1800 });
      }
    }
  }

  async health(filePath: string): Promise<void> {
    const absolutePath = path.resolve(filePath);
    if (!existsSync(absolutePath)) {
      console.error(`  Not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    const { processed, ghosts, sourceId } = await this.deps.ingestionService.syncDirectory(absolutePath);
    console.error(`  synced ${processed} changed, ${ghosts} ghosts (${sourceId})`);

    if (!this.deps.healthAnalyzer) {
      console.error('Health analyzer is not configured.');
      process.exitCode = 1;
      return;
    }

    const counts = this.deps.registry.getJobCounts();
    if (counts.pending > 0 || counts.running > 0) {
      const workerRunning = isWorkerProcessRunning();
      if (!workerRunning) {
        await this.startInlineWorker();
      }
      await this.waitForJobDrain({ timeoutSec: 1800 });
    }

    const report = await this.deps.healthAnalyzer.analyze(sourceId);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.score < 50 ? 1 : 0;
  }

  async search(query: string, options?: SearchCLIOptions): Promise<void> {
    const analyzed = await this.deps.queryAnalyzer.analyze(query, undefined, { intent: options?.intent });
    const results = await this.deps.retrievalService.search(analyzed, {
      language: options?.language,
      mode: options?.mode,
      topK: options?.topK,
    });
    const assembled = await this.deps.contextAssembler.assemble(analyzed, results.selected, {
      maxTokens: 8000,
    });

    // Build DocumentHits with L1 navigation trees
    const l1Indices = new Map<string, L1Index>();
    const { readFile } = await import('fs/promises');
    const { existsSync } = await import('fs');
    const { join } = await import('path');

    // Resolve source paths post-search via Registry
    const docHits: Array<{
      sourceHash: string;
      sourcePath: string;
      score: number;
      l2Summary: string;
      navTree: L1Index['sections'] | null;
      isGhost?: boolean;
    }> = [];
    for (const c of results.selected) {
      const contentHash = c.contentHash ?? c.nodeId;
      const entries = this.deps.registry.listByContentHash(contentHash);
      const active = entries.find((e) => e.status === 'active');
      const sourcePath = active?.externalId ?? entries[0]?.externalId ?? contentHash;
      const isGhost = c.isGhost ?? !active;

      // Load L1 index for navigation tree
      let sections: L1Index['sections'] | null = null;
      if (!l1Indices.has(contentHash)) {
        try {
          const objPath = this.deps.cas.getObjectPath(contentHash);
          const l1Path = join(objPath, 'L1.index.json');
          if (existsSync(l1Path)) {
            l1Indices.set(contentHash, JSON.parse(await readFile(l1Path, 'utf-8')) as L1Index);
          }
        } catch {
          // skip
        }
      }
      sections = l1Indices.get(contentHash)?.sections ?? null;

      docHits.push({
        sourceHash: contentHash,
        sourcePath,
        score: c.score,
        l2Summary: c.l2Summary ?? '',
        navTree: sections,
        isGhost,
      });
    }

    await this.deps.auditService.log('search', undefined, undefined, {
      query,
      mode: options?.mode ?? 'semantic',
      resultCount: results.selected.length,
    });

    const payload = {
      query,
      language: analyzed.language,
      intent: analyzed.intent,
      results,
      assembled,
      citations: results.citations,
      durationMs: results.trace.durationMs,
      documentHits: docHits,
    };
    console.log(formatSearchResult(payload, { json: options?.json }));
  }

  async similar(hash: string, options?: SimilarCLIOptions): Promise<void> {
    if (!this.deps.similarityService) {
      console.error('Similarity service is not configured.');
      process.exitCode = 1;
      return;
    }

    const cfg = await this.deps.configManager.load();
    const { join } = await import('path');
    const { existsSync, readFileSync } = await import('fs');
    const embeddingsPath = join(cfg.dataDir, 'index', 'embeddings.jsonl');
    let vectorCount = 0;
    if (existsSync(embeddingsPath)) {
      const raw = readFileSync(embeddingsPath, 'utf-8').trim();
      if (raw) {
        vectorCount = raw.split('\n').filter((l: string) => l.trim()).length;
      }
    }
    if (vectorCount === 0) {
      console.error('Index is empty. Run `retineo ingest <path>` first.');
      process.exitCode = 1;
      return;
    }

    const results = await this.deps.similarityService.findSimilar(hash, {
      topK: options?.topK,
      threshold: options?.threshold,
    });

    if (options?.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log('No similar documents found.');
      return;
    }

    const lines: string[] = [];
    lines.push('contentHash                          | similarity | sourcePath');
    lines.push('─────────────────────────────────────┬────────────┬───────────');
    for (const doc of results) {
      const hashCol = doc.contentHash.slice(0, 36).padEnd(36, ' ');
      const simCol = doc.similarity.toFixed(4).padStart(10, ' ');
      const pathCol = doc.sourcePath ?? '';
      lines.push(`${hashCol} | ${simCol} | ${pathCol}`);
    }
    console.log(lines.join('\n'));
  }

  async status(): Promise<void> {
    const sources = this.deps.registry.listSources();
    const pending = this.deps.registry.getPendingJobs(1000);

    // Read actual vector count from embeddings.jsonl
    let vectorCount = 0;
    try {
      const config = await this.deps.configManager.load();
      const { join } = await import('path');
      const { existsSync, readFileSync } = await import('fs');
      const embeddingsPath = join(config.dataDir, 'index', 'embeddings.jsonl');
      if (existsSync(embeddingsPath)) {
        const raw = readFileSync(embeddingsPath, 'utf-8').trim();
        if (raw) {
          vectorCount = raw.split('\n').filter((l: string) => l.trim()).length;
        }
      }
    } catch {
      // ignore
    }

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
        vectorCount,
        lastIndexed: new Date().toISOString(),
      },
    };
    console.log(formatStatus(status));
  }

  async rebuild(options?: CompileCLIOptions & { force?: boolean }): Promise<void> {
    const config = await this.deps.configManager.load();
    const { rmSync, existsSync } = await import('fs');
    const pathMod = await import('path');

    // Capture source IDs before clearing the registry.
    const sources = this.deps.registry.listSources();

    if (options?.force) {
      for (const name of ['index', 'objects']) {
        const p = pathMod.join(config.dataDir, name);
        if (existsSync(p)) rmSync(p, { recursive: true, force: true });
      }
      this.deps.registry.clearSources();
      this.deps.registry.clearJobs();
      this.deps.registry.clearOrphans();
    }

    const indexDir = pathMod.join(config.dataDir, 'index');
    if (existsSync(indexDir)) {
      rmSync(indexDir, { recursive: true, force: true });
    }

    // Sync every filesystem source so deleted files become ghosts and changed/new files are ingested.
    const sourceIds = new Set<string>();
    for (const src of sources) {
      if (src.sourceId.startsWith('filesystem')) sourceIds.add(src.sourceId);
    }

    let processed = 0;
    let ghosts = 0;
    for (const sourceId of sourceIds) {
      // Lazily register a filesystem adapter for every known filesystem source.
      if (sourceId.startsWith('filesystem:')) {
        const root = sourceId.slice('filesystem:'.length);
        if (root) {
          this.deps.ingestionService.registerAdapter(
            new FileSystemSourceAdapter(root, undefined, sourceId)
          );
        }
      }
      try {
        const res = await this.deps.ingestionService.syncSource(sourceId);
        processed += res.processed;
        ghosts += res.ghosts;
      } catch (err) {
        console.error(`  ✗ sync ${sourceId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`Rebuilt ${sourceIds.size} source(s): ${processed} changed/new, ${ghosts} ghosts`);
    await this.deps.auditService.log('rebuild', undefined, undefined, { sources: sourceIds.size, processed, ghosts, force: !!options?.force });

    if (options?.watch) {
      const allPending = this.deps.registry.getPendingJobs(100);
      const startIds = new Set(allPending.map((j) => j.id));
      if (startIds.size > 0) {
        await this.watchAnyJobCompletion(startIds, { timeoutSec: options.timeout ?? 1800 });
      }
    }
  }

  async compile(filePath?: string, options?: CompileCLIOptions): Promise<void> {
    // Load config and resolve provider override if specified
    const config = await this.deps.configManager.load();
    if (options?.provider) {
      const available = config.llm.providers.map((p) => p.id);
      if (!available.includes(options.provider)) {
        console.error(`Provider '${options.provider}' not found in config. Available: ${available.join(', ')}`);
        process.exitCode = 1;
        return;
      }
      // Log provider override
      console.log(`Using LLM provider override: ${options.provider}`);
    }

    if (filePath) {
      const res = await this.deps.ingestionService.ingestFile(filePath);
      console.log(formatIngestResult(filePath, res));
      if (options?.watch && res.action !== 'unchanged') {
        const jobs = this.deps.registry.getJobsBySource(res.contentHash);
        if (jobs.length > 0) {
          await this.watchJobs(res.contentHash, { timeoutSec: options.timeout ?? 1800 });
        }
      }
    } else {
      // Optional: force re-generation of L1 artifacts for all sources
      if (options?.rebuildL1) {
        const { rmSync, existsSync } = await import('fs');
        const pathMod = await import('path');
        const sources = this.deps.registry.listSources();
        let queued = 0;
        for (const src of sources) {
          const nodeHash = src.contentHash;
          const objPath = this.deps.cas.getObjectPath(nodeHash);
          for (const file of ['L1.md', 'L1.index.json']) {
            const p = pathMod.join(objPath, file);
            if (existsSync(p)) rmSync(p);
          }
          this.deps.pipeline.enqueueL1(nodeHash, src.sourceId);
          queued++;
        }
        console.log(`Queued ${queued} source(s) for L1 rebuild`);
      }

      // Optional: force re-generation of L2 artifacts for all sources
      if (options?.rebuildL2) {
        const { rmSync, existsSync } = await import('fs');
        const pathMod = await import('path');
        const sources = this.deps.registry.listSources();
        let queued = 0;
        for (const src of sources) {
          const nodeHash = src.contentHash;
          const objPath = this.deps.cas.getObjectPath(nodeHash);
          const l2Path = pathMod.join(objPath, 'L2.json');
          if (existsSync(l2Path)) {
            rmSync(l2Path);
          }
          this.deps.pipeline.enqueueL2(nodeHash);
          queued++;
        }
        console.log(`Queued ${queued} source(s) for L2 rebuild`);
      }

      const pending = this.deps.registry.getPendingJobs(100);
      console.log(`Compiling ${pending.length} pending jobs...`);

      // Recover DEAD L3 jobs (e.g. after Ollama outage)
      const dead = this.deps.registry.getDeadJobs(100);
      const deadL3 = dead.filter((j) => j.type === 'GENERATE_L3');
      for (const job of deadL3) {
        const payload = JSON.parse(job.payload) as { nodeId: string };
        this.deps.pipeline.enqueueL3(payload.nodeId);
      }
      if (deadL3.length > 0) {
        console.log(`Recovered ${deadL3.length} dead L3 job(s)`);
      }

      // Find nodes with L2 complete but no L3 job at all
      const { existsSync } = await import('fs');
      const pathMod = await import('path');
      const sources = this.deps.registry.listSources();
      let missingL3 = 0;
      for (const src of sources) {
        const nodeHash = src.contentHash;
        const jobs = this.deps.registry.getJobsBySource(nodeHash);
        const hasL3Job = jobs.some((j) => j.type === 'GENERATE_L3');
        if (!hasL3Job) {
          const objPath = this.deps.cas.getObjectPath(nodeHash);
          if (existsSync(pathMod.join(objPath, 'L2.json'))) {
            this.deps.pipeline.enqueueL3(nodeHash);
            missingL3++;
          }
        }
      }
      if (missingL3 > 0) {
        console.log(`Queued ${missingL3} missing L3 job(s)`);
      }

      // Optional: force full L3 index rebuild for all sources with L2.
      if (options?.rebuildL3) {
        const { rmSync, existsSync } = await import('fs');
        const pathMod = await import('path');
        const cfg = await this.deps.configManager.load();
        const indexDir = pathMod.join(cfg.dataDir, 'index');
        if (existsSync(indexDir)) {
          rmSync(indexDir, { recursive: true, force: true });
        }
        const sources = this.deps.registry.listSources();
        let queued = 0;
        for (const src of sources) {
          const nodeHash = src.contentHash;
          const objPath = this.deps.cas.getObjectPath(nodeHash);
          if (existsSync(pathMod.join(objPath, 'L2.json'))) {
            this.deps.pipeline.enqueueL3(nodeHash);
            queued++;
          }
        }
        console.log(`Queued ${queued} source(s) for L3 rebuild`);
      }

      if (options?.watch) {
        // Watch all pending jobs (including newly queued)
        const allPending = this.deps.registry.getPendingJobs(100);
        const startIds = new Set(allPending.map((j) => j.id));
        await this.watchAnyJobCompletion(startIds, { timeoutSec: options.timeout ?? 1800 });
      }
    }
  }

  async configList(): Promise<void> {
    const cfg = await this.deps.configManager.load();
    console.log(formatConfig(cfg));
  }

  async configGet(key: string): Promise<void> {
    const cfg = await this.deps.configManager.load();
    const val = getPath(cfg, key);
    console.log(val !== undefined ? JSON.stringify(val) : 'undefined');
  }

  async configSet(key: string, value: string): Promise<void> {
    const cfg = await this.deps.configManager.load();
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
    const entries = this.deps.registry.listByContentHash(hash);
    if (entries.length === 0) {
      console.log(`Recover failed: ${hash} — not found in registry`);
      return;
    }

    for (const entry of entries) {
      this.deps.registry.updateSource(entry.sourceId, entry.externalId, {
        status: 'active',
        deletedAt: null,
      });
    }
    this.deps.registry.recoverOrphan(hash);
    await this.deps.auditService.log('recover', hash, undefined, { sourceCount: entries.length });
    console.log(`Recovered: ${hash} → ${entries.map((e) => `${e.sourceId}:${e.externalId}`).join(', ')}`);
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
    const masked = await this.deps.secretsManager.listMasked();
    for (const k of keys) {
      console.log(`${k}: ${masked[k] ?? '****'}`);
    }
  }

  async init(options?: InitCLIOptions): Promise<void> {
    if (options?.nonInteractive) {
      await this.initNonInteractive(options);
      return;
    }
    await this.initInteractive();
  }

  private async initInteractive(): Promise<void> {
    console.log('RETINEO Core Setup Wizard');
    console.log('══════════════════════');
    console.log('');

    const { FileConfigManager } = await import('../storage/config.js');

    // [1/4] LLM provider + model
    let llmProviders: ProviderConfigEntry[] = [];
    const ollamaProbe = await probeOllama();
    if (ollamaProbe) {
      console.log(`[1/4] Checking Ollama... ✅ Found on localhost:11434`);
      const llmCandidates = ollamaProbe.models.filter((m) => !m.name.includes('embed'));
      const embedCandidates = ollamaProbe.models.filter((m) =>
        m.name.includes('embed') || m.name.includes('bge') || m.name.includes('minilm')
      );
      if (llmCandidates.length === 0) {
        console.log('  (no chat-capable models found in Ollama)');
      } else {
        for (let i = 0; i < Math.min(llmCandidates.length, 5); i++) {
          const m = llmCandidates[i];
          const size = formatBytes(m.size);
          console.log(`        [${i + 1}] ${m.name.padEnd(30)} (${size})`);
        }
        const llmIdx = await ask({
          question: `Select LLM model [1-${llmCandidates.length}, default 1]`,
          defaultValue: '1',
        });
        const idx = Math.max(0, Math.min(llmCandidates.length - 1, parseInt(llmIdx, 10) - 1));
        const chosenLlm = llmCandidates[idx];
        llmProviders.push({
          id: 'ollama',
          type: 'ollama',
          baseUrl: 'http://localhost:11434',
          model: chosenLlm.name,
          temperature: 0.3,
          maxTokens: 4096,
          concurrency: 1,
          timeoutMs: 60000,
        });
        if (idx >= 5) {
          // picked a model beyond shown; note it
          console.log(`        (selected: ${chosenLlm.name})`);
        }
      }

      // [2/4] Embedding model
      if (embedCandidates.length > 0) {
        console.log('');
        console.log(`[2/4] Embedding models detected:`);
        for (let i = 0; i < Math.min(embedCandidates.length, 3); i++) {
          const m = embedCandidates[i];
          const size = formatBytes(m.size);
          console.log(`        [${i + 1}] ${m.name.padEnd(30)} (${size})`);
        }
        const embedIdx = await ask({
          question: `Select embedding model [1-${embedCandidates.length}, default 1]`,
          defaultValue: '1',
        });
        const eIdx = Math.max(0, Math.min(embedCandidates.length - 1, parseInt(embedIdx, 10) - 1));
        const chosenEmbed = embedCandidates[eIdx];
        llmProviders = [
          ...llmProviders,
          {
            id: 'ollama-embed',
            type: 'ollama',
            baseUrl: 'http://localhost:11434',
            model: chosenEmbed.name,
            concurrency: 1,
            timeoutMs: 60000,
            dimension: embedDimension(chosenEmbed.name),
          },
        ];
      } else {
        llmProviders.push({
          id: 'ollama-embed',
          type: 'ollama',
          baseUrl: 'http://localhost:11434',
          model: 'nomic-embed-text',
          concurrency: 1,
          timeoutMs: 60000,
          dimension: 768,
        });
      }
    } else {
      console.log(`[1/4] Ollama not detected on localhost:11434.`);
      const providerChoice = await choose({
        question: 'Select option',
        defaultIndex: 0,
        choices: [
          { label: 'Install Ollama first (recommended)', value: 'install' },
          { label: 'Use cloud API provider', value: 'cloud' },
          { label: 'Skip for now (mock mode, no compilation)', value: 'mock' },
        ],
      });

      if (providerChoice === 'cloud') {
        const provider = (await ask({ question: 'Provider [openai/openrouter/deepseek]', defaultValue: 'openai' })).trim();
        const apiKey = await ask({ question: 'API key', hidden: true });
        const model = await ask({ question: 'Model [gpt-4o]', defaultValue: 'gpt-4o' });
        const baseUrl = provider === 'openai' ? 'https://api.openai.com/v1' : undefined;
        llmProviders = [
          {
            id: provider,
            type: 'openai-compatible',
            ...(baseUrl ? { baseUrl } : {}),
            apiKey: `\${${provider.toUpperCase()}_API_KEY}`,
            model,
            temperature: 0.3,
            maxTokens: 4096,
            concurrency: 1,
            timeoutMs: 60000,
          },
          {
            id: `${provider}-embed`,
            type: 'openai-compatible',
            ...(baseUrl ? { baseUrl } : {}),
            apiKey: `\${${provider.toUpperCase()}_API_KEY}`,
            model: 'text-embedding-3-small',
            concurrency: 1,
            timeoutMs: 60000,
            dimension: 1536,
          },
        ];
        // Also save the key to secrets
        if (apiKey) {
          const { FileSecretsManager } = await import('../storage/secrets.js');
          const dataDir = path.join(os.homedir(), '.retineo');
          const secrets = new FileSecretsManager(path.join(dataDir, 'secrets.json'));
          await secrets.set(provider, apiKey);
          console.log(`  🔑 Saved API key for ${provider} to secrets store.`);
        }
      } else if (providerChoice === 'mock') {
        llmProviders = [
          { id: 'mock', type: 'mock', model: 'mock-llm', concurrency: 1, dimension: 384 },
          { id: 'mock-embed', type: 'mock', model: 'mock-embedder', concurrency: 1, dimension: 384 },
        ];
      } else {
        console.log('Please install Ollama from https://ollama.com and re-run `retineo init`.');
        return;
      }
    }

    // [3/4] Data directory
    console.log('');
    const dataDirAns = await ask({ question: 'Data directory', defaultValue: path.join(os.homedir(), '.retineo') });
    const dataDir = dataDirAns.trim() || path.join(os.homedir(), '.retineo');

    // [4/4] Bridge port
    console.log('');
    const portAns = await ask({ question: 'HTTP API port', defaultValue: '37891' });
    const port = parseInt(portAns, 10) || 37891;

    // Build config
    const llmOnly = llmProviders.filter((p) => !p.id.endsWith('-embed'));
    const embedOnly = llmProviders.filter((p) => p.id.endsWith('-embed') || p.type === 'mock');
    const llmProvider = llmOnly[0]!;
    const embedProvider = embedOnly[0] ?? llmOnly[0]!;
    const config: RetineoConfig = {
      dataDir,
      defaultAdapter: 'file',
      llmProvider: llmProvider.id,
      embeddingModel: embedProvider.model,
      llm: { defaultProvider: llmProvider.id, providers: llmOnly },
      embedding: { defaultProvider: embedProvider.id, providers: embedOnly },
      bridge: { host: '127.0.0.1', port },
      search: DEFAULT_SEARCH,
      i18n: DEFAULT_I18N,
      logging: DEFAULT_LOGGING,
    };

    // Initialize data directory + database
    const configManager = new FileConfigManager(dataDir);
    await ensureDataDirsForDataDir(dataDir);
    await configManager.save(config);
    await configManager.initializeDataDir();

    console.log('');
    console.log(`✅ Configuration saved to ${path.join(dataDir, 'config.yaml')}`);
    console.log(`✅ Database initialized at ${path.join(dataDir, 'retineo.sqlite')}`);
    console.log(`✅ Directory structure created`);

    // Offer to start worker
    console.log('');
    const startWorker = await confirm('Start background worker now?', true);
    if (startWorker) {
      try {
        await this.workerStart();
      } catch (err) {
        console.error(`⚠️  Worker failed to start: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log('');
    console.log('Next steps:');
    console.log('  retineo ingest <file>     # Add documents');
    console.log('  retineo search <query>    # Search your knowledge base');
    console.log('  retineo worker status     # Check compilation progress');
    process.exit(0);
  }

  private async initNonInteractive(options?: InitCLIOptions): Promise<void> {
    const { FileConfigManager } = await import('../storage/config.js');

    const dataDir = process.env.RETINEO_DATA_DIR ?? path.join(os.homedir(), '.retineo');
    const llmModel = options?.llmModel ?? process.env.RETINEO_LLM_MODEL;
    const embedModel = options?.embedModel ?? process.env.RETINEO_EMBED_MODEL;

    if (!llmModel || !embedModel) {
      console.error('Error: --non-interactive requires --llm-model and --embed-model.');
      console.error('Usage: retineo init --non-interactive --llm-model <model> --embed-model <model>');
      process.exitCode = 1;
      return;
    }

    const port = parseInt(process.env.RETINEO_BRIDGE_PORT ?? '37891', 10);
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

    const llmProviders: ProviderConfigEntry[] = [
      {
        id: 'ollama',
        type: 'ollama',
        baseUrl: ollamaBaseUrl,
        model: llmModel,
        temperature: 0.3,
        maxTokens: 4096,
        concurrency: 1,
        timeoutMs: 60000,
      },
    ];
    const embedProviders: ProviderConfigEntry[] = [
      {
        id: 'ollama-embed',
        type: 'ollama',
        baseUrl: ollamaBaseUrl,
        model: embedModel,
        concurrency: 1,
        timeoutMs: 60000,
        dimension: embedDimension(embedModel),
      },
    ];

    const configManager = new FileConfigManager(dataDir);
    const config: RetineoConfig = {
      dataDir,
      defaultAdapter: 'file',
      llmProvider: 'ollama',
      embeddingModel: embedModel,
      llm: { defaultProvider: 'ollama', providers: llmProviders },
      embedding: { defaultProvider: 'ollama-embed', providers: embedProviders },
      bridge: { host: '127.0.0.1', port },
      search: DEFAULT_SEARCH,
      i18n: DEFAULT_I18N,
      logging: DEFAULT_LOGGING,
    };

    await ensureDataDirsForDataDir(dataDir);
    await configManager.save(config);
    await configManager.initializeDataDir();

    console.log(`RETINEO Core initialized at ${dataDir}`);
    console.log(`LLM: ${llmModel}  Embedding: ${embedModel}  Port: ${port}`);
  }

  async doctor(): Promise<void> {
    const result = await runDoctor();
    console.log(formatDoctor(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
  }

  // --- Service lifecycle: worker ---

  async workerStart(): Promise<void> {
    return this.startService('worker');
  }

  async workerStop(): Promise<void> {
    return this.stopService('worker');
  }

  async workerStatus(): Promise<void> {
    return this.serviceStatus('worker');
  }

  async workerLogs(options?: { follow?: boolean; lines?: number }): Promise<void> {
    return this.serviceLogs('worker', options);
  }

  // --- Service lifecycle: bridge ---

  async bridgeStart(): Promise<void> {
    return this.startService('bridge');
  }

  async bridgeStop(): Promise<void> {
    return this.stopService('bridge');
  }

  async bridgeStatus(): Promise<void> {
    return this.serviceStatus('bridge');
  }

  async bridgeLogs(options?: { follow?: boolean; lines?: number }): Promise<void> {
    return this.serviceLogs('bridge', options);
  }

  // --- Service lifecycle: daemon (bridge + worker in one process) ---

  async daemonStart(): Promise<void> {
    return this.startService('daemon');
  }

  async daemonStop(): Promise<void> {
    return this.stopService('daemon');
  }

  async daemonStatus(): Promise<void> {
    return this.serviceStatus('daemon');
  }

  async daemonLogs(options?: { follow?: boolean; lines?: number }): Promise<void> {
    return this.serviceLogs('daemon', options);
  }

  // --- Lifecycle helpers ---

  private async startService(service: 'worker' | 'bridge' | 'daemon'): Promise<void> {
    await ensureDataDirs();
    const existing = readPidFile(service);
    if (existing && isPidAlive(existing.pid)) {
      console.error(`⚠️  ${service} is already running (PID ${existing.pid})`);
      return;
    }
    if (existing) {
      // stale pid file
      await removePidFile(service);
    }

    // Find the script path. Try dist first, then src.
    const scriptPath = resolveServiceScript(service);
    if (!scriptPath) {
      throw new Error(`Cannot find ${service} script. Run "pnpm build" first.`);
    }
    const logPath = logFilePath(service);
    const out = (await import('fs')).openSync(logPath, 'a');

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      RETINEO_DATA_DIR: dataDir(),
      RETINEO_WORKER_SCRIPT: service === 'worker' ? '1' : undefined,
      RETINEO_BRIDGE_SCRIPT: service === 'bridge' ? '1' : undefined,
      RETINEO_DAEMON: service === 'daemon' ? '1' : undefined,
    };

    const child: ChildProcess = spawn(
      process.execPath,
      [scriptPath],
      {
        detached: true,
        stdio: ['ignore', out, out],
        env,
      }
    );
    child.unref();

    const pid = child.pid ?? -1;
    if (pid <= 0) {
      throw new Error(`Failed to spawn ${service} (no PID)`);
    }

    // Write PID file immediately so stop/status can always find it
    await writePidFile({
      pid,
      startedAt: new Date().toISOString(),
      service,
      logFile: logPath,
    });

    // Wait briefly to verify it actually started
    await new Promise((r) => setTimeout(r, 1000));
    if (!isPidAlive(pid)) {
      await removePidFile(service);
      throw new Error(`${service} exited immediately. Check logs: ${logPath}`);
    }

    console.error(`✅ ${service} started (PID ${pid})`);
    console.error(`   Logs: ${logPath}`);
  }

  private async stopService(service: 'worker' | 'bridge' | 'daemon'): Promise<void> {
    const info = readPidFile(service);
    if (!info) {
      console.log(`${service} is not running (no PID file)`);
      return;
    }
    if (!isPidAlive(info.pid)) {
      console.log(`Removing stale PID file (process ${info.pid} not alive)`);
      await removePidFile(service);
      return;
    }
    const result = await stopProcess(info.pid, { timeoutMs: 5000, service });
    await removePidFile(service);
    if (result.stopped) {
      console.log(`✅ ${service} stopped (was PID ${info.pid}, signal ${result.signal ?? 'none'})`);
    } else {
      console.log(`⚠️  ${service} (PID ${info.pid}) did not stop cleanly`);
      process.exitCode = 1;
    }
  }

  private async serviceStatus(service: 'worker' | 'bridge' | 'daemon'): Promise<void> {
    const info = readPidFile(service);
    const logPath = logFilePath(service);
    if (!info) {
      console.log(`${service}: stopped (no PID file)`);
      return;
    }
    const alive = isPidAlive(info.pid);
    if (!alive) {
      console.log(`${service}: stopped (PID ${info.pid} not alive)`);
      return;
    }
    const startedAt = new Date(info.startedAt);
    const uptimeSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    const uptimeStr = formatUptime(uptimeSec);
    console.log(`${service}: running`);
    console.log(`  PID: ${info.pid}`);
    console.log(`  Started: ${info.startedAt}`);
    console.log(`  Uptime: ${uptimeStr}`);
    console.log(`  Log: ${info.logFile ?? logPath}`);

    // Show job counts (only if registry can be opened)
    try {
      const cfg = await this.deps.configManager.load();
      const { SQLiteRegistry } = await import('../storage/registry.js');
      const reg = new SQLiteRegistry(path.join(cfg.dataDir, 'retineo.sqlite'));
      const counts = reg.getJobCounts();
      const lastHb = reg.getLastHeartbeat(info.pid.toString());
      console.log(`  Jobs: pending=${counts.pending} running=${counts.running} completed=${counts.completed} failed=${counts.failed} dead=${counts.dead}`);
      if (lastHb) console.log(`  Last heartbeat: ${lastHb}`);
      reg.close();
    } catch (err) {
      console.log(`  (could not read job counts: ${err instanceof Error ? err.message : String(err)})`);
    }
  }

  private async serviceLogs(
    service: 'worker' | 'bridge' | 'daemon',
    options?: { follow?: boolean; lines?: number }
  ): Promise<void> {
    const logPath = readPidFile(service)?.logFile ?? logFilePath(service);
    if (!existsSync(logPath)) {
      console.log(`(no log file: ${logPath})`);
      return;
    }
    const lines = options?.lines ?? 50;
    if (options?.follow) {
      const stream = streamLog(logPath);
      for await (const chunk of stream) {
        process.stdout.write(chunk as string);
      }
      return;
    }
    const tail = tailLog(logPath, lines);
    console.log(tail);
  }

  // --- Watch helper ---

  /**
   * Poll jobs for a given node until all are COMPLETED or any FAIL.
   * If no worker is running, start one inline (foreground).
   */
  private async watchJobs(nodeId: string, options: { timeoutSec: number }): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutSec * 1000;
    const pollMs = 5000;

    console.log('⏳ Waiting for compilation...');

    // If no worker, start an inline worker (foreground) so jobs actually process.
    const workerRunning = isWorkerProcessRunning();
    if (!workerRunning) {
      await this.startInlineWorker();
    }

    let lastCompleted = 0;
    while (Date.now() - startTime < timeoutMs) {
      const jobs = this.deps.registry.getJobsBySource(nodeId);
      const completed = jobs.filter((j) => j.status === 'COMPLETED').length;
      const failed = jobs.filter((j) => j.status === 'FAILED' || j.status === 'DEAD').length;
      const total = jobs.length;
      if (total === 0) {
        console.log('  (no jobs found for this node yet — waiting)');
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      if (completed > lastCompleted) {
        console.log(`  [${completed}/${total}] compilation progress`);
        lastCompleted = completed;
      }
      if (failed > 0) {
        const failedJobs = jobs.filter((j) => j.status === 'FAILED' || j.status === 'DEAD');
        console.log(`❌ ${failed} job(s) failed:`);
        for (const j of failedJobs) {
          console.log(`   - ${j.type}: ${j.status}`);
        }
        process.exitCode = 1;
        return;
      }
      if (completed === total) {
        console.log(`✅ All ${total} job(s) compiled in ${Math.floor((Date.now() - startTime) / 1000)}s`);
        return;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    console.log(`⏱️  Timeout after ${options.timeoutSec}s`);
    process.exitCode = 1;
  }

  private async watchAnyJobCompletion(
    jobIds: Set<string>,
    options: { timeoutSec: number }
  ): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutSec * 1000;
    const pollMs = 5000;
    const workerRunning = isWorkerProcessRunning();
    if (!workerRunning) {
      await this.startInlineWorker();
    }
    while (Date.now() - startTime < timeoutMs) {
      let allDone = true;
      let anyFailed = false;
      for (const id of jobIds) {
        const job = this.deps.registry.getJob(id);
        if (!job) continue;
        if (job.status !== 'COMPLETED') allDone = false;
        if (job.status === 'FAILED' || job.status === 'DEAD') anyFailed = true;
      }
      if (anyFailed) {
        console.log('❌ One or more jobs failed');
        process.exitCode = 1;
        return;
      }
      if (allDone) {
        console.log('✅ All watched jobs completed');
        return;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    console.log(`⏱️  Timeout after ${options.timeoutSec}s`);
    process.exitCode = 1;
  }

  private async watchSourceSync(sourceId: string, options: { timeoutSec: number; intervalSec?: number }): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutSec * 1000;
    const intervalMs = (options.intervalSec ?? 30) * 1000;
    console.log(`⏳ Watching ${sourceId} for changes...`);
    while (Date.now() - startTime < timeoutMs) {
      try {
        const res = await this.deps.ingestionService.syncSource(sourceId);
        if (res.processed > 0 || res.ghosts > 0) {
          console.log(`  sync: ${res.processed} processed, ${res.ghosts} ghosts`);
        }
      } catch (err) {
        console.error(`  sync failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    console.log(`⏱️  Watch timeout after ${options.timeoutSec}s`);
  }

  private async startInlineWorker(): Promise<void> {
    // Spawn a background worker (detached) so the parent can poll the
    // registry while the worker drains the queue. This is identical to
    // running `retineo worker start` programmatically.
    await this.startService('worker');
  }

  private async waitForJobDrain(options: { timeoutSec: number }): Promise<void> {
    const start = Date.now();
    const timeoutMs = options.timeoutSec * 1000;
    const pollMs = 1000;
    while (Date.now() - start < timeoutMs) {
      const counts = this.deps.registry.getJobCounts();
      if (counts.pending === 0 && counts.running === 0) return;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    console.log(`⏱️  Timeout after ${options.timeoutSec}s waiting for jobs`);
  }

  // --- Ghost System ---

  async ghostList(): Promise<void> {
    const ghost = new DefaultGhostRecoveryService(this.deps.registry, this.deps.cas);
    const orphans = await ghost.listGhosts();
    if (orphans.length === 0) {
      console.log('No orphaned objects found.');
      return;
    }
    console.log(`Found ${orphans.length} orphaned object(s):\n`);
    for (const o of orphans) {
      console.log(`  Hash:     ${o.hash}`);
      console.log(`  Source:   ${o.sourceId}`);
      console.log(`  Path:     ${o.externalId}`);
      console.log(`  Orphaned: ${o.orphanedAt}`);
      console.log('');
    }
  }

  async ghostRecover(hash: string, targetPath?: string): Promise<void> {
    const ghost = new DefaultGhostRecoveryService(this.deps.registry, this.deps.cas);
    try {
      await ghost.recover(hash, targetPath);
      console.log(`✅ Recovered ${hash}`);
    } catch (err) {
      console.error(`❌ Recovery failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  async ghostPurge(days: number): Promise<void> {
    const ghost = new DefaultGhostRecoveryService(this.deps.registry, this.deps.cas);
    const purged = await ghost.purge(days);
    console.log(`Purged ${purged} orphaned object(s) older than ${days} day(s).`);
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

// ===== Module-level helpers for the init wizard =====

interface OllamaTag {
  name: string;
  model: string;
  size: number;
  digest: string;
  details?: Record<string, unknown>;
}

async function probeOllama(baseUrl = 'http://localhost:11434'): Promise<{ models: OllamaTag[] } | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: OllamaTag[] };
    return { models: data.models ?? [] };
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function embedDimension(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('nomic-embed')) return 768;
  if (m.includes('mxbai')) return 1024;
  if (m.includes('qwen3-embed')) return 1024;
  if (m.includes('bge-large') || m.includes('bge-m3')) return 1024;
  if (m.includes('bge-small') || m.includes('bge-base')) return 768;
  if (m.includes('all-minilm') || m.includes('minilm')) return 384;
  if (m.includes('text-embedding-3-small')) return 1536;
  if (m.includes('text-embedding-3-large')) return 3072;
  return 768;
}

function isWorkerProcessRunning(): boolean {
  // Worker is "running" if either the standalone worker process is alive
  // or the daemon (which embeds the worker) is alive.
  const w = readPidFile('worker');
  if (w && isPidAlive(w.pid)) return true;
  const d = readPidFile('daemon');
  if (d && isPidAlive(d.pid)) return true;
  return false;
}

function resolveServiceScript(service: 'worker' | 'bridge' | 'daemon'): string | null {
  // Map service name → entry-point filename
  const fileName = service === 'worker' ? 'worker-script' : service === 'bridge' ? 'bridge-script' : service;
  // Walk up from this file to find dist/cli or src/cli
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // dev: src/cli/commands.ts → src/cli/{fileName}.ts
    path.join(here, `${fileName}.ts`),
    // dist: dist/cli/commands.js → dist/cli/{fileName}.js
    path.join(here, `${fileName}.js`),
    // in case running from repo root or via dist/cli/../cli
    path.resolve(here, '..', 'cli', `${fileName}.js`),
    // installed via npm: ../dist/cli/{fileName}.js relative to bin/
    path.resolve(here, '..', '..', 'dist', 'cli', `${fileName}.js`),
    // repo root: ./dist/cli/{fileName}.js
    path.resolve(here, '..', '..', '..', 'dist', 'cli', `${fileName}.js`),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

async function ensureDataDirsForDataDir(dataDir: string): Promise<void> {
  const { mkdir } = await import('fs/promises');
  await mkdir(dataDir, { recursive: true });
  await mkdir(path.join(dataDir, 'objects'), { recursive: true });
  await mkdir(path.join(dataDir, 'index'), { recursive: true });
  await mkdir(path.join(dataDir, 'adapters'), { recursive: true });
  await mkdir(path.join(dataDir, 'models'), { recursive: true });
  await mkdir(path.join(dataDir, 'logs'), { recursive: true });
}

// Default config sections used by the wizard (inlined to avoid circular loads)
const DEFAULT_SEARCH: RetineoConfig['search'] = {
  defaultLanguage: 'en',
  languageDetection: { provider: 'franc', fallback: 'heuristic', confidenceThreshold: 0.7 },
  semantic: { topK: 100, threshold: 0.35, hybridWeight: 0.7 },
  rerank: { topK: 10, weights: { concept: 1.0, claim: 0.5, summary: 0.8, language: 0.3 } },
  cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
  citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
  prompts: {},
  crossLingual: { enabled: true, translateQuery: 'llm', targetLanguages: ['en'] },
};

const DEFAULT_I18N: RetineoConfig['i18n'] = { defaultLanguage: 'en', packs: [] };

const DEFAULT_LOGGING: RetineoConfig['logging'] = {
  level: 'info',
  console: true,
  file: true,
  filePath: '', // overwritten on save
  pretty: false,
};
