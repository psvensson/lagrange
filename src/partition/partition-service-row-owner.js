import {AddressManager} from '../address/address-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  isBootstrapCriticalSystemPartitionId,
} from '../bootstrap/system-partition-classification.js';
import {
  isCriticalLeaderPublication,
} from './partition-leader-publication-criticality.js';
import {
  ENTITY_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
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
  deliveryPriority: 'background',
  pressureRetryAfterMs: 250,
  skipCacheWait: true,
  workClass: 'background',
});
const CRITICAL_SERVICE_ROW_UPDATE_OPTION = Object.freeze({
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

function resolvePartitionRaftRole(service) {
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

class PartitionServiceRowOwner {
  constructor(options = {}) {
    this.systemTableWriter = options.systemTableWriter || null;
    this.now = typeof options.now === 'function' ?
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

  isBootstrapCriticalPartitionId(partitionId) {
    return typeof partitionId === 'string' &&
      isBootstrapCriticalSystemPartitionId(partitionId);
  }

  buildDeferredUpdateOptions(serviceId, partitionId = null) {
    return {
      ...(this.isBootstrapCriticalPartitionId(partitionId) ?
        CRITICAL_SERVICE_ROW_UPDATE_OPTION :
        SERVICE_ROW_UPDATE_OPTION),
      coalescingKey: `services:${serviceId}`,
    };
  }

  // This path publishes from a registered leader service row with no
  // observation of the durable partitions row; the shared criticality
  // owner (quest partition-leader-row-publication-integrity) treats the
  // absent observation as unruled-out divergence, so registration-time
  // leader publications ride the critical lane.
  buildPartitionLeaderUpdateOptions(partitionId, publishingNodeId = null) {
    const critical = isCriticalLeaderPublication({
      observedLeaderNodeId: null,
      partitionId,
      publishingNodeId,
    });
    return {
      ...(critical ?
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
        typeof this.systemTableWriter.updateSystemTableRow !== 'function') {
      return;
    }

    await this.systemTableWriter.updateSystemTableRow(
      SYSTEM_TABLE_NAME.PARTITIONS,
      {partition_id: row.partition_id},
      {
        leader_node_id: row.node_id,
        updated_at: row.updated_at,
      },
      this.buildPartitionLeaderUpdateOptions(row.partition_id, row.node_id),
    );
  }

  async registerReplica(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.upsertSystemTableRow !== 'function'
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
      typeof this.systemTableWriter.upsertSystemTableRow !== 'function'
    ) {
      throw new Error(
        PARTITION_SERVICE_ROW_OWNER_ERROR.UPSERT_REQUIRED,
      );
    }

    const row = PartitionServiceRowOwner.buildServiceRow({
      ...options,
      timestamp: options.timestamp ?? this.now(),
    });
    if (typeof this.systemTableWriter.updateSystemTableRow !== 'function') {
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
    const updateResult = await this.systemTableWriter.updateSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES,
      {
        service_id: row.service_id,
        service_type: row.service_type,
      },
      updates,
      this.buildDeferredUpdateOptions(row.service_id, row.partition_id),
    );
    // Absence-proven heal: the registration write of this row is a one-shot
    // direct write outside raft; when it misses a replica db, every later
    // UPDATE zero-row no-ops with no CDC and the cached row never leaves
    // stopped, wedging serve-eligibility permanently (round-11). A zero
    // affected-row count on a primary-key-pinned WHERE proves durable
    // absence, and the full canonical row is already in hand — re-issue the
    // registration upsert. An unwitnessed count keeps the update-only
    // contract (absence must be proven, not assumed).
    if (updateResult?.partitionResult?.affectedRows === 0) {
      await this.systemTableWriter.upsertSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        row,
        this.buildDeferredUpdateOptions(row.service_id, row.partition_id),
      );
    }
    await this.publishCanonicalLeaderNodeId(row);
    return row;
  }

  async removeReplica(options = {}) {
    if (
      !this.systemTableWriter ||
      typeof this.systemTableWriter.deleteSystemTableRow !== 'function'
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
    if (typeof partitionId === 'string' && partitionId.length > 0) {
      whereClause.partition_id = partitionId;
    }
    if (typeof nodeId === 'string' && nodeId.length > 0) {
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
