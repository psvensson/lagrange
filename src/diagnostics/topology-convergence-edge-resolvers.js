import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SOURCE_ORDER_BASE,
  EDGE_STATE,
  REASON,
  PUBLICATION_STATE_RULES,
  SELECTED_SNAPSHOT_ADMIN_QUERY_NODE_ID_PREFIXES,
  SELECTED_SNAPSHOT_ADMIN_QUERY_LANE_MARKER,
  ACTIVE_GATE_SNAPSHOT_CAUSE_RULES,
  ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_RULES,
  OWNER_QUEUE_DEPTH_STATE_OBSERVED,
  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
  TOPOLOGY_OPERATOR_WITNESS_EDGE_STATE_BY_STEP,
  PUBLICATION_STATUS_PUBLISHED,
  PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING,
  PUBLICATION_PENDING_STATUS_SET,
  PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
  ACTIVE_GATE_STATE_TIMED_OUT,
  READINESS_RECOVERABILITY_TERMINAL,
  READINESS_SUPPORT_PATH,
  ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
  ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
  SELECTED_SNAPSHOT_ADMIN_QUERY_TIMEOUT_PREFIX,
  SELECTED_SNAPSHOT_ADMIN_QUERY_CONNECTION_CLOSED_PREFIX,
  SELECTED_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_FRAGMENT,
  SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_TIMEOUT_FRAGMENT,
  SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_PARTICIPANT_FAILURE_FRAGMENT,
  SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_FRAGMENT,
  SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_SUFFIX,
  SELECTED_SNAPSHOT_FORCED_REPAIR_FAILURE_FRAGMENT,
  SOURCE_FIELD,
} from './topology-convergence-constants.js';

import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
} from '../control-plane/publication-active-gate-handoff-contract.js';

import {
  asRecord,
  firstText,
  textOrUnknown,
  numberOrUnknown,
  numberOrZero,
  arrayOrEmpty,
  booleanVariant,
  isNonTerminalTopologyOperatorWitness,
} from './topology-convergence-normalizers.js';

import {
  buildOperationProgressCompatibilityProjection,
} from '../rebalancer/operation-progress-observer.js';

// Mutating Resolvers
export function resolvePublicationState(evidence, reasons) {
  const publicationPublished =
    evidence.publicationStatus === PUBLICATION_STATUS_PUBLISHED ||
    isPublicationPendingEvidence(evidence) !== true;
  reasons.push(
    publicationPublished ?
      REASON.PUBLICATION_PUBLISHED :
      REASON.PUBLICATION_PENDING,
  );
  if (
    publicationPublished !== true &&
    isNonTerminalTopologyOperatorWitness(evidence.topologyOperatorWitness)
  ) {
    return EDGE_STATE.DEFERRED;
  }
  const decision = PUBLICATION_STATE_RULES.find((rule) =>
    rule.matches(evidence),
  );
  reasons.push(...decision.reasons);
  return decision.state;
}

export function isPublicationPendingEvidence(evidence) {
  return isPublicationPendingFlagEvidence(evidence) ||
    PUBLICATION_PENDING_STATUS_SET.has(evidence.publicationStatus) ||
    evidence.recoveryProtocolState ===
      PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING;
}

export function isPublicationPendingFlagEvidence(evidence) {
  return evidence.publicationPending === true &&
    evidence.missingPublishedCount === SOURCE_ORDER_BASE;
}

