/**
 * DocumentHit + L1 Navigation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  calculateDocumentScore,
  buildNavigationTree,
  aggregateDocumentHits,
  type ChunkHit,
  type NavigationNode,
} from '../../packages/core/src/search/retrieval-service.js';
import type { L1Index, Section } from '../../packages/core/src/layers/l1-generator.js';
import type { Hash } from '../../packages/core/src/domain/types.js';

describe('calculateDocumentScore', () => {
  it('returns 0 for empty chunks', () => {
    const result = calculateDocumentScore([]);
    expect(result.documentScore).toBe(0);
    expect(result.maxChunkScore).toBe(0);
    expect(result.coverageBonus).toBe(0);
    expect(result.densityBonus).toBe(0);
  });

  it('single chunk — no bonus', () => {
    const chunks: ChunkHit[] = [
      { chunkId: 'c1', score: 0.9, sectionId: 's1', lineRange: [0, 10] },
    ];
    const result = calculateDocumentScore(chunks);
    expect(result.documentScore).toBeCloseTo(0.9);
    expect(result.maxChunkScore).toBe(0.9);
    expect(result.coverageBonus).toBe(0);
    expect(result.densityBonus).toBe(0);
  });

  it('2 chunks from 2 sections — coverage bonus', () => {
    const chunks: ChunkHit[] = [
      { chunkId: 'c1', score: 0.8, sectionId: 's1', lineRange: [0, 10] },
      { chunkId: 'c2', score: 0.7, sectionId: 's2', lineRange: [20, 30] },
    ];
    const result = calculateDocumentScore(chunks);
    expect(result.coverageBonus).toBeGreaterThan(0); // 2 sections * 0.05 = 0.1
    expect(result.densityBonus).toBe(0);
    expect(result.documentScore).toBeCloseTo(0.8 + 0.1); // maxScore + coverageBonus
  });

  it('2 chunks from 1 section — density bonus', () => {
    const chunks: ChunkHit[] = [
      { chunkId: 'c1', score: 0.85, sectionId: 's1', lineRange: [0, 10] },
      { chunkId: 'c2', score: 0.75, sectionId: 's1', lineRange: [5, 15] },
    ];
    const result = calculateDocumentScore(chunks);
    expect(result.coverageBonus).toBe(0);
    expect(result.densityBonus).toBe(0.1);
    expect(result.documentScore).toBeCloseTo(0.85 + 0.1);
  });

  it('3 chunks from 3 sections — higher coverage bonus', () => {
    const chunks: ChunkHit[] = [
      { chunkId: 'c1', score: 0.9, sectionId: 's1', lineRange: [0, 10] },
      { chunkId: 'c2', score: 0.8, sectionId: 's2', lineRange: [20, 30] },
      { chunkId: 'c3', score: 0.7, sectionId: 's3', lineRange: [40, 50] },
    ];
    const result = calculateDocumentScore(chunks);
    expect(result.coverageBonus).toBeCloseTo(0.15); // 3 * 0.05
    expect(result.documentScore).toBeCloseTo(0.9 + 0.15);
  });
});

describe('buildNavigationTree', () => {
  function makeSection(title: string, level: number, lineStart: number, lineEnd: number, children: Section[] = []): Section {
    return { title, level, lineStart, lineEnd, children };
  }

  it('returns null when L1 has no sections', () => {
    const l1Index: L1Index = { sections: [], chunks: [] };
    const chunks: ChunkHit[] = [];
    expect(buildNavigationTree(chunks, l1Index)).toBeNull();
  });

  it('builds tree from H1/H2/H3 sections', () => {
    const sections: Section[] = [
      makeSection('Storage', 1, 0, 50, [
        makeSection('CAS', 2, 5, 25, [
          makeSection('Write', 3, 10, 20),
        ]),
        makeSection('Registry', 2, 25, 45),
      ]),
    ];
    const l1Index: L1Index = { sections, chunks: [] };

    const chunks: ChunkHit[] = [
      { chunkId: 'c1', score: 0.9, sectionId: '5-25', lineRange: [10, 20] },
      { chunkId: 'c2', score: 0.8, sectionId: '25-45', lineRange: [30, 40] },
    ];

    const tree = buildNavigationTree(chunks, l1Index);
    expect(tree).not.toBeNull();
    expect(tree!.length).toBe(1);
    expect(tree![0].heading).toBe('Storage');
    expect(tree![0].level).toBe(1);
    expect(tree![0].children.length).toBe(2);
    expect(tree![0].children[0].heading).toBe('CAS');
    expect(tree![0].children[0].chunkHits.length).toBe(1);
    expect(tree![0].children[0].chunkHits[0].chunkId).toBe('c1');
    expect(tree![0].children[1].heading).toBe('Registry');
    expect(tree![0].children[1].chunkHits.length).toBe(1);
  });

  it('chunks are assigned to correct sections', () => {
    const sections: Section[] = [
      makeSection('Intro', 1, 0, 30),
      makeSection('Body', 1, 30, 60),
    ];
    const l1Index: L1Index = { sections, chunks: [] };

    const chunks: ChunkHit[] = [
      { chunkId: 'c1', score: 0.9, sectionId: '0-30', lineRange: [5, 15] },
      { chunkId: 'c2', score: 0.8, sectionId: '30-60', lineRange: [35, 45] },
    ];

    const tree = buildNavigationTree(chunks, l1Index);
    expect(tree).not.toBeNull();
    expect(tree![0].chunkHits.length).toBe(1);
    expect(tree![0].chunkHits[0].chunkId).toBe('c1');
    expect(tree![1].chunkHits.length).toBe(1);
    expect(tree![1].chunkHits[0].chunkId).toBe('c2');
  });

  it('sections without chunks still appear in tree', () => {
    const sections: Section[] = [
      makeSection('Empty', 1, 0, 30),
      makeSection('HasChunks', 1, 30, 60),
    ];
    const l1Index: L1Index = { sections, chunks: [] };

    const chunks: ChunkHit[] = [
      { chunkId: 'c1', score: 0.9, sectionId: '30-60', lineRange: [35, 45] },
    ];

    const tree = buildNavigationTree(chunks, l1Index);
    expect(tree).not.toBeNull();
    expect(tree!.length).toBe(2);
    expect(tree![0].heading).toBe('Empty');
    expect(tree![0].chunkHits.length).toBe(0);
    expect(tree![1].heading).toBe('HasChunks');
    expect(tree![1].chunkHits.length).toBe(1);
  });
});

describe('aggregateDocumentHits', () => {
  it('groups chunks from same document into one DocumentHit', () => {
    const chunkHits = [
      { chunkId: 'c1', score: 0.9, sectionId: 's1', lineRange: [0, 10] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
      { chunkId: 'c2', score: 0.8, sectionId: 's2', lineRange: [20, 30] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
      { chunkId: 'c3', score: 0.7, sectionId: 's3', lineRange: [40, 50] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
    ];
    const l1Indices = new Map<Hash, L1Index>();

    const hits = aggregateDocumentHits(chunkHits, l1Indices);
    expect(hits.length).toBe(1);
    expect(hits[0].chunks.length).toBe(3);
    expect(hits[0].sourceHash).toBe('hash-a');
  });

  it('creates separate DocumentHits for different documents', () => {
    const chunkHits = [
      { chunkId: 'c1', score: 0.9, sectionId: 's1', lineRange: [0, 10] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
      { chunkId: 'c2', score: 0.8, sectionId: 's1', lineRange: [0, 10] as [number, number], sourceHash: 'hash-b' as Hash, sourcePath: '/b.md' },
    ];
    const l1Indices = new Map<Hash, L1Index>();

    const hits = aggregateDocumentHits(chunkHits, l1Indices);
    expect(hits.length).toBe(2);
  });

  it('coverage bonus when chunks span multiple sections', () => {
    const chunkHits = [
      { chunkId: 'c1', score: 0.8, sectionId: 's1', lineRange: [0, 10] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
      { chunkId: 'c2', score: 0.7, sectionId: 's2', lineRange: [20, 30] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
    ];
    const l1Indices = new Map<Hash, L1Index>();

    const hits = aggregateDocumentHits(chunkHits, l1Indices);
    expect(hits.length).toBe(1);
    expect(hits[0].coverageBonus).toBeGreaterThan(0);
  });

  it('density bonus when chunks in same section', () => {
    const chunkHits = [
      { chunkId: 'c1', score: 0.85, sectionId: 's1', lineRange: [0, 10] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
      { chunkId: 'c2', score: 0.75, sectionId: 's1', lineRange: [5, 15] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
    ];
    const l1Indices = new Map<Hash, L1Index>();

    const hits = aggregateDocumentHits(chunkHits, l1Indices);
    expect(hits.length).toBe(1);
    expect(hits[0].densityBonus).toBe(0.1);
  });

  it('L1 missing → navigationTree is null', () => {
    const chunkHits = [
      { chunkId: 'c1', score: 0.9, sectionId: 's1', lineRange: [0, 10] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
    ];
    const l1Indices = new Map<Hash, L1Index>();

    const hits = aggregateDocumentHits(chunkHits, l1Indices);
    expect(hits.length).toBe(1);
    expect(hits[0].navigationTree).toBeNull();
  });

  it('L1 present → navigationTree is built', () => {
    const chunkHits = [
      { chunkId: 'c1', score: 0.9, sectionId: '0-30', lineRange: [5, 15] as [number, number], sourceHash: 'hash-a' as Hash, sourcePath: '/a.md' },
    ];
    const l1Index: L1Index = {
      sections: [{ title: 'Intro', level: 1, lineStart: 0, lineEnd: 30, children: [] }],
      chunks: [],
    };
    const l1Indices = new Map<Hash, L1Index>([['hash-a', l1Index]]);

    const hits = aggregateDocumentHits(chunkHits, l1Indices);
    expect(hits.length).toBe(1);
    expect(hits[0].navigationTree).not.toBeNull();
    expect(hits[0].navigationTree![0].heading).toBe('Intro');
    expect(hits[0].navigationTree![0].chunkHits.length).toBe(1);
  });

  it('results sorted by documentScore descending', () => {
    const chunkHits = [
      { chunkId: 'c1', score: 0.5, sectionId: 's1', lineRange: [0, 10] as [number, number], sourceHash: 'hash-low' as Hash, sourcePath: '/low.md' },
      { chunkId: 'c2', score: 0.9, sectionId: 's1', lineRange: [0, 10] as [number, number], sourceHash: 'hash-high' as Hash, sourcePath: '/high.md' },
    ];
    const l1Indices = new Map<Hash, L1Index>();

    const hits = aggregateDocumentHits(chunkHits, l1Indices);
    expect(hits[0].sourceHash).toBe('hash-high');
    expect(hits[1].sourceHash).toBe('hash-low');
  });
});
