#!/usr/bin/env node

import {spawnSync} from 'node:child_process';

import {OUTCOME, PROOF, resolveProof} from './proof-authority.js';

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

function gitOutput(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'git failed').trim());
  }
  return result.stdout.trim();
}

const headSha = gitOutput(['rev-parse', 'HEAD']);
const existing = resolveProof({
  proofId: PROOF.RELEASE_FULL,
  sha: headSha,
  remote: process.env.LAGRANGE_PROOF_REMOTE || 'origin',
});

if (existing.outcome === OUTCOME.PROVEN) {
  console.log(
    `[release-proof] reuse ${PROOF.RELEASE_FULL} for ${headSha} ` +
    `(${existing.objectSha})`,
  );
  process.exit(0);
}

if (existing.outcome === OUTCOME.UNAVAILABLE) {
  console.log(
    `[release-proof] durable receipt unavailable (${existing.because}); ` +
    'running proof rather than claiming reuse',
  );
} else {
  console.log(`[release-proof] no durable receipt for ${headSha}; running once`);
}

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

console.log(`[release-proof] complete ${PROOF.RELEASE_FULL} for ${headSha}`);
console.log(
  `[release-proof] persist with: node scripts/proof-authority.js record ` +
  `${PROOF.RELEASE_FULL} ${headSha}`,
);
