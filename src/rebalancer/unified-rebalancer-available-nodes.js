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
  hasAvailablePriorityRecoveryPlanningProvider as hasAvailablePlanningProvider,
  readAvailablePriorityRecoveryPlanningSnapshot as readAvailablePlanningSnapshot,
} from './priority-recovery-planning-read.js';
import {
  readPriorityRecoveryPlanningAnswerSync,
} from '../control-plane/priority-recovery-planning-answer-origin.js';
import {
  isDeferredReadinessPlanningSnapshot,
} from '../control-plane/readiness-planning-version-contract.js';
import {
  AVAILABLE_NODE_EXCLUSION_REASON,
  AVAILABLE_NODE_PLANNING_STATE,
} from './rebalancer-no-target-pass-diagnostic.js';

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

function freezeCandidate(nodeId, state, reason) {
  return Object.freeze({nodeId, state, reason});
}

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
    return this.resolveAvailableNodePlan(constrainedNodeIds).availableNodes;
  }

  /**
   * Classify every committed candidate node for this entity's placement:
   * READY, NOT_READY (with the reason), DEFERRED (the planning readiness
   * owner answered neither: its completed record was not current, a rebuild
   * is queued) or OUT_OF_SCOPE. Deferred is never folded into not-ready:
   * a pass that finds no target only because of a deferral waits for the
   * publication that answers it (rebalancer-local-mutation-readiness-wake).
   *
   * @param {Set<string>|null} constrainedNodeIds
   * @return {{availableNodes: Array<Object>, candidates: Array<Object>}}
   * @private
   */
  resolveAvailableNodePlan(constrainedNodeIds = null) {
    // Observed before the reads: a publication that lands after them is
    // newer than this generation, which a wait armed on this answer
    // compares against (rebalancer-local-mutation-readiness-wake.js).
    const planningPublicationGeneration =
      this.readPlanningPublicationGeneration();
    const effectiveNodeIds =
      this.resolveEffectiveAvailableNodeScope(constrainedNodeIds);
    const readinessDecisionDimension =
      this.resolveNodeReadinessDecisionDimension();
    const now = ownerNowMs(this);
    const availableNodes = [];
    const candidates = [];
    for (const node of this.resolveAvailableNodeCandidateRows()) {
      const candidate = this.classifyAvailableNodeCandidate(
        node,
        effectiveNodeIds,
        readinessDecisionDimension,
        now,
      );
      if (!candidate) continue;
      candidates.push(candidate);
      if (candidate.state === AVAILABLE_NODE_PLANNING_STATE.READY) {
        availableNodes.push(node);
      }
    }
    return Object.freeze({
      availableNodes,
      candidates: Object.freeze(candidates),
      readinessDecisionDimension,
      planningPublicationGeneration,
    });
  }

  /**
   * The one readiness read variant this entity's placement decisions use:
   * the planning owner keys a completed answer by these options, so two
   * readers of one decision with different options read two answers that
   * can disagree in one synchronous step.
   * @param {string} [readinessDecisionDimension]
   * @return {Object}
   */
  buildPlanningReadinessReadOptions(
    readinessDecisionDimension = this.resolveNodeReadinessDecisionDimension(),
  ) {
    const readinessOptions = {
      decisionDimension: readinessDecisionDimension,
    };
    if (this.isFormationLivenessDependencyPartition()) {
      readinessOptions.allowStaleOnCacheChange = false;
    }
    return readinessOptions;
  }

  resolveEffectiveAvailableNodeScope(constrainedNodeIds) {
    const effectiveNodeIds =
      constrainedNodeIds instanceof Set ? new Set(constrainedNodeIds) : null;
    const startupAuthorityNodeIds = this.getStartupAuthorityNodeIdSet();
    if (
      !(startupAuthorityNodeIds instanceof Set) ||
      startupAuthorityNodeIds.size === 0
    ) {
      return effectiveNodeIds;
    }
    return effectiveNodeIds instanceof Set ?
      new Set([...effectiveNodeIds].filter((nodeId) =>
        startupAuthorityNodeIds.has(nodeId))) :
      startupAuthorityNodeIds;
  }

  /**
   * @param {Object} node
   * @param {Set<string>|null} effectiveNodeIds
   * @param {string} readinessDecisionDimension
   * @param {number} now
   * @return {{nodeId: string, state: string, reason: string|null}|null}
   * @private
   */
  classifyAvailableNodeCandidate(
    node,
    effectiveNodeIds,
    readinessDecisionDimension,
    now,
  ) {
    const nodeId = node?.node_id || null;
    if (!nodeId) return null;
    if (effectiveNodeIds instanceof Set && !effectiveNodeIds.has(nodeId)) {
      return freezeCandidate(nodeId,
        AVAILABLE_NODE_PLANNING_STATE.OUT_OF_SCOPE,
        AVAILABLE_NODE_EXCLUSION_REASON.OUTSIDE_PLACEMENT_SCOPE);
    }
    const readiness = this.resolveNodeReadinessSyncSnapshot(
      nodeId,
      this.buildPlanningReadinessReadOptions(readinessDecisionDimension),
    );
    const exclusionReason =
      this.isStartupAuthorityControlPlanePlacementEligibleNode(
        node,
        readinessDecisionDimension,
      ) ?
        (this.isStartupAuthorityPlacementDispatchReady(
          nodeId,
          readiness,
          readinessDecisionDimension,
        ) ? null : AVAILABLE_NODE_EXCLUSION_REASON.DISPATCH_NOT_READY) :
        this.resolveActiveLeasedNodeExclusion(
          node,
          readiness,
          readinessDecisionDimension,
          now,
        );
    if (exclusionReason === null) {
      return freezeCandidate(nodeId, AVAILABLE_NODE_PLANNING_STATE.READY, null);
    }
    return isDeferredReadinessPlanningSnapshot(readiness) ?
      freezeCandidate(nodeId, AVAILABLE_NODE_PLANNING_STATE.DEFERRED,
        AVAILABLE_NODE_EXCLUSION_REASON.READINESS_DEFERRED) :
      freezeCandidate(nodeId, AVAILABLE_NODE_PLANNING_STATE.NOT_READY,
        exclusionReason);
  }

  /**
   * Why one active node with a non-expired ready lease does NOT satisfy the
   * requested readiness decision dimension, or null when it does.
   *
   * @param {Object} node
   * @param {Object|null} readiness
   * @param {string} readinessDecisionDimension
   * @param {number} now
   * @return {string|null}
   * @private
   */
  resolveActiveLeasedNodeExclusion(
    node,
    readiness,
    readinessDecisionDimension,
    now,
  ) {
    const liveness = projectNodeLivenessSemantics({nodeRow: node, nowMs: now}).projection;
    if (liveness.readyNow !== true) {
      return AVAILABLE_NODE_EXCLUSION_REASON.LIVENESS_NOT_READY;
    }
    if (
      !this.isReadinessDimensionSatisfied(
        readiness,
        readinessDecisionDimension,
      )
    ) {
      return AVAILABLE_NODE_EXCLUSION_REASON.READINESS_DIMENSION_UNSATISFIED;
    }
    return (
      readinessDecisionDimension !==
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE ||
      readiness?.dimensions?.[
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE
      ] === true
    ) ? null : AVAILABLE_NODE_EXCLUSION_REASON.READINESS_DIMENSION_UNSATISFIED;
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
        startupAuthority?.formationReleaseHandoff?.active === true,
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
    return this.getAvailableNodePlan().availableNodes;
  }

  /**
   * The classified placement answer getAvailableNodes reads: every candidate
   * with its READY / NOT_READY / DEFERRED / OUT_OF_SCOPE state and reason.
   * @return {{availableNodes: Array<Object>, candidates: Array<Object>}}
   */
  getAvailableNodePlan() {
    const publishedActiveNodeIds =
      this.shouldConstrainAvailableNodesToPublishedMembership() ?
        this.getPublishedActiveNodeIdSet() :
        null;
    return this.resolveAvailableNodePlan(publishedActiveNodeIds);
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
    if (!hasAvailablePlanningProvider(readinessService)) {
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
