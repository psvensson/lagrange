import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineSegment3} from './sql-query-engine-segment-3.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STEADY_STATE = 'steady_state';
const LOCAL_STR_6ABQV = 'table_partition_metadata_wait';
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_164LE = 'partition_routing_wait';
const LOCAL_STR_GC3QE = 'partition_leader_wait';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_AVAILABLE = 'available';
const LOCAL_STR_OBJECT = 'object';

const {
  COLUMN,
  DEFAULT_PARTITION_VERSION,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  NUM,
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

const AUTHORITATIVE_ROUTING_OVERLAY_STATE = Object.freeze({
  AVAILABLE: 'available',
  AUTHORITATIVE_MISSING: 'authoritative_missing',
  MISSING: 'missing',
});

const AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});

const AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE = Object.freeze({
  ELIGIBLE: 'eligible',
  MASKED: 'masked',
});

const AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE = Object.freeze({
  COMPLETE: 'complete',
  INCOMPLETE: 'incomplete',
  UNKNOWN: 'unknown',
});

const AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_FIELD = Object.freeze({
  REPLICA_COUNT: 'replica_count',
  REPLICA_COUNT_CAMEL: 'replicaCount',
});

class SQLQueryEngineSegment4 extends SQLQueryEngineSegment3 {
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
        nestedOperation: LOCAL_STR_6ABQV,
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
      LOCAL_NUM_ONE,
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
    if (uniqueReplicaIds.length === LOCAL_NUM_ZERO) {
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
        nestedOperation: LOCAL_STR_164LE,
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
        nestedOperation: LOCAL_STR_GC3QE,
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
      return Array.isArray(matches) && matches.length > LOCAL_NUM_ZERO;
    }

    return false;
  }

  /**
   * Check whether one partition service row is available in local cache.
   * @param {string} replicaId - Partition service replica ID.
   * @return {boolean} True when service row exists in cache.
   * @private
   */
  hasServiceMetadata(replicaId) {
    if (!replicaId || !this.systemCache) {
      return false;
    }

    if (typeof this.systemCache.has === LOCAL_STR_FUNCTION) {
      if (this.systemCache.has(TABLES.SERVICES, replicaId)) {
        return true;
      }
    }

    if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
      if (this.systemCache.get(TABLES.SERVICES, replicaId)) {
        return true;
      }
    }

    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const matches = this.systemCache.filter(
        TABLES.SERVICES,
        (row) => row.service_id === replicaId || row.replica_id === replicaId,
      );
      if (Array.isArray(matches) && matches.length > LOCAL_NUM_ZERO) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check whether one partition service row is available and routable.
   * @param {string} replicaId - Partition service replica ID.
   * @return {boolean} True when service row is routable in local cache.
   * @private
   */
  hasRoutableServiceMetadata(replicaId) {
    if (!replicaId || !this.systemCache) {
      return false;
    }

    const isRoutableService = (service) => {
      if (!service || typeof service !== 'object') {
        return false;
      }
      if (
        this.queryExecutor &&
        typeof this.queryExecutor.isRoutablePartitionService === 'function'
      ) {
        return this.queryExecutor.isRoutablePartitionService(service);
      }
      return false;
    };
    const matchesReplicaId = (row) =>
      row?.service_id === replicaId || row?.replica_id === replicaId;

    if (typeof this.systemCache.get === LOCAL_STR_FUNCTION) {
      const row = this.systemCache.get(TABLES.SERVICES, replicaId);
      if (isRoutableService(row)) {
        return true;
      }
    }

    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      const matches = this.systemCache.filter(
        TABLES.SERVICES,
        (row) => matchesReplicaId(row) && isRoutableService(row),
      );
      return Array.isArray(matches) && matches.length > LOCAL_NUM_ZERO;
    }

    if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
      const rows = this.systemCache.getAll(TABLES.SERVICES);
      if (!Array.isArray(rows)) {
        return false;
      }
      return rows.some(
        (row) => matchesReplicaId(row) && isRoutableService(row),
      );
    }

    return false;
  }

  /**
   * Check whether a partition currently has a routable service row.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when routable.
   * @private
   */
  hasRoutablePartitionService(partitionId) {
    return this.getRoutablePartitionServiceNodeIds(partitionId).length > LOCAL_NUM_ZERO;
  }

  /**
   * Get unique node IDs with routable partition services.
   * @param {string} partitionId - Partition ID.
   * @return {Array<string>} Unique node IDs.
   * @private
   */
  getRoutablePartitionServiceNodeIds(
    partitionId,
    routingReadinessDimension = undefined,
  ) {
    if (
      !this.queryExecutor ||
      typeof this.queryExecutor.getRoutablePartitionServices !== LOCAL_STR_FUNCTION
    ) {
      return [];
    }
    const services = this.queryExecutor.getRoutablePartitionServices(
      partitionId,
      routingReadinessDimension,
    );
    const nodeIds = new Set();
    for (const service of services) {
      const nodeId = service?.node_id || service?.nodeId || null;
      if (typeof nodeId === LOCAL_STR_STRING && nodeId.length > LOCAL_NUM_ZERO) {
        nodeIds.add(nodeId);
      }
    }
    return [...nodeIds];
  }

  /**
   * Compose an optional caller-supplied routing overlay with the local
   * bootstrap overlay used to bridge cache publication gaps after partition
   * creation.
   * @param {Object|null} primaryOverlay
   * @param {Object|null} secondaryOverlay
   * @return {Object|null}
   * @private
   */
  composeRoutingMetadataOverlay(primaryOverlay, secondaryOverlay) {
    if (!primaryOverlay && !secondaryOverlay) {
      return null;
    }
    if (!primaryOverlay) {
      return secondaryOverlay;
    }
    if (!secondaryOverlay) {
      return primaryOverlay;
    }

    const mergeServices = (partitionId) => {
      const mergedServices = [];
      const seenServiceKeys = new Set();
      for (const overlay of [primaryOverlay, secondaryOverlay]) {
        if (!overlay || typeof overlay.getServicesForPartition !== 'function') {
          continue;
        }
        const services = overlay.getServicesForPartition(partitionId);
        if (!Array.isArray(services)) {
          continue;
        }
        for (const service of services) {
          const serviceKey =
            service?.service_id ||
            service?.replica_id ||
            service?.address ||
            null;
          if (
            typeof serviceKey !== 'string' ||
            serviceKey.length === 0 ||
            seenServiceKeys.has(serviceKey)
          ) {
            continue;
          }
          seenServiceKeys.add(serviceKey);
          mergedServices.push(service);
        }
      }
      return mergedServices;
    };

    return {
      getPartitionById: (partitionId) => {
        const primaryPartition =
          typeof primaryOverlay.getPartitionById === 'function' ?
            primaryOverlay.getPartitionById(partitionId) :
            null;
        if (primaryPartition) {
          return primaryPartition;
        }
        return typeof secondaryOverlay.getPartitionById === LOCAL_STR_FUNCTION ?
          secondaryOverlay.getPartitionById(partitionId) :
          null;
      },
      getServicesForPartition: (partitionId) => mergeServices(partitionId),
      shouldMaskCacheServicesForPartition: (partitionId) => {
        for (const overlay of [primaryOverlay, secondaryOverlay]) {
          if (
            !overlay ||
            typeof overlay.shouldMaskCacheServicesForPartition !== LOCAL_STR_FUNCTION
          ) {
            continue;
          }
          if (overlay.shouldMaskCacheServicesForPartition(partitionId) === true) {
            return true;
          }
        }
        return false;
      },
      refreshPartitionRouting: async (partitionId, options = {}) => {
        for (const overlay of [primaryOverlay, secondaryOverlay]) {
          if (
            !overlay ||
            typeof overlay.refreshPartitionRouting !== LOCAL_STR_FUNCTION
          ) {
            continue;
          }
          const refreshed = await overlay.refreshPartitionRouting(
            partitionId,
            options,
          );
          if (refreshed === true) {
            return true;
          }
        }
        return false;
      },
    };
  }

  /**
   * Resolve authoritative overlay partition metadata by ID.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getAuthoritativeRoutingOverlayPartition(partitionId) {
    const overlayState =
      this.getAuthoritativeRoutingOverlayEntryState(partitionId);
    return overlayState.partitionState === LOCAL_STR_AVAILABLE ?
      overlayState.partition :
      null;
  }

  /**
   * Resolve authoritative overlay service rows by partition ID.
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  getAuthoritativeRoutingOverlayServices(partitionId) {
    return this.getAuthoritativeRoutingOverlayEntryState(partitionId).services;
  }

  /**
   * Resolve whether authoritative overlay state should suppress cached service
   * rows for one partition.
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  shouldAuthoritativeRoutingOverlayMaskCacheServices(partitionId) {
    return (
      this.getAuthoritativeRoutingOverlayEntryState(partitionId)
        .cacheServiceState ===
      AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED
    );
  }

  /**
   * Resolve one explicit authoritative overlay entry state.
   * @param {string} partitionId
   * @return {Object}
   * @private
   */
  getAuthoritativeRoutingOverlayEntryState(partitionId) {
    const entry = this.authoritativeRoutingOverlayEntries.get(partitionId);
    if (!entry || typeof entry !== LOCAL_STR_OBJECT) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.MISSING,
        partitionState:
          AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState:
          AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.ELIGIBLE,
        services: Object.freeze([]),
      });
    }
    const services = Object.freeze(
      Array.isArray(entry.services) ? entry.services : [],
    );
    if (entry.state === AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING,
        partitionState:
          AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState:
          AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED,
        services,
      });
    }
    if (entry.partition && typeof entry.partition === LOCAL_STR_OBJECT) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AVAILABLE,
        partitionState:
          AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.AVAILABLE,
        partition: entry.partition,
        cacheServiceState:
          entry.cacheServiceState ||
          AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED,
        services,
      });
    }
    return Object.freeze({
      state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AVAILABLE,
      partitionState:
        AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_STATE.UNAVAILABLE,
      cacheServiceState:
        entry.cacheServiceState ||
        AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED,
      services,
    });
  }

  /**
   * Resolve whether an authoritative service snapshot is complete enough to
   * mask cached service rows for the same partition.
   * @param {Object|null} partitionRow
   * @param {Array<Object>} serviceRows
   * @return {{state:string, expectedReplicaCount:number|null,
   *   observedServiceCount:number}}
   * @private
   */
  resolveAuthoritativeRoutingOverlayServiceCoverage(
    partitionRow,
    serviceRows,
  ) {
    const observedServiceCount = Array.isArray(serviceRows) ?
      serviceRows.length :
      NUM.ZERO;
    const partitionReplicaCount =
      partitionRow?.[
        AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_FIELD.REPLICA_COUNT
      ] ??
      partitionRow?.[
        AUTHORITATIVE_ROUTING_OVERLAY_PARTITION_FIELD.REPLICA_COUNT_CAMEL
      ];
    const expectedReplicaCount = Number(
      partitionReplicaCount,
    );
    if (
      !Number.isFinite(expectedReplicaCount) ||
      expectedReplicaCount <= NUM.ZERO
    ) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.UNKNOWN,
        expectedReplicaCount: NUM.ZERO,
        observedServiceCount,
      });
    }
    const normalizedExpectedReplicaCount = Math.floor(expectedReplicaCount);
    if (observedServiceCount >= normalizedExpectedReplicaCount) {
      return Object.freeze({
        state: AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.COMPLETE,
        expectedReplicaCount: normalizedExpectedReplicaCount,
        observedServiceCount,
      });
    }
    return Object.freeze({
      state: AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.INCOMPLETE,
      expectedReplicaCount: normalizedExpectedReplicaCount,
      observedServiceCount,
    });
  }

  /**
   * Resolve the cache masking state for one authoritative routing refresh.
   * @param {Object|null} partitionRow
   * @param {Array<Object>} serviceRows
   * @return {string}
   * @private
   */
  resolveAuthoritativeRoutingOverlayCacheServiceState(
    partitionRow,
    serviceRows,
  ) {
    const serviceCoverage =
      this.resolveAuthoritativeRoutingOverlayServiceCoverage(
        partitionRow,
        serviceRows,
      );
    if (
      serviceCoverage.state ===
      AUTHORITATIVE_ROUTING_OVERLAY_SERVICE_COVERAGE_STATE.INCOMPLETE
    ) {
      return AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.ELIGIBLE;
    }
    return AUTHORITATIVE_ROUTING_OVERLAY_CACHE_SERVICE_STATE.MASKED;
  }

  /**
   * Refresh one partition's routing metadata through the authoritative
   * control-plane view so stale cache service rows can be bypassed after a
   * runtime no-handler witness.
   * @param {string} partitionId
   * @param {Object} [options]
   * @return {Promise<boolean>}
   * @private
   */
  async refreshAuthoritativeRoutingOverlay(partitionId, options = {}) {
    if (typeof partitionId !== LOCAL_STR_STRING || partitionId.length === LOCAL_NUM_ZERO) {
      return false;
    }

    const authoritativeControlPlaneView =
      this.getAuthoritativeControlPlaneView();
    if (!authoritativeControlPlaneView) {
      return false;
    }

    const queryTimeoutMs =
      Number.isFinite(options.queryTimeoutMs) && options.queryTimeoutMs > 0 ?
        options.queryTimeoutMs :
        this.queryTimeoutMs;

    const [partitionResult, serviceResult] = await Promise.all([
      authoritativeControlPlaneView.readRows(
        TABLES.PARTITIONS,
        `SELECT * FROM ${TABLES.PARTITIONS} WHERE ${COLUMN.PARTITION_ID} = ?`,
        [partitionId],
        {
          allowSqlFallback: false,
          replicaFallbackConsistency:
            LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
          queryTimeoutMs,
        },
      ),
      authoritativeControlPlaneView.readRows(
        TABLES.SERVICES,
        `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.PARTITION_ID} = ? ` +
          `AND ${COLUMN.SERVICE_TYPE} = ?`,
        [partitionId, SERVICE_TYPE.PARTITION],
        {
          allowSqlFallback: false,
          replicaFallbackConsistency:
            LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
          queryTimeoutMs,
        },
      ),
    ]);

    const partitionRows = Array.isArray(partitionResult?.rows) ?
      partitionResult.rows :
      [];
    const partitionReadAvailable = partitionResult?.success !== false;
    const serviceRows = Array.isArray(serviceResult?.rows) ?
      serviceResult.rows.filter(
        (service) => service?.service_type === SERVICE_TYPE.PARTITION,
      ) :
      [];
    const serviceReadAvailable = serviceResult?.success !== false;

    if (!partitionReadAvailable || !serviceReadAvailable) {
      return false;
    }

    const overlayEntry =
      partitionRows.length === 0 && serviceRows.length === 0 ?
        {
          state:
              AUTHORITATIVE_ROUTING_OVERLAY_STATE.AUTHORITATIVE_MISSING,
          partition: null,
          services: Object.freeze([]),
        } :
        {
          state: AUTHORITATIVE_ROUTING_OVERLAY_STATE.AVAILABLE,
          partition: partitionRows[0] || null,
          services: serviceRows,
          cacheServiceState:
            this.resolveAuthoritativeRoutingOverlayCacheServiceState(
              partitionRows[0] || null,
              serviceRows,
            ),
        };

    this.authoritativeRoutingOverlayEntries.set(partitionId, overlayEntry);

    return true;
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
      if (Array.isArray(records) && records.length > LOCAL_NUM_ZERO) {
        return records[LOCAL_NUM_ZERO];
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

export {SQLQueryEngineSegment4};
