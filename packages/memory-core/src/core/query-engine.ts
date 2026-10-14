import type { MemoryCore } from './memory-core.js';
import type { SemanticRepresentation, Object, Claim, Relationship, KnowledgeGap } from '../domain/entities.js';
import type { ObjectId } from '../domain/ids.js';

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

export interface MultiHopPathResult {
  path: Relationship[];
  objectIds: ObjectId[];
  score: number;
}

export class QueryEngine {
  constructor(private core: MemoryCore) {}

  private withinTenant(tenantId: string, tenantIdOf: string): boolean {
    return tenantIdOf === tenantId;
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-zа-яё0-9]+/)
      .filter((token) => token.length > 2);
  }

  findEntryPoints(query: string, type: 'summary' | 'essence_nl' | 'essence_structured' | 'embedding' = 'essence_nl', tenantId: string = 'default'): EntryPointsResult {
    const queryTokens = this.tokenize(query);
    const representations = (this.core as any).deps.representations.byType(type)
      .filter((representation: any) => !representation.tenantId || this.withinTenant(tenantId, representation.tenantId));
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

  knowledgeQuery(query: string, tenantId: string = 'default'): KnowledgeQueryResult {
    const queryTokens = this.tokenize(query);
    const claims = (this.core as any).deps.claims.all().filter((claim: Claim) => {
      if (!this.withinTenant(tenantId, (claim as any).tenantId)) return false;
      const text = `${claim.predicate} ${String(claim.objectOrValue)}`;
      const tokens = this.tokenize(text);
      return queryTokens.some((token) => tokens.includes(token));
    });
    const relationships = (this.core as any).deps.relationships.all().filter((relationship: Relationship) =>
      this.withinTenant(tenantId, (relationship as any).tenantId)
      && queryTokens.includes(relationship.relationType.toLowerCase()),
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

  reconstructContext(startObjectId: string, maxDepth: number = 3, tenantId: string = 'default'): ContextReconstructionResult {
    const resolvedId = (this.core as any).deps.identity.resolve(startObjectId);
    const paths = (this.core as any).traverseRelationships(resolvedId, maxDepth).filter((path: Relationship[]) =>
      path.every((relationship) => this.withinTenant(tenantId, (relationship as any).tenantId)));
    const claims = (this.core as any).deps.claims.bySubject(resolvedId)
      .filter((claim: Claim) => this.withinTenant(tenantId, (claim as any).tenantId));
    const object = (this.core as any).deps.objects.get(resolvedId);
    const tenantObject = object && this.withinTenant(tenantId, (object as any).tenantId) ? object : undefined;
    const gaps = (this.core as any).deps.gaps.all().filter((gap: KnowledgeGap) =>
      gap.subjectId === resolvedId && this.withinTenant(tenantId, (gap as any).tenantId));
    return {
      paths,
      claims,
      objects: tenantObject ? [tenantObject] : [],
      gaps,
    };
  }

  findMultiHopPaths(startObjectId: string, endObjectId: string, maxDepth: number = 4, tenantId: string = 'default'): MultiHopPathResult[] {
    const start = (this.core as any).deps.identity.resolve(startObjectId);
    const end = (this.core as any).deps.identity.resolve(endObjectId);
    if (start === end) {
      return [{ path: [], objectIds: [start], score: 1 }];
    }

    const results: MultiHopPathResult[] = [];
    const visited = new Set<ObjectId>();

    const walk = (objectId: ObjectId, path: Relationship[], objectIds: ObjectId[], depth: number): void => {
      if (depth >= maxDepth) return;
      if (visited.has(objectId)) return;
      visited.add(objectId);
      const resolved = (this.core as any).deps.identity.resolve(objectId);
      const relationships = (this.core as any).deps.relationships.bySource(resolved);
      for (const relationship of relationships) {
        if (relationship.lifecycleState !== 'active') continue;
        if (!this.withinTenant(tenantId, (relationship as any).tenantId)) continue;
        const newPath = [...path, relationship];
        const newObjectIds = [...objectIds, relationship.targetObject];
        const resolvedTarget = (this.core as any).deps.identity.resolve(relationship.targetObject);
        if (resolvedTarget === end) {
          const confidenceProduct = newPath.reduce((acc, rel) => acc * Math.min(1, Math.max(0, rel.confidence)), 1);
          results.push({ path: newPath, objectIds: newObjectIds, score: confidenceProduct });
          continue;
        }
        walk(relationship.targetObject, newPath, newObjectIds, depth + 1);
      }
    };

    walk(start, [], [start], 0);
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}
