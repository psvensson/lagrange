#!/usr/bin/env node
// TX1 (PR100 Leg A) receipts: each receipt re-runs named witnesses of the
// participant transaction owner on the controllable consensus seam (revision 2
// witnesses: consensus is driven by the test, never by the proposer's own
// acknowledgment). The two declared here are the first supported red
// measurements; the positive controls live in the same file and are not
// receipts; the remaining
// required receipts of the quest (immutable coordinator decision, exact
// participant outcome, no rollback after a commit decision, recovery/CDC after
// the deadline, replicated PREPARE on a real three-replica group) are added as
// their witnesses exist, never as placeholders.
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'replicated-transaction-decision-and-apply';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const APPLY_TEST = 'test/partition/partition-transaction-replicated-apply.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['no-speculative-visibility-before-consensus', APPLY_TEST,
    '^TX1 P1: a pending commit exposes no row and resolves only after its marker is applied$',
    'while the commit request is pending the marker is proposed, no session row is readable on ' +
    'the leader and the request has not resolved; it resolves after the marker is applied'],
  // One receipt, two named witnesses: replicated application with the outcome
  // and applied index in one application (P2), and the fault case in which a
  // failing statement applies nothing and is not recorded COMMITTED (P3).
  ['commit-applies-operations-outcome-and-applied-index-atomically', APPLY_TEST,
    '^(TX1 P2: the committed TRANSACTION_COMMIT applies its operations, outcome and applied ' +
    'index on a replica that staged nothing|TX1 P3: a transaction whose second statement fails ' +
    'applies nothing and records a typed outcome)$',
    'a replica that staged nothing applies the committed marker\'s operations, COMMITTED ' +
    'outcome and applied index together; a failing transaction applies none of them and is not ' +
    'recorded COMMITTED', true],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail, allowMultiple]) =>
    Object.freeze({id, testFile, testNamePattern, detail, allowMultiple: allowMultiple === true}))),
});
