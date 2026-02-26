#!/usr/bin/env node
/**
 * Post-Install Script
 * Runs after npm install to set up Synth
 */

import { mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const BASE_DIR = '.synth';

async function postInstall(): Promise<void> {
  console.log('Setting up Synth...');

  // Create data directories
  await mkdir(BASE_DIR, { recursive: true });
  await mkdir(join(BASE_DIR, 'core-memories'), { recursive: true });
  await mkdir(join(BASE_DIR, 'vectors'), { recursive: true });
  await mkdir(join(BASE_DIR, 'goals'), { recursive: true });
  await mkdir(join(BASE_DIR, 'learning'), { recursive: true });

  // Check if config exists
  const configPath = join(BASE_DIR, 'config.json');
  
  if (!existsSync(configPath)) {
    console.log('\n✓ Directories created');
    console.log('\nNext steps:');
    console.log('  1. Make sure Ollama is running: ollama serve');
    console.log('  2. Run setup: synth setup');
    console.log('  3. Start TUI: synth');
  } else {
    console.log('✓ Synth is already configured');
  }
}

postInstall().catch(err => {
  console.error('Setup error:', err.message);
  process.exit(1);
});
