import type { TenantId, OperatorId } from '../identity/types.js';

export type WorkspaceId = string & { __brand: 'WorkspaceId' };

export interface Workspace {
  id: WorkspaceId;
  tenantId: TenantId;
  name: string;
  createdBy: OperatorId;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export class TenantWorkspace {
  private workspaces = new Map<string, Workspace>();

  async create(
    tenantId: TenantId,
    name: string,
    createdBy: OperatorId,
    metadata: Record<string, unknown> = {}
  ): Promise<Workspace> {
    const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` as WorkspaceId;
    const workspace: Workspace = {
      id,
      tenantId,
      name,
      createdBy,
      createdAt: new Date(),
      metadata,
    };
    this.workspaces.set(id, workspace);
    return workspace;
  }

  async get(workspaceId: WorkspaceId): Promise<Workspace | undefined> {
    return this.workspaces.get(workspaceId);
  }

  async listByTenant(tenantId: TenantId): Promise<Workspace[]> {
    const results: Workspace[] = [];
    for (const workspace of this.workspaces.values()) {
      if (workspace.tenantId === tenantId) {
        results.push(workspace);
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async update(
    workspaceId: WorkspaceId,
    updates: Partial<Omit<Workspace, 'id' | 'tenantId' | 'createdAt'>>
  ): Promise<Workspace> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const updated: Workspace = {
      ...workspace,
      ...updates,
      id: workspace.id,
      tenantId: workspace.tenantId,
      createdAt: workspace.createdAt,
    };

    this.workspaces.set(workspaceId, updated);
    return updated;
  }

  async delete(workspaceId: WorkspaceId): Promise<boolean> {
    return this.workspaces.delete(workspaceId);
  }
}
