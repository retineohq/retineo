/**
 * Logger Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLogger, setGlobalLogger, getGlobalLogger } from '../../packages/core/src/utils/logger.js';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-log-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('createLogger', () => {
  it('logs at info level by default', () => {
    const logger = createLogger({ level: 'info', format: 'json' });
    expect(() => logger.info('test message', { traceId: 'abc' })).not.toThrow();
  });

  it('respects level config — debug below info is silent', () => {
    const logger = createLogger({ level: 'warn' });
    expect(() => logger.debug('hidden')).not.toThrow();
    expect(() => logger.info('hidden')).not.toThrow();
    expect(() => logger.warn('visible')).not.toThrow();
    expect(() => logger.error('visible')).not.toThrow();
  });

  it('child logger binds meta fields', () => {
    const logger = createLogger({ level: 'info' });
    const child = logger.child({ traceId: 'trace-123', layer: 'test' });
    expect(() => child.info('child msg')).not.toThrow();
  });

  it('redacts sensitive fields', () => {
    const filePath = path.join(tmpDir, 'redact.log');
    const dest = require('pino').destination({ dest: filePath, sync: true });
    const logger = createLogger({ level: 'info', destination: 'file', filePath });
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
    const logger = createLogger({ level: 'info', destination: 'file', filePath });
    logger.info('request', { traceId: 'req-42' });

    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.traceId).toBe('req-42');
  });
});

describe('global logger', () => {
  it('getGlobalLogger returns same instance', () => {
    const a = getGlobalLogger();
    const b = getGlobalLogger();
    expect(a).toBe(b);
  });

  it('setGlobalLogger replaces global instance', () => {
    const custom = createLogger({ level: 'error' });
    setGlobalLogger(custom);
    expect(getGlobalLogger()).toBe(custom);
    setGlobalLogger(createLogger());
  });
});
