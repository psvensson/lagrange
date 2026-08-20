/**
 * Single owner of the operation-ledger HOLD-ENGAGEMENT relation (quest
 * hold-engagement-single-owner-table; epic self-hosting-circularity-
 * generic-treatment Option 5, rung 3 — the CL-013 lineage).
 *
 * "What does a candidate move (moveType x partition class) do while an
 * operation-ledger hold is engaged — exempt, idle-only, or defer" used to be
 * scattered control flow: the emergency quorum-restore ADD exemption conjunct
 * was written once per admission lane, ledger spread ADDs were exempt from
 * the self-move interlock only by OMISSION from the disruptive-move set
 * (CL-013: formation-time priority spread cannot be deferred without
 * circularity), and the cure-move classifier (REPLACE cures concentration)
 * was hand-rolled at the topology guard and the planning reorder. This module
 * declares the relation ONCE: named move classes, named hold kinds, and one
 * (hold x move class) -> engagement table, reviewable side by side.
 * Consumers resolve rows; they never re-derive conjuncts or read raw
 * hold state for a policy decision. The census analyzer
 * (scripts/check-hold-engagement-owner.js, npm run
 * audit:hold-engagement-owner) counts any re-derivation outside this module
 * and operation-ledger-quorum-concentration.js (which keeps hold-STATE
 * detection and stays policy-free).
 *
 * Rows deliberately DIFFER per hold — that is the point of naming them.
 * Review question for every new hold or exemption: which move class is it,
 * which row covers it, and why does that row's engagement stop where it
 * stops?
 */
import {
  OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES,
  OperationType,
  isDisruptiveOperationLedgerSelfMove,
  normalizeOperationLedgerMoveType,
} from './replica-status.js';
import {isOperationLedgerPartition} from '../bootstrap/system-partition-classification.js';
import {isPriorityRecoveryEmergencyPartition} from '../control-plane/priority-recovery-admission-constants.js';
import {
  evaluateOperationLedgerQuorumConcentration,
  isConcentratedOperationLedgerPartition,
} from './operation-ledger-quorum-concentration.js';

// The two operation-ledger admission holds. SELF_MOVE_SERIALIZATION is the
// run-20 interlock (a ledger self-move runs exclusively); QUORUM_SPREAD is
// the run-22 concentration hold (dependent admission defers until the ledger
// quorum spreads).
const OPERATION_LEDGER_HOLD = Object.freeze({
  SELF_MOVE_SERIALIZATION: 'ledger_self_move_serialization',
  QUORUM_SPREAD: 'ledger_quorum_spread',
});

// What an engaged hold means for a move: proceed regardless (EXEMPT), admit
// only into an idle ledger (IDLE_ONLY), or wait for release (DEFER).
const OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME = Object.freeze({
  EXEMPT: 'exempt',
  IDLE_ONLY: 'idle_only',
  DEFER: 'defer',
});

// The lifecycle evidence that may release a locally or remotely observed
// SELF_MOVE_SERIALIZATION hold. Workflow age is intentionally absent: timeout
// makes the operation eligible for the workflow recovery owner, but does not
// prove that target/source work stopped. The recovery owner releases the hold
// by committing its normal terminal transition, which is then observed here as
// AUTHORITATIVE_TERMINAL. Missing/deferred reads fail closed.
const OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE = Object.freeze({
  AUTHORITATIVE_TERMINAL: 'authoritative_terminal',
  AUTHORITATIVE_NON_TERMINAL: 'authoritative_non_terminal',
  UNRESOLVED: 'unresolved',
});

const OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION = Object.freeze({
  HOLD: 'hold',
  RELEASE: 'release',
});

// Single declared lifecycle relation for the run-20 serialization hold.
// Admission consumes this table; it does not reinterpret workflow timestamps,
// retry timers, or reaper candidacy as permission to release.
const OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION_BY_LIFECYCLE_EVIDENCE =
  Object.freeze(
    new Map([
      [
        OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_TERMINAL,
        OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.RELEASE,
      ],
      [
        OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE
          .AUTHORITATIVE_NON_TERMINAL,
        OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.HOLD,
      ],
      [
        OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.UNRESOLVED,
        OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.HOLD,
      ],
    ]),
  );

