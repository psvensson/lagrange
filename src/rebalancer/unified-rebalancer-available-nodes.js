import {readUpperStateField} from '../utils/state-field-read.js';
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {UnifiedRebalancerLifecycleBase} from './unified-rebalancer-lifecycle-base.js';
import {
  applyUnifiedRebalancerCriticalTopologyMethods,
} from './unified-rebalancer-critical-topology-methods.js';
import {
  FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION,
  classifyFormationCohortSpreadCureNode,
  isStartupAuthorityControlPlanePlacementEligibleNode as
  isStartupAuthorityPlacementEligibleNode,
  resolveStartupAuthorityNodeIdSet,
} from '../control-plane/startup-authority-placement-eligibility.js';
import {
  resolvePublishedActiveNodeIds,
} from '../control-plane/active-node-publication-snapshots.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-owner.js';
import {projectNodeLivenessSemantics} from
  '../control-plane/node-liveness-semantic-projection.js';
import {
  readAvailablePriorityRecoveryPlanningSnapshot as readAvailablePlanningSnapshot,
} from './priority-recovery-planning-read.js';
import {
  readPriorityRecoveryPlanningAnswerSync,
} from '../control-plane/priority-recovery-planning-answer-origin.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
  buildPriorityRecoveryOperationAssessment,
  classifySystemPartition,
  getPartitionRowFromCache,
  ownerNowMs,
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
    matches: (evidence) => evidence.recoveryLaneParticipant !== true,
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
      evidence.recoveryLaneParticipant === true &&
      evidence.recoveryActive === true,
  }),
]);

