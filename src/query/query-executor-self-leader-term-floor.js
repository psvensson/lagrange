// Self-published leader term-fenced peer probing (Option A, S0 ruling Q1
// refinement). When a node is ITSELF the published canonical leader of a
// partition (canonicalLeaderNodeId === this.nodeId) and knows in-process that
// it does NOT currently hold RAFT_ROLE.LEADER (for example during
// DURABLE_REJOIN before local replicas open, or as a local follower without a
// leader redirect address), it can determine its own local durable Raft term
// T_self >= T_pub from its live local Raft core or the exact authoritative
// local replica's on-disk SQLite _raft_rs_hard_state. By Raft Election Safety
// (at most one leader per term), no honest deposed predecessor can hold
// term >= T_self, so peer probing fenced by readAuthorityWitness.term >= T_self
// breaks restart deadlocks without weakening S0 ruling Q1 for any other
// published leader or any case where T_self cannot be durably established or
// lags the published leader_claim_raft_term.
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {
  COLUMN,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {OWNER_FACT_UNAVAILABLE_REASON} from
  '../control-plane/control-plane-owner-fact-read-contract.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {
  RAFT_RS_SCHEMA_SQL,
  RAFT_RS_TABLE,
} from '../raft/raft-rs-durable-store-constants.js';
import {getPartitionDbPath} from '../storage/data-directory-manager.js';
import {
  deliveryAnswerOf,
  deliveryReadingOf,
} from '../transport/transport-semantic-outcome.js';
import {readLowerStateField} from '../utils/state-field-read.js';

const SELECT_HARD_STATE_TERM_SQL =
  `SELECT term FROM ${RAFT_RS_TABLE.HARD_STATE} WHERE group_id = ?`;
const SELECT_HARD_STATE_ROOTPAGE_SQL =
  'SELECT rootpage FROM sqlite_master WHERE type = \'table\' AND name = ?';
const PRAGMA_PAGE_SIZE = 'page_size';
const FILE_OPEN_READ_ONLY = 'r';
const WAL_FILE_SUFFIX = '-wal';
const SHM_FILE_SUFFIX = '-shm';
const JOURNAL_FILE_SUFFIX = '-journal';
const UTF8_ENCODING = 'utf8';
const SQLITE_HEADER_BYTES = 100;
const WAL_HEADER_BYTES = 32;
const SHM_HEADER_BYTES = 96;
const SHM_HALF_BYTES = 48;
const MIN_SQLITE_PAGE_SIZE = 512;
const MIN_TABLE_ROOTPAGE = 2;
const INLINE_ROW_OVERHEAD_BYTES = 64;
const LEAF_TABLE_BTREE_PAGE_TYPE = 0x0d;
const WAL_INDEX_FORMAT_VERSION = 3007000;
const ZERO_BIGINT = 0n;
const WAL_HEADER_BYTES_BIGINT = BigInt(WAL_HEADER_BYTES);
const SHM_HEADER_BYTES_BIGINT = BigInt(SHM_HEADER_BYTES);
const PHYSICAL_WITNESS_STATE = Object.freeze({
  OBSERVED: 'observed',
  UNAVAILABLE: 'unavailable',
});
const UNAVAILABLE_WITNESS_OUTCOME = Object.freeze({
  state: PHYSICAL_WITNESS_STATE.UNAVAILABLE,
});
const HARD_STATE_TERM_OUTCOME = Object.freeze({
  OBSERVED: 'observed',
  ABSENT: 'absent',
  UNREADABLE: 'unreadable',
});
const ABSENT_TERM_OUTCOME = Object.freeze({
  state: HARD_STATE_TERM_OUTCOME.ABSENT,
});
const TERM_FLOOR_CHECK_STATE = Object.freeze({
  ACCEPTED: 'accepted',
  BELOW_FLOOR: 'below_floor',
});
const INELIGIBLE_TERM_FLOOR = Object.freeze({
  eligible: false,
  hasLocalReplica: false,
  termFloor: null,
});
const REMOVED_SERVICE_STATUS = 'removed';
const SELF_LEADER_TERM_READ_UNAVAILABLE_LOG =
  'Failed closed reading local durable Raft term for self-published leader probe';

function positiveSafeTerm(value) {
  if (typeof value === 'bigint') {
    if (value <= ZERO_BIGINT || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return Number(value);
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function maxPositiveTerm(left, right) {
  const validLeft = positiveSafeTerm(left);
  const validRight = positiveSafeTerm(right);
  if (validLeft === null) return validRight;
  if (validRight === null) return validLeft;
  return Math.max(validLeft, validRight);
}

function statFileIdentity(filePath) {
  const stat = fs.statSync(filePath, {bigint: true, throwIfNoEntry: false});
  if (!stat) {
    return null;
  }
  return Object.freeze({
    ino: stat.ino,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  });
}

function fileStatsEqual(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

function buffersEqualOrBothNull(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.equals(right);
}

function readFileSlice(filePath, offset, length) {
  let fd;
  try {
    fd = fs.openSync(filePath, FILE_OPEN_READ_ONLY);
    const buffer = Buffer.allocUnsafe(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, offset);
    return bytesRead === length ?
      Object.freeze({state: PHYSICAL_WITNESS_STATE.OBSERVED, buffer}) :
      UNAVAILABLE_WITNESS_OUTCOME;
  } catch (error) {
    return Object.freeze({state: PHYSICAL_WITNESS_STATE.UNAVAILABLE, error});
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

function readDbHeaderAndRootPage(dbPath, pageSize, rootpage) {
  let fd;
  try {
    fd = fs.openSync(dbPath, FILE_OPEN_READ_ONLY);
    const dbHeader = Buffer.allocUnsafe(SQLITE_HEADER_BYTES);
    if (fs.readSync(fd, dbHeader, 0, SQLITE_HEADER_BYTES, 0) !== SQLITE_HEADER_BYTES) {
      return UNAVAILABLE_WITNESS_OUTCOME;
    }
    const rootPageBytes = Buffer.allocUnsafe(pageSize);
    const pageOffset = (rootpage - 1) * pageSize;
    if (
      fs.readSync(fd, rootPageBytes, 0, pageSize, pageOffset) !== pageSize ||
      rootPageBytes[0] !== LEAF_TABLE_BTREE_PAGE_TYPE
    ) {
      return UNAVAILABLE_WITNESS_OUTCOME;
    }
    return Object.freeze({
      state: PHYSICAL_WITNESS_STATE.OBSERVED,
      dbHeader,
      rootPageBytes,
    });
  } catch (error) {
    return Object.freeze({state: PHYSICAL_WITNESS_STATE.UNAVAILABLE, error});
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

function isValidWalIndexVersion(header) {
  return header.readUInt32LE(0) === WAL_INDEX_FORMAT_VERSION ||
    header.readUInt32BE(0) === WAL_INDEX_FORMAT_VERSION;
}

function readWalHeaderWitness(walPath, walStat) {
  if (walStat === null || walStat.size === ZERO_BIGINT) {
    return Object.freeze({state: PHYSICAL_WITNESS_STATE.OBSERVED, header: null});
  }
  if (walStat.size < WAL_HEADER_BYTES_BIGINT) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  const slice = readFileSlice(walPath, 0, WAL_HEADER_BYTES);
  if (slice.state !== PHYSICAL_WITNESS_STATE.OBSERVED) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  return Object.freeze({state: PHYSICAL_WITNESS_STATE.OBSERVED, header: slice.buffer});
}

function readShmHeaderWitness(shmPath, shmStat, hasNonEmptyWal) {
  if (shmStat === null) {
    return hasNonEmptyWal ?
      UNAVAILABLE_WITNESS_OUTCOME :
      Object.freeze({state: PHYSICAL_WITNESS_STATE.OBSERVED, header: null});
  }
  if (shmStat.size === ZERO_BIGINT) {
    return hasNonEmptyWal ?
      UNAVAILABLE_WITNESS_OUTCOME :
      Object.freeze({state: PHYSICAL_WITNESS_STATE.OBSERVED, header: null});
  }
  if (shmStat.size < SHM_HEADER_BYTES_BIGINT) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  const slice = readFileSlice(shmPath, 0, SHM_HEADER_BYTES);
  if (slice.state !== PHYSICAL_WITNESS_STATE.OBSERVED) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  const firstHalf = slice.buffer.subarray(0, SHM_HALF_BYTES);
  const secondHalf = slice.buffer.subarray(SHM_HALF_BYTES, SHM_HEADER_BYTES);
  if (!firstHalf.equals(secondHalf) || !isValidWalIndexVersion(firstHalf)) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  return Object.freeze({state: PHYSICAL_WITNESS_STATE.OBSERVED, header: firstHalf});
}

function captureDiskTermPhysicalWitness(dbPath, pageSize, rootpage) {
  const dbStat = statFileIdentity(dbPath);
  if (!dbStat || statFileIdentity(`${dbPath}${JOURNAL_FILE_SUFFIX}`) !== null) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  const walPath = `${dbPath}${WAL_FILE_SUFFIX}`;
  const shmPath = `${dbPath}${SHM_FILE_SUFFIX}`;
  const walStat = statFileIdentity(walPath);
  const shmStat = statFileIdentity(shmPath);
  const hasNonEmptyWal = walStat !== null && walStat.size > ZERO_BIGINT;
  const walWitness = readWalHeaderWitness(walPath, walStat);
  if (walWitness.state !== PHYSICAL_WITNESS_STATE.OBSERVED) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  const shmWitness = readShmHeaderWitness(shmPath, shmStat, hasNonEmptyWal);
  if (shmWitness.state !== PHYSICAL_WITNESS_STATE.OBSERVED) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  const dbPages = readDbHeaderAndRootPage(dbPath, pageSize, rootpage);
  if (dbPages.state !== PHYSICAL_WITNESS_STATE.OBSERVED) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  return Object.freeze({
    state: PHYSICAL_WITNESS_STATE.OBSERVED,
    witness: Object.freeze({
      pageSize,
      rootpage,
      dbStat,
      walStat,
      shmStat,
      dbHeader: dbPages.dbHeader,
      walHeader: walWitness.header,
      shmHeader: shmWitness.header,
      rootPageBytes: dbPages.rootPageBytes,
    }),
  });
}

function physicalWitnessesEqual(left, right) {
  return left.pageSize === right.pageSize &&
    left.rootpage === right.rootpage &&
    fileStatsEqual(left.dbStat, right.dbStat) &&
    fileStatsEqual(left.walStat, right.walStat) &&
    fileStatsEqual(left.shmStat, right.shmStat) &&
    left.dbHeader.equals(right.dbHeader) &&
    buffersEqualOrBothNull(left.walHeader, right.walHeader) &&
    buffersEqualOrBothNull(left.shmHeader, right.shmHeader) &&
    left.rootPageBytes.equals(right.rootPageBytes);
}

function readHardStateTableMetadataInDb(db, partitionId) {
  const pageSize = db.pragma(PRAGMA_PAGE_SIZE, {simple: true});
  const row = db.prepare(SELECT_HARD_STATE_ROOTPAGE_SQL)
    .get(RAFT_RS_TABLE.HARD_STATE);
  const rootpage = row?.rootpage;
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < MIN_SQLITE_PAGE_SIZE ||
    !Number.isSafeInteger(rootpage) ||
    rootpage < MIN_TABLE_ROOTPAGE ||
    Buffer.byteLength(partitionId, UTF8_ENCODING) + INLINE_ROW_OVERHEAD_BYTES >= pageSize
  ) {
    return UNAVAILABLE_WITNESS_OUTCOME;
  }
  return Object.freeze({
    state: PHYSICAL_WITNESS_STATE.OBSERVED,
    pageSize,
    rootpage,
  });
}

function queryHardStateTermInDb(db, partitionId) {
  const hasTable = db.prepare(RAFT_RS_SCHEMA_SQL.SELECT_TABLE_PRESENT)
    .get(RAFT_RS_TABLE.HARD_STATE) !== undefined;
  if (!hasTable) {
    return ABSENT_TERM_OUTCOME;
  }
  const row = db.prepare(SELECT_HARD_STATE_TERM_SQL).get(partitionId);
  const term = positiveSafeTerm(row?.term);
  return term !== null ?
    Object.freeze({state: HARD_STATE_TERM_OUTCOME.OBSERVED, term}) :
    ABSENT_TERM_OUTCOME;
}

function attachVerifiedPhysicalWitness(dbPath, tableMeta, witnessBefore, termOutcome) {
  if (
    termOutcome.state !== HARD_STATE_TERM_OUTCOME.OBSERVED ||
    tableMeta.state !== PHYSICAL_WITNESS_STATE.OBSERVED ||
    witnessBefore.state !== PHYSICAL_WITNESS_STATE.OBSERVED
  ) {
    return termOutcome;
  }
  const witnessAfter = captureDiskTermPhysicalWitness(
    dbPath,
    tableMeta.pageSize,
    tableMeta.rootpage,
  );
  if (
    witnessAfter.state !== PHYSICAL_WITNESS_STATE.OBSERVED ||
    !physicalWitnessesEqual(witnessBefore.witness, witnessAfter.witness)
  ) {
    return termOutcome;
  }
  return Object.freeze({
    state: HARD_STATE_TERM_OUTCOME.OBSERVED,
    term: termOutcome.term,
    witness: witnessAfter.witness,
  });
}

function readHardStateTermFromDbFile(dbPath, partitionId, logger) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return ABSENT_TERM_OUTCOME;
  }
  let db = null;
  let tableMeta = UNAVAILABLE_WITNESS_OUTCOME;
  let witnessBefore = UNAVAILABLE_WITNESS_OUTCOME;
  let termOutcome = ABSENT_TERM_OUTCOME;
  try {
    db = new Database(dbPath, {readonly: true, fileMustExist: true});
    tableMeta = readHardStateTableMetadataInDb(db, partitionId);
    if (tableMeta.state === PHYSICAL_WITNESS_STATE.OBSERVED) {
      witnessBefore = captureDiskTermPhysicalWitness(
        dbPath,
        tableMeta.pageSize,
        tableMeta.rootpage,
      );
    }
    termOutcome = queryHardStateTermInDb(db, partitionId);
  } catch (error) {
    logger?.debug?.(SELF_LEADER_TERM_READ_UNAVAILABLE_LOG, {
      partitionId,
      dbPath,
      error: error?.message || String(error),
    });
    return Object.freeze({state: HARD_STATE_TERM_OUTCOME.UNREADABLE, error});
  } finally {
    if (db?.open) {
      db.close();
    }
  }
  return attachVerifiedPhysicalWitness(dbPath, tableMeta, witnessBefore, termOutcome);
}

function ensureExecutorDiskTermMemo(executor) {
  if (!(executor.selfPublishedLeaderDiskTermMemo instanceof Map)) {
    executor.selfPublishedLeaderDiskTermMemo = new Map();
  }
  return executor.selfPublishedLeaderDiskTermMemo;
}

function lookupDiskTermMemo(executor, partitionId, memoKey, dbPath) {
  const byReplica = executor?.selfPublishedLeaderDiskTermMemo?.get(partitionId);
  const entry = byReplica?.get(memoKey);
  if (!entry) {
    return ABSENT_TERM_OUTCOME;
  }
  const current = captureDiskTermPhysicalWitness(
    dbPath,
    entry.witness.pageSize,
    entry.witness.rootpage,
  );
  if (
    current.state !== PHYSICAL_WITNESS_STATE.OBSERVED ||
    !physicalWitnessesEqual(entry.witness, current.witness)
  ) {
    byReplica.delete(memoKey);
    if (byReplica.size === 0) {
      executor.selfPublishedLeaderDiskTermMemo.delete(partitionId);
    }
    return ABSENT_TERM_OUTCOME;
  }
  return Object.freeze({
    state: HARD_STATE_TERM_OUTCOME.OBSERVED,
    term: entry.term,
  });
}

function storeDiskTermMemo(executor, partitionId, memoKey, term, witness) {
  const byPartition = ensureExecutorDiskTermMemo(executor);
  let byReplica = byPartition.get(partitionId);
  if (!byReplica) {
    byReplica = new Map();
    byPartition.set(partitionId, byReplica);
  }
  byReplica.set(memoKey, Object.freeze({term, witness}));
}

function invalidatePartitionDiskTermMemo(executor, partitionId) {
  executor?.selfPublishedLeaderDiskTermMemo?.delete(partitionId);
}

function isAuthoritativeLocalServiceRow(row, partitionId, nodeId) {
  if (!row || row.partition_id !== partitionId || row.node_id !== nodeId) {
    return false;
  }
  if (readLowerStateField(row.status) === REMOVED_SERVICE_STATUS) {
    return false;
  }
  return !row.service_type || row.service_type === SERVICE_TYPE.PARTITION;
}

function readPartitionServiceRows(executor, partitionId, routingSnapshot) {
  if (Array.isArray(routingSnapshot?.serviceRows)) {
    return routingSnapshot.serviceRows;
  }
  return executor?.systemCache?.filter?.(
    TABLES.SERVICES,
    (row) => row?.partition_id === partitionId,
  ) || [];
}

function collectAuthoritativeLocalReplicaIds(executor, partitionId, routingSnapshot) {
  const rows = readPartitionServiceRows(executor, partitionId, routingSnapshot);
  const replicaIds = new Set();
  for (const row of rows) {
    if (!isAuthoritativeLocalServiceRow(row, partitionId, executor.nodeId)) {
      continue;
    }
    const replicaId = row.service_id || row.replica_id || null;
    if (typeof replicaId === 'string' && replicaId.length > 0) {
      replicaIds.add(replicaId);
    }
  }
  return [...replicaIds];
}

function readReplicaDiskTerm(executor, partitionId, replicaId) {
  const dataDir = executor?.dataDir;
  if (!dataDir) {
    return ABSENT_TERM_OUTCOME;
  }
  const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
  const memoKey = `${dataDir}\0${replicaId}`;
  const memoized = lookupDiskTermMemo(executor, partitionId, memoKey, dbPath);
  if (memoized.state === HARD_STATE_TERM_OUTCOME.OBSERVED) {
    return memoized;
  }
  const outcome = readHardStateTermFromDbFile(dbPath, partitionId, executor.logger);
  if (outcome.state === HARD_STATE_TERM_OUTCOME.OBSERVED && outcome.witness) {
    storeDiskTermMemo(executor, partitionId, memoKey, outcome.term, outcome.witness);
  }
  return outcome;
}

function readDiskHardStateTermFloor(executor, partitionId, routingSnapshot) {
  if (!executor?.dataDir) {
    return ABSENT_TERM_OUTCOME;
  }
  const replicaIds = collectAuthoritativeLocalReplicaIds(
    executor,
    partitionId,
    routingSnapshot,
  );
  let maxTerm = null;
  for (const replicaId of replicaIds) {
    const outcome = readReplicaDiskTerm(executor, partitionId, replicaId);
    if (outcome.state === HARD_STATE_TERM_OUTCOME.OBSERVED) {
      maxTerm = maxPositiveTerm(maxTerm, outcome.term);
    }
  }
  return maxTerm !== null ?
    Object.freeze({state: HARD_STATE_TERM_OUTCOME.OBSERVED, term: maxTerm}) :
    ABSENT_TERM_OUTCOME;
}

function readPublishedLeaderClaimTerm(executor, partitionId) {
  const partitionRow = executor?.getPartitionRecord?.(partitionId) ?? null;
  return positiveSafeTerm(partitionRow?.[COLUMN.LEADER_CLAIM_RAFT_TERM]);
}

function isMatchingCoreAuthority(obs, partitionId, replicaId) {
  return obs?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    obs.groupId === partitionId &&
    obs.replicaIdentity === replicaId;
}

function observeLocalReplicasTermState(localReplicas, partitionId) {
  let isLocalLeader = false;
  let liveTerm = null;
  for (const replica of localReplicas) {
    const obs = replica?.raft?.observeCurrentAuthority?.() ?? null;
    if (!isMatchingCoreAuthority(obs, partitionId, replica?.replicaId)) {
      continue;
    }
    if (obs.role === RAFT_ROLE.LEADER) {
      isLocalLeader = true;
    }
    liveTerm = maxPositiveTerm(liveTerm, obs.term);
  }
  return {isLocalLeader, liveTerm};
}

function isSelfPublishedPartition(executor, partitionId, routingSnapshot) {
  const nodeId = executor?.nodeId;
  return Boolean(nodeId) &&
    Boolean(partitionId) &&
    routingSnapshot?.canonicalLeaderNodeId === nodeId;
}

function readLocalPartitionTermState(executor, partitionId, routingSnapshot) {
  const rawLocalReplicas = executor.getLocalPartitionReplicas?.(partitionId) ?? null;
  const localReplicas = Array.isArray(rawLocalReplicas) ? rawLocalReplicas : [];
  if (localReplicas.length > 0) {
    invalidatePartitionDiskTermMemo(executor, partitionId);
    const {isLocalLeader, liveTerm} = observeLocalReplicasTermState(
      localReplicas,
      partitionId,
    );
    return {hasLocalReplica: true, isLocalLeader, localTerm: liveTerm};
  }
  const diskOutcome = readDiskHardStateTermFloor(
    executor,
    partitionId,
    routingSnapshot,
  );
  return {
    hasLocalReplica: false,
    isLocalLeader: false,
    localTerm: diskOutcome.state === HARD_STATE_TERM_OUTCOME.OBSERVED ?
      diskOutcome.term :
      null,
  };
}

function resolveSelfPublishedLeaderTermFloor(executor, partitionId, routingSnapshot) {
  if (!isSelfPublishedPartition(executor, partitionId, routingSnapshot)) {
    return INELIGIBLE_TERM_FLOOR;
  }
  const {hasLocalReplica, isLocalLeader, localTerm} = readLocalPartitionTermState(
    executor,
    partitionId,
    routingSnapshot,
  );
  if (isLocalLeader || localTerm === null) {
    return INELIGIBLE_TERM_FLOOR;
  }
  const publishedClaimTerm = readPublishedLeaderClaimTerm(executor, partitionId);
  if (publishedClaimTerm !== null && localTerm < publishedClaimTerm) {
    return INELIGIBLE_TERM_FLOOR;
  }
  return Object.freeze({
    eligible: true,
    hasLocalReplica,
    termFloor: localTerm,
  });
}

function observeActiveSelfLeaderTermFloor(executor, partitionId, routingSnapshot) {
  if (!isSelfPublishedPartition(executor, partitionId, routingSnapshot)) {
    return null;
  }
  const {localTerm} = readLocalPartitionTermState(
    executor,
    partitionId,
    routingSnapshot,
  );
  const publishedClaimTerm = readPublishedLeaderClaimTerm(executor, partitionId);
  return maxPositiveTerm(localTerm, publishedClaimTerm);
}

function orderSelfLeaderProbeServices(orderedServices, nodeId, hasLocalReplica) {
  const own = orderedServices.filter((service) => service.node_id === nodeId);
  const peers = orderedServices.filter((service) => service.node_id !== nodeId);
  return hasLocalReplica ? [...own, ...peers] : [...peers, ...own];
}

function mergeSelfLeaderTermFloor(currentFloor, nextFloor) {
  return maxPositiveTerm(currentFloor, nextFloor);
}

function createInvocationTermFloorTracker(executor, partitionId) {
  let termFloor = null;
  return Object.freeze({
    observe(resolution) {
      const resolvedFloor = positiveSafeTerm(resolution?.selfPublishedLeaderTermFloor);
      if (resolvedFloor !== null) {
        termFloor = mergeSelfLeaderTermFloor(termFloor, resolvedFloor);
        return termFloor;
      }
      if (termFloor !== null && resolution?.routingSnapshot) {
        termFloor = mergeSelfLeaderTermFloor(
          termFloor,
          observeActiveSelfLeaderTermFloor(executor, partitionId, resolution.routingSnapshot),
        );
      }
      return termFloor;
    },
    merge(nextFloor) {
      termFloor = mergeSelfLeaderTermFloor(termFloor, nextFloor);
      return termFloor;
    },
    current() {
      return termFloor;
    },
  });
}

function checkDeliveryTermFloor(delivery, termFloor) {
  const validFloor = positiveSafeTerm(termFloor);
  if (validFloor === null) {
    return Object.freeze({state: TERM_FLOOR_CHECK_STATE.ACCEPTED});
  }
  const witnessTerm = positiveSafeTerm(
    deliveryAnswerOf(delivery)?.readAuthorityWitness?.term,
  );
  if (witnessTerm !== null && witnessTerm >= validFloor) {
    return Object.freeze({state: TERM_FLOOR_CHECK_STATE.ACCEPTED});
  }
  return Object.freeze({
    state: TERM_FLOOR_CHECK_STATE.BELOW_FLOOR,
    failure: {
      success: false,
      error: OWNER_FACT_UNAVAILABLE_REASON.BELOW_TERM_FLOOR,
      failureCode: OWNER_FACT_UNAVAILABLE_REASON.BELOW_TERM_FLOOR,
    },
  });
}

function evaluateTermFloorDeliveryOutcome(
  delivery,
  isSuccessfulResponse,
  termFloor,
) {
  const succeeded = Boolean(isSuccessfulResponse(delivery));
  if (!succeeded) {
    return {accepted: false, response: deliveryReadingOf(delivery)};
  }
  const check = checkDeliveryTermFloor(delivery, termFloor);
  return check.state === TERM_FLOOR_CHECK_STATE.ACCEPTED ?
    {accepted: true, response: deliveryReadingOf(delivery)} :
    {accepted: false, response: check.failure};
}

function shouldRetainTermFloorFailure(currentDetails, nextFailure) {
  if (currentDetails?.failureCode !== OWNER_FACT_UNAVAILABLE_REASON.BELOW_TERM_FLOOR) {
    return false;
  }
  const nextCode = nextFailure?.failureCode ?? null;
  return nextCode === null || nextCode === OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER;
}

export {
  createInvocationTermFloorTracker,
  evaluateTermFloorDeliveryOutcome,
  mergeSelfLeaderTermFloor,
  orderSelfLeaderProbeServices,
  resolveSelfPublishedLeaderTermFloor,
  shouldRetainTermFloorFailure,
};
