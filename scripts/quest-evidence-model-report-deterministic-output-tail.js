// Deterministic evidence harness for the
// model-report-deterministic-output-tail quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs
// each recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/model-report-deterministic-output-tail.receipt.json).
//
// Defect: the TLC *.model.report.json writer (scripts/model-tlc.js) refreshed
// the versioned evidence copy under architecture/contracts/evidence/ with a
// raw TLC output tail carrying wall-clock stamps, so every `npm run
// model:contracts` (a `test:gate` step) dirtied a clean checkout and the 0.2
// release receipt recorded treeCleanAtFinish:false. The fix gives the tail a
// single deterministic owner (scripts/model-tlc-output-tail.js).
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern; every receipt re-executes
// its scenario or shell proof rather than trusting a claim. The two shell
// receipts run the real model checkers: the tree-clean receipt fails whenever
// a model:contracts run leaves any tracked evidence file modified, and the
// outcomes receipt fails whenever any registered TLC configuration stops
// meeting its declared expectation (the pass/fail semantics moved).

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST = 'test/scripts/model-tlc-output-tail.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';
const MODEL_CHECKERS_TIMEOUT_MS = 900_000;

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so a
// green receipt is honest (its scenario exits 0).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

// Run the release-gate model step, then fail closed unless every tracked
// evidence file is byte-identical to its committed form.
const MODEL_CONTRACTS_LEAVES_TREE_CLEAN_COMMAND =
  'npm run model:contracts >/dev/null 2>&1 && ' +
  '[ "$(git status --porcelain -- architecture/contracts/evidence | wc -l)" ' +
  '-eq 0 ]';

// Re-run every registered TLC configuration and assert each fresh report
// still carries its declared outcome: expectationMet, and converged equal to
// expectConverged. The runner's own exit code already enforces the former;
// the explicit read makes the unchanged pass/fail semantics a recorded fact.
const MODEL_OUTCOMES_UNCHANGED_COMMAND =
  'npm run model:tlc >/dev/null 2>&1 && node --input-type=module -e "' +
  'import fs from \'node:fs\';' +
  'import {CONFIGS} from \'./scripts/model-tlc-configs.js\';' +
  'for (const config of CONFIGS) {' +
  '  const report = JSON.parse(fs.readFileSync(' +
  '    \'test-output/reports/\' + config.report, \'utf8\'));' +
  '  if (report.expectationMet !== true ||' +
  '      report.converged !== config.expectConverged) {' +
  '    throw new Error(\'model outcome changed: \' + config.mode);' +
  '  }' +
  '}"';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^success-report-stable-across-timestamps'),
    detail: 'rendering the same converged TLC run with two different ' +
      'wall-clock stamps, seeds, pids, and parse paths yields byte-identical ' +
      'report JSON, identical to rendering the bare no-error verdict line; ' +
      'the tail is the TLC no-error verdict sentinel',
  }),
  Object.freeze({
    id: 'failure-tail-bounded-timestamp-free',
    command: scenarioCommand('^failure-tail-bounded-and-timestamp-free'),
    detail: 'a non-converged run keeps a bounded tail (at most ' +
      'TLC_OUTPUT_TAIL_LINE_LIMIT lines) that retains the deterministic ' +
      'counterexample content and drops every wall-clock stamp, seed, pid, ' +
      'absolute path, and trace-exploration file name; converged, ' +
      'temporalViolated, expectedFailureObserved, and expectationMet are ' +
      'unchanged',
  }),
  Object.freeze({
    id: 'report-fields-run-independent',
    command: scenarioCommand('^report-fields-run-independent'),
    detail: 'no field of a rendered route or stall report embeds a run ' +
      'value (stamp, seed, pid, checkout path, scratch path, trace epoch, ' +
      'collision estimate); module and config paths are checkout-relative',
  }),
  Object.freeze({
    id: 'writer-byte-identical-across-cli-runs',
    command: scenarioCommand('^cli-writes-byte-identical-report-across-runs'),
    detail: 'the real scripts/model-tlc.js writer, driven twice through a ' +
      'fake java emitting two differently stamped converged outputs, writes ' +
      'byte-identical report files',
  }),
  Object.freeze({
    id: 'model-contracts-leaves-tree-clean',
    command: MODEL_CONTRACTS_LEAVES_TREE_CLEAN_COMMAND,
    timeoutMs: MODEL_CHECKERS_TIMEOUT_MS,
    detail: 'self-guarding shell proof: after a full `npm run ' +
      'model:contracts` (the test:gate model step) `git status --porcelain ' +
      'architecture/contracts/evidence` is empty, so the release-gate ' +
      'receipt can record treeCleanAtFinish:true',
  }),
  Object.freeze({
    id: 'model-outcomes-unchanged',
    command: MODEL_OUTCOMES_UNCHANGED_COMMAND,
    timeoutMs: MODEL_CHECKERS_TIMEOUT_MS,
    detail: 'every registered TLC configuration still meets its declared ' +
      'expectation and carries its declared convergence outcome after the ' +
      'tail change: what is checked and the pass/fail semantics are unchanged',
  }),
]);

const QUEST_ID = 'model-report-deterministic-output-tail';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'model-report-deterministic-output-tail.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
