#!/usr/bin/env node
/**
 * Receipt harness for evidence-deletion-authority. Each claim is a named
 * scenario in test/solve/evidence-store.test.js.
 *
 * The scenarios drive the deletion path with a stub remote, so a refusal is
 * observed as the remote never being reached rather than as a message. Nothing
 * published is removed to produce this evidence.
 */

import {runQuestEvidenceHarness} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'evidence-deletion-authority';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const WITNESS_TEST = 'test/solve/evidence-store.test.js';
const SCENARIO = '^a deletion removes only the asset the operator named$';
const PATH_JOINER = '/';

const RECEIPT = Object.freeze([
  ['deletion-refuses-without-an-authorization',
    'an asset nobody authorized removing is not removed: with no signal the ' +
    'path refuses'],
  ['an-authorization-for-one-asset-removes-no-other',
    'the operator names the asset, and the authority compares it with the ' +
    'asset at hand, so authority cannot be carried sideways'],
  ['an-authorized-deletion-reaches-the-remote-once',
    'on an authorization the path issues exactly one delete for exactly the ' +
    'named asset'],
  ['the-refusal-happens-before-the-remote-is-reached',
    'a refusal is observable as the remote never being called, not merely as ' +
    'an error after the fact'],
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, detail]) =>
    Object.freeze({id, testFile: WITNESS_TEST, testNamePattern: SCENARIO, detail}))),
});
