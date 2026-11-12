// The checkpoint cadence's readings (extracted from
// partition-snapshot-cadence.js, which decides with them): whether the
// partition is one the cadence serves and this replica its ready leader, the
// checkpoint identity, how many committed
// entries and log bytes lie past the newest valid checkpoint of a partition
// leader, which uncompacted generation (if any) already covers its log, and
// whether either trigger is reached. Generations past the compacted boundary
// that the checkpoint reader refuses, and that no transfer or install pins,
// are removed here.

import fs from 'node:fs';
import path from 'node:path';

import {CONFIG_KEY} from '../config/config-key-constants.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {
  buildSnapshotCatchupIdentityFromCache,
  listInFlightGenerationIndexes,
} from '../raft/snapshot-catchup.js';
import {
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../raft/snapshot-checkpoint-constants.js';
import {
  listCheckpointGenerations,
  readCheckpoint,
} from '../raft/snapshot-checkpoint-store.js';
import {gatherRetentionPins} from '../raft/snapshot-retention.js';

import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  CONTROL_PLANE_PARTITION_IDS,
  PARTITION_SERVICE_DEFAULT,
} = PARTITION_SERVICE_SHARED;

const CADENCE_KIB = 1024;
const CADENCE_MIB = CADENCE_KIB * CADENCE_KIB;
const UTF8_ENCODING = 'utf8';
const RAFT_SNAPSHOT_CADENCE_DEFAULT = Object.freeze({
  ENTRY_THRESHOLD: 10000,
  BYTE_THRESHOLD_BYTES: 256 * CADENCE_MIB,
});
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

function isUnsupportedPartition(service) {
  return service.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH ||
    CONTROL_PLANE_PARTITION_IDS.has(service.partitionId);
}

function isLeaderReady(service) {
  return service.role === RAFT_ROLE.LEADER &&
    !service.isShutdown &&
    Boolean(service.db?.open);
}

function resolveCadenceIdentity(service) {
  return buildSnapshotCatchupIdentityFromCache({
    partitionId: service.partitionId,
    tableName: service.tableName || service.tableId || service.partitionId,
    systemTableCache: service.systemTableCache,
  });
}

export {
  evaluateCadenceThresholds,
  isLeaderReady,
  isUnsupportedPartition,
  resolveCadenceIdentity,
};
