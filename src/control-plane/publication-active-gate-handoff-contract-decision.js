import {NUM, TYPEOF} from '../constants/index.js';
import {
  OWNER_OUTCOME_FRESHNESS,
  OWNER_OUTCOME_STATE,
} from './owner-outcome-contract.js';
import {
  PUBLICATION_ACTIVE_GATE_CONSUMER_HANDOFF,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_OBSERVATION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RETRY,
  PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE_RANK,
  PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_REASON,
  PUBLICATION_OPERATION_WORKFLOW_HANDOFF_STATE,
  PUBLICATION_OWNER_OUTCOME_ENVELOPE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NODE_DEBT_STATE,
} from './publication-active-gate-handoff-contract-constants.js';
import {
  normalizePublicationActiveGateHandoffNodeIdList,
} from './publication-active-gate-handoff-contract-helpers.js';

const PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
    reasonCode:
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
    runtimePromotionAllowed: false,
    matches: (evidence) =>
      evidence.reconcileRequirement ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT.REQUIRED,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.UNAVAILABLE,
    reasonCode:
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.EXPECTED_COHORT_UNAVAILABLE,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF,
    runtimePromotionAllowed: false,
    matches: (evidence) =>
      evidence.expectedNodeIds.length === NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
    reasonCode:
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
        .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
    runtimePromotionAllowed: false,
    matches: (evidence) =>
      evidence.pendingReconcileNodeIds.length > NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
    reasonCode:
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
    runtimePromotionAllowed: false,
    matches: (evidence) =>
      evidence.pendingRecoveryNodeIds.length > NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED,
    reasonCode:
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
        .PUBLISHED_ACTIVE_COVERAGE_INCOMPLETE,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF,
    runtimePromotionAllowed: false,
    matches: (evidence) =>
      evidence.missingPublishedNodeIds.length > NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE,
    reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.COMPLETE,
    nextAction:
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.ADMIT_ACTIVE_GATE,
    runtimePromotionAllowed: true,
    matches: () => true,
  }),
]);

const PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT_RULES =
  Object.freeze([
    Object.freeze({
      requirement:
        PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT.REQUIRED,
      matches: (snapshot) =>
        snapshot.publicationPending === true &&
        snapshot.unpublishedObservation === true &&
        snapshot.nodeDebtState ===
          PUBLICATION_ACTIVE_GATE_HANDOFF_NODE_DEBT_STATE.ABSENT &&
        snapshot.prioritySpreadPending !== true,
    }),
    Object.freeze({
      requirement:
        PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT.NOT_REQUIRED,
      matches: () => true,
    }),
  ]);

const PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_DECISION_RULES = Object.freeze([
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_BLOCKED,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_OBSERVE_ACTIVE_GATE_TARGETS(),
    matches: (evidence) =>
      evidence.targetNodeIds.length === NUM.ZERO,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_BLOCKED,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_REFRESH_SNAPSHOT_COVERAGE(),
    matches: (evidence) =>
      evidence.durablePublication.stale === true ||
      evidence.snapshotCoverage.stale === true,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_PENDING,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION(),
    matches: (evidence) =>
      evidence.durablePublication.covered !== true,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_OBSERVE_SNAPSHOT_COVERAGE(),
    matches: (evidence) =>
      evidence.snapshotCoverage.covered !== true ||
      evidence.presence.complete !== true,
  }),
  Object.freeze({
    state: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED,
    nextLegalAction:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_PROMOTE_ACTIVE_GATE(),
    matches: () => true,
  }),
]);

// Helper getters to avoid early reference errors
function PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_OBSERVE_ACTIVE_GATE_TARGETS() {
  return 'observe_active_gate_targets';
}
function PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_REFRESH_SNAPSHOT_COVERAGE() {
  return 'refresh_snapshot_coverage';
}
function PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_RECONCILE_OWNER_MEMBERSHIP_PUBLICATION() {
  return 'reconcile_owner_membership_publication';
}
function PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_OBSERVE_SNAPSHOT_COVERAGE() {
  return 'observe_snapshot_coverage';
}
function PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_NEXT_ACTION_PROMOTE_ACTIVE_GATE() {
  return 'promote_active_gate';
}

function decidePublicationActiveGateHandoff(evidence) {
  return PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_RULES.find((rule) =>
    rule.matches(evidence),
  );
}

function resolvePublicationActiveGateOwnerOutcomeState(contract = null) {
  if (!isPublicationActiveGateHandoffRecord(contract)) {
    return OWNER_OUTCOME_STATE.FAILED;
  }
  if (contract.state === PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE) {
    return OWNER_OUTCOME_STATE.READY;
  }
  if (contract.state === PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING) {
    return OWNER_OUTCOME_STATE.PENDING;
  }
  if (contract.state === PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED) {
    return OWNER_OUTCOME_STATE.DEFERRED;
  }
  return OWNER_OUTCOME_STATE.BLOCKED;
}

function resolvePublicationActiveGateOwnerOutcomeFreshness(contract = null) {
  if (!isPublicationActiveGateHandoffRecord(contract)) {
    return OWNER_OUTCOME_FRESHNESS.UNKNOWN;
  }
  if (contract.state === PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.COMPLETE) {
    return OWNER_OUTCOME_FRESHNESS.FRESH;
  }
  if (
    contract.state === PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING ||
    contract.state === PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.DEGRADED
  ) {
    return OWNER_OUTCOME_FRESHNESS.STALE;
  }
  return OWNER_OUTCOME_FRESHNESS.UNKNOWN;
}

function buildPublicationActiveGateOwnerOutcomeContract(value = {}) {
  const ownerOutcomeState = resolvePublicationActiveGateOwnerOutcomeState(
    value,
  );
  return Object.freeze({
    owner: PUBLICATION_OWNER_OUTCOME_ENVELOPE.OWNER,
    boundary: PUBLICATION_OWNER_OUTCOME_ENVELOPE.BOUNDARY,
    state: ownerOutcomeState,
    outcome:
      typeof value?.state === TYPEOF.STRING ?
        value.state :
        PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.UNAVAILABLE,
    reasonCodes:
      typeof value?.reasonCode === TYPEOF.STRING ?
        [value.reasonCode] :
        PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
    nextAction:
      typeof value?.nextAction === TYPEOF.STRING ?
        value.nextAction :
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.OBSERVE_OWNER_HANDOFF,
    freshness: resolvePublicationActiveGateOwnerOutcomeFreshness(value),
    revision:
      Number.isFinite(value?.publicationEpoch) ?
        value.publicationEpoch :
        PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH,
    retryAfterMs: PUBLICATION_ACTIVE_GATE_HANDOFF_RETRY.RETRY_AFTER_MS,
    terminal:
      ownerOutcomeState === OWNER_OUTCOME_STATE.BLOCKED ||
      ownerOutcomeState === OWNER_OUTCOME_STATE.FAILED,
  });
}

function buildPublicationActiveGateAcknowledgementRule(value = {}) {
  const pendingRecoveryNodeIdSet = new Set(
    normalizePublicationActiveGateHandoffNodeIdList(
      value.pendingRecoveryNodeIds,
    ),
  );
  const requiredAckNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    normalizePublicationActiveGateHandoffNodeIdList(
      value.expectedNodeIds,
    ).filter((nodeId) => !pendingRecoveryNodeIdSet.has(nodeId)),
  );
  const publishedNodeIdSet = new Set(
    normalizePublicationActiveGateHandoffNodeIdList(
      value.publishedActiveNodeIds,
    ),
  );
  const acknowledgedNodeIds = requiredAckNodeIds.filter((nodeId) =>
    publishedNodeIdSet.has(nodeId),
  );
  const pendingAckNodeIds = requiredAckNodeIds.filter((nodeId) =>
    !publishedNodeIdSet.has(nodeId),
  );
  return Object.freeze({
    requiredAckNodeIds,
    acknowledgedNodeIds,
    pendingAckNodeIds,
    acknowledgementSatisfied: pendingAckNodeIds.length === NUM.ZERO,
  });
}

function buildPublicationActiveGateDiagnosticVocabulary() {
  return Object.freeze({
    state: Object.freeze(Object.values(PUBLICATION_ACTIVE_GATE_HANDOFF_STATE)),
    reasonCode: Object.freeze(
      Object.values(PUBLICATION_ACTIVE_GATE_HANDOFF_REASON),
    ),
    nextAction: Object.freeze(
      Object.values(PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION),
    ),
    catchupReason: Object.freeze(
      Object.values(PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON),
    ),
    workflowReason: Object.freeze(
      Object.values(PUBLICATION_OPERATION_WORKFLOW_HANDOFF_REASON),
    ),
  });
}

