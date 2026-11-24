import {NUM} from '../../constants/index.js';
import {pickTypedWriteAnswer} from '../../partition/partition-write-kernel.js';
import {QUERY_STATUS} from '../query-constants.js';
import {pickRoutingDenialFields} from '../query-execution-budget.js';
import {
  normalizeFailureString,
  normalizeRetryAfterMs,
  resolveFailureBackpressureState,
} from './parallel-query-partition-outcomes.js';

const RESULT_ESTIMATE = Object.freeze({
  UTF16_BYTES_PER_CHAR: 2,
  FALLBACK_ROW_BYTES: NUM.HUNDRED,
});

/**
 * Tracks execution metrics for a single partition query.
 */
class PartitionQueryMetrics {
  /**
   * Create partition query metrics.
   * @param {string} partitionId - Partition ID.
   */
  constructor(partitionId) {
    this.partitionId = partitionId;
    this.startTime = null;
    this.endTime = null;
    this.latencyMs = null;
    this.rowCount = 0;
    this.bytesRead = 0;
    this.status = QUERY_STATUS.PENDING; // pending, running, completed, failed, timeout
    this.error = null;
    this.isSpeculative = false;
    this.errorCode = null;
    this.retryAfterMs = null;
    this.deferRetry = false;
    this.participantNodeId = null;
    this.participantAddress = null;
    this.backpressured = false;
    this.failedTable = null;
  }

  /**
   * Mark query as started.
   */
  start() {
    this.startTime = Date.now();
    this.status = QUERY_STATUS.RUNNING;
  }

  /**
   * Mark query as completed.
   * @param {number} rowCount - Number of rows returned.
   * @param {number} bytesRead - Estimated bytes read.
   */
  complete(rowCount, bytesRead = 0) {
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
    this.rowCount = rowCount;
    this.bytesRead = bytesRead;
    this.status = QUERY_STATUS.COMPLETED;
  }

  /**
   * Mark query as failed.
   * @param {Error} error - Error that occurred.
   * @param {Object} diagnostics - Failure diagnostics.
   */
  fail(error, diagnostics = {}) {
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
    this.status = QUERY_STATUS.FAILED;
    this.error = error.message;
    this.errorCode = normalizeFailureString(diagnostics?.errorCode);
    this.retryAfterMs = normalizeRetryAfterMs(diagnostics?.retryAfterMs);
    this.deferRetry = diagnostics?.deferRetry === true;
    this.participantNodeId =
      normalizeFailureString(diagnostics?.participantNodeId);
    this.participantAddress =
      normalizeFailureString(diagnostics?.participantAddress);
    this.backpressured = resolveFailureBackpressureState(diagnostics);
    this.failedTable = normalizeFailureString(diagnostics?.failedTable);
    Object.assign(
      this,
      pickTypedWriteAnswer(diagnostics),
      pickRoutingDenialFields(diagnostics),
    );
    if (
      typeof diagnostics?.deliveryDisposition === 'string' &&
      diagnostics.deliveryDisposition.length > 0
    ) {
      this.deliveryDisposition = diagnostics.deliveryDisposition;
    }
  }

  /**
   * Mark query as timed out.
   */
  timeout() {
    this.endTime = Date.now();
    this.latencyMs = this.endTime - this.startTime;
    this.status = QUERY_STATUS.TIMEOUT;
  }
}

/**
 * Tracks overall query execution metrics.
 */
class QueryExecutionMetrics {
  /**
   * Create query execution metrics.
   * @param {string} queryId - Query ID.
   * @param {number} partitionCount - Number of partitions.
   */
  constructor(queryId, partitionCount) {
    this.queryId = queryId;
    this.partitionCount = partitionCount;
    this.startTime = Date.now();
    this.endTime = null;
    this.totalLatencyMs = null;
    this.partitionMetrics = new Map();
    this.totalRows = 0;
    this.totalBytes = 0;
    this.stragglers = [];
    this.speculativeExecutions = 0;
  }

  /**
   * Add partition metrics. First completion wins: once a partition has
   * a COMPLETED entry, a later attempt's completion (the losing side of
   * a hedged partition) must neither overwrite the winner's entry nor
   * re-add its rows/bytes to the fan-out totals — the inflated totals
   * would misreport metrics and can spuriously trip the result-buffer
   * limit. A completion may still replace an earlier failure.
   * @param {PartitionQueryMetrics} metrics - Partition metrics.
   */
  addPartitionMetrics(metrics) {
    const existing = this.partitionMetrics.get(metrics.partitionId);
    if (existing && existing.status === QUERY_STATUS.COMPLETED) {
      return;
    }
    this.partitionMetrics.set(metrics.partitionId, metrics);
    if (metrics.status === QUERY_STATUS.COMPLETED) {
      this.totalRows += metrics.rowCount;
      this.totalBytes += metrics.bytesRead;
    }
  }

