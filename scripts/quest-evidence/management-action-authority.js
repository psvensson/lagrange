#!/usr/bin/env node
/**
 * Evidence harness for the sealed management-action-authority Quest.
 * Receipts 1-5 select the named tests of test/bootstrap/management-action-authority.test.js.
 * Receipt 6 checks for an approving subagent verification in log.ndjson newer than the last attempt.
 */
import {runQuestEvidenceHarness} from './harness-runtime.js';
import {CHECK_VERIFICATION_FLAG, exitWithQuestVerification} from './verification-check.js';

const QUEST_ID = 'management-action-authority';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

if (process.argv.includes(CHECK_VERIFICATION_FLAG)) {
  exitWithQuestVerification(QUEST_ID);
}

const TEST_FILE = 'test/bootstrap/management-action-authority.test.js';

const receipts = Object.freeze([
  Object.freeze({
    id: 'operation-authority-contract',
    testFile: TEST_FILE,
    testNamePattern: '^operation-authority-contract: canonical operation authority contract shape and fields$',
    detail: 'PartitionService.readPartitionConsensusAuthority and evaluatePartitionQuorumAuthority produce the canonical operation authority contract carrying configuration key, term, incarnation, voters and freshness bound',
  }),
  Object.freeze({
    id: 'invalid-authority-refused',
    testFile: TEST_FILE,
    testNamePattern: '^invalid-authority-refused: hand-set role and uncertified consensus are refused$',
    detail: 'hand-set role, stubbed term, uncertified consensus, uninitialized service, shutdown service, follower, and unapplied configuration change are refused',
  }),
  Object.freeze({
    id: 'mutation-time-identity-and-freshness',
    testFile: TEST_FILE,
    testNamePattern: '^mutation-time-identity-and-freshness: mutation point revalidates configuration identity and freshness bound$',
    detail: 'ManagementV1Owner._executeOperation revalidates configuration identity, incarnation, and freshness bound at mutation execution point, refusing expired or changed state with QUORUM_SAFETY_HALT',
  }),
  Object.freeze({
    id: 'real-native-producer-consumer-action',
    testFile: TEST_FILE,
    testNamePattern: '^real-native-producer-consumer-action: real native consensus leader executes management operation$',
    detail: 'real native createRaftRsOperationPort drives PartitionService to BootstrapClusterViewOwner to ManagementV1Owner, executing management action from native consensus evidence',
  }),
  Object.freeze({
    id: 'refusal-recovery-and-cleanup',
    testFile: TEST_FILE,
    testNamePattern: '^refusal-recovery-and-cleanup: refusal during quorum loss, recovery on restoration, and clean resource teardown$',
    detail: 'management action is refused when native consensus loses quorum, recovers when quorum is restored, and all native resources are cleanly torn down',
  }),
  Object.freeze({
    id: 'independent-verification',
    command: `node scripts/quest-evidence/${QUEST_ID}.js ${CHECK_VERIFICATION_FLAG}`,
    detail: 'an approving independent subagent verification recorded in log.ndjson newer than the last attempt',
  }),
]);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts,
});
