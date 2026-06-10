/**
 * RETINEO Core — MCP Bin Entry Point Tests
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';

describe('retineo-mcp bin', () => {
  it('bin file exists', () => {
    const binPath = path.join(process.cwd(), 'bin', 'retineo-mcp.js');
    expect(existsSync(binPath)).toBe(true);
  });

  it('exports RetineoMCPServer from dist', async () => {
    const { RetineoMCPServer } = await import('../../packages/core/src/mcp/server.js');
    expect(RetineoMCPServer).toBeDefined();
  });
});
