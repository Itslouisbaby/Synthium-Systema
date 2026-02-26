/**
 * WorkingState - Bounded short-term consciousness
 * Section 1.2: Shared cognitive workspace for the session
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { 
  WorkingState, 
  StateDelta, 
  SessionKey, 
  Hash, 
  PlanChain, 
  PendingApproval,
  Uncertainty,
  SelfModel,
  ActiveSchema,
  ExecutionLedgerEntry,
  SessionBudgets,
  TimestampMs 
} from '../types.js';

/** WorkingState configuration */
export interface WorkingStateConfig {
  /** Base directory for state persistence */
  readonly baseDir: string;
  /** Maximum salience stack size */
  readonly maxSalienceStack?: number;
  /** Maximum secondary chains */
  readonly maxSecondaryChains?: number;
  /** Maximum background chains */
  readonly maxBackgroundChains?: number;
  /** Maximum pending approvals */
  readonly maxPendingApprovals?: number;
  /** Maximum uncertainties */
  readonly maxUncertainties?: number;
  /** Maximum execution ledger entries */
  readonly maxExecutionLedger?: number;
  /** Maximum active concepts */
  readonly maxActiveConcepts?: number;
  /** Maximum active schemas */
  readonly maxActiveSchemas?: number;
}

/** State snapshot with hash for versioning */
export interface StateSnapshot {
  readonly state: WorkingState;
  readonly hash: Hash;
  readonly timestampMs: TimestampMs;
  readonly parentHash?: Hash;
}

/** Default empty self model */
const createDefaultSelfModel = (): SelfModel => ({
  capabilities: {
    tools: [],
    actionClasses: ['local_only'],
    autonomyLevel: 1,
  },
  reliability: [],
  knownFailureModes: [],
  costModel: [],
  confidenceState: {
    overall: 1.0,
    topUncertaintyDrivers: [],
  },
});

/** Default session budgets */
const createDefaultBudgets = (): SessionBudgets => ({
  toolCallsRemaining: 100,
  memoryWritesRemaining: 1000,
  reflectionPassesRemaining: 10,
});

/** Create initial empty working state */
export const createInitialWorkingState = (): WorkingState => ({
  focus: {
    activeChainId: null,
    currentObjective: null,
    salienceStack: [],
  },
  chains: {
    primary: null,
    secondary: [],
    background: [],
  },
  pendingApprovals: [],
  uncertainties: [],
  selfModel: createDefaultSelfModel(),
  beliefGraphRef: null,
  activeConcepts: [],
  activeSchemas: [],
  executionLedger: [],
  budgets: createDefaultBudgets(),
  coldStart: false,
});

/**
 * Compute hash of working state for integrity verification
 */
export function computeStateHash(state: WorkingState): Hash {
  const data = JSON.stringify(state, Object.keys(state).sort());
  return createHash('sha256').update(data).digest('hex');
}

/**
 * WorkingStateManager - Manages bounded short-term consciousness
 * 
 * Design principles:
 * - Bounded: Size caps per section prevent unbounded growth
 * - Session-scoped: Each session has isolated working state
 * - Versioned: Hash chain for integrity and replay
 * - Structured: Avoid dumping raw unstructured text
 */
export class WorkingStateManager {
  private readonly config: WorkingStateConfig;
  private readonly stateCache: Map<SessionKey, WorkingState> = new Map();
  private readonly hashChain: Map<SessionKey, Hash[]> = new Map();

  constructor(config: WorkingStateConfig) {
    this.config = config;
  }

  /**
   * Get bounds configuration
   */
  private getBounds() {
    return {
      maxSalienceStack: this.config.maxSalienceStack ?? 10,
      maxSecondaryChains: this.config.maxSecondaryChains ?? 3,
      maxBackgroundChains: this.config.maxBackgroundChains ?? 5,
      maxPendingApprovals: this.config.maxPendingApprovals ?? 20,
      maxUncertainties: this.config.maxUncertainties ?? 10,
      maxExecutionLedger: this.config.maxExecutionLedger ?? 100,
      maxActiveConcepts: this.config.maxActiveConcepts ?? 20,
      maxActiveSchemas: this.config.maxActiveSchemas ?? 10,
    };
  }

  /**
   * Ensure session directory exists
   */
  private async ensureSessionDir(sessionKey: SessionKey): Promise<string> {
    const sessionDir = join(this.config.baseDir, sessionKey, 'state');
    await mkdir(sessionDir, { recursive: true });
    return sessionDir;
  }

