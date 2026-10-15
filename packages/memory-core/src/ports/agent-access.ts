export interface AgentAccessInput {
  agentId: string;
  tenantId: string;
  sensitivity: string;
  purpose?: string | null;
}

export interface AgentAccessPolicy {
  agentId: string;
  tenantId: string;
  maxSensitivity: string;
  allowedPurposes?: string[];
}

export interface AgentAccessModel {
  canRead(input: AgentAccessInput, policies: AgentAccessPolicy[]): { allowed: boolean; reason: string | null };
}
