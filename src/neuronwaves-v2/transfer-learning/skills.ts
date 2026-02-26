/**
 * Skills - Versioned plan templates for procedural memory
 * Section 7.3: Skill artifacts and activation workflow
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Skill, TaskTrace, TimestampMs } from '../types.js';

/** Skills configuration */
export interface SkillsConfig {
  /** Base directory for skill storage */
  readonly baseDir: string;
}

/** Skill activation result */
export interface SkillActivation {
  readonly activated: boolean;
  readonly skillId?: string;
  readonly version?: string;
  readonly reason?: string;
  readonly planTemplate?: Skill['planTemplate'];
}

/** Skill evaluation result */
export interface SkillEvaluation {
  readonly skillId: string;
  readonly version: string;
  readonly passed: boolean;
  readonly score: number;
  readonly testResults: {
    readonly testId: string;
    readonly passed: boolean;
    readonly details: string;
  }[];
}

/**
 * SkillsManager - Manages versioned plan templates
 * 
 * Design principles:
 * - Skills are versioned plan templates
 * - Triggered by concepts + schema readiness
 * - Require evaluation before activation
 * - Never auto-deploy without approval
 */
export class SkillsManager {
  private readonly config: SkillsConfig;
  private readonly activeSkills: Map<string, Skill> = new Map();

  constructor(config: SkillsConfig) {
    this.config = config;
  }

  /**
   * Get skills directory
   */
  private getSkillsDir(): string {
    return join(this.config.baseDir, 'skills');
  }

