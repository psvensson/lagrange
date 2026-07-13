/**
 * Single owner of the replica-placement CURE-TYPING relation (quest
 * cure-typing-single-owner-table; epic self-hosting-circularity-
 * generic-treatment Option 5, rung 4 — the 2b5875b0 lineage).
 *
 * "Which cure move type does a detected placement condition take, and which
 * admission lane does that cure enter" used to be re-derived per site:
 * calculateMoves hand-rolled the whole condition-to-cure mapping from raw
 * target-vs-current count diffs, buildPriorityRecoveryFollowUpMove re-inferred
 * healthy-at-target-with-source REPLACE else ADD (2b5875b0: that conjunct's
 * cousin classified a 1-2 voter ledger view as REPLACE-curable concentration
 * and starved the restoring ADD), and six budget/admission helpers each
 * hand-rolled the emergency-partition lane conjunct. This module declares the
 * relation ONCE: named placement conditions with their cure rows (move type +
 * move reason, reviewable side by side), the follow-up condition classifier,
 * the admission partition-class classifier (its classification ORDER lives
 * here), the cure budget-scope rows, and the ordinary-serial-lane cure move
 * membership. Consumers resolve rows; they never re-derive type or lane
 * conjuncts. The census analyzer (scripts/check-cure-typing-owner.js,
 * npm run audit:cure-typing-owner) counts any re-derivation outside the owner
 * family (this module, operation-ledger-hold-policy.js and
 * operation-ledger-quorum-concentration.js — which keep the ledger hold
 * engagement rows and hold-state detection, including the placement-skew
 * REPLACE cure — and the control-plane admission-plan owner).
 *
 * Rows deliberately DIFFER per condition — that is the point of naming them.
 * Review question for every new condition or lane: which row covers it, and
 * why does that cure or lane stop where it stops?
 */
import {OperationType} from './replica-status.js';
import {
  CONCURRENT_CREATE_BUDGET_SCOPE,
  MOVE_REASON,
  REBALANCER_MOVE_TYPE,
} from './rebalancer-constants.js';
import {
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  classifyPriorityRecoveryAdmissionPartitionClass,
} from '../control-plane/priority-recovery-admission-constants.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';

// The named placement conditions a planner can detect. Detection (count
// diffs, health reads, target membership) is caller mechanism; the
// condition -> cure mapping is owned here.
const PLACEMENT_CURE_CONDITION = Object.freeze({
  // A target node holds fewer replicas than the intended placement.
  UNDER_REPRESENTATION: 'under_representation',
  // A replica is FAILED (or a terminal failed replace target).
  FAILED_REPLICA: 'failed_replica',
  // A replica sits on a node the intended placement no longer includes.
  NODE_NOT_IN_TARGET: 'node_not_in_target',
  // A node holds more replicas of the partition than the placement intends.
  OVER_REPRESENTATION: 'over_representation',
  // An under-represented target paired with an over-represented source:
  // relocation, cured count-neutrally.
  PAIRED_RELOCATION: 'paired_relocation',
  // The partition is at target count but a source replica should be walked
  // off its node (priority-recovery follow-up).
  UNHEALTHY_SOURCE_AT_TARGET: 'unhealthy_source_at_target',
});

