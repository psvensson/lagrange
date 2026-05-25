import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  TYPEOF,
  NUM,
  PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE,
  normalizeNodeIdList,
  normalizeReplicaRowNodeIds,
  hasPriorityRecoverySpreadGap,
} = OPERATION_WORKFLOW_OWNER_SHARED;

/**
 * Build recovery projection node IDs.
 * @param {Object|null} planningSnapshot
 * @returns {string[]}
 */
function buildPriorityRemoveSafetyRecoveryProjectionNodeIds(planningSnapshot) {
  if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
    return [];
  }
  return normalizeNodeIdList([
    ...normalizeNodeIdList(planningSnapshot.recoveryActiveNodeIds),
    ...normalizeNodeIdList(planningSnapshot.projectedServingNodeIds),
    ...normalizeNodeIdList(planningSnapshot.locallyEligibleNodeIds),
  ]);
}

/**
 * Resolve safety membership snapshot for priority remove operations.
 * @param {Object|null} planningSnapshot
 * @param {Object|null} priorityRecoveryContext
 * @param {Object[]} projectedVoterReadyRows
 * @returns {Object}
 */
function resolvePriorityRemoveSafetyMembershipSnapshot(
  planningSnapshot,
  priorityRecoveryContext,
  projectedVoterReadyRows,
) {
  const publishedActiveNodeIds = normalizeNodeIdList(
    planningSnapshot?.publishedActiveNodeIds,
  );
  const recoveryProjectionNodeIds =
    buildPriorityRemoveSafetyRecoveryProjectionNodeIds(planningSnapshot);
  const projectedVoterReadyNodeIds = normalizeReplicaRowNodeIds(
    projectedVoterReadyRows,
  );
  const priorityPartitionSummary =
    priorityRecoveryContext?.priorityPartitionSummary || null;
  const spreadGapPending = hasPriorityRecoverySpreadGap(
    priorityPartitionSummary,
  );
  const publishedActiveNodeIdSet = new Set(publishedActiveNodeIds);
  const recoveryProjectionNodeIdSet = new Set(recoveryProjectionNodeIds);
  const missingPublishedNodeIds = projectedVoterReadyNodeIds.filter(
    (nodeId) => !publishedActiveNodeIdSet.has(nodeId),
  );
  const recoveryProjectionCoversProjectedVoters =
    missingPublishedNodeIds.length > NUM.ZERO &&
    recoveryProjectionNodeIds.length > NUM.ZERO &&
    missingPublishedNodeIds.every((nodeId) => {
      return recoveryProjectionNodeIdSet.has(nodeId);
    });
  const useRecoveryProjectionMembership =
    recoveryProjectionNodeIds.length > NUM.ZERO &&
    (spreadGapPending || recoveryProjectionCoversProjectedVoters);
  const membershipNodeIds = useRecoveryProjectionMembership ?
    recoveryProjectionNodeIds :
    publishedActiveNodeIds;
  const membershipSource = useRecoveryProjectionMembership ?
    PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE.RECOVERY_PROJECTION_MEMBERSHIP :
    PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE.PUBLISHED_MEMBERSHIP;
  const membershipNodeIdSet = useRecoveryProjectionMembership ?
    recoveryProjectionNodeIdSet :
    publishedActiveNodeIdSet;
  const missingMembershipNodeIds = projectedVoterReadyNodeIds.filter(
    (nodeId) => !membershipNodeIdSet.has(nodeId),
  );
  const publishedActiveNodeIdsPresent =
    planningSnapshot?.publishedActiveNodeIdsPresent === true ||
    publishedActiveNodeIds.length > NUM.ZERO;

  return Object.freeze({
    publishedActiveNodeIds: Object.freeze([...publishedActiveNodeIds]),
    recoveryProjectionNodeIds: Object.freeze([...recoveryProjectionNodeIds]),
    projectedVoterReadyNodeIds: Object.freeze([
      ...projectedVoterReadyNodeIds,
    ]),
    membershipNodeIds: Object.freeze([...membershipNodeIds]),
    membershipSource,
    missingMembershipNodeIds: Object.freeze([...missingMembershipNodeIds]),
    publishedActiveNodeIdsPresent,
    useRecoveryProjectionMembership,
  });
}

export {
  buildPriorityRemoveSafetyRecoveryProjectionNodeIds,
  resolvePriorityRemoveSafetyMembershipSnapshot,
};
