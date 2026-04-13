/**
 * Seed Cache Hydration Phase — handles Phase 5 of seed bootstrap:
 * populating the system cache from local partitions, subscribing
 * to CDC events, verifying cache completeness, and switching from
 * bootstrap mode to normal routed-SQL mode.
 *
 * Extracted from BootstrapService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { SQLQueryEngine } from '../../query/sql-query-engine.js';
import { wireMigrationWorkflowOwners } from '../../migration/migration-composition.js';
import { RPCClient } from '../../transport/rpc-client.js';
import { TablePolicyService } from '../../policy/table-policy-service.js';
import { assertCritical } from '../../utils/assert.js';
import { CDCIntegrationSetup } from '../shared/cdc-integration-setup.js';
import { subscribeToSystemTableCacheChanges, waitForStartupConvergence } from '../shared/startup-convergence-gate.js';
import { CDC_PIPELINE_READINESS_TIMEOUT_MS, CDC_LIFECYCLE_LOG_MSG } from '../../constants/cdc-lifecycle-constants.js';
import { createSystemLeaderReadinessSnapshot } from '../system-readiness-snapshot.js';
import { CACHE_HYDRATION_TABLES, CDC_PROPAGATED_TABLES } from '../../cache/cache-constants.js';
import { BOOTSTRAP_DEFAULT, BOOTSTRAP_ERROR, BOOTSTRAP_LOG_MSG, BOOTSTRAP_PHASE } from '../bootstrap-constants.js';
import { SYSTEM_TABLE_NAME, INITIAL_PARTITION_IDS, INITIAL_REPLICA_IDS } from '../system-table-schemas-constants.js';
import { COLUMN, NUM, TABLES, CDC_OPERATION } from '../../constants/index.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../../control-plane/control-plane-readiness-constants.js';
import { SeedRuntimeBridgeOwner } from '../owners/seed-runtime-bridge-owner.js';
import { isLiveServiceLeader } from '../owners/service-leader-readiness-owner.js';
import { isSystemTableWriteReady } from '../../cache/leader-readiness-gate.js';
const LOG_HYDRATION_STEP_COMPLETE = stryMutAct_9fa48("26008") ? "" : (stryCov_9fa48("26008"), 'Cache hydration step complete');
const HYDRATION_STEP = Object.freeze(stryMutAct_9fa48("26009") ? {} : (stryCov_9fa48("26009"), {
  HYDRATE_FROM_LOCAL: stryMutAct_9fa48("26010") ? "" : (stryCov_9fa48("26010"), 'hydrateFromLocalPartitions'),
  VERIFY: stryMutAct_9fa48("26011") ? "" : (stryCov_9fa48("26011"), 'verifyCacheHydration'),
  WAIT_LEADERS: stryMutAct_9fa48("26012") ? "" : (stryCov_9fa48("26012"), 'waitForSystemServiceLeadersInCache'),
  LATENCY_OWNERS: stryMutAct_9fa48("26013") ? "" : (stryCov_9fa48("26013"), 'ensureLatencyTopologyOwners'),
  SUBSCRIBE_CDC: stryMutAct_9fa48("26014") ? "" : (stryCov_9fa48("26014"), 'subscribeToInitialSystemTableCDC'),
  CDC_READINESS: stryMutAct_9fa48("26015") ? "" : (stryCov_9fa48("26015"), 'cdcReadinessGate.waitForReady'),
  CDC_NORMAL_MODE: stryMutAct_9fa48("26016") ? "" : (stryCov_9fa48("26016"), 'configureCdcIntegrationForNormalMode'),
  WIRE_PARTITIONS: stryMutAct_9fa48("26017") ? "" : (stryCov_9fa48("26017"), 'wirePartitionServicesForNormalMode'),
  WIRE_MESSAGE_GROUPS: stryMutAct_9fa48("26018") ? "" : (stryCov_9fa48("26018"), 'wireMessageGroupServicesForNormalMode')
}));
const SEED_REQUIRED_WRITE_TABLES = Object.freeze(stryMutAct_9fa48("26019") ? [] : (stryCov_9fa48("26019"), [TABLES.NODES, TABLES.NODE_ENDPOINTS, TABLES.SERVICES]));
const SQL_SELECT_ALL_FROM_TABLE = stryMutAct_9fa48("26020") ? () => undefined : (stryCov_9fa48("26020"), (() => {
  const SQL_SELECT_ALL_FROM_TABLE = tableName => stryMutAct_9fa48("26021") ? `` : (stryCov_9fa48("26021"), `SELECT * FROM ${tableName}`);
  return SQL_SELECT_ALL_FROM_TABLE;
})());
const LOG_CDC_INITIALIZED = stryMutAct_9fa48("26022") ? "" : (stryCov_9fa48("26022"), 'CDC integration initialized by owner');
const LOG_CDC_UPGRADED = stryMutAct_9fa48("26023") ? "" : (stryCov_9fa48("26023"), 'CDC integration upgraded by owner');
const CDC_INTEGRATION_OWNER = stryMutAct_9fa48("26024") ? "" : (stryCov_9fa48("26024"), 'CDCIntegrationSetup');
const CDC_INTEGRATION_MODE_NORMAL = stryMutAct_9fa48("26025") ? "" : (stryCov_9fa48("26025"), 'normal');
const HYDRATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("26026") ? {} : (stryCov_9fa48("26026"), {
  NO_PARTITION_ID_PREFIX: stryMutAct_9fa48("26027") ? "" : (stryCov_9fa48("26027"), 'No partition ID for table: '),
  NO_LEADER_PARTITION_PREFIX: stryMutAct_9fa48("26028") ? "" : (stryCov_9fa48("26028"), 'No leader partition found for: '),
  QUERY_FAILED: stryMutAct_9fa48("26029") ? "" : (stryCov_9fa48("26029"), 'Query failed'),
  NO_PARTITION_ID: stryMutAct_9fa48("26030") ? "" : (stryCov_9fa48("26030"), 'No partition ID'),
  NO_LEADER_PARTITION: stryMutAct_9fa48("26031") ? "" : (stryCov_9fa48("26031"), 'No leader partition')
}));
const CDC_APPLY_OPTIONS = Object.freeze(stryMutAct_9fa48("26032") ? {} : (stryCov_9fa48("26032"), {
  skipReplication: stryMutAct_9fa48("26033") ? false : (stryCov_9fa48("26033"), true),
  skipSubscriptionCheck: stryMutAct_9fa48("26034") ? false : (stryCov_9fa48("26034"), true)
}));
const LOG_REPAIR_FAILED = (stryMutAct_9fa48("26035") ? "" : (stryCov_9fa48("26035"), 'Failed to repair propagated cache tables after ')) + (stryMutAct_9fa48("26036") ? "" : (stryCov_9fa48("26036"), 'ready-node cache timeout'));
const LOG_REPAIRED = stryMutAct_9fa48("26037") ? "" : (stryCov_9fa48("26037"), 'Repaired propagated cache tables from local partitions');
const LOG_REPAIR_ERROR_PREFIX = (stryMutAct_9fa48("26038") ? "" : (stryCov_9fa48("26038"), 'Failed to repair propagated cache tables from ')) + (stryMutAct_9fa48("26039") ? "" : (stryCov_9fa48("26039"), 'local partitions'));
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
    if (stryMutAct_9fa48("26040")) {
      {}
    } else {
      stryCov_9fa48("26040");
      this.delegates = stryMutAct_9fa48("26043") ? options.delegates && {} : stryMutAct_9fa48("26042") ? false : stryMutAct_9fa48("26041") ? true : (stryCov_9fa48("26041", "26042", "26043"), options.delegates || {});
      this.runtimeBridgeOwner = stryMutAct_9fa48("26046") ? options.runtimeBridgeOwner && new SeedRuntimeBridgeOwner({
        delegates: this.delegates,
        compatibilityPhase: this
      }) : stryMutAct_9fa48("26045") ? false : stryMutAct_9fa48("26044") ? true : (stryCov_9fa48("26044", "26045", "26046"), options.runtimeBridgeOwner || new SeedRuntimeBridgeOwner(stryMutAct_9fa48("26047") ? {} : (stryCov_9fa48("26047"), {
        delegates: this.delegates,
        compatibilityPhase: this
      })));
    }
  }

  /**
   * Phase 5: Cache hydration.
   * Read system table data from local partitions, populate cache,
   * subscribe to CDC, and switch to normal routing mode.
   * @return {Promise<void>}
   */
  async phaseCacheHydration() {
    if (stryMutAct_9fa48("26048")) {
      {}
    } else {
      stryCov_9fa48("26048");
      const d = this.delegates;
      const logger = d.getLogger();
      const config = d.getConfig();
      logger.debug(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_STARTING, stryMutAct_9fa48("26049") ? {} : (stryCov_9fa48("26049"), {
        nodeId: d.getNodeId(),
        partitionCount: d.getPartitionServices().size
      }));
      const systemTableCache = d.getSystemTableCache();
      const leaderMessageGroup = stryMutAct_9fa48("26052") ? (d.getLeaderMessageGroupService() || d.getBootstrapMessageGroupService?.()) && null : stryMutAct_9fa48("26051") ? false : stryMutAct_9fa48("26050") ? true : (stryCov_9fa48("26050", "26051", "26052"), (stryMutAct_9fa48("26054") ? d.getLeaderMessageGroupService() && d.getBootstrapMessageGroupService?.() : stryMutAct_9fa48("26053") ? false : (stryCov_9fa48("26053", "26054"), d.getLeaderMessageGroupService() || (stryMutAct_9fa48("26055") ? d.getBootstrapMessageGroupService() : (stryCov_9fa48("26055"), d.getBootstrapMessageGroupService?.())))) || null);
      if (stryMutAct_9fa48("26058") ? false : stryMutAct_9fa48("26057") ? true : stryMutAct_9fa48("26056") ? leaderMessageGroup : (stryCov_9fa48("26056", "26057", "26058"), !leaderMessageGroup)) {
        if (stryMutAct_9fa48("26059")) {
          {}
        } else {
          stryCov_9fa48("26059");
          throw new Error(BOOTSTRAP_ERROR.CDC_HYDRATION_MISSING);
        }
      }
      logger.debug(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_READING, stryMutAct_9fa48("26060") ? {} : (stryCov_9fa48("26060"), {
        nodeId: d.getNodeId()
      }));
      const phaseStepStartedAt = Date.now();
      const result = await this.hydrateFromLocalPartitions(systemTableCache, leaderMessageGroup);
      logger.info(LOG_HYDRATION_STEP_COMPLETE, stryMutAct_9fa48("26061") ? {} : (stryCov_9fa48("26061"), {
        nodeId: d.getNodeId(),
        step: HYDRATION_STEP.HYDRATE_FROM_LOCAL,
        durationMs: stryMutAct_9fa48("26062") ? Date.now() + phaseStepStartedAt : (stryCov_9fa48("26062"), Date.now() - phaseStepStartedAt)
      }));
      const verifyStartedAt = Date.now();
      this.verifyCacheHydration(systemTableCache, result);
      logger.info(LOG_HYDRATION_STEP_COMPLETE, stryMutAct_9fa48("26063") ? {} : (stryCov_9fa48("26063"), {
        nodeId: d.getNodeId(),
        step: HYDRATION_STEP.VERIFY,
        durationMs: stryMutAct_9fa48("26064") ? Date.now() + verifyStartedAt : (stryCov_9fa48("26064"), Date.now() - verifyStartedAt)
      }));
      const leaderWaitStartedAt = Date.now();
      await this.waitForSystemServiceLeadersInCache();
      logger.info(LOG_HYDRATION_STEP_COMPLETE, stryMutAct_9fa48("26065") ? {} : (stryCov_9fa48("26065"), {
        nodeId: d.getNodeId(),
        step: HYDRATION_STEP.WAIT_LEADERS,
        durationMs: stryMutAct_9fa48("26066") ? Date.now() + leaderWaitStartedAt : (stryCov_9fa48("26066"), Date.now() - leaderWaitStartedAt)
      }));
      const latencyOwnersStartedAt = Date.now();
      this.ensureLatencyTopologyOwners();
      logger.info(LOG_HYDRATION_STEP_COMPLETE, stryMutAct_9fa48("26067") ? {} : (stryCov_9fa48("26067"), {
        nodeId: d.getNodeId(),
        step: HYDRATION_STEP.LATENCY_OWNERS,
        durationMs: stryMutAct_9fa48("26068") ? Date.now() + latencyOwnersStartedAt : (stryCov_9fa48("26068"), Date.now() - latencyOwnersStartedAt)
      }));
      const subscribeStartedAt = Date.now();
      await this.subscribeToInitialSystemTableCDC();
      logger.info(LOG_HYDRATION_STEP_COMPLETE, stryMutAct_9fa48("26069") ? {} : (stryCov_9fa48("26069"), {
        nodeId: d.getNodeId(),
        step: HYDRATION_STEP.SUBSCRIBE_CDC,
        durationMs: stryMutAct_9fa48("26070") ? Date.now() + subscribeStartedAt : (stryCov_9fa48("26070"), Date.now() - subscribeStartedAt)
      }));
      const cdcReadinessGate = d.createCdcPipelineReadinessGate(systemTableCache);
      const cdcReadinessTimeoutMs = stryMutAct_9fa48("26073") ? config.cdcPipelineReadinessTimeoutMs && CDC_PIPELINE_READINESS_TIMEOUT_MS : stryMutAct_9fa48("26072") ? false : stryMutAct_9fa48("26071") ? true : (stryCov_9fa48("26071", "26072", "26073"), config.cdcPipelineReadinessTimeoutMs || CDC_PIPELINE_READINESS_TIMEOUT_MS);
      const readinessStartedAt = Date.now();
      await cdcReadinessGate.waitForReady(stryMutAct_9fa48("26074") ? {} : (stryCov_9fa48("26074"), {
        partitionServices: d.getPartitionServices(),
        messageGroupServices: d.getMessageGroupServices()
      }), cdcReadinessTimeoutMs);
      logger.info(LOG_HYDRATION_STEP_COMPLETE, stryMutAct_9fa48("26075") ? {} : (stryCov_9fa48("26075"), {
        nodeId: d.getNodeId(),
        step: HYDRATION_STEP.CDC_READINESS,
        durationMs: stryMutAct_9fa48("26076") ? Date.now() + readinessStartedAt : (stryCov_9fa48("26076"), Date.now() - readinessStartedAt)
      }));
      const cdcQueryEngine = new SQLQueryEngine(stryMutAct_9fa48("26077") ? {} : (stryCov_9fa48("26077"), {
        systemCache: systemTableCache,
        messageRouter: d.getMessageRouter(),
        nodeId: d.getNodeId(),
        rebalanceCoordinator: d.getRebalanceCoordinator(),
        controlPlaneReadinessService: stryMutAct_9fa48("26080") ? d.getRebalanceCoordinator()?.controlPlaneReadinessService && null : stryMutAct_9fa48("26079") ? false : stryMutAct_9fa48("26078") ? true : (stryCov_9fa48("26078", "26079", "26080"), (stryMutAct_9fa48("26081") ? d.getRebalanceCoordinator().controlPlaneReadinessService : (stryCov_9fa48("26081"), d.getRebalanceCoordinator()?.controlPlaneReadinessService)) || null),
        defaultRoutingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        migrationAutoWire: stryMutAct_9fa48("26082") ? true : (stryCov_9fa48("26082"), false)
      }));
      wireMigrationWorkflowOwners(stryMutAct_9fa48("26083") ? {} : (stryCov_9fa48("26083"), {
        sqlCore: cdcQueryEngine,
        systemTableCache,
        transactionCoordinator: cdcQueryEngine.transactionCoordinator,
        logger,
        now: stryMutAct_9fa48("26084") ? () => undefined : (stryCov_9fa48("26084"), () => Date.now())
      }));
      const cdcUpgradeStartedAt = Date.now();
      let cdcIntegrationService = d.getCdcIntegrationService();
      if (stryMutAct_9fa48("26087") ? false : stryMutAct_9fa48("26086") ? true : stryMutAct_9fa48("26085") ? cdcIntegrationService : (stryCov_9fa48("26085", "26086", "26087"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("26088")) {
          {}
        } else {
          stryCov_9fa48("26088");
          cdcIntegrationService = CDCIntegrationSetup.createForNormal(stryMutAct_9fa48("26089") ? {} : (stryCov_9fa48("26089"), {
            nodeId: d.getNodeId(),
            sqlQueryEngine: cdcQueryEngine,
            systemTableCache,
            messageRouter: d.getMessageRouter(),
            partitionServicesProvider: stryMutAct_9fa48("26090") ? () => undefined : (stryCov_9fa48("26090"), () => d.getPartitionServices())
          }));
          d.setCdcIntegrationService(cdcIntegrationService);
          logger.debug(LOG_CDC_INITIALIZED, stryMutAct_9fa48("26091") ? {} : (stryCov_9fa48("26091"), {
            nodeId: d.getNodeId(),
            owner: CDC_INTEGRATION_OWNER,
            mode: CDC_INTEGRATION_MODE_NORMAL
          }));
        }
      } else {
        if (stryMutAct_9fa48("26092")) {
          {}
        } else {
          stryCov_9fa48("26092");
          CDCIntegrationSetup.upgrade(stryMutAct_9fa48("26093") ? {} : (stryCov_9fa48("26093"), {
            cdcIntegrationService,
            sqlQueryEngine: cdcQueryEngine,
            systemTableCache,
            messageRouter: d.getMessageRouter(),
            partitionServicesProvider: stryMutAct_9fa48("26094") ? () => undefined : (stryCov_9fa48("26094"), () => d.getPartitionServices())
          }));
          logger.debug(LOG_CDC_UPGRADED, stryMutAct_9fa48("26095") ? {} : (stryCov_9fa48("26095"), {
            nodeId: d.getNodeId(),
            owner: CDC_INTEGRATION_OWNER
          }));
        }
      }
      logger.info(LOG_HYDRATION_STEP_COMPLETE, stryMutAct_9fa48("26096") ? {} : (stryCov_9fa48("26096"), {
        nodeId: d.getNodeId(),
        step: HYDRATION_STEP.CDC_NORMAL_MODE,
        durationMs: stryMutAct_9fa48("26097") ? Date.now() + cdcUpgradeStartedAt : (stryCov_9fa48("26097"), Date.now() - cdcUpgradeStartedAt)
      }));
      const epochManager = d.getEpochManager();
      if (stryMutAct_9fa48("26099") ? false : stryMutAct_9fa48("26098") ? true : (stryCov_9fa48("26098", "26099"), epochManager)) {
        if (stryMutAct_9fa48("26100")) {
          {}
        } else {
          stryCov_9fa48("26100");
          cdcIntegrationService.setEpochManager(epochManager);
        }
      }
      d.setSystemTableCacheRef(systemTableCache);
      d.swapSystemTableWriter();
      if (stryMutAct_9fa48("26102") ? false : stryMutAct_9fa48("26101") ? true : (stryCov_9fa48("26101", "26102"), leaderMessageGroup)) {
        if (stryMutAct_9fa48("26103")) {
          {}
        } else {
          stryCov_9fa48("26103");
          d.setRpcClient(new RPCClient(stryMutAct_9fa48("26104") ? {} : (stryCov_9fa48("26104"), {
            messageGroupService: leaderMessageGroup
          })));
        }
      }
      const tablePolicyService = d.getTablePolicyService();
      if (stryMutAct_9fa48("26107") ? false : stryMutAct_9fa48("26106") ? true : stryMutAct_9fa48("26105") ? tablePolicyService : (stryCov_9fa48("26105", "26106", "26107"), !tablePolicyService)) {
        if (stryMutAct_9fa48("26108")) {
          {}
        } else {
          stryCov_9fa48("26108");
          const newTps = new TablePolicyService(stryMutAct_9fa48("26109") ? {} : (stryCov_9fa48("26109"), {
            systemTableCache,
            cdcIntegrationService
          }));
          newTps.initialize();
          d.setTablePolicyService(newTps);
        }
      } else {
        if (stryMutAct_9fa48("26110")) {
          {}
        } else {
          stryCov_9fa48("26110");
          tablePolicyService.systemTableCache = systemTableCache;
          tablePolicyService.cdcIntegrationService = cdcIntegrationService;
        }
      }
      const partitionWiringStartedAt = Date.now();
      for (const partition of d.getPartitionServices().values()) {
        if (stryMutAct_9fa48("26111")) {
          {}
        } else {
          stryCov_9fa48("26111");
          partition.systemTableCache = systemTableCache;
          partition.cdcIntegrationService = cdcIntegrationService;
          partition.tablePolicyService = d.getTablePolicyService();
          partition.sqlQueryEngine = cdcQueryEngine;
        }
      }
      logger.info(LOG_HYDRATION_STEP_COMPLETE, stryMutAct_9fa48("26112") ? {} : (stryCov_9fa48("26112"), {
        nodeId: d.getNodeId(),
        step: HYDRATION_STEP.WIRE_PARTITIONS,
        durationMs: stryMutAct_9fa48("26113") ? Date.now() + partitionWiringStartedAt : (stryCov_9fa48("26113"), Date.now() - partitionWiringStartedAt),
        partitionServiceCount: d.getPartitionServices().size
      }));
      const messageGroupWiringStartedAt = Date.now();
      for (const messageGroup of d.getMessageGroupServices().values()) {
        if (stryMutAct_9fa48("26114")) {
          {}
        } else {
          stryCov_9fa48("26114");
          messageGroup.cdcIntegrationService = cdcIntegrationService;
        }
      }
      logger.info(LOG_HYDRATION_STEP_COMPLETE, stryMutAct_9fa48("26115") ? {} : (stryCov_9fa48("26115"), {
        nodeId: d.getNodeId(),
        step: HYDRATION_STEP.WIRE_MESSAGE_GROUPS,
        durationMs: stryMutAct_9fa48("26116") ? Date.now() + messageGroupWiringStartedAt : (stryCov_9fa48("26116"), Date.now() - messageGroupWiringStartedAt),
        messageGroupServiceCount: d.getMessageGroupServices().size
      }));
      logger.info(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_COMPLETE, stryMutAct_9fa48("26117") ? {} : (stryCov_9fa48("26117"), {
        success: result.success,
        tablesHydrated: Object.keys(result.tables).length,
        totalRows: this.countTotalRows(result),
        errors: result.errors.length,
        nodeId: d.getNodeId()
      }));
    }
  }

  /**
   * Hydrate cache by reading directly from local partition services.
   * @param {Object} systemTableCache
   * @param {Object} leaderMessageGroup
   * @return {Promise<Object>}
   */
  async hydrateFromLocalPartitions(systemTableCache, leaderMessageGroup) {
    if (stryMutAct_9fa48("26118")) {
      {}
    } else {
      stryCov_9fa48("26118");
      const d = this.delegates;
      const logger = d.getLogger();
      const result = stryMutAct_9fa48("26119") ? {} : (stryCov_9fa48("26119"), {
        success: stryMutAct_9fa48("26120") ? false : (stryCov_9fa48("26120"), true),
        tables: {},
        errors: stryMutAct_9fa48("26121") ? ["Stryker was here"] : (stryCov_9fa48("26121"), [])
      });
      const systemTables = CACHE_HYDRATION_TABLES;
      for (const tableName of systemTables) {
        if (stryMutAct_9fa48("26122")) {
          {}
        } else {
          stryCov_9fa48("26122");
          try {
            if (stryMutAct_9fa48("26123")) {
              {}
            } else {
              stryCov_9fa48("26123");
              const partitionId = INITIAL_PARTITION_IDS[tableName];
              if (stryMutAct_9fa48("26126") ? false : stryMutAct_9fa48("26125") ? true : stryMutAct_9fa48("26124") ? partitionId : (stryCov_9fa48("26124", "26125", "26126"), !partitionId)) {
                if (stryMutAct_9fa48("26127")) {
                  {}
                } else {
                  stryCov_9fa48("26127");
                  result.tables[tableName] = stryMutAct_9fa48("26128") ? {} : (stryCov_9fa48("26128"), {
                    success: stryMutAct_9fa48("26129") ? true : (stryCov_9fa48("26129"), false),
                    error: stryMutAct_9fa48("26130") ? HYDRATION_ERROR_MSG.NO_PARTITION_ID_PREFIX - tableName : (stryCov_9fa48("26130"), HYDRATION_ERROR_MSG.NO_PARTITION_ID_PREFIX + tableName)
                  });
                  result.errors.push(stryMutAct_9fa48("26131") ? {} : (stryCov_9fa48("26131"), {
                    tableName,
                    error: HYDRATION_ERROR_MSG.NO_PARTITION_ID
                  }));
                  continue;
                }
              }
              let leaderPartition = null;
              for (const partition of d.getPartitionServices().values()) {
                if (stryMutAct_9fa48("26132")) {
                  {}
                } else {
                  stryCov_9fa48("26132");
                  if (stryMutAct_9fa48("26135") ? partition.partitionId === partitionId || partition.isLeader : stryMutAct_9fa48("26134") ? false : stryMutAct_9fa48("26133") ? true : (stryCov_9fa48("26133", "26134", "26135"), (stryMutAct_9fa48("26137") ? partition.partitionId !== partitionId : stryMutAct_9fa48("26136") ? true : (stryCov_9fa48("26136", "26137"), partition.partitionId === partitionId)) && partition.isLeader)) {
                    if (stryMutAct_9fa48("26138")) {
                      {}
                    } else {
                      stryCov_9fa48("26138");
                      leaderPartition = partition;
                      break;
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("26141") ? false : stryMutAct_9fa48("26140") ? true : stryMutAct_9fa48("26139") ? leaderPartition : (stryCov_9fa48("26139", "26140", "26141"), !leaderPartition)) {
                if (stryMutAct_9fa48("26142")) {
                  {}
                } else {
                  stryCov_9fa48("26142");
                  result.tables[tableName] = stryMutAct_9fa48("26143") ? {} : (stryCov_9fa48("26143"), {
                    success: stryMutAct_9fa48("26144") ? true : (stryCov_9fa48("26144"), false),
                    error: stryMutAct_9fa48("26145") ? HYDRATION_ERROR_MSG.NO_LEADER_PARTITION_PREFIX - tableName : (stryCov_9fa48("26145"), HYDRATION_ERROR_MSG.NO_LEADER_PARTITION_PREFIX + tableName)
                  });
                  result.errors.push(stryMutAct_9fa48("26146") ? {} : (stryCov_9fa48("26146"), {
                    tableName,
                    error: HYDRATION_ERROR_MSG.NO_LEADER_PARTITION
                  }));
                  continue;
                }
              }
              const sql = SQL_SELECT_ALL_FROM_TABLE(tableName);
              const queryResult = await leaderPartition.executeQuery(sql);
              if (stryMutAct_9fa48("26149") ? false : stryMutAct_9fa48("26148") ? true : stryMutAct_9fa48("26147") ? queryResult.success : (stryCov_9fa48("26147", "26148", "26149"), !queryResult.success)) {
                if (stryMutAct_9fa48("26150")) {
                  {}
                } else {
                  stryCov_9fa48("26150");
                  result.tables[tableName] = stryMutAct_9fa48("26151") ? {} : (stryCov_9fa48("26151"), {
                    success: stryMutAct_9fa48("26152") ? true : (stryCov_9fa48("26152"), false),
                    error: stryMutAct_9fa48("26155") ? queryResult.error && HYDRATION_ERROR_MSG.QUERY_FAILED : stryMutAct_9fa48("26154") ? false : stryMutAct_9fa48("26153") ? true : (stryCov_9fa48("26153", "26154", "26155"), queryResult.error || HYDRATION_ERROR_MSG.QUERY_FAILED)
                  });
                  result.errors.push(stryMutAct_9fa48("26156") ? {} : (stryCov_9fa48("26156"), {
                    tableName,
                    error: queryResult.error
                  }));
                  continue;
                }
              }
              const rows = stryMutAct_9fa48("26159") ? queryResult.rows && [] : stryMutAct_9fa48("26158") ? false : stryMutAct_9fa48("26157") ? true : (stryCov_9fa48("26157", "26158", "26159"), queryResult.rows || (stryMutAct_9fa48("26160") ? ["Stryker was here"] : (stryCov_9fa48("26160"), [])));
              for (const row of rows) {
                if (stryMutAct_9fa48("26161")) {
                  {}
                } else {
                  stryCov_9fa48("26161");
                  await leaderMessageGroup.applyCDCEvent(tableName, CDC_OPERATION.INSERT, row, CDC_APPLY_OPTIONS);
                }
              }
              result.tables[tableName] = stryMutAct_9fa48("26162") ? {} : (stryCov_9fa48("26162"), {
                success: stryMutAct_9fa48("26163") ? false : (stryCov_9fa48("26163"), true),
                rowCount: rows.length
              });
              logger.debug(BOOTSTRAP_LOG_MSG.TABLE_HYDRATED, stryMutAct_9fa48("26164") ? {} : (stryCov_9fa48("26164"), {
                tableName,
                rowCount: rows.length
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("26165")) {
              {}
            } else {
              stryCov_9fa48("26165");
              result.tables[tableName] = stryMutAct_9fa48("26166") ? {} : (stryCov_9fa48("26166"), {
                success: stryMutAct_9fa48("26167") ? true : (stryCov_9fa48("26167"), false),
                error: error.message
              });
              result.errors.push(stryMutAct_9fa48("26168") ? {} : (stryCov_9fa48("26168"), {
                tableName,
                error: error.message
              }));
              logger.error(BOOTSTRAP_LOG_MSG.TABLE_HYDRATION_FAILED, stryMutAct_9fa48("26169") ? {} : (stryCov_9fa48("26169"), {
                tableName,
                error: error.message
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("26173") ? result.errors.length <= NUM.ZERO : stryMutAct_9fa48("26172") ? result.errors.length >= NUM.ZERO : stryMutAct_9fa48("26171") ? false : stryMutAct_9fa48("26170") ? true : (stryCov_9fa48("26170", "26171", "26172", "26173"), result.errors.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("26174")) {
          {}
        } else {
          stryCov_9fa48("26174");
          result.success = stryMutAct_9fa48("26175") ? true : (stryCov_9fa48("26175"), false);
        }
      }
      return result;
    }
  }

  /**
   * Verify cache hydration completed successfully.
   * @param {Object} systemTableCache
   * @param {Object} result
   */
  verifyCacheHydration(systemTableCache, result) {
    if (stryMutAct_9fa48("26176")) {
      {}
    } else {
      stryCov_9fa48("26176");
      const d = this.delegates;
      const logger = d.getLogger();
      const expectedTables = stryMutAct_9fa48("26177") ? [] : (stryCov_9fa48("26177"), [SYSTEM_TABLE_NAME.PARTITIONS, SYSTEM_TABLE_NAME.SERVICES, SYSTEM_TABLE_NAME.TABLES, SYSTEM_TABLE_NAME.MESSAGE_GROUPS]);
      const missingTables = stryMutAct_9fa48("26178") ? ["Stryker was here"] : (stryCov_9fa48("26178"), []);
      const emptyTables = stryMutAct_9fa48("26179") ? ["Stryker was here"] : (stryCov_9fa48("26179"), []);
      for (const tableName of expectedTables) {
        if (stryMutAct_9fa48("26180")) {
          {}
        } else {
          stryCov_9fa48("26180");
          if (stryMutAct_9fa48("26183") ? false : stryMutAct_9fa48("26182") ? true : stryMutAct_9fa48("26181") ? result.tables[tableName] : (stryCov_9fa48("26181", "26182", "26183"), !result.tables[tableName])) {
            if (stryMutAct_9fa48("26184")) {
              {}
            } else {
              stryCov_9fa48("26184");
              missingTables.push(tableName);
              continue;
            }
          }
          if (stryMutAct_9fa48("26187") ? false : stryMutAct_9fa48("26186") ? true : stryMutAct_9fa48("26185") ? result.tables[tableName].success : (stryCov_9fa48("26185", "26186", "26187"), !result.tables[tableName].success)) {
            if (stryMutAct_9fa48("26188")) {
              {}
            } else {
              stryCov_9fa48("26188");
              missingTables.push(tableName);
              continue;
            }
          }
          const rows = systemTableCache.getAll(tableName);
          if (stryMutAct_9fa48("26191") ? !rows && rows.length === NUM.ZERO : stryMutAct_9fa48("26190") ? false : stryMutAct_9fa48("26189") ? true : (stryCov_9fa48("26189", "26190", "26191"), (stryMutAct_9fa48("26192") ? rows : (stryCov_9fa48("26192"), !rows)) || (stryMutAct_9fa48("26194") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("26193") ? false : (stryCov_9fa48("26193", "26194"), rows.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("26195")) {
              {}
            } else {
              stryCov_9fa48("26195");
              emptyTables.push(tableName);
            }
          }
        }
      }
      if (stryMutAct_9fa48("26198") ? missingTables.length > NUM.ZERO && emptyTables.length > NUM.ZERO : stryMutAct_9fa48("26197") ? false : stryMutAct_9fa48("26196") ? true : (stryCov_9fa48("26196", "26197", "26198"), (stryMutAct_9fa48("26201") ? missingTables.length <= NUM.ZERO : stryMutAct_9fa48("26200") ? missingTables.length >= NUM.ZERO : stryMutAct_9fa48("26199") ? false : (stryCov_9fa48("26199", "26200", "26201"), missingTables.length > NUM.ZERO)) || (stryMutAct_9fa48("26204") ? emptyTables.length <= NUM.ZERO : stryMutAct_9fa48("26203") ? emptyTables.length >= NUM.ZERO : stryMutAct_9fa48("26202") ? false : (stryCov_9fa48("26202", "26203", "26204"), emptyTables.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("26205")) {
          {}
        } else {
          stryCov_9fa48("26205");
          logger.error(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_INCOMPLETE, stryMutAct_9fa48("26206") ? {} : (stryCov_9fa48("26206"), {
            missingTables,
            emptyTables,
            nodeId: d.getNodeId()
          }));
          const details = stryMutAct_9fa48("26207") ? [] : (stryCov_9fa48("26207"), [stryMutAct_9fa48("26208") ? `` : (stryCov_9fa48("26208"), `missing tables: ${stryMutAct_9fa48("26211") ? missingTables.join(', ') && 'none' : stryMutAct_9fa48("26210") ? false : stryMutAct_9fa48("26209") ? true : (stryCov_9fa48("26209", "26210", "26211"), missingTables.join(stryMutAct_9fa48("26212") ? "" : (stryCov_9fa48("26212"), ', ')) || (stryMutAct_9fa48("26213") ? "" : (stryCov_9fa48("26213"), 'none')))}`), stryMutAct_9fa48("26214") ? `` : (stryCov_9fa48("26214"), `empty tables: ${stryMutAct_9fa48("26217") ? emptyTables.join(', ') && 'none' : stryMutAct_9fa48("26216") ? false : stryMutAct_9fa48("26215") ? true : (stryCov_9fa48("26215", "26216", "26217"), emptyTables.join(stryMutAct_9fa48("26218") ? "" : (stryCov_9fa48("26218"), ', ')) || (stryMutAct_9fa48("26219") ? "" : (stryCov_9fa48("26219"), 'none')))}`)]);
          const error = new Error((stryMutAct_9fa48("26220") ? "" : (stryCov_9fa48("26220"), 'Cache hydration incomplete for required tables ')) + (stryMutAct_9fa48("26221") ? `` : (stryCov_9fa48("26221"), `(${details.join(stryMutAct_9fa48("26222") ? "" : (stryCov_9fa48("26222"), '; '))})`)));
          error.missingTables = missingTables;
          error.emptyTables = emptyTables;
          throw error;
        }
      } else {
        if (stryMutAct_9fa48("26223")) {
          {}
        } else {
          stryCov_9fa48("26223");
          logger.debug(BOOTSTRAP_LOG_MSG.CACHE_HYDRATION_VERIFIED, stryMutAct_9fa48("26224") ? {} : (stryCov_9fa48("26224"), {
            tablesVerified: expectedTables.length,
            nodeId: d.getNodeId()
          }));
        }
      }
    }
  }

  /**
   * Count total rows hydrated across all tables.
   * @param {Object} result
   * @return {number}
   */
  countTotalRows(result) {
    if (stryMutAct_9fa48("26225")) {
      {}
    } else {
      stryCov_9fa48("26225");
      let total = NUM.ZERO;
      for (const tableResult of Object.values(result.tables)) {
        if (stryMutAct_9fa48("26226")) {
          {}
        } else {
          stryCov_9fa48("26226");
          if (stryMutAct_9fa48("26229") ? tableResult.success || tableResult.rowCount : stryMutAct_9fa48("26228") ? false : stryMutAct_9fa48("26227") ? true : (stryCov_9fa48("26227", "26228", "26229"), tableResult.success && tableResult.rowCount)) {
            if (stryMutAct_9fa48("26230")) {
              {}
            } else {
              stryCov_9fa48("26230");
              stryMutAct_9fa48("26231") ? total -= tableResult.rowCount : (stryCov_9fa48("26231"), total += tableResult.rowCount);
            }
          }
        }
      }
      return total;
    }
  }

  /**
   * Subscribe to CDC for all initial system tables.
   * @return {Promise<void>}
   */
  async subscribeToInitialSystemTableCDC() {
    if (stryMutAct_9fa48("26232")) {
      {}
    } else {
      stryCov_9fa48("26232");
      for (const tableName of CACHE_HYDRATION_TABLES) {
        if (stryMutAct_9fa48("26233")) {
          {}
        } else {
          stryCov_9fa48("26233");
          const partitionId = INITIAL_PARTITION_IDS[tableName];
          const replicaIds = stryMutAct_9fa48("26236") ? INITIAL_REPLICA_IDS[tableName] && [] : stryMutAct_9fa48("26235") ? false : stryMutAct_9fa48("26234") ? true : (stryCov_9fa48("26234", "26235", "26236"), INITIAL_REPLICA_IDS[tableName] || (stryMutAct_9fa48("26237") ? ["Stryker was here"] : (stryCov_9fa48("26237"), [])));
          if (stryMutAct_9fa48("26240") ? !partitionId && replicaIds.length === NUM.ZERO : stryMutAct_9fa48("26239") ? false : stryMutAct_9fa48("26238") ? true : (stryCov_9fa48("26238", "26239", "26240"), (stryMutAct_9fa48("26241") ? partitionId : (stryCov_9fa48("26241"), !partitionId)) || (stryMutAct_9fa48("26243") ? replicaIds.length !== NUM.ZERO : stryMutAct_9fa48("26242") ? false : (stryCov_9fa48("26242", "26243"), replicaIds.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("26244")) {
              {}
            } else {
              stryCov_9fa48("26244");
              continue;
            }
          }
          await this.subscribeToCDC(tableName, partitionId, replicaIds);
        }
      }
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
    if (stryMutAct_9fa48("26245")) {
      {}
    } else {
      stryCov_9fa48("26245");
      const d = this.delegates;
      const logger = d.getLogger();
      logger.debug(BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_START, stryMutAct_9fa48("26246") ? {} : (stryCov_9fa48("26246"), {
        tableName,
        partitionId,
        replicaIds
      }));
      const messageGroups = stryMutAct_9fa48("26247") ? [] : (stryCov_9fa48("26247"), [...d.getMessageGroupServices().values()]);
      for (const messageGroup of messageGroups) {
        if (stryMutAct_9fa48("26248")) {
          {}
        } else {
          stryCov_9fa48("26248");
          await messageGroup.subscribeToCDC(tableName);
        }
      }
      for (const replicaId of replicaIds) {
        if (stryMutAct_9fa48("26249")) {
          {}
        } else {
          stryCov_9fa48("26249");
          const partition = d.getPartitionServices().get(replicaId);
          if (stryMutAct_9fa48("26252") ? false : stryMutAct_9fa48("26251") ? true : stryMutAct_9fa48("26250") ? partition : (stryCov_9fa48("26250", "26251", "26252"), !partition)) {
            if (stryMutAct_9fa48("26253")) {
              {}
            } else {
              stryCov_9fa48("26253");
              logger.warn(BOOTSTRAP_LOG_MSG.CDC_PARTITION_MISSING, stryMutAct_9fa48("26254") ? {} : (stryCov_9fa48("26254"), {
                tableName,
                replicaId
              }));
              continue;
            }
          }
          for (const messageGroup of messageGroups) {
            if (stryMutAct_9fa48("26255")) {
              {}
            } else {
              stryCov_9fa48("26255");
              const subscriberId = (stryMutAct_9fa48("26256") ? [] : (stryCov_9fa48("26256"), [stryMutAct_9fa48("26257") ? "" : (stryCov_9fa48("26257"), 'bootstrap'), d.getNodeId(), tableName, replicaId, stryMutAct_9fa48("26260") ? messageGroup?.groupId && 'message-group' : stryMutAct_9fa48("26259") ? false : stryMutAct_9fa48("26258") ? true : (stryCov_9fa48("26258", "26259", "26260"), (stryMutAct_9fa48("26261") ? messageGroup.groupId : (stryCov_9fa48("26261"), messageGroup?.groupId)) || (stryMutAct_9fa48("26262") ? "" : (stryCov_9fa48("26262"), 'message-group')))])).join(stryMutAct_9fa48("26263") ? "" : (stryCov_9fa48("26263"), ':'));
              const cdcSubscriber = async cdcEvent => {
                if (stryMutAct_9fa48("26264")) {
                  {}
                } else {
                  stryCov_9fa48("26264");
                  if (stryMutAct_9fa48("26267") ? cdcEvent.tableName !== tableName : stryMutAct_9fa48("26266") ? false : stryMutAct_9fa48("26265") ? true : (stryCov_9fa48("26265", "26266", "26267"), cdcEvent.tableName === tableName)) {
                    if (stryMutAct_9fa48("26268")) {
                      {}
                    } else {
                      stryCov_9fa48("26268");
                      logger.debug(BOOTSTRAP_LOG_MSG.CDC_EVENT_RECEIVED, stryMutAct_9fa48("26269") ? {} : (stryCov_9fa48("26269"), {
                        tableName: cdcEvent.tableName,
                        operation: cdcEvent.operation,
                        sourceReplica: replicaId
                      }));
                      const cdcData = (stryMutAct_9fa48("26272") ? cdcEvent?.data || typeof cdcEvent.data === 'object' : stryMutAct_9fa48("26271") ? false : stryMutAct_9fa48("26270") ? true : (stryCov_9fa48("26270", "26271", "26272"), (stryMutAct_9fa48("26273") ? cdcEvent.data : (stryCov_9fa48("26273"), cdcEvent?.data)) && (stryMutAct_9fa48("26275") ? typeof cdcEvent.data !== 'object' : stryMutAct_9fa48("26274") ? true : (stryCov_9fa48("26274", "26275"), typeof cdcEvent.data === (stryMutAct_9fa48("26276") ? "" : (stryCov_9fa48("26276"), 'object')))))) ? cdcEvent.data : {};
                      const nodeId = stryMutAct_9fa48("26279") ? (cdcData[COLUMN.NODE_ID] || cdcData.id) && null : stryMutAct_9fa48("26278") ? false : stryMutAct_9fa48("26277") ? true : (stryCov_9fa48("26277", "26278", "26279"), (stryMutAct_9fa48("26281") ? cdcData[COLUMN.NODE_ID] && cdcData.id : stryMutAct_9fa48("26280") ? false : (stryCov_9fa48("26280", "26281"), cdcData[COLUMN.NODE_ID] || cdcData.id)) || null);
                      let previousNodeRow = null;
                      if (stryMutAct_9fa48("26284") ? tableName === TABLES.NODES || nodeId : stryMutAct_9fa48("26283") ? false : stryMutAct_9fa48("26282") ? true : (stryCov_9fa48("26282", "26283", "26284"), (stryMutAct_9fa48("26286") ? tableName !== TABLES.NODES : stryMutAct_9fa48("26285") ? true : (stryCov_9fa48("26285", "26286"), tableName === TABLES.NODES)) && nodeId)) {
                        if (stryMutAct_9fa48("26287")) {
                          {}
                        } else {
                          stryCov_9fa48("26287");
                          const stc = d.getSystemTableCache();
                          const cachedNodeRow = stc.get(TABLES.NODES, nodeId);
                          previousNodeRow = cachedNodeRow ? stryMutAct_9fa48("26288") ? {} : (stryCov_9fa48("26288"), {
                            ...cachedNodeRow
                          }) : null;
                        }
                      }
                      if (stryMutAct_9fa48("26291") ? tableName !== TABLES.NODES : stryMutAct_9fa48("26290") ? false : stryMutAct_9fa48("26289") ? true : (stryCov_9fa48("26289", "26290", "26291"), tableName === TABLES.NODES)) {
                        if (stryMutAct_9fa48("26292")) {
                          {}
                        } else {
                          stryCov_9fa48("26292");
                          d.handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow);
                        }
                      }
                      const propagationMgs = await this.resolveCdcPropagationMessageGroup(messageGroup, stryMutAct_9fa48("26293") ? {} : (stryCov_9fa48("26293"), {
                        requiredTables: stryMutAct_9fa48("26294") ? [] : (stryCov_9fa48("26294"), [tableName])
                      }));
                      if (stryMutAct_9fa48("26296") ? false : stryMutAct_9fa48("26295") ? true : (stryCov_9fa48("26295", "26296"), propagationMgs)) {
                        if (stryMutAct_9fa48("26297")) {
                          {}
                        } else {
                          stryCov_9fa48("26297");
                          await d.propagatePartitionCDCEvent(propagationMgs, cdcEvent);
                          if (stryMutAct_9fa48("26300") ? tableName !== TABLES.CONFIG : stryMutAct_9fa48("26299") ? false : stryMutAct_9fa48("26298") ? true : (stryCov_9fa48("26298", "26299", "26300"), tableName === TABLES.CONFIG)) {
                            if (stryMutAct_9fa48("26301")) {
                              {}
                            } else {
                              stryCov_9fa48("26301");
                              d.applyCurrentEpochFromCache();
                            }
                          }
                        }
                      } else {
                        if (stryMutAct_9fa48("26302")) {
                          {}
                        } else {
                          stryCov_9fa48("26302");
                          const propagationSelection = await (d.resolveOperationalMessageGroupSelectionAsync ? d.resolveOperationalMessageGroupSelectionAsync(stryMutAct_9fa48("26303") ? {} : (stryCov_9fa48("26303"), {
                            requiredTables: stryMutAct_9fa48("26304") ? [] : (stryCov_9fa48("26304"), [tableName]),
                            preferredService: messageGroup
                          })) : d.resolveOperationalMessageGroupSelection(stryMutAct_9fa48("26305") ? {} : (stryCov_9fa48("26305"), {
                            requiredTables: stryMutAct_9fa48("26306") ? [] : (stryCov_9fa48("26306"), [tableName])
                          })));
                          throw d.buildMessageGroupOwnerNotReadyError(propagationSelection, stryMutAct_9fa48("26307") ? {} : (stryCov_9fa48("26307"), {
                            message: (stryMutAct_9fa48("26308") ? `` : (stryCov_9fa48("26308"), `Operational message-group ingress not ready `)) + (stryMutAct_9fa48("26309") ? `` : (stryCov_9fa48("26309"), `for ${tableName} CDC propagation`))
                          }));
                        }
                      }
                    }
                  }
                }
              };
              const handshake = await partition.subscribeToCDCWithHandshake(cdcSubscriber, stryMutAct_9fa48("26310") ? {} : (stryCov_9fa48("26310"), {
                subscriberId
              }));
              logger.debug(BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, stryMutAct_9fa48("26311") ? {} : (stryCov_9fa48("26311"), {
                tableName,
                partitionId,
                replicaId,
                subscriberId: handshake.subscriberId,
                subscriptionEpoch: handshake.subscriptionEpoch,
                catchupMode: handshake.catchup.mode,
                bufferedEventsReplayed: handshake.catchup.bufferedEventsReplayed
              }));
            }
          }
          logger.debug(BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, stryMutAct_9fa48("26312") ? {} : (stryCov_9fa48("26312"), {
            tableName,
            partitionId,
            replicaId,
            isLeader: partition.isLeader
          }));
        }
      }
    }
  }

  /**
   * Apply authoritative epoch from the current cache snapshot.
   */
  applyCurrentEpochFromCache() {
    if (stryMutAct_9fa48("26313")) {
      {}
    } else {
      stryCov_9fa48("26313");
      return this.runtimeBridgeOwner.applyCurrentEpochFromCache();
    }
  }

  /**
   * Wait for the blocking system-table write leaders required to finish
   * seed bootstrap publication. Message-group service rows may remain
   * non-active until the post-pipeline activation barrier completes.
   * @return {Promise<void>}
   */
  async waitForSystemServiceLeadersInCache() {
    if (stryMutAct_9fa48("26314")) {
      {}
    } else {
      stryCov_9fa48("26314");
      const d = this.delegates;
      const config = d.getConfig();
      const cache = d.getSystemTableCache();
      const timeoutMs = stryMutAct_9fa48("26317") ? config.leadershipWaitTimeoutMs && BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs : stryMutAct_9fa48("26316") ? false : stryMutAct_9fa48("26315") ? true : (stryCov_9fa48("26315", "26316", "26317"), config.leadershipWaitTimeoutMs || BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs);
      await waitForStartupConvergence(stryMutAct_9fa48("26318") ? {} : (stryCov_9fa48("26318"), {
        timeoutMs,
        subscriptions: stryMutAct_9fa48("26319") ? [] : (stryCov_9fa48("26319"), [stryMutAct_9fa48("26320") ? () => undefined : (stryCov_9fa48("26320"), notify => subscribeToSystemTableCacheChanges(cache, notify))]),
        evaluate: stryMutAct_9fa48("26321") ? () => undefined : (stryCov_9fa48("26321"), () => createSystemLeaderReadinessSnapshot(stryMutAct_9fa48("26322") ? {} : (stryCov_9fa48("26322"), {
          systemTableCache: cache,
          requiredTables: SEED_REQUIRED_WRITE_TABLES,
          isTableWriteSatisfied: stryMutAct_9fa48("26323") ? () => undefined : (stryCov_9fa48("26323"), (systemTableCache, tableName) => this.isSeedLocalSystemTableWriteReady(systemTableCache, tableName))
        }))),
        createTimeoutError: (readiness, context) => {
          if (stryMutAct_9fa48("26324")) {
            {}
          } else {
            stryCov_9fa48("26324");
            const missing = stryMutAct_9fa48("26327") ? readiness?.missingLeaders && {} : stryMutAct_9fa48("26326") ? false : stryMutAct_9fa48("26325") ? true : (stryCov_9fa48("26325", "26326", "26327"), (stryMutAct_9fa48("26328") ? readiness.missingLeaders : (stryCov_9fa48("26328"), readiness?.missingLeaders)) || {});
            const allMissing = stryMutAct_9fa48("26329") ? [] : (stryCov_9fa48("26329"), [...(stryMutAct_9fa48("26332") ? missing.missingPartitionLeaders && [] : stryMutAct_9fa48("26331") ? false : stryMutAct_9fa48("26330") ? true : (stryCov_9fa48("26330", "26331", "26332"), missing.missingPartitionLeaders || (stryMutAct_9fa48("26333") ? ["Stryker was here"] : (stryCov_9fa48("26333"), [])))), ...(stryMutAct_9fa48("26336") ? missing.missingMessageGroupLeaders && [] : stryMutAct_9fa48("26335") ? false : stryMutAct_9fa48("26334") ? true : (stryCov_9fa48("26334", "26335", "26336"), missing.missingMessageGroupLeaders || (stryMutAct_9fa48("26337") ? ["Stryker was here"] : (stryCov_9fa48("26337"), [])))), ...(stryMutAct_9fa48("26340") ? missing.missingPartitionLeaderNodes && [] : stryMutAct_9fa48("26339") ? false : stryMutAct_9fa48("26338") ? true : (stryCov_9fa48("26338", "26339", "26340"), missing.missingPartitionLeaderNodes || (stryMutAct_9fa48("26341") ? ["Stryker was here"] : (stryCov_9fa48("26341"), [])))), ...(stryMutAct_9fa48("26344") ? missing.missingMessageGroupLeaderNodes && [] : stryMutAct_9fa48("26343") ? false : stryMutAct_9fa48("26342") ? true : (stryCov_9fa48("26342", "26343", "26344"), missing.missingMessageGroupLeaderNodes || (stryMutAct_9fa48("26345") ? ["Stryker was here"] : (stryCov_9fa48("26345"), [])))), ...(stryMutAct_9fa48("26348") ? missing.missingPartitionLeaderAddresses && [] : stryMutAct_9fa48("26347") ? false : stryMutAct_9fa48("26346") ? true : (stryCov_9fa48("26346", "26347", "26348"), missing.missingPartitionLeaderAddresses || (stryMutAct_9fa48("26349") ? ["Stryker was here"] : (stryCov_9fa48("26349"), [])))), ...(stryMutAct_9fa48("26352") ? missing.missingMessageGroupLeaderAddresses && [] : stryMutAct_9fa48("26351") ? false : stryMutAct_9fa48("26350") ? true : (stryCov_9fa48("26350", "26351", "26352"), missing.missingMessageGroupLeaderAddresses || (stryMutAct_9fa48("26353") ? ["Stryker was here"] : (stryCov_9fa48("26353"), []))))]);
            const error = new Error(BOOTSTRAP_ERROR.partitionLeadershipTimeout(allMissing, timeoutMs));
            error.missingLeaders = missing;
            error.missingCount = stryMutAct_9fa48("26356") ? readiness?.missingCount && NUM.ZERO : stryMutAct_9fa48("26355") ? false : stryMutAct_9fa48("26354") ? true : (stryCov_9fa48("26354", "26355", "26356"), (stryMutAct_9fa48("26357") ? readiness.missingCount : (stryCov_9fa48("26357"), readiness?.missingCount)) || NUM.ZERO);
            error.timeoutMs = timeoutMs;
            error.timeoutKind = context.timeoutKind;
            return error;
          }
        }
      }));
    }
  }
  isSeedLocalSystemTableWriteReady(systemTableCache, tableName) {
    if (stryMutAct_9fa48("26358")) {
      {}
    } else {
      stryCov_9fa48("26358");
      if (stryMutAct_9fa48("26360") ? false : stryMutAct_9fa48("26359") ? true : (stryCov_9fa48("26359", "26360"), isSystemTableWriteReady(systemTableCache, tableName))) {
        if (stryMutAct_9fa48("26361")) {
          {}
        } else {
          stryCov_9fa48("26361");
          return stryMutAct_9fa48("26362") ? false : (stryCov_9fa48("26362"), true);
        }
      }
      const replicaIds = INITIAL_REPLICA_IDS[tableName];
      if (stryMutAct_9fa48("26365") ? !Array.isArray(replicaIds) && replicaIds.length === NUM.ZERO : stryMutAct_9fa48("26364") ? false : stryMutAct_9fa48("26363") ? true : (stryCov_9fa48("26363", "26364", "26365"), (stryMutAct_9fa48("26366") ? Array.isArray(replicaIds) : (stryCov_9fa48("26366"), !Array.isArray(replicaIds))) || (stryMutAct_9fa48("26368") ? replicaIds.length !== NUM.ZERO : stryMutAct_9fa48("26367") ? false : (stryCov_9fa48("26367", "26368"), replicaIds.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("26369")) {
          {}
        } else {
          stryCov_9fa48("26369");
          return stryMutAct_9fa48("26370") ? true : (stryCov_9fa48("26370"), false);
        }
      }
      const partitionServices = stryMutAct_9fa48("26371") ? this.delegates.getPartitionServices() : (stryCov_9fa48("26371"), this.delegates.getPartitionServices?.());
      if (stryMutAct_9fa48("26374") ? !partitionServices && typeof partitionServices.get !== 'function' : stryMutAct_9fa48("26373") ? false : stryMutAct_9fa48("26372") ? true : (stryCov_9fa48("26372", "26373", "26374"), (stryMutAct_9fa48("26375") ? partitionServices : (stryCov_9fa48("26375"), !partitionServices)) || (stryMutAct_9fa48("26377") ? typeof partitionServices.get === 'function' : stryMutAct_9fa48("26376") ? false : (stryCov_9fa48("26376", "26377"), typeof partitionServices.get !== (stryMutAct_9fa48("26378") ? "" : (stryCov_9fa48("26378"), 'function')))))) {
        if (stryMutAct_9fa48("26379")) {
          {}
        } else {
          stryCov_9fa48("26379");
          return stryMutAct_9fa48("26380") ? true : (stryCov_9fa48("26380"), false);
        }
      }

      // Seed bootstrap can write directly through the local leader partition
      // before its addressed service row is published into the cache.
      return stryMutAct_9fa48("26381") ? replicaIds.every(replicaId => isLiveServiceLeader(partitionServices.get(replicaId))) : (stryCov_9fa48("26381"), replicaIds.some(stryMutAct_9fa48("26382") ? () => undefined : (stryCov_9fa48("26382"), replicaId => isLiveServiceLeader(partitionServices.get(replicaId)))));
    }
  }

  /**
   * Repair propagated cache tables from authoritative local
   * partition reads.
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async repairPropagatedCacheTablesFromLocalPartitions(options = {}) {
    if (stryMutAct_9fa48("26383")) {
      {}
    } else {
      stryCov_9fa48("26383");
      const d = this.delegates;
      const logger = d.getLogger();
      const systemTableCache = d.getSystemTableCache();
      const hydrationMessageGroup = assertCritical(d.getLeaderMessageGroupService(), BOOTSTRAP_ERROR.CDC_HYDRATION_MISSING);
      const result = await d.hydrateFromLocalPartitions(systemTableCache, hydrationMessageGroup);
      if (stryMutAct_9fa48("26386") ? result?.success === false && Array.isArray(result?.errors) && result.errors.length > NUM.ZERO : stryMutAct_9fa48("26385") ? false : stryMutAct_9fa48("26384") ? true : (stryCov_9fa48("26384", "26385", "26386"), (stryMutAct_9fa48("26388") ? result?.success !== false : stryMutAct_9fa48("26387") ? false : (stryCov_9fa48("26387", "26388"), (stryMutAct_9fa48("26389") ? result.success : (stryCov_9fa48("26389"), result?.success)) === (stryMutAct_9fa48("26390") ? true : (stryCov_9fa48("26390"), false)))) || (stryMutAct_9fa48("26392") ? Array.isArray(result?.errors) || result.errors.length > NUM.ZERO : stryMutAct_9fa48("26391") ? false : (stryCov_9fa48("26391", "26392"), Array.isArray(stryMutAct_9fa48("26393") ? result.errors : (stryCov_9fa48("26393"), result?.errors)) && (stryMutAct_9fa48("26396") ? result.errors.length <= NUM.ZERO : stryMutAct_9fa48("26395") ? result.errors.length >= NUM.ZERO : stryMutAct_9fa48("26394") ? true : (stryCov_9fa48("26394", "26395", "26396"), result.errors.length > NUM.ZERO)))))) {
        if (stryMutAct_9fa48("26397")) {
          {}
        } else {
          stryCov_9fa48("26397");
          const errorDetails = (stryMutAct_9fa48("26400") ? result?.errors && [] : stryMutAct_9fa48("26399") ? false : stryMutAct_9fa48("26398") ? true : (stryCov_9fa48("26398", "26399", "26400"), (stryMutAct_9fa48("26401") ? result.errors : (stryCov_9fa48("26401"), result?.errors)) || (stryMutAct_9fa48("26402") ? ["Stryker was here"] : (stryCov_9fa48("26402"), [])))).map(stryMutAct_9fa48("26403") ? () => undefined : (stryCov_9fa48("26403"), entry => stryMutAct_9fa48("26404") ? `` : (stryCov_9fa48("26404"), `${entry.tableName}:${entry.error}`))).join(stryMutAct_9fa48("26405") ? "" : (stryCov_9fa48("26405"), ', '));
          throw new Error(stryMutAct_9fa48("26406") ? LOG_REPAIR_ERROR_PREFIX - (errorDetails ? ` (${errorDetails})` : '') : (stryCov_9fa48("26406"), LOG_REPAIR_ERROR_PREFIX + (errorDetails ? stryMutAct_9fa48("26407") ? `` : (stryCov_9fa48("26407"), ` (${errorDetails})`) : stryMutAct_9fa48("26408") ? "Stryker was here!" : (stryCov_9fa48("26408"), ''))));
        }
      }
      logger.warn(LOG_REPAIRED, stryMutAct_9fa48("26409") ? {} : (stryCov_9fa48("26409"), {
        nodeId: d.getNodeId(),
        reason: stryMutAct_9fa48("26412") ? options.reason && null : stryMutAct_9fa48("26411") ? false : stryMutAct_9fa48("26410") ? true : (stryCov_9fa48("26410", "26411", "26412"), options.reason || null),
        targetNodeId: stryMutAct_9fa48("26415") ? options.targetNodeId && null : stryMutAct_9fa48("26414") ? false : stryMutAct_9fa48("26413") ? true : (stryCov_9fa48("26413", "26414", "26415"), options.targetNodeId || null),
        tablesHydrated: Object.keys(stryMutAct_9fa48("26418") ? result?.tables && {} : stryMutAct_9fa48("26417") ? false : stryMutAct_9fa48("26416") ? true : (stryCov_9fa48("26416", "26417", "26418"), (stryMutAct_9fa48("26419") ? result.tables : (stryCov_9fa48("26419"), result?.tables)) || {})).length,
        totalRows: this.countTotalRows(result)
      }));
      return result;
    }
  }

  /**
   * Ensure CDC integration service is initialized for bootstrap.
   * @return {Object}
   */
  ensureBootstrapCdcIntegrationService() {
    if (stryMutAct_9fa48("26420")) {
      {}
    } else {
      stryCov_9fa48("26420");
      return this.runtimeBridgeOwner.ensureBootstrapCdcIntegrationService();
    }
  }

  /**
   * Ensure latency topology owners are initialized.
   * @return {Object}
   */
  ensureLatencyTopologyOwners() {
    if (stryMutAct_9fa48("26421")) {
      {}
    } else {
      stryCov_9fa48("26421");
      return this.runtimeBridgeOwner.ensureLatencyTopologyOwners();
    }
  }

  /**
   * Start latency topology lifecycle owners.
   */
  startLatencyTopologyLifecycle() {
    if (stryMutAct_9fa48("26422")) {
      {}
    } else {
      stryCov_9fa48("26422");
      return this.runtimeBridgeOwner.startLatencyTopologyLifecycle();
    }
  }

  /**
   * Propagate partition CDC via topology-owned propagation path.
   * @param {Object} messageGroupService
   * @param {Object} cdcEvent
   * @return {Promise<Object>}
   */
  async propagatePartitionCDCEvent(messageGroupService, cdcEvent) {
    if (stryMutAct_9fa48("26423")) {
      {}
    } else {
      stryCov_9fa48("26423");
      return this.runtimeBridgeOwner.propagatePartitionCDCEvent(messageGroupService, cdcEvent);
    }
  }

  /**
   * Resolve the message-group service for CDC propagation.
   * @param {Object|null} preferredMessageGroupService
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Promise<Object|null>}
   */
  async resolveCdcPropagationMessageGroup(preferredMessageGroupService, options = {}) {
    if (stryMutAct_9fa48("26424")) {
      {}
    } else {
      stryCov_9fa48("26424");
      const d = this.delegates;
      if (stryMutAct_9fa48("26427") ? typeof d.resolveOperationalMessageGroupSelectionAsync !== 'function' : stryMutAct_9fa48("26426") ? false : stryMutAct_9fa48("26425") ? true : (stryCov_9fa48("26425", "26426", "26427"), typeof d.resolveOperationalMessageGroupSelectionAsync === (stryMutAct_9fa48("26428") ? "" : (stryCov_9fa48("26428"), 'function')))) {
        if (stryMutAct_9fa48("26429")) {
          {}
        } else {
          stryCov_9fa48("26429");
          const selection = await d.resolveOperationalMessageGroupSelectionAsync(stryMutAct_9fa48("26430") ? {} : (stryCov_9fa48("26430"), {
            requiredTables: Array.isArray(options.requiredTables) ? options.requiredTables : stryMutAct_9fa48("26431") ? ["Stryker was here"] : (stryCov_9fa48("26431"), []),
            preferredService: preferredMessageGroupService
          }));
          return stryMutAct_9fa48("26434") ? selection.service && null : stryMutAct_9fa48("26433") ? false : stryMutAct_9fa48("26432") ? true : (stryCov_9fa48("26432", "26433", "26434"), selection.service || null);
        }
      }
      const leaderMgs = d.getLeaderMessageGroupService();
      return stryMutAct_9fa48("26437") ? leaderMgs && null : stryMutAct_9fa48("26436") ? false : stryMutAct_9fa48("26435") ? true : (stryCov_9fa48("26435", "26436", "26437"), leaderMgs || null);
    }
  }

  /**
   * Create the shared CDC pipeline readiness gate.
   * @param {Object} systemTableCache
   * @return {CDCPipelineReadinessGate}
   */
  createCdcPipelineReadinessGate(systemTableCache) {
    if (stryMutAct_9fa48("26438")) {
      {}
    } else {
      stryCov_9fa48("26438");
      return this.runtimeBridgeOwner.createCdcPipelineReadinessGate(systemTableCache);
    }
  }
}
export { SeedCacheHydrationPhase };