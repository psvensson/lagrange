import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'reroute-carries-the-entry-id';
const OUTPUT_FILE =
  'solve/quests/reroute-carries-the-entry-id/evidence/receipt.json';
const WRITE_IDENTITY_TEST = 'test/query/write-identity-end-to-end.test.js';

const receipts = Object.freeze([
  ['rerouted-write-after-outcome-unknown-applies-once-and-answers-success',
    WRITE_IDENTITY_TEST,
    '^rerouted write after outcome unknown applies once and answers success$'],
  ['every-release-cause-reroutes-with-the-entry-id', WRITE_IDENTITY_TEST,
    '^every release cause reroutes with the entry id$'],
  ['a-client-idempotency-key-makes-resubmission-idempotent',
    WRITE_IDENTITY_TEST,
    '^a client idempotency key makes resubmission idempotent$'],
  ['write-answers-cross-the-wire-whole-and-reroute-admission-is-by-code',
    WRITE_IDENTITY_TEST,
    '^write answers cross the wire whole and reroute admission is by code$'],
  ['admin-receipt-binds-a-replayed-answer-by-entry-id', WRITE_IDENTITY_TEST,
    '^admin receipt binds a replayed answer by entry id$'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts: receipts.map(([id, testFile, testNamePattern]) => ({
    id,
    testFile,
    testNamePattern,
    detail: `Measured by ${testNamePattern}`,
  })),
});
