#!/usr/bin/env node
// Original native red intake only: no test execution or successful receipt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Parser} from 'tap-parser';
import {spawnGit} from '../checks/git-invocation.js';
import {gitProcessEnvironment} from '../checks/git-process-environment.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_ACTION as ACTION} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUEST = 'participant-release-current-control-replay';
const SOURCE = 'bd2c33ec50d93a70a65d2c06b8f0a527df4523cd';
const PLACEMENT = 'bd2c33ec50d9-mwpfxueq-3402077';
const HOST = 'adams-gamla';
const LOG = `${PLACEMENT}-${HOST}.log`;
const TEST = 'test/partition/participant-release-current-control-replay.test.js';
const CASES = [
  'current dependent replay with live control resumes through the actual recipient',
  'current dependent replay refuses control loss after real PAUSE before RESUME',
];
const FILES = [TEST, 'test/partition/participant-release-caller-lifetimes.test.js',
  'test/partition/participant-release-protocol.test.js'];
const ASSERTION_COUNTS = [2, 4, 19];
const PRODUCTION = ['src/node/replica-handler-participant-cutover.js',
  'src/node/replica-handler-participant-release.js', 'src/node/participant-release-client.js',
  'src/partition/partition-participant-transaction-pause.js'];
const REQUIRED = ['current-control-loss-before-replay-resume',
  'healthy-current-replay-and-retained-origin',
  'original-control-loss-and-release-lifetime-composition',
  'independent-contract-and-execution-review'];
const SELECTION_FILE = 'selection.json';
const TEST_RESULTS_FILE = 'test-results.ndjson';
const DIGESTS = {
  [LOG]: '529e1a1ce6ffc5a7303e42b1031279fe2653aa7fd54fb4d72b1dae7263a2e19a',
  [SELECTION_FILE]: 'dd39a7fb8f7fa34f511628250880c85879e128246bb44d433f5d83b7fb5c73ed',
  [TEST_RESULTS_FILE]: '3c223cb4821755803ab50284d4784f8b8ce20a63a2616d8ce3d0a094056908fe',
};
const MAX_BYTES = 131072;
const ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_DIGEST_ENCODING = 'hex';
const LINE_DELIMITER = '\n';
const TAP_PLACEMENT_MODE_MARKER = 'mode:local retry:0 ';
const TAP_SUMMARY_LINE = '# test-files total=3 pass=2 fail=1 assertions=25\n';
const TAP_HEADER_LINE = 'TAP version 13\n';
const TAP_TIME_PREFIX = '# time=';
const TAP_SECTION_ASSERT_MESSAGE = 'complete failing TAP section';
const TAP_EVENT_ASSERT = 'assert';
const TAP_EVENT_COMPLETE = 'complete';
const ASSERTION_ERROR_CODE = 'ERR_ASSERTION';
const STRICT_EQUAL_OPERATOR = 'strictEqual';
const OBSERVED_ANSWER_PREFIX = '# {"answer":';
const OBSERVED_EFFECTS_MESSAGE = 'actual replay effects';
const GIT_SHOW_COMMAND = 'show';
const GIT_SHOW_STDIO = ['ignore', 'pipe', 'pipe'];
const EXPECTED_ARGV_COUNT = 3;
const ARGV_COUNT_MESSAGE = 'one original directory argument';
const RECEIPT_STATUS_FAIL = 'fail';
const RECEIPT_CEILING =
  'Original native in-process replay divergence on an identified physical host. ' +
  'Native build/process hashes were not captured. No green repair, automatic recovery, ' +
  'physical formation or task-3823 causal attribution.';
const RECEIPT_FAILURE_SUMMARY =
  'Original red admitted; repair and complete current interaction await proof.';
const OUTPUT = path.join(ROOT, 'solve/quests', QUEST, 'evidence/receipt.json');
const UNAVAILABLE = {schema: 'test-receipt/1', quest: QUEST, status: 'unavailable', receipts: []};

function digest(bytes) {
  return createHash(HASH_ALGORITHM).update(bytes).digest(HASH_DIGEST_ENCODING);
}

