// The durable CDC obligation ledger (TX1 design revision 10, section 8.3): the
// one owner of the `_cdc_obligations` rows a partition holds -
// one per CDC event a committed participant decision owes - and of the pinned
// byte form of the CDC_DELIVERED command that marks them delivered. Every
// write here runs inside the application transaction of a committed command
// (the committed-entry application's callback,
// raft-rs-application-transaction-owner.js): the obligation rows commit with
// the data change they describe, the delivered flag with the committed
// acknowledgement, or not at all. Pure functions of a connection and of their
// inputs, identical on every replica; the CDC delivery owner reads owed rows
// here (partition-cdc-obligation-delivery.js) and the committed-entry CDC hook
// writes them (partition-cdc-obligation.js).

import {createHash} from 'node:crypto';
import {
  PARTITION_CDC_COMMAND as COMMAND,
  PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_OBLIGATION_BYTES as BYTES,
  PARTITION_CDC_OBLIGATION_MESSAGE as MESSAGE,
  PARTITION_CDC_OBLIGATION_SQL as SQL,
  PARTITION_CDC_OBLIGATION_TABLE as TABLE,
} from './partition-cdc-obligation-constants.js';
import {RETAINED_STORE_ERROR, retainedStoreError, retainedStoreTableExistsIn, readRetainedStoreRowsIn,
  isStoredInteger, isStoredNullableInteger} from './partition-retained-store-observation.js';

const ONE_ROW = 1;
const FIRST_POSITION = Object.freeze({logIndex: 0, ordinal: -1});
const DELIVERED_FLAG = Object.freeze({OWED: 0, DELIVERED: 1});
const JSON_ARRAY_BRACKETS = 2;
const JSON_SEPARATOR_LENGTH = 1;
const SHA256_HEX_LENGTH = 64;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Create the ledger (DDL; idempotent over an existing image). Run inside the
 * application transaction before the first obligation of a connection is
 * recorded, so every replica creates it at the same committed entry.
 * @param {Object} db - The partition's connection.
 */
function ensureCdcObligationLedger(db) {
  db.exec(SQL.CREATE_TABLE);
  db.exec(SQL.CREATE_OWED_INDEX);
}

/**
 * Whether the ledger exists on this connection: a partition that never
 * committed a participant decision has none, and owes nothing.
 * @param {Object} db - The partition's connection.
 * @return {boolean} Whether the table exists.
 */
function cdcObligationLedgerExists(db) {
  return db.prepare(SQL.TABLE_EXISTS).get() !== undefined;
}

function validCdcCensusRow(row) {
  return isNonEmptyString(row.event_key) && isNonEmptyString(row.entry_id) &&
    isNonEmptyString(row.event_json) && isStoredInteger(row.log_index, 1n) &&
    isStoredInteger(row.term, 1n) && isStoredInteger(row.ordinal, 0n) &&
    (row.delivered === 0n || row.delivered === 1n) &&
    isStoredNullableInteger(row.delivered_index, 1n) &&
    isStoredNullableInteger(row.delivered_term, 1n);
}

// Observe lazy existence and ALL debt, including delivered rows. No DDL and
// no coercion of a malformed flag to false or an exact index to Number.
function readCdcObligationCensusIn(db) {
  const exists = retainedStoreTableExistsIn(db, TABLE);
  const raw = exists ? readRetainedStoreRowsIn(db, {table: TABLE,
    select: SQL.SELECT_ALL, create: SQL.CREATE_TABLE, indexes: [SQL.CREATE_OWED_INDEX]}) : [];
  for (const row of raw) {
    if (!validCdcCensusRow(row)) {
      throw retainedStoreError(RETAINED_STORE_ERROR.ROW_CONTRARY, TABLE);
    }
  }
  const rows = raw.map((row) =>
    Object.freeze({eventKey: row.event_key, logIndex: String(row.log_index),
      term: String(row.term), ordinal: String(row.ordinal), entryId: row.entry_id,
      eventJson: row.event_json, delivered: String(row.delivered),
      deliveredIndex: row.delivered_index === null ? null : String(row.delivered_index),
      deliveredTerm: row.delivered_term === null ? null : String(row.delivered_term)}));
  return Object.freeze({exists, rows: Object.freeze(rows)});
}

/**
 * Record one owed event, inside the application transaction of the committed
 * entry that owes it. A second row for the same event key is a bug and throws
 * (the application fails closed).
 * @param {Object} db - The partition's connection.
 * @param {Object} row - {eventKey, logIndex, term, ordinal, entryId,
 *   eventJson}.
 */
function insertCdcObligation(db, row) {
  db.prepare(SQL.INSERT).run({
    eventKey: row.eventKey,
    logIndex: row.logIndex,
    term: row.term,
    ordinal: row.ordinal,
    entryId: row.entryId,
    eventJson: row.eventJson,
  });
}

function obligationOf(row) {
  return Object.freeze({
    eventKey: row.event_key,
    logIndex: Number(row.log_index),
    term: Number(row.term),
    ordinal: Number(row.ordinal),
    entryId: row.entry_id,
    eventJson: row.event_json,
  });
}

/**
 * The owed obligations after a position, in log order (the order they are
 * delivered and redelivered in). An absent ledger owes nothing.
 * @param {Object} db - The partition's connection.
 * @param {Object} [options] - {after: {logIndex, ordinal}, limit}.
 * @return {Array<Object>} Frozen {eventKey, logIndex, term, ordinal, entryId,
 *   eventJson}, at most `limit`.
 */
function readOwedCdcObligations(db, options = {}) {
  if (!cdcObligationLedgerExists(db)) {
    return [];
  }
  const after = options.after ?? FIRST_POSITION;
  const through = options.through ??
    {logIndex: Number.MAX_SAFE_INTEGER, ordinal: Number.MAX_SAFE_INTEGER};
  return db.prepare(SQL.SELECT_OWED_AFTER).all({
    logIndex: after.logIndex,
    ordinal: after.ordinal,
    throughIndex: through.logIndex,
    throughOrdinal: through.ordinal,
    limit: options.limit ?? BOUND.DRIVE_PAGE_ROWS,
  }).map(obligationOf);
}

// A finite scan pass ends at this position even while new obligations arrive.
// It is a scheduling bound, never evidence that any prefix was delivered.
function readOwedCdcTail(db) {
  if (!cdcObligationLedgerExists(db)) return null;
  const row = db.prepare(SQL.SELECT_OWED_TAIL).get();
  return row ? {logIndex: Number(row.log_index), ordinal: Number(row.ordinal)} : null;
}

/**
 * One obligation by its event key, or null.
 * @param {Object} db - The partition's connection.
 * @param {string} eventKey - The event's key.
 * @return {Object|null} The frozen row with its delivered flag, or null.
 */
function readCdcObligation(db, eventKey) {
  if (!cdcObligationLedgerExists(db)) {
    return null;
  }
  const row = db.prepare(SQL.SELECT_BY_KEY).get(eventKey);
  if (row === undefined) {
    return null;
  }
  return Object.freeze({
    ...obligationOf(row),
    delivered: Number(row.delivered) === DELIVERED_FLAG.DELIVERED,
    deliveredIndex: row.delivered_index,
    deliveredTerm: row.delivered_term,
  });
}

function readCdcObligationsAtPosition(db, logIndex, ordinal) {
  if (!cdcObligationLedgerExists(db)) return [];
  return db.prepare(SQL.SELECT_BY_POSITION).all(logIndex, ordinal).map((row) =>
    Object.freeze({...obligationOf(row),
      delivered: Number(row.delivered) === DELIVERED_FLAG.DELIVERED,
      deliveredIndex: row.delivered_index,
      deliveredTerm: row.delivered_term}));
}

/**
 * Mark one owed obligation delivered at the acknowledging entry's position,
 * inside that entry's application transaction; exactly one row moves, or this
 * throws (the application fails closed).
 * @param {Object} db - The partition's connection.
 * @param {string} eventKey - The event's key.
 * @param {{index: number, term: number}} position - The CDC_DELIVERED entry.
 */
function markCdcObligationDelivered(db, eventKey, {index, term}) {
  const moved = db.prepare(SQL.MARK_DELIVERED).run({eventKey, index, term});
  if (moved.changes !== ONE_ROW) {
    throw new Error(
      `${MESSAGE.MARK_NOT_ONE_ROW}${MESSAGE.CODE_SEPARATOR}${eventKey}`);
  }
}

/**
 * How many obligations the ledger holds, owed and delivered.
 * @param {Object} db - The partition's connection.
 * @return {{owed: number, delivered: number}} The counts (zero without a
 *   ledger).
 */
function countCdcObligations(db) {
  const counts = {owed: 0, delivered: 0};
  if (!cdcObligationLedgerExists(db)) {
    return counts;
  }
  for (const row of db.prepare(SQL.COUNT_BY_FLAG).all()) {
    if (Number(row.delivered) === DELIVERED_FLAG.DELIVERED) {
      counts.delivered = Number(row.count);
    } else {
      counts.owed = Number(row.count);
    }
  }
  return counts;
}

// --- the pinned bytes of CDC_DELIVERED ---

function sha256Hex(text) {
  return createHash(BYTES.DIGEST_ALGORITHM).update(text)
    .digest(BYTES.DIGEST_ENCODING);
}

/**
 * The canonical JSON of acknowledged groups: groups sorted by log index,
 * each group's positional members in the order given (the delivery owner adds them in
 * ordinal order).
 * @param {Array<{logIndex: number, events: Array<Object>}>} groups - The groups.
 * @return {string} Their JSON.
 */
function acknowledgedGroupsJsonOf(groups) {
  return JSON.stringify(groups.map((group) => ({
    logIndex: group.logIndex,
    events: group.events.map((event) => ({
      ordinal: event.ordinal,
      eventKeyDigest: event.eventKeyDigest,
    })),
  })));
}

/**
 * The byte length the batch bound measures: the JSON of the acknowledged
 * groups. The delivery owner keeps this running total as it batches.
 * @param {Array<Object>} groups - The groups.
 * @return {number} The JSON length.
 */
function acknowledgedBytesOf(groups) {
  return Buffer.byteLength(acknowledgedGroupsJsonOf(groups));
}

/**
 * The bytes one more positional member adds to a batch's JSON and a
 * separator, plus a new group's wrapper when it opens one.
 * @param {string} eventKey - The durable key to bind by digest.
 * @param {number} logIndex - Its entry.
 * @param {number} ordinal - Its position in the entry.
 * @param {boolean} opensGroup - Whether the batch holds no group for it yet.
 * @return {number} The added length.
 */
function acknowledgedEventBytesOf(eventKey, logIndex, ordinal, opensGroup) {
  const event = {ordinal, eventKeyDigest: cdcObligationEventKeyDigest(eventKey)};
  if (opensGroup) {
    return Buffer.byteLength(JSON.stringify({logIndex, events: [event]})) +
      JSON_SEPARATOR_LENGTH;
  }
  return Buffer.byteLength(JSON.stringify(event)) + JSON_SEPARATOR_LENGTH;
}

function cdcObligationEventKeyDigest(eventKey) {
  return sha256Hex(eventKey);
}

/**
 * The deterministic entryId of a CDC_DELIVERED command:
 * cdc-ack:<partitionId>:<sha256 of its groups' JSON>.
 * @param {string} partitionId - The partition.
 * @param {Array<Object>} groups - The acknowledged groups.
 * @return {string} The entryId.
 */
function acknowledgementEntryIdOf(partitionId, groups) {
  return [BYTES.ENTRY_PREFIX, partitionId,
    sha256Hex(acknowledgedGroupsJsonOf(groups))]
    .join(BYTES.IDENTITY_SEPARATOR);
}

/**
 * The CDC_DELIVERED command the delivery owner proposes.
 * @param {string} partitionId - The partition.
 * @param {Array<{logIndex: number, events: Array<Object>}>} groups - The
 *   acknowledged events, grouped by the committed entry that owes them.
 * @param {{timestamp: string, proposedBy: string, proposedAt: number}} stamp -
 *   The proposal stamp.
 * @return {Object} The command.
 */
function buildCdcAcknowledgementCommand(partitionId, groups, stamp) {
  const acknowledged = groups.map((group) => ({
    logIndex: group.logIndex,
    events: group.events.map((event) => ({...event})),
  }));
  return {
    type: COMMAND.DELIVERED,
    entryId: acknowledgementEntryIdOf(partitionId, acknowledged),
    partitionId,
    acknowledged,
    ...stamp,
  };
}

function isSortedStrictly(values) {
  return values.every((value, index) => index === 0 || values[index - 1] < value);
}

function isLowerHexDigest(value) {
  return typeof value === 'string' && value.length === SHA256_HEX_LENGTH &&
    /^[0-9a-f]+$/.test(value);
}

function isGroup(group) {
  return group !== null && typeof group === 'object' &&
    Number.isSafeInteger(group.logIndex) && group.logIndex > 0 &&
    Array.isArray(group.events) && group.events.length > 0 &&
    group.events.every((event) => event !== null && typeof event === 'object' &&
      Object.keys(event).length === 2 &&
      Number.isSafeInteger(event.ordinal) && event.ordinal >= 0 &&
      isLowerHexDigest(event.eventKeyDigest)) &&
    isSortedStrictly(group.events.map((event) => event.ordinal));
}

/**
 * The acknowledged groups a command carries when they are in the pinned
 * form: a non-empty array of groups with ascending log indices, each a
 * non-empty array of strictly ordered positional members, within both batch bounds. Null
 * otherwise.
 * @param {Object} command - A CDC_DELIVERED command.
 * @return {Array<Object>|null} The groups.
 */
function acknowledgedGroupsOf(command) {
  const groups = command?.acknowledged;
  if (!Array.isArray(groups) || groups.length === 0 || !groups.every(isGroup) ||
      !isSortedStrictly(groups.map((group) => group.logIndex))) {
    return null;
  }
  const events = groups.reduce((sum, group) => sum + group.events.length, 0);
  if (events > BOUND.ACK_BATCH_MAX_EVENTS ||
      acknowledgedBytesOf(groups) > BOUND.ACK_BATCH_MAX_BYTES) {
    return null;
  }
  return groups;
}

/**
 * Whether a CDC_DELIVERED command is in the pinned form the delivery owner
 * builds (the admission owner asks before it is proposed): its partition, its
 * groups, and the deterministic entryId of those groups.
 * @param {Object} command - The command.
 * @return {boolean} Whether its bytes are pinned.
 */
function isPinnedCdcAcknowledgementCommand(command) {
  if (command?.type !== COMMAND.DELIVERED ||
      !isNonEmptyString(command.partitionId)) {
    return false;
  }
  const groups = acknowledgedGroupsOf(command);
  return groups !== null &&
    command.entryId === acknowledgementEntryIdOf(command.partitionId, groups);
}

/**
 * The empty batch's JSON length (the brackets), the base the delivery owner
 * counts its running total from.
 * @return {number} The length of `[]`.
 */
function emptyAcknowledgedBytes() {
  return JSON_ARRAY_BRACKETS;
}

export {
  DELIVERED_FLAG as PARTITION_CDC_DELIVERY_FLAG,
  acknowledgedBytesOf,
  acknowledgedGroupsOf,
  acknowledgedEventBytesOf,
  acknowledgementEntryIdOf,
  buildCdcAcknowledgementCommand,
  cdcObligationEventKeyDigest,
  cdcObligationLedgerExists,
  countCdcObligations,
  emptyAcknowledgedBytes,
  ensureCdcObligationLedger,
  insertCdcObligation,
  isPinnedCdcAcknowledgementCommand,
  markCdcObligationDelivered,
  readCdcObligation,
  readCdcObligationCensusIn,
  readCdcObligationsAtPosition,
  readOwedCdcObligations,
  readOwedCdcTail,
};
