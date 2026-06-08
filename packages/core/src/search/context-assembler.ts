/**
 * ECHO Core — Context Assembler
 * Phase 4: Token budget allocation, citation generation, drill-down segments.
 */

import type { Hash, SourceRef } from '../domain/types.js';
import type { SearchConfig } from '../storage/config.js';
import type { AnalyzedQuery, QueryIntent } from './query-analyzer.js';
import type { CandidateNode } from './retrieval-service.js';

export interface ContextSegment {
  level: 'L2' | 'L1' | 'L0';
  nodeId: Hash;
  content: string;
  span?: { start: number; end: number };
  sourceRef?: SourceRef;
  children?: ContextSegment[];
}

export interface AssembledCitation {
  nodeId: Hash;
  level: 'L2' | 'L1' | 'L0';
  content: string;
  span?: { start: number; end: number };
  sourceRef?: SourceRef;
}

export interface AssembledContext {
  segments: ContextSegment[];
  totalTokens: number;
  trace: {
    steps: string[];
    budgetUsed: number;
    budgetTotal: number;
  };
  citations: AssembledCitation[];
  language: string;
}

export interface ContextAssembler {
  assemble(
    query: AnalyzedQuery,
    candidates: CandidateNode[],
    options?: { maxTokens?: number; includeChildren?: boolean }
  ): Promise<AssembledContext>;
}

/** Rough token estimate: ~4 chars per token for CJK, ~4 for Latin. Simple heuristic. */
function estimateTokens(text: string): number {
  // Count CJK characters as 1 token each, Latin words as ~1.3 tokens
  let tokens = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) {
      tokens += 1;
    } else if (/\s/.test(ch)) {
      // skip whitespace
    } else {
      tokens += 0.25; // 4 chars ≈ 1 token
    }
  }
  return Math.ceil(tokens);
}

function truncateToBudget(text: string, budget: number): string {
  if (estimateTokens(text) <= budget) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const slice = text.slice(0, mid);
    if (estimateTokens(slice) <= budget) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return text.slice(0, Math.max(0, low - 1)) + '…';
}

function formatCitation(
  nodeId: Hash,
  level: 'L2' | 'L1' | 'L0',
  span: { start: number; end: number } | undefined,
  sourceRef: SourceRef | undefined,
  format: 'markdown' | 'plain' | 'json'
): string {
  const display = sourceRef ? pathBasename(sourceRef.uri) : nodeId.slice(0, 8);
  if (format === 'json') {
    return JSON.stringify({ nodeId, level, span, display });
  }
  if (format === 'plain') {
    return span ? `${display} lines ${span.start}-${span.end}` : display;
  }
  // markdown
  if (span) {
    return `[[${nodeId}#lines-${span.start}-${span.end}|${display}]]`;
  }
  return `[[${nodeId}|${display}]]`;
}

function pathBasename(uri: string): string {
  const parts = uri.split(/[\\/]/);
  return parts[parts.length - 1] || uri;
}

export interface ContextAssemblerDeps {
  config?: SearchConfig;
}

export class DefaultContextAssembler implements ContextAssembler {
  private config: SearchConfig;

  constructor(deps: ContextAssemblerDeps = {}) {
    this.config = deps.config ?? {
      defaultLanguage: 'en',
      languageDetection: { provider: 'franc', fallback: 'heuristic', confidenceThreshold: 0.7 },
      semantic: { topK: 100, threshold: 0.5, hybridWeight: 0.7 },
      rerank: { topK: 10, weights: { concept: 1, claim: 0.5, summary: 0.8, language: 0.3 } },
      cascade: { budgets: { vague: 500, section: 800, precision: 1500 } },
      citations: { format: 'markdown', includeLineNumbers: true, includeTimestamps: true },
      prompts: {},
      crossLingual: { enabled: true },
    };
  }

  async assemble(
    query: AnalyzedQuery,
    candidates: CandidateNode[],
    options: { maxTokens?: number; includeChildren?: boolean } = {}
  ): Promise<AssembledContext> {
    const maxTokens = options.maxTokens ?? 8000;
    const budgets = this.config.cascade.budgets;
    const intent: QueryIntent = query.intent;

    const traceSteps: string[] = [];
    let budgetUsed = 0;

    // Determine per-level budgets
    let l2Budget = 0;
    let l1Budget = 0;
    let l0Budget = 0;

    switch (intent) {
      case 'vague':
        l2Budget = Math.min(budgets.vague, maxTokens);
        break;
      case 'section':
        l2Budget = Math.min(budgets.vague, Math.floor(maxTokens * 0.4));
        l1Budget = Math.min(budgets.section, Math.floor(maxTokens * 0.5));
        break;
      case 'precision':
        l2Budget = Math.min(budgets.vague, Math.floor(maxTokens * 0.3));
        l1Budget = Math.min(budgets.section, Math.floor(maxTokens * 0.4));
        l0Budget = Math.min(budgets.precision, Math.floor(maxTokens * 0.3));
        break;
    }

    traceSteps.push(`budget: intent=${intent} L2=${l2Budget} L1=${l1Budget} L0=${l0Budget}`);

    const segments: ContextSegment[] = [];
    const citations: AssembledCitation[] = [];

    // Allocate L2 summaries across top candidates
    const l2PerCandidate = Math.floor(l2Budget / Math.max(1, Math.min(candidates.length, 5)));
    let l2Spent = 0;
    for (let i = 0; i < candidates.length && l2Spent < l2Budget; i++) {
      const c = candidates[i];
      if (!c.l2Summary) continue;
      const content = truncateToBudget(c.l2Summary, Math.min(l2PerCandidate, l2Budget - l2Spent));
      const seg: ContextSegment = {
        level: 'L2',
        nodeId: c.nodeId,
        content,
        sourceRef: c.sourceRef,
      };
      if (options.includeChildren && (intent === 'section' || intent === 'precision')) {
        seg.children = []; // populated later if L1 available
      }
      segments.push(seg);
      l2Spent += estimateTokens(content);

      citations.push({
        nodeId: c.nodeId,
        level: 'L2',
        content,
        sourceRef: c.sourceRef,
      });
    }
    traceSteps.push(`L2: ${segments.length} segments, ${l2Spent} tokens`);

    // L1 Fractal (outline preview)
    let l1Spent = 0;
    if (l1Budget > 0) {
      const l1Segments: ContextSegment[] = [];
      for (const c of candidates) {
        if (!c.l1Preview) continue;
        const budgetRemaining = l1Budget - l1Spent;
        if (budgetRemaining <= 0) break;
        const content = truncateToBudget(c.l1Preview, budgetRemaining);
        const seg: ContextSegment = {
          level: 'L1',
          nodeId: c.nodeId,
          content,
          sourceRef: c.sourceRef,
        };
        if (options.includeChildren && intent === 'precision') {
          seg.children = [];
        }
        l1Segments.push(seg);
        l1Spent += estimateTokens(content);

        citations.push({
          nodeId: c.nodeId,
          level: 'L1',
          content,
          sourceRef: c.sourceRef,
        });

        // Link as child of matching L2 segment
        if (options.includeChildren) {
          const parent = segments.find((s) => s.nodeId === c.nodeId && s.level === 'L2');
          if (parent) {
            parent.children = parent.children ?? [];
            parent.children.push(seg);
          }
        }
      }
      segments.push(...l1Segments);
      traceSteps.push(`L1: ${l1Segments.length} segments, ${l1Spent} tokens`);
    }

    // L0 Precision (exact chunks)
    let l0Spent = 0;
    if (l0Budget > 0) {
      const l0Segments: ContextSegment[] = [];
      for (const c of candidates) {
        if (!c.l0Preview) continue;
        const budgetRemaining = l0Budget - l0Spent;
        if (budgetRemaining <= 0) break;
        const content = truncateToBudget(c.l0Preview, budgetRemaining);
        const seg: ContextSegment = {
          level: 'L0',
          nodeId: c.nodeId,
          content,
          span: c.lineRange,
          sourceRef: c.sourceRef,
        };
        l0Segments.push(seg);
        l0Spent += estimateTokens(content);

        citations.push({
          nodeId: c.nodeId,
          level: 'L0',
          content,
          span: c.lineRange,
          sourceRef: c.sourceRef,
        });

        // Link as child of matching L1 segment
        if (options.includeChildren) {
          const parent = segments.find((s) => s.nodeId === c.nodeId && s.level === 'L1');
          if (parent) {
            parent.children = parent.children ?? [];
            parent.children.push(seg);
          }
        }
      }
      segments.push(...l0Segments);
      traceSteps.push(`L0: ${l0Segments.length} segments, ${l0Spent} tokens`);
    }

    budgetUsed = l2Spent + l1Spent + l0Spent;

    // Format citations
    const citationFormat = this.config.citations.format;
    for (const cit of citations) {
      if (citationFormat !== 'json') {
        // enrich content with citation marker
        cit.content = `${cit.content}\n${formatCitation(cit.nodeId, cit.level, cit.span, cit.sourceRef, citationFormat)}`;
      }
    }

    return {
      segments,
      totalTokens: budgetUsed,
      trace: {
        steps: traceSteps,
        budgetUsed,
        budgetTotal: maxTokens,
      },
      citations,
      language: query.language,
    };
  }
}
