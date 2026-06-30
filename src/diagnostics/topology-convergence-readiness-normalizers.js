import {
  UNKNOWN_VALUE,
  SOURCE_ORDER_BASE,
  READINESS_SUPPORT_PATH,
  READINESS_RECOVERABILITY_RULES,
  READINESS_INHERITED_ACTIVE_GATE_SUPPORT_RULES,
  READINESS_PROJECTION_EXCLUDED_SOURCE,
  READINESS_CAUSE_NONE,
  READINESS_SUPPORT_PROGRESS_STATE_SATISFIED,
  READINESS_SUPPORT_PROGRESS_REASON_SATISFIED,
  READINESS_SUPPORT_PROGRESS_NEXT_ACTION_NONE,
  READINESS_SUPPORT_PROGRESS_WAKE_SOURCE_NONE,
  READINESS_SUPPORT_PROGRESS_BLOCKING_DEPENDENCY_NONE,
  READINESS_SUPPORT_TIMELINE_MODE,
  READINESS_SUPPORT_TIMELINE_CLASS_CODE,
  READINESS_SUPPORT_TIMELINE_SOURCE,
  OWNER,
  BOUNDARY,
} from './topology-convergence-constants.js';

import {
  asRecord,
  arrayOrEmpty,
  textOrUnknown,
  normalizeProgressContract,
} from './topology-convergence-core-normalizers.js';

const READINESS_PROJECTION_EXCLUDED_CLASS_CODE =
  'readiness_projection_excluded';
const READINESS_PROJECTION_EXCLUDED_CAUSE =
  'readiness_projection_excluded';
const READINESS_CLUSTER_MEMBER_UNHEALTHY_CAUSE =
  'cluster_member_unhealthy';
const READINESS_PROJECTION_PROGRESS_STATE = 'readiness_retryable';
const READINESS_PROJECTION_PROGRESS_NEXT_ACTION =
  'wait_for_readiness_support';
const READINESS_PROJECTION_PROGRESS_TERMINAL_STATE = 'satisfied';
const READINESS_PROJECTION_PROGRESS_BLOCKING_DEPENDENCY =
  'cluster_member_health';
const EXPLICIT_READINESS_SUPPORT_KIND_PROGRESS_CONTRACT =
  'progress_contract';
const EXPLICIT_READINESS_SUPPORT_KIND_READY_FLAG = 'ready_flag';
const EXPLICIT_READINESS_SUPPORT_KIND_ZERO_REASON_TIMELINE =
  'zero_reason_timeline';
const EXPLICIT_READINESS_SUPPORT_RULES = Object.freeze([
  Object.freeze({
    kind: EXPLICIT_READINESS_SUPPORT_KIND_PROGRESS_CONTRACT,
    matches: (evidence) =>
      evidence.progressContractState ===
      READINESS_SUPPORT_PROGRESS_STATE_SATISFIED,
  }),
  Object.freeze({
    kind: EXPLICIT_READINESS_SUPPORT_KIND_READY_FLAG,
    matches: (evidence) => evidence.ready === true,
  }),
  Object.freeze({
    kind: EXPLICIT_READINESS_SUPPORT_KIND_ZERO_REASON_TIMELINE,
    matches: (evidence) =>
      evidence.timelineNodeReasonCountsPresent === true &&
      evidence.timelineNodeReasonCountsZero === true,
  }),
]);

export function resolveReadinessSupportPath(readiness, activeGate) {
  const snapshot = {
    activeGateState: textOrUnknown(asRecord(activeGate).state),
    classCode: textOrUnknown(readiness.classCode),
    terminalReason: textOrUnknown(readiness.terminalReason),
    source: textOrUnknown(readiness.source),
    cause: textOrUnknown(readiness.cause),
  };
  if (READINESS_INHERITED_ACTIVE_GATE_SUPPORT_RULES.some((rule) =>
    rule.matches(snapshot),
  )) {
    return READINESS_SUPPORT_PATH.INHERITED_ACTIVE_GATE_NO_PROGRESS;
  }
  return READINESS_SUPPORT_PATH.READINESS_FAILURE;
}

export function resolveReadinessRecoverability(readiness) {
  const snapshot = {
    recoverability: textOrUnknown(readiness.recoverability),
    classCode: textOrUnknown(readiness.classCode),
    terminalReason: textOrUnknown(readiness.terminalReason),
  };
  const decision = READINESS_RECOVERABILITY_RULES.find((rule) =>
    rule.matches(snapshot),
  );
  return decision.recoverability;
}

export function normalizeReadinessSupportEvidence(readinessFailure, activeGate) {
  const readiness = asRecord(readinessFailure);
  if (Object.keys(readiness).length === SOURCE_ORDER_BASE) {
    return {};
  }
  const recoverability = resolveReadinessRecoverability(readiness);
  const supportPath = resolveReadinessSupportPath(readiness, activeGate);
  return {
    ...readiness,
    recoverability,
    supportPath,
  };
}

export function normalizeExplicitReadinessSupportEvidence(
  readinessInput,
  evidencePath,
) {
  const evidence = buildExplicitReadinessSupportEvidence(
    readinessInput,
    evidencePath,
  );
  const rule = EXPLICIT_READINESS_SUPPORT_RULES.find((entry) =>
    entry.matches(evidence),
  );
  return rule ?
    buildExplicitReadinessSupportRecord(evidence, rule) :
    {};
}

