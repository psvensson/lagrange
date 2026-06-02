import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from './control-plane-readiness-constants.js';
import {isPriorityControlPlanePartition} from '../bootstrap/system-partition-classification.js';
import {NUM, TYPEOF} from '../constants/index.js';

const PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_REQUIRED_REASONS = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
]);
const PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_REASONS = new Set([
  ...PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_REQUIRED_REASONS,
  CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
  CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
  CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING,
]);
const PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_FAILED_DIMENSIONS = new Set([
  CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
  CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
]);

function collectPriorityRecoveryDispatchBootstrapReasonCodes(readiness) {
  const reasonCodes = new Set();
  const addReasonCode = (reasonCode) => {
    const normalizedReasonCode = String(reasonCode || '').trim();
    if (normalizedReasonCode.length > NUM.ZERO) {
      reasonCodes.add(normalizedReasonCode);
    }
  };
  for (const reason of Array.isArray(readiness?.reasons) ?
    readiness.reasons :
    []) {
    addReasonCode(reason?.code || reason);
  }
  for (const reasonCode of Array.isArray(
    readiness?.runtimeAuthority?.reasonCodes,
  ) ?
    readiness.runtimeAuthority.reasonCodes :
    []) {
    addReasonCode(reasonCode);
  }
  for (const reasonCode of Array.isArray(
    readiness?.projectionReadinessContract?.priorityRecovery?.reasonCodes,
  ) ?
    readiness.projectionReadinessContract.priorityRecovery.reasonCodes :
    []) {
    addReasonCode(reasonCode);
  }
  for (const reasonCode of Array.isArray(
    readiness?.priorityControlPlaneRecovery?.reasonCodes,
  ) ?
    readiness.priorityControlPlaneRecovery.reasonCodes :
    []) {
    addReasonCode(reasonCode);
  }
  return reasonCodes;
}

function hasPriorityRecoveryDispatchBootstrapDimensions(readiness) {
  const dimensions = readiness?.dimensions;
  return (
    dimensions &&
    typeof dimensions === TYPEOF.OBJECT &&
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true &&
    dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
    ] === true &&
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] === true &&
    dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
    ] === true &&
    dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY
    ] === true
  );
}

function hasOnlyPriorityRecoveryDispatchBootstrapFailedDimensions(readiness) {
  const dimensions = readiness?.dimensions;
  if (!dimensions || typeof dimensions !== TYPEOF.OBJECT) {
    return false;
  }
  const failedDimensions = Object.keys(dimensions).filter((dimension) =>
    dimensions[dimension] !== true,
  );
  return (
    failedDimensions.length > NUM.ZERO &&
    failedDimensions.includes(
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    ) &&
    failedDimensions.every((dimension) =>
      PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_FAILED_DIMENSIONS.has(
        dimension,
      ),
    )
  );
}

function hasOnlyPriorityRecoveryDispatchBootstrapReasonCodes(reasonCodes) {
  if (!(reasonCodes instanceof Set) || reasonCodes.size === NUM.ZERO) {
    return false;
  }
  for (const requiredReason of
    PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_REQUIRED_REASONS) {
    if (!reasonCodes.has(requiredReason)) {
      return false;
    }
  }
  for (const reasonCode of reasonCodes) {
    if (
      !PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_REASONS.has(reasonCode)
    ) {
      return false;
    }
  }
  return true;
}

function shouldAllowPriorityRecoveryDispatchBootstrap({
  operation,
  readiness,
  decisionDimension,
}) {
  if (
    decisionDimension !==
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
  ) {
    return false;
  }
  const partitionId = operation?.partitionId || operation?.partition_id || '';
  if (
    !isPriorityControlPlanePartition({partitionId}) ||
    !hasPriorityRecoveryDispatchBootstrapDimensions(readiness) ||
    !hasOnlyPriorityRecoveryDispatchBootstrapFailedDimensions(readiness)
  ) {
    return false;
  }
  const reasonCodes =
    collectPriorityRecoveryDispatchBootstrapReasonCodes(readiness);
  return hasOnlyPriorityRecoveryDispatchBootstrapReasonCodes(reasonCodes);
}

export {shouldAllowPriorityRecoveryDispatchBootstrap};
