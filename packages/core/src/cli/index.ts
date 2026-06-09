#!/usr/bin/env node
/**
 * ECHO Core — CLI Entry Point
 * Phase 8: Worker/bridge/daemon lifecycle, --watch flag, interactive init wizard.
 */

import { Command } from 'commander';
import { CLICommands } from './commands.js';
import type { CLICommandsDeps } from './commands.js';

export function createCLI(deps: CLICommandsDeps): Command {
  const commands = new CLICommands(deps);
  const program = new Command();

  program
    .name('echoc')
    .description('ECHO Core CLI')
    .version(deps.version)
    .option('-v, --verbose', 'Enable verbose debug output to console (pretty-printed)')
    .hook('preAction', (thisCommand) => {
      const verbose = thisCommand.opts().verbose;
      if (verbose) {
        process.env.ECHO_LOG_LEVEL = 'debug';
        process.env.ECHO_LOG_CONSOLE = 'true';
        process.env.ECHO_LOG_PRETTY = 'true';
      }
    });

  program
    .command('ingest <paths...>')
    .description('Ingest one or more files into the knowledge base (supports globs)')
    .option('-a, --adapter <id>', 'Force specific adapter')
    .option('-w, --watch', 'Block until all jobs for this file are COMPLETED')
    .option('-t, --timeout <seconds>', 'Watch timeout in seconds (default 1800)', parseInt)
    .action(async (paths: string[], options: { adapter?: string; watch?: boolean; timeout?: number }) => {
      await commands.ingestBatch(paths, { adapter: options.adapter, watch: options.watch, timeout: options.timeout });
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
    .option('--provider <id>', 'Override LLM provider for this compilation')
    .option('-w, --watch', 'Block until all queued jobs are COMPLETED')
    .option('-t, --timeout <seconds>', 'Watch timeout in seconds (default 1800)', parseInt)
    .action(async (filePath?: string, options?: { layer?: string; provider?: string; watch?: boolean; timeout?: number }) => {
      await commands.compile(filePath, { layer: options?.layer, provider: options?.provider, watch: options?.watch, timeout: options?.timeout });
    });

  const configCmd = program.command('config').description('Read or write configuration values');

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      await commands.configSet(key, value);
    });

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key: string) => {
      await commands.configGet(key);
    });

  configCmd
    .command('list')
    .description('List all configuration values')
    .action(async () => {
      await commands.configList();
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
    .command('init')
    .description('Initialize ECHO Core (interactive setup wizard)')
    .option('--non-interactive', 'Initialize using environment variables (no prompts)')
    .option('--llm-model <model>', 'LLM model name (required with --non-interactive)')
    .option('--embed-model <model>', 'Embedding model name (required with --non-interactive)')
    .action(async (options: { nonInteractive?: boolean; llmModel?: string; embedModel?: string }) => {
      await commands.init({ nonInteractive: options.nonInteractive, llmModel: options.llmModel, embedModel: options.embedModel });
    });

  program
    .command('doctor')
    .description('Check external dependencies (ffmpeg, tesseract, whisper key, ollama)')
    .action(async () => {
      await commands.doctor();
    });

  // Worker lifecycle
  const workerCmd = program.command('worker').description('Manage the background compilation worker');

  workerCmd
    .command('start')
    .description('Start the worker as a background process')
    .action(async () => {
      await commands.workerStart();
    });

  workerCmd
    .command('stop')
    .description('Stop the background worker (SIGTERM, then SIGKILL)')
    .action(async () => {
      await commands.workerStop();
    });

  workerCmd
    .command('status')
    .description('Show worker status, PID, job counts, last heartbeat')
    .action(async () => {
      await commands.workerStatus();
    });

  workerCmd
    .command('logs')
    .description('Show recent worker log lines (use -f to follow)')
    .option('-f, --follow', 'Stream logs (tail -f)')
    .option('-n, --lines <n>', 'Number of lines to show (default 50)', parseInt)
    .action(async (options: { follow?: boolean; lines?: number }) => {
      await commands.workerLogs({ follow: options.follow, lines: options.lines });
    });

  // Bridge lifecycle
  const bridgeCmd = program.command('bridge').description('Manage the HTTP API bridge');

  bridgeCmd
    .command('start')
    .description('Start the bridge HTTP server as a background process')
    .action(async () => {
      await commands.bridgeStart();
    });

  bridgeCmd
    .command('stop')
    .description('Stop the bridge (SIGTERM, then SIGKILL)')
    .action(async () => {
      await commands.bridgeStop();
    });

  bridgeCmd
    .command('status')
    .description('Show bridge status, PID, port')
    .action(async () => {
      await commands.bridgeStatus();
    });

  bridgeCmd
    .command('logs')
    .description('Show recent bridge log lines')
    .option('-f, --follow', 'Stream logs (tail -f)')
    .option('-n, --lines <n>', 'Number of lines to show (default 50)', parseInt)
    .action(async (options: { follow?: boolean; lines?: number }) => {
      await commands.bridgeLogs({ follow: options.follow, lines: options.lines });
    });

  // Daemon (bridge + worker in one process)
  const daemonCmd = program.command('daemon').description('Manage the all-in-one daemon (bridge + worker)');

  daemonCmd
    .command('start')
    .description('Start the daemon (bridge + worker in one process)')
    .action(async () => {
      await commands.daemonStart();
    });

  daemonCmd
    .command('stop')
    .description('Stop the daemon')
    .action(async () => {
      await commands.daemonStop();
    });

  daemonCmd
    .command('status')
    .description('Show daemon status')
    .action(async () => {
      await commands.daemonStatus();
    });

  daemonCmd
    .command('logs')
    .description('Show recent daemon log lines')
    .option('-f, --follow', 'Stream logs (tail -f)')
    .option('-n, --lines <n>', 'Number of lines to show (default 50)', parseInt)
    .action(async (options: { follow?: boolean; lines?: number }) => {
      await commands.daemonLogs({ follow: options.follow, lines: options.lines });
    });

  // --- Ghost System ---
  const ghostCmd = program.command('ghost').description('Manage orphaned objects (deleted/modified sources)');

  ghostCmd
    .command('list')
    .description('List all orphaned objects')
    .action(async () => {
      await commands.ghostList();
    });

  ghostCmd
    .command('recover <hash>')
    .description('Recover an orphaned object from CAS')
    .option('-t, --target <path>', 'Target path for recovery')
    .action(async (hash: string, options: { target?: string }) => {
      await commands.ghostRecover(hash, options.target);
    });

  ghostCmd
    .command('purge <days>')
    .description('Remove orphaned objects older than N days')
    .action(async (days: string) => {
      await commands.ghostPurge(parseInt(days, 10));
    });

  return program;
}

export * from './commands.js';
export * from './formatters.js';
export * from './process-manager.js';
export * from './prompt.js';