function buildExplicitReadinessSupportEvidence(readinessInput, evidencePath) {
  const readiness = asRecord(readinessInput);
  const rawProgressContract = asRecord(readiness.progressContract);
  const progressContract =
    Object.keys(rawProgressContract).length > SOURCE_ORDER_BASE ?
      normalizeProgressContract(
        rawProgressContract,
        buildSatisfiedReadinessProgressContract(evidencePath),
      ) :
      {};
  const timeline = asRecord(readiness.lastReadinessTimelineEntry);
  const nodeReasonCounts = Object.values(
    asRecord(timeline.nodeReasonCountsByNodeId),
  );
  return {
    readiness,
    rawProgressContract,
    progressContract,
    progressContractState: progressContract.state,
    evidencePath,
    ready: readiness.ready === true,
    timelineNodeReasonCountsPresent:
      nodeReasonCounts.length > SOURCE_ORDER_BASE,
    timelineNodeReasonCountsZero: nodeReasonCounts.every((count) =>
      Number.isFinite(count) && count === SOURCE_ORDER_BASE,
    ),
  };
}

function buildExplicitReadinessSupportRecord(evidence, rule) {
  const progressContract =
    Object.keys(evidence.progressContract).length > SOURCE_ORDER_BASE ?
      evidence.progressContract :
      normalizeProgressContract(
        evidence.rawProgressContract,
        buildSatisfiedReadinessProgressContract(
          evidence.evidencePath,
        ),
      );
  const timelineFields =
    rule.kind === EXPLICIT_READINESS_SUPPORT_KIND_ZERO_REASON_TIMELINE ?
      {
        mode: READINESS_SUPPORT_TIMELINE_MODE,
        classCode: READINESS_SUPPORT_TIMELINE_CLASS_CODE,
        recoverability: READINESS_SUPPORT_PROGRESS_STATE_SATISFIED,
        terminalReason: READINESS_SUPPORT_PROGRESS_REASON_SATISFIED,
        cause: READINESS_CAUSE_NONE,
        source: READINESS_SUPPORT_TIMELINE_SOURCE,
      } :
      {};
  return {
    ...evidence.readiness,
    ...timelineFields,
    ready: true,
    supportPath: evidence.readiness.supportPath ||
      READINESS_SUPPORT_PATH.EXPLICIT_SUPPORT_EVIDENCE,
    progressContract,
  };
}

function buildSatisfiedReadinessProgressContract(evidencePath) {
  return {
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    state: READINESS_SUPPORT_PROGRESS_STATE_SATISFIED,
    reason: READINESS_SUPPORT_PROGRESS_REASON_SATISFIED,
    nextAction: READINESS_SUPPORT_PROGRESS_NEXT_ACTION_NONE,
    wakeSource: READINESS_SUPPORT_PROGRESS_WAKE_SOURCE_NONE,
    retryAfterMs: SOURCE_ORDER_BASE,
    terminalState: READINESS_SUPPORT_PROGRESS_STATE_SATISFIED,
    evidencePath,
    blockingDependency: READINESS_SUPPORT_PROGRESS_BLOCKING_DEPENDENCY_NONE,
  };
}

export function deriveProjectionReadinessFailure(publication) {
  const projectionDiagnostics = asRecord(publication.projectionDiagnostics);
  const missingPublishedNodeIds = arrayOrEmpty(
    publication.missingPublishedNodeIds,
  );
  const readinessExcludedNodeIds = arrayOrEmpty(
    projectionDiagnostics.readinessExcludedNodeIds,
  );
  const unhealthyExcludedNodeIds = arrayOrEmpty(
    projectionDiagnostics.clusterMemberUnhealthyExcludedNodeIds,
  );
  const excludedNodeIdSet = new Set([
    ...readinessExcludedNodeIds,
    ...unhealthyExcludedNodeIds,
  ]);
  const blockedNodeIds = missingPublishedNodeIds
    .filter((nodeId) => excludedNodeIdSet.has(nodeId))
    .sort();
  if (blockedNodeIds.length === SOURCE_ORDER_BASE) {
    return {};
  }
  const unhealthyNodeIdSet = new Set(unhealthyExcludedNodeIds);
  const nodeReasonsByNodeId = {};
  for (const nodeId of blockedNodeIds) {
    nodeReasonsByNodeId[nodeId] = unhealthyNodeIdSet.has(nodeId) ?
      [
        READINESS_PROJECTION_EXCLUDED_CAUSE,
        READINESS_CLUSTER_MEMBER_UNHEALTHY_CAUSE,
      ] :
      [READINESS_PROJECTION_EXCLUDED_CAUSE];
  }
  const hasUnhealthyBlockedNode = blockedNodeIds.some((nodeId) =>
    unhealthyNodeIdSet.has(nodeId),
  );
  const cause = hasUnhealthyBlockedNode ?
    READINESS_CLUSTER_MEMBER_UNHEALTHY_CAUSE :
    READINESS_PROJECTION_EXCLUDED_CAUSE;
  return {
    mode: textOrUnknown(projectionDiagnostics.readinessDecisionMode),
    classCode: READINESS_PROJECTION_EXCLUDED_CLASS_CODE,
    terminalReason: UNKNOWN_VALUE,
    source: READINESS_PROJECTION_EXCLUDED_SOURCE,
    cause,
    nodeReasonsByNodeId,
    progressSignal: {
      attemptsSinceProgress: UNKNOWN_VALUE,
      maxAttempts: UNKNOWN_VALUE,
      stalled: false,
    },
    progressContract: {
      owner: OWNER.READINESS,
      boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
      state: READINESS_PROJECTION_PROGRESS_STATE,
      reason: cause,
      nextAction: READINESS_PROJECTION_PROGRESS_NEXT_ACTION,
      wakeSource: READINESS_PROJECTION_EXCLUDED_SOURCE,
      retryAfterMs: SOURCE_ORDER_BASE,
      terminalState: READINESS_PROJECTION_PROGRESS_TERMINAL_STATE,
      blockingDependency: READINESS_PROJECTION_PROGRESS_BLOCKING_DEPENDENCY,
    },
  };
}
