/**
 * RETINEO Core — NodeBuilder
 * Phase 1: ContextNode + BuildManifest generation
 */

import type {
  Hash,
  SourceRecord,
  ContextNode,
  BuildManifest,
  GeneratorInfo,
  SegmentRef,
  NormalizedContent,
} from '../domain/types.js';
import { computeHash } from './cas.js';

export interface NodeBuilder {
  buildRoot(
    source: SourceRecord,
    normalized: NormalizedContent,
    rawHash: Hash
  ): Promise<ContextNode>;

  buildSegments(
    parent: ContextNode,
    segments: SegmentRef[],
    source: SourceRecord
  ): Promise<ContextNode[]>;

  createBuildManifest(
    rawHash: Hash,
    contentHash: Hash,
    generatorVersions?: Record<string, string>
  ): BuildManifest;
}

const PLACEHOLDER_GENERATOR: GeneratorInfo = {
  id: 'placeholder',
  version: '0.0.0',
};

export class DefaultNodeBuilder implements NodeBuilder {
  async buildRoot(
    source: SourceRecord,
    normalized: NormalizedContent,
    rawHash: Hash
  ): Promise<ContextNode> {
    const contentHash = computeHash(normalized.content);
    const now = new Date().toISOString();

    const build: BuildManifest = this.createBuildManifest(rawHash, contentHash);

    return {
      id: contentHash,
      sourceRef: {
        protocol: source.protocol as 'file' | 'http' | 'https',
        uri: source.uri,
        mimeType: source.mimeType,
      },
      childrenIds: [],
      depth: 0,
      artifacts: {
        l0: {
          contentPath: `objects/${contentHash.slice(0, 2)}/${contentHash.slice(2)}/content.md`,
          metaPath: `objects/${contentHash.slice(0, 2)}/${contentHash.slice(2)}/content.meta.json`,
          wordCount: normalized.content.split(/\s+/).filter(Boolean).length,
          charCount: normalized.content.length,
        },
      },
      build,
      createdAt: now,
      updatedAt: now,
    };
  }

  async buildSegments(
    parent: ContextNode,
    segments: SegmentRef[],
    source: SourceRecord
  ): Promise<ContextNode[]> {
    const now = new Date().toISOString();

    return segments.map((seg, idx) => {
      const contentHash = computeHash(seg.content);
      const build: BuildManifest = this.createBuildManifest(parent.build.rawHash, contentHash);

      return {
        id: contentHash,
        sourceRef: {
          protocol: source.protocol as 'file' | 'http' | 'https',
          uri: source.uri,
          mimeType: source.mimeType,
        },
        parentId: parent.id,
        childrenIds: [],
        depth: parent.depth + 1,
        artifacts: {
          l0: {
            contentPath: `objects/${contentHash.slice(0, 2)}/${contentHash.slice(2)}/content.md`,
            metaPath: `objects/${contentHash.slice(0, 2)}/${contentHash.slice(2)}/content.meta.json`,
            wordCount: seg.content.split(/\s+/).filter(Boolean).length,
            charCount: seg.content.length,
          },
        },
        build,
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  createBuildManifest(
    rawHash: Hash,
    contentHash: Hash,
    generatorVersions: Record<string, string> = {}
  ): BuildManifest {
    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      nodeVersion: 1,
      rawHash,
      contentHash,
      generators: {
        l1: { ...PLACEHOLDER_GENERATOR, version: generatorVersions['l1'] ?? PLACEHOLDER_GENERATOR.version },
        l2: { ...PLACEHOLDER_GENERATOR, version: generatorVersions['l2'] ?? PLACEHOLDER_GENERATOR.version },
        embedding: { ...PLACEHOLDER_GENERATOR, version: generatorVersions['embedding'] ?? PLACEHOLDER_GENERATOR.version },
      },
      buildTimestamp: now,
    };
  }
}
