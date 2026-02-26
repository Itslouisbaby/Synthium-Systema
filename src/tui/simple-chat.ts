#!/usr/bin/env node
/**
 * Simple Chat - Plain Text Interface
 * Bypasses Matrix UI bugs. Just works.
 */

import { readFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import readline from 'readline';
import { OllamaProvider } from '../llm/llm-provider.js';
import { CoreMemories } from '../memory/core-memories.js';
import { RuntimeBridge } from './runtime-bridge.js';

interface Config {
  model?: string;
  ollamaUrl?: string;
  baseDir?: string;
}

function loadConfig(): Config | null {
  try {
    const configPath = join(process.cwd(), 'config.json');
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch {}
  return null;
}

async function simpleChat(): Promise<void> {
  const config = loadConfig();
  
  if (!config?.model) {
    console.log('Run: npm run setup');
    process.exit(1);
  }

  const bridge = new RuntimeBridge({
    baseDir: config.baseDir || '.synth',
    ollamaUrl: config.ollamaUrl || 'http://localhost:11434',
    model: config.model,
  });

  // Check Ollama
  const online = await bridge.checkOllama();
  if (!online) {
    console.log('Ollama not running. Start: ollama serve');
    process.exit(1);
  }

  await bridge.initialize();
  const needsNames = await bridge.needsNamingCeremony();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║ SYNTH // Simple Chat Mode ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Name ceremony
  if (needsNames) {
    rl.setPrompt('Synth: What would you like to call me?\n> ');
    rl.prompt();
    
    let synthName = '';
    let step = 'synth';

    rl.on('line', async (input) => {
      const trimmed = input.trim();
      
      if (step === 'synth') {
        synthName = trimmed || 'SYNDI';
        rl.setPrompt('Synth: And you are?\n> ');
        step = 'user';
        rl.prompt();
        return;
      }

      if (step === 'user') {
        const userName = trimmed || 'USER';
        await bridge.setNames(synthName, userName);
        console.log(`\nSynth: Hello ${userName}, I'm ${synthName}. Ready when you am.\n`);
        rl.setPrompt(`${userName}: `);
        rl.prompt();
        step = 'chat';
        return;
      }

      // Normal chat
      if (step === 'chat') {
        if (trimmed === 'exit') {
          console.log('\nSynth: Goodbye.\n');
          rl.close();
          return;
        }

        if (trimmed === 'help') {
          console.log('\nCommands: exit, help, learn\n');
          rl.prompt();
          return;
        }

        process.stdout.write('Synth: ');
        const response = await bridge.processInput(trimmed);
        console.log(response + '\n');
        
        // Log to file
        appendFileSync('chat.log', `You: ${trimmed}\nSynth: ${response}\n\n`);
        
        rl.prompt();
      }
    });
  } else {
    // Returning user
    const names = bridge.getNames();
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    
    console.log(`Synth: Good ${timeOfDay} ${names.user}, I'm ${names.synth}.\n`);
    rl.setPrompt(`${names.user}: `);
    rl.prompt();

    rl.on('line', async (input) => {
      const trimmed = input.trim();
      if (trimmed === 'exit') {
        console.log('\nSynth: Goodbye.\n');
        rl.close();
        return;
      }

      process.stdout.write('Synth: ');
      const response = await bridge.processInput(trimmed);
      console.log(response + '\n');
      
      appendFileSync('chat.log', `You: ${trimmed}\nSynth: ${response}\n\n`);
      
      rl.prompt();
    });
  }
}

simpleChat().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
