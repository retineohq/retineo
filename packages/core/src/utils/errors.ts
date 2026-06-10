/**
 * RETINEO Core — Standardized Error Handling
 * Phase 7: Unified error hierarchy with codes and HTTP status mapping.
 */

export interface RetineoError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  cause?: Error;
}

export class BaseRetineoError extends Error implements RetineoError {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
  cause?: Error;

  constructor(code: string, message: string, statusCode: number, details?: Record<string, unknown>, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.cause = cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

// Adapter errors
export class AdapterError extends BaseRetineoError {
  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>, cause?: Error) {
    super(code, message, statusCode, details, cause);
  }
}

export const AdapterSpawnFailed = (details?: Record<string, unknown>, cause?: Error) =>
  new AdapterError('ADAPTER_SPAWN_FAILED', 'Failed to spawn adapter process', 500, details, cause);

export const AdapterIngestFailed = (details?: Record<string, unknown>, cause?: Error) =>
  new AdapterError('ADAPTER_INGEST_FAILED', 'Adapter ingestion failed', 422, details, cause);

export const AdapterUnsupportedMime = (mimeType: string, cause?: Error) =>
  new AdapterError('ADAPTER_UNSUPPORTED_MIME', `Unsupported MIME type: ${mimeType}`, 400, { mimeType }, cause);

export const AdapterTimeout = (adapterId: string, cause?: Error) =>
  new AdapterError('ADAPTER_TIMEOUT', `Adapter timed out: ${adapterId}`, 504, { adapterId }, cause);

// Ingest errors
export class IngestError extends BaseRetineoError {
  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>, cause?: Error) {
    super(code, message, statusCode, details, cause);
  }
}

export const IngestDuplicate = (sourceId: string, cause?: Error) =>
  new IngestError('INGEST_DUPLICATE', `Source already ingested: ${sourceId}`, 409, { sourceId }, cause);

export const IngestCASWriteFailed = (hash: string, cause?: Error) =>
  new IngestError('INGEST_CAS_WRITE_FAILED', `Failed to write CAS object: ${hash}`, 500, { hash }, cause);

export const IngestRegistryFailed = (sourceId: string, cause?: Error) =>
  new IngestError('INGEST_REGISTRY_FAILED', `Failed to register source: ${sourceId}`, 500, { sourceId }, cause);

// LLM errors
export class LLMError extends BaseRetineoError {
  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>, cause?: Error) {
    super(code, message, statusCode, details, cause);
  }
}

export const LLMTimeout = (providerId: string, cause?: Error) =>
  new LLMError('LLM_TIMEOUT', `LLM provider timed out: ${providerId}`, 504, { providerId }, cause);

export const LLMRateLimited = (providerId: string, cause?: Error) =>
  new LLMError('LLM_RATE_LIMITED', `LLM provider rate limited: ${providerId}`, 429, { providerId }, cause);

export const LLMCircuitOpen = (providerId: string, cause?: Error) =>
  new LLMError('LLM_CIRCUIT_OPEN', `LLM provider circuit breaker open: ${providerId}`, 503, { providerId }, cause);

export const LLMInvalidResponse = (providerId: string, cause?: Error) =>
  new LLMError('LLM_INVALID_RESPONSE', `Invalid response from LLM provider: ${providerId}`, 502, { providerId }, cause);

export const LLMProviderDown = (providerId: string, cause?: Error) =>
  new LLMError('LLM_PROVIDER_DOWN', `LLM provider unavailable: ${providerId}`, 503, { providerId }, cause);

// Pipeline errors
export class PipelineError extends BaseRetineoError {
  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>, cause?: Error) {
    super(code, message, statusCode, details, cause);
  }
}

export const PipelineL1Failed = (hash: string, cause?: Error) =>
  new PipelineError('PIPELINE_L1_FAILED', `L1 generation failed for ${hash}`, 500, { hash }, cause);

export const PipelineL2Failed = (hash: string, cause?: Error) =>
  new PipelineError('PIPELINE_L2_FAILED', `L2 generation failed for ${hash}`, 500, { hash }, cause);

export const PipelineL3Failed = (hash: string, cause?: Error) =>
  new PipelineError('PIPELINE_L3_FAILED', `L3 generation failed for ${hash}`, 500, { hash }, cause);

export const PipelineRetryExhausted = (jobId: string, cause?: Error) =>
  new PipelineError('PIPELINE_RETRY_EXHAUSTED', `Job retry exhausted: ${jobId}`, 500, { jobId }, cause);

// Search errors
export class SearchError extends BaseRetineoError {
  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>, cause?: Error) {
    super(code, message, statusCode, details, cause);
  }
}

export const SearchEmpty = (query: string, cause?: Error) =>
  new SearchError('SEARCH_EMPTY', `No results found for query: ${query}`, 404, { query }, cause);

export const SearchTimeout = (query: string, cause?: Error) =>
  new SearchError('SEARCH_TIMEOUT', `Search timed out: ${query}`, 504, { query }, cause);

export const SearchInvalidQuery = (reason: string, cause?: Error) =>
  new SearchError('SEARCH_INVALID_QUERY', `Invalid search query: ${reason}`, 400, { reason }, cause);

// Bridge errors
export class BridgeError extends BaseRetineoError {
  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>, cause?: Error) {
    super(code, message, statusCode, details, cause);
  }
}

export const BridgeInvalidBody = (reason: string, cause?: Error) =>
  new BridgeError('BRIDGE_INVALID_BODY', `Invalid request body: ${reason}`, 400, { reason }, cause);

export const BridgeNotFound = (resource: string, id: string, cause?: Error) =>
  new BridgeError('BRIDGE_NOT_FOUND', `${resource} not found: ${id}`, 404, { resource, id }, cause);

export const BridgeShutdown = (cause?: Error) =>
  new BridgeError('BRIDGE_SHUTDOWN', 'Service is shutting down', 503, {}, cause);

// Config errors
export class ConfigError extends BaseRetineoError {
  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>, cause?: Error) {
    super(code, message, statusCode, details, cause);
  }
}

export const ConfigInvalid = (reason: string, cause?: Error) =>
  new ConfigError('CONFIG_INVALID', `Invalid configuration: ${reason}`, 400, { reason }, cause);

export const ConfigMissingKey = (key: string, cause?: Error) =>
  new ConfigError('CONFIG_MISSING_KEY', `Missing configuration key: ${key}`, 400, { key }, cause);

export const ConfigSecretNotFound = (key: string, cause?: Error) =>
  new ConfigError('CONFIG_SECRET_NOT_FOUND', `Secret not found: ${key}`, 400, { key }, cause);
