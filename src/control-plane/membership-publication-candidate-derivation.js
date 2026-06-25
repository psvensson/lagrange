import {NUM, TYPEOF} from '../constants/index.js';
import {
  buildActiveMembershipSnapshot,
  resolveActiveNodeViews,
  resolvePriorityRecoveryActiveNodeCohort,
} from './active-node-projection.js';
import {
  MEMBERSHIP_LIFECYCLE_STATE,
  buildMembershipLifecycleSummary,
} from './membership-lifecycle-constants.js';
import {
  normalizeControlPlanePublicationRow,
  normalizeNodeRow,
} from './system-row-normalizers.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from './control-plane-publication-merge.js';
import {hasPriorityRecoverySpreadGap} from './priority-recovery-snapshot.js';
import {buildRecoveryProtocolSnapshot} from './recovery-protocol-snapshot.js';
import {
  buildMembershipEpochFence,
  buildMembershipEpochSnapshot,
} from './membership-epoch-contract.js';
import {
  areMembershipLifecycleSummariesEqual,
  buildProjectionDiagnosticsSummary,
  buildPublishedMemberStates,
  chooseMembershipLifecycleSummaryBase,
  hasPublishedMembershipAuthoritativeRefreshDebt,
} from './membership-publication-lifecycle-summary.js';
import {
  buildPriorityRecoveryClosureEvidence,
  buildPublicationPlanningReadinessByNodeId,
} from './membership-publication-readiness-repair.js';
import {
  PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
  arePriorityPartitionSummariesEqual,
  buildDerivedPriorityPartitionSummary,
  chooseMoreAdvancedPriorityPartitionSummary,
  isReadinessPromotable,
  normalizePriorityPartitionSummary,
} from './membership-publication-priority-partition-summary.js';
import {
  buildMembershipPublicationAckCompletionSnapshot,
  buildMembershipPublicationRecoveryCohortSnapshot,
  buildMembershipPublicationTargetSnapshot,
  buildPublicationAckProjectionDiagnostics,
  buildPublicationAckTargetSnapshot,
  hasRecoveryEligiblePublicationRepairEvidence,
  resolveMembershipPublicationAcknowledgedNodeIds,
} from './membership-publication-target-selection.js';

const MEMBERSHIP_PUBLICATION_STATUS = CONTROL_PLANE_PUBLICATION_STATUS;
const AUTHORITATIVE_MEMBERSHIP_CHANGED_REASON = 'authoritative_membership_changed';

function buildPublicationMetadataRefreshRow(options = {}, helperFns = {}) {
  const publicationRow = options.publicationRow;
  if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
    return publicationRow;
  }
  const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
  const acknowledgedNodeIds = Array.isArray(options.acknowledgedNodeIds) ?
    helperFns.normalizeNodeIdList(options.acknowledgedNodeIds) :
    normalizedPublication.acknowledgedNodeIds;
  const priorityPartitionSummary = normalizePriorityPartitionSummary(
    options.priorityPartitionSummary ?? normalizedPublication.priorityPartitionSummary,
    {},
    helperFns,
  );
  const membershipLifecycleSummary =
    options.membershipLifecycleSummary &&
    typeof options.membershipLifecycleSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(options.membershipLifecycleSummary) :
      normalizedPublication.membershipLifecycleSummary &&
          typeof normalizedPublication.membershipLifecycleSummary === TYPEOF.OBJECT ?
        buildMembershipLifecycleSummary(normalizedPublication.membershipLifecycleSummary) :
        null;
  return {
    ...publicationRow,
    acknowledged_node_ids: acknowledgedNodeIds,
    acknowledgedNodeIds,
    priority_partition_summary: priorityPartitionSummary,
    priorityPartitionSummary,
    membership_lifecycle_summary: membershipLifecycleSummary,
    membershipLifecycleSummary,
    updated_at: helperFns.normalizePositiveInteger(options.nowMs, Date.now()),
    transition_history: Array.isArray(publicationRow.transition_history) ?
      publicationRow.transition_history :
      normalizedPublication.transitionHistory,
  };
}

