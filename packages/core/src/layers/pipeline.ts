/**
 * ECHO Core — Compilation Pipeline
 * Phase 3: Orchestrates L1 → L2 → L3 generation via job queue.
 */

import type { CASStorage } from '../storage/cas.js';
import type { Registry } from '../storage/registry.js';
import type { JobRecord, Hash, BuildManifest, L2Artifact, GeneratorInfo } from '../domain/types.js';
import type { LLMProvider, EmbeddingProvider } from '../llm/provider.js';
import type { L1Generator } from './l1-generator.js';
import type { L2Generator } from './l2-generator.js';
import type { L3Generator } from './l3-generator.js';
import { randomUUID } from 'crypto';
import path from 'path';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface CompilationPipeline {
  processJob(job: JobRecord): Promise<void>;
  enqueueL1(nodeHash: string, sourceId?: string): void;
  enqueueL2(nodeHash: string): void;
  enqueueL3(nodeHash: string): void;
}

export interface CompilationPipelineDeps {
  cas: CASStorage;
  registry: Registry;
  l1Generator: L1Generator;
  l2Generator: L2Generator;
  l3Generator: L3Generator;
  llmProvider: LLMProvider | null;
  embeddingProvider: EmbeddingProvider | null;
  dataDir: string;
  logger?: Logger;
}

function makeGeneratorInfo(id: string, version: string, provider?: LLMProvider | EmbeddingProvider): GeneratorInfo {
  return {
    id,
    version,
    provider: provider?.id,
    model: provider?.config.model,
  };
}

async function readNodeBuildManifest(cas: CASStorage, nodeHash: Hash): Promise<BuildManifest> {
  const objPath = cas.getObjectPath(nodeHash);
  const { readFile } = await import('fs/promises');
  const raw = await readFile(path.join(objPath, 'node.json'), 'utf-8');
  return JSON.parse(raw) as BuildManifest;
}

async function writeNodeBuildManifest(cas: CASStorage, nodeHash: Hash, manifest: BuildManifest): Promise<void> {
  const objPath = cas.getObjectPath(nodeHash);
  const { writeFile } = await import('fs/promises');
  await writeFile(path.join(objPath, 'node.json'), JSON.stringify(manifest, null, 2));
}

export class DefaultCompilationPipeline implements CompilationPipeline {
  private deps: CompilationPipelineDeps;
  private logger: Logger;

  constructor(deps: CompilationPipelineDeps) {
    this.deps = deps;
    this.logger = deps.logger ?? getGlobalLogger().child({ layer: 'pipeline' });
  }

