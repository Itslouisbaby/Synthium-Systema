/**
 * First-Time Setup Wizard
 * Synth CLI - Setup Command
 *
 * Names are configured during the TUI Naming Ceremony, not here.
 * Data directory and Ollama URL are auto-configured silently.
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

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
  firstRun: boolean;
}

const DEFAULT_CONFIG: SetupConfig = {
  synthName: 'SYNTH',
  userName: 'USER',
  model: 'llama3.2',
  ollamaUrl: 'http://localhost:11434',
  baseDir: '.synth',
  persona: 'cyberpunk',
  enableAutonomy: true,
  enableLearning: true,
  glitchLevel: 'immersive',
  firstRun: true,
};

export async function runSetup(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Synth - First-Time Configuration                   ║
║           Synthetic Digital Human Setup                      ║
╚══════════════════════════════════════════════════════════════╝
`);

  const config: SetupConfig = { ...DEFAULT_CONFIG };

  // Step 1: Check if Ollama is running (silently auto-detect URL)
  console.log('Checking Ollama connection...');
  const ollamaHealthy = await checkOllama(config.ollamaUrl);

  if (!ollamaHealthy) {
    console.log(`
⚠️  Ollama is not running!

Please start Ollama first:
  1. Open a new terminal
  2. Run: ollama serve

If you don't have Ollama installed:
  Download from https://ollama.com/download

Then pull a model:
  ollama pull llama3.2
`);
    rl.close();
    process.exit(1);
  }

  console.log('✓ Ollama is running\n');

  // Step 2: Model selection - fetch available models & let user pick by number
  console.log('Detecting available models...');
  let availableModels: string[] = [];
  try {
    availableModels = await listOllamaModels(config.ollamaUrl);
  } catch {
    // fallback
  }

  if (availableModels.length > 0) {
    console.log('');
    availableModels.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));

    const modelChoice = await ask(`\nSelect model number [1]: `);
    const index = parseInt(modelChoice || '1', 10) - 1;

    if (index >= 0 && index < availableModels.length) {
      config.model = availableModels[index];
    } else {
      config.model = availableModels[0];
    }
  } else {
    console.log('  (Could not fetch models - using default: llama3.2)');
  }

  console.log(`✓ Using model: ${config.model}\n`);

  // Step 3: Persona Selection
  console.log('Synth Persona:');
  console.log('  1. Professional (Strict, concise, helpful)');
  console.log('  2. Cyberpunk    (Sci-fi terminal slang, immersive)');
  console.log('  3. Companion    (Friendly, empathetic, conversational)');
  console.log('  4. Custom       (Write your own system rules)');
  const personaChoice = await ask(`Choose persona (1-4) [2]: `);

  switch (personaChoice.trim()) {
    case '1':
      config.persona = 'professional';
      break;
    case '3':
      config.persona = 'companion';
      break;
    case '4':
      config.persona = 'custom';
      config.customPersonaPrompt = await ask('\nType your custom system prompt instructions: ');
      break;
    case '2':
    default:
      config.persona = 'cyberpunk';
      break;
  }

  // Step 4: Theme Config
  console.log('\nUI Theme:');
  console.log('  1. Immersive (Matrix boot, glitching headers, rain effects)');
  console.log('  2. Clean     (No visual effects, distraction-free)');
  const themeChoice = await ask(`Choose theme (1-2) [1]: `);
  config.glitchLevel = themeChoice.trim() === '2' ? 'clean' : 'immersive';

  // Step 5: Engine settings
  console.log('\nEngine Settings:');
  const doAutonomy = await ask('Enable Background Autonomy? (AI thinks while idle) [Y/n]: ');
  config.enableAutonomy = doAutonomy.toLowerCase() !== 'n';

  const doLearning = await ask('Enable Continuous Learning? (Memory compaction & adaptation) [Y/n]: ');
  config.enableLearning = doLearning.toLowerCase() !== 'n';

  // Auto-create data directories (no user prompt needed)
  await mkdir(config.baseDir, { recursive: true });
  await mkdir(join(config.baseDir, 'core-memories'), { recursive: true });
  await mkdir(join(config.baseDir, 'vectors'), { recursive: true });
  await mkdir(join(config.baseDir, 'goals'), { recursive: true });

  // Save configuration to the project root config.json (where tui.ts reads it)
  const projectConfigPath = join(process.cwd(), 'config.json');
  await writeFile(projectConfigPath, JSON.stringify(config, null, 2));

  // Also save inside .synth for redundancy
  await saveConfig(config);

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Setup Complete!                           ║
╚══════════════════════════════════════════════════════════════╝

Configuration saved. Your names will be set during the
Naming Ceremony when you first launch the TUI.

Next steps:
  synth tui          # Start the TUI
  synth status       # Check system status
  synth help         # Show all commands
`);

  rl.close();
}

async function checkOllama(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

async function listOllamaModels(url: string): Promise<string[]> {
  try {
    const response = await fetch(`${url}/api/tags`);
    const data = await response.json() as { models?: Array<{ name: string }> };
    return data.models?.map(m => m.name) || [];
  } catch {
    return ['llama3.2', 'llama3.1', 'mistral'];
  }
}

async function saveConfig(config: SetupConfig): Promise<void> {
  const configPath = join(config.baseDir, 'config.json');
  await mkdir(config.baseDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

export async function loadConfig(baseDir: string = '.synth'): Promise<SetupConfig | null> {
  try {
    const configPath = join(baseDir, 'config.json');
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as SetupConfig;
  } catch {
    return null;
  }
}

export { SetupConfig };
