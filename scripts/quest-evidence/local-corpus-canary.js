#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'local-corpus-canary';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const LOCAL_TEST = 'test/scripts/local-corpus.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['cone-publish-starts-the-rest', LOCAL_TEST,
    '^a cone publish starts exactly the rest of the corpus for the pushed commit$',
    'the whole corpus test:all runs, minus what the cone proved, detached'],
  ['whole-corpus-publish-starts-nothing', LOCAL_TEST,
    '^a publish that proved the whole corpus, or whose scope is unknown, starts nothing$',
    'no second corpus for a proved commit, and no guess without a scope'],
  ['newer-publish-supersedes', LOCAL_TEST,
    '^a newer publish supersedes a running local corpus$',
    'the running group is stopped and named superseded; a dead one is named lost'],
  ['next-publish-reports-the-result', LOCAL_TEST,
    '^the next publish reports the last local corpus result first$',
    'green, red, running, superseded and lost are all said, red loudest'],
  ['receipt-only-when-green', LOCAL_TEST,
    '^the local corpus records the whole-corpus receipt only when green$',
    'the exact-checkout run decides; a red run records nothing'],
  ['hosted-canary-only-by-hand', LOCAL_TEST,
    '^the hosted canary runs only when dispatched by hand$',
    'the workflow has no automatic trigger'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
