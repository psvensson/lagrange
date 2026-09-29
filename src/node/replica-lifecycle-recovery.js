import {assertCritical} from '../utils/assert.js';
import {
  REPLICA_LIFECYCLE_ERROR_MSG,
  REPLICA_LIFECYCLE_EVENT,
  REPLICA_LIFECYCLE_LOG_MSG,
} from './replica-lifecycle-constants.js';

/**
 * Re-enter recovery through the ReplicaStateMachine lifecycle owner.
 *
 * ReplicaLifecycleManager remains a compatibility delegator for callers that
 * initiate recovery through it. It does not interpret cached state or write a
 * SERVICES lifecycle field: the owner performs a fresh authoritative read,
 * exact-generation transition, and classified outcome observation.
 * @param {Object} manager ReplicaLifecycleManager delegator.
 * @return {Promise<Object>} Canonical recovery result.
 */
async function runReplicaLifecycleRecovery(manager) {
  manager.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_START, {
    nodeId: manager.nodeId,
  });
  assertCritical(
    manager.systemTableCache,
    REPLICA_LIFECYCLE_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
  );
  const lifecycleOwner = assertCritical(
    manager.replicaHandler?.replicaStateMachine ||
      manager.replicaStateMachine,
    REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED,
  );
  const result = await lifecycleOwner.handleNodeRecovery({
    nodeId: manager.nodeId,
    systemTableCache: manager.systemTableCache,
  });
  manager.emit(REPLICA_LIFECYCLE_EVENT.RECOVERY_COMPLETE, {
    ...result,
    orphanedCount: result.total,
    quarantinedOrphanedFiles: 0,
    reconciliationSweepCompleted: false,
  });
  return result;
}

export {
  runReplicaLifecycleRecovery,
};
