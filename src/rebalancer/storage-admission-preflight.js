import {assertCritical} from '../utils/assert.js';
import {buildStorageAdmissionResult} from './storage-admission-result.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_ERROR_MSG,
  STORAGE_ADMISSION_OPERATION_TYPE,
  STORAGE_ADMISSION_REASON,
} from './storage-admission-constants.js';

const STORAGE_ADMISSION_PREFLIGHT_ACTION = Object.freeze({
  APPLY_MODE_OVERRIDE: 'apply_mode_override',
  CONTINUE: 'continue',
  RETURN: 'return',
});

function buildPreflightResult(options, decisionType, reason) {
  return buildStorageAdmissionResult({
    allowed: false,
    decisionType,
    operationType: options.operationType,
    requiredReplicaCount: options.requiredReplicaCount,
    eligibleNodeIds: [],
    ineligibleNodes: [],
    blockingReasons: [reason],
    decisionTimestamp: options.decisionTimestamp,
    projectedUtilizationByNodeId: {},
    projectedUtilization: null,
    reason,
  });
}

function resolveStorageAdmissionPreflight(options) {
  if (
    options.minimumRoutableSourceCount > 0 &&
    options.sourceRoutableNodeIds.length < options.minimumRoutableSourceCount
  ) {
    return Object.freeze({
      action: STORAGE_ADMISSION_PREFLIGHT_ACTION.APPLY_MODE_OVERRIDE,
      result: buildPreflightResult(
        options,
        STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
        STORAGE_ADMISSION_REASON.SOURCE_QUORUM_NOT_ROUTABLE,
      ),
    });
  }
  if (options.candidateNodeIds.length > 0) {
    return Object.freeze({
      action: STORAGE_ADMISSION_PREFLIGHT_ACTION.CONTINUE,
    });
  }
  assertCritical(
    options.operationType === STORAGE_ADMISSION_OPERATION_TYPE.PARTITION_SPLIT,
    STORAGE_ADMISSION_ERROR_MSG.TARGET_NODE_REQUIRED,
  );
  return Object.freeze({
    action: STORAGE_ADMISSION_PREFLIGHT_ACTION.RETURN,
    result: buildPreflightResult(
      options,
      STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
      STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES,
    ),
  });
}

export {
  STORAGE_ADMISSION_PREFLIGHT_ACTION,
  resolveStorageAdmissionPreflight,
};
