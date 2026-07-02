import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from './control-plane-readiness-constants.js';
import {isPriorityControlPlanePartition} from '../bootstrap/system-partition-classification.js';

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
const PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_REQUIRED_DIMENSIONS = Object.freeze([
  CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
  CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
  CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY,
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED,
  CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
]);
// A node's own priority-recovery spread dispatch is the operation that ADVANCES
// the publication epoch and spreads the priority partitions. Requiring the node
// to already be published before it may run that dispatch is a self-readiness
// gate: the bootstrap operation that produces readiness must not require the
// readiness it produces. For self-targeted dispatches we therefore drop the
// publication-cluster and already-selected placement/provisioning preconditions
// and permit their pending reason codes.
const SELF_PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_REQUIRED_DIMENSIONS = Object.freeze(
  [
    CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
    CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
    CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY,
  ],
);
const SELF_PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_FAILED_DIMENSIONS = new Set(
  [
    ...PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_FAILED_DIMENSIONS,
    CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE,
    CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED,
    CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
  ],
);
const SELF_PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_REASONS = new Set([
  ...PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_REASONS,
  CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
  CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
  CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE,
]);

function collectPriorityRecoveryDispatchBootstrapReasonCodes(readiness) {
  const reasonCodes = new Set();
  const addReasonCode = (reasonCode) => {
    const normalizedReasonCode = String(reasonCode || '').trim();
    if (normalizedReasonCode.length > 0) {
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

function hasPriorityRecoveryDispatchBootstrapDimensions(readiness, requiredDimensions) {
  const dimensions = readiness?.dimensions;
  if (!dimensions || typeof dimensions !== 'object') {
    return false;
  }
  return requiredDimensions.every(
    (dimension) => dimensions[dimension] === true,
  );
}

function hasOnlyPriorityRecoveryDispatchBootstrapFailedDimensions(
  readiness,
  allowedFailedDimensions,
) {
  const dimensions = readiness?.dimensions;
  if (!dimensions || typeof dimensions !== 'object') {
    return false;
  }
  const failedDimensions = Object.keys(dimensions).filter((dimension) =>
    dimensions[dimension] !== true,
  );
  return (
    failedDimensions.length > 0 &&
    failedDimensions.includes(
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    ) &&
    failedDimensions.every((dimension) =>
      allowedFailedDimensions.has(dimension),
    )
  );
}

function hasOnlyPriorityRecoveryDispatchBootstrapReasonCodes(
  reasonCodes,
  allowedReasons,
) {
  if (!(reasonCodes instanceof Set) || reasonCodes.size === 0) {
    return false;
  }
  for (const requiredReason of
    PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_REQUIRED_REASONS) {
    if (!reasonCodes.has(requiredReason)) {
      return false;
    }
  }
  for (const reasonCode of reasonCodes) {
    if (!allowedReasons.has(reasonCode)) {
      return false;
    }
  }
  return true;
}

function resolvePriorityRecoveryDispatchBootstrapPolicy(isSelfDispatch) {
  if (isSelfDispatch) {
    return {
      requiredDimensions:
        SELF_PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_REQUIRED_DIMENSIONS,
      allowedFailedDimensions:
        SELF_PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_FAILED_DIMENSIONS,
      allowedReasons: SELF_PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_REASONS,
    };
  }
  return {
    requiredDimensions:
      PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_REQUIRED_DIMENSIONS,
    allowedFailedDimensions:
      PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_FAILED_DIMENSIONS,
    allowedReasons: PRIORITY_RECOVERY_DISPATCH_BOOTSTRAP_ALLOWED_REASONS,
  };
}

function shouldAllowPriorityRecoveryDispatchBootstrap({
  operation,
  readiness,
  decisionDimension,
  selfNodeId = null,
}) {
  if (
    decisionDimension !==
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
  ) {
    return false;
  }
  const partitionId = operation?.partitionId || operation?.partition_id || '';
  if (!isPriorityControlPlanePartition({partitionId})) {
    return false;
  }
  const targetNodeId = operation?.targetNodeId || operation?.target_node_id || null;
  const isSelfDispatch =
    typeof selfNodeId === 'string' &&
    selfNodeId.length > 0 &&
    targetNodeId === selfNodeId;
  const policy = resolvePriorityRecoveryDispatchBootstrapPolicy(isSelfDispatch);
  if (
    !hasPriorityRecoveryDispatchBootstrapDimensions(
      readiness,
      policy.requiredDimensions,
    ) ||
    !hasOnlyPriorityRecoveryDispatchBootstrapFailedDimensions(
      readiness,
      policy.allowedFailedDimensions,
    )
  ) {
    return false;
  }
  const reasonCodes =
    collectPriorityRecoveryDispatchBootstrapReasonCodes(readiness);
  return hasOnlyPriorityRecoveryDispatchBootstrapReasonCodes(
    reasonCodes,
    policy.allowedReasons,
  );
}

export {shouldAllowPriorityRecoveryDispatchBootstrap};
