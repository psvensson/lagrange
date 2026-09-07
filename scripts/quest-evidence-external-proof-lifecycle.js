#!/usr/bin/env node
/**
 * Receipt harness for external-proof-lifecycle. Each claim is a named scenario
 * in test/solve/external-proof-lifecycle.test.js.
 */

import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'external-proof-lifecycle';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST = 'test/solve/external-proof-lifecycle.test.js';
const PATH_JOINER = '/';

const RECEIPT = Object.freeze([
  ['awaiting-external-proof-is-carried-never-terminal',
    '^awaiting external proof is a state a quest carries, never a terminal one$',
    'a landing that proved an implementation rather than a claim leaves the ' +
    'quest open, and the quest remembers what it is waiting on'],
  ['the-external-proof-closes-it-and-the-landing-does-not',
    '^the external proof closes it, and the landing does not$',
    'the claim closes the quest; the landing never does'],
  ['an-ordinary-quest-is-unaffected',
    '^an ordinary quest is unaffected$',
    'the case is additive: a quest that proves its claim locally still lands ' +
    'and closes in one step'],
  ['the-state-is-a-recognised-entry-status',
    '^the state is a recognised entry status$',
    'the record accepts the state, so it is part of the vocabulary rather ' +
    'than a string the log happens to carry'],
  ['a-hold-survives-awaiting-external-proof',
    '^a blocked quest is still blocked while awaiting external proof$',
    'waiting on a published head does not clear a hold naming an owner who ' +
    'must decide something'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testNamePattern, detail]) =>
    Object.freeze({id, testFile: WITNESS_TEST, testNamePattern, detail}))),
});
