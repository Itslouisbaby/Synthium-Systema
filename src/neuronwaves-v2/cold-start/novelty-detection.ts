/**
 * Novelty Detection + Cold-Start Mode
 * Section 10: Bootstrapping in novel domains
 */

import type { 
  WorkingState, 
  TaskTrace, 
  Skill,
  StateDelta 
} from '../types.js';

/** Novelty detection configuration */
export interface NoveltyDetectionConfig {
  /** Similarity threshold for novelty detection */
  readonly similarityThreshold?: number;
  /** Minimum traces required for similarity comparison */
  readonly minTracesForComparison?: number;
  /** Concept overlap threshold */
  readonly conceptOverlapThreshold?: number;
}

/** Novelty detection result */
export interface NoveltyResult {
  readonly isNovel: boolean;
  readonly similarityScore: number;
  readonly closestMatch?: {
    readonly traceId: string;
    readonly similarity: number;
  };
  readonly reasons: string[];
}

/** Cold-start configuration */
export interface ColdStartConfig {
  /** Prefer learn-first actions */
  readonly learnFirstMode?: boolean;
  /** Max reconnaissance steps */
  readonly maxReconnaissanceSteps?: number;
  /** Require approval for risky actions */
  readonly requireApproval?: boolean;
}

/**
 * NoveltyDetector - Detects novel domains without prior scaffolding
 */
export class NoveltyDetector {
  private readonly config: Required<NoveltyDetectionConfig>;

  constructor(config: NoveltyDetectionConfig = {}) {
    this.config = {
      similarityThreshold: config.similarityThreshold ?? 0.3,
      minTracesForComparison: config.minTracesForComparison ?? 5,
      conceptOverlapThreshold: config.conceptOverlapThreshold ?? 0.2,
    };
  }

  /**
   * Detect if current context is novel
   */
  detectNovelty(
    context: {
      concepts: string[];
      content: string;
    },
    knownTraces: TaskTrace[],
    knownSkills: Skill[]
  ): NoveltyResult {
    // Not enough data to determine
    if (knownTraces.length < this.config.minTracesForComparison) {
      return {
        isNovel: true,
        similarityScore: 0,
        reasons: ['Insufficient historical data for comparison'],
      };
    }

    const reasons: string[] = [];

    // Check concept overlap with known traces
    const conceptScores = knownTraces.map(trace => ({
      traceId: trace.traceId,
      overlap: this.calculateConceptOverlap(context.concepts, trace.detectedConcepts),
    }));

    conceptScores.sort((a, b) => b.overlap - a.overlap);
    const bestConceptMatch = conceptScores[0];

    if (bestConceptMatch.overlap < this.config.conceptOverlapThreshold) {
      reasons.push(`Low concept overlap: ${bestConceptMatch.overlap.toFixed(2)} < ${this.config.conceptOverlapThreshold}`);
    }

    // Check skill applicability
    const applicableSkills = knownSkills.filter(skill => 
      skill.trigger.concepts.some(c => context.concepts.includes(c))
    );

    if (applicableSkills.length === 0) {
      reasons.push('No applicable skills found');
    }

    // Calculate overall similarity
    const similarityScore = bestConceptMatch?.overlap ?? 0;
    const isNovel = similarityScore < this.config.similarityThreshold || reasons.length > 0;

    return {
      isNovel,
      similarityScore,
      closestMatch: bestConceptMatch?.overlap > 0 ? {
        traceId: bestConceptMatch.traceId,
        similarity: bestConceptMatch.overlap,
      } : undefined,
      reasons,
    };
  }

  /**
   * Calculate concept overlap (Jaccard similarity)
   */
  private calculateConceptOverlap(concepts1: string[], concepts2: string[]): number {
    const set1 = new Set(concepts1.map(c => c.toLowerCase()));
    const set2 = new Set(concepts2.map(c => c.toLowerCase()));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * Create state delta to enable cold-start mode
   */
  enableColdStartMode(): StateDelta {
    return {
      section: 'coldStart',
      path: '',
      value: true,
      operation: 'set',
    };
  }

  /**
   * Create state delta to disable cold-start mode
   */
  disableColdStartMode(): StateDelta {
    return {
      section: 'coldStart',
      path: '',
      value: false,
      operation: 'set',
    };
  }
}

/**
 * ColdStartProtocol - Manages cold-start behavior
 */
export class ColdStartProtocol {
  private readonly config: Required<ColdStartConfig>;
  private reconnaissanceCount = 0;

  constructor(config: ColdStartConfig = {}) {
    this.config = {
      learnFirstMode: config.learnFirstMode ?? true,
      maxReconnaissanceSteps: config.maxReconnaissanceSteps ?? 5,
      requireApproval: config.requireApproval ?? true,
    };
  }

