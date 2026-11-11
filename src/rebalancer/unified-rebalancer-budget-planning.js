import {AVAILABLE_NODE_PLANNING_STATE} from
  './rebalancer-no-target-pass-diagnostic.js';
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
import {INCOMPLETE_OPERATION_OBSERVATION_STATE} from
  './replica-operation-repository.js';
import {
  buildOperationListUnavailableError,
  isOperationVisibilityUnavailableError,
} from './replica-operation-repository-operation-visibility.js';

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

const GLOBAL_IN_FLIGHT_COUNT_SCOPE = 'global in-flight operation count';

// The serial gate's own answer about its in-flight count: COUNTED - the
// owner answered the list completely; UNANSWERED - the list read was
// DEFERRED or only a projection, so the count is unknown, never zero.
const ORDINARY_PRIORITY_SERIAL_GATE_COUNT_STATE = Object.freeze({
  COUNTED: 'counted',
  UNANSWERED: 'unanswered',
});

function isCompleteIncompleteOperationObservation(observation) {
  return observation?.complete === true &&
    observation.state !== INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED;
}

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

  /**
   * The cluster-wide in-flight operation count the global move budget is
   * charged with. The read prefers this node's replica of replica_operations
   * and asks the owner when it is not hosted here; a read that still does not
   * answer is the typed list unavailability (never a count of zero, which
   * opened the whole budget), and the OPERATION_LIST_READ_DEFERRED wait is
   * armed so the event that can let the owner answer re-asks.
   * @return {Promise<number>}
   */
  async getGlobalInFlightOperationCount() {
    const result = await this.executeBudgetRead(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      SQL_BUDGET.SELECT_IN_FLIGHT_OPERATION_IDS,
      [],
    );
    if (result?.success !== true || !Array.isArray(result.rows)) {
      this.armOperationListReadWake();
      throw buildOperationListUnavailableError(result,
        GLOBAL_IN_FLIGHT_COUNT_SCOPE);
    }
    return result.rows.length;
  }

  /**
   * The global budget's in-flight count for this entity's pass. An
   * unanswered count holds every entity (the pass reports the budget query
   * failure) except the emergency lane: replica_operations and
   * control-plane publication partitions, whose recovery is what lets the
   * owner answer. For them an unknown count is no free budget, and the
   * coordinator's emergency admission decides through the priority budget
   * bypass (canBypassGlobalBudgetForPriorityRecovery) - so the cycle
   * "count needs the owner, the owner needs this ADD" cannot close.
   * @return {Promise<number>}
   */
  async resolveGlobalInFlightOperationCountForBudget() {
    try {
      return await this.getGlobalInFlightOperationCount();
    } catch (error) {
      if (!isOperationVisibilityUnavailableError(error) ||
          !this.isEmergencyPriorityControlPlanePartition(this.entityId)) {
        throw error;
      }
      return Number.POSITIVE_INFINITY;
    }
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
    // A list the owner did not answer completely holds the gate: its count
    // is unknown, and reading it as zero admitted a second ordinary-priority
    // ADD beside one already in flight. The named wait re-asks on the event
    // that can let the owner answer; its bound is the cadence check.
    // The emergency lane (replica_operations, control-plane publications),
    // whose recovery restores that answer, is never gated here.
    if (!isCompleteIncompleteOperationObservation(counts.observation)) {
      this.armOperationListReadWake();
      return Object.freeze({
        applicable: true,
        serialLimit: 1,
        countState: ORDINARY_PRIORITY_SERIAL_GATE_COUNT_STATE.UNANSWERED,
        ordinaryPriorityInFlightCount: null,
        observationState: counts.observation.state,
        deferredOutcome: counts.observation.deferredOutcome,
        blocked: true,
      });
    }
    this.disarmOperationListReadWake();
    return Object.freeze({
      applicable: true,
      serialLimit: 1,
      countState: ORDINARY_PRIORITY_SERIAL_GATE_COUNT_STATE.COUNTED,
      ordinaryPriorityInFlightCount: counts.ordinaryPriorityCount,
      observationState: counts.observation.state,
      deferredOutcome: null,
      blocked: counts.ordinaryPriorityCount >= 1,
    });
  }

  isCriticalSystemPartition() {
    return this.isSystemPartitionEntity();
  }

  /**
   * The nodes whose replicas are not counted unhealthy: READY candidates and
   * DEFERRED ones. A deferred readiness read means the node's health is
   * unknown (a rebuild is queued), not that it is unhealthy: counting its
   * replicas as missing made the planner mint ADDs for replicas that exist.
   * No ADD may rest on an unknown, so its replicas still count, and the
   * planning-target wake is armed so the publication that answers the read
   * re-evaluates this entity. (Removal safety is not decided here: the
   * remove-safety evaluator reads committed node and group evidence.)
   * @return {Set<string>}
   */
  resolveNotUnhealthyNodeIds() {
    const nodePlan = this.getAvailableNodePlan();
    const deferredNodeIds = nodePlan.candidates
      .filter((candidate) =>
        candidate.state === AVAILABLE_NODE_PLANNING_STATE.DEFERRED)
      .map((candidate) => candidate.nodeId);
    // Armed against the generation this answer was read at, never by
    // re-reading it.
    this.armPlanningTargetReadinessWake(deferredNodeIds,
      nodePlan.planningPublicationGeneration);
    return new Set([
      ...nodePlan.availableNodes.map((node) => node.node_id),
      ...deferredNodeIds,
    ]);
  }

  getHealthyReplicas(replicas) {
    // services.status is NOT NULL: a row without one is not ACTIVE.
    const activeReplicas = replicas.filter(
      (replica) => replica.status === ReplicaStatus.ACTIVE,
    );

    // Align critical-partition health semantics with coordinator safety checks:
    // consider only routable non-learner replicas on ready nodes as healthy.
    if (!this.isSystemPartitionEntity()) {
      return activeReplicas;
    }

    const readyNodeIds = this.resolveNotUnhealthyNodeIds();

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
    const activeReplicas = replicas.filter(
      (replica) => replica.status === ReplicaStatus.ACTIVE,
    );
    if (!this.isSystemPartitionEntity()) {
      return activeReplicas;
    }
    const readyNodeIds = this.resolveNotUnhealthyNodeIds();
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

  calculateMoves(currentReplicas, targetState, planningContext) {
    return this.movePlanner.calculateMoves(
      currentReplicas,
      targetState,
      planningContext,
    );
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
