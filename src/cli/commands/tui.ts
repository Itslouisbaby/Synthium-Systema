/** * TUI Command * Opens the interactive Terminal User Interface */

import React from 'react';
import { render } from 'ink';
import App from '../../tui/app.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface Config {
  model?: string;
  ollamaUrl?: string;
  baseDir?: string;
  [key: string]: any;
}

function loadConfig(): Config | null {
  // Check project root first, then .synth directory
  const locations = [
    join(process.cwd(), 'config.json'),
    join(process.cwd(), '.synth', 'config.json'),
  ];

  for (const configPath of locations) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
      } catch {
        continue;
      }
    }
  }
  return null;
}

export async function runTUI(): Promise<void> {
  // Actually read config.json
  const config = loadConfig();

  if (!config) {
    console.error('Config not found. Run: npm run setup');
    process.exit(1);
  }

  const baseDir = config.baseDir || '.synth';
  const ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
  const model = config.model; // NO DEFAULT - must come from config

  if (!model) {
    console.error('No model configured. Run: npm run setup');
    process.exit(1);
  }

  render(
    React.createElement(App, {
      baseDir,
      ollamaUrl,
      model,
      persona: config.persona || 'cyberpunk',
      customPersonaPrompt: config.customPersonaPrompt,
      enableAutonomy: config.enableAutonomy !== false,
      enableLearning: config.enableLearning !== false,
      glitchLevel: config.glitchLevel || 'immersive'
    })
  );
}
