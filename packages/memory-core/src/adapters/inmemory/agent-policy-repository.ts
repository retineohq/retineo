import type { AgentPolicyRepository } from '../../ports/agent-policy-repository.js';
import type { AgentAccessPolicy } from '../../ports/agent-access.js';

export class InMemoryAgentPolicyRepository implements AgentPolicyRepository {
  private store = new Map<string, AgentAccessPolicy>();
  private key(agentId: string, tenantId: string): string {
    return `${agentId}::${tenantId}`;
  }

  savePolicy(policy: AgentAccessPolicy): void {
    this.store.set(this.key(policy.agentId, policy.tenantId), { ...policy });
  }

  getPolicy(agentId: string, tenantId: string): AgentAccessPolicy | undefined {
    return this.store.get(this.key(agentId, tenantId));
  }

  listPolicies(): AgentAccessPolicy[] {
    return Array.from(this.store.values());
  }
}
