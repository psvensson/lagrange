/**
 * W7 the group-retired tombstone is bound to the replica INCARNATION (owner
 * decision 2026-10-05, round-5 H5-B: deterministic split workflow ids, child
 * ids reused by a retried split and reused replica indices let an earlier
 * attempt's tombstone answer COMPLETED for a new, non-retired replica of the
 * same name).
 *
 * The incarnation is the stamp the replica's raft-rs lifecycle owner mints
 * when its lifecycle row is born; the tombstone records the stamp of the
 * retired row it was written from.
 *
 * World: group-retirement-as-a-unit-fixture.js - real rs-raft ports, the
 * PRODUCTION ReplicaHandlers (removal, cleanup, startup sweep, create, REMOVE
 * answers), the PRODUCTION split dissolution and the handlers' authoritative
 * read of the world's `tables` record.
 *
 * I1 a live (non-retired) replica beside a leftover tombstone - of an earlier
 *    incarnation, or even its own stamp - never answers COMPLETED (K6b3); the
 *    replica then retires for real and only then answers COMPLETED.
 * I2 a retried attempt of the same workflow id (deterministic split id): a
 *    new incarnation born under the same name never answers from the earlier
 *    attempt's tombstone (K6b2).
 * I3 CREATE of the same (group, replica) drops the tombstone durably before
 *    the new replica is born, and a restart does not resurrect it.
 * I4 a crash between the retirement and the tombstone write: the re-ask
 *    re-writes it from the row's own recorded workflow (never the asking
 *    REMOVE's), and after the database is deleted the restarted member
 *    still answers COMPLETED (K6a).
 * I5 the startup sweep's database delete makes the tombstone durable from
 *    the row's own durable fact before deleting - also when the record has
 *    moved on and no REMOVE will ever ask again (K6a2, the leak) - and the
 *    restarted member answers from it (V6: the guard on the sweep path).
 * I6 an absent `tables` row never releases a tombstone (V8).
 * I7 a tombstone is written only from a retired row (V10).
 * I8 a tombstone without an incarnation is never a proof.
 */
import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {readCanonicalJson, writeAtomicDurable} from
  '../../src/runtime/oci-host-agent-durable-files.js';
import {
  isTombstoneWorkflowCleared,
  listGroupRetiredTombstones,
  readGroupRetiredTombstone,
  writeGroupRetiredTombstone,
} from '../../src/node/group-retired-tombstone-store.js';
import {genesisStampFor} from './replica-handler-bootstrap-stamps.js';
import {
  TABLE_ID,
  driveUntilRemoved,
  nextTurns,
  openGroupWorld,
} from './group-retirement-as-a-unit-fixture.js';
import {
  FENCE,
  TOMBSTONE_DIR,
  WORKFLOW_ID,
  clearedRecord,
  deleteDatabase,
  groupRemove,
  lifecycleRow,
  restart,
  restartUnplaced,
  retireAll,
  retiringRecord,
} from './group-retired-tombstone-world.js';

const COMPLETED = ReplicaOperationResponseStatus.COMPLETED;
const NOT_FOUND = ReplicaOperationResponseStatus.NOT_FOUND;
const SETTLE_TURNS = 200;

function leftoverTombstone(world, replicaId, incarnation) {
  const {handler} = world.sources.get(replicaId);
  return writeGroupRetiredTombstone(handler.dataDir, {
    groupId: world.partitionId, replicaIdentity: replicaId, incarnation,
    lifecycleReason: 'group-retired',
    evidence: {tableId: TABLE_ID, workflowId: WORKFLOW_ID, fenceToken: FENCE,
      kind: 'split-source'}, retiredAt: 1});
}

function tombstoneOf(world, replicaId) {
  return readGroupRetiredTombstone(world.sources.get(replicaId).handler
    .dataDir, world.partitionId, replicaId);
}

// One member retired with its group while another never answers: the
// record keeps retiring the group.
async function retireAllButLast(world) {
  world.dropDeliveryTo.add(world.members.at(-1));
  await retireAll(world);
}

