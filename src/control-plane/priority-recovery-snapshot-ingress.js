import {PRIORITY_CONTROL_PLANE_TABLE_IDS} from '../bootstrap/system-partition-classification.js';
import {DISPATCH_PENDING_WORKFLOW_STEPS} from '../rebalancer/replica-operation-step-policy.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON,
} from './priority-recovery-diagnostics-constants.js';
import {
  inferPriorityRecoveryTableNameFromPartitionId,
  normalizePriorityRecoveryInteger,
  normalizePriorityRecoveryStringList,
} from './priority-recovery-helpers.js';
import {isReplaceRemoveDispatchPhase} from '../rebalancer/replica-status.js';
import {
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_SNAPSHOT_LITERAL,
  PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS,
  PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE,
} from './priority-recovery-snapshot-contract.js';
import {
  isPriorityRecoveryCompletedPlacementOperationContext,
  isPriorityRecoveryOperationContextTerminal,
} from './priority-recovery-operation-context-state.js';
import {
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryPlannerByPartitionId,
  buildPriorityRecoveryPlannerEntry,
  buildUnknownPriorityRecoveryPlanner,
  hasPriorityRecoverySpreadGap,
} from './priority-recovery-planning-intent.js';

function readFirstStringField(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue.length > 0) {
        return trimmedValue;
      }
    }
  }
  return null;
}

