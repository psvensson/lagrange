import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from './control-plane-publication-merge.js';
import {
  MEMBERSHIP_MEMBER_STATE,
  NODE_PARTICIPATION_ADMISSION_STATE,
  NODE_PARTICIPATION_STATE,
  RECOVERY_PROTOCOL_STATE,
  normalizeNodeParticipationAdmissionState,
} from './membership-lifecycle-constants.js';
import {
  buildPriorityRecoveryClosureWitness,
  hasPriorityRecoverySpreadGap,
} from './priority-recovery-snapshot.js';
import {
  buildMembershipPublicationActiveSnapshot,
} from './active-node-projection.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from './publication-recovery-gate.js';
import {
  PUBLICATION_OBSERVATION_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE,
  buildPublicationProjectionBoundaryOutcome,
} from './recovery-protocol-publication-boundary.js';


const PARTICIPATION_REASON = Object.freeze({
  PUBLISHED_MEMBERSHIP: 'published_membership',
  RECOVERY_ACTIVE: 'recovery_active',
  PROJECTED_SERVING: 'projected_serving',
  LOCALLY_ELIGIBLE: 'locally_eligible',
  SUSPECTED_OR_TRANSITIONING: 'suspected_or_transitioning',
  RECOVERY_ELIGIBLE_PROJECTION: 'recovery_eligible_projection',
  LIVENESS_FALLBACK_PROJECTION: 'liveness_fallback_projection',
  READINESS_EXCLUDED: 'readiness_excluded',
  CLUSTER_MEMBER_UNHEALTHY: 'cluster_member_unhealthy',
  MEMBERSHIP_FREEZE_RETAINED: 'membership_freeze_retained',
  NODE_ADMISSION_BLOCKED: 'node_admission_blocked',
});

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ?
    value.trim() :
    null;
}

function normalizeNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  )].sort();
}

function normalizeStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  )];
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    0;
}

function normalizeStringMap(values = {}) {
  if (!values || typeof values !== 'object') {
    return {};
  }
  return Object.keys(values)
    .sort()
    .reduce((accumulator, key) => {
      const normalizedValue = normalizeOptionalString(values[key]);
      if (normalizedValue) {
        accumulator[key] = normalizedValue;
      }
      return accumulator;
    }, {});
}

function freezeRecord(record) {
  return record && typeof record === 'object' ?
    Object.freeze({...record}) :
    null;
}

function normalizeClusterIncarnationFence(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return Object.freeze({
    ...value,
    reasonCodes: Object.freeze(normalizeStringList(value.reasonCodes)),
  });
}

