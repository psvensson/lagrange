/**
 * Move Planner - Calculates replica placement and moves for rebalancing.
 *
 * This module provides move planning logic extracted from UnifiedRebalancer.
 * It calculates target replica state and the moves needed to reach that
 * state for partitions, message groups, and runtime services.
 *
 * Requirements: 1.3, 1.8, 5.1, 5.2, 5.3, 5.4, 5.5, 11.3
 *
 * @module rebalancer/move-planner
 */

import {LoggingService} from '../logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  getPartitionRowFromCache,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
} from '../bootstrap/system-partition-classification.js';
import {NUM, WORKFLOW_STEP} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  PARTITION_DESCRIPTOR_EPOCH_DECISION,
  PARTITION_DESCRIPTOR_EPOCH_REASON,
} from '../partition/partition-constants.js';
import {
  buildPartitionDescriptorEpochDecision,
} from '../partition/partition-descriptor-epoch-contract.js';
import {ADJUST_DIRECTION, ReplicaStatus} from './replica-status.js';
import {
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
  isOddReplicaCount,
} from './odd-replica-count.js';
import {
  computeInFlightAwareReplicaAccounting,
} from './in-flight-aware-replica-count.js';
import {
  MOVE_REASON,
  PLACEMENT_DEGRADED_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
  MOVE_PLANNER_ERROR_MSG,
  REBALANCER_SUBSYSTEM,
} from './rebalancer-constants.js';
import {
  ADMISSION_DECISION,
  ADMISSION_REASON,
  MOVE_CRITICALITY,
  PRESSURE_BEHAVIOR_DECISION,
  STORAGE_CAPACITY_ERROR_MSG,
  STORAGE_CAPACITY_LOG_MSG,
} from './storage-capacity-constants.js';
import {createMovePlannerStateMethods} from './move-planner-state-methods.js';
import {
  PLACEMENT_OWNER_POLICY,
  buildPlacementOwnerTargetOutcome,
} from './topology-owner-constants.js';
import {
  PLACEMENT_OWNER_SCORE_PROFILE,
} from './placement-owner-constants.js';
import {
  buildPlacementOwnerDecision as buildPlacementOwnerPolicyDecision,
} from './placement-owner-decision.js';
const MOVE_PLANNER_LITERAL = Object.freeze({
  MOVEPLANNER_REQUIRES_ENTITYID: 'MovePlanner requires entityId',
  MOVEPLANNER_REQUIRES_ENTITYTYPE: 'MovePlanner requires entityType',
  MOVEPLANNER_REQUIRES_MOVESTATEPROVIDER:
    'MovePlanner requires moveStateProvider',
  FUNCTION: 'function',
  OBJECT: 'object',
  STRING: 'string',
  EMPTY_STRING: '',
  NODES_WITHOUT_LOCAL_REPLICA: 'nodes_without_local_replica: ',
  EMPTY: ', ',
  CONTROL_PLANE_REPLICAS_NOT_SPREAD: 'control_plane_replicas_not_spread: ',
  UNKNOWN: 'unknown',
});
const EntityType = REBALANCER_ENTITY_TYPE;
const MoveType = REBALANCER_MOVE_TYPE;
const DegradedReason = PLACEMENT_DEGRADED_REASON;
const PLACEMENT_OCCUPIED_STATUSES = new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.SYNCING,
  ReplicaStatus.ACTIVE,
]);


