#!/usr/bin/env node
import { createId } from '../dist/index.js';
import {
  MemoryCore,
  InMemoryObjectRepository,
  InMemoryClaimRepository,
  InMemoryRelationshipRepository,
  InMemoryContextRepository,
  InMemoryMembershipRepository,
  InMemoryGapRepository,
  InMemoryEvidenceRepository,
  InMemoryProvenanceRepository,
  InMemorySourceRepository,
  InMemorySourceItemRepository,
  InMemorySourceVersionRepository,
  InMemoryJournal,
  InMemoryTransaction,
  InMemoryIdentityResolver,
  InMemoryCandidateRepository,
  InMemoryDecisionRepository,
  InMemoryPolicyRepository,
  DeterministicDecisionModel,
  PermissivePolicyModel,
  InMemoryRepresentationRepository,
  TrivialRepresentationModel,
  InMemorySegmentRepository,
  TrivialSegmentSecurityModel,
  SensitivityAccessControlModel,
  PolicyBasedAgentAccessModel,
  InMemoryAgentPolicyRepository,
  RegexExtractionModel,
  QueryEngine,
} from '../dist/index.js';
import { SqliteDatabase } from '../dist/adapters/sqlite/index.js';
import {
  SqliteObjectRepository,
  SqliteClaimRepository,
  SqliteRelationshipRepository,
  SqliteContextRepository,
  SqliteMembershipRepository,
  SqliteGapRepository,
  SqliteEvidenceRepository,
  SqliteProvenanceRepository,
  SqliteSourceRepository,
  SqliteSourceItemRepository,
  SqliteSourceVersionRepository,
  SqliteJournal,
  SqliteTransaction,
  SqliteIdentityResolver,
} from '../dist/adapters/sqlite/index.js';
import { PostgresDatabase, createPgExecutor, runPostgresMigrations } from '../dist/adapters/postgres/index.js';
import {
  PostgresObjectRepository,
  PostgresSourceRepository,
  PostgresSourceItemRepository,
  PostgresSourceVersionRepository,
  PostgresClaimRepository,
  PostgresRelationshipRepository,
  PostgresContextRepository,
  PostgresMembershipRepository,
  PostgresGapRepository,
  PostgresEvidenceRepository,
  PostgresProvenanceRepository,
} from '../dist/adapters/postgres/index.js';
import { startHttpServer } from '../dist/api/http-server.js';
import { MemoryCoreMCPServer } from '../dist/api/mcp-server.js';
import { FilesystemSourceAdapter } from '../dist/adapters/ingestion/index.js';

const args = process.argv.slice(2);
const command = args[0];

function buildInMemoryCore() {
  return new MemoryCore({
    objects: new InMemoryObjectRepository(),
    claims: new InMemoryClaimRepository(),
    relationships: new InMemoryRelationshipRepository(),
    contexts: new InMemoryContextRepository(),
    memberships: new InMemoryMembershipRepository(),
    gaps: new InMemoryGapRepository(),
    evidence: new InMemoryEvidenceRepository(),
    provenance: new InMemoryProvenanceRepository(),
    sources: new InMemorySourceRepository(),
    sourceItems: new InMemorySourceItemRepository(),
    sourceVersions: new InMemorySourceVersionRepository(),
    journal: new InMemoryJournal(),
    transaction: new InMemoryTransaction(),
    identity: new InMemoryIdentityResolver(),
    candidates: new InMemoryCandidateRepository(),
    decisions: new InMemoryDecisionRepository(),
    policies: new InMemoryPolicyRepository(),
    decisionModel: new DeterministicDecisionModel(),
    policyModel: new PermissivePolicyModel(),
    accessControl: new SensitivityAccessControlModel(),
    agentPolicies: new InMemoryAgentPolicyRepository(),
    agentAccessModel: new PolicyBasedAgentAccessModel(),
    representations: new InMemoryRepresentationRepository(),
    representationModel: new TrivialRepresentationModel(),
    segments: new InMemorySegmentRepository(),
    segmentSecurity: new TrivialSegmentSecurityModel(),
    extractionModel: new RegexExtractionModel(),
  });
}

