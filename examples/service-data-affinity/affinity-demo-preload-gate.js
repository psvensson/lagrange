import {ADMIN_CONTROL_SNAPSHOT} from '../../src/admin/admin-constants.js';
import {
  buildLoadLaneTableAdmissionProbeSql,
} from '../../src/admin/load-lane-table-admission-probe.js';
import {
  CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE,
  CONTROL_PLANE_QUIESCENCE_STATE,
  buildControlPlaneQuiescencePressureSignalsFromDiagnostics,
  buildControlPlaneQuiescenceSnapshot,
} from '../../src/diagnostics/control-plane-quiescence-snapshot.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  advanceSchemaAdmissionTransitionHistory,
  buildEmptySchemaAdmissionTransitionHistory,
} from './affinity-demo-schema-admission-history.js';
import {
  resolveLatestTopologyShapingOperationDrain,
} from '../../src/rebalancer/replica-operation-topology-drain.js';
import {
  INACTIVE_SCHEMA_STABILITY_WINDOW,
  buildSchemaStabilityObservation,
} from './affinity-demo-schema-stability-window.js';

const ADMIN_STREAM_LANE = Object.freeze({
  LOAD: 'load',
  SNAPSHOT: 'snapshot',
});
const PRELOAD_ADMISSION_STATE = Object.freeze({
  ADMITTED: 'admitted',
  DENIED: 'denied',
  NOT_ATTEMPTED: 'not_attempted',
});
const PRELOAD_SNAPSHOT_ERROR = Object.freeze({
  MISSING_ROW: 'control snapshot rows unavailable',
  OBSERVATION_FAILED: 'control snapshot observation failed',
  ADMISSION_FIELDS_UNAVAILABLE:
    'control snapshot admission fields unavailable',
});
const PRELOAD_BLOCKING_SNAPSHOT_STATES = new Set([
  CONTROL_PLANE_QUIESCENCE_STATE.OBSERVATION_UNAVAILABLE,
  CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
  CONTROL_PLANE_QUIESCENCE_STATE
    .CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE,
]);
const RATINGS_TABLE_NAME = 'ratings';
const DEFAULT_TIMEOUT_MS = 180_000;
// Schema admission waits behind the full formation-time table spread: at
// five-node GCP scale the ~45 bootstrap tables' replicas drain through the
// admission-controlled operation ledger in ~5-6 minutes (archived run
// 2026-08-15T19-50-14-276Z reached zero in-flight seconds after the shared
// 180s deadline fired), so the schema gate carries its own deadline; the
// 60s stable-window robustness property is unchanged.
const DEFAULT_SCHEMA_ADMISSION_TIMEOUT_MS = 480_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_SCHEMA_ADMISSION_STABLE_WINDOW_MS = 60_000;
const SCHEMA_ADMISSION_STABLE_CONFIRMATION_COUNT = 2;
const ZERO = 0;
const BUDGET_EXHAUSTED_ERROR = 'preload admission budget exhausted';
const SCHEMA_BUDGET_EXHAUSTED_ERROR = 'schema admission budget exhausted';
const ADMIN_STREAM_LANE_QUERY_PARAMETER = 'lane';
const PRELOAD_ADMISSION_QUERY_REQUIRED_ERROR =
  'MovieLens preload admission requires query';
const PRIORITY_SPREAD_SUMMARY_SOURCE =
  'controlPlaneDiagnostics.currentPriorityPlacementObservation';
const CURRENT_PRIORITY_PLACEMENT_OBSERVATION_AVAILABLE = 'available';
const UNAVAILABLE_READY_LEASE_AGE_WITNESS = Object.freeze({
  schemaVersion: 1,
  state: 'unavailable',
  reason: 'control_snapshot_witness_unavailable',
});

function buildAdminLaneTarget(target, lane) {
  const url = new URL(target);
  url.searchParams.set(ADMIN_STREAM_LANE_QUERY_PARAMETER, lane);
  return url.toString();
}

