// formation-sim slice 1: the runner is deterministic (one seed, one byte
// stream), refuses to start without a calibrated owner set, throws on an
// ambient clock or timer read inside an owner dispatch, and emits the live
// report shape with formationMetrics through the shared verdict function.
//
// Adapter contract (constraint real-owners): the staged cohort adapts
// LifeRaft's request/reply transport onto the virtual network and stages
// membership by the scenario's join schedule; it simplifies real transport
// (no framing, no reconnects, fixed link delay, no seeded loss yet) and
// stubs LifeRaft's log `write` to acknowledge at once (no apply work: the
// raft_apply seam belongs to a later slice); it never decides anything
// Raft decides (elections, terms, leadership are LifeRaft's own). The
// deterministic guard covers the synchronous prefix of each dispatch.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {ChargeAccumulator} from './formation-sim-charge.js';
import {GapObserver} from './formation-sim-gap-observer.js';
import {observeHeartbeat} from '../../src/diagnostics/event-loop-gap-watchdog.js';
import {
  CalibrationRefusal, REFUSAL, REQUIRED_OWNERS, loadCalibration,
} from './formation-sim-coefficients.js';
import {
  NONDETERMINISTIC_OWNER_SEAM,
  guardedDispatch,
  installDeterministicOwnerGuard,
} from './formation-sim-guard.js';
import {OwnerTurnMeter} from './formation-sim-owner-passes.js';
import {
  runFormationOwner,
  runOnExecutionNode,
  runOnSimulationGenerationRoot,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {DECISION_GRADE, REPORT_FILE, decisionGrade, writeReport} from './formation-sim-report.js';
import {SCENARIO, simulate} from './formation-sim-runner.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEED = 7;
const OTHER_SEED = 8;
const NODE_COUNT = 5;
const LIVE_REPORT = 'test/simulation/calibration/seed-owner-costs.report.json';
const ACKNOWLEDGEMENT = 'witness: reads the superseded table deliberately';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'formation-sim-test-'));
}

function calibrationFixture(mutate) {
  const dir = tempDir();
  const parsed = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'test/simulation/calibration/formation-seed-2026-09-13.json'), 'utf8'));
  mutate(parsed);
  const relative = 'calibration.json';
  fs.writeFileSync(path.join(dir, relative), JSON.stringify(parsed));
  return {root: dir, relative};
}

test('one seed produces one byte stream; another seed produces another', async () => {
  const first = await simulate(SEED);
  const second = await simulate(SEED);
  const other = await simulate(OTHER_SEED);
  assert.deepEqual(first, second, 'same seed, same report object');
  const dirs = [tempDir(), tempDir()];
  writeReport(dirs[0], first);
  writeReport(dirs[1], second);
  assert.deepEqual(fs.readFileSync(path.join(dirs[0], REPORT_FILE)),
    fs.readFileSync(path.join(dirs[1], REPORT_FILE)), 'same bytes on disk');
  assert.notDeepEqual(first.formationMetrics.nodes, other.formationMetrics.nodes,
    'the seed reaches the election timing');
  for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
});

test('the report carries the live shape and every node charged per owner', async () => {
  const report = await simulate(SEED);
  const live = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, LIVE_REPORT), 'utf8'));
  for (const key of ['scenario', 'producer', 'fidelity', 'formationVerdict', 'timestamp']) {
    assert.ok(key in report, `live report key ${key}`);
    assert.ok(key in live, `fixture has ${key}`);
  }
  assert.equal(report.fidelity, 'simulation');
  assert.equal(typeof report.producer, typeof live.producer, 'producer keeps the live type');
  assert.equal(report.formationVerdict.schemaVersion, live.formationVerdict.schemaVersion,
    'the verdict is derived by the same function as the live one');
  assert.equal(report.formationVerdict.attribution.source, 'window');
  const metrics = report.formationMetrics;
  assert.equal(metrics.nodes.length, NODE_COUNT);
  assert.equal(metrics.nodes.filter((node) => node.role === 'seed').length, 1);
  assert.ok(metrics.clusterFormedAtMs > metrics.fifthJoinAtMs, 'formed after the fifth join');
  assert.equal(metrics.fifthJoinAtMs - metrics.formationStartedAtMs, SCENARIO.joinAtMs.at(-1));
  for (const node of metrics.nodes) {
    assert.deepEqual(Object.keys(node.ownerChargedMs).sort(), [...REQUIRED_OWNERS].sort());
  }
  const seed = metrics.nodes.find((node) => node.role === 'seed');
  assert.ok(seed.ownerSegments[FORMATION_OWNER.RAFT_PROTOCOL] > 0,
    'the seed\'s Raft timers and inbound packets are charged as raft_protocol segments');
  // Every group has one leader; which node leads is LifeRaft's decision under
  // the charged clock (a starved seed can lose a group's leadership to a
  // joiner, the migration the live formation shows), not the harness's.
  assert.ok(metrics.groups.every((group) => typeof group.leaderId === 'string'),
    'every system-partition group has a leader after formation');
  assert.ok(!JSON.stringify(report).includes(os.tmpdir()), 'no workspace path in the bytes');
});

