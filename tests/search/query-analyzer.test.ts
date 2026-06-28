/**
 * Query Analyzer Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DefaultQueryAnalyzer,
} from '../../packages/core/src/search/query-analyzer.js';
import {
  HeuristicDetector,
  FrancDetector,
} from '../../packages/core/src/i18n/detector.js';
import { DefaultLanguagePackRegistry } from '../../packages/core/src/i18n/registry.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import type { SearchConfig } from '../../packages/core/src/storage/config.js';
import type { QueryTranslator, TranslatedTerms } from '../../packages/core/src/search/query-translator.js';

const mockConfig: SearchConfig = {
  defaultLanguage: 'en',
  languageDetection: { provider: 'heuristic', fallback: 'heuristic', confidenceThreshold: 0.7 },
  semantic: { topK: 100, threshold: 0.75, hybridWeight: 0.7 },
  rerank: { topK: 10, weights: { concept: 1, claim: 0.5, summary: 0.8, language: 0.3 } },
  cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
  citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
  prompts: {},
  crossLingual: { enabled: true },
};

describe('DefaultQueryAnalyzer — heuristic detection', () => {
  const analyzer = new DefaultQueryAnalyzer({
    detector: new HeuristicDetector(),
    searchConfig: mockConfig,
  });

  it('detects English (latin) as default', async () => {
    const result = await analyzer.analyze('What is machine learning?');
    expect(result.language).toBe('en');
    expect(result.confidence).toBe(0.5);
  });

  it('detects Russian via heuristic', async () => {
    const result = await analyzer.analyze('Что такое машинное обучение?');
    // Cyrillic script is unambiguous, so the detected language is preserved.
    expect(result.language).toBe('ru');
    expect(result.confidence).toBe(0.6);
  });

  it('detects Chinese via heuristic', async () => {
    const result = await analyzer.analyze('什么是机器学习？');
    // CJK script is unambiguous, so the detected language is preserved.
    expect(result.language).toBe('zh');
    expect(result.confidence).toBe(0.6);
  });

  it('falls back to defaultLanguage for short Latin query below threshold', async () => {
    const result = await analyzer.analyze('hello');
    expect(result.language).toBe('en');
    expect(result.confidence).toBe(0.5);
  });

  it('classifies vague intent', async () => {
    const result = await analyzer.analyze('Tell me about neural networks');
    expect(result.intent).toBe('vague');
  });

  it('classifies precision intent', async () => {
    const result = await analyzer.analyze('What was the exact objection on line 45?');
    expect(result.intent).toBe('precision');
  });

  it('classifies section intent', async () => {
    const result = await analyzer.analyze('What did we discuss about pricing in the meeting?');
    expect(result.intent).toBe('section');
  });

  it('extracts entities from capitalized words', async () => {
    const result = await analyzer.analyze('Tell me about OpenAI and Google DeepMind');
    expect(result.entities).toContain('openai');
    expect(result.entities).toContain('google deepmind');
  });

  it('resolves pronouns from session context', async () => {
    const result = await analyzer.analyze('What did he say?', {
      lastEntities: ['Elon Musk'],
      ttlMinutes: 30,
    });
    expect(result.enrichedQuery.toLowerCase()).toContain('elon musk');
  });

  it('injects entities into enriched query', async () => {
    const result = await analyzer.analyze('pricing objections from Apple');
    expect(result.enrichedQuery).toContain('[entities:');
    expect(result.entities).toContain('apple');
  });

  it('produces keyword signals', async () => {
    const result = await analyzer.analyze('machine learning last week');
    const temporal = result.signals.find((s) => s.type === 'temporal');
    expect(temporal).toBeDefined();
    expect(temporal!.value).toBe('last week');
  });

  it('injects English translations for non-English queries', async () => {
    const fakeTranslator: QueryTranslator = {
      async translate(terms: string[]): Promise<TranslatedTerms> {
        const map: Record<string, string> = {
          'машинное обучение': 'machine learning',
        };
        return {
          original: terms,
          english: terms.map((t) => map[t] ?? t),
        };
      },
    };
    const analyzerWithTranslator = new DefaultQueryAnalyzer({
      detector: new HeuristicDetector(),
      searchConfig: mockConfig,
      translator: fakeTranslator,
    });
    const result = await analyzerWithTranslator.analyze('Что такое "машинное обучение"?');
    expect(result.language).toBe('ru');
    expect(result.enrichedQuery).toContain('[en: machine learning]');
  });

  it('falls back to query words as entities for non-English keyword queries', async () => {
    const fakeTranslator: QueryTranslator = {
      async translate(terms: string[]): Promise<TranslatedTerms> {
        const map: Record<string, string> = {
          нейронные: 'neural',
          сети: 'networks',
        };
        return {
          original: terms,
          english: terms.map((t) => map[t] ?? t),
        };
      },
    };
    const analyzerWithTranslator = new DefaultQueryAnalyzer({
      detector: new HeuristicDetector(),
      searchConfig: mockConfig,
      translator: fakeTranslator,
    });
    const result = await analyzerWithTranslator.analyze('нейронные сети');
    expect(result.language).toBe('ru');
    expect(result.entities).toContain('нейронные');
    expect(result.entities).toContain('сети');
    expect(result.enrichedQuery).toContain('[en:');
    expect(result.enrichedQuery).toContain('neural');
    expect(result.enrichedQuery).toContain('networks');
  });
});

describe('DefaultQueryAnalyzer — with LLM fallback', () => {
  const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
  const analyzer = new DefaultQueryAnalyzer({
    detector: new HeuristicDetector(),
    llmProvider: provider,
    searchConfig: mockConfig,
  });

  it('uses LLM for ambiguous intent when no rule matches', async () => {
    const result = await analyzer.analyze('pricing objections');
    expect(['vague', 'section', 'precision']).toContain(result.intent);
  });
});

describe('DefaultQueryAnalyzer — franc detector', () => {
  it('falls back to heuristic when franc unavailable', async () => {
    const detector = new FrancDetector(new HeuristicDetector(), 0.7);
    const analyzer = new DefaultQueryAnalyzer({
      detector,
      searchConfig: mockConfig,
    });
    const result = await analyzer.analyze('Bonjour le monde');
    expect(result.language).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });
});
