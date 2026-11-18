#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {
  CHECK_VERIFICATION_FLAG,
  exitWithQuestVerificationCheck,
} from './quest-verification-check.js';

const QUEST_ID = 'repository-legacy-fallback-closure';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

const WITNESS_TEST = 'test/scripts/repository-legacy-fallback-closure.test.js';

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerificationCheck(QUEST_ID);
}

const receipts = Object.freeze([
  Object.freeze({
    id: 'repository-wide-candidate-inventory',
    testFile: WITNESS_TEST,
    testNamePattern: '^repository-wide candidate inventory is complete and reconciled with census$',
    detail: 'All 2,685 census candidate sites across 16 runs are accounted for, with valid (row, file, hash, occurrence) identities and coverage classes',
  }),
  Object.freeze({
    id: 'zero-unclassified-candidates',
    testFile: WITNESS_TEST,
    testNamePattern: '^zero unclassified candidates remain across the repository-wide inventory$',
    detail: 'Every census candidate site has a recorded classification with valid owner and reason; fallback_sites_unclassified evaluates to zero in code-navigability-budget',
  }),
  Object.freeze({
    id: 'zero-unresolved-legacy-fallback-violations',
    testFile: WITNESS_TEST,
    testNamePattern: '^zero unresolved legacy or fallback violations survive in maintained code$',
    detail: 'All classified candidate sites possess authorized semantic dispositions and zero unresolved alternate authorities or unrouted legacy shims exist',
  }),
  Object.freeze({
    id: 'canonical-caller-and-export-closure',
    testFile: WITNESS_TEST,
    testNamePattern: '^canonical caller and export closure verifies absent shims and canonical paths$',
    detail: 'Retired paths are absent from exports and callers, and runtime legacy deletion terms remain absent across maintained files',
  }),
  Object.freeze({
    id: 'affected-owner-proofs',
    testFile: WITNESS_TEST,
    testNamePattern: '^affected owner test proofs pass across classified subsystems$',
    detail: 'Witness proofs and core test suites for affected owners (partition, bootstrap, control-plane, rebalancer, raft) pass without regressions',
  }),
  Object.freeze({
    id: 'reintroduction-guard-and-coverage-limits',
    testFile: WITNESS_TEST,
    testNamePattern: '^reintroduction guard fails closed on unclassified sites and records coverage limits$',
    detail: 'Reintroduction guard fails closed on unclassified sites or tampered hashes, and static/runtime coverage limits are explicitly recorded without equating unobserved execution to dead code',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt, read through the solve store owner',
  }),
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts,
});
