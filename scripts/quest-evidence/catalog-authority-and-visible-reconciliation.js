#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'catalog-authority-and-visible-reconciliation';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';
const WITNESS_TEST = 'test/query/catalog-authority-and-visible-reconciliation.test.js';

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
    id: 'follower-partial-mismatched-evidence-refused',
    testFile: WITNESS_TEST,
    testNamePattern: '^R1 .*$',
    expectedTests: 1,
    detail: 'Follower, partial, degraded, or scope-mismatched catalog reads return UNAVAILABLE and never evict cached rows.',
  }),
  Object.freeze({
    id: 'genuine-authoritative-absence',
    testFile: WITNESS_TEST,
    testNamePattern: '^R2 .*$',
    expectedTests: 1,
    detail: 'Complete leader-witnessed empty tables read evicts cached metadata and records an authoritative absence tombstone.',
  }),
  Object.freeze({
    id: 'causal-restoration-without-ttl-wait',
    testFile: WITNESS_TEST,
    testNamePattern: '^R3 .*$',
    expectedTests: 1,
    detail: 'Causally newer authoritative observation clears the absence tombstone and restores cached rows without waiting for 30s TTL.',
  }),
  Object.freeze({
    id: 'actual-cache-and-query-state-confirmed',
    testFile: WITNESS_TEST,
    testNamePattern: '^R4 .*$',
    expectedTests: 1,
    detail: 'Metadata refresh requires verified visible cache state before returning FOUND, enabling working query routing.',
  }),
  Object.freeze({
    id: 'stale-replay-protection',
    testFile: WITNESS_TEST,
    testNamePattern: '^R5 .*$',
    expectedTests: 1,
    detail: 'Causally older stale replay cannot resurrect deleted rows or supersede an active absence tombstone.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'Approving subagent verification recorded after the last attempt.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
