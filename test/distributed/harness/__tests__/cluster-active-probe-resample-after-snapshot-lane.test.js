// Deterministic witnesses for the cluster-active-probe-resample-after-snapshot-
// lane quest. They drive the REAL harness owner path
// (Cluster._waitForAllActive -> pollUntilCondition ->
// _probeClusterActiveState -> joinActiveProbeAttemptAtDeadline) on a virtual
// clock (node:test mock timers for Date + setTimeout) with fake node probes
// and a fake seed snapshot lane that replay the 2026-08-30T14-05-20 MovieLens
// run: W = setup.cluster.waiting-active, poll loop start W+0.4, deadline
// W+60.4, node-2 admin listener open at W+52.4, attempt 6 issued at W+49.2
// with a 10.8 s snapshot lane. Every listener/lane instant below is that run's
// W-relative timeline expressed against the poll start.
//
// Raw node:test so each top-level scenario is selectable with
// --test-name-pattern (the quest evidence harness runs them one by one).

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {createCluster, NODE_ROLES} from './cluster-test-helpers.js';
import {CLUSTER_BASE_LAYER} from '../cluster-base-layer.js';
import {PRIORITY_RECOVERY_ACTIVE_GATE_STATE} from '../active-gate-contract.js';
import {TIMEOUTS} from '../constants.js';
import {
  ACTIVE_PROBE_RESAMPLE_ADMISSION,
  ACTIVE_PROBE_SAMPLE_ORIGIN,
  ACTIVE_PROBE_SNAPSHOT_LANE_DEADLINE_BOUNDED_REASON,
  ACTIVE_PROBE_SNAPSHOT_LANE_OUTCOME,
  orphanedSnapshotLaneSettlements,
} from '../cluster-class-active-probe-attempt-join.js';
import {
  selectStartupActiveGateOwnerProgressContinuation,
  selectStartupActiveGateSnapshotRepairContinuation,
} from '../cluster-active-wait-loop.js';

const {
  ACTIVE_POLL_INTERVAL_MS,
  ACTIVE_WAIT_NO_PROGRESS_REASON_CODE,
  ACTIVE_WAIT_PROGRESS_OBSERVED_REASON_CODE,
} = CLUSTER_BASE_LAYER;

