// Witnesses (red until the topology guard reads its SERVICES inventory as an
// owner fact): the guard makes no decision on a SERVICES answer whose read
// point the services-p1 leader cannot vouch for, and decides on the leader's
// state once it can.
// - A fresh leader holds, unapplied, a row its predecessor committed (it has
//   not applied its election log): the planner's own turns propose nothing;
//   when the leader has applied its log the same turn proposes exactly once,
//   counting the committed row (the replica id after it, not a reused one).
// - The leader's applied index moves while it reads (a row lands on the
//   target node): that read decides nothing; the next decides on the moved
//   state and refuses the occupied target.
// The witnesses state behaviour (what the guard decides and proposes), not
// the read's call shape.
//
// Composition: topology-guard-inventory-authority-fixture.js (real
// three-replica services-p1 group on a holdable loopback raft transport,
// partition-group-raft-controls.js; production coordinator, gateway, CDC read
// flow, routers and receivers). Substituted per case: raft messages held back
// from one replica; the leader's statement held after it ran.
import {test} from '../../src/test-helpers/tap.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {REBALANCE_COORDINATOR_SHARED} from
  '../../src/rebalancer/rebalance-coordinator-shared.js';
import {STORAGE_ADMISSION_DECISION_TYPE} from
  '../../src/rebalancer/storage-admission-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  NODE,
  RUNTIME_SERVICE_ID,
  buildRuntimeOccupantRow,
  initializeGuardEnvironment,
  openPlannerHost,
  openServicesWorld,
  refusalOf,
  resetGuardEnvironment,
} from './topology-guard-inventory-authority-fixture.js';

const {TOPOLOGY_GUARD_REASON} = REBALANCE_COORDINATOR_SHARED;
const PORTS = createPortAllocator(import.meta.url);
const CASE_TIMEOUT_MS = 240000;
const FAULT_HOLD_MS = 20000;
const RECOVERY_BOUND_MS = 60000;
const ELECTION_LOG_ENTRY_ID = 'guard-election-log-row';
const READ_POINT_ENTRY_ID = 'guard-read-point-row';
const NEXT_REPLICA_ID = `${RUNTIME_SERVICE_ID}-r2`;
const INVENTORY_DECISION_REASONS = new Set([
  TOPOLOGY_GUARD_REASON.TARGET_NODE_ALREADY_OCCUPIED,
  TOPOLOGY_GUARD_REASON.TARGET_REPLICA_COUNT_ALREADY_SATISFIED,
  TOPOLOGY_GUARD_REASON.PARTITION_TARGET_UNAVAILABLE,
]);

function printObservation(t, name, value) {
  t.comment(`OBSERVATION ${name} ${JSON.stringify(value)}`);
}

function ledgerShape(rows) {
  return rows.map((row) => ({entity_id: row.entity_id, target_node_id: row.target_node_id,
    replica_id: row.replica_id}));
}

function isTypedUnavailableDeferral(refusal) {
  return refusal?.decisionType === STORAGE_ADMISSION_DECISION_TYPE.DEFERRED &&
    typeof refusal.authoritativeReasonCode === 'string' &&
    refusal.authoritativeReasonCode.length > 0 &&
    Object.values(TOPOLOGY_GUARD_REASON).includes(refusal.reason) &&
    !INVENTORY_DECISION_REASONS.has(refusal.reason);
}

function turnRefusal(result) {
  const admission = result?.admission;
  return {decisionType: admission?.decisionType, reason: admission?.reason,
    authoritativeReasonCode: admission?.topologySnapshot?.authoritativeReasonCode};
}

async function openWorld(t) {
  initializeGuardEnvironment();
  let world = null;
  try {
    world = await openServicesWorld({leaderNodeId: NODE.PEER_A, ports: PORTS});
  } finally {
    t.teardown(async () => {
      await world?.close();
      resetGuardEnvironment();
    });
  }
  return world;
}