test('the runner refuses an uncalibrated owner set before it starts', () => {
  assert.throws(() => loadCalibration(REPO_ROOT, 'test/simulation/absent.json', ACKNOWLEDGEMENT),
    (error) => error instanceof CalibrationRefusal && error.code === REFUSAL.MISSING);
  const negative = calibrationFixture((parsed) => {
    parsed.owners[FORMATION_OWNER.REBALANCER].usPerSegment = -1;
  });
  assert.throws(() => loadCalibration(negative.root, negative.relative, ACKNOWLEDGEMENT),
    (error) => error.code === REFUSAL.INVALID);
  const absentOwner = calibrationFixture((parsed) => {
    delete parsed.owners[FORMATION_OWNER.READINESS];
  });
  assert.throws(() => loadCalibration(absentOwner.root, absentOwner.relative, ACKNOWLEDGEMENT),
    (error) => error.code === REFUSAL.INVALID, 'a missing owner never costs zero silently');
  const unbound = calibrationFixture((parsed) => {
    delete parsed.source.report;
  });
  assert.throws(() => loadCalibration(unbound.root, unbound.relative, ACKNOWLEDGEMENT),
    (error) => error.code === REFUSAL.SOURCE_UNBOUND);
  const table = loadCalibration(REPO_ROOT, undefined, ACKNOWLEDGEMENT);
  assert.ok(table.costTable.cost(`owner:${FORMATION_OWNER.RAFT_APPLY}`, 4) > 0,
    'four apply segments cost whole virtual milliseconds');
});

// A calibration measured under different attribution semantics is not a
// calibration for these ones. It may still be read, but only deliberately.
test('a superseded calibration is refused unless the caller says what it is for',
  () => {
    assert.throws(() => loadCalibration(REPO_ROOT),
      (error) => error instanceof CalibrationRefusal &&
        error.code === REFUSAL.SUPERSEDED,
      'the committed table is not consumed as current coefficients by default');
    const acknowledged = loadCalibration(REPO_ROOT, undefined, ACKNOWLEDGEMENT);
    assert.equal(acknowledged.supersession.quantitativeCorrespondence,
      'superseded',
      'and what it is is carried on the loaded object, not hidden');
    const current = calibrationFixture((parsed) => {
      delete parsed.supersession;
    });
    assert.equal(loadCalibration(current.root, current.relative).supersession,
      null, 'a calibration with no supersession record loads without one');
  });

test('busy stretches never overlap: gap time is bounded by charged time', () => {
  const calibration = loadCalibration(REPO_ROOT, undefined, ACKNOWLEDGEMENT);
  const network = createVirtualNetwork({costTable: calibration.costTable, startMs: 0});
  network.registerNode('n', () => {});
  const charges = new ChargeAccumulator({network, calibration});
  // 1200 readiness segments at ~1.88 ms each open one long stretch...
  charges.segment('n', FORMATION_OWNER.READINESS, 1200);
  // ...and ten later single segments extend it rather than each re-counting
  // the whole backlog as a fresh gap.
  for (let index = 0; index < 10; index += 1) charges.segment('n', FORMATION_OWNER.READINESS);
  const charged = charges.ownerChargedMs('n', REQUIRED_OWNERS)[FORMATION_OWNER.READINESS];
  const gaps = charges.gapsFor('n');
  assert.equal(gaps.length, 1, 'one contiguous stretch');
  assert.equal(charges.gapMsFor('n'), charged, 'the gap is exactly the charged time');
  assert.equal(network.nodeBusyUntil('n'), charged, 'and exactly the node\'s backlog');
  assert.deepEqual(Object.keys(gaps[0].owners), [FORMATION_OWNER.READINESS]);
  // A charge below the threshold (four apply segments, about 1.3 ms) is busy
  // time, not a gap.
  network.run({untilMs: charged + 1});
  charges.segment('n', FORMATION_OWNER.RAFT_APPLY, 4);
  assert.equal(charges.gapsFor('n').length, 1, 'a 1 ms charge opens no gap');
  assert.ok(charges.ownerChargedMs('n', REQUIRED_OWNERS)[FORMATION_OWNER.RAFT_APPLY] > 0);
});

