import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from './control-plane-readiness-constants.js';
import {
  normalizeMembershipPublicationStringList,
} from './membership-publication-normalizers.js';

// Count-neutral steady-trim decouple (default-off). See buildMembershipPublicationTargetEvidence.
const MEMBERSHIP_COUNT_NEUTRAL_STEADY_TRIM_FLAG =
  'LAGRANGE_PR_COUNT_NEUTRAL_STEADY_TRIM';
function isMembershipCountNeutralSteadyTrimEnabled() {
  return (
    process.env[MEMBERSHIP_COUNT_NEUTRAL_STEADY_TRIM_FLAG] === 'true'
  );
}

const MEMBERSHIP_PUBLICATION_TARGET_STATE = Object.freeze({
  EXPLICIT_PUBLICATION: 'explicit_publication',
  OBSERVED_ACTIVE: 'observed_active',
  PROJECTED_STEADY_TRIM: 'projected_steady_trim',
  RECOVERY_COHORT: 'recovery_cohort',
});
const MEMBERSHIP_PUBLICATION_TARGET_DECISION_ORDER = Object.freeze([
  MEMBERSHIP_PUBLICATION_TARGET_STATE.EXPLICIT_PUBLICATION,
  MEMBERSHIP_PUBLICATION_TARGET_STATE.PROJECTED_STEADY_TRIM,
  MEMBERSHIP_PUBLICATION_TARGET_STATE.RECOVERY_COHORT,
  MEMBERSHIP_PUBLICATION_TARGET_STATE.OBSERVED_ACTIVE,
]);
const MEMBERSHIP_PUBLICATION_ACK_COMPLETION_STATE = Object.freeze({
  COMPLETE: 'complete',
  PENDING: 'pending',
});
const MEMBERSHIP_PUBLICATION_ACK_CARRY_STATE = Object.freeze({
  RECOVERY_ELIGIBLE_ACK: 'recovery_eligible_ack',
  OBSERVED_ACK: 'observed_ack',
});
const MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE = Object.freeze({
  ELIGIBLE: 'eligible',
  DEFERRED: 'deferred',
});
const MEMBERSHIP_PUBLICATION_ACK_READINESS_REASON = Object.freeze({
  RECOVERY_ELIGIBLE: 'recovery_eligible',
});
const MEMBERSHIP_PUBLICATION_ACK_READINESS_RULES = Object.freeze([
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE,
    reasonCodes: Object.freeze([
      MEMBERSHIP_PUBLICATION_ACK_READINESS_REASON.RECOVERY_ELIGIBLE,
    ]),
    matches: (dimensions) =>
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true &&
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
      ] === true &&
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
      ] !== false,
  }),
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.DEFERRED,
    reasonCodes: Object.freeze([
      CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
    ]),
    matches: (dimensions) =>
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === false,
  }),
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE,
    reasonCodes: Object.freeze([]),
    matches: () => true,
  }),
]);
const MEMBERSHIP_PUBLICATION_ACK_CARRY_RULES = Object.freeze([
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_CARRY_STATE.RECOVERY_ELIGIBLE_ACK,
    nodeIds: (evidence) => [
      ...evidence.observedAcknowledgedNodeIds,
      ...evidence.publishableRecoveryActiveNodeIds,
    ],
    matches: (evidence) =>
      evidence.publicationChanged !== true &&
      evidence.publishableRecoveryActiveNodeIds.length > NUM.ZERO,
  }),
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_CARRY_STATE.OBSERVED_ACK,
    nodeIds: (evidence) => evidence.observedAcknowledgedNodeIds,
    matches: () => true,
  }),
]);

