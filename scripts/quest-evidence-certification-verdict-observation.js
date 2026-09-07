#!/usr/bin/env node
/**
 * Receipt harness for certification-verdict-observation. Each claim is a named
 * scenario in test/scripts/certification-verdict.test.js, driven against real
 * aggregates in the shape the stat gate writes.
 */

import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'certification-verdict-observation';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST = 'test/scripts/certification-verdict.test.js';
const PATH_JOINER = '/';

const RECEIPT = Object.freeze([
  ['a-certified-window-projects-as-satisfied',
    '^a certified window projects as satisfied$',
    'the one thing the projector adds: a window the owner certified, drawn ' +
    'from the sealed population, is observable as satisfied'],
  ['the-owner-verdict-is-read-not-recomputed',
    '^the projector reads the owner verdict rather than deciding for itself$',
    'where the recorded numbers would clear the bar but the owner classified ' +
    'the window below it, the owner\'s answer is the answer'],
  ['a-lowered-bar-is-refused-rather-than-met',
    '^a lowered bar is refused rather than met$',
    'an aggregate recording a bar the file does not seal is refused; the ' +
    'projector never adopts the smaller number'],
  ['a-safety-breach-outweighs-the-statistics',
    '^a safety breach is not outweighed by the statistics$',
    'the six safety counters are a floor, not a term in the average'],
  ['a-window-outside-the-sealed-population-is-refused',
    '^a window the sealed population does not admit is refused$',
    'run count, node count, hardware class, workload, failure schedule, ' +
    'certification mode, a clean tree, no stale source and one fingerprint ' +
    'are each compared with what the file seals'],
  ['an-incomplete-window-is-refused',
    '^a window missing one contributing report is refused$',
    'a window has to account for every run it claims'],
  ['an-absent-window-is-not-a-satisfied-one',
    '^an absent window is not a satisfied one$',
    'no certification is not a certification'],
  ['the-projector-is-generic-over-the-scenario',
    '^the projector is generic over the scenario$',
    'any scenario the sealed-bar file carries is projected by naming it, and ' +
    'one it does not carry is refused rather than guessed at'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testNamePattern, detail]) =>
    Object.freeze({id, testFile: WITNESS_TEST, testNamePattern, detail}))),
});
