import Database from 'better-sqlite3';
import {readdir, readFile, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {COLUMN, TABLES} from '../constants/index.js';
import {DURABLE_EVIDENCE_STATE, REJOIN_HINTS_FILENAME} from
  './rejoin-hints-constants.js';
import {extractPeerAddresses, normalizeAddress} from
  './rejoin-hints-addresses.js';

const PARTITIONS_DIRNAME = 'partitions';
const SQLITE_DB_SUFFIX = '.db';
const NODES_PARTITION_PREFIX = `${TABLES.NODES}-p`;
const SQLITE_TABLE_TYPE = 'table';
const EMPTY_STRING = '';
const UTF8_ENCODING = 'utf8';
const FILE_NOT_FOUND_ERROR_CODE = 'ENOENT';
const SQL_TABLE_EXISTS =
  'SELECT 1 AS present FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1';
const SQL_SELECT_NODES =
  `SELECT ${COLUMN.NODE_ID} AS node_id, ` +
  `${COLUMN.NODE_ADDRESS} AS node_address FROM ${TABLES.NODES}`;

/**
 * Read the rejoin hints file as a typed outcome. A hints file that exists
 * but cannot be read or parsed is UNREADABLE durable evidence, never
 * absence, so the startup decision cannot silently treat damaged durable
 * state as a fresh data directory.
 * @param {string} dataDir - Data directory holding the rejoin hints file.
 * @return {Promise<{state: string, hints: Object|null}>}
 */
async function readRejoinHintsOutcome(dataDir) {
  const normalizedDataDir = normalizeAddress(dataDir);
  if (!normalizedDataDir) {
    return {state: DURABLE_EVIDENCE_STATE.MISSING, hints: null};
  }

  try {
    const raw = await readFile(
      join(normalizedDataDir, REJOIN_HINTS_FILENAME),
      UTF8_ENCODING,
    );
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ?
      {state: DURABLE_EVIDENCE_STATE.READABLE, hints: parsed} :
      {state: DURABLE_EVIDENCE_STATE.UNREADABLE, hints: null};
  } catch (error) {
    return error?.code === FILE_NOT_FOUND_ERROR_CODE ?
      {state: DURABLE_EVIDENCE_STATE.MISSING, hints: null} :
      {state: DURABLE_EVIDENCE_STATE.UNREADABLE, hints: null};
  }
}

async function readRejoinHints(dataDir) {
  const outcome = await readRejoinHintsOutcome(dataDir);
  return outcome.state === DURABLE_EVIDENCE_STATE.READABLE ?
    outcome.hints :
    null;
}

function isNodesPartitionDirectory(entry) {
  return entry?.isDirectory?.() === true &&
    String(entry.name || EMPTY_STRING).startsWith(NODES_PARTITION_PREFIX);
}

function isReplicaDbFile(entry) {
  return entry?.isFile?.() === true &&
    String(entry.name || EMPTY_STRING).endsWith(SQLITE_DB_SUFFIX);
}

async function statReplicaDbPath(dbPath) {
  try {
    const metadata = await stat(dbPath);
    return {dbPath, modifiedAt: Number(metadata?.mtimeMs) || 0};
  } catch (_error) {
    // A discovered DB file is durable evidence even when it cannot be
    // stat'ed afterwards; it still feeds the unreadable-read path.
    return {dbPath, modifiedAt: 0};
  }
}

async function collectPartitionReplicaDbPaths(partitionDir) {
  let replicaEntries = [];
  try {
    replicaEntries = await readdir(partitionDir, {withFileTypes: true});
  } catch (_error) {
    return {replicaDbPaths: [], partitionUnreadable: true};
  }

  const replicaDbPaths = [];
  for (const replicaEntry of replicaEntries) {
    if (!isReplicaDbFile(replicaEntry)) {
      continue;
    }
    replicaDbPaths.push(
      await statReplicaDbPath(join(partitionDir, replicaEntry.name)),
    );
  }
  return {replicaDbPaths, partitionUnreadable: false};
}

/**
 * Discover nodes-table replica DB files as a typed outcome. A partitions
 * subtree that exists but cannot be listed is UNREADABLE durable evidence;
 * replica DB files are durable evidence the moment they are discovered,
 * even when they cannot be stat'ed afterwards.
 * @param {string} dataDir - Data directory holding the partitions subtree.
 * @return {Promise<{state: string, dbPaths: string[]}>}
 */
async function readPartitionsDirectoryEntries(partitionsDir) {
  try {
    return {
      entries: await readdir(partitionsDir, {withFileTypes: true}),
      state: DURABLE_EVIDENCE_STATE.READABLE,
    };
  } catch (error) {
    return {
      entries: [],
      state: error?.code === FILE_NOT_FOUND_ERROR_CODE ?
        DURABLE_EVIDENCE_STATE.MISSING :
        DURABLE_EVIDENCE_STATE.UNREADABLE,
    };
  }
}

async function listNodesReplicaDbPathsOutcome(dataDir) {
  const normalizedDataDir = normalizeAddress(dataDir);
  const partitionsDir = normalizedDataDir ?
    join(normalizedDataDir, PARTITIONS_DIRNAME) :
    null;
  const partitionsRead = partitionsDir ?
    await readPartitionsDirectoryEntries(partitionsDir) :
    {entries: [], state: DURABLE_EVIDENCE_STATE.MISSING};

  const dbPaths = [];
  let sawUnreadablePartition = false;
  if (partitionsRead.state === DURABLE_EVIDENCE_STATE.READABLE) {
    for (const entry of partitionsRead.entries) {
      if (!isNodesPartitionDirectory(entry)) {
        continue;
      }
      const partitionReplicaDbPaths = await collectPartitionReplicaDbPaths(
        join(partitionsDir, entry.name),
      );
      sawUnreadablePartition = sawUnreadablePartition ||
        partitionReplicaDbPaths.partitionUnreadable;
      dbPaths.push(...partitionReplicaDbPaths.replicaDbPaths);
    }
  }

  dbPaths.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const paths = dbPaths.map((entry) => entry.dbPath);
  const state = partitionsRead.state === DURABLE_EVIDENCE_STATE.READABLE &&
    paths.length === 0 &&
    !sawUnreadablePartition ?
    DURABLE_EVIDENCE_STATE.MISSING :
    partitionsRead.state;
  return {state, dbPaths: paths};
}

/**
 * Read the nodes-table rows from one replica DB as a typed outcome. A
 * discovered DB file that cannot be opened or queried is UNREADABLE
 * durable evidence; only a readable DB whose nodes table is absent or
 * empty proves zero rows.
 * @param {string} dbPath - Replica DB file path.
 * @return {{state: string, rows: Object[]}}
 */
function readNodesRowsFromReplicaDbOutcome(dbPath) {
  let database = null;
  try {
    database = new Database(dbPath, {readonly: true, fileMustExist: true});
    const tableExists = database
      .prepare(SQL_TABLE_EXISTS)
      .get(SQLITE_TABLE_TYPE, TABLES.NODES);
    if (!tableExists) {
      return {state: DURABLE_EVIDENCE_STATE.READABLE, rows: []};
    }
    return {
      state: DURABLE_EVIDENCE_STATE.READABLE,
      rows: database.prepare(SQL_SELECT_NODES).all(),
    };
  } catch (_error) {
    return {state: DURABLE_EVIDENCE_STATE.UNREADABLE, rows: []};
  } finally {
    database?.close();
  }
}

function rowsMatchLocalIdentity(rows, nodeId, nodeAddress) {
  const rowNodeIds = new Set();
  const rowNodeAddresses = new Set();
  for (const row of rows) {
    rowNodeIds.add(normalizeAddress(
      row?.[COLUMN.NODE_ID] ?? row?.node_id ?? null,
    ));
    rowNodeAddresses.add(normalizeAddress(
      row?.[COLUMN.NODE_ADDRESS] ?? row?.node_address ?? null,
    ));
  }
  return nodeId ?
    rowNodeIds.has(nodeId) :
    rowNodeAddresses.has(nodeAddress);
}

function absorbReplicaNodesRows(snapshot, rows, nodeId, nodeAddress) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }
  snapshot.hasDurableNodesTable = true;
  snapshot.clusterNodeCount = Math.max(snapshot.clusterNodeCount, rows.length);

  if (!rowsMatchLocalIdentity(rows, nodeId, nodeAddress)) {
    return;
  }

  snapshot.matchedLocalIdentity = true;
  for (const peerAddress of extractPeerAddresses(rows, nodeId, nodeAddress)) {
    snapshot.peerAddresses.add(peerAddress);
  }
}

// Fold one replica DB's rows into the per-node_id address map and flag a
// CONFLICT when two readable replica DBs carry the SAME node_id with a
// DIFFERENT node_address. Contradictory replica DBs are evidence of a
// divergent/corrupt durable state and must fail closed, never be unioned.
function foldReplicaRowsIntoAddressMap(rowsByNodeId, rows, snapshot) {
  for (const row of rows) {
    const nodeId = normalizeAddress(row?.[COLUMN.NODE_ID] ?? row?.node_id);
    const nodeAddress = normalizeAddress(
      row?.[COLUMN.NODE_ADDRESS] ?? row?.node_address,
    );
    if (!nodeId || !nodeAddress) {
      continue;
    }
    const existing = rowsByNodeId.get(nodeId);
    if (existing === undefined) {
      rowsByNodeId.set(nodeId, nodeAddress);
      continue;
    }
    if (existing !== nodeAddress) {
      snapshot.conflictingReplicaEvidence = true;
    }
  }
}

async function readDurableNodesTableSnapshot(options = {}) {
  const normalizedNodeId = normalizeAddress(options.nodeId);
  const normalizedNodeAddress = normalizeAddress(options.nodeAddress);
  const replicaDbPaths = await listNodesReplicaDbPathsOutcome(options.dataDir);
  const snapshot = {
    clusterNodeCount: 0,
    peerAddresses: new Set(),
    hasDurableNodesTable: false,
    matchedLocalIdentity: false,
    conflictingReplicaEvidence: false,
  };
  const rowsByNodeId = new Map();

  for (const dbPath of replicaDbPaths.dbPaths) {
    const replicaRead = readNodesRowsFromReplicaDbOutcome(dbPath);
    if (replicaRead.state !== DURABLE_EVIDENCE_STATE.READABLE) {
      snapshot.hasDurableNodesTable = true;
      continue;
    }
    foldReplicaRowsIntoAddressMap(rowsByNodeId, replicaRead.rows, snapshot);
    absorbReplicaNodesRows(
      snapshot,
      replicaRead.rows,
      normalizedNodeId,
      normalizedNodeAddress,
    );
  }

  return {
    clusterNodeCount: snapshot.clusterNodeCount,
    peerAddresses: Array.from(snapshot.peerAddresses),
    hasDurableNodesTable: snapshot.hasDurableNodesTable,
    matchedLocalIdentity: snapshot.matchedLocalIdentity,
    identityMismatch:
      snapshot.hasDurableNodesTable && !snapshot.matchedLocalIdentity,
    conflictingReplicaEvidence: snapshot.conflictingReplicaEvidence,
    durableEvidenceUnreadable:
      replicaDbPaths.state === DURABLE_EVIDENCE_STATE.UNREADABLE,
  };
}

export {
  readDurableNodesTableSnapshot,
  readRejoinHints,
  readRejoinHintsOutcome,
};
