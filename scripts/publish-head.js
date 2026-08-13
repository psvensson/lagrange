#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ZERO_SHA = '0'.repeat(40);
const GITHUB_RUNNER_MARKER = '[ci:github]';
const ARG_SEPARATOR = ' ';
const GIT_COMMAND = 'git';
const RUNNER_GITHUB = 'github';
const RUNNER_SELF_HOSTED = 'self-hosted';
const INVALID_RUNNER_ERROR = 'publish: --runner must be github|self-hosted';
const GITHUB_MARKER_ERROR =
  'publish: --runner github requires [ci:github] in the HEAD commit message; ';
const GITHUB_MARKER_REPAIR =
  'create a new commit with that marker (do not amend a published commit)';
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

function checked(run, command, args, options = {}) {
  const result = run(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    input: options.input,
    encoding: 'utf8',
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

export function validatePublishRequest({headMessage, runner, fixesRed, reason,
  remoteSha}) {
  if (runner && runner !== RUNNER_GITHUB && runner !== RUNNER_SELF_HOSTED) {
    throw new Error(INVALID_RUNNER_ERROR);
  }
  if (runner === RUNNER_GITHUB && !headMessage.includes(GITHUB_RUNNER_MARKER)) {
    throw new Error(GITHUB_MARKER_ERROR + GITHUB_MARKER_REPAIR);
  }
  if (fixesRed && fixesRed !== remoteSha) {
    throw new Error(FIXES_RED_SHA_ERROR);
  }
  if (fixesRed && !String(reason || '').trim()) {
    throw new Error(FIXES_RED_REASON_ERROR);
  }
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

export function publishExactHead(root, args = {}, options = {}) {
  const run = options.run || spawnSync;
  const head = git(run, root, ['rev-parse', 'HEAD']);
  const headMessage = git(run, root, ['log', '-1', '--format=%B', head]);
  const remoteBefore = remoteMainSha(run, root);
  validatePublishRequest({
    headMessage,
    runner: args.runner || null,
    fixesRed: args.fixesRed || null,
    reason: args.reason || null,
    remoteSha: remoteBefore,
  });
  assertFastForward(run, root, remoteBefore, head);

  const parent = path.join(root, 'test-output', 'publish-worktrees');
  fs.mkdirSync(parent, {recursive: true});
  const worktree = fs.mkdtempSync(path.join(parent, 'head-'));
  let added = false;
  try {
    checked(run, GIT_COMMAND, [
      WORKTREE_COMMAND, WORKTREE_ADD, QUIET_ARGUMENT, DETACH_ARGUMENT, worktree, head,
    ],
    {cwd: root});
    added = true;
    const gateEnv = {...process.env};
    if (args.fixesRed) gateEnv.LAGRANGE_PUSH_ON_RED = ENABLED_ENV_VALUE;
    const refLine = `HEAD ${head} refs/heads/main ${remoteBefore}\n`;
    checked(run, BASH_COMMAND, [PRE_PUSH_HOOK], {
      cwd: worktree,
      env: gateEnv,
      input: refLine,
    });
    const gateStatus = git(run, worktree, [
      STATUS_COMMAND, PORCELAIN_ARGUMENT,
    ]);
    if (gateStatus) throw new Error(DIRTY_GATE_ERROR);
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
    const ciUrl = options.queryCi === false ? '' : ciRunUrl(run, root, head);
    const receipt = {
      schemaVersion: 1,
      head,
      remote: 'origin',
      remoteRef: 'refs/heads/main',
      remoteBefore,
      remoteAfter,
      gate: 'bash .githooks/pre-push',
      runner: args.runner || 'self-hosted',
      fixesRed: args.fixesRed || null,
      reason: args.reason || null,
      ciUrl: ciUrl || null,
      publishedAt: new Date().toISOString(),
    };
    const file = receiptPath(run, root, head);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
    return {...receipt, receipt: file};
  } finally {
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
    else throw new Error(`publish: unknown argument ${token}`);
  }
  return parsed;
}

export function parsePublishArgs(argv) {
  return parseArgs(argv);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const receipt = publishExactHead(process.cwd(), args);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
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
