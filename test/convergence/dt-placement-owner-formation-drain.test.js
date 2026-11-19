// The placement drain of a fresh three-node formation (quest
// replica-placement-admission-owner, design section 4.2, receipt
// reproducer-red-on-candidate). With no timer firing: every membership
// change a formation needs is admitted on a committed change, within
// K_src copies per copy source and K_tgt per target, in one priority order
// (the ledger alone, the priority control plane, then after the published
// formation fact nodes-p1, the other system partitions); a refused move
// waits and is admitted when the change that clears it commits; the drain
// reaches quiescence; and nothing is admitted again when terminal rows are
// delivered twice.
//
// REAL: everything the joint-admission reproducer runs real (join ready
// signal, durable READY heartbeat, readiness, membership publication, the
// rebalance coordinators with their workflow owners, the replica dispatch
// service, the committed serve-eligibility answer), plus every placement
// decider of the tree mounted as its production composition builds it.
// DOUBLES and LIMITS: formation-joint-admission-world.js and
// formation-placement-drain-scenario.js state each boundary.
//
// Every assertion is a property of counts, orders and causes; none names a
// mechanism of the owner that is to replace the deciders of this tree.
// On 219c27bfe plus fixes A and B the deciders admit nothing without a
// timer: the frozen run stops with every partition below its spread, and
// the timer probe then drives the priority phase at four concurrent copies
// from the seed and starts the background wave while nodes-p1 still waits.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {COLUMN, SERVICE_STATUS, WORKFLOW_STEP} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PLACEMENT_MOVE_TYPE} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  LOSING_ORDER,
  SWEEP,
  arrive,
  derive,
} from './formation-joint-admission-scenario.js';
import {
  FIRST_FORMATION_GATED_CLASS,
  K_SRC,
  K_TGT,
  PLACEMENT_CLASS,
  STEP,
  TIMER_OR_POLL_STEPS,
  countBy,
  formatDrainReport,
  runPlacementDrain,
} from './formation-placement-drain-scenario.js';

const LEDGER_PARTITION_ID = 'replica_operations-p1';
const FORMATION_DEPENDENCY_PARTITION_ID = 'nodes-p1';
const FAILED_STEP = WORKFLOW_STEP.FAILED;
// A seed-only partition of RF 3 gains two hosts: two copies.
const COPIES_TO_SPREAD_SEED_ONLY_PARTITION = 2;
const EXAMPLE_LIMIT = 8;
const TABLE_PAD = 9;

const reports = new Map();
function reportOf(name, run) {
  if (!reports.has(name)) reports.set(name, run());
  return reports.get(name);
}
const drainReport = () =>
  reportOf('drain', () => runPlacementDrain(LOSING_ORDER));
// The first create of the ledger's own move fails, as the pre-gate's
// ledger REPLACE did (FAILED, then created again 15 s later).
const failedLedgerCreateReport = () =>
  reportOf('failed-ledger-create', () => runPlacementDrain(LOSING_ORDER,
    {failFirstCreateOf: LEDGER_PARTITION_ID}));

function describeAdmission(entry) {
  return `#${entry.seq} ${entry.type} ${entry.partitionId}>` +
    `${entry.targetNodeId} class ${entry.placementClass} round ` +
    `${entry.round} step ${entry.step}`;
}

function examples(items, describe) {
  return items.slice(0, EXAMPLE_LIMIT).map(describe).join('; ');
}

function isCopy(entry) {
  return entry.type === OperationType.ADD ||
    entry.type === OperationType.REPLACE;
}

test('A1 capacity: unresolved copy-phase operations never exceed K_src ' +
  'per copy source nor K_tgt per target', async () => {
  const report = await drainReport();
  const {ledger} = report;
  const firstOver = ledger.capacityViolations[0];
  assert.deepEqual(ledger.capacityViolations, [],
    `copy-phase operations exceeded capacity (K_src=${K_SRC}, ` +
    `K_tgt=${K_TGT}): max per copy source ` +
    `${JSON.stringify(ledger.maxBySource)}, per target ` +
    `${JSON.stringify(ledger.maxByTarget)}; first at round ` +
    `${firstOver?.round} step ${firstOver?.step} (${firstOver?.side} ` +
    `${firstOver?.nodeId}=${firstOver?.count})`);
});

