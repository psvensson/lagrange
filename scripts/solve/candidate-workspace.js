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
const MODE_EXECUTABLE = 0o755;
const MODE_REGULAR = 0o644;
const GIT_COMMAND = 'git';
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const EXECUTABLE_MODE_BITS = 0o111;
const MISSING_PATH_CODE = 'ENOENT';
const DIRECTORY_SYMLINK_TYPE = 'dir';
const NODE_MODULES_DIRECTORY = 'node_modules';
const WORKTREE_ADD_ARGUMENTS = Object.freeze(['worktree', 'add', '--detach']);
const WORKTREE_REMOVE_ARGUMENTS = Object.freeze([
  'worktree', 'remove', '--force',
]);
const HEAD_RESOLUTION_STAGE = 'candidate workspace HEAD resolution';
const HEAD_SHA_PROBLEM =
  'candidate workspace requires a full current HEAD SHA';
const TRACKED_STATE_CAPTURE_STAGE = 'candidate workspace tracked-state capture';
const INSPECTOR_REQUIRED_PROBLEM =
  'candidate workspace requires an inspector callback';
const WORKTREE_CREATION_STAGE = 'candidate workspace creation';

function hash(value) {
  return crypto.createHash(HASH_ALGORITHM).update(value).digest(HASH_ENCODING);
}

function run(root, args, options = {}) {
  return spawnSync(GIT_COMMAND, args, {
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

function currentHead(root) {
  const result = run(root, ['rev-parse', 'HEAD']);
  assertRun(result, HEAD_RESOLUTION_STAGE);
  const sha = String(result.stdout || '').trim();
  if (!COMMIT_SHA_PATTERN.test(sha)) {
    throw new Error(HEAD_SHA_PROBLEM);
  }
  return sha;
}

function trackedDeltaIdentity(root) {
  const result = run(root, [
    'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD',
  ]);
  assertRun(result, TRACKED_STATE_CAPTURE_STAGE);
  return `sha256:${hash(result.stdout)}`;
}

function removePath(target) {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      fs.rmSync(target, {recursive: true, force: true});
    } else {
      fs.rmSync(target, {force: true});
    }
  } catch (error) {
    if (error?.code !== MISSING_PATH_CODE) throw error;
  }
}

function overlayCandidatePath(root, snapshot, relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(snapshot, relativePath);
  let stat;
  try {
    stat = fs.lstatSync(source);
  } catch (error) {
    if (error?.code !== MISSING_PATH_CODE) throw error;
    removePath(target);
    return;
  }
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    throw new Error(`candidate workspace path names a directory: ${relativePath}`);
  }
  removePath(target);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  if (stat.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(source), target);
    return;
  }
  fs.copyFileSync(source, target);
  fs.chmodSync(target, (stat.mode & EXECUTABLE_MODE_BITS) !== 0 ? MODE_EXECUTABLE : MODE_REGULAR);
}

function overlayCandidatePaths(root, snapshot, paths) {
  for (const relativePath of paths) {
    overlayCandidatePath(root, snapshot, relativePath);
  }
}

function linkDirectoryIfPresent(root, snapshot, relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) return;
  const target = path.join(snapshot, relativePath);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  if (fs.existsSync(target)) return;
  fs.symlinkSync(source, target, DIRECTORY_SYMLINK_TYPE);
}

function linkSharedRuntimeInputs(root, snapshot) {
  linkDirectoryIfPresent(root, snapshot, NODE_MODULES_DIRECTORY);
  const ambientLandingCache = path.join(root, 'solve/state/landing-preflight');
  fs.mkdirSync(ambientLandingCache, {recursive: true});
  const snapshotState = path.join(snapshot, 'solve/state');
  fs.mkdirSync(snapshotState, {recursive: true});
  const snapshotLandingCache = path.join(snapshotState, 'landing-preflight');
  if (!fs.existsSync(snapshotLandingCache)) {
    fs.symlinkSync(
      ambientLandingCache, snapshotLandingCache, DIRECTORY_SYMLINK_TYPE,
    );
  }
}

function removeWorktree(root, snapshot) {
  run(root, [...WORKTREE_REMOVE_ARGUMENTS, snapshot]);
  fs.rmSync(snapshot, {recursive: true, force: true});
}

export function withCandidateWorkspace(root, projection, inspect) {
  const baseCommit = projection?.baseCommit || null;
  const paths = [...new Set(projection?.paths || [])].sort();
  if (typeof inspect !== 'function') {
    throw new Error(INSPECTOR_REQUIRED_PROBLEM);
  }
  const headCommit = currentHead(root);
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), SNAPSHOT_PREFIX));
  fs.rmSync(snapshot, {recursive: true, force: true});
  const added = run(root, [...WORKTREE_ADD_ARGUMENTS, snapshot, headCommit]);
  assertRun(added, WORKTREE_CREATION_STAGE);
  try {
    // The proof policy and dependency context come from current committed HEAD.
    // Only the exact reviewed candidate paths are overlaid from the ambient
    // worktree. Foreign dirty/untracked paths therefore cannot affect proof,
    // while newly committed checkers/contracts cannot be hidden by an old
    // source-epoch base.
    overlayCandidatePaths(root, snapshot, paths);
    linkSharedRuntimeInputs(root, snapshot);
    const contentIdentity = candidateContentIdentity(snapshot, paths);
    if (!contentIdentity.ok) {
      throw new Error(`candidate workspace identity failed: ${contentIdentity.problem}`);
    }
    const trackedBefore = trackedDeltaIdentity(snapshot);
    const result = inspect(snapshot, {
      baseCommit,
      proofHeadCommit: headCommit,
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
