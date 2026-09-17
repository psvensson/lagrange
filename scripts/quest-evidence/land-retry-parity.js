#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'land-retry-parity';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const COMMANDS_TEST = 'test/solve/commands.test.js';
const RUNNER_TEST = 'test/scripts/run-test-files.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['land-runs-under-the-recorded-retry-policy', COMMANDS_TEST,
    '^the change proof runs under the recorded retry policy, as CI does$',
    'the spawned landing proof carries LAGRANGE_RETRY_FAILED_ONCE=1 next to ' +
    'the quest-delta base, announced, without mutating the caller environment'],
  ['retry-policy-reported-and-capped', RUNNER_TEST,
    '^reruns each failed file once, reports it, and a standalone pass is green$',
    'the runner policy land now shares: the rerun is announced and its ' +
    'outcome reported, never hidden'],
  ['retry-policy-capped-and-red-stays-red', RUNNER_TEST,
    '^is capped: a run with many failed files is breakage and never reruns$',
    'six failed files is over the cap of five: no rerun, the run stays red'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