test('A2 causality: every admission follows a committed change; none is ' +
  'caused by a placement timer or a poll', async () => {
  const report = await drainReport();
  const caused = report.ledger.admissions.filter((entry) =>
    TIMER_OR_POLL_STEPS.has(entry.step));
  assert.deepEqual(caused.map(describeAdmission), [],
    `${caused.length} of ${report.ledger.admissions.length} admissions ` +
    'were made while a placement timer fired or a decider was polled ' +
    `(by step ${JSON.stringify(countBy(report.ledger.admissions,
      (entry) => entry.step))}); in frozen time the run admitted ` +
    `${report.frozen.admissions} with ${report.frozen.spreadDeficits.length}` +
    ` partitions below spread and ${report.frozen.armedPlacementTimerCount}` +
    ' placement timers armed');
});

test('A3 work conservation: no copy source is idle while an admissible ' +
  'copy candidate on it exists', async () => {
  const report = await drainReport();
  const idle = report.idleSources;
  assert.equal(idle.rounds, 0,
    `${idle.rounds} rounds ended with an idle copy source and an ` +
    'admissible copy candidate on it, e.g. ' + examples(idle.examples,
      (example) => `round ${example.round}: ${example.source} idle with ` +
        `${example.candidates.slice(0, 4).join(',')}`));
});

test('A4 quiescence in frozen time: the drain completes with no placement ' +
  'timer firing, no bound spent and mg-1 unchanged', async () => {
  const report = await drainReport();
  process.stdout.write('PLACEMENT DRAIN (losing order)\n' +
    `${formatDrainReport(report)}\n`);
  const {frozen} = report;
  assert.equal(frozen.fixpoint, true,
    `the frozen run reaches a fixpoint within the round cap (${frozen.rounds})`);
  assert.deepEqual(frozen.spreadDeficits, [],
    'every partition is on min(RF, READY) distinct READY voter nodes at ' +
    `the frozen fixpoint (${frozen.spreadDeficits.length}/` +
    `${frozen.partitions} below, ${frozen.admissions} admissions, ` +
    `${frozen.armedPlacementTimerCount} placement timers armed: ` +
    `${JSON.stringify(frozen.armedPlacementTimers)})`);
  assert.equal(frozen.formed, true,
    'the formation fact is published as satisfied in frozen time');
  assert.deepEqual(frozen.surplus, [], 'no surplus replica is left');
  assert.deepEqual(frozen.unresolvedOperations, [],
    'no operation is unresolved at the frozen fixpoint');
  assert.deepEqual(frozen.spentBounds, [],
    'no owner reported a wait bound spent');
  assert.deepEqual(report.messageGroup.final, report.messageGroup.initial,
    'mg-1 keeps its founding placement (design D4)');
  assert.deepEqual(report.ledger.admissions.filter(
    (entry) => entry.messageGroup).map(describeAdmission), [],
  'no message-group operation is admitted (design D4)');
});

test('A5 no churn: a duplicate delivery of every terminal row at a ' +
  'fixpoint admits nothing', async () => {
  const report = await drainReport();
  const admitted = report.redeliveries.flatMap(
    (redelivery) => redelivery.admissions);
  assert.deepEqual(admitted.map(describeAdmission), [],
    'redelivered terminal rows (' + report.redeliveries.map(
      (redelivery) => `${redelivery.redelivered} rows -> ` +
        `${redelivery.admissions.length} admissions`).join(', ') +
    ') admitted operations that were admissible and waiting for an edge');
});

