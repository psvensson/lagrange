#!/usr/bin/env node
import process from 'node:process';
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {
  CHECK_VERIFICATION_FLAG,
  exitWithQuestVerificationCheck,
} from './quest-verification-check.js';

const QUEST_ID = 'routing-overlay-complete-state-retirement';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

const WITNESS = 'test/query/routing-overlay-complete-state-retirement.test.js';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerificationCheck(QUEST_ID);
}

const receipts = Object.freeze([
  Object.freeze({
    id: 'mixed-age-counterexample-resolved',
    testFile: WITNESS,
    testNamePattern: '^mixed-age-counterexample-resolved: .*$',
    expectedTests: 1,
    detail: 'Surviving service advance with delayed deletion of excluded stale cached service does not retire the routing overlay prematurely.',
  }),
  Object.freeze({
    id: 'real-engine-cache-executor-composition',
    testFile: WITNESS,
    testNamePattern: '^real-engine-cache-executor-composition: .*$',
    expectedTests: 1,
    detail: 'Real QueryExecutor, SystemTableCache, and SQLQueryEngine composition routes only to valid authoritative services and never resurrects stale route.',
  }),
  Object.freeze({
    id: 'newer-complete-authority-progress',
    testFile: WITNESS,
    testNamePattern: '^newer-complete-authority-progress: .*$',
    expectedTests: 1,
    detail: 'Genuine cache convergence or complete newer authority cleanly retires the overlay and transparently restores direct cache routing.',
  }),
  Object.freeze({
    id: 'deletion-recreation-and-cache-replacement',
    testFile: WITNESS,
    testNamePattern: '^deletion-recreation-and-cache-replacement: .*$',
    expectedTests: 1,
    detail: 'Partition drop evicts lingering overlays, recreated partition starts clean, and setSystemCache cleanly switches listeners and resets overlay state.',
  }),
  Object.freeze({
    id: 'subscription-and-refresh-cleanup',
    testFile: WITNESS,
    testNamePattern: '^subscription-and-refresh-cleanup: .*$',
    expectedTests: 1,
    detail: 'Engine shutdown detaches cache apply listeners and cleans up in-flight refreshes without post-shutdown state leaks.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
