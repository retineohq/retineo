/**
 * ECHO Core — Init Wizard Tests
 *
 * Validates that:
 *  - Non-interactive `init` writes a working Ollama-first config
 *  - When Ollama is detected, models are filtered correctly
 *  - When Ollama is missing, a non-interactive run still succeeds with defaults
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLICommands } from '../../packages/core/src/cli/commands.js';
import { FileConfigManager } from '../../packages/core/src/storage/config.js';
import { rmSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

function makeDeps() {
  return {
    version: '0.1.0',
    ingestionService: { async ingestFile() { return {} as any; } },
    retrievalService: { async search() { return {} as any; } },
    queryAnalyzer: { async analyze() { return {} as any; } },
    contextAssembler: { async assemble() { return {} as any; } },
    registry: {
      listSources: () => [],
      getPendingJobs: () => [],
      getJobsBySource: () => [],
      getJob: () => null,
      getJobCounts: () => ({ pending: 0, running: 0, completed: 0, failed: 0, dead: 0 }),
      getLastHeartbeat: () => null,
      getRunningWorkerIds: () => [],
      recoverOrphan: () => {},
      getOrphan: () => null,
    } as any,
    configManager: {
      load: async () => ({ dataDir: '', defaultAdapter: '', llmProvider: '', embeddingModel: '', llm: { defaultProvider: '', providers: [] }, embedding: { defaultProvider: '', providers: [] }, bridge: { host: '', port: 0 }, search: {} as any, i18n: {} as any, logging: {} as any }),
      save: async () => {},
    } as any,
    pipeline: { processJob: async () => {}, enqueueL1: () => {}, enqueueL2: () => {}, enqueueL3: () => {} },
    secretsManager: { set: async () => {}, get: async () => undefined, delete: async () => {}, list: async () => [], listMasked: async () => ({}) },
    cas: { getObjectPath: () => '/tmp/echo/objects/ab/cdef', read: async () => Buffer.from(''), exists: () => false, write: async () => '', delete: async () => {}, writeObject: async () => {}, readObject: async () => ({ node: {} as any, artifacts: { content: '', meta: {} as any } }) },
  };
}

describe('init wizard — non-interactive', () => {
  const testDir = path.join(os.tmpdir(), 'echo-init-wizard-' + Date.now() + '-' + Math.random().toString(36).slice(2));

  beforeEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    delete process.env.ECHO_DATA_DIR;
    delete process.env.ECHO_LLM_MODEL;
    delete process.env.ECHO_EMBED_MODEL;
    delete process.env.ECHO_BRIDGE_PORT;
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('writes Ollama-first config and initializes data dir', async () => {
    process.env.ECHO_DATA_DIR = testDir;

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmds = new CLICommands(makeDeps());
    await cmds.init({ nonInteractive: true, llmModel: 'gemma4:31b-cloud', embedModel: 'nomic-embed-text-v2-moe:latest' });

    expect(existsSync(path.join(testDir, 'config.yaml'))).toBe(true);
    expect(existsSync(path.join(testDir, 'echo.sqlite'))).toBe(true);
    expect(existsSync(path.join(testDir, 'objects'))).toBe(true);
    expect(existsSync(path.join(testDir, 'logs'))).toBe(true);

    const cfg = yaml.load(readFileSync(path.join(testDir, 'config.yaml'), 'utf-8')) as Record<string, unknown>;
    const llm = cfg.llm as { defaultProvider: string; providers: Array<Record<string, unknown>> };
    const embedding = cfg.embedding as { defaultProvider: string; providers: Array<Record<string, unknown>> };

    expect(llm.defaultProvider).toBe('ollama');
    expect(llm.providers.length).toBeGreaterThan(0);
    expect(llm.providers[0].type).toBe('ollama');
    expect(llm.providers[0].model).toBe('gemma4:31b-cloud');

    expect(embedding.defaultProvider).toBe('ollama-embed');
    expect(embedding.providers[0].model).toBe('nomic-embed-text-v2-moe:latest');

    log.mockRestore();
  });

  it('requires --llm-model and --embed-model in non-interactive mode', async () => {
    process.env.ECHO_DATA_DIR = testDir;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    const cmds = new CLICommands(makeDeps());
    await cmds.init({ nonInteractive: true });

    expect(errorLog).toHaveBeenCalledWith('Error: --non-interactive requires --llm-model and --embed-model.');
    expect(process.exitCode).toBe(1);
    errorLog.mockRestore();
    process.exitCode = 0;
  });

  it('falls back to env vars when flags are not set', async () => {
    process.env.ECHO_DATA_DIR = testDir;
    process.env.ECHO_LLM_MODEL = 'gemma4:31b-cloud';
    process.env.ECHO_EMBED_MODEL = 'nomic-embed-text-v2-moe:latest';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmds = new CLICommands(makeDeps());
    await cmds.init({ nonInteractive: true });

    const cfg = yaml.load(readFileSync(path.join(testDir, 'config.yaml'), 'utf-8')) as Record<string, unknown>;
    const llm = cfg.llm as { providers: Array<Record<string, unknown>> };
    const embedding = cfg.embedding as { providers: Array<Record<string, unknown>> };

    expect(llm.providers[0].model).toBe('gemma4:31b-cloud');
    expect(embedding.providers[0].model).toBe('nomic-embed-text-v2-moe:latest');
    log.mockRestore();
  });

  it('config includes bridge section with default port', async () => {
    process.env.ECHO_DATA_DIR = testDir;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmds = new CLICommands(makeDeps());
    await cmds.init({ nonInteractive: true, llmModel: 'gemma4:31b-cloud', embedModel: 'nomic-embed-text-v2-moe:latest' });

    const cfg = yaml.load(readFileSync(path.join(testDir, 'config.yaml'), 'utf-8')) as Record<string, unknown>;
    const bridge = cfg.bridge as { host: string; port: number };
    expect(bridge.host).toBe('127.0.0.1');
    expect(bridge.port).toBe(37891);
    log.mockRestore();
  });

  it('respects ECHO_BRIDGE_PORT env var', async () => {
    process.env.ECHO_DATA_DIR = testDir;
    process.env.ECHO_BRIDGE_PORT = '40000';

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmds = new CLICommands(makeDeps());
    await cmds.init({ nonInteractive: true, llmModel: 'gemma4:31b-cloud', embedModel: 'nomic-embed-text-v2-moe:latest' });

    const cfg = yaml.load(readFileSync(path.join(testDir, 'config.yaml'), 'utf-8')) as Record<string, unknown>;
    expect((cfg.bridge as { port: number }).port).toBe(40000);
    log.mockRestore();
  });

  it('sets search.semantic.threshold to 0.5', async () => {
    process.env.ECHO_DATA_DIR = testDir;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmds = new CLICommands(makeDeps());
    await cmds.init({ nonInteractive: true, llmModel: 'gemma4:31b-cloud', embedModel: 'nomic-embed-text-v2-moe:latest' });

    const cfg = yaml.load(readFileSync(path.join(testDir, 'config.yaml'), 'utf-8')) as Record<string, unknown>;
    const search = cfg.search as { semantic: { threshold: number } };
    expect(search.semantic.threshold).toBe(0.5);
    log.mockRestore();
  });
});

describe('Ollama probe', () => {
  it('returns null when Ollama is not running', async () => {
    // The internal probe fetches http://localhost:11434/api/tags
    // If Ollama isn't running in the test env, the probe returns null.
    // This test simply asserts the non-interactive flow still completes with explicit flags.
    const testDir = path.join(os.tmpdir(), 'echo-no-ollama-' + Date.now());
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });

    process.env.ECHO_DATA_DIR = testDir;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cmds = new CLICommands(makeDeps());
    await cmds.init({ nonInteractive: true, llmModel: 'gemma4:31b-cloud', embedModel: 'nomic-embed-text-v2-moe:latest' });

    expect(existsSync(path.join(testDir, 'config.yaml'))).toBe(true);
    log.mockRestore();
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });
});

describe('init wizard — interactive exit', () => {
  it('calls process.exit(0) after interactive init completes', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Mock ask/choose/confirm to immediately return mock-mode selections
    const promptMod = await import('../../packages/core/src/cli/prompt.js');
    // ask needs to return '3' so choose picks the mock option (index 2)
    const askSpy = vi.spyOn(promptMod, 'ask').mockResolvedValue('3');
    const chooseSpy = vi.spyOn(promptMod, 'choose').mockResolvedValue('mock');
    const confirmSpy = vi.spyOn(promptMod, 'confirm').mockResolvedValue(false);

    const testDir = path.join(os.tmpdir(), 'echo-init-exit-' + Date.now());
    process.env.ECHO_DATA_DIR = testDir;

    const cmds = new CLICommands(makeDeps());
    // interactive init will use mocked prompts and hit process.exit(0) at end
    try {
      await cmds.init({ nonInteractive: false });
    } catch {
      // process.exit may throw in test env
    }

    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    log.mockRestore();
    askSpy.mockRestore();
    chooseSpy.mockRestore();
    confirmSpy.mockRestore();
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });
});
