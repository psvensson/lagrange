import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {PUBLICATION_RECOVERY_MACHINE_ACTION} from './publication-recovery-state-machine.js';
import {
  abandonMembershipPublication,
  buildTransitionHistoryEntry,
  hasPublicationTimedOut,
  normalizeNodeIdList,
  resolveNowMs,
} from './membership-publication-row-helpers.js';
import {
  buildMembershipPublicationAcknowledgementDecision,
  materializeAcknowledgedPublication,
} from './membership-publication-planning-evidence.js';

function acknowledgeMembershipPublication(options = {}) {
  const publicationRow = options.publicationRow || {};
  const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
  const nodeId = String(options.nodeId || '').trim();
  const nowMs = resolveNowMs(options.nowMs);
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
  const closingOrProgress = buildTransitionHistoryEntry({
    state: acknowledgementDecision.nextStatus,
    reasonCode: acknowledgementDecision.reasonCode,
    at: nowMs,
    metadata: {nodeId},
  });
  const acknowledgedRow = {
    ...publicationRow,
    acknowledged_node_ids: acknowledgedNodeIds,
    status: acknowledgementDecision.nextStatus,
    updated_at: nowMs,
  };
  if (acknowledgementDecision.allAcknowledged) {
    return materializeAcknowledgedPublication(acknowledgedRow, nowMs, closingOrProgress);
  }
  return {
    ...acknowledgedRow,
    transition_history: [...normalizedPublication.transitionHistory, closingOrProgress],
  };
}

export {
  acknowledgeMembershipPublication,
};
