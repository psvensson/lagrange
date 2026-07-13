import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';

const {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  QUERY_EXECUTOR_LITERAL,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD,
} = QUERY_EXECUTOR_SHARED;

const PRIORITY_RECOVERY_BOOTSTRAP_REQUIRED_REASONS = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
]);
const PRIORITY_RECOVERY_BOOTSTRAP_ALLOWED_REASONS = new Set([
  ...PRIORITY_RECOVERY_BOOTSTRAP_REQUIRED_REASONS,
  CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
  CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
  CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING,
]);
const PRIORITY_RECOVERY_BOOTSTRAP_ALLOWED_FAILED_DIMENSIONS = new Set([
  CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
  CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
]);

function isPriorityRecoveryWriteRouting({
  partitionId,
  partitionRow,
  routingReadinessDimension,
  routingOptions,
}) {
  return (
    classifySystemPartition({
      partitionId,
      partitionRow,
    }).priorityControlPlane &&
    routingReadinessDimension ===
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE &&
    routingOptions?.[QUERY_EXECUTOR_ROUTING_OPTION_FIELD.FOR_READ] === false &&
    routingOptions?.[
      QUERY_EXECUTOR_ROUTING_OPTION_FIELD.ALLOW_PRIORITY_RECOVERY_BOOTSTRAP
    ] === true
  );
}

function collectPriorityRecoveryBootstrapReasonCodes(readiness, decision) {
  const reasonCodes = new Set();
  const addReasonCode = (reasonCode) => {
    const normalizedReasonCode = String(reasonCode || '').trim();
    if (normalizedReasonCode.length > 0) {
      reasonCodes.add(normalizedReasonCode);
    }
  };
  for (const reasonCode of Array.isArray(decision?.reasonCodes) ?
    decision.reasonCodes :
    []) {
    addReasonCode(reasonCode);
  }
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

function hasPriorityRecoveryBootstrapDimensions(readiness) {
  const dimensions = readiness?.dimensions;
  return (
    dimensions &&
    typeof dimensions === QUERY_EXECUTOR_LITERAL.STRING_OBJECT &&
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

function hasOnlyPriorityRecoveryBootstrapFailedDimensions(readiness, decision) {
  const dimensions = readiness?.dimensions;
  if (
    !dimensions ||
    typeof dimensions !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT
  ) {
    return false;
  }
  const failedDimensions = Array.isArray(decision?.failedDimensions) ?
    decision.failedDimensions :
    Object.keys(dimensions).filter((dimension) =>
      dimensions[dimension] !== true,
    );
  return (
    failedDimensions.length > 0 &&
    failedDimensions.includes(
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    ) &&
    failedDimensions.every((dimension) =>
      PRIORITY_RECOVERY_BOOTSTRAP_ALLOWED_FAILED_DIMENSIONS.has(dimension),
    )
  );
}

function hasOnlyPriorityRecoveryBootstrapReasonCodes(reasonCodes) {
  if (!(reasonCodes instanceof Set) || reasonCodes.size === 0) {
    return false;
  }
  for (const requiredReason of PRIORITY_RECOVERY_BOOTSTRAP_REQUIRED_REASONS) {
    if (!reasonCodes.has(requiredReason)) {
      return false;
    }
  }
  for (const reasonCode of reasonCodes) {
    if (!PRIORITY_RECOVERY_BOOTSTRAP_ALLOWED_REASONS.has(reasonCode)) {
      return false;
    }
  }
  return true;
}

function shouldAllowPriorityRecoveryBootstrapRoutingGrace({
  partitionId,
  partitionRow,
  routingReadinessDimension,
  routingOptions,
  readiness,
  decision,
}) {
  if (
    !isPriorityRecoveryWriteRouting({
      partitionId,
      partitionRow,
      routingReadinessDimension,
      routingOptions,
    }) ||
    !hasPriorityRecoveryBootstrapDimensions(readiness) ||
    !hasOnlyPriorityRecoveryBootstrapFailedDimensions(readiness, decision)
  ) {
    return false;
  }
  const reasonCodes = collectPriorityRecoveryBootstrapReasonCodes(
    readiness,
    decision,
  );
  return hasOnlyPriorityRecoveryBootstrapReasonCodes(reasonCodes);
}

export {
  isPriorityRecoveryWriteRouting,
  shouldAllowPriorityRecoveryBootstrapRoutingGrace,
};
