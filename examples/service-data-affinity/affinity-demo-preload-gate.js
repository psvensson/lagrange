import {ADMIN_CONTROL_SNAPSHOT} from '../../src/admin/admin-constants.js';
import {
  buildLoadLaneTableAdmissionProbeSql,
} from '../../src/admin/load-lane-table-admission-probe.js';
import {
  CONTROL_PLANE_QUIESCENCE_STATE,
  buildControlPlaneQuiescencePressureSignalsFromDiagnostics,
  buildControlPlaneQuiescenceSnapshot,
} from '../../src/diagnostics/control-plane-quiescence-snapshot.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
} from '../../src/control-plane/control-plane-snapshot-owner.js';

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
});
const PRELOAD_BLOCKING_SNAPSHOT_STATES = new Set([
  CONTROL_PLANE_QUIESCENCE_STATE.OBSERVATION_UNAVAILABLE,
  CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
  CONTROL_PLANE_QUIESCENCE_STATE
    .CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE,
]);
const RATINGS_TABLE_NAME = 'ratings';
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const ZERO = 0;
const BUDGET_EXHAUSTED_ERROR = 'preload admission budget exhausted';
const ADMIN_STREAM_LANE_QUERY_PARAMETER = 'lane';
const PRELOAD_ADMISSION_QUERY_REQUIRED_ERROR =
  'MovieLens preload admission requires query';

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

function buildSnapshotProbe(snapshot, snapshotError) {
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
    error: '',
  };
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

function classifySnapshot(snapshot, snapshotError, nowMs) {
  return buildControlPlaneQuiescenceSnapshot({
    snapshotProbe: buildSnapshotProbe(snapshot, snapshotError),
    nowMs,
    stableWindowStartedAtMs: nowMs,
    stableWindowMs: ZERO,
    maxInFlightCount: ZERO,
    leaderQuietElapsedMs: ZERO,
    ignoreStaleInFlightReplicaOperations: true,
  });
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
  let snapshotResult;
  let snapshotError = '';
  try {
    snapshotResult = await options.query({
      target: targets.snapshot,
      sql: ADMIN_CONTROL_SNAPSHOT.QUERY_SQL,
      timeoutMs: snapshotTimeoutMs,
    });
  } catch (error) {
    snapshotResult = {rows: []};
    snapshotError = String(error?.message || error);
  }
  const snapshotRow = resolveRows(snapshotResult)[ZERO];
  snapshotError = snapshotError || resolveSnapshotObservationError(snapshotRow);
  const snapshot = classifySnapshot(snapshotRow, snapshotError, options.now());
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
  waitForAffinityDemoPreloadAdmission,
};
