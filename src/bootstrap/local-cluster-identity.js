// The cluster identity this node durably holds, read at startup before Raft
// and the system table cache exist (stage S4 of
// formation-admission-design-2026-11-11.md, decision D6, finding F3a).
//
// A node has two INDEPENDENT local records of its cluster identity:
//   - the rejoin hints file: a local record of what this node last knew
//     (written by the hints persistence and at join);
//   - the replicated CONFIG row `cluster_id` in this node's own replica of
//     the CONFIG partition: the cluster's authority (R10), present only on a
//     node that hosts a CONFIG replica.
// The startup comparison sets one against the other, never a record against
// itself. A node without a local CONFIG replica has no second local record:
// its comparison is UNKNOWN{no_local_config_replica}, and the only
// meaningful check for it is against the cluster's answer at join
// (join-cluster-identity.js).
//
// Each fact compared here is named in LOCAL_IDENTITY_FACT with its CONFIG
// key and hints field; a second identity fact is one more entry, read by the
// same replica query and compared by the same function.
import Database from 'better-sqlite3';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {COLUMN, TABLES} from '../constants/index.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {
  CLUSTER_ID_CONFIG_KEY,
  CLUSTER_ID_MATCH_STATE,
} from './cluster-identity-constants.js';
import {DURABLE_EVIDENCE_STATE} from './rejoin-hints-constants.js';
import {readRejoinHints} from './rejoin-hints-durable-evidence.js';

const LOCAL_IDENTITY_FACT = Object.freeze({
  CLUSTER_ID: Object.freeze({
    configKey: CLUSTER_ID_CONFIG_KEY,
    hintsField: 'clusterId',
  }),
});

const LOCAL_IDENTITY_UNKNOWN_REASON = Object.freeze({
  HINTS_IDENTITY_ABSENT: 'hints_identity_absent',
  NO_LOCAL_CONFIG_REPLICA: 'no_local_config_replica',
  DURABLE_ROW_ABSENT: 'durable_row_absent',
  DURABLE_REPLICA_UNREADABLE: 'durable_replica_unreadable',
});

const LOCAL_IDENTITY_MISMATCH_REASON = Object.freeze({
  HINTS_DIFFER_FROM_DURABLE: 'hints_differ_from_durable',
  DURABLE_REPLICAS_DISAGREE: 'durable_replicas_disagree',
});

const CONFIG_PARTITION_PREFIX = `${TABLES.CONFIG}-p`;
const SQL_TABLE_EXISTS =
  'SELECT 1 AS present FROM sqlite_master WHERE type = \'table\' AND name = ?';
const FILE_NOT_FOUND_ERROR_CODE = 'ENOENT';
const NO_VALUE_TEXT = 'none';
const DISAGREEING_VALUES_SEPARATOR = ',';
const MISMATCH_MESSAGE_PREFIX =
  'Persistent cluster state belongs to a different cluster identity; ' +
  'refusing to start with a data directory from another cluster';

function nonEmptyText(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// A directory that cannot be listed: MISSING only when it does not exist.
function directoryListingFailure(error) {
  return {entries: [], state: error?.code === FILE_NOT_FOUND_ERROR_CODE ?
    DURABLE_EVIDENCE_STATE.MISSING : DURABLE_EVIDENCE_STATE.UNREADABLE};
}

async function listDirectory(path) {
  try {
    return {state: DURABLE_EVIDENCE_STATE.READABLE,
      entries: await readdir(path, {withFileTypes: true})};
  } catch (error) {
    return directoryListingFailure(error);
  }
}

// A discovered replica DB that cannot be read is UNREADABLE, never empty.
function unreadableReplica(error) {
  return {state: DURABLE_EVIDENCE_STATE.UNREADABLE, rows: [],
    cause: error?.message ?? String(error)};
}

function isConfigPartitionDirectory(entry) {
  return entry.isDirectory() && entry.name.startsWith(CONFIG_PARTITION_PREFIX);
}

function isReplicaDbFile(entry) {
  return entry.isFile() && entry.name.endsWith(STORAGE_DEFAULT.DB_EXT);
}

// MISSING only when no CONFIG replica DB exists; a listing that fails is
// UNREADABLE durable evidence, never absence.
function replicaListingState(partitionsState, listings, dbPaths) {
  const partitionUnreadable = listings.some(({listing}) =>
    listing.state !== DURABLE_EVIDENCE_STATE.READABLE);
  if (partitionsState !== DURABLE_EVIDENCE_STATE.READABLE) return partitionsState;
  return partitionUnreadable ? DURABLE_EVIDENCE_STATE.UNREADABLE :
    (dbPaths.length > 0 ? DURABLE_EVIDENCE_STATE.READABLE :
      DURABLE_EVIDENCE_STATE.MISSING);
}

async function listConfigReplicaDbPaths(dataDir) {
  const partitionsDir = join(dataDir, STORAGE_DEFAULT.PARTITIONS_DIRNAME);
  const partitions = await listDirectory(partitionsDir);
  const listings = await Promise.all(partitions.entries
    .filter(isConfigPartitionDirectory)
    .map(async (entry) => {
      const dir = join(partitionsDir, entry.name);
      return {dir, listing: await listDirectory(dir)};
    }));
  const dbPaths = listings.flatMap(({dir, listing}) => listing.entries
    .filter(isReplicaDbFile).map((replica) => join(dir, replica.name)));
  return {state: replicaListingState(partitions.state, listings, dbPaths),
    dbPaths};
}

function readIdentityRowsFromReplica(dbPath, configKeys) {
  let database = null;
  try {
    database = new Database(dbPath, {readonly: true, fileMustExist: true});
    if (!database.prepare(SQL_TABLE_EXISTS).get(TABLES.CONFIG)) {
      return {state: DURABLE_EVIDENCE_STATE.READABLE, rows: []};
    }
    const placeholders = configKeys.map(() => '?').join(', ');
    return {state: DURABLE_EVIDENCE_STATE.READABLE, rows: database.prepare(
      `SELECT ${COLUMN.CONFIG_KEY}, ${COLUMN.CONFIG_VALUE} FROM ` +
      `${TABLES.CONFIG} WHERE ${COLUMN.CONFIG_KEY} IN (${placeholders})`,
    ).all(...configKeys)};
  } catch (error) {
    return unreadableReplica(error);
  } finally {
    database?.close();
  }
}

/**
 * Read the identity rows this node's own CONFIG replicas hold, straight from
 * the replica DB files (the readDurableNodesTableSnapshot precedent): no
 * Raft, no cache. MISSING means this node hosts no CONFIG replica.
 * @param {string} dataDir Data directory.
 * @param {string[]} configKeys CONFIG keys of the identity facts.
 * @return {Promise<{state: string, valuesByKey: Map<string, Set<string>>}>}
 */
async function readDurableConfigIdentityValues(dataDir, configKeys) {
  const replicas = await listConfigReplicaDbPaths(dataDir);
  const reads = replicas.dbPaths.map((dbPath) =>
    readIdentityRowsFromReplica(dbPath, configKeys));
  const valuesByKey = new Map(configKeys.map((key) => [key, new Set()]));
  for (const row of reads.flatMap((read) => read.rows)) {
    const value = nonEmptyText(row[COLUMN.CONFIG_VALUE]);
    if (value !== null) valuesByKey.get(row[COLUMN.CONFIG_KEY]).add(value);
  }
  const replicaUnreadable = reads.some((read) =>
    read.state !== DURABLE_EVIDENCE_STATE.READABLE);
  return {state: replicaUnreadable ? DURABLE_EVIDENCE_STATE.UNREADABLE :
    replicas.state, valuesByKey};
}

function comparison(state, reason, recordedValue, durableValue, heldValue) {
  return Object.freeze({state, reason, recordedValue, durableValue, heldValue});
}

function unknownDurable(durableState) {
  if (durableState === DURABLE_EVIDENCE_STATE.MISSING) {
    return LOCAL_IDENTITY_UNKNOWN_REASON.NO_LOCAL_CONFIG_REPLICA;
  }
  return durableState === DURABLE_EVIDENCE_STATE.UNREADABLE ?
    LOCAL_IDENTITY_UNKNOWN_REASON.DURABLE_REPLICA_UNREADABLE :
    LOCAL_IDENTITY_UNKNOWN_REASON.DURABLE_ROW_ABSENT;
}

/**
 * Compare one identity fact's hints record with the durable CONFIG row.
 * MATCH only when both exist and agree; MISMATCH when they differ or the
 * local replicas disagree; otherwise UNKNOWN with the missing side named.
 * heldValue is what this node durably holds (the durable row when present,
 * else the hints record): what it presents at join, never a confirmation.
 * @param {Object} fact A LOCAL_IDENTITY_FACT entry.
 * @param {Object|null} hints The parsed rejoin hints, or null.
 * @param {Object} durable readDurableConfigIdentityValues answer.
 * @return {Object} Frozen {state, reason, recordedValue, durableValue,
 *   heldValue}.
 */
function compareLocalIdentityFact(fact, hints, durable) {
  const recorded = nonEmptyText(hints?.[fact.hintsField]);
  const durableValues = [...durable.valuesByKey.get(fact.configKey)];
  if (durableValues.length > 1) {
    return comparison(CLUSTER_ID_MATCH_STATE.MISMATCH,
      LOCAL_IDENTITY_MISMATCH_REASON.DURABLE_REPLICAS_DISAGREE,
      recorded, durableValues.join(DISAGREEING_VALUES_SEPARATOR), null);
  }
  const durableValue = durableValues[0] ?? null;
  if (recorded !== null && durableValue !== null) {
    return recorded === durableValue ?
      comparison(CLUSTER_ID_MATCH_STATE.MATCH, null, recorded, durableValue,
        durableValue) :
      comparison(CLUSTER_ID_MATCH_STATE.MISMATCH,
        LOCAL_IDENTITY_MISMATCH_REASON.HINTS_DIFFER_FROM_DURABLE,
        recorded, durableValue, null);
  }
  const reason = recorded === null ?
    LOCAL_IDENTITY_UNKNOWN_REASON.HINTS_IDENTITY_ABSENT :
    unknownDurable(durable.state);
  return comparison(CLUSTER_ID_MATCH_STATE.UNKNOWN, reason, recorded,
    durableValue, durableValue ?? recorded);
}

// UNKNOWN because one local record is missing while the node still holds an
// id: the node can ask the cluster, whose join gate (join-cluster-identity.js)
// confirms or refuses the held id. A damaged local replica
// (durable_replica_unreadable) is not in this set: that is unreadable
// durable evidence and fails closed like any other.
const CONFIRMABLE_AT_JOIN_REASONS = Object.freeze(new Set([
  LOCAL_IDENTITY_UNKNOWN_REASON.NO_LOCAL_CONFIG_REPLICA,
  LOCAL_IDENTITY_UNKNOWN_REASON.DURABLE_ROW_ABSENT,
  LOCAL_IDENTITY_UNKNOWN_REASON.HINTS_IDENTITY_ABSENT,
]));

/**
 * Whether the cluster can confirm this UNKNOWN identity at join: the node
 * holds an id and lacks only a local record to compare it with.
 * @param {Object} identity A compareLocalClusterIdentity answer.
 * @return {boolean}
 */
function isConfirmableAtJoin(identity) {
  return identity.state === CLUSTER_ID_MATCH_STATE.UNKNOWN &&
    identity.heldValue !== null && CONFIRMABLE_AT_JOIN_REASONS.has(identity.reason);
}

/**
 * The startup comparison of this node's cluster identity: the hints record
 * against its own durable CONFIG replica row.
 * @param {string} dataDir Data directory.
 * @param {Object|null} hints The parsed rejoin hints (one read per startup
 *   decision, shared with the rest of that decision), or null.
 * @return {Promise<Object>} compareLocalIdentityFact answer for cluster_id.
 */
async function compareLocalClusterIdentity(dataDir, hints) {
  const fact = LOCAL_IDENTITY_FACT.CLUSTER_ID;
  const durable = await readDurableConfigIdentityValues(
    dataDir, [fact.configKey]);
  return compareLocalIdentityFact(fact, hints, durable);
}

/**
 * Read the hints and compare: the entry for a caller without a hints read.
 * @param {string} dataDir Data directory.
 * @return {Promise<Object>} compareLocalClusterIdentity answer.
 */
async function readLocalClusterIdentity(dataDir) {
  return compareLocalClusterIdentity(dataDir, await readRejoinHints(dataDir));
}

/**
 * The operator message of a startup cluster-id mismatch, naming both ids.
 * @param {Object} identity A MISMATCH comparison.
 * @return {string}
 */
function describeLocalClusterIdentityMismatch(identity) {
  return `${MISMATCH_MESSAGE_PREFIX} (${identity.reason}: rejoin hints ` +
    `record ${identity.recordedValue ?? NO_VALUE_TEXT}, durable CONFIG ` +
    `cluster_id ${identity.durableValue ?? NO_VALUE_TEXT})`;
}

export {
  LOCAL_IDENTITY_MISMATCH_REASON,
  LOCAL_IDENTITY_UNKNOWN_REASON,
  compareLocalClusterIdentity,
  describeLocalClusterIdentityMismatch,
  isConfirmableAtJoin,
  readLocalClusterIdentity,
};
