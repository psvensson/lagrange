const CONTROL_SNAPSHOT_RETRY_LIMIT = 3;
const CONTROL_SNAPSHOT_RETRY_DELAY_MS = 500;
const CONTROL_SNAPSHOT_RETRY_ROW_INDEX = 0;

const CONTROL_SNAPSHOT_RETRY_DECISION = Object.freeze({
  RETRY: 'retry',
  STOP_SUCCESS: 'stop_success',
  STOP_FAILURE: 'stop_failure',
});

const RETRY_REASON_FORCED_REPAIR_PATH_DISABLED =
  'forced_repair_path_disabled';
const RETRY_REASON_RETRY_LIMIT_EXHAUSTED = 'retry_limit_exhausted';
const RETRY_REASON_ERROR_PRESSURE_OR_TIMEOUT =
  'error_pressure_or_timeout';
const RETRY_REASON_NON_RETRYABLE_ERROR = 'non_retryable_error';
const RETRY_REASON_RESULT_PRESSURE_DEFERRED = 'result_pressure_deferred';
const RETRY_REASON_SNAPSHOT_OBSERVATION_PRESSURE =
  'snapshot_observation_pressure';
const RETRY_REASON_ADMITTED_SUCCESSFULLY = 'admitted_successfully';

const ERR_MSG_TIMED_OUT = 'timed out';
const ERR_MSG_TIMEOUT_LOWER = 'timeout';
const ERR_MSG_TIMEOUT_UPPER = 'Timeout';
const ERR_MSG_DISTRIBUTED_PARTICIPANT_FAILURE =
  'Distributed operation failed due to participant failures';
const ERR_MSG_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE =
  'authoritative_row_source_unavailable';
const ERR_MSG_CONNECTION_TO_NODE = 'Connection to node';
const ERR_MSG_NO_CONNECTION_TO_NODE = 'No connection to node';
const ERR_MSG_CLOSED = 'closed';
const ERR_MSG_CONTROL_PLANE_PRESSURE_DEGRADED =
  'control_plane_pressure_degraded';
const ERR_CODE_DISTRIBUTED_PARTICIPANT_FAILURE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const ERR_CODE_CONTROL_PLANE_PRESSURE_DEGRADED =
  'CONTROL_PLANE_PRESSURE_DEGRADED';
const RETRYABLE_ERROR_MESSAGE_PARTS = Object.freeze([
  ERR_MSG_TIMED_OUT,
  ERR_MSG_TIMEOUT_LOWER,
  ERR_MSG_TIMEOUT_UPPER,
  ERR_MSG_DISTRIBUTED_PARTICIPANT_FAILURE,
  ERR_MSG_AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
  ERR_MSG_CONNECTION_TO_NODE,
  ERR_MSG_NO_CONNECTION_TO_NODE,
  ERR_MSG_CLOSED,
  ERR_MSG_CONTROL_PLANE_PRESSURE_DEGRADED,
]);
const RETRYABLE_ERROR_CODES = Object.freeze([
  ERR_CODE_DISTRIBUTED_PARTICIPANT_FAILURE,
  ERR_CODE_CONTROL_PLANE_PRESSURE_DEGRADED,
]);

const OBS_STATE_DEFERRED_REFRESH = 'deferred_refresh';
const OBS_STATE_FAILED = 'failed';
const REASON_SUBSTR_PRESSURE = 'pressure';
const REASON_SUBSTR_TIMEOUT = 'timeout';
const REASON_SUBSTR_FAIL = 'fail';

const CONTROL_SNAPSHOT_RETRY_RULES = [
  {
    match: (evidence) => evidence.isForcedRepair,
    outcome: CONTROL_SNAPSHOT_RETRY_DECISION.STOP_FAILURE,
    reason: RETRY_REASON_FORCED_REPAIR_PATH_DISABLED,
  },
  {
    match: (evidence) => evidence.isLimitReached,
    outcome: CONTROL_SNAPSHOT_RETRY_DECISION.STOP_FAILURE,
    reason: RETRY_REASON_RETRY_LIMIT_EXHAUSTED,
  },
  {
    match: (evidence) => evidence.isError && evidence.isPressureOrTimeoutError,
    outcome: CONTROL_SNAPSHOT_RETRY_DECISION.RETRY,
    reason: RETRY_REASON_ERROR_PRESSURE_OR_TIMEOUT,
  },
  {
    match: (evidence) => evidence.isError,
    outcome: CONTROL_SNAPSHOT_RETRY_DECISION.STOP_FAILURE,
    reason: RETRY_REASON_NON_RETRYABLE_ERROR,
  },
  {
    match: (evidence) => evidence.isPressureDeferred,
    outcome: CONTROL_SNAPSHOT_RETRY_DECISION.RETRY,
    reason: RETRY_REASON_RESULT_PRESSURE_DEFERRED,
  },
  {
    match: (evidence) => evidence.hasPressureObservation,
    outcome: CONTROL_SNAPSHOT_RETRY_DECISION.RETRY,
    reason: RETRY_REASON_SNAPSHOT_OBSERVATION_PRESSURE,
  },
  {
    match: () => true,
    outcome: CONTROL_SNAPSHOT_RETRY_DECISION.STOP_SUCCESS,
    reason: RETRY_REASON_ADMITTED_SUCCESSFULLY,
  },
];

function hasPressureOrTimeoutError(error) {
  const message = error.message || '';
  const code = error.code || '';
  return RETRYABLE_ERROR_MESSAGE_PARTS.some((messagePart) =>
    message.includes(messagePart)
  ) || RETRYABLE_ERROR_CODES.includes(code);
}

function hasPressureObservation(resultOrError) {
  const snapshot = Array.isArray(resultOrError?.rows) ?
    resultOrError.rows[CONTROL_SNAPSHOT_RETRY_ROW_INDEX] :
    null;
  if (!snapshot) {
    return false;
  }

  const observation = snapshot.snapshotObservation;
  return (
    observation?.state === OBS_STATE_DEFERRED_REFRESH ||
    observation?.state === OBS_STATE_FAILED ||
    (Array.isArray(observation?.reasonCodes) &&
      observation.reasonCodes.some((code) =>
        code.includes(REASON_SUBSTR_PRESSURE) ||
        code.includes(REASON_SUBSTR_TIMEOUT) ||
        code.includes(REASON_SUBSTR_FAIL)
      ))
  );
}

function evaluateControlSnapshotRetryDecision(
  options,
  attempts,
  resultOrError,
) {
  const isError = resultOrError instanceof Error;
  const evidence = {
    isForcedRepair: options?.forceAuthoritativeRepair === true,
    isLimitReached: attempts >= CONTROL_SNAPSHOT_RETRY_LIMIT,
    isError,
    isPressureOrTimeoutError: isError ?
      hasPressureOrTimeoutError(resultOrError) :
      false,
    isPressureDeferred: resultOrError?.criticalConvergenceDeferred === true,
    hasPressureObservation: hasPressureObservation(resultOrError),
  };

  const matchedRule = CONTROL_SNAPSHOT_RETRY_RULES.find((rule) =>
    rule.match(evidence)
  );
  return {
    outcome: matchedRule.outcome,
    reason: matchedRule.reason,
  };
}

export {
  CONTROL_SNAPSHOT_RETRY_DECISION,
  CONTROL_SNAPSHOT_RETRY_DELAY_MS,
  evaluateControlSnapshotRetryDecision,
};