function buildMembershipPublicationTargetEvidence(options = {}, helperFns = {}) {
  const explicitPublishedNodeIds = helperFns.normalizeNodeIdList(
    options.explicitPublishedNodeIds,
  );
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(
    options.publishedBaselineNodeIds,
  );
  const projectedServingNodeIds = helperFns.normalizeNodeIdList(
    options.projectedServingNodeIds,
  );
  const recoveryActiveNodeIds = helperFns.normalizeNodeIdList(
    options.recoveryActiveNodeIds,
  );
  const observedActiveNodeIds = helperFns.normalizeNodeIdList(
    options.observedActiveNodeIds,
  );
  const projectedServingNodeIdSet = new Set(projectedServingNodeIds);
  const publishedTrimDebt =
    publishedBaselineNodeIds.length > NUM.ZERO &&
    projectedServingNodeIds.length > NUM.ZERO &&
    publishedBaselineNodeIds.some(
      (nodeId) => !projectedServingNodeIdSet.has(nodeId),
    );
  // Count-neutral steady-trim decouple (default-off, options.countNeutralSteadyTrimEnabled).
  // The steady-trim that drops a durably non-serving node from PUBLISHED membership is
  // normally gated on a GLOBAL priorityRecoverySpreadGapPending flag. But a node that is
  // already excluded from projectedServingNodeIds hosts no serving replica, so trimming it
  // cannot reduce any partition's serving spread — the global gap should not hold a
  // removal-only count-neutral trim over-target (gate run3: a non-serving node stayed
  // published 135s → over-target budget blown). Fire ONLY when the projected target is a
  // strict removal-only subset of the published baseline (no additions — the spread-gap
  // flag's real job of WIDENING to re-admit recovery nodes stays gated), keeping the
  // observedRecoveryProjectionGap + membershipFreeze guards intact. Removal durability is
  // already enforced upstream: projectedServingNodeIds drops a published node only after it
  // fails the transport-alive retention grace (active-node-projection), so the trimmed node
  // is durably departed, not transiently absent mid-rejoin. Published membership feeds the
  // raft voter set only indirectly (the services table is authoritative), so this only stops
  // advertising a durably-departed node and cannot itself shrink quorum. Subagent-audited safe.
  const publishedBaselineNodeIdSet = new Set(publishedBaselineNodeIds);
  const projectedIsRemovalOnlySubset =
    publishedTrimDebt &&
    projectedServingNodeIds.length < publishedBaselineNodeIds.length &&
    projectedServingNodeIds.every((nodeId) =>
      publishedBaselineNodeIdSet.has(nodeId),
    );
  const countNeutralSteadyTrim =
    options.countNeutralSteadyTrimEnabled === true &&
    projectedIsRemovalOnlySubset &&
    options.observedRecoveryProjectionGap !== true &&
    options.membershipFreezeActive !== true;
  const canPublishSteadyTrim =
    (publishedTrimDebt &&
      options.priorityRecoverySpreadGapPending !== true &&
      options.observedRecoveryProjectionGap !== true &&
      options.membershipFreezeActive !== true) ||
    countNeutralSteadyTrim;
  return {
    decisions: Object.freeze({
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.EXPLICIT_PUBLICATION]:
        explicitPublishedNodeIds.length > NUM.ZERO,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.PROJECTED_STEADY_TRIM]:
        canPublishSteadyTrim,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.RECOVERY_COHORT]:
        publishedBaselineNodeIds.length > NUM.ZERO,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.OBSERVED_ACTIVE]: true,
    }),
    nodeIdsByState: Object.freeze({
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.EXPLICIT_PUBLICATION]:
        explicitPublishedNodeIds,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.PROJECTED_STEADY_TRIM]:
        projectedServingNodeIds,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.RECOVERY_COHORT]:
        recoveryActiveNodeIds,
      [MEMBERSHIP_PUBLICATION_TARGET_STATE.OBSERVED_ACTIVE]:
        observedActiveNodeIds,
    }),
  };
}

function resolveMembershipPublicationTargetState(evidence = {}) {
  return MEMBERSHIP_PUBLICATION_TARGET_DECISION_ORDER.find(
    (state) => evidence.decisions?.[state] === true,
  ) || MEMBERSHIP_PUBLICATION_TARGET_STATE.OBSERVED_ACTIVE;
}

