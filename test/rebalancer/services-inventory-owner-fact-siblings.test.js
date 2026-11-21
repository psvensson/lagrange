// Witnesses (red until the coordinator's other SERVICES inventory consumers
// move off the fallback-mode read): the canonical replica-id allocator, the
// critical create-lane over-target hold and the retired REPLACE-source check
// take the SERVICES rows of their entity only from the services-p1 leader's
// owner fact. READY decides exactly as the complete leader read decides
// (the reference world, where the planner node leads services-p1 and the
// complete read is local); UNAVAILABLE decides nothing: no replica id, no
// released hold, no source judged retirable, a typed refusal naming why, for
// the caller's own retry. The retired-source check never releases its lease
// on the node's projection alone. The partition bootstrap address book is
// the node's projection (a hint): a row it has not received is an address
// not yet known, and no read of the owner is made for it.
//
// Composition: topology-guard-inventory-authority-fixture.js. Each case seeds
// a row only the leader holds (the planner's follower replica and its cache
// have not received it), so a decision made from the follower or the cache
// differs from the leader's.
import {test} from '../../src/test-helpers/tap.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDC_OPERATION, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {buildCanonicalReplicaOperationRow} from
  '../../src/rebalancer/replica-operation-repository-mutation-row-methods.js';
import {OperationType, ReplicaStatus, createOperationAt} from
  '../../src/rebalancer/replica-status.js';
import {
  NODE,
  RUNTIME_SERVICE,
  RUNTIME_SERVICE_ID,
  SERVICES_PARTITION_ID,
  buildRuntimeOccupantRow,
  initializeGuardEnvironment,
  openPlannerHost,
  openServicesWorld,
  resetGuardEnvironment,
} from './topology-guard-inventory-authority-fixture.js';

const PORTS = createPortAllocator(import.meta.url);
const CASE_TIMEOUT_MS = 180000;
const LEADER_ONLY_PARTITION_REPLICA_ID = `${SERVICES_PARTITION_ID}-r4`;
const RUNTIME_IDENTITY = Object.freeze({partitionId: RUNTIME_SERVICE_ID,
  entityType: RUNTIME_SERVICE, entityId: RUNTIME_SERVICE_ID});
const SERVICES_IDENTITY = Object.freeze({partitionId: SERVICES_PARTITION_ID,
  entityType: SERVICE_TYPE.PARTITION, entityId: SERVICES_PARTITION_ID});
// A priority control-plane partition whose replica rows live in SERVICES.
const PRIORITY_PARTITION_ID = 'sql_write_operations-p1';
const PRIORITY_REPLICA_NODES = Object.freeze([NODE.PEER_A, NODE.PLANNER, NODE.PEER_B]);
// The target of a REPLACE that completed a moment ago, now the source of a
// new REPLACE.
const RECENT_TARGET_REPLICA_ID = `${PRIORITY_PARTITION_ID}-r3`;
const COMPLETED_REPLACE_OPERATION_ID = 'completed-replace-of-r3';
const COMPLETED_REPLACE_SOURCE_REPLICA_ID = `${PRIORITY_PARTITION_ID}-r9`;

function printObservation(t, name, value) {
  t.comment(`OBSERVATION ${name} ${JSON.stringify(value)}`);
}

async function settle(run) {
  try {
    return {value: await run(), error: null};
  } catch (error) {
    return {value: null, error};
  }
}

function errorShape(error) {
  return error === null ? null : {message: error.message,
    reasonCode: error.reasonCode ?? null, rebalanceSkipReason: error.rebalanceSkipReason ?? null};
}

// No decision: a typed refusal naming why the SERVICES owner fact is
// unavailable, for the caller's own retry.
function isTypedUnavailable(outcome) {
  return outcome.error !== null && typeof outcome.error.reasonCode === 'string' &&
    outcome.error.reasonCode.length > 0 &&
    typeof outcome.error.rebalanceSkipReason === 'string';
}

