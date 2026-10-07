import type { MemoryCore } from './memory-core.js';
import type { SemanticRepresentation, Object, Claim, Relationship, KnowledgeGap } from '../domain/entities.js';

export interface EntryPointsResult {
  representations: SemanticRepresentation[];
  scoreExplanation: string[];
}

export interface KnowledgeQueryResult {
  claims: Claim[];
  relationships: Relationship[];
  objects: Object[];
}

export interface ContextReconstructionResult {
  paths: Relationship[][];
  claims: Claim[];
  objects: Object[];
  gaps: KnowledgeGap[];
}

export class QueryEngine {
  constructor(private core: MemoryCore) {}

  private tokenize(text: string): string[] {
    return text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-zа-яё0-9]+/)
      .filter((token) => token.length > 2);
  }

  findEntryPoints(query: string, type: 'summary' | 'essence_nl' | 'essence_structured' | 'embedding' = 'essence_nl'): EntryPointsResult {
    const queryTokens = this.tokenize(query);
    const representations = (this.core as any).deps.representations.byType(type);
    const scored: Array<{ representation: SemanticRepresentation; score: number; explanation: string }> = [];
    for (const representation of representations) {
      const contentText = typeof representation.content === 'string'
        ? representation.content
        : JSON.stringify(representation.content);
      const contentTokens = this.tokenize(contentText);
      const matches = queryTokens.filter((token) => contentTokens.includes(token));
      const score = matches.length / Math.max(1, queryTokens.length);
      if (score > 0) {
        scored.push({ representation, score, explanation: `matched: ${matches.join(', ')}` });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return {
      representations: scored.map((item) => item.representation),
      scoreExplanation: scored.map((item) => `${item.representation.id} (score=${item.score.toFixed(2)}): ${item.explanation}`),
    };
  }

  knowledgeQuery(query: string): KnowledgeQueryResult {
    const queryTokens = this.tokenize(query);
    const claims = (this.core as any).deps.claims.all().filter((claim: Claim) => {
      const text = `${claim.predicate} ${String(claim.objectOrValue)}`;
      const tokens = this.tokenize(text);
      return queryTokens.some((token) => tokens.includes(token));
    });
    const relationships = (this.core as any).deps.relationships.all().filter((relationship: Relationship) =>
      queryTokens.includes(relationship.relationType.toLowerCase()),
    );
    const objectIds = new Set<string>();
    for (const claim of claims) objectIds.add(claim.subjectId);
    for (const relationship of relationships) {
      objectIds.add(relationship.sourceObject);
      objectIds.add(relationship.targetObject);
    }
    const objects = Array.from(objectIds).map((id) => (this.core as any).deps.objects.get(id)).filter(Boolean);
    return { claims, relationships, objects };
  }

  reconstructContext(startObjectId: string, maxDepth: number = 3): ContextReconstructionResult {
    const resolvedId = (this.core as any).deps.identity.resolve(startObjectId);
    const paths = (this.core as any).traverseRelationships(resolvedId, maxDepth);
    const claims = (this.core as any).deps.claims.bySubject(resolvedId);
    const object = (this.core as any).deps.objects.get(resolvedId);
    const gaps = (this.core as any).deps.gaps.all().filter((gap: KnowledgeGap) => gap.subjectId === resolvedId);
    return {
      paths,
      claims,
      objects: object ? [object] : [],
      gaps,
    };
  }
}
