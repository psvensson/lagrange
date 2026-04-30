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
  RUNTIME_AUTHORITY_STATE,
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
import {
  NODE_PARTICIPATION_ADMISSION_STATE,
  normalizeNodeParticipationAdmissionState,
} from './membership-lifecycle-constants.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_UPDATEDAT = 'updatedAt';
const LOCAL_STR_UPDATED_AT = 'updated_at';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_5O9M1 = 'published_membership';
const LOCAL_STR_UNPUBLISHED = 'unpublished';
const LOCAL_STR_PROJECTED = 'projected';

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
const PROJECTION_AUTHORITY_SOURCE = Object.freeze({
  CLUSTER_MEMBER_HEALTHY: 'cluster_member_healthy',
  NONE: 'none',
  RECOVERY_ELIGIBLE_DIMENSION: 'recovery_eligible_dimension',
  RUNTIME_AUTHORITY_CONFIRMED: 'runtime_authority_confirmed',
  RUNTIME_AUTHORITY_ESTABLISHING: 'runtime_authority_establishing',
});
const ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE = Object.freeze({
  PUBLISHED_MEMBERSHIP: 'published_membership',
  LOCALLY_ELIGIBLE_PROJECTION: 'locally_eligible_projection',
  PROJECTED_SERVING: 'projected_serving_projection',
  RECOVERY_ELIGIBLE_PROJECTION: 'recovery_eligible_projection',
  NONE: 'none',
});

function normalizeNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || LOCAL_STR_EMPTY).trim())
      .filter((value) => value.length > NUM.ZERO),
  )].sort();
}

function normalizeStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || LOCAL_STR_EMPTY).trim())
      .filter((value) => value.length > NUM.ZERO),
  )];
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ?
    Math.floor(value) :
    NUM.ZERO;
}

function normalizePendingAckEvidenceState(value) {
  if (
    value === PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
    value ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST
  ) {
    return value;
  }
  return null;
}

function normalizeOptionalString(value) {
  return typeof value === TYPEOF.STRING && value.trim().length > NUM.ZERO ?
    value.trim() :
    null;
}

function resolveParticipationByNodeId(publicationConvergence = null) {
  if (!publicationConvergence || typeof publicationConvergence !== TYPEOF.OBJECT) {
    return {};
  }
  if (publicationConvergence.participationByNodeId &&
      typeof publicationConvergence.participationByNodeId === TYPEOF.OBJECT) {
    return publicationConvergence.participationByNodeId;
  }
  if (publicationConvergence.membershipLifecycleSummary?.participationByNodeId &&
      typeof publicationConvergence.membershipLifecycleSummary.participationByNodeId ===
        TYPEOF.OBJECT) {
    return publicationConvergence.membershipLifecycleSummary.participationByNodeId;
  }
  return {};
}

function resolveAdmissionBlockedNodeIds(publicationConvergence = null) {
  const participationByNodeId = resolveParticipationByNodeId(publicationConvergence);
  const blockedNodeIds = Object.values(participationByNodeId)
    .filter((participation) =>
      normalizeNodeParticipationAdmissionState(
        participation?.admissionState,
      ) === NODE_PARTICIPATION_ADMISSION_STATE.BLOCKED,
    )
    .map((participation) => participation?.nodeId);
  const targetNodeId = normalizeOptionalString(
    publicationConvergence?.targetNodeId ??
      publicationConvergence?.publisherNodeId,
  );
  if (
    targetNodeId &&
    normalizeNodeParticipationAdmissionState(
      publicationConvergence?.admissionState,
    ) === NODE_PARTICIPATION_ADMISSION_STATE.BLOCKED
  ) {
    blockedNodeIds.push(targetNodeId);
  }
  return normalizeNodeIdList(blockedNodeIds);
}

function excludeAdmissionBlockedNodeIds(nodeIds = [], blockedNodeIds = new Set()) {
  return normalizeNodeIdList(
    normalizeNodeIdList(nodeIds).filter((nodeId) => !blockedNodeIds.has(nodeId)),
  );
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
    return readPublicationOrderingValue(right, [LOCAL_STR_UPDATEDAT, LOCAL_STR_UPDATED_AT]) -
      readPublicationOrderingValue(left, [LOCAL_STR_UPDATEDAT, LOCAL_STR_UPDATED_AT]);
  });

  return publicationRows[LOCAL_NUM_ZERO] || null;
}

