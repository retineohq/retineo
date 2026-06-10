/**
 * RETINEO Core — Dual Logger
 * Writes to console (stderr) and/or file. Console is human-readable (pretty),
 * file is JSON for parsing. Console logger always works even if file logger fails.
 */

import pino from 'pino';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface LogMeta {
  traceId?: string;
  nodeHash?: string;
  sourceId?: string;
  jobId?: string;
  adapterId?: string;
  providerId?: string;
  layer?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
  child(meta: LogMeta): Logger;
}

export interface LoggerConfig {
  level?: 'debug' | 'info' | 'warn' | 'error';
  console?: boolean;   // print to stderr (default: true)
  file?: boolean;      // print to file (default: true)
  filePath?: string;
  pretty?: boolean;    // pretty-print for console (file stays JSON)
  redact?: string[];
}

// ---------------------------------------------------------------------------
// DualLogger
// ---------------------------------------------------------------------------

export class DualLogger implements Logger {
  private consoleLogger: pino.Logger;
  private fileLogger?: pino.Logger;
  private fileEnabled: boolean;

  constructor(config: LoggerConfig) {
    const level = config.level ?? 'info';
    const pretty = config.pretty ?? false;
    const redact = config.redact ?? ['apiKey', 'api_key', 'password', 'secret', 'token'];

    // --- Console logger (stderr) ---
    if (pretty) {
      this.consoleLogger = pino({
        level,
        redact: { paths: redact, censor: '[REDACTED]' },
        base: { pid: process.pid },
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid' },
        },
      }, pino.destination(2)); // stderr
    } else {
      // JSON to stderr (no pretty)
      this.consoleLogger = pino({
        level,
        redact: { paths: redact, censor: '[REDACTED]' },
        base: { pid: process.pid },
      }, pino.destination(2)); // stderr
    }

    // --- File logger (optional, JSON always) ---
    this.fileEnabled = false;
    if (config.file !== false && config.filePath) {
      try {
        mkdirSync(dirname(config.filePath), { recursive: true });
        this.fileLogger = pino({
          level,
          redact: { paths: redact, censor: '[REDACTED]' },
          base: { pid: process.pid },
        }, pino.destination({ dest: config.filePath, sync: true }));
        this.fileEnabled = true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.consoleLogger.warn({ error: msg }, 'Failed to create file logger, using console only');
      }
    }
  }

  debug(msg: string, meta?: LogMeta): void {
    this.consoleLogger.debug(meta ?? {}, msg);
    this.fileLogger?.debug(meta ?? {}, msg);
  }

  info(msg: string, meta?: LogMeta): void {
    this.consoleLogger.info(meta ?? {}, msg);
    this.fileLogger?.info(meta ?? {}, msg);
  }

  warn(msg: string, meta?: LogMeta): void {
    this.consoleLogger.warn(meta ?? {}, msg);
    this.fileLogger?.warn(meta ?? {}, msg);
  }

  error(msg: string, meta?: LogMeta): void {
    this.consoleLogger.error(meta ?? {}, msg);
    this.fileLogger?.error(meta ?? {}, msg);
  }

  child(meta: LogMeta): Logger {
    const childConsole = this.consoleLogger.child(meta);
    let childFile: pino.Logger | undefined;
    if (this.fileLogger) {
      childFile = this.fileLogger.child(meta);
    }
    // Return a lightweight child DualLogger-like wrapper
    return new ChildLoggerWrapper(childConsole, childFile);
  }
}

/** Lightweight wrapper around pre-created child pino instances. */
class ChildLoggerWrapper implements Logger {
  private consoleChild: pino.Logger;
  private fileChild?: pino.Logger;

  constructor(consoleChild: pino.Logger, fileChild?: pino.Logger) {
    this.consoleChild = consoleChild;
    this.fileChild = fileChild;
  }

  debug(msg: string, meta?: LogMeta): void {
    this.consoleChild.debug(meta ?? {}, msg);
    this.fileChild?.debug(meta ?? {}, msg);
  }