// The declared relation: condition -> {moveType, moveReason}. ADD cures
// under-replication, REMOVE cures surplus and failure, the count-neutral
// REPLACE cures placement mismatch (2b5875b0: never conflate the two — a
// REPLACE cannot cure a count deficit, an ADD cannot cure skew). The ledger
// placement-skew REPLACE row lives with its hold in
// operation-ledger-hold-policy.js (LEDGER_QUORUM_SPREAD_CURE_MOVE_TYPES).
const PLACEMENT_CURE_BY_CONDITION = Object.freeze(
  new Map([
    [
      PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.ADD,
        moveReason: MOVE_REASON.INCREASE_REPLICA_COUNT,
      }),
    ],
    [
      PLACEMENT_CURE_CONDITION.FAILED_REPLICA,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.REMOVE,
        moveReason: MOVE_REASON.REPLICA_FAILED,
      }),
    ],
    [
      PLACEMENT_CURE_CONDITION.NODE_NOT_IN_TARGET,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.REMOVE,
        moveReason: MOVE_REASON.NODE_NOT_IN_TARGET,
      }),
    ],
    [
      PLACEMENT_CURE_CONDITION.OVER_REPRESENTATION,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.REMOVE,
        moveReason: MOVE_REASON.SPREAD_REPLICAS,
      }),
    ],
    [
      PLACEMENT_CURE_CONDITION.PAIRED_RELOCATION,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.REPLACE,
        moveReason: MOVE_REASON.REPLACE_REPLICA,
      }),
    ],
    [
      PLACEMENT_CURE_CONDITION.UNHEALTHY_SOURCE_AT_TARGET,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.REPLACE,
        moveReason: MOVE_REASON.REPLACE_REPLICA,
      }),
    ],
  ]),
);

/**
 * Resolve the declared cure row for a placement condition. Fail-closed: an
 * undeclared condition resolves to null — the caller mints NO move (a cure
 * must never be improvised for a condition without a row).
 * @param {string} condition One of PLACEMENT_CURE_CONDITION.
 * @return {{moveType: string, moveReason: string}|null}
 */
function resolvePlacementCure(condition) {
  return PLACEMENT_CURE_BY_CONDITION.get(condition) ?? null;
}

/**
 * The 2b5875b0 conjunct, owned: classify what a priority-recovery follow-up
 * observes. At-or-above target with a selectable source is a REPLACE-shaped
 * relocation; anything else is a count deficit and belongs to the ADD row —
 * too few replicas is never REPLACE-curable.
 * @param {Object} params
 * @param {number} params.healthyReplicaCount
 * @param {number} params.targetReplicaCount
 * @param {boolean} params.hasSelectableSourceReplica
 * @return {string} One of PLACEMENT_CURE_CONDITION
 *   (UNHEALTHY_SOURCE_AT_TARGET or UNDER_REPRESENTATION).
 */
function classifyPriorityRecoveryFollowUpCureCondition({
  healthyReplicaCount,
  targetReplicaCount,
  hasSelectableSourceReplica,
}) {
  return healthyReplicaCount >= targetReplicaCount &&
    hasSelectableSourceReplica === true ?
    PLACEMENT_CURE_CONDITION.UNHEALTHY_SOURCE_AT_TARGET :
    PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION;
}

/**
 * Ingress normalization across the two consumer domains (planner MoveType
 * values are lowercase, coordinator OperationType values uppercase; CL-013
 * precedent: case-sensitive comparison at a policy seam is fail-open).
 * @param {*} moveType
 * @return {string|null}
 * @private
 */
function normalizePlacementCureMoveType(moveType) {
  if (typeof moveType !== LOCAL_STR_STRING) {
    return null;
  }
  const normalized = moveType.toUpperCase();
  return normalized.length === 0 ? null : normalized;
}

// The admission partition-class classifier lives with the lane vocabulary in
// priority-recovery-admission-constants.js (the admission-plan owner sits in
// that module's import tree; importing it from here would cycle through
// rebalance-coordinator-shared). Re-exported below — rebalancer consumers
// read the whole cure-typing relation from this owner surface.

/**
 * The cure budget-scope rows: which concurrent-create budget a cure move
 * draws from. REMOVE always drains through the remove scope; a non-priority
 * (or unclassifiable) create draws the plain add budget; a priority-class
 * create draws the priority add budget, escalating to the emergency overflow
 * scope only for an EMERGENCY_PRIORITY partition while the overflow is
 * active — an ordinary-priority cure never enters the emergency lane.
 * @param {Object} params
 * @param {*} params.moveType
 * @param {string} params.partitionClass One of
 *   PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.
 * @param {boolean} params.usesEmergencyPriorityOverflow
 * @return {string} One of CONCURRENT_CREATE_BUDGET_SCOPE.
 */
