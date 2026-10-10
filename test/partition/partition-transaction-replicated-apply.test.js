/**
 * TX1 (adversarial risk review 2026-10-10, PR100 Leg A) red witnesses on the
 * participant owner: a committed transaction must be the same transaction on
 * every replica. Two properties, both measured on the production
 * PartitionService through the controllable consensus port (the same seam the
 * write-commit suite uses; the port double is the only test physics):
 *
 *  P1 - no committed visibility before consensus: a session's rows are not
 *       readable on the leader's own connection before the transaction's
 *       marker is a committed, applied entry.
 *  P2 - the committed TRANSACTION_COMMIT entry applies its carried operations
 *       on a replica that did not stage them, exactly once.
 *
 * Red on the current participant (LOCAL_STAGING PREPARE, local COMMIT before
 * the marker, marker apply records the outcome without executing operations);
 * green only when Leg A replaces local staging with replicated application.
 * The leader-side duplicate-apply control stays positive on both.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {
  ControllableConsensusPort,
  createControllablePartitionService,
} from './partition-service-test-support.js';

const PARTITION_ID = 'tx-replicated-apply';
const REPLICAS = ['tx-apply-r1', 'tx-apply-r2', 'tx-apply-r3'];
const SESSION = 'tx-apply-session';
const ROW = Object.freeze({id: 'row-1', value: 'value-1'});

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
function stagedInsert() {
  return {type: PARTITION_SERVICE_OPERATION.INSERT, table: 'test_table',
    sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)', params: [ROW.id, ROW.value]};
}
function rowCount(partition) {
  return partition.db.prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
    .get(ROW.id).count;
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

test('TX1 P1: a session commit exposes no rows before its marker is a committed entry',
  async () => {
    const {leader, proposed} = await leaderWithProposals();
    try {
      await leader.beginTransaction(SESSION);
      const staged = await leader.executeTransactionWrite(stagedInsert(), SESSION);
      assert.equal(staged.success, true, `the session write stages: ${JSON.stringify(staged)}`);
      const result = await leader.commitTransaction(SESSION);
      assert.equal(result.success, true, 'the participant acknowledges its commit request');
      const marker = proposed.find((entry) =>
        entry.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT);
      assert.ok(marker, 'the commit proposes a TRANSACTION_COMMIT marker');
      assert.equal(marker?.operations?.length, 1, 'the marker carries the staged operation');
      assert.equal(rowCount(leader), 0,
        'no row is readable before the transaction marker is committed and applied');
      leader.controllablePort.commit(marker);
      assert.equal(rowCount(leader), 1,
        'the committed marker applies the row exactly once on the proposer');
    } finally {
      await leader.shutdown();
    }
  });

test('TX1 P2: the committed TRANSACTION_COMMIT applies its operations on a replica that staged nothing',
  async () => {
    const {leader, proposed} = await leaderWithProposals();
    const follower = createReplica(REPLICAS[1]);
    try {
      await follower.initialize();
      assert.equal(rowCount(follower), 0, 'the follower starts without the row');
      await leader.beginTransaction(SESSION);
      const staged = await leader.executeTransactionWrite(stagedInsert(), SESSION);
      assert.equal(staged.success, true, `the session write stages: ${JSON.stringify(staged)}`);
      await leader.commitTransaction(SESSION);
      const marker = proposed.find((entry) =>
        entry.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT);
      assert.ok(marker, 'the commit proposes a TRANSACTION_COMMIT marker');
      follower.controllablePort.commit(marker);
      assert.equal(rowCount(follower), 1,
        'a committed transaction marker must apply its operations on every replica');
      // Duplicate delivery of the same committed command is idempotent.
      follower.controllablePort.commit(marker);
      assert.equal(rowCount(follower), 1, 'replaying the committed marker applies nothing twice');
    } finally {
      await follower.shutdown();
      await leader.shutdown();
    }
  });
