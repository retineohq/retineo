/**
 * RETINEO Core — Public API
 * Phase 0: Type exports
 */

export * from './domain/types.js';
export * from './domain/schemas.js';
export * from './adapters/protocol.js';
export * from './search/similarity-service.js';
export * from './health/types.js';
export {
  createCore,
  type CoreHandle,
  type CreateCoreOptions,
  type DocumentSummary,
  type NodeArtifacts,
  type IngestResult,
} from './runtime/index.js';
// `IngestResult` is already exported by `./adapters/protocol.js`; expose the
// runtime result shape under an alias to avoid a breaking name collision.
export type { IngestResult as RuntimeIngestResult } from './runtime/index.js';
