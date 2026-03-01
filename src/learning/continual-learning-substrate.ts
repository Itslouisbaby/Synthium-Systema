import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SolvedTaskRecord {
  taskId: string;
  domain: string;
  taskDescription: string;
  solvedAtMs: number;
  strategySummary: string;
  policySummary: string;
  score: number;
  split: 'train_seen' | 'val_seen' | 'ood_unseen_templates' | 'ood_unseen_tools' | 'ood_unseen_domains';
}

export interface SkillAbstraction {
  skillId: string;
  version: number;
  domain: string;
  triggerTerms: string[];
  abstractPlan: string[];
  sourceTaskIds: string[];
  inducedAtMs: number;
}

export interface PolicyAbstraction {
  policyId: string;
  version: number;
  domain: string;
  constraints: string[];
  guardrails: string[];
  sourceTaskIds: string[];
  inducedAtMs: number;
}

export interface ReuseDecision {
  reuseRelevant: boolean;
  reuseAttempted: boolean;
  selectedSkillId?: string;
  selectedPolicyId?: string;
  reason: string;
}

export interface ReuseOutcome {
  taskId: string;
  unseen: boolean;
  baselineScore: number;
  finalScore: number;
  reuseAttempted: boolean;
  reuseUsed: boolean;
  recordedAtMs: number;
}

export interface ReuseMetrics {
  totalDecisions: number;
  relevantDecisions: number;
  reuseAttemptedCount: number;
  reuseUsedCount: number;
  reuseRate: number;
  unseenOutcomes: number;
  unseenReuseBenefitMean: number;
}

interface SubstrateState {
  skills: SkillAbstraction[];
  policies: PolicyAbstraction[];
  outcomes: ReuseOutcome[];
  decisionHistory: ReuseDecision[];
}

export class ContinualLearningSubstrate {
  constructor(private readonly baseDir: string) {}

  private rootDir(): string {
    return join(this.baseDir, 'learning', 'substrate');
  }

  private skillsPath(): string {
    return join(this.rootDir(), 'skills.json');
  }

  private policiesPath(): string {
    return join(this.rootDir(), 'policies.json');
  }

  private outcomesPath(): string {
    return join(this.rootDir(), 'reuse-outcomes.json');
  }

  private decisionsPath(): string {
    return join(this.rootDir(), 'reuse-decisions.json');
  }

  async init(): Promise<void> {
    await mkdir(this.rootDir(), { recursive: true });
    const state = await this.loadState();
    await this.saveState(state);
  }

  async induceFromSolvedTask(record: SolvedTaskRecord): Promise<{ skill: SkillAbstraction; policy: PolicyAbstraction }> {
    const state = await this.loadState();

    const triggerTerms = this.extractTerms(record.taskDescription);
    const abstractPlan = this.extractPlan(record.strategySummary);
    const constraints = this.extractConstraints(record.policySummary);
    const guardrails = ['no silent side effects', 'bounded autonomy', 'audit required'];

    const existingSkill = state.skills.find(item => item.domain === record.domain && this.hasOverlap(item.triggerTerms, triggerTerms));
    let skill: SkillAbstraction;
    if (existingSkill) {
      skill = {
        ...existingSkill,
        version: existingSkill.version + 1,
        triggerTerms: this.mergeUnique(existingSkill.triggerTerms, triggerTerms),
        abstractPlan: this.mergeUnique(existingSkill.abstractPlan, abstractPlan),
        sourceTaskIds: this.mergeUnique(existingSkill.sourceTaskIds, [record.taskId]),
        inducedAtMs: Date.now(),
      };
      state.skills = state.skills.map(item => (item.skillId === skill.skillId ? skill : item));
    } else {
      skill = {
        skillId: `skill-${record.domain}-${Date.now()}`,
        version: 1,
        domain: record.domain,
        triggerTerms,
        abstractPlan,
        sourceTaskIds: [record.taskId],
        inducedAtMs: Date.now(),
      };
      state.skills.push(skill);
    }

    const existingPolicy = state.policies.find(item => item.domain === record.domain && this.hasOverlap(item.constraints, constraints));
    let policy: PolicyAbstraction;
    if (existingPolicy) {
      policy = {
        ...existingPolicy,
        version: existingPolicy.version + 1,
        constraints: this.mergeUnique(existingPolicy.constraints, constraints),
        guardrails: this.mergeUnique(existingPolicy.guardrails, guardrails),
        sourceTaskIds: this.mergeUnique(existingPolicy.sourceTaskIds, [record.taskId]),
        inducedAtMs: Date.now(),
      };
      state.policies = state.policies.map(item => (item.policyId === policy.policyId ? policy : item));
    } else {
      policy = {
        policyId: `policy-${record.domain}-${Date.now()}`,
        version: 1,
        domain: record.domain,
        constraints,
        guardrails,
        sourceTaskIds: [record.taskId],
        inducedAtMs: Date.now(),
      };
      state.policies.push(policy);
    }

    await this.saveState(state);
    return { skill, policy };
  }