function resolveRows(result) {
  if (Array.isArray(result?.results)) {
    return result.results;
  }
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= ZERO ? value : ZERO;
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveSnapshotAdmissionFieldsError(snapshot) {
  const replicaOperations = snapshot?.replicaOperations;
  if (
    !isPlainRecord(replicaOperations) ||
    !Number.isInteger(replicaOperations.inFlightCount) ||
    replicaOperations.inFlightCount < ZERO ||
    !Number.isInteger(replicaOperations.staleInFlightCount) ||
    replicaOperations.staleInFlightCount < ZERO ||
    // The authoritative snapshot does not produce this consumer-derived
    // discount. Absence is conservative zero; only a present malformed value
    // is unavailable evidence because zero cannot hide observed work.
    (
      replicaOperations.additionalInFlightDiscountCount !== undefined &&
      (
        !Number.isInteger(
          replicaOperations.additionalInFlightDiscountCount,
        ) ||
        replicaOperations.additionalInFlightDiscountCount < ZERO
      )
    ) ||
    !isPlainRecord(snapshot?.leaders) ||
    !isPlainRecord(snapshot?.controlPlaneDiagnostics)
  ) {
    return PRELOAD_SNAPSHOT_ERROR.ADMISSION_FIELDS_UNAVAILABLE;
  }
  return '';
}

function buildLatestTopologyDrainProbe(replicaOperations, nowMs) {
  const latestTopologyDrain = resolveLatestTopologyShapingOperationDrain(
    replicaOperations.rows,
    {observedAt: nowMs},
  );
  return Object.freeze({
    latestTopologyDrainAtMs: latestTopologyDrain?.drainedAtMs ?? null,
    latestTopologyDrainOperationId:
      latestTopologyDrain?.operationId ?? null,
  });
}

function buildSnapshotProbe(snapshot, snapshotError, nowMs) {
  if (snapshotError) {
    return {
      inFlightCount: ZERO,
      staleInFlightCount: ZERO,
      leaderCount: ZERO,
      controlPlanePressureSignals: [],
      error: snapshotError,
    };
  }
  const replicaOperations =
    snapshot?.replicaOperations &&
    typeof snapshot.replicaOperations === 'object' ?
      snapshot.replicaOperations :
      {};
  const leaders =
    snapshot?.leaders && typeof snapshot.leaders === 'object' ?
      snapshot.leaders :
      {};
  return {
    inFlightCount: normalizeNonNegativeInteger(
      replicaOperations.inFlightCount,
    ),
    staleInFlightCount: normalizeNonNegativeInteger(
      replicaOperations.staleInFlightCount,
    ),
    additionalInFlightDiscountCount: normalizeNonNegativeInteger(
      replicaOperations.additionalInFlightDiscountCount,
    ),
    leaderCount: Object.keys(leaders).length,
    controlPlanePressureSignals:
      buildControlPlaneQuiescencePressureSignalsFromDiagnostics(
        snapshot?.controlPlaneDiagnostics,
      ),
    ...buildLatestTopologyDrainProbe(replicaOperations, nowMs),
    error: '',
  };
}

function resolveReadyLeaseAgeWitness(snapshot) {
  const witness =
    snapshot?.controlPlaneDiagnostics?.readyLeaseAgeWitness;
  return isPlainRecord(witness) ?
    witness :
    UNAVAILABLE_READY_LEASE_AGE_WITNESS;
}

function isPriorityPartitionSummaryAvailable(priorityPartitionSummary) {
  return (
    isPlainRecord(priorityPartitionSummary) &&
    typeof priorityPartitionSummary.satisfied === 'boolean' &&
    Number.isInteger(priorityPartitionSummary.totalSpreadGap) &&
    priorityPartitionSummary.totalSpreadGap >= ZERO
  );
}

function isPriorityLeaderCoverageAvailable(leaderCoverage) {
  return (
    isPlainRecord(leaderCoverage) &&
    typeof leaderCoverage.satisfied === 'boolean' &&
    Number.isInteger(leaderCoverage.missingLeaderPartitionCount) &&
    leaderCoverage.missingLeaderPartitionCount >= ZERO
  );
}

function isCurrentPriorityPlacementObservationAvailable(
  snapshot,
  currentPlacementObservation,
) {
  return (
    isPlainRecord(currentPlacementObservation) &&
    currentPlacementObservation.state ===
      CURRENT_PRIORITY_PLACEMENT_OBSERVATION_AVAILABLE &&
    currentPlacementObservation.capturedAt === snapshot?.capturedAt &&
    isPriorityPartitionSummaryAvailable(
      currentPlacementObservation.priorityPartitionSummary,
    ) &&
    isPriorityLeaderCoverageAvailable(
      currentPlacementObservation.leaderCoverage,
    )
  );
}

function buildUnavailablePrioritySpreadTopology() {
  return Object.freeze({
    enabled: true,
    ready: false,
    totalSpreadGap: ZERO,
    observationState:
      CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
        .SNAPSHOT_LANE_UNAVAILABLE,
    snapshotLaneUnavailableTableCount: 1,
    source: PRIORITY_SPREAD_SUMMARY_SOURCE,
  });
}

function buildAvailablePrioritySpreadTopology(currentPlacementObservation) {
  const priorityPartitionSummary =
    currentPlacementObservation.priorityPartitionSummary;
  const leaderCoverage = currentPlacementObservation.leaderCoverage;
  const totalSpreadGap =
    priorityPartitionSummary.totalSpreadGap +
    leaderCoverage.missingLeaderPartitionCount;
  return Object.freeze({
    enabled: true,
    ready:
      currentPlacementObservation.satisfied === true &&
      priorityPartitionSummary.satisfied === true &&
      leaderCoverage.satisfied === true &&
      totalSpreadGap === ZERO,
    totalSpreadGap,
    prioritySpreadGap: priorityPartitionSummary.totalSpreadGap,
    // Explain surface: a spread-open denial must name the partitions
    // holding the gap (the 2026-07-18T17-40 denial reported only gap=1,
    // forcing archive forensics to find sql_write_operations-p1).
    blockedPartitions: (
      Array.isArray(priorityPartitionSummary.blockedPartitions) ?
        priorityPartitionSummary.blockedPartitions :
        []
    ).map((partition) => Object.freeze({
      partitionId: partition.partitionId,
      spreadGap: partition.spreadGap,
    })),
    missingLeaderPartitionCount:
      leaderCoverage.missingLeaderPartitionCount,
    missingLeaderPartitionIds:
      Array.isArray(leaderCoverage.missingLeaderPartitionIds) ?
        [...leaderCoverage.missingLeaderPartitionIds] :
        [],
    observationState:
      CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE.AVAILABLE,
    source: PRIORITY_SPREAD_SUMMARY_SOURCE,
  });
}

function buildPrioritySpreadTopology(snapshot) {
  const currentPlacementObservation =
    snapshot?.controlPlaneDiagnostics?.currentPriorityPlacementObservation;
  return isCurrentPriorityPlacementObservationAvailable(
    snapshot,
    currentPlacementObservation,
  ) ?
    buildAvailablePrioritySpreadTopology(currentPlacementObservation) :
    buildUnavailablePrioritySpreadTopology();
}

function resolveSnapshotObservationError(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return PRELOAD_SNAPSHOT_ERROR.MISSING_ROW;
  }
  const observation = snapshot.snapshotObservation;
  if (
    observation?.state === CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH
  ) {
    return '';
  }
  const state = typeof observation?.state === 'string' ?
    observation.state :
    'missing';
  const reasonCodes = Array.isArray(observation?.reasonCodes) ?
    observation.reasonCodes :
    [];
  const reasonSuffix = reasonCodes.length > ZERO ?
    `: ${reasonCodes.join(',')}` :
    '';
  return `${PRELOAD_SNAPSHOT_ERROR.OBSERVATION_FAILED} (${state})` +
    reasonSuffix;
}

