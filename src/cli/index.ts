#!/usr/bin/env node
/**
 * Synth CLI - Command Line Interface
 * 
 * Usage:
 *   synth                    # Open TUI (default)
 *   synth tui                # Open TUI explicitly
 *   synth setup              # Run first-time setup
 *   synth status             # Check system health
 *   synth memory stats       # Show memory statistics
 *   synth memory search <q>  # Search memories
 *   synth help               # Show help
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command
const args = process.argv.slice(2);
const command = args[0] || 'tui'; // Default to TUI
const subcommand = args[1];

async function main() {
  // Load package.json for version
  const pkg = JSON.parse(await readFile(join(__dirname, '../../package.json'), 'utf-8'));

  // Command router
  switch (command) {
    case 'tui':
    case 'start':
    case 'chat':
      await runTUI();
      break;

    case 'setup':
    case 'init':
      await runSetup();
      break;

    case 'status':
      await runStatus();
      break;

    case 'memory':
    case 'mem':
      await runMemoryCommand(subcommand);
      break;

    case 'config':
      await runConfig(subcommand);
      break;

    case 'canary':
      await runCanary(subcommand);
      break;

    case 'capability':
      await runCapability(subcommand);
      break;

    case 'ops':
      await runOps(subcommand);
      break;

    case 'help':
    case '--help':
    case '-h':
      showHelp(pkg.version);
      break;

    case 'version':
    case '--version':
    case '-v':
      console.log(`Synth v${pkg.version}`);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "synth help" for available commands');
      process.exit(1);
  }
}

async function runTUI(): Promise<void> {
  const { runTUI } = await import('./commands/tui.js');
  await runTUI();
}

async function runSetup(): Promise<void> {
  const { runSetup } = await import('./setup.js');
  await runSetup();
}

async function runStatus(): Promise<void> {
  const { runStatus } = await import('./commands/status.js');
  await runStatus();
}

async function runMemoryCommand(action?: string): Promise<void> {
  const { runMemoryCommand } = await import('./commands/memory.js');
  await runMemoryCommand(action, process.argv.slice(3));
}

async function runConfig(action?: string): Promise<void> {
  const { runConfig } = await import('./commands/config.js');
  await runConfig(action, process.argv.slice(3));
}

async function runCanary(action?: string): Promise<void> {
  const { runCanary } = await import('./commands/canary.js');
  await runCanary(action);
}

async function runCapability(action?: string): Promise<void> {
  const { runCapability } = await import('./commands/capability.js');
  await runCapability(action, process.argv.slice(3));
}

async function runOps(action?: string): Promise<void> {
  const { runOps } = await import('./commands/ops.js');
  await runOps(action, process.argv.slice(3));
}

function showHelp(version: string): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Synth v${version} - Synthetic Digital Human                    ║
╚══════════════════════════════════════════════════════════════╝

Usage: synth [command] [options]

Commands:
  tui, start, chat          Open interactive TUI (default)
  setup, init               Run first-time configuration
  status                    Show system health status
  memory [action]           Manage memories
    stats                   Show memory statistics
    search <query>          Search memories by keyword
    maintenance             Run memory compression/cleanup
  config [action]           Manage configuration
    path                    Show config file location
    get <key>               Get config value
    set <key> <value>       Set config value
  canary [action]           Run v2 promotion gate automation
  capability [action]       Run capability evaluation and score gating
    eval                    Generate per-run capability scorecard
    gate                    Enforce capability score floor (CI-safe)
  ops [action]              Agentic operations queue controls
    inspect                 Inspect queued goals and ops state
    enqueue <goal>          Add autonomous goal (approval required)
    run [--approved=id,..]  Execute queued goals with bounded budget
    stop|autopause|resume   Control autonomous queue execution
    gate                    Evaluate parity gates and emit machine report
    promote                 Advance rollout stage and v2 percentage
    rollback                Emergency rollback to stage C at 0% v2
    status                  Show rollout stage and cohort health counters
  help                      Show this help message
  version                   Show version

Examples:
  synth                     Start TUI (default)
  synth tui                 Start TUI explicitly
  synth status              Check if Ollama is running
  synth memory stats        Show memory statistics
  synth memory search "AI"  Find memories by keyword
  synth setup               Run first-time setup
  synth canary gate         Execute PR21 promotion gate checks

Environment Variables:
  SYNTH_MODEL               Default LLM model (default: llama3.2)
  OLLAMA_URL                Ollama endpoint (default: http://localhost:11434)
  SYNTH_BASE_DIR            Data directory (default: .synth)

For more help: https://docs.synth.dev
`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
