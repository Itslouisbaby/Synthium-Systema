#!/usr/bin/env node
/**
 * Synth Auto-Setup
 * 
 * Zero-friction first-time configuration.
 * Auto-detects everything, only asks for names.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import readline from 'readline';

interface SetupConfig {
  synthName: string;
  userName: string;
  model: string;
  ollamaUrl: string;
  baseDir: string;
  persona: 'professional' | 'cyberpunk' | 'companion' | 'custom';
  customPersonaPrompt?: string;
  enableAutonomy: boolean;
  enableLearning: boolean;
  glitchLevel: 'clean' | 'immersive';
}

// Matrix theme colors for console (works in most terminals)
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

async function checkOllama(): Promise<{ running: boolean; models: string[] }> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) return { running: false, models: [] };

    const data = await response.json() as { models?: Array<{ name: string; size?: number }> };
    const models = (data.models || [])
      .filter((m: { name: string }) => !m.name.includes(':cloud')) // Filter cloud-only models
      .map((m: { name: string }) => m.name);

    return { running: true, models };
  } catch {
    return { running: false, models: [] };
  }
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function autoSetup(): Promise<void> {
  console.log(`${colors.green}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                                                              ║');
  console.log('║           ▓▓▓ SYNTH AGI SETUP ▓▓▓                            ║');
  console.log('║                                                              ║');
  console.log('║           Synthetic Digital Human                            ║');
  console.log('║                                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}\n`);

  // Step 1: Check Ollama (auto-detect, no asking)
  console.log(`${colors.dim}Detecting Ollama...${colors.reset}`);
  const ollama = await checkOllama();

  if (!ollama.running) {
    console.log(`${colors.brightGreen}⚠ Ollama not detected${colors.reset}`);
    console.log('\nPlease install Ollama first:');
    console.log('  https://ollama.com/download');
    console.log('\nThen run: ollama pull llama3.1');
    process.exit(1);
  }

  console.log(`${colors.brightGreen}✓ Ollama detected${colors.reset}\n`);

  // Step 2: Auto-select best model (or ask if multiple good ones)
  let selectedModel = 'llama3.1';

  // Prioritize: smaller models first (faster download, less VRAM)
  const preferredModels = [
    'llama3.1:8b',
    'llama3.1',
    'llama3.2',
    'mistral',
    'nemotron-3-nano:30b',
  ];

  const availableGoodModels = ollama.models.filter(m =>
    preferredModels.some(pref => m.includes(pref))
  );

  if (availableGoodModels.length === 0) {
    // You have models but none are standard chat models
    console.log('Available models:');
    ollama.models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));

    const choice = await ask('\nSelect model number [1]: ') || '1';
    const index = parseInt(choice) - 1;
    selectedModel = ollama.models[index] || ollama.models[0];
  } else if (availableGoodModels.length === 1) {
    selectedModel = availableGoodModels[0];
    console.log(`${colors.dim}Auto-selected model: ${selectedModel}${colors.reset}`);
  } else {
    // Multiple good options - show top 3
    console.log('Recommended models:');
    availableGoodModels.slice(0, 3).forEach((m, i) => {
      const size = m.includes('8b') || m.includes('8B') ? '4GB' :
        m.includes('30b') ? '24GB' : 'varies';
      console.log(`  ${i + 1}. ${m} (${size})`);
    });

    const choice = await ask(`\nSelect [1-${Math.min(3, availableGoodModels.length)}] or press Enter for ${availableGoodModels[0]}: `) || '1';
    const index = parseInt(choice) - 1;
    selectedModel = availableGoodModels[index] || availableGoodModels[0];
  }

  console.log(`${colors.brightGreen}✓ Using: ${selectedModel}${colors.reset}\n`);

  console.log(`${colors.green}╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║                     SETUP COMPLETE                           ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);
  console.log(`Next: The name ceremony will happen when you start the TUI.\n`);

  // Step 4: Auto-configure everything else (names set in TUI ceremony)
  const config: Omit<SetupConfig, 'synthName' | 'userName'> = {
    model: selectedModel,
    ollamaUrl: 'http://localhost:11434',
    baseDir: join(process.cwd(), '.synth'),
    persona: 'cyberpunk',
    enableAutonomy: true,
    enableLearning: true,
    glitchLevel: 'immersive',
  };

  // Create directories
  mkdirSync(config.baseDir, { recursive: true });
  mkdirSync(join(config.baseDir, 'core-memories'), { recursive: true });
  mkdirSync(join(config.baseDir, 'hot'), { recursive: true });

  // Save config
  writeFileSync(
    join(process.cwd(), 'config.json'),
    JSON.stringify(config, null, 2)
  );

  // Save initial user profile (names will be set in TUI ceremony)
  const profile = {
    version: '2.4.0',
    initializationDate: new Date().toISOString(),
    isFirstRunComplete: false, // Will be true after name ceremony
  };

  writeFileSync(
    join(config.baseDir, 'core-profile.json'),
    JSON.stringify(profile, null, 2)
  );

  console.log(`${colors.dim}Config saved to: ${join(process.cwd(), 'config.json')}${colors.reset}`);
  console.log(`${colors.dim}Data directory: ${config.baseDir}${colors.reset}\n`);

  console.log(`${colors.brightGreen}Next steps:${colors.reset}`);
  console.log(`  synth tui         ${colors.dim}# Start the TUI${colors.reset}`);
  console.log(`  synth status      ${colors.dim}# Check system status${colors.reset}`);
  console.log(`  synth help        ${colors.dim}# Show all commands${colors.reset}\n`);
}

autoSetup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
