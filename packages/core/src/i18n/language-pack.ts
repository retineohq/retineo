/**
 * ECHO Core — Language Pack Interface
 * Phase 4: Multilingual support with per-language prompts and search tuning.
 */

export interface LanguagePack {
  code: string;
  name: string;

  /** Prompt templates in this language */
  prompts: {
    intentClassification: string;
    entityExtraction: string;
    l2Generation: string;
    contextAssembly: string;
  };

  /** Search behavior overrides */
  search: {
    defaultThreshold: number;
    keywordBoost: number;
    semanticBoost: number;
  };

  /** Script detection regex for heuristic fallback */
  scriptRegex?: RegExp;
}
