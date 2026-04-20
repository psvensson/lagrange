import { UNIFIED_REBALANCER_SHARED } from "./unified-rebalancer-shared.js";
import { UnifiedRebalancerSegment3 } from "./unified-rebalancer-segment-3.js";

const {
  CLUSTER_READINESS_TIMEOUT_MS,
  COLUMN,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WORKLOAD_CLASS,
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ,
  CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON,
  ConfigurationManager,
  ControlPlaneReadinessService,
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DEFAULT_TABLE_POLICY,
  ENDPOINT_STATUS,
  ENDPOINT_SYNC_HEALTH,
  EntityType,
  EventEmitter,
  LIFECYCLE_PHASE,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  META_SERVICE_ID,
  MovePlanner,
  MoveType,
  NUM,
  NodeStatus,
  OperationType,
  OwnerKeyReconcileQueue,
  PRESSURE_WORK_CLASS,
  PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
  PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT,
  PressureGovernor,
  RAFT_ROLE,
  READINESS_SKIP_DETAIL,
  REBALANCER_BUDGET_READ_OPTIONS,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_ERROR_MSG,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
  REBALANCER_NODE_STATUS,
  REBALANCER_QUEUE_NAME,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCER_TRIGGER,
  RECONCILE_REASON,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaStatus,
  SERVICE_STATUS,
  SQL_BUDGET,
  STABILIZATION_RESET_TRIGGER,
  STATE,
  SYSTEM_TABLE_NAME,
  StartupRecoveryCoordinator,
  StoragePressureBehavior,
  TABLES,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
  TRANSPORT_TYPE,
  TYPEOF,
  TriggerType,
  UNIFIED_REBALANCER_LITERAL,
  WORKFLOW_STEP,
  adjustToOddCount,
  assertCritical,
  buildControlPlaneWorkloadProfile,
  buildPriorityRecoveryBlockedPartitions,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  buildPublicationRecoveryGateSnapshot,
  createControlPlaneRuntimeBundle,
  getControlPlaneRetryAfterMs,
  getLocalControlPlaneMutationReadinessBlocker,
  getNextOddCount,
  getPartitionRowFromCache,
  getPreviousOddCount,
  hasPriorityRecoverySpreadGap,
  isBackgroundWorkLifecycleReadySnapshot,
  isCoordinatorOwnedOperationType,
  isCriticalTransportControlPlanePartitionTable,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeReadyWithConnection,
  isNodeReadyWithTransport,
  isNodeRecordReady,
  isOddReplicaCount,
  isPriorityControlPlanePartition,
  isReplaceRemoveDispatchPhase,
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  isRetryableControlPlaneError,
  isSystemTablePartition,
  isTerminalReplicaOperationSemanticPhase,
  isTerminalStep,
  isValidWorkflowStep,
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeReplicaOperationRecord,
  normalizeServiceEndpointRow,
  normalizeServiceRow,
  resolvePriorityRecoveryActiveNodeCohort,
  resolveReplicaOperationSemanticPhase,
  resolveTrackedPriorityRecoveryAdmissionPlan,
  shouldPriorityRecoveryOperationBlockPlanning,
  wasNodeRecordReadyWhenWritten,
} = UNIFIED_REBALANCER_SHARED;

class UnifiedRebalancerSegment4 extends UnifiedRebalancerSegment3 {
  isAddLikeInFlightOperation(operation) {
    const operationType = this.getNormalizedOperationType(operation);
    if (operationType === OperationType.ADD) {
      return true;
    }
    if (operationType !== OperationType.REPLACE) {
      return false;
    }
    return !this.isReplaceRemoveDispatchPhaseOperation(operation);
  }

  /**
   * Resolve pressure and delivery options for authoritative budget reads.
   * Startup-critical and critical system partitions must keep these reads on
   * the critical path so transport pressure does not strand control-plane
   * spread behind background gating queries.
   *
   * @return {Object} Gateway query options.
   */
  getBudgetQueryOptions() {
    const criticalQuery =
      this.isControlPlanePriorityPartition() ||
      this.isCriticalSystemPartition();
    const workloadProfile = buildControlPlaneWorkloadProfile(
      criticalQuery
        ? CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY
        : CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_BACKGROUND_VISIBILITY,
      {
        allowPressureDefer: criticalQuery !== true,
      },
    );
    return {
      controlPlaneOperationKind: UNIFIED_REBALANCER_LITERAL.READ,
      workloadClass: workloadProfile.workloadClass,
      workClass:
        workloadProfile.workClass ||
        (criticalQuery
          ? PRESSURE_WORK_CLASS.CRITICAL
          : PRESSURE_WORK_CLASS.BACKGROUND),
      allowPressureDefer: workloadProfile.allowPressureDefer === true,
      deliveryPriority: criticalQuery
        ? UNIFIED_REBALANCER_LITERAL.CRITICAL
        : UNIFIED_REBALANCER_LITERAL.BACKGROUND,
    };
  }

