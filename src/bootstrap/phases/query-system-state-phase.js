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
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  CACHE_DEFAULT,
  CACHE_HYDRATION_TABLES,
} from '../../cache/cache-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../../cache/system-cache-key-descriptor.js';
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
  COLUMN,
  CDC_OPERATION,
  NUM,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';
import {canonicalizeSystemTableRow} from '../../control-plane/system-row-normalizers.js';
import {
  resolveControlPlaneSnapshotRevisionMetadata,
} from '../../control-plane/control-plane-snapshot-revision.js';

const LOG_CACHE_POPULATED =
  'System cache populated from bootstrap response';
const LOG_BOOTSTRAP_MISSING_SNAPSHOTS =
  'Bootstrap response missing systemTableSnapshots';
const LOG_CACHE_HYDRATED =
  'System cache hydrated from bootstrap response';
const LOG_TOPOLOGY_EPOCH_APPLIED =
  'Applied bootstrap topology epoch to local cache watermark';
const LOG_SNAPSHOT_MISSING =
  'Snapshot missing or invalid for table';
const LOG_HYDRATED_TABLE =
  'Hydrated table from snapshot';
const LOG_SKIPPING_STALE_SNAPSHOT =
  'Skipping stale snapshot row during cache hydration';
const LOG_BLOCKING_BACKFILL_START =
  'Starting blocking join backfill for discovery-critical propagated tables';
const LOG_BLOCKING_BACKFILL_COMPLETE =
  'Completed blocking join backfill for discovery-critical propagated tables';
const LOG_BLOCKING_BACKFILL_FAILED =
  'Blocking join backfill failed for discovery-critical propagated tables';
const LOG_BLOCKING_BACKFILL_SKIPPED =
  'Skipping blocking join backfill because bootstrap snapshot already covers discovery-critical propagated tables';
const LOG_OPPORTUNISTIC_BACKFILL_SKIPPED =
  'Skipping opportunistic join backfill because bootstrap snapshot already covers opportunistic propagated tables';
const LOG_OPPORTUNISTIC_BACKFILL_COMPLETE =
  'Completed opportunistic join backfill for non-critical propagated tables';
const LOG_OPPORTUNISTIC_BACKFILL_FAILED =
  'Opportunistic join backfill failed for non-critical propagated tables';
const LOG_NODE_REGISTRATION_RETRY =
  'Retrying join node registration after retryable admission failure';
const JOIN_NODE_REGISTRATION_MAX_ATTEMPTS = NUM.TWO;
const JOIN_NODE_REGISTRATION_RETRY_DELAY_MS = NUM.TWO * NUM.HUNDRED;
const JOIN_NODE_REGISTRATION_MAX_DELAY_MS = NUM.THOUSAND;

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

    if (tables.length === NUM.ZERO) {
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
      typeof this.delegates.getBootstrapResponse === TYPEOF.FUNCTION ?
        this.delegates.getBootstrapResponse() :
        null;
    const snapshots = bootstrapResponse?.systemTableSnapshots;
    const hydrationTables = Array.isArray(
      bootstrapResponse?.topologySnapshotMeta?.hydrationTables,
    ) ?
      new Set(
        bootstrapResponse.topologySnapshotMeta.hydrationTables.filter(
          (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
        ),
      ) :
      null;
    const missingTables = [];

    for (const tableName of tableNames) {
      const hasSnapshotRows = Array.isArray(snapshots?.[tableName]);
      const declaredHydrated =
        !hydrationTables || hydrationTables.has(tableName);
      if (!hasSnapshotRows || !declaredHydrated) {
        missingTables.push(tableName);
      }
    }

    return {
      tables: missingTables,
      missingTables,
    };
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
    if (!Array.isArray(tables) || tables.length === NUM.ZERO) {
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
            snapshots[t].length > NUM.ZERO,
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
    if (!systemTableCache ||
        typeof systemTableCache.updateFromEpoch !== TYPEOF.FUNCTION) {
      return;
    }

    const currentEpoch = bootstrapResponse?.currentEpoch;
    if (!currentEpoch || typeof currentEpoch !== TYPEOF.OBJECT) {
      return;
    }

    const logger = this.delegates.getLogger();
    systemTableCache.updateFromEpoch(currentEpoch);
    logger.info(LOG_TOPOLOGY_EPOCH_APPLIED, {
      nodeId: this.nodeId,
      topologyEpoch: currentEpoch.epoch,
    });
  }

  /**
   * Retain owner-published bootstrap topology metadata for readiness.
   * @param {Object|null} bootstrapResponse
   * @return {void}
   * @private
   */
  recordBootstrapTopologySnapshotMetadata(bootstrapResponse) {
    const nowMs =
      typeof this.delegates.getNow === TYPEOF.FUNCTION ?
        this.delegates.getNow() :
        Date.now();
    const topologySnapshotMeta =
      bootstrapResponse?.topologySnapshotMeta &&
      typeof bootstrapResponse.topologySnapshotMeta === TYPEOF.OBJECT ?
        bootstrapResponse.topologySnapshotMeta :
        null;
    const revisionMetadata = resolveControlPlaneSnapshotRevisionMetadata(
      {
        topologySnapshotEpoch:
          topologySnapshotMeta?.topologyEpoch ??
          bootstrapResponse?.currentEpoch?.epoch ??
          null,
        capturedAt: nowMs,
      },
    );
    if (typeof this.delegates.setBootstrapTopologySnapshotMeta ===
        TYPEOF.FUNCTION) {
      this.delegates.setBootstrapTopologySnapshotMeta(
        topologySnapshotMeta ?
          {
            ...topologySnapshotMeta,
            snapshotRevision: revisionMetadata.revision,
            snapshotRevisionSource: revisionMetadata.revisionSource,
            snapshotResumeToken: revisionMetadata.resumeToken,
            snapshotObservedAt: revisionMetadata.observedAt,
            snapshotObservedAtMs: revisionMetadata.observedAtMs,
          } :
          null,
      );
    }
    if (typeof this.delegates.setBootstrapTopologySnapshotHydratedAtMs ===
        TYPEOF.FUNCTION) {
      this.delegates.setBootstrapTopologySnapshotHydratedAtMs(
        nowMs,
      );
    }
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
    const maxAttempts = this.resolveJoinRegistrationMaxAttempts();
    let attempt = NUM.ZERO;
    let nextDelayMs = JOIN_NODE_REGISTRATION_RETRY_DELAY_MS;

    while (true) {
      attempt += NUM.ONE;
      try {
        const messageRouter =
          typeof this.delegates.getMessageRouter === TYPEOF.FUNCTION ?
            this.delegates.getMessageRouter() :
            null;
        if (messageRouter &&
            typeof this.delegates.connectToClusterNodes ===
            TYPEOF.FUNCTION) {
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
            retryAfterMs > NUM.ZERO ? retryAfterMs : nextDelayMs,
          ),
        );

        logger.warn(LOG_NODE_REGISTRATION_RETRY, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          delayMs,
          retryAfterMs: retryAfterMs > NUM.ZERO ? retryAfterMs : null,
          error: error?.message || String(error),
        });

        await this.sleep(delayMs);
        nextDelayMs = Math.min(
          JOIN_NODE_REGISTRATION_MAX_DELAY_MS,
          delayMs * NUM.TWO,
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
    if (Number.isFinite(configured) && configured >= NUM.ONE) {
      return Math.max(NUM.ONE, Math.floor(configured));
    }
    return JOIN_NODE_REGISTRATION_MAX_ATTEMPTS;
  }

  async sleep(delayMs) {
    const sleepImpl = this.delegates.getSleep?.();
    if (typeof sleepImpl === TYPEOF.FUNCTION) {
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
