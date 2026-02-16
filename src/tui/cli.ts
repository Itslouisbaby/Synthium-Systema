#!/usr/bin/env node
// Synth TUI CLI entry point
// Usage: synth tui --workspace <path> --session <id?>

import { main } from './index.js';

const args = process.argv.slice(2);
main(args).catch(err => {
  console.error('TUI Error:', err);
  process.exit(1);
});