function shouldAllowRecoveryEligibleProjection(options = {}, helperFns = {}) {
  const latestPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublicationRow,
  );
  const latestPublishedPublicationRow = helperFns.normalizeLatestPublicationRow(
    options.latestPublishedPublicationRow,
  );
  const latestVisiblePublicationRow = latestPublicationRow || latestPublishedPublicationRow;
  const latestPublicationStatus = String(latestVisiblePublicationRow?.status || '').toUpperCase();
  if (
    !latestVisiblePublicationRow ||
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
  ) {
    return false;
  }
  if (latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
    return true;
  }
  const prioritySpreadGapPending = hasPriorityRecoverySpreadGap(
    latestPublicationRow?.priorityPartitionSummary ||
      latestPublishedPublicationRow?.priorityPartitionSummary,
  );
  if (prioritySpreadGapPending) {
    return true;
  }
  if (options.observedRecoveryProjectionGap === true) {
    return true;
  }
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(options.publishedBaselineNodeIds);
  if (publishedBaselineNodeIds.length === NUM.ZERO) {
    return false;
  }
  const defaultObservedNodeIds = helperFns.normalizeNodeIdList(
    helperFns.resolveObservedActiveNodeIds({
      ...options,
      readinessByNodeId: options.readinessByNodeId,
    }),
  );
  const recoveryEligibleObservedNodeIds = helperFns.normalizeNodeIdList(
    helperFns.resolveObservedActiveNodeIds({
      ...options,
      readinessByNodeId: options.readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: true,
    }),
  );
  return recoveryEligibleObservedNodeIds.some(
    (nodeId) =>
      !publishedBaselineNodeIds.includes(nodeId) &&
      !defaultObservedNodeIds.includes(nodeId) &&
      isReadinessPromotable(options.readinessByNodeId?.[nodeId] || null),
  );
}

function shouldPreferAuthoritativeMembershipState(options = {}, helperFns = {}) {
  if (options.preferAuthoritativeRead === true || options.requireAuthoritative === true) {
    return true;
  }
  const publicationRows = [
    helperFns.normalizeLatestPublicationRow(options.latestPublicationRow),
    helperFns.normalizeLatestPublicationRow(options.latestPublishedPublicationRow),
  ];
  return publicationRows.some((row) => {
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return false;
    }
    const publicationStatus = String(row.status || '').toUpperCase();
    if (publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED) {
      return (
        hasPriorityRecoverySpreadGap(row.priorityPartitionSummary) ||
        hasPublishedMembershipAuthoritativeRefreshDebt(row, helperFns)
      );
    }
    if (
      publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
      publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
    ) {
      return false;
    }
    return (
      row.publishedActiveNodeIdsPresent === true ||
      (Array.isArray(row.publishedActiveNodeIds) && row.publishedActiveNodeIds.length > NUM.ZERO) ||
      (Array.isArray(row.requiredAckNodeIds) && row.requiredAckNodeIds.length > NUM.ZERO) ||
      (Array.isArray(row.acknowledgedNodeIds) && row.acknowledgedNodeIds.length > NUM.ZERO)
    );
  });
}

function resolveCandidatePublicationStatus(options = {}) {
  if (options.ackCompletionSnapshot?.complete === true) {
    return MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
  }
  if (options.changed === true) {
    return MEMBERSHIP_PUBLICATION_STATUS.OPEN;
  }
  return String(
    options.latestPublicationRow?.status || MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
  ).toUpperCase();
}

function resolveCandidatePublicationLifecycleState(publicationStatus) {
  return publicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE :
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING;
}

