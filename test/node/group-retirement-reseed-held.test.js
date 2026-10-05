/**
 * W8 a reseed-held member of a retiring group (owner decision 2026-10-05:
 * "count a durable 'retired' row of any reason as the member's own proof" -
 * a replica held for a reseed never acts for the group again, and that is
 * its own durable fact, not absence).
 *
 * The hold is the member's raft-rs lifecycle row retired with the reason
 * `reseed-required`, written by the PRODUCTION lifecycle owner
 * (raftRsLifecycleAdministration.retireReplica on the member's own port).
 *
 * World: group-retirement-as-a-unit-fixture.js - real rs-raft ports, the
 * PRODUCTION ReplicaHandlers and the handlers' authoritative read of the
 * world's `tables` record.
 *
 * R1 a reseed-held member answers a verified group-retirement REMOVE
 *    COMPLETED and gets its tombstone (of its row's incarnation); after its
 *    database is deleted and its node restarted it still answers COMPLETED;
 *    a later retire() never overwrites the reseed reason.
 * R2 an ordinary REMOVE, and a group-retirement REMOVE whose evidence does
 *    not verify (the record moved on, or is unreadable), are unchanged:
 *    NOT_FOUND, and no tombstone.
 * R3 a reseed hold beside an existing tombstone: the tombstone of its own
 *    incarnation answers (also when the record cannot be read); one of
 *    another incarnation never does.
 * R4 a tracked reseed-held member retired by the PRODUCTION dissolution:
 *    its removal writes the tombstone from its held row (the reason kept)
 *    and the restarted member answers from it once its database is gone.
 * R5 (round 7, P5) the held member's proof re-reads its row AFTER the
 *    verification await: when the reseed deleted the database and the same
 *    identity was born again (a new incarnation, live) during that await,
 *    the REMOVE is not answered COMPLETED and no tombstone of the old
 *    incarnation is written.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {
  listGroupRetiredTombstones,
  readGroupRetiredTombstone,
  writeGroupRetiredTombstone,
} from '../../src/node/group-retired-tombstone-store.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {openGroupWorld} from './group-retirement-as-a-unit-fixture.js';
import {
  GROUP_RETIRED,
  RESEED_REQUIRED,
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
} from './group-retired-tombstone-world.js';

const COMPLETED = ReplicaOperationResponseStatus.COMPLETED;
const NOT_FOUND = ReplicaOperationResponseStatus.NOT_FOUND;

// A group whose record retires it, one member of which is held for a
// reseed (its own lifecycle row retired reseed-required) and untracked (its
// node restarted; its services row no longer names it).
async function openHeldWorld(t, partitionId) {
  const world = openGroupWorld(t, {partitionId, voters: 3});
  const held = world.members.at(-1);
  world.setTablesRow(retiringRecord(partitionId));
  const outcome = await world.cluster.retireReplica(held, RESEED_REQUIRED);
  t.equal(outcome.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'setup: the member is held for a reseed');
  return {world, held, handler: restartUnplaced(world, held)};
}

function tombstoneOf(world, replicaId) {
  return readGroupRetiredTombstone(world.sources.get(replicaId).handler
    .dataDir, world.partitionId, replicaId);
}

test('R1 a reseed-held member answers a verified group retirement ' +
  'COMPLETED, durably, and keeps its reason', async (t) => {
  const {world, held, handler} = await openHeldWorld(t, 'held-r1');
  const row = lifecycleRow(world, held);
  t.equal(row.reason, RESEED_REQUIRED, 'setup: its row reads the hold');
  t.ok(row.incarnation, 'setup: and carries its incarnation');
  const answer = await handler.handleRemoveReplica(groupRemove(world, held));
  t.equal(answer.status, COMPLETED, 'the group retirement completes for it');
  t.equal(answer.durablyRetired, true, 'from its own durable proof');
  const tombstone = tombstoneOf(world, held);
  t.equal(tombstone?.incarnation, row.incarnation,
    'its tombstone carries the held row\'s incarnation');
  t.equal(tombstone?.workflowId, WORKFLOW_ID, 'and the verified workflow');
  t.equal(tombstone?.lifecycleReason, RESEED_REQUIRED,
    'and the row\'s own reason');
  const again = await world.cluster.retireReplica(held, GROUP_RETIRED);
  t.equal(again.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    'a later retirement is refused');
  t.equal(lifecycleRow(world, held).reason, RESEED_REQUIRED,
    'and never overwrites the reseed reason');
  deleteDatabase(world, held);
  const after = await restart(world, held).handleRemoveReplica(
    groupRemove(world, held));
  t.equal(after.status, COMPLETED,
    'after its database is deleted and its node restarted: COMPLETED');
});

test('R2 an ordinary REMOVE and an unverified group retirement are ' +
  'unchanged for a reseed-held member', async (t) => {
  const {world, held, handler} = await openHeldWorld(t, 'held-r2');
  t.equal((await handler.handleRemoveReplica(ordinaryRemove(world, held)))
    .status, NOT_FOUND, 'an ordinary REMOVE answers NOT_FOUND');
  t.equal((await handler.handleRemoveReplica(groupRemove(world, held,
    {workflowId: 'wf-other'}))).status, NOT_FOUND,
  'evidence of another workflow does not verify: NOT_FOUND');
  world.authoritativeTablesReadAvailable = false;
  t.equal((await handler.handleRemoveReplica(groupRemove(world, held)))
    .status, NOT_FOUND, 'an unreadable record verifies nothing: NOT_FOUND');
  world.authoritativeTablesReadAvailable = true;
  world.setTablesRow(clearedRecord());
  t.equal((await handler.handleRemoveReplica(groupRemove(world, held)))
    .status, NOT_FOUND, 'a record that moved on verifies nothing: NOT_FOUND');
  t.equal(listGroupRetiredTombstones(handler.dataDir).length, 0,
    'and none of them wrote a tombstone');
});

test('R3 a reseed hold beside an existing tombstone answers only from its ' +
  'own incarnation\'s', async (t) => {
  const {world, held, handler} = await openHeldWorld(t, 'held-r3');
  t.equal((await handler.handleRemoveReplica(groupRemove(world, held)))
    .status, COMPLETED, 'setup: the verified group retirement completed');
  world.authoritativeTablesReadAvailable = false;
  t.equal((await handler.handleRemoveReplica(groupRemove(world, held)))
    .status, COMPLETED,
  'its own tombstone answers while the record cannot be read');
  const tombstone = tombstoneOf(world, held);
  writeGroupRetiredTombstone(handler.dataDir, {groupId: world.partitionId,
    replicaIdentity: held, incarnation: 'another-incarnation',
    lifecycleReason: GROUP_RETIRED, evidence: tombstone, retiredAt: 1});
  t.equal((await handler.handleRemoveReplica(groupRemove(world, held)))
    .status, NOT_FOUND,
  'a tombstone of another incarnation beside the held row answers nothing');
});

test('R4 a tracked reseed-held member retired by the dissolution keeps its ' +
  'reason and answers from its tombstone', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'held-r4', voters: 3});
  const held = world.members.at(-1);
  const outcome = await world.cluster.retireReplica(held, RESEED_REQUIRED);
  t.equal(outcome.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'setup: the member is held for a reseed');
  t.equal(await retireAll(world), true,
    'every member, the held one included, completed its removal');
  const row = lifecycleRow(world, held);
  t.equal(row.reason, RESEED_REQUIRED, 'the hold\'s reason is kept');
  t.ok(row.incarnation, 'its row carries its incarnation');
  t.equal(tombstoneOf(world, held)?.incarnation, row.incarnation,
    'its tombstone carries the held row\'s incarnation');
  deleteDatabase(world, held);
  const after = await restart(world, held).handleRemoveReplica(
    groupRemove(world, held));
  t.equal(after.status, COMPLETED,
    'after its database is deleted and its node restarted: COMPLETED');
});

test('R5 the held member\'s proof is taken from its row after the ' +
  'verification await, never from the read before it', async (t) => {
  const {world, held, handler} = await openHeldWorld(t, 'held-r5');
  const heldRow = lifecycleRow(world, held);
  const gateway = handler.controlPlaneSystemTableGateway;
  const read = gateway.readAuthoritativeRows;
  let reseeded = false;
  gateway.readAuthoritativeRows = async (...args) => {
    if (!reseeded && args[0] === 'tables') {
      reseeded = true;
      // The reseed during the await: the database deleted, the same
      // identity born again (a new incarnation, live).
      deleteDatabase(world, held);
      world.cluster.buildReplica(held, world.members);
    }
    return read(...args);
  };
  const answer = await handler.handleRemoveReplica(groupRemove(world, held));
  t.ok(reseeded, 'setup: the reseed ran during the verification await');
  const reborn = lifecycleRow(world, held);
  t.not(reborn?.incarnation, heldRow.incarnation,
    'setup: a new incarnation was born');
  t.not(answer.status, COMPLETED,
    'the live new incarnation is not answered COMPLETED');
  t.notOk(tombstoneOf(world, held)?.incarnation === heldRow.incarnation,
    'no tombstone of the old incarnation was written after the await');
});
