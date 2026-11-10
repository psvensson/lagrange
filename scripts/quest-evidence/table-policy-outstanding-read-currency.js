#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'table-policy-outstanding-read-currency';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';

const WITNESS = 'test/policy/table-policy-outstanding-read-currency.test.js';

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
    id: 'producer-ordering-and-identity',
    testFile: WITNESS,
    testNamePattern: '^R1 .*$',
    expectedTests: 1,
    detail: 'Producer-owned ordering and table creation incarnation / identity scope ' +
      'of policy revisions monotonically advance currency and preserve identity.',
  }),
  Object.freeze({
    id: 'delayed-old-read-cannot-resurrect',
    testFile: WITNESS,
    testNamePattern: '^R2 .*$',
    expectedTests: 1,
    detail: 'Controlled delayed old responses cannot override a newer committed policy ' +
      'after retirement or eviction; ABA content recurrence is rejected.',
  }),
  Object.freeze({
    id: 'retirement-eviction-and-recreation',
    testFile: WITNESS,
    testNamePattern: '^R3 .*$',
    expectedTests: 1,
    detail: 'Old read from before table deletion/recreation cannot resurrect into cache ' +
      'or return authoritative policy after recreation or eviction; absent vs unavailable remain distinct.',
  }),
  Object.freeze({
    id: 'real-permission-consumer',
    testFile: WITNESS,
    testNamePattern: '^R4 .*$',
    expectedTests: 1,
    detail: 'PriorityPublicationSafetyRows.getCriticalMinReplicaCount schedule: hold 3, ' +
      'commit 5 then 7, fresh 7, release 3; old evidence stays stale and cached minimum 7 is enforced.',
  }),
  Object.freeze({
    id: 'fresh-read-progress-and-resource-bounds',
    testFile: WITNESS,
    testNamePattern: '^R5 .*$',
    expectedTests: 1,
    detail: 'Fresh reads make progress and succeed; active reads, currency, and fences ' +
      'remain strictly bounded without leaking entries.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, ' +
      'read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
