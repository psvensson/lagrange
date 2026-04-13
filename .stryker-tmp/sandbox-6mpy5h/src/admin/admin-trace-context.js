/**
 * Trace context propagation for the adapter -> meta service ->
 * SQL -> lifecycle chain.
 *
 * Reuses generateCorrelationId from correlation utility — no
 * duplication.
 *
 * Requirements: 2.3, 12.1
 * @module admin/admin-trace-context
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
import { generateCorrelationId, CORRELATION_HEADER } from '../utils/correlation.js';
const TRACE_FIELD = Object.freeze(stryMutAct_9fa48("8704") ? {} : (stryCov_9fa48("8704"), {
  TRACE_ID: stryMutAct_9fa48("8705") ? "" : (stryCov_9fa48("8705"), 'traceId'),
  SPAN_ID: stryMutAct_9fa48("8706") ? "" : (stryCov_9fa48("8706"), 'spanId'),
  PARENT_SPAN_ID: stryMutAct_9fa48("8707") ? "" : (stryCov_9fa48("8707"), 'parentSpanId'),
  SERVICE_NAME: stryMutAct_9fa48("8708") ? "" : (stryCov_9fa48("8708"), 'serviceName'),
  OPERATION: stryMutAct_9fa48("8709") ? "" : (stryCov_9fa48("8709"), 'operation'),
  TIMESTAMP: stryMutAct_9fa48("8710") ? "" : (stryCov_9fa48("8710"), 'timestamp')
}));
const TRACE_CONTEXT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("8711") ? {} : (stryCov_9fa48("8711"), {
  SERVICE_NAME_REQUIRED: stryMutAct_9fa48("8712") ? "" : (stryCov_9fa48("8712"), 'Service name is required'),
  OPERATION_REQUIRED: stryMutAct_9fa48("8713") ? "" : (stryCov_9fa48("8713"), 'Operation is required'),
  PARENT_CONTEXT_REQUIRED: stryMutAct_9fa48("8714") ? "" : (stryCov_9fa48("8714"), 'Parent trace context is required')
}));
const SPAN_HEADER = stryMutAct_9fa48("8715") ? "" : (stryCov_9fa48("8715"), 'x-span-id');

/**
 * Create a new trace context for the start of a request chain.
 *
 * @param {string} serviceName - Name of the originating service.
 * @param {string} operation - Operation being performed.
 * @param {string} [parentTraceId] - Optional parent trace ID to
 *   continue an existing trace.
 * @return {Object} Frozen trace context object.
 */
function createTraceContext(serviceName, operation, parentTraceId) {
  if (stryMutAct_9fa48("8716")) {
    {}
  } else {
    stryCov_9fa48("8716");
    if (stryMutAct_9fa48("8719") ? false : stryMutAct_9fa48("8718") ? true : stryMutAct_9fa48("8717") ? serviceName : (stryCov_9fa48("8717", "8718", "8719"), !serviceName)) {
      if (stryMutAct_9fa48("8720")) {
        {}
      } else {
        stryCov_9fa48("8720");
        throw new Error(TRACE_CONTEXT_ERROR_MSG.SERVICE_NAME_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("8723") ? false : stryMutAct_9fa48("8722") ? true : stryMutAct_9fa48("8721") ? operation : (stryCov_9fa48("8721", "8722", "8723"), !operation)) {
      if (stryMutAct_9fa48("8724")) {
        {}
      } else {
        stryCov_9fa48("8724");
        throw new Error(TRACE_CONTEXT_ERROR_MSG.OPERATION_REQUIRED);
      }
    }
    return Object.freeze(stryMutAct_9fa48("8725") ? {} : (stryCov_9fa48("8725"), {
      [TRACE_FIELD.TRACE_ID]: stryMutAct_9fa48("8728") ? parentTraceId && generateCorrelationId() : stryMutAct_9fa48("8727") ? false : stryMutAct_9fa48("8726") ? true : (stryCov_9fa48("8726", "8727", "8728"), parentTraceId || generateCorrelationId()),
      [TRACE_FIELD.SPAN_ID]: generateCorrelationId(),
      [TRACE_FIELD.PARENT_SPAN_ID]: null,
      [TRACE_FIELD.SERVICE_NAME]: serviceName,
      [TRACE_FIELD.OPERATION]: operation,
      [TRACE_FIELD.TIMESTAMP]: Date.now()
    }));
  }
}

/**
 * Create a child span from a parent trace context.
 *
 * @param {Object} parentContext - The parent trace context.
 * @param {string} serviceName - Name of the child service.
 * @param {string} operation - Operation being performed.
 * @return {Object} Frozen child trace context object.
 */
function createChildSpan(parentContext, serviceName, operation) {
  if (stryMutAct_9fa48("8729")) {
    {}
  } else {
    stryCov_9fa48("8729");
    if (stryMutAct_9fa48("8732") ? false : stryMutAct_9fa48("8731") ? true : stryMutAct_9fa48("8730") ? parentContext : (stryCov_9fa48("8730", "8731", "8732"), !parentContext)) {
      if (stryMutAct_9fa48("8733")) {
        {}
      } else {
        stryCov_9fa48("8733");
        throw new Error(TRACE_CONTEXT_ERROR_MSG.PARENT_CONTEXT_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("8736") ? false : stryMutAct_9fa48("8735") ? true : stryMutAct_9fa48("8734") ? serviceName : (stryCov_9fa48("8734", "8735", "8736"), !serviceName)) {
      if (stryMutAct_9fa48("8737")) {
        {}
      } else {
        stryCov_9fa48("8737");
        throw new Error(TRACE_CONTEXT_ERROR_MSG.SERVICE_NAME_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("8740") ? false : stryMutAct_9fa48("8739") ? true : stryMutAct_9fa48("8738") ? operation : (stryCov_9fa48("8738", "8739", "8740"), !operation)) {
      if (stryMutAct_9fa48("8741")) {
        {}
      } else {
        stryCov_9fa48("8741");
        throw new Error(TRACE_CONTEXT_ERROR_MSG.OPERATION_REQUIRED);
      }
    }
    return Object.freeze(stryMutAct_9fa48("8742") ? {} : (stryCov_9fa48("8742"), {
      [TRACE_FIELD.TRACE_ID]: parentContext[TRACE_FIELD.TRACE_ID],
      [TRACE_FIELD.SPAN_ID]: generateCorrelationId(),
      [TRACE_FIELD.PARENT_SPAN_ID]: parentContext[TRACE_FIELD.SPAN_ID],
      [TRACE_FIELD.SERVICE_NAME]: serviceName,
      [TRACE_FIELD.OPERATION]: operation,
      [TRACE_FIELD.TIMESTAMP]: Date.now()
    }));
  }
}

/**
 * Extract trace context into headers for propagation.
 *
 * @param {Object} traceContext - The trace context to extract.
 * @return {Object} Headers object with correlation and span IDs.
 */
function extractTraceHeaders(traceContext) {
  if (stryMutAct_9fa48("8743")) {
    {}
  } else {
    stryCov_9fa48("8743");
    return stryMutAct_9fa48("8744") ? {} : (stryCov_9fa48("8744"), {
      [CORRELATION_HEADER]: traceContext[TRACE_FIELD.TRACE_ID],
      [SPAN_HEADER]: traceContext[TRACE_FIELD.SPAN_ID]
    });
  }
}
export { TRACE_FIELD, TRACE_CONTEXT_ERROR_MSG, createTraceContext, createChildSpan, extractTraceHeaders };