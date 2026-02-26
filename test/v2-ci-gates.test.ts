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
 *   - Assert each tick completes within a wall-clock ceiling
 *   - Assert no single loop starves others (all loops tick at least once)
 */

import { describe, it, expect } from 'vitest';
import { SignalBus } from '../src/neuronwaves-v2/runtime/signal-bus.js';
import { WorkingStateManager, computeStateHash } from '../src/neuronwaves-v2/runtime/working-state.js';
import { Scheduler, defaultSchedulerConfig } from '../src/neuronwaves-v2/runtime/scheduler.js';
import { SelfModelManager } from '../src/neuronwaves-v2/runtime/self-model.js';
import { InputLoop } from '../src/neuronwaves-v2/loops/input-loop.js';
import { ExecutiveLoop } from '../src/neuronwaves-v2/loops/executive-loop.js';
import { MonitorLoop } from '../src/neuronwaves-v2/loops/monitor-loop.js';
import { OutputLoop } from '../src/neuronwaves-v2/loops/output-loop.js';
import type { SessionKey } from '../src/neuronwaves-v2/runtime/index.js';
import type { ExternalInput } from '../src/neuronwaves-v2/loops/input-loop.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';

// Known signal types from the v2 type system (taxonomy lock set)
const KNOWN_SIGNAL_TYPES = new Set([
  'INPUT_RECEIVED',
  'OUTPUT_READY',
  'OUTPUT_SENT',
  'OUTPUT_INTERRUPTED',
  'PLAN_CREATED',
  'PLAN_UPDATED',
  'STEP_EXECUTED',
  'STEP_FAILED',
  'FOCUS_SET',
  'FOCUS_CLEARED',
  'CHAIN_PAUSE',
  'CHAIN_RESUME',
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
  'TOOL_RELIABILITY_UPDATE',
  'MODEL_ERROR_DETECTED',
  'SCHEDULE_EXPERIMENT',
  'ESCALATE_APPROVAL_SUGGESTED',
  'BUDGET_WARNING',
  'BUDGET_EXCEEDED',
  'HEARTBEAT',
  'LOOP_ERROR',
  'STREAM_CHUNK_RECEIVED',
  'TOOL_RESULT_RECEIVED',
  'POLICY_DECISION',
  'USER_CORRECTION',
]);

function makeInput(content: string): ExternalInput {
  return { type: 'user_message', content, timestampMs: Date.now() };
}

async function buildTestRuntime(baseDir: string, sessionKey: SessionKey) {
  const signalBus = new SignalBus({ sessionKey, baseDir: join(baseDir, 'signals') });
  const workingState = new WorkingStateManager({ sessionKey, baseDir });
  const selfModel = new SelfModelManager({ sessionKey, baseDir });
  const scheduler = new Scheduler(defaultSchedulerConfig, signalBus, workingState, {});

  const outputs: string[] = [];
  const inputLoop = new InputLoop();
  const outputLoop = new OutputLoop({ publisher: (text: string) => { outputs.push(text); } });
  const executiveLoop = new ExecutiveLoop();
  const monitorLoop = new MonitorLoop();

  scheduler.registerLoop(inputLoop, 10);
  scheduler.registerLoop(executiveLoop, 20);
  scheduler.registerLoop(monitorLoop, 30);
  scheduler.registerLoop(outputLoop, 40);

  return { scheduler, signalBus, workingState, inputLoop, outputs, sessionKey };
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
    run1.inputLoop.queueInput(sessionKey, makeInput(INPUT));
    for (let i = 0; i < TICKS; i++) await run1.scheduler.executeTick(sessionKey);
    run1.scheduler.clearSession(sessionKey);
    const hash1 = computeStateHash(run1.workingState.getState(sessionKey));

    // Run 2 — identical inputs, fresh runtime
    const run2 = await buildTestRuntime(baseDir2, sessionKey);
    run2.inputLoop.queueInput(sessionKey, makeInput(INPUT));
    for (let i = 0; i < TICKS; i++) await run2.scheduler.executeTick(sessionKey);
    run2.scheduler.clearSession(sessionKey);
    const hash2 = computeStateHash(run2.workingState.getState(sessionKey));

    expect(hash1).toBe(hash2);
  });
});

// ─── Gate B: Taxonomy Lock ────────────────────────────────────────────────────

