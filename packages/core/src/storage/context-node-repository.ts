/**
 * RETINEO Core — ContextNodeRepository
 * Single point of truth for loading/saving ContextNode via CAS + Registry.
 * Business logic (pipeline, retrieval) works with ContextNode, never with raw files.
 */

import type { Hash, ContextNode, BuildManifest, L2Artifact, ContentMeta } from '../domain/types.js';
import type { CASStorage } from './cas.js';
import type { Registry } from './registry.js';

export interface ContextNodeRepository {
  loadByHash(hash: Hash): Promise<ContextNode | null>;
  loadBySourcePath(path: string): Promise<ContextNode | null>;
  loadChildren(parentHash: Hash): Promise<ContextNode[]>;
  save(node: ContextNode): Promise<void>;
  buildManifest(node: ContextNode): BuildManifest;
  loadL2(hash: Hash): Promise<L2Artifact | null>;
}

export class DefaultContextNodeRepository implements ContextNodeRepository {
  constructor(
    private cas: CASStorage,
    private registry: Registry
  ) {}

  async loadByHash(hash: Hash): Promise<ContextNode | null> {
    try {
      const { node } = await this.cas.readObject(hash);
      return node;
    } catch {
      return null;
    }
  }

  async loadBySourcePath(sourcePath: string): Promise<ContextNode | null> {
    const sources = this.registry.listSources();
    const source = sources.find((s) => s.uri === sourcePath);
    if (!source) return null;
    return this.loadByHash(source.rootHash);
  }

  async loadChildren(parentHash: Hash): Promise<ContextNode[]> {
    const sources = this.registry.listSources();
    const children: ContextNode[] = [];
    for (const source of sources) {
      const node = await this.loadByHash(source.rootHash);
      if (node && node.parentId === parentHash) {
        children.push(node);
      }
    }
    return children;
  }

  async save(node: ContextNode): Promise<void> {
    // Read existing artifacts from CAS, update with node data
    let existingContent = '';
    let existingMeta: ContentMeta = { blocks: [] };
    let existingL1: string | undefined;
    let existingL2: L2Artifact | undefined;

    try {
      const { artifacts } = await this.cas.readObject(node.id);
      existingContent = artifacts.content;
      existingMeta = artifacts.meta;
      existingL1 = artifacts.l1;
      existingL2 = artifacts.l2;
    } catch {
      // Node doesn't exist yet — will be created
    }

    await this.cas.writeObject(
      node,
      {
        content: existingContent,
        meta: existingMeta,
        l1: existingL1,
        l2: existingL2,
      }
    );
  }

  buildManifest(node: ContextNode): BuildManifest {
    return node.build;
  }

  async loadL2(hash: Hash): Promise<L2Artifact | null> {
    try {
      const { artifacts } = await this.cas.readObject(hash);
      return artifacts.l2 ?? null;
    } catch {
      return null;
    }
  }
}
