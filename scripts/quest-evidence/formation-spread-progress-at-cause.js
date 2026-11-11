#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {CHECK_VERIFICATION_FLAG, exitWithQuestVerification} from './verification-check.js';

const QUEST_ID = 'formation-spread-progress-at-cause';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

const WITNESS = 'test/rebalancer/formation-spread-progress-at-cause.test.js';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerification(QUEST_ID);
}

const receipts = Object.freeze([
  Object.freeze({
    id: 'first-causal-divergence',
    testFile: WITNESS,
    testNamePattern: '^first-causal-divergence: .*$',
    expectedTests: 1,
    detail: 'Reproduces the exact first causal divergence where 4 joining nodes stall on ' +
      'node_ready_lease_incomplete / incomplete priority spread (spreadGap > 0) and proves ' +
      'the causal mechanism.',
  }),
  Object.freeze({
    id: 'historical-failure-family-witnesses',
    testFile: WITNESS,
    testNamePattern: '^historical-failure-family-witnesses: .*$',
    expectedTests: 1,
    detail: 'Covers the 4 historical failure families (formation-voter-surplus-promotion-deferral-livelock, ' +
      'formation-ledger-spread-completion-self-move-interlock-deadlock, over-target-cap-spread-cure-wipe, ' +
      'formation-release-handoff-closure-v4).',
  }),
  Object.freeze({
    id: 'composed-safety-and-finite-failure-progress',
    testFile: WITNESS,
    testNamePattern: '^composed-safety-and-finite-failure-progress: .*$',
    expectedTests: 1,
    detail: 'The same composed witness preserves surplus/concurrent-operation safety (never exceeding ' +
      'over-target cap or dropping below quorum) and progresses after finite failure clears.',
  }),
  Object.freeze({
    id: 'meaningful-negative-control',
    testFile: WITNESS,
    testNamePattern: '^meaningful-negative-control: .*$',
    expectedTests: 1,
    detail: 'Proves that when the blocking condition genuinely persists (e.g. target node remains unreachable ' +
      'or voter surplus cannot be safely promoted), safety holds and premature release/unsafe move is refused.',
  }),
  Object.freeze({
    id: 'unchanged-bounds-and-owned-wake',
    testFile: WITNESS,
    testNamePattern: '^unchanged-bounds-and-owned-wake: .*$',
    expectedTests: 1,
    detail: 'Proves that progress occurs within unchanged timeout/deadline bounds via an owned canonical wake ' +
      '(no widened deadlines, no polling fallback, no harness state injection).',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
