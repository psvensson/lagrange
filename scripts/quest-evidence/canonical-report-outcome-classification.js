#!/usr/bin/env node
// Evidence harness for the canonical-report-outcome-classification Quest.
// Receipts 1-4 execute the named test blocks of the witness test suite
// with anchored subtest patterns and exact counts.
// Receipt 5 verifies an approving subagent verification newer than the
// last attempt, read through the solve store owner.
//
//   node scripts/quest-evidence/canonical-report-outcome-classification.js [--output <path>]
//   node scripts/quest-evidence/canonical-report-outcome-classification.js --check-verification

import {runQuestEvidenceHarness} from './harness-runtime.js';
import {CHECK_VERIFICATION_FLAG, exitWithQuestVerification} from './verification-check.js';

const QUEST_ID = 'canonical-report-outcome-classification';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

const WITNESS_TEST = 'test/scripts/rolling-restart-stat-gate-summary.test.js';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerification(QUEST_ID);
}

const receipts = Object.freeze([
  Object.freeze({
    id: 'retained-formation-failure-classified',
    testFile: WITNESS_TEST,
    testNamePattern: '^retained-formation-failure-classified: .*$',
    expectedTests: 1,
    detail: 'The retained failed formation report is classified as failure and never healthy or slow.',
  }),
  Object.freeze({
    id: 'supported-success-classified',
    testFile: WITNESS_TEST,
    testNamePattern: '^supported-success-classified: .*$',
    expectedTests: 1,
    detail: 'Supported success report families are classified as CONVERGED without masking or regression.',
  }),
  Object.freeze({
    id: 'unknown-missing-conflicting-evidence-refused',
    testFile: WITNESS_TEST,
    testNamePattern: '^unknown-missing-conflicting-evidence-refused: .*$',
    expectedTests: 1,
    detail: 'Unknown, missing, malformed, or contradictory evidence reports are refused as UNJUDGEABLE.',
  }),
  Object.freeze({
    id: 'public-triage-and-receipt-composition',
    testFile: WITNESS_TEST,
    testNamePattern: '^public-triage-and-receipt-composition: .*$',
    expectedTests: 1,
    detail: 'The public triage CLI and receipt composition refuse unjudgeable reports and report true failures.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