function classifySnapshot(
  snapshot,
  snapshotError,
  nowMs,
  readyLeaseAgeWitness = resolveReadyLeaseAgeWitness(snapshot),
) {
  const snapshotProbe = buildSnapshotProbe(snapshot, snapshotError, nowMs);
  const quiescenceSnapshot = buildControlPlaneQuiescenceSnapshot({
    snapshotProbe,
    criticalSystemTopology: buildPrioritySpreadTopology(snapshot),
    nowMs,
    stableWindowStartedAtMs: nowMs,
    stableWindowMs: ZERO,
    maxInFlightCount: ZERO,
    leaderQuietElapsedMs: ZERO,
    ignoreStaleInFlightReplicaOperations: true,
  });
  return Object.freeze({
    ...quiescenceSnapshot,
    readyLeaseAgeWitness,
    latestTopologyDrainAtMs: snapshotProbe.latestTopologyDrainAtMs ?? null,
    latestTopologyDrainOperationId:
      snapshotProbe.latestTopologyDrainOperationId ?? null,
  });
}

async function observeControlSnapshot(options, target, timeoutMs) {
  const deadlineMs = options.now() + timeoutMs;
  let snapshotResult;
  let snapshotError = '';
  try {
    snapshotResult = await options.query({
      target,
      sql: ADMIN_CONTROL_SNAPSHOT.QUERY_SQL,
      timeoutMs,
    });
  } catch (error) {
    snapshotResult = {rows: []};
    snapshotError = String(error?.message || error);
  }
  let snapshotRow = resolveRows(snapshotResult)[ZERO];
  let readyLeaseAgeWitness = resolveReadyLeaseAgeWitness(snapshotRow);
  if (
    !snapshotError &&
    snapshotRow?.snapshotObservation?.state ===
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE
  ) {
    const repairTimeoutMs = remainingBudgetMs(options.now, deadlineMs);
    if (repairTimeoutMs > ZERO) {
      try {
        snapshotResult = await options.query({
          target,
          sql: ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR,
          timeoutMs: repairTimeoutMs,
        });
        snapshotRow = resolveRows(snapshotResult)[ZERO];
        readyLeaseAgeWitness = resolveReadyLeaseAgeWitness(snapshotRow);
      } catch (error) {
        snapshotRow = null;
        snapshotError = String(error?.message || error);
      }
    }
  }
  snapshotError = snapshotError || resolveSnapshotObservationError(snapshotRow);
  snapshotError = snapshotError ||
    resolveSnapshotAdmissionFieldsError(snapshotRow);
  return classifySnapshot(
    snapshotRow,
    snapshotError,
    options.now(),
    readyLeaseAgeWitness,
  );
}

