// The production-composed seed host, CHARGED.
//
// Uncharged, the composed node runs every cadence on time: virtual time is
// link delays and timer cadences only, and the node is never busy. Charged,
// every owner segment the production attribution seam counts costs its
// calibrated microseconds on the node's single core, a busy node's events
// wait for it, and the schedule moves. Four claims, each its own witness:
//
//   the charged scenario reaches the "Cluster formed" counterpart and then
//     REST with no ambient seam reached - the seams that only a charged
//     timeline is long enough to reach are repaired, not tolerated;
//   the charged run is a function of the scenario, like the uncharged one,
//     in exactly what production offers: the same process produces the same
//     strict report and provenance snapshot, the host transcript's
//     boundaries in the same causal order, the same network transcript
//     modulo consensus timing, the same charged owners, and a formation
//     inside the calibrated bound, twice over. The rs-raft core randomizes
//     its own election timeouts (owner decision O2; see
//     networkTranscriptStructure), so the instants, the network schedule and
//     the charge ledger's amounts are not repeatable today; when O2 is funded
//     the exact transcript, ledger and instant assertions come back;
//   charging changes WHEN production runs and never WHO owns it - the
//     provenance snapshot is identical charged and uncharged;
//   charging is off unless a calibration is supplied, and the uncharged run
//     never sees a busy node.
//
// No count, millisecond, gap or rate is a target here. The remeasured rates
// are findings for the correspondence document, not assertions.
//
// One boundary, measured on the frozen E head too: the FIRST handoff scenario
// a process ran used to fire 26 more adapter timers - a 25 ms cadence during
// the partition phase - than every later one. That cadence is the node's
// leader-activation spacing: the shared LeaderActivationScheduler outlived
// the first run's services and kept the first run's clock, so a later run's
// activations queued on a clock nobody advanced (measured 2026-09-23: run 2
// reused run 1's scheduler and time source and ended with 35 activations
// queued). Its users now lease it and the last release drops it, so every
// run starts one on its own clock. The repeatability witness below still
// compares runs after the process's first, and the first run is still the
// strict-and-rest witness.
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {loadCalibration} from './formation-sim-coefficients.js';
import {transcriptCausalOrder} from './formation-sim-host-transcript.js';
import {
  networkTranscriptStructure, runSeedHandoffScenario,
} from './formation-sim-production-seed-host.js';

const NODE_ID = 'node-0';
const REPO_ROOT = new URL('../../', import.meta.url).pathname;
const EXACT_ARTIFACTS = Object.freeze(['strictReport', 'provenanceSnapshot']);
const CLEAN_STRICT = /violations=0 substitutions=0 eligible=true/;
const ZERO = 0;

before(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID}, logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

after(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// Which owners the charge ledger priced: its structure, without the amounts
// consensus timing moves.
function chargedOwners(run) {
  return Object.keys(run.charged.segments)
    .filter((owner) => run.charged.segments[owner] > ZERO).sort();
}

test('the charged seed host reaches formation and then rest, strictly',
  async () => {
    const run = await runSeedHandoffScenario({
      charging: loadCalibration(REPO_ROOT),
    });
    assert.match(run.strictReport, CLEAN_STRICT,
      `no ambient seam is reached on the charged timeline: ${run.strictReport}`);
    assert.equal(run.pendingEventCount, ZERO,
      'after teardown the queue drained to rest');
    assert.ok(run.formationCompleteAtMs > ZERO, 'formation was marked');
    assert.ok(run.nowMs >= run.formationCompleteAtMs,
      'teardown and the drain came after the mark');
    // The charge was real: production owners ran and were priced. Which
    // owners and how much is a finding, not a target.
    const charged = run.charged;
    assert.ok(charged !== null, 'the run charged');
    assert.ok(charged.segments[FORMATION_OWNER.RAFT_PROTOCOL] > ZERO,
      'Raft protocol segments were counted');
    assert.ok(charged.chargedMs[FORMATION_OWNER.RAFT_PROTOCOL] > ZERO,
      'and charged to the node');
    assert.ok(charged.stretches.length > ZERO, 'the node was busy at times');
    // Occupancy defers the schedule: every busy stretch ends after it began
    // and none overlaps the next.
    let previousEnd = -Infinity;
    for (const stretch of charged.stretches) {
      assert.ok(stretch.endMs > stretch.startMs, 'a stretch has extent');
      assert.ok(stretch.startMs >= previousEnd, 'stretches do not overlap');
      previousEnd = stretch.endMs;
    }
  });

test('the charged run is a function of the scenario', async () => {
  const charging = loadCalibration(REPO_ROOT);
  const first = await runSeedHandoffScenario({charging});
  const again = await runSeedHandoffScenario({charging});
  for (const artifact of EXACT_ARTIFACTS) {
    assert.equal(again[artifact], first[artifact],
      `${artifact} is exact across two charged runs`);
  }
  assert.equal(transcriptCausalOrder(again.hostTranscript),
    transcriptCausalOrder(first.hostTranscript),
    'hostTranscript has the same boundaries in the same causal order');
  assert.equal(networkTranscriptStructure(again.networkTranscript),
    networkTranscriptStructure(first.networkTranscript),
    'networkTranscript is structurally equal modulo consensus timing');
  assert.deepEqual(chargedOwners(again), chargedOwners(first),
    'the same owners are charged across two charged runs');
  for (const run of [first, again]) {
    assert.ok(run.formationCompleteAtMs > ZERO &&
      run.formationCompleteAtMs <= charging.formationWindowMs,
    `formation is reached within the calibrated ${charging.formationWindowMs}` +
      ` ms (at ${run.formationCompleteAtMs} ms)`);
  }
});

test('charging moves the schedule, never the ownership', async () => {
  const uncharged = await runSeedHandoffScenario();
  const charged = await runSeedHandoffScenario({
    charging: loadCalibration(REPO_ROOT),
  });
  assert.equal(uncharged.charged, null,
    'without a calibration nothing is charged');
  assert.match(uncharged.strictReport, CLEAN_STRICT,
    'the uncharged run is strictly clean');
  assert.equal(uncharged.pendingEventCount, ZERO,
    'and comes to rest');
  assert.ok(uncharged.scenario.network.nodeBusyUntil(NODE_ID) <= uncharged.nowMs,
    'the uncharged node was never busy: busyUntil never exceeded now');
  // Occupancy delays the mark - charged work waits behind charged work -
  // but the owners of everything that happened are the same owners.
  assert.ok(charged.formationCompleteAtMs > uncharged.formationCompleteAtMs,
    'the charged mark comes later than the uncharged one');
  assert.equal(charged.provenanceSnapshot, uncharged.provenanceSnapshot,
    'the provenance snapshot is identical charged and uncharged');
  assert.notEqual(charged.networkTranscript, uncharged.networkTranscript,
    'while the schedule itself moved');
});
