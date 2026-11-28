// Witnesses (red until the topology guard reads its SERVICES inventory as an
// owner fact): the coordinator's topology guard decides a planner's
// runtime-service ADD from the SERVICES owner fact of services-p1
// (readOwnerFact: the leader's rows at a read point the leader vouches for),
// never from a local follower's rows. An UNAVAILABLE owner fact is no
// decision: nothing is proposed, the refusal is a typed deferral naming the
// owner-fact reason, and the planner's own scheduled turn proceeds once the
// owner answers, with no other caller or event.
//
// Composition: topology-guard-inventory-authority-fixture.js (services-p1 is
// a real three-replica rs-raft group; the planner node hosts a follower; the
// coordinator, gateway, CDC read flow, query executor, routers and receivers
// are production objects). The planner's turn is the production
// checkRebalance, cadence and scheduled retry on a virtual clock; what the
// turn substitutes (gates, policy, state evaluation, move calculation) is
// named in the fixture. Proposals are the operation rows the coordinator
// writes to the replica-operation ledger.
// The witnesses state behaviour (what the guard decides, which replica it
// asks, what it proposes), not the read's call shape, which is still
// changing.
//
// Not covered here (raft-controlled read points): a leader that has not
// applied its election log and a read point that moved during the read; both
// are typed UNAVAILABLE answers of the same receiver
// (test/cdc/cdc-owner-fact-receiver-read-point.test.js), and the consumer
// takes the same branch for every UNAVAILABLE reason.
import {test} from '../../src/test-helpers/tap.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {REBALANCE_COORDINATOR_SHARED} from
  '../../src/rebalancer/rebalance-coordinator-shared.js';
import {STORAGE_ADMISSION_DECISION_TYPE} from
  '../../src/rebalancer/storage-admission-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  NODE,
  RUNTIME_SERVICE,
  RUNTIME_SERVICE_ID,
  initializeGuardEnvironment,
  isGuardServicesRead,
  openPlannerHost,
  openServicesWorld,
  refusalOf,
  resetGuardEnvironment,
  summarizeServicesRead,
} from './topology-guard-inventory-authority-fixture.js';

const {TOPOLOGY_GUARD_REASON} = REBALANCE_COORDINATOR_SHARED;
const PORTS = createPortAllocator(import.meta.url);
const CASE_TIMEOUT_MS = 240000;
// The guard's refusals that are decisions on an inventory it read.
const INVENTORY_DECISION_REASONS = new Set([
  TOPOLOGY_GUARD_REASON.TARGET_NODE_ALREADY_OCCUPIED,
  TOPOLOGY_GUARD_REASON.TARGET_REPLICA_COUNT_ALREADY_SATISFIED,
  TOPOLOGY_GUARD_REASON.PARTITION_TARGET_UNAVAILABLE,
]);
// Virtual time the owner stays unavailable, then the bound within which the
// planner's own scheduled turn must have proposed once.
const FAULT_HOLD_MS = 20000;
const RECOVERY_BOUND_MS = 60000;

function printObservation(t, name, value) {
  t.comment(`OBSERVATION ${name} ${JSON.stringify(value)}`);
}

function ledgerShape(rows) {
  return rows.map((row) => ({entity_type: row.entity_type, entity_id: row.entity_id,
    target_node_id: row.target_node_id}));
}

// A refusal that is no decision: deferred, naming why the owner fact is
// unavailable, and not one of the guard's decisions on a read inventory.
function isTypedUnavailableDeferral(refusal) {
  return refusal?.decisionType === STORAGE_ADMISSION_DECISION_TYPE.DEFERRED &&
    typeof refusal.authoritativeReasonCode === 'string' &&
    refusal.authoritativeReasonCode.length > 0 &&
    Object.values(TOPOLOGY_GUARD_REASON).includes(refusal.reason) &&
    !INVENTORY_DECISION_REASONS.has(refusal.reason);
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
  t.equal(world.replicaOn(NODE.PLANNER).getRole(), RAFT_ROLE.FOLLOWER,
    'setup: the planner node hosts a services-p1 replica that follows');
  return world;
}

test('the guard reads the SERVICES owner fact from the leader, never the planner\'s ' +
  'follower, and admits the ADD once', {timeout: CASE_TIMEOUT_MS}, async (t) => {
  const world = await openWorld(t, NODE.PEER_A, PORTS);
  const host = await openPlannerHost(t, world);
  const plannerBefore = world.readCountsOf(NODE.PLANNER);
  const first = await host.createAdd();
  const plannerAfter = world.readCountsOf(NODE.PLANNER);
  const reads = first.servicesReads.filter(isGuardServicesRead);
  const ledger = host.ledgerRows();
  printObservation(t, 'owner-fact-guard', {reads: reads.map(summarizeServicesRead),
    refusal: refusalOf(first.error),
    plannerBefore, plannerAfter, hops: first.hops.map(({nodeId, refused}) =>
      ({nodeId, refused})), ledger: ledgerShape(ledger)});

  t.ok(reads.length > 0, 'the guard issued its SERVICES inventory read');
  t.equal(plannerAfter.local - plannerBefore.local, 0,
    'the planner\'s follower replica was never read locally');
  t.equal(plannerAfter.receiver - plannerBefore.receiver, 0,
    'nor asked through its receiver');
  t.ok(first.hops.length > 0 && first.hops.every(({nodeId}) => nodeId === NODE.PEER_A),
    'every hop went to the leader\'s node');
  t.equal(first.error, null, `the request is admitted: ${JSON.stringify(refusalOf(first.error))}`);
  t.same(ledgerShape(ledger), [{entity_type: RUNTIME_SERVICE, entity_id: RUNTIME_SERVICE_ID,
    target_node_id: NODE.PLANNER}], 'exactly one operation row is proposed');
});

