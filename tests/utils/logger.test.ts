/**
 * Logger Tests — DualLogger + legacy PinoLogger
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLogger, setGlobalLogger, getGlobalLogger, DualLogger } from '../../packages/core/src/utils/logger.js';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-log-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// DualLogger
// ---------------------------------------------------------------------------

describe('DualLogger', () => {
  it('writes JSON to file when file logger is enabled', () => {
    const filePath = path.join(tmpDir, 'dual.log');
    const logger = new DualLogger({
      level: 'info',
      console: false,
      file: true,
      filePath,
      pretty: false,
    });
    logger.info('hello file', { traceId: 't1' });

    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.msg).toBe('hello file');
    expect(last.traceId).toBe('t1');
    expect(last.level).toBe(30); // info
  });

  it('does not crash if file directory is unwritable (console still works)', () => {
    // Point at an impossible path
    const logger = createLogger({
      level: 'info',
      console: true,
      file: true,
      filePath: '/root/.retineo/logs/impossible.log',
      pretty: false,
    });
    expect(() => logger.info('still works')).not.toThrow();
    expect(() => logger.warn('warn works')).not.toThrow();
    expect(() => logger.error('error works')).not.toThrow();
  });

  it('level filtering works — debug below info is silent', () => {
    const filePath = path.join(tmpDir, 'level.log');
    const logger = createLogger({
      level: 'warn',
      console: false,
      file: true,
      filePath,
      pretty: false,
    });
    expect(() => logger.debug('hidden')).not.toThrow();
    expect(() => logger.info('hidden')).not.toThrow();
    expect(() => logger.warn('visible')).not.toThrow();
    expect(() => logger.error('visible')).not.toThrow();

    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).msg).toBe('visible'); // warn
    expect(JSON.parse(lines[1]).msg).toBe('visible'); // error
  });

  it('child logger binds meta fields', () => {
    const filePath = path.join(tmpDir, 'child.log');
    const logger = createLogger({
      level: 'info',
      console: false,
      file: true,
      filePath,
      pretty: false,
    });
    const child = logger.child({ traceId: 'trace-123', layer: 'test' });
    expect(() => child.info('child msg')).not.toThrow();

    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.msg).toBe('child msg');
    expect(last.traceId).toBe('trace-123');
    expect(last.layer).toBe('test');
  });

  it('redacts sensitive fields', () => {
    const filePath = path.join(tmpDir, 'redact.log');
    const logger = createLogger({
      level: 'info',
      console: false,
      file: true,
      filePath,
      pretty: false,
    });
    logger.info('login', { apiKey: 'super-secret', password: 'hunter2', safe: 'ok' });

    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.apiKey).toBe('[REDACTED]');
    expect(last.password).toBe('[REDACTED]');
    expect(last.safe).toBe('ok');
  });

  it('includes traceId in log entries', () => {
    const filePath = path.join(tmpDir, 'trace.log');
    const logger = createLogger({
      level: 'info',
      console: false,
      file: true,
      filePath,
      pretty: false,
    });
    logger.info('request', { traceId: 'req-42' });

    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.traceId).toBe('req-42');
  });

  it('pretty mode produces human-readable output (file stays JSON)', () => {
    const filePath = path.join(tmpDir, 'pretty.log');
    const logger = new DualLogger({
      level: 'info',
      console: true,
      file: true,
      filePath,
      pretty: true,
    });
    logger.info('pretty test');
    // File should still be JSON
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.msg).toBe('pretty test');
  });

  it('console-only mode works (no file)', () => {
    const logger = new DualLogger({
      level: 'debug',
      console: true,
      file: false,
    });
    expect(() => logger.debug('visible')).not.toThrow();
    expect(() => logger.info('visible')).not.toThrow();
  });

  it('debug level shows all messages including debug', () => {
    const filePath = path.join(tmpDir, 'debug.log');
    const logger = new DualLogger({
      level: 'debug',
      console: false,
      file: true,
      filePath,
      pretty: false,
    });
    logger.debug('debug msg');
    logger.info('info msg');

    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).msg).toBe('debug msg');
    expect(JSON.parse(lines[1]).msg).toBe('info msg');
  });
});

// ---------------------------------------------------------------------------
// Global logger (backward compat)
// ---------------------------------------------------------------------------

describe('global logger', () => {
  it('getGlobalLogger returns same instance', () => {
    const a = getGlobalLogger();
    const b = getGlobalLogger();
    expect(a).toBe(b);
  });

  it('setGlobalLogger replaces global instance', () => {
    const custom = createLogger({ level: 'error', console: false });
    setGlobalLogger(custom);
    expect(getGlobalLogger()).toBe(custom);
    setGlobalLogger(createLogger());
  });
});
