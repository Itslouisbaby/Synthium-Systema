import type { ApprovalRequest, ApprovalPolicy, ApprovalRequestId } from './types.js';
import type { OperatorId, TenantId, Operator } from '../identity/types.js';

export interface CreateRequestInput {
  tenantId: TenantId;
  requesterId: OperatorId;
  resourceType: string;
  resourceId: string;
  action: string;
  justification: string;
}

export interface DecisionInput {
  requestId: ApprovalRequestId;
  approver: Operator;
  decision: 'approve' | 'reject';
  reason?: string;
}

export class ApprovalService {
  private requests = new Map<string, ApprovalRequest>();
  private policies = new Map<string, ApprovalPolicy>();

  async createRequest(input: CreateRequestInput): Promise<ApprovalRequest> {
    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` as ApprovalRequestId;
    
    // Get policy to set expiration
    const policy = this.policies.get(input.resourceType);
    const expiresAt = policy 
      ? new Date(Date.now() + policy.autoExpireHours * 60 * 60 * 1000)
      : undefined;

    const request: ApprovalRequest = {
      id,
      tenantId: input.tenantId,
      requesterId: input.requesterId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      justification: input.justification,
      status: 'pending',
      createdAt: new Date(),
      expiresAt,
    };

    this.requests.set(id, request);
    return request;
  }

  async decide(input: DecisionInput): Promise<ApprovalRequest> {
    const request = this.requests.get(input.requestId);
    if (!request) {
      throw new Error(`Approval request ${input.requestId} not found`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Request ${input.requestId} is already ${request.status}`);
    }

    if (request.expiresAt && request.expiresAt < new Date()) {
      throw new Error(`Request ${input.requestId} has expired`);
    }

    // CRITICAL: Set decidedBy to approver.id
    const decidedBy = input.approver.id;
    const decidedAt = new Date();
    const status = input.decision === 'approve' ? 'approved' : 'rejected';

    const updated: ApprovalRequest = {
      ...request,
      status,
      decidedAt,
      decidedBy,
      decisionReason: input.reason,
    };

    this.requests.set(input.requestId, updated);
    return updated;
  }

  async getRequest(requestId: ApprovalRequestId): Promise<ApprovalRequest | undefined> {
    return this.requests.get(requestId);
  }

  async listPending(tenantId: TenantId): Promise<ApprovalRequest[]> {
    const results: ApprovalRequest[] = [];
    for (const request of this.requests.values()) {
      if (request.tenantId === tenantId && request.status === 'pending') {
        results.push(request);
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listByRequester(requesterId: OperatorId): Promise<ApprovalRequest[]> {
    const results: ApprovalRequest[] = [];
    for (const request of this.requests.values()) {
      if (request.requesterId === requesterId) {
        results.push(request);
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  setPolicy(policy: ApprovalPolicy): void {
    this.policies.set(policy.resourceType, policy);
  }

  getPolicy(resourceType: string): ApprovalPolicy | undefined {
    return this.policies.get(resourceType);
  }

  async expireOldRequests(): Promise<number> {
    const now = new Date();
    let expiredCount = 0;

    for (const [id, request] of this.requests) {
      if (request.status === 'pending' && request.expiresAt && request.expiresAt < now) {
        this.requests.set(id, {
          ...request,
          status: 'expired',
        });
        expiredCount++;
      }
    }

    return expiredCount;
  }
}
