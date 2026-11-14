// Release liveness of a formation's joiners under every arrival order
// (quest formation-ready-lease-independent-of-spread): with no timer
// expiring, every admitted joiner holds a READY lease at the fixpoint.
//
// REAL: the join ready-signal path and the durable READY heartbeat
// (NodeJoiningService, the node lifecycle publication owner); each node's
// readiness service with the startup-authority evaluation; the membership
// publication coordinator (derivation, publication, acknowledgement); the
// planner of every priority partition, the rebalance coordinators and the
// replica dispatch service; the committed serve-eligibility answer and the
// priority-recovery health /readyz consumes.
// DOUBLES (formation-joint-admission-world.js states why none hides a
// defect): the clock, the transport (mesh connectivity, a zero-latency shared
// row store), consensus leadership as the rows state it, the node-local
// publication mode, and the replica runtime at its message boundary.
//
// On main (232082669) four of the nine orders below left every admitted
// joiner waiting at the operation-ledger formation barrier (lab jobs
// b9946a68, be96bee0 and 618296c9 in the quest's evidence).
//
// KNOWN LIMIT: no REPLACE completes in this world yet (its owner's dispatch
// retry is a cadence this world does not step), so the spread half of the
// claim is not asserted here.
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
const TABLE_PAD = 9;

// The measured losing order (lab job 0bc41a40, run repeat-551bf264/run-1):
// one joiner arrives, the seed's authority is read, that joiner's connection
// is re-identified, and one membership derivation then admits both joiners.
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

test('no joiner consults a formation barrier or a release handoff',
  async () => {
    const report = await runArrivalOrder(LOSING_ORDER);
    process.stdout.write(`MEASURED LOSING ORDER ${describeOrder(LOSING_ORDER)}\n` +
      `${formatStuckReport(report)}\n`);
    assert.equal(report.fixpoint, true);
    assert.deepEqual(report.admittedJoiners, [J1, J2]);
    for (const joiner of report.joiners) {
      assert.equal(joiner.readyLease, true);
      assert.equal(joiner.barrier, null, 'no barrier state is ever stated');
      assert.deepEqual(joiner.armedSleeps, [], 'no joiner waits on a timer');
    }
    assert.deepEqual(report.handoffTransitions, [],
      'no formation-release handoff transition is logged');
    assert.equal(report.authority.handoff, null,
      'the startup authority carries no release handoff');
    assert.deepEqual(report.otherPublicationKinds, [],
      'no formation-release publication row is written');
    assertSafety(report, 'measured losing order');
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
