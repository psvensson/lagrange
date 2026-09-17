#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'lane-dispatch-lpt-order';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const PLANNER_TEST = 'test/scripts/run-classified-test-files.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['parallel-lane-longest-first', PLANNER_TEST,
    '^a parallel lane dispatches red and unknown files first, then longest-first$',
    'red, untimed and missing results lead; measured files follow ' +
    'longest-first on a jobs>1 lane'],
  ['serial-lane-shortest-first', PLANNER_TEST,
    '^a serial lane dispatches red and unknown files first, then shortest-first$',
    'a jobs=1 lane keeps red first and runs measured files shortest-first'],
  ['linked-worktree-reads-main-results', PLANNER_TEST,
    '^a fresh linked worktree reads the main checkout last results$',
    'a linked worktree falls back to the main checkout results; its own ' +
    'result wins'],
  ['plan-keeps-sets-orders-lanes', PLANNER_TEST,
    '^the classified plan keeps every lane set and orders it from the last results$',
    'planClassifiedTestFiles orders each lane from the last results and ' +
    'keeps the lane sets'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