function buildContext(options = {}) {
  const membershipLifecycleSummary =
    options.membershipLifecycleSummary &&
      typeof options.membershipLifecycleSummary === 'object' ?
      options.membershipLifecycleSummary :
      null;
  const projectionDiagnostics =
    options.projectionDiagnostics &&
      typeof options.projectionDiagnostics === 'object' ?
      options.projectionDiagnostics :
      membershipLifecycleSummary?.projectionDiagnostics &&
        typeof membershipLifecycleSummary.projectionDiagnostics ===
          'object' ?
        membershipLifecycleSummary.projectionDiagnostics :
        null;
  const publishedActiveNodeIds = normalizeNodeIdList(
    options.publishedActiveNodeIds ?? membershipLifecycleSummary?.publishedActiveNodeIds,
  );
  const publicationStatus =
    normalizeOptionalString(
      options.publicationStatus ?? options.status ?? options.publicationStatusNormalized,
    );
  const publicationStatusNormalized = publicationStatus ?
    publicationStatus.toUpperCase() :
    '';
  const publishedActiveNodeIdsPresent =
    options.publishedActiveNodeIdsPresent === true ||
    (options.publishedActiveNodeIdsPresent !== false &&
      Array.isArray(options.publishedActiveNodeIds) &&
      options.publishedActiveNodeIds.length > 0);
  const durablePublishedActiveNodeIds = normalizeNodeIdList(
    options.durablePublishedActiveNodeIds ??
      (publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ?
        publishedActiveNodeIds :
        []),
  );
  const projectedServingNodeIds = normalizeNodeIdList(
    options.projectedServingNodeIds ??
      membershipLifecycleSummary?.projectedServingNodeIds,
  );
  const locallyEligibleNodeIds = normalizeNodeIdList(
    options.locallyEligibleNodeIds ??
      membershipLifecycleSummary?.locallyEligibleNodeIds ??
      projectedServingNodeIds,
  );
  const recoveryEligibleIncludedNodeIds = normalizeNodeIdList(
    options.recoveryEligibleIncludedNodeIds ??
      projectionDiagnostics?.recoveryEligibleIncludedNodeIds,
  );
  const livenessFallbackIncludedNodeIds = normalizeNodeIdList(
    options.livenessFallbackIncludedNodeIds ??
      projectionDiagnostics?.livenessFallbackIncludedNodeIds,
  );
  const explicitRecoveryActiveNodeIds = normalizeNodeIdList(
    options.recoveryActiveNodeIds ??
      membershipLifecycleSummary?.recoveryActiveNodeIds,
  );
  const recoveryActiveNodeIds = explicitRecoveryActiveNodeIds.length > 0 ?
    explicitRecoveryActiveNodeIds :
    normalizeNodeIdList(
      locallyEligibleNodeIds.length > 0 ?
        locallyEligibleNodeIds :
        projectedServingNodeIds,
    );
  const recoveryActiveNodeSource =
    normalizeOptionalString(
      options.recoveryActiveNodeSource ??
        membershipLifecycleSummary?.recoveryActiveNodeSource,
    ) ||
    (recoveryActiveNodeIds.length > 0 &&
    recoveryActiveNodeIds.every((nodeId) =>
      durablePublishedActiveNodeIds.includes(nodeId),
    ) ?
      'published_membership' :
      null);
  const missingPublishedRecoveryActiveNodeIds = normalizeNodeIdList(
    options.missingPublishedRecoveryActiveNodeIds ??
      membershipLifecycleSummary?.missingPublishedRecoveryActiveNodeIds ??
      recoveryActiveNodeIds.filter((nodeId) =>
        !durablePublishedActiveNodeIds.includes(nodeId),
      ),
  );
  const suspectedOrTransitioningNodeIds = normalizeNodeIdList(
    options.suspectedOrTransitioningNodeIds ??
      membershipLifecycleSummary?.suspectedOrTransitioningNodeIds,
  );
  const memberStatesByNodeId = membershipLifecycleSummary?.memberStatesByNodeId &&
    typeof membershipLifecycleSummary.memberStatesByNodeId === 'object' ?
    membershipLifecycleSummary.memberStatesByNodeId :
    options.memberStatesByNodeId &&
      typeof options.memberStatesByNodeId === 'object' ?
      options.memberStatesByNodeId :
      {};
  const recoveryEpochByNodeId = normalizeStringMap(
    membershipLifecycleSummary?.recoveryEpochByNodeId ??
      options.recoveryEpochByNodeId,
  );
  const membershipFreeze =
    membershipLifecycleSummary?.membershipFreeze &&
      typeof membershipLifecycleSummary.membershipFreeze === 'object' ?
      membershipLifecycleSummary.membershipFreeze :
      options.membershipFreeze &&
        typeof options.membershipFreeze === 'object' ?
        options.membershipFreeze :
        null;
  const participationByNodeId =
    membershipLifecycleSummary?.participationByNodeId &&
      typeof membershipLifecycleSummary.participationByNodeId === 'object' ?
      membershipLifecycleSummary.participationByNodeId :
      options.participationByNodeId &&
        typeof options.participationByNodeId === 'object' ?
        options.participationByNodeId :
        {};
  const targetNodeId = normalizeOptionalString(options.targetNodeId);
  const targetParticipation =
    targetNodeId && participationByNodeId[targetNodeId] &&
      typeof participationByNodeId[targetNodeId] === 'object' ?
      participationByNodeId[targetNodeId] :
      null;
  const admissionState = normalizeNodeParticipationAdmissionState(
    options.admissionState ?? targetParticipation?.admissionState,
  );
  const admissionReasonCodes = normalizeStringList(
    options.admissionReasonCodes ?? targetParticipation?.admissionReasonCodes,
  );
  const clusterIncarnationFence = normalizeClusterIncarnationFence(
    options.clusterIncarnationFence ?? targetParticipation?.clusterIncarnationFence,
  );
  const priorityRecoveryClosureWitness =
    options.priorityRecoveryClosureWitness &&
      typeof options.priorityRecoveryClosureWitness === 'object' ?
      options.priorityRecoveryClosureWitness :
      buildPriorityRecoveryClosureWitness({
        decisionSnapshots: options.priorityRecoveryDecisionSnapshots,
        priorityPartitionSummary: options.priorityPartitionSummary,
      });
  return {
    publicationEpoch: Number.isFinite(options.publicationEpoch) ?
      Math.trunc(options.publicationEpoch) :
      null,
    publicationStatus,
    publicationStatusNormalized,
    sourceTopologyEpoch: Number.isFinite(options.sourceTopologyEpoch) ?
      Math.trunc(options.sourceTopologyEpoch) :
      null,
    sourceSnapshotVersion: Number.isFinite(options.sourceSnapshotVersion) ?
      Math.trunc(options.sourceSnapshotVersion) :
      null,
    publishedActiveNodeIdsPresent,
    durablePublishedActiveNodeIds,
    publishedActiveNodeIds,
    requiredAckNodeIds: normalizeNodeIdList(options.requiredAckNodeIds),
    acknowledgedNodeIds: normalizeNodeIdList(options.acknowledgedNodeIds),
    pendingAckCount: normalizeNonNegativeInteger(options.pendingAckCount),
    priorityPartitionSummary:
      options.priorityPartitionSummary &&
        typeof options.priorityPartitionSummary === 'object' ?
        options.priorityPartitionSummary :
        null,
    priorityRecoveryClosureWitness,
    membershipLifecycleSummary,
    projectionDiagnostics,
    projectedServingNodeIds,
    locallyEligibleNodeIds,
    recoveryEligibleIncludedNodeIds,
    livenessFallbackIncludedNodeIds,
    recoveryActiveNodeIds,
    recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds,
    suspectedOrTransitioningNodeIds,
    memberStatesByNodeId,
    recoveryEpochByNodeId,
    membershipFreeze,
    participationByNodeId,
    targetNodeId,
    admissionState,
    admissionReasonCodes,
    clusterIncarnationFence,
  };
}