export function resolvePriorityRecoveryState(priorityRecoveryEvidence, reasons) {
  const witnessState =
    resolveTopologyOperatorWitnessEdgeState(priorityRecoveryEvidence);
  if (witnessState !== EDGE_STATE.UNKNOWN) {
    reasons.push(
      witnessState === EDGE_STATE.BLOCKED ?
        REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED :
        REASON.PRIORITY_RECOVERY_RETRYABLE,
    );
    return witnessState;
  }
  if (priorityRecoveryEvidence.semanticStateIds.length === SOURCE_ORDER_BASE) {
    reasons.push(REASON.PRIORITY_RECOVERY_SATISFIED);
    return EDGE_STATE.SATISFIED;
  }
  if (
    isOnlyRecoveringInFlightPriorityRecoveryEvidence(priorityRecoveryEvidence) ||
    priorityRecoveryEvidence.eventDrivenWait === true
  ) {
    reasons.push(REASON.PRIORITY_RECOVERY_RETRYABLE);
    return EDGE_STATE.RETRYABLE;
  }
  if (priorityRecoveryEvidence.priorityBlockedPartitionCount > SOURCE_ORDER_BASE) {
    reasons.push(REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED);
    if (priorityRecoveryEvidence.semanticStateIds.includes(
      PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
    )) {
      reasons.push(REASON.PRIORITY_RECOVERY_RETRYABLE);
    }
    return EDGE_STATE.BLOCKED;
  }
  if (priorityRecoveryEvidence.semanticStateIds.includes(
    PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
  )) {
    reasons.push(REASON.PRIORITY_RECOVERY_RETRYABLE);
    return EDGE_STATE.RETRYABLE;
  }
  reasons.push(REASON.PRIORITY_RECOVERY_PROGRESS_BLOCKED);
  return EDGE_STATE.BLOCKED;
}

export function resolveTopologyOperatorWitnessEdgeState(evidence) {
  const state = evidence.topologyOperatorWitnessState;
  return TOPOLOGY_OPERATOR_WITNESS_EDGE_STATE_BY_STEP.get(state) ||
    EDGE_STATE.UNKNOWN;
}

export function isOnlyRecoveringInFlightPriorityRecoveryEvidence(evidence) {
  return evidence.semanticStateIds.every((semanticStateId) =>
    semanticStateId === PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT,
  );
}

export function resolveActiveGateSnapshotState(activeGate, progress, handoff, reasons) {
  if (progress.snapshotCoverageComplete === true || activeGate.ready === true) {
    reasons.push(REASON.ACTIVE_GATE_READY);
    return EDGE_STATE.SATISFIED;
  }
  if (activeGate.state === ACTIVE_GATE_STATE_TIMED_OUT) {
    reasons.push(REASON.ACTIVE_GATE_TIMED_OUT);
    appendActiveGateOwnerCohortReason(progress, handoff, reasons);
    reasons.push(REASON.SNAPSHOT_COVERAGE_INCOMPLETE);
    appendActiveGateSnapshotCauseReasons(progress, reasons);
    if (progress.selectedSnapshotRepairDeferred === true) {
      reasons.push(REASON.SNAPSHOT_REPAIR_DEFERRED);
    }
    if (isNonTerminalTopologyOperatorWitness(progress.topologyOperatorWitness)) {
      return EDGE_STATE.DEFERRED;
    }
    return EDGE_STATE.BLOCKED;
  }
  if (Object.keys(progress).length === SOURCE_ORDER_BASE) {
    reasons.push(REASON.EVIDENCE_MISSING);
    return EDGE_STATE.UNKNOWN;
  }
  appendActiveGateOwnerCohortReason(progress, handoff, reasons);
  reasons.push(REASON.SNAPSHOT_COVERAGE_INCOMPLETE);
  appendActiveGateSnapshotCauseReasons(progress, reasons);
  if (progress.selectedSnapshotRepairDeferred === true) {
    reasons.push(REASON.SNAPSHOT_REPAIR_DEFERRED);
  }
  return EDGE_STATE.DEFERRED;
}

export function hasActiveGateOwnerReconcilePending(progress, handoff = {}) {
  return (
    textOrUnknown(handoff.reasonCode) ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING ||
    textOrUnknown(progress.activeGateOwnerCohortState) ===
      ACTIVE_GATE_OWNER_COHORT_STATE_PENDING ||
    textOrUnknown(progress.activeGateOwnerCohortReasonCode) ===
      ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING
  );
}

export function appendActiveGateOwnerCohortReason(progress, handoff, reasons) {
  if (hasActiveGateOwnerReconcilePending(progress, handoff)) {
    reasons.push(REASON.OWNER_RECONCILE_PENDING);
  }
}

