#!/usr/bin/env node

// Verify pushed benchmark history and derived artifact freshness on the EXACT
// pushed commit SHA(s) before a non-main branch preservation push proceeds.
//
// Reads git pre-push ref lines from the file passed as argv[2], detects any
// non-deleted pushed ref whose range modifies `data/tidb-comparison/*` or
// `docs/benchmarks/*`, materializes each such pushed commit into a throwaway
// detached worktree (so the working tree is never a proof input), and verifies
// both `check-benchmark-history-append-only.js` and
// `comparative-benchmark-recompute.js` against that exact commit.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {CHECK_BASE_ENV} from './change-selection-constants.js';
import {execGit, spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

const UTF8 = 'utf8';
const NEWLINE = '\n';
const WHITESPACE_PATTERN = /\s+/u;
const ZERO_SHA = '0000000000000000000000000000000000000000';
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const SIGNAL_EXIT_BASE = 128;
const ARGV_REF_LINES_INDEX = 2;
const REF_LINE_MIN_FIELDS = 4;
const REMOTE_SHA_INDEX = 3;

const BENCHMARK_CORPUS_PATHS = Object.freeze([
  'data/tidb-comparison',
  'docs/benchmarks',
]);
const BENCHMARK_PRODUCER_PATHSPECS = Object.freeze([
  ...BENCHMARK_CORPUS_PATHS,
  ':(glob)test/distributed/harness/comparative-*.js',
  ':(glob)test/distributed/harness/raw-observation-*.js',
  ':(glob)test/distributed/harness/oltp-comparison-*.js',
  ':(glob)test/distributed/harness/*-static-web.js',
  'test/distributed/harness/benchmark-claim-admission.js',
  'test/distributed/harness/benchmark-invalidation-ledger.js',
  ':(glob)test/distributed/harness/scaleout-*.js',
  'scripts/checks/comparative-benchmark-recompute.js',
  'scripts/checks/check-benchmark-history-append-only.js',
]);
const RAW_OBSERVATIONS_PATH = 'data/tidb-comparison/raw-observations.ndjson';
const ORIGIN_MAIN_REF = 'refs/remotes/origin/main';
const COMMIT_PEEL_SUFFIX = '^{commit}';
const GIT_C_FLAG = '-C';
const GIT_DOUBLE_DASH = '--';
const GIT_RANGE_SEPARATOR = '..';
const GIT_ROOT_ARGUMENTS = Object.freeze(['rev-parse', '--show-toplevel']);
const GIT_PEEL_ARGUMENTS = Object.freeze(['rev-parse', '--verify', '--quiet']);
const GIT_CAT_FILE_EXISTS_ARGUMENTS = Object.freeze(['cat-file', '-e']);
const GIT_MERGE_BASE_ARGUMENTS = Object.freeze(['merge-base']);
const GIT_IS_ANCESTOR_ARGUMENTS = Object.freeze(['merge-base', '--is-ancestor']);
const GIT_DIFF_NAME_ONLY_ARGUMENTS = Object.freeze(['diff', '--name-only']);
const GIT_LOG_NAME_ONLY_ARGUMENTS = Object.freeze(['log', '--format=', '--name-only']);
const GIT_LS_TREE_ARGUMENTS = Object.freeze(['ls-tree', '-r', '--name-only']);
const GIT_WORKTREE_ADD_ARGUMENTS = Object.freeze(['worktree', 'add', '--detach', '--quiet']);
const GIT_WORKTREE_REMOVE_ARGUMENTS = Object.freeze(['worktree', 'remove', '--force']);
const APPEND_ONLY_SCRIPT = 'scripts/checks/check-benchmark-history-append-only.js';
const RECOMPUTE_SCRIPT = 'scripts/checks/comparative-benchmark-recompute.js';
const BASE_FLAG = '--base';
const WORKTREE_PREFIX = 'lagrange-bench-freshness-';
const WORKTREE_LEAF = 'tree';
const NODE_MODULES_DIR = 'node_modules';
const SYMLINK_DIR_TYPE = 'dir';
const STDIO_INHERIT = 'inherit';
const CLEANUP_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);

const TEXT = Object.freeze({
  USAGE: 'usage: check-pushed-benchmark-freshness.js <ref-lines-file>\n',
  UNRESOLVABLE_COMMIT: '[pre-push] could not resolve pushed commit ',
  VERIFYING_PREFIX: '[pre-push] verifying benchmark freshness on pushed commit ',
  VERIFYING_REF_PREFIX: ' (',
  VERIFYING_REF_SUFFIX: ')\n',
  SPAWN_FAILED: '[pre-push] could not run ',
  SPAWN_COLON: ': ',
  CHECK_FAILED: '[pre-push] benchmark freshness failed on pushed commit ',
  CHECK_FAILED_MID: ' during ',
  CHECK_FAILED_SUFFIX: '; regenerate docs/benchmarks and data/tidb-comparison and commit\n',
  MISSING_RAW_OBSERVATIONS: '[pre-push] benchmark corpus present in pushed commit ',
  MISSING_RAW_OBSERVATIONS_SUFFIX:
    ' without required input data/tidb-comparison/raw-observations.ndjson; refusing push\n',
  ERROR_PREFIX: '[pre-push] benchmark freshness error: ',
});

function gitEnv() {
  return gitProcessEnvironment();
}

function repoRoot() {
  return stringTrim(String(execGit(
    GIT_ROOT_ARGUMENTS,
    {cwd: process.cwd(), encoding: UTF8, env: gitEnv()},
  )));
}

function parseRefLines(text) {
  const lines = arrayFilter(stringSplit(text, NEWLINE), (line) => stringTrim(line) !== '');
  const entries = [];
  for (const line of lines) {
    const fields = stringSplit(stringTrim(line), WHITESPACE_PATTERN);
    if (fields.length < REF_LINE_MIN_FIELDS) continue;
    const localSha = fields[1];
    if (localSha === ZERO_SHA) continue;
    entries.push({
      localRef: fields[0],
      localSha,
      remoteRef: fields[2],
      remoteSha: fields[REMOTE_SHA_INDEX],
    });
  }
  return entries;
}

function peelToCommit(root, sha) {
  const result = spawnGit(
    [GIT_C_FLAG, root, ...GIT_PEEL_ARGUMENTS, `${sha}${COMMIT_PEEL_SUFFIX}`],
    {encoding: UTF8, env: gitEnv()},
  );
  if (result.status !== 0) {
    throw new Error(`${TEXT.UNRESOLVABLE_COMMIT}${sha}`);
  }
  return stringTrim(String(result.stdout));
}

function commitExists(root, sha) {
  if (!sha || sha === ZERO_SHA) return false;
  const result = spawnGit(
    [GIT_C_FLAG, root, ...GIT_CAT_FILE_EXISTS_ARGUMENTS, `${sha}${COMMIT_PEEL_SUFFIX}`],
    {encoding: UTF8, env: gitEnv()},
  );
  return result.status === 0;
}

function mergeBaseCommit(root, refA, refB) {
  const result = spawnGit(
    [GIT_C_FLAG, root, ...GIT_MERGE_BASE_ARGUMENTS, refA, refB],
    {encoding: UTF8, env: gitEnv()},
  );
  return result.status === 0 ? stringTrim(String(result.stdout)) : null;
}

function isAncestor(root, ancestor, descendant) {
  const result = spawnGit(
    [GIT_C_FLAG, root, ...GIT_IS_ANCESTOR_ARGUMENTS, ancestor, descendant],
    {encoding: UTF8, env: gitEnv()},
  );
  return result.status === 0;
}

function nonEmptyLines(output) {
  return arrayFilter(stringSplit(String(output), NEWLINE), (line) => stringTrim(line) !== '');
}

