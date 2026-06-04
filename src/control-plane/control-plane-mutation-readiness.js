import {NUM, TYPEOF} from '../constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  resolveCanonicalLeaderRoutingGapState,
} from '../query/canonical-leader-routing.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  PROJECTION_READINESS_CONTRACT_STATE,
  READINESS_SNAPSHOT_KEY,
} from './control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_MUTATION_READINESS_ERROR,
  CONTROL_PLANE_MUTATION_READINESS_OUTCOME,
  CONTROL_PLANE_MUTATION_READINESS_VISIBILITY_STATE,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_FAILED_DIMENSION,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON,
  hasControlPlaneMutationRoutingGapFailureSignature,
} from './control-plane-mutation-readiness-constants.js';
import {compactEligibilitySnapshot} from './eligibility-snapshot.js';
import {getControlPlaneRetryAfterMs} from
  './control-plane-error-classification.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} from './owner-contract-outcome.js';

const CONTROL_PLANE_MUTATION_WORK_CLASS = Object.freeze({
  BACKGROUND: 'background',
  INTERACTIVE: 'interactive',
  CRITICAL: 'critical',
});

const DEFAULT_REQUIRED_DIMENSIONS = Object.freeze([
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
  CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
]);
const CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING =
  'publishedConvergencePending';
const CONTROL_PLANE_MUTATION_ROUTING_GAP_RETRY_AFTER_MS = 250;
const CONTROL_PLANE_MUTATION_ROUTING_GAP_DEPENDENCY_TABLES =
  Object.freeze([
    SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
    SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
    SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
  ]);
