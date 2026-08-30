import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {inspectChangeArtifact} from '../../scripts/solve/change-artifact.js';
import {EVENT_ATTEMPT} from '../../scripts/solve/constants.js';
import {runStep} from '../../scripts/solve/step.js';
import {readLog, saveQuest} from '../../scripts/solve/store.js';

// Deterministic witness for the solver-capture-foreign-evidence-exclusion
// quest, driven through the REAL step auto-capture (runStep --auto-diff ->
// createAutoDiffChangeRef -> inspectChangeArtifact) and the REAL evidence
// harness runtime on temporary repositories.
//
// The friction: every evidence harness rewrites solve/evidence/<its
// quest>.receipt.json with a fresh generatedAt, so a shared worktree carries
// OTHER quests' regenerated receipts as dirty paths. The auto-capture sweep
// excluded solve/state, solve/log, solve/report, solve/artifacts and the
// frontier board but not solve/evidence, so a foreign receipt rode into the
// captured attempt: classified `workflow` (solve/ prefix) it refused a
// product quest ("workflow changes must be recorded in a workflow/Quest
// tooling Quest") or polluted a workflow quest's recorded union. Evidence
// identity deliberately keeps generatedAt (a receipt is fresh evidence only
// when regenerated); the cure is scoping the capture to this quest's own
// evidence and giving the harness runtime `--output <path>` so a verifier
// regenerates a receipt to scratch without dirtying solve/evidence.
//
// Every scenario name below is anchored to one sealed receipt id so the
// evidence harness selects it with --test-name-pattern.

const TMP_PREFIX = 'solver-capture-foreign-evidence-';
const WORKFLOW_QUEST_ID = 'foreign-evidence-workflow';
const PRODUCT_QUEST_ID = 'foreign-evidence-product';
const OTHER_QUEST_ID = 'other-quest';
const WORKFLOW_SOURCE = 'scripts/solve/fixture-owner.js';
const PRODUCT_SOURCE = 'src/a.js';
const WORKFLOW_SOURCE_BASE = 'export const owner = 1;\n';
const WORKFLOW_SOURCE_CANDIDATE = 'export const owner = 2;\n';
const PRODUCT_SOURCE_BASE = 'export const a = 1;\n';
const PRODUCT_SOURCE_CANDIDATE = 'export const a = 2;\n';
const ORACLE_OPEN = {metric: 2, target: 0};
const ORACLE_CLOSER = {metric: 1, target: 0};
const RECEIPT_SCHEMA = 'test-receipt/1';
const FIXTURE_RECEIPT_ID = 'fixture-receipt';
const FIXTURE_RECEIPT_COMMAND = 'true';
const PRODUCT_PLAN_DOC = 'solve/epics/foreign-evidence-product.md';
const TEST_RECEIPT_PROBE = 'test-receipt';
const RECEIPT_GENERATED_AT_BASE = '2026-08-30T06:00:00.000Z';
const RECEIPT_GENERATED_AT_REGENERATED = '2026-08-30T07:00:00.000Z';
const WORKFLOW_SCOPE_REFUSAL =
  /workflow changes must be recorded in a workflow\/Quest tooling Quest/u;
const AUTO_DIFF_EMPTY = /auto-diff: git diff is empty/u;
const RUNTIME_MODULE = fileURLToPath(new URL(
  '../../scripts/quest-evidence-harness-runtime.js', import.meta.url));
const HARNESS_FILE = 'harness.js';
const HARNESS_QUEST_ID = 'scratch-output-quest';
const HARNESS_DEFAULT_OUTPUT =
  `solve/evidence/${HARNESS_QUEST_ID}.receipt.json`;
