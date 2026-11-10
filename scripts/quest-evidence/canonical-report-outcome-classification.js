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
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'canonical-report-outcome-classification';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';

const WITNESS_TEST = 'test/scripts/rolling-restart-stat-gate-summary.test.js';

function checkVerification() {
  const state = questState(readLog(process.cwd(), QUEST_ID));
  const last = state.lastVerification;
  const approved = state.attempts.length > 0 && last !== null &&
    state.verificationIsCurrent &&
    verdictOf(last) === VERDICT.APPROVE &&
    String(last.verifier || '').startsWith(VERIFIER_PREFIX);
  process.stdout.write(`${JSON.stringify({
    approved,
    verifier: last?.verifier ?? null,
    current: state.verificationIsCurrent,
    attempts: state.attempts.length,
  })}\n`);
  process.exit(approved ? 0 : 1);
}

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  checkVerification();
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
