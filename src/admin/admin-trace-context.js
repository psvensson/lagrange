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

import {
  generateCorrelationId,
  CORRELATION_HEADER,
} from '../utils/correlation.js';

const TRACE_FIELD = Object.freeze({
  TRACE_ID: 'traceId',
  SPAN_ID: 'spanId',
  PARENT_SPAN_ID: 'parentSpanId',
  SERVICE_NAME: 'serviceName',
  OPERATION: 'operation',
  TIMESTAMP: 'timestamp',
});

const TRACE_CONTEXT_ERROR_MSG = Object.freeze({
  SERVICE_NAME_REQUIRED: 'Service name is required',
  OPERATION_REQUIRED: 'Operation is required',
  PARENT_CONTEXT_REQUIRED: 'Parent trace context is required',
});

const SPAN_HEADER = 'x-span-id';

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
  if (!serviceName) {
    throw new Error(TRACE_CONTEXT_ERROR_MSG.SERVICE_NAME_REQUIRED);
  }
  if (!operation) {
    throw new Error(TRACE_CONTEXT_ERROR_MSG.OPERATION_REQUIRED);
  }
  return Object.freeze({
    [TRACE_FIELD.TRACE_ID]:
      parentTraceId || generateCorrelationId(),
    [TRACE_FIELD.SPAN_ID]: generateCorrelationId(),
    [TRACE_FIELD.PARENT_SPAN_ID]: null,
    [TRACE_FIELD.SERVICE_NAME]: serviceName,
    [TRACE_FIELD.OPERATION]: operation,
    [TRACE_FIELD.TIMESTAMP]: Date.now(),
  });
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
  if (!parentContext) {
    throw new Error(
      TRACE_CONTEXT_ERROR_MSG.PARENT_CONTEXT_REQUIRED,
    );
  }
  if (!serviceName) {
    throw new Error(TRACE_CONTEXT_ERROR_MSG.SERVICE_NAME_REQUIRED);
  }
  if (!operation) {
    throw new Error(TRACE_CONTEXT_ERROR_MSG.OPERATION_REQUIRED);
  }
  return Object.freeze({
    [TRACE_FIELD.TRACE_ID]:
      parentContext[TRACE_FIELD.TRACE_ID],
    [TRACE_FIELD.SPAN_ID]: generateCorrelationId(),
    [TRACE_FIELD.PARENT_SPAN_ID]:
      parentContext[TRACE_FIELD.SPAN_ID],
    [TRACE_FIELD.SERVICE_NAME]: serviceName,
    [TRACE_FIELD.OPERATION]: operation,
    [TRACE_FIELD.TIMESTAMP]: Date.now(),
  });
}

/**
 * Extract trace context into headers for propagation.
 *
 * @param {Object} traceContext - The trace context to extract.
 * @return {Object} Headers object with correlation and span IDs.
 */
function extractTraceHeaders(traceContext) {
  return {
    [CORRELATION_HEADER]:
      traceContext[TRACE_FIELD.TRACE_ID],
    [SPAN_HEADER]:
      traceContext[TRACE_FIELD.SPAN_ID],
  };
}

export {
  TRACE_FIELD,
  TRACE_CONTEXT_ERROR_MSG,
  createTraceContext,
  createChildSpan,
  extractTraceHeaders,
};
