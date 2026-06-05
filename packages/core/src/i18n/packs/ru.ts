/**
 * ECHO Core — Russian Language Pack
 * Phase 4: Prompt templates and search tuning for Russian.
 */

import type { LanguagePack } from '../language-pack.js';

export const ruPack: LanguagePack = {
  code: 'ru',
  name: 'Русский',
  prompts: {
    intentClassification: `Классифицируйте намерение запроса как одно из: VAGUE (общая тема), SECTION (конкретный раздел), PRECISION (точный факт).

Запрос: {query}
Язык: {language}

Ответьте только валидным JSON:
{"intent": "vague|section|precision", "reason": "краткое объяснение"}`,

    entityExtraction: `Извлеките ключевые сущности и местоимения из запроса.

Запрос: {query}
Язык: {language}

Ответьте только валидным JSON:
{"entities": ["..."], "pronouns": ["..."]}`,

    l2Generation: `Вы — движок извлечения знаний. На основе структурированного документа создайте семантическое резюме в формате JSON.

Документ:
{document}

Ответьте только валидным JSON:
{
  "summary": "2-3 абзаца семантического резюме",
  "concepts": ["концепция 1", "концепция 2", ...],
  "entities": ["сущность 1", "сущность 2", ...],
  "claims": ["фактическое утверждение 1", "фактическое утверждение 2", ...],
  "relations": [
    {"source": "концепция А", "target": "концепция Б", "type": "depends_on"}
  ]
}`,

    contextAssembly: `Вы — сборщик контекста. На основе результатов поиска создайте связный контекст для ответа на запрос пользователя.

Запрос: {query}
Язык: {language}

Результаты:
{results}

Правила:
- Цитируйте источники в формате [[sourceId]]
- Уважайте лимит токенов: {maxTokens}
- Приоритет точным совпадениям перед резюме`,
  },
  search: {
    defaultThreshold: 0.72,
    keywordBoost: 1.1,
    semanticBoost: 1.0,
  },
  scriptRegex: /[\u0400-\u04FF]/,
};
