// Deadline join for one cluster-ACTIVE certification attempt.
//
// An attempt runs the per-node reachability probes IN PARALLEL with the seed
// control-snapshot lane. Under seed saturation the snapshot lane takes ~10 s,
// so a node that was sampled unreachable at attempt start (its admin listener
// opened seconds later) stayed "inactive" in the attempt result that the poll
// loop compared against the deadline — the 14:05:20 verdict artifact
// (forensics: node-2 listener up at W+52.4, verdict 4/5 at W+61.3 quoting the
// W+49.6 ECONNREFUSED sample). This module joins reachability and the
// snapshot lane WITH THE DEADLINE, not with each other:
//
//   1. A node sampled unreachable at attempt start is RE-SAMPLED once, at the
//      earlier of snapshot-lane completion and the last instant at which the
//      re-sample still carries the reachability probe floor budget
//      (deadline - resampleLeadMs). A re-sample is admitted only when it is
//      issued at or before the deadline; one issued after the deadline is
//      refused so the verdict never reflects a state later than the deadline.
//   2. The snapshot lane is awaited only until the deadline. A lane still
//      running at the deadline yields a typed deadline-bounded coverage record
//      and the reachability samples taken at/before the deadline decide the
//      attempt's node evidence. The lane promise is left to settle on its own
//      (its settlement is counted, never awaited past the deadline).
//
// ACTIVE is still each node's own admin/readiness answer: the re-sample is
// the same per-node probe, and snapshot counts never derive ACTIVE here.

import {CLUSTER_CLASS_SHARED_CONTEXT} from './cluster-class-shared-context.js';
import {
  ACTIVE_PROBE_SNAPSHOT_LANE_DEADLINE_BOUNDED_REASON,
  ACTIVE_PROBE_SNAPSHOT_LANE_OUTCOME,
} from './active-probe-snapshot-lane-constants.js';

const {
  ACTIVE_PROBE_REASON_ADMIN_NOT_READY,
  ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX,
  ZERO,
} = CLUSTER_CLASS_SHARED_CONTEXT;

const ACTIVE_PROBE_SAMPLE_ORIGIN = Object.freeze({
  ATTEMPT_START: 'attempt_start',
  RESAMPLE: 'resample',
});

const ACTIVE_PROBE_RESAMPLE_ADMISSION = Object.freeze({
  NOT_NEEDED: 'not_needed',
  ADMITTED: 'admitted',
  NOT_ADMITTED_AFTER_DEADLINE: 'not_admitted_after_deadline',
});


const ACTIVE_PROBE_SNAPSHOT_LANE_SETTLEMENT = Object.freeze({
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
});
const ACTIVE_PROBE_RESAMPLE_NODE_IDS_NONE = Object.freeze([]);
const ACTIVE_PROBE_RESAMPLE_ISSUED_AT_UNAVAILABLE = null;
const TYPEOF_FUNCTION = 'function';
const TYPEOF_STRING = 'string';
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

// Snapshot lanes that outlived their attempt's deadline: counted rather than
// swallowed so a log-driven triage can see how often the lane overran.
const orphanedSnapshotLaneSettlements = {
  resolved: ZERO,
  rejected: ZERO,
};

function trackSnapshotLaneSettlement(snapshotCoveragePromise) {
  const tracker = {
    settlement: ACTIVE_PROBE_SNAPSHOT_LANE_SETTLEMENT.PENDING,
    value: null,
    error: null,
    promise: null,
  };
  tracker.promise = Promise.resolve(snapshotCoveragePromise).then(
    (value) => {
      tracker.settlement = ACTIVE_PROBE_SNAPSHOT_LANE_SETTLEMENT.RESOLVED;
      tracker.value = value;
      return tracker;
    },
    (error) => {
      tracker.settlement = ACTIVE_PROBE_SNAPSHOT_LANE_SETTLEMENT.REJECTED;
      tracker.error = error;
      return tracker;
    },
  );
  return tracker;
}

function isSnapshotLaneSettled(tracker) {
  return tracker.settlement !== ACTIVE_PROBE_SNAPSHOT_LANE_SETTLEMENT.PENDING;
}

function waitForInstant(instantMs) {
  const delayMs = instantMs - Date.now();
  if (delayMs <= ZERO) {
    return new Promise((resolve) => setImmediate(resolve));
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    if (typeof timer.unref === TYPEOF_FUNCTION) {
      timer.unref();
    }
  });
}