  /**
   * Get or initialize working state for a session
   */
  getState(sessionKey: SessionKey): WorkingState {
    let state = this.stateCache.get(sessionKey);
    if (!state) {
      state = createInitialWorkingState();
      this.stateCache.set(sessionKey, state);
      this.hashChain.set(sessionKey, [computeStateHash(state)]);
    }
    return state;
  }

  /**
   * Apply state deltas to working state
   * 
   * @param sessionKey - Session to update
   * @param deltas - Array of state deltas
   * @returns New state hash
   */
  applyDeltas(sessionKey: SessionKey, deltas: StateDelta[]): Hash {
    const state = this.getState(sessionKey);
    const bounds = this.getBounds();

    // Create a mutable copy
    let newState: WorkingState = JSON.parse(JSON.stringify(state));

    for (const delta of deltas) {
      newState = this.applyDelta(newState, delta, bounds);
    }

    // Compute new hash
    const newHash = computeStateHash(newState);

    // Update cache
    this.stateCache.set(sessionKey, newState);

    // Update hash chain
    const chain = this.hashChain.get(sessionKey) ?? [];
    chain.push(newHash);
    this.hashChain.set(sessionKey, chain);

    return newHash;
  }

  /**
   * Apply a single delta to state
   */
  private applyDelta(
    state: WorkingState, 
    delta: StateDelta, 
    bounds: ReturnType<typeof this.getBounds>
  ): WorkingState {
    const { section, path, value, operation } = delta;

    switch (section) {
      case 'focus':
        return this.applyFocusDelta(state, path, value, operation, bounds);
      case 'chains':
        return this.applyChainsDelta(state, path, value, operation, bounds);
      case 'pendingApprovals':
        return this.applyPendingApprovalsDelta(state, path, value, operation, bounds);
      case 'uncertainties':
        return this.applyUncertaintiesDelta(state, path, value, operation, bounds);
      case 'selfModel':
        return this.applySelfModelDelta(state, path, value, operation);
      case 'beliefGraphRef':
        return { ...state, beliefGraphRef: value as Hash | null };
      case 'activeConcepts':
        return this.applyActiveConceptsDelta(state, path, value, operation, bounds);
      case 'activeSchemas':
        return this.applyActiveSchemasDelta(state, path, value, operation, bounds);
      case 'executionLedger':
        return this.applyExecutionLedgerDelta(state, path, value, operation, bounds);
      case 'budgets':
        return this.applyBudgetsDelta(state, path, value);
      case 'coldStart':
        return { ...state, coldStart: value as boolean };
      default:
        return state;
    }
  }

  private applyFocusDelta(
    state: WorkingState,
    path: string,
    value: unknown,
    operation: string,
    bounds: ReturnType<typeof this.getBounds>
  ): WorkingState {
    const newFocus = { ...state.focus };

    if (path === 'activeChainId') {
      newFocus.activeChainId = value as string | null;
    } else if (path === 'currentObjective') {
      newFocus.currentObjective = value as string | null;
    } else if (path === 'salienceStack') {
      if (operation === 'push') {
        newFocus.salienceStack = [value as string, ...newFocus.salienceStack].slice(0, bounds.maxSalienceStack);
      } else if (operation === 'set') {
        newFocus.salienceStack = (value as string[]).slice(0, bounds.maxSalienceStack);
      }
    }

    return { ...state, focus: newFocus };
  }

  private applyChainsDelta(
    state: WorkingState,
    path: string,
    value: unknown,
    operation: string,
    bounds: ReturnType<typeof this.getBounds>
  ): WorkingState {
    const newChains = { ...state.chains };

    if (path === 'primary') {
      newChains.primary = value as PlanChain | null;
    } else if (path === 'secondary') {
      if (operation === 'push') {
        newChains.secondary = [value as PlanChain, ...newChains.secondary].slice(0, bounds.maxSecondaryChains);
      } else if (operation === 'set') {
        newChains.secondary = (value as PlanChain[]).slice(0, bounds.maxSecondaryChains);
      }
    } else if (path === 'background') {
      if (operation === 'push') {
        newChains.background = [value as PlanChain, ...newChains.background].slice(0, bounds.maxBackgroundChains);
      } else if (operation === 'set') {
        newChains.background = (value as PlanChain[]).slice(0, bounds.maxBackgroundChains);
      }
    }

    return { ...state, chains: newChains };
  }

  private applyPendingApprovalsDelta(
    state: WorkingState,
    path: string,
    value: unknown,
    operation: string,
    bounds: ReturnType<typeof this.getBounds>
  ): WorkingState {
    let newPendingApprovals = [...state.pendingApprovals];

    if (operation === 'push') {
      newPendingApprovals = [value as PendingApproval, ...newPendingApprovals].slice(0, bounds.maxPendingApprovals);
    } else if (operation === 'remove') {
      newPendingApprovals = newPendingApprovals.filter(a => a.stepId !== value);
    } else if (operation === 'set') {
      newPendingApprovals = (value as PendingApproval[]).slice(0, bounds.maxPendingApprovals);
    }

    return { ...state, pendingApprovals: newPendingApprovals };
  }

