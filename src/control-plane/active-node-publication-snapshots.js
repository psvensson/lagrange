import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from './control-plane-publication-merge.js';
import {
  NODE_PARTICIPATION_ADMISSION_STATE,
  isNodeRuntimeParticipationBlocked,
  normalizeNodeParticipationAdmissionState,
} from './membership-lifecycle-constants.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';
import {
  normalizeControlPlanePublicationRow,
} from './system-row-normalizers.js';
import {
  normalizeNodeIdList,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePendingAckEvidenceState,
  normalizeStringList,
} from './active-node-projection-normalizers.js';

const LOCAL_STR_UPDATEDAT = 'updatedAt';
const LOCAL_STR_UPDATED_AT = 'updated_at';

const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE = Object.freeze({
  PUBLISHED_MEMBERSHIP: 'published_membership',
  LOCALLY_ELIGIBLE_PROJECTION: 'locally_eligible_projection',
  PROJECTED_SERVING: 'projected_serving_projection',
  RECOVERY_ELIGIBLE_PROJECTION: 'recovery_eligible_projection',
  NONE: 'none',
});

function resolveParticipationByNodeId(publicationConvergence = null) {
  if (!publicationConvergence || typeof publicationConvergence !== 'object') {
    return {};
  }
  if (publicationConvergence.participationByNodeId &&
      typeof publicationConvergence.participationByNodeId === 'object') {
    return publicationConvergence.participationByNodeId;
  }
  if (publicationConvergence.membershipLifecycleSummary?.participationByNodeId &&
      typeof publicationConvergence.membershipLifecycleSummary.participationByNodeId ===
        'object') {
    return publicationConvergence.membershipLifecycleSummary.participationByNodeId;
  }
  return {};
}

