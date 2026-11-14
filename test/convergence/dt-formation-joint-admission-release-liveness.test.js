// Formation under every arrival order of its joiners (quest
// formation-ready-lease-independent-of-spread). With no bound or timeout
// expiring: every admitted joiner holds a READY lease; every priority
// control-plane partition, the operation ledger included, ends on three
// distinct READY nodes with the seed's surplus replicas removed and no
// operation unfinished; no client-facing cluster gate is open while the
// spread is unpublished; no removal takes a priority partition below its
// voter-ready floor.
//
// REAL: the join ready-signal path and the durable READY heartbeat
// (NodeJoiningService, the node lifecycle publication owner); each node's
// readiness service with the startup-authority evaluation; the membership
// publication coordinator (derivation, publication, acknowledgement); the
// planner of every priority partition, the rebalance coordinators with their
// operation workflow owners, and the replica dispatch service; the committed
// serve-eligibility answer and the priority-recovery health /readyz consumes.
// DOUBLES (formation-joint-admission-world.js states each boundary): the
// clock, the transport (mesh connectivity, one shared row store), the
// node-local publication mode, and the replica runtime with its consensus
// group: the replica handler's answers and executor reports, learner
// promotion, the replacement-target leadership transfer, the committed
// removal.
// TIME: no bound, timeout or deadline is ever reached. Retry and
// re-evaluation cadences are stepped by name, once per round
// (formation-joint-admission-rounds.js lists them); the report counts them.
//
// On main (232082669) four of the nine orders below left every admitted
// joiner waiting at the operation-ledger formation barrier (lab jobs
// b9946a68, be96bee0 and 618296c9 in the quest's evidence).
//
// LIMITS: every node reads one shared row store, so no node is ever behind
// another (no replication lag). BootstrapReadinessOwner is not mounted
// (/readyz is read through the HARD priority-recovery health it consumes).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  OUTCOME,
  STEPPED_CADENCE_NAMES,
  VOTER_READY_FLOOR,
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
  assert.deepEqual(report.safety.summaryAheadOfRows, [],
    `${label}: the published summary never states a spread the rows lack`);
}

// The spread half: three distinct READY voter holders per priority
// partition, the surplus removed, nothing unfinished, the summary satisfied.
function assertSpreadComplete(report, label) {
  const detail = `${label}\n${formatStuckReport(report)}`;
  assert.equal(report.fixpoint, true,
    `${label}: the world must reach a fixpoint inside the round cap`);
  assert.equal(report.spread.spreadOnDistinctNodes, true,
    `every priority partition is on three distinct READY nodes: ${detail}`);
  assert.equal(report.spread.surplusRemoved, true,
    `the surplus replicas are removed: ${detail}`);
  assert.deepEqual(report.spread.unfinishedOperations, [],
    `no operation is left unfinished: ${detail}`);
  assert.equal(report.spread.summarySatisfied, true,
    `the published priority summary is satisfied: ${detail}`);
  assert.deepEqual(report.spentBounds, [], `${label}: no bound was spent`);
}

function lowestFloor(report) {
  return Math.min(...Object.values(report.safety.lowestVoterReady));
}

const reports = new Map();
function reportOf(name, order) {
  if (!reports.has(name)) reports.set(name, runArrivalOrder(order));
  return reports.get(name);
}
const losingReport = () => reportOf('losing', LOSING_ORDER);

test('negative control: one joiner per derivation releases every joiner ' +
  'and completes the spread', async () => {
  const report = await reportOf('winning', WINNING_ORDER);
  assertEveryAdmittedJoinerReady(report, 'winning order');
  assert.deepEqual(report.admittedJoiners, [J1, J2]);
  assertSafety(report, 'winning order');
  assertSpreadComplete(report, 'winning order');
});

test('no joiner consults a formation barrier or a release handoff',
  async () => {
    const report = await losingReport();
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

test('liveness: the losing order releases every admitted joiner and ' +
  'completes the spread', async () => {
  const report = await losingReport();
  assertEveryAdmittedJoinerReady(report, 'losing order');
  assertSpreadComplete(report, 'losing order');
});

test('the ledger quorum hold engages while the ledger is concentrated and ' +
  'releases once it is spread', async () => {
  const report = await losingReport();
  process.stdout.write('OPERATION SEQUENCE (losing order)\n' +
    `${report.timeline.join('\n')}\n` +
    `ledger hold: ${JSON.stringify(report.ledgerHold)}\n` +
    `planner refusals: ${JSON.stringify(report.refusalReasons)}\n` +
    `gates: ${JSON.stringify(report.gates)}\n`);
  assert.ok(report.ledgerHold.engagedRounds.length > 0,
    'dependent moves are deferred while the ledger quorum is concentrated');
  assert.ok(Math.max(...report.ledgerHold.engagedRounds) < report.rounds,
    'the hold is not standing at the fixpoint');
  // The removals the floor admitted, and the count it never went below.
  assert.ok(report.safety.admittedRemovals > 0,
    'the run admitted removals, so the floor probe observed some');
  assert.equal(lowestFloor(report), VOTER_READY_FLOOR);
});

test('cadences are stepped by name and no bound expires', async () => {
  const report = await losingReport();
  process.stdout.write('CADENCES STEPPED (losing order) ' +
    `${JSON.stringify(report.steppedCadences)}\n` +
    `elapsed ${report.elapsedMs} ms, shortest armed bound ` +
    `${report.shortestArmedDelayMs} ms\n` +
    'ARMED AND NEVER RUN ' +
    `${JSON.stringify(report.timersThatWouldHaveToExpire)}\n`);
  assert.deepEqual(Object.keys(report.steppedCadences).sort(),
    [...STEPPED_CADENCE_NAMES].sort());
  assert.ok(report.elapsedMs < report.shortestArmedDelayMs);
  assert.deepEqual(report.spentBounds, []);
});

test('sweep: every arrival order releases every admitted joiner and ' +
  'completes the spread', async () => {
  const rows = [];
  for (const {name, order} of SWEEP) {
    const report = await runArrivalOrder(order);
    rows.push({name, report});
  }
  process.stdout.write('ARRIVAL-ORDER SWEEP\n' + rows.map(({name, report}) =>
    `${report.outcome.padEnd(TABLE_PAD)} ${name} ` +
    `stuck=[${report.stuckJoiners}] rounds=${report.rounds} ` +
    `spread=${report.spread.spreadOnDistinctNodes} ` +
    `surplusRemoved=${report.spread.surplusRemoved} ` +
    `unfinished=${report.spread.unfinishedOperations.length} ` +
    `summary=${report.spread.summarySatisfied} ` +
    `removals=${report.safety.admittedRemovals} ` +
    `lowestVoterReady=${lowestFloor(report)} ` +
    `holdRounds=${report.ledgerHold.engagedRounds.length}`).join('\n') +
    '\n');
  for (const {name, report} of rows) {
    assertSafety(report, name);
  }
  const stuck = rows.filter(({report}) => report.outcome !== OUTCOME.RELEASED);
  assert.deepEqual(stuck.map(({name}) => name), [],
    'arrival orders whose admitted joiners never publish READY');
  for (const {name, report} of rows) {
    assertSpreadComplete(report, name);
  }
});
