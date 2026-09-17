#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'convergence-probe-class-observed';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const SELECTOR_TEST = 'test/scripts/select-change-tests.test.js';
const WORKFLOW_TEST = 'test/config/full-corpus-canary-workflow.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['planner-leaves-the-class-out-by-name', SELECTOR_TEST,
    '^the convergence-probe class is observed elsewhere, never part of a change proof$',
    'a selector wanting every curated probe gets a plan that runs the whole ' +
    'spine, none of the probes, and names each probe as observed elsewhere'],
  ['canary-observes-the-class-non-gating', WORKFLOW_TEST,
    '^the canary observes the convergence-probe class in a non-gating step$',
    'full-corpus-canary.yml runs npm run test:convergence-probes with ' +
    'continue-on-error and if: always(), after the corpus'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
