/**
 * ECHO Core — ConfigManager
 * Phase 4: Extended with search, i18n, retrieval settings.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

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

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  console: boolean;
  file: boolean;
  filePath: string;
  pretty: boolean;
}

/**
 * Provider entry for LLM and embedding providers.
 * Mirrors `ProviderConfig` in `src/llm/provider.ts` plus optional
 * `fallback` (provider id to route to on circuit open) and
 * `circuitBreaker` tuning.
 */
export interface ProviderConfigEntry {
  id: string;
  type: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  concurrency?: number;
  timeoutMs?: number;
  dimension?: number;
  fallback?: string;
  circuitBreaker?: {
    failureThreshold?: number;
    recoveryTimeoutMs?: number;
    halfOpenMaxCalls?: number;
  };
  [key: string]: unknown;
}

export interface LLMConfig {
  defaultProvider: string;
  providers: ProviderConfigEntry[];
}

export interface EmbeddingConfig {
  defaultProvider: string;
  providers: ProviderConfigEntry[];
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
  llm: LLMConfig;
  embedding: EmbeddingConfig;
  bridge: { host: string; port: number };
  search: SearchConfig;
  i18n: I18nConfig;
  logging: LoggingConfig;
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

const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: 'info',
  console: true,
  file: true,
  filePath: path.join(os.homedir(), '.echo', 'logs', 'echo.log'),
  pretty: false,
};

const DEFAULT_LLM_CONFIG: LLMConfig = {
  defaultProvider: 'ollama',
  providers: [
    {
      id: 'ollama',
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'rnj-1:8b-cloud',
      temperature: 0.3,
      maxTokens: 4096,
      concurrency: 1,
      timeoutMs: 60000,
    },
  ],
};

const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  defaultProvider: 'ollama',
  providers: [
    {
      id: 'ollama',
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'nomic-embed-text',
      concurrency: 1,
      timeoutMs: 60000,
      dimension: 768,
    },
  ],
};

const DEFAULT_BRIDGE_CONFIG = { host: '127.0.0.1', port: 37891 };

const DEFAULT_CONFIG: EchoConfig = {
  dataDir: path.join(os.homedir(), '.echo'),
  defaultAdapter: 'file',
  llmProvider: 'ollama',
  embeddingModel: 'nomic-embed-text',
  llm: DEFAULT_LLM_CONFIG,
  embedding: DEFAULT_EMBEDDING_CONFIG,
  bridge: DEFAULT_BRIDGE_CONFIG,
  search: DEFAULT_SEARCH_CONFIG,
  i18n: DEFAULT_I18N_CONFIG,
  logging: DEFAULT_LOGGING_CONFIG,
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

function mergeLoggingConfig(raw: unknown): LoggingConfig {
  const l = (raw ?? {}) as Record<string, unknown>;
  return {
    level: (l.level as LoggingConfig['level']) ?? DEFAULT_LOGGING_CONFIG.level,
    console: (l.console as boolean) ?? DEFAULT_LOGGING_CONFIG.console,
    file: (l.file as boolean) ?? DEFAULT_LOGGING_CONFIG.file,
    filePath: (l.filePath as string) ?? DEFAULT_LOGGING_CONFIG.filePath,
    pretty: (l.pretty as boolean) ?? DEFAULT_LOGGING_CONFIG.pretty,
  };
}

function mergeLLMConfig(raw: unknown): LLMConfig {
  const l = (raw ?? {}) as { defaultProvider?: string; providers?: ProviderConfigEntry[] };
  return {
    defaultProvider: l.defaultProvider ?? DEFAULT_LLM_CONFIG.defaultProvider,
    providers: Array.isArray(l.providers) && l.providers.length > 0 ? l.providers : DEFAULT_LLM_CONFIG.providers,
  };
}

function mergeEmbeddingConfig(raw: unknown): EmbeddingConfig {
  const e = (raw ?? {}) as { defaultProvider?: string; providers?: ProviderConfigEntry[] };
  return {
    defaultProvider: e.defaultProvider ?? DEFAULT_EMBEDDING_CONFIG.defaultProvider,
    providers: Array.isArray(e.providers) && e.providers.length > 0 ? e.providers : DEFAULT_EMBEDDING_CONFIG.providers,
  };
}

function mergeBridgeConfig(raw: unknown): { host: string; port: number } {
  const b = (raw ?? {}) as { host?: string; port?: number };
  return {
    host: b.host ?? DEFAULT_BRIDGE_CONFIG.host,
    port: typeof b.port === 'number' ? b.port : DEFAULT_BRIDGE_CONFIG.port,
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
  configExists(): boolean;
  load(): Promise<EchoConfig>;
  save(config: EchoConfig): Promise<void>;
  initializeDataDir(): Promise<void>;
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

  configExists(): boolean {
    return existsSync(this.configPath);
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
      llm: mergeLLMConfig(parsed.llm),
      embedding: mergeEmbeddingConfig(parsed.embedding),
      bridge: mergeBridgeConfig(parsed.bridge),
      search: mergeSearchConfig(parsed.search),
      i18n: mergeI18nConfig(parsed.i18n),
      logging: mergeLoggingConfig(parsed.logging),
    };
  }

  async save(config: EchoConfig): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const raw = yaml.dump(config);
    await writeFile(this.configPath, raw, 'utf-8');
  }

  async initializeDataDir(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(path.join(this.dataDir, 'objects'), { recursive: true });
    await mkdir(path.join(this.dataDir, 'index'), { recursive: true });
    await mkdir(path.join(this.dataDir, 'adapters'), { recursive: true });
    await mkdir(path.join(this.dataDir, 'models'), { recursive: true });
    await mkdir(path.join(this.dataDir, 'logs'), { recursive: true });

    if (!this.configExists()) {
      await this.save(DEFAULT_CONFIG);
    }

    await this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    const dbPath = path.join(this.dataDir, 'echo.sqlite');
    const db = new Database(dbPath);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    if (tables.length === 0) {
      const schemaPath = this.resolveSchemaPath();
      const schema = readFileSync(schemaPath, 'utf-8');
      db.exec(schema);
    }

    db.close();
  }

  private resolveSchemaPath(): string {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const distPath = path.join(__dirname, 'schema.sql');
    const srcPath = path.join(__dirname, '..', '..', '..', 'core', 'src', 'storage', 'schema.sql');

    if (existsSync(distPath)) return distPath;
    if (existsSync(srcPath)) return srcPath;

    throw new Error('schema.sql not found. Expected at: ' + distPath);
  }
}
