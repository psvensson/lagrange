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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { METRICS_LOG_TAG } from '../constants/metrics-constants.js';

/**
 * Emit a metrics log entry. Failures are silently swallowed
 * so instrumentation never propagates to callers.
 *
 * @param {Object} logger - Logger instance.
 * @param {string} tag - METRICS_LOG_TAG value.
 * @param {Object} data - Structured metric payload.
 */
function emitMetric(logger, tag, data) {
  if (stryMutAct_9fa48("147596")) {
    {}
  } else {
    stryCov_9fa48("147596");
    try {
      if (stryMutAct_9fa48("147597")) {
        {}
      } else {
        stryCov_9fa48("147597");
        logger.info(tag, data);
      }
    } catch (_metricsErr) {
      // Metrics logging failures must not propagate to callers
    }
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
  if (stryMutAct_9fa48("147598")) {
    {}
  } else {
    stryCov_9fa48("147598");
    emitMetric(logger, METRICS_LOG_TAG.PGWIRE_HANDSHAKE, stryMutAct_9fa48("147599") ? {} : (stryCov_9fa48("147599"), {
      serviceId: dims.serviceId,
      replicaId: dims.replicaId,
      nodeId: dims.nodeId,
      sessionId: dims.sessionId,
      success: dims.success,
      durationMs: dims.durationMs
    }));
  }
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
  if (stryMutAct_9fa48("147600")) {
    {}
  } else {
    stryCov_9fa48("147600");
    emitMetric(logger, METRICS_LOG_TAG.PGWIRE_QUERY, stryMutAct_9fa48("147601") ? {} : (stryCov_9fa48("147601"), {
      serviceId: dims.serviceId,
      replicaId: dims.replicaId,
      nodeId: dims.nodeId,
      sessionId: dims.sessionId,
      statementType: dims.statementType,
      durationMs: dims.durationMs,
      success: dims.success,
      rowCount: stryMutAct_9fa48("147602") ? dims.rowCount && 0 : (stryCov_9fa48("147602"), dims.rowCount ?? 0)
    }));
  }
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
  if (stryMutAct_9fa48("147603")) {
    {}
  } else {
    stryCov_9fa48("147603");
    const data = stryMutAct_9fa48("147604") ? {} : (stryCov_9fa48("147604"), {
      serviceId: dims.serviceId,
      replicaId: dims.replicaId,
      nodeId: dims.nodeId,
      sessionId: dims.sessionId,
      event: dims.event
    });
    if (stryMutAct_9fa48("147607") ? dims.durationMs === undefined : stryMutAct_9fa48("147606") ? false : stryMutAct_9fa48("147605") ? true : (stryCov_9fa48("147605", "147606", "147607"), dims.durationMs !== undefined)) {
      if (stryMutAct_9fa48("147608")) {
        {}
      } else {
        stryCov_9fa48("147608");
        data.durationMs = dims.durationMs;
      }
    }
    if (stryMutAct_9fa48("147611") ? dims.queryCount === undefined : stryMutAct_9fa48("147610") ? false : stryMutAct_9fa48("147609") ? true : (stryCov_9fa48("147609", "147610", "147611"), dims.queryCount !== undefined)) {
      if (stryMutAct_9fa48("147612")) {
        {}
      } else {
        stryCov_9fa48("147612");
        data.queryCount = dims.queryCount;
      }
    }
    emitMetric(logger, METRICS_LOG_TAG.PGWIRE_SESSION, data);
  }
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
  if (stryMutAct_9fa48("147613")) {
    {}
  } else {
    stryCov_9fa48("147613");
    emitMetric(logger, METRICS_LOG_TAG.PGWIRE_PROTOCOL_ERROR, stryMutAct_9fa48("147614") ? {} : (stryCov_9fa48("147614"), {
      serviceId: dims.serviceId,
      replicaId: dims.replicaId,
      nodeId: dims.nodeId,
      sessionId: stryMutAct_9fa48("147615") ? dims.sessionId && null : (stryCov_9fa48("147615"), dims.sessionId ?? null),
      errorCode: dims.errorCode,
      errorMessage: dims.errorMessage
    }));
  }
}
export { emitHandshakeMetric, emitQueryMetric, emitSessionMetric, emitProtocolErrorMetric };