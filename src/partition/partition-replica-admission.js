/**
 * Replica admission from the committed replica operation (quest
 * replica-admission-from-committed-operation; R2 request owner shape,
 * design-r2-committed-membership-2026-09-23.md:219-238, limited to ADD;
 * supersedes committed-read amendment-1 A2/Q1).
 *
 * A CREATE_REPLICA / REPLACE target, once its SYNCING fact is committed,
 * asks the partition leader to admit it: ADMIT_REPLICA {partitionId,
 * replicaIdentity, operationId}. The leader answers, in order:
 *   NOT_LEADER (before any read);
 *   the committed read of the operation: AUTHORITY_UNAVAILABLE (the read did
 *     not succeed; typed, with a retry hint, never a refusal of the
 *     operation) or OPERATION_NOT_ADMITTING (the committed operation does not
 *     name this target for this partition at an admitting step);
 *   ALREADY_MEMBER / IN_FLIGHT / PROPOSED from the admission owner, with the
 *     node taken from the committed operation row, never from a services row.
 * A services row is discovery only: it never proposes a vote (A8).
 *
 * The request is idempotent (R14). The target keeps it pending until an
 * admitting answer and re-sends it on the existing learner-promotion cadence
 * (no timer is added); the leader keeps the requests it accepted and
 * re-drives them when a configuration change settles or it gains leadership.
 */

import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {ENTITY_TYPE, SERVICE_TYPE} from '../constants/index.js';
import {validateBootstrapMembershipStamp} from
  '../raft/raft-committed-membership-stamp.js';
import {admissionLeaderHint, admissionLeaderTarget, admissionStampReads} from
  '../raft/raft-rs-committed-peer-address.js';
import {readCommittedMembershipStamp} from
  '../rebalancer/committed-membership-bootstrap-read.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_MESSAGE_TYPE,
} from './partition-service-constants.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_MEMBERSHIP_ADMISSION_OUTCOME} from
  '../raft/raft-operation-port-constants.js';
import {OperationType} from '../rebalancer/replica-status.js';
import {deliveryAnswerOf, deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
import {
  admitPartitionRaftPeer,
  reservePartitionRaftPeerIdentity,
} from './partition-service-raft-membership-administration.js';

const ADMIT_REPLICA_MESSAGE_TYPE = PARTITION_SERVICE_MESSAGE_TYPE.ADMIT_REPLICA;

const REPLICA_ADMISSION_OUTCOME = Object.freeze({
  REQUEST_INVALID: 'request_invalid',
  NOT_LEADER: 'not_leader',
  AUTHORITY_UNAVAILABLE: 'authority_unavailable',
  OPERATION_NOT_ADMITTING: 'operation_not_admitting',
  ALREADY_MEMBER: 'already_member',
  IN_FLIGHT: 'in_flight',
  PROPOSED: 'proposed',
  DEFERRED: 'deferred',
  REFUSED: 'refused',
  TRANSPORT_FAILED: 'transport_failed',
});

// The target's request: pending until an admitting answer; refused when the
// committed operation no longer admits it (the operation owner decides
// what happens to the create, not this channel).
const REPLICA_ADMISSION_REQUEST_STATE = Object.freeze({
  PENDING: 'pending',
  ADMITTED: 'admitted',
  REFUSED: 'refused',
});

// Why a committed operation does not admit a target, and why the target's
// own delivery got no admission answer.
const REPLICA_ADMISSION_REASON = Object.freeze({
  OPERATION_ABSENT: 'operation_absent',
  OPERATION_TYPE: 'operation_type',
  OPERATION_PARTITION: 'operation_partition',
  OPERATION_TARGET: 'operation_target',
  OPERATION_TARGET_NODE: 'operation_target_node',
  OPERATION_STEP: 'operation_step',
  LEADER_NOT_DISCOVERED: 'leader_not_discovered',
  // The committed-membership bootstrap read the target was created from
  // could not be performed again (typed; re-tried on the next cadence).
  STAMP_UNREADABLE: 'admission_stamp_unreadable',
  RESPONSE_BINDING_MISMATCH: 'response_binding_mismatch',
  REQUEST_SHAPE: 'request_shape',
  PARTITION_MISMATCH: 'partition_mismatch',
});
const PROTOTYPE_CONSTRUCTOR_NAME = 'constructor';

const ADMITTING_ANSWERS = Object.freeze(new Set([
  REPLICA_ADMISSION_OUTCOME.ALREADY_MEMBER,
]));

const PORT_OUTCOME_ANSWER = Object.freeze({
  [RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED]:
    REPLICA_ADMISSION_OUTCOME.PROPOSED,
  [RAFT_MEMBERSHIP_ADMISSION_OUTCOME.QUEUED]:
    REPLICA_ADMISSION_OUTCOME.IN_FLIGHT,
  [RAFT_MEMBERSHIP_ADMISSION_OUTCOME.IN_FLIGHT]:
    REPLICA_ADMISSION_OUTCOME.IN_FLIGHT,
  [RAFT_MEMBERSHIP_ADMISSION_OUTCOME.ALREADY_MEMBER]:
    REPLICA_ADMISSION_OUTCOME.ALREADY_MEMBER,
  [RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER]:
    REPLICA_ADMISSION_OUTCOME.NOT_LEADER,
  [RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED]:
    REPLICA_ADMISSION_OUTCOME.DEFERRED,
  [RAFT_MEMBERSHIP_ADMISSION_OUTCOME.REFUSED]:
    REPLICA_ADMISSION_OUTCOME.REFUSED,
});

// A create's operation admits its target while the create is in progress:
// planned, dispatched, creating or syncing. ACTIVE is written only by a
// target that is already a voter; STOPPING, REMOVED and FAILED are past it.
const ADMITTING_WORKFLOW_STEPS = Object.freeze(new Set([
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
  WORKFLOW_STEP.CREATING,
  WORKFLOW_STEP.SYNCING,
]));
const CREATING_OPERATION_TYPES = Object.freeze(new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]));

