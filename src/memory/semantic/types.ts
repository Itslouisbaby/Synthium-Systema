/**
 * Semantic Fact Types - Milestone 8
 * Durable, auditable facts extracted from tool executions
 */

/**
 * Evidence linking fact to source artifacts
 */
export interface FactEvidence {
  /** Evidence type */
  readonly type: 'observation' | 'tool_result' | 'evaluation';
  /** Reference ID (UUID) */
  readonly refId: string;
  /** When evidence was captured */
  readonly timestampMs: number;
}

/**
 * SemanticFact - Durable fact from successful tool execution
 */
export interface SemanticFact {
  /** Unique fact ID */
  readonly factId: string;
  /** Human-readable statement */
  readonly statement: string;
  /** SHA-256 of normalized statement (for dedupe) */
  readonly statementHash: string;
  /** Confidence 0.0-1.0 (capped at 0.99) */
  readonly confidence: number;
  /** When fact was created */
  readonly createdAtMs: number;
  /** Last verification timestamp */
  readonly lastVerifiedMs: number;
  /** Last reinforcement timestamp */
  readonly lastReinforcedMs: number;
  /** Evidence references */
  readonly evidence: FactEvidence[];
  /** Source of fact */
  readonly source: 'consolidator';
  /** Privacy level */
  readonly privacyLevel: 'private' | 'public';
  /** Optional tool name, used for evaluation/tests */
  readonly toolName?: string;
  /** Optional session key, used for evaluation/tests */
  readonly sessionKey?: string;
}

/**
 * Index entry: keyword -> fact IDs
 */
export interface KeywordIndex {
  readonly [keyword: string]: string[];
}

/**
 * Result of adding a fact
 */
export interface AddFactResult {
  /** Whether new fact was added (false if deduped) */
  readonly added: boolean;
  /** The resulting fact (new or reinforced) */
  readonly fact?: SemanticFact;
}

/**
 * Candidate fact for ingestion
 */
export interface CandidateFact {
  readonly statement: string;
  readonly evidence: FactEvidence[];
  readonly privacyLevel: 'private' | 'public';
}

/**
 * Semantic store configuration
 */
export interface SemanticStoreConfig {
  /** Max facts (default: 1000) */
  readonly maxFacts: number;
  /** Recall limit (default: 10) */
  readonly recallLimit: number;
  /** Base directory for storage */
  readonly baseDir: string;
}

export const DEFAULT_SEMANTIC_CONFIG: SemanticStoreConfig = {
  maxFacts: 1000,
  recallLimit: 10,
  baseDir: '.synth/memory/semantic',
};
