import { runCapabilityEval } from '../../evals/capability-harness.js';

export async function runCapability(action?: string, args: string[] = []): Promise<void> {
  const baseDir = process.env.SYNTH_BASE_DIR ?? '.synth';

  switch (action) {
    case 'eval': {
      const scorecard = await runCapabilityEval(baseDir);
      console.log(`[Capability] Run ${scorecard.runId}`);
      console.log(`[Capability] Aggregate: ${scorecard.aggregateScore}/${scorecard.maxAggregateScore} (${(scorecard.normalizedScore * 100).toFixed(1)}%)`);
      for (const task of scorecard.tasks) {
        console.log(`  - ${task.category}: ${task.score}/${task.maxScore} (${task.notes.join('; ')})`);
      }
      return;
    }

    case 'gate': {
      const floorArg = args.find(arg => arg.startsWith('--floor='));
      const floor = Number(
        floorArg?.split('=')[1]
        ?? process.env.SYNTH_CAPABILITY_SCORE_FLOOR
        ?? '0.60'
      );
      const scorecard = await runCapabilityEval(baseDir, floor);
      console.log(`[Capability Gate] PASS: ${scorecard.normalizedScore.toFixed(3)} >= ${floor.toFixed(3)}`);
      return;
    }

    default:
      console.log('Usage: synth capability [eval|gate] [--floor=0.60]');
      return;
  }
}