function resolvePriorityRecoverySpreadPending(context) {
  if (
    typeof context?.priorityRecoveryClosureWitness?.prioritySpreadPending ===
    'boolean'
  ) {
    return context.priorityRecoveryClosureWitness.prioritySpreadPending;
  }
  return hasPriorityRecoverySpreadGap(context?.priorityPartitionSummary);
}

function isTargetNodeExcludedFromPublishedMembership(context = {}) {
  return context.publicationStatusNormalized ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
    context.publishedActiveNodeIdsPresent === true &&
    context.targetNodeId &&
    !context.durablePublishedActiveNodeIds.includes(context.targetNodeId);
}

function resolveEffectiveMissingPublishedRecoveryActiveNodeIds(context = {}) {
  return normalizeNodeIdList([
    ...(Array.isArray(context.missingPublishedRecoveryActiveNodeIds) ?
      context.missingPublishedRecoveryActiveNodeIds :
      []),
    ...(isTargetNodeExcludedFromPublishedMembership(context) &&
      typeof context.targetNodeId === 'string' ?
      [context.targetNodeId] :
      []),
  ]);
}

function buildPriorityRecoveryReasonCodes(context) {
  const publicationExcludesTargetNode =
    isTargetNodeExcludedFromPublishedMembership(context);
  const unpublishedObservation =
    context.publicationStatusNormalized.length === 0 &&
    (
      context.targetNodeId !== null ||
      context.recoveryActiveNodeIds.length > 0 ||
      context.projectedServingNodeIds.length > 0 ||
      context.locallyEligibleNodeIds.length > 0
    );
  const reasonCodes = [];
  const publicationPending = context.publicationStatusNormalized.length > 0 &&
    context.publicationStatusNormalized !==
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  if (publicationPending || publicationExcludesTargetNode ||
      unpublishedObservation) {
    reasonCodes.push(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    );
  }
  if (resolvePriorityRecoverySpreadPending(context)) {
    reasonCodes.push(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    );
  }
  return Object.freeze([...new Set(reasonCodes)]);
}