const READ_OPERATION_SQL =
  'SELECT * FROM replica_operations WHERE operation_id = ?';
const OPERATION_READ_OPTIONS = Object.freeze({
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  deliveryPriority: 'critical',
  workClass: 'critical',
});
// The retry hint of an unavailable authority is the cadence the target
// re-sends on: the learner catch-up check interval (its one cadence).
const AUTHORITY_UNAVAILABLE_RETRY_AFTER_MS =
  PARTITION_SERVICE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS;
const AUTHORITY_UNAVAILABLE_REASON = 'authoritative_read_unavailable';
// Answers that settle a received request: the leader keeps nothing for it
// and re-drives nothing (terminal for the operation, refused by the port,
// or already a member).
const SETTLING_ANSWERS = Object.freeze(new Set([
  REPLICA_ADMISSION_OUTCOME.OPERATION_NOT_ADMITTING,
  REPLICA_ADMISSION_OUTCOME.REFUSED,
  REPLICA_ADMISSION_OUTCOME.ALREADY_MEMBER,
]));
// Answers after which the target no longer knows whom to ask: no leader it
// may follow, or none reached. It reads its committed membership again.
const REREAD_STAMP_ANSWERS = Object.freeze(new Set([
  REPLICA_ADMISSION_OUTCOME.NOT_LEADER,
  REPLICA_ADMISSION_OUTCOME.TRANSPORT_FAILED,
]));
const COHORT_ANSWERS = Object.freeze(new Set([
  REPLICA_ADMISSION_OUTCOME.PROPOSED,
  REPLICA_ADMISSION_OUTCOME.IN_FLIGHT,
  REPLICA_ADMISSION_OUTCOME.ALREADY_MEMBER,
]));

const REPLICA_ADMISSION_LOG_MSG = Object.freeze({
  DECIDED: 'Replica admission request decided by leader',
  ANSWERED: 'Replica admission request answered',
  REDRIVE_FAILED: 'Replica admission re-drive failed',
});

// The requests a replica received and has not seen settle, by replica
// identity: {operationId}. Volatile: a replica that never received one
// learns it from the target's next cadence.
const ACCEPTED_REQUESTS = new WeakMap();

function acceptedRequestsOf(service) {
  if (!ACCEPTED_REQUESTS.has(service)) {
    ACCEPTED_REQUESTS.set(service, new Map());
  }
  return ACCEPTED_REQUESTS.get(service);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function answer(outcome, fields = {}) {
  return Object.freeze({outcome, ...fields});
}

function leads(service) {
  return service.isLeader === true &&
    service.raft?.readStatus?.().role === RAFT_ROLE.LEADER;
}

/**
 * The committed operation row, or a typed unavailability. Only an explicit
 * successful read answers; anything else is AUTHORITY_UNAVAILABLE.
 * @param {Object} service - The partition service.
 * @param {string} operationId - The replica operation.
 * @return {Promise<Object>} {row} or {unavailable: reason}.
 */
async function readCommittedOperation(service, operationId) {
  let result;
  try {
    result = await readAuthoritativeControlPlaneRows(
      service.controlPlaneSystemTableGateway,
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      READ_OPERATION_SQL,
      [operationId],
      OPERATION_READ_OPTIONS,
    );
  } catch (error) {
    // A read that threw has no gateway outcome to carry.
    return {unavailable: error?.message || AUTHORITY_UNAVAILABLE_REASON};
  }
  if (!isAuthoritativeControlPlaneRowReadSuccessful(result) ||
      !Array.isArray(result.rows)) {
    return {unavailable: result?.error || AUTHORITY_UNAVAILABLE_REASON,
      ...(typeof result?.outcome === 'string' ?
        {readOutcome: result.outcome} : {})};
  }
  return {row: result.rows.find((row) =>
    row?.operation_id === operationId) ?? null};
}

// Why the committed operation does not admit this target, or null.
function operationRefusal(row, service, replicaIdentity) {
  if (row === null) return REPLICA_ADMISSION_REASON.OPERATION_ABSENT;
  if (!CREATING_OPERATION_TYPES.has(row.type)) return REPLICA_ADMISSION_REASON.OPERATION_TYPE;
  if (row.entity_type !== SERVICE_TYPE.PARTITION ||
      row.partition_id !== service.partitionId) return REPLICA_ADMISSION_REASON.OPERATION_PARTITION;
  if (row.replica_id !== replicaIdentity) return REPLICA_ADMISSION_REASON.OPERATION_TARGET;
  if (!nonEmptyString(row.target_node_id)) return REPLICA_ADMISSION_REASON.OPERATION_TARGET_NODE;
  if (!ADMITTING_WORKFLOW_STEPS.has(row.workflow_step)) {
    return REPLICA_ADMISSION_REASON.OPERATION_STEP;
  }
  return null;
}

// The answer the port's admission maps to, with the committed node.
function admissionAnswer(service, replicaIdentity, row) {
  // The read yielded: leadership is decided again on the port's answer.
  reservePartitionRaftPeerIdentity(service, replicaIdentity);
  const admission = admitPartitionRaftPeer(service, {
    replicaIdentity, nodeId: row.target_node_id});
  return answer(PORT_OUTCOME_ANSWER[admission.outcome] ??
    REPLICA_ADMISSION_OUTCOME.REFUSED, {
    nodeId: row.target_node_id,
    ...(admission.reason ? {reason: admission.reason} : {}),
  });
}

// The cohort and the kept requests after one answer.
function settleAnswer(service, replicaIdentity, decided) {
  if (SETTLING_ANSWERS.has(decided.outcome)) {
    acceptedRequestsOf(service).delete(replicaIdentity);
  }
  if (COHORT_ANSWERS.has(decided.outcome) &&
      !service.replicaIds.includes(replicaIdentity)) {
    service.replicaIds.push(replicaIdentity);
  }
  return decided;
}

// A replica that does not lead names the leader its own live raft status
// names (U11 rule), never its cached leader id.
function notLeaderAnswer(service) {
  return answer(REPLICA_ADMISSION_OUTCOME.NOT_LEADER,
    {leaderId: service.readLiveRaftLeaderId()});
}

/**
 * The leader's admission decision for one well-formed request of this
 * partition (validated by the caller), from committed facts only. The only
 * caller of admitPartitionRaftPeer. The request is kept until it settles,
 * also by a replica that does not lead now: one that gains leadership
 * re-drives it (LEADER), as the target re-sends it on its own cadence.
 * @param {Object} service - The partition service.
 * @param {Object} request - {replicaIdentity, operationId}.
 * @return {Promise<Object>} Frozen answer {outcome, ...}.
 */
async function admitFromCommittedOperation(service, request) {
  const {replicaIdentity, operationId} = request;
  acceptedRequestsOf(service).set(replicaIdentity, {operationId});
  if (!leads(service)) {
    return notLeaderAnswer(service);
  }
  const read = await readCommittedOperation(service, operationId);
  if (read.unavailable !== undefined) {
    return answer(REPLICA_ADMISSION_OUTCOME.AUTHORITY_UNAVAILABLE, {
      reason: read.unavailable,
      ...(read.readOutcome ? {readOutcome: read.readOutcome} : {}),
      retryAfterMs: AUTHORITY_UNAVAILABLE_RETRY_AFTER_MS});
  }
  const refusal = operationRefusal(read.row, service, replicaIdentity);
  return settleAnswer(service, replicaIdentity, refusal !== null ?
    answer(REPLICA_ADMISSION_OUTCOME.OPERATION_NOT_ADMITTING, {
      reason: refusal, workflowStep: read.row?.workflow_step ?? null}) :
    admissionAnswer(service, replicaIdentity, read.row));
}

/**
 * Re-drive every request this leader accepted and has not seen settle:
 * called when a configuration change settles or it gains leadership (the
 * admission owner's in-flight set is handed over first).
 * @param {Object} service - The partition service.
 */
function redriveAcceptedAdmissionRequests(service) {
  const accepted = acceptedRequestsOf(service);
  const members = new Set((service.raft?.readStatus?.().peers || [])
    .map((peer) => peer?.replicaIdentity));
  for (const replicaIdentity of [...accepted.keys()]) {
    // Settled: the configuration names it. Nothing to re-drive.
    if (members.has(replicaIdentity)) accepted.delete(replicaIdentity);
  }
  for (const [replicaIdentity, {operationId}] of [...accepted.entries()]) {
    admitFromCommittedOperation(service, {replicaIdentity, operationId})
      .catch((error) => {
        service.logger?.warn?.(REPLICA_ADMISSION_LOG_MSG.REDRIVE_FAILED, {
          partitionId: service.partitionId, replicaIdentity, operationId,
          error: error?.message ?? String(error)});
      });
  }
}

const UNCOMMITTED_ADMISSION_OUTCOMES = Object.freeze(new Set([
  REPLICA_ADMISSION_OUTCOME.IN_FLIGHT,
  REPLICA_ADMISSION_OUTCOME.PROPOSED,
]));

function isOwnCommittedVoter(service) {
  const status = service.readOwnRaftStatus?.() ?? null;
  const peerId = status?.peerId;
  if (peerId === undefined || peerId === null) {
    return false;
  }
  const voters = Array.isArray(status?.confState?.voters) ?
    status.confState.voters :
    [];
  return voters.some(
    (voterPeerId) => String(voterPeerId) === String(peerId),
  );
}

/**
 * The learner cadence's one step for admission: a pending request, if any,
 * is sent again; a replica without one does nothing.
 * @param {Object} service - The partition service.
 * @return {Promise<Object|null>} The request record, or null when none.
 */
async function drivePendingReplicaAdmission(service) {
  const request = service.replicaAdmissionRequest ?? null;
  if (request === null ||
      request.state !== REPLICA_ADMISSION_REQUEST_STATE.PENDING) {
    return request;
  }
  return service.driveReplicaAdmission();
}

// Where one answer leaves the target's request: admitted, refused by its
// committed operation, or still pending (re-sent on the learner cadence).
function requestStateAfter(outcome) {
  if (ADMITTING_ANSWERS.has(outcome)) {
    return REPLICA_ADMISSION_REQUEST_STATE.ADMITTED;
  }
  return outcome === REPLICA_ADMISSION_OUTCOME.OPERATION_NOT_ADMITTING ?
    REPLICA_ADMISSION_REQUEST_STATE.REFUSED :
    REPLICA_ADMISSION_REQUEST_STATE.PENDING;
}

// Why a request is not one this replica may keep or decide, or null. It is
// checked before anything is kept (a misrouted or malformed request leaves
// no trace and costs no read).
function requestRefusal(payload, service) {
  if (payload?.partitionId !== service.partitionId) {
    return REPLICA_ADMISSION_REASON.PARTITION_MISMATCH;
  }
  return nonEmptyString(payload?.replicaIdentity) &&
    nonEmptyString(payload?.operationId) ? null :
    REPLICA_ADMISSION_REASON.REQUEST_SHAPE;
}

// The leader a NOT_LEADER answer names, kept only when it is a member of the
// committed configuration the target holds (addressed at its committed
// node); otherwise none, and the target reads its committed membership again.
function acceptedLeaderHint(request, admission) {
  return admission.outcome === REPLICA_ADMISSION_OUTCOME.NOT_LEADER ?
    admissionLeaderHint(ENTITY_TYPE.PARTITION, request.stamp,
      admission.leaderId ?? null) : null;
}

// The answer a delivery carries, or a typed refusal of the delivery. A
// response bound to another partition means the target's leader address
// named another partition's replica: it re-discovers (B4).
function deliveredAdmission(service, request, delivery) {
  const response = deliveryAnswerOf(delivery);
  if (!isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)) ||
      typeof response?.admission?.outcome !== 'string') {
    return answer(REPLICA_ADMISSION_OUTCOME.TRANSPORT_FAILED,
      {reason: REPLICA_ADMISSION_REASON.RESPONSE_BINDING_MISMATCH});
  }
  if (response.partitionId !== service.partitionId) {
    return answer(REPLICA_ADMISSION_OUTCOME.NOT_LEADER,
      {reason: REPLICA_ADMISSION_REASON.PARTITION_MISMATCH, leaderId: null});
  }
  return response.replicaIdentity === service.replicaId &&
    response.operationId === request.operationId ? response.admission :
    answer(REPLICA_ADMISSION_OUTCOME.TRANSPORT_FAILED,
      {reason: REPLICA_ADMISSION_REASON.RESPONSE_BINDING_MISMATCH});
}

// The validated committed-membership stamp a replica was created from, or
// null (a founder's GENESIS, a durable-record reopen: none names a leader).
function committedStampOf(membership) {
  const validation = validateBootstrapMembershipStamp(membership);
  return validation.valid ? validation.stamp : null;
}

// The leader the target asks: an accepted NOT_LEADER hint, else the one
// derivation of the committed-peer-address owner over its stamp and its own
// live status; or the typed NOT_LEADER that has the target read its
// committed membership again.
function admissionLeaderOf(service, request) {
  const target = request.leaderHint ??
    admissionLeaderTarget(ENTITY_TYPE.PARTITION, request.stamp,
      service.readOwnRaftStatus());
  return target.refusal === undefined ? {address: target.address} :
    {refusal: answer(REPLICA_ADMISSION_OUTCOME.NOT_LEADER,
      {reason: target.refusal, leaderId: null})};
}

// The committed-membership bootstrap read the target was created from,
// performed again by the same owner (readCommittedMembershipStamp), asked at
// the held stamp's committed nodes in order, on this one cadence turn: the
// stamp it now holds, or a typed unreadable answer kept for the next. No
// cached row routes it.
async function rereadCommittedStamp(service, request) {
  let refusal = null;
  for (const read of admissionStampReads(request.stamp)) {
    try {
      request.stamp = await readCommittedMembershipStamp({
        messageRouter: service.transport, nodeId: service.nodeId},
      service.partitionId, read);
      request.leaderHint = null;
      request.rereadStamp = false;
      return null;
    } catch (error) {
      refusal = error;
    }
  }
  return answer(REPLICA_ADMISSION_OUTCOME.NOT_LEADER, {leaderId: null,
    reason: REPLICA_ADMISSION_REASON.STAMP_UNREADABLE,
    readRefusal: refusal?.code ?? null});
}

class PartitionServiceReplicaAdmissionMethods {
  /**
   * Leader-side handler of ADMIT_REPLICA.
   * @param {Object} payload - {partitionId, replicaIdentity, operationId}.
   * @return {Promise<Object>} {partitionId, replicaIdentity, operationId,
   *   admission}.
   */
  async handleReplicaAdmissionRequest(payload) {
    const envelope = {partitionId: this.partitionId,
      replicaIdentity: payload?.replicaIdentity ?? null,
      operationId: payload?.operationId ?? null};
    const refusal = requestRefusal(payload, this);
    const admission = refusal !== null ?
      answer(REPLICA_ADMISSION_OUTCOME.REQUEST_INVALID, {reason: refusal}) :
      await admitFromCommittedOperation(this, {
        replicaIdentity: payload.replicaIdentity,
        operationId: payload.operationId});
    this.logger.info(REPLICA_ADMISSION_LOG_MSG.DECIDED, {
      ...envelope, replicaId: this.replicaId, outcome: admission.outcome,
      reason: admission.reason ?? null,
      admittedNodeId: admission.nodeId ?? null});
    return {...envelope, admission};
  }

  /**
   * Target-side: record the request for this replica's committed operation
   * and send it once now. Called after the SYNCING fact committed.
   * @param {string} operationId - The CREATE_REPLICA / REPLACE operation.
   * @return {Promise<Object>} The request record.
   */
  async requestReplicaAdmission(operationId) {
    this.replicaAdmissionRequest = {operationId,
      state: REPLICA_ADMISSION_REQUEST_STATE.PENDING, lastOutcome: null,
      stamp: committedStampOf(this.bootstrapMembership), leaderHint: null,
      rereadStamp: false};
    return this.driveReplicaAdmission();
  }

  /**
   * Target-side: send the pending request to the discovered leader. Never
   * throws; a pending request is sent again on the learner cadence.
   * @return {Promise<Object|null>} The request record, or null when none.
   */
  async driveReplicaAdmission() {
    const request = this.replicaAdmissionRequest ?? null;
    if (request === null ||
        request.state !== REPLICA_ADMISSION_REQUEST_STATE.PENDING ||
        this.isShutdown === true) {
      return request;
    }
    if (UNCOMMITTED_ADMISSION_OUTCOMES.has(request.lastOutcome) &&
        isOwnCommittedVoter(this)) {
      request.lastOutcome = REPLICA_ADMISSION_OUTCOME.ALREADY_MEMBER;
      request.state = REPLICA_ADMISSION_REQUEST_STATE.ADMITTED;
      return request;
    }
    const admission = (request.rereadStamp ?
      await rereadCommittedStamp(this, request) : null) ??
      await this.sendReplicaAdmissionRequest(request);
    request.lastOutcome = admission.outcome;
    request.state = requestStateAfter(admission.outcome);
    if (request.state === REPLICA_ADMISSION_REQUEST_STATE.PENDING) {
      // A usable hint is followed; anything else (no hint, an unaddressed
      // or unreachable leader) reads the committed membership again on the
      // next cadence. A leader that deferred is asked again. Nothing is
      // seeded from a cache.
      if (REREAD_STAMP_ANSWERS.has(admission.outcome)) {
        request.leaderHint = acceptedLeaderHint(request, admission);
        request.rereadStamp = request.leaderHint === null;
      }
    }
    this.logger.info(REPLICA_ADMISSION_LOG_MSG.ANSWERED, {
      partitionId: this.partitionId, replicaId: this.replicaId,
      operationId: request.operationId, outcome: admission.outcome,
      reason: admission.reason ?? null, state: request.state});
    return request;
  }

  /**
   * One delivery of the request; every failure is a typed answer.
   * @param {Object} request - {operationId}.
   * @return {Promise<Object>} The leader's admission answer.
   * @private
   */
  async sendReplicaAdmissionRequest(request) {
    const leader = admissionLeaderOf(this, request);
    if (leader.refusal) return leader.refusal;
    if (!this.transport) {
      return answer(REPLICA_ADMISSION_OUTCOME.TRANSPORT_FAILED,
        {reason: REPLICA_ADMISSION_REASON.LEADER_NOT_DISCOVERED});
    }
    let delivery;
    try {
      delivery = await this.transport.deliver(leader.address, {
        type: ADMIT_REPLICA_MESSAGE_TYPE,
        partitionId: this.partitionId,
        replicaIdentity: this.replicaId,
        operationId: request.operationId,
      // The bound the promotion-proof delivery names on the same channel:
      // the router's message timeout (MESSAGE_TIMEOUT_MS), stated here.
      }, {timeoutMs: this.resolveLearnerPromotionProofDeliveryTimeoutMs()});
    } catch (error) {
      return answer(REPLICA_ADMISSION_OUTCOME.TRANSPORT_FAILED,
        {reason: error?.message ?? String(error)});
    }
    return deliveredAdmission(this, request, delivery);
  }
}

function createPartitionServiceReplicaAdmissionMethods() {
  const methods = {};
  for (const name of Object.getOwnPropertyNames(
    PartitionServiceReplicaAdmissionMethods.prototype)) {
    if (name !== PROTOTYPE_CONSTRUCTOR_NAME) {
      methods[name] = PartitionServiceReplicaAdmissionMethods.prototype[name];
    }
  }
  return methods;
}

export {
  createPartitionServiceReplicaAdmissionMethods,
  drivePendingReplicaAdmission,
  redriveAcceptedAdmissionRequests,
};
