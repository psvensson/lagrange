import {
  buildMembershipLifecycleSummary,
  MEMBERSHIP_LIFECYCLE_STATE,
} from './membership-lifecycle-constants.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {PUBLICATION_RECOVERY_MACHINE_ACTION} from './publication-recovery-state-machine.js';
import {
  abandonMembershipPublication,
  buildTransitionHistoryEntry,
  hasPublicationTimedOut,
  normalizeNodeIdList,
  normalizePositiveInteger,
} from './membership-publication-row-helpers.js';
import {
  buildMembershipPublicationAcknowledgementDecision,
  buildServingMemberStatesByNodeId,
  closeAcknowledgedMetadataRefreshRow,
} from './membership-publication-planning-evidence.js';

function acknowledgeMembershipPublication(options = {}) {
  const publicationRow = options.publicationRow || {};
  const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
  const nodeId = String(options.nodeId || '').trim();
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const requiredAckNodeIds = normalizedPublication.requiredAckNodeIds;
  if (nodeId && !requiredAckNodeIds.includes(nodeId)) {
    return {
      ...publicationRow,
      acknowledged_node_ids: normalizedPublication.acknowledgedNodeIds,
      updated_at: nowMs,
      transition_history: [
        ...(Array.isArray(publicationRow.transition_history) ?
          publicationRow.transition_history :
          normalizedPublication.transitionHistory),
      ],
    };
  }
  if (hasPublicationTimedOut(publicationRow, options)) {
    return abandonMembershipPublication({
      publicationRow,
      nowMs,
      reasonCode: options.timeoutReasonCode,
    });
  }
  const acknowledgedNodeIds = normalizeNodeIdList([
    ...normalizedPublication.acknowledgedNodeIds,
    nodeId,
  ]);
  const acknowledgementDecision =
    buildMembershipPublicationAcknowledgementDecision({
      normalizedPublication,
      acknowledgedNodeIds,
    });
  if (
    acknowledgementDecision.action ===
    PUBLICATION_RECOVERY_MACHINE_ACTION.PRESERVE_STATUS
  ) {
    return {
      ...publicationRow,
      acknowledged_node_ids: acknowledgedNodeIds,
      updated_at: nowMs,
      transition_history: [
        ...(Array.isArray(publicationRow.transition_history) ?
          publicationRow.transition_history :
          normalizedPublication.transitionHistory),
      ],
    };
  }
  const allAcknowledged = acknowledgementDecision.allAcknowledged;
  const nextStatus = acknowledgementDecision.nextStatus;
  const transitionHistory = [
    ...(Array.isArray(publicationRow.transition_history) ?
      publicationRow.transition_history :
      normalizedPublication.transitionHistory),
    buildTransitionHistoryEntry({
      state: nextStatus,
      reasonCode: acknowledgementDecision.reasonCode,
      at: nowMs,
      metadata: {
        nodeId,
      },
    }),
  ];
  const nextLifecycleState = allAcknowledged ?
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE :
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING;
  const publishedNodeIdsForState =
    normalizedPublication.publishedActiveNodeIds.length > 0 ?
      normalizedPublication.publishedActiveNodeIds :
      normalizedPublication.requiredAckNodeIds;
  return {
    ...publicationRow,
    acknowledged_node_ids: acknowledgedNodeIds,
    status: nextStatus,
    updated_at: nowMs,
    published_at: allAcknowledged ? nowMs : publicationRow.published_at || null,
    closed_at: allAcknowledged ? nowMs : publicationRow.closed_at || null,
    membership_lifecycle_summary: buildMembershipLifecycleSummary({
      lifecycleState: nextLifecycleState,
      publishedActiveNodeIds: normalizedPublication.publishedActiveNodeIds,
      projectedServingNodeIds:
        normalizedPublication.membershipLifecycleSummary?.projectedServingNodeIds,
      locallyEligibleNodeIds:
        normalizedPublication.membershipLifecycleSummary?.locallyEligibleNodeIds,
      suspectedOrTransitioningNodeIds:
        normalizedPublication.membershipLifecycleSummary?.suspectedOrTransitioningNodeIds,
      memberStatesByNodeId: allAcknowledged ?
        buildServingMemberStatesByNodeId(
          normalizedPublication.membershipLifecycleSummary?.memberStatesByNodeId,
          publishedNodeIdsForState,
        ) :
        normalizedPublication.membershipLifecycleSummary?.memberStatesByNodeId,
      recoveryEpochByNodeId:
        normalizedPublication.membershipLifecycleSummary?.recoveryEpochByNodeId,
      membershipFreeze: normalizedPublication.membershipLifecycleSummary?.membershipFreeze,
      projectionDiagnostics:
        normalizedPublication.membershipLifecycleSummary?.projectionDiagnostics,
    }),
    transition_history: transitionHistory,
  };
}

export {
  acknowledgeMembershipPublication,
  closeAcknowledgedMetadataRefreshRow,
};