async function runPlannerTurnAcrossOutage(t, {world, host, outage, restore,
  scheduledRetry}) {
  const clock = new VirtualTimeSource({startMs: Date.now()});
  outage();
  const turn = host.openPlannerTurn({clock, scheduledRetry});
  await turn.start();
  await turn.advance(FAULT_HOLD_MS);
  const duringFault = Object.freeze({proposals: host.ledgerRows().length,
    results: [...turn.results], guardReads: host.observed.servicesReads
      .filter(isGuardServicesRead).length});
  // The owner becomes available again with no event to the planner, no call
  // to the coordinator and no cache change: only the planner's own scheduled
  // turn can observe it.
  restore();
  // The executor's quarantine of the refused address runs on the host clock.
  await host.afterAddressQuarantine();
  await turn.advance(RECOVERY_BOUND_MS);
  const afterRecovery = Object.freeze({proposals: host.ledgerRows().length,
    results: [...turn.results], ledger: ledgerShape(host.ledgerRows())});
  await turn.stop();
  printObservation(t, `planner-turn-${scheduledRetry ? 'scheduled' : 'no-retry'}`, {
    duringFault: {proposals: duringFault.proposals, guardReads: duringFault.guardReads,
      results: duringFault.results.map((result) => ({skipped: result?.skipped,
        reason: result?.reason, admission: result?.admission?.reason,
        authoritativeReasonCode:
          result?.admission?.topologySnapshot?.authoritativeReasonCode}))},
    afterRecovery: {proposals: afterRecovery.proposals, ledger: afterRecovery.ledger,
      results: afterRecovery.results.length}});
  return {duringFault, afterRecovery, world};
}

function faultRefusals(duringFault) {
  return duringFault.results.map((result) => {
    const admission = result?.admission;
    return {decisionType: admission?.decisionType, reason: admission?.reason,
      authoritativeReasonCode: admission?.topologySnapshot?.authoritativeReasonCode};
  });
}

test('the leader unreachable: no decision, typed deferral, zero proposals; the planner\'s ' +
  'own scheduled turn proposes exactly once after the owner answers',
{timeout: CASE_TIMEOUT_MS}, async (t) => {
  const world = await openWorld(t, NODE.PEER_A, PORTS);

  await t.test('with the planner\'s scheduled retry', async (t) => {
    const host = await openPlannerHost(t, world);
    const {duringFault, afterRecovery} = await runPlannerTurnAcrossOutage(t, {world, host,
      outage: () => host.setReachable(NODE.PEER_A, false),
      restore: () => host.setReachable(NODE.PEER_A, true),
      scheduledRetry: true});
    t.equal(duringFault.proposals, 0, 'nothing is proposed while the owner is unavailable');
    t.ok(duringFault.results.length >= 2,
      `the planner's own turn came back by itself (${duringFault.results.length} turns)`);
    t.ok(duringFault.results.every((result) => result?.skipped === true),
      'each turn skipped its move');
    t.ok(faultRefusals(duringFault).every(isTypedUnavailableDeferral),
      `each refusal is a typed deferral naming the owner-fact reason: ${
        JSON.stringify(faultRefusals(duringFault))}`);
    t.equal(afterRecovery.proposals, 1,
      'exactly one proposal once the owner answers, from the planner\'s own turn');
    t.same(afterRecovery.ledger, [{entity_type: RUNTIME_SERVICE,
      entity_id: RUNTIME_SERVICE_ID, target_node_id: NODE.PLANNER}]);
  });

  await t.test('anti-vacuity: without the scheduled retry nothing proposes after the ' +
    'owner answers', async (t) => {
    const host = await openPlannerHost(t, world);
    const {afterRecovery} = await runPlannerTurnAcrossOutage(t, {world, host,
      outage: () => host.setReachable(NODE.PEER_A, false),
      restore: () => host.setReachable(NODE.PEER_A, true),
      scheduledRetry: false});
    t.equal(afterRecovery.proposals, 0,
      'no other caller or event proposes: the scheduled turn is the only wake');
  });
});

test('a stale published leader whose successor is unreachable: no decision; the same ' +
  'turn proposes once the successor answers', {timeout: CASE_TIMEOUT_MS}, async (t) => {
  const world = await openWorld(t, NODE.PEER_A, PORTS);
  // services-p1 leadership moves to PEER_B; the planner's projection still
  // publishes PEER_A (partitions.leader_node_id), whose replica now follows.
  await world.transferLeadership(NODE.PEER_A, NODE.PEER_B);
  const host = await openPlannerHost(t, world);
  t.equal(host.route().publishedLeaderNodeId, NODE.PEER_A,
    'setup: the planner still publishes the deposed leader');
  const {duringFault, afterRecovery} = await runPlannerTurnAcrossOutage(t, {world, host,
    outage: () => host.setReachable(NODE.PEER_B, false),
    restore: () => host.setReachable(NODE.PEER_B, true),
    scheduledRetry: true});
  t.equal(duringFault.proposals, 0, 'nothing is proposed while the leader is unreachable');
  t.ok(faultRefusals(duringFault).length > 0 &&
    faultRefusals(duringFault).every(isTypedUnavailableDeferral),
  `each refusal is a typed deferral: ${JSON.stringify(faultRefusals(duringFault))}`);
  t.equal(afterRecovery.proposals, 1, 'exactly one proposal after the successor answers');
});