  async processJob(job: JobRecord): Promise<void> {
    const payload = JSON.parse(job.payload) as { nodeId: string; sourceId?: string };
    const nodeHash = payload.nodeId;
    this.logger.info(`pipeline.${job.type.toLowerCase()}.start`, { jobId: job.id, nodeHash });

    try {
      switch (job.type) {
        case 'GENERATE_L1':
          await this.processL1(nodeHash);
          break;
        case 'GENERATE_L2':
          await this.processL2(nodeHash);
          break;
        case 'GENERATE_L3':
          await this.processL3(nodeHash);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
      this.logger.info('pipeline.complete', { jobId: job.id, nodeHash, type: job.type });
    } catch (err) {
      this.logger.error('pipeline.retry', { jobId: job.id, nodeHash, type: job.type, error: String(err) });
      throw err;
    }
  }

  private ensureLLMProvider(): LLMProvider {
    const provider = this.deps.llmProvider;
    if (!provider) {
      throw new Error('LLM provider not configured. Run "echoc init" to set up a provider (e.g. Ollama).');
    }
    return provider;
  }

  private ensureEmbeddingProvider(): EmbeddingProvider {
    const provider = this.deps.embeddingProvider;
    if (!provider) {
      throw new Error('Embedding provider not configured. Run "echoc init" to set up a provider (e.g. Ollama).');
    }
    return provider;
  }

  private async processL1(nodeHash: string): Promise<void> {
    const { cas, l1Generator } = this.deps;
    const objPath = cas.getObjectPath(nodeHash);
    const { readFile, writeFile } = await import('fs/promises');

    const content = await readFile(path.join(objPath, 'content.md'), 'utf-8');
    const l1 = await l1Generator.generate(content);

    await writeFile(path.join(objPath, 'L1.md'), l1.markdown);
    await writeFile(path.join(objPath, 'L1.index.json'), JSON.stringify(l1.index, null, 2));

    // Update build manifest
    const manifest = await readNodeBuildManifest(cas, nodeHash);
    manifest.nodeVersion++;
    manifest.generators.l1 = makeGeneratorInfo('outline-parser', '1.0.0');
    await writeNodeBuildManifest(cas, nodeHash, manifest);

    // Enqueue L2
    this.enqueueL2(nodeHash);
  }

  private async processL2(nodeHash: string): Promise<void> {
    const { cas, l2Generator } = this.deps;
    const llmProvider = this.ensureLLMProvider();
    const objPath = cas.getObjectPath(nodeHash);
    const { readFile, writeFile } = await import('fs/promises');

    const l1Markdown = await readFile(path.join(objPath, 'L1.md'), 'utf-8');
    const l2 = await l2Generator.generate(l1Markdown, llmProvider);

    await writeFile(path.join(objPath, 'L2.json'), JSON.stringify(l2, null, 2));

    // Update build manifest
    const manifest = await readNodeBuildManifest(cas, nodeHash);
    manifest.nodeVersion++;
    manifest.generators.l2 = makeGeneratorInfo('semantic-extractor', '1.0.0', llmProvider);
    await writeNodeBuildManifest(cas, nodeHash, manifest);

    // Enqueue L3
    this.enqueueL3(nodeHash);
  }

  private async processL3(nodeHash: string): Promise<void> {
    const { cas, l3Generator, dataDir } = this.deps;
    const embeddingProvider = this.ensureEmbeddingProvider();
    const objPath = cas.getObjectPath(nodeHash);
    const { readFile } = await import('fs/promises');

    const l2Artifact = JSON.parse(await readFile(path.join(objPath, 'L2.json'), 'utf-8')) as L2Artifact;
    const indexDir = path.join(dataDir, 'index');

    await l3Generator.generate(l2Artifact, embeddingProvider, nodeHash, indexDir);

    // Update build manifest
    const manifest = await readNodeBuildManifest(cas, nodeHash);
    manifest.nodeVersion++;
    manifest.generators.embedding = makeGeneratorInfo('embedding-indexer', '1.0.0', embeddingProvider);
    await writeNodeBuildManifest(cas, nodeHash, manifest);
  }

  enqueueL1(nodeHash: string, sourceId?: string): void {
    const job: JobRecord = {
      id: randomUUID(),
      type: 'GENERATE_L1',
      payload: JSON.stringify({ nodeId: nodeHash, sourceId }),
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      status: 'PENDING',
      leaseUntil: null,
      workerId: null,
      heartbeatAt: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
    this.deps.registry.insertJob(job);
  }

  enqueueL2(nodeHash: string): void {
    const job: JobRecord = {
      id: randomUUID(),
      type: 'GENERATE_L2',
      payload: JSON.stringify({ nodeId: nodeHash }),
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      status: 'PENDING',
      leaseUntil: null,
      workerId: null,
      heartbeatAt: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
    this.deps.registry.insertJob(job);
  }

  enqueueL3(nodeHash: string): void {
    const job: JobRecord = {
      id: randomUUID(),
      type: 'GENERATE_L3',
      payload: JSON.stringify({ nodeId: nodeHash }),
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      status: 'PENDING',
      leaseUntil: null,
      workerId: null,
      heartbeatAt: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
    this.deps.registry.insertJob(job);
  }
}