function normalizeTimeoutMs(value) {
  return Number.isFinite(value) && value >= ZERO ?
    Math.floor(value) :
    DEFAULT_TIMEOUT_MS;
}

function normalizePollIntervalMs(value) {
  return Number.isFinite(value) && value >= ZERO ?
    Math.floor(value) :
    DEFAULT_POLL_INTERVAL_MS;
}

function normalizeSchemaAdmissionTimeoutMs(value) {
  return Number.isFinite(value) && value >= ZERO ?
    Math.floor(value) :
    DEFAULT_SCHEMA_ADMISSION_TIMEOUT_MS;
}

function normalizeSchemaStableWindowMs(value) {
  return Number.isFinite(value) && value >= ZERO ?
    Math.floor(value) :
    DEFAULT_SCHEMA_ADMISSION_STABLE_WINDOW_MS;
}

async function observeSchemaAdmissionSnapshot(options, target, deadlineMs) {
  const snapshotTimeoutMs = remainingBudgetMs(options.now, deadlineMs);
  if (snapshotTimeoutMs <= ZERO) {
    return classifySnapshot(
      null,
      SCHEMA_BUDGET_EXHAUSTED_ERROR,
      options.now(),
    );
  }
  return observeControlSnapshot(options, target, snapshotTimeoutMs);
}

function buildLoadLaneAdmission(state, errorMessage = '') {
  return Object.freeze({
    admitted: state === PRELOAD_ADMISSION_STATE.ADMITTED,
    state,
    error: errorMessage,
  });
}

function buildPreloadEvidence(snapshot, loadLaneAdmission, targets) {
  return Object.freeze({
    admitted: loadLaneAdmission.admitted,
    snapshot,
    loadLaneAdmission,
    targets,
  });
}

function buildTimeoutError(evidence) {
  const detail =
    evidence.loadLaneAdmission.error ||
    evidence.snapshot.reasons?.[ZERO] ||
    evidence.snapshot.state;
  const error = new Error(
    'MovieLens preload admission timed out: ' + detail,
  );
  error.preloadAdmission = evidence;
  return error;
}

