import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {candidateContentIdentity} from './candidate-content-identity.js';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const SNAPSHOT_PREFIX = 'lagrange-solver-candidate-';
const PROOF_MUTATED_CANDIDATE = 'PROOF_MUTATED_CANDIDATE';

function hash(value) {
  return crypto.createHash(HASH_ALGORITHM).update(value).digest(HASH_ENCODING);
}

function run(root, args, options = {}) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? TEXT_ENCODING,
    input: options.input,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
}

function assertRun(result, stage) {
  if (result.status === 0) return;
  throw new Error(`${stage}: ${String(result.stderr || result.error?.message || '').trim()}`);
}

function canonicalDelta(root, baseCommit, paths) {
  const args = [
    'diff', '--binary', '--full-index', '--no-ext-diff', baseCommit,
  ];
  if (paths.length > 0) args.push('--', ...paths);
  const result = run(root, args);
  assertRun(result, 'candidate workspace diff');
  return result.stdout;
}

function trackedDeltaIdentity(root) {
  const result = run(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD',
  ]);
  assertRun(result, 'candidate workspace tracked-state capture');
  return `sha256:${hash(result.stdout)}`;
}

function linkDirectoryIfPresent(root, snapshot, relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) return;
  const target = path.join(snapshot, relativePath);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  if (fs.existsSync(target)) return;
  fs.symlinkSync(source, target, 'dir');
}

function linkSharedRuntimeInputs(root, snapshot) {
  linkDirectoryIfPresent(root, snapshot, 'node_modules');
  const ambientLandingCache = path.join(root, 'solve/state/landing-preflight');
  fs.mkdirSync(ambientLandingCache, {recursive: true});
  const snapshotState = path.join(snapshot, 'solve/state');
  fs.mkdirSync(snapshotState, {recursive: true});
  const snapshotLandingCache = path.join(snapshotState, 'landing-preflight');
  if (!fs.existsSync(snapshotLandingCache)) {
    fs.symlinkSync(ambientLandingCache, snapshotLandingCache, 'dir');
  }
}

function removeWorktree(root, snapshot) {
  run(root, ['worktree', 'remove', '--force', snapshot]);
  fs.rmSync(snapshot, {recursive: true, force: true});
}

export function withCandidateWorkspace(root, projection, inspect) {
  const baseCommit = projection?.baseCommit;
  const paths = [...new Set(projection?.paths || [])].sort();
  if (!/^[0-9a-f]{40}$/u.test(String(baseCommit || ''))) {
    throw new Error('candidate workspace requires a full base commit SHA');
  }
  if (typeof inspect !== 'function') {
    throw new Error('candidate workspace requires an inspector callback');
  }
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), SNAPSHOT_PREFIX));
  fs.rmSync(snapshot, {recursive: true, force: true});
  const added = run(root, ['worktree', 'add', '--detach', snapshot, baseCommit]);
  assertRun(added, 'candidate workspace creation');
  try {
    const diff = canonicalDelta(root, baseCommit, paths);
    if (diff.length > 0) {
      const applied = run(snapshot,
        ['apply', '--binary', '--whitespace=nowarn', '-'],
        {input: diff});
      assertRun(applied, 'candidate workspace apply');
    }
    linkSharedRuntimeInputs(root, snapshot);
    const contentIdentity = candidateContentIdentity(snapshot, paths);
    if (!contentIdentity.ok) {
      throw new Error(`candidate workspace identity failed: ${contentIdentity.problem}`);
    }
    const trackedBefore = trackedDeltaIdentity(snapshot);
    const result = inspect(snapshot, {
      baseCommit,
      paths,
      contentIdentity,
    });
    const trackedAfter = trackedDeltaIdentity(snapshot);
    if (trackedAfter !== trackedBefore) {
      throw new Error(
        `${PROOF_MUTATED_CANDIDATE}: candidate proof changed tracked bytes`,
      );
    }
    const contentAfter = candidateContentIdentity(snapshot, paths);
    if (!contentAfter.ok || contentAfter.fingerprint !== contentIdentity.fingerprint) {
      throw new Error(
        `${PROOF_MUTATED_CANDIDATE}: candidate proof changed reviewed bytes`,
      );
    }
    return result;
  } finally {
    removeWorktree(root, snapshot);
  }
}

export {PROOF_MUTATED_CANDIDATE};
