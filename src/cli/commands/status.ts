/**
 * Status Command
 * Shows system health and component status
 */

import { OllamaProvider } from '../../llm/llm-provider.js';
import { CoreMemories } from '../../memory/core-memories.js';
import { loadConfig } from '../setup.js';

export async function runStatus(): Promise<void> {
  const config = await loadConfig();
  const baseDir = config?.baseDir || '.synth';

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    SYNTH SYSTEM STATUS                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Check Ollama
  process.stdout.write('Checking Ollama... ');
  const ollama = new OllamaProvider({
    endpoint: config?.ollamaUrl || 'http://localhost:11434',
    model: config?.model || 'llama3.2',
  });

  try {
    const healthy = await ollama.healthCheck();
    if (healthy) {
      console.log('✓ Online');

      // Try to get available models
      try {
        const models = await listOllamaModels(config?.ollamaUrl || 'http://localhost:11434');
        console.log(`  Models: ${models.slice(0, 5).join(', ')}${models.length > 5 ? '...' : ''}`);
      } catch {
        // Ignore
      }
    } else {
      console.log('✗ Unhealthy response');
    }
  } catch {
    console.log('✗ Offline');
    console.log('  Run: ollama serve');
  }

  // Check memory system
  console.log('\nChecking CoreMemories...');
  try {
    const memories = new CoreMemories({ baseDir: `${baseDir}/core-memories` });
    await memories.initialize();
    const stats = await memories.getStats();

    console.log(`✓ Loaded`);
    console.log(`  Flash:   ${stats.flashCount} entries`);
    console.log(`  Warm:    ${stats.warmCount} entries`);
    console.log(`  Recent:  ${stats.recentCount} entries`);
    console.log(`  Archive: ${stats.archiveCount} entries`);
    console.log(`  Core:    ${stats.coreCount} entries`);
    console.log(`  Total:   ${stats.flashCount + stats.warmCount + stats.recentCount + stats.archiveCount + stats.coreCount} entries`);
  } catch (err) {
    console.log(`✗ Error: ${err instanceof Error ? err.message : 'Unknown'}`);
  }

  // Configuration
  console.log('\nConfiguration:');
  if (config) {
    console.log(`  Synth Name: ${config.synthName}`);
    console.log(`  User Name:  ${config.userName}`);
    console.log(`  Model:      ${config.model}`);
    console.log(`  Ollama URL: ${config.ollamaUrl}`);
    console.log(`  Base Dir:   ${config.baseDir}`);
  } else {
    console.log('  No configuration found. Run: synth setup');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
}

async function listOllamaModels(url: string): Promise<string[]> {
  try {
    const response = await fetch(`${url}/api/tags`);
    const data = await response.json() as { models?: Array<{ name: string }> };
    return data.models?.map(m => m.name) || [];
  } catch {
    return [];
  }
}

