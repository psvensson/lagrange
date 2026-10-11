import {types} from 'node:util';
import {
  COMMIT_MODE,
  PARTICIPANT_SET_STATE,
} from '../../constants/index.js';
import {TRANSACTION_STATUS} from
  './distributed-transaction-coordinator-constants.js';
import {TRANSACTION_CREATION_STATE} from
  './distributed-transaction-creation-contract.js';
import {DISTRIBUTED_BEGIN_CONSUMER_KIND} from './distributed-begin-consumer.js';
import {QUERY_OPERATION} from '../query-constants.js';

const DEFAULT_MAX_PENDING_CREATIONS = 100;
const DEFAULT_MAX_CREATION_BYTES = 1048576;
const DEFAULT_MAX_CREATION_SWEEP = 16;
const DELIVERY_KEY_BYTES = 64;
const CANONICAL_TRANSACTION_ID_BYTES = 32;
const CANONICAL_NUMBER_BYTES = 8;
const CANONICAL_REFERENCE_BYTES = 8;
const OPERATION_NUMBER_FIELD_COUNT = 7;
const OPERATION_REFERENCE_FIELD_COUNT = 3;
const RECORD_SCALAR_FIELD_COUNT = 47;
const RECORD_REFERENCE_FIELD_COUNT = 32;
const DELIVERY_KEY_REFERENCE_COUNT = 4;
const STRICT_CAPTURE_DESCRIPTOR_BOOLEAN_FIELD_COUNT = 3;
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

function checkedMultiply(value, multiplier) {
  if (!Number.isSafeInteger(value) || value < 0 ||
      !Number.isSafeInteger(multiplier) || multiplier < 0) {
    throw new RangeError('Distributed transaction creation accounting overflow');
  }
  let total = 0;
  for (let index = 0; index < multiplier; index += 1) {
    total = checkedAdd(total, value);
  }
  return total;
}

function stringBytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function sumStringReferences(entries) {
  let total = 0;
  for (const [value, copies] of entries) {
    total = checkedAdd(total, checkedMultiply(stringBytes(value), copies));
  }
  return total;
}

function longestStringValue(values) {
  return values.reduce((longest, value) =>
    stringBytes(value) > stringBytes(longest) ? value : longest, '');
}

function strictInitialRowCaptureScratchBytes(transactionId, sessionId,
  transactionMode) {
  const longestField = longestStringValue([
    transactionId,
    sessionId,
    TRANSACTION_STATUS.ACTIVE,
    transactionMode,
    PARTICIPANT_SET_STATE.OPEN,
    '[]',
    COMMIT_MODE.NOT_SELECTED,
  ]);
  return checkedAdd(stringBytes(longestField), checkedMultiply(
    CANONICAL_NUMBER_BYTES,
    STRICT_CAPTURE_DESCRIPTOR_BOOLEAN_FIELD_COUNT,
  ));
}

const MAX_CREATION_STATE = longestStringValue(
  Object.values(TRANSACTION_CREATION_STATE));
const MAX_CONSUMER_KIND = longestStringValue(
  Object.values(DISTRIBUTED_BEGIN_CONSUMER_KIND));

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

function captureCreationResourceOptions(options) {
  return Object.freeze({
    maxUncertainTransactionCreations:
      ownDataValue(options, 'maxUncertainTransactionCreations'),
    maxUncertainTransactionCreationCanonicalBytes:
      ownDataValue(options, 'maxUncertainTransactionCreationCanonicalBytes'),
    maxUncertainCreationSweepPerTurn:
      ownDataValue(options, 'maxUncertainCreationSweepPerTurn'),
  });
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

function operationByteCharge(sessionId, transactionMode) {
  const scalarBytes = checkedAdd(
    checkedMultiply(CANONICAL_NUMBER_BYTES, OPERATION_NUMBER_FIELD_COUNT),
    checkedMultiply(CANONICAL_REFERENCE_BYTES, OPERATION_REFERENCE_FIELD_COUNT));
  const retainedStrings = sumStringReferences([
    [sessionId, 2],
    [transactionMode, 1],
    [MAX_CONSUMER_KIND, 1],
  ]);
  return checkedAdd(scalarBytes,
    checkedAdd(CANONICAL_TRANSACTION_ID_BYTES, retainedStrings));
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
    const record = currentAttachmentRecord(attachment);
    if (record?.transactionCreationConsumer === attachment.consumer) {
      attachment.transferred = true;
    }
    releaseCreationAttachment(owner, attachment);
  }, waitMs);
  attachment.deadlineTimer.unref?.();
}

function reserveCreationOperation(owner, fields) {
  const attachCaller = fields.attachCaller !== false;
  const bytes = operationByteCharge(fields.sessionId,
    fields.transactionMode);
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
    if (boundRecord.transactionCreationState &&
        boundRecord.transactionCreationState !==
          TRANSACTION_CREATION_STATE.ENTERED_ACTIVE) {
      boundRecord.transactionCreationState =
        TRANSACTION_CREATION_STATE.SERVER_RECOVERY_ONLY;
    }
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
  // The envelope covers the largest simultaneously retained representation:
  // the encoded row Buffer, its frozen row, the caller's workflow candidate,
  // DWC's normalized authoritative record (or update candidate), and the
  // prepaid consumer/acceptance disposition. Spreads share JS string values,
  // but each retained property reference is charged as a full canonical copy
  // so admission never depends on VM interning or object-layout behavior.
  // The maximum persistence/readback turn retains raw and normalized records,
  // the frozen/encoded row, original and current budgets, reservation,
  // persistence projection, built gateway row, authoritative readback, and
  // mutation/options roots. The 47 scalars cover 43 numbers plus four boolean
  // state fields; 32 references include DWC indexes, callback stack roots and
  // transition roots.
  // Input strings are charged once for every simultaneous property reference:
  // readback peaks at eight transaction IDs, nine session/owner keys, six row
  // field copies, and four delivery-key references. The strict own-data reader
  // holds one own-property descriptor while assigning that same variable field
  // into the captured row. It processes fields synchronously, so the exact
  // largest initial-row string plus the descriptor's three boolean fields is
  // the maximum capture scratch across first read, collision classification,
  // retry, and recovery. The later claim phase is smaller and its
  // source/kind/reference fields are prepaid here.
  const retainedStrings = sumStringReferences([
    [transactionId, 8],
    [sessionId, 9],
    [TRANSACTION_STATUS.ACTIVE, 6],
    [transactionMode, 6],
    [PARTICIPANT_SET_STATE.OPEN, 6],
    ['[]', 6],
    [COMMIT_MODE.NOT_SELECTED, 6],
    [MAX_CREATION_STATE, 2],
    [MAX_CONSUMER_KIND, 1],
    ['DIRECT_FIRST_RESULT', 1],
    [QUERY_OPERATION.TRANSACTION, 1],
    [QUERY_OPERATION.BEGIN_TRANSACTION, 1],
  ]);
  const scalarBytes = checkedAdd(
    checkedMultiply(CANONICAL_NUMBER_BYTES, RECORD_SCALAR_FIELD_COUNT),
    checkedMultiply(CANONICAL_REFERENCE_BYTES, RECORD_REFERENCE_FIELD_COUNT));
  const deliveryKeyBytes = checkedMultiply(DELIVERY_KEY_BYTES,
    DELIVERY_KEY_REFERENCE_COUNT);
  const captureScratchBytes = strictInitialRowCaptureScratchBytes(transactionId,
    sessionId, transactionMode);
  return checkedAdd(measuredRowBytes, checkedAdd(deliveryKeyBytes, checkedAdd(
    retainedStrings,
    checkedAdd(scalarBytes, captureScratchBytes),
  )));
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
  captureCreationResourceOptions,
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
