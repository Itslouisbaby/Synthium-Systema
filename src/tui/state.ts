// Synth TUI State Store - Reactive state management for TUI components
// Implements simple Subject/Observer pattern with tick-based refresh

import * as fs from 'fs';
import * as path from 'path';

/**
 * Artifact data types loaded from workspace
 */
interface ArtifactData {
  active: any | null;
  plans: any[];
  approvals: any[];
}

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
  safeMode: boolean;
  killSwitch: boolean;
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
      safeMode: false,
      killSwitch: false,
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
   * Load artifact data from workspace
   */
  private loadArtifactData(): void {
    try {
      const workspacePath = this.state.workspacePath;

      // Load active.json
      const activePath = path.join(workspacePath, 'active.json');
      if (fs.existsSync(activePath)) {
        const activeData = fs.readFileSync(activePath, 'utf-8');
        this.state.artifactData.active = JSON.parse(activeData);
      } else {
        this.state.artifactData.active = null;
      }

      // Load plans.jsonl
      const plansPath = path.join(workspacePath, 'plans.jsonl');
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
      const approvalsPath = path.join(workspacePath, 'approvals.json');
      if (fs.existsSync(approvalsPath)) {
        const approvalsData = fs.readFileSync(approvalsPath, 'utf-8');
        this.state.artifactData.approvals = JSON.parse(approvalsData);
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
