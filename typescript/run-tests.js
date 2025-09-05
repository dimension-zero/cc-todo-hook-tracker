#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('Starting Todo Manager Test Suite...\n');

// Run Jest with the test configuration
const jest = spawn('npx', ['jest', '--config', 'jest.config.js', '--verbose'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

jest.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ All tests passed successfully!');
  } else {
    console.log(`\n❌ Tests failed with exit code ${code}`);
  }
  process.exit(code);
});

jest.on('error', (err) => {
  console.error('Failed to start test runner:', err);
  process.exit(1);
});