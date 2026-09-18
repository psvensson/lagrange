#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';

import {ACTION, authorizeAction, isAuthorized} from './action-authority.js';
import {fileURLToPath} from 'node:url';

import {
  ACCEPTANCE_PROOF,
} from './checks/acceptance-proof-manifest-constants.js';
import {
  PROOF_SCOPE_PATH,
  WORKSPACE_INJECTION_ENV,
} from './checks/change-selection-constants.js';
import {parseLaneArgs, planLane} from './plan-test-lane.js';

const ZERO_SHA = '0'.repeat(40);
const PIPE_STDIO = 'pipe';
const INHERIT_STDIO = 'inherit';

// --- Stage feedback + loud failure (operator request 2026-09-02) --------
// The publisher announces each stage with elapsed time on stderr, and a
// failure names the stage it died in instead of surfacing only a stack.
const PUBLISH_STARTED_AT_MS = Date.now();
const PUBLISH_STAGE_PREFIX = '[publish +';
const PUBLISH_STAGE_MARKER = 's] >> ';
const PUBLISH_FAILURE_MARKER = 's] XX FAILED in stage: ';
const PUBLISH_LINE_PREFIX = '[publish] ';
const PUBLISH_INITIAL_STAGE = 'preflight';
const PUBLISH_MILLISECONDS_PER_SECOND = 1000;
const PUBLISH_NOT_PUSHED_NOTE =
  'nothing was pushed unless the failed stage is AFTER ' +
  '"pushing HEAD to origin/main"';
const NEWLINE = '\n';
const PUBLISH_SHORT_SHA_LENGTH = 9;
const PUBLISH_STAGE_LABEL = Object.freeze({
  RESOLVE_HEAD: 'resolving HEAD and querying the remote main SHA',
  VALIDATE_REQUEST: 'validating the publish request for head ',
  CREATE_WORKTREE: 'creating the exact-HEAD gate worktree',
  RUN_GATE: 'running the pre-push gate in the worktree (LONG: the gate ' +
    'prints its own [pre-push] stage lines below)',
  PUSH: 'pushing HEAD to origin/main',
  RECEIPT: 'push verified on the remote; writing the publish receipt for ',
  DONE: 'done - pushed and receipted',
});
let currentPublishStage = PUBLISH_INITIAL_STAGE;
function publishElapsedSeconds() {
  return Math.round(
    (Date.now() - PUBLISH_STARTED_AT_MS) / PUBLISH_MILLISECONDS_PER_SECOND);
}
function publishStage(label) {
  currentPublishStage = label;
  process.stderr.write(
    PUBLISH_STAGE_PREFIX + publishElapsedSeconds() +
    PUBLISH_STAGE_MARKER + label + NEWLINE);
}
function reportPublishFailure(error) {
  process.stderr.write(
    NEWLINE +
    PUBLISH_STAGE_PREFIX + publishElapsedSeconds() +
    PUBLISH_FAILURE_MARKER + currentPublishStage + NEWLINE +
    PUBLISH_LINE_PREFIX + (error?.message || String(error)) + NEWLINE +
    PUBLISH_LINE_PREFIX + PUBLISH_NOT_PUSHED_NOTE + NEWLINE);
}
// ------------------------------------------------------------------------

const SELF_HOSTED_RUNNER_MARKER = '[ci:self-hosted]';
const ARG_SEPARATOR = ' ';
const GIT_COMMAND = 'git';
const RUNNER_GITHUB = 'github';
const RUNNER_SELF_HOSTED = 'self-hosted';
const INVALID_RUNNER_ERROR = 'publish: --runner must be github|self-hosted';
const FAST_FORWARD_ERROR = 'publish: HEAD is not a fast-forward of origin/main';
const RECEIPT_DIRECTORY = 'publish-receipts';
const WORKTREE_COMMAND = 'worktree';
const WORKTREE_ADD = 'add';
const WORKTREE_REMOVE = 'remove';
const QUIET_ARGUMENT = '--quiet';
const DETACH_ARGUMENT = '--detach';
const FORCE_ARGUMENT = '--force';
const ENABLED_ENV_VALUE = '1';
const BASH_COMMAND = 'bash';
const PRE_PUSH_HOOK = '.githooks/pre-push';
const PUSH_COMMAND = 'push';
const ORIGIN_REMOTE = 'origin';
const MAIN_BRANCH = 'main';
const FETCH_COMMAND = 'fetch';
const HEAD_TO_MAIN_REFSPEC = 'HEAD:refs/heads/main';
const RUNNER_ARGUMENT = '--runner';
const FIXES_RED_ARGUMENT = '--fixes-red';
const RED_REPAIR_REFUSED_PREFIX = 'publish: repairing a red shared branch is ';
const ROUTING_REFUSED_PREFIX = 'publish: routing this push to ';
const ROUTING_REFUSED_SUFFIX = '. It requires ';
const PUSH_REFUSED_PREFIX = 'publish: pushing the gated head is ';
// The whole corpus is a fact about the commit, so a gate run that proved it
// leaves a durable receipt - but only AFTER the push, when the commit is on
// origin/main and the receipt's own push is exempt from the gate. Recording
// inside the gate re-entered it and always timed out
// (proof-ref-push-fast-path). The gate's scope file is the fact: the run that
// decided writes it, and it names the sha it proved.
const PROOF_AUTHORITY_SCRIPT = 'scripts/proof-authority.js';
const PROOF_RECORD_COMMAND = 'record';
const CORPUS_PROOF_ID = 'corpus-full-v1';
const RECORD_TIMEOUT_MS = 60000;
const FIELD_FULL_CORPUS = 'fullCorpus';
const FIELD_SHA = 'sha';
const RECEIPT_RECORDED_PREFIX = 'publish: whole-corpus receipt recorded for ';
const RECEIPT_SKIPPED_PREFIX =
  'publish: no whole-corpus receipt (the gate proved a cone, not the corpus)';
const RECEIPT_FAILED_PREFIX = 'publish: whole-corpus receipt not recorded: ';
const RECEIPT_NO_REASON = 'the authority gave no reason';
// Retention, on the routine path. test-output/ reached 6.7 GB in July because
// the pruner existed but was never invoked; the fix wired it into the
// rolling-restart stat-gate only, so it grew to 40 GB by September the same
// way. Every publish now runs it, with the stat-gate's own history-safe
// policy: 7 days, and floors of 24 reports and playbacks - deliberately above
// the harness's 20-report comparison window, so retention can never degrade a
// baseline comparison.
const PRUNE_SCRIPT = 'scripts/prune-test-output.js';
const PRUNE_ARGUMENTS = Object.freeze([
  '--apply', '--keep-days', '7',
  '--keep-reports', '24', '--keep-report-playbacks', '24',
]);
const PRUNE_TIMEOUT_MS = 300000;
const PRUNE_DONE_PREFIX = 'publish: test-output retention: ';
const PRUNE_FAILED_PREFIX = 'publish: test-output retention skipped: ';
const PRUNE_SIGNAL_PREFIX = 'the pruner was stopped by ';
const PRUNE_NO_REASON = 'the pruner gave no reason';
const RED_REPAIR_REFUSED_SUFFIX = '. It requires ';
const REASON_ARGUMENT = '--reason';
const STATUS_COMMAND = 'status';
const PORCELAIN_ARGUMENT = '--porcelain';
const DIRTY_GATE_ERROR =
  'publish: pre-push gate mutated the exact-HEAD worktree';
const MISSING_VALUE_ERROR = 'publish: option requires a value: ';
const ALLOW_MISSING_DATA_ARGUMENT = '--allow-missing-data';
const DATA_DIRECTORY = 'data';
const DATA_ABSENT_ERROR_PREFIX = 'publish: data/ is absent in ';
const DATA_ABSENT_ERROR_SUFFIX =
  '; symlink it from the main checkout (ln -s <main>/data data) or run the ' +
  `MovieLens fetch, or pass ${ALLOW_MISSING_DATA_ARGUMENT}`;
const LINK_NOTICE_PREFIX = 'publish: linking ';
const LINK_NOTICE_ARROW = ' -> ';
const LINK_NOTICE_ABSENT = '(absent)';
const LINK_NOTICE_SEPARATOR = ', ';
// A fresh `git worktree` carries no gitignored content, so the gate would miss
// both the workspace installation and the digest-pinned MovieLens dataset that
// CI fetches before its own gate. Expose each read-only tree for the gate run
// and withdraw it before the mutation check.
const GATE_WORKSPACE_DIRECTORIES = ['node_modules', 'data'];
const INJECTION_SEPARATOR = ',';
// Where a failed gate's diagnosis is kept. The gate runs inside a throwaway
// worktree and writes its acceptance receipt there, so cleanup destroyed the
// one artifact naming the failing command - three ~17-minute runs on
// 2026-08-19 were spent rediscovering what a retained receipt would have said.
const GATE_DIAGNOSTIC_DIR = path.join('test-output', 'push-gate');
const ACCEPTANCE_OUTPUT_DIR = path.join('test-output', 'acceptance');
const REPORT_SUFFIX = '.report.json';
const UTF8 = 'utf8';
const REMOTE_MAIN_REF = 'refs/heads/main';
const GATE_DESCRIPTION = `${BASH_COMMAND} ${PRE_PUSH_HOOK}`;
const RETAINED_PREFIX = 'publish: gate diagnostics retained in ';
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySort = Function.call.bind(Array.prototype.sort);
const arrayFind = Function.call.bind(Array.prototype.find);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const DEPENDENCY_LINK_ERROR =
  'publish: pre-push gate mutated the temporary dependency link';
const DIRECTORY_LINK_TYPE = 'dir';
const FILE_LINK_TYPE = 'file';

