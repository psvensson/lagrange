import {AddressManager} from '../address/address-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  ENTITY_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';

const PARTITION_SERVICE_ROW_OWNER_ERROR = Object.freeze({
  PARTITION_ID_REQUIRED: 'PartitionServiceRowOwner requires partitionId',
  NODE_ID_REQUIRED: 'PartitionServiceRowOwner requires nodeId',
  REPLICA_ID_REQUIRED: 'PartitionServiceRowOwner requires replicaId',
  UPSERT_REQUIRED:
    'PartitionServiceRowOwner requires upsertSystemTableRow for registration',
});

function assertRequiredString(value, errorMessage) {
  if (typeof value !== TYPEOF.STRING || value.length === 0) {
    throw new Error(errorMessage);
  }
}

function resolvePartitionRaftRole(service) {
  const isLeader = service?.isLeader === true ||
    (typeof service?.isLeaderReplica === TYPEOF.FUNCTION &&
      service.isLeaderReplica());
  if (isLeader) {
    return RAFT_ROLE.LEADER;
  }

  if (typeof service?.getRole === TYPEOF.FUNCTION) {
    return service.getRole() || RAFT_ROLE.FOLLOWER;
  }

  return service?.role || RAFT_ROLE.FOLLOWER;
}

class PartitionServiceRowOwner {
  constructor(options = {}) {
    this.systemTableWriter = options.systemTableWriter || null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
  }

  static buildServiceRow(options = {}) {
    const {
      partitionId,
      replicaId,
      nodeId,
      service = null,
      timestamp = Date.now(),
      status = SERVICE_STATUS.STOPPED,
      extraFields = null,
    } = options;

    assertRequiredString(
      partitionId,
      PARTITION_SERVICE_ROW_OWNER_ERROR.PARTITION_ID_REQUIRED,
    );
    assertRequiredString(
      replicaId,
      PARTITION_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED,
    );
    assertRequiredString(
      nodeId,
      PARTITION_SERVICE_ROW_OWNER_ERROR.NODE_ID_REQUIRED,
    );

    const address = AddressManager.getInstance().format(
      nodeId,
      ENTITY_TYPE.PARTITION,
      replicaId,
    );

    return {
      service_id: replicaId,
      service_type: SERVICE_TYPE.PARTITION,
      node_id: nodeId,
      partition_id: partitionId,
      group_id: null,
      replica_id: replicaId,
      raft_role: resolvePartitionRaftRole(service),
      status,
      address,
      created_at: timestamp,
      updated_at: timestamp,
      ...(extraFields || {}),
    };
  }

  async registerReplica(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION
    ) {
      throw new Error(
        PARTITION_SERVICE_ROW_OWNER_ERROR.UPSERT_REQUIRED,
      );
    }

    const row = PartitionServiceRowOwner.buildServiceRow({
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
      typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION
    ) {
      throw new Error(
        PARTITION_SERVICE_ROW_OWNER_ERROR.UPSERT_REQUIRED,
      );
    }

    const row = PartitionServiceRowOwner.buildServiceRow({
      ...options,
      timestamp: options.timestamp ?? this.now(),
    });
    if (typeof this.systemTableWriter.updateSystemTableRow !== TYPEOF.FUNCTION) {
      await this.systemTableWriter.upsertSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        row,
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
    );
    return row;
  }
}

export {PartitionServiceRowOwner};
