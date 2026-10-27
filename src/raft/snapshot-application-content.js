// Application and durable partition table policy for raft-rs replica-image
// checkpoints (SN1 / F5). Separates partition state-machine payloads (which
// preserve user tables and canonical partition metadata tables while scrubbing
// replica-local `_raft_*` tables) from message-group fresh-learner payloads
// (which carry only `raft_rs_peer_identity`), and enforces the
// `PREPARED_TRANSACTIONS_PENDING` gate and HLC non-regression across compaction.

import {ENTITY_TYPE} from '../constants/addresses.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';

const NO_COMMITTED_HLC = '0';
const RAFT_RS_PEER_TABLE = 'raft_rs_peer_identity';
const RAFT_INTERNAL_TABLE_PREFIX = '_raft_';
const PARTICIPANT_TRANSACTIONS_TABLE = '_participant_transactions';
const PREPARED_PARTICIPANT_STATE = 'PREPARED';
const IDENTIFIER_QUOTE = '"';
const IDENTIFIER_ESCAPED_QUOTE = '""';
const SQLITE_DELETE_JOURNAL_MODE = 'journal_mode = DELETE';
const VACUUM_SQL = 'VACUUM';
const SELECT_TABLE_PRESENT_SQL =
  'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?';
const SELECT_PREPARED_PARTICIPANT_SQL =
  `SELECT 1 FROM ${PARTICIPANT_TRANSACTIONS_TABLE} ` +
  'WHERE state = ? LIMIT 1';
const SELECT_RAFT_LOCAL_TABLES_SQL =
  'SELECT name FROM sqlite_master WHERE type = \'table\' AND name LIKE \'_raft_%\'';
const SELECT_USER_TABLES_SQL =
  'SELECT name FROM sqlite_master WHERE type = \'table\'';

function quotedIdentifier(identifier) {
  return `${IDENTIFIER_QUOTE}${identifier.replaceAll(
    IDENTIFIER_QUOTE, IDENTIFIER_ESCAPED_QUOTE)}${IDENTIFIER_QUOTE}`;
}

/**
 * Whether the database currently holds any undecided PREPARED participant
 * transaction row. A partition checkpoint must never seal an image with
 * in-flight two-phase commit state.
 * @param {Object} db - Open better-sqlite3 database.
 * @return {boolean} True when at least one PREPARED participant row exists.
 */
function hasPendingPreparedParticipantTransactions(db) {
  const tablePresent = db.prepare(SELECT_TABLE_PRESENT_SQL)
    .get(PARTICIPANT_TRANSACTIONS_TABLE);
  if (!tablePresent) {
    return false;
  }
  const row = db.prepare(SELECT_PREPARED_PARTICIPANT_SQL)
    .get(PREPARED_PARTICIPANT_STATE);
  return Boolean(row);
}

/**
 * Compute the maximum committed HLC timestamp across all applied proposal
 * entries in `_raft_rs_log` and any prior compacted witness in
 * `_raft_rs_snapshot`, so a checkpoint created after log compaction or
 * snapshot installation never regresses the sealed HLC clock.
 * @param {Object} copyDb - Open better-sqlite3 checkpoint copy.
 * @param {string} groupId - Raft group identifier.
 * @return {string} Maximum HLC timestamp string, or `'0'` when none exists.
 */
function computeRaftRsMaxCommittedHlc(copyDb, groupId) {
  let max = null;
  const entries = RaftRsDurableStore.readCommittedEntriesIn(copyDb, groupId);
  for (const entry of entries) {
    const rawTimestamp = entry.command?.timestamp;
    const parsed = typeof rawTimestamp === 'string' ?
      HLCTimestamp.tryFromString(rawTimestamp) :
      null;
    if (parsed && (max === null || parsed.compare(max) > 0)) {
      max = parsed;
    }
  }
  const compacted = RaftRsDurableStore.readCompactedMaxHlcIn(copyDb, groupId);
  const parsedCompacted = typeof compacted === 'string' ?
    HLCTimestamp.tryFromString(compacted) :
    null;
  if (parsedCompacted &&
      (max === null || parsedCompacted.compare(max) > 0)) {
    max = parsedCompacted;
  }
  return max === null ? NO_COMMITTED_HLC : max.toString();
}

/**
 * Scrub replica-local consensus tables from a backup copy before sealing a
 * `raft_rs_replica_image` payload. Partition checkpoints keep committed user
 * tables and canonical partition metadata tables (`_transaction_outcomes`,
 * `_partition_statement_outcomes`, `_participant_transactions`,
 * `_partition_write_generation`, `_cdc_obligations`,
 * `_cdc_obligation_progress`, `sqlite_sequence`, `raft_rs_peer_identity`) while
 * dropping all `_raft_*` tables; message-group checkpoints additionally drop
 * all non-`sqlite_` tables except `raft_rs_peer_identity`.
 * @param {Object} copyDb - Open better-sqlite3 checkpoint copy.
 * @param {string} [entityKind] - Descriptor entity kind.
 */
function scrubRaftRsCheckpointPayload(copyDb, entityKind) {
  const raftTables = copyDb.prepare(SELECT_RAFT_LOCAL_TABLES_SQL)
    .all()
    .map(({name}) => name);
  for (const table of raftTables) {
    copyDb.exec(`DROP TABLE IF EXISTS ${quotedIdentifier(table)}`);
  }
  if (entityKind !== ENTITY_TYPE.PARTITION) {
    const tables = copyDb.prepare(SELECT_USER_TABLES_SQL)
      .all()
      .map(({name}) => name)
      .filter((name) => !name.startsWith('sqlite_'));
    for (const table of tables) {
      if (table !== RAFT_RS_PEER_TABLE) {
        copyDb.exec(`DROP TABLE IF EXISTS ${quotedIdentifier(table)}`);
      }
    }
  }
  copyDb.pragma(SQLITE_DELETE_JOURNAL_MODE);
  copyDb.exec(VACUUM_SQL);
}

/**
 * Validate the table set and participant transaction invariants of a sealed
 * `raft_rs_replica_image` payload against its descriptor.
 * @param {Object} payloadDb - Readonly better-sqlite3 payload database.
 * @param {Object} descriptor - Validated checkpoint descriptor.
 * @return {boolean} True when the payload tables satisfy the entity contract.
 */
function validateRaftRsPayloadTables(payloadDb, descriptor) {
  const tables = payloadDb.prepare(SELECT_USER_TABLES_SQL)
    .all()
    .map(({name}) => name)
    .filter((name) => !name.startsWith('sqlite_'));
  if (descriptor.entity?.kind === ENTITY_TYPE.PARTITION) {
    if (!tables.includes(RAFT_RS_PEER_TABLE)) {
      return false;
    }
    if (tables.some((name) => name.startsWith(RAFT_INTERNAL_TABLE_PREFIX))) {
      return false;
    }
    if (hasPendingPreparedParticipantTransactions(payloadDb)) {
      return false;
    }
    return true;
  }
  return tables.length === 1 && tables[0] === RAFT_RS_PEER_TABLE;
}

export {
  computeRaftRsMaxCommittedHlc,
  hasPendingPreparedParticipantTransactions,
  scrubRaftRsCheckpointPayload,
  validateRaftRsPayloadTables,
};
