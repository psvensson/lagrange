import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {UnifiedRebalancerSegment2} from './unified-rebalancer-segment-2.js';

const {
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
  EntityType,
  LIFECYCLE_PHASE,
  NUM,
  OperationType,
  READINESS_SKIP_DETAIL,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  ReplicaStatus,
  SERVICE_STATUS,
  STATE,
  SYSTEM_TABLE_NAME,
  TABLES,
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
  TYPEOF,
  UNIFIED_REBALANCER_LITERAL,
  WORKFLOW_STEP,
  buildReplicaOperationProgressSnapshot,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildPublicationRecoveryGateSnapshot,
  getLocalControlPlaneMutationReadinessBlocker,
  isBackgroundWorkLifecycleReadySnapshot,
  isCoordinatorOwnedOperationType,
  isNodeReadyWithTransport,
  isPriorityControlPlanePartition,
  isReplaceRemoveDispatchPhase,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isValidWorkflowStep,
  normalizeReplicaOperationRecord,
  normalizeServiceRow,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveReplicaOperationSemanticPhase,
  shouldPriorityRecoveryOperationBlockPlanning,
} = UNIFIED_REBALANCER_SHARED;

const REBALANCE_OPERATION_FIELD = Object.freeze({
  REPLICA_ID_CAMEL: 'replicaId',
  SERVICE_ID_CAMEL: 'serviceId',
  SOURCE_REPLICA_ID: 'sourceReplicaId',
  SOURCE_REPLICA_ID_SNAKE: 'source_replica_id',
  STEPS_HISTORY: 'stepsHistory',
  STEPS_HISTORY_SNAKE: 'steps_history',
});

const LOCAL_SERVE_READINESS_REASON_STATE = Object.freeze({
  SERVE_ELIGIBLE: 'serve_eligible',
  STARTUP_BYPASS: 'startup_bypass',
  PRIORITY_RECOVERY_ONLY: 'priority_recovery_only',
  BLOCKING_REASON_PRESENT: 'blocking_reason_present',
});

const LOCAL_SERVE_READINESS_PLANNING_DECISION = Object.freeze({
  ALLOW_PLANNING: 'allow_planning',
  DEFER_PLANNING: 'defer_planning',
});

const LOCAL_SERVE_READINESS_REASON_DECISION_TABLE = Object.freeze({
  [LOCAL_SERVE_READINESS_REASON_STATE.SERVE_ELIGIBLE]:
    LOCAL_SERVE_READINESS_PLANNING_DECISION.ALLOW_PLANNING,
  [LOCAL_SERVE_READINESS_REASON_STATE.STARTUP_BYPASS]:
    LOCAL_SERVE_READINESS_PLANNING_DECISION.ALLOW_PLANNING,
  [LOCAL_SERVE_READINESS_REASON_STATE.PRIORITY_RECOVERY_ONLY]:
    LOCAL_SERVE_READINESS_PLANNING_DECISION.ALLOW_PLANNING,
  [LOCAL_SERVE_READINESS_REASON_STATE.BLOCKING_REASON_PRESENT]:
    LOCAL_SERVE_READINESS_PLANNING_DECISION.DEFER_PLANNING,
});

const LOCAL_SERVE_PRIORITY_RECOVERY_REASON_CODES = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
]);

const LOCAL_SERVE_PRIORITY_RECOVERY_REASON_CODE_SET = new Set(
  LOCAL_SERVE_PRIORITY_RECOVERY_REASON_CODES,
);

class UnifiedRebalancerSegment3 extends UnifiedRebalancerSegment2 {
  async buildNonBlockingPriorityOperationIdSet(operations = []) {
    const operationsByPartitionId = new Map();
    for (const operation of Array.isArray(operations) ? operations : []) {
      const partitionId = String(
        operation?.partitionId || operation?.partition_id || '',
      ).trim();
      if (
        partitionId.length === NUM.ZERO ||
        !isPriorityControlPlanePartition({partitionId})
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
        partitionOperations[NUM.ZERO],
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
        if (operationId.length > NUM.ZERO) {
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
        partitionId.length === NUM.ZERO ||
        !isPriorityControlPlanePartition({partitionId})
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
        partitionOperations[NUM.ZERO],
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
        if (operationId.length > NUM.ZERO) {
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
      TYPEOF.FUNCTION
    ) {
      planningSnapshot =
        readinessService.getMembershipPublicationPlanningAnswerSync(
          this.nodeId,
          observedAt,
        );
    } else if (
      readinessService &&
      typeof readinessService.getMembershipPublicationPlanningSnapshotSync ===
        TYPEOF.FUNCTION
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
      typeof planningSnapshot.publicationRecoveryGate === TYPEOF.OBJECT ?
        planningSnapshot.publicationRecoveryGate :
        null;
    const publicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
      ...(providedPublicationRecoveryGate || {}),
      publicationEpoch:
        Number.isFinite(planningSnapshot?.publicationEpoch) ?
          planningSnapshot.publicationEpoch :
          providedPublicationRecoveryGate?.publicationEpoch ?? null,
      publicationStatus:
        typeof planningSnapshot?.publicationStatus === TYPEOF.STRING &&
        planningSnapshot.publicationStatus.length > NUM.ZERO ?
          planningSnapshot.publicationStatus :
          typeof planningSnapshot?.status === TYPEOF.STRING &&
              planningSnapshot.status.length > NUM.ZERO ?
            planningSnapshot.status :
            providedPublicationRecoveryGate?.publicationStatus ?? null,
      publicationObservationState:
        typeof planningSnapshot?.publicationObservationState === TYPEOF.STRING &&
        planningSnapshot.publicationObservationState.length > NUM.ZERO ?
          planningSnapshot.publicationObservationState :
          providedPublicationRecoveryGate?.publicationObservationState ??
            null,
      recoveryProtocolState:
        typeof planningSnapshot?.recoveryProtocolState === TYPEOF.STRING &&
        planningSnapshot.recoveryProtocolState.length > NUM.ZERO ?
          planningSnapshot.recoveryProtocolState :
          providedPublicationRecoveryGate?.recoveryProtocolState ?? null,
      priorityRecoveryReasonCodes:
        Array.isArray(planningSnapshot?.priorityRecoveryReasonCodes) ?
          planningSnapshot.priorityRecoveryReasonCodes :
          providedPublicationRecoveryGate?.reasonCodes,
      priorityPartitionSummary:
        planningSnapshot?.priorityPartitionSummary &&
        typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT ?
          planningSnapshot.priorityPartitionSummary :
          providedPublicationRecoveryGate?.priorityPartitionSummary ?? null,
      priorityRecoveryClosureWitness:
        planningSnapshot?.priorityRecoveryClosureWitness &&
        typeof planningSnapshot.priorityRecoveryClosureWitness ===
          TYPEOF.OBJECT ?
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
    const priorityPartitionSummary =
      publicationRecoveryGate.priorityPartitionSummary;
    if (
      !priorityPartitionSummary ||
      publicationRecoveryGate.prioritySpreadPending !== true
    ) {
      return null;
    }

    const planningPublishedActiveNodeIds = new Set(
      (Array.isArray(planningSnapshot?.publishedActiveNodeIds) ?
        planningSnapshot.publishedActiveNodeIds :
        Array.isArray(planningSnapshot?.published_active_node_ids) ?
          planningSnapshot.published_active_node_ids :
          []
      ).filter(
        (nodeId) => typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
      ),
    );
    const readyNodes =
      planningPublishedActiveNodeIds.size > NUM.ZERO ?
        this.getAvailableNodesConstrainedToNodeIds(
          planningPublishedActiveNodeIds,
        ) :
        this.getAvailableNodes();
    const readyNodeIds = new Set(
      readyNodes
        .map((node) => node?.node_id || node?.nodeId || '')
        .filter(Boolean),
    );
    const requiredDistinctNodeCount = Math.min(NUM.THREE, readyNodeIds.size);
    if (requiredDistinctNodeCount <= NUM.ONE) {
      return null;
    }
    const requiredQuorumDistinctNodeCount =
      this.resolvePriorityControlPlaneQuorumDistinctNodeCount(
        requiredDistinctNodeCount,
      );

    const blockedPartitions = buildPriorityRecoveryBlockedPartitions(
      priorityPartitionSummary,
    )
      .map((partition) =>
        Object.freeze({
          partitionId: String(partition?.partitionId || ''),
          readyReplicaCount: Number.isFinite(partition?.readyReplicaCount) ?
            partition.readyReplicaCount :
            null,
          readyDistinctNodeCount: Number.isFinite(
            partition?.readyDistinctNodeCount,
          ) ?
            partition.readyDistinctNodeCount :
            null,
          spreadGap: Number.isFinite(partition?.spreadGap) ?
            partition.spreadGap :
            null,
        }),
      )
      .filter((partition) => partition.partitionId.length > NUM.ZERO);

    const quorumBlockedPartitions = blockedPartitions.filter((partition) => {
      return (
        !Number.isFinite(partition.readyDistinctNodeCount) ||
        partition.readyDistinctNodeCount < requiredQuorumDistinctNodeCount
      );
    });
    if (quorumBlockedPartitions.length === NUM.ZERO) {
      return null;
    }

    return Object.freeze({
      requiredDistinctNodeCount,
      requiredQuorumDistinctNodeCount,
      blockedPartitions: Object.freeze(quorumBlockedPartitions),
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
      typeof this.nodeId === TYPEOF.STRING &&
      this.nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      connectedNodeIds.add(this.nodeId);
    }
    const peers =
      typeof this.messageRouter?.getConnectedNodes === TYPEOF.FUNCTION ?
        this.messageRouter.getConnectedNodes() :
        [];
    for (const peerNodeId of peers) {
      if (
        typeof peerNodeId === TYPEOF.STRING &&
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
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) :
        [];
    const serviceEndpointRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
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
        (nodeId) => typeof nodeId === TYPEOF.STRING && nodeId.length > 0,
      ),
    );
    const scopeToEntity = options.scopeToEntity === true;
    if (
      requiredNodeIds.size === NUM.ZERO ||
      typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION
    ) {
      return Object.freeze({
        count: NUM.ZERO,
        details: Object.freeze([]),
        source: null,
      });
    }

    const rows = this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [];
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
        operationId.length > NUM.ZERO &&
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

  normalizeLocalServeReadinessReasonCodes(readiness) {
    const seenReasonCodes = new Set();
    const reasonCodes = [];
    for (const reason of Array.isArray(readiness?.reasons) ?
      readiness.reasons :
      []) {
      const rawCode =
        typeof reason === TYPEOF.STRING ?
          reason :
          reason?.code || reason?.reason ||
            UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
      const reasonCode = String(rawCode).trim();
      if (
        reasonCode.length === NUM.ZERO ||
        seenReasonCodes.has(reasonCode)
      ) {
        continue;
      }
      seenReasonCodes.add(reasonCode);
      reasonCodes.push(reasonCode);
    }
    return Object.freeze(reasonCodes);
  }

  resolveLocalServeReadinessReasonState({
    readiness,
    reasonCodes,
    startupBypass,
  } = {}) {
    if (
      readiness?.dimensions?.[
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE
      ] === true
    ) {
      return LOCAL_SERVE_READINESS_REASON_STATE.SERVE_ELIGIBLE;
    }
    if (startupBypass === true) {
      return LOCAL_SERVE_READINESS_REASON_STATE.STARTUP_BYPASS;
    }
    if (
      !this.isControlPlanePriorityPartition() ||
      !Array.isArray(reasonCodes) ||
      reasonCodes.length === NUM.ZERO
    ) {
      return LOCAL_SERVE_READINESS_REASON_STATE.BLOCKING_REASON_PRESENT;
    }
    const priorityRecoveryOnly = reasonCodes.every((reasonCode) =>
      LOCAL_SERVE_PRIORITY_RECOVERY_REASON_CODE_SET.has(reasonCode),
    );
    return priorityRecoveryOnly ?
      LOCAL_SERVE_READINESS_REASON_STATE.PRIORITY_RECOVERY_ONLY :
      LOCAL_SERVE_READINESS_REASON_STATE.BLOCKING_REASON_PRESENT;
  }

  buildLocalServeReadinessPlanningSnapshot(readiness) {
    const reasonCodes = this.normalizeLocalServeReadinessReasonCodes(readiness);
    const startupBypass =
      this.shouldBypassLocalPriorityControlPlaneStartupReadiness();
    const reasonState = this.resolveLocalServeReadinessReasonState({
      readiness,
      reasonCodes,
      startupBypass,
    });
    return Object.freeze({
      reasonCodes,
      reasonState,
      startupBypass,
      decision:
        LOCAL_SERVE_READINESS_REASON_DECISION_TABLE[reasonState] ||
        LOCAL_SERVE_READINESS_PLANNING_DECISION.DEFER_PLANNING,
    });
  }

  /**
   * Return one local readiness snapshot when critical system-partition
   * planning should wait for this leader to become serve-eligible.
   *
   * Background redistribution of seed-hosted system partitions fans out many
   * control-plane reads and writes. During join/restart convergence, a leader
   * that is not yet serve-eligible should not initiate that background work,
   * even though repair-eligible topology operations remain valid elsewhere.
   *
   * @return {Object|null}
   * @private
   */
  getCriticalSystemLocalServeReadinessBlocker() {
    if (
      !this.isSystemPartitionEntity() ||
      !this.controlPlaneReadinessService ||
      typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      this.nodeId,
      {
        allowStaleOnCacheChange: false,
      },
    );
    if (!readiness?.dimensions) {
      return null;
    }
    const planningSnapshot =
      this.buildLocalServeReadinessPlanningSnapshot(readiness);
    if (
      planningSnapshot.decision ===
        LOCAL_SERVE_READINESS_PLANNING_DECISION.ALLOW_PLANNING
    ) {
      return null;
    }
    return Object.freeze({
      ...readiness,
      localServeReadinessPlanning: planningSnapshot,
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
    const requiredDimensions =
      this.shouldBypassLocalPriorityControlPlaneStartupReadiness() ?
        [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] :
        null;
    return getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      requiredDimensions,
      requirePublishedConvergence:
        this.shouldRequirePublishedConvergenceBeforeBackgroundMutation(),
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
      typeof this.startupRecoveryCoordinator.getSnapshot === TYPEOF.FUNCTION
    ) {
      return this.startupRecoveryCoordinator.getSnapshot();
    }
    if (!this.bootstrapReadinessState) {
      return null;
    }
    return typeof this.bootstrapReadinessState.evaluate === TYPEOF.FUNCTION ?
      this.bootstrapReadinessState.evaluate() :
      typeof this.bootstrapReadinessState.getSnapshot === TYPEOF.FUNCTION ?
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
      typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION
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
      typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION
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
        TYPEOF.FUNCTION
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
    if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
      return null;
    }
    if (this.isBootstrapReadinessOpenForBackgroundWork(snapshot)) {
      return null;
    }
    return snapshot;
  }

  /**
   * Check if a node is ready to receive replica operations.
   * @param {string} nodeId - Node ID.
   * @return {Promise<boolean>} True if ready.
   */
  async isNodeReady(nodeId) {
    const readinessDecisionDimension =
      this.resolveNodeReadinessDecisionDimension();
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      nodeId,
      {
        decisionDimension: readinessDecisionDimension,
      },
    );
    if (
      !this.isReadinessDimensionSatisfied(readiness, readinessDecisionDimension)
    ) {
      return false;
    }

    // Delegate transport-level checks (connection, outbound queue, and
    // optional ping) to the canonical readiness policy owner.
    return isNodeReadyWithTransport({
      nodeId,
      systemTableCache: this.systemTableCache,
      messageRouter: this.messageRouter,
      requireOutboundQueue: true,
      enableReadinessPing: this.enableReadinessPing,
      readinessPingTimeoutMs: this.readinessPingTimeoutMs,
    });
  }

  /**
   * Thin adapter: check transport-level reachability for a node.
   * Delegates to node-readiness-policy isNodeReadyWithTransport with
   * rebalancer-specific defaults (outbound queue required, no ping).
   * Kept for API compatibility; the main readiness path (isNodeReady)
   * calls the policy owner directly.
   * @param {string} nodeId - Node ID.
   * @return {boolean} True when transport is ready.
   */
  isTransportReady(nodeId) {
    const router = this.messageRouter;
    if (!router || typeof router.getConnectionState !== TYPEOF.FUNCTION) {
      return false;
    }

    if (router.getConnectionState(nodeId) !== STATE.CONNECTED) {
      return false;
    }

    if (
      typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION &&
      !router.isOutboundQueueAvailable(nodeId)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Thin adapter: perform an optional readiness ping via the policy
   * owner. Composes isNodeReadyWithTransport with ping enabled and
   * rebalancer-specific timeout.
   * Kept for API compatibility; the main readiness path (isNodeReady)
   * calls the policy owner directly.
   * @param {string} nodeId - Node ID.
   * @return {Promise<boolean>} True when ping succeeds.
   */
  async checkReadinessPing(nodeId) {
    const router = this.messageRouter;
    if (!router || typeof router.pingNode !== TYPEOF.FUNCTION) {
      return true;
    }

    const pingTimeout = Number.isFinite(this.readinessPingTimeoutMs) ?
      this.readinessPingTimeoutMs :
      NUM.ZERO;
    return router.pingNode(nodeId, pingTimeout);
  }

  /**
   * Determine the specific readiness skip reason for a node.
   * Checks each readiness dimension in order and returns the first
   * failing reason, preserving granularity for diagnostics
   * (Requirement 5.3, Design D6.3).
   *
   * @param {string} nodeId - Node ID.
   * @return {Promise<string|null>} Skip detail from
   *   READINESS_SKIP_DETAIL, or null when node is ready.
   */
  async getNodeReadinessSkipReason(nodeId) {
    if (await this.isNodeReady(nodeId)) {
      return null;
    }

    const readinessDecisionDimension =
      this.resolveNodeReadinessDecisionDimension();
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      nodeId,
      {
        decisionDimension: readinessDecisionDimension,
      },
    );
    if (
      !this.isReadinessDimensionSatisfied(readiness, readinessDecisionDimension)
    ) {
      // Determine whether the rejection is lease or status.
      const nodeRow = this.systemTableCache.get(TABLES.NODES, nodeId);
      if (!nodeRow) {
        return READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE;
      }
      if (nodeRow.status !== SERVICE_STATUS.ACTIVE) {
        return READINESS_SKIP_DETAIL.STATUS_NOT_ACTIVE;
      }
      const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
      if (!Number.isFinite(leaseExpiry) || leaseExpiry <= Date.now()) {
        return READINESS_SKIP_DETAIL.LEASE_EXPIRED;
      }
      return READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE;
    }

    // Record-level checks passed; check transport dimensions.
    const router = this.messageRouter;
    if (!router || typeof router.getConnectionState !== TYPEOF.FUNCTION) {
      return READINESS_SKIP_DETAIL.CONNECTION_DOWN;
    }
    if (router.getConnectionState(nodeId) !== STATE.CONNECTED) {
      return READINESS_SKIP_DETAIL.CONNECTION_DOWN;
    }

    if (
      typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION &&
      !router.isOutboundQueueAvailable(nodeId)
    ) {
      return READINESS_SKIP_DETAIL.OUTBOUND_QUEUE_UNAVAILABLE;
    }

    if (
      this.enableReadinessPing &&
      typeof router.pingNode === TYPEOF.FUNCTION
    ) {
      const pingTimeout = Number.isFinite(this.readinessPingTimeoutMs) ?
        this.readinessPingTimeoutMs :
        NUM.ZERO;
      const ok = await router.pingNode(nodeId, pingTimeout);
      if (!ok) {
        return READINESS_SKIP_DETAIL.PING_FAILED;
      }
    }

    return READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE;
  }

  /**
   * Get current replicas for this entity.
   * @readModel REBALANCE_CURRENT_REPLICAS — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>} Array of replica objects.
   */
  getCurrentReplicas() {
    if (this.entityType === EntityType.MESSAGE_GROUP) {
      return this.filterReplicasRetiredByTerminalReplaceOperations(
        this.systemTableCache.filter(
          SYSTEM_TABLE_NAME.SERVICES,
          (service) => {
            const normalizedService = normalizeServiceRow(service);
            return (
              normalizedService.groupId === this.entityId &&
              normalizedService.serviceType === EntityType.MESSAGE_GROUP
            );
          },
        ),
      );
    }

    // For runtime services, match by service_type and service_id
    // that equals or is prefixed by the entity (definition) ID.
    if (this.entityType === EntityType.RUNTIME_SERVICE) {
      return this.filterReplicasRetiredByTerminalReplaceOperations(
        this.systemTableCache.filter(
          SYSTEM_TABLE_NAME.SERVICES,
          (service) => {
            const normalizedService = normalizeServiceRow(service);
            return (
              normalizedService.serviceType === EntityType.RUNTIME_SERVICE &&
              normalizedService.serviceId === this.entityId
            );
          },
        ),
      );
    }

    // For partitions, get services with matching partition_id
    return this.filterReplicasRetiredByTerminalReplaceOperations(
      this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (service) => {
          const normalizedService = normalizeServiceRow(service);
          return (
            normalizedService.partitionId === this.entityId &&
            normalizedService.serviceType === EntityType.PARTITION
          );
        },
      ),
    );
  }

  /**
   * Check if an operation row targets this rebalancer entity.
   * @param {Object} operation - replica_operations row.
   * @return {boolean} True when operation matches this entity.
   * @private
   */
  isOperationForEntity(operation) {
    const normalizedOperation = normalizeReplicaOperationRecord(operation, {
      nowMs: this.nowFn(),
    });
    const entityType =
      normalizedOperation.entityType ||
      operation?.entity_type ||
      operation?.entityType ||
      EntityType.PARTITION;
    const entityId =
      normalizedOperation.entityId ||
      normalizedOperation.partitionGroupId ||
      operation?.entity_id ||
      operation?.entityId ||
      operation?.partition_group_id ||
      operation?.partitionGroupId ||
      operation?.partition_id ||
      operation?.partitionId ||
      null;
    return entityType === this.entityType && entityId === this.entityId;
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isTrackedInFlightOperation(operation) {
    const operationProgress = buildReplicaOperationProgressSnapshot(operation);
    const operationType = operationProgress.operationType;
    if (operationType && !isCoordinatorOwnedOperationType(operationType)) {
      return false;
    }
    if (operationProgress.terminal === true) {
      return false;
    }
    if (
      operationProgress.semanticPhase !==
      REPLICA_OPERATION_SEMANTIC_PHASE.UNKNOWN
    ) {
      return true;
    }
    const workflowStep =
      operation?.workflowStep ?? operation?.workflow_step ?? null;
    if (
      typeof operationType === TYPEOF.STRING &&
      typeof workflowStep === TYPEOF.STRING &&
      workflowStep.length > NUM.ZERO
    ) {
      if (isValidWorkflowStep(operationType, workflowStep)) {
        return true;
      }
    }
    return true;
  }

  /**
   * @param {Object} operation
   * @return {Array<Object>}
   * @private
   */
  getReplicaOperationStepsHistory(operation) {
    const stepsHistory =
      operation?.[REBALANCE_OPERATION_FIELD.STEPS_HISTORY] ??
      operation?.[REBALANCE_OPERATION_FIELD.STEPS_HISTORY_SNAKE];
    if (Array.isArray(stepsHistory)) {
      return stepsHistory;
    }
    if (
      typeof stepsHistory !== TYPEOF.STRING ||
      stepsHistory.length === NUM.ZERO
    ) {
      return [];
    }
    try {
      const parsed = JSON.parse(stepsHistory);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * @param {Object} operation
   * @return {string}
   * @private
   */
  getReplaceSourceReplicaIdFromOperationRow(operation) {
    const directSourceReplicaId = String(
      operation?.[REBALANCE_OPERATION_FIELD.SOURCE_REPLICA_ID] ||
        operation?.[REBALANCE_OPERATION_FIELD.SOURCE_REPLICA_ID_SNAKE] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (directSourceReplicaId.length > NUM.ZERO) {
      return directSourceReplicaId;
    }
    const stepsHistory = this.getReplicaOperationStepsHistory(operation);
    for (const entry of stepsHistory) {
      const sourceReplicaId = String(
        entry?.[REBALANCE_OPERATION_FIELD.SOURCE_REPLICA_ID] ||
          entry?.[REBALANCE_OPERATION_FIELD.SOURCE_REPLICA_ID_SNAKE] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (sourceReplicaId.length > NUM.ZERO) {
        return sourceReplicaId;
      }
    }
    return UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
  }

  /**
   * @param {Object} operation
   * @return {string}
   * @private
   */
  getReplicaIdFromOperationRow(operation) {
    return String(
      operation?.[COLUMN.REPLICA_ID] ||
        operation?.[REBALANCE_OPERATION_FIELD.REPLICA_ID_CAMEL] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
  }

  /**
   * @param {Object} replica
   * @return {string}
   * @private
   */
  getReplicaIdFromServiceRow(replica) {
    return String(
      replica?.[COLUMN.REPLICA_ID] ||
        replica?.[REBALANCE_OPERATION_FIELD.REPLICA_ID_CAMEL] ||
        replica?.[COLUMN.SERVICE_ID] ||
        replica?.[REBALANCE_OPERATION_FIELD.SERVICE_ID_CAMEL] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
  }

  /**
   * Completed REPLACE rows are authoritative retirement evidence for their
   * source replica. This projects stale service cache rows out of planning
   * before they can seed another replacement for the same retired source.
   *
   * @return {Set<string>}
   * @private
   */
  getTerminalReplaceSourceReplicaIds() {
    const retiredSourceReplicaIds = new Set();
    const operations = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (operation) => {
        if (!this.isOperationForEntity(operation)) {
          return false;
        }
        const normalizedOperation = normalizeReplicaOperationRecord(operation, {
          nowMs: this.nowFn(),
        });
        return (
          normalizedOperation.type === OperationType.REPLACE &&
          (normalizedOperation.status === ReplicaStatus.REMOVED ||
            normalizedOperation.workflowStep === WORKFLOW_STEP.REMOVED)
        );
      },
    );
    for (const operation of operations) {
      const sourceReplicaId =
        this.getReplaceSourceReplicaIdFromOperationRow(operation);
      if (sourceReplicaId.length > NUM.ZERO) {
        retiredSourceReplicaIds.add(sourceReplicaId);
      }
    }
    return retiredSourceReplicaIds;
  }

  /**
   * Failed REPLACE rows can still leave the target replica in raft placement.
   * Surface those target replica IDs to the planner as cleanup removals so a
   * failed create path cannot hold the partition above target indefinitely.
   *
   * @return {Set<string>}
   * @private
   */
  getTerminalFailedReplaceTargetReplicaIds() {
    const failedTargetReplicaIds = new Set();
    const operations = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (operation) => {
        if (!this.isOperationForEntity(operation)) {
          return false;
        }
        const normalizedOperation = normalizeReplicaOperationRecord(operation, {
          nowMs: this.nowFn(),
        });
        return (
          normalizedOperation.type === OperationType.REPLACE &&
          (normalizedOperation.status === ReplicaStatus.FAILED ||
            normalizedOperation.workflowStep === WORKFLOW_STEP.FAILED)
        );
      },
    );
    for (const operation of operations) {
      const targetReplicaId = this.getReplicaIdFromOperationRow(operation);
      if (targetReplicaId.length > NUM.ZERO) {
        failedTargetReplicaIds.add(targetReplicaId);
      }
    }
    return failedTargetReplicaIds;
  }

  /**
   * @param {Array<Object>} replicas
   * @return {Array<Object>}
   * @private
   */
  filterReplicasRetiredByTerminalReplaceOperations(replicas) {
    const normalizedReplicas = Array.isArray(replicas) ? replicas : [];
    const retiredSourceReplicaIds = this.getTerminalReplaceSourceReplicaIds();
    if (retiredSourceReplicaIds.size === NUM.ZERO) {
      return normalizedReplicas;
    }
    return normalizedReplicas.filter((replica) => {
      const replicaId = this.getReplicaIdFromServiceRow(replica);
      return (
        replicaId.length === NUM.ZERO ||
        !retiredSourceReplicaIds.has(replicaId)
      );
    });
  }

  /**
   * @param {Object} operation
   * @param {Object} options
   * @return {boolean}
   * @private
   */
  isTopologySettlingInFlightOperation(operation, options = {}) {
    const nowMs = Number.isFinite(options.nowMs) ?
      Math.floor(options.nowMs) :
      Date.now();
    const normalizedOperation = normalizeReplicaOperationRecord(operation, {
      nowMs,
    });
    if (!isReplicaOperationInFlight(normalizedOperation)) {
      return false;
    }
    if (!this.isTopologyBlockingInFlightOperation(normalizedOperation)) {
      return false;
    }
    return !isReplicaOperationStale(normalizedOperation, {nowMs});
  }

  /**
   * Get in-flight replica operations for this entity.
   * @readModel REBALANCE_IN_FLIGHT_OPERATIONS —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>} Array of replica_operations rows in-flight.
   */
  getInFlightOperations() {
    return this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (operation) => {
        if (!this.isTrackedInFlightOperation(operation)) {
          return false;
        }
        return this.isOperationForEntity(operation);
      },
    );
  }

  /**
   * Get topology-blocking in-flight replica operations across all entities.
   * This global owner view lets planners avoid concentrating add-like work on
   * one target node while system partitions recover in parallel.
   *
   * @readModel REBALANCE_GLOBAL_IN_FLIGHT_OPERATIONS —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>}
   */
  getGlobalTopologyBlockingInFlightOperations() {
    return this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (operation) => {
        if (!this.isTrackedInFlightOperation(operation)) {
          return false;
        }
        return this.isTopologyBlockingInFlightOperation(operation);
      },
    );
  }

  /**
   * @param {Object} operation
   * @return {string}
   * @private
   */
  getNormalizedOperationType(operation) {
    return String(
      operation?.type ||
        operation?.operation_type ||
        operation?.operationType ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toUpperCase();
  }

  /**
   * @param {Object} operation
   * @return {string}
   * @private
   */
  getNormalizedOperationWorkflowStep(operation) {
    return String(
      operation?.workflowStep ??
        operation?.workflow_step ??
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toUpperCase();
  }

  /**
   * REPLACE operations in ACTIVE/STOPPING are source-removal phase work:
   * add-side topology has already converged and these rows must not suppress
   * new add-like planning for other targets.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isReplaceRemoveDispatchPhaseOperation(operation) {
    return isReplaceRemoveDispatchPhase(operation);
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isTopologyBlockingInFlightOperation(operation) {
    return !this.isReplaceRemoveDispatchPhaseOperation(operation);
  }

  /**
   * Return in-flight operations that still represent topology-shaping work.
   * REPLACE source-removal phase rows are excluded to avoid planner deadlock.
   *
   * @return {Array<Object>}
   */
  getTopologyBlockingInFlightOperations() {
    return this.getInFlightOperations().filter((operation) =>
      this.isTopologyBlockingInFlightOperation(operation),
    );
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
}

export {UnifiedRebalancerSegment3};
