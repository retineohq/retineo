import type { AgentAccessPolicy } from './agent-access.js';

export interface AgentPolicyRepository {
  savePolicy(policy: AgentAccessPolicy): void;
  getPolicy(agentId: string, tenantId: string): AgentAccessPolicy | undefined;
  listPolicies(): AgentAccessPolicy[];
}
