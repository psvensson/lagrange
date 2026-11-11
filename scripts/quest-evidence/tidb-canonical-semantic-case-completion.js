#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {CHECK_VERIFICATION_FLAG, exitWithQuestVerification} from './verification-check.js';

const QUEST_ID = 'tidb-canonical-semantic-case-completion';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) exitWithQuestVerification(QUEST_ID);

const WITNESS = 'test/distributed/harness/__tests__/tidb-canonical-semantic-case-completion.test.js';

const receipts = Object.freeze([
  Object.freeze({
    id: 'canonical-case-inventory',
    testFile: WITNESS,
    testNamePattern: '^canonical-case-inventory:.*$',
    expectedTests: 1,
    detail: 'All 9 canonical cases from OLTP_SCENARIO_A_PROOF_CASES are wired to TiDB ' +
      'and cover all 31 required system proof IDs.',
  }),
  Object.freeze({
    id: 'all-required-cases-executed',
    testFile: WITNESS,
    testNamePattern: '^all-required-cases-executed:.*$',
    expectedTests: 1,
    detail: 'Complete TiDB Scenario A journey executes all 9 canonical cases and passes ' +
      'with all 31 proof IDs awarded.',
  }),
  Object.freeze({
    id: 'native-product-results-and-independent-effects',
    testFile: WITNESS,
    testNamePattern: '^native-product-results-and-independent-effects:.*$',
    expectedTests: 1,
    detail: 'The 5 missing cases execute natively against TiDB via MySQL client and ' +
      'verify independent query and storage effects.',
  }),
  Object.freeze({
    id: 'durability-restart-evidence',
    testFile: WITNESS,
    testNamePattern: '^durability-restart-evidence:.*$',
    expectedTests: 1,
    detail: 'Durability restart targets a TiKV data-bearing replica, verifies incarnation ' +
      'advancement, preserves storage continuity, and checks post-restart state.',
  }),
  Object.freeze({
    id: 'missing-skipped-cases-not-credited',
    testFile: WITNESS,
    testNamePattern: '^missing-skipped-cases-not-credited:.*$',
    expectedTests: 1,
    detail: 'Skipped or unexecuted cases (such as durability without persistent storage or ' +
      'restart capability) receive zero proof credit and leave the gate incomplete.',
  }),
  Object.freeze({
    id: 'deployment-bound-claim-admission',
    testFile: WITNESS,
    testNamePattern: '^deployment-bound-claim-admission:.*$',
    expectedTests: 1,
    detail: 'Complete 9-case TiDB gate evidence binds to the deployment and is admitted ' +
      'by benchmark-claim-admission as valid-observed.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'Independent verification approval recorded in quest log.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
