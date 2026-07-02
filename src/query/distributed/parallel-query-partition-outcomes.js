
function normalizeRetryAfterMs(value) {
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    null;
}

function normalizeFailureString(value) {
  return typeof value === 'string' && value.length > 0 ?
    value :
    null;
}

function resolveFailureBackpressureState(diagnostics = {}) {
  if (typeof diagnostics?.backpressured === 'boolean') {
    return diagnostics.backpressured;
  }
  if (diagnostics?.deferRetry === true) {
    return true;
  }
  return Number.isFinite(diagnostics?.retryAfterMs) &&
    diagnostics.retryAfterMs > 0;
}

/**
 * Normalize one partition-execution failure snapshot.
 * @param {string} partitionId - Partition ID.
 * @param {Object} partitionMetrics - Partition metrics.
 * @param {Object} failure - Failure-like object or error.
 * @param {string} fallbackErrorMessage - Fallback error text.
 * @return {Object} Normalized failure snapshot.
 */
function normalizePartitionExecutionFailureSnapshot(
  partitionId,
  partitionMetrics,
  failure,
  fallbackErrorMessage,
) {
  return {
    partitionId,
    status: partitionMetrics.status,
    error: normalizeFailureString(failure?.error) ||
      normalizeFailureString(failure?.message) ||
      fallbackErrorMessage,
    errorCode: normalizeFailureString(
      failure?.errorCode || failure?.code,
    ),
    retryAfterMs: normalizeRetryAfterMs(failure?.retryAfterMs),
    deferRetry: failure?.deferRetry === true,
    participantNodeId:
      normalizeFailureString(failure?.participantNodeId),
    participantAddress:
      normalizeFailureString(failure?.participantAddress),
    backpressured: resolveFailureBackpressureState(failure),
    failedTable: normalizeFailureString(failure?.failedTable),
    durationMs: partitionMetrics.latencyMs,
    rows: failure?.rows || [],
  };
}

/**
 * Build the canonical partition-execution failure outcome.
 * @param {Object} snapshot - Normalized failure snapshot.
 * @return {Object} Failure result.
 */
function buildPartitionExecutionFailureOutcome(snapshot) {
  return {
    partitionId: snapshot.partitionId,
    success: false,
    status: snapshot.status,
    error: snapshot.error,
    errorCode: snapshot.errorCode,
    retryAfterMs: snapshot.retryAfterMs,
    deferRetry: snapshot.deferRetry,
    participantNodeId: snapshot.participantNodeId,
    participantAddress: snapshot.participantAddress,
    backpressured: snapshot.backpressured,
    failedTable: snapshot.failedTable,
    durationMs: snapshot.durationMs,
    rows: snapshot.rows,
  };
}

/**
 * Build the canonical partition-execution success outcome.
 * @param {string} partitionId - Partition ID.
 * @param {Object} partitionMetrics - Partition metrics.
 * @param {Object} result - Query result.
 * @return {Object} Success result.
 */
function buildPartitionExecutionSuccessOutcome(
  partitionId,
  partitionMetrics,
  result,
) {
  return {
    partitionId,
    success: true,
    status: partitionMetrics.status,
    rows: result.rows || [],
    changes: result.changes,
  };
}

export {
  buildPartitionExecutionFailureOutcome,
  buildPartitionExecutionSuccessOutcome,
  normalizeFailureString,
  normalizePartitionExecutionFailureSnapshot,
  normalizeRetryAfterMs,
  resolveFailureBackpressureState,
};
