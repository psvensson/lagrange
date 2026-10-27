// New-process construction of the production coordinator from real RF3 disk
// readback after SIGKILL. No live system-table gateway or participant transport
// is present, so the proven scope is immutable reconstruction, not replay.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DistributedTransactionCoordinator} from
  '../../../src/query/distributed/distributed-transaction-coordinator.js';
import {TABLES} from '../../../src/constants/index.js';

const {transactionId, payload} = JSON.parse(fs.readFileSync(process.stdin.fd, 'utf8'));
const transactions = payload[TABLES.SQL_TRANSACTIONS];
const participants = payload[TABLES.SQL_TRANSACTION_PARTICIPANTS];
const writeOperations = payload[TABLES.SQL_WRITE_OPERATIONS];
assert.equal(transactions.length, 1);
assert.equal(transactions[0].transaction_id, transactionId);
assert.equal(transactions[0].status, 'COMMITTED');
assert.equal(participants.length, 2);
let commitFanoutCalls = 0;
const refuseFanout = async () => {
  commitFanoutCalls += 1;
  throw new Error('read-only recovery must not contact a participant');
};
const coordinator = new DistributedTransactionCoordinator({
  commitParticipant: refuseFanout,
  prepareParticipant: refuseFanout,
  rollbackParticipant: refuseFanout,
  persistTransaction: async () => {
    throw new Error('read-only recovery must not write coordinator state');
  },
});
coordinator.recoverFromSystemTables({transactions, participants, writeOperations});
const state = coordinator.workflowCoordinator.getWorkflowById(transactionId);
assert.ok(state, 'the coordinator reconstructs the durable transaction identity');
assert.equal(state.status, 'COMMITTED');
assert.equal(state.participants.size, 2);
assert.equal(state.frozenParticipantCount, 2);
// Live recovery must later recontact participants, but this reader has only
// disk bytes, not their transport. Do not pretend to have executed replay.
assert.equal(commitFanoutCalls, 0);
process.stdout.write(JSON.stringify({status: state.status,
  participants: state.participants.size, commitFanoutCalls,
  replayAttempted: false, readOnlyRecovery: true}));
