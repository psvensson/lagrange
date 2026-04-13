import {AddressManager} from '../address/address-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  ENTITY_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';

const PARTITION_SERVICE_ROW_OWNER_ERROR = Object.freeze({
  PARTITION_ID_REQUIRED: 'PartitionServiceRowOwner requires partitionId',
  NODE_ID_REQUIRED: 'PartitionServiceRowOwner requires nodeId',
  REPLICA_ID_REQUIRED: 'PartitionServiceRowOwner requires replicaId',
  UPSERT_REQUIRED:
    'PartitionServiceRowOwner requires upsertSystemTableRow for registration',
  DELETE_REQUIRED:
    'PartitionServiceRowOwner requires deleteSystemTableRow for removal',
});
const SERVICE_ROW_UPDATE_OPTION = Object.freeze({
  allowCoalescing: true,
  allowPressureDefer: true,
  deliveryPriority: 'background',
  pressureRetryAfterMs: 250,
  skipCacheWait: true,
  workClass: 'background',
});
const CRITICAL_SERVICE_ROW_UPDATE_OPTION = Object.freeze({
  allowCoalescing: true,
  allowPressureDefer: false,
  deliveryPriority: 'critical',
  pressureRetryAfterMs: 250,
  skipCacheWait: true,
  workClass: 'critical',
});
const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SYSTEM_TABLE_NAME).map((tableName) => `${tableName}-p1`),
);

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
    return normalizePublishedRaftRole(service.getRole());
  }

  return normalizePublishedRaftRole(service?.role);
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

  isCriticalSystemPartition(partitionId) {
    return typeof partitionId === TYPEOF.STRING &&
      CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId);
  }

  buildDeferredUpdateOptions(serviceId, partitionId = null) {
    return {
      ...(this.isCriticalSystemPartition(partitionId) ?
        CRITICAL_SERVICE_ROW_UPDATE_OPTION :
        SERVICE_ROW_UPDATE_OPTION),
      coalescingKey: `services:${serviceId}`,
    };
  }

  buildPartitionLeaderUpdateOptions(partitionId) {
    return {
      ...(this.isCriticalSystemPartition(partitionId) ?
        CRITICAL_SERVICE_ROW_UPDATE_OPTION :
        SERVICE_ROW_UPDATE_OPTION),
      coalescingKey: `partitions:leader:${partitionId}`,
    };
  }

  async publishCanonicalLeaderNodeId(row) {
    if (!row ||
        row.service_type !== SERVICE_TYPE.PARTITION ||
        row.status !== SERVICE_STATUS.ACTIVE ||
        row.raft_role !== RAFT_ROLE.LEADER ||
        !this.systemTableWriter ||
        typeof this.systemTableWriter.updateSystemTableRow !== TYPEOF.FUNCTION) {
      return;
    }

    await this.systemTableWriter.updateSystemTableRow(
      SYSTEM_TABLE_NAME.PARTITIONS,
      {partition_id: row.partition_id},
      {
        leader_node_id: row.node_id,
        updated_at: row.updated_at,
      },
      this.buildPartitionLeaderUpdateOptions(row.partition_id),
    );
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
      this.buildDeferredUpdateOptions(row.service_id, row.partition_id),
    );
    await this.publishCanonicalLeaderNodeId(row);

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
        this.buildDeferredUpdateOptions(row.service_id, row.partition_id),
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
      this.buildDeferredUpdateOptions(row.service_id, row.partition_id),
    );
    await this.publishCanonicalLeaderNodeId(row);
    return row;
  }

  async removeReplica(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.deleteSystemTableRow !== TYPEOF.FUNCTION
    ) {
      throw new Error(
        PARTITION_SERVICE_ROW_OWNER_ERROR.DELETE_REQUIRED,
      );
    }

    const {partitionId, replicaId, nodeId} = options;
    assertRequiredString(
      replicaId,
      PARTITION_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED,
    );

    const whereClause = {
      service_id: replicaId,
      service_type: SERVICE_TYPE.PARTITION,
    };
    if (typeof partitionId === TYPEOF.STRING && partitionId.length > 0) {
      whereClause.partition_id = partitionId;
    }
    if (typeof nodeId === TYPEOF.STRING && nodeId.length > 0) {
      whereClause.node_id = nodeId;
    }

    await this.systemTableWriter.deleteSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      whereClause,
      this.buildDeferredUpdateOptions(replicaId, partitionId || null),
    );
  }
}

export {PartitionServiceRowOwner};
