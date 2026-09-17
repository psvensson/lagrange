#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'land-proves-the-quest-delta';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const RANGE_TEST = 'test/scripts/check-base-range.test.js';
const COMMANDS_TEST = 'test/solve/commands.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['land-proves-the-quest-delta', COMMANDS_TEST,
    '^the change proof is spawned against the quest delta, HEAD, and says so$',
    'the spawned proof carries the pinned base through the one environment ' +
    'authority, announces it, and leaves the caller environment untouched'],
  ['publication-range-stays-the-push-gates', RANGE_TEST,
    '^with no declaration the base is the publication merge-base$',
    'the push gate and npm run check keep the merge-base default (decision 0538db5c7)'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
