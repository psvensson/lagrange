/**
 * DebugEmitter builds and emits structured Trace_Event envelopes.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  DEBUG_ERROR_MSG,
  DEBUG_TRACE_FIELD as TF,
  DEBUG_TRACE_LEVEL_SET,
  DEBUG_TRACE_SOURCE,
} from './debug-constants.js';

/**
 * Emits trace events when debug sessions are active.
 */
class DebugEmitter {
  /**
   * @param {Object} [options]
   * @param {Object} [options.sessionResolver]
   * @param {Object} [options.traceCollector]
   * @param {Function} [options.now]
   * @param {Function} [options.buildTraceEvent]
   * @param {string} [options.nodeId]
   * @param {string} [options.serviceDefinitionId]
   * @param {string} [options.replicaId]
   * @param {string} [options.runtimeKind]
   * @param {string} [options.source]
   */
  constructor(options = {}) {
    this.sessionResolver = options.sessionResolver || null;
    this.traceCollector = options.traceCollector || null;
    this.now = options.now || (() => Date.now());
    this.nodeId = options.nodeId || null;
    this.serviceDefinitionId = options.serviceDefinitionId || null;
    this.replicaId = options.replicaId || null;
    this.runtimeKind = options.runtimeKind || null;
    this.source = options.source || DEBUG_TRACE_SOURCE.SERVICE;
    this.buildTraceEvent = options.buildTraceEvent || buildTraceEvent;
  }

  /**
   * Emit one trace event when trace session is active.
   * @param {Object} request
   * @param {string} request.level
   * @param {string} request.message
   * @param {*} [request.context]
   * @param {Object} [request.scope]
   * @param {Object} [request.metadata]
   * @return {boolean}
   */
  emitTrace(request) {
    if (!request || typeof request !== TYPEOF.OBJECT) {
      throw new Error(DEBUG_ERROR_MSG.TRACE_EVENT_REQUIRED);
    }
    const level = normalizeLevel(request.level);
    const message = normalizeMessage(request.message);
    const scope = request.scope || null;
    const metadata = request.metadata || null;

    if (!this.isTraceActive(scope)) {
      return false;
    }
    if (!this.traceCollector ||
      typeof this.traceCollector.emit !== TYPEOF.FUNCTION) {
      return false;
    }

    const event = this.buildTraceEvent({
      level,
      message,
      context: request.context ?? null,
      timestamp: this.now(),
      scope,
      metadata,
      fallback: {
        nodeId: this.nodeId,
        serviceDefinitionId: this.serviceDefinitionId,
        replicaId: this.replicaId,
        runtimeKind: this.runtimeKind,
        source: this.source,
      },
    });
    this.traceCollector.emit(event);
    return true;
  }

  /**
   * @param {Object|null} scope
   * @return {boolean}
   */
  isTraceActive(scope = null) {
    if (!this.sessionResolver ||
      typeof this.sessionResolver.isTraceActive !== TYPEOF.FUNCTION) {
      return false;
    }
    return this.sessionResolver.isTraceActive(scope || {});
  }

  /**
   * Build a stable trace API for runtime contexts.
   * @param {Object} [scope]
   * @param {Object} [metadata]
   * @return {Readonly<Object>}
   */
  createTraceApi(scope = {}, metadata = {}) {
    return Object.freeze({
      trace: (level, message, context = null) =>
        this.emitTrace({
          level,
          message,
          context,
          scope,
          metadata,
        }),
    });
  }
}

/**
 * Build the canonical Trace_Event envelope.
 * @param {Object} request
 * @return {Object}
 */
function buildTraceEvent(request) {
  const scope = request.scope || {};
  const metadata = request.metadata || {};
  const fallback = request.fallback || {};
  return {
    [TF.LEVEL]: request.level,
    [TF.MESSAGE]: request.message,
    [TF.CONTEXT]: request.context ?? null,
    [TF.TIMESTAMP]: request.timestamp,
    [TF.LINEAGE_ID]: resolveField(scope, metadata, 'lineageId'),
    [TF.STAGE_ID]: resolveNullableInt(
      resolveField(scope, metadata, 'stageId'),
    ),
    [TF.PARTITION_ID]: resolveField(scope, metadata, 'partitionId'),
    [TF.NODE_ID]: resolveField(scope, metadata, 'nodeId', fallback.nodeId),
    [TF.SERVICE_DEFINITION_ID]: resolveField(
      scope,
      metadata,
      'serviceDefinitionId',
      fallback.serviceDefinitionId,
    ),
    [TF.REPLICA_ID]: resolveField(scope, metadata, 'replicaId', fallback.replicaId),
    [TF.RUNTIME_KIND]: resolveField(
      scope,
      metadata,
      'runtimeKind',
      fallback.runtimeKind,
    ),
    [TF.SOURCE]: resolveField(scope, metadata, 'source', fallback.source),
    [TF.SESSION_ID]: resolveField(scope, metadata, 'sessionId'),
  };
}

/**
 * @param {string} level
 * @return {string}
 */
function normalizeLevel(level) {
  if (typeof level !== TYPEOF.STRING ||
    !DEBUG_TRACE_LEVEL_SET.has(level)) {
    throw new Error(
      DEBUG_ERROR_MSG.TRACE_LEVEL_INVALID_PREFIX +
      String(level),
    );
  }
  return level;
}

/**
 * @param {string} message
 * @return {string}
 */
function normalizeMessage(message) {
  if (typeof message !== TYPEOF.STRING ||
    message.length <= NUM.ZERO) {
    throw new Error(DEBUG_ERROR_MSG.TRACE_MESSAGE_REQUIRED);
  }
  return message;
}

/**
 * @param {Object} scope
 * @param {Object} metadata
 * @param {string} fieldName
 * @param {*} [fallback]
 * @return {*}
 */
function resolveField(scope, metadata, fieldName, fallback = null) {
  if (metadata[fieldName] !== undefined) {
    return metadata[fieldName];
  }
  if (scope[fieldName] !== undefined) {
    return scope[fieldName];
  }
  return fallback;
}

/**
 * @param {*} value
 * @return {number|null}
 */
function resolveNullableInt(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.trunc(number);
}

export {
  DebugEmitter,
  buildTraceEvent,
};
