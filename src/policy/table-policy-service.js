/**
 * Table Policy Service - Manages table policies for partition behavior.
 * Stores policies in the tables system table and provides policy retrieval.
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {TABLES} from '../constants/index.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READ_STRATEGY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  DEFAULT_MESSAGE_GROUP_POLICY,
  DEFAULT_TABLE_POLICY,
  POLICY_DEFAULT,
  POLICY_ERROR_MSG,
  POLICY_EVENT,
  POLICY_LOG_MSG,
  POLICY_SUBSYSTEM,
  POLICY_VALUE,
} from './policy-constants.js';
import {
  extractStorageConstraints,
  validateMessageGroupPolicy as validateMessageGroupPolicyFields,
  validatePlacementConstraints as validatePolicyPlacementConstraints,
  validateTablePolicy,
} from './table-policy-validation.js';
import {
  mergeStoredTablePolicyOverrides,
  resolveConfiguredTablePolicyDefaults,
} from './table-policy-resolution.js';

const LOCAL_STR_PLACEMENTCONSTRAINTS = 'placementConstraints';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_COMMA_SPACE = ', ';
const LOCAL_STR_CRITICAL = 'critical';

/**
 * TablePolicyService manages table policies for partition behavior.
 * Policies control splitting thresholds, merging criteria, and replication factors.
 */
class TablePolicyService extends EventEmitter {
  /**
   * Create a new TablePolicyService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   */
  constructor(options = {}) {
    super();

    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultTablePolicy = resolveConfiguredTablePolicyDefaults(config);
    this.defaultReplicaCount = this.defaultTablePolicy.replicaCount;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(POLICY_SUBSYSTEM.TABLE_POLICY) : console;

    // Local policy cache for performance
    this.policyCache = new Map();
    this.cacheTTLMs = config.get(CONFIG_KEY.POLICY_CACHE_TTL_MS) || POLICY_DEFAULT.CACHE_TTL_MS;

    this.initialized = false;
  }

  /**
   * Initialize the table policy service.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.info(POLICY_LOG_MSG.TABLE_POLICY_INITIALIZED);
    this.initialized = true;
  }


  /**
   * Get the default table policy.
   * @return {Object} Default policy object.
   */
  getDefaultPolicy() {
    return {
      ...this.defaultTablePolicy,
      placementConstraints: {
        ...this.defaultTablePolicy.placementConstraints,
      },
    };
  }

  /**
   * Lookup one table row from the local system cache.
   * @param {string} tableId - Table ID.
   * @return {Object|null} Cached row when present.
   * @private
   */
  lookupCachedTable(tableId) {
    if (!tableId || !this.systemTableCache) {
      return null;
    }

    if (typeof this.systemTableCache.filter === 'function') {
      const rows = this.systemTableCache.filter(
        TABLES.TABLES,
        (table) => table?.table_id === tableId || table?.tableId === tableId,
      );
      return rows[0] || null;
    }

    if (typeof this.systemTableCache.getAll === 'function') {
      const rows = this.systemTableCache.getAll(TABLES.TABLES) || [];
      return rows.find((table) =>
        table?.table_id === tableId || table?.tableId === tableId,
      ) || null;
    }

    return null;
  }

  /**
   * Lookup one partition row from the local system cache.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Cached row when present.
   * @private
   */
  lookupCachedPartition(partitionId) {
    if (!partitionId || !this.systemTableCache) {
      return null;
    }

    if (typeof this.systemTableCache.filter === 'function') {
      const rows = this.systemTableCache.filter(
        TABLES.PARTITIONS,
        (partition) =>
          partition?.partition_id === partitionId ||
          partition?.partitionId === partitionId,
      );
      return rows[0] || null;
    }

    if (typeof this.systemTableCache.getAll === 'function') {
      const rows = this.systemTableCache.getAll(TABLES.PARTITIONS) || [];
      return rows.find((partition) =>
        partition?.partition_id === partitionId ||
        partition?.partitionId === partitionId,
      ) || null;
    }

    return null;
  }

  /**
   * Get the policy for a specific table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Table policy (merged with defaults).
   */
  async getTablePolicy(tableId) {
    if (!tableId) {
      return this.getDefaultPolicy();
    }

    // Check local cache first
    const cached = this.policyCache.get(tableId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTLMs) {
      return cached.policy;
    }

    const table = await this.readTableRow(tableId);
    if (!table) {
      this.logger.debug(
        POLICY_LOG_MSG.TABLE_NOT_FOUND_DEFAULT, {tableId},
      );
      return this.getDefaultPolicy();
    }

    const storedPolicy = this.parseStoredTablePolicy(table, tableId);

    // Merge with defaults
    const mergedPolicy = this.mergeWithDefaults(storedPolicy);

    // Update cache
    this.policyCache.set(tableId, {
      policy: mergedPolicy,
      timestamp: Date.now(),
    });

    return mergedPolicy;
  }

  /**
   * Get the policy for a partition by looking up its table.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Object>} Table policy for the partition's table.
   */
  async getPolicyForPartition(partitionId) {
    const partition = await this.readPartitionRow(partitionId);
    if (!partition) {
      this.logger.debug(
        POLICY_LOG_MSG.PARTITION_NOT_FOUND_DEFAULT,
        {partitionId},
      );
      return this.getDefaultPolicy();
    }

    return this.getTablePolicy(partition.table_id);
  }

  /**
   * Merge a stored policy with defaults.
   * @param {Object} storedPolicy - Policy from storage.
   * @return {Object} Merged policy with all fields.
   */
  mergeWithDefaults(storedPolicy) {
    const merged = this.getDefaultPolicy();

    for (const [key, value] of Object.entries(storedPolicy)) {
      if (key === LOCAL_STR_PLACEMENTCONSTRAINTS && typeof value === LOCAL_STR_OBJECT) {
        merged.placementConstraints = {
          ...this.defaultTablePolicy.placementConstraints,
          ...value,
        };
      } else if (key in DEFAULT_TABLE_POLICY) {
        merged[key] = value;
      }
    }

    return merged;
  }

  parseStoredTablePolicy(table, tableId) {
    if (!table?.table_policies) {
      return POLICY_VALUE.EMPTY_POLICY;
    }
    try {
      return typeof table.table_policies === 'string' ?
        JSON.parse(table.table_policies) : table.table_policies;
    } catch (error) {
      this.logger.warn(POLICY_LOG_MSG.POLICY_PARSE_FAILED, {
        tableId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validate a policy object.
   * @param {Object} policy - Policy to validate.
   * @return {Object} Validation result {valid, errors}.
   */
  validatePolicy(policy) {
    return validateTablePolicy(
      policy,
      (placementConstraints) =>
        this.validatePlacementConstraints(placementConstraints),
    );
  }

  /**
   * Validate placement constraints in the policy.
   * @param {Object} placementConstraints - Placement constraints.
   * @return {string[]} Array of validation error messages.
   */
  validatePlacementConstraints(placementConstraints) {
    return validatePolicyPlacementConstraints(placementConstraints);
  }


  /**
   * Update the policy for a table.
   * Writes to the tables system table via CDC.
   * @param {string} tableId - Table ID.
   * @param {Object} policyUpdates - Policy fields to update.
   * @return {Promise<Object>} Update result.
   */
  async updateTablePolicy(tableId, policyUpdates) {
    if (!tableId) {
      throw new Error(POLICY_ERROR_MSG.TABLE_ID_REQUIRED);
    }

    if (!this.cdcIntegrationService) {
      throw new Error(POLICY_ERROR_MSG.CDC_REQUIRED_FOR_UPDATE);
    }

    // Validate the policy updates
    const validation = this.validatePolicy(policyUpdates);
    if (!validation.valid) {
      throw new Error(`${POLICY_ERROR_MSG.INVALID_POLICY_PREFIX}${validation.errors.join(LOCAL_STR_COMMA_SPACE)}`);
    }

    const table = await this.readTableRow(tableId);
    const storedPolicy = this.parseStoredTablePolicy(table, tableId);
    const currentPolicy = this.mergeWithDefaults(storedPolicy);
    const updatedStoredPolicy = mergeStoredTablePolicyOverrides(
      storedPolicy,
      policyUpdates,
    );
    const newPolicy = this.mergeWithDefaults(updatedStoredPolicy);

    // Validate the merged policy
    const mergedValidation = this.validatePolicy(newPolicy);
    if (!mergedValidation.valid) {
      throw new Error(
        `${POLICY_ERROR_MSG.INVALID_MERGED_POLICY_PREFIX}${mergedValidation.errors.join(LOCAL_STR_COMMA_SPACE)}`,
      );
    }

    this.logger.info(POLICY_LOG_MSG.UPDATE_TABLE_POLICY, {
      tableId,
      updates: policyUpdates,
    });

    try {
      // Update via CDC integration service
      await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.TABLES,
        whereClause: {table_id: tableId},
        data: {
          table_policies: JSON.stringify(updatedStoredPolicy),
          updated_at: Date.now(),
        },
      }, {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: LOCAL_STR_CRITICAL,
      });

      // Invalidate cache
      this.policyCache.delete(tableId);

      this.emit(POLICY_EVENT.POLICY_UPDATED, {
        tableId,
        oldPolicy: currentPolicy,
        newPolicy,
      });

      return {
        success: true,
        tableId,
        policy: newPolicy,
      };
    } catch (error) {
      this.logger.error(POLICY_LOG_MSG.UPDATE_TABLE_POLICY_FAILED, {
        tableId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Set the complete policy for a table (replaces existing).
   * @param {string} tableId - Table ID.
   * @param {Object} policy - Complete policy object.
   * @return {Promise<Object>} Update result.
   */
  async setTablePolicy(tableId, policy) {
    if (!tableId) {
      throw new Error(POLICY_ERROR_MSG.TABLE_ID_REQUIRED);
    }

    // Merge with defaults to ensure all fields are present
    const completePolicy = this.mergeWithDefaults(policy);

    // Validate
    const validation = this.validatePolicy(completePolicy);
    if (!validation.valid) {
      throw new Error(`${POLICY_ERROR_MSG.INVALID_POLICY_PREFIX}${validation.errors.join(LOCAL_STR_COMMA_SPACE)}`);
    }

    return this.updateTablePolicy(tableId, completePolicy);
  }

  /**
   * Get split thresholds for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Split thresholds.
   */
  async getSplitThresholds(tableId) {
    const policy = await this.getTablePolicy(tableId);
    return {
      storageThreshold: policy.splitStorageThreshold,
      trafficThreshold: policy.splitTrafficThreshold,
    };
  }

  /**
   * Get merge thresholds for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Merge thresholds.
   */
  async getMergeThresholds(tableId) {
    const policy = await this.getTablePolicy(tableId);
    return {
      storageThreshold: policy.mergeStorageThreshold,
      trafficThreshold: policy.mergeTrafficThreshold,
    };
  }

  /**
   * Get replication settings for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Replication settings.
   */
  async getReplicationSettings(tableId) {
    const policy = await this.getTablePolicy(tableId);
    return {
      replicaCount: policy.replicaCount,
      minReplicaCount: policy.minReplicaCount,
      maxReplicaCount: policy.maxReplicaCount,
    };
  }

  /**
   * Get placement constraints for a table.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Placement constraints.
   */
  async getPlacementConstraints(tableId) {
    const policy = await this.getTablePolicy(tableId);
    return {...policy.placementConstraints};
  }

  /**
   * Get the default message group policy.
   * @return {Object} Default message group policy.
   */
  getDefaultMessageGroupPolicy() {
    return {...DEFAULT_MESSAGE_GROUP_POLICY,
      placementConstraints: {
        ...DEFAULT_MESSAGE_GROUP_POLICY.placementConstraints,
      },
    };
  }

  /**
   * Get the policy for a specific message group.
   * Reads from the message_groups table and merges with defaults.
   * @param {string} groupId - Message group ID.
   * @return {Promise<Object>} Message group policy (merged with defaults).
   */
  async getMessageGroupPolicy(groupId) {
    if (!groupId) {
      return this.getDefaultMessageGroupPolicy();
    }

    // Check local cache
    const cacheKey = `mg:${groupId}`;
    const cached = this.policyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTLMs) {
      return cached.policy;
    }

    // Prefer the propagated system cache when available. Joining nodes may
    // observe newly registered self-hosted message-group metadata here before
    // a routed SQL engine is available.
    const group = await this.readMessageGroupRow(groupId);
    if (!group) {
      this.logger.debug(
        POLICY_LOG_MSG.MESSAGE_GROUP_NOT_FOUND_DEFAULT, {groupId},
      );
      return this.getDefaultMessageGroupPolicy();
    }

    // Parse stored policy
    let storedPolicy = POLICY_VALUE.EMPTY_POLICY;
    if (group.policy) {
      try {
        storedPolicy = typeof group.policy === 'string' ?
          JSON.parse(group.policy) : group.policy;
      } catch (error) {
        this.logger.warn(POLICY_LOG_MSG.POLICY_PARSE_FAILED, {
          groupId,
          error: error.message,
        });
        throw error;
      }
    }

    // Merge with defaults
    const mergedPolicy =
      this.mergeMessageGroupWithDefaults(storedPolicy);

    // Update cache
    this.policyCache.set(cacheKey, {
      policy: mergedPolicy,
      timestamp: Date.now(),
    });

    return mergedPolicy;
  }

  /**
   * Lookup one message-group row from the local system cache.
   * @param {string} groupId - Message group ID.
   * @return {Object|null} Cached row when present.
   * @private
   */
  lookupCachedMessageGroup(groupId) {
    if (!groupId || !this.systemTableCache) {
      return null;
    }

    if (typeof this.systemTableCache.filter === 'function') {
      const rows = this.systemTableCache.filter(
        TABLES.MESSAGE_GROUPS,
        (group) => group?.group_id === groupId || group?.groupId === groupId,
      );
      return rows[0] || null;
    }

    if (typeof this.systemTableCache.getAll === 'function') {
      const rows = this.systemTableCache.getAll(TABLES.MESSAGE_GROUPS) || [];
      return rows.find((group) =>
        group?.group_id === groupId || group?.groupId === groupId,
      ) || null;
    }

    return null;
  }

  /**
   * Merge a stored message group policy with defaults.
   * @param {Object} storedPolicy - Policy from storage.
   * @return {Object} Merged policy with all fields.
   */
  mergeMessageGroupWithDefaults(storedPolicy) {
    const merged = this.getDefaultMessageGroupPolicy();

    for (const [key, value] of Object.entries(storedPolicy)) {
      if (key === LOCAL_STR_PLACEMENTCONSTRAINTS && typeof value === LOCAL_STR_OBJECT) {
        merged.placementConstraints = {
          ...DEFAULT_MESSAGE_GROUP_POLICY.placementConstraints,
          ...value,
        };
      } else if (key in DEFAULT_MESSAGE_GROUP_POLICY) {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Validate a message group policy object.
   * Uses the same canonical validation path for placement constraints.
   * @param {Object} policy - Policy to validate.
   * @return {Object} Validation result {valid, errors}.
   */
  validateMessageGroupPolicy(policy) {
    return validateMessageGroupPolicyFields(
      policy,
      (placementConstraints) =>
        this.validatePlacementConstraints(placementConstraints),
    );
  }

  /**
   * Get effective storage placement constraints for a table.
   * Extracts only storage-related constraint values from the
   * merged policy. Req 6.5.
   * @param {string} tableId - Table ID.
   * @return {Promise<Object>} Storage placement constraints.
   */
  async getEffectiveStorageConstraints(tableId) {
    const policy = await this.getTablePolicy(tableId);
    return extractStorageConstraints(policy.placementConstraints);
  }

  /**
   * Get effective storage placement constraints for a message group.
   * Extracts only storage-related constraint values from the
   * merged policy. Req 6.5.
   * @param {string} groupId - Message group ID.
   * @return {Promise<Object>} Storage placement constraints.
   */
  async getEffectiveMessageGroupStorageConstraints(groupId) {
    const policy = await this.getMessageGroupPolicy(groupId);
    return extractStorageConstraints(policy.placementConstraints);
  }

  /**
   * Check if a partition should be split based on its table's policy.
   * @param {string} partitionId - Partition ID.
   * @param {Object} metrics - Partition metrics.
   * @return {Promise<boolean>} True if partition should be split.
   */
  async shouldSplitPartition(partitionId, metrics) {
    const policy = await this.getPolicyForPartition(partitionId);
    const sizeBytes = metrics.sizeBytes || 0;
    const queriesPerMinute = metrics.queriesPerMinute || 0;

    // Split if EITHER threshold is exceeded
    return sizeBytes >= policy.splitStorageThreshold ||
           queriesPerMinute >= policy.splitTrafficThreshold;
  }

  /**
   * Check if two partitions should be merged.
   * @param {string} leftPartitionId - Left partition ID.
   * @param {string} rightPartitionId - Right partition ID.
   * @param {Object} leftMetrics - Left partition metrics.
   * @param {Object} rightMetrics - Right partition metrics.
   * @return {Promise<boolean>} True if partitions should be merged.
   */
  async shouldMergePartitions(
    leftPartitionId, rightPartitionId, leftMetrics, rightMetrics,
  ) {
    const policy =
      await this.getPolicyForPartition(leftPartitionId);
    const combinedStorage =
      (leftMetrics.sizeBytes || 0) +
      (rightMetrics.sizeBytes || 0);
    const combinedTraffic =
      (leftMetrics.queriesPerMinute || 0) +
      (rightMetrics.queriesPerMinute || 0);

    // Merge if BOTH thresholds are satisfied
    return combinedStorage <= policy.mergeStorageThreshold &&
           combinedTraffic <= policy.mergeTrafficThreshold;
  }

  /**
   * Clear the policy cache.
   */
  clearCache() {
    this.policyCache.clear();
    this.logger.debug(POLICY_LOG_MSG.POLICY_CACHE_CLEARED);
  }

  /**
   * Invalidate cache for a specific table.
   * @param {string} tableId - Table ID.
   */
  invalidateCache(tableId) {
    this.policyCache.delete(tableId);
    this.logger.debug(POLICY_LOG_MSG.POLICY_CACHE_INVALIDATED, {tableId});
  }

  async readTableRow(tableId) {
    if (this.systemTableCache) {
      const result = await this.getControlPlaneSystemTableGateway().executeRead({
        tableName: TABLES.TABLES,
        strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
        readFromCache: () => {
          const row = this.lookupCachedTable(tableId);
          return row ? [row] : [];
        },
      });
      return result.rows?.[0] || null;
    }
    const result = await this.getControlPlaneSystemTableGateway().readRows(
      TABLES.TABLES,
      'SELECT * FROM tables WHERE table_id = ?',
      [tableId],
    );
    return result.rows?.[0] || null;
  }

  async readPartitionRow(partitionId) {
    if (this.systemTableCache) {
      const result = await this.getControlPlaneSystemTableGateway().executeRead({
        tableName: TABLES.PARTITIONS,
        strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
        readFromCache: () => {
          const row = this.lookupCachedPartition(partitionId);
          return row ? [row] : [];
        },
      });
      return result.rows?.[0] || null;
    }
    const result = await this.getControlPlaneSystemTableGateway().readRows(
      TABLES.PARTITIONS,
      'SELECT * FROM partitions WHERE partition_id = ?',
      [partitionId],
    );
    return result.rows?.[0] || null;
  }

  async readMessageGroupRow(groupId) {
    if (this.systemTableCache) {
      const result = await this.getControlPlaneSystemTableGateway().executeRead({
        tableName: TABLES.MESSAGE_GROUPS,
        strategy: CONTROL_PLANE_READ_STRATEGY.CACHE,
        readFromCache: () => {
          const row = this.lookupCachedMessageGroup(groupId);
          return row ? [row] : [];
        },
      });
      return result.rows?.[0] || null;
    }
    const result = await this.getControlPlaneSystemTableGateway().readRows(
      TABLES.MESSAGE_GROUPS,
      'SELECT * FROM message_groups WHERE group_id = ?',
      [groupId],
    );
    return result.rows?.[0] || null;
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getSqlQueryEngine: () => this.sqlQueryEngine,
      getSystemTableCache: () => this.systemTableCache,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Shutdown the service.
   */
  shutdown() {
    this.clearCache();
    this.removeAllListeners();
    this.logger.info(POLICY_LOG_MSG.TABLE_POLICY_SHUTDOWN);
  }
}

export {TablePolicyService};
