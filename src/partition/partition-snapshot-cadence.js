// Leader checkpoint cadence owner (quest raft-snapshot-live-rebuild, spec
// solve/specs/raft-snapshot-transfer-install/live-rebuild-design.md, S6
// Phase A link 1; raft-rs ownership in SN1 / F5). A tick riding the existing
// 1s prepared-state-hold sweep
// (partition-service-participant-transaction-cadence-methods.js). The sweep
// fires on ALL roles every second and checkpoint creation is async and can
// exceed a second, so THE TICK owns its own role gate (leader-only,
// re-checked after the creation await since role can change mid-creation) AND
// an in-flight flag. In-memory and control-plane partitions are typed
// refusals. On fire: one S1 checkpoint with the cache-derived identity and
// raft-rs group witness, the S5 retention sweep with the FULL pin set, and
// proof-gated compaction on the raft-rs durable store.
//
// Decision table (evaluated top-down, first row wins):
//   in-memory dbPath or control-plane partition -> UNSUPPORTED_PARTITION
//   tick already in flight                      -> ALREADY_IN_FLIGHT
//   role !== leader, shut down, or db closed    -> NOT_LEADER
//   no raft-rs durable record present           -> COMMITTED_LOG_UNSUPPORTED
//   entries < entryThreshold AND logBytes < byteThreshold:
//     valid uncompacted checkpoint exists       -> COMPACTED / CHECKPOINTED
//     otherwise                                 -> BELOW_THRESHOLD
//   creation outcome !== CREATED                -> CREATION_REFUSED
//   role lost across the creation await         -> LEADERSHIP_LOST_MID_CREATION
//   compaction outcome === COMPACTED            -> COMPACTED (+ sweep)
//   otherwise                                   -> CHECKPOINTED (+ sweep)

import fs from 'node:fs';
import path from 'node:path';

import {CONFIG_KEY} from '../config/config-key-constants.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_COMPACTION_OUTCOME} from '../raft/compaction-policy.js';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {
  buildSnapshotCatchupIdentityFromCache,
  listInFlightGenerationIndexes,
} from '../raft/snapshot-catchup.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../raft/snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
  readCheckpoint,
} from '../raft/snapshot-checkpoint-store.js';
import {
  compactRaftRsCommittedEntries,
} from '../raft/snapshot-compaction.js';
import {resolveReplicaCheckpointsRoot} from '../raft/snapshot-install.js';
import {
  gatherRetentionPins,
  sweepCheckpointGenerations,
} from '../raft/snapshot-retention.js';

import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  CONTROL_PLANE_PARTITION_IDS,
  PARTITION_SERVICE_DEFAULT,
} = PARTITION_SERVICE_SHARED;

// Typed outcomes of one cadence tick.
const RAFT_SNAPSHOT_CADENCE_OUTCOME = Object.freeze({
  CHECKPOINTED: 'checkpointed',
  COMPACTED: 'compacted',
  BELOW_THRESHOLD: 'below_threshold',
  NOT_LEADER: 'not_leader',
  ALREADY_IN_FLIGHT: 'already_in_flight',
  UNSUPPORTED_PARTITION: 'unsupported_partition',
  COMMITTED_LOG_UNSUPPORTED: 'committed_log_unsupported',
  CREATION_REFUSED: 'creation_refused',
  LEADERSHIP_LOST_MID_CREATION: 'leadership_lost_mid_creation',
  TICK_FAILED: 'tick_failed',
});

const CADENCE_KIB = 1024;
const CADENCE_MIB = CADENCE_KIB * CADENCE_KIB;
const UTF8_ENCODING = 'utf8';
const RAFT_SNAPSHOT_CADENCE_DEFAULT = Object.freeze({
  ENTRY_THRESHOLD: 10000,
  BYTE_THRESHOLD_BYTES: 256 * CADENCE_MIB,
});

function tickResult(outcome, extra = {}) {
  return Object.freeze({outcome, ...extra});
}

function resolveEntryThreshold(injected) {
  if (Number.isSafeInteger(injected) && injected > 0) {
    return injected;
  }
  const configured = ConfigurationManager.getInstance()
    .get(CONFIG_KEY.RAFT_SNAPSHOT_THRESHOLD);
  return Number.isSafeInteger(configured) && configured > 0 ?
    configured :
    RAFT_SNAPSHOT_CADENCE_DEFAULT.ENTRY_THRESHOLD;
}

function resolveByteThreshold(injected) {
  return Number.isSafeInteger(injected) && injected > 0 ?
    injected :
    RAFT_SNAPSHOT_CADENCE_DEFAULT.BYTE_THRESHOLD_BYTES;
}

function isValidUncompactedCheckpoint(
  service,
  record,
  checkpointDir,
  generationIndex,
) {
  const validation = readCheckpoint({checkpointDir});
  if (validation.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID) {
    return null;
  }
  const {descriptor} = validation;
  if (descriptor.lastIncludedIndex !== generationIndex) {
    return null;
  }
  if (descriptor.raftRs && descriptor.raftRs.groupId !== service.partitionId) {
    return null;
  }
  const entry = record.entries.find(
    ({index}) => Number(index) === generationIndex);
  if (!entry || Number(entry.term) !== descriptor.lastIncludedTerm) {
    return null;
  }
  return {checkpointDir, descriptor};
}

function inspectCheckpointCoverage(
  service,
  checkpointsRoot,
  record,
  committedIndex,
) {
  const compactedIndex = Number(RaftRsDurableStore.readSnapshotIndexIn(
    service.db, service.partitionId));
  const generations = listCheckpointGenerations(checkpointsRoot);
  const pinned = new Set(gatherRetentionPins({
    checkpointsRoot,
    inProcessPins: listInFlightGenerationIndexes(),
  }));
  let uncompactedCheckpoint = null;
  for (const generationIndex of generations) {
    if (generationIndex <= compactedIndex) {
      continue;
    }
    const checkpointDir = path.join(checkpointsRoot, String(generationIndex));
    const valid = generationIndex <= committedIndex ?
      isValidUncompactedCheckpoint(
        service, record, checkpointDir, generationIndex) :
      null;
    if (valid) {
      uncompactedCheckpoint = valid;
    } else if (!pinned.has(generationIndex)) {
      fs.rmSync(checkpointDir, {recursive: true, force: true});
    }
  }
  const checkpointedIndex = uncompactedCheckpoint ?
    uncompactedCheckpoint.descriptor.lastIncludedIndex :
    compactedIndex;
  return {
    compactedIndex,
    checkpointedIndex,
    uncompactedCheckpoint,
  };
}

function measureEntryBytes(entry) {
  if (typeof entry?.data === 'string') {
    return Buffer.byteLength(entry.data, UTF8_ENCODING);
  }
  if (entry?.data instanceof Uint8Array) {
    return entry.data.byteLength;
  }
  return 0;
}

function computePendingLogBytes(
  service,
  record,
  checkpointedIndex,
  committedIndex,
) {
  if (committedIndex <= checkpointedIndex) {
    return 0;
  }
  if (Number.isFinite(service.pendingLogBytes) &&
      service.pendingLogBytes >= 0) {
    return service.pendingLogBytes;
  }
  let totalBytes = 0;
  for (const entry of record.entries) {
    const index = Number(entry.index);
    if (index > checkpointedIndex && index <= committedIndex) {
      totalBytes += measureEntryBytes(entry);
    }
  }
  return totalBytes;
}

function isUnsupportedPartition(service) {
  return service.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH ||
    CONTROL_PLANE_PARTITION_IDS.has(service.partitionId);
}

function isLeaderReady(service) {
  return service.role === RAFT_ROLE.LEADER &&
    !service.isShutdown &&
    Boolean(service.db?.open);
}

function compactToGeneration(service, creation) {
  return compactRaftRsCommittedEntries(
    service.db,
    service.partitionId,
    {
      toIndex: creation.descriptor.lastIncludedIndex,
      proof: {checkpointDir: creation.checkpointDir},
    },
  );
}

function evaluateCadenceThresholds(service, options, checkpointsRoot, record) {
  const committedIndex = Number(record.appliedIndex);
  const coverage = inspectCheckpointCoverage(
    service, checkpointsRoot, record, committedIndex);
  const pendingEntryCount = Math.max(
    0, committedIndex - coverage.checkpointedIndex);
  const pendingLogBytes = computePendingLogBytes(
    service, record, coverage.checkpointedIndex, committedIndex);
  const entryThreshold = resolveEntryThreshold(options.entryThreshold);
  const byteThresholdBytes =
    resolveByteThreshold(options.byteThresholdBytes);
  const overEntryThreshold = pendingEntryCount >= entryThreshold;
  const overByteThreshold = pendingLogBytes >= byteThresholdBytes;
  return {
    ...coverage,
    pendingEntryCount,
    pendingLogBytes,
    entryThreshold,
    byteThresholdBytes,
    belowThreshold: pendingEntryCount <= 0 ||
      (!overEntryThreshold && !overByteThreshold),
  };
}

function resolveCadenceIdentity(service) {
  return buildSnapshotCatchupIdentityFromCache({
    partitionId: service.partitionId,
    tableName: service.tableName || service.tableId || service.partitionId,
    systemTableCache: service.systemTableCache,
  });
}

function sweepAndCompactCheckpoint(service, checkpointsRoot, creation) {
  const sweep = sweepCheckpointGenerations({
    checkpointsRoot,
    pinnedGenerationIndexes: gatherRetentionPins({
      checkpointsRoot,
      inProcessPins: listInFlightGenerationIndexes(),
    }),
  });
  const compaction = compactToGeneration(service, creation);
  const compacted =
    compaction.outcome === RAFT_COMPACTION_OUTCOME.COMPACTED;
  const targetIndex = creation.descriptor.lastIncludedIndex;
  const compactedIndex = compacted ?
    targetIndex :
    Number(RaftRsDurableStore.readSnapshotIndexIn(
      service.db, service.partitionId));
  return tickResult(
    compacted ?
      RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED :
      RAFT_SNAPSHOT_CADENCE_OUTCOME.CHECKPOINTED,
    {
      creation,
      sweep,
      compaction,
      checkpointedIndex: targetIndex,
      compactedIndex,
      ...(compacted ? {compactedUpToIndex: targetIndex} : {}),
    },
  );
}

async function runCheckpointAndCompaction(
  service,
  checkpointsRoot,
  identity,
  options,
) {
  const creation = await createSqliteStateMachineCheckpoint({
    db: service.db,
    identity,
    checkpointsRoot,
    raftRsGroupId: service.partitionId,
    inProcessPins: listInFlightGenerationIndexes(),
  });
  if (creation.outcome !== RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED) {
    return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.CREATION_REFUSED, {
      creation,
    });
  }
  await options?.onAfterCreateCheckpoint?.(creation);
  if (!isLeaderReady(service)) {
    return tickResult(
      RAFT_SNAPSHOT_CADENCE_OUTCOME.LEADERSHIP_LOST_MID_CREATION,
      {
        creation,
        checkpointedIndex: creation.descriptor.lastIncludedIndex,
      },
    );
  }
  return sweepAndCompactCheckpoint(service, checkpointsRoot, creation);
}

/**
 * Create the checkpoint cadence owner for one partition service. The
 * returned tick NEVER rejects — every path is a typed frozen outcome, so the
 * fire-and-forget sweep call site cannot leak a rejection.
 * @param {Object} options cadence options
 * @param {Object} options.service the owning PartitionService
 * @param {number} [options.entryThreshold] committed-entry trigger override
 * @param {number} [options.byteThresholdBytes] pending-log-byte trigger override
 * @param {Function} [options.onAfterCreateCheckpoint] optional hook after creation
 * @return {Object} frozen {tick(nowMs), isInFlight()}
 */
function createPartitionSnapshotCadence(options) {
  const {service} = options;
  const state = {inFlight: false};

  const evaluate = async (_nowMs) => {
    if (isUnsupportedPartition(service)) {
      return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.UNSUPPORTED_PARTITION, {
        partitionId: service.partitionId,
      });
    }
    if (state.inFlight) {
      return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.ALREADY_IN_FLIGHT);
    }
    if (!isLeaderReady(service)) {
      return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.NOT_LEADER, {
        role: service.role,
      });
    }
    if (!RaftRsDurableStore.hasDurableRecordIn(
      service.db, service.partitionId)) {
      return tickResult(
        RAFT_SNAPSHOT_CADENCE_OUTCOME.COMMITTED_LOG_UNSUPPORTED, {
          partitionId: service.partitionId,
        });
    }
    const checkpointsRoot = resolveReplicaCheckpointsRoot(service.dbPath);
    const record = RaftRsDurableStore.readDurableRecordIn(
      service.db, service.partitionId);
    const thresholds = evaluateCadenceThresholds(
      service, options, checkpointsRoot, record);
    if (thresholds.belowThreshold && !thresholds.uncompactedCheckpoint) {
      return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.BELOW_THRESHOLD, {
        checkpointedIndex: thresholds.checkpointedIndex,
        compactedIndex: thresholds.compactedIndex,
        pendingEntryCount: thresholds.pendingEntryCount,
        pendingLogBytes: thresholds.pendingLogBytes,
        entryThreshold: thresholds.entryThreshold,
        byteThresholdBytes: thresholds.byteThresholdBytes,
      });
    }
    state.inFlight = true;
    try {
      if (thresholds.belowThreshold) {
        return sweepAndCompactCheckpoint(
          service, checkpointsRoot, thresholds.uncompactedCheckpoint);
      }
      const identity = resolveCadenceIdentity(service);
      return await runCheckpointAndCompaction(
        service, checkpointsRoot, identity, options);
    } finally {
      state.inFlight = false;
    }
  };

  return Object.freeze({
    async tick(nowMs) {
      try {
        return await evaluate(nowMs);
      } catch (error) {
        return tickResult(RAFT_SNAPSHOT_CADENCE_OUTCOME.TICK_FAILED, {
          detail: error?.message,
        });
      }
    },
    isInFlight() {
      return state.inFlight;
    },
  });
}

const DEFAULT_SERVICE_SNAPSHOT_THRESHOLD = 10000;
const WAL_CHECKPOINT_TRUNCATE_PRAGMA = 'wal_checkpoint(TRUNCATE)';
const CADENCE_STATUS_COMPACTED = 'compacted';
const CADENCE_STATUS_SKIPPED = 'skipped';
const CADENCE_STATUS_FAILED = 'failed';
const CADENCE_REASON_CANNOT_COMPACT = 'cannot_compact';
const CADENCE_REASON_BELOW_THRESHOLD = 'below_threshold';

function hasDurableCompactionSupport(service) {
  return Boolean(
    service?.durableCheckpointingEnabled === true ||
    service?.durableCheckpointing === true ||
    service?.db,
  );
}

function resolveCompactionTargetFn(service) {
  if (!service) return null;
  if (service.raftBackend === null) {
    return typeof service.raft?.compactLog === 'function' ?
      (idx) => service.raft.compactLog(idx) :
      null;
  }
  if (typeof service.compactDurableRaftLog === 'function') {
    return (idx) => service.compactDurableRaftLog(idx);
  }
  if (typeof service.raftBackend?.compactLog === 'function') {
    return (idx) => service.raftBackend.compactLog(idx);
  }
  if (typeof service.raft?.compactLog === 'function' &&
      hasDurableCompactionSupport(service)) {
    return (idx) => service.raft.compactLog(idx);
  }
  return null;
}

/**
 * Whether a partition service can compact its Raft log.
 * @param {Object} service - The PartitionService instance.
 * @return {boolean} Whether log compaction is supported.
 */
function canCompactPartitionRaftLog(service) {
  return resolveCompactionTargetFn(service) !== null;
}

function resolveServiceSnapshotThreshold(service) {
  return Number.isSafeInteger(service?.snapshotThreshold) &&
    service.snapshotThreshold > 0 ?
    service.snapshotThreshold :
    DEFAULT_SERVICE_SNAPSHOT_THRESHOLD;
}

function resolveServiceCommitIndex(service) {
  const candidates = [
    service?.lastCommittedIndex,
    service?.lastIncludedIndex,
    service?.commitIndex,
    service?.raft?.commitIndex,
    service?.raft?.lastApplied,
    service?.lastCheckpointedCommitIndex,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }
  return 0;
}

function runServiceLogCompaction(service, compactFn, commitIndex) {
  if (service.raftBackend !== null && typeof service.db?.pragma === 'function') {
    service.db.pragma(WAL_CHECKPOINT_TRUNCATE_PRAGMA);
  }
  const compactionResult = compactFn(commitIndex);
  service.lastCheckpointedCommitIndex = commitIndex;
  service.committedWritesSinceSnapshot = 0;
  return {
    status: CADENCE_STATUS_COMPACTED,
    commitIndex,
    compactionResult,
  };
}

/**
 * Evaluate snapshot cadence and compact the Raft log if eligible.
 * @param {Object} service - The PartitionService instance.
 * @return {Object} Evaluated cadence outcome.
 */
function evaluatePartitionSnapshotCadence(service) {
  const compactFn = resolveCompactionTargetFn(service);
  const threshold = resolveServiceSnapshotThreshold(service);
  const writes = service?.committedWritesSinceSnapshot;
  if (!compactFn) {
    return {status: CADENCE_STATUS_SKIPPED, reason: CADENCE_REASON_CANNOT_COMPACT};
  } else if (typeof writes === 'number' && writes < threshold) {
    return {
      status: CADENCE_STATUS_SKIPPED,
      reason: CADENCE_REASON_BELOW_THRESHOLD,
      committedWritesSinceSnapshot: writes,
      threshold,
    };
  }
  const commitIndex = resolveServiceCommitIndex(service);
  try {
    return runServiceLogCompaction(service, compactFn, commitIndex);
  } catch (error) {
    return {
      status: CADENCE_STATUS_FAILED,
      error: error?.message || String(error),
      commitIndex,
    };
  }
}

export {
  RAFT_SNAPSHOT_CADENCE_OUTCOME,
  canCompactPartitionRaftLog,
  createPartitionSnapshotCadence,
  evaluatePartitionSnapshotCadence,
};
