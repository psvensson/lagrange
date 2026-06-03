import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';

const {
  COLUMN,
  NUM,
  OPERATION_WORKFLOW_OWNER_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  TYPEOF,
  getControlPlaneErrorMessage,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const RETRYABLE_DISPATCH_SKIPPED_REASONS = Object.freeze(
  new Set([
    OPERATION_WORKFLOW_OWNER_REASON.SHUTDOWN_IN_PROGRESS,
  ]),
);

function resolveNodeStateUpdateBudgetFields(nodeRow) {
  if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
    return {};
  }

  const budgetFields = {};
  const storageBudgetBytes = Number(nodeRow?.[COLUMN.STORAGE_BUDGET_BYTES]);
  if (Number.isFinite(storageBudgetBytes) && storageBudgetBytes > NUM.ZERO) {
    budgetFields[COLUMN.STORAGE_BUDGET_BYTES] =
      Math.floor(storageBudgetBytes);
  }

  const storageBudgetSource = nodeRow?.[COLUMN.STORAGE_BUDGET_SOURCE];
  if (
    typeof storageBudgetSource === TYPEOF.STRING &&
    storageBudgetSource.length > NUM.ZERO
  ) {
    budgetFields[COLUMN.STORAGE_BUDGET_SOURCE] = storageBudgetSource;
  }

  const storageBudgetUpdatedAt = Number(
    nodeRow?.[COLUMN.STORAGE_BUDGET_UPDATED_AT],
  );
  if (
    Number.isFinite(storageBudgetUpdatedAt) &&
    storageBudgetUpdatedAt > NUM.ZERO
  ) {
    budgetFields[COLUMN.STORAGE_BUDGET_UPDATED_AT] = Math.floor(
      storageBudgetUpdatedAt,
    );
  }

  return budgetFields;
}

function shouldRetrySkippedDispatchResult(dispatchResult) {
  return (
    dispatchResult?.skipped === true &&
    RETRYABLE_DISPATCH_SKIPPED_REASONS.has(dispatchResult.reason)
  );
}

function buildRetryableSkippedDispatchError(
  dispatchResult,
  operationDispatchRetryAfterMs,
) {
  const error = new Error(
    getControlPlaneErrorMessage(dispatchResult) ||
      dispatchResult?.reason ||
      REPLICA_DISPATCH_SERVICE_LITERAL.DISPATCH_UNSUCCESSFUL,
  );
  error.reason =
    dispatchResult?.reason ||
    REPLICA_DISPATCH_SERVICE_LITERAL.DISPATCH_UNSUCCESSFUL;
  error.deferRetry = true;
  error.retryAfterMs = operationDispatchRetryAfterMs;
  return error;
}

function buildPriorityDispatchLaneExhaustedError(
  operationId,
  targetNodeId,
  operationDispatchRetryAfterMs,
) {
  const error = new Error(
    `${REPLICA_DISPATCH_SERVICE_LITERAL.PRIORITY_DISPATCH_LANE_EXHAUSTED} ${operationId}`,
  );
  error.code = REPLICA_DISPATCH_SERVICE_LITERAL.PRIORITY_DISPATCH_LANE_EXHAUSTED;
  error.reason =
    REPLICA_DISPATCH_SERVICE_LITERAL.PRIORITY_DISPATCH_LANE_EXHAUSTED;
  error.operationId = operationId;
  error.targetNodeId = targetNodeId || null;
  error.deferRetry = true;
  error.retryAfterMs = operationDispatchRetryAfterMs;
  return error;
}

function hasAuthoritativeReplicaOperationRowChanged(row, authoritativeRow) {
  if (!row?.operation_id || !authoritativeRow?.operation_id) {
    return false;
  }
  if (
    row.workflow_step !== authoritativeRow.workflow_step ||
    row.status !== authoritativeRow.status ||
    row.replica_id !== authoritativeRow.replica_id ||
    row.source_node_id !== authoritativeRow.source_node_id ||
    row.target_node_id !== authoritativeRow.target_node_id
  ) {
    return true;
  }
  const staleUpdatedAt = Number(row.updated_at);
  const authoritativeUpdatedAt = Number(authoritativeRow.updated_at);
  return (
    Number.isFinite(authoritativeUpdatedAt) &&
    (!Number.isFinite(staleUpdatedAt) ||
      authoritativeUpdatedAt > staleUpdatedAt)
  );
}

function buildReplicaOperationVisibilityLagError(
  operationId,
  deferredOutcome,
  operationDispatchRetryAfterMs,
) {
  const error = new Error(
    `${REPLICA_DISPATCH_SERVICE_LITERAL.CACHE_UPDATE_NOT_OBSERVED_FOR_REPLICA_OPERATION} ${operationId}`,
  );
  error.code =
    REPLICA_DISPATCH_SERVICE_LITERAL.REPLICA_OPERATION_VISIBILITY_LAG;
  error.operationId = operationId;
  error.deferRetry = true;
  error.retryAfterMs = Number.isFinite(deferredOutcome?.retryAfterMs) ?
    deferredOutcome.retryAfterMs :
    operationDispatchRetryAfterMs;
  if (
    typeof deferredOutcome?.reasonCode === TYPEOF.STRING &&
    deferredOutcome.reasonCode.length > NUM.ZERO
  ) {
    error.reasonCode = deferredOutcome.reasonCode;
  }
  if (
    typeof deferredOutcome?.completionState === TYPEOF.STRING &&
    deferredOutcome.completionState.length > NUM.ZERO
  ) {
    error.completionState = deferredOutcome.completionState;
  }
  return error;
}

function buildDispatchReadinessGateError(
  targetNodeId,
  message,
  code,
  retryAfterMs,
  operationDispatchRetryAfterMs,
  cause = null,
) {
  const error = new Error(message);
  error.code = code;
  error.targetNodeId = targetNodeId || null;
  error.deferRetry = true;
  error.retryAfterMs =
    Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO ?
      retryAfterMs :
      operationDispatchRetryAfterMs;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

export {
  buildDispatchReadinessGateError,
  buildPriorityDispatchLaneExhaustedError,
  buildReplicaOperationVisibilityLagError,
  buildRetryableSkippedDispatchError,
  hasAuthoritativeReplicaOperationRowChanged,
  resolveNodeStateUpdateBudgetFields,
  shouldRetrySkippedDispatchResult,
};