// The move classes of the relation. Classification order is significant and
// owned here: a disruptive ledger self-move is never also an emergency ADD
// (ADD is not a disruptive type), and everything unclassified is DEPENDENT.
const OPERATION_LEDGER_HOLD_MOVE_CLASS = Object.freeze({
  DISRUPTIVE_LEDGER_SELF_MOVE: 'disruptive_ledger_self_move',
  EMERGENCY_QUORUM_RESTORE_ADD: 'emergency_quorum_restore_add',
  DEPENDENT: 'dependent',
});

// Named row: the quorum-spread CURE move types. REPLACE performs the first
// count-neutral move off a fully concentrated ledger. Once that leaves a 2-1
// three-voter placement, ADD expands onto the missing third node without
// paying a second exclusive ledger self-move; the canonical standalone-safe
// REMOVE then drains the temporary surplus. REMOVE is deliberately absent:
// it is the cleanup after the spread cure, never the concentration cure.
const LEDGER_QUORUM_SPREAD_CURE_MOVE_TYPES = Object.freeze(
  new Set([OperationType.ADD, OperationType.REPLACE]),
);

// The declared relation: (hold x move class) -> engagement. Read column-wise
// per hold: the self-move interlock serializes (disruptive moves admit only
// into an idle ledger, everything else defers) while emergency quorum-restore
// ADDs stay exempt — control-plane spine availability outranks storm
// avoidance. The quorum-spread hold defers dependents only: the disruptive
// self-move IS the cure, and emergency ADDs restore the spine the hold
// protects.
const OPERATION_LEDGER_HOLD_ENGAGEMENT_BY_MOVE_CLASS = Object.freeze(
  new Map([
    [
      OPERATION_LEDGER_HOLD.SELF_MOVE_SERIALIZATION,
      Object.freeze(
        new Map([
          [
            OPERATION_LEDGER_HOLD_MOVE_CLASS.DISRUPTIVE_LEDGER_SELF_MOVE,
            OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.IDLE_ONLY,
          ],
          [
            OPERATION_LEDGER_HOLD_MOVE_CLASS.EMERGENCY_QUORUM_RESTORE_ADD,
            OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT,
          ],
          [
            OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT,
            OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.DEFER,
          ],
        ]),
      ),
    ],
    [
      OPERATION_LEDGER_HOLD.QUORUM_SPREAD,
      Object.freeze(
        new Map([
          [
            OPERATION_LEDGER_HOLD_MOVE_CLASS.DISRUPTIVE_LEDGER_SELF_MOVE,
            OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT,
          ],
          [
            OPERATION_LEDGER_HOLD_MOVE_CLASS.EMERGENCY_QUORUM_RESTORE_ADD,
            OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.EXEMPT,
          ],
          [
            OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT,
            OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.DEFER,
          ],
        ]),
      ),
    ],
  ]),
);

/**
 * Classify a candidate move for the hold-engagement relation.
 * @param {*} moveType
 * @param {*} partitionId
 * @return {string} One of OPERATION_LEDGER_HOLD_MOVE_CLASS.
 */
function classifyOperationLedgerHoldMove(moveType, partitionId) {
  if (isDisruptiveOperationLedgerSelfMove(moveType, partitionId)) {
    return OPERATION_LEDGER_HOLD_MOVE_CLASS.DISRUPTIVE_LEDGER_SELF_MOVE;
  }
  if (
    normalizeOperationLedgerMoveType(moveType) === OperationType.ADD &&
    isPriorityRecoveryEmergencyPartition(partitionId)
  ) {
    return OPERATION_LEDGER_HOLD_MOVE_CLASS.EMERGENCY_QUORUM_RESTORE_ADD;
  }
  return OPERATION_LEDGER_HOLD_MOVE_CLASS.DEPENDENT;
}