  private applyUncertaintiesDelta(
    state: WorkingState,
    path: string,
    value: unknown,
    operation: string,
    bounds: ReturnType<typeof this.getBounds>
  ): WorkingState {
    let newUncertainties = [...state.uncertainties];

    if (operation === 'push') {
      newUncertainties = [value as Uncertainty, ...newUncertainties].slice(0, bounds.maxUncertainties);
    } else if (operation === 'remove') {
      newUncertainties = newUncertainties.filter(u => u.id !== value);
    } else if (operation === 'set') {
      newUncertainties = (value as Uncertainty[]).slice(0, bounds.maxUncertainties);
    }

    return { ...state, uncertainties: newUncertainties };
  }

  private applySelfModelDelta(
    state: WorkingState,
    path: string,
    value: unknown,
    operation: string
  ): WorkingState {
    const newSelfModel = { ...state.selfModel };

    if (path === 'capabilities') {
      newSelfModel.capabilities = value as SelfModel['capabilities'];
    } else if (path === 'reliability') {
      if (operation === 'push') {
        newSelfModel.reliability = [...newSelfModel.reliability, value as SelfModel['reliability'][0]];
      } else if (operation === 'set') {
        newSelfModel.reliability = value as SelfModel['reliability'];
      }
    } else if (path === 'knownFailureModes') {
      if (operation === 'push') {
        newSelfModel.knownFailureModes = [...newSelfModel.knownFailureModes, value as SelfModel['knownFailureModes'][0]];
      } else if (operation === 'set') {
        newSelfModel.knownFailureModes = value as SelfModel['knownFailureModes'];
      }
    } else if (path === 'costModel') {
      if (operation === 'push') {
        newSelfModel.costModel = [...newSelfModel.costModel, value as SelfModel['costModel'][0]];
      } else if (operation === 'set') {
        newSelfModel.costModel = value as SelfModel['costModel'];
      }
    } else if (path === 'confidenceState') {
      newSelfModel.confidenceState = value as SelfModel['confidenceState'];
    }

    return { ...state, selfModel: newSelfModel };
  }

  private applyActiveConceptsDelta(
    state: WorkingState,
    path: string,
    value: unknown,
    operation: string,
    bounds: ReturnType<typeof this.getBounds>
  ): WorkingState {
    let newActiveConcepts = [...state.activeConcepts];

    if (operation === 'push') {
      const concept = value as string;
      if (!newActiveConcepts.includes(concept)) {
        newActiveConcepts = [concept, ...newActiveConcepts].slice(0, bounds.maxActiveConcepts);
      }
    } else if (operation === 'remove') {
      newActiveConcepts = newActiveConcepts.filter(c => c !== value);
    } else if (operation === 'set') {
      newActiveConcepts = (value as string[]).slice(0, bounds.maxActiveConcepts);
    }

    return { ...state, activeConcepts: newActiveConcepts };
  }

  private applyActiveSchemasDelta(
    state: WorkingState,
    path: string,
    value: unknown,
    operation: string,
    bounds: ReturnType<typeof this.getBounds>
  ): WorkingState {
    let newActiveSchemas = [...state.activeSchemas];

    if (operation === 'push') {
      newActiveSchemas = [value as ActiveSchema, ...newActiveSchemas].slice(0, bounds.maxActiveSchemas);
    } else if (operation === 'remove') {
      newActiveSchemas = newActiveSchemas.filter(s => s.schemaId !== value);
    } else if (operation === 'set') {
      newActiveSchemas = (value as ActiveSchema[]).slice(0, bounds.maxActiveSchemas);
    }

    return { ...state, activeSchemas: newActiveSchemas };
  }

  private applyExecutionLedgerDelta(
    state: WorkingState,
    path: string,
    value: unknown,
    operation: string,
    bounds: ReturnType<typeof this.getBounds>
  ): WorkingState {
    let newExecutionLedger = [...state.executionLedger];

    if (operation === 'push') {
      newExecutionLedger = [value as ExecutionLedgerEntry, ...newExecutionLedger].slice(0, bounds.maxExecutionLedger);
    } else if (operation === 'set') {
      newExecutionLedger = (value as ExecutionLedgerEntry[]).slice(0, bounds.maxExecutionLedger);
    }

    return { ...state, executionLedger: newExecutionLedger };
  }

