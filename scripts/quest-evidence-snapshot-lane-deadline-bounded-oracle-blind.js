// Deterministic evidence harness for the
// snapshot-lane-deadline-bounded-oracle-blind quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs each
// recorded proof command and writes the test-receipt probe artifact.
//
// Receipt honesty (the witness file uses the repo tap shim, so
// --test-name-pattern is inert: every command runs the WHOLE file and a green
// receipt means the whole file passed, which includes the named scenario):
// on HEAD the deadline-bounded-snapshot-lane-is-oracle-blind scenario is RED
// (an empty probe-witness list is read as sight, so the verdict claims an
// inactive cluster); the surrounding blindness scenarios are green on HEAD and
// must stay green.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/distributed/harness/__tests__/oracle-blindness-classification.test.js';
const JOIN_TEST =
  'test/distributed/harness/__tests__/' +
  'cluster-active-probe-resample-after-snapshot-lane.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const SPACE = ' ';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'deadline-bounded-snapshot-lane-is-oracle-blind',
    command: NODE_TEST_COMMAND_PREFIX + WITNESS_TEST,
    detail: 'a snapshot lane still in flight at the deadline is classified ' +
      'blind and carries its typed lane reason, instead of being read as a ' +
      'sighted oracle reporting an inactive cluster',
  }),
  Object.freeze({
    id: 'empty-witness-list-from-other-producers-unchanged',
    command: NODE_TEST_COMMAND_PREFIX + WITNESS_TEST,
    detail: 'an empty probe-witness list that carries no deadline-bounded ' +
      'lane marker keeps its prior not-blind meaning, and a completed lane ' +
      'with a sighted witness stays sighted',
  }),
  Object.freeze({
    id: 'blindness-classification-unchanged',
    command: NODE_TEST_COMMAND_PREFIX + WITNESS_TEST,
    detail: 'the tracker, the failure message, the diagnostics stamp and the ' +
      'node-level inactivity precedence rule are unchanged',
  }),
  Object.freeze({
    id: 'attempt-join-contract-unchanged',
    command: NODE_TEST_COMMAND_PREFIX + JOIN_TEST,
    detail: 'the deadline-bounded record its producer emits, the re-sample ' +
      'admission and the progress classification are unchanged',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: NODE_TEST_COMMAND_PREFIX + WITNESS_TEST + SPACE + JOIN_TEST,
    detail: 'both witness files re-run together with the identical outcome',
  }),
]);

const QUEST_ID = 'snapshot-lane-deadline-bounded-oracle-blind';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'snapshot-lane-deadline-bounded-oracle-blind.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