test('deterministic mode refuses ambient time and timers while executing as a node',
  async () => {
    // The authority is the formation execution context - a generation and an
    // execution node - not the dispatch wrapper. A dispatch used to establish
    // production identity of its own, and the two answers disagreed:
    // construction, seeding and any continuation released outside a dispatch
    // carried the node frame without the tag and were treated as harness work.
    // Owner attribution stays orthogonal, so the refusal does not depend on
    // one being named.
    const owner = FORMATION_OWNER.BOOTSTRAP;
    const asNode = (body) => runOnSimulationGenerationRoot('runner-witness/1',
      () => runOnExecutionNode('node-0', () => guardedDispatch(owner, body)));
    installDeterministicOwnerGuard();
    await assert.rejects(async () => asNode(() => Date.now()),
      (error) => error.code === NONDETERMINISTIC_OWNER_SEAM &&
        error.owner === owner);
    await assert.rejects(async () => asNode(() => setTimeout(() => {}, 1)),
      (error) => error.code === NONDETERMINISTIC_OWNER_SEAM);
    await assert.rejects(async () => asNode(() => globalThis.performance.now()),
      (error) => error.code === NONDETERMINISTIC_OWNER_SEAM);
    assert.equal(await asNode(() => 42), 42,
      'a clean dispatch returns its value');
    assert.equal(typeof Date.now(), 'number',
      'and harness code outside the node context keeps the real clock');
    assert.equal(await asNode(() => guardedDispatch(owner, () => 1)), 1,
      'nested dispatches are re-entrant');
  });

// Owner amendment 3 (2026-09-14): charging is only meaningful if occupancy
// blocks. Each clause below is a separate way a scheduler can look right and
// be wrong, so each is asserted on its own.
test('scheduler causality: per-node availability, deferral, order and delivery', () => {
  const calibration = loadCalibration(REPO_ROOT, undefined, ACKNOWLEDGEMENT);
  const network = createVirtualNetwork({costTable: calibration.costTable, startMs: 0});
  const fired = [];
  network.registerNode('a', () => {});
  network.registerNode('b', (message) => fired.push({at: network.now(), ...message}));
  const charges = new ChargeAccumulator({network, calibration});
  // Clause 1: busyUntil is per node. Charging a leaves b available.
  charges.segment('a', FORMATION_OWNER.READINESS, 1200);
  const busyUntil = network.nodeBusyUntil('a');
  assert.equal(busyUntil, 2255, 'clause 2: the segment advanced this node by its charged time');
  assert.equal(network.nodeBusyUntil('b'), 0,
    'clause 1: charging one node does not make the other busy');
  // Clauses 3 to 5. Both become logically due at 5 ms, while a is busy: the
  // timer belongs to a, the message leaves a for b, and b is idle throughout.
  network.setTimer('a', () => fired.push({at: network.now(), type: 'timer'}), 5);
  network.send({from: 'a', to: 'b', type: 'message', delayMs: 5});
  network.run({untilMs: busyUntil * 2});
  const timer = fired.find((entry) => entry.type === 'timer');
  const delivered = fired.find((entry) => entry.type === 'message');
  assert.ok(timer && delivered, 'both eventually run');
  // Exact, not lower-bounded: a scheduler that simply ran everything at the
  // end of the drain would satisfy a >= assertion.
  assert.equal(timer.at, busyUntil,
    'clause 3: work due while the node is busy runs the instant it is available');
  assert.equal(delivered.at, busyUntil + 5,
    'clause 5: delivery is the sender\'s completion plus the link delay');
  assert.deepEqual(fired.map((entry) => entry.type), ['timer', 'message'],
    'clause 4: the earliest causally runnable event goes first, and b was idle ' +
    'the whole time, so the order is the senders\' availability, not the queue\'s');
});

