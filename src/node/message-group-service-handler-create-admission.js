/**
 * Current CREATE for a message group (FreshMG 6.B slice B1), subordinate to
 * MessageGroupServiceHandler. A CREATE that carries a learner join package
 * crosses the handler's refusal only when a learner-join capability is
 * composed, the authoritative operation row holds the exact recorded learner
 * fact (the recorder's one pure predicate), the package names that fact's
 * group, target and peer, and the existing durable CREATE admission CAS and
 * its ADMITTED -> MATERIALIZED advance both commit with the fact's membership
 * columns in their basis (the advance also on an open operation). Then
 * exactly one physical worker of that admitted generation runs, revalidated
 * against the boot row, through the learner-join capability only: the
 * composed createMessageGroupReplica opens a lone self-electing founder and is
 * never called here. A payload phase, stamp or identity copy is never read.
 * No production root composes the learner-join capability yet; supplying one
 * that installs and opens a joining learner is the install slice.
 */
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../rebalancer/executor-outcome-constants.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {observeMembershipOperation} from
  '../rebalancer/replica-operation-message-group-membership-owner-claim.js';
import {recordedLearnerCreateBasis} from
  '../rebalancer/replica-operation-message-group-membership-authorization.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
} from './replica-create-admission-owner.js';
import {buildMessageGroupCreateFailureOptions} from
  './message-group-create-activation.js';
import {MESSAGE_GROUP_LEARNER_JOIN_OUTCOME as JOIN_OUTCOME} from
  '../message-group/message-group-learner-join-constants.js';
import {
  MESSAGE_GROUP_CREATE_REFUSAL as REFUSAL,
  MESSAGE_GROUP_JOIN_PACKAGE as JOIN_PACKAGE,
  MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG as LOG,
} from './message-group-service-handler-constants.js';

const FIELD = ReplicaOperationField;
const STATUS = ReplicaOperationResponseStatus;
const JOIN_KINDS = Object.freeze(Object.values(JOIN_PACKAGE.KIND));
// No operation owner composed (today's production roots): nothing observed.
const NOT_OBSERVED = Object.freeze({available: false, row: null});
const FACT_UNAVAILABLE = Object.freeze({
  refusal: REFUSAL.LEARNER_FACT_UNAVAILABLE, deferRetry: true});
const FACT_NOT_RECORDED = Object.freeze({
  refusal: REFUSAL.LEARNER_FACT_NOT_RECORDED, deferRetry: false});
// The worker starts only for an operation still open at the MATERIALIZED
// advance: a terminal settlement after admission leaves no physical work.
const OPEN_OPERATION = Object.freeze({completed_at: null});
// The learner's install commits only on a row that still holds the fact, an
// open operation and this MATERIALIZED admission (slice B2): a REMOVE
// selection or a terminal settlement after MATERIALIZED defeats it there.
const MATERIALIZED_ADMISSION = Object.freeze({
  create_admission_state: CREATE_ADMISSION_STATE.MATERIALIZED});

/**
 * The handler's learner-CREATE dependencies: the learner-join capability the
 * admitted worker calls, the operation owner the recorded fact is read
 * through, this node's boot incarnation (the admission owner's fence) and the
 * admission generation clock. Absent ones fail typed.
 * @param {Object} options - The handler options.
 * @return {Object} Fields the handler adopts.
 */
function learnerCreateDependencies(options) {
  return {
    joinMessageGroupReplicaAsLearner:
      options.joinMessageGroupReplicaAsLearner || null,
    replicaOperationRepository: options.replicaOperationRepository || null,
    ownerIncarnation: options.ownerIncarnation ?? null,
    now: typeof options.now === 'function' ? options.now : Date.now,
  };
}

/**
 * Whether a CREATE asks for the learner path at all. Every other dispatch
 * shape keeps the handler's existing refusal unchanged.
 * @param {Object} request - The CREATE_REPLICA payload.
 * @return {boolean}
 */
function carriesLearnerJoinPackage(request) {
  return request !== null && typeof request === 'object' &&
    Object.hasOwn(request, FIELD.MESSAGE_GROUP_JOIN_PACKAGE);
}

function boundJoinPackage(value, identity) {
  const joinPackage = copyStrictOwnDataRecord(value);
  if (joinPackage === null ||
      Object.keys(joinPackage).length !== JOIN_PACKAGE.KEYS.length ||
      !JOIN_PACKAGE.KEYS.every((key) => Object.hasOwn(joinPackage, key))) {
    return null;
  }
  return JOIN_KINDS.includes(joinPackage.kind) &&
    joinPackage.groupId === identity.groupId &&
    joinPackage.replicaIdentity === identity.targetReplicaId &&
    joinPackage.peerId === identity.targetPeerId ?
    Object.freeze({...joinPackage}) : null;
}

function admissionRequest(handler, request) {
  return {
    operationId: request[FIELD.OPERATION_ID],
    operationType: request[FIELD.OPERATION_TYPE],
    entityType: request[FIELD.ENTITY_TYPE],
    entityId: request[FIELD.ENTITY_ID],
    partitionId: request[FIELD.PARTITION_ID],
    replicaId: request[FIELD.REPLICA_ID],
    targetNodeId: handler.nodeId,
    admissionToken: request[FIELD.CREATE_ADMISSION_TOKEN],
    attemptToken: request[FIELD.CREATE_ADMISSION_ATTEMPT_TOKEN],
    attemptSeq: request[FIELD.CREATE_ADMISSION_ATTEMPT_SEQ],
    workflowUpdatedAt: request[FIELD.CREATE_ADMISSION_WORKFLOW_UPDATED_AT],
  };
}

function answer(handler, request, status, reason = null, deferRetry = false) {
  const response = {
    status,
    operationId: request?.[FIELD.OPERATION_ID],
    replicaId: request?.[FIELD.REPLICA_ID],
    nodeId: handler.nodeId,
  };
  if (reason === null) return response;
  if (status === STATUS.ERROR) {
    Object.assign(response, {error: reason, errorCode: reason, deferRetry});
  }
  handler.logger.warn(LOG.CREATE_LEARNER_REFUSED,
    {operationId: response.operationId, replicaId: response.replicaId,
      nodeId: handler.nodeId, status, reason});
  return {...response, reason};
}

/**
 * The recorded learner fact on the authoritative operation row, or the typed
 * refusal. The repository's own observation decodes the row; no cache.
 * @param {Object} handler - The MessageGroupServiceHandler.
 * @param {string} operationId - The CREATE's operation.
 * @return {Promise<Object>} {basis} or {refusal, deferRetry}.
 */
async function readRecordedLearner(handler, operationId) {
  const repository = handler.replicaOperationRepository;
  const observed = repository ?
    await observeMembershipOperation(repository, operationId) : NOT_OBSERVED;
  if (!observed.available) return FACT_UNAVAILABLE;
  const basis = recordedLearnerCreateBasis(observed.row);
  return basis === null ? FACT_NOT_RECORDED : {basis};
}

async function fencedWorkerIsCurrent(handler, owner, claim, evidence) {
  if (handler.replicaCreateAdmissionOwner !== owner) return false;
  try {
    return await owner.revalidatePhysicalWorker(claim, evidence) === true;
  } catch (error) {
    handler.logger.debug(LOG.CREATE_LEARNER_WORKER_FENCED,
      {operationId: evidence.operationId, error: error?.message});
    return false;
  }
}

// The learner-join answer's fields a log line carries.
const LEARNER_JOIN_REPORT_FIELDS = Object.freeze(['outcome', 'leaderReplicaId', 'term',
  'commitIndex', 'matchIndex']);

// The learner-join capability's answer: RUNNING only after the group's
// leader acknowledged the learner caught up. Neither answer is CREATE_ACTIVE:
// a learner is no voter, so no success outcome or services row follows here.
function reportLearnerJoin(handler, evidence, joined) {
  const fields = {operationId: evidence.operationId, replicaId: evidence.replicaId,
    nodeId: handler.nodeId, ...Object.fromEntries(LEARNER_JOIN_REPORT_FIELDS.map(
      (field) => [field, joined?.[field] ?? null]))};
  if (joined?.outcome === JOIN_OUTCOME.RUNNING) {
    handler.logger.info(LOG.CREATE_LEARNER_RUNNING, fields);
  } else {
    handler.logger.warn(LOG.CREATE_LEARNER_NOT_RUNNING, fields);
  }
}

async function runAdmittedWorker(handler, owner, worker) {
  const {claim, evidence, replicaOptions} = worker;
  const {operationId, replicaId} = evidence;
  try {
    if (!await fencedWorkerIsCurrent(handler, owner, claim, evidence)) {
      handler.logger.warn(LOG.CREATE_LEARNER_WORKER_FENCED,
        {operationId, replicaId, nodeId: handler.nodeId});
      return;
    }
    reportLearnerJoin(handler, evidence,
      await handler.joinMessageGroupReplicaAsLearner(replicaOptions));
  } catch (error) {
    handler.emitExecutorOutcome(
      EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED, operationId,
      WORKFLOW_STEP.FAILED,
      buildMessageGroupCreateFailureOptions(error, replicaId));
    handler.logger.error(LOG.CREATE_FAILED,
      {operationId, replicaId, nodeId: handler.nodeId, error: error.message});
  } finally {
    owner.releasePhysicalWorker(claim);
    handler.inProgressOperations.delete(operationId);
  }
}

function startAdmittedWorker(handler, owner, worker) {
  const {operationId, replicaId, entityId} = worker.evidence;
  handler.inProgressOperations.set(operationId, {
    type: ReplicaOperationMessageType.CREATE_REPLICA, replicaId, entityId,
  });
  setImmediate(() => {
    runAdmittedWorker(handler, owner, worker).catch((error) => {
      handler.logger.error(LOG.CREATE_FAILED,
        {operationId, replicaId, nodeId: handler.nodeId, error: error.message});
    });
  });
}

function learnerReplicaOptions(handler, owner, admitted) {
  const {basis, joinPackage, evidence, claim} = admitted;
  return Object.freeze({
    operationId: evidence.operationId,
    groupId: basis.identity.groupId,
    replicaId: basis.identity.targetReplicaId,
    nodeId: handler.nodeId,
    createAdmissionOwner: owner,
    createAdmissionEvidence: evidence,
    createPhysicalWorkerClaim: claim,
    createAdmissionBasis: Object.freeze({...basis.where, ...OPEN_OPERATION,
      ...MATERIALIZED_ADMISSION}),
    messageGroupLearnerJoin: Object.freeze({
      identity: basis.identity,
      learnerStamp: basis.learnerStamp,
      committedPermit: basis.committedPermit,
      learnerOrigin: basis.learnerOrigin,
      joinPackage,
    }),
  });
}

/**
 * The admission turn, inside the admission owner's per-operation lane: the
 * CREATE CAS under the fact's basis, a worker only for an ADMITTED evidence of
 * this boot, the basis-fenced MATERIALIZED advance, then the sole worker.
 * @param {Object} handler - The MessageGroupServiceHandler.
 * @param {Object} owner - The handler's ReplicaCreateAdmissionOwner.
 * @param {Object} request - The CREATE_REPLICA payload.
 * @param {Object} fact - {basis, joinPackage}.
 * @return {Promise<Object>} The handler response.
 */
async function admitLearnerCreate(handler, owner, request, fact) {
  const where = fact.basis.where;
  const admitted = await owner.claim(admissionRequest(handler, request), where);
  if (admitted.admissionState !== CREATE_ADMISSION_STATE.ADMITTED ||
      admitted.ownerIncarnation !== owner.ownerIncarnation) {
    return answer(handler, request, STATUS.IN_PROGRESS, REFUSAL.ADMISSION_RETAINED);
  }
  const evidence = await owner.markMaterialized(admitted,
    {...where, ...OPEN_OPERATION});
  if (!evidence) {
    return answer(handler, request, STATUS.ERROR, CREATE_ADMISSION_ERROR_CODE.STALE);
  }
  const claim = await owner.claimPhysicalWorker(evidence);
  if (!claim) {
    return answer(handler, request, STATUS.IN_PROGRESS, REFUSAL.WORKER_NOT_ADMITTED);
  }
  const replicaOptions = learnerReplicaOptions(handler, owner,
    {...fact, evidence, claim});
  startAdmittedWorker(handler, owner, {claim, evidence, replicaOptions});
  handler.logger.info(LOG.CREATE_LEARNER_ADMITTED, {operationId: evidence.operationId,
    replicaId: evidence.replicaId, replicaCreatedAt: evidence.replicaCreatedAt,
    nodeId: handler.nodeId});
  return answer(handler, request, STATUS.INITIATED);
}

/**
 * Handle a CREATE that carries a learner join package. Every refusal happens
 * before any physical work and leaves the membership obligation untouched;
 * a missing learner-join capability is refused before any read or write.
 * @param {Object} handler - The MessageGroupServiceHandler.
 * @param {Object} request - The CREATE_REPLICA payload.
 * @return {Promise<Object>} The handler response.
 */
async function handleMessageGroupLearnerCreate(handler, request) {
  if (typeof handler.joinMessageGroupReplicaAsLearner !== 'function') {
    return answer(handler, request, STATUS.ERROR,
      REFUSAL.LEARNER_JOIN_CAPABILITY_UNAVAILABLE);
  }
  const operationId = request[FIELD.OPERATION_ID];
  const recorded = await readRecordedLearner(handler, operationId);
  if (recorded.refusal) {
    return answer(handler, request, STATUS.ERROR, recorded.refusal,
      recorded.deferRetry);
  }
  const joinPackage = boundJoinPackage(
    request[FIELD.MESSAGE_GROUP_JOIN_PACKAGE], recorded.basis.identity);
  if (joinPackage === null) {
    return answer(handler, request, STATUS.ERROR, REFUSAL.JOIN_PACKAGE_INVALID);
  }
  const owner = handler.getReplicaCreateAdmissionOwner();
  try {
    return await owner.runExclusive(operationId, () => admitLearnerCreate(
      handler, owner, request, {basis: recorded.basis, joinPackage}));
  } catch (error) {
    const code = error?.errorCode ?? error?.code ?? CREATE_ADMISSION_ERROR_CODE.DEFERRED;
    return answer(handler, request, STATUS.ERROR, code, error?.deferRetry === true);
  }
}

export {
  carriesLearnerJoinPackage,
  handleMessageGroupLearnerCreate,
  learnerCreateDependencies,
};