export function selectActiveGateSnapshotOwnerEdge(evidence) {
  const rule = ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_RULES.find((candidate) =>
    candidate.matches(evidence),
  );
  return rule?.ownerEdge || ABSENT_VALUE;
}

export function selectActiveGateSnapshotCauseReasons(progress) {
  const evidence = normalizeActiveGateSnapshotCauseEvidence(progress);
  return ACTIVE_GATE_SNAPSHOT_CAUSE_RULES
    .filter((rule) => rule.matches(evidence))
    .map((rule) => rule.reason);
}

export function appendActiveGateSnapshotCauseReasons(progress, reasons) {
  reasons.push(...selectActiveGateSnapshotCauseReasons(progress));
}

export function normalizeActiveGateSnapshotCauseEvidence(progress) {
  const selectedSnapshotError = firstText(
    progress.selectedSnapshotError,
    progress.selectedError,
    progress.readinessDelay?.error,
  );
  const selectedSnapshotNodeId = firstText(
    progress.selectedSnapshotNodeId,
    progress.selectedNodeId,
    selectSnapshotNodeIdFromAdminQueryFailure(selectedSnapshotError),
  );
  const selectedSnapshotTimeoutMs = numberOrUnknown(
    progress.selectedSnapshotTimeoutMs,
  );
  const authoritativeControlSnapshotRepairFailure =
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_FRAGMENT,
    );
  const selectedSnapshotSourceTimeout =
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_ADMIN_QUERY_TIMEOUT_PREFIX,
    ) &&
    (
      selectedSnapshotNodeId === UNKNOWN_VALUE ||
      selectedSnapshotError.includes(selectedSnapshotNodeId)
    );
  const selectedSnapshotSourceTransportClosed =
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_ADMIN_QUERY_CONNECTION_CLOSED_PREFIX,
    ) &&
    selectedSnapshotError.includes(SELECTED_SNAPSHOT_ADMIN_QUERY_LANE_MARKER) &&
    (
      selectedSnapshotNodeId === UNKNOWN_VALUE ||
      selectedSnapshotError.includes(selectedSnapshotNodeId)
    );
  const forcedRepairSnapshotTimeout =
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_FORCED_REPAIR_FAILURE_FRAGMENT,
    ) &&
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_FRAGMENT,
    );
  const authoritativeControlSnapshotQueryTimeout =
    authoritativeControlSnapshotRepairFailure === true &&
    selectedSnapshotError.includes(
      SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_TIMEOUT_FRAGMENT,
    );
  const authoritativeControlSnapshotQueryPressure =
    authoritativeControlSnapshotQueryTimeout !== true &&
    authoritativeControlSnapshotRepairFailure === true &&
    (
      selectedSnapshotError.includes(
        SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_PARTICIPANT_FAILURE_FRAGMENT,
      ) ||
      selectedSnapshotError.includes(
        SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_FRAGMENT,
      ) &&
      selectedSnapshotError.includes(
        SELECTED_SNAPSHOT_AUTHORITATIVE_NODES_CONNECTION_CLOSED_SUFFIX,
      )
    );

  return Object.freeze({
    selectedSnapshotError,
    selectedSnapshotNodeId,
    selectedSnapshotTimeoutMs,
    selectedSnapshotSourceTimeout,
    selectedSnapshotSourceTransportClosed,
    forcedRepairSnapshotTimeout,
    authoritativeControlSnapshotQueryTimeout,
    authoritativeControlSnapshotQueryPressure,
  });
}

export function selectSnapshotNodeIdFromAdminQueryFailure(selectedSnapshotError) {
  const matchedPrefix = SELECTED_SNAPSHOT_ADMIN_QUERY_NODE_ID_PREFIXES.find(
    (prefix) => selectedSnapshotError.includes(prefix),
  );
  if (!matchedPrefix) {
    return UNKNOWN_VALUE;
  }
  const prefixIndex = selectedSnapshotError.indexOf(matchedPrefix);
  const nodeIdStart =
    prefixIndex + matchedPrefix.length;
  const laneMarkerIndex = selectedSnapshotError.indexOf(
    SELECTED_SNAPSHOT_ADMIN_QUERY_LANE_MARKER,
    nodeIdStart,
  );
  if (laneMarkerIndex <= nodeIdStart) {
    return UNKNOWN_VALUE;
  }
  return selectedSnapshotError.slice(nodeIdStart, laneMarkerIndex);
}

