import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';

const {
  PRIORITY_REMOVE_SAFETY_MEMBERSHIP_SOURCE,
  normalizeNodeIdList,
  normalizeReplicaRowNodeIds,
  hasPriorityRecoverySpreadGap,
} = OPERATION_WORKFLOW_OWNER_SHARED;

/**
 * Check whether a node is ready in the committed node floor when provided.
 * @param {Object|null} committedNodeFloor
 * @param {string} nodeId
 * @returns {boolean}
 */
function isNodeReadyInCommittedFloor(committedNodeFloor, nodeId) {
  if (!committedNodeFloor || typeof committedNodeFloor !== 'object') {
    return true;
  }
  const semanticsMap =
    committedNodeFloor.nodeSemanticsById instanceof Map ?
      committedNodeFloor.nodeSemanticsById :
      committedNodeFloor.readyByNodeId instanceof Map ?
        committedNodeFloor.readyByNodeId :
        null;
  if (!semanticsMap) {
    return true;
  }
  return semanticsMap.get(nodeId)?.readyNow !== false;
}

/**
 * Build recovery projection node IDs.
 * @param {Object|null} planningSnapshot
 * @param {Object} [options]
 * @returns {string[]}
 */
function buildPriorityRemoveSafetyRecoveryProjectionNodeIds(
  planningSnapshot,
  options = {},
) {
  if (!planningSnapshot || typeof planningSnapshot !== 'object') {
    return [];
  }
  const candidateNodeIds = normalizeNodeIdList([
    ...normalizeNodeIdList(planningSnapshot.recoveryActiveNodeIds),
    ...normalizeNodeIdList(planningSnapshot.projectedServingNodeIds),
    ...normalizeNodeIdList(planningSnapshot.locallyEligibleNodeIds),
  ]);
  const committedNodeFloor = options?.committedNodeFloor || null;
  const activeVoterNodeIdSet =
    options?.activeVoterNodeIdSet instanceof Set ?
      options.activeVoterNodeIdSet :
      null;
  return candidateNodeIds.filter(
    (nodeId) =>
      isNodeReadyInCommittedFloor(committedNodeFloor, nodeId) &&
      (!activeVoterNodeIdSet || activeVoterNodeIdSet.has(nodeId)),
  );
}

/**
 * Determine whether recovery projection membership should be used.
 * @param {string[]} recoveryProjectionNodeIds
 * @param {Set<string>} recoveryProjectionNodeIdSet
 * @param {string[]} missingPublishedNodeIds
 * @param {Object|null} priorityRecoveryContext
 * @returns {boolean}
 */
function shouldUseRecoveryProjectionMembership(
  recoveryProjectionNodeIds,
  recoveryProjectionNodeIdSet,
  missingPublishedNodeIds,
  priorityRecoveryContext,
) {
  if (recoveryProjectionNodeIds.length === 0) {
    return false;
  }
  const priorityPartitionSummary =
    priorityRecoveryContext?.priorityPartitionSummary || null;
  if (hasPriorityRecoverySpreadGap(priorityPartitionSummary)) {
    return true;
  }
  return (
    missingPublishedNodeIds.length > 0 &&
    missingPublishedNodeIds.every((nodeId) =>
      recoveryProjectionNodeIdSet.has(nodeId),
    )
  );
}

/**
 * Resolve safety membership snapshot for priority remove operations.
 * @param {Object|null} planningSnapshot
 * @param {Object|null} priorityRecoveryContext
 * @param {Object[]} projectedVoterReadyRows
 * @param {Object} [options]
 * @returns {Object}
 */
function resolvePriorityRemoveSafetyMembershipSnapshot(
  planningSnapshot,
  priorityRecoveryContext,
  projectedVoterReadyRows,
  options = {},
) {
  const publishedActiveNodeIds = normalizeNodeIdList(
    planningSnapshot?.publishedActiveNodeIds,
  );
  const recoveryProjectionNodeIds =
    buildPriorityRemoveSafetyRecoveryProjectionNodeIds(
      planningSnapshot,
      options,
    );
  const projectedVoterReadyNodeIds = normalizeReplicaRowNodeIds(
    projectedVoterReadyRows,
  );
  const publishedActiveNodeIdSet = new Set(publishedActiveNodeIds);
  const recoveryProjectionNodeIdSet = new Set(recoveryProjectionNodeIds);
  const missingPublishedNodeIds = projectedVoterReadyNodeIds.filter(
    (nodeId) => !publishedActiveNodeIdSet.has(nodeId),
  );
  const useRecoveryProjectionMembership =
    shouldUseRecoveryProjectionMembership(
      recoveryProjectionNodeIds,
      recoveryProjectionNodeIdSet,
      missingPublishedNodeIds,
      priorityRecoveryContext,
    );
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
    publishedActiveNodeIds.length > 0;

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
