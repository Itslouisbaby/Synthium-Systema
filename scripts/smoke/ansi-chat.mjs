#!/usr/bin/env node

/**
 * Smoke Test Script for Phase 5 Implementation
 * Tests the integration of the ANSI TUI with the NeuronWaves loop
 */

import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Create a temporary workspace for testing
const testWorkspace = join(process.cwd(), 'test-workspace');
if (!existsSync(testWorkspace)) {
  mkdirSync(testWorkspace, { recursive: true });
}

// Create a simple test file for the read tool to access
const testFilePath = join(testWorkspace, 'test-file.txt');
writeFileSync(testFilePath, 'This is a test file for the smoke test.');

console.log('🧪 Starting Phase 5 Smoke Test...');
console.log('📁 Test workspace:', testWorkspace);

// Test 1: Verify the TUI starts without errors
console.log('\n1️⃣ Testing TUI startup...');

const tuiProcess = spawn(
  'node',
  ['-e', `
    import { startANSITUI } from './dist/tui-ansi/main.js';
    const tui = startANSITUI({
      session: 'smoke-test',
      title: 'Smoke Test TUI',
      workspace: '${testWorkspace}'
    });
    
    // Wait 2 seconds then stop
    setTimeout(() => {
      tui.stop();
      process.exit(0);
    }, 2000);
  `],
  {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, NODE_OPTIONS: '--no-warnings' }
  }
);

let startupSuccess = false;
let hasErrors = false;

tuiProcess.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('Synthium Systema')) {
    startupSuccess = true;
  }
  process.stdout.write(output);
});

tuiProcess.stderr.on('data', (data) => {
  const error = data.toString();
  if (error.includes('Error') || error.includes('ERR_')) {
    hasErrors = true;
    console.error('STDERR:', error);
  }
});

tuiProcess.on('close', (code) => {
  console.log(`\nTUI process exited with code ${code}`);
  
  if (startupSuccess && !hasErrors && code === 0) {
    console.log('✅ Test 1 PASSED: TUI started successfully');
  } else {
    console.log('❌ Test 1 FAILED: TUI startup issues detected');
  }
  
  // Test 2: Verify NeuronWaves loop integration
  console.log('\n2️⃣ Testing NeuronWaves loop integration...');
  
  const loopTestProcess = spawn(
    'node',
    ['-e', `
      import { runNeuronWavesLoop } from './dist/orchestrator/loop.js';
      
      runNeuronWavesLoop(
        {
          content: 'Test the system',
          sessionKey: 'smoke-test-loop'
        },
        {
          artifactBaseDir: '${testWorkspace}/.synth/neuronwaves',
          autonomyLevel: 1
        }
      )
      .then(result => {
        console.log('Loop execution result:', result.evaluation.result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Loop execution error:', error.message);
        process.exit(1);
      });
    `],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--no-warnings' }
    }
  );
  
  loopTestProcess.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Test 2 PASSED: NeuronWaves loop integration working');
    } else {
      console.log('❌ Test 2 FAILED: NeuronWaves loop integration failed');
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up test workspace...');
    
    // Summary
    console.log('\n📋 Smoke Test Summary:');
    console.log('If both tests passed, Phase 5 implementation is working correctly.');
    console.log('Note: Full end-to-end integration requires building the project first.');
  });
});