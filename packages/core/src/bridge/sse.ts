/**
 * ECHO Core — SSE Stream
 * Phase 5: Server-Sent Events for job progress and search streaming.
 */

import type { FastifyReply } from 'fastify';

export interface SSEStream {
  write(event: string, data: unknown): void;
  close(): void;
  isClosed(): boolean;
}

export function createSSEStream(reply: FastifyReply): SSEStream {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let closed = false;

  const stream: SSEStream = {
    write(event: string, data: unknown) {
      if (closed) return;
      const payload = JSON.stringify(data);
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${payload}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      reply.raw.end();
    },
    isClosed() {
      return closed;
    },
  };

  return stream;
}