test('I1 a live replica beside a leftover tombstone never answers ' +
  'COMPLETED; it does once it really retired', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'inc-i1', voters: 3});
  const [first, second] = world.members;
  // A retried attempt of the same workflow id retires the group anew.
  world.setTablesRow(retiringRecord(world.partitionId, FENCE + 1));
  const ask = (replicaId) => groupRemove(world, replicaId,
    {fenceToken: FENCE + 1});
  const own = lifecycleRow(world, first);
  t.equal(own.state, 'active', 'setup: the replica is live');
  for (const [label, incarnation] of [
    ['an earlier incarnation\'s', 'an-earlier-incarnation'],
    ['a tombstone carrying its own stamp', own.incarnation ?? 'unstamped']]) {
    leftoverTombstone(world, first, incarnation);
    const answer = await restartUnplaced(world, first)
      .handleRemoveReplica(ask(first));
    t.equal(answer.status, NOT_FOUND,
      `${label} tombstone: the live row is answered, never the tombstone`);
  }
  // A tracked member already REMOVING: its answer is IN_PROGRESS while its
  // row is live, whatever tombstone lies beside it.
  leftoverTombstone(world, second, 'an-earlier-incarnation');
  const {handler} = world.sources.get(second);
  const replica = handler.getLocalReplica(second);
  handler.setLocalReplica(second, {...replica, status: ReplicaStatus.REMOVING});
  const removing = await handler.handleRemoveReplica(ask(second));
  t.equal(removing.status, ReplicaOperationResponseStatus.IN_PROGRESS,
    'a REMOVING live replica is in progress, not COMPLETED');
  t.equal(await driveUntilRemoved(world, [second]), true,
    'its real removal runs to the end');
  const after = await handler.handleRemoveReplica(ask(second));
  t.equal(after.status, COMPLETED, 'after its real retirement: COMPLETED');
  const retired = lifecycleRow(world, second);
  t.ok(retired.incarnation, 'the retired row carries its incarnation');
  t.equal(tombstoneOf(world, second)?.incarnation, retired.incarnation,
    'its tombstone now carries the retired row\'s own incarnation');
});

test('I2 a retried attempt of the same workflow id: a new incarnation of ' +
  'the name never answers from the earlier attempt\'s tombstone',
async (t) => {
  const world = openGroupWorld(t, {partitionId: 'inc-i2', voters: 3});
  const [first] = world.members;
  await retireAllButLast(world);
  const retired = lifecycleRow(world, first);
  deleteDatabase(world, first);
  const handler = restart(world, first);
  world.setTablesRow(retiringRecord(world.partitionId, FENCE + 1));
  await nextTurns();
  t.equal(await handler.sweepGroupRetiredTombstones(), 0,
    'setup: the record names the same workflow id - the tombstone is kept');
  const ask = () => handler.handleRemoveReplica(groupRemove(world, first,
    {fenceToken: FENCE + 1}));
  t.equal((await ask()).status, COMPLETED,
    'no later incarnation on this node: the retired one still answers ' +
    '(the residual: the REMOVE names the replica, not its incarnation)');
  // A new replica of the same name is born on this node (a real port on a
  // fresh database: its lifecycle owner mints a new stamp).
  world.cluster.buildReplica(first, world.members);
  const reborn = lifecycleRow(world, first);
  t.equal(reborn.state, 'active', 'setup: the new incarnation is live');
  t.not(reborn.incarnation, retired.incarnation,
    'and carries a stamp of its own');
  t.equal((await ask()).status, NOT_FOUND,
    'the new incarnation is never answered from the earlier tombstone');
  // The new incarnation's database is deleted (the one delete path): the
  // earlier incarnation's tombstone goes first, so it never outlives the
  // row that blocked it.
  handler.assertGroupRetiredTombstoneBeforeDelete(world.partitionId, first);
  t.equal(tombstoneOf(world, first), null,
    'the delete guard dropped the earlier incarnation\'s tombstone');
  deleteDatabase(world, first);
  t.equal((await ask()).status, NOT_FOUND,
    'and once the new database is gone nothing answers for it');
});

