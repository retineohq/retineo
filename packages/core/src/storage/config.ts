/**
 * ECHO Core — ConfigManager
 * Phase 1: YAML config persistence
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

export interface EchoConfig {
  dataDir: string;
  defaultAdapter: string;
  llmProvider: string;
  embeddingModel: string;
}

const DEFAULT_CONFIG: EchoConfig = {
  dataDir: path.join(os.homedir(), '.echo'),
  defaultAdapter: 'file',
  llmProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
};

export interface ConfigManager {
  getDataDir(): string;
  getConfigPath(): string;
  load(): Promise<EchoConfig>;
  save(config: EchoConfig): Promise<void>;
}

export class FileConfigManager implements ConfigManager {
  private configPath: string;
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_CONFIG.dataDir;
    this.configPath = path.join(this.dataDir, 'config.yaml');
  }

  getDataDir(): string {
    return this.dataDir;
  }

  getConfigPath(): string {
    return this.configPath;
  }

  async load(): Promise<EchoConfig> {
    if (!existsSync(this.configPath)) {
      await this.save(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }
    const raw = await readFile(this.configPath, 'utf-8');
    const parsed = yaml.load(raw) as Partial<EchoConfig>;
    return {
      dataDir: parsed.dataDir ?? DEFAULT_CONFIG.dataDir,
      defaultAdapter: parsed.defaultAdapter ?? DEFAULT_CONFIG.defaultAdapter,
      llmProvider: parsed.llmProvider ?? DEFAULT_CONFIG.llmProvider,
      embeddingModel: parsed.embeddingModel ?? DEFAULT_CONFIG.embeddingModel,
    };
  }

  async save(config: EchoConfig): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const raw = yaml.dump(config);
    await writeFile(this.configPath, raw, 'utf-8');
  }
}
