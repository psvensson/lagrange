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
import {assertCritical} from '../utils/assert.js';
import {
  DEFAULT_TABLE_POLICY,
  POLICY_DEFAULT,
  POLICY_ERROR_MSG,
  POLICY_EVENT,
  POLICY_FIELD_TYPES,
  POLICY_LOG_MSG,
  POLICY_SUBSYSTEM,
  POLICY_VALUE,
  TYPEOF,
} from './policy-constants.js';

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

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultReplicaCount =
      config.get(CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT) || POLICY_DEFAULT.REPLICA_COUNT;

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
    return {...DEFAULT_TABLE_POLICY};
  }

  /**
   * Get the policy for a specific table.
   * @param {string} tableId - Table ID.
   * @return {Object} Table policy (merged with defaults).
   */
  getTablePolicy(tableId) {
    if (!tableId) {
      return this.getDefaultPolicy();
    }

    // Check local cache first
    const cached = this.policyCache.get(tableId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTLMs) {
      return cached.policy;
    }

    // Get from system table cache
    const systemTableCache = assertCritical(
      this.systemTableCache,
      POLICY_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const table = systemTableCache.get(TABLES.TABLES, tableId);
    if (!table) {
      this.logger.debug(POLICY_LOG_MSG.TABLE_NOT_FOUND_DEFAULT, {tableId});
      return this.getDefaultPolicy();
    }

    // Parse stored policy
    let storedPolicy = POLICY_VALUE.EMPTY_POLICY;
    if (table.table_policies) {
      try {
        storedPolicy = typeof table.table_policies === TYPEOF.STRING ?
          JSON.parse(table.table_policies) : table.table_policies;
      } catch (error) {
        this.logger.warn(POLICY_LOG_MSG.POLICY_PARSE_FAILED, {
          tableId,
          error: error.message,
        });
        throw error;
      }
    }

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
   * @return {Object} Table policy for the partition's table.
   */
  getPolicyForPartition(partitionId) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      POLICY_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const partition = systemTableCache.get(TABLES.PARTITIONS, partitionId);
    if (!partition) {
      this.logger.debug(POLICY_LOG_MSG.PARTITION_NOT_FOUND_DEFAULT, {partitionId});
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
    const merged = {...DEFAULT_TABLE_POLICY};

    for (const [key, value] of Object.entries(storedPolicy)) {
      if (key === 'placementConstraints' && typeof value === 'object') {
        merged.placementConstraints = {
          ...DEFAULT_TABLE_POLICY.placementConstraints,
          ...value,
        };
      } else if (key in DEFAULT_TABLE_POLICY) {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Validate a policy object.
   * @param {Object} policy - Policy to validate.
   * @return {Object} Validation result {valid, errors}.
   */
  validatePolicy(policy) {
    const errors = [];

    // Validate field types
    for (const [field, expectedType] of Object.entries(POLICY_FIELD_TYPES)) {
      if (policy[field] !== undefined) {
        const actualType = typeof policy[field];
        if (actualType !== expectedType) {
          errors.push(POLICY_ERROR_MSG.FIELD_TYPE_MISMATCH(field, expectedType, actualType));
        }
      }
    }

    // Validate replica counts
    if (policy.replicaCount !== undefined) {
      if (policy.replicaCount < 1) {
        errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_MIN);
      }
      if (policy.replicaCount % 2 === 0) {
        errors.push(POLICY_ERROR_MSG.REPLICA_COUNT_ODD);
      }
    }

    if (policy.minReplicaCount !== undefined) {
      if (policy.minReplicaCount < 1) {
        errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_MIN);
      }
      if (policy.minReplicaCount % 2 === 0) {
        errors.push(POLICY_ERROR_MSG.MIN_REPLICA_COUNT_ODD);
      }
    }

    if (policy.maxReplicaCount !== undefined) {
      if (policy.maxReplicaCount < 1) {
        errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_MIN);
      }
      if (policy.maxReplicaCount % 2 === 0) {
        errors.push(POLICY_ERROR_MSG.MAX_REPLICA_COUNT_ODD);
      }
    }

    // Validate min <= replica <= max
    const min = policy.minReplicaCount || DEFAULT_TABLE_POLICY.minReplicaCount;
    const max = policy.maxReplicaCount || DEFAULT_TABLE_POLICY.maxReplicaCount;
    const replica = policy.replicaCount || DEFAULT_TABLE_POLICY.replicaCount;

    if (min > max) {
      errors.push(POLICY_ERROR_MSG.MIN_GT_MAX);
    }
    if (replica < min || replica > max) {
      errors.push(POLICY_ERROR_MSG.REPLICA_BETWEEN);
    }

    // Validate thresholds
    if (policy.splitStorageThreshold !== undefined && policy.splitStorageThreshold < 0) {
      errors.push(POLICY_ERROR_MSG.SPLIT_STORAGE_NONNEGATIVE);
    }
    if (policy.splitTrafficThreshold !== undefined && policy.splitTrafficThreshold < 0) {
      errors.push(POLICY_ERROR_MSG.SPLIT_TRAFFIC_NONNEGATIVE);
    }
    if (policy.mergeStorageThreshold !== undefined && policy.mergeStorageThreshold < 0) {
      errors.push(POLICY_ERROR_MSG.MERGE_STORAGE_NONNEGATIVE);
    }
    if (policy.mergeTrafficThreshold !== undefined && policy.mergeTrafficThreshold < 0) {
      errors.push(POLICY_ERROR_MSG.MERGE_TRAFFIC_NONNEGATIVE);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
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
      throw new Error(`${POLICY_ERROR_MSG.INVALID_POLICY_PREFIX}${validation.errors.join(', ')}`);
    }

    // Get current policy
    const currentPolicy = this.getTablePolicy(tableId);

    // Merge updates with current policy
    const newPolicy = this.mergeWithDefaults({
      ...currentPolicy,
      ...policyUpdates,
    });

    // Validate the merged policy
    const mergedValidation = this.validatePolicy(newPolicy);
    if (!mergedValidation.valid) {
      throw new Error(
        `${POLICY_ERROR_MSG.INVALID_MERGED_POLICY_PREFIX}${mergedValidation.errors.join(', ')}`
      );
    }

    this.logger.info(POLICY_LOG_MSG.UPDATE_TABLE_POLICY, {
      tableId,
      updates: policyUpdates,
    });

    try {
      // Update via CDC integration service
      await this.cdcIntegrationService.updateSystemTableRow(TABLES.TABLES, tableId, {
        table_policies: JSON.stringify(newPolicy),
        updated_at: Date.now(),
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
      throw new Error(`${POLICY_ERROR_MSG.INVALID_POLICY_PREFIX}${validation.errors.join(', ')}`);
    }

    return this.updateTablePolicy(tableId, completePolicy);
  }

  /**
   * Get split thresholds for a table.
   * @param {string} tableId - Table ID.
   * @return {Object} Split thresholds {storageThreshold, trafficThreshold}.
   */
  getSplitThresholds(tableId) {
    const policy = this.getTablePolicy(tableId);
    return {
      storageThreshold: policy.splitStorageThreshold,
      trafficThreshold: policy.splitTrafficThreshold,
    };
  }

  /**
   * Get merge thresholds for a table.
   * @param {string} tableId - Table ID.
   * @return {Object} Merge thresholds {storageThreshold, trafficThreshold}.
   */
  getMergeThresholds(tableId) {
    const policy = this.getTablePolicy(tableId);
    return {
      storageThreshold: policy.mergeStorageThreshold,
      trafficThreshold: policy.mergeTrafficThreshold,
    };
  }

  /**
   * Get replication settings for a table.
   * @param {string} tableId - Table ID.
   * @return {Object} Replication settings {replicaCount, minReplicaCount, maxReplicaCount}.
   */
  getReplicationSettings(tableId) {
    const policy = this.getTablePolicy(tableId);
    return {
      replicaCount: policy.replicaCount,
      minReplicaCount: policy.minReplicaCount,
      maxReplicaCount: policy.maxReplicaCount,
    };
  }

  /**
   * Get placement constraints for a table.
   * @param {string} tableId - Table ID.
   * @return {Object} Placement constraints.
   */
  getPlacementConstraints(tableId) {
    const policy = this.getTablePolicy(tableId);
    return {...policy.placementConstraints};
  }

  /**
   * Check if a partition should be split based on its table's policy.
   * @param {string} partitionId - Partition ID.
   * @param {Object} metrics - Partition metrics {sizeBytes, queriesPerMinute}.
   * @return {boolean} True if partition should be split.
   */
  shouldSplitPartition(partitionId, metrics) {
    const policy = this.getPolicyForPartition(partitionId);
    const sizeBytes = metrics.sizeBytes || 0;
    const queriesPerMinute = metrics.queriesPerMinute || 0;

    // Split if EITHER threshold is exceeded
    return sizeBytes >= policy.splitStorageThreshold ||
           queriesPerMinute >= policy.splitTrafficThreshold;
  }

  /**
   * Check if two partitions should be merged based on their table's policy.
   * @param {string} leftPartitionId - Left partition ID.
   * @param {string} rightPartitionId - Right partition ID.
   * @param {Object} leftMetrics - Left partition metrics.
   * @param {Object} rightMetrics - Right partition metrics.
   * @return {boolean} True if partitions should be merged.
   */
  shouldMergePartitions(leftPartitionId, rightPartitionId, leftMetrics, rightMetrics) {
    const policy = this.getPolicyForPartition(leftPartitionId);
    const combinedStorage = (leftMetrics.sizeBytes || 0) + (rightMetrics.sizeBytes || 0);
    const combinedTraffic = (leftMetrics.queriesPerMinute || 0) +
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