  /**
   * Execute one authoritative budget read through the canonical CDC owner
   * path when available, then fall back to the gateway compatibility path.
   * This keeps rebalancer budget probes out of the generic SQL ingress and
   * avoids recursive owner-read dispatch on control-plane partitions.
   *
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<Object>}
   */
  async executeBudgetRead(tableName, sql, params = []) {
    const queryOptions = this.getBudgetQueryOptions();
    if (
      typeof this.cdcIntegrationService?.executeAuthoritativeSystemTableRead ===
      UNIFIED_REBALANCER_LITERAL.FUNCTION
    ) {
      return this.cdcIntegrationService.executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        {
          ...REBALANCER_BUDGET_READ_OPTIONS,
          queryOptions,
        },
      );
    }
    return this.controlPlaneSystemTableGateway.executeQuery(sql, params, {
      controlPlaneTableName: tableName,
      ...queryOptions,
    });
  }

  /**
   * Query the configured rebalance budget from authoritative config.
   * Returns the constructor-provided default when the config row
   * is absent or unparseable — this is a default, not a mixed read model.
   *
   * @readModel REBALANCE_CONFIGURED_BUDGET — READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @return {Promise<number>} Configured rebalance budget.
   */
  async getConfiguredRebalanceBudget() {
    const result = await this.executeBudgetRead(
      SYSTEM_TABLE_NAME.CONFIG,
      SQL_BUDGET.SELECT_REBALANCE_BUDGET,
      [REBALANCER_CONFIG_KEY.REBALANCE_BUDGET],
    );

    if (
      !result.success ||
      !result.rows ||
      result.rows.length === UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      return this.rebalanceBudget;
    }

    const parsed = Number(result.rows[0].config_value);
    return Number.isFinite(parsed) && parsed > UNIFIED_REBALANCER_LITERAL.ZERO
      ? parsed
      : this.rebalanceBudget;
  }

  /**
   * Query the global in-flight operation count via authoritative SQL.
   *
   * @readModel REBALANCE_GLOBAL_BUDGET — READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @return {Promise<number>} In-flight operation count.
   */
  async getGlobalInFlightOperationCount() {
    const result = await this.executeBudgetRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      SQL_BUDGET.SELECT_IN_FLIGHT_COUNT,
      [],
    );

    if (
      !result.success ||
      !result.rows ||
      result.rows.length === UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      return UNIFIED_REBALANCER_LITERAL.ZERO;
    }

    const parsed = Number(result.rows[0].total_count);
    return Number.isFinite(parsed) && parsed >= UNIFIED_REBALANCER_LITERAL.ZERO
      ? parsed
      : UNIFIED_REBALANCER_LITERAL.ZERO;
  }

  /**
   * Return true when one move set contains add-like work that can advance
   * priority control-plane spread.
   * @param {Array<Object>} moves
   * @return {boolean}
   * @private
   */
  hasPriorityBudgetBypassCandidateMove(moves = []) {
    if (!Array.isArray(moves) || moves.length === NUM.ZERO) {
      return false;
    }
    return moves.some(
      (move) => move?.type === MoveType.ADD || move?.type === MoveType.REPLACE,
    );
  }

  /**
   * Priority control-plane spread must not deadlock behind unrelated in-flight
   * operations that saturate the global move budget. Use the coordinator's
   * dedicated priority add lane to decide whether one recovery move may still
   * proceed.
   *
   * @param {Array<Object>} moves
   * @return {Promise<boolean>}
   * @private
   */
  async canBypassGlobalBudgetForPriorityRecovery(moves = []) {
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    if (!this.hasPriorityBudgetBypassCandidateMove(moves)) {
      return false;
    }
    if (
      !this.rebalanceCoordinator ||
      typeof this.rebalanceCoordinator.canStartPriorityAddOperation !==
        TYPEOF.FUNCTION
    ) {
      return false;
    }
    const allowed =
      await this.rebalanceCoordinator.canStartPriorityAddOperation({
        ...PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
        partitionId: this.entityId,
      });
    return allowed === true;
  }

  /**
   * Ordinary priority control-plane partitions should not fan out multiple
   * concurrent add-like recovery moves while the priority spread gap is still
   * unresolved. Emergency transport partitions keep their existing overflow
   * lane because they unblock publication and replica-operation convergence
   * for the rest of the control plane.
   *
   * @param {Array<Object>} moves
   * @return {Promise<Object|null>}
   * @private
   */
  async getOrdinaryPriorityRecoverySerialGateSnapshot(moves = []) {
    if (
      !this.isControlPlanePriorityPartition() ||
      this.isEmergencyPriorityControlPlanePartition(this.entityId) ||
      !this.isPriorityControlPlaneRecoveryActive() ||
      !this.hasPriorityBudgetBypassCandidateMove(moves) ||
      !this.rebalanceCoordinator ||
      typeof this.rebalanceCoordinator.getConcurrentAddCountByPriorityClass !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    const counts =
      await this.rebalanceCoordinator.getConcurrentAddCountByPriorityClass({
        partitionId: this.entityId,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
    const ordinaryPriorityInFlightCount = Number.isFinite(
      counts?.ordinaryPriorityCount,
    )
      ? counts.ordinaryPriorityCount
      : NUM.ZERO;
    return Object.freeze({
      applicable: true,
      serialLimit: NUM.ONE,
      ordinaryPriorityInFlightCount,
      blocked: ordinaryPriorityInFlightCount >= NUM.ONE,
    });
  }

  /**
   * Check whether this rebalancer targets a critical system partition.
   * @return {boolean} True when entity is a critical system partition.
   * @private
   */
  isCriticalSystemPartition() {
    return this.isSystemPartitionEntity();
  }

  /**
   * Get healthy replicas (excluding failed or removed).
   * @param {Array<Object>} replicas - All replicas.
   * @return {Array<Object>} Healthy replicas only.
   */
  getHealthyReplicas(replicas) {
    const activeReplicas = replicas.filter((replica) => {
      const status = replica.status || ReplicaStatus.ACTIVE;
      return status === ReplicaStatus.ACTIVE;
    });

    // Align critical-partition health semantics with coordinator safety checks:
    // consider only routable non-learner replicas on ready nodes as healthy.
    if (!this.isCriticalSystemPartition()) {
      return activeReplicas;
    }

    const readyNodeIds = new Set(
      this.getAvailableNodes().map((node) => node.node_id),
    );

    return activeReplicas.filter((replica) => {
      if (!replica?.node_id || !replica?.address) {
        return false;
      }
      const role =
        typeof replica.raft_role === "string"
          ? replica.raft_role.toLowerCase()
          : null;
      if (!role || role === RAFT_ROLE.LEARNER) {
        return false;
      }
      return readyNodeIds.has(replica.node_id);
    });
  }

  /**
   * Calculate target state based on policy.
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @return {Object} Target state with replica count and placement.
   */
  async calculateTargetState(currentReplicas, policy) {
    return this.movePlanner.calculateTargetState(currentReplicas, policy);
  }

  /**
   * Calculate optimal placement for message groups.
   * Ensures every node has at least one local replica.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Message group policy.
   * @return {Object} Target placement state.
   */
  calculateMessageGroupPlacement(nodes, targetCount, policy) {
    return this.movePlanner.calculateMessageGroupPlacement(
      nodes,
      targetCount,
      policy,
    );
  }

  /**
   * Calculate optimal placement for partitions.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Table policy.
   * @return {Object} Target placement state.
   */
  calculatePartitionPlacement(nodes, targetCount, policy) {
    return this.movePlanner.calculatePartitionPlacement(
      nodes,
      targetCount,
      policy,
    );
  }

  /**
   * Sort nodes by current load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Available nodes.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesByLoad(nodes) {
    return this.movePlanner.sortNodesByLoad(nodes);
  }

  /**
   * Sort nodes by suitability based on policy constraints.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {Object} policy - Policy with placement constraints.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesBySuitability(nodes, policy) {
    return this.movePlanner.sortNodesBySuitability(nodes, policy);
  }

  /**
   * Calculate node load score.
   * @param {Object} node - Node object.
   * @return {number} Load score (0-300, lower is better).
   */
  calculateNodeLoad(node) {
    return this.movePlanner.calculateNodeLoad(node);
  }

  /**
   * Calculate moves needed to reach target state.
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} targetState - Target state.
   * @return {Array<Object>} Array of move operations.
   */
  calculateMoves(currentReplicas, targetState) {
    return this.movePlanner.calculateMoves(currentReplicas, targetState);
  }

  /**
   * Build one skipped move result.
   * @param {string} reason
   * @param {Object|null} move
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildSkippedMoveResult(reason, move, extra = {}) {
    return {
      success: false,
      skipped: true,
      reason,
      operation: move?.type,
      nodeId: move?.nodeId,
      replicaId: move?.replicaId,
      ...extra,
    };
  }

  /**
   * Build one rebalancer result.
   * @param {boolean} success
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildRebalanceResult(success, extra = {}) {
    return {
      success,
      ...extra,
    };
  }

  /**
   * Resolve one operation type for a move.
   * @param {string} moveType
   * @return {string}
   * @private
   */
  resolveCoordinatorOperationType(moveType) {
    if (moveType === MoveType.ADD) {
      return OperationType.ADD;
    }
    if (moveType === MoveType.REMOVE) {
      return OperationType.REMOVE;
    }
    if (moveType === MoveType.REPLACE) {
      return OperationType.REPLACE;
    }
    throw new Error(`Unsupported move type: ${moveType}`);
  }

  /**
   * Execute a single move operation via the coordinator.
   * Requirements: 2.5
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   */
  async executeMove(move) {
    if (this.isShuttingDown) {
      return this.buildSkippedMoveResult(
        REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
        move,
      );
    }

    this.logger.info(REBALANCER_LOG_MSG.EXECUTE_MOVE, {
      entityId: this.entityId,
      entityType: this.entityType,
      moveType: move.type,
      nodeId: move.nodeId,
      reason: move.reason,
      usingCoordinator: !!this.rebalanceCoordinator,
    });

    try {
      if (move?.nodeId) {
        const skipDetail = await this.getNodeReadinessSkipReason(move.nodeId);
        if (skipDetail !== null) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_UNREADY_NODE, {
            entityId: this.entityId,
            nodeId: move.nodeId,
            moveType: move.type,
            skipDetail,
          });
          return this.buildSkippedMoveResult(
            REBALANCER_SKIP_REASON.NODE_NOT_READY,
            move,
            {
              skipDetail,
            },
          );
        }
      }

      if (!this.rebalanceCoordinator) {
        throw new Error(REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED);
      }

      const outcome = await this.executeMoveViaCoordinator(move);
      if (outcome?.skipped === true) {
        const admissionBlockingReasonCodes = Array.isArray(
          outcome?.admission?.blockingReasons,
        )
          ? outcome.admission.blockingReasons
              .map((reason) =>
                String(reason?.code || reason?.reason || reason || "").trim(),
              )
              .filter((reason) => reason.length > NUM.ZERO)
          : [];
        this.logger.info(REBALANCER_LOG_MSG.MOVE_SKIPPED, {
          entityId: this.entityId,
          entityType: this.entityType,
          moveType: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId || null,
          reason: outcome.reason || null,
          error: outcome.error || null,
          admissionDecisionType: outcome?.admission?.decisionType || null,
          admissionReason: outcome?.admission?.reason || null,
          admissionBlockingReasonCodes,
        });
      }
      return outcome;
    } catch (error) {
      this.logger.error(REBALANCER_LOG_MSG.MOVE_FAILED, {
        entityId: this.entityId,
        moveType: move.type,
        nodeId: move.nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a move via the RebalanceCoordinator.
   * The coordinator owns operation state tracking.
   * Requirements: 2.5
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   * @private
   */
  async executeMoveViaCoordinator(move) {
    if (this.isShuttingDown) {
      return this.buildSkippedMoveResult(
        REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
        move,
      );
    }

    const safetyError = await this.rebalanceCoordinator.getMoveSafetyError({
      ...move,
      partitionId: move.partitionId || this.entityId,
      entityType: move.entityType || this.entityType,
      entityId: move.entityId || this.entityId,
    });
    if (safetyError) {
      this.logger.debug(REBALANCER_LOG_MSG.MOVE_BLOCKED_BY_SAFETY_POLICY, {
        entityId: this.entityId,
        entityType: this.entityType,
        partitionId: this.entityId,
        moveType: move.type,
        nodeId: move.nodeId,
        replicaId: move.replicaId,
        error: safetyError,
      });
      return this.buildSkippedMoveResult(
        REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
        move,
        {
          error: safetyError,
        },
      );
    }

    const operationType = this.resolveCoordinatorOperationType(move.type);

    const operationRequest = {
      type: operationType,
      partitionId: this.entityId,
      entityType: this.entityType,
      entityId: this.entityId,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
      sourceNodeId: move.sourceNodeId,
      enforceConcurrentOperationBudget: true,
    };
    const membershipPublicationEpoch = Number.isInteger(
      move?.membershipPublicationEpoch,
    )
      ? move.membershipPublicationEpoch
      : this.resolvePublishedMembershipPlanningEpoch();
    if (
      Number.isInteger(membershipPublicationEpoch) &&
      membershipPublicationEpoch >= UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      operationRequest.membershipPublicationEpoch = membershipPublicationEpoch;
    }
    if (move?.controlPlaneMutationWorkClass) {
      operationRequest.controlPlaneMutationWorkClass =
        move.controlPlaneMutationWorkClass;
    }

    // Create operation record via coordinator.
    // Periodic planning already gates on local mutation readiness before
    // enqueueing moves, so direct move execution should only opt into
    // background mutation gating when the caller explicitly requests it.
    let operation = null;
    try {
      operation =
        await this.rebalanceCoordinator.createOperation(operationRequest);
    } catch (error) {
      if (error?.rebalanceSkipReason) {
        return this.buildSkippedMoveResult(error.rebalanceSkipReason, move);
      }
      if (error?.admissionResult) {
        return this.buildSkippedMoveResult(
          error.admissionResult.decisionType ||
            UNIFIED_REBALANCER_LITERAL.ADMISSION_DENIED,
          move,
          {
            admission: error.admissionResult,
          },
        );
      }
      throw error;
    }

    return {
      ...this.buildRebalanceResult(true, {
        replicaId: move.replicaId || operation.replicaId,
        nodeId: move.nodeId,
        operationId: operation.operationId,
        operation: move.type,
        status: UNIFIED_REBALANCER_LITERAL.SCHEDULED,
      }),
    };
  }

  /**
   * Check if a replica has a pending move operation.
   * @param {string} replicaId - Replica ID to check.
   * @return {boolean} True if replica has pending move.
   */
  hasPendingMove(replicaId) {
    const inFlightOps = this.getInFlightOperations();
    if (inFlightOps.some((op) => op.replica_id === replicaId)) {
      return true;
    }
    return false;
  }

  /**
   * Check if a node has a pending ADD move for this entity.
   * @param {string} nodeId - Node ID to check.
   * @return {boolean} True if node has pending ADD move.
   */
  hasPendingAddForNode(nodeId) {
    const inFlightOps = this.getTopologyBlockingInFlightOperations();
    if (
      inFlightOps.some(
        (op) =>
          op.target_node_id === nodeId && this.isAddLikeInFlightOperation(op),
      )
    ) {
      return true;
    }
    return false;
  }

  /**
   * Group moves by target node ID.
   * @param {Array<Object>} moves - Move operations.
   * @return {Map<string|null, Array<Object>>} Grouped moves by node ID.
   * @private
   */
  groupMovesByTargetNode(moves) {
    const grouped = new Map();
    for (const move of moves) {
      const nodeId = move?.nodeId || null;
      if (!grouped.has(nodeId)) {
        grouped.set(nodeId, []);
      }
      grouped.get(nodeId).push(move);
    }
    return grouped;
  }

  /**
   * Execute move operations with per-node batching and backpressure.
   * @param {Array<Object>} moves - Move operations.
   * @return {Promise<Array<Object>>} Execution results.
   * @private
   */
  async executeRebalancingMoves(moves) {
    if (this.isShuttingDown) {
      return [];
    }

    const results = [];
    const batchSize =
      Number.isFinite(this.moveBatchSize) && this.moveBatchSize > 0
        ? Math.floor(this.moveBatchSize)
        : 1;
    const interBatchDelayMs =
      Number.isFinite(this.interBatchDelayMs) && this.interBatchDelayMs > 0
        ? this.interBatchDelayMs
        : 0;
    const readinessByNodeId = new Map();
    const getSkipReasonCached = async (nodeId) => {
      if (!nodeId) {
        return null;
      }
      if (readinessByNodeId.has(nodeId)) {
        return readinessByNodeId.get(nodeId);
      }
      const skipDetail = await this.getNodeReadinessSkipReason(nodeId);
      readinessByNodeId.set(nodeId, skipDetail);
      return skipDetail;
    };

    const movesToExecute = [];
    const blockedAddNodeIds = new Set();
    for (const move of moves) {
      if (this.isShuttingDown) {
        return results;
      }
      if (
        (move?.type === MoveType.ADD || move?.type === MoveType.REPLACE) &&
        move?.nodeId
      ) {
        const skipDetail = await getSkipReasonCached(move.nodeId);
        if (skipDetail !== null) {
          blockedAddNodeIds.add(move.nodeId);
        }
      }
    }

    for (const move of moves) {
      if (this.isShuttingDown) {
        return results;
      }
      const isDeferrableRemove =
        move?.type === MoveType.REMOVE &&
        move?.reason !== "replica_failed" &&
        move?.standaloneSafe !== true;
      if (
        blockedAddNodeIds.size > UNIFIED_REBALANCER_LITERAL.ZERO &&
        isDeferrableRemove
      ) {
        results.push({
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.AWAITING_READY_ADD_CAPACITY,
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
        });
        continue;
      }
      movesToExecute.push(move);
    }

    const groupedMoves = this.groupMovesByTargetNode(movesToExecute);

    for (const [nodeId, nodeMoves] of groupedMoves.entries()) {
      if (this.isShuttingDown) {
        break;
      }
      if (nodeId) {
        const skipDetail = await getSkipReasonCached(nodeId);
        if (skipDetail !== null) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_BATCH_UNREADY, {
            entityId: this.entityId,
            nodeId,
            moveCount: nodeMoves.length,
            skipDetail,
          });
          for (const move of nodeMoves) {
            results.push({
              success: false,
              skipped: true,
              reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
              skipDetail,
              operation: move.type,
              nodeId: move.nodeId,
              replicaId: move.replicaId,
            });
          }
          continue;
        }
      }

      for (
        let i = UNIFIED_REBALANCER_LITERAL.ZERO;
        i < nodeMoves.length;
        i += batchSize
      ) {
        if (this.isShuttingDown) {
          break;
        }
        const batch = nodeMoves.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((move) => {
            return this.executeMove(move);
          }),
        );

        results.push(...batchResults);

        if (nodeId) {
          const midBatchSkip = await this.getNodeReadinessSkipReason(nodeId);
          if (midBatchSkip !== null) {
            this.logger.debug(REBALANCER_LOG_MSG.NODE_DISCONNECTED_BATCH, {
              entityId: this.entityId,
              nodeId,
              remainingMoves: nodeMoves.length - (i + batch.length),
              skipDetail: midBatchSkip,
            });
            const remainingMoves = nodeMoves.slice(i + batch.length);
            for (const move of remainingMoves) {
              results.push({
                success: false,
                skipped: true,
                reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
                skipDetail: midBatchSkip,
                operation: move.type,
                nodeId: move.nodeId,
                replicaId: move.replicaId,
              });
            }
            break;
          }
        }

        if (
          interBatchDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO &&
          i + batchSize < nodeMoves.length
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, interBatchDelayMs),
          );
        }
      }
    }

    return results;
  }

  /**
   * Main rebalancing entry point.
   * @param {string} trigger - What triggered the rebalance.
   * @param {Object} policy - Optional policy override.
   * @return {Promise<Object>} Rebalancing result.
   */
  async rebalance(trigger = TriggerType.PERIODIC, policy = null) {
    if (this.isShuttingDown) {
      return this.buildRebalanceResult(false, {
        skipped: true,
        reason: REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS,
      });
    }

    if (!this.isLeader) {
      this.logger.debug(REBALANCER_LOG_MSG.NOT_LEADER_SKIP, {
        entityId: this.entityId,
      });
      return this.buildRebalanceResult(false, {
        reason: REBALANCER_RUNTIME_REASON.NOT_LEADER,
      });
    }

    const effectivePolicy = policy || (await this.getPolicy());
    const currentReplicas = this.getCurrentReplicas();
    const availableNodes = this.getAvailableNodes();
    if (availableNodes.length === UNIFIED_REBALANCER_LITERAL.ZERO) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      return this.buildRebalanceResult(false, {
        reason: REBALANCER_RUNTIME_REASON.NO_AVAILABLE_NODES,
      });
    }

    const targetState = await this.movePlanner.calculateTargetState(
      currentReplicas,
      effectivePolicy,
    );
    const planningMembershipPublicationEpoch =
      this.resolvePublishedMembershipPlanningEpoch();
    const moves = await this.movePlanner.applyPressureGating(
      this.movePlanner.calculateMoves(currentReplicas, targetState),
    );

    if (moves.length === UNIFIED_REBALANCER_LITERAL.ZERO) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_REBALANCE_NEEDED, {
        entityId: this.entityId,
        currentCount: currentReplicas.length,
        targetCount: targetState.targetReplicaCount,
      });
      return this.buildRebalanceResult(true, {
        moves: [],
        reason: REBALANCER_RUNTIME_REASON.NO_CHANGES_NEEDED,
      });
    }

    const ordinaryPriorityRecoverySerialGate =
      await this.getOrdinaryPriorityRecoverySerialGateSnapshot(moves);
    if (ordinaryPriorityRecoverySerialGate?.blocked === true) {
      return this.buildRebalanceResult(true, {
        skipped: true,
        reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
        moves: [],
        ordinaryPriorityRecoverySerialGate,
      });
    }

    let availableBudget = this.maxConcurrentMoves;
    try {
      const configuredBudget = await this.getConfiguredRebalanceBudget();
      const inFlightCount = await this.getGlobalInFlightOperationCount();
      const isCritical = this.movePlanner.isCriticalState(
        currentReplicas,
        effectivePolicy,
        availableNodes,
      );
      const effectiveBudget = isCritical
        ? configuredBudget * this.criticalBudgetMultiplier
        : configuredBudget;
      const reservedPriorityRecoveryMoveSlots =
        this.getReservedPriorityRecoveryMoveSlots();

      availableBudget = Math.max(
        NUM.ZERO,
        effectiveBudget - inFlightCount - reservedPriorityRecoveryMoveSlots,
      );
      if (availableBudget <= UNIFIED_REBALANCER_LITERAL.ZERO) {
        const priorityBudgetBypass =
          await this.canBypassGlobalBudgetForPriorityRecovery(moves);
        if (priorityBudgetBypass === true) {
          availableBudget = NUM.ONE;
        } else {
          return this.buildRebalanceResult(true, {
            skipped: true,
            reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
            moves: [],
          });
        }
      }
    } catch (error) {
      this.logger.warn(REBALANCER_LOG_MSG.REBALANCE_ERROR, {
        entityId: this.entityId,
        error: error.message,
      });
      return this.buildRebalanceResult(false, {
        skipped: true,
        reason: REBALANCER_SKIP_REASON.BUDGET_QUERY_FAILED,
        moves: [],
      });
    }

    this.logger.info(REBALANCER_LOG_MSG.START_REBALANCE, {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      moveCount: moves.length,
      currentCount: currentReplicas.length,
      targetCount: targetState.targetReplicaCount,
    });

    const moveLimit = Math.max(
      0,
      Math.min(this.maxConcurrentMoves, availableBudget),
    );
    const limitedMoves = moves.slice(0, moveLimit).map((move) => {
      if (
        !Number.isInteger(planningMembershipPublicationEpoch) ||
        planningMembershipPublicationEpoch < 0
      ) {
        return move;
      }
      return {
        ...move,
        membershipPublicationEpoch: planningMembershipPublicationEpoch,
      };
    });
    const results = await this.executeRebalancingMoves(limitedMoves);

    this.lastRebalanceTime = Date.now();
    this.rebalanceCount++;

    this.emit(REBALANCER_EVENT.REBALANCE_COMPLETE, {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      results,
    });

    return this.buildRebalanceResult(true, {
      moves: results,
      trigger,
      timestamp: this.lastRebalanceTime,
    });
  }

  /**
   * Resolve the published membership epoch used to bind a planning pass.
   * @return {number|null}
   * @private
   */
  resolvePublishedMembershipPlanningEpoch() {
    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      typeof readinessService.getCurrentPublishedMembershipEpochSync !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    return readinessService.getCurrentPublishedMembershipEpochSync(
      this.nodeId,
      Date.now(),
    );
  }

  /**
   * Schedule the next periodic check.
   */
}

export { UnifiedRebalancerSegment4 };
