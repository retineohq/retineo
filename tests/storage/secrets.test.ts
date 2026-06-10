/**
 * RETINEO Core — Secrets Manager Tests
 * Phase 7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { FileSecretsManager, resolveSecret, resolveConfigValue } from '../../packages/core/src/storage/secrets.js';

describe('FileSecretsManager', () => {
  let tmpDir: string;
  let secretsPath: string;
  let manager: FileSecretsManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'retineo-secrets-'));
    secretsPath = path.join(tmpDir, 'secrets.json');
    manager = new FileSecretsManager(secretsPath);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('set and get roundtrip', async () => {
    await manager.set('openai', 'sk-test123');
    const value = await manager.get('openai');
    expect(value).toBe('sk-test123');
  });

  it('get returns undefined for missing key', async () => {
    const value = await manager.get('missing');
    expect(value).toBeUndefined();
  });

  it('delete removes key', async () => {
    await manager.set('openai', 'sk-test');
    await manager.delete('openai');
    expect(await manager.get('openai')).toBeUndefined();
    expect(await manager.list()).toEqual([]);
  });

  it('list returns keys', async () => {
    await manager.set('a', '1');
    await manager.set('b', '2');
    const keys = await manager.list();
    expect(keys.sort()).toEqual(['a', 'b']);
  });

  it('listMasked returns masked values', async () => {
    await manager.set('openai', 'sk-abcdefghijklmnopqrstuvwxyz');
    const masked = await manager.listMasked();
    expect(masked['openai']).toBe('sk-a...wxyz');
  });

  it('set overwrites existing key', async () => {
    await manager.set('openai', 'first');
    await manager.set('openai', 'second');
    expect(await manager.get('openai')).toBe('second');
  });
});

describe('resolveSecret', () => {
  it('prefers env var over secrets manager', async () => {
    process.env.TEST_KEY_PHASE7 = 'from-env';
    const manager = new FileSecretsManager();
    await manager.set('TEST_KEY_PHASE7', 'from-secrets');
    const resolved = await resolveSecret('TEST_KEY_PHASE7', manager);
    expect(resolved).toBe('from-env');
    delete process.env.TEST_KEY_PHASE7;
  });

  it('falls back to secrets manager', async () => {
    const manager = new FileSecretsManager();
    await manager.set('MY_KEY', 'from-secrets');
    const resolved = await resolveSecret('MY_KEY', manager);
    expect(resolved).toBe('from-secrets');
  });

  it('returns undefined when neither exists', async () => {
    const manager = new FileSecretsManager();
    const resolved = await resolveSecret('NONEXISTENT_KEY_XYZ', manager);
    expect(resolved).toBeUndefined();
  });
});

describe('resolveConfigValue', () => {
  it('substitutes ${ENV_VAR} from env', async () => {
    process.env.MY_VAR = 'hello';
    const resolved = await resolveConfigValue('prefix-${MY_VAR}-suffix', new FileSecretsManager());
    expect(resolved).toBe('prefix-hello-suffix');
    delete process.env.MY_VAR;
  });

  it('leaves value unchanged when no placeholders', async () => {
    const resolved = await resolveConfigValue('plain', new FileSecretsManager());
    expect(resolved).toBe('plain');
  });
});
