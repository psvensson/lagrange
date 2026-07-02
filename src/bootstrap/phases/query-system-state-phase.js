/**
 * Query System State Phase — handles system cache hydration from bootstrap
 * snapshots, node registration, endpoint registration, and CDC pipeline
 * setup during the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {assertCritical} from '../../utils/assert.js';
import {NodeService} from '../../node/node-service.js';
import {NodeRegistrationOwner} from '../shared/node-registration-owner.js';
import {isRetryableControlPlaneError} from
  '../../control-plane/control-plane-error-classification.js';
import {getControlPlaneRetryAfterMs} from
  '../../control-plane/control-plane-error-classification.js';
import {
  CACHE_HYDRATION_TABLES,
} from '../../cache/cache-constants.js';
import {
  CDC_PIPELINE_READINESS_TIMEOUT_MS,
} from '../../constants/cdc-lifecycle-constants.js';
import {
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  JOIN_BACKFILL_SCOPE,
  JOINING_UNIFIED_RECONCILE,
} from '../node-joining-constants.js';
import {
  CDC_OPERATION,
  TABLES,
} from '../../constants/index.js';
import {canonicalizeSystemTableRow} from '../../control-plane/system-row-normalizers.js';
import {
  applyBootstrapTopologyEpoch as applyBootstrapTopologyEpochToCache,
  getSnapshotHydrationOperation as resolveSnapshotHydrationOperation,
  recordBootstrapTopologySnapshotMetadata as recordBootstrapTopologyMetadata,
  resolveSnapshotBackfillPlan as resolveBootstrapSnapshotBackfillPlan,
} from './query-system-state-phase-snapshot-helpers.js';
import {
  JOIN_NODE_REGISTRATION_MAX_ATTEMPTS,
  JOIN_NODE_REGISTRATION_MAX_DELAY_MS,
  JOIN_NODE_REGISTRATION_RETRY_DELAY_MS,
  LOG_BLOCKING_BACKFILL_COMPLETE,
  LOG_BLOCKING_BACKFILL_FAILED,
  LOG_BLOCKING_BACKFILL_SKIPPED,
  LOG_BLOCKING_BACKFILL_START,
  LOG_BOOTSTRAP_MISSING_SNAPSHOTS,
  LOG_CACHE_HYDRATED,
  LOG_CACHE_POPULATED,
  LOG_HYDRATED_TABLE,
  LOG_NODE_REGISTRATION_RETRY,
  LOG_OPPORTUNISTIC_BACKFILL_COMPLETE,
  LOG_OPPORTUNISTIC_BACKFILL_FAILED,
  LOG_OPPORTUNISTIC_BACKFILL_SKIPPED,
  LOG_SNAPSHOT_MISSING,
} from './query-system-state-phase-constants.js';

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
    this.advertisedNodeWsAddress = options.advertisedNodeWsAddress || null;
    this.delegates = options.delegates || {};
    this.opportunisticBackfillPromise = null;
    this.joinAdmissionSqlQueryEngine = null;
    this.nodeRegistrationOwner = new NodeRegistrationOwner({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      advertisedNodeWsAddress: this.advertisedNodeWsAddress,
      delegates: {
        getLogger: () => this.delegates.getLogger(),
        getConfig: () => this.delegates.getConfig?.() || {},
        getNow: () => this.delegates.getNow(),
        getSleep: () => this.delegates.getSleep?.(),
        getWsPort: () => this.delegates.getWsPort?.(),
        getSeedNodeId: () => this.delegates.getSeedNodeId?.() || null,
        getMessageRouter: () =>
          this.delegates.getMessageRouter?.() || null,
        connectToClusterNodes: () =>
          this.delegates.connectToClusterNodes?.(),
        getCdcIntegrationService: () =>
          this.delegates.getCdcIntegrationService(),
        getJoinAdmissionSqlQueryEngine: () =>
          this.joinAdmissionSqlQueryEngine,
        getCdcSubscriptionsActive: () =>
          this.delegates.getCdcSubscriptionsActive(),
        getNodeStorageBudgetService: () =>
          this.delegates.getNodeStorageBudgetService(),
        getSystemTableCache: () =>
          this.delegates.getSystemTableCache?.() || null,
        getJoinLifecycleIntentType: () =>
          this.delegates.getJoinLifecycleIntentType?.() || null,
        getJoinStartupMode: () =>
          this.delegates.getJoinStartupMode?.() || null,
        getClusterIncarnationFence: () =>
          this.delegates.getClusterIncarnationFence?.() || null,
        getDataDir: () =>
          this.delegates.getDataDir?.() || null,
        getNodeCapabilities: () =>
          this.delegates.getNodeCapabilities(),
      },
    });
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
    this.joinAdmissionSqlQueryEngine = queryEngine;
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

      let totalCachedRecords = 0;
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
      await this.delegates
        .restoreDurableRejoinLocalPartitionServices?.(
          systemTableCache,
        );
      this.delegates.applySystemCacheToPartitions(
        systemTableCache,
      );

      await this.delegates.waitForSystemServiceLeaders(
        systemTableCache,
      );

      // Publish canonical node admission through the control-plane owner path.
      await this.delegates.registerNodeInCluster();

      // Stage CREATE_SELF_HOSTED group metadata locally and publish
      // its per-replica service rows. The canonical message_groups row
      // is flushed after READY so restart hydration does not block on a
      // self-owned control-plane partition that is still coming online.
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
      await this.backfillBlockingDiscoveryTables();

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
   * Backfill discovery-critical propagated tables as part of the blocking
   * join path.
   * @return {Promise<void>}
   * @private
   */
  async backfillBlockingDiscoveryTables() {
    const logger = this.delegates.getLogger();
    const {
      tables,
      missingTables,
    } = this.resolveSnapshotBackfillPlan(
      JOIN_BACKFILL_SCOPE.BLOCKING_TABLES,
    );

    if (tables.length === 0) {
      logger.info(LOG_BLOCKING_BACKFILL_SKIPPED, {
        nodeId: this.nodeId,
        tableCount: JOIN_BACKFILL_SCOPE.BLOCKING_TABLES.length,
        tableNames: JOIN_BACKFILL_SCOPE.BLOCKING_TABLES,
      });
      return;
    }

    logger.info(LOG_BLOCKING_BACKFILL_START, {
      nodeId: this.nodeId,
      tableCount: tables.length,
      tableNames: tables,
      missingBootstrapSnapshotTables: missingTables,
    });

    try {
      await this.delegates
        .backfillPropagatedCacheTablesFromAuthoritativeState(
          tables,
        );
      logger.info(LOG_BLOCKING_BACKFILL_COMPLETE, {
        nodeId: this.nodeId,
        tableCount: tables.length,
        tableNames: tables,
      });
    } catch (error) {
      logger.error(LOG_BLOCKING_BACKFILL_FAILED, {
        nodeId: this.nodeId,
        tableCount: tables.length,
        tableNames: tables,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Resolve the bootstrap-snapshot reread plan for one table cohort.
   * When bootstrap already published authoritative snapshot rows for the
   * requested propagated tables, the join path should trust that snapshot plus
   * CDC catch-up instead of immediately rereading the same tables.
   * @param {Array<string>} tableNames
   * @return {{tables: Array<string>, missingTables: Array<string>}}
   * @private
   */
  resolveSnapshotBackfillPlan(tableNames = []) {
    const bootstrapResponse =
      typeof this.delegates.getBootstrapResponse === 'function' ?
        this.delegates.getBootstrapResponse() :
        null;
    return resolveBootstrapSnapshotBackfillPlan({
      bootstrapResponse,
      tableNames,
    });
  }

  /**
   * Start best-effort backfill for non-critical propagated tables.
   * Failures are logged but do not abort the join-critical path.
   * @return {Promise<void>|null}
   * @private
   */
  startJoinOpportunisticBackfill() {
    if (this.opportunisticBackfillPromise) {
      return this.opportunisticBackfillPromise;
    }

    const {
      tables,
      missingTables,
    } = this.resolveSnapshotBackfillPlan(
      JOIN_BACKFILL_SCOPE.OPPORTUNISTIC_TABLES,
    );
    if (!Array.isArray(tables) || tables.length === 0) {
      this.delegates.getLogger().info(LOG_OPPORTUNISTIC_BACKFILL_SKIPPED, {
        nodeId: this.nodeId,
        tableCount: JOIN_BACKFILL_SCOPE.OPPORTUNISTIC_TABLES.length,
        tableNames: JOIN_BACKFILL_SCOPE.OPPORTUNISTIC_TABLES,
      });
      return Promise.resolve();
    }

    const logger = this.delegates.getLogger();
    const promise = Promise.resolve(
      this.delegates.backfillPropagatedCacheTablesFromAuthoritativeState(
        tables,
      ),
    )
      .then(() => {
        logger.info(LOG_OPPORTUNISTIC_BACKFILL_COMPLETE, {
          nodeId: this.nodeId,
          tableCount: tables.length,
          tableNames: tables,
          missingBootstrapSnapshotTables: missingTables,
        });
      })
      .catch((error) => {
        logger.warn(LOG_OPPORTUNISTIC_BACKFILL_FAILED, {
          nodeId: this.nodeId,
          tableCount: tables.length,
          tableNames: tables,
          missingBootstrapSnapshotTables: missingTables,
          error: error.message,
        });
      })
      .finally(() => {
        if (this.opportunisticBackfillPromise === promise) {
          this.opportunisticBackfillPromise = null;
        }
      });

    this.opportunisticBackfillPromise = promise;
    return promise;
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

    let totalRecords = 0;

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
        const canonicalRecord = canonicalizeSystemTableRow(tableName, record);
        const operation = this.getSnapshotHydrationOperation(
          systemTableCache,
          tableName,
          canonicalRecord,
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
          canonicalRecord,
        );
        totalRecords++;
      }

      logger.debug(LOG_HYDRATED_TABLE, {
        tableName,
        recordCount: records.length,
        nodeId: this.nodeId,
      });
    }

    this.applyBootstrapTopologyEpoch(
      systemTableCache,
      bootstrapResponse,
    );
    this.recordBootstrapTopologySnapshotMetadata(
      bootstrapResponse,
    );

    logger.info(
      LOG_CACHE_HYDRATED,
      {
        nodeId: this.nodeId,
        totalRecords,
        tablesHydrated: systemTables.filter(
          (t) =>
            Array.isArray(snapshots[t]) &&
            snapshots[t].length > 0,
        ).length,
      },
    );
  }

  /**
   * Apply the published bootstrap topology epoch to the local cache watermark.
   * @param {Object} systemTableCache
   * @param {Object|null} bootstrapResponse
   * @return {void}
   * @private
   */
  applyBootstrapTopologyEpoch(systemTableCache, bootstrapResponse) {
    applyBootstrapTopologyEpochToCache({
      systemTableCache,
      bootstrapResponse,
      logger: this.delegates.getLogger(),
      nodeId: this.nodeId,
    });
  }

  /**
   * Retain owner-published bootstrap topology metadata for readiness.
   * @param {Object|null} bootstrapResponse
   * @return {void}
   * @private
   */
  recordBootstrapTopologySnapshotMetadata(bootstrapResponse) {
    recordBootstrapTopologyMetadata({
      bootstrapResponse,
      delegates: this.delegates,
    });
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
    return resolveSnapshotHydrationOperation({
      systemTableCache,
      tableName,
      record,
      logger: this.delegates.getLogger(),
      nodeId: this.nodeId,
    });
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
    const maxAttempts = this.resolveJoinRegistrationMaxAttempts();
    let attempt = 0;
    let nextDelayMs = JOIN_NODE_REGISTRATION_RETRY_DELAY_MS;

    while (true) {
      attempt += 1;
      try {
        const messageRouter =
          typeof this.delegates.getMessageRouter === 'function' ?
            this.delegates.getMessageRouter() :
            null;
        if (messageRouter &&
            typeof this.delegates.connectToClusterNodes ===
            'function') {
          await this.delegates.connectToClusterNodes({
            requireReadyConnections: true,
          });
        }
        return await this.nodeRegistrationOwner.registerNodeInCluster();
      } catch (error) {
        const retryable =
          isRetryableControlPlaneError(error) &&
          attempt < maxAttempts;
        if (!retryable) {
          throw error;
        }

        const retryAfterMs = getControlPlaneRetryAfterMs(error);
        const delayMs = Math.min(
          JOIN_NODE_REGISTRATION_MAX_DELAY_MS,
          Math.max(
            JOIN_NODE_REGISTRATION_RETRY_DELAY_MS,
            retryAfterMs > 0 ? retryAfterMs : nextDelayMs,
          ),
        );

        logger.warn(LOG_NODE_REGISTRATION_RETRY, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          delayMs,
          retryAfterMs: retryAfterMs > 0 ? retryAfterMs : null,
          error: error?.message || String(error),
        });

        await this.sleep(delayMs);
        nextDelayMs = Math.min(
          JOIN_NODE_REGISTRATION_MAX_DELAY_MS,
          delayMs * 2,
        );
      }
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
    return this.nodeRegistrationOwner.registerNodeEndpoint(now);
  }

  /**
   * Register built-in meta service endpoints for this joining node.
   * @return {Promise<Array<Object>>}
   */
  async registerMetaServiceEndpoints() {
    return this.nodeRegistrationOwner.registerMetaServiceEndpoints();
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
      'function'
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
      .executeQuery(sql, params, upsertOptions);
  }

  /**
   * Upsert one system-table row through the shared retryable join-time
   * control-plane publication path.
   * @param {string} tableName
   * @param {Object} rowData
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async upsertSystemTableRowWithRetry(tableName, rowData, options = {}) {
    return this.nodeRegistrationOwner.upsertSystemTableRowWithRetry(
      tableName,
      rowData,
      options,
    );
  }

  /**
   * Upsert one services row through the shared retryable join-time
   * control-plane publication path.
   * @param {Object} rowData
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async upsertJoinServiceRowWithRetry(rowData, options = {}) {
    return this.nodeRegistrationOwner.upsertJoinServiceRowWithRetry(
      rowData,
      options,
    );
  }

  /**
   * Determine whether join-time upserts can require local cache
   * visibility.
   * @return {Object|undefined}
   */
  getJoinTimeUpsertOptions() {
    const options = {deliveryPriority: 'critical'};
    if (this.delegates.getCdcSubscriptionsActive() !== true) {
      options.skipCacheWait = true;
    }
    return options;
  }

  resolveJoinRegistrationMaxAttempts() {
    const configured =
      this.delegates.getConfig?.()?.joinRegistrationMaxAttempts;
    if (Number.isFinite(configured) && configured >= 1) {
      return Math.max(1, Math.floor(configured));
    }
    return JOIN_NODE_REGISTRATION_MAX_ATTEMPTS;
  }

  async sleep(delayMs) {
    const sleepImpl = this.delegates.getSleep?.();
    if (typeof sleepImpl === 'function') {
      await sleepImpl(delayMs);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Seed successful join-time control-plane writes into the local
   * cache.
   * @param {string} tableName
   * @param {Object|null} rowData
   * @return {void}
   */
  seedJoinTimeCacheRow(tableName, rowData) {
    if (!rowData || typeof rowData !== 'object') {
      return;
    }

    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    if (
      !systemTableCache ||
      typeof systemTableCache.applySystemTableChange !==
        'function'
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
