import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {driveNetwork} from '../distributed/harness/raft-network-host.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {OperationWorkflowRecoveryTimeout} from
  '../../src/rebalancer/operation-workflow-recovery-timeout.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from
  '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';

const {WORKFLOW_STEP} = SHARED;

// DT6 step 10 — drive the REAL rebalancer timeout DETECTION on the per-node virtual clock. Step 9
// hosted the timeout-check LOOP (cadence + freeze) with a counting stand-in body; this step makes
// that loop's body run the real production timeout-detection math against the node's virtual clock.
//
// No production change is needed: the entire workflow subsystem follows one convention — the timeout
// predicates take `now = Date.now()` as an INJECTABLE parameter
// (operation-workflow-recovery-timeout.js isPriorityRecoveryOperationDrainStepStale /
// resolvePriorityRecoveryOperationDrainStepAgeMs, and getTimeoutForStep on the reconcile base). So
// the real detection kernel is virtual-clock-drivable by construction; here it is fed the node's
// network TimeSource now() instead of wall time.
//
// The host is the real production timeout loop from step 9 (RebalanceCoordinator.prototype
// startTimeoutChecking on a per-node network TimeSource), whose checkTimeouts body runs the REAL
// isPriorityRecoveryOperationDrainStepStale(operation, this.timeSource.now()) over an in-memory
// operation and records the virtual instant it first fires.
//
// Two scenarios:
//  - BOUNDARY: an operation updated at T0 with a 200ms step timeout is detected stale at EXACTLY
//    T0 + 200ms of virtual time (the real age = now - updatedAt crossing the real getTimeoutForStep
//    threshold), deterministically, on the hosted loop's cadence.
//  - CL-039 UNDER-DETECTION: when the owner node is stopped before its operation times out, its
//    per-node clock freezes, so its real age computation stays below the timeout forever and it
//    NEVER detects the timeout — while a still-running peer with the same operation does. This is
//    the concrete liveness hazard the harness exists to expose: a node that loses its clock cannot
//    time out its own in-flight work.
//
// HONEST SCOPE: the detection MATH (age vs getTimeoutForStep) is the real production code on the
// real per-node clock. What is NOT exercised here is the checkTimeouts ORCHESTRATION glue
// (operation-workflow-recovery-timeout.js:122 — the repository visibility pipeline, single-flight
// runExclusive, reconcileTimeoutOperation), which still reads Date.now() directly at lines ~127/249;
// driving that end-to-end needs a `now` seam on that orchestration body + a repository stub, a later
// increment. This step proves the detection kernel, not the surrounding pipeline.

const lifecycleProto = RebalanceCoordinator.prototype;
const timeoutProto = OperationWorkflowRecoveryTimeout.prototype;
const START_MS = 1_000_000; // keep virtual now() comfortably positive (epoch-ms normalization)
const TIMEOUT_MS = 200;
const INTERVAL_MS = 20;

function timeoutConfig() {
  return {
    pendingTimeoutMs: TIMEOUT_MS,
    creatingTimeoutMs: TIMEOUT_MS,
    syncingTimeoutMs: TIMEOUT_MS,
    removingTimeoutMs: TIMEOUT_MS,
  };
}

// Host the real timeout loop (step 9) whose body runs the REAL timeout-detection predicate against
// `operation` using the node's virtual clock.
function hostTimeoutDetector(net, nodeId, operation) {
  net.registerNode(nodeId, () => {});
  const ts = net.networkTimeSource(nodeId);
  const detection = {checks: 0, detectedAtNow: null};
  // `this` for the real predicate: carries config + the real helper methods it delegates to.
  const detector = {
    config: timeoutConfig(),
    repository: {isOperationTerminal: () => false},
    getTimeoutForStep: timeoutProto.getTimeoutForStep,
    isPriorityRecoveryOperationDrainStepStale:
      timeoutProto.isPriorityRecoveryOperationDrainStepStale,
    resolvePriorityRecoveryOperationDrainStepAgeMs:
      timeoutProto.resolvePriorityRecoveryOperationDrainStepAgeMs,
    // CL-044 (955fc84c) made the age computation prefer the time-in-current-step
    // anchor, so the real predicate now delegates to resolveOperationStepEnteredAtMs;
    // wire it so the hosted detector runs the real production math (this operation
    // carries no steps_history, so it correctly falls back to updatedAt).
    resolveOperationStepEnteredAtMs:
      timeoutProto.resolveOperationStepEnteredAtMs,
    normalizeOperationDrainEpochMillis:
      timeoutProto.normalizeOperationDrainEpochMillis,
  };
  const coord = {
    nodeId,
    isShuttingDown: false,
    timeoutCheckInterval: null,
    timeoutCheckInFlight: false,
    timeoutCheckIntervalMs: INTERVAL_MS,
    timeSource: ts,
    timeoutCheckSetIntervalFn: (fn, ms) => ts.setInterval(fn, ms),
    timeoutCheckClearIntervalFn: (handle) => ts.clearInterval(handle),
    startTimeoutChecking: lifecycleProto.startTimeoutChecking,
    stopTimeoutChecking: lifecycleProto.stopTimeoutChecking,
    logQueryOperationsFailure: () => {},
    checkTimeouts: async () => {
      detection.checks += 1;
      const now = ts.now();
      if (
        detection.detectedAtNow === null &&
        detector.isPriorityRecoveryOperationDrainStepStale(operation, now)
      ) {
        detection.detectedAtNow = now;
      }
    },
  };
  coord.startTimeoutChecking();
  return {coord, detection, ts};
}

