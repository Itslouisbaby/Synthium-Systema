import { runCapabilityEval } from '../../evals/capability-harness.js';
import { runAGIEvalMatrix } from '../../evals/agi-eval-matrix.js';

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


    case 'matrix': {
      const batchSize = Number(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_BATCH_SIZE ?? '40');
      const aggregateFloor = Number(args.find(arg => arg.startsWith('--aggregate-floor='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_AGGREGATE_FLOOR ?? '0.65');
      const oodFloor = Number(args.find(arg => arg.startsWith('--ood-floor='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_OOD_FLOOR ?? '0.55');
      const perDomainFloor = Number(args.find(arg => arg.startsWith('--per-domain-floor='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_DOMAIN_FLOOR ?? '0.58');
      const stabilityStddevCeiling = Number(args.find(arg => arg.startsWith('--stability-stddev='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_STABILITY_STDDEV_CEILING ?? '0.08');

      const scorecard = await runAGIEvalMatrix({
        rootDir: '.',
        batchSize,
        aggregateFloor,
        oodFloor,
        perDomainFloor,
        stabilityStddevCeiling,
      });

      console.log(`[AGI Matrix] Run ${scorecard.runId}`);
      console.log(`[AGI Matrix] Tasks: ${scorecard.totalTasks} | Aggregate: ${scorecard.normalizedScore.toFixed(3)} | OOD: ${scorecard.oodNormalized.toFixed(3)} | Stability stddev: ${scorecard.stability.stddev.toFixed(4)}`);
      for (const [domain, stats] of Object.entries(scorecard.byDomain)) {
        console.log(`  - ${domain}: ${stats.normalized.toFixed(3)} (${stats.score.toFixed(2)}/${stats.max.toFixed(2)})`);
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
      console.log('Usage: synth capability [eval|gate|matrix] [--floor=0.60] [--batch-size=40]');
      return;
  }
}
