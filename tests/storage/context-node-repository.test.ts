/**
 * ContextNodeRepository Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultContextNodeRepository } from '../../packages/core/src/storage/context-node-repository.js';
import { LocalCASStorage, computeHash } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import type { ContextNode, BuildManifest, SourceRecord } from '../../packages/core/src/domain/types.js';

describe('DefaultContextNodeRepository', () => {
  let tmpDir: string;
  let cas: LocalCASStorage;
  let registry: SQLiteRegistry;
  let repo: DefaultContextNodeRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-repo-'));
    cas = new LocalCASStorage(tmpDir);
    registry = new SQLiteRegistry(path.join(tmpDir, 'registry.sqlite'));
    repo = new DefaultContextNodeRepository(cas, registry);
  });

  afterEach(() => {
    registry.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeNode(hash: string): ContextNode {
    const now = new Date().toISOString();
    return {
      id: hash,
      sourceRef: { protocol: 'file', uri: '/test.md', mimeType: 'text/markdown' },
      childrenIds: [],
      depth: 0,
      artifacts: {},
      build: {
        schemaVersion: 1,
        nodeVersion: 1,
        rawHash: hash,
        contentHash: hash,
        generators: {
          l1: { id: 'placeholder', version: '0.0.0' },
          l2: { id: 'placeholder', version: '0.0.0' },
          embedding: { id: 'placeholder', version: '0.0.0' },
        },
        buildTimestamp: now,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  async function seedNode(content: string, sourceUri = '/test.md'): Promise<string> {
    const hash = computeHash(content);
    const node = makeNode(hash);
    await cas.writeObject(node, { content, meta: { blocks: [] } });

    const source: SourceRecord = {
      id: `src-${hash.slice(0, 8)}`,
      protocol: 'file',
      uri: sourceUri,
      mimeType: 'text/markdown',
      adapterId: 'markdown',
      rawHash: hash,
      rootHash: hash,
      lastSeenAt: new Date().toISOString(),
    };
    registry.insertSource(source);
    return hash;
  }

  it('loadByHash — returns full ContextNode for existing hash', async () => {
    const hash = await seedNode('# Hello\n\nWorld.');
    const node = await repo.loadByHash(hash);
    expect(node).not.toBeNull();
    expect(node!.id).toBe(hash);
    expect(node!.build).toBeDefined();
    expect(node!.build.schemaVersion).toBe(1);
  });

  it('loadByHash — returns null for non-existent hash', async () => {
    const node = await repo.loadByHash('deadbeef0000000000000000000000000000000000000000000000000000dead');
    expect(node).toBeNull();
  });

  it('loadBySourcePath — returns ContextNode for registered source', async () => {
    const hash = await seedNode('# Doc', '/docs/readme.md');
    const node = await repo.loadBySourcePath('/docs/readme.md');
    expect(node).not.toBeNull();
    expect(node!.id).toBe(hash);
  });

  it('loadBySourcePath — returns null for unregistered path', async () => {
    const node = await repo.loadBySourcePath('/nonexistent.md');
    expect(node).toBeNull();
  });

  it('save — persists node and round-trips through load', async () => {
    const hash = await seedNode('# Save Test');
    const node = await repo.loadByHash(hash);
    expect(node).not.toBeNull();

    // Modify and save
    node!.build.nodeVersion = 5;
    await repo.save(node!);

    // Reload and verify
    const reloaded = await repo.loadByHash(hash);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.build.nodeVersion).toBe(5);
  });

  it('buildManifest — returns the node build manifest', async () => {
    const hash = await seedNode('# Manifest');
    const node = await repo.loadByHash(hash);
    expect(node).not.toBeNull();

    const manifest = repo.buildManifest(node!);
    expect(manifest.contentHash).toBe(hash);
    expect(manifest.schemaVersion).toBe(1);
  });

  it('loadL2 — returns L2 artifact when present', async () => {
    const hash = await seedNode('# L2 Test');
    // Write L2.json to CAS
    const objDir = cas.getObjectPath(hash);
    const l2 = { summary: 'Test summary', concepts: ['test'], entities: [], claims: [], relations: [] };
    writeFileSync(path.join(objDir, 'L2.json'), JSON.stringify(l2));

    const loaded = await repo.loadL2(hash);
    expect(loaded).not.toBeNull();
    expect(loaded!.summary).toBe('Test summary');
    expect(loaded!.concepts).toEqual(['test']);
  });

  it('loadL2 — returns null when L2 missing', async () => {
    const hash = await seedNode('# No L2');
    const loaded = await repo.loadL2(hash);
    expect(loaded).toBeNull();
  });

  it('loadChildren — returns child nodes', async () => {
    // Seed parent
    const parentHash = await seedNode('# Parent', '/parent.md');

    // Seed children (with parentId set in their node.json)
    const childHash1 = computeHash('child1');
    const childHash2 = computeHash('child2');

    for (const [childHash, content] of [[childHash1, 'child1'], [childHash2, 'child2']] as const) {
      const objDir = cas.getObjectPath(childHash);
      mkdirSync(objDir, { recursive: true });
      writeFileSync(path.join(objDir, 'content.md'), content);
      writeFileSync(path.join(objDir, 'content.meta.json'), JSON.stringify({ blocks: [] }));

      const childNode = makeNode(childHash);
      childNode.parentId = parentHash;
      // Use cas.writeObject to persist parentId in extended format
      await cas.writeObject(childNode, { content, meta: { blocks: [] } });

      registry.insertSource({
        id: `src-${childHash.slice(0, 8)}`,
        protocol: 'file',
        uri: `/${content}.md`,
        mimeType: 'text/markdown',
        adapterId: 'markdown',
        rawHash: childHash,
        rootHash: childHash,
        lastSeenAt: new Date().toISOString(),
      });
    }

    const children = await repo.loadChildren(parentHash);
    expect(children.length).toBe(2);
    const childIds = children.map((c) => c.id);
    expect(childIds).toContain(childHash1);
    expect(childIds).toContain(childHash2);
  });
});
