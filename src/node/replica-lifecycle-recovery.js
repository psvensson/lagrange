import fs from 'node:fs';
import path from 'node:path';

import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {SERVICE_TYPE, TABLES} from '../constants/index.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {assertCritical} from '../utils/assert.js';
import {
  REPLICA_LIFECYCLE_ERROR_MSG,
  REPLICA_LIFECYCLE_EVENT,
  REPLICA_LIFECYCLE_LOG_MSG,
  REPLICA_LIFECYCLE_NUM,
  REPLICA_LIFECYCLE_STATUS,
} from './replica-lifecycle-constants.js';

const ReplicaStatus = REPLICA_LIFECYCLE_STATUS;
const RECOVERY_DELIVERY_PRIORITY_CRITICAL = 'critical';
const SKIPPED_STALE_RECOVERY_FAILURE_UPDATE =
  'Skipped stale replica recovery failure update';
const SKIPPED_STALE_RECOVERY_STOP_UPDATE =
  'Skipped stale replica recovery stop update';

function guardedMutationApplied(result) {
  if (result?.success === false) {
    return false;
  }
  const affectedRows = Number(result?.partitionResult?.affectedRows);
  return !Number.isFinite(affectedRows) ||
    affectedRows > REPLICA_LIFECYCLE_NUM.ZERO;
}

function buildObservedReplicaWhereClause(service) {
  const whereClause = {
    service_id: service.service_id,
  };
  if (typeof service?.node_id === 'string' &&
    service.node_id.length > REPLICA_LIFECYCLE_NUM.ZERO) {
    whereClause.node_id = service.node_id;
  }
  if (typeof service?.status === 'string' &&
    service.status.length > REPLICA_LIFECYCLE_NUM.ZERO) {
    whereClause.status = service.status;
  }
  if (Number.isFinite(service?.updated_at)) {
    whereClause.updated_at = service.updated_at;
  }
  return whereClause;
}

function findRecoverableReplicaServices(manager) {
  return manager.systemTableCache.filter(
    SYSTEM_TABLE_NAME.SERVICES,
    (service) =>
      service.node_id === manager.nodeId &&
      service.service_type === SERVICE_TYPE.PARTITION &&
      [
        ReplicaStatus.STARTING,
        ReplicaStatus.SYNCING,
        ReplicaStatus.STOPPING,
      ].includes(service.status),
  );
}

async function markRecoveringReplicaFailed(manager, service) {
  const {
    service_id: serviceId,
    partition_id: partitionId,
    status,
  } = service;
  const failResult = await manager.getControlPlaneSystemTableGateway()
    .submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      whereClause: buildObservedReplicaWhereClause(service),
      data: {
        status: ReplicaStatus.FAILED,
        error_message: REPLICA_LIFECYCLE_ERROR_MSG.RECOVERY_CLEANUP_ERROR,
      },
    }, {
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      deliveryPriority: RECOVERY_DELIVERY_PRIORITY_CRITICAL,
    });
  if (!guardedMutationApplied(failResult)) {
    manager.logger.debug(SKIPPED_STALE_RECOVERY_FAILURE_UPDATE, {
      replicaId: serviceId,
      partitionId,
      status,
      nodeId: manager.nodeId,
    });
    return;
  }

  await manager.cleanupReplicaResources(partitionId, serviceId);

  manager.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_MARKED_FAILED, {
    replicaId: serviceId,
    previousStatus: status,
    nodeId: manager.nodeId,
  });
}

async function completeStoppingReplicaRemoval(manager, service) {
  const {
    service_id: serviceId,
    partition_id: partitionId,
  } = service;
  const stopResult = await manager.getControlPlaneSystemTableGateway()
    .submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      whereClause: buildObservedReplicaWhereClause(service),
      data: {status: ReplicaStatus.STOPPED},
    }, {
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      deliveryPriority: RECOVERY_DELIVERY_PRIORITY_CRITICAL,
    });
  if (!guardedMutationApplied(stopResult)) {
    manager.logger.debug(SKIPPED_STALE_RECOVERY_STOP_UPDATE, {
      replicaId: serviceId,
      partitionId,
      nodeId: manager.nodeId,
    });
    return;
  }

  await manager.getControlPlaneSystemTableGateway().submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
    tableName: SYSTEM_TABLE_NAME.SERVICES,
    whereClause: {
      service_id: serviceId,
      status: ReplicaStatus.STOPPED,
    },
  }, {
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
    deliveryPriority: RECOVERY_DELIVERY_PRIORITY_CRITICAL,
  });

  await manager.cleanupReplicaResources(partitionId, serviceId);

  manager.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_COMPLETED_REMOVAL, {
    replicaId: serviceId,
    nodeId: manager.nodeId,
  });
}

async function recoverReplicaService(manager, service) {
  const {
    service_id: serviceId,
    partition_id: partitionId,
    status,
  } = service;

  manager.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_PROCESSING, {
    replicaId: serviceId,
    partitionId,
    status,
    nodeId: manager.nodeId,
  });

  try {
    if (status === ReplicaStatus.STARTING || status === ReplicaStatus.SYNCING) {
      await markRecoveringReplicaFailed(manager, service);
    } else if (status === ReplicaStatus.STOPPING) {
      await completeStoppingReplicaRemoval(manager, service);
    }
  } catch (error) {
    manager.logger.error(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_FAILED, {
      replicaId: serviceId,
      status,
      error: error.message,
      nodeId: manager.nodeId,
    });
    throw error;
  }
}

// --- Startup replica-file reconciliation sweep --------------------------
//
// The transitional-state recovery above only sees replicas that still HAVE a
// services row. Two failure shapes leave a nodes-p* replica .db with NO row:
// a replica reassigned to another node while this node was down (the row was
// moved away), and a crash between the services-row DELETE and the file
// unlink in cleanupReplicaResources. Without a sweep those orphaned files sit
// on disk indistinguishable from assigned replica state. Post-hydration the
// canonical assignment is the services table (systemTableCache), so the
// sweep compares on-disk files against services rows for this node and
// QUARANTINES (renames aside) any file with no matching row — quarantine,
// not deletion, so a mis-read assignment can never destroy the only local
// copy of cluster data silently; the quarantined file is inert (nothing
// reads a .quarantined path as a replica DB) yet remains for diagnosis.

const REPLICA_DB_QUARANTINE_SUFFIX = '.quarantined';
const NODES_TABLE_PARTITION_PREFIX = `${TABLES.NODES}-p`;

function findAssignedReplicaRows(manager) {
  return manager.systemTableCache.filter(
    SYSTEM_TABLE_NAME.SERVICES,
    (service) =>
      service.node_id === manager.nodeId &&
      typeof service.partition_id === 'string' &&
      service.partition_id.length > REPLICA_LIFECYCLE_NUM.ZERO &&
      typeof service.replica_id === 'string' &&
      service.replica_id.length > REPLICA_LIFECYCLE_NUM.ZERO,
  );
}

function replicaRowFileKey(row) {
  return `${row.partition_id}/${row.replica_id}${STORAGE_DEFAULT.DB_EXT}`;
}

function assignedReplicaFileKeys(manager) {
  const keys = new Set();
  for (const row of findAssignedReplicaRows(manager)) {
    keys.add(replicaRowFileKey(row));
  }
  return keys;
}

function listOnDiskReplicaDbFiles(partitionsDir) {
  const files = [];
  let partitionDirs;
  try {
    partitionDirs = fs.readdirSync(partitionsDir, {withFileTypes: true});
  } catch (_error) {
    // A missing partitions dir means no on-disk replica state at all;
    // an unreadable one must not silently read as "no orphans".
    return {files, partitionsDirReadable: false};
  }
  for (const partitionEntry of partitionDirs) {
    if (!partitionEntry.isDirectory() ||
      !partitionEntry.name.startsWith(NODES_TABLE_PARTITION_PREFIX)) {
      continue;
    }
    const partitionDir = path.join(partitionsDir, partitionEntry.name);
    let replicaEntries;
    try {
      replicaEntries = fs.readdirSync(partitionDir, {withFileTypes: true});
    } catch (_error) {
      return {files, partitionsDirReadable: false};
    }
    for (const replicaEntry of replicaEntries) {
      if (replicaEntry.isFile() &&
        replicaEntry.name.endsWith(STORAGE_DEFAULT.DB_EXT)) {
        files.push(`${partitionEntry.name}/${replicaEntry.name}`);
      }
    }
  }
  return {files, partitionsDirReadable: true};
}

function quarantineReplicaDbFile(partitionsDir, relativeKey, logger, nodeId) {
  const dbPath = path.join(partitionsDir, relativeKey);
  const quarantinedPath = `${dbPath}${REPLICA_DB_QUARANTINE_SUFFIX}`;
  try {
    fs.renameSync(dbPath, quarantinedPath);
    logger.warn(REPLICA_LIFECYCLE_LOG_MSG.ORPHANED_REPLICA_QUARANTINED, {
      dbPath,
      quarantinedPath,
      nodeId,
    });
    return true;
  } catch (error) {
    logger.warn(REPLICA_LIFECYCLE_LOG_MSG.ORPHANED_REPLICA_QUARANTINE_FAILED, {
      dbPath,
      error: error.message,
      nodeId,
    });
    return false;
  }
}

async function reconcileOnDiskReplicaFiles(manager) {
  const partitionsDir = path.join(
    manager.dataDir,
    STORAGE_DEFAULT.PARTITIONS_DIRNAME,
  );
  const onDisk = listOnDiskReplicaDbFiles(partitionsDir);
  if (!onDisk.partitionsDirReadable) {
    // Fail closed: an unreadable partitions dir is ambiguous evidence, so
    // the sweep must not treat it as "no orphans"; it leaves every file in
    // place (the sweep itself must never become a reader of ambiguous
    // state) and surfaces the condition.
    manager.logger.warn(REPLICA_LIFECYCLE_LOG_MSG.RECONCILIATION_SWEEP_SKIPPED, {
      partitionsDir,
      nodeId: manager.nodeId,
    });
    return {quarantined: 0, sweepCompleted: false};
  }
  const assigned = assignedReplicaFileKeys(manager);
  const orphaned = onDisk.files.filter((key) => !assigned.has(key));
  let quarantined = 0;
  for (const key of orphaned) {
    if (quarantineReplicaDbFile(partitionsDir, key, manager.logger,
      manager.nodeId)) {
      quarantined += 1;
    }
  }
  if (orphaned.length > 0) {
    manager.logger.warn(REPLICA_LIFECYCLE_LOG_MSG.RECONCILIATION_SWEEP_RESULT, {
      orphanedCount: orphaned.length,
      quarantinedCount: quarantined,
      assignedCount: assigned.size,
      nodeId: manager.nodeId,
    });
  }
  return {quarantined, sweepCompleted: true};
}

async function runReplicaLifecycleRecovery(manager) {
  manager.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_START, {
    nodeId: manager.nodeId,
  });

  assertCritical(
    manager.systemTableCache,
    REPLICA_LIFECYCLE_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
  );

  const services = findRecoverableReplicaServices(manager);

  manager.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_FOUND, {
    count: services.length,
    nodeId: manager.nodeId,
  });

  for (const service of services) {
    await recoverReplicaService(manager, service);
  }

  const sweep = await reconcileOnDiskReplicaFiles(manager);

  manager.emit(REPLICA_LIFECYCLE_EVENT.RECOVERY_COMPLETE, {
    nodeId: manager.nodeId,
    orphanedCount: services.length,
    quarantinedOrphanedFiles: sweep.quarantined,
    reconciliationSweepCompleted: sweep.sweepCompleted,
  });
}

export {
  runReplicaLifecycleRecovery,
};
