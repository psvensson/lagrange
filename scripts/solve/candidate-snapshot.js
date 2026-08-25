// Single owner for materializing an exact landing candidate. Review inputs,
// generated dependencies, and proof selection must all observe these bytes,
// never the ambient shared worktree.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const GIT = 'git';
const TEXT_ENCODING = 'utf8';
const MAX_BUFFER = 64 * 1024 * 1024;
const SNAPSHOT_PREFIX = 'solve-review-candidate-';
const NODE_MODULES = 'node_modules';
const DIRECTORY_SYMLINK_TYPE = 'dir';
const SNAPSHOT_CREATION_STAGE = 'creation';
const SNAPSHOT_MATERIALIZATION_STAGE = 'materialization';
const WORKTREE_ADD_ARGUMENTS = Object.freeze(['worktree', 'add', '--detach']);
const WORKTREE_REMOVE_ARGUMENTS = Object.freeze([
  'worktree', 'remove', '--force',
]);
const APPLY_ARGUMENTS = Object.freeze(['apply', '--binary', '-']);

function run(root, command, args, input) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: TEXT_ENCODING,
    input,
    maxBuffer: MAX_BUFFER,
  });
}

function assertRun(result, stage) {
  if (result.status === 0) return;
  const detail = String(
    result.stderr || result.stdout || result.error?.message || '',
  ).trim();
  throw new Error(
    `land: candidate snapshot ${stage} failed${detail ? `: ${detail}` : ''}`,
  );
}

export function withCandidateSnapshot(root, aggregate, inspect) {
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), SNAPSHOT_PREFIX));
  fs.rmdirSync(snapshot);
  const added = run(root, GIT, [
    ...WORKTREE_ADD_ARGUMENTS, snapshot, aggregate.baseCommit,
  ]);
  assertRun(added, SNAPSHOT_CREATION_STAGE);
  try {
    const applied = run(snapshot, GIT, APPLY_ARGUMENTS,
      aggregate.content || '');
    assertRun(applied, SNAPSHOT_MATERIALIZATION_STAGE);
    const dependencies = path.join(root, NODE_MODULES);
    const snapshotDependencies = path.join(snapshot, NODE_MODULES);
    if (fs.existsSync(dependencies) && !fs.existsSync(snapshotDependencies)) {
      fs.symlinkSync(dependencies, snapshotDependencies, DIRECTORY_SYMLINK_TYPE);
    }
    return inspect(snapshot);
  } finally {
    run(root, GIT, [...WORKTREE_REMOVE_ARGUMENTS, snapshot]);
    fs.rmSync(snapshot, {recursive: true, force: true});
  }
}
