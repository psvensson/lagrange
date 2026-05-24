import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  FAILURE_DETECTOR_EVENT,
  FAILURE_DETECTOR_LOG_MSG,
  FAILURE_DETECTOR_REPLICA_TYPE,
} from './node-constants.js';
import {
  FAILURE_REPAIR_INTENT_TRANSITION_TYPE,
} from './failure-repair-intent-contract.js';
import {
  buildObservedReplicaWhereClause,
  guardedUpdateApplied,
} from './failure-detector-control-plane-guards.js';

async function markFailureDetectorReplicasAsFailed(detector, nodeId, now) {
  // Keep class method dispatch so tests or subclasses can override each step.
  const partitionReplicas = await detector.getPartitionReplicasOnNode(nodeId);
  for (const replica of partitionReplicas) {
    await detector.markReplicaAsFailed(replica, nodeId, now);
  }

  const messageGroupReplicas =
    await detector.getMessageGroupReplicasOnNode(nodeId);
  for (const replica of messageGroupReplicas) {
    await detector.markMessageGroupReplicaAsFailed(replica, nodeId, now);
  }

  detector.logger.info(FAILURE_DETECTOR_LOG_MSG.MARKED_REPLICAS_FAILED, {
    nodeId,
    partitionReplicas: partitionReplicas.length,
    messageGroupReplicas: messageGroupReplicas.length,
  });
}

async function markFailureDetectorPartitionReplicaAsFailed(
  detector,
  replica,
  nodeId,
  now,
) {
  try {
    const result = await detector.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      whereClause: buildObservedReplicaWhereClause(replica),
      data: {
        status: ReplicaStatus.FAILED,
        updated_at: now,
      },
    }, {
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      deliveryPriority: 'critical',
    });
    if (!guardedUpdateApplied(result)) {
      detector.logger.debug(
        FAILURE_DETECTOR_LOG_MSG.STALE_PARTITION_REPLICA_FAILURE_UPDATE,
        {
          serviceId: replica.service_id,
          nodeId,
        },
      );
      return;
    }

    detector.logger.warn(FAILURE_DETECTOR_LOG_MSG.MARK_PARTITION_REPLICA_FAILED, {
      serviceId: replica.service_id,
      partitionId: replica.partition_id,
      nodeId,
    });

    await detector.recordDurableRepairIntent({
      transitionType:
        FAILURE_REPAIR_INTENT_TRANSITION_TYPE.PARTITION_REPLICA_FAILURE,
      nodeId,
      serviceId: replica.service_id,
      partitionId: replica.partition_id,
      replicaType: FAILURE_DETECTOR_REPLICA_TYPE.PARTITION,
      observedAt: now,
    });

    detector.emit(FAILURE_DETECTOR_EVENT.REPLICA_FAILED, {
      type: FAILURE_DETECTOR_REPLICA_TYPE.PARTITION,
      serviceId: replica.service_id,
      partitionId: replica.partition_id,
      nodeId,
    });
  } catch (error) {
    detector.logger.error(
      FAILURE_DETECTOR_LOG_MSG.MARK_PARTITION_REPLICA_FAILED_FAILED,
      {
        serviceId: replica.service_id,
        error: error.message,
      },
    );
    throw error;
  }
}

async function markFailureDetectorMessageGroupReplicaAsFailed(
  detector,
  replica,
  nodeId,
  now,
) {
  try {
    const result = await detector.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      whereClause: buildObservedReplicaWhereClause(replica),
      data: {
        status: ReplicaStatus.FAILED,
        updated_at: now,
      },
    }, {
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      deliveryPriority: 'critical',
    });
    if (!guardedUpdateApplied(result)) {
      detector.logger.debug(
        FAILURE_DETECTOR_LOG_MSG.STALE_MESSAGE_GROUP_REPLICA_FAILURE_UPDATE,
        {
          serviceId: replica.service_id,
          nodeId,
        },
      );
      return;
    }

    detector.logger.warn(
      FAILURE_DETECTOR_LOG_MSG.MARK_MESSAGE_GROUP_REPLICA_FAILED,
      {
        serviceId: replica.service_id,
        groupId: replica.group_id,
        nodeId,
      },
    );

    await detector.recordDurableRepairIntent({
      transitionType:
        FAILURE_REPAIR_INTENT_TRANSITION_TYPE.MESSAGE_GROUP_REPLICA_FAILURE,
      nodeId,
      serviceId: replica.service_id,
      groupId: replica.group_id,
      replicaType: FAILURE_DETECTOR_REPLICA_TYPE.MESSAGE_GROUP,
      observedAt: now,
    });

    detector.emit(FAILURE_DETECTOR_EVENT.REPLICA_FAILED, {
      type: FAILURE_DETECTOR_REPLICA_TYPE.MESSAGE_GROUP,
      serviceId: replica.service_id,
      groupId: replica.group_id,
      nodeId,
    });
  } catch (error) {
    detector.logger.error(
      FAILURE_DETECTOR_LOG_MSG.MARK_MESSAGE_GROUP_REPLICA_FAILED_FAILED,
      {
        serviceId: replica.service_id,
        error: error.message,
      },
    );
    throw error;
  }
}

export {
  markFailureDetectorMessageGroupReplicaAsFailed,
  markFailureDetectorPartitionReplicaAsFailed,
  markFailureDetectorReplicasAsFailed,
};
