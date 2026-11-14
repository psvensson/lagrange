#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'file-size-change-ratchet-integrity';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'per-file-size-identity-and-range',
    testFile: 'test/scripts/check-file-size-thresholds.test.js',
    detail: 'The whole file proves per-file limits, preserved inherited identity, invalid transfers, aggregate-budget preservation and the declared comparison range.',
  }),
  Object.freeze({
    id: 'changed-path-identity-preserved',
    testFile: 'test/scripts/changed-paths.test.js',
    detail: 'The whole file proves exact changed-path and rename-side identity through the existing shared range owner.',
  }),
  Object.freeze({
    id: 'fast-static-uses-comparison-base',
    testFile: 'test/scripts/check-fast-static.test.js',
    detail: 'The whole file proves the fast-static caller passes its actual selected comparison base and changed files to the file-size owner.',
  }),
  Object.freeze({
    id: 'pre-push-uses-pushed-base',
    testFile: 'test/scripts/pre-push-hook-control-flow.test.js',
    detail: 'The whole file proves the hook uses the pushed-ref base before range-sensitive content checks and preserves its existing control flow.',
  }),
  Object.freeze({
    id: 'file-size-policy-matches-enforcement',
    testFile: 'test/scripts/steering-diet.test.js',
    detail: 'The whole file checks the bounded file-size policy and its existing steering constraints.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts: RECEIPTS});
