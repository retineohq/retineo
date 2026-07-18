/**
 * NodeBuilder Tests
 */

import { describe, it, expect } from 'vitest';
import { DefaultNodeBuilder } from '../../packages/core/src/storage/node-builder.js';
import type { NormalizedContent, SegmentRef, SourceRef } from '../../packages/core/src/domain/types.js';
import type { RegistryEntry } from '../../packages/core/src/storage/types.js';

const builder = new DefaultNodeBuilder();

function makeSource(contentHash?: string): RegistryEntry {
  return {
    sourceId: 'filesystem',
    externalId: '/tmp/test.md',
    contentHash: contentHash ?? 'c'.repeat(64),
    etag: 'etag',
    status: 'active',
    deletedAt: null,
    lastSeenAt: Date.now(),
  };
}

const sourceRef: SourceRef = {
  protocol: 'file',
  uri: '/tmp/test.md',
  mimeType: 'text/markdown',
};

function makeNormalized(content: string, segments?: SegmentRef[]): NormalizedContent {
  return {
    content,
    metadata: { blocks: [] },
    segments,
  };
}

describe('buildRoot', () => {
  it('creates root node with correct hashes', async () => {
    const src = makeSource();
    const norm = makeNormalized('Hello world');
    const node = await builder.buildRoot(src, sourceRef, norm, 'r'.repeat(64));

    expect(node.id).toMatch(/^[a-f0-9]{64}$/);
    expect(node.depth).toBe(0);
    expect(node.childrenIds).toEqual([]);
    expect(node.build.rawHash).toBe('r'.repeat(64));
    expect(node.build.contentHash).toBe(node.id);
    expect(node.build.schemaVersion).toBe(2);
    expect(node.artifacts.l0).toBeDefined();
    expect(node.artifacts.l0!.wordCount).toBe(2);
    expect(node.artifacts.l0!.charCount).toBe(11);
  });

  it('generators are placeholders', async () => {
    const src = makeSource();
    const norm = makeNormalized('x');
    const node = await builder.buildRoot(src, sourceRef, norm, 'r'.repeat(64));
    expect(node.build.generators.l1.id).toBe('placeholder');
    expect(node.build.generators.l2.version).toBe('0.0.0');
  });
});

describe('buildSegments', () => {
  it('creates child nodes from segments', async () => {
    const src = makeSource();
    const norm = makeNormalized('parent', [
      { spanStart: 0, spanEnd: 3, content: 'one', metadata: { blocks: [] } },
      { spanStart: 3, spanEnd: 6, content: 'two', metadata: { blocks: [] } },
    ]);
    const root = await builder.buildRoot(src, sourceRef, norm, 'r'.repeat(64));
    const children = await builder.buildSegments(root, norm.segments!, src, sourceRef);

    expect(children.length).toBe(2);
    expect(children[0].depth).toBe(1);
    expect(children[0].parentHash).toBe(root.id);
    expect(children[1].parentHash).toBe(root.id);
    expect(children[0].id).not.toBe(children[1].id);
  });

  it('each child has unique contentHash', async () => {
    const src = makeSource();
    const segs: SegmentRef[] = [
      { spanStart: 0, spanEnd: 2, content: 'a', metadata: { blocks: [] } },
      { spanStart: 2, spanEnd: 4, content: 'b', metadata: { blocks: [] } },
    ];
    const root = await builder.buildRoot(src, sourceRef, makeNormalized('ab'), 'r'.repeat(64));
    const children = await builder.buildSegments(root, segs, src, sourceRef);
    expect(children[0].id).not.toBe(children[1].id);
  });
});

describe('createBuildManifest', () => {
  it('uses provided generator versions', () => {
    const manifest = builder.createBuildManifest('r'.repeat(64), 'c'.repeat(64), {
      l1: '1.0.0',
      l2: '2.0.0',
    });
    expect(manifest.generators.l1.version).toBe('1.0.0');
    expect(manifest.generators.l2.version).toBe('2.0.0');
    expect(manifest.generators.embedding.version).toBe('0.0.0');
  });

  it('timestamp is ISO 8601', () => {
    const manifest = builder.createBuildManifest('r'.repeat(64), 'c'.repeat(64));
    expect(manifest.buildTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
