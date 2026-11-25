/**
 * Table Creation Service - Initial partition provisioning.
 * Owns the provisioning callback invocation, minimum-routable-cohort defaulting,
 * and the canonical initial partition metadata shape for newly created tables.
 * Requirements: 20.1, 20.2, 20.3, 20.10
 */

import {STATE} from '../constants/index.js';
import {resolveDeclaredPartitionKeyType} from '../partition/partition-boundary-representation.js';
import {QUERY_ERROR_CODE, QUERY_LOG_MSG} from './query-constants.js';
import {
  TABLE_CREATION_SERVICE_LITERAL,
  normalizeProvisioningSummary,
} from './table-creation-service-completion.js';

/**
 * Resolve the default minimum routable cohort for CREATE TABLE partition
 * provisioning. CREATE TABLE only needs a writable quorum before the
 * statement can return; remaining replicas may continue converging.
 * @param {TableCreationService} service
 * @param {number} replicaCount
 * @return {number|null}
 */
function resolveDefaultMinimumRoutableReplicaCount(service, replicaCount) {
  const normalizedReplicaCount =
    Number.isInteger(replicaCount) && replicaCount > 0 ? replicaCount : null;
  if (!normalizedReplicaCount) {
    return null;
  }
  const minimumRoutableReplicaCount =
    typeof service.calculateQuorumReplicaCount === 'function' ?
      service.calculateQuorumReplicaCount(normalizedReplicaCount) :
      Math.floor(normalizedReplicaCount / 2) + 1;
  return Number.isInteger(minimumRoutableReplicaCount) &&
    minimumRoutableReplicaCount > 0 ?
    minimumRoutableReplicaCount :
    null;
}

function buildInitialPartitionMetadataFromTableRecord(
  service,
  tableId,
  tableName,
  existingTableRecord = null,
) {
  const partitionVersion = Number(
    existingTableRecord?.active_partition_version ?? 1,
  );
  return {
    partition_id: `${tableId}-p1`,
    table_id: tableId,
    table_name: existingTableRecord?.table_name || tableName,
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: resolveDeclaredPartitionKeyType(existingTableRecord),
    partition_version:
      Number.isInteger(partitionVersion) && partitionVersion > 0 ?
        partitionVersion :
        1,
    replica_count: service.defaultReplicaCount,
    size_bytes: 0,
    leader_node_id: null,
    state: STATE.NORMAL,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

function resolveMinimumRoutableReplicaBudget(service, context) {
  const requested = context?.minimumRoutableReplicaCount;
  const hasExplicitBudget = Number.isInteger(requested) && requested > 0;
  return {
    minimumRoutableReplicaCountWasDefaulted: !hasExplicitBudget,
    minimumRoutableReplicaCount: hasExplicitBudget ?
      requested :
      resolveDefaultMinimumRoutableReplicaCount(service, context?.replicaCount),
  };
}

function rethrowProvisionInitialPartitionFailure(service, context, error) {
  const cancelledDuringShutdown =
    context?.cancellationToken?.isCancelled?.() === true;
  if (!cancelledDuringShutdown) {
    const {tableId, tableName, partitionId, replicaCount} = context;
    const failureDetails =
      error.code === QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE ?
        {detail: error.detail} :
        {};
    service.logger.error(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_FAILED, {
      tableId,
      tableName,
      partitionId,
      replicaCount,
      error: error.message,
      ...failureDetails,
    });
  }
  error.code ??= QUERY_ERROR_CODE.INTERNAL_ERROR;
  throw error;
}

/**
 * Provision initial partition replica(s) for a newly-created table.
 * @param {TableCreationService} service
 * @param {Object} context - Provisioning context.
 * @param {string} context.tableId - Table ID.
 * @param {string} context.tableName - Table name.
 * @param {Object} [context.tableMetadata] - Canonical table row snapshot.
 * @param {string} context.partitionId - Initial partition ID.
 * @param {Object} [context.partitionMetadata] - Canonical partition row
 *   snapshot.
 * @param {number} context.replicaCount - Desired replica count.
 * @return {Promise<Object|null>}
 */
async function provisionInitialPartition(service, context) {
  const {
    minimumRoutableReplicaCount,
    minimumRoutableReplicaCountWasDefaulted,
  } = resolveMinimumRoutableReplicaBudget(service, context);
  if (
    typeof service.partitionProvisioner !==
    TABLE_CREATION_SERVICE_LITERAL.FUNCTION
  ) {
    return normalizeProvisioningSummary(null, {
      ...context,
      minimumRoutableReplicaCount,
    });
  }
  const {tableId, tableName, partitionId, replicaCount} = context;
  service.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, {
    tableId,
    tableName,
    partitionId,
    replicaCount,
  });
  try {
    const provisioningResult = await service.partitionProvisioner({
      ...context,
      minimumRoutableReplicaCount,
      minimumRoutableReplicaCountWasDefaulted,
    });
    service.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_SUCCESS, {
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
    return rethrowProvisionInitialPartitionFailure(service, context, error);
  }
}

export {
  buildInitialPartitionMetadataFromTableRecord,
  provisionInitialPartition,
  resolveDefaultMinimumRoutableReplicaCount,
};
