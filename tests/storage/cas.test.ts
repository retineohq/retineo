/**
 * CAS Storage Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import {
  LocalCASStorage,
  computeHash,
  getObjectPath,
} from '../../packages/core/src/storage/cas.js';
import type { ContextNode, ContentMeta, L2Artifact } from '../../packages/core/src/domain/types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-cas-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeNode(id: string): ContextNode {
  return {
    id,
    sourceRef: { protocol: 'file', uri: '/dev/null', mimeType: 'text/plain' },
    childrenIds: [],
    depth: 0,
    build: {
      schemaVersion: 1,
      nodeVersion: 1,
      rawHash: id,
      contentHash: id,
      generators: {
        l1: { id: 'p', version: '0.0.0' },
        l2: { id: 'p', version: '0.0.0' },
        embedding: { id: 'p', version: '0.0.0' },
      },
      buildTimestamp: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('computeHash', () => {
  it('produces 64-char hex for string', () => {
    const h = computeHash('hello');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces 64-char hex for buffer', () => {
    const h = computeHash(Buffer.from('hello'));
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeHash('abc')).toBe(computeHash('abc'));
  });

  it('differs for different content', () => {
    expect(computeHash('a')).not.toBe(computeHash('b'));
  });
});

describe('getObjectPath', () => {
  it('splits hash into prefix + suffix', () => {
    const hash = 'abcd1234'.repeat(8);
    const p = getObjectPath('/data', hash);
    expect(p).toBe(path.join('/data', 'objects', 'ab', hash.slice(2)));
  });
});

describe('LocalCASStorage', () => {
  it('writes and reads artifact', async () => {
    const cas = new LocalCASStorage(tmpDir);
    const content = 'hello world';
    const hash = await cas.write(content);
    expect(cas.exists(hash)).toBe(true);
    const buf = await cas.read(hash);
    expect(buf.toString()).toBe(content);
  });

  it('returns same hash for same content (idempotent)', async () => {
    const cas = new LocalCASStorage(tmpDir);
    const h1 = await cas.write('same');
    const h2 = await cas.write('same');
    expect(h1).toBe(h2);
  });

  it('delete removes artifact', async () => {
    const cas = new LocalCASStorage(tmpDir);
    const hash = await cas.write('delete-me');
    expect(cas.exists(hash)).toBe(true);
    await cas.delete(hash);
    expect(cas.exists(hash)).toBe(false);
  });

  it('writeObject persists node + artifacts', async () => {
    const cas = new LocalCASStorage(tmpDir);
    const node = makeNode('a'.repeat(64));
    const meta: ContentMeta = { blocks: [] };
    await cas.writeObject(node, { content: '# Hello', meta });

    const obj = await cas.readObject(node.id);
    expect(obj.node.id).toBe(node.id);
    expect(obj.artifacts.content).toBe('# Hello');
    expect(obj.artifacts.meta.blocks).toEqual([]);
  });

  it('writeObject with optional L1/L2', async () => {
    const cas = new LocalCASStorage(tmpDir);
    const node = makeNode('b'.repeat(64));
    const l2: L2Artifact = { summary: 's', concepts: [], entities: [], claims: [], relations: [] };
    await cas.writeObject(node, { content: 'c', meta: { blocks: [] }, l1: '# L1', l2 });

    const obj = await cas.readObject(node.id);
    expect(obj.artifacts.l1).toBe('# L1');
    expect(obj.artifacts.l2).toEqual(l2);
  });

  it('getObjectPath resolves correctly', () => {
    const cas = new LocalCASStorage(tmpDir);
    const hash = 'deadbeef'.repeat(8);
    expect(cas.getObjectPath(hash)).toBe(path.join(tmpDir, 'objects', 'de', hash.slice(2)));
  });
});