// A services-p1 replica row only the leader holds (a fourth replica on PEER_B).
function leaderOnlyPartitionRow(world) {
  const [template] = world.publishedRows;
  return {...template, service_id: LEADER_ONLY_PARTITION_REPLICA_ID,
    replica_id: LEADER_ONLY_PARTITION_REPLICA_ID, node_id: NODE.PEER_B};
}

async function openWorld(t, leaderNodeId, ports) {
  initializeGuardEnvironment();
  let world = null;
  try {
    world = await openServicesWorld({leaderNodeId, ports});
  } finally {
    t.teardown(async () => {
      await world?.close();
      resetGuardEnvironment();
    });
  }
  return world;
}

// The three decisions over one world: READY (leader reachable) and
// UNAVAILABLE (leader's node unreachable), on hosts with ready nodes.
async function decideIn(t, world, decide, hostOptions = {}) {
  const reachable = openPlannerHost(t, world, {readyNodes: true, ...hostOptions});
  const ready = await settle(() => decide(reachable));
  const unreachable = openPlannerHost(t, world, {readyNodes: true, ...hostOptions,
    unreachableNodeIds: [world.leaderNodeId]});
  const unavailable = await settle(() => decide(unreachable));
  return {ready, unavailable};
}

async function decideInBothWorlds(t, decide, seed, hostOptionsOf = () => ({})) {
  const reference = await openWorld(t, NODE.PLANNER, PORTS);
  seed(reference);
  t.equal(reference.replicaOn(NODE.PLANNER).getRole(), RAFT_ROLE.LEADER,
    'setup: in the reference world the planner node leads services-p1');
  const referenceHost = openPlannerHost(t, reference,
    {readyNodes: true, ...hostOptionsOf(reference)});
  const referenceDecision = await settle(() => decide(referenceHost));
  const world = await openWorld(t, NODE.PEER_A, PORTS);
  seed(world);
  t.equal(world.replicaOn(NODE.PLANNER).getRole(), RAFT_ROLE.FOLLOWER,
    'setup: in the subject world the planner node hosts a follower');
  const {ready, unavailable} = await decideIn(t, world, decide, hostOptionsOf(world));
  return {reference: referenceDecision, ready, unavailable};
}

// The replica rows of the priority partition, one per node.
function priorityPartitionRows(world, status = null) {
  const [template] = world.publishedRows;
  return PRIORITY_REPLICA_NODES.map((nodeId, index) => {
    const replicaId = `${PRIORITY_PARTITION_ID}-r${index + 1}`;
    return {...template, service_id: replicaId, replica_id: replicaId,
      partition_id: PRIORITY_PARTITION_ID, node_id: nodeId,
      ...(status !== null && replicaId === RECENT_TARGET_REPLICA_ID ? {status} : {})};
  });
}

// The ledger row of a REPLACE that completed now, its target the recent one.
function completedReplaceRow() {
  const now = Date.now();
  const operation = createOperationAt({operationId: COMPLETED_REPLACE_OPERATION_ID,
    type: OperationType.REPLACE, partitionId: PRIORITY_PARTITION_ID,
    sourceNodeId: NODE.PEER_A, targetNodeId: NODE.PEER_B,
    replicaId: RECENT_TARGET_REPLICA_ID,
    sourceReplicaId: COMPLETED_REPLACE_SOURCE_REPLICA_ID}, now);
  operation.entityType = SERVICE_TYPE.PARTITION;
  operation.entityId = PRIORITY_PARTITION_ID;
  operation.status = ReplicaStatus.REMOVED;
  operation.workflowStep = WORKFLOW_STEP.REMOVED;
  operation.completedAt = now;
  operation.updatedAt = now;
  return buildCanonicalReplicaOperationRow(operation, null);
}

