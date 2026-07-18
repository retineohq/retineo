/**
 * RETINEO Core — Storage Interfaces
 * Phase 8: Content-addressable storage abstractions.
 */

import type { Hash } from '../domain/types.js';

/**
 * Raw content-addressable store. No paths, no source metadata.
 * Key = SHA-256(content). Value = bytes.
 */
export interface ContentStore {
  read(hash: Hash): Promise<Buffer>;
  write(hash: Hash, data: Buffer): Promise<void>;
  exists(hash: Hash): boolean;
  delete(hash: Hash): Promise<void>;
}

export type SourceStatus = 'active' | 'ghost' | 'deleted';

/**
 * Registry entry: maps an external source identity to a content hash.
 * One contentHash may have many RegistryEntries (deduplication across sources).
 */
export interface RegistryEntry {
  sourceId: string;      // e.g. "filesystem", "s3-bucket-alpha"
  externalId: string;    // path or key in the source's namespace
  contentHash: Hash;     // SHA-256 of L0 body (CAS key)
  etag: string;          // source-specific version tag
  status: SourceStatus;
  deletedAt: number | null;
  lastSeenAt: number;
  createdAt: number;
  retentionPolicy: string;
  sensitivityLevel: string;
  encryptionKeyId: string | null;
}

/**
 * Mutable registry of source → content mappings.
 * Synchronous because the SQLite implementation uses better-sqlite3.
 */
export interface RegistryStore {
  get(sourceId: string, externalId: string): RegistryEntry | null;
  set(entry: RegistryEntry): void;
  listByContentHash(hash: Hash): RegistryEntry[];
  listBySourceId(sourceId: string): RegistryEntry[];
}
