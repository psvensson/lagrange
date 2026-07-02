/**
 * Seed Cache Hydration Phase — handles Phase 5 of seed bootstrap:
 * populating the system cache from local partitions, subscribing
 * to CDC events, verifying cache completeness, and switching from
 * bootstrap mode to normal routed-SQL mode.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {SQLQueryEngine} from '../../query/sql-query-engine.js';
import {wireMigrationWorkflowOwners} from '../../migration/migration-composition.js';
import {RPCClient} from '../../transport/rpc-client.js';
import {TablePolicyService} from '../../policy/table-policy-service.js';
import {assertCritical} from '../../utils/assert.js';
import {CDCIntegrationSetup} from '../shared/cdc-integration-setup.js';
import {
  subscribeToSystemTableCacheChanges,
  waitForStartupConvergence,
} from '../shared/startup-convergence-gate.js';
import {
  subscribeToHydrationCDC,
} from './seed-cache-hydration-cdc-subscription.js';
import {
  CDC_PIPELINE_READINESS_TIMEOUT_MS,
} from '../../constants/cdc-lifecycle-constants.js';
import {createSystemLeaderReadinessSnapshot} from '../system-readiness-snapshot.js';
import {
  CACHE_HYDRATION_TABLES,
} from '../../cache/cache-constants.js';
import {
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
} from '../bootstrap-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
} from '../system-table-schemas-constants.js';
import {
  TABLES,
  CDC_OPERATION,
} from '../../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../control-plane/control-plane-readiness-constants.js';
import {
  SeedRuntimeBridgeOwner,
} from '../owners/seed-runtime-bridge-owner.js';
import {
  isLiveServiceLeader,
} from '../owners/service-leader-readiness-owner.js';
import {
  isSystemTableWriteReady,
} from '../../cache/leader-readiness-gate.js';

const LOCAL_STR_FUNCTION = 'function';

const LOG_HYDRATION_STEP_COMPLETE = 'Cache hydration step complete';
const HYDRATION_STEP = Object.freeze({
  HYDRATE_FROM_LOCAL: 'hydrateFromLocalPartitions',
  VERIFY: 'verifyCacheHydration',
  WAIT_LEADERS: 'waitForSystemServiceLeadersInCache',
  LATENCY_OWNERS: 'ensureLatencyTopologyOwners',
  SUBSCRIBE_CDC: 'subscribeToInitialSystemTableCDC',
  CDC_READINESS: 'cdcReadinessGate.waitForReady',
  CDC_NORMAL_MODE: 'configureCdcIntegrationForNormalMode',
  WIRE_PARTITIONS: 'wirePartitionServicesForNormalMode',
  WIRE_MESSAGE_GROUPS: 'wireMessageGroupServicesForNormalMode',
});
const SEED_REQUIRED_WRITE_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICES,
]);
const SQL_SELECT_ALL_FROM_TABLE = (tableName) =>
  `SELECT * FROM ${tableName}`;
const LOG_CDC_INITIALIZED = 'CDC integration initialized by owner';
const LOG_CDC_UPGRADED = 'CDC integration upgraded by owner';
const CDC_INTEGRATION_OWNER = 'CDCIntegrationSetup';
const CDC_INTEGRATION_MODE_NORMAL = 'normal';

const HYDRATION_ERROR_MSG = Object.freeze({
  NO_PARTITION_ID_PREFIX: 'No partition ID for table: ',
  NO_LEADER_PARTITION_PREFIX:
    'No leader partition found for: ',
  QUERY_FAILED: 'Query failed',
  NO_PARTITION_ID: 'No partition ID',
  NO_LEADER_PARTITION: 'No leader partition',
});

const CDC_APPLY_OPTIONS = Object.freeze({
  skipReplication: true,
  skipSubscriptionCheck: true,
});

const LOG_REPAIRED =
  'Repaired propagated cache tables from local partitions';
const LOG_REPAIR_ERROR_PREFIX =
  'Failed to repair propagated cache tables from ' +
  'local partitions';
/**
 * Handles the cache-hydration phase of seed bootstrap.
 */
class SeedCacheHydrationPhase {
  /**
   * @param {Object} options
   * @param {Object} options.delegates - Callbacks into the bootstrap
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.runtimeBridgeOwner =
      options.runtimeBridgeOwner ||
      new SeedRuntimeBridgeOwner({
        delegates: this.delegates,
        compatibilityPhase: this,
      });
  }

  /**
   * Phase 5: Cache hydration.
   * Read system table data from local partitions, populate cache,
   * subscribe to CDC, and switch to normal routing mode.
   * @return {Promise<void>}
   */
  async phaseCacheHydration() {
    const d = this.delegates;
    const logger = d.getLogger();
    const config = d.getConfig();

    logger.debug(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_STARTING, {
      nodeId: d.getNodeId(),
      partitionCount: d.getPartitionServices().size,
    });

    const systemTableCache = d.getSystemTableCache();
    const leaderMessageGroup =
      d.getLeaderMessageGroupService() ||
      d.getBootstrapMessageGroupService?.() ||
      null;

    if (!leaderMessageGroup) {
      throw new Error(BOOTSTRAP_ERROR.CDC_HYDRATION_MISSING);
    }

    logger.debug(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_READING, {
      nodeId: d.getNodeId(),
    });

    const phaseStepStartedAt = Date.now();
    const result = await this.hydrateFromLocalPartitions(
      systemTableCache,
      leaderMessageGroup,
    );
    logger.info(LOG_HYDRATION_STEP_COMPLETE, {
      nodeId: d.getNodeId(),
      step: HYDRATION_STEP.HYDRATE_FROM_LOCAL,
      durationMs: Date.now() - phaseStepStartedAt,
    });

    const verifyStartedAt = Date.now();
    this.verifyCacheHydration(systemTableCache, result);
    logger.info(LOG_HYDRATION_STEP_COMPLETE, {
      nodeId: d.getNodeId(),
      step: HYDRATION_STEP.VERIFY,
      durationMs: Date.now() - verifyStartedAt,
    });

    const leaderWaitStartedAt = Date.now();
    await this.waitForSystemServiceLeadersInCache();
    logger.info(LOG_HYDRATION_STEP_COMPLETE, {
      nodeId: d.getNodeId(),
      step: HYDRATION_STEP.WAIT_LEADERS,
      durationMs: Date.now() - leaderWaitStartedAt,
    });

    const latencyOwnersStartedAt = Date.now();
    this.ensureLatencyTopologyOwners();
    logger.info(LOG_HYDRATION_STEP_COMPLETE, {
      nodeId: d.getNodeId(),
      step: HYDRATION_STEP.LATENCY_OWNERS,
      durationMs: Date.now() - latencyOwnersStartedAt,
    });

    const subscribeStartedAt = Date.now();
    await this.subscribeToInitialSystemTableCDC();
    logger.info(LOG_HYDRATION_STEP_COMPLETE, {
      nodeId: d.getNodeId(),
      step: HYDRATION_STEP.SUBSCRIBE_CDC,
      durationMs: Date.now() - subscribeStartedAt,
    });

    const cdcReadinessGate =
      d.createCdcPipelineReadinessGate(systemTableCache);
    const cdcReadinessTimeoutMs =
      config.cdcPipelineReadinessTimeoutMs ||
      CDC_PIPELINE_READINESS_TIMEOUT_MS;
    const readinessStartedAt = Date.now();
    await cdcReadinessGate.waitForReady(
      {
        partitionServices: d.getPartitionServices(),
        messageGroupServices: d.getMessageGroupServices(),
      },
      cdcReadinessTimeoutMs,
    );
    logger.info(LOG_HYDRATION_STEP_COMPLETE, {
      nodeId: d.getNodeId(),
      step: HYDRATION_STEP.CDC_READINESS,
      durationMs: Date.now() - readinessStartedAt,
    });

    const cdcQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: d.getMessageRouter(),
      nodeId: d.getNodeId(),
      rebalanceCoordinator: d.getRebalanceCoordinator(),
      controlPlaneReadinessService:
        d.getRebalanceCoordinator()?.controlPlaneReadinessService || null,
      defaultRoutingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      migrationAutoWire: false,
      autoStartDistributedTransactionRecovery: false,
      unrefRetryDelayTimers: true,
    });
    wireMigrationWorkflowOwners({
      sqlCore: cdcQueryEngine,
      systemTableCache,
      transactionCoordinator: cdcQueryEngine.transactionCoordinator,
      logger,
      now: () => Date.now(),
    });

    const cdcUpgradeStartedAt = Date.now();
    let cdcIntegrationService = d.getCdcIntegrationService();
    if (!cdcIntegrationService) {
      cdcIntegrationService = CDCIntegrationSetup.createForNormal({
        nodeId: d.getNodeId(),
        sqlQueryEngine: cdcQueryEngine,
        systemTableCache,
        messageRouter: d.getMessageRouter(),
        partitionServicesProvider: () => d.getPartitionServices(),
      });
      d.setCdcIntegrationService(cdcIntegrationService);

      logger.debug(LOG_CDC_INITIALIZED, {
        nodeId: d.getNodeId(),
        owner: CDC_INTEGRATION_OWNER,
        mode: CDC_INTEGRATION_MODE_NORMAL,
      });
    } else {
      CDCIntegrationSetup.upgrade({
        cdcIntegrationService,
        sqlQueryEngine: cdcQueryEngine,
        systemTableCache,
        messageRouter: d.getMessageRouter(),
        partitionServicesProvider: () => d.getPartitionServices(),
      });

      logger.debug(LOG_CDC_UPGRADED, {
        nodeId: d.getNodeId(),
        owner: CDC_INTEGRATION_OWNER,
      });
    }
    logger.info(LOG_HYDRATION_STEP_COMPLETE, {
      nodeId: d.getNodeId(),
      step: HYDRATION_STEP.CDC_NORMAL_MODE,
      durationMs: Date.now() - cdcUpgradeStartedAt,
    });

    const epochManager = d.getEpochManager();
    if (epochManager) {
      cdcIntegrationService.setEpochManager(epochManager);
    }

    d.setSystemTableCacheRef(systemTableCache);
    d.swapSystemTableWriter();

    if (leaderMessageGroup) {
      d.setRpcClient(
        new RPCClient({
          messageGroupService: leaderMessageGroup,
        }),
      );
    }

    const tablePolicyService = d.getTablePolicyService();
    if (!tablePolicyService) {
      const newTps = new TablePolicyService({
        systemTableCache,
        cdcIntegrationService,
      });
      newTps.initialize();
      d.setTablePolicyService(newTps);
    } else {
      tablePolicyService.systemTableCache = systemTableCache;
      tablePolicyService.cdcIntegrationService =
        cdcIntegrationService;
    }

    const partitionWiringStartedAt = Date.now();
    for (const partition of d.getPartitionServices().values()) {
      partition.systemTableCache = systemTableCache;
      partition.cdcIntegrationService = cdcIntegrationService;
      partition.tablePolicyService = d.getTablePolicyService();
      partition.sqlQueryEngine = cdcQueryEngine;
    }
    logger.info(LOG_HYDRATION_STEP_COMPLETE, {
      nodeId: d.getNodeId(),
      step: HYDRATION_STEP.WIRE_PARTITIONS,
      durationMs: Date.now() - partitionWiringStartedAt,
      partitionServiceCount: d.getPartitionServices().size,
    });

    const messageGroupWiringStartedAt = Date.now();
    for (const messageGroup of
      d.getMessageGroupServices().values()) {
      messageGroup.cdcIntegrationService = cdcIntegrationService;
    }
    logger.info(LOG_HYDRATION_STEP_COMPLETE, {
      nodeId: d.getNodeId(),
      step: HYDRATION_STEP.WIRE_MESSAGE_GROUPS,
      durationMs: Date.now() - messageGroupWiringStartedAt,
      messageGroupServiceCount:
        d.getMessageGroupServices().size,
    });

    logger.info(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_COMPLETE, {
      success: result.success,
      tablesHydrated: Object.keys(result.tables).length,
      totalRows: this.countTotalRows(result),
      errors: result.errors.length,
      nodeId: d.getNodeId(),
    });
  }

  /**
   * Hydrate cache by reading directly from local partition services.
   * @param {Object} systemTableCache
   * @param {Object} leaderMessageGroup
   * @return {Promise<Object>}
   */
  async hydrateFromLocalPartitions(
    systemTableCache, leaderMessageGroup,
  ) {
    const d = this.delegates;
    const logger = d.getLogger();
    const result = {
      success: true,
      tables: {},
      errors: [],
    };

    const systemTables = CACHE_HYDRATION_TABLES;

    for (const tableName of systemTables) {
      try {
        const partitionId = INITIAL_PARTITION_IDS[tableName];
        if (!partitionId) {
          result.tables[tableName] = {
            success: false,
            error:
              HYDRATION_ERROR_MSG.NO_PARTITION_ID_PREFIX +
              tableName,
          };
          result.errors.push({
            tableName,
            error: HYDRATION_ERROR_MSG.NO_PARTITION_ID,
          });
          continue;
        }

        let leaderPartition = null;
        for (const partition of
          d.getPartitionServices().values()) {
          if (partition.partitionId === partitionId &&
              partition.isLeader) {
            leaderPartition = partition;
            break;
          }
        }

        if (!leaderPartition) {
          result.tables[tableName] = {
            success: false,
            error:
              HYDRATION_ERROR_MSG.NO_LEADER_PARTITION_PREFIX +
              tableName,
          };
          result.errors.push({
            tableName,
            error: HYDRATION_ERROR_MSG.NO_LEADER_PARTITION,
          });
          continue;
        }

        const sql = SQL_SELECT_ALL_FROM_TABLE(tableName);
        const queryResult =
          await leaderPartition.executeQuery(sql);

        if (!queryResult.success) {
          result.tables[tableName] = {
            success: false,
            error: queryResult.error ||
              HYDRATION_ERROR_MSG.QUERY_FAILED,
          };
          result.errors.push({
            tableName, error: queryResult.error,
          });
          continue;
        }

        const rows = queryResult.rows || [];

        for (const row of rows) {
          await leaderMessageGroup.applyCDCEvent(
            tableName, CDC_OPERATION.INSERT, row,
            CDC_APPLY_OPTIONS);
        }

        result.tables[tableName] = {
          success: true,
          rowCount: rows.length,
        };

        logger.debug(BOOTSTRAP_LOG_MSG.TABLE_HYDRATED, {
          tableName,
          rowCount: rows.length,
        });
      } catch (error) {
        result.tables[tableName] = {
          success: false,
          error: error.message,
        };
        result.errors.push({tableName, error: error.message});

        logger.error(BOOTSTRAP_LOG_MSG.TABLE_HYDRATION_FAILED, {
          tableName,
          error: error.message,
        });
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
    }

    return result;
  }

  /**
   * Verify cache hydration completed successfully.
   * @param {Object} systemTableCache
   * @param {Object} result
   */
  verifyCacheHydration(systemTableCache, result) {
    const d = this.delegates;
    const logger = d.getLogger();
    const expectedTables = [
      SYSTEM_TABLE_NAME.PARTITIONS,
      SYSTEM_TABLE_NAME.SERVICES,
      SYSTEM_TABLE_NAME.TABLES,
      SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
    ];

    const missingTables = [];
    const emptyTables = [];

    for (const tableName of expectedTables) {
      if (!result.tables[tableName]) {
        missingTables.push(tableName);
        continue;
      }

      if (!result.tables[tableName].success) {
        missingTables.push(tableName);
        continue;
      }

      const rows = systemTableCache.getAll(tableName);
      if (!rows || rows.length === 0) {
        emptyTables.push(tableName);
      }
    }

    if (missingTables.length > 0 ||
        emptyTables.length > 0) {
      logger.error(
        BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_INCOMPLETE, {
          missingTables,
          emptyTables,
          nodeId: d.getNodeId(),
        });
      const details = [
        `missing tables: ${missingTables.join(', ') || 'none'}`,
        `empty tables: ${emptyTables.join(', ') || 'none'}`,
      ];
      const error = new Error(
        'Cache hydration incomplete for required tables ' +
        `(${details.join('; ')})`,
      );
      error.missingTables = missingTables;
      error.emptyTables = emptyTables;
      throw error;
    } else {
      logger.debug(
        BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_VERIFIED, {
          tablesVerified: expectedTables.length,
          nodeId: d.getNodeId(),
        });
    }
  }

  /**
   * Count total rows hydrated across all tables.
   * @param {Object} result
   * @return {number}
   */
  countTotalRows(result) {
    let total = 0;
    for (const tableResult of Object.values(result.tables)) {
      if (tableResult.success && tableResult.rowCount) {
        total += tableResult.rowCount;
      }
    }
    return total;
  }

  /**
   * Subscribe to CDC for all initial system tables.
   * @return {Promise<void>}
   */
  async subscribeToInitialSystemTableCDC() {
    for (const tableName of CACHE_HYDRATION_TABLES) {
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      const replicaIds =
        INITIAL_REPLICA_IDS[tableName] || [];
      if (!partitionId ||
          replicaIds.length === 0) {
        continue;
      }

      await this.subscribeToCDC(
        tableName, partitionId, replicaIds,
      );
    }
  }

  /**
   * Subscribe message groups to CDC events from a partition.
   * @param {string} tableName
   * @param {string} partitionId
   * @param {Array<string>} replicaIds
   * @return {Promise<void>}
   */
  async subscribeToCDC(tableName, partitionId, replicaIds) {
    return subscribeToHydrationCDC({
      delegates: this.delegates,
      tableName,
      partitionId,
      replicaIds,
    });
  }

  /**
   * Apply authoritative epoch from the current cache snapshot.
   */
  applyCurrentEpochFromCache() {
    return this.runtimeBridgeOwner.applyCurrentEpochFromCache();
  }

  /**
   * Wait for the blocking system-table write leaders required to finish
   * seed bootstrap publication. Message-group service rows may remain
   * non-active until the post-pipeline activation barrier completes.
   * @return {Promise<void>}
   */
  async waitForSystemServiceLeadersInCache() {
    const d = this.delegates;
    const config = d.getConfig();
    const cache = d.getSystemTableCache();
    const timeoutMs = config.leadershipWaitTimeoutMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs;
    await waitForStartupConvergence({
      timeoutMs,
      subscriptions: [
        (notify) => subscribeToSystemTableCacheChanges(cache, notify),
      ],
      evaluate: () => createSystemLeaderReadinessSnapshot({
        systemTableCache: cache,
        requiredTables: SEED_REQUIRED_WRITE_TABLES,
        isTableWriteSatisfied: (systemTableCache, tableName) =>
          this.isSeedLocalSystemTableWriteReady(systemTableCache, tableName),
      }),
      createTimeoutError: (readiness, context) => {
        const missing = readiness?.missingLeaders || {};
        const allMissing = [
          ...(missing.missingPartitionLeaders || []),
          ...(missing.missingMessageGroupLeaders || []),
          ...(missing.missingPartitionLeaderNodes || []),
          ...(missing.missingMessageGroupLeaderNodes || []),
          ...(missing.missingPartitionLeaderAddresses || []),
          ...(missing.missingMessageGroupLeaderAddresses || []),
        ];
        const error = new Error(
          BOOTSTRAP_ERROR.partitionLeadershipTimeout(
            allMissing,
            timeoutMs,
          ),
        );
        error.missingLeaders = missing;
        error.missingCount = readiness?.missingCount || 0;
        error.timeoutMs = timeoutMs;
        error.timeoutKind = context.timeoutKind;
        return error;
      },
    });
  }

  isSeedLocalSystemTableWriteReady(systemTableCache, tableName) {
    if (isSystemTableWriteReady(systemTableCache, tableName)) {
      return true;
    }

    const replicaIds = INITIAL_REPLICA_IDS[tableName];
    if (!Array.isArray(replicaIds) || replicaIds.length === 0) {
      return false;
    }

    const partitionServices = this.delegates.getPartitionServices?.();
    if (!partitionServices || typeof partitionServices.get !== LOCAL_STR_FUNCTION) {
      return false;
    }

    // Seed bootstrap can write directly through the local leader partition
    // before its addressed service row is published into the cache.
    return replicaIds.some((replicaId) =>
      isLiveServiceLeader(partitionServices.get(replicaId)),
    );
  }

  /**
   * Repair propagated cache tables from authoritative local
   * partition reads.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async repairPropagatedCacheTablesFromLocalPartitions(
    options = {},
  ) {
    const d = this.delegates;
    const logger = d.getLogger();
    const systemTableCache = d.getSystemTableCache();
    const hydrationMessageGroup = assertCritical(
      d.getLeaderMessageGroupService(),
      BOOTSTRAP_ERROR.CDC_HYDRATION_MISSING,
    );
    const result = await d.hydrateFromLocalPartitions(
      systemTableCache,
      hydrationMessageGroup,
    );
    if (result?.success === false ||
        (Array.isArray(result?.errors) &&
         result.errors.length > 0)) {
      const errorDetails = (result?.errors || [])
        .map((entry) => `${entry.tableName}:${entry.error}`)
        .join(', ');
      throw new Error(
        LOG_REPAIR_ERROR_PREFIX +
        (errorDetails ? ` (${errorDetails})` : ''),
      );
    }

    logger.warn(
      LOG_REPAIRED, {
        nodeId: d.getNodeId(),
        reason: options.reason || null,
        targetNodeId: options.targetNodeId || null,
        tablesHydrated:
          Object.keys(result?.tables || {}).length,
        totalRows: this.countTotalRows(result),
      });
    return result;
  }

  /**
   * Ensure CDC integration service is initialized for bootstrap.
   * @return {Object}
   */
  ensureBootstrapCdcIntegrationService() {
    return this.runtimeBridgeOwner.ensureBootstrapCdcIntegrationService();
  }

  /**
   * Ensure latency topology owners are initialized.
   * @return {Object}
   */
  ensureLatencyTopologyOwners() {
    return this.runtimeBridgeOwner.ensureLatencyTopologyOwners();
  }

  /**
   * Start latency topology lifecycle owners.
   */
  startLatencyTopologyLifecycle() {
    return this.runtimeBridgeOwner.startLatencyTopologyLifecycle();
  }

  /**
   * Propagate partition CDC via topology-owned propagation path.
   * @param {Object} messageGroupService
   * @param {Object} cdcEvent
   * @return {Promise<Object>}
   */
  async propagatePartitionCDCEvent(
    messageGroupService, cdcEvent,
  ) {
    return this.runtimeBridgeOwner.propagatePartitionCDCEvent(
      messageGroupService,
      cdcEvent,
    );
  }

  /**
   * Resolve the message-group service for CDC propagation.
   * @param {Object|null} preferredMessageGroupService
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Promise<Object|null>}
   */
  async resolveCdcPropagationMessageGroup(
    preferredMessageGroupService,
    options = {},
  ) {
    const d = this.delegates;
    if (typeof d.resolveOperationalMessageGroupSelectionAsync === LOCAL_STR_FUNCTION) {
      const selection = await d.resolveOperationalMessageGroupSelectionAsync({
        requiredTables: Array.isArray(options.requiredTables) ?
          options.requiredTables :
          [],
        preferredService: preferredMessageGroupService,
        reuseCapturedIngress: true,
      });
      return selection.service || null;
    }
    const leaderMgs = d.getLeaderMessageGroupService();
    return leaderMgs || null;
  }

  /**
   * Create the shared CDC pipeline readiness gate.
   * @param {Object} systemTableCache
   * @return {CDCPipelineReadinessGate}
   */
  createCdcPipelineReadinessGate(systemTableCache) {
    return this.runtimeBridgeOwner.createCdcPipelineReadinessGate(
      systemTableCache,
    );
  }
}

export {SeedCacheHydrationPhase};