function retiredSourceDecision(host) {
  return host.coordinator.getRetiredReplaceSourceMoveSafetyError({
    type: OperationType.REPLACE, partitionId: PRIORITY_PARTITION_ID,
    entityType: SERVICE_TYPE.PARTITION, entityId: PRIORITY_PARTITION_ID,
    replicaId: RECENT_TARGET_REPLICA_ID, nodeId: NODE.PLANNER},
  {entityType: SERVICE_TYPE.PARTITION, entityId: PRIORITY_PARTITION_ID});
}

test('allocateCanonicalReplicaId: the owner fact\'s rows name the used replica ids',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const decide = (host) => host.coordinator.allocateCanonicalReplicaId({
      ...RUNTIME_IDENTITY, excludeReplicaIds: []});
    const seed = (world) => world.seedLeaderOnlyRow(
      buildRuntimeOccupantRow(NODE.PEER_B, Date.now()));
    const {reference, ready, unavailable} = await decideInBothWorlds(t, decide, seed);
    printObservation(t, 'allocate', {reference: reference.value,
      referenceError: errorShape(reference.error), ready: ready.value,
      readyError: errorShape(ready.error), unavailable: unavailable.value,
      unavailableError: errorShape(unavailable.error)});
    t.equal(reference.value, `${RUNTIME_SERVICE_ID}-r2`,
      'reference: the complete leader read counts the leader\'s r1');
    t.equal(ready.value, reference.value, 'READY allocates what the reference allocates');
    t.equal(unavailable.value, null, 'UNAVAILABLE allocates no replica id');
    t.ok(isTypedUnavailable(unavailable),
      `UNAVAILABLE is a typed refusal: ${JSON.stringify(errorShape(unavailable.error))}`);
  });

test('readBootstrapServiceRows: the partition address book is the node\'s projection; ' +
  'a row it has not received is an address not yet known', {timeout: CASE_TIMEOUT_MS},
async (t) => {
  const addressBookOf = async (host) => {
    const marked = {reads: host.observed.servicesReads.length, hops: host.observed.hops.length};
    const rows = await host.coordinator.readBootstrapServiceRows(SERVICES_IDENTITY);
    return {replicaIds: rows.map((row) => row.service_id).sort(),
      ownerReads: host.observed.servicesReads.length - marked.reads,
      hops: host.observed.hops.length - marked.hops};
  };
  const projected = (world) => world.publishedRows.map((row) => row.service_id).sort();
  const reference = await openWorld(t, NODE.PLANNER, PORTS);
  reference.seedLeaderOnlyRow(leaderOnlyPartitionRow(reference));
  const referenceBook = await addressBookOf(openPlannerHost(t, reference));
  const world = await openWorld(t, NODE.PEER_A, PORTS);
  world.seedLeaderOnlyRow(leaderOnlyPartitionRow(world));
  const host = openPlannerHost(t, world);
  const before = await addressBookOf(host);
  const unreachableBook = await addressBookOf(openPlannerHost(t, world,
    {unreachableNodeIds: [world.leaderNodeId]}));
  // The projection receives the row (its cache change); the next read has it.
  host.cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT,
    leaderOnlyPartitionRow(world));
  const after = await addressBookOf(host);
  printObservation(t, 'bootstrap-address-book', {referenceBook, before, unreachableBook,
    after});
  t.same(referenceBook.replicaIds, projected(reference),
    'even where the planner leads, the address book is the projection, not the leader\'s rows');
  t.same(before.replicaIds, projected(world), 'a row the projection has not received ' +
    'is an address not yet known');
  t.same(unreachableBook.replicaIds, projected(world),
    'the owner\'s availability does not enter the address book');
  t.same([referenceBook, before, unreachableBook, after].map(({ownerReads, hops}) =>
    ({ownerReads, hops})), Array(4).fill({ownerReads: 0, hops: 0}),
  'no owner read and no hop for an address book');
  t.ok(after.replicaIds.includes(LEADER_ONLY_PARTITION_REPLICA_ID),
    'once published, the next read knows the address');
});

