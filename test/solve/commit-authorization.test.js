import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  checkCommitAuthorization,
  clearCommitAuthorization,
  issueCommitAuthorization,
} from '../../scripts/solve/commit-authorization.js';
import {claimQuest, releaseSession} from
  '../../scripts/solve/session-registry.js';

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
}

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUTHORIZATION_CHECK = path.join(
  REPOSITORY_ROOT, 'scripts', 'solve', 'commit-authorization.js');

function concurrentCheck(root) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [AUTHORIZATION_CHECK, 'check'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('close', (status) => resolve({status, stdout: stdout.trim()}));
  });
}

tap.test('commit authorization is Quest, worktree, index, and time bound', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-authorization-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'before\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  claimQuest(root, 'authorized-quest');

  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
  git(root, ['add', 'src/demo.js']);
  t.equal(checkCommitAuthorization(root).authorized, false,
    'a raw source commit is refused while the Quest lease is active');

  const consumed = issueCommitAuthorization(
    root, {questId: 'authorized-quest', mode: 'land'});
  t.equal(checkCommitAuthorization(root).authorized, true,
    'Solver authorizes the exact staged tree');
  t.equal(checkCommitAuthorization(root).authorized, false,
    'the authorization is consumed by its first successful check');

  fs.writeFileSync(consumed.file, '{}\n');
  const nativeParse = JSON.parse;
  let replayAuthorized;
  try {
    Reflect.defineProperty(JSON, 'parse', {
      value: () => consumed.authorization,
      configurable: true,
      writable: true,
    });
    replayAuthorized = checkCommitAuthorization(root).authorized;
  } finally {
    Reflect.defineProperty(JSON, 'parse', {
      value: nativeParse,
      configurable: true,
      writable: true,
    });
  }
  t.equal(replayAuthorized, false,
    'a replaced JSON parser cannot replay a consumed token');

  const expired = issueCommitAuthorization(
    root, {questId: 'authorized-quest', mode: 'land'});
  const expiredRecord = JSON.parse(fs.readFileSync(expired.file, 'utf8'));
  expiredRecord.expiresAt = new Date(0).toISOString();
  fs.writeFileSync(expired.file, `${JSON.stringify(expiredRecord)}\n`);
  const nativeNow = Date.now;
  let expiredAuthorized;
  try {
    Reflect.defineProperty(Date, 'now', {
      value: () => 0,
      configurable: true,
      writable: true,
    });
    expiredAuthorized = checkCommitAuthorization(root).authorized;
  } finally {
    Reflect.defineProperty(Date, 'now', {
      value: nativeNow,
      configurable: true,
      writable: true,
    });
  }
  t.equal(expiredAuthorized, false,
    'an expired authorization fails closed');

  issueCommitAuthorization(root, {questId: 'authorized-quest', mode: 'land'});
  fs.writeFileSync(path.join(root, 'src', 'other.js'), 'other\n');
  git(root, ['add', 'src/other.js']);
  t.equal(checkCommitAuthorization(root).authorized, false,
    'changing the index invalidates the authorization');

  git(root, ['reset', '--quiet', 'HEAD', '--', 'src/other.js']);
  fs.rmSync(path.join(root, 'src', 'other.js'));
  issueCommitAuthorization(root, {questId: 'authorized-quest', mode: 'land'});
  fs.mkdirSync(path.join(root, 'docs'), {recursive: true});
  fs.writeFileSync(path.join(root, 'docs', 'extra.md'), 'extra\n');
  git(root, ['add', 'docs/extra.md']);
  t.equal(checkCommitAuthorization(root).authorized, false,
    'a non-source staged path cannot hitchhike after authorization');

  clearCommitAuthorization(root);
  releaseSession(root);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('pre-commit checks Solver authorization before its generic skip', (t) => {
  const hook = fs.readFileSync(
    path.join(REPOSITORY_ROOT, '.githooks', 'pre-commit'),
    'utf8',
  );
  const authorizationCheck = hook.indexOf('commit-authorization.js check');
  const genericSkip = hook.indexOf('LAGRANGE_SKIP_PRECOMMIT:-');
  t.ok(authorizationCheck >= 0);
  t.ok(genericSkip >= 0);
  t.ok(authorizationCheck < genericSkip,
    'the generic pre-commit skip cannot bypass the active-Quest guard');
  t.end();
});

tap.test('an active Quest lease permits a docs-only staged commit', (t) => {
  const root = fs.mkdtempSync(path.join(
    os.tmpdir(), 'commit-authorization-docs-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  fs.mkdirSync(path.join(root, 'docs'), {recursive: true});
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'docs', 'demo.md'), 'before\n');
  fs.writeFileSync(path.join(root, 'src', 'foreign.js'), 'before\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  claimQuest(root, 'docs-only-quest');

  fs.writeFileSync(path.join(root, 'docs', 'demo.md'), 'after\n');
  fs.writeFileSync(path.join(root, 'src', 'foreign.js'), 'dirty\n');
  git(root, ['add', 'docs/demo.md']);
  const checked = checkCommitAuthorization(root);
  t.equal(checked.required, false);
  t.equal(checked.authorized, true,
    'non-source commits do not need Solver authorization');

  releaseSession(root);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('an active Quest lease refuses a raw staged source deletion', (t) => {
  const root = fs.mkdtempSync(path.join(
    os.tmpdir(), 'commit-authorization-delete-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'delete.js'), 'delete me\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  claimQuest(root, 'source-deletion-quest');

  git(root, ['rm', '--quiet', 'src/delete.js']);
  const checked = checkCommitAuthorization(root);
  t.equal(checked.required, true);
  t.equal(checked.authorized, false,
    'source deletions require Solver authorization like other source changes');

  clearCommitAuthorization(root);
  releaseSession(root);
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('scope-safe commit-only authorization preserves foreign staged work',
  (t) => {
    const root = fs.mkdtempSync(path.join(
      os.tmpdir(), 'commit-authorization-only-'));
    git(root, ['init', '--quiet']);
    git(root, ['config', 'user.email', 'solver@example.com']);
    git(root, ['config', 'user.name', 'Solver']);
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.mkdirSync(path.join(root, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'before\n');
    fs.writeFileSync(path.join(root, 'src', 'foreign.js'), 'before\n');
    fs.writeFileSync(path.join(root, 'docs', 'extra.md'), 'before\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '--quiet', '-m', 'base']);
    const hook = path.join(root, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hook, [
      '#!/bin/sh',
      `exec "${process.execPath}" "${AUTHORIZATION_CHECK}" check >/dev/null`,
      '',
    ].join('\n'));
    fs.chmodSync(hook, 0o755);
    claimQuest(root, 'commit-only-quest');

    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
    fs.writeFileSync(path.join(root, 'src', 'foreign.js'), 'foreign\n');
    fs.writeFileSync(path.join(root, 'docs', 'extra.md'), 'foreign\n');
    git(root, ['add', 'src/demo.js', 'docs/extra.md']);
    issueCommitAuthorization(root, {
      questId: 'commit-only-quest',
      mode: 'land',
      paths: ['src/demo.js'],
    });
    git(root, ['commit', '--quiet', '--only', '-m', 'scope safe', '--',
      'src/demo.js']);

    t.equal(git(root, ['show', 'HEAD:src/demo.js']), 'after');
    t.equal(git(root, ['show', 'HEAD:src/foreign.js']), 'before');
    t.equal(git(root, ['show', 'HEAD:docs/extra.md']), 'before');
    t.equal(git(root, ['diff', '--cached', '--name-only']), 'docs/extra.md',
      'foreign staged work remains staged and uncommitted');
    t.equal(git(root, ['diff', '--name-only']), 'src/foreign.js',
      'foreign dirty source work remains uncommitted');

    clearCommitAuthorization(root);
    releaseSession(root);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

tap.test('concurrent authorization checks have exactly one winner', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-authorization-race-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'before\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  claimQuest(root, 'race-quest');
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
  git(root, ['add', 'src/demo.js']);
  issueCommitAuthorization(root, {questId: 'race-quest', mode: 'land'});

  const checks = await Promise.all(
    Array.from({length: 32}, () => concurrentCheck(root)),
  );
  const winners = checks.filter((result) =>
    result.status === 0 && result.stdout === 'solver-authorized');
  t.equal(winners.length, 1,
    'an atomic rename claim admits exactly one concurrent checker');

  clearCommitAuthorization(root);
  releaseSession(root);
  fs.rmSync(root, {recursive: true, force: true});
});

tap.test('prototype iteration replacement cannot widen authorized paths', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-authorization-intrinsic-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'before\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  claimQuest(root, 'intrinsic-quest');
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
  git(root, ['add', 'src/demo.js']);
  issueCommitAuthorization(root, {questId: 'intrinsic-quest', mode: 'land'});
  fs.writeFileSync(path.join(root, 'src', 'other.js'), 'other\n');
  git(root, ['add', 'src/other.js']);

  const originalEvery = Array.prototype.every;
  try {
    Reflect.defineProperty(Array.prototype, 'every', {
      value: () => true,
      configurable: true,
      writable: true,
    });
    t.equal(checkCommitAuthorization(root).authorized, false,
      'a replaced every intrinsic cannot hide an unauthorized staged path');
  } finally {
    Reflect.defineProperty(Array.prototype, 'every', {
      value: originalEvery,
      configurable: true,
      writable: true,
    });
    clearCommitAuthorization(root);
    releaseSession(root);
    fs.rmSync(root, {recursive: true, force: true});
  }
  t.end();
});

tap.test('inherited authorization fields fail closed', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-authorization-own-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'before\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'base']);
  claimQuest(root, 'own-fields-quest');
  fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'after\n');
  git(root, ['add', 'src/demo.js']);
  const issued = issueCommitAuthorization(
    root, {questId: 'own-fields-quest', mode: 'land'});
  fs.writeFileSync(issued.file, '{}\n');
  const inheritedKeys = Object.keys(issued.authorization);
  try {
    for (const key of inheritedKeys) {
      Reflect.defineProperty(Object.prototype, key, {
        value: issued.authorization[key],
        configurable: true,
        writable: true,
      });
    }
    t.equal(checkCommitAuthorization(root).authorized, false,
      'prototype pollution cannot supply missing token fields');
  } finally {
    for (const key of inheritedKeys) Reflect.deleteProperty(Object.prototype, key);
    clearCommitAuthorization(root);
    releaseSession(root);
    fs.rmSync(root, {recursive: true, force: true});
  }
  t.end();
});
