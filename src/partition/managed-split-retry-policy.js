import {
  CONTROL_PLANE_READINESS_REASON,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
} from '../control-plane/timeout-budget.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_REASON,
} from '../rebalancer/storage-admission-constants.js';
import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  isRetryablePartitionTransitionState,
} from './partition-constants.js';

const LOCAL_STR_OBJECT = 'object';

const RETRYABLE_MANAGED_SPLIT_TIMEOUT_CLASSIFICATION_SET = new Set([
  TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
  TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
]);
const RETRYABLE_MANAGED_SPLIT_MESSAGE_FRAGMENTS = Object.freeze([
  QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX
    .toLowerCase(),
  QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX.toLowerCase(),
  QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase(),
  QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase(),
  STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
  CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
  STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED,
  STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_REPAIR_ONLY,
]);

function normalizeManagedSplitExecutionFailureMessage(errorOrFailure) {
  return String(errorOrFailure?.message || '').toLowerCase();
}

function resolveManagedSplitRetryableTimeoutClassification(
  timeoutClassification,
) {
  if (!timeoutClassification ||
      typeof timeoutClassification !== LOCAL_STR_OBJECT) {
    return null;
  }
  const classification = String(
    timeoutClassification.classification || '',
  );
  const originalClassification = String(
    timeoutClassification.originalClassification || '',
  );
  if (RETRYABLE_MANAGED_SPLIT_TIMEOUT_CLASSIFICATION_SET.has(
    classification,
  )) {
    return classification;
  }
  if (classification === TIMEOUT_BUDGET_CLASSIFICATION.EXACT_BOUNDARY_HIT &&
      RETRYABLE_MANAGED_SPLIT_TIMEOUT_CLASSIFICATION_SET.has(
        originalClassification,
      )) {
    return originalClassification;
  }
  return null;
}

function isRetryableManagedSplitExecutionFailure(errorOrFailure) {
  if (!errorOrFailure || typeof errorOrFailure !== LOCAL_STR_OBJECT) {
    return false;
  }
  if (errorOrFailure.retryable === true) {
    return true;
  }
  if (resolveManagedSplitRetryableTimeoutClassification(
    errorOrFailure.timeoutClassification,
  )) {
    return true;
  }

  const message = normalizeManagedSplitExecutionFailureMessage(
    errorOrFailure,
  );
  if (!message) {
    return false;
  }

  return RETRYABLE_MANAGED_SPLIT_MESSAGE_FRAGMENTS.some(
    (fragment) => message.includes(fragment),
  );
}

function resolveRetryableManagedSplitExecutionDecisionType(errorOrFailure) {
  const message = normalizeManagedSplitExecutionFailureMessage(
    errorOrFailure,
  );
  if (resolveManagedSplitRetryableTimeoutClassification(
    errorOrFailure?.timeoutClassification,
  )) {
    return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
  }
  if (message.includes(STORAGE_ADMISSION_REASON.CONTROL_PLANE_WRITE_UNHEALTHY) ||
      message.includes(CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY) ||
      message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED) ||
      message.includes(STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_REPAIR_ONLY) ||
      message.includes(
        QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX
          .toLowerCase(),
      ) ||
      message.includes(
        QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX.toLowerCase(),
      ) ||
      message.includes(
        QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX.toLowerCase(),
      )) {
    return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
  }
  if (message.includes(
    STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES,
  )) {
    return STORAGE_ADMISSION_DECISION_TYPE.BLOCKED;
  }
  return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
}

function isRetryableManagedSplitTransition(transition) {
  if (!transition || typeof transition !== LOCAL_STR_OBJECT) {
    return false;
  }
  const state = String(
    transition.state ||
      transition.transitionState ||
      '',
  );
  if (isRetryablePartitionTransitionState(state)) {
    return true;
  }
  if (state !== PARTITION_TRANSITION_STATE.FAILED) {
    return false;
  }
  const metadata =
    transition.metadata && typeof transition.metadata === 'object' ?
      transition.metadata :
      {};
  return isRetryableManagedSplitExecutionFailure(
    metadata[PARTITION_TRANSITION_METADATA_FIELD.FAILURE],
  );
}

export {
  isRetryableManagedSplitExecutionFailure,
  isRetryableManagedSplitTransition,
  resolveRetryableManagedSplitExecutionDecisionType,
};
