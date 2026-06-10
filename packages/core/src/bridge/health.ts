/**
 * RETINEO Core — Health Checks
 * Phase 7: Liveness and readiness probes.
 */

import type { Registry } from '../storage/registry.js';
import type { CASStorage } from '../storage/cas.js';
import type { LLMProvider } from '../llm/provider.js';

export interface HealthResult {
  status: 'healthy' | 'unhealthy';
  checks: {
    sqlite: boolean;
    cas: boolean;
    llmProvider: boolean;
    worker: boolean;
  };
  timestamp: string;
}

export interface ReadyResult {
  ready: boolean;
  reason?: string;
  indexLoaded: boolean;
  queueHealthy: boolean;
}

export interface HealthService {
  check(): Promise<HealthResult>;
  ready(): Promise<ReadyResult>;
}

export interface HealthServiceDeps {
  registry: Registry;
  cas: CASStorage;
  llmProvider: LLMProvider;
  indexDir: string;
  shutdownManager?: { isShuttingDown(): boolean };
}

import { access } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export class DefaultHealthService implements HealthService {
  private deps: HealthServiceDeps;

  constructor(deps: HealthServiceDeps) {
    this.deps = deps;
  }

  async check(): Promise<HealthResult> {
    const checks = {
      sqlite: await this.checkSQLite(),
      cas: await this.checkCAS(),
      llmProvider: await this.checkLLM(),
      worker: await this.checkWorker(),
    };
    const status = Object.values(checks).every(Boolean) ? 'healthy' : 'unhealthy';
    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  async ready(): Promise<ReadyResult> {
    if (this.deps.shutdownManager?.isShuttingDown()) {
      return { ready: false, reason: 'Shutdown in progress', indexLoaded: false, queueHealthy: false };
    }
    const indexLoaded = this.checkIndexLoaded();
    const queueHealthy = await this.checkQueueHealthy();
    const ready = indexLoaded && queueHealthy;
    return {
      ready,
      reason: ready ? undefined : `indexLoaded=${indexLoaded}, queueHealthy=${queueHealthy}`,
      indexLoaded,
      queueHealthy,
    };
  }

  private async checkSQLite(): Promise<boolean> {
    try {
      // Registry uses better-sqlite3; if it works, SELECT 1 works
      const registryAny = this.deps.registry as unknown as { db?: { prepare: (sql: string) => { get: () => unknown } } };
      if (registryAny.db) {
        registryAny.db.prepare('SELECT 1').get();
        return true;
      }
      return true; // assume OK if we can't probe
    } catch {
      return false;
    }
  }

  private async checkCAS(): Promise<boolean> {
    try {
      const objPath = this.deps.cas.getObjectPath('healthcheck');
      // getObjectPath returns dataDir/objects/prefix/suffix; go up two levels to objects/
      const dir = path.dirname(path.dirname(objPath));
      await access(dir);
      return true;
    } catch {
      return false;
    }
  }

  private async checkLLM(): Promise<boolean> {
    try {
      return await this.deps.llmProvider.validate();
    } catch {
      return false;
    }
  }

  private async checkWorker(): Promise<boolean> {
    try {
      const pending = this.deps.registry.getPendingJobs(1);
      return pending.length < 10000;
    } catch {
      return false;
    }
  }

  private checkIndexLoaded(): boolean {
    try {
      const embeddingsPath = path.join(this.deps.indexDir, 'embeddings.jsonl');
      return existsSync(embeddingsPath);
    } catch {
      return false;
    }
  }

  private async checkQueueHealthy(): Promise<boolean> {
    try {
      const pending = this.deps.registry.getPendingJobs(1000);
      return pending.length < 1000;
    } catch {
      return false;
    }
  }
}