/**
 * Wait for the snapshot lane, but never past the instant. Returns once the
 * lane settles or the instant arrives, whichever is first.
 * @param {Object} tracker
 * @param {number} instantMs
 * @return {Promise<void>}
 */
async function waitForSnapshotLaneUntil(tracker, instantMs) {
  if (isSnapshotLaneSettled(tracker)) {
    return;
  }
  await Promise.race([tracker.promise, waitForInstant(instantMs)]);
}

function hasUnreachableReason(reasons) {
  return Array.isArray(reasons) && arraySome(reasons, (reason) =>
    typeof reason === TYPEOF_STRING &&
    (
      stringStartsWith(reason, ACTIVE_PROBE_REASON_ADMIN_NOT_READY) ||
      stringStartsWith(reason, ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX)
    ),
  );
}

/**
 * A node sample is "unreachable" when the node's own answer was not ACTIVE
 * because the harness could not reach its admin/readiness surface (admin not
 * ready, admin probe error, or a probe error), as opposed to the node
 * answering "not ready" itself.
 * @param {Object} diagnostic
 * @return {boolean}
 */
function isUnreachableActiveProbeSample(diagnostic) {
  if (!diagnostic || diagnostic.active === true) {
    return false;
  }
  return diagnostic.error !== null || hasUnreachableReason(diagnostic.reasons);
}

function stampResampledDiagnostic(diagnostic, resampledAtMs) {
  return {
    ...diagnostic,
    sampleOrigin: ACTIVE_PROBE_SAMPLE_ORIGIN.RESAMPLE,
    resampledAtMs,
  };
}

function buildDeadlineBoundedSnapshotCoverage({
  expectedNodeIds = [],
  forceRepair = false,
  deadline,
} = {}) {
  return {
    completeCoverage: false,
    expectedNodeCount: expectedNodeIds.length,
    bestCoverageNodeCount: ZERO,
    forceRepair: forceRepair === true,
    selectedNodeId: null,
    selectedSnapshotNodeId: null,
    selectedAdminReady: null,
    selectedSnapshotAdminReady: null,
    selectedReachable: null,
    selectedError: null,
    selectedReachabilityError: null,
    probeWitnesses: [],
    laneOutcome: ACTIVE_PROBE_SNAPSHOT_LANE_OUTCOME.DEADLINE_BOUNDED,
    laneReason: ACTIVE_PROBE_SNAPSHOT_LANE_DEADLINE_BOUNDED_REASON,
    laneBoundedAtMs: deadline,
  };
}

function recordOrphanedSnapshotLane(tracker) {
  tracker.promise.then((settled) => {
    if (settled.settlement === ACTIVE_PROBE_SNAPSHOT_LANE_SETTLEMENT.REJECTED) {
      orphanedSnapshotLaneSettlements.rejected += 1;
      return;
    }
    orphanedSnapshotLaneSettlements.resolved += 1;
  });
}

async function resampleUnreachableNodes({
  initialDiagnostics,
  deadline,
  resampleNodeDiagnostic,
}) {
  const candidates = arrayFilter(
    initialDiagnostics,
    isUnreachableActiveProbeSample,
  );
  const candidateNodeIds = arrayMap(
    candidates,
    (diagnostic) => diagnostic.nodeId,
  );
  if (candidates.length === ZERO) {
    return {
      nodeDiagnostics: initialDiagnostics,
      resample: {
        state: ACTIVE_PROBE_RESAMPLE_ADMISSION.NOT_NEEDED,
        nodeIds: ACTIVE_PROBE_RESAMPLE_NODE_IDS_NONE,
        issuedAtMs: ACTIVE_PROBE_RESAMPLE_ISSUED_AT_UNAVAILABLE,
      },
    };
  }
  const issuedAtMs = Date.now();
  if (issuedAtMs > deadline) {
    return {
      nodeDiagnostics: initialDiagnostics,
      resample: {
        state: ACTIVE_PROBE_RESAMPLE_ADMISSION.NOT_ADMITTED_AFTER_DEADLINE,
        nodeIds: candidateNodeIds,
        issuedAtMs,
      },
    };
  }
  const resampled = await Promise.all(
    arrayMap(candidates, (diagnostic) => resampleNodeDiagnostic(diagnostic)),
  );
  const resampledByNodeId = new Map();
  for (const diagnostic of resampled) {
    resampledByNodeId.set(
      diagnostic.nodeId,
      stampResampledDiagnostic(diagnostic, issuedAtMs),
    );
  }
  return {
    nodeDiagnostics: arrayMap(initialDiagnostics, (diagnostic) =>
      resampledByNodeId.get(diagnostic.nodeId) || diagnostic,
    ),
    resample: {
      state: ACTIVE_PROBE_RESAMPLE_ADMISSION.ADMITTED,
      nodeIds: candidateNodeIds,
      issuedAtMs,
    },
  };
}

