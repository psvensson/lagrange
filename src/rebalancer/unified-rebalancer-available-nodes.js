import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {UnifiedRebalancerLifecycleBase} from './unified-rebalancer-lifecycle-base.js';
import {
  applyUnifiedRebalancerCriticalTopologyMethods,
} from './unified-rebalancer-critical-topology-methods.js';
import {TYPEOF} from '../constants/index.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  NUM,
  SERVICE_STATUS,
  STATE,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
  buildPriorityRecoveryOperationAssessment,
  getPartitionRowFromCache,
  isPriorityControlPlanePartition,
  resolvePriorityRecoveryActiveNodeCohort,
} = UNIFIED_REBALANCER_SHARED;

const AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE = Object.freeze({
  ORDINARY_ENTITY: 'ordinary_entity',
  PRIORITY_RECOVERY_OPEN: 'priority_recovery_open',
  PRIORITY_RECOVERY_CLOSED: 'priority_recovery_closed',
});

const AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_ACTION = Object.freeze({
  CONSTRAIN_TO_PUBLISHED_MEMBERSHIP: 'constrain_to_published_membership',
  ALLOW_RECOVERY_COHORT: 'allow_recovery_cohort',
});

const AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE.ORDINARY_ENTITY,
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_ACTION
        .CONSTRAIN_TO_PUBLISHED_MEMBERSHIP,
    ],
    [
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE.PRIORITY_RECOVERY_CLOSED,
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_ACTION
        .CONSTRAIN_TO_PUBLISHED_MEMBERSHIP,
    ],
    [
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE.PRIORITY_RECOVERY_OPEN,
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_ACTION.ALLOW_RECOVERY_COHORT,
    ],
  ]),
);

const AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE.ORDINARY_ENTITY,
    matches: (evidence) => evidence.priorityPartition !== true,
  }),
  Object.freeze({
    state: AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE.PRIORITY_RECOVERY_CLOSED,
    matches: (evidence) =>
      evidence.recoveryActive !== true ||
      (
        evidence.publicationPublished === true &&
        evidence.prioritySummarySatisfied === true
      ),
  }),
  Object.freeze({
    state: AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE.PRIORITY_RECOVERY_OPEN,
    matches: (evidence) =>
      evidence.priorityPartition === true &&
      evidence.recoveryActive === true,
  }),
]);

class UnifiedRebalancerAvailableNodes extends UnifiedRebalancerLifecycleBase {
  getReservedPriorityRecoveryMoveSlots() {
    if (
      !this.isSystemPartitionEntity() ||
      this.isControlPlanePriorityPartition()
    ) {
      return NUM.ZERO;
    }
    return this.getPriorityRecoveryAdmissionPlan().getReservedNonPrioritySlots(
      this.entityId,
      UNIFIED_REBALANCER_LITERAL.MOVE,
    );
  }

  /**
   * During active priority control-plane recovery we must not deadlock by
   * filtering candidate nodes to the last published active membership set.
   * All other placement continues to use published membership as steady-state
   * topology truth.
   * @return {boolean}
   * @private
   */
  shouldConstrainAvailableNodesToPublishedMembership() {
    const evidence = this.buildAvailableNodeMembershipConstraintEvidence();
    const state = this.resolveAvailableNodeMembershipConstraintState(evidence);
    const action =
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_ACTION_BY_STATE.get(state) ||
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_ACTION
        .CONSTRAIN_TO_PUBLISHED_MEMBERSHIP;
    return action ===
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_ACTION
        .CONSTRAIN_TO_PUBLISHED_MEMBERSHIP;
  }

