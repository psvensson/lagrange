import {
  SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GRAPH_V1,
  SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GLOSSARY_V1,
  SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_DECISION_TABLE_V1,
  EDGE_ID,
  NODE_ID,
  OWNER,
  BOUNDARY,
  PROJECTION_HINT,
  REASON,
  SOURCE_PATH,
  SOURCE_FIELD,
  RANK,
  UNSATISFIED_EDGE_STATES,
  FIRST_FRONTIER_INDEX,
  SEVERITY_RANK,
  EDGE_STATE,
  SOURCE_ORDER_BASE,
  ABSENT_VALUE,
  REASON_SEPARATOR,
  OWNER_WITNESS_FIELD,
  glossaryEntries,
  cloneDecisionTableRows,
} from './topology-convergence-constants.js';

import {
  firstText,
  textOrUnknown,
  numberOrUnknown,
  arrayOrEmpty,
  booleanVariant,
  compareNumber,
  normalizeTopologyConvergenceInput,
  normalizePublicationEvidence,
  normalizePriorityRecoveryEvidence,
  normalizeReadinessSupportEvidence,
  createTopologyConvergenceReasonList,
  flattenEvidencePath,
  joinValues,
  normalizeProgressContract,
} from './topology-convergence-normalizers.js';

import {
  resolvePublicationState,
  resolvePriorityRecoveryState,
  resolveActiveGateSnapshotState,
  resolveReadinessState,
  buildPriorityRecoveryEvidenceSource,
  buildActiveGateSnapshotCauseSource,
  buildSelectedSnapshotObservationRetrySource,
  buildPublicationActiveGateHandoffSource,
  buildOwnerRecoveryQueueSource,
  buildActiveGateOwnerCohortSource,
  buildTopologyOperatorWitnessDiagnosticSource,
} from './topology-convergence-edge-resolvers.js';

import {
  buildTopologyConvergenceOwnerPresentation,
  buildTopologyConvergenceOwnerWitness,
  selectTopologyConvergenceDominantWitness,
} from './topology-convergence-owner-witness.js';

import {
  buildTopologyConvergenceReplayFixture,
  replayTopologyConvergenceFixture,
} from './topology-convergence-replay.js';

const NODE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: NODE_ID.PUBLICATION_CONVERGENCE,
    owner: OWNER.TOPOLOGY_PUBLICATION,
    boundary: BOUNDARY.PUBLICATION_CONVERGENCE,
  }),
  Object.freeze({
    id: NODE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
  }),
  Object.freeze({
    id: NODE_ID.PRIORITY_RECOVERY_PROGRESS,
    owner: OWNER.PRIORITY_RECOVERY,
    boundary: BOUNDARY.WORKFLOW_PROGRESS,
  }),
  Object.freeze({
    id: NODE_ID.READINESS_STARTUP_SUPPORT,
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
  }),
  Object.freeze({
    id: NODE_ID.TOP_FAILURE_REASONS,
    owner: OWNER.FAILURE_CLASSIFIER,
    boundary: BOUNDARY.FAILURE_REASON_RANKING,
  }),
]);

export function buildTopologyConvergenceGraph(input = {}) {
  const normalized = normalizeTopologyConvergenceInput(input);
  const edgeSnapshots = [
    buildPublicationEdge(normalized),
    buildPriorityRecoveryEdge(normalized),
    buildActiveGateSnapshotEdge(normalized),
    buildReadinessEdge(normalized),
    buildTopFailureReasonsEdge(normalized),
  ];
  const edges = edgeSnapshots.map((edge, index) => ({
    ...edge,
    sourceOrder: index + SOURCE_ORDER_BASE,
  }));
  const graphEdgeDeclarationsByEdgeId = buildGraphEdgeDeclarations(edges);
  const frontier = computeFrontier(edges);
  const nextExpectedFrontier = computeNextExpectedFrontier(edges, frontier);
  const ownerPresentation = buildTopologyConvergenceOwnerPresentation({
    edges,
    frontier,
  });

  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GRAPH_V1,
    scenario: normalized.scenario,
    generatedFrom: normalized.generatedFrom,
    summary: {
      nodeCount: NODE_DEFINITIONS.length,
      edgeCount: edges.length,
      frontierCount: frontier.length,
      firstFrontierEdgeId: frontier[FIRST_FRONTIER_INDEX]?.id || ABSENT_VALUE,
      firstFrontierState: frontier[FIRST_FRONTIER_INDEX]?.state || ABSENT_VALUE,
      firstFrontierOwner:
        ownerPresentation.dominantWitness[OWNER_WITNESS_FIELD.OWNER],
      firstFrontierBoundary:
        ownerPresentation.dominantWitness[OWNER_WITNESS_FIELD.BOUNDARY],
      firstFrontierReason:
        ownerPresentation.dominantWitness[
          OWNER_WITNESS_FIELD.DOMINANT_REASON
        ],
    },
    nodes: NODE_DEFINITIONS.map((node) => {
      if (node.id !== NODE_ID.PRIORITY_RECOVERY_PROGRESS) {
        return {...node};
      }
      return {
        ...node,
        owner: firstText(
          graphEdgeDeclarationsByEdgeId[
            EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS
          ]?.owner,
          node.owner,
        ),
        boundary: firstText(
          graphEdgeDeclarationsByEdgeId[
            EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS
          ]?.boundary,
          node.boundary,
        ),
      };
    }),
    edges,
    frontier,
    ownerWitnesses: ownerPresentation.ownerWitnesses,
    frontierWitnesses: ownerPresentation.frontierWitnesses,
    dominantWitness: ownerPresentation.dominantWitness,
    nextExpectedFrontier,
  };
}

export function buildTopologyConvergenceGraphFromArtifacts(artifacts = {}) {
  return buildTopologyConvergenceGraph({
    failureBundle: artifacts.failureBundle || artifacts.bundle || {},
    triageSummary: artifacts.triageSummary || artifacts.triage || {},
    report: artifacts.report || {},
  });
}

export function buildTopologyConvergenceGlossary() {
  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_GLOSSARY_V1,
    nodes: glossaryEntries(NODE_ID),
    edges: glossaryEntries(EDGE_ID),
    owners: glossaryEntries(OWNER),
    boundaries: glossaryEntries(BOUNDARY),
    projectionHints: glossaryEntries(PROJECTION_HINT),
    reasons: glossaryEntries(REASON),
    sourcePaths: glossaryEntries(SOURCE_PATH),
    sourceFields: glossaryEntries(SOURCE_FIELD),
  };
}

export function buildTopologyConvergenceDecisionTable() {
  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_DECISION_TABLE_V1,
    states: glossaryEntries(EDGE_STATE),
    transitions: cloneDecisionTableRows(),
    rows: cloneDecisionTableRows(),
  };
}

function buildGraphEdgeDeclarations(edges) {
  const declarations = {};
  for (const edge of edges) {
    declarations[edge.id] = {
      owner: edge.owner,
      boundary: edge.boundary,
    };
  }
  return Object.freeze(declarations);
}

function buildPublicationEdge(normalized) {
  const evidence = normalizePublicationEvidence(normalized.publication);
  const reasons = createTopologyConvergenceReasonList();
  const state = resolvePublicationState(evidence, reasons);

  const rawContract = normalized.publication.progressContract ||
                      (normalized.publication.progress && normalized.publication.progress.progressContract);
  const progressContract = normalizeProgressContract(rawContract, {
    owner: OWNER.TOPOLOGY_PUBLICATION,
    boundary: BOUNDARY.PUBLICATION_CONVERGENCE,
    evidencePath: normalized.evidencePath.publication,
  });

  return buildEdge({
    id: EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
    from: NODE_ID.PUBLICATION_CONVERGENCE,
    to: NODE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    state,
    owner: progressContract.owner || OWNER.TOPOLOGY_PUBLICATION,
    boundary: progressContract.boundary || BOUNDARY.PUBLICATION_CONVERGENCE,
    evidencePath: progressContract.evidencePath || normalized.evidencePath.publication,
    source: {
      ...evidence.source,
      progressContract,
    },
    progressContract,
    reasons,
    rank: RANK.PUBLICATION,
    dependencies: [],
    projectionHint: PROJECTION_HINT.PUBLICATION_ACK,
  });
}

function buildPriorityRecoveryEdge(normalized) {
  const evidence = normalizePriorityRecoveryEvidence(normalized);
  const reasons = createTopologyConvergenceReasonList();
  const state = resolvePriorityRecoveryState(evidence, reasons);

  const rawContract = (normalized.progress && normalized.progress.progressContract) || 
                      (normalized.progressSummary && normalized.progressSummary.progressContract) || 
                      evidence.progressContract ||
                      (normalized.progress && normalized.progress.priorityRecoveryProgressSummary && normalized.progress.priorityRecoveryProgressSummary.progressContract);
  const progressContract = normalizeProgressContract(rawContract, {
    owner: evidence.owner,
    boundary: evidence.boundary,
    evidencePath: evidence.evidencePath,
  });

  return buildEdge({
    id: EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
    from: NODE_ID.PRIORITY_RECOVERY_PROGRESS,
    to: NODE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    state,
    owner: progressContract.owner || evidence.owner,
    boundary: progressContract.boundary || evidence.boundary,
    evidencePath: progressContract.evidencePath || evidence.evidencePath,
    source: {
      unresolvedSemanticStateIds: joinValues(evidence.semanticStateIds),
      blockedPartitionIds: joinValues(evidence.blockedPartitionIds),
      dominantReason: textOrUnknown(normalized.summary.dominantReason),
      failureClass: textOrUnknown(
        normalized.summary.failureClass ||
        normalized.summary.failureClassification?.failureClass,
      ),
      ...buildPriorityRecoveryEvidenceSource(evidence),
      progressContract,
    },
    progressContract,
    reasons,
    rank: RANK.PRIORITY_RECOVERY,
    dependencies: [EDGE_ID.PUBLICATION_ACK_CONVERGENCE],
    projectionHint: PROJECTION_HINT.PRIORITY_RECOVERY,
  });
}

function buildActiveGateSnapshotEdge(normalized) {
  const progress = normalized.progress;
  const publicationActiveGateHandoff = normalized.publicationActiveGateHandoff;
  const reasons = createTopologyConvergenceReasonList();
  const state = resolveActiveGateSnapshotState(
    normalized.activeGate,
    progress,
    publicationActiveGateHandoff,
    reasons,
  );

  const rawContract = (progress && progress.progressContract) || 
                      (normalized.activeGate && normalized.activeGate.progressContract) || 
                      (normalized.activeGate && normalized.activeGate.progress && normalized.activeGate.progress.progressContract);
  const progressContract = normalizeProgressContract(rawContract, {
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
    evidencePath: normalized.evidencePath.activeGateProgress,
  });

  return buildEdge({
    id: EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    from: NODE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE,
    to: NODE_ID.READINESS_STARTUP_SUPPORT,
    state,
    owner: progressContract.owner || OWNER.ACTIVE_GATE,
    boundary: progressContract.boundary || BOUNDARY.SNAPSHOT_COVERAGE,
    evidencePath: progressContract.evidencePath || normalized.evidencePath.activeGateProgress,
    source: {
      activeGateState: textOrUnknown(normalized.activeGate.state),
      snapshotCoverageComplete: booleanVariant(progress.snapshotCoverageComplete),
      snapshotCoverageNodeCount: numberOrUnknown(progress.snapshotCoverageNodeCount),
      expectedNodeCount: numberOrUnknown(progress.expectedNodeCount),
      selectedSnapshotError: firstText(
        progress.selectedSnapshotError,
        progress.selectedError,
        progress.readinessDelay?.error,
      ),
      ...buildActiveGateSnapshotCauseSource(progress),
      selectedSnapshotObservationMode:
        textOrUnknown(progress.selectedSnapshotObservationMode),
      selectedSnapshotObservationState:
        textOrUnknown(progress.selectedSnapshotObservationState),
      selectedSnapshotObservationContractState:
        textOrUnknown(progress.selectedSnapshotObservationContractState),
      selectedSnapshotObservationRefreshState:
        textOrUnknown(progress.selectedSnapshotObservationRefreshState),
      selectedSnapshotObservationNextAction:
        textOrUnknown(progress.selectedSnapshotObservationNextAction),
      ...buildSelectedSnapshotObservationRetrySource(progress),
      selectedSnapshotObservationReasonCodes: joinValues(
        arrayOrEmpty(progress.selectedSnapshotObservationReasonCodes),
      ),
      selectedSnapshotRepairDeferred: booleanVariant(
        progress.selectedSnapshotRepairDeferred,
      ),
      ...buildPublicationActiveGateHandoffSource(
        publicationActiveGateHandoff,
        progress,
      ),
      ...buildOwnerRecoveryQueueSource(progress, publicationActiveGateHandoff),
      ...buildActiveGateOwnerCohortSource(progress),
      ...buildTopologyOperatorWitnessDiagnosticSource(
        progress.topologyOperatorWitness,
      ),
      readinessDelayCause: textOrUnknown(progress.readinessDelay?.cause),
      blockers: joinValues(arrayOrEmpty(progress.blockers)),
      progressContract,
    },
    progressContract,
    reasons,
    rank: RANK.SNAPSHOT_COVERAGE,
    dependencies: [
      EDGE_ID.PUBLICATION_ACK_CONVERGENCE,
      EDGE_ID.PRIORITY_RECOVERY_PARTITION_PROGRESS,
    ],
    projectionHint: PROJECTION_HINT.SNAPSHOT_COVERAGE,
  });
}

function buildReadinessEdge(normalized) {
  const readiness = normalizeReadinessSupportEvidence(
    normalized.readinessFailure,
    normalized.activeGate,
  );
  const reasons = createTopologyConvergenceReasonList();
  const state = resolveReadinessState(readiness, normalized.activeGate, reasons);

  const rawContract = (normalized.readiness && normalized.readiness.progressContract) || 
                      (normalized.readinessFailure && normalized.readinessFailure.progressContract) ||
                      (readiness && readiness.progressContract);
  const progressContract = normalizeProgressContract(rawContract, {
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    evidencePath: normalized.evidencePath.readinessFailure,
  });

  return buildEdge({
    id: EDGE_ID.READINESS_STARTUP_SUPPORT,
    from: NODE_ID.READINESS_STARTUP_SUPPORT,
    to: NODE_ID.TOP_FAILURE_REASONS,
    state,
    owner: progressContract.owner || OWNER.READINESS,
    boundary: progressContract.boundary || BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    evidencePath: progressContract.evidencePath || normalized.evidencePath.readinessFailure,
    source: {
      mode: textOrUnknown(readiness.mode),
      classCode: textOrUnknown(readiness.classCode),
      recoverability: textOrUnknown(readiness.recoverability),
      terminalReason: textOrUnknown(readiness.terminalReason),
      cause: textOrUnknown(readiness.cause),
      source: textOrUnknown(readiness.source),
      supportPath: readiness.supportPath,
      progressContract,
    },
    progressContract,
    reasons,
    rank: RANK.READINESS,
    dependencies: [EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE],
    projectionHint: PROJECTION_HINT.READINESS,
  });
}

function buildTopFailureReasonsEdge(normalized) {
  const reasons = normalized.topReasons.length > SOURCE_ORDER_BASE ?
    [REASON.TOP_FAILURES_PRESENT] :
    [REASON.TOP_FAILURES_ABSENT];

  const rawContract = normalized.topFailures && normalized.topFailures.progressContract;
  const progressContract = normalizeProgressContract(rawContract, {
    owner: OWNER.FAILURE_CLASSIFIER,
    boundary: BOUNDARY.FAILURE_REASON_RANKING,
    evidencePath: SOURCE_PATH.TOP_REASONS,
  });

  return buildEdge({
    id: EDGE_ID.TOP_FAILURE_REASONS,
    from: NODE_ID.TOP_FAILURE_REASONS,
    to: NODE_ID.TOP_FAILURE_REASONS,
    state: EDGE_STATE.SATISFIED,
    owner: progressContract.owner || OWNER.FAILURE_CLASSIFIER,
    boundary: progressContract.boundary || BOUNDARY.FAILURE_REASON_RANKING,
    evidencePath: progressContract.evidencePath || SOURCE_PATH.TOP_REASONS,
    source: {
      topReasons: normalized.topReasons.map((entry) => entry.reason).join(REASON_SEPARATOR) ||
        ABSENT_VALUE,
      progressContract,
    },
    progressContract,
    reasons,
    rank: RANK.TOP_FAILURES,
    dependencies: [EDGE_ID.READINESS_STARTUP_SUPPORT],
    projectionHint: PROJECTION_HINT.TOP_REASONS,
  });
}

function buildEdge(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    state: edge.state,
    owner: edge.owner,
    boundary: edge.boundary,
    evidencePath: edge.evidencePath,
    source: edge.source,
    reasons: edge.reasons.length > SOURCE_ORDER_BASE ? edge.reasons : [REASON.EVIDENCE_MISSING],
    rank: edge.rank,
    priority: edge.rank,
    dependencies: edge.dependencies,
    projectionHint: edge.projectionHint,
    progressContract: edge.progressContract,
  };
}

function computeFrontier(edges) {
  const satisfiedIds = new Set(
    edges.filter((edge) => edge.state === EDGE_STATE.SATISFIED).map((edge) => edge.id),
  );
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));

  return edges
    .filter((edge) => UNSATISFIED_EDGE_STATES.includes(edge.state))
    .filter((edge) => edge.dependencies.every((dependencyId) =>
      isSatisfiedDependencyChain({
        dependencyId,
        edgesById,
        satisfiedIds,
        visitedIds: new Set(),
      }),
    ))
    .sort(compareFrontierEdges)
    .map((edge) => ({...edge}));
}

function isSatisfiedDependencyChain({
  dependencyId,
  edgesById,
  satisfiedIds,
  visitedIds,
}) {
  if (satisfiedIds.has(dependencyId) !== true) {
    return false;
  }
  if (visitedIds.has(dependencyId)) {
    return true;
  }
  visitedIds.add(dependencyId);
  const dependencyEdge = edgesById.get(dependencyId);
  if (!dependencyEdge) {
    return true;
  }
  return dependencyEdge.dependencies.every((ancestorId) =>
    isSatisfiedDependencyChain({
      dependencyId: ancestorId,
      edgesById,
      satisfiedIds,
      visitedIds,
    }),
  );
}

function computeNextExpectedFrontier(edges, frontier) {
  const firstFrontier = frontier[FIRST_FRONTIER_INDEX];
  if (!firstFrontier) {
    return [];
  }
  const projectedEdges = edges.map((edge) => {
    if (edge.id !== firstFrontier.id) {
      return edge;
    }
    return {
      ...edge,
      state: EDGE_STATE.SATISFIED,
      reasons: [REASON.PUBLICATION_PUBLISHED],
      projectionHint: firstFrontier.projectionHint,
    };
  });
  return computeFrontier(projectedEdges);
}

function compareFrontierEdges(left, right) {
  return compareNumber(SEVERITY_RANK[left.state], SEVERITY_RANK[right.state]) ||
    compareNumber(left.rank, right.rank) ||
    compareNumber(left.sourceOrder, right.sourceOrder) ||
    left.id.localeCompare(right.id);
}

export {
  EDGE_STATE,
  EDGE_ID,
  REASON,
  buildTopologyConvergenceOwnerPresentation,
  buildTopologyConvergenceOwnerWitness,
  buildTopologyConvergenceReplayFixture,
  replayTopologyConvergenceFixture,
  selectTopologyConvergenceDominantWitness,
  flattenEvidencePath,
};
