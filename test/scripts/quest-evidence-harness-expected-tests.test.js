/**
 * The quest-evidence harness's exact-count rule: a subtest receipt that
 * declares `expectedTests` fails when its anchored pattern selects any other
 * number of tests, so a renamed or dropped witness cannot pass as a subset of
 * the alternation it was declared with. Measured through a real child
 * harness over a temporary two-test node:test file.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HARNESS = path.resolve('scripts/quest-evidence/harness-runtime.js');
const WITNESS_SOURCE = [
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
    fs.writeFileSync(witnessFile, WITNESS_SOURCE);
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
