#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'publication-duplication-owner-closure';
const receipts = Object.freeze([
  Object.freeze({
    id: 'canonical-duplication-ratchets',
    command: 'npm run test:duplication',
    detail: 'Actual source/scripts and test corpus scans satisfy the existing one-way limits.',
  }),
  Object.freeze({
    id: 'verification-evidence-controls',
    testFile: 'test/scripts/quest-evidence-harness-expected-tests.test.js',
    detail: 'Real child commands, verification histories and receipt count/refusal controls.',
  }),
  Object.freeze({
    id: 'failure-bundle-public-controls',
    testFile: 'test/distributed/harness/__tests__/failure-bundle.test.js',
    detail: 'Existing public failure-bundle writer preserves diagnostics and evidence behavior.',
  }),
]);
runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: `solve/quests/${QUEST_ID}/evidence/receipt.json`,
  receipts,
});

