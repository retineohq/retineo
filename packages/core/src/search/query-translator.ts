/**
 * RETINEO Core — Query Translator
 * Translates non-English query terms into English for cross-lingual BM25 matching.
 */

import type { LLMProvider } from '../llm/provider.js';

export interface TranslatedTerms {
  original: string[];
  english: string[];
}

export interface QueryTranslator {
  translate(terms: string[], sourceLanguage: string): Promise<TranslatedTerms>;
}

/** No-op translator: returns empty English translations. */
export class NoOpQueryTranslator implements QueryTranslator {
  async translate(terms: string[], _sourceLanguage: string): Promise<TranslatedTerms> {
    return { original: terms, english: [] };
  }
}

/** LLM-based translator. Best effort; falls back to no-op on failure. */
export class LLMQueryTranslator implements QueryTranslator {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async translate(terms: string[], sourceLanguage: string): Promise<TranslatedTerms> {
    if (sourceLanguage === 'en' || terms.length === 0) {
      return { original: terms, english: [] };
    }

    const prompt = `Translate the following ${sourceLanguage} search terms into English.
Return valid JSON only:
{"translations": ["english term 1", "english term 2", ...]}

Terms:
${terms.map((t) => `- ${t}`).join('\n')}

Rules:
- Output array must have exactly ${terms.length} items.
- Preserve proper nouns unchanged.
- Use lowercase.`;

    try {
      const raw = await this.provider.generate(prompt, { jsonMode: true, temperature: 0.1, maxTokens: 256 });
      const cleaned = raw.trim().replace(/^```json\s*|\s*```$/g, '');
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed.translations) || parsed.translations.length !== terms.length) {
        return { original: terms, english: [] };
      }
      return { original: terms, english: parsed.translations.map((t: string) => String(t).toLowerCase().trim()) };
    } catch {
      return { original: terms, english: [] };
    }
  }
}
