/**
 * TX1 (adversarial risk review 2026-10-10, PR100 Leg A) red witnesses on the
 * participant owner, revision 2: a committed transaction must be the same
 * transaction on every replica, and consensus progress never depends on the
 * proposer first receiving its own acknowledgment. Measured on the production
 * PartitionService through the controllable consensus port (the same seam the
 * write-commit suite uses; the port double proves scheduling, not durability):
 *
 *  P1 - no committed visibility before consensus: while the commit request is
 *       pending, the proposal exists, no session row is readable on the leader's
 *       connection, and the request resolves only after the marker is applied.
 *  P2 - replicated application, atomically: the follower applies the committed
 *       marker's operations, records the COMMITTED outcome and advances its
 *       durable applied index to the marker's index in one application.
 *  P3 - fault: a transaction whose second statement fails applies nothing and
 *       records a typed (not COMMITTED) outcome; the applied index advances.
 *
 * Red on the current participant (local COMMIT before the marker; the marker's
 * apply branch records the outcome without executing operations). The positive
 * controls run in their own tests so a red negative cannot hide them. The
 * revision-1 red output is retained under the quest's evidence directory.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from '../../src/raft/raft-operation-port-request.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {
  ControllableConsensusPort,
  createControllablePartitionService,
} from './partition-service-test-support.js';

const PARTITION_ID = 'tx-replicated-apply';
const REPLICAS = ['tx-apply-r1', 'tx-apply-r2', 'tx-apply-r3'];
const SESSION = 'tx-apply-session';
const EPOCH = 7;
const ROW = Object.freeze({id: 'row-1', value: 'value-1'});
const ROW_2 = Object.freeze({id: 'row-2', value: 'value-2'});
const SETTLE_TICKS = 20;
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function createReplica(replicaId) {
  return createControllablePartitionService({
    partitionId: PARTITION_ID,
    tableId: 'test_table',
    tableName: 'test_table',
    replicaId,
    replicaIds: REPLICAS,
    nodeId: 'test-node',
    peerAddresses: REPLICAS.map((id) => `test-node/partition/${id}`),
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
    dbPath: ':memory:',
  }, new ControllableConsensusPort());
}
function insertOf(row) {
  return {type: PARTITION_SERVICE_OPERATION.INSERT, table: 'test_table',
    sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)', params: [row.id, row.value]};
}
function rowCount(partition, id = ROW.id) {
  return partition.db.prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
    .get(id).count;
}
// The durable applied index the rs-raft store holds for this partition's
// group, read through the store owner on the partition's own database.
function durableAppliedIndex(partition) {
  const request = partition.controllablePort.request;
  return Number(new RaftRsDurableStore(request[RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE])
    .readDurableProgress(request[RAFT_OPERATION_PORT_REQUEST.GROUP_ID]).appliedIndex);
}
async function leaderWithProposals() {
  const leader = createReplica(REPLICAS[0]);
  await leader.initialize();
  leader.role = 'leader';
  leader.isLeader = true;
  leader.leaderId = leader.replicaId;
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  const proposed = [];
  leader.controllablePort.setProposeHandler(async (entry) => {
    proposed.push({...entry});
  });
  return {leader, proposed};
}
async function stageSession(leader, rows) {
  await leader.beginTransaction(SESSION, EPOCH);
  for (const row of rows) {
    const staged = await leader.executeTransactionWrite(insertOf(row), SESSION);
    assert.equal(staged.success, true, `the session write stages: ${JSON.stringify(staged)}`);
  }
}
function isCommitMarker(entry) {
  return entry.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT;
}
// Start the commit and leave it pending: consensus is driven by the test,
// never by waiting for the proposer's own acknowledgment.
async function startCommit(leader, proposed) {
  const pending = leader.commitTransaction(SESSION);
  let settled = false;
  const observe = () => {
    settled = true;
  };
  pending.then(observe, observe);
  for (let tick = 0; tick < SETTLE_TICKS && !proposed.some(isCommitMarker); tick += 1) {
    await settle();
  }
  return {pending, marker: proposed.find(isCommitMarker), isSettled: () => settled};
}
async function commitOnLeader(leader, proposed) {
  const commit = await startCommit(leader, proposed);
  assert.ok(commit.marker, 'the commit proposes a TRANSACTION_COMMIT marker');
  leader.controllablePort.commit(commit.marker);
  await commit.pending;
  return commit.marker;
}

test('TX1 P1: a pending commit exposes no row and resolves only after its marker is applied',
  async () => {
    const {leader, proposed} = await leaderWithProposals();
    try {
      await stageSession(leader, [ROW]);
      const commit = await startCommit(leader, proposed);
      assert.ok(commit.marker, 'the commit proposes a TRANSACTION_COMMIT marker while pending');
      assert.equal(commit.marker.operations?.length, 1, 'the marker carries the staged operation');
      assert.equal(rowCount(leader), 0,
        'no row is readable on the leader before the marker is committed and applied');
      assert.equal(commit.isSettled(), false,
        'the commit request must not resolve before its marker is committed');
      leader.controllablePort.commit(commit.marker);
      const result = await commit.pending;
      assert.equal(result.success, true, 'the participant acknowledges after application');
      assert.equal(rowCount(leader), 1, 'the committed marker applies the row once on the proposer');
    } finally {
      await leader.shutdown();
    }
  });

test('TX1 P2: the committed TRANSACTION_COMMIT applies its operations, outcome and applied ' +
  'index on a replica that staged nothing', async () => {
  const {leader, proposed} = await leaderWithProposals();
  const follower = createReplica(REPLICAS[1]);
  try {
    await follower.initialize();
    assert.equal(rowCount(follower), 0, 'the follower starts without the row');
    await stageSession(leader, [ROW]);
    const marker = await commitOnLeader(leader, proposed);
    const appliedBefore = durableAppliedIndex(follower);
    follower.controllablePort.commit(marker);
    assert.equal(rowCount(follower), 1,
      'a committed transaction marker must apply its operations on every replica');
    assert.equal(follower.resolveTransactionCommitOutcome(SESSION, EPOCH),
      PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
      'the committed outcome is recorded with the application');
    assert.equal(durableAppliedIndex(follower), appliedBefore + 1,
      'the durable applied index advances with the same application');
  } finally {
    await follower.shutdown();
    await leader.shutdown();
  }
});

test('TX1 P3: a transaction whose second statement fails applies nothing and records a typed ' +
  'outcome', async () => {
  const {leader, proposed} = await leaderWithProposals();
  const follower = createReplica(REPLICAS[1]);
  try {
    await follower.initialize();
    // The follower already holds row-2: the transaction's second INSERT must
    // fail there deterministically, and the first must not survive alone.
    follower.db.prepare('INSERT INTO test_table (id, value) VALUES (?, ?)')
      .run(ROW_2.id, 'pre-existing');
    await stageSession(leader, [ROW, ROW_2]);
    const marker = await commitOnLeader(leader, proposed);
    assert.equal(marker.operations?.length, 2, 'the marker carries both staged operations');
    const appliedBefore = durableAppliedIndex(follower);
    follower.controllablePort.commit(marker);
    assert.equal(rowCount(follower, ROW.id), 0,
      'a failed transaction must apply none of its operations');
    assert.equal(follower.db.prepare('SELECT value FROM test_table WHERE id = ?').get(ROW_2.id).value,
      'pre-existing', 'the conflicting row is untouched');
    assert.notEqual(follower.resolveTransactionCommitOutcome(SESSION, EPOCH),
      PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
      'a transaction that applied nothing is not recorded as COMMITTED');
    assert.equal(durableAppliedIndex(follower), appliedBefore + 1,
      'the entry is applied (as a recorded failure) and the applied index advances');
  } finally {
    await follower.shutdown();
    await leader.shutdown();
  }
});

test('control: an ordinary committed write applies exactly once and advances the applied index',
  async () => {
    const {leader, proposed} = await leaderWithProposals();
    try {
      const appliedBefore = durableAppliedIndex(leader);
      const pending = leader.insertData('test_table', {...ROW});
      for (let tick = 0; tick < SETTLE_TICKS && proposed.length === 0; tick += 1) {
        await settle();
      }
      assert.equal(proposed.length, 1, 'the write is proposed while its request is pending');
      assert.equal(rowCount(leader), 0, 'an ordinary write is not visible before its commit');
      leader.controllablePort.commit(proposed[0]);
      const result = await pending;
      assert.equal(result.success, true, 'the proposer is answered after application');
      assert.equal(rowCount(leader), 1, 'the committed write applies once');
      assert.equal(durableAppliedIndex(leader), appliedBefore + 1, 'the applied index advances');
      leader.controllablePort.commit(proposed[0]);
      assert.equal(rowCount(leader), 1, 'a replayed committed command applies nothing twice');
    } finally {
      await leader.shutdown();
    }
  });

test('control: replaying a committed transaction marker applies nothing twice', async () => {
  const {leader, proposed} = await leaderWithProposals();
  try {
    await stageSession(leader, [ROW]);
    const marker = await commitOnLeader(leader, proposed);
    const once = rowCount(leader);
    leader.controllablePort.commit(marker);
    assert.equal(rowCount(leader), once, 'a replayed marker does not apply its operations again');
  } finally {
    await leader.shutdown();
  }
});
