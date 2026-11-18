// Which entities the ordinary-work release fence's stability dwell does NOT
// hold. The fence (rebalancer-priority-recovery-planning-gate-methods.js)
// exists so BACKGROUND SPREAD - moving an entity's replicas to better nodes
// while its replica count is already met - does not compete with priority
// control-plane placement while that placement settles. Work that restores
// the desired replica count is not background spread:
//
//  - a runtime service below its desired replica count actuates the
//    operator's service_definitions target;
//  - a partition with fewer ACTIVE replicas than its declared replication
//    factor is a durability repair (the planner names it
//    replica_count_below_minimum): every moment it waits is a moment the
//    partition survives fewer failures than the operator asked for.
//
// The count is read from ACTIVE replica rows, not from node readiness: a
// readiness projection that defers during formation must not make a fully
// replicated, merely concentrated partition look under-replicated and slip
// past the fence as a "repair". The desired factor is the partitions row,
// decoded by its one authority (replication-target-authority.js).
//
// Explicit-context module: every function takes the rebalancer first.
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../bootstrap/replication-target-authority.js';

const {EntityType, ReplicaStatus, getPartitionRowFromCache} =
  UNIFIED_REBALANCER_SHARED;

const BACKGROUND_SPREAD_FENCE_EXEMPTION = Object.freeze({
  NOT_EXEMPT: 'not_exempt',
  RUNTIME_SERVICE_DESIRED_STATE_DEFICIT:
    'runtime_service_desired_state_deficit',
  PARTITION_DURABILITY_REPAIR: 'partition_durability_repair',
});

/**
 * Whether a partition entity has fewer ACTIVE replicas than its declared
 * replication factor. An undeclared factor is no evidence of a deficit.
 * @param {Object} rebalancer
 * @return {boolean}
 */
function isPartitionBelowDeclaredReplicationFactor(rebalancer) {
  if (rebalancer.entityType !== EntityType.PARTITION) {
    return false;
  }
  const desired = resolveDesiredReplicationFactor(getPartitionRowFromCache(
    rebalancer.systemTableCache,
    rebalancer.entityId,
  ));
  if (desired.source === REPLICATION_TARGET_SOURCE.UNDECLARED) {
    return false;
  }
  const activeReplicaCount = rebalancer.getCurrentReplicas().filter(
    (replica) => replica?.status === ReplicaStatus.ACTIVE,
  ).length;
  return activeReplicaCount < desired.replicationFactor;
}

/**
 * The named exemption class of this entity from the release fence's dwell.
 * @param {Object} rebalancer
 * @return {string} a BACKGROUND_SPREAD_FENCE_EXEMPTION member
 */
function classifyBackgroundSpreadFenceExemption(rebalancer) {
  if (rebalancer.isRuntimeServiceDesiredStateDeficit()) {
    return BACKGROUND_SPREAD_FENCE_EXEMPTION
      .RUNTIME_SERVICE_DESIRED_STATE_DEFICIT;
  }
  if (isPartitionBelowDeclaredReplicationFactor(rebalancer)) {
    return BACKGROUND_SPREAD_FENCE_EXEMPTION.PARTITION_DURABILITY_REPAIR;
  }
  return BACKGROUND_SPREAD_FENCE_EXEMPTION.NOT_EXEMPT;
}

export {
  BACKGROUND_SPREAD_FENCE_EXEMPTION,
  classifyBackgroundSpreadFenceExemption,
};
