/**
 * ECHO Core — Structured Logger
 * Phase 6: Pino-based JSON logging with traceId propagation and redaction
 */

import pino from 'pino';

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
  format?: 'json' | 'pretty';
  destination?: 'stdout' | 'file' | 'both';
  filePath?: string;
  redact?: string[];
}

function buildPinoOptions(config: LoggerConfig): pino.LoggerOptions {
  const level = config.level ?? 'info';
  const format = config.format ?? 'json';
  const redact = config.redact ?? ['apiKey', 'api_key', 'password', 'secret', 'token'];

  const base: pino.LoggerOptions = {
    level,
    redact: { paths: redact, censor: '[REDACTED]' },
    base: { pid: process.pid },
  };

  if (format === 'pretty') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid' },
      },
    };
  }

  return base;
}

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

let globalLogger: Logger | null = null;

export function createLogger(config: LoggerConfig = {}): Logger {
  const opts = buildPinoOptions(config);

  if (config.destination === 'file' && config.filePath) {
    const dest = pino.destination({ dest: config.filePath, sync: true });
    const instance = pino(opts, dest);
    return new PinoLoggerImpl(instance);
  }

  if (config.destination === 'both' && config.filePath) {
    const fileDest = pino.destination({ dest: config.filePath, sync: true });
    const stdoutDest = pino.destination(1);
    const fileLogger = pino(opts, fileDest);
    const stdoutLogger = pino(opts, stdoutDest);
    return new CompositeLogger(new PinoLoggerImpl(fileLogger), new PinoLoggerImpl(stdoutLogger));
  }

  return new PinoLoggerImpl(pino(opts));
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
