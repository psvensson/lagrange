#!/usr/bin/env node
// Evidence harness for Quest Q14: cdc-recipient-domain-and-retained-debt.
// Runs the witness tests for all 6 functional receipts and checks the solve store
// for an approving independent verification.

import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'cdc-recipient-domain-and-retained-debt';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';

function checkVerification() {
  const state = questState(readLog(process.cwd(), QUEST_ID));
  const last = state.lastVerification;
  const approved = state.attempts.length > 0 && last !== null &&
    state.verificationIsCurrent &&
    verdictOf(last) === VERDICT.APPROVE &&
    String(last.verifier || '').startsWith(VERIFIER_PREFIX);
  process.stdout.write(`${JSON.stringify({approved, verifier: last?.verifier ?? null,
    current: state.verificationIsCurrent, attempts: state.attempts.length})}\n`);
  process.exit(approved ? 0 : 1);
}

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  checkVerification();
}

const WITNESS = 'test/topology/cdc-recipient-domain-and-retained-debt.test.js';

const receipts = Object.freeze([
  Object.freeze({
    id: 'real-latency-tree-recipient-mapping',
    testFile: WITNESS,
    testNamePattern: '^real-latency-tree-recipient-mapping: .*$',
    expectedTests: 1,
    detail: 'Latency ordering from real LatencyTreeService maps to actual message-group recipients without introducing latency-domain IDs.',
  }),
  Object.freeze({
    id: 'both-propagation-modes',
    testFile: WITNESS,
    testNamePattern: '^both-propagation-modes: .*$',
    expectedTests: 1,
    detail: 'Both conservative fanout and grouped propagation successfully route to mapped message-group recipients using real LatencyTreeService.',
  }),
  Object.freeze({
    id: 'missing-mapping-refusal-and-recovery',
    testFile: WITNESS,
    testNamePattern: '^missing-mapping-refusal-and-recovery: .*$',
    expectedTests: 1,
    detail: 'A known latency group without message-group mapping returns typed unavailable (deferRetry) while retaining source obligation; once mapped, retry succeeds.',
  }),
  Object.freeze({
    id: 'captured-invalid-binding-recovery',
    testFile: WITNESS,
    testNamePattern: '^captured-invalid-binding-recovery: .*$',
    expectedTests: 1,
    detail: 'A previously captured invalid latency-domain binding recovers through owner-proven mapping transfer to the resolved recipient without fabricating ACKs.',
  }),
  Object.freeze({
    id: 'exact-native-receipt-coverage',
    testFile: WITNESS,
    testNamePattern: '^exact-native-receipt-coverage: .*$',
    expectedTests: 1,
    detail: 'Propagation requires exact native committed receipts from all mapped message-group recipients to complete.',
  }),
  Object.freeze({
    id: 'retained-source-obligation-progress',
    testFile: WITNESS,
    testNamePattern: '^retained-source-obligation-progress: .*$',
    expectedTests: 1,
    detail: 'Source delivery debt remains owned across retry until all mapped recipients acknowledge.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
