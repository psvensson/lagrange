#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {questState, readLog, verdictOf} from '../solve/store.js';
import {VERDICT} from '../solve/schema.js';

const QUEST_ID = 'canonical-replica-completion-observation';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const TEST_FILE =
  'test/rebalancer/canonical-replica-completion-observation.test.js';
const CHECK_VERIFICATION_FLAG = '--check-verification';
const VERIFIER_PREFIX = 'subagent:';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
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

const receipts = Object.freeze([
  Object.freeze({
    id: 'canonical-caller-closure',
    testFile: TEST_FILE,
    testNamePattern: '^canonical-caller-closure$',
    detail: 'All callers in src/rebalancer use canonical observation without ' +
      'fallback options, and canonical normalization preserves each entity ' +
      'type\'s identity contract.',
  }),
  Object.freeze({
    id: 'unavailable-and-wrong-identity-refused',
    testFile: TEST_FILE,
    testNamePattern: '^unavailable-and-wrong-identity-refused$',
    detail: 'Unavailable authoritative reads and contradictory entity, ' +
      'sibling replica, or node identities are refused and never falsely ' +
      'settle operations.',
  }),
  Object.freeze({
    id: 'exact-generation-completion',
    testFile: TEST_FILE,
    testNamePattern: '^exact-generation-completion$',
    detail: 'Older generation timestamps and mismatched attempt tokens are ' +
      'refused; exact generation evidence settles the operation and ' +
      'discharges reservations/cleanup custody.',
  }),
  Object.freeze({
    id: 'restart-and-lost-answer-obligations',
    testFile: TEST_FILE,
    testNamePattern: '^restart-and-lost-answer-obligations$',
    detail: 'Authoritative unavailability across node-restart and lost-answer ' +
      'boundaries preserves owned operation obligations for retry.',
  }),
  Object.freeze({
    id: 'deleted-fallback-cannot-be-reactivated',
    testFile: TEST_FILE,
    testNamePattern: '^deleted-fallback-cannot-be-reactivated$',
    detail: 'Passing deleted fallback options (allowPartitionNodeFallback, ' +
      'allowCacheFallback) is ignored and cannot reactivate secondary queries ' +
      'or cache fallbacks.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, ' +
      'read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
