/**
 * Navigation Tree Tests — L1 section ↔ chunk mapping
 */

import { describe, it, expect } from 'vitest';
import { buildNavigationTree, type ChunkHit } from '../../packages/core/src/search/retrieval-service.js';
import type { L1Index, Section } from '../../packages/core/src/layers/l1-generator.js';

function makeSection(title: string, level: number, lineStart: number, lineEnd: number, children: Section[] = []): Section {
  return { title, level, lineStart, lineEnd, children };
}

describe('buildNavigationTree — L1 integration', () => {
  it('H1/H2/H3 → correct tree structure', () => {
    const sections: Section[] = [
      makeSection('Architecture', 1, 0, 100, [
        makeSection('Storage', 2, 5, 40, [
          makeSection('CAS', 3, 10, 25),
          makeSection('Registry', 3, 25, 40),
        ]),
        makeSection('Search', 2, 40, 80, [
          makeSection('Retrieval', 3, 45, 65),
          makeSection('Ranking', 3, 65, 80),
        ]),
      ]),
    ];
    const l1Index: L1Index = { sections, chunks: [] };

    const chunks: ChunkHit[] = [
      { chunkId: 'c1', score: 0.95, sectionId: '10-25', lineRange: [12, 22] },
      { chunkId: 'c2', score: 0.88, sectionId: '45-65', lineRange: [48, 60] },
    ];

    const tree = buildNavigationTree(chunks, l1Index);
    expect(tree).not.toBeNull();
    expect(tree!.length).toBe(1);

    const arch = tree![0];
    expect(arch.heading).toBe('Architecture');
    expect(arch.level).toBe(1);
    expect(arch.children.length).toBe(2);

    // Storage → CAS
    const storage = arch.children[0];
    expect(storage.heading).toBe('Storage');
    expect(storage.level).toBe(2);
    expect(storage.children.length).toBe(2);
    expect(storage.children[0].heading).toBe('CAS');
    expect(storage.children[0].chunkHits.length).toBe(1);
    expect(storage.children[0].chunkHits[0].chunkId).toBe('c1');

    // Search → Retrieval
    const search = arch.children[1];
    expect(search.heading).toBe('Search');
    expect(search.children[0].heading).toBe('Retrieval');
    expect(search.children[0].chunkHits.length).toBe(1);
    expect(search.children[0].chunkHits[0].chunkId).toBe('c2');
  });

  it('chunk lineRange → correct section assignment', () => {
    const sections: Section[] = [
      makeSection('A', 1, 0, 20),
      makeSection('B', 1, 20, 40),
      makeSection('C', 1, 40, 60),
    ];
    const l1Index: L1Index = { sections, chunks: [] };

    const chunks: ChunkHit[] = [
      { chunkId: 'c-a', score: 0.9, sectionId: '0-20', lineRange: [5, 15] },
      { chunkId: 'c-b', score: 0.8, sectionId: '20-40', lineRange: [25, 35] },
      { chunkId: 'c-c', score: 0.7, sectionId: '40-60', lineRange: [45, 55] },
    ];

    const tree = buildNavigationTree(chunks, l1Index);
    expect(tree).not.toBeNull();
    expect(tree!.length).toBe(3);
    expect(tree![0].chunkHits[0].chunkId).toBe('c-a');
    expect(tree![1].chunkHits[0].chunkId).toBe('c-b');
    expect(tree![2].chunkHits[0].chunkId).toBe('c-c');
  });

  it('section order matches document order', () => {
    const sections: Section[] = [
      makeSection('First', 1, 0, 30),
      makeSection('Second', 1, 30, 60),
      makeSection('Third', 1, 60, 90),
    ];
    const l1Index: L1Index = { sections, chunks: [] };
    const tree = buildNavigationTree([], l1Index);

    expect(tree).not.toBeNull();
    expect(tree!.map((n) => n.heading)).toEqual(['First', 'Second', 'Third']);
  });

  it('multiple chunks in same section grouped correctly', () => {
    const sections: Section[] = [
      makeSection('Big Section', 1, 0, 100),
    ];
    const l1Index: L1Index = { sections, chunks: [] };

    const chunks: ChunkHit[] = [
      { chunkId: 'c1', score: 0.9, sectionId: '0-100', lineRange: [10, 20] },
      { chunkId: 'c2', score: 0.85, sectionId: '0-100', lineRange: [30, 40] },
      { chunkId: 'c3', score: 0.8, sectionId: '0-100', lineRange: [60, 70] },
    ];

    const tree = buildNavigationTree(chunks, l1Index);
    expect(tree).not.toBeNull();
    expect(tree![0].chunkHits.length).toBe(3);
    expect(tree![0].children.length).toBe(0);
  });

  it('returns null for empty sections', () => {
    const l1Index: L1Index = { sections: [], chunks: [] };
    expect(buildNavigationTree([], l1Index)).toBeNull();
  });
});