  /**
   * @return {Object}
   * @private
   */
  buildAvailableNodeMembershipConstraintEvidence() {
    const latestPublicationRow = this.getLatestMembershipPublicationRow();
    const priorityPartitionSummary =
      latestPublicationRow?.priorityPartitionSummary &&
        typeof latestPublicationRow.priorityPartitionSummary ===
          TYPEOF.OBJECT ?
        latestPublicationRow.priorityPartitionSummary :
        latestPublicationRow?.priority_partition_summary &&
          typeof latestPublicationRow.priority_partition_summary ===
            TYPEOF.OBJECT ?
          latestPublicationRow.priority_partition_summary :
          null;
    const publicationStatus = String(
      latestPublicationRow?.status || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toUpperCase();
    return Object.freeze({
      priorityPartition: this.isControlPlanePriorityPartition(),
      recoveryActive: this.isGlobalPriorityControlPlaneRecoveryActive(),
      publicationPublished:
        publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      prioritySummarySatisfied: priorityPartitionSummary?.satisfied === true,
    });
  }

  /**
   * @param {Object} evidence
   * @return {string}
   * @private
   */
  resolveAvailableNodeMembershipConstraintState(evidence) {
    return (
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE_TABLE.find((entry) =>
        entry.matches(evidence),
      )?.state ||
      AVAILABLE_NODE_MEMBERSHIP_CONSTRAINT_STATE.ORDINARY_ENTITY
    );
  }

  /**
   * Resolve the steady-state published active-node set when available.
   * @return {Set<string>|null}
   * @private
   */
  getPublishedActiveNodeIdSet() {
    const publicationRow = this.getLatestPublishedMembershipRow();
    if (!publicationRow) {
      return null;
    }

    const nodeIds = Array.isArray(publicationRow.publishedActiveNodeIds) ?
      publicationRow.publishedActiveNodeIds :
      Array.isArray(publicationRow.published_active_node_ids) ?
        publicationRow.published_active_node_ids :
        [];
    return new Set(
      nodeIds.filter(
        (nodeId) =>
          typeof nodeId === TYPEOF.STRING &&
          nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO,
      ),
    );
  }

  /**
   * Filter cache-backed nodes through canonical readiness, optionally
   * constraining membership to a caller-provided node-id set.
   *
   * @param {Set<string>|null} constrainedNodeIds
   * @return {Array<Object>}
   * @private
   */
  getAvailableNodesConstrainedToNodeIds(constrainedNodeIds = null) {
    let effectiveNodeIds =
      constrainedNodeIds instanceof Set ? new Set(constrainedNodeIds) : null;
    const startupAuthorityNodeIds = this.getStartupAuthorityNodeIdSet();
    if (
      startupAuthorityNodeIds instanceof Set &&
      startupAuthorityNodeIds.size > NUM.ZERO
    ) {
      if (effectiveNodeIds instanceof Set) {
        effectiveNodeIds = new Set(
          [...effectiveNodeIds].filter((nodeId) =>
            startupAuthorityNodeIds.has(nodeId),
          ),
        );
      } else {
        effectiveNodeIds = startupAuthorityNodeIds;
      }
    }
    const readinessDecisionDimension =
      this.resolveNodeReadinessDecisionDimension();
    return this.systemTableCache.filter(SYSTEM_TABLE_NAME.NODES, (node) => {
      const nodeId = node?.node_id || null;
      if (!nodeId) {
        return false;
      }
      if (effectiveNodeIds instanceof Set && !effectiveNodeIds.has(nodeId)) {
        return false;
      }
      const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
        nodeId,
        {
          decisionDimension: readinessDecisionDimension,
        },
      );
      return (
        this.isReadinessDimensionSatisfied(
          readiness,
          readinessDecisionDimension,
        ) ||
        this.isStartupAuthorityControlPlanePlacementEligibleNode(
          node,
          readinessDecisionDimension,
        )
      );
    });
  }

  getStartupAuthorityNodeIdSet() {
    if (!this.isSystemPartitionEntity()) {
      return null;
    }
    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      typeof readinessService.getStartupAuthoritySnapshotSync !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    try {
      const startupAuthority = readinessService.getStartupAuthoritySnapshotSync(
        this.nodeId,
        Date.now(),
      );
      const nodeIds = Array.isArray(startupAuthority?.canonicalStartupNodeIds) ?
        startupAuthority.canonicalStartupNodeIds.filter(
          (nodeId) =>
            typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
        ) :
        [];
      return nodeIds.length > NUM.ZERO ? new Set(nodeIds) : null;
    } catch (_error) {
      return null;
    }
  }

