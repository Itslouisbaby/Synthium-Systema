import { AgenticOpsManager } from '../../ops/agentic-ops.js';
import { SynthRuntime } from '../../synth-runtime.js';

export async function runOps(action?: string, args: string[] = []): Promise<void> {
  const baseDir = process.env.SYNTH_BASE_DIR ?? '.synth';
  const ops = new AgenticOpsManager(baseDir);
  await ops.init(Number(process.env.SYNTH_OPS_DAILY_BUDGET ?? '10'));

  switch (action) {
    case 'inspect': {
      const view = await ops.inspectQueue();
      console.log(`[Ops] state: ${JSON.stringify(view.state)}`);
      for (const goal of view.queue) {
        console.log(`- ${goal.goalId} [${goal.status}] retries=${goal.retries}/${goal.maxRetries} scope=${goal.approvalScope} :: ${goal.description}`);
      }
      return;
    }

    case 'enqueue': {
      const description = args.join(' ').trim();
      if (!description) {
        console.log('Usage: synth ops enqueue <goal description>');
        return;
      }
      const goal = await ops.enqueueGoal(description, 'required');
      console.log(`[Ops] queued ${goal.goalId}`);
      return;
    }

    case 'run': {
      const approvedArg = args.find(arg => arg.startsWith('--approved='));
      const approved = approvedArg
        ? approvedArg.split('=')[1].split(',').map(item => item.trim()).filter(Boolean)
        : [];

      const result = await ops.runScheduledGoals({
        approvedGoalIds: approved,
        executeGoal: async (goal) => {
          const runtime = new SynthRuntime({
            baseDir,
            enableAutonomy: false,
            enableLearning: false,
            enableMemory: true,
            tickRate: 10,
          });
          await runtime.start();
          try {
            const output = await runtime.processInput(goal.description);
            return { success: true, output };
          } catch (error) {
            return { success: false, output: error instanceof Error ? error.message : String(error) };
          } finally {
            runtime.stop();
          }
        },
      });

      console.log(`[Ops] executed=${result.executed} escalated=${result.escalated} remaining=${result.remaining}`);
      return;
    }

    case 'stop':
      await ops.stop();
      console.log('[Ops] queue stopped');
      return;

    case 'autopause':
      await ops.setAutopause(true);
      console.log('[Ops] autopause enabled');
      return;

    case 'resume':
      await ops.resume();
      await ops.setAutopause(false);
      console.log('[Ops] queue resumed');
      return;

    default:
      console.log('Usage: synth ops [inspect|enqueue|run|stop|autopause|resume]');
      return;
  }
}
