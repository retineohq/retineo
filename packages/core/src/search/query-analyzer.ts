/**
 * RETINEO Core — Query Analyzer
 * Phase 4: Language detection, intent classification, entity extraction, query enrichment.
 */

import type { LLMProvider } from '../llm/provider.js';
import type { LanguageDetector } from '../i18n/detector.js';
import { createDetector } from '../i18n/detector.js';
import type { LanguagePackRegistry } from '../i18n/registry.js';
import { DefaultLanguagePackRegistry } from '../i18n/registry.js';
import type { SearchConfig } from '../storage/config.js';

export type QueryIntent = 'vague' | 'section' | 'precision';

export interface QuerySignal {
  type: 'keyword' | 'semantic' | 'temporal' | 'section_anchor';
  value: string;
  weight: number;
}

export interface SessionContext {
  lastTopic?: string;
  lastEntities: string[];
  ttlMinutes: number;
}

export interface AnalyzedQuery {
  originalQuery: string;
  language: string;
  confidence: number;
  intent: QueryIntent;
  enrichedQuery: string;
  entities: string[];
  signals: QuerySignal[];
}

export interface QueryAnalyzer {
  analyze(query: string, sessionContext?: SessionContext): Promise<AnalyzedQuery>;
}

// Rule-based intent signals
const VAGUE_PATTERNS = [
  /^tell me about/i,
  /^what is/i,
  /^who is/i,
  /^explain/i,
  /^describe/i,
  /^(?:how|what).+(?:work|function)/i,
];

const PRECISION_PATTERNS = [
  /exact/i,
  /precisely/i,
  /line \d+/i,
  /page \d+/i,
  /timestamp/i,
  /at \d{1,2}:\d{2}/i,
  /word for word/i,
  /verbatim/i,
];

const SECTION_PATTERNS = [
  /section/i,
  /chapter/i,
  /heading/i,
  /in the .+ (?:meeting|call|doc)/i,
  /about .+ in/i,
  /discussed .+ about/i,
];

const PRONOUNS = new Set(['he', 'she', 'it', 'they', 'him', 'her', 'them', 'his', 'its', 'their', 'this', 'that', 'these', 'those']);

function ruleBasedIntent(query: string): QueryIntent | null {
  const q = query.toLowerCase();
  if (PRECISION_PATTERNS.some((re) => re.test(q))) return 'precision';
  if (SECTION_PATTERNS.some((re) => re.test(q))) return 'section';
  if (VAGUE_PATTERNS.some((re) => re.test(q))) return 'vague';
  return null;
}

function extractSignals(query: string): QuerySignal[] {
  const signals: QuerySignal[] = [];
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  for (const w of words) {
    signals.push({ type: 'keyword', value: w.replace(/[^a-z0-9\u0400-\u04FF\u4E00-\u9FFF]/g, ''), weight: 1.0 });
  }
  // Temporal signals
  const temporalRe = /\b(last week|last month|yesterday|today|q\d+ \d{4}|\d{4}-\d{2}-\d{2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = temporalRe.exec(query)) !== null) {
    signals.push({ type: 'temporal', value: m[1], weight: 1.2 });
  }
  return signals;
}

function extractEntities(query: string): string[] {
  // Simple noun-phrase extraction: capitalized words or quoted phrases
  const entities: string[] = [];
  const quoted = query.match(/"([^"]+)"/g);
  if (quoted) entities.push(...quoted.map((s) => s.slice(1, -1)));
  // Match capitalized words/phrases, excluding sentence-start word
  const caps = query.match(/\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]+)*\b/g);
  if (caps) {
    const skipFirst = /^[A-Z][a-zA-Z]*\b/.test(query.trim());
    const startIndex = skipFirst ? 1 : 0;
    for (const c of caps.slice(startIndex)) {
      if (!entities.includes(c)) entities.push(c);
    }
  }
  return [...new Set(entities.map((e) => e.toLowerCase()))];
}

