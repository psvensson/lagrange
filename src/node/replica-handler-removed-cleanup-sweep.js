/**
 * Startup sweep owning removed-replica cleanup debt (rebalancer safety-audit
 * finding 12).
 *
 * A replica removal deletes the authoritative services row BEFORE local
 * runtime cleanup; a failed cleanup (or a crash in between) strands the
 * replica's DB/WAL/SHM files while the coordinator terminalizes the
 * operation on the completion outcome, so nothing ever retries the
 * idempotent reconcileRemovedReplicaCleanup path and the orphan sits on
 * disk indefinitely. The pre-existing startup reconciliation sweep only
 * quarantines (renames) the main .db for nodes-p* partitions and leaves
 * WAL/SHM behind, so a removal orphan keeps a readable -wal file at its
 * original path.
 *
 * This sweep gives the debt a durable owner: at startup the node compares
 * its partitions directory against authoritative services rows and deletes
 * — via the canonical reconcileRemovedReplicaCleanup retry path — every
 * replica file with no assigned row (explicit REMOVED cleanup debt is also
 * reconciled, but the reconcile itself deletes the row before cleaning, so
 * both shapes converge on "no assigned row"). Quarantined evidence from the
 * reconciliation sweep is not re-deleted. A deletion failure leaves the
 * file in place so the NEXT startup retries it: the orphan is eventually
 * deletable and the retry stays reachable. An unreadable partitions
 * directory fails closed (skipped, surfaced) rather than deleting against
 * ambiguous evidence.
 */

const LOCAL_DB_EXT_LENGTH = '.db'.length;
const QUARANTINED_SUFFIX = '.quarantined';
const WAL_SUFFIX = '-wal';
const SHM_SUFFIX = '-shm';
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
    for (const replicaEntry of replicaEntries) {
      if (replicaEntry.isFile() &&
        replicaEntry.name.endsWith(storageDefault.DB_EXT)) {
        files.push(`${partitionEntry.name}/${replicaEntry.name}`);
      }
    }
  }
  return {files, partitionsDirReadable: true};
}

function hasVisibleOrphanFiles(partitionsDir, key, fs, path) {
  const dbPath = path.join(partitionsDir, key);
  return [dbPath, `${dbPath}${WAL_SUFFIX}`, `${dbPath}${SHM_SUFFIX}`]
    .some((filePath) => fs.existsSync(filePath));
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

/**
 * Run the removed-replica cleanup-debt sweep for one handler.
 * @param {Object} handler ReplicaHandler instance (method receiver shape).
 * @param {Object} options Injected runtime modules/constants (fs, path,
 *   REPLICA_HANDLER_LOG_MSG, STORAGE_DEFAULT, SYSTEM_TABLE_NAME).
 * @return {Promise<Object>} Sweep report
 *   ({sweepCompleted, candidates, deleted, failed}).
 */
async function sweepRemovedReplicaCleanupDebt(handler, options) {
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
  const orphaned = onDisk.files.filter((key) =>
    !assigned.has(key) &&
    !key.endsWith(QUARANTINED_SUFFIX) &&
    hasVisibleOrphanFiles(partitionsDir, key, fs, path));
  let deleted = LOCAL_ZERO;
  let failed = LOCAL_ZERO;
  for (const key of orphaned) {
    const {partitionId, replicaId} = parseReplicaFileKey(key);
    try {
      // The canonical idempotent reconcile path: remove the (absent)
      // authoritative row, then delete the replica's files.
      await handler.reconcileRemovedReplicaCleanup(replicaId, partitionId);
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
