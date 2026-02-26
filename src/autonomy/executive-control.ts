/**
 * Executive Control System
 * 
 * Manages attention, decides what to focus on, and coordinates cognitive resources.
 * Acts as the "CEO" of the cognitive system, allocating resources and resolving conflicts.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Attention focus target */
export interface AttentionFocus {
  readonly focusId: string;
  readonly targetType: 'goal' | 'stimulus' | 'memory' | 'process' | 'external';
  readonly targetId: string;
  readonly priority: number; // 0-1
  readonly intensity: number; // 0-1, how much attention allocated
  readonly duration: number; // expected duration in ms
  readonly startedAt: number;
  readonly expectedValue: number; // 0-1
}

/** Cognitive resource allocation */
export interface ResourceAllocation {
  readonly workingMemory: number; // 0-1, portion allocated
  readonly processing: number; // 0-1, CPU-like allocation
  readonly learning: number; // 0-1, plasticity allocation
  readonly retrieval: number; // 0-1, memory access allocation
}

/** Conflict between competing demands */
export interface CognitiveConflict {
  readonly conflictId: string;
  readonly type: 'resource' | 'goal' | 'information' | 'temporal';
  readonly competingDemands: string[];
  readonly severity: number; // 0-1
  readonly detectedAt: number;
  readonly resolution?: string;
  readonly resolvedAt?: number;
}

/** Control decision */
export interface ControlDecision {
  readonly decisionId: string;
  readonly timestamp: number;
  readonly type: 'focus' | 'switch' | 'allocate' | 'suppress' | 'escalate';
  readonly target: string;
  readonly reason: string;
  readonly expectedOutcome: string;
  readonly resources: ResourceAllocation;
}

/** Configuration for executive control */
export interface ExecutiveControlConfig {
  readonly baseDir: string;
  readonly maxConcurrentFocus: number;
  readonly attentionDecayRate: number;
  readonly conflictThreshold: number;
  readonly resourceReallocationInterval: number;
}

/**
 * Executive Control System
 * 
 * Manages attention and cognitive resources.
 */
export class ExecutiveControl {
  private config: Required<ExecutiveControlConfig>;
  private currentFocus: AttentionFocus | null = null;
  private focusQueue: AttentionFocus[] = [];
  private resources: ResourceAllocation;
  private conflicts: Map<string, CognitiveConflict> = new Map();
  private decisions: ControlDecision[] = [];
  private attentionHistory: Array<{ timestamp: number; focusId: string | null }> = [];
  private initialized = false;

  constructor(config: Partial<ExecutiveControlConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/executive',
      maxConcurrentFocus: config.maxConcurrentFocus ?? 3,
      attentionDecayRate: config.attentionDecayRate ?? 0.05,
      conflictThreshold: config.conflictThreshold ?? 0.6,
      resourceReallocationInterval: config.resourceReallocationInterval ?? 1000,
    };

    // Start with balanced resources
    this.resources = {
      workingMemory: 0.25,
      processing: 0.25,
      learning: 0.25,
      retrieval: 0.25,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    this.initialized = true;
  }

