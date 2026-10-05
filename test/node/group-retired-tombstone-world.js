/**
 * Shared shape of the group-retired tombstone witnesses
 * (group-retired-tombstone*.test.js, group-retirement-reseed-held.test.js):
 * the retiring split record of one group, the production dissolution that
 * retires every member, a group-retirement REMOVE as the workflow owner
 * sends it, and the two durable events a member node lives through - a
 * restart (its in-memory tracking gone, its data directory kept) and the
 * deletion of its replica database (the lifecycle row in it gone).
 *
 * World: group-retirement-as-a-unit-fixture.js (real rs-raft ports,
 * PRODUCTION ReplicaHandlers, the PRODUCTION split dissolution, the
 * handlers' authoritative read of the world's `tables` record).
 */
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {PARTITION_TRANSITION_STATE} from
  '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {
  TABLE_ID,
  createWorkflowOwner,
  driveUntilRemoved,
} from './group-retirement-as-a-unit-fixture.js';

const GROUP_RETIRED = 'group-retired';
const RESEED_REQUIRED = 'reseed-required';
const WORKFLOW_ID = 'wf-tomb-1';
const FENCE = 3;
const SOURCE_KEY = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;
const TOMBSTONE_DIR = 'group-retired-tombstones';

/**
 * The table's record while a split of `partitionId` retires it as a unit.
 * @param {string} partitionId
 * @param {number} [fence]
 * @return {Object} The `tables` row.
 */
function retiringRecord(partitionId, fence = FENCE) {
  return {table_id: TABLE_ID, active_partition_version: 2,
    partition_transition_state:
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    partition_transition_metadata: JSON.stringify({workflowId: WORKFLOW_ID,
      workflowFenceToken: fence, targetPartitionVersion: 2,
      sourcePartitionId: partitionId,
      targetPartitionIds: [`${partitionId}-l`, `${partitionId}-r`],
      participants: {[SOURCE_KEY]: {participantKey: SOURCE_KEY,
        status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED, fenceToken: fence}}})};
}

/** @return {Object} The table's record once the workflow cleared it. */
function clearedRecord() {
  return {table_id: TABLE_ID, active_partition_version: 2,
    partition_transition_state: null, partition_transition_metadata: null};
}

/**
 * Retire the whole group through the PRODUCTION dissolution.
 * @param {Object} world
 * @return {Promise<boolean>} Whether every member completed its removal.
 */
async function retireAll(world) {
  const record = retiringRecord(world.partitionId);
  world.setTablesRow(record);
  const owner = await createWorkflowOwner(world, {family: 'split', workflow: {
    workflowId: WORKFLOW_ID, fenceToken: FENCE, tableId: TABLE_ID,
    partitionId: world.partitionId,
    status: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    metadata: JSON.parse(record.partition_transition_metadata),
    participants: [{participantKey: SOURCE_KEY,
      status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED}]}});
  await owner.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  return driveUntilRemoved(world, world.members);
}

/**
 * A group-retirement REMOVE as the workflow owner sends it.
 * @param {Object} world
 * @param {string} replicaId
 * @param {Object} [evidence] - Evidence fields to override.
 * @param {string|null} [partitionId]
 * @return {Object} REMOVE_REPLICA request.
 */
function groupRemove(world, replicaId, evidence = {}, partitionId = null) {
  return {
    [ReplicaOperationField.TYPE]: 'REMOVE_REPLICA',
    [ReplicaOperationField.OPERATION_ID]: `${WORKFLOW_ID}:dissolve:` +
      replicaId,
    [ReplicaOperationField.OPERATION_TYPE]: 'REMOVE',
    [ReplicaOperationField.PARTITION_ID]: partitionId ?? world.partitionId,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
    [ReplicaOperationField.REASON]: 'split_source_dissolution',
    [ReplicaOperationField.GROUP_RETIREMENT]: {reason: GROUP_RETIRED,
      kind: 'split-source', workflowId: WORKFLOW_ID, fenceToken: FENCE,
      tableId: TABLE_ID, ...evidence},
  };
}

/**
 * The same REMOVE without group-retirement evidence (an ordinary REMOVE).
 * @param {Object} world
 * @param {string} replicaId
 * @return {Object} REMOVE_REPLICA request.
 */
function ordinaryRemove(world, replicaId) {
  const request = groupRemove(world, replicaId);
  delete request[ReplicaOperationField.GROUP_RETIREMENT];
  return request;
}

/**
 * A node restart: the handler's in-memory tracking of the replica is gone;
 * its data directory (and whatever is durable in it) survives.
 * @param {Object} world
 * @param {string} replicaId
 * @return {Object} The member's handler.
 */
function restart(world, replicaId) {
  const {handler} = world.sources.get(replicaId);
  handler.localReplicas.delete(replicaId);
  handler.localServices.delete(replicaId);
  return handler;
}

/**
 * A restart of a node whose services row for the replica no longer names it
 * (the placement moved): the node tracks the replica nowhere, while its
 * replica database - and the lifecycle row in it - stays. The row is merged
 * in place (no row-driven reconcile runs on it).
 * @param {Object} world
 * @param {string} replicaId
 * @return {Object} The member's handler.
 */
function restartUnplaced(world, replicaId) {
  world.cache.merge('services', replicaId, {node_id: 'another-node'});
  return restart(world, replicaId);
}

/**
 * The member's replica database deleted (in this world the replica's
 * database is the cluster's own file, where its lifecycle row lives; the
 * production removal deletes the handler's path): the lifecycle row is gone.
 * @param {Object} world
 * @param {string} replicaId
 * @return {void}
 */
function deleteDatabase(world, replicaId) {
  const dbFile = world.cluster.replica(replicaId).dbFile;
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbFile}${suffix}`, {force: true});
  }
}

/**
 * The member's durable lifecycle row, read straight from its database.
 * @param {Object} world
 * @param {string} replicaId
 * @return {Object|null} {state, reason, incarnation} or null.
 */
function lifecycleRow(world, replicaId) {
  const db = new Database(world.cluster.replica(replicaId).dbFile,
    {readonly: true});
  try {
    return db.prepare('SELECT * FROM _raft_rs_replica_lifecycle ' +
      'WHERE group_id = ? AND replica_identity = ?')
      .get(world.partitionId, replicaId) ?? null;
  } finally {
    db.close();
  }
}

export {
  FENCE,
  GROUP_RETIRED,
  RESEED_REQUIRED,
  TOMBSTONE_DIR,
  WORKFLOW_ID,
  clearedRecord,
  deleteDatabase,
  groupRemove,
  lifecycleRow,
  ordinaryRemove,
  restart,
  restartUnplaced,
  retireAll,
  retiringRecord,
};
