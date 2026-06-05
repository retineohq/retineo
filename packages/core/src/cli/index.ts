#!/usr/bin/env node
/**
 * ECHO Core — CLI Entry Point
 * Phase 7: Commander-based CLI with key management.
 */

import { Command } from 'commander';
import { CLICommands } from './commands.js';
import type { CLICommandsDeps } from './commands.js';

export function createCLI(deps: CLICommandsDeps): Command {
  const commands = new CLICommands(deps);
  const program = new Command();

  program.name('echo').description('ECHO Core CLI').version(deps.version);

  program
    .command('ingest <filePath>')
    .description('Ingest a file into the knowledge base')
    .option('-a, --adapter <id>', 'Force specific adapter')
    .action(async (filePath: string, options: { adapter?: string }) => {
      await commands.ingest(filePath, { adapter: options.adapter });
    });

  program
    .command('search <query>')
    .description('Search the knowledge base')
    .option('-l, --language <code>', 'Override language detection')
    .option('-m, --mode <mode>', 'Search mode: semantic, keyword, hybrid')
    .option('-k, --top-k <n>', 'Number of results', parseInt)
    .option('--json', 'Output raw JSON')
    .action(async (query: string, options: { language?: string; mode?: 'semantic' | 'keyword' | 'hybrid'; topK?: number; json?: boolean }) => {
      await commands.search(query, options);
    });

  program
    .command('status')
    .description('Show engine status')
    .action(async () => {
      await commands.status();
    });

  program
    .command('compile [filePath]')
    .description('Compile pending jobs or a specific file')
    .option('--layer <layer>', 'Compile only specific layer')
    .action(async (filePath?: string) => {
      await commands.compile(filePath);
    });

  program
    .command('config [key] [value]')
    .description('Read or write configuration values')
    .action(async (key?: string, value?: string) => {
      await commands.config(key, value);
    });

  program
    .command('jobs')
    .description('List recent jobs')
    .action(async () => {
      await commands.jobs();
    });

  program
    .command('recover <hash>')
    .description('Recover an orphaned node')
    .action(async (hash: string) => {
      await commands.recover(hash);
    });

  // Key management
  const keyCmd = program.command('key').description('Manage API keys and secrets');

  keyCmd
    .command('set <provider> <apiKey>')
    .description('Encrypt and store an API key')
    .action(async (provider: string, apiKey: string) => {
      await commands.keySet(provider, apiKey);
    });

  keyCmd
    .command('get <provider>')
    .description('Show masked API key')
    .action(async (provider: string) => {
      await commands.keyGet(provider);
    });

  keyCmd
    .command('delete <provider>')
    .description('Delete stored API key')
    .action(async (provider: string) => {
      await commands.keyDelete(provider);
    });

  keyCmd
    .command('list')
    .description('List all stored keys (masked)')
    .action(async () => {
      await commands.keyList();
    });

  program
    .command('doctor')
    .description('Check external dependencies (ffmpeg, tesseract, whisper key, ollama)')
    .action(async () => {
      await commands.doctor();
    });

  return program;
}

export * from './commands.js';
export * from './formatters.js';
