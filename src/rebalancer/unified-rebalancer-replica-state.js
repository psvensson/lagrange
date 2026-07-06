import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  UNIFIED_REBALANCER_LOCAL_SERVE_READINESS_METHODS,
} from './unified-rebalancer-local-serve-readiness.js';
import {
  applyUnifiedRebalancerPriorityReadinessMethods,
} from './unified-rebalancer-priority-readiness.js';
import {UnifiedRebalancerAvailableNodes} from './unified-rebalancer-available-nodes.js';

// Dispatched runtime-service replicas carry canonical ids
// `${entityId}-rN`; a bare entityId row (direct lifecycle use) also
// belongs. Strict equality here made every dispatched replica
// invisible to the planner (it re-planned ADDs forever).
function runtimeServiceReplicaBelongsToEntity(serviceId, entityId) {
  if (typeof serviceId !== 'string' || typeof entityId !== 'string') {
    return false;
  }
  return serviceId === entityId ||
    serviceId.startsWith(`${entityId}-r`);
}

const {
  COLUMN,
  EntityType,
  OperationType,
  READINESS_SKIP_DETAIL,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  ReplicaStatus,
  SERVICE_STATUS,
  STATE,
  SYSTEM_TABLE_NAME,
  TABLES,
  UNIFIED_REBALANCER_LITERAL,
  WORKFLOW_STEP,
  buildReplicaOperationProgressSnapshot,
  isCoordinatorOwnedOperationType,
  isNodeReadyWithTransport,
  isReplaceRemoveDispatchPhase,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isValidWorkflowStep,
  normalizeReplicaOperationRecord,
  normalizeServiceRow,
} = UNIFIED_REBALANCER_SHARED;

const REBALANCE_OPERATION_FIELD = Object.freeze({
  REPLICA_ID_CAMEL: 'replicaId',
  SERVICE_ID_CAMEL: 'serviceId',
  SOURCE_REPLICA_ID: 'sourceReplicaId',
  SOURCE_REPLICA_ID_SNAKE: 'source_replica_id',
  STEPS_HISTORY: 'stepsHistory',
  STEPS_HISTORY_SNAKE: 'steps_history',
});

class UnifiedRebalancerReplicaState extends UnifiedRebalancerAvailableNodes {
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
      if (
        !this.isStartupAuthorityControlPlanePlacementEligibleNode(
          nodeId,
          readinessDecisionDimension,
        )
      ) {
        return false;
      }
      if (!this.isTransportReady(nodeId)) {
        return false;
      }
      if (this.enableReadinessPing) {
        return this.checkReadinessPing(nodeId);
      }
      return true;
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
    if (!router || typeof router.getConnectionState !== 'function') {
      return false;
    }

    if (router.getConnectionState(nodeId) !== STATE.CONNECTED) {
      return false;
    }

    if (
      typeof router.isOutboundQueueAvailable === 'function' &&
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
    if (!router || typeof router.pingNode !== 'function') {
      return true;
    }

    const pingTimeout = Number.isFinite(this.readinessPingTimeoutMs) ?
      this.readinessPingTimeoutMs :
      0;
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
    if (!router || typeof router.getConnectionState !== 'function') {
      return READINESS_SKIP_DETAIL.CONNECTION_DOWN;
    }
    if (router.getConnectionState(nodeId) !== STATE.CONNECTED) {
      return READINESS_SKIP_DETAIL.CONNECTION_DOWN;
    }

    if (
      typeof router.isOutboundQueueAvailable === 'function' &&
      !router.isOutboundQueueAvailable(nodeId)
    ) {
      return READINESS_SKIP_DETAIL.OUTBOUND_QUEUE_UNAVAILABLE;
    }

    if (
      this.enableReadinessPing &&
      typeof router.pingNode === 'function'
    ) {
      const pingTimeout = Number.isFinite(this.readinessPingTimeoutMs) ?
        this.readinessPingTimeoutMs :
        0;
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
              runtimeServiceReplicaBelongsToEntity(
                normalizedService.serviceId,
                this.entityId,
              )
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
      typeof operationType === 'string' &&
      typeof workflowStep === 'string' &&
      workflowStep.length > 0
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
      typeof stepsHistory !== 'string' ||
      stepsHistory.length === 0
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
    if (directSourceReplicaId.length > 0) {
      return directSourceReplicaId;
    }
    const stepsHistory = this.getReplicaOperationStepsHistory(operation);
    for (const entry of stepsHistory) {
      const sourceReplicaId = String(
        entry?.[REBALANCE_OPERATION_FIELD.SOURCE_REPLICA_ID] ||
          entry?.[REBALANCE_OPERATION_FIELD.SOURCE_REPLICA_ID_SNAKE] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (sourceReplicaId.length > 0) {
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
      if (sourceReplicaId.length > 0) {
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
      if (targetReplicaId.length > 0) {
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
    if (retiredSourceReplicaIds.size === 0) {
      return normalizedReplicas;
    }
    return normalizedReplicas.filter((replica) => {
      const replicaId = this.getReplicaIdFromServiceRow(replica);
      return (
        replicaId.length === 0 ||
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

applyUnifiedRebalancerPriorityReadinessMethods(UnifiedRebalancerReplicaState);

Object.assign(
  UnifiedRebalancerReplicaState.prototype,
  UNIFIED_REBALANCER_LOCAL_SERVE_READINESS_METHODS,
);

export {UnifiedRebalancerReplicaState};
