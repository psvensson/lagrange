/**
 * Canonical producer contract and runtime conformance validator for
 * PartitionLocalServiceStatusRecord.
 *
 * Owned by src/partition/. Defines the single authoritative status shape
 * returned by PartitionService.prototype.getStatus(), rejecting phantom
 * members and fixture drift.
 */

const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;

const NUM_ZERO = 0;
const STATUS_FIELD_COUNT = 15;

const STATUS_FIELD_PARTITION_ID = 'partitionId';
const STATUS_FIELD_TABLE_ID = 'tableId';
const STATUS_FIELD_TABLE_NAME = 'tableName';
const STATUS_FIELD_REPLICA_ID = 'replicaId';
const STATUS_FIELD_NODE_ID = 'nodeId';
const STATUS_FIELD_ROLE = 'role';
const STATUS_FIELD_IS_LEADER = 'isLeader';
const STATUS_FIELD_LEADER_ID = 'leaderId';
const STATUS_FIELD_TERM = 'term';
const STATUS_FIELD_STATE = 'state';
const STATUS_FIELD_KEY_RANGE = 'keyRange';
const STATUS_FIELD_SIZE_BYTES = 'sizeBytes';
const STATUS_FIELD_REPLICA_COUNT = 'replicaCount';
const STATUS_FIELD_CDC_SUBSCRIBERS = 'cdcSubscribers';
const STATUS_FIELD_INITIALIZED = 'initialized';

const TYPE_STRING = 'string';
const TYPE_BOOLEAN = 'boolean';
const TYPE_NUMBER = 'number';
const TYPE_OBJECT = 'object';

const ERROR_PREFIX_RECORD_NOT_OBJECT =
  'PartitionLocalServiceStatusRecord must be a non-null plain object';
const ERROR_PREFIX_UNKNOWN_PROPERTY =
  'PartitionLocalServiceStatusRecord rejects unrecognized phantom property: ';
const ERROR_PREFIX_MISSING_PROPERTY =
  'PartitionLocalServiceStatusRecord missing required property: ';
const ERROR_PREFIX_INVALID_PROPERTY_TYPE =
  'PartitionLocalServiceStatusRecord invalid type for property: ';

/**
 * Exactly 15 canonical status fields.
 */
const PARTITION_LOCAL_SERVICE_STATUS_KEYS = objectFreeze([
  STATUS_FIELD_PARTITION_ID,
  STATUS_FIELD_TABLE_ID,
  STATUS_FIELD_TABLE_NAME,
  STATUS_FIELD_REPLICA_ID,
  STATUS_FIELD_NODE_ID,
  STATUS_FIELD_ROLE,
  STATUS_FIELD_IS_LEADER,
  STATUS_FIELD_LEADER_ID,
  STATUS_FIELD_TERM,
  STATUS_FIELD_STATE,
  STATUS_FIELD_KEY_RANGE,
  STATUS_FIELD_SIZE_BYTES,
  STATUS_FIELD_REPLICA_COUNT,
  STATUS_FIELD_CDC_SUBSCRIBERS,
  STATUS_FIELD_INITIALIZED,
]);

/**
 * @typedef {Object} PartitionLocalServiceStatusRecord
 * @property {string} partitionId
 * @property {string} tableId
 * @property {string} tableName
 * @property {string} replicaId
 * @property {string} nodeId
 * @property {string} role
 * @property {boolean} isLeader
 * @property {string | null} leaderId
 * @property {number} term
 * @property {string} state
 * @property {Record<string, unknown> | null} keyRange
 * @property {number} sizeBytes
 * @property {number} replicaCount
 * @property {number} cdcSubscribers
 * @property {boolean} initialized
 */

function isPlainObject(value) {
  if (value === null || typeof value !== TYPE_OBJECT || Array.isArray(value)) {
    return false;
  }
  const proto = objectGetPrototypeOf(value);
  return proto === objectPrototype || proto === null;
}

function isNonEmptyString(value) {
  return typeof value === TYPE_STRING && value.length > NUM_ZERO;
}

function isNonNegativeInteger(value) {
  return typeof value === TYPE_NUMBER &&
    Number.isInteger(value) &&
    value >= NUM_ZERO;
}

function isNonNegativeNumber(value) {
  return typeof value === TYPE_NUMBER &&
    Number.isFinite(value) &&
    value >= NUM_ZERO;
}

function validateFieldTypesFirstBatch(record) {
  if (!isNonEmptyString(record[STATUS_FIELD_PARTITION_ID])) {
    return STATUS_FIELD_PARTITION_ID;
  }
  if (!isNonEmptyString(record[STATUS_FIELD_TABLE_ID])) {
    return STATUS_FIELD_TABLE_ID;
  }
  if (!isNonEmptyString(record[STATUS_FIELD_TABLE_NAME])) {
    return STATUS_FIELD_TABLE_NAME;
  }
  if (!isNonEmptyString(record[STATUS_FIELD_REPLICA_ID])) {
    return STATUS_FIELD_REPLICA_ID;
  }
  if (!isNonEmptyString(record[STATUS_FIELD_NODE_ID])) {
    return STATUS_FIELD_NODE_ID;
  }
  if (!isNonEmptyString(record[STATUS_FIELD_ROLE])) {
    return STATUS_FIELD_ROLE;
  }
  if (typeof record[STATUS_FIELD_IS_LEADER] !== TYPE_BOOLEAN) {
    return STATUS_FIELD_IS_LEADER;
  }
  return null;
}

function validateFieldTypesSecondBatch(record) {
  const leaderId = record[STATUS_FIELD_LEADER_ID];
  if (leaderId !== null && !isNonEmptyString(leaderId)) {
    return STATUS_FIELD_LEADER_ID;
  }
  if (!isNonNegativeInteger(record[STATUS_FIELD_TERM])) {
    return STATUS_FIELD_TERM;
  }
  if (!isNonEmptyString(record[STATUS_FIELD_STATE])) {
    return STATUS_FIELD_STATE;
  }
  const keyRange = record[STATUS_FIELD_KEY_RANGE];
  if (keyRange !== null && (typeof keyRange !== TYPE_OBJECT || Array.isArray(keyRange))) {
    return STATUS_FIELD_KEY_RANGE;
  }
  if (!isNonNegativeNumber(record[STATUS_FIELD_SIZE_BYTES])) {
    return STATUS_FIELD_SIZE_BYTES;
  }
  if (!isNonNegativeInteger(record[STATUS_FIELD_REPLICA_COUNT])) {
    return STATUS_FIELD_REPLICA_COUNT;
  }
  if (!isNonNegativeInteger(record[STATUS_FIELD_CDC_SUBSCRIBERS])) {
    return STATUS_FIELD_CDC_SUBSCRIBERS;
  }
  if (typeof record[STATUS_FIELD_INITIALIZED] !== TYPE_BOOLEAN) {
    return STATUS_FIELD_INITIALIZED;
  }
  return null;
}

/**
 * Validate that a record conforms strictly to PartitionLocalServiceStatusRecord.
 * Throws TypeError if invalid or if any phantom member is present.
 *
 * @param {unknown} value
 * @return {PartitionLocalServiceStatusRecord}
 */
function assertPartitionLocalServiceStatusConformance(value) {
  if (!isPlainObject(value)) {
    throw new TypeError(ERROR_PREFIX_RECORD_NOT_OBJECT);
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const keys = objectKeys(record);
  for (let i = NUM_ZERO; i < keys.length; i += 1) {
    const key = keys[i];
    if (!PARTITION_LOCAL_SERVICE_STATUS_KEYS.includes(key)) {
      throw new TypeError(`${ERROR_PREFIX_UNKNOWN_PROPERTY}${key}`);
    }
  }
  for (let i = NUM_ZERO; i < PARTITION_LOCAL_SERVICE_STATUS_KEYS.length; i += 1) {
    const expectedKey = PARTITION_LOCAL_SERVICE_STATUS_KEYS[i];
    if (!objectHasOwn(record, expectedKey)) {
      throw new TypeError(`${ERROR_PREFIX_MISSING_PROPERTY}${expectedKey}`);
    }
  }
  const invalidFieldBatch1 = validateFieldTypesFirstBatch(record);
  if (invalidFieldBatch1 !== null) {
    throw new TypeError(`${ERROR_PREFIX_INVALID_PROPERTY_TYPE}${invalidFieldBatch1}`);
  }
  const invalidFieldBatch2 = validateFieldTypesSecondBatch(record);
  if (invalidFieldBatch2 !== null) {
    throw new TypeError(`${ERROR_PREFIX_INVALID_PROPERTY_TYPE}${invalidFieldBatch2}`);
  }
  return /** @type {PartitionLocalServiceStatusRecord} */ (value);
}

/**
 * Type predicate for PartitionLocalServiceStatusRecord.
 *
 * @param {unknown} value
 * @return {value is PartitionLocalServiceStatusRecord}
 */
function isPartitionLocalServiceStatusRecord(value) {
  if (!isPlainObject(value)) {
    return false;
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const keys = objectKeys(record);
  if (keys.length !== STATUS_FIELD_COUNT) {
    return false;
  }
  for (let i = NUM_ZERO; i < keys.length; i += 1) {
    if (!PARTITION_LOCAL_SERVICE_STATUS_KEYS.includes(keys[i])) {
      return false;
    }
  }
  return validateFieldTypesFirstBatch(record) === null &&
    validateFieldTypesSecondBatch(record) === null;
}

/**
 * Factory for PartitionLocalServiceStatusRecord. Validates conformance before returning.
 *
 * @param {PartitionLocalServiceStatusRecord} fields
 * @return {PartitionLocalServiceStatusRecord}
 */
function createPartitionLocalServiceStatusRecord(fields) {
  assertPartitionLocalServiceStatusConformance(fields);
  return objectFreeze({...fields});
}

export {
  PARTITION_LOCAL_SERVICE_STATUS_KEYS,
  assertPartitionLocalServiceStatusConformance,
  createPartitionLocalServiceStatusRecord,
  isPartitionLocalServiceStatusRecord,
};
