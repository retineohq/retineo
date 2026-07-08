/**
 * RETINEO Core — MCP Handlers
 * Phase 5: Tool handlers calling core services.
 */

import type { QueryAnalyzer } from '../search/query-analyzer.js';
import type { RetrievalService } from '../search/retrieval-service.js';
import type { ContextAssembler } from '../search/context-assembler.js';
import type { IngestionService } from '../services/ingestion-service.js';
import type { Registry } from '../storage/registry.js';
import type { CASStorage } from '../storage/cas.js';
import { readFile, existsSync } from 'fs';
import { promisify } from 'util';
import path from 'path';

const readFileAsync = promisify(readFile);

export interface MCPHandlersDeps {
  queryAnalyzer: QueryAnalyzer;
  retrievalService: RetrievalService;
  contextAssembler: ContextAssembler;
  ingestionService: IngestionService;
  registry: Registry;
  cas: CASStorage;
  version: string;
}

export function createHandlers(deps: MCPHandlersDeps) {
  return {
    async retineo_search(args: { query: string; language?: string; topK?: number }) {
      const analyzed = await deps.queryAnalyzer.analyze(args.query);
      const results = await deps.retrievalService.search(analyzed, {
        language: args.language,
        topK: args.topK,
      });
      const assembled = await deps.contextAssembler.assemble(analyzed, results.selected, {
        maxTokens: 8000,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ assembled, citations: results.citations }, null, 2),
          },
        ],
      };
    },

    async retineo_ingest(args: { sourcePath: string; mimeType?: string }) {
      const result = await deps.ingestionService.ingestFile(args.sourcePath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ sourceId: 'filesystem', contentHash: result.contentHash, action: result.action }, null, 2),
          },
        ],
      };
    },

    async retineo_status() {
      const sources = deps.registry.listSources();
      const pending = deps.registry.getPendingJobs(1000);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                version: deps.version,
                nodeCount: sources.length,
                sourceCount: sources.length,
                jobCount: {
                  pending: pending.length,
                  running: 0,
                  completed: 0,
                  failed: 0,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    },

    async retineo_get_node(args: { hash: string }) {
      const objPath = deps.cas.getObjectPath(args.hash);
      const nodeJsonPath = path.join(objPath, 'node.json');
      if (!existsSync(nodeJsonPath)) {
        return {
          content: [{ type: 'text', text: `Node not found: ${args.hash}` }],
          isError: true,
        };
      }
      const nodeRaw = await readFileAsync(nodeJsonPath, 'utf-8');
      const node = JSON.parse(nodeRaw);
      const artifacts: { l0?: string; l1?: string; l2?: string } = {};
      if (existsSync(path.join(objPath, 'content.md'))) artifacts.l0 = path.join(objPath, 'content.md');
      if (existsSync(path.join(objPath, 'L1.md'))) artifacts.l1 = path.join(objPath, 'L1.md');
      if (existsSync(path.join(objPath, 'L2.json'))) artifacts.l2 = path.join(objPath, 'L2.json');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ node, artifacts }, null, 2),
          },
        ],
      };
    },
  };
}
