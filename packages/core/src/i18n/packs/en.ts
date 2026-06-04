/**
 * ECHO Core — English Language Pack
 * Phase 4: Default language pack with all prompt templates.
 */

import type { LanguagePack } from '../language-pack.js';

export const enPack: LanguagePack = {
  code: 'en',
  name: 'English',
  prompts: {
    intentClassification: `Classify the query intent as one of: VAGUE (broad topic), SECTION (specific section), or PRECISION (exact fact).

Query: {query}
Language: {language}

Respond with valid JSON only:
{"intent": "vague|section|precision", "reason": "brief explanation"}`,

    entityExtraction: `Extract key entities and pronouns from the query.

Query: {query}
Language: {language}

Respond with valid JSON only:
{"entities": ["..."], "pronouns": ["..."]}`,

    l2Generation: `You are a knowledge extraction engine. Given a structured document outline, produce a semantic summary in JSON format.

Document:
{document}

Respond with valid JSON only:
{
  "summary": "2-3 paragraph semantic summary",
  "concepts": ["concept 1", "concept 2", ...],
  "entities": ["entity 1", "entity 2", ...],
  "claims": ["factual claim 1", "factual claim 2", ...],
  "relations": [
    {"source": "concept A", "target": "concept B", "type": "depends_on"}
  ]
}`,

    contextAssembly: `You are a context assembler. Given search results, produce a coherent context for the LLM to answer the user's query.

Query: {query}
Language: {language}

Results:
{results}

Rules:
- Cite sources using [[sourceId]] format
- Respect token budget: {maxTokens}
- Prioritize exact matches over summaries`,
  },
  search: {
    defaultThreshold: 0.75,
    keywordBoost: 1.0,
    semanticBoost: 1.0,
  },
};
