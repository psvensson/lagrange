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
 * defers the create; a FAILED identity that ever opened is never re-driven
 * under the same replica id (K3: it may have voted or acked, and a wiped
 * record would reopen empty).
 */
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {observeAuthoritativeReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';
import {
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const CREATE_OWNER_DEFERRED_CODE = 'CREATE_OWNER_DEFERRED';
const OPENED_IDENTITY_RESTART_REFUSED_CODE =
  'REPLICA_OPENED_IDENTITY_RESTART_REFUSED';
// The SERVICES statuses the target writes only after its partition port
// opened (createReplicaAsync: SYNCING right after the open, ACTIVE after
// it): a row of this replica on this node in one of them is an earlier
// incarnation that opened its raft record.
const OPENED_REPLICA_STATUSES = new Set([
  ReplicaStatus.SYNCING, ReplicaStatus.ACTIVE]);
// The sources a FAILED row may name and still be re-driven under its id: it
// failed before its SYNCING write, so its port never stepped anything. The
// state machine carries the fact as the row's previous_state (the CAS'd
// source of the FAILED write); a FAILED row is left only by this re-drive or
// by REMOVING, and the re-drive is refused for every other source, so the
// fact is never overwritten for an identity that opened (sticky).
const NEVER_OPENED_FAILED_SOURCES = new Set([
  ReplicaStatus.PENDING, ReplicaStatus.CREATING]);
// The identity waits this module owns (spent-wait reporting, see
// reportIdentityWaitSpent).
const IDENTITY_WAIT = Object.freeze({
  REPLICA_IDENTITY_RECORD: 'replica-identity-record',
  CREATE_SYNCING_DEFERRAL: 'replica-create-syncing-deferral',
  MESSAGE_GROUP_IDENTITY_RECORD: 'message-group-identity-record',
});
// What each identity wait awaits (the spent line's `awaited`).
const IDENTITY_WAIT_AWAITED = Object.freeze({
  CREATE_SYNCING_DEFERRAL: 'the authoritative services row becomes readable',
  MESSAGE_GROUP_IDENTITY_RECORD:
    'the replica services row is durably registered',
});
const WAIT_BOUND_SPENT_EVENT = 'wait_bound_spent';
const WAIT_SITE_OBSERVED_NOTHING = 'site_observed_nothing';

/**
 * The one structured line of a spent identity wait, in the shape of the
 * finalize branch's reportWaitBoundSpent (wait, awaited, boundMs,
 * elapsedMs, lastObserved, scope) so the merge repoints each site to it.
 * @param {Object} logger - The site's logger.
 * @param {string} message - The site's log message.
 * @param {Object} report - {wait, awaited, boundMs, elapsedMs, lastObserved,
 *   scope}.
 * @return {void}
 */
function reportIdentityWaitSpent(logger, message, report) {
  logger?.warn?.(message, {
    event: WAIT_BOUND_SPENT_EVENT,
    wait: report.wait,
    awaited: report.awaited,
    boundMs: report.boundMs ?? null,
    elapsedMs: report.elapsedMs ?? null,
    lastObserved: report.lastObserved ?? WAIT_SITE_OBSERVED_NOTHING,
    scope: report.scope ?? null,
  });
}

function openedIdentityRestartRefusal(replicaId, row) {
  const error = new Error(`Replica ${replicaId} is FAILED after it opened ` +
    `(previous state ${row.previous_state ?? 'unknown'}): it is never ` +
    're-driven under the same replica id; remove it and re-plan a new one');
  error.code = OPENED_IDENTITY_RESTART_REFUSED_CODE;
  error.errorCode = OPENED_IDENTITY_RESTART_REFUSED_CODE;
  return error;
}

/**
 * Whether this replica identity existed on this node before (the open-time
 * rule, 2026-10-05): the authoritative SERVICES row for it, read before
 * this create writes any status, names this node in a status written only
 * after an earlier open. A row that cannot be read authoritatively defers
 * the create (absence is never read as a first opening); a handler with no
 * lifecycle authority wired reads nothing and proves nothing. A FAILED row
 * of this node whose source was not PENDING/CREATING (it opened, may have
 * voted or acked) is refused typed before any write (K3): the operation
 * fails terminally, the FAILED-target cleanup removes it and a re-plan mints
 * a new replica id.
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
  if (row?.node_id !== handler.nodeId) {
    return false;
  }
  if (row.status === ReplicaStatus.FAILED &&
      !NEVER_OPENED_FAILED_SOURCES.has(row.previous_state)) {
    throw openedIdentityRestartRefusal(replicaId, row);
  }
  return OPENED_REPLICA_STATUSES.has(row.status);
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
  const startedAt = Date.now();
  try {
    await handler.persistReplicaStatusWithRetry(replicaId,
      ReplicaStatus.SYNCING, {partitionId});
  } catch (error) {
    if (record !== null) {
      reportIdentityWaitSpent(handler.logger,
        REPLICA_HANDLER_LOG_MSG.IDENTITY_RECORD_WAIT_SPENT, {
          wait: IDENTITY_WAIT.REPLICA_IDENTITY_RECORD,
          awaited: ReplicaStatus.SYNCING,
          boundMs: REPLICA_HANDLER_DEFAULT.STATUS_WRITE_RETRY_TIMEOUT_MS,
          elapsedMs: Date.now() - startedAt,
          lastObserved: error?.message ?? null,
          scope: {replicaId, partitionId, nodeId: handler.nodeId},
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
  IDENTITY_WAIT,
  IDENTITY_WAIT_AWAITED,
  observeReplicaIdentity,
  pendingReplicaIdentityRecord,
  recordReplicaIdentity,
  reportIdentityWaitSpent,
};
