/**
 * ArtifactStore - File persistence for loop artifacts
 * Milestone 1: JSONL append-only, state last-write-wins
 */

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Observation,
  Plan,
  Evaluation,
  AuditEvent,
  LoopState,
  SessionKey,
  SemanticFact,
} from '../types.js';

/** Artifact store configuration */
export interface StoreConfig {
  /** Base directory for all artifacts */
  readonly baseDir: string;
  /** Directory for semantic memory (defaults to baseDir/memory/semantic) */
  readonly semanticDir?: string;
}

/** Paths to all artifact files for a session */
export interface SessionPaths {
  readonly sessionDir: string;
  readonly observations: string;
  readonly plans: string;
  readonly evaluations: string;
  readonly audit: string;
  readonly state: string;
  readonly facts: string;
}

/**
 * ArtifactStore - Manages persistence of loop artifacts
 */
export class ArtifactStore {
  private readonly baseDir: string;
  private readonly semanticDir: string;

  constructor(config: StoreConfig) {
    this.baseDir = config.baseDir;
    // Default to baseDir/memory/semantic if not specified
    this.semanticDir = config.semanticDir ?? join(this.baseDir, 'memory', 'semantic');
  }

  /**
   * Get all file paths for a session
   * Note: facts are stored globally, not per-session
   */
  getSessionPaths(sessionKey: SessionKey): SessionPaths {
    const sessionDir = join(this.baseDir, sessionKey);
    return {
      sessionDir,
      observations: join(sessionDir, 'observations.jsonl'),
      plans: join(sessionDir, 'plans.jsonl'),
      evaluations: join(sessionDir, 'evaluations.jsonl'),
      audit: join(sessionDir, 'audit', 'actions.jsonl'),
      state: join(sessionDir, 'state', 'active.json'),
      facts: join(this.semanticDir, 'facts.json'),
    };
  }

  /**
   * Ensure session directory exists
   */
  async ensureSessionDir(sessionKey: SessionKey): Promise<SessionPaths> {
    const paths = this.getSessionPaths(sessionKey);
    await mkdir(paths.sessionDir, { recursive: true });
    await mkdir(join(paths.sessionDir, 'audit'), { recursive: true });
    await mkdir(join(paths.sessionDir, 'state'), { recursive: true });
    return paths;
  }

  /**
   * Write observation to JSONL (append)
   */
  async writeObservation(obs: Observation): Promise<void> {
    const paths = await this.ensureSessionDir(obs.sessionKey);
    const line = JSON.stringify(obs) + '\n';
    await appendFile(paths.observations, line);
  }

  /**
   * Write plan to JSONL (append)
   */
  async writePlan(plan: Plan): Promise<void> {
    const paths = await this.ensureSessionDir(plan.sessionKey);
    const line = JSON.stringify(plan) + '\n';
    await appendFile(paths.plans, line);
  }

  /**
   * Write evaluation to JSONL (append)
   */
  async writeEvaluation(eval_: Evaluation): Promise<void> {
    const paths = await this.ensureSessionDir(eval_.sessionKey);
    const line = JSON.stringify(eval_) + '\n';
    await appendFile(paths.evaluations, line);
  }

  /**
   * Write audit event to JSONL (append)
   */
  async writeAuditEvent(event: AuditEvent): Promise<void> {
    const paths = await this.ensureSessionDir(event.sessionKey);
    const line = JSON.stringify(event) + '\n';
    await appendFile(paths.audit, line);
  }

  /**
   * Write/update state snapshot (last-write-wins)
   */
  async writeState(state: LoopState): Promise<void> {
    const paths = await this.ensureSessionDir(state.sessionKey);
    const content = JSON.stringify(state, null, 2);
    await writeFile(paths.state, content);
  }

  /**
   * Convenience: batch write all artifacts from a loop run
   */
  async writeLoopArtifacts(params: {
    observation: Observation;
    plan: Plan;
    evaluation: Evaluation;
    auditEvents: AuditEvent[];
    state: LoopState;
  }): Promise<SessionPaths> {
    await Promise.all([
      this.writeObservation(params.observation),
      this.writePlan(params.plan),
      this.writeEvaluation(params.evaluation),
      ...params.auditEvents.map(e => this.writeAuditEvent(e)),
      this.writeState(params.state),
    ]);

    return this.getSessionPaths(params.state.sessionKey);
  }

  /**
   * Write semantic facts (last-write-wins)
   * Milestone 8: Semantic memory integration
   * Facts are stored globally at the semantic directory path
   */
  async writeFacts(sessionKey: SessionKey, facts: SemanticFact[]): Promise<void> {
    // Ensure semantic directory exists
    await mkdir(this.semanticDir, { recursive: true });

    // Write facts to global semantic path
    const factsPath = join(this.semanticDir, 'facts.json');
    const content = JSON.stringify(facts, null, 2);
    await writeFile(factsPath, content);
  }

  /**
   * Read semantic facts
   * Milestone 8: Semantic memory integration
   * Facts are read from global semantic path
   */
  async readFacts(sessionKey: SessionKey): Promise<SemanticFact[]> {
    // Read from global semantic path
    const factsPath = join(this.semanticDir, 'facts.json');
    const { readFile } = await import('node:fs/promises');

    try {
      const content = await readFile(factsPath, 'utf-8');
      const facts: SemanticFact[] = JSON.parse(content);
      return facts;
    } catch (error) {
      // File doesn't exist or is malformed - return empty array
      return [];
    }
  }
}