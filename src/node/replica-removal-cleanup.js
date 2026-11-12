// Exact handoff from a serialized REMOVING generation to durable cleanup,
// then physical release, artifact deletion and completion of that same generation.
// A retry consumes the issued token and captured runtime; it never adopts one.
import {isFailedCreateRemoveToken} from '../rebalancer/failed-create-cleanup-token.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {removalRowDeleteDeferred} from './replica-removal-debt-errors.js';
import {REPLICA_CLEANUP_PHASE} from './replica-cleanup-constants.js';

const REPLICA_REMOVE_EXECUTION_REASON = Object.freeze({
  DURABLE_REMOVE_CLEANUP_COMPLETE: 'durable_remove_cleanup_complete',
});
async function takeoverRemovingRowForCleanupOrThrow(
  handler,
  replicaId,
  authority,
  guard,
  reason,
  service,
) {
  if (!await guard.requireRemoving() || !guard.isCurrent()) {
    throw removalRowDeleteDeferred(replicaId);
  }
  const admissionClosed = await handler.getReplicaCreateAdmissionOwner()
    .closeForLifecycle(authority.replicaState);
  if (admissionClosed !== true || !guard.isCurrent() ||
      guard.beginExactDelete() !== true) {
    throw removalRowDeleteDeferred(replicaId);
  }
  const cleanupAuthority = await handler.getReplicaCleanupTombstoneOwner()
    .takeoverRemoving(authority, reason, service);
  if (!cleanupAuthority || !guard.isCurrent()) {
    throw removalRowDeleteDeferred(replicaId);
  }
  return cleanupAuthority;
}

async function completeCleanupTombstoneOrThrow(
  handler,
  replicaId,
  partitionId,
  service,
  cleanupAuthority,
  guard,
) {
  const owner = handler.getReplicaCleanupTombstoneOwner();
  if (!guard.isCurrent()) throw removalRowDeleteDeferred(replicaId);
  if (owner.removalCleanupPhase(cleanupAuthority) === REPLICA_CLEANUP_PHASE.PHYSICAL) {
    if (!await owner.requireCurrent(cleanupAuthority) || !guard.isCurrent()) {
      throw removalRowDeleteDeferred(replicaId);
    }
    await handler.cleanupRemovedReplicaLocalRuntime(
      replicaId, partitionId, service, cleanupAuthority);
  }
  if (isFailedCreateRemoveToken(cleanupAuthority.ownerToken)) {
    const completionReceipt = await owner.markComplete(
      cleanupAuthority,
      {artifactsAbsent: true},
    );
    if (!completionReceipt ||
        !await guard.confirmCleanupComplete(completionReceipt)) {
      throw removalRowDeleteDeferred(replicaId);
    }
    return true;
  }
  if (!await owner.release(cleanupAuthority, {artifactsAbsent: true}) ||
      !await guard.confirmDeleted()) {
    throw removalRowDeleteDeferred(replicaId);
  }
  return true;
}

async function runRemovalEffectsOrThrow(
  handler,
  replicaId,
  authority,
  action,
  onComplete,
  context,
) {
  const owner = handler.getReplicaCleanupTombstoneOwner();
  const applied = await handler.replicaStateMachine
    .completeDurableRemovalWithAuthority(
      replicaId,
      authority,
      action,
      onComplete,
      {...context, ownsCompletionReceipt: (receipt) =>
        owner.ownsRemovalCompletionReceipt(authority, receipt)},
    );
  if (applied !== true) throw removalRowDeleteDeferred(replicaId);
  return true;
}

// Resume only the exact handoff this cleanup owner issued. The state-machine
// lane revalidates both its original generation and the durable cleanup token.
async function resumeRemovalCleanup(handler, replicaId, partitionId, continuation) {
  const {removalAuthority, cleanupAuthority, service} = continuation;
  await runRemovalEffectsOrThrow(handler, replicaId, removalAuthority,
    async (guard) => {
      if (continuation.phase === REPLICA_CLEANUP_PHASE.TAKEOVER) {
        await handler.getReplicaCleanupTombstoneOwner().takeoverRemoving(
          removalAuthority, continuation.reason, service);
      }
      await completeCleanupTombstoneOrThrow(handler, replicaId, partitionId,
        service, cleanupAuthority, guard);
      return true;
    }, () => {
      if (handler.getTrackedService(replicaId) !== service) return;
      handler.localServices.delete(replicaId);
      handler.setLocalReplica(replicaId, {replicaId, partitionId,
        status: ReplicaStatus.REMOVED, service: null});
    }, {partitionId, nodeId: handler.nodeId, serviceId: replicaId,
      reason: REPLICA_REMOVE_EXECUTION_REASON.DURABLE_REMOVE_CLEANUP_COMPLETE,
      cleanupContinuation: continuation});
  handler.getReplicaCleanupTombstoneOwner().finishRemovalContinuation(cleanupAuthority);
  return true;
}

export {REPLICA_REMOVE_EXECUTION_REASON, takeoverRemovingRowForCleanupOrThrow,
  completeCleanupTombstoneOrThrow, runRemovalEffectsOrThrow, resumeRemovalCleanup};