function operationUpdatedAt(updatedAtMs) {
  return {
    operationId: 'op-1',
    workflowStep: WORKFLOW_STEP.CREATING, // CREATING -> getTimeoutForStep returns creatingTimeoutMs
    updatedAt: updatedAtMs,
  };
}

async function runBoundary() {
  const net = createVirtualNetwork({startMs: START_MS});
  const host = hostTimeoutDetector(net, 'D1', operationUpdatedAt(START_MS));
  await driveNetwork(net, {untilMs: START_MS + 500, stepMs: 5});
  host.coord.stopTimeoutChecking();
  return host.detection;
}

async function runFreezeUnderDetection() {
  const net = createVirtualNetwork({startMs: START_MS});
  const running = hostTimeoutDetector(net, 'D-RUN', operationUpdatedAt(START_MS));
  const frozen = hostTimeoutDetector(net, 'D-FROZEN', operationUpdatedAt(START_MS));

  // Run both past a few ticks but BEFORE the 200ms timeout, then stop D-FROZEN — its per-node clock
  // freezes (last activity ~T0+80ms), well under the timeout.
  await driveNetwork(net, {untilMs: START_MS + 80, stepMs: 5});
  const frozenChecksBeforeKill = frozen.detection.checks;
  net.killNode('D-FROZEN');

  // Continue past the timeout: D-RUN's clock advances and it detects; D-FROZEN's clock is stuck.
  await driveNetwork(net, {untilMs: START_MS + 500, stepMs: 5});
  running.coord.stopTimeoutChecking();
  frozen.coord.stopTimeoutChecking();
  return {
    running: running.detection,
    frozen: frozen.detection,
    frozenNow: frozen.ts.now(),
    frozenChecksBeforeKill,
  };
}

t.test('BOUNDARY: the real detection fires at exactly T0 + step timeout on the virtual clock',
  async (t) => {
    const d = await runBoundary();
    t.ok(d.checks > 0, 'the hosted loop ran the real detection body on the virtual clock');
    t.not(d.detectedAtNow, null, 'the operation was detected as timed out');
    t.equal(d.detectedAtNow, START_MS + TIMEOUT_MS,
      'real age (now - updatedAt) crossed the real getTimeoutForStep threshold at exactly T0+200ms');
  });

t.test('CL-039 UNDER-DETECTION: a frozen owner never times out its own operation; a peer does',
  async (t) => {
    const m = await runFreezeUnderDetection();
    t.equal(m.running.detectedAtNow, START_MS + TIMEOUT_MS,
      'D-RUN (still running) detected the timeout at T0+200ms');
    t.ok(m.frozenChecksBeforeKill > 0,
      'D-FROZEN was genuinely running detection before it was stopped (not dead from the start)');
    t.ok(m.frozenNow < START_MS + TIMEOUT_MS,
      'D-FROZEN per-node clock froze below the timeout horizon');
    t.equal(m.frozen.detectedAtNow, null,
      'D-FROZEN NEVER detected the timeout — its frozen clock keeps the real age under the threshold ' +
      '(the CL-039 stalled-owner liveness hazard)');
  });

t.test('the hosted real-detection scenarios are deterministic across runs', async (t) => {
  const a = await runFreezeUnderDetection();
  const b = await runFreezeUnderDetection();
  t.same(
    {rA: a.running.detectedAtNow, fA: a.frozen.detectedAtNow, nA: a.frozenNow},
    {rA: b.running.detectedAtNow, fA: b.frozen.detectedAtNow, nA: b.frozenNow},
    'identical topology + drive -> identical detection instants and frozen clocks',
  );
});
