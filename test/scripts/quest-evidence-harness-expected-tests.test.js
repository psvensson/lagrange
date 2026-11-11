/**
 * The quest-evidence harness's exact-count rule: a subtest receipt that
 * declares `expectedTests` fails when its anchored pattern selects any other
 * number of tests, so a renamed or dropped witness cannot pass as a subset of
 * the alternation it was declared with. Measured through a real child
 * harness over a temporary two-test node:test file.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {appendEntry} from '../../scripts/solve/store.js';
import {ENTRY_TYPE, VERDICT, VERIFIER_PREFIX, entryProblems} from '../../scripts/solve/schema.js';
import {CHECK_VERIFICATION_FLAG} from '../../scripts/quest-evidence/verification-check.js';

const HARNESS = path.resolve('scripts/quest-evidence/harness-runtime.js');
const PAIR_TEST_FILE_CONTENT = [
  'import {test} from \'node:test\';',
  'test(\'pair A one\', () => {});',
  'test(\'pair A two\', () => {});',
  '',
].join('\n');

function producerSource(witnessFile, expectedTests) {
  return [
    `import {runQuestEvidenceHarness} from ${JSON.stringify(HARNESS)};`,
    'runQuestEvidenceHarness({questId: \'expected-tests-witness\',',
    '  outputFile: \'receipt.json\', receipts: [{id: \'pair\',',
    `  testFile: ${JSON.stringify(witnessFile)},`,
    '  testNamePattern: \'^pair A (one|two)$\',',
    `  expectedTests: ${expectedTests}, detail: 'two named tests'}]});`,
    '',
  ].join('\n');
}

function runHarness(expectedTests) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quest-evidence-'));
  try {
    const witnessFile = path.join(directory, 'pair.test.js');
    const producer = path.join(directory, 'producer.mjs');
    const output = path.join(directory, 'receipt.json');
    fs.writeFileSync(witnessFile, PAIR_TEST_FILE_CONTENT);
    fs.writeFileSync(producer, producerSource(witnessFile, expectedTests));
    let exitCode = 0;
    try {
      execFileSync(process.execPath, [producer, '--output', output],
        {stdio: 'pipe', encoding: 'utf8', cwd: directory});
    } catch (error) {
      exitCode = error.status;
    }
    const receipt = JSON.parse(fs.readFileSync(output, 'utf8')).receipts[0];
    return {exitCode, passed: receipt.passed, failure: receipt.failure ?? null};
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

test('a receipt whose pattern selects exactly expectedTests tests passes', () => {
  assert.deepEqual(runHarness(2), {exitCode: 0, passed: true, failure: null});
});

test('a receipt whose pattern selects fewer tests than expectedTests fails by count', () => {
  const run = runHarness(3);
  assert.equal(run.passed, false, 'a smaller selected subset must not pass');
  assert.notEqual(run.exitCode, 0, 'the harness exits non-zero');
  assert.equal(run.failure, 'the pattern selected 2 tests, expected exactly 3');
});

// These isolated Solver histories test the read-only CLI mode. They are not
// accepted Quest evidence or comparative-system observations. The actual child
// entrypoints must exit before any declared receipt or benchmark can execute.
const VERIFICATION_QUESTS = Object.freeze([
  'benchmark-cohort-preserving-dataset-reset',
  'cache-replica-incarnation-coherence',
  'canonical-report-outcome-classification',
  'catalog-authority-and-visible-reconciliation',
  'cdc-recipient-domain-and-retained-debt',
  'contract-first-authoring-and-producer-fidelity',
  'formation-spread-progress-at-cause',
  'fresh-seed-activation',
  'lab-census-benchmark-evidence-custody',
  'load-admission-ingress-identity',
  'management-action-authority',
  'node-startup-natural-shutdown',
  'repository-legacy-fallback-closure',
  'retained-seed-original-handoff',
  'routing-overlay-complete-state-retirement',
  'table-policy-outstanding-read-currency',
  'tidb-canonical-semantic-case-completion',
]);
const CONTROL_VERIFIER = `${VERIFIER_PREFIX}isolated-verification-control`;
const CHILD_TIMEOUT_MS = 10_000;
const ATTEMPT = Object.freeze({type: ENTRY_TYPE.ATTEMPT, text: 'isolated attempt'});
const APPROVAL = Object.freeze({type: ENTRY_TYPE.VERIFICATION,
  text: 'isolated approval control', verifier: CONTROL_VERIFIER, verdict: VERDICT.APPROVE});
const REJECTION = Object.freeze({...APPROVAL, verdict: VERDICT.REJECT});
const CONTROL_HISTORIES = Object.freeze([
  {name: 'missing history', entries: [], approved: false, current: false,
    attempts: 0, verifier: null},
  {name: 'attempt without review', entries: [ATTEMPT], approved: false, current: false,
    attempts: 1, verifier: null},
  {name: 'seal review without attempt', entries: [APPROVAL], approved: false, current: true,
    attempts: 0, verifier: CONTROL_VERIFIER},
  {name: 'current independent approval', entries: [ATTEMPT, APPROVAL], approved: true,
    current: true, attempts: 1, verifier: CONTROL_VERIFIER},
  {name: 'approval before later attempt', entries: [ATTEMPT, APPROVAL, ATTEMPT], approved: false,
    current: false, attempts: 2, verifier: CONTROL_VERIFIER},
  {name: 'rejection supersedes approval', entries: [ATTEMPT, APPROVAL, REJECTION], approved: false,
    current: true, attempts: 1, verifier: CONTROL_VERIFIER},
]);

function assertVerificationEntryPoints(directory, expected) {
  for (const quest of VERIFICATION_QUESTS) {
    const script = path.resolve('scripts/quest-evidence', `${quest}.js`);
    const result = spawnSync(process.execPath, [script, CHECK_VERIFICATION_FLAG], {
      cwd: directory, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS,
    });
    assert.equal(result.error, undefined, `${quest}: child must complete`);
    assert.equal(result.signal, null, `${quest}: child must exit normally`);
    assert.equal(result.status, expected.approved ? 0 : 1, `${quest}: ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), expected, quest);
    assert.equal(fs.existsSync(path.join(directory, 'solve', 'quests', quest, 'evidence')),
      false, `${quest}: verification-only mode must not run the evidence writer`);
  }
}

for (const history of CONTROL_HISTORIES) {
  test(`verification-only entrypoints preserve ${history.name}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quest-verification-'));
    try {
      for (const quest of VERIFICATION_QUESTS) {
        for (const entry of history.entries) {
          assert.deepEqual(entryProblems(entry), [], 'controls consume the Solver entry contract');
          appendEntry(directory, quest, entry);
        }
      }
      const {approved, current, attempts, verifier} = history;
      assertVerificationEntryPoints(directory, {approved, verifier, current, attempts});
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
}

test('verification-only entrypoints refuse malformed verifier identities', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quest-verification-'));
  try {
    const malformed = {...APPROVAL, verifier: [CONTROL_VERIFIER]};
    assert.notDeepEqual(entryProblems(malformed), [], 'the Solver owner rejects this shape');
    for (const quest of VERIFICATION_QUESTS) {
      appendEntry(directory, quest, ATTEMPT);
      appendEntry(directory, quest, malformed);
    }
    assertVerificationEntryPoints(directory,
      {approved: false, verifier: null, current: true, attempts: 1});
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