// ── run identity (forensics9/movielens-14-05-20.md) ────────────────────────
const RUN_POLL_START_AFTER_W_MS = 400;
const CERTIFICATION_WINDOW_MS = 60_000;
const EXPECTED_ACTIVE_POLL_INTERVAL_MS = 1000;
const EXPECTED_FORCE_REPAIR_AFTER_MS = 10_000;
const CLUSTER_SIZE = 5;
const NODE_SEED = 'a9e7fbd4-seed';
const NODE_N1 = '33a82b1f-n1';
const NODE_N2 = '8fb678b1-n2';
const NODE_N3 = 'e2e3fc2d-n3';
const NODE_N4 = '25d1179a-n4';
const NODE_IDS = Object.freeze([NODE_SEED, NODE_N2, NODE_N3, NODE_N4, NODE_N1]);
// Admin listener open instants, W-relative (node-{0..4}.log "Admin WebSocket
// API started").
const LISTENER_OPEN_AFTER_W_MS = Object.freeze({
  [NODE_SEED]: 0,
  [NODE_N3]: 28_100,
  [NODE_N1]: 32_200,
  [NODE_N4]: 46_900,
  [NODE_N2]: 52_400,
});
const NODE_2_LISTENER_AFTER_DEADLINE_W_MS = 60_500;
// With re-sampling, attempt 5's re-sample lands at W+48.2; a node-4 listener
// opening after that instant and before attempt 6 (W+49.2) makes the active
// count rise 3->4 ON the final attempt.
const NODE_4_LISTENER_BEFORE_ATTEMPT_6_W_MS = 48_500;
const NODE_4_EARLY_LISTENER_W_MS = 39_000;
const LISTENER_NEVER_OPENS_MS = Number.POSITIVE_INFINITY;
// Seed snapshot lane durations per attempt: the first five place attempt 6 at
// W+49.2 (each attempt = lane + the 1 s poll interval); attempt 6 is the run's
// 10.8 s forced-repair lane, which ends at W+60.0 (before the W+60.4 deadline).
const RUN_LANE_DURATIONS_MS = Object.freeze([
  8000, 8800, 9000, 9000, 9000, 10_800,
]);
const RUN_ATTEMPT_6_START_AFTER_W_MS = 49_200;
const RUN_ATTEMPT_6_INDEX = 6;
const RUN_LANE_6_END_AFTER_W_MS = 60_000;
const LANE_OVERRUNS_DEADLINE_DURATIONS_MS = Object.freeze([
  8000, 8800, 9000, 9000, 9000, 12_000,
]);
const ALL_ACTIVE_LANE_DURATIONS_MS = Object.freeze([3000]);
const ALL_ACTIVE_ATTEMPTS = 1;
const ALL_ACTIVE_ELAPSED_MS = 3000;
const IMMEDIATE_LANE_DURATIONS_MS = Object.freeze([0]);
const PAST_DEADLINE_OFFSET_MS = 100;
const ACTIVE_COUNT_BEFORE_LAST_ATTEMPT = 3;
const ACTIVE_COUNT_AT_VERDICT_HEAD = 4;
const ACTIVE_COUNT_ALL = 5;
const SINGLE_PROBE = 1;
const FIRST_ATTEMPT_ACTIVE_COUNT = 1;
// ── virtual clock ──────────────────────────────────────────────────────────
const BASE_EPOCH_MS = 1_777_976_838_000;
const CLOCK_STEP_MS = 100;
const CLOCK_MAX_VIRTUAL_MS = 130_000;
const FLUSH_ROUNDS = 8;
const MOCKED_TIMER_APIS = Object.freeze(['Date', 'setTimeout']);
// ── fake node answers ──────────────────────────────────────────────────────
const HTTP_OK = 200;
const READINESS_PHASE_DEGRADED = 'DEGRADED';
const READINESS_REASON_RECOVERY_PENDING =
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING';
const ADMIN_HEALTH_SOURCE = 'admin_health';
const ADMIN_REFUSED_ERROR = 'connect ECONNREFUSED 34.116.216.166:8091';
const EMPTY_LOG = '';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const PUBLICATION_EPOCH = 2;
const DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const IMAGE = 'distributed-db:test';
const REASON_CODE_PROGRESS_OBSERVED = 'progress_observed';
const REASON_CODE_STALLED = 'stalled_no_progress';
const VIRTUAL_CLOCK_EXHAUSTED = 'virtual clock exhausted before settlement';
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);

function wToPoll(wRelativeMs) {
  return wRelativeMs - RUN_POLL_START_AFTER_W_MS;
}

