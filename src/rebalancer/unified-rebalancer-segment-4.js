import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {UnifiedRebalancerSegment3} from './unified-rebalancer-segment-3.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from '../control-plane/priority-recovery-diagnostics-constants.js';

const {
  CONTROL_PLANE_WORKLOAD_CLASS,
  MOVE_REASON,
  MoveType,
  NUM,
  OperationType,
  PRESSURE_WORK_CLASS,
  PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
  RAFT_ROLE,
  REBALANCER_BUDGET_READ_OPTIONS,
  REBALANCER_CONFIG_KEY,
  REBALANCER_ERROR_MSG,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_RUNTIME_REASON,
  REBALANCER_SKIP_REASON,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaStatus,
  SQL_BUDGET,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  TriggerType,
  UNIFIED_REBALANCER_LITERAL,
  buildControlPlaneWorkloadProfile,
  buildPriorityRecoveryPartitionAssessment,
  EntityType,
  normalizeServiceRow,
  resolvePriorityRecoveryActiveNodeCohort,
} = UNIFIED_REBALANCER_SHARED;

const PRIORITY_RECOVERY_FOLLOW_UP_DECISION = Object.freeze({
  CREATE_RECOVERY_OPERATION:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.CREATE_RECOVERY_OPERATION,
  BLOCKED_UNCLASSIFIED:
    PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED,
  ELIGIBLE_NO_OPERATION:
    PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION,
  NEEDS_OPERATION: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
  SCHEDULE_FOLLOWUP_REBALANCE:
    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.SCHEDULE_FOLLOWUP_REBALANCE,
  WORKFLOW_TERMINAL: 'terminal',
});
const PRIORITY_RECOVERY_FOLLOW_UP_REQUIREMENT_SEMANTIC_STATES = Object.freeze([
  PRIORITY_RECOVERY_FOLLOW_UP_DECISION.NEEDS_OPERATION,
  PRIORITY_RECOVERY_FOLLOW_UP_DECISION.BLOCKED_UNCLASSIFIED,
]);
const PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT = Object.freeze({
  CREATE_RECOVERY_OPERATION: 'create_recovery_operation',
  SCHEDULE_FOLLOWUP_REBALANCE: 'schedule_followup_rebalance',
  TERMINAL_FAILED_OPERATION: 'terminal_failed_operation',
  NONE: 'none',
});
const PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE = Object.freeze({
  MOVE_CREATED: 'move_created',
  NOT_REQUIRED: 'not_required',
  TARGET_UNAVAILABLE: 'target_unavailable',
  SOURCE_FALLBACK_ADD_CREATED: 'source_fallback_add_created',
});
const PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON = Object.freeze({
  ADD_FOLLOW_UP_CREATED: 'add_follow_up_created',
  NOT_REQUIRED: 'follow_up_not_required',
  REPLACE_FOLLOW_UP_CREATED: 'replace_follow_up_created',
  SOURCE_UNAVAILABLE: 'source_unavailable',
  TARGET_UNAVAILABLE: 'target_unavailable',
});
const PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD = Object.freeze({
  REASON: 'followUpMoveReason',
  STATE: 'followUpMoveState',
});
const PRIORITY_RECOVERY_FOLLOW_UP_FIELD = Object.freeze({
  ACTUATION: 'actuation',
  BLOCKED_PARTITION_IDS: 'blockedPartitionIds',
  BLOCKER_REASONS: 'blockerReasons',
  ENTITY_ID: 'entityId',
  ENTITY_TYPE: 'entityType',
  NODE_ID: 'node_id',
  NODE_ID_CAMEL: 'nodeId',
  NEXT_REQUIRED_ACTION: 'nextRequiredAction',
  PARTITION_ID: 'partitionId',
  PARTITION_ID_SNAKE: 'partition_id',
  PLANNER: 'planner',
  PROGRESS: 'progress',
  PUBLICATION_RECOVERY_GATE: 'publicationRecoveryGate',
  PRIORITY_RECOVERY_CLOSURE_WITNESS: 'priorityRecoveryClosureWitness',
  ELIGIBLE_NODE_IDS: 'eligibleNodeIds',
  LATEST_OPERATION_STATUS: 'latestOperationStatus',
  REPLICA_ID: 'replica_id',
  REQUIRED_DISTINCT_NODE_COUNT: 'requiredDistinctNodeCount',
  SERVICE_ID: 'service_id',
  SEMANTIC_STATE_ID: 'semanticStateId',
  SOURCE_NODE_ID: 'sourceNodeId',
  STATUS: 'status',
  TARGET_NODE_ID: 'targetNodeId',
  UNRESOLVED_SEMANTIC_STATE_IDS: 'unresolvedSemanticStateIds',
  WORKFLOW_STATE: 'workflowState',
});
const PRIORITY_TOPOLOGY_CLEANUP_MOVE_REASON_SET = new Set([
  MOVE_REASON.NODE_NOT_IN_TARGET,
  MOVE_REASON.SPREAD_REPLICAS,
]);
const PRIORITY_RECOVERY_FOLLOW_UP_UNOCCUPIED_SERVICE_STATUSES = new Set([
  ReplicaStatus.REMOVED,
]);
const PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE = Object.freeze({
  ADD_FOLLOW_UP: 'add_follow_up',
  CURRENT_FOLLOW_UP_ALREADY_PLANNED: 'current_follow_up_already_planned',
  NO_FOLLOW_UP: 'no_follow_up',
});
const PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION = Object.freeze({
  KEEP_MOVES: 'keep_moves',
  PREPEND_FOLLOW_UP: 'prepend_follow_up',
});
const PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE.NO_FOLLOW_UP,
    matches: (evidence) => evidence.hasFollowUpMove !== true,
  }),
  Object.freeze({
    state:
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE
        .CURRENT_FOLLOW_UP_ALREADY_PLANNED,
    matches: (evidence) =>
      evidence.hasAddLikeCalculatedMove === true &&
      evidence.followUpTargetsCurrentEntity === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE.ADD_FOLLOW_UP,
    matches: () => true,
  }),
]);
const PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION_BY_STATE = Object.freeze({
  [PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE.ADD_FOLLOW_UP]:
    PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION.PREPEND_FOLLOW_UP,
  [
  PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE
    .CURRENT_FOLLOW_UP_ALREADY_PLANNED
  ]: PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION.KEEP_MOVES,
  [PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE.NO_FOLLOW_UP]:
    PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION.KEEP_MOVES,
});
const PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE = Object.freeze({
  NOT_REQUIRED: 'not_required',
  NO_CANDIDATE: 'no_candidate',
  NEEDS_OPERATION_CANDIDATE: 'needs_operation_candidate',
  UNBLOCKED_CANDIDATE: 'unblocked_candidate',
  BLOCKED_BY_TOPOLOGY: 'blocked_by_topology',
});
const PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE_TABLE =
  Object.freeze([
    Object.freeze({
      state: PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE.NOT_REQUIRED,
      matches: (evidence) => evidence.followUpRequired !== true,
    }),
    Object.freeze({
      state: PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE.NO_CANDIDATE,
      matches: (evidence) => evidence.hasRawCandidate !== true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE
          .NEEDS_OPERATION_CANDIDATE,
      matches: (evidence) => evidence.needsOperationRequired === true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE
          .UNBLOCKED_CANDIDATE,
      matches: (evidence) => evidence.hasUnblockedCandidate === true,
    }),
    Object.freeze({
      state:
        PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE
          .BLOCKED_BY_TOPOLOGY,
      matches: () => true,
    }),
  ]);
