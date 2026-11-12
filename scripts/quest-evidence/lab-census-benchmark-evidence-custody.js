#!/usr/bin/env node
// Evidence harness for the sealed lab-census-benchmark-evidence-custody Quest.
// Receipts 1-6 run focused unit tests validating:
// 1. canonical-runner-placement-and-cleanup: process-group termination and lock custody.
// 2. complete-source-bound-witness-manifest: src/preload digests and complete witness accounting.
// 3. invalid-or-incomplete-evidence-refused: fail-closed validation on mismatched digests or incomplete manifests.
// 4. dependency-aware-shard-applicability: shard reuse validation against file and dependency drift.
// 5. executed-semantic-proof-ids: proof IDs awarded only for executed/passed cases with restart evidence.
// 6. actual-deployment-binding: strict matching deployment identity across all proof cases.
// Receipt 7 checks for an approving independent subagent verification in quest log.

import {runQuestEvidenceHarness} from './harness-runtime.js';
import {
  CHECK_VERIFICATION_FLAG,
  exitWithQuestVerificationCheck,
} from './quest-verification-check.js';

const QUEST_ID = 'lab-census-benchmark-evidence-custody';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) exitWithQuestVerificationCheck(QUEST_ID);

const TEST_FILE = 'test/scripts/lab-census-benchmark-evidence-custody.test.js';

const receipts = Object.freeze([
  Object.freeze({
    id: 'canonical-runner-placement-and-cleanup',
    testFile: TEST_FILE,
    testNamePattern: '^R1 canonical runner placement and cleanup binds machine lock holder and terminates runner process group$',
    expectedTests: 1,
    detail: 'Lab runner placement binds machine lock holder, terminates process group, and cleans up on exit.',
  }),
  Object.freeze({
    id: 'complete-source-bound-witness-manifest',
    testFile: TEST_FILE,
    testNamePattern: '^R2 complete source-bound witness manifest records digests and full witness accounting$',
    expectedTests: 1,
    detail: 'Census collection produces a complete source-bound witness manifest with digests and witness accounting.',
  }),
  Object.freeze({
    id: 'invalid-or-incomplete-evidence-refused',
    testFile: TEST_FILE,
    testNamePattern: '^R3 merge and join refuse runs with mismatched digests incomplete witnesses non-zero exits or unreadable coverage$',
    expectedTests: 1,
    detail: 'Census merge and join refuse mismatched digests, incomplete witnesses, and non-zero exit codes.',
  }),
  Object.freeze({
    id: 'dependency-aware-shard-applicability',
    testFile: TEST_FILE,
    testNamePattern: '^R4 dependency-aware shard applicability accepts matching shards and rejects drifted dependencies or files$',
    expectedTests: 1,
    detail: 'Shard applicability validation checks source file and dependency drift before reuse.',
  }),
  Object.freeze({
    id: 'executed-semantic-proof-ids',
    testFile: TEST_FILE,
    testNamePattern: '^R5 admitClaim and checkSemanticGate award only executed and passed semantic proof IDs rejecting skipped or unproven cases$',
    expectedTests: 1,
    detail: 'Claim admission awards only executed and passed semantic proof IDs, rejecting skipped cases.',
  }),
  Object.freeze({
    id: 'actual-deployment-binding',
    testFile: TEST_FILE,
    testNamePattern: '^R6 gateBindingHolds strictly enforces deployment identity across all proof cases refusing cross-deployment evidence$',
    expectedTests: 1,
    detail: 'Gate binding strictly requires matching deployment identity across all semantic proof cases.',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'An approving subagent verification newer than the last attempt.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
