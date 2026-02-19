/**
 * Multi-Agent Types Module
 * 
 * Core interfaces for the multi-agent orchestration system.
 */

import type { Operator, Tenant } from '../identity/types.js';
import type { TenantContext, TenantWorkspace } from '../tenant/types.js';
import type { PolicyDecision, AutonomyLevel } from '../policy/types.js';
import type { SessionKey, UUID } from '../types.js';

/**
 * Policy context for agent sessions
 * (Defined here as M11's PolicyContext is not exported)
 */
export interface AgentPolicyContext {
  /** Session identifier */
  readonly sessionId: string;
  /** Tenant context */
  readonly tenant: Tenant;
  /** Operator context */
  readonly operator: Operator;
  /** Autonomy level for this context */
  readonly autonomyLevel: AutonomyLevel;
}

/**
 * AgentProfile - Static definition of an agent's capabilities and behavior
 * Stored in: config/agents/registry.json
 * Hot-reloadable via file watcher
 */
export interface AgentProfile {
  /** Unique identifier (e.g., "researcher", "coder", "reviewer") */
  readonly id: string;
  
  /** Human-readable display name */
  readonly name: string;
  
  /** Description of what this agent does */
  readonly description: string;
  
  /** Capability tags for routing (e.g., ["web_search", "code_review"]) */
  readonly capabilities: readonly string[];
  
  /** Model alias or provider/model string */
  readonly model: string;
  
  /** Agent-specific system prompt */
  readonly systemPrompt: string;
  
  /** Token budget per turn (default: 4000) */
  readonly maxTokensPerTurn: number;
  
  /** Optional tool allowlist (restricts to these tools only) */
  readonly allowedTools?: readonly string[];
  
  /** Tool blocklist (agent cannot use these) */
  readonly forbiddenTools?: readonly string[];
  
  /** If true, cannot run standalone (must be child of parent session) */
  readonly parentSessionOnly: boolean;
  
  /** Visual badge configuration for transcript */
  readonly badge: AgentBadge;
  
  /** Default routing priority (higher = preferred for capability matches) */
  readonly routingPriority: number;
}

/**
 * Visual badge for transcript attribution
 */
export interface AgentBadge {
  /** Display name (may differ from profile.name) */
  readonly displayName: string;
  
  /** Single emoji character */
  readonly emoji: string;
  
  /** Hex color for UI rendering (e.g., "#4A90D9") */
  readonly color: string;
  
  /** Short abbreviation for compact display (max 3 chars) */
  readonly abbreviation: string;
}

/**
 * AgentRegistry - Manages the collection of available agent profiles
 * Singleton pattern, initialized at startup
 */
export interface AgentRegistry {
  /** Get a profile by ID */
  getProfile(agentId: string): AgentProfile | undefined;
  
  /** Get all profiles matching a capability */
  findByCapability(capability: string): AgentProfile[];
  
  /** Get all registered profiles */
  getAllProfiles(): readonly AgentProfile[];
  
  /** Check if profile exists */
  hasProfile(agentId: string): boolean;
  
  /** Reload profiles from disk (hot-reload support) */
  reload(): Promise<void>;
  
  /** Validate a profile without registering it */
  validateProfile(profile: unknown): ValidationResult;
  
  /** Get registry statistics */
  getStats(): RegistryStats;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface RegistryStats {
  readonly totalProfiles: number;
  readonly totalCapabilities: number;
  readonly standaloneCount: number;
  readonly childOnlyCount: number;
  readonly lastReloadedAt: Date;
}

/**
 * TaskRouter - Determines agent assignment for tasks
 * Strategy pattern implementation
 */
export interface TaskRouter {
  /** Route a task to the most appropriate agent */
  route(task: TaskDescription, context: RoutingContext): RoutingDecision;
  
  /** Add a routing strategy */
  addStrategy(strategy: RoutingStrategy): void;
  
  /** Get current strategy chain */
  getStrategies(): readonly RoutingStrategy[];
}

/**
 * Description of work to be routed
 */
export interface TaskDescription {
  /** Normalized intent (from LLM extraction or explicit) */
  readonly intent: string;
  
  /** Required capabilities for this task */
  readonly requiredCapabilities: readonly string[];
  
  /** Estimated complexity for load balancing */
  readonly estimatedComplexity: ComplexityLevel;
  
  /** Explicitly requested agent from @mention */
  readonly preferredAgent?: string;
  
  /** Original user input for context */
  readonly originalInput: string;
}

export type ComplexityLevel = 'low' | 'medium' | 'high';

/**
 * Context available for routing decisions
 */
export interface RoutingContext {
  /** Parent session identifier */
  readonly parentSessionId: string;
  
  /** Current tenant context */
  readonly tenantContext: TenantContext;
  
