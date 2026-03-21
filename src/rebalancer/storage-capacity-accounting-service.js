/**
 * Storage Capacity Accounting Service - derives storage snapshots from metadata.
 *
 * Requirements: 2.2, 2.3, 2.4, 8.1
 */

import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  COLUMN,
  NUM,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {ReplicaStatus} from './replica-status.js';
import {
  PRESSURE_STATE,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  STORAGE_CAPACITY_ERROR_MSG,
  STORAGE_CAPACITY_SUBSYSTEM,
} from './storage-capacity-constants.js';

const STORAGE_ACCOUNTING_SQL = Object.freeze({
  [TABLES.NODES]: 'SELECT * FROM nodes',
  [TABLES.PARTITIONS]: 'SELECT * FROM partitions',
  [TABLES.SERVICES]: 'SELECT * FROM services',
  [TABLES.STORAGE_RESERVATIONS]: 'SELECT * FROM storage_reservations',
});

class StorageCapacityAccountingService {
  /**
   * @param {Object} options
   * @param {Object} options.systemTableCache
   * @param {Object} options.sqlQueryEngine
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        getSqlQueryEngine: () => this.sqlQueryEngine,
      }).controlPlaneSystemTableGateway;
    this.usesDefaultControlPlaneSystemTableGateway =
      !options.controlPlaneSystemTableGateway;
    this.config = ConfigurationManager.getInstance();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(STORAGE_CAPACITY_SUBSYSTEM) : console;

    this.refreshConfig();
  }

  /**
   * Initialize or refresh dependencies.
   * @param {Object} options
   * @param {Object} [options.systemTableCache]
   * @param {Object} [options.sqlQueryEngine]
   */
  initialize(options = {}) {
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.sqlQueryEngine) {
      this.sqlQueryEngine = options.sqlQueryEngine;
    }
    if (options.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway =
        options.controlPlaneSystemTableGateway;
      this.usesDefaultControlPlaneSystemTableGateway = false;
    }

    this.refreshConfig();
    this.ensureDataSource();
  }

  /**
   * Refresh configuration values.
   * @private
   */
  refreshConfig() {
    this.softPressurePercent = this.getNumericConfig(
      STORAGE_CAPACITY_CONFIG_KEY.SOFT_PRESSURE_PERCENT,
      STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT,
    );
    this.hardPressurePercent = this.getNumericConfig(
      STORAGE_CAPACITY_CONFIG_KEY.HARD_PRESSURE_PERCENT,
      STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT,
    );
    this.minimumReplicaBytes = this.getNumericConfig(
      STORAGE_CAPACITY_CONFIG_KEY.MINIMUM_REPLICA_BYTES,
      STORAGE_CAPACITY_DEFAULT.MINIMUM_REPLICA_BYTES,
    );
    this.partitionReplicaOverheadBytes = this.getNumericConfig(
      STORAGE_CAPACITY_CONFIG_KEY.PARTITION_REPLICA_OVERHEAD_BYTES,
      STORAGE_CAPACITY_DEFAULT.PARTITION_REPLICA_OVERHEAD_BYTES,
    );
    this.messageGroupReplicaOverheadBytes = this.getNumericConfig(
      STORAGE_CAPACITY_CONFIG_KEY.MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES,
      STORAGE_CAPACITY_DEFAULT.MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES,
    );
    this.serviceReplicaOverheadBytes = this.getNumericConfig(
      STORAGE_CAPACITY_CONFIG_KEY.SERVICE_REPLICA_OVERHEAD_BYTES,
      STORAGE_CAPACITY_DEFAULT.SERVICE_REPLICA_OVERHEAD_BYTES,
    );
  }

  /**
   * Resolve numeric config value with default fallback.
   * @param {string} key
   * @param {number} fallback
   * @return {number}
   * @private
   */
  getNumericConfig(key, fallback) {
    const value = this.config.get(key);
    if (typeof value === TYPEOF.NUMBER && Number.isFinite(value)) {
      return value;
    }
    return fallback;
  }

  /**
   * Ensure at least one data source is available.
   * @private
   */
  ensureDataSource() {
    const hasReadableGateway =
      typeof this.controlPlaneSystemTableGateway?.supportsReadRows ===
        TYPEOF.FUNCTION ?
        this.controlPlaneSystemTableGateway.supportsReadRows() :
        typeof this.controlPlaneSystemTableGateway?.readRows ===
          TYPEOF.FUNCTION;
    assertCritical(
      this.systemTableCache || hasReadableGateway,
      STORAGE_CAPACITY_ERROR_MSG.ACCOUNTING_SOURCE_REQUIRED,
    );
  }

  /**
   * Fetch system table rows from cache or SQL.
   * @param {string} tableName
   * @return {Promise<Object[]>}
   * @private
   */
  async getSystemTableRows(tableName) {
    this.ensureDataSource();

    if (this.systemTableCache &&
        typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {
      return this.systemTableCache.getAll(tableName) || [];
    }

    if (!this.controlPlaneSystemTableGateway) {
      return [];
    }

    const query = STORAGE_ACCOUNTING_SQL[tableName];
    if (!query) {
      return [];
    }

    const result = await this.controlPlaneSystemTableGateway.readRows(
      tableName,
      query,
      [],
    );
    return result?.rows || [];
  }

  /**
   * Estimate replica bytes for a given entity type and payload size.
   * @param {Object} options
   * @param {string} options.entityType
   * @param {number} options.sizeBytes
   * @param {number} [options.amplificationFactor]
   * @return {number}
   */
  estimateReplicaBytes(options = {}) {
    const entityType = options.entityType || SERVICE_TYPE.PARTITION;
    const sizeBytes = Number(options.sizeBytes);
    const baseBytes = Number.isFinite(sizeBytes) && sizeBytes > NUM.ZERO ?
      sizeBytes : NUM.ZERO;
    const payloadBytes = Math.max(baseBytes, this.minimumReplicaBytes);
    const overheadBytes = this.getOverheadBytes(entityType);
    const rawEstimate = payloadBytes + overheadBytes;
    const amplificationFactor = Number(options.amplificationFactor);
    const multiplier = Number.isFinite(amplificationFactor) &&
      amplificationFactor > NUM.ZERO ? amplificationFactor : NUM.ONE;
    return Math.ceil(rawEstimate * multiplier);
  }

  /**
   * Build storage snapshots for all nodes.
   * @return {Promise<Object[]>}
   */
  async getCapacitySnapshots() {
    const nodes = await this.getSystemTableRows(TABLES.NODES);
    if (!nodes.length) {
      return [];
    }

    const partitions = await this.getSystemTableRows(TABLES.PARTITIONS);
    const services = await this.getSystemTableRows(TABLES.SERVICES);
    const reservations = await this.getSystemTableRows(TABLES.STORAGE_RESERVATIONS);

    const partitionSizes = this.buildPartitionSizeMap(partitions);
    const usedBytesByNode = this.calculateUsedBytes(services, partitionSizes);
    const reservedBytesByNode = this.calculateReservedBytes(reservations);

    return nodes.map((node) => {
      const nodeId = node?.[COLUMN.NODE_ID];
      const usedBytes = usedBytesByNode.get(nodeId) || NUM.ZERO;
      const reservedBytes = reservedBytesByNode.get(nodeId) || NUM.ZERO;
      return this.buildSnapshot(node, usedBytes, reservedBytes);
    });
  }

  /**
   * Build a storage snapshot for a specific node.
   * @param {string} nodeId
   * @return {Promise<Object|null>}
   */
  async getCapacitySnapshotForNode(nodeId) {
    if (!nodeId) {
      return null;
    }

    const nodes = await this.getSystemTableRows(TABLES.NODES);
    const node = nodes.find((row) => row?.[COLUMN.NODE_ID] === nodeId);
    if (!node) {
      return null;
    }

    const partitions = await this.getSystemTableRows(TABLES.PARTITIONS);
    const services = await this.getSystemTableRows(TABLES.SERVICES);
    const reservations = await this.getSystemTableRows(TABLES.STORAGE_RESERVATIONS);

    const partitionSizes = this.buildPartitionSizeMap(partitions);
    const usedBytesByNode = this.calculateUsedBytes(services, partitionSizes);
    const reservedBytesByNode = this.calculateReservedBytes(reservations);
    const usedBytes = usedBytesByNode.get(nodeId) || NUM.ZERO;
    const reservedBytes = reservedBytesByNode.get(nodeId) || NUM.ZERO;

    return this.buildSnapshot(node, usedBytes, reservedBytes);
  }

  /**
   * Build a map of partition sizes keyed by partition ID.
   * @param {Object[]} partitions
   * @return {Map<string, number>}
   * @private
   */
  buildPartitionSizeMap(partitions) {
    const sizes = new Map();

    for (const partition of partitions) {
      const partitionId = partition?.[COLUMN.PARTITION_ID];
      if (!partitionId) {
        continue;
      }
      const sizeBytes = Number(partition?.[COLUMN.SIZE_BYTES]);
      const normalized = Number.isFinite(sizeBytes) && sizeBytes > NUM.ZERO ?
        Math.floor(sizeBytes) : NUM.ZERO;
      sizes.set(partitionId, normalized);
    }

    return sizes;
  }

  /**
   * Calculate used bytes per node from replica metadata.
   * @param {Object[]} services
   * @param {Map<string, number>} partitionSizes
   * @return {Map<string, number>}
   * @private
   */
  calculateUsedBytes(services, partitionSizes) {
    const usedBytesByNode = new Map();

    for (const service of services) {
      const nodeId = service?.[COLUMN.NODE_ID];
      if (!nodeId) {
        continue;
      }
      if (!this.shouldCountService(service)) {
        continue;
      }

      const entityType = service?.[COLUMN.SERVICE_TYPE] || SERVICE_TYPE.PARTITION;
      const sizeBytes = this.getServicePayloadBytes(service, partitionSizes);
      const estimated = this.estimateReplicaBytes({
        entityType,
        sizeBytes,
      });
      const current = usedBytesByNode.get(nodeId) || NUM.ZERO;
      usedBytesByNode.set(nodeId, current + estimated);
    }

    return usedBytesByNode;
  }

  /**
   * Calculate reserved bytes per node from reservation metadata.
   * @param {Object[]} reservations
   * @return {Map<string, number>}
   * @private
   */
  calculateReservedBytes(reservations) {
    const reservedByNode = new Map();
    const now = Date.now();

    for (const reservation of reservations) {
      const status = reservation?.[COLUMN.STATUS] || RESERVATION_STATUS.ACTIVE;
      if (status !== RESERVATION_STATUS.ACTIVE) {
        continue;
      }

      const expiresAt = Number(reservation?.[COLUMN.EXPIRES_AT]);
      if (Number.isFinite(expiresAt) && expiresAt <= now) {
        continue;
      }

      const nodeId = reservation?.[COLUMN.TARGET_NODE_ID];
      if (!nodeId) {
        continue;
      }

      const estimatedBytes = Number(reservation?.[COLUMN.ESTIMATED_BYTES]);
      if (!Number.isFinite(estimatedBytes) || estimatedBytes <= NUM.ZERO) {
        continue;
      }

      const amplification = Number(reservation?.[COLUMN.AMPLIFICATION_FACTOR]);
      const multiplier = Number.isFinite(amplification) &&
        amplification > NUM.ZERO ? amplification : NUM.ONE;
      const reservedBytes = Math.ceil(estimatedBytes * multiplier);

      const current = reservedByNode.get(nodeId) || NUM.ZERO;
      reservedByNode.set(nodeId, current + reservedBytes);
    }

    return reservedByNode;
  }

  /**
   * Determine if a service should count toward used bytes.
   * @param {Object} service
   * @return {boolean}
   * @private
   */
  shouldCountService(service) {
    const status = service?.[COLUMN.STATUS];
    return status !== ReplicaStatus.REMOVED;
  }

  /**
   * Resolve payload size for a service row.
   * @param {Object} service
   * @param {Map<string, number>} partitionSizes
   * @return {number}
   * @private
   */
  getServicePayloadBytes(service, partitionSizes) {
    const entityType = service?.[COLUMN.SERVICE_TYPE];
    if (entityType !== SERVICE_TYPE.PARTITION) {
      return NUM.ZERO;
    }

    const partitionId = service?.[COLUMN.PARTITION_ID];
    if (!partitionId) {
      return NUM.ZERO;
    }

    return partitionSizes.get(partitionId) || NUM.ZERO;
  }

  /**
   * Get overhead bytes based on entity type.
   * @param {string} entityType
   * @return {number}
   * @private
   */
  getOverheadBytes(entityType) {
    if (entityType === SERVICE_TYPE.PARTITION) {
      return this.partitionReplicaOverheadBytes;
    }
    if (entityType === SERVICE_TYPE.MESSAGE_GROUP ||
        entityType === SERVICE_TYPE.MESSAGE_GROUP_REPLICA) {
      return this.messageGroupReplicaOverheadBytes;
    }
    return this.serviceReplicaOverheadBytes;
  }

  /**
   * Build a capacity snapshot for a node.
   * @param {Object} nodeRow
   * @param {number} usedBytes
   * @param {number} reservedBytes
   * @return {Object}
   * @private
   */
  buildSnapshot(nodeRow, usedBytes, reservedBytes) {
    const nodeId = nodeRow?.[COLUMN.NODE_ID];
    const budgetBytes = Number(nodeRow?.[COLUMN.STORAGE_BUDGET_BYTES]);
    const hasBudget = Number.isFinite(budgetBytes) && budgetBytes > NUM.ZERO;
    const normalizedBudget = hasBudget ? Math.floor(budgetBytes) : null;
    const normalizedUsed = Number.isFinite(usedBytes) ? usedBytes : NUM.ZERO;
    const normalizedReserved = Number.isFinite(reservedBytes) ? reservedBytes : NUM.ZERO;
    const totalAllocated = normalizedUsed + normalizedReserved;
    const availableBytes = hasBudget ?
      Math.max(NUM.ZERO, normalizedBudget - totalAllocated) :
      NUM.ZERO;

    const pressureState = this.getPressureState(
      totalAllocated,
      normalizedBudget,
    );
    const utilizationPercent = hasBudget && normalizedBudget > NUM.ZERO ?
      (totalAllocated / normalizedBudget) * NUM.HUNDRED : NUM.HUNDRED;

    return {
      nodeId,
      budgetBytes: normalizedBudget,
      usedBytes: normalizedUsed,
      reservedBytes: normalizedReserved,
      availableBytes,
      utilizationPercent,
      pressureState,
    };
  }

  /**
   * Derive pressure state from utilization.
   * @param {number} allocatedBytes
   * @param {number|null} budgetBytes
   * @return {string}
   * @private
   */
  getPressureState(allocatedBytes, budgetBytes) {
    if (!Number.isFinite(budgetBytes) || budgetBytes <= NUM.ZERO) {
      return PRESSURE_STATE.EXHAUSTED;
    }

    const utilization = (allocatedBytes / budgetBytes) * NUM.HUNDRED;
    if (utilization >= NUM.HUNDRED) {
      return PRESSURE_STATE.EXHAUSTED;
    }
    if (utilization >= this.hardPressurePercent) {
      return PRESSURE_STATE.HARD;
    }
    if (utilization >= this.softPressurePercent) {
      return PRESSURE_STATE.SOFT;
    }
    return PRESSURE_STATE.NORMAL;
  }
}

export {StorageCapacityAccountingService};
