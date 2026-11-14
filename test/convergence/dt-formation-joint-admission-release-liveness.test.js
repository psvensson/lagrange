// Release liveness of a formation's joiners under every arrival order
// (quest formation-ready-lease-independent-of-spread): with no timer
// expiring, every admitted joiner holds a READY lease at the fixpoint.
//
// REAL: the join ready-signal path with its operation-ledger formation
// barrier and the durable READY heartbeat (NodeJoiningService, the node
// lifecycle publication owner); each node's readiness service with the
// startup-authority evaluation and the formation-release closure owner,
// publication coordinator and consumer read; the membership publication
// coordinator (derivation, publication, acknowledgement); the planner of
// every priority partition and the rebalance coordinator; the committed
// serve-eligibility answer and the priority-recovery health /readyz consumes.
// DOUBLES (formation-joint-admission-world.js states why none hides the
// defect): the clock, the transport (mesh connectivity, zero-latency shared
// row store, the SQL store's answer for a formation-release row), consensus
// leadership as the rows state it, and the node-local publication mode.
//
// The operation workflow is the production one: every planner's move becomes
// an operation through the rebalance coordinators (admission, ledger
// interlock, dispatch, remove safety, completion, re-plan). The double is the
// replica runtime at its message boundary (formation-joint-admission-world.js
// createReplicaRuntime): what a delivered CREATE or REMOVE does to the
// durable replica rows, stepped once per round.
//
// Coordinator-to-coordinator wakes reach the real ReplicaDispatchService of
// the addressed node.
//
// KNOWN LIMIT: no REPLACE completes in this world. Its owner's dispatch is
// deferred by ReplicaDispatchService ("Cache update not observed for replica
// operation", a 250 ms retry) and the retry is a timer, which never fires
// here; so no order reaches the spread, and no removal is ever admitted.
// NOT MOUNTED: BootstrapReadinessOwner (/readyz is read through the HARD
// priority-recovery health it consumes).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  OUTCOME,
  arrive,
  derive,
  describeOrder,
  formatStuckReport,
  readAuthority,
  revoke,
  runArrivalOrder,
} from './formation-joint-admission-scenario.js';

const J1 = 'j1';
const J2 = 'j2';
const J3 = 'j3';
const J4 = 'j4';
const BARRIER_WAITING_AUTHORITY = 'waiting_for_startup_authority';
const AUTHORITY_RECOVERY_PENDING = 'recovery_pending';
const REASON_NOT_SPREAD = 'priority_partitions_not_spread';
const HANDOFF_REVOKED = 'revoked';
const OPERATION_ADD = 'ADD';
const OPERATION_REPLACE = 'REPLACE';
const STEP_ACTIVE = 'ACTIVE';
const LEDGER_PARTITION_ID = 'replica_operations-p1';
const FLOOR_REFUSAL = 'would drop voter-ready replicas below minimum (2/3)';
const INTERLOCK_REFUSAL = 'operation_ledger_self_move_in_flight';
const TERMINAL_STEPS = new Set(['ACTIVE', 'REMOVED', 'FAILED']);
const TABLE_PAD = 9;

// The measured losing order (lab job 0bc41a40, run repeat-551bf264/run-1):
// the first generation is captured for one joiner, revoked, and one
// membership derivation then admits both joiners before any further capture.
const LOSING_ORDER = Object.freeze([
  arrive(J1), readAuthority(), revoke(J1), arrive(J2), derive(),
]);
// The order that wins today: one joiner per derivation, the authority read
// between them.
const WINNING_ORDER = Object.freeze([
  arrive(J1), readAuthority(), revoke(J1), derive(), readAuthority(),
  arrive(J2), derive(),
]);
const SWEEP = Object.freeze([
  {name: 'two/same-derivation/after-revoke', order: LOSING_ORDER},
  {name: 'two/successive-derivations/after-revoke', order: WINNING_ORDER},
  {name: 'two/same-derivation/never-captured',
    order: [arrive(J1), arrive(J2), derive()]},
  {name: 'two/same-derivation/captured-not-revoked',
    order: [arrive(J1), readAuthority(), arrive(J2), derive()]},
  {name: 'two/same-derivation/read-between-revoke-and-derivation',
    order: [arrive(J1), readAuthority(), revoke(J1), arrive(J2),
      readAuthority(), derive()]},
  {name: 'two/successive-derivations/no-read-between',
    order: [arrive(J1), readAuthority(), revoke(J1), derive(), arrive(J2),
      derive()]},
  {name: 'four/same-derivation/after-revoke',
    order: [arrive(J1), readAuthority(), revoke(J1), arrive(J2), arrive(J3),
      arrive(J4), derive()]},
  {name: 'four/successive-derivations/after-revoke',
    order: [arrive(J1), readAuthority(), revoke(J1), derive(), readAuthority(),
      arrive(J2), derive(), readAuthority(), arrive(J3), derive(),
      readAuthority(), arrive(J4), derive()]},
  {name: 'four/same-derivation/captured-not-revoked',
    order: [arrive(J1), readAuthority(), arrive(J2), arrive(J3), arrive(J4),
      derive()]},
]);

