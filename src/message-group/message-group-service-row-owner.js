import {AddressManager} from '../address/address-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  ENTITY_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  isPartitionCleanupServiceRow,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';


const MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR = Object.freeze({
  GROUP_ID_REQUIRED: 'MessageGroupServiceRowOwner requires groupId',
  NODE_ID_REQUIRED: 'MessageGroupServiceRowOwner requires nodeId',
  REPLICA_ID_REQUIRED: 'MessageGroupServiceRowOwner requires replicaId',
  INSERT_REQUIRED:
    'MessageGroupServiceRowOwner requires insertSystemTableRow for registration',
  UPDATE_REQUIRED:
    'MessageGroupServiceRowOwner requires updateSystemTableRow for updates',
  DELETE_REQUIRED:
    'MessageGroupServiceRowOwner requires deleteSystemTableRow for removal',
  REMOVAL_VERSION_REQUIRED:
    'MessageGroupServiceRowOwner requires an exact removal version',
  CLEANUP_IN_PROGRESS: 'CLEANUP_IN_PROGRESS',
  CREATE_OWNER_DEFERRED: 'CREATE_OWNER_DEFERRED',
  IDENTITY_CONFLICT: 'SERVICE_IDENTITY_CONFLICT',
  REMOVE_OWNER_DEFERRED: 'REMOVE_OWNER_DEFERRED',
});
const SERVICE_ROW_UPDATE_OPTION = Object.freeze({
  allowCoalescing: true,
  deliveryPriority: 'critical',
  pressureRetryAfterMs: 250,
  skipCacheWait: true,
  workClass: 'critical',
});
const MESSAGE_GROUP_SERVICE_POINT_READ_SQL =
  'SELECT * FROM services WHERE service_id = ?';
const MESSAGE_GROUP_CRITICAL_WORK = 'critical';

function assertRequiredString(value, errorMessage) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(errorMessage);
  }
}

function resolveMessageGroupRaftRole(service) {
  const isLeader = service?.isLeader === true ||
    (typeof service?.isLeaderReplica === 'function' &&
      service.isLeaderReplica());
  if (isLeader) {
    return RAFT_ROLE.LEADER;
  }

  if (typeof service?.getRole === 'function') {
    return normalizePublishedRaftRole(service.getRole());
  }

  return normalizePublishedRaftRole(service?.role);
}

function messageGroupCreateError(replicaId, code) {
  const error = new Error(`Message-group creation ${code}: ${replicaId}`);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = code !==
    MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT;
  return error;
}

async function observeMessageGroupService(systemTableWriter, replicaId) {
  try {
    const read = await readAuthoritativeControlPlaneRows(
      systemTableWriter,
      SYSTEM_TABLE_NAME.SERVICES,
      MESSAGE_GROUP_SERVICE_POINT_READ_SQL,
      [replicaId],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        deliveryPriority: MESSAGE_GROUP_CRITICAL_WORK,
        workClass: MESSAGE_GROUP_CRITICAL_WORK,
      },
    );
    const available = read?.success === true && Array.isArray(read.rows);
    return {
      available,
      row: available && read.rows.length === 1 ? read.rows[0] : null,
    };
  } catch (_error) {
    return {available: false, row: null};
  }
}

function rowsMatchMessageGroupRegistration(observed, expected) {
  const fields = [
    'service_id',
    'service_type',
    'group_id',
    'node_id',
    'status',
    'updated_at',
  ];
  return fields.every((field) => observed?.[field] === expected[field]);
}

async function resolveMessageGroupRegistration(systemTableWriter, row) {
  const {row: observed} = await observeMessageGroupService(
    systemTableWriter,
    row.service_id,
  );
  if (rowsMatchMessageGroupRegistration(observed, row)) return observed;
  if (isPartitionCleanupServiceRow(observed)) {
    throw messageGroupCreateError(
      row.service_id,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CLEANUP_IN_PROGRESS,
    );
  }
  throw messageGroupCreateError(
    row.service_id,
    observed ? MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT :
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CREATE_OWNER_DEFERRED,
  );
}

function buildMessageGroupRemovalWhereClause(options) {
  const {groupId, replicaId, nodeId, expectedUpdatedAt} = options;
  const whereClause = {
    service_id: replicaId,
    service_type: SERVICE_TYPE.MESSAGE_GROUP,
    status: SERVICE_STATUS.STOPPED,
    updated_at: expectedUpdatedAt,
  };
  if (typeof groupId === 'string' && groupId.length > 0) {
    whereClause.group_id = groupId;
  }
  if (typeof nodeId === 'string' && nodeId.length > 0) {
    whereClause.node_id = nodeId;
  }
  return whereClause;
}

function messageGroupRemovalErrorCode(observation) {
  if (isPartitionCleanupServiceRow(observation.row)) {
    return MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CLEANUP_IN_PROGRESS;
  }
  return observation.available && observation.row ?
    MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT :
    MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REMOVE_OWNER_DEFERRED;
}

class MessageGroupServiceRowOwner {
  constructor(options = {}) {
    this.systemTableWriter = options.systemTableWriter || null;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
  }

  static buildServiceRow(options = {}) {
    const {
      groupId,
      replicaId,
      nodeId,
      service = null,
      timestamp = Date.now(),
      status = SERVICE_STATUS.ACTIVE,
      extraFields = null,
    } = options;

    assertRequiredString(
      groupId,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.GROUP_ID_REQUIRED,
    );
    assertRequiredString(
      replicaId,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED,
    );
    assertRequiredString(
      nodeId,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.NODE_ID_REQUIRED,
    );

    const address = AddressManager.getInstance().format(
      nodeId,
      ENTITY_TYPE.MESSAGE_GROUP,
      replicaId,
    );

    return {
      service_id: replicaId,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: nodeId,
      partition_id: null,
      group_id: groupId,
      replica_id: replicaId,
      raft_role: resolveMessageGroupRaftRole(service),
      status,
      address,
      created_at: timestamp,
      updated_at: timestamp,
      ...(extraFields || {}),
    };
  }

  buildDeferredUpdateOptions(serviceId) {
    return {
      ...SERVICE_ROW_UPDATE_OPTION,
      coalescingKey: `services:${serviceId}`,
    };
  }

  async registerReplica(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.insertSystemTableRow !== 'function'
    ) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.INSERT_REQUIRED,
      );
    }

    const row = MessageGroupServiceRowOwner.buildServiceRow({
      ...options,
      timestamp: options.timestamp ?? this.now(),
    });

    const result = await this.systemTableWriter.insertSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      row,
      {...this.buildDeferredUpdateOptions(row.service_id),
        allowCoalescing: false},
    );
    if (!classifyControlPlaneMutationResult(result).applied) {
      return resolveMessageGroupRegistration(this.systemTableWriter, row);
    }

    return row;
  }

  async activateReplica(options = {}) {
    return this.updateReplicaStatus({
      ...options,
      status: SERVICE_STATUS.ACTIVE,
    });
  }

  async updateReplicaStatus(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.updateSystemTableRow !== 'function'
    ) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.UPDATE_REQUIRED,
      );
    }

    const row = MessageGroupServiceRowOwner.buildServiceRow({
      ...options,
      timestamp: options.timestamp ?? this.now(),
    });
    const {
      created_at: _createdAt,
      ...updates
    } = row;
    const updateResult = await this.systemTableWriter.updateSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      {
        service_id: row.service_id,
        service_type: row.service_type,
        group_id: row.group_id,
        node_id: row.node_id,
      },
      updates,
      this.buildDeferredUpdateOptions(row.service_id),
    );
    if (!classifyControlPlaneMutationResult(updateResult).applied) {
      return this.registerReplica({...options, timestamp: row.updated_at});
    }
    return row;
  }

  async removeReplica(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.deleteSystemTableRow !== 'function'
    ) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.DELETE_REQUIRED,
      );
    }

    const {replicaId, expectedUpdatedAt} = options;
    assertRequiredString(
      replicaId,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED,
    );
    if (!Number.isFinite(expectedUpdatedAt)) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REMOVAL_VERSION_REQUIRED,
      );
    }

    const whereClause = buildMessageGroupRemovalWhereClause(options);

    let result = null;
    let mutationError = null;
    try {
      result = await this.systemTableWriter.deleteSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        whereClause,
        {
          allowCoalescing: false,
          coalescingKey: `services:${replicaId}:message-group-remove:` +
            expectedUpdatedAt,
        },
      );
    } catch (error) {
      mutationError = error;
    }
    const effect = classifyControlPlaneMutationResult(result);
    const observation = await observeMessageGroupService(
      this.systemTableWriter,
      replicaId,
    );
    if (observation.available && observation.row === null) return true;
    const code = messageGroupRemovalErrorCode(observation);
    const error = messageGroupCreateError(replicaId, code);
    error.cause = mutationError;
    error.mutationOutcome = effect.outcome || null;
    throw error;
  }
}

export {MessageGroupServiceRowOwner};
