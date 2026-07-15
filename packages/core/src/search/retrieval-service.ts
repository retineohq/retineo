/**
 * RETINEO Core — Retrieval Service
 * Phase 7: L3 semantic search → L2 rerank → L1/L0 cascade with LRU cache.
 */

import { readFile, readFileSync, existsSync } from 'fs';
import { promisify } from 'util';
import path from 'path';
import type { EmbeddingProvider } from '../llm/provider.js';
import type { CASStorage } from '../storage/cas.js';
import type { Registry } from '../storage/registry.js';
import type { Hash, L2Artifact, SourceRef } from '../domain/types.js';
import type { Section, Chunk, L1Index } from '../layers/l1-generator.js';
import type { SearchConfig } from '../storage/config.js';
import type { AnalyzedQuery, QueryIntent } from './query-analyzer.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';
import type { LRUCache } from '../utils/cache.js';
import { SimpleLRUCache } from '../utils/cache.js';
import { OkapiBM25, tokenize } from './bm25.js';
import { HeuristicDetector } from '../i18n/detector.js';
import { loadOrBuildHNSW, type HNSWIndex } from '../embeddings/hnsw-index.js';
import type { L3Chunk } from '../layers/l3-generator.js';

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
  nodeId: Hash;            // chunkHash (kept for compatibility)
  contentHash: Hash;       // root content hash (CAS key)
  chunkHash: Hash;         // chunk-level hash
  score: number;           // rerank score
  similarity?: number;     // original L3/BM25 score
  l2Summary?: string;
  l1Preview?: string;
  l0Preview?: string;
  sourceRef?: SourceRef;
  sourcePath?: string;     // resolved post-search from Registry
  isGhost?: boolean;
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
  nodeId: Hash;            // chunkHash
  contentHash: Hash;       // root content hash
  chunkHash: Hash;         // chunk-level hash
  level: 'L2' | 'L1' | 'L0';
  content: string;
  score?: number;
  span?: { start: number; end: number };
  sourceRef?: SourceRef;
  sourcePath?: string;     // resolved from Registry
  isGhost?: boolean;
}

// --- Document Hit + L1 Navigation (Section 5) ---

export interface ChunkHit {
  chunkId: string;
  score: number;
  sectionId: string;
  lineRange: [number, number];
}

export interface NavigationNode {
  sectionId: string;
  heading: string;
  level: number;
  chunkHits: ChunkHit[];
  children: NavigationNode[];
}

export interface DocumentHit {
  sourceHash: Hash;
  sourcePath: string;
  documentScore: number;
  maxChunkScore: number;
  coverageBonus: number;
  densityBonus: number;
  chunks: ChunkHit[];
  navigationTree: NavigationNode[] | null;
}

export interface DocumentScore {
  documentScore: number;
  maxChunkScore: number;
  coverageBonus: number;
  densityBonus: number;
}

/** Aggregate chunk scores into a document-level score. */
export function calculateDocumentScore(chunks: ChunkHit[]): DocumentScore {
  if (chunks.length === 0) {
    return { documentScore: 0, maxChunkScore: 0, coverageBonus: 0, densityBonus: 0 };
  }
  const maxScore = Math.max(...chunks.map((c) => c.score));
  const uniqueSections = new Set(chunks.map((c) => c.sectionId)).size;
  const totalChunks = chunks.length;

  const coverageBonus = uniqueSections > 1 ? uniqueSections * 0.05 : 0;
  const densityBonus = uniqueSections === 1 && totalChunks > 1 ? 0.1 : 0;

  return {
    documentScore: maxScore + coverageBonus + densityBonus,
    maxChunkScore: maxScore,
    coverageBonus,
    densityBonus,
  };
}

/** Find which L1 section a chunk belongs to by line range. */
function findSectionForChunk(chunkLineStart: number, sections: Section[]): Section | null {
  for (const section of sections) {
    if (chunkLineStart >= section.lineStart && chunkLineStart < section.lineEnd) {
      // Check children first (more specific match)
      const childMatch = findSectionForChunk(chunkLineStart, section.children);
      if (childMatch) return childMatch;
      return section;
    }
  }
  return null;
}