function rangeTouchedBenchmarkPaths(root, baseSha, headSha) {
  const env = gitEnv();
  const diffOut = execGit(
    [GIT_C_FLAG, root, ...GIT_DIFF_NAME_ONLY_ARGUMENTS, baseSha, headSha,
      GIT_DOUBLE_DASH, ...BENCHMARK_PRODUCER_PATHSPECS],
    {encoding: UTF8, env},
  );
  if (nonEmptyLines(diffOut).length > 0) return true;
  const logOut = execGit(
    [GIT_C_FLAG, root, ...GIT_LOG_NAME_ONLY_ARGUMENTS,
      `${baseSha}${GIT_RANGE_SEPARATOR}${headSha}`,
      GIT_DOUBLE_DASH, ...BENCHMARK_PRODUCER_PATHSPECS],
    {encoding: UTF8, env},
  );
  return nonEmptyLines(logOut).length > 0;
}

function treeContainsPaths(root, commitSha, pathspecs) {
  const treeOut = execGit(
    [GIT_C_FLAG, root, ...GIT_LS_TREE_ARGUMENTS, commitSha,
      GIT_DOUBLE_DASH, ...pathspecs],
    {encoding: UTF8, env: gitEnv()},
  );
  return nonEmptyLines(treeOut).length > 0;
}

function assertCompleteBenchmarkCorpusInTree(root, commitSha) {
  const hasCorpus = treeContainsPaths(root, commitSha, BENCHMARK_CORPUS_PATHS);
  const hasRawObservations = treeContainsPaths(root, commitSha, [RAW_OBSERVATIONS_PATH]);
  if (hasCorpus && !hasRawObservations) {
    throw new Error(
      `${TEXT.MISSING_RAW_OBSERVATIONS}${commitSha}${TEXT.MISSING_RAW_OBSERVATIONS_SUFFIX}`,
    );
  }
  return hasCorpus;
}

function resolveHistoryBase(root, originMainBase, remoteBase) {
  if (originMainBase && (!remoteBase || isAncestor(root, originMainBase, remoteBase))) {
    return originMainBase;
  }
  return remoteBase;
}

function resolveCheckTarget(root, entry) {
  const commitSha = peelToCommit(root, entry.localSha);
  const hasCorpus = assertCompleteBenchmarkCorpusInTree(root, commitSha);
  const remoteBase = commitExists(root, entry.remoteSha) ? entry.remoteSha : null;
  const originMainBase = mergeBaseCommit(root, ORIGIN_MAIN_REF, commitSha);
  const diffBase = remoteBase || originMainBase;
  const baseHadCorpus = diffBase ?
    treeContainsPaths(root, diffBase, BENCHMARK_CORPUS_PATHS) : false;
  if (!hasCorpus && !baseHadCorpus) return null;
  const touched = diffBase ?
    rangeTouchedBenchmarkPaths(root, diffBase, commitSha) :
    treeContainsPaths(root, commitSha, BENCHMARK_PRODUCER_PATHSPECS);
  if (!touched) return null;
  if (!hasCorpus) {
    throw new Error(
      `${TEXT.MISSING_RAW_OBSERVATIONS}${commitSha}${TEXT.MISSING_RAW_OBSERVATIONS_SUFFIX}`,
    );
  }
  return {
    localRef: entry.localRef,
    commitSha,
    historyBase: resolveHistoryBase(root, originMainBase, remoteBase),
  };
}

function cleanupMaterializedWorktree(root, worktreePath, tempParent, linkedModules) {
  if (linkedModules && fs.existsSync(linkedModules)) {
    fs.unlinkSync(linkedModules);
  }
  spawnGit(
    [GIT_C_FLAG, root, ...GIT_WORKTREE_REMOVE_ARGUMENTS, worktreePath],
    {encoding: UTF8, env: gitEnv()},
  );
  fs.rmSync(tempParent, {recursive: true, force: true});
}

