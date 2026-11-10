// Exact source requirements, candidate and proof-checkout preparation delegated by probe.
import fs from 'node:fs';
import path from 'node:path';
import {GIT_OUTPUT_BOUND, isGitOutputTooLarge} from '../checks/git-invocation.js';
import {IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH} from '../checks/impact-proof-cone-constants.js';
import {PROOF_CHECKOUT_GENERATORS} from '../checks/proof-checkout-preparation.js';
import {PLACEMENT_GIT_HEAD, gitAt, gitSucceeds} from './process.js';
import {DISCOVERY_FAILURE, PLACEMENT_TEXT, LAB_TEST_TEXT} from './placement-contract.js';
import {TEXT_UTF8} from './process-output.js';
import {lockfileGraphDigest, graphDigestOf, REQUIREMENT_SOURCE} from './test-capability.js';

const PLACEMENT_PARENT = 'test-output/placement-worktrees';
const PLACEMENT_GIT_HAS_COMMIT = Object.freeze(['cat-file', '-e']);
const PLACEMENT_GIT_IS_ANCESTOR = Object.freeze(['merge-base', '--is-ancestor']);
const PLACEMENT_COMMIT_ENV = 'LAGRANGE_PLACEMENT_COMMIT';
const PLACEMENT_CANDIDATE_REF_PREFIX = 'refs/lagrange-placement/candidate-';
const COMMIT_CANDIDATE_MESSAGE = 'lagrange-placement-candidate';
const GIT_REF_HEAD = 'HEAD';
const GIT_CMD_UPDATE_REF = 'update-ref';
const PLACEMENT_SAFE_CHARACTER = '_';
const PLACEMENT_RUN_SHA_CHARACTERS = 12;
const PLACEMENT_RUN_RADIX = 36;
const REQUIREMENT_FILE = Object.freeze({PACKAGE: 'package.json', LOCK: 'package-lock.json'});
const REQUIREMENT_TEXT = Object.freeze({
  UNREADABLE: 'no requirement: cannot read ',
  AT: ' at ',
  TOO_LARGE: ' is larger than the requirement read bound of ',
  BYTES: ' bytes',
});

function discoveryFailure(code, message, cause = undefined) {
  return Object.assign(new Error(message, {cause}), {code});
}
// The generated material every proof checkout needs, from its one owner
// (scripts/checks/proof-checkout-preparation.js), which the push-gate
// materializer prepares locally from the same list.
const PLACEMENT_SHELL_WORD = ' ';
const [PLACEMENT_IMPORT_GRAPH] = PROOF_CHECKOUT_GENERATORS.map((generator) =>
  Object.freeze({NAME: generator.name, PRODUCER: generator.producer,
    FLAG: generator.args.join(PLACEMENT_SHELL_WORD)}));

function safeName(name) {
  return String(name).replace(/[^\w.-]/gu, PLACEMENT_SAFE_CHARACTER);
}

// The bundle of what lies between the commit the machine's checkout is at and
// the one being placed, or nothing when the machine already holds it. A `git
// push` would run this repository's pre-push gate against the lab machine; a
// bundle runs nothing.
function bundleFor(machine, {root, sha, local}) {
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
  const made = gitAt(root, ['bundle', 'create', bundleFile, refToBundle, '--not', machine.repoHead]);
  if (made.status !== 0) throw new Error(`git bundle create exited ${made.status}`);
  return bundleFile;
}

/**
 * The requirement a machine must meet to run a commit's corpus: the
 * dependency graph its lockfile describes and its engines floor. With a sha
 * both are read from that commit - the one a run places - and a commit that
 * cannot be read throws rather than falling back; with none they are the
 * working tree's, and `source` says which. A commit's file larger than
 * GIT_OUTPUT_BOUND.COMMAND throws its own failure (REQUIREMENT_TOO_LARGE).
 * @param {string} root
 * @param {string|null} [sha]
 * @return {{source: string, lockGraphSha256: string|null, nodeMinimum: string}}
 */
