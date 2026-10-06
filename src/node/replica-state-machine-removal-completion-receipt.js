import {SERVICE_TYPE} from '../constants/index.js';
import {REPLICA_CLEANUP_AUTHORITY_KIND} from
  './replica-cleanup-constants.js';
import {observeAuthoritativeReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';

function rowMatchesReceipt(row, receipt, authority) {
  return rowMatchesReceiptIdentity(row, receipt) &&
    rowMatchesReceiptCompletion(row, receipt) &&
    authorityOwnsReceipt(authority, receipt);
}

function rowMatchesReceiptIdentity(row, receipt) {
  return row?.service_id === receipt.replicaId &&
    row?.partition_id === receipt.partitionId &&
    row?.node_id === receipt.nodeId &&
    row?.cleanup_token === receipt.ownerToken;
}

function rowMatchesReceiptCompletion(row, receipt) {
  return row?.service_type === SERVICE_TYPE.PARTITION_CLEANUP &&
    row?.status === REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE &&
    row?.updated_at === receipt.updatedAt;
}

function authorityOwnsReceipt(authority, receipt) {
  return authority?.replicaState?.cleanupToken === receipt.ownerToken;
}

function createRemovalCompletionReceiptVerifier(options) {
  const {stateMachine, replicaId, authority, isAuthorityCurrent} = options;
  let receipt = null;
  const requireCurrent = async () => {
    if (!receipt || !isAuthorityCurrent()) return false;
    const observation = await observeAuthoritativeReplicaLifecycle(
      stateMachine,
      replicaId,
    );
    return observation.available === true &&
      rowMatchesReceipt(observation.row, receipt, authority);
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
