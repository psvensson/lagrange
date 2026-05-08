import {UnifiedRebalancerSegment3} from './unified-rebalancer-segment-3.js';
import {UNIFIED_REBALANCER_SEGMENT_4_STAGE_SHARED as SHARED} from './unified-rebalancer-segment-4-stage-shared.js';

const {
  CONTROL_PLANE_WORKLOAD_CLASS,
  MoveType,
  NUM,
  OperationType,
  PRESSURE_WORK_CLASS,
  PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY,
  PRIORITY_RECOVERY_FOLLOW_UP_DECISION,
  PRIORITY_RECOVERY_FOLLOW_UP_FIELD,
  PRIORITY_RECOVERY_FOLLOW_UP_REQUIREMENT_SEMANTIC_STATES,
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE,
  PRIORITY_TOPOLOGY_CLEANUP_MOVE_REASON_SET,
  RAFT_ROLE,
  REBALANCER_BUDGET_READ_OPTIONS,
  REBALANCER_CONFIG_KEY,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaStatus,
  SQL_BUDGET,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  UNIFIED_REBALANCER_LITERAL,
  buildControlPlaneWorkloadProfile,
} = SHARED;

class UnifiedRebalancerSegment4Stage1 extends UnifiedRebalancerSegment3 {
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
    if (!Array.isArray(moves) || moves.length === NUM.ZERO) {
      return false;
    }
    return moves.some(
      (move) => move?.type === MoveType.ADD || move?.type === MoveType.REPLACE,
    );
  }

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

  normalizePriorityRecoveryCoordinatorDecisionStateValue(value) {
    const normalizedValue = String(
      value || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).trim();
    return normalizedValue.length > NUM.ZERO ?
      normalizedValue :
      PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE;
  }

  isPriorityRecoveryCoordinatorDecisionStatePresent(value) {
    const normalizedValue =
      this.normalizePriorityRecoveryCoordinatorDecisionStateValue(value);
    return (
      normalizedValue !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.NONE &&
      normalizedValue !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.UNAVAILABLE
    );
  }

  hasPriorityRecoveryCoordinatorDecisionOperationVisibility(
    decisionSnapshot = null,
  ) {
    const observation =
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.OBSERVATION] || {};
    const conditions =
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.CONDITIONS] || {};
    const visibilityCandidates = Object.freeze([
      decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.AUTHORITATIVE_VISIBILITY_STATE
      ],
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.VISIBILITY_STATE],
      observation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.VISIBILITY_STATE],
    ]);
    const workflowCandidates = Object.freeze([
      decisionSnapshot?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.WORKFLOW_STATE],
      observation?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.WORKFLOW_STATE],
    ]);
    const latestOperationStatusCandidates = Object.freeze([
      decisionSnapshot?.[
        PRIORITY_RECOVERY_FOLLOW_UP_FIELD.LATEST_OPERATION_STATUS
      ],
      conditions?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.LATEST_OPERATION_STATUS],
    ]);
    const hasVisibilityEvidence = visibilityCandidates.some((candidate) =>
      this.isPriorityRecoveryCoordinatorDecisionStatePresent(candidate),
    );
    const hasWorkflowEvidence = workflowCandidates.some((candidate) =>
      this.isPriorityRecoveryCoordinatorDecisionStatePresent(candidate),
    );
    const hasLatestOperationStatusEvidence =
      latestOperationStatusCandidates.some((candidate) =>
        this.isPriorityRecoveryCoordinatorDecisionStatePresent(candidate),
      );
    return (
      hasVisibilityEvidence ||
      hasWorkflowEvidence ||
      hasLatestOperationStatusEvidence
    );
  }

  shouldPreferPlanningPriorityRecoveryOperationCreation({
    coordinatorDecisionSnapshot = null,
    planningDecisionSnapshot = null,
  } = {}) {
    const planningOperationRequired =
      this.isPriorityRecoveryFollowUpOperationRequired(planningDecisionSnapshot);
    const coordinatorOperationRequired =
      this.isPriorityRecoveryFollowUpOperationRequired(
        coordinatorDecisionSnapshot,
      );
    const coordinatorOperationVisible =
      this.hasPriorityRecoveryCoordinatorDecisionOperationVisibility(
        coordinatorDecisionSnapshot,
      );
    const evidence = Object.freeze({
      planningOperationRequired,
      coordinatorOperationRequired,
      coordinatorOperationVisible,
    });
    const shouldUsePlanning =
      evidence.planningOperationRequired === true &&
      evidence.coordinatorOperationRequired !== true &&
      evidence.coordinatorOperationVisible !== true;
    return shouldUsePlanning;
  }

  async getCurrentPriorityRecoveryCoordinatorDecisionSnapshot() {
    if (!this.isControlPlanePriorityPartition()) {
      return null;
    }
    const workflowOwner = this.rebalanceCoordinator?.workflowOwner || null;
    if (
      !workflowOwner ||
      typeof workflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    const decisionSnapshot =
      await workflowOwner.getPriorityRecoveryDecisionSnapshotForPartitionOperations(
        this.entityId,
        [],
      );
    return decisionSnapshot && typeof decisionSnapshot === TYPEOF.OBJECT ?
      decisionSnapshot :
      null;
  }

  async getCurrentPriorityRecoveryFollowUpDecisionSnapshot() {
    if (!this.isControlPlanePriorityPartition()) {
      return null;
    }
    const planningSnapshot = await this.getPriorityRecoveryPlanningSnapshot({
      partitionId: this.entityId,
    });
    const coordinatorDecisionSnapshot =
      await this.getCurrentPriorityRecoveryCoordinatorDecisionSnapshot();
    const planningDecisionSnapshot =
      this.resolvePriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {partitionId: this.entityId},
      ) || null;
    if (coordinatorDecisionSnapshot) {
      if (
        this.shouldPreferPlanningPriorityRecoveryOperationCreation({
          coordinatorDecisionSnapshot,
          planningDecisionSnapshot,
        })
      ) {
        return Object.freeze({
          planningSnapshot,
          decisionSnapshot: planningDecisionSnapshot,
        });
      }
      return Object.freeze({
        planningSnapshot,
        decisionSnapshot: coordinatorDecisionSnapshot,
      });
    }
    if (!planningDecisionSnapshot) {
      return null;
    }
    return Object.freeze({
      planningSnapshot,
      decisionSnapshot: planningDecisionSnapshot,
    });
  }

  buildPriorityRecoverySurrogateFollowUpDecision(
    planningSnapshot = null,
  ) {
    const followUpDecision =
      this.buildPriorityRecoverySurrogateFollowUpDecisions(planningSnapshot)[
        NUM.ZERO
      ];
    if (followUpDecision) {
      return followUpDecision;
    }
    const decisionSnapshot =
      this.buildPriorityRecoverySurrogateDecisionFromPlanning(planningSnapshot);
    return decisionSnapshot ?
      Object.freeze({
        planningSnapshot,
        decisionSnapshot,
      }) :
      null;
  }

  buildPriorityRecoverySurrogateFollowUpDecisionRecord(
    planningSnapshot = null,
    decisionSnapshot = null,
  ) {
    return Object.freeze({
      planningSnapshot,
      decisionSnapshot,
    });
  }

  appendPriorityRecoverySurrogateFollowUpDecision(
    followUpDecisions,
    followUpPartitionIds,
    planningSnapshot,
    decisionSnapshot,
  ) {
    if (
      !this.isPriorityRecoveryFollowUpOperationRequired(decisionSnapshot)
    ) {
      return false;
    }
    const partitionId =
      this.resolvePriorityRecoveryFollowUpPartitionId(decisionSnapshot);
    if (
      partitionId.length === NUM.ZERO ||
      followUpPartitionIds.has(partitionId)
    ) {
      return true;
    }
    followUpPartitionIds.add(partitionId);
    followUpDecisions.push(
      this.buildPriorityRecoverySurrogateFollowUpDecisionRecord(
        planningSnapshot,
        decisionSnapshot,
      ),
    );
    return true;
  }

  buildPriorityRecoverySurrogateFollowUpDecisions(
    planningSnapshot = null,
  ) {
    if (!this.isControlPlanePriorityPartition()) {
      return Object.freeze([]);
    }
    const followUpDecisions = [];
    const followUpPartitionIds = new Set();
    let skippedSettledCandidate = false;
    const addFollowUpDecision = (decisionSnapshot) => {
      const appended =
        this.appendPriorityRecoverySurrogateFollowUpDecision(
          followUpDecisions,
          followUpPartitionIds,
          planningSnapshot,
          decisionSnapshot,
        );
      if (appended !== true) {
        if (decisionSnapshot) {
          skippedSettledCandidate = true;
        }
      }
    };
    const closureWitnessPartitionId =
      this.resolvePriorityRecoveryClosureWitnessFollowUpPartitionId(
        planningSnapshot,
      );
    const resolveDecisionSnapshotForPartitionId = (partitionId) => {
      const normalizedPartitionId = String(
        partitionId || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (normalizedPartitionId.length === NUM.ZERO) {
        return null;
      }
      return this.resolvePriorityRecoveryFollowUpDecisionSnapshotFromPlanning(
        planningSnapshot,
        {partitionId: normalizedPartitionId},
      );
    };
    const closureWitnessDecisionSnapshot =
      resolveDecisionSnapshotForPartitionId(closureWitnessPartitionId);
    addFollowUpDecision(closureWitnessDecisionSnapshot);
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary ||
      planningSnapshot?.publicationRecoveryGate?.priorityPartitionSummary ||
      null;
    const candidatePartitionIds = Array.isArray(
      planningSnapshot?.priorityRecoveryDecisionSnapshots?.snapshots,
    ) ?
      planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots
        .map((snapshot) =>
          this.resolvePriorityRecoveryFollowUpPartitionId(snapshot),
        )
        .filter(
          (partitionId) =>
            partitionId.length > NUM.ZERO && partitionId !== this.entityId,
        ) :
      [];
    for (const partitionId of candidatePartitionIds) {
      const decisionSnapshot =
        resolveDecisionSnapshotForPartitionId(partitionId);
      addFollowUpDecision(decisionSnapshot);
    }
    const blockedPartitions = Array.isArray(
      priorityPartitionSummary?.blockedPartitions,
    ) ?
      priorityPartitionSummary.blockedPartitions :
      [];
    for (const blockedPartition of blockedPartitions) {
      const blockedPartitionId = String(
        blockedPartition?.[PRIORITY_RECOVERY_FOLLOW_UP_FIELD.PARTITION_ID] ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).trim();
      if (
        blockedPartitionId.length === NUM.ZERO ||
        blockedPartitionId === this.entityId
      ) {
        continue;
      }
      const decisionSnapshot =
        resolveDecisionSnapshotForPartitionId(blockedPartitionId);
      addFollowUpDecision(decisionSnapshot);
    }
    const fallbackDecision =
      this.buildPriorityRecoverySurrogateDecisionFromPlanning(planningSnapshot);
    addFollowUpDecision(fallbackDecision);
    return skippedSettledCandidate === true ?
      Object.freeze(followUpDecisions) :
      Object.freeze(followUpDecisions.slice(NUM.ZERO, NUM.ONE));
  }

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

  resolvePriorityRecoveryClosureWitnessFollowUpPartitionId(
    planningSnapshot = null,
  ) {
    const closureWitnessEvidence =
      this.buildPriorityRecoveryClosureWitnessFollowUpEvidence(planningSnapshot);
    return this.selectPriorityRecoveryClosureWitnessFollowUpPartitionId(
      closureWitnessEvidence,
    );
  }

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
    const rankedRawCandidatePartitionIds =
      this.rankPriorityRecoveryClosureWitnessFollowUpPartitionIds(
        planningSnapshot,
        rawCandidatePartitionIds,
      );
    const candidatePartitionIds = rankedRawCandidatePartitionIds
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
        rankedRawCandidatePartitionIds,
      candidatePartitionIds: Object.freeze(candidatePartitionIds),
      hasRawCandidate: rawCandidatePartitionIds.length > NUM.ZERO,
      hasUnblockedCandidate: candidatePartitionIds.length > NUM.ZERO,
      topologyBlockingPartitionIds,
    });
  }

  normalizePriorityRecoveryClosureWitnessFollowUpSpreadGap(
    spreadGap = undefined,
  ) {
    const normalizedSpreadGap = Number(spreadGap);
    return Number.isFinite(normalizedSpreadGap) ?
      normalizedSpreadGap :
      PRIORITY_RECOVERY_CLOSURE_WITNESS_FOLLOW_UP_PRIORITY
        .SPREAD_GAP_UNAVAILABLE;
  }
}

export {UnifiedRebalancerSegment4Stage1};