function readFirstIntegerField(row, ...keys) {
  for (const key of keys) {
    const value = normalizePriorityRecoveryInteger(row?.[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return PRIORITY_RECOVERY_TARGET_SERVICE_PROGRESS_UNAVAILABLE_AT_MS;
}

function buildPriorityRecoverySemanticPartitionSetMap() {
  const partitionIdsBySemanticState = {};
  for (const semanticState of PRIORITY_RECOVERY_SEMANTIC_STATE_IDS) {
    partitionIdsBySemanticState[semanticState] = new Set();
  }
  return partitionIdsBySemanticState;
}

// Once a REPLACE has sat in its REMOVE-dispatch phase (ACTIVE/STOPPING) longer
// than this without its new target replica reaching voter-ready, the optimistic
// spread certification is withdrawn: the replacement learner has failed voter-ready
// promotion (CL-003 / CL-009 / CL-021) and the partition is genuinely under-spread,
// so the closure must report the honest blocker and let the owner re-drive the
// stalled source-removal instead of masking it as `spread_satisfied_in_flight`.
// Below this budget a still-promoting replacement keeps its optimistic
// certification, so a transient not-yet-voter-ready op is never penalized.
const PRIORITY_RECOVERY_REPLACE_REMOVE_DISPATCH_SPREAD_STALL_BUDGET_MS = 60000;

// Stall is anchored on the operation context's stepAgeMs (time in the current
// workflow step, from steps_history), NOT on stepTimeoutMs: a wedged op whose
// dispatch-retry loop re-persists updatedAt would never age past a per-step
// timeout, and a step with stepTimeoutMs of 0 has no deadline at all, so neither
// could drive this un-mask. A missing stepAgeMs (no timing evidence) reads as
// not-stalled, preserving the optimistic certification.
function isReplaceRemoveDispatchSpreadStalled(operationContext) {
  const stepAgeMs = operationContext?.stepAgeMs;
  return (
    Number.isFinite(stepAgeMs) &&
    stepAgeMs >=
      PRIORITY_RECOVERY_REPLACE_REMOVE_DISPATCH_SPREAD_STALL_BUDGET_MS
  );
}

function readPriorityRecoveryCensusHolderCount(
  readyReplicaCountByNodeId,
  nodeId,
) {
  const count = Number(readyReplicaCountByNodeId?.[nodeId]);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

// Owner decision 2026-10-04 (narrowed M2): a REPLACE moves one replica from
// its source to its target. When the census names the holders it credits the
// REPLACE only if completing it can add a distinct holder: the source node's
// census holding must survive the removal (a source whose ONLY counted
// replica is the one being replaced turns {S} into {T} and can never close
// the gap), and, at a gap of two or more, a target the census already counts
// is not counted again. Without holder identity (a summary written before the
// census published it) the grace is unchanged.
// The source node's census holding is lost when the replaced replica is its
// only counted one.
function isPriorityRecoveryReplaceSourceHoldingLost(operationContext, holders) {
  const sourceNodeId = String(operationContext?.sourceNodeId || '').trim();
  return sourceNodeId.length > 0 &&
    sourceNodeId !== String(operationContext?.targetNodeId || '').trim() &&
    readPriorityRecoveryCensusHolderCount(holders, sourceNodeId) === 1;
}

function isPriorityRecoveryReplaceTargetCountedAtWideGap(
  operationContext,
  holders,
  spreadGap,
) {
  const normalizedSpreadGap = normalizePriorityRecoveryInteger(spreadGap);
  return Number.isFinite(normalizedSpreadGap) &&
    normalizedSpreadGap >= 2 &&
    readPriorityRecoveryCensusHolderCount(
      holders,
      String(operationContext?.targetNodeId || '').trim(),
    ) > 0;
}

function canPriorityRecoveryReplaceAddCensusHolder(
  operationContext,
  options = {},
) {
  const holders =
    options.readyReplicaCountByNodeId &&
    typeof options.readyReplicaCountByNodeId === 'object' ?
      options.readyReplicaCountByNodeId :
      null;
  return holders === null || (
    !isPriorityRecoveryReplaceSourceHoldingLost(operationContext, holders) &&
    !isPriorityRecoveryReplaceTargetCountedAtWideGap(
      operationContext,
      holders,
      options.spreadGap,
    )
  );
}

// The ONE remaining intent credit (owner decisions 2026-10-04): a REPLACE in
// its REMOVE-dispatch phase keeps a bounded grace while its replacement
// promotes. Nothing else an operation does - an ADD in any phase, a REPLACE
// outside remove-dispatch, a completed or failed operation, a SYNCING-status
// voter row - contributes to "is it spread?": the census alone answers that.
function isPriorityRecoverySpreadSatisfyingOperationContext(
  operationContext,
  options = {},
) {
  const targetNodeId = String(operationContext?.targetNodeId || '').trim();
  if (targetNodeId.length === 0) {
    return false;
  }
  const eligibleTargetNodeIds = new Set(
    normalizePriorityRecoveryStringList(options.eligibleTargetNodeIds),
  );
  if (!eligibleTargetNodeIds.has(targetNodeId)) {
    return false;
  }
  if (!isReplaceRemoveDispatchPhase(operationContext)) {
    return false;
  }
  if (!canPriorityRecoveryReplaceAddCensusHolder(operationContext, options)) {
    return false;
  }
  // A STALLED replacement (target never reached voter-ready within the stall
  // budget) stops certifying so the under-spread partition reports the
  // honest blocker and the owner re-drives the wedged source-removal; a
  // progressing one keeps its bounded grace.
  const targetVoterReady =
    operationContext?.targetVisibilityState ===
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL;
  return (
    targetVoterReady ||
    !isReplaceRemoveDispatchSpreadStalled(operationContext)
  );
}

function resolvePriorityRecoveryRequiredSatisfyingTargetCount(
  plannerSpreadGap,
) {
  const normalizedSpreadGap = normalizePriorityRecoveryInteger(
    plannerSpreadGap,
  );
  if (!Number.isFinite(normalizedSpreadGap) || normalizedSpreadGap <= 0) {
    return 1;
  }
  return normalizedSpreadGap;
}

function buildPriorityRecoverySpreadCompletion(options = {}) {
  const activeOperationContexts = Array.isArray(options.activeOperationContexts) ?
    options.activeOperationContexts :
    [];
  const eligibleTargetNodeIds = normalizePriorityRecoveryStringList(
    options.eligibleTargetNodeIds,
  );
  const satisfyingOperationIds = [];
  const satisfyingTargetNodeIds = new Set();
  const blockingOperationIds = [];
  for (const operationContext of activeOperationContexts) {
    const operationId = String(operationContext?.operationId || '').trim();
    if (operationId.length === 0) {
      continue;
    }
    if (
      isPriorityRecoverySpreadSatisfyingOperationContext(operationContext, {
        eligibleTargetNodeIds,
        readyReplicaCountByNodeId: options.readyReplicaCountByNodeId,
        spreadGap: options.plannerSpreadGap,
      })
    ) {
      satisfyingOperationIds.push(operationId);
      satisfyingTargetNodeIds.add(String(operationContext.targetNodeId).trim());
      continue;
    }
    if (isPriorityRecoveryOperationContextTerminal(operationContext)) {
      continue;
    }
    blockingOperationIds.push(operationId);
  }
  if (options.plannerReady === true) {
    return Object.freeze({
      satisfied: true,
      reasonCode: PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.PLANNER_READY,
      satisfyingOperationIds: Object.freeze([...satisfyingOperationIds]),
      satisfyingOperationCount: satisfyingOperationIds.length,
      blockingOperationIds: Object.freeze([...blockingOperationIds]),
      blockingOperationCount: blockingOperationIds.length,
    });
  }
  const requiredSatisfyingTargetCount =
    resolvePriorityRecoveryRequiredSatisfyingTargetCount(
      options.plannerSpreadGap,
    );
  if (satisfyingTargetNodeIds.size >= requiredSatisfyingTargetCount) {
    return Object.freeze({
      satisfied: true,
      reasonCode:
        PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON
          .REPLACE_REMOVE_DISPATCH_PHASE_ON_ELIGIBLE_TARGET,
      satisfyingOperationIds: Object.freeze([...satisfyingOperationIds]),
      satisfyingOperationCount: satisfyingOperationIds.length,
      blockingOperationIds: Object.freeze([...blockingOperationIds]),
      blockingOperationCount: blockingOperationIds.length,
    });
  }
  return Object.freeze({
    satisfied: false,
    reasonCode:
      blockingOperationIds.length > 0 ?
        PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.ACTIVE_OPERATION_STILL_BLOCKS_SPREAD :
        PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON.UNSATISFIED,
    satisfyingOperationIds: Object.freeze([...satisfyingOperationIds]),
    satisfyingOperationCount: satisfyingOperationIds.length,
    blockingOperationIds: Object.freeze([...blockingOperationIds]),
    blockingOperationCount: blockingOperationIds.length,
  });
}

function normalizePriorityRecoveryOperationContextList(operationContexts = []) {
  return Array.isArray(operationContexts) ? operationContexts.filter(
    (operationContext) =>
      operationContext && typeof operationContext === 'object',
  ) : [];
}

function resolvePriorityRecoveryOperationContextOperationId(operationContext) {
  return String(operationContext?.operationId || LOCAL_STR_EMPTY).trim();
}

function resolvePriorityRecoveryOperationContextPartitionId(operationContext) {
  return String(
    operationContext?.partitionId || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE,
  ).trim();
}

function hasPriorityRecoverySeenOperationId(operationId, seenOperationIds) {
  return operationId.length > 0 && seenOperationIds.has(operationId);
}

function isPriorityRecoveryOperationIdSuperseded(
  operationId,
  supersededOperationIds,
) {
  return operationId.length > 0 && supersededOperationIds.has(operationId);
}

function isPriorityRecoveryTerminalNonPlacementOperationContext(
  operationContext,
) {
  return (
    isPriorityRecoveryOperationContextTerminal(operationContext) !== false &&
    isPriorityRecoveryCompletedPlacementOperationContext(operationContext) !==
      true
  );
}

function shouldSkipPriorityRecoverySpreadRelevantOperationContext(
  operationContext,
  operationId,
  seenOperationIds,
  supersededOperationIds,
) {
  return (
    hasPriorityRecoverySeenOperationId(operationId, seenOperationIds) ||
    isPriorityRecoveryOperationIdSuperseded(
      operationId,
      supersededOperationIds,
    ) ||
    isPriorityRecoveryTerminalNonPlacementOperationContext(operationContext)
  );
}

function buildPriorityRecoverySpreadRelevantOperationContexts(
  operationContexts = [],
) {
  const spreadRelevantOperationContexts = [];
  const seenOperationIds = new Set();
  const normalizedOperationContexts =
    normalizePriorityRecoveryOperationContextList(operationContexts);
  const supersededOperationIds =
    buildPriorityRecoverySupersededOperationIdSet(normalizedOperationContexts);
  for (const operationContext of normalizedOperationContexts) {
    const operationId =
      resolvePriorityRecoveryOperationContextOperationId(operationContext);
    if (
      shouldSkipPriorityRecoverySpreadRelevantOperationContext(
        operationContext,
        operationId,
        seenOperationIds,
        supersededOperationIds,
      )
    ) {
      continue;
    }
    if (operationId.length > 0) {
      seenOperationIds.add(operationId);
    }
    spreadRelevantOperationContexts.push(operationContext);
  }
  return spreadRelevantOperationContexts;
}

function resolvePriorityRecoveryOperationContextFreshnessMs(operationContext) {
  const freshnessCandidates = [
    operationContext?.completedAtMs,
    operationContext?.updatedAtMs,
    operationContext?.createdAtMs,
  ]
    .map((candidate) => normalizePriorityRecoveryInteger(candidate))
    .filter((candidate) => Number.isFinite(candidate));
  if (freshnessCandidates.length === 0) {
    return -1;
  }
  return Math.max(...freshnessCandidates);
}

function isPriorityRecoveryDispatchPendingWorkflowStep(operationContext) {
  const workflowStep = String(
    operationContext?.workflowStep || LOCAL_STR_EMPTY,
  ).toUpperCase();
  return DISPATCH_PENDING_WORKFLOW_STEPS.has(workflowStep);
}

function isPriorityRecoverySupersedableInFlightOperationContext(
  operationContext,
) {
  if (!operationContext || typeof operationContext !== 'object') {
    return false;
  }
  if (isPriorityRecoveryOperationContextTerminal(operationContext)) {
    return false;
  }
  if (isReplaceRemoveDispatchPhase(operationContext)) {
    return false;
  }
  if (isPriorityRecoveryDispatchPendingWorkflowStep(operationContext)) {
    return false;
  }
  return (
    operationContext.targetVisibilityState !==
    PRIORITY_RECOVERY_TARGET_VISIBILITY_STATE.ACTIVE_OPERATIONAL
  );
}

function shouldTrackPriorityRecoveryTerminalFreshness(operationContext) {
  return (
    isPriorityRecoveryOperationContextTerminal(operationContext) === true &&
    isPriorityRecoveryCompletedPlacementOperationContext(operationContext) !==
      true
  );
}

function recordPriorityRecoveryTerminalFreshness(
  latestTerminalFreshnessByPartitionId,
  operationContext,
) {
  const partitionId =
    resolvePriorityRecoveryOperationContextPartitionId(operationContext);
  if (partitionId.length === 0) {
    return;
  }
  const terminalFreshness =
    resolvePriorityRecoveryOperationContextFreshnessMs(operationContext);
  if (!Number.isFinite(terminalFreshness)) {
    return;
  }
  const previousFreshness =
    latestTerminalFreshnessByPartitionId.get(partitionId) || 0;
  if (terminalFreshness > previousFreshness) {
    latestTerminalFreshnessByPartitionId.set(partitionId, terminalFreshness);
  }
}

function buildPriorityRecoveryLatestTerminalFreshnessByPartitionId(
  normalizedOperationContexts,
) {
  const latestTerminalFreshnessByPartitionId = new Map();
  for (const operationContext of normalizedOperationContexts) {
    if (!shouldTrackPriorityRecoveryTerminalFreshness(operationContext)) {
      continue;
    }
    recordPriorityRecoveryTerminalFreshness(
      latestTerminalFreshnessByPartitionId,
      operationContext,
    );
  }
  return latestTerminalFreshnessByPartitionId;
}

function shouldSupersedePriorityRecoveryOperationContext(
  operationContext,
  latestTerminalFreshnessByPartitionId,
) {
  const partitionId =
    resolvePriorityRecoveryOperationContextPartitionId(operationContext);
  if (partitionId.length === 0) {
    return false;
  }
  const operationFreshness =
    resolvePriorityRecoveryOperationContextFreshnessMs(operationContext);
  const latestTerminalFreshness =
    latestTerminalFreshnessByPartitionId.get(partitionId) || -1;
  return (
    Number.isFinite(operationFreshness) &&
    Number.isFinite(latestTerminalFreshness) &&
    latestTerminalFreshness > operationFreshness
  );
}

function collectPriorityRecoverySupersededOperationIdSet(
  normalizedOperationContexts,
  latestTerminalFreshnessByPartitionId,
) {
  const supersededOperationIds = new Set();
  for (const operationContext of normalizedOperationContexts) {
    const operationId =
      resolvePriorityRecoveryOperationContextOperationId(operationContext);
    if (operationId.length === 0) {
      continue;
    }
    if (
      !isPriorityRecoverySupersedableInFlightOperationContext(
        operationContext,
      )
    ) {
      continue;
    }
    if (
      shouldSupersedePriorityRecoveryOperationContext(
        operationContext,
        latestTerminalFreshnessByPartitionId,
      )
    ) {
      supersededOperationIds.add(operationId);
    }
  }
  return supersededOperationIds;
}

function buildPriorityRecoverySupersededOperationIdSet(operationContexts = []) {
  const normalizedOperationContexts =
    normalizePriorityRecoveryOperationContextList(operationContexts);
  const latestTerminalFreshnessByPartitionId =
    buildPriorityRecoveryLatestTerminalFreshnessByPartitionId(
      normalizedOperationContexts,
    );
  return collectPriorityRecoverySupersededOperationIdSet(
    normalizedOperationContexts,
    latestTerminalFreshnessByPartitionId,
  );
}

function resolvePriorityRecoverySemanticState(options = {}) {
  const blockerReasons = normalizePriorityRecoveryStringList(
    options.blockerReasons,
  );
  for (const blockerReason of PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE) {
    if (!blockerReasons.includes(blockerReason)) {
      continue;
    }
    return (
      PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE[blockerReason] ||
      PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED
    );
  }
  if (
    options.spreadCompletion?.satisfied === true &&
    options.hasActiveOperationContexts === true
  ) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  if (options.plannerReady === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED;
  }
  if (options.spreadCompletion?.satisfied === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT;
  }
  if (options.hasActiveOperationContexts === true) {
    return PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT;
  }
  return PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED;
}

function resolvePriorityRecoveryReasonCodesFromReadiness(readinessEntry) {
  const reasons = Array.isArray(readinessEntry?.reasons) ?
    readinessEntry.reasons :
    [];
  return normalizePriorityRecoveryStringList(
    reasons.map((reason) =>
      String(reason?.code || PRIORITY_RECOVERY_SNAPSHOT_LITERAL.VALUE).trim(),
    ),
  );
}

function buildPriorityRecoveryDecisionPartitionIdSet(decisionSnapshots = null) {
  const partitionIds = new Set();
  if (!decisionSnapshots || typeof decisionSnapshots !== 'object') {
    return partitionIds;
  }
  addPriorityRecoveryDecisionSnapshotPartitionIds(
    partitionIds,
    decisionSnapshots,
  );
  addPriorityRecoveryDecisionSemanticPartitionIds(
    partitionIds,
    decisionSnapshots,
  );
  return partitionIds;
}

function addPriorityRecoveryDecisionSnapshotPartitionIds(
  partitionIds,
  decisionSnapshots,
) {
  for (const snapshot of Array.isArray(decisionSnapshots.snapshots) ?
    decisionSnapshots.snapshots :
    []) {
    const partitionId = String(snapshot?.partitionId || '').trim();
    if (partitionId.length > 0) {
      partitionIds.add(partitionId);
    }
  }
}

function addPriorityRecoveryDecisionSemanticPartitionIds(
  partitionIds,
  decisionSnapshots,
) {
  const partitionIdsBySemanticState =
    decisionSnapshots.partitionIdsBySemanticState &&
    typeof decisionSnapshots.partitionIdsBySemanticState === 'object' ?
      decisionSnapshots.partitionIdsBySemanticState :
      {};
  for (const partitionIdsForState of Object.values(
    partitionIdsBySemanticState,
  )) {
    for (const partitionId of normalizePriorityRecoveryStringList(
      partitionIdsForState,
    )) {
      partitionIds.add(partitionId);
    }
  }
}

function isPriorityRecoveryTrackedPartitionId(partitionId) {
  const normalizedPartitionId = String(partitionId || '').trim();
  if (normalizedPartitionId.length === 0) {
    return false;
  }
  const tableId = inferPriorityRecoveryTableNameFromPartitionId(
    normalizedPartitionId,
  );
  return tableId !== null && PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId);
}

function filterPriorityRecoveryTrackedPartitionIds(partitionIds = []) {
  return Object.freeze(
    normalizePriorityRecoveryStringList(partitionIds).filter((partitionId) =>
      isPriorityRecoveryTrackedPartitionId(partitionId),
    ),
  );
}

function normalizePriorityRecoveryDecisionSnapshotSemanticState(
  semanticState,
) {
  const normalizedSemanticState = String(semanticState || LOCAL_STR_EMPTY)
    .trim();
  return PRIORITY_RECOVERY_SEMANTIC_STATE_IDS.includes(
    normalizedSemanticState,
  ) ?
    normalizedSemanticState :
    null;
}

export {
  buildPriorityRecoveryBlockedPartitionIds,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryDecisionPartitionIdSet,
  buildPriorityRecoveryPlannerByPartitionId,
  buildPriorityRecoveryPlannerEntry,
  buildPriorityRecoverySemanticPartitionSetMap,
  buildPriorityRecoverySpreadCompletion,
  buildPriorityRecoverySpreadRelevantOperationContexts,
  buildPriorityRecoverySupersededOperationIdSet,
  buildUnknownPriorityRecoveryPlanner,
  filterPriorityRecoveryTrackedPartitionIds,
  hasPriorityRecoverySpreadGap,
  isPriorityRecoverySpreadSatisfyingOperationContext,
  isPriorityRecoverySupersedableInFlightOperationContext,
  isPriorityRecoveryTrackedPartitionId,
  normalizePriorityRecoveryDecisionSnapshotSemanticState,
  readFirstIntegerField,
  readFirstStringField,
  resolvePriorityRecoveryOperationContextFreshnessMs,
  resolvePriorityRecoveryReasonCodesFromReadiness,
  resolvePriorityRecoverySemanticState,
};
