/**
 * Config Command
 * Manages Synth configuration
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { loadConfig, SetupConfig } from '../setup.js';

export async function runConfig(action?: string, args: string[] = []): Promise<void> {
  const config = await loadConfig();
  const baseDir = config?.baseDir || '.synth';
  const configPath = join(baseDir, 'config.json');

  switch (action) {
    case 'path':
      console.log(`Config path: ${configPath}`);
      break;

    case 'get':
      const key = args[0];
      if (!key) {
        console.log('Usage: synth config get <key>');
        return;
      }
      await getConfigValue(config, key);
      break;

    case 'set':
      const setKey = args[0];
      const value = args.slice(1).join(' ');
      if (!setKey || !value) {
        console.log('Usage: synth config set <key> <value>');
        return;
      }
      await setConfigValue(baseDir, setKey, value);
      break;

    case 'show':
    default:
      await showConfig(config);
      break;
  }
}

async function showConfig(config: SetupConfig | null): Promise<void> {
  if (!config) {
    console.log('No configuration found. Run: synth setup');
    return;
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    SYNTH CONFIGURATION                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`synthName:    ${config.synthName}`);
  console.log(`userName:     ${config.userName}`);
  console.log(`model:        ${config.model}`);
  console.log(`ollamaUrl:    ${config.ollamaUrl}`);
  console.log(`baseDir:      ${config.baseDir}`);
  console.log(`firstRun:     ${config.firstRun}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
}

async function getConfigValue(config: SetupConfig | null, key: string): Promise<void> {
  if (!config) {
    console.log('No configuration found. Run: synth setup');
    return;
  }

  const value = config[key as keyof SetupConfig];

  if (value === undefined) {
    console.log(`Unknown key: ${key}`);
    console.log('Available keys: synthName, userName, model, ollamaUrl, baseDir, firstRun');
    return;
  }

  console.log(`${key}: ${value}`);
}

async function setConfigValue(baseDir: string, key: string, value: string): Promise<void> {
  const configPath = join(baseDir, 'config.json');

  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as SetupConfig;

    // Validate key
    const validKeys = ['synthName', 'userName', 'model', 'ollamaUrl', 'baseDir'];
    if (!validKeys.includes(key)) {
      console.log(`Unknown key: ${key}`);
      console.log(`Valid keys: ${validKeys.join(', ')}`);
      return;
    }

    // Update config
    (config as unknown as Record<string, string | boolean>)[key] = value;

    // Save
    await writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`Updated ${key} = ${value}`);
  } catch (err) {
    console.log(`Error updating config: ${err instanceof Error ? err.message : 'Unknown'}`);
  }
}