  async decideReuseBeforeFreshSolve(taskDescription: string, domain: string): Promise<ReuseDecision> {
    const state = await this.loadState();
    const terms = this.extractTerms(taskDescription);

    const relevantSkill = state.skills
      .filter(item => item.domain === domain)
      .find(item => this.hasOverlap(item.triggerTerms, terms));

    const relevantPolicy = state.policies
      .filter(item => item.domain === domain)
      .find(item => this.hasOverlap(item.constraints, terms));

    const decision: ReuseDecision = relevantSkill
      ? {
          reuseRelevant: true,
          reuseAttempted: true,
          selectedSkillId: relevantSkill.skillId,
          selectedPolicyId: relevantPolicy?.policyId,
          reason: 'relevant_skill_found_attempt_reuse_before_fresh_solve',
        }
      : {
          reuseRelevant: false,
          reuseAttempted: false,
          selectedPolicyId: relevantPolicy?.policyId,
          reason: 'no_relevant_skill_found_fresh_solve_allowed',
        };

    state.decisionHistory.push(decision);
    await this.saveState(state);
    return decision;
  }

  async recordReuseOutcome(outcome: ReuseOutcome): Promise<void> {
    const state = await this.loadState();
    state.outcomes.push(outcome);
    await this.saveState(state);
  }

  async getReuseMetrics(): Promise<ReuseMetrics> {
    const state = await this.loadState();
    const totalDecisions = state.decisionHistory.length;
    const relevantDecisions = state.decisionHistory.filter(item => item.reuseRelevant).length;
    const reuseAttemptedCount = state.decisionHistory.filter(item => item.reuseAttempted).length;
    const reuseUsedCount = state.outcomes.filter(item => item.reuseUsed).length;
    const reuseRate = totalDecisions === 0 ? 0 : reuseAttemptedCount / totalDecisions;

    const unseen = state.outcomes.filter(item => item.unseen);
    const unseenBenefit = unseen.length === 0
      ? 0
      : unseen.reduce((acc, item) => acc + (item.finalScore - item.baselineScore), 0) / unseen.length;

    return {
      totalDecisions,
      relevantDecisions,
      reuseAttemptedCount,
      reuseUsedCount,
      reuseRate: Number(reuseRate.toFixed(6)),
      unseenOutcomes: unseen.length,
      unseenReuseBenefitMean: Number(unseenBenefit.toFixed(6)),
    };
  }

  async inspectState(): Promise<SubstrateState> {
    return this.loadState();
  }

  private async loadState(): Promise<SubstrateState> {
    const [skills, policies, outcomes, decisionHistory] = await Promise.all([
      this.readJson<SkillAbstraction[]>(this.skillsPath(), []),
      this.readJson<PolicyAbstraction[]>(this.policiesPath(), []),
      this.readJson<ReuseOutcome[]>(this.outcomesPath(), []),
      this.readJson<ReuseDecision[]>(this.decisionsPath(), []),
    ]);

    return { skills, policies, outcomes, decisionHistory };
  }

  private async saveState(state: SubstrateState): Promise<void> {
    await Promise.all([
      writeFile(this.skillsPath(), JSON.stringify(state.skills, null, 2), 'utf8'),
      writeFile(this.policiesPath(), JSON.stringify(state.policies, null, 2), 'utf8'),
      writeFile(this.outcomesPath(), JSON.stringify(state.outcomes, null, 2), 'utf8'),
      writeFile(this.decisionsPath(), JSON.stringify(state.decisionHistory, null, 2), 'utf8'),
    ]);
  }

  private async readJson<T>(path: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private extractTerms(text: string): string[] {
    return Array.from(new Set(
      text.toLowerCase().split(/[^a-z0-9]+/g).filter(token => token.length >= 4),
    )).slice(0, 24);
  }

  private extractPlan(summary: string): string[] {
    const clauses = summary
      .split(/[.;\n]+/g)
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => part.toLowerCase());

    if (clauses.length > 0) return clauses.slice(0, 8);
    return ['analyze requirements', 'apply known decomposition', 'validate constraints'];
  }

  private extractConstraints(summary: string): string[] {
    const terms = this.extractTerms(summary);
    if (terms.length > 0) return terms.slice(0, 10);
    return ['safety', 'audit', 'bounded'];
  }

  private hasOverlap(a: string[], b: string[]): boolean {
    const bSet = new Set(b);
    return a.some(item => bSet.has(item));
  }

  private mergeUnique(current: string[], incoming: string[]): string[] {
    return Array.from(new Set([...current, ...incoming]));
  }
}