function deriveMembershipPublicationCandidate(options = {}, helperFns = {}) {
  const planningSnapshot =
    options.planningSnapshot && typeof options.planningSnapshot === TYPEOF.OBJECT ?
      options.planningSnapshot :
      helperFns.buildMembershipPublicationEvidenceSnapshot(options);
  const latestPublicationRow = helperFns.normalizeLatestPublicationRow(
    planningSnapshot.latestPublicationRow,
  );
  const latestPublishedPublicationRow = helperFns.normalizeLatestPublicationRow(
    planningSnapshot.latestPublishedPublicationRow,
  );
  const latestPublicationStatus = String(latestPublicationRow?.status || '').toUpperCase();
  const carryForwardLatestPublicationBaseline =
    latestPublicationRow &&
    latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.ABANDONED &&
    latestPublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED &&
    Array.isArray(latestPublicationRow.publishedActiveNodeIds) &&
    latestPublicationRow.publishedActiveNodeIds.length > NUM.ZERO;
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(
    carryForwardLatestPublicationBaseline ?
      latestPublicationRow.publishedActiveNodeIds :
      latestPublishedPublicationRow?.publishedActiveNodeIds,
  );
  const readinessByNodeId = buildPublicationPlanningReadinessByNodeId({
    readinessByNodeId: planningSnapshot.readinessByNodeId,
    readinessEntries: planningSnapshot.readinessEntries,
  });
  const observedRecoveryProjectionNodeIds = helperFns.normalizeNodeIdList(
    helperFns.resolveObservedActiveNodeIds({
      ...planningSnapshot,
      readinessByNodeId,
      allowControlPlaneRecoveryEligibleProjection: true,
      allowLivenessFallbackProjection: true,
    }),
  );
  const observedRecoveryProjectionGap = observedRecoveryProjectionNodeIds.some(
    (nodeId) => !publishedBaselineNodeIds.includes(nodeId),
  );
  const allowRecoveryEligibleProjection = shouldAllowRecoveryEligibleProjection(
    {
      ...options,
      latestPublicationRow,
      publishedBaselineNodeIds,
      readinessByNodeId,
      observedRecoveryProjectionGap,
    },
    helperFns,
  );
  const priorityRecoverySpreadGapPending = hasPriorityRecoverySpreadGap(
    latestPublicationRow?.priorityPartitionSummary ||
      latestPublishedPublicationRow?.priorityPartitionSummary,
  );
  const allowPrioritySpreadLivenessFallbackProjection =
    allowRecoveryEligibleProjection &&
    (priorityRecoverySpreadGapPending || observedRecoveryProjectionGap);
  const activeNodeViews = resolveActiveNodeViews({
    ...planningSnapshot,
    publicationRows:
      publishedBaselineNodeIds.length > 0 ?
        [
          {
            publication_epoch:
                latestPublishedPublicationRow?.publicationEpoch ||
                latestPublicationRow?.publicationEpoch ||
                NUM.ONE,
            status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
            published_active_node_ids: publishedBaselineNodeIds,
          },
        ] :
        [],
    latestPublicationRow:
      publishedBaselineNodeIds.length > 0 ?
        {
          publication_epoch:
              latestPublishedPublicationRow?.publicationEpoch ||
              latestPublicationRow?.publicationEpoch ||
              NUM.ONE,
          status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
          published_active_node_ids: publishedBaselineNodeIds,
        } :
        null,
    readinessByNodeId,
    allowControlPlaneRecoveryEligibleProjection: allowRecoveryEligibleProjection,
    allowLivenessFallbackProjection: allowPrioritySpreadLivenessFallbackProjection,
    // Increment 4: asymmetric SWIM consumption. Off unless the coordinator passed a
    // consume flag + verdict (default-off); a no-op at quiescence (all alive).
    membershipSwimConsumeEnabled: options.membershipSwimConsumeEnabled === true,
    swimVerdictByNodeId:
      options.swimVerdictByNodeId &&
      typeof options.swimVerdictByNodeId === TYPEOF.OBJECT ?
        options.swimVerdictByNodeId :
        null,
  });
  const initialProjectionDiagnostics =
    buildProjectionDiagnosticsSummary(activeNodeViews, helperFns);
  const projectedServingNodeIds = helperFns.normalizeNodeIdList(
    activeNodeViews.projectedServingNodeIds || activeNodeViews.projectedActiveNodeIds,
  );
  const locallyEligibleNodeIds = helperFns.normalizeNodeIdList(
    activeNodeViews.locallyEligibleNodeIds || projectedServingNodeIds,
  );
  const recoveryActiveNodeCohort = resolvePriorityRecoveryActiveNodeCohort({
    publishedActiveNodeIds: publishedBaselineNodeIds,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState,
    admissionReasonCodes: planningSnapshot.admissionReasonCodes,
    clusterIncarnationFence: planningSnapshot.clusterIncarnationFence,
    membershipLifecycleSummary: {
      publishedActiveNodeIds: publishedBaselineNodeIds,
      projectedServingNodeIds,
      locallyEligibleNodeIds,
      projectionDiagnostics: initialProjectionDiagnostics,
      participationByNodeId:
        planningSnapshot.membershipLifecycleSummary?.participationByNodeId,
    },
  });
  const publicationAckTargetSnapshot = buildPublicationAckTargetSnapshot(
    {
      publishedBaselineNodeIds,
      recoveryActiveNodeIds: recoveryActiveNodeCohort.activeNodeIds,
      recoveryEligibleIncludedNodeIds:
        initialProjectionDiagnostics?.recoveryEligibleIncludedNodeIds,
      readinessByNodeId,
    },
    helperFns,
  );
  const projectionDiagnostics = buildPublicationAckProjectionDiagnostics(
    initialProjectionDiagnostics,
    publicationAckTargetSnapshot,
  );
  const publicationProjectedServingNodeIds = helperFns.normalizeNodeIdList(
    projectedServingNodeIds.filter((nodeId) =>
      !publicationAckTargetSnapshot.deferredNodeIds.includes(nodeId),
    ),
  );
  const publicationLocallyEligibleNodeIds = helperFns.normalizeNodeIdList(
    locallyEligibleNodeIds.filter((nodeId) =>
      !publicationAckTargetSnapshot.deferredNodeIds.includes(nodeId),
    ),
  );
  const recoveryEpochByNodeId = helperFns.buildLatestRecoveryEpochByNodeId(
    options.recoveryEpochsByNodeId,
  );
  const observedActiveNodeIds = helperFns.resolveObservedActiveNodeIds({
    ...planningSnapshot,
    readinessByNodeId,
  });
  const publicationWideningProjection = publicationProjectedServingNodeIds.some(
    (nodeId) => !publishedBaselineNodeIds.includes(nodeId),
  );
  const publicationProjectionNodeRowIds = new Set(
    planningSnapshot.nodeRows
      .map((nodeRow) => normalizeNodeRow(nodeRow).nodeId)
      .filter((nodeId) => nodeId.length > NUM.ZERO),
  );
  const publicationWideningHasNodeRowEvidence =
    publicationProjectedServingNodeIds.some(
      (nodeId) =>
        !publishedBaselineNodeIds.includes(nodeId) &&
        publicationProjectionNodeRowIds.has(nodeId),
    );
  const recoveryEligiblePublicationRepairEvidence =
    hasRecoveryEligiblePublicationRepairEvidence(
      {
        publishedBaselineNodeIds,
        publishableRecoveryActiveNodeIds:
          publicationAckTargetSnapshot.publishableRecoveryActiveNodeIds,
        readinessByNodeId,
      },
      helperFns,
    );
  const retainPublishedDurableTarget =
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED &&
    priorityRecoverySpreadGapPending !== true &&
    publicationWideningProjection === true &&
    publicationWideningHasNodeRowEvidence !== true &&
    recoveryEligiblePublicationRepairEvidence !== true;
  const publicationTargetSnapshot = buildMembershipPublicationTargetSnapshot(
    {
      explicitPublishedNodeIds:
        Array.isArray(planningSnapshot.publishedActiveNodeIds) ?
          planningSnapshot.publishedActiveNodeIds :
          retainPublishedDurableTarget === true ?
            publishedBaselineNodeIds :
            [],
      publishedBaselineNodeIds,
      projectedServingNodeIds: publicationProjectedServingNodeIds,
      recoveryActiveNodeIds:
        publicationAckTargetSnapshot.publishableRecoveryActiveNodeIds,
      observedActiveNodeIds,
      priorityRecoverySpreadGapPending,
      observedRecoveryProjectionGap,
      membershipFreezeActive: activeNodeViews.membershipFreeze?.active === true,
    },
    helperFns,
  );
  const publishedActiveNodeIds = helperFns.normalizeNodeIdList(
    publicationTargetSnapshot.nodeIds,
  );
  // FD-upgrade (cutover §5 step 3): expose the minimal inputs the SWIM detector's
  // active-set rule needs so the coordinator can emit a SWIM-vs-projection
  // divergence, WITHOUT threading a service handle into this pure function (it
  // gets data only; the verdict is read coordinator-side).
  // Data-only packaging of already-computed values — no behavior change.
  const membershipSwimInputs = {
    projectionNodeIds: publishedActiveNodeIds,
    publishedBaselineNodeIds,
    memberStatesByNodeId:
      planningSnapshot.membershipLifecycleSummary?.memberStatesByNodeId || null,
    membershipFreezeActive: activeNodeViews.membershipFreeze?.active === true,
  };
  const publicationRecoveryCohortSnapshot =
    buildMembershipPublicationRecoveryCohortSnapshot(
      {
        publicationTargetSnapshot,
        publishedActiveNodeIds,
        recoveryActiveNodeIds:
          publicationAckTargetSnapshot.publishableRecoveryActiveNodeIds,
        recoveryActiveNodeSource: recoveryActiveNodeCohort.source,
      },
      helperFns,
    );
  const priorityRecoveryPublicationContext = buildActiveMembershipSnapshot({
    publishedActiveNodeIds,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState,
    admissionReasonCodes: planningSnapshot.admissionReasonCodes,
    clusterIncarnationFence: planningSnapshot.clusterIncarnationFence,
    membershipLifecycleSummary: {
      publishedActiveNodeIds,
      projectedServingNodeIds: publicationProjectedServingNodeIds,
      locallyEligibleNodeIds: publicationLocallyEligibleNodeIds,
      projectionDiagnostics,
    },
    recoveryActiveNodeIds: publicationRecoveryCohortSnapshot.activeNodeIds,
    recoveryActiveNodeSource: publicationRecoveryCohortSnapshot.source,
  });
  const requiredAckNodeIds = helperFns.normalizeNodeIdList(
    Array.isArray(planningSnapshot.requiredAckNodeIds) ?
      planningSnapshot.requiredAckNodeIds :
      publishedActiveNodeIds,
  );
  const sourceTopologyEpoch = helperFns.normalizePositiveInteger(
    planningSnapshot.sourceTopologyEpoch,
    null,
  );
  const sourceSnapshotVersion = helperFns.normalizePositiveInteger(
    planningSnapshot.sourceSnapshotVersion,
    null,
  );
  const baselineEpoch = helperFns.normalizePositiveInteger(
    latestPublicationRow?.publicationEpoch,
    NUM.ZERO,
  );
  const changed =
    !latestPublicationRow ||
    !helperFns.listEquals(latestPublicationRow.publishedActiveNodeIds, publishedActiveNodeIds) ||
    helperFns.didOptionalSourceVersionChange(
      latestPublicationRow.sourceTopologyEpoch,
      sourceTopologyEpoch,
    ) ||
    helperFns.didOptionalSourceVersionChange(
      latestPublicationRow.sourceSnapshotVersion,
      sourceSnapshotVersion,
    );
  const acknowledgedNodeIds = resolveMembershipPublicationAcknowledgedNodeIds(
    {
      latestPublicationRow,
      latestPublishedPublicationRow,
      requiredAckNodeIds,
      planningAcknowledgedNodeIds: planningSnapshot.acknowledgedNodeIds,
      publishableRecoveryActiveNodeIds:
        publicationAckTargetSnapshot.publishableRecoveryActiveNodeIds,
      publicationChanged: changed,
    },
    helperFns,
  );
  const ackCompletionSnapshot = buildMembershipPublicationAckCompletionSnapshot(
    {
      requiredAckNodeIds,
      acknowledgedNodeIds,
    },
    helperFns,
  );
  const candidatePublicationEpoch =
    changed ?
      baselineEpoch + NUM.ONE :
      Math.max(baselineEpoch, NUM.ONE);
  const membershipEpochSnapshot =
    planningSnapshot.membershipEpochSnapshot &&
    typeof planningSnapshot.membershipEpochSnapshot === TYPEOF.OBJECT ?
      planningSnapshot.membershipEpochSnapshot :
      buildMembershipEpochSnapshot({
        latestPublicationRow,
        latestPublishedPublicationRow,
        sourceTopologyEpoch,
        sourceSnapshotVersion,
      });
  const membershipEpochFence = buildMembershipEpochFence({
    membershipEpochSnapshot,
    publicationEpoch: candidatePublicationEpoch,
  });
  const candidatePublicationStatus = resolveCandidatePublicationStatus({
    changed,
    latestPublicationRow,
    ackCompletionSnapshot,
  });
  const candidateLifecycleState = resolveCandidatePublicationLifecycleState(
    candidatePublicationStatus,
  );
  const durablePublishedActiveNodeIds =
    candidatePublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
      publishedActiveNodeIds :
      publishedBaselineNodeIds;
  const normalizedPriorityPartitionSummary = normalizePriorityPartitionSummary(
    planningSnapshot.priorityPartitionSummary ||
      planningSnapshot.priorityRecoveryPlanningSnapshot?.priorityPartitionSummary,
    {
      requiredDistinctNodeCount: Math.min(
        PRIORITY_SPREAD_REQUIRED_DISTINCT_NODE_COUNT,
        publicationLocallyEligibleNodeIds.length,
      ),
      readyEligibleNodeCount: publicationLocallyEligibleNodeIds.length,
    },
    helperFns,
  );
  const derivedPriorityPartitionSummary = buildDerivedPriorityPartitionSummary(
    {
      serviceRows: planningSnapshot.serviceRows,
      partitionRows: planningSnapshot.partitionRows,
      readinessByNodeId,
      projectedServingNodeIds: publicationProjectedServingNodeIds,
      locallyEligibleNodeIds: publicationLocallyEligibleNodeIds,
      publishedActiveNodeIds,
    },
    helperFns,
  );
  const priorityPartitionSummaryBase = chooseMoreAdvancedPriorityPartitionSummary(
    normalizedPriorityPartitionSummary,
    derivedPriorityPartitionSummary,
    helperFns,
  );
  const reasonCode =
    typeof planningSnapshot.reasonCode === TYPEOF.STRING && planningSnapshot.reasonCode.length > 0 ?
      planningSnapshot.reasonCode :
      AUTHORITATIVE_MEMBERSHIP_CHANGED_REASON;
  const derivedMembershipLifecycleSummaryBase = buildMembershipLifecycleSummary({
    lifecycleState: candidateLifecycleState,
    publishedActiveNodeIds,
    projectedServingNodeIds,
    locallyEligibleNodeIds: publicationLocallyEligibleNodeIds,
    suspectedOrTransitioningNodeIds: activeNodeViews.suspectedOrTransitioningNodeIds,
    memberStatesByNodeId: buildPublishedMemberStates(
      {
        publishedBaselineNodeIds,
        desiredPublishedNodeIds: publishedActiveNodeIds,
        projectedServingNodeIds,
        suspectedOrTransitioningNodeIds: activeNodeViews.suspectedOrTransitioningNodeIds,
        recoveryEpochByNodeId,
      },
      helperFns,
    ),
    recoveryEpochByNodeId: Object.keys(recoveryEpochByNodeId).reduce(
      (accumulator, nodeId) => {
        accumulator[nodeId] = recoveryEpochByNodeId[nodeId].epochId;
        return accumulator;
      },
      {},
    ),
    membershipFreeze: activeNodeViews.membershipFreeze,
    projectionDiagnostics,
    recoveryActiveNodeIds: priorityRecoveryPublicationContext.recoveryActiveNodeIds,
    recoveryActiveNodeSource: priorityRecoveryPublicationContext.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds:
      priorityRecoveryPublicationContext.missingPublishedRecoveryActiveNodeIds,
  });
  const membershipLifecycleSummaryBase = chooseMembershipLifecycleSummaryBase(
    planningSnapshot.membershipLifecycleSummary,
    derivedMembershipLifecycleSummaryBase,
    helperFns,
  );
  const pendingAckNodeIds = ackCompletionSnapshot.pendingAckNodeIds;
  const {
    priorityRecoveryClosureWitness,
    priorityRecoveryDecisionSnapshots,
  } = buildPriorityRecoveryClosureEvidence(
    {
      latestPublicationRow,
      latestPublishedPublicationRow,
      publishedActiveNodeIds,
      pendingAckNodeIds,
      priorityPartitionSummary: priorityPartitionSummaryBase,
      membershipLifecycleSummary: membershipLifecycleSummaryBase,
      recoveryActiveNodeIds:
        priorityRecoveryPublicationContext.recoveryActiveNodeIds,
      recoveryActiveNodeSource:
        priorityRecoveryPublicationContext.recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds:
        priorityRecoveryPublicationContext.missingPublishedRecoveryActiveNodeIds,
      readinessByNodeId,
      replicaOperationRows: planningSnapshot.replicaOperationRows,
      serviceRows: planningSnapshot.serviceRows,
      priorityRecoveryPlanningSnapshot:
        planningSnapshot.priorityRecoveryPlanningSnapshot,
      nowMs: options.nowMs,
    },
    helperFns,
  );
  const priorityPartitionSummary = chooseMoreAdvancedPriorityPartitionSummary(
    priorityPartitionSummaryBase,
    priorityRecoveryClosureWitness?.refreshedPriorityPartitionSummary,
    helperFns,
  );
  const priorityPartitionSummaryChanged = !arePriorityPartitionSummariesEqual(
    latestPublicationRow?.priorityPartitionSummary,
    priorityPartitionSummary,
    helperFns,
  );
  const recoveryProtocolSnapshot = buildRecoveryProtocolSnapshot({
    publicationEpoch: candidatePublicationEpoch,
    publicationStatus: candidatePublicationStatus,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState,
    admissionReasonCodes: planningSnapshot.admissionReasonCodes,
    clusterIncarnationFence: planningSnapshot.clusterIncarnationFence,
    publishedActiveNodeIdsPresent: true,
    durablePublishedActiveNodeIds,
    publishedActiveNodeIds,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    sourceTopologyEpoch,
    sourceSnapshotVersion,
    priorityPartitionSummary,
    priorityRecoveryClosureWitness,
    membershipLifecycleSummary: membershipLifecycleSummaryBase,
    projectionDiagnostics,
  });
  const membershipLifecycleSummary = buildMembershipLifecycleSummary({
    ...membershipLifecycleSummaryBase,
    lifecycleState: candidateLifecycleState,
    participationByNodeId: recoveryProtocolSnapshot.participationByNodeId,
    participationStateCounts: recoveryProtocolSnapshot.participationStateCounts,
    recoveryProtocolState: recoveryProtocolSnapshot.recoveryProtocolState,
    recoveryProtocolReasonCodes: recoveryProtocolSnapshot.priorityRecoveryReasonCodes,
  });
  return {
    publicationKind: helperFns.publicationKind,
    publicationEpoch: candidatePublicationEpoch,
    publicationStatus: candidatePublicationStatus,
    publicationObservationState: recoveryProtocolSnapshot.publicationObservationState,
    publisherNodeId: planningSnapshot.publisherNodeId,
    sourceTopologyEpoch,
    sourceSnapshotVersion,
    membershipEpochSnapshot,
    membershipEpochFence,
    publishedPlanningEpoch: recoveryProtocolSnapshot.publishedPlanningEpoch,
    publishedActiveNodeIdsPresent: recoveryProtocolSnapshot.publishedActiveNodeIdsPresent,
    publishedActiveNodeIds,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    priorityPartitionSummary,
    membershipLifecycleSummary,
    projectedServingNodeIds,
    locallyEligibleNodeIds: publicationLocallyEligibleNodeIds,
    recoveryEligibleIncludedNodeIds: recoveryProtocolSnapshot.recoveryEligibleIncludedNodeIds,
    recoveryActiveNodeIds: recoveryProtocolSnapshot.recoveryActiveNodeIds,
    recoveryActiveNodeSource: recoveryProtocolSnapshot.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds:
      recoveryProtocolSnapshot.missingPublishedRecoveryActiveNodeIds,
    participationByNodeId: recoveryProtocolSnapshot.participationByNodeId,
    participationStateCounts: recoveryProtocolSnapshot.participationStateCounts,
    recoveryProtocolState: recoveryProtocolSnapshot.recoveryProtocolState,
    targetParticipation: recoveryProtocolSnapshot.targetParticipation,
    priorityRecoveryReasonCodes: recoveryProtocolSnapshot.priorityRecoveryReasonCodes,
    targetNodeId: planningSnapshot.targetNodeId,
    admissionState: planningSnapshot.admissionState || null,
    admissionReasonCodes: Array.isArray(planningSnapshot.admissionReasonCodes) ?
      planningSnapshot.admissionReasonCodes :
      [],
    clusterIncarnationFence:
      planningSnapshot.clusterIncarnationFence &&
        typeof planningSnapshot.clusterIncarnationFence === TYPEOF.OBJECT ?
        planningSnapshot.clusterIncarnationFence :
        null,
    priorityRecoveryClosureWitness,
    priorityRecoveryDecisionSnapshots,
    projectionDiagnostics,
    membershipSwimInputs,
    reasonCode,
    changed,
    priorityPartitionSummaryChanged,
    membershipLifecycleSummaryChanged: !areMembershipLifecycleSummariesEqual(
      latestPublicationRow?.membershipLifecycleSummary,
      membershipLifecycleSummary,
    ),
  };
}

export {
  buildPublicationMetadataRefreshRow,
  deriveMembershipPublicationCandidate,
  shouldPreferAuthoritativeMembershipState,
};
