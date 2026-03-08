/**
 * Query System State Phase — handles system cache hydration from bootstrap
 * snapshots, node registration, endpoint registration, and CDC pipeline
 * setup during the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import os from 'os';
import {assertCritical} from '../../utils/assert.js';
import {NodeService} from '../../node/node-service.js';
import {NodeStorageBudgetSetup} from '../shared/node-storage-budget-setup.js';
import {
  registerBuiltInMetaServiceEndpoints,
} from '../shared/meta-service-definition-registration.js';
import {
  CACHE_DEFAULT,
  CACHE_HYDRATION_TABLES,
} from '../../cache/cache-constants.js';
import {
  deriveWsAddressFromNodeAddress,
} from './connect-websocket-phase.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../cache/system-cache-key-descriptor.js';
import {
  CDC_PIPELINE_READINESS_TIMEOUT_MS,
} from '../../constants/cdc-lifecycle-constants.js';
import {
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  JOINING_UNIFIED_RECONCILE,
} from '../node-joining-constants.js';
import {
  CDC_OPERATION,
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TIME_MS,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../../constants/index.js';

const LOG_CACHE_POPULATED =
  'System cache populated from bootstrap response';
const LOG_BOOTSTRAP_MISSING_SNAPSHOTS =
  'Bootstrap response missing systemTableSnapshots';
const LOG_CACHE_HYDRATED =
  'System cache hydrated from bootstrap response';
const LOG_SNAPSHOT_MISSING =
  'Snapshot missing or invalid for table';
const LOG_HYDRATED_TABLE =
  'Hydrated table from snapshot';
const LOG_SKIPPING_STALE_SNAPSHOT =
  'Skipping stale snapshot row during cache hydration';
const LOG_REGISTERING_NODE =
  'Registering node in cluster';
const LOG_NODE_REGISTERED =
  'Node registered in cluster';
const LOG_NODE_REGISTER_FAILED =
  'Failed to register node in cluster';
const LOG_META_ENDPOINT_REGISTER_FAILED =
  'Failed to register built-in meta service endpoints';
const LOG_NODE_REGISTER_ERROR_PREFIX =
  'Failed to register node: ';

/**
 * Handles the query-system-state phase of the join process.
 */
class QuerySystemStatePhase {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {string} options.nodeAddress - This node's address.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.nodeAddress = options.nodeAddress;
    this.delegates = options.delegates || {};
  }

  /**
   * Phase 5: Query system partitions for cluster state and register
   * this node.
   * @return {Promise<void>}
   */
  async phaseQuerySystemState() {
    const logger = this.delegates.getLogger();

    logger.debug(JOINING_LOG_MSG.STATE_QUERY_START, {
      nodeId: this.nodeId,
    });

    // Initialize node service
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      nodeService.initialize({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        lifecycleStateMachine:
          this.delegates.getLifecycleStateMachine(),
        autoTransitionLifecycle: false,
      });
    }

    const systemTableCache = assertCritical(
      nodeService.getSystemTableCache(),
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );
    const queryEngine = assertCritical(
      this.delegates.getCdcIntegrationService()?.sqlQueryEngine,
      JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED,
    );
    assertCritical(
      this.delegates.getMessageRouter(),
      JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
    );
    this.delegates.ensureLatencyTopologyOwners();

    try {
      // Hydrate system cache from bootstrap response snapshots
      if (!this.delegates.getSystemCacheHydrated()) {
        logger.info(
          JOINING_LOG_MSG.STATE_QUERY_HYDRATING_CACHE,
          {nodeId: this.nodeId},
        );

        await this.hydrateSystemCacheFromBootstrap();
        this.delegates.setSystemCacheHydrated(true);
      }

      // Log cache population status
      const systemTables = [
        TABLES.NODES,
        TABLES.PARTITIONS,
        TABLES.TABLES,
        TABLES.SERVICES,
        TABLES.REPLICA_OPERATIONS,
        TABLES.MESSAGE_GROUPS,
      ];

      let totalCachedRecords = NUM.ZERO;
      for (const tableName of systemTables) {
        const records =
          systemTableCache.getAll(tableName) || [];
        totalCachedRecords += records.length;
      }

      logger.info(
        LOG_CACHE_POPULATED,
        {nodeId: this.nodeId, totalRecords: totalCachedRecords},
      );

      // Set up query engine with system cache and message router
      queryEngine.setSystemCache(systemTableCache);
      queryEngine.setMessageRouter(
        this.delegates.getMessageRouter(),
      );

      logger.info(
        JOINING_LOG_MSG.STATE_QUERY_HYDRATION_COMPLETE,
        {
          nodeId: this.nodeId,
          totalRecords: totalCachedRecords,
        },
      );

      this.delegates.ensureTablePolicyService(systemTableCache);
      this.delegates.applySystemCacheToPartitions(
        systemTableCache,
      );

      await this.delegates.waitForSystemServiceLeaders(
        systemTableCache,
      );

      // Register this node in the cluster's nodes table
      await this.delegates.registerNodeInCluster();

      // Persist CREATE_SELF_HOSTED message-group metadata.
      await this.delegates.registerCreateSelfHostedMetadata();

      // Subscribe to CDC events to keep cache updated
      await this.delegates.subscribeToCDCEvents();

      // Gate: verify CDC pipeline is fully wired before proceeding.
      const cdcReadinessGate =
        this.delegates.createCdcPipelineReadinessGate(
          systemTableCache,
        );
      const cdcReadinessTimeoutMs =
        this.delegates.getConfig().cdcPipelineReadinessTimeoutMs ||
        CDC_PIPELINE_READINESS_TIMEOUT_MS;
      await cdcReadinessGate.waitForReady(
        {
          partitionServices:
            this.delegates.getPartitionServices(),
          messageGroupServices:
            this.delegates.getMessageGroupServices(),
          cdcSubscriptionsActive:
            this.delegates.getCdcSubscriptionsActive() === true,
          requirePropagationLeader: false,
        },
        cdcReadinessTimeoutMs,
      );
      await this.delegates
        .backfillPropagatedCacheTablesFromAuthoritativeState();

      // Hand hydrated desired/actual state to unified reconciler.
      await this.delegates.triggerJoinReconciler(
        JOINING_UNIFIED_RECONCILE.HYDRATION_REASON,
      );
      this.delegates.stopJoiningLifecycleOwners();
    } catch (error) {
      const errorContext = {
        nodeId: this.nodeId,
        error: error.message,
      };
      if (error?.missingLeaders) {
        errorContext.missingLeaders = error.missingLeaders;
        errorContext.missingCount = error.missingCount;
        errorContext.timeoutMs = error.timeoutMs;
      }
      logger.error(
        JOINING_LOG_MSG.STATE_QUERY_HYDRATION_FAILED,
        errorContext,
      );
      throw error;
    }

    logger.info(JOINING_LOG_MSG.STATE_QUERY_COMPLETE, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Hydrate the local system cache from bootstrap response snapshots.
   * @return {Promise<void>}
   */
  async hydrateSystemCacheFromBootstrap() {
    const logger = this.delegates.getLogger();
    const bootstrapResponse =
      this.delegates.getBootstrapResponse();
    const snapshots = bootstrapResponse?.systemTableSnapshots;

    if (!snapshots) {
      logger.warn(
        LOG_BOOTSTRAP_MISSING_SNAPSHOTS,
        {
          nodeId: this.nodeId,
          hasBootstrapResponse: !!bootstrapResponse,
        },
      );
      return;
    }

    // Initialize node service to get system table cache
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      nodeService.initialize({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        lifecycleStateMachine:
          this.delegates.getLifecycleStateMachine(),
        autoTransitionLifecycle: false,
      });
    }

    const systemTableCache = assertCritical(
      nodeService.getSystemTableCache(),
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );

    // Hydrate each system table from snapshots
    const systemTables = CACHE_HYDRATION_TABLES;

    let totalRecords = NUM.ZERO;

    for (const tableName of systemTables) {
      const records = snapshots[tableName];

      if (!Array.isArray(records)) {
        logger.debug(LOG_SNAPSHOT_MISSING, {
          tableName,
          nodeId: this.nodeId,
        });
        continue;
      }

      for (const record of records) {
        const operation = this.getSnapshotHydrationOperation(
          systemTableCache,
          tableName,
          record,
        );
        if (!operation) {
          continue;
        }
        // Bootstrap hydration exception: joining nodes must hydrate
        // local cache from bootstrap snapshots before CDC
        // subscriptions are active.
        // See architecture.md: Sanctioned direct
        // applySystemTableChange call sites.
        systemTableCache.applySystemTableChange(
          tableName,
          operation,
          record,
        );
        totalRecords++;
      }

      logger.debug(LOG_HYDRATED_TABLE, {
        tableName,
        recordCount: records.length,
        nodeId: this.nodeId,
      });
    }

    logger.info(
      LOG_CACHE_HYDRATED,
      {
        nodeId: this.nodeId,
        totalRecords,
        tablesHydrated: systemTables.filter(
          (t) =>
            Array.isArray(snapshots[t]) &&
            snapshots[t].length > NUM.ZERO,
        ).length,
      },
    );
  }

  /**
   * Resolve the cache operation for a bootstrap snapshot record.
   * Skip stale snapshot rows when cache already has an equal/newer
   * update.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @param {Object} record - Snapshot row.
   * @return {string|null} CDC operation or null to skip.
   * @private
   */
  getSnapshotHydrationOperation(
    systemTableCache,
    tableName,
    record,
  ) {
    const logger = this.delegates.getLogger();
    const pkField = getSystemCachePrimaryKeyFieldOrFallback(
      tableName,
      CACHE_DEFAULT.PRIMARY_KEY_FALLBACK,
    );
    const key =
      record?.[pkField] ??
      record?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK];

    // Let cache validation handle malformed rows with no key.
    if (typeof key === TYPEOF.UNDEFINED || key === null) {
      return CDC_OPERATION.INSERT;
    }

    if (!systemTableCache.has(tableName, key)) {
      return CDC_OPERATION.INSERT;
    }

    const existing = systemTableCache.get(tableName, key);
    const existingUpdatedAt =
      Number(existing?.[COLUMN.UPDATED_AT]);
    const incomingUpdatedAt =
      Number(record?.[COLUMN.UPDATED_AT]);
    const hasExistingUpdatedAt =
      Number.isFinite(existingUpdatedAt) &&
      existingUpdatedAt > NUM.ZERO;
    const hasIncomingUpdatedAt =
      Number.isFinite(incomingUpdatedAt) &&
      incomingUpdatedAt > NUM.ZERO;

    if (
      hasExistingUpdatedAt &&
      (!hasIncomingUpdatedAt ||
        existingUpdatedAt >= incomingUpdatedAt)
    ) {
      logger.debug(
        LOG_SKIPPING_STALE_SNAPSHOT,
        {
          nodeId: this.nodeId,
          tableName,
          key,
          existingUpdatedAt,
          incomingUpdatedAt: hasIncomingUpdatedAt ?
            incomingUpdatedAt :
            null,
        },
      );
      return null;
    }

    return CDC_OPERATION.UPSERT;
  }

  /**
   * Register this node in the cluster's nodes table.
   * Uses SQL query engine to INSERT into nodes table.
   * Query routes through message router to partition leader.
   * Also registers the WebSocket endpoint in node_endpoints table.
   * Requirements: 2.1 - Joining node registers itself in cluster.
   * Requirements: 8.2 - Node registration creates endpoint.
   * @return {Promise<void>}
   */
  async registerNodeInCluster() {
    const logger = this.delegates.getLogger();

    logger.info(LOG_REGISTERING_NODE, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    assertCritical(
      this.delegates.getCdcIntegrationService()?.sqlQueryEngine,
      JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED,
    );

    // Get system information
    const cpus = os.cpus();
    const totalMemoryBytes = os.totalmem();
    const totalMemoryMb = Math.floor(
      totalMemoryBytes / (NUM.THOUSAND * NUM.THOUSAND),
    );
    const cpuCores = cpus.length;

    // Use default disk size
    const diskGb = NUM.HUNDRED;

    const now = this.delegates.getNow()();
    const joinTimeUpsertOptions = this.getJoinTimeUpsertOptions();

    const nodeData = {
      [COLUMN.NODE_ID]: this.nodeId,
      [COLUMN.NODE_ADDRESS]: this.nodeAddress,
      [COLUMN.CPU_CORES]: cpuCores,
      [COLUMN.MEMORY_MB]: totalMemoryMb,
      [COLUMN.DISK_GB]: diskGb,
      [COLUMN.CPU_USAGE_PERCENT]: NUM.ZERO,
      [COLUMN.MEMORY_USAGE_PERCENT]: NUM.ZERO,
      [COLUMN.DISK_USAGE_PERCENT]: NUM.ZERO,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.CAPABILITIES]: JSON.stringify([]),
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.READY_LEASE_EXPIRES_AT]:
        now + TIME_MS.CONTROL_PLANE_READY_LEASE,
      [COLUMN.CREATED_AT]: now,
    };

    try {
      const budgetService =
        this.delegates.getNodeStorageBudgetService();
      const {budgetRow, resolution} =
        await NodeStorageBudgetSetup.resolveAndPersist({
          budgetService,
          nodeRow: nodeData,
          nodeId: this.nodeId,
          upsertOptions: joinTimeUpsertOptions,
        });
      this.seedJoinTimeCacheRow(TABLES.NODES, budgetRow);

      logger.info(LOG_NODE_REGISTERED, {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        cpuCores,
        memoryMb: totalMemoryMb,
        diskGb,
        budgetBytes: resolution?.budgetBytes || null,
        budgetSource: resolution?.source || null,
      });

      // Register WebSocket endpoint in node_endpoints table
      const endpointRow =
        await this.registerNodeEndpoint(now);
      this.seedJoinTimeCacheRow(
        TABLES.NODE_ENDPOINTS,
        endpointRow,
      );
      const metaEndpointRows =
        await this.registerMetaServiceEndpoints();
      for (const metaEndpointRow of metaEndpointRows) {
        this.seedJoinTimeCacheRow(
          TABLES.SERVICE_ENDPOINTS,
          metaEndpointRow,
        );
      }
    } catch (error) {
      const wrappedError = new Error(
        `${LOG_NODE_REGISTER_ERROR_PREFIX}${error.message}`,
      );
      logger.error(LOG_NODE_REGISTER_FAILED, {
        nodeId: this.nodeId,
        error: wrappedError.message,
      });
      throw wrappedError;
    }
  }

  /**
   * Register the WebSocket endpoint for this node in the
   * node_endpoints table.
   * Requirements: 8.2 - Node registration creates endpoint.
   * @param {number} now - Current timestamp.
   * @return {Promise<Object>}
   */
  async registerNodeEndpoint(now) {
    const logger = this.delegates.getLogger();

    logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERING, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    const endpointId = `ep-${this.nodeId}-ws`;
    const canonicalWsAddress =
      deriveWsAddressFromNodeAddress(this.nodeAddress) ||
      this.nodeAddress;

    const endpointData = {
      [COLUMN.ENDPOINT_ID]: endpointId,
      [COLUMN.NODE_ID]: this.nodeId,
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.ADDRESS]: canonicalWsAddress,
      [COLUMN.PRIORITY]: NUM.ZERO,
      [COLUMN.METADATA]: JSON.stringify({}),
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.CREATED_AT]: now,
      [COLUMN.UPDATED_AT]: now,
    };

    try {
      const endpointResult = await this.upsertSystemTableRow(
        TABLES.NODE_ENDPOINTS,
        endpointData,
      );

      if (!endpointResult.success) {
        throw new Error(
          `Failed to register endpoint: ${endpointResult.error}`,
        );
      }

      logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERED, {
        nodeId: this.nodeId,
        endpointId,
        transportType: TRANSPORT_TYPE.WEBSOCKET,
        address: canonicalWsAddress,
      });
      return endpointData;
    } catch (error) {
      logger.error(JOINING_LOG_MSG.ENDPOINT_REGISTER_FAILED, {
        nodeId: this.nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Register built-in meta service endpoints for this joining node.
   * @return {Promise<Array<Object>>}
   */
  async registerMetaServiceEndpoints() {
    const logger = this.delegates.getLogger();

    try {
      const endpointRows = [];
      await registerBuiltInMetaServiceEndpoints({
        upsertRow: async (tableName, row) => {
          endpointRows.push(row);
          return this.upsertSystemTableRow(tableName, row);
        },
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.delegates.getWsPort(),
      });
      return endpointRows;
    } catch (error) {
      logger.error(
        LOG_META_ENDPOINT_REGISTER_FAILED,
        {nodeId: this.nodeId, error: error.message},
      );
      throw error;
    }
  }

  /**
   * Upsert a system-table row through CDC integration service.
   * @param {string} tableName - System table name.
   * @param {Object} rowData - Row payload.
   * @return {Promise<Object>} Upsert result.
   */
  async upsertSystemTableRow(tableName, rowData) {
    const cdcIntegrationService =
      this.delegates.getCdcIntegrationService();
    const upsertOptions = this.getJoinTimeUpsertOptions();
    if (
      typeof cdcIntegrationService?.upsertSystemTableRow ===
      TYPEOF.FUNCTION
    ) {
      return cdcIntegrationService.upsertSystemTableRow(
        tableName,
        rowData,
        upsertOptions,
      );
    }

    const columns = Object.keys(rowData);
    const placeholders =
      columns.map(() => '?').join(', ');
    const sql =
      `INSERT INTO ${tableName} ` +
      `(${columns.join(', ')}) VALUES (${placeholders})`;
    const params = columns.map((column) => rowData[column]);
    return cdcIntegrationService.sqlQueryEngine
      .executeQuery(sql, params);
  }

  /**
   * Determine whether join-time upserts can require local cache
   * visibility.
   * @return {Object|undefined}
   */
  getJoinTimeUpsertOptions() {
    return this.delegates.getCdcSubscriptionsActive() === true ?
      undefined :
      {skipCacheWait: true};
  }

  /**
   * Seed successful join-time control-plane writes into the local
   * cache.
   * @param {string} tableName
   * @param {Object|null} rowData
   * @return {void}
   */
  seedJoinTimeCacheRow(tableName, rowData) {
    if (!rowData || typeof rowData !== TYPEOF.OBJECT) {
      return;
    }

    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    if (
      !systemTableCache ||
      typeof systemTableCache.applySystemTableChange !==
        TYPEOF.FUNCTION
    ) {
      return;
    }

    systemTableCache.applySystemTableChange(
      tableName,
      CDC_OPERATION.UPSERT,
      rowData,
    );
  }
}

export {QuerySystemStatePhase};
