/**
 * ECHO Core — ConfigManager
 * Phase 4: Extended with search, i18n, retrieval settings.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

export interface SearchConfig {
  defaultLanguage: string;
  languageDetection: {
    provider: 'franc' | 'cld3' | 'heuristic';
    fallback: 'franc' | 'cld3' | 'heuristic';
    confidenceThreshold: number;
  };
  semantic: {
    topK: number;
    threshold: number;
    hybridWeight: number;
  };
  rerank: {
    topK: number;
    weights: {
      concept: number;
      claim: number;
      summary: number;
      language: number;
    };
  };
  cascade: {
    budgets: {
      vague: number;
      section: number;
      precision: number;
    };
  };
  citations: {
    format: 'markdown' | 'plain' | 'json';
    includeLineNumbers: boolean;
    includeTimestamps: boolean;
  };
  prompts: {
    intentClassification?: string;
    entityExtraction?: string;
    contextAssembly?: string;
  };
  crossLingual: {
    enabled: boolean;
  };
}

export interface I18nPackConfig {
  code: string;
  file?: string;
  prompts?: Partial<SearchConfig['prompts']>;
}

export interface I18nConfig {
  defaultLanguage: string;
  packs: I18nPackConfig[];
}

export interface EchoConfig {
  dataDir: string;
  defaultAdapter: string;
  llmProvider: string;
  embeddingModel: string;
  search: SearchConfig;
  i18n: I18nConfig;
}

const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  defaultLanguage: 'en',
  languageDetection: {
    provider: 'franc',
    fallback: 'heuristic',
    confidenceThreshold: 0.7,
  },
  semantic: {
    topK: 100,
    threshold: 0.75,
    hybridWeight: 0.7,
  },
  rerank: {
    topK: 10,
    weights: {
      concept: 1.0,
      claim: 0.5,
      summary: 0.8,
      language: 0.3,
    },
  },
  cascade: {
    budgets: {
      vague: 500,
      section: 800,
      precision: 1500,
    },
  },
  citations: {
    format: 'markdown',
    includeLineNumbers: true,
    includeTimestamps: true,
  },
  prompts: {},
  crossLingual: {
    enabled: true,
  },
};

const DEFAULT_I18N_CONFIG: I18nConfig = {
  defaultLanguage: 'en',
  packs: [],
};

const DEFAULT_CONFIG: EchoConfig = {
  dataDir: path.join(os.homedir(), '.echo'),
  defaultAdapter: 'file',
  llmProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  search: DEFAULT_SEARCH_CONFIG,
  i18n: DEFAULT_I18N_CONFIG,
};

function mergeSearchConfig(raw: unknown): SearchConfig {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    defaultLanguage: (s.defaultLanguage as string) ?? DEFAULT_SEARCH_CONFIG.defaultLanguage,
    languageDetection: {
      provider: (s.languageDetection as Record<string, unknown>)?.provider as 'franc' | 'cld3' | 'heuristic' ?? DEFAULT_SEARCH_CONFIG.languageDetection.provider,
      fallback: (s.languageDetection as Record<string, unknown>)?.fallback as 'franc' | 'cld3' | 'heuristic' ?? DEFAULT_SEARCH_CONFIG.languageDetection.fallback,
      confidenceThreshold: (s.languageDetection as Record<string, unknown>)?.confidenceThreshold as number ?? DEFAULT_SEARCH_CONFIG.languageDetection.confidenceThreshold,
    },
    semantic: {
      topK: (s.semantic as Record<string, unknown>)?.topK as number ?? DEFAULT_SEARCH_CONFIG.semantic.topK,
      threshold: (s.semantic as Record<string, unknown>)?.threshold as number ?? DEFAULT_SEARCH_CONFIG.semantic.threshold,
      hybridWeight: (s.semantic as Record<string, unknown>)?.hybridWeight as number ?? DEFAULT_SEARCH_CONFIG.semantic.hybridWeight,
    },
    rerank: {
      topK: (s.rerank as Record<string, unknown>)?.topK as number ?? DEFAULT_SEARCH_CONFIG.rerank.topK,
      weights: {
        concept: ((s.rerank as Record<string, unknown>)?.weights as Record<string, number>)?.concept ?? DEFAULT_SEARCH_CONFIG.rerank.weights.concept,
        claim: ((s.rerank as Record<string, unknown>)?.weights as Record<string, number>)?.claim ?? DEFAULT_SEARCH_CONFIG.rerank.weights.claim,
        summary: ((s.rerank as Record<string, unknown>)?.weights as Record<string, number>)?.summary ?? DEFAULT_SEARCH_CONFIG.rerank.weights.summary,
        language: ((s.rerank as Record<string, unknown>)?.weights as Record<string, number>)?.language ?? DEFAULT_SEARCH_CONFIG.rerank.weights.language,
      },
    },
    cascade: {
      budgets: {
        vague: ((s.cascade as Record<string, unknown>)?.budgets as Record<string, number>)?.vague ?? DEFAULT_SEARCH_CONFIG.cascade.budgets.vague,
        section: ((s.cascade as Record<string, unknown>)?.budgets as Record<string, number>)?.section ?? DEFAULT_SEARCH_CONFIG.cascade.budgets.section,
        precision: ((s.cascade as Record<string, unknown>)?.budgets as Record<string, number>)?.precision ?? DEFAULT_SEARCH_CONFIG.cascade.budgets.precision,
      },
    },
    citations: {
      format: (s.citations as Record<string, unknown>)?.format as 'markdown' | 'plain' | 'json' ?? DEFAULT_SEARCH_CONFIG.citations.format,
      includeLineNumbers: (s.citations as Record<string, unknown>)?.includeLineNumbers as boolean ?? DEFAULT_SEARCH_CONFIG.citations.includeLineNumbers,
      includeTimestamps: (s.citations as Record<string, unknown>)?.includeTimestamps as boolean ?? DEFAULT_SEARCH_CONFIG.citations.includeTimestamps,
    },
    prompts: {
      intentClassification: (s.prompts as Record<string, string>)?.intentClassification ?? DEFAULT_SEARCH_CONFIG.prompts.intentClassification,
      entityExtraction: (s.prompts as Record<string, string>)?.entityExtraction ?? DEFAULT_SEARCH_CONFIG.prompts.entityExtraction,
      contextAssembly: (s.prompts as Record<string, string>)?.contextAssembly ?? DEFAULT_SEARCH_CONFIG.prompts.contextAssembly,
    },
    crossLingual: {
      enabled: (s.crossLingual as Record<string, unknown>)?.enabled as boolean ?? DEFAULT_SEARCH_CONFIG.crossLingual.enabled,
    },
  };
}

function mergeI18nConfig(raw: unknown): I18nConfig {
  const i = (raw ?? {}) as Record<string, unknown>;
  const packs = (i.packs as I18nPackConfig[] | undefined) ?? DEFAULT_I18N_CONFIG.packs;
  return {
    defaultLanguage: (i.defaultLanguage as string) ?? DEFAULT_I18N_CONFIG.defaultLanguage,
    packs,
  };
}

export interface ConfigManager {
  getDataDir(): string;
  getConfigPath(): string;
  load(): Promise<EchoConfig>;
  save(config: EchoConfig): Promise<void>;
}

export class FileConfigManager implements ConfigManager {
  private configPath: string;
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_CONFIG.dataDir;
    this.configPath = path.join(this.dataDir, 'config.yaml');
  }

  getDataDir(): string {
    return this.dataDir;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  async load(): Promise<EchoConfig> {
    if (!existsSync(this.configPath)) {
      await this.save(DEFAULT_CONFIG);
      return structuredClone(DEFAULT_CONFIG);
    }
    const raw = await readFile(this.configPath, 'utf-8');
    const parsed = yaml.load(raw) as Partial<EchoConfig> & Record<string, unknown>;
    return {
      dataDir: parsed.dataDir ?? DEFAULT_CONFIG.dataDir,
      defaultAdapter: parsed.defaultAdapter ?? DEFAULT_CONFIG.defaultAdapter,
      llmProvider: parsed.llmProvider ?? DEFAULT_CONFIG.llmProvider,
      embeddingModel: parsed.embeddingModel ?? DEFAULT_CONFIG.embeddingModel,
      search: mergeSearchConfig(parsed.search),
      i18n: mergeI18nConfig(parsed.i18n),
    };
  }

  async save(config: EchoConfig): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const raw = yaml.dump(config);
    await writeFile(this.configPath, raw, 'utf-8');
  }
}
