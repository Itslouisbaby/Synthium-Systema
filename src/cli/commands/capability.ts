import { runCapabilityEval } from '../../evals/capability-harness.js';
import { runAGIEvalMatrix } from '../../evals/agi-eval-matrix.js';
import { runLearningRegressionGuard } from '../../evals/learning-regression-guard.js';
import { runAdversarialRedTeamHarness } from '../../evals/adversarial-red-team-harness.js';
import { runExpectancyBoard } from '../../evals/agi-expectancy-board.js';

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
      const oodTemplateFloor = Number(args.find(arg => arg.startsWith('--ood-template-floor='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_OOD_TEMPLATE_FLOOR ?? '0.55');
      const oodToolsFloor = Number(args.find(arg => arg.startsWith('--ood-tools-floor='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_OOD_TOOLS_FLOOR ?? '0.55');
      const oodDomainsFloor = Number(args.find(arg => arg.startsWith('--ood-domains-floor='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_OOD_DOMAINS_FLOOR ?? '0.55');
      const stabilityStddevCeiling = Number(args.find(arg => arg.startsWith('--stability-stddev='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_STABILITY_STDDEV_CEILING ?? '0.08');
      const rollingWindowSize = Number(args.find(arg => arg.startsWith('--rolling-window='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_ROLLING_WINDOW_SIZE ?? '20');
      const rollingStddevCeiling = Number(args.find(arg => arg.startsWith('--rolling-stddev='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_ROLLING_STDDEV_CEILING ?? '0.05');
      const rollingWorstDecileFloor = Number(args.find(arg => arg.startsWith('--rolling-worst-decile-floor='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_ROLLING_WORST_DECILE_FLOOR ?? '0.58');
      const reviseMinUplift = Number(args.find(arg => arg.startsWith('--revise-min-uplift='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_REVISE_MIN_UPLIFT ?? '0.015');
      const revisionUpliftFloor = Number(args.find(arg => arg.startsWith('--revision-uplift-floor='))?.split('=')[1] ?? process.env.SYNTH_AGI_MATRIX_REVISION_UPLIFT_FLOOR ?? '0.30');

      const scorecard = await runAGIEvalMatrix({
        rootDir: '.',
        batchSize,
        aggregateFloor,
        oodFloor,
        perDomainFloor,
        oodTemplateFloor,
        oodToolsFloor,
        oodDomainsFloor,
        stabilityStddevCeiling,
        rollingWindowSize,
        rollingStddevCeiling,
        rollingWorstDecileFloor,
        reviseMinUplift,
        revisionUpliftFloor,
      });

      console.log(`[AGI Matrix] Run ${scorecard.runId}`);
      console.log(`[AGI Matrix] Tasks: ${scorecard.totalTasks} | Aggregate: ${scorecard.normalizedScore.toFixed(3)} | Seen: ${scorecard.seenGroup.normalized.toFixed(3)} | OOD: ${scorecard.oodNormalized.toFixed(3)} | Stability stddev: ${scorecard.stability.stddev.toFixed(4)}`);
      console.log(`[AGI Matrix] Transfer index: ${scorecard.transfer.transferIndex.toFixed(3)} (OOD ${scorecard.transfer.preLearningOOD.toFixed(3)} -> ${scorecard.transfer.postLearningOOD.toFixed(3)} | in-domain gain ${scorecard.transfer.inDomainGain.toFixed(3)})`);
      console.log(`[AGI Matrix] OOD splits: templates=${scorecard.bySplit.ood_unseen_templates.normalized.toFixed(3)}, tools=${scorecard.bySplit.ood_unseen_tools.normalized.toFixed(3)}, domains=${scorecard.bySplit.ood_unseen_domains.normalized.toFixed(3)}`);
      console.log(`[AGI Matrix] Rolling window (n=${scorecard.rollingWindow.windowSize}): mean=${scorecard.rollingWindow.mean.toFixed(3)}, stddev=${scorecard.rollingWindow.stddev.toFixed(4)}, worst-decile=${scorecard.rollingWindow.worstDecileScore.toFixed(3)}`);
      console.log(`[AGI Matrix] Revision uplift: accepted-rate=${scorecard.revisionStats.acceptedUpliftRate.toFixed(3)}, mean-delta=${scorecard.revisionStats.meanDelta.toFixed(4)}, accepted=${scorecard.revisionStats.acceptedCount}, regressions=${scorecard.revisionStats.regressionCount}, no-change=${scorecard.revisionStats.noChangeCount}`);
      for (const [domain, stats] of Object.entries(scorecard.byDomain)) {
        console.log(`  - ${domain}: ${stats.normalized.toFixed(3)} (${stats.score.toFixed(2)}/${stats.max.toFixed(2)})`);
      }
      return;
    }


    case 'red-team': {
      const gracefulDegradationFloor = Number(args.find(arg => arg.startsWith('--graceful-floor='))?.split('=')[1] ?? process.env.SYNTH_REDTEAM_GRACEFUL_FLOOR ?? '0.75');
      const incorrectHighConfidenceCeiling = Number(args.find(arg => arg.startsWith('--incorrect-high-confidence-ceiling='))?.split('=')[1] ?? process.env.SYNTH_REDTEAM_INCORRECT_HIGH_CONFIDENCE_CEILING ?? '0.15');
      const stressLevel = Number(args.find(arg => arg.startsWith('--stress-level='))?.split('=')[1] ?? process.env.SYNTH_REDTEAM_STRESS_LEVEL ?? '0.05');

      const report = await runAdversarialRedTeamHarness({
        rootDir: '.',
        gracefulDegradationFloor,
        incorrectHighConfidenceCeiling,
        stressLevel,
      });

      console.log(`[Red Team] Run ${report.runId}`);
      console.log(`[Red Team] graceful-degradation=${report.gracefulDegradationSuccessRate.toFixed(3)} | incorrect-high-confidence=${report.incorrectHighConfidenceActionRate.toFixed(3)} | scenarios=${report.runs}`);
      for (const item of report.results) {
        console.log(`  - ${item.scenario}: success=${item.success}, graceful=${item.gracefulDegradation}, incorrect_high_conf=${item.highConfidenceIncorrectAction}, confidence=${item.confidence.toFixed(3)}`);
      }
      return;
    }

    case 'expectancy-board': {
      const expectancyTarget = Number(args.find(arg => arg.startsWith('--expectancy-target='))?.split('=')[1] ?? process.env.SYNTH_EXPECTANCY_TARGET ?? '0.60');
      const noSingleAxisCollapseFloor = Number(args.find(arg => arg.startsWith('--collapse-floor='))?.split('=')[1] ?? process.env.SYNTH_EXPECTANCY_COLLAPSE_FLOOR ?? '0.40');

      const report = await runExpectancyBoard({
        rootDir: '.',
        expectancyTarget,
        noSingleAxisCollapseFloor,
        requiredMinima: {
          domainCoverage: Number(process.env.SYNTH_EXPECTANCY_DOMAIN_FLOOR ?? '0.55'),
          oodPerformance: Number(process.env.SYNTH_EXPECTANCY_OOD_FLOOR ?? '0.55'),
          transferGain: Number(process.env.SYNTH_EXPECTANCY_TRANSFER_FLOOR ?? '0.45'),
          selfCorrectionUplift: Number(process.env.SYNTH_EXPECTANCY_SELF_CORRECTION_FLOOR ?? '0.30'),
          causalCalibration: Number(process.env.SYNTH_EXPECTANCY_CAUSAL_FLOOR ?? '0.55'),
          adversarialRobustness: Number(process.env.SYNTH_EXPECTANCY_ADVERSARIAL_FLOOR ?? '0.65'),
          stability: Number(process.env.SYNTH_EXPECTANCY_STABILITY_FLOOR ?? '0.70'),
        },
      });

      console.log(`[Expectancy Board] Run ${report.runId}`);
      console.log(`[Expectancy Board] index=${report.expectancyIndex.toFixed(3)} target=${report.target.toFixed(3)} collapse-floor=${report.noSingleAxisCollapseFloor.toFixed(3)} pass=${report.pass}`);
      for (const [axis, score] of Object.entries(report.axes)) {
        const floor = report.requiredMinima[axis as keyof typeof report.requiredMinima];
        console.log(`  - ${axis}: ${Number(score).toFixed(3)} (floor ${Number(floor).toFixed(3)})`);
      }
      return;
    }


    case 'learning-guard': {
      const tolerance = Number(args.find(arg => arg.startsWith('--tolerance='))?.split('=')[1] ?? process.env.SYNTH_LEARNING_GUARD_TOLERANCE ?? '0.02');
      const regressionBudget = Number(args.find(arg => arg.startsWith('--regression-budget='))?.split('=')[1] ?? process.env.SYNTH_LEARNING_GUARD_REGRESSION_BUDGET ?? '0.08');
      const forcedDriftDelta = Number(args.find(arg => arg.startsWith('--forced-drift='))?.split('=')[1] ?? process.env.SYNTH_LEARNING_GUARD_FORCED_DRIFT_DELTA ?? '0');

      const report = await runLearningRegressionGuard({
        rootDir: '.',
        tolerance,
        regressionBudget,
        forcedDriftDelta,
      });

      console.log(`[Learning Guard] Run ${report.runId}`);
      console.log(`[Learning Guard] Benchmark=${report.benchmarkSize} | Regressed=${report.regressedCount} | TotalRegressionDelta=${report.totalRegressionDelta.toFixed(4)} | Budget=${report.regressionBudget.toFixed(4)}`);
      for (const item of report.results) {
        console.log(`  - ${item.taskId} (${item.domain}): mastered=${item.masteredScore.toFixed(3)}, replay=${item.replayScore.toFixed(3)}, delta=${item.regressionDelta.toFixed(4)}, regressed=${item.regressed}`);
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
      console.log('Usage: synth capability [eval|gate|matrix|learning-guard|red-team|expectancy-board] [--floor=0.60] [--batch-size=40] [--ood-template-floor=0.55] [--ood-tools-floor=0.55] [--ood-domains-floor=0.55] [--rolling-window=20] [--rolling-stddev=0.05] [--rolling-worst-decile-floor=0.58] [--revise-min-uplift=0.015] [--revision-uplift-floor=0.30] [--tolerance=0.02] [--regression-budget=0.08] [--graceful-floor=0.75] [--incorrect-high-confidence-ceiling=0.15] [--stress-level=0.05] [--expectancy-target=0.60] [--collapse-floor=0.40]');
      return;
  }
}
