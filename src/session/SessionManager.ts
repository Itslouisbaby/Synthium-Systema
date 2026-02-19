import type { SessionContext, SessionId, SessionPolicy, SessionEvent } from './types.js';
import type { OperatorId, TenantId, Operator } from '../identity/types.js';

export interface CreateSessionInput {
  operator: Operator;
  policy: SessionPolicy;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionContext>();
  private eventHandlers: Array<(event: SessionEvent) => void> = [];

  async createSession(input: CreateSessionInput): Promise<SessionContext> {
    const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` as SessionId;
    const now = new Date();

    const session: SessionContext = {
      sessionId: id,
      operatorId: input.operator.id,
      tenantId: input.operator.tenantId,
      createdAt: now,
      lastActiveAt: now,
      policy: input.policy,
      metadata: input.metadata ?? {},
      ipAddress: input.ipAddress,
    };

    this.sessions.set(id, session);
    this.emit({ type: 'created', sessionId: id, operatorId: input.operator.id });
    return session;
  }

  async getSession(sessionId: SessionId): Promise<SessionContext | undefined> {
    return this.sessions.get(sessionId);
  }

  async touch(sessionId: SessionId): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  async validateSession(sessionId: SessionId): Promise<{ valid: boolean; context?: SessionContext; reason?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    const now = new Date().getTime();
    const idleTime = now - session.lastActiveAt.getTime();
    const totalTime = now - session.createdAt.getTime();

    if (idleTime > session.policy.maxIdleTimeMs) {
      const reason = 'Session idle timeout';
      this.emit({ type: 'expired', sessionId, reason });
      return { valid: false, reason };
    }

    if (totalTime > session.policy.maxTotalTimeMs) {
      const reason = 'Session maximum duration exceeded';
      this.emit({ type: 'expired', sessionId, reason });
      return { valid: false, reason };
    }

    // Update last active on successful validation
    session.lastActiveAt = new Date();
    this.sessions.set(sessionId, session);

    return { valid: true, context: session };
  }

  async terminate(sessionId: SessionId, terminatedBy?: OperatorId): Promise<boolean> {
    const existed = this.sessions.delete(sessionId);
    if (existed) {
      this.emit({ type: 'terminated', sessionId, terminatedBy });
    }
    return existed;
  }

  async checkPolicyCompliance(
    sessionId: SessionId,
    action: string
  ): Promise<{ compliant: boolean; violation?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { compliant: false, violation: 'Session not found' };
    }

    // Check if reauth required for sensitive actions
    const sensitiveActions = ['delete', 'admin', 'transfer_ownership'];
    if (session.policy.requireReauthForSensitive && sensitiveActions.includes(action)) {
      // In a real implementation, we'd check if reauth was recently performed
      // For now, we just note it would require reauth
      if (!session.metadata.reauthAt) {
        return { 
          compliant: false, 
          violation: `Action '${action}' requires re-authentication` 
        };
      }
    }

    return { compliant: true };
  }

  onEvent(handler: (event: SessionEvent) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  async cleanupExpiredSessions(): Promise<number> {
    const now = Date.now();
    let removedCount = 0;

    for (const [id, session] of this.sessions) {
      const idleTime = now - session.lastActiveAt.getTime();
      const totalTime = now - session.createdAt.getTime();

      if (idleTime > session.policy.maxIdleTimeMs || totalTime > session.policy.maxTotalTimeMs) {
        this.sessions.delete(id);
        this.emit({ 
          type: 'expired', 
          sessionId: id as SessionId, 
          reason: idleTime > session.policy.maxIdleTimeMs ? 'idle_timeout' : 'max_duration' 
        });
        removedCount++;
      }
    }

    return removedCount;
  }

  private emit(event: SessionEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        // Log but don't break other handlers
        console.error('Session event handler error:', err);
      }
    }
  }
}