function buildMembershipPublicationTargetSnapshot(options = {}, helperFns = {}) {
  const evidence = buildMembershipPublicationTargetEvidence(options, helperFns);
  const state = resolveMembershipPublicationTargetState(evidence);
  return {
    state,
    nodeIds: evidence.nodeIdsByState[state] || [],
  };
}

function buildPublicationAcknowledgementReadinessDecision(readinessEntry = null) {
  const dimensions =
    readinessEntry?.dimensions && typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
      readinessEntry.dimensions :
      null;
  if (!dimensions) {
    return {
      state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE,
      eligible: true,
      reasonCodes: [],
    };
  }
  const decision = MEMBERSHIP_PUBLICATION_ACK_READINESS_RULES.find((rule) =>
    rule.matches(dimensions),
  );
  const reasonCodes = decision.state ===
    MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE ?
    [] :
    normalizeMembershipPublicationStringList(decision.reasonCodes);
  const eligible =
    decision.state === MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE;
  return {
    state: decision.state,
    eligible,
    reasonCodes,
  };
}

function buildPublicationAckTargetSnapshot(options = {}, helperFns = {}) {
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(
    options.publishedBaselineNodeIds,
  );
  const recoveryActiveNodeIds = helperFns.normalizeNodeIdList(
    options.recoveryActiveNodeIds,
  );
  const recoveryEligibleIncludedNodeIds = helperFns.normalizeNodeIdList(
    options.recoveryEligibleIncludedNodeIds,
  );
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const publishedBaselineNodeIdSet = new Set(publishedBaselineNodeIds);
  const recoveryEligibleIncludedNodeIdSet = new Set(recoveryEligibleIncludedNodeIds);
  const deferredNodeIds = [];
  const deferralReasonCodesByNodeId = {};
  const publishableRecoveryActiveNodeIds = [];

  for (const nodeId of recoveryActiveNodeIds) {
    const needsAcknowledgementReadiness =
      !publishedBaselineNodeIdSet.has(nodeId) &&
      recoveryEligibleIncludedNodeIdSet.has(nodeId);
    const readinessDecision = needsAcknowledgementReadiness ?
      buildPublicationAcknowledgementReadinessDecision(
        readinessByNodeId[nodeId] || null,
      ) :
      {
        state: MEMBERSHIP_PUBLICATION_ACK_READINESS_STATE.ELIGIBLE,
        eligible: true,
        reasonCodes: [],
      };
    if (readinessDecision.eligible === true) {
      publishableRecoveryActiveNodeIds.push(nodeId);
      continue;
    }
    deferredNodeIds.push(nodeId);
    deferralReasonCodesByNodeId[nodeId] = readinessDecision.reasonCodes;
  }

  return {
    publishableRecoveryActiveNodeIds:
      helperFns.normalizeNodeIdList(publishableRecoveryActiveNodeIds),
    deferredNodeIds: helperFns.normalizeNodeIdList(deferredNodeIds),
    deferralReasonCodesByNodeId: Object.keys(deferralReasonCodesByNodeId)
      .sort()
      .reduce((accumulator, nodeId) => {
        accumulator[nodeId] = deferralReasonCodesByNodeId[nodeId];
        return accumulator;
      }, {}),
  };
}

function buildPublicationAckProjectionDiagnostics(
  projectionDiagnostics,
  publicationAckTargetSnapshot,
) {
  const normalizedProjectionDiagnostics =
    projectionDiagnostics && typeof projectionDiagnostics === TYPEOF.OBJECT ?
      projectionDiagnostics :
      {};
  return {
    ...normalizedProjectionDiagnostics,
    publicationAckDeferredNodeIds:
      publicationAckTargetSnapshot.deferredNodeIds,
    publicationAckDeferralReasonCodesByNodeId:
      publicationAckTargetSnapshot.deferralReasonCodesByNodeId,
  };
}