const NO_PROJECTION_READINESS_CONTRACT = null;
const REASON_BY_DIMENSION = Object.freeze({
  [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
    CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
  [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
    CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
});
const PUBLISHED_CONVERGENCE_DECISION_RULES = Object.freeze([
  Object.freeze({
    pending: true,
    matches: (evidence) => evidence.contractAvailable !== true,
  }),
  Object.freeze({
    pending: true,
    matches: (evidence) => evidence.publicationReady !== true,
  }),
  Object.freeze({
    pending: true,
    matches: (evidence) => evidence.priorityRecoveryActive === true,
  }),
  Object.freeze({
    pending: false,
    matches: () => true,
  }),
]);

function normalizeControlPlaneMutationWorkClass(
  workClass,
  defaultWorkClass = CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
) {
  if (typeof workClass !== TYPEOF.STRING || workClass.length === NUM.ZERO) {
    return defaultWorkClass;
  }
  const normalized = workClass.toLowerCase();
  if (normalized === CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND) {
    return CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND;
  }
  if (normalized === CONTROL_PLANE_MUTATION_WORK_CLASS.CRITICAL) {
    return CONTROL_PLANE_MUTATION_WORK_CLASS.CRITICAL;
  }
  return CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE;
}

function requiresStableLocalControlPlaneMutationReadiness(workClass) {
  return normalizeControlPlaneMutationWorkClass(workClass) ===
    CONTROL_PLANE_MUTATION_WORK_CLASS.BACKGROUND;
}

function normalizeReasonCodes(readiness, failedDimensions) {
  const seen = new Set();
  const codes = [];
  for (const reason of Array.isArray(readiness?.reasons) ? readiness.reasons : []) {
    const code = String(reason?.code || reason?.reason || reason || '');
    if (code.length === NUM.ZERO || seen.has(code)) {
      continue;
    }
    seen.add(code);
    codes.push(code);
  }

  for (const dimension of Array.isArray(failedDimensions) ? failedDimensions : []) {
    const mappedCode = REASON_BY_DIMENSION[dimension] || '';
    if (mappedCode.length === NUM.ZERO || seen.has(mappedCode)) {
      continue;
    }
    seen.add(mappedCode);
    codes.push(mappedCode);
  }

  const projectionReadinessContract = getProjectionReadinessContract(readiness);
  for (const code of Array.isArray(projectionReadinessContract?.reasonCodes) ?
    projectionReadinessContract.reasonCodes :
    []) {
    const normalizedCode = String(code || '');
    if (normalizedCode.length === NUM.ZERO || seen.has(normalizedCode)) {
      continue;
    }
    seen.add(normalizedCode);
    codes.push(normalizedCode);
  }

  return Object.freeze(codes);
}

function getProjectionReadinessContract(readiness = null) {
  const directContract =
    readiness?.projectionReadinessContract &&
    typeof readiness.projectionReadinessContract === TYPEOF.OBJECT ?
      readiness.projectionReadinessContract :
      NO_PROJECTION_READINESS_CONTRACT;
  if (directContract) {
    return directContract;
  }
  const compactContract =
    readiness?.[READINESS_SNAPSHOT_KEY.PROJECTION_READINESS_CONTRACT] &&
    typeof readiness[READINESS_SNAPSHOT_KEY.PROJECTION_READINESS_CONTRACT] ===
      TYPEOF.OBJECT ?
      readiness[READINESS_SNAPSHOT_KEY.PROJECTION_READINESS_CONTRACT] :
      NO_PROJECTION_READINESS_CONTRACT;
  return compactContract;
}

function normalizePublishedConvergenceEvidence(readiness = null) {
  const projectionReadinessContract = getProjectionReadinessContract(readiness);
  const publication =
    projectionReadinessContract?.publication &&
    typeof projectionReadinessContract.publication === TYPEOF.OBJECT ?
      projectionReadinessContract.publication :
      NO_PROJECTION_READINESS_CONTRACT;
  const priorityRecovery =
    projectionReadinessContract?.priorityRecovery &&
    typeof projectionReadinessContract.priorityRecovery === TYPEOF.OBJECT ?
      projectionReadinessContract.priorityRecovery :
      NO_PROJECTION_READINESS_CONTRACT;
  const serveReady =
    projectionReadinessContract?.state ===
      PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY &&
    projectionReadinessContract?.ready === true;
  return Object.freeze({
    contractAvailable: !!projectionReadinessContract,
    publicationReady:
      typeof publication?.ready === TYPEOF.BOOLEAN ?
        publication.ready :
        serveReady,
    priorityRecoveryActive: priorityRecovery?.active === true,
  });
}

function isPublishedConvergencePending(readiness = null) {
  const evidence = normalizePublishedConvergenceEvidence(readiness);
  return PUBLISHED_CONVERGENCE_DECISION_RULES.find((rule) =>
    rule.matches(evidence),
  ).pending;
}

/**
 * Dimensions the priority-recovery break-glass may relax. These are exactly the
 * serve-grade writability signals that depend on the membership publication
 * already being healthy. During a rolling restart the publication is *not* yet
 * healthy precisely because the recovery write that repairs it is blocked on
 * these dimensions, creating a circular bootstrap deadlock. The recovery lane
 * (CONTROL_PLANE_RECOVERY_ELIGIBLE) already tolerates an unhealthy publication
 * during active priority recovery, so when that lane is open we let the
 * publication-repair write proceed.
 */
const PRIORITY_RECOVERY_BYPASS_RELAXABLE_DIMENSIONS = Object.freeze([
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
  CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
]);

function isPriorityRecoveryWriteLaneOpen(readiness = null) {
  if (!readiness || typeof readiness !== TYPEOF.OBJECT) {
    return false;
  }
  const recoveryLaneEligible =
    readiness.dimensions?.[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ] === true;
  if (!recoveryLaneEligible) {
    return false;
  }
  return (
    normalizePublishedConvergenceEvidence(readiness).priorityRecoveryActive ===
    true
  );
}

function relaxFailedDimensionsForPriorityRecovery(failedDimensions, readiness) {
  if (
    !Array.isArray(failedDimensions) ||
    failedDimensions.length === NUM.ZERO ||
    !isPriorityRecoveryWriteLaneOpen(readiness)
  ) {
    return {failedDimensions, recoveryBypassApplied: false};
  }
  const relaxable = new Set(PRIORITY_RECOVERY_BYPASS_RELAXABLE_DIMENSIONS);
  const retained = failedDimensions.filter(
    (dimension) => !relaxable.has(dimension),
  );
  return {
    failedDimensions: retained,
    recoveryBypassApplied: retained.length !== failedDimensions.length,
  };
}

function getLocalControlPlaneMutationReadinessBlocker(options = {}) {
  const nodeId = String(options.nodeId || '');
  const controlPlaneReadinessService =
    options.controlPlaneReadinessService || null;
  if (!nodeId ||
      !controlPlaneReadinessService ||
      typeof controlPlaneReadinessService.getNodeReadinessSync !==
        TYPEOF.FUNCTION) {
    return null;
  }

  const requiredDimensions = Array.isArray(options.requiredDimensions) &&
      options.requiredDimensions.length > NUM.ZERO ?
    options.requiredDimensions :
    DEFAULT_REQUIRED_DIMENSIONS;
  const readiness = controlPlaneReadinessService.getNodeReadinessSync(
    nodeId,
    {
      allowStaleOnCacheChange: false,
    },
  );
  const allowPriorityRecoveryBypass =
    options.allowPriorityRecoveryBypass === true;
  let failedDimensions = requiredDimensions.filter((dimension) => {
    return readiness?.dimensions?.[dimension] !== true;
  });
  let recoveryBypassApplied = false;
  if (allowPriorityRecoveryBypass) {
    const relaxed = relaxFailedDimensionsForPriorityRecovery(
      failedDimensions,
      readiness,
    );
    failedDimensions = relaxed.failedDimensions;
    recoveryBypassApplied = relaxed.recoveryBypassApplied;
  }
  const requirePublishedConvergence =
    options.requirePublishedConvergence === true;
  if (requirePublishedConvergence && isPublishedConvergencePending(readiness)) {
    failedDimensions.push(CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING);
  }
  if (failedDimensions.length === NUM.ZERO) {
    return null;
  }

  return Object.freeze({
    nodeId,
    readiness: readiness || null,
    recoveryBypassApplied,
    failedDimensions: Object.freeze([...failedDimensions]),
    reasonCodes: normalizeReasonCodes(readiness, failedDimensions),
    readinessSnapshot: readiness ?
      compactEligibilitySnapshot(
        readiness,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
      ) :
      null,
  });
}

function normalizeRoutingSnapshotSummary(routingSnapshot = null) {
  if (!routingSnapshot || typeof routingSnapshot !== TYPEOF.OBJECT) {
    return null;
  }
  return Object.freeze({
    canonicalLeaderIdentityState:
      typeof routingSnapshot.canonicalLeaderIdentityState === TYPEOF.STRING ?
        routingSnapshot.canonicalLeaderIdentityState :
        null,
    canonicalLeaderNodeId:
      typeof routingSnapshot.canonicalLeaderNodeId === TYPEOF.STRING ?
        routingSnapshot.canonicalLeaderNodeId :
        null,
    canonicalLeaderRoutingGapState:
      typeof routingSnapshot.canonicalLeaderRoutingGapState === TYPEOF.STRING ?
        routingSnapshot.canonicalLeaderRoutingGapState :
        null,
    serviceRowCount:
      Number.isFinite(routingSnapshot.serviceRowCount) ?
        Math.max(NUM.ZERO, Math.floor(routingSnapshot.serviceRowCount)) :
        NUM.ZERO,
    routableServiceCount:
      Number.isFinite(routingSnapshot.routableServiceCount) ?
        Math.max(NUM.ZERO, Math.floor(routingSnapshot.routableServiceCount)) :
        NUM.ZERO,
  });
}

function shouldBlockSystemTableMutationRoutingGap(recoveryContract = null) {
  return recoveryContract?.recoveryCandidateWidening !== true;
}

function getSystemTableMutationRoutingGapBlocker(options = {}) {
  const queryExecutor = options.queryExecutor || null;
  if (!queryExecutor ||
      typeof queryExecutor.getPartitionRoutingSnapshot !== TYPEOF.FUNCTION) {
    return null;
  }
  const routingReadinessDimension =
    options.routingReadinessDimension ||
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  if (routingReadinessDimension !==
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE) {
    return null;
  }
  const dependencyStates = [];
  const seenReasonCodes = new Set();
  const reasonCodes = [];
  const dependencyTables =
    Array.isArray(options.dependencyTables) &&
      options.dependencyTables.length > NUM.ZERO ?
      options.dependencyTables :
      CONTROL_PLANE_MUTATION_ROUTING_GAP_DEPENDENCY_TABLES;
  for (const tableName of dependencyTables) {
    const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
    if (typeof partitionId !== TYPEOF.STRING || partitionId.length === NUM.ZERO) {
      continue;
    }
    let routingSnapshot = null;
    try {
      routingSnapshot = queryExecutor.getPartitionRoutingSnapshot(
        partitionId,
        routingReadinessDimension,
      );
    } catch (_error) {
      routingSnapshot = null;
    }
    const gapState = resolveCanonicalLeaderRoutingGapState(routingSnapshot);
    if (gapState !== CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING &&
        gapState !== CANONICAL_LEADER_ROUTING_GAP_STATE.SERVICE_MISSING) {
      continue;
    }
    const reasonCode = gapState === CANONICAL_LEADER_ROUTING_GAP_STATE.SERVICE_MISSING ?
      CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON.SERVICE_MISSING :
      CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON.OWNER_MISSING;
    if (!seenReasonCodes.has(reasonCode)) {
      seenReasonCodes.add(reasonCode);
      reasonCodes.push(reasonCode);
    }
    const recoveryContract =
      typeof queryExecutor.resolveCanonicalLeaderGapRecoveryRoutingContract ===
        TYPEOF.FUNCTION ?
        queryExecutor.resolveCanonicalLeaderGapRecoveryRoutingContract(
          partitionId,
          routingSnapshot,
          routingReadinessDimension,
          false,
        ) :
        null;
    if (!shouldBlockSystemTableMutationRoutingGap(recoveryContract)) {
      continue;
    }
    dependencyStates.push(Object.freeze({
      tableName,
      partitionId,
      gapState,
      reasonCode,
      recoveryCandidateWidening:
        recoveryContract?.recoveryCandidateWidening === true,
      routingSnapshot: normalizeRoutingSnapshotSummary(routingSnapshot),
    }));
  }
  if (dependencyStates.length === NUM.ZERO) {
    return null;
  }
  return Object.freeze({
    failedDimensions: Object.freeze([
      CONTROL_PLANE_MUTATION_ROUTING_GAP_FAILED_DIMENSION,
    ]),
    reasonCodes: Object.freeze(reasonCodes),
    retryAfterMs: CONTROL_PLANE_MUTATION_ROUTING_GAP_RETRY_AFTER_MS,
    dependencyStates: Object.freeze(dependencyStates),
  });
}

function resolveMutationReadinessRetryAfterMs(blocker, errorLike = null) {
  const readinessRetryAfterMs =
    Number.isFinite(blocker?.readiness?.retryAfterMs) &&
      blocker.readiness.retryAfterMs > NUM.ZERO ?
      Math.floor(blocker.readiness.retryAfterMs) :
      NUM.ZERO;
  const blockerRetryAfterMs =
    Number.isFinite(blocker?.retryAfterMs) &&
      blocker.retryAfterMs > NUM.ZERO ?
      Math.floor(blocker.retryAfterMs) :
      NUM.ZERO;
  const errorRetryAfterMs = getControlPlaneRetryAfterMs(errorLike);
  const retryAfterMs = Math.max(
    readinessRetryAfterMs,
    blockerRetryAfterMs,
    errorRetryAfterMs,
  );
  return retryAfterMs > NUM.ZERO ? retryAfterMs : null;
}

function cloneMutationReadinessDetails(options = {}) {
  const details = {};
  if (typeof options?.tableName === TYPEOF.STRING &&
      options.tableName.length > NUM.ZERO) {
    details.tableName = options.tableName;
  }
  if (typeof options?.workClass === TYPEOF.STRING &&
      options.workClass.length > NUM.ZERO) {
    details.workClass = options.workClass;
  }
  if (typeof options?.error?.message === TYPEOF.STRING &&
      options.error.message.length > NUM.ZERO) {
    details.cause = options.error.message;
  }
  if (Array.isArray(options?.dependencyStates) &&
      options.dependencyStates.length > NUM.ZERO) {
    details.dependencyStates = options.dependencyStates;
  }
  return Object.keys(details).length > NUM.ZERO ?
    Object.freeze(details) :
    null;
}

function buildControlPlaneMutationDeferredFailure(options = {}) {
  const blocker = options?.blocker || null;
  const reasonCodes = Array.isArray(blocker?.reasonCodes) ?
    Object.freeze([...blocker.reasonCodes]) :
    Object.freeze([]);
  const failedDimensions = Array.isArray(blocker?.failedDimensions) ?
    Object.freeze([...blocker.failedDimensions]) :
    Object.freeze([]);
  const readinessSnapshot =
    blocker?.readinessSnapshot &&
    typeof blocker.readinessSnapshot === TYPEOF.OBJECT ?
      blocker.readinessSnapshot :
      null;
  const runtimeAuthority =
    readinessSnapshot?.[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY] &&
    typeof readinessSnapshot[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY] ===
      TYPEOF.OBJECT ?
      readinessSnapshot[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY] :
      null;
  const dependencyStates = Array.isArray(blocker?.dependencyStates) ?
    Object.freeze([...blocker.dependencyStates]) :
    null;
  const retryAfterMs = resolveMutationReadinessRetryAfterMs(
    blocker,
    options?.error || null,
  );
  const errorCode = typeof options?.error?.errorCode === TYPEOF.STRING &&
      options.error.errorCode.length > NUM.ZERO ?
    options.error.errorCode :
    (
      typeof options?.error?.code === TYPEOF.STRING &&
        options.error.code.length > NUM.ZERO ?
        options.error.code :
        null
    );
  const contractOutcome = buildOwnerContractOutcome({
    contractState: OWNER_CONTRACT_STATE.DEFERRED,
    nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
  });
  const failure = {
    success: false,
    error: CONTROL_PLANE_MUTATION_READINESS_ERROR,
    outcome: CONTROL_PLANE_MUTATION_READINESS_OUTCOME,
    completionState: CONTROL_PLANE_MUTATION_READINESS_OUTCOME,
    visibilityState: CONTROL_PLANE_MUTATION_READINESS_VISIBILITY_STATE,
    contractState: contractOutcome.contractState,
    nextAction: contractOutcome.nextAction,
    deferRetry: true,
    reasonCode: reasonCodes[NUM.ZERO] || null,
    reasonCodes,
    failedDimensions,
    readinessSnapshot,
    runtimeAuthority,
  };
  if (typeof options?.tableName === TYPEOF.STRING &&
      options.tableName.length > NUM.ZERO) {
    failure.tableName = options.tableName;
  }
  if (dependencyStates) {
    failure.dependencyStates = dependencyStates;
  }
  if (errorCode) {
    failure.errorCode = errorCode;
  }
  if (retryAfterMs !== null) {
    failure.retryAfterMs = retryAfterMs;
  }
  const details = cloneMutationReadinessDetails({
    ...options,
    dependencyStates,
  });
  if (details) {
    failure.details = details;
  }
  return Object.freeze(failure);
}

function buildLocalControlPlaneMutationReadinessFailure(options = {}) {
  return buildControlPlaneMutationDeferredFailure(options);
}

function buildSystemTableMutationRoutingGapFailure(options = {}) {
  return buildControlPlaneMutationDeferredFailure(options);
}

export {
  buildLocalControlPlaneMutationReadinessFailure,
  buildSystemTableMutationRoutingGapFailure,
  CONTROL_PLANE_MUTATION_PUBLISHED_CONVERGENCE_PENDING,
  CONTROL_PLANE_MUTATION_READINESS_ERROR,
  CONTROL_PLANE_MUTATION_READINESS_OUTCOME,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_FAILED_DIMENSION,
  CONTROL_PLANE_MUTATION_ROUTING_GAP_REASON,
  CONTROL_PLANE_MUTATION_WORK_CLASS,
  getLocalControlPlaneMutationReadinessBlocker,
  getSystemTableMutationRoutingGapBlocker,
  hasControlPlaneMutationRoutingGapFailureSignature,
  normalizeControlPlaneMutationWorkClass,
  requiresStableLocalControlPlaneMutationReadiness,
};