const REBALANCER_PRE_EXECUTION_READINESS_NODE_ID = Object.freeze({
  UNTARGETED: 'untargeted',
});
const REBALANCER_PRE_EXECUTION_READINESS_STATE = Object.freeze({
  BLOCKED: 'blocked',
  READY: 'ready',
});
const REBALANCER_PRE_EXECUTION_SKIP_DETAIL = Object.freeze({
  NONE: 'none',
});
const REBALANCER_PRE_EXECUTION_HANDOFF_STATE = Object.freeze({
  NO_LIMITED_MOVES: 'no_limited_moves',
  PRE_EXECUTION_SKIPS_ONLY: 'pre_execution_skips_only',
  READY_TO_EXECUTE: 'ready_to_execute',
  SHUTDOWN: 'shutdown',
});
const REBALANCER_PRE_EXECUTION_RETURN_STATE = Object.freeze({
  CONTINUE: 'continue',
  RETURN_NO_LIMITED_MOVES: 'return_no_limited_moves',
  RETURN_PRE_EXECUTION_SKIPS: 'return_pre_execution_skips',
  RETURN_SHUTDOWN: 'return_shutdown',
});
const REBALANCER_PRE_EXECUTION_HANDOFF_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: REBALANCER_PRE_EXECUTION_HANDOFF_STATE.SHUTDOWN,
    matches: (evidence) => evidence.shuttingDown === true,
  }),
  Object.freeze({
    state: REBALANCER_PRE_EXECUTION_HANDOFF_STATE.NO_LIMITED_MOVES,
    matches: (evidence) => evidence.limitedMoveCount === NUM.ZERO,
  }),
  Object.freeze({
    state: REBALANCER_PRE_EXECUTION_HANDOFF_STATE.PRE_EXECUTION_SKIPS_ONLY,
    matches: (evidence) =>
      evidence.executableMoveCount === NUM.ZERO &&
      evidence.preExecuteSkippedMoveCount > NUM.ZERO,
  }),
  Object.freeze({
    state: REBALANCER_PRE_EXECUTION_HANDOFF_STATE.READY_TO_EXECUTE,
    matches: () => true,
  }),
]);
const REBALANCER_PRE_EXECUTION_RETURN_STATE_BY_HANDOFF_STATE = Object.freeze({
  [REBALANCER_PRE_EXECUTION_HANDOFF_STATE.NO_LIMITED_MOVES]:
    REBALANCER_PRE_EXECUTION_RETURN_STATE.RETURN_NO_LIMITED_MOVES,
  [REBALANCER_PRE_EXECUTION_HANDOFF_STATE.PRE_EXECUTION_SKIPS_ONLY]:
    REBALANCER_PRE_EXECUTION_RETURN_STATE.RETURN_PRE_EXECUTION_SKIPS,
  [REBALANCER_PRE_EXECUTION_HANDOFF_STATE.READY_TO_EXECUTE]:
    REBALANCER_PRE_EXECUTION_RETURN_STATE.CONTINUE,
  [REBALANCER_PRE_EXECUTION_HANDOFF_STATE.SHUTDOWN]:
    REBALANCER_PRE_EXECUTION_RETURN_STATE.RETURN_SHUTDOWN,
});

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
      criticalQuery ?
        CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY :
        CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_BACKGROUND_VISIBILITY,
      {
        allowPressureDefer: criticalQuery !== true,
      },
    );
    return {
      controlPlaneOperationKind: UNIFIED_REBALANCER_LITERAL.READ,
      workloadClass: workloadProfile.workloadClass,
      workClass:
        workloadProfile.workClass ||
        (criticalQuery ?
          PRESSURE_WORK_CLASS.CRITICAL :
          PRESSURE_WORK_CLASS.BACKGROUND),
      allowPressureDefer: workloadProfile.allowPressureDefer === true,
      deliveryPriority: criticalQuery ?
        UNIFIED_REBALANCER_LITERAL.CRITICAL :
        UNIFIED_REBALANCER_LITERAL.BACKGROUND,
    };
  }

  /**
   * Execute one authoritative budget read through the control-plane metadata
   * gateway owner.
   *
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<Object>}
   */
  async executeBudgetRead(tableName, sql, params = []) {
    const queryOptions = this.getBudgetQueryOptions();
    if (
      typeof this.controlPlaneSystemTableGateway?.readAuthoritativeRows ===
      UNIFIED_REBALANCER_LITERAL.FUNCTION
    ) {
      return this.controlPlaneSystemTableGateway.readAuthoritativeRows(
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
    return Number.isFinite(parsed) && parsed > UNIFIED_REBALANCER_LITERAL.ZERO ?
      parsed :
      this.rebalanceBudget;
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
    return Number.isFinite(parsed) && parsed >= UNIFIED_REBALANCER_LITERAL.ZERO ?
      parsed :
      UNIFIED_REBALANCER_LITERAL.ZERO;
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
   * @param {Array<Object>} moves
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryBudgetPartitionId(moves = []) {
    const candidateMove = (Array.isArray(moves) ? moves : []).find(
      (move) => move?.type === MoveType.ADD || move?.type === MoveType.REPLACE,
    );
    const partitionId = String(
      candidateMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
        candidateMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE] ||
        this.entityId ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return partitionId;
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
    const partitionId = this.resolvePriorityRecoveryBudgetPartitionId(moves);
    const allowed =
      await this.rebalanceCoordinator.canStartPriorityAddOperation({
        ...PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
        partitionId,
      });
    return allowed === true;
  }

  /**
   * @param {Object|null} move
   * @return {boolean}
   * @private
   */
  isPriorityTopologyCleanupBudgetBypassMove(move) {
    return (
      this.isControlPlanePriorityPartition() &&
      move?.type === MoveType.REMOVE &&
      move?.standaloneSafe === true &&
      PRIORITY_TOPOLOGY_CLEANUP_MOVE_REASON_SET.has(move?.reason)
    );
  }

  /**
   * @param {Array<Object>} moves
   * @return {boolean}
   * @private
   */
  hasPriorityTopologyCleanupBudgetBypassCandidateMove(moves = []) {
    return (Array.isArray(moves) ? moves : []).some((move) =>
      this.isPriorityTopologyCleanupBudgetBypassMove(move),
    );
  }

  /**
   * @param {Array<Object>} moves
   * @return {Array<Object>}
   * @private
   */
  prioritizePriorityTopologyCleanupMoves(moves = []) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    if (!this.hasPriorityTopologyCleanupBudgetBypassCandidateMove(
      normalizedMoves,
    )) {
      return normalizedMoves;
    }
    return [
      ...normalizedMoves.filter((move) =>
        this.isPriorityTopologyCleanupBudgetBypassMove(move),
      ),
      ...normalizedMoves.filter((move) =>
        !this.isPriorityTopologyCleanupBudgetBypassMove(move),
      ),
    ];
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
    const partitionId = this.resolvePriorityRecoveryBudgetPartitionId(moves);
    if (
      !this.isControlPlanePriorityPartition() ||
      this.isEmergencyPriorityControlPlanePartition(partitionId) ||
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
        partitionId,
        visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
    const ordinaryPriorityInFlightCount = Number.isFinite(
      counts?.ordinaryPriorityCount,
    ) ?
      counts.ordinaryPriorityCount :
      NUM.ZERO;
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
        typeof replica.raft_role === 'string' ?
          replica.raft_role.toLowerCase() :
          null;
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
   * Return the current partition decision snapshot when priority recovery says
   * this owner must create more topology work.
   *
   * @return {Promise<Object|null>}
   * @private
   */
  async getCurrentPriorityRecoveryFollowUpDecisionSnapshot() {
    if (!this.isControlPlanePriorityPartition()) {
      return null;
    }
    const planningSnapshot = await this.getPriorityRecoveryPlanningSnapshot({
      partitionId: this.entityId,
    });
    const snapshots = Array.isArray(
      planningSnapshot?.priorityRecoveryDecisionSnapshots?.snapshots,
    ) ?
      planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots :
      [];
    const decisionSnapshot =
      snapshots.find((snapshot) => snapshot?.partitionId === this.entityId) ||
      this.buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {partitionId: this.entityId},
      ) ||
      null;
    if (!decisionSnapshot) {
      return null;
    }
    return Object.freeze({
      planningSnapshot,
      decisionSnapshot,
    });
  }

  /**
   * Return the first unresolved priority partition that still requires an
   * operation, even when this rebalancer owns a different priority partition.
   * This covers recovery owner gaps where canonical diagnostics can see the
   * required action but the affected partition has no active rebalancer owner.
   *
   * @param {Object|null} planningSnapshot
   * @return {Object|null}
   * @private
   */
  buildPriorityRecoverySurrogateFollowUpDecision(
    planningSnapshot = null,
  ) {
    if (!this.isControlPlanePriorityPartition()) {
      return null;
    }
    const snapshots = Array.isArray(
      planningSnapshot?.priorityRecoveryDecisionSnapshots?.snapshots,
    ) ?
      planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots :
      [];
    const decisionSnapshot = snapshots.find((snapshot) => {
      const partitionId = String(
        snapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      return (
        partitionId.length > NUM.ZERO &&
        partitionId !== this.entityId &&
        this.isPriorityRecoveryFollowUpOperationRequired(snapshot)
      );
    }) || this.buildPriorityRecoverySurrogateDecisionFromPlanning(
      planningSnapshot,
    );
    if (!decisionSnapshot) {
      return null;
    }
    return Object.freeze({
      planningSnapshot,
      decisionSnapshot,
    });
  }

  /**
   * @param {Object|null} planningSnapshot
   * @return {Object|null}
   * @private
   */
  buildPriorityRecoverySurrogateDecisionFromPlanning(
    planningSnapshot = null,
  ) {
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary ||
      planningSnapshot?.publicationRecoveryGate?.priorityPartitionSummary ||
      null;
    const closureWitnessPartitionId =
      this.resolvePriorityRecoveryClosureWitnessFollowUpPartitionId(
        planningSnapshot,
      );
    if (closureWitnessPartitionId) {
      return this.buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {partitionId: closureWitnessPartitionId},
      );
    }
    const blockedPartitions = Array.isArray(
      priorityPartitionSummary?.blockedPartitions,
    ) ?
      priorityPartitionSummary.blockedPartitions :
      [];
    const blockedPartition = blockedPartitions.find((partition) => {
      const partitionId = String(
        partition?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      return partitionId.length > NUM.ZERO && partitionId !== this.entityId;
    });
    if (!blockedPartition) {
      return null;
    }
    return this.buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
      planningSnapshot,
      {
        partitionId:
          blockedPartition[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID],
      },
    );
  }

  /**
   * Prefer the semantic closure witness over stale priority summary ordering
   * when choosing a surrogate no-operation follow-up partition.
   *
   * @param {Object|null} planningSnapshot
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryClosureWitnessFollowUpPartitionId(
    planningSnapshot = null,
  ) {
    const closureWitnessEvidence =
      this.buildPriorityRecoveryClosureWitnessFollowUpEvidence(planningSnapshot);
    return this.selectPriorityRecoveryClosureWitnessFollowUpPartitionId(
      closureWitnessEvidence,
    );
  }

  /**
   * @param {Object|null} planningSnapshot
   * @return {Object}
   * @private
   */
  buildPriorityRecoveryClosureWitnessFollowUpEvidence(
    planningSnapshot = null,
  ) {
    const closureWitness =
      planningSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PRIORITY_RECOVERY_CLOSURE_WITNESS
      ] ||
      planningSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PUBLICATION_RECOVERY_GATE
      ]?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PRIORITY_RECOVERY_CLOSURE_WITNESS
      ] ||
      null;
    const unresolvedSemanticStateIds = Array.isArray(
      closureWitness?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.UNRESOLVED_SEMANTIC_STATE_IDS
      ],
    ) ?
      closureWitness[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.UNRESOLVED_SEMANTIC_STATE_IDS
      ] :
      [];
    const blockedPartitionIds = Array.isArray(
      closureWitness?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKED_PARTITION_IDS
      ],
    ) ?
      closureWitness[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKED_PARTITION_IDS
      ] :
      [];
    const topologyBlockingPartitionIds =
      this.buildGlobalTopologyBlockingPartitionIdSet();
    const followUpRequired = PRIORITY_RECOVERY_FOLLOW_UP_REQUIREMENT_SEMANTIC_STATES.some(
      (semanticState) =>
        unresolvedSemanticStateIds.includes(semanticState),
    );
    const rawCandidatePartitionIds = followUpRequired ?
      blockedPartitionIds
        .map((partitionId) =>
          String(
            partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((partitionId) => partitionId.length > NUM.ZERO) :
      [];
    const candidatePartitionIds = rawCandidatePartitionIds
      .filter(
        (partitionId) =>
          !topologyBlockingPartitionIds.has(partitionId),
      );
    return Object.freeze({
      followUpRequired:
        followUpRequired,
      needsOperationRequired: unresolvedSemanticStateIds.includes(
        PRIORITY_RECOVERY_FOLLOW_UP_DECISION.NEEDS_OPERATION,
      ),
      blockedPartitionIds,
      rawCandidatePartitionIds:
        Object.freeze(rawCandidatePartitionIds),
      candidatePartitionIds: Object.freeze(candidatePartitionIds),
      hasRawCandidate: rawCandidatePartitionIds.length > NUM.ZERO,
      hasUnblockedCandidate: candidatePartitionIds.length > NUM.ZERO,
      topologyBlockingPartitionIds,
    });
  }

  /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryClosureWitnessFollowUpState(evidence = {}) {
    const tableEntry =
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE_TABLE.find(
        (entry) => entry.matches(evidence),
      );
    return tableEntry ?
      tableEntry.state :
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE.BLOCKED_BY_TOPOLOGY;
  }

  /**
   * @param {Array<string>} candidatePartitionIds
   * @return {string}
   * @private
   */
  selectNonLocalPriorityRecoveryFollowUpPartitionId(
    candidatePartitionIds = [],
  ) {
    return (
      candidatePartitionIds.find((partitionId) => partitionId !== this.entityId) ||
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING
    );
  }

  /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  selectPriorityRecoveryClosureWitnessNeedsOperationPartitionId(
    evidence = {},
  ) {
    const candidatePartitionIds = Array.isArray(
      evidence.candidatePartitionIds,
    ) ?
      evidence.candidatePartitionIds :
      [];
    const unblockedCandidatePartitionId =
      this.selectNonLocalPriorityRecoveryFollowUpPartitionId(
        candidatePartitionIds,
      );
    if (unblockedCandidatePartitionId) {
      return unblockedCandidatePartitionId;
    }
    const rawCandidatePartitionIds = Array.isArray(
      evidence.rawCandidatePartitionIds,
    ) ?
      evidence.rawCandidatePartitionIds :
      [];
    return this.selectNonLocalPriorityRecoveryFollowUpPartitionId(
      rawCandidatePartitionIds,
    );
  }

  /**
   * @return {Set<string>}
   * @private
   */
  buildGlobalTopologyBlockingPartitionIdSet() {
    return new Set(
      this.getGlobalTopologyBlockingInFlightOperations()
        .map((operation) =>
          String(
            operation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
              operation?.[
                PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE
              ] ||
              UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((partitionId) => partitionId.length > NUM.ZERO),
    );
  }

  /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  selectPriorityRecoveryClosureWitnessFollowUpPartitionId(evidence = {}) {
    const followUpState =
      this.resolvePriorityRecoveryClosureWitnessFollowUpState(evidence);
    if (
      followUpState ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE
        .NEEDS_OPERATION_CANDIDATE
    ) {
      return this.selectPriorityRecoveryClosureWitnessNeedsOperationPartitionId(
        evidence,
      );
    }
    if (
      followUpState ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_STATE.UNBLOCKED_CANDIDATE
    ) {
      const candidatePartitionIds = Array.isArray(
        evidence.candidatePartitionIds,
      ) ?
        evidence.candidatePartitionIds :
        [];
      return this.selectNonLocalPriorityRecoveryFollowUpPartitionId(
        candidatePartitionIds,
      );
    }
    return UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
  }

  /**
   * @return {Promise<boolean>}
   * @private
   */
  async hasPriorityRecoverySurrogateFollowUpOperationRequired() {
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    const planningSnapshot = await this.getPriorityRecoveryPlanningSnapshot({
      partitionId: this.entityId,
    });
    return Boolean(
      this.buildPriorityRecoverySurrogateFollowUpDecision(planningSnapshot),
    );
  }

  /**
   * Build the rebalancer handoff decision from publication planning evidence
   * when the owner answer has not retained per-partition decision snapshots.
   *
   * @param {Object|null} planningSnapshot
   * @return {Object|null}
   * @private
   */
  buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
    planningSnapshot = null,
    options = {},
  ) {
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }
    const partitionId = String(
      options?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
        this.entityId ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      return null;
    }
    const priorityPartitionSummary =
      planningSnapshot.priorityPartitionSummary ||
      planningSnapshot.publicationRecoveryGate?.priorityPartitionSummary ||
      null;
    if (!priorityPartitionSummary) {
      return null;
    }
    const closureWitnessEvidence =
      this.buildPriorityRecoveryClosureWitnessFollowUpEvidence(planningSnapshot);
    const closureWitnessPreferred =
      closureWitnessEvidence.followUpRequired === true &&
      closureWitnessEvidence.candidatePartitionIds.length > NUM.ZERO;
    if (
      closureWitnessPreferred &&
      !closureWitnessEvidence.candidatePartitionIds.includes(partitionId)
    ) {
      return null;
    }
    const activeNodeIds =
      resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds;
    const assessment = buildPriorityRecoveryPartitionAssessment({
      partitionId,
      priorityPartitionSummary,
      admission: {
        effectiveEligibleNodeIds: activeNodeIds,
        effectiveEligibleNodeCount: activeNodeIds.length,
        ineligibleNodes: [],
      },
      operationContexts: [],
    });
    const eligibleButNoOperation = assessment.blockerReasons.includes(
      PRIORITY_RECOVERY_FOLLOW_UP_DECISION.ELIGIBLE_NO_OPERATION,
    );
    const progress = eligibleButNoOperation ?
      Object.freeze({
        nextRequiredAction:
          PRIORITY_RECOVERY_FOLLOW_UP_DECISION.CREATE_RECOVERY_OPERATION,
      }) :
      Object.freeze({});
    const decisionSnapshot = Object.freeze({
      partitionId,
      semanticState: assessment.semanticState,
      blockerReasons: Object.freeze([...assessment.blockerReasons]),
      planner: assessment.planner,
      admission: Object.freeze({
        effectiveEligibleNodeIds: Object.freeze([...activeNodeIds]),
        effectiveEligibleNodeCount: activeNodeIds.length,
        ineligibleNodes: Object.freeze([]),
        blockingReasons: Object.freeze([]),
      }),
      publication: Object.freeze({
        recoveryActiveNodeIds: Object.freeze([...activeNodeIds]),
        concreteEligibleNodeIds: Object.freeze([...activeNodeIds]),
        publishedActiveNodeIds: Object.freeze([...activeNodeIds]),
      }),
      progress,
    });
    return this.isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot) ?
      decisionSnapshot :
      null;
  }

  /**
   * @param {Object|null} decisionSnapshot
   * @return {boolean}
   * @private
   */
  isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot = null) {
    const blockerReasons = Array.isArray(
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKER_REASONS],
    ) ?
      decisionSnapshot[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.BLOCKER_REASONS] :
      [];
    const semanticState =
      decisionSnapshot?.semanticState ||
      decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SEMANTIC_STATE_ID
      ];
    const nextRequiredActions = [
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PROGRESS]?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NEXT_REQUIRED_ACTION
      ],
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ACTUATION]?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NEXT_REQUIRED_ACTION
      ],
      decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NEXT_REQUIRED_ACTION
      ],
    ];
    const followUpEvidence = Object.freeze({
      createRecoveryAction: nextRequiredActions.includes(
        PRIORITY_RECOVERY_FOLLOW_UP_DECISION.CREATE_RECOVERY_OPERATION,
      ),
      scheduleFollowUpRebalance: nextRequiredActions.includes(
        PRIORITY_RECOVERY_FOLLOW_UP_DECISION.SCHEDULE_FOLLOWUP_REBALANCE,
      ),
      eligibleButNoOperation: blockerReasons.includes(
        PRIORITY_RECOVERY_FOLLOW_UP_DECISION.ELIGIBLE_NO_OPERATION,
      ),
      unresolvedSemanticState:
        PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS.includes(
          semanticState,
        ),
      terminalFailedOperation:
        semanticState ===
          PRIORITY_RECOVERY_FOLLOW_UP_DECISION.BLOCKED_UNCLASSIFIED &&
        decisionSnapshot?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.WORKFLOW_STATE
        ] === PRIORITY_RECOVERY_FOLLOW_UP_DECISION.WORKFLOW_TERMINAL &&
        decisionSnapshot?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.LATEST_OPERATION_STATUS
        ] === ReplicaStatus.FAILED &&
        Array.isArray(
          decisionSnapshot?.[
            PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ELIGIBLE_NODE_IDS
          ],
        ) &&
        decisionSnapshot[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ELIGIBLE_NODE_IDS
        ].length > NUM.ZERO,
    });
    const followUpDecisionEvidence = Object.freeze({
      createRecoveryOperation:
        followUpEvidence.unresolvedSemanticState &&
        (followUpEvidence.createRecoveryAction ||
          followUpEvidence.eligibleButNoOperation) &&
        PRIORITY_RECOVERY_FOLLOW_UP_REQUIREMENT_SEMANTIC_STATES.includes(
          semanticState,
        ),
      scheduleFollowupRebalance:
        followUpEvidence.unresolvedSemanticState &&
        followUpEvidence.scheduleFollowUpRebalance,
      terminalFailedOperation: followUpEvidence.terminalFailedOperation,
    });
    const followUpDecisionState =
      [
        {
          state: PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT
            .CREATE_RECOVERY_OPERATION,
          matches: (evidence) =>
            evidence.createRecoveryOperation === true,
        },
        {
          state: PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT
            .SCHEDULE_FOLLOWUP_REBALANCE,
          matches: (evidence) =>
            evidence.scheduleFollowupRebalance === true,
        },
        {
          state: PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT
            .TERMINAL_FAILED_OPERATION,
          matches: (evidence) =>
            evidence.terminalFailedOperation === true,
        },
      ].find((decision) => decision.matches(followUpDecisionEvidence))?.state ||
      PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT.NONE;
    return followUpDecisionState !==
      PRIORITY_RECOVERY_FOLLOW_UP_DECISION_REQUIREMENT.NONE;
  }

  /**
   * @return {Promise<boolean>}
   * @private
   */
  async hasPriorityRecoveryFollowUpOperationRequired() {
    const decision =
      await this.getCurrentPriorityRecoveryFollowUpDecisionSnapshot();
    return this.isPriorityRecoveryFollowUpOperationRequired(
      decision?.decisionSnapshot || null,
    );
  }

  /**
   * @param {Array<string[]>} candidateLists
   * @return {string[]}
   * @private
   */
  normalizePriorityRecoveryFollowUpNodeIds(candidateLists = []) {
    const nodeIds = [];
    const seenNodeIds = new Set();
    for (const candidateList of candidateLists) {
      for (const nodeId of Array.isArray(candidateList) ? candidateList : []) {
        const normalizedNodeId = String(
          nodeId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
        ).trim();
        if (
          normalizedNodeId.length === NUM.ZERO ||
          seenNodeIds.has(normalizedNodeId)
        ) {
          continue;
        }
        seenNodeIds.add(normalizedNodeId);
        nodeIds.push(normalizedNodeId);
      }
    }
    return nodeIds;
  }

  /**
   * @param {Object} decision
   * @return {string[]}
   * @private
   */
  resolvePriorityRecoveryFollowUpEligibleNodeIds(decision) {
    const decisionSnapshot = decision?.decisionSnapshot || null;
    const planningSnapshot = decision?.planningSnapshot || null;
    return this.normalizePriorityRecoveryFollowUpNodeIds([
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ELIGIBLE_NODE_IDS],
      decisionSnapshot?.admission?.effectiveEligibleNodeIds,
      decisionSnapshot?.publication?.recoveryActiveNodeIds,
      decisionSnapshot?.publication?.concreteEligibleNodeIds,
      decisionSnapshot?.publication?.publishedActiveNodeIds,
      planningSnapshot?.publishedActiveNodeIds,
      planningSnapshot?.publicationRecoveryGate?.publishedActiveNodeIds,
    ]);
  }

  /**
   * @param {Object|null} decision
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryFollowUpPartitionId(decision = null) {
    const decisionSnapshot = decision?.decisionSnapshot || decision || null;
    const partitionId = String(
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
        decisionSnapshot?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE
        ] ||
        this.entityId ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return partitionId;
  }

  /**
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  getCurrentPartitionReplicasByPartitionId(partitionId) {
    const normalizedPartitionId = String(
      partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (
      normalizedPartitionId.length === NUM.ZERO ||
      !this.systemTableCache ||
      typeof this.systemTableCache.filter !== TYPEOF.FUNCTION
    ) {
      return [];
    }
    return this.filterReplicasRetiredByTerminalReplaceOperations(
      this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (service) => {
          const normalizedService = normalizeServiceRow(service);
          return (
            normalizedService.partitionId === normalizedPartitionId &&
            normalizedService.serviceType === EntityType.PARTITION
          );
        },
      ),
    );
  }

  /**
   * @param {Object|null} decision
   * @param {Array<Object>} fallbackCurrentReplicas
   * @return {Array<Object>}
   * @private
   */
  resolvePriorityRecoveryFollowUpCurrentReplicas(
    decision = null,
    fallbackCurrentReplicas = [],
  ) {
    const partitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    if (partitionId === this.entityId) {
      return Array.isArray(fallbackCurrentReplicas) ?
        fallbackCurrentReplicas :
        [];
    }
    return this.getCurrentPartitionReplicasByPartitionId(partitionId);
  }

  /**
   * @param {Object|null} decision
   * @param {Object|null} targetState
   * @return {number}
   * @private
   */
  resolvePriorityRecoveryFollowUpTargetReplicaCount(
    decision = null,
    targetState = null,
  ) {
    const plannerTargetReplicaCount =
      Number.isInteger(
        decision?.decisionSnapshot?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PLANNER
        ]?.[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.REQUIRED_DISTINCT_NODE_COUNT
        ],
      ) &&
      decision.decisionSnapshot[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PLANNER
      ][
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.REQUIRED_DISTINCT_NODE_COUNT
      ] > NUM.ZERO ?
        decision.decisionSnapshot[
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PLANNER
        ][
          PRIORITY_RECOVERY_FOLLOW_UP_FIELD.REQUIRED_DISTINCT_NODE_COUNT
        ] :
        null;
    if (plannerTargetReplicaCount !== null) {
      return plannerTargetReplicaCount;
    }
    return Number.isInteger(targetState?.targetReplicaCount) &&
      targetState.targetReplicaCount > NUM.ZERO ?
      targetState.targetReplicaCount :
      this.getPriorityControlPlaneTargetReplicaCount();
  }

  /**
   * @param {Array<Object>} currentReplicas
   * @return {Set<string>}
   * @private
   */
  buildPriorityRecoveryFollowUpHealthyNodeSet(currentReplicas = []) {
    return new Set(
      this.getHealthyReplicas(currentReplicas)
        .map((replica) =>
          String(
            replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
              replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
              UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((nodeId) => nodeId.length > NUM.ZERO),
    );
  }

  /**
   * @param {Array<Object>} currentReplicas
   * @return {Set<string>}
   * @private
   */
  buildPriorityRecoveryFollowUpOccupiedNodeSet(currentReplicas = []) {
    const occupiedNodeIds = new Set();
    const replicas = Array.isArray(currentReplicas) ? currentReplicas : [];
    for (const replica of replicas) {
      const nodeId = String(
        replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
          replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      const status = String(
        replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.STATUS] ??
          ReplicaStatus.ACTIVE,
      ).toLowerCase();
      if (PRIORITY_RECOVERY_FOLLOW_UP_UNOCCUPIED_SERVICE_STATUSES.has(status)) {
        continue;
      }
      occupiedNodeIds.add(nodeId);
    }
    return occupiedNodeIds;
  }

  /**
   * @return {Set<string>}
   * @private
   */
  buildPriorityRecoveryFollowUpPendingTargetNodeSet() {
    return new Set(
      this.getTopologyBlockingInFlightOperations()
        .map((operation) =>
          String(
            operation?.target_node_id ||
              operation?.targetNodeId ||
              UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((nodeId) => nodeId.length > NUM.ZERO),
    );
  }

  /**
   * @param {Object} decision
   * @param {Array<Object>} currentReplicas
   * @return {string|null}
   * @private
   */
  selectPriorityRecoveryFollowUpTargetNodeId(decision, currentReplicas = []) {
    const eligibleNodeIds =
      this.resolvePriorityRecoveryFollowUpEligibleNodeIds(decision);
    const healthyNodeIds =
      this.buildPriorityRecoveryFollowUpHealthyNodeSet(currentReplicas);
    const occupiedNodeIds =
      this.buildPriorityRecoveryFollowUpOccupiedNodeSet(currentReplicas);
    const pendingTargetNodeIds =
      this.buildPriorityRecoveryFollowUpPendingTargetNodeSet();
    const previousFailedTargetNodeId = String(
      decision?.decisionSnapshot?.coordinator?.operation?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.TARGET_NODE_ID
      ] || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const unusedEligibleNodeIds = eligibleNodeIds.filter(
      (nodeId) =>
        !healthyNodeIds.has(nodeId) &&
        !occupiedNodeIds.has(nodeId) &&
        !pendingTargetNodeIds.has(nodeId),
    );
    const preferredUnusedEligibleNodeId = unusedEligibleNodeIds.find(
      (nodeId) => nodeId !== previousFailedTargetNodeId,
    );
    if (preferredUnusedEligibleNodeId) {
      return preferredUnusedEligibleNodeId;
    }
    if (unusedEligibleNodeIds.length > NUM.ZERO) {
      return unusedEligibleNodeIds[NUM.ZERO];
    }
    return (
      eligibleNodeIds.find(
        (nodeId) =>
          !occupiedNodeIds.has(nodeId) && !pendingTargetNodeIds.has(nodeId),
      ) ||
      null
    );
  }

  /**
   * @param {Array<Object>} healthyReplicas
   * @param {string} targetNodeId
   * @return {Object|null}
   * @private
   */
  selectPriorityRecoveryFollowUpSourceReplica(
    healthyReplicas = [],
    targetNodeId = UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
  ) {
    const replicasByNodeId = new Map();
    for (const replica of healthyReplicas) {
      const nodeId = String(
        replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
          replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (nodeId.length === NUM.ZERO) {
        continue;
      }
      if (!replicasByNodeId.has(nodeId)) {
        replicasByNodeId.set(nodeId, []);
      }
      replicasByNodeId.get(nodeId).push(replica);
    }
    for (const [nodeId, replicas] of replicasByNodeId.entries()) {
      if (nodeId === targetNodeId || replicas.length <= NUM.ONE) {
        continue;
      }
      return replicas[NUM.ZERO];
    }
    return (
      healthyReplicas.find((replica) => {
        const nodeId = String(
          replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
            replica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
            UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
        ).trim();
        return nodeId.length > NUM.ZERO && nodeId !== targetNodeId;
      }) || null
    );
  }

  /**
   * @param {string} state
   * @param {string} reason
   * @param {Object|undefined} move
   * @return {Object}
   * @private
   */
  buildPriorityRecoveryFollowUpMoveOutcome(
    state,
    reason,
    move = undefined,
  ) {
    const moveFields =
      move && typeof move === TYPEOF.OBJECT ?
        move :
        {};
    return Object.freeze({
      ...moveFields,
      [PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE]: state,
      [PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.REASON]: reason,
    });
  }

  /**
   * @param {Object|undefined} followUpMove
   * @return {boolean}
   * @private
   */
  isPriorityRecoveryFollowUpMoveCreated(followUpMove = undefined) {
    return (
      followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE] ===
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.MOVE_CREATED ||
      followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE] ===
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.SOURCE_FALLBACK_ADD_CREATED ||
      (
        followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE] ===
          undefined &&
        typeof followUpMove?.type === TYPEOF.STRING
      )
    );
  }

  /**
   * @param {Object} context
   * @return {Object|null}
   * @private
   */
  buildPriorityRecoveryFollowUpMove(context = {}) {
    const decision = context.decision || null;
    if (
      !this.isPriorityRecoveryFollowUpOperationRequired(
        decision?.decisionSnapshot || null,
      )
    ) {
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.NOT_REQUIRED,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.NOT_REQUIRED,
      );
    }
    const partitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decision);
    const currentReplicas =
      this.resolvePriorityRecoveryFollowUpCurrentReplicas(
        decision,
        context.currentReplicas,
      );
    const targetNodeId = this.selectPriorityRecoveryFollowUpTargetNodeId(
      decision,
      currentReplicas,
    );
    if (!targetNodeId) {
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.TARGET_UNAVAILABLE,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.TARGET_UNAVAILABLE,
      );
    }
    const healthyReplicas = this.getHealthyReplicas(currentReplicas);
    const targetReplicaCount =
      this.resolvePriorityRecoveryFollowUpTargetReplicaCount(
        decision,
        context.targetState,
      );
    const sourceReplica = this.selectPriorityRecoveryFollowUpSourceReplica(
      healthyReplicas,
      targetNodeId,
    );
    const shouldReplace =
      healthyReplicas.length >= targetReplicaCount && !!sourceReplica;
    if (!shouldReplace) {
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.MOVE_CREATED,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.ADD_FOLLOW_UP_CREATED,
        Object.freeze({
          type: MoveType.ADD,
          partitionId,
          entityType: EntityType.PARTITION,
          entityId: partitionId,
          nodeId: targetNodeId,
          reason: MOVE_REASON.INCREASE_REPLICA_COUNT,
        }),
      );
    }
    const sourceNodeId = String(
      sourceReplica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID] ||
        sourceReplica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.NODE_ID_CAMEL] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    const replicaId = String(
      sourceReplica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.REPLICA_ID] ||
        sourceReplica?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERVICE_ID] ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (sourceNodeId.length === NUM.ZERO || replicaId.length === NUM.ZERO) {
      return this.buildPriorityRecoveryFollowUpMoveOutcome(
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.SOURCE_FALLBACK_ADD_CREATED,
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.SOURCE_UNAVAILABLE,
        Object.freeze({
          type: MoveType.ADD,
          partitionId,
          entityType: EntityType.PARTITION,
          entityId: partitionId,
          nodeId: targetNodeId,
          reason: MOVE_REASON.INCREASE_REPLICA_COUNT,
        }),
      );
    }
    return this.buildPriorityRecoveryFollowUpMoveOutcome(
      PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.MOVE_CREATED,
      PRIORITY_RECOVERY_FOLLOW_UP_MOVE_REASON.REPLACE_FOLLOW_UP_CREATED,
      Object.freeze({
        type: MoveType.REPLACE,
        partitionId,
        entityType: EntityType.PARTITION,
        entityId: partitionId,
        nodeId: targetNodeId,
        sourceNodeId,
        replicaId,
        reason: MOVE_REASON.REPLACE_REPLICA,
      }),
    );
  }

  /**
   * @param {Array<Object>} moves
   * @param {Object|null} followUpMove
   * @return {Object}
   * @private
   */
  buildPriorityRecoveryFollowUpAugmentationEvidence({
    moves = [],
    followUpMove = null,
  } = {}) {
    const followUpMoveCreated =
      this.isPriorityRecoveryFollowUpMoveCreated(followUpMove);
    const followUpPartitionId = String(
      followUpMoveCreated ?
        followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE] ||
          followUpMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.ENTITY_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING :
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return Object.freeze({
      hasFollowUpMove: followUpMoveCreated,
      hasAddLikeCalculatedMove:
        this.hasPriorityBudgetBypassCandidateMove(moves),
      followUpPartitionId,
      followUpTargetsCurrentEntity:
        followUpPartitionId.length > NUM.ZERO &&
        followUpPartitionId === this.entityId,
    });
  }

  /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryFollowUpAugmentationState(evidence = {}) {
    const tableEntry =
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      );
    return tableEntry ?
      tableEntry.state :
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_STATE.NO_FOLLOW_UP;
  }

  /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  resolvePriorityRecoveryFollowUpAugmentationAction(evidence = {}) {
    const state =
      this.resolvePriorityRecoveryFollowUpAugmentationState(evidence);
    return (
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION_BY_STATE[state] ||
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION.KEEP_MOVES
    );
  }

  /**
   * Ensure canonical priority-recovery action requirements are not lost when
   * cache-only topology planning emits no add-like move.
   *
   * @param {Array<Object>} moves
   * @param {Object} context
   * @return {Promise<Array<Object>>}
   * @private
   */
  async augmentMovesWithPriorityRecoveryFollowUp(moves = [], context = {}) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    if (!this.isControlPlanePriorityPartition()) {
      return normalizedMoves;
    }
    const decision =
      context.decision ||
      (await this.getCurrentPriorityRecoveryFollowUpDecisionSnapshot());
    let followUpMove = this.buildPriorityRecoveryFollowUpMove({
      ...context,
      decision,
    });
    if (!this.isPriorityRecoveryFollowUpMoveCreated(followUpMove)) {
      const planningSnapshot =
        decision?.planningSnapshot ||
        await this.getPriorityRecoveryPlanningSnapshot({
          partitionId: this.entityId,
        });
      followUpMove = this.buildPriorityRecoveryFollowUpMove({
        ...context,
        decision: this.buildPriorityRecoverySurrogateFollowUpDecision(
          planningSnapshot,
        ),
      });
    }
    if (!this.isPriorityRecoveryFollowUpMoveCreated(followUpMove)) {
      return normalizedMoves;
    }
    const augmentationEvidence =
      this.buildPriorityRecoveryFollowUpAugmentationEvidence({
        moves: normalizedMoves,
        followUpMove,
      });
    const augmentationAction =
      this.resolvePriorityRecoveryFollowUpAugmentationAction(
        augmentationEvidence,
      );
    if (
      augmentationAction ===
      PRIORITY_RECOVERY_FOLLOW_UP_AUGMENTATION_ACTION.PREPEND_FOLLOW_UP
    ) {
      return [followUpMove, ...normalizedMoves];
    }
    return normalizedMoves;
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
        ) ?
          outcome.admission.blockingReasons
            .map((reason) =>
              String(reason?.code || reason?.reason || reason || '').trim(),
            )
            .filter((reason) => reason.length > NUM.ZERO) :
          [];
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

    const operationPartitionId = move.partitionId || this.entityId;
    const operationEntityType = move.entityType || this.entityType;
    const operationEntityId = move.entityId || operationPartitionId;
    const safetyError = await this.rebalanceCoordinator.getMoveSafetyError({
      ...move,
      partitionId: operationPartitionId,
      entityType: operationEntityType,
      entityId: operationEntityId,
    });
    if (safetyError) {
      this.logger.debug(REBALANCER_LOG_MSG.MOVE_BLOCKED_BY_SAFETY_POLICY, {
        entityId: this.entityId,
        entityType: this.entityType,
        partitionId: operationPartitionId,
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
      partitionId: operationPartitionId,
      entityType: operationEntityType,
      entityId: operationEntityId,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
      sourceNodeId: move.sourceNodeId,
      enforceConcurrentOperationBudget: true,
    };
    const membershipPublicationEpoch = Number.isInteger(
      move?.membershipPublicationEpoch,
    ) ?
      move.membershipPublicationEpoch :
      this.resolvePublishedMembershipPlanningEpoch();
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
    const normalizedReplicaId = String(
      replicaId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    if (normalizedReplicaId.length === NUM.ZERO) {
      return false;
    }
    const inFlightOps = this.getInFlightOperations();
    return inFlightOps.some((operation) => {
      const operationReplicaId = this.getReplicaIdFromOperationRow(operation);
      const sourceReplicaId =
        this.getReplaceSourceReplicaIdFromOperationRow(operation);
      return (
        operationReplicaId === normalizedReplicaId ||
        sourceReplicaId === normalizedReplicaId
      );
    });
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
   * @param {Object} move
   * @return {string}
   * @private
   */
  resolvePreExecutionReadinessNodeId(move = {}) {
    const nodeId = String(
      move?.nodeId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return nodeId.length > NUM.ZERO ?
      nodeId :
      REBALANCER_PRE_EXECUTION_READINESS_NODE_ID.UNTARGETED;
  }

  /**
   * @param {string} skipDetail
   * @return {string}
   * @private
   */
  resolvePreExecutionReadinessState(skipDetail) {
    return skipDetail === REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE ?
      REBALANCER_PRE_EXECUTION_READINESS_STATE.READY :
      REBALANCER_PRE_EXECUTION_READINESS_STATE.BLOCKED;
  }

  /**
   * @param {*} skipDetail
   * @return {string}
   * @private
   */
  normalizePreExecutionSkipDetail(skipDetail) {
    const normalizedSkipDetail = typeof skipDetail === TYPEOF.STRING ?
      skipDetail.trim() :
      UNIFIED_REBALANCER_LITERAL.EMPTY_STRING;
    return normalizedSkipDetail.length > NUM.ZERO ?
      normalizedSkipDetail :
      REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
  }

  /**
   * @param {Array<Object>} moves
   * @param {Map<string, string>} readinessByNodeId
   * @return {Array<Object>}
   * @private
   */
  buildPreExecutionReadinessGroups(moves = [], readinessByNodeId = new Map()) {
    const groupsByNodeId = new Map();
    for (const move of moves) {
      const nodeId = this.resolvePreExecutionReadinessNodeId(move);
      const current = groupsByNodeId.get(nodeId) || {
        nodeId,
        moveCount: NUM.ZERO,
        addLikeMoveCount: NUM.ZERO,
        removeMoveCount: NUM.ZERO,
        otherMoveCount: NUM.ZERO,
      };
      const addLikeMoveCount =
        move?.type === MoveType.ADD || move?.type === MoveType.REPLACE ?
          current.addLikeMoveCount + NUM.ONE :
          current.addLikeMoveCount;
      const removeMoveCount = move?.type === MoveType.REMOVE ?
        current.removeMoveCount + NUM.ONE :
        current.removeMoveCount;
      const otherMoveCount =
        move?.type !== MoveType.ADD &&
        move?.type !== MoveType.REPLACE &&
        move?.type !== MoveType.REMOVE ?
          current.otherMoveCount + NUM.ONE :
          current.otherMoveCount;
      groupsByNodeId.set(nodeId, {
        nodeId,
        moveCount: current.moveCount + NUM.ONE,
        addLikeMoveCount,
        removeMoveCount,
        otherMoveCount,
      });
    }

    return [...groupsByNodeId.values()].map((group) => {
      const skipDetail = readinessByNodeId.has(group.nodeId) ?
        readinessByNodeId.get(group.nodeId) :
        REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
      return {
        ...group,
        readinessState: this.resolvePreExecutionReadinessState(skipDetail),
        skipDetail: this.normalizePreExecutionSkipDetail(skipDetail),
      };
    });
  }

  /**
   * @param {Array<Object>} skippedResults
   * @return {Array<string>}
   * @private
   */
  buildPreExecutionSkipReasons(skippedResults = []) {
    return [...new Set(
      skippedResults
        .map((result) =>
          String(
            result?.reason || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
          ).trim(),
        )
        .filter((reason) => reason.length > NUM.ZERO),
    )].sort((left, right) => left.localeCompare(right));
  }

  /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  resolvePreExecutionHandoffState(evidence = {}) {
    const entry = REBALANCER_PRE_EXECUTION_HANDOFF_STATE_TABLE.find((rule) =>
      rule.matches(evidence),
    );
    return entry?.state ||
      REBALANCER_PRE_EXECUTION_HANDOFF_STATE.READY_TO_EXECUTE;
  }

  /**
   * @param {string} handoffState
   * @return {string}
   * @private
   */
  resolvePreExecutionReturnState(handoffState) {
    return REBALANCER_PRE_EXECUTION_RETURN_STATE_BY_HANDOFF_STATE[
      handoffState
    ] || REBALANCER_PRE_EXECUTION_RETURN_STATE.CONTINUE;
  }

  /**
   * @param {Array<Object>} moves
   * @param {Object} context
   * @param {Array<Object>} executableGroups
   * @param {Array<Object>} skippedResults
   * @param {Array<Object>} readinessGroups
   * @return {Object}
   * @private
   */
  buildPreExecutionHandoffSnapshot({
    moves = [],
    context = {},
    executableGroups = [],
    skippedResults = [],
    readinessGroups = [],
  } = {}) {
    const executableMoveCount = executableGroups.reduce(
      (count, group) => count + group.nodeMoves.length,
      NUM.ZERO,
    );
    const evidence = Object.freeze({
      shuttingDown: this.isShuttingDown === true,
      limitedMoveCount: moves.length,
      executableMoveCount,
      preExecuteSkippedMoveCount: skippedResults.length,
    });
    const preExecutionHandoffState =
      this.resolvePreExecutionHandoffState(evidence);
    const preExecuteReturnState =
      this.resolvePreExecutionReturnState(preExecutionHandoffState);
    const readyReadinessGroupCount = readinessGroups.filter((group) =>
      group.readinessState === REBALANCER_PRE_EXECUTION_READINESS_STATE.READY,
    ).length;
    const blockedReadinessGroupCount = readinessGroups.filter((group) =>
      group.readinessState === REBALANCER_PRE_EXECUTION_READINESS_STATE.BLOCKED,
    ).length;

    return {
      trigger: String(
        context.trigger || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim(),
      plannedMoveCount: Number.isFinite(context.plannedMoveCount) ?
        Math.trunc(context.plannedMoveCount) :
        moves.length,
      moveLimit: Number.isFinite(context.moveLimit) ?
        Math.trunc(context.moveLimit) :
        moves.length,
      limitedMoveCount: moves.length,
      executableMoveCount,
      preExecuteSkippedMoveCount: skippedResults.length,
      readinessGroupCount: readinessGroups.length,
      readyReadinessGroupCount,
      blockedReadinessGroupCount,
      readinessGroups,
      preExecuteSkipReasons: this.buildPreExecutionSkipReasons(skippedResults),
      preExecutionHandoffState,
      preExecuteReturnState,
    };
  }

  /**
   * @param {Object} snapshot
   * @private
   */
  logPreExecutionHandoff(snapshot = {}) {
    this.logger.info(REBALANCER_LOG_MSG.PRE_EXECUTION_HANDOFF, {
      entityId: this.entityId,
      entityType: this.entityType,
      ...snapshot,
    });
  }

  /**
   * @param {Array<Object>} moves
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async buildPreExecutionHandoffPlan(moves = [], context = {}) {
    const results = [];
    const readinessByNodeId = new Map();
    const getSkipReasonCached = async (nodeId) => {
      if (!nodeId) {
        return REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
      }
      if (readinessByNodeId.has(nodeId)) {
        return readinessByNodeId.get(nodeId);
      }
      const skipDetail = this.normalizePreExecutionSkipDetail(
        await this.getNodeReadinessSkipReason(nodeId),
      );
      readinessByNodeId.set(nodeId, skipDetail);
      return skipDetail;
    };
    const blockedAddNodeIds = new Set();
    for (const move of moves) {
      if (this.isShuttingDown) {
        const readinessGroups = this.buildPreExecutionReadinessGroups(
          moves,
          readinessByNodeId,
        );
        return {
          executableGroups: [],
          results,
          snapshot: this.buildPreExecutionHandoffSnapshot({
            moves,
            context,
            executableGroups: [],
            skippedResults: results,
            readinessGroups,
          }),
        };
      }
      if (
        (move?.type === MoveType.ADD || move?.type === MoveType.REPLACE) &&
        move?.nodeId
      ) {
        const skipDetail = await getSkipReasonCached(move.nodeId);
        if (skipDetail !== REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE) {
          blockedAddNodeIds.add(move.nodeId);
        }
      }
    }

    const movesToExecute = [];
    for (const move of moves) {
      const isDeferrableRemove =
        move?.type === MoveType.REMOVE &&
        move?.reason !== MOVE_REASON.REPLICA_FAILED &&
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
    const executableGroups = [];
    for (const [nodeId, nodeMoves] of groupedMoves.entries()) {
      if (this.isShuttingDown) {
        break;
      }
      const skipDetail = nodeId ?
        await getSkipReasonCached(nodeId) :
        REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE;
      if (skipDetail !== REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE) {
        executableGroups.push({
          nodeId,
          nodeMoves,
          skipDetail,
          skipBeforeExecute: true,
        });
        continue;
      }
      executableGroups.push({
        nodeId,
        nodeMoves,
        skipDetail: REBALANCER_PRE_EXECUTION_SKIP_DETAIL.NONE,
        skipBeforeExecute: false,
      });
    }

    const preExecuteSkippedResults = [
      ...results,
      ...executableGroups
        .filter((group) => group.skipBeforeExecute === true)
        .flatMap((group) => group.nodeMoves.map((move) => ({
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
          skipDetail: group.skipDetail,
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
        }))),
    ];
    const readinessGroups = this.buildPreExecutionReadinessGroups(
      moves,
      readinessByNodeId,
    );
    return {
      executableGroups,
      results,
      snapshot: this.buildPreExecutionHandoffSnapshot({
        moves,
        context,
        executableGroups: executableGroups.filter(
          (group) => group.skipBeforeExecute !== true,
        ),
        skippedResults: preExecuteSkippedResults,
        readinessGroups,
      }),
    };
  }

  /**
   * Execute move operations with per-node batching and backpressure.
   * @param {Array<Object>} moves - Move operations.
   * @param {Object} [context={}] - Pre-execution diagnostic context.
   * @return {Promise<Array<Object>>} Execution results.
   * @private
   */
  async executeRebalancingMoves(moves, context = {}) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    const batchSize =
      Number.isFinite(this.moveBatchSize) && this.moveBatchSize > 0 ?
        Math.floor(this.moveBatchSize) :
        1;
    const interBatchDelayMs =
      Number.isFinite(this.interBatchDelayMs) && this.interBatchDelayMs > 0 ?
        this.interBatchDelayMs :
        0;
    const handoffPlan = await this.buildPreExecutionHandoffPlan(
      normalizedMoves,
      context,
    );
    this.logPreExecutionHandoff(handoffPlan.snapshot);
    const results = [...handoffPlan.results];
    if (
      handoffPlan.snapshot.preExecuteReturnState ===
        REBALANCER_PRE_EXECUTION_RETURN_STATE.RETURN_NO_LIMITED_MOVES ||
      handoffPlan.snapshot.preExecuteReturnState ===
        REBALANCER_PRE_EXECUTION_RETURN_STATE.RETURN_SHUTDOWN
    ) {
      return results;
    }

    for (const group of handoffPlan.executableGroups) {
      const {nodeId, nodeMoves, skipBeforeExecute, skipDetail} = group;
      if (this.isShuttingDown) {
        break;
      }
      if (skipBeforeExecute === true) {
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
    const calculatedMoves = this.movePlanner.calculateMoves(
      currentReplicas,
      targetState,
    );
    const priorityRecoveryAwareMoves =
      await this.augmentMovesWithPriorityRecoveryFollowUp(calculatedMoves, {
        currentReplicas,
        targetState,
      });
    const moves = await this.movePlanner.applyPressureGating(
      priorityRecoveryAwareMoves,
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
    const shouldPrioritizeBudgetedTopologyCleanup =
      this.hasPriorityTopologyCleanupBudgetBypassCandidateMove(moves);
    try {
      const configuredBudget = await this.getConfiguredRebalanceBudget();
      const inFlightCount = await this.getGlobalInFlightOperationCount();
      const isCritical = this.movePlanner.isCriticalState(
        currentReplicas,
        effectivePolicy,
        availableNodes,
      );
      const effectiveBudget = isCritical ?
        configuredBudget * this.criticalBudgetMultiplier :
        configuredBudget;
      const reservedPriorityRecoveryMoveSlots =
        this.getReservedPriorityRecoveryMoveSlots();

      availableBudget = Math.max(
        NUM.ZERO,
        effectiveBudget - inFlightCount - reservedPriorityRecoveryMoveSlots,
      );
      if (availableBudget <= UNIFIED_REBALANCER_LITERAL.ZERO) {
        const priorityTopologyCleanupBudgetBypass =
          shouldPrioritizeBudgetedTopologyCleanup;
        if (priorityTopologyCleanupBudgetBypass === true) {
          availableBudget = NUM.ONE;
        } else {
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
    const budgetOrderedMoves = shouldPrioritizeBudgetedTopologyCleanup ?
      this.prioritizePriorityTopologyCleanupMoves(moves) :
      moves;
    const limitedMoves = budgetOrderedMoves.slice(0, moveLimit).map((move) => {
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
    const results = await this.executeRebalancingMoves(limitedMoves, {
      trigger,
      plannedMoveCount: moves.length,
      moveLimit,
    });

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

export {UnifiedRebalancerSegment4};
