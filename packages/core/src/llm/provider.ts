/**
 * ECHO Core — LLM & Embedding Provider Interfaces
 * Phase 3: Provider abstraction for LLM and embedding generation
 */

export interface ProviderConfig {
  id: string;
  type: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  concurrency?: number;
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  maxContextLength: number;
}

export interface LLMProvider {
  readonly id: string;
  readonly config: ProviderConfig;

  /** Generate text completion */
  generate(prompt: string, options?: GenerateOptions): Promise<string>;

  /** Stream text completion (optional) */
  stream?(prompt: string, options?: GenerateOptions): AsyncIterable<string>;

  /** Validate connection (ping API) */
  validate(): Promise<boolean>;

  /** Get provider capabilities */
  capabilities(): ProviderCapabilities;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly config: ProviderConfig;

  /** Generate embeddings for batch of texts */
  embed(texts: string[]): Promise<number[][]>;

  /** Validate connection */
  validate(): Promise<boolean>;

  /** Embedding dimension */
  dimension(): number;
}