test('getRetiredReplaceSourceMoveSafetyError: the recent-target lease is released only by ' +
  'the owner fact\'s terminal row', {timeout: CASE_TIMEOUT_MS}, async (t) => {
  const seed = (world) => {
    priorityPartitionRows(world).forEach((row) => world.seedRowOnAll(row));
    world.setLeaderRowStatus(RECENT_TARGET_REPLICA_ID, ReplicaStatus.FAILED);
  };
  const hostOptionsOf = (world) => ({publishedRows: priorityPartitionRows(world),
    ledgerRows: [completedReplaceRow()]});
  const {reference, ready, unavailable} =
    await decideInBothWorlds(t, retiredSourceDecision, seed, hostOptionsOf);
  printObservation(t, 'retired-source-owner-terminal', {reference: reference.value,
    referenceError: errorShape(reference.error), ready: ready.value,
    readyError: errorShape(ready.error), unavailable: unavailable.value,
    unavailableError: errorShape(unavailable.error)});
  t.equal(reference.error, null, 'reference: decided');
  t.equal(reference.value, null,
    'reference: the leader\'s FAILED row releases the recent-target lease');
  t.equal(ready.error, null, 'READY: decided');
  t.equal(ready.value, reference.value, 'READY decides as the reference');
  t.ok(isTypedUnavailable(unavailable),
    `UNAVAILABLE judges no source retirable: a typed refusal ${
      JSON.stringify(errorShape(unavailable.error))}`);
});

test('getRetiredReplaceSourceMoveSafetyError: a terminal status in the node\'s projection ' +
  'alone never releases the lease', {timeout: CASE_TIMEOUT_MS}, async (t) => {
  const seed = (world) => priorityPartitionRows(world).forEach((row) =>
    world.seedRowOnAll(row));
  // The projection says the recent target FAILED; the owner holds it ACTIVE.
  const hostOptionsOf = (world) => ({
    publishedRows: priorityPartitionRows(world, ReplicaStatus.FAILED),
    ledgerRows: [completedReplaceRow()]});
  const {reference, ready} =
    await decideInBothWorlds(t, retiredSourceDecision, seed, hostOptionsOf);
  printObservation(t, 'retired-source-projection-only', {reference: reference.value,
    referenceError: errorShape(reference.error), ready: ready.value,
    readyError: errorShape(ready.error)});
  t.equal(reference.error, null, 'reference: decided');
  t.type(reference.value, 'string', 'reference: the lease holds (the source is protected)');
  t.equal(ready.value, reference.value, 'READY decides as the reference');
});

test('holdCriticalPartitionCreateLaneIfOverTarget: the over-target hold is decided on ' +
  'the owner fact and never released by an unavailable one', {timeout: CASE_TIMEOUT_MS},
async (t) => {
  const decide = (host) => host.coordinator.holdCriticalPartitionCreateLaneIfOverTarget({
    ...SERVICES_IDENTITY, normalizedMoveType: OperationType.ADD,
    move: {type: OperationType.ADD, nodeId: NODE.PEER_B,
      moveReason: MOVE_REASON.INCREASE_REPLICA_COUNT}});
  const seed = (world) => world.seedLeaderOnlyRow(leaderOnlyPartitionRow(world));
  const {reference, ready, unavailable} = await decideInBothWorlds(t, decide, seed);
  printObservation(t, 'over-target-hold', {referenceError: errorShape(reference.error),
    readyError: errorShape(ready.error), unavailableError: errorShape(unavailable.error)});
  t.ok(reference.error !== null,
    'reference: four alive replicas over a target of three hold the lane');
  t.notOk(isTypedUnavailable(ready),
    'READY is a decision, not an unavailability');
  t.equal(ready.error?.message, reference.error?.message,
    'READY holds the lane exactly as the reference does');
  t.ok(isTypedUnavailable(unavailable),
    `UNAVAILABLE releases no hold: a typed refusal ${
      JSON.stringify(errorShape(unavailable.error))}`);
});
