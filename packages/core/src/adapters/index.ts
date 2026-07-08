/**
 * RETINEO Core — Adapter IPC Layer
 * Phase 2: Transport, Runner, Manager, IngestionService
 */

export * from './protocol.js';
export * from './transport.js';
export * from './runner.js';
export * from './manager.js';
export * from './source-adapter.js';
export * from './filesystem-adapter.js';
export * from './mock-registry.js';
export { DefaultIngestionService, type IngestionService, type IngestResult, type SyncResult } from '../services/ingestion-service.js';