test('every exclusive segment is charged once: the pass\'s own turn and each handoff', async () => {
  const calibration = loadCalibration(REPO_ROOT, undefined, ACKNOWLEDGEMENT);
  const network = createVirtualNetwork({costTable: calibration.costTable, startMs: 0});
  network.registerNode('n', () => {});
  const charges = new ChargeAccumulator({network, calibration});
  const meter = new OwnerTurnMeter({network, charges});
  // The seam's window is process-wide, so a failing assertion must not leave
  // it open for the next test.
  test.after(() => meter.stop());
  const segments = () => charges.ownerSegments('n', REQUIRED_OWNERS);
  // A synchronous pass with no handoff is still one exclusive segment. The
  // seam counts a handoff only inside an open segment, so the outermost
  // dispatch counts neither a dispatch nor a handoff and this used to cost
  // nothing at all.
  await meter.pass('n', FORMATION_OWNER.ADMIN, () => 1);
  assert.equal(segments()[FORMATION_OWNER.ADMIN], 1,
    'a synchronous pass charges its own owner exactly one segment');
  // A synchronous handoff costs the destination owner one segment, and the
  // enclosing owner still exactly its own.
  const before = {...segments()};
  await meter.pass('n', FORMATION_OWNER.REBALANCER, () => {
    runFormationOwner(FORMATION_OWNER.RAFT_APPLY, () => true);
    return 1;
  });
  const after = segments();
  assert.equal(after[FORMATION_OWNER.RAFT_APPLY] - before[FORMATION_OWNER.RAFT_APPLY], 1,
    'the destination owner is charged once for the handoff');
  // One handoff means three exclusive segments: the enclosing prefix (this
  // pass's own, which the seam does not count because the outermost dispatch
  // is at depth zero), the destination's, and the enclosing resumption the
  // seam counts when the pass's body settles.
  assert.equal(after[FORMATION_OWNER.REBALANCER] - before[FORMATION_OWNER.REBALANCER], 2,
    'the enclosing owner is charged its prefix and its resumption, and nothing more');
  // Three handoffs cost three destination segments, not one and not six.
  const beforeThree = {...segments()};
  await meter.pass('n', FORMATION_OWNER.REBALANCER, () => {
    for (let index = 0; index < 3; index += 1) {
      runFormationOwner(FORMATION_OWNER.TRANSPORT, () => true);
    }
    return 1;
  });
  const three = segments();
  assert.equal(three[FORMATION_OWNER.TRANSPORT] - beforeThree[FORMATION_OWNER.TRANSPORT], 3,
    'the count is dispatchCount + handoffCount, one per handoff');
  // The enclosing owner is charged 2 here as well, not 4: the seam counts one
  // resumption for the pass however many handoffs it made. The live
  // calibration was counted through this same seam, so simulator and
  // calibration undercount identically, which is what reproduction needs;
  // whether the seam SHOULD count a resumption per handoff is recorded as an
  // open question on the quest log.
  assert.equal(three[FORMATION_OWNER.REBALANCER] - beforeThree[FORMATION_OWNER.REBALANCER], 2,
    'the enclosing owner is charged one resumption per pass, not one per handoff');
});

test('an owner the calibration never observed fails closed instead of costing zero', () => {
  const calibration = loadCalibration(REPO_ROOT, undefined, ACKNOWLEDGEMENT);
  assert.equal(calibration.owners[FORMATION_OWNER.WORKER_DISPATCH].calibrated, false,
    'worker_dispatch was measured at 0 turns, so it has no mean');
  assert.equal(calibration.owners[FORMATION_OWNER.WORKER_DISPATCH].usPerSegment, null,
    'and its cost is absent, not zero');
  const network = createVirtualNetwork({costTable: calibration.costTable, startMs: 0});
  network.registerNode('n', () => {});
  const charges = new ChargeAccumulator({network, calibration});
  assert.throws(() => charges.segment('n', FORMATION_OWNER.WORKER_DISPATCH),
    (error) => error.code === REFUSAL.UNCALIBRATED_OWNER,
    'a segment on an unmeasured owner refuses the run');
  // A measured owner whose file entry claims a zero mean is a broken
  // calibration, not a free owner.
  const zeroMean = calibrationFixture((parsed) => {
    parsed.owners[FORMATION_OWNER.TRANSPORT].usPerSegment = 0;
  });
  assert.throws(() => loadCalibration(zeroMean.root, zeroMean.relative,
    ACKNOWLEDGEMENT),
  (error) => error.code === REFUSAL.INVALID);
});

test('the unattributed residual is carried as a band and never priced', async () => {
  const calibration = loadCalibration(REPO_ROOT, undefined, ACKNOWLEDGEMENT);
  assert.ok(calibration.residualPercent > 0,
    'the calibration window records the share no owner claimed');
  const report = await simulate(SEED);
  const band = report.formationMetrics.calibrationResidual;
  assert.equal(band.unattributedPercent, calibration.residualPercent);
  assert.equal(band.priced, false, 'the residual is never given a cost');
  // No owner absorbs it: the owner costs sum to the charged time alone.
  const seed = report.formationMetrics.nodes.find((node) => node.role === 'seed');
  const charged = Object.values(seed.ownerChargedMs).reduce((sum, ms) => sum + ms, 0);
  assert.ok(charged <= seed.windowMs,
    'charged owner time never exceeds the window by absorbing the residual');
  // A claimed advantage inside the band is reported as not decision-grade.
  assert.equal(decisionGrade(calibration.residualPercent / 2,
    calibration.residualPercent), DECISION_GRADE.NOT_GRADE);
  assert.equal(decisionGrade(calibration.residualPercent,
    calibration.residualPercent), DECISION_GRADE.NOT_GRADE,
  'an advantage exactly the size of the residual is not decision-grade either');
  assert.equal(decisionGrade(calibration.residualPercent * 2,
    calibration.residualPercent), DECISION_GRADE.GRADE);
  assert.equal(decisionGrade(Number.NaN, calibration.residualPercent),
    DECISION_GRADE.NOT_GRADE, 'an unmeasured advantage is never decision-grade');
});

