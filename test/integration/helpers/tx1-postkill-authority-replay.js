/**
 * Read the actual post-SIGKILL coordinator files using independent SQLite
 * connections, then exercise the production recovery owner with transport
 * explicitly unavailable. This is NOT Raft-leader authority or live replay.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {DistributedTransactionCoordinator} from
  '../../../src/query/distributed/distributed-transaction-coordinator.js';

const {transactionId, transactionRequests, participantRequests} =
  JSON.parse(fs.readFileSync(process.stdin.fd, 'utf8'));
assert.equal(transactionRequests.length, 3);
assert.equal(participantRequests.length, 3);
let scans = 0;
const fanouts = [];
let rollbacks = 0;
let decisionWrites = 0;
const statusWrites = [];
function physicalRows(requests) {
  const observed = requests.map(({dbPath, sql, params}) => {
    const db = new Database(dbPath, {readonly: true, fileMustExist: true});
    try {
      return db.prepare(sql).all(...params);
    } finally {
      db.close();
    }
  });
  const [first] = observed;
  assert.ok(observed.every((rows) =>
    JSON.stringify(rows) === JSON.stringify(first)),
  'all three independent physical replicas must agree');
  return first;
}
function diskRows() {
  scans += 1;
  const transactions = physicalRows(transactionRequests);
  const participants = physicalRows(participantRequests);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].transaction_id, transactionId);
  assert.equal(participants.length, 2);
  return {transaction: transactions[0], participants};
}
const durable = diskRows();
assert.equal(durable.transaction.decision, 'COMMIT');
const original = JSON.stringify(durable);
let readMode = 'unavailable';
const coordinator = new DistributedTransactionCoordinator({
  logger: {debug() {}, warn() {}, error() {}},
  participantRetryMaxRetries: 0,
  readTransactionRecoveryState: async (id) => {
    assert.equal(id, transactionId);
    if (readMode === 'unavailable') return {state: 'unavailable'};
    if (readMode === 'invalid') {
      const rows = diskRows();
      return {state: 'available',
        transaction: {...rows.transaction, decision_text: '{invalid-json'},
        participants: rows.participants};
    }
    return {state: 'available', ...diskRows()};
  },
  commitParticipant: async (sessionId, partitionId, binding) => {
    fanouts.push({sessionId, partitionId, ...binding});
    throw new Error('offline recovery witness has no participant transport');
  },
  rollbackParticipant: async () => {
    rollbacks += 1;
    throw new Error('recorded COMMIT may not become ROLLBACK');
  },
  persistTransaction: async (row) => {
    statusWrites.push({status: row.status, transactionId: row.transactionId});
    assert.notEqual(row.status, 'COMMITTED',
      'offline transport cannot publish a completed COMMIT');
    assert.notEqual(row.status, 'ROLLED_BACK');
  },
  persistParticipant: async () => {},
  persistTransactionDecision: async () => {
    decisionWrites += 1;
    throw new Error('recorded COMMIT cannot be re-decided');
  },
});
const discovery = structuredClone(durable);
discovery.transaction.decision = 'ROLLBACK';
discovery.transaction.decision_text = '{untrusted-snapshot}';
coordinator.recoverFromSystemTables({
  transactions: [discovery.transaction], participants: [],
  writeOperations: [],
});
const tx = coordinator.workflowCoordinator.getWorkflowById(transactionId);
assert.ok(tx?.recoveryDiscovered);
assert.equal(Object.hasOwn(tx, 'decision'), false,
  'discovery snapshot cannot authorize decision');

const unavailable = await coordinator.resumeRecoveredTransactions();
assert.equal(unavailable.failed, 1);
assert.equal(unavailable.resumed, 0);
assert.equal(fanouts.length, 0);
assert.ok(coordinator.recoveredTransactionIds.has(transactionId));

readMode = 'invalid';
const invalid = await coordinator.resumeRecoveredTransactions();
assert.equal(invalid.failed, 1);
assert.equal(invalid.resumed, 0);
assert.equal(fanouts.length, 0);
assert.equal(Object.hasOwn(tx, 'decision'), false,
  'an invalid authoritative read adopts no decision');

readMode = 'available';
const attempted = await coordinator.resumeRecoveredTransactions();
assert.equal(attempted.failed, 1, 'undeliverable COMMIT remains recovery debt');
assert.equal(attempted.resumed, 0);
assert.equal(fanouts.length, 2,
  'recovery attempts the two exact recorded participants');
assert.equal(rollbacks, 0);
assert.equal(decisionWrites, 0);
assert.equal(tx.decision?.decision, 'COMMIT');
assert.equal(tx.frozenParticipantCount, 2);
assert.ok(coordinator.recoveredTransactionIds.has(transactionId));
assert.deepEqual(fanouts.map((request) => request.partitionId).sort(),
  durable.participants.map((participant) => participant.partition_id).sort());
for (const request of fanouts) {
  const participant = durable.participants.find((row) =>
    row.partition_id === request.partitionId);
  assert.equal(request.transactionId, transactionId);
  assert.equal(request.participantId, participant.participant_id);
  assert.equal(request.preparedDigest, participant.prepared_digest);
  assert.equal(request.decisionDigest, durable.transaction.decision_digest);
  assert.equal(request.decisionText, durable.transaction.decision_text);
  assert.equal(request.decision, 'COMMIT');
  assert.equal(request.commitMode, 'TWO_PHASE_COMMIT');
  assert.equal(request.transactionEpoch, durable.transaction.transaction_epoch);
  assert.equal(request.sessionId, durable.transaction.session_id);
}
assert.equal(JSON.stringify(diskRows()), original,
  'controlled recovery changes no physical transaction rows');
assert.ok(statusWrites.every((row) => row.status !== 'COMMITTED'));
process.stdout.write(JSON.stringify({
  kind: 'TX1_M1_POSTKILL_DISK_REREAD', transactionId,
  physicalReplicaFiles: 6, scans, forgedRollbackIgnored: true,
  unavailableHeld: true, malformedAuthorityHeld: true,
  boundCommitAttempts: fanouts.length,
  rollbackCalls: rollbacks, decisionWrites,
  durableRowsUnchanged: true,
  transportDeliberatelyUnavailable: true,
  liveParticipantReplayCertified: false,
  liveCoordinatorRestartCertified: false,
}) + '\n');