function resolvePronouns(query: string, session: SessionContext | undefined): string {
  if (!session || session.lastEntities.length === 0) return query;
  const words = query.split(/\b/);
  const resolved = words.map((w) => {
    const lower = w.toLowerCase().trim();
    if (PRONOUNS.has(lower)) {
      return session.lastEntities[0];
    }
    return w;
  });
  return resolved.join('');
}

function buildPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

export interface QueryAnalyzerDeps {
  detector?: LanguageDetector;
  registry?: LanguagePackRegistry;
  llmProvider?: LLMProvider;
  searchConfig?: SearchConfig;
}

export class DefaultQueryAnalyzer implements QueryAnalyzer {
  private detector: LanguageDetector;
  private registry: LanguagePackRegistry;
  private llmProvider?: LLMProvider;
  private config: SearchConfig;

  constructor(deps: QueryAnalyzerDeps = {}) {
    this.config = deps.searchConfig ?? {
      defaultLanguage: 'en',
      languageDetection: { provider: 'franc', fallback: 'heuristic', confidenceThreshold: 0.7 },
      semantic: { topK: 100, threshold: 0.5, hybridWeight: 0.7 },
      rerank: { topK: 10, weights: { concept: 1, claim: 0.5, summary: 0.8, language: 0.3 } },
      cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
      citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
      prompts: {},
      crossLingual: { enabled: true },
    };
    this.detector = deps.detector ?? createDetector(this.config.languageDetection.provider, this.config.languageDetection.confidenceThreshold);
    this.registry = deps.registry ?? new DefaultLanguagePackRegistry();
    this.llmProvider = deps.llmProvider;
  }

  async analyze(query: string, sessionContext?: SessionContext): Promise<AnalyzedQuery> {
    // 1. Language detection
    const detected = await this.detector.detect(query);
    let language = detected.code;
    let confidence = detected.confidence;
    if (confidence < this.config.languageDetection.confidenceThreshold) {
      language = this.config.defaultLanguage;
      confidence = 0.5;
    }

    // 2. Intent classification (rule-based fast path)
    let intent: QueryIntent = ruleBasedIntent(query) ?? 'vague';

    // 3. LLM fallback for ambiguous queries
    if (!ruleBasedIntent(query) && this.llmProvider) {
      const promptTemplate =
        this.config.prompts.intentClassification ??
        this.registry.resolvePrompt(language, 'intentClassification') ??
        this.registry.resolvePrompt('en', 'intentClassification')!;
      try {
        const prompt = buildPrompt(promptTemplate, { query, language });
        const raw = await this.llmProvider.generate(prompt, { jsonMode: true, temperature: 0.1, maxTokens: 256 });
        const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ''));
        if (parsed.intent === 'vague' || parsed.intent === 'section' || parsed.intent === 'precision') {
          intent = parsed.intent;
        }
      } catch {
        // keep rule-based intent
      }
    }

    // 4. Entity extraction
    let entities = extractEntities(query);
    if (this.llmProvider) {
      const promptTemplate =
        this.config.prompts.entityExtraction ??
        this.registry.resolvePrompt(language, 'entityExtraction') ??
        this.registry.resolvePrompt('en', 'entityExtraction')!;
      try {
        const prompt = buildPrompt(promptTemplate, { query, language });
        const raw = await this.llmProvider.generate(prompt, { jsonMode: true, temperature: 0.1, maxTokens: 256 });
        const parsed = JSON.parse(raw.trim().replace(/^```json\s*|\s*```$/g, ''));
        if (Array.isArray(parsed.entities)) {
          entities = [...new Set([...entities, ...parsed.entities.map((e: string) => e.toLowerCase())])];
        }
      } catch {
        // keep heuristic entities
      }
    }

    // 5. Query enrichment (pronoun resolution + entity injection)
    let enrichedQuery = resolvePronouns(query, sessionContext);
    if (entities.length > 0) {
      enrichedQuery += ` [entities: ${entities.join(', ')}]`;
    }

    // 6. Signals
    const signals = extractSignals(enrichedQuery);

    return {
      originalQuery: query,
      language,
      confidence,
      intent,
      enrichedQuery,
      entities,
      signals,
    };
  }
}