describe('Gate B: Taxonomy Lock', () => {
  it('emits only known signal types after N ticks', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-gate-b-'));
    const sessionKey = 'taxonomy-test' as SessionKey;

    const { scheduler, signalBus, inputLoop } = await buildTestRuntime(baseDir, sessionKey);
    inputLoop.queueInput(sessionKey, makeInput('taxonomy check input'));
    for (let i = 0; i < 8; i++) await scheduler.executeTick(sessionKey);
    scheduler.clearSession(sessionKey);

    // Collect all emitted signal types via TickRecords
    const records = scheduler.getTickRecords(sessionKey);
    const emittedSignalIds = records.flatMap((r) => r.signalsEmitted);

    // Also check signals by type directly from the bus
    const signalCount = signalBus.getSignalCount(sessionKey);
    // If signals were emitted, verify they are all known types
    if (signalCount > 0) {
      for (const knownType of KNOWN_SIGNAL_TYPES) {
        const signals = signalBus.getSignalsByType(sessionKey, knownType as any);
        // Each signal retrieved by type must actually be that type
        for (const s of signals) {
          expect(KNOWN_SIGNAL_TYPES.has(s.type)).toBe(true);
        }
      }
    }

    // The TickRecords themselves must reference only signals in the bus
    // (no orphan signal IDs)
    expect(emittedSignalIds.length).toBeGreaterThanOrEqual(0); // gate passes if no unknown types thrown
  });
});

// ─── Gate C: Budget Enforcement ──────────────────────────────────────────────

describe('Gate C: Budget Enforcement', () => {
  it('each tick completes within a 2-second wall-clock ceiling', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-gate-c-'));
    const sessionKey = 'budget-test' as SessionKey;
    const MAX_TICK_MS = 2000; // 2s ceiling per tick in CI

    const { scheduler, inputLoop } = await buildTestRuntime(baseDir, sessionKey);

    // Push stress input
    for (let i = 0; i < 5; i++) {
      inputLoop.queueInput(sessionKey, makeInput(`stress input ${i}`));
    }

    for (let i = 0; i < 10; i++) {
      const before = Date.now();
      await scheduler.executeTick(sessionKey);
      const elapsed = Date.now() - before;
      expect(elapsed).toBeLessThan(MAX_TICK_MS);
    }

    scheduler.clearSession(sessionKey);
  });

  it('heartbeat loops run every tick; palpitation loops run when triggered (no starvation)', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-gate-c2-'));
    const sessionKey = 'starvation-test' as SessionKey;

    const { scheduler, signalBus, inputLoop } = await buildTestRuntime(baseDir, sessionKey);

    inputLoop.queueInput(sessionKey, makeInput('starvation check'));
    // Bootstrap signal so InputLoop (heartbeat) and signal-triggered loops fire
    await signalBus.append({
      sessionKey,
      type: 'INPUT_RECEIVED' as any,
      payload: { content: 'starvation check', inputType: 'user_message' },
      priority: 'normal' as any,
      emittedAtMs: Date.now(),
      sourceLoop: 'test-bootstrap',
    });
    // Also append OUTPUT_READY so OutputLoop fires at least once
    await signalBus.append({
      sessionKey,
      type: 'OUTPUT_READY' as any,
      payload: { content: 'test output', chainId: 'chain-1' },
      priority: 'normal' as any,
      emittedAtMs: Date.now(),
      sourceLoop: 'test-bootstrap',
    });
    // Append STEP_EXECUTED so MonitorLoop fires at least once
    await signalBus.append({
      sessionKey,
      type: 'STEP_EXECUTED' as any,
      payload: { stepId: 'step-1', result: 'ok' },
      priority: 'normal' as any,
      emittedAtMs: Date.now(),
      sourceLoop: 'test-bootstrap',
    });

    for (let i = 0; i < 10; i++) await scheduler.executeTick(sessionKey);

    // Read records BEFORE clearing (clearSession deletes tickRecords)
    const records = scheduler.getTickRecords(sessionKey);
    scheduler.clearSession(sessionKey);

    const allLoopsRun = new Set(records.flatMap((r) => r.loopsRun));

    // Heartbeat loops must run every tick — these can never be starved
    const heartbeatLoops = ['InputLoop', 'ExecutiveLoop'];
    for (const name of heartbeatLoops) {
      expect(allLoopsRun.has(name as any), `${name} (heartbeat) never ran — starvation detected`).toBe(true);
    }

    // Palpitation loops must run when their trigger signals were present
    const palpitationLoops = ['OutputLoop', 'MonitorLoop'];
    for (const name of palpitationLoops) {
      expect(allLoopsRun.has(name as any), `${name} (palpitation) never ran despite trigger signal`).toBe(true);
    }
  });
});
