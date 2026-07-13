import {
  isPriorityControlPlanePartition,
  resolvePartitionTableId,
} from '../bootstrap/system-partition-classification.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {TIME_MS} from '../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';

const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE =
  'not_control_plane_recovery_eligible';
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY =
  'recovery_eligible_not_repair_eligible';
const PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS = 'readiness_unknown';
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP = 'priority_spread_gap';
const PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING =
  'priority_partition_missing';
const PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED =
  'recovery_eligible_projection_included';
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED =
  'readiness_projection_excluded';
const PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY =
  'cluster_member_unhealthy';
const PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE = Object.freeze({
  WORKFLOW_ADMISSION: 'workflow_admission',
  PUBLICATION_MEMBERSHIP: 'publication_membership',
  PUBLICATION_RECOVERY_PROJECTION: 'publication_recovery_projection',
  PRIORITY_SUMMARY_READY_ELIGIBLE: 'priority_summary_ready_eligible',
  UNKNOWN: 'unknown',
});
const PRIORITY_RECOVERY_ADMISSION_SOURCE = Object.freeze({
  PUBLICATION_SUMMARY: 'publication_summary',
  STALE_ACTIVE_GRACE: 'stale_active_grace',
  INACTIVE_DEFAULT: 'inactive_default',
});
const PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS = Object.freeze({
  NON_PRIORITY: 'non_priority',
  ORDINARY_PRIORITY: 'ordinary_priority',
  EMERGENCY_PRIORITY: 'emergency_priority',
});
const PRIORITY_RECOVERY_ADMISSION_DECISION_REASON = Object.freeze({
  ADMITTED: 'admitted',
  NOT_PRIORITY_PARTITION: 'not_priority_partition',
  PRIORITY_LANE_DISABLED: 'priority_lane_disabled',
  ORDINARY_PRIORITY_LANE_EXHAUSTED: 'ordinary_priority_lane_exhausted',
  EMERGENCY_PRIORITY_LANE_EXHAUSTED: 'emergency_priority_lane_exhausted',
});
const PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS = new Set([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
]);
const DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS = TIME_MS.SECOND * 15;

function isPriorityRecoveryEmergencyPartition(partitionId) {
  const tableId = resolvePartitionTableId({partitionId});
  return tableId !== null &&
    PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS.has(tableId);
}

/**
 * Classify a partition for priority-recovery admission (quest
 * cure-typing-single-owner-table: the cure-typing owner family's lane
 * classifier — re-exported by src/rebalancer/replica-placement-cure-policy.js
 * for rebalancer consumers; it lives here, the lane vocabulary home, because
 * the admission-plan owner sits in this module's import tree). The
 * classification ORDER is the owned semantic: not priority (or no partition
 * id) -> NON_PRIORITY, emergency before ordinary — an emergency partition is
 * never counted or gated in the ordinary lane. Predicates default to the
 * global classifiers; callers with scoped views (cache-backed planner rows,
 * tracked recovery membership) inject their own.
 * @param {*} partitionId
 * @param {Object} [predicates]
 * @param {function(string): boolean} [predicates.isPriorityPartition]
 * @param {function(string): boolean} [predicates.isEmergencyPriorityPartition]
 * @return {string} One of PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.
 */
function classifyPriorityRecoveryAdmissionPartitionClass(
  partitionId,
  predicates = {},
) {
  const isPriorityPartition =
    typeof predicates.isPriorityPartition === LOCAL_STR_FUNCTION ?
      predicates.isPriorityPartition :
      (candidatePartitionId) =>
        isPriorityControlPlanePartition({partitionId: candidatePartitionId});
  const isEmergencyPriorityPartition =
    typeof predicates.isEmergencyPriorityPartition === LOCAL_STR_FUNCTION ?
      predicates.isEmergencyPriorityPartition :
      isPriorityRecoveryEmergencyPartition;
  const normalizedPartitionId = String(partitionId || '').trim();
  if (
    normalizedPartitionId.length === 0 ||
    isPriorityPartition(normalizedPartitionId) !== true
  ) {
    return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.NON_PRIORITY;
  }
  if (isEmergencyPriorityPartition(normalizedPartitionId) === true) {
    return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.EMERGENCY_PRIORITY;
  }
  return PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY;
}

export {
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  PRIORITY_RECOVERY_ADMISSION_DECISION_REASON,
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  PRIORITY_RECOVERY_ADMISSION_SOURCE,
  PRIORITY_RECOVERY_EMERGENCY_PARTITION_TABLE_IDS,
  PRIORITY_RECOVERY_ELIGIBILITY_EVIDENCE,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NOT_RECOVERY_ELIGIBLE,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_NO_READINESS,
  PRIORITY_RECOVERY_LEARNER_HOLD_REASON_RECOVERY_ONLY,
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_PARTITION_MISSING,
  PRIORITY_RECOVERY_PLANNER_REASON_PRIORITY_SPREAD_GAP,
  PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_CLUSTER_MEMBER_UNHEALTHY,
  PRIORITY_RECOVERY_PUBLICATION_EXCLUSION_REASON_READINESS_PROJECTION_EXCLUDED,
  PRIORITY_RECOVERY_PUBLICATION_INCLUSION_REASON_RECOVERY_ELIGIBLE_PROJECTION_INCLUDED,
  classifyPriorityRecoveryAdmissionPartitionClass,
  isPriorityRecoveryEmergencyPartition,
};
