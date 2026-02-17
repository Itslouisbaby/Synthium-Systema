#!/usr/bin/env node

// entry point for ANSI TUI CLI

import { startANSITUI } from './main.js';

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\nGoodbye!');
  process.exit(0);
});

// Parse command line args
const args = process.argv.slice(2);
const session = args.find(arg => arg.startsWith('--session='))?.split('=')[1];
const title = args.find(arg => arg.startsWith('--title='))?.split('=')[1];
const workspace = args.find(arg => arg.startsWith('--workspace='))?.split('=')[1];

// Start the TUI
try {
  const tui = startANSITUI({
    session: session || 'synth',
    title: title || 'Synthium Systema',
    workspace,
  });

  console.log('ANSI TUI started. Press Ctrl+C to exit.');
} catch (error) {
  console.error('Failed to start ANSI TUI:', error);
  process.exit(1);
}