export function resolveReadinessState(readiness, activeGate, reasons) {
  if (activeGate.ready === true) {
    reasons.push(REASON.READINESS_SATISFIED);
    return EDGE_STATE.SATISFIED;
  }
  if (
    readiness.supportPath ===
    READINESS_SUPPORT_PATH.INHERITED_ACTIVE_GATE_NO_PROGRESS
  ) {
    reasons.push(REASON.READINESS_INHERITED_ACTIVE_GATE_NO_PROGRESS);
    return EDGE_STATE.DEFERRED;
  }
  if (readiness.recoverability === READINESS_RECOVERABILITY_TERMINAL) {
    reasons.push(REASON.READINESS_TERMINAL);
    return EDGE_STATE.TERMINAL_FAILED;
  }
  if (Object.keys(readiness).length === SOURCE_ORDER_BASE) {
    reasons.push(REASON.EVIDENCE_MISSING);
    return EDGE_STATE.UNKNOWN;
  }
  reasons.push(REASON.READINESS_RETRYABLE);
  return EDGE_STATE.RETRYABLE;
}

// Diagnostic Source Builders
export function buildPriorityRecoveryEvidenceSource(evidence) {
  const operationProgressProjection =
    buildOperationProgressCompatibilityProjection(
      evidence.operationProgressRecord,
    );
  if (hasOperationProgressProjectionSource(operationProgressProjection)) {
    return buildOperationProgressProjectionSource(operationProgressProjection);
  }
  const topologyOperatorWitness = asRecord(evidence.topologyOperatorWitness);
  return Object.freeze({
    ...buildTopologyOperatorEvidenceSource(topologyOperatorWitness),
    ...buildPriorityRecoveryObservationSource(evidence),
  });
}

export function hasOperationProgressProjectionSource(operationProgressProjection) {
  return operationProgressProjection.topologyOperatorCurrentStepId !==
    'operation_progress_projection_unavailable'; // OPERATION_PROGRESS_PROJECTION_UNAVAILABLE
}

export function buildOperationProgressProjectionSource(operationProgressProjection) {
  return Object.freeze({
    topologyOperatorId: textOrUnknown(
      operationProgressProjection.operationId,
    ),
    topologyOperatorKind: textOrUnknown(
      operationProgressProjection.resource,
    ),
    topologyOperatorCurrentStepId: textOrUnknown(
      operationProgressProjection.topologyOperatorCurrentStepId,
    ),
    topologyOperatorCurrentStepState: textOrUnknown(
      operationProgressProjection.topologyOperatorCurrentStepState,
    ),
    operationProgressResource: textOrUnknown(
      operationProgressProjection.operationProgressResource,
    ),
    operationProgressState: textOrUnknown(
      operationProgressProjection.operationProgressState,
    ),
    operationProgressLastAcceptedEventId: textOrUnknown(
      operationProgressProjection.operationProgressLastAcceptedEventId,
    ),
    topologyOperatorNextAction: textOrUnknown(
      operationProgressProjection.topologyOperatorNextAction,
    ),
  });
}

export function buildTopologyOperatorEvidenceSource(topologyOperatorWitness) {
  if (isTopologyOperatorWitnessPresent(topologyOperatorWitness)) {
    return Object.freeze({
      topologyOperatorId: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.OPERATOR_ID],
      ),
      topologyOperatorKind: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.KIND],
      ),
      topologyOperatorCurrentStepId: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.CURRENT_STEP_ID],
      ),
      topologyOperatorCurrentStepState: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.CURRENT_STEP_STATE],
      ),
      topologyOperatorNextAction: textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.NEXT_ACTION],
      ),
      topologyOperatorDeadlineMs: numberOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.DEADLINE_MS],
      ),
      topologyOperatorLastObservedAtMs: numberOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.LAST_OBSERVED_AT_MS],
      ),
    });
  }
  return Object.freeze({});
}

export function isTopologyOperatorWitnessPresent(witness) {
  return (
    Object.keys(asRecord(witness)).length > SOURCE_ORDER_BASE &&
    textOrUnknown(witness.currentStepId) !== UNKNOWN_VALUE &&
    textOrUnknown(witness.nextAction) !== UNKNOWN_VALUE
  );
}

export function buildPriorityRecoveryObservationSource(evidence) {
  return Object.freeze({
    ...buildPriorityRecoveryObservationEntry(
      evidence.waitModes,
      'waitModes', // PRIORITY_RECOVERY_OBSERVATION_FIELD_WAIT_MODES
    ),
    ...buildPriorityRecoveryObservationEntry(
      evidence.nextRequiredActions,
      'nextRequiredActions', // PRIORITY_RECOVERY_OBSERVATION_FIELD_NEXT_REQUIRED_ACTIONS
    ),
    ...buildPriorityRecoveryObservationEntry(
      evidence.actuationStates,
      'actuationStates', // PRIORITY_RECOVERY_OBSERVATION_FIELD_ACTUATION_STATES
    ),
  });
}

export function buildPriorityRecoveryObservationEntry(values, fieldName) {
  return values.length > SOURCE_ORDER_BASE ?
    Object.freeze({[fieldName]: values.join(',')}) :
    Object.freeze({});
}

export function buildSelectedSnapshotObservationRetrySource(progress) {
  const retryAfterMs = numberOrUnknown(
    progress.selectedSnapshotObservationRetryAfterMs,
  );
  if (retryAfterMs === UNKNOWN_VALUE) {
    return {};
  }
  return {selectedSnapshotObservationRetryAfterMs: retryAfterMs};
}

export function buildPublicationActiveGateHandoffSource(handoff, progress) {
  const source = {};
  const state = firstText(
    handoff.state,
    progress.publicationActiveGateHandoffState,
  );
  if (state !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffState = state;
  }
  const reasonCode = firstText(
    handoff.reasonCode,
    progress.publicationActiveGateHandoffReasonCode,
  );
  if (reasonCode !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffReasonCode = reasonCode;
  }
  const nextAction = firstText(
    handoff.nextAction,
    progress.publicationActiveGateHandoffNextAction,
  );
  if (nextAction !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffNextAction = nextAction;
  }
  const runtimePromotionAllowed = booleanVariant(
    handoff.runtimePromotionAllowed ??
      progress.publicationActiveGateHandoffRuntimePromotionAllowed,
  );
  if (runtimePromotionAllowed !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffRuntimePromotionAllowed =
      runtimePromotionAllowed;
  }
  const pendingRecoveryNodeIds = resolveOwnerRecoveryPendingNodeIds(
    handoff,
    progress,
  );
  const pendingRecoveryCount = numberOrUnknown(
    handoff.pendingRecoveryCount ??
      progress.publicationActiveGateHandoffPendingRecoveryCount,
  );
  const ownerRecoveryPendingWriteCount =
    isOwnerRecoveryWaitHandoffContract(handoff, progress) === true ?
      resolveOwnerRecoveryPendingWriteCount(handoff, progress) :
      SOURCE_ORDER_BASE;
  if (
    pendingRecoveryCount !== UNKNOWN_VALUE ||
    pendingRecoveryNodeIds.length > SOURCE_ORDER_BASE ||
    ownerRecoveryPendingWriteCount > SOURCE_ORDER_BASE
  ) {
    source.publicationActiveGateHandoffPendingRecoveryCount = Math.max(
      pendingRecoveryCount === UNKNOWN_VALUE ?
        SOURCE_ORDER_BASE :
        pendingRecoveryCount,
      pendingRecoveryNodeIds.length,
      ownerRecoveryPendingWriteCount,
    );
  }
  if (pendingRecoveryNodeIds.length > SOURCE_ORDER_BASE) {
    source.publicationActiveGateHandoffPendingRecoveryNodeIds = pendingRecoveryNodeIds.join(',');
  }
  const pendingReconcileCount = numberOrUnknown(
    handoff.pendingReconcileCount ??
      progress.publicationActiveGateHandoffPendingReconcileCount,
  );
  if (pendingReconcileCount !== UNKNOWN_VALUE) {
    source.publicationActiveGateHandoffPendingReconcileCount =
      pendingReconcileCount;
  }
  const pendingReconcileNodeIds = arrayOrEmpty(
    handoff.pendingReconcileNodeIds ||
      progress.publicationActiveGateHandoffPendingReconcileNodeIds,
  );
  if (pendingReconcileNodeIds.length > SOURCE_ORDER_BASE) {
    source.publicationActiveGateHandoffPendingReconcileNodeIds = pendingReconcileNodeIds.join(',');
  }
  return source;
}

export function buildOwnerRecoveryQueueSource(progress, handoff) {
  const handoffContract = selectPublicationActiveGateHandoffContract(handoff);
  if (!hasOwnerRecoveryQueueEvidence(progress, handoffContract)) {
    return {};
  }
  const queueDepth = asRecord(progress.selectedControlPlaneOwnerQueueDepth);
  const hasObservedQueueDepth =
    Object.keys(queueDepth).length > SOURCE_ORDER_BASE;
  const ownerRecoveryPendingWriteCount =
    resolveOwnerRecoveryPendingWriteCount(handoffContract, progress);
  const source = {
    selectedControlPlaneOwnerQueueDepthState:
      hasObservedQueueDepth ||
      ownerRecoveryPendingWriteCount > SOURCE_ORDER_BASE ?
        OWNER_QUEUE_DEPTH_STATE_OBSERVED :
        UNKNOWN_VALUE,
  };
  const pendingWrites = hasObservedQueueDepth ?
    numberOrUnknown(queueDepth.pendingWrites) :
    (ownerRecoveryPendingWriteCount > SOURCE_ORDER_BASE ?
      ownerRecoveryPendingWriteCount :
      UNKNOWN_VALUE);
  if (pendingWrites !== UNKNOWN_VALUE) {
    source.selectedControlPlaneOwnerQueuePendingWrites = pendingWrites;
  }
  const pendingWriteGrowthCount = numberOrUnknown(
    queueDepth.pendingWriteGrowthCount,
  );
  if (pendingWriteGrowthCount !== UNKNOWN_VALUE) {
    source.selectedControlPlaneOwnerQueuePendingWriteGrowthCount =
      pendingWriteGrowthCount;
  }
  return {
    ...source,
    ...buildMembershipPublicationHandoffOutcomeSource(progress, handoff),
  };
}

export function selectPublicationActiveGateHandoffContract(handoff) {
  return asRecord(handoff);
}

function buildKnownMembershipPublicationHandoffOutcomeSource({
  state,
  reasonCode,
  enqueued,
  retryAfterMs,
}) {
  return {
    membershipPublicationHandoffOutcomeState: state,
    ...(reasonCode !== UNKNOWN_VALUE ? {
      membershipPublicationHandoffOutcomeReasonCode: reasonCode,
    } : {}),
    ...(enqueued !== UNKNOWN_VALUE ? {
      membershipPublicationHandoffOutcomeEnqueued: enqueued,
    } : {}),
    ...(retryAfterMs !== UNKNOWN_VALUE ? {
      membershipPublicationHandoffOutcomeRetryAfterMs: retryAfterMs,
    } : {}),
  };
}

export function buildMembershipPublicationHandoffOutcomeSource(progress, handoff) {
  const observed = {
    state: textOrUnknown(progress.membershipPublicationHandoffOutcomeState),
    reasonCode: textOrUnknown(
      progress.membershipPublicationHandoffOutcomeReasonCode,
    ),
    enqueued: booleanVariant(
      progress.membershipPublicationHandoffOutcomeEnqueued,
    ),
    retryAfterMs: numberOrUnknown(
      progress.membershipPublicationHandoffOutcomeRetryAfterMs,
    ),
  };
  if (observed.state !== UNKNOWN_VALUE) {
    return buildKnownMembershipPublicationHandoffOutcomeSource(observed);
  }
  const handoffContract = selectPublicationActiveGateHandoffContract(handoff);
  const shouldSynthesizeOwnerOutcome =
    handoffContract &&
    (
      handoffContract.nextAction ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
      isOwnerRecoveryWaitHandoffContract(handoffContract, progress)
    );
  return shouldSynthesizeOwnerOutcome ?
    buildKnownMembershipPublicationHandoffOutcomeSource({
      state: MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_STATE_WRITE_DEFERRED,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      enqueued: false,
      retryAfterMs: SOURCE_ORDER_BASE,
    }) :
    {};
}

export function hasOwnerRecoveryQueueEvidence(progress, handoffContract) {
  const queueDepth = asRecord(progress.selectedControlPlaneOwnerQueueDepth);
  if (Object.keys(queueDepth).length > SOURCE_ORDER_BASE ||
    textOrUnknown(progress.membershipPublicationHandoffOutcomeState) !==
      UNKNOWN_VALUE ||
    textOrUnknown(progress.membershipPublicationHandoffOutcomeReasonCode) !==
      UNKNOWN_VALUE ||
    booleanVariant(progress.membershipPublicationHandoffOutcomeEnqueued) !==
      UNKNOWN_VALUE ||
    numberOrUnknown(progress.membershipPublicationHandoffOutcomeRetryAfterMs) !==
      UNKNOWN_VALUE) {
    return true;
  }
  if (
    handoffContract &&
    (
      handoffContract.nextAction ===
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
      isOwnerRecoveryWaitHandoffContract(handoffContract, progress)
    )
  ) {
    return true;
  }
  return false;
}

export function isOwnerRecoveryWaitHandoffContract(handoffContract, progress = null) {
  const nextAction =
    textOrUnknown(handoffContract?.nextAction) !== UNKNOWN_VALUE ?
      handoffContract.nextAction :
      textOrUnknown(progress?.publicationActiveGateHandoffNextAction);
  return nextAction ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY &&
    resolveOwnerRecoveryPendingWriteCount(handoffContract, progress) >
      SOURCE_ORDER_BASE;
}

export function resolveOwnerRecoveryPendingNodeIds(handoffContract, progress = null) {
  const handoffRecoveryNodeIds = arrayOrEmpty(
    handoffContract?.pendingRecoveryNodeIds,
  );
  if (handoffRecoveryNodeIds.length > SOURCE_ORDER_BASE) {
    return handoffRecoveryNodeIds;
  }
  const progressHandoffRecoveryNodeIds = arrayOrEmpty(
    progress?.publicationActiveGateHandoffPendingRecoveryNodeIds,
  );
  if (progressHandoffRecoveryNodeIds.length > SOURCE_ORDER_BASE) {
    return progressHandoffRecoveryNodeIds;
  }
  if (
    isOwnerRecoveryWaitHandoffContract(handoffContract, progress) !== true
  ) {
    return [];
  }
  return arrayOrEmpty(progress?.activeGateOwnerCohortPendingRecoveryNodeIds);
}

export function resolveOwnerRecoveryPendingWriteCount(handoffContract, progress = null) {
  const pendingRecoveryCount = numberOrZero(
    handoffContract?.pendingRecoveryCount,
  );
  if (pendingRecoveryCount > SOURCE_ORDER_BASE) {
    return pendingRecoveryCount;
  }
  const pendingRecoveryNodeCount =
    arrayOrEmpty(handoffContract?.pendingRecoveryNodeIds).length;
  if (pendingRecoveryNodeCount > SOURCE_ORDER_BASE) {
    return pendingRecoveryNodeCount;
  }
  const activeGateOwnerCohortPendingRecoveryCount = numberOrZero(
    progress?.activeGateOwnerCohortPendingRecoveryCount,
  );
  if (activeGateOwnerCohortPendingRecoveryCount > SOURCE_ORDER_BASE) {
    return activeGateOwnerCohortPendingRecoveryCount;
  }
  return arrayOrEmpty(
    progress?.activeGateOwnerCohortPendingRecoveryNodeIds,
  ).length;
}

export function buildActiveGateOwnerCohortSource(progress) {
  const source = {};
  const state = textOrUnknown(progress.activeGateOwnerCohortState);
  if (state !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortState = state;
  }
  const reasonCode = textOrUnknown(progress.activeGateOwnerCohortReasonCode);
  if (reasonCode !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortReasonCode = reasonCode;
  }
  const missingPublishedCount = numberOrUnknown(
    progress.activeGateOwnerCohortMissingPublishedCount,
  );
  if (missingPublishedCount !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortMissingPublishedCount = missingPublishedCount;
  }
  const missingPublishedNodeIds = arrayOrEmpty(
    progress.activeGateOwnerCohortMissingPublishedNodeIds,
  );
  if (missingPublishedNodeIds.length > SOURCE_ORDER_BASE) {
    source.activeGateOwnerCohortMissingPublishedNodeIds = missingPublishedNodeIds.join(',');
  }
  const pendingRecoveryCount = numberOrUnknown(
    progress.activeGateOwnerCohortPendingRecoveryCount,
  );
  if (pendingRecoveryCount !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortPendingRecoveryCount = pendingRecoveryCount;
  }
  const pendingRecoveryNodeIds = arrayOrEmpty(
    progress.activeGateOwnerCohortPendingRecoveryNodeIds,
  );
  if (pendingRecoveryNodeIds.length > SOURCE_ORDER_BASE) {
    source.activeGateOwnerCohortPendingRecoveryNodeIds = pendingRecoveryNodeIds.join(',');
  }
  const pendingReconcileCount = numberOrUnknown(
    progress.activeGateOwnerCohortPendingReconcileCount,
  );
  if (pendingReconcileCount !== UNKNOWN_VALUE) {
    source.activeGateOwnerCohortPendingReconcileCount = pendingReconcileCount;
  }
  const pendingReconcileNodeIds = arrayOrEmpty(
    progress.activeGateOwnerCohortPendingReconcileNodeIds,
  );
  if (pendingReconcileNodeIds.length > SOURCE_ORDER_BASE) {
    source.activeGateOwnerCohortPendingReconcileNodeIds = pendingReconcileNodeIds.join(',');
  }
  return source;
}

export function buildActiveGateSnapshotCauseSource(progress) {
  const evidence = normalizeActiveGateSnapshotCauseEvidence(progress);
  const matchedRules = ACTIVE_GATE_SNAPSHOT_CAUSE_RULES.filter((rule) =>
    rule.matches(evidence),
  );
  if (matchedRules.length === SOURCE_ORDER_BASE) {
    return {};
  }
  const source = {};
  if (evidence.selectedSnapshotNodeId !== UNKNOWN_VALUE) {
    source.selectedSnapshotNodeId = evidence.selectedSnapshotNodeId;
  }
  if (evidence.selectedSnapshotTimeoutMs !== UNKNOWN_VALUE) {
    source.selectedSnapshotTimeoutMs = evidence.selectedSnapshotTimeoutMs;
  }
  for (const rule of matchedRules) {
    source[rule.sourceField] = rule.cause;
  }
  source.activeGateSnapshotOwnerEdge =
    selectActiveGateSnapshotOwnerEdge(evidence);
  return source;
}

export function buildTopologyOperatorWitnessDiagnosticSource(witness) {
  const record = asRecord(witness);
  if (!isTopologyOperatorWitnessPresent(record)) {
    return {};
  }
  return {
    topologyOperatorId: textOrUnknown(record[SOURCE_FIELD.OPERATOR_ID]),
    topologyOperatorKind: textOrUnknown(record[SOURCE_FIELD.KIND]),
    topologyOperatorCurrentStepId: textOrUnknown(
      record[SOURCE_FIELD.CURRENT_STEP_ID],
    ),
    topologyOperatorCurrentStepState: textOrUnknown(
      record[SOURCE_FIELD.CURRENT_STEP_STATE],
    ),
    topologyOperatorNextAction: textOrUnknown(
      record[SOURCE_FIELD.NEXT_ACTION],
    ),
  };
}