function resolveRecoveryProtocolState(context) {
  if (context.publicationStatusNormalized.length === 0 &&
      context.publishedActiveNodeIdsPresent !== true &&
      context.publishedActiveNodeIds.length === 0) {
    return RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION;
  }
  if (isTargetNodeExcludedFromPublishedMembership(context)) {
    return RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING;
  }
  if (context.publicationStatusNormalized.length > 0 &&
      context.publicationStatusNormalized !==
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED) {
    return RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING;
  }
  if (resolvePriorityRecoverySpreadPending(context) ||
      resolveEffectiveMissingPublishedRecoveryActiveNodeIds(context).length >
        0) {
    return RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING;
  }
  if (context.publishedActiveNodeIdsPresent === true ||
      context.publishedActiveNodeIds.length > 0) {
    return RECOVERY_PROTOCOL_STATE.STEADY_PUBLISHED;
  }
  return RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION;
}

function buildParticipationAdmission(context, nodeId) {
  const existingParticipation =
    context.participationByNodeId?.[nodeId] &&
      typeof context.participationByNodeId[nodeId] === 'object' ?
      context.participationByNodeId[nodeId] :
      null;
  const explicitAdmissionBlocked =
    context.targetNodeId === nodeId &&
    context.admissionState === NODE_PARTICIPATION_ADMISSION_STATE.BLOCKED;
  const admissionState = explicitAdmissionBlocked ?
    NODE_PARTICIPATION_ADMISSION_STATE.BLOCKED :
    normalizeNodeParticipationAdmissionState(existingParticipation?.admissionState);
  const reasonCodes = explicitAdmissionBlocked ?
    context.admissionReasonCodes :
    normalizeStringList(existingParticipation?.admissionReasonCodes);
  const clusterIncarnationFence = explicitAdmissionBlocked ?
    context.clusterIncarnationFence :
    normalizeClusterIncarnationFence(existingParticipation?.clusterIncarnationFence);
  return Object.freeze({
    state: admissionState,
    admitted: admissionState === NODE_PARTICIPATION_ADMISSION_STATE.ADMITTED,
    reasonCodes: Object.freeze(reasonCodes),
    ...(clusterIncarnationFence ?
      {
        clusterIncarnationFence,
      } :
      {}),
  });
}

function buildParticipationReasons(context, nodeId, flags, admission) {
  const reasons = [];
  if (flags.publishedActive) {
    reasons.push(PARTICIPATION_REASON.PUBLISHED_MEMBERSHIP);
  }
  if (flags.recoveryActive && !flags.publishedActive) {
    reasons.push(PARTICIPATION_REASON.RECOVERY_ACTIVE);
  }
  if (flags.projectedServing) {
    reasons.push(PARTICIPATION_REASON.PROJECTED_SERVING);
  }
  if (flags.locallyEligible) {
    reasons.push(PARTICIPATION_REASON.LOCALLY_ELIGIBLE);
  }
  if (flags.suspectedOrTransitioning) {
    reasons.push(PARTICIPATION_REASON.SUSPECTED_OR_TRANSITIONING);
  }
  if (context.recoveryEligibleIncludedNodeIds.includes(nodeId)) {
    reasons.push(PARTICIPATION_REASON.RECOVERY_ELIGIBLE_PROJECTION);
  }
  if (context.livenessFallbackIncludedNodeIds.includes(nodeId)) {
    reasons.push(PARTICIPATION_REASON.LIVENESS_FALLBACK_PROJECTION);
  }
  if (context.projectionDiagnostics?.readinessExcludedNodeIds?.includes(nodeId)) {
    reasons.push(PARTICIPATION_REASON.READINESS_EXCLUDED);
  }
  if (
    context.projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds
      ?.includes(nodeId)
  ) {
    reasons.push(PARTICIPATION_REASON.CLUSTER_MEMBER_UNHEALTHY);
  }
  if (context.membershipFreeze?.active === true &&
      context.membershipFreeze?.retainedPublishedNodeIds?.includes(nodeId)) {
    reasons.push(PARTICIPATION_REASON.MEMBERSHIP_FREEZE_RETAINED);
  }
  if (admission.state === NODE_PARTICIPATION_ADMISSION_STATE.BLOCKED) {
    reasons.push(PARTICIPATION_REASON.NODE_ADMISSION_BLOCKED);
    reasons.push(...admission.reasonCodes);
  }
  return Object.freeze(normalizeStringList(reasons));
}

