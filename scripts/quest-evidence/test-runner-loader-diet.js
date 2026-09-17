#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'test-runner-loader-diet';
const OUTPUT_FILE_SEGMENTS = Object.freeze([
  'solve', 'quests', QUEST_ID, 'evidence', 'receipt.json']);
const RUNNER_TEST = 'test/scripts/run-test-files.test.js';
const PATH_JOINER = '/';
const RECEIPT = Object.freeze([
  ['only-the-mock-loader', RUNNER_TEST,
    '^loads the mock plugin and nothing that serves no file$',
    'the runner spawns exactly one --import loader, @tapjs/mock; typescript ' +
    'and processinfo are gone'],
  ['compilation-cache-stays-off', RUNNER_TEST,
    '^keeps the V8 compilation cache off \\(3bac105f1\\) and the heap bound$',
    '--no-compilation-cache and --max-old-space-size are unchanged'],
  ['mock-plugin-still-serves', RUNNER_TEST,
    '^runs Tap and node:test files with assertions and Tap plugins intact$',
    'the tap fixture asserts the mock plugin surface through the runner'],
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE_SEGMENTS.join(PATH_JOINER),
  receipts: Object.freeze(RECEIPT.map(([id, testFile, testNamePattern, detail]) =>
    Object.freeze({id, testFile, testNamePattern, detail}))),
});
