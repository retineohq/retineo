/**
 * RETINEO Core — Compilation Pipeline
 * Phase 3: Orchestrates L1 → L2 → L3 generation via job queue.
 */

import type { CASStorage } from '../storage/cas.js';
import type { Registry } from '../storage/registry.js';
import type { ContextNodeRepository } from '../storage/context-node-repository.js';
import type { JobRecord, L2Artifact, GeneratorInfo } from '../domain/types.js';
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
  contextNodeRepository: ContextNodeRepository;
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
      throw new Error('LLM provider not configured. Run "retineo init" to set up a provider (e.g. Ollama).');
    }
    return provider;
  }

  private ensureEmbeddingProvider(): EmbeddingProvider {
    const provider = this.deps.embeddingProvider;
    if (!provider) {
      throw new Error('Embedding provider not configured. Run "retineo init" to set up a provider (e.g. Ollama).');
    }
    return provider;
  }

  private async processL1(nodeHash: string): Promise<void> {
    const { cas, l1Generator, contextNodeRepository } = this.deps;
    const { readFile, writeFile } = await import('fs/promises');

    // Load node via ContextNodeRepository (no direct CAS path construction)
    const node = await contextNodeRepository.loadByHash(nodeHash);
    if (!node) throw new Error(`Node ${nodeHash} not found in CAS`);

    // Read L0 content through CAS (artifact content lives in CAS, not in ContextNode fields)
    const objPath = cas.getObjectPath(nodeHash);
    const content = await readFile(path.join(objPath, 'content.md'), 'utf-8');

    // Skip empty sources: no point generating essence or vectors.
    if (content.trim().length === 0) {
      const l1 = await l1Generator.generate(content, node.sourceRef);
      await writeFile(path.join(objPath, 'L1.md'), l1.markdown);
      await writeFile(path.join(objPath, 'L1.index.json'), JSON.stringify(l1.index, null, 2));
      node.build.nodeVersion++;
      node.build.generators.l1 = makeGeneratorInfo('outline-parser', '1.0.0');
      await writeFile(path.join(objPath, 'node.json'), JSON.stringify(node.build, null, 2));
      this.logger.info('pipeline.l1.empty', { nodeHash, source: node.sourceRef.uri });
      return;
    }

    // Generate L1
    const l1 = await l1Generator.generate(content, node.sourceRef);

    // Write L1 artifacts to CAS
    await writeFile(path.join(objPath, 'L1.md'), l1.markdown);
    await writeFile(path.join(objPath, 'L1.index.json'), JSON.stringify(l1.index, null, 2));

    // Update build manifest via ContextNodeRepository
    node.build.nodeVersion++;
    node.build.generators.l1 = makeGeneratorInfo('outline-parser', '1.0.0');
    await writeFile(path.join(objPath, 'node.json'), JSON.stringify(node.build, null, 2));

    // Enqueue L2
    this.enqueueL2(nodeHash);
  }

  private async processL2(nodeHash: string): Promise<void> {
    const { cas, l2Generator, contextNodeRepository } = this.deps;
    const llmProvider = this.ensureLLMProvider();
    const { readFile, writeFile } = await import('fs/promises');

    // Load node via ContextNodeRepository
    const node = await contextNodeRepository.loadByHash(nodeHash);
    if (!node) throw new Error(`Node ${nodeHash} not found in CAS`);

    // Read L1 from CAS
    const objPath = cas.getObjectPath(nodeHash);
    const l1Markdown = await readFile(path.join(objPath, 'L1.md'), 'utf-8');

    // Generate L2
    const l2 = await l2Generator.generate(l1Markdown, llmProvider);

    // Write L2 artifact to CAS
    await writeFile(path.join(objPath, 'L2.json'), JSON.stringify(l2, null, 2));

    // Update build manifest via ContextNodeRepository
    node.build.nodeVersion++;
    node.build.generators.l2 = makeGeneratorInfo('semantic-extractor', '1.0.0', llmProvider);
    await writeFile(path.join(objPath, 'node.json'), JSON.stringify(node.build, null, 2));

    // Enqueue L3
    this.enqueueL3(nodeHash);
  }

  private async processL3(nodeHash: string): Promise<void> {
    const { cas, l3Generator, dataDir, contextNodeRepository } = this.deps;
    const embeddingProvider = this.ensureEmbeddingProvider();
    const { readFile, writeFile } = await import('fs/promises');

    // Load node via ContextNodeRepository
    const node = await contextNodeRepository.loadByHash(nodeHash);
    if (!node) throw new Error(`Node ${nodeHash} not found in CAS`);

    // Read L2 from CAS
    const objPath = cas.getObjectPath(nodeHash);
    const l2Artifact = JSON.parse(await readFile(path.join(objPath, 'L2.json'), 'utf-8')) as L2Artifact;
    const indexDir = path.join(dataDir, 'index');

    await l3Generator.generate(l2Artifact, embeddingProvider, nodeHash, indexDir);

    // Update build manifest via ContextNodeRepository
    node.build.nodeVersion++;
    node.build.generators.embedding = makeGeneratorInfo('embedding-indexer', '1.0.0', embeddingProvider);
    await writeFile(path.join(objPath, 'node.json'), JSON.stringify(node.build, null, 2));
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
