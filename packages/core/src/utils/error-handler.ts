/**
 * RETINEO Core — Global Error Handler
 * Phase 7: Unified error handling for HTTP, CLI, and MCP.
 */

import type { FastifyReply } from 'fastify';
import type { RetineoError, BaseRetineoError } from './errors.js';

export function isRetineoError(err: unknown): err is BaseRetineoError {
  return err instanceof Error && 'code' in err && 'statusCode' in err;
}

export function retineoErrorFrom(err: unknown): RetineoError {
  if (isRetineoError(err)) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message,
    statusCode: 500,
  };
}

/** Send structured RetineoError as JSON HTTP response */
export function sendErrorReply(reply: FastifyReply, err: unknown): FastifyReply {
  const retineoErr = retineoErrorFrom(err);
  return reply.status(retineoErr.statusCode).send({
    error: {
      code: retineoErr.code,
      message: retineoErr.message,
      details: (retineoErr as BaseRetineoError).details,
    },
  });
}

/** Format error for CLI output */
export function formatCLIError(err: unknown, json = false): string {
  const retineoErr = retineoErrorFrom(err);
  if (json) {
    return JSON.stringify({
      error: {
        code: retineoErr.code,
        message: retineoErr.message,
        details: (retineoErr as BaseRetineoError).details,
      },
    }, null, 2);
  }
  const details = (retineoErr as BaseRetineoError).details
    ? '\n  Details: ' + JSON.stringify((retineoErr as BaseRetineoError).details)
    : '';
  return `Error [${retineoErr.code}]: ${retineoErr.message}${details}`;
}
