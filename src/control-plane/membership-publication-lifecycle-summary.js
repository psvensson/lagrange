import {NUM, TYPEOF} from '../constants/index.js';
import {
  MEMBERSHIP_MEMBER_STATE,
  buildMembershipLifecycleSummary,
} from './membership-lifecycle-constants.js';

function areMembershipLifecycleSummariesEqual(leftSummary, rightSummary) {
  const left =
    leftSummary && typeof leftSummary === TYPEOF.OBJECT ?
      buildMembershipLifecycleSummary(leftSummary) :
      null;
  const right =
    rightSummary && typeof rightSummary === TYPEOF.OBJECT ?
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
      typeof baselineSummary.projectionDiagnostics === TYPEOF.OBJECT ?
      baselineSummary.projectionDiagnostics :
      {};
  const candidateProjectionDiagnostics =
    candidateSummary?.projectionDiagnostics &&
      typeof candidateSummary.projectionDiagnostics === TYPEOF.OBJECT ?
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
  if (!summary || typeof summary !== TYPEOF.OBJECT) {
    return false;
  }
  const projectionDiagnostics =
    summary.projectionDiagnostics &&
      typeof summary.projectionDiagnostics === TYPEOF.OBJECT ?
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
    helperFns.normalizeNodeIdList(nodeIds).length > NUM.ZERO,
  );
}

function hasPublishedMembershipAuthoritativeRefreshDebt(
  publicationRow,
  helperFns = {},
) {
  const publishedActiveNodeIds = helperFns.normalizeNodeIdList(
    publicationRow?.publishedActiveNodeIds,
  );
  if (publishedActiveNodeIds.length === NUM.ZERO) {
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
    typeof planningMembershipLifecycleSummary !== TYPEOF.OBJECT
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
    typeof activeNodeViews.projectionDiagnostics === TYPEOF.OBJECT ?
      activeNodeViews.projectionDiagnostics :
      null;
  if (!projectionDiagnostics) {
    return null;
  }
  return {
    readinessDecisionMode:
      typeof projectionDiagnostics.readinessDecisionMode === TYPEOF.STRING &&
      projectionDiagnostics.readinessDecisionMode.length > NUM.ZERO ?
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
  };
}

export {
  areMembershipLifecycleSummariesEqual,
  buildProjectionDiagnosticsSummary,
  buildPublishedMemberStates,
  chooseMembershipLifecycleSummaryBase,
  hasPublishedMembershipAuthoritativeRefreshDebt,
};
