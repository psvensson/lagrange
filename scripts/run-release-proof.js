#!/usr/bin/env node

import {spawnSync} from 'node:child_process';

import {spawnGit} from './checks/git-invocation.js';
import {OUTCOME, PROOF, resolveProof} from './proof-authority.js';

const GIT_FAILED_FALLBACK = 'git failed';
const FALLBACK_TO_RUNNING = 'running proof rather than claiming reuse';
const PERSIST_HINT_PREFIX =
  '[release-proof] persist with: node scripts/proof-authority.js record ';

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

const STEPS_WITH_PROVEN_CORPUS = Object.freeze([
  Object.freeze({
    label: 'complete-ci-static-proof',
    command: 'npm',
    args: ['run', 'test:static'],
  }),
  Object.freeze({
    label: 'complete-ci-model-contracts',
    command: 'npm',
    args: ['run', 'model:contracts'],
  }),
  Object.freeze({
    label: 'complete-ci-chart-endpoint-sync',
    command: 'npm',
    args: ['run', 'test:chart:endpoint-sync'],
  }),
  STEPS[1],
]);

function gitOutput(args) {
  const result = spawnGit(args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || GIT_FAILED_FALLBACK).trim());
  }
  return result.stdout.trim();
}

const remote = process.env.LAGRANGE_PROOF_REMOTE || 'origin';
const headSha = gitOutput(['rev-parse', 'HEAD']);
const existing = resolveProof({
  proofId: PROOF.RELEASE_FULL,
  sha: headSha,
  remote,
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
    FALLBACK_TO_RUNNING,
  );
} else {
  console.log(`[release-proof] no durable receipt for ${headSha}; running once`);
}

const corpusProof = resolveProof({
  proofId: PROOF.CORPUS_FULL,
  sha: headSha,
  remote,
});
const stepsToRun = corpusProof.outcome === OUTCOME.PROVEN ?
  STEPS_WITH_PROVEN_CORPUS :
  STEPS;
if (corpusProof.outcome === OUTCOME.PROVEN) {
  console.log(
    `[release-proof] reuse ${PROOF.CORPUS_FULL} for ${headSha} ` +
    `(${corpusProof.objectSha})`,
  );
}

for (const step of stepsToRun) {
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
console.log(`${PERSIST_HINT_PREFIX}${PROOF.RELEASE_FULL} ${headSha}`);
