import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterExtractionModel } from '../src/adapters/openrouter/extraction.js';
import type { Evidence } from '../src/domain/entities.js';

const evidence = (): Evidence => ({
  id: 'ev-1',
  sourceVersionId: 'sv-1',
  segmentRef: null,
  contentHash: 'hash-1',
  state: 'available',
  createdAt: '2026-01-01T00:00:00.000Z',
});

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof response === 'string' ? response : JSON.stringify(response)),
  });
}

const apiResponse = (content: string) => ({
  choices: [{ message: { content } }],
});

const validContent = JSON.stringify({
  claims: [
    { subjectName: 'Alice', predicate: 'has_role', objectOrValue: 'engineer', confidence: 0.9, basis: 'stated' },
    { subjectName: '', predicate: 'has_role', objectOrValue: 'invalid', confidence: 1 },
    { subjectName: 'Bob', predicate: 'unsupported', objectOrValue: 'invalid', confidence: 1 },
  ],
  relationships: [
    { sourceName: 'Alice', relationType: 'supports', targetName: 'Bob', confidence: 1.5, basis: null },
    { sourceName: 'Alice', relationType: 'invalid', targetName: 'Bob', confidence: 1 },
  ],
});

describe('OpenRouterExtractionModel', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it('rejects missing API key', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const model = new OpenRouterExtractionModel({ apiKey: undefined });
    await expect(model.extractAsync(evidence(), 'hello')).rejects.toThrow('OPENROUTER_API_KEY');
  });

  it('returns empty result without request for empty content', async () => {
    const fetchMock = mockFetch(apiResponse(validContent));
    vi.stubGlobal('fetch', fetchMock);
    const model = new OpenRouterExtractionModel();
    const result = await model.extractAsync(evidence(), '   ');
    expect(result).toEqual({ claims: [], relationships: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses and filters valid claims and relationships', async () => {
    vi.stubGlobal('fetch', mockFetch(apiResponse(validContent)));
    const model = new OpenRouterExtractionModel();
    const result = await model.extractAsync(evidence(), 'content');
    expect(result.claims).toEqual([
      expect.objectContaining({ subjectName: 'Alice', predicate: 'has_role', objectOrValue: 'engineer', confidence: 0.9 }),
    ]);
    expect(result.relationships).toEqual([
      expect.objectContaining({ sourceName: 'Alice', relationType: 'supports', targetName: 'Bob', confidence: 1 }),
    ]);
  });

  it('rejects API error payloads', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: { message: 'quota exceeded' } }));
    const model = new OpenRouterExtractionModel();
    await expect(model.extractAsync(evidence(), 'content')).rejects.toThrow('quota exceeded');
  });

  it('rejects missing message content', async () => {
    vi.stubGlobal('fetch', mockFetch({ choices: [] }));
    const model = new OpenRouterExtractionModel();
    await expect(model.extractAsync(evidence(), 'content')).rejects.toThrow('no message content');
  });

  it('rejects invalid model JSON', async () => {
    vi.stubGlobal('fetch', mockFetch(apiResponse('not-json')));
    const model = new OpenRouterExtractionModel();
    await expect(model.extractAsync(evidence(), 'content')).rejects.toThrow('model returned invalid JSON');
  });
});
