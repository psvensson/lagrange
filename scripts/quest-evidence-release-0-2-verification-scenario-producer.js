// Deterministic evidence harness for the
// release-0-2-verification-scenario-producer quest: receipt declarations
// only. The shared runtime (scripts/quest-evidence-harness-runtime.js)
// re-runs each recorded proof command and writes the test-receipt probe
// artifact
// (solve/evidence/release-0-2-verification-scenario-producer.receipt.json).
// Each receipt re-executes one focused witness scenario rather than
// trusting a claim, so a regression that flips a witness red flips this
// receipt to fail and the quest's doneWhen cannot close on stale green
// evidence.
//
// Receipt honesty: the witness file uses raw node:test so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
// On HEAD (before the producer exists) the soak-oracle-fail-closed,
// local-receipts-fail-closed, remote-receipt-fail-closed,
// aggregate-requires-all-children, gate-receipt-helper-records-real-exit-code,
// github-receipt-records-conclusion-without-network,
// producer-cli-writes-discoverable-reports, receipt-facts-only and
// witness-deterministic receipts are RED (the witness cannot import the
// absent producer modules); existing-scenario-runners-unchanged is green
// and must stay green — a
// producer that breaks the five-node/topology/snapshot runners or the
// release identity guards it builds on is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/scripts/run-release-0-2-verification-scenarios.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';
const COMMAND_CHAIN = ' && ';
const NODE_CHECK_COMMAND_PREFIX = 'node --check ';
const TEST_FILE_COMMAND_PREFIX = 'npm run test:file -- ';

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects the top-level witness scenarios by anchored name, so a green
// receipt is honest (its scenarios exit 0) and a red receipt is honest
// (its scenarios exit non-zero).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const EXISTING_RUNNERS = Object.freeze([
  'scripts/checks/run-release-0-2-five-node-convergence-scenarios.js',
  'scripts/checks/run-release-0-2-topology-safety-scenarios.js',
  'scripts/checks/run-release-0-2-snapshot-integration-scenarios.js',
  'scripts/checks/guard-test-scenario-runner.js',
]);
const RELEASE_IDENTITY_GUARDS = Object.freeze([
  'test/release/version-single-source.test.js',
  'test/scripts/release-content-digest.test.js',
]);

function existingRunnersCommand() {
  const parses = EXISTING_RUNNERS.map(
    (file) => NODE_CHECK_COMMAND_PREFIX + file,
  );
  return [
    ...parses,
    TEST_FILE_COMMAND_PREFIX + RELEASE_IDENTITY_GUARDS.join(SPACE),
  ].join(COMMAND_CHAIN);
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'soak-oracle-fail-closed',
    command: scenarioCommand('^soak-'),
    detail: 'a soak report passes only with every node analyzed, at least ' +
      '30 samples, no insufficient-* reason, no leak, and the current ' +
      'source fingerprint; analyzed false, 29 samples, an insufficient ' +
      'reason, a leak, a foreign or missing fingerprint, a failed soak ' +
      'scenario, or no report each FAIL with their typed reason',
  }),
  Object.freeze({
    id: 'local-receipts-fail-closed',
    command: scenarioCommand('^local-'),
    detail: 'all seven required gate receipts with exit 0 on the current ' +
      'HEAD and fingerprint PASS; one missing, one on another sha, one ' +
      'with a drifted fingerprint, or one with a non-zero exit each FAIL ' +
      'with the typed reason naming the receipt',
  }),
  Object.freeze({
    id: 'remote-receipt-fail-closed',
    command: scenarioCommand('^remote-'),
    detail: 'a GitHub receipt recording ci / gate success for the exact ' +
      'current HEAD passes; a failure conclusion, another sha, no gate ' +
      'check run, or an absent receipt each FAIL with their typed reason ' +
      '(an absent receipt is remote_receipt_missing, never skipped)',
  }),
  Object.freeze({
    id: 'aggregate-requires-all-children',
    command: scenarioCommand('^(aggregate-|release-version-)'),
    detail: 'release-0-2-verification-v3 passes iff all three frontier ' +
      'scenarios pass, carries each child verdict and reason, and an ' +
      'inconsistent 0.2.0 version source fails every scenario',
  }),
  Object.freeze({
    id: 'gate-receipt-helper-records-real-exit-code',
    command: scenarioCommand('^gate-receipt-helper-records-real-exit-code'),
    detail: 'record-release-gate-receipt.js runs the command, records its ' +
      'real exit code with the current HEAD sha, source fingerprint before ' +
      'and after, and version, and exits with that code',
  }),
  Object.freeze({
    id: 'github-receipt-records-conclusion-without-network',
    command: scenarioCommand(
      '^github-receipt-records-conclusion-without-network',
    ),
    detail: 'record-github-gate-receipt.js records the newest ' +
      'github-actions gate check run for the sha from an injected ' +
      'check-runs payload (absence as found false) without touching the ' +
      'network',
  }),
  Object.freeze({
    id: 'producer-cli-writes-discoverable-reports',
    command: scenarioCommand('^producer-cli-writes-discoverable-reports'),
    detail: 'the producer CLI writes the four scenario reports in the shape ' +
      'the scenario-harness probe discovers as done, bound to the real ' +
      'HEAD and source fingerprint, and exits 1 with ' +
      'remote_receipt_missing when the GitHub receipt is absent',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two derivations of identical facts produce byte-identical ' +
      'green and red reports',
  }),
  Object.freeze({
    id: 'receipt-facts-only',
    command: scenarioCommand('^receipt-facts-only'),
    detail: 'a gate receipt passes on its recorded integer exitCode alone ' +
      '(passed:true without exitCode and a string exitCode are ' +
      'receipt_exit_code_missing), its version must equal 0.2.0 ' +
      '(receipt_version_mismatch), both helpers record a porcelain-clean ' +
      'tree fact and dirty receipts are rejected (receipt_tree_dirty, ' +
      'remote_receipt_tree_dirty), the GitHub receipt attributes the gate ' +
      'job to its workflow file so a full-gate success cannot stand in for ' +
      'a failed ci gate (remote_workflow_mismatch), and the newest soak ' +
      'report is chosen by its own timestamp, never lexical filename',
  }),
  Object.freeze({
    id: 'existing-scenario-runners-unchanged',
    command: existingRunnersCommand(),
    detail: 'control: the five-node, topology-safety and ' +
      'snapshot-integration runners and the shared guard runner still ' +
      'parse, and the release identity guards the producer builds on ' +
      '(version single-source, release-content digest) still pass',
  }),
]);

const QUEST_ID = 'release-0-2-verification-scenario-producer';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'release-0-2-verification-scenario-producer.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
