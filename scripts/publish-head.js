#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  ACCEPTANCE_PROOF,
} from './checks/acceptance-proof-manifest-constants.js';
import {
  WORKSPACE_INJECTION_ENV,
} from './checks/change-selection-constants.js';

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
const SELF_HOSTED_MARKER_ERROR =
  'publish: --runner self-hosted requires [ci:self-hosted] in the HEAD commit message; ';
const RUNNER_MARKER_REPAIR =
  'create a new commit with that marker (do not amend a published commit)';
const RUNNER_MISMATCH_ERROR =
  'publish: --runner conflicts with the HEAD commit CI routing marker';
const FIXES_RED_SHA_ERROR =
  'publish: --fixes-red must name the current origin/main SHA';
const FIXES_RED_REASON_ERROR =
  'publish: --fixes-red requires --reason "<why this fixes red>"';
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

function resolvePublishRunner(headMessage, runner) {
  if (runner && runner !== RUNNER_GITHUB && runner !== RUNNER_SELF_HOSTED) {
    throw new Error(INVALID_RUNNER_ERROR);
  }
  if (runner === RUNNER_SELF_HOSTED &&
    !headMessage.includes(SELF_HOSTED_RUNNER_MARKER)) {
    throw new Error(SELF_HOSTED_MARKER_ERROR + RUNNER_MARKER_REPAIR);
  }
  const routedRunner = headMessage.includes(SELF_HOSTED_RUNNER_MARKER) ?
    RUNNER_SELF_HOSTED : RUNNER_GITHUB;
  if (routedRunner === RUNNER_SELF_HOSTED && runner !== RUNNER_SELF_HOSTED) {
    throw new Error(RUNNER_MISMATCH_ERROR);
  }
  if (runner && runner !== routedRunner) {
    throw new Error(RUNNER_MISMATCH_ERROR);
  }
  return routedRunner;
}

export function validatePublishRequest({headMessage, runner, fixesRed, reason,
  remoteSha}) {
  const routedRunner = resolvePublishRunner(headMessage, runner);
  if (fixesRed && fixesRed !== remoteSha) {
    throw new Error(FIXES_RED_SHA_ERROR);
  }
  if (fixesRed && !String(reason || '').trim()) {
    throw new Error(FIXES_RED_REASON_ERROR);
  }
  return routedRunner;
}

function assertFastForward(run, root, remoteSha, head) {
  if (remoteSha === ZERO_SHA) return;
  checked(run, GIT_COMMAND,
    [FETCH_COMMAND, QUIET_ARGUMENT, ORIGIN_REMOTE, MAIN_BRANCH], {cwd: root});
  const result = checked(
    run, 'git', ['merge-base', '--is-ancestor', remoteSha, head],
    {cwd: root, allowFailure: true},
  );
  if (result.status !== 0) {
    throw new Error(FAST_FORWARD_ERROR);
  }
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
    args.allowMissingData !== true) {
    throw new Error(`${DATA_ABSENT_ERROR_PREFIX}${root}${DATA_ABSENT_ERROR_SUFFIX}`);
  }
}

function linkWorkspaceDependencies(root, worktree) {
  const links = [];
  for (const directory of GATE_WORKSPACE_DIRECTORIES) {
    const source = path.join(root, directory);
    if (!fs.existsSync(source)) continue;
    const link = path.join(worktree, directory);
    fs.symlinkSync(source, link, DIRECTORY_LINK_TYPE);
    links.push({link, source: fs.realpathSync(source)});
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
  const ciUrl = queryCi === false ? '' : ciRunUrl(run, root, head);
  return {ciUrl, remoteAfter};
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

export function publishExactHead(root, args = {}, options = {}) {
  const run = options.run || spawnSync;
  publishStage(PUBLISH_STAGE_LABEL.RESOLVE_HEAD);
  const head = git(run, root, ['rev-parse', 'HEAD']);
  const headMessage = git(run, root, ['log', '-1', '--format=%B', head]);
  const remoteBefore = remoteMainSha(run, root);
  publishStage(PUBLISH_STAGE_LABEL.VALIDATE_REQUEST +
    head.slice(0, PUBLISH_SHORT_SHA_LENGTH));
  const runner = validatePublishRequest({
    headMessage,
    runner: args.runner || null,
    fixesRed: args.fixesRed || null,
    reason: args.reason || null,
    remoteSha: remoteBefore,
  });
  assertFastForward(run, root, remoteBefore, head);
  assertWorkspaceDependencySources(root, args,
    options.log || ((line) => process.stdout.write(line)));
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
