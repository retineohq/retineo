/**
 * ECHO Core — Retrieval Service
 * Phase 7: L3 semantic search → L2 rerank → L1/L0 cascade with LRU cache.
 */

import { readFile, existsSync } from 'fs';
import { promisify } from 'util';
import path from 'path';
import type { EmbeddingProvider } from '../llm/provider.js';
import type { CASStorage } from '../storage/cas.js';
import type { Hash, L2Artifact, SourceRef } from '../domain/types.js';
import type { SearchConfig } from '../storage/config.js';
import type { AnalyzedQuery, QueryIntent } from './query-analyzer.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';
import type { LRUCache } from '../utils/cache.js';
import { SimpleLRUCache } from '../utils/cache.js';

const readFileAsync = promisify(readFile);

export interface SearchOptions {
  topK?: number;
  rerankTopK?: number;
  finalTopK?: number;
  threshold?: number;
  mode?: 'semantic' | 'keyword' | 'hybrid';
  language?: string;
  maxTokens?: number;
  includeGhosts?: boolean;
}

export interface CandidateNode {
  nodeId: Hash;
  score: number;
  l2Summary?: string;
  l1Preview?: string;
  l0Preview?: string;
  sourceRef?: SourceRef;
  l2Artifact?: L2Artifact;
  lineRange?: { start: number; end: number };
}

export interface RetrievalTrace {
  steps: string[];
  durationMs: number;
}

export interface RetrievalResult {
  query: string;
  candidates: CandidateNode[];
  selected: CandidateNode[];
  citations: Citation[];
  trace: RetrievalTrace;
}

export interface Citation {
  nodeId: Hash;
  level: 'L2' | 'L1' | 'L0';
  content: string;
  span?: { start: number; end: number };
  sourceRef?: SourceRef;
}

export interface RetrievalService {
  search(query: AnalyzedQuery, options?: SearchOptions): Promise<RetrievalResult>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/** Load all embeddings from jsonl. */
async function loadEmbeddings(indexDir: string): Promise<Array<{ hash: string; vector: number[] }>> {
  const embeddingsPath = path.join(indexDir, 'embeddings.jsonl');
  if (!existsSync(embeddingsPath)) return [];
  const raw = await readFileAsync(embeddingsPath, 'utf-8');
  const lines = raw.trim().split('\n');
  const out: Array<{ hash: string; vector: number[] }> = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as { hash: string; vector: number[] };
      out.push(rec);
    } catch {
      // skip malformed
    }
  }
  return out;
}

