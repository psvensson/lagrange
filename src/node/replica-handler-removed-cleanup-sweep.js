/**
 * Startup sweep owning removed-replica cleanup debt (rebalancer safety-audit
 * finding 12).
 *
 * A replica removal atomically replaces the exact durable REMOVING row with
 * a non-routable cleanup marker before touching storage. A failed cleanup
 * (or a crash in between) retains that marker so a later startup can resume
 * the exact token without exposing an ownership gap. Historical row-less
 * artifacts are discovery inputs only: the sweep must win an INSERT-only
 * marker before it may delete them.
 *
 * Startup first freezes the local node's persisted markers behind an
 * admission barrier. Only those frozen tokens may resume; ordinary disk
 * candidates must acquire their own marker and never borrow another
 * claimant's token. Quarantined evidence is not re-deleted. Partial or
 * unknown deletion retains the marker for the next startup. An unreadable
 * partitions directory fails closed rather than deleting against ambiguous
 * evidence.
 */

import {SERVICE_TYPE} from '../constants/index.js';
import {
  REPLICA_CLEANUP_ACQUIRE_OUTCOME,
} from './replica-cleanup-tombstone-owner.js';
import {replicaStorageArtifactsAbsent} from './replica-storage-artifacts.js';

const LOCAL_DB_EXT_LENGTH = '.db'.length;
const QUARANTINED_SUFFIX = '.quarantined';
const REPLICA_STORAGE_ARTIFACT_SUFFIXES = Object.freeze([
  '',
  '-wal',
  '-shm',
  '-journal',
]);
const LOCAL_ZERO = 0;

function buildReplicaFileName(replicaId, storageDefault) {
  return `${replicaId}${storageDefault.DB_EXT}`;
}

function buildAssignedReplicaFileKeys(handler, systemTableName, storageDefault) {
  const keys = new Set();
  const rows = handler.systemTableCache.filter(
    systemTableName.SERVICES,
    (row) =>
      row.node_id === handler.nodeId &&
      row.service_type === SERVICE_TYPE.PARTITION &&
      typeof row.partition_id === 'string' &&
      row.partition_id.length > LOCAL_ZERO &&
      typeof (row.replica_id || row.service_id) === 'string' &&
      (row.replica_id || row.service_id).length > LOCAL_ZERO,
  );
  for (const row of rows) {
    keys.add(`${row.partition_id}/${buildReplicaFileName(
      row.replica_id || row.service_id,
      storageDefault,
    )}`);
  }
  return keys;
}

function listOnDiskReplicaDbFiles(partitionsDir, fs, path, storageDefault) {
  const files = [];
  let partitionEntries;
  try {
    partitionEntries = fs.readdirSync(partitionsDir, {withFileTypes: true});
  } catch (_error) {
    return {files, partitionsDirReadable: false};
  }
  for (const partitionEntry of partitionEntries) {
    if (!partitionEntry.isDirectory()) {
      continue;
    }
    let replicaEntries;
    try {
      replicaEntries = fs.readdirSync(
        path.join(partitionsDir, partitionEntry.name),
        {withFileTypes: true},
      );
    } catch (_error) {
      return {files, partitionsDirReadable: false};
    }
    const keys = new Set();
    for (const replicaEntry of replicaEntries) {
      if (!replicaEntry.isFile()) continue;
      const dbIndex = replicaEntry.name.indexOf(storageDefault.DB_EXT);
      if (dbIndex <= LOCAL_ZERO) continue;
      const suffix = replicaEntry.name.slice(
        dbIndex + storageDefault.DB_EXT.length,
      );
      if (!REPLICA_STORAGE_ARTIFACT_SUFFIXES.includes(suffix)) continue;
      keys.add(`${partitionEntry.name}/` +
        replicaEntry.name.slice(LOCAL_ZERO,
          dbIndex + storageDefault.DB_EXT.length));
    }
    files.push(...keys);
  }
  return {files, partitionsDirReadable: true};
}

function hasVisibleOrphanFiles(partitionsDir, key, fs, path) {
  const dbPath = path.join(partitionsDir, key);
  return !replicaStorageArtifactsAbsent(fs, dbPath);
}

function parseReplicaFileKey(key) {
  const separatorIndex = key.indexOf('/');
  if (separatorIndex <= LOCAL_ZERO ||
    separatorIndex === key.length - LOCAL_DB_EXT_LENGTH - 1) {
    return {partitionId: '', replicaId: ''};
  }
  const partitionId = key.slice(LOCAL_ZERO, separatorIndex);
  const fileName = key.slice(separatorIndex + 1);
  const replicaId = fileName.slice(
    LOCAL_ZERO,
    fileName.length - LOCAL_DB_EXT_LENGTH,
  );
  return {partitionId, replicaId};
}

async function resolveSweepCleanupAuthority(owner, startupAuthorities,
  handler, replicaId, partitionId) {
  const resumed = await owner.resumePersistedAtStartup(
    startupAuthorities,
    {replicaId, partitionId, nodeId: handler.nodeId},
  );
  if (resumed) return resumed;
  const acquired = await owner.acquire({
    replicaId,
    partitionId,
    nodeId: handler.nodeId,
    reason: 'startup_orphan_cleanup',
  });
  if (acquired.outcome === REPLICA_CLEANUP_ACQUIRE_OUTCOME.LIVE_GENERATION) {
    return false;
  }
  return acquired.outcome === REPLICA_CLEANUP_ACQUIRE_OUTCOME.ACQUIRED ?
    acquired.authority : null;
}

async function completeSweepCleanup(owner, authority, fs, dbPath) {
  if (!replicaStorageArtifactsAbsent(fs, dbPath)) return false;
  if (!await owner.requireCurrent(authority)) return false;
  return owner.release(authority, {artifactsAbsent: true});
}

/**
 * Run the removed-replica cleanup-debt sweep for one handler.
 * @param {Object} handler ReplicaHandler instance (method receiver shape).
 * @param {Object} options Injected runtime modules/constants (fs, path,
 *   REPLICA_HANDLER_LOG_MSG, STORAGE_DEFAULT, SYSTEM_TABLE_NAME).
 * @return {Promise<Object>} Sweep report
 *   ({sweepCompleted, candidates, deleted, failed}).
 */
async function sweepRemovedReplicaCleanupDebt(
  handler,
  options,
  startupAuthorities = new Map(),
) {
  const {
    fs,
    path,
    REPLICA_HANDLER_LOG_MSG,
    STORAGE_DEFAULT,
    SYSTEM_TABLE_NAME,
  } = options;
  const partitionsDir = path.join(
    handler.dataDir,
    STORAGE_DEFAULT.PARTITIONS_DIRNAME,
  );
  const onDisk = listOnDiskReplicaDbFiles(
    partitionsDir,
    fs,
    path,
    STORAGE_DEFAULT,
  );
  if (!onDisk.partitionsDirReadable) {
    handler.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVED_CLEANUP_SWEEP_SKIPPED, {
      partitionsDir,
      nodeId: handler.nodeId,
    });
    return {
      sweepCompleted: false,
      candidates: LOCAL_ZERO,
      deleted: LOCAL_ZERO,
      failed: LOCAL_ZERO,
    };
  }
  const assigned = buildAssignedReplicaFileKeys(
    handler,
    SYSTEM_TABLE_NAME,
    STORAGE_DEFAULT,
  );
  // Row-less replica .db files with any visible DB/WAL/SHM sibling. The
  // reconciliation sweep may already have quarantined the main .db; the
  // removal debt still owns the stranded WAL/SHM, and quarantined evidence
  // is never re-deleted here.
  const candidates = new Set(onDisk.files.filter((key) =>
    !assigned.has(key) &&
    !key.endsWith(QUARANTINED_SUFFIX) &&
    hasVisibleOrphanFiles(partitionsDir, key, fs, path)));
  for (const authority of startupAuthorities.values()) {
    candidates.add(`${authority.partitionId}/${buildReplicaFileName(
      authority.replicaId,
      STORAGE_DEFAULT,
    )}`);
  }
  const orphaned = [...candidates];
  let deleted = LOCAL_ZERO;
  let failed = LOCAL_ZERO;
  for (const key of orphaned) {
    const {partitionId, replicaId} = parseReplicaFileKey(key);
    try {
      const owner = handler.getReplicaCleanupTombstoneOwner();
      // Only a marker frozen before request admission may be resumed. A new
      // acquisition may use only the token proposed by this process; an
      // OWNED result is another live claimant and is never borrowed.
      const authority = await resolveSweepCleanupAuthority(
        owner, startupAuthorities, handler, replicaId, partitionId);
      if (authority === false) continue;
      if (!authority || !await owner.requireCurrent(authority)) {
        throw new Error(`Cleanup ownership unavailable for ${replicaId}`);
      }
      await handler.cleanupReplicaResources(
        partitionId,
        replicaId,
        authority,
      );
      const dbPath = path.join(partitionsDir, key);
      if (!await completeSweepCleanup(owner, authority, fs, dbPath)) {
        throw new Error(`Cleanup completion deferred for ${replicaId}`);
      }
      deleted += 1;
      handler.logger.info(
        REPLICA_HANDLER_LOG_MSG.REMOVED_CLEANUP_SWEEP_DELETED,
        {replicaId, partitionId, nodeId: handler.nodeId},
      );
    } catch (error) {
      // Leave the files in place: the debt stays owned by this sweep and
      // is retried on the next startup.
      failed += 1;
      handler.logger.warn(
        REPLICA_HANDLER_LOG_MSG.REMOVED_CLEANUP_SWEEP_FAILED,
        {
          replicaId,
          partitionId,
          nodeId: handler.nodeId,
          error: error.message,
        },
      );
    }
  }
  if (orphaned.length > LOCAL_ZERO) {
    handler.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVED_CLEANUP_SWEEP_RESULT, {
      candidateCount: orphaned.length,
      deletedCount: deleted,
      failedCount: failed,
      assignedCount: assigned.size,
      nodeId: handler.nodeId,
    });
  }
  return {
    sweepCompleted: true,
    candidates: orphaned.length,
    deleted,
    failed,
  };
}

export {sweepRemovedReplicaCleanupDebt};