  /**
   * Determine action type based on cold-start policy
   */
  determineActionType(action: {
    actionClass: string;
    isReversible: boolean;
    isReadOnly: boolean;
  }): 'allow' | 'ask' | 'reconnaissance' | 'request_approval' {
    // Always prefer reconnaissance in cold-start
    if (this.config.learnFirstMode && this.reconnaissanceCount < this.config.maxReconnaissanceSteps) {
      if (action.isReadOnly) {
        return 'reconnaissance';
      }
    }

    // Require approval for irreversible actions
    if (!action.isReversible && this.config.requireApproval) {
      return 'request_approval';
    }

    // Ask for external writes
    if (action.actionClass === 'external_write') {
      return 'ask';
    }

    // Allow local-only actions
    if (action.actionClass === 'local_only') {
      return 'allow';
    }

    // Default to asking in cold-start
    return 'ask';
  }

  /**
   * Record reconnaissance step
   */
  recordReconnaissance(): void {
    this.reconnaissanceCount++;
  }

  /**
   * Get reconnaissance count
   */
  getReconnaissanceCount(): number {
    return this.reconnaissanceCount;
  }

  /**
   * Reset reconnaissance count
   */
  resetReconnaissance(): void {
    this.reconnaissanceCount = 0;
  }

  /**
   * Check if still in learn-first phase
   */
  isInLearnFirstPhase(): boolean {
    return this.config.learnFirstMode && 
           this.reconnaissanceCount < this.config.maxReconnaissanceSteps;
  }

  /**
   * Generate clarifying question for cold-start
   */
  generateClarifyingQuestion(context: {
    missingConcepts: string[];
    unknownTerms: string[];
  }): string {
    if (context.missingConcepts.length > 0) {
      return `I'm not familiar with ${context.missingConcepts.join(', ')}. Could you explain what you mean?`;
    }

    if (context.unknownTerms.length > 0) {
      return `I encountered some unfamiliar terms: ${context.unknownTerms.join(', ')}. Could you clarify?`;
    }

    return "I'm in learning mode. Could you provide more context about what you're trying to do?";
  }

  /**
   * Draft abstraction from early attempts
   */
  draftAbstraction(attempts: Array<{
    content: string;
    concepts: string[];
    success: boolean;
  }>): {
    draftConcepts: string[];
    draftSchemas: string[];
    draftInvariants: string[];
  } {
    // Extract common patterns from successful attempts
    const successfulAttempts = attempts.filter(a => a.success);
    
    // Collect common concepts
    const conceptFrequency = new Map<string, number>();
    for (const attempt of successfulAttempts) {
      for (const concept of attempt.concepts) {
        conceptFrequency.set(concept, (conceptFrequency.get(concept) ?? 0) + 1);
      }
    }

    // Concepts that appear in >50% of successful attempts
    const draftConcepts = Array.from(conceptFrequency.entries())
      .filter(([, count]) => count >= successfulAttempts.length * 0.5)
      .map(([concept]) => concept);

    // Extract potential schemas from content patterns
    const draftSchemas: string[] = [];
    for (const attempt of successfulAttempts) {
      const patterns = this.extractPatterns(attempt.content);
      draftSchemas.push(...patterns);
    }

    // Propose invariants based on failure patterns
    const draftInvariants: string[] = [];
    const failedAttempts = attempts.filter(a => !a.success);
    for (const attempt of failedAttempts) {
      if (attempt.content.includes('delete') || attempt.content.includes('remove')) {
        draftInvariants.push('irreversible_actions_require_confirmation');
      }
    }

    return {
      draftConcepts: [...new Set(draftConcepts)],
      draftSchemas: [...new Set(draftSchemas)],
      draftInvariants: [...new Set(draftInvariants)],
    };
  }

  /**
   * Extract patterns from content
   */
  private extractPatterns(content: string): string[] {
    const patterns: string[] = [];

    // File operation pattern
    if (/read.*file|file.*read/i.test(content)) {
      patterns.push('file_read_operation');
    }

    // Web request pattern
    if (/fetch|request|http|api/i.test(content)) {
      patterns.push('web_request_operation');
    }

    // Calculation pattern
    if (/calculate|compute|sum|average/i.test(content)) {
      patterns.push('calculation_operation');
    }

    return patterns;
  }

  /**
   * Check if draft is ready for promotion
   */
  isReadyForPromotion(draft: {
    evaluationResults: Array<{ passed: boolean; score: number }>;
    humanApproved: boolean;
  }): boolean {
    // Must have human approval
    if (!draft.humanApproved) return false;

    // Must pass evaluation
    const allPassed = draft.evaluationResults.every(r => r.passed);
    if (!allPassed) return false;

    // Must have reasonable score
    const avgScore = draft.evaluationResults.reduce((sum, r) => sum + r.score, 0) / 
                     draft.evaluationResults.length;
    return avgScore >= 0.7;
  }
}
