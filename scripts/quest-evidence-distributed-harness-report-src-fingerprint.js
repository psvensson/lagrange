// Deterministic evidence harness for the
// distributed-harness-report-src-fingerprint quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs each
// recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/distributed-harness-report-src-fingerprint.receipt.json).
//
// Receipt honesty: on HEAD (before the cure) buildReportMetadata in
// test/distributed/run.js writes no srcFingerprint, so the
// soak-report-carries-src-fingerprint receipt is RED; the
// report-metadata-otherwise-unchanged and report-writer-unchanged controls
// are green on HEAD and must stay green — a cure that turns them red is
// rejected. witness-deterministic re-runs the cured scenario a second time
// and is red on HEAD for the same reason as the first receipt.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST = 'test/distributed/harness/__tests__/run.test.js';
const REPORT_WRITER_TESTS = [
  'test/distributed/harness/__tests__/report-writer.test.js',
  'test/distributed/harness/__tests__/report-writer.property.test.js',
  'test/distributed/harness/__tests__/report-writer-serialization-degrade.test.js',
];
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';
const STAMP_SCENARIO_PATTERN = 'soak-report-carries-src-fingerprint';

function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'soak-report-carries-src-fingerprint',
    command: scenarioCommand(STAMP_SCENARIO_PATTERN),
    detail: 'buildReportMetadata stamps metadata.srcFingerprint and ' +
      'srcFingerprintAlgo from the run\'s fingerprinted docker config, and ' +
      'the typed absent sentinel when no fingerprinted config exists',
  }),
  Object.freeze({
    id: 'report-metadata-otherwise-unchanged',
    command: NODE_TEST_COMMAND_PREFIX + WITNESS_TEST,
    detail: 'every other run.js report-metadata and runner scenario keeps ' +
      'passing (the stamp is additive and changes no verdict)',
  }),
  Object.freeze({
    id: 'report-writer-unchanged',
    command: NODE_TEST_COMMAND_PREFIX + REPORT_WRITER_TESTS.join(SPACE),
    detail: 'the report writer, its property suite and the serialization ' +
      'degrade suite are unchanged by the metadata stamp',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand(STAMP_SCENARIO_PATTERN),
    detail: 'a second run of the stamp scenario produces the identical ' +
      'result (no clock or ordering dependence)',
  }),
]);

const QUEST_ID = 'distributed-harness-report-src-fingerprint';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'distributed-harness-report-src-fingerprint.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
