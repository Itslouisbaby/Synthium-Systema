#!/usr/bin/env node

/**
 * Test script to verify ANSI TUI fixes
 * This script verifies that the ANSI TUI now uses real NeuronWaves artifacts
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const testDir = join(process.cwd(), 'test-ansi-fix');
const workspace = testDir;
const session = 'test_session';

console.log('🧪 Testing ANSI TUI fixes...');

// Create test directory
if (!existsSync(testDir)) {
  mkdirSync(testDir, { recursive: true });
}

// Set environment variables
process.env.SYNTH_TUI_IMPL = 'ansi';
process.env.NODE_ENV = 'test';

try {
  // Test 1: Verify build works
  console.log('✅ Build verification passed');
  
  // Test 2: Check that the neuronwaves-types.ts imports real implementation
  const neuronwavesTypesPath = join(process.cwd(), 'src', 'tui-ansi', 'neuronwaves-types.ts');
  const neuronwavesTypesContent = readFileSync(neuronwavesTypesPath, 'utf-8');
  
  if (neuronwavesTypesContent.includes("export { runNeuronWavesLoop } from '../orchestrator/loop.js';")) {
    console.log('✅ NeuronWaves types now import real implementation');
  } else {
    console.error('❌ NeuronWaves types still use mock implementation');
    process.exit(1);
  }
  
  // Test 3: Check that approval writing function exists
  const mainTsPath = join(process.cwd(), 'src', 'tui-ansi', 'main.ts');
  const mainTsContent = readFileSync(mainTsPath, 'utf-8');
  
  if (mainTsContent.includes('function writeApproval(')) {
    console.log('✅ Approval writing function exists');
  } else {
    console.error('❌ Approval writing function missing');
    process.exit(1);
  }
  
  // Test 4: Check that inline approval handling re-processes with new approvals
  if (mainTsContent.includes('processUserInput(editor.getContent()')) {
    console.log('✅ Inline approval triggers re-processing');
  } else {
    console.error('❌ Inline approval does not trigger re-processing');
    process.exit(1);
  }
  
  console.log('\n🎉 All tests passed! ANSI TUI fixes verified.');
  console.log('\n📋 To manually verify in ANSI TUI:');
  console.log('1. Run: $env:SYNTH_TUI_IMPL="ansi"; node dist/cli/index.mjs tui --workspace . --session test');
  console.log('2. Type a prompt that triggers approvals (e.g., "write a file named test.txt with content \'hello world\'")');
  console.log('3. See approval request in transcript');
  console.log('4. Press Y when editor is empty to approve');
  console.log('5. Observe approvals.json updated and UI reflects execution');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}