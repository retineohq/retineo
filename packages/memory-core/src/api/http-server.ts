import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { MemoryCore } from '../core/memory-core.js';
import type { QueryEngine } from '../core/query-engine.js';

export interface HttpServerOptions {
  port: number;
  host: string;
}

export function createHttpServer(
  core: MemoryCore,
  engine: QueryEngine,
  options: HttpServerOptions,
) {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/objects/:id', async (request, reply) => {
    try {
      return core.getObject((request.params as any).id);
    } catch (error: any) {
      reply.code(404);
      return { error: error.message };
    }
  });

  app.get('/objects/:id/provenance', async (request, reply) => {
    try {
      return core.getProvenance((request.params as any).id);
    } catch (error: any) {
      reply.code(404);
      return { error: error.message };
    }
  });

  app.get('/claims/:id', async (request, reply) => {
    try {
      return core.getClaim((request.params as any).id);
    } catch (error: any) {
      reply.code(404);
      return { error: error.message };
    }
  });

  app.get('/contexts/:id', async (request, reply) => {
    try {
      return core.getContext((request.params as any).id);
    } catch (error: any) {
      reply.code(404);
      return { error: error.message };
    }
  });

  app.post('/objects', async (request, reply) => {
    try {
      const body = request.body as any;
      return core.createObject({
        type: body.type,
        name: body.name,
        aliases: body.aliases,
        actor: body.actor ?? 'http',
      });
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/claims', async (request, reply) => {
    try {
      const body = request.body as any;
      return core.createClaim({
        subjectId: body.subjectId,
        predicate: body.predicate,
        objectOrValue: body.objectOrValue,
        evidenceRefs: body.evidenceRefs,
        observedAt: body.observedAt ?? null,
        validFrom: body.validFrom ?? null,
        validTo: body.validTo ?? null,
        scope: body.scope ?? null,
        confidence: body.confidence,
        actor: body.actor ?? 'http',
      });
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/relationships', async (request, reply) => {
    try {
      const body = request.body as any;
      return core.createRelationship({
        sourceObject: body.sourceObject,
        relationType: body.relationType,
        targetObject: body.targetObject,
        evidenceRefs: body.evidenceRefs,
        confidence: body.confidence,
        actor: body.actor ?? 'http',
      });
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/contexts', async (request, reply) => {
    try {
      const body = request.body as any;
      return core.createContext({
        type: body.type,
        name: body.name,
        purpose: body.purpose,
        actor: body.actor ?? 'http',
      });
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/contexts/:id/memberships', async (request, reply) => {
    try {
      const body = request.body as any;
      return core.addMembership({
        contextId: (request.params as any).id,
        memberType: body.memberType,
        memberId: body.memberId,
        mode: body.mode,
        actor: body.actor ?? 'http',
      });
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.get('/objects/:id/relationships', async (request, reply) => {
    try {
      return core.getRelationshipsByObject((request.params as any).id);
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/candidates', async (request, reply) => {
    try {
      const body = request.body as any;
      return core.proposeCandidate({
        type: body.type,
        payload: body.payload,
        evidenceRefs: body.evidenceRefs,
        extractor: body.extractor,
        extractorVersion: body.extractorVersion,
        actor: body.actor ?? 'http',
      });
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/candidates/:id/decide', async (request, reply) => {
    try {
      return core.decide((request.params as any).id, (request.body as any)?.actor ?? 'http');
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/decisions/:id/apply-policy', async (request, reply) => {
    try {
      return core.applyPolicy((request.params as any).id, (request.body as any)?.actor ?? 'http');
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/extract', async (request, reply) => {
    try {
      const body = request.body as any;
      return core.extractFromEvidence({
        evidenceId: body.evidenceId,
        content: body.content,
        actor: body.actor ?? 'http',
      });
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/segments/export', async (request, reply) => {
    try {
      const body = request.body as any;
      return core.exportSegment({
        rootContext: body.rootContext,
        purpose: body.purpose,
        sensitivity: body.sensitivity,
        actor: body.actor ?? 'http',
        expiresInDays: body.expiresInDays,
      });
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/query/entry-points', async (request, reply) => {
    try {
      const body = request.body as any;
      return engine.findEntryPoints(body.query, body.type ?? 'essence_nl');
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/query/knowledge', async (request, reply) => {
    try {
      const body = request.body as any;
      return engine.knowledgeQuery(body.query);
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/query/context', async (request, reply) => {
    try {
      const body = request.body as any;
      return engine.reconstructContext(body.startObjectId, body.maxDepth ?? 3);
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.get('/segments/:id', async (request, reply) => {
    try {
      return core.getSegment((request.params as any).id);
    } catch (error: any) {
      reply.code(404);
      return { error: error.message };
    }
  });

  app.post('/segments/import', async (request, reply) => {
    try {
      const body = request.body as any;
      return core.importSegment({
        segment: body.segment,
        actor: body.actor ?? 'http',
        autoApply: body.autoApply ?? false,
      });
    } catch (error: any) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.get('/journal', async () => core.getJournal());

  return app;
}

export async function startHttpServer(
  core: MemoryCore,
  engine: QueryEngine,
  options: HttpServerOptions,
): Promise<FastifyInstance> {
  const app = createHttpServer(core, engine, options);
  await app.listen({ port: options.port, host: options.host });
  return app;
}
