import {createHash} from 'node:crypto';
import {
  COMMIT_MODE,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
  isCanonicalTransactionEpoch,
} from '../../constants/index.js';
import {TRANSACTION_STATUS} from
  './distributed-transaction-coordinator-constants.js';

const CREATION_ROW_PREFIX = 'sql-transactions-begin-row-v1\0';
const CREATION_KEY_PREFIX = 'sql-transactions-begin-key-v1\0';
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{32}$/u;

const TRANSACTION_CREATION_STATE = Object.freeze({
  ENTERED_ACTIVE: 'ENTERED_ACTIVE',
  EXPIRED_OR_ENDED: 'EXPIRED_OR_ENDED',
  INSERTING: 'INSERTING',
  INSERT_OUTCOME_UNCERTAIN: 'INSERT_OUTCOME_UNCERTAIN',
  RECOVERY_PENDING: 'RECOVERY_PENDING',
  SERVER_RECOVERY_ONLY: 'SERVER_RECOVERY_ONLY',
  SUCCESS_CLAIMED: 'SUCCESS_CLAIMED',
  UNCERTAIN_ANSWERED: 'UNCERTAIN_ANSWERED',
  WAITING: 'WAITING',
});

const TRANSACTION_CREATION_READ_STATE = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  INVALID: 'INVALID',
  MISSING: 'MISSING',
  UNAVAILABLE: 'UNAVAILABLE',
});

const INITIAL_ROW_FIELDS = Object.freeze([
  'transaction_id',
  'session_id',
  'status',
  'transaction_epoch',
  'timeout_deadline',
  'transaction_mode',
  'participant_set_state',
  'participant_set_text',
  'commit_mode',
  'frozen_participant_count',
  'updated_at',
  'decision',
  'decision_text',
  'decision_digest',
  'created_at',
]);

const IMMUTABLE_ROW_FIELDS = Object.freeze([
  'transaction_id',
  'session_id',
  'transaction_epoch',
  'timeout_deadline',
  'transaction_mode',
  'created_at',
]);

function isCanonicalSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

function isCanonicalTransactionMode(value) {
  return value === TRANSACTION_MODE.AUTOCOMMIT ||
    value === TRANSACTION_MODE.EXPLICIT;
}

function hasCanonicalInitialCreationIdentity(row) {
  return typeof row.transaction_id === 'string' &&
    TRANSACTION_ID_PATTERN.test(row.transaction_id) &&
    typeof row.session_id === 'string' && row.session_id.length > 0 &&
    isCanonicalTransactionEpoch(row.transaction_epoch) &&
    isCanonicalSafeInteger(row.timeout_deadline) &&
    isCanonicalTransactionMode(row.transaction_mode) &&
    isCanonicalSafeInteger(row.created_at);
}

function hasCanonicalInitialCreationState(row) {
  return isCanonicalSafeInteger(row.updated_at) &&
    row.updated_at === row.created_at &&
    row.timeout_deadline >= row.created_at &&
    row.status === TRANSACTION_STATUS.ACTIVE &&
    row.participant_set_state === PARTICIPANT_SET_STATE.OPEN &&
    row.participant_set_text === '[]' &&
    row.commit_mode === COMMIT_MODE.NOT_SELECTED &&
    row.frozen_participant_count === 0 &&
    row.decision === null && row.decision_text === null &&
    row.decision_digest === null;
}

function isCanonicalInitialRow(row) {
  return row && typeof row === 'object' &&
    INITIAL_ROW_FIELDS.every((field) => Object.hasOwn(row, field)) &&
    hasCanonicalInitialCreationIdentity(row) &&
    hasCanonicalInitialCreationState(row);
}

function encodeValue(value) {
  if (value === null) return Buffer.from('n;');
  if (typeof value === 'number' && isCanonicalSafeInteger(value)) {
    return Buffer.from(`i${value};`);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([Buffer.from(`s${bytes.length}:`), bytes]);
  }
  throw new TypeError('Noncanonical distributed transaction creation field');
}

function encodeInitialTransactionRow(row) {
  if (!isCanonicalInitialRow(row)) {
    throw new TypeError('Invalid initial distributed transaction row');
  }
  return Buffer.concat([
    Buffer.from(CREATION_ROW_PREFIX),
    ...INITIAL_ROW_FIELDS.map((field) => encodeValue(row[field])),
  ]);
}

function buildInitialTransactionDeliveryKey(transactionId, rowBytes) {
  if (typeof transactionId !== 'string' ||
      !TRANSACTION_ID_PATTERN.test(transactionId) ||
      !Buffer.isBuffer(rowBytes)) {
    throw new TypeError('Invalid distributed transaction creation key input');
  }
  const hash = createHash('sha256');
  hash.update(CREATION_KEY_PREFIX);
  hash.update(encodeValue(transactionId));
  hash.update(`b${rowBytes.length}:`);
  hash.update(rowBytes);
  return hash.digest('hex');
}

function hasCanonicalImmutableCreationFields(row, expectedTransactionId) {
  return row && typeof row === 'object' &&
    IMMUTABLE_ROW_FIELDS.every((field) => Object.hasOwn(row, field)) &&
    row.transaction_id === expectedTransactionId &&
    typeof row.session_id === 'string' && row.session_id.length > 0 &&
    isCanonicalTransactionEpoch(row.transaction_epoch) &&
    isCanonicalSafeInteger(row.timeout_deadline) &&
    isCanonicalTransactionMode(row.transaction_mode) &&
    isCanonicalSafeInteger(row.created_at) &&
    row.timeout_deadline >= row.created_at;
}

function sameImmutableCreation(left, right) {
  return IMMUTABLE_ROW_FIELDS.every((field) =>
    Object.hasOwn(left, field) && Object.hasOwn(right, field) &&
    Object.is(left[field], right[field]));
}

export {
  IMMUTABLE_ROW_FIELDS,
  INITIAL_ROW_FIELDS,
  TRANSACTION_CREATION_READ_STATE,
  TRANSACTION_CREATION_STATE,
  buildInitialTransactionDeliveryKey,
  encodeInitialTransactionRow,
  hasCanonicalImmutableCreationFields,
  isCanonicalInitialRow,
  sameImmutableCreation,
};
