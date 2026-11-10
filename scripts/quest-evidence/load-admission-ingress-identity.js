#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'load-admission-ingress-identity';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';

const WITNESS = 'test/admin/load-admission-ingress-identity.test.js';

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
    id: 'actual-ingress-binding',
    testFile: WITNESS,
    testNamePattern: '^actual-ingress-binding: .*$',
    expectedTests: 1,
    detail: 'Load admission is bound to actual request ingress service, protocol, and node/incarnation.',
  }),
  Object.freeze({
    id: 'discovery-order-invariance',
    testFile: WITNESS,
    testNamePattern: '^discovery-order-invariance: .*$',
    expectedTests: 1,
    detail: 'Reordering discovery service records does not affect load admission outcome.',
  }),
  Object.freeze({
    id: 'opposite-endpoint-health',
    testFile: WITNESS,
    testNamePattern: '^opposite-endpoint-health: .*$',
    expectedTests: 1,
    detail: 'Admin blocked with postgres ready rejects; admin ready with postgres blocked admits.',
  }),
  Object.freeze({
    id: 'zero-postgres-replicas',
    testFile: WITNESS,
    testNamePattern: '^zero-postgres-replicas: .*$',
    expectedTests: 1,
    detail: 'Zero postgres replicas admits admin websocket query when admin endpoint is ready.',
  }),
  Object.freeze({
    id: 'stale-endpoint-incarnation-refused',
    testFile: WITNESS,
    testNamePattern: '^stale-endpoint-incarnation-refused: .*$',
    expectedTests: 1,
    detail: 'Stale endpoint boot incarnation is refused for load admission.',
  }),
  Object.freeze({
    id: 'admission-cache-binding',
    testFile: WITNESS,
    testNamePattern: '^admission-cache-binding: .*$',
    expectedTests: 1,
    detail: 'Admission cache key and validation bind to full composite ingress identity and refuse cross-authorization.',
  }),
  Object.freeze({
    id: 'real-ingress-to-query-composition',
    testFile: WITNESS,
    testNamePattern: '^real-ingress-to-query-composition: .*$',
    expectedTests: 1,
    detail: 'End-to-end query dispatch over admin websocket load lane verifies actual ingress binding.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'Independent verification approving last attempt recorded by subagent.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