function writeReceipt(receipt) {
  fs.mkdirSync(path.dirname(OUTPUT), {recursive: true});
  const temporary = `${OUTPUT}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(temporary, OUTPUT);
}

function readOriginals(directory) {
  const originals = {};
  for (const [name, expected] of Object.entries(DIGESTS)) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_BYTES, name);
    const bytes = fs.readFileSync(file);
    assert.equal(digest(bytes), expected, `original ${name}`);
    originals[name] = bytes.toString(ENCODING);
  }
  return originals;
}

function verifyLedger(originals) {
  const selection = JSON.parse(originals[SELECTION_FILE]);
  assert.equal(selection.sha, SOURCE);
  assert.equal(selection.host, HOST);
  assert.deepEqual([...selection.files].sort(), [...FILES].sort());
  const ledger = originals[TEST_RESULTS_FILE].trim().split(LINE_DELIMITER).map(JSON.parse);
  assert.equal(ledger.length, FILES.length);
  for (const [index, file] of FILES.entries()) {
    const [row] = ledger.filter((entry) => entry.file === file);
    assert.equal(ledger.filter((entry) => entry.file === file).length, 1);
    assert.equal(row.attempt, 1);
    assert.equal(row.retriedOnce, false);
    assert.equal(row.ok, index !== 0);
    assert.equal(row.assertions, ASSERTION_COUNTS[index]);
    assert.ok(originals[LOG].includes(`placement-results=${JSON.stringify(row)}`));
  }
  return {selection, ledger};
}

function parseTap(raw) {
  assert.ok(
    raw.includes(`placement-head=${SOURCE}\n`) && raw.includes(TAP_PLACEMENT_MODE_MARKER),
  );
  assert.ok(raw.includes(TAP_SUMMARY_LINE));
  const start = raw.indexOf(TAP_HEADER_LINE);
  const end = raw.indexOf(TAP_TIME_PREFIX, start);
  assert.ok(start >= 0 && end > start, TAP_SECTION_ASSERT_MESSAGE);
  const parser = new Parser();
  const assertions = [];
  let final;
  parser.on(TAP_EVENT_ASSERT, (result) => assertions.push(result));
  parser.on(TAP_EVENT_COMPLETE, (result) => {
    final = result;
  });
  parser.end(raw.slice(start, end));
  return {assertions, final};
}

function verifyTap(raw) {
  const {assertions, final} = parseTap(raw);
  assert.equal(final.ok, false);
  assert.equal(final.count, CASES.length);
  assert.equal(final.pass, 1);
  assert.equal(final.fail, 1);
  assert.ok(!final.bailout);
  assert.equal(assertions.length, CASES.length);
  for (const [index, result] of assertions.entries()) {
    assert.equal(result.name, CASES[index]);
    assert.equal(result.ok, index === 0);
    assert.ok(!result.skip && !result.todo && !result.tapError);
  }
  const failure = assertions[1].diag;
  assert.equal(failure.code, ASSERTION_ERROR_CODE);
  assert.equal(failure.operator, STRICT_EQUAL_OPERATOR);
  assert.equal(failure.actual, OUTCOME.CUT_OVER);
  assert.equal(failure.expected, OUTCOME.UNAVAILABLE);
  assert.ok(failure.stack.includes(`${TEST}:157:12`));
  return {tests: final.count, passed: final.pass, failed: final.fail};
}

function verifyObservedEffects(raw) {
  // Node TAP diagnostics escape backslashes in nested JSON. Check the emitted
  // primitive effect suffix exactly; do not reinterpret escaped census JSON.
  const observations = raw.split(LINE_DELIMITER)
    .filter((line) => line.startsWith(OBSERVED_ANSWER_PREFIX));
  assert.equal(observations.length, CASES.length);
  const effectSuffix = JSON.stringify({admission: ADMISSION.OPEN,
    dependentActions: [ACTION.RELEASE, ACTION.INSPECT, ACTION.PAUSE, ACTION.RESUME],
    controlOutcomes: [OUTCOME.CUT_OVER]}).slice(1);
  for (const observation of observations) {
    assert.ok(observation.startsWith(`# {"answer":{"outcome":"${OUTCOME.CUT_OVER}",`));
    assert.ok(observation.endsWith(effectSuffix), OBSERVED_EFFECTS_MESSAGE);
  }
  return {count: observations.length, effectSuffix};
}

function sourceDigests(files) {
  return Object.fromEntries(files.map((file) => {
    const result = spawnGit([GIT_SHOW_COMMAND, `${SOURCE}:${file}`], {cwd: ROOT,
      env: gitProcessEnvironment(), stdio: GIT_SHOW_STDIO});
    assert.equal(result.status, 0, `source blob ${file}`);
    const expected = digest(result.stdout);
    assert.equal(digest(fs.readFileSync(path.join(ROOT, file))), expected, `current ${file}`);
    return [file, expected];
  }));
}

try {
  // Invalidate the fixed output before resolving any input, including missing paths.
  writeReceipt(UNAVAILABLE);
  assert.equal(process.argv.length, EXPECTED_ARGV_COUNT, ARGV_COUNT_MESSAGE);
  const directory = fs.realpathSync(process.argv[2]);
  assert.ok(fs.statSync(directory).isDirectory());
  const originals = readOriginals(directory);
  const provenance = verifyLedger(originals);
  const measured = verifyTap(originals[LOG]);
  const observations = verifyObservedEffects(originals[LOG]);
  const receipt = {...UNAVAILABLE, status: RECEIPT_STATUS_FAIL, sourceCommit: SOURCE,
    generatedAt: new Date().toISOString(), placementId: PLACEMENT, host: HOST,
    testFileDigests: sourceDigests(FILES), productionFileDigests: sourceDigests(PRODUCTION),
    originalDigests: DIGESTS, provenance, measured, observations,
    ceiling: RECEIPT_CEILING,
    receipts: REQUIRED.map((id) => ({id, passed: false,
      failure: RECEIPT_FAILURE_SUMMARY})),
  };
  writeReceipt(receipt);
  process.stdout.write(`${JSON.stringify({status: receipt.status, measured, output: OUTPUT})}\n`);
} catch (error) {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
}
