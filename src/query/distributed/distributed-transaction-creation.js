import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {
  COMMIT_MODE,
  PARTICIPANT_SET_STATE,
} from '../../constants/index.js';
import {
  TRANSACTION_ID_MINT_ATTEMPTS,
  TRANSACTION_STATUS,
} from './distributed-transaction-coordinator-constants.js';
import {isTransactionIdCollision} from './distributed-transaction-identity.js';
import {
  TRANSACTION_CREATION_STATE,
  buildInitialTransactionDeliveryKey,
  encodeInitialTransactionRow,
} from './distributed-transaction-creation-contract.js';
import {
  DISTRIBUTED_BEGIN_CONSUMER_KIND,
  attachDistributedBeginAcceptance,
  createDistributedBeginConsumer,
} from './distributed-begin-consumer.js';

const DEFAULT_MAX_PENDING_CREATIONS = 100;
const DEFAULT_MAX_CREATION_BYTES = 1048576;
const DEFAULT_MAX_CREATION_SWEEP = 16;
const OPERATION_FIXED_BYTES = 128;
const RECORD_FIXED_BYTES = 256;

function positiveSafeInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) {
    throw new TypeError('Invalid distributed transaction creation resource limit');
  }
  return value;
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function pressureResult() {
  return {
    success: false,
    error: QUERY_ERROR_MSG.TRANSACTION_CREATION_PRESSURE,
    errorCode: QUERY_ERROR_CODE.TRANSACTION_CREATION_PRESSURE,
    retryable: true,
  };
}

function uncertainResult(tx) {
  return {
    success: false,
    error: QUERY_ERROR_MSG.TRANSACTION_CREATION_UNCERTAIN,
    errorCode: QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN,
    transactionId: tx.transactionId,
    timeoutDeadline: tx.timeoutDeadline,
    retryable: true,
  };
}

function recoveryPendingResult(tx) {
  return {
    success: false,
    error: QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
    errorCode: QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
    transactionId: tx.transactionId,
  };
}

function isPendingCreation(tx) {
  return Boolean(tx?.transactionCreationState) &&
    tx.transactionCreationState !== TRANSACTION_CREATION_STATE.ENTERED_ACTIVE;
}

function hasAdvancedCreationReadback(error, retainAdvancedReadback) {
  return error?.code === QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE &&
    error.advancedTransactionRow && retainAdvancedReadback !== null;
}

function failureResult(error) {
  return {
    success: false,
    error: error?.message || QUERY_ERROR_MSG.BEGIN_FAILED,
    errorCode: error?.code || error?.errorCode ||
      QUERY_ERROR_CODE.TRANSACTION_STATE_PERSIST_FAILED,
  };
}

function initializeTransactionCreationOwner(owner, options = {}) {
  owner.maxPendingTransactionCreationRecords = positiveSafeInteger(
    options.maxUncertainTransactionCreations,
    DEFAULT_MAX_PENDING_CREATIONS,
  );
  owner.maxPendingTransactionCreationBytes = positiveSafeInteger(
    options.maxUncertainTransactionCreationCanonicalBytes,
    DEFAULT_MAX_CREATION_BYTES,
  );
  owner.maxUncertainCreationSweepPerTurn = positiveSafeInteger(
    options.maxUncertainCreationSweepPerTurn,
    DEFAULT_MAX_CREATION_SWEEP,
  );
  owner.pendingTransactionCreationOperationCount = 0;
  owner.pendingTransactionCreationOperationBytes = 0;
  owner.pendingTransactionCreationAttachmentCount = 0;
  owner.pendingTransactionCreationRecordCount = 0;
  owner.pendingTransactionCreationRecordBytes = 0;
  owner.transactionCreationInvocationSequence = 0;
  owner.transactionCreationAttachmentsBySession = new Map();
}

function reserveTransactionCreationOperation(owner, sessionId, expectedTransactionId) {
  const bytes = OPERATION_FIXED_BYTES + byteLength(sessionId) +
      byteLength(expectedTransactionId || '');
  if (owner.pendingTransactionCreationOperationCount >=
        owner.maxPendingTransactionCreationRecords ||
        owner.pendingTransactionCreationAttachmentCount >=
        owner.maxPendingTransactionCreationRecords ||
        totalPendingTransactionCreationBytes(owner) + bytes >
        owner.maxPendingTransactionCreationBytes) {
    return null;
  }
  const token = {
    attachmentReleased: false,
    bytes,
    invocationId: ++owner.transactionCreationInvocationSequence,
    operationReleased: false,
    sessionId,
  };
  owner.pendingTransactionCreationOperationCount += 1;
  owner.pendingTransactionCreationOperationBytes += bytes;
  owner.pendingTransactionCreationAttachmentCount += 1;
  let attachments = owner.transactionCreationAttachmentsBySession.get(sessionId);
  if (!attachments) {
    attachments = new Set();
    owner.transactionCreationAttachmentsBySession.set(sessionId, attachments);
  }
  attachments.add(token);
  return token;
}

function releaseTransactionCreationAttachment(owner, token) {
  if (!token || token.attachmentReleased) return;
  token.attachmentReleased = true;
  owner.pendingTransactionCreationAttachmentCount -= 1;
  const attachments = owner.transactionCreationAttachmentsBySession.get(
    token.sessionId,
  );
  attachments?.delete(token);
  if (attachments?.size === 0) {
    owner.transactionCreationAttachmentsBySession.delete(token.sessionId);
  }
}

function releaseTransactionCreationOperation(owner, token) {
  if (!token || token.operationReleased) return;
  releaseTransactionCreationAttachment(owner, token);
  token.operationReleased = true;
  owner.pendingTransactionCreationOperationCount -= 1;
  owner.pendingTransactionCreationOperationBytes -= token.bytes;
  token.sessionId = null;
  token.bytes = 0;
}

function detachDistributedTransactionCreationWaiters(owner, sessionId) {
  const attachments = owner.transactionCreationAttachmentsBySession.get(sessionId);
  if (!attachments) return;
  for (const token of [...attachments]) {
    releaseTransactionCreationAttachment(owner, token);
  }
}

function totalPendingTransactionCreationBytes(owner) {
  return owner.pendingTransactionCreationOperationBytes +
      owner.pendingTransactionCreationRecordBytes;
}

function reserveTransactionCreationRecord(owner, tx, row) {
  const rowBytes = encodeInitialTransactionRow(row);
  const deliveryKey = buildInitialTransactionDeliveryKey(
    tx.transactionId,
    rowBytes,
  );
  const bytes = RECORD_FIXED_BYTES + rowBytes.length +
      byteLength(deliveryKey);
  if (owner.pendingTransactionCreationRecordCount >=
        owner.maxPendingTransactionCreationRecords ||
        totalPendingTransactionCreationBytes(owner) + bytes >
        owner.maxPendingTransactionCreationBytes) {
    rowBytes.fill(0);
    return false;
  }
  const reservation = {bytes, released: false, tx};
  tx.transactionCreationReservation = reservation;
  tx.transactionCreationInitialRow = Object.freeze({...row});
  tx.transactionCreationInitialRowBytes = rowBytes;
  tx.transactionCreationDeliveryKey = deliveryKey;
  owner.pendingTransactionCreationRecordCount += 1;
  owner.pendingTransactionCreationRecordBytes += bytes;
  return true;
}

function releaseTransactionCreationRecord(owner, tx) {
  const reservation = tx?.transactionCreationReservation;
  if (!reservation || reservation.released || reservation.tx !== tx) return;
  reservation.released = true;
  if (Buffer.isBuffer(tx.transactionCreationInitialRowBytes)) {
    tx.transactionCreationInitialRowBytes.fill(0);
  }
  tx.transactionCreationInitialRowBytes = null;
  tx.transactionCreationInitialRow = null;
  tx.transactionCreationDeliveryKey = null;
  tx.transactionCreationAcceptanceToken = null;
  tx.transactionCreationConsumer = null;
  owner.pendingTransactionCreationRecordCount -= 1;
  owner.pendingTransactionCreationRecordBytes -= reservation.bytes;
  reservation.tx = null;
  reservation.bytes = 0;
}

function creationPressureResult() {
  return pressureResult();
}

function creationUncertainResult(tx) {
  return uncertainResult(tx);
}

function isPendingTransactionCreation(tx) {
  return isPendingCreation(tx);
}

function transactionCreationAdmission(owner, sessionId) {
  const tx = owner.transactionsBySession.get(sessionId);
  return isPendingCreation(tx) ? uncertainResult(tx) : null;
}

function buildTransactionCreationResult(owner, tx, consumer, source) {
  if (!consumer || consumer.kind === DISTRIBUTED_BEGIN_CONSUMER_KIND.DIRECT) {
    tx.transactionCreationState = TRANSACTION_CREATION_STATE.ENTERED_ACTIVE;
    releaseTransactionCreationRecord(owner, tx);
    return buildTransactionBeginSuccess(tx);
  }
  if (tx.transactionCreationConsumer !== consumer ||
        tx.transactionCreationState ===
          TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY) {
    return creationUncertainResult(tx);
  }
  const token = Object.freeze({
    consumer,
    revision: (tx.transactionCreationRevision || 0) + 1,
    source,
    transactionId: tx.transactionId,
    tx,
  });
  tx.transactionCreationRevision = token.revision;
  tx.transactionCreationState = TRANSACTION_CREATION_STATE.SUCCESS_CLAIMED;
  tx.transactionCreationConsumer = consumer;
  tx.transactionCreationAcceptanceToken = token;
  return attachDistributedBeginAcceptance(
    buildTransactionBeginSuccess(tx),
    token,
  );
}

function buildTransactionBeginSuccess(tx) {
  return {
    success: true,
    operation: QUERY_OPERATION.BEGIN_TRANSACTION,
    sessionId: tx.sessionId,
    transactionId: tx.transactionId,
    transactionEpoch: tx.transactionEpoch,
    transactionMode: tx.transactionMode,
  };
}

function acceptDistributedBegin(owner, consumer, acceptanceToken, enterLocalBlock) {
  const tx = acceptanceToken?.tx;
  if (!tx || acceptanceToken !== tx.transactionCreationAcceptanceToken ||
        consumer !== tx.transactionCreationConsumer ||
        acceptanceToken.consumer !== consumer ||
        owner.transactionsBySession.get(tx.sessionId) !== tx ||
        tx.transactionCreationState !==
          TRANSACTION_CREATION_STATE.SUCCESS_CLAIMED) {
    return false;
  }
  if (typeof enterLocalBlock === 'function') enterLocalBlock(tx.transactionId);
  tx.transactionCreationState = TRANSACTION_CREATION_STATE.ENTERED_ACTIVE;
  releaseTransactionCreationRecord(owner, tx);
  return true;
}

function retireDistributedBeginConsumer(owner, sessionId, consumer) {
  detachDistributedTransactionCreationWaiters(owner, sessionId);
  const tx = owner.transactionsBySession.get(sessionId);
  if (!tx || tx.transactionCreationConsumer !== consumer ||
        tx.transactionCreationState ===
          TRANSACTION_CREATION_STATE.ENTERED_ACTIVE) return;
  tx.transactionCreationState = TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY;
  tx.transactionCreationAcceptanceToken = null;
  tx.transactionCreationConsumer = null;
}

function retireUncertainCreationsForProcessShutdown(owner) {
  for (const tx of owner.workflowCoordinator.workflowsById.values()) {
    if (!isPendingCreation(tx)) continue;
    owner.workflowCoordinator.removeWorkflow(tx.workflowId);
    releaseTransactionCreationRecord(owner, tx);
  }
  for (const tokenSet of owner.transactionCreationAttachmentsBySession.values()) {
    for (const token of [...tokenSet]) releaseTransactionCreationAttachment(owner, token);
  }
}

function getTransactionCreationDiagnostics(owner ) {
  const roles = {};
  for (const tx of owner.workflowCoordinator.workflowsById.values()) {
    if (!isPendingCreation(tx)) continue;
    roles[tx.transactionCreationState] =
        (roles[tx.transactionCreationState] || 0) + 1;
  }
  return Object.freeze({
    attachmentCount: owner.pendingTransactionCreationAttachmentCount,
    operationCount: owner.pendingTransactionCreationOperationCount,
    recordBytes: owner.pendingTransactionCreationRecordBytes,
    recordCount: owner.pendingTransactionCreationRecordCount,
    roles: Object.freeze({...roles}),
    totalBytes: totalPendingTransactionCreationBytes(owner),
  });
}

function directBeginConsumer(sessionId) {
  return createDistributedBeginConsumer(
    DISTRIBUTED_BEGIN_CONSUMER_KIND.DIRECT,
    sessionId,
  );
}

function creationRecoveryPendingResult(tx) {
  return recoveryPendingResult(tx);
}

function removeRetainedTransactionCreation(owner, transactionId) {
  const retained = owner.workflowCoordinator.getWorkflowById(transactionId);
  if (!retained) return null;
  owner.workflowCoordinator.removeWorkflow(transactionId);
  releaseTransactionCreationRecord(owner, retained);
  return retained;
}

function retainAdvancedCreationReadback(owner, transactionId, row) {
  removeRetainedTransactionCreation(owner, transactionId);
  try {
    owner.retainAdvancedTransactionReadback(row);
  } catch (recoveryError) {
    owner.logger?.warn?.(QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE, {
      transactionId,
      error: recoveryError?.message,
    });
  }
  return recoveryPendingResult({transactionId});
}

function resolveUniqueTransactionRegistrationError(owner, error, context) {
  const {attempt, consumer, transactionId} = context;
  if (hasAdvancedCreationReadback(
    error,
    owner.retainAdvancedTransactionReadback,
  )) {
    return {result: retainAdvancedCreationReadback(owner,
      transactionId,
      error.advancedTransactionRow,
    )};
  }
  if (isTransactionIdCollision(error) &&
        attempt < TRANSACTION_ID_MINT_ATTEMPTS) {
    removeRetainedTransactionCreation(owner, transactionId);
    return {retry: true};
  }
  const retained = owner.workflowCoordinator.getWorkflowById(transactionId);
  if (error?.code === QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN &&
        retained) {
    const liveConsumer = consumer?.kind ===
        DISTRIBUTED_BEGIN_CONSUMER_KIND.DIRECT ? null : consumer;
    retained.transactionCreationConsumer = liveConsumer;
    retained.transactionCreationState = liveConsumer ?
      TRANSACTION_CREATION_STATE.UNCERTAIN_ANSWERED :
      TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY;
    return {result: creationUncertainResult(retained)};
  }
  removeRetainedTransactionCreation(owner, transactionId);
  return {result: failureResult(error)};
}

async function registerUniqueTransaction(owner, sessionId, fields) {
  const {consumer, transactionEpoch, timeoutBudget, transactionMode} = fields;
  for (let attempt = 1; ; attempt += 1) {
    const transactionId = owner.createTransactionId(sessionId);
    try {
      const tx = await registerTransaction(owner, sessionId, transactionId, {
        consumer, transactionEpoch, timeoutBudget, transactionMode,
      });
      return buildTransactionCreationResult(owner,
        tx, consumer, 'DIRECT_FIRST_RESULT',
      );
    } catch (error) {
      const resolution = resolveUniqueTransactionRegistrationError(owner,
        error,
        {attempt, consumer, transactionId},
      );
      if (resolution.retry === true) continue;
      return resolution.result;
    }
  }
}

async function registerTransaction(owner, sessionId, transactionId, fields) {
  const {consumer, transactionEpoch, timeoutBudget, transactionMode} = fields;
  const now = owner.now();
  const tx = {
    sessionId, ownerKey: sessionId, transactionId, workflowId: transactionId,
    transactionEpoch, timeoutBudget,
    timeoutDeadline: timeoutBudget.deadlineMs,
    status: TRANSACTION_STATUS.ACTIVE,
    transactionMode,
    participantSetState: PARTICIPANT_SET_STATE.OPEN,
    participantSetText: '[]',
    commitMode: COMMIT_MODE.NOT_SELECTED,
    frozenParticipantCount: 0,
    participantSetFrozenAt: 0,
    decisionTrace: [],
    participants: new Map(),
    writeOperations: [],
    createdAt: now,
    updatedAt: now,
    transactionCreationConsumer: consumer,
    transactionCreationRevision: 0,
    transactionCreationState: TRANSACTION_CREATION_STATE.INSERTING,
  };
  const initialRow = {
    transaction_id: transactionId,
    session_id: sessionId,
    status: TRANSACTION_STATUS.ACTIVE,
    transaction_epoch: transactionEpoch,
    timeout_deadline: timeoutBudget.deadlineMs,
    transaction_mode: transactionMode,
    participant_set_state: PARTICIPANT_SET_STATE.OPEN,
    participant_set_text: '[]',
    commit_mode: COMMIT_MODE.NOT_SELECTED,
    frozen_participant_count: 0,
    updated_at: now,
    decision: null,
    decision_text: null,
    decision_digest: null,
    created_at: now,
  };
  if (!reserveTransactionCreationRecord(owner, tx, initialRow)) {
    throw Object.assign(new Error(
      QUERY_ERROR_MSG.TRANSACTION_CREATION_PRESSURE,
    ), {code: QUERY_ERROR_CODE.TRANSACTION_CREATION_PRESSURE});
  }
  try {
    return await owner.workflowCoordinator.registerWorkflow(tx);
  } catch (error) {
    if (owner.workflowCoordinator.getWorkflowById(transactionId) === null) {
      releaseTransactionCreationRecord(owner, tx);
    }
    throw error;
  }
}

async function reconcileTransactionCreationOwned(owner, tx, consumer) {
  if (owner.transactionsBySession.get(tx.sessionId) !== tx) {
    return creationUncertainResult(tx);
  }
  if (tx.transactionCreationState ===
        TRANSACTION_CREATION_STATE.SUCCESS_CLAIMED) {
    return tx.transactionCreationConsumer === consumer ?
      attachDistributedBeginAcceptance(
        buildTransactionBeginSuccess(tx),
        tx.transactionCreationAcceptanceToken,
      ) : creationUncertainResult(tx);
  }
  if (tx.transactionCreationState ===
        TRANSACTION_CREATION_STATE.RECOVERY_PENDING) {
    return creationRecoveryPendingResult(tx);
  }
  try {
    await owner.workflowCoordinator.persistWorkflowState(tx.workflowId);
    return completeReconciledTransactionCreation(owner, tx, consumer);
  } catch (error) {
    return resolveTransactionCreationReconcileError(owner, tx, error);
  }
}

function completeReconciledTransactionCreation(owner, tx, consumer) {
  if (owner.transactionsBySession.get(tx.sessionId) !== tx) {
    return creationUncertainResult(tx);
  }
  if (consumer !== null) {
    return buildTransactionCreationResult(owner, tx, consumer, 'RETRY_HANDOFF');
  }
  tx.transactionCreationState = TRANSACTION_CREATION_STATE.ENTERED_ACTIVE;
  tx.recoveryDiscovered = true;
  owner.recoveredTransactionIds.add(tx.workflowId);
  releaseTransactionCreationRecord(owner, tx);
  return creationRecoveryPendingResult(tx);
}

function resolveTransactionCreationReconcileError(owner, tx, error) {
  if (error?.code === QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE &&
        error.advancedTransactionRow &&
        owner.retainAdvancedTransactionReadback !== null) {
    owner.workflowCoordinator.removeWorkflow(tx.workflowId);
    releaseTransactionCreationRecord(owner, tx);
    owner.retainAdvancedTransactionReadback(error.advancedTransactionRow);
    return creationRecoveryPendingResult(tx);
  }
  if (isTransactionIdCollision(error)) {
    owner.workflowCoordinator.removeWorkflow(tx.workflowId);
    releaseTransactionCreationRecord(owner, tx);
  }
  return error?.code === QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN ?
    creationUncertainResult(tx) : failureResult(error);
}

export {
  acceptDistributedBegin,
  creationPressureResult,
  creationUncertainResult,
  directBeginConsumer,
  getTransactionCreationDiagnostics,
  initializeTransactionCreationOwner,
  isPendingTransactionCreation,
  reconcileTransactionCreationOwned,
  registerUniqueTransaction,
  releaseTransactionCreationOperation,
  releaseTransactionCreationRecord,
  reserveTransactionCreationOperation,
  retireDistributedBeginConsumer,
  retireUncertainCreationsForProcessShutdown,
  transactionCreationAdmission,
};