function buildSqliteCore(dbFile) {
  const db = new SqliteDatabase(dbFile);
  return {
    core: new MemoryCore({
      objects: new SqliteObjectRepository(db),
      claims: new SqliteClaimRepository(db),
      relationships: new SqliteRelationshipRepository(db),
      contexts: new SqliteContextRepository(db),
      memberships: new SqliteMembershipRepository(db),
      gaps: new SqliteGapRepository(db),
      evidence: new SqliteEvidenceRepository(db),
      provenance: new SqliteProvenanceRepository(db),
      sources: new SqliteSourceRepository(db),
      sourceItems: new SqliteSourceItemRepository(db),
      sourceVersions: new SqliteSourceVersionRepository(db),
      journal: new SqliteJournal(db),
      transaction: new SqliteTransaction(db),
      identity: new SqliteIdentityResolver(db),
      candidates: new InMemoryCandidateRepository(),
      decisions: new InMemoryDecisionRepository(),
      policies: new InMemoryPolicyRepository(),
      decisionModel: new DeterministicDecisionModel(),
      policyModel: new PermissivePolicyModel(),
      accessControl: new SensitivityAccessControlModel(),
    agentPolicies: new InMemoryAgentPolicyRepository(),
    agentAccessModel: new PolicyBasedAgentAccessModel(),
      agentPolicies: new InMemoryAgentPolicyRepository(),
      agentAccessModel: new PolicyBasedAgentAccessModel(),
      representations: new InMemoryRepresentationRepository(),
      representationModel: new TrivialRepresentationModel(),
      segments: new InMemorySegmentRepository(),
      segmentSecurity: new TrivialSegmentSecurityModel(),
      extractionModel: new RegexExtractionModel(),
    }),
    close: () => db.close(),
  };
}