function fleetRequirement(root, sha = null) {
  const read = (file) => {
    if (!sha) return fs.readFileSync(path.join(root, file), TEXT_UTF8);
    let shown;
    try {
      shown = gitAt(root, ['show', `${sha}:${file}`]);
    } catch (error) {
      if (!isGitOutputTooLarge(error)) throw error;
      throw discoveryFailure(DISCOVERY_FAILURE.REQUIREMENT_TOO_LARGE,
        `${file}${REQUIREMENT_TEXT.AT}${sha}${REQUIREMENT_TEXT.TOO_LARGE}` +
        `${GIT_OUTPUT_BOUND.COMMAND}${REQUIREMENT_TEXT.BYTES}`, error);
    }
    if (shown.status !== 0) {
      throw discoveryFailure(DISCOVERY_FAILURE.REQUIREMENT_UNREADABLE,
        `${REQUIREMENT_TEXT.UNREADABLE}${file}${REQUIREMENT_TEXT.AT}${sha}`, shown.error);
    }
    return shown.stdout;
  };
  const manifest = JSON.parse(read(REQUIREMENT_FILE.PACKAGE));
  return {
    source: sha || REQUIREMENT_SOURCE.WORKING_TREE,
    lockGraphSha256: lockfileGraphDigest(read(REQUIREMENT_FILE.LOCK), graphDigestOf),
    nodeMinimum: String(manifest.engines?.node || '').replace(/^>=\s*/u, ''),
  };
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

// ---------------------------------------------------------------------------
// The hand verb: `lab test <profile> --lane <lane> [--on NAME] [--sha COMMIT]
// [--split]`. No new placement layer: the exact commit goes out through the
// same bundle and shard path a placed run uses, and each lane runs under its
// own job policy because the machine's classified runner plans it again.
// What is new is who chooses - the operator names a lane, and a machine or
// none - and that each file's verdict is shown as it lands, not at settle.
// The machine still comes from this run's discovery, never from a name in
// any setup; `--on` is a choice made at run time.

const LAB_TEST_PARENT = 'test-output/lab-test-worktrees';
// What planning a commit's lanes reads: its test tree and its npm scripts.
const LAB_TEST_PLANNED_PATHS = Object.freeze(['test', 'package.json']);
const LAB_TEST_GIT = Object.freeze({
  RESOLVE: Object.freeze(['rev-parse', '--verify', '--quiet', '--end-of-options']),
  COMMIT_SUFFIX: '^{commit}',
  ADD: Object.freeze(['worktree', 'add', '--detach', '--no-checkout', '--quiet']),
  CHECKOUT: Object.freeze(['checkout', '--quiet']),
  REMOVE: Object.freeze(['worktree', 'remove', '--force']),
  PATHS: '--',
});

function gitMust(root, args) {
  const result = gitAt(root, args);
  if (result.status !== 0) {
    throw new Error(`${LAB_TEST_TEXT.PLANNING_FAILED}${String(result.stderr || '').trim()}`);
  }
  return result;
}

/**
 * The commit a hand lab run sends, and a checkout to plan it from. With no
 * `sha` the tree must be exactly a commit - a working tree is never sent - and
 * with one, any tree will do: the commit is named. Planning reads that
 * commit's own test tree, checked out alone into a throwaway worktree whose
 * HEAD is the commit, which is also what its bundle is made from. `release`
 * removes it, and may be called any number of times.
 * @param {{root: string, sha?: string|null}} input
 * @return {{sha: string, gitRoot: string, release: Function}}
 */
function labTestCommit({root, sha = null}) {
  const resolved = sha ? resolveCommit(root, sha) : commitAt(root);
  if (!resolved) throw new Error(`${PLACEMENT_TEXT.NOT_A_COMMIT}${LAB_TEST_TEXT.NAME_ONE}`);
  const gitRoot = path.join(root, LAB_TEST_PARENT,
    `${resolved.slice(0, PLACEMENT_RUN_SHA_CHARACTERS)}-` +
    `${Date.now().toString(PLACEMENT_RUN_RADIX)}-${process.pid}`);
  fs.mkdirSync(path.dirname(gitRoot), {recursive: true});
  gitMust(root, [...LAB_TEST_GIT.ADD, gitRoot, resolved]);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    gitAt(root, [...LAB_TEST_GIT.REMOVE, gitRoot]);
    fs.rmSync(gitRoot, {recursive: true, force: true});
  };
  try {
    gitMust(gitRoot, [...LAB_TEST_GIT.CHECKOUT, resolved, LAB_TEST_GIT.PATHS,
      ...LAB_TEST_PLANNED_PATHS]);
  } catch (error) {
    release();
    throw error;
  }
  return {sha: resolved, gitRoot, release};
}

