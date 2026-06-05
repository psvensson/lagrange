import {NUM, TYPEOF} from '../constants/index.js';
import {
  JOINING_CLEANUP_STEP,
} from './node-joining-constants.js';

const JOIN_CLEANUP_MEMBERSHIP_PUBLICATION_CONTEXT = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  CLEANUP_STEP: JOINING_CLEANUP_STEP.QUERYING_STATE,
  EXCLUDED_NODE_IDS: 'excludedNodeIds',
  LATEST_PUBLICATION_ROW: 'latestPublicationRow',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
});

function resolveJoinCleanupRegisteredNodeId(cleanupContext, nodeId) {
  if (
    typeof cleanupContext?.registeredNodeId === TYPEOF.STRING &&
    cleanupContext.registeredNodeId.length > NUM.ZERO
  ) {
    return cleanupContext.registeredNodeId;
  }
  return typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO ?
    nodeId :
    null;
}

function normalizeCleanupNodeIdList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((nodeId) =>
      typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
    ))].sort();
}

function resolvePublicationRowNodeIds(publicationRow, fieldName) {
  if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
    return [];
  }
  const snakeFieldName = fieldName.replace(
    /[A-Z]/g,
    (match) => `_${match.toLowerCase()}`,
  );
  return normalizeCleanupNodeIdList(
    Array.isArray(publicationRow[fieldName]) ?
      publicationRow[fieldName] :
      publicationRow[snakeFieldName],
  );
}

function resolveLatestMembershipPublicationRow(membershipPublicationService) {
  if (
    typeof membershipPublicationService?.getLatestPublicationRowSync ===
      TYPEOF.FUNCTION
  ) {
    return membershipPublicationService.getLatestPublicationRowSync();
  }
  if (
    typeof membershipPublicationService?.getLatestClusterPublicationSync ===
      TYPEOF.FUNCTION
  ) {
    return membershipPublicationService.getLatestClusterPublicationSync();
  }
  return null;
}

function buildFailedJoinMembershipPublicationContext(options = {}) {
  const latestPublicationRow =
    resolveLatestMembershipPublicationRow(options.membershipPublicationService);
  const registeredNodeId = options.registeredNodeId;
  const publishedActiveNodeIds =
    resolvePublicationRowNodeIds(
      latestPublicationRow,
      JOIN_CLEANUP_MEMBERSHIP_PUBLICATION_CONTEXT
        .PUBLISHED_ACTIVE_NODE_IDS,
    ).filter((nodeId) => nodeId !== registeredNodeId);
  const acknowledgedNodeIds =
    resolvePublicationRowNodeIds(
      latestPublicationRow,
      JOIN_CLEANUP_MEMBERSHIP_PUBLICATION_CONTEXT
        .ACKNOWLEDGED_NODE_IDS,
    ).filter((nodeId) => nodeId !== registeredNodeId);
  const targetContext = {
    nodeId: options.nodeId,
    registeredNodeId,
    cleanupStep:
      JOIN_CLEANUP_MEMBERSHIP_PUBLICATION_CONTEXT.CLEANUP_STEP,
    [JOIN_CLEANUP_MEMBERSHIP_PUBLICATION_CONTEXT.EXCLUDED_NODE_IDS]:
      [registeredNodeId],
  };
  if (publishedActiveNodeIds.length === NUM.ZERO) {
    return targetContext;
  }
  return {
    ...targetContext,
    [JOIN_CLEANUP_MEMBERSHIP_PUBLICATION_CONTEXT.LATEST_PUBLICATION_ROW]:
      latestPublicationRow,
    [JOIN_CLEANUP_MEMBERSHIP_PUBLICATION_CONTEXT.PUBLISHED_ACTIVE_NODE_IDS]:
      publishedActiveNodeIds,
    [JOIN_CLEANUP_MEMBERSHIP_PUBLICATION_CONTEXT.REQUIRED_ACK_NODE_IDS]:
      publishedActiveNodeIds,
    [JOIN_CLEANUP_MEMBERSHIP_PUBLICATION_CONTEXT.ACKNOWLEDGED_NODE_IDS]:
      acknowledgedNodeIds.length > NUM.ZERO ?
        acknowledgedNodeIds :
        publishedActiveNodeIds,
  };
}

export {
  buildFailedJoinMembershipPublicationContext,
  resolveJoinCleanupRegisteredNodeId,
};