function resolveAdmissionBlockedNodeIds(publicationConvergence = null) {
  const participationByNodeId = resolveParticipationByNodeId(publicationConvergence);
  const blockedNodeIds = Object.values(participationByNodeId)
    .filter((participation) =>
      isNodeRuntimeParticipationBlocked({participation}),
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

function resolveProjectionDiagnostics(publicationConvergence = null) {
  const normalizedPublicationConvergence =
    publicationConvergence &&
      typeof publicationConvergence === 'object' ?
      publicationConvergence :
      {};
  const membershipLifecycleSummary =
    normalizedPublicationConvergence.membershipLifecycleSummary &&
      typeof normalizedPublicationConvergence.membershipLifecycleSummary ===
        'object' ?
      normalizedPublicationConvergence.membershipLifecycleSummary :
      null;
  return normalizedPublicationConvergence.projectionDiagnostics &&
    typeof normalizedPublicationConvergence.projectionDiagnostics ===
      'object' ?
    normalizedPublicationConvergence.projectionDiagnostics :
    membershipLifecycleSummary?.projectionDiagnostics &&
      typeof membershipLifecycleSummary.projectionDiagnostics ===
        'object' ?
      membershipLifecycleSummary.projectionDiagnostics :
      null;
}

function resolveReadinessExcludedNodeIds(publicationConvergence = null) {
  const projectionDiagnostics = resolveProjectionDiagnostics(publicationConvergence);
  return normalizeNodeIdList([
    ...(Array.isArray(projectionDiagnostics?.readinessExcludedNodeIds) ?
      projectionDiagnostics.readinessExcludedNodeIds :
      []),
    ...(Array.isArray(
      projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds,
    ) ?
      projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds :
      []),
  ]);
}

function excludeUnavailableNodeIds(nodeIds = [], unavailableNodeIds = new Set()) {
  return normalizeNodeIdList(
    normalizeNodeIdList(nodeIds).filter((nodeId) =>
      !unavailableNodeIds.has(nodeId),
    ),
  );
}

// CL-001 / cp-pub-01 (regression 8f5bc72a): the published-baseline FLOOR. A
// baseline node trimmed by readiness-exclusion is only safe to re-admit into the
// published active set when BOTH liveness conjuncts held (process+transport alive
// with a fresh lease) yet strict-mode upstream still excluded it — i.e. the
// projection recorded reason `grace_conditions_met_but_excluded`. A baseline node
// excluded because it is genuinely transport-dead (`no_runtime_transport_evidence`)
// or stale (`stale_lease_and_heartbeat`) must NOT be floored: keeping a dead node
// in the published set inflates the remove-safety denominator (the dangerous
// direction). Trimming a live node is merely a liveness stall (safe direction).
function resolveGraceFlooredBaselineNodeIds(publicationConvergence = null) {
  const projectionDiagnostics = resolveProjectionDiagnostics(publicationConvergence);
  const retentionGraceMisses = Array.isArray(
    projectionDiagnostics?.retentionGraceMisses,
  ) ?
    projectionDiagnostics.retentionGraceMisses :
    [];
  return normalizeNodeIdList(
    retentionGraceMisses
      .filter((miss) =>
        miss &&
        typeof miss === 'object' &&
        miss.reason === 'grace_conditions_met_but_excluded',
      )
      .map((miss) => miss.nodeId),
  );
}

function readPublicationOrderingValue(row, keys = []) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function isMembershipPublicationRow(row) {
  const publicationKind = String(row?.publicationKind || '').toLowerCase();
  return publicationKind.length === 0 ||
    publicationKind === MEMBERSHIP_PUBLICATION_KIND;
}

function resolveLatestPublicationRow(options = {}) {
  const publicationRows = (Array.isArray(options.publicationRows) ?
    options.publicationRows :
    [])
    .filter((row) => row && typeof row === 'object')
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => isMembershipPublicationRow(row));
  const explicitPublicationRow =
    options.latestPublicationRow &&
      typeof options.latestPublicationRow === 'object' ?
      normalizeControlPlanePublicationRow(options.latestPublicationRow) :
      null;
  if (explicitPublicationRow &&
    isMembershipPublicationRow(explicitPublicationRow) && (
    explicitPublicationRow.publicationId ||
    explicitPublicationRow.publicationEpoch > 0 ||
    explicitPublicationRow.status
  )) {
    publicationRows.push(explicitPublicationRow);
  }
  if (publicationRows.length === 0) {
    return null;
  }

  publicationRows.sort((left, right) => {
    const publicationEpochDelta =
      readPublicationOrderingValue(right, ['publicationEpoch', 'publication_epoch']) -
      readPublicationOrderingValue(left, ['publicationEpoch', 'publication_epoch']);
    if (publicationEpochDelta !== 0) {
      return publicationEpochDelta;
    }
    const publishedAtDelta =
      readPublicationOrderingValue(right, ['publishedAt', 'published_at']) -
      readPublicationOrderingValue(left, ['publishedAt', 'published_at']);
    if (publishedAtDelta !== 0) {
      return publishedAtDelta;
    }
    return readPublicationOrderingValue(right, [LOCAL_STR_UPDATEDAT, LOCAL_STR_UPDATED_AT]) -
      readPublicationOrderingValue(left, [LOCAL_STR_UPDATEDAT, LOCAL_STR_UPDATED_AT]);
  });

  return publicationRows[0] || null;
}

function resolveLatestPublishedPublicationRow(options = {}) {
  const publicationRows = (Array.isArray(options.publicationRows) ?
    options.publicationRows :
    [])
    .filter((row) => row && typeof row === 'object')
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => isMembershipPublicationRow(row));
  const explicitPublishedPublicationRow =
    options.latestPublishedPublicationRow &&
      typeof options.latestPublishedPublicationRow === 'object' ?
      normalizeControlPlanePublicationRow(
        options.latestPublishedPublicationRow,
      ) :
      null;
  const explicitPublicationRow =
    options.latestPublicationRow &&
      typeof options.latestPublicationRow === 'object' ?
      normalizeControlPlanePublicationRow(options.latestPublicationRow) :
      null;
  if (explicitPublishedPublicationRow &&
    isMembershipPublicationRow(explicitPublishedPublicationRow) && (
    explicitPublishedPublicationRow.publicationId ||
    explicitPublishedPublicationRow.publicationEpoch > 0 ||
    explicitPublishedPublicationRow.status
  ) &&
    explicitPublishedPublicationRow.status ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED) {
    publicationRows.push(explicitPublishedPublicationRow);
  }
  if (explicitPublicationRow &&
    isMembershipPublicationRow(explicitPublicationRow) && (
    explicitPublicationRow.publicationId ||
    explicitPublicationRow.publicationEpoch > 0 ||
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
  if (publishedActiveNodeIds.length === 0) {
    return durablePublishedMembershipCandidate
      .publishedActiveNodeIdsPresent === true ?
      Object.freeze([]) :
      (options.requirePublishedMembership === true ?
        Object.freeze([]) :
        null);
  }
  return Object.freeze([...new Set(
    publishedActiveNodeIds.filter((nodeId) =>
      typeof nodeId === 'string' &&
      nodeId.length > 0,
    ),
  )].sort());
}

// CL-001 variant C re-admission: the retention grace's "is this an already-
// published member" test must NOT ratchet to the LATEST published row only.
// Otherwise a single transient trim drops the node from the baseline forever (the
// trimmed set becomes the new latest baseline) and the grace can never re-admit it
// once its heartbeat recovers — the binding cause of the sticky variant-C trim.
// Union the published active-node sets across the recent published epochs (a
// bounded window of the latest published epoch) so a node trimmed in epoch N is
// still a baseline member via epoch N-1. A node absent from ALL recent published
// rows (a genuinely new node) is still excluded, and the grace's own liveness
// conjuncts (status=active + transport + fresh lease/heartbeat) still gate it — so
// this only un-ratchets re-admission, it never promotes a new or removed node.
// Returns a SUPERSET of resolvePublishedActiveNodeIds (never a regression).
const RETENTION_BASELINE_EPOCH_WINDOW = 4;

function resolveRecentlyPublishedActiveNodeIds(options = {}) {
  // Forces requirePublishedMembership:false to match the sole caller
  // (isPublishedBaselineMember), which always asks for a presence test, not a
  // required-membership assertion; callers needing the latter must keep using
  // resolvePublishedActiveNodeIds directly.
  const latestBaseline = resolvePublishedActiveNodeIds({
    ...options,
    requirePublishedMembership: false,
  });
  const publishedRows = (Array.isArray(options.publicationRows) ?
    options.publicationRows :
    [])
    .filter((row) => row && typeof row === 'object')
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => isMembershipPublicationRow(row))
    .filter((row) =>
      row?.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED);
  const unionedNodeIds = new Set(latestBaseline || []);
  if (publishedRows.length > 0) {
    const latestEpoch = publishedRows.reduce(
      (max, row) => Math.max(max, Number(row.publicationEpoch) || 0),
      0,
    );
    const windowFloor = latestEpoch - RETENTION_BASELINE_EPOCH_WINDOW;
    for (const row of publishedRows) {
      if ((Number(row.publicationEpoch) || 0) < windowFloor) {
        continue;
      }
      const ids = Array.isArray(row.publishedActiveNodeIds) ?
        row.publishedActiveNodeIds :
        [];
      for (const nodeId of ids) {
        if (typeof nodeId === 'string' && nodeId.length > 0) {
          unionedNodeIds.add(nodeId);
        }
      }
    }
  }
  if (unionedNodeIds.size === 0) {
    return latestBaseline === null ? null : Object.freeze([]);
  }
  return Object.freeze([...unionedNodeIds].sort());
}

function resolvePriorityRecoveryActiveNodeCohort(publicationConvergence = null) {
  const normalizedPublicationConvergence =
    publicationConvergence &&
      typeof publicationConvergence === 'object' ?
      publicationConvergence :
      {};
  const membershipLifecycleSummary =
    normalizedPublicationConvergence.membershipLifecycleSummary &&
      typeof normalizedPublicationConvergence.membershipLifecycleSummary ===
        'object' ?
      normalizedPublicationConvergence.membershipLifecycleSummary :
      null;
  const projectionDiagnostics = resolveProjectionDiagnostics(
    normalizedPublicationConvergence,
  );
  const admissionBlockedNodeIdSet = new Set(
    resolveAdmissionBlockedNodeIds(normalizedPublicationConvergence),
  );
  const unavailableNodeIdSet = new Set([
    ...admissionBlockedNodeIdSet,
    ...resolveReadinessExcludedNodeIds(normalizedPublicationConvergence),
  ]);
  // The published baseline (the remove-safety denominator) applies the unavailable
  // set EXCEPT for grace-floored live nodes (cp-pub-01 regression fix). An
  // admission-blocked node is never floored even if it also has a grace miss.
  const graceFlooredBaselineNodeIdSet = new Set(
    resolveGraceFlooredBaselineNodeIds(normalizedPublicationConvergence),
  );
  const publishedBaselineUnavailableNodeIdSet = new Set(
    [...unavailableNodeIdSet].filter((nodeId) =>
      admissionBlockedNodeIdSet.has(nodeId) ||
      !graceFlooredBaselineNodeIdSet.has(nodeId),
    ),
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
  const missingPublishedRecoveryActiveNodeIds = normalizeNodeIdList([
    ...(Array.isArray(
      normalizedPublicationConvergence?.missingPublishedRecoveryActiveNodeIds,
    ) ?
      normalizedPublicationConvergence.missingPublishedRecoveryActiveNodeIds :
      []),
    ...(Array.isArray(
      membershipLifecycleSummary?.missingPublishedRecoveryActiveNodeIds,
    ) ?
      membershipLifecycleSummary.missingPublishedRecoveryActiveNodeIds :
      []),
  ]);
  const admittedPublishedActiveNodeIds = excludeUnavailableNodeIds(
    publishedActiveNodeIds,
    publishedBaselineUnavailableNodeIdSet,
  );
  const admittedProjectedServingNodeIds = excludeUnavailableNodeIds(
    projectedServingNodeIds,
    unavailableNodeIdSet,
  );
  const admittedLocallyEligibleNodeIds = excludeUnavailableNodeIds(
    locallyEligibleNodeIds,
    unavailableNodeIdSet,
  );
  const admittedRecoveryEligibleIncludedNodeIds = excludeUnavailableNodeIds(
    recoveryEligibleIncludedNodeIds,
    unavailableNodeIdSet,
  );
  const admittedLivenessFallbackIncludedNodeIds = excludeUnavailableNodeIds(
    livenessFallbackIncludedNodeIds,
    unavailableNodeIdSet,
  );
  const admittedExplicitRecoveryActiveNodeIds = excludeUnavailableNodeIds(
    explicitRecoveryActiveNodeIds,
    unavailableNodeIdSet,
  );
  const admittedMissingPublishedRecoveryActiveNodeIds =
    excludeUnavailableNodeIds(
      missingPublishedRecoveryActiveNodeIds,
      unavailableNodeIdSet,
    );
  const explicitRecoveryActiveNodeSource =
    typeof normalizedPublicationConvergence?.recoveryActiveNodeSource ===
      'string' &&
      normalizedPublicationConvergence.recoveryActiveNodeSource.trim()
        .length > 0 ?
      normalizedPublicationConvergence.recoveryActiveNodeSource.trim() :
      (typeof membershipLifecycleSummary?.recoveryActiveNodeSource ===
        'string' &&
        membershipLifecycleSummary.recoveryActiveNodeSource.trim().length >
          0 ?
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
    projectionNodeIds.length > 0 && (
      admittedPublishedActiveNodeIds.length === 0 ||
      projectionAddsNodes ||
      admittedRecoveryEligibleIncludedNodeIds.length > 0 ||
      admittedLivenessFallbackIncludedNodeIds.length > 0
    );
  const buildProjectionCohortNodeIds = (candidateNodeIds) =>
    normalizeNodeIdList([
      ...admittedPublishedActiveNodeIds,
      ...candidateNodeIds,
    ]);

  let activeNodeIds = [];
  let source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.NONE;
  if (shouldUseProjectionCohort && admittedLocallyEligibleNodeIds.length > 0) {
    activeNodeIds = buildProjectionCohortNodeIds(admittedLocallyEligibleNodeIds);
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION;
  } else if (
    shouldUseProjectionCohort && admittedProjectedServingNodeIds.length > 0
  ) {
    activeNodeIds = buildProjectionCohortNodeIds(admittedProjectedServingNodeIds);
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.PROJECTED_SERVING;
  } else if (
    shouldUseProjectionCohort &&
    admittedRecoveryEligibleIncludedNodeIds.length > 0
  ) {
    activeNodeIds = buildProjectionCohortNodeIds(
      admittedRecoveryEligibleIncludedNodeIds,
    );
    source =
      ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.RECOVERY_ELIGIBLE_PROJECTION;
  } else if (admittedPublishedActiveNodeIds.length > 0) {
    activeNodeIds = admittedPublishedActiveNodeIds;
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.PUBLISHED_MEMBERSHIP;
  } else if (admittedLocallyEligibleNodeIds.length > 0) {
    activeNodeIds = admittedLocallyEligibleNodeIds;
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION;
  } else if (admittedProjectedServingNodeIds.length > 0) {
    activeNodeIds = admittedProjectedServingNodeIds;
    source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.PROJECTED_SERVING;
  } else if (admittedRecoveryEligibleIncludedNodeIds.length > 0) {
    activeNodeIds = admittedRecoveryEligibleIncludedNodeIds;
    source =
      ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.RECOVERY_ELIGIBLE_PROJECTION;
  }

  if (admittedExplicitRecoveryActiveNodeIds.length > 0) {
    activeNodeIds = normalizeNodeIdList([
      ...activeNodeIds,
      ...admittedExplicitRecoveryActiveNodeIds,
    ]);
    if (source === ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.NONE) {
      source = explicitRecoveryActiveNodeSource ||
        ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION;
    }
  }
  if (admittedMissingPublishedRecoveryActiveNodeIds.length > 0) {
    activeNodeIds = normalizeNodeIdList([
      ...activeNodeIds,
      ...admittedPublishedActiveNodeIds,
      ...admittedMissingPublishedRecoveryActiveNodeIds,
    ]);
    if (source === ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.NONE) {
      source =
        ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.RECOVERY_ELIGIBLE_PROJECTION;
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
      typeof publicationConvergence === 'object' ?
      publicationConvergence :
      {};
  const projectionDiagnostics = resolveProjectionDiagnostics(
    normalizedPublicationConvergence,
  );
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
      projectionDiagnostics && typeof projectionDiagnostics === 'object' ?
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
  if (!membershipPublication || typeof membershipPublication !== 'object') {
    return null;
  }

  const normalizedPublication =
    normalizeControlPlanePublicationRow(membershipPublication);
  const membershipLifecycleSummary =
    normalizedPublication.membershipLifecycleSummary &&
      typeof normalizedPublication.membershipLifecycleSummary ===
        'object' ?
      Object.freeze({...normalizedPublication.membershipLifecycleSummary}) :
      null;
  const projectionDiagnostics =
    membershipLifecycleSummary?.projectionDiagnostics &&
      typeof membershipLifecycleSummary.projectionDiagnostics ===
        'object' ?
      Object.freeze({...membershipLifecycleSummary.projectionDiagnostics}) :
      null;
  const publicationStatus =
    typeof membershipPublication.status === 'string' ?
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
      ) === 'object' ?
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
          'object' ?
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
  resolveLatestPublicationRow,
  resolveLatestPublishedPublicationRow,
  resolvePriorityRecoveryActiveNodeCohort,
  resolvePublishedActiveNodeIds,
  resolveRecentlyPublishedActiveNodeIds,
};