  /**
   * Whether at least one partition has completed successfully. Used as
   * the straggler-hedge evidence gate: a sub-millisecond completion has
   * latency 0 and would make a median>0 gate read as "no evidence".
   * @return {boolean} True when a completed partition exists.
   */
  hasCompletedPartitions() {
    for (const partitionMetrics of this.partitionMetrics.values()) {
      if (partitionMetrics.status === QUERY_STATUS.COMPLETED) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calculate median latency of completed partitions.
   * @return {number} Median latency in ms.
   */
  getMedianLatency() {
    const latencies = Array.from(this.partitionMetrics.values())
      .filter((m) => m.status === QUERY_STATUS.COMPLETED && m.latencyMs !== null)
      .map((m) => m.latencyMs)
      .sort((a, b) => a - b);

    if (latencies.length === 0) return 0;

    const mid = Math.floor(latencies.length / 2);
    return latencies.length % 2 === 0 ?
      (latencies[mid - 1] + latencies[mid]) / 2 :
      latencies[mid];
  }

  /**
   * Finalize metrics.
   */
  finalize() {
    this.endTime = Date.now();
    this.totalLatencyMs = this.endTime - this.startTime;
  }
}

const RESIDENT_BYTES_SYMBOL_KEY = 'lagrange.query.residentResultBytes';
const PRESENTED_SAFE_INTEGERS_SYMBOL_KEY =
  'lagrange.query.presentedSafeIntegers';
const RESIDENT_RESULT_BYTES_SYMBOL = Symbol.for(RESIDENT_BYTES_SYMBOL_KEY);
const PRESENTED_SAFE_INTEGERS_SYMBOL = Symbol.for(
  PRESENTED_SAFE_INTEGERS_SYMBOL_KEY,
);
const MAX_JSON_ESTIMATE_DEPTH = 16;
const BYTE_THREE_DIGIT_FLOOR = 100;
const BYTE_TWO_DIGIT_FLOOR = 10;
const DIGITS_THREE = 3;
const CHAR_CODE_QUOTE = 0x22;
const CHAR_CODE_BACKSLASH = 0x5c;
const CHAR_CODE_BACKSPACE = 0x08;
const CHAR_CODE_VTAB = 0x0b;
const CHAR_CODE_CR = 0x0d;
const CHAR_CODE_SPACE = 0x20;
const UNICODE_ESCAPE_CHARS = 6;
const BUFFER_JSON_WRAPPER_CHARS = 27;
const JSON_NULL_OR_TRUE_CHARS = 4;
const JSON_FALSE_CHARS = 5;
const TYPE_STRING = 'string';
const TYPE_NUMBER = 'number';
const TYPE_BOOLEAN = 'boolean';
const TYPE_BIGINT = 'bigint';
const TYPE_FUNCTION = 'function';
const TYPE_SYMBOL = 'symbol';
const TYPE_OBJECT = 'object';
const ERR_MAX_ESTIMATE_DEPTH = 'Maximum result byte estimation depth exceeded';

function byteDecimalDigits(byteValue) {
  if (byteValue >= BYTE_THREE_DIGIT_FLOOR) return DIGITS_THREE;
  return byteValue >= BYTE_TWO_DIGIT_FLOOR ? 2 : 1;
}

function isShortEscapedCharCode(code) {
  if (code === CHAR_CODE_QUOTE || code === CHAR_CODE_BACKSLASH) {
    return true;
  }
  return (
    code >= CHAR_CODE_BACKSPACE &&
    code <= CHAR_CODE_CR &&
    code !== CHAR_CODE_VTAB
  );
}

function estimateJsonStringChars(str) {
  let chars = 2;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (isShortEscapedCharCode(code)) {
      chars += 2;
    } else if (code < CHAR_CODE_SPACE) {
      chars += UNICODE_ESCAPE_CHARS;
    } else {
      chars += 1;
    }
  }
  return chars;
}

function estimateBufferJsonChars(buf) {
  if (buf.length === 0) return BUFFER_JSON_WRAPPER_CHARS;
  let chars = BUFFER_JSON_WRAPPER_CHARS + (buf.length - 1);
  for (let i = 0; i < buf.length; i += 1) {
    chars += byteDecimalDigits(buf[i]);
  }
  return chars;
}

function estimatePrimitiveJsonChars(value, type) {
  if (type === TYPE_STRING) return estimateJsonStringChars(value);
  if (type === TYPE_NUMBER) {
    return Number.isFinite(value) ? String(value).length : JSON_NULL_OR_TRUE_CHARS;
  }
  if (type === TYPE_BOOLEAN) {
    return value ? JSON_NULL_OR_TRUE_CHARS : JSON_FALSE_CHARS;
  }
  if (type === TYPE_BIGINT) return String(value).length;
  return JSON_NULL_OR_TRUE_CHARS;
}

function isIncludedJsonPropertyValue(propVal) {
  const propType = typeof propVal;
  return (
    propVal !== undefined &&
    propType !== TYPE_FUNCTION &&
    propType !== TYPE_SYMBOL
  );
}

function estimateArrayJsonChars(arr, depth) {
  if (arr.length === 0) return 2;
  let chars = 2 + (arr.length - 1);
  for (let i = 0; i < arr.length; i += 1) {
    chars += estimateJsonValueChars(arr[i], depth + 1);
  }
  return chars;
}

function estimateObjectJsonChars(obj, depth) {
  const keys = Object.keys(obj);
  let chars = 2;
  let included = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const propVal = obj[key];
    if (!isIncludedJsonPropertyValue(propVal)) {
      continue;
    }
    if (included > 0) chars += 1;
    included += 1;
    chars += estimateJsonStringChars(key) + 1 + estimateJsonValueChars(propVal, depth + 1);
  }
  return chars;
}

