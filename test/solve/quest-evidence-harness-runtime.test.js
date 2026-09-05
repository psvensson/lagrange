import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

// Subtest receipts (solver-streamlining P6a): a receipt may name exactly one
// TAP test of a file with an anchored `testNamePattern`. The honesty hole:
// node --test with a pattern matching nothing exits 0 with zero tests, so a
// typo would go green; the runtime parses the TAP summary and fails on zero
// selected tests, on more than one (unless allowMultiple), and on any
// failing test. The REAL runtime module runs in its own process, the way
// every scripts/quest-evidence-*.js harness does.

const RUNTIME_MODULE = fileURLToPath(new URL(
  '../../scripts/quest-evidence-harness-runtime.js', import.meta.url));
const TMP_PREFIX = 'harness-subtest-';
const TARGET_FILE = 'target.test.mjs';
const HARNESS_FILE = 'harness.mjs';
const RECEIPT_FILE = 'receipt.json';
const TEXT_ENCODING = 'utf8';
const EXIT_OK = 0;

function tmpDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

function writeTarget(root) {
  fs.writeFileSync(path.join(root, TARGET_FILE), [
    'import {test} from \'node:test\';',
    'test(\'alpha passes\', () => {});',
    'test(\'alpha passes twice\', () => {});',
    'test(\'beta fails\', () => { throw new Error(\'beta\'); });',
    'test(\'gamma skipped\', {skip: true}, () => {});',
    'test(\'delta todo\', {todo: true}, () => { throw new Error(\'todo\'); });',
    '',
  ].join('\n'));
}

function writeHarness(root, receipts) {
  fs.writeFileSync(path.join(root, HARNESS_FILE), [
    `import {runQuestEvidenceHarness} from ${JSON.stringify(RUNTIME_MODULE)};`,
    'runQuestEvidenceHarness({',
    '  questId: \'subtest-quest\',',
    `  outputFile: ${JSON.stringify(RECEIPT_FILE)},`,
    `  receipts: ${JSON.stringify(receipts)},`,
    '});',
    '',
  ].join('\n'));
}

function runHarness(t, receipts) {
  const root = tmpDir(t);
  writeTarget(root);
  writeHarness(root, receipts);
  const run = spawnSync(process.execPath, [HARNESS_FILE],
    {cwd: root, encoding: TEXT_ENCODING});
  const receiptPath = path.join(root, RECEIPT_FILE);
  const receipt = fs.existsSync(receiptPath) ?
    JSON.parse(fs.readFileSync(receiptPath, TEXT_ENCODING)) : null;
  return {run, receipt};
}

test('subtest-receipt-runs-exactly-one-named-test', (t) => {
  const {run, receipt} = runHarness(t, [{id: 'one', testFile: TARGET_FILE,
    testNamePattern: '^alpha passes$', detail: 'exactly one test'}]);
  assert.equal(run.status, EXIT_OK, run.stderr);
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.receipts[0].passed, true);
  assert.match(receipt.receipts[0].command,
    /node --test-reporter=tap --test-name-pattern="\^alpha passes\$" target\.test\.mjs$/u,
    'the recorded command is the verbatim node:test invocation');
});

test('subtest-receipt-fails-on-zero-selected-tests', (t) => {
  const {run, receipt} = runHarness(t, [{id: 'typo', testFile: TARGET_FILE,
    testNamePattern: '^alpha pases$', detail: 'a typo must not go green'}]);
  assert.notEqual(run.status, EXIT_OK);
  assert.equal(receipt.status, 'fail');
  assert.match(receipt.receipts[0].failure, /selected zero tests/u);
});

test('subtest-receipt-fails-on-multiple-or-failing-tests', (t) => {
  const multiple = runHarness(t, [{id: 'many', testFile: TARGET_FILE,
    testNamePattern: '^alpha passes.*$', detail: 'two tests match'}]);
  assert.equal(multiple.receipt.receipts[0].passed, false);
  assert.match(multiple.receipt.receipts[0].failure, /selected 2 tests/u);
  const allowed = runHarness(t, [{id: 'many-ok', testFile: TARGET_FILE,
    testNamePattern: '^alpha passes.*$', allowMultiple: true,
    detail: 'two tests allowed'}]);
  assert.equal(allowed.receipt.receipts[0].passed, true);
  const failing = runHarness(t, [{id: 'red', testFile: TARGET_FILE,
    testNamePattern: '^beta fails$', detail: 'a failing test'}]);
  assert.equal(failing.receipt.receipts[0].passed, false);
});

test('skipped-or-todo-selected-test-fails-closed', (t) => {
  for (const pattern of ['^gamma skipped$', '^delta todo$']) {
    const {receipt} = runHarness(t, [{id: 'nothing-ran', testFile: TARGET_FILE,
      testNamePattern: pattern, detail: 'ran nothing'}]);
    assert.equal(receipt.receipts[0].passed, false, pattern);
    assert.match(receipt.receipts[0].failure, /skipped or marked todo/u);
  }
});

test('unanchored-pattern-refused', (t) => {
  const {run, receipt} = runHarness(t, [{id: 'loose', testFile: TARGET_FILE,
    testNamePattern: 'alpha', detail: 'unanchored'}]);
  assert.notEqual(run.status, EXIT_OK);
  assert.match(run.stderr, /must be anchored \^\.\.\.\$/u);
  assert.equal(receipt, null, 'no receipt is written for a refused harness');
});
