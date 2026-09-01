import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import tap from 'tap';

import {
  fileSizeAdmissionProblems,
  touchedFileSizeOverflow,
} from '../../scripts/solve/file-size-admission.js';

const GIT = 'git';
const UTF8 = 'utf8';
const SOURCE_THRESHOLD = 800;
const TEST_THRESHOLD = 1500;

function git(root, args) {
  return execFileSync(GIT, args, {cwd: root, encoding: UTF8});
}

function writeLines(root, filePath, lineCount) {
  const absolute = path.join(root, filePath);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  const lines = [];
  for (let index = 0; index < lineCount; index += 1) {
    lines.push(`// line ${index}`);
  }
  fs.writeFileSync(absolute, lines.join('\n'));
}

function setupFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-size-admission-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'Fixture']);
  writeLines(root, 'src/near-threshold.js', SOURCE_THRESHOLD - 1);
  writeLines(root, 'src/legacy-oversized.js', SOURCE_THRESHOLD + 100);
  writeLines(root, 'test/near-threshold.test.js', TEST_THRESHOLD - 1);
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '--no-verify', '-m', 'base']);
  const baseCommit = git(root, ['rev-parse', 'HEAD']).trim();
  return {root, baseCommit};
}

tap.test('a file the attempt pushes over its threshold is a violation', (t) => {
  const {root, baseCommit} = setupFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeLines(root, 'src/near-threshold.js', SOURCE_THRESHOLD + 1);
  const overflow = touchedFileSizeOverflow(
    root, baseCommit, ['src/near-threshold.js']);
  t.equal(overflow.length, 1, 'W1-ADMISSION-GROWN-FILE-FLAGGED');
  t.equal(overflow[0].path, 'src/near-threshold.js');
  t.equal(overflow[0].threshold, SOURCE_THRESHOLD);
  const problems = fileSizeAdmissionProblems(
    root, baseCommit, ['src/near-threshold.js']);
  t.equal(problems.length, 1);
  t.match(problems[0], /file-size admission/u);
  t.match(problems[0], /ratchet/u);
  t.end();
});

tap.test('a file already over threshold at the base stays tolerated', (t) => {
  const {root, baseCommit} = setupFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeLines(root, 'src/legacy-oversized.js', SOURCE_THRESHOLD + 101);
  const overflow = touchedFileSizeOverflow(
    root, baseCommit, ['src/legacy-oversized.js']);
  t.equal(overflow.length, 0, 'W1-ADMISSION-LEGACY-OVERSIZED-TOLERATED');
  t.end();
});

tap.test('a brand-new oversized file is a violation', (t) => {
  const {root, baseCommit} = setupFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeLines(root, 'src/brand-new.js', SOURCE_THRESHOLD + 5);
  const overflow = touchedFileSizeOverflow(
    root, baseCommit, ['src/brand-new.js']);
  t.equal(overflow.length, 1, 'W1-ADMISSION-NEW-OVERSIZED-FLAGGED');
  t.end();
});

tap.test('test-tree files use the test threshold', (t) => {
  const {root, baseCommit} = setupFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeLines(root, 'test/near-threshold.test.js', TEST_THRESHOLD + 1);
  const overflow = touchedFileSizeOverflow(
    root, baseCommit, ['test/near-threshold.test.js']);
  t.equal(overflow.length, 1, 'W1-ADMISSION-TEST-THRESHOLD-APPLIED');
  t.equal(overflow[0].threshold, TEST_THRESHOLD);
  t.end();
});

tap.test('exactly at threshold, deletions, and non-source paths pass', (t) => {
  const {root, baseCommit} = setupFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  writeLines(root, 'src/near-threshold.js', SOURCE_THRESHOLD);
  fs.rmSync(path.join(root, 'src/legacy-oversized.js'));
  writeLines(root, 'docs/huge.js', SOURCE_THRESHOLD + 500);
  const overflow = touchedFileSizeOverflow(root, baseCommit, [
    'src/near-threshold.js',
    'src/legacy-oversized.js',
    'docs/huge.js',
    'test/shards/primary-classes.json',
  ]);
  t.equal(overflow.length, 0, 'W1-ADMISSION-BOUNDARY-AND-SKIPS-PASS');
  t.end();
});
