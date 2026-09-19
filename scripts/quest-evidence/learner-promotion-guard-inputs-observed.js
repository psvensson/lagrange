#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'learner-promotion-guard-inputs-observed';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const GUARD_TEST = 'test/partition/learner-promotion-count-check-inputs.test.js';
const PROVENANCE_TEST =
  'test/control-plane/priority-recovery-decision-provenance.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['refusal-logs-the-decided-inputs', GUARD_TEST,
    '^a count-check refusal logs the inputs the decision was made on$',
    'the would_exceed_target_replica_count line carries every decided input'],
  ['first-pass-logs-the-decided-inputs-once', GUARD_TEST,
    '^the first count-check pass of a learner logs its inputs exactly once$',
    'one inputs line per learner on the pass path, refusals unthrottled'],
  ['inputs-come-from-the-one-evaluation', GUARD_TEST,
    '^the logged inputs come from the one evaluation that decided$',
    'per-check source reads are unchanged and no logged value is a re-read'],
  ['summary-source-and-answer-origin-named', PROVENANCE_TEST,
    '^the summary source and the planning answer origin are named by their owners$',
    'derived/closure-refreshed and fresh/memoized/retained come from the owner'],
  ['decisions-unchanged', GUARD_TEST,
    '^every count-check decision matches the frozen copy of main\'s arithmetic$',
    'outcome, reason, cap and recheck match the frozen oracle on every row'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
