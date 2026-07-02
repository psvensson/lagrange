import {
  MEMBERSHIP_MEMBER_STATE,
  buildMembershipLifecycleSummary,
} from './membership-lifecycle-constants.js';

function areMembershipLifecycleSummariesEqual(leftSummary, rightSummary) {
  const left =
    leftSummary && typeof leftSummary === 'object' ?
      buildMembershipLifecycleSummary(leftSummary) :
      null;
  const right =
    rightSummary && typeof rightSummary === 'object' ?
      buildMembershipLifecycleSummary(rightSummary) :
      null;
  if (left === null || right === null) {
    return left === right;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function listHasMembershipLifecycleNodeAdvance(
  baselineNodeIds = [],
  candidateNodeIds = [],
  helperFns = {},
) {
  const baselineNodeIdSet = new Set(helperFns.normalizeNodeIdList(baselineNodeIds));
  return helperFns.normalizeNodeIdList(candidateNodeIds).some(
    (nodeId) => !baselineNodeIdSet.has(nodeId),
  );
}

function hasMembershipLifecycleSummaryProjectionAdvance(
  baselineSummary,
  candidateSummary,
  helperFns = {},
) {
  const baselineProjectionDiagnostics =
    baselineSummary?.projectionDiagnostics &&
      typeof baselineSummary.projectionDiagnostics === 'object' ?
      baselineSummary.projectionDiagnostics :
      {};
  const candidateProjectionDiagnostics =
    candidateSummary?.projectionDiagnostics &&
      typeof candidateSummary.projectionDiagnostics === 'object' ?
      candidateSummary.projectionDiagnostics :
      {};
  return [
    listHasMembershipLifecycleNodeAdvance(
      baselineSummary?.projectedServingNodeIds,
      candidateSummary?.projectedServingNodeIds,
      helperFns,
    ),
    listHasMembershipLifecycleNodeAdvance(
      baselineSummary?.locallyEligibleNodeIds,
      candidateSummary?.locallyEligibleNodeIds,
      helperFns,
    ),
    listHasMembershipLifecycleNodeAdvance(
      baselineSummary?.recoveryActiveNodeIds,
      candidateSummary?.recoveryActiveNodeIds,
      helperFns,
    ),
    listHasMembershipLifecycleNodeAdvance(
      baselineSummary?.missingPublishedRecoveryActiveNodeIds,
      candidateSummary?.missingPublishedRecoveryActiveNodeIds,
      helperFns,
    ),
    listHasMembershipLifecycleNodeAdvance(
      baselineProjectionDiagnostics.recoveryEligibleIncludedNodeIds,
      candidateProjectionDiagnostics.recoveryEligibleIncludedNodeIds,
      helperFns,
    ),
    baselineProjectionDiagnostics.recoveryEligibleProjectionEnabled !== true &&
      candidateProjectionDiagnostics.recoveryEligibleProjectionEnabled === true,
  ].some(Boolean);
}

function hasMembershipLifecycleSummaryProjectionEvidence(summary, helperFns = {}) {
  if (!summary || typeof summary !== 'object') {
    return false;
  }
  const projectionDiagnostics =
    summary.projectionDiagnostics &&
      typeof summary.projectionDiagnostics === 'object' ?
      summary.projectionDiagnostics :
      {};
  return [
    summary.projectedServingNodeIds,
    summary.locallyEligibleNodeIds,
    summary.recoveryActiveNodeIds,
    summary.missingPublishedRecoveryActiveNodeIds,
    projectionDiagnostics.recoveryEligibleIncludedNodeIds,
    projectionDiagnostics.livenessFallbackIncludedNodeIds,
    projectionDiagnostics.runtimeAuthorityIncludedNodeIds,
  ].some((nodeIds) =>
    helperFns.normalizeNodeIdList(nodeIds).length > 0,
  );
}

function hasPublishedMembershipAuthoritativeRefreshDebt(
  publicationRow,
  helperFns = {},
) {
  const publishedActiveNodeIds = helperFns.normalizeNodeIdList(
    publicationRow?.publishedActiveNodeIds,
  );
  if (publishedActiveNodeIds.length === 0) {
    return false;
  }
  return hasMembershipLifecycleSummaryProjectionEvidence(
    publicationRow?.membershipLifecycleSummary,
    helperFns,
  ) !== true;
}

function chooseMembershipLifecycleSummaryBase(
  planningMembershipLifecycleSummary,
  derivedMembershipLifecycleSummary,
  helperFns = {},
) {
  const derivedSummary = buildMembershipLifecycleSummary(
    derivedMembershipLifecycleSummary,
  );
  if (
    !planningMembershipLifecycleSummary ||
    typeof planningMembershipLifecycleSummary !== 'object'
  ) {
    return derivedSummary;
  }
  const planningSummary = buildMembershipLifecycleSummary(
    planningMembershipLifecycleSummary,
  );
  return hasMembershipLifecycleSummaryProjectionAdvance(
    planningSummary,
    derivedSummary,
    helperFns,
  ) ?
    derivedSummary :
    planningSummary;
}

function buildPublishedMemberStates(options = {}, helperFns = {}) {
  const publishedBaselineNodeIds = helperFns.normalizeNodeIdList(options.publishedBaselineNodeIds);
  const desiredPublishedNodeIds = helperFns.normalizeNodeIdList(options.desiredPublishedNodeIds);
  const projectedServingNodeIds = helperFns.normalizeNodeIdList(options.projectedServingNodeIds);
  const suspectedOrTransitioningNodeIds = helperFns.normalizeNodeIdList(
    options.suspectedOrTransitioningNodeIds,
  );
  const recoveryEpochByNodeId = options.recoveryEpochByNodeId || {};
  const explicitRetiredNodeIds = new Set(
    helperFns.normalizeNodeIdList(options.explicitRetiredNodeIds),
  );
  const states = {};
  const allNodeIds = helperFns.normalizeNodeIdList([
    ...publishedBaselineNodeIds,
    ...desiredPublishedNodeIds,
    ...projectedServingNodeIds,
    ...suspectedOrTransitioningNodeIds,
    ...Object.keys(recoveryEpochByNodeId),
    ...explicitRetiredNodeIds,
  ]);
  for (const nodeId of allNodeIds) {
    const latestEpoch = recoveryEpochByNodeId[nodeId] || null;
    const recoveryOpen = latestEpoch?.open === true;
    if (explicitRetiredNodeIds.has(nodeId)) {
      states[nodeId] = MEMBERSHIP_MEMBER_STATE.RETIRED;
      continue;
    }
    if (desiredPublishedNodeIds.includes(nodeId)) {
      if (!publishedBaselineNodeIds.includes(nodeId)) {
        states[nodeId] =
          recoveryOpen ?
            MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
            MEMBERSHIP_MEMBER_STATE.JOINING;
        continue;
      }
      if (!projectedServingNodeIds.includes(nodeId)) {
        states[nodeId] = MEMBERSHIP_MEMBER_STATE.UNREACHABLE;
        continue;
      }
      states[nodeId] =
        recoveryOpen ?
          MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
          MEMBERSHIP_MEMBER_STATE.SERVING;
      continue;
    }
    if (projectedServingNodeIds.includes(nodeId)) {
      states[nodeId] =
        recoveryOpen ?
          MEMBERSHIP_MEMBER_STATE.CATCHING_UP :
          MEMBERSHIP_MEMBER_STATE.JOINING;
      continue;
    }
    if (publishedBaselineNodeIds.includes(nodeId)) {
      states[nodeId] = MEMBERSHIP_MEMBER_STATE.UNREACHABLE;
    }
  }
  return states;
}

function buildProjectionDiagnosticsSummary(activeNodeViews = null, helperFns = {}) {
  const projectionDiagnostics =
    activeNodeViews?.projectionDiagnostics &&
    typeof activeNodeViews.projectionDiagnostics === 'object' ?
      activeNodeViews.projectionDiagnostics :
      null;
  if (!projectionDiagnostics) {
    return null;
  }
  return {
    readinessDecisionMode:
      typeof projectionDiagnostics.readinessDecisionMode === 'string' &&
      projectionDiagnostics.readinessDecisionMode.length > 0 ?
        projectionDiagnostics.readinessDecisionMode :
        null,
    readinessDecisionDimensions: helperFns.normalizeStringList(
      projectionDiagnostics.readinessDecisionDimensions,
    ),
    recoveryEligibleProjectionEnabled:
      projectionDiagnostics.recoveryEligibleProjectionEnabled === true,
    recoveryEligibleIncludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.recoveryEligibleIncludedNodeIds,
    ),
    livenessFallbackIncludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.livenessFallbackIncludedNodeIds,
    ),
    readinessExcludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.readinessExcludedNodeIds,
    ),
    clusterMemberUnhealthyExcludedNodeIds: helperFns.normalizeNodeIdList(
      projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds,
    ),
    // CL-001 variant C: surface the per-node retention-grace miss attribution so a
    // trimmed already-published node's binding condition (no transport / stale
    // lease+heartbeat) is observable in the publication diagnostics.
    retentionGraceMisses: Array.isArray(
      projectionDiagnostics.retentionGraceMisses,
    ) ?
      projectionDiagnostics.retentionGraceMisses.slice() :
      [],
  };
}

export {
  areMembershipLifecycleSummariesEqual,
  buildProjectionDiagnosticsSummary,
  buildPublishedMemberStates,
  chooseMembershipLifecycleSummaryBase,
  hasPublishedMembershipAuthoritativeRefreshDebt,
};
