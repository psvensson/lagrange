import {
  SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_FIXTURE_V1,
  SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_RESULT_V1,
  SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GRAPH_V1,
  TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_GRAPH,
  TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT,
  TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT_ABSENT,
  EDGE_ID,
  REPLAY_DOMINANT_REASON_RULES,
  ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
  ABSENT_VALUE,
  UNKNOWN_VALUE,
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
  parseBooleanVariant,
  splitJoinedValues,
  firstRecord,
} from './topology-convergence-normalizers.js';

import {
  selectTopologyConvergenceDominantWitness,
  textOrAbsent,
} from './topology-convergence-owner-witness.js';

import {
  buildTopologyConvergenceGraph,
} from './topology-convergence-graph.js';

export function buildTopologyConvergenceReplayFixture(input = {}, options = {}) {
  const graph = selectTopologyConvergenceReplayGraph(input);
  const expected = buildTopologyConvergenceReplayClassification(graph);
  const sourceArtifact = firstText(
    options.sourceArtifact,
    TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT_ABSENT,
  );

  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_FIXTURE_V1,
    scenario: graph.scenario,
    source: {
      type: isTopologyConvergenceGraph(input) ?
        TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_GRAPH :
        TOPOLOGY_CONVERGENCE_REPLAY_SOURCE_ARTIFACT,
      artifact: sourceArtifact,
      graphSchemaVersion: graph.schemaVersion,
      generatedFrom: graph.generatedFrom,
    },
    expected,
    publicationConvergence: buildReplayPublicationConvergence(graph),
    summary: buildReplaySummary(graph),
  };
}

export function replayTopologyConvergenceFixture(fixture = {}) {
  const graph = buildTopologyConvergenceGraph(fixture);
  const expected = asRecord(fixture.expected);
  const actual = buildTopologyConvergenceReplayClassification(graph);

  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_REPLAY_RESULT_V1,
    fixtureSchemaVersion: textOrAbsent(fixture.schemaVersion),
    scenario: graph.scenario,
    expected,
    actual,
    matches: buildReplayMatchSummary(expected, actual),
    graph,
  };
}

export function selectTopologyConvergenceReplayGraph(input) {
  if (isTopologyConvergenceGraph(input)) {
    return input;
  }
  return buildTopologyConvergenceGraph(input);
}

export function isTopologyConvergenceGraph(input) {
  return asRecord(input).schemaVersion ===
      SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GRAPH_V1 &&
    Array.isArray(input.edges);
}

export function buildTopologyConvergenceReplayClassification(graph) {
  const witness = selectTopologyConvergenceDominantWitness(graph);
  const handoffEdge = selectReplayEdge(
    graph,
    EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
  );

  return {
    firstFrontierEdgeId: witness.edgeId,
    owner: witness.owner,
    boundary: witness.boundary,
    frontierState: witness.frontierState,
    topologyDominantReason: witness.dominantReason,
    dominantReason: selectReplayDominantReason(witness),
    nextAction: selectReplayHandoffNextAction(handoffEdge),
  };
}

export function buildReplayMatchSummary(expected, actual) {
  const firstFrontierEdgeId =
    expected.firstFrontierEdgeId === actual.firstFrontierEdgeId;
  const owner = expected.owner === actual.owner;
  const boundary = expected.boundary === actual.boundary;
  const dominantReason = expected.dominantReason === actual.dominantReason;
  const nextAction = expected.nextAction === actual.nextAction;

  return {
    preserved: [
      firstFrontierEdgeId,
      owner,
      boundary,
      dominantReason,
      nextAction,
    ].every(Boolean),
    firstFrontierEdgeId,
    owner,
    boundary,
    dominantReason,
    nextAction,
  };
}

export function buildReplayPublicationConvergence(graph) {
  const publicationEdge = selectReplayEdge(
    graph,
    EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
  );
  const activeGateEdge = selectReplayEdge(
    graph,
    EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
  );
  const publicationSource = asRecord(publicationEdge.source);
  const activeGateSource = asRecord(activeGateEdge.source);

  return {
    publicationEpoch: numberOrUnknown(publicationSource.publicationEpoch),
    publicationStatus: textOrUnknown(publicationSource.publicationStatus),
    pendingAckNodeIds: arrayOrEmpty(publicationSource.pendingAckNodeIds),
    pendingAckCount: numberOrZero(publicationSource.pendingAckCount),
    blockedNodeCount: numberOrZero(publicationSource.blockedNodeCount),
    publishedActiveNodeIds: arrayOrEmpty(
      publicationSource.publishedActiveNodeIds,
    ),
    missingPublishedNodeIds: arrayOrEmpty(
      publicationSource.missingPublishedNodeIds,
    ),
    missingPublishedCount: numberOrZero(
      publicationSource.missingPublishedCount,
    ),
    publicationPending: parseBooleanVariant(
      publicationSource.publicationPending,
    ),
    recoveryProtocolState: textOrUnknown(
      publicationSource.recoveryProtocolState,
    ),
    prioritySpreadPending: parseBooleanVariant(
      publicationSource.prioritySpreadPending,
    ),
    publicationOwnerStream: buildReplayPublicationOwnerStream(
      publicationSource,
    ),
    publicationActiveGateHandoff: buildReplayPublicationActiveGateHandoff(
      activeGateSource,
    ),
    priorityRecoveryProgressSummary:
      buildReplayPriorityRecoveryProgressSummary(graph),
    activeGate: {
      state: textOrUnknown(activeGateSource.activeGateState),
      progress: buildReplayActiveGateProgress(activeGateSource),
    },
  };
}

export function buildReplayPublicationOwnerStream(source) {
  return {
    ackState: textOrUnknown(source.publicationOwnerAckState),
    freshnessFence: textOrUnknown(source.publicationOwnerFreshnessFence),
    recoveryOutcome: textOrUnknown(source.publicationOwnerRecoveryOutcome),
    revision: {
      state: textOrUnknown(source.publicationOwnerRevisionState),
    },
    streamOutcome: textOrUnknown(source.publicationOwnerStreamOutcome),
  };
}

export function buildReplayPublicationActiveGateHandoff(source) {
  return {
    state: textOrUnknown(source.publicationActiveGateHandoffState),
    reasonCode: textOrUnknown(source.publicationActiveGateHandoffReasonCode),
    nextAction: textOrUnknown(source.publicationActiveGateHandoffNextAction),
    runtimePromotionAllowed: parseBooleanVariant(
      source.publicationActiveGateHandoffRuntimePromotionAllowed,
    ),
    pendingRecoveryCount: numberOrZero(
      source.publicationActiveGateHandoffPendingRecoveryCount,
    ),
    pendingRecoveryNodeIds: splitJoinedValues(
      source.publicationActiveGateHandoffPendingRecoveryNodeIds,
    ),
    pendingReconcileCount: numberOrZero(
      source.publicationActiveGateHandoffPendingReconcileCount,
    ),
    pendingReconcileNodeIds: splitJoinedValues(
      source.publicationActiveGateHandoffPendingReconcileNodeIds,
    ),
  };
}

export function buildReplayPriorityRecoveryProgressSummary(graph) {
  const priorityEdge = selectReplayEdge(
    graph,
    EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
  );
  const source = asRecord(priorityEdge.source);

  return {
    dominantWitness: {
      currentOwner: textOrUnknown(priorityEdge.owner),
      blockingBoundary: textOrUnknown(priorityEdge.boundary),
    },
    priorityRecoveryProgressClasses: {
      unresolvedSemanticStateIds: splitJoinedValues(
        source.unresolvedSemanticStateIds,
      ),
      blockedPartitionIds: splitJoinedValues(source.blockedPartitionIds),
    },
  };
}

export function buildReplayActiveGateProgress(source) {
  return {
    snapshotCoverageComplete: parseBooleanVariant(
      source.snapshotCoverageComplete,
    ),
    snapshotCoverageNodeCount: numberOrZero(source.snapshotCoverageNodeCount),
    expectedNodeCount: numberOrZero(source.expectedNodeCount),
    selectedSnapshotError: textOrUnknown(source.selectedSnapshotError),
    selectedSnapshotNodeId: textOrUnknown(source.selectedSnapshotNodeId),
    selectedSnapshotTimeoutMs: numberOrUnknown(source.selectedSnapshotTimeoutMs),
    selectedSnapshotSourceCause:
      textOrUnknown(source.selectedSnapshotSourceCause),
    forcedRepairSnapshotCause:
      textOrUnknown(source.forcedRepairSnapshotCause),
    authoritativeControlSnapshotQueryCause:
      textOrUnknown(source.authoritativeControlSnapshotQueryCause),
    activeGateSnapshotOwnerEdge:
      textOrUnknown(source.activeGateSnapshotOwnerEdge),
    selectedSnapshotObservationMode:
      textOrUnknown(source.selectedSnapshotObservationMode),
    selectedSnapshotObservationState:
      textOrUnknown(source.selectedSnapshotObservationState),
    selectedSnapshotObservationContractState:
      textOrUnknown(source.selectedSnapshotObservationContractState),
    selectedSnapshotObservationRefreshState:
      textOrUnknown(source.selectedSnapshotObservationRefreshState),
    selectedSnapshotObservationNextAction:
      textOrUnknown(source.selectedSnapshotObservationNextAction),
    ...buildReplaySelectedSnapshotObservationRetry(source),
    selectedSnapshotObservationReasonCodes: splitJoinedValues(
      source.selectedSnapshotObservationReasonCodes,
    ),
    selectedSnapshotRepairDeferred: parseBooleanVariant(
      source.selectedSnapshotRepairDeferred,
    ),
    publicationActiveGateHandoffState:
      textOrUnknown(source.publicationActiveGateHandoffState),
    publicationActiveGateHandoffReasonCode:
      textOrUnknown(source.publicationActiveGateHandoffReasonCode),
    publicationActiveGateHandoffNextAction:
      textOrUnknown(source.publicationActiveGateHandoffNextAction),
    publicationActiveGateHandoffRuntimePromotionAllowed:
      parseBooleanVariant(
        source.publicationActiveGateHandoffRuntimePromotionAllowed,
      ),
    publicationActiveGateHandoffPendingRecoveryCount:
      numberOrZero(source.publicationActiveGateHandoffPendingRecoveryCount),
    publicationActiveGateHandoffPendingRecoveryNodeIds: splitJoinedValues(
      source.publicationActiveGateHandoffPendingRecoveryNodeIds,
    ),
    publicationActiveGateHandoffPendingReconcileCount:
      numberOrZero(source.publicationActiveGateHandoffPendingReconcileCount),
    publicationActiveGateHandoffPendingReconcileNodeIds: splitJoinedValues(
      source.publicationActiveGateHandoffPendingReconcileNodeIds,
    ),
    ...buildReplayOwnerRecoveryQueueProgress(source),
    activeGateOwnerCohortState:
      textOrUnknown(source.activeGateOwnerCohortState),
    activeGateOwnerCohortReasonCode:
      textOrUnknown(source.activeGateOwnerCohortReasonCode),
    activeGateOwnerCohortMissingPublishedCount:
      numberOrZero(source.activeGateOwnerCohortMissingPublishedCount),
    activeGateOwnerCohortMissingPublishedNodeIds: splitJoinedValues(
      source.activeGateOwnerCohortMissingPublishedNodeIds,
    ),
    activeGateOwnerCohortPendingRecoveryCount:
      numberOrZero(source.activeGateOwnerCohortPendingRecoveryCount),
    activeGateOwnerCohortPendingRecoveryNodeIds: splitJoinedValues(
      source.activeGateOwnerCohortPendingRecoveryNodeIds,
    ),
    activeGateOwnerCohortPendingReconcileCount:
      numberOrZero(source.activeGateOwnerCohortPendingReconcileCount),
    activeGateOwnerCohortPendingReconcileNodeIds: splitJoinedValues(
      source.activeGateOwnerCohortPendingReconcileNodeIds,
    ),
    readinessDelay: {
      cause: textOrUnknown(source.readinessDelayCause),
    },
    blockers: splitJoinedValues(source.blockers),
    priorityRecoveryProgressClasses: {},
  };
}

export function buildReplaySelectedSnapshotObservationRetry(source) {
  const retryAfterMs = numberOrUnknown(
    source.selectedSnapshotObservationRetryAfterMs,
  );
  if (retryAfterMs === UNKNOWN_VALUE) {
    return {};
  }
  return {selectedSnapshotObservationRetryAfterMs: retryAfterMs};
}

export function buildReplayOwnerRecoveryQueueProgress(source) {
  const ownerQueue = {};
  const depthState = textOrUnknown(
    source.selectedControlPlaneOwnerQueueDepthState,
  );
  if (depthState !== UNKNOWN_VALUE) {
    ownerQueue.selectedControlPlaneOwnerQueueDepthState = depthState;
  }
  const pendingWrites = numberOrUnknown(
    source.selectedControlPlaneOwnerQueuePendingWrites,
  );
  if (pendingWrites !== UNKNOWN_VALUE) {
    ownerQueue.selectedControlPlaneOwnerQueuePendingWrites = pendingWrites;
  }
  const pendingWriteGrowthCount = numberOrUnknown(
    source.selectedControlPlaneOwnerQueuePendingWriteGrowthCount,
  );
  if (pendingWriteGrowthCount !== UNKNOWN_VALUE) {
    ownerQueue.selectedControlPlaneOwnerQueuePendingWriteGrowthCount =
      pendingWriteGrowthCount;
  }
  const handoffOutcomeState = textOrUnknown(
    source.membershipPublicationHandoffOutcomeState,
  );
  if (handoffOutcomeState !== UNKNOWN_VALUE) {
    ownerQueue.membershipPublicationHandoffOutcomeState = handoffOutcomeState;
  }
  const handoffOutcomeReasonCode = textOrUnknown(
    source.membershipPublicationHandoffOutcomeReasonCode,
  );
  if (handoffOutcomeReasonCode !== UNKNOWN_VALUE) {
    ownerQueue.membershipPublicationHandoffOutcomeReasonCode =
      handoffOutcomeReasonCode;
  }
  const handoffOutcomeEnqueued = parseBooleanVariant(
    source.membershipPublicationHandoffOutcomeEnqueued,
  );
  if (handoffOutcomeEnqueued !== UNKNOWN_VALUE) {
    ownerQueue.membershipPublicationHandoffOutcomeEnqueued =
      handoffOutcomeEnqueued;
  }
  const handoffOutcomeRetryAfterMs = numberOrUnknown(
    source.membershipPublicationHandoffOutcomeRetryAfterMs,
  );
  if (handoffOutcomeRetryAfterMs !== UNKNOWN_VALUE) {
    ownerQueue.membershipPublicationHandoffOutcomeRetryAfterMs =
      handoffOutcomeRetryAfterMs;
  }
  return ownerQueue;
}

export function buildReplaySummary(graph) {
  const priorityEdge = selectReplayEdge(
    graph,
    EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
  );
  const readinessEdge = selectReplayEdge(
    graph,
    EDGE_ID.READINESS_STARTUP_SUPPORT,
  );
  const prioritySource = asRecord(priorityEdge.source);
  const readinessSource = asRecord(readinessEdge.source);

  return {
    dominantReason: textOrUnknown(prioritySource.dominantReason),
    failureClass: textOrUnknown(prioritySource.failureClass),
    readinessFailure: {
      mode: textOrUnknown(readinessSource.mode),
      classCode: textOrUnknown(readinessSource.classCode),
      recoverability: textOrUnknown(readinessSource.recoverability),
      terminalReason: textOrUnknown(readinessSource.terminalReason),
      cause: textOrUnknown(readinessSource.cause),
      source: textOrUnknown(readinessSource.source),
    },
  };
}

export function selectReplayEdge(graph, edgeId) {
  return firstRecord(
    selectReplayEdgeFromList(graph.frontier, edgeId),
    selectReplayEdgeFromList(graph.nextExpectedFrontier, edgeId),
    selectReplayEdgeFromList(graph.edges, edgeId),
  );
}

export function selectReplayEdgeFromList(edges, edgeId) {
  return arrayOrEmpty(edges).find((edge) => edge.id === edgeId) || {};
}

export function selectReplayDominantReason(witness) {
  const snapshot = {
    edgeId: witness.edgeId,
    frontierState: witness.frontierState,
  };
  const rule = REPLAY_DOMINANT_REASON_RULES.find((candidate) =>
    candidate.matches(snapshot),
  );
  return textOrAbsent(rule?.reason || witness.dominantReason);
}

export function selectReplayHandoffNextAction(edge) {
  const source = asRecord(edge.source);
  return firstText(
    source.publicationActiveGateHandoffNextAction,
    inferReplayHandoffNextAction(source),
    ABSENT_VALUE,
  );
}

export function inferReplayHandoffNextAction(source) {
  if (
    source.publicationActiveGateHandoffReasonCode ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING ||
    source.activeGateOwnerCohortReasonCode ===
      ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING
  ) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
      .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION;
  }
  return ABSENT_VALUE;
}
