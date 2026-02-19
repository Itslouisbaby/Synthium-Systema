#!/usr/bin/env node
/**
 * Synth NeuronWaves - CLI Entry Point
 * Milestone 5: CLI framework
 *
 * Usage:
 *   synth run --session <id> "<text>" --level 1|2|3 --workspace <path>
 *   synth status --session <id> --workspace <path>
 *   synth show plan|memory --session <id> --workspace <path> --json
 *   synth tail observations|plans|evaluations|audit --session <id> --workspace <path>
 *   synth approve|deny --session <id> --step <stepId> --workspace <path>
 *   synth sessions --workspace <path>
 *   synth policy simulate|diff|bundle|verify-bundle ...
 */

import type { CLIOptions, CLIResult } from './types.js';
import { validateSessionId } from './types.js';

/**
 * Exit codes
 */
const EXIT_SUCCESS = 0;
const EXIT_USER_ERROR = 1;
const EXIT_SYSTEM_ERROR = 2;

/**
 * Parsed command structure
 */
interface ParsedCommand {
  command: string;
  options: CLIOptions;
}

/**
 * Parse CLI arguments from process.argv
 * @returns Parsed command and options
 */
function parseArgs(argv: string[]): ParsedCommand {
  // Skip node/bin and script name
  const args = argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  const command = args[0];
  const options: CLIOptions = {
    workspace: process.cwd(),
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--workspace':
      case '-w':
        options.workspace = args[++i];
        break;

      case '--session':
      case '-s':
        options.sessionId = args[++i];
        break;

      case '--level':
      case '-l':
        options.level = parseInt(args[++i], 10);
        if (![1, 2, 3].includes(options.level)) {
          console.error('Error: --level must be 1, 2, or 3');
          process.exit(EXIT_USER_ERROR);
        }
        break;

      case '--json':
        options.json = true;
        break;

      case '--step':
        options.stepId = args[++i];
        break;

      case '--policy':
        options.policyPath = args[++i];
        break;

      case '--input':
        options.inputPath = args[++i];
        break;

      case '--from':
        options.fromPath = args[++i];
        break;

      case '--to':
        options.toPath = args[++i];
        break;

      case '--out':
        options.outPath = args[++i];
        break;

      case '--bundle':
        options.bundlePath = args[++i];
        break;

      case '--private-key':
        options.privateKeyPath = args[++i];
        break;

      case '--public-key':
        options.publicKeyPath = args[++i];
        break;

      case '--key-id':
        options.keyId = args[++i];
        break;

      default:
        // Handle positional arguments based on command
        if (command === 'run' && !options.text) {
          options.text = arg;
        } else if (command === 'show' && !options.showTarget) {
          if (arg !== 'plan' && arg !== 'memory') {
            console.error('Error: show target must be "plan" or "memory"');
            process.exit(EXIT_USER_ERROR);
          }
          options.showTarget = arg;
        } else if (command === 'tail' && !options.tailStream) {
          const validStreams = ['observations', 'plans', 'evaluations', 'audit'];
          if (!validStreams.includes(arg)) {
            console.error(`Error: tail stream must be one of: ${validStreams.join(', ')}`);
            process.exit(EXIT_USER_ERROR);
          }
          options.tailStream = arg;
        } else if (command === 'policy' && !options.policyAction) {
          const validPolicyActions = ['simulate', 'diff', 'bundle', 'verify-bundle'];
          if (!validPolicyActions.includes(arg)) {
            console.error(`Error: policy action must be one of: ${validPolicyActions.join(', ')}`);
            process.exit(EXIT_USER_ERROR);
          }
          options.policyAction = arg as CLIOptions['policyAction'];
        } else {
          console.error(`Error: Unexpected argument: ${arg}`);
          process.exit(EXIT_USER_ERROR);
        }
        break;
    }

    i++;
  }

  // Validate session ID if present
  if (options.sessionId && !validateSessionId(options.sessionId)) {
    console.error(
      'Error: Invalid session ID. Must match pattern: ^[a-zA-Z0-9_-]+$'
    );
    process.exit(EXIT_USER_ERROR);
  }

  // Validate required options per command
  validateCommandOptions(command, options);

  return { command, options };
}

/**
 * Validate required options for each command
 */
function validateCommandOptions(command: string, options: CLIOptions): void {
  switch (command) {
    case 'run':
      if (!options.sessionId) {
        console.error('Error: --session is required for run command');
        process.exit(EXIT_USER_ERROR);
      }
      if (!options.text) {
        console.error('Error: Missing input text for run command');
        process.exit(EXIT_USER_ERROR);
      }
      if (!options.level) {
        console.error('Error: --level is required for run command');
        process.exit(EXIT_USER_ERROR);
      }
      break;

    case 'status':
    case 'show':
    case 'tail':
      if (!options.sessionId) {
        console.error(`Error: --session is required for ${command} command`);
        process.exit(EXIT_USER_ERROR);
      }
      break;

    case 'approve':
    case 'deny':
      if (!options.sessionId) {
        console.error(`Error: --session is required for ${command} command`);
        process.exit(EXIT_USER_ERROR);
      }
      if (!options.stepId) {
        console.error(`Error: --step is required for ${command} command`);
        process.exit(EXIT_USER_ERROR);
      }
      break;

    case 'sessions':
      // No required options
      break;

    case 'tui':
      // TUI command - no additional validation needed
      break;

    case 'policy':
      if (!options.policyAction) {
        console.error('Error: policy action is required: simulate | diff | bundle | verify-bundle');
        process.exit(EXIT_USER_ERROR);
      }
      break;

    default:
      console.error(`Error: Unknown command: ${command}`);
      printUsage();
      process.exit(EXIT_USER_ERROR);
  }
}

