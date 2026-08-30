// Deterministic evidence harness for the
// admin-query-participant-failures-surfaced quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs each
// recorded proof command verbatim and writes the probe artifact.
//
// Red on HEAD (403a92853) before the cure, green after:
//   envelope-carries-participant-failures-typed-fields-and-cap,
//   client-error-carries-participant-failures,
//   demo-failure-report-serialises-participant-failures,
//   write-fanout-participant-failures-logged-once,
//   witness-deterministic.
// Controls green on HEAD and after:
//   successful-result-envelope-unchanged,
//   error-without-participants-unchanged.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const ENVELOPE_TEST_FILE =
  'test/admin/admin-query-result-envelope-participant-failures.test.js';
const CLIENT_REPORT_TEST_FILE =
  'test/runtime/movielens-failure-report-participant-failures.test.js';
const COORDINATOR_LOG_TEST_FILE =
  'test/query/distributed-write-coordinator-participant-failure-log.test.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'envelope-carries-participant-failures-typed-fields-and-cap',
    testFile: ENVELOPE_TEST_FILE,
    detail: 'the admin error result envelope forwards participantFailures ' +
      'and firstFailedParticipant under their typed names, caps the list ' +
      'at ADMIN_QUERY_RESULT.PARTICIPANT_FAILURES_LIMIT and records ' +
      'participantFailuresOmittedCount',
  }),
  Object.freeze({
    id: 'client-error-carries-participant-failures',
    testFile: CLIENT_REPORT_TEST_FILE,
    detail: 'AdminWsClient rejects a failed query with an Error carrying ' +
      'errorCode, details, participantFailures, firstFailedParticipant and ' +
      'participantFailuresOmittedCount from the frame, fabricating none',
  }),
  Object.freeze({
    id: 'demo-failure-report-serialises-participant-failures',
    testFile: CLIENT_REPORT_TEST_FILE,
    detail: 'the MovieLens comparison and live failure reports keep the ' +
      'error string and write errorDetail with the participant failures ' +
      'beside it through one report-error owner',
  }),
  Object.freeze({
    id: 'write-fanout-participant-failures-logged-once',
    testFile: COORDINATOR_LOG_TEST_FILE,
    detail: 'DistributedWriteCoordinator emits exactly one warn line per ' +
      'failed fan-out naming the operation, operationId, failed partitions ' +
      'and per-participant node/address/error codes; none on success',
  }),
  Object.freeze({
    id: 'successful-result-envelope-unchanged',
    testFile: ENVELOPE_TEST_FILE,
    detail: 'control: a successful write envelope carries no participant ' +
      'failure fields',
  }),
  Object.freeze({
    id: 'error-without-participants-unchanged',
    testFile: ENVELOPE_TEST_FILE,
    detail: 'control: an error envelope without failed participants keeps ' +
      'error/errorCode/hint/details and carries no participant fields',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    testFile: ENVELOPE_TEST_FILE,
    detail: 'control: the same owner result projects identical participant ' +
      'fields on repeated envelope builds',
  }),
]);

const QUEST_ID = 'admin-query-participant-failures-surfaced';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'admin-query-participant-failures-surfaced.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