/**
 * Resolve the declared engagement for a hold and move class. Fail-closed:
 * an unknown hold or move class DEFERS (an undeclared combination must never
 * silently bypass a hold).
 * @param {string} holdKind
 * @param {string} moveClass
 * @return {string} One of OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.
 */
function resolveOperationLedgerHoldEngagement(holdKind, moveClass) {
  return (
    OPERATION_LEDGER_HOLD_ENGAGEMENT_BY_MOVE_CLASS.get(holdKind)?.get(
      moveClass,
    ) ?? OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME.DEFER
  );
}

/**
 * Classify authoritative workflow-owner evidence for a ledger self-move.
 * Terminality remains owned by the operation repository/workflow owner and is
 * supplied as a predicate; this policy owns only the evidence -> hold action
 * relation. A null operation includes absent, failed, and deferred owner reads.
 * @param {Object|null} authoritativeOperation
 * @param {Function} isOperationTerminal
 * @return {string} OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE
 */
function classifyOperationLedgerSelfMoveLifecycleEvidence(
  authoritativeOperation,
  isOperationTerminal,
) {
  if (
    !authoritativeOperation ||
    typeof isOperationTerminal !== 'function'
  ) {
    return OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.UNRESOLVED;
  }
  return isOperationTerminal(authoritativeOperation) ?
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_TERMINAL :
    OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE.AUTHORITATIVE_NON_TERMINAL;
}

/**
 * Resolve the single declared lifecycle action. Unknown evidence fails closed.
 * @param {string} lifecycleEvidence
 * @return {string} OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION
 */
function resolveOperationLedgerSelfMoveHoldAction(lifecycleEvidence) {
  return (
    OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION_BY_LIFECYCLE_EVIDENCE.get(
      lifecycleEvidence,
    ) ?? OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION.HOLD
  );
}

/**
 * Resolve the quorum-spread hold from actuals, as a policy decision surface:
 * null when the hold is not engaged; otherwise the evaluation plus the first
 * spread-actionable partition (engagement guarantees one exists).
 * @param {Object|null} systemTableCache
 * @return {{evaluation: Object, firstSpreadActionablePartition: Object}|null}
 */
function resolveEngagedLedgerQuorumSpreadHold(systemTableCache) {
  const evaluation =
    evaluateOperationLedgerQuorumConcentration(systemTableCache);
  if (evaluation.holdEngaged !== true) {
    return null;
  }
  return Object.freeze({
    evaluation,
    firstSpreadActionablePartition: evaluation.concentratedPartitions.find(
      (partition) => partition.spreadActionable,
    ),
  });
}

/**
 * Quorum-concentration evidence for a single partition (the planner's
 * priority-recovery gate reads this to keep planning the cure while the hold
 * itself sustains readiness-deferral states).
 * @param {Object|null} systemTableCache
 * @param {string|null} partitionId
 * @return {boolean}
 */
function isLedgerQuorumConcentratedPartition(systemTableCache, partitionId) {
  return isConcentratedOperationLedgerPartition(
    evaluateOperationLedgerQuorumConcentration(systemTableCache),
    partitionId,
  );
}

/**
 * The bounded post-completion extension of the ledger self-move hold. A
 * recently completed REPLACE still represents a formation episode whose
 * non-disruptive expand/drain work must settle before exact placement may
 * start another exclusive REPLACE.
 * @param {Object} params
 * @param {string|null} params.partitionId
 * @param {number} params.recentCompletedReplaceCount
 * @return {boolean}
 */
function shouldLeaseRecentCompletedLedgerSelfMove({
  partitionId,
  recentCompletedReplaceCount,
}) {
  return (
    isOperationLedgerPartition({partitionId}) &&
    Number(recentCompletedReplaceCount) > 0
  );
}

/**
 * The cure-move exemption of the QUORUM_SPREAD hold, fully resolved against
 * actuals: a cure-typed move of a concentrated ledger partition whose source
 * REPLACE sources must sit on the hottest node. ADD targets must be the
 * one of the feasible unoccupied nodes and may not expand a ledger already
 * over target.
 * Callers own their mechanism-side checks (inventory provenance, replica
 * actuals); this owns the relation side.
 * @param {Object} params
 * @param {Object|null} params.systemTableCache
 * @param {*} params.moveType
 * @param {string|null} params.partitionId
 * @param {string|null} params.sourceReplicaNodeId
 * @param {string|null} params.targetNodeId
 * @param {Array<string>} params.placementEligibleNodeIds
 * @return {boolean}
 */
