import type { AsyncExtractionModel, ExtractionResult, ExtractedClaim, ExtractedRelationship } from '../../ports/extraction.js';
import type { Evidence } from '../../domain/entities.js';
import type { PredicateType, RelationType } from '../../domain/value-objects.js';

export interface OllamaExtractionOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  debug?: boolean;
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
  private readonly debug: boolean;

  constructor(options: OllamaExtractionOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.model = options.model ?? process.env.OLLAMA_EXTRACTION_MODEL ?? 'qwen2.5:3b';
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.debug = options.debug ?? process.env.OLLAMA_EXTRACTION_DEBUG === '1';
  }

  async extractAsync(evidence: Evidence, content: string): Promise<ExtractionResult> {
    if (!content.trim()) return { claims: [], relationships: [] };
    const prompt = this.buildPrompt(evidence, content);
    const response = await this.request(prompt);
    if (this.debug) {
      console.error(`OllamaExtractionModel: raw response: ${response.body.slice(0, 2000)}`);
    }
    return this.parse(response.body);
  }

  private buildPrompt(evidence: Evidence, content: string): string {
    return [
      'You are a strict information extraction engine.',
      'Input: a text passage.',
      'Output: ONLY a JSON object. No explanations, no schema, no markdown.',
      'Rules:',
      '- claims: facts about the subject, predicate is exactly one of: has_role, has_property, has_value.',
      '- relationships: connections between subjects, relationType is exactly one of: supersedes, caused_by, depends_on, supports, contradicts, invalidates, references, belongs_to, related_to.',
      '- Do not echo the input. Do not include the schema itself.',
      '',
      'Example:',
      'Input: PostgreSQL is the primary database. We chose Fastify as the HTTP framework.',
      'Output:',
      JSON.stringify({
        claims: [
          { subjectName: 'PostgreSQL', predicate: 'has_property', objectOrValue: 'primary database', observedAt: null, validFrom: null, validTo: null, confidence: 0.9, basis: null },
          { subjectName: 'Fastify', predicate: 'has_role', objectOrValue: 'HTTP framework', observedAt: null, validFrom: null, validTo: null, confidence: 0.9, basis: null },
        ],
        relationships: [
          { sourceName: 'PostgreSQL', relationType: 'related_to', targetName: 'Fastify', confidence: 0.7, basis: null },
        ],
      }),
      '',
      'Input:',
      content,
      'Output:',
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