  isStartupAuthorityControlPlanePlacementEligibleNode(
    nodeOrId,
    readinessDecisionDimension = null,
  ) {
    if (
      readinessDecisionDimension &&
      readinessDecisionDimension !==
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ) {
      return false;
    }
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    const nodeId =
      typeof nodeOrId === TYPEOF.STRING ?
        nodeOrId :
        nodeOrId?.node_id || nodeOrId?.nodeId || null;
    if (
      typeof nodeId !== TYPEOF.STRING ||
      nodeId.length === NUM.ZERO ||
      nodeId === this.nodeId
    ) {
      return false;
    }
    const startupAuthorityNodeIds = this.getStartupAuthorityNodeIdSet();
    if (
      !(startupAuthorityNodeIds instanceof Set) ||
      !startupAuthorityNodeIds.has(nodeId)
    ) {
      return false;
    }
    const node =
      typeof nodeOrId === TYPEOF.STRING ?
        this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, nodeId) :
        nodeOrId;
    if (!node || node.status !== SERVICE_STATUS.ACTIVE) {
      return false;
    }
    const connectionState = String(
      node.connection_state || node.connectionState ||
        UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toLowerCase();
    if (
      connectionState !== STATE.CONNECTED &&
      connectionState !== STATE.READY
    ) {
      return false;
    }
    if (
      this.messageRouter &&
      typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION &&
      this.messageRouter.getConnectionState(nodeId) !== STATE.CONNECTED
    ) {
      return false;
    }
    return true;
  }

  /**
   * Apply policy to determine if rebalancing is needed.
   * @param {Object} policy - Policy to apply.
   * @return {Object} Rebalancing decision with reason.
   */
  applyPolicy(policy) {
    return this.movePlanner.applyPolicy(policy);
  }

  /**
   * Get all available nodes from the cache.
   * @readModel REBALANCE_AVAILABLE_NODES — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>} Array of active nodes.
   */
  getAvailableNodes() {
    const publishedActiveNodeIds =
      this.shouldConstrainAvailableNodesToPublishedMembership() ?
        this.getPublishedActiveNodeIdSet() :
        null;
    return this.getAvailableNodesConstrainedToNodeIds(publishedActiveNodeIds);
  }