/** Build a navigation tree from chunk hits and L1 index. */
export function buildNavigationTree(
  chunks: ChunkHit[],
  l1Index: L1Index
): NavigationNode[] | null {
  if (!l1Index?.sections || l1Index.sections.length === 0) return null;

  function buildNodes(sections: Section[]): NavigationNode[] {
    return sections.map((section) => {
      const sectionId = `${section.lineStart}-${section.lineEnd}`;
      const sectionChunks = chunks.filter((c) => c.sectionId === sectionId);
      return {
        sectionId,
        heading: section.title,
        level: section.level,
        chunkHits: sectionChunks,
        children: buildNodes(section.children),
      };
    });
  }

  return buildNodes(l1Index.sections);
}

/** Group chunk hits by source document. */
export function aggregateDocumentHits(
  chunkHits: Array<ChunkHit & { sourceHash: Hash; sourcePath?: string }>,
  l1Indices: Map<Hash, L1Index>
): DocumentHit[] {
  const byDoc = new Map<Hash, Array<ChunkHit & { sourceHash: Hash; sourcePath?: string }>>();
  for (const ch of chunkHits) {
    const existing = byDoc.get(ch.sourceHash) ?? [];
    existing.push(ch);
    byDoc.set(ch.sourceHash, existing);
  }

  const hits: DocumentHit[] = [];
  for (const [hash, chunks] of byDoc) {
    const docChunkHits: ChunkHit[] = chunks.map((c) => ({
      chunkId: c.chunkId,
      score: c.score,
      sectionId: c.sectionId,
      lineRange: c.lineRange,
    }));
    const score = calculateDocumentScore(docChunkHits);
    const l1 = l1Indices.get(hash) ?? null;
    hits.push({
      sourceHash: hash,
      sourcePath: chunks[0].sourcePath ?? hash,
      documentScore: score.documentScore,
      maxChunkScore: score.maxChunkScore,
      coverageBonus: score.coverageBonus,
      densityBonus: score.densityBonus,
      chunks: docChunkHits,
      navigationTree: l1 ? buildNavigationTree(docChunkHits, l1) : null,
    });
  }

  hits.sort((a, b) => b.documentScore - a.documentScore);
  return hits;
}

// --- End Document Hit + L1 Navigation ---

