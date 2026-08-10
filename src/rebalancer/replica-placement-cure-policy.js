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
import {
  isOperationLedgerPartition,
  isPriorityControlPlanePartition,
} from '../bootstrap/system-partition-classification.js';

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
  // The self-hosted operation ledger has reached a 2-1 three-voter spread
  // after its first exclusive REPLACE. Expand onto the missing third node so
  // the existing safe surplus REMOVE can drain the fourth voter without
  // paying a second serialized ledger self-move.
  LEDGER_EXPAND_FOR_SPREAD: 'ledger_expand_for_spread',
  // The expanded ledger is one voter over target and has already reached the
  // three-node spread floor. Drain the duplicated voter before chasing an
  // exact suitability target; otherwise the generic relocation pairing turns
  // the surplus back into another exclusive REPLACE.
  LEDGER_DRAIN_SPREAD_SURPLUS: 'ledger_drain_spread_surplus',
  // A non-ledger priority partition at target count is still concentrated.
  // Expand by one voter without a REPLACE leadership handoff, then let the
  // serial drain row below restore the target count.
  PRIORITY_EXPAND_FOR_SPREAD: 'priority_expand_for_spread',
  // A non-ledger priority partition is one voter above target after its serial
  // spread ADD. Drain one redundant source only when doing so preserves the
  // current distinct-node count.
  PRIORITY_DRAIN_SPREAD_SURPLUS: 'priority_drain_spread_surplus',
  // A non-ledger priority partition stuck OVER target while still below its
  // distinct-node floor: prior replacements piled surplus voters whose drain
  // is spread-gated, and the over-creation cap used to wipe the only
  // floor-restoring ADD (the ec-postfix cure-starvation stall: 40 wipes on
  // control_plane_publications-p1 at 4 voters / 2-of-3 distinct nodes).
  // Retain the serial spread ADD onto nodes not already hosting the
  // partition — capped at the open gap — and keep refusing everything else.
  PRIORITY_OVER_TARGET_SPREAD_CURE: 'priority_over_target_spread_cure',
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
      PLACEMENT_CURE_CONDITION.LEDGER_EXPAND_FOR_SPREAD,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.ADD,
        moveReason: MOVE_REASON.SPREAD_REPLICAS,
      }),
    ],
    [
      PLACEMENT_CURE_CONDITION.LEDGER_DRAIN_SPREAD_SURPLUS,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.REMOVE,
        moveReason: MOVE_REASON.SPREAD_REPLICAS,
      }),
    ],
    [
      PLACEMENT_CURE_CONDITION.PRIORITY_EXPAND_FOR_SPREAD,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.ADD,
        moveReason: MOVE_REASON.SPREAD_REPLICAS,
      }),
    ],
    [
      PLACEMENT_CURE_CONDITION.PRIORITY_DRAIN_SPREAD_SURPLUS,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.REMOVE,
        moveReason: MOVE_REASON.SPREAD_REPLICAS,
      }),
    ],
    [
      PLACEMENT_CURE_CONDITION.PRIORITY_OVER_TARGET_SPREAD_CURE,
      Object.freeze({
        moveType: REBALANCER_MOVE_TYPE.ADD,
        moveReason: MOVE_REASON.SPREAD_REPLICAS,
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
 * Classify the exact operation-ledger state where the final spread step should
 * expand then drain instead of paying a second exclusive REPLACE.
 * @param {Object} evidence
 * @return {string|null} LEDGER_EXPAND_FOR_SPREAD or null.
 */
function classifyLedgerExpandForSpreadCureCondition(evidence = {}) {
  const targetReplicaCount = Number(evidence.targetReplicaCount);
  const targetDistinctNodeCount = Number(evidence.targetDistinctNodeCount);
  if (!isOperationLedgerPartition({partitionId: evidence.partitionId})) {
    return null;
  }
  const exactExpandState = [
    evidence.inFlightReplaceCount === 0,
    evidence.naturalReplaceCount >= 1,
    evidence.replaceCount === 1,
    evidence.addMoveCount >= 1,
    evidence.occupiedReplicaCount === targetReplicaCount,
    evidence.deficitEffectiveCount === targetReplicaCount,
    evidence.voterReplicaCount === targetReplicaCount,
    evidence.activeReplicaCount === targetReplicaCount,
    targetDistinctNodeCount === targetReplicaCount,
    evidence.activeDistinctNodeCount === targetDistinctNodeCount - 1,
  ].every(Boolean);
  return exactExpandState ?
    PLACEMENT_CURE_CONDITION.LEDGER_EXPAND_FOR_SPREAD :
    null;
}

/**
 * Classify the post-expand ledger state where a safe surplus drain must take
 * precedence over another exact-target relocation.
 * @param {Object} evidence
 * @return {string|null} LEDGER_DRAIN_SPREAD_SURPLUS or null.
 */
function classifyLedgerSpreadSurplusDrainCureCondition(evidence = {}) {
  const targetReplicaCount = Number(evidence.targetReplicaCount);
  const targetDistinctNodeCount = Number(evidence.targetDistinctNodeCount);
  if (!isOperationLedgerPartition({partitionId: evidence.partitionId})) {
    return null;
  }
  const requiredDistinctNodeCount = Math.min(
    targetReplicaCount,
    targetDistinctNodeCount,
  );
  const exactDrainState = [
    targetReplicaCount > 0,
    evidence.occupiedReplicaCount > targetReplicaCount,
    evidence.voterReplicaCount > targetReplicaCount,
    evidence.activeReplicaCount > targetReplicaCount,
    evidence.activeDistinctNodeCount >= requiredDistinctNodeCount,
    evidence.standaloneSafeRemoveCount >= 1,
  ].every(Boolean);
  return exactDrainState ?
    PLACEMENT_CURE_CONDITION.LEDGER_DRAIN_SPREAD_SURPLUS :
    null;
}

/**
 * Classify an at-target non-ledger priority partition whose spread gap should
 * be cured by one serial ADD without a disruptive REPLACE handoff.
 * @param {Object} evidence
 * @return {string|null} PRIORITY_EXPAND_FOR_SPREAD or null.
 */
function classifyPriorityExpandForSpreadCureCondition(evidence = {}) {
  const targetReplicaCount = Number(evidence.targetReplicaCount);
  const targetDistinctNodeCount = Number(evidence.targetDistinctNodeCount);
  const partitionId = evidence.partitionId;
  if (
    !isPriorityControlPlanePartition({partitionId}) ||
    isOperationLedgerPartition({partitionId})
  ) {
    return null;
  }
  const requiredDistinctNodeCount = Math.min(
    targetReplicaCount,
    targetDistinctNodeCount,
  );
  const exactExpandState = [
    evidence.inFlightReplaceCount === 0,
    evidence.naturalReplaceCount >= 1,
    evidence.addMoveCount >= 1,
    evidence.occupiedReplicaCount === targetReplicaCount,
    evidence.deficitEffectiveCount === targetReplicaCount,
    evidence.voterReplicaCount === targetReplicaCount,
    evidence.activeReplicaCount === targetReplicaCount,
    requiredDistinctNodeCount > 0,
    evidence.activeDistinctNodeCount < requiredDistinctNodeCount,
  ].every(Boolean);
  return exactExpandState ?
    PLACEMENT_CURE_CONDITION.PRIORITY_EXPAND_FOR_SPREAD :
    null;
}

/**
 * Classify the target-plus-one state after a non-ledger priority spread ADD.
 * The selected REMOVE must preserve the current distinct-node count so serial
 * expand/drain is monotonic before the final spread floor is reached. The
 * drain yields to an ACTIONABLE floor-restoring spread ADD while the
 * distinct-node floor is unmet (the ledger sibling above already carries this
 * floor conjunct): in the degraded-read window (no authoritative voter-ready
 * rows) the remove-safety owner fails closed against exactly this drain, and
 * even with authoritative rows expand-before-drain converges to the floor
 * while drain-first burns a serial slot without closing the gap. With no
 * actionable spread ADD the monotonic drain proceeds exactly as before.
 * @param {Object} evidence
 * @return {string|null} PRIORITY_DRAIN_SPREAD_SURPLUS or null.
 */
function classifyPrioritySpreadSurplusDrainCureCondition(evidence = {}) {
  const targetReplicaCount = Number(evidence.targetReplicaCount);
  const targetDistinctNodeCount = Number(evidence.targetDistinctNodeCount);
  const partitionId = evidence.partitionId;
  if (
    !isPriorityControlPlanePartition({partitionId}) ||
    isOperationLedgerPartition({partitionId})
  ) {
    return null;
  }
  const requiredDistinctNodeCount = Math.min(
    targetReplicaCount,
    targetDistinctNodeCount,
  );
  // Absent evidence means no actionable cure ADD is known — the drain
  // proceeds exactly as before the yield conjunct existed.
  const actionableSpreadCureAddCount =
    Number(evidence.actionableSpreadCureAddCount) || 0;
  const exactDrainState = [
    targetReplicaCount > 0,
    evidence.occupiedReplicaCount > targetReplicaCount,
    evidence.voterReplicaCount > targetReplicaCount,
    evidence.activeReplicaCount > targetReplicaCount,
    evidence.monotonicSafeRemoveCount >= 1,
    actionableSpreadCureAddCount === 0 ||
      evidence.activeDistinctNodeCount >= requiredDistinctNodeCount,
  ].every(Boolean);
  return exactDrainState ?
    PLACEMENT_CURE_CONDITION.PRIORITY_DRAIN_SPREAD_SURPLUS :
    null;
}

/**
 * Classify the over-target non-ledger priority partition whose surplus
 * cannot settle while its distinct-node floor is unmet. The over-creation
 * cap must RETAIN (not wipe) the serial spread ADD onto a fresh node: the
 * surplus drain is spread-gated in exactly this state, so wiping the only
 * floor-restoring ADD starves the cure and stalls formation (drain waits
 * for spread, spread ADD wiped because over target — the recorded
 * circular-dependency-class-formation-vs-steady-state shape). Mirrors the
 * at-target PRIORITY_EXPAND_FOR_SPREAD row one state earlier; the
 * in-flight-REPLACE conjunct keeps the serialized-reconfiguration invariant.
 * @param {Object} evidence
 * @return {string|null} PRIORITY_OVER_TARGET_SPREAD_CURE or null.
 */
function classifyPriorityOverTargetSpreadCureCondition(evidence = {}) {
  const targetReplicaCount = Number(evidence.targetReplicaCount);
  const targetDistinctNodeCount = Number(evidence.targetDistinctNodeCount);
  const partitionId = evidence.partitionId;
  if (
    !isPriorityControlPlanePartition({partitionId}) ||
    isOperationLedgerPartition({partitionId})
  ) {
    return null;
  }
  const requiredDistinctNodeCount = Math.min(
    targetReplicaCount,
    targetDistinctNodeCount,
  );
  const exactRetentionState = [
    targetReplicaCount > 0,
    evidence.inFlightReplaceCount === 0,
    evidence.addMoveCount >= 1,
    evidence.voterReplicaCount > targetReplicaCount,
    requiredDistinctNodeCount > 0,
    evidence.activeDistinctNodeCount < requiredDistinctNodeCount,
  ].every(Boolean);
  return exactRetentionState ?
    PLACEMENT_CURE_CONDITION.PRIORITY_OVER_TARGET_SPREAD_CURE :
    null;
}

/**
 * Once a healthy priority partition is at target count and satisfies its
 * distinct-node spread floor, exact suitability is not a recovery cure.
 * Suppressing that relocation preserves the current leader and prevents
 * formation from turning a satisfied safety topology back into handoff work.
 * @param {Object} evidence
 * @return {boolean}
 */
function isPrioritySpreadSatisfiedAtTarget(evidence = {}) {
  const targetReplicaCount = Number(evidence.targetReplicaCount);
  const targetDistinctNodeCount = Number(evidence.targetDistinctNodeCount);
  if (
    !isPriorityControlPlanePartition({
      partitionId: evidence.partitionId,
    })
  ) {
    return false;
  }
  const requiredDistinctNodeCount = Math.min(
    targetReplicaCount,
    targetDistinctNodeCount,
  );
  return [
    targetReplicaCount > 0,
    evidence.occupiedReplicaCount === targetReplicaCount,
    evidence.voterReplicaCount === targetReplicaCount,
    evidence.activeReplicaCount === targetReplicaCount,
    evidence.activeDistinctNodeCount >= requiredDistinctNodeCount,
  ].every(Boolean);
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
  classifyLedgerExpandForSpreadCureCondition,
  classifyLedgerSpreadSurplusDrainCureCondition,
  classifyPriorityExpandForSpreadCureCondition,
  classifyPriorityOverTargetSpreadCureCondition,
  classifyPriorityRecoveryAdmissionPartitionClass,
  classifyPriorityRecoveryFollowUpCureCondition,
  classifyPrioritySpreadSurplusDrainCureCondition,
  isOrdinarySerialLaneCureMove,
  isPrioritySpreadSatisfiedAtTarget,
  resolvePlacementCure,
  resolvePlacementCureBudgetScope,
  resolvePlacementCureBudgetScopeFromAdmissionPlan,
};
