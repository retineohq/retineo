/**
 * ECHO Core — Retrieval Service
 * Phase 4: L3 semantic search → L2 rerank → L1/L0 cascade.
 */

import { readFile, existsSync } from 'fs';
import { promisify } from 'util';
import path from 'path';
import type { EmbeddingProvider } from '../llm/provider.js';
import type { CASStorage } from '../storage/cas.js';
import type { Hash, L2Artifact, SourceRef } from '../domain/types.js';
import type { SearchConfig } from '../storage/config.js';
import type { AnalyzedQuery, QueryIntent } from './query-analyzer.js';

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

/** Load all embeddings from jsonl. MVP simplification — replace with HNSW in future phase. */
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
  // Normalize
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
}

export class DefaultRetrievalService implements RetrievalService {
  private embedder: EmbeddingProvider;
  private cas: CASStorage;
  private indexDir: string;
  private config: SearchConfig;

  constructor(deps: RetrievalServiceDeps) {
    this.embedder = deps.embeddingProvider;
    this.cas = deps.casStorage;
    this.indexDir = deps.indexDir;
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
    const trace: RetrievalTrace = { steps: [], durationMs: 0 };

    const topK = options.topK ?? this.config.semantic.topK;
    const rerankTopK = options.rerankTopK ?? this.config.rerank.topK;
    const finalTopK = options.finalTopK ?? 5;
    const threshold = options.threshold ?? this.config.semantic.threshold;
    const mode = options.mode ?? 'semantic';
    const queryLang = options.language ?? query.language;

    // L3 Semantic Search
    trace.steps.push('L3: load embeddings');
    const embeddings = await loadEmbeddings(this.indexDir);
    const [queryVector] = await this.embedder.embed([query.enrichedQuery]);

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
        l3Scores.sort((a, b) => b.score - b.score);
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

    return {
      query: query.originalQuery,
      candidates: reranked,
      selected,
      citations,
      trace,
    };
  }

  private async loadL2(hash: Hash): Promise<L2Artifact | null> {
    try {
      const objPath = this.cas.getObjectPath(hash);
      const l2Path = path.join(objPath, 'L2.json');
      if (!existsSync(l2Path)) return null;
      const raw = await readFileAsync(l2Path, 'utf-8');
      return JSON.parse(raw) as L2Artifact;
    } catch {
      return null;
    }
  }

  private scoreL2(l2: L2Artifact, query: AnalyzedQuery, queryLang: string): number {
    const w = this.config.rerank.weights;
    let score = 0;

    // Concept overlap
    const qTerms = new Set(query.entities.concat(query.signals.map((s) => s.value)));
    const concepts = new Set(l2.concepts.map((c) => c.toLowerCase()));
    let conceptHits = 0;
    for (const t of qTerms) {
      for (const c of concepts) {
        if (c.includes(t) || t.includes(c)) conceptHits++;
      }
    }
    score += conceptHits * w.concept;

    // Claim match
    const qStr = query.enrichedQuery.toLowerCase();
    let claimHits = 0;
    for (const claim of l2.claims) {
      if (claim.toLowerCase().includes(qStr) || qStr.includes(claim.toLowerCase())) claimHits++;
    }
    score += claimHits * w.claim;

    // Summary semantic similarity (approximate via keyword overlap)
    const summaryWords = new Set(l2.summary.toLowerCase().split(/\s+/));
    let summaryHits = 0;
    for (const t of qTerms) {
      for (const sw of summaryWords) {
        if (sw.includes(t) || t.includes(sw)) summaryHits++;
      }
    }
    score += summaryHits * w.summary;

    // Language match
    // We don't store per-L2 language yet; skip if not available
    // Future: read L2 metadata for language tag
    // For now, apply neutral
    score += w.language * 0.5; // neutral baseline

    return score;
  }

  private async cascade(candidate: CandidateNode, intent: QueryIntent): Promise<CandidateNode> {
    const hash = candidate.nodeId;
    const objPath = this.cas.getObjectPath(hash);

    // Load L1 if needed
    if (intent === 'section' || intent === 'precision') {
      try {
        const l1Path = path.join(objPath, 'L1.md');
        if (existsSync(l1Path)) {
          const l1Raw = await readFileAsync(l1Path, 'utf-8');
          // Take first ~800 chars as preview
          candidate.l1Preview = l1Raw.slice(0, 800);
        }
      } catch {
        // ignore
      }
    }

    // Load L0 if precision
    if (intent === 'precision') {
      try {
        const l0Path = path.join(objPath, 'content.md');
        if (existsSync(l0Path)) {
          const l0Raw = await readFileAsync(l0Path, 'utf-8');
          // Find best matching chunk by keyword overlap
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
          // Approximate line range
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