export interface RetrievalService {
  search(query: AnalyzedQuery, options?: SearchOptions): Promise<RetrievalResult>;
  addVectors(chunks: L3Chunk[]): Promise<void>;
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

interface EmbeddingRecord {
  hash: string;
  vector: number[];
  parentId?: string;
  rootHash?: string;
  chunkId?: string;
  lineStart?: number;
  lineEnd?: number;
  charStart?: number;
  charEnd?: number;
}

/** Load embedding metadata (hash → sourcePath/rootHash) from jsonl. */
function loadEmbeddingRecords(indexDir: string): EmbeddingRecord[] {
  const embeddingsPath = path.join(indexDir, 'embeddings.jsonl');
  if (!existsSync(embeddingsPath)) return [];
  try {
    const raw = readFileSync(embeddingsPath, 'utf-8');
    const lines = raw.trim().split('\n');
    const out: EmbeddingRecord[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as EmbeddingRecord;
        out.push(rec);
      } catch {
        // skip malformed
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Load BM25 data and build OkapiBM25 index. */
async function loadOkapiBM25(indexDir: string): Promise<OkapiBM25> {
  const bm25Path = path.join(indexDir, 'bm25.json');
  const bm25 = new OkapiBM25();
  if (!existsSync(bm25Path)) return bm25;
  try {
    const raw = JSON.parse(await readFileAsync(bm25Path, 'utf-8'));
    // Backward compat: old format was Record<string, string[]>
    const invertedIndex: Record<string, string[]> = raw.invertedIndex ?? raw;

    // Rebuild OkapiBM25 from inverted index
    const docTerms = new Map<string, string[]>();
    for (const [term, hashes] of Object.entries(invertedIndex)) {
      for (const hash of hashes) {
        let terms = docTerms.get(hash);
        if (!terms) {
          terms = [];
          docTerms.set(hash, terms);
        }
        terms.push(term);
      }
    }
    for (const [hash, terms] of docTerms) {
      bm25.addDocument(hash, terms);
    }
  } catch {
    // empty index
  }
  return bm25;
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
  model?: string;
  registry?: Registry;
}

export class DefaultRetrievalService implements RetrievalService {
  private embedder: EmbeddingProvider;
  private cas: CASStorage;
  private registry: Registry | null;
  private indexDir: string;
  private config: SearchConfig;
  private logger: Logger;
  private embeddingCache: LRUCache<string, number[]>;
  private l2Cache: LRUCache<string, L2Artifact>;
  private searchCache: LRUCache<string, RetrievalResult>;
  private languageDetector: HeuristicDetector;
  private hnswIndex: HNSWIndex | null = null;
  private hnswInit: Promise<void> | null = null;
  private model: string;
  private chunkToSource: Map<
    Hash,
    {
      rootHash: Hash;
      chunkId?: string;
      lineStart?: number;
      lineEnd?: number;
      charStart?: number;
      charEnd?: number;
    }
  > = new Map();

  constructor(deps: RetrievalServiceDeps) {
    this.embedder = deps.embeddingProvider;
    this.cas = deps.casStorage;
    this.registry = deps.registry ?? null;
    this.indexDir = deps.indexDir;
    this.model = deps.model ?? deps.embeddingProvider.config.model;
    this.logger = deps.logger ?? getGlobalLogger().child({ layer: 'search' });
    this.embeddingCache = deps.embeddingCache ?? new SimpleLRUCache(1000);
    this.l2Cache = deps.l2Cache ?? new SimpleLRUCache(500);
    this.searchCache = deps.searchCache ?? new SimpleLRUCache(100, 300000);
    this.config = deps.config ?? {
      defaultLanguage: 'en',
      languageDetection: { provider: 'franc', fallback: 'heuristic', confidenceThreshold: 0.7 },
      semantic: { topK: 100, threshold: 0.5, hybridWeight: 0.7 },
      rerank: { topK: 10, weights: { concept: 1, claim: 0.5, summary: 0.8, language: 0.3 } },
      cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
      citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
      prompts: {},
      crossLingual: { enabled: true, translateQuery: 'llm', targetLanguages: ['en'] },
    };
    this.languageDetector = new HeuristicDetector();
  }

  private async ensureHNSW(): Promise<void> {
    if (this.hnswIndex) return;
    if (this.hnswInit) return this.hnswInit;
    this.hnswInit = (async () => {
      const dim = this.embedder.dimension();
      const { index } = await loadOrBuildHNSW(this.indexDir, dim, this.model);
      this.hnswIndex = index;
      this.loadChunkToSource();
    })();
    return this.hnswInit;
  }

  private loadChunkToSource(): void {
    this.chunkToSource.clear();
    for (const rec of loadEmbeddingRecords(this.indexDir)) {
      if (rec.parentId) {
        const rootHash = rec.rootHash ?? rec.hash;
        this.chunkToSource.set(rec.hash, {
          rootHash,
          chunkId: rec.chunkId,
          lineStart: rec.lineStart,
          lineEnd: rec.lineEnd,
          charStart: rec.charStart,
          charEnd: rec.charEnd,
        });
      }
    }
  }

  private resolveSource(contentHash: Hash): {
    sourcePath: string;
    sourceRef?: SourceRef;
    isGhost: boolean;
  } {
    if (!this.registry) {
      return { sourcePath: contentHash, isGhost: false };
    }
    const entries = this.registry.listByContentHash(contentHash);
    const active = entries.find((e) => e.status === 'active');
    if (active) {
      return {
        sourcePath: active.externalId,
        sourceRef: { protocol: 'file', uri: active.externalId, mimeType: 'text/markdown' },
        isGhost: false,
      };
    }
    const anyEntry = entries[0];
    if (anyEntry) {
      return {
        sourcePath: anyEntry.externalId,
        sourceRef: { protocol: 'file', uri: anyEntry.externalId, mimeType: 'text/markdown' },
        isGhost: true,
      };
    }
    return { sourcePath: contentHash, isGhost: true };
  }

  async addVectors(chunks: L3Chunk[]): Promise<void> {
    await this.ensureHNSW();
    if (!this.hnswIndex) return;
    let added = 0;
    for (const c of chunks) {
      if (this.hnswIndex.has(c.chunkHash)) continue;
      this.hnswIndex.add(c.chunkHash, c.vector);
      added++;
      this.chunkToSource.set(c.chunkHash, {
        rootHash: c.rootHash,
        chunkId: c.chunkId,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        charStart: c.charStart,
        charEnd: c.charEnd,
      });
    }
    if (added > 0) {
      const hnswPath = path.join(this.indexDir, 'hnsw.bin');
      await this.hnswIndex.save(hnswPath);
    }
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
    const queryVector = await this.getQueryVector(query.enrichedQuery);

    let l3Scores: Array<{ hash: string; score: number }> = [];

    if (mode === 'semantic' || mode === 'hybrid') {
      await this.ensureHNSW();
      if (this.hnswIndex) {
        const hnswResults = this.hnswIndex.search(queryVector, topK);
        for (const r of hnswResults) {
          const score = 1 - r.distance;
          if (score >= threshold) {
            l3Scores.push({ hash: r.hash, score });
          }
        }
      }
      l3Scores.sort((a, b) => b.score - a.score);
      l3Scores = l3Scores.slice(0, topK);
    }

    // Keyword search (Okapi BM25)
    const kwScores = new Map<string, number>();
    if (mode === 'keyword' || mode === 'hybrid') {
      trace.steps.push('L3: BM25 search');
      const bm25 = await loadOkapiBM25(this.indexDir);
      const queryTokens = tokenize(query.enrichedQuery);
      const bm25Results = bm25.scoreAll(queryTokens, topK);
      // Use raw BM25 scores (already ranked)
      for (const r of bm25Results) {
        kwScores.set(r.hash, r.score);
      }
      if (mode === 'keyword') {
        // BM25 scores are raw (can be negative/zero); take top K by rank
        for (const [hash, score] of kwScores) {
          l3Scores.push({ hash, score });
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
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }

    trace.steps.push(`L3: ${l3Scores.length} candidates`);

    // L2 Rerank
    trace.steps.push('L2: rerank start');
    const candidates: CandidateNode[] = [];
    for (const s of l3Scores) {
      const sourceInfo = this.chunkToSource.get(s.hash);
      const rootHash = sourceInfo?.rootHash ?? s.hash;
      const l2 = await this.loadL2(rootHash);
      if (!l2) continue;
      const source = this.resolveSource(rootHash);
      const rerankScore = await this.scoreL2(l2, query, queryLang);
      const candidate: CandidateNode = {
        nodeId: s.hash,
        contentHash: rootHash,
        chunkHash: s.hash,
        score: rerankScore,
        similarity: s.score,
        l2Summary: l2.summary,
        l2Artifact: l2,
        sourcePath: source.sourcePath,
        sourceRef: source.sourceRef,
        isGhost: source.isGhost,
      };
      candidates.push(candidate);
    }
    candidates.sort((a, b) => b.score - a.score);
    const reranked = candidates.slice(0, rerankTopK);
    trace.steps.push(`L2: ${reranked.length} reranked`);

    // Deduplicate by contentHash so one document does not occupy multiple result slots.
    const seenHashes = new Set<Hash>();
    const uniqueReranked: CandidateNode[] = [];
    for (const c of reranked) {
      if (!seenHashes.has(c.contentHash)) {
        seenHashes.add(c.contentHash);
        uniqueReranked.push(c);
      }
    }

    // L1/L0 Cascade
    trace.steps.push('L1/L0: cascade start');
    const selected: CandidateNode[] = [];
    for (const c of uniqueReranked.slice(0, finalTopK)) {
      const enriched = await this.cascade(c, query.intent);
      selected.push(enriched);
    }
    trace.steps.push(`L1/L0: ${selected.length} selected`);

    // Citations
    const citations: Citation[] = [];
    for (const c of selected) {
      citations.push({
        nodeId: c.nodeId,
        contentHash: c.contentHash,
        chunkHash: c.chunkHash,
        level: query.intent === 'precision' ? 'L0' : query.intent === 'section' ? 'L1' : 'L2',
        content: c.l2Summary ?? c.l1Preview ?? c.l0Preview ?? '',
        score: c.score,
        span: c.lineRange,
        sourceRef: c.sourceRef,
        sourcePath: c.sourcePath,
        isGhost: c.isGhost,
      });
    }

    trace.durationMs = Date.now() - start;
    this.logger.info('search.duration', { query: query.originalQuery, durationMs: trace.durationMs, candidates: reranked.length, selected: selected.length });

    const result: RetrievalResult = {
      query: query.originalQuery,
      candidates: uniqueReranked,
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

  private async scoreL2(l2: L2Artifact, query: AnalyzedQuery, queryLang: string): Promise<number> {
    const w = this.config.rerank.weights;
    let score = 0;

    // Detect document language (prefer stored field, fallback to heuristic on summary)
    let docLang = l2.language;
    if (!docLang) {
      const detected = await this.languageDetector.detect(l2.summary.slice(0, 1000));
      docLang = detected.code;
    }
    const sameLanguage = docLang === queryLang;

    // Query terms include entities, signals, and English translations injected by analyzer
    const qTerms = new Set(query.entities.concat(query.signals.map((s) => s.value)));

    // Concept overlap: match against original concepts and English translations
    const concepts = new Set(l2.concepts.map((c) => c.toLowerCase()));
    if (l2.conceptsEn) {
      for (const c of l2.conceptsEn) concepts.add(c.toLowerCase());
    }
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

    // Language match boost: only when document and query share a language
    if (sameLanguage) {
      score += w.language * 0.5;
    }

    return score;
  }

  private async cascade(candidate: CandidateNode, intent: QueryIntent): Promise<CandidateNode> {
    const chunkHash = candidate.nodeId;
    const sourceInfo = this.chunkToSource.get(chunkHash);
    const rootHash = sourceInfo?.rootHash ?? candidate.contentHash ?? chunkHash;

    if (candidate.isGhost) {
      // Ghost documents provide L2 essence only; do not load L0.
      return candidate;
    }

    const objPath = this.cas.getObjectPath(rootHash);

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

          // Exact slice from L1/L3 chunk geometry if available.
          if (
            sourceInfo?.charStart !== undefined &&
            sourceInfo?.charEnd !== undefined &&
            sourceInfo.lineStart !== undefined &&
            sourceInfo.lineEnd !== undefined
          ) {
            const exact = l0Raw.slice(sourceInfo.charStart, sourceInfo.charEnd + 1);
            candidate.l0Preview = exact.slice(0, 1500);
            candidate.lineRange = { start: sourceInfo.lineStart, end: sourceInfo.lineEnd };
          } else {
            // Fallback: heuristic paragraph search.
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
            const idx = l0Raw.indexOf(bestChunk);
            const linesBefore = idx >= 0 ? l0Raw.slice(0, idx).split('\n').length - 1 : 0;
            const lineCount = bestChunk.split('\n').length;
            candidate.lineRange = { start: linesBefore, end: linesBefore + lineCount };
          }
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