const HARNESS_RECEIPT_ID = 'noop-receipt';
const HARNESS_RECEIPT_COMMAND = 'true';
const SCRATCH_RECEIPT_NAME = 'scratch.receipt.json';
const OUTPUT_FLAG = '--output';
const STATUS_PASS = 'pass';
const STATUS_FAIL = 'fail';
const EXIT_OK = 0;
const TEXT_ENCODING = 'utf8';

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: TEXT_ENCODING,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function writeFile(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function receiptPath(questId) {
  return `solve/evidence/${questId}.receipt.json`;
}

// A real test-receipt/1 artifact: one recorded command whose receipt is
// still red, so the product quest's doneWhen measures it without closing.
function receiptBytes(questId, generatedAt) {
  return `${JSON.stringify({
    schema: RECEIPT_SCHEMA,
    quest: questId,
    status: STATUS_FAIL,
    generatedAt,
    receipts: [{
      id: FIXTURE_RECEIPT_ID,
      passed: false,
      command: FIXTURE_RECEIPT_COMMAND,
      detail: 'fixture receipt',
    }],
  }, null, 2)}\n`;
}

function tmpDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

// A temporary repository holding one workflow-owned source file, one runtime
// source file, and the committed evidence receipts of this quest and of a
// foreign quest — the shared-worktree shape the incident occurred in.
function fixture(t, quest) {
  const root = tmpDir(t);
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFile(root, WORKFLOW_SOURCE, WORKFLOW_SOURCE_BASE);
  writeFile(root, PRODUCT_SOURCE, PRODUCT_SOURCE_BASE);
  writeFile(root, receiptPath(quest.id),
    receiptBytes(quest.id, RECEIPT_GENERATED_AT_BASE));
  writeFile(root, receiptPath(OTHER_QUEST_ID),
    receiptBytes(OTHER_QUEST_ID, RECEIPT_GENERATED_AT_BASE));
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const oracleFile = path.join(root, 'solve', 'oracle', `${quest.id}.json`);
  fs.mkdirSync(path.dirname(oracleFile), {recursive: true});
  fs.writeFileSync(oracleFile, JSON.stringify(ORACLE_OPEN));
  // A product quest must measure non-oracle evidence: its own test-receipt
  // (the very artifact class the foreign receipt belongs to).
  const metric = quest.class === 'product' ? {
    probe: TEST_RECEIPT_PROBE,
    args: {
      file: path.join(root, receiptPath(quest.id)),
      requiredReceipts: [FIXTURE_RECEIPT_ID],
    },
  } : {probe: 'oracle', args: {file: oracleFile}};
  const sealed = {
    ...quest,
    authoringContractVersion: 1,
    verificationContractVersion: 2,
    priority: 1,
    doneWhen: metric,
    frontiers: [{id: `${quest.id}-main`, priority: 1, metric}],
    constraints: [],
  };
  saveQuest(root, sealed);
  return {root, quest: sealed, oracleFile};
}

// A process quest whose sealed statement cites a Solver tooling owner, so
// its scope is workflow and its own source edit is admitted.
function workflowQuest() {
  return {
    id: WORKFLOW_QUEST_ID,
    class: 'process',
    statement: `The auto-capture owner ${WORKFLOW_SOURCE} excludes foreign ` +
      'evidence.',
  };
}

function productQuest() {
  return {
    id: PRODUCT_QUEST_ID,
    class: 'product',
    statement: 'The runtime fixture reaches zero.',
    links: {planDoc: PRODUCT_PLAN_DOC},
  };
}

// The operator sequence: begin the step, make the source change, and — as a
// foreign harness does in the shared worktree — regenerate the OTHER quest's
// receipt (fresh generatedAt) before capturing with --auto-diff.
function captureWithForeignReceipt(fx, sourcePath, candidate) {
  assert.equal(runStep(fx.root, fx.quest).terminal, null, 'the step begins');
  writeFile(fx.root, sourcePath, candidate);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_CLOSER));
  writeFile(fx.root, receiptPath(OTHER_QUEST_ID),
    receiptBytes(OTHER_QUEST_ID, RECEIPT_GENERATED_AT_REGENERATED));
  return runStep(fx.root, fx.quest, {
    autoDiff: true,
    summary: 'auto-captured attempt beside a foreign receipt',
  });
}

// The unchanged control: this quest's OWN receipt regenerated beside its
// source change, with no foreign receipt in play.
function captureWithOwnReceipt(fx, sourcePath, candidate) {
  assert.equal(runStep(fx.root, fx.quest).terminal, null, 'the step begins');
  writeFile(fx.root, sourcePath, candidate);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_CLOSER));
  writeFile(fx.root, receiptPath(fx.quest.id),
    receiptBytes(fx.quest.id, RECEIPT_GENERATED_AT_REGENERATED));
  return runStep(fx.root, fx.quest, {
    autoDiff: true,
    summary: 'auto-captured attempt beside its own receipt',
  });
}

function recordedChangedPaths(fx) {
  const attempts = readLog(fx.root, fx.quest.id)
    .filter((event) => event.type === EVENT_ATTEMPT);
  assert.equal(attempts.length, 1, 'exactly one attempt is recorded');
  return [...inspectChangeArtifact(fx.root, fx.quest, attempts[0].changeRef)
    .changedPaths].sort();
}

function captureOutcome(t) {
  const fx = fixture(t, workflowQuest());
  captureWithForeignReceipt(fx, WORKFLOW_SOURCE, WORKFLOW_SOURCE_CANDIDATE);
  return recordedChangedPaths(fx);
}

// A minimal harness that declares one always-green shell receipt through the
// REAL runtime module, run as its own process the way every
// scripts/quest-evidence-*.js harness is.
function harnessFixture(t) {
  const root = tmpDir(t);
  writeFile(root, HARNESS_FILE, [
    `import {runQuestEvidenceHarness} from ${JSON.stringify(RUNTIME_MODULE)};`,
    'runQuestEvidenceHarness({',
    `  questId: ${JSON.stringify(HARNESS_QUEST_ID)},`,
    `  outputFile: ${JSON.stringify(HARNESS_DEFAULT_OUTPUT)},`,
    `  receipts: [{id: ${JSON.stringify(HARNESS_RECEIPT_ID)}, ` +
      `command: ${JSON.stringify(HARNESS_RECEIPT_COMMAND)}, ` +
      'detail: \'always green\'}],',
    '});',
    '',
  ].join('\n'));
  return root;
}

function runHarness(root, extraArguments) {
  return spawnSync(process.execPath, [HARNESS_FILE, ...extraArguments], {
    cwd: root,
    encoding: TEXT_ENCODING,
  });
}

function readReceipt(file) {
  return JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
}

test('foreign-receipt-excluded-from-auto-capture: another quest\'s ' +
  'regenerated receipt is not swept into this quest\'s auto-captured ' +
  'attempt', (t) => {
  const fx = fixture(t, workflowQuest());
  captureWithForeignReceipt(fx, WORKFLOW_SOURCE, WORKFLOW_SOURCE_CANDIDATE);
  assert.deepEqual(recordedChangedPaths(fx), [WORKFLOW_SOURCE],
    'the recorded attempt names only this quest\'s own change');
  assert.match(git(fx.root, ['status', '--porcelain', '--',
    receiptPath(OTHER_QUEST_ID)]), /^ ?M /u,
  'the foreign receipt stays dirty in the worktree, untouched');
});

test('product-quest-not-refused-by-foreign-receipt: a product quest\'s ' +
  'auto-captured attempt is recorded instead of refused as a workflow ' +
  'change', (t) => {
  const fx = fixture(t, productQuest());
  let outcome = null;
  try {
    outcome = captureWithForeignReceipt(
      fx, PRODUCT_SOURCE, PRODUCT_SOURCE_CANDIDATE);
  } catch (error) {
    outcome = error;
  }
  assert.ok(!(outcome instanceof Error),
    `the capture must not refuse: ${outcome?.message || ''}`);
  assert.doesNotMatch(String(outcome?.message || ''), WORKFLOW_SCOPE_REFUSAL);
  assert.deepEqual(recordedChangedPaths(fx), [PRODUCT_SOURCE]);
});

test('foreign-receipt-only-change-captures-nothing: when the only dirty ' +
  'path is another quest\'s receipt the capture is empty and refused as ' +
  'nothing changed', (t) => {
  const fx = fixture(t, workflowQuest());
  assert.equal(runStep(fx.root, fx.quest).terminal, null);
  writeFile(fx.root, receiptPath(OTHER_QUEST_ID),
    receiptBytes(OTHER_QUEST_ID, RECEIPT_GENERATED_AT_REGENERATED));
  assert.throws(() => runStep(fx.root, fx.quest, {
    autoDiff: true,
    summary: 'nothing of this quest changed',
  }), AUTO_DIFF_EMPTY, 'a foreign receipt alone is not a change');
  assert.deepEqual(readLog(fx.root, fx.quest.id)
    .filter((event) => event.type === EVENT_ATTEMPT), [],
  'no attempt is recorded for a foreign receipt');
});

test('own-receipt-still-captured-unchanged: this quest\'s own regenerated ' +
  'receipt is captured exactly as before', (t) => {
  const fx = fixture(t, workflowQuest());
  captureWithOwnReceipt(fx, WORKFLOW_SOURCE, WORKFLOW_SOURCE_CANDIDATE);
  assert.deepEqual(recordedChangedPaths(fx),
    [WORKFLOW_SOURCE, receiptPath(WORKFLOW_QUEST_ID)].sort(),
    'the own receipt rides with the change');
});

test('harness-output-option-writes-to-scratch: `--output <path>` writes the ' +
  'receipt to the scratch path and leaves solve/evidence untouched', (t) => {
  const root = harnessFixture(t);
  const scratch = path.join(tmpDir(t), SCRATCH_RECEIPT_NAME);
  const run = runHarness(root, [OUTPUT_FLAG, scratch]);
  assert.equal(run.status, EXIT_OK, run.stderr);
  assert.ok(fs.existsSync(scratch), 'the scratch receipt is written');
  const receipt = readReceipt(scratch);
  assert.equal(receipt.quest, HARNESS_QUEST_ID);
  assert.equal(receipt.status, STATUS_PASS);
  assert.deepEqual(receipt.receipts.map((entry) => entry.id),
    [HARNESS_RECEIPT_ID]);
  assert.equal(fs.existsSync(path.join(root, HARNESS_DEFAULT_OUTPUT)), false,
    'the declared solve/evidence receipt is not written');
  assert.ok(run.stdout.includes(scratch), 'the summary names the scratch path');
});

test('harness-default-output-unchanged: without `--output` the harness ' +
  'writes its declared solve/evidence receipt', (t) => {
  const root = harnessFixture(t);
  const run = runHarness(root, []);
  assert.equal(run.status, EXIT_OK, run.stderr);
  const receipt = readReceipt(path.join(root, HARNESS_DEFAULT_OUTPUT));
  assert.equal(receipt.quest, HARNESS_QUEST_ID);
  assert.equal(receipt.status, STATUS_PASS);
  assert.equal(typeof receipt.generatedAt, 'string',
    'the receipt keeps its generatedAt identity');
});

test('witness-deterministic: two identical capture fixtures record the ' +
  'identical changed-path set', (t) => {
  const first = captureOutcome(t);
  const second = captureOutcome(t);
  assert.deepEqual(first, second,
    'the captured path set is a pure function of the tree and the quest id');
});