test('I3 CREATE of the same replica drops its tombstone durably before ' +
  'the new replica is born; a restart does not resurrect it', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'inc-i3', voters: 3});
  const [first] = world.members;
  await retireAllButLast(world);
  deleteDatabase(world, first);
  const handler = restart(world, first);
  t.ok(tombstoneOf(world, first), 'setup: the retired member\'s tombstone');
  const births = [];
  handler.createPartitionService = async (options) => {
    births.push({tombstone: readGroupRetiredTombstone(handler.dataDir,
      options.partitionId, options.replicaId)});
    // The new replica's lifecycle row is born on its database.
    world.cluster.buildReplica(first, world.members);
    throw new Error('this world births the row and opens no service');
  };
  const created = await handler.handleCreateReplica({
    [ReplicaOperationField.OPERATION_ID]: 'create-again',
    [ReplicaOperationField.PARTITION_ID]: world.partitionId,
    [ReplicaOperationField.REPLICA_ID]: first,
    [ReplicaOperationField.REPLICA_IDS]: world.members,
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]:
      genesisStampFor(world.members),
    [ReplicaOperationField.BOOTSTRAP_TABLE_METADATA]: {table_id: TABLE_ID,
      table_name: 'tbl', schema: '{}'},
    [ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA]: {
      partition_id: world.partitionId, table_id: TABLE_ID},
  });
  t.not(created.status, ReplicaOperationResponseStatus.ERROR,
    'setup: the CREATE was accepted');
  for (let turn = 0; turn < SETTLE_TURNS && births.length === 0; turn += 1) {
    await nextTurns();
  }
  t.equal(births.length, 1, 'setup: the create reached the birth');
  t.equal(births[0]?.tombstone ?? null, null,
    'the tombstone was gone before the new replica was born');
  t.equal(fs.readdirSync(path.join(handler.dataDir, TOMBSTONE_DIR))
    .length, 0, 'durably: nothing is left in the tombstone directory');
  t.equal(lifecycleRow(world, first)?.state, 'active',
    'setup: the new replica\'s row was born live');
  t.equal(await restart(world, first).provesGroupRetirement(
    groupRemove(world, first)), false,
  'after a restart nothing proves the earlier retirement for it');
  t.equal(tombstoneOf(world, first), null, 'and no tombstone came back');
});

test('I4 a crash before the tombstone write: the re-ask re-writes it from ' +
  'the row\'s own workflow, and the restarted member answers after the ' +
  'database is gone', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'inc-i4', voters: 3});
  const [first] = world.members;
  await retireAllButLast(world);
  const handler = restart(world, first);
  fs.rmSync(path.join(handler.dataDir, TOMBSTONE_DIR),
    {recursive: true, force: true});
  const row = lifecycleRow(world, first);
  t.equal(row.reason, 'group-retired', 'setup: the row is group-retired');
  const answer = await handler.handleRemoveReplica(groupRemove(world, first,
    {workflowId: 'wf-forged'}));
  t.equal(answer.status, COMPLETED, 're-ask COMPLETED from the row');
  const tombstone = tombstoneOf(world, first);
  t.equal(tombstone?.workflowId, WORKFLOW_ID,
    'the tombstone names the workflow the row retired under, not the ' +
    'asking REMOVE\'s');
  t.ok(row.incarnation, 'setup: the row carries its incarnation');
  t.equal(tombstone?.incarnation, row.incarnation,
    'and the row\'s incarnation');
  deleteDatabase(world, first);
  const after = await restart(world, first).handleRemoveReplica(
    groupRemove(world, first));
  t.equal(after.status, COMPLETED,
    'after the database is deleted and the node restarted: COMPLETED');
});

// The member's real database at the handler's own path, read by the
// PRODUCTION lifecycle read (the fixture's redirect to the cluster file is
// removed): the startup sweep finds and deletes exactly that file.
function moveDatabaseToHandlerPath(world, replicaId) {
  const {handler} = world.sources.get(replicaId);
  const dbFile = world.cluster.replica(replicaId).dbFile;
  const dbPath = handler.getPartitionDbPath(world.partitionId, replicaId);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  for (const suffix of ['', '-wal']) {
    if (fs.existsSync(`${dbFile}${suffix}`)) {
      fs.copyFileSync(`${dbFile}${suffix}`, `${dbPath}${suffix}`);
    }
  }
  delete handler.readReplicaDurableLifecycle;
  deleteDatabase(world, replicaId);
  return dbPath;
}

