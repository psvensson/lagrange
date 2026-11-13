// Exact checkout identity and owned Git bundle inputs for placed executions.
import fs from 'node:fs';
import {spawnGit} from '../checks/git-invocation.js';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';
import {PLACEMENT_CREATE_FLAG, PLACEMENT_RUN_SHA_CHARACTERS, PLACEMENT_TEXT}
  from './placement-constants.js';
import {TEXT_UTF8} from './process.js';

const PLACEMENT_GIT_HAS_COMMIT = Object.freeze(['cat-file', '-e']);
const PLACEMENT_GIT_IS_ANCESTOR = Object.freeze(['merge-base', '--is-ancestor']);
const PLACEMENT_GIT_HEAD = Object.freeze(['rev-parse', 'HEAD']);
const PLACEMENT_COMMIT_ENV = 'LAGRANGE_PLACEMENT_COMMIT';
const PLACEMENT_CANDIDATE_REF_PREFIX = 'refs/lagrange-placement/candidate-';
const COMMIT_CANDIDATE_MESSAGE = 'lagrange-placement-candidate';
const GIT_REF_HEAD = 'HEAD';
const GIT_CMD_UPDATE_REF = 'update-ref';
const PLACEMENT_SAFE_CHARACTER = '_';

// Git here addresses the checkout it is given, never a repository pointer
// inherited from a hook (the push gate runs this inside pre-push).
// Git output this module reads whole (`git show <sha>:package-lock.json`,
// status, rev-parse) is bounded by the git invocation owner: a lockfile past
// spawnSync's 1 MiB default would otherwise leave every placed run with no
// requirement, and exceeding the bound is a failure of its own.
function gitAt(root, args) {
  return spawnGit(args, {cwd: root, env: gitProcessEnvironment(), encoding: TEXT_UTF8});
}

function gitSucceeds(root, args) {
  return gitAt(root, args).status === 0;
}

function safeName(name) {
  return String(name).replace(/[^\w.-]/gu, PLACEMENT_SAFE_CHARACTER);
}

// The bundle of what lies between the commit the machine's checkout is at and
// the one being placed, or nothing when the machine already holds it. A `git
// push` would run this repository's pre-push gate against the lab machine; a
// bundle runs nothing.
function bundleFor(machine, {root, sha, local, ownedInputs}) {
  if (!gitSucceeds(root, [...PLACEMENT_GIT_HAS_COMMIT, `${machine.repoHead}^{commit}`])) {
    throw new Error(PLACEMENT_TEXT.NO_HISTORY);
  }
  if (gitSucceeds(root, [...PLACEMENT_GIT_IS_ANCESTOR, sha, machine.repoHead])) return null;
  const head = gitAt(root, PLACEMENT_GIT_HEAD);
  const headSha = head.status === 0 ? head.stdout.trim() : null;
  let refToBundle;
  if (sha === headSha) {
    refToBundle = GIT_REF_HEAD;
  } else {
    const candidateRef = `${PLACEMENT_CANDIDATE_REF_PREFIX}${sha.slice(0, PLACEMENT_RUN_SHA_CHARACTERS)}`;
    const updated = gitAt(root, [GIT_CMD_UPDATE_REF, candidateRef, sha]);
    if (updated.status !== 0) throw new Error(`git update-ref exited ${updated.status}`);
    refToBundle = candidateRef;
  }
  const bundleFile = `${local}.bundle`;
  const reserved = fs.openSync(bundleFile, PLACEMENT_CREATE_FLAG);
  ownedInputs.add(bundleFile);
  fs.closeSync(reserved);
  const made = gitAt(root, ['bundle', 'create', bundleFile, refToBundle, '--not', machine.repoHead]);
  if (made.status !== 0) throw new Error(`git bundle create exited ${made.status}`);
  return bundleFile;
}

function isStagedIndexOnly(root) {
  const unstaged = gitAt(root, ['diff', '--name-only']);
  if (unstaged.status !== 0 || unstaged.stdout.trim().length > 0) return false;
  const untracked = gitAt(root, ['ls-files', '--others', '--exclude-standard']);
  if (untracked.status !== 0 || untracked.stdout.trim().length > 0) return false;
  const staged = gitAt(root, ['diff', '--cached', '--name-only']);
  return staged.status === 0 && staged.stdout.trim().length > 0;
}

function synthesizeStagedCandidate(root) {
  const staged = gitAt(root, ['diff', '--cached', '--name-only']);
  if (staged.status !== 0 || staged.stdout.trim().length === 0) return null;
  const tree = gitAt(root, ['write-tree']);
  if (tree.status !== 0 || !tree.stdout.trim()) return null;
  const treeSha = tree.stdout.trim();
  const head = gitAt(root, PLACEMENT_GIT_HEAD);
  if (head.status !== 0 || !head.stdout.trim()) return null;
  const headSha = head.stdout.trim();
  const commit = gitAt(root, ['commit-tree', treeSha, '-p', headSha, '-m', COMMIT_CANDIDATE_MESSAGE]);
  if (commit.status !== 0 || !commit.stdout.trim()) return null;
  const candidateSha = commit.stdout.trim();
  const candidateRef = `${PLACEMENT_CANDIDATE_REF_PREFIX}${process.pid}`;
  gitAt(root, [GIT_CMD_UPDATE_REF, candidateRef, candidateSha]);
  return candidateSha;
}

// The sha the tree at root exactly is - nothing modified, nothing untracked -
// or null: a working tree is never sent anywhere.
// When changes are staged in the index during landing, a candidate commit parented
// on HEAD is synthesized without moving HEAD so remote lab machines can prove it.
function commitAt(root, env = process.env) {
  const status = gitAt(root, ['status', '--porcelain']);
  if (status.status === 0 && status.stdout.trim().length === 0) {
    const head = gitAt(root, PLACEMENT_GIT_HEAD);
    return head.status === 0 ? head.stdout.trim() : null;
  }
  const isCandidateEligible = env?.LAGRANGE_SOLVER_LANDING === '1' ||
    Boolean(env?.[PLACEMENT_COMMIT_ENV]) ||
    isStagedIndexOnly(root);
  if (isCandidateEligible) {
    return synthesizeStagedCandidate(root);
  }
  return null;
}

export {
  PLACEMENT_CANDIDATE_REF_PREFIX, PLACEMENT_COMMIT_ENV, PLACEMENT_GIT_HEAD,
  bundleFor, commitAt, gitAt, gitSucceeds, safeName,
};
