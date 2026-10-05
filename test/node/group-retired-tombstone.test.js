/**
 * W6 the member-owned `group retired` tombstone (owner ruling 2026-10-05;
 * round-4 H3: a member whose replica database - and the lifecycle row in it
 * - was deleted by its own group-retirement REMOVE, and whose node
 * restarted before the workflow owner recorded its answer, answered
 * NOT_FOUND forever).
 *
 * World: group-retirement-as-a-unit-fixture.js - real rs-raft ports,
 * PRODUCTION ReplicaHandlers (their removal, cleanup and REMOVE answers),
 * the PRODUCTION split dissolution, and the handlers' authoritative read of
 * the world's `tables` record. A node restart drops the handler's tracking
 * of the replica (its in-memory state); the data directory survives.
 *
 * T1 a member retires: its tombstone is durable, its database is deleted;
 *    after a restart the owner's re-ask is COMPLETED from the tombstone - and
 *    again after a second restart.
 * T2 the proof is exact: another workflow, another group (a later group
 *    generation reusing the replica name), another table, or a tombstone of
 *    another peer identity answers NOT_FOUND; an ordinary REMOVE is
 *    unchanged.
 * T3 lifetime: the tombstone is kept while the record still retires the
 *    group (and while the record cannot be read), and released once the
 *    record is cleared; then the re-ask is NOT_FOUND.
 * T4 ordering: a replica whose tombstone cannot be written keeps its
 *    database (the delete is refused) and keeps answering from its lifecycle
 *    row - the tombstone is never written after the delete.
 */
import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {PARTITION_TRANSITION_STATE} from
  '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  listGroupRetiredTombstones,
  readGroupRetiredTombstone,
  tombstoneProvesRetirement,
} from '../../src/node/group-retired-tombstone-store.js';
import {
  TABLE_ID,
  createWorkflowOwner,
  driveUntilRemoved,
  openGroupWorld,
} from './group-retirement-as-a-unit-fixture.js';

const GROUP_RETIRED = 'group-retired';
const WORKFLOW_ID = 'wf-tomb-1';
const FENCE = 3;
const SOURCE_KEY = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;
const TOMBSTONE_DIR = 'group-retired-tombstones';

function retiringRecord(partitionId) {
  return {table_id: TABLE_ID, active_partition_version: 2,
    partition_transition_state:
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    partition_transition_metadata: JSON.stringify({workflowId: WORKFLOW_ID,
      workflowFenceToken: FENCE, targetPartitionVersion: 2,
      sourcePartitionId: partitionId,
      targetPartitionIds: [`${partitionId}-l`, `${partitionId}-r`],
      participants: {[SOURCE_KEY]: {participantKey: SOURCE_KEY,
        status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED, fenceToken: FENCE}}})};
}

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

// A node restart: the handler's in-memory tracking of the replica is gone;
// its data directory (and whatever is durable in it) survives.
function restart(world, replicaId) {
  const {handler} = world.sources.get(replicaId);
  handler.localReplicas.delete(replicaId);
  handler.localServices.delete(replicaId);
  return handler;
}

// The member's replica database deleted (in this world the replica's
// database is the cluster's own file, where its lifecycle row lives; the
// production removal deletes the handler's path): the lifecycle row is gone.
function deleteDatabase(world, replicaId) {
  const dbFile = world.cluster.replica(replicaId).dbFile;
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbFile}${suffix}`, {force: true});
  }
}

test('T1 a retired member answers COMPLETED from its tombstone after its ' +
  'database is gone and its node restarted (twice)', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'tomb-t1', voters: 3});
  const [first] = world.members;
  t.equal(await retireAll(world), true, 'setup: every member retired');
  const {handler} = world.sources.get(first);
  const tombstone = readGroupRetiredTombstone(handler.dataDir,
    world.partitionId, first);
  t.ok(tombstone, 'the tombstone is durable');
  t.equal(tombstone?.workflowId, WORKFLOW_ID, 'naming the workflow');
  t.equal(tombstone?.fenceToken, FENCE, 'the fence it retired under');
  t.equal(tombstone?.tableId, TABLE_ID, 'and the table');
  deleteDatabase(world, first);
  t.equal(handler.isReplicaDurablyGroupRetired(world.partitionId, first),
    false, 'setup: its database (and lifecycle row) is gone');
  for (const round of ['first', 'second']) {
    const answer = await restart(world, first)
      .handleRemoveReplica(groupRemove(world, first));
    t.equal(answer.status, ReplicaOperationResponseStatus.COMPLETED,
      `after the ${round} restart the re-ask is COMPLETED`);
    t.equal(answer.durablyRetired, true, 'from the durable proof');
  }
});

test('T2 the proof is exact: another workflow, group, table or peer ' +
  'identity answers NOT_FOUND', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'tomb-t2', voters: 3});
  const [first, second] = world.members;
  t.equal(await retireAll(world), true, 'setup: every member retired');
  deleteDatabase(world, first);
  const handler = restart(world, first);
  const notFound = ReplicaOperationResponseStatus.NOT_FOUND;
  t.equal((await handler.handleRemoveReplica(groupRemove(world, first,
    {workflowId: 'wf-other'}))).status, notFound, 'another workflow');
  t.equal((await handler.handleRemoveReplica(groupRemove(world, first,
    {workflowId: 'wf-next-generation'}, 'tomb-t2-next'))).status, notFound,
  'the same replica name in a later group generation');
  t.equal((await handler.handleRemoveReplica(groupRemove(world, first,
    {tableId: 'tbl-other'}))).status, notFound, 'another table');
  const ordinary = groupRemove(world, second);
  delete ordinary[ReplicaOperationField.GROUP_RETIREMENT];
  t.equal((await restart(world, second).handleRemoveReplica(ordinary))
    .status, notFound, 'an ordinary REMOVE is unchanged (NOT_FOUND)');
  const tombstone = readGroupRetiredTombstone(handler.dataDir,
    world.partitionId, first);
  const request = {partitionId: world.partitionId, replicaId: first,
    evidence: {tableId: TABLE_ID, workflowId: WORKFLOW_ID}};
  t.equal(tombstoneProvesRetirement(tombstone, request), true,
    'control: the exact request is proved');
  t.equal(tombstoneProvesRetirement({...tombstone, peerId: '1'}, request),
    false, 'a tombstone of another peer identity proves nothing');
  t.equal(tombstoneProvesRetirement(tombstone, {...request,
    replicaId: second}), false, 'nor for another replica');
});

test('T3 the tombstone is kept until the record is cleared, then released',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'tomb-t3', voters: 3});
    const [first, , last] = world.members;
    // One member never answers: the workflow cannot complete, its record
    // keeps retiring the group.
    world.dropDeliveryTo.add(last);
    await retireAll(world);
    deleteDatabase(world, first);
    const handler = restart(world, first);
    t.ok(readGroupRetiredTombstone(handler.dataDir, world.partitionId, first),
      'setup: the retired member\'s tombstone exists');
    t.equal(await handler.sweepGroupRetiredTombstones(), 0,
      'kept while the record still retires the group');
    const realGateway = handler.getControlPlaneSystemTableGateway;
    handler.getControlPlaneSystemTableGateway = () => ({});
    t.equal(await handler.sweepGroupRetiredTombstones(), 0,
      'kept while the record cannot be read');
    handler.getControlPlaneSystemTableGateway = realGateway;
    t.equal((await handler.handleRemoveReplica(groupRemove(world, first)))
      .status, ReplicaOperationResponseStatus.COMPLETED,
    'the re-ask is COMPLETED while it is kept');
    world.setTablesRow({table_id: TABLE_ID, active_partition_version: 2,
      partition_transition_state: null, partition_transition_metadata: null});
    t.equal(await handler.sweepGroupRetiredTombstones(), 1,
      'released once the record is cleared');
    t.equal(readGroupRetiredTombstone(handler.dataDir, world.partitionId,
      first), null, 'gone');
    t.equal((await handler.handleRemoveReplica(groupRemove(world, first)))
      .status, ReplicaOperationResponseStatus.NOT_FOUND,
    'after release the re-ask is NOT_FOUND (the workflow is complete)');
  });

test('T4 a tombstone that cannot be written keeps the database: never ' +
  'written after the delete', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'tomb-t4', voters: 3});
  const [first, , last] = world.members;
  const {handler} = world.sources.get(first);
  // One member never answers: the record keeps retiring the group.
  world.dropDeliveryTo.add(last);
  // The tombstone directory's place is taken: every write fails.
  fs.writeFileSync(path.join(handler.dataDir, TOMBSTONE_DIR), 'blocked');
  await retireAll(world);
  t.equal(listGroupRetiredTombstones(handler.dataDir).length, 0,
    'setup: no tombstone could be written');
  t.equal(handler.isReplicaDurablyGroupRetired(world.partitionId, first),
    true, 'setup: its lifecycle row reads group-retired');
  t.throws(() => handler.assertGroupRetiredTombstoneBeforeDelete(
    world.partitionId, first), /no durable tombstone/u,
  'the database delete (the one delete path) is refused');
  const answer = await restart(world, first)
    .handleRemoveReplica(groupRemove(world, first));
  t.equal(answer.status, ReplicaOperationResponseStatus.COMPLETED,
    'the member still answers from its lifecycle row');
  fs.rmSync(path.join(handler.dataDir, TOMBSTONE_DIR), {force: true});
});
