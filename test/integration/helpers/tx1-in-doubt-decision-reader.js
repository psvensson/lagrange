// Reconstruct an in-doubt COMMIT decision in a new process from actual
// post-SIGKILL RF3 system-table rows. No participant transport is connected;
// reconstruction is proved here, never completion of COMMIT fanout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DistributedTransactionCoordinator} from
  '../../../src/query/distributed/distributed-transaction-coordinator.js';

const {transactionId, transactions, participants} = JSON.parse(
  fs.readFileSync(process.stdin.fd, 'utf8'));
assert.equal(transactions.length, 1);
assert.equal(transactions[0].transaction_id, transactionId);
assert.equal(transactions[0].decision, 'COMMIT');
assert.notEqual(transactions[0].status, 'COMMITTED');
assert.equal(participants.length, 2);
let fanoutCalls = 0;
const refuseAction = async () => {
  fanoutCalls += 1;
  throw new Error('read-only reconstruction must not execute participant work');
};
const coordinator = new DistributedTransactionCoordinator({
  commitParticipant: refuseAction,
  rollbackParticipant: refuseAction,
  prepareParticipant: refuseAction,
  persistTransaction: refuseAction,
  persistParticipant: refuseAction,
  persistTransactionDecision: refuseAction,
});
coordinator.recoverFromSystemTables({transactions, participants,
  writeOperations: []});
const restored = coordinator.workflowCoordinator.getWorkflowById(transactionId);
assert.ok(restored, 'the exact durable transaction identity is recovered');
// A snapshot can discover an ID, but it cannot authorize a COMMIT decision.
// The live recovery owner must reread it through the authoritative gateway.
// The restored record has the live record's shape: no decision key at all.
assert.equal(Object.hasOwn(restored, 'decision'), false,
  'snapshot discovery must not adopt an unverified COMMIT decision');
assert.equal(restored.participants.size, 2);
assert.equal(restored.frozenParticipantCount, 2);
assert.equal(restored.recoveryDiscovered, true);
assert.equal(coordinator.recoveredTransactionIds.has(transactionId), true);
assert.equal(fanoutCalls, 0);
process.stdout.write(JSON.stringify({transactionId,
  status: restored.status, durableDecisionOnDisk: transactions[0].decision,
  adoptedDecisionWithoutAuthority: restored.decision !== null,
  participants: restored.participants.size, frozen: restored.frozenParticipantCount,
  recoveryDiscovered: restored.recoveryDiscovered, fanoutCalls,
  replayAttempted: false, coordinatorRestarted: false}));
