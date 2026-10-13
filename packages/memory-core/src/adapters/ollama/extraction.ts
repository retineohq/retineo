import type { AsyncExtractionModel, ExtractionResult, ExtractedClaim, ExtractedRelationship } from '../../ports/extraction.js';
import type { Evidence } from '../../domain/entities.js';
import type { PredicateType, RelationType } from '../../domain/value-objects.js';

export interface OllamaExtractionOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

const PREDICATES: PredicateType[] = ['has_role', 'has_property', 'has_value'];
const RELATIONS: RelationType[] = [
  'supersedes', 'caused_by', 'depends_on', 'supports', 'contradicts',
  'invalidates', 'references', 'belongs_to', 'related_to',
];

export class OllamaExtractionModel implements AsyncExtractionModel {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaExtractionOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.model = options.model ?? process.env.OLLAMA_EXTRACTION_MODEL ?? 'qwen2.5:3b';
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }

  async extractAsync(evidence: Evidence, content: string): Promise<ExtractionResult> {
    if (!content.trim()) return { claims: [], relationships: [] };
    const prompt = this.buildPrompt(evidence, content);
    const response = await this.request(prompt);
    return this.parse(response.body);
  }

  private buildPrompt(evidence: Evidence, content: string): string {
    return [
      'Extract factual claims and relationships as strict JSON. Return only JSON, no markdown.',
      JSON.stringify({
        evidenceId: evidence.id,
        evidenceSource: evidence.contentHash,
        content,
        schema: {
          claims: [{
            subjectName: 'string', predicate: PREDICATES, objectOrValue: 'string',
            observedAt: 'ISO date or null', validFrom: 'ISO date or null',
            validTo: 'ISO date or null', confidence: 'number 0-1', basis: 'string or null',
          }],
          relationships: [{
            sourceName: 'string', relationType: RELATIONS, targetName: 'string',
            confidence: 'number 0-1', basis: 'string or null',
          }],
        },
      }),
    ].join('\n');
  }

  private async request(prompt: string): Promise<{ ok: boolean; status: number; body: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: 'json',
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    } catch (error) {
      throw new Error(`OllamaExtractionModel: request failed: ${(error as Error).message}`);
    }
  }

  private parse(body: string): ExtractionResult {
    let outer: { response?: unknown; error?: string };
    try {
      outer = JSON.parse(body);
    } catch {
      throw new Error('OllamaExtractionModel: invalid JSON response');
    }
    if (outer.error) throw new Error(`OllamaExtractionModel: ${outer.error}`);
    if (typeof outer.response !== 'string') {
      throw new Error('OllamaExtractionModel: response has no generated text');
    }

    let inner: { claims?: unknown[]; relationships?: unknown[] };
    try {
      inner = JSON.parse(outer.response);
    } catch {
      throw new Error('OllamaExtractionModel: model returned invalid JSON');
    }

    const claims: ExtractedClaim[] = (inner.claims ?? [])
      .map((item): ExtractedClaim | null => {
        const value = item as Record<string, unknown>;
        const subjectName = typeof value.subjectName === 'string' ? value.subjectName.trim() : '';
        const objectOrValue = typeof value.objectOrValue === 'string' ? value.objectOrValue.trim() : '';
        const predicate = PREDICATES.find((candidate) => candidate === value.predicate);
        const confidence = typeof value.confidence === 'number' ? Math.min(1, Math.max(0, value.confidence)) : 0;
        if (!subjectName || !objectOrValue || !predicate) return null;
        return {
          subjectName, predicate, objectOrValue, confidence,
          observedAt: typeof value.observedAt === 'string' ? value.observedAt : null,
          validFrom: typeof value.validFrom === 'string' ? value.validFrom : null,
          validTo: typeof value.validTo === 'string' ? value.validTo : null,
          basis: typeof value.basis === 'string' ? value.basis : null,
        };
      })
      .filter((item): item is ExtractedClaim => item !== null);

    const relationships: ExtractedRelationship[] = (inner.relationships ?? [])
      .map((item): ExtractedRelationship | null => {
        const value = item as Record<string, unknown>;
        const sourceName = typeof value.sourceName === 'string' ? value.sourceName.trim() : '';
        const targetName = typeof value.targetName === 'string' ? value.targetName.trim() : '';
        const relationType = RELATIONS.find((candidate) => candidate === value.relationType);
        const confidence = typeof value.confidence === 'number' ? Math.min(1, Math.max(0, value.confidence)) : 0;
        if (!sourceName || !targetName || !relationType) return null;
        return {
          sourceName, relationType, targetName, confidence,
          basis: typeof value.basis === 'string' ? value.basis : null,
        };
      })
      .filter((item): item is ExtractedRelationship => item !== null);

    return { claims, relationships };
  }
}