/**
 * Command handler type
 */
type CommandHandler = (options: CLIOptions) => CLIResult | Promise<CLIResult>;

/**
 * Route command to appropriate handler
 */
async function routeCommand(command: string, options: CLIOptions): Promise<void> {
  const handlers: Record<string, CommandHandler> = {};

  try {
    // Import command handlers dynamically
    // Note: These will be implemented in separate files in commands/
    switch (command) {
      case 'run':
        handlers.run = (await import('./commands/run.js')).default;
        break;
      case 'status':
        handlers.status = (await import('./commands/status.js')).default;
        break;
      case 'show':
        handlers.show = (await import('./commands/show.js')).default;
        break;
      case 'tail':
        handlers.tail = (await import('./commands/tail.js')).default;
        break;
      case 'approve':
        handlers.approve = (await import('./commands/approve.js')).default;
        break;
      case 'deny':
        handlers.deny = (await import('./commands/deny.js')).default;
        break;
      case 'sessions':
        handlers.sessions = (await import('./commands/sessions.js')).default;
        break;
      case 'policy':
        handlers.policy = (await import('./commands/policy.js')).default;
        break;
    }

    // Special inline handler for tui (avoids hash filename issues)
    if (command === 'tui') {
      // Check for TUI implementation environment variable
      const tuiImpl = process.env.SYNTH_TUI_IMPL || 'ansi';
      
      if (tuiImpl === 'blessed') {
        // Launch Blessed TUI (legacy/observer mode)
        const { SynthTUI } = await import('../tui/index.js');
        const tui = new SynthTUI({ workspace: options.workspace, session: options.sessionId });
        await tui.init();
        tui.start();
      } else {
        // Launch ANSI TUI (default)
        const modUrl = new URL('../tui-ansi/index.mjs', import.meta.url);
        const { startANSITUI } = await import(modUrl.href);
        startANSITUI({
          session: options.sessionId || 'synth',
          title: 'Synthium Systema',
          workspace: options.workspace,
        });
      }
      return;
    }

    const handler = handlers[command];
    if (!handler) {
      console.error(`Error: No handler implemented for command: ${command}`);
      process.exit(EXIT_SYSTEM_ERROR);
    }

    const result = await handler(options);

    // Handle output
    if (result.output) {
      console.log(result.output);
    }

    // Handle error
    if (result.error) {
      console.error(result.error);
    }

    // Exit with appropriate code
    process.exit(result.exitCode);
  } catch (error) {
    console.error(`Error executing command '${command}':`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(EXIT_SYSTEM_ERROR);
  }
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Synth NeuronWaves - Cognitive Planning System CLI

Usage:
  synth run --session <id> "<text>" --level 1|2|3 [--workspace <path>]
    Run the planning loop with given input

  synth status --session <id> [--workspace <path>]
    Show current status of a session

  synth show <plan|memory> --session <id> [--workspace <path>] [--json]
    Show plan or memory for a session

  synth tail <observations|plans|evaluations|audit> --session <id> [--workspace <path>]
    Tail (follow) a stream for a session

  synth approve --session <id> --step <stepId> [--workspace <path>]
    Approve a pending step

  synth deny --session <id> --step <stepId> [--workspace <path>]
    Deny a pending step

  synth sessions [--workspace <path>]
    List all sessions

  synth policy simulate --policy <path> --input <json>
    Simulate a policy decision for a provided input case

  synth policy diff --from <old-policy> --to <new-policy>
    Generate a policy diff report (JSON)

  synth policy bundle --policy <path> --out <dir> --private-key <pem> --key-id <id>
    Create signed policy bundle

  synth policy verify-bundle --bundle <dir> --public-key <pem>
    Verify signed policy bundle

Options:
  --workspace, -w <path>   Workspace directory (default: current directory)
  --session, -s <id>       Session identifier
  --level, -l <1|2|3>      Autonomy level (1-3)
  --json                   Output in JSON format
  --step <id>              Step identifier (for approve/deny)
  --policy <path>          Policy yaml path
  --input <path>           Simulation input JSON path
  --from <path>            Diff source policy path
  --to <path>              Diff target policy path
  --out <dir>              Bundle output directory
  --bundle <dir>           Bundle directory for verification
  --private-key <path>     Private key PEM path (Ed25519)
  --public-key <path>      Public key PEM path (Ed25519)
  --key-id <id>            Key identifier to store in manifest

Session ID format:
  Must match: ^[a-zA-Z0-9_-]+$ (alphanumeric, underscores, hyphens)

Examples:
  synth run --session my-session "Analyze the logs" --level 2
  synth status --session my-session
  synth show plan --session my-session --json
  synth tail observations --session my-session
  synth approve --session my-session --step step-123
  synth sessions
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv);
  await routeCommand(command, options);
}

// Run main as the entry point for this CLI
main().catch((error) => {
  console.error('Fatal error:');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(EXIT_SYSTEM_ERROR);
});

export { main };