  /**
   * Request attention for a target
   */
  requestAttention(request: Omit<AttentionFocus, 'focusId' | 'startedAt'>): boolean {
    const focus: AttentionFocus = {
      ...request,
      focusId: `focus-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startedAt: Date.now(),
    };

    // Check for conflicts
    const conflict = this.detectConflict(focus);
    if (conflict && conflict.severity > this.config.conflictThreshold) {
      this.conflicts.set(conflict.conflictId, conflict);

      // Try to resolve
      const resolution = this.resolveConflict(conflict);
      if (!resolution) {
        return false; // Cannot accommodate
      }
    }

    // Add to queue
    this.focusQueue.push(focus);
    this.focusQueue.sort((a, b) => b.priority - a.priority);

    // Try to activate immediately if possible
    this.updateAttention();
    return true;
  }

  /**
   * Release attention from current focus
   */
  releaseAttention(focusId: string, outcome?: string): void {
    // Remove from queue
    this.focusQueue = this.focusQueue.filter(f => f.focusId !== focusId);

    // If current focus, switch
    if (this.currentFocus?.focusId === focusId) {
      this.logDecision({
        decisionId: `dec-${Date.now()}`,
        timestamp: Date.now(),
        type: 'switch',
        target: focusId,
        reason: outcome ?? 'Focus completed',
        expectedOutcome: 'Free resources for next focus',
        resources: { ...this.resources },
      });

      this.currentFocus = null;
      this.updateAttention();
    }
  }

  /**
   * Update attention allocation
   */
  updateAttention(): void {
    // Check if current focus is still valid
    if (this.currentFocus) {
      const elapsed = Date.now() - this.currentFocus.startedAt;
      const decayedPriority = this.currentFocus.priority *
        Math.exp(-this.config.attentionDecayRate * elapsed / 1000);

      // Check if exceeded duration or priority decayed too much
      if (elapsed > this.currentFocus.duration || decayedPriority < 0.2) {
        this.releaseAttention(this.currentFocus.focusId, 'Duration exceeded or priority decayed');
        return;
      }
    }

    // If no current focus, activate next
    if (!this.currentFocus && this.focusQueue.length > 0) {
      const next = this.focusQueue.shift();
      if (next) {
        this.activateFocus(next);
      }
    }

    // Record attention state
    this.attentionHistory.push({
      timestamp: Date.now(),
      focusId: this.currentFocus?.focusId ?? null,
    });

    // Keep history bounded
    if (this.attentionHistory.length > 10000) {
      this.attentionHistory = this.attentionHistory.slice(-5000);
    }
  }

  /**
   * Allocate resources based on current demands
   */
  allocateResources(demands: {
    workingMemory?: number;
    processing?: number;
    learning?: number;
    retrieval?: number;
  }): ResourceAllocation {
    // Normalize demands
    const total = (demands.workingMemory ?? 0) +
      (demands.processing ?? 0) +
      (demands.learning ?? 0) +
      (demands.retrieval ?? 0);

    if (total === 0) {
      // Balanced allocation
      this.resources = { workingMemory: 0.25, processing: 0.25, learning: 0.25, retrieval: 0.25 };
    } else {
      // Allocate proportionally
      this.resources = {
        workingMemory: (demands.workingMemory ?? 0.25) / Math.max(1, total),
        processing: (demands.processing ?? 0.25) / Math.max(1, total),
        learning: (demands.learning ?? 0.25) / Math.max(1, total),
        retrieval: (demands.retrieval ?? 0.25) / Math.max(1, total),
      };
    }

    this.logDecision({
      decisionId: `dec-${Date.now()}`,
      timestamp: Date.now(),
      type: 'allocate',
      target: 'resources',
      reason: 'Reallocating based on current demands',
      expectedOutcome: 'Optimal resource utilization',
      resources: { ...this.resources },
    });

    return { ...this.resources };
  }

  /**
   * Suppress a competing focus (inhibition)
   */
  suppressFocus(focusId: string, reason: string): boolean {
    const focus = this.focusQueue.find(f => f.focusId === focusId);
    if (!focus) return false;

    // Remove from queue
    this.focusQueue = this.focusQueue.filter(f => f.focusId !== focusId);

    this.logDecision({
      decisionId: `dec-${Date.now()}`,
      timestamp: Date.now(),
      type: 'suppress',
      target: focusId,
      reason,
      expectedOutcome: 'Reduced interference',
      resources: { ...this.resources },
    });

    return true;
  }

  /**
   * Escalate to higher-level processing
   */
  escalate(issue: {
    description: string;
    severity: number;
    context: string;
  }): void {
    this.logDecision({
      decisionId: `dec-${Date.now()}`,
      timestamp: Date.now(),
      type: 'escalate',
      target: 'higher_level',
      reason: issue.description,
      expectedOutcome: 'Complex issue requires executive attention',
      resources: { ...this.resources },
    });

    // Create high-priority focus for escalation
    this.requestAttention({
      targetType: 'process',
      targetId: 'escalation',
      priority: issue.severity,
      intensity: 0.9,
      duration: 60000,
      expectedValue: issue.severity,
    });
  }

  /**
   * Get current attention state
   */
  getCurrentFocus(): AttentionFocus | null {
    return this.currentFocus;
  }

  /**
   * Get attention queue
   */
  getFocusQueue(): AttentionFocus[] {
    return [...this.focusQueue];
  }

  /**
   * Get current resource allocation
   */
  getResources(): ResourceAllocation {
    return { ...this.resources };
  }

  /**
   * Get active conflicts
   */
  getActiveConflicts(): CognitiveConflict[] {
    return Array.from(this.conflicts.values())
      .filter(c => !c.resolvedAt);
  }

  /**
   * Get attention statistics
   */
  getAttentionStats(durationMs: number = 60000): {
    focusChanges: number;
    avgFocusDuration: number;
    attentionShifts: number;
    primaryFocusTypes: Record<string, number>;
  } {
    const cutoff = Date.now() - durationMs;
    const recent = this.attentionHistory.filter(h => h.timestamp >= cutoff);

    if (recent.length < 2) {
      return {
        focusChanges: 0,
        avgFocusDuration: 0,
        attentionShifts: 0,
        primaryFocusTypes: {},
      };
    }

    // Count focus changes
    let focusChanges = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].focusId !== recent[i - 1].focusId) {
        focusChanges++;
      }
    }

    // Calculate average focus duration
    const focusPeriods: number[] = [];
    let currentStart = recent[0].timestamp;
    let currentFocus = recent[0].focusId;

    for (let i = 1; i < recent.length; i++) {
      if (recent[i].focusId !== currentFocus) {
        focusPeriods.push(recent[i].timestamp - currentStart);
        currentStart = recent[i].timestamp;
        currentFocus = recent[i].focusId;
      }
    }

    const avgFocusDuration = focusPeriods.length > 0
      ? focusPeriods.reduce((a, b) => a + b, 0) / focusPeriods.length
      : 0;

    // Count focus types
    const focusTypes: Record<string, number> = {};
    for (const focus of [...this.focusQueue, this.currentFocus].filter(Boolean) as AttentionFocus[]) {
      focusTypes[focus.targetType] = (focusTypes[focus.targetType] ?? 0) + 1;
    }

    return {
      focusChanges,
      avgFocusDuration,
      attentionShifts: focusChanges,
      primaryFocusTypes: focusTypes,
    };
  }

  /**
   * Get control decisions history
   */
  getDecisionHistory(limit: number = 100): ControlDecision[] {
    return this.decisions.slice(-limit);
  }

  // Private methods

  private activateFocus(focus: AttentionFocus): void {
    this.currentFocus = focus;

    // Allocate resources based on focus type
    switch (focus.targetType) {
      case 'goal':
        this.allocateResources({ processing: 0.4, workingMemory: 0.3, retrieval: 0.2, learning: 0.1 });
        break;
      case 'stimulus':
        this.allocateResources({ processing: 0.3, workingMemory: 0.4, retrieval: 0.2, learning: 0.1 });
        break;
      case 'memory':
        this.allocateResources({ retrieval: 0.5, workingMemory: 0.3, processing: 0.15, learning: 0.05 });
        break;
      case 'process':
        this.allocateResources({ processing: 0.5, workingMemory: 0.25, learning: 0.15, retrieval: 0.1 });
        break;
      case 'external':
        this.allocateResources({ processing: 0.3, workingMemory: 0.3, retrieval: 0.2, learning: 0.2 });
        break;
    }

    this.logDecision({
      decisionId: `dec-${Date.now()}`,
      timestamp: Date.now(),
      type: 'focus',
      target: focus.focusId,
      reason: `Activating focus on ${focus.targetType}:${focus.targetId}`,
      expectedOutcome: 'Achieve focus objective',
      resources: { ...this.resources },
    });
  }

  private detectConflict(newFocus: AttentionFocus): CognitiveConflict | null {
    // Check resource conflict
    const activeFocuses = [...this.focusQueue];
    if (this.currentFocus) {
      activeFocuses.push(this.currentFocus);
    }

    if (activeFocuses.length >= this.config.maxConcurrentFocus) {
      return {
        conflictId: `conflict-${Date.now()}`,
        type: 'resource',
        competingDemands: activeFocuses.map(f => f.focusId),
        severity: 0.7,
        detectedAt: Date.now(),
      };
    }

    // Check goal conflict
    const goalConflicts = activeFocuses.filter(f =>
      f.targetType === 'goal' &&
      newFocus.targetType === 'goal' &&
      f.targetId !== newFocus.targetId
    );

    if (goalConflicts.length > 0) {
      return {
        conflictId: `conflict-${Date.now()}`,
        type: 'goal',
        competingDemands: [...goalConflicts.map(f => f.focusId), newFocus.focusId],
        severity: 0.6,
        detectedAt: Date.now(),
      };
    }

    return null;
  }

  private resolveConflict(conflict: CognitiveConflict): boolean {
    switch (conflict.type) {
      case 'resource':
        // Release lowest priority focus
        const lowestPriority = this.focusQueue
          .sort((a, b) => a.priority - b.priority)[0];
        if (lowestPriority && lowestPriority.priority < 0.3) {
          this.releaseAttention(lowestPriority.focusId, 'Resource conflict resolution');
          (conflict as any).resolution = `Released ${lowestPriority.focusId}`;
          (conflict as any).resolvedAt = Date.now();
          return true;
        }
        return false;

      case 'goal':
        // Can handle multiple goals if resources allow
        return this.focusQueue.length < this.config.maxConcurrentFocus;

      default:
        return true;
    }
  }

  private logDecision(decision: ControlDecision): void {
    this.decisions.push(decision);

    // Keep bounded
    if (this.decisions.length > 10000) {
      this.decisions = this.decisions.slice(-5000);
    }
  }

  private async saveState(): Promise<void> {
    const state = {
      currentFocus: this.currentFocus,
      focusQueue: this.focusQueue,
      resources: this.resources,
      conflicts: Array.from(this.conflicts.entries()),
      decisions: this.decisions.slice(-100),
      attentionHistory: this.attentionHistory.slice(-1000),
    };
    await writeFile(
      join(this.config.baseDir, 'executive-control.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'executive-control.json'), 'utf-8');
      const state = JSON.parse(data);
      this.currentFocus = state.currentFocus ?? null;
      this.focusQueue = state.focusQueue ?? [];
      this.resources = state.resources ?? this.resources;
      this.conflicts = new Map(state.conflicts);
      this.decisions = state.decisions ?? [];
      this.attentionHistory = state.attentionHistory ?? [];
    } catch {
      // No state to load
    }
  }
}