  info(msg: string, meta?: LogMeta): void {
    this.consoleChild.info(meta ?? {}, msg);
    this.fileChild?.info(meta ?? {}, msg);
  }

  warn(msg: string, meta?: LogMeta): void {
    this.consoleChild.warn(meta ?? {}, msg);
    this.fileChild?.warn(meta ?? {}, msg);
  }

  error(msg: string, meta?: LogMeta): void {
    this.consoleChild.error(meta ?? {}, msg);
    this.fileChild?.error(meta ?? {}, msg);
  }

  child(meta: LogMeta): Logger {
    return new ChildLoggerWrapper(this.consoleChild.child(meta), this.fileChild?.child(meta));
  }
}

// ---------------------------------------------------------------------------
// Legacy PinoLoggerImpl (kept for backward compat / tests)
// ---------------------------------------------------------------------------

class PinoLoggerImpl implements Logger {
  private pino: pino.Logger;

  constructor(pinoInstance: pino.Logger) {
    this.pino = pinoInstance;
  }

  debug(msg: string, meta?: LogMeta): void {
    this.pino.debug(meta ?? {}, msg);
  }

  info(msg: string, meta?: LogMeta): void {
    this.pino.info(meta ?? {}, msg);
  }

  warn(msg: string, meta?: LogMeta): void {
    this.pino.warn(meta ?? {}, msg);
  }

  error(msg: string, meta?: LogMeta): void {
    this.pino.error(meta ?? {}, msg);
  }

  child(meta: LogMeta): Logger {
    return new PinoLoggerImpl(this.pino.child(meta));
  }
}

// ---------------------------------------------------------------------------
// CompositeLogger (kept for backward compat)
// ---------------------------------------------------------------------------

class CompositeLogger implements Logger {
  private a: Logger;
  private b: Logger;

  constructor(a: Logger, b: Logger) {
    this.a = a;
    this.b = b;
  }

  debug(msg: string, meta?: LogMeta): void {
    this.a.debug(msg, meta);
    this.b.debug(msg, meta);
  }

  info(msg: string, meta?: LogMeta): void {
    this.a.info(msg, meta);
    this.b.info(msg, meta);
  }

  warn(msg: string, meta?: LogMeta): void {
    this.a.warn(msg, meta);
    this.b.warn(msg, meta);
  }

  error(msg: string, meta?: LogMeta): void {
    this.a.error(msg, meta);
    this.b.error(msg, meta);
  }

  child(meta: LogMeta): Logger {
    return new CompositeLogger(this.a.child(meta), this.b.child(meta));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let globalLogger: Logger | null = null;

/**
 * Create a logger. Defaults: console ON (stderr, JSON), file OFF.
 * For DualLogger behavior (console + file), pass both `console: true` and `file: true`.
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  // If neither console nor file specified, default to DualLogger with console ON
  const useConsole = config.console !== false;
  const useFile = config.file !== false;

  // When both console and file are requested, use DualLogger
  if (useConsole && useFile && config.filePath) {
    return new DualLogger({ ...config, console: true, file: true });
  }

  // File-only (legacy behavior)
  if (config.file !== false && config.filePath && !useConsole) {
    const redact = config.redact ?? ['apiKey', 'api_key', 'password', 'secret', 'token'];
    const dest = pino.destination({ dest: config.filePath, sync: true });
    const instance = pino({
      level: config.level ?? 'info',
      redact: { paths: redact, censor: '[REDACTED]' },
      base: { pid: process.pid },
    }, dest);
    return new PinoLoggerImpl(instance);
  }

  // Both console + file with explicit 'both' destination
  if (config.filePath) {
    return new DualLogger({ ...config, console: true, file: true });
  }

  // Default: DualLogger with console only (stderr)
  return new DualLogger({ ...config, console: true, file: false });
}

export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

export function getGlobalLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger();
  }
  return globalLogger;
}
