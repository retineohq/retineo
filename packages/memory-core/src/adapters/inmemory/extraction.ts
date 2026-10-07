import type { Evidence } from '../../domain/entities.js';
import type { ExtractionModel, ExtractionResult, ExtractedClaim, ExtractedRelationship } from '../../ports/extraction.js';

export class RegexExtractionModel implements ExtractionModel {
  extract(evidence: Evidence, content: string): ExtractionResult {
    const claims: ExtractedClaim[] = [];
    const relationships: ExtractedRelationship[] = [];

    // Pattern: "X is Y" / "X = Y" / "we chose X" / "X has role Y"
    const claimPatterns = [
      /(?:we chose|we selected|decision:)\s*([A-Za-z][\w\s-]+?)(?:\s+as\s+(.+?))?(?:\.|$)/gim,
      /([A-Za-z][\w\s-]+?)\s+(?:is|are)\s+([A-Za-z][\w\s-]+?)(?:\.|$)/gim,
      /([A-Za-z][\w\s-]+?)\s+has\s+role\s+([A-Za-z][\w\s-]+?)(?:\.|$)/gim,
    ];

    for (const pattern of claimPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const objectOrValue = match[2]?.trim() ?? 'true';
        claims.push({
          subjectName: match[1].trim(),
          predicate: 'has_role',
          objectOrValue,
          confidence: 0.5,
          basis: `Pattern match: ${match[0].slice(0, 50)}`,
        });
        if (claims.length >= 10) break;
      }
    }

    // Pattern: "X supersedes Y" / "X caused by Y" / "X depends on Y"
    const relationPatterns: Array<[RegExp, string]> = [
      [/(.+?)\s+supersedes\s+(.+?)(?:\.|$)/gim, 'supersedes'],
      [/(.+?)\s+caused\s+by\s+(.+?)(?:\.|$)/gim, 'caused_by'],
      [/(.+?)\s+depends\s+on\s+(.+?)(?:\.|$)/gim, 'depends_on'],
      [/(.+?)\s+contradicts\s+(.+?)(?:\.|$)/gim, 'contradicts'],
    ];

    for (const [pattern, type] of relationPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (!match[1] || !match[2]) continue;
        relationships.push({
          sourceName: match[1].trim(),
          relationType: type as any,
          targetName: match[2].trim(),
          confidence: 0.5,
          basis: `Pattern match: ${match[0].slice(0, 50)}`,
        });
        if (relationships.length >= 10) break;
      }
    }

    return { claims, relationships };
  }
}
