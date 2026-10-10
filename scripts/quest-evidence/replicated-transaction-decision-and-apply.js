#!/usr/bin/env node
// TX1 (PR100 Leg A) receipts: each receipt re-runs one named witness of the
// participant transaction owner on the controllable consensus seam. The two
// declared here are the first supported red measurements; the remaining
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
    '^TX1 P1: a session commit exposes no rows before its marker is a committed entry$',
    'the leader exposes no session row before its TRANSACTION_COMMIT marker is committed and applied'],
  ['commit-applies-operations-outcome-and-applied-index-atomically', APPLY_TEST,
    '^TX1 P2: the committed TRANSACTION_COMMIT applies its operations on a replica that staged nothing$',
    'a replica that staged nothing applies the committed marker\'s operations exactly once'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