async function flushEventLoop() {
  for (let round = 0; round < FLUSH_ROUNDS; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function runOnVirtualClock(t, run) {
  t.mock.timers.enable({apis: [...MOCKED_TIMER_APIS], now: BASE_EPOCH_MS});
  let outcome = null;
  const settled = run().then(
    (value) => {
      outcome = {ok: true, value, error: null};
    },
    (error) => {
      outcome = {ok: false, value: null, error};
    },
  );
  let advancedMs = 0;
  while (outcome === null) {
    await flushEventLoop();
    if (outcome !== null) {
      break;
    }
    if (advancedMs >= CLOCK_MAX_VIRTUAL_MS) {
      throw new Error(VIRTUAL_CLOCK_EXHAUSTED);
    }
    t.mock.timers.tick(CLOCK_STEP_MS);
    advancedMs += CLOCK_STEP_MS;
  }
  await settled;
  return outcome;
}

function virtualDelay(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSnapshotCoverage(expectedNodeIds, forceRepair) {
  return {
    completeCoverage: true,
    expectedNodeCount: expectedNodeIds.length,
    bestCoverageNodeCount: expectedNodeIds.length,
    forceRepair,
    selectedNodeId: NODE_SEED,
    selectedSnapshotNodeId: NODE_SEED,
    selectedAdminReady: true,
    selectedSnapshotAdminReady: true,
    selectedReachable: true,
    selectedReachableBy: ADMIN_HEALTH_SOURCE,
    selectedError: null,
    selectedReachabilityError: null,
    selectedObservedNodeIds: [...expectedNodeIds],
    selectedPublishedActiveNodeIds: [...expectedNodeIds],
    selectedPublicationConvergence: {
      publicationStatus: PUBLICATION_STATUS_PUBLISHED,
      publicationEpoch: PUBLICATION_EPOCH,
      publishedActiveNodeIds: [...expectedNodeIds],
      pendingAckNodeIds: [],
      acknowledgedNodeIds: [...expectedNodeIds],
    },
    probeWitnesses: [{nodeId: NODE_SEED, snapshotQuerySucceeded: true}],
  };
}

function createFixture({
  listenerOpenAtPollMs,
  laneDurationsMs,
  startMs,
}) {
  const cluster = createCluster({
    size: CLUSTER_SIZE,
    docker: {socketPath: DOCKER_SOCKET_PATH},
    image: IMAGE,
  });
  const trace = [];
  const stages = [];
  const laneRuns = [];
  for (const nodeId of NODE_IDS) {
    const opensAtMs = startMs + listenerOpenAtPollMs[nodeId];
    cluster._nodes.set(nodeId, {
      id: nodeId,
      role: nodeId === NODE_SEED ? NODE_ROLES.SEED : NODE_ROLES.JOINER,
      async probeBootstrapReadiness() {
        return {
          status: HTTP_OK,
          phase: READINESS_PHASE_DEGRADED,
          reasons: [READINESS_REASON_RECOVERY_PENDING],
        };
      },
      async getReachabilityDiagnostics() {
        const atMs = Date.now();
        const open = atMs >= opensAtMs;
        trace.push({nodeId, atMs: atMs - startMs, adminReady: open});
        return open ?
          {reachable: true, adminReady: true, reachableBy: ADMIN_HEALTH_SOURCE} :
          {reachable: false, adminReady: false, lastError: ADMIN_REFUSED_ERROR};
      },
      async getLogs() {
        return EMPTY_LOG;
      },
    });
  }
  cluster._probeControlSnapshotCoverage = async (
    _deadline,
    expectedNodeIds,
    options,
  ) => {
    const attempt = laneRuns.length;
    const durationMs = laneDurationsMs[attempt] ?? laneDurationsMs.at(-1);
    laneRuns.push({attempt: attempt + 1, startedAtMs: Date.now() - startMs});
    await virtualDelay(durationMs);
    return buildSnapshotCoverage(expectedNodeIds, options.forceRepair === true);
  };
  cluster._collectFailureLogs = async () => {};
  cluster._recordClusterStage = (stage, details) => {
    stages.push({stage, details});
  };
  return {cluster, trace, stages, laneRuns};
}

function runListenerSchedule(overrides = {}) {
  const schedule = {};
  for (const nodeId of NODE_IDS) {
    const wRelative = overrides[nodeId] ?? LISTENER_OPEN_AFTER_W_MS[nodeId];
    schedule[nodeId] = wRelative === LISTENER_NEVER_OPENS_MS ?
      LISTENER_NEVER_OPENS_MS :
      wToPoll(wRelative);
  }
  return schedule;
}

async function runCertification(t, {listenerOverrides, laneDurationsMs}) {
  const fixture = createFixture({
    listenerOpenAtPollMs: runListenerSchedule(listenerOverrides),
    laneDurationsMs,
    startMs: BASE_EPOCH_MS,
  });
  const outcome = await runOnVirtualClock(t, () =>
    fixture.cluster._waitForAllActive({timeoutMs: CERTIFICATION_WINDOW_MS}),
  );
  return {...fixture, outcome};
}

function allListenersOpenAtPollStart() {
  const allOpen = {};
  for (const nodeId of NODE_IDS) {
    allOpen[nodeId] = RUN_POLL_START_AFTER_W_MS;
  }
  return allOpen;
}

function samplesOf(trace, nodeId) {
  return arrayFilter(trace, (entry) => entry.nodeId === nodeId);
}

function activeGateOf(outcome) {
  return outcome.ok ? outcome.value : outcome.error.diagnostics.activeGate;
}

test('resample-certifies-late-listener-within-deadline: node-2 listener at W+52.4 is re-sampled after the W+49.2 sample and certifies 5/5 before the W+60.4 deadline',
  async (t) => {
    const {outcome, trace, laneRuns} = await runCertification(t, {
      listenerOverrides: {},
      laneDurationsMs: RUN_LANE_DURATIONS_MS,
    });
    assert.equal(laneRuns.length, RUN_ATTEMPT_6_INDEX);
    assert.equal(
      laneRuns.at(-1).startedAtMs,
      wToPoll(RUN_ATTEMPT_6_START_AFTER_W_MS),
      'attempt 6 is issued at W+49.2',
    );
    assert.equal(
      outcome.ok,
      true,
      'the certification passes: ' + String(outcome.error?.message),
    );
    const activeGate = outcome.value;
    assert.equal(activeGate.state, PRIORITY_RECOVERY_ACTIVE_GATE_STATE.READY);
    assert.equal(activeGate.attempts, RUN_ATTEMPT_6_INDEX);
    assert.equal(activeGate.progress.activeNodeCount, ACTIVE_COUNT_ALL);
    assert.ok(
      activeGate.elapsedMs <= CERTIFICATION_WINDOW_MS,
      'verdict inside the 60 s window: ' + String(activeGate.elapsedMs),
    );
    assert.equal(activeGate.elapsedMs, wToPoll(RUN_LANE_6_END_AFTER_W_MS));
    const node2Samples = samplesOf(trace, NODE_N2);
    const lastSample = node2Samples.at(-1);
    assert.equal(lastSample.adminReady, true, 'the re-sample saw ACTIVE');
    assert.ok(
      lastSample.atMs <= CERTIFICATION_WINDOW_MS,
      're-sample issued at or before the deadline: ' + String(lastSample.atMs),
    );
    assert.ok(
      lastSample.atMs > wToPoll(RUN_ATTEMPT_6_START_AFTER_W_MS),
      're-sample issued after the attempt-start sample',
    );
  });

test('resample-not-admitted-after-deadline: a re-sample whose issue instant is past the deadline is refused and the attempt-start sample stands',
  async (t) => {
    const fixture = createFixture({
      listenerOpenAtPollMs: runListenerSchedule({
        ...allListenersOpenAtPollStart(),
        [NODE_N2]: LISTENER_NEVER_OPENS_MS,
      }),
      laneDurationsMs: IMMEDIATE_LANE_DURATIONS_MS,
      startMs: BASE_EPOCH_MS,
    });
    const outcome = await runOnVirtualClock(t, () =>
      fixture.cluster._probeClusterActiveState(
        BASE_EPOCH_MS - PAST_DEADLINE_OFFSET_MS,
      ),
    );
    assert.equal(outcome.ok, true, String(outcome.error?.message));
    const result = outcome.value;
    assert.equal(
      result.attemptJoin.resample.state,
      ACTIVE_PROBE_RESAMPLE_ADMISSION.NOT_ADMITTED_AFTER_DEADLINE,
    );
    assert.deepEqual(result.attemptJoin.resample.nodeIds, [NODE_N2]);
    assert.equal(samplesOf(fixture.trace, NODE_N2).length, SINGLE_PROBE);
    const node2 = arrayFind(
      result.nodeDiagnostics,
      (diagnostic) => diagnostic.nodeId === NODE_N2,
    );
    assert.equal(node2.active, false);
    assert.equal(node2.sampleOrigin, undefined);
    assert.equal(result.allActive, false);
  });

test('late-listener-after-deadline-fails-with-progress-observed: node-2 listener at W+60.5 still fails, no sample is taken after the deadline, and the label is progress_observed because the count rose 3->4 on the final attempt',
  async (t) => {
    const {outcome, stages} = await runCertification(t, {
      listenerOverrides: {
        [NODE_N2]: NODE_2_LISTENER_AFTER_DEADLINE_W_MS,
        [NODE_N4]: NODE_4_LISTENER_BEFORE_ATTEMPT_6_W_MS,
      },
      laneDurationsMs: RUN_LANE_DURATIONS_MS,
    });
    assert.equal(outcome.ok, false, 'the certification fails');
    const activeGate = activeGateOf(outcome);
    assert.equal(
      activeGate.state,
      PRIORITY_RECOVERY_ACTIVE_GATE_STATE.TIMED_OUT,
    );
    assert.equal(activeGate.attempts, RUN_ATTEMPT_6_INDEX);
    assert.equal(
      activeGate.progress.activeNodeCount,
      ACTIVE_COUNT_AT_VERDICT_HEAD,
    );
    assert.equal(activeGate.reasonCode, REASON_CODE_PROGRESS_OBSERVED);
    assert.equal(activeGate.reasonCode, ACTIVE_WAIT_PROGRESS_OBSERVED_REASON_CODE);
    assert.equal(
      outcome.error.diagnostics.terminalProgress.lastActiveCountRiseAttempt,
      RUN_ATTEMPT_6_INDEX,
    );
    // The verdict's node-2 evidence is the re-sample issued at or before the
    // deadline (the listener opened at W+60.5, after it); the final
    // adjudication's own reachability drain after the verdict is not
    // certification evidence and never rewrites the recorded diagnostic.
    const verdictStage = stages.at(-1);
    const node2 = arrayFind(
      verdictStage.details.nodeDiagnostics,
      (diagnostic) => diagnostic.nodeId === NODE_N2,
    );
    assert.equal(node2.active, false);
    assert.equal(node2.sampleOrigin, ACTIVE_PROBE_SAMPLE_ORIGIN.RESAMPLE);
    assert.ok(
      node2.resampledAtMs - BASE_EPOCH_MS <= CERTIFICATION_WINDOW_MS,
      'the re-sample was issued at or before the deadline',
    );
    assert.ok(
      node2.resampledAtMs - BASE_EPOCH_MS <
        wToPoll(NODE_2_LISTENER_AFTER_DEADLINE_W_MS),
      'the re-sample preceded the post-deadline listener',
    );
    assert.ok(
      verdictStage.details.attemptJoin.resample.issuedAtMs <=
        verdictStage.details.attemptJoin.deadline,
    );
  });

test('listener-never-opens-stalled-no-progress: when node-2 never opens and the count did not rise on the final attempt the verdict is FAIL 4/5 stalled_no_progress',
  async (t) => {
    const {outcome} = await runCertification(t, {
      listenerOverrides: {
        [NODE_N2]: LISTENER_NEVER_OPENS_MS,
        [NODE_N4]: NODE_4_EARLY_LISTENER_W_MS,
      },
      laneDurationsMs: RUN_LANE_DURATIONS_MS,
    });
    assert.equal(outcome.ok, false, 'the certification fails');
    const activeGate = activeGateOf(outcome);
    assert.equal(activeGate.state, PRIORITY_RECOVERY_ACTIVE_GATE_STATE.TIMED_OUT);
    assert.equal(activeGate.attempts, RUN_ATTEMPT_6_INDEX);
    assert.equal(activeGate.progress.activeNodeCount, ACTIVE_COUNT_AT_VERDICT_HEAD);
    assert.equal(activeGate.reasonCode, REASON_CODE_STALLED);
    assert.equal(activeGate.reasonCode, ACTIVE_WAIT_NO_PROGRESS_REASON_CODE);
    assert.ok(
      activeGate.lastMeaningfulProgressAttempt < RUN_ATTEMPT_6_INDEX,
      'the active count last rose before the final attempt',
    );
  });

test('snapshot-lane-running-at-deadline-is-bounded: a 12 s lane on attempt 6 does not delay the deadline decision; the re-sampled reachability decides 5/5 node evidence with a typed deadline-bounded lane reason',
  async (t) => {
    const orphanedBefore = orphanedSnapshotLaneSettlements.resolved;
    const {outcome, laneRuns} = await runCertification(t, {
      listenerOverrides: {},
      laneDurationsMs: LANE_OVERRUNS_DEADLINE_DURATIONS_MS,
    });
    assert.equal(laneRuns.length, RUN_ATTEMPT_6_INDEX);
    assert.equal(outcome.ok, false, 'coverage is not certified past the deadline');
    const attemptJoin = outcome.error.diagnostics.attemptJoin;
    assert.equal(
      attemptJoin.snapshotLane.outcome,
      ACTIVE_PROBE_SNAPSHOT_LANE_OUTCOME.DEADLINE_BOUNDED,
    );
    assert.equal(
      attemptJoin.snapshotLane.reason,
      ACTIVE_PROBE_SNAPSHOT_LANE_DEADLINE_BOUNDED_REASON,
    );
    assert.equal(
      attemptJoin.snapshotLane.joinedAtMs - BASE_EPOCH_MS,
      CERTIFICATION_WINDOW_MS,
      'the attempt returned at the deadline, not at lane completion',
    );
    assert.equal(
      attemptJoin.resample.state,
      ACTIVE_PROBE_RESAMPLE_ADMISSION.ADMITTED,
    );
    const activeGate = activeGateOf(outcome);
    assert.equal(activeGate.progress.activeNodeCount, ACTIVE_COUNT_ALL);
    assert.equal(activeGate.reasonCode, REASON_CODE_PROGRESS_OBSERVED);
    assert.equal(
      orphanedSnapshotLaneSettlements.resolved,
      orphanedBefore + SINGLE_PROBE,
      'the overrunning lane settled after the deadline and was counted',
    );
  });

test('all-active-at-attempt-start-path-unchanged: when every node is ACTIVE at attempt start each node is probed once, no diagnostic carries a re-sample origin, and the gate is READY at lane completion',
  async (t) => {
    const {outcome, trace} = await runCertification(t, {
      listenerOverrides: allListenersOpenAtPollStart(),
      laneDurationsMs: ALL_ACTIVE_LANE_DURATIONS_MS,
    });
    assert.equal(outcome.ok, true, String(outcome.error?.message));
    const activeGate = outcome.value;
    assert.equal(activeGate.state, PRIORITY_RECOVERY_ACTIVE_GATE_STATE.READY);
    assert.equal(activeGate.attempts, ALL_ACTIVE_ATTEMPTS);
    assert.equal(activeGate.elapsedMs, ALL_ACTIVE_ELAPSED_MS);
    assert.equal(activeGate.progress.activeNodeCount, ACTIVE_COUNT_ALL);
    for (const nodeId of NODE_IDS) {
      assert.equal(samplesOf(trace, nodeId).length, SINGLE_PROBE, nodeId);
    }
    const resampleOrigins = arrayFilter(
      trace,
      (entry) => entry.sampleOrigin === ACTIVE_PROBE_SAMPLE_ORIGIN.RESAMPLE,
    );
    assert.equal(resampleOrigins.length, 0);
  });

test('budgets-and-cadence-unchanged: the 60 s window, the 1 s poll interval, the 10 s forced-repair threshold and both one-shot extension rules are untouched (six attempts, no seventh, both extensions decline)',
  async (t) => {
    assert.equal(ACTIVE_POLL_INTERVAL_MS, EXPECTED_ACTIVE_POLL_INTERVAL_MS);
    assert.equal(
      TIMEOUTS.ACTIVE_WAIT_FORCE_REPAIR_AFTER,
      EXPECTED_FORCE_REPAIR_AFTER_MS,
    );
    const {outcome, laneRuns} = await runCertification(t, {
      listenerOverrides: {[NODE_N2]: LISTENER_NEVER_OPENS_MS},
      laneDurationsMs: RUN_LANE_DURATIONS_MS,
    });
    assert.equal(outcome.ok, false);
    const activeGate = activeGateOf(outcome);
    assert.equal(activeGate.attempts, RUN_ATTEMPT_6_INDEX);
    assert.equal(laneRuns.length, RUN_ATTEMPT_6_INDEX, 'no seventh attempt');
    assert.ok(
      arrayEvery(laneRuns, (run) => run.startedAtMs <= CERTIFICATION_WINDOW_MS),
      'no attempt issued after the deadline',
    );
    const attemptsSinceProgress = activeGate.attemptsSinceProgress;
    const ownerProgress = selectStartupActiveGateOwnerProgressContinuation({
      readinessMode: activeGate.mode,
      progressSnapshot: activeGate.progress,
      probeResult: null,
      attemptsSinceProgress,
      pollIntervalMs: ACTIVE_POLL_INTERVAL_MS,
    });
    assert.equal(ownerProgress.continuePolling, false);
    const snapshotRepair = selectStartupActiveGateSnapshotRepairContinuation({
      readinessMode: activeGate.mode,
      progressSnapshot: activeGate.progress,
      pollIntervalMs: ACTIVE_POLL_INTERVAL_MS,
    });
    assert.equal(snapshotRepair.continuePolling, false);
    assert.equal(
      activeGate.progress.activeNodeCount,
      ACTIVE_COUNT_AT_VERDICT_HEAD,
    );
    assert.ok(
      activeGate.bestProgress.activeNodeCount >= FIRST_ATTEMPT_ACTIVE_COUNT,
    );
    assert.ok(
      ACTIVE_COUNT_BEFORE_LAST_ATTEMPT < ACTIVE_COUNT_AT_VERDICT_HEAD,
    );
  });

test('witness-deterministic: two virtual-clock replays of the run produce identical probe traces and verdict timing',
  async (t) => {
    const first = await runCertification(t, {
      listenerOverrides: {},
      laneDurationsMs: RUN_LANE_DURATIONS_MS,
    });
    t.mock.timers.reset();
    const second = await runCertification(t, {
      listenerOverrides: {},
      laneDurationsMs: RUN_LANE_DURATIONS_MS,
    });
    assert.deepEqual(first.trace, second.trace);
    assert.deepEqual(first.laneRuns, second.laneRuns);
    assert.equal(first.outcome.ok, second.outcome.ok);
    assert.equal(
      activeGateOf(first.outcome).elapsedMs,
      activeGateOf(second.outcome).elapsedMs,
    );
  });
