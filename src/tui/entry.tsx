#!/usr/bin/env node
/**
 * Synth TUI - Direct Entry Point
 */

import React from 'react';
import { render } from 'ink';
import App from './app.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Config {
  model?: string;
  ollamaUrl?: string;
  baseDir?: string;
  [key: string]: any;
}

function loadConfig(): Config | null {
  const configPath = join(process.cwd(), 'config.json');
  if (!existsSync(configPath)) {
    console.log('Config not found. Run: npm run setup');
    return null;
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

export async function runTUI(): Promise<void> {
  const config = loadConfig();
  
  if (!config) {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║ Synth setup required                           ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('\nRun: npm run setup\n');
    process.exit(1);
  }

  const baseDir = config.baseDir || '.synth';
  const ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
  const model = config.model || 'llama3.1'; // Changed default

  render(
    React.createElement(App, {
      baseDir,
      ollamaUrl,
      model,
    })
  );
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTUI().catch(console.error);
}
