import {isFreshSeedMembershipOutcome} from '../bootstrap/rejoin-hints-constants.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {CREATE_ADMISSION_ERROR_CODE, CREATE_ADMISSION_STATE} from
  './replica-create-admission-owner.js';
import {releaseAnswer} from '../partition/partition-participant-release-contract.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_MISSING_FACT as MISSING_FACT} from
  '../partition/partition-participant-transaction-cutover-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from '../raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {isHeldByHostFailure} from '../raft/raft-operation-port.js';
import {TABLES} from '../constants/tables.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {OPERATION_METADATA_KEY, OperationType, ReplicaStatus,
  getOperationMetadataObject} from '../rebalancer/replica-status.js';

// Node-local tokens: the startup owner's FRESH_SEED outcome and an explicit
// operator request, both decided on the node that releases. A fresh CREATE
// carries no token: its authority is the committed create operation, read by
// whichever leader answers the release (decideFreshCreateRelease).
const AUTHORIZATION = new WeakMap();
const PARTICIPANT_RELEASE_AUTHORIZATION_KIND = Object.freeze({
  FRESH_SEED: 'fresh_seed',
  OPERATOR: 'operator',
});
// Why a committed create operation does not authorize a fresh CREATE release.
const FRESH_CREATE_REFUSAL = Object.freeze({
  ABSENT: 'create_operation_absent',
  IDENTITY: 'create_operation_identity_mismatch',
  NOT_FOUNDING_ADD: 'create_operation_not_partition_add',
  NOT_OPEN: 'create_operation_not_open',
  NOT_GENESIS: 'create_operation_not_genesis_founding',
  UNREADABLE: 'create_operation_unreadable',
});
const LEADER_NOT_MEMBER = 'create_operation_leader_not_member';
const REPLICA_OPERATIONS_PARTITION_ID =
  INITIAL_PARTITION_IDS[TABLES.REPLICA_OPERATIONS];
const READ_OPERATION_SQL =
  'SELECT * FROM replica_operations WHERE operation_id = ?';
const OPEN_CREATE_ADMISSION_STATES = new Set([CREATE_ADMISSION_STATE.MATERIALIZED,
  CREATE_ADMISSION_STATE.ACTIVE]);
const PARTITION_ENTITY = 'partition';
const TEXT_IDENTITY_FIELDS = Object.freeze([
  ['operationId', 'operation_id'],
  ['replicaId', 'replica_id'],
  ['partitionId', 'partition_id'],
  ['targetNodeId', 'target_node_id'],
  ['admissionToken', 'create_admission_token'],
  ['attemptToken', 'create_admission_attempt_token'],
]);
const ORDINAL_IDENTITY_FIELDS = Object.freeze([
  ['attemptSeq', 'create_admission_attempt_seq'],
  ['replicaCreatedAt', 'create_admission_replica_created_at'],
]);
const IDENTITY_FIELDS = Object.freeze([...TEXT_IDENTITY_FIELDS,
  ...ORDINAL_IDENTITY_FIELDS]);

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function firstStepOf(row) {
  let history = row?.steps_history;
  if (typeof history === 'string') {
    try {
      history = JSON.parse(history);
    } catch {
      return null;
    }
  }
  return Array.isArray(history) && history.length > 0 ? history[0] : null;
}

// (c): a completed, failed or closed create authorizes nothing.
function createIsOpen(row) {
  return OPEN_CREATE_ADMISSION_STATES.has(row.create_admission_state) &&
    (row.completed_at === null || row.completed_at === undefined) &&
    row.status !== ReplicaStatus.FAILED && row.workflow_step !== WORKFLOW_STEP.FAILED;
}

// (b): a partition ADD (or REPLACE once write origin exists) for this leader's
// partition.
function isAllowedCreateOperation(row, leader) {
  if (row.partition_id !== leader.partitionId ||
      row.entity_type !== PARTITION_ENTITY) {
    return false;
  }
  return leader.hasWriteOrigin === true ?
    row.type === OperationType.ADD || row.type === OperationType.REPLACE :
    row.type === OperationType.ADD;
}

// (d): on a no-origin group, the first step carries a GENESIS stamp. The
// configuration may have changed since, so the stamp names no required leader.
function foundingRefusalOf(row) {
  const step = firstStepOf(row);
  const stamp = step === null ? null :
    getOperationMetadataObject([step], OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP);
  return stamp?.kind === COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS ?
    null : FRESH_CREATE_REFUSAL.NOT_GENESIS;
}

function isCreateIdentity(identity) {
  return identity !== null && typeof identity === 'object' &&
    TEXT_IDENTITY_FIELDS.every(([field]) => nonempty(identity[field])) &&
    ORDINAL_IDENTITY_FIELDS.every(([field]) => Number.isSafeInteger(identity[field]));
}

function rowIsIdentity(row, identity) {
  return TEXT_IDENTITY_FIELDS.every(([field, column]) => row[column] === identity[field]) &&
    ORDINAL_IDENTITY_FIELDS.every(([field, column]) =>
      Number(row[column]) === identity[field]);
}

// (a) the row is the request's whole create identity, then (b)-(d).
function rowRefusalOf(row, identity, leader) {
  if (row === null || row === undefined) return FRESH_CREATE_REFUSAL.ABSENT;
  if (!rowIsIdentity(row, identity)) return FRESH_CREATE_REFUSAL.IDENTITY;
  if (!isAllowedCreateOperation(row, leader)) {
    return FRESH_CREATE_REFUSAL.NOT_FOUNDING_ADD;
  }
  if (!createIsOpen(row)) return FRESH_CREATE_REFUSAL.NOT_OPEN;
  return leader.hasWriteOrigin === true ? null : foundingRefusalOf(row);
}

function isLocalCommittedLeaderStatus(status) {
  return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    status.role === RAFT_ROLE.LEADER &&
    !isHeldByHostFailure(status) &&
    Number.isSafeInteger(status.commitIndex) && status.commitIndex > 0 &&
    Number.isSafeInteger(status.appliedIndex) &&
    status.appliedIndex >= status.commitIndex;
}

function isQueryableOperationsService(service) {
  return Boolean(
    service &&
    service.initialized === true &&
    service.isShutdown !== true &&
    service.partitionId === REPLICA_OPERATIONS_PARTITION_ID &&
    typeof service.executeQuery === 'function',
  );
}

function isServiceCommittedLeader(service) {
  const readStatus = service?.raft?.readStatus;
  return typeof readStatus === 'function' &&
    isLocalCommittedLeaderStatus(readStatus.call(service.raft));
}

function localCommittedOperationsLeader(handler) {
  const services = handler?.localServices;
  if (typeof services?.values !== 'function') return null;
  for (const service of services.values()) {
    if (isQueryableOperationsService(service) && isServiceCommittedLeader(service)) {
      return service;
    }
  }
  return null;
}

function isValidQueryRowsResult(result) {
  return result?.success === true && Array.isArray(result.rows);
}

async function readLocalCommittedOperation(service, operationId) {
  let result;
  try {
    result = await service.executeQuery(READ_OPERATION_SQL, [operationId]);
  } catch (error) {
    return {unreadable: error};
  }
  if (!isServiceCommittedLeader(service) || !isValidQueryRowsResult(result)) {
    return {deferred: {authorityOutcome: result?.outcome ?? null,
      authorityError: result?.error ?? null}};
  }
  return {row: result.rows.length === 1 ? result.rows[0] : null};
}

function authorityUnavailable(request, fields) {
  return releaseAnswer(OUTCOME.UNAVAILABLE, request,
    {missingFact: MISSING_FACT.CREATE_ADMISSION_AUTHORITY,
      retryAfterMs: BOUND.PAUSE_RETRY_AFTER_MS, ...fields});
}

function createParticipantReleaseAuthorizationOwner(handler) {
  function issue(kind, partitionId, targetBuildDigest, evidence = null) {
    const token = Object.freeze(Object.create(null));
    AUTHORIZATION.set(token, Object.freeze({handler, kind, partitionId,
      targetBuildDigest, evidence}));
    return token;
  }

  async function readFoundingOperation(operationId) {
    const localService = localCommittedOperationsLeader(handler);
    if (localService !== null) {
      return readLocalCommittedOperation(localService, operationId);
    }
    try {
      return {row: await handler.getReplicaCreateAdmissionOwner()
        .readOperation(operationId)};
    } catch (error) {
      return error?.code === CREATE_ADMISSION_ERROR_CODE.DEFERRED ?
        {deferred: error} : {unreadable: error};
    }
  }

  function freshCreateRefusal(request, reason) {
    return releaseAnswer(OUTCOME.OPERATOR_REQUIRED, request,
      {missingFact: MISSING_FACT.FRESH_STORAGE_OR_OPERATOR_AUTHORITY, reason});
  }

  return Object.freeze({
    authorizeFreshSeed({partitionId, targetBuildDigest, membershipOwnerOutcome}) {
      return isFreshSeedMembershipOutcome(membershipOwnerOutcome) ?
        issue(PARTICIPANT_RELEASE_AUTHORIZATION_KIND.FRESH_SEED,
          partitionId, targetBuildDigest, membershipOwnerOutcome) : null;
    },
    /**
     * The create identity a fresh CREATE's release carries: plain data, a
     * lookup key for the answering leader, never authority by itself.
     * @param {Object} input - {partitionId, createAdmissionEvidence,
     *   identityExisted}.
     * @return {Object|null} Frozen identity, or null when the create is not a
     *   fresh birth of this partition (the release is then refused locally).
     */
    freshCreateReleaseIdentity({partitionId, createAdmissionEvidence, identityExisted}) {
      if (identityExisted !== false ||
          createAdmissionEvidence?.partitionId !== partitionId) return null;
      const identity = Object.fromEntries(IDENTITY_FIELDS.map(([field]) =>
        [field, createAdmissionEvidence[field]]));
      return isCreateIdentity(identity) ? Object.freeze(identity) : null;
    },
    /**
     * The leader's per-request decision on a fresh CREATE's release of a
     * partition that has no write origin, from the committed founding create
     * operation read through this node's create-admission owner (the
     * control-plane gateway).
     * @param {Object} request - The release request carrying
     *   createAdmissionIdentity.
     * @param {Object} leader - {partitionId, replicaId, memberIds} of the
     *   answering leader; memberIds is its committed configuration.
     * @return {Promise<Object|null>} null when the committed operation
     *   authorizes; otherwise the attempt's typed answer: UNAVAILABLE with
     *   retryAfterMs while the read is refused or the leader is not a
     *   committed member (ended by the release deadline), OPERATOR_REQUIRED (with the
     *   failing condition as reason) when the row does not authorize.
     */
    async decideFreshCreateRelease(request, leader) {
      const identity = request?.createAdmissionIdentity;
      if (!isCreateIdentity(identity)) {
        return freshCreateRefusal(request, FRESH_CREATE_REFUSAL.IDENTITY);
      }
      const read = await readFoundingOperation(identity.operationId);
      if (read.deferred) {
        return authorityUnavailable(request,
          {authorityOutcome: read.deferred.authorityOutcome ?? null,
            authorityError: read.deferred.authorityError ?? null});
      }
      if (read.unreadable) {
        return freshCreateRefusal(request, FRESH_CREATE_REFUSAL.UNREADABLE);
      }
      const refusal = rowRefusalOf(read.row, identity, leader);
      if (refusal !== null) return freshCreateRefusal(request, refusal);
      // A leader committing its own removal steps down: transient, not terminal.
      return leader.memberIds.includes(leader.replicaId) ? null :
        authorityUnavailable(request, {reason: LEADER_NOT_MEMBER});
    },
    authorizeOperator({partitionId, targetBuildDigest}) {
      return issue(PARTICIPANT_RELEASE_AUTHORIZATION_KIND.OPERATOR,
        partitionId, targetBuildDigest);
    },
    authorizeControlFrom(parent, partitionId, targetBuildDigest) {
      const proof = AUTHORIZATION.get(parent);
      return proof?.handler === handler &&
        [PARTICIPANT_RELEASE_AUTHORIZATION_KIND.FRESH_SEED,
          PARTICIPANT_RELEASE_AUTHORIZATION_KIND.OPERATOR].includes(proof.kind) ?
        issue(proof.kind, partitionId, targetBuildDigest, proof.evidence) : null;
    },
    validates(token, {partitionId, targetBuildDigest}) {
      const proof = AUTHORIZATION.get(token);
      return proof?.handler === handler && proof.partitionId === partitionId &&
        proof.targetBuildDigest === targetBuildDigest;
    },
  });
}

export {createParticipantReleaseAuthorizationOwner};