function estimateJsonValueChars(value, depth = 0) {
  if (depth > MAX_JSON_ESTIMATE_DEPTH) {
    throw new RangeError(ERR_MAX_ESTIMATE_DEPTH);
  }
  if (value === null || value === undefined) return JSON_NULL_OR_TRUE_CHARS;
  const type = typeof value;
  if (type !== TYPE_OBJECT) {
    return estimatePrimitiveJsonChars(value, type);
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return estimateBufferJsonChars(value);
  }
  return Array.isArray(value) ?
    estimateArrayJsonChars(value, depth) :
    estimateObjectJsonChars(value, depth);
}

/**
 * Stamp precomputed resident byte count and presentation policy onto a row array.
 * @param {Array} collection - Row array (`rows` or `rawRows`).
 * @param {boolean} safeIntegers - Presentation policy applied.
 * @param {number} residentBytes - Precomputed resident UTF-16 byte estimate.
 * @return {Array} The stamped collection.
 */
function stampPresentedRowCollection(collection, safeIntegers, residentBytes) {
  if (!Array.isArray(collection)) return collection;
  Object.defineProperty(collection, PRESENTED_SAFE_INTEGERS_SYMBOL, {
    value: safeIntegers === true,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  if (Number.isSafeInteger(residentBytes) && residentBytes >= 0) {
    Object.defineProperty(collection, RESIDENT_RESULT_BYTES_SYMBOL, {
      value: residentBytes,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
  return collection;
}

/**
 * Estimate bytes in result rows without allocating a JSON.stringify string.
 * Reuses precomputed byte accounting from the decode/presentation pass when
 * available.
 * @param {Array} rows - Result rows.
 * @return {number} Estimated bytes.
 */
function estimateResultBytes(rows) {
  if (!rows || rows.length === 0) return 0;
  const precomputed = rows[RESIDENT_RESULT_BYTES_SYMBOL];
  if (Number.isSafeInteger(precomputed) && precomputed >= 0) {
    return precomputed;
  }
  try {
    const estimated =
      estimateJsonValueChars(rows, 0) * RESULT_ESTIMATE.UTF16_BYTES_PER_CHAR;
    Object.defineProperty(rows, RESIDENT_RESULT_BYTES_SYMBOL, {
      value: estimated,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    return estimated;
  } catch (_estimateErr) {
    return rows.length * RESULT_ESTIMATE.FALLBACK_ROW_BYTES;
  }
}

/**
 * Format metrics for response.
 * @param {QueryExecutionMetrics} metrics - Metrics tracker.
 * @return {Object} Formatted metrics.
 */
function formatQueryExecutionMetrics(metrics) {
  const participantFailures = Array.from(metrics.partitionMetrics.values())
    .filter((metric) => metric.status === QUERY_STATUS.FAILED)
    .map((metric) => ({
      ...pickTypedWriteAnswer(metric),
      ...pickRoutingDenialFields(metric),
      ...(typeof metric?.deliveryDisposition === 'string' &&
      metric.deliveryDisposition.length > 0 ?
        {deliveryDisposition: metric.deliveryDisposition} :
        {}),
      partitionId: metric.partitionId,
      participantNodeId: metric.participantNodeId,
      participantAddress: metric.participantAddress,
      errorCode: metric.errorCode,
      error: metric.error,
      durationMs: metric.latencyMs,
      retryAfterMs: metric.retryAfterMs,
      deferRetry: metric.deferRetry,
      backpressured: metric.backpressured,
      failedTable: metric.failedTable,
    }));
  return {
    queryId: metrics.queryId,
    partitionCount: metrics.partitionCount,
    totalLatencyMs: metrics.totalLatencyMs,
    medianLatencyMs: metrics.getMedianLatency(),
    totalRows: metrics.totalRows,
    totalBytes: metrics.totalBytes,
    stragglers: metrics.stragglers,
    speculativeExecutions: metrics.speculativeExecutions,
    participantFailures,
    firstFailedParticipant:
      participantFailures.length > 0 ?
        participantFailures[0] :
        null,
    partitionLatencies: Array.from(metrics.partitionMetrics.values()).map((m) => ({
      partitionId: m.partitionId,
      latencyMs: m.latencyMs,
      status: m.status,
      rowCount: m.rowCount,
    })),
  };
}

export {
  PRESENTED_SAFE_INTEGERS_SYMBOL,
  RESIDENT_RESULT_BYTES_SYMBOL,
  estimateJsonStringChars,
  estimateJsonValueChars,
  estimateResultBytes,
  formatQueryExecutionMetrics,
  PartitionQueryMetrics,
  QueryExecutionMetrics,
  stampPresentedRowCollection,
};