test('A6 order: the formation gate, ledger exclusivity, class order and ' +
  'fewest hosts first', async () => {
  const report = await drainReport();
  const {admissions} = report.ledger;
  const beforeFormed = admissions.filter((entry) =>
    entry.placementClass >= FIRST_FORMATION_GATED_CLASS && !entry.formed);
  const ledgerNotIdle = admissions.filter((entry) =>
    entry.placementClass === PLACEMENT_CLASS.LEDGER &&
    entry.anyUnresolved.length > 0);
  const besideLedger = admissions.filter((entry) =>
    entry.placementClass !== PLACEMENT_CLASS.LEDGER &&
    entry.ledgerUnresolved.length > 0);
  const firstBackground = admissions.find((entry) =>
    entry.placementClass >= FIRST_FORMATION_GATED_CLASS);
  const classOrder = admissions.filter((entry) =>
    entry.higherClassWaiting.length > 0);
  const withinClass = admissions.filter((entry) =>
    entry.sameClassEarlierWaiting.length > 0);
  const violations = {
    gatedClassBeforeFormed: beforeFormed.map(describeAdmission),
    ledgerAdmittedOnBusyLedger: ledgerNotIdle.map(describeAdmission),
    admittedWhileLedgerUnresolved: besideLedger.map(describeAdmission),
    firstBackgroundIsNotNodes: firstBackground &&
      firstBackground.partitionId !== FORMATION_DEPENDENCY_PARTITION_ID ?
      [describeAdmission(firstBackground)] : [],
    admittedWhileHigherClassWaits: classOrder.map((entry) =>
      `${describeAdmission(entry)} while ` +
      `${entry.higherClassWaiting.join(',')} waited`),
    admittedBeforeEarlierInClass: withinClass.map((entry) =>
      `${describeAdmission(entry)} while ` +
      `${entry.sameClassEarlierWaiting.slice(0, 3).join(',')} waited`),
  };
  for (const [name, list] of Object.entries(violations)) {
    violations[name] = list.slice(0, EXAMPLE_LIMIT).concat(
      list.length > EXAMPLE_LIMIT ?
        [`... ${list.length - EXAMPLE_LIMIT} more`] : []);
  }
  assert.deepEqual(violations, {
    gatedClassBeforeFormed: [],
    ledgerAdmittedOnBusyLedger: [],
    admittedWhileLedgerUnresolved: [],
    firstBackgroundIsNotNodes: [],
    admittedWhileHigherClassWaits: [],
    admittedBeforeEarlierInClass: [],
  });
});

test('ledger repair is never starved by lower-class work', async () => {
  for (const [label, report] of [
    ['drain', await drainReport()],
    ['failed ledger create', await failedLedgerCreateReport()],
  ]) {
    const starving = report.ledger.admissions.filter((entry) =>
      entry.higherClassWaiting.includes(LEDGER_PARTITION_ID));
    assert.deepEqual(starving.map(describeAdmission), [],
      `${label}: lower-class operations were admitted while the ledger ` +
      'partition had an admissible move waiting');
  }
});

test('a move whose create FAILED with membership unchanged is admitted ' +
  'again, beside its retained terminal row', async () => {
  const report = await failedLedgerCreateReport();
  const {retry} = report;
  process.stdout.write('FAILED LEDGER CREATE\n' +
    `${formatDrainReport(report)}\nretry: ${JSON.stringify(retry)}\n`);
  assert.ok(retry, 'the ledger move was admitted and its create failed');
  assert.ok(retry.failedAt, 'the failed create left a FAILED terminal row');
  assert.equal(retry.failedRowRetained, true,
    'the FAILED row is retained as it was written');
  const ownTriggers = retry.retries.filter(
    (entry) => entry.step !== STEP.TERMINAL_REDELIVERY);
  assert.ok(ownTriggers.length > 0,
    'the same deficit is admitted again before any terminal row is ' +
    `delivered twice (admitted again: ${JSON.stringify(retry.retries)}; ` +
    `${report.final.spreadDeficits.length} partitions below spread, ` +
    `formed=${report.final.formed})`);
  assert.notEqual(ownTriggers[0].operationId, retry.operationId,
    'the retry is a new operation, not the retained row');
  assert.notEqual(ownTriggers[0].workflowStep, FAILED_STEP,
    'the retried move does not fail');
});

test('A7 accounting: one unresolved operation per partition, no FAILED ' +
  'operation, one copy per host gained', async () => {
  const report = await drainReport();
  const {ledger} = report;
  assert.deepEqual(ledger.laneViolations.slice(0, EXAMPLE_LIMIT), [],
    'never two unresolved operations on one partition');
  assert.deepEqual([...ledger.failedOperations.keys()], [],
    'no placement operation fails');
  const copies = countBy(ledger.admissions.filter(isCopy),
    (entry) => entry.partitionId);
  const overCopied = Object.entries(copies).filter(([, count]) =>
    count > COPIES_TO_SPREAD_SEED_ONLY_PARTITION);
  assert.deepEqual(overCopied, [],
    'a seed-only RF3 partition needs exactly two copies to reach three ' +
    'hosts; none receives more');
  assert.deepEqual(ledger.admissions.filter((entry) =>
    isCopy(entry) && entry.targetReady !== true).map(describeAdmission), [],
  'every copy targets a node holding a READY lease');
});

test('A8 sweep and safety: every arrival order drains in frozen time ' +
  'without a floor violation or an early cluster gate', async () => {
  const rows = [];
  for (const {name, order} of SWEEP) {
    rows.push({name, report: await runPlacementDrain(order,
      {timerProbeCap: 0})});
  }
  process.stdout.write('PLACEMENT DRAIN SWEEP (frozen)\n' + rows.map(
    ({name, report}) => `${String(report.frozen.complete).padEnd(TABLE_PAD)}` +
      ` ${name} rounds=${report.frozen.rounds} formed=` +
      `${report.frozen.formed} admissions=${report.frozen.admissions} ` +
      `belowSpread=${report.frozen.spreadDeficits.length} floor=` +
      `${report.floorViolations.length}`).join('\n') + '\n');
  for (const {name, report} of rows) {
    assert.deepEqual(report.floorViolations, [],
      `${name}: no partition drops below its voter-ready floor`);
    assert.deepEqual(report.safety.openClusterGates, [],
      `${name}: no client-facing cluster gate opens before the spread`);
    assert.deepEqual(report.safety.summaryAheadOfRows, [],
      `${name}: the summary never states a spread the rows lack`);
  }
  assert.deepEqual(rows.filter(({report}) => !report.frozen.complete)
    .map(({name, report}) => `${name}: ` +
      `${report.frozen.spreadDeficits.length} below spread`), [],
  'every arrival order completes the drain in frozen time');
});

test('WP-F1/WP-F2 single-voter founding & odd-voter growth witness: 1 voter on seed -> ' +
  'ADD learner j1 -> ADD learner j2 -> GROWTH_PROMOTE (1 -> 3 voters) with zero REPLACE/REMOVE, ' +
  'zero even voter sets, zero co-location, and 2-host window stability (F1-F5)', async () => {
  // F5: 2-host window (seed + j1 only, j2 withheld) converges priority partitions to
  // 1 voter on seed + 1 caught-up learner on j1 with zero GROWTH_PROMOTE and zero even voter sets:
  const twoHostReport = await runPlacementDrain([arrive('j1'), derive()], {
    singleVoterFounding: true,
    timerProbeCap: 0,
  });
  assert.deepEqual(twoHostReport.evenVoterViolations, [],
    'F2/F5: no even voter set is ever committed in the 2-host window');
  assert.deepEqual(twoHostReport.colocationViolations, [],
    'F1/F5: no co-located partition replicas in the 2-host window');
  const twoHostTypes = countBy(twoHostReport.ledger.admissions, (entry) => entry.type);
  assert.deepEqual(twoHostTypes, {[OperationType.ADD]: 6},
    'F5: in the 2-host window, only the 6 priority partitions admit 1 learner ADD each onto j1 (0 PROMOTE/REPLACE/REMOVE)');
  const ledgerServicesAtTwoHosts = twoHostReport.servicesSnapshot
    .filter((row) => row[COLUMN.PARTITION_ID] === LEDGER_PARTITION_ID)
    .map((row) => `${row[COLUMN.NODE_ID]}:${row[COLUMN.STATUS]}:${row[COLUMN.RAFT_ROLE]}`)
    .sort();
  assert.deepEqual(ledgerServicesAtTwoHosts, [
    `j1:${SERVICE_STATUS.ACTIVE}:${RAFT_ROLE.LEARNER}`,
    `seed:${SERVICE_STATUS.ACTIVE}:${RAFT_ROLE.LEADER}`,
  ], 'F5: ledger partition holds 1 active voter on seed and 1 caught-up learner on j1');

  // F1-F4: Full 3-host formation from 1 founding voter on seed (LOSING_ORDER):
  const report = await runPlacementDrain(LOSING_ORDER, {
    singleVoterFounding: true,
  });
  process.stdout.write('SINGLE-VOTER FOUNDING & ODD-GROWTH DRAIN (losing order)\n' +
    `${formatDrainReport(report)}\n`);
  const {frozen, ledger} = report;
  assert.equal(frozen.fixpoint, true, 'F4: reaches frozen fixpoint');
  assert.equal(frozen.formed, true, 'F4: formation latch transitions to FORMED in frozen time');
  assert.equal(frozen.complete, true, 'F4: all 46 partitions reach 3 voters on 3 hosts');
  assert.deepEqual(frozen.spreadDeficits, [], 'F4: zero spread deficits remain');
  assert.deepEqual(frozen.surplus, [], 'F4: zero surplus replicas remain');
  assert.deepEqual(frozen.unresolvedOperations, [], 'F4: zero unresolved operations remain');
  assert.deepEqual(report.evenVoterViolations, [],
    'F2: no partition ever has an even voter count (1 -> 3 directly)');
  assert.deepEqual(report.colocationViolations, [],
    'F1: no partition ever has two replicas on the same host');
  assert.deepEqual(ledger.capacityViolations, [],
    'A1: copy capacity K_src=3, K_tgt=2 respected throughout learner ADD phase');
  assert.deepEqual(ledger.laneViolations, [],
    'A7: never two unresolved operations on one partition');
  const byType = countBy(ledger.admissions, (entry) => entry.type);
  assert.deepEqual(byType, {
    [OperationType.ADD]: frozen.partitions * 2,
    [PLACEMENT_MOVE_TYPE.GROWTH_PROMOTE]: frozen.partitions,
  }, 'F3: exactly 2 learner ADDs and 1 GROWTH_PROMOTE per partition, zero REPLACE and zero REMOVE');
  for (const partitionId of [LEDGER_PARTITION_ID, FORMATION_DEPENDENCY_PARTITION_ID, 'services-p1']) {
    const seq = ledger.admissions
      .filter((entry) => entry.partitionId === partitionId)
      .map((entry) => entry.type);
    assert.deepEqual(seq, [
      OperationType.ADD,
      OperationType.ADD,
      PLACEMENT_MOVE_TYPE.GROWTH_PROMOTE,
    ], `F3: ${partitionId} executes ADD learner -> ADD learner -> GROWTH_PROMOTE`);
  }
  assert.deepEqual(
    report.redeliveries.flatMap((redelivery) => redelivery.admissions),
    [],
    'A5: terminal row redelivery at fixpoint admits nothing',
  );
  assert.deepEqual(report.messageGroup.final, report.messageGroup.initial,
    'F4: mg-1 keeps its founding placement');
});
