/**
 * Owner contract:
 * Owner: the CREATE_REPLICA target's prior-existence fact for the open-time
 * rule (owner ruling 2026-10-05): whether this replica identity already
 * opened its raft record on this node, read from the authoritative SERVICES
 * row before the create writes any status of its own.
 * Inputs: the replica handler (its lifecycle state machine and node id) and
 * the replica id.
 * Canonical output: a boolean the partition hands its port as
 * IDENTITY_EXISTED; the participation gate's opening admission decides.
 * Prohibited: no absence is read as a first opening - an unreadable row
 * defers the create.
 */
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {observeAuthoritativeReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';
import {
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const CREATE_OWNER_DEFERRED_CODE = 'CREATE_OWNER_DEFERRED';
// The SERVICES statuses the target writes only after its partition port
// opened (createReplicaAsync: SYNCING right after the open, ACTIVE after
// it): a row of this replica on this node in one of them is an earlier
// incarnation that opened its raft record.
const OPENED_REPLICA_STATUSES = new Set([
  ReplicaStatus.SYNCING, ReplicaStatus.ACTIVE]);

/**
 * Whether this replica identity existed on this node before (the open-time
 * rule, 2026-10-05): the authoritative SERVICES row for it, read before
 * this create writes any status, names this node in a status written only
 * after an earlier open. A row that cannot be read authoritatively defers
 * the create (absence is never read as a first opening); a handler with no
 * lifecycle authority wired reads nothing and proves nothing.
 * @param {Object} handler - The replica handler.
 * @param {string} replicaId - The replica.
 * @return {Promise<boolean>}
 */
async function observeReplicaIdentityExisted(handler, replicaId) {
  if (typeof handler.replicaStateMachine
    ?.getControlPlaneSystemTableGateway !== REPLICA_HANDLER_TYPEOF.FUNCTION) {
    return false;
  }
  const observation = await observeAuthoritativeReplicaLifecycle(
    handler.replicaStateMachine, replicaId);
  if (observation.available !== true) {
    const error = new Error(
      `Replica prior-existence read deferred for ${replicaId}`);
    error.code = CREATE_OWNER_DEFERRED_CODE;
    error.deferRetry = true;
    throw error;
  }
  const row = observation.row;
  return row?.node_id === handler.nodeId &&
    OPENED_REPLICA_STATUSES.has(row?.status);
}

/**
 * The identity record of a create that writes its own prior-existence fact
 * AFTER its port opens (verifier N3, the open-to-SYNCING window): the port
 * is handed `recorded` and steps nothing until it resolves, so a crash
 * before the SYNCING write leaves a core that never voted. Null when the
 * fact is already durable (the identity existed: the record restores, or the
 * open is refused) or this create writes no status (runtime repair, admitted
 * only on an ACTIVE row).
 * @param {Object} options - {existed, skipLifecycleStatusPersistence}.
 * @return {Object|null} {recorded, release, abandon}.
 */
function pendingReplicaIdentityRecord({existed,
  skipLifecycleStatusPersistence}) {
  if (existed === true || skipLifecycleStatusPersistence === true) {
    return null;
  }
  const {promise, resolve, reject} = Promise.withResolvers();
  // An abandoned record releases nothing; nobody else awaits it.
  promise.catch(() => undefined);
  return {recorded: promise, release: resolve, abandon: reject};
}

function trackedLifecycleState(handler, replicaId) {
  const tracked = handler.replicaStateMachine?.getState?.(replicaId) ?? null;
  return typeof tracked === REPLICA_HANDLER_TYPEOF.STRING ?
    tracked : tracked?.state ?? null;
}

/**
 * Write the prior-existence fact (SYNCING) through the status owner's
 * bounded retry and release the record on its durable acknowledgement only.
 * A write that ends without it (refused, unknown past the retry bound) logs
 * the spent wait, abandons the record - the port, which never stepped
 * anything, is closed by the create's failure path - and rethrows. A write
 * whose answer was lost resolves inside the retry, against the authoritative
 * row (replica-state-machine-create-syncing-edge.js): the row SYNCING for
 * this incarnation on this node IS the release condition.
 * @param {Object} handler - The replica handler.
 * @param {string} replicaId - The replica.
 * @param {string} partitionId - Its partition.
 * @param {Object|null} record - The pending identity record, if any.
 * @return {Promise<void>}
 */
async function recordReplicaIdentity(handler, replicaId, partitionId,
  record) {
  if (record === null &&
      trackedLifecycleState(handler, replicaId) === ReplicaStatus.SYNCING) {
    // A create resumed on its own durable SYNCING row: the fact is written.
    return;
  }
  try {
    await handler.persistReplicaStatusWithRetry(replicaId,
      ReplicaStatus.SYNCING, {partitionId});
  } catch (error) {
    if (record !== null) {
      handler.logger.warn(REPLICA_HANDLER_LOG_MSG.IDENTITY_RECORD_WAIT_SPENT, {
        replicaId,
        partitionId,
        awaited: ReplicaStatus.SYNCING,
        lastObserved: error?.message ?? null,
        nodeId: handler.nodeId,
      });
      record.abandon(error);
    }
    throw error;
  }
  record?.release();
}

/**
 * The create's prior-existence read and, when the fact is not yet durable,
 * its pending identity record (pendingReplicaIdentityRecord).
 * @param {Object} handler - The replica handler.
 * @param {string} replicaId - The replica.
 * @param {boolean} skipLifecycleStatusPersistence - A runtime repair.
 * @return {Promise<Object>} {existed, record}.
 */
async function observeReplicaIdentity(handler, replicaId,
  skipLifecycleStatusPersistence) {
  const existed = await observeReplicaIdentityExisted(handler, replicaId);
  return {existed, record: pendingReplicaIdentityRecord({existed,
    skipLifecycleStatusPersistence})};
}

export {
  observeReplicaIdentity,
  observeReplicaIdentityExisted,
  pendingReplicaIdentityRecord,
  recordReplicaIdentity,
};