test('a fresh services-p1 leader that has not applied its election log: no decision; ' +
  'once applied, the same planner turn proposes once, counting the committed row',
{timeout: CASE_TIMEOUT_MS}, async (t) => {
  const world = await openWorld(t);
  // PEER_A commits a runtime replica row on PEER_B; PEER_B receives it but
  // not its commit, then leads without being able to commit its own entry.
  await world.freshLeaderBehindCommit(NODE.PEER_A, NODE.PEER_B,
    buildRuntimeOccupantRow(NODE.PEER_B, Date.now()), ELECTION_LOG_ENTRY_ID);
  const host = openPlannerHost(t, world, {publishedLeaderNodeId: NODE.PEER_B});
  const clock = new VirtualTimeSource({startMs: Date.now()});
  const turn = host.openPlannerTurn({clock});
  await turn.start();
  await turn.advance(FAULT_HOLD_MS);
  const duringFault = {proposals: host.ledgerRows().length,
    refusals: turn.results.map(turnRefusal)};
  // The new leader's appends flow again; nothing is told to the planner.
  world.releaseRaftHolds();
  await world.settleLeader(NODE.PEER_B);
  await turn.advance(RECOVERY_BOUND_MS);
  const afterRecovery = ledgerShape(host.ledgerRows());
  await turn.stop();
  printObservation(t, 'election-log', {duringFault, afterRecovery});

  t.equal(duringFault.proposals, 0, 'nothing is proposed while the leader has not ' +
    'applied its election log');
  t.ok(duringFault.refusals.length > 0 && duringFault.refusals.every(isTypedUnavailableDeferral),
    `each turn was a typed deferral: ${JSON.stringify(duringFault.refusals)}`);
  t.same(afterRecovery, [{entity_id: RUNTIME_SERVICE_ID, target_node_id: NODE.PLANNER,
    replica_id: NEXT_REPLICA_ID}], 'exactly one proposal after the leader applied its ' +
    'log, minting the replica id after the committed row');
});

test('the leader\'s applied index moves while it reads: that read decides nothing; the ' +
  'next decides on the moved state', {timeout: CASE_TIMEOUT_MS}, async (t) => {
  const world = await openWorld(t);
  await world.settleLeader(NODE.PEER_A);
  const host = openPlannerHost(t, world);
  const held = world.holdNextStatementAfterRead(NODE.PEER_A);
  const pending = host.createAdd();
  const raced = await Promise.race([held.entered.then(() => null), pending]);
  const leaderStatementHeld = raced === null;
  if (leaderStatementHeld) {
    // While the leader's read is in flight, a runtime replica row on the
    // target node commits and applies.
    await world.writeRowThroughLeader(NODE.PEER_A,
      buildRuntimeOccupantRow(NODE.PLANNER, Date.now()), READ_POINT_ENTRY_ID);
  }
  held.release();
  const first = await pending;
  const firstLedger = host.ledgerRows().length;
  const second = await host.createAdd();
  printObservation(t, 'read-point', {leaderStatementHeld, first: refusalOf(first.error),
    firstLedger, second: refusalOf(second.error),
    ledger: ledgerShape(host.ledgerRows())});

  t.ok(leaderStatementHeld, 'the guard\'s read reached the leader\'s statement');
  t.ok(isTypedUnavailableDeferral(refusalOf(first.error)),
    `the read whose point moved decided nothing: ${JSON.stringify(refusalOf(first.error))}`);
  t.equal(firstLedger, 0, 'and proposed nothing');
  t.equal(refusalOf(second.error)?.reason, TOPOLOGY_GUARD_REASON.TARGET_NODE_ALREADY_OCCUPIED,
    'the next read decides on the moved state: the target is occupied');
  t.equal(refusalOf(second.error)?.decisionType, STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
    'a decision, not an unavailability');
  t.same(host.ledgerRows(), [], 'nothing was ever proposed');
});