  /**
   * Get skill file path
   */
  private getSkillPath(skillId: string, version: string): string {
    return join(this.getSkillsDir(), skillId, `${version}.json`);
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  /**
   * Create a new skill from a successful trace
   */
  async createSkillFromTrace(
    trace: TaskTrace,
    options: {
      name?: string;
      requiredConcepts?: string[];
      invariants?: string[];
    } = {}
  ): Promise<Skill> {
    const skillId = `skill-${trace.taskSignature.slice(0, 20)}`;
    const version = '1.0.0';
    const now = Date.now();

    const skill: Skill = {
      skillId,
      version,
      trigger: {
        concepts: options.requiredConcepts ?? trace.detectedConcepts,
        schemaReadiness: Object.keys(trace.filledSlots),
      },
      planTemplate: {
        steps: trace.planSteps.map(step => ({
          intent: step.intent,
          actionClass: step.actionClass,
          toolName: (step as any).toolName,
          placeholders: {},
        })),
      },
      invariants: options.invariants ?? [],
      approvals: trace.policyDecisions
        .filter(d => d.decision === 'awaiting_approval')
        .map(d => d.stepId),
      evaluationChecks: [
        'all_steps_execute',
        'invariants_hold',
        'no_policy_violations',
      ],
      status: 'draft',
      createdAtMs: now,
    };

    // Save skill
    const skillPath = this.getSkillPath(skillId, version);
    await this.ensureDir(join(this.getSkillsDir(), skillId));
    await writeFile(skillPath, JSON.stringify(skill, null, 2));

    return skill;
  }

  /**
   * Save a skill
   */
  async saveSkill(skill: Skill): Promise<void> {
    const skillPath = this.getSkillPath(skill.skillId, skill.version);
    await this.ensureDir(join(this.getSkillsDir(), skill.skillId));
    await writeFile(skillPath, JSON.stringify(skill, null, 2));

    if (skill.status === 'active') {
      this.activeSkills.set(skill.skillId, skill);
    }
  }

  /**
   * Load a skill
   */
  async loadSkill(skillId: string, version: string): Promise<Skill | null> {
    // Check active cache first
    const active = this.activeSkills.get(skillId);
    if (active && active.version === version) {
      return active;
    }

    // Load from disk
    try {
      const skillPath = this.getSkillPath(skillId, version);
      const content = await readFile(skillPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Try to activate a skill
   */
  async tryActivate(
    skillId: string,
    version: string,
    context: {
      concepts: string[];
      filledSlots: string[];
    }
  ): Promise<SkillActivation> {
    const skill = await this.loadSkill(skillId, version);

    if (!skill) {
      return { activated: false, reason: 'Skill not found' };
    }

    // Check status
    if (skill.status !== 'active') {
      return {
        activated: false,
        reason: `Skill status is ${skill.status}, not active`
      };
    }

    // Check concept match
    const conceptMatch = skill.trigger.concepts.every(c =>
      context.concepts.includes(c)
    );

    if (!conceptMatch) {
      return {
        activated: false,
        reason: 'Concept requirements not met'
      };
    }

    // Check schema readiness
    const schemaReady = skill.trigger.schemaReadiness.every(s =>
      context.filledSlots.includes(s)
    );

    if (!schemaReady) {
      return {
        activated: false,
        reason: 'Schema readiness not met'
      };
    }

    // Skill activated
    return {
      activated: true,
      skillId,
      version,
      reason: 'All trigger conditions met',
      planTemplate: skill.planTemplate,
    };
  }

  /**
   * Evaluate a skill against test traces
   */
  async evaluateSkill(
    skill: Skill,
    testTraces: TaskTrace[]
  ): Promise<SkillEvaluation> {
    const testResults: SkillEvaluation['testResults'] = [];
    let totalScore = 0;

    for (let i = 0; i < testTraces.length; i++) {
      const trace = testTraces[i];
      const result = this.evaluateAgainstTrace(skill, trace);

      testResults.push({
        testId: `test-${i + 1}`,
        passed: result.passed,
        details: result.details,
      });

      totalScore += result.score;
    }

    const averageScore = testTraces.length > 0 ? totalScore / testTraces.length : 0;
    const allPassed = testResults.every(r => r.passed);

    return {
      skillId: skill.skillId,
      version: skill.version,
      passed: allPassed,
      score: averageScore,
      testResults,
    };
  }

  /**
   * Evaluate skill against a single trace
   */
  private evaluateAgainstTrace(
    skill: Skill,
    trace: TaskTrace
  ): { passed: boolean; score: number; details: string } {
    let score = 0;
    const checks: string[] = [];

    // Check 1: All steps execute
    const allStepsExecuted = trace.planSteps.every(s =>
      s.status === 'executed'
    );
    if (allStepsExecuted) {
      score += 0.3;
      checks.push('all steps executed');
    }

    // Check 2: No policy violations
    const noViolations = trace.policyDecisions.every(d =>
      d.decision !== 'block'
    );
    if (noViolations) {
      score += 0.3;
      checks.push('no policy violations');
    }

    // Check 3: Successful evaluation
    if (trace.evaluation.result === 'success') {
      score += 0.4;
      checks.push('successful evaluation');
    }

    const passed = score >= 0.7;

    return {
      passed,
      score,
      details: checks.join(', ') || 'no checks passed',
    };
  }

  /**
   * Approve and activate a skill
   */
  async approveSkill(skillId: string, version: string): Promise<Skill | null> {
    const skill = await this.loadSkill(skillId, version);
    if (!skill) return null;

    const activated: Skill = {
      ...skill,
      status: 'active',
      activatedAtMs: Date.now(),
    };

    await this.saveSkill(activated);
    this.activeSkills.set(skillId, activated);

    return activated;
  }

  /**
   * Deprecate a skill
   */
  async deprecateSkill(skillId: string, version: string): Promise<Skill | null> {
    const skill = await this.loadSkill(skillId, version);
    if (!skill) return null;

    const deprecated: Skill = {
      ...skill,
      status: 'deprecated',
    };

    await this.saveSkill(deprecated);
    this.activeSkills.delete(skillId);

    return deprecated;
  }

  /**
   * Distill skills from successful traces
   */
  async distillSkills(
    traces: TaskTrace[],
    options: {
      minSuccessRate?: number;
      minOccurrences?: number;
    } = {}
  ): Promise<Skill[]> {
    const minSuccessRate = options.minSuccessRate ?? 0.8;
    const minOccurrences = options.minOccurrences ?? 3;

    // Group traces by task signature
    const bySignature = new Map<string, TaskTrace[]>();
    for (const trace of traces) {
      const existing = bySignature.get(trace.taskSignature) ?? [];
      bySignature.set(trace.taskSignature, [...existing, trace]);
    }

    const distilledSkills: Skill[] = [];

    for (const [signature, signatureTraces] of bySignature) {
      // Check minimum occurrences
      if (signatureTraces.length < minOccurrences) continue;

      // Check success rate
      const successCount = signatureTraces.filter(
        t => t.evaluation.result === 'success'
      ).length;
      const successRate = successCount / signatureTraces.length;

      if (successRate < minSuccessRate) continue;

      // Use most recent successful trace as template
      const templateTrace = signatureTraces
        .filter(t => t.evaluation.result === 'success')
        .sort((a, b) => b.createdAtMs - a.createdAtMs)[0];

      if (templateTrace) {
        // Aggregate concepts from all traces
        const allConcepts = new Set<string>();
        for (const trace of signatureTraces) {
          for (const concept of trace.detectedConcepts) {
            allConcepts.add(concept);
          }
        }

        const skill = await this.createSkillFromTrace(templateTrace, {
          name: `Distilled: ${signature}`,
          requiredConcepts: Array.from(allConcepts),
        });

        distilledSkills.push(skill);
      }
    }

    return distilledSkills;
  }

  /**
   * Get all active skills
   */
  getActiveSkills(): Skill[] {
    return Array.from(this.activeSkills.values());
  }

  /**
   * Find applicable skills for a context
   */
  findApplicableSkills(
    context: {
      concepts: string[];
      filledSlots: string[];
    }
  ): Skill[] {
    const applicable: Skill[] = [];

    for (const skill of this.activeSkills.values()) {
      const conceptMatch = skill.trigger.concepts.some(c =>
        context.concepts.includes(c)
      );

      if (conceptMatch) {
        applicable.push(skill);
      }
    }

    return applicable;
  }
}
