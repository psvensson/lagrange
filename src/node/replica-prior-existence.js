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
import {REPLICA_HANDLER_TYPEOF} from './replica-handler-constants.js';

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

export {observeReplicaIdentityExisted};
