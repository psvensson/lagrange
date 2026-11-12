#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {
  CHECK_VERIFICATION_FLAG,
  exitWithQuestVerificationCheck,
} from './quest-verification-check.js';

const QUEST_ID = 'benchmark-cohort-preserving-dataset-reset';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) exitWithQuestVerificationCheck(QUEST_ID);

const WITNESS = 'test/distributed/harness/__tests__/benchmark-cohort-preserving-dataset-reset.test.js';

const receipts = Object.freeze([
  Object.freeze({
    id: 'supported-reset-capability',
    testFile: WITNESS,
    testNamePattern: '^supported-reset-capability:.*$',
    expectedTests: 1,
    detail: 'Lagrange SQL engine supports TRUNCATE TABLE across partitions with PostgreSQL-compatible ' +
      'command tag TRUNCATE TABLE without dropping the table.',
  }),
  Object.freeze({
    id: 'repeatable-clean-dataset-without-reformation',
    testFile: WITNESS,
    testNamePattern: '^repeatable-clean-dataset-without-reformation:.*$',
    expectedTests: 1,
    detail: 'Semantic gate stage executes dataset reset repeatedly on the same deployment ' +
      'without cluster re-formation or container redeployment.',
  }),
  Object.freeze({
    id: 'durability-restart-retained',
    testFile: WITNESS,
    testNamePattern: '^durability-restart-retained:.*$',
    expectedTests: 1,
    detail: 'Durability restart preserves container identity, host endpoint, and volume continuity ' +
      'while observing incarnation advancement.',
  }),
  Object.freeze({
    id: 'same-cohort-journey-to-valid-observed',
    testFile: WITNESS,
    testNamePattern: '^same-cohort-journey-to-valid-observed:.*$',
    expectedTests: 1,
    detail: 'Complete Lagrange journey on the same deployed cohort preserves gate binding and ' +
      'is admitted as valid-observed by benchmark-claim-admission.',
  }),
  Object.freeze({
    id: 'cross-deployment-rejection',
    testFile: WITNESS,
    testNamePattern: '^cross-deployment-rejection:.*$',
    expectedTests: 1,
    detail: 'Claims where semantic gate proofs and measurement ran on different deployments ' +
      'remain strictly rejected with SEMANTIC_GATE_UNBOUND.',
  }),
  Object.freeze({
    id: 'actual-product-reset-and-state-evidence',
    testFile: WITNESS,
    testNamePattern: '^actual-product-reset-and-state-evidence:.*$',
    expectedTests: 1,
    detail: 'Actual product execution verifies rows are removed across scenario tables and ' +
      'adapter reset restores clean initial dataset counts.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'Independent verification approval recorded in quest log.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
