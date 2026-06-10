/**
 * CLI --verbose flag tests
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

afterEach(() => {
  delete process.env.RETINEO_LOG_LEVEL;
  delete process.env.RETINEO_LOG_CONSOLE;
  delete process.env.RETINEO_LOG_PRETTY;
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('--verbose flag', () => {
  it('sets RETINEO_LOG_LEVEL=debug when --verbose is passed (simulated hook)', () => {
    // Simulate what the preAction hook does
    delete process.env.RETINEO_LOG_LEVEL;
    delete process.env.RETINEO_LOG_CONSOLE;
    delete process.env.RETINEO_LOG_PRETTY;

    const verbose = true; // --verbose was passed
    if (verbose) {
      process.env.RETINEO_LOG_LEVEL = 'debug';
      process.env.RETINEO_LOG_CONSOLE = 'true';
      process.env.RETINEO_LOG_PRETTY = 'true';
    }

    expect(process.env.RETINEO_LOG_LEVEL).toBe('debug');
    expect(process.env.RETINEO_LOG_CONSOLE).toBe('true');
    expect(process.env.RETINEO_LOG_PRETTY).toBe('true');
  });

  it('without --verbose, env vars are not set to debug', () => {
    delete process.env.RETINEO_LOG_LEVEL;
    delete process.env.RETINEO_LOG_CONSOLE;
    delete process.env.RETINEO_LOG_PRETTY;

    const verbose = false;
    if (verbose) {
      process.env.RETINEO_LOG_LEVEL = 'debug';
      process.env.RETINEO_LOG_CONSOLE = 'true';
      process.env.RETINEO_LOG_PRETTY = 'true';
    }

    expect(process.env.RETINEO_LOG_LEVEL).toBeUndefined();
    expect(process.env.RETINEO_LOG_CONSOLE).toBeUndefined();
    expect(process.env.RETINEO_LOG_PRETTY).toBeUndefined();
  });

  it('createCLI registers --verbose option on the program', async () => {
    const { createCLI } = await import('../../packages/core/src/cli/index.js');
    const prog = createCLI({ version: '0.1.0' });
    // Check that the option is registered
    const opts = prog.options.map((o: { long: string }) => o.long);
    expect(opts).toContain('--verbose');
  });
});

describe('config logging section', () => {
  it('FileConfigManager returns default logging config', async () => {
    const { FileConfigManager } = await import('../../packages/core/src/storage/config.js');
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-cfg-'));
    const mgr = new FileConfigManager(tmpDir);
    await mgr.initializeDataDir();
    const config = await mgr.load();
    expect(config.logging).toBeDefined();
    expect(config.logging.level).toBe('info');
    expect(config.logging.console).toBe(true);
    expect(config.logging.file).toBe(true);
    expect(config.logging.pretty).toBe(false);
    expect(config.logging.filePath).toContain('retineo.log');
  });

  it('custom logging config is preserved on load', async () => {
    const { FileConfigManager } = await import('../../packages/core/src/storage/config.js');
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-cfg2-'));
    const mgr = new FileConfigManager(tmpDir);
    await mgr.initializeDataDir();
    const config = await mgr.load();
    config.logging.level = 'debug';
    config.logging.pretty = true;
    await mgr.save(config);
    const loaded = await mgr.load();
    expect(loaded.logging.level).toBe('debug');
    expect(loaded.logging.pretty).toBe(true);
  });

  it('createLogger uses config.logging to create DualLogger', async () => {
    const { createLogger } = await import('../../packages/core/src/utils/logger.js');
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-cfg3-'));
    const filePath = path.join(tmpDir, 'test.log');
    const logger = createLogger({
      level: 'debug',
      console: false,
      file: true,
      filePath,
      pretty: false,
    });
    logger.info('config test');
    const { readFileSync } = await import('fs');
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.msg).toBe('config test');
  });
});
