import type { AsyncExtractionModel, ExtractionResult, ExtractedClaim, ExtractedRelationship } from '../../ports/extraction.js';
import type { Evidence } from '../../domain/entities.js';
import type { PredicateType, RelationType } from '../../domain/value-objects.js';

export interface OpenRouterExtractionOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

const PREDICATES: PredicateType[] = ['has_role', 'has_property', 'has_value'];
const RELATIONS: RelationType[] = [
  'supersedes', 'caused_by', 'depends_on', 'supports', 'contradicts',
  'invalidates', 'references', 'belongs_to', 'related_to',
];

export class OpenRouterExtractionModel implements AsyncExtractionModel {
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OpenRouterExtractionOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? null;
    this.baseUrl = (options.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    this.model = options.model ?? process.env.OPENROUTER_EXTRACTION_MODEL ?? 'openai/gpt-4o-mini';
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async extractAsync(evidence: Evidence, content: string): Promise<ExtractionResult> {
    if (!this.apiKey) throw new Error('OpenRouterExtractionModel: OPENROUTER_API_KEY is required');
    if (!content.trim()) return { claims: [], relationships: [] };

    const body = JSON.stringify({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'Extract factual claims and relationships as strict JSON. Return only JSON.',
        },
        {
          role: 'user',
          content: JSON.stringify({
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
        },
      ],
      response_format: { type: 'json_object' },
    });

    const response = await this.request(body);
    return this.parse(response.body);
  }

  private async request(body: string): Promise<{ ok: boolean; status: number; body: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
          'http-referer': 'https://github.com/retineohq/retineo',
          'x-title': 'Retineo Memory Core',
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    } catch (error) {
      throw new Error(`OpenRouterExtractionModel: request failed: ${(error as Error).message}`);
    }
  }

  private parse(body: string): ExtractionResult {
    let outer: { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } };
    try {
      outer = JSON.parse(body);
    } catch {
      throw new Error(`OpenRouterExtractionModel: invalid JSON response`);
    }
    if (outer.error) throw new Error(`OpenRouterExtractionModel: ${outer.error.message ?? 'API error'}`);
    const content = outer.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenRouterExtractionModel: response has no message content');
    }
    let inner: { claims?: unknown[]; relationships?: unknown[] };
    try {
      inner = JSON.parse(content);
    } catch {
      throw new Error('OpenRouterExtractionModel: model returned invalid JSON');
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