/** Load BM25 inverted index. */
async function loadBM25(indexDir: string): Promise<Record<string, string[]>> {
  const bm25Path = path.join(indexDir, 'bm25.json');
  if (!existsSync(bm25Path)) return {};
  try {
    const raw = await readFileAsync(bm25Path, 'utf-8');
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}

/** Simple TF keyword scoring. */
function keywordScore(query: string, bm25: Record<string, string[]>): Map<string, number> {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF\u4E00-\u9FFF\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const scores = new Map<string, number>();
  for (const term of terms) {
    const hashes = bm25[term] ?? [];
    for (const h of hashes) {
      scores.set(h, (scores.get(h) ?? 0) + 1);
    }
  }
  let max = 0;
  for (const v of scores.values()) max = Math.max(max, v);
  if (max > 0) {
    for (const [k, v] of scores) scores.set(k, v / max);
  }
  return scores;
}

export interface RetrievalServiceDeps {
  embeddingProvider: EmbeddingProvider;
  casStorage: CASStorage;
  indexDir: string;
  config?: SearchConfig;
  logger?: Logger;
  embeddingCache?: LRUCache<string, number[]>;
  l2Cache?: LRUCache<string, L2Artifact>;
  searchCache?: LRUCache<string, RetrievalResult>;
}

export class DefaultRetrievalService implements RetrievalService {
  private embedder: EmbeddingProvider;
  private cas: CASStorage;
  private indexDir: string;
  private config: SearchConfig;
  private logger: Logger;
  private embeddingCache: LRUCache<string, number[]>;
  private l2Cache: LRUCache<string, L2Artifact>;
  private searchCache: LRUCache<string, RetrievalResult>;

  constructor(deps: RetrievalServiceDeps) {
    this.embedder = deps.embeddingProvider;
    this.cas = deps.casStorage;
    this.indexDir = deps.indexDir;
    this.logger = deps.logger ?? getGlobalLogger().child({ layer: 'search' });
    this.embeddingCache = deps.embeddingCache ?? new SimpleLRUCache(1000);
    this.l2Cache = deps.l2Cache ?? new SimpleLRUCache(500);
    this.searchCache = deps.searchCache ?? new SimpleLRUCache(100, 300000);
    this.config = deps.config ?? {
      defaultLanguage: 'en',
      languageDetection: { provider: 'franc', fallback: 'heuristic', confidenceThreshold: 0.7 },
      semantic: { topK: 100, threshold: 0.75, hybridWeight: 0.7 },
      rerank: { topK: 10, weights: { concept: 1, claim: 0.5, summary: 0.8, language: 0.3 } },
      cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
      citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
      prompts: {},
      crossLingual: { enabled: true },
    };
  }

  async search(query: AnalyzedQuery, options: SearchOptions = {}): Promise<RetrievalResult> {
    const start = Date.now();
    const cacheKey = `${query.enrichedQuery}|${options.mode ?? 'semantic'}|${options.topK ?? ''}|${options.threshold ?? ''}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      this.logger.info('search.cache.hit', { query: query.originalQuery });
      return cached;
    }

    const trace: RetrievalTrace = { steps: [], durationMs: 0 };
    this.logger.info('search.query', { query: query.originalQuery, mode: options.mode ?? 'semantic' });

    const topK = options.topK ?? this.config.semantic.topK;
    const rerankTopK = options.rerankTopK ?? this.config.rerank.topK;
    const finalTopK = options.finalTopK ?? 5;
    const threshold = options.threshold ?? this.config.semantic.threshold;
    const mode = options.mode ?? 'semantic';
    const queryLang = options.language ?? query.language;

    // L3 Semantic Search
    trace.steps.push('L3: load embeddings');
    const embeddings = await loadEmbeddings(this.indexDir);
    const queryVector = await this.getQueryVector(query.enrichedQuery);

    let l3Scores: Array<{ hash: string; score: number }> = [];

    if (mode === 'semantic' || mode === 'hybrid') {
      for (const rec of embeddings) {
        const score = cosineSimilarity(queryVector, rec.vector);
        if (score >= threshold) {
          l3Scores.push({ hash: rec.hash, score });
        }
      }
      l3Scores.sort((a, b) => b.score - a.score);
      l3Scores = l3Scores.slice(0, topK);
    }

    // Keyword search (BM25)
    let kwScores = new Map<string, number>();
    if (mode === 'keyword' || mode === 'hybrid') {
      trace.steps.push('L3: keyword search');
      const bm25 = await loadBM25(this.indexDir);
      kwScores = keywordScore(query.enrichedQuery, bm25);
      if (mode === 'keyword') {
        for (const [hash, score] of kwScores) {
          if (score >= threshold) l3Scores.push({ hash, score });
        }
        l3Scores.sort((a, b) => b.score - a.score);
        l3Scores = l3Scores.slice(0, topK);
      }
    }

    // Hybrid merge
    if (mode === 'hybrid') {
      trace.steps.push('L3: hybrid merge');
      const hybridMap = new Map<string, number>();
      const hybridWeight = this.config.semantic.hybridWeight;
      for (const s of l3Scores) {
        hybridMap.set(s.hash, (hybridMap.get(s.hash) ?? 0) + s.score * hybridWeight);
      }
      for (const [hash, score] of kwScores) {
        hybridMap.set(hash, (hybridMap.get(hash) ?? 0) + score * (1 - hybridWeight));
      }
      l3Scores = Array.from(hybridMap.entries())
        .map(([hash, score]) => ({ hash, score }))
        .filter((s) => s.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }

    trace.steps.push(`L3: ${l3Scores.length} candidates`);

    // L2 Rerank
    trace.steps.push('L2: rerank start');
    const candidates: CandidateNode[] = [];
    for (const s of l3Scores) {
      const l2 = await this.loadL2(s.hash);
      if (!l2) continue;
      const rerankScore = this.scoreL2(l2, query, queryLang);
      candidates.push({
        nodeId: s.hash,
        score: rerankScore,
        l2Summary: l2.summary,
        l2Artifact: l2,
      });
    }
    candidates.sort((a, b) => b.score - a.score);
    const reranked = candidates.slice(0, rerankTopK);
    trace.steps.push(`L2: ${reranked.length} reranked`);

    // L1/L0 Cascade
    trace.steps.push('L1/L0: cascade start');
    const selected: CandidateNode[] = [];
    for (const c of reranked.slice(0, finalTopK)) {
      const enriched = await this.cascade(c, query.intent);
      selected.push(enriched);
    }
    trace.steps.push(`L1/L0: ${selected.length} selected`);

    // Citations
    const citations: Citation[] = [];
    for (const c of selected) {
      citations.push({
        nodeId: c.nodeId,
        level: query.intent === 'precision' ? 'L0' : query.intent === 'section' ? 'L1' : 'L2',
        content: c.l2Summary ?? c.l1Preview ?? c.l0Preview ?? '',
        span: c.lineRange,
        sourceRef: c.sourceRef,
      });
    }

    trace.durationMs = Date.now() - start;
    this.logger.info('search.duration', { query: query.originalQuery, durationMs: trace.durationMs, candidates: reranked.length, selected: selected.length });

    const result: RetrievalResult = {
      query: query.originalQuery,
      candidates: reranked,
      selected,
      citations,
      trace,
    };

    this.searchCache.set(cacheKey, result);
    return result;
  }

  private async getQueryVector(query: string): Promise<number[]> {
    const cached = this.embeddingCache.get(query);
    if (cached) return cached;
    const [vector] = await this.embedder.embed([query]);
    this.embeddingCache.set(query, vector);
    return vector;
  }

  private async loadL2(hash: Hash): Promise<L2Artifact | null> {
    const cached = this.l2Cache.get(hash);
    if (cached) return cached;
    try {
      const objPath = this.cas.getObjectPath(hash);
      const l2Path = path.join(objPath, 'L2.json');
      if (!existsSync(l2Path)) return null;
      const raw = await readFileAsync(l2Path, 'utf-8');
      const l2 = JSON.parse(raw) as L2Artifact;
      this.l2Cache.set(hash, l2);
      return l2;
    } catch {
      return null;
    }
  }

  private scoreL2(l2: L2Artifact, query: AnalyzedQuery, queryLang: string): number {
    const w = this.config.rerank.weights;
    let score = 0;

    const qTerms = new Set(query.entities.concat(query.signals.map((s) => s.value)));
    const concepts = new Set(l2.concepts.map((c) => c.toLowerCase()));
    let conceptHits = 0;
    for (const t of qTerms) {
      for (const c of concepts) {
        if (c.includes(t) || t.includes(c)) conceptHits++;
      }
    }
    score += conceptHits * w.concept;

    const qStr = query.enrichedQuery.toLowerCase();
    let claimHits = 0;
    for (const claim of l2.claims) {
      if (claim.toLowerCase().includes(qStr) || qStr.includes(claim.toLowerCase())) claimHits++;
    }
    score += claimHits * w.claim;

    const summaryWords = new Set(l2.summary.toLowerCase().split(/\s+/));
    let summaryHits = 0;
    for (const t of qTerms) {
      for (const sw of summaryWords) {
        if (sw.includes(t) || t.includes(sw)) summaryHits++;
      }
    }
    score += summaryHits * w.summary;

    score += w.language * 0.5;

    return score;
  }

  private async cascade(candidate: CandidateNode, intent: QueryIntent): Promise<CandidateNode> {
    const hash = candidate.nodeId;
    const objPath = this.cas.getObjectPath(hash);

    if (intent === 'section' || intent === 'precision') {
      try {
        const l1Path = path.join(objPath, 'L1.md');
        if (existsSync(l1Path)) {
          const l1Raw = await readFileAsync(l1Path, 'utf-8');
          candidate.l1Preview = l1Raw.slice(0, 800);
        }
      } catch {
        // ignore
      }
    }

    if (intent === 'precision') {
      try {
        const l0Path = path.join(objPath, 'content.md');
        if (existsSync(l0Path)) {
          const l0Raw = await readFileAsync(l0Path, 'utf-8');
          const chunks = l0Raw.split('\n\n');
          let bestChunk = chunks[0] ?? l0Raw.slice(0, 512);
          let bestScore = -1;
          for (const chunk of chunks) {
            const score = this.chunkScore(chunk, candidate.l2Artifact);
            if (score > bestScore) {
              bestScore = score;
              bestChunk = chunk;
            }
          }
          candidate.l0Preview = bestChunk.slice(0, 512);
          const linesBefore = l0Raw.slice(0, l0Raw.indexOf(bestChunk)).split('\n').length - 1;
          const lineCount = bestChunk.split('\n').length;
          candidate.lineRange = { start: linesBefore, end: linesBefore + lineCount };
        }
      } catch {
        // ignore
      }
    }

    return candidate;
  }

  private chunkScore(chunk: string, l2?: L2Artifact): number {
    if (!l2) return 0;
    const text = chunk.toLowerCase();
    let score = 0;
    for (const c of l2.concepts) if (text.includes(c.toLowerCase())) score += 1;
    for (const e of l2.entities) if (text.includes(e.toLowerCase())) score += 1;
    for (const claim of l2.claims) if (text.includes(claim.toLowerCase())) score += 2;
    return score;
  }
}
