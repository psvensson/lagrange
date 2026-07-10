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
  UNKNOWN_VALUE,
  REASON_SEPARATOR,
  OWNER_WITNESS_FIELD,
  TYPE_OBJECT,
  TYPE_STRING,
  glossaryEntries,
} from './topology-convergence-constants.js';

import {
  cloneDecisionTableRows,
} from './topology-convergence-decision-table.js';

import {
  firstText,
  textOrUnknown,
  numberOrUnknown,
  arrayOrEmpty,
  asRecord,
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
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  selectPublicationActiveGateHandoffContract as selectControlPlanePublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';

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

const RUNTIME_PROMOTION_GUARD_REQUIRES_NON_REPEATED_CONTRACT =
  'requires_non_repeated_source_contract';
const RUNTIME_PROMOTION_GUARD_REASON =
  'active_gate_runtime_promotion_requires_non_repeated_contract';
const OWNER_DIAGNOSTICS = 'diagnostics_owner';
const BOUNDARY_CAUSAL_ANALYSIS_FRAMEWORK = 'causal_analysis_framework';
const POST_REBALANCE_CLOSURE_STATE_OPEN = 'open';
const PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD = Object.freeze({
  ACTIVE_GATE: 'activeGate',
  NEXT_ACTION: 'nextAction',
  PENDING_RECOVERY_COUNT: 'pendingRecoveryCount',
  PENDING_RECOVERY_NODE_IDS: 'pendingRecoveryNodeIds',
  PENDING_RECONCILE_COUNT: 'pendingReconcileCount',
  PENDING_RECONCILE_NODE_IDS: 'pendingReconcileNodeIds',
  PROGRESS: 'progress',
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  RUNTIME_PROMOTION_ALLOWED: 'runtimePromotionAllowed',
});

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

  const rawContract =
    normalized.publication.progressContract ||
    normalized.publication.progress?.progressContract;
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

  const rawContract =
    normalized.progress?.progressContract ||
    normalized.progressSummary?.progressContract ||
    evidence.progressContract ||
    normalized.progress?.priorityRecoveryProgressSummary?.progressContract;
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
  const selectedPublicationActiveGateHandoff =
    selectActiveGateSnapshotPublicationHandoffContract(
      progress,
      publicationActiveGateHandoff,
    );
  const reasons = createTopologyConvergenceReasonList();
  const state = resolveActiveGateSnapshotState(
    normalized.activeGate,
    progress,
    selectedPublicationActiveGateHandoff,
    reasons,
  );

  const rawContract =
    progress?.progressContract ||
    normalized.activeGate?.progressContract ||
    normalized.activeGate?.progress?.progressContract;

  const completeCoverage =
    progress.snapshotCoverageComplete === true ||
    normalized.activeGate.ready === true;
  const isRepairDeferred =
    progress.selectedSnapshotRepairDeferred === true ||
    progress.selectedSnapshotObservationMode === 'repair_deferred';
  const fallbackState = completeCoverage ?
    'satisfied' :
    (isRepairDeferred ? 'deferred' : state);
  const fallbackReason = completeCoverage ?
    'snapshot_coverage_complete' :
    (reasons[0] || 'snapshot_coverage_incomplete');
  const fallbackNextAction = completeCoverage ?
    'none' :
    (progress.selectedSnapshotObservationNextAction || 'retry');
  const fallbackWakeSource = completeCoverage ? 'none' : 'active-gate';
  const fallbackRetryAfterMs = completeCoverage ? 0 : (typeof progress.selectedSnapshotObservationRetryAfterMs === 'number' ? progress.selectedSnapshotObservationRetryAfterMs : 1000);
  const fallbackTerminalState = 'satisfied';
  const fallbackBlockingDependency = 'none';

  const progressContract = normalizeProgressContract(rawContract, {
    owner: OWNER.ACTIVE_GATE,
    boundary: BOUNDARY.SNAPSHOT_COVERAGE,
    state: fallbackState,
    reason: fallbackReason,
    nextAction: fallbackNextAction,
    wakeSource: fallbackWakeSource,
    retryAfterMs: fallbackRetryAfterMs,
    terminalState: fallbackTerminalState,
    evidencePath: normalized.evidencePath.activeGateProgress,
    blockingDependency: fallbackBlockingDependency,
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
        selectedPublicationActiveGateHandoff,
        progress,
      ),
      ...buildOwnerRecoveryQueueSource(
        progress,
        selectedPublicationActiveGateHandoff,
      ),
      ...buildActiveGateOwnerCohortSource(progress),
      ...buildTopologyOperatorWitnessDiagnosticSource(
        progress.topologyOperatorWitness,
      ),
      readinessDelayCause: textOrUnknown(progress.readinessDelay?.cause),
      blockers: joinValues(arrayOrEmpty(progress.blockers)),
      ...buildActiveGateRuntimePromotionGuard({
        state,
        reasons,
        progressContract,
        publicationActiveGateHandoff: selectedPublicationActiveGateHandoff,
      }),
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

function selectActiveGateSnapshotPublicationHandoffContract(
  progress,
  publicationActiveGateHandoff,
) {
  if (
    hasPublicationActiveGateHandoffSourceContract(
      publicationActiveGateHandoff,
    )
  ) {
    return publicationActiveGateHandoff;
  }
  const progressHandoff =
    selectControlPlanePublicationActiveGateHandoffContract({
      [PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD
        .PUBLICATION_CONVERGENCE]: {
        [PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD.ACTIVE_GATE]: {
          [PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD.PROGRESS]: progress,
        },
      },
    });
  return hasPublicationActiveGateHandoffSourceContract(progressHandoff) ?
    progressHandoff :
    publicationActiveGateHandoff;
}

function hasPublicationActiveGateHandoffSourceContract(value = null) {
  if (!value || typeof value !== TYPE_OBJECT || Array.isArray(value)) {
    return false;
  }
  const pendingRecoveryCount = Number(
    value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD.PENDING_RECOVERY_COUNT
    ],
  );
  const pendingReconcileCount = Number(
    value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD.PENDING_RECONCILE_COUNT
    ],
  );
  return value[
    PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD.NEXT_ACTION
  ] === PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY ||
    value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD.NEXT_ACTION
    ] === PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
      .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION ||
    value[
      PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD.RUNTIME_PROMOTION_ALLOWED
    ] === true ||
    pendingRecoveryCount > SOURCE_ORDER_BASE ||
    pendingReconcileCount > SOURCE_ORDER_BASE ||
    hasPublicationActiveGateHandoffNodeDebt(
      value,
      PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD
        .PENDING_RECOVERY_NODE_IDS,
    ) ||
    hasPublicationActiveGateHandoffNodeDebt(
      value,
      PUBLICATION_ACTIVE_GATE_HANDOFF_SOURCE_FIELD
        .PENDING_RECONCILE_NODE_IDS,
    );
}

function hasPublicationActiveGateHandoffNodeDebt(value, fieldName) {
  const nodeIds = value[fieldName];
  if (Array.isArray(nodeIds)) {
    return nodeIds.length > SOURCE_ORDER_BASE;
  }
  return typeof nodeIds === TYPE_STRING &&
    nodeIds.trim().length > SOURCE_ORDER_BASE;
}

function buildActiveGateRuntimePromotionGuard({
  state,
  reasons,
  progressContract,
  publicationActiveGateHandoff,
}) {
  if (state === EDGE_STATE.SATISFIED) {
    return {};
  }
  if (
    hasPublicationActiveGateHandoffSourceContract(
      publicationActiveGateHandoff,
    )
  ) {
    return {};
  }
  const reasonSet = new Set(reasons);
  const hasIncompleteCoverage = reasonSet.has(
    REASON.SNAPSHOT_COVERAGE_INCOMPLETE,
  );
  const hasRepeatedRetryShape =
    reasonSet.has(REASON.SELECTED_SNAPSHOT_SOURCE_TIMEOUT) ||
    reasonSet.has(REASON.SNAPSHOT_REPAIR_DEFERRED);
  const retriesWithoutDependency =
    progressContract.nextAction === 'retry' &&
    progressContract.blockingDependency === 'none';
  if (
    hasIncompleteCoverage !== true ||
    hasRepeatedRetryShape !== true ||
    retriesWithoutDependency !== true
  ) {
    return {};
  }
  return {
    runtimePromotionGuard:
      RUNTIME_PROMOTION_GUARD_REQUIRES_NON_REPEATED_CONTRACT,
    runtimePromotionGuardReason: RUNTIME_PROMOTION_GUARD_REASON,
    runtimePromotionGuardOwner: OWNER_DIAGNOSTICS,
    runtimePromotionGuardBoundary: BOUNDARY_CAUSAL_ANALYSIS_FRAMEWORK,
  };
}

function buildReadinessEdge(normalized) {
  const readinessSelection = selectReadinessEvidence(normalized);
  const readiness = readinessSelection.record;
  const reasons = createTopologyConvergenceReasonList();
  const state = resolveReadinessEdgeState(
    readiness,
    normalized.activeGate,
    reasons,
  );

  const rawContract = readiness.progressContract;
  const progressContract = normalizeProgressContract(rawContract, {
    owner: OWNER.READINESS,
    boundary: BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    evidencePath: readinessSelection.evidencePath,
  });

  return buildEdge({
    id: EDGE_ID.READINESS_STARTUP_SUPPORT,
    from: NODE_ID.READINESS_STARTUP_SUPPORT,
    to: NODE_ID.TOP_FAILURE_REASONS,
    state,
    owner: progressContract.owner || OWNER.READINESS,
    boundary: progressContract.boundary || BOUNDARY.STARTUP_SUPPORT_EVIDENCE,
    evidencePath: progressContract.evidencePath ||
      readinessSelection.evidencePath,
    source: {
      mode: textOrUnknown(readiness.mode),
      classCode: textOrUnknown(readiness.classCode),
      recoverability: textOrUnknown(readiness.recoverability),
      terminalReason: textOrUnknown(readiness.terminalReason),
      cause: textOrUnknown(readiness.cause),
      source: textOrUnknown(readiness.source),
      supportPath: textOrUnknown(readiness.supportPath),
      progressContract,
    },
    progressContract,
    reasons,
    rank: RANK.READINESS,
    dependencies: [EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE],
    projectionHint: PROJECTION_HINT.READINESS,
  });
}

function selectReadinessEvidence(normalized) {
  const readinessFailure = normalizeReadinessSupportEvidence(
    normalized.readinessFailure,
    normalized.activeGate,
  );
  if (Object.keys(readinessFailure).length > SOURCE_ORDER_BASE) {
    return {
      record: readinessFailure,
      evidencePath: normalized.evidencePath.readinessFailure,
    };
  }
  return {
    record: asRecord(normalized.readiness),
    evidencePath: normalized.evidencePath.readiness,
  };
}

function resolveReadinessEdgeState(readiness, activeGate, reasons) {
  if (readiness.ready === true) {
    reasons.push(REASON.READINESS_SATISFIED);
    return EDGE_STATE.SATISFIED;
  }
  return resolveReadinessState(readiness, activeGate, reasons);
}

function buildTopFailureReasonsEdge(normalized) {
  const hasTopReasons = normalized.topReasons.length > SOURCE_ORDER_BASE;
  const hasPostRebalanceClosure =
    hasOpenPostRebalanceClosure(normalized.postRebalanceClosure);
  const postRebalanceBlockerIds = collectPostRebalanceBlockerIds(
    normalized.postRebalanceClosure,
  );
  const reasons = hasTopReasons ?
    [REASON.TOP_FAILURES_PRESENT] :
    [REASON.TOP_FAILURES_ABSENT];
  const state = hasTopReasons && hasPostRebalanceClosure ?
    EDGE_STATE.BLOCKED :
    EDGE_STATE.SATISFIED;

  const rawContract = normalized.topFailures && normalized.topFailures.progressContract;
  const progressContract = normalizeProgressContract(rawContract, {
    owner: OWNER.FAILURE_CLASSIFIER,
    boundary: BOUNDARY.FAILURE_REASON_RANKING,
    evidencePath: hasPostRebalanceClosure ?
      normalized.evidencePath.postRebalanceClosure :
      SOURCE_PATH.TOP_REASONS,
  });

  return buildEdge({
    id: EDGE_ID.TOP_FAILURE_REASONS,
    from: NODE_ID.TOP_FAILURE_REASONS,
    to: NODE_ID.TOP_FAILURE_REASONS,
    state,
    owner: progressContract.owner || OWNER.FAILURE_CLASSIFIER,
    boundary: progressContract.boundary || BOUNDARY.FAILURE_REASON_RANKING,
    evidencePath: progressContract.evidencePath ||
      normalized.evidencePath.postRebalanceClosure ||
      SOURCE_PATH.TOP_REASONS,
    source: {
      topReasons: normalized.topReasons.map((entry) => entry.reason).join(REASON_SEPARATOR) ||
        ABSENT_VALUE,
      postRebalanceClosureState: textOrUnknown(
        normalized.postRebalanceClosure.state,
      ),
      postRebalanceBlockers: joinValues(postRebalanceBlockerIds),
      postRebalancePrimaryBlocker:
        postRebalanceBlockerIds[FIRST_FRONTIER_INDEX] || ABSENT_VALUE,
      progressContract,
    },
    progressContract,
    reasons,
    rank: RANK.TOP_FAILURES,
    dependencies: [EDGE_ID.ACTIVE_GATE_SNAPSHOT_COVERAGE],
    projectionHint: PROJECTION_HINT.TOP_REASONS,
  });
}

function hasOpenPostRebalanceClosure(postRebalanceClosure) {
  const closure = asRecord(postRebalanceClosure);
  if (Object.keys(closure).length === SOURCE_ORDER_BASE) {
    return false;
  }
  return textOrUnknown(closure.state) === POST_REBALANCE_CLOSURE_STATE_OPEN ||
    arrayOrEmpty(closure.blockers).length > SOURCE_ORDER_BASE;
}

function collectPostRebalanceBlockerIds(postRebalanceClosure) {
  const closure = asRecord(postRebalanceClosure);
  return arrayOrEmpty(closure.blockers)
    .map((blocker) => textOrUnknown(asRecord(blocker).id))
    .filter((blockerId) => blockerId !== UNKNOWN_VALUE);
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
  selectTopologyConvergenceDominantWitness,
  flattenEvidencePath,
};
