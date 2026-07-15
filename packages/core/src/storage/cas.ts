/**
 * RETINEO Core — CASStorage
 * Phase 1: Content-Addressable Storage
 */

import { mkdir, readFile, writeFile, unlink, access } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  Hash,
  ContextNode,
  SourceRef,
  ContentMeta,
  L2Artifact,
  BuildManifest,
} from '../domain/types.js';
export type NodeArtifacts = {
  content: string;
  meta: ContentMeta;
  l1?: string;
  l2?: L2Artifact;
};

export interface CASStorage {
  write(content: Buffer | string): Promise<Hash>;
  read(hash: Hash): Promise<Buffer>;
  exists(hash: Hash): boolean;
  delete(hash: Hash): Promise<void>;
  getObjectPath(hash: Hash): string;
  writeObject(node: ContextNode, artifacts: NodeArtifacts): Promise<void>;
  readObject(hash: Hash): Promise<{ node: ContextNode; artifacts: NodeArtifacts }>;
}

export function computeHash(content: string | Buffer): Hash {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function getObjectPath(dataDir: string, hash: Hash): string {
  const prefix = hash.slice(0, 2);
  const suffix = hash.slice(2);
  return path.join(dataDir, 'objects', prefix, suffix);
}

export class LocalCASStorage implements CASStorage {
  constructor(private dataDir: string) {}

  private resolvePath(hash: Hash): string {
    return getObjectPath(this.dataDir, hash);
  }

  async write(content: Buffer | string): Promise<Hash> {
    const hash = computeHash(content);
    const dir = this.resolvePath(hash);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const filePath = path.join(dir, 'artifact.bin');
    await writeFile(filePath, content);
    return hash;
  }

  async read(hash: Hash): Promise<Buffer> {
    const filePath = path.join(this.resolvePath(hash), 'artifact.bin');
    return readFile(filePath);
  }

  exists(hash: Hash): boolean {
    const dir = this.resolvePath(hash);
    return existsSync(path.join(dir, 'artifact.bin')) || existsSync(path.join(dir, 'node.json'));
  }

  async delete(hash: Hash): Promise<void> {
    const filePath = path.join(this.resolvePath(hash), 'artifact.bin');
    await unlink(filePath);
  }

  getObjectPath(hash: Hash): string {
    return this.resolvePath(hash);
  }

  async writeObject(node: ContextNode, artifacts: NodeArtifacts): Promise<void> {
    const dir = this.resolvePath(node.id);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Persist only BuildManifest in node.json. No sourcePath, sourceRef, or paths.
    await writeFile(path.join(dir, 'node.json'), JSON.stringify(node.build, null, 2));
    await writeFile(path.join(dir, 'content.md'), artifacts.content);
    await writeFile(path.join(dir, 'content.meta.json'), JSON.stringify(artifacts.meta, null, 2));

    if (artifacts.l1 !== undefined) {
      await writeFile(path.join(dir, 'L1.md'), artifacts.l1);
    }
    if (artifacts.l2 !== undefined) {
      await writeFile(path.join(dir, 'L2.json'), JSON.stringify(artifacts.l2, null, 2));
    }
  }

  async readObject(hash: Hash): Promise<{ node: ContextNode; artifacts: NodeArtifacts }> {
    const dir = this.resolvePath(hash);

    const rawManifest = JSON.parse(await readFile(path.join(dir, 'node.json'), 'utf-8'));
    if (rawManifest.schemaVersion < 2) {
      throw new Error(`Data format v${rawManifest.schemaVersion} is incompatible. Run: retineo rebuild`);
    }
    const buildManifest: BuildManifest = {
      schemaVersion: rawManifest.schemaVersion,
      nodeVersion: rawManifest.nodeVersion,
      rawHash: rawManifest.rawHash,
      contentHash: rawManifest.contentHash,
      generators: rawManifest.generators,
      buildTimestamp: rawManifest.buildTimestamp,
    };
    const content = await readFile(path.join(dir, 'content.md'), 'utf-8');
    const meta = JSON.parse(await readFile(path.join(dir, 'content.meta.json'), 'utf-8')) as ContentMeta;

    const artifacts: NodeArtifacts = { content, meta };

    const l1Path = path.join(dir, 'L1.md');
    if (existsSync(l1Path)) {
      artifacts.l1 = await readFile(l1Path, 'utf-8');
    }

    const l2Path = path.join(dir, 'L2.json');
    if (existsSync(l2Path)) {
      artifacts.l2 = JSON.parse(await readFile(l2Path, 'utf-8')) as L2Artifact;
    }

    // node.json is BuildManifest only. sourceRef is runtime-only and reconstructed from Registry.
    const sourceRef: SourceRef = { protocol: 'file', uri: '', mimeType: '' };
    const node: ContextNode = {
      id: hash,
      sourceRef,
      childrenIds: [],
      depth: 0,
      artifacts: {},
      build: buildManifest,
      createdAt: buildManifest.buildTimestamp,
      updatedAt: buildManifest.buildTimestamp,
    };

    return { node, artifacts };
  }
}
