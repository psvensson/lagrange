import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {SERVICE_TYPE} from '../constants/index.js';
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
const RECOVERY_OBSERVED_STRING_FIELDS = Object.freeze([
  'service_type',
  'partition_id',
  'node_id',
  'status',
]);

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
  for (const field of RECOVERY_OBSERVED_STRING_FIELDS) {
    if (typeof service?.[field] === 'string' &&
        service[field].length > REPLICA_LIFECYCLE_NUM.ZERO) {
      whereClause[field] = service[field];
    }
  }
  if (Number.isFinite(service?.state_entered_at)) {
    whereClause.state_entered_at = service.state_entered_at;
  } else if (Number.isFinite(service?.updated_at)) {
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

  manager.emit(REPLICA_LIFECYCLE_EVENT.RECOVERY_COMPLETE, {
    nodeId: manager.nodeId,
    orphanedCount: services.length,
    quarantinedOrphanedFiles: 0,
    reconciliationSweepCompleted: false,
  });
}

export {
  runReplicaLifecycleRecovery,
};
