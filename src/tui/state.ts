// Synth TUI State Store - Reactive state management for TUI components
// Implements simple Subject/Observer pattern with tick-based refresh

import * as fs from 'fs';
import * as path from 'path';

/**
 * Artifact data types loaded from workspace
 */
export interface ArtifactData {
  active: any | null;
  plans: any[];
  approvals: any[];
}

/**
 * Runtime data types from cognitive field
 */
export interface RuntimeData {
  field: any[];
  signals: any[];
  fieldError: string | null;
  signalsError: string | null;
  hasRuntime: boolean;
  lastUpdate: number;
}

/**
 * Memory statistics from workspace
 */
interface MemoryStats {
  flash: number;      // Recent observations count
  warm: number;       // Consolidated summaries count
  semantic: number;   // Learned facts count
  memoryHealth: 'excellent' | 'good' | 'warning' | 'critial';
  lastUpdate: number;
}

/**
 * Memory tab selection
 */
type MemoryTab = 'flash' | 'warm' | 'semantic';

/**
 * Persistent states
 */
interface PersistentState {
  safeMode: boolean;
  killSwitch: boolean;
}

/**
 * TUI application state
 */
interface TUIState {
  workspacePath: string;
  selectedSession: string | null;
  artifactData: ArtifactData;
  memoryStats: MemoryStats;
  selectedMemoryTab: MemoryTab;
  safeMode: boolean;
  killSwitch: boolean;
  runtimeData: RuntimeData;
  lastUpdate: number;
}

/**
 * Observer callback type
 */
type StateObserver = (state: TUIState) => void;

/**
 * Simple Subject/Observer-based reactive state store
 * Manages TUI state with periodic tick refresh and data loading
 */
export class TUIStateStore {
  private state: TUIState;
  private observers: Set<StateObserver>;
  private tickInterval: NodeJS.Timeout | null;
  private persistentStatePath: string;

  // Configuration
  private readonly TICK_INTERVAL_MS = 750; // Between 500-1000ms

  constructor() {
    // Get workspace path and persistent state path
    const workspacePath = process.cwd();
    this.persistentStatePath = path.join(workspacePath, '.synth-tui-state.json');

    // Initialize state
    this.state = this.initializeState();
    this.observers = new Set();
    this.tickInterval = null;

    // Load persistent states
    this.loadPersistentState();
  }

  /**
   * Initialize default state
   */
  private initializeState(): TUIState {
    return {
      workspacePath: process.cwd(),
      selectedSession: null,
      artifactData: {
        active: null,
        plans: [],
        approvals: [],
      },
      memoryStats: {
        flash: 0,
        warm: 0,
        semantic: 0,
        memoryHealth: 'good',
        lastUpdate: Date.now(),
      },
      selectedMemoryTab: 'flash',
      safeMode: false,
      killSwitch: false,
      runtimeData: {
        field: [],
        signals: [],
        fieldError: null,
        signalsError: null,
        hasRuntime: false,
        lastUpdate: Date.now(),
      },
      lastUpdate: Date.now(),
    };
  }

  /**
   * Load persistent state from disk
   */
  private loadPersistentState(): void {
    try {
      if (fs.existsSync(this.persistentStatePath)) {
        const data = fs.readFileSync(this.persistentStatePath, 'utf-8');
        const persistent: PersistentState = JSON.parse(data);
        this.state.safeMode = persistent.safeMode ?? false;
        this.state.killSwitch = persistent.killSwitch ?? false;
      }
    } catch (error) {
      console.error('Failed to load persistent state:', error);
    }
  }

  /**
   * Save persistent state to disk
   */
  private savePersistentState(): void {
    try {
      const persistent: PersistentState = {
        safeMode: this.state.safeMode,
        killSwitch: this.state.killSwitch,
      };
      fs.writeFileSync(this.persistentStatePath, JSON.stringify(persistent, null, 2));
    } catch (error) {
      console.error('Failed to save persistent state:', error);
    }
  }

  /**
   * Load runtime data from .synth/runtime/
   */
  private loadRuntimeData(): void {
    try {
      const workspacePath = this.state.workspacePath;
      const runtimePath = path.join(workspacePath, '.synth', 'runtime');
      const hasRuntimeDir = fs.existsSync(runtimePath);
      
      this.state.runtimeData.hasRuntime = hasRuntimeDir;
      this.state.runtimeData.fieldError = null;
      this.state.runtimeData.signalsError = null;
      
      if (hasRuntimeDir) {
        // Load field.jsonl
        const fieldPath = path.join(runtimePath, 'field.jsonl');
        if (fs.existsSync(fieldPath)) {
          try {
            const fieldContent = fs.readFileSync(fieldPath, 'utf-8');
            this.state.runtimeData.field = fieldContent
              .split('\n')
              .filter(line => line.trim())
              .map(line => {
                try {
                  return JSON.parse(line);
                } catch {
                  return null;
                }
              })
              .filter((item): item is any => item !== null);
          } catch (error) {
            this.state.runtimeData.field = [];
            this.state.runtimeData.fieldError = error instanceof Error ? error.message : 'Unknown error';
          }
        } else {
          this.state.runtimeData.field = [];
        }

        // Load signals.jsonl
        const signalsPath = path.join(runtimePath, 'signals.jsonl');
        if (fs.existsSync(signalsPath)) {
          try {
            const signalsContent = fs.readFileSync(signalsPath, 'utf-8');
            this.state.runtimeData.signals = signalsContent
              .split('\n')
              .filter(line => line.trim())
              .map(line => {
                try {
                  return JSON.parse(line);
                } catch {
                  return null;
                }
              })
              .filter((item): item is any => item !== null);
          } catch (error) {
            this.state.runtimeData.signals = [];
            this.state.runtimeData.signalsError = error instanceof Error ? error.message : 'Unknown error';
          }
        } else {
          this.state.runtimeData.signals = [];
        }
      } else {
        // Runtime directory doesn't exist
        this.state.runtimeData.field = [];
        this.state.runtimeData.signals = [];
      }

      this.state.runtimeData.lastUpdate = Date.now();
    } catch (error) {
      this.state.runtimeData.field = [];
      this.state.runtimeData.signals = [];
      this.state.runtimeData.hasRuntime = false;
      this.state.runtimeData.fieldError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  /**
   * Load artifact data from workspace
   */
  private loadArtifactData(): void {
    try {
      const workspacePath = this.state.workspacePath;
      const neuronwavesPath = path.join(workspacePath, '.synth', 'neuronwaves');

      // Resolve session to load (selected session first, then first available session)
      let sessionId = this.state.selectedSession;
      if (!sessionId && fs.existsSync(neuronwavesPath)) {
        const sessions = fs.readdirSync(neuronwavesPath, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && entry.name !== 'memory' && entry.name !== 'audit')
          .map((entry) => entry.name)
          .sort();

        if (sessions.length > 0) {
          sessionId = sessions[0];
          this.state.selectedSession = sessionId;
        }
      }

      if (!sessionId) {
        this.state.artifactData.active = null;
        this.state.artifactData.plans = [];
        this.state.artifactData.approvals = [];
        this.state.lastUpdate = Date.now();
        return;
      }

      // Load active.json
      const activePath = path.join(neuronwavesPath, sessionId, 'state', 'active.json');
      if (fs.existsSync(activePath)) {
        const activeData = fs.readFileSync(activePath, 'utf-8');
        this.state.artifactData.active = JSON.parse(activeData);
      } else {
        this.state.artifactData.active = null;
      }

      // Load plans.jsonl
      const plansPath = path.join(neuronwavesPath, sessionId, 'plans.jsonl');
      if (fs.existsSync(plansPath)) {
        const plansContent = fs.readFileSync(plansPath, 'utf-8');
        this.state.artifactData.plans = plansContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
      } else {
        this.state.artifactData.plans = [];
      }

      // Load approvals.json
      const approvalsPath = path.join(neuronwavesPath, sessionId, 'state', 'approvals.json');
      if (fs.existsSync(approvalsPath)) {
        const approvalsData = fs.readFileSync(approvalsPath, 'utf-8');
        const parsed = JSON.parse(approvalsData);
        this.state.artifactData.approvals = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.approvals)
            ? parsed.approvals
            : [];
      } else {
        this.state.artifactData.approvals = [];
      }

      this.state.lastUpdate = Date.now();
    } catch (error) {
      console.error('Failed to load artifact data:', error);
    }
  }

  /**
   * Tick refresh - reload artifact data and notify observers
   */
  private tick(): void {
    this.loadArtifactData();
    this.loadRuntimeData();
    this.notifyObservers();
  }

  /**
   * Notify all observers of state change
   */
  private notifyObservers(): void {
    // Deep clone state to prevent mutation
    const stateClone = JSON.parse(JSON.stringify(this.state));
    this.observers.forEach(observer => observer(stateClone));
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(observer: StateObserver): () => void {
    this.observers.add(observer);
    // Immediately call with current state
    observer(JSON.parse(JSON.stringify(this.state)));

    // Return unsubscribe function
    return () => this.observers.delete(observer);
  }

  /**
   * Start the tick refresh interval
   */
  public startTick(): void {
    if (this.tickInterval === null) {
      // Initial load
      this.loadArtifactData();

      // Set up interval
      this.tickInterval = setInterval(() => {
        this.tick();
      }, this.TICK_INTERVAL_MS);
    }
  }

  /**
   * Stop the tick refresh interval
   */
  public stopTick(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Get current state (readonly)
   */
  public getState(): Readonly<TUIState> {
    return Object.freeze(JSON.parse(JSON.stringify(this.state)));
  }

  /**
   * Set workspace path
   */
  public setWorkspacePath(path: string): void {
    this.state.workspacePath = path;
    this.loadArtifactData();
    this.notifyObservers();
  }

  /**
   * Set selected session
   */
  public setSelectedSession(session: string | null): void {
    this.state.selectedSession = session;
    this.notifyObservers();
  }

  /**
   * Toggle safe mode
   */
  public toggleSafeMode(): void {
    this.state.safeMode = !this.state.safeMode;
    this.savePersistentState();
    this.notifyObservers();
  }

  /**
   * Toggle kill switch
   */
  public toggleKillSwitch(): void {
    this.state.killSwitch = !this.state.killSwitch;
    this.savePersistentState();
    this.notifyObservers();
  }

  /**
   * Set safe mode state
   */
  public setSafeMode(enabled: boolean): void {
    this.state.safeMode = enabled;
    this.savePersistentState();
    this.notifyObservers();
  }

  /**
   * Set kill switch state
   */
  public setKillSwitch(enabled: boolean): void {
    this.state.killSwitch = enabled;
    this.savePersistentState();
    this.notifyObservers();
  }

  /**
   * Get artifact data
   */
  public getArtifactData(): Readonly<ArtifactData> {
    return Object.freeze(JSON.parse(JSON.stringify(this.state.artifactData)));
  }

  /**
   * Get runtime data
   */
  public getRuntimeData(): Readonly<RuntimeData> {
    return Object.freeze(JSON.parse(JSON.stringify(this.state.runtimeData)));
  }

  /**
   * Get persistent states
   */
  public getPersistentStates(): Readonly<PersistentState> {
    return Object.freeze({
      safeMode: this.state.safeMode,
      killSwitch: this.state.killSwitch,
    });
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.stopTick();
    this.observers.clear();
  }
}

// Singleton instance
let stateStoreInstance: TUIStateStore | null = null;

/**
 * Get or create the singleton state store instance
 */
export function getStateStore(): TUIStateStore {
  if (stateStoreInstance === null) {
    stateStoreInstance = new TUIStateStore();
  }
  return stateStoreInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetStateStore(): void {
  if (stateStoreInstance !== null) {
    stateStoreInstance.dispose();
    stateStoreInstance = null;
  }
}
