import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type GoalStatus = 'queued' | 'running' | 'completed' | 'failed' | 'escalated' | 'autopaused';

export interface GoalPortfolioScore {
  valueEstimate: number;
  costEstimate: number;
  riskEstimate: number;
  urgencyScore: number;
  urgencyDecay: number;
  totalScore: number;
  scoredAtMs: number;
}

export interface AutonomousGoalItem {
  goalId: string;
  createdAtMs: number;
  description: string;
  approvalScope: 'required' | 'preapproved';
  retries: number;
  maxRetries: number;
  status: GoalStatus;
  lastError?: string;
  portfolioScore?: GoalPortfolioScore;
}

export interface OpsState {
  dailyBudget: number;
  consumedToday: number;
  autopause: boolean;
  stopped: boolean;
  updatedAtMs: number;
}

export interface OpsRunResult {
  executed: number;
  escalated: number;
  remaining: number;
}

interface RankedGoal {
  goal: AutonomousGoalItem;
  score: GoalPortfolioScore;
}

export class AgenticOpsManager {
  constructor(private readonly baseDir: string) {}

  private queuePath(): string {
    return join(this.baseDir, 'ops', 'queue.json');
  }

  private statePath(): string {
    return join(this.baseDir, 'ops', 'state.json');
  }

  private auditPath(): string {
    return join(this.baseDir, 'ops', 'audit.jsonl');
  }

  async init(defaultDailyBudget = 10): Promise<void> {
    await mkdir(join(this.baseDir, 'ops'), { recursive: true });
    const state = await this.loadState(defaultDailyBudget);
    await this.saveState(state);
    const queue = await this.loadQueue();
    await this.saveQueue(queue);
  }