  /**
   * Resolve the current priority-recovery planning assessment for one
   * in-flight operation when it belongs to the startup-critical control-plane
   * lane.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async getPriorityRecoveryPlanningSnapshot(operation) {
    const partitionId =
      operation?.partitionId || operation?.partition_id || null;
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      partitionId,
    );
    if (!isPriorityControlPlanePartition({partitionId, partitionRow})) {
      return null;
    }
    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      (typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !==
        TYPEOF.FUNCTION &&
        typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !==
          TYPEOF.FUNCTION &&
        typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !==
          TYPEOF.FUNCTION &&
        typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !==
          TYPEOF.FUNCTION &&
        typeof readinessService.getMembershipPublicationPlanningSnapshot !==
          TYPEOF.FUNCTION)
    ) {
      return null;
    }
    const publicationNodeId = this.nodeId;
    const observedAt = Date.now();
    let planningSnapshot = null;
    if (
      typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      planningSnapshot =
        await readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
          publicationNodeId,
          observedAt,
        );
    } else if (
      typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      planningSnapshot =
        await readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
          publicationNodeId,
          observedAt,
        );
    } else if (
      typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      planningSnapshot =
        await readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
          publicationNodeId,
          observedAt,
        );
    } else if (
      typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      planningSnapshot =
        await readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
          publicationNodeId,
          observedAt,
        );
    } else {
      planningSnapshot =
        await readinessService.getMembershipPublicationPlanningSnapshot(
          publicationNodeId,
          observedAt,
        );
    }
    return planningSnapshot && typeof planningSnapshot === TYPEOF.OBJECT ?
      planningSnapshot :
      null;
  }

  /**
   * Resolve an asynchronous priority-recovery planning assessment for one
   * operation.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async getPriorityRecoveryPlanningAssessment(operation) {
    const planningSnapshot =
      await this.getPriorityRecoveryPlanningSnapshot(operation);
    if (!planningSnapshot) {
      return null;
    }
    return buildPriorityRecoveryOperationAssessment({
      operation,
      priorityPartitionSummary:
        planningSnapshot.priorityPartitionSummary || null,
      effectiveEligibleNodeIds:
        resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds,
    });
  }

  /**
   * Resolve a synchronous priority-recovery planning assessment for topology
   * blocker filtering.
   *
   * @param {Object} operation
   * @param {Object} options
   * @param {number} [options.observedAt]
   * @return {Object|null}
   * @private
   */
  getPriorityRecoveryPlanningSnapshotSync(operation, options = {}) {
    const partitionId =
      operation?.partitionId || operation?.partition_id || null;
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      partitionId,
    );
    if (!isPriorityControlPlanePartition({partitionId, partitionRow})) {
      return null;
    }
    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      (typeof readinessService.getPriorityRecoveryPlanningAnswerSync !==
        TYPEOF.FUNCTION &&
        typeof readinessService.getMembershipPublicationPlanningAnswerSync !==
          TYPEOF.FUNCTION &&
        typeof readinessService.getPriorityRecoveryPlanningSnapshotSync !==
          TYPEOF.FUNCTION &&
        typeof readinessService.getMembershipPublicationPlanningSnapshotSync !==
          TYPEOF.FUNCTION)
    ) {
      return null;
    }
    const publicationNodeId = this.nodeId;
    const observedAt = Number.isFinite(options.observedAt) ?
      Math.floor(options.observedAt) :
      Date.now();

    let planningSnapshot = null;
    if (
      typeof readinessService.getPriorityRecoveryPlanningAnswerSync ===
      TYPEOF.FUNCTION
    ) {
      planningSnapshot = readinessService.getPriorityRecoveryPlanningAnswerSync(
        publicationNodeId,
        observedAt,
      );
    } else if (
      typeof readinessService.getMembershipPublicationPlanningAnswerSync ===
      TYPEOF.FUNCTION
    ) {
      planningSnapshot =
        readinessService.getMembershipPublicationPlanningAnswerSync(
          publicationNodeId,
          observedAt,
        );
    } else if (
      typeof readinessService.getPriorityRecoveryPlanningSnapshotSync ===
      TYPEOF.FUNCTION
    ) {
      planningSnapshot =
        readinessService.getPriorityRecoveryPlanningSnapshotSync(
          publicationNodeId,
          observedAt,
        );
    } else if (
      typeof readinessService.getMembershipPublicationPlanningSnapshotSync ===
      TYPEOF.FUNCTION
    ) {
      planningSnapshot =
        readinessService.getMembershipPublicationPlanningSnapshotSync(
          publicationNodeId,
          observedAt,
        );
    }
    return planningSnapshot && typeof planningSnapshot === TYPEOF.OBJECT ?
      planningSnapshot :
      null;
  }

  /**
   * Resolve a synchronous priority-recovery planning assessment for topology
   * blocker filtering.
   *
   * @param {Object} operation
   * @param {Object} options
   * @param {number} [options.observedAt]
   * @return {Object|null}
   * @private
   */
  getPriorityRecoveryPlanningAssessmentSync(operation, options = {}) {
    const planningSnapshot = this.getPriorityRecoveryPlanningSnapshotSync(
      operation,
      options,
    );
    if (!planningSnapshot) {
      return null;
    }
    return buildPriorityRecoveryOperationAssessment({
      operation,
      priorityPartitionSummary:
        planningSnapshot.priorityPartitionSummary || null,
      effectiveEligibleNodeIds:
        resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds,
    });
  }

  /**
   * Group priority add-like operations by partition and identify the sets that
   * no longer block planning once evaluated with the canonical partition-level
   * spread model.
   *
   * @param {Array<Object>} operations
   * @return {Promise<Set<string>>}
   * @private
   */
}

applyUnifiedRebalancerCriticalTopologyMethods(
  UnifiedRebalancerAvailableNodes,
);

export {UnifiedRebalancerAvailableNodes};
