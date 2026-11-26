// Target-side learner materialization and observation handlers for
// permanent member loss recovery on ReplicaHandler.

import {createPartitionConstructionHandoff} from
  '../bootstrap/shared/partition-service-construction.js';
import {
  SYSTEM_TABLE_NAME,
  getSchemaByTableName,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  PARTITION_MEMBERSHIP_RECOVERY_DEFAULT as DEFAULT_VALUE,
  PARTITION_MEMBERSHIP_RECOVERY_ERROR as ERROR,
} from '../partition/partition-membership-recovery-constants.js';
import {
  deriveCanonicalPeerIdString,
  recordPartitionMemberBinding,
} from '../partition/partition-membership-recovery.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  replicaIdsOfStamp,
  validateBootstrapMembershipStamp,
} from '../raft/raft-committed-membership-stamp.js';
import {
  RAFT_OPERATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-operation-progress.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function observeRecoveryTargetReplica(service) {
  const status = service?.raft?.readStatus?.() ?? null;
  if (!status || status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    return null;
  }
  return Object.freeze({
    replicaIdentity: service.replicaId,
    peerId: deriveCanonicalPeerIdString(service.replicaId),
    nodeId: service.nodeId,
    term: Number(status.term ?? 0),
    commitIndex: Number(status.commitIndex ?? 0),
    appliedIndex: Number(status.appliedIndex ?? 0),
    configurationKey: status.configurationKey ?? null,
    membershipGenerationIndex: Number(status.membershipGenerationIndex ?? 0),
    runtimeGeneration: Number(status.runtimeGeneration ?? 0),
    gateOpen: status.gateOpen === true,
    confChangePending: status.confChangePending === true,
  });
}

function resolveTableSchemaForRecovery(handler, request) {
  if (request.schema) return request.schema;
  const tableName = request.tableName;
  const systemSchema = isNonEmptyString(tableName) ?
    getSchemaByTableName(tableName) : null;
  if (systemSchema) {
    return systemSchema;
  }
  const lookupKey = isNonEmptyString(request.tableId) ?
    request.tableId : tableName;
  const tableRow = handler.systemTableCache?.get?.(TABLES.TABLES, lookupKey);
  if (tableRow?.schema_json) {
    return typeof tableRow.schema_json === 'string' ?
      JSON.parse(tableRow.schema_json) : tableRow.schema_json;
  }
  return null;
}

function seedTargetServiceMetadataRow(handler, service, status, raftRole, createdAt) {
  const cache = handler?.systemTableCache;
  if (!cache || !cache.applySystemTableChange) return;
  const nowMs = handler.timeSource.now();
  const existing = cache.get?.(TABLES.SERVICES, service.replicaId) ?? null;
  const row = {
    ...(existing || {}),
    service_id: service.replicaId,
    replica_id: service.replicaId,
    partition_id: service.partitionId,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: handler.nodeId,
    address: service.unifiedAddress,
    status,
    raft_role: raftRole,
    created_at: isPositiveSafeInteger(createdAt) ?
      createdAt : (existing?.created_at ?? nowMs),
    updated_at: nowMs,
  };
  cache.applySystemTableChange(
    TABLES.SERVICES,
    existing ? CDC_OPERATION.UPDATE : CDC_OPERATION.INSERT,
    row,
  );
}

function buildRecoveryStorageOption(handler, partitionId, replicaId) {
  return {dbPath: handler.getPartitionDbPath(partitionId, replicaId)};
}

async function constructRecoveryLearnerPartition(
  handler,
  request,
  stamp,
  storageOption,
  schema,
  tableName,
  tableId,
) {
  const {partitionId, targetReplicaId} = request;
  const replicaIds = replicaIdsOfStamp(stamp, targetReplicaId);
  const construction = createPartitionConstructionHandoff(
    targetReplicaId,
    () => handler.throwIfShuttingDown(),
  );
  const capturePartition = (constructed, publish) =>
    construction.retain(constructed, publish);
  const service = await handler.createPartitionService({
    partitionId,
    tableId,
    tableName,
    schema,
    keyRange: request.keyRange ?? null,
    replicaId: targetReplicaId,
    replicaIds,
    nodeId: handler.nodeId,
    ...storageOption,
    transport: handler.messageRouter,
    systemTableCache: handler.systemTableCache,
    isJoiningExistingGroup: true,
    deferElection: false,
    learnerFirstAdmission: true,
    bootstrapMembership: stamp,
    identityExisted: false,
    deferCdcPropagationHandshake: true,
    suppressLifecycleLogs: true,
    resolveHandlerRetirementLane: () => handler.replicaStateMachine,
    onPartitionConstructed: capturePartition,
  });
  if (construction.opened !== null) {
    construction.publish(service);
  }
  if (service.initialized !== true) {
    await service.initialize();
  }
  return service;
}

async function handleMaterializeRecoveryLearner(handler, request) {
  if (!request || request.targetNodeId !== handler.nodeId) {
    return handler.buildReplicaOperationResponse(
      ReplicaOperationResponseStatus.ERROR,
      {
        error: ERROR.TARGET_INVALID,
        failureCode: ERROR.TARGET_INVALID,
        nodeId: handler.nodeId,
      },
    );
  }
  if (isPositiveSafeInteger(handler.ownerIncarnation) &&
      handler.ownerIncarnation !== request.targetNodeBootIncarnation) {
    return handler.buildReplicaOperationResponse(
      ReplicaOperationResponseStatus.ERROR,
      {
        error: ERROR.SOURCE_GENERATION_MISMATCH,
        failureCode: ERROR.SOURCE_GENERATION_MISMATCH,
        nodeId: handler.nodeId,
      },
    );
  }
  const {
    partitionId,
    targetReplicaId,
    targetNodeBootIncarnation,
    targetReplicaCreatedAt,
    bootstrapMembership,
  } = request;
  let service = handler.getTrackedService(targetReplicaId);
  if (!service || service.isShutdown) {
    const validation = validateBootstrapMembershipStamp(bootstrapMembership);
    if (!validation.valid) {
      return handler.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error: ERROR.TARGET_INVALID,
          failureCode: ERROR.TARGET_INVALID,
          nodeId: handler.nodeId,
        },
      );
    }
    const storageOption = buildRecoveryStorageOption(
      handler, partitionId, targetReplicaId);
    const schema = resolveTableSchemaForRecovery(handler, request);
    const tableName = isNonEmptyString(request.tableName) ?
      request.tableName : partitionId.replace(/-p\d+$/u, '');
    const tableId = isNonEmptyString(request.tableId) ?
      request.tableId : tableName;
    service = await constructRecoveryLearnerPartition(
      handler,
      request,
      validation.stamp,
      storageOption,
      schema,
      tableName,
      tableId,
    );
    handler.localServices.set(targetReplicaId, service);
    handler.setLocalReplica(targetReplicaId, {
      replicaId: targetReplicaId,
      partitionId,
      tableName,
      status: ReplicaStatus.SYNCING,
      service,
    });
  }
  if (Array.isArray(request.memberBindings)) {
    for (const binding of request.memberBindings) {
      recordPartitionMemberBinding(service, binding);
    }
  }
  recordPartitionMemberBinding(service, {
    replicaId: targetReplicaId,
    nodeId: handler.nodeId,
    nodeBootIncarnation: targetNodeBootIncarnation,
    replicaCreatedAt: targetReplicaCreatedAt,
  });
  seedTargetServiceMetadataRow(
    handler,
    service,
    ReplicaStatus.SYNCING,
    RAFT_ROLE.LEARNER,
    targetReplicaCreatedAt,
  );
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.COMPLETED,
    {
      partitionId,
      replicaId: targetReplicaId,
      nodeId: handler.nodeId,
      targetObservation: observeRecoveryTargetReplica(service),
    },
  );
}

async function handleObserveRecoveryLearner(handler, request) {
  const service = handler.getTrackedService(request?.targetReplicaId);
  if (!service || service.isShutdown ||
      service.partitionId !== request?.partitionId) {
    return handler.buildReplicaOperationResponse(
      ReplicaOperationResponseStatus.NOT_FOUND,
      {
        partitionId: request?.partitionId ?? null,
        replicaId: request?.targetReplicaId ?? null,
        nodeId: handler.nodeId,
      },
    );
  }
  if (request.promoted === true) {
    if (isCatchupLearnerRaftRole(service.role)) {
      service.role = RAFT_ROLE.FOLLOWER;
      service.isJoiningExistingGroup = false;
      service.learnerBootstrapped = true;
      service.cancelLearnerPromotionMonitor?.();
      service.queueRoleUpdate?.(RAFT_ROLE.FOLLOWER);
    }
    handler.seedLocalReplicaVoterRaftRole?.(service.replicaId);
    handler.setLocalReplica(service.replicaId, {
      replicaId: service.replicaId,
      partitionId: service.partitionId,
      tableName: service.tableName,
      status: ReplicaStatus.ACTIVE,
      service,
    });
    seedTargetServiceMetadataRow(
      handler,
      service,
      SERVICE_STATUS.ACTIVE,
      RAFT_ROLE.FOLLOWER,
      request.targetReplicaCreatedAt,
    );
    service.reassertDurableRaftRole?.();
  }
  return handler.buildReplicaOperationResponse(
    ReplicaOperationResponseStatus.COMPLETED,
    {
      partitionId: service.partitionId,
      replicaId: service.replicaId,
      nodeId: handler.nodeId,
      targetObservation: observeRecoveryTargetReplica(service),
    },
  );
}

function resolveRecoveryMetadataGateway(handler) {
  if (handler?.controlPlaneSystemTableGateway) {
    return handler.controlPlaneSystemTableGateway;
  }
  return handler?.getControlPlaneSystemTableGateway?.() ?? null;
}

function persistRecoveredServicesRowsAsync(
  handler,
  recovery,
  targetAddress,
  leaderService = null,
) {
  const gateway = resolveRecoveryMetadataGateway(handler);
  const cache = handler?.systemTableCache;
  const nowMs = Number(handler?.timeSource?.now?.() ?? Date.now());
  const resolvedAddress = isNonEmptyString(targetAddress) ?
    targetAddress :
    `${recovery.targetNodeId}/partition/${recovery.targetReplicaId}`;
  const targetRow = {
    service_id: recovery.targetReplicaId,
    replica_id: recovery.targetReplicaId,
    partition_id: recovery.partitionId,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: recovery.targetNodeId,
    address: resolvedAddress,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: RAFT_ROLE.FOLLOWER,
    created_at: recovery.targetReplicaCreatedAt,
    state_entered_at: recovery.targetReplicaCreatedAt,
    updated_at: nowMs,
  };
  if (cache && cache.applySystemTableChange) {
    const existingTarget =
      cache.get?.(TABLES.SERVICES, recovery.targetReplicaId) ?? null;
    cache.applySystemTableChange(
      TABLES.SERVICES,
      existingTarget ? CDC_OPERATION.UPDATE : CDC_OPERATION.INSERT,
      {
        ...(existingTarget || {}),
        ...targetRow,
      },
    );
    const existingSource =
      cache.get?.(TABLES.SERVICES, recovery.sourceReplicaId) ?? null;
    if (existingSource) {
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.DELETE, {
        ...existingSource,
        service_id: recovery.sourceReplicaId,
      });
    }
  }
  if (!gateway ||
      !gateway.submitMutation ||
      !gateway.deleteSystemTableRow) {
    return;
  }
  const writeOptions = {
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
    deliveryPriority: DEFAULT_VALUE.DELIVERY_PRIORITY_CRITICAL,
  };
  void Promise.resolve().then(async () => {
    let targetPersisted = false;
    try {
      const updatedAt = Number(handler?.timeSource?.now?.() ?? Date.now());
      const inserted = await gateway.submitMutation(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
          tableName: SYSTEM_TABLE_NAME.SERVICES,
          row: {
            ...targetRow,
            updated_at: updatedAt,
          },
        },
        {...writeOptions, ignoreExisting: true},
      );
      if (inserted?.success !== false) {
        targetPersisted = true;
      }
      await gateway.updateSystemTableRow?.(
        SYSTEM_TABLE_NAME.SERVICES,
        {
          service_id: recovery.targetReplicaId,
          node_id: recovery.targetNodeId,
        },
        {
          status: SERVICE_STATUS.ACTIVE,
          raft_role: RAFT_ROLE.FOLLOWER,
          updated_at: updatedAt,
        },
        writeOptions,
      );
    } catch (error) {
      handler.logger?.debug?.(ERROR.CONFIGURATION_IN_TRANSITION, {
        partitionId: recovery.partitionId,
        error: error?.message ?? String(error),
      });
    }
    let sourceDeleted = false;
    try {
      const deleted = await gateway.deleteSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        {
          service_id: recovery.sourceReplicaId,
        },
        writeOptions,
      );
      if (deleted?.success !== false) {
        sourceDeleted = true;
      }
    } catch (error) {
      handler.logger?.debug?.(ERROR.CONFIGURATION_IN_TRANSITION, {
        partitionId: recovery.partitionId,
        error: error?.message ?? String(error),
      });
    }
    if (leaderService && targetPersisted && sourceDeleted) {
      leaderService.lastCompletedMembershipRecoveryPersisted = true;
    }
  });
}

export {
  handleMaterializeRecoveryLearner,
  handleObserveRecoveryLearner,
  observeRecoveryTargetReplica,
  persistRecoveredServicesRowsAsync,
};
