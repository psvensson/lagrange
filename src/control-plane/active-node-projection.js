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
  normalizeServiceRow,
} from './system-row-normalizers.js';
import {
  buildProjectionReadinessState,
} from './projection-readiness-state.js';
import {
  ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE,
  buildActiveMembershipSnapshot,
  buildMembershipPublicationActiveSnapshot,
  resolveLatestPublicationRow,
  resolveLatestPublishedPublicationRow,
  resolvePriorityRecoveryActiveNodeCohort,
  resolvePublishedActiveNodeIds,
  resolveRecentlyPublishedActiveNodeIds,
} from './active-node-publication-snapshots.js';
import {
  normalizeNodeIdList,
} from './active-node-projection-normalizers.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_5O9M1 = 'published_membership';
const LOCAL_STR_UNPUBLISHED = 'unpublished';
const LOCAL_STR_PROJECTED = 'projected';

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

function isProjectionLivenessConnectionState(connectionState) {
  return connectionState === String(STATE.READY).toLowerCase() ||
    connectionState === String(STATE.CONNECTED).toLowerCase();
}

function hasFreshProjectionLiveness(nodeRow, options = {}) {
  const normalizedNode = normalizeNodeRow(nodeRow);
  if (!normalizedNode.nodeId) {
    return false;
  }
  return isProjectionLivenessConnectionState(
    normalizedNode.connectionState,
  ) && hasFreshReadyLeaseOrHeartbeat(nodeRow, options);
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

function resolveProjectionReadinessRuntimeAuthorityProjection(
  projectionReadiness,
) {
  const runtimeAuthority = projectionReadiness.evidence.runtimeAuthority;
  if (
    runtimeAuthority?.provisioning?.eligible !== true
  ) {
    return PROJECTION_AUTHORITY_SOURCE.NONE;
  }
  if (runtimeAuthority.state === RUNTIME_AUTHORITY_STATE.CONFIRMED) {
    return PROJECTION_AUTHORITY_SOURCE.RUNTIME_AUTHORITY_CONFIRMED;
  }
  if (runtimeAuthority.state === RUNTIME_AUTHORITY_STATE.ESTABLISHING) {
    return PROJECTION_AUTHORITY_SOURCE.RUNTIME_AUTHORITY_ESTABLISHING;
  }
  return PROJECTION_AUTHORITY_SOURCE.NONE;
}

function resolveProjectionReadinessAuthoritySource(
  projectionReadiness,
  options = {},
) {
  if (projectionReadiness.lanes.internal.ready === true) {
    return PROJECTION_AUTHORITY_SOURCE.CLUSTER_MEMBER_HEALTHY;
  }
  if (options.allowControlPlaneRecoveryEligibleProjection !== true) {
    return PROJECTION_AUTHORITY_SOURCE.NONE;
  }
  const runtimeAuthoritySource =
    resolveProjectionReadinessRuntimeAuthorityProjection(projectionReadiness);
  if (runtimeAuthoritySource !== PROJECTION_AUTHORITY_SOURCE.NONE) {
    return runtimeAuthoritySource;
  }
  return projectionReadiness.evidence.recoveryEligible === true ?
    PROJECTION_AUTHORITY_SOURCE.RECOVERY_ELIGIBLE_DIMENSION :
    PROJECTION_AUTHORITY_SOURCE.NONE;
}

function evaluateProjectionReadinessDimensions(
  readinessEntry = null,
  options = {},
) {
  const projectionReadiness =
    readinessEntry?.lanes && typeof readinessEntry.lanes === TYPEOF.OBJECT ?
      readinessEntry :
      buildProjectionReadinessState(
        readinessEntry && typeof readinessEntry === TYPEOF.OBJECT ?
          readinessEntry :
          {},
      );
  const authoritySource = resolveProjectionReadinessAuthoritySource(
    projectionReadiness,
    options,
  );
  const projectedByRuntimeAuthority =
    authoritySource ===
      PROJECTION_AUTHORITY_SOURCE.RUNTIME_AUTHORITY_CONFIRMED ||
    authoritySource ===
      PROJECTION_AUTHORITY_SOURCE.RUNTIME_AUTHORITY_ESTABLISHING;
  const projectedByRecoveryEligibility =
    authoritySource ===
      PROJECTION_AUTHORITY_SOURCE.RECOVERY_ELIGIBLE_DIMENSION;
  const projectionEligible =
    projectionReadiness.lanes.internal.ready === true ||
    projectedByRuntimeAuthority ||
    projectedByRecoveryEligibility;
  return buildProjectionReadinessDimensionOutcome({
    hasReadinessEvidence:
      projectionReadiness.evidence.ownerEvidenceAvailable === true,
    projectionEligible,
    projectedByRecoveryEligibility,
    projectedByRuntimeAuthority,
    clusterMemberHealthyMissing:
      projectionReadiness.evidence.clusterMemberHealthy !== true,
    authoritySource,
    projectionReadiness,
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

function isPublishedBaselineMember(nodeId, options = {}) {
  // CL-001 variant C re-admission: use the NON-RATCHETING recently-published union
  // (a superset of the latest published set) so a node trimmed in the latest epoch
  // is still recognized as an already-published member by the transport-alive
  // retention grace, and can be re-admitted once its liveness recovers — instead
  // of being stranded out forever by the baseline ratcheting to the trimmed set.
  const publishedBaselineNodeIds = normalizeNodeIdList(
    resolveRecentlyPublishedActiveNodeIds({
      ...options,
      requirePublishedMembership: false,
    }),
  );
  return publishedBaselineNodeIds.includes(String(nodeId || '').trim());
}

// CL-001 variant C: an already-published node that is still transport-connected
// and within the heartbeat grace must not be trimmed from the published active
// set on a transient post-restart heartbeat-stall trough (heartbeat momentarily
// older than the cluster-member stale window + lease lapsed). The owner already
// grants this exact transport-alive grace on the lease-DISCONNECT path
// ("Skipped lease disconnect for transport-connected node"); the publication
// projection must not contradict it. Scoped to RETENTION (the node must already
// be in the published baseline) so the strict-mode promotion guard is preserved
// — a NEW node is never admitted on this path — and gated on LIVE transport
// evidence (not the stored connection_state column) plus the 60s heartbeat grace,
// so a node stalled past the grace with no live transport still trims.
function shouldRetainTransportAlivePublishedNode(nodeId, nodeRow, options = {}) {
  if (!isPublishedBaselineMember(nodeId, options)) {
    return false;
  }
  if (!hasRuntimeTransportEvidence(nodeId, {
    ...options,
    readinessByNodeId: buildReadinessByNodeId(options),
  })) {
    return false;
  }
  return hasFreshReadyLeaseOrHeartbeat(nodeRow, options);
}

function shouldAllowLivenessFallbackProjection(
  nodeRow,
  readinessProjection,
  options = {},
) {
  if (!readinessProjection ||
      readinessProjection.projectionEligible === true) {
    return false;
  }
  const normalizedNode = normalizeNodeRow(nodeRow);
  if (!normalizedNode.nodeId) {
    return false;
  }
  if (normalizedNode.status !== String(SERVICE_STATUS.ACTIVE).toLowerCase()) {
    return false;
  }
  if (options.allowControlPlaneRecoveryEligibleProjection === true &&
      options.allowLivenessFallbackProjection === true &&
      hasFreshProjectionLiveness(nodeRow, options)) {
    return true;
  }
  return shouldRetainTransportAlivePublishedNode(
    normalizedNode.nodeId,
    nodeRow,
    options,
  );
}

// CL-001 variant C instrumentation: for a node being trimmed from the projection,
// return WHICH retention-grace condition failed — but ONLY when the node is an
// already-published-baseline member (a trimmed baseline member is the variant-C
// regression; a non-baseline node is an ordinary, correct exclusion). null = not a
// baseline member (no attribution recorded). Mirrors the three conjuncts of
// shouldRetainTransportAlivePublishedNode so the next gate's seed-side diagnostics
// name the binding condition without a new observer-effect log.
function resolveTransportAliveRetentionMissReason(
  nodeId,
  nodeRow,
  runtimeTransportEvidence,
  options = {},
) {
  if (!isPublishedBaselineMember(nodeId, options)) {
    return null;
  }
  if (runtimeTransportEvidence !== true) {
    return 'no_runtime_transport_evidence';
  }
  if (!hasFreshReadyLeaseOrHeartbeat(nodeRow, options)) {
    return 'stale_lease_and_heartbeat';
  }
  // Both grace conjuncts held yet the node was still excluded — the grace path was
  // not consulted on this trim (e.g. the strict-mode gating upstream). Flag it so a
  // genuinely anomalous trim is not silently attributed to staleness.
  return 'grace_conditions_met_but_excluded';
}

const SWIM_VERDICT_ALIVE = 'alive';

// Increment 4 asymmetric consumption: a SWIM `alive` verdict PROTECTS a node from a
// false readiness/liveness-grace trim (the Lifeguard benefit). It deliberately does NOT
// relax the status / member-state checks, so draining/retired/genuinely-down nodes are
// still trimmed; and SWIM `dead`/`suspect` has NO effect (the existing timeout path
// still removes dead nodes). Off unless options.membershipSwimConsumeEnabled === true.
function isSwimAliveProtected(nodeId, options = {}) {
  if (options.membershipSwimConsumeEnabled !== true) {
    return false;
  }
  const verdicts = options.swimVerdictByNodeId;
  if (!verdicts || typeof verdicts !== TYPEOF.OBJECT) {
    return false;
  }
  return verdicts[nodeId] === SWIM_VERDICT_ALIVE;
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
  const swimProtected = isSwimAliveProtected(normalizedNode.nodeId, options);
  if (readinessProjection.hasReadinessEvidence) {
    if (readinessProjection.projectionEligible !== true &&
        !allowLivenessFallbackProjection && !swimProtected) {
      return false;
    }
  } else {
    if ((!hasReadyConnection || !hasFreshLiveness) &&
        !allowLivenessFallbackProjection && !swimProtected) {
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
  const projectedByLivenessFallback =
    allowLivenessFallbackProjection === true;
  // A SWIM `alive` verdict (attested by peers via gossip/indirect probe) IS liveness
  // evidence and supersedes THIS node's local transport-evidence check — this is what
  // lets a rejoiner that cannot yet reach a peer keep it (the false-positive-trim fix).
  // Still asymmetric (only `alive` relaxes) and still after the status/member-state gate.
  if (
    !projectedByAuthorityConvergence &&
    !projectedByLivenessFallback &&
    !swimProtected
  ) {
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
  // CL-001 variant C instrumentation: when an already-published-baseline node is
  // trimmed despite the retention grace, attribute WHICH grace condition failed,
  // surfaced through this same diagnostics object (no perturbing per-node log).
  const retentionGraceMisses = [];
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
    const readinessOnlyProjectionEligible =
      options.allowControlPlaneRecoveryEligibleProjection === true &&
      readinessProjection.hasReadinessEvidence === true &&
      readinessProjection.projectionEligible === true;
    const allowLivenessFallbackProjection =
      shouldAllowLivenessFallbackProjection(
        nodeRow,
        readinessProjection,
        options,
      );
    const swimProtected = isSwimAliveProtected(nodeId, options);
    const runtimeTransportEvidence = hasRuntimeTransportEvidence(nodeId, {
      ...options,
      readinessByNodeId,
    });
    if (nodeRow) {
      if (readinessProjection.hasReadinessEvidence &&
          readinessProjection.projectionEligible !== true &&
          !allowLivenessFallbackProjection && !swimProtected) {
        readinessExcludedNodeIds.add(nodeId);
        if (readinessProjection.clusterMemberHealthyMissing) {
          clusterMemberUnhealthyExcludedNodeIds.add(nodeId);
        }
        const retentionMissReason = resolveTransportAliveRetentionMissReason(
          nodeId,
          nodeRow,
          runtimeTransportEvidence,
          options,
        );
        if (retentionMissReason) {
          retentionGraceMisses.push(
            Object.freeze({nodeId, reason: retentionMissReason}),
          );
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
        !runtimeTransportEvidence &&
        readinessOnlyProjectionEligible !== true) {
      continue;
    }
    if (!hasCanonicalActiveService(nodeId, options.serviceRows) &&
        !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows) &&
        !runtimeTransportEvidence &&
        readinessOnlyProjectionEligible !== true) {
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
    retentionGraceMisses: Object.freeze(
      [...retentionGraceMisses].sort((a, b) =>
        a.nodeId.localeCompare(b.nodeId)),
    ),
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
      retentionGraceMisses: Object.freeze([
        ...(projectedActiveNodeSelection.retentionGraceMisses || []),
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
  ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE,
  buildActiveMembershipSnapshot,
  buildMembershipPublicationActiveSnapshot,
  resolveActiveNodeViews,
  buildReadinessByNodeId,
  hasCanonicalActiveService,
  hasFreshReadyLeaseOrHeartbeat,
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
