import {classifyControlPlaneMutationResult} from
  '../control-plane-mutation-outcome-classifier.js';
import {isAuthoritativeControlPlaneRowReadSuccessful} from
  '../control-plane-system-table-gateway.js';

const LOG_MARKER_ERROR_CODE = Object.freeze({
  REQUEST_INVALID: 'LOG_MARKER_REQUEST_INVALID',
  NODE_UNAVAILABLE: 'LOG_MARKER_NODE_UNAVAILABLE',
  IDENTITY_CONFLICT: 'LOG_MARKER_IDENTITY_CONFLICT',
  OUTCOME_UNCONFIRMED: 'LOG_MARKER_OUTCOME_UNCONFIRMED',
});
const LOG_MARKER_STATE = Object.freeze({RECORDED: 'recorded'});
const MARKER_FIELDS = new Set(['markerId', 'message']);
const MARKER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/u;
const MARKER_MESSAGE_LIMIT = 2048;
const MARKER_ID_PREFIX = 'diagnostic-marker:';
const MARKER_LEVEL = 'info';
const MARKER_METADATA = '{"kind":"diagnostic_marker"}';
const MARKER_MESSAGE = Object.freeze({
  INVALID: 'A diagnostic marker requires only a bounded markerId and message',
  NODE_UNAVAILABLE: 'Diagnostic marker server identity or clock is unavailable',
  CONFLICT: 'The marker identity already records different content or ingress node',
  UNKNOWN: 'The diagnostic marker persistence outcome is not confirmed',
});

function markerError(code, message, fields = {}) {
  return Object.assign(new Error(message), {code, ...fields});
}

function diagnosticMarkerLogId(markerId) {
  return MARKER_ID_PREFIX + markerId;
}

function validateMarkerRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some((key) => !MARKER_FIELDS.has(key)) ||
      typeof request.markerId !== 'string' || !MARKER_ID_PATTERN.test(request.markerId) ||
      typeof request.message !== 'string' || request.message.length === 0 ||
      request.message.length > MARKER_MESSAGE_LIMIT) {
    throw markerError(LOG_MARKER_ERROR_CODE.REQUEST_INVALID, MARKER_MESSAGE.INVALID);
  }
}

function compileDiagnosticMarker(request, nodeId, now) {
  validateMarkerRequest(request);
  if (typeof nodeId !== 'string' || nodeId.length === 0 ||
      !Number.isSafeInteger(now) || now <= 0) {
    throw markerError(LOG_MARKER_ERROR_CODE.NODE_UNAVAILABLE, MARKER_MESSAGE.NODE_UNAVAILABLE,
      {deferRetry: true});
  }
  return Object.freeze({log_id: diagnosticMarkerLogId(request.markerId),
    timestamp: now, created_at: now, node_id: nodeId, level: MARKER_LEVEL,
    message: request.message, metadata: MARKER_METADATA});
}

function diagnosticMarkerWasApplied(result) {
  const effect = classifyControlPlaneMutationResult(result);
  return effect.applied && !effect.deferred && !effect.visibilityPending &&
    effect.affectedRowsPresent && effect.affectedRows === 1;
}

function recordedDiagnosticMarker(row) {
  return Object.freeze({markerState: LOG_MARKER_STATE.RECORDED,
    logId: row.log_id, nodeId: row.node_id, timestamp: row.timestamp});
}

function unconfirmedDiagnosticMarker(cause = null) {
  return markerError(LOG_MARKER_ERROR_CODE.OUTCOME_UNCONFIRMED, MARKER_MESSAGE.UNKNOWN,
    {deferRetry: true, ...(cause ? {cause} : {})});
}

function hasRecordedMarkerIdentity(row, intended) {
  return row && row.log_id === intended.log_id &&
    Number.isSafeInteger(row.timestamp) && row.timestamp > 0 &&
    row.timestamp === row.created_at;
}

function reconcileDiagnosticMarker(observation, intended, cause = null) {
  if (!isAuthoritativeControlPlaneRowReadSuccessful(observation) ||
      !Array.isArray(observation.rows) || observation.rows.length !== 1) {
    throw unconfirmedDiagnosticMarker(cause);
  }
  const row = observation.rows[0];
  if (!hasRecordedMarkerIdentity(row, intended)) {
    throw unconfirmedDiagnosticMarker(cause);
  }
  if (row.node_id !== intended.node_id || row.message !== intended.message ||
      row.level !== MARKER_LEVEL || row.metadata !== MARKER_METADATA) {
    throw markerError(LOG_MARKER_ERROR_CODE.IDENTITY_CONFLICT, MARKER_MESSAGE.CONFLICT);
  }
  return recordedDiagnosticMarker(row);
}

export {LOG_MARKER_ERROR_CODE, LOG_MARKER_STATE, diagnosticMarkerLogId, compileDiagnosticMarker,
  diagnosticMarkerWasApplied, recordedDiagnosticMarker, reconcileDiagnosticMarker,
  unconfirmedDiagnosticMarker};
