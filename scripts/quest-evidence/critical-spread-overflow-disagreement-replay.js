#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'critical-spread-overflow-disagreement-replay';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const REPLAY_TEST = 'test/simulation/formation-sim-critical-spread-replay.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['scenario-fixtures-are-cited', REPLAY_TEST,
    '^scenario fixtures cite the run they came from$',
    'every fixture entry cites its run id, node and log time'],
  ['planner-retains-the-cure-add-from-replayed-state', REPLAY_TEST,
    '^the seed planner retains the spread-cure add from replayed state$',
    'the real planner on the seed host retains the spread-cure ADD at ' +
    'target + 1 voters on fewer distinct nodes than required, as live did'],
  ['pass-scenario-grants-what-live-granted', REPLAY_TEST,
    '^the pass scenario grants every promotion live granted$',
    'the real learner count check admits every promotion the 2026-09-15 ' +
    'run granted'],
  ['fail-scenario-refuses-on-the-live-guard-inputs', REPLAY_TEST,
    '^the fail scenario refuses on the live guard inputs$',
    'a failing run whose artifacts carry guard-input records replays to the ' +
    'same inputs and the same refusal'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
