// The admission of recreating a local partition replica after a snapshot
// install (quest partition-checkpoint-epoch-generation, finding 1; R04, R07,
// R18). Its one input is the replica's AUTHORITATIVE lifecycle row; the
// decision is total over what that read can answer.
//
// It is a different question from requireActiveReplicaStorageAdmission
// (replica-handler-create-admission-methods.js), which admits opening the
// storage of an established replica for a runtime repair and therefore
// demands ACTIVE at the cached row version. A recreate after an install
// reopens a replica this node already ran a moment ago, at any point of its
// life: an established ACTIVE one, and one still mid-create whose row is
// SYNCING (a new replica behind its leader's compaction is exactly that).
// What it must never do is reopen storage another owner has taken:
//
//   read unavailable, or more than one row        -> HELD    row_unobservable
//   no row                                        -> REFUSED row_absent
//   cleanup-ownership row                         -> REFUSED row_cleanup_owned
//   a row of another service, node or partition   -> REFUSED row_not_this_replica
//   ACTIVE                                        -> ADMITTED row_active
//   SYNCING                                       -> ADMITTED row_syncing
//   PENDING, CREATING, HELD                       -> HELD    row_before_syncing
//   REMOVING, REMOVED                             -> REFUSED row_removal_in_progress
//   FAILED                                        -> REFUSED row_failed
//   any other status                              -> REFUSED row_status_unknown
//
// PENDING/CREATING/HELD hold instead of refusing: the create owner is about
// to publish SYNCING (no leader offers a replica it has not admitted, and it
// admits from the SYNCING fact), so the answer is not yet decidable. REFUSED
// is final for the asker: the removal owner (REMOVING/REMOVED) or the
// failed-create cleanup owner (FAILED, cleanup-ownership) takes the stopped
// replica and its storage.

import {
  SERVICE_TYPE,
  isLivePartitionServiceRow,
  isPartitionCleanupServiceRow,
} from '../constants/service.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';

import {
  REPLICA_RECREATE_ADMISSION as ADMISSION,
  REPLICA_RECREATE_ADMISSION_REASON as REASON,
  REPLICA_SNAPSHOT_INSTALL_ERROR_CODE,
} from './replica-snapshot-install-constants.js';
import {observeAuthoritativeReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';

// The lifecycle statuses, each with its decision.
const STATUS_DECISIONS = Object.freeze({
  [ReplicaStatus.ACTIVE]: [ADMISSION.ADMITTED, REASON.ROW_ACTIVE],
  [ReplicaStatus.SYNCING]: [ADMISSION.ADMITTED, REASON.ROW_SYNCING],
  [ReplicaStatus.PENDING]: [ADMISSION.HELD, REASON.ROW_BEFORE_SYNCING],
  [ReplicaStatus.CREATING]: [ADMISSION.HELD, REASON.ROW_BEFORE_SYNCING],
  [ReplicaStatus.HELD]: [ADMISSION.HELD, REASON.ROW_BEFORE_SYNCING],
  [ReplicaStatus.REMOVING]: [ADMISSION.REFUSED, REASON.ROW_REMOVAL_IN_PROGRESS],
  [ReplicaStatus.REMOVED]: [ADMISSION.REFUSED, REASON.ROW_REMOVAL_IN_PROGRESS],
  [ReplicaStatus.FAILED]: [ADMISSION.REFUSED, REASON.ROW_FAILED],
});
const UNKNOWN_STATUS_DECISION = Object.freeze(
  [ADMISSION.REFUSED, REASON.ROW_STATUS_UNKNOWN]);
// The authoritative read's answer that the replica has no row.
const NO_ROW = null;
// The status of a decision made without a row.
const NO_ROW_STATUS = 'none';

function admission(decision, reason, rowStatus = NO_ROW_STATUS) {
  return Object.freeze({decision, reason, rowStatus,
    admitted: decision === ADMISSION.ADMITTED});
}

function rowIsReplica(row, replica) {
  return row.service_id === replica.replicaId &&
    row.service_type === SERVICE_TYPE.PARTITION &&
    row.partition_id === replica.partitionId &&
    row.node_id === replica.nodeId;
}

/**
 * The decision for one authoritative observation of the replica's row.
 * @param {Object} observation - {available, row} as
 *   observeAuthoritativeReplicaLifecycle answers.
 * @param {Object} replica - {replicaId, partitionId, nodeId}.
 * @return {Object} Frozen {decision, reason, rowStatus, admitted}.
 */
function decideRecreateAfterInstallAdmission(observation, replica) {
  if (observation.available !== true) {
    return admission(ADMISSION.HELD, REASON.ROW_UNOBSERVABLE);
  }
  const {row} = observation;
  if (row === NO_ROW) {
    return admission(ADMISSION.REFUSED, REASON.ROW_ABSENT);
  }
  if (isPartitionCleanupServiceRow(row)) {
    return admission(ADMISSION.REFUSED, REASON.ROW_CLEANUP_OWNED, row.status);
  }
  if (!isLivePartitionServiceRow(row) || !rowIsReplica(row, replica)) {
    return admission(ADMISSION.REFUSED, REASON.ROW_NOT_THIS_REPLICA, row.status);
  }
  const [decision, reason] = Object.hasOwn(STATUS_DECISIONS, row.status) ?
    STATUS_DECISIONS[row.status] : UNKNOWN_STATUS_DECISION;
  return admission(decision, reason, row.status);
}

/**
 * Read the replica's authoritative lifecycle row and decide.
 * @param {Object} handler - The node's replica handler.
 * @param {Object} replica - {replicaId, partitionId}.
 * @return {Promise<Object>} Frozen {decision, reason, rowStatus, admitted}.
 */
async function observeRecreateAfterInstallAdmission(handler, replica) {
  return decideRecreateAfterInstallAdmission(
    await observeAuthoritativeReplicaLifecycle(
      handler.replicaStateMachine, replica.replicaId),
    {...replica, nodeId: handler.nodeId});
}

// A CREATE request the install episode lets through.
const CREATE_NOT_REFUSED = null;
const CREATE_DURING_INSTALL_EPISODE =
  'CREATE deferred: the replica is under a snapshot install episode';

/**
 * The answer to a CREATE request (a replay of the replica's own create, or a
 * runtime repair) for a replica under a live install episode: a typed,
 * retryable deferral, decided before the request touches the create
 * admission, the lifecycle row or the tracked replica. The episode returns
 * the replica, or the owner that claims it answers the create.
 * @param {Object} handler - The node's replica handler.
 * @param {Object} request - The CREATE_REPLICA request.
 * @return {Object|null} The refusal response, or null when no episode holds
 *   the replica.
 */
function refuseCreateDuringInstallEpisode(handler, request) {
  const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
  if (handler.snapshotInstallOwner.custodyOf(replicaId) === null) {
    return CREATE_NOT_REFUSED;
  }
  const operationId = request?.[ReplicaOperationField.OPERATION_ID];
  const errorCode =
    REPLICA_SNAPSHOT_INSTALL_ERROR_CODE.REPLICA_UNDER_INSTALL_EPISODE;
  handler.logger.warn(CREATE_DURING_INSTALL_EPISODE,
    {operationId, replicaId, nodeId: handler.nodeId, errorCode});
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.ERROR,
    {error: CREATE_DURING_INSTALL_EPISODE, errorCode, deferRetry: true,
      operationId, replicaId, nodeId: handler.nodeId});
}

export {
  decideRecreateAfterInstallAdmission,
  observeRecreateAfterInstallAdmission,
  refuseCreateDuringInstallEpisode,
};