class UnifiedRebalancerAvailableNodes extends UnifiedRebalancerLifecycleBase {
  getReservedPriorityRecoveryMoveSlots() {
    if (
      !this.isSystemPartitionEntity() ||
      this.isControlPlanePriorityPartition()
    ) {
      return 0;
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
          'object' ?
        latestPublicationRow.priorityPartitionSummary :
        latestPublicationRow?.priority_partition_summary &&
          typeof latestPublicationRow.priority_partition_summary ===
            'object' ?
          latestPublicationRow.priority_partition_summary :
          null;
    const publicationStatus = readUpperStateField(latestPublicationRow?.status);
    return Object.freeze({
      priorityPartition: this.isControlPlanePriorityPartition(),
      formationLivenessDependency:
        this.isFormationLivenessDependencyPartition(),
      recoveryLaneParticipant:
        this.isControlPlanePriorityPartition() ||
        this.isFormationLivenessDependencyPartition(),
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
   * Resolve the steady-state published active-node set when available. What
   * a published row's member list means (none, or which nodes) is the
   * publication snapshot owner's answer; this reader only picks the row.
   * @return {Set<string>|null}
   * @private
   */
  getPublishedActiveNodeIdSet() {
    const publishedActiveNodeIds = resolvePublishedActiveNodeIds({
      latestPublishedPublicationRow: this.getLatestPublishedMembershipRow(),
    });
    return publishedActiveNodeIds === null ?
      null :
      new Set(publishedActiveNodeIds);
  }

  /**
   * Filter committed nodes through canonical readiness, optionally
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
      startupAuthorityNodeIds.size > 0
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
    const candidateRows = this.resolveAvailableNodeCandidateRows();
    const now = ownerNowMs(this);
    return candidateRows.filter((node) => {
      const nodeId = node?.node_id || null;
      if (!nodeId || (effectiveNodeIds instanceof Set && !effectiveNodeIds.has(nodeId))) {
        return false;
      }
      const readinessOptions = {
        decisionDimension: readinessDecisionDimension,
      };
      if (this.isFormationLivenessDependencyPartition()) {
        readinessOptions.allowStaleOnCacheChange = false;
      }
      const readiness = this.resolveNodeReadinessSyncSnapshot(
        nodeId,
        readinessOptions,
      );
      if (
        this.isStartupAuthorityControlPlanePlacementEligibleNode(
          node,
          readinessDecisionDimension,
        )
      ) {
        return this.isStartupAuthorityPlacementDispatchReady(
          nodeId,
          readiness,
          readinessDecisionDimension,
        );
      }
      return this.isCandidateActiveLeasedNode(
        node,
        readiness,
        readinessDecisionDimension,
        now,
      );
    });
  }

  /**
   * Decide whether one active node with a non-expired ready lease satisfies
   * the requested readiness decision dimension.
   *
   * @param {Object} node
   * @param {Object|null} readiness
   * @param {string} readinessDecisionDimension
   * @param {number} now
   * @return {boolean}
   * @private
   */
  isCandidateActiveLeasedNode(
    node,
    readiness,
    readinessDecisionDimension,
    now,
  ) {
    const liveness = projectNodeLivenessSemantics({nodeRow: node, nowMs: now}).projection;
    if (liveness.readyNow !== true) {
      return false;
    }
    if (
      !this.isReadinessDimensionSatisfied(
        readiness,
        readinessDecisionDimension,
      )
    ) {
      return false;
    }
    return (
      readinessDecisionDimension !==
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE ||
      readiness?.dimensions?.[
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE
      ] === true
    );
  }

  // The rebalancer's readiness service is the node's one service, a named
  // collaborator required at construction (requireControlPlaneReadinessService)
  // and only ever replaced by the coordinator's: every read here calls it.
  resolveAvailableNodeCandidateRows() {
    const answer = this.controlPlaneReadinessService.answerCommittedNodes();
    if (
      answer?.state === SERVE_ELIGIBILITY_STATE.READY &&
      Array.isArray(answer.nodeRows)
    ) {
      return answer.nodeRows;
    }
    return [];
  }

  getStartupAuthorityNodeIdSet() {
    if (!this.isSystemPartitionEntity()) {
      return null;
    }
    const readinessService = this.controlPlaneReadinessService;
    try {
      const startupAuthority = readinessService.getStartupAuthoritySnapshotSync(
        this.nodeId,
      );
      const nodeIds = resolveStartupAuthorityNodeIdSet(startupAuthority);
      return nodeIds.size > 0 ? nodeIds : null;
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
      typeof nodeOrId === 'string' ?
        nodeOrId :
        nodeOrId?.node_id || nodeOrId?.nodeId || null;
    if (
      typeof nodeId !== 'string' ||
      nodeId.length === 0
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
      typeof nodeOrId === 'string' ?
        this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, nodeId) :
        nodeOrId;
    return isStartupAuthorityPlacementEligibleNode({
      node,
      startupAuthorityNodeIds,
      messageRouter: this.messageRouter,
      localNodeId: this.nodeId,
      includeSelf: true,
    });
  }

  isFormationCohortSpreadCureTarget(nodeOrId) {
    const node = typeof nodeOrId === 'string' ?
      this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, nodeOrId) :
      nodeOrId;
    const startupAuthority = this.getStartupAuthoritySnapshot();
    const startupAuthorityNodeIds =
      resolveStartupAuthorityNodeIdSet(startupAuthority);
    return classifyFormationCohortSpreadCureNode({
      node,
      startupAuthorityNodeIds,
      messageRouter: this.messageRouter,
      localNodeId: this.nodeId,
      includeSelf: true,
      priorityRecoveryLane: this.isControlPlanePriorityPartition(),
      priorityRecoveryActive:
        this.isGlobalPriorityControlPlaneRecoveryActive(),
      formationReleaseHandoffActive:
        startupAuthority?.formationReleaseHandoff?.active === true &&
        startupAuthority?.formationReleaseHandoff?.releaseAuthorized === true,
    }) === FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION.CURE_TARGET;
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
   * Runtime-liveness probe (NOT serve-readiness): is the node's process alive
   * and reporting runtime authority right now? A node mid-restart that has
   * materialized a replica is process-alive but may not yet satisfy the stricter
   * serve/placement readiness dimension getAvailableNodes uses. A genuinely
   * dead/evicted node — including one retained in the published membership list
   * by a membership freeze — is NOT process-alive, because processAlive reflects
   * live runtime-authority evidence, not membership-list retention. The
   * over-replication deficit gate uses this to count a settling replica on a
   * restarting node (defer the redundant ADD) while still re-placing a replica on
   * a genuinely dead node.
   * @param {string} nodeId
   * @return {boolean}
   */
  isNodeProcessAlive(nodeId) {
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, {
      decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
    });
    return this.isReadinessDimensionSatisfied(
      readiness,
      CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
    );
  }

  /**
   * Resolve the AVAILABLE priority-recovery planning snapshot for one
   * in-flight operation when it belongs to the startup-critical control-plane
   * lane.
   *
   * This family plans and narrates; it never decides REMOVE safety, so it
   * reads the AVAILABLE contract only. The read policy itself is owned by
   * priority-recovery-planning-read.js, which this family and the
   * operation-workflow family both delegate to.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async readAvailablePriorityRecoveryPlanningSnapshot(operation) {
    const partitionId =
      operation?.partitionId || operation?.partition_id || null;
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      partitionId,
    );
    if (!classifySystemPartition({partitionId, partitionRow})
      .priorityControlPlane) {
      return null;
    }
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService) {
      return null;
    }
    return readAvailablePlanningSnapshot({
      readinessService,
      publicationNodeId: this.nodeId,
      observedAt: readinessService.now(),
    });
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
      await this.readAvailablePriorityRecoveryPlanningSnapshot(operation);
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
    if (!classifySystemPartition({partitionId, partitionRow})
      .priorityControlPlane) {
      return null;
    }
    const readinessService = this.controlPlaneReadinessService;
    const publicationNodeId = this.nodeId;
    const observedAt = Number.isFinite(options.observedAt) ?
      Math.floor(options.observedAt) :
      readinessService.now();

    return readPriorityRecoveryPlanningAnswerSync(
      readinessService,
      publicationNodeId,
      observedAt,
    );
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