const CAPACITY_REJECTION_REASON = Object.freeze({
  ADMISSION_ERROR: 'admission_error',
});
function classifyCapacityAdmissionError(err) {
  const message = err?.message;
  if (
    message === STORAGE_CAPACITY_ERROR_MSG.ACCOUNTING_SOURCE_REQUIRED ||
    message === MOVE_PLANNER_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED ||
    message === MOVE_PLANNER_ERROR_MSG.STORAGE_ACCOUNTING_ESTIMATE_REQUIRED
  ) {
    return ADMISSION_REASON.CAPACITY_ACCOUNTING_UNAVAILABLE;
  }
  return CAPACITY_REJECTION_REASON.ADMISSION_ERROR;
}
function hasCapacityAccountingUnavailableRejection(diagnostics) {
  return (
    (
      diagnostics?.rejectionsByReason?.[
        ADMISSION_REASON.CAPACITY_ACCOUNTING_UNAVAILABLE
      ] || NUM.ZERO
    ) > NUM.ZERO
  );
}
const MOVE_PLANNER_REBALANCE_REASON = Object.freeze({
  REPLICA_COUNT_BELOW_TARGET: 'replica_count_below_target',
  REPLICA_COUNT_ABOVE_TARGET: 'replica_count_above_target',
  REPLICAS_NOT_SPREAD: 'replicas_not_spread',
  NODES_WITHOUT_LOCAL_REPLICA: 'nodes_without_local_replica',
});
const MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT = NUM.FIVE;
const MOVE_PLANNER_DESCRIPTOR_EPOCH_DIAGNOSTIC = Object.freeze({
  REJECTED: 'partition_descriptor_epoch_rejected',
});
function buildReplicaCountPolicyDecision(options = {}) {
  const healthyReplicaCount = Number(options.healthyReplicaCount) || NUM.ZERO;
  const actionableTarget = Number(options.actionableTarget) || NUM.ZERO;
  const targetCount = Number(options.targetCount) || NUM.ZERO;
  let needsRebalancing = false;
  let reason = null;
  if (healthyReplicaCount < actionableTarget) {
    needsRebalancing = true;
    reason = MOVE_PLANNER_REBALANCE_REASON.REPLICA_COUNT_BELOW_TARGET;
  } else if (healthyReplicaCount > targetCount) {
    needsRebalancing = true;
    reason = MOVE_PLANNER_REBALANCE_REASON.REPLICA_COUNT_ABOVE_TARGET;
  }
  return {
    needsRebalancing,
    reason,
  };
}
function applyAdditionalRebalancingReason(decision, shouldRebalance, reason) {
  if (!shouldRebalance) {
    return decision;
  }
  return {
    ...decision,
    needsRebalancing: true,
    reason: decision.reason || reason,
  };
}
function buildMessageGroupPlacementResult(options = {}) {
  const targetReplicaCount = Number(options.targetReplicaCount) || NUM.ZERO;
  const targetNodes = Array.isArray(options.targetNodes) ?
    options.targetNodes :
    [];
  return {
    targetReplicaCount,
    targetNodes,
    maxReplicaCount:
      options.maxReplicaCount ||
      MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT,
    degraded: targetNodes.length < targetReplicaCount,
    degradedReason: options.degradedReason,
    availableNodeCount: Number(options.availableNodeCount) || NUM.ZERO,
    capacityDiagnostics: options.capacityDiagnostics,
    placementOwnerOutcome:
      options.placementOwnerOutcome || buildPlacementOwnerTargetOutcome(),
    topologyTransitionSnapshot: options.topologyTransitionSnapshot || null,
  };
}

const MOVE_PLANNER_STATE_METHODS = createMovePlannerStateMethods({
  ADJUST_DIRECTION,
  EntityType,
  MOVE_PLANNER_LITERAL,
  MOVE_PLANNER_REBALANCE_REASON,
  NUM,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  WORKFLOW_STEP,
  adjustToOddCount,
  applyAdditionalRebalancingReason,
  buildPartitionDescriptorEpochDecision,
  buildReplicaCountPolicyDecision,
  getNextOddCount,
  getPartitionRowFromCache,
  getPreviousOddCount,
  isOddReplicaCount,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
});

/**
 * MovePlanner calculates replica placement and moves for partitions,
 * message groups, and runtime services.
 *
 * This class is responsible for:
 * - Calculating target replica state based on policy
 * - Filtering infeasible nodes by storage capacity before scoring
 * - Determining optimal node placement for replicas
 * - Calculating the moves needed to reach target state
 * - Sorting nodes by load and suitability
 *
 * Requirements: 1.3, 1.8, 5.1, 5.2, 5.3, 5.4, 5.5, 11.3
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {string} options.entityId - Entity ID (partition, message
 *   group, or service definition ID)
 * @param {string} options.entityType - 'partition', 'message_group',
 *   or 'runtime_service'
 * @param {Object} options.moveStateProvider - Provider for state access
 * @param {Object} [options.storageAdmissionService] - Admission gate
 * @param {Object} [options.accountingService] - Capacity accounting
 * @param {Object} [options.storagePressureBehavior] - Pressure behavior
 */

