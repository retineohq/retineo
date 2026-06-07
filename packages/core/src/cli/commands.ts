/**
 * ECHO Core — CLI Commands
 * Phase 8: Interactive init wizard, worker/bridge/daemon lifecycle, --watch.
 */

import type { IngestionService } from '../adapters/ingestion.js';
import type { RetrievalService } from '../search/retrieval-service.js';
import type { QueryAnalyzer } from '../search/query-analyzer.js';
import type { ContextAssembler } from '../search/context-assembler.js';
import type { Registry } from '../storage/registry.js';
import type { ConfigManager, EchoConfig, ProviderConfigEntry } from '../storage/config.js';
import type { CompilationPipeline } from '../layers/pipeline.js';
import type { SecretsManager } from '../storage/secrets.js';
import { formatSearchResult, formatStatus, formatJobs, formatIngestResult, formatConfig, formatRecoverResult } from './formatters.js';
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
import { existsSync } from 'fs';
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
  watch?: boolean;
  timeout?: number;
}

export interface SearchCLIOptions {
  language?: string;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  topK?: number;
  json?: boolean;
}

export interface InitCLIOptions {
  nonInteractive?: boolean;
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
    // Find the queued jobs for this node
    const jobs = this.deps.registry.getJobsBySource(node.id);
    const jobIds = jobs.map((j) => j.id);
    console.log(formatIngestResult(node.sourceRef.uri, node.id, jobIds));

    if (options?.watch) {
      await this.watchJobs(node.id, { timeoutSec: options.timeout ?? 1800 });
    }
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

  async compile(filePath?: string, options?: CompileCLIOptions): Promise<void> {
    if (filePath) {
      const node = await this.deps.ingestionService.ingestFile(filePath);
      console.log(`Compiled: ${filePath} → ${node.id}`);
      if (options?.watch) {
        await this.watchJobs(node.id, { timeoutSec: options.timeout ?? 1800 });
      }
    } else {
      const pending = this.deps.registry.getPendingJobs(100);
      console.log(`Compiling ${pending.length} pending jobs...`);
      if (options?.watch) {
        // Watch all pending jobs
        const startIds = new Set(pending.map((j) => j.id));
        await this.watchAnyJobCompletion(startIds, { timeoutSec: options.timeout ?? 1800 });
      }
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
    const masked = await this.deps.secretsManager.listMasked();
    for (const k of keys) {
      console.log(`${k}: ${masked[k] ?? '****'}`);
    }
  }

  async init(options?: InitCLIOptions): Promise<void> {
    if (options?.nonInteractive) {
      await this.initNonInteractive();
      return;
    }
    await this.initInteractive();
  }

  private async initInteractive(): Promise<void> {
    console.log('ECHO Core Setup Wizard');
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
          const dataDir = path.join(os.homedir(), '.echo');
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
        console.log('Please install Ollama from https://ollama.com and re-run `echoc init`.');
        return;
      }
    }

    // [3/4] Data directory
    console.log('');
    const dataDirAns = await ask({ question: 'Data directory', defaultValue: path.join(os.homedir(), '.echo') });
    const dataDir = dataDirAns.trim() || path.join(os.homedir(), '.echo');

    // [4/4] Bridge port
    console.log('');
    const portAns = await ask({ question: 'HTTP API port', defaultValue: '37891' });
    const port = parseInt(portAns, 10) || 37891;

    // Build config
    const llmOnly = llmProviders.filter((p) => !p.id.endsWith('-embed'));
    const embedOnly = llmProviders.filter((p) => p.id.endsWith('-embed') || p.type === 'mock');
    const llmProvider = llmOnly[0]!;
    const embedProvider = embedOnly[0] ?? llmOnly[0]!;
    const config: EchoConfig = {
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
    console.log(`✅ Database initialized at ${path.join(dataDir, 'echo.sqlite')}`);
    console.log(`✅ Directory structure created`);

    // Offer to start worker
    console.log('');
    const startWorker = await confirm('Start background worker now?', true);
    if (startWorker) {
      try {
        await this.workerStart();
      } catch (err) {
        console.log(`⚠️  Worker failed to start: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log('');
    console.log('Next steps:');
    console.log('  echoc ingest <file>     # Add documents');
    console.log('  echoc search <query>    # Search your knowledge base');
    console.log('  echoc worker status     # Check compilation progress');
    process.exit(0);
  }

  private async initNonInteractive(): Promise<void> {
    const { FileConfigManager } = await import('../storage/config.js');

    const dataDir = process.env.ECHO_DATA_DIR ?? path.join(os.homedir(), '.echo');
    const llmModel = process.env.ECHO_LLM_MODEL ?? 'rnj-1:8b-cloud';
    const embedModel = process.env.ECHO_EMBED_MODEL ?? 'nomic-embed-text';
    const port = parseInt(process.env.ECHO_BRIDGE_PORT ?? '37891', 10);
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
    const config: EchoConfig = {
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

    console.log(`ECHO Core initialized at ${dataDir}`);
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
      console.log(`⚠️  ${service} is already running (PID ${existing.pid})`);
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
      ECHO_DATA_DIR: dataDir(),
      ECHO_WORKER_SCRIPT: service === 'worker' ? '1' : undefined,
      ECHO_BRIDGE_SCRIPT: service === 'bridge' ? '1' : undefined,
      ECHO_DAEMON: service === 'daemon' ? '1' : undefined,
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

    // Wait briefly to verify it actually started
    await new Promise((r) => setTimeout(r, 1000));
    if (!isPidAlive(pid)) {
      throw new Error(`${service} exited immediately. Check logs: ${logPath}`);
    }

    await writePidFile({
      pid,
      startedAt: new Date().toISOString(),
      service,
      logFile: logPath,
    });
    console.log(`✅ ${service} started (PID ${pid})`);
    console.log(`   Logs: ${logPath}`);
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
      const reg = new SQLiteRegistry(path.join(cfg.dataDir, 'echo.sqlite'));
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

  private async startInlineWorker(): Promise<void> {
    // Spawn a background worker (detached) so the parent can poll the
    // registry while the worker drains the queue. This is identical to
    // running `echoc worker start` programmatically.
    await this.startService('worker');
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
const DEFAULT_SEARCH: EchoConfig['search'] = {
  defaultLanguage: 'en',
  languageDetection: { provider: 'franc', fallback: 'heuristic', confidenceThreshold: 0.7 },
  semantic: { topK: 100, threshold: 0.75, hybridWeight: 0.7 },
  rerank: { topK: 10, weights: { concept: 1.0, claim: 0.5, summary: 0.8, language: 0.3 } },
  cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
  citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
  prompts: {},
  crossLingual: { enabled: true },
};

const DEFAULT_I18N: EchoConfig['i18n'] = { defaultLanguage: 'en', packs: [] };

const DEFAULT_LOGGING: EchoConfig['logging'] = {
  level: 'info',
  console: true,
  file: true,
  filePath: '', // overwritten on save
  pretty: false,
};
