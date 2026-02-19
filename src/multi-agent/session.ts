/**
 * Session Manager Implementation
 * 
 * Manages the lifecycle of agent sessions within a parent session,
 * including creation, retrieval, termination, and timeout handling.
 */

import { 
  AgentSession, 
  AgentSessionStatus, 
  AgentSessionStats,
  WorkingMemory,
  MemoryFragment,
  HandoffPacket,
  AgentOutput,
  AgentPolicyContext
} from './types.js';
import { randomUUID } from 'crypto';

// Default timeout: 30 minutes (in milliseconds)
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export class SessionManager {
  private sessions: Map<string, AgentSession> = new Map();
  private parentChildMap: Map<string, Set<string>> = new Map();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private transcripts: Map<string, SessionTranscriptEntry[]> = new Map();

  /**
   * Create a new agent session
   */
  createSession(
    agentId: string,
    parentSessionId: string,
    handoffPacket?: HandoffPacket
  ): AgentSession {
    const sessionId = randomUUID();
    
    // Create initial working memory
    const workingMemory: WorkingMemory = {
      contextWindow: [],
      scratchpad: '',
      artifacts: [],
      maxFragments: 50
    };

    // Create initial stats
    const stats: AgentSessionStats = {
      messagesReceived: 0,
      messagesSent: 0,
      toolCallsMade: 0,
      toolCallsBlocked: 0,
      tokensUsed: 0
    };

    // Create minimal routing decision if not provided via handoff
    const routingDecision = handoffPacket?.routingDecision || {
      agentId,
      strategy: 'direct_creation',
      confidence: 1.0,
      reasoning: 'Session created directly',
      isHandoff: !!handoffPacket,
      handoffFrom: handoffPacket?.fromAgentSessionId,
      decidedAt: new Date()
    };

    // Create policy context (simplified - in real implementation would inherit from parent)
    const policyContext: AgentPolicyContext = {
      sessionId: sessionId,
      tenant: {} as any, // Would be inherited from parent in real implementation
      operator: {} as any, // Would be inherited from parent in real implementation
      autonomyLevel: 'full' // Would be inherited from parent in real implementation
    };

    const session: AgentSession = {
      id: sessionId,
      parentSessionId,
      agentId,
      startedAt: new Date(),
      completedAt: undefined,
      handoffFrom: handoffPacket?.fromAgentSessionId,
      handoffReason: handoffPacket 
        ? `Handoff from ${handoffPacket.fromAgentSessionId}` 
        : 'Initial session creation',
      routingDecision,
      tenantId: '', // Would be inherited from parent in real implementation
      operatorId: '', // Would be inherited from parent in real implementation
      policyContext,
      workingMemory,
      receivedHandoff: handoffPacket,
      status: 'initializing',
      stats
    };

    // Store the session
    this.sessions.set(sessionId, session);
    
    // Track parent-child relationship
    if (!this.parentChildMap.has(parentSessionId)) {
      this.parentChildMap.set(parentSessionId, new Set());
    }
    this.parentChildMap.get(parentSessionId)?.add(sessionId);
    
    // Initialize transcript
    this.transcripts.set(sessionId, []);
    
    // Set timeout for automatic closure
    this.setTimeout(sessionId);
    
    // Log session creation to transcript
    this.logToTranscript(sessionId, {
      timestamp: new Date(),
      type: 'system',
      content: `Session created for agent ${agentId}`,
      metadata: { sessionId, parentSessionId, agentId }
    });
    
    return session;
  }

  /**
   * Get an active session by ID
   */
  getSession(sessionId: string): AgentSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session && session.status !== 'completed' && session.status !== 'error') {
      // Reset timeout since session is being accessed
      this.resetTimeout(sessionId);
      return session;
    }
    return undefined;
  }

  /**
   * Get all sessions for a parent session
   */
  getChildSessions(parentSessionId: string): AgentSession[] {
    const childIds = this.parentChildMap.get(parentSessionId);
    if (!childIds) return [];
    
    const sessions: AgentSession[] = [];
    for (const childId of childIds) {
      const session = this.sessions.get(childId);
      if (session) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  /**
   * End a session and archive its transcript
   */
  endSession(sessionId: string, output?: AgentOutput): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Update session status
    session.completedAt = new Date();
    session.status = 'completed';
    
    // Log session completion to transcript
    this.logToTranscript(sessionId, {
      timestamp: new Date(),
      type: 'system',
      content: `Session ended for agent ${session.agentId}`,
      metadata: { 
        sessionId, 
        agentId: session.agentId, 
        duration: session.completedAt.getTime() - session.startedAt.getTime(),
        output: output ? { content: output.content.substring(0, 100) + '...' } : undefined
      }
    });
    
    // Clear timeout
    this.clearTimeout(sessionId);
    
    // Archive transcript (in real implementation, this would be persisted)
    const transcript = this.transcripts.get(sessionId) || [];
    console.debug(`[SESSION] Archived transcript for session ${sessionId} (${transcript.length} entries)`);
  }

  /**
   * Get session transcript
   */
  getTranscript(sessionId: string): SessionTranscriptEntry[] {
    return this.transcripts.get(sessionId) || [];
  }

  /**
   * Log an entry to a session's transcript
   */
  logToTranscript(sessionId: string, entry: SessionTranscriptEntry): void {
    if (!this.transcripts.has(sessionId)) {
      this.transcripts.set(sessionId, []);
    }
    
    const transcript = this.transcripts.get(sessionId);
    if (transcript) {
      transcript.push(entry);
    }
  }

  /**
   * Update session working memory
   */
  updateWorkingMemory(sessionId: string, fragment: MemoryFragment): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Add fragment to context window
    const newContextWindow = [...session.workingMemory.contextWindow, fragment];
    
    // Trim if exceeding max fragments
    if (newContextWindow.length > session.workingMemory.maxFragments) {
      newContextWindow.shift(); // Remove oldest fragment
    }
    
    // Update working memory
    session.workingMemory = {
      ...session.workingMemory,
      contextWindow: newContextWindow
    };
  }

  /**
   * Update session stats
   */
  updateStats(sessionId: string, updates: Partial<AgentSessionStats>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.stats = {
      ...session.stats,
      ...updates
    };
  }

  /**
   * Set timeout for automatic session closure
   */
  private setTimeout(sessionId: string): void {
    const timeout = setTimeout(() => {
      this.handleSessionTimeout(sessionId);
    }, DEFAULT_SESSION_TIMEOUT_MS);
    
    this.timeouts.set(sessionId, timeout);
  }

  /**
   * Reset timeout for a session (when it's accessed)
   */
  private resetTimeout(sessionId: string): void {
    this.clearTimeout(sessionId);
    this.setTimeout(sessionId);
  }

  /**
   * Clear timeout for a session
   */
  private clearTimeout(sessionId: string): void {
    const timeout = this.timeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(sessionId);
    }
  }

  /**
   * Handle session timeout
   */
  private handleSessionTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Only end active sessions
    if (session.status === 'active' || session.status === 'initializing') {
      console.debug(`[SESSION] Session ${sessionId} timed out after ${DEFAULT_SESSION_TIMEOUT_MS}ms`);
      
      // Log timeout to transcript
      this.logToTranscript(sessionId, {
        timestamp: new Date(),
        type: 'system',
        content: `Session timed out for agent ${session.agentId}`,
        metadata: { sessionId, agentId: session.agentId }
      });
      
      // End session
      this.endSession(sessionId);
    }
    
    // Clean up timeout reference
    this.timeouts.delete(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): AgentSession[] {
    const activeSessions: AgentSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.status !== 'completed' && session.status !== 'error') {
        activeSessions.push(session);
      }
    }
    return activeSessions;
  }

  /**
   * Cleanup resources (clear all timeouts)
   */
  cleanup(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
  }
}

/**
 * Transcript entry for session logging
 */
export interface SessionTranscriptEntry {
  timestamp: Date;
  type: 'system' | 'agent' | 'tool' | 'error';
  content: string;
  metadata?: Record<string, any>;
}