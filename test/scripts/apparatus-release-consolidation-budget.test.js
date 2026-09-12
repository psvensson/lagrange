// Contract for the apparatus-release-consolidation acceptance budget.
//
// This script is an epic's `doneWhen`, so two different things can go wrong
// with it and only one of them is visible from the repository itself.
//
// The first is that it stops measuring. Measured against the real tree it
// prints one number, and a script that silently returned a constant, dropped a
// row, or crashed a row into a caught default would print a number too. So
// every row is measured here against two FIXTURE TREES this test builds, and
// each row's value is asserted exactly in both. Exact values, not met flags:
// most rows are `at most`, so they are legitimately met by an empty
// directory, and a met flag would have agreed with a row that read nothing.
//
// The second is that the budget moves. A budget that drifts to meet the tree
// proves nothing, so the thresholds are restated here, by row, as an
// independent copy of the sealed table. This test failing because a number
// changed is the intended behaviour, not a maintenance chore: change it in the
// epic, the script and here, or not at all.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  measureConsolidationBudget,
} from '../../scripts/checks/apparatus-release-consolidation-budget.js';

const UTF8 = 'utf8';
const REPO_ROOT = process.cwd();
const SCRIPT = 'scripts/checks/apparatus-release-consolidation-budget.js';

// The sealed budget table, restated independently of the script: the row's
// printed name, its threshold, and the value each fixture must produce. The
// name is the row identity, so a renamed row is as loud as a moved number.
//
//                                      name, budget, met value, offending value
const SEALED_TABLE = Object.freeze([
  ['release receipt: artifacts published', 4, 4, 0],
  ['formation trend: measuring verdicts in last 3', 3, 3, 0],
  ['README offences', 0, 0, 1],
  ['scripts/ loose top-level files', 80, 1, 0],
  ['scripts/ total lines', 90000, 2, 0],
  ['scripts/checks files', 190, 1, 0],
  ['.github/workflows total lines', 500, 2, 0],
  ['release.yml named steps', 12, 1, 0],
  ['gate chains reference literals checker', 0, 0, 1],
  ['gate chains reference file-length audit', 0, 0, 1],
  ['src *-methods.js files', 160, 1, 0],
  ['open epics', 8, 1, 2],
  ['open legacy epics', 0, 0, 2],
  ['open epics without doneWhen', 0, 0, 2],
  ['solve/epics total lines', 6000, 6, 8],
  ['liferaft dependency present', 0, 0, 1],
  ['CLAUDE.md is a pointer', 0, 0, 1],
]);

function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text, UTF8);
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'consolidation-budget-'));
}

// A tree in which every budget is met. Each file exists because exactly one
// row reads it, and each is small enough that the row's expected value can be
// counted by hand in the table above.
function metFixture() {
  const root = makeRoot();
  write(root, 'data/releases/v9.9.9.json', `${JSON.stringify({
    tag: 'v9.9.9',
    published: {npm: true, docker: true, helm: true, github: true},
  })}\n`);
  const measuring = `${JSON.stringify({verdict: 'PASS', seedStarved: false})}\n`;
  write(root, 'data/formation-health/trend.ndjson', measuring.repeat(3));
  write(root, 'README.md',
    'npm install --global lagrange-server\nlagrange-server@9.9.9\n');
  write(root, 'CLAUDE.md', 'See AGENTS.md\n');
  write(root, 'package.json', `${JSON.stringify({
    scripts: {check: 'node scripts/check-fast-static.js'},
    dependencies: {},
  })}\n`);
  write(root, 'scripts/check-fast-static.js', '// no audits named here\n');
  write(root, 'scripts/checks/one.js', '\n');
  write(root, '.github/workflows/release.yml', 'jobs:\n  - name: publish\n');
  write(root, 'src/one-methods.js', '\n');
  write(root, 'solve/epics/kept.md',
    '---\nstatus: open\ndoneWhen: probe\n---\n\n# Kept\n');
  return root;
}

// The same rows against a tree that offends instead: no publication receipt,
// no formation trend, a cluster claim with no dated verdict, gate chains that
// still name the checkers the epic wants off them, two undated legacy epics,
// the liferaft dependency, and no CLAUDE.md pointer.
function offendingFixture() {
  const root = makeRoot();
  write(root, 'package.json', `${JSON.stringify({
    scripts: {
      check: 'npm run audit:guideline:literals && npm run audit:file-size',
    },
    dependencies: {liferaft: '1.0.0'},
  })}\n`);
  write(root, 'README.md', 'a five-node cluster, with no dated verdict\n');
  write(root, 'solve/epics/legacy-one.md',
    '---\nstatus: open\nlegacy: true\n---\n');
  write(root, 'solve/epics/legacy-two.md',
    '---\nstatus: open\nlegacy: true\n---\n');
  return root;
}

function byName(rows) {
  return new Map(rows.map((row) => [row.name, row]));
}

function checkerViolations(script, file) {
  const result = spawnSync(process.execPath, [script, '--json', file],
    {cwd: REPO_ROOT, encoding: UTF8});
  assert.equal(result.status, 0,
    `${script} must exit 0 for a compliant file; stderr: ${result.stderr}`);
  return JSON.parse(result.stdout).violations;
}

test('the budget script passes the guideline checkers that scan it', () => {
  // The checkers are the authority on their own rules, so they are RUN rather
  // than re-expressed here. Scoping each to this one path keeps the assertion
  // about this script and not about the repository's inherited baseline.
  for (const script of [
    'scripts/check-guideline-literals.js',
    'scripts/check-guideline-ambient-intrinsics.js',
  ]) {
    assert.deepEqual(checkerViolations(script, SCRIPT), [],
      `${script} must report no violation in ${SCRIPT}`);
  }

  const lint = spawnSync('npx', ['eslint', SCRIPT],
    {cwd: REPO_ROOT, encoding: UTF8});
  assert.equal(lint.status, 0,
    `eslint must pass on ${SCRIPT}; output: ${lint.stdout}${lint.stderr}`);
});

test('every budget row is measured from the tree it is given', () => {
  const met = measureConsolidationBudget(metFixture());
  const offending = measureConsolidationBudget(offendingFixture());

  assert.equal(met.length, SEALED_TABLE.length,
    'the table must not gain or lose a row unnoticed');
  assert.deepEqual(met.map((row) => row.name),
    SEALED_TABLE.map(([name]) => name),
    'row names are the table identity and must stay put');

  const metRows = byName(met);
  const offendingRows = byName(offending);
  for (const [name, , metValue, offendingValue] of SEALED_TABLE) {
    assert.equal(metRows.get(name).value, metValue,
      `${name} must measure ${metValue} on the satisfying tree`);
    assert.equal(offendingRows.get(name).value, offendingValue,
      `${name} must measure ${offendingValue} on the offending tree`);
    assert.notEqual(metValue, offendingValue,
      `${name} reads the same value from both fixtures, so this test would ` +
      'not notice it reading a default instead of the tree');
  }

  assert.deepEqual(met.filter((row) => !row.met), [],
    'a tree satisfying every budget must report zero unmet');
});

test('no budget number changed', () => {
  const rows = byName(measureConsolidationBudget(metFixture()));
  for (const [name, budget] of SEALED_TABLE) {
    const row = rows.get(name);
    assert.ok(row, `the sealed row ${name} is missing from the table`);
    assert.equal(row.budget, budget,
      `${name} must keep its sealed budget; change the epic, the script and ` +
      'this test together or not at all');
  }
});