function resolveCommit(root, name) {
  const result = gitAt(root, [...LAB_TEST_GIT.RESOLVE, `${name}${LAB_TEST_GIT.COMMIT_SUFFIX}`]);
  if (result.status !== 0) throw new Error(`${name}${LAB_TEST_TEXT.NOT_A_COMMIT}`);
  return result.stdout.trim();
}

// The change cone of a hand run is the selector's own plan of the commit,
// measured from the base the operator named with --base-sha. With none named
// the selector applies its own default - the merge base with the publication
// remote, origin/main - so the lab never restates that decision. The named
// base reaches the one owner of the changed set, which is also what decides a
// release-surface refusal: a path changed only before the base is not part
// of the change.
const LAB_TEST_SELECTOR = Object.freeze({SCRIPT: 'scripts/select-change-tests.js',
  LIST: '--list', HEAD: '--head', BASE: '--base'});

/**
 * The selector invocation that lists the change cone of `sha` against
 * `baseSha`, or against the selector's default base when none is named.
 * @param {{sha: string, baseSha?: string|null}} input
 * @return {string[]}
 */
function labTestSelectorArgs({sha, baseSha = null}) {
  const base = baseSha ? [LAB_TEST_SELECTOR.BASE, baseSha] : [];
  return [LAB_TEST_SELECTOR.SCRIPT, LAB_TEST_SELECTOR.LIST, LAB_TEST_SELECTOR.HEAD, sha, ...base];
}

/**
 * The generated import graph the selector reads from the checkout it runs in,
 * made by its own producer when that checkout never generated one (a fresh
 * worktree): without it a changed test helper refuses the whole run as
 * UNKNOWN_SCOPE. A graph already there is the operator's and is left as it
 * is, and so is the tracked seal: one the producer rewrote is put back, so a
 * tree with uncommitted import changes stays as it was and the selector
 * refuses on it in its own words.
 * @param {string} root the checkout the selector runs in
 * @param {{produce: Function, write: Function}} io `produce(args, cwd)`
 *   runs node with args there; `write(line)` reports the step
 * @return {Promise<boolean>} whether the graph was generated
 */
async function prepareSelectorImportGraph(root, {produce, write}) {
  if (fs.existsSync(path.join(root, IMPORT_GRAPH_PATH))) return false;
  const sealPath = path.join(root, IMPORT_GRAPH_SEAL_PATH);
  const seal = fs.existsSync(sealPath) ? fs.readFileSync(sealPath) : null;
  write(`${LAB_TEST_TEXT.PREFIX}${LAB_TEST_TEXT.GRAPH}${root}`);
  await produce([PLACEMENT_IMPORT_GRAPH.PRODUCER, PLACEMENT_IMPORT_GRAPH.FLAG], root);
  if (seal !== null && !seal.equals(fs.readFileSync(sealPath))) fs.writeFileSync(sealPath, seal);
  return true;
}

export {PLACEMENT_PARENT, PLACEMENT_RUN_SHA_CHARACTERS, PLACEMENT_RUN_RADIX, discoveryFailure,
  PLACEMENT_IMPORT_GRAPH, safeName, bundleFor, fleetRequirement, commitAt, labTestCommit,
  labTestSelectorArgs, prepareSelectorImportGraph, PLACEMENT_CANDIDATE_REF_PREFIX,
  PLACEMENT_COMMIT_ENV};
