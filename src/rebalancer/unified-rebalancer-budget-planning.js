import {UnifiedRebalancerReplicaState} from './unified-rebalancer-replica-state.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {orderLedgerQuorumCureMovesFirst} from './operation-ledger-hold-policy.js';
import {
  PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS,
  classifyPriorityRecoveryAdmissionPartitionClass,
} from './replica-placement-cure-policy.js';
import {
  applyUnifiedRebalancerPriorityRecoveryFollowUpDecisionMethods,
} from './unified-rebalancer-priority-recovery-follow-up-decisions.js';
import {UNIFIED_REBALANCER_FOLLOW_UP_SHARED as SHARED} from './unified-rebalancer-follow-up-shared.js';

const {
  CONTROL_PLANE_WORKLOAD_CLASS,
  MoveType,
  OperationType,
  PRESSURE_WORK_CLASS,
  PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
  PRIORITY_RECOVERY_FOLLOW_UP_FIELD,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD,
  PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE,
  PRIORITY_TOPOLOGY_CLEANUP_MOVE_REASON_SET,
  REBALANCER_BUDGET_READ_OPTIONS,
  REBALANCER_CONFIG_KEY,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaStatus,
  SQL_BUDGET,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
  buildControlPlaneWorkloadProfile,
} = SHARED;

const PRIORITY_RECOVERY_ORDINARY_SERIAL_GATE_STATE = Object.freeze({
  FOLLOW_UP_WITHOUT_SERIAL_WAIT: 'follow_up_without_serial_wait',
  SERIAL_GATE_REQUIRED: 'serial_gate_required',
});
const PRIORITY_RECOVERY_ORDINARY_SERIAL_GATE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state:
      PRIORITY_RECOVERY_ORDINARY_SERIAL_GATE_STATE
        .FOLLOW_UP_WITHOUT_SERIAL_WAIT,
    matches: (evidence) =>
      evidence.hasPriorityRecoveryFollowUpMove === true &&
      evidence.hasExplicitEmptySerialWaitOperationIds === true,
  }),
  Object.freeze({
    state: PRIORITY_RECOVERY_ORDINARY_SERIAL_GATE_STATE.SERIAL_GATE_REQUIRED,
    matches: () => true,
  }),
]);

class UnifiedRebalancerBudgetPlanning extends UnifiedRebalancerReplicaState {
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

  getBudgetQueryOptions() {
    const criticalQuery =
      this.isControlPlanePriorityPartition() ||
      this.isSystemPartitionEntity();
    const workloadProfile = buildControlPlaneWorkloadProfile(
      criticalQuery ?
        CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY :
        CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_BACKGROUND_VISIBILITY,
      {
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
      deliveryPriority: criticalQuery ?
        UNIFIED_REBALANCER_LITERAL.CRITICAL :
        UNIFIED_REBALANCER_LITERAL.BACKGROUND,
    };
  }

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

  hasPriorityBudgetBypassCandidateMove(moves = []) {
    if (!Array.isArray(moves) || moves.length === 0) {
      return false;
    }
    return moves.some(
      (move) => move?.type === MoveType.ADD || move?.type === MoveType.REPLACE,
    );
  }

  resolvePriorityRecoveryAddLikeCandidateMove(moves = []) {
    return (Array.isArray(moves) ? moves : []).find(
      (move) => move?.type === MoveType.ADD || move?.type === MoveType.REPLACE,
    ) || null;
  }

  resolvePriorityRecoveryBudgetPartitionId(moves = []) {
    const candidateMove =
      this.resolvePriorityRecoveryAddLikeCandidateMove(moves);
    const partitionId = String(
      candidateMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
        candidateMove?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID_SNAKE] ||
        this.entityId ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return partitionId;
  }

  isPriorityRecoveryFollowUpSerialGateMove(move = null) {
    const followUpMoveState =
      move?.[PRIORITY_RECOVERY_FOLLOW_UP_MOVE_FIELD.STATE];
    return (
      followUpMoveState ===
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.MOVE_CREATED ||
      followUpMoveState ===
        PRIORITY_RECOVERY_FOLLOW_UP_MOVE_STATE.SOURCE_FALLBACK_ADD_CREATED
    );
  }

  buildPriorityRecoveryOrdinarySerialGateEvidence(moves = []) {
    const candidateMove =
      this.resolvePriorityRecoveryAddLikeCandidateMove(moves);
    const hasSerialWaitEvidence = Array.isArray(
      candidateMove?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_OPERATION_IDS
      ],
    );
    const serialWaitOperationIds = hasSerialWaitEvidence ?
      candidateMove[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.SERIAL_WAIT_OPERATION_IDS
      ] :
      [];
    return Object.freeze({
      hasPriorityRecoveryFollowUpMove:
        this.isPriorityRecoveryFollowUpSerialGateMove(candidateMove),
      hasSerialWaitEvidence,
      hasSerialWaitOperationIds:
        serialWaitOperationIds.length > 0,
      hasExplicitEmptySerialWaitOperationIds:
        hasSerialWaitEvidence === true &&
        serialWaitOperationIds.length === 0,
    });
  }

