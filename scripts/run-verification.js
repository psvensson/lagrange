#!/usr/bin/env node

// One executable boundary for affected, pre-push, and release verification.
// A valid PASS receipt reuses proof for the same content key; failures and
// partial runs are never written.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  buildVerificationPlan,
  VERIFICATION_PROFILES,
} from './checks/verification-policy.js';
import {
  readPassingVerificationReceipt,
  semanticProjection,
  verificationInputs,
  writePassingVerificationReceipt,
} from './checks/verification-receipt.js';
import {runClassifiedTestFiles} from './run-classified-test-files.js';
import {createSnapshotWorktree, removeWorktree} from './session-worktree.js';

const PROFILE_FLAG = '--profile';
const BASE_FLAG = '--base';
const BOUNDARY_FLAG = '--boundary';
const REF_FLAG = '--ref';
const CURRENT_BOUNDARY = 'current';
const INDEX_BOUNDARY = 'index';
const REF_BOUNDARY = 'ref';
const BOUNDARIES = Object.freeze([
  CURRENT_BOUNDARY,
  INDEX_BOUNDARY,
  REF_BOUNDARY,
]);
const ZERO_SHA_PATTERN = /^0+$/u;
const INJECTED_DIRECTORIES = Object.freeze(['data']);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = {profile: null, base: null, boundary: CURRENT_BOUNDARY, ref: null};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === PROFILE_FLAG) options.profile = value;
    else if (token === BASE_FLAG) options.base = value;
    else if (token === BOUNDARY_FLAG) options.boundary = value;
    else if (token === REF_FLAG) options.ref = value;
    else throw new Error(`verification: unknown argument ${token}`);
    if (!value || value.startsWith('--')) {
      throw new Error(`verification: ${token} requires a value`);
    }
    index += 1;
  }
  if (!VERIFICATION_PROFILES.includes(options.profile)) {
    throw new Error(`verification: invalid profile ${options.profile}`);
  }
  if (!BOUNDARIES.includes(options.boundary)) {
    throw new Error(`verification: invalid boundary ${options.boundary}`);
  }
  if (options.boundary === REF_BOUNDARY && !options.ref) {
    throw new Error('verification: ref boundary requires --ref');
  }
  return options;
}

function git(cwd, args) {
  return execFileSync('git', args, {cwd, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

function linkIgnoredInputs(sourceRoot, worktree) {
  for (const directory of INJECTED_DIRECTORIES) {
    const source = path.join(sourceRoot, directory);
    const destination = path.join(worktree, directory);
    if (!fs.existsSync(source) || fs.existsSync(destination)) continue;
    fs.symlinkSync(source, destination, 'dir');
  }
}

export function materializeVerificationBoundary(sourceRoot, options) {
  const worktree = createSnapshotWorktree(sourceRoot);
  try {
    if (options.boundary === REF_BOUNDARY) {
      git(worktree, ['reset', '--hard', '--quiet', options.ref]);
    } else {
      const indexTree = git(sourceRoot, ['write-tree']);
      git(worktree, ['read-tree', '--reset', '-u', indexTree]);
    }
    git(worktree, ['clean', '-fdq', '-e', 'node_modules']);
    linkIgnoredInputs(sourceRoot, worktree);
    return worktree;
  } catch (error) {
    removeWorktree(sourceRoot, worktree);
    throw error;
  }
}

function runInMaterializedBoundary(options) {
  const worktree = materializeVerificationBoundary(root, options);
  try {
    const args = ['scripts/run-verification.js', PROFILE_FLAG, options.profile,
      BOUNDARY_FLAG, CURRENT_BOUNDARY];
    if (options.base && !ZERO_SHA_PATTERN.test(options.base)) {
      args.push(BASE_FLAG, options.base);
    }
    const result = spawnSync(process.execPath, args, {
      cwd: worktree,
      env: process.env,
      stdio: 'inherit',
    });
    return result.status ?? 1;
  } finally {
    removeWorktree(root, worktree);
  }
}

function runCommand(command, cwd) {
  const started = Date.now();
  const result = spawnSync(command.executable, command.argv,
    {cwd, env: process.env, stdio: 'inherit'});
  return {id: command.id, elapsedMs: Date.now() - started,
    exitCode: result.status ?? 1};
}

function executeCurrent(options) {
  const plan = buildVerificationPlan({root, profile: options.profile,
    base: options.base});
  const inputs = verificationInputs(root, plan);
  const passing = readPassingVerificationReceipt(root, inputs);
  if (passing) {
    process.stdout.write(
      `verification: reused PASS ${plan.profile} ${inputs.key}\n`);
    return 0;
  }

  const started = Date.now();
  const leaves = [];
  for (const command of plan.commands) {
    const leaf = runCommand(command, root);
    leaves.push(leaf);
    if (leaf.exitCode !== 0) return leaf.exitCode;
  }
  if (plan.tests.length > 0) {
    const testStarted = Date.now();
    const testStatus = runClassifiedTestFiles(plan.tests, {root});
    leaves.push({id: 'classified-tests', elapsedMs: Date.now() - testStarted,
      exitCode: testStatus});
    if (testStatus !== 0) return testStatus;
  }
  const after = semanticProjection(root);
  if (after.digest !== inputs.semanticDigest) {
    throw new Error('verification mutated semantic repository inputs; refusing receipt');
  }
  const result = writePassingVerificationReceipt(root, inputs, {
    selection: plan.selection,
    changedPaths: plan.changedPaths,
    selectedCount: plan.tests.length,
    runCount: plan.tests.length,
    deduplicatedCount: plan.counts ?
      plan.counts.affected + plan.counts.fast + plan.counts.focused -
        plan.tests.length : 0,
    leaves,
    elapsedMs: Date.now() - started,
  });
  process.stdout.write(
    `verification: PASS ${plan.profile} ${inputs.key}\n` +
    `receipt: ${result.receiptPath}\n`);
  return 0;
}

export function runVerification(argv) {
  const options = parseArgs(argv);
  return options.boundary === CURRENT_BOUNDARY ?
    executeCurrent(options) : runInMaterializedBoundary(options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runVerification(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`verification: REFUSED: ${error.message}\n`);
    process.exitCode = 1;
  }
}
