import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {readAllSharedRows} from '../cache/shared-row-read.js';
import {
  buildCurrentPriorityPlacementObservation,
} from '../control-plane/current-priority-placement-observation.js';
import {isCatchupLearnerRaftRole} from
  '../raft/replica-voter-readiness.js';

const {
  LIFECYCLE_PHASE,
  NUM,
  TABLES,
  UNIFIED_REBALANCER_LITERAL,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildPublicationRecoveryGateSnapshot,
  classifySystemPartition,
  getLocalControlPlaneMutationReadinessBlocker,
  isBackgroundWorkLifecycleReadySnapshot,
  normalizeServiceRow,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldPriorityRecoveryOperationBlockPlanning,
} = UNIFIED_REBALANCER_SHARED;

const PRIORITY_READINESS_CONSTRUCTOR = 'constructor';
const PRIORITY_PLACEMENT_STATE = Object.freeze({AVAILABLE: 'available'});
const GATE_FIELD = Object.freeze({
  PUBLICATION_EPOCH: 'publicationEpoch',
  PUBLICATION_STATUS: 'publicationStatus',
  PUBLICATION_OBSERVATION_STATE: 'publicationObservationState',
  RECOVERY_PROTOCOL_STATE: 'recoveryProtocolState',
  REASON_CODES: 'reasonCodes',
  PRIORITY_PARTITION_SUMMARY: 'priorityPartitionSummary',
  PRIORITY_RECOVERY_CLOSURE_WITNESS: 'priorityRecoveryClosureWitness',
  PENDING_ACK_NODE_IDS: 'pendingAckNodeIds',
  MISSING_PUBLISHED_NODE_IDS: 'missingPublishedNodeIds',
});

function finiteNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
function copyRecordOrNull(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return {...value};
}
function freezeRecordOrNull(value) {
  const copy = copyRecordOrNull(value);
  return copy ? Object.freeze(copy) : null;
}
function buildPriorityPartitionBlocker(partition = {}) {
  return {
    partitionId: String(partition.partitionId || ''),
    readyReplicaCount: finiteNumberOrNull(partition.readyReplicaCount),
    readyDistinctNodeCount:
      finiteNumberOrNull(partition.readyDistinctNodeCount),
    spreadGap: finiteNumberOrNull(partition.spreadGap),
    exclusionReasonCounts:
      copyRecordOrNull(partition.exclusionReasonCounts),
  };
}
function isCurrentPriorityPlacementPending(observation) {
  return observation?.state === PRIORITY_PLACEMENT_STATE.AVAILABLE &&
    observation.satisfied !== true;
}
function isPublishedPriorityPlacementPending(summary, gate) {
  return Boolean(summary) && gate.prioritySpreadPending === true;
}
function readMissingCurrentPriorityLeaderPartitionIds(observation) {
  const partitionIds =
    observation?.leaderCoverage?.missingLeaderPartitionIds;
  return Array.isArray(partitionIds) ? partitionIds : [];
}
function buildMissingLeaderBlocker({
  existing,
  partitionId,
}) {
  const base = existing ?? {
    readyReplicaCount: null,
    readyDistinctNodeCount: null,
    spreadGap: null,
    exclusionReasonCounts: null,
  };
  return {
    ...base,
    partitionId,
    missingActiveLeader: true,
  };
}
function freezePriorityPartitionBlocker(partition) {
  return Object.freeze({
    ...partition,
    exclusionReasonCounts:
      freezeRecordOrNull(partition.exclusionReasonCounts),
  });
}
function selectMatchingValue(values, predicate, fallback = null) {
  const selected = values.find(predicate);
  return selected === undefined ? fallback : selected;
}
function selectPlanningArray(values, fallback = []) {
  return selectMatchingValue(values, Array.isArray, fallback);
}
function selectPlanningObject(values, fallback = null) {
  return selectMatchingValue(
    values,
    (value) => value && typeof value === 'object',
    fallback,
  );
}
function selectPlanningString(values, fallback = null) {
  return selectMatchingValue(
    values,
    (value) => typeof value === 'string' && value.length > 0,
    fallback,
  );
}
function selectPlanningNumber(values, fallback = null) {
  return selectMatchingValue(values, Number.isFinite, fallback);
}
function valueOrFallback(value, fallback) {
  return value === null || value === undefined ? fallback : value;
}
function readRecordField(record, fieldName, fallback) {
  return record ?
    valueOrFallback(record[fieldName], fallback) :
    fallback;
}
function buildPlanningPublicationRecoveryGate(planningSnapshot) {
  const providedGate = selectPlanningObject([
    planningSnapshot.publicationRecoveryGate,
  ]);
  return buildPublicationRecoveryGateSnapshot({
    ...providedGate,
    publicationEpoch: selectPlanningNumber(
      [planningSnapshot.publicationEpoch],
      readRecordField(providedGate, GATE_FIELD.PUBLICATION_EPOCH, null),
    ),
    publicationStatus: selectPlanningString(
      [planningSnapshot.publicationStatus, planningSnapshot.status],
      readRecordField(providedGate, GATE_FIELD.PUBLICATION_STATUS, null),
    ),
    publicationObservationState: selectPlanningString(
      [planningSnapshot.publicationObservationState],
      readRecordField(
        providedGate,
        GATE_FIELD.PUBLICATION_OBSERVATION_STATE,
        null,
      ),
    ),
    recoveryProtocolState: selectPlanningString(
      [planningSnapshot.recoveryProtocolState],
      readRecordField(providedGate, GATE_FIELD.RECOVERY_PROTOCOL_STATE, null),
    ),
    priorityRecoveryReasonCodes: selectPlanningArray(
      [planningSnapshot.priorityRecoveryReasonCodes],
      readRecordField(providedGate, GATE_FIELD.REASON_CODES, undefined),
    ),
    priorityPartitionSummary: selectPlanningObject(
      [planningSnapshot.priorityPartitionSummary],
      readRecordField(providedGate, GATE_FIELD.PRIORITY_PARTITION_SUMMARY, null),
    ),
    priorityRecoveryClosureWitness: selectPlanningObject(
      [planningSnapshot.priorityRecoveryClosureWitness],
      readRecordField(
        providedGate,
        GATE_FIELD.PRIORITY_RECOVERY_CLOSURE_WITNESS,
        null,
      ),
    ),
    pendingAckNodeIds: selectPlanningArray(
      [planningSnapshot.pendingAckNodeIds],
      readRecordField(providedGate, GATE_FIELD.PENDING_ACK_NODE_IDS, []),
    ),
    missingPublishedNodeIds: selectPlanningArray(
      [
        planningSnapshot.missingPublishedNodeIds,
        planningSnapshot.missingPublishedRecoveryActiveNodeIds,
      ],
      readRecordField(providedGate, GATE_FIELD.MISSING_PUBLISHED_NODE_IDS, []),
    ),
  });
}
function readMembershipPlanningSnapshot(readinessService, nodeId, observedAt) {
  const getterName = [
    'getMembershipPublicationPlanningAnswerSync',
    'getMembershipPublicationPlanningSnapshotSync',
  ].find((name) => typeof readinessService?.[name] === 'function');
  return getterName ? readinessService[getterName](nodeId, observedAt) : null;
}
function normalizeNodeIdSet(nodeIds) {
  return new Set(
    (Array.isArray(nodeIds) ? nodeIds : [])
      .filter((nodeId) => typeof nodeId === 'string' && nodeId.length > 0),
  );
}
function readPriorityOperationPartitionId(operation) {
  return String(
    operation?.partitionId || operation?.partition_id || '',
  ).trim();
}
function readPriorityOperationId(operation) {
  return String(
    operation?.operationId || operation?.operation_id || '',
  ).trim();
}

function groupPriorityOperations(operations) {
  const byPartitionId = new Map();
  for (const operation of Array.isArray(operations) ? operations : []) {
    const partitionId = readPriorityOperationPartitionId(operation);
    if (
      partitionId.length === 0 ||
      !classifySystemPartition({partitionId}).priorityControlPlane
    ) {
      continue;
    }
    const partitionOperations = byPartitionId.get(partitionId) || [];
    partitionOperations.push(operation);
    byPartitionId.set(partitionId, partitionOperations);
  }
  return byPartitionId;
}

function collectNonBlockingPriorityOperationIds(
  operationIds,
  partitionId,
  partitionOperations,
  planningSnapshot,
) {
  if (!planningSnapshot) {
    return;
  }
  const effectiveEligibleNodeIds =
    resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds;
  const assessment = buildPriorityRecoveryPartitionAssessment({
    partitionId,
    priorityPartitionSummary:
      planningSnapshot.priorityPartitionSummary || null,
    admission: {
      effectiveEligibleNodeIds,
      effectiveEligibleNodeCount: effectiveEligibleNodeIds.length,
      ineligibleNodes: [],
    },
    operationContexts: partitionOperations
      .map((operation) =>
        buildPriorityRecoveryOperationContextFromRecord(operation))
      .filter(Boolean),
  });
  if (shouldPriorityRecoveryOperationBlockPlanning(assessment)) {
    return;
  }
  for (const operation of partitionOperations) {
    const operationId = readPriorityOperationId(operation);
    if (operationId.length > 0) {
      operationIds.add(operationId);
    }
  }
}

function resolvePriorityLearnerNodeIds(serviceRows) {
  const nodeIds = new Set();
  for (const serviceRow of serviceRows) {
    const service = normalizeServiceRow(serviceRow);
    if (
      service.nodeId &&
      isCatchupLearnerRaftRole(service.raftRole) &&
      classifySystemPartition({partitionId: service.partitionId})
        .priorityControlPlane
    ) {
      nodeIds.add(service.nodeId);
    }
  }
  return nodeIds;
}

function buildCurrentPriorityPlacementFromRebalancerCache({
  systemTableCache,
  readinessService,
  planningSnapshot,
  planningPublishedActiveNodeIds,
  readyNodeIds,
  cohortNodeIds,
  observedAt,
  currentPartitionId = null,
  currentPartitionServiceRows = null,
}) {
  const locallyEligibleNodeIds = [
    ...new Set([...readyNodeIds, ...cohortNodeIds]),
  ];
  const partitionRows = readAllSharedRows(
    systemTableCache,
    TABLES.PARTITIONS,
  );
  const cachedServiceRows = readAllSharedRows(
    systemTableCache,
    TABLES.SERVICES,
  );
  const normalizedCurrentPartitionId = String(
    currentPartitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
  ).trim();
  const serviceRows =
    normalizedCurrentPartitionId.length > 0 &&
    Array.isArray(currentPartitionServiceRows) ?
      [
        ...cachedServiceRows.filter(
          (serviceRow) =>
            normalizeServiceRow(serviceRow).partitionId !==
              normalizedCurrentPartitionId,
        ),
        ...currentPartitionServiceRows,
      ] :
      cachedServiceRows;
  const locallyEligibleNodeIdSet = new Set(locallyEligibleNodeIds);
  const priorityLearnerNodeIds =
    resolvePriorityLearnerNodeIds(serviceRows);
  const readinessByNodeId =
    typeof readinessService?.getNodeReadinessSync === 'function' ?
      Object.fromEntries(
        [...priorityLearnerNodeIds]
          .filter((nodeId) => locallyEligibleNodeIdSet.has(nodeId))
          .map((nodeId) => [
            nodeId,
            readinessService.getNodeReadinessSync(nodeId, {
              allowStaleOnCacheChange: false,
            }),
          ]),
      ) :
      {};
  return buildCurrentPriorityPlacementObservation({
    capturedAt: observedAt,
    partitionRows,
    serviceRows,
    readinessByNodeId,
    activeNodeViews: {
      locallyEligibleNodeIds,
      projectedServingNodeIds:
        planningSnapshot?.projectedServingNodeIds || [],
      publishedActiveNodeIds: [...planningPublishedActiveNodeIds],
    },
  });
}

function appendPrioritySummaryBlockers(
  blockedPartitionById,
  priorityPartitionSummary,
) {
  for (
    const partition of buildPriorityRecoveryBlockedPartitions(
      priorityPartitionSummary,
    )
  ) {
    const blocker = buildPriorityPartitionBlocker(partition);
    const {partitionId} = blocker;
    if (partitionId.length === 0) {
      continue;
    }
    blockedPartitionById.set(partitionId, blocker);
  }
}

function buildCurrentPrioritySchedulingBlockers({
  currentPlacementObservation,
  publishedPriorityPartitionSummary,
  publicationRecoveryGate,
}) {
  const currentPlacementPending = isCurrentPriorityPlacementPending(
    currentPlacementObservation,
  );
  const publishedPlacementPending = isPublishedPriorityPlacementPending(
    publishedPriorityPartitionSummary,
    publicationRecoveryGate,
  );
  if ([currentPlacementPending, publishedPlacementPending].every(
    (pending) => !pending,
  )) {
    return [];
  }
  const blockedPartitionById = new Map();
  if (publishedPlacementPending) {
    appendPrioritySummaryBlockers(
      blockedPartitionById,
      publishedPriorityPartitionSummary,
    );
  }
  if (currentPlacementPending) {
    appendPrioritySummaryBlockers(
      blockedPartitionById,
      currentPlacementObservation.priorityPartitionSummary,
    );
    for (
      const partitionId of
      readMissingCurrentPriorityLeaderPartitionIds(
        currentPlacementObservation,
      )
    ) {
      blockedPartitionById.set(partitionId, buildMissingLeaderBlocker({
        existing: blockedPartitionById.get(partitionId),
        partitionId,
      }));
    }
  }
  return [...blockedPartitionById.values()]
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId))
    .map(freezePriorityPartitionBlocker);
}

class UnifiedRebalancerPriorityReadinessMethods {
  // Combine current placement actuals with the publication-owned node cohort.
  buildCurrentPriorityPlacementPlanningObservation(
    planningSnapshot = null,
    options = {},
  ) {
    const planningPublishedActiveNodeIds = new Set(
      (Array.isArray(planningSnapshot?.publishedActiveNodeIds) ?
        planningSnapshot.publishedActiveNodeIds :
        Array.isArray(planningSnapshot?.published_active_node_ids) ?
          planningSnapshot.published_active_node_ids :
          []
      ).filter(
        (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
      ),
    );
    const readyNodeIds =
      options.readyNodeIds instanceof Set ?
        options.readyNodeIds :
        new Set();
    const cohortNodeIds = new Set(
      resolvePriorityRecoveryActiveNodeCohort(
        planningSnapshot,
      ).activeNodeIds,
    );
    const currentPriorityPartition =
      this.isControlPlanePriorityPartition();
    return buildCurrentPriorityPlacementFromRebalancerCache({
      systemTableCache: this.systemTableCache,
      readinessService: this.controlPlaneReadinessService,
      planningSnapshot,
      planningPublishedActiveNodeIds,
      readyNodeIds,
      cohortNodeIds,
      observedAt:
        Number.isFinite(options.observedAt) ?
          options.observedAt :
          this.nowFn(),
      currentPartitionId:
        currentPriorityPartition ? this.entityId : null,
      currentPartitionServiceRows:
        currentPriorityPartition ? this.getCurrentReplicas() : null,
    });
  }

  // Keep epoch progress while overlaying current placement actuals.
  buildCurrentPriorityRecoveryPlanningSnapshot(planningSnapshot = null) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return planningSnapshot;
    }
    if (!this.isControlPlanePriorityPartition()) {
      return planningSnapshot;
    }
    const currentPlacementObservation =
      this.buildCurrentPriorityPlacementPlanningObservation(planningSnapshot);
    if (
      currentPlacementObservation?.state !==
        PRIORITY_PLACEMENT_STATE.AVAILABLE ||
      !currentPlacementObservation.priorityPartitionSummary
    ) {
      return planningSnapshot;
    }
    const publishedPriorityPartitionSummary =
      selectPlanningObject([
        planningSnapshot.priorityPartitionSummary,
        planningSnapshot.publicationRecoveryGate?.priorityPartitionSummary,
      ]);
    const publishedPlacementStillPending =
      publishedPriorityPartitionSummary &&
      publishedPriorityPartitionSummary.satisfied !== true;
    if (publishedPlacementStillPending) {
      return planningSnapshot;
    }
    return Object.freeze({
      ...planningSnapshot,
      priorityPartitionSummary:
        currentPlacementObservation.priorityPartitionSummary,
      currentPriorityPlacementObservation: currentPlacementObservation,
    });
  }

  async buildNonBlockingPriorityOperationIdSet(operations = []) {
    const nonBlockingOperationIds = new Set();
    for (const [
      partitionId,
      partitionOperations,
    ] of groupPriorityOperations(operations)) {
      const planningSnapshot = await this.getPriorityRecoveryPlanningSnapshot(
        partitionOperations[0],
      );
      collectNonBlockingPriorityOperationIds(
        nonBlockingOperationIds,
        partitionId,
        partitionOperations,
        planningSnapshot,
      );
    }
    return nonBlockingOperationIds;
  }

  // Synchronous variant used by cache-backed topology checks.
  buildNonBlockingPriorityOperationIdSetSync(operations = [], options = {}) {
    const nonBlockingOperationIds = new Set();
    for (const [
      partitionId,
      partitionOperations,
    ] of groupPriorityOperations(operations)) {
      const planningSnapshot = this.getPriorityRecoveryPlanningSnapshotSync(
        partitionOperations[0],
        options,
      );
      collectNonBlockingPriorityOperationIds(
        nonBlockingOperationIds,
        partitionId,
        partitionOperations,
        planningSnapshot,
      );
    }
    return nonBlockingOperationIds;
  }

  // Yield non-priority work until startup-critical partitions are spread.
  getControlPlanePrioritySpreadBlocker() {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService) {
      return null;
    }
    const observedAt = Date.now();
    const planningSnapshot = readMembershipPlanningSnapshot(
      readinessService,
      this.nodeId,
      observedAt,
    );
    if (
      !Array.isArray(planningSnapshot?.publishedActiveNodeIds) &&
      !Array.isArray(planningSnapshot?.published_active_node_ids)
    ) {
      return null;
    }
    const publicationRecoveryGate =
      buildPlanningPublicationRecoveryGate(planningSnapshot);
    const publishedPriorityPartitionSummary =
      publicationRecoveryGate.priorityPartitionSummary;
    const planningPublishedActiveNodeIds = normalizeNodeIdSet(
      selectPlanningArray([
        planningSnapshot?.publishedActiveNodeIds,
        planningSnapshot?.published_active_node_ids,
      ]),
    );
    const readyNodes = this.getAvailableNodesConstrainedToNodeIds(
      planningPublishedActiveNodeIds,
    );
    const readyNodeIds = normalizeNodeIdSet(
      readyNodes.map((node) => node?.node_id || node?.nodeId || ''),
    );
    // The spread target must reflect the INTENDED cluster cohort (forming/joining
    // members included, admission-blocked/dead excluded), NOT only nodes already
    // ACTIVE/ready. Deriving it from ready nodes alone is self-defeating during
    // formation: with one ACTIVE node the target collapses to 1, the spread reads
    // "satisfied", this blocker returns null, the topology-settling gate's
    // priority-recovery bypass never engages, the spread is never planned — so
    // nodes never receive replicas and never become ACTIVE (the formation
    // chicken-and-egg). resolvePriorityRecoveryActiveNodeCohort is the existing
    // intended-minus-admission-blocked set; max() with readyNodeIds keeps ACTIVE
    // nodes as a floor so behaviour is never worse than ready-only when the
    // cohort is unavailable, and never counts a dead node (cohort excludes them).
    const cohortNodeIds = normalizeNodeIdSet(
      resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds,
    );
    const requiredDistinctNodeCount = Math.min(
      NUM.THREE,
      Math.max(readyNodeIds.size, cohortNodeIds.size),
    );
    if (requiredDistinctNodeCount <= 1) {
      return null;
    }
    const requiredQuorumDistinctNodeCount =
      this.resolvePriorityControlPlaneQuorumDistinctNodeCount(
        requiredDistinctNodeCount,
      );
    // Diagnostic-only here: this scheduling fence deliberately waits for the
    // Quest's full three-node spread (and active-leader coverage), while the
    // unchanged quorum floor remains the safety decision at mutation/remove
    // owners.

    const currentPlacementObservation =
      this.buildCurrentPriorityPlacementPlanningObservation(
        planningSnapshot,
        {
          observedAt,
          readyNodeIds,
        },
      );
    const blockedPartitions = buildCurrentPrioritySchedulingBlockers({
      currentPlacementObservation,
      publishedPriorityPartitionSummary,
      publicationRecoveryGate,
    });
    if (blockedPartitions.length === 0) {
      return null;
    }

    return Object.freeze({
      requiredDistinctNodeCount,
      requiredQuorumDistinctNodeCount,
      blockedPartitions: Object.freeze(blockedPartitions),
    });
  }

  // Resolve transport peers plus the local node.
  resolveConnectedClusterNodeIds() {
    const connectedNodeIds = new Set();
    if (
      typeof this.nodeId === 'string' &&
      this.nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      connectedNodeIds.add(this.nodeId);
    }
    const peers =
      typeof this.messageRouter?.getConnectedNodes === 'function' ?
        this.messageRouter.getConnectedNodes() :
        [];
    for (const peerNodeId of peers) {
      if (
        typeof peerNodeId === 'string' &&
        peerNodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO
      ) {
        connectedNodeIds.add(peerNodeId);
      }
    }
    return connectedNodeIds;
  }

  // Summarize endpoint visibility for ACTIVE cluster members.
  evaluateCriticalSystemEndpointVisibility(activeNodeIds = [], options = {}) {
    const nodeEndpointRows =
      typeof this.systemTableCache?.getAll === 'function' ?
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) :
        [];
    const serviceEndpointRows =
      typeof this.systemTableCache?.getAll === 'function' ?
        this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS) :
        [];
    return this.summarizeCriticalSystemEndpointVisibility(
      activeNodeIds,
      nodeEndpointRows,
      serviceEndpointRows,
      options,
    );
  }

  // Non-priority system work waits for published convergence.
  shouldRequirePublishedConvergenceBeforeBackgroundMutation() {
    return this.isSystemPartitionEntity() &&
      !this.isControlPlanePriorityPartition() &&
      !this.formationDependencyMayUseRecoveryEvidence();
  }

  // Return the local mutation-readiness blocker, if any.
  getLocalControlPlaneMutationReadinessBlocker() {
    return getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      requirePublishedConvergence:
        this.shouldRequirePublishedConvergenceBeforeBackgroundMutation(),
      allowPriorityRecoveryBypass: this.isControlPlanePriorityPartition(),
    });
  }

  // Return the latest bootstrap readiness snapshot.
  getBootstrapReadinessSnapshot() {
    if (
      this.startupRecoveryCoordinator &&
      typeof this.startupRecoveryCoordinator.getSnapshot === 'function'
    ) {
      return this.startupRecoveryCoordinator.getSnapshot();
    }
    if (!this.bootstrapReadinessState) {
      return null;
    }
    return typeof this.bootstrapReadinessState.evaluate === 'function' ?
      this.bootstrapReadinessState.evaluate() :
      typeof this.bootstrapReadinessState.getSnapshot === 'function' ?
        this.bootstrapReadinessState.getSnapshot() :
        null;
  }

  // Check whether lifecycle has opened this entity's background lane.
  isBootstrapReadinessOpenForBackgroundWork(snapshot) {
    const startupAuthority = this.getStartupAuthoritySnapshot();
    if (
      this.startupRecoveryCoordinator &&
      typeof this.startupRecoveryCoordinator.evaluate === 'function'
    ) {
      return (
        this.startupRecoveryCoordinator.evaluate({
          partitionId: this.entityId,
          snapshot,
          startupAuthority,
        }).backgroundWorkReady === true
      );
    }
    return isBackgroundWorkLifecycleReadySnapshot(snapshot, {
      partitionId: this.entityId,
    });
  }

  // Let priority partitions recover through the seed startup quarantine.
  shouldBypassLocalPriorityControlPlaneStartupReadiness() {
    const startupAuthority = this.getStartupAuthoritySnapshot();
    if (
      this.startupRecoveryCoordinator &&
      typeof this.startupRecoveryCoordinator.evaluate === 'function'
    ) {
      return (
        this.startupRecoveryCoordinator.evaluate({
          partitionId: this.entityId,
          startupAuthority,
        }).shouldBypassLocalPriorityControlPlaneStartupReadiness === true
      );
    }
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    const snapshot = this.getBootstrapReadinessSnapshot();
    if (!this.isBootstrapReadinessOpenForBackgroundWork(snapshot)) {
      return false;
    }
    return !(
      snapshot?.ready === true &&
      snapshot?.phase === LIFECYCLE_PHASE.TRAFFIC_READY
    );
  }

  getStartupAuthoritySnapshot() {
    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      typeof readinessService.getStartupAuthoritySnapshotSync !==
        'function'
    ) {
      return null;
    }
    try {
      return readinessService.getStartupAuthoritySnapshotSync(
        this.nodeId,
        Date.now(),
      );
    } catch (_error) {
      return null;
    }
  }

  // Priority work opens at metadata publication; other system work waits for
  // the lifecycle owner's traffic-ready phase.
  getCriticalSystemTrafficReadinessBlocker() {
    if (!this.isSystemPartitionEntity() || !this.bootstrapReadinessState) {
      return null;
    }

    const snapshot = this.getBootstrapReadinessSnapshot();
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    if (this.isBootstrapReadinessOpenForBackgroundWork(snapshot)) {
      return null;
    }
    return snapshot;
  }
}

function applyUnifiedRebalancerPriorityReadinessMethods(targetClass) {
  const sourcePrototype =
    UnifiedRebalancerPriorityReadinessMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === PRIORITY_READINESS_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyUnifiedRebalancerPriorityReadinessMethods};
