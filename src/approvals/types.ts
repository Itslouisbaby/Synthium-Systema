import type { OperatorId, TenantId } from '../identity/types.js';

export type ApprovalId = string & { __brand: 'ApprovalId' };
export type ApprovalRequestId = string & { __brand: 'ApprovalRequestId' };

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  id: ApprovalRequestId;
  tenantId: TenantId;
  requesterId: OperatorId;
  resourceType: string;
  resourceId: string;
  action: string;
  justification: string;
  status: ApprovalStatus;
  createdAt: Date;
  expiresAt?: Date;
  decidedAt?: Date;
  decidedBy?: OperatorId; // CRITICAL FIELD - tracks who approved/rejected
  decisionReason?: string;
}

export interface ApprovalPolicy {
  resourceType: string;
  requiredApprovers: number;
  approverRoles: string[];
  autoExpireHours: number;
}
