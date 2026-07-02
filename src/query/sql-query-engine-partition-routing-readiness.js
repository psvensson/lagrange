import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineInitialPartitionProvisioning} from './sql-query-engine-initial-partition-provisioning.js';
import {createSQLQueryEngineRoutingMetadataMethods} from './sql-query-engine-routing-metadata-methods.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STEADY_STATE = 'steady_state';
const LOCAL_STR_TABLE_PARTITION_METADATA_WAIT = 'table_partition_metadata_wait';
const LOCAL_STR_PARTITION_ROUTING_WAIT = 'partition_routing_wait';
const LOCAL_STR_PARTITION_LEADER_WAIT = 'partition_leader_wait';

const {
  DEFAULT_PARTITION_VERSION,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_TRANSITION_METADATA_FIELD,
  QUERY_ERROR_MSG,
  SERVICE_TYPE,
  TABLES,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIMEOUT_BUDGET_DEFAULT,
  getRemainingBudgetMs,
  isRetryableManagedSplitTransition,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEnginePartitionRoutingReadiness extends SQLQueryEngineInitialPartitionProvisioning {
  listManagedSplitPartitions() {
    if (!this.systemCache || typeof this.systemCache.getAll !== LOCAL_STR_FUNCTION) {
      return [];
    }

    const tables = this.systemCache.getAll(TABLES.TABLES) || [];
    const partitions = this.systemCache.getAll(TABLES.PARTITIONS) || [];
    const activeVersionByTableId = new Map();
    const blockedTableIds = new Set();
    const deferredTableIds = new Set();

    for (const table of tables) {
      const tableId = table.table_id || table.tableId;
      if (!tableId) {
        continue;
      }
      const transition = this.parsePartitionTransition(table);
      if (transition && !isRetryableManagedSplitTransition(transition)) {
        blockedTableIds.add(tableId);
        continue;
      }
      if (transition && !this.isManagedSplitRetryDue(transition)) {
        deferredTableIds.add(tableId);
      }
      activeVersionByTableId.set(
        tableId,
        this.resolveActivePartitionVersion(table),
      );
    }

    return partitions.filter((partition) => {
      const tableId = partition.table_id || partition.tableId;
      if (
        !tableId ||
        blockedTableIds.has(tableId) ||
        deferredTableIds.has(tableId)
      ) {
        return false;
      }
      if (!this.isLocalManagedSplitLeader(partition)) {
        return false;
      }
      return this.isPartitionVisibleForRouting(
        partition,
        activeVersionByTableId.get(tableId) || DEFAULT_PARTITION_VERSION,
      );
    });
  }

  /**
   * Resolve whether a retryable split transition is eligible to run now.
   * Missing retry metadata remains backward-compatible and is treated as due.
   * @param {Object|null} transition
   * @return {boolean}
   * @private
   */
  isManagedSplitRetryDue(transition) {
    const retryMetadata =
      transition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY];
    const nextAttemptAt = retryMetadata?.nextAttemptAt || null;
    if (!nextAttemptAt) {
      return true;
    }
    const nextAttemptAtMs = Date.parse(nextAttemptAt);
    if (!Number.isFinite(nextAttemptAtMs)) {
      return true;
    }
    return nextAttemptAtMs <= this.nowFn();
  }

  /**
   * Execute one managed split for a source partition.
   * @param {string} partitionId - Source partition ID.
   * @param {Object} [executionOptions={}] - Optional workflow execution hints.
   * @return {Promise<Object>} Split orchestration result.
   */
  async executeManagedSplit(partitionId, executionOptions = {}) {
    if (
      !this.managedSplitWorkflow ||
      typeof this.managedSplitWorkflow.execute !== LOCAL_STR_FUNCTION
    ) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
    }
    return this.managedSplitWorkflow.execute(partitionId, executionOptions);
  }

  /**
   * Build one managed split plan using the shared split manager median logic.
   * @param {Object} partitionInfo - Source partition row.
   * @param {string} tableName - Logical table name.
   * @param {string} tableId - Table ID.
   * @param {string} primaryKeyColumn - Partition key column.
   * @return {Promise<Object>} Split plan.
   * @private
   */
  async buildManagedSplitPlan(
    partitionInfo,
    tableName,
    tableId,
    primaryKeyColumn,
  ) {
    const manager = this.partitionSplitMergeManager;
    if (!manager || typeof manager.splitPartition !== LOCAL_STR_FUNCTION) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
    }

    return manager.splitPartition({
      partitionId: partitionInfo.partition_id || partitionInfo.partitionId,
      tableName,
      tableId,
      primaryKeyColumn,
      partitionService: {
        executeQuery: async (sql, params = []) => {
          const result = await this.queryExecutor.executeOnPartition(
            partitionInfo.partition_id || partitionInfo.partitionId,
            sql,
            params,
            true,
            true,
            false,
          );
          return {
            rows: result.rows || [],
          };
        },
        getKeyRange: () => ({
          start:
            partitionInfo.partition_key_start ??
            partitionInfo.partitionKeyStart,
          end: partitionInfo.partition_key_end ?? partitionInfo.partitionKeyEnd,
        }),
      },
    });
  }

  /**
   * Ask the source partition leader to start snapshot backfill + CDC mirroring.
   * @param {string} partitionId - Source partition ID.
   * @param {string} tableId - Table ID.
   * @param {string} tableName - Table name.
   * @param {Object} transitionMetadata - Split transition metadata.
   * @return {Promise<void>}
   * @private
   */
  async startSplitReplicationOnSourcePartition(
    partitionId,
    tableId,
    tableName,
    transitionMetadata,
  ) {
    const serviceInfo = this.queryExecutor.findPartitionService(partitionId);
    if (!serviceInfo) {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
    }

    const response = await this.messageRouter.deliver(serviceInfo.address, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION,
      partitionId,
      tableId,
      tableName,
      transitionMetadata,
    });

    if (!response?.acknowledged || response?.success === false) {
      throw new Error(
        response?.error || QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED,
      );
    }
  }

  /**
   * Wait for table + partition metadata to appear in local cache before
   * dispatching replica creation.
   * @param {string|null} tableId - Table ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForTablePartitionMetadata(
    tableId,
    partitionId,
    timeoutBudget = null,
  ) {
    const hasTableAndPartitionMetadata = () => {
      const hasPartitionRecord =
        this.queryExecutor &&
        typeof this.queryExecutor.hasPartitionRecord === 'function' ?
          this.queryExecutor.hasPartitionRecord(partitionId) :
          false;
      const hasTableRecord = tableId ? this.hasTableMetadata(tableId) : true;
      return hasPartitionRecord && hasTableRecord;
    };
    if (hasTableAndPartitionMetadata()) {
      return;
    }

    const usesCacheRepairWaits =
      this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' &&
      this.systemCache &&
      typeof this.systemCache.onCacheChange === 'function';
    const effectiveBudget = this.allocateControlPlaneTimeoutBudget({
      timeoutBudget,
      requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
      minimumBudgetMs: usesCacheRepairWaits ?
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS :
        this.tablePartitionProvisioningPollIntervalMs,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
      nestedOperation: 'table_partition_metadata_wait',
      timeoutError:
        QUERY_ERROR_MSG.TABLE_PARTITION_METADATA_TIMEOUT_PREFIX + partitionId,
    });
    const waitBudgetMs = getRemainingBudgetMs(effectiveBudget, {
      now: this.nowFn,
    });

    if (usesCacheRepairWaits) {
      const waits = [
        this.cdcIntegrationService.waitForCacheUpdate(
          TABLES.PARTITIONS,
          partitionId,
          true,
          {
            fallbackPhase: 'steady_state',
            timeoutMs: waitBudgetMs,
          },
        ),
      ];
      if (tableId) {
        waits.push(
          this.cdcIntegrationService.waitForCacheUpdate(
            TABLES.TABLES,
            tableId,
            true,
            {
              fallbackPhase: LOCAL_STR_STEADY_STATE,
              timeoutMs: waitBudgetMs,
            },
          ),
        );
      }
      await Promise.all(waits);
      return;
    }

    await this.waitForCondition(
      hasTableAndPartitionMetadata,
      waitBudgetMs,
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_METADATA_TIMEOUT_PREFIX + partitionId,
      {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
        nestedOperation: LOCAL_STR_TABLE_PARTITION_METADATA_WAIT,
      },
    );
  }

  /**
   * Wait for at least one routable service row for the partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForRoutablePartitionService(partitionId, timeoutBudget = null) {
    await this.waitForRoutablePartitionServiceCount(
      partitionId,
      1,
      timeoutBudget,
    );
  }

  /**
   * Wait for one partition service row to become visible in local cache.
   * Uses CDC authoritative repair when available.
   * @param {string} replicaId - Partition service replica ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionServiceMetadata(replicaId, timeoutBudget = null) {
    const conditionFn = () => this.hasServiceMetadata(replicaId);
    if (conditionFn()) {
      return;
    }

    const usesCacheRepairWaits =
      this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' &&
      this.systemCache &&
      typeof this.systemCache.onCacheChange === 'function';
    const nestedOperation = 'partition_service_metadata_wait';
    const effectiveBudget = this.allocateControlPlaneTimeoutBudget({
      timeoutBudget,
      requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
      minimumBudgetMs: usesCacheRepairWaits ?
        TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS :
        this.tablePartitionProvisioningPollIntervalMs,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
      nestedOperation,
      timeoutError:
        QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX +
        replicaId,
    });
    const waitBudgetMs = getRemainingBudgetMs(effectiveBudget, {
      now: this.nowFn,
    });

    if (usesCacheRepairWaits) {
      await this.cdcIntegrationService.waitForCacheUpdate(
        TABLES.SERVICES,
        replicaId,
        true,
        {
          fallbackPhase: LOCAL_STR_STEADY_STATE,
          timeoutMs: waitBudgetMs,
        },
      );
      if (this.hasServiceMetadata(replicaId)) {
        return;
      }
    }

    await this.waitForCondition(
      conditionFn,
      waitBudgetMs,
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX +
        replicaId,
      {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
        nestedOperation,
      },
    );
  }

  /**
   * Best-effort metadata hydration for split quorum waits.
   * @param {string} partitionId - Partition ID.
   * @param {string[]} replicaIds - Candidate replica IDs.
   * @param {number} minimumRoutableReplicaCount - Required routable cohort.
   * @param {Object|null} timeoutBudget - Shared timeout budget.
   * @return {Promise<void>}
   * @private
   */
  async waitForMinimumRoutableReplicaMetadata(
    partitionId,
    replicaIds,
    minimumRoutableReplicaCount,
    timeoutBudget = null,
    routingReadinessDimension = this.queryExecutor
      ?.defaultRoutingReadinessDimension,
  ) {
    const uniqueReplicaIds = [
      ...new Set(
        (Array.isArray(replicaIds) ? replicaIds : []).filter(
          (replicaId) => typeof replicaId === 'string' && replicaId.length > 0,
        ),
      ),
    ];
    if (uniqueReplicaIds.length === 0) {
      return;
    }

    for (const replicaId of uniqueReplicaIds) {
      if (
        this.getRoutablePartitionServiceNodeIds(
          partitionId,
          routingReadinessDimension,
        ).length >= minimumRoutableReplicaCount
      ) {
        return;
      }
      try {
        await this.waitForPartitionServiceMetadata(replicaId, timeoutBudget);
      } catch (_error) {
        // Best-effort hydration: aggregate routable-count wait is authoritative.
      }
    }
  }

  /**
   * Wait for minimum routable partition service replica count.
   * @param {string} partitionId - Partition ID.
   * @param {number} minimumCount - Minimum routable replicas.
   * @return {Promise<void>}
   * @private
   */
  async waitForRoutablePartitionServiceCount(
    partitionId,
    minimumCount,
    timeoutBudget = null,
    routingReadinessDimension = this.queryExecutor
      ?.defaultRoutingReadinessDimension,
  ) {
    const requiredCount =
      Number.isInteger(minimumCount) && minimumCount > 0 ? minimumCount : 1;
    const hasRequiredRoutableCount = () =>
      this.getRoutablePartitionServiceNodeIds(
        partitionId,
        routingReadinessDimension,
      ).length >= requiredCount;
    const checkRoutableCountWithRepair = async () => {
      if (hasRequiredRoutableCount()) {
        return true;
      }
      return (
        (await this.maybeAwaitPartitionRoutingRepair(
          partitionId,
          routingReadinessDimension,
        )) && hasRequiredRoutableCount()
      );
    };
    if (await checkRoutableCountWithRepair()) {
      return;
    }

    const effectiveBudget = this.allocateControlPlaneTimeoutBudget({
      timeoutBudget,
      requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
      minimumBudgetMs: this.tablePartitionProvisioningPollIntervalMs,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
      nestedOperation: 'partition_routing_wait',
      timeoutError:
        QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX + partitionId,
    });
    await this.waitForCondition(
      checkRoutableCountWithRepair,
      getRemainingBudgetMs(effectiveBudget, {now: this.nowFn}),
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX + partitionId,
      {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
        nestedOperation: LOCAL_STR_PARTITION_ROUTING_WAIT,
      },
    );
  }

  /**
   * Await one canonical routing-owner repair when stale readiness evidence
   * filters all active partition services locally.
   * @param {string} partitionId
   * @return {Promise<boolean>}
   * @private
   */
  async maybeAwaitPartitionRoutingRepair(
    partitionId,
    routingReadinessDimension = this.queryExecutor
      ?.defaultRoutingReadinessDimension,
  ) {
    if (
      !partitionId ||
      !this.queryExecutor ||
      typeof this.queryExecutor.getPartitionRoutingSnapshot !== LOCAL_STR_FUNCTION ||
      typeof this.queryExecutor.maybeAwaitDeniedPartitionRoutingRepair !==
        LOCAL_STR_FUNCTION
    ) {
      return false;
    }

    let routingSnapshot = null;
    try {
      routingSnapshot = this.queryExecutor.getPartitionRoutingSnapshot(
        partitionId,
        routingReadinessDimension,
      );
    } catch (_error) {
      return false;
    }

    try {
      return await this.queryExecutor.maybeAwaitDeniedPartitionRoutingRepair(
        routingSnapshot,
      );
    } catch (_error) {
      return false;
    }
  }

  /**
   * Wait for one active leader service row to become visible for the partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeaderService(
    partitionId,
    timeoutBudget = null,
    options = {},
  ) {
    const routingReadinessDimension =
      typeof options?.routingReadinessDimension === 'string' &&
      options.routingReadinessDimension.length > 0 ?
        options.routingReadinessDimension :
        this.queryExecutor?.defaultRoutingReadinessDimension;
    const hasLeaderRoute = () => {
      this.maybeInstallBootstrapLeaderOverlay(partitionId, options);
      if (
        !this.queryExecutor ||
        typeof this.queryExecutor.findPartitionLeaderAddress !== 'function'
      ) {
        return false;
      }
      const address = this.queryExecutor.findPartitionLeaderAddress(
        partitionId,
        routingReadinessDimension,
      );
      return typeof address === 'string' && address.length > 0;
    };
    if (hasLeaderRoute()) {
      return;
    }

    const effectiveBudget = this.allocateControlPlaneTimeoutBudget({
      timeoutBudget,
      requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
      minimumBudgetMs: this.tablePartitionProvisioningPollIntervalMs,
      classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
      nestedOperation: 'partition_leader_wait',
      timeoutError:
        QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX + partitionId,
    });
    await this.waitForCondition(
      hasLeaderRoute,
      getRemainingBudgetMs(effectiveBudget, {now: this.nowFn}),
      this.tablePartitionProvisioningPollIntervalMs,
      QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX + partitionId,
      {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
        nestedOperation: LOCAL_STR_PARTITION_LEADER_WAIT,
      },
    );
  }

  /**
   * Check whether table metadata is available in local cache.
   * @param {string} tableId - Table ID.
   * @return {boolean} True when table exists in cache.
   * @private
   */
  hasTableMetadata(tableId) {
    if (!tableId || !this.systemCache) {
      return false;
    }

    if (typeof this.systemCache.has === LOCAL_STR_FUNCTION) {
      return this.systemCache.has(TABLES.TABLES, tableId);
    }

    if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
      return Boolean(this.systemCache.get(TABLES.TABLES, tableId));
    }

    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const matches = this.systemCache.filter(
        TABLES.TABLES,
        (row) => row.table_id === tableId,
      );
      return Array.isArray(matches) && matches.length > 0;
    }

    return false;
  }

  /**
   * Get current partition service rows from the local cache.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Partition service rows.
   * @private
   */
  getPartitionServiceRows(partitionId) {
    if (!partitionId || !this.systemCache) {
      return [];
    }
    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const rows = this.systemCache.filter(
        TABLES.SERVICES,
        (service) =>
          service?.partition_id === partitionId &&
          service?.service_type === SERVICE_TYPE.PARTITION,
      );
      return Array.isArray(rows) ? rows : [];
    }
    if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
      const rows = this.systemCache.getAll(TABLES.SERVICES);
      if (!Array.isArray(rows)) {
        return [];
      }
      return rows.filter(
        (service) =>
          service?.partition_id === partitionId &&
          service?.service_type === SERVICE_TYPE.PARTITION,
      );
    }
    return [];
  }

  /**
   * Resolve the canonical partition row from cache only, without routing
   * overlay fallbacks.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getCachedPartitionRecord(partitionId) {
    if (!partitionId || !this.systemCache) {
      return null;
    }
    if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
      const record = this.systemCache.get(TABLES.PARTITIONS, partitionId);
      if (record) {
        return record;
      }
    }
    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const records = this.systemCache.filter(
        TABLES.PARTITIONS,
        (partition) =>
          partition?.partition_id === partitionId ||
          partition?.partitionId === partitionId,
      );
      if (Array.isArray(records) && records.length > 0) {
        return records[0];
      }
    }
    if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
      const records = this.systemCache.getAll(TABLES.PARTITIONS) || [];
      return (
        records.find(
          (partition) =>
            partition?.partition_id === partitionId ||
            partition?.partitionId === partitionId,
        ) || null
      );
    }
    return null;
  }
}

Object.defineProperties(
  SQLQueryEnginePartitionRoutingReadiness.prototype,
  createSQLQueryEngineRoutingMetadataMethods(),
);

export {SQLQueryEnginePartitionRoutingReadiness};
