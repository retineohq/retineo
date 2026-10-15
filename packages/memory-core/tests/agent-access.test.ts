import { describe, expect, it } from 'vitest';
import { PolicyBasedAgentAccessModel } from '../src/adapters/inmemory/agent-access.js';

describe('PolicyBasedAgentAccessModel', () => {
  const model = new PolicyBasedAgentAccessModel();
  const policies = [
    { agentId: 'agent-a', tenantId: 'tenant-a', maxSensitivity: 'internal', allowedPurposes: ['analysis'] },
  ];

  it('allows within sensitivity and purpose', () => {
    const result = model.canRead({ agentId: 'agent-a', tenantId: 'tenant-a', sensitivity: 'internal', purpose: 'analysis' }, policies);
    expect(result.allowed).toBe(true);
  });

  it('denies missing policy', () => {
    const result = model.canRead({ agentId: 'agent-b', tenantId: 'tenant-a', sensitivity: 'internal' }, policies);
    expect(result.allowed).toBe(false);
  });

  it('denies exceeding sensitivity', () => {
    const result = model.canRead({ agentId: 'agent-a', tenantId: 'tenant-a', sensitivity: 'confidential' }, policies);
    expect(result.allowed).toBe(false);
  });

  it('denies disallowed purpose', () => {
    const result = model.canRead({ agentId: 'agent-a', tenantId: 'tenant-a', sensitivity: 'internal', purpose: 'export' }, policies);
    expect(result.allowed).toBe(false);
  });
});