function buildSchemaAdmissionEvidence(
  snapshot,
  target,
  stableConfirmationCount,
  transitionHistory,
) {
  const admitted =
    stableConfirmationCount >= SCHEMA_ADMISSION_STABLE_CONFIRMATION_COUNT;
  return Object.freeze({
    admitted,
    state: admitted ?
      PRELOAD_ADMISSION_STATE.ADMITTED :
      PRELOAD_ADMISSION_STATE.DENIED,
    snapshot,
    stableConfirmationCount,
    transitionHistory,
    target,
  });
}

function buildSchemaAdmissionTimeoutError(evidence) {
  const detail = evidence.snapshot.reasons?.[ZERO] || evidence.snapshot.state;
  const error = new Error(
    'MovieLens schema admission timed out: ' + detail,
  );
  error.schemaAdmission = evidence;
  return error;
}

function remainingBudgetMs(now, deadlineMs) {
  return Math.max(ZERO, deadlineMs - now());
}

function buildBudgetExhaustedEvidence(now, targets) {
  const snapshot = classifySnapshot(null, BUDGET_EXHAUSTED_ERROR, now());
  return buildPreloadEvidence(
    snapshot,
    buildLoadLaneAdmission(
      PRELOAD_ADMISSION_STATE.NOT_ATTEMPTED,
      BUDGET_EXHAUSTED_ERROR,
    ),
    targets,
  );
}

async function observePreloadAdmission(options, targets, probeSql, deadlineMs) {
  const snapshotTimeoutMs = remainingBudgetMs(options.now, deadlineMs);
  if (snapshotTimeoutMs <= ZERO) {
    return buildBudgetExhaustedEvidence(options.now, targets);
  }
  const snapshot = await observeControlSnapshot(
    options,
    targets.snapshot,
    snapshotTimeoutMs,
  );
  if (PRELOAD_BLOCKING_SNAPSHOT_STATES.has(snapshot.state)) {
    return buildPreloadEvidence(
      snapshot,
      buildLoadLaneAdmission(PRELOAD_ADMISSION_STATE.NOT_ATTEMPTED),
      targets,
    );
  }

  const loadTimeoutMs = remainingBudgetMs(options.now, deadlineMs);
  if (loadTimeoutMs <= ZERO) {
    return buildPreloadEvidence(
      snapshot,
      buildLoadLaneAdmission(
        PRELOAD_ADMISSION_STATE.NOT_ATTEMPTED,
        BUDGET_EXHAUSTED_ERROR,
      ),
      targets,
    );
  }
  try {
    await options.query({
      target: targets.load,
      sql: probeSql,
      timeoutMs: loadTimeoutMs,
    });
    return buildPreloadEvidence(
      snapshot,
      buildLoadLaneAdmission(PRELOAD_ADMISSION_STATE.ADMITTED),
      targets,
    );
  } catch (error) {
    return buildPreloadEvidence(
      snapshot,
      buildLoadLaneAdmission(
        PRELOAD_ADMISSION_STATE.DENIED,
        String(error?.message || error),
      ),
      targets,
    );
  }
}

/**
 * Wait until the authoritative control snapshot is quiet enough to admit the
 * policy-bearing ratings schema mutation. This phase intentionally performs no
 * ratings query: the table does not exist yet. Two consecutive fresh, quiet
 * snapshots prevent a transient gap between formation and priority recovery
 * from releasing DDL into a still-busy control plane.
 *
 * @param {Object} options
 * @param {string} options.target
 * @param {Function} options.query
 * @param {Function} options.now
 * @param {Function} options.sleep
 * @return {Promise<Object>}
 */