  async enqueueGoal(description: string, approvalScope: 'required' | 'preapproved' = 'required', maxRetries = 2): Promise<AutonomousGoalItem> {
    const queue = await this.loadQueue();
    const goal: AutonomousGoalItem = {
      goalId: `goal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createdAtMs: Date.now(),
      description,
      approvalScope,
      retries: 0,
      maxRetries,
      status: 'queued',
    };
    queue.push(goal);
    await this.saveQueue(queue);
    await this.appendAudit('goal_enqueued', { goalId: goal.goalId, approvalScope, description });
    return goal;
  }

  async inspectQueue(): Promise<{ state: OpsState; queue: AutonomousGoalItem[] }> {
    const state = await this.loadState();
    const queue = await this.loadQueue();
    return { state, queue };
  }

  async setAutopause(enabled: boolean): Promise<void> {
    const state = await this.loadState();
    state.autopause = enabled;
    state.updatedAtMs = Date.now();
    await this.saveState(state);
    await this.appendAudit('ops_autopause', { enabled });
  }

  async stop(): Promise<void> {
    const state = await this.loadState();
    state.stopped = true;
    state.updatedAtMs = Date.now();
    await this.saveState(state);
    await this.appendAudit('ops_stopped', {});
  }

  async resume(): Promise<void> {
    const state = await this.loadState();
    state.stopped = false;
    state.updatedAtMs = Date.now();
    await this.saveState(state);
    await this.appendAudit('ops_resumed', {});
  }

  async runScheduledGoals(options: {
    approvedGoalIds?: string[];
    dailyBudget?: number;
    executeGoal: (goal: AutonomousGoalItem) => Promise<{ success: boolean; output: string }>;
  }): Promise<OpsRunResult> {
    const approved = new Set(options.approvedGoalIds ?? []);
    const state = await this.loadState(options.dailyBudget ?? 10);
    if (typeof options.dailyBudget === 'number') {
      state.dailyBudget = options.dailyBudget;
    }

    const queue = await this.loadQueue();

    if (state.stopped || state.autopause) {
      await this.appendAudit('ops_noop', { reason: state.stopped ? 'stopped' : 'autopause' });
      return { executed: 0, escalated: 0, remaining: queue.filter(g => g.status === 'queued').length };
    }

    let executed = 0;
    let escalated = 0;

    while (true) {
      const rankedPortfolio = this.rankGoalPortfolio(queue, state.updatedAtMs);
      if (rankedPortfolio.length === 0) break;

      await this.appendAudit('goal_portfolio_ranking', {
        ranking: rankedPortfolio.map(item => ({
          goalId: item.goal.goalId,
          description: item.goal.description,
          status: item.goal.status,
          score: item.score,
        })),
      });

      const candidate = rankedPortfolio[0];
      const goal = candidate.goal;

      await this.appendAudit('goal_selected', {
        goalId: goal.goalId,
        chosenScore: candidate.score,
        opportunityCost: rankedPortfolio.slice(1, 4).map(item => ({
          goalId: item.goal.goalId,
          description: item.goal.description,
          scoreDelta: Number((candidate.score.totalScore - item.score.totalScore).toFixed(6)),
          score: item.score,
        })),
      });

      if (state.consumedToday >= state.dailyBudget) {
        goal.status = 'autopaused';
        await this.appendAudit('goal_autopaused_budget', {
          goalId: goal.goalId,
          opportunityCost: rankedPortfolio.slice(1, 4).map(item => ({
            goalId: item.goal.goalId,
            totalScore: item.score.totalScore,
          })),
        });
        break;
      }

      if (goal.approvalScope === 'required' && !approved.has(goal.goalId)) {
        goal.status = 'escalated';
        goal.lastError = 'approval_required';
        escalated += 1;
        await this.appendAudit('goal_escalated', {
          goalId: goal.goalId,
          reason: 'approval_required',
          opportunityCost: rankedPortfolio.slice(1, 4).map(item => ({
            goalId: item.goal.goalId,
            totalScore: item.score.totalScore,
          })),
        });
        continue;
      }

      goal.status = 'running';
      await this.appendAudit('goal_started', { goalId: goal.goalId, portfolioScore: goal.portfolioScore });

      const result = await options.executeGoal(goal);
      state.consumedToday += 1;

      if (result.success) {
        goal.status = 'completed';
        goal.lastError = undefined;
        executed += 1;
        await this.appendAudit('goal_completed', { goalId: goal.goalId, output: result.output });
      } else {
        goal.retries += 1;
        goal.lastError = result.output;
        if (goal.retries > goal.maxRetries) {
          goal.status = 'escalated';
          escalated += 1;
          await this.appendAudit('goal_escalated', {
            goalId: goal.goalId,
            reason: result.output,
            opportunityCost: rankedPortfolio.slice(1, 4).map(item => ({
              goalId: item.goal.goalId,
              totalScore: item.score.totalScore,
            })),
          });
        } else {
          goal.status = 'failed';
          await this.appendAudit('goal_failed_retry', {
            goalId: goal.goalId,
            retries: goal.retries,
            reason: result.output,
            opportunityCost: rankedPortfolio.slice(1, 4).map(item => ({
              goalId: item.goal.goalId,
              totalScore: item.score.totalScore,
            })),
          });
        }
      }

      state.updatedAtMs = Date.now();
    }

    state.updatedAtMs = Date.now();
    await this.saveState(state);
    await this.saveQueue(queue);

    return {
      executed,
      escalated,
      remaining: queue.filter(g => g.status === 'queued' || g.status === 'failed' || g.status === 'autopaused').length,
    };
  }

  private rankGoalPortfolio(queue: AutonomousGoalItem[], nowMs: number): RankedGoal[] {
    const eligible = queue.filter(goal => goal.status === 'queued' || goal.status === 'failed');
    const ranked = eligible.map(goal => {
      const score = this.scoreGoalPortfolio(goal, nowMs);
      goal.portfolioScore = score;
      return { goal, score };
    });

    ranked.sort((a, b) => b.score.totalScore - a.score.totalScore || a.goal.createdAtMs - b.goal.createdAtMs);
    return ranked;
  }

  private scoreGoalPortfolio(goal: AutonomousGoalItem, nowMs: number): GoalPortfolioScore {
    const description = goal.description.toLowerCase();
    const ageHours = Math.max(0, (nowMs - goal.createdAtMs) / (1000 * 60 * 60));

    const valueBase =
      (description.includes('incident') ? 0.35 : 0)
      + (description.includes('customer') ? 0.25 : 0)
      + (description.includes('security') ? 0.25 : 0)
      + (description.includes('revenue') ? 0.2 : 0)
      + 0.25;

    const costBase =
      (description.includes('migrate') ? 0.3 : 0)
      + (description.includes('refactor') ? 0.25 : 0)
      + (description.includes('deploy') ? 0.2 : 0)
      + (description.includes('summary') ? 0.05 : 0)
      + 0.15;

    const riskBase =
      (description.includes('delete') ? 0.35 : 0)
      + (description.includes('rollback') ? 0.15 : 0)
      + (description.includes('prod') ? 0.2 : 0)
      + (goal.approvalScope === 'required' ? 0.2 : 0)
      + 0.1;

    const urgencySignal =
      (description.includes('urgent') ? 0.3 : 0)
      + (description.includes('today') ? 0.2 : 0)
      + (description.includes('asap') ? 0.2 : 0)
      + (description.includes('incident') ? 0.2 : 0)
      + 0.1;

    const urgencyDecay = Math.max(0.2, Math.min(1.5, 1 + (ageHours / 48)));

    const valueEstimate = Math.min(1, valueBase);
    const costEstimate = Math.min(1, costBase);
    const riskEstimate = Math.min(1, riskBase);
    const urgencyScore = Math.min(1, urgencySignal);

    const totalScore = Number(((valueEstimate * 0.45) + (urgencyScore * urgencyDecay * 0.35) - (costEstimate * 0.1) - (riskEstimate * 0.1)).toFixed(6));

    return {
      valueEstimate: Number(valueEstimate.toFixed(6)),
      costEstimate: Number(costEstimate.toFixed(6)),
      riskEstimate: Number(riskEstimate.toFixed(6)),
      urgencyScore: Number(urgencyScore.toFixed(6)),
      urgencyDecay: Number(urgencyDecay.toFixed(6)),
      totalScore,
      scoredAtMs: nowMs,
    };
  }

  private async loadQueue(): Promise<AutonomousGoalItem[]> {
    try {
      const raw = await readFile(this.queuePath(), 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async saveQueue(queue: AutonomousGoalItem[]): Promise<void> {
    await writeFile(this.queuePath(), JSON.stringify(queue, null, 2), 'utf8');
  }

  private async loadState(defaultDailyBudget = 10): Promise<OpsState> {
    try {
      const raw = await readFile(this.statePath(), 'utf8');
      const parsed = JSON.parse(raw) as OpsState;
      return {
        dailyBudget: Number(parsed.dailyBudget ?? defaultDailyBudget),
        consumedToday: Number(parsed.consumedToday ?? 0),
        autopause: Boolean(parsed.autopause),
        stopped: Boolean(parsed.stopped),
        updatedAtMs: Number(parsed.updatedAtMs ?? Date.now()),
      };
    } catch {
      return {
        dailyBudget: defaultDailyBudget,
        consumedToday: 0,
        autopause: false,
        stopped: false,
        updatedAtMs: Date.now(),
      };
    }
  }

  private async saveState(state: OpsState): Promise<void> {
    await writeFile(this.statePath(), JSON.stringify(state, null, 2), 'utf8');
  }

  private async appendAudit(event: string, payload: Record<string, unknown>): Promise<void> {
    const line = JSON.stringify({ timestampMs: Date.now(), event, payload });
    let previous = '';
    try {
      previous = await readFile(this.auditPath(), 'utf8');
    } catch {
      previous = '';
    }
    await writeFile(this.auditPath(), `${previous}${line}\n`, 'utf8');
  }
}