  resolvePriorityRecoveryOrdinarySerialGateState(evidence = {}) {
    const tableEntry =
      PRIORITY_RECOVERY_ORDINARY_SERIAL_GATE_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      );
    return tableEntry ?
      tableEntry.state :
      PRIORITY_RECOVERY_ORDINARY_SERIAL_GATE_STATE.SERIAL_GATE_REQUIRED;
  }

  shouldBypassOrdinaryPriorityRecoverySerialGate(moves = []) {
    const evidence =
      this.buildPriorityRecoveryOrdinarySerialGateEvidence(moves);
    return this.resolvePriorityRecoveryOrdinarySerialGateState(evidence) ===
      PRIORITY_RECOVERY_ORDINARY_SERIAL_GATE_STATE
        .FOLLOW_UP_WITHOUT_SERIAL_WAIT;
  }

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
        'function'
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

  isPriorityTopologyCleanupBudgetBypassMove(move) {
    return (
      this.isControlPlanePriorityPartition() &&
      move?.type === MoveType.REMOVE &&
      move?.standaloneSafe === true &&
      PRIORITY_TOPOLOGY_CLEANUP_MOVE_REASON_SET.has(move?.reason)
    );
  }

  hasPriorityTopologyCleanupBudgetBypassCandidateMove(moves = []) {
    return (Array.isArray(moves) ? moves : []).some((move) =>
      this.isPriorityTopologyCleanupBudgetBypassMove(move),
    );
  }

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

  prioritizeOperationLedgerQuorumCureMoves(moves = []) {
    const normalizedMoves = Array.isArray(moves) ? moves : [];
    if (
      !this.rebalanceCoordinator ||
      typeof this.rebalanceCoordinator
        .getOperationLedgerQuorumConcentrationForPartition !== 'function' ||
      this.rebalanceCoordinator
        .getOperationLedgerQuorumConcentrationForPartition(this.entityId) === null
    ) {
      return normalizedMoves;
    }
    // Which moves are cure-typed is an owner row
    // (operation-ledger-hold-policy.js); this planner owns only the
    // entity-scoped concentration evidence check above.
    return orderLedgerQuorumCureMovesFirst(normalizedMoves, this.entityId);
  }

  async getOrdinaryPriorityRecoverySerialGateSnapshot(moves = []) {
    const partitionId = this.resolvePriorityRecoveryBudgetPartitionId(moves);
    // Ordinary-lane membership is an owner row
    // (replica-placement-cure-policy.js). The conjunct is deliberately
    // mixed-scope and preserved exactly: priority-ness is THIS entity's
    // planning question (arg-ignoring predicate) while emergency-ness follows
    // the resolved budget partition id, which can differ on cross-partition
    // follow-ups.
    const partitionClass = classifyPriorityRecoveryAdmissionPartitionClass(
      partitionId,
      {
        isPriorityPartition: () =>
          this.isControlPlanePriorityPartition() === true,
        isEmergencyPriorityPartition:
          this.isEmergencyPriorityControlPlanePartition.bind(this),
      },
    );
    if (
      partitionClass !==
        PRIORITY_RECOVERY_ADMISSION_PARTITION_CLASS.ORDINARY_PRIORITY ||
      !this.isPriorityControlPlaneRecoveryActive() ||
      !this.hasPriorityBudgetBypassCandidateMove(moves) ||
      !this.rebalanceCoordinator ||
      typeof this.rebalanceCoordinator.getConcurrentAddCountByPriorityClass !==
        'function'
    ) {
      return null;
    }
    if (this.shouldBypassOrdinaryPriorityRecoverySerialGate(moves)) {
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
      0;
    return Object.freeze({
      applicable: true,
      serialLimit: 1,
      ordinaryPriorityInFlightCount,
      blocked: ordinaryPriorityInFlightCount >= 1,
    });
  }

  isCriticalSystemPartition() {
    return this.isSystemPartitionEntity();
  }

  getHealthyReplicas(replicas) {
    const activeReplicas = replicas.filter((replica) => {
      const status = replica.status || ReplicaStatus.ACTIVE;
      return status === ReplicaStatus.ACTIVE;
    });

    // Align critical-partition health semantics with coordinator safety checks:
    // consider only routable non-learner replicas on ready nodes as healthy.
    if (!this.isSystemPartitionEntity()) {
      return activeReplicas;
    }

    const readyNodeIds = new Set(
      this.getAvailableNodes().map((node) => node.node_id),
    );

    return activeReplicas.filter((replica) => {
      if (!replica?.node_id || !replica?.address) {
        return false;
      }
      if (!isVoterRaftRole(replica.raft_role)) {
        return false;
      }
      return readyNodeIds.has(replica.node_id);
    });
  }

  // Like getHealthyReplicas but INCLUDING non-voting learners: every active
  // replica on a READY node occupies a partition slot, even a learner that has
  // not yet promoted (and, under the target+1 voter cap, may be unable to
  // promote at all). The priority-recovery deficit gate uses this so a pile of
  // settled-but-unpromoted learners — which getHealthyReplicas excludes by role,
  // making the partition look perpetually under-replicated — is not re-minted as
  // a fresh ADD every plan tick (the over-replication storm).
  //
  // Liveness guard = ready OR process-alive, NOT merely ready. A member counts if
  // its node is either serve-ready (getAvailableNodes) OR process-alive — up and
  // reporting runtime authority but transiently not-yet-serve-ready (a rejoiner
  // mid-restart whose replica just materialized). The old ready-only filter
  // treated such a restarting node like a dead one and re-minted an ADD every tick
  // while its replica terminalized-but-settled (invisible to both this
  // ready-occupied count and the transitional in-flight-ADD count) — the residual
  // over-replication that survived the count-aware gate. A genuinely dead/evicted
  // node — INCLUDING one retained in the published membership by a membership
  // freeze — is NOT process-alive (processAlive reflects live runtime evidence,
  // not membership-list retention), so it is still excluded and its replica is
  // re-placed. That is why the guard keys on processAlive, not published-active.
  getReadyNodeOccupiedReplicas(replicas) {
    const activeReplicas = replicas.filter((replica) => {
      const status = replica.status || ReplicaStatus.ACTIVE;
      return status === ReplicaStatus.ACTIVE;
    });
    if (!this.isSystemPartitionEntity()) {
      return activeReplicas;
    }
    const readyNodeIds = new Set(
      this.getAvailableNodes().map((node) => node.node_id),
    );
    return activeReplicas.filter(
      (replica) =>
        replica?.node_id &&
        replica?.address &&
        (readyNodeIds.has(replica.node_id) ||
          this.isNodeProcessAlive(replica.node_id)),
    );
  }

  async calculateTargetState(currentReplicas, policy) {
    return this.movePlanner.calculateTargetState(currentReplicas, policy);
  }

  calculateMessageGroupPlacement(nodes, targetCount, policy) {
    return this.movePlanner.calculateMessageGroupPlacement(
      nodes,
      targetCount,
      policy,
    );
  }

  calculatePartitionPlacement(nodes, targetCount, policy) {
    return this.movePlanner.calculatePartitionPlacement(
      nodes,
      targetCount,
      policy,
    );
  }

  sortNodesByLoad(nodes) {
    return this.movePlanner.sortNodesByLoad(nodes);
  }

  sortNodesBySuitability(nodes, policy) {
    return this.movePlanner.sortNodesBySuitability(nodes, policy);
  }

  calculateNodeLoad(node) {
    return this.movePlanner.calculateNodeLoad(node);
  }

  calculateMoves(currentReplicas, targetState) {
    return this.movePlanner.calculateMoves(currentReplicas, targetState);
  }

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

  buildRebalanceResult(success, extra = {}) {
    return {
      success,
      ...extra,
    };
  }

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
}

applyUnifiedRebalancerPriorityRecoveryFollowUpDecisionMethods(
  UnifiedRebalancerBudgetPlanning,
);

export {UnifiedRebalancerBudgetPlanning};
