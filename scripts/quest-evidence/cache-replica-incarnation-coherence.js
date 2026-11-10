#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'cache-replica-incarnation-coherence';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';

const TEST_FILE = 'test/cache/cache-replica-incarnation-coherence.test.js';

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
    id: 'predecessor-backfill-refused',
    testFile: TEST_FILE,
    testNamePattern: '^predecessor-backfill-refused: stale predecessor row cannot backfill role or metadata onto successor cached service row$',
    expectedTests: 1,
    detail: 'Stale row from predecessor replica incarnation cannot backfill ' +
      'raft_role or metadata onto successor cached service row.',
  }),
  Object.freeze({
    id: 'lifecycle-advance-incarnation-fenced',
    testFile: TEST_FILE,
    testNamePattern: '^lifecycle-advance-incarnation-fenced: stale higher state_entered_at from predecessor cannot advance successor lifecycle$',
    expectedTests: 1,
    detail: 'Stale higher state_entered_at from a predecessor cannot advance ' +
      'lifecycle status on a successor cached service row.',
  }),
  Object.freeze({
    id: 'missing-identity-refused',
    testFile: TEST_FILE,
    testNamePattern: '^missing-identity-refused: incoming event missing positive matching replica incarnation identity cannot advance lifecycle or backfill incarnation-sensitive fields$',
    expectedTests: 1,
    detail: 'Incoming event missing positive matching replica incarnation identity ' +
      'cannot advance lifecycle or backfill incarnation-sensitive fields.',
  }),
  Object.freeze({
    id: 'same-incarnation-delayed-update',
    testFile: TEST_FILE,
    testNamePattern: '^same-incarnation-delayed-update: legitimate same-incarnation delayed lifecycle advance and backfill succeeds while preserving row LWW$',
    expectedTests: 1,
    detail: 'Legitimate same-incarnation delayed update advances lifecycle fields ' +
      'while preserving newer composite row-level versions.',
  }),
  Object.freeze({
    id: 'create-cleanup-and-boot-identity-cases',
    testFile: TEST_FILE,
    testNamePattern: '^create-cleanup-and-boot-identity-cases: create attempt mismatch, cleanup token conflict, and boot id mismatch refuse merge$',
    expectedTests: 1,
    detail: 'Create attempt token mismatch, cleanup token conflict, and boot ' +
      'id mismatch refuse both lifecycle advance and stale row backfill.',
  }),
  Object.freeze({
    id: 'cache-to-lifecycle-payload-composition',
    testFile: TEST_FILE,
    testNamePattern: '^cache-to-lifecycle-payload-composition: cached row across replica state machine buildUpdateCdcData prevents role contamination and preserves same-incarnation role$',
    expectedTests: 1,
    detail: 'Cached row across ReplicaStateMachine buildUpdateCdcData prevents ' +
      'role contamination and preserves same-incarnation voter role.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, ' +
      'read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