// Owner decision 2026-09-14: the signature means watchdog-observed gap
// fraction, never busy fraction, and the simulated observer must reproduce
// the production rule rather than derive a gap from charged work.
test('the gap observer is the production heartbeat rule, not charged work', () => {
  // The rule itself, shared with the live watchdog: lateness against the
  // expectation, and the next expectation set from when the callback ACTUALLY
  // ran, so one long block reports one gap rather than a backlog of them.
  const late = observeHeartbeat({
    expectedAtMs: 250, nowMs: 1450, intervalMs: 250, thresholdMs: 1000,
  });
  assert.equal(late.gapMs, 1200);
  assert.equal(late.exceeded, true);
  assert.equal(late.nextExpectedAtMs, 1700,
    'the next expectation comes from the callback time, not the due time');
  const punctual = observeHeartbeat({
    expectedAtMs: 250, nowMs: 260, intervalMs: 250, thresholdMs: 1000,
  });
  assert.equal(punctual.exceeded, false, 'a 10 ms late beat is not a gap');

  const calibration = loadCalibration(REPO_ROOT, undefined, ACKNOWLEDGEMENT);
  const network = createVirtualNetwork({costTable: calibration.costTable, startMs: 0});
  network.registerNode('busy', () => {});
  network.registerNode('blocked', () => {});
  const charges = new ChargeAccumulator({network, calibration});
  const observer = new GapObserver({network, charges});
  observer.start('busy');
  observer.start('blocked');
  // 'blocked' takes one long segment; 'busy' takes many short ones, each well
  // under the threshold, separated by the time they occupy. Both end up with
  // a high busy fraction; only one of them blocked its heartbeat.
  charges.segment('blocked', FORMATION_OWNER.READINESS, 1200);
  for (let index = 0; index < 12; index += 1) {
    charges.segment('busy', FORMATION_OWNER.READINESS, 100);
    network.run({untilMs: network.nodeBusyUntil('busy') + 10});
  }
  network.run({untilMs: 4000});
  const busyMs = (nodeId) => Object.values(
    charges.ownerChargedMs(nodeId, REQUIRED_OWNERS)).reduce((sum, ms) => sum + ms, 0);
  assert.ok(busyMs('busy') > 2000, 'the short-slice node is genuinely busy');
  assert.equal(observer.gapMsFor('busy'), 0,
    'many sub-second slices are a high busy fraction and no watchdog gap');
  assert.ok(observer.gapMsFor('blocked') >= 1000,
    'one long slice blocks the heartbeat and is a gap');
  assert.equal(observer.gapsFor('blocked').length, 1,
    'one block is one gap, not a backlog of missed beats');
});

// Owner decision 2026-09-14: the harness must not own a readiness cadence.
// Production owners produce behaviour and rates; the simulator owns
// scheduling and charging only. This is a STRUCTURAL falsifier, so a later
// slice cannot quietly reintroduce a harness-local readiness loop.
test('the runner has no authority to schedule or evaluate readiness periodically', () => {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, 'test/simulation/formation-sim-runner.js'), 'utf8');
  const passes = fs.readFileSync(
    path.join(REPO_ROOT, 'test/simulation/formation-sim-owner-passes.js'), 'utf8');
  for (const [name, text] of [['runner', source], ['owner passes', passes]]) {
    assert.ok(!/getNodeReadiness/u.test(text),
      `the ${name} calls the readiness owner directly; a production initiator must`);
    assert.ok(!/ownerPassEveryMs|readinessEveryMs|readinessIntervalMs/u.test(text),
      `the ${name} declares a readiness cadence of its own`);
  }
  // A cadence constant anywhere in the simulator is the same defect wearing a
  // different name, so the scenario itself may not carry one either.
  assert.ok(!Object.keys(SCENARIO).some((key) => /readiness|ownerPass/iu.test(key)),
    `the scenario declares a readiness cadence: ${Object.keys(SCENARIO).join(', ')}`);
});