function checked(run, command, args, options = {}) {
  const result = run(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    input: options.input,
    encoding: 'utf8',
    // Stream long-running child output (the gate's own [pre-push] stage
    // lines) straight to the operator instead of buffering it into the
    // captured result - a 30-minute silent gate is not a user experience
    // (operator report 2026-09-02). stdin stays a pipe for `input`.
    ...(options.streamOutput === true ?
      {stdio: [PIPE_STDIO, INHERIT_STDIO, INHERIT_STDIO]} :
      {}),
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && options.allowFailure !== true) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(
      `${command} ${args.join(ARG_SEPARATOR)} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function output(run, command, args, options = {}) {
  return String(checked(run, command, args, options).stdout || '').trim();
}

function git(run, root, args, options = {}) {
  return output(run, GIT_COMMAND, args, {cwd: root, ...options});
}

function remoteMainSha(run, root) {
  const line = git(run, root, ['ls-remote', 'origin', 'refs/heads/main']);
  return line ? line.split(/\s+/u)[0] : ZERO_SHA;
}

// Which runner a push routes to is this module's business; whether routing
// away from the default is authorized is not. The marker in the reviewed head
// and the caller's explicit request are the two halves of that authority, and
// the authority requires both.
function resolvePublishRunner(headMessage, runner) {
  if (runner && runner !== RUNNER_GITHUB && runner !== RUNNER_SELF_HOSTED) {
    throw new Error(INVALID_RUNNER_ERROR);
  }
  const marked = headMessage.includes(SELF_HOSTED_RUNNER_MARKER);
  const requested = runner === RUNNER_SELF_HOSTED;
  if (!marked && !requested) return RUNNER_GITHUB;
  const decision = authorizeAction({
    action: ACTION.ROUTE_SELF_HOSTED_RUNNER,
    signal: {action: ACTION.ROUTE_SELF_HOSTED_RUNNER, requested},
    context: {headCarriesMarker: marked},
  });
  if (!isAuthorized(decision)) {
    throw new Error(`${ROUTING_REFUSED_PREFIX}${RUNNER_SELF_HOSTED} is ` +
      `${decision.outcome}: ${decision.because}${ROUTING_REFUSED_SUFFIX}` +
      `${decision.requires}`);
  }
  return RUNNER_SELF_HOSTED;
}

export function validatePublishRequest({headMessage, runner, fixesRed, reason,
  remoteSha}) {
  const routedRunner = resolvePublishRunner(headMessage, runner);
  // Whether a red-branch repair is authorized is not the publisher's decision.
  // It presents the operator's signal and the context it already knows, and
  // acts on the answer.
  if (fixesRed) {
    const decision = authorizeAction({
      action: ACTION.PUBLISH_HEAD_ON_RED,
      signal: {action: ACTION.PUBLISH_HEAD_ON_RED, head: fixesRed, reason},
      context: {redHead: remoteSha},
    });
    if (!isAuthorized(decision)) {
      throw new Error(`${RED_REPAIR_REFUSED_PREFIX}${decision.outcome}: ` +
        `${decision.because}${RED_REPAIR_REFUSED_SUFFIX}${decision.requires}`);
    }
  }
  return routedRunner;
}

// Paths a remote-only commit may touch for the publisher to rebase over it
// on its own: the nightly formation-health record, committed to main by the
// workflow token (owner decision 2026-09-13). Anything else is a real
// divergence the operator resolves.
const INERT_REBASE_PATHS = Object.freeze(['data/formation-health/trend.ndjson']);
const REBASE_COMMAND = 'rebase';
const REV_PARSE_COMMAND = 'rev-parse';
const HEAD_REF = 'HEAD';
const REV_LIST_COMMAND = 'rev-list';
// -m so a merge commit reports its paths too (over-reporting is the safe side).
const DIFF_TREE_ARGUMENTS = Object.freeze(['diff-tree', '--no-commit-id', '--name-only', '-r', '-m']);
const REBASE_ABORT_ARGUMENT = '--abort';
const TRACKED_STATUS_ARGUMENTS = Object.freeze(['status', '--porcelain', '--untracked-files=no']);
const DIRTY_BEFORE_REBASE_ERROR = 'publish: origin/main advanced by inert data commits, but the working tree has uncommitted tracked changes; commit or stash them so HEAD can be rebased over the nightly record';
const REBASE_CONFLICT_ERROR = 'publish: rebasing HEAD over the inert data commits on origin/main conflicted (a local commit also touches the inert path); the rebase was aborted - resolve by hand';
const REBASED_MESSAGE_PREFIX = 'publish: rebased HEAD over ';
const REBASED_MESSAGE_SUFFIX = ' inert data commit(s) on origin/main';

// Whether every commit origin/main carries beyond head touches only inert
// data paths.
function remoteAdvanceIsInert(run, root, head) {
  const listed = git(run, root, [REV_LIST_COMMAND, `${head}..${ORIGIN_REMOTE}/${MAIN_BRANCH}`]);
  const shas = listed ? listed.split(NEWLINE) : [];
  for (const sha of shas) {
    const changed = git(run, root, [...DIFF_TREE_ARGUMENTS, sha]);
    const paths = changed ? changed.split(NEWLINE) : [];
    if (paths.some((candidate) => !INERT_REBASE_PATHS.includes(candidate))) {
      return {inert: false, count: shas.length};
    }
  }
  return {inert: shas.length > 0, count: shas.length};
}

// A fast-forward, or a rebase of the local commits over inert data commits
// only; anything else refuses. Returns the head to publish and the remote sha
// it must fast-forward.
function ensureFastForward(run, root, remoteSha, head) {
  if (remoteSha === ZERO_SHA) return {head, remoteSha};
  checked(run, GIT_COMMAND,
    [FETCH_COMMAND, QUIET_ARGUMENT, ORIGIN_REMOTE, MAIN_BRANCH], {cwd: root});
  const result = checked(
    run, 'git', ['merge-base', '--is-ancestor', remoteSha, head],
    {cwd: root, allowFailure: true},
  );
  if (result.status === 0) return {head, remoteSha};
  const advance = remoteAdvanceIsInert(run, root, head);
  if (!advance.inert) throw new Error(FAST_FORWARD_ERROR);
  if (git(run, root, [...TRACKED_STATUS_ARGUMENTS])) {
    throw new Error(DIRTY_BEFORE_REBASE_ERROR);
  }
  const rebase = checked(run, GIT_COMMAND,
    [REBASE_COMMAND, QUIET_ARGUMENT, `${ORIGIN_REMOTE}/${MAIN_BRANCH}`],
    {cwd: root, allowFailure: true});
  if (rebase.status !== 0) {
    checked(run, GIT_COMMAND, [REBASE_COMMAND, REBASE_ABORT_ARGUMENT],
      {cwd: root, allowFailure: true});
    throw new Error(REBASE_CONFLICT_ERROR);
  }
  process.stdout.write(
    `${REBASED_MESSAGE_PREFIX}${advance.count}${REBASED_MESSAGE_SUFFIX}${NEWLINE}`);
  return {head: git(run, root, [REV_PARSE_COMMAND, HEAD_REF]),
    remoteSha: git(run, root, [REV_PARSE_COMMAND, `${ORIGIN_REMOTE}/${MAIN_BRANCH}`])};
}

function ciRunUrl(run, root, head) {
  const result = checked(run, 'gh', [
    'run', 'list', '--workflow', 'ci.yml', '--commit', head, '--limit', '1',
    '--json', 'url', '--jq', '.[0].url',
  ], {cwd: root, allowFailure: true});
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function receiptPath(run, root, head) {
  const common = git(run, root, ['rev-parse', '--git-common-dir']);
  const commonDir = path.resolve(root, common);
  return path.join(commonDir, RECEIPT_DIRECTORY, `${head}.json`);
}

// Fail fast, before the worktree exists: a fresh quest worktree has no
// gitignored data/ (populated by the MovieLens fetch), and the gate only
// discovered that ~15 minutes in when the dataset tests went red. The notice
// names every link the gate will make so the caller can see what it reads.
function assertWorkspaceDependencySources(root, args, log) {
  const notice = GATE_WORKSPACE_DIRECTORIES.map((directory) => {
    const source = path.join(root, directory);
    return `${directory}${LINK_NOTICE_ARROW}` +
      (fs.existsSync(source) ? source : LINK_NOTICE_ABSENT);
  }).join(LINK_NOTICE_SEPARATOR);
  log(`${LINK_NOTICE_PREFIX}${notice}${NEWLINE}`);
  if (!fs.existsSync(path.join(root, DATA_DIRECTORY)) &&
      !isAuthorized(authorizeAction({
        action: ACTION.PUBLISH_WITHOUT_DATASET,
        signal: args.allowMissingData === true ?
          {action: ACTION.PUBLISH_WITHOUT_DATASET, missing: DATA_DIRECTORY} : null,
      }))) {
    throw new Error(`${DATA_ABSENT_ERROR_PREFIX}${root}${DATA_ABSENT_ERROR_SUFFIX}`);
  }
}

// A workspace directory may already exist in the fresh worktree when some of
// its content is tracked (data/releases holds committed publication
// receipts). Then the directory itself is real and only its gitignored
// entries - the dataset trees - are linked, one by one; a whole-directory
// link would collide with the checkout (EEXIST) and hide the tracked files.
function linkWorkspaceDependencies(root, worktree) {
  const links = [];
  for (const directory of GATE_WORKSPACE_DIRECTORIES) {
    const source = path.join(root, directory);
    if (!fs.existsSync(source)) continue;
    const link = path.join(worktree, directory);
    if (!fs.existsSync(link)) {
      fs.symlinkSync(source, link, DIRECTORY_LINK_TYPE);
      links.push({link, source: fs.realpathSync(source)});
      continue;
    }
    for (const entry of fs.readdirSync(source)) {
      const entrySource = path.join(source, entry);
      const entryLink = path.join(link, entry);
      if (fs.existsSync(entryLink)) continue;
      fs.symlinkSync(entrySource, entryLink,
        fs.statSync(entrySource).isDirectory() ? DIRECTORY_LINK_TYPE : FILE_LINK_TYPE);
      links.push({link: entryLink, source: fs.realpathSync(entrySource)});
    }
  }
  return links;
}

function assertWorkspaceDependencyLinks(dependencyLinks) {
  for (const dependencyLink of dependencyLinks) {
    let valid = false;
    try {
      valid = fs.lstatSync(dependencyLink.link).isSymbolicLink() &&
        fs.realpathSync(dependencyLink.link) === dependencyLink.source;
    } catch {
      valid = false;
    }
    if (!valid) throw new Error(DEPENDENCY_LINK_ERROR);
  }
}

// Copy the failing gate's receipt, and the artifact of its FIRST failing
// command, out of the worktree before cleanup removes them. Best-effort by
// design: a diagnostic that throws would replace the real gate error with its
// own, which is exactly the failure this function exists to prevent.
function retainGateDiagnostics(root, worktree, head) {
  try {
    const source = path.join(worktree, ACCEPTANCE_OUTPUT_DIR);
    const reports = arrayFilter(fs.readdirSync(source),
      (name) => stringEndsWith(name, REPORT_SUFFIX));
    if (reports.length === 0) return null;
    const newest = arraySort(reports)[reports.length - 1];
    const destination = path.join(root, GATE_DIAGNOSTIC_DIR, head);
    fs.mkdirSync(destination, {recursive: true});
    fs.copyFileSync(
      path.join(source, newest), path.join(destination, newest));
    const report = JSON.parse(
      fs.readFileSync(path.join(source, newest), UTF8));
    const failing = arrayFind(report.commands || [],
      (command) => command.status === ACCEPTANCE_PROOF.STATUS_FAIL);
    const artifact = failing &&
      (failing.artifactIdentity || failing.requiredArtifact || {}).path;
    if (artifact) {
      const target = path.join(destination, path.basename(artifact));
      fs.copyFileSync(path.join(worktree, artifact), target);
    }
    return destination;
  } catch {
    return null;
  }
}

function gateExactHead(run, root, worktree, head, remoteBefore, args) {
  const dependencyLinks = linkWorkspaceDependencies(root, worktree);
  const gateEnv = {...process.env};
  // Declare what this layer injected. Repository code decides what must be
  // proved; the workspace only says which paths it put there that git will
  // otherwise report as untracked repository content.
  gateEnv[WORKSPACE_INJECTION_ENV] =
    GATE_WORKSPACE_DIRECTORIES.join(INJECTION_SEPARATOR);
  if (args.fixesRed) gateEnv.LAGRANGE_PUSH_ON_RED = ENABLED_ENV_VALUE;
  const refLine = `HEAD ${head} refs/heads/main ${remoteBefore}\n`;
  checked(run, BASH_COMMAND, [PRE_PUSH_HOOK], {
    cwd: worktree,
    env: gateEnv,
    input: refLine,
    streamOutput: true,
  });
  assertWorkspaceDependencyLinks(dependencyLinks);
  for (const dependencyLink of dependencyLinks) fs.unlinkSync(dependencyLink.link);
  const gateStatus = git(run, worktree, [
    STATUS_COMMAND, PORCELAIN_ARGUMENT,
  ]);
  if (gateStatus) {
    throw new Error(`${DIRTY_GATE_ERROR}${NEWLINE}${gateStatus}`);
  }
  linkWorkspaceDependencies(root, worktree);
  return gateEnv;
}

function pushGatedHead(run, root, worktree, head, gateEnv, queryCi) {
  // The push itself is the outward action. It carries a standing authority
  // rather than a per-push signal, but it asks like everything else, so there
  // is one place the answer comes from.
  const decision = authorizeAction({action: ACTION.PUBLISH_HEAD});
  if (!isAuthorized(decision)) {
    throw new Error(`${PUSH_REFUSED_PREFIX}${decision.outcome}: ` +
      `${decision.because}`);
  }
  checked(run, GIT_COMMAND, [PUSH_COMMAND, ORIGIN_REMOTE, HEAD_TO_MAIN_REFSPEC], {
    cwd: worktree,
    env: {...gateEnv, LAGRANGE_PUSH_SKIP_TESTS: ENABLED_ENV_VALUE},
  });
  const remoteAfter = remoteMainSha(run, root);
  if (remoteAfter !== head) {
    throw new Error(
      `publish: remote verification failed (expected ${head}, got ${remoteAfter})`,
    );
  }
  recordProvedCorpus(run, root, worktree, head);
  pruneTestOutput(run, root);
  const ciUrl = queryCi === false ? '' : ciRunUrl(run, root, head);
  return {ciUrl, remoteAfter};
}

/**
 * Apply the retention policy to this checkout's test-output/ and .tap/, after
 * the publish succeeded. Bookkeeping, so bounded and never raised: a failed
 * prune is reported and the publish stands.
 * @param {Function} run
 * @param {string} root
 * @param {Function} [write]
 * @return {boolean} whether the prune completed
 */
export function pruneTestOutput(run, root,
  write = (value) => process.stdout.write(`${value}\n`)) {
  let pruned = null;
  try {
    pruned = run(process.execPath, [PRUNE_SCRIPT, ...PRUNE_ARGUMENTS],
      {cwd: root, encoding: UTF8, timeout: PRUNE_TIMEOUT_MS});
  } catch (error) {
    write(`${PRUNE_FAILED_PREFIX}${error.message}`);
    return false;
  }
  if (pruned?.status === 0) {
    const summary = String(pruned.stdout || '').trim().split('\n').at(0) || '';
    write(`${PRUNE_DONE_PREFIX}${summary}`);
    return true;
  }
  write(`${PRUNE_FAILED_PREFIX}${pruneFailureReason(pruned)}`);
  return false;
}

// A spawn timeout returns no status and no output: its error and signal are
// the only reason there is (verifier round 1).
function pruneFailureReason(pruned) {
  if (pruned?.error?.message) return pruned.error.message;
  if (pruned?.signal) return `${PRUNE_SIGNAL_PREFIX}${pruned.signal}`;
  return String(pruned?.stderr || pruned?.stdout || '').trim() || PRUNE_NO_REASON;
}

/**
 * Record the gate's whole-corpus proof for the commit just published, when
 * that is what the gate actually ran. Best effort: the publish already
 * succeeded and the receipt is bookkeeping, so a failure is reported and
 * never raised. Reads the gate run's own scope file rather than inferring.
 * @param {Function} run
 * @param {string} root
 * @param {string} worktree the exact-HEAD gate worktree
 * @param {string} head the sha now on origin/main
 * @param {Function} [write]
 * @return {boolean} whether a receipt is now held
 */
export function recordProvedCorpus(run, root, worktree, head,
  write = (value) => process.stdout.write(`${value}\n`)) {
  let scope = null;
  try {
    scope = JSON.parse(fs.readFileSync(
      path.join(worktree, PROOF_SCOPE_PATH), UTF8));
  } catch {
    scope = null;
  }
  if (!scope || typeof scope !== 'object' ||
      !Object.hasOwn(scope, FIELD_FULL_CORPUS) ||
      !Object.hasOwn(scope, FIELD_SHA) ||
      scope[FIELD_FULL_CORPUS] !== true || scope[FIELD_SHA] !== head) {
    write(RECEIPT_SKIPPED_PREFIX);
    return false;
  }
  // Reported, never raised, structurally: the push is already verified by
  // now, so a throwing runner must not fail a finished publish or skip the
  // publication receipt (verifier round 2).
  let recorded = null;
  try {
    recorded = run(process.execPath,
      [PROOF_AUTHORITY_SCRIPT, PROOF_RECORD_COMMAND, CORPUS_PROOF_ID, head],
      {cwd: root, encoding: UTF8, timeout: RECORD_TIMEOUT_MS});
  } catch (error) {
    write(`${RECEIPT_FAILED_PREFIX}${error.message}`);
    return false;
  }
  if (recorded?.status === 0) {
    write(`${RECEIPT_RECORDED_PREFIX}${head}`);
    return true;
  }
  write(`${RECEIPT_FAILED_PREFIX}${String(
    recorded?.stderr || recorded?.stdout || RECEIPT_NO_REASON).trim()}`);
  return false;
}

function buildPublishReceipt(observed, args) {
  return {
    schemaVersion: 1,
    head: observed.head,
    remote: ORIGIN_REMOTE,
    remoteRef: REMOTE_MAIN_REF,
    remoteBefore: observed.remoteBefore,
    remoteAfter: observed.remoteAfter,
    gate: GATE_DESCRIPTION,
    runner: observed.runner,
    fixesRed: args.fixesRed || null,
    reason: args.reason || null,
    ciUrl: observed.ciUrl || null,
    publishedAt: new Date().toISOString(),
  };
}

// --- The local corpus (owner rule, 2026-09-18) ------------------------------
// The whole corpus is proved on local machines, never on a GitHub-hosted
// runner while a local alternative exists. A publish whose gate proved a cone
// starts, after its push, a detached run of exactly the rest of the corpus for
// the pushed commit - what the cone did not prove at that commit - in a fresh
// exact checkout, where placement spreads it over the lab machines. Green, it
// records the whole-corpus receipt; red or lost, the next publish says so
// first. Only a newer head that reached main supersedes a running one, after
// its push is verified - as the hosted canary's cancel-in-progress did - so a
// publish that fails leaves the proof of what is on main running. It runs
// from the main checkout, never from a quest worktree that may be removed
// while it runs, and waits for thermal headroom before it starts. None of
// this can fail a publish.
const LOCAL_CORPUS_ARGUMENT = '--local-corpus';
const LOCAL_CORPUS_DIRECTORY = 'lagrange-local-corpus';
const LOCAL_CORPUS_KEEP = 20;
const LOCAL_CORPUS_COMMON_DIR = Object.freeze(['rev-parse', '--git-common-dir']);
const LOCAL_CORPUS_GIT_DIR_NAME = '.git';
const LOCAL_CORPUS_STATE = Object.freeze({
  RUNNING: 'running', GREEN: 'green', RED: 'red', SUPERSEDED: 'superseded', LOST: 'lost',
});
const LOCAL_CORPUS_SCRIPT = 'test:all';
const LOCAL_CORPUS_RUNNER = 'scripts/run-classified-test-files.js';
const LOCAL_CORPUS_GATE = 'scripts/checks/push-gate-corpus-worktree.js';
const LOCAL_CORPUS_THERMAL = 'scripts/checks/wait-for-thermal-headroom.js';
const LOCAL_CORPUS_GATE_FLAG = '--gate';
const LOCAL_CORPUS_RUN_FLAG = '--run';
const LOCAL_CORPUS_SHELL = 'sh';
const LOCAL_CORPUS_SHELL_COMMAND = '-c';
// $1 the file list, $2 this node. The convergence probes follow, observed as
// the hosted canary observed them: their result never decides the verdict.
const LOCAL_CORPUS_RUN_SCRIPT =
  `"$2" ${LOCAL_CORPUS_RUNNER} --keep-going --stdin < "$1"; status=$?; ` +
  'npm run -s test:convergence-probes || ' +
  'echo "local corpus: convergence probes red (observed, never the verdict)"; ' +
  'exit "$status"';
const LOCAL_CORPUS_RETRY_ENV = 'LAGRANGE_RETRY_FAILED_ONCE';
const LOCAL_CORPUS_FIELD_TESTS = 'testPaths';
const LOCAL_CORPUS_WORD = /\s+/u;
const LOCAL_CORPUS_SIGNAL = 'SIGTERM';
const LOCAL_CORPUS_SUFFIX = Object.freeze({STATE: '.json', LOG: '.log', FILES: '.files'});
const LOCAL_CORPUS_PROC = Object.freeze({DIRECTORY: '/proc', COMMAND: 'cmdline'});
const LOCAL_CORPUS_PS = Object.freeze(['ps', '-o', 'command=', '-p']);
const LOCAL_CORPUS_OWED = Object.freeze({
  REST: 'the rest of the corpus',
  NOTHING: 'nothing: the gate proved the whole corpus',
});
const LOCAL_CORPUS_ERROR_EVENT = 'error';
const LOCAL_CORPUS_TEXT = Object.freeze({
  PREFIX: 'publish: local corpus ',
  STARTED: 'started for ',
  NOT_STARTED: 'not started: ',
  NO_SCOPE: 'the gate left no proof scope for this commit',
  OTHER_COMMIT: 'the proof scope names another commit',
  NO_CONE: 'the proof scope lists no cone',
  FILES: ' file(s), log ',
  RED_BANNER: 'publish: !!! the local corpus was RED for ',
  LOST_BANNER: 'publish: !!! the local corpus was LOST for ',
  SUPERSEDED_BY: 'superseded by ',
  NEWER_HEAD: ', a newer head on main',
  LOST: 'its process ended without a verdict',
  HOT: 'the machine stayed too hot to start it',
  UNRECORDED: 'receipt not recorded: ',
  BOOKKEEPING: 'bookkeeping failed: ',
  NO_RUNNER: ' does not run ',
  ALREADY: 'already ',
  FOR_THIS_COMMIT: ' for this commit',
});
// A run of the very head being published that still counts: one that is
// alive, or one that already proved it.
const LOCAL_CORPUS_COVERING = new Set([LOCAL_CORPUS_STATE.RUNNING, LOCAL_CORPUS_STATE.GREEN]);

// Where the local corpus keeps its records (the git common dir, shared by
// every worktree) and where it runs from (the main checkout that holds it).
function localCorpusPlaces(run, root) {
  const common = path.resolve(root, git(run, root, [...LOCAL_CORPUS_COMMON_DIR]));
  return {
    stateDir: path.join(common, LOCAL_CORPUS_DIRECTORY),
    mainRoot: path.basename(common) === LOCAL_CORPUS_GIT_DIR_NAME ?
      path.dirname(common) : root,
  };
}

// Every record in the directory, newest first; a directory that cannot be read
// holds none.
function readLocalCorpusRecords(recordDir) {
  let names = [];
  try {
    names = fs.readdirSync(recordDir);
  } catch {
    names = [];
  }
  const records = [];
  for (const name of names) {
    if (!name.endsWith(LOCAL_CORPUS_SUFFIX.STATE)) continue;
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(recordDir, name), UTF8)));
    } catch {
      // A record half written or damaged is not a result.
    }
  }
  return records.sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));
}

function writeLocalCorpusState(stateDir, state) {
  fs.mkdirSync(stateDir, {recursive: true});
  const file = path.join(stateDir, `${state.sha}${LOCAL_CORPUS_SUFFIX.STATE}`);
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(state)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

/**
 * The files `npm run test:all` runs in a checkout: the classified runner's own
 * filter, read from package.json so the two cannot differ.
 * @param {string} checkout
 * @return {string[]}
 */
export function wholeCorpusFiles(checkout) {
  const manifest = JSON.parse(fs.readFileSync(path.join(checkout, 'package.json'), UTF8));
  const words = String(manifest.scripts?.[LOCAL_CORPUS_SCRIPT] || '').trim()
    .split(LOCAL_CORPUS_WORD);
  const at = words.indexOf(LOCAL_CORPUS_RUNNER);
  if (at < 0) {
    throw new Error(`${LOCAL_CORPUS_SCRIPT}${LOCAL_CORPUS_TEXT.NO_RUNNER}${LOCAL_CORPUS_RUNNER}`);
  }
  return planLane(checkout, parseLaneArgs(words.slice(at + 1)));
}

// What a pushed commit is owed after its gate: the rest of the corpus,
// nothing (the gate proved the whole corpus), or - named - why it cannot know.
function localCorpusOwed(scope, head) {
  if (!scope || typeof scope !== 'object') return LOCAL_CORPUS_TEXT.NO_SCOPE;
  if (scope[FIELD_SHA] !== head) return LOCAL_CORPUS_TEXT.OTHER_COMMIT;
  if (scope[FIELD_FULL_CORPUS] === true) return LOCAL_CORPUS_OWED.NOTHING;
  const listsCone = scope[FIELD_FULL_CORPUS] === false &&
    Array.isArray(scope[LOCAL_CORPUS_FIELD_TESTS]);
  return listsCone ? LOCAL_CORPUS_OWED.REST : LOCAL_CORPUS_TEXT.NO_CONE;
}

/**
 * What the gate's scope leaves owed at this commit, and when it is the rest of
 * the corpus, those files: what test:all runs minus what the cone proved.
 * @param {string} checkout the exact checkout the gate ran in
 * @param {string} head
 * @param {{scopeFile?: string, wholeCorpus?: Function}} [options]
 * @return {{owed: string, files: string[]}}
 */
export function localCorpusPlan(checkout, head,
  {scopeFile = path.join(checkout, PROOF_SCOPE_PATH), wholeCorpus = wholeCorpusFiles} = {}) {
  let scope;
  try {
    scope = JSON.parse(fs.readFileSync(scopeFile, UTF8));
  } catch {
    scope = undefined;
  }
  const owed = localCorpusOwed(scope, head);
  const proved = new Set(owed === LOCAL_CORPUS_OWED.REST ? scope[LOCAL_CORPUS_FIELD_TESTS] : []);
  const files = owed === LOCAL_CORPUS_OWED.REST ?
    wholeCorpus(checkout).filter((file) => !proved.has(file)) : [];
  return {owed, files};
}

/**
 * Start the local corpus for a pushed commit, detached; returns its pid.
 * @param {{root: string, stateDir: string, head: string, files: string[],
 *   spawnProcess?: Function, env?: Object, now?: number}} input
 * @return {number}
 */
export function startLocalCorpus({root, stateDir, head, files, spawnProcess = spawn,
  env = process.env, now = Date.now()}) {
  fs.mkdirSync(stateDir, {recursive: true});
  const base = path.join(stateDir, head);
  fs.writeFileSync(`${base}${LOCAL_CORPUS_SUFFIX.FILES}`, files.join(NEWLINE) + NEWLINE);
  const log = fs.openSync(`${base}${LOCAL_CORPUS_SUFFIX.LOG}`, 'w');
  const record = {sha: head, state: LOCAL_CORPUS_STATE.RUNNING, pid: null,
    files: files.length, startedAt: now, log: `${base}${LOCAL_CORPUS_SUFFIX.LOG}`};
  const child = spawnProcess(process.execPath,
    [fileURLToPath(import.meta.url), LOCAL_CORPUS_ARGUMENT, head], {
      cwd: root,
      // The gate's own retry policy, and a group of its own to supersede.
      env: {...env, [LOCAL_CORPUS_RETRY_ENV]: ENABLED_ENV_VALUE},
      detached: true,
      stdio: ['ignore', log, log],
    });
  fs.closeSync(log);
  // A child that could not start is lost, not an exception after the publish.
  child.on?.(LOCAL_CORPUS_ERROR_EVENT, (error) => writeLocalCorpusState(stateDir,
    {...record, state: LOCAL_CORPUS_STATE.LOST, reason: error.message}));
  child.unref?.();
  writeLocalCorpusState(stateDir, {...record, pid: child.pid});
  return child.pid;
}

/**
 * The detached half: after thermal headroom, prove the rest of the corpus for
 * one commit in a fresh exact checkout, and record the whole-corpus receipt
 * only when it is green.
 * @param {string} root the main checkout
 * @param {string} head
 * @param {{stateDir: string, run?: Function, now?: Function}} options
 * @return {number} exit status
 */
export function runLocalCorpus(root, head, {stateDir, run = spawnSync, now = Date.now}) {
  const current = () => readLocalCorpusRecords(stateDir).find((entry) => entry.sha === head);
  const cooled = run(process.execPath, [LOCAL_CORPUS_THERMAL], {cwd: root, stdio: INHERIT_STDIO});
  if (cooled.status !== 0 && current()?.state === LOCAL_CORPUS_STATE.RUNNING) {
    writeLocalCorpusState(stateDir, {...current(), state: LOCAL_CORPUS_STATE.LOST,
      reason: LOCAL_CORPUS_TEXT.HOT, finishedAt: now()});
    return cooled.status ?? 1;
  }
  const files = path.join(stateDir, `${head}${LOCAL_CORPUS_SUFFIX.FILES}`);
  const gated = run(process.execPath, [LOCAL_CORPUS_GATE, LOCAL_CORPUS_GATE_FLAG, head,
    LOCAL_CORPUS_RUN_FLAG, LOCAL_CORPUS_SHELL, LOCAL_CORPUS_SHELL_COMMAND,
    LOCAL_CORPUS_RUN_SCRIPT, LOCAL_CORPUS_SHELL, files, process.execPath],
  {cwd: root, stdio: INHERIT_STDIO});
  const state = current();
  // Superseded meanwhile: a newer head on main owns the verdict now.
  if (state?.state !== LOCAL_CORPUS_STATE.RUNNING) return gated.status ?? 1;
  if (gated.status !== 0) {
    writeLocalCorpusState(stateDir, {...state, state: LOCAL_CORPUS_STATE.RED,
      status: gated.status, finishedAt: now()});
    return gated.status ?? 1;
  }
  const recorded = run(process.execPath,
    [PROOF_AUTHORITY_SCRIPT, PROOF_RECORD_COMMAND, CORPUS_PROOF_ID, head],
    {cwd: root, encoding: UTF8, timeout: RECORD_TIMEOUT_MS});
  writeLocalCorpusState(stateDir, {...state, state: LOCAL_CORPUS_STATE.GREEN,
    finishedAt: now(), receipt: recorded?.status === 0 ? CORPUS_PROOF_ID :
      String(recorded?.stderr || recorded?.stdout || RECEIPT_NO_REASON).trim()});
  return 0;
}

// Whether a pid is a live local corpus of ours. Fails closed: a pid it cannot
// identify is not signalled - a reused pid leading some other group would be.
function isLocalCorpusProcess(pid) {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  let command = '';
  try {
    command = fs.readFileSync(path.join(LOCAL_CORPUS_PROC.DIRECTORY, String(pid),
      LOCAL_CORPUS_PROC.COMMAND), UTF8);
  } catch {
    const listed = spawnSync(LOCAL_CORPUS_PS[0], [...LOCAL_CORPUS_PS.slice(1), String(pid)],
      {encoding: UTF8});
    command = listed.status === 0 ? String(listed.stdout) : '';
  }
  return command.includes(LOCAL_CORPUS_ARGUMENT);
}

/**
 * Name every running local corpus whose process is gone lost. Signals
 * nothing: done at the start of every publish, before anything is known about
 * whether this publish will reach main.
 * @param {string} stateDir
 */
export function reconcileLocalCorpus(stateDir) {
  for (const state of readLocalCorpusRecords(stateDir)) {
    if (state.state === LOCAL_CORPUS_STATE.RUNNING && !isLocalCorpusProcess(state.pid)) {
      writeLocalCorpusState(stateDir, {...state, state: LOCAL_CORPUS_STATE.LOST});
    }
  }
}

/**
 * Stop every running local corpus for another commit - a newer head reached
 * main - and say so. Called only after this publish's push is verified.
 * @param {string} stateDir
 * @param {string} head the commit now on main
 * @param {Function} write
 */
export function supersedeLocalCorpus(stateDir, head, write) {
  reconcileLocalCorpus(stateDir);
  for (const state of readLocalCorpusRecords(stateDir)) {
    if (state.state !== LOCAL_CORPUS_STATE.RUNNING || state.sha === head) continue;
    const superseded = {...state, state: LOCAL_CORPUS_STATE.SUPERSEDED, supersededBy: head};
    writeLocalCorpusState(stateDir, superseded);
    try {
      process.kill(-state.pid, LOCAL_CORPUS_SIGNAL);
    } catch {
      // Ended between the check and the signal.
    }
    write(`${localCorpusLine(superseded)}${LOCAL_CORPUS_TEXT.NEWER_HEAD}`);
  }
}

function localCorpusDetail(state) {
  if (state.state === LOCAL_CORPUS_STATE.SUPERSEDED) {
    return `${LOCAL_CORPUS_TEXT.SUPERSEDED_BY}${state.supersededBy}`;
  }
  if (state.state === LOCAL_CORPUS_STATE.LOST) return state.reason || LOCAL_CORPUS_TEXT.LOST;
  if (state.state === LOCAL_CORPUS_STATE.GREEN && state.receipt &&
      state.receipt !== CORPUS_PROOF_ID) {
    return `${LOCAL_CORPUS_TEXT.UNRECORDED}${state.receipt}`;
  }
  return `${state.files}${LOCAL_CORPUS_TEXT.FILES}${state.log}`;
}

function localCorpusLine(state) {
  return `${LOCAL_CORPUS_TEXT.PREFIX}${state.sha}: ${state.state} (${localCorpusDetail(state)})`;
}

/**
 * What the local corpus last said, before anything else a publish does: every
 * red or lost run since the last green, loudest, then the newest record.
 * @param {string} stateDir
 * @param {Function} write
 */
export function reportLocalCorpus(stateDir, write) {
  const states = readLocalCorpusRecords(stateDir);
  const lastGreen = states.findIndex((state) => state.state === LOCAL_CORPUS_STATE.GREEN);
  const unanswered = lastGreen < 0 ? states : states.slice(0, lastGreen);
  for (const state of unanswered) {
    if (state.state === LOCAL_CORPUS_STATE.RED) {
      write(`${LOCAL_CORPUS_TEXT.RED_BANNER}${state.sha}: ${state.log}`);
    } else if (state.state === LOCAL_CORPUS_STATE.LOST) {
      write(`${LOCAL_CORPUS_TEXT.LOST_BANNER}${state.sha}: ${localCorpusDetail(state)}`);
    }
  }
  if (states.length > 0) write(localCorpusLine(states[0]));
  for (const state of states.slice(LOCAL_CORPUS_KEEP)) {
    for (const suffix of Object.values(LOCAL_CORPUS_SUFFIX)) {
      fs.rmSync(path.join(stateDir, `${state.sha}${suffix}`), {force: true});
    }
  }
}

// After the verified push: supersede what the new head replaces, then start
// the rest of the corpus when the gate proved a cone.
function localCorpusAfterPush(worktree, head, localCorpus) {
  const {stateDir, mainRoot, write, spawnProcess, wholeCorpus} = localCorpus;
  supersedeLocalCorpus(stateDir, head, write);
  // The same head published again - a publish that died after its push, run
  // once more - owes nothing a live or green run of it covers: a second run
  // would share the first's record and log, and leave the first running
  // untracked (verifier, round 2). A lost, red or superseded one is run again.
  const covering = readLocalCorpusRecords(stateDir).find((record) =>
    record.sha === head && LOCAL_CORPUS_COVERING.has(record.state));
  if (covering) {
    write(`${LOCAL_CORPUS_TEXT.PREFIX}${LOCAL_CORPUS_TEXT.NOT_STARTED}` +
      `${LOCAL_CORPUS_TEXT.ALREADY}${covering.state}${LOCAL_CORPUS_TEXT.FOR_THIS_COMMIT}`);
    return;
  }
  const {owed, files} = localCorpusPlan(worktree, head, {wholeCorpus});
  if (owed !== LOCAL_CORPUS_OWED.REST) {
    if (owed !== LOCAL_CORPUS_OWED.NOTHING) {
      write(`${LOCAL_CORPUS_TEXT.PREFIX}${LOCAL_CORPUS_TEXT.NOT_STARTED}${owed}`);
    }
    return;
  }
  startLocalCorpus({root: mainRoot, stateDir, head, files, spawnProcess});
  write(`${LOCAL_CORPUS_TEXT.PREFIX}${LOCAL_CORPUS_TEXT.STARTED}${head}: ${files.length}` +
    `${LOCAL_CORPUS_TEXT.FILES}${path.join(stateDir, head)}${LOCAL_CORPUS_SUFFIX.LOG}`);
}

// Bookkeeping never fails a publish: the push is verified, or not yet begun.
function localCorpusBookkeeping(write, action) {
  try {
    action();
  } catch (error) {
    write(`${LOCAL_CORPUS_TEXT.PREFIX}${LOCAL_CORPUS_TEXT.BOOKKEEPING}${error.message}`);
  }
}

export function publishExactHead(root, args = {}, options = {}) {
  const run = options.run || spawnSync;
  publishStage(PUBLISH_STAGE_LABEL.RESOLVE_HEAD);
  let head = git(run, root, [REV_PARSE_COMMAND, HEAD_REF]);
  const headMessage = git(run, root, ['log', '-1', '--format=%B', head]);
  let remoteBefore = remoteMainSha(run, root);
  publishStage(PUBLISH_STAGE_LABEL.VALIDATE_REQUEST +
    head.slice(0, PUBLISH_SHORT_SHA_LENGTH));
  const runner = validatePublishRequest({
    headMessage,
    runner: args.runner || null,
    fixesRed: args.fixesRed || null,
    reason: args.reason || null,
    remoteSha: remoteBefore,
  });
  // ensureFastForward answers with `remoteSha`; destructuring it as
  // `remoteBefore` silently produced undefined, and the gate's proof base and
  // identity line carried that word instead of the sha this publish read.
  ({head, remoteSha: remoteBefore} = ensureFastForward(
    run, root, remoteBefore, head));
  assertWorkspaceDependencySources(root, args,
    options.log || ((line) => process.stdout.write(line)));
  const writeLine = options.write || ((line) => process.stdout.write(`${line}${NEWLINE}`));
  const localCorpus = {write: writeLine, spawnProcess: options.spawnProcess || spawn,
    wholeCorpus: options.wholeCorpus || wholeCorpusFiles, stateDir: null, mainRoot: root};
  localCorpusBookkeeping(writeLine, () => {
    const places = localCorpusPlaces(run, root);
    localCorpus.stateDir = options.localCorpusDir || places.stateDir;
    localCorpus.mainRoot = places.mainRoot;
    reconcileLocalCorpus(localCorpus.stateDir);
    reportLocalCorpus(localCorpus.stateDir, writeLine);
  });
  publishStage(PUBLISH_STAGE_LABEL.CREATE_WORKTREE);

  const parent = path.join(root, 'test-output', 'publish-worktrees');
  fs.mkdirSync(parent, {recursive: true});
  const worktree = fs.mkdtempSync(path.join(parent, 'head-'));
  let added = false;
  let retained = null;
  try {
    checked(run, GIT_COMMAND, [
      WORKTREE_COMMAND, WORKTREE_ADD, QUIET_ARGUMENT, DETACH_ARGUMENT, worktree, head,
    ],
    {cwd: root});
    added = true;
    publishStage(PUBLISH_STAGE_LABEL.RUN_GATE);
    const gateEnv = gateExactHead(
      run, root, worktree, head, remoteBefore, args);
    publishStage(PUBLISH_STAGE_LABEL.PUSH);
    const {ciUrl, remoteAfter} = pushGatedHead(
      run, root, worktree, head, gateEnv, options.queryCi);
    if (localCorpus.stateDir) {
      localCorpusBookkeeping(writeLine, () => localCorpusAfterPush(worktree, head, localCorpus));
    }
    publishStage(PUBLISH_STAGE_LABEL.RECEIPT +
      remoteAfter.slice(0, PUBLISH_SHORT_SHA_LENGTH));
    retained = null;
    const receipt = buildPublishReceipt(
      {head, remoteBefore, remoteAfter, runner, ciUrl}, args);
    const file = receiptPath(run, root, head);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
    return {...receipt, receipt: file};
  } catch (error) {
    retained = retainGateDiagnostics(root, worktree, head);
    throw error;
  } finally {
    if (retained) process.stderr.write(`${RETAINED_PREFIX}${retained}\n`);
    if (added) {
      checked(run, GIT_COMMAND,
        [WORKTREE_COMMAND, WORKTREE_REMOVE, FORCE_ARGUMENT, worktree],
        {cwd: root, allowFailure: true});
    } else {
      fs.rmSync(worktree, {recursive: true, force: true});
    }
  }
}

function parseArgs(argv) {
  const parsed = {};
  const valueAfter = (index, token) => {
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--')) {
      throw new Error(MISSING_VALUE_ERROR + token);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === RUNNER_ARGUMENT) parsed.runner = valueAfter(index++, token);
    else if (token === FIXES_RED_ARGUMENT) {
      parsed.fixesRed = valueAfter(index++, token);
    } else if (token === REASON_ARGUMENT) parsed.reason = valueAfter(index++, token);
    else if (token === ALLOW_MISSING_DATA_ARGUMENT) parsed.allowMissingData = true;
    else throw new Error(`publish: unknown argument ${token}`);
  }
  return parsed;
}

export function parsePublishArgs(argv) {
  return parseArgs(argv);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === LOCAL_CORPUS_ARGUMENT && argv.length === 2) {
    const root = process.cwd();
    process.exitCode = runLocalCorpus(root, argv[1],
      {stateDir: localCorpusPlaces(spawnSync, root).stateDir});
    return;
  }
  try {
    const args = parseArgs(process.argv.slice(2));
    const receipt = publishExactHead(process.cwd(), args);
    publishStage(PUBLISH_STAGE_LABEL.DONE);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    reportPublishFailure(error);
    process.exitCode = 1;
  }
}

if (process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

export {
  LOCAL_CORPUS_OWED,
  GATE_WORKSPACE_DIRECTORIES,
  assertWorkspaceDependencyLinks,
  linkWorkspaceDependencies,
};