  /** Operator identity */
  readonly operator: Operator;
  
  /** Current agent session (if any) */
  readonly currentAgentSession?: AgentSession;
  
  /** History of recent routing decisions */
  readonly routingHistory: readonly RoutingDecision[];
  
  /** Maximum agents allowed in this session */
  readonly maxAgents: number;
}

/**
 * Result of a routing decision
 */
export interface RoutingDecision {
  /** Selected agent profile ID */
  readonly agentId: string;
  
  /** Which strategy made the decision */
  readonly strategy: string;
  
  /** Confidence score (0.0 - 1.0) */
  readonly confidence: number;
  
  /** Human-readable reasoning */
  readonly reasoning: string;
  
  /** Whether this is a handoff from another agent */
  readonly isHandoff: boolean;
  
  /** Previous agent (if handoff) */
  readonly handoffFrom?: string;
  
  /** Timestamp of decision */
  readonly decidedAt: Date;
}

/**
 * RoutingStrategy interface for pluggable routing algorithms
 */
export interface RoutingStrategy {
  readonly name: string;
  readonly priority: number;
  
  /** 
   * Attempt to route the task
   * @returns RoutingDecision if this strategy can handle, undefined otherwise
   */
  route(task: TaskDescription, context: RoutingContext): RoutingDecision | undefined;
}

/**
 * AgentSession - Runtime instance of an agent within a parent session
 * Created on each agent activation/handoff
 */
export interface AgentSession {
  /** Unique identifier for this agent session (UUID) */
  readonly id: string;
  
  /** Parent session identifier */
  readonly parentSessionId: string;
  
  /** Agent profile being used */
  readonly agentId: string;
  
  /** When this agent was activated */
  readonly startedAt: Date;
  
  /** When this agent completed (undefined if active) */
  readonly completedAt?: Date;
  
  /** Previous agent session (if handoff) */
  readonly handoffFrom?: string;
  
  /** Reason for this handoff/activation */
  readonly handoffReason: string;
  
  /** Routing decision that led to this agent */
  readonly routingDecision: RoutingDecision;
  
  /** Tenant context (inherited from parent) */
  readonly tenantId: string;
  
  /** Operator context (inherited from parent) */
  readonly operatorId: string;
  
  /** Policy context with agent-specific fields */
  readonly policyContext: AgentPolicyContext;
  
  /** Agent's isolated working memory */
  readonly workingMemory: WorkingMemory;
  
  /** Handoff packet received (if any) */
  readonly receivedHandoff?: HandoffPacket;
  
  /** Status of this agent session */
  status: AgentSessionStatus;
  
  /** Tool call statistics */
  stats: AgentSessionStats;
}

export type AgentSessionStatus = 
  | 'initializing'
  | 'active'
  | 'handoff_pending'
  | 'completed'
  | 'error';

export interface AgentSessionStats {
  readonly messagesReceived: number;
  readonly messagesSent: number;
  readonly toolCallsMade: number;
  readonly toolCallsBlocked: number;
  readonly tokensUsed: number;
}

/**
 * Working memory isolated to this agent session
 */
export interface WorkingMemory {
  /** Short-term context window */
  readonly contextWindow: readonly MemoryFragment[];
  
  /** Agent's notes/scratchpad */
  readonly scratchpad: string;
  
  /** Key artifacts produced */
  readonly artifacts: readonly string[];
  
  /** Maximum fragments to retain */
  readonly maxFragments: number;
}

export interface MemoryFragment {
  readonly id: string;
  readonly content: string;
  readonly source: 'user' | 'tool' | 'thought' | 'handoff';
  readonly timestamp: Date;
  readonly importance: number; // 0-1 for pruning decisions
}

/**
 * HandoffPacket - Structured context passed between agents
 */
export interface HandoffPacket {
  /** Unique identifier for this handoff */
  readonly handoffId: string;
  
  /** Source agent session */
  readonly fromAgentSessionId: string;
  
  /** Target agent profile */
  readonly toAgentId: string;
  
  /** Timestamp */
  readonly createdAt: Date;
  
  /** Summary of work completed by source agent */
  readonly workSummary: WorkSummary;
  
  /** Key findings/artifacts to transfer */
  readonly keyFindings: readonly KeyFinding[];
  
  /** Open questions or blockers */
  readonly openQuestions: readonly string[];
  
  /** Relevant context fragments from source */
  readonly contextTransfer: readonly ContextTransferItem[];
  
