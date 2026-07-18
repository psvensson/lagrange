import {NUM} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {ReplicaStatus} from './replica-status.js';
import {
  REPLICA_INVENTORY_EFFECTIVE_VIEW,
  effectiveReplicaCountAfterOperations,
} from './replica-inventory.js';
import {
  MOVE_REASON,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
} from './rebalancer-constants.js';
import {
  PLACEMENT_CURE_CONDITION,
  resolvePlacementCure,
} from './replica-placement-cure-policy.js';
import {
  applyPrioritySpreadDrainCure,
  applyPrioritySpreadExpandCure,
  evaluatePriorityStandaloneRemoveSafety,
} from './move-planner-priority-spread-cure.js';
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
const MoveType = REBALANCER_MOVE_TYPE;

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
    const transitionSnapshot =
      targetState.topologyTransitionSnapshot ||
      this.buildTopologyTransitionSnapshot(currentReplicas);
    const inventory = transitionSnapshot.inventory;
    const isTopologyCleanupReason = (reason) => {
      return (
        reason === MOVE_REASON.NODE_NOT_IN_TARGET ||
        reason === MOVE_REASON.SPREAD_REPLICAS
      );
    };
    const buildPriorityStandaloneRemoveSafety = (replicaId) => {
      return evaluatePriorityStandaloneRemoveSafety({
        replicaId,
        activePlacementReplicas,
        targetReplicaCount,
        priorityPartition: this.isControlPlanePriorityPartition(),
        prioritySpreadPolicy,
        availableNodes: this.moveStateProvider.getAvailableNodes(),
        analyzePrioritySpread: (...args) =>
          this.analyzePrioritySpread(...args),
      });
    };
    const toExecutableRemove = (move) => {
      const {
        prioritySpreadStandaloneSafe: _prioritySpreadStandaloneSafe,
        prioritySpreadMonotonicSafe: _prioritySpreadMonotonicSafe,
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
    const activePlacementReplicas = currentReplicas.filter((replica) => {
      const status = replica?.status || ReplicaStatus.ACTIVE;
      return status === ReplicaStatus.ACTIVE && !!replica?.node_id;
    });
    const targetNodeIds = targetState.targetNodes;
    const isDegradedPlacement = !!targetState?.degraded;
    const nodesWithAddTransitional =
      transitionSnapshot.nodesWithEntityAddTransitional;
    const nodesWithGlobalSystemAddTransitional =
      transitionSnapshot.nodesWithGlobalSystemAddTransitional;
    const replicasInRemoving = transitionSnapshot.replicasInRemoving;
    const terminalFailedReplaceTargetReplicaIds =
      this.getTerminalFailedReplaceTargetReplicaIds();
    const scheduledRemoveReplicaIds = new Set();
    const pendingCount = transitionSnapshot.pendingCount;
    if (pendingCount > 0) {
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
      pendingCount > 0 && !this.isControlPlanePriorityPartition() ||
      inventory.provenance.topologyIncreaseUsable !== true;

    // Count target replicas per node
    const targetCounts = new Map();
    for (const nodeId of targetNodeIds) {
      targetCounts.set(
        nodeId,
        (targetCounts.get(nodeId) || 0) + 1,
      );
    }

    // Count current replicas per node
    const currentCounts = new Map();
    for (const replica of inventory.replicas) {
      if (replica.accountingOccupied && replica.nodeId) {
        currentCounts.set(
          replica.nodeId,
          (currentCounts.get(replica.nodeId) || 0) + 1,
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
        const failedReplicaCure = resolvePlacementCure(
          PLACEMENT_CURE_CONDITION.FAILED_REPLICA,
        );
        moves.push({
          type: failedReplicaCure.moveType,
          replicaId,
          nodeId: replica.node_id,
          reason: failedReplicaCure.moveReason,
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
    const partitionLeaderNodeId =
      this.resolveRemovalSourcePartitionLeaderNodeId();
    const partitionLeaderReplicaId =
      this.resolveRemovalSourcePartitionLeaderReplicaId();
    const isLeaderRemovalCandidate = (replica) => {
      if (!replica) {
        return false;
      }
      const candidateReplicaId =
        replica.replica_id || replica.service_id || null;
      if (
        partitionLeaderReplicaId &&
        candidateReplicaId === partitionLeaderReplicaId
      ) {
        return true;
      }
      const role =
        typeof replica.raft_role === 'string' ?
          replica.raft_role.trim().toLowerCase() :
          null;
      if (role === RAFT_ROLE.LEADER) {
        return true;
      }
      // A partition leader_node_id identifies the hosting node, not the
      // individual replica. During seed formation several replicas can share
      // that node, so applying the node fallback to an explicit follower would
      // classify every co-located replica as the leader and restore first-wins
      // source selection. Preserve per-replica role evidence; use the node-level
      // owner only when the service row has no recognized role yet.
      if (
        role === RAFT_ROLE.FOLLOWER ||
        role === RAFT_ROLE.CANDIDATE ||
        role === RAFT_ROLE.LEARNER
      ) {
        return false;
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
          (isLeaderRemovalCandidate(left) ? 1 : 0) -
          (isLeaderRemovalCandidate(right) ? 1 : 0),
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
        const currentCount = currentCounts.get(nodeId) || 0;
        const needed = targetCount - currentCount;
        const deficitCure = resolvePlacementCure(
          PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION,
        );
        for (let i = 0; i < needed; i++) {
          addMoves.push({
            type: deficitCure.moveType,
            nodeId,
            reason: deficitCure.moveReason,
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
    const inFlightAccounting = transitionSnapshot.inventory.accounting;
    const creationEffectiveCount = effectiveReplicaCountAfterOperations(
      inventory,
      REPLICA_INVENTORY_EFFECTIVE_VIEW.PEAK_CREATION,
    );
    const deficitEffectiveCount = effectiveReplicaCountAfterOperations(
      inventory,
      REPLICA_INVENTORY_EFFECTIVE_VIEW.DEFICIT_FILL,
    );
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
    //
    // The surplus is counted by the AUTHORITATIVE raft-voter count
    // (activeVoterCount), not the status===ACTIVE count (activeCount). A
    // just-promoted voter reads raft_role=follower while its status column still
    // lags at creating/syncing; the status read misses it, so the cap stayed
    // blind during the promotion window and kept minting replacements that piled
    // the group past the voter target until learner promotion dead-locked (the
    // voter-ready-60s stall). activeVoterCount reads the SAME voters the
    // promotion guard is blocked by (countActiveVoters), closing that read
    // disagreement. Take the MAX of the two so the cap is strictly
    // non-regressive: it never fires LESS than the status-only read did, and
    // fires MORE (earlier) exactly when raft_role reveals a hidden surplus voter.
    const surplusVoterCount = Math.max(
      inFlightAccounting.activeCount,
      inFlightAccounting.activeVoterCount,
    );
    if (
      !cleanupOnlyWhilePending &&
      addMoves.length > 0 &&
      this.isControlPlanePriorityPartition() &&
      surplusVoterCount > targetReplicaCount
    ) {
      this.logger.info(REBALANCER_LOG_MSG.DEFER_ADD_OVER_TARGET, {
        entityId: this.entityId,
        targetReplicaCount,
        activeCount: inFlightAccounting.activeCount,
        // Authoritative voter count and whether it, not the status read, is what
        // tripped the cap — the A/B discriminator: a fire where
        // activeVoterCount > target while activeCount <= target is one the
        // status-only cap would have MISSED (the promotion-window catch).
        activeVoterCount: inFlightAccounting.activeVoterCount,
        raftRoleAuthoritativeFire:
          inFlightAccounting.activeVoterCount > targetReplicaCount &&
          inFlightAccounting.activeCount <= targetReplicaCount,
        creationEffectiveCount,
        inFlightReplaceInCreationCount:
          inFlightAccounting.inFlightReplaceInCreationCount,
        inFlightAddCount: inFlightAccounting.inFlightAddCount,
        deferredAdds: addMoves.length,
        overCreationCap: true,
      });
      addMoves.length = 0;
    }
    const shouldDeferAddsInDegraded =
      isDegradedPlacement &&
      activePlacementReplicas.length >= targetReplicaCount &&
      addMoves.length > 0;
    const totalHealthyAfterAdds =
      activePlacementReplicas.length + addMoves.length;
    const candidateRemoves = [];

    // Generate REMOVE moves for over-represented nodes
    for (const [nodeId, replicas] of replicasByNode) {
      const targetCount = targetCounts.get(nodeId) || 0;
      const currentCount = replicas.length;
      const excess = currentCount - targetCount;
      for (let i = 0; i < excess; i++) {
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
        const surplusCure = resolvePlacementCure(
          targetCount === 0 ?
            PLACEMENT_CURE_CONDITION.NODE_NOT_IN_TARGET :
            PLACEMENT_CURE_CONDITION.OVER_REPRESENTATION,
        );
        const reason = surplusCure.moveReason;
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
            availableNodeCount: targetState.availableNodeCount || 0,
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
          priorityRemoveSafety.monotonicSafe !== true &&
          addMoves.length === 0
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
          type: surplusCure.moveType,
          replicaId,
          nodeId: nodeId,
          reason,
          sourceIsLeader: isLeaderRemovalCandidate(replicaToRemove),
          prioritySpreadStandaloneSafe: priorityRemoveSafety.safe,
          prioritySpreadMonotonicSafe:
            priorityRemoveSafety.monotonicSafe === true,
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
      candidateRemoves.length > 0;
    if (shouldDeferAddsInDegraded && !canUseDegradedReplace) {
      this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
        entityId: this.entityId,
        healthyReplicaCount: healthyReplicas.length,
        activePlacementReplicaCount: activePlacementReplicas.length,
        targetReplicaCount,
        deferredAddCount: addMoves.length,
        availableNodeCount: targetState.availableNodeCount || 0,
      });
      addMoves.length = 0;
    }
    applyPrioritySpreadDrainCure({
      partitionId: this.entityId,
      inventory,
      surplusVoterCount,
      activePlacementReplicas,
      targetReplicaCount,
      targetNodeIds,
      addMoves,
      candidateRemoves,
    });
    if (
      addMoves.length > 0 &&
      candidateRemoves.length > 0 &&
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
          (left.sourceIsLeader ? 1 : 0) -
          (right.sourceIsLeader ? 1 : 0),
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
        0;
      let replaceCount = serializeCriticalReplace ?
        Math.min(
          naturalReplaceCount,
          Math.max(0, 1 - inFlightReplaceCount),
        ) :
        naturalReplaceCount;
      replaceCount = applyPrioritySpreadExpandCure({
        partitionId: this.entityId,
        inventory,
        surplusVoterCount,
        activePlacementReplicas,
        targetReplicaCount,
        targetNodeIds,
        deficitEffectiveCount,
        inFlightReplaceCount,
        naturalReplaceCount,
        replaceCount,
        addMoves,
        candidateRemoves,
      });
      const consumedRemoveReplicaIds = new Set();
      const relocationCure = resolvePlacementCure(
        PLACEMENT_CURE_CONDITION.PAIRED_RELOCATION,
      );
      for (let i = 0; i < replaceCount; i++) {
        const addMove = addMoves.shift();
        const removeMove = replaceCandidates[i];
        consumedRemoveReplicaIds.add(removeMove.replicaId);
        replaceMoves.push({
          type: relocationCure.moveType,
          nodeId: addMove.nodeId,
          sourceNodeId: removeMove.nodeId,
          replicaId: removeMove.replicaId,
          reason: relocationCure.moveReason,
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
        deficitEffectiveCount >= targetReplicaCount
      ) {
        const retainedAddMoves = addMoves.filter(
          (move) => move.reason !== MOVE_REASON.INCREASE_REPLICA_COUNT,
        );
        const deferredAddCount = addMoves.length - retainedAddMoves.length;
        if (deferredAddCount > 0) {
          this.logger.info(REBALANCER_LOG_MSG.DEFER_ADD_OVER_TARGET, {
            entityId: this.entityId,
            targetReplicaCount,
            inFlightReplaceCount,
            naturalReplaceCount,
            replaceCount,
            deferredAddCount,
            replaceSerializationCap: true,
          });
          addMoves.length = 0;
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
        if (deferredAddCount > 0) {
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, {
            entityId: this.entityId,
            healthyReplicaCount: healthyReplicas.length,
            activePlacementReplicaCount: activePlacementReplicas.length,
            targetReplicaCount,
            deferredAddCount,
            replaceMoveCount: replaceMoves.length,
            availableNodeCount: targetState.availableNodeCount || 0,
          });
        }
        addMoves.length = 0;
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
      addMoves.length > 0 &&
      replaceMoves.length === 0 &&
      deficitEffectiveCount >= targetReplicaCount
    ) {
      const retainedAddMoves = addMoves.filter(
        (move) => move.reason !== MOVE_REASON.INCREASE_REPLICA_COUNT,
      );
      const deferredAddCount = addMoves.length - retainedAddMoves.length;
      if (deferredAddCount > 0) {
        this.logger.info(REBALANCER_LOG_MSG.DEFER_ADD_OVER_TARGET, {
          entityId: this.entityId,
          activePlacementReplicaCount: activePlacementReplicas.length,
          placementReplicaCount: inventory.accounting.occupiedCount,
          deficitEffectiveCount,
          targetReplicaCount,
          deferredAddCount,
        });
        addMoves.length = 0;
        addMoves.push(...retainedAddMoves);
      }
    }

    // Add the ADD moves to the moves array
    moves.push(...addMoves);

    // If there are ADD moves, only include critical REMOVE moves.
    if (addMoves.length > 0) {
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
      if (criticalRemoves.length > 0 || deferredCount > 0) {
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
          return 0;
        }
        if (move.type === MoveType.REPLACE) {
          return 1;
        }
        if (move.type === MoveType.ADD) {
          return 2;
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
        .filter((replicaId) => replicaId.length > 0),
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
