import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';

const HEARTBEAT_REPORTER_VISIBILITY_READ = Object.freeze({
  ROUTINGREADINESSDIMENSION: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
});
const HEARTBEAT_SERVICE_LITERAL = Object.freeze({
  VALUE_2: 2,
  NODE_STATE_REPORTER_TIMEOUT: 'node_state_reporter_timeout',
  HEARTBEAT: 'heartbeat',
  NODE_ROW_MISSING: 'NODE_ROW_MISSING',
  NODE_STATE_REPORTER: 'node_state_reporter',
  REPORTER_DURABLE_VISIBILITY_REQUIRED:
    'Authoritative node heartbeat visibility was not confirmed',
  NODE_ROW_MISSING_FROM_CACHE: 'node_row_missing_from_cache',
  NODE_SHUTDOWN_REPORTER_UNVERIFIED: 'node_shutdown_reporter_unverified',
  NODE_ROW_MISSING_FROM_STORAGE: 'node_row_missing_from_storage',
  NODE_SHUTDOWN_CDC_UPDATE: 'node_shutdown_cdc_update',
  ATTEMPT_TIMEOUT: 'attempt_timeout',
  NO_PREVIOUS_WRITE: 'no_previous_write',
  MAX_STALENESS: 'max_staleness',
  STRUCTURAL_CHANGED: 'structural_changed',
  NODEHEARTBEATWRITES: 'nodeHeartbeatWrites',
  ENDPOINTUPSERTS: 'endpointUpserts',
  CDC_UPDATE: 'cdc_update',
  HEARTBEATSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY:
    'HeartbeatService requires controlPlaneSystemTableGateway',
  BACKGROUND: 'background',
  COALESCED_MIN_INTERVAL: 'coalesced_min_interval',
  UTILIZATION_CHANGED: 'utilization_changed',
  COALESCED_UNCHANGED: 'coalesced_unchanged',
  BOOLEAN: 'boolean',
});
const ZERO = 0;
const ONE = 1;
const MS_PER_MINUTE = 60000;
const MIN_REGRESSION_SAMPLE_COUNT = 2;
const REPORTER_VISIBILITY_QUERY_TIMEOUT_MS = 1000;
const ENDPOINT_ID_PREFIX = 'ep-';
const ENDPOINT_ID_SUFFIX = '-ws';
const HEARTBEAT_REPORTER_VISIBILITY_STATE = Object.freeze({
  IDLE: 'idle',
  CONFIRMED: 'confirmed',
  PENDING: 'pending',
  UNVERIFIED: 'unverified',
});
const HEARTBEAT_REPORTER_VISIBILITY_DECISION = Object.freeze({
  CONFIRMED: 'confirmed',
  SCHEDULE_VERIFICATION: 'schedule_verification',
  VERIFICATION_PENDING: 'verification_pending',
  RETRY_THROTTLED_UNVERIFIED: 'retry_throttled_unverified',
});
const HEARTBEAT_PUBLICATION_PATH = Object.freeze({
  NODE_STATE_REPORTER: 'node_state_reporter',
  NODE_STATE_REPORTER_UNVERIFIED: 'node_state_reporter_unverified',
});
const HEARTBEAT_FAILURE_STAGE = Object.freeze({REPORTER_VISIBILITY: 'reporter_visibility'});
const HEARTBEAT_FAILURE_REASON = Object.freeze({
  REPORTER_VISIBILITY_NOT_CONFIRMED: 'reporter_visibility_not_confirmed',
  REPORTER_VISIBILITY_VERIFICATION_FAILED: 'reporter_visibility_verification_failed',
});
const HEARTBEAT_WRITE_DECISION_REASON = Object.freeze({
  REPORTER_VISIBILITY_PENDING: 'reporter_visibility_pending',
  REPORTER_VISIBILITY_UNVERIFIED: 'reporter_visibility_unverified',
  RECOVERY_FAILURE_RETRY: 'recovery_failure_retry',
});
const HEARTBEAT_WRITE_DECISION_STATE = Object.freeze({
  REPORTER_VISIBILITY_PENDING: 'reporter_visibility_pending',
  REPORTER_VISIBILITY_UNVERIFIED: 'reporter_visibility_unverified',
  INITIAL_RECOVERY_REQUIRED: 'initial_recovery_required',
  RECOVERY_FAILURE_RETRY: 'recovery_failure_retry',
  STRUCTURAL_CHANGED: 'structural_changed',
  COALESCED_MIN_INTERVAL: 'coalesced_min_interval',
  UTILIZATION_CHANGED: 'utilization_changed',
  MAX_STALENESS_REFRESH: 'max_staleness_refresh',
  COALESCED_UNCHANGED: 'coalesced_unchanged',
});
/**
 * Estimate usage-percent slope (percent per minute) with linear regression.
 * @param {Array<{timestamp: number, usagePercent: number}>} samples
 * @return {number}
 */ function calculateUsageSlopePerMinute(samples) {
  if (!Array.isArray(samples) || samples.length < MIN_REGRESSION_SAMPLE_COUNT) {
    return ZERO;
  }
  const origin = samples[ZERO].timestamp;
  let sumX = ZERO;
  let sumY = ZERO;
  let sumXY = ZERO;
  let sumX2 = ZERO;
  for (const sample of samples) {
    const x = sample.timestamp - origin;
    const y = sample.usagePercent;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const count = samples.length;
  const denominator = count * sumX2 - sumX * sumX;
  if (denominator <= ZERO) {
    return ZERO;
  }
  const slopePerMs = (count * sumXY - sumX * sumY) / denominator;
  return slopePerMs * MS_PER_MINUTE;
}

export {
  calculateUsageSlopePerMinute,
  ENDPOINT_ID_PREFIX,
  ENDPOINT_ID_SUFFIX,
  HEARTBEAT_FAILURE_REASON,
  HEARTBEAT_FAILURE_STAGE,
  HEARTBEAT_PUBLICATION_PATH,
  HEARTBEAT_REPORTER_VISIBILITY_DECISION,
  HEARTBEAT_REPORTER_VISIBILITY_READ,
  HEARTBEAT_REPORTER_VISIBILITY_STATE,
  HEARTBEAT_SERVICE_LITERAL,
  HEARTBEAT_WRITE_DECISION_REASON,
  HEARTBEAT_WRITE_DECISION_STATE,
  MIN_REGRESSION_SAMPLE_COUNT,
  ONE,
  REPORTER_VISIBILITY_QUERY_TIMEOUT_MS,
  ZERO,
};
