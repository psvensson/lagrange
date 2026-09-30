#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'closure-witness-route-observed';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const GUARD_TEST = 'test/partition/learner-promotion-count-check-inputs.test.js';
const ROUTE_TEST =
  'test/control-plane/priority-recovery-decision-provenance.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['route-retained-built-none-stated', ROUTE_TEST,
    '^the closure evidence route is stated on every route the derivation takes$',
    'retained, built and none are each reached through the real derivation'],
  ['witness-state-and-unresolved-ids-stated', GUARD_TEST,
    '^the payload states the closure witness state and its unresolved ids$',
    'state, summarySpreadPending and both capped id lists reach the payload'],
  ['this-partitions-semantic-state-and-satisfying-operations-stated', GUARD_TEST,
    '^the payload states this partition\'s semantic state and satisfying operations$',
    'semantic state, spread-completion reason and each satisfying target'],
  ['base-summary-before-the-closure-choice-stated', ROUTE_TEST,
    '^the base summary the closure choice was made against is stated$',
    'the base summary\'s satisfied flag, its own source and this partition'],
  ['absent-values-are-stated-as-absent', GUARD_TEST,
    '^every absent closure value is stated as absent$',
    'no answer, no witness, no decision snapshots, partition not tracked'],
  ['decisions-unchanged', ROUTE_TEST,
    '^the candidate derivation and the row it is persisted as are unchanged$',
    'candidate, publication row and summary equality match main\'s oracle'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