function hasRecoveryEligiblePublicationRepairEvidence(options = {}, helperFns = {}) {
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(
    options.publishedBaselineNodeIds,
  );
  const publishableRecoveryActiveNodeIds = helperFns.normalizeNodeIdList(
    options.publishableRecoveryActiveNodeIds,
  );
  const readinessByNodeId =
    options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
      options.readinessByNodeId :
      {};
  const publishedBaselineNodeIdSet = new Set(publishedBaselineNodeIds);

  return publishableRecoveryActiveNodeIds.some((nodeId) => {
    if (publishedBaselineNodeIdSet.has(nodeId)) {
      return false;
    }
    const dimensions = readinessByNodeId[nodeId]?.dimensions;
    return dimensions &&
      typeof dimensions === TYPEOF.OBJECT &&
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true;
  });
}

function buildMembershipPublicationAckCompletionSnapshot(options = {}, helperFns = {}) {
  const requiredAckNodeIds = helperFns.normalizeNodeIdList(
    options.requiredAckNodeIds,
  );
  const acknowledgedNodeIds = helperFns.normalizeNodeIdList(
    options.acknowledgedNodeIds,
  );
  const pendingAckNodeIds = requiredAckNodeIds.filter(
    (nodeId) => !acknowledgedNodeIds.includes(nodeId),
  );
  const state =
    requiredAckNodeIds.length > NUM.ZERO &&
      pendingAckNodeIds.length === NUM.ZERO ?
      MEMBERSHIP_PUBLICATION_ACK_COMPLETION_STATE.COMPLETE :
      MEMBERSHIP_PUBLICATION_ACK_COMPLETION_STATE.PENDING;

  return {
    state,
    complete:
      state === MEMBERSHIP_PUBLICATION_ACK_COMPLETION_STATE.COMPLETE,
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
  };
}

function resolveMembershipPublicationAcknowledgedNodeIds(options = {}, helperFns = {}) {
  const observedAcknowledgedNodeIds = helperFns.normalizeNodeIdList([
    ...helperFns.resolveCarriedAcknowledgedNodeIds({
      latestPublicationRow: options.latestPublicationRow,
      latestPublishedPublicationRow: options.latestPublishedPublicationRow,
      requiredAckNodeIds: options.requiredAckNodeIds,
    }),
    ...(Array.isArray(options.planningAcknowledgedNodeIds) ?
      options.planningAcknowledgedNodeIds :
      []),
  ]);
  const evidence = Object.freeze({
    publicationChanged: options.publicationChanged,
    observedAcknowledgedNodeIds,
    publishableRecoveryActiveNodeIds: helperFns.normalizeNodeIdList(
      options.publishableRecoveryActiveNodeIds,
    ),
  });
  const decision = MEMBERSHIP_PUBLICATION_ACK_CARRY_RULES.find((rule) =>
    rule.matches(evidence),
  );
  return helperFns.normalizeNodeIdList(decision.nodeIds(evidence));
}

function buildMembershipPublicationRecoveryCohortSnapshot(options = {}, helperFns = {}) {
  const publishedActiveNodeIds = helperFns.normalizeNodeIdList(
    options.publishedActiveNodeIds,
  );
  const recoveryActiveNodeIds = helperFns.normalizeNodeIdList(
    options.recoveryActiveNodeIds,
  );
  const targetState = options.publicationTargetSnapshot?.state;
  const steadyTrimTarget =
    targetState === MEMBERSHIP_PUBLICATION_TARGET_STATE.PROJECTED_STEADY_TRIM;
  return {
    activeNodeIds: steadyTrimTarget ? publishedActiveNodeIds : recoveryActiveNodeIds,
    source: steadyTrimTarget ? targetState : options.recoveryActiveNodeSource,
  };
}

export {
  buildMembershipPublicationAckCompletionSnapshot,
  buildMembershipPublicationRecoveryCohortSnapshot,
  buildMembershipPublicationTargetSnapshot,
  buildPublicationAckProjectionDiagnostics,
  buildPublicationAckTargetSnapshot,
  hasRecoveryEligiblePublicationRepairEvidence,
  isMembershipCountNeutralSteadyTrimEnabled,
  resolveMembershipPublicationAcknowledgedNodeIds,
};
