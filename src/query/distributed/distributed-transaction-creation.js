import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_OPERATION,
} from '../query-constants.js';
import {
  COMMIT_MODE,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
} from '../../constants/index.js';
import {
  TERMINAL_TRANSACTION_STATUS,
  TRANSACTION_ID_MINT_ATTEMPTS,
  TRANSACTION_STATUS,
} from './distributed-transaction-coordinator-constants.js';
import {isCanonicalTransactionId, isTransactionIdCollision} from
  './distributed-transaction-identity.js';
import {
  TRANSACTION_CREATION_STATE,
  buildInitialTransactionDeliveryKey,
  encodeInitialTransactionRow,
  measureInitialTransactionRowFields,
} from './distributed-transaction-creation-contract.js';
import {
  DISTRIBUTED_BEGIN_CONSUMER_KIND,
  attachDistributedBeginAcceptance,
  createDistributedBeginConsumer,
  distributedBeginConsumerOf,
} from './distributed-begin-consumer.js';
import {
  assertResourceInvariants,
  bindCreationAttachmentToRecord,
  bindCreationRecordEnvelope,
  cancelCreationRecordEnvelope,
  detachCreationAttachments,
  initializeCreationResources,
  ownDataValue,
  releaseCreationOperation,
  releaseCreationRecordEnvelope,
  reserveCreationOperation,
  reserveCreationRecordEnvelope,
  totalPendingBytes,
  transferCreationAttachmentToRecord,
} from './distributed-transaction-creation-resources.js';
function pressureResult() {
  return {
    success: false,
    error: QUERY_ERROR_MSG.TRANSACTION_CREATION_PRESSURE,
    errorCode: QUERY_ERROR_CODE.TRANSACTION_CREATION_PRESSURE,
    deferRetry: true,
    retryable: true,
  };
}
function uncertainResult(tx, cause = null) {
  const result = {
    success: false,
    error: QUERY_ERROR_MSG.TRANSACTION_CREATION_UNCERTAIN,
    errorCode: QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN,
    transactionId: tx.transactionId,
    timeoutDeadline: tx.timeoutDeadline,
    deferRetry: true,
    retryable: true,
  };
  if (Number.isSafeInteger(cause?.retryAfterMs) && cause.retryAfterMs > 0) {
    result.retryAfterMs = cause.retryAfterMs;
  }
  return result;
}
function recoveryPendingResult(tx) {
  return {
    success: false,
    error: QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE,
    errorCode: QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
    transactionId: tx.transactionId,
    deferRetry: true,
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
  initializeCreationResources(owner, options);
}
function reserveTransactionCreationOperation(owner, fields) {
  return reserveCreationOperation(owner, fields);
}
function releaseTransactionCreationOperation(owner, token) {
  releaseCreationOperation(owner, token);
}
function detachDistributedTransactionCreationWaiters(owner, sessionId) {
  detachCreationAttachments(owner, sessionId);
}
function totalPendingTransactionCreationBytes(owner) {
  return totalPendingBytes(owner);
}
function releaseTransactionCreationRecord(owner, tx) {
  const reservation = tx?.transactionCreationReservation;
  if (!reservation || reservation.released || reservation.tx !== tx) return;
  if (Buffer.isBuffer(tx.transactionCreationInitialRowBytes)) {
    tx.transactionCreationInitialRowBytes.fill(0);
  }
  tx.transactionCreationInitialRowBytes = null;
  tx.transactionCreationInitialRow = null;
  tx.transactionCreationDeliveryKey = null;
  tx.transactionCreationAdvancedObserved = null;
  tx.transactionCreationAdvancedHandoff = null;
  tx.transactionCreationAcceptanceToken = null;
  tx.transactionCreationConsumer = null;
  releaseCreationRecordEnvelope(owner, tx);
}
function releaseTerminalServerTransactionCreation(owner, tx) {
  if (!isCurrentCreation(owner, tx) ||
      tx.transactionCreationAdvancedHandoff !== true ||
      tx.transactionCreationConsumer !== null ||
      !TERMINAL_TRANSACTION_STATUS.has(tx.status)) return false;
  tx.transactionCreationState = null;
  if (owner.transactionsBySession.get(tx.sessionId) === tx) {
    owner.transactionsBySession.delete(tx.sessionId);
  }
  releaseTransactionCreationRecord(owner, tx);
  return true;
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
function isCurrentCreation(owner, tx) {
  return !owner.transactionCreationShutdown &&
    tx?.transactionCreationGeneration === owner.transactionCreationGeneration &&
    owner.workflowCoordinator.getWorkflowById(tx.workflowId) === tx &&
    owner.transactionsBySession.get(tx.sessionId) === tx;
}
function creationDeadlinesAreLive(owner, tx, operationToken) {
  const now = owner.now();
  return Number.isSafeInteger(now) && now >= 0 && !Object.is(now, -0) &&
    Number.isSafeInteger(tx?.timeoutDeadline) &&
    !Object.is(tx.timeoutDeadline, -0) && tx.timeoutDeadline > now &&
    Number.isSafeInteger(operationToken?.turnDeadlineAtMs) &&
    operationToken.turnDeadlineAtMs > now;
}
function originalCreationDeadlineIsLive(owner, tx) {
  const now = owner.now();
  return Number.isSafeInteger(now) && now >= 0 && !Object.is(now, -0) &&
    Number.isSafeInteger(tx?.timeoutDeadline) &&
    !Object.is(tx.timeoutDeadline, -0) && tx.timeoutDeadline > now;
}
function installCreationTurnBudget(owner, tx, operationToken) {
  const now = owner.now();
  if (!Number.isSafeInteger(now) || now < 0 || Object.is(now, -0) ||
      operationToken?.generation !== owner.transactionCreationGeneration ||
      !Number.isSafeInteger(operationToken.turnDeadlineAtMs) ||
      operationToken.turnDeadlineAtMs <= now) return false;
  const originalLive = now < tx.timeoutDeadline;
  const deadlineMs = originalLive ?
    Math.min(tx.timeoutDeadline, operationToken.turnDeadlineAtMs) :
    operationToken.turnDeadlineAtMs;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= now) return false;
  tx.transactionCreationTurnBudget = Object.freeze({
    configuredBudgetMs: deadlineMs - operationToken.turnStartedAtMs,
    deadlineMs,
    operationName: QUERY_OPERATION.BEGIN_TRANSACTION,
    startedAtMs: operationToken.turnStartedAtMs,
  });
  return true;
}
function retainConsumerAfterSpentTurn(owner, tx, consumer, operationToken) {
  const detached = consumer === null && operationToken?.callerAttached === true &&
    tx.transactionCreationConsumer !== null;
  if (!isRetainedAdvancedConsumer(tx, consumer) && !detached) return;
  tx.transactionCreationState = tx.transactionCreationAdvancedObserved ?
    TRANSACTION_CREATION_STATE.RECOVERY_PENDING :
    TRANSACTION_CREATION_STATE.UNCERTAIN_ANSWERED;
  transferCreationAttachmentToRecord(owner, operationToken, tx);
}
function buildTransactionCreationResult(owner, tx, consumer, source,
  operationToken) {
  if (!isCurrentCreation(owner, tx)) {
    return creationRecoveryPendingResult(tx);
  }
  if (!creationDeadlinesAreLive(owner, tx, operationToken)) {
    retainConsumerAfterSpentTurn(owner, tx, consumer, operationToken);
    return creationRecoveryPendingResult(tx);
  }
  if (consumer?.kind === DISTRIBUTED_BEGIN_CONSUMER_KIND.DIRECT) {
    tx.transactionCreationState = TRANSACTION_CREATION_STATE.ENTERED_ACTIVE;
    releaseTransactionCreationRecord(owner, tx);
    return buildTransactionBeginSuccess(tx);
  }
  if (!consumer) {
    tx.transactionCreationState = TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY;
    return creationUncertainResult(tx);
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
    turnDeadlineAtMs: operationToken.turnDeadlineAtMs,
    transactionId: tx.transactionId,
    tx,
  });
  tx.transactionCreationRevision = token.revision;
  tx.transactionCreationState = TRANSACTION_CREATION_STATE.SUCCESS_CLAIMED;
  tx.transactionCreationConsumer = consumer;
  tx.transactionCreationAcceptanceToken = token;
  if (!transferCreationAttachmentToRecord(owner, operationToken, tx)) {
    tx.transactionCreationAcceptanceToken = null;
    tx.transactionCreationConsumer = null;
    tx.transactionCreationState = TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY;
    return creationUncertainResult(tx);
  }
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
function canAcceptDistributedBegin(owner, consumer, acceptanceToken) {
  const tx = acceptanceToken?.tx;
  return Boolean(tx && isCurrentCreation(owner, tx) &&
        creationDeadlinesAreLive(owner, tx, acceptanceToken) &&
        acceptanceToken === tx.transactionCreationAcceptanceToken &&
        consumer === tx.transactionCreationConsumer &&
        acceptanceToken.consumer === consumer &&
        tx.transactionCreationState === TRANSACTION_CREATION_STATE.SUCCESS_CLAIMED);
}

function acceptDistributedBegin(owner, consumer, acceptanceToken, enterLocalBlock) {
  if (!canAcceptDistributedBegin(owner, consumer, acceptanceToken)) return false;
  const tx = acceptanceToken.tx;
  try {
    if (typeof enterLocalBlock === 'function') enterLocalBlock(tx.transactionId);
  } catch (error) {
    if (canAcceptDistributedBegin(owner, consumer, acceptanceToken)) {
      tx.transactionCreationState = TRANSACTION_CREATION_STATE.SUCCESS_CLAIMED;
    }
    throw error;
  }
  if (!canAcceptDistributedBegin(owner, consumer, acceptanceToken)) return false;
  tx.transactionCreationState = TRANSACTION_CREATION_STATE.ENTERED_ACTIVE;
  releaseTransactionCreationRecord(owner, tx);
  return true;
}

function retireDistributedBeginConsumer(owner, sessionId, consumer) {
  const tx = owner.transactionsBySession.get(sessionId);
  if (!tx || tx.transactionCreationConsumer !== consumer ||
        tx.transactionCreationState ===
          TRANSACTION_CREATION_STATE.ENTERED_ACTIVE) return;
  detachDistributedTransactionCreationWaiters(owner, sessionId);
  tx.transactionCreationState = TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY;
  tx.transactionCreationAcceptanceToken = null;
  tx.transactionCreationConsumer = null;
}

function retireUncertainCreationsForProcessShutdown(owner) {
  if (!owner.transactionCreationShutdown) {
    owner.transactionCreationShutdown = true;
    owner.transactionCreationGeneration += 1;
  }
  for (const tx of owner.workflowCoordinator.workflowsById.values()) {
    if (!isPendingCreation(tx)) continue;
    owner.workflowCoordinator.removeWorkflow(tx.workflowId);
    releaseTransactionCreationRecord(owner, tx);
  }
  for (const sessionId of [...owner.transactionCreationAttachmentsBySession.keys()]) {
    detachDistributedTransactionCreationWaiters(owner, sessionId);
  }
  assertResourceInvariants(owner);
}

function getTransactionCreationDiagnostics(owner ) {
  const roles = {};
  let retainedRoleCount = 0;
  for (const tx of owner.workflowCoordinator.workflowsById.values()) {
    if (!isPendingCreation(tx)) continue;
    retainedRoleCount += 1;
    roles[tx.transactionCreationState] =
        (roles[tx.transactionCreationState] || 0) + 1;
  }
  if (!Number.isSafeInteger(retainedRoleCount) || retainedRoleCount < 0 ||
      retainedRoleCount > owner.pendingTransactionCreationRecordCount) {
    throw new Error('Distributed transaction creation role invariant failed');
  }
  return Object.freeze({
    attachmentCount: owner.pendingTransactionCreationAttachmentCount,
    operationCount: owner.pendingTransactionCreationOperationCount,
    recordBytes: owner.pendingTransactionCreationRecordBytes,
    recordCount: owner.pendingTransactionCreationRecordCount,
    roles: Object.freeze({...roles}),
    ...(owner.transactionCreationLastSweepDiagnostic ?
      {sweep: owner.transactionCreationLastSweepDiagnostic} : {}),
    totalBytes: totalPendingTransactionCreationBytes(owner),
  });
}

function recordTransactionCreationSweepDiagnostic(owner, fields) {
  assertResourceInvariants(owner);
  const deadlines = [];
  for (const tx of owner.workflowCoordinator.workflowsById.values()) {
    if (isPendingCreation(tx) && Number.isSafeInteger(tx.timeoutDeadline)) {
      deadlines.push(tx.timeoutDeadline);
    }
  }
  owner.transactionCreationLastSweepDiagnostic = Object.freeze({
    deferredAttempts: owner.recoverySweepDeferredAttempts,
    deferredUntilMs: owner.recoverySweepDeferredUntilMs,
    oldestDeadlineAtMs: deadlines.length > 0 ? Math.min(...deadlines) : null,
    reservedBytes: owner.pendingTransactionCreationRecordBytes,
    retainedCount: owner.pendingTransactionCreationRecordCount,
    selectedCount: fields.selectedCount,
    stopReason: fields.stopReason,
  });
  return owner.transactionCreationLastSweepDiagnostic;
}

function directBeginConsumer(sessionId) {
  return createDistributedBeginConsumer(
    DISTRIBUTED_BEGIN_CONSUMER_KIND.DIRECT,
    sessionId,
  );
}

function checkedDeadline(startedAtMs, budgetMs) {
  const deadline = startedAtMs + budgetMs;
  return Number.isSafeInteger(startedAtMs) && startedAtMs >= 0 &&
    !Object.is(startedAtMs, -0) && Number.isSafeInteger(budgetMs) &&
    budgetMs > 0 && Number.isSafeInteger(deadline) && deadline >= startedAtMs ?
    deadline : null;
}

function isCanonicalCreationDeadline(value) {
  return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

function expectedCreationTransactionId(options, rawTransaction) {
  const configured = ownDataValue(options, 'expectedTransactionId');
  const value = configured ?? rawTransaction?.transactionId ?? null;
  return value === null || isCanonicalTransactionId(value) ? value : undefined;
}

function requestedCreationMode(options) {
  const value = ownDataValue(options, 'transactionMode');
  if (value === undefined) return TRANSACTION_MODE.EXPLICIT;
  return Object.values(TRANSACTION_MODE).includes(value) ? value : null;
}

function captureTransactionCreationOperation(owner, sessionId, options,
  rawTransaction) {
  const startedAtMs = owner.now();
  const turnDeadlineAtMs = checkedDeadline(startedAtMs,
    owner.transactionCreationTurnBudgetMs);
  const configuredDeadline = ownDataValue(options, 'timeoutDeadline');
  const originalDeadlineAtMs = configuredDeadline === undefined ?
    checkedDeadline(startedAtMs, owner.transactionBudgetMs) :
    configuredDeadline;
  if (turnDeadlineAtMs === null ||
      !isCanonicalCreationDeadline(originalDeadlineAtMs)) return null;
  const expectedTransactionId = expectedCreationTransactionId(options,
    rawTransaction);
  if (expectedTransactionId === undefined) return null;
  const transactionMode = requestedCreationMode(options);
  if (transactionMode === null) return null;
  const consumer = distributedBeginConsumerOf(options) ||
    directBeginConsumer(sessionId);
  return reserveTransactionCreationOperation(owner, {
    consumer,
    expectedTransactionId,
    originalDeadlineAtMs,
    sessionId,
    transactionMode,
    turnDeadlineAtMs,
    turnStartedAtMs: startedAtMs,
  });
}

function transactionCreationOperationConsumer(operationToken) {
  return operationToken?.attachment?.consumer ?? null;
}

function isRetainedAdvancedConsumer(tx, consumer) {
  return consumer?.kind !== DISTRIBUTED_BEGIN_CONSUMER_KIND.DIRECT &&
    tx.transactionCreationConsumer === consumer;
}
function captureTransactionCreationRecoveryOperation(owner, tx) {
  const startedAtMs = owner.now();
  const turnDeadlineAtMs = checkedDeadline(startedAtMs,
    owner.transactionCreationTurnBudgetMs);
  if (turnDeadlineAtMs === null) return null;
  return reserveTransactionCreationOperation(owner, {
    attachCaller: false,
    consumer: null,
    expectedTransactionId: tx.transactionId,
    originalDeadlineAtMs: tx.timeoutDeadline,
    sessionId: tx.sessionId,
    transactionMode: tx.transactionMode,
    turnDeadlineAtMs,
    turnStartedAtMs: startedAtMs,
  });
}

function creationRecoveryPendingResult(tx) {
  return recoveryPendingResult(tx);
}

async function retainAdvancedCreationReadback(owner, transactionId, row,
  operationToken = null) {
  const retained = owner.workflowCoordinator.getWorkflowById(transactionId);
  if (!retained || !isCurrentCreation(owner, retained)) {
    return recoveryPendingResult({transactionId});
  }
  retained.transactionCreationAdvancedObserved = true;
  if (typeof owner.retainAdvancedTransactionReadback !== 'function') {
    retained.transactionCreationState = TRANSACTION_CREATION_STATE.RECOVERY_PENDING;
    return recoveryPendingResult({transactionId});
  }
  try {
    await owner.retainAdvancedTransactionReadback(
      retained,
      row,
      retained.transactionCreationTurnBudget,
    ) === true;
  } catch (recoveryError) {
    owner.logger?.warn?.(QUERY_ERROR_MSG.TRANSACTION_RECOVERY_INCOMPLETE, {
      transactionId,
      error: recoveryError?.message,
    });
  }
  if (!isCurrentCreation(owner, retained)) {
    return recoveryPendingResult({transactionId});
  }
  retained.transactionCreationState = TRANSACTION_CREATION_STATE.RECOVERY_PENDING;
  const consumer = transactionCreationOperationConsumer(operationToken);
  if (isRetainedAdvancedConsumer(retained, consumer)) {
    transferCreationAttachmentToRecord(owner, operationToken, retained);
  }
  return recoveryPendingResult({transactionId});
}

function removeRetainedRegistration(owner, retained, transactionId) {
  if (!retained || !isCurrentCreation(owner, retained)) return;
  owner.workflowCoordinator.removeWorkflow(transactionId);
  releaseTransactionCreationRecord(owner, retained);
}

function retainUncertainRegistration(owner, retained, operationToken, error) {
  const consumer = transactionCreationOperationConsumer(operationToken);
  const liveConsumer = consumer?.kind ===
      DISTRIBUTED_BEGIN_CONSUMER_KIND.DIRECT ? null : consumer;
  retained.transactionCreationConsumer = liveConsumer;
  retained.transactionCreationState = liveConsumer ?
    TRANSACTION_CREATION_STATE.UNCERTAIN_ANSWERED :
    TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY;
  if (liveConsumer &&
      !transferCreationAttachmentToRecord(owner, operationToken, retained)) {
    retained.transactionCreationConsumer = null;
    retained.transactionCreationState =
      TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY;
  }
  return creationUncertainResult(retained, error);
}

async function resolveUniqueTransactionRegistrationError(owner, error, context) {
  const {attempt, operationToken, transactionId} = context;
  const retained = context.tx;
  if (hasAdvancedCreationReadback(
    error,
    owner.retainAdvancedTransactionReadback,
  )) {
    return {result: await retainAdvancedCreationReadback(owner,
      transactionId,
      error.advancedTransactionRow,
      operationToken,
    )};
  }
  if (isTransactionIdCollision(error) &&
        attempt < TRANSACTION_ID_MINT_ATTEMPTS) {
    removeRetainedRegistration(owner, retained, transactionId);
    return {retry: true};
  }
  if (error?.code === QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN &&
        retained && isCurrentCreation(owner, retained)) {
    return {result: retainUncertainRegistration(owner, retained,
      operationToken, error)};
  }
  removeRetainedRegistration(owner, retained, transactionId);
  return {result: failureResult(error)};
}

async function registerUniqueTransaction(owner, sessionId, fields) {
  const {operationToken, transactionEpoch, timeoutBudget,
    transactionMode} = fields;
  for (let attempt = 1; ; attempt += 1) {
    const transactionId = owner.createTransactionId(sessionId);
    if (!isCanonicalTransactionId(transactionId)) {
      return failureResult(new TypeError(
        QUERY_ERROR_MSG.BEGIN_FAILED,
      ));
    }
    const registrationContext = {tx: null};
    try {
      const tx = await registerTransaction(owner, sessionId, transactionId, {
        operationToken, transactionEpoch, timeoutBudget,
        transactionMode, registrationContext,
      });
      if (!originalCreationDeadlineIsLive(owner, tx)) {
        return await retainAdvancedCreationReadback(owner, transactionId,
          tx.transactionCreationInitialRow, operationToken);
      }
      return buildTransactionCreationResult(owner,
        tx, transactionCreationOperationConsumer(operationToken),
        'DIRECT_FIRST_RESULT', operationToken,
      );
    } catch (error) {
      const resolution = await resolveUniqueTransactionRegistrationError(owner,
        error,
        {attempt, operationToken, transactionId, tx: registrationContext.tx},
      );
      if (resolution.retry === true) continue;
      return resolution.result;
    }
  }
}

async function registerTransaction(owner, sessionId, transactionId, fields) {
  const {operationToken, transactionEpoch, timeoutBudget,
    transactionMode, registrationContext} = fields;
  const now = owner.now();
  const measuredRowBytes = measureInitialTransactionRowFields(transactionId,
    sessionId, transactionEpoch, timeoutBudget.deadlineMs, transactionMode,
    now);
  const reservation = reserveCreationRecordEnvelope(owner, measuredRowBytes,
    transactionId, sessionId, transactionMode);
  if (!reservation) {
    throw Object.assign(new Error(
      QUERY_ERROR_MSG.TRANSACTION_CREATION_PRESSURE,
    ), {code: QUERY_ERROR_CODE.TRANSACTION_CREATION_PRESSURE});
  }
  let tx;
  try {
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
    const rowBytes = encodeInitialTransactionRow(initialRow);
    const deliveryKey = buildInitialTransactionDeliveryKey(transactionId,
      rowBytes);
    tx = {
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
      transactionCreationConsumer: null,
      transactionCreationGeneration: owner.transactionCreationGeneration,
      transactionCreationInitialRow: Object.freeze({...initialRow}),
      transactionCreationInitialRowBytes: rowBytes,
      transactionCreationDeliveryKey: deliveryKey,
      transactionCreationAdvancedObserved: false,
      transactionCreationRevision: 0,
      transactionCreationState: TRANSACTION_CREATION_STATE.INSERTING,
    };
    bindCreationRecordEnvelope(reservation, tx);
    if (!bindCreationAttachmentToRecord(owner, operationToken, tx)) {
      throw Object.assign(new Error(QUERY_ERROR_MSG.TRANSACTION_CREATION_UNCERTAIN),
        {code: QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN});
    }
    if (!installCreationTurnBudget(owner, tx, operationToken)) {
      throw Object.assign(new Error(QUERY_ERROR_MSG.TRANSACTION_CREATION_UNCERTAIN),
        {code: QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN});
    }
    const registered = await owner.workflowCoordinator.registerWorkflow(tx);
    registrationContext.tx = registered;
    if (!isCurrentCreation(owner, registered)) {
      throw Object.assign(new Error(QUERY_ERROR_MSG.TRANSACTION_CREATION_UNCERTAIN),
        {code: QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN});
    }
    return registered;
  } catch (error) {
    const retained = reservation.tx || tx;
    registrationContext.tx = retained;
    if (!tx) {
      cancelCreationRecordEnvelope(owner, reservation);
    } else if (owner.workflowCoordinator.getWorkflowById(transactionId) !==
        retained) {
      releaseTransactionCreationRecord(owner, retained);
    }
    throw error;
  }
}

function reconcileClaimedCreation(owner, tx, consumer) {
  if (tx.transactionCreationState !==
      TRANSACTION_CREATION_STATE.SUCCESS_CLAIMED) return null;
  if (creationDeadlinesAreLive(owner, tx,
    tx.transactionCreationAcceptanceToken)) {
    return {handled: true, result: tx.transactionCreationConsumer === consumer ?
      attachDistributedBeginAcceptance(buildTransactionBeginSuccess(tx),
        tx.transactionCreationAcceptanceToken) : creationUncertainResult(tx)};
  }
  tx.transactionCreationAcceptanceToken = null;
  tx.transactionCreationState = tx.transactionCreationAdvancedHandoff === true ?
    TRANSACTION_CREATION_STATE.RECOVERY_PENDING :
    TRANSACTION_CREATION_STATE.UNCERTAIN_ANSWERED;
  return {handled: false};
}

async function reconcileAdvancedCreation(owner, tx, consumer, operationToken) {
  if (tx.transactionCreationState !== TRANSACTION_CREATION_STATE.RECOVERY_PENDING) {
    return null;
  }
  if (tx.transactionCreationAdvancedHandoff !== true) {
    return tx.transactionCreationAdvancedObserved === true ?
      retainAdvancedCreationReadback(owner, tx.transactionId, null,
        operationToken) : null;
  }
  const result = creationRecoveryPendingResult(tx);
  if (consumer !== null && tx.transactionCreationConsumer === consumer &&
      TERMINAL_TRANSACTION_STATUS.has(tx.status)) {
    tx.transactionCreationState = null;
    tx.transactionCreationConsumer = null;
    tx.transactionCreationAcceptanceToken = null;
    if (owner.transactionsBySession.get(tx.sessionId) === tx) {
      owner.transactionsBySession.delete(tx.sessionId);
    }
    releaseTransactionCreationRecord(owner, tx);
  }
  return result;
}

function reconcileInsertedUncertainCreation(owner, tx, consumer,
  operationToken) {
  if (tx.transactionCreationState !==
        TRANSACTION_CREATION_STATE.UNCERTAIN_ANSWERED ||
      tx.transactionRowInserted !== true || consumer === null) return null;
  if (!bindCreationAttachmentToRecord(owner, operationToken, tx)) {
    return creationUncertainResult(tx);
  }
  return buildTransactionCreationResult(owner, tx, consumer, 'RETRY_HANDOFF',
    operationToken);
}

async function reconcileTransactionCreationOwned(owner, tx, consumer,
  operationToken) {
  if (!isCurrentCreation(owner, tx)) return creationUncertainResult(tx);
  const claimed = reconcileClaimedCreation(owner, tx, consumer);
  if (claimed?.handled === true) return claimed.result;
  const advanced = await reconcileAdvancedCreation(owner, tx, consumer,
    operationToken);
  if (advanced) return advanced;
  const inserted = reconcileInsertedUncertainCreation(owner, tx, consumer,
    operationToken);
  if (inserted) return inserted;
  if (consumer === null && tx.transactionCreationConsumer !== null &&
      originalCreationDeadlineIsLive(owner, tx)) {
    return creationUncertainResult(tx);
  }
  if (!installCreationTurnBudget(owner, tx, operationToken)) {
    return creationUncertainResult(tx);
  }
  try {
    await owner.workflowCoordinator.persistWorkflowState(tx.workflowId);
    if (!isCurrentCreation(owner, tx)) return creationUncertainResult(tx);
    return await completeReconciledTransactionCreation(owner, tx, consumer,
      operationToken);
  } catch (error) {
    return await resolveTransactionCreationReconcileError(owner, tx, error,
      operationToken);
  }
}

async function completeReconciledTransactionCreation(owner, tx, consumer,
  operationToken) {
  if (!isCurrentCreation(owner, tx)) {
    return creationUncertainResult(tx);
  }
  if (!originalCreationDeadlineIsLive(owner, tx)) {
    return retainAdvancedCreationReadback(owner, tx.transactionId,
      tx.transactionCreationInitialRow, operationToken);
  }
  if (consumer !== null) {
    if (!bindCreationAttachmentToRecord(owner, operationToken, tx)) {
      return creationUncertainResult(tx);
    }
    return buildTransactionCreationResult(owner, tx, consumer, 'RETRY_HANDOFF',
      operationToken);
  }
  if (operationToken?.callerAttached === true) {
    tx.transactionCreationState = TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY;
    return creationUncertainResult(tx);
  }
  if (tx.transactionCreationConsumer !== null) {
    tx.transactionCreationState = TRANSACTION_CREATION_STATE.UNCERTAIN_ANSWERED;
    return buildTransactionBeginSuccess(tx);
  }
  tx.transactionCreationState = TRANSACTION_CREATION_STATE.ENTERED_ACTIVE;
  tx.recoveryDiscovered = true;
  owner.recoveredTransactionIds.add(tx.workflowId);
  releaseTransactionCreationRecord(owner, tx);
  return creationRecoveryPendingResult(tx);
}

async function resolveTransactionCreationReconcileError(owner, tx, error,
  operationToken) {
  if (error?.code === QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE &&
        error.advancedTransactionRow &&
        owner.retainAdvancedTransactionReadback !== null) {
    return retainAdvancedCreationReadback(owner, tx.workflowId,
      error.advancedTransactionRow, operationToken);
  }
  if (isTransactionIdCollision(error)) {
    owner.workflowCoordinator.removeWorkflow(tx.workflowId);
    releaseTransactionCreationRecord(owner, tx);
  }
  return error?.code === QUERY_ERROR_CODE.TRANSACTION_CREATION_UNCERTAIN ?
    creationUncertainResult(tx, error) : failureResult(error);
}

export {
  acceptDistributedBegin,
  canAcceptDistributedBegin,
  captureTransactionCreationOperation,
  captureTransactionCreationRecoveryOperation,
  creationPressureResult,
  creationUncertainResult,
  directBeginConsumer,
  getTransactionCreationDiagnostics,
  initializeTransactionCreationOwner,
  isPendingTransactionCreation,
  reconcileTransactionCreationOwned,
  recordTransactionCreationSweepDiagnostic,
  registerUniqueTransaction,
  releaseTransactionCreationOperation,
  releaseTransactionCreationRecord,
  releaseTerminalServerTransactionCreation,
  reserveTransactionCreationOperation,
  retireDistributedBeginConsumer,
  retireUncertainCreationsForProcessShutdown,
  transactionCreationAdmission,
  transactionCreationOperationConsumer,
};
