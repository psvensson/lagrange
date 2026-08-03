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
  classifySystemPartition,
  getPartitionRowFromCache,
} from '../bootstrap/system-partition-classification.js';
import {NUM, WORKFLOW_STEP} from '../constants/index.js';
import {
  PARTITION_DESCRIPTOR_EPOCH_DECISION,
} from '../partition/partition-constants.js';
import {
  buildPartitionDescriptorEpochDecision,
} from '../partition/partition-descriptor-epoch-contract.js';
import {ADJUST_DIRECTION, ReplicaStatus} from './replica-status.js';
import {isDataAffinityPlacementSuboptimal}
  from './placement-owner-decision.js';
import {
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
  isOddReplicaCount,
} from './odd-replica-count.js';
import {
  PLACEMENT_DEGRADED_REASON,
  REBALANCER_ENTITY_TYPE,
  MOVE_PLANNER_ERROR_MSG,
  REBALANCER_SUBSYSTEM,
} from './rebalancer-constants.js';
import {
  ADMISSION_DECISION,
  ADMISSION_REASON,
  STORAGE_CAPACITY_ERROR_MSG,
  STORAGE_CAPACITY_LOG_MSG,
} from './storage-capacity-constants.js';
import {createMovePlannerStateMethods} from './move-planner-state-methods.js';
import {
  createMovePlannerMoveCalculationMethods,
} from './move-planner-move-calculation-methods.js';
import {
  createMovePlannerPlacementTailMethods,
} from './move-planner-placement-tail-methods.js';
import {
  PLACEMENT_OWNER_POLICY,
  buildPlacementOwnerTargetOutcome,
} from './topology-owner-constants.js';
import {
  PLACEMENT_OWNER_SCORE_PROFILE,
} from './placement-owner-constants.js';
import {
  buildReplicaInventorySnapshot,
  isReplicaInventoryAddTransitionalOperation,
} from './replica-inventory.js';
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
const DegradedReason = PLACEMENT_DEGRADED_REASON;
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
      ] || 0
    ) > 0
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
  const healthyReplicaCount = Number(options.healthyReplicaCount) || 0;
  const actionableTarget = Number(options.actionableTarget) || 0;
  const targetCount = Number(options.targetCount) || 0;
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
  const targetReplicaCount = Number(options.targetReplicaCount) || 0;
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
    availableNodeCount: Number(options.availableNodeCount) || 0,
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
  classifySystemPartition,
  getNextOddCount,
  getPartitionRowFromCache,
  getPreviousOddCount,
  isDataAffinityPlacementSuboptimal,
  isOddReplicaCount,
  isReplicaInventoryAddTransitionalOperation,
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
class MovePlanner {
  /**
   * Create a new MovePlanner instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.entityId - Entity ID (partition, message
   *   group, or service definition ID).
   * @param {string} options.entityType - 'partition', 'message_group',
   *   or 'runtime_service'.
   * @param {Object} options.moveStateProvider - Provider for state access.
   * @param {Object} [options.storageAdmissionService] - Admission gate.
   * @param {Object} [options.accountingService] - Capacity accounting.
   * @param {Object} [options.storagePressureBehavior] - Pressure behavior.
   */
  constructor(options = {}) {
    if (!options.entityId) {
      throw new Error(MOVE_PLANNER_LITERAL.MOVEPLANNER_REQUIRES_ENTITYID);
    }
    if (!options.entityType) {
      throw new Error(MOVE_PLANNER_LITERAL.MOVEPLANNER_REQUIRES_ENTITYTYPE);
    }
    if (!options.moveStateProvider) {
      throw new Error(
        MOVE_PLANNER_LITERAL.MOVEPLANNER_REQUIRES_MOVESTATEPROVIDER,
      );
    }
    this.entityId = options.entityId;
    this.entityType = options.entityType;
    this.moveStateProvider = options.moveStateProvider;
    this.storageAdmissionService = options.storageAdmissionService || null;
    this.accountingService = options.accountingService || null;
    this.storagePressureBehavior = options.storagePressureBehavior || null;
    this.strictOwnerDependencies = options.strictOwnerDependencies === true;
    this.replicaInventoryBuilder =
      options.replicaInventoryBuilder || buildReplicaInventorySnapshot;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED) :
      console;
  }

  /**
   * Calculate target state based on policy.
   * Applies capacity feasibility filter before scoring when admission
   * service is available.
   *
   * Routes entity types to the appropriate placement strategy:
   * - MESSAGE_GROUP with ensureLocalAccess: message-group placement
   * - PARTITION: partition placement (spread by suitability)
   * - RUNTIME_SERVICE: partition placement (cluster-global target)
   *
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @param {Object|null} inventorySourceStateBefore source capture bracket
   * @return {Promise<Object>} Target state with replica count and
   *   placement.
   */
  async calculateTargetState(
    currentReplicas,
    policy,
    inventorySourceStateBefore = null,
  ) {
    const nodes = this.moveStateProvider.getAvailableNodes();
    const targetReplicaCount =
      policy.targetReplicaCount || policy.replicaCount || NUM.THREE;
    const estimatedBytes = this.getEstimatedBytesForEntity();
    const transitionSnapshot = this.buildTopologyTransitionSnapshot(
      currentReplicas,
      inventorySourceStateBefore,
    );
    if (this.isDescriptorEpochRejected(transitionSnapshot)) {
      const diagnostics =
        this.buildDescriptorEpochRejectedDiagnostics(nodes, transitionSnapshot);
      if (
        this.entityType === EntityType.MESSAGE_GROUP &&
        policy.ensureLocalAccess
      ) {
        return this.calculateMessageGroupPlacement(
          [],
          targetReplicaCount,
          policy,
          diagnostics,
          transitionSnapshot,
          currentReplicas,
        );
      }
      return this.calculatePartitionPlacement(
        [],
        targetReplicaCount,
        policy,
        diagnostics,
        transitionSnapshot,
        currentReplicas,
      );
    }
    const {feasibleNodes, diagnostics} = await this.filterNodesByCapacity(
      nodes,
      estimatedBytes,
    );

    // For message groups: ensure every node has local access
    if (
      this.entityType === EntityType.MESSAGE_GROUP &&
      policy.ensureLocalAccess
    ) {
      return this.calculateMessageGroupPlacement(
        feasibleNodes,
        targetReplicaCount,
        policy,
        diagnostics,
        transitionSnapshot,
        currentReplicas,
      );
    }

    // For partitions and runtime services: spread across nodes by
    // policy with cluster-global replica count target.
    return this.calculatePartitionPlacement(
      feasibleNodes,
      targetReplicaCount,
      policy,
      diagnostics,
      transitionSnapshot,
      currentReplicas,
    );
  }

  /**
   * Estimate bytes needed for a replica of this entity type.
   * Delegates to accountingService when available.
   * @return {number} estimated bytes or 0 when unavailable
   * @private
   */
  getEstimatedBytesForEntity() {
    if (
      !this.accountingService ||
      typeof this.accountingService.estimateReplicaBytes !==
        MOVE_PLANNER_LITERAL.FUNCTION
    ) {
      if (this.strictOwnerDependencies) {
        throw new Error(
          !this.accountingService ?
            MOVE_PLANNER_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED :
            MOVE_PLANNER_ERROR_MSG.STORAGE_ACCOUNTING_ESTIMATE_REQUIRED,
        );
      }
      return 0;
    }
    return this.accountingService.estimateReplicaBytes({
      entityType: this.entityType,
      sizeBytes: 0,
    });
  }

  /**
   * Determine whether descriptor epoch evidence rejects placement planning.
   * @param {Object} transitionSnapshot
   * @return {boolean}
   * @private
   */
  isDescriptorEpochRejected(transitionSnapshot) {
    return transitionSnapshot?.descriptorEpochDecision?.decision ===
      PARTITION_DESCRIPTOR_EPOCH_DECISION.REJECT;
  }

  /**
   * Build capacity-shaped diagnostics for descriptor epoch rejection.
   * @param {Array<Object>} nodes
   * @param {Object} transitionSnapshot
   * @return {Object}
   * @private
   */
  buildDescriptorEpochRejectedDiagnostics(nodes, transitionSnapshot) {
    const candidateCount = Array.isArray(nodes) ? nodes.length : 0;
    return {
      totalCandidates: candidateCount,
      feasibleCount: 0,
      rejectedCount: candidateCount,
      rejectionsByReason: {
        [transitionSnapshot.descriptorEpochDecision.reason]:
          candidateCount,
      },
      capacityFilterApplied: false,
      descriptorEpochRejected: true,
      descriptorEpochDecision: transitionSnapshot.descriptorEpochDecision,
      diagnostic:
        MOVE_PLANNER_DESCRIPTOR_EPOCH_DIAGNOSTIC.REJECTED,
    };
  }

  /**
   * Filter nodes by storage capacity feasibility.
   *
   * When storageAdmissionService is available, each candidate node is
   * checked via checkAdd. Nodes that fail admission are excluded from
   * placement.
   *
   * Requirements: 5.1, 5.4, 11.3
   *
   * @param {Array<Object>} nodes - Candidate nodes.
   * @param {number} estimatedBytes - Estimated bytes for the replica.
   * @return {Promise<Object>} { feasibleNodes, diagnostics }
   * @private
   */
  async filterNodesByCapacity(nodes, estimatedBytes) {
    const diagnostics = {
      totalCandidates: nodes.length,
      feasibleCount: nodes.length,
      rejectedCount: 0,
      rejectionsByReason: {},
      capacityFilterApplied: false,
    };
    if (estimatedBytes <= 0) {
      diagnostics.feasibleCount = nodes.length;
      return {
        feasibleNodes: nodes,
        diagnostics,
      };
    }
    if (
      !this.storageAdmissionService ||
      typeof this.storageAdmissionService.checkAdd !==
        MOVE_PLANNER_LITERAL.FUNCTION
    ) {
      if (this.strictOwnerDependencies) {
        throw new Error(
          !this.storageAdmissionService ?
            MOVE_PLANNER_ERROR_MSG.STORAGE_ADMISSION_REQUIRED :
            MOVE_PLANNER_ERROR_MSG.STORAGE_ADMISSION_CHECK_ADD_REQUIRED,
        );
      }
      diagnostics.feasibleCount = nodes.length;
      return {
        feasibleNodes: nodes,
        diagnostics,
      };
    }
    diagnostics.capacityFilterApplied = true;
    const feasibleNodes = [];
    const criticalAdmissionEntity = this.isCriticalAdmissionEntity();
    for (const node of nodes) {
      const nodeId = node.node_id;
      try {
        const result = await this.storageAdmissionService.checkAdd({
          targetNodeId: nodeId,
          estimatedBytes,
          isCritical: criticalAdmissionEntity,
        });
        if (result.decision === ADMISSION_DECISION.ALLOW) {
          feasibleNodes.push(node);
        } else {
          const reason = result.reason;
          diagnostics.rejectionsByReason[reason] =
            (diagnostics.rejectionsByReason[reason] || 0) + 1;
          this.logger.debug(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, {
            entityId: this.entityId,
            nodeId,
            reason,
            projectedUtilization: result.projectedUtilization,
          });
        }
      } catch (err) {
        const reason = classifyCapacityAdmissionError(err);
        diagnostics.rejectionsByReason[reason] =
          (diagnostics.rejectionsByReason[reason] || 0) + 1;
        this.logger.warn(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, {
          entityId: this.entityId,
          nodeId,
          reason,
          error: err?.message || null,
        });
      }
    }
    diagnostics.feasibleCount = feasibleNodes.length;
    diagnostics.rejectedCount = nodes.length - feasibleNodes.length;
    if (diagnostics.rejectedCount > 0) {
      this.logger.info(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_APPLIED, {
        entityId: this.entityId,
        entityType: this.entityType,
        totalCandidates: diagnostics.totalCandidates,
        feasibleCount: diagnostics.feasibleCount,
        rejectedCount: diagnostics.rejectedCount,
        rejectionsByReason: diagnostics.rejectionsByReason,
      });
    }
    return {
      feasibleNodes,
      diagnostics,
    };
  }

  /**
   * Determine the degraded reason based on node counts and capacity
   * filter results.
   *
   * Requirements: 5.3
   *
   * @param {number} totalReadyNodes - Nodes before capacity filter.
   * @param {number} feasibleCount - Nodes after capacity filter.
   * @param {number} effectiveCount - Nodes actually placed.
   * @param {number} targetCount - Desired replica count.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {string|null} Degraded reason or null.
   * @private
   */
  getDegradedReason(
    totalReadyNodes,
    feasibleCount,
    effectiveCount,
    targetCount,
    diagnostics,
  ) {
    if (effectiveCount >= targetCount) {
      return null;
    }
    // Capacity filtering removed nodes — capacity is the bottleneck
    // when the filter reduced the candidate set below target.
    if (diagnostics.rejectedCount > 0 && feasibleCount < targetCount) {
      if (hasCapacityAccountingUnavailableRejection(diagnostics)) {
        return DegradedReason.CAPACITY_ACCOUNTING_UNAVAILABLE;
      }
      return DegradedReason.INSUFFICIENT_CAPACITY;
    }
    // Not enough ready nodes regardless of capacity
    return DegradedReason.INSUFFICIENT_NODES;
  }

  /**
   * Calculate optimal placement for message groups.
   * Ensures every node has at least one local replica.
   * @param {Array<Object>} nodes - Feasible nodes after capacity filter.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Message group policy.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {Object} Target placement state.
   */
  calculateMessageGroupPlacement(
    nodes,
    targetCount,
    policy,
    diagnostics,
    transitionSnapshot = null,
    currentReplicas = null,
  ) {
    const targetNodes = [];
    const diag = diagnostics || {
      totalCandidates: nodes ? nodes.length : 0,
      feasibleCount: nodes ? nodes.length : 0,
      rejectedCount: 0,
      rejectionsByReason: {},
      capacityFilterApplied: false,
    };
    const totalReadyNodes = diag.totalCandidates;
    const maxReplicaCount =
      policy.maxReplicaCount ||
      MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT;
    const placementOwnerDecision = this.buildPlacementOwnerPolicyDecision({
      nodes,
      targetCount,
      policy,
      diagnostics: diag,
      transitionSnapshot,
      currentReplicas,
      placementPolicy: PLACEMENT_OWNER_POLICY.MESSAGE_GROUP_LOCAL_ACCESS,
      scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.LOAD,
    });
    const sortedNodes = placementOwnerDecision.scoreResult.rankedCandidates
      .map((candidate) => candidate.node);

    // No feasible nodes: we cannot place any replicas.
    if (sortedNodes.length === 0) {
      return buildMessageGroupPlacementResult({
        targetReplicaCount: targetCount,
        targetNodes: [],
        maxReplicaCount,
        degradedReason: this.getDegradedReason(
          totalReadyNodes,
          0,
          0,
          targetCount,
          diag,
        ),
        availableNodeCount: 0,
        capacityDiagnostics: diag,
        placementOwnerOutcome: placementOwnerDecision.placementOwnerOutcome,
        placementOwnerDecision,
        topologyTransitionSnapshot: transitionSnapshot,
      });
    }

    // First, ensure we have replicas spread across nodes
    if (policy.placementConstraints?.spreadAcrossNodes) {
      const effectiveCount = Math.min(targetCount, sortedNodes.length);
      targetNodes.push(
        ...placementOwnerDecision.intent.targetNodeIds,
      );
      return buildMessageGroupPlacementResult({
        targetReplicaCount: targetCount,
        targetNodes,
        maxReplicaCount,
        degradedReason: this.getDegradedReason(
          totalReadyNodes,
          sortedNodes.length,
          effectiveCount,
          targetCount,
          diag,
        ),
        availableNodeCount: sortedNodes.length,
        capacityDiagnostics: diag,
        placementOwnerOutcome: placementOwnerDecision.placementOwnerOutcome,
        placementOwnerDecision,
        topologyTransitionSnapshot: transitionSnapshot,
      });
    }
    return buildMessageGroupPlacementResult({
      targetReplicaCount: targetCount,
      targetNodes,
      maxReplicaCount,
      degradedReason: this.getDegradedReason(
        totalReadyNodes,
        nodes.length,
        targetNodes.length,
        targetCount,
        diag,
      ),
      availableNodeCount: nodes.length,
      capacityDiagnostics: diag,
      placementOwnerDecision,
      topologyTransitionSnapshot: transitionSnapshot,
    });
  }

  /**
   * Calculate optimal placement for partitions.
   * @param {Array<Object>} nodes - Feasible nodes after capacity filter.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Table policy.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {Object} Target placement state.
   */
  calculatePartitionPlacement(
    nodes,
    targetCount,
    policy,
    diagnostics,
    transitionSnapshot = null,
    currentReplicas = null,
  ) {
    const targetNodes = [];
    const diag = diagnostics || {
      totalCandidates: nodes ? nodes.length : 0,
      feasibleCount: nodes ? nodes.length : 0,
      rejectedCount: 0,
      rejectionsByReason: {},
      capacityFilterApplied: false,
    };
    const totalReadyNodes = diag.totalCandidates;
    const placementOwnerDecision = this.buildPlacementOwnerPolicyDecision({
      nodes,
      targetCount,
      policy,
      diagnostics: diag,
      transitionSnapshot,
      currentReplicas,
      includeGlobalSystemDeferral: this.isSystemPartitionEntity(),
      placementPolicy:
        this.entityType === EntityType.RUNTIME_SERVICE ?
          PLACEMENT_OWNER_POLICY.RUNTIME_SERVICE_SPREAD :
          PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
      scoreProfile: PLACEMENT_OWNER_SCORE_PROFILE.SUITABILITY,
    });

    // Sort nodes by suitability based on policy constraints
    const sortedNodes = placementOwnerDecision.scoreResult.rankedCandidates
      .map((candidate) => candidate.node);

    // No feasible nodes: we cannot place any replicas.
    if (sortedNodes.length === 0) {
      const degradedReason = this.getDegradedReason(
        totalReadyNodes,
        0,
        0,
        targetCount,
        diag,
      );
      const prioritySpread = this.analyzePrioritySpread([], policy, []);
      return {
        targetReplicaCount: targetCount,
        targetNodes: [],
        minReplicaCount: policy.minReplicaCount || NUM.THREE,
        maxReplicaCount: policy.maxReplicaCount || NUM.SEVEN,
        degraded: true,
        degradedReason,
        availableNodeCount: 0,
        capacityDiagnostics: diag,
        prioritySpread,
        placementOwnerOutcome: placementOwnerDecision.placementOwnerOutcome,
        placementOwnerDecision,
        topologyTransitionSnapshot: transitionSnapshot,
      };
    }

    // Keep desired replica target independent of current node count.
    // Placement assigns at most one replica per available node.
    const effectiveCount = Math.min(targetCount, sortedNodes.length);
    targetNodes.push(
      ...placementOwnerDecision.intent.targetNodeIds,
    );
    // Data-local call activation pins: LIVE lease-pinned nodes join the
    // target deterministically while the lease lasts (dedup-guarded, and
    // only nodes the planner already considers available — a pin can
    // never target a dead node). Because pinned nodes are IN target,
    // the surplus cure leaves their replicas alone until the lease
    // lapses, at which point reclaim happens through the normal pass.
    if (Array.isArray(policy.activationPinNodeIds)) {
      const availableNodeIds = new Set(
        sortedNodes.map((node) => node.nodeId ?? node.node_id ?? node));
      for (const pinnedNodeId of policy.activationPinNodeIds) {
        if (availableNodeIds.has(pinnedNodeId) &&
            !targetNodes.includes(pinnedNodeId)) {
          targetNodes.push(pinnedNodeId);
        }
      }
    }
    const degradedReason = this.getDegradedReason(
      totalReadyNodes,
      sortedNodes.length,
      effectiveCount,
      targetCount,
      diag,
    );
    const prioritySpread = this.analyzePrioritySpread(
      targetNodes.map((nodeId) => ({
        node_id: nodeId,
        status: ReplicaStatus.ACTIVE,
      })),
      policy,
      sortedNodes,
    );
    return {
      targetReplicaCount: targetCount,
      targetNodes,
      minReplicaCount: policy.minReplicaCount || NUM.THREE,
      maxReplicaCount: policy.maxReplicaCount || NUM.SEVEN,
      degraded: effectiveCount < targetCount,
      degradedReason,
      availableNodeCount: sortedNodes.length,
      capacityDiagnostics: diag,
      prioritySpread,
      placementOwnerOutcome: placementOwnerDecision.placementOwnerOutcome,
      placementOwnerDecision,
      topologyTransitionSnapshot: transitionSnapshot,
    };
  }

  /**
   * Run the placement owner kernel for the current planner boundary.
   * @param {Object} options
   * @return {Object}
   * @private
   */
}

Object.defineProperties(
  MovePlanner.prototype,
  createMovePlannerMoveCalculationMethods(),
);
Object.defineProperties(
  MovePlanner.prototype,
  createMovePlannerPlacementTailMethods(),
);
Object.assign(MovePlanner.prototype, MOVE_PLANNER_STATE_METHODS);

export {MovePlanner};
