/**
 * Fail-closed witnesses of group retirement as a unit (owner ruling
 * 2026-10-04: absence, timeout, row deletion, eviction or NOT_FOUND is never
 * proof a replica is gone), split from group-retirement-liveness.test.js so
 * each file stays within its runner's bound on a slow host.
 *
 * H-A evidence naming another table's valid record is refused typed.
 * H-B a null target epoch is a malformed record, never epoch 0.
 * F4  the cleanup tombstone row proposes no RemoveNode.
 * F5  NOT_FOUND is not an acknowledgement.
 * B1  a deleted services row never completes the step.
 * B2  a resume against an empty services view sends nothing (drained to its
 *     state in bounded rounds); B2b an unreadable configuration; B2c a
 *     partial view.
 * B4  an answer whose durable record failed is not progress.
 * B5  an owner whose fence is older than the participant record's records
 *     and sends nothing.
 *
 * Same world as group-retirement-liveness.test.js
 * (group-retirement-liveness-world.js).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  TABLE_ID,
  driveUntilRemoved,
  openGroupWorld,
  readyNodeRow,
} from './group-retirement-as-a-unit-fixture.js';
import {
  drainUntil,
  drive,
  FENCE,
  GROUP_RETIRED,
  install,
  logsOf,
  openOwner,
  recordState,
  retired,
  settle,
  SOURCE_KEY,
  WORKFLOW_ID,
} from './group-retirement-liveness-world.js';

test('H-A evidence pointing at another table\'s valid record is refused',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-ha', voters: 1});
    const [member] = world.members;
    const shape = install(world);
    // The same valid record, stored under another table's id.
    world.setTablesRow({...world.tablesRows.get(TABLE_ID),
      table_id: 'other-table'});
    const answer = await world.sources.get(member).handler
      .handleRemoveReplica({type: 'REMOVE_REPLICA',
        operationId: `${WORKFLOW_ID}:dissolve:${member}`,
        operationType: 'REMOVE', partitionId: world.partitionId,
        replicaId: member, reason: 'split_source_dissolution',
        groupRetirement: {reason: GROUP_RETIRED, kind: 'split-source',
          workflowId: WORKFLOW_ID, fenceToken: FENCE,
          tableId: 'other-table'}});
    t.equal(answer.groupRetirementRefusal, 'group-retirement-table-mismatch',
      'refused typed: not this replica\'s table');
    t.same(world.exitsOf(member), [], 'nothing retired');
    t.ok(shape, 'setup');
  });

test('H-B a null target epoch is a malformed record, never epoch 0',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-hb', voters: 1});
    const [member] = world.members;
    install(world, {aborted: true, targetVersion: null});
    const answer = await world.sources.get(member).handler
      .handleRemoveReplica({type: 'REMOVE_REPLICA',
        operationId: `${WORKFLOW_ID}:dissolve:${member}`,
        operationType: 'REMOVE', partitionId: world.partitionId,
        replicaId: member, reason: 'split_aborted_child_teardown',
        groupRetirement: {reason: GROUP_RETIRED,
          kind: 'split-aborted-child', workflowId: WORKFLOW_ID,
          fenceToken: FENCE, tableId: TABLE_ID}});
    t.equal(answer.groupRetirementRefusal,
      'group-retirement-record-malformed', 'refused typed: malformed');
    t.same(world.exitsOf(member), [], 'nothing retired');
  });

test('F4 the cleanup tombstone row (any reason) proposes no RemoveNode',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-f4', voters: 3});
    const [, member] = world.members;
    const tombstone = {...world.cache.get('services', member),
      service_type: 'partition_cleanup', status: 'cleanup_owned',
      trigger_reason: 'durable_remove_cleanup_complete'};
    world.cache.upsert('services', tombstone);
    world.cache.delete('services', member);
    await settle(world, 3);
    t.same(world.proposals, [],
      'neither its write nor its delete reaches the row-driven reconcile');
  });

test('F5 NOT_FOUND is not an acknowledgement', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-f5', voters: 3});
  const [, early] = world.members;
  const shape = install(world);
  const owner = await openOwner(world, shape);
  // The member's node answers before its replica is registered.
  const deliver = owner.deliverReplicaRemoval;
  let answeredNotFound = false;
  owner.deliverReplicaRemoval = async (request) => {
    if (!answeredNotFound && request.nodeId === `${early}-node`) {
      answeredNotFound = true;
      return {status: 'not_found'};
    }
    return deliver(request);
  };
  await drive(owner, shape);
  t.equal(await driveUntilRemoved(world, world.members), true,
    'every member completed its removal');
  t.equal(answeredNotFound, true, 'setup: one NOT_FOUND answer');
  t.ok(retired(world, early),
    'the member that answered NOT_FOUND was re-driven and retired');
  t.same(world.partitionRowDeletes, [world.partitionId],
    'the partition row was deleted only after its real acknowledgement');
});

// B1 (P3a): a member that never answered; its services row is deleted (any
// deleter). The step never completes on it; when the member itself comes
// back (a restart: the open-time safety net retires it on the still-retiring
// record) its own answer completes the step.
test('B1 a deleted services row never completes the step; the member\'s ' +
  'own answer does', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b1', voters: 3});
  const [first, away, gone] = world.members;
  const shape = install(world);
  const owner = await openOwner(world, shape);
  world.dropDeliveryTo.add(gone);
  await drive(owner, shape);
  await settle(world);
  await driveUntilRemoved(world, [first, away], 30);
  const row = world.cache.get('services', gone);
  world.cache.delete('services', gone);
  world.emitSystemRow('services', 'DELETE', row);
  await settle(world, 5);
  await driveUntilRemoved(world, [first, away], 30);
  t.same(world.terminals, [], 'no completion');
  t.equal(recordState(world), shape.state, 'the record stays retiring');
  t.notOk(world.partitionRowDeletes.includes(world.partitionId),
    'the partition row is kept');
  t.same(world.exitsOf(gone), [], 'gone never retired');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.unacknowledgedReplicaIds), [[gone]], 'gone stays listed');
  // gone restarts: the safety net reads the still-retiring record.
  const {handler, service} = world.sources.get(gone);
  handler.localReplicas.delete(gone);
  handler.localServices.delete(gone);
  handler.registerExistingReplica({replicaId: gone,
    partitionId: world.partitionId, service});
  t.equal(await driveUntilRemoved(world, [gone]), true,
    'the safety net retired gone');
  t.ok(retired(world, gone), 'as group-retired');
  t.same(world.terminals, [], 'its self-retirement is not the owner\'s ' +
    'answer yet');
  // Its node is ready again: the owner asks it (at its recorded address)
  // and the member answers its own completed removal.
  world.dropDeliveryTo.delete(gone);
  world.emitNodeRow(readyNodeRow(`${gone}-node`));
  await settle(world, 5);
  t.same(world.terminals, [WORKFLOW_ID],
    'completed on gone\'s own answer, after every frozen member answered');
  t.same(world.partitionRowDeletes, [world.partitionId],
    'the partition row was deleted once, then');
});

// B2 (P3b): the owner resumes while its services view is not hydrated.
test('B2 a resume against an empty services view sends nothing and ' +
  'completes nothing; the view\'s hydration re-runs it', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b2', voters: 3,
    reconcile: false});
  const shape = install(world);
  const rows = world.members.map((id) => world.cache.get('services', id));
  for (const id of world.members) world.cache.delete('services', id);
  const owner = await openOwner(world, shape, {resume: true,
    recover: true});
  const frozenOnRecord = () => JSON.parse(world.tablesRows.get(TABLE_ID)
    .partition_transition_metadata).participants[SOURCE_KEY]
    .checkpoint?.requiredReplicaIds;
  t.ok(await drainUntil(world, () => Array.isArray(frozenOnRecord()) &&
    owner.groupRetirementRedrive.unacknowledged().length > 0),
  'the resume froze the set and listed the members');
  t.equal(world.deliveries.length, 0, 'no REMOVE without an address');
  t.same(world.terminals, [], 'no completion');
  t.same(world.partitionRowDeletes, [], 'the partition row is kept');
  t.equal(recordState(world), shape.state, 'the record stays retiring');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    [...entry.unacknowledgedReplicaIds].sort()), [[...world.members].sort()],
  'every frozen member is listed, none dropped as "no members"');
  t.same(frozenOnRecord(), [...world.members].sort(),
    'the committed configuration is frozen on the durable record');
  for (const row of rows) {
    world.cache.upsert('services', row);
    world.emitSystemRow('services', 'INSERT', row);
  }
  t.equal(await driveUntilRemoved(world, world.members), true,
    'the hydrated rows re-ran it and every member retired');
  t.same(world.terminals, [WORKFLOW_ID], 'it completed only then');
});

test('B2b an unreadable committed configuration is membership-unavailable, ' +
  'never "no members"; the group\'s row change re-runs it', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b2b', voters: 3});
  const shape = install(world);
  world.membershipReadAvailable = false;
  const owner = await openOwner(world, shape, {resume: true,
    recover: true});
  t.ok(await drainUntil(world, () =>
    owner.groupRetirementRedrive.unacknowledged().length > 0),
  'the resume ran and listed the group');
  t.equal(world.deliveries.length, 0, 'nothing sent');
  t.same(world.terminals, [], 'no completion');
  t.same(world.partitionRowDeletes, [], 'the partition row is kept');
  t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.membershipUnavailable), [true], 'listed: membership unavailable');
  world.membershipReadAvailable = true;
  world.emitSystemRow('partitions', 'UPDATE',
    {partition_id: world.partitionId});
  t.equal(await driveUntilRemoved(world, world.members), true,
    'the row change re-ran it and every member retired');
  t.same(world.terminals, [WORKFLOW_ID], 'it completed only then');
});

test('B2c a partial services view: the member with no row stays required',
  async (t) => {
    const world = openGroupWorld(t, {partitionId: 'live-b2c', voters: 3});
    const [, , missing] = world.members;
    const shape = install(world);
    const row = world.cache.get('services', missing);
    world.cache.delete('services', missing);
    const owner = await openOwner(world, shape);
    await drive(owner, shape);
    await driveUntilRemoved(world, world.members.slice(0, 2));
    await settle(world, 5);
    t.same(world.terminals, [], 'no completion on the two listed rows');
    t.same(owner.groupRetirementRedrive.unacknowledged().map((entry) =>
      entry.unacknowledgedReplicaIds), [[missing]],
    'the member missing from the view is listed');
    world.cache.upsert('services', row);
    world.emitSystemRow('services', 'INSERT', row);
    t.equal(await driveUntilRemoved(world, [missing]), true,
      'its row re-ran it');
    t.same(world.terminals, [WORKFLOW_ID], 'completed after it answered');
  });

// The answered ids a record write carries for the source participant.
function answeredOf(data) {
  return data?.partition_transition_metadata ?
    JSON.parse(data.partition_transition_metadata).participants?.[SOURCE_KEY]
      ?.checkpoint?.dissolvedReplicaIds ?? [] : [];
}

test('B4 an answer whose durable record failed is not progress: the member ' +
  'stays listed and is asked again', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b4', voters: 3});
  const shape = install(world);
  const owner = await openOwner(world, shape);
  const dissolved = () => JSON.parse(world.tablesRows.get(TABLE_ID)
    .partition_transition_metadata).participants[SOURCE_KEY]
    .checkpoint?.dissolvedReplicaIds ?? [];
  // The record write recording the LAST member's answer fails - every
  // attempt of that change (its submission fails; the store's bounded
  // retries all fail), so it is UNCONFIRMED: nothing is decided.
  let unrecorded = null;
  let atFailure = null;
  const gateway = world.recordGateway;
  const update = gateway.updateSystemTableRow.bind(gateway);
  // Every attempt the store makes of that one change fails (its bounded
  // compare-and-swap attempts), then the world heals.
  const ATTEMPTS = 3;
  let failures = 0;
  const fails = (answered) => failures < ATTEMPTS &&
    answered.length === world.members.length &&
    (unrecorded === null || answered.at(-1) === unrecorded);
  const observe = () => {
    atFailure.inMemory = (owner.resolveWorkflowState(WORKFLOW_ID)
      ?.participants.get(SOURCE_KEY)?.checkpoint?.dissolvedReplicaIds ??
      []).includes(unrecorded);
  };
  gateway.updateSystemTableRow = async (tableName, where, data, options) => {
    const answered = answeredOf(data);
    if (!fails(answered)) {
      return update(tableName, where, data, options);
    }
    unrecorded = answered.at(-1);
    atFailure ??= {onRecord: dissolved().includes(unrecorded),
      terminals: [...world.terminals],
      asked: world.deliveries.filter((d) => d.replicaId === unrecorded)
        .length};
    failures += 1;
    if (failures === ATTEMPTS) {
      // Observed once the change settled unconfirmed.
      setImmediate(observe);
    }
    throw new Error('tables write failed');
  };
  await drive(owner, shape);
  t.equal(await driveUntilRemoved(world, world.members), true,
    'every member retired');
  await settle(world, 5);
  t.ok(unrecorded && atFailure, 'setup: one answer\'s record write failed');
  t.equal(atFailure?.onRecord, false, 'it is not on the record');
  t.equal(atFailure?.inMemory, false, 'nor in memory');
  t.same(atFailure?.terminals, [], 'no completion');
  // A spent event stream leaves the bounded fallback to ask again.
  for (let run = 0; run < 3 && world.terminals.length === 0; run += 1) {
    world.scheduler.fireAll();
    await settle(world, 5);
  }
  t.same(world.terminals, [WORKFLOW_ID],
    'completed once every answer was recorded');
  t.ok(world.deliveries.filter((d) => d.replicaId === unrecorded).length >
    atFailure?.asked, 'the member whose answer was not recorded was asked ' +
    'again');
});

test('B5 an owner whose fence is older than the participant record\'s ' +
  'records nothing and sends nothing', async (t) => {
  const world = openGroupWorld(t, {partitionId: 'live-b5', voters: 3});
  const shape = install(world);
  const owner = await openOwner(world, shape);
  // The participant RECORD carries a newer fence than this owner's (a later
  // owner acknowledged it); the owner's projection is rebuilt from it.
  const row = world.tablesRows.get(TABLE_ID);
  const metadata = JSON.parse(row.partition_transition_metadata);
  metadata.participants[SOURCE_KEY].fenceToken = FENCE + 2;
  world.tablesRows.set(TABLE_ID, {...row,
    partition_transition_metadata: JSON.stringify(metadata)});
  owner.workflowCoordinator.removeWorkflow(WORKFLOW_ID);
  owner.workflowCoordinator.adoptWorkflowProjection(owner.decodeWorkflowRecord(
    WORKFLOW_ID, world.tablesRows.get(TABLE_ID)));
  const before = world.tablesRows.get(TABLE_ID).partition_transition_metadata;
  await drive(owner, shape);
  await settle(world, 3);
  t.equal(world.deliveries.length, 0, 'no REMOVE sent');
  t.equal(JSON.parse(world.tablesRows.get(TABLE_ID)
    .partition_transition_metadata).participants[SOURCE_KEY]
    .checkpoint?.requiredReplicaIds, undefined, 'no member set recorded');
  t.ok(before.length > 0, 'setup');
  t.ok(logsOf(owner, 'warn', /superseded/u).length >= 1,
    'it stops as superseded');
  t.same(owner.groupRetirementRedrive.unacknowledged(), [],
    'it tracks nothing');
});
