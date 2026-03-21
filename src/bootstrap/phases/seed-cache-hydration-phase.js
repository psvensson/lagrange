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
import {LatencyTopologySetup} from '../shared/latency-topology-setup.js';
import {
  buildMessageGroupOwnerNotReadyError,
} from '../shared/message-group-selection.js';
import {
  CDCPipelineReadinessGate,
} from '../../cdc/cdc-pipeline-readiness-gate.js';
import {
  CDC_PIPELINE_READINESS_TIMEOUT_MS,
  CDC_LIFECYCLE_LOG_MSG,
} from '../../constants/cdc-lifecycle-constants.js';
import {createSystemLeaderReadinessSnapshot} from '../system-readiness-snapshot.js';
import {isNodeRecordReady} from '../../node/node-readiness-policy.js';
import {
  CACHE_HYDRATION_TABLES,
  CDC_PROPAGATED_TABLES,
} from '../../cache/cache-constants.js';
import {
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_PHASE,
} from '../bootstrap-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
} from '../system-table-schemas-constants.js';
import {EPOCH_CONFIG_KEY} from '../../cdc/cdc-integration-service.js';
import {
  COLUMN,
  NUM,
  TABLES,
  CDC_OPERATION,
} from '../../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../control-plane/control-plane-readiness-constants.js';

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
const CDC_INTEGRATION_MODE_BOOTSTRAP = 'bootstrap';

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

const LOG_REPAIR_FAILED =
  'Failed to repair propagated cache tables after ' +
  'ready-node cache timeout';
const LOG_REPAIRED =
  'Repaired propagated cache tables from local partitions';
const LOG_REPAIR_ERROR_PREFIX =
  'Failed to repair propagated cache tables from ' +
  'local partitions';
