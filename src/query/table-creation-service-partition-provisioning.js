/**
 * Table Creation Service - Initial partition provisioning.
 * Owns the provisioning callback invocation, minimum-routable-cohort defaulting,
 * and the canonical initial partition metadata shape for newly created tables.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {NUM, STATE} from '../constants/index.js';
import {QUERY_ERROR_CODE, QUERY_LOG_MSG} from './query-constants.js';
import {
  TABLE_CREATION_SERVICE_LITERAL,
  normalizeProvisioningSummary,
} from './table-creation-service-completion.js';


const PARTITION_PROVISIONING_METHODS = Object.freeze({
  /**
   * Provision initial partition replica(s) for a newly-created table.
   * @param {Object} context - Provisioning context.
   * @param {string} context.tableId - Table ID.
   * @param {string} context.tableName - Table name.
   * @param {Object} [context.tableMetadata] - Canonical table row snapshot.
   * @param {string} context.partitionId - Initial partition ID.
   * @param {Object} [context.partitionMetadata] - Canonical partition row
   *   snapshot.
   * @param {number} context.replicaCount - Desired replica count.
   * @return {Promise<Object|null>}
   * @private
   */
  async provisionInitialPartition(context) {
    const minimumRoutableReplicaCountWasDefaulted =
      !(
        Number.isInteger(context?.minimumRoutableReplicaCount) &&
        context.minimumRoutableReplicaCount > 0
      );
    const minimumRoutableReplicaCount =
      minimumRoutableReplicaCountWasDefaulted === false ?
        context.minimumRoutableReplicaCount :
        this.resolveDefaultMinimumRoutableReplicaCount(context?.replicaCount);
    if (
      typeof this.partitionProvisioner !==
      TABLE_CREATION_SERVICE_LITERAL.FUNCTION
    ) {
      return normalizeProvisioningSummary(null, {
        ...context,
        minimumRoutableReplicaCount,
      });
    }
    const {tableId, tableName, partitionId, replicaCount} = context;
    this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
      tableId,
      tableName,
      partitionId,
      replicaCount,
    });
    try {
      const provisioningResult = await this.partitionProvisioner({
        ...context,
        minimumRoutableReplicaCount,
        minimumRoutableReplicaCountWasDefaulted,
      });
      this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_SUCCESS, {
        tableId,
        tableName,
        partitionId,
        replicaCount,
      });
      return normalizeProvisioningSummary(provisioningResult, {
        ...context,
        minimumRoutableReplicaCount,
      });
    } catch (error) {
      this.logger.error(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_FAILED, {
        tableId,
        tableName,
        partitionId,
        replicaCount,
        error: error.message,
      });
      if (!error.code) {
        error.code = QUERY_ERROR_CODE.INTERNAL_ERROR;
      }
      throw error;
    }
  },

  /**
   * Resolve the default minimum routable cohort for CREATE TABLE partition
   * provisioning. CREATE TABLE only needs a writable quorum before the
   * statement can return; remaining replicas may continue converging.
   * @param {number} replicaCount
   * @return {number|null}
   * @private
   */
  resolveDefaultMinimumRoutableReplicaCount(replicaCount) {
    const normalizedReplicaCount =
      Number.isInteger(replicaCount) && replicaCount > 0 ? replicaCount : null;
    if (!normalizedReplicaCount) {
      return null;
    }
    const minimumRoutableReplicaCount =
      typeof this.calculateQuorumReplicaCount === 'function' ?
        this.calculateQuorumReplicaCount(normalizedReplicaCount) :
        Math.floor(normalizedReplicaCount / 2) + 1;
    return Number.isInteger(minimumRoutableReplicaCount) &&
      minimumRoutableReplicaCount > NUM.ZERO ?
      minimumRoutableReplicaCount :
      null;
  },

  buildInitialPartitionMetadataFromTableRecord(
    tableId,
    tableName,
    existingTableRecord = null,
  ) {
    const partitionVersion = Number(
      existingTableRecord?.active_partition_version ??
        existingTableRecord?.activePartitionVersion ??
        1,
    );
    return {
      partition_id: `${tableId}-p1`,
      table_id: tableId,
      table_name:
        existingTableRecord?.table_name ||
        existingTableRecord?.tableName ||
        tableName,
      partition_key_start: null,
      partition_key_end: null,
      partition_version:
        Number.isInteger(partitionVersion) && partitionVersion > NUM.ZERO ?
          partitionVersion :
          NUM.ONE,
      replica_count: this.defaultReplicaCount,
      size_bytes: NUM.ZERO,
      leader_node_id: null,
      state: STATE.NORMAL,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  },
});

function defineTableCreationPartitionProvisioning(serviceClass) {
  for (const [methodName, methodImpl] of Object.entries(
    PARTITION_PROVISIONING_METHODS,
  )) {
    Object.defineProperty(serviceClass.prototype, methodName, {
      configurable: true,
      value: methodImpl,
      writable: true,
    });
  }
}

export {defineTableCreationPartitionProvisioning};
