/**
 * Pinned Raft command builder and verifier for authoritative locking-read
 * reservation replication and release across partition replicas.
 *
 * @module partition/partition-locking-read-command
 */

import {createHash, randomUUID} from 'node:crypto';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {
  LOCKING_READ_PARTITION_OP,
  LOCKING_READ_RESERVATION_TYPE,
} from './partition-locking-read-command-constants.js';

const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const ENTRY_ID_PREFIX = 'lock-res:';

const COMMAND_FIELDS = Object.freeze([
  'type',
  'entryId',
  'partitionId',
  'op',
  'reservation',
  'reservationText',
  'commandDigest',
  'timestamp',
  'proposedBy',
  'proposedAt',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isValidOp(op) {
  return op === LOCKING_READ_PARTITION_OP.ACQUIRE ||
    op === LOCKING_READ_PARTITION_OP.RELEASE_TRANSACTION ||
    op === LOCKING_READ_PARTITION_OP.RELEASE_SESSION;
}

function hasValidAcquireInputs(input) {
  return isNonEmptyString(input.tableName) &&
    isNonEmptyString(input.transactionId) &&
    Array.isArray(input.pkValues) &&
    input.pkValues.length > 0;
}

function resolveOptionalPositiveNumber(value) {
  return typeof value === 'number' && value > 0 ? value : null;
}

function resolveOptionalNonNegativeInt(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeAcquirePayload(input) {
  if (!hasValidAcquireInputs(input)) {
    return null;
  }
  const participantId = isNonEmptyString(input.participantId) ?
    input.participantId :
    `${input.transactionId}:${input.partitionId}`;
  return Object.freeze({
    op: LOCKING_READ_PARTITION_OP.ACQUIRE,
    partitionId: input.partitionId,
    tableName: input.tableName,
    pkValues: [...input.pkValues],
    rowKey: isNonEmptyString(input.rowKey) ? input.rowKey : null,
    transactionId: input.transactionId,
    sessionId: isNonEmptyString(input.sessionId) ? input.sessionId : null,
    participantId,
    epoch: Number.isSafeInteger(input.epoch) ? input.epoch : 0,
    holdTimeoutMs: resolveOptionalPositiveNumber(input.holdTimeoutMs),
    readGeneration: resolveOptionalNonNegativeInt(input.readGeneration),
  });
}

function normalizeReleasePayload(input) {
  const isTx = input.op === LOCKING_READ_PARTITION_OP.RELEASE_TRANSACTION;
  const key = isTx ? input.transactionId : input.sessionId;
  if (!isNonEmptyString(key)) {
    return null;
  }
  return Object.freeze({
    op: input.op,
    partitionId: input.partitionId,
    transactionId: isTx ? key : null,
    sessionId: isTx ? null : key,
  });
}

function normalizeReservationPayload(input) {
  if (!input || typeof input !== 'object' ||
      !isNonEmptyString(input.partitionId) ||
      !isValidOp(input.op)) {
    return null;
  }
  return input.op === LOCKING_READ_PARTITION_OP.ACQUIRE ?
    normalizeAcquirePayload(input) :
    normalizeReleasePayload(input);
}

function computeReservationDigest(reservationText) {
  return createHash(DIGEST_ALGORITHM)
    .update(reservationText)
    .digest(DIGEST_ENCODING);
}

function hasRequiredCommandHeader(command) {
  if (!command ||
      Object.keys(command).length !== COMMAND_FIELDS.length ||
      !COMMAND_FIELDS.every((field) => Object.hasOwn(command, field))) {
    return false;
  }
  return command.type === LOCKING_READ_RESERVATION_TYPE &&
    isNonEmptyString(command.entryId) &&
    isNonEmptyString(command.partitionId) &&
    isValidOp(command.op) &&
    typeof command.timestamp === 'string' &&
    typeof command.proposedBy === 'string' &&
    Number.isFinite(command.proposedAt);
}

/**
 * Build a pinned LOCKING_READ_RESERVATION Raft command from a normalized input.
 *
 * @param {Object} service - PartitionService instance.
 * @param {Object} input - Request payload.
 * @return {Object|null} Frozen Raft command or null if malformed.
 */
export function buildLockingReadCommand(service, input) {
  const reservation = normalizeReservationPayload({
    ...input,
    partitionId: service?.partitionId,
  });
  if (reservation === null) {
    return null;
  }
  const reservationText = JSON.stringify(reservation);
  const commandDigest = computeReservationDigest(reservationText);
  const entryId = isNonEmptyString(input?.entryId) ?
    input.entryId :
    `${ENTRY_ID_PREFIX}${randomUUID()}`;
  return Object.freeze({
    type: LOCKING_READ_RESERVATION_TYPE,
    entryId,
    partitionId: service.partitionId,
    op: reservation.op,
    reservation,
    reservationText,
    commandDigest,
    timestamp: service.hlcClock.now().toString(),
    proposedBy: service.replicaId,
    proposedAt: service.timeSource.now(),
  });
}

/**
 * Verify that an inbound Raft command matches the pinned LOCKING_READ_RESERVATION byte contract.
 *
 * @param {*} input - Candidate command.
 * @return {boolean}
 */
export function isPinnedLockingReadCommand(input) {
  const command = copyStrictOwnDataRecord(input);
  if (!hasRequiredCommandHeader(command)) {
    return false;
  }
  const normalized = normalizeReservationPayload(command.reservation);
  if (normalized === null ||
      normalized.partitionId !== command.partitionId ||
      normalized.op !== command.op) {
    return false;
  }
  const expectedText = JSON.stringify(normalized);
  const expectedDigest = computeReservationDigest(expectedText);
  return command.reservationText === expectedText &&
    command.commandDigest === expectedDigest;
}