const LATENCY_TOPOLOGY_OWNER = 'LatencyTopologySetup';

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
    const leaderMessageGroup = d.getLeaderMessageGroupService();

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
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      migrationAutoWire: false,
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

    if (result.errors.length > NUM.ZERO) {
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
      if (!rows || rows.length === NUM.ZERO) {
        emptyTables.push(tableName);
      }
    }

    if (missingTables.length > NUM.ZERO ||
        emptyTables.length > NUM.ZERO) {
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
    let total = NUM.ZERO;
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
          replicaIds.length === NUM.ZERO) {
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
    const d = this.delegates;
    const logger = d.getLogger();

    logger.debug(BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_START, {
      tableName,
      partitionId,
      replicaIds,
    });

    const messageGroups =
      [...d.getMessageGroupServices().values()];

    for (const messageGroup of messageGroups) {
      await messageGroup.subscribeToCDC(tableName);
    }

    for (const replicaId of replicaIds) {
      const partition =
        d.getPartitionServices().get(replicaId);
      if (!partition) {
        logger.warn(BOOTSTRAP_LOG_MSG.CDC_PARTITION_MISSING, {
          tableName,
          replicaId,
        });
        continue;
      }

      for (const messageGroup of messageGroups) {
        const subscriberId = [
          'bootstrap',
          d.getNodeId(),
          tableName,
          replicaId,
          messageGroup?.groupId || 'message-group',
        ].join(':');
        const cdcSubscriber = async (cdcEvent) => {
          if (cdcEvent.tableName === tableName) {
            logger.debug(
              BOOTSTRAP_LOG_MSG.CDC_EVENT_RECEIVED, {
                tableName: cdcEvent.tableName,
                operation: cdcEvent.operation,
                sourceReplica: replicaId,
              });
            const cdcData = cdcEvent?.data &&
              typeof cdcEvent.data === 'object' ?
              cdcEvent.data : {};
            const nodeId = cdcData[COLUMN.NODE_ID] ||
              cdcData.id || null;
            let previousNodeRow = null;
            if (tableName === TABLES.NODES && nodeId) {
              const stc = d.getSystemTableCache();
              const cachedNodeRow =
                stc.get(TABLES.NODES, nodeId);
              previousNodeRow = cachedNodeRow ?
                {...cachedNodeRow} : null;
            }

            if (tableName === TABLES.NODES) {
              d.handleNodeReadyRebalanceTrigger(
                cdcEvent, previousNodeRow,
              );
            }

            const propagationSelection =
              d.resolveOperationalMessageGroupSelection({
                requiredTables: [tableName],
              });
            const propagationMgs = propagationSelection.service;
            if (propagationMgs) {
              await d.propagatePartitionCDCEvent(
                propagationMgs, cdcEvent,
              );

              if (tableName === TABLES.CONFIG) {
                d.applyCurrentEpochFromCache();
              }
            } else {
              throw buildMessageGroupOwnerNotReadyError(
                propagationSelection,
                {
                  message:
                    `Operational message-group ingress not ready ` +
                    `for ${tableName} CDC propagation`,
                },
              );
            }
          }
        };
        const handshake =
          await partition.subscribeToCDCWithHandshake(
            cdcSubscriber,
            {subscriberId},
          );
        logger.debug(
          BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
            tableName,
            partitionId,
            replicaId,
            subscriberId: handshake.subscriberId,
            subscriptionEpoch: handshake.subscriptionEpoch,
            catchupMode: handshake.catchup.mode,
            bufferedEventsReplayed:
              handshake.catchup.bufferedEventsReplayed,
          });
      }

      logger.debug(
        BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
          tableName,
          partitionId,
          replicaId,
          isLeader: partition.isLeader,
        });
    }
  }

  /**
   * Apply authoritative epoch from the current cache snapshot.
   */
  applyCurrentEpochFromCache() {
    const d = this.delegates;
    const cdcIntegrationService = d.getCdcIntegrationService();
    const epochManager = d.getEpochManager();
    if (!cdcIntegrationService || !epochManager) {
      return;
    }

    const systemTableCache = d.getSystemTableCache();
    const epochRow = systemTableCache?.get(
      TABLES.CONFIG, EPOCH_CONFIG_KEY,
    );
    if (!epochRow) {
      return;
    }

    cdcIntegrationService.handleEpochChangeCDC({
      tableName: TABLES.CONFIG,
      operation: CDC_OPERATION.UPSERT,
      data: {
        ...epochRow,
        [COLUMN.CONFIG_KEY]:
          epochRow[COLUMN.CONFIG_KEY] || EPOCH_CONFIG_KEY,
      },
    });
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
    let delay = config.leadershipWaitInitialDelayMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitInitialDelayMs;
    const maxDelay = config.leadershipWaitMaxDelayMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitMaxDelayMs;
    const backoffMultiplier =
      config.leadershipWaitBackoffMultiplier ||
      BOOTSTRAP_DEFAULT.leadershipWaitBackoffMultiplier;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const readiness = createSystemLeaderReadinessSnapshot({
        systemTableCache: cache,
        requiredTables: SEED_REQUIRED_WRITE_TABLES,
      });

      if (readiness.ready) {
        return;
      }

      await d.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    const readiness = createSystemLeaderReadinessSnapshot({
      systemTableCache: cache,
      requiredTables: SEED_REQUIRED_WRITE_TABLES,
    });
    const missing = readiness.missingLeaders;
    const allMissing = [
      ...missing.missingPartitionLeaders,
      ...missing.missingMessageGroupLeaders,
      ...missing.missingPartitionLeaderNodes,
      ...missing.missingMessageGroupLeaderNodes,
      ...missing.missingPartitionLeaderAddresses,
      ...missing.missingMessageGroupLeaderAddresses,
    ];
    const error = new Error(
      BOOTSTRAP_ERROR.partitionLeadershipTimeout(
        allMissing, timeoutMs,
      ),
    );
    error.missingLeaders = missing;
    error.missingCount = readiness.missingCount;
    error.timeoutMs = timeoutMs;
    throw error;
  }

  /**
   * Wait for a node to appear as ready in the system table cache.
   * @param {string} nodeId
   * @return {Promise<void>}
   */
  async waitForReadyNodeInCache(nodeId) {
    const d = this.delegates;
    const logger = d.getLogger();
    const config = d.getConfig();
    const cache = d.getSystemTableCache();
    const timeoutMs = config.leadershipWaitTimeoutMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs;
    let delay = config.leadershipWaitInitialDelayMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitInitialDelayMs;
    const maxDelay = config.leadershipWaitMaxDelayMs ||
      BOOTSTRAP_DEFAULT.leadershipWaitMaxDelayMs;
    const backoffMultiplier =
      config.leadershipWaitBackoffMultiplier ||
      BOOTSTRAP_DEFAULT.leadershipWaitBackoffMultiplier;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const now = Date.now();
      const node = cache.get(TABLES.NODES, nodeId);
      if (isNodeRecordReady(node, {now})) {
        return;
      }

      await d.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    try {
      await this.repairPropagatedCacheTablesFromLocalPartitions({
        reason: 'ready_node_timeout',
        targetNodeId: nodeId,
      });
      const repairedNode = cache.get(TABLES.NODES, nodeId);
      if (isNodeRecordReady(repairedNode, {now: Date.now()})) {
        return;
      }
    } catch (error) {
      logger.error(
        LOG_REPAIR_FAILED,
        {
          nodeId: d.getNodeId(),
          targetNodeId: nodeId,
          error: error?.message || String(error),
        },
      );
    }

    throw new Error(
      BOOTSTRAP_ERROR.seedReadyTimeout(nodeId, timeoutMs),
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
         result.errors.length > NUM.ZERO)) {
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
    const d = this.delegates;
    const logger = d.getLogger();
    let cdcIntegrationService = d.getCdcIntegrationService();
    if (cdcIntegrationService) {
      return cdcIntegrationService;
    }

    cdcIntegrationService = CDCIntegrationSetup.createForBootstrap({
      nodeId: d.getNodeId(),
      messageRouter: d.getMessageRouter(),
    });
    d.setCdcIntegrationService(cdcIntegrationService);

    logger.debug(LOG_CDC_INITIALIZED, {
      nodeId: d.getNodeId(),
      owner: CDC_INTEGRATION_OWNER,
      mode: CDC_INTEGRATION_MODE_BOOTSTRAP,
    });

    return cdcIntegrationService;
  }

  /**
   * Ensure latency topology owners are initialized.
   * @return {Object}
   */
  ensureLatencyTopologyOwners() {
    const d = this.delegates;
    const logger = d.getLogger();

    let latencyTopology = d.getLatencyTopology();
    if (latencyTopology) {
      return latencyTopology;
    }

    latencyTopology = LatencyTopologySetup.create({
      nodeId: d.getNodeId(),
      systemTableCache: d.getSystemTableCache(),
      cdcIntegrationService: d.getCdcIntegrationService(),
      messageRouter: d.getMessageRouter(),
    });
    latencyTopology.latencyTreeService.start({
      recomputeImmediately: true,
    });
    latencyTopology.cdcGroupPropagationService.start();
    d.setLatencyTopology(latencyTopology);

    logger.info(BOOTSTRAP_LOG_MSG.LATENCY_TOPOLOGY_READY, {
      nodeId: d.getNodeId(),
      owner: LATENCY_TOPOLOGY_OWNER,
    });
    return latencyTopology;
  }

  /**
   * Start latency topology lifecycle owners.
   */
  startLatencyTopologyLifecycle() {
    const d = this.delegates;
    const logger = d.getLogger();
    const topologyOwners = assertCritical(
      d.getLatencyTopology(),
      BOOTSTRAP_ERROR.LATENCY_TOPOLOGY_MISSING,
    );
    LatencyTopologySetup.start(topologyOwners);
    logger.info(BOOTSTRAP_LOG_MSG.LATENCY_TOPOLOGY_STARTED, {
      nodeId: d.getNodeId(),
      owner: LATENCY_TOPOLOGY_OWNER,
    });
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
    const d = this.delegates;
    const topologyOwners = assertCritical(
      d.getLatencyTopology(),
      BOOTSTRAP_ERROR.LATENCY_TOPOLOGY_MISSING,
    );
    return topologyOwners.cdcGroupPropagationService
      .propagateCDCEvent({
        tableName: cdcEvent.tableName,
        operation: cdcEvent.operation,
        data: cdcEvent.data,
        sourceMessageGroupService: messageGroupService,
      });
  }

  /**
   * Resolve the message-group service for CDC propagation.
   * @param {Object|null} preferredMessageGroupService
   * @return {Object|null}
   */
  resolveCdcPropagationMessageGroup(
    preferredMessageGroupService,
  ) {
    const d = this.delegates;
    const leaderMgs = d.getLeaderMessageGroupService();
    if (leaderMgs) {
      return leaderMgs;
    }
    return null;
  }

  /**
   * Create the shared CDC pipeline readiness gate.
   * @param {Object} systemTableCache
   * @return {CDCPipelineReadinessGate}
   */
  createCdcPipelineReadinessGate(systemTableCache) {
    const d = this.delegates;
    return new CDCPipelineReadinessGate({
      systemTableCache,
      cdcPropagatedTables: CDC_PROPAGATED_TABLES,
      now: () => Date.now(),
      sleep: (delayMs) => d.sleep(delayMs),
    });
  }
}

export {SeedCacheHydrationPhase};
