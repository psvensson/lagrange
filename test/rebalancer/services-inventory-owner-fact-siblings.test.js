// Witnesses (red until the coordinator's other SERVICES inventory consumers
// read an owner fact): the canonical replica-id allocator, the bootstrap
// address book of a create, and the critical create-lane over-target hold
// take the SERVICES rows of their entity only from the services-p1 leader's
// owner fact. READY decides exactly as the complete leader read decides
// today (the reference world, where the planner node leads services-p1 and
// today's read is complete); UNAVAILABLE decides nothing: no replica id, no
// address book, no released hold, a typed refusal naming the owner-fact
// reason for the caller's own retry.
//
// Composition: topology-guard-inventory-authority-fixture.js. Each case seeds
// a row only the leader holds (the planner's follower replica and its cache
// have not received it), so a decision made from the follower or the cache
// differs from the leader's.
//
// Not covered here: the retired REPLACE-source safety check
// (getRetiredReplaceSourceMoveSafetyError), whose SERVICES read runs only for
// a priority partition REPLACE whose source a recent completed REPLACE
// targeted; its witness needs a completed REPLACE row on the fixture ledger.
import {test} from '../../src/test-helpers/tap.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {SERVICE_TYPE} from '../../src/constants/index.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
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
async function decideIn(t, world, decide) {
  const reachable = openPlannerHost(t, world, {readyNodes: true});
  const ready = await settle(() => decide(reachable));
  const unreachable = openPlannerHost(t, world, {readyNodes: true,
    unreachableNodeIds: [world.leaderNodeId]});
  const unavailable = await settle(() => decide(unreachable));
  return {ready, unavailable};
}

async function decideInBothWorlds(t, decide, seed) {
  const reference = await openWorld(t, NODE.PLANNER, PORTS);
  seed(reference);
  t.equal(reference.replicaOn(NODE.PLANNER).getRole(), RAFT_ROLE.LEADER,
    'setup: in the reference world the planner node leads services-p1');
  const referenceHost = openPlannerHost(t, reference, {readyNodes: true});
  const referenceDecision = await settle(() => decide(referenceHost));
  const world = await openWorld(t, NODE.PEER_A, PORTS);
  seed(world);
  t.equal(world.replicaOn(NODE.PLANNER).getRole(), RAFT_ROLE.FOLLOWER,
    'setup: in the subject world the planner node hosts a follower');
  const {ready, unavailable} = await decideIn(t, world, decide);
  return {reference: referenceDecision, ready, unavailable};
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

test('readBootstrapServiceRows: the address book is the owner fact\'s rows',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const decide = async (host) => (await host.coordinator.readBootstrapServiceRows(
      SERVICES_IDENTITY)).map((row) => row.service_id).sort();
    const seed = (world) => world.seedLeaderOnlyRow(leaderOnlyPartitionRow(world));
    const {reference, ready, unavailable} = await decideInBothWorlds(t, decide, seed);
    printObservation(t, 'bootstrap-rows', {reference: reference.value,
      ready: ready.value, readyError: errorShape(ready.error),
      unavailable: unavailable.value, unavailableError: errorShape(unavailable.error)});
    t.ok(reference.value?.includes(LEADER_ONLY_PARTITION_REPLICA_ID),
      'reference: the complete leader read includes the leader-only replica');
    t.same(ready.value, reference.value, 'READY yields the reference address book');
    t.equal(unavailable.value, null, 'UNAVAILABLE yields no address book (no cache rows)');
    t.ok(isTypedUnavailable(unavailable),
      `UNAVAILABLE is a typed refusal: ${JSON.stringify(errorShape(unavailable.error))}`);
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
