import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OllamaExtractionModel } from '../src/adapters/ollama/extraction.js';
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

describe('OllamaExtractionModel', () => {
  beforeEach(() => {
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.OLLAMA_EXTRACTION_MODEL = 'qwen2.5:3b';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_EXTRACTION_MODEL;
  });

  it('returns empty result without request for empty content', async () => {
    const fetchMock = mockFetch({ response: validContent });
    vi.stubGlobal('fetch', fetchMock);
    const model = new OllamaExtractionModel();
    const result = await model.extractAsync(evidence(), '   ');
    expect(result).toEqual({ claims: [], relationships: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses and filters valid claims and relationships', async () => {
    vi.stubGlobal('fetch', mockFetch({ response: validContent }));
    const model = new OllamaExtractionModel();
    const result = await model.extractAsync(evidence(), 'content');
    expect(result.claims).toEqual([
      expect.objectContaining({ subjectName: 'Alice', predicate: 'has_role', objectOrValue: 'engineer', confidence: 0.9 }),
    ]);
    expect(result.relationships).toEqual([
      expect.objectContaining({ sourceName: 'Alice', relationType: 'supports', targetName: 'Bob', confidence: 1 }),
    ]);
  });

  it('rejects Ollama error payloads', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'model not found' }));
    const model = new OllamaExtractionModel();
    await expect(model.extractAsync(evidence(), 'content')).rejects.toThrow('model not found');
  });

  it('rejects missing generated text', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    const model = new OllamaExtractionModel();
    await expect(model.extractAsync(evidence(), 'content')).rejects.toThrow('no generated text');
  });

  it('rejects invalid model JSON', async () => {
    vi.stubGlobal('fetch', mockFetch({ response: 'not-json' }));
    const model = new OllamaExtractionModel();
    await expect(model.extractAsync(evidence(), 'content')).rejects.toThrow('model returned invalid JSON');
  });
});
