/**
 * RETINEO Core — Audit Service
 * Phase 8: Append-only audit log for compliance and operational traceability.
 */

export interface AuditLog {
  id: number;
  timestamp: number;
  actor: string;
  action: string;
  resourceHash?: string;
  level?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditService {
  log(action: string, resourceHash?: string, level?: string, metadata?: Record<string, unknown>): Promise<void>;
}
