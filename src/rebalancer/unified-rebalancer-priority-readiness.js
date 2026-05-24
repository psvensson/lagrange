import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  LIFECYCLE_PHASE,
  NUM,
  TABLES,
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
  TYPEOF,
  UNIFIED_REBALANCER_LITERAL,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildPublicationRecoveryGateSnapshot,
  getLocalControlPlaneMutationReadinessBlocker,
  isBackgroundWorkLifecycleReadySnapshot,
  isPriorityControlPlanePartition,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveReplicaOperationSemanticPhase,
  shouldPriorityRecoveryOperationBlockPlanning,
} = UNIFIED_REBALANCER_SHARED;

const PRIORITY_READINESS_CONSTRUCTOR = 'constructor';

class UnifiedRebalancerPriorityReadinessMethods {
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
