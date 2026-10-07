#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'partition-deferred-evaluation-obligation-scheduler';
const TEST_FILE =
  'test/partition/partition-deferred-evaluation-obligation-scheduler.test.js';
const RECEIPT_ID = 'due-obligations-retained-and-dispatched';
const RECEIPT_DETAIL =
  'both arrival orders, duplicates, equal deadlines, shutdown, and the ' +
  'idle-merge plus managed-split-retry interaction pass through the ' +
  'production deferred scheduler and requestEvaluation owner';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: `solve/quests/${QUEST_ID}/evidence/receipt.json`,
  receipts: Object.freeze([Object.freeze({
    id: RECEIPT_ID,
    testFile: TEST_FILE,
    detail: RECEIPT_DETAIL,
  })]),
});
