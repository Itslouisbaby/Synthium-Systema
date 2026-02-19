/**
 * Multi-Agent Module Public API
 * 
 * Exports for the multi-agent orchestration system.
 */

// Core types
export type {
  AgentProfile,
  AgentBadge,
  AgentRegistry,
  ValidationResult,
  RegistryStats,
  TaskRouter,
  TaskDescription,
  ComplexityLevel,
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
  AgentSession,
  AgentSessionStatus,
  AgentSessionStats,
  WorkingMemory,
  MemoryFragment,
  HandoffPacket,
  WorkSummary,
  KeyFinding,
  ContextTransferItem,
  AgentSessionManager,
  AgentOutput,
  AgentTranscriptEntry,
  AgentAttribution,
  TranscriptEntryType,
  RenderingHints,
  ExtendedPolicyContext,
  AgentContext,
  MultiAgentTenantContext,
  AgentWorkspace
} from './types.js';

// Core implementations
export { AgentRegistryImpl } from './registry.js';
export { TaskRouterImpl } from './router.js';

// Routing strategies
export {
  ExplicitMentionStrategy,
  CapabilityMatchStrategy,
  StickySessionStrategy,
  RoundRobinStrategy,
  OrchestratorFallbackStrategy
} from './router.js';