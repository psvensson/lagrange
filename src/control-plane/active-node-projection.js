import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  SERVICE_STATUS,
  STATE,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeControlPlanePublicationRow,
  normalizeServiceRow,
} from './system-row-normalizers.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from './control-plane-publication-merge.js';

const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const ACTIVE_NODE_HEARTBEAT_GRACE_MS = 60000;
const MEMBERSHIP_FREEZE_DEFAULT = Object.freeze({
  MIN_PUBLISHED_NODE_COUNT: 3,
  MIN_SUSPECTED_NODE_COUNT: 2,
  MIN_SUSPECTED_RATIO: 0.5,
});
const PROJECTION_READINESS_DECISION_MODE = Object.freeze({
  CLUSTER_MEMBER_HEALTHY_ONLY: 'cluster_member_healthy_only',
  CLUSTER_MEMBER_OR_RECOVERY_ELIGIBLE:
    'cluster_member_or_recovery_eligible',
});

function normalizeNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > NUM.ZERO),
  )].sort();
}

function readPublicationOrderingValue(row, keys = []) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return NUM.ZERO;
}

function isMembershipPublicationRow(row) {
  const publicationKind = String(row?.publicationKind || '').toLowerCase();
  return publicationKind.length === NUM.ZERO ||
    publicationKind === MEMBERSHIP_PUBLICATION_KIND;
}

function resolveLatestPublicationRow(options = {}) {
  const publicationRows = (Array.isArray(options.publicationRows) ?
    options.publicationRows :
    [])
    .filter((row) => row && typeof row === TYPEOF.OBJECT)
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => isMembershipPublicationRow(row));
  const explicitPublicationRow =
    options.latestPublicationRow &&
      typeof options.latestPublicationRow === TYPEOF.OBJECT ?
      normalizeControlPlanePublicationRow(options.latestPublicationRow) :
      null;
  if (explicitPublicationRow &&
    isMembershipPublicationRow(explicitPublicationRow) && (
    explicitPublicationRow.publicationId ||
    explicitPublicationRow.publicationEpoch > NUM.ZERO ||
    explicitPublicationRow.status
  )) {
    publicationRows.push(explicitPublicationRow);
  }
  if (publicationRows.length === NUM.ZERO) {
    return null;
  }

  publicationRows.sort((left, right) => {
    const publicationEpochDelta =
      readPublicationOrderingValue(right, ['publicationEpoch', 'publication_epoch']) -
      readPublicationOrderingValue(left, ['publicationEpoch', 'publication_epoch']);
    if (publicationEpochDelta !== NUM.ZERO) {
      return publicationEpochDelta;
    }
    const publishedAtDelta =
      readPublicationOrderingValue(right, ['publishedAt', 'published_at']) -
      readPublicationOrderingValue(left, ['publishedAt', 'published_at']);
    if (publishedAtDelta !== NUM.ZERO) {
      return publishedAtDelta;
    }
    return readPublicationOrderingValue(right, ['updatedAt', 'updated_at']) -
      readPublicationOrderingValue(left, ['updatedAt', 'updated_at']);
  });

  return publicationRows[0] || null;
}

function resolveLatestPublishedPublicationRow(options = {}) {
  const publicationRows = (Array.isArray(options.publicationRows) ?
    options.publicationRows :
    [])
    .filter((row) => row && typeof row === TYPEOF.OBJECT)
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => isMembershipPublicationRow(row));
  const explicitPublicationRow =
    options.latestPublicationRow &&
      typeof options.latestPublicationRow === TYPEOF.OBJECT ?
      normalizeControlPlanePublicationRow(options.latestPublicationRow) :
      null;
  if (explicitPublicationRow &&
    isMembershipPublicationRow(explicitPublicationRow) && (
    explicitPublicationRow.publicationId ||
    explicitPublicationRow.publicationEpoch > NUM.ZERO ||
    explicitPublicationRow.status
  )) {
    publicationRows.push(explicitPublicationRow);
  }

  return resolveLatestPublicationRow({
    publicationRows: publicationRows.filter((row) =>
      row?.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    ),
  });
}

function resolvePublishedActiveNodeIds(options = {}) {
  const latestPublicationRow = resolveLatestPublicationRow(options);
  const publishedPublicationRow =
    latestPublicationRow?.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ?
      latestPublicationRow :
      resolveLatestPublishedPublicationRow(options);
  if (!publishedPublicationRow) {
    return options.requirePublishedMembership === true ?
      Object.freeze([]) :
      null;
  }
  const publishedActiveNodeIds = Array.isArray(
    publishedPublicationRow.publishedActiveNodeIds,
  ) ?
    publishedPublicationRow.publishedActiveNodeIds :
    [];
  if (publishedActiveNodeIds.length === NUM.ZERO) {
    return Object.freeze([]);
  }
  return Object.freeze([...new Set(
    publishedActiveNodeIds.filter((nodeId) =>
      typeof nodeId === TYPEOF.STRING &&
      nodeId.length > NUM.ZERO,
    ),
  )].sort());
}

function resolveReadyLeaseExpiresAtMs(row) {
  const readyLeaseExpiresAt = Number(
    row?.[COLUMN.READY_LEASE_EXPIRES_AT] ??
      row?.ready_lease_expires_at ??
      row?.readyLeaseExpiresAt,
  );
  return Number.isFinite(readyLeaseExpiresAt) ?
    readyLeaseExpiresAt :
    null;
}

function resolveLastHeartbeatMs(row) {
  const lastHeartbeat = Number(
    row?.last_heartbeat ??
      row?.lastHeartbeat,
  );
  return Number.isFinite(lastHeartbeat) ?
    lastHeartbeat :
    null;
}

function hasFreshReadyLeaseOrHeartbeat(nodeRow, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ?
    options.nowMs :
    Date.now();
  const readyLeaseExpiresAtMs = resolveReadyLeaseExpiresAtMs(nodeRow);
  if (Number.isFinite(readyLeaseExpiresAtMs) &&
      readyLeaseExpiresAtMs > nowMs) {
    return true;
  }
  const lastHeartbeatMs = resolveLastHeartbeatMs(nodeRow);
  return Number.isFinite(lastHeartbeatMs) &&
    lastHeartbeatMs > nowMs - ACTIVE_NODE_HEARTBEAT_GRACE_MS;
}

function buildReadinessByNodeId(options = {}) {
  if (options.readinessByNodeId &&
      typeof options.readinessByNodeId === TYPEOF.OBJECT) {
    return options.readinessByNodeId;
  }

  const readinessEntries = Array.isArray(options.readinessEntries) ?
    options.readinessEntries :
    [];
  const readinessByNodeId = {};
  for (const entry of readinessEntries) {
    const normalizedNode = normalizeNodeRow(entry);
    if (!normalizedNode.nodeId) {
      continue;
    }
    readinessByNodeId[normalizedNode.nodeId] = entry;
  }
  return readinessByNodeId;
}

function isCanonicalWebSocketEndpointRow(endpointRow) {
  const normalizedEndpoint = normalizeNodeEndpointRow(endpointRow);
  return normalizedEndpoint.transportType ===
    String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() &&
    normalizedEndpoint.status ===
      String(ENDPOINT_STATUS.ACTIVE).toLowerCase() &&
    typeof normalizedEndpoint.address === TYPEOF.STRING &&
    normalizedEndpoint.address.length > NUM.ZERO;
}

function hasCanonicalWebSocketEndpoints(nodeEndpointRows = []) {
  return (Array.isArray(nodeEndpointRows) ? nodeEndpointRows : [])
    .some((row) => isCanonicalWebSocketEndpointRow(row));
}

function hasCanonicalWebSocketEndpoint(nodeId, nodeEndpointRows = []) {
  return (Array.isArray(nodeEndpointRows) ? nodeEndpointRows : [])
    .some((row) => {
      const normalizedEndpoint = normalizeNodeEndpointRow(row);
      return normalizedEndpoint.nodeId === nodeId &&
        isCanonicalWebSocketEndpointRow(row);
    });
}

function hasCanonicalActiveService(nodeId, serviceRows = []) {
  return (Array.isArray(serviceRows) ? serviceRows : [])
    .some((row) => {
      const normalizedService = normalizeServiceRow(row);
      return normalizedService.nodeId === nodeId &&
        normalizedService.status ===
          String(SERVICE_STATUS.ACTIVE).toLowerCase() &&
        typeof normalizedService.serviceId === TYPEOF.STRING &&
        normalizedService.serviceId.length > NUM.ZERO;
    });
}

function evaluateProjectionReadinessDimensions(
  readinessDimensions = null,
  options = {},
) {
  if (!readinessDimensions ||
      typeof readinessDimensions !== TYPEOF.OBJECT ||
      Object.keys(readinessDimensions).length === NUM.ZERO) {
    return {
      hasReadinessEvidence: false,
      projectionEligible: null,
      projectedByRecoveryEligibility: false,
      clusterMemberHealthyMissing: false,
    };
  }
  if (readinessDimensions[
    CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
  ] === true) {
    return {
      hasReadinessEvidence: true,
      projectionEligible: true,
      projectedByRecoveryEligibility: false,
      clusterMemberHealthyMissing: false,
    };
  }
  const controlPlaneRecoveryEligible = readinessDimensions[
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
  ] === true;
  const controlPlaneWritable = readinessDimensions[
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
  ] !== false;
  const projectedByRecoveryEligibility =
    options.allowControlPlaneRecoveryEligibleProjection === true &&
    controlPlaneRecoveryEligible &&
    controlPlaneWritable;
  return {
    hasReadinessEvidence: true,
    projectionEligible: projectedByRecoveryEligibility,
    projectedByRecoveryEligibility,
    clusterMemberHealthyMissing: true,
  };
}

function resolveProjectionReadinessDecisionMode(options = {}) {
  return options.allowControlPlaneRecoveryEligibleProjection === true ?
    PROJECTION_READINESS_DECISION_MODE.CLUSTER_MEMBER_OR_RECOVERY_ELIGIBLE :
    PROJECTION_READINESS_DECISION_MODE.CLUSTER_MEMBER_HEALTHY_ONLY;
}

function resolveProjectionReadinessDecisionDimensions(options = {}) {
  if (options.allowControlPlaneRecoveryEligibleProjection === true) {
    return Object.freeze([
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
    ]);
  }
  return Object.freeze([
    CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
  ]);
}

function isCanonicallyActiveNode(nodeRow, options = {}) {
  const normalizedNode = normalizeNodeRow(nodeRow);
  if (!normalizedNode.nodeId) {
    return false;
  }
  const nowMs = Number.isFinite(options.nowMs) ?
    options.nowMs :
    Date.now();
  const hasReadyConnection = normalizedNode.connectionState ===
    String(STATE.READY).toLowerCase();
  const hasFreshLiveness = hasReadyConnection &&
    hasFreshReadyLeaseOrHeartbeat(nodeRow, {nowMs});
  if (normalizedNode.status !==
      String(SERVICE_STATUS.ACTIVE).toLowerCase() &&
      !hasFreshLiveness) {
    return false;
  }

  const readinessByNodeId = buildReadinessByNodeId(options);
  const readinessEntry = readinessByNodeId?.[normalizedNode.nodeId] || null;
  const readinessDimensions = readinessEntry?.dimensions &&
    typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
    readinessEntry.dimensions :
    null;
  const readinessProjection = evaluateProjectionReadinessDimensions(
    readinessDimensions,
    options,
  );
  if (readinessProjection.hasReadinessEvidence) {
    if (readinessProjection.projectionEligible !== true) {
      return false;
    }
  } else {
    if (!hasReadyConnection || !hasFreshLiveness) {
      return false;
    }
  }

  const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ?
    options.nodeEndpointRows :
    [];
  if (hasCanonicalWebSocketEndpoints(nodeEndpointRows) &&
      !hasCanonicalWebSocketEndpoint(
        normalizedNode.nodeId,
        nodeEndpointRows,
      ) &&
      !hasCanonicalActiveService(
        normalizedNode.nodeId,
        options.serviceRows,
      )) {
    return false;
  }

  return true;
}

function resolveProjectedActiveNodeSelection(options = {}) {
  const nodeRows = Array.isArray(options.nodeRows) ? options.nodeRows : [];
  const readinessByNodeId = buildReadinessByNodeId(options);
  const nodeRowsById = new Map();
  const recoveryEligibleIncludedNodeIds = new Set();
  const readinessExcludedNodeIds = new Set();
  const clusterMemberUnhealthyExcludedNodeIds = new Set();
  for (const nodeRow of nodeRows) {
    const normalizedNode = normalizeNodeRow(nodeRow);
    if (!normalizedNode.nodeId) {
      continue;
    }
    nodeRowsById.set(normalizedNode.nodeId, nodeRow);
  }

  const candidateNodeIds = new Set([
    ...nodeRowsById.keys(),
    ...Object.keys(readinessByNodeId || {}),
  ]);
  const activeNodeIds = [];
  const requireWebSocketEndpoint =
    hasCanonicalWebSocketEndpoints(options.nodeEndpointRows);

  for (const nodeId of candidateNodeIds) {
    const nodeRow = nodeRowsById.get(nodeId) || null;
    const readinessEntry = readinessByNodeId?.[nodeId] || null;
    const readinessDimensions = readinessEntry?.dimensions &&
      typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
      readinessEntry.dimensions :
      null;
    const readinessProjection = evaluateProjectionReadinessDimensions(
      readinessDimensions,
      options,
    );
    if (nodeRow) {
      if (readinessProjection.hasReadinessEvidence &&
          readinessProjection.projectionEligible !== true) {
        readinessExcludedNodeIds.add(nodeId);
        if (readinessProjection.clusterMemberHealthyMissing) {
          clusterMemberUnhealthyExcludedNodeIds.add(nodeId);
        }
        continue;
      }
      const nodeEligible = isCanonicallyActiveNode(nodeRow, {
        ...options,
        readinessByNodeId,
      });
      if (nodeEligible) {
        activeNodeIds.push(nodeId);
        if (readinessProjection.projectedByRecoveryEligibility) {
          recoveryEligibleIncludedNodeIds.add(nodeId);
        }
      }
      continue;
    }

    if (!readinessProjection.hasReadinessEvidence ||
        readinessProjection.projectionEligible !== true) {
      if (readinessProjection.hasReadinessEvidence) {
        readinessExcludedNodeIds.add(nodeId);
        if (readinessProjection.clusterMemberHealthyMissing) {
          clusterMemberUnhealthyExcludedNodeIds.add(nodeId);
        }
      }
      continue;
    }
    if (requireWebSocketEndpoint &&
        !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows)) {
      continue;
    }
    if (!hasCanonicalActiveService(nodeId, options.serviceRows) &&
        !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows)) {
      continue;
    }
    activeNodeIds.push(nodeId);
    if (readinessProjection.projectedByRecoveryEligibility) {
      recoveryEligibleIncludedNodeIds.add(nodeId);
    }
  }

  const projectedActiveNodeIds = [...new Set(
    activeNodeIds.filter((nodeId) =>
      typeof nodeId === TYPEOF.STRING &&
      nodeId.length > NUM.ZERO,
    ),
  )].sort();
  return Object.freeze({
    projectedActiveNodeIds: Object.freeze([...projectedActiveNodeIds]),
    projectionReadinessDecisionMode:
      resolveProjectionReadinessDecisionMode(options),
    projectionReadinessDecisionDimensions:
      resolveProjectionReadinessDecisionDimensions(options),
    recoveryEligibleProjectionEnabled:
      options.allowControlPlaneRecoveryEligibleProjection === true,
    recoveryEligibleIncludedNodeIds:
      Object.freeze([...recoveryEligibleIncludedNodeIds].sort()),
    readinessExcludedNodeIds:
      Object.freeze([...readinessExcludedNodeIds].sort()),
    clusterMemberUnhealthyExcludedNodeIds:
      Object.freeze([...clusterMemberUnhealthyExcludedNodeIds].sort()),
  });
}

function resolveProjectedActiveNodeIds(options = {}) {
  return resolveProjectedActiveNodeSelection(options).projectedActiveNodeIds;
}

function resolveActiveNodeViews(options = {}) {
  const publishedActiveNodeIds = resolvePublishedActiveNodeIds({
    ...options,
    requirePublishedMembership: false,
  });
  const projectedActiveNodeSelection = resolveProjectedActiveNodeSelection(
    options,
  );
  const projectedActiveNodeIds =
    projectedActiveNodeSelection.projectedActiveNodeIds;
  const hasPublishedMembership = Array.isArray(publishedActiveNodeIds);
  const authoritativeActiveNodeIds = hasPublishedMembership ?
    normalizeNodeIdList(publishedActiveNodeIds) :
    [];
  const projectedServingNodeIds = normalizeNodeIdList(projectedActiveNodeIds);
  const locallyEligibleNodeIds = [...projectedServingNodeIds];
  const missingProjectedNodeIds = hasPublishedMembership ?
    authoritativeActiveNodeIds.filter((nodeId) =>
      !projectedServingNodeIds.includes(nodeId),
    ) :
    [];
  const unconfirmedProjectedNodeIds = hasPublishedMembership ?
    projectedServingNodeIds.filter((nodeId) =>
      !authoritativeActiveNodeIds.includes(nodeId),
    ) :
    [];
  const minimumPublishedNodeCount = Number.isFinite(
    options.membershipFreezeMinPublishedNodeCount,
  ) ?
    Math.max(1, Math.floor(options.membershipFreezeMinPublishedNodeCount)) :
    MEMBERSHIP_FREEZE_DEFAULT.MIN_PUBLISHED_NODE_COUNT;
  const minimumSuspectedNodeCount = Number.isFinite(
    options.membershipFreezeMinSuspectedNodeCount,
  ) ?
    Math.max(1, Math.floor(options.membershipFreezeMinSuspectedNodeCount)) :
    MEMBERSHIP_FREEZE_DEFAULT.MIN_SUSPECTED_NODE_COUNT;
  const minimumSuspectedRatio = Number.isFinite(
    options.membershipFreezeMinSuspectedRatio,
  ) ?
    Math.max(0, options.membershipFreezeMinSuspectedRatio) :
    MEMBERSHIP_FREEZE_DEFAULT.MIN_SUSPECTED_RATIO;
  const membershipFreezeActive = hasPublishedMembership &&
    authoritativeActiveNodeIds.length >= minimumPublishedNodeCount &&
    missingProjectedNodeIds.length >= minimumSuspectedNodeCount &&
    (missingProjectedNodeIds.length / authoritativeActiveNodeIds.length) >=
      minimumSuspectedRatio;
  const suspectedOrTransitioningNodeIds = hasPublishedMembership ?
    normalizeNodeIdList([
      ...missingProjectedNodeIds,
      ...unconfirmedProjectedNodeIds,
    ]) :
    [];
  const membershipFreeze = Object.freeze({
    active: membershipFreezeActive,
    reasonCode: membershipFreezeActive ? 'broad_suspicion' : null,
    retainedPublishedNodeIds: Object.freeze([...authoritativeActiveNodeIds]),
    missingProjectedNodeIds: Object.freeze([...missingProjectedNodeIds]),
    unconfirmedProjectedNodeIds: Object.freeze([...unconfirmedProjectedNodeIds]),
  });
  const effectiveActiveNodeIds = hasPublishedMembership ?
    [...authoritativeActiveNodeIds] :
    [...projectedServingNodeIds];

  return Object.freeze({
    authoritativeSource: hasPublishedMembership ?
      'published_membership' :
      'unpublished',
    authoritativeActiveNodeIds: Object.freeze([...authoritativeActiveNodeIds]),
    projectedServingNodeIds: Object.freeze([...projectedServingNodeIds]),
    locallyEligibleNodeIds: Object.freeze([...locallyEligibleNodeIds]),
    suspectedOrTransitioningNodeIds: Object.freeze([
      ...suspectedOrTransitioningNodeIds,
    ]),
    membershipFreeze,
    effectiveSource: hasPublishedMembership ?
      'published_membership' :
      'projected',
    effectiveActiveNodeIds: Object.freeze(effectiveActiveNodeIds),
    projectedActiveNodeIds: Object.freeze([...projectedActiveNodeIds]),
    publishedActiveNodeIds: hasPublishedMembership ?
      Object.freeze([...publishedActiveNodeIds]) :
      null,
    projectionDiagnostics: Object.freeze({
      readinessDecisionMode:
        projectedActiveNodeSelection.projectionReadinessDecisionMode,
      readinessDecisionDimensions: Object.freeze([
        ...projectedActiveNodeSelection.projectionReadinessDecisionDimensions,
      ]),
      recoveryEligibleProjectionEnabled:
        projectedActiveNodeSelection.recoveryEligibleProjectionEnabled === true,
      recoveryEligibleIncludedNodeIds: Object.freeze([
        ...projectedActiveNodeSelection.recoveryEligibleIncludedNodeIds,
      ]),
      readinessExcludedNodeIds: Object.freeze([
        ...projectedActiveNodeSelection.readinessExcludedNodeIds,
      ]),
      clusterMemberUnhealthyExcludedNodeIds: Object.freeze([
        ...projectedActiveNodeSelection
          .clusterMemberUnhealthyExcludedNodeIds,
      ]),
    }),
    publishedMembershipAvailable: hasPublishedMembership,
  });
}

function resolveCanonicalActiveNodeIds(options = {}) {
  const activeNodeViews = resolveActiveNodeViews(options);
  if (options.requirePublishedMembership === true &&
      activeNodeViews.publishedActiveNodeIds === null) {
    return [];
  }
  return [...activeNodeViews.effectiveActiveNodeIds];
}

export {
  resolveActiveNodeViews,
  buildReadinessByNodeId,
  hasCanonicalActiveService,
  hasCanonicalWebSocketEndpoint,
  hasCanonicalWebSocketEndpoints,
  isCanonicalWebSocketEndpointRow,
  isCanonicallyActiveNode,
  resolveLatestPublicationRow,
  resolveLatestPublishedPublicationRow,
  resolveProjectedActiveNodeIds,
  resolvePublishedActiveNodeIds,
  resolveCanonicalActiveNodeIds,
};
