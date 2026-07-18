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
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
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
  resolveReplicaOperationSemanticPhase,
  shouldPriorityRecoveryOperationBlockPlanning,
} = UNIFIED_REBALANCER_SHARED;

const PRIORITY_READINESS_CONSTRUCTOR = 'constructor';

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
  return observation?.state === 'available' &&
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
  /**
   * Build a current placement observation from this rebalancer's cache while
   * reusing the publication owner's eligible cohort. Priority entities replace
   * their own raw service rows with getCurrentReplicas(), which includes
   * terminal create/retirement projections and therefore cannot re-mint work
   * merely because the services cache trails a completed operation.
   *
   * The caller may supply the canonical available-node pass. Operation-
   * creation decisions deliberately omit it: the publication recovery cohort
   * is the formation authority, and constraining that decision to serve-ready
   * nodes recreates the readiness -> placement -> readiness cycle.
   *
   * @param {Object|null} planningSnapshot
   * @param {Object} options
   * @return {Object}
   * @private
   */
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

  /**
   * Overlay the monotonic publication snapshot with current placement actuals
   * for rebalancer operation creation. Publication summaries intentionally
   * preserve epoch progress; they are not allowed to erase a later physical
   * spread regression at the actuator boundary.
   *
   * @param {Object|null} planningSnapshot
   * @return {Object|null}
   * @private
   */
  buildCurrentPriorityRecoveryPlanningSnapshot(planningSnapshot = null) {
    if (
      !planningSnapshot ||
      typeof planningSnapshot !== 'object' ||
      !this.isControlPlanePriorityPartition()
    ) {
      return planningSnapshot;
    }
    const currentPlacementObservation =
      this.buildCurrentPriorityPlacementPlanningObservation(planningSnapshot);
    if (
      currentPlacementObservation?.state !== 'available' ||
      !currentPlacementObservation.priorityPartitionSummary
    ) {
      return planningSnapshot;
    }
    const publishedPriorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary ||
      planningSnapshot.publicationRecoveryGate?.priorityPartitionSummary ||
      null;
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
    const operationsByPartitionId = new Map();
    for (const operation of Array.isArray(operations) ? operations : []) {
      const partitionId = String(
        operation?.partitionId || operation?.partition_id || '',
      ).trim();
      if (
        partitionId.length === 0 ||
        !classifySystemPartition({partitionId}).priorityControlPlane
      ) {
        continue;
      }
      if (!operationsByPartitionId.has(partitionId)) {
        operationsByPartitionId.set(partitionId, []);
      }
      operationsByPartitionId.get(partitionId).push(operation);
    }
    const nonBlockingOperationIds = new Set();
    for (const [
      partitionId,
      partitionOperations,
    ] of operationsByPartitionId.entries()) {
      const planningSnapshot = await this.getPriorityRecoveryPlanningSnapshot(
        partitionOperations[0],
      );
      if (!planningSnapshot) {
        continue;
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
            buildPriorityRecoveryOperationContextFromRecord(operation),
          )
          .filter(Boolean),
      });
      if (shouldPriorityRecoveryOperationBlockPlanning(assessment)) {
        continue;
      }
      for (const operation of partitionOperations) {
        const operationId = String(
          operation?.operationId || operation?.operation_id || '',
        ).trim();
        if (operationId.length > 0) {
          nonBlockingOperationIds.add(operationId);
        }
      }
    }
    return nonBlockingOperationIds;
  }

  /**
   * Synchronous variant of `buildNonBlockingPriorityOperationIdSet`.
   *
   * @param {Array<Object>} operations
   * @param {Object} options
   * @param {number} [options.observedAt]
   * @return {Set<string>}
   * @private
   */
  buildNonBlockingPriorityOperationIdSetSync(operations = [], options = {}) {
    const operationsByPartitionId = new Map();
    for (const operation of Array.isArray(operations) ? operations : []) {
      const partitionId = String(
        operation?.partitionId || operation?.partition_id || '',
      ).trim();
      if (
        partitionId.length === 0 ||
        !classifySystemPartition({partitionId}).priorityControlPlane
      ) {
        continue;
      }
      if (!operationsByPartitionId.has(partitionId)) {
        operationsByPartitionId.set(partitionId, []);
      }
      operationsByPartitionId.get(partitionId).push(operation);
    }
    const nonBlockingOperationIds = new Set();
    for (const [
      partitionId,
      partitionOperations,
    ] of operationsByPartitionId.entries()) {
      const planningSnapshot = this.getPriorityRecoveryPlanningSnapshotSync(
        partitionOperations[0],
        options,
      );
      if (!planningSnapshot) {
        continue;
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
            buildPriorityRecoveryOperationContextFromRecord(operation),
          )
          .filter(Boolean),
      });
      if (shouldPriorityRecoveryOperationBlockPlanning(assessment)) {
        continue;
      }
      for (const operation of partitionOperations) {
        const operationId = String(
          operation?.operationId || operation?.operation_id || '',
        ).trim();
        if (operationId.length > 0) {
          nonBlockingOperationIds.add(operationId);
        }
      }
    }
    return nonBlockingOperationIds;
  }

  /**
   * Return a blocker summary when non-system entities should yield until the
   * startup-critical control-plane partitions are spread across ready nodes.
   *
   * This keeps user/data-plane rebalancing from consuming the global
   * rebalancer budget while the seed is still the only owner of the control
   * plane write path.
   *
   * @return {Object|null}
   * @private
   */
  getControlPlanePrioritySpreadBlocker() {
    if (this.isControlPlanePriorityPartition()) {
      return null;
    }

    const readinessService = this.controlPlaneReadinessService;
    const observedAt = Date.now();
    let planningSnapshot = null;
    if (!readinessService) {
      return null;
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningAnswerSync ===
      'function'
    ) {
      planningSnapshot =
        readinessService.getMembershipPublicationPlanningAnswerSync(
          this.nodeId,
          observedAt,
        );
    } else if (
      readinessService &&
      typeof readinessService.getMembershipPublicationPlanningSnapshotSync ===
        'function'
    ) {
      planningSnapshot =
        readinessService.getMembershipPublicationPlanningSnapshotSync(
          this.nodeId,
          observedAt,
        );
    } else {
      return null;
    }

    const providedPublicationRecoveryGate =
      planningSnapshot?.publicationRecoveryGate &&
      typeof planningSnapshot.publicationRecoveryGate === 'object' ?
        planningSnapshot.publicationRecoveryGate :
        null;
    const publicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
      ...(providedPublicationRecoveryGate || {}),
      publicationEpoch:
        Number.isFinite(planningSnapshot?.publicationEpoch) ?
          planningSnapshot.publicationEpoch :
          providedPublicationRecoveryGate?.publicationEpoch ?? null,
      publicationStatus:
        typeof planningSnapshot?.publicationStatus === 'string' &&
        planningSnapshot.publicationStatus.length > 0 ?
          planningSnapshot.publicationStatus :
          typeof planningSnapshot?.status === 'string' &&
              planningSnapshot.status.length > 0 ?
            planningSnapshot.status :
            providedPublicationRecoveryGate?.publicationStatus ?? null,
      publicationObservationState:
        typeof planningSnapshot?.publicationObservationState === 'string' &&
        planningSnapshot.publicationObservationState.length > 0 ?
          planningSnapshot.publicationObservationState :
          providedPublicationRecoveryGate?.publicationObservationState ??
            null,
      recoveryProtocolState:
        typeof planningSnapshot?.recoveryProtocolState === 'string' &&
        planningSnapshot.recoveryProtocolState.length > 0 ?
          planningSnapshot.recoveryProtocolState :
          providedPublicationRecoveryGate?.recoveryProtocolState ?? null,
      priorityRecoveryReasonCodes:
        Array.isArray(planningSnapshot?.priorityRecoveryReasonCodes) ?
          planningSnapshot.priorityRecoveryReasonCodes :
          providedPublicationRecoveryGate?.reasonCodes,
      priorityPartitionSummary:
        planningSnapshot?.priorityPartitionSummary &&
        typeof planningSnapshot.priorityPartitionSummary === 'object' ?
          planningSnapshot.priorityPartitionSummary :
          providedPublicationRecoveryGate?.priorityPartitionSummary ?? null,
      priorityRecoveryClosureWitness:
        planningSnapshot?.priorityRecoveryClosureWitness &&
        typeof planningSnapshot.priorityRecoveryClosureWitness ===
          'object' ?
          planningSnapshot.priorityRecoveryClosureWitness :
          providedPublicationRecoveryGate?.priorityRecoveryClosureWitness ??
            null,
      pendingAckNodeIds:
        Array.isArray(planningSnapshot?.pendingAckNodeIds) ?
          planningSnapshot.pendingAckNodeIds :
          providedPublicationRecoveryGate?.pendingAckNodeIds ?? [],
      missingPublishedNodeIds:
        Array.isArray(planningSnapshot?.missingPublishedNodeIds) ?
          planningSnapshot.missingPublishedNodeIds :
          Array.isArray(
            planningSnapshot?.missingPublishedRecoveryActiveNodeIds,
          ) ?
            planningSnapshot.missingPublishedRecoveryActiveNodeIds :
            providedPublicationRecoveryGate?.missingPublishedNodeIds ?? [],
    });
    const publishedPriorityPartitionSummary =
      publicationRecoveryGate.priorityPartitionSummary;

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
    const readyNodes =
      planningPublishedActiveNodeIds.size > 0 ?
        this.getAvailableNodesConstrainedToNodeIds(
          planningPublishedActiveNodeIds,
        ) :
        this.getAvailableNodes();
    const readyNodeIds = new Set(
      readyNodes
        .map((node) => node?.node_id || node?.nodeId || '')
        .filter(Boolean),
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
    const cohortActiveNodeIds =
      resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds;
    const cohortNodeIds = new Set(
      (Array.isArray(cohortActiveNodeIds) ? cohortActiveNodeIds : []).filter(
        (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
      ),
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

  /**
   * Resolve live cluster peers from the message router plus the local node.
   * When transport shows peers that the nodes table does not yet publish,
   * system-topology background work should continue to treat the cluster as
   * settling.
   * @return {Set<string>}
   * @private
   */
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

  /**
   * Return one endpoint visibility summary for ACTIVE cluster members.
   * @param {string[]} activeNodeIds
   * @param {Object} [options={}]
   * @param {boolean} [options.allowReadinessBackfill=true]
   * @param {number} [options.requiredReadyNodeCount]
   * @return {{
   *   ready: boolean,
   *   missingNodeEndpointNodeIds: string[],
   *   missingPostgresWireNodeIds: string[],
   *   endpointReadyNodeCount: number,
   *   requiredReadyNodeCount: number,
   *   endpointReadyNodeIds: string[],
   * }}
   * @private
   */
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

  /**
   * Normalize one in-flight replica operation for topology diagnostics.
   * @param {Object} row
   * @return {Object}
   * @private
   */
  buildCriticalSystemInFlightReplicaOperationDetail(row) {
    const operationId = row?.operation_id || row?.operationId || null;
    const type = row?.type || null;
    const partitionId =
      row?.partition_group_id ||
      row?.partitionGroupId ||
      row?.partition_id ||
      row?.partitionId ||
      null;
    const targetNodeId = String(row?.target_node_id || row?.targetNodeId || '');
    const status =
      row?.status || String(row?.status || '').toLowerCase() || null;
    const workflowStep = row?.workflow_step || row?.workflowStep || null;
    const semanticPhase = resolveReplicaOperationSemanticPhase(
      type,
      workflowStep,
      status,
    );

    return Object.freeze({
      operationId,
      type,
      partitionId,
      targetNodeId,
      status,
      workflowStep,
      semanticPhase,
    });
  }

  /**
   * Return non-terminal replica operations that still indicate topology churn
   * for already-ACTIVE nodes.
   * @param {string[]} activeNodeIds
   * @return {{count:number,details:Object[]}}
   * @private
   */
  collectCriticalSystemInFlightReplicaOperations(
    activeNodeIds = [],
    options = {},
  ) {
    const requiredNodeIds = new Set(
      (Array.isArray(activeNodeIds) ? activeNodeIds : []).filter(
        (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
      ),
    );
    const scopeToEntity = options.scopeToEntity === true;
    if (
      requiredNodeIds.size === 0 ||
      typeof this.systemTableCache?.getAll !== 'function'
    ) {
      return Object.freeze({
        count: 0,
        details: Object.freeze([]),
        source: null,
      });
    }

    const rows = readAllSharedRows(
      this.systemTableCache,
      TABLES.REPLICA_OPERATIONS,
    );
    const nowMs = Date.now();
    const details = [];
    const nonBlockingPriorityOperationIds =
      this.buildNonBlockingPriorityOperationIdSetSync(rows, {
        observedAt: nowMs,
      });
    for (const row of rows) {
      if (!this.isTopologySettlingInFlightOperation(row, {nowMs})) {
        continue;
      }
      if (scopeToEntity && !this.isOperationForEntity(row)) {
        continue;
      }
      const operationId = String(
        row?.operationId || row?.operation_id || '',
      ).trim();
      if (
        operationId.length > 0 &&
        nonBlockingPriorityOperationIds.has(operationId)
      ) {
        continue;
      }
      const detail =
        this.buildCriticalSystemInFlightReplicaOperationDetail(row);
      const {targetNodeId} = detail;
      if (!targetNodeId || !requiredNodeIds.has(targetNodeId)) {
        continue;
      }
      details.push(detail);
    }

    return Object.freeze({
      count: details.length,
      details: Object.freeze(details),
      source: TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE.CACHE,
    });
  }

  /**
   * Non-priority system partitions should wait for published convergence
   * before mutating topology. Non-system entities already have a dedicated
   * priority-spread gate with a short retry cadence and must not be folded
   * into the broader local mutation-readiness backoff.
   *
   * @return {boolean}
   * @private
   */
  shouldRequirePublishedConvergenceBeforeBackgroundMutation() {
    return (
      this.isSystemPartitionEntity() && !this.isControlPlanePriorityPartition()
    );
  }

  /**
   * Return one local readiness snapshot when background topology mutation
   * should wait for the local metadata publication contract to recover.
   *
   * @return {Object|null}
   * @private
   */
  getLocalControlPlaneMutationReadinessBlocker() {
    return getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      requirePublishedConvergence:
        this.shouldRequirePublishedConvergenceBeforeBackgroundMutation(),
      allowPriorityRecoveryBypass: this.isControlPlanePriorityPartition(),
    });
  }

  /**
   * Return the latest bootstrap readiness snapshot when available.
   *
   * @return {Object|null}
   * @private
   */
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

  /**
   * Check whether lifecycle has opened background work for this entity.
   *
   * @param {Object|null} snapshot - Bootstrap readiness snapshot.
   * @return {boolean}
   * @private
   */
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

  /**
   * Priority control-plane partitions may recover through the local seed's
   * startup quarantine once lifecycle has opened metadata publication, even
   * before the seed becomes serve-eligible again.
   *
   * @return {boolean}
   * @private
   */
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

  /**
   * Return one bootstrap lifecycle snapshot when critical system-partition
   * planning should wait for the lifecycle owner to open background work.
   *
   * `BootstrapReadinessState` is the canonical owner for startup/join/traffic
   * lifecycle. Most system redistribution should wait for `TRAFFIC_READY`,
   * but the priority control-plane partitions are allowed once metadata
   * publication is open because they are required to complete restart/join
   * convergence under load.
   *
   * @return {Object|null}
   * @private
   */
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