  private applyBudgetsDelta(
    state: WorkingState,
    path: string,
    value: unknown
  ): WorkingState {
    const newBudgets = { ...state.budgets };

    if (path === 'toolCallsRemaining') {
      newBudgets.toolCallsRemaining = value as number;
    } else if (path === 'memoryWritesRemaining') {
      newBudgets.memoryWritesRemaining = value as number;
    } else if (path === 'reflectionPassesRemaining') {
      newBudgets.reflectionPassesRemaining = value as number;
    } else if (path === 'all') {
      return { ...state, budgets: value as SessionBudgets };
    }

    return { ...state, budgets: newBudgets };
  }

  /**
   * Get hash chain for a session
   */
  getHashChain(sessionKey: SessionKey): Hash[] {
    return [...(this.hashChain.get(sessionKey) ?? [])];
  }

  /**
   * Create state snapshot
   */
  createSnapshot(sessionKey: SessionKey): StateSnapshot {
    const state = this.getState(sessionKey);
    const hash = computeStateHash(state);
    const chain = this.hashChain.get(sessionKey) ?? [];
    
    return {
      state: JSON.parse(JSON.stringify(state)),
      hash,
      timestampMs: Date.now(),
      parentHash: chain.length > 0 ? chain[chain.length - 1] : undefined,
    };
  }

  /**
   * Persist state to disk
   */
  async persistState(sessionKey: SessionKey): Promise<void> {
    const sessionDir = await this.ensureSessionDir(sessionKey);
    const snapshot = this.createSnapshot(sessionKey);

    const filePath = join(sessionDir, `working-state-${snapshot.timestampMs}.json`);
    await writeFile(filePath, JSON.stringify(snapshot, null, 2));
  }

  /**
   * Load state from disk
   */
  async loadState(sessionKey: SessionKey, timestampMs?: TimestampMs): Promise<WorkingState | null> {
    try {
      const sessionDir = join(this.config.baseDir, sessionKey, 'state');
      
      if (timestampMs) {
        const filePath = join(sessionDir, `working-state-${timestampMs}.json`);
        const content = await readFile(filePath, 'utf-8');
        const snapshot: StateSnapshot = JSON.parse(content);
        return snapshot.state;
      }
      
      // Load latest if no timestamp specified
      // This would require listing directory contents
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Clear session state (for testing)
   */
  clearSession(sessionKey: SessionKey): void {
    this.stateCache.delete(sessionKey);
    this.hashChain.delete(sessionKey);
  }

  /**
   * Get all active session keys
   */
  getActiveSessions(): SessionKey[] {
    return Array.from(this.stateCache.keys());
  }

  /**
   * Verify hash chain integrity
   */
  verifyHashChain(sessionKey: SessionKey): boolean {
    const chain = this.hashChain.get(sessionKey);
    if (!chain || chain.length === 0) return true;

    const state = this.stateCache.get(sessionKey);
    if (!state) return false;

    const currentHash = computeStateHash(state);
    return chain[chain.length - 1] === currentHash;
  }

  /**
   * Create delta for setting focus
   */
  static setFocus(chainId: string | null, objective: string | null): StateDelta[] {
    return [
      { section: 'focus', path: 'activeChainId', value: chainId, operation: 'set' },
      { section: 'focus', path: 'currentObjective', value: objective, operation: 'set' },
    ];
  }

  /**
   * Create delta for pushing to salience stack
   */
  static pushSalience(item: string): StateDelta {
    return { section: 'focus', path: 'salienceStack', value: item, operation: 'push' };
  }

  /**
   * Create delta for adding pending approval
   */
  static addPendingApproval(approval: PendingApproval): StateDelta {
    return { section: 'pendingApprovals', path: '', value: approval, operation: 'push' };
  }

  /**
   * Create delta for adding uncertainty
   */
  static addUncertainty(uncertainty: Uncertainty): StateDelta {
    return { section: 'uncertainties', path: '', value: uncertainty, operation: 'push' };
  }

  /**
   * Create delta for updating budgets
   */
  static updateBudgets(budgets: Partial<SessionBudgets>): StateDelta[] {
    return Object.entries(budgets).map(([key, value]) => ({
      section: 'budgets',
      path: key,
      value,
      operation: 'set',
    }));
  }

  /**
   * Create delta for adding execution ledger entry
   */
  static addExecutionLedgerEntry(entry: ExecutionLedgerEntry): StateDelta {
    return { section: 'executionLedger', path: '', value: entry, operation: 'push' };
  }

  /**
   * Create delta for setting cold-start mode
   */
  static setColdStart(enabled: boolean): StateDelta {
    return { section: 'coldStart', path: '', value: enabled, operation: 'set' };
  }
}
