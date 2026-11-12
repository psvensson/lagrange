// Lifecycle completion consumes the cleanup owner's full receipt identity and
// its issued binding to the original serialized removal generation.
import {rowMatchesCleanupAuthority} from './replica-cleanup-tombstone-owner.js';
import {observeAuthoritativeReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';

function createRemovalCompletionReceiptVerifier(options) {
  const {stateMachine, replicaId, ownsCompletionReceipt, isAuthorityCurrent} = options;
  let receipt = null;
  const isBound = () => receipt !== null && isAuthorityCurrent() &&
    typeof ownsCompletionReceipt === 'function' && ownsCompletionReceipt(receipt);
  const requireCurrent = async () => {
    if (!isBound()) return false;
    const observation = await observeAuthoritativeReplicaLifecycle(
      stateMachine,
      replicaId,
    );
    return isBound() && observation.available === true &&
      rowMatchesCleanupAuthority(observation.row, receipt);
  };
  return Object.freeze({
    confirm: async (candidate) => {
      receipt = candidate || null;
      if (await requireCurrent()) return true;
      receipt = null;
      return false;
    },
    requireCurrent,
  });
}

export {createRemovalCompletionReceiptVerifier};
