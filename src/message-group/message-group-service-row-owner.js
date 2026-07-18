import {AddressManager} from '../address/address-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  ENTITY_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';


const MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR = Object.freeze({
  GROUP_ID_REQUIRED: 'MessageGroupServiceRowOwner requires groupId',
  NODE_ID_REQUIRED: 'MessageGroupServiceRowOwner requires nodeId',
  REPLICA_ID_REQUIRED: 'MessageGroupServiceRowOwner requires replicaId',
  UPSERT_REQUIRED:
    'MessageGroupServiceRowOwner requires upsertSystemTableRow for registration',
  DELETE_REQUIRED:
    'MessageGroupServiceRowOwner requires deleteSystemTableRow for removal',
});
const SERVICE_ROW_UPDATE_OPTION = Object.freeze({
  allowCoalescing: true,
  deliveryPriority: 'critical',
  pressureRetryAfterMs: 250,
  skipCacheWait: true,
  workClass: 'critical',
});

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
      typeof this.systemTableWriter.upsertSystemTableRow !== 'function'
    ) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.UPSERT_REQUIRED,
      );
    }

    const row = MessageGroupServiceRowOwner.buildServiceRow({
      ...options,
      timestamp: options.timestamp ?? this.now(),
    });

    await this.systemTableWriter.upsertSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      row,
    );

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
      typeof this.systemTableWriter.upsertSystemTableRow !== 'function'
    ) {
      throw new Error(
        MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.UPSERT_REQUIRED,
      );
    }

    const row = MessageGroupServiceRowOwner.buildServiceRow({
      ...options,
      timestamp: options.timestamp ?? this.now(),
    });
    if (typeof this.systemTableWriter.updateSystemTableRow !== 'function') {
      await this.systemTableWriter.upsertSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        row,
        this.buildDeferredUpdateOptions(row.service_id),
      );
      return row;
    }

    const {
      created_at: _createdAt,
      ...updates
    } = row;
    await this.systemTableWriter.updateSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      {
        service_id: row.service_id,
        service_type: row.service_type,
      },
      updates,
      this.buildDeferredUpdateOptions(row.service_id),
    );
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

    const {replicaId, nodeId} = options;
    assertRequiredString(
      replicaId,
      MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED,
    );

    const whereClause = {
      service_id: replicaId,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
    };
    if (typeof nodeId === 'string' && nodeId.length > 0) {
      whereClause.node_id = nodeId;
    }

    await this.systemTableWriter.deleteSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      whereClause,
    );
  }
}

export {MessageGroupServiceRowOwner};
