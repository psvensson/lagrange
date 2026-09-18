#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'bootstrap-lane-jobs';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PLANNER_TEST = 'test/scripts/run-classified-test-files.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['bootstrap-owns-a-two-worker-lane', PLANNER_TEST,
    '^the bootstrap class owns a two-worker lane, and the serial classes keep theirs$',
    'bootstrap leaves the exclusive lane and runs two-up, before it; ' +
    'integration and the convergence probes stay serial'],
  ['bootstrap-keeps-the-cluster-floor', PLANNER_TEST,
    '^the bootstrap lane advises the cluster timeout floor, as the serial lane does$',
    'a bootstrap file keeps its wall-clock budget floor at two workers, and ' +
    'the ordinary lane is untouched'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
