import {NUM} from '../../constants/index.js';
import {QUERY_STATUS} from '../query-constants.js';
import {
  normalizeFailureString,
  normalizeRetryAfterMs,
  resolveFailureBackpressureState,
} from './parallel-query-partition-outcomes.js';

const RESULT_ESTIMATE = Object.freeze({
  UTF16_BYTES_PER_CHAR: NUM.TWO,
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
    this.rowCount = NUM.ZERO;
    this.bytesRead = NUM.ZERO;
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
  complete(rowCount, bytesRead = NUM.ZERO) {
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
    this.totalRows = NUM.ZERO;
    this.totalBytes = NUM.ZERO;
    this.stragglers = [];
    this.speculativeExecutions = NUM.ZERO;
  }

  /**
   * Add partition metrics.
   * @param {PartitionQueryMetrics} metrics - Partition metrics.
   */
  addPartitionMetrics(metrics) {
    this.partitionMetrics.set(metrics.partitionId, metrics);
    if (metrics.status === QUERY_STATUS.COMPLETED) {
      this.totalRows += metrics.rowCount;
      this.totalBytes += metrics.bytesRead;
    }
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

    if (latencies.length === NUM.ZERO) return NUM.ZERO;

    const mid = Math.floor(latencies.length / NUM.TWO);
    return latencies.length % NUM.TWO === NUM.ZERO ?
      (latencies[mid - NUM.ONE] + latencies[mid]) / NUM.TWO :
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

/**
 * Estimate bytes in result rows.
 * @param {Array} rows - Result rows.
 * @return {number} Estimated bytes.
 */
function estimateResultBytes(rows) {
  if (!rows || rows.length === NUM.ZERO) return NUM.ZERO;
  try {
    return JSON.stringify(rows).length * RESULT_ESTIMATE.UTF16_BYTES_PER_CHAR;
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
      participantFailures.length > NUM.ZERO ?
        participantFailures[NUM.ZERO] :
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
  estimateResultBytes,
  formatQueryExecutionMetrics,
  PartitionQueryMetrics,
  QueryExecutionMetrics,
};
