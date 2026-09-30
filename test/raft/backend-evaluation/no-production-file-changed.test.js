// The read-only-production constraint, measured against the commit this
// quest was sealed at.
//
// It fails closed in both directions: it refuses to run if it cannot resolve
// a base commit, and it refuses to pass if the comparison it made found
// nothing of this quest's own work - a comparison that sees nothing would
// otherwise be a silent green.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {repositoryRoot} from './evaluation-artifact.js';

const GUARD = Object.freeze({
  QUEST: 'solve/quests/raft-backend-evaluation/quest.json',
  MAIN: 'main',
  SHA_PATTERN: /^[0-9a-f]{40}$/u,
  UTF8: 'utf8',
  // Nothing under these may change, whatever the reason.
  FORBIDDEN_PREFIXES: Object.freeze([
    'src/', 'examples/', '.github/', '.githooks/']),
  PACKAGE_JSON: 'package.json',
  DEPENDENCY_SECTIONS: Object.freeze([
    'dependencies', 'devDependencies', 'optionalDependencies',
    'peerDependencies']),
  // This quest's own work must be visible in the comparison, or the base is
  // wrong and the check is measuring nothing.
  OWN_WORK_PREFIX: 'test/raft/backend-evaluation/',
});

function git(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: GUARD.UTF8,
  }).trim();
}

function baseCommit() {
  const questPath = path.join(repositoryRoot, GUARD.QUEST);
  const quest = JSON.parse(fs.readFileSync(questPath, GUARD.UTF8));
  // Once sealed, the sealing commit is the only honest base; before sealing,
  // the merge base with main is.
  const sealedAt = typeof quest.sealedAt === 'string' ? quest.sealedAt : null;
  if (sealedAt && GUARD.SHA_PATTERN.test(sealedAt)) {
    return {sha: sealedAt, from: 'sealedAt'};
  }
  return {sha: git(['merge-base', 'HEAD', GUARD.MAIN]), from: 'merge-base'};
}

function changedPaths(base) {
  const tracked = git(['diff', '--name-only', base]).split('\n');
  const status = git(['status', '--porcelain']).split('\n');
  const untracked = status
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3));
  return [...new Set([...tracked, ...untracked].filter(Boolean))].sort();
}

function dependencySections(text) {
  const parsed = JSON.parse(text);
  const sections = {};
  for (const section of GUARD.DEPENDENCY_SECTIONS) {
    sections[section] = parsed[section] || {};
  }
  return sections;
}

test('no production file changed', () => {
  const base = baseCommit();
  assert.ok(GUARD.SHA_PATTERN.test(base.sha),
    `the base commit must resolve to a sha (from ${base.from})`);

  const changed = changedPaths(base.sha);

  // Liveness: the comparison must be able to see this quest's own files, or
  // it is not comparing anything.
  assert.ok(changed.some((file) => file.startsWith(GUARD.OWN_WORK_PREFIX)),
    `the comparison against ${base.sha} (${base.from}) found none of this ` +
    'quest\'s own files, so it is measuring nothing');

  for (const file of changed) {
    for (const prefix of GUARD.FORBIDDEN_PREFIXES) {
      assert.ok(!file.startsWith(prefix),
        `${file} is production and this quest may not change it`);
    }
  }

  if (changed.includes(GUARD.PACKAGE_JSON)) {
    const before = dependencySections(
      git(['show', `${base.sha}:${GUARD.PACKAGE_JSON}`]));
    const after = dependencySections(fs.readFileSync(
      path.join(repositoryRoot, GUARD.PACKAGE_JSON), GUARD.UTF8));
    assert.deepEqual(after, before,
      'no dependency version in package.json may change');
  }
});
