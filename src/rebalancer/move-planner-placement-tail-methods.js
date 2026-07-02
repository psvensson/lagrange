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

import {NUM} from '../constants/index.js';
import {
  MOVE_REASON,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
  MOVE_PLANNER_ERROR_MSG,
} from './rebalancer-constants.js';
import {
  MOVE_CRITICALITY,
  PRESSURE_BEHAVIOR_DECISION,
  STORAGE_CAPACITY_LOG_MSG,
} from './storage-capacity-constants.js';
import {
  PLACEMENT_OWNER_POLICY,
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

class MovePlannerPlacementTailMethods {
  buildPlacementOwnerPolicyDecision(options = {}) {
    const currentReplicas = Array.isArray(options.currentReplicas) ?
      options.currentReplicas :
      this.getCurrentReplicas();
    return buildPlacementOwnerPolicyDecision({
      candidateNodes: Array.isArray(options.nodes) ? options.nodes : [],
      currentReplicas,
      targetCount: options.targetCount,
      policy: options.policy,
      capacityDiagnostics: options.diagnostics,
      transitionSnapshot: options.transitionSnapshot,
      includeGlobalSystemDeferral: options.includeGlobalSystemDeferral === true,
      placementPolicy: options.placementPolicy,
      scoreProfile: options.scoreProfile,
    });
  }

  /**
   * Sort nodes by current load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Available nodes.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesByLoad(nodes) {
    return this.buildPlacementOwnerPolicyDecision({
      nodes,
      targetCount: Array.isArray(nodes) ? nodes.length : NUM.ZERO,
      policy: {},
      placementPolicy: PLACEMENT_OWNER_POLICY.MESSAGE_GROUP_LOCAL_ACCESS,
      scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.LOAD,
    }).scoreResult.rankedCandidates.map((candidate) => candidate.node);
  }

  /**
   * Sort nodes by suitability based on policy constraints.
   * Includes storage-aware tie-breaking when capacity data is
   * available (Req 5.2).
   * @param {Array<Object>} nodes - Available nodes.
   * @param {Object} policy - Policy with placement constraints.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesBySuitability(nodes, policy) {
    return this.buildPlacementOwnerPolicyDecision({
      nodes,
      targetCount: Array.isArray(nodes) ? nodes.length : NUM.ZERO,
      policy,
      placementPolicy:
        this.entityType === EntityType.RUNTIME_SERVICE ?
          PLACEMENT_OWNER_POLICY.RUNTIME_SERVICE_SPREAD :
          PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
      scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
    }).scoreResult.rankedCandidates.map((candidate) => candidate.node);
  }

  /**
   * Calculate node load score.
   * @param {Object} node - Node object.
   * @return {number} Load score (0-300, lower is better).
   */
  calculateNodeLoad(node) {
    const cpuLoad = node.cpu_usage_percent || NUM.ZERO;
    const memoryLoad = node.memory_usage_percent || NUM.ZERO;
    const diskLoad = node.disk_usage_percent || NUM.ZERO;
    return cpuLoad + memoryLoad + diskLoad;
  }


  /**
   * Apply pressure-state gating to a list of computed moves.
   *
   * For each storage-increasing move (ADD, REPLACE) targeting a node:
   * - hard/exhausted: skip non-critical moves
   * - soft: mark non-critical moves with `reducedPriority`
   * - normal: pass through unchanged
   *
   * Critical moves (replica_failed, under-replication) always pass.
   *
   * Requirements: 8.2, 8.3
   *
   * @param {Array<Object>} moves - Raw moves from calculateMoves.
   * @return {Promise<Array<Object>>} Filtered/annotated moves.
   */
  async applyPressureGating(moves) {
    if (moves.length === NUM.ZERO) {
      return moves;
    }
    if (
      !this.storagePressureBehavior ||
      typeof this.storagePressureBehavior.shouldAllowMove !==
        MOVE_PLANNER_LITERAL.FUNCTION
    ) {
      if (this.strictOwnerDependencies) {
        throw new Error(
          !this.storagePressureBehavior ?
            MOVE_PLANNER_ERROR_MSG.STORAGE_PRESSURE_BEHAVIOR_REQUIRED :
            MOVE_PLANNER_ERROR_MSG.STORAGE_PRESSURE_BEHAVIOR_CHECK_REQUIRED,
        );
      }
      return moves;
    }
    const result = [];
    for (const move of moves) {
      const targetNodeId = move.nodeId;

      // REMOVE moves are not storage-increasing — pass through
      if (move.type === MoveType.REMOVE) {
        result.push(move);
        continue;
      }
      const criticality = this.classifyMoveCriticality(move);
      const check = await this.storagePressureBehavior.shouldAllowMove(
        targetNodeId,
        criticality,
      );
      if (check.decision === PRESSURE_BEHAVIOR_DECISION.DENY) {
        this.logger.info(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, {
          entityId: this.entityId,
          nodeId: targetNodeId,
          moveType: move.type,
          reason: move.reason,
          pressureState: check.pressureState,
          criticality,
        });
        continue;
      }
      if (
        check.decision === PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY
      ) {
        result.push({
          ...move,
          reducedPriority: true,
        });
        continue;
      }
      result.push(move);
    }
    return result;
  }

  /**
   * Classify a move as critical or non-critical.
   *
   * Critical moves are correctness-preserving operations that must
   * proceed even under pressure (e.g. replacing a failed replica,
   * increasing replica count to meet minimum).
   *
   * @param {Object} move
   * @return {string} MOVE_CRITICALITY value
   * @private
   */
  classifyMoveCriticality(move) {
    if (
      move.reason === MOVE_REASON.REPLICA_FAILED ||
      move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT
    ) {
      return MOVE_CRITICALITY.CRITICAL;
    }
    if (
      this.isControlPlanePriorityPartition() &&
      (move.reason === MOVE_REASON.SPREAD_REPLICAS ||
        move.reason === MOVE_REASON.REPLACE_REPLICA)
    ) {
      return MOVE_CRITICALITY.CRITICAL;
    }
    return MOVE_CRITICALITY.NON_CRITICAL;
  }
}

function createMovePlannerPlacementTailMethods() {
  const descriptors = Object.getOwnPropertyDescriptors(MovePlannerPlacementTailMethods.prototype);
  delete descriptors.constructor;
  return descriptors;
}

export {createMovePlannerPlacementTailMethods};