function resolveLatestPublishedPublicationRow(options = {}) {
  const publicationRows = (Array.isArray(options.publicationRows) ?
    options.publicationRows :
    [])
    .filter((row) => row && typeof row === TYPEOF.OBJECT)
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => isMembershipPublicationRow(row));
  const explicitPublishedPublicationRow =
    options.latestPublishedPublicationRow &&
      typeof options.latestPublishedPublicationRow === TYPEOF.OBJECT ?
      normalizeControlPlanePublicationRow(
        options.latestPublishedPublicationRow,
      ) :
      null;
  const explicitPublicationRow =
    options.latestPublicationRow &&
      typeof options.latestPublicationRow === TYPEOF.OBJECT ?
      normalizeControlPlanePublicationRow(options.latestPublicationRow) :
      null;
  if (explicitPublishedPublicationRow &&
    isMembershipPublicationRow(explicitPublishedPublicationRow) && (
    explicitPublishedPublicationRow.publicationId ||
    explicitPublishedPublicationRow.publicationEpoch > NUM.ZERO ||
    explicitPublishedPublicationRow.status
  ) &&
    explicitPublishedPublicationRow.status ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED) {
    publicationRows.push(explicitPublishedPublicationRow);
  }
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
  const durablePublishedMembershipCandidate = publishedPublicationRow ||
    buildMembershipPublicationActiveSnapshot(latestPublicationRow);
  if (!durablePublishedMembershipCandidate) {
    return options.requirePublishedMembership === true ?
      Object.freeze([]) :
      null;
  }
  const publishedActiveNodeIds = Array.isArray(
    durablePublishedMembershipCandidate.publishedActiveNodeIds,
  ) ?
    durablePublishedMembershipCandidate.publishedActiveNodeIds :
    [];
  if (publishedActiveNodeIds.length === NUM.ZERO) {
    return durablePublishedMembershipCandidate
      .publishedActiveNodeIdsPresent === true ?
      Object.freeze([]) :
      (options.requirePublishedMembership === true ?
        Object.freeze([]) :
        null);
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

function hasRuntimeTransportEvidence(nodeId, options = {}) {
  const normalizedNodeId = String(nodeId || '').trim();
  if (normalizedNodeId.length === NUM.ZERO) {
    return false;
  }
  const connectedNodeIds = new Set(normalizeNodeIdList(options.connectedNodeIds));
  if (connectedNodeIds.has(normalizedNodeId)) {
    return true;
  }
  const readinessByNodeId = buildReadinessByNodeId(options);
  const readinessEntry = readinessByNodeId?.[normalizedNodeId] || null;
  const nodeEvidence = readinessEntry?.nodeEvidence &&
    typeof readinessEntry.nodeEvidence === TYPEOF.OBJECT ?
    readinessEntry.nodeEvidence :
    null;
  if (nodeEvidence?.transportConnected === true) {
    return true;
  }
  return options.localNodeResponsive === true &&
    String(options.localNodeId || LOCAL_STR_EMPTY).trim() === normalizedNodeId &&
    nodeEvidence?.localQueryTransportReady !== false;
}

function buildProjectionReadinessDimensionOutcome(outcome) {
  return outcome;
}

function evaluateProjectionReadinessDimensions(
  readinessEntry = null,
  options = {},
) {
  const readinessDimensions = readinessEntry?.dimensions &&
    typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
    readinessEntry.dimensions :
    null;
  const runtimeAuthority = readinessEntry?.runtimeAuthority &&
    typeof readinessEntry.runtimeAuthority === TYPEOF.OBJECT ?
    readinessEntry.runtimeAuthority :
    null;
  const hasDimensionEvidence = Boolean(
    readinessDimensions &&
    Object.keys(readinessDimensions).length > NUM.ZERO,
  );
  const hasReadinessEvidence = hasDimensionEvidence || Boolean(runtimeAuthority);
  if (!readinessDimensions ||
      typeof readinessDimensions !== TYPEOF.OBJECT ||
      Object.keys(readinessDimensions).length === NUM.ZERO) {
    if (runtimeAuthority &&
        options.allowControlPlaneRecoveryEligibleProjection === true &&
        runtimeAuthority.provisioning?.eligible === true) {
      if (runtimeAuthority.state === RUNTIME_AUTHORITY_STATE.CONFIRMED) {
        return buildProjectionReadinessDimensionOutcome({
          hasReadinessEvidence: true,
          projectionEligible: true,
          projectedByRecoveryEligibility: false,
          projectedByRuntimeAuthority: true,
          clusterMemberHealthyMissing: true,
          authoritySource: PROJECTION_AUTHORITY_SOURCE
            .RUNTIME_AUTHORITY_CONFIRMED,
        });
      }
      if (runtimeAuthority.state === RUNTIME_AUTHORITY_STATE.ESTABLISHING) {
        return buildProjectionReadinessDimensionOutcome({
          hasReadinessEvidence: true,
          projectionEligible: true,
          projectedByRecoveryEligibility: false,
          projectedByRuntimeAuthority: true,
          clusterMemberHealthyMissing: true,
          authoritySource: PROJECTION_AUTHORITY_SOURCE
            .RUNTIME_AUTHORITY_ESTABLISHING,
        });
      }
    }
    return buildProjectionReadinessDimensionOutcome({
      hasReadinessEvidence,
      projectionEligible: null,
      projectedByRecoveryEligibility: false,
      projectedByRuntimeAuthority: false,
      clusterMemberHealthyMissing: false,
      authoritySource: PROJECTION_AUTHORITY_SOURCE.NONE,
    });
  }
  if (readinessDimensions[
    CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
  ] === true) {
    return buildProjectionReadinessDimensionOutcome({
      hasReadinessEvidence: true,
      projectionEligible: true,
      projectedByRecoveryEligibility: false,
      projectedByRuntimeAuthority: false,
      clusterMemberHealthyMissing: false,
      authoritySource: PROJECTION_AUTHORITY_SOURCE.CLUSTER_MEMBER_HEALTHY,
    });
  }
  if (options.allowControlPlaneRecoveryEligibleProjection === true &&
      runtimeAuthority &&
      runtimeAuthority.provisioning?.eligible === true) {
    if (runtimeAuthority.state === RUNTIME_AUTHORITY_STATE.CONFIRMED) {
      return buildProjectionReadinessDimensionOutcome({
        hasReadinessEvidence: true,
        projectionEligible: true,
        projectedByRecoveryEligibility: false,
        projectedByRuntimeAuthority: true,
        clusterMemberHealthyMissing: true,
        authoritySource: PROJECTION_AUTHORITY_SOURCE
          .RUNTIME_AUTHORITY_CONFIRMED,
      });
    }
    if (runtimeAuthority.state === RUNTIME_AUTHORITY_STATE.ESTABLISHING) {
      return buildProjectionReadinessDimensionOutcome({
        hasReadinessEvidence: true,
        projectionEligible: true,
        projectedByRecoveryEligibility: false,
        projectedByRuntimeAuthority: true,
        clusterMemberHealthyMissing: true,
        authoritySource: PROJECTION_AUTHORITY_SOURCE
          .RUNTIME_AUTHORITY_ESTABLISHING,
      });
    }
  }
  const controlPlaneRecoveryEligible = readinessDimensions[
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
  ] === true;
  const projectedByRecoveryEligibility =
    options.allowControlPlaneRecoveryEligibleProjection === true &&
    controlPlaneRecoveryEligible;
  return buildProjectionReadinessDimensionOutcome({
    hasReadinessEvidence: true,
    projectionEligible: projectedByRecoveryEligibility,
    projectedByRecoveryEligibility,
    projectedByRuntimeAuthority: false,
    clusterMemberHealthyMissing: true,
    authoritySource: projectedByRecoveryEligibility ?
      PROJECTION_AUTHORITY_SOURCE.RECOVERY_ELIGIBLE_DIMENSION :
      PROJECTION_AUTHORITY_SOURCE.NONE,
  });
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
    ]);
  }
  return Object.freeze([
    CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
  ]);
}