/**
 * Join one attempt's per-node reachability probes and its snapshot lane at
 * the deadline (see the module header for the two rules).
 * @param {Object} options
 * @param {number} options.deadline attempt deadline (epoch ms)
 * @param {Promise<Array<Object>>} options.nodeDiagnosticsPromise
 * @param {Promise<Object>} options.snapshotCoveragePromise
 * @param {function(Object): Promise<Object>} options.resampleNodeDiagnostic
 *   re-runs the SAME per-node probe for one attempt-start diagnostic
 * @param {number} options.resampleLeadMs the reachability probe floor budget;
 *   the re-sample is issued no later than deadline - resampleLeadMs so its
 *   answer lands by the deadline
 * @param {Array<string>} options.expectedNodeIds
 * @param {boolean} options.forceRepair
 * @return {Promise<{nodeDiagnostics: Array<Object>, snapshotCoverage: Object,
 *   attemptJoin: Object}>}
 */
async function joinActiveProbeAttemptAtDeadline({
  deadline,
  nodeDiagnosticsPromise,
  snapshotCoveragePromise,
  resampleNodeDiagnostic,
  resampleLeadMs,
  expectedNodeIds = [],
  forceRepair = false,
}) {
  const laneTracker = trackSnapshotLaneSettlement(snapshotCoveragePromise);
  const attemptStartedAtMs = Date.now();
  // Attempt-start samples are passed through untouched so the all-ACTIVE
  // path stays byte-identical; only re-sampled diagnostics carry an origin.
  const initialDiagnostics = await nodeDiagnosticsPromise;
  const resampleAdmissionInstantMs = deadline - resampleLeadMs;
  await waitForSnapshotLaneUntil(laneTracker, resampleAdmissionInstantMs);
  const resampled = await resampleUnreachableNodes({
    initialDiagnostics,
    deadline,
    resampleNodeDiagnostic,
  });
  await waitForSnapshotLaneUntil(laneTracker, deadline);
  if (
    laneTracker.settlement === ACTIVE_PROBE_SNAPSHOT_LANE_SETTLEMENT.REJECTED
  ) {
    throw laneTracker.error;
  }
  const laneCompleted = isSnapshotLaneSettled(laneTracker);
  if (!laneCompleted) {
    recordOrphanedSnapshotLane(laneTracker);
  }
  const snapshotCoverage = laneCompleted ?
    laneTracker.value :
    buildDeadlineBoundedSnapshotCoverage({
      expectedNodeIds,
      forceRepair,
      deadline,
    });
  return {
    nodeDiagnostics: resampled.nodeDiagnostics,
    snapshotCoverage,
    attemptJoin: {
      deadline,
      startedAtMs: attemptStartedAtMs,
      resample: resampled.resample,
      snapshotLane: {
        outcome: laneCompleted ?
          ACTIVE_PROBE_SNAPSHOT_LANE_OUTCOME.COMPLETED :
          ACTIVE_PROBE_SNAPSHOT_LANE_OUTCOME.DEADLINE_BOUNDED,
        reason: laneCompleted ?
          null :
          ACTIVE_PROBE_SNAPSHOT_LANE_DEADLINE_BOUNDED_REASON,
        joinedAtMs: Date.now(),
      },
    },
  };
}

export {
  ACTIVE_PROBE_RESAMPLE_ADMISSION,
  ACTIVE_PROBE_SAMPLE_ORIGIN,
  ACTIVE_PROBE_SNAPSHOT_LANE_DEADLINE_BOUNDED_REASON,
  ACTIVE_PROBE_SNAPSHOT_LANE_OUTCOME,
  joinActiveProbeAttemptAtDeadline,
  orphanedSnapshotLaneSettlements,
};