function resolvePlacementCureBudgetScope({
  moveType,
  partitionClass,
  usesEmergencyPriorityOverflow,
}) {
  const normalizedMoveType = normalizePlacementCureMoveType(moveType);
  if (normalizedMoveType === OperationType.REMOVE) {
    return CONCURRENT_CREATE_BUDGET_SCOPE.REMOVE;
  }
  if (
    (normalizedMoveType !== OperationType.ADD &&
      normalizedMoveType !== OperationType.REPLACE) ||
    partitionClass ===
      PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY ||
    !Object.values(PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS).includes(
      partitionClass,
    )
  ) {
    return CONCURRENT_CREATE_BUDGET_SCOPE.ADD;
  }
  if (
    partitionClass ===
      PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY &&
    usesEmergencyPriorityOverflow === true
  ) {
    return CONCURRENT_CREATE_BUDGET_SCOPE.EMERGENCY_PRIORITY_ADD;
  }
  return CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD;
}

/**
 * Resolve the cure budget scope against a live priority-recovery admission
 * plan: the plan owns the overflow lane state (usesEmergencyPriorityOverflow
 * — emergency recovery active AND the partition classifies emergency under
 * the plan's own predicates); this resolves the declared rows against it.
 * The class conjunct uses the global emergency classifier while the overflow
 * bit uses the plan's — identical in production (both delegate to the same
 * table-id set); a divergence is expressible only with inconsistent injected
 * predicates.
 * @param {Object} params
 * @param {*} params.moveType
 * @param {*} params.partitionId
 * @param {Object|null} params.admissionPlan
 * @param {function(string): boolean} [params.isPriorityPartition]
 * @return {string} One of CONCURRENT_CREATE_BUDGET_SCOPE.
 */
function resolvePlacementCureBudgetScopeFromAdmissionPlan({
  moveType,
  partitionId,
  admissionPlan,
  isPriorityPartition,
}) {
  const partitionClass = classifyPriorityRecoveryAdmissionPartitionClass(
    partitionId,
    {isPriorityPartition},
  );
  return resolvePlacementCureBudgetScope({
    moveType,
    partitionClass,
    usesEmergencyPriorityOverflow:
      typeof admissionPlan?.usesEmergencyPriorityOverflow ===
        LOCAL_STR_FUNCTION &&
      admissionPlan.usesEmergencyPriorityOverflow(partitionId) === true,
  });
}

// Named row: the cure move types that occupy the ordinary-priority serial
// lane (one recovery reconfiguration at a time). ADD always occupies it; a
// REPLACE occupies it only until its remove-dispatch phase (the drain no
// longer contends for the lane); REMOVE never does.
const ORDINARY_SERIAL_LANE_CURE_MOVE_TYPES = Object.freeze(
  new Set([OperationType.ADD, OperationType.REPLACE]),
);

/**
 * @param {*} moveType
 * @param {boolean} inReplaceRemoveDispatchPhase
 * @return {boolean}
 */
function isOrdinarySerialLaneCureMove(moveType, inReplaceRemoveDispatchPhase) {
  const normalizedMoveType = normalizePlacementCureMoveType(moveType);
  if (!ORDINARY_SERIAL_LANE_CURE_MOVE_TYPES.has(normalizedMoveType)) {
    return false;
  }
  return normalizedMoveType === OperationType.ADD ||
    inReplaceRemoveDispatchPhase !== true;
}

export {
  ORDINARY_SERIAL_LANE_CURE_MOVE_TYPES,
  PLACEMENT_CURE_BY_CONDITION,
  PLACEMENT_CURE_CONDITION,
  // Re-exported lane vocabulary: consumers of the classifier read its result
  // against these values without re-importing the control-plane home.
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  classifyPriorityRecoveryAdmissionPartitionClass,
  classifyPriorityRecoveryFollowUpCureCondition,
  isOrdinarySerialLaneCureMove,
  resolvePlacementCure,
  resolvePlacementCureBudgetScope,
  resolvePlacementCureBudgetScopeFromAdmissionPlan,
};
