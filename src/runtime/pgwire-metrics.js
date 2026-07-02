/**
 * PG wire observability instrumentation.
 *
 * Structured metric emission for handshake, query, session, and
 * protocol error dimensions. All metrics use `logger.info()` level,
 * structured objects, and `Ms` suffix for duration fields.
 *
 * Requirements: 12.1, 12.2, 12.4
 *
 * @module runtime/pgwire-metrics
 */

import {METRICS_LOG_TAG} from '../constants/metrics-constants.js';


/**
 * Emit a metrics log entry. Failures are silently swallowed
 * so instrumentation never propagates to callers.
 *
 * @param {Object} logger - Logger instance.
 * @param {string} tag - METRICS_LOG_TAG value.
 * @param {Object} data - Structured metric payload.
 */
function emitMetric(logger, tag, data) {
  try {
    logger.info(tag, data);
  } catch (_metricsErr) {
    // Metrics logging failures must not propagate to callers
  }
}

/**
 * Emit handshake metric after startup/auth completes.
 *
 * @param {Object} logger - Logger instance.
 * @param {Object} dims - Dimension fields.
 * @param {string} dims.serviceId - Owning service ID.
 * @param {string} dims.replicaId - Replica ID.
 * @param {string} dims.nodeId - Node ID.
 * @param {string} dims.sessionId - Session ID.
 * @param {boolean} dims.success - Whether handshake succeeded.
 * @param {number} dims.durationMs - Handshake duration.
 */
function emitHandshakeMetric(logger, dims) {
  emitMetric(logger, METRICS_LOG_TAG.PGWIRE_HANDSHAKE, {
    serviceId: dims.serviceId,
    replicaId: dims.replicaId,
    nodeId: dims.nodeId,
    sessionId: dims.sessionId,
    success: dims.success,
    durationMs: dims.durationMs,
  });
}

/**
 * Emit query metric after SQL execution completes.
 *
 * @param {Object} logger - Logger instance.
 * @param {Object} dims - Dimension fields.
 * @param {string} dims.serviceId - Owning service ID.
 * @param {string} dims.replicaId - Replica ID.
 * @param {string} dims.nodeId - Node ID.
 * @param {string} dims.sessionId - Session ID.
 * @param {string} dims.statementType - SQL statement type.
 * @param {number} dims.durationMs - Query execution duration.
 * @param {boolean} dims.success - Whether query succeeded.
 * @param {number} [dims.rowCount] - Rows returned/affected.
 */
function emitQueryMetric(logger, dims) {
  emitMetric(logger, METRICS_LOG_TAG.PGWIRE_QUERY, {
    serviceId: dims.serviceId,
    replicaId: dims.replicaId,
    nodeId: dims.nodeId,
    sessionId: dims.sessionId,
    statementType: dims.statementType,
    durationMs: dims.durationMs,
    success: dims.success,
    rowCount: dims.rowCount ?? 0,
  });
}

/**
 * Emit session lifecycle metric on open or close.
 *
 * @param {Object} logger - Logger instance.
 * @param {Object} dims - Dimension fields.
 * @param {string} dims.serviceId - Owning service ID.
 * @param {string} dims.replicaId - Replica ID.
 * @param {string} dims.nodeId - Node ID.
 * @param {string} dims.sessionId - Session ID.
 * @param {string} dims.event - 'open' or 'close'.
 * @param {number} [dims.durationMs] - Session duration (close).
 * @param {number} [dims.queryCount] - Queries executed (close).
 */
function emitSessionMetric(logger, dims) {
  const data = {
    serviceId: dims.serviceId,
    replicaId: dims.replicaId,
    nodeId: dims.nodeId,
    sessionId: dims.sessionId,
    event: dims.event,
  };
  if (dims.durationMs !== undefined) {
    data.durationMs = dims.durationMs;
  }
  if (dims.queryCount !== undefined) {
    data.queryCount = dims.queryCount;
  }
  emitMetric(logger, METRICS_LOG_TAG.PGWIRE_SESSION, data);
}

/**
 * Emit protocol error metric.
 *
 * @param {Object} logger - Logger instance.
 * @param {Object} dims - Dimension fields.
 * @param {string} dims.serviceId - Owning service ID.
 * @param {string} dims.replicaId - Replica ID.
 * @param {string} dims.nodeId - Node ID.
 * @param {string} [dims.sessionId] - Session ID if available.
 * @param {string} dims.errorCode - SQLSTATE or internal code.
 * @param {string} dims.errorMessage - Human-readable message.
 */
function emitProtocolErrorMetric(logger, dims) {
  emitMetric(logger, METRICS_LOG_TAG.PGWIRE_PROTOCOL_ERROR, {
    serviceId: dims.serviceId,
    replicaId: dims.replicaId,
    nodeId: dims.nodeId,
    sessionId: dims.sessionId ?? null,
    errorCode: dims.errorCode,
    errorMessage: dims.errorMessage,
  });
}

export {
  emitHandshakeMetric,
  emitQueryMetric,
  emitSessionMetric,
  emitProtocolErrorMetric,
};