function buildPublicationActiveGateCrossOwnerHandoffContract(value = {}) {
  const producerOwnerOutcome =
    buildPublicationActiveGateOwnerOutcomeContract(value);
  const acknowledgementRule =
    buildPublicationActiveGateAcknowledgementRule(value);
  const revisionObserved =
    Number.isFinite(value.publicationEpoch) &&
    value.publicationEpoch > PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH;
  const freshnessObserved =
    producerOwnerOutcome.freshness === OWNER_OUTCOME_FRESHNESS.FRESH;
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    producerOwnerOutcome,
    consumerPrecondition: Object.freeze({
      consumerOwner: PUBLICATION_ACTIVE_GATE_CONSUMER_HANDOFF.ACTIVE_GATE_OWNER,
      consumerBoundary: PUBLICATION_ACTIVE_GATE_CONSUMER_HANDOFF.BOUNDARY,
      reconcileRequirement: value.reconcileRequirement,
      observedNextAction: value.nextAction,
      requiredNextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.ADMIT_ACTIVE_GATE,
      promotionAllowed: value.runtimePromotionAllowed === true,
    }),
    freshnessRevisionRequirement: Object.freeze({
      requiredFreshness: OWNER_OUTCOME_FRESHNESS.FRESH,
      observedFreshness: producerOwnerOutcome.freshness,
      publicationEpoch: value.publicationEpoch,
      durablePublicationRevision:
        value.activeGateCatchupFence?.durablePublication?.publicationRevision ??
        PUBLICATION_ACTIVE_GATE_HANDOFF_OBSERVATION.UNOBSERVED,
      snapshotCoverageRevision:
        value.activeGateCatchupFence?.snapshotCoverage?.revision ??
        PUBLICATION_ACTIVE_GATE_HANDOFF_OBSERVATION.UNOBSERVED,
      revisionObserved,
      requirementSatisfied: revisionObserved && freshnessObserved,
    }),
    acknowledgementRule,
    retryDeferBehavior: Object.freeze({
      retryAfterMs: PUBLICATION_ACTIVE_GATE_HANDOFF_RETRY.RETRY_AFTER_MS,
      deferConsumer: value.runtimePromotionAllowed !== true,
      ownerReconcileRequired:
        value.nextAction ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      ownerRecoveryWaitRequired:
        value.nextAction ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
      downstreamDeferred:
        isPublicationActiveGateHandoffRecord(value.operationWorkflowHandoff),
      downstreamOwner:
        value.operationWorkflowHandoff?.downstreamOwner ??
        PUBLICATION_ACTIVE_GATE_HANDOFF_OBSERVATION.NOT_REQUIRED,
      downstreamBoundary:
        value.operationWorkflowHandoff?.downstreamBoundary ??
        PUBLICATION_ACTIVE_GATE_HANDOFF_OBSERVATION.NOT_REQUIRED,
    }),
    terminalCondition: Object.freeze({
      terminal: producerOwnerOutcome.terminal,
      terminalState: producerOwnerOutcome.state,
      terminalReasonCodes: producerOwnerOutcome.reasonCodes,
    }),
    diagnosticVocabulary: buildPublicationActiveGateDiagnosticVocabulary(),
  });
}

function isPublicationActiveGateHandoffRecord(value) {
  return Boolean(value) &&
    typeof value === TYPEOF.OBJECT &&
    !Array.isArray(value);
}

export {
  PUBLICATION_ACTIVE_GATE_HANDOFF_DECISION_RULES,
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECONCILE_REQUIREMENT_RULES,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_DECISION_RULES,
  decidePublicationActiveGateHandoff,
  resolvePublicationActiveGateOwnerOutcomeState,
  resolvePublicationActiveGateOwnerOutcomeFreshness,
  buildPublicationActiveGateOwnerOutcomeContract,
  buildPublicationActiveGateAcknowledgementRule,
  buildPublicationActiveGateDiagnosticVocabulary,
  buildPublicationActiveGateCrossOwnerHandoffContract,
};
