/**
 * CLI Ghost Commands Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { CLICommands } from '../../packages/core/src/cli/commands.js';
import { LocalCASStorage, computeHash } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import { DefaultL1Generator } from '../../packages/core/src/layers/l1-generator.js';
import { DefaultL2Generator } from '../../packages/core/src/layers/l2-generator.js';
import { DefaultL3Generator } from '../../packages/core/src/layers/l3-generator.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import type { ContextNode, SourceRecord } from '../../packages/core/src/domain/types.js';

describe('CLI Ghost Commands', () => {
  let tmpDir: string;
  let cas: LocalCASStorage;
  let registry: SQLiteRegistry;
  let commands: CLICommands;
  const llmProvider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test' });
  const embedProvider = new MockLLMProvider({ id: 'mock-embed', type: 'mock', model: 'test-embed', dimension: 384 });

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-ghost-cli-'));
    cas = new LocalCASStorage(tmpDir);
    registry = new SQLiteRegistry(path.join(tmpDir, 'registry.sqlite'));

    commands = new CLICommands({
      ingestionService: null as any,
      retrievalService: null as any,
      queryAnalyzer: null as any,
      contextAssembler: null as any,
      registry,
      configManager: null as any,
      pipeline: null as any,
      secretsManager: null as any,
      cas,
      version: '0.2.0-test',
    });
  });

  afterEach(() => {
    registry.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ghostList — outputs empty state', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await commands.ghostList();
    expect(consoleSpy).toHaveBeenCalledWith('No orphaned objects found.');
    consoleSpy.mockRestore();
  });

  it('ghostList — outputs orphan table', async () => {
    const hash = computeHash('test');
    registry.insertOrphan(hash, 'src-test', '/test.md');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await commands.ghostList();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 orphaned'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(hash));
    consoleSpy.mockRestore();
  });
});