function resolveParticipationState(memberState, flags) {
  if (memberState === MEMBERSHIP_MEMBER_STATE.RETIRED) {
    return NODE_PARTICIPATION_STATE.RETIRED;
  }
  if (memberState === MEMBERSHIP_MEMBER_STATE.DRAINING) {
    return NODE_PARTICIPATION_STATE.DRAINING;
  }
  if (flags.publishedActive) {
    return NODE_PARTICIPATION_STATE.PUBLISHED_ACTIVE;
  }
  if (flags.recoveryActive) {
    return NODE_PARTICIPATION_STATE.RECOVERY_PENDING_PUBLISH;
  }
  if (flags.suspectedOrTransitioning ||
      memberState === MEMBERSHIP_MEMBER_STATE.UNREACHABLE) {
    return NODE_PARTICIPATION_STATE.SUSPECTED;
  }
  if (flags.locallyEligible || flags.projectedServing) {
    return NODE_PARTICIPATION_STATE.OBSERVED_PENDING_PUBLISH;
  }
  if (memberState === MEMBERSHIP_MEMBER_STATE.CATCHING_UP) {
    return NODE_PARTICIPATION_STATE.CATCHING_UP;
  }
  if (memberState === MEMBERSHIP_MEMBER_STATE.JOINING) {
    return NODE_PARTICIPATION_STATE.JOINING;
  }
  return NODE_PARTICIPATION_STATE.INACTIVE;
}

function buildParticipationByNodeId(context) {
  const allNodeIds = normalizeNodeIdList([
    ...context.publishedActiveNodeIds,
    ...context.projectedServingNodeIds,
    ...context.locallyEligibleNodeIds,
    ...context.recoveryEligibleIncludedNodeIds,
    ...context.livenessFallbackIncludedNodeIds,
    ...context.recoveryActiveNodeIds,
    ...context.missingPublishedRecoveryActiveNodeIds,
    ...context.suspectedOrTransitioningNodeIds,
    ...(Array.isArray(context.projectionDiagnostics?.readinessExcludedNodeIds) ?
      context.projectionDiagnostics.readinessExcludedNodeIds :
      []),
    ...(Array.isArray(
      context.projectionDiagnostics?.clusterMemberUnhealthyExcludedNodeIds,
    ) ?
      context.projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds :
      []),
    ...Object.keys(context.memberStatesByNodeId || {}),
    ...Object.keys(context.recoveryEpochByNodeId || {}),
    ...Object.keys(context.participationByNodeId || {}),
    ...(Array.isArray(context.membershipFreeze?.retainedPublishedNodeIds) ?
      context.membershipFreeze.retainedPublishedNodeIds :
      []),
  ]);
  const participationByNodeId = {};

  for (const nodeId of allNodeIds) {
    const memberState = normalizeOptionalString(
      context.memberStatesByNodeId?.[nodeId],
    );
    const flags = {
      publishedActive: context.durablePublishedActiveNodeIds.includes(nodeId),
      recoveryActive: context.recoveryActiveNodeIds.includes(nodeId),
      projectedServing: context.projectedServingNodeIds.includes(nodeId),
      locallyEligible: context.locallyEligibleNodeIds.includes(nodeId),
      suspectedOrTransitioning:
        context.suspectedOrTransitioningNodeIds.includes(nodeId),
    };
    const state = resolveParticipationState(memberState, flags);
    const admission = buildParticipationAdmission(context, nodeId);
    const recoverySource = !flags.recoveryActive ?
      null :
      context.recoveryEligibleIncludedNodeIds.includes(nodeId) ?
        'recovery_eligible_projection' :
        context.livenessFallbackIncludedNodeIds.includes(nodeId) ?
          'liveness_fallback_projection' :
          context.recoveryActiveNodeSource;
    participationByNodeId[nodeId] = Object.freeze({
      nodeId,
      state,
      memberState,
      durable: state === NODE_PARTICIPATION_STATE.PUBLISHED_ACTIVE,
      publishedActive: flags.publishedActive,
      recoveryActive: flags.recoveryActive,
      projectedServing: flags.projectedServing,
      locallyEligible: flags.locallyEligible,
      suspectedOrTransitioning: flags.suspectedOrTransitioning,
      recoverySource,
      recoveryEpoch: context.recoveryEpochByNodeId?.[nodeId] || null,
      admissionState: admission.state,
      admitted: admission.admitted,
      admissionReasonCodes: Object.freeze([...admission.reasonCodes]),
      ...(admission.clusterIncarnationFence ?
        {
          clusterIncarnationFence: admission.clusterIncarnationFence,
        } :
        {}),
      reasons: buildParticipationReasons(context, nodeId, flags, admission),
    });
  }

  return Object.freeze(participationByNodeId);
}