  /** Routing decision that triggered this handoff */
  readonly routingDecision: RoutingDecision;
}

export interface WorkSummary {
  readonly description: string;
  readonly stepsCompleted: number;
  readonly stepsFailed: number;
  readonly artifactsProduced: readonly string[];
  readonly toolsUsed: readonly string[];
}

export interface KeyFinding {
  readonly type: 'fact' | 'code' | 'url' | 'file' | 'decision';
  readonly content: string;
  readonly confidence: number;
  readonly source?: string;
}

export interface ContextTransferItem {
  readonly fragmentId: string;
  readonly content: string;
  readonly relevanceScore: number;
  readonly source: string;
}

/**
 * AgentSessionManager - Manages lifecycle of agent sessions
 * One per parent session
 */
export interface AgentSessionManager {
  /** Create a new agent session */
  createSession(
    agentId: string,
    parentSessionId: string,
    handoffPacket?: HandoffPacket
  ): Promise<AgentSession>;
  
  /** Get active session (if any) */
  getActiveSession(): AgentSession | undefined;
  
  /** Get session by ID */
  getSession(sessionId: string): AgentSession | undefined;
  
  /** Get all sessions for parent */
  getAllSessions(): readonly AgentSession[];
  
  /** Complete current session and create handoff */
  initiateHandoff(
    reason: string,
    workSummary: WorkSummary
  ): Promise<HandoffPacket>;
  
  /** Mark session as complete */
  completeSession(sessionId: string, output: AgentOutput): Promise<void>;
  
  /** Terminate session with error */
  failSession(sessionId: string, error: Error): Promise<void>;
  
  /** Get session history in chronological order */
  getSessionHistory(): readonly AgentSession[];
}

export interface AgentOutput {
  readonly content: string;
  readonly artifacts: readonly string[];
  readonly followUpQuestions: readonly string[];
}

/**
 * Extended TranscriptEntry with agent attribution
 * Extends existing TranscriptEntry from M9
 */
export interface AgentTranscriptEntry {
  // ... existing transcript fields ...
  
  /** Agent attribution (undefined for operator messages) */
  readonly agentAttribution?: AgentAttribution;
  
  /** Type of entry for rendering decisions */
  readonly entryType: TranscriptEntryType;
  
  /** Visual rendering hints */
  readonly renderingHints: RenderingHints;
}

export interface AgentAttribution {
  /** Agent profile ID */
  readonly agentId: string;
  
  /** Agent session ID (specific activation) */
  readonly agentSessionId: string;
  
  /** Display badge */
  readonly badge: AgentBadge;
  
  /** Why this agent was chosen */
  readonly routingReason: string;
  
  /** Previous agent (if handoff) */
  readonly handoffFrom?: string;
  
  /** Time agent became active for this message */
  readonly activatedAt: Date;
}

export type TranscriptEntryType = 
  | 'operator_input'
  | 'agent_response'
  | 'handoff_transition'
  | 'tool_call'
  | 'tool_result'
  | 'system_notice'
  | 'error';

export interface RenderingHints {
  /** Whether to show agent badge */
  readonly showBadge: boolean;
  /** Whether to show routing reasoning on hover */
  readonly showReasoning: boolean;
  /** Indentation level for threading */
  readonly indentLevel: number;
  /** Background tint color (optional) */
  readonly backgroundTint?: string;
}

/**
 * Extended PolicyContext with agent information
 * Integrates with M12 TenantContext and Operator identity
 */
export interface ExtendedPolicyContext extends AgentPolicyContext {
  // M13 additions
  readonly agent?: AgentContext;
  readonly routingChain: readonly string[];
}

/**
 * Agent-specific context for policy decisions
 */
export interface AgentContext {
  readonly agentId: string;
  readonly agentSessionId: string;
  readonly capabilities: readonly string[];
  readonly isOrchestrator: boolean;
  readonly parentSessionOnly: boolean;
}

/**
 * Extended tenant context for multi-agent sessions
 */
export interface MultiAgentTenantContext extends TenantContext {
  /** Maximum agents allowed per session for this tenant */
  readonly maxAgentsPerSession: number;
  
  /** Allowed agent profiles for this tenant */
  readonly allowedAgentProfiles?: readonly string[];
  
  /** Tenant-specific agent profile overrides */
  readonly agentProfileOverrides?: Record<string, Partial<AgentProfile>>;
}

/**
 * AgentWorkspace - Scoped workspace for agent session
 */
export interface AgentWorkspace {
  /** Base tenant workspace */
  readonly tenantWorkspace: TenantWorkspace;
  
  /** Agent session identifier */
  readonly agentSessionId: string;
  
  /** Agent-scoped path for artifacts */
  readonly agentArtifactsPath: string;
  
  /** Agent-scoped path for temporary files */
  readonly agentTempPath: string;
  
  /** Agent-scoped path for working memory */
  readonly agentMemoryPath: string;
  
  /** Check if path is within agent scope */
  isPathAllowed(path: string): boolean;
  
  /** Resolve path within agent scope */
  resolvePath(subPath: string): string;
}