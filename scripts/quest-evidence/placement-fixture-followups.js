#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'placement-fixture-followups';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const RUNNER_TEST = 'test/scripts/run-test-files.test.js';
const PLACEMENT_TEST = 'test/scripts/test-placement.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['test-processes-never-inherit-a-repository', RUNNER_TEST,
    '^a test process never inherits a git repository pointer$',
    'GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE never reach a test file'],
  ['hang-up-stops-a-placed-run', PLACEMENT_TEST,
    '^a hang-up stops a placed run like an interrupt$',
    'closing the terminal aborts every machine'],
  ['aborted-shard-cleans-up-first', PLACEMENT_TEST,
    '^an aborted lab shard cleans up before it is cut$',
    'no worktree, ref, bundle or runner is left behind'],
  ['controller-child-never-places-again', PLACEMENT_TEST,
    '^the controller child runs with placement switched off$',
    'LAGRANGE_PLACEMENT=local reaches the controller child'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