function registerSignalCleanup(cleanup) {
  const handlers = [];
  for (const signal of CLEANUP_SIGNALS) {
    const handler = () => {
      cleanup();
      process.exit(SIGNAL_EXIT_BASE + (os.constants.signals[signal] || 0));
    };
    process.on(signal, handler);
    handlers.push([signal, handler]);
  }
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}

function linkNodeModulesIfPresent(root, worktreePath) {
  const source = path.join(root, NODE_MODULES_DIR);
  const target = path.join(worktreePath, NODE_MODULES_DIR);
  if (!fs.existsSync(source) || fs.existsSync(target)) return null;
  fs.symlinkSync(fs.realpathSync(source), target, SYMLINK_DIR_TYPE);
  return target;
}

function runCheckInWorktree(worktreePath, scriptPath, extraArgs, env, commitSha) {
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: worktreePath,
    env,
    stdio: STDIO_INHERIT,
  });
  if (result.error) {
    process.stderr.write(
      `${TEXT.SPAWN_FAILED}${scriptPath}${TEXT.SPAWN_COLON}${result.error.message}${NEWLINE}`,
    );
    return EXIT_FAILURE;
  }
  if (result.status !== 0) {
    process.stderr.write(
      `${TEXT.CHECK_FAILED}${commitSha}${TEXT.CHECK_FAILED_MID}${scriptPath}` +
      `${TEXT.CHECK_FAILED_SUFFIX}`,
    );
    return result.status ?? EXIT_FAILURE;
  }
  return 0;
}

function verifyMaterializedCommit(root, target) {
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), WORKTREE_PREFIX));
  const worktreePath = path.join(tempParent, WORKTREE_LEAF);
  let linkedModules = null;
  const cleanup = () => cleanupMaterializedWorktree(root, worktreePath, tempParent, linkedModules);
  const releaseSignals = registerSignalCleanup(cleanup);
  try {
    execGit(
      [GIT_C_FLAG, root, ...GIT_WORKTREE_ADD_ARGUMENTS, worktreePath, target.commitSha],
      {encoding: UTF8, env: gitEnv()},
    );
    linkedModules = linkNodeModulesIfPresent(root, worktreePath);
    const childEnv = gitEnv();
    delete childEnv[CHECK_BASE_ENV];
    process.stdout.write(
      `${TEXT.VERIFYING_PREFIX}${target.commitSha}${TEXT.VERIFYING_REF_PREFIX}` +
      `${target.localRef}${TEXT.VERIFYING_REF_SUFFIX}`,
    );
    const appendArgs = target.historyBase ? [BASE_FLAG, target.historyBase] : [];
    const appendStatus = runCheckInWorktree(
      worktreePath, APPEND_ONLY_SCRIPT, appendArgs, childEnv, target.commitSha,
    );
    if (appendStatus !== 0) return appendStatus;
    return runCheckInWorktree(
      worktreePath, RECOMPUTE_SCRIPT, [], childEnv, target.commitSha,
    );
  } finally {
    releaseSignals();
    cleanup();
  }
}

function main(argv) {
  const refLinesFile = argv[ARGV_REF_LINES_INDEX];
  if (!refLinesFile || !fs.existsSync(refLinesFile)) {
    process.stderr.write(TEXT.USAGE);
    return EXIT_USAGE;
  }
  const entries = parseRefLines(fs.readFileSync(refLinesFile, UTF8));
  if (entries.length === 0) return 0;
  const root = repoRoot();
  const checkedCommits = new Set();
  for (const entry of entries) {
    const target = resolveCheckTarget(root, entry);
    if (!target || checkedCommits.has(target.commitSha)) continue;
    checkedCommits.add(target.commitSha);
    const status = verifyMaterializedCommit(root, target);
    if (status !== 0) return status;
  }
  return 0;
}

try {
  process.exitCode = main(process.argv);
} catch (error) {
  process.stderr.write(`${TEXT.ERROR_PREFIX}${error?.message ?? String(error)}${NEWLINE}`);
  process.exitCode = EXIT_FAILURE;
}