function shouldAllowLivenessFallbackProjection(
  nodeRow,
  readinessProjection,
  options = {},
) {
  if (options.allowControlPlaneRecoveryEligibleProjection !== true ||
      options.allowLivenessFallbackProjection !== true) {
    return false;
  }
  if (!readinessProjection ||
      readinessProjection.hasReadinessEvidence !== true ||
      readinessProjection.projectionEligible === true) {
    return false;
  }
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
  return hasFreshLiveness;
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
  const readinessProjection = evaluateProjectionReadinessDimensions(
    readinessEntry,
    options,
  );
  const allowLivenessFallbackProjection =
    shouldAllowLivenessFallbackProjection(
      nodeRow,
      readinessProjection,
      options,
    );
  if (readinessProjection.hasReadinessEvidence) {
    if (readinessProjection.projectionEligible !== true &&
        !allowLivenessFallbackProjection) {
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
  const projectedByAuthorityConvergence =
    options.allowControlPlaneRecoveryEligibleProjection === true &&
    (readinessProjection.projectedByRecoveryEligibility === true ||
      readinessProjection.projectedByRuntimeAuthority === true);
  if (!projectedByAuthorityConvergence) {
    if (hasCanonicalWebSocketEndpoints(nodeEndpointRows) &&
        !hasCanonicalWebSocketEndpoint(
          normalizedNode.nodeId,
          nodeEndpointRows,
        ) &&
        !hasCanonicalActiveService(
          normalizedNode.nodeId,
          options.serviceRows,
        ) &&
        !hasRuntimeTransportEvidence(normalizedNode.nodeId, {
          ...options,
          readinessByNodeId,
        })) {
      return false;
    }
  }

  return true;
}

function resolveProjectedActiveNodeSelection(options = {}) {
  const nodeRows = Array.isArray(options.nodeRows) ? options.nodeRows : [];
  const readinessByNodeId = buildReadinessByNodeId(options);
  const nodeRowsById = new Map();
  const recoveryEligibleIncludedNodeIds = new Set();
  const runtimeAuthorityIncludedNodeIds = new Set();
  const livenessFallbackIncludedNodeIds = new Set();
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
    ...normalizeNodeIdList(options.connectedNodeIds),
    ...normalizeNodeIdList([options.localNodeId]),
  ]);
  const activeNodeIds = [];
  const requireWebSocketEndpoint =
    hasCanonicalWebSocketEndpoints(options.nodeEndpointRows);

  for (const nodeId of candidateNodeIds) {
    const nodeRow = nodeRowsById.get(nodeId) || null;
    const readinessEntry = readinessByNodeId?.[nodeId] || null;
    const readinessProjection = evaluateProjectionReadinessDimensions(
      readinessEntry,
      options,
    );
    const allowLivenessFallbackProjection =
      shouldAllowLivenessFallbackProjection(
        nodeRow,
        readinessProjection,
        options,
      );
    const runtimeTransportEvidence = hasRuntimeTransportEvidence(nodeId, {
      ...options,
      readinessByNodeId,
    });
    if (nodeRow) {
      if (readinessProjection.hasReadinessEvidence &&
          readinessProjection.projectionEligible !== true &&
          !allowLivenessFallbackProjection) {
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
        if (readinessProjection.projectedByRuntimeAuthority) {
          runtimeAuthorityIncludedNodeIds.add(nodeId);
        }
        if (allowLivenessFallbackProjection) {
          livenessFallbackIncludedNodeIds.add(nodeId);
        }
      }
      continue;
    }

    if (!readinessProjection.hasReadinessEvidence ||
        readinessProjection.projectionEligible !== true) {
      const allowResponsiveLocalNodeProjection =
        options.localNodeResponsive === true &&
        String(options.localNodeId || '').trim() === nodeId;
      if (allowResponsiveLocalNodeProjection !== true) {
        if (readinessProjection.hasReadinessEvidence) {
          readinessExcludedNodeIds.add(nodeId);
          if (readinessProjection.clusterMemberHealthyMissing) {
            clusterMemberUnhealthyExcludedNodeIds.add(nodeId);
          }
        }
        continue;
      }
    }
    if (readinessProjection.hasReadinessEvidence &&
        readinessProjection.projectionEligible !== true &&
        !allowLivenessFallbackProjection) {
      if (readinessProjection.hasReadinessEvidence) {
        readinessExcludedNodeIds.add(nodeId);
        if (readinessProjection.clusterMemberHealthyMissing) {
          clusterMemberUnhealthyExcludedNodeIds.add(nodeId);
        }
      }
      continue;
    }
    if (requireWebSocketEndpoint &&
        !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows) &&
        !runtimeTransportEvidence) {
      continue;
    }
    if (!hasCanonicalActiveService(nodeId, options.serviceRows) &&
        !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows) &&
        !runtimeTransportEvidence) {
      continue;
    }
    activeNodeIds.push(nodeId);
    if (readinessProjection.projectedByRecoveryEligibility) {
      recoveryEligibleIncludedNodeIds.add(nodeId);
    }
    if (readinessProjection.projectedByRuntimeAuthority) {
      runtimeAuthorityIncludedNodeIds.add(nodeId);
    }
    if (allowLivenessFallbackProjection) {
      livenessFallbackIncludedNodeIds.add(nodeId);
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
    runtimeAuthorityIncludedNodeIds:
      Object.freeze([...runtimeAuthorityIncludedNodeIds].sort()),
    livenessFallbackIncludedNodeIds:
      Object.freeze([...livenessFallbackIncludedNodeIds].sort()),
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
      LOCAL_STR_5O9M1 :
      LOCAL_STR_UNPUBLISHED,
    authoritativeActiveNodeIds: Object.freeze([...authoritativeActiveNodeIds]),
    projectedServingNodeIds: Object.freeze([...projectedServingNodeIds]),
    locallyEligibleNodeIds: Object.freeze([...locallyEligibleNodeIds]),
    suspectedOrTransitioningNodeIds: Object.freeze([
      ...suspectedOrTransitioningNodeIds,
    ]),
    membershipFreeze,
    effectiveSource: hasPublishedMembership ?
      LOCAL_STR_5O9M1 :
      LOCAL_STR_PROJECTED,
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
      runtimeAuthorityIncludedNodeIds: Object.freeze([
        ...projectedActiveNodeSelection.runtimeAuthorityIncludedNodeIds,
      ]),
      livenessFallbackIncludedNodeIds: Object.freeze([
        ...projectedActiveNodeSelection.livenessFallbackIncludedNodeIds,
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

function resolvePriorityRecoveryActiveNodeCohort(publicationConvergence = null) {
  const normalizedPublicationConvergence =
    publicationConvergence &&
      typeof publicationConvergence === TYPEOF.OBJECT ?
      publicationConvergence :
      {};
  const membershipLifecycleSummary =
    normalizedPublicationConvergence.membershipLifecycleSummary &&
      typeof normalizedPublicationConvergence.membershipLifecycleSummary ===
        TYPEOF.OBJECT ?
      normalizedPublicationConvergence.membershipLifecycleSummary :
      null;
  const projectionDiagnostics =
    normalizedPublicationConvergence.projectionDiagnostics &&
      typeof normalizedPublicationConvergence.projectionDiagnostics ===
        TYPEOF.OBJECT ?
      normalizedPublicationConvergence.projectionDiagnostics :
      membershipLifecycleSummary?.projectionDiagnostics &&
        typeof membershipLifecycleSummary.projectionDiagnostics ===
          TYPEOF.OBJECT ?
        membershipLifecycleSummary.projectionDiagnostics :
        null;
  const admissionBlockedNodeIdSet = new Set(
    resolveAdmissionBlockedNodeIds(normalizedPublicationConvergence),
  );
  const publishedActiveNodeIds = normalizeNodeIdList(
    Array.isArray(normalizedPublicationConvergence?.publishedActiveNodeIds) ?
      normalizedPublicationConvergence.publishedActiveNodeIds :
      membershipLifecycleSummary?.publishedActiveNodeIds,
  );
  const projectedServingNodeIds = normalizeNodeIdList([
    ...(Array.isArray(normalizedPublicationConvergence?.projectedServingNodeIds) ?
      normalizedPublicationConvergence.projectedServingNodeIds :
      []),
    ...(Array.isArray(membershipLifecycleSummary?.projectedServingNodeIds) ?
      membershipLifecycleSummary.projectedServingNodeIds :
      []),
  ]);
  const locallyEligibleNodeIds = normalizeNodeIdList([
    ...(Array.isArray(normalizedPublicationConvergence?.locallyEligibleNodeIds) ?
      normalizedPublicationConvergence.locallyEligibleNodeIds :
      []),
    ...(Array.isArray(membershipLifecycleSummary?.locallyEligibleNodeIds) ?
      membershipLifecycleSummary.locallyEligibleNodeIds :
      []),
  ]);
  const recoveryEligibleIncludedNodeIds = normalizeNodeIdList(
    projectionDiagnostics?.recoveryEligibleIncludedNodeIds,
  );
  const livenessFallbackIncludedNodeIds = normalizeNodeIdList(
    projectionDiagnostics?.livenessFallbackIncludedNodeIds,
  );
  const explicitRecoveryActiveNodeIds = normalizeNodeIdList([
    ...(Array.isArray(normalizedPublicationConvergence?.recoveryActiveNodeIds) ?
      normalizedPublicationConvergence.recoveryActiveNodeIds :
      []),
    ...(Array.isArray(membershipLifecycleSummary?.recoveryActiveNodeIds) ?
      membershipLifecycleSummary.recoveryActiveNodeIds :
      []),
  ]);
  const admittedPublishedActiveNodeIds = excludeAdmissionBlockedNodeIds(
    publishedActiveNodeIds,
    admissionBlockedNodeIdSet,
  );
  const admittedProjectedServingNodeIds = excludeAdmissionBlockedNodeIds(
    projectedServingNodeIds,
    admissionBlockedNodeIdSet,
  );
  const admittedLocallyEligibleNodeIds = excludeAdmissionBlockedNodeIds(
    locallyEligibleNodeIds,
    admissionBlockedNodeIdSet,
  );
  const admittedRecoveryEligibleIncludedNodeIds = excludeAdmissionBlockedNodeIds(
    recoveryEligibleIncludedNodeIds,
    admissionBlockedNodeIdSet,
  );
  const admittedLivenessFallbackIncludedNodeIds = excludeAdmissionBlockedNodeIds(
    livenessFallbackIncludedNodeIds,
    admissionBlockedNodeIdSet,
  );
  const admittedExplicitRecoveryActiveNodeIds = excludeAdmissionBlockedNodeIds(
    explicitRecoveryActiveNodeIds,
    admissionBlockedNodeIdSet,
  );
  const explicitRecoveryActiveNodeSource =
    typeof normalizedPublicationConvergence?.recoveryActiveNodeSource ===
      TYPEOF.STRING &&
      normalizedPublicationConvergence.recoveryActiveNodeSource.trim()
        .length > NUM.ZERO ?
      normalizedPublicationConvergence.recoveryActiveNodeSource.trim() :
      (typeof membershipLifecycleSummary?.recoveryActiveNodeSource ===
        TYPEOF.STRING &&
        membershipLifecycleSummary.recoveryActiveNodeSource.trim().length >
          NUM.ZERO ?
        membershipLifecycleSummary.recoveryActiveNodeSource.trim() :
        null);

  const publishedActiveNodeIdSet = new Set(admittedPublishedActiveNodeIds);
  const projectionNodeIds = normalizeNodeIdList([
    ...admittedLocallyEligibleNodeIds,
    ...admittedProjectedServingNodeIds,
    ...admittedRecoveryEligibleIncludedNodeIds,
  ]);
  const projectionAddsNodes = projectionNodeIds.some((nodeId) =>
    !publishedActiveNodeIdSet.has(nodeId),
  );
  const shouldUseProjectionCohort =
    projectionNodeIds.length > NUM.ZERO && (
      admittedPublishedActiveNodeIds.length === NUM.ZERO ||
      projectionAddsNodes ||
      admittedRecoveryEligibleIncludedNodeIds.length > NUM.ZERO ||
      admittedLivenessFallbackIncludedNodeIds.length > NUM.ZERO
    );
  const buildProjectionCohortNodeIds = (candidateNodeIds) =>
    normalizeNodeIdList([
      ...admittedPublishedActiveNodeIds,
      ...candidateNodeIds,
    ]);

  let activeNodeIds = [];
  let source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.NONE;
  if (shouldUseProjectionCohort && admittedLocallyEligibleNodeIds.length > NUM.ZERO) {
    activeNodeIds = buildProjectionCohortNodeIds(admittedLocallyEligibleNodeIds);
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION;
  } else if (
    shouldUseProjectionCohort && admittedProjectedServingNodeIds.length > NUM.ZERO
  ) {
    activeNodeIds = buildProjectionCohortNodeIds(admittedProjectedServingNodeIds);
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.PROJECTED_SERVING;
  } else if (
    shouldUseProjectionCohort &&
    admittedRecoveryEligibleIncludedNodeIds.length > NUM.ZERO
  ) {
    activeNodeIds = buildProjectionCohortNodeIds(
      admittedRecoveryEligibleIncludedNodeIds,
    );
    source =
      ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.RECOVERY_ELIGIBLE_PROJECTION;
  } else if (admittedPublishedActiveNodeIds.length > NUM.ZERO) {
    activeNodeIds = admittedPublishedActiveNodeIds;
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.PUBLISHED_MEMBERSHIP;
  } else if (admittedLocallyEligibleNodeIds.length > NUM.ZERO) {
    activeNodeIds = admittedLocallyEligibleNodeIds;
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION;
  } else if (admittedProjectedServingNodeIds.length > NUM.ZERO) {
    activeNodeIds = admittedProjectedServingNodeIds;
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.PROJECTED_SERVING;
  } else if (admittedRecoveryEligibleIncludedNodeIds.length > NUM.ZERO) {
    activeNodeIds = admittedRecoveryEligibleIncludedNodeIds;
    source =
      ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.RECOVERY_ELIGIBLE_PROJECTION;
  }

  if (admittedExplicitRecoveryActiveNodeIds.length > NUM.ZERO) {
    activeNodeIds = normalizeNodeIdList([
      ...activeNodeIds,
      ...admittedExplicitRecoveryActiveNodeIds,
    ]);
    if (source === ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.NONE) {
      source = explicitRecoveryActiveNodeSource ||
        ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION;
    }
  }

  return Object.freeze({
    activeNodeIds: Object.freeze([...activeNodeIds]),
    source,
    publishedActiveNodeIds: Object.freeze([...admittedPublishedActiveNodeIds]),
    projectedServingNodeIds: Object.freeze([...admittedProjectedServingNodeIds]),
    locallyEligibleNodeIds: Object.freeze([...admittedLocallyEligibleNodeIds]),
    recoveryEligibleIncludedNodeIds: Object.freeze([
      ...admittedRecoveryEligibleIncludedNodeIds,
    ]),
    missingPublishedActiveNodeIds: Object.freeze(activeNodeIds.filter((nodeId) =>
      !admittedPublishedActiveNodeIds.includes(nodeId),
    )),
  });
}

function buildActiveMembershipSnapshot(publicationConvergence = null) {
  const normalizedPublicationConvergence =
    publicationConvergence &&
      typeof publicationConvergence === TYPEOF.OBJECT ?
      publicationConvergence :
      {};
  const membershipLifecycleSummary =
    normalizedPublicationConvergence.membershipLifecycleSummary &&
      typeof normalizedPublicationConvergence.membershipLifecycleSummary ===
        TYPEOF.OBJECT ?
      normalizedPublicationConvergence.membershipLifecycleSummary :
      null;
  const projectionDiagnostics =
    normalizedPublicationConvergence.projectionDiagnostics &&
      typeof normalizedPublicationConvergence.projectionDiagnostics ===
        TYPEOF.OBJECT ?
      normalizedPublicationConvergence.projectionDiagnostics :
      membershipLifecycleSummary?.projectionDiagnostics &&
        typeof membershipLifecycleSummary.projectionDiagnostics ===
          TYPEOF.OBJECT ?
        membershipLifecycleSummary.projectionDiagnostics :
        null;
  const activeNodeCohort =
    resolvePriorityRecoveryActiveNodeCohort(normalizedPublicationConvergence);

  return Object.freeze({
    publishedActiveNodeIds: Object.freeze([
      ...activeNodeCohort.publishedActiveNodeIds,
    ]),
    projectedServingNodeIds: Object.freeze([
      ...activeNodeCohort.projectedServingNodeIds,
    ]),
    locallyEligibleNodeIds: Object.freeze([
      ...activeNodeCohort.locallyEligibleNodeIds,
    ]),
    projectionDiagnostics:
      projectionDiagnostics && typeof projectionDiagnostics === TYPEOF.OBJECT ?
        Object.freeze({...projectionDiagnostics}) :
        null,
    recoveryEligibleIncludedNodeIds: Object.freeze([
      ...activeNodeCohort.recoveryEligibleIncludedNodeIds,
    ]),
    concreteEligibleNodeIds: Object.freeze([
      ...activeNodeCohort.activeNodeIds,
    ]),
    recoveryActiveNodeIds: Object.freeze([
      ...activeNodeCohort.activeNodeIds,
    ]),
    recoveryActiveNodeSource: activeNodeCohort.source,
    missingPublishedRecoveryActiveNodeIds: Object.freeze([
      ...activeNodeCohort.missingPublishedActiveNodeIds,
    ]),
    missingPublishedEligibleNodeIds: Object.freeze([
      ...activeNodeCohort.missingPublishedActiveNodeIds,
    ]),
  });
}

function buildMembershipPublicationActiveSnapshot(
  membershipPublication = null,
) {
  if (!membershipPublication || typeof membershipPublication !== TYPEOF.OBJECT) {
    return null;
  }

  const normalizedPublication =
    normalizeControlPlanePublicationRow(membershipPublication);
  const membershipLifecycleSummary =
    normalizedPublication.membershipLifecycleSummary &&
      typeof normalizedPublication.membershipLifecycleSummary ===
        TYPEOF.OBJECT ?
      Object.freeze({...normalizedPublication.membershipLifecycleSummary}) :
      null;
  const projectionDiagnostics =
    membershipLifecycleSummary?.projectionDiagnostics &&
      typeof membershipLifecycleSummary.projectionDiagnostics ===
        TYPEOF.OBJECT ?
      Object.freeze({...membershipLifecycleSummary.projectionDiagnostics}) :
      null;
  const publicationStatus =
    typeof membershipPublication.status === TYPEOF.STRING ?
      membershipPublication.status :
      normalizedPublication.status || null;
  const publishedActiveNodeIdsPresent =
    membershipPublication.publishedActiveNodeIdsPresent === true ||
    Array.isArray(membershipPublication.publishedActiveNodeIds) ||
    Array.isArray(membershipPublication.published_active_node_ids);
  const pendingAckEvidenceState =
    normalizePendingAckEvidenceState(
      membershipPublication.pendingAckEvidenceState ??
        membershipPublication.pending_ack_evidence_state,
    ) ??
    (Array.isArray(
      membershipPublication.requiredAckNodeIds ??
        membershipPublication.required_ack_node_ids,
    ) ?
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
        .REQUIRED_ACK_NODE_LIST :
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY);
  const priorityRecoveryPublicationContext =
    buildActiveMembershipSnapshot({
      publishedActiveNodeIds: normalizedPublication.publishedActiveNodeIds,
      membershipLifecycleSummary,
      projectionDiagnostics,
      targetNodeId:
        membershipPublication.targetNodeId ??
        membershipPublication.target_node_id ??
        membershipPublication.publisherNodeId ??
        membershipPublication.publisher_node_id,
      admissionState:
        membershipPublication.admissionState ??
        membershipPublication.admission_state,
      admissionReasonCodes:
        membershipPublication.admissionReasonCodes ??
        membershipPublication.admission_reason_codes,
      clusterIncarnationFence:
        membershipPublication.clusterIncarnationFence ??
        membershipPublication.cluster_incarnation_fence,
      recoveryActiveNodeIds:
        membershipPublication.recoveryActiveNodeIds ??
        membershipPublication.recovery_active_node_ids,
      recoveryActiveNodeSource:
        membershipPublication.recoveryActiveNodeSource ??
        membershipPublication.recovery_active_node_source,
    });

  return Object.freeze({
    publicationEpoch:
      Number.isFinite(normalizedPublication.publicationEpoch) ?
        normalizedPublication.publicationEpoch :
        null,
    status: publicationStatus,
    publicationStatus: publicationStatus,
    sourceTopologyEpoch:
      Number.isFinite(normalizedPublication.sourceTopologyEpoch) ?
        normalizedPublication.sourceTopologyEpoch :
        null,
    sourceSnapshotVersion:
      Number.isFinite(normalizedPublication.sourceSnapshotVersion) ?
        normalizedPublication.sourceSnapshotVersion :
        null,
    targetNodeId: normalizeOptionalString(
      membershipPublication.targetNodeId ??
        membershipPublication.target_node_id ??
        membershipPublication.publisherNodeId ??
        membershipPublication.publisher_node_id,
    ),
    ...(normalizeOptionalString(
      membershipPublication.admissionState ??
        membershipPublication.admission_state,
    ) ?
      {
        admissionState: normalizeOptionalString(
          membershipPublication.admissionState ??
            membershipPublication.admission_state,
        ),
      } :
      {}),
    ...(Array.isArray(
      membershipPublication.admissionReasonCodes ??
        membershipPublication.admission_reason_codes,
    ) ?
      {
        admissionReasonCodes: Object.freeze(normalizeStringList(
          membershipPublication.admissionReasonCodes ??
            membershipPublication.admission_reason_codes,
        )),
      } :
      {}),
    ...((membershipPublication.clusterIncarnationFence ??
      membershipPublication.cluster_incarnation_fence) &&
      typeof (
        membershipPublication.clusterIncarnationFence ??
          membershipPublication.cluster_incarnation_fence
      ) === TYPEOF.OBJECT ?
      {
        clusterIncarnationFence: Object.freeze({
          ...(membershipPublication.clusterIncarnationFence ??
            membershipPublication.cluster_incarnation_fence),
        }),
      } :
      {}),
    publishedActiveNodeIdsPresent,
    publishedActiveNodeIds: Object.freeze([
      ...normalizedPublication.publishedActiveNodeIds,
    ]),
    requiredAckNodeIds: Object.freeze([
      ...normalizedPublication.requiredAckNodeIds,
    ]),
    acknowledgedNodeIds: Object.freeze([
      ...normalizedPublication.acknowledgedNodeIds,
    ]),
    pendingAckCount: normalizeNonNegativeInteger(
      membershipPublication.pendingAckCount ??
        membershipPublication.pending_ack_count,
    ),
    pendingAckEvidenceState,
    priorityPartitionSummary:
      normalizedPublication.priorityPartitionSummary &&
        typeof normalizedPublication.priorityPartitionSummary ===
          TYPEOF.OBJECT ?
        Object.freeze({...normalizedPublication.priorityPartitionSummary}) :
        null,
    membershipLifecycleSummary,
    projectionDiagnostics,
    projectedServingNodeIds: Object.freeze([
      ...priorityRecoveryPublicationContext.projectedServingNodeIds,
    ]),
    locallyEligibleNodeIds: Object.freeze([
      ...priorityRecoveryPublicationContext.locallyEligibleNodeIds,
    ]),
    recoveryEligibleIncludedNodeIds: Object.freeze([
      ...priorityRecoveryPublicationContext.recoveryEligibleIncludedNodeIds,
    ]),
    concreteEligibleNodeIds: Object.freeze([
      ...priorityRecoveryPublicationContext.concreteEligibleNodeIds,
    ]),
    recoveryActiveNodeIds: Object.freeze([
      ...priorityRecoveryPublicationContext.recoveryActiveNodeIds,
    ]),
    recoveryActiveNodeSource:
      priorityRecoveryPublicationContext.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds: Object.freeze([
      ...priorityRecoveryPublicationContext
        .missingPublishedRecoveryActiveNodeIds,
    ]),
    missingPublishedEligibleNodeIds: Object.freeze([
      ...priorityRecoveryPublicationContext.missingPublishedEligibleNodeIds,
    ]),
  });
}

export {
  ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE,
  buildActiveMembershipSnapshot,
  buildMembershipPublicationActiveSnapshot,
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
  resolvePriorityRecoveryActiveNodeCohort,
};
