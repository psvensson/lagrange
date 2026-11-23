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
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
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

function readHardStateTermFromDbFile(dbPath, partitionId, logger) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return ABSENT_TERM_OUTCOME;
  }
  let db = null;
  try {
    db = new Database(dbPath, {readonly: true, fileMustExist: true});
    return queryHardStateTermInDb(db, partitionId);
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
}

function ensureExecutorDiskTermMemo(executor) {
  if (!(executor.selfPublishedLeaderDiskTermMemo instanceof Map)) {
    executor.selfPublishedLeaderDiskTermMemo = new Map();
  }
  return executor.selfPublishedLeaderDiskTermMemo;
}

function lookupDiskTermMemo(executor, partitionId, memoKey) {
  const byReplica = executor?.selfPublishedLeaderDiskTermMemo?.get(partitionId);
  if (!byReplica || !byReplica.has(memoKey)) {
    return ABSENT_TERM_OUTCOME;
  }
  return Object.freeze({
    state: HARD_STATE_TERM_OUTCOME.OBSERVED,
    term: byReplica.get(memoKey),
  });
}

function storeDiskTermMemo(executor, partitionId, memoKey, term) {
  const byPartition = ensureExecutorDiskTermMemo(executor);
  let byReplica = byPartition.get(partitionId);
  if (!byReplica) {
    byReplica = new Map();
    byPartition.set(partitionId, byReplica);
  }
  byReplica.set(memoKey, term);
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
  const memoKey = `${dataDir}\0${replicaId}`;
  const memoized = lookupDiskTermMemo(executor, partitionId, memoKey);
  if (memoized.state === HARD_STATE_TERM_OUTCOME.OBSERVED) {
    return memoized;
  }
  const dbPath = getPartitionDbPath(dataDir, partitionId, replicaId);
  const outcome = readHardStateTermFromDbFile(dbPath, partitionId, executor.logger);
  if (outcome.state === HARD_STATE_TERM_OUTCOME.OBSERVED) {
    storeDiskTermMemo(executor, partitionId, memoKey, outcome.term);
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
  let liveTerm = null;
  for (const replica of localReplicas) {
    const obs = replica?.raft?.observeCurrentAuthority?.() ?? null;
    if (!isMatchingCoreAuthority(obs, partitionId, replica?.replicaId)) {
      continue;
    }
    if (obs.role === RAFT_ROLE.LEADER) {
      return {isLocalLeader: true, liveTerm: null};
    }
    liveTerm = maxPositiveTerm(liveTerm, obs.term);
  }
  return {isLocalLeader: false, liveTerm};
}

function isSelfPublishedPartition(executor, partitionId, routingSnapshot) {
  const nodeId = executor?.nodeId;
  return Boolean(nodeId) &&
    Boolean(partitionId) &&
    routingSnapshot?.canonicalLeaderNodeId === nodeId;
}

function resolveSelfPublishedLeaderTermFloor(executor, partitionId, routingSnapshot) {
  if (!isSelfPublishedPartition(executor, partitionId, routingSnapshot)) {
    return INELIGIBLE_TERM_FLOOR;
  }
  const rawLocalReplicas = executor.getLocalPartitionReplicas?.(partitionId) ?? null;
  const localReplicas = Array.isArray(rawLocalReplicas) ? rawLocalReplicas : [];
  let localTerm = null;
  if (localReplicas.length > 0) {
    invalidatePartitionDiskTermMemo(executor, partitionId);
    const {isLocalLeader, liveTerm} = observeLocalReplicasTermState(
      localReplicas,
      partitionId,
    );
    if (isLocalLeader) {
      return INELIGIBLE_TERM_FLOOR;
    }
    localTerm = liveTerm;
  } else {
    const diskOutcome = readDiskHardStateTermFloor(
      executor,
      partitionId,
      routingSnapshot,
    );
    localTerm = diskOutcome.state === HARD_STATE_TERM_OUTCOME.OBSERVED ?
      diskOutcome.term :
      null;
  }
  if (localTerm === null) {
    return INELIGIBLE_TERM_FLOOR;
  }
  const publishedClaimTerm = readPublishedLeaderClaimTerm(executor, partitionId);
  if (publishedClaimTerm !== null && localTerm < publishedClaimTerm) {
    return INELIGIBLE_TERM_FLOOR;
  }
  return Object.freeze({
    eligible: true,
    hasLocalReplica: localReplicas.length > 0,
    termFloor: localTerm,
  });
}

function orderSelfLeaderProbeServices(orderedServices, nodeId, hasLocalReplica) {
  const own = orderedServices.filter((service) => service.node_id === nodeId);
  const peers = orderedServices.filter((service) => service.node_id !== nodeId);
  return hasLocalReplica ? [...own, ...peers] : [...peers, ...own];
}

function mergeSelfLeaderTermFloor(currentFloor, nextFloor) {
  return maxPositiveTerm(currentFloor, nextFloor);
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
  evaluateTermFloorDeliveryOutcome,
  mergeSelfLeaderTermFloor,
  orderSelfLeaderProbeServices,
  resolveSelfPublishedLeaderTermFloor,
  shouldRetainTermFloorFailure,
};