async function main() {
  const storage = process.env.STORAGE || 'sqlite';
  const databaseUrl = process.env.DATABASE_URL || null;

  async function buildPostgresCore() {
    if (!databaseUrl) {
      throw new Error('STORAGE=postgres requires DATABASE_URL');
    }
    const executor = await createPgExecutor({ connectionString: databaseUrl });
    const migrations = await runPostgresMigrations({ exec: executor });
    console.error(`postgres migrations applied: ${migrations.applied}`);
    const core = new MemoryCore({
      objects: new PostgresObjectRepository(executor),
      claims: new PostgresClaimRepository(executor),
      relationships: new PostgresRelationshipRepository(executor),
      contexts: new PostgresContextRepository(executor),
      memberships: new PostgresMembershipRepository(executor),
      gaps: new PostgresGapRepository(executor),
      evidence: new PostgresEvidenceRepository(executor),
      provenance: new PostgresProvenanceRepository(executor),
      sources: new PostgresSourceRepository(executor),
      sourceItems: new PostgresSourceItemRepository(executor),
      sourceVersions: new PostgresSourceVersionRepository(executor),
      journal: new InMemoryJournal(),
      transaction: new InMemoryTransaction(),
      identity: new InMemoryIdentityResolver(),
      candidates: new InMemoryCandidateRepository(),
      decisions: new InMemoryDecisionRepository(),
      policies: new InMemoryPolicyRepository(),
      decisionModel: new DeterministicDecisionModel(),
      policyModel: new PermissivePolicyModel(),
      accessControl: new SensitivityAccessControlModel(),
    agentPolicies: new InMemoryAgentPolicyRepository(),
    agentAccessModel: new PolicyBasedAgentAccessModel(),
      agentPolicies: new InMemoryAgentPolicyRepository(),
      agentAccessModel: new PolicyBasedAgentAccessModel(),
      representations: new InMemoryRepresentationRepository(),
      representationModel: new TrivialRepresentationModel(),
      segments: new InMemorySegmentRepository(),
      segmentSecurity: new TrivialSegmentSecurityModel(),
      extractionModel: new RegexExtractionModel(),
    });
    return { core, close: async () => {} };
  }

  if (command === 'serve') {
    const dbFile = args[1] || 'memory-core.db';
    const port = parseInt(args[2] || '7900', 10);
    const { core, close } = storage === 'postgres' ? await buildPostgresCore() : buildSqliteCore(dbFile);
    const engine = new QueryEngine(core);
    await startHttpServer(core, engine, { port, host: '127.0.0.1' });
    console.log(`Memory Core HTTP server on http://127.0.0.1:${port} (db: ${dbFile})`);
    process.on('SIGINT', () => {
      close();
      process.exit(0);
    });
    return;
  }

  if (command === 'replicate-pull') {
    const sourceUrl = process.env.REPLICATION_SOURCE_URL || args[1];
    const dbFile = args[2] || 'memory-core.db';
    const authHeader = process.env.REPLICATION_TOKEN ? `Bearer ${process.env.REPLICATION_TOKEN}` : null;
    if (!sourceUrl) {
      console.error('Usage: memory-core replicate-pull <sourceUrl> [dbFile] (env REPLICATION_TOKEN optional)');
      process.exit(1);
    }
    const { pullReplicationOnce } = await import('../dist/adapters/replication/index.js');
    const { core, close } = storage === 'postgres' ? await buildPostgresCore() : buildSqliteCore(dbFile);
    const result = await pullReplicationOnce(core, {
      getEvents: async () => ({ lastSequence: core.journalSequence(), events: [] }),
      sourceUrl,
      authHeader,
    });
    console.log(JSON.stringify(result, null, 2));
    close();
    return;
  }

  if (command === 'mcp') {
    const dbFile = args[1] || 'memory-core.db';
    const { core, close } = buildSqliteCore(dbFile);
    const engine = new QueryEngine(core);
    const server = new MemoryCoreMCPServer({ core, engine });
    await server.start();
    console.error(`Memory Core MCP server started (db: ${dbFile})`);
    process.on('SIGINT', () => {
      close();
      process.exit(0);
    });
    return;
  }

  if (command === 'ingest') {
    const dir = args[1];
    if (!dir) {
      console.error('Usage: memory-core ingest <directory>');
      process.exit(1);
    }
    const dbFile = args[2] || 'memory-core.db';
    const { core, close } = buildSqliteCore(dbFile);
    const result = await core.ingestDirectoryAsync({
      dir,
      sourceName: 'CLI Ingest',
      trustProfile: 'trusted',
      actor: 'cli',
    });
    console.log(JSON.stringify(result, null, 2));
    close();
    return;
  }

  if (command === 'journal') {
    const dbFile = args[1] || 'memory-core.db';
    const { core, close } = buildSqliteCore(dbFile);
    const journal = core.getJournal();
    console.log(JSON.stringify(journal, null, 2));
    close();
    return;
  }

  if (command === 'extract') {
    const evidenceId = args[1];
    const content = args[2];
    const dbFile = args[3] || 'memory-core.db';
    if (!evidenceId || !content) {
      console.error('Usage: memory-core extract <evidenceId> <content> [dbFile]');
      process.exit(1);
    }
    const { core, close } = buildSqliteCore(dbFile);
    const result = core.extractFromEvidence({ evidenceId, content, actor: 'cli' });
    console.log(JSON.stringify(result, null, 2));
    close();
    return;
  }

  if (command === 'extract-async') {
    const evidenceId = args[1];
    const content = args[2];
    const engine = args[3] === 'ollama' ? 'ollama' : 'openrouter';
    const dbFile = args[3] === 'ollama' ? args[4] || 'memory-core.db' : args[3] || 'memory-core.db';
    if (!evidenceId || !content) {
      console.error('Usage: memory-core extract-async <evidenceId> <content> [dbFile]');
      process.exit(1);
    }
    const { OpenRouterExtractionModel } = await import('../dist/adapters/openrouter/extraction.js');
    const { OllamaExtractionModel } = await import('../dist/adapters/ollama/extraction.js');
    const model = engine === 'ollama'
      ? new OllamaExtractionModel()
      : new OpenRouterExtractionModel();
    const { core, close } = buildSqliteCore(dbFile);
    const result = await core.extractFromEvidenceAsync({ evidenceId, content, actor: 'cli', extractionModel: model });
    console.log(JSON.stringify(result, null, 2));
    close();
    return;
  }

  if (command === 'query') {
    const type = args[1];
    const query = args[2];
    const dbFile = args[3] || 'memory-core.db';
    if (!type || !query) {
      console.error('Usage: memory-core query <entry-points|knowledge|context> <query> [dbFile]');
      process.exit(1);
    }
    const { core, close } = buildSqliteCore(dbFile);
    const engine = new QueryEngine(core);
    let result;
    if (type === 'entry-points') {
      result = engine.findEntryPoints(query);
    } else if (type === 'knowledge') {
      result = engine.knowledgeQuery(query);
    } else if (type === 'context') {
      result = engine.reconstructContext(query);
    } else {
      console.error(`Unknown query type: ${type}`);
      process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
    close();
    return;
  }

  console.log(`
Retineo Memory Core CLI

Usage:
  memory-core serve [dbFile] [port]     Start HTTP API server
  memory-core mcp [dbFile]             Start MCP server (stdio)
  memory-core ingest <dir> [dbFile]     Ingest text files from directory
  memory-core journal [dbFile]          Show journal events
  memory-core extract <ev> <content> [dbFile]  Extract claims/relationships
  memory-core extract-async <ev> <content> [dbFile]  Extract via OpenRouter LLM
  memory-core replicate-pull <sourceUrl> [dbFile]  Pull journal events from remote
  memory-core query <type> <query> [dbFile]    Query memory
    types: entry-points, knowledge, context

Default dbFile: memory-core.db
Default port: 7900

Storage: env STORAGE=sqlite|postgres (postgres требует DATABASE_URL)
Replication: env REPLICATION_TOKEN (Bearer) для аутентификации pull
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
