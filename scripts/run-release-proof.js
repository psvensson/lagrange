#!/usr/bin/env node

import {spawnSync} from 'node:child_process';

const STEPS = Object.freeze([
  Object.freeze({
    label: 'complete-ci-proof',
    command: 'npm',
    args: ['run', 'test:ci'],
  }),
  Object.freeze({
    label: 'release-hardening-tail',
    command: process.execPath,
    args: [
      'scripts/run-project-hardening-acceptance.js',
      '--manifest',
      'test/manifests/project-hardening-proof-release-tail-manifest.json',
    ],
  }),
]);

for (const step of STEPS) {
  console.log(`[release-proof] ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('[release-proof] complete');
