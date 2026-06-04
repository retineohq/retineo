/**
 * ECHO Core — Global Error Handler
 * Phase 7: Unified error handling for HTTP, CLI, and MCP.
 */

import type { FastifyReply } from 'fastify';
import type { EchoError, BaseEchoError } from './errors.js';

export function isEchoError(err: unknown): err is BaseEchoError {
  return err instanceof Error && 'code' in err && 'statusCode' in err;
}

export function echoErrorFrom(err: unknown): EchoError {
  if (isEchoError(err)) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message,
    statusCode: 500,
  };
}

/** Send structured EchoError as JSON HTTP response */
export function sendErrorReply(reply: FastifyReply, err: unknown): FastifyReply {
  const echoErr = echoErrorFrom(err);
  return reply.status(echoErr.statusCode).send({
    error: {
      code: echoErr.code,
      message: echoErr.message,
      details: (echoErr as BaseEchoError).details,
    },
  });
}

/** Format error for CLI output */
export function formatCLIError(err: unknown, json = false): string {
  const echoErr = echoErrorFrom(err);
  if (json) {
    return JSON.stringify({
      error: {
        code: echoErr.code,
        message: echoErr.message,
        details: (echoErr as BaseEchoError).details,
      },
    }, null, 2);
  }
  const details = (echoErr as BaseEchoError).details
    ? '\n  Details: ' + JSON.stringify((echoErr as BaseEchoError).details)
    : '';
  return `Error [${echoErr.code}]: ${echoErr.message}${details}`;
}
