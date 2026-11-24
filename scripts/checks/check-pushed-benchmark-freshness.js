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
import {fileURLToPath} from 'node:url';

import {CHECK_BASE_ENV} from './change-selection-constants.js';
import {execGit, spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayJoin = Function.call.bind(Array.prototype.join);
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
const BENCHMARK_PUBLICATION_PRODUCER_PATHS = Object.freeze([
  'docs/benchmarks/cloud/gcp-vm-lifetime-args.mjs',
  'docs/benchmarks/cloud/run-comparative-benchmarks.mjs',
  'scripts/checks/change-proof-string-collections.js',
  'scripts/checks/change-selection-constants.js',
  'scripts/checks/changed-paths.js',
  'scripts/checks/check-benchmark-history-append-only.js',
  'scripts/checks/check-pushed-benchmark-freshness.js',
  'scripts/checks/check-quest-log-append-only.js',
  'scripts/checks/comparative-benchmark-recompute.js',
  'scripts/checks/git-invocation.js',
  'scripts/checks/git-process-environment.js',
  'scripts/checks/quest-record-transitions.js',
  'scripts/checks/wait-for-thermal-headroom.js',
  'test/distributed/harness/active-gate-closure-classification.js',
  'test/distributed/harness/active-probe-snapshot-lane-constants.js',
  'test/distributed/harness/assertions-consistency-checks.js',
  'test/distributed/harness/assertions-consistency-comparison.js',
  'test/distributed/harness/assertions-consistency-observation-cohort.js',
  'test/distributed/harness/assertions-consistency-shared.js',
  'test/distributed/harness/assertions-control-snapshot-extraction.js',
  'test/distributed/harness/assertions-convergence-wait.js',
  'test/distributed/harness/assertions-publication-gate-comparison.js',
  'test/distributed/harness/assertions-publication-recovery-gate.js',
  'test/distributed/harness/assertions.js',
  'test/distributed/harness/benchmark-claim-admission.js',
  'test/distributed/harness/benchmark-invalidation-ledger.js',
  'test/distributed/harness/benchmark-oltp-attempt-capture.js',
  'test/distributed/harness/benchmark-oltp-state-reconciliation.js',
  'test/distributed/harness/benchmark-operation-outcome.js',
  'test/distributed/harness/benchmark-partition-convergence.js',
  'test/distributed/harness/benchmark-readiness-denial.js',
  'test/distributed/harness/benchmark-scenario-a-run.js',
  'test/distributed/harness/benchmark-semantic-integrity.js',
  'test/distributed/harness/benchmark-workload-dispatch.js',
  'test/distributed/harness/benchmark-workload-semantics-constants.js',
  'test/distributed/harness/benchmark-workload-semantics.js',
  'test/distributed/harness/chaos.js',
  'test/distributed/harness/citus-comparison-static-web.js',
  'test/distributed/harness/cluster-active-wait-diagnostics.js',
  'test/distributed/harness/cluster-active-wait-formatting-layer.js',
  'test/distributed/harness/cluster-active-wait-normalization.js',
  'test/distributed/harness/cluster-active-wait-priority-recovery-progress.js',
  'test/distributed/harness/cluster-active-wait-progress-layer.js',
  'test/distributed/harness/cluster-active-wait-publication-gate.js',
  'test/distributed/harness/cluster-base-layer.js',
  'test/distributed/harness/cluster-control-snapshot-admin-layer.js',
  'test/distributed/harness/cluster-node-handle-layer.js',
  'test/distributed/harness/cluster-node-owner-operations.js',
  'test/distributed/harness/cluster-node-resource-diagnostics.js',
  'test/distributed/harness/cluster-startup-gate-layer.js',
  'test/distributed/harness/comparative-benchmark-campaign-manifest.js',
  'test/distributed/harness/comparative-benchmark-campaign-runner.js',
  'test/distributed/harness/comparative-benchmark-harness-identity.js',
  'test/distributed/harness/comparative-benchmark-host-preparation.js',
  'test/distributed/harness/comparative-benchmark-lab-hosts.js',
  'test/distributed/harness/comparative-benchmark-product-pins.js',
  'test/distributed/harness/comparative-benchmark-provisioning.js',
  'test/distributed/harness/comparative-benchmark-record-owner.js',
  'test/distributed/harness/comparative-benchmark-semantic-gate.js',
  'test/distributed/harness/comparative-benchmark-tidb-cases.js',
  'test/distributed/harness/comparative-benchmark-workload-call-site.js',
  'test/distributed/harness/comparative-coverage-manifest.js',
  'test/distributed/harness/comparative-efficiency-evidence-contract.js',
  'test/distributed/harness/comparative-landing-page.js',
  'test/distributed/harness/comparative-landing-svg-renderer.js',
  'test/distributed/harness/comparative-landing-tables.js',
  'test/distributed/harness/comparative-matrix-runner.js',
  'test/distributed/harness/comparative-page-columns.js',
  'test/distributed/harness/comparative-system-budget.js',
  'test/distributed/harness/consistency-evaluator.js',
  'test/distributed/harness/constants.js',
  'test/distributed/harness/container-log-window.js',
  'test/distributed/harness/container-memory-working-set.js',
  'test/distributed/harness/convergence-voter-targets.js',
  'test/distributed/harness/docker-build-context.js',
  'test/distributed/harness/docker-image-retirement.js',
  'test/distributed/harness/docker-provider.js',
  'test/distributed/harness/failure-bundle-artifact-foundation.js',
  'test/distributed/harness/failure-bundle-log-window.js',
  'test/distributed/harness/gcp-vm-lifetime.js',
  'test/distributed/harness/invariant-breaches.js',
  'test/distributed/harness/lagrange-evolution-static-web.js',
  'test/distributed/harness/load-generator-runtime-methods.js',
  'test/distributed/harness/load-generator.js',
  'test/distributed/harness/load-node-availability.js',
  'test/distributed/harness/log-analyzer.js',
  'test/distributed/harness/log-collector.js',
  'test/distributed/harness/movement-scenario-c-scaling-static-web.js',
  'test/distributed/harness/node-client-normalization-methods.js',
  'test/distributed/harness/node-client.js',
  'test/distributed/harness/oltp-baseline-dataset.js',
  'test/distributed/harness/oltp-baseline-transaction-executor.js',
  'test/distributed/harness/oltp-baseline-workload.js',
  'test/distributed/harness/oltp-comparison-history-store.js',
  'test/distributed/harness/oltp-comparison-static-web.js',
  'test/distributed/harness/oltp-comparison-svg-renderer.js',
  'test/distributed/harness/oltp-error-classification.js',
  'test/distributed/harness/oltp-open-loop-step-owner.js',
  'test/distributed/harness/oltp-paired-retry-owner.js',
  'test/distributed/harness/oltp-paired-sweep-plan.js',
  'test/distributed/harness/oltp-scenario-a-comparison-systems.js',
  'test/distributed/harness/oltp-scenario-a-delivery-case.js',
  'test/distributed/harness/oltp-scenario-a-durability-case.js',
  'test/distributed/harness/oltp-scenario-a-failure-atomicity-case.js',
  'test/distributed/harness/oltp-scenario-a-lagrange-live-admission.js',
  'test/distributed/harness/oltp-scenario-a-lagrange-proof-plan.js',
  'test/distributed/harness/oltp-scenario-a-lagrange-public-pg-context.js',
  'test/distributed/harness/oltp-scenario-a-lagrange-runtime-preflight.js',
  'test/distributed/harness/oltp-scenario-a-new-order-contention-case.js',
  'test/distributed/harness/oltp-scenario-a-order-status-case.js',
  'test/distributed/harness/oltp-scenario-a-payment-case.js',
  'test/distributed/harness/oltp-scenario-a-proof-cases.js',
  'test/distributed/harness/oltp-scenario-a-retryable-conflict-case.js',
  'test/distributed/harness/oltp-scenario-a-semantic-gate.js',
  'test/distributed/harness/oltp-scenario-a-semantic-profile.js',
  'test/distributed/harness/oltp-scenario-a-stock-level-case.js',
  'test/distributed/harness/oltp-scenario-a-visibility-case.js',
  'test/distributed/harness/oracle-blindness.js',
  'test/distributed/harness/partition-granularity-comparison-static-web.js',
  'test/distributed/harness/playback-recorder.js',
  'test/distributed/harness/post-rebalance-closure-contract.js',
  'test/distributed/harness/postgresql-comparison-static-web.js',
  'test/distributed/harness/publication-convergence-claim.js',
  'test/distributed/harness/raw-observation-campaign-specs.js',
  'test/distributed/harness/raw-observation-forensic-reader.js',
  'test/distributed/harness/raw-observation-metrics.js',
  'test/distributed/harness/raw-observation-record.js',
  'test/distributed/harness/raw-observation-store.js',
  'test/distributed/harness/real-product-campaign-cleanup.js',
  'test/distributed/harness/real-product-captured-intrinsics.js',
  'test/distributed/harness/real-product-cluster-deployers.js',
  'test/distributed/harness/real-product-component-recovery.js',
  'test/distributed/harness/real-product-deployer-lagrange.js',
  'test/distributed/harness/real-product-deployer-postgres.js',
  'test/distributed/harness/real-product-deployer-tidb.js',
  'test/distributed/harness/real-product-deployment-contract.js',
  'test/distributed/harness/real-product-exhausted-deployment.js',
  'test/distributed/harness/real-product-identity.js',
  'test/distributed/harness/real-product-lagrange-observations.js',
  'test/distributed/harness/real-product-lagrange-readiness-evaluation.js',
  'test/distributed/harness/real-product-network-impairment.js',
  'test/distributed/harness/real-product-readiness.js',
  'test/distributed/harness/real-product-remote-shell.js',
  'test/distributed/harness/real-product-sql-clients.js',
  'test/distributed/harness/real-product-workload-drivers.js',
  'test/distributed/harness/scale-certification-receipt-freshness.js',
  'test/distributed/harness/scale-evidence-contract.js',
  'test/distributed/harness/scaleout-node-rf-comparison-static-web.js',
  'test/distributed/harness/scaleout-series-experiments.js',
  'test/distributed/harness/scenario-b-rtt-working-set-static-web.js',
  'test/distributed/harness/scenario-c-comparison-static-web.js',
  'test/distributed/harness/scenario-host-topology.js',
  'test/distributed/harness/scenario-outcome.js',
  'test/distributed/harness/scenario-setup-breakdown-renderer.js',
  'test/distributed/harness/startup-readiness-evidence.js',
  'test/distributed/harness/tidb-reference-lifecycle.js',
  'test/distributed/harness/tidb-reference-physical-placement-proof.js',
  'test/distributed/harness/trace-artifact-recorder.js',
  'test/distributed/harness/yugabyte-ignite-comparison-static-web.js',
  'test/distributed/reference-client/lagrange-delivery-observer.js',
  'test/distributed/reference-client/lagrange-new-order-contention-observer.js',
  'test/distributed/reference-client/lagrange-oltp-adapter.js',
  'test/distributed/reference-client/lagrange-oltp-state-snapshot.js',
  'test/distributed/reference-client/lagrange-payment-observer.js',
  'test/distributed/reference-client/lagrange-retryable-conflict-probe.js',
  'test/distributed/reference-client/lagrange-visibility-probe.js',
  'test/distributed/reference-client/native-clients.js',
  'test/distributed/reference-client/oltp-adapter-contract.js',
  'test/distributed/reference-client/oltp-state-snapshot-shared.js',
  'test/distributed/reference-client/pg-wire-client.js',
  'test/distributed/reference-client/postgresql-oltp-adapter.js',
  'test/distributed/reference-client/retryable-conflict-probe.js',
  'test/distributed/reference-client/tidb-delivery-observer.js',
  'test/distributed/reference-client/tidb-new-order-contention-observer.js',
  'test/distributed/reference-client/tidb-oltp-adapter.js',
  'test/distributed/reference-client/tidb-oltp-state-snapshot.js',
  'test/distributed/reference-client/tidb-payment-observer.js',
  'test/distributed/reference-client/tidb-retryable-conflict-probe.js',
  'test/distributed/reference-client/tidb-visibility-probe.js',
  'test/distributed/scenarios/postgres-baseline-node-admission.js',
  'test/distributed/scenarios/scenario-a-delivery-lagrange.js',
  'test/distributed/scenarios/scenario-a-durability-lagrange.js',
  'test/distributed/scenarios/scenario-a-failure-atomicity-lagrange.js',
  'test/distributed/scenarios/scenario-a-lagrange-shared.js',
  'test/distributed/scenarios/scenario-a-new-order-contention-lagrange.js',
  'test/distributed/scenarios/scenario-a-order-status-lagrange.js',
  'test/distributed/scenarios/scenario-a-payment-lagrange.js',
  'test/distributed/scenarios/scenario-a-retryable-conflict-lagrange.js',
  'test/distributed/scenarios/scenario-a-semantic-proof-journey.js',
  'test/distributed/scenarios/scenario-a-stock-level-lagrange.js',
  'test/distributed/scenarios/scenario-a-visibility-lagrange.js',
]);
const BENCHMARK_PRODUCER_PATHSPECS = Object.freeze([
  ...BENCHMARK_CORPUS_PATHS,
  ...BENCHMARK_PUBLICATION_PRODUCER_PATHS,
]);
const LIST_PRODUCERS_FLAG = '--list-producers';
const CHECK_STAGED_CLEAN_FLAG = '--check-staged-clean';
const GIT_LS_FILES_UNTRACKED_ARGUMENTS = Object.freeze([
  'ls-files',
  '--others',
  '--exclude-standard',
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
  USAGE:
    'usage: check-pushed-benchmark-freshness.js ' +
    '(<ref-lines-file> | --list-producers | --check-staged-clean)\n',
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
  UNSTAGED_HEADER:
    'pre-commit: benchmark artifact regeneration needs data/tidb-comparison and ' +
    'docs/benchmarks to match the staged index (including benchmark generator inputs)\n',
  UNSTAGED_ITEM_PREFIX: 'pre-commit: stage/stash or remove: ',
  UNSTAGED_BYPASS: 'pre-commit: WIP bypass: LAGRANGE_SKIP_INVENTORY_REGEN=1 git commit\n',
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

function checkStagedBenchmarkInputsClean(root) {
  const env = gitEnv();
  const unstaged = nonEmptyLines(execGit(
    [GIT_C_FLAG, root, ...GIT_DIFF_NAME_ONLY_ARGUMENTS,
      GIT_DOUBLE_DASH, ...BENCHMARK_PRODUCER_PATHSPECS],
    {encoding: UTF8, env},
  ));
  const untracked = nonEmptyLines(execGit(
    [GIT_C_FLAG, root, ...GIT_LS_FILES_UNTRACKED_ARGUMENTS,
      GIT_DOUBLE_DASH, ...BENCHMARK_CORPUS_PATHS],
    {encoding: UTF8, env},
  ));
  const dirty = [...new Set([...unstaged, ...untracked])].sort();
  if (dirty.length === 0) return 0;
  process.stdout.write(TEXT.UNSTAGED_HEADER);
  for (const item of dirty) {
    process.stdout.write(`${TEXT.UNSTAGED_ITEM_PREFIX}${item}${NEWLINE}`);
  }
  process.stdout.write(TEXT.UNSTAGED_BYPASS);
  return EXIT_FAILURE;
}

function main(argv) {
  const firstArg = argv[ARGV_REF_LINES_INDEX];
  if (firstArg === LIST_PRODUCERS_FLAG) {
    process.stdout.write(`${arrayJoin(BENCHMARK_PUBLICATION_PRODUCER_PATHS, NEWLINE)}${NEWLINE}`);
    return 0;
  }
  if (firstArg === CHECK_STAGED_CLEAN_FLAG) {
    return checkStagedBenchmarkInputsClean(repoRoot());
  }
  const refLinesFile = firstArg;
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

const isDirectCli = Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  try {
    process.exitCode = main(process.argv);
  } catch (error) {
    process.stderr.write(`${TEXT.ERROR_PREFIX}${error?.message ?? String(error)}${NEWLINE}`);
    process.exitCode = EXIT_FAILURE;
  }
}

export {
  BENCHMARK_CORPUS_PATHS,
  BENCHMARK_PRODUCER_PATHSPECS,
  BENCHMARK_PUBLICATION_PRODUCER_PATHS,
};