function buildParticipationStateCounts(participationByNodeId = {}) {
  return Object.freeze(
    Object.values(participationByNodeId)
      .reduce((accumulator, participation) => {
        const state = participation?.state;
        if (typeof state !== 'string' || state.length === 0) {
          return accumulator;
        }
        accumulator[state] = (accumulator[state] || 0) + 1;
        return accumulator;
      }, {}),
  );
}

function buildRecoveryProtocolSnapshot(options = {}) {
  const context = buildContext(options);
  const participationByNodeId = buildParticipationByNodeId(context);
  const publishedMembershipIncludesTargetNode = context.targetNodeId ?
    context.durablePublishedActiveNodeIds.includes(context.targetNodeId) :
    null;
  const effectiveMissingPublishedRecoveryActiveNodeIds =
    resolveEffectiveMissingPublishedRecoveryActiveNodeIds(context);
  const publicationObservationState =
    context.publicationStatusNormalized.length === 0 ?
      PUBLICATION_OBSERVATION_STATE.UNPUBLISHED :
      context.publicationStatusNormalized ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ?
        PUBLICATION_OBSERVATION_STATE.AUTHORITATIVE :
        PUBLICATION_OBSERVATION_STATE.ESTABLISHING;
  const publicationExcludesTargetNode =
    context.publicationStatusNormalized ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
    context.publishedActiveNodeIdsPresent === true &&
    context.targetNodeId ?
      publishedMembershipIncludesTargetNode === false :
      false;
  const recoveryProtocolState = resolveRecoveryProtocolState(context);
  const pendingAckEvidenceState =
    options.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
    options.pendingAckEvidenceState ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST ?
      options.pendingAckEvidenceState :
      Array.isArray(options.requiredAckNodeIds) ?
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST :
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY;
  const publicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
    publicationEpoch: context.publicationEpoch,
    publicationStatus: context.publicationStatus,
    publicationObservationState,
    recoveryProtocolState,
    priorityRecoveryReasonCodes: buildPriorityRecoveryReasonCodes(context),
    priorityPartitionSummary: context.priorityPartitionSummary,
    priorityRecoveryClosureWitness: context.priorityRecoveryClosureWitness,
    requiredAckNodeIds: context.requiredAckNodeIds,
    acknowledgedNodeIds: context.acknowledgedNodeIds,
    pendingAckEvidenceState,
    pendingAckCount: context.pendingAckCount,
    missingPublishedRecoveryActiveNodeIds:
      effectiveMissingPublishedRecoveryActiveNodeIds,
    publicationExcludesTargetNode,
  });
  const publicationBoundaryOutcome = buildPublicationProjectionBoundaryOutcome(
    {
      publicationEpoch: context.publicationEpoch,
      publicationStatus: context.publicationStatus,
      publicationStatusNormalized: context.publicationStatusNormalized,
      publicationObservationState,
    },
    publicationRecoveryGate,
  );

  return Object.freeze({
    publicationEpoch: context.publicationEpoch,
    publicationStatus: context.publicationStatus,
    publicationStatusNormalized: context.publicationStatusNormalized,
    sourceTopologyEpoch: context.sourceTopologyEpoch,
    sourceSnapshotVersion: context.sourceSnapshotVersion,
    publishedActiveNodeIdsPresent: context.publishedActiveNodeIdsPresent,
    publishedActiveNodeIds: Object.freeze([...context.publishedActiveNodeIds]),
    requiredAckNodeIds: Object.freeze([...context.requiredAckNodeIds]),
    acknowledgedNodeIds: Object.freeze([...context.acknowledgedNodeIds]),
    pendingAckCount: context.pendingAckCount,
    pendingAckEvidenceState,
    priorityPartitionSummary: freezeRecord(context.priorityPartitionSummary),
    priorityRecoveryClosureWitness:
      freezeRecord(context.priorityRecoveryClosureWitness),
    membershipLifecycleSummary: freezeRecord(context.membershipLifecycleSummary),
    projectionDiagnostics: freezeRecord(context.projectionDiagnostics),
    projectedServingNodeIds: Object.freeze([...context.projectedServingNodeIds]),
    locallyEligibleNodeIds: Object.freeze([...context.locallyEligibleNodeIds]),
    recoveryEligibleIncludedNodeIds: Object.freeze([
      ...context.recoveryEligibleIncludedNodeIds,
    ]),
    recoveryActiveNodeIds: Object.freeze([...context.recoveryActiveNodeIds]),
    recoveryActiveNodeSource: context.recoveryActiveNodeSource,
    missingPublishedRecoveryActiveNodeIds: Object.freeze([
      ...effectiveMissingPublishedRecoveryActiveNodeIds,
    ]),
    participationByNodeId,
    participationStateCounts: buildParticipationStateCounts(
      participationByNodeId,
    ),
    recoveryProtocolState,
    targetNodeId: context.targetNodeId,
    targetParticipation: context.targetNodeId ?
      participationByNodeId[context.targetNodeId] || null :
      null,
    publicationObservationState,
    publicationPending: publicationRecoveryGate.publicationPending,
    publicationExcludesTargetNode,
    publishedMembershipIncludesTargetNode,
    closureRecordId: publicationRecoveryGate.closureRecordId || null,
    closureWitnessClass: publicationRecoveryGate.closureWitnessClass || null,
    publishedPlanningEpoch:
      context.publicationStatusNormalized ===
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
        Number.isInteger(context.publicationEpoch) ?
        context.publicationEpoch :
        null,
    priorityRecoveryReasonCodes: publicationRecoveryGate.reasonCodes,
    publicationRecoveryGate,
    publicationBoundaryOutcome,
  });
}

function buildPublicationRecoveryProtocolSnapshot(
  membershipPublication = null,
  options = {},
) {
  const publicationSnapshot = buildMembershipPublicationActiveSnapshot(
    membershipPublication,
  );
  if (!publicationSnapshot) {
    return null;
  }
  return buildRecoveryProtocolSnapshot({
    ...publicationSnapshot,
    publicationStatus: publicationSnapshot.publicationStatus,
    targetNodeId: options.targetNodeId,
  });
}

export {
  PUBLICATION_PROJECTION_BOUNDARY_ACK_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_FRESHNESS_STATE,
  PUBLICATION_PROJECTION_BOUNDARY_ROW_STATE,
  buildPublicationRecoveryProtocolSnapshot,
  buildRecoveryProtocolSnapshot,
  NODE_PARTICIPATION_STATE,
  RECOVERY_PROTOCOL_STATE,
};
