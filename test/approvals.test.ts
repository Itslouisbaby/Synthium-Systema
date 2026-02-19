import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalService } from '../src/approvals/ApprovalService.js';
import type { OperatorId, TenantId, Operator, RoleId } from '../src/identity/types.js';
import type { ApprovalRequestId } from '../src/approvals/types.js';

describe('ApprovalService', () => {
  let service: ApprovalService;

  beforeEach(() => {
    service = new ApprovalService();
  });

  function createOperator(id: string, tenantId: string): Operator {
    return {
      id: id as OperatorId,
      email: `${id}@example.com`,
      name: `User ${id}`,
      tenantId: tenantId as TenantId,
      roleIds: ['role-user'] as RoleId[],
      isActive: true,
      createdAt: new Date(),
    };
  }

  describe('createRequest', () => {
    it('should create a pending request', async () => {
      const request = await service.createRequest({
        tenantId: 'tenant-1' as TenantId,
        requesterId: 'op-1' as OperatorId,
        resourceType: 'workspace',
        resourceId: 'ws-1',
        action: 'delete',
        justification: 'No longer needed',
      });

      expect(request.status).toBe('pending');
      expect(request.resourceType).toBe('workspace');
      expect(request.justification).toBe('No longer needed');
      expect(request.createdAt).toBeInstanceOf(Date);
    });

    it('should set expiration based on policy', async () => {
      service.setPolicy({
        resourceType: 'workspace',
        requiredApprovers: 1,
        approverRoles: ['admin'],
        autoExpireHours: 24,
      });

      const request = await service.createRequest({
        tenantId: 'tenant-1' as TenantId,
        requesterId: 'op-1' as OperatorId,
        resourceType: 'workspace',
        resourceId: 'ws-1',
        action: 'delete',
        justification: 'Test',
      });

      expect(request.expiresAt).toBeDefined();
      expect(request.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('decide', () => {
    it('should set decidedBy when approving', async () => {
      const request = await service.createRequest({
        tenantId: 'tenant-1' as TenantId,
        requesterId: 'op-1' as OperatorId,
        resourceType: 'workspace',
        resourceId: 'ws-1',
        action: 'delete',
        justification: 'Test',
      });

      const approver = createOperator('admin-1', 'tenant-1');
      const decided = await service.decide({
        requestId: request.id,
        approver,
        decision: 'approve',
        reason: 'Looks good',
      });

      expect(decided.status).toBe('approved');
      expect(decided.decidedBy).toBe('admin-1');
      expect(decided.decidedAt).toBeInstanceOf(Date);
      expect(decided.decisionReason).toBe('Looks good');
    });

    it('should set decidedBy when rejecting', async () => {
      const request = await service.createRequest({
        tenantId: 'tenant-1' as TenantId,
        requesterId: 'op-1' as OperatorId,
        resourceType: 'workspace',
        resourceId: 'ws-1',
        action: 'delete',
        justification: 'Test',
      });

      const approver = createOperator('admin-2', 'tenant-1');
      const decided = await service.decide({
        requestId: request.id,
        approver,
        decision: 'reject',
        reason: 'Not authorized',
      });

      expect(decided.status).toBe('rejected');
      expect(decided.decidedBy).toBe('admin-2');
    });

    it('should throw if request not found', async () => {
      const approver = createOperator('admin-1', 'tenant-1');
      await expect(
        service.decide({
          requestId: 'nonexistent' as ApprovalRequestId,
          approver,
          decision: 'approve',
        })
      ).rejects.toThrow('not found');
    });

    it('should throw if already decided', async () => {
      const request = await service.createRequest({
        tenantId: 'tenant-1' as TenantId,
        requesterId: 'op-1' as OperatorId,
        resourceType: 'workspace',
        resourceId: 'ws-1',
        action: 'delete',
        justification: 'Test',
      });

      const approver = createOperator('admin-1', 'tenant-1');
      await service.decide({
        requestId: request.id,
        approver,
        decision: 'approve',
      });

      await expect(
        service.decide({
          requestId: request.id,
          approver,
          decision: 'reject',
        })
      ).rejects.toThrow('already');
    });
  });

  describe('listPending', () => {
    it('should return only pending requests for tenant', async () => {
      await service.createRequest({
        tenantId: 'tenant-1' as TenantId,
        requesterId: 'op-1' as OperatorId,
        resourceType: 'workspace',
        resourceId: 'ws-1',
        action: 'delete',
        justification: 'Test',
      });

      const pending = await service.listPending('tenant-1' as TenantId);
      expect(pending).toHaveLength(1);

      // Approve it
      await service.decide({
        requestId: pending[0].id,
        approver: createOperator('admin-1', 'tenant-1'),
        decision: 'approve',
      });

      const pendingAfter = await service.listPending('tenant-1' as TenantId);
      expect(pendingAfter).toHaveLength(0);
    });
  });

  describe('expireOldRequests', () => {
    it('should expire past-due requests', async () => {
      service.setPolicy({
        resourceType: 'workspace',
        requiredApprovers: 1,
        approverRoles: ['admin'],
        autoExpireHours: 0, // Expire immediately
      });

      const request = await service.createRequest({
        tenantId: 'tenant-1' as TenantId,
        requesterId: 'op-1' as OperatorId,
        resourceType: 'workspace',
        resourceId: 'ws-1',
        action: 'delete',
        justification: 'Test',
      });

      // Manually backdate the expiration
      service['requests'].set(request.id, {
        ...request,
        expiresAt: new Date(Date.now() - 1000),
      });

      const expired = await service.expireOldRequests();
      expect(expired).toBe(1);

      const updated = await service.getRequest(request.id);
      expect(updated?.status).toBe('expired');
    });
  });
});