async function waitForAffinityDemoSchemaAdmission(options = {}) {
  if (typeof options.query !== 'function') {
    throw new TypeError(PRELOAD_ADMISSION_QUERY_REQUIRED_ERROR);
  }
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function' ?
    options.sleep :
    (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
  const normalizedOptions = {...options, now, sleep};
  const timeoutMs = normalizeSchemaAdmissionTimeoutMs(options.timeoutMs);
  const pollIntervalMs = normalizePollIntervalMs(options.pollIntervalMs);
  const stableWindowMs = normalizeSchemaStableWindowMs(
    options.stableWindowMs,
  );
  const deadlineMs = now() + timeoutMs;
  const target = buildAdminLaneTarget(
    options.target,
    ADMIN_STREAM_LANE.SNAPSHOT,
  );
  let stableConfirmationCount = ZERO;
  let stabilityWindow = INACTIVE_SCHEMA_STABILITY_WINDOW;
  let transitionHistory = buildEmptySchemaAdmissionTransitionHistory();
  let lastEvidence = null;

  while (true) {
    if (lastEvidence && now() >= deadlineMs) {
      throw buildSchemaAdmissionTimeoutError(lastEvidence);
    }
    const observedSnapshot = await observeSchemaAdmissionSnapshot(
      normalizedOptions,
      target,
      deadlineMs,
    );
    const observedAtMs = now();
    const previousStabilityWindow = stabilityWindow;
    const stabilityObservation = buildSchemaStabilityObservation(
      observedSnapshot,
      stabilityWindow,
      stableConfirmationCount,
      stableWindowMs,
      observedAtMs,
    );
    stabilityWindow = stabilityObservation.stabilityWindow;
    stableConfirmationCount = stabilityObservation.stableConfirmationCount;
    transitionHistory = advanceSchemaAdmissionTransitionHistory(
      transitionHistory,
      {
        snapshot: stabilityObservation.snapshot,
        previousStabilityWindow,
        nextStabilityWindow: stabilityWindow,
        stableConfirmationCount,
        observedAtMs,
      },
    );
    const evidence = buildSchemaAdmissionEvidence(
      stabilityObservation.snapshot,
      target,
      stableConfirmationCount,
      transitionHistory,
    );
    lastEvidence = evidence;
    if (evidence.admitted) {
      return evidence;
    }
    const remainingMs = remainingBudgetMs(now, deadlineMs);
    if (remainingMs <= ZERO) {
      throw buildSchemaAdmissionTimeoutError(evidence);
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

/**
 * Wait until the production ratings load lane admits the MovieLens load.
 * Control snapshots provide typed visibility and fail closed on blindness or
 * pressure, but they do not recreate the ratings-specific admission policy.
 *
 * @param {Object} options
 * @param {string} options.target
 * @param {Function} options.query
 * @param {Function} options.now
 * @param {Function} options.sleep
 * @return {Promise<Object>}
 */
async function waitForAffinityDemoPreloadAdmission(options = {}) {
  if (typeof options.query !== 'function') {
    throw new TypeError(PRELOAD_ADMISSION_QUERY_REQUIRED_ERROR);
  }
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sleep = typeof options.sleep === 'function' ?
    options.sleep :
    (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
  const normalizedOptions = {...options, now, sleep};
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const pollIntervalMs = normalizePollIntervalMs(options.pollIntervalMs);
  const startedAtMs = now();
  const deadlineMs = startedAtMs + timeoutMs;
  const targets = Object.freeze({
    snapshot: buildAdminLaneTarget(options.target, ADMIN_STREAM_LANE.SNAPSHOT),
    load: buildAdminLaneTarget(options.target, ADMIN_STREAM_LANE.LOAD),
  });
  const probeSql = buildLoadLaneTableAdmissionProbeSql(RATINGS_TABLE_NAME);
  let lastEvidence = null;

  while (true) {
    if (lastEvidence && now() >= deadlineMs) {
      throw buildTimeoutError(lastEvidence);
    }
    const evidence = await observePreloadAdmission(
      normalizedOptions,
      targets,
      probeSql,
      deadlineMs,
    );
    lastEvidence = evidence;
    if (evidence.admitted) {
      return evidence;
    }
    const remainingMs = remainingBudgetMs(now, deadlineMs);
    if (remainingMs <= ZERO) {
      throw buildTimeoutError(evidence);
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

export {
  PRELOAD_ADMISSION_STATE,
  waitForAffinityDemoSchemaAdmission,
  waitForAffinityDemoPreloadAdmission,
};
