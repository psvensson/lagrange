import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DIMENSION,
  EntityType,
  PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT,
  SERVICE_STATUS,
  SYSTEM_TABLE_NAME,
  UNIFIED_REBALANCER_LITERAL,
  getPartitionRowFromCache,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
} = UNIFIED_REBALANCER_SHARED;

const CONTROL_PLANE_PUBLICATION_TRIM_RAFT_LEARNER = 'learner';
const CONTROL_PLANE_READINESS_CONSTRUCTOR = 'constructor';

class UnifiedRebalancerControlPlaneReadinessMethods {
  /**
   * Whether this rebalancer manages a system table partition.
   * @return {boolean}
   */
  isSystemPartitionEntity() {
    if (this.entityType !== EntityType.PARTITION) {
      return false;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    return isSystemTablePartition({
      partitionId: this.entityId,
      partitionRow,
    });
  }

  /**
   * Resolve the readiness decision dimension for node-level rebalancer gates.
   * Critical system partitions must continue converging while publication
   * membership is still closing ACK_PENDING; ordinary entities remain strict.
   *
   * @return {string}
   * @private
   */
  resolveNodeReadinessDecisionDimension() {
    if (this.isSystemPartitionEntity()) {
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  /**
   * Evaluate readiness eligibility from explicit canonical evidence.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   * @private
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    const dimensions =
      readiness?.dimensions && typeof readiness.dimensions === 'object' ?
        readiness.dimensions :
        null;
    if (!dimensions) {
      return false;
    }
    const readinessEvidence = Object.freeze({
      explicitDecisionDimensionPresent:
        Object.hasOwn(dimensions, decisionDimension),
      explicitDecisionDimensionSatisfied:
        dimensions[decisionDimension] === true,
      recoveryEligibilityRequested:
        decisionDimension ===
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      recoveryEligibilitySatisfied:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== false &&
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
        ] === true &&
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] !== false &&
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] !== false &&
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE
        ] !== false &&
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
        ] !== false &&
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !==
          false &&
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== false,
    });
    if (readinessEvidence.explicitDecisionDimensionSatisfied) {
      return true;
    }
    if (
      !readinessEvidence.recoveryEligibilityRequested ||
      readinessEvidence.explicitDecisionDimensionPresent
    ) {
      return false;
    }
    return readinessEvidence.recoveryEligibilitySatisfied;
  }

  /**
   * Whether this entity is one of the startup-critical control-plane
   * partitions that should converge ahead of ordinary workload rebalancing.
   * @return {boolean}
   */
  isControlPlanePriorityPartition() {
    if (this.entityType !== EntityType.PARTITION) {
      return false;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    return isPriorityControlPlanePartition({
      partitionId: this.entityId,
      partitionRow,
    });
  }

  /**
   * Resolve the minimum number of ACTIVE nodes that must satisfy readiness
   * before this entity may continue critical topology spread.
   *
   * Priority control-plane partitions converge against a quorum target during
   * startup so one flapping joiner does not stall every other priority table.
   *
   * @param {number} activeNodeCount
   * @return {number}
   * @private
   */
  resolveCriticalSystemRequiredHealthyNodeCount(activeNodeCount) {
    const normalizedActiveNodeCount =
      Number.isInteger(activeNodeCount) && activeNodeCount > 0 ?
        activeNodeCount :
        0;
    if (normalizedActiveNodeCount === 0) {
      return 0;
    }
    if (!this.isControlPlanePriorityPartition()) {
      return normalizedActiveNodeCount;
    }
    const targetReplicaCount = this.getPriorityControlPlaneTargetReplicaCount();
    const quorumTarget = Math.max(
      1,
      Math.floor(targetReplicaCount / 2) + 1,
    );
    return Math.min(quorumTarget, normalizedActiveNodeCount);
  }

  /**
   * Resolve the quorum-sized distinct-node target for priority control-plane
   * spread. Non-system entities may resume once priority partitions have
   * escaped single-node concentration, even if the final spread target is
   * still converging.
   *
   * @param {number} readyNodeCount
   * @return {number}
   * @private
   */
  resolvePriorityControlPlaneQuorumDistinctNodeCount(readyNodeCount) {
    const normalizedReadyNodeCount =
      Number.isInteger(readyNodeCount) && readyNodeCount > 0 ?
        readyNodeCount :
        0;
    if (normalizedReadyNodeCount === 0) {
      return 0;
    }
    const quorumTarget = Math.max(
      1,
      Math.floor(
        PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT / 2,
      ) + 1,
    );
    return Math.min(quorumTarget, normalizedReadyNodeCount);
  }

  /**
   * Resolve the configured voter target for this priority control-plane
   * partition from the canonical partitions owner row.
   *
   * @return {number}
   * @private
   */
  getPriorityControlPlaneTargetReplicaCount() {
    if (!this.isControlPlanePriorityPartition()) {
      return PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    const configuredReplicaCount = Number(
      partitionRow?.replica_count ?? partitionRow?.replicaCount,
    );
    if (
      Number.isFinite(configuredReplicaCount) &&
      configuredReplicaCount > 0
    ) {
      return Math.floor(configuredReplicaCount);
    }
    return PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT;
  }

  /**
   * `control_plane_publications` owns the publication path other priority
   * partitions depend on, so active publication recovery still requires
   * coverage for every active node. Once the latest publication is closed and
   * priority recovery is inactive, bounded over-target cleanup may use the
   * target-sized visibility policy used by the other priority partitions.
   *
   * @return {boolean}
   * @private
   */
  isControlPlanePublicationPriorityPartition() {
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    const tableId =
      typeof partitionRow?.table_id === 'string' ?
        partitionRow.table_id :
        partitionRow?.tableId;
    return tableId === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS;
  }

  /**
   * A published publication-owner partition with more active voters than its
   * target is in the bounded trim lane. It must not wait for every active node
   * endpoint before planning the standalone-safe remove that reduces voter
   * count back to target.
   *
   * @return {boolean}
   * @private
   */
  hasControlPlanePublicationTrimOverflow() {
    if (!this.isControlPlanePublicationPriorityPartition()) {
      return false;
    }
    const targetReplicaCount = this.getPriorityControlPlaneTargetReplicaCount();
    if (
      !Number.isFinite(targetReplicaCount) ||
      targetReplicaCount <= 0
    ) {
      return false;
    }
    const currentReplicas =
      typeof this.getCurrentReplicas === 'function' ?
        this.getCurrentReplicas() :
        [];
    const activeVoterReplicaCount = (Array.isArray(currentReplicas) ?
      currentReplicas :
      []
    ).filter((replica) => {
      const status = String(
        replica?.status || SERVICE_STATUS.ACTIVE,
      ).toLowerCase();
      const raftRole = String(
        replica?.raft_role ||
          replica?.raftRole ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).toLowerCase();
      return (
        status === SERVICE_STATUS.ACTIVE &&
        raftRole !== CONTROL_PLANE_PUBLICATION_TRIM_RAFT_LEARNER
      );
    }).length;
    return activeVoterReplicaCount > targetReplicaCount;
  }

  /**
   * Resolve one canonical endpoint-visibility policy for the current critical
   * system partition.
   *
   * @param {string[]} activeNodeIds
   * @return {{allowReadinessBackfill:boolean,requiredReadyNodeCount:number}}
   * @private
   */
  getCriticalSystemEndpointVisibilityPolicy(activeNodeIds = []) {
    const activeNodeCount = Array.isArray(activeNodeIds) ?
      activeNodeIds.filter(
        (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
      ).length :
      0;
    const isPriorityPartition = this.isControlPlanePriorityPartition();
    const requireEveryActiveNode =
      this.shouldRequireFullControlPlanePublicationEndpointVisibility();
    const requiredReadyNodeCount =
      isPriorityPartition &&
      !requireEveryActiveNode &&
      activeNodeCount > 0 ?
        Math.max(
          1,
          Math.min(
            activeNodeCount,
            this.getPriorityControlPlaneTargetReplicaCount(),
          ),
        ) :
        activeNodeCount;
    return Object.freeze({
      allowReadinessBackfill: isPriorityPartition,
      requiredReadyNodeCount,
    });
  }

  /**
   * Decide whether the publication-owner partition still needs endpoint
   * visibility for every active node before planning.
   *
   * @return {boolean}
   * @private
   */
  shouldRequireFullControlPlanePublicationEndpointVisibility() {
    const isPublicationOwner = this.isControlPlanePublicationPriorityPartition();
    const latestPublicationRow = this.getLatestMembershipPublicationRow();
    const latestPublicationClosed =
      String(
        latestPublicationRow?.status ||
          UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
      ).toUpperCase() === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
    const boundedTrimOverflow =
      latestPublicationClosed &&
      this.hasControlPlanePublicationTrimOverflow();
    const policyEvidence = Object.freeze({
      isPublicationOwner,
      latestPublicationClosed,
      priorityRecoveryActive: this.isPriorityControlPlaneRecoveryActive(),
      boundedTrimOverflow,
    });
    return policyEvidence.isPublicationOwner &&
      policyEvidence.boundedTrimOverflow !== true &&
      (
        !policyEvidence.latestPublicationClosed ||
        policyEvidence.priorityRecoveryActive
      );
  }

  /**
   * Resolve the latest membership publication row, regardless of status.
   * @return {Object|null}
   * @private
   */
  getLatestMembershipPublicationRow() {
    const readinessService = this.controlPlaneReadinessService;
    const publicationService = readinessService?.membershipPublicationService;
    let publicationRow = null;
    if (
      publicationService &&
      typeof publicationService.getLatestClusterPublicationSync ===
        'function'
    ) {
      publicationRow = publicationService.getLatestClusterPublicationSync();
    } else if (
      publicationService &&
      typeof publicationService.getLatestPublicationRowSync === 'function'
    ) {
      publicationRow = publicationService.getLatestPublicationRowSync();
    }
    return publicationRow && typeof publicationRow === 'object' ?
      publicationRow :
      null;
  }

  /**
   * Resolve the latest published membership row when available.
   * @return {Object|null}
   * @private
   */
  getLatestPublishedMembershipRow() {
    const readinessService = this.controlPlaneReadinessService;
    const publicationService = readinessService?.membershipPublicationService;
    const latestPublicationRow = this.getLatestMembershipPublicationRow();
    const publishedPublicationRow =
      this.getPublishedMembershipRowFallback(publicationService);
    return this.selectPublishedMembershipRow(
      latestPublicationRow,
      publishedPublicationRow,
    );
  }

  /**
   * Resolve one published-publication fallback row from the publication owner.
   * @param {Object|null} publicationService
   * @return {Object|null}
   * @private
   */
  getPublishedMembershipRowFallback(publicationService) {
    if (
      publicationService &&
      typeof publicationService.getLatestPublishedClusterPublicationSync ===
        'function'
    ) {
      return publicationService.getLatestPublishedClusterPublicationSync();
    }
    if (
      publicationService &&
      typeof publicationService.getLatestPublishedPublicationRowSync ===
        'function'
    ) {
      return publicationService.getLatestPublishedPublicationRowSync();
    }
    return null;
  }

  /**
   * Choose one published membership row when available.
   * @param {Object|null} latestPublicationRow
   * @param {Object|null} publishedPublicationRow
   * @return {Object|null}
   * @private
   */
  selectPublishedMembershipRow(latestPublicationRow, publishedPublicationRow) {
    const candidateRow =
      String(latestPublicationRow?.status || '').toUpperCase() ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ?
        latestPublicationRow :
        publishedPublicationRow;
    return String(
      candidateRow?.status || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING,
    ).toUpperCase() === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ?
      candidateRow :
      null;
  }
}

function applyUnifiedRebalancerControlPlaneReadinessMethods(targetClass) {
  const sourcePrototype =
    UnifiedRebalancerControlPlaneReadinessMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === CONTROL_PLANE_READINESS_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyUnifiedRebalancerControlPlaneReadinessMethods};
