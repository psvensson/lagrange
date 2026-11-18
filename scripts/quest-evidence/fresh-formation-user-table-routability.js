#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {
  CHECK_VERIFICATION_FLAG,
  exitWithQuestVerificationCheck,
} from './quest-verification-check.js';

const QUEST_ID = 'fresh-formation-user-table-routability';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

const WITNESS_TEST =
  'test/scripts/fresh-formation-user-table-routability.test.js';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerificationCheck(QUEST_ID);
}

const receipts = Object.freeze([
  Object.freeze({
    id: 'reproducer-red-on-current-product',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^reproducer is registered with unchanged preregistered bounds and retained red H1 baseline$',
    detail: 'The reproducer scenario fresh-formation-user-table-routability ' +
      'preserves its preregistered bounds and topology requirements, and ' +
      'the quest retains its sealed red measurement and historical H1 evidence.',
  }),
  Object.freeze({
    id: 'first-divergence-repaired-at-cause',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^first causal divergence and all bounded formation authority blockers are repaired at cause$',
    detail: 'All 8 bounded runtime formation/authority quests plus ' +
      'management, load-admission, and legacy-fallback closure are solved ' +
      'with passing receipts, and zero legacy fallback violations survive.',
  }),
  Object.freeze({
    id: 'scenario-green-three-consecutive',
    testFile: WITNESS_TEST,
    testNamePattern:
      '^registered three-node formation scenario passes three consecutive runs on physical lab hosts$',
    detail: 'Three consecutive fresh formation runs pass on physical lab ' +
      'hosts matching the current source fingerprint, satisfying all 8 ' +
      'predicates with observed physical boot identities and retained logs.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, ' +
      'read through the solve store owner.',
  }),
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts,
});
