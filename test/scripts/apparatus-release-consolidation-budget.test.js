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
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {newestReleaseReceipt, nextLagsLatest, reobserveNext} from '../../scripts/checks/release-publication-receipt.js';
import {
  selectedRows,
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
  ['release receipt: npm next lags latest', 0, 0, 1],
  ['scripts/ loose top-level files', 80, 1, 0],
  ['scripts/ total lines', 90000, 6, 7],
  ['scripts/checks files', 190, 3, 4],
  ['.github/workflows total lines', 500, 10, 15],
  ['release.yml named steps', 12, 1, 0],
  ['gate chains reference literals checker', 0, 0, 1],
  ['gate chains reference file-length audit', 0, 0, 1],
  ['src *-methods.js files', 160, 1, 0],
  ['open epics', 12, 1, 2],
  ['open legacy epics', 0, 0, 2],
  ['open epics without doneWhen', 0, 0, 2],
  ['solve/epics total lines', 6000, 6, 8],
  ['liferaft dependency present', 0, 0, 1],
  ['CLAUDE.md is a pointer', 0, 0, 1],
  // proof-authority-integrity: the gate's declared stage trees, the drift of
  // the committed observation census, and the falsifier receipt bound to its
  // witness bytes (six classes, so an absent receipt reads six).
  ['gate stages off pushed sha', 0, 0, 1],
  ['undeclared observation surfaces', 0, 0, 1],
  ['falsifier classes unproven', 0, 0, 6],
  // gate-work-consolidation: every proof produced once per push cycle.
  ['duplicate metric productions', 0, 0, 2],
  ['duplicate fixed test runs', 0, 0, 1],
  ['import graph seal readers beyond one', 0, 0, 1],
  ['whole tree checks without input trigger', 0, 0, 1],
  ['eslint off pushed range', 0, 0, 1],
  ['repository health not coalesced', 0, 0, 1],
  ['workflows without concurrency', 0, 0, 1],
  ['ci resources not plan driven', 0, 0, 1],
  ['canary after full corpus', 0, 0, 1],
]);

const FALSIFIER_CLASSES = Object.freeze([
  'observed-file', 'observed-directory', 'spawned-script',
  'behavioural-source', 'working-tree-not-proof',
  'hook-materialises-pushed-sha',
]);
const FALSIFIER_WITNESS = 'test/scripts/falsifier-witness.test.js';
const FALSIFIER_RECEIPT = 'test/manifests/proof-authority-falsifiers.receipt.json';
// One test that reads README.md, so its observation census is one file.
const OBSERVER_TEST = 'test/observer.test.js';
const OBSERVER_SOURCE =
  'import fs from \'node:fs\';\nconst readme = fs.readFileSync(\'README.md\');\n';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

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
  write(root, 'test/manifests/pre-push-stages.json', `${JSON.stringify({
    stages: [{id: 'refs', tree: 'none'}, {id: 'lint', tree: 'pushed-sha'}],
  })}\n`);
  write(root, OBSERVER_TEST, OBSERVER_SOURCE);
  write(root, 'test/shards/subsystem-classes.json', `${JSON.stringify({
    classes: {[OBSERVER_TEST]: 'query-sql'},
    observations: {[OBSERVER_TEST]: {files: ['README.md']}},
  })}\n`);
  const witness = 'export const witness = true;\n';
  write(root, FALSIFIER_WITNESS, witness);
  write(root, FALSIFIER_RECEIPT, `${JSON.stringify({
    status: 'pass',
    testFileDigests: {[FALSIFIER_WITNESS]: sha256(witness)},
    receipts: FALSIFIER_CLASSES.map((id) =>
      ({id, passed: true, testFile: FALSIFIER_WITNESS})),
  })}\n`);
  // Consolidated gate: one production of the complexity metric (the static
  // audits), a spine and a focused list that do not overlap, one seal
  // reader, every whole-tree command registered with inputs, a push hook
  // linting the pushed range, no repository-health workflow, a concurrency
  // group on the one workflow, whose one job matches the resource plan, and
  // a canary triggered by the ci run's whole-corpus signal.
  write(root, 'package.json', `${JSON.stringify({
    scripts: {
      'check': 'node scripts/check-fast-static.js',
      'test:complexity': 'node scripts/check-complexity.js',
    },
    dependencies: {},
  })}\n`);
  write(root, '.githooks/pre-commit', '#!/usr/bin/env bash\n');
  write(root, '.githooks/pre-push',
    '#!/usr/bin/env bash\nstage "lint" "pushed-range lint"\n' +
    'git diff --name-only "$BASE" HEAD | xargs npx eslint\n' +
    'stage "corpus-ratchets" "ratchets"\n');
  write(root, 'scripts/checks/run-static-audits.js',
    'const STATIC_AUDIT_SCRIPTS = Object.freeze([\n  \'test:complexity\',\n]);\n');
  write(root, 'scripts/checks/helper-import-closure.js',
    'IMPORT_GRAPH_SEAL_PATH snapshotDigest sealBindsGraph\n');
  write(root, 'test/shards/safety-spine.json',
    `${JSON.stringify({tests: ['test/a.test.js']})}\n`);
  write(root, 'test/manifests/project-hardening-proof-postpush-manifest.json',
    `${JSON.stringify({commands: [
      {id: 'focused-contracts', executable: 'node',
        argv: ['scripts/run-test-files.js', 'test/b.test.js']},
      {id: 'model-contracts', executable: 'npm', argv: ['run', 'model:contracts']},
    ]})}\n`);
  write(root, 'test/manifests/proof-obligations.json', `${JSON.stringify({
    obligations: [
      {id: 'complexity', command: 'npm run test:complexity', inputs: ['src/**']},
      {id: 'model', command: 'npm run model:contracts', inputs: ['architecture/**']},
    ],
  })}\n`);
  write(root, '.github/workflows/release.yml',
    'on: push\nconcurrency:\n  group: release\njobs:\n  publish:\n' +
    '    runs-on: ubuntu-24.04\n    timeout-minutes: 60\n    steps:\n' +
    '      - name: publish\n        run: true\n');
  write(root, 'test/manifests/ci-resource-plan.json', `${JSON.stringify({
    jobs: {'release.yml/publish': {runsOn: 'ubuntu-24.04', timeoutMinutes: 60}},
  })}\n`);
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
      'check': 'npm run audit:guideline:literals && npm run audit:file-size',
      'test:complexity': 'node scripts/check-complexity.js',
    },
    dependencies: {liferaft: '1.0.0'},
  })}\n`);
  write(root, 'README.md', 'a five-node cluster, with no dated verdict\n');
  // A receipt that shows nothing published and next trailing latest.
  write(root, 'data/releases/v9.9.9.json', `${JSON.stringify({
    tag: 'v9.9.9', published: {
      npm: {published: false, nextLagging: true}, docker: {published: false},
      helm: {published: false}, github: {published: false},
    },
  })}\n`);
  write(root, 'solve/epics/legacy-one.md',
    '---\nstatus: open\nlegacy: true\n---\n');
  write(root, 'solve/epics/legacy-two.md',
    '---\nstatus: open\nlegacy: true\n---\n');
  // A stage that reads the working tree, a census that omits the observer's
  // file, and no falsifier receipt at all.
  write(root, 'test/manifests/pre-push-stages.json', `${JSON.stringify({
    stages: [{id: 'lint', tree: 'working-tree'}],
  })}\n`);
  write(root, OBSERVER_TEST, OBSERVER_SOURCE);
  write(root, 'test/shards/subsystem-classes.json', `${JSON.stringify({
    classes: {[OBSERVER_TEST]: 'query-sql'}, observations: {},
  })}\n`);
  // The unconsolidated gate: the complexity checker produced by the
  // pre-commit hook, the static audits and a workflow (two beyond the first);
  // one test in both fixed lists; two seal readers; the model-contracts
  // command with no registered inputs (the audit is registered, the
  // manifest command is not); a push hook linting every tracked file; a
  // repository-health workflow without a concurrency group whose one job is
  // absent from the plan; and a canary with no ci signal.
  write(root, '.githooks/pre-commit',
    '#!/usr/bin/env bash\nnode scripts/check-complexity.js\n');
  write(root, '.githooks/pre-push',
    '#!/usr/bin/env bash\nstage "lint" "tracked-files lint"\n' +
    'git ls-files -z | xargs -0 npx eslint\n' +
    'stage "corpus-ratchets" "ratchets"\n');
  write(root, 'scripts/checks/run-static-audits.js',
    'const STATIC_AUDIT_SCRIPTS = Object.freeze([\n  \'test:complexity\',\n]);\n');
  write(root, 'scripts/checks/helper-import-closure.js',
    'IMPORT_GRAPH_SEAL_PATH snapshotDigest\n');
  write(root, 'scripts/checks/impact-proof-cone-inputs.js',
    'IMPORT_GRAPH_SEAL_PATH snapshotDigest\n');
  write(root, 'scripts/checks/two.js', '\n\n');
  write(root, 'test/shards/safety-spine.json',
    `${JSON.stringify({tests: ['test/a.test.js']})}\n`);
  write(root, 'test/manifests/project-hardening-proof-postpush-manifest.json',
    `${JSON.stringify({commands: [
      {id: 'focused-contracts', executable: 'node',
        argv: ['scripts/run-test-files.js', 'test/a.test.js']},
      {id: 'model-contracts', executable: 'npm', argv: ['run', 'model:contracts']},
    ]})}\n`);
  write(root, 'test/manifests/proof-obligations.json', `${JSON.stringify({
    obligations: [
      {id: 'complexity', command: 'npm run test:complexity', inputs: ['src/**']},
    ],
  })}\n`);
  write(root, '.github/workflows/repository-health.yml',
    'on: push\njobs:\n  health:\n    runs-on: ubuntu-24.04\n' +
    '    timeout-minutes: 90\n    steps:\n      - run: npm run test:complexity\n');
  write(root, '.github/workflows/full-corpus-canary.yml',
    'on: push\nconcurrency:\n  group: canary\njobs:\n  corpus:\n' +
    '    runs-on: ubuntu-24.04\n    timeout-minutes: 300\n    steps: []\n');
  write(root, 'test/manifests/ci-resource-plan.json', `${JSON.stringify({
    jobs: {'full-corpus-canary.yml/corpus': {runsOn: 'ubuntu-24.04', timeoutMinutes: 300}},
  })}\n`);
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

// --rows names rows with underscores for spaces (a probe command is split on
// whitespace); a name that matches no row is itself unmet, so a misspelled
// probe reads red instead of measuring nothing.
test('--rows selects by name and counts an unknown name as unmet', () => {
  const rows = [
    {name: 'open epics', value: 12, budget: 8, met: false},
    {name: 'open legacy epics', value: 0, budget: 0, met: true},
  ];
  assert.deepEqual(selectedRows(rows, ['--metric']), rows, 'no flag: every row');
  assert.deepEqual(selectedRows(rows, ['--rows', 'open_legacy_epics']), [rows[1]]);
  const unknown = selectedRows(rows, ['--rows', 'open_legacy_epic']);
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].met, false, 'an unknown row name is unmet');
  assert.match(unknown[0].name, /unknown budget row/u);
  assert.equal(selectedRows(rows, ['--rows'])[0].met, false, 'a missing value is unmet');
});

// next lags latest by semver order; the release owner's re-observation
// rewrites the newest receipt from npm as observed.
test('nextLagsLatest follows semver order and reobserveNext records it', () => {
  assert.equal(nextLagsLatest(null, '0.2.5'), true, 'absent next lags');
  assert.equal(nextLagsLatest('0.2.4-rc.2', '0.2.5'), true, 'older core lags');
  assert.equal(nextLagsLatest('0.2.5-rc.9', '0.2.5'), true, 'an rc of the released core lags');
  assert.equal(nextLagsLatest('0.2.5', '0.2.5'), false, 'equal is aligned');
  assert.equal(nextLagsLatest('0.3.0-rc.0', '0.2.5'), false, 'a newer prerelease leads');
  assert.equal(nextLagsLatest('0.2.4-rc.2', null), false, 'no latest, nothing to lag');
  const root = makeRoot();
  write(root, 'data/releases/v0.2.5.json', `${JSON.stringify({tag: 'v0.2.5',
    published: {npm: {published: true, latest: '0.2.5', next: '0.2.4-rc.2', nextLagging: true}}})}\n`);
  const observed = reobserveNext(root, () => ({latest: '0.2.5', next: '0.2.5'}));
  assert.equal(observed.npm.nextLagging, false);
  assert.equal(observed.npm.next, '0.2.5');
  const rewritten = JSON.parse(fs.readFileSync(path.join(root, 'data/releases/v0.2.5.json'), 'utf8'));
  assert.equal(rewritten.published.npm.nextLagging, false, 'the receipt now records the move');
  assert.ok(rewritten.published.npm.nextObservedAt);
});

// The newest receipt is the highest release version, not the last file name:
// v0.2.10 sorts below v0.2.9 lexically.
test('receipts order by version core, a prerelease before its final', () => {
  const root = makeRoot();
  for (const tag of ['v0.2.9', 'v0.2.10', 'v0.2.5', 'v0.2.10-rc.0']) {
    write(root, `data/releases/${tag}.json`, `${JSON.stringify({tag, published: {npm: {published: true}}})}\n`);
  }
  assert.equal(newestReleaseReceipt(root).tag, 'v0.2.10');
  const observed = reobserveNext(root, () => ({latest: '0.2.10', next: '0.2.10'}));
  assert.equal(observed.file, 'data/releases/v0.2.10.json', 'the owner\'s move lands on the newest release');
});


test('pre-commit refreshes generated test metadata as one owned unit', () => {
  const packageJson = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'package.json'), UTF8));
  assert.equal(
    packageJson.scripts['test:metadata:refresh'],
    'node scripts/generate-test-primary-classes.js && ' +
      'node scripts/generate-test-resource-classes.js && ' +
      'node scripts/generate-test-subsystem-classes.js && ' +
      'node scripts/generate-global-owner-debt-inventory.js ' +
      '--refresh-import-graph-only',
    'one command owns all generated test metadata refreshes',
  );

  const hook = fs.readFileSync(
    path.join(REPO_ROOT, '.githooks/pre-commit'), UTF8);
  assert.match(
    hook,
    /STAGED_METADATA.*--diff-filter=ACMRD/u,
    'metadata trigger includes deletions as well as additions/modifications/renames',
  );
  assert.match(
    hook,
    /src\/\*\|scripts\/\*\|test\/\*\) REGEN_INVENTORIES=1/u,
    'derived inventories also refresh for staged deletions',
  );
  assert.match(
    hook,
    /test\/\*\|scripts\/\*\) REGEN_TEST_METADATA=1/u,
    'test and helper-script changes trigger metadata regeneration',
  );
  assert.match(
    hook,
    /git diff --name-only -- src scripts test/u,
    'metadata regeneration refuses unstaged source/helper/test bytes',
  );
  assert.match(
    hook,
    /git ls-files --others --exclude-standard -- src scripts test/u,
    'metadata regeneration refuses untracked source/helper/test bytes',
  );
  assert.match(
    hook,
    /npm run -s test:metadata:refresh/u,
    'pre-commit invokes the canonical metadata refresh owner',
  );
  for (const artifact of [
    'test/shards/primary-classes.json',
    'test/shards/resource-classes.json',
    'test/shards/subsystem-classes.json',
    'test/shards/impact-graph-seal.json',
  ]) {
    assert.ok(
      hook.includes(artifact),
      `pre-commit stages regenerated artifact ${artifact}`,
    );
  }
});
