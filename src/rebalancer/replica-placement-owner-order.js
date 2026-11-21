// The one admission order of the replica placement owner (quest
// replica-placement-admission-owner, design section 2.6): a queue, not a
// timer. Classes go ledger, the other priority control-plane partitions,
// then - only while the formation latch answers FORMED - nodes-p1, the other
// system partitions (services, partitions, tables first) and user
// partitions. Within a class: deficit severity, then the fewest distinct
// declared hosts holding voters, then the fewest voters, then partition id.
import {resolveVoterTarget} from '../bootstrap/replication-target-authority.js';
import {classifyPlacementClass} from '../bootstrap/system-partition-classification.js';
import {
  PLACEMENT_CLASS,
  PLACEMENT_CLASS_ORDER,
  PLACEMENT_DEFICIT_SEVERITY,
  PLACEMENT_FORMATION_GATED_CLASSES,
  PLACEMENT_FORMATION_STATE,
  PLACEMENT_SYSTEM_FIRST_PARTITION_IDS,
  PLACEMENT_WAITING_REASON,
} from './replica-placement-owner-constants.js';

const AFTER_SYSTEM_FIRST = PLACEMENT_SYSTEM_FIRST_PARTITION_IDS.length;

/**
 * Why a class waits on the formation answer, or null when it may be
 * admitted: classes 3-5 only on FORMED (answerCommittedNodes().formation).
 * @param {string} placementClass - A PLACEMENT_CLASS.
 * @param {Object} formation - {state, latchEpoch}.
 * @return {string|null} FORMATION_NOT_LATCHED or null.
 */
function formationWaitingReasonOf(placementClass, formation) {
  return PLACEMENT_FORMATION_GATED_CLASSES.has(placementClass) &&
    formation.state !== PLACEMENT_FORMATION_STATE.FORMED ?
    PLACEMENT_WAITING_REASON.FORMATION_NOT_LATCHED : null;
}

function systemFirstRank(candidate) {
  if (candidate.placementClass !== PLACEMENT_CLASS.SYSTEM) return 0;
  const rank = PLACEMENT_SYSTEM_FIRST_PARTITION_IDS.indexOf(candidate.partitionId);
  return rank < 0 ? AFTER_SYSTEM_FIRST : rank;
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * The admission order of two candidates ({partitionId, placementClass,
 * deficitKind, distinctHostCount, voterCount}).
 * @param {Object} left - A candidate.
 * @param {Object} right - A candidate.
 * @return {number} Negative when left goes first.
 */
function comparePlacementCandidates(left, right) {
  return PLACEMENT_CLASS_ORDER.indexOf(left.placementClass) -
      PLACEMENT_CLASS_ORDER.indexOf(right.placementClass) ||
    PLACEMENT_DEFICIT_SEVERITY.indexOf(left.deficitKind) -
      PLACEMENT_DEFICIT_SEVERITY.indexOf(right.deficitKind) ||
    left.distinctHostCount - right.distinctHostCount ||
    left.voterCount - right.voterCount ||
    systemFirstRank(left) - systemFirstRank(right) ||
    compareText(left.partitionId, right.partitionId);
}

/**
 * The candidates in admission order (a new array).
 * @param {Array<Object>} candidates - Owner candidates.
 * @return {Array<Object>} Ordered.
 */
function orderPlacementCandidates(candidates) {
  return [...candidates].sort(comparePlacementCandidates);
}

export {
  classifyPlacementClass,
  formationWaitingReasonOf,
  orderPlacementCandidates,
  resolveVoterTarget,
};
