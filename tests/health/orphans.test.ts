/**
 * Orphan metric — text-reference connectivity tests.
 */

import { describe, it, expect } from 'vitest';
import { orphans, extractTextReferences } from '../../packages/core/src/health/metrics/orphans.js';
import type { Hash } from '../../packages/core/src/domain/types.js';

interface FixtureDoc {
  content: string;
  l1?: string;
  l2Summary?: string;
  semanticLinks?: Array<{ targetHash: Hash; reason: string }>;
}

function makeCas(docs: Record<Hash, FixtureDoc>) {
  return {
    exists: (hash: Hash) => hash in docs,
    getObjectPath: (hash: Hash) => `/objects/${hash}`,
    readObject: async (hash: Hash) => {
      const doc = docs[hash];
      if (!doc) throw new Error('missing');
      return {
        node: { semanticLinks: doc.semanticLinks ?? [] },
        artifacts: {
          content: doc.content,
          l1: doc.l1,
          l2: doc.l2Summary ? { summary: doc.l2Summary } : undefined,
        },
      };
    },
  };
}

function makeRegistry(childSegments: Record<Hash, number> = {}) {
  return {
    getChildSegments: (hash: Hash) => Array.from({ length: childSegments[hash] ?? 0 }),
  };
}

const h = {
  guide: 'g'.repeat(64),
  api: 'a'.repeat(64),
  plan: 'p'.repeat(64),
  notes: 'n'.repeat(64),
  isolated: 'i'.repeat(64),
};

describe('orphans metric', () => {
  it('does not mark a document orphan when it contains wikilinks', async () => {
    const docs = {
      [h.guide]: { content: 'See [[api]] for details.' },
      [h.api]: { content: 'API reference.' },
    };
    const result = await orphans(
      [
        { contentHash: h.guide, externalId: '/vault/guide.md' },
        { contentHash: h.api, externalId: '/vault/api.md' },
      ],
      makeCas(docs),
      makeRegistry()
    );
    expect(result.value).toEqual([]);
  });

  it('does not mark a document orphan when it contains markdown links', async () => {
    const docs = {
      [h.guide]: { content: 'Read [the guide](plan.md) first.' },
      [h.plan]: { content: 'Plan body.' },
    };
    const result = await orphans(
      [
        { contentHash: h.guide, externalId: '/vault/guide.md' },
        { contentHash: h.plan, externalId: '/vault/plan.md' },
      ],
      makeCas(docs),
      makeRegistry()
    );
    expect(result.value).toEqual([]);
  });

  it('does not mark a document orphan when it contains bare "см. file.md" references', async () => {
    const docs = {
      [h.guide]: { content: 'См. `notes.md` и notes.md для продолжения.' },
      [h.notes]: { content: 'Notes body.' },
    };
    const result = await orphans(
      [
        { contentHash: h.guide, externalId: '/vault/guide.md' },
        { contentHash: h.notes, externalId: '/vault/notes.md' },
      ],
      makeCas(docs),
      makeRegistry()
    );
    expect(result.value).toEqual([]);
  });

  it('does not mark a document orphan when another document links to it (inbound)', async () => {
    const docs = {
      [h.guide]: { content: '[[notes]]' },
      [h.notes]: { content: 'No links here.' },
    };
    const result = await orphans(
      [
        { contentHash: h.guide, externalId: '/vault/guide.md' },
        { contentHash: h.notes, externalId: '/vault/notes.md' },
      ],
      makeCas(docs),
      makeRegistry()
    );
    expect(result.value).toEqual([]);
  });

  it('does not mark a document orphan when another L2 summary mentions its basename', async () => {
    const docs = {
      [h.guide]: { content: 'Guide body.', l2Summary: 'Covers the api reference and usage patterns.' },
      [h.api]: { content: 'API body.' },
    };
    const result = await orphans(
      [
        { contentHash: h.guide, externalId: '/vault/guide.md' },
        { contentHash: h.api, externalId: '/vault/api.md' },
      ],
      makeCas(docs),
      makeRegistry()
    );
    // The summary mention makes `api` reachable; the linker itself stays orphan.
    expect(result.value).toEqual([h.guide]);
  });

  it('marks a document orphan only when it has no links and no inbound references', async () => {
    const docs = {
      [h.guide]: { content: 'See [[api]].' },
      [h.isolated]: { content: 'Completely standalone.' },
    };
    const result = await orphans(
      [
        { contentHash: h.guide, externalId: '/vault/guide.md' },
        { contentHash: h.isolated, externalId: '/vault/isolated.md' },
      ],
      makeCas(docs),
      makeRegistry()
    );
    expect(result.value).toEqual([h.isolated]);
  });

  it('respects semanticLinks and child segments as before', async () => {
    const docs = {
      [h.guide]: { content: 'No text links.', semanticLinks: [{ targetHash: h.api, reason: 'related' }] },
      [h.api]: { content: 'No links.' },
    };
    const viaSemantic = await orphans(
      [
        { contentHash: h.guide, externalId: '/vault/guide.md' },
        { contentHash: h.api, externalId: '/vault/api.md' },
      ],
      makeCas(docs),
      makeRegistry()
    );
    expect(viaSemantic.value).toEqual([]);

    const viaChildSegments = await orphans(
      [{ contentHash: h.isolated, externalId: '/vault/isolated.md' }],
      makeCas({ [h.isolated]: { content: 'No links.' } }),
      makeRegistry({ [h.isolated]: 2 })
    );
    expect(viaChildSegments.value).toEqual([]);
  });
});

describe('extractTextReferences', () => {
  it('parses wikilinks, markdown links, code refs and bare refs', () => {
    const refs = extractTextReferences(
      '# Title\n\nSee [[Getting Started]], [[api#v2|API v2]], [docs](guide.md), `см. notes.md` и plan.md.'
    );
    expect(refs).toContain('getting started');
    expect(refs).toContain('api');
    expect(refs).toContain('guide');
    expect(refs).toContain('notes');
    expect(refs).toContain('plan');
  });

  it('deduplicates and ignores anchors/paths', () => {
    const refs = extractTextReferences('[[folder/guide.md]] and [[guide.md#section]] and [[guide]]');
    expect(refs).toEqual(['guide']);
  });
});
