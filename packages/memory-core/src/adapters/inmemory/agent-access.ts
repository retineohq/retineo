import type { AgentAccessModel, AgentAccessInput, AgentAccessPolicy } from '../../ports/agent-access.js';

const ORDER: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

export class PolicyBasedAgentAccessModel implements AgentAccessModel {
  canRead(input: AgentAccessInput, policies: AgentAccessPolicy[]): { allowed: boolean; reason: string | null } {
    const policy = policies.find((candidate) => candidate.agentId === input.agentId && candidate.tenantId === input.tenantId);
    if (!policy) {
      return { allowed: false, reason: `no policy for agent ${input.agentId} in tenant ${input.tenantId}` };
    }
    const level = ORDER[input.sensitivity] ?? ORDER.internal;
    const maxLevel = ORDER[policy.maxSensitivity] ?? ORDER.internal;
    if (level > maxLevel) {
      return { allowed: false, reason: `sensitivity ${input.sensitivity} exceeds max ${policy.maxSensitivity}` };
    }
    if (policy.allowedPurposes && input.purpose && !policy.allowedPurposes.includes(input.purpose)) {
      return { allowed: false, reason: `purpose ${input.purpose} not allowed` };
    }
    return { allowed: true, reason: null };
  }
}
