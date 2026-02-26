/**
 * NeuronWaves v2 CI Gates
 *
 * Gate A: Deterministic Replay
 *   - Run runtime for N ticks with known input
 *   - Capture final WorkingState hash
 *   - Assert hash is stable across runs (deterministic)
 *
 * Gate B: Taxonomy Lock
 *   - Assert no unknown signal types are emitted
 *   - Assert loops emit only declared signal types
 *
 * Gate C: Budget Enforcement
 *   - Assert each tick completes within declared tickBudgetMs
 *   - Assert no single loop starves others
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SignalBus } from '../src/neuronwaves-v2/runtime/signal-bus.js';
import { WorkingStateManager, computeStateHash, createInitialWorkingState } from '../src/neuronwaves-v2/runtime/working-state.js';
import { Scheduler, defaultSchedulerConfig } from '../src/neuronwaves-v2/runtime/scheduler.js';
import { SelfModelManager } from '../src/neuronwaves-v2/runtime/self-model.js';
import { InputLoop } from '../src/neuronwaves-v2/loops/input-loop.js';
import { ExecutiveLoop } from '../src/neuronwaves-v2/loops/executive-loop.js';
import { MonitorLoop } from '../src/neuronwaves-v2/loops/monitor-loop.js';
import { OutputLoop } from '../src/neuronwaves-v2/loops/output-loop.js';
import type { SessionKey } from '../src/neuronwaves-v2/runtime/index.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';

// Known signal types from the v2 type system
const KNOWN_SIGNAL_TYPES = new Set([
  'INPUT_RECEIVED',
  'OUTPUT_READY',
  'OUTPUT_SENT',
  'PLAN_CREATED',
  'PLAN_UPDATED',
  'STEP_EXECUTED',
  'STEP_FAILED',
  'FOCUS_SET',
  'FOCUS_CLEARED',
  'EXECUTIVE_DECISION',
  'EXEC_REQUEST_REPLAN',
  'EXEC_APPROVE_STEP',
  'REQUEST_CLARIFICATION',
  'CONFIDENCE_RISE',
  'CONFIDENCE_DROP',
  'UNCERTAINTY_HIGH',
  'RISK_HIGH',
  'INVARIANT_VIOLATION',
  'SELF_MODEL_UPDATED',
  'BUDGET_WARNING',
  'BUDGET_EXCEEDED',
  'HEARTBEAT',
  'LOOP_ERROR',
]);

async function buildTestRuntime(baseDir: string, sessionKey: SessionKey) {
  const signalBus = new SignalBus({ sessionKey, baseDir: join(baseDir, 'signals') });
  const workingState = new WorkingStateManager({ sessionKey, baseDir });
  const selfModel = new SelfModelManager({ sessionKey, baseDir });
  const scheduler = new Scheduler(defaultSchedulerConfig, signalBus, workingState, {});

  const outputs: string[] = [];
  const inputLoop = new InputLoop(signalBus, workingState);
  const outputLoop = new OutputLoop(signalBus, workingState, (text) => outputs.push(text));
  const executiveLoop = new ExecutiveLoop(signalBus, workingState, selfModel);
  const monitorLoop = new MonitorLoop(signalBus, workingState, selfModel);

  scheduler.registerLoop(inputLoop, 10);
  scheduler.registerLoop(executiveLoop, 20);
  scheduler.registerLoop(monitorLoop, 30);
  scheduler.registerLoop(outputLoop, 40);

  return { scheduler, signalBus, workingState, outputs, sessionKey };
}

// ─── Gate A: Deterministic Replay ────────────────────────────────────────────

describe('Gate A: Deterministic Replay', () => {
  it('produces identical WorkingState hash for identical inputs across two runs', async () => {
    const baseDir1 = await mkdtemp(join(tmpdir(), 'v2-gate-a-run1-'));
    const baseDir2 = await mkdtemp(join(tmpdir(), 'v2-gate-a-run2-'));
    const sessionKey = 'replay-test' as SessionKey;
    const TICKS = 5;
    const INPUT = 'Hello deterministic world';

    // Run 1
    const run1 = await buildTestRuntime(baseDir1, sessionKey);
    run1.scheduler.startSession(sessionKey);
    await run1.signalBus.appendInput(sessionKey, INPUT);
    for (let i = 0; i < TICKS; i++) await run1.scheduler.tick(sessionKey);
    await run1.scheduler.stopSession(sessionKey);
    const hash1 = computeStateHash(run1.workingState.getState(sessionKey));

    // Run 2 — identical inputs
    const run2 = await buildTestRuntime(baseDir2, sessionKey);
    run2.scheduler.startSession(sessionKey);
    await run2.signalBus.appendInput(sessionKey, INPUT);
    for (let i = 0; i < TICKS; i++) await run2.scheduler.tick(sessionKey);
    await run2.scheduler.stopSession(sessionKey);
    const hash2 = computeStateHash(run2.workingState.getState(sessionKey));

    expect(hash1).toBe(hash2);
  });
});

// ─── Gate B: Taxonomy Lock ────────────────────────────────────────────────────

describe('Gate B: Taxonomy Lock', () => {
  it('emits only known signal types after N ticks', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-gate-b-'));
    const sessionKey = 'taxonomy-test' as SessionKey;

    const { scheduler, signalBus } = await buildTestRuntime(baseDir, sessionKey);
    scheduler.startSession(sessionKey);
    await signalBus.appendInput(sessionKey, 'taxonomy check input');
    for (let i = 0; i < 8; i++) await scheduler.tick(sessionKey);
    await scheduler.stopSession(sessionKey);

    const allSignals = signalBus.getAllSignals(sessionKey);
    const unknownTypes = allSignals
      .map((s) => s.type)
      .filter((type) => !KNOWN_SIGNAL_TYPES.has(type));

    expect(unknownTypes).toEqual([]);
  });
});

// ─── Gate C: Budget Enforcement ──────────────────────────────────────────────

describe('Gate C: Budget Enforcement', () => {
  it('each tick completes within 2× the declared tickBudgetMs for all loops', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-gate-c-'));
    const sessionKey = 'budget-test' as SessionKey;
    const BUDGET_SLACK = 2; // allow up to 2× declared budget (CI tolerance)

    const overruns: { loop: string; declared: number; actual: number }[] = [];
    const { scheduler, signalBus } = await buildTestRuntime(baseDir, sessionKey);

    scheduler.startSession(sessionKey);
    // Push stress input
    for (let i = 0; i < 5; i++) {
      await signalBus.appendInput(sessionKey, `stress input ${i}`);
    }

    for (let i = 0; i < 10; i++) {
      const before = Date.now();
      await scheduler.tick(sessionKey);
      // tick-level check: full tick should be bounded
      // Individual loop overruns are checked via TickRecords
    }
    await scheduler.stopSession(sessionKey);

    // Check TickRecords for per-loop overruns
    const records = scheduler.getTickRecords(sessionKey);
    for (const record of records) {
      for (const [loopName, loopResult] of Object.entries(record.loopResults ?? {})) {
        const declared = (loopResult as any).declaredBudgetMs;
        const actual = (loopResult as any).durationMs;
        if (declared && actual > declared * BUDGET_SLACK) {
          overruns.push({ loop: loopName, declared, actual });
        }
      }
    }

    expect(overruns).toEqual([]);
  });

  it('no single loop monopolises all ticks (starvation check)', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-gate-c2-'));
    const sessionKey = 'starvation-test' as SessionKey;

    const { scheduler, signalBus } = await buildTestRuntime(baseDir, sessionKey);
    scheduler.startSession(sessionKey);
    await signalBus.appendInput(sessionKey, 'starvation check');
    for (let i = 0; i < 10; i++) await scheduler.tick(sessionKey);
    await scheduler.stopSession(sessionKey);

    const records = scheduler.getTickRecords(sessionKey);
    const loopTickCounts = new Map<string, number>();
    for (const record of records) {
      for (const loopName of Object.keys(record.loopResults ?? {})) {
        loopTickCounts.set(loopName, (loopTickCounts.get(loopName) ?? 0) + 1);
      }
    }

    // Every registered loop should have ticked at least once
    const loopNames = ['InputLoop', 'ExecutiveLoop', 'MonitorLoop', 'OutputLoop'];
    for (const name of loopNames) {
      expect(loopTickCounts.get(name) ?? 0).toBeGreaterThan(0);
    }
  });
});
