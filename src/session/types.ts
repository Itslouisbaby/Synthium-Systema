import type { OperatorId, TenantId } from '../identity/types.js';

export type SessionId = string & { __brand: 'SessionId' };

export interface SessionPolicy {
  maxIdleTimeMs: number;
  maxTotalTimeMs: number;
  requireReauthForSensitive: boolean;
  allowedIPs?: string[];
  mfaRequired?: boolean;
}

export interface SessionContext {
  sessionId: SessionId;
  operatorId: OperatorId;
  tenantId: TenantId;
  createdAt: Date;
  lastActiveAt: Date;
  policy: SessionPolicy;
  metadata: Record<string, unknown>;
  ipAddress?: string;
}

export type SessionEvent = 
  | { type: 'created'; sessionId: SessionId; operatorId: OperatorId }
  | { type: 'activity'; sessionId: SessionId; action: string }
  | { type: 'policy_violation'; sessionId: SessionId; violation: string }
  | { type: 'expired'; sessionId: SessionId; reason: string }
  | { type: 'terminated'; sessionId: SessionId; terminatedBy?: OperatorId };