function isEngagedLedgerQuorumSpreadCureMove({
  systemTableCache,
  moveType,
  partitionId,
  placementEligibleNodeIds,
  sourceReplicaNodeId,
  targetNodeId,
}) {
  const normalizedMoveType = normalizeOperationLedgerMoveType(moveType);
  if (
    !LEDGER_QUORUM_SPREAD_CURE_MOVE_TYPES.has(
      normalizedMoveType,
    ) ||
    !isOperationLedgerPartition({partitionId})
  ) {
    return false;
  }
  const evaluation =
    evaluateOperationLedgerQuorumConcentration(systemTableCache, {
      placementEligibleNodeIds,
    });
  const concentratedPartition = evaluation.concentratedPartitions.find(
    (partition) => partition.partitionId === partitionId,
  );
  const engaged =
    evaluation.holdEngaged === true &&
    concentratedPartition?.spreadActionable === true &&
    isConcentratedOperationLedgerPartition(evaluation, partitionId);
  if (!engaged) {
    return false;
  }
  if (normalizedMoveType === OperationType.REPLACE) {
    return sourceReplicaNodeId === concentratedPartition.hottestNodeId;
  }
  return (
    normalizedMoveType === OperationType.ADD &&
    concentratedPartition.feasibleTargetNodeIds.includes(targetNodeId) &&
    Number.isFinite(concentratedPartition.targetReplicaCount) &&
    concentratedPartition.totalVoters <=
      concentratedPartition.targetReplicaCount
  );
}

/**
 * Order the QUORUM_SPREAD cure moves of a concentrated partition first —
 * the hold itself sustains the readiness states that would otherwise
 * deprioritize its own cure. The caller establishes that the partition is
 * concentrated; this owns which moves are cure-typed.
 * @param {Array<Object>} moves
 * @param {string} concentratedPartitionId
 * @return {Array<Object>}
 */
function orderLedgerQuorumCureMovesFirst(moves, concentratedPartitionId) {
  const normalizedMoves = Array.isArray(moves) ? moves : [];
  const isCureMove = (move) =>
    LEDGER_QUORUM_SPREAD_CURE_MOVE_TYPES.has(
      normalizeOperationLedgerMoveType(move?.type),
    ) &&
    String(move?.partitionId || concentratedPartitionId) ===
      concentratedPartitionId;
  return [
    ...normalizedMoves.filter(isCureMove),
    ...normalizedMoves.filter((move) => !isCureMove(move)),
  ];
}

export {
  LEDGER_QUORUM_SPREAD_CURE_MOVE_TYPES,
  OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES,
  OPERATION_LEDGER_HOLD,
  OPERATION_LEDGER_HOLD_ENGAGEMENT_BY_MOVE_CLASS,
  OPERATION_LEDGER_HOLD_ENGAGEMENT_OUTCOME,
  OPERATION_LEDGER_HOLD_MOVE_CLASS,
  OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION,
  OPERATION_LEDGER_SELF_MOVE_HOLD_ACTION_BY_LIFECYCLE_EVIDENCE,
  OPERATION_LEDGER_SELF_MOVE_LIFECYCLE_EVIDENCE,
  classifyOperationLedgerHoldMove,
  classifyOperationLedgerSelfMoveLifecycleEvidence,
  isDisruptiveOperationLedgerSelfMove,
  isEngagedLedgerQuorumSpreadCureMove,
  isLedgerQuorumConcentratedPartition,
  orderLedgerQuorumCureMovesFirst,
  resolveEngagedLedgerQuorumSpreadHold,
  resolveOperationLedgerHoldEngagement,
  resolveOperationLedgerSelfMoveHoldAction,
  shouldLeaseRecentCompletedLedgerSelfMove,
};