class MovePlannerMoveCalculationMethods {
  /**
   * Calculate moves needed to reach target state.
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} targetState - Target state.
   * @return {Array<Object>} Array of move operations.
   */
  calculateMoves(currentReplicas, targetState) {
    const moves = [];
    const healthyReplicas =
      this.moveStateProvider.getHealthyReplicas(currentReplicas);
    const isTopologyCleanupReason = (reason) => {
      return (
        reason === MOVE_REASON.NODE_NOT_IN_TARGET ||
        reason === MOVE_REASON.SPREAD_REPLICAS
      );
    };
    const buildPriorityStandaloneRemoveSafety = (replicaId) => {
      if (!this.isControlPlanePriorityPartition()) {
        return {
          priorityPartition: false,
          safe: true,
          spread: null,
        };
      }
      const remainingActiveReplicas = activePlacementReplicas.filter(
        (candidate) => {
          const candidateReplicaId =
            candidate?.replica_id || candidate?.service_id;
          return candidateReplicaId !== replicaId;
        },
      );
      const spread = this.analyzePrioritySpread(
        remainingActiveReplicas,
        prioritySpreadPolicy,
        this.moveStateProvider.getAvailableNodes(),
      );
      return {
        priorityPartition: true,
        safe: !(spread.requiresSpread === true && spread.satisfied !== true),
        spread,
      };
    };
    const toExecutableRemove = (move) => {
      const {
        prioritySpreadStandaloneSafe: _prioritySpreadStandaloneSafe,
        sourceIsLeader: _sourceIsLeader,
        ...executableMove
      } = move;
      return executableMove;
    };
    const prioritySpreadPolicy = {
      placementConstraints: {
        spreadAcrossNodes: true,
      },
    };
    const placementReplicas = currentReplicas.filter((replica) => {
      const status =
        typeof replica?.status === 'string' ?
          replica.status.toLowerCase() :
          ReplicaStatus.ACTIVE;
      return !!replica?.node_id && PLACEMENT_OCCUPIED_STATUSES.has(status);
    });
    const activePlacementReplicas = currentReplicas.filter((replica) => {
      const status = replica?.status || ReplicaStatus.ACTIVE;
      return status === ReplicaStatus.ACTIVE && !!replica?.node_id;
    });
    const targetNodeIds = targetState.targetNodes;
    const isDegradedPlacement = !!targetState?.degraded;
    const transitionSnapshot = this.buildTopologyTransitionSnapshot();
    const nodesWithAddTransitional =
      transitionSnapshot.nodesWithEntityAddTransitional;
    const nodesWithGlobalSystemAddTransitional =
      transitionSnapshot.nodesWithGlobalSystemAddTransitional;
    const replicasInRemoving = transitionSnapshot.replicasInRemoving;
    const terminalFailedReplaceTargetReplicaIds =
      this.getTerminalFailedReplaceTargetReplicaIds();
    const scheduledRemoveReplicaIds = new Set();
    const pendingCount = transitionSnapshot.pendingCount;
    if (pendingCount > NUM.ZERO) {
      // Operation lifecycle is owned by replica_operations. Service-row status
      // can be stale (for example bootstrap-local syncing followers), so we only
      // treat in-flight operations as authoritative transitional state for
      // topology-increasing work. Cleanup-only removals may still proceed when
      // the entity is already above target.
      if (!this.isControlPlanePriorityPartition()) {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_PENDING, {
          entityId: this.entityId,
          pendingCount,
          cleanupOnly: true,
        });
      } else {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_PENDING, {
          entityId: this.entityId,
          pendingCount,
          bypassedForPriorityRecovery: true,
        });
      }
    }
    const cleanupOnlyWhilePending =
      pendingCount > NUM.ZERO && !this.isControlPlanePriorityPartition();

    // Count target replicas per node
    const targetCounts = new Map();
    for (const nodeId of targetNodeIds) {
      targetCounts.set(
        nodeId,
        (targetCounts.get(nodeId) || NUM.ZERO) + NUM.ONE,
      );
    }

    // Count current replicas per node
    const currentCounts = new Map();
    for (const replica of placementReplicas) {
      if (replica && replica.node_id) {
        currentCounts.set(
          replica.node_id,
          (currentCounts.get(replica.node_id) || NUM.ZERO) + NUM.ONE,
        );
      }
    }

    // Handle failed/inactive replicas - always remove them
    for (const replica of currentReplicas) {
      const status = replica.status || ReplicaStatus.ACTIVE;
      const replicaId = replica.replica_id || replica.service_id;
      if (this.moveStateProvider.hasPendingMove(replicaId)) {
        continue;
      }
      if (replicasInRemoving.has(replicaId)) {
        this.logger.debug(REBALANCER_LOG_MSG.SKIP_REMOVE_REMOVING, {
          entityId: this.entityId,
          replicaId,
        });
        continue;
      }
      if (
        status === ReplicaStatus.FAILED ||
        terminalFailedReplaceTargetReplicaIds.has(replicaId)
      ) {
        if (scheduledRemoveReplicaIds.has(replicaId)) {
          continue;
        }
        scheduledRemoveReplicaIds.add(replicaId);
        moves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: replica.node_id,
          reason: MOVE_REASON.REPLICA_FAILED,
        });
      }
    }

    // Leadership-aware removal source preference (rolling-restart settle-time
    // lever). Removing a partition's raft LEADER forces a leadership move, and
    // when the leader is chosen as a REPLACE *source* it wedges the CL-043
    // WAIT_REPLACEMENT_LEADER_OWNERSHIP gate. When surplus drain has a choice of
    // removal source, prefer a non-leader replica so draining does not force a
    // leadership move. This never changes WHICH replicas are removed (the
    // surplus set is fixed by targetNodes) — only whether the leader is drained
    // as a REPLACE source vs a plain REMOVE, and which same-node replica drops.
    const partitionLeaderNodeId = this.resolveRemovalSourcePartitionLeaderNodeId();
    const isLeaderRemovalCandidate = (replica) => {
      if (!replica) {
        return false;
      }
      const role =
        typeof replica.raft_role === 'string' ?
          replica.raft_role.trim().toLowerCase() :
          null;
      if (role === RAFT_ROLE.LEADER) {
        return true;
      }
      const candidateNodeId = replica.node_id || replica.nodeId || null;
      return (
        !!partitionLeaderNodeId &&
        !!candidateNodeId &&
        candidateNodeId === partitionLeaderNodeId
      );
    };

    // Group active placement replicas by node for removal selection
    const replicasByNode = new Map();
    for (const replica of activePlacementReplicas) {
      if (replica && replica.node_id) {
        if (!replicasByNode.has(replica.node_id)) {
          replicasByNode.set(replica.node_id, []);
        }
        replicasByNode.get(replica.node_id).push(replica);
      }
    }
    // Within each node, drain non-leader replicas before the leader (stable —
    // preserves the prior order among same-leadership replicas).
    for (const replicas of replicasByNode.values()) {
      replicas.sort(
        (left, right) =>
          (isLeaderRemovalCandidate(left) ? NUM.ONE : NUM.ZERO) -
          (isLeaderRemovalCandidate(right) ? NUM.ONE : NUM.ZERO),
      );
    }

    // Generate ADD moves for under-represented nodes FIRST
    const addMoves = [];
    const replaceMoves = [];
    if (!cleanupOnlyWhilePending) {
      for (const [nodeId, targetCount] of targetCounts) {
        if (this.moveStateProvider.hasPendingAddForNode(nodeId)) {
          continue;
        }
        if (nodesWithAddTransitional.has(nodeId)) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_ADD_TRANSITIONAL, {
            entityId: this.entityId,
            nodeId,
          });
          continue;
        }
        if (nodesWithGlobalSystemAddTransitional.has(nodeId)) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_ADD_TRANSITIONAL, {
            entityId: this.entityId,
            nodeId,
            globalSystemTargetOccupancy: true,
          });
          continue;
        }
        const currentCount = currentCounts.get(nodeId) || NUM.ZERO;
        const needed = targetCount - currentCount;
        for (let i = NUM.ZERO; i < needed; i++) {
          addMoves.push({
            type: MoveType.ADD,
            nodeId,
            reason: MOVE_REASON.INCREASE_REPLICA_COUNT,
          });
        }
      }
    }
    const targetReplicaCount = targetState.targetReplicaCount;
    // Single-owner in-flight-aware replica accounting for this partition: the
    // one join of committed rows with in-flight operations. Every over-target /
    // deficit decision below derives its threshold from this breakdown so the
    // count invariant has one author instead of several disagreeing ones (rows
    // lag in-flight creation, which is what caused the over-replication stall).
    const inFlightAccounting = computeInFlightAwareReplicaAccounting({
      currentReplicas,
      inFlightOperations: this.getEntityTopologyBlockingInFlightOperations(),
      partitionId: this.entityId,
    });
    // In-flight-aware over-creation cap (priority control-plane partitions).
    // Stop minting new replacements only once a SURPLUS of committed voters
    // already exists (activeCount > target): that is the over-creation pile-up
    // state observed in the gate — prior replacements promoted to voters but
    // their sources have not drained (blocked on voter-ready spread), and with
    // the pending-operation bypass above the planner keeps hopping to fresh
    // target nodes and re-creating, driving the partition further over target
    // until learner promotion dead-locks (replica-count-limit) and convergence
    // times out. At or under target the first concurrent spread-restoration
    // batch and provisioning fan-out are legitimate (they transiently exceed
    // target by design as sources drain), so they are untouched; only the
    // surplus that has not drained must stop growing so existing voters settle.
    if (
      !cleanupOnlyWhilePending &&
      addMoves.length > NUM.ZERO &&
      this.isControlPlanePriorityPartition() &&
      inFlightAccounting.activeCount > targetReplicaCount
    ) {
      this.logger.info(REBALANCER_LOG_MSG.DEFER_ADD_OVER_TARGET, {
        entityId: this.entityId,
        targetReplicaCount,
        activeCount: inFlightAccounting.activeCount,
        creationEffectiveCount: inFlightAccounting.creationEffectiveCount,
        inFlightReplaceInCreationCount:
          inFlightAccounting.inFlightReplaceInCreationCount,
        inFlightAddCount: inFlightAccounting.inFlightAddCount,
        deferredAdds: addMoves.length,
        overCreationCap: true,
      });
      addMoves.length = NUM.ZERO;
    }
    const shouldDeferAddsInDegraded =
      isDegradedPlacement &&
      activePlacementReplicas.length >= targetReplicaCount &&
      addMoves.length > NUM.ZERO;
    const totalHealthyAfterAdds =
      activePlacementReplicas.length + addMoves.length;
    const candidateRemoves = [];

    // Generate REMOVE moves for over-represented nodes
    for (const [nodeId, replicas] of replicasByNode) {
      const targetCount = targetCounts.get(nodeId) || NUM.ZERO;
      const currentCount = replicas.length;
      const excess = currentCount - targetCount;
      for (let i = NUM.ZERO; i < excess; i++) {
        const replicaToRemove = replicas[i];
        const replicaId =
          replicaToRemove.replica_id || replicaToRemove.service_id;
        if (scheduledRemoveReplicaIds.has(replicaId)) {
          continue;
        }
        if (this.moveStateProvider.hasPendingMove(replicaId)) {
          continue;
        }
        if (replicasInRemoving.has(replicaId)) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_REMOVE_REMOVING, {
            entityId: this.entityId,
            replicaId,
          });
          continue;
        }
        const reason =
          targetCount === NUM.ZERO ?
            MOVE_REASON.NODE_NOT_IN_TARGET :
            MOVE_REASON.SPREAD_REPLICAS;
        if (cleanupOnlyWhilePending && isTopologyCleanupReason(reason)) {
          const existingCleanupRemoves = candidateRemoves.filter((move) =>
            isTopologyCleanupReason(move.reason),
          ).length;
          if (
            activePlacementReplicas.length - existingCleanupRemoves <=
            targetReplicaCount
          ) {
            this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
              entityId: this.entityId,
              replicaId,
              nodeId,
              reason,
              cleanupOnlyWhilePending: true,
              activePlacementReplicaCount: activePlacementReplicas.length,
              existingCleanupRemoves,
              targetReplicaCount,
            });
            continue;
          }
        }
        if (isDegradedPlacement && !shouldDeferAddsInDegraded) {
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
            entityId: this.entityId,
            replicaId,
            nodeId,
            reason,
            degraded: true,
            availableNodeCount: targetState.availableNodeCount || NUM.ZERO,
            targetReplicaCount,
          });
          continue;
        }
        const priorityRemoveSafety = isTopologyCleanupReason(reason) ?
          buildPriorityStandaloneRemoveSafety(replicaId) :
          {priorityPartition: false, safe: true, spread: null};
        if (
          priorityRemoveSafety.priorityPartition &&
          priorityRemoveSafety.safe !== true &&
          addMoves.length === NUM.ZERO
        ) {
          const prioritySpreadAfterRemove = priorityRemoveSafety.spread;
          if (prioritySpreadAfterRemove) {
            this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
              entityId: this.entityId,
              replicaId,
              nodeId,
              reason,
              requiredDistinctNodeCount:
                prioritySpreadAfterRemove.requiredDistinctNodeCount,
              remainingDistinctNodeCount:
                prioritySpreadAfterRemove.actualDistinctNodeCount,
            });
          }
          continue;
        }
        if (reason === MOVE_REASON.SPREAD_REPLICAS) {
          const existingRemoves = candidateRemoves.filter(
            (m) => m.reason === MOVE_REASON.SPREAD_REPLICAS,
          ).length;
          if (totalHealthyAfterAdds - existingRemoves <= targetReplicaCount) {
            this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, {
              entityId: this.entityId,
              replicaId,
              nodeId,
              totalHealthyAfterAdds,
              existingRemoves,
              targetReplicaCount,
            });
            continue;
          }
        }
        candidateRemoves.push({
          type: MoveType.REMOVE,
          replicaId,
          nodeId: nodeId,
          reason,
          sourceIsLeader: isLeaderRemovalCandidate(replicaToRemove),
          prioritySpreadStandaloneSafe: priorityRemoveSafety.safe,
          standaloneSafe:
            activePlacementReplicas.length - candidateRemoves.length >
            targetReplicaCount,
        });
        scheduledRemoveReplicaIds.add(replicaId);
      }
    }
    const canUseDegradedReplace =
      isDegradedPlacement &&
      shouldDeferAddsInDegraded &&
      candidateRemoves.length > NUM.ZERO;
    if (shouldDeferAddsInDegraded && !canUseDegradedReplace) {
      this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
        entityId: this.entityId,
        healthyReplicaCount: healthyReplicas.length,
        activePlacementReplicaCount: activePlacementReplicas.length,
        targetReplicaCount,
        deferredAddCount: addMoves.length,
        availableNodeCount: targetState.availableNodeCount || NUM.ZERO,
      });
      addMoves.length = NUM.ZERO;
    }
    if (
      addMoves.length > NUM.ZERO &&
      candidateRemoves.length > NUM.ZERO &&
      (!isDegradedPlacement || canUseDegradedReplace)
    ) {
      const replaceCandidates = candidateRemoves.filter((move) => {
        return (
          move.reason === MOVE_REASON.NODE_NOT_IN_TARGET ||
          move.reason === MOVE_REASON.SPREAD_REPLICAS
        );
      });
      // Prefer non-leader sources for REPLACE (stable). A leader that must drain
      // then falls past replaceCount into a plain REMOVE (normal re-election)
      // instead of becoming a REPLACE source that wedges on replacement-leader
      // ownership (CL-043). The removed-replica set is unchanged either way.
      replaceCandidates.sort(
        (left, right) =>
          (left.sourceIsLeader ? NUM.ONE : NUM.ZERO) -
          (right.sourceIsLeader ? NUM.ONE : NUM.ZERO),
      );
      const naturalReplaceCount = Math.min(
        addMoves.length,
        replaceCandidates.length,
      );
      // Serialize REPLACE on critical control-plane partitions to one in-flight
      // at a time. The per-partition remove-safety lock (the concurrent-op check
      // in operation-workflow-remove-safety-evaluator) already lets only ONE
      // reconfiguration drain at a time on a critical partition; minting more
      // REPLACEs — each a distinct source/target accumulated across ticks because
      // a row-only surplus read does not see prior in-flight REPLACEs — only
      // builds a mutual-defer standoff (observed: 4 concurrent REPLACEs on one
      // critical partition thrashing ~114s, holding it over target until
      // convergence times out). Bound minting by the all-phase in-flight REPLACE
      // count (creation AND drain) so a fresh REPLACE waits for the prior one to
      // drain, then re-evaluates next tick. The drain phase (replacement
      // voter-ready, source removing) is the long window that builds the standoff
      // and is EXCLUDED from the topology-blocking accounting set, so the count is
      // read from getEntityInFlightOperations (all non-terminal, drain-inclusive),
      // NOT inFlightAccounting (drain-excluded). Non-critical partitions and
      // genuine provisioning (count-increasing ADD) are untouched.
      const serializeCriticalReplace = this.isControlPlanePriorityPartition();
      const inFlightReplaceCount = serializeCriticalReplace ?
        this.getEntityInFlightOperations().filter(
          (operation) =>
            String(
              operation?.type ||
                operation?.operation_type ||
                operation?.operationType ||
                '',
            ).toLowerCase() === MoveType.REPLACE,
        ).length :
        NUM.ZERO;
      const replaceCount = serializeCriticalReplace ?
        Math.min(
          naturalReplaceCount,
          Math.max(NUM.ZERO, NUM.ONE - inFlightReplaceCount),
        ) :
        naturalReplaceCount;
      const consumedRemoveReplicaIds = new Set();
      for (let i = NUM.ZERO; i < replaceCount; i++) {
        const addMove = addMoves.shift();
        const removeMove = replaceCandidates[i];
        consumedRemoveReplicaIds.add(removeMove.replicaId);
        replaceMoves.push({
          type: MoveType.REPLACE,
          nodeId: addMove.nodeId,
          sourceNodeId: removeMove.nodeId,
          replicaId: removeMove.replicaId,
          reason: MOVE_REASON.REPLACE_REPLICA,
        });
      }
      // When the serialization cap held back spread-restoration REPLACEs, defer
      // the unpaired spread ADDs too: emitting them as standalone
      // count-increasing ADDs would re-create the surplus the serialized REPLACE
      // is meant to resolve. Mirror the spread-vs-count reconcile guard below
      // (only suppress when not under count target) so genuine deficit fill
      // (active < target) is never blocked by an in-flight REPLACE.
      if (
        serializeCriticalReplace &&
        replaceCount < naturalReplaceCount &&
        inFlightAccounting.deficitEffectiveCount >= targetReplicaCount
      ) {
        const retainedAddMoves = addMoves.filter(
          (move) => move.reason !== MOVE_REASON.INCREASE_REPLICA_COUNT,
        );
        const deferredAddCount = addMoves.length - retainedAddMoves.length;
        if (deferredAddCount > NUM.ZERO) {
          this.logger.info(REBALANCER_LOG_MSG.DEFER_ADD_OVER_TARGET, {
            entityId: this.entityId,
            targetReplicaCount,
            inFlightReplaceCount,
            naturalReplaceCount,
            replaceCount,
            deferredAddCount,
            replaceSerializationCap: true,
          });
          addMoves.length = NUM.ZERO;
          addMoves.push(...retainedAddMoves);
        }
      }
      if (!isDegradedPlacement) {
        moves.push(
          ...candidateRemoves
            .filter((move) => {
              return (
                !consumedRemoveReplicaIds.has(move.replicaId) &&
                move.prioritySpreadStandaloneSafe !== false
              );
            })
            .map(toExecutableRemove),
        );
      } else {
        const deferredAddCount = addMoves.length;
        if (deferredAddCount > NUM.ZERO) {
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
            entityId: this.entityId,
            healthyReplicaCount: healthyReplicas.length,
            activePlacementReplicaCount: activePlacementReplicas.length,
            targetReplicaCount,
            deferredAddCount,
            replaceMoveCount: replaceMoves.length,
            availableNodeCount: targetState.availableNodeCount || NUM.ZERO,
          });
        }
        addMoves.length = NUM.ZERO;
      }
    } else {
      moves.push(...candidateRemoves.map(toExecutableRemove));
    }

    // Reconcile spread-vs-count: a count-increasing ADD that was NOT
    // consumed into a count-neutral REPLACE (replaceMoves empty — e.g. the
    // count-reducing REMOVE was skipped because its source replica already
    // has a surplus-drain in flight) must not fire when the partition is
    // already at/over its replica-count target. Otherwise the spread
    // objective re-creates surplus that fights the pending count-reducing
    // REMOVE, keeping the partition permanently over target (the run4
    // over-target loop). Spread is still served by count-neutral REPLACEs;
    // genuine under-target ADDs (active < target) are unaffected.
    // In-flight-aware: suppress when committed ACTIVE rows OR in-flight ADD
    // creation already reach the count target (rows lag the dispatched ADD, so
    // a row-only check re-issued a redundant count-increasing ADD).
    if (
      addMoves.length > NUM.ZERO &&
      replaceMoves.length === NUM.ZERO &&
      inFlightAccounting.deficitEffectiveCount >= targetReplicaCount
    ) {
      const retainedAddMoves = addMoves.filter(
        (move) => move.reason !== MOVE_REASON.INCREASE_REPLICA_COUNT,
      );
      const deferredAddCount = addMoves.length - retainedAddMoves.length;
      if (deferredAddCount > NUM.ZERO) {
        this.logger.info(REBALANCER_LOG_MSG.DEFER_ADD_OVER_TARGET, {
          entityId: this.entityId,
          activePlacementReplicaCount: activePlacementReplicas.length,
          placementReplicaCount: placementReplicas.length,
          deficitEffectiveCount: inFlightAccounting.deficitEffectiveCount,
          targetReplicaCount,
          deferredAddCount,
        });
        addMoves.length = NUM.ZERO;
        addMoves.push(...retainedAddMoves);
      }
    }

    // Add the ADD moves to the moves array
    moves.push(...addMoves);

    // If there are ADD moves, only include critical REMOVE moves.
    if (addMoves.length > NUM.ZERO) {
      const criticalRemoves = moves.filter(
        (m) =>
          m.type === MoveType.REMOVE &&
          (m.reason === MOVE_REASON.REPLICA_FAILED ||
            (!isDegradedPlacement &&
              m.reason === MOVE_REASON.NODE_NOT_IN_TARGET)),
      );
      const filteredMoves = [...replaceMoves, ...addMoves, ...criticalRemoves];
      const deferredCount = moves.filter(
        (m) =>
          m.type === MoveType.REMOVE &&
          m.reason !== MOVE_REASON.REPLICA_FAILED &&
          m.reason !== MOVE_REASON.NODE_NOT_IN_TARGET,
      ).length;
      if (criticalRemoves.length > NUM.ZERO || deferredCount > NUM.ZERO) {
        this.logger.info(REBALANCER_LOG_MSG.INCLUDE_CRITICAL_REMOVE, {
          entityId: this.entityId,
          addMoveCount: addMoves.length,
          criticalRemoveCount: criticalRemoves.length,
          deferredRemoveCount: deferredCount,
        });
      }
      return filteredMoves;
    }

    // Include computed REPLACE and ADD moves.
    moves.push(...replaceMoves);
    moves.push(...addMoves);

    // Sort: failed REMOVE first, then REPLACE, then ADD, then REMOVE.
    moves.sort((a, b) => {
      const getPriority = (move) => {
        if (
          move.type === MoveType.REMOVE &&
          move.reason === MOVE_REASON.REPLICA_FAILED
        ) {
          return NUM.ZERO;
        }
        if (move.type === MoveType.REPLACE) {
          return NUM.ONE;
        }
        if (move.type === MoveType.ADD) {
          return NUM.TWO;
        }
        return NUM.THREE;
      };
      return getPriority(a) - getPriority(b);
    });
    return moves;
  }

  /**
   * @return {Set<string>}
   * @private
   */
  getTerminalFailedReplaceTargetReplicaIds() {
    if (
      typeof this.moveStateProvider.getTerminalFailedReplaceTargetReplicaIds !==
      MOVE_PLANNER_LITERAL.FUNCTION
    ) {
      return new Set();
    }
    const replicaIds =
      this.moveStateProvider.getTerminalFailedReplaceTargetReplicaIds();
    const values =
      replicaIds instanceof Set ?
        Array.from(replicaIds) :
        Array.isArray(replicaIds) ?
          replicaIds :
          [];
    return new Set(
      values
        .map((replicaId) =>
          String(replicaId || MOVE_PLANNER_LITERAL.EMPTY_STRING).trim(),
        )
        .filter((replicaId) => replicaId.length > NUM.ZERO),
    );
  }
}

function createMovePlannerMoveCalculationMethods() {
  const descriptors = Object.getOwnPropertyDescriptors(
    MovePlannerMoveCalculationMethods.prototype,
  );
  delete descriptors.constructor;
  return descriptors;
}

export {createMovePlannerMoveCalculationMethods};