function assertEveryAdmittedJoinerReady(report, label) {
  assert.equal(report.fixpoint, true,
    `${label}: the world must reach a fixpoint inside the round cap`);
  assert.deepEqual(report.stuckJoiners, [],
    `${label}: every admitted joiner holds a READY lease at the fixpoint ` +
    `with no timer expiring\n${formatStuckReport(report)}`);
}

function assertSafety(report, label) {
  assert.deepEqual(report.safety.openClusterGates, [],
    `${label}: no client-facing cluster gate is open while the spread is ` +
    'unpublished');
  assert.deepEqual(report.safety.floorViolations, [],
    `${label}: no priority partition drops below its voter-ready floor`);
}

test('negative control: one joiner per derivation releases every joiner',
  async () => {
    const report = await runArrivalOrder(WINNING_ORDER);
    assertEveryAdmittedJoinerReady(report, 'winning order');
    assert.deepEqual(report.admittedJoiners, [J1, J2]);
    assertSafety(report, 'winning order');
  });

test('the losing order reproduces the measured stuck state', async () => {
  const report = await runArrivalOrder(LOSING_ORDER);
  process.stdout.write(`LOSING ORDER ${describeOrder(LOSING_ORDER)}\n` +
    `${formatStuckReport(report)}\n`);
  assert.equal(report.fixpoint, true);
  assert.deepEqual(report.admittedJoiners, [J1, J2]);
  assert.equal(report.authority.handoff.state, HANDOFF_REVOKED);
  for (const joiner of report.joiners) {
    assert.equal(joiner.barrier.state, BARRIER_WAITING_AUTHORITY);
    assert.equal(joiner.barrier.candidateNodeCount, 3);
    assert.equal(joiner.barrier.preReadyCandidateNodeCount, 2);
    assert.equal(joiner.barrier.startupAuthorityAvailable, true);
    assert.equal(joiner.barrier.startupAuthorityState,
      AUTHORITY_RECOVERY_PENDING);
    assert.deepEqual(joiner.barrier.startupAuthorityRecoveryReasonCodes,
      [REASON_NOT_SPREAD]);
    assert.equal(joiner.barrier.formationReleaseHandoffState, null);
  }
  // The operation picture the composed owners state on main: the priority
  // ADDs onto the first joiner that were admitted completed; the ledger's
  // count-neutral REPLACE is in flight and not terminal; every other priority
  // planner either refuses its own surplus removal of a seed replica at the
  // voter-ready floor (2 of 3) or has its ADD refused by the ledger
  // interlock while that self-move is in flight.
  const adds = report.operations.filter((operation) =>
    operation.type === OPERATION_ADD);
  assert.ok(adds.length > 0);
  assert.ok(adds.every((operation) => operation.step === STEP_ACTIVE));
  const replaces = report.operations.filter((operation) =>
    operation.type === OPERATION_REPLACE);
  assert.equal(replaces.length, 1);
  assert.equal(replaces[0].partitionId, LEDGER_PARTITION_ID);
  assert.equal(TERMINAL_STEPS.has(replaces[0].step), false);
  const refusalKinds = {floor: 0, interlock: 0};
  for (const [partitionId, planner] of Object.entries(report.planners)) {
    if (partitionId !== LEDGER_PARTITION_ID) {
      const atFloor = planner.refusals.some((refusal) =>
        String(refusal.error).includes(FLOOR_REFUSAL));
      const interlocked = planner.refusals.some((refusal) =>
        refusal.reason === INTERLOCK_REFUSAL);
      assert.ok(atFloor || interlocked,
        `${partitionId}: refused at the floor or by the ledger interlock`);
      refusalKinds.floor += atFloor ? 1 : 0;
      refusalKinds.interlock += interlocked ? 1 : 0;
    }
  }
  assert.equal(refusalKinds.floor, adds.length);
  assert.equal(refusalKinds.floor + refusalKinds.interlock, 5);
  assert.ok(refusalKinds.interlock > 0);
  assertSafety(report, 'losing order');
});

test('liveness: the losing order releases every admitted joiner', async () => {
  const report = await runArrivalOrder(LOSING_ORDER);
  assertEveryAdmittedJoinerReady(report, 'losing order');
});

test('sweep: every arrival order releases every admitted joiner', async () => {
  const rows = [];
  for (const {name, order} of SWEEP) {
    const report = await runArrivalOrder(order);
    rows.push({name, report});
  }
  process.stdout.write('ARRIVAL-ORDER SWEEP\n' + rows.map(({name, report}) =>
    `${report.outcome.padEnd(TABLE_PAD)} ${name} ` +
    `stuck=[${report.stuckJoiners}] rounds=${report.rounds}`).join('\n') +
    '\n');
  for (const {name, report} of rows) {
    assertSafety(report, name);
  }
  const stuck = rows.filter(({report}) => report.outcome !== OUTCOME.RELEASED);
  assert.deepEqual(stuck.map(({name}) => name), [],
    'arrival orders whose admitted joiners never publish READY');
});
