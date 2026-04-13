/**
 * Query System State Phase — handles system cache hydration from bootstrap
 * snapshots, node registration, endpoint registration, and CDC pipeline
 * setup during the join process.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
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
import { assertCritical } from '../../utils/assert.js';
import { NodeService } from '../../node/node-service.js';
import { NodeRegistrationOwner } from '../shared/node-registration-owner.js';
import { getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../../control-plane/control-plane-error-classification.js';
import { CACHE_DEFAULT, CACHE_HYDRATION_TABLES } from '../../cache/cache-constants.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../../cache/system-cache-key-descriptor.js';
import { CDC_PIPELINE_READINESS_TIMEOUT_MS } from '../../constants/cdc-lifecycle-constants.js';
import { JOINING_ERROR_MSG, JOINING_LOG_MSG, JOIN_BACKFILL_SCOPE, JOINING_UNIFIED_RECONCILE } from '../node-joining-constants.js';
import { COLUMN, CDC_OPERATION, NUM, TABLES, TYPEOF } from '../../constants/index.js';
import { canonicalizeSystemTableRow } from '../../control-plane/system-row-normalizers.js';
const LOG_CACHE_POPULATED = stryMutAct_9fa48("25631") ? "" : (stryCov_9fa48("25631"), 'System cache populated from bootstrap response');
const LOG_BOOTSTRAP_MISSING_SNAPSHOTS = stryMutAct_9fa48("25632") ? "" : (stryCov_9fa48("25632"), 'Bootstrap response missing systemTableSnapshots');
const LOG_CACHE_HYDRATED = stryMutAct_9fa48("25633") ? "" : (stryCov_9fa48("25633"), 'System cache hydrated from bootstrap response');
const LOG_TOPOLOGY_EPOCH_APPLIED = stryMutAct_9fa48("25634") ? "" : (stryCov_9fa48("25634"), 'Applied bootstrap topology epoch to local cache watermark');
const LOG_SNAPSHOT_MISSING = stryMutAct_9fa48("25635") ? "" : (stryCov_9fa48("25635"), 'Snapshot missing or invalid for table');
const LOG_HYDRATED_TABLE = stryMutAct_9fa48("25636") ? "" : (stryCov_9fa48("25636"), 'Hydrated table from snapshot');
const LOG_SKIPPING_STALE_SNAPSHOT = stryMutAct_9fa48("25637") ? "" : (stryCov_9fa48("25637"), 'Skipping stale snapshot row during cache hydration');
const LOG_BLOCKING_BACKFILL_START = stryMutAct_9fa48("25638") ? "" : (stryCov_9fa48("25638"), 'Starting blocking join backfill for discovery-critical propagated tables');
const LOG_BLOCKING_BACKFILL_COMPLETE = stryMutAct_9fa48("25639") ? "" : (stryCov_9fa48("25639"), 'Completed blocking join backfill for discovery-critical propagated tables');
const LOG_BLOCKING_BACKFILL_FAILED = stryMutAct_9fa48("25640") ? "" : (stryCov_9fa48("25640"), 'Blocking join backfill failed for discovery-critical propagated tables');
const LOG_BLOCKING_BACKFILL_SKIPPED = stryMutAct_9fa48("25641") ? "" : (stryCov_9fa48("25641"), 'Skipping blocking join backfill because bootstrap snapshot already covers discovery-critical propagated tables');
const LOG_OPPORTUNISTIC_BACKFILL_SKIPPED = stryMutAct_9fa48("25642") ? "" : (stryCov_9fa48("25642"), 'Skipping opportunistic join backfill because bootstrap snapshot already covers opportunistic propagated tables');
const LOG_OPPORTUNISTIC_BACKFILL_COMPLETE = stryMutAct_9fa48("25643") ? "" : (stryCov_9fa48("25643"), 'Completed opportunistic join backfill for non-critical propagated tables');
const LOG_OPPORTUNISTIC_BACKFILL_FAILED = stryMutAct_9fa48("25644") ? "" : (stryCov_9fa48("25644"), 'Opportunistic join backfill failed for non-critical propagated tables');
const LOG_NODE_REGISTRATION_RETRY = stryMutAct_9fa48("25645") ? "" : (stryCov_9fa48("25645"), 'Retrying join node registration after retryable admission failure');
const JOIN_NODE_REGISTRATION_MAX_ATTEMPTS = NUM.TWO;
const JOIN_NODE_REGISTRATION_RETRY_DELAY_MS = stryMutAct_9fa48("25646") ? NUM.TWO / NUM.HUNDRED : (stryCov_9fa48("25646"), NUM.TWO * NUM.HUNDRED);
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
    if (stryMutAct_9fa48("25647")) {
      {}
    } else {
      stryCov_9fa48("25647");
      this.nodeId = options.nodeId;
      this.nodeAddress = options.nodeAddress;
      this.advertisedNodeWsAddress = stryMutAct_9fa48("25650") ? options.advertisedNodeWsAddress && null : stryMutAct_9fa48("25649") ? false : stryMutAct_9fa48("25648") ? true : (stryCov_9fa48("25648", "25649", "25650"), options.advertisedNodeWsAddress || null);
      this.delegates = stryMutAct_9fa48("25653") ? options.delegates && {} : stryMutAct_9fa48("25652") ? false : stryMutAct_9fa48("25651") ? true : (stryCov_9fa48("25651", "25652", "25653"), options.delegates || {});
      this.opportunisticBackfillPromise = null;
      this.nodeRegistrationOwner = new NodeRegistrationOwner(stryMutAct_9fa48("25654") ? {} : (stryCov_9fa48("25654"), {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        advertisedNodeWsAddress: this.advertisedNodeWsAddress,
        delegates: stryMutAct_9fa48("25655") ? {} : (stryCov_9fa48("25655"), {
          getLogger: stryMutAct_9fa48("25656") ? () => undefined : (stryCov_9fa48("25656"), () => this.delegates.getLogger()),
          getConfig: stryMutAct_9fa48("25657") ? () => undefined : (stryCov_9fa48("25657"), () => stryMutAct_9fa48("25660") ? this.delegates.getConfig?.() && {} : stryMutAct_9fa48("25659") ? false : stryMutAct_9fa48("25658") ? true : (stryCov_9fa48("25658", "25659", "25660"), (stryMutAct_9fa48("25661") ? this.delegates.getConfig() : (stryCov_9fa48("25661"), this.delegates.getConfig?.())) || {})),
          getNow: stryMutAct_9fa48("25662") ? () => undefined : (stryCov_9fa48("25662"), () => this.delegates.getNow()),
          getSleep: stryMutAct_9fa48("25663") ? () => undefined : (stryCov_9fa48("25663"), () => stryMutAct_9fa48("25664") ? this.delegates.getSleep() : (stryCov_9fa48("25664"), this.delegates.getSleep?.())),
          getWsPort: stryMutAct_9fa48("25665") ? () => undefined : (stryCov_9fa48("25665"), () => stryMutAct_9fa48("25666") ? this.delegates.getWsPort() : (stryCov_9fa48("25666"), this.delegates.getWsPort?.())),
          getSeedNodeId: stryMutAct_9fa48("25667") ? () => undefined : (stryCov_9fa48("25667"), () => stryMutAct_9fa48("25670") ? this.delegates.getSeedNodeId?.() && null : stryMutAct_9fa48("25669") ? false : stryMutAct_9fa48("25668") ? true : (stryCov_9fa48("25668", "25669", "25670"), (stryMutAct_9fa48("25671") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("25671"), this.delegates.getSeedNodeId?.())) || null)),
          getMessageRouter: stryMutAct_9fa48("25672") ? () => undefined : (stryCov_9fa48("25672"), () => stryMutAct_9fa48("25675") ? this.delegates.getMessageRouter?.() && null : stryMutAct_9fa48("25674") ? false : stryMutAct_9fa48("25673") ? true : (stryCov_9fa48("25673", "25674", "25675"), (stryMutAct_9fa48("25676") ? this.delegates.getMessageRouter() : (stryCov_9fa48("25676"), this.delegates.getMessageRouter?.())) || null)),
          getCdcIntegrationService: stryMutAct_9fa48("25677") ? () => undefined : (stryCov_9fa48("25677"), () => this.delegates.getCdcIntegrationService()),
          getCdcSubscriptionsActive: stryMutAct_9fa48("25678") ? () => undefined : (stryCov_9fa48("25678"), () => this.delegates.getCdcSubscriptionsActive()),
          getNodeStorageBudgetService: stryMutAct_9fa48("25679") ? () => undefined : (stryCov_9fa48("25679"), () => this.delegates.getNodeStorageBudgetService()),
          getSystemTableCache: stryMutAct_9fa48("25680") ? () => undefined : (stryCov_9fa48("25680"), () => stryMutAct_9fa48("25683") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("25682") ? false : stryMutAct_9fa48("25681") ? true : (stryCov_9fa48("25681", "25682", "25683"), (stryMutAct_9fa48("25684") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("25684"), this.delegates.getSystemTableCache?.())) || null)),
          getJoinLifecycleIntentType: stryMutAct_9fa48("25685") ? () => undefined : (stryCov_9fa48("25685"), () => stryMutAct_9fa48("25688") ? this.delegates.getJoinLifecycleIntentType?.() && null : stryMutAct_9fa48("25687") ? false : stryMutAct_9fa48("25686") ? true : (stryCov_9fa48("25686", "25687", "25688"), (stryMutAct_9fa48("25689") ? this.delegates.getJoinLifecycleIntentType() : (stryCov_9fa48("25689"), this.delegates.getJoinLifecycleIntentType?.())) || null)),
          getJoinStartupMode: stryMutAct_9fa48("25690") ? () => undefined : (stryCov_9fa48("25690"), () => stryMutAct_9fa48("25693") ? this.delegates.getJoinStartupMode?.() && null : stryMutAct_9fa48("25692") ? false : stryMutAct_9fa48("25691") ? true : (stryCov_9fa48("25691", "25692", "25693"), (stryMutAct_9fa48("25694") ? this.delegates.getJoinStartupMode() : (stryCov_9fa48("25694"), this.delegates.getJoinStartupMode?.())) || null)),
          getNodeCapabilities: stryMutAct_9fa48("25695") ? () => undefined : (stryCov_9fa48("25695"), () => this.delegates.getNodeCapabilities())
        })
      }));
    }
  }

  /**
   * Phase 5: Query system partitions for cluster state and register
   * this node.
   * @return {Promise<void>}
   */
  async phaseQuerySystemState() {
    if (stryMutAct_9fa48("25696")) {
      {}
    } else {
      stryCov_9fa48("25696");
      const logger = this.delegates.getLogger();
      logger.debug(JOINING_LOG_MSG.STATE_QUERY_START, stryMutAct_9fa48("25697") ? {} : (stryCov_9fa48("25697"), {
        nodeId: this.nodeId
      }));

      // Initialize node service
      const nodeService = NodeService.getInstance();
      if (stryMutAct_9fa48("25700") ? false : stryMutAct_9fa48("25699") ? true : stryMutAct_9fa48("25698") ? nodeService.isInitialized() : (stryCov_9fa48("25698", "25699", "25700"), !nodeService.isInitialized())) {
        if (stryMutAct_9fa48("25701")) {
          {}
        } else {
          stryCov_9fa48("25701");
          nodeService.initialize(stryMutAct_9fa48("25702") ? {} : (stryCov_9fa48("25702"), {
            nodeId: this.nodeId,
            nodeAddress: this.nodeAddress,
            lifecycleStateMachine: this.delegates.getLifecycleStateMachine(),
            autoTransitionLifecycle: stryMutAct_9fa48("25703") ? true : (stryCov_9fa48("25703"), false)
          }));
        }
      }
      const systemTableCache = assertCritical(nodeService.getSystemTableCache(), JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED);
      const queryEngine = assertCritical(stryMutAct_9fa48("25704") ? this.delegates.getCdcIntegrationService().sqlQueryEngine : (stryCov_9fa48("25704"), this.delegates.getCdcIntegrationService()?.sqlQueryEngine), JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED);
      assertCritical(this.delegates.getMessageRouter(), JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
      this.delegates.ensureLatencyTopologyOwners();
      try {
        if (stryMutAct_9fa48("25705")) {
          {}
        } else {
          stryCov_9fa48("25705");
          // Hydrate system cache from bootstrap response snapshots
          if (stryMutAct_9fa48("25708") ? false : stryMutAct_9fa48("25707") ? true : stryMutAct_9fa48("25706") ? this.delegates.getSystemCacheHydrated() : (stryCov_9fa48("25706", "25707", "25708"), !this.delegates.getSystemCacheHydrated())) {
            if (stryMutAct_9fa48("25709")) {
              {}
            } else {
              stryCov_9fa48("25709");
              logger.info(JOINING_LOG_MSG.STATE_QUERY_HYDRATING_CACHE, stryMutAct_9fa48("25710") ? {} : (stryCov_9fa48("25710"), {
                nodeId: this.nodeId
              }));
              await this.hydrateSystemCacheFromBootstrap();
              this.delegates.setSystemCacheHydrated(stryMutAct_9fa48("25711") ? false : (stryCov_9fa48("25711"), true));
            }
          }

          // Log cache population status
          const systemTables = stryMutAct_9fa48("25712") ? [] : (stryCov_9fa48("25712"), [TABLES.NODES, TABLES.PARTITIONS, TABLES.TABLES, TABLES.SERVICES, TABLES.REPLICA_OPERATIONS, TABLES.MESSAGE_GROUPS]);
          let totalCachedRecords = NUM.ZERO;
          for (const tableName of systemTables) {
            if (stryMutAct_9fa48("25713")) {
              {}
            } else {
              stryCov_9fa48("25713");
              const records = stryMutAct_9fa48("25716") ? systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("25715") ? false : stryMutAct_9fa48("25714") ? true : (stryCov_9fa48("25714", "25715", "25716"), systemTableCache.getAll(tableName) || (stryMutAct_9fa48("25717") ? ["Stryker was here"] : (stryCov_9fa48("25717"), [])));
              stryMutAct_9fa48("25718") ? totalCachedRecords -= records.length : (stryCov_9fa48("25718"), totalCachedRecords += records.length);
            }
          }
          logger.info(LOG_CACHE_POPULATED, stryMutAct_9fa48("25719") ? {} : (stryCov_9fa48("25719"), {
            nodeId: this.nodeId,
            totalRecords: totalCachedRecords
          }));

          // Set up query engine with system cache and message router
          queryEngine.setSystemCache(systemTableCache);
          queryEngine.setMessageRouter(this.delegates.getMessageRouter());
          logger.info(JOINING_LOG_MSG.STATE_QUERY_HYDRATION_COMPLETE, stryMutAct_9fa48("25720") ? {} : (stryCov_9fa48("25720"), {
            nodeId: this.nodeId,
            totalRecords: totalCachedRecords
          }));
          this.delegates.ensureTablePolicyService(systemTableCache);
          await (stryMutAct_9fa48("25721") ? this.delegates.restoreDurableRejoinLocalPartitionServices(systemTableCache) : (stryCov_9fa48("25721"), this.delegates.restoreDurableRejoinLocalPartitionServices?.(systemTableCache)));
          this.delegates.applySystemCacheToPartitions(systemTableCache);
          await this.delegates.waitForSystemServiceLeaders(systemTableCache);

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
          const cdcReadinessGate = this.delegates.createCdcPipelineReadinessGate(systemTableCache);
          const cdcReadinessTimeoutMs = stryMutAct_9fa48("25724") ? this.delegates.getConfig().cdcPipelineReadinessTimeoutMs && CDC_PIPELINE_READINESS_TIMEOUT_MS : stryMutAct_9fa48("25723") ? false : stryMutAct_9fa48("25722") ? true : (stryCov_9fa48("25722", "25723", "25724"), this.delegates.getConfig().cdcPipelineReadinessTimeoutMs || CDC_PIPELINE_READINESS_TIMEOUT_MS);
          await cdcReadinessGate.waitForReady(stryMutAct_9fa48("25725") ? {} : (stryCov_9fa48("25725"), {
            partitionServices: this.delegates.getPartitionServices(),
            messageGroupServices: this.delegates.getMessageGroupServices(),
            cdcSubscriptionsActive: stryMutAct_9fa48("25728") ? this.delegates.getCdcSubscriptionsActive() !== true : stryMutAct_9fa48("25727") ? false : stryMutAct_9fa48("25726") ? true : (stryCov_9fa48("25726", "25727", "25728"), this.delegates.getCdcSubscriptionsActive() === (stryMutAct_9fa48("25729") ? false : (stryCov_9fa48("25729"), true))),
            requirePropagationLeader: stryMutAct_9fa48("25730") ? true : (stryCov_9fa48("25730"), false)
          }), cdcReadinessTimeoutMs);
          await this.backfillBlockingDiscoveryTables();

          // Hand hydrated desired/actual state to unified reconciler.
          await this.delegates.triggerJoinReconciler(JOINING_UNIFIED_RECONCILE.HYDRATION_REASON);
          this.delegates.stopJoiningLifecycleOwners();
        }
      } catch (error) {
        if (stryMutAct_9fa48("25731")) {
          {}
        } else {
          stryCov_9fa48("25731");
          const errorContext = stryMutAct_9fa48("25732") ? {} : (stryCov_9fa48("25732"), {
            nodeId: this.nodeId,
            error: error.message
          });
          if (stryMutAct_9fa48("25735") ? error.missingLeaders : stryMutAct_9fa48("25734") ? false : stryMutAct_9fa48("25733") ? true : (stryCov_9fa48("25733", "25734", "25735"), error?.missingLeaders)) {
            if (stryMutAct_9fa48("25736")) {
              {}
            } else {
              stryCov_9fa48("25736");
              errorContext.missingLeaders = error.missingLeaders;
              errorContext.missingCount = error.missingCount;
              errorContext.timeoutMs = error.timeoutMs;
            }
          }
          logger.error(JOINING_LOG_MSG.STATE_QUERY_HYDRATION_FAILED, errorContext);
          throw error;
        }
      }
      logger.info(JOINING_LOG_MSG.STATE_QUERY_COMPLETE, stryMutAct_9fa48("25737") ? {} : (stryCov_9fa48("25737"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Backfill discovery-critical propagated tables as part of the blocking
   * join path.
   * @return {Promise<void>}
   * @private
   */
  async backfillBlockingDiscoveryTables() {
    if (stryMutAct_9fa48("25738")) {
      {}
    } else {
      stryCov_9fa48("25738");
      const logger = this.delegates.getLogger();
      const {
        tables,
        missingTables
      } = this.resolveSnapshotBackfillPlan(JOIN_BACKFILL_SCOPE.BLOCKING_TABLES);
      if (stryMutAct_9fa48("25741") ? tables.length !== NUM.ZERO : stryMutAct_9fa48("25740") ? false : stryMutAct_9fa48("25739") ? true : (stryCov_9fa48("25739", "25740", "25741"), tables.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("25742")) {
          {}
        } else {
          stryCov_9fa48("25742");
          logger.info(LOG_BLOCKING_BACKFILL_SKIPPED, stryMutAct_9fa48("25743") ? {} : (stryCov_9fa48("25743"), {
            nodeId: this.nodeId,
            tableCount: JOIN_BACKFILL_SCOPE.BLOCKING_TABLES.length,
            tableNames: JOIN_BACKFILL_SCOPE.BLOCKING_TABLES
          }));
          return;
        }
      }
      logger.info(LOG_BLOCKING_BACKFILL_START, stryMutAct_9fa48("25744") ? {} : (stryCov_9fa48("25744"), {
        nodeId: this.nodeId,
        tableCount: tables.length,
        tableNames: tables,
        missingBootstrapSnapshotTables: missingTables
      }));
      try {
        if (stryMutAct_9fa48("25745")) {
          {}
        } else {
          stryCov_9fa48("25745");
          await this.delegates.backfillPropagatedCacheTablesFromAuthoritativeState(tables);
          logger.info(LOG_BLOCKING_BACKFILL_COMPLETE, stryMutAct_9fa48("25746") ? {} : (stryCov_9fa48("25746"), {
            nodeId: this.nodeId,
            tableCount: tables.length,
            tableNames: tables
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("25747")) {
          {}
        } else {
          stryCov_9fa48("25747");
          logger.error(LOG_BLOCKING_BACKFILL_FAILED, stryMutAct_9fa48("25748") ? {} : (stryCov_9fa48("25748"), {
            nodeId: this.nodeId,
            tableCount: tables.length,
            tableNames: tables,
            error: error.message
          }));
          throw error;
        }
      }
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
  resolveSnapshotBackfillPlan(tableNames = stryMutAct_9fa48("25749") ? ["Stryker was here"] : (stryCov_9fa48("25749"), [])) {
    if (stryMutAct_9fa48("25750")) {
      {}
    } else {
      stryCov_9fa48("25750");
      const bootstrapResponse = (stryMutAct_9fa48("25753") ? typeof this.delegates.getBootstrapResponse !== TYPEOF.FUNCTION : stryMutAct_9fa48("25752") ? false : stryMutAct_9fa48("25751") ? true : (stryCov_9fa48("25751", "25752", "25753"), typeof this.delegates.getBootstrapResponse === TYPEOF.FUNCTION)) ? this.delegates.getBootstrapResponse() : null;
      const snapshots = stryMutAct_9fa48("25754") ? bootstrapResponse.systemTableSnapshots : (stryCov_9fa48("25754"), bootstrapResponse?.systemTableSnapshots);
      const hydrationTables = Array.isArray(stryMutAct_9fa48("25756") ? bootstrapResponse.topologySnapshotMeta?.hydrationTables : stryMutAct_9fa48("25755") ? bootstrapResponse?.topologySnapshotMeta.hydrationTables : (stryCov_9fa48("25755", "25756"), bootstrapResponse?.topologySnapshotMeta?.hydrationTables)) ? new Set(stryMutAct_9fa48("25757") ? bootstrapResponse.topologySnapshotMeta.hydrationTables : (stryCov_9fa48("25757"), bootstrapResponse.topologySnapshotMeta.hydrationTables.filter(stryMutAct_9fa48("25758") ? () => undefined : (stryCov_9fa48("25758"), value => stryMutAct_9fa48("25761") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("25760") ? false : stryMutAct_9fa48("25759") ? true : (stryCov_9fa48("25759", "25760", "25761"), (stryMutAct_9fa48("25763") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("25762") ? true : (stryCov_9fa48("25762", "25763"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("25766") ? value.length <= NUM.ZERO : stryMutAct_9fa48("25765") ? value.length >= NUM.ZERO : stryMutAct_9fa48("25764") ? true : (stryCov_9fa48("25764", "25765", "25766"), value.length > NUM.ZERO))))))) : null;
      const missingTables = stryMutAct_9fa48("25767") ? ["Stryker was here"] : (stryCov_9fa48("25767"), []);
      for (const tableName of tableNames) {
        if (stryMutAct_9fa48("25768")) {
          {}
        } else {
          stryCov_9fa48("25768");
          const hasSnapshotRows = Array.isArray(stryMutAct_9fa48("25769") ? snapshots[tableName] : (stryCov_9fa48("25769"), snapshots?.[tableName]));
          const declaredHydrated = stryMutAct_9fa48("25772") ? !hydrationTables && hydrationTables.has(tableName) : stryMutAct_9fa48("25771") ? false : stryMutAct_9fa48("25770") ? true : (stryCov_9fa48("25770", "25771", "25772"), (stryMutAct_9fa48("25773") ? hydrationTables : (stryCov_9fa48("25773"), !hydrationTables)) || hydrationTables.has(tableName));
          if (stryMutAct_9fa48("25776") ? !hasSnapshotRows && !declaredHydrated : stryMutAct_9fa48("25775") ? false : stryMutAct_9fa48("25774") ? true : (stryCov_9fa48("25774", "25775", "25776"), (stryMutAct_9fa48("25777") ? hasSnapshotRows : (stryCov_9fa48("25777"), !hasSnapshotRows)) || (stryMutAct_9fa48("25778") ? declaredHydrated : (stryCov_9fa48("25778"), !declaredHydrated)))) {
            if (stryMutAct_9fa48("25779")) {
              {}
            } else {
              stryCov_9fa48("25779");
              missingTables.push(tableName);
            }
          }
        }
      }
      return stryMutAct_9fa48("25780") ? {} : (stryCov_9fa48("25780"), {
        tables: missingTables,
        missingTables
      });
    }
  }

  /**
   * Start best-effort backfill for non-critical propagated tables.
   * Failures are logged but do not abort the join-critical path.
   * @return {Promise<void>|null}
   * @private
   */
  startJoinOpportunisticBackfill() {
    if (stryMutAct_9fa48("25781")) {
      {}
    } else {
      stryCov_9fa48("25781");
      if (stryMutAct_9fa48("25783") ? false : stryMutAct_9fa48("25782") ? true : (stryCov_9fa48("25782", "25783"), this.opportunisticBackfillPromise)) {
        if (stryMutAct_9fa48("25784")) {
          {}
        } else {
          stryCov_9fa48("25784");
          return this.opportunisticBackfillPromise;
        }
      }
      const {
        tables,
        missingTables
      } = this.resolveSnapshotBackfillPlan(JOIN_BACKFILL_SCOPE.OPPORTUNISTIC_TABLES);
      if (stryMutAct_9fa48("25787") ? !Array.isArray(tables) && tables.length === NUM.ZERO : stryMutAct_9fa48("25786") ? false : stryMutAct_9fa48("25785") ? true : (stryCov_9fa48("25785", "25786", "25787"), (stryMutAct_9fa48("25788") ? Array.isArray(tables) : (stryCov_9fa48("25788"), !Array.isArray(tables))) || (stryMutAct_9fa48("25790") ? tables.length !== NUM.ZERO : stryMutAct_9fa48("25789") ? false : (stryCov_9fa48("25789", "25790"), tables.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("25791")) {
          {}
        } else {
          stryCov_9fa48("25791");
          this.delegates.getLogger().info(LOG_OPPORTUNISTIC_BACKFILL_SKIPPED, stryMutAct_9fa48("25792") ? {} : (stryCov_9fa48("25792"), {
            nodeId: this.nodeId,
            tableCount: JOIN_BACKFILL_SCOPE.OPPORTUNISTIC_TABLES.length,
            tableNames: JOIN_BACKFILL_SCOPE.OPPORTUNISTIC_TABLES
          }));
          return Promise.resolve();
        }
      }
      const logger = this.delegates.getLogger();
      const promise = Promise.resolve(this.delegates.backfillPropagatedCacheTablesFromAuthoritativeState(tables)).then(() => {
        if (stryMutAct_9fa48("25793")) {
          {}
        } else {
          stryCov_9fa48("25793");
          logger.info(LOG_OPPORTUNISTIC_BACKFILL_COMPLETE, stryMutAct_9fa48("25794") ? {} : (stryCov_9fa48("25794"), {
            nodeId: this.nodeId,
            tableCount: tables.length,
            tableNames: tables,
            missingBootstrapSnapshotTables: missingTables
          }));
        }
      }).catch(error => {
        if (stryMutAct_9fa48("25795")) {
          {}
        } else {
          stryCov_9fa48("25795");
          logger.warn(LOG_OPPORTUNISTIC_BACKFILL_FAILED, stryMutAct_9fa48("25796") ? {} : (stryCov_9fa48("25796"), {
            nodeId: this.nodeId,
            tableCount: tables.length,
            tableNames: tables,
            missingBootstrapSnapshotTables: missingTables,
            error: error.message
          }));
        }
      }).finally(() => {
        if (stryMutAct_9fa48("25797")) {
          {}
        } else {
          stryCov_9fa48("25797");
          if (stryMutAct_9fa48("25800") ? this.opportunisticBackfillPromise !== promise : stryMutAct_9fa48("25799") ? false : stryMutAct_9fa48("25798") ? true : (stryCov_9fa48("25798", "25799", "25800"), this.opportunisticBackfillPromise === promise)) {
            if (stryMutAct_9fa48("25801")) {
              {}
            } else {
              stryCov_9fa48("25801");
              this.opportunisticBackfillPromise = null;
            }
          }
        }
      });
      this.opportunisticBackfillPromise = promise;
      return promise;
    }
  }

  /**
   * Hydrate the local system cache from bootstrap response snapshots.
   * @return {Promise<void>}
   */
  async hydrateSystemCacheFromBootstrap() {
    if (stryMutAct_9fa48("25802")) {
      {}
    } else {
      stryCov_9fa48("25802");
      const logger = this.delegates.getLogger();
      const bootstrapResponse = this.delegates.getBootstrapResponse();
      const snapshots = stryMutAct_9fa48("25803") ? bootstrapResponse.systemTableSnapshots : (stryCov_9fa48("25803"), bootstrapResponse?.systemTableSnapshots);
      if (stryMutAct_9fa48("25806") ? false : stryMutAct_9fa48("25805") ? true : stryMutAct_9fa48("25804") ? snapshots : (stryCov_9fa48("25804", "25805", "25806"), !snapshots)) {
        if (stryMutAct_9fa48("25807")) {
          {}
        } else {
          stryCov_9fa48("25807");
          logger.warn(LOG_BOOTSTRAP_MISSING_SNAPSHOTS, stryMutAct_9fa48("25808") ? {} : (stryCov_9fa48("25808"), {
            nodeId: this.nodeId,
            hasBootstrapResponse: stryMutAct_9fa48("25809") ? !bootstrapResponse : (stryCov_9fa48("25809"), !(stryMutAct_9fa48("25810") ? bootstrapResponse : (stryCov_9fa48("25810"), !bootstrapResponse)))
          }));
          return;
        }
      }

      // Initialize node service to get system table cache
      const nodeService = NodeService.getInstance();
      if (stryMutAct_9fa48("25813") ? false : stryMutAct_9fa48("25812") ? true : stryMutAct_9fa48("25811") ? nodeService.isInitialized() : (stryCov_9fa48("25811", "25812", "25813"), !nodeService.isInitialized())) {
        if (stryMutAct_9fa48("25814")) {
          {}
        } else {
          stryCov_9fa48("25814");
          nodeService.initialize(stryMutAct_9fa48("25815") ? {} : (stryCov_9fa48("25815"), {
            nodeId: this.nodeId,
            nodeAddress: this.nodeAddress,
            lifecycleStateMachine: this.delegates.getLifecycleStateMachine(),
            autoTransitionLifecycle: stryMutAct_9fa48("25816") ? true : (stryCov_9fa48("25816"), false)
          }));
        }
      }
      const systemTableCache = assertCritical(nodeService.getSystemTableCache(), JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED);

      // Hydrate each system table from snapshots
      const systemTables = CACHE_HYDRATION_TABLES;
      let totalRecords = NUM.ZERO;
      for (const tableName of systemTables) {
        if (stryMutAct_9fa48("25817")) {
          {}
        } else {
          stryCov_9fa48("25817");
          const records = snapshots[tableName];
          if (stryMutAct_9fa48("25820") ? false : stryMutAct_9fa48("25819") ? true : stryMutAct_9fa48("25818") ? Array.isArray(records) : (stryCov_9fa48("25818", "25819", "25820"), !Array.isArray(records))) {
            if (stryMutAct_9fa48("25821")) {
              {}
            } else {
              stryCov_9fa48("25821");
              logger.debug(LOG_SNAPSHOT_MISSING, stryMutAct_9fa48("25822") ? {} : (stryCov_9fa48("25822"), {
                tableName,
                nodeId: this.nodeId
              }));
              continue;
            }
          }
          for (const record of records) {
            if (stryMutAct_9fa48("25823")) {
              {}
            } else {
              stryCov_9fa48("25823");
              const canonicalRecord = canonicalizeSystemTableRow(tableName, record);
              const operation = this.getSnapshotHydrationOperation(systemTableCache, tableName, canonicalRecord);
              if (stryMutAct_9fa48("25826") ? false : stryMutAct_9fa48("25825") ? true : stryMutAct_9fa48("25824") ? operation : (stryCov_9fa48("25824", "25825", "25826"), !operation)) {
                if (stryMutAct_9fa48("25827")) {
                  {}
                } else {
                  stryCov_9fa48("25827");
                  continue;
                }
              }
              // Bootstrap hydration exception: joining nodes must hydrate
              // local cache from bootstrap snapshots before CDC
              // subscriptions are active.
              // See architecture.md: Sanctioned direct
              // applySystemTableChange call sites.
              systemTableCache.applySystemTableChange(tableName, operation, canonicalRecord);
              stryMutAct_9fa48("25828") ? totalRecords-- : (stryCov_9fa48("25828"), totalRecords++);
            }
          }
          logger.debug(LOG_HYDRATED_TABLE, stryMutAct_9fa48("25829") ? {} : (stryCov_9fa48("25829"), {
            tableName,
            recordCount: records.length,
            nodeId: this.nodeId
          }));
        }
      }
      this.applyBootstrapTopologyEpoch(systemTableCache, bootstrapResponse);
      this.recordBootstrapTopologySnapshotMetadata(bootstrapResponse);
      logger.info(LOG_CACHE_HYDRATED, stryMutAct_9fa48("25830") ? {} : (stryCov_9fa48("25830"), {
        nodeId: this.nodeId,
        totalRecords,
        tablesHydrated: stryMutAct_9fa48("25831") ? systemTables.length : (stryCov_9fa48("25831"), systemTables.filter(stryMutAct_9fa48("25832") ? () => undefined : (stryCov_9fa48("25832"), t => stryMutAct_9fa48("25835") ? Array.isArray(snapshots[t]) || snapshots[t].length > NUM.ZERO : stryMutAct_9fa48("25834") ? false : stryMutAct_9fa48("25833") ? true : (stryCov_9fa48("25833", "25834", "25835"), Array.isArray(snapshots[t]) && (stryMutAct_9fa48("25838") ? snapshots[t].length <= NUM.ZERO : stryMutAct_9fa48("25837") ? snapshots[t].length >= NUM.ZERO : stryMutAct_9fa48("25836") ? true : (stryCov_9fa48("25836", "25837", "25838"), snapshots[t].length > NUM.ZERO))))).length)
      }));
    }
  }

  /**
   * Apply the published bootstrap topology epoch to the local cache watermark.
   * @param {Object} systemTableCache
   * @param {Object|null} bootstrapResponse
   * @return {void}
   * @private
   */
  applyBootstrapTopologyEpoch(systemTableCache, bootstrapResponse) {
    if (stryMutAct_9fa48("25839")) {
      {}
    } else {
      stryCov_9fa48("25839");
      if (stryMutAct_9fa48("25842") ? !systemTableCache && typeof systemTableCache.updateFromEpoch !== TYPEOF.FUNCTION : stryMutAct_9fa48("25841") ? false : stryMutAct_9fa48("25840") ? true : (stryCov_9fa48("25840", "25841", "25842"), (stryMutAct_9fa48("25843") ? systemTableCache : (stryCov_9fa48("25843"), !systemTableCache)) || (stryMutAct_9fa48("25845") ? typeof systemTableCache.updateFromEpoch === TYPEOF.FUNCTION : stryMutAct_9fa48("25844") ? false : (stryCov_9fa48("25844", "25845"), typeof systemTableCache.updateFromEpoch !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("25846")) {
          {}
        } else {
          stryCov_9fa48("25846");
          return;
        }
      }
      const currentEpoch = stryMutAct_9fa48("25847") ? bootstrapResponse.currentEpoch : (stryCov_9fa48("25847"), bootstrapResponse?.currentEpoch);
      if (stryMutAct_9fa48("25850") ? !currentEpoch && typeof currentEpoch !== TYPEOF.OBJECT : stryMutAct_9fa48("25849") ? false : stryMutAct_9fa48("25848") ? true : (stryCov_9fa48("25848", "25849", "25850"), (stryMutAct_9fa48("25851") ? currentEpoch : (stryCov_9fa48("25851"), !currentEpoch)) || (stryMutAct_9fa48("25853") ? typeof currentEpoch === TYPEOF.OBJECT : stryMutAct_9fa48("25852") ? false : (stryCov_9fa48("25852", "25853"), typeof currentEpoch !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("25854")) {
          {}
        } else {
          stryCov_9fa48("25854");
          return;
        }
      }
      const logger = this.delegates.getLogger();
      systemTableCache.updateFromEpoch(currentEpoch);
      logger.info(LOG_TOPOLOGY_EPOCH_APPLIED, stryMutAct_9fa48("25855") ? {} : (stryCov_9fa48("25855"), {
        nodeId: this.nodeId,
        topologyEpoch: currentEpoch.epoch
      }));
    }
  }

  /**
   * Retain owner-published bootstrap topology metadata for readiness.
   * @param {Object|null} bootstrapResponse
   * @return {void}
   * @private
   */
  recordBootstrapTopologySnapshotMetadata(bootstrapResponse) {
    if (stryMutAct_9fa48("25856")) {
      {}
    } else {
      stryCov_9fa48("25856");
      if (stryMutAct_9fa48("25859") ? typeof this.delegates.setBootstrapTopologySnapshotMeta !== TYPEOF.FUNCTION : stryMutAct_9fa48("25858") ? false : stryMutAct_9fa48("25857") ? true : (stryCov_9fa48("25857", "25858", "25859"), typeof this.delegates.setBootstrapTopologySnapshotMeta === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("25860")) {
          {}
        } else {
          stryCov_9fa48("25860");
          this.delegates.setBootstrapTopologySnapshotMeta(stryMutAct_9fa48("25863") ? bootstrapResponse?.topologySnapshotMeta && null : stryMutAct_9fa48("25862") ? false : stryMutAct_9fa48("25861") ? true : (stryCov_9fa48("25861", "25862", "25863"), (stryMutAct_9fa48("25864") ? bootstrapResponse.topologySnapshotMeta : (stryCov_9fa48("25864"), bootstrapResponse?.topologySnapshotMeta)) || null));
        }
      }
      if (stryMutAct_9fa48("25867") ? typeof this.delegates.setBootstrapTopologySnapshotHydratedAtMs !== TYPEOF.FUNCTION : stryMutAct_9fa48("25866") ? false : stryMutAct_9fa48("25865") ? true : (stryCov_9fa48("25865", "25866", "25867"), typeof this.delegates.setBootstrapTopologySnapshotHydratedAtMs === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("25868")) {
          {}
        } else {
          stryCov_9fa48("25868");
          const now = (stryMutAct_9fa48("25871") ? typeof this.delegates.getNow !== TYPEOF.FUNCTION : stryMutAct_9fa48("25870") ? false : stryMutAct_9fa48("25869") ? true : (stryCov_9fa48("25869", "25870", "25871"), typeof this.delegates.getNow === TYPEOF.FUNCTION)) ? this.delegates.getNow() : Date.now;
          this.delegates.setBootstrapTopologySnapshotHydratedAtMs((stryMutAct_9fa48("25874") ? typeof now !== TYPEOF.FUNCTION : stryMutAct_9fa48("25873") ? false : stryMutAct_9fa48("25872") ? true : (stryCov_9fa48("25872", "25873", "25874"), typeof now === TYPEOF.FUNCTION)) ? now() : Date.now());
        }
      }
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
  getSnapshotHydrationOperation(systemTableCache, tableName, record) {
    if (stryMutAct_9fa48("25875")) {
      {}
    } else {
      stryCov_9fa48("25875");
      const logger = this.delegates.getLogger();
      const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName, CACHE_DEFAULT.PRIMARY_KEY_FALLBACK);
      const key = stryMutAct_9fa48("25876") ? record?.[pkField] && record?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK] : (stryCov_9fa48("25876"), (stryMutAct_9fa48("25877") ? record[pkField] : (stryCov_9fa48("25877"), record?.[pkField])) ?? (stryMutAct_9fa48("25878") ? record[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK] : (stryCov_9fa48("25878"), record?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK])));

      // Let cache validation handle malformed rows with no key.
      if (stryMutAct_9fa48("25881") ? typeof key === TYPEOF.UNDEFINED && key === null : stryMutAct_9fa48("25880") ? false : stryMutAct_9fa48("25879") ? true : (stryCov_9fa48("25879", "25880", "25881"), (stryMutAct_9fa48("25883") ? typeof key !== TYPEOF.UNDEFINED : stryMutAct_9fa48("25882") ? false : (stryCov_9fa48("25882", "25883"), typeof key === TYPEOF.UNDEFINED)) || (stryMutAct_9fa48("25885") ? key !== null : stryMutAct_9fa48("25884") ? false : (stryCov_9fa48("25884", "25885"), key === null)))) {
        if (stryMutAct_9fa48("25886")) {
          {}
        } else {
          stryCov_9fa48("25886");
          return CDC_OPERATION.INSERT;
        }
      }
      if (stryMutAct_9fa48("25889") ? false : stryMutAct_9fa48("25888") ? true : stryMutAct_9fa48("25887") ? systemTableCache.has(tableName, key) : (stryCov_9fa48("25887", "25888", "25889"), !systemTableCache.has(tableName, key))) {
        if (stryMutAct_9fa48("25890")) {
          {}
        } else {
          stryCov_9fa48("25890");
          return CDC_OPERATION.INSERT;
        }
      }
      const existing = systemTableCache.get(tableName, key);
      const existingUpdatedAt = Number(stryMutAct_9fa48("25891") ? existing[COLUMN.UPDATED_AT] : (stryCov_9fa48("25891"), existing?.[COLUMN.UPDATED_AT]));
      const incomingUpdatedAt = Number(stryMutAct_9fa48("25892") ? record[COLUMN.UPDATED_AT] : (stryCov_9fa48("25892"), record?.[COLUMN.UPDATED_AT]));
      const hasExistingUpdatedAt = stryMutAct_9fa48("25895") ? Number.isFinite(existingUpdatedAt) || existingUpdatedAt > NUM.ZERO : stryMutAct_9fa48("25894") ? false : stryMutAct_9fa48("25893") ? true : (stryCov_9fa48("25893", "25894", "25895"), Number.isFinite(existingUpdatedAt) && (stryMutAct_9fa48("25898") ? existingUpdatedAt <= NUM.ZERO : stryMutAct_9fa48("25897") ? existingUpdatedAt >= NUM.ZERO : stryMutAct_9fa48("25896") ? true : (stryCov_9fa48("25896", "25897", "25898"), existingUpdatedAt > NUM.ZERO)));
      const hasIncomingUpdatedAt = stryMutAct_9fa48("25901") ? Number.isFinite(incomingUpdatedAt) || incomingUpdatedAt > NUM.ZERO : stryMutAct_9fa48("25900") ? false : stryMutAct_9fa48("25899") ? true : (stryCov_9fa48("25899", "25900", "25901"), Number.isFinite(incomingUpdatedAt) && (stryMutAct_9fa48("25904") ? incomingUpdatedAt <= NUM.ZERO : stryMutAct_9fa48("25903") ? incomingUpdatedAt >= NUM.ZERO : stryMutAct_9fa48("25902") ? true : (stryCov_9fa48("25902", "25903", "25904"), incomingUpdatedAt > NUM.ZERO)));
      if (stryMutAct_9fa48("25907") ? hasExistingUpdatedAt || !hasIncomingUpdatedAt || existingUpdatedAt >= incomingUpdatedAt : stryMutAct_9fa48("25906") ? false : stryMutAct_9fa48("25905") ? true : (stryCov_9fa48("25905", "25906", "25907"), hasExistingUpdatedAt && (stryMutAct_9fa48("25909") ? !hasIncomingUpdatedAt && existingUpdatedAt >= incomingUpdatedAt : stryMutAct_9fa48("25908") ? true : (stryCov_9fa48("25908", "25909"), (stryMutAct_9fa48("25910") ? hasIncomingUpdatedAt : (stryCov_9fa48("25910"), !hasIncomingUpdatedAt)) || (stryMutAct_9fa48("25913") ? existingUpdatedAt < incomingUpdatedAt : stryMutAct_9fa48("25912") ? existingUpdatedAt > incomingUpdatedAt : stryMutAct_9fa48("25911") ? false : (stryCov_9fa48("25911", "25912", "25913"), existingUpdatedAt >= incomingUpdatedAt)))))) {
        if (stryMutAct_9fa48("25914")) {
          {}
        } else {
          stryCov_9fa48("25914");
          logger.debug(LOG_SKIPPING_STALE_SNAPSHOT, stryMutAct_9fa48("25915") ? {} : (stryCov_9fa48("25915"), {
            nodeId: this.nodeId,
            tableName,
            key,
            existingUpdatedAt,
            incomingUpdatedAt: hasIncomingUpdatedAt ? incomingUpdatedAt : null
          }));
          return null;
        }
      }
      return CDC_OPERATION.UPSERT;
    }
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
    if (stryMutAct_9fa48("25916")) {
      {}
    } else {
      stryCov_9fa48("25916");
      const logger = this.delegates.getLogger();
      const maxAttempts = this.resolveJoinRegistrationMaxAttempts();
      let attempt = NUM.ZERO;
      let nextDelayMs = JOIN_NODE_REGISTRATION_RETRY_DELAY_MS;
      while (stryMutAct_9fa48("25918") ? false : stryMutAct_9fa48("25917") ? false : (stryCov_9fa48("25917", "25918"), true)) {
        if (stryMutAct_9fa48("25919")) {
          {}
        } else {
          stryCov_9fa48("25919");
          stryMutAct_9fa48("25920") ? attempt -= NUM.ONE : (stryCov_9fa48("25920"), attempt += NUM.ONE);
          try {
            if (stryMutAct_9fa48("25921")) {
              {}
            } else {
              stryCov_9fa48("25921");
              return await this.nodeRegistrationOwner.registerNodeInCluster();
            }
          } catch (error) {
            if (stryMutAct_9fa48("25922")) {
              {}
            } else {
              stryCov_9fa48("25922");
              const retryable = stryMutAct_9fa48("25925") ? isRetryableControlPlaneError(error) || attempt < maxAttempts : stryMutAct_9fa48("25924") ? false : stryMutAct_9fa48("25923") ? true : (stryCov_9fa48("25923", "25924", "25925"), isRetryableControlPlaneError(error) && (stryMutAct_9fa48("25928") ? attempt >= maxAttempts : stryMutAct_9fa48("25927") ? attempt <= maxAttempts : stryMutAct_9fa48("25926") ? true : (stryCov_9fa48("25926", "25927", "25928"), attempt < maxAttempts)));
              if (stryMutAct_9fa48("25931") ? false : stryMutAct_9fa48("25930") ? true : stryMutAct_9fa48("25929") ? retryable : (stryCov_9fa48("25929", "25930", "25931"), !retryable)) {
                if (stryMutAct_9fa48("25932")) {
                  {}
                } else {
                  stryCov_9fa48("25932");
                  throw error;
                }
              }
              const retryAfterMs = getControlPlaneRetryAfterMs(error);
              const delayMs = stryMutAct_9fa48("25933") ? Math.max(JOIN_NODE_REGISTRATION_MAX_DELAY_MS, Math.max(JOIN_NODE_REGISTRATION_RETRY_DELAY_MS, retryAfterMs > NUM.ZERO ? retryAfterMs : nextDelayMs)) : (stryCov_9fa48("25933"), Math.min(JOIN_NODE_REGISTRATION_MAX_DELAY_MS, stryMutAct_9fa48("25934") ? Math.min(JOIN_NODE_REGISTRATION_RETRY_DELAY_MS, retryAfterMs > NUM.ZERO ? retryAfterMs : nextDelayMs) : (stryCov_9fa48("25934"), Math.max(JOIN_NODE_REGISTRATION_RETRY_DELAY_MS, (stryMutAct_9fa48("25938") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("25937") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("25936") ? false : stryMutAct_9fa48("25935") ? true : (stryCov_9fa48("25935", "25936", "25937", "25938"), retryAfterMs > NUM.ZERO)) ? retryAfterMs : nextDelayMs))));
              logger.warn(LOG_NODE_REGISTRATION_RETRY, stryMutAct_9fa48("25939") ? {} : (stryCov_9fa48("25939"), {
                nodeId: this.nodeId,
                attempt,
                maxAttempts,
                delayMs,
                retryAfterMs: (stryMutAct_9fa48("25943") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("25942") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("25941") ? false : stryMutAct_9fa48("25940") ? true : (stryCov_9fa48("25940", "25941", "25942", "25943"), retryAfterMs > NUM.ZERO)) ? retryAfterMs : null,
                error: stryMutAct_9fa48("25946") ? error?.message && String(error) : stryMutAct_9fa48("25945") ? false : stryMutAct_9fa48("25944") ? true : (stryCov_9fa48("25944", "25945", "25946"), (stryMutAct_9fa48("25947") ? error.message : (stryCov_9fa48("25947"), error?.message)) || String(error))
              }));
              await this.sleep(delayMs);
              nextDelayMs = stryMutAct_9fa48("25948") ? Math.max(JOIN_NODE_REGISTRATION_MAX_DELAY_MS, delayMs * NUM.TWO) : (stryCov_9fa48("25948"), Math.min(JOIN_NODE_REGISTRATION_MAX_DELAY_MS, stryMutAct_9fa48("25949") ? delayMs / NUM.TWO : (stryCov_9fa48("25949"), delayMs * NUM.TWO)));
            }
          }
        }
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
    if (stryMutAct_9fa48("25950")) {
      {}
    } else {
      stryCov_9fa48("25950");
      return this.nodeRegistrationOwner.registerNodeEndpoint(now);
    }
  }

  /**
   * Register built-in meta service endpoints for this joining node.
   * @return {Promise<Array<Object>>}
   */
  async registerMetaServiceEndpoints() {
    if (stryMutAct_9fa48("25951")) {
      {}
    } else {
      stryCov_9fa48("25951");
      return this.nodeRegistrationOwner.registerMetaServiceEndpoints();
    }
  }

  /**
   * Upsert a system-table row through CDC integration service.
   * @param {string} tableName - System table name.
   * @param {Object} rowData - Row payload.
   * @return {Promise<Object>} Upsert result.
   */
  async upsertSystemTableRow(tableName, rowData) {
    if (stryMutAct_9fa48("25952")) {
      {}
    } else {
      stryCov_9fa48("25952");
      const cdcIntegrationService = this.delegates.getCdcIntegrationService();
      const upsertOptions = this.getJoinTimeUpsertOptions();
      if (stryMutAct_9fa48("25955") ? typeof cdcIntegrationService?.upsertSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("25954") ? false : stryMutAct_9fa48("25953") ? true : (stryCov_9fa48("25953", "25954", "25955"), typeof (stryMutAct_9fa48("25956") ? cdcIntegrationService.upsertSystemTableRow : (stryCov_9fa48("25956"), cdcIntegrationService?.upsertSystemTableRow)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("25957")) {
          {}
        } else {
          stryCov_9fa48("25957");
          return cdcIntegrationService.upsertSystemTableRow(tableName, rowData, upsertOptions);
        }
      }
      const columns = Object.keys(rowData);
      const placeholders = columns.map(stryMutAct_9fa48("25958") ? () => undefined : (stryCov_9fa48("25958"), () => stryMutAct_9fa48("25959") ? "" : (stryCov_9fa48("25959"), '?'))).join(stryMutAct_9fa48("25960") ? "" : (stryCov_9fa48("25960"), ', '));
      const sql = (stryMutAct_9fa48("25961") ? `` : (stryCov_9fa48("25961"), `INSERT INTO ${tableName} `)) + (stryMutAct_9fa48("25962") ? `` : (stryCov_9fa48("25962"), `(${columns.join(stryMutAct_9fa48("25963") ? "" : (stryCov_9fa48("25963"), ', '))}) VALUES (${placeholders})`));
      const params = columns.map(stryMutAct_9fa48("25964") ? () => undefined : (stryCov_9fa48("25964"), column => rowData[column]));
      return cdcIntegrationService.sqlQueryEngine.executeQuery(sql, params, upsertOptions);
    }
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
    if (stryMutAct_9fa48("25965")) {
      {}
    } else {
      stryCov_9fa48("25965");
      return this.nodeRegistrationOwner.upsertSystemTableRowWithRetry(tableName, rowData, options);
    }
  }

  /**
   * Determine whether join-time upserts can require local cache
   * visibility.
   * @return {Object|undefined}
   */
  getJoinTimeUpsertOptions() {
    if (stryMutAct_9fa48("25966")) {
      {}
    } else {
      stryCov_9fa48("25966");
      const options = stryMutAct_9fa48("25967") ? {} : (stryCov_9fa48("25967"), {
        deliveryPriority: stryMutAct_9fa48("25968") ? "" : (stryCov_9fa48("25968"), 'critical')
      });
      if (stryMutAct_9fa48("25971") ? this.delegates.getCdcSubscriptionsActive() === true : stryMutAct_9fa48("25970") ? false : stryMutAct_9fa48("25969") ? true : (stryCov_9fa48("25969", "25970", "25971"), this.delegates.getCdcSubscriptionsActive() !== (stryMutAct_9fa48("25972") ? false : (stryCov_9fa48("25972"), true)))) {
        if (stryMutAct_9fa48("25973")) {
          {}
        } else {
          stryCov_9fa48("25973");
          options.skipCacheWait = stryMutAct_9fa48("25974") ? false : (stryCov_9fa48("25974"), true);
        }
      }
      return options;
    }
  }
  resolveJoinRegistrationMaxAttempts() {
    if (stryMutAct_9fa48("25975")) {
      {}
    } else {
      stryCov_9fa48("25975");
      const configured = stryMutAct_9fa48("25977") ? this.delegates.getConfig()?.joinRegistrationMaxAttempts : stryMutAct_9fa48("25976") ? this.delegates.getConfig?.().joinRegistrationMaxAttempts : (stryCov_9fa48("25976", "25977"), this.delegates.getConfig?.()?.joinRegistrationMaxAttempts);
      if (stryMutAct_9fa48("25980") ? Number.isFinite(configured) || configured >= NUM.ONE : stryMutAct_9fa48("25979") ? false : stryMutAct_9fa48("25978") ? true : (stryCov_9fa48("25978", "25979", "25980"), Number.isFinite(configured) && (stryMutAct_9fa48("25983") ? configured < NUM.ONE : stryMutAct_9fa48("25982") ? configured > NUM.ONE : stryMutAct_9fa48("25981") ? true : (stryCov_9fa48("25981", "25982", "25983"), configured >= NUM.ONE)))) {
        if (stryMutAct_9fa48("25984")) {
          {}
        } else {
          stryCov_9fa48("25984");
          return stryMutAct_9fa48("25985") ? Math.min(NUM.ONE, Math.floor(configured)) : (stryCov_9fa48("25985"), Math.max(NUM.ONE, Math.floor(configured)));
        }
      }
      return JOIN_NODE_REGISTRATION_MAX_ATTEMPTS;
    }
  }
  async sleep(delayMs) {
    if (stryMutAct_9fa48("25986")) {
      {}
    } else {
      stryCov_9fa48("25986");
      const sleepImpl = stryMutAct_9fa48("25987") ? this.delegates.getSleep() : (stryCov_9fa48("25987"), this.delegates.getSleep?.());
      if (stryMutAct_9fa48("25990") ? typeof sleepImpl !== TYPEOF.FUNCTION : stryMutAct_9fa48("25989") ? false : stryMutAct_9fa48("25988") ? true : (stryCov_9fa48("25988", "25989", "25990"), typeof sleepImpl === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("25991")) {
          {}
        } else {
          stryCov_9fa48("25991");
          await sleepImpl(delayMs);
          return;
        }
      }
      await new Promise(stryMutAct_9fa48("25992") ? () => undefined : (stryCov_9fa48("25992"), resolve => setTimeout(resolve, delayMs)));
    }
  }

  /**
   * Seed successful join-time control-plane writes into the local
   * cache.
   * @param {string} tableName
   * @param {Object|null} rowData
   * @return {void}
   */
  seedJoinTimeCacheRow(tableName, rowData) {
    if (stryMutAct_9fa48("25993")) {
      {}
    } else {
      stryCov_9fa48("25993");
      if (stryMutAct_9fa48("25996") ? !rowData && typeof rowData !== TYPEOF.OBJECT : stryMutAct_9fa48("25995") ? false : stryMutAct_9fa48("25994") ? true : (stryCov_9fa48("25994", "25995", "25996"), (stryMutAct_9fa48("25997") ? rowData : (stryCov_9fa48("25997"), !rowData)) || (stryMutAct_9fa48("25999") ? typeof rowData === TYPEOF.OBJECT : stryMutAct_9fa48("25998") ? false : (stryCov_9fa48("25998", "25999"), typeof rowData !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("26000")) {
          {}
        } else {
          stryCov_9fa48("26000");
          return;
        }
      }
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      if (stryMutAct_9fa48("26003") ? !systemTableCache && typeof systemTableCache.applySystemTableChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("26002") ? false : stryMutAct_9fa48("26001") ? true : (stryCov_9fa48("26001", "26002", "26003"), (stryMutAct_9fa48("26004") ? systemTableCache : (stryCov_9fa48("26004"), !systemTableCache)) || (stryMutAct_9fa48("26006") ? typeof systemTableCache.applySystemTableChange === TYPEOF.FUNCTION : stryMutAct_9fa48("26005") ? false : (stryCov_9fa48("26005", "26006"), typeof systemTableCache.applySystemTableChange !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("26007")) {
          {}
        } else {
          stryCov_9fa48("26007");
          return;
        }
      }
      systemTableCache.applySystemTableChange(tableName, CDC_OPERATION.UPSERT, rowData);
    }
  }
}
export { QuerySystemStatePhase };