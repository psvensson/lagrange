import Database from 'better-sqlite3';
import {readdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {COLUMN, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {
  REJOIN_HINTS_FILENAME,
  REJOIN_HINTS_TEMP_SUFFIX,
  REJOIN_HINTS_WRITE_INTERVAL_MS,
  STARTUP_JOIN_MODE,
} from './rejoin-hints-constants.js';

const PARTITIONS_DIRNAME = 'partitions';
const SQLITE_DB_SUFFIX = '.db';
const NODES_PARTITION_PREFIX = `${TABLES.NODES}-p`;
const REJOIN_ROLE_SEED = 'seed';
const REJOIN_ROLE_JOINER = 'joiner';
const STARTUP_MODE_JOIN = 'join';
const STARTUP_MODE_SEED = 'seed';
const STARTUP_MODE_FAIL = 'fail';
const SQLITE_TABLE_TYPE = 'table';
const SQL_TABLE_EXISTS =
  'SELECT 1 AS present FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1';
const SQL_SELECT_NODES =
  `SELECT ${COLUMN.NODE_ID} AS node_id, ` +
  `${COLUMN.NODE_ADDRESS} AS node_address FROM ${TABLES.NODES}`;
let rejoinHintsTempSequence = NUM.ZERO;

function normalizeAddress(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > NUM.ZERO ? trimmed : null;
}

function normalizeNodeCount(nodeRows) {
  return Array.isArray(nodeRows) ? nodeRows.length : NUM.ZERO;
}

function normalizeNodeRole(value) {
  const normalized = normalizeAddress(value);
  if (!normalized) {
    return null;
  }
  const role = normalized.toLowerCase();
  if (role === REJOIN_ROLE_SEED || role === REJOIN_ROLE_JOINER) {
    return role;
  }
  return null;
}

function parseClusterNodeCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < NUM.ZERO) {
    return NUM.ZERO;
  }
  return Math.floor(parsed);
}

function normalizePeerAddresses(peerAddresses, nodeId, nodeAddress) {
  const normalizedNodeId = normalizeAddress(nodeId);
  const normalizedNodeAddress = normalizeAddress(nodeAddress);
  const uniquePeerAddresses = new Set();

  for (const value of Array.isArray(peerAddresses) ? peerAddresses : []) {
    const rowNodeId = normalizeAddress(
      value?.[COLUMN.NODE_ID] ?? value?.node_id ?? null,
    );
    const peerAddress = normalizeAddress(
      value?.[COLUMN.NODE_ADDRESS] ?? value?.node_address ?? value,
    );
    if (!peerAddress) {
      continue;
    }
    if (normalizedNodeId && rowNodeId === normalizedNodeId) {
      continue;
    }
    if (normalizedNodeAddress && peerAddress === normalizedNodeAddress) {
      continue;
    }
    uniquePeerAddresses.add(peerAddress);
  }

  return Array.from(uniquePeerAddresses);
}

function deriveRequiresPeerRejoin(options = {}) {
  return normalizeNodeRole(options.nodeRole) === REJOIN_ROLE_JOINER ||
    parseClusterNodeCount(options.clusterNodeCount) > 1 ||
    normalizePeerAddresses(options.peerAddresses).length > NUM.ZERO;
}

function extractPeerAddresses(nodeRows, nodeId, nodeAddress) {
  return normalizePeerAddresses(nodeRows, nodeId, nodeAddress);
}

function buildRejoinHintsSnapshot(options = {}) {
  const systemTableCache = options.systemTableCache || null;
  const nodeRows = typeof systemTableCache?.getAll === TYPEOF.FUNCTION ?
    systemTableCache.getAll(TABLES.NODES) || [] :
    [];
  const localNodeId = normalizeAddress(options.nodeId);
  const localNodeAddress = normalizeAddress(options.nodeAddress);
  const localNodeRole = normalizeNodeRole(options.nodeRole);
  const clusterNodeCount = normalizeNodeCount(nodeRows);
  const peerAddresses = extractPeerAddresses(
    nodeRows,
    localNodeId,
    localNodeAddress,
  );

  return {
    localNodeId,
    localNodeAddress,
    localNodeRole,
    clusterNodeCount,
    peerAddresses,
    requiresPeerRejoin: deriveRequiresPeerRejoin({
      nodeRole: localNodeRole,
      clusterNodeCount,
      peerAddresses,
    }),
    updatedAt: typeof options.now === TYPEOF.FUNCTION ?
      options.now() :
      Date.now(),
  };
}

function buildBootstrapRejoinHintsSnapshot(options = {}) {
  const localNodeId = normalizeAddress(options.nodeId);
  const localNodeAddress = normalizeAddress(options.nodeAddress);
  const localNodeRole = normalizeNodeRole(options.nodeRole);
  const peerAddresses = normalizePeerAddresses(
    options.peerAddresses,
    localNodeId,
    localNodeAddress,
  );
  const clusterNodeCount = Math.max(
    parseClusterNodeCount(options.clusterNodeCount),
    peerAddresses.length > NUM.ZERO ? NUM.ZERO + 2 : NUM.ZERO,
  );

  return {
    localNodeId,
    localNodeAddress,
    localNodeRole,
    clusterNodeCount,
    peerAddresses,
    requiresPeerRejoin: deriveRequiresPeerRejoin({
      nodeRole: localNodeRole,
      clusterNodeCount,
      peerAddresses,
    }),
    updatedAt: typeof options.now === TYPEOF.FUNCTION ?
      options.now() :
      Date.now(),
  };
}

function resolveRejoinHintsPath(dataDir) {
  const normalizedDataDir = normalizeAddress(dataDir);
  if (!normalizedDataDir) {
    return null;
  }
  return join(normalizedDataDir, REJOIN_HINTS_FILENAME);
}

async function persistRejoinHintsSnapshot(dataDir, snapshot) {
  const hintsPath = resolveRejoinHintsPath(dataDir);
  if (!hintsPath) {
    return null;
  }

  const tempPath = `${hintsPath}${REJOIN_HINTS_TEMP_SUFFIX}.` +
    `${process.pid}.${rejoinHintsTempSequence++}`;
  await writeFile(
    tempPath,
    JSON.stringify(snapshot, null, 2) + '\n',
    'utf8',
  );
  await rename(tempPath, hintsPath);
  return snapshot;
}

async function persistBootstrapRejoinHints(options = {}) {
  const snapshot = buildBootstrapRejoinHintsSnapshot(options);
  return persistRejoinHintsSnapshot(options.dataDir, snapshot);
}

async function readRejoinHints(dataDir) {
  const hintsPath = resolveRejoinHintsPath(dataDir);
  if (!hintsPath) {
    return null;
  }

  try {
    const raw = await readFile(hintsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === TYPEOF.OBJECT ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function hintsMatchLocalIdentity(hints, nodeId, nodeAddress) {
  if (!hints || typeof hints !== TYPEOF.OBJECT) {
    return false;
  }

  const normalizedNodeId = normalizeAddress(nodeId);
  const normalizedNodeAddress = normalizeAddress(nodeAddress);
  const hintedNodeId = normalizeAddress(hints.localNodeId);
  const hintedNodeAddress = normalizeAddress(hints.localNodeAddress);

  if (normalizedNodeId && hintedNodeId) {
    return normalizedNodeId === hintedNodeId;
  }
  if (normalizedNodeAddress && hintedNodeAddress) {
    return normalizedNodeAddress === hintedNodeAddress;
  }
  return !hintedNodeId && !hintedNodeAddress;
}

async function listNodesReplicaDbPaths(dataDir) {
  const hintsPath = resolveRejoinHintsPath(dataDir);
  if (!hintsPath) {
    return [];
  }

  const partitionsDir = join(dataDir, PARTITIONS_DIRNAME);
  let partitionEntries = [];
  try {
    partitionEntries = await readdir(partitionsDir, {withFileTypes: true});
  } catch (_error) {
    return [];
  }

  const dbPaths = [];
  for (const entry of partitionEntries) {
    if (!entry?.isDirectory?.() ||
        !String(entry.name || '').startsWith(NODES_PARTITION_PREFIX)) {
      continue;
    }
    const partitionDir = join(partitionsDir, entry.name);
    let replicaEntries = [];
    try {
      replicaEntries = await readdir(partitionDir, {withFileTypes: true});
    } catch (_error) {
      continue;
    }
    for (const replicaEntry of replicaEntries) {
      if (!replicaEntry?.isFile?.() ||
          !String(replicaEntry.name || '').endsWith(SQLITE_DB_SUFFIX)) {
        continue;
      }
      const dbPath = join(partitionDir, replicaEntry.name);
      try {
        const metadata = await stat(dbPath);
        dbPaths.push({
          dbPath,
          modifiedAt: Number(metadata?.mtimeMs) || NUM.ZERO,
        });
      } catch (_error) {
        continue;
      }
    }
  }

  dbPaths.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return dbPaths.map((entry) => entry.dbPath);
}

function readNodesRowsFromReplicaDb(dbPath) {
  let database = null;
  try {
    database = new Database(dbPath, {readonly: true, fileMustExist: true});
    const tableExists = database
      .prepare(SQL_TABLE_EXISTS)
      .get(SQLITE_TABLE_TYPE, TABLES.NODES);
    if (!tableExists) {
      return [];
    }
    return database.prepare(SQL_SELECT_NODES).all();
  } catch (_error) {
    return [];
  } finally {
    database?.close();
  }
}

async function readDurableNodesTableSnapshot(options = {}) {
  const normalizedNodeId = normalizeAddress(options.nodeId);
  const normalizedNodeAddress = normalizeAddress(options.nodeAddress);
  const dbPaths = await listNodesReplicaDbPaths(options.dataDir);
  const peerAddresses = new Set();
  let clusterNodeCount = NUM.ZERO;
  let hasAnyDurableNodesTable = false;
  let matchedLocalIdentity = false;

  for (const dbPath of dbPaths) {
    const rows = readNodesRowsFromReplicaDb(dbPath);
    if (!Array.isArray(rows) || rows.length === NUM.ZERO) {
      continue;
    }
    hasAnyDurableNodesTable = true;
    clusterNodeCount = Math.max(clusterNodeCount, rows.length);

    let sawMatchingNodeId = false;
    let sawMatchingNodeAddress = false;
    for (const row of rows) {
      const rowNodeId = normalizeAddress(
        row?.[COLUMN.NODE_ID] ?? row?.node_id ?? null,
      );
      const rowNodeAddress = normalizeAddress(
        row?.[COLUMN.NODE_ADDRESS] ?? row?.node_address ?? null,
      );
      if (normalizedNodeId && rowNodeId === normalizedNodeId) {
        sawMatchingNodeId = true;
      }
      if (normalizedNodeAddress && rowNodeAddress === normalizedNodeAddress) {
        sawMatchingNodeAddress = true;
      }
    }

    const identityMatched = normalizedNodeId ?
      sawMatchingNodeId :
      sawMatchingNodeAddress;
    if (!identityMatched) {
      continue;
    }

    matchedLocalIdentity = true;
    for (const peerAddress of extractPeerAddresses(
      rows,
      normalizedNodeId,
      normalizedNodeAddress,
    )) {
      peerAddresses.add(peerAddress);
    }
  }

  return {
    clusterNodeCount,
    peerAddresses: Array.from(peerAddresses),
    hasDurableNodesTable: hasAnyDurableNodesTable,
    matchedLocalIdentity,
    identityMismatch: hasAnyDurableNodesTable && !matchedLocalIdentity,
  };
}

function choosePreferredPeerAddress(peerAddresses, preferredPeerAddresses) {
  const preferredSet = new Set(
    normalizePeerAddresses(preferredPeerAddresses),
  );
  for (const peerAddress of peerAddresses) {
    if (preferredSet.has(peerAddress)) {
      return peerAddress;
    }
  }
  return peerAddresses[NUM.ZERO] || null;
}

async function resolveAutoRejoinStartupDecision(options = {}) {
  const hints = await readRejoinHints(options.dataDir);
  const hintsIdentityMatched = hintsMatchLocalIdentity(
    hints,
    options.nodeId,
    options.nodeAddress,
  );
  const durableSnapshot = await readDurableNodesTableSnapshot(options);
  const hintPeerAddresses = hintsIdentityMatched ?
    normalizePeerAddresses(
      hints?.peerAddresses,
      options.nodeId,
      options.nodeAddress,
    ) :
    [];
  const peerAddresses = normalizePeerAddresses(
    [
      ...hintPeerAddresses,
      ...durableSnapshot.peerAddresses,
    ],
    options.nodeId,
    options.nodeAddress,
  );
  const clusterNodeCount = Math.max(
    hintsIdentityMatched ? parseClusterNodeCount(hints?.clusterNodeCount) : NUM.ZERO,
    durableSnapshot.clusterNodeCount,
  );
  const localNodeRole = hintsIdentityMatched ?
    normalizeNodeRole(hints?.localNodeRole) :
    null;

  if (durableSnapshot.identityMismatch) {
    return {
      mode: STARTUP_MODE_FAIL,
      peerAddress: null,
      source: 'durable_nodes_table',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: true,
      error:
        'Persistent cluster state belongs to a different node identity; ' +
        'refusing to start with mismatched data directory',
    };
  }

  if (localNodeRole === REJOIN_ROLE_SEED) {
    return {
      mode: STARTUP_MODE_SEED,
      peerAddress: null,
      source: hintsIdentityMatched ?
        'rejoin_hints' :
        (durableSnapshot.hasDurableNodesTable ?
          'durable_nodes_table' :
          'none'),
      startupMode: STARTUP_JOIN_MODE.SEED,
      durableStateDetected:
        hintsIdentityMatched ||
        durableSnapshot.hasDurableNodesTable ||
        clusterNodeCount > NUM.ZERO,
      identityMismatch: false,
    };
  }

  if (peerAddresses.length > NUM.ZERO) {
    if (typeof options.probePeerAddress === TYPEOF.FUNCTION) {
      for (const peerAddress of peerAddresses) {
        if (await options.probePeerAddress(peerAddress)) {
          return {
            mode: STARTUP_MODE_JOIN,
            peerAddress,
            source: hintPeerAddresses.includes(peerAddress) ?
              'rejoin_hints' :
              'durable_nodes_table',
            startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
            durableStateDetected: true,
            identityMismatch: false,
          };
        }
      }
    }

    return {
      mode: STARTUP_MODE_JOIN,
      peerAddress: choosePreferredPeerAddress(peerAddresses, hintPeerAddresses),
      source: hintPeerAddresses.length > NUM.ZERO ?
        'rejoin_hints' :
        'durable_nodes_table',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: false,
    };
  }

  if (deriveRequiresPeerRejoin({
    nodeRole: localNodeRole,
    clusterNodeCount,
    peerAddresses,
  })) {
    return {
      mode: STARTUP_MODE_FAIL,
      peerAddress: null,
      source: durableSnapshot.hasDurableNodesTable ?
        'durable_nodes_table' :
        'rejoin_hints',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: false,
      error:
        'Persistent multi-node cluster state was detected but no rejoin peer ' +
        'address could be recovered; refusing to bootstrap a fresh seed over ' +
        'existing durable state',
    };
  }

  return {
    mode: STARTUP_MODE_SEED,
    peerAddress: null,
    source: 'none',
    startupMode: STARTUP_JOIN_MODE.SEED,
    durableStateDetected: false,
    identityMismatch: false,
  };
}

async function resolveAutoRejoinPeerAddress(options = {}) {
  const decision = await resolveAutoRejoinStartupDecision(options);
  if (decision.mode === STARTUP_MODE_FAIL) {
    const error = new Error(decision.error);
    error.code = 'AUTO_REJOIN_REQUIRED';
    throw error;
  }
  return decision.mode === STARTUP_MODE_JOIN ?
    decision.peerAddress :
    null;
}

class RejoinHintsPersistenceService {
  constructor(options = {}) {
    this.dataDir = options.dataDir || null;
    this.nodeId = options.nodeId || null;
    this.nodeAddress = options.nodeAddress || null;
    this.nodeRole = options.nodeRole || null;
    this.getSystemTableCache =
      typeof options.getSystemTableCache === TYPEOF.FUNCTION ?
        options.getSystemTableCache :
        () => null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.logger = options.logger || console;
    this.writeIntervalMs = Number.isFinite(options.writeIntervalMs) &&
      options.writeIntervalMs > NUM.ZERO ?
      Math.floor(options.writeIntervalMs) :
      REJOIN_HINTS_WRITE_INTERVAL_MS;
    this.timer = null;
    this.persistChain = Promise.resolve();
    this.persistSequence = NUM.ZERO;
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.persistNow();
    }, this.writeIntervalMs);
    if (typeof this.timer.unref === TYPEOF.FUNCTION) {
      this.timer.unref();
    }
    void this.persistNow();
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.persistNow();
  }

  async persistNow() {
    const operation = this.persistChain
      .catch(() => null)
      .then(() => this.persistSnapshot());
    this.persistChain = operation.catch(() => null);
    return operation;
  }

  async persistSnapshot() {
    const snapshot = buildRejoinHintsSnapshot({
      systemTableCache: this.getSystemTableCache(),
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      nodeRole: this.nodeRole,
      now: this.now,
    });
    try {
      rejoinHintsTempSequence = Math.max(
        rejoinHintsTempSequence,
        this.persistSequence,
      );
      const persisted = await persistRejoinHintsSnapshot(
        this.dataDir,
        snapshot,
      );
      this.persistSequence = rejoinHintsTempSequence;
      if (!persisted) {
        return null;
      }
      return snapshot;
    } catch (error) {
      this.logger.warn?.('Failed to persist cluster rejoin hints', {
        nodeId: this.nodeId,
        dataDir: this.dataDir,
        error: error.message,
      });
      return null;
    }
  }
}

export {
  buildBootstrapRejoinHintsSnapshot,
  buildRejoinHintsSnapshot,
  persistBootstrapRejoinHints,
  readRejoinHints,
  RejoinHintsPersistenceService,
  resolveAutoRejoinStartupDecision,
  resolveAutoRejoinPeerAddress,
};