test('I5 the startup sweep makes the tombstone durable from the row before ' +
  'it deletes the database - also once the record moved on', async (t) => {
  for (const recordMoved of [false, true]) {
    const world = openGroupWorld(t, {partitionId: `inc-i5-${recordMoved}`,
      voters: 3});
    const [first] = world.members;
    await retireAllButLast(world);
    const row = lifecycleRow(world, first);
    const handler = restart(world, first);
    const dbPath = moveDatabaseToHandlerPath(world, first);
    // A crash between the retirement and the tombstone write.
    fs.rmSync(path.join(handler.dataDir, TOMBSTONE_DIR),
      {recursive: true, force: true});
    if (recordMoved) {
      world.setTablesRow(clearedRecord());
      await nextTurns();
    }
    const label = recordMoved ? 'record moved on' : 'record retiring';
    const report = await handler.sweepRemovedReplicaCleanupDebt(
      await handler.captureRemovedReplicaCleanupStartupAuthorities());
    t.equal(report.deleted, 1, `${label}: the sweep deleted the database`);
    t.notOk(fs.existsSync(dbPath), `${label}: the database file is gone`);
    const tombstone = tombstoneOf(world, first);
    t.ok(tombstone && row.incarnation, `${label}: its tombstone is durable`);
    t.equal(tombstone?.incarnation, row.incarnation,
      `${label}: of the retired row's incarnation`);
    t.equal(tombstone?.workflowId, WORKFLOW_ID,
      `${label}: naming the workflow the row recorded`);
    const answer = await restart(world, first).handleRemoveReplica(
      groupRemove(world, first));
    t.equal(answer.status, COMPLETED,
      `${label}: the restarted member answers COMPLETED from it`);
    if (recordMoved) {
      t.equal(await handler.sweepGroupRetiredTombstones(), 1,
        'and the cleared record releases it');
    }
  }
});

test('I6 an absent tables row never releases a tombstone', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'inc-i6', voters: 3});
  const [first] = world.members;
  await retireAllButLast(world);
  deleteDatabase(world, first);
  const handler = restart(world, first);
  const tombstone = tombstoneOf(world, first);
  t.ok(tombstone, 'setup: the tombstone exists');
  t.equal(isTombstoneWorkflowCleared(tombstone, {available: true,
    tablesRow: null}), false, 'an absent row proves nothing');
  world.tablesRows.delete(TABLE_ID);
  t.equal(await handler.sweepGroupRetiredTombstones(), 0,
    'the sweep keeps it while the table\'s row is absent');
  t.ok(tombstoneOf(world, first), 'kept');
  t.equal((await handler.handleRemoveReplica(groupRemove(world, first)))
    .status, COMPLETED, 'and the member still answers from it');
});

test('I7 a tombstone is written only from a retired row', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'inc-i7', voters: 3});
  const [first] = world.members;
  const {handler} = world.sources.get(first);
  world.setTablesRow(retiringRecord(world.partitionId));
  const evidence = groupRemove(world, first)[
    ReplicaOperationField.GROUP_RETIREMENT];
  t.equal(handler.recordGroupRetiredTombstone({partitionId: world.partitionId,
    replicaId: first, evidence}), false, 'a live replica gets none');
  handler.assertGroupRetiredTombstoneBeforeDelete(world.partitionId, first);
  t.equal(listGroupRetiredTombstones(handler.dataDir).length, 0,
    'neither the writer nor the delete guard wrote one');
});

test('I8 a tombstone without an incarnation is never a proof', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'inc-i8', voters: 3});
  const [first] = world.members;
  await retireAllButLast(world);
  deleteDatabase(world, first);
  const handler = restart(world, first);
  const directory = path.join(handler.dataDir, TOMBSTONE_DIR);
  const [file] = fs.readdirSync(directory).map((name) =>
    path.join(directory, name));
  // The same durable record, rewritten without its incarnation.
  const {incarnation: _stamp, ...unstamped} = readCanonicalJson(file,
    'TEST_UNREADABLE');
  writeAtomicDurable(file, unstamped);
  t.equal(readGroupRetiredTombstone(handler.dataDir, world.partitionId,
    first), null, 'it does not read as a tombstone');
  t.equal((await handler.handleRemoveReplica(groupRemove(world, first)))
    .status, NOT_FOUND, 'and answers nothing');
  t.throws(() => writeGroupRetiredTombstone(handler.dataDir, {
    groupId: world.partitionId, replicaIdentity: first,
    evidence: {tableId: TABLE_ID, workflowId: WORKFLOW_ID, fenceToken: FENCE,
      kind: 'split-source'}, retiredAt: 1}), /malformed/u,
  'and none can be written');
});
