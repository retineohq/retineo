/**
 * ECHO Core — L2 Generator
 * Phase 3: LLM-powered semantic extraction with Zod validation and retry logic.
 */

import { z } from 'zod';
import type { LLMProvider, GenerateOptions } from '../llm/provider.js';
import { L2ArtifactSchema } from '../domain/schemas.js';
import type { L2Artifact } from '../domain/types.js';

export interface L2Generator {
  generate(l1Markdown: string, provider: LLMProvider): Promise<L2Artifact>;
}

export interface L2GeneratorOptions {
  maxRetries?: number;
  generatorId?: string;
  version?: string;
}

const DEFAULT_OPTIONS: Required<L2GeneratorOptions> = {
  maxRetries: 3,
  generatorId: 'semantic-extractor',
  version: '1.0.0',
};

function buildPrompt(l1Markdown: string): string {
  return `You are a knowledge extraction engine. Given a structured document outline, produce a semantic summary in JSON format.

Document:
${l1Markdown}

Respond with valid JSON only:
{
  "summary": "2-3 paragraph semantic summary",
  "concepts": ["concept 1", "concept 2", ...],
  "entities": ["entity 1", "entity 2", ...],
  "claims": ["factual claim 1", "factual claim 2", ...],
  "relations": [
    {"source": "concept A", "target": "concept B", "type": "depends_on"}
  ]
}`;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```json')) {
    return trimmed.slice(7).replace(/```$/, '').trim();
  }
  if (trimmed.startsWith('```')) {
    return trimmed.slice(3).replace(/```$/, '').trim();
  }
  return trimmed;
}

function truncateMarkdown(l1Markdown: string, maxChars: number): string {
  if (l1Markdown.length <= maxChars) return l1Markdown;
  // Keep YAML frontmatter and headings, truncate body
  const lines = l1Markdown.split('\n');
  const kept: string[] = [];
  let chars = 0;
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('---') || line.startsWith('<!-- chunk:')) {
      kept.push(line);
      chars += line.length + 1;
    } else if (chars + line.length + 1 <= maxChars) {
      kept.push(line);
      chars += line.length + 1;
    } else {
      kept.push('... [truncated]');
      break;
    }
  }
  return kept.join('\n');
}

export class DefaultL2Generator implements L2Generator {
  private opts: Required<L2GeneratorOptions>;

  constructor(options?: L2GeneratorOptions) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  async generate(l1Markdown: string, provider: LLMProvider): Promise<L2Artifact> {
    const maxContext = provider.capabilities().maxContextLength;
    let prompt = buildPrompt(l1Markdown);

    if (prompt.length > maxContext) {
      const truncated = truncateMarkdown(l1Markdown, maxContext - 500);
      prompt = buildPrompt(truncated);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < this.opts.maxRetries; attempt++) {
      try {
        const opts: GenerateOptions = {
          jsonMode: true,
          temperature: 0.3,
        };
        const raw = await provider.generate(prompt, opts);
        const cleaned = stripCodeFences(raw);
        const parsed = JSON.parse(cleaned);
        const validated = L2ArtifactSchema.parse(parsed);
        return validated;
      } catch (err) {
        lastError = err;
        if (err instanceof z.ZodError) {
          prompt = `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no extra text.`;
        } else if (err instanceof SyntaxError) {
          prompt = `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY JSON.`;
        }
        // else: timeout or network error, retry with same prompt
      }
    }

    throw new Error(
      `L2 generation failed after ${this.opts.maxRetries} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }
}
