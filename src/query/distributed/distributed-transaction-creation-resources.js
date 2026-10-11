import {types} from 'node:util';

const DEFAULT_MAX_PENDING_CREATIONS = 100;
const DEFAULT_MAX_CREATION_BYTES = 1048576;
const DEFAULT_MAX_CREATION_SWEEP = 16;
const OPERATION_ENVELOPE_FIXED_BYTES = 384;
const RECORD_ENVELOPE_FIXED_BYTES = 1024;
const DELIVERY_KEY_BYTES = 64;
const isProxy = types.isProxy.bind(types);

function checkedAdd(left, right) {
  const total = left + right;
  if (!Number.isSafeInteger(left) || left < 0 ||
      !Number.isSafeInteger(right) || right < 0 ||
      !Number.isSafeInteger(total) || total < left) {
    throw new RangeError('Distributed transaction creation accounting overflow');
  }
  return total;
}

function checkedSubtract(left, right) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) ||
      right < 0 || left < right) {
    throw new RangeError('Distributed transaction creation accounting underflow');
  }
  return left - right;
}

function ownDataValue(source, key) {
  if (!source || typeof source !== 'object' || isProxy(source)) {
    throw new TypeError('Invalid distributed transaction creation options');
  }
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) {
    throw new TypeError('Invalid distributed transaction creation options');
  }
  return descriptor.value;
}

function positiveSafeInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) {
    throw new TypeError('Invalid distributed transaction creation resource limit');
  }
  return value;
}

function configuredLimit(options, key, fallback) {
  return positiveSafeInteger(ownDataValue(options, key), fallback);
}

function totalPendingBytes(owner) {
  return checkedAdd(owner.pendingTransactionCreationOperationBytes,
    owner.pendingTransactionCreationRecordBytes);
}

function assertResourceInvariants(owner) {
  const counters = [
    owner.pendingTransactionCreationOperationCount,
    owner.pendingTransactionCreationOperationBytes,
    owner.pendingTransactionCreationAttachmentCount,
    owner.pendingTransactionCreationRecordCount,
    owner.pendingTransactionCreationRecordBytes,
  ];
  if (counters.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      owner.pendingTransactionCreationAttachmentCount >
        owner.pendingTransactionCreationOperationCount ||
      totalPendingBytes(owner) > owner.maxPendingTransactionCreationBytes) {
    throw new Error('Distributed transaction creation resource invariant failed');
  }
}

function initializeCreationResources(owner, options) {
  owner.maxPendingTransactionCreationRecords = configuredLimit(options,
    'maxUncertainTransactionCreations', DEFAULT_MAX_PENDING_CREATIONS);
  owner.maxPendingTransactionCreationBytes = configuredLimit(options,
    'maxUncertainTransactionCreationCanonicalBytes',
    DEFAULT_MAX_CREATION_BYTES);
  owner.maxUncertainCreationSweepPerTurn = configuredLimit(options,
    'maxUncertainCreationSweepPerTurn', DEFAULT_MAX_CREATION_SWEEP);
  owner.transactionCreationTurnBudgetMs = configuredLimit(options,
    'transactionCreationTurnBudgetMs', owner.transactionBudgetMs);
  owner.pendingTransactionCreationOperationCount = 0;
  owner.pendingTransactionCreationOperationBytes = 0;
  owner.pendingTransactionCreationAttachmentCount = 0;
  owner.pendingTransactionCreationRecordCount = 0;
  owner.pendingTransactionCreationRecordBytes = 0;
  owner.transactionCreationInvocationSequence = 0;
  owner.transactionCreationAttachmentsBySession = new Map();
  owner.transactionCreationShutdown = false;
  owner.transactionCreationGeneration = 1;
  owner.transactionCreationSweepCursor = null;
  owner.transactionCreationLastSweepDiagnostic = null;
  assertResourceInvariants(owner);
}

function operationByteCharge(sessionId, expectedTransactionId) {
  return checkedAdd(OPERATION_ENVELOPE_FIXED_BYTES,
    checkedAdd(Buffer.byteLength(sessionId, 'utf8'),
      Buffer.byteLength(expectedTransactionId || '', 'utf8')));
}

function creationOperationHasCapacity(owner, attachCaller, bytes) {
  return !owner.transactionCreationShutdown &&
    owner.pendingTransactionCreationOperationCount <
      owner.maxPendingTransactionCreationRecords &&
    (!attachCaller || owner.pendingTransactionCreationAttachmentCount <
      owner.maxPendingTransactionCreationRecords) &&
    checkedAdd(totalPendingBytes(owner), bytes) <=
      owner.maxPendingTransactionCreationBytes;
}

function createCallerAttachment(consumer, attachCaller) {
  if (!attachCaller) return null;
  return {
    boundRecord: null,
    consumer,
    ownsRecordConsumer: false,
    released: false,
    transferred: false,
  };
}

function installCallerAttachment(owner, token, fields) {
  const attachment = token.attachment;
  if (!attachment) return;
  owner.pendingTransactionCreationAttachmentCount = checkedAdd(
    owner.pendingTransactionCreationAttachmentCount, 1);
  let attachments = owner.transactionCreationAttachmentsBySession.get(
    fields.sessionId);
  if (!attachments) {
    attachments = new Set();
    owner.transactionCreationAttachmentsBySession.set(fields.sessionId,
      attachments);
  }
  attachments.add(attachment);
  const waitMs = fields.turnDeadlineAtMs - fields.turnStartedAtMs;
  attachment.deadlineTimer = setTimeout(() => {
    releaseCreationAttachment(owner, attachment);
  }, waitMs);
  attachment.deadlineTimer.unref?.();
}

function reserveCreationOperation(owner, fields) {
  const attachCaller = fields.attachCaller !== false;
  const bytes = operationByteCharge(fields.sessionId,
    fields.expectedTransactionId);
  if (!creationOperationHasCapacity(owner, attachCaller, bytes)) return null;
  const invocationId = checkedAdd(owner.transactionCreationInvocationSequence, 1);
  const attachment = createCallerAttachment(fields.consumer, attachCaller);
  const token = {
    attachment,
    callerAttached: attachCaller,
    bytes,
    consumerKind: fields.consumer?.kind ?? null,
    expectedTransactionId: fields.expectedTransactionId,
    generation: owner.transactionCreationGeneration,
    invocationId,
    operationReleased: false,
    originalDeadlineAtMs: fields.originalDeadlineAtMs,
    sessionId: fields.sessionId,
    turnStartedAtMs: fields.turnStartedAtMs,
    transactionMode: fields.transactionMode,
    turnDeadlineAtMs: fields.turnDeadlineAtMs,
  };
  if (attachment) attachment.operation = token;
  owner.transactionCreationInvocationSequence = invocationId;
  owner.pendingTransactionCreationOperationCount = checkedAdd(
    owner.pendingTransactionCreationOperationCount, 1);
  owner.pendingTransactionCreationOperationBytes = checkedAdd(
    owner.pendingTransactionCreationOperationBytes, bytes);
  installCallerAttachment(owner, token, fields);
  assertResourceInvariants(owner);
  return token;
}

function currentAttachmentRecord(attachment) {
  return attachment.boundRecord?.transactionCreationReservation?.tx ||
    attachment.boundRecord;
}

function releaseAttachmentConsumer(attachment) {
  const boundRecord = currentAttachmentRecord(attachment);
  if (!attachment.transferred && attachment.ownsRecordConsumer &&
      boundRecord?.transactionCreationConsumer === attachment.consumer) {
    boundRecord.transactionCreationConsumer = null;
  }
}

function removeAttachmentFromOwner(owner, token, attachment) {
  owner.pendingTransactionCreationAttachmentCount = checkedSubtract(
    owner.pendingTransactionCreationAttachmentCount, 1);
  const attachments = owner.transactionCreationAttachmentsBySession.get(
    token?.sessionId);
  attachments?.delete(attachment);
  if (attachments?.size === 0) {
    owner.transactionCreationAttachmentsBySession.delete(token.sessionId);
  }
}

function releaseCreationAttachment(owner, attachment) {
  if (!attachment || attachment.released) return;
  attachment.released = true;
  const token = attachment.operation;
  releaseAttachmentConsumer(attachment);
  if (attachment.deadlineTimer) clearTimeout(attachment.deadlineTimer);
  attachment.deadlineTimer = null;
  attachment.boundRecord = null;
  attachment.consumer = null;
  attachment.operation = null;
  removeAttachmentFromOwner(owner, token, attachment);
  assertResourceInvariants(owner);
}

function bindCreationAttachmentToRecord(owner, token, record) {
  const attachment = token?.attachment;
  if (!attachment || attachment.released || !record) return false;
  if (record.transactionCreationConsumer === null) {
    record.transactionCreationConsumer = attachment.consumer;
    attachment.ownsRecordConsumer = true;
  } else if (record.transactionCreationConsumer !== attachment.consumer) {
    return false;
  }
  attachment.boundRecord = record;
  assertResourceInvariants(owner);
  return true;
}

function transferCreationAttachmentToRecord(owner, token, record) {
  const attachment = token?.attachment;
  const boundRecord = attachment ? currentAttachmentRecord(attachment) : null;
  if (!attachment || attachment.released ||
      boundRecord !== record ||
      record.transactionCreationConsumer !== attachment.consumer) return false;
  attachment.transferred = true;
  releaseCreationAttachment(owner, attachment);
  return true;
}

function releaseCreationOperation(owner, token) {
  if (!token || token.operationReleased) return;
  releaseCreationAttachment(owner, token.attachment);
  token.operationReleased = true;
  owner.pendingTransactionCreationOperationCount = checkedSubtract(
    owner.pendingTransactionCreationOperationCount, 1);
  owner.pendingTransactionCreationOperationBytes = checkedSubtract(
    owner.pendingTransactionCreationOperationBytes, token.bytes);
  token.attachment = null;
  token.expectedTransactionId = null;
  token.sessionId = null;
  token.bytes = 0;
  assertResourceInvariants(owner);
}

function detachCreationAttachments(owner, sessionId) {
  const attachments = owner.transactionCreationAttachmentsBySession.get(sessionId);
  if (!attachments) return;
  for (const attachment of [...attachments]) {
    releaseCreationAttachment(owner, attachment);
  }
}

function recordEnvelopeByteCharge(measuredRowBytes, transactionId, sessionId,
  transactionMode) {
  const variableBytes = checkedAdd(DELIVERY_KEY_BYTES,
    checkedAdd(Buffer.byteLength(transactionId, 'utf8'),
      checkedAdd(Buffer.byteLength(sessionId, 'utf8'),
        Buffer.byteLength(transactionMode, 'utf8'))));
  return checkedAdd(RECORD_ENVELOPE_FIXED_BYTES,
    checkedAdd(measuredRowBytes, variableBytes));
}

function reserveCreationRecordEnvelope(owner, measuredRowBytes, transactionId,
  sessionId, transactionMode) {
  const bytes = recordEnvelopeByteCharge(measuredRowBytes, transactionId,
    sessionId, transactionMode);
  const nextBytes = checkedAdd(totalPendingBytes(owner), bytes);
  if (owner.transactionCreationShutdown ||
      owner.pendingTransactionCreationRecordCount >=
        owner.maxPendingTransactionCreationRecords ||
      nextBytes > owner.maxPendingTransactionCreationBytes) return null;
  const reservation = {bytes, released: false, tx: null};
  owner.pendingTransactionCreationRecordCount = checkedAdd(
    owner.pendingTransactionCreationRecordCount, 1);
  owner.pendingTransactionCreationRecordBytes = checkedAdd(
    owner.pendingTransactionCreationRecordBytes, bytes);
  assertResourceInvariants(owner);
  return reservation;
}

function bindCreationRecordEnvelope(reservation, tx) {
  if (!reservation || reservation.released || reservation.tx !== null) {
    throw new Error('Invalid distributed transaction creation reservation');
  }
  reservation.tx = tx;
  tx.transactionCreationReservation = reservation;
}

function cancelCreationRecordEnvelope(owner, reservation) {
  if (!reservation || reservation.released || reservation.tx !== null) return false;
  reservation.released = true;
  owner.pendingTransactionCreationRecordCount = checkedSubtract(
    owner.pendingTransactionCreationRecordCount, 1);
  owner.pendingTransactionCreationRecordBytes = checkedSubtract(
    owner.pendingTransactionCreationRecordBytes, reservation.bytes);
  reservation.bytes = 0;
  assertResourceInvariants(owner);
  return true;
}

function releaseCreationRecordEnvelope(owner, tx) {
  const reservation = tx?.transactionCreationReservation;
  if (!reservation || reservation.released || reservation.tx !== tx) return false;
  reservation.released = true;
  reservation.tx = null;
  owner.pendingTransactionCreationRecordCount = checkedSubtract(
    owner.pendingTransactionCreationRecordCount, 1);
  owner.pendingTransactionCreationRecordBytes = checkedSubtract(
    owner.pendingTransactionCreationRecordBytes, reservation.bytes);
  reservation.bytes = 0;
  assertResourceInvariants(owner);
  return true;
}

export {
  assertResourceInvariants,
  bindCreationAttachmentToRecord,
  bindCreationRecordEnvelope,
  cancelCreationRecordEnvelope,
  detachCreationAttachments,
  initializeCreationResources,
  ownDataValue,
  releaseCreationAttachment,
  releaseCreationOperation,
  releaseCreationRecordEnvelope,
  reserveCreationOperation,
  reserveCreationRecordEnvelope,
  totalPendingBytes,
  transferCreationAttachmentToRecord,
};
