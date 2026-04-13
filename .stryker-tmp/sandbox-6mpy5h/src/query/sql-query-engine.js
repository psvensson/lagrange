/**
 * SQL Query Engine - Main entry point for SQL query processing.
 * Coordinates parsing, partition resolution, and execution.
 *
 * System Cache-Based Routing:
 * - All queries route through system cache (single source of truth)
 * - System cache provides partition metadata and leader addresses
 * - No bootstrap directories or fallback mechanisms
 * - All communication through message router using service addresses
 *
 * Query Routing Flow:
 * 1. Parse SQL to determine target table
 * 2. Get partitions from system cache
 * 3. Resolve which partitions to query based on WHERE clause
 * 4. Find partition leader addresses from system cache
 * 5. Route queries through message router to leaders
 * 6. Aggregate and return results
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 15.1, 15.2, 15.3, 15.4, 20.1, 20.2, 20.3,
 *               20.6, 20.7, 20.10, 21.1, 21.2, 21.3
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
import { createHash } from 'node:crypto';
import { SQLParser } from './sql-parser.js';
import { getSchemaByTableName, SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { isPriorityControlPlanePartition } from '../bootstrap/system-partition-classification.js';
import { PartitionResolver } from './partition-resolver.js';
import { QueryExecutor } from './query-executor.js';
import { TableCreationService } from './table-creation-service.js';
import { DistributedQueryPlanner } from './distributed/distributed-query-planner.js';
import { DistributedWriteCoordinator } from './distributed/distributed-write-coordinator.js';
import { DistributedTransactionCoordinator, WRITE_OPERATION_STATUS } from './distributed/distributed-transaction-coordinator.js';
import { OperationType, OPERATION_METADATA_KEY } from '../rebalancer/replica-status.js';
import { ReplicaOperationField } from '../rebalancer/replica-operation-constants.js';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { COLUMN, ENTITY_TYPE, TABLES, METRICS_LOG_TAG, SERVICE_TYPE, STATE } from '../constants/index.js';
import { QUERY_AST_TYPE, QUERY_CONFIG_KEY, QUERY_DEFAULTS, QUERY_ERROR_CODE, QUERY_ERROR_MSG, QUERY_LOG_MSG, QUERY_OPERATION, QUERY_SESSION, QUERY_SUBSYSTEM, SQL_PARSE_CACHE, WRITE_TRACKING_EXCLUDED_TABLES } from './query-constants.js';
import { isSqlRequest } from './sql-request.js';
import { PartitionCallbackDispatcher } from './callback/partition-callback-dispatcher.js';
import { CallbackExecutionHost } from './callback/callback-execution-host.js';
import { createCallbackDriverRegistry } from './callback/callback-runtime-driver-registry.js';
import { executeStage } from './call-stage.js';
import { executePlan } from './call-plan.js';
import { ExecutionContext } from './execution-context.js';
import { BudgetEnforcer } from './budget-enforcer.js';
import { resolveBootstrapLeaderSelection } from './bootstrap-leader-selection.js';
import { CancellationToken } from './cancellation-token.js';
import { LineageTracker } from './lineage-tracker.js';
import { DEFAULT_SNAPSHOT_MODE } from './runtime-constants.js';
import { EXECUTION_MODE, ADAPTER_ERROR_MSG, ADAPTER_LOG_MSG, CALLBACK_RUNTIME_KIND } from './sql-adapter-constants.js';
import { parseCallbackModuleArtifact } from './callback/callback-module-artifact.js';
import { reorderParams } from './pg/pg-translate.js';
import { SqlParseCache } from './sql-parse-cache.js';
import { AddressManager } from '../address/address-manager.js';
import { isNodeRecordReady } from '../node/node-readiness-policy.js';
import { STORAGE_CAPACITY_CONFIG_KEY, STORAGE_CAPACITY_DEFAULT } from '../rebalancer/storage-capacity-constants.js';
import { TIMEOUT_BUDGET_CLASSIFICATION, TIMEOUT_BUDGET_DEFAULT, createTimeoutBudgetError, getRemainingBudgetMs } from '../control-plane/timeout-budget.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY } from '../cdc/cdc-integration-service.js';
import { AuthoritativeControlPlaneView } from '../control-plane/authoritative-control-plane-view.js';
import { CONTROL_PLANE_MUTATION_OPERATION, CONTROL_PLANE_MUTATION_MERGE_POLICY } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { CONTROL_PLANE_MUTATION_WORK_CLASS } from '../control-plane/control-plane-mutation-readiness.js';
import { buildPressureAdmissionFailure, PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { PARTITION_SPLIT_MIRROR_ORIGIN, PARTITION_TRANSITION_METADATA_FIELD, PARTITION_TRANSITION_STATE } from '../partition/partition-constants.js';
import { isRetryableManagedSplitTransition } from '../partition/managed-split-retry-policy.js';
import { ManagedSplitTopologyAdapter } from '../partition/managed-split-topology-adapter.js';
import { ManagedSplitWorkflow } from '../partition/managed-split-workflow.js';
import { PARTITION_SERVICE_MESSAGE_TYPE } from '../partition/partition-service-constants.js';
import { TimeoutPolicy } from '../workflow/timeout-policy.js';
import { MIGRATION_STATUS } from '../migration/migration-constants.js';
import { MigrationCoordinator } from '../migration/migration-coordinator.js';
import { MigrationPipeline } from '../migration/migration-pipeline.js';
const CODE_LOOKUP_BY_FUNCTION_ID_SQL = stryMutAct_9fa48("119749") ? `` : (stryCov_9fa48("119749"), `SELECT * FROM ${TABLES.CODE} WHERE function_id = ?`);
const CODE_LOOKUP_BY_FUNCTION_NAME_SQL = stryMutAct_9fa48("119750") ? `` : (stryCov_9fa48("119750"), `SELECT * FROM ${TABLES.CODE} WHERE function_name = ?`);
const MODULE_MANIFEST_LOOKUP_BY_ARTIFACT_POINTER_SQL = (stryMutAct_9fa48("119751") ? `` : (stryCov_9fa48("119751"), `SELECT * FROM ${TABLES.MODULE_MANIFESTS} `)) + (stryMutAct_9fa48("119752") ? "" : (stryCov_9fa48("119752"), 'WHERE artifact_pointer = ? ORDER BY created_at DESC LIMIT 1'));
const NATIVE_CALLBACK_EXPORTS_ARG = stryMutAct_9fa48("119753") ? "" : (stryCov_9fa48("119753"), 'exports');
const NATIVE_CALLBACK_MODULE_ARG = stryMutAct_9fa48("119754") ? "" : (stryCov_9fa48("119754"), 'module');
const NATIVE_CALLBACK_RETURN_LINE = stryMutAct_9fa48("119755") ? "" : (stryCov_9fa48("119755"), 'return module.exports;');
const DEFAULT_CODE_VERSION = stryMutAct_9fa48("119756") ? "" : (stryCov_9fa48("119756"), '1');
const ZERO_SHA256_DIGEST = (stryMutAct_9fa48("119757") ? "" : (stryCov_9fa48("119757"), 'sha256:')) + (stryMutAct_9fa48("119758") ? "" : (stryCov_9fa48("119758"), '0')).repeat(64);
const BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES = new Set(stryMutAct_9fa48("119759") ? [] : (stryCov_9fa48("119759"), [TABLES.SQL_TRANSACTIONS, TABLES.SQL_TRANSACTION_PARTICIPANTS, TABLES.SQL_WRITE_OPERATIONS]));
const EXPLAIN_DISTRIBUTED_PREFIX_REGEX = stryMutAct_9fa48("119766") ? /^\s*EXPLAIN\s+DISTRIBUTED\S+/i : stryMutAct_9fa48("119765") ? /^\s*EXPLAIN\s+DISTRIBUTED\s/i : stryMutAct_9fa48("119764") ? /^\s*EXPLAIN\S+DISTRIBUTED\s+/i : stryMutAct_9fa48("119763") ? /^\s*EXPLAIN\sDISTRIBUTED\s+/i : stryMutAct_9fa48("119762") ? /^\S*EXPLAIN\s+DISTRIBUTED\s+/i : stryMutAct_9fa48("119761") ? /^\sEXPLAIN\s+DISTRIBUTED\s+/i : stryMutAct_9fa48("119760") ? /\s*EXPLAIN\s+DISTRIBUTED\s+/i : (stryCov_9fa48("119760", "119761", "119762", "119763", "119764", "119765", "119766"), /^\s*EXPLAIN\s+DISTRIBUTED\s+/i);
const STATUS_ACTIVE = stryMutAct_9fa48("119767") ? "" : (stryCov_9fa48("119767"), 'active');
const CONNECTION_STATE_CONNECTED = stryMutAct_9fa48("119768") ? String(STATE.CONNECTED).toUpperCase() : (stryCov_9fa48("119768"), String(STATE.CONNECTED).toLowerCase());
const CONNECTION_STATE_READY = stryMutAct_9fa48("119769") ? String(STATE.READY).toUpperCase() : (stryCov_9fa48("119769"), String(STATE.READY).toLowerCase());
const DEFAULT_PARTITION_VERSION = 1;
const ACTIVE_PARTITION_STATE = stryMutAct_9fa48("119770") ? "" : (stryCov_9fa48("119770"), 'NORMAL');
const DUAL_WRITE_ACTIVE_STATUSES = new Set(stryMutAct_9fa48("119771") ? [] : (stryCov_9fa48("119771"), [MIGRATION_STATUS.DUAL_WRITE]));
const TABLE_PARTITION_TARGET_NODE_WAIT = stryMutAct_9fa48("119772") ? "" : (stryCov_9fa48("119772"), 'table_partition_target_node_wait');
const TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS = 10000;
const PROVISIONING_REJECTION_DETAIL_LIMIT = 3;
const PROVISIONING_REJECTION_SUMMARY_NONE = stryMutAct_9fa48("119773") ? "" : (stryCov_9fa48("119773"), 'none');
const PROVISIONING_REJECTION_REASON_UNKNOWN = stryMutAct_9fa48("119774") ? "" : (stryCov_9fa48("119774"), 'admission_blocked');
const WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS = 5000;
function createEmptyTransactionRecoveryReplaySummary() {
  if (stryMutAct_9fa48("119775")) {
    {}
  } else {
    stryCov_9fa48("119775");
    return stryMutAct_9fa48("119776") ? {} : (stryCov_9fa48("119776"), {
      totalRecovered: 0,
      resumed: 0,
      failed: 0,
      results: stryMutAct_9fa48("119777") ? ["Stryker was here"] : (stryCov_9fa48("119777"), [])
    });
  }
}

/**
 * SQLQueryEngine is the main entry point for SQL query processing.
 * It coordinates parsing, partition resolution, and parallel execution.
 *
 * System Cache-Based Routing:
 * - Routes ALL queries through message router (no local vs remote distinction)
 * - System cache is the single source of truth for partition locations
 * - No bootstrap directories or fallback mechanisms
 * - All partition leader addresses come from system cache
 */
class SQLQueryEngine {
  /**
   * Create a new SQL query engine.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemCache - System table cache for lookups.
   * @param {Object} options.messageRouter - Message router for query routing.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {string} options.nodeId - Node ID.
   * @param {Object} options.rebalanceCoordinator - Rebalance coordinator.
   * @param {boolean} [options.autoStartDistributedTransactionRecovery=true] -
   *   Whether recovered distributed transactions should start replaying as soon
   *   as the engine is constructed or rehydrated with a cache.
   * @param {Function} options.tablePartitionProvisioner - Initial partition
   *   provisioning callback for CREATE TABLE.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("119778")) {
      {}
    } else {
      stryCov_9fa48("119778");
      this.systemCache = stryMutAct_9fa48("119781") ? options.systemCache && null : stryMutAct_9fa48("119780") ? false : stryMutAct_9fa48("119779") ? true : (stryCov_9fa48("119779", "119780", "119781"), options.systemCache || null);
      this.messageRouter = stryMutAct_9fa48("119784") ? options.messageRouter && null : stryMutAct_9fa48("119783") ? false : stryMutAct_9fa48("119782") ? true : (stryCov_9fa48("119782", "119783", "119784"), options.messageRouter || null);
      this.cdcIntegrationService = stryMutAct_9fa48("119787") ? options.cdcIntegrationService && null : stryMutAct_9fa48("119786") ? false : stryMutAct_9fa48("119785") ? true : (stryCov_9fa48("119785", "119786", "119787"), options.cdcIntegrationService || null);
      this.nodeId = stryMutAct_9fa48("119790") ? options.nodeId && QUERY_SUBSYSTEM.SQL_QUERY_ENGINE : stryMutAct_9fa48("119789") ? false : stryMutAct_9fa48("119788") ? true : (stryCov_9fa48("119788", "119789", "119790"), options.nodeId || QUERY_SUBSYSTEM.SQL_QUERY_ENGINE);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("119793") ? options.controlPlaneSystemTableGateway && createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () => this,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemCache,
        getMessageRouter: () => this.messageRouter
      }).controlPlaneSystemTableGateway : stryMutAct_9fa48("119792") ? false : stryMutAct_9fa48("119791") ? true : (stryCov_9fa48("119791", "119792", "119793"), options.controlPlaneSystemTableGateway || createControlPlaneRuntimeBundle(stryMutAct_9fa48("119794") ? {} : (stryCov_9fa48("119794"), {
        nodeId: this.nodeId,
        getSqlQueryEngine: stryMutAct_9fa48("119795") ? () => undefined : (stryCov_9fa48("119795"), () => this),
        getCdcIntegrationService: stryMutAct_9fa48("119796") ? () => undefined : (stryCov_9fa48("119796"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("119797") ? () => undefined : (stryCov_9fa48("119797"), () => this.systemCache),
        getMessageRouter: stryMutAct_9fa48("119798") ? () => undefined : (stryCov_9fa48("119798"), () => this.messageRouter)
      })).controlPlaneSystemTableGateway);
      this.rebalanceCoordinator = stryMutAct_9fa48("119801") ? options.rebalanceCoordinator && null : stryMutAct_9fa48("119800") ? false : stryMutAct_9fa48("119799") ? true : (stryCov_9fa48("119799", "119800", "119801"), options.rebalanceCoordinator || null);
      this.controlPlaneReadinessService = stryMutAct_9fa48("119804") ? (options.controlPlaneReadinessService || this.rebalanceCoordinator?.controlPlaneReadinessService) && null : stryMutAct_9fa48("119803") ? false : stryMutAct_9fa48("119802") ? true : (stryCov_9fa48("119802", "119803", "119804"), (stryMutAct_9fa48("119806") ? options.controlPlaneReadinessService && this.rebalanceCoordinator?.controlPlaneReadinessService : stryMutAct_9fa48("119805") ? false : (stryCov_9fa48("119805", "119806"), options.controlPlaneReadinessService || (stryMutAct_9fa48("119807") ? this.rebalanceCoordinator.controlPlaneReadinessService : (stryCov_9fa48("119807"), this.rebalanceCoordinator?.controlPlaneReadinessService)))) || null);
      this.defaultRoutingReadinessDimension = stryMutAct_9fa48("119810") ? options.defaultRoutingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE : stryMutAct_9fa48("119809") ? false : stryMutAct_9fa48("119808") ? true : (stryCov_9fa48("119808", "119809", "119810"), options.defaultRoutingReadinessDimension || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE);
      this.routingMetadataOverlay = stryMutAct_9fa48("119813") ? options.routingMetadataOverlay && null : stryMutAct_9fa48("119812") ? false : stryMutAct_9fa48("119811") ? true : (stryCov_9fa48("119811", "119812", "119813"), options.routingMetadataOverlay || null);
      this.authoritativeRoutingOverlayEntries = new Map();
      this.bootstrapRoutingOverlayEntries = new Map();
      this.authoritativeRoutingOverlay = stryMutAct_9fa48("119814") ? {} : (stryCov_9fa48("119814"), {
        getPartitionById: stryMutAct_9fa48("119815") ? () => undefined : (stryCov_9fa48("119815"), partitionId => this.getAuthoritativeRoutingOverlayPartition(partitionId)),
        getServicesForPartition: stryMutAct_9fa48("119816") ? () => undefined : (stryCov_9fa48("119816"), partitionId => this.getAuthoritativeRoutingOverlayServices(partitionId)),
        refreshPartitionRouting: stryMutAct_9fa48("119817") ? () => undefined : (stryCov_9fa48("119817"), async (partitionId, overlayOptions = {}) => this.refreshAuthoritativeRoutingOverlay(partitionId, overlayOptions))
      });
      this.lastWriteSplitEvaluationByTable = new Map();
      this.bootstrapRoutingOverlay = stryMutAct_9fa48("119818") ? {} : (stryCov_9fa48("119818"), {
        getPartitionById: stryMutAct_9fa48("119819") ? () => undefined : (stryCov_9fa48("119819"), partitionId => this.getBootstrapRoutingOverlayPartition(partitionId)),
        getServicesForPartition: stryMutAct_9fa48("119820") ? () => undefined : (stryCov_9fa48("119820"), partitionId => this.getBootstrapRoutingOverlayServices(partitionId))
      });
      this.nowFn = stryMutAct_9fa48("119823") ? options.nowFn && (() => Date.now()) : stryMutAct_9fa48("119822") ? false : stryMutAct_9fa48("119821") ? true : (stryCov_9fa48("119821", "119822", "119823"), options.nowFn || (stryMutAct_9fa48("119824") ? () => undefined : (stryCov_9fa48("119824"), () => Date.now())));
      this.authoritativeControlPlaneView = stryMutAct_9fa48("119827") ? options.authoritativeControlPlaneView && null : stryMutAct_9fa48("119826") ? false : stryMutAct_9fa48("119825") ? true : (stryCov_9fa48("119825", "119826", "119827"), options.authoritativeControlPlaneView || null);
      this.controlPlaneTimeoutPolicy = stryMutAct_9fa48("119830") ? options.controlPlaneTimeoutPolicy && new TimeoutPolicy({
        operationName: 'sql_control_plane',
        now: this.nowFn
      }) : stryMutAct_9fa48("119829") ? false : stryMutAct_9fa48("119828") ? true : (stryCov_9fa48("119828", "119829", "119830"), options.controlPlaneTimeoutPolicy || new TimeoutPolicy(stryMutAct_9fa48("119831") ? {} : (stryCov_9fa48("119831"), {
        operationName: stryMutAct_9fa48("119832") ? "" : (stryCov_9fa48("119832"), 'sql_control_plane'),
        now: this.nowFn
      })));
      this.tablePartitionProvisioningTimeoutMs = (stryMutAct_9fa48("119835") ? Number.isFinite(options.tablePartitionProvisioningTimeoutMs) || options.tablePartitionProvisioningTimeoutMs > 0 : stryMutAct_9fa48("119834") ? false : stryMutAct_9fa48("119833") ? true : (stryCov_9fa48("119833", "119834", "119835"), Number.isFinite(options.tablePartitionProvisioningTimeoutMs) && (stryMutAct_9fa48("119838") ? options.tablePartitionProvisioningTimeoutMs <= 0 : stryMutAct_9fa48("119837") ? options.tablePartitionProvisioningTimeoutMs >= 0 : stryMutAct_9fa48("119836") ? true : (stryCov_9fa48("119836", "119837", "119838"), options.tablePartitionProvisioningTimeoutMs > 0)))) ? Math.floor(options.tablePartitionProvisioningTimeoutMs) : QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS;
      this.tablePartitionProvisioningPollIntervalMs = (stryMutAct_9fa48("119841") ? Number.isFinite(options.tablePartitionProvisioningPollIntervalMs) || options.tablePartitionProvisioningPollIntervalMs > 0 : stryMutAct_9fa48("119840") ? false : stryMutAct_9fa48("119839") ? true : (stryCov_9fa48("119839", "119840", "119841"), Number.isFinite(options.tablePartitionProvisioningPollIntervalMs) && (stryMutAct_9fa48("119844") ? options.tablePartitionProvisioningPollIntervalMs <= 0 : stryMutAct_9fa48("119843") ? options.tablePartitionProvisioningPollIntervalMs >= 0 : stryMutAct_9fa48("119842") ? true : (stryCov_9fa48("119842", "119843", "119844"), options.tablePartitionProvisioningPollIntervalMs > 0)))) ? Math.floor(options.tablePartitionProvisioningPollIntervalMs) : QUERY_DEFAULTS.TABLE_CREATE_PROVISION_POLL_INTERVAL_MS;
      this.tablePartitionTargetNodeConvergenceTimeoutMs = (stryMutAct_9fa48("119847") ? Number.isFinite(options.tablePartitionTargetNodeConvergenceTimeoutMs) || options.tablePartitionTargetNodeConvergenceTimeoutMs > 0 : stryMutAct_9fa48("119846") ? false : stryMutAct_9fa48("119845") ? true : (stryCov_9fa48("119845", "119846", "119847"), Number.isFinite(options.tablePartitionTargetNodeConvergenceTimeoutMs) && (stryMutAct_9fa48("119850") ? options.tablePartitionTargetNodeConvergenceTimeoutMs <= 0 : stryMutAct_9fa48("119849") ? options.tablePartitionTargetNodeConvergenceTimeoutMs >= 0 : stryMutAct_9fa48("119848") ? true : (stryCov_9fa48("119848", "119849", "119850"), options.tablePartitionTargetNodeConvergenceTimeoutMs > 0)))) ? Math.floor(options.tablePartitionTargetNodeConvergenceTimeoutMs) : QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS;
      this.partitionResolver = new PartitionResolver(stryMutAct_9fa48("119851") ? {} : (stryCov_9fa48("119851"), {
        systemCache: this.systemCache
      }));
      this.distributedQueryPlanner = stryMutAct_9fa48("119854") ? options.distributedQueryPlanner && new DistributedQueryPlanner({
        partitionResolver: this.partitionResolver,
        getTablePartitions: tableName => this.getTablePartitions(tableName),
        getTableInfo: tableName => this.getTableInfo(tableName)
      }) : stryMutAct_9fa48("119853") ? false : stryMutAct_9fa48("119852") ? true : (stryCov_9fa48("119852", "119853", "119854"), options.distributedQueryPlanner || new DistributedQueryPlanner(stryMutAct_9fa48("119855") ? {} : (stryCov_9fa48("119855"), {
        partitionResolver: this.partitionResolver,
        getTablePartitions: stryMutAct_9fa48("119856") ? () => undefined : (stryCov_9fa48("119856"), tableName => this.getTablePartitions(tableName)),
        getTableInfo: stryMutAct_9fa48("119857") ? () => undefined : (stryCov_9fa48("119857"), tableName => this.getTableInfo(tableName))
      })));
      this.queryExecutor = new QueryExecutor(stryMutAct_9fa48("119858") ? {} : (stryCov_9fa48("119858"), {
        messageRouter: this.messageRouter,
        systemCache: this.systemCache,
        bootstrapTopologySnapshotOwner: stryMutAct_9fa48("119861") ? options.bootstrapTopologySnapshotOwner && null : stryMutAct_9fa48("119860") ? false : stryMutAct_9fa48("119859") ? true : (stryCov_9fa48("119859", "119860", "119861"), options.bootstrapTopologySnapshotOwner || null),
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        defaultRoutingReadinessDimension: this.defaultRoutingReadinessDimension,
        nodeId: this.nodeId
      }));
      this.queryExecutor.setRoutingMetadataOverlay(this.composeRoutingMetadataOverlay(this.routingMetadataOverlay, this.composeRoutingMetadataOverlay(this.authoritativeRoutingOverlay, this.bootstrapRoutingOverlay)));
      this.distributedWriteCoordinator = stryMutAct_9fa48("119864") ? options.distributedWriteCoordinator && new DistributedWriteCoordinator({
        partitionResolver: this.partitionResolver,
        queryExecutor: this.queryExecutor,
        getTablePartitions: tableName => this.getTablePartitions(tableName),
        getTableInfo: tableName => this.getTableInfo(tableName)
      }) : stryMutAct_9fa48("119863") ? false : stryMutAct_9fa48("119862") ? true : (stryCov_9fa48("119862", "119863", "119864"), options.distributedWriteCoordinator || new DistributedWriteCoordinator(stryMutAct_9fa48("119865") ? {} : (stryCov_9fa48("119865"), {
        partitionResolver: this.partitionResolver,
        queryExecutor: this.queryExecutor,
        getTablePartitions: stryMutAct_9fa48("119866") ? () => undefined : (stryCov_9fa48("119866"), tableName => this.getTablePartitions(tableName)),
        getTableInfo: stryMutAct_9fa48("119867") ? () => undefined : (stryCov_9fa48("119867"), tableName => this.getTableInfo(tableName))
      })));
      this.transactionCoordinator = stryMutAct_9fa48("119870") ? options.transactionCoordinator && new DistributedTransactionCoordinator({
        beginParticipant: async (sessionId, partitionId, transactionEpoch) => this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.BEGIN, {
          transactionEpoch
        }),
        prepareParticipant: async (sessionId, partitionId) => this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.PREPARE),
        commitParticipant: async (sessionId, partitionId) => this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.COMMIT),
        rollbackParticipant: async (sessionId, partitionId) => this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.ROLLBACK),
        persistTransaction: async record => this.persistDistributedTransactionRow(record),
        persistParticipant: async record => this.persistDistributedTransactionParticipantRow(record),
        persistWriteOperation: async record => this.persistDistributedWriteOperationRow(record),
        epochSource: options.transactionEpochSource,
        loadRecoveryStateForSweep: async () => this.loadDistributedTransactionRecoveryState()
      }) : stryMutAct_9fa48("119869") ? false : stryMutAct_9fa48("119868") ? true : (stryCov_9fa48("119868", "119869", "119870"), options.transactionCoordinator || new DistributedTransactionCoordinator(stryMutAct_9fa48("119871") ? {} : (stryCov_9fa48("119871"), {
        beginParticipant: stryMutAct_9fa48("119872") ? () => undefined : (stryCov_9fa48("119872"), async (sessionId, partitionId, transactionEpoch) => this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.BEGIN, stryMutAct_9fa48("119873") ? {} : (stryCov_9fa48("119873"), {
          transactionEpoch
        }))),
        prepareParticipant: stryMutAct_9fa48("119874") ? () => undefined : (stryCov_9fa48("119874"), async (sessionId, partitionId) => this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.PREPARE)),
        commitParticipant: stryMutAct_9fa48("119875") ? () => undefined : (stryCov_9fa48("119875"), async (sessionId, partitionId) => this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.COMMIT)),
        rollbackParticipant: stryMutAct_9fa48("119876") ? () => undefined : (stryCov_9fa48("119876"), async (sessionId, partitionId) => this.deliverTransactionOperation(sessionId, partitionId, QUERY_OPERATION.ROLLBACK)),
        persistTransaction: stryMutAct_9fa48("119877") ? () => undefined : (stryCov_9fa48("119877"), async record => this.persistDistributedTransactionRow(record)),
        persistParticipant: stryMutAct_9fa48("119878") ? () => undefined : (stryCov_9fa48("119878"), async record => this.persistDistributedTransactionParticipantRow(record)),
        persistWriteOperation: stryMutAct_9fa48("119879") ? () => undefined : (stryCov_9fa48("119879"), async record => this.persistDistributedWriteOperationRow(record)),
        epochSource: options.transactionEpochSource,
        loadRecoveryStateForSweep: stryMutAct_9fa48("119880") ? () => undefined : (stryCov_9fa48("119880"), async () => this.loadDistributedTransactionRecoveryState())
      })));
      this.managedSplitWorkflow = stryMutAct_9fa48("119883") ? options.managedSplitWorkflow && null : stryMutAct_9fa48("119882") ? false : stryMutAct_9fa48("119881") ? true : (stryCov_9fa48("119881", "119882", "119883"), options.managedSplitWorkflow || null);
      const tablePartitionProvisioner = (stryMutAct_9fa48("119886") ? typeof options.tablePartitionProvisioner !== 'function' : stryMutAct_9fa48("119885") ? false : stryMutAct_9fa48("119884") ? true : (stryCov_9fa48("119884", "119885", "119886"), typeof options.tablePartitionProvisioner === (stryMutAct_9fa48("119887") ? "" : (stryCov_9fa48("119887"), 'function')))) ? options.tablePartitionProvisioner : this.rebalanceCoordinator ? stryMutAct_9fa48("119888") ? () => undefined : (stryCov_9fa48("119888"), context => this.provisionInitialTablePartition(context)) : null;
      this.partitionSplitMergeManager = stryMutAct_9fa48("119891") ? options.partitionSplitMergeManager && null : stryMutAct_9fa48("119890") ? false : stryMutAct_9fa48("119889") ? true : (stryCov_9fa48("119889", "119890", "119891"), options.partitionSplitMergeManager || null);
      this.tableCreationService = new TableCreationService(stryMutAct_9fa48("119892") ? {} : (stryCov_9fa48("119892"), {
        systemCache: this.systemCache,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        partitionSplitMergeManager: this.partitionSplitMergeManager,
        calculateQuorumReplicaCount: stryMutAct_9fa48("119893") ? () => undefined : (stryCov_9fa48("119893"), replicaCount => this.calculateQuorumReplicaCount(replicaCount)),
        partitionProvisioner: tablePartitionProvisioner
      }));
      this.partitionCallbackDispatcher = new PartitionCallbackDispatcher(stryMutAct_9fa48("119894") ? {} : (stryCov_9fa48("119894"), {
        sqlParser: stryMutAct_9fa48("119895") ? {} : (stryCov_9fa48("119895"), {
          parse: stryMutAct_9fa48("119896") ? () => undefined : (stryCov_9fa48("119896"), sql => this.parse(sql))
        }),
        partitionResolver: this.partitionResolver,
        queryExecutor: this.queryExecutor,
        getTablePartitions: stryMutAct_9fa48("119897") ? () => undefined : (stryCov_9fa48("119897"), name => this.getTablePartitions(name)),
        isSystemTable: stryMutAct_9fa48("119898") ? () => undefined : (stryCov_9fa48("119898"), name => this.isSystemTable(name))
      }));
      this.parseCache = new SqlParseCache(SQL_PARSE_CACHE.DEFAULT_MAX_SIZE);
      this.logger = this.initLogger();
      this.migrationAutoWireEnabled = stryMutAct_9fa48("119901") ? options.migrationAutoWire === false : stryMutAct_9fa48("119900") ? false : stryMutAct_9fa48("119899") ? true : (stryCov_9fa48("119899", "119900", "119901"), options.migrationAutoWire !== (stryMutAct_9fa48("119902") ? true : (stryCov_9fa48("119902"), false)));
      this.migrationCoordinator = stryMutAct_9fa48("119905") ? options.migrationCoordinator && null : stryMutAct_9fa48("119904") ? false : stryMutAct_9fa48("119903") ? true : (stryCov_9fa48("119903", "119904", "119905"), options.migrationCoordinator || null);
      if (stryMutAct_9fa48("119908") ? this.migrationAutoWireEnabled && !this.migrationCoordinator || this.systemCache : stryMutAct_9fa48("119907") ? false : stryMutAct_9fa48("119906") ? true : (stryCov_9fa48("119906", "119907", "119908"), (stryMutAct_9fa48("119910") ? this.migrationAutoWireEnabled || !this.migrationCoordinator : stryMutAct_9fa48("119909") ? true : (stryCov_9fa48("119909", "119910"), this.migrationAutoWireEnabled && (stryMutAct_9fa48("119911") ? this.migrationCoordinator : (stryCov_9fa48("119911"), !this.migrationCoordinator)))) && this.systemCache)) {
        if (stryMutAct_9fa48("119912")) {
          {}
        } else {
          stryCov_9fa48("119912");
          this.migrationCoordinator = new MigrationCoordinator(stryMutAct_9fa48("119913") ? {} : (stryCov_9fa48("119913"), {
            sqlCore: this,
            systemTableCache: this.systemCache,
            transactionCoordinator: this.transactionCoordinator,
            logger: this.logger,
            now: this.nowFn
          }));
        }
      }
      this.migrationPipeline = stryMutAct_9fa48("119916") ? options.migrationPipeline && null : stryMutAct_9fa48("119915") ? false : stryMutAct_9fa48("119914") ? true : (stryCov_9fa48("119914", "119915", "119916"), options.migrationPipeline || null);
      if (stryMutAct_9fa48("119919") ? this.migrationAutoWireEnabled && !this.migrationPipeline || this.migrationCoordinator : stryMutAct_9fa48("119918") ? false : stryMutAct_9fa48("119917") ? true : (stryCov_9fa48("119917", "119918", "119919"), (stryMutAct_9fa48("119921") ? this.migrationAutoWireEnabled || !this.migrationPipeline : stryMutAct_9fa48("119920") ? true : (stryCov_9fa48("119920", "119921"), this.migrationAutoWireEnabled && (stryMutAct_9fa48("119922") ? this.migrationPipeline : (stryCov_9fa48("119922"), !this.migrationPipeline)))) && this.migrationCoordinator)) {
        if (stryMutAct_9fa48("119923")) {
          {}
        } else {
          stryCov_9fa48("119923");
          this.migrationPipeline = new MigrationPipeline(stryMutAct_9fa48("119924") ? {} : (stryCov_9fa48("119924"), {
            migrationCoordinator: this.migrationCoordinator,
            logger: this.logger
          }));
        }
      }
      this.managedSplitWorkflow = stryMutAct_9fa48("119927") ? this.managedSplitWorkflow && new ManagedSplitWorkflow({
        nodeId: this.nodeId,
        topologyAdapter: new ManagedSplitTopologyAdapter({
          sqlQueryEngine: this
        })
      }) : stryMutAct_9fa48("119926") ? false : stryMutAct_9fa48("119925") ? true : (stryCov_9fa48("119925", "119926", "119927"), this.managedSplitWorkflow || new ManagedSplitWorkflow(stryMutAct_9fa48("119928") ? {} : (stryCov_9fa48("119928"), {
        nodeId: this.nodeId,
        topologyAdapter: new ManagedSplitTopologyAdapter(stryMutAct_9fa48("119929") ? {} : (stryCov_9fa48("119929"), {
          sqlQueryEngine: this
        }))
      })));

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.queryTimeoutMs = stryMutAct_9fa48("119932") ? config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) && QUERY_DEFAULTS.QUERY_TIMEOUT_MS : stryMutAct_9fa48("119931") ? false : stryMutAct_9fa48("119930") ? true : (stryCov_9fa48("119930", "119931", "119932"), config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) || QUERY_DEFAULTS.QUERY_TIMEOUT_MS);

      // Unified runtime ownership components (startup-wired).
      this.runtimeDriverRegistry = stryMutAct_9fa48("119935") ? options.runtimeDriverRegistry && null : stryMutAct_9fa48("119934") ? false : stryMutAct_9fa48("119933") ? true : (stryCov_9fa48("119933", "119934", "119935"), options.runtimeDriverRegistry || null);
      this.serviceRuntimeLifecycle = stryMutAct_9fa48("119938") ? options.serviceRuntimeLifecycle && null : stryMutAct_9fa48("119937") ? false : stryMutAct_9fa48("119936") ? true : (stryCov_9fa48("119936", "119937", "119938"), options.serviceRuntimeLifecycle || null);
      this.debugSessionResolver = stryMutAct_9fa48("119941") ? options.debugSessionResolver && null : stryMutAct_9fa48("119940") ? false : stryMutAct_9fa48("119939") ? true : (stryCov_9fa48("119939", "119940", "119941"), options.debugSessionResolver || null);
      this.traceCollector = stryMutAct_9fa48("119944") ? options.traceCollector && null : stryMutAct_9fa48("119943") ? false : stryMutAct_9fa48("119942") ? true : (stryCov_9fa48("119942", "119943", "119944"), options.traceCollector || null);
      this.wasmExecutor = stryMutAct_9fa48("119947") ? options.wasmExecutor && null : stryMutAct_9fa48("119946") ? false : stryMutAct_9fa48("119945") ? true : (stryCov_9fa48("119945", "119946", "119947"), options.wasmExecutor || null);

      // Wire query executor factory into lifecycle owner so service
      // replicas can query tables through the standard SQL path.
      this._wireQueryExecutorFactory(this.serviceRuntimeLifecycle);

      // Backward-compatible alias for callers/tests expecting transaction state map.
      this.activeTransactions = this.transactionCoordinator.transactionsBySession;
      this.transactionStateRecovered = stryMutAct_9fa48("119948") ? true : (stryCov_9fa48("119948"), false);
      this.transactionRecoveryReplayPromise = null;
      this.lastTransactionRecoveryReplayResult = createEmptyTransactionRecoveryReplaySummary();
      this.distributedTransactionRecoveryActivated = stryMutAct_9fa48("119951") ? options.autoStartDistributedTransactionRecovery === false : stryMutAct_9fa48("119950") ? false : stryMutAct_9fa48("119949") ? true : (stryCov_9fa48("119949", "119950", "119951"), options.autoStartDistributedTransactionRecovery !== (stryMutAct_9fa48("119952") ? true : (stryCov_9fa48("119952"), false)));
      if (stryMutAct_9fa48("119954") ? false : stryMutAct_9fa48("119953") ? true : (stryCov_9fa48("119953", "119954"), this.distributedTransactionRecoveryActivated)) {
        if (stryMutAct_9fa48("119955")) {
          {}
        } else {
          stryCov_9fa48("119955");
          void this.activateDistributedTransactionRecovery();
        }
      }
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("119956")) {
      {}
    } else {
      stryCov_9fa48("119956");
      try {
        if (stryMutAct_9fa48("119957")) {
          {}
        } else {
          stryCov_9fa48("119957");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("119959") ? false : stryMutAct_9fa48("119958") ? true : (stryCov_9fa48("119958", "119959"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("119960")) {
              {}
            } else {
              stryCov_9fa48("119960");
              return loggingService.forSubsystem(QUERY_SUBSYSTEM.SQL_QUERY_ENGINE);
            }
          }
        }
      } catch (logErr) {
        if (stryMutAct_9fa48("119961")) {
          {}
        } else {
          stryCov_9fa48("119961");
          console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED, logErr);
        }
      }
      return console;
    }
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    if (stryMutAct_9fa48("119962")) {
      {}
    } else {
      stryCov_9fa48("119962");
      this.systemCache = cache;
      this.partitionResolver.setSystemCache(cache);
      this.tableCreationService.setSystemCache(cache);
      this.queryExecutor.setSystemCache(cache);
      if (stryMutAct_9fa48("119964") ? false : stryMutAct_9fa48("119963") ? true : (stryCov_9fa48("119963", "119964"), this.migrationCoordinator)) {
        if (stryMutAct_9fa48("119965")) {
          {}
        } else {
          stryCov_9fa48("119965");
          this.migrationCoordinator.systemTableCache = cache;
        }
      } else if (stryMutAct_9fa48("119968") ? cache || this.migrationAutoWireEnabled : stryMutAct_9fa48("119967") ? false : stryMutAct_9fa48("119966") ? true : (stryCov_9fa48("119966", "119967", "119968"), cache && this.migrationAutoWireEnabled)) {
        if (stryMutAct_9fa48("119969")) {
          {}
        } else {
          stryCov_9fa48("119969");
          this.migrationCoordinator = new MigrationCoordinator(stryMutAct_9fa48("119970") ? {} : (stryCov_9fa48("119970"), {
            sqlCore: this,
            systemTableCache: cache,
            transactionCoordinator: this.transactionCoordinator,
            logger: this.logger,
            now: this.nowFn
          }));
          if (stryMutAct_9fa48("119973") ? false : stryMutAct_9fa48("119972") ? true : stryMutAct_9fa48("119971") ? this.migrationPipeline : (stryCov_9fa48("119971", "119972", "119973"), !this.migrationPipeline)) {
            if (stryMutAct_9fa48("119974")) {
              {}
            } else {
              stryCov_9fa48("119974");
              this.migrationPipeline = new MigrationPipeline(stryMutAct_9fa48("119975") ? {} : (stryCov_9fa48("119975"), {
                migrationCoordinator: this.migrationCoordinator,
                logger: this.logger
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("119977") ? false : stryMutAct_9fa48("119976") ? true : (stryCov_9fa48("119976", "119977"), this.distributedTransactionRecoveryActivated)) {
        if (stryMutAct_9fa48("119978")) {
          {}
        } else {
          stryCov_9fa48("119978");
          void this.activateDistributedTransactionRecovery(stryMutAct_9fa48("119979") ? {} : (stryCov_9fa48("119979"), {
            resetRecoveryState: stryMutAct_9fa48("119980") ? false : (stryCov_9fa48("119980"), true)
          }));
        }
      }
    }
  }

  /**
   * Activate distributed transaction recovery replay and periodic sweeps.
   * Joining nodes use this to defer replay until the READY cutover completes.
   *
   * @param {Object} [options]
   * @param {boolean} [options.resetRecoveryState=true] - When true, reload the
   *   recovered coordinator view from the latest system-cache snapshot.
   * @return {Promise<Object>} Replay summary.
   */
  activateDistributedTransactionRecovery(options = {}) {
    if (stryMutAct_9fa48("119981")) {
      {}
    } else {
      stryCov_9fa48("119981");
      this.distributedTransactionRecoveryActivated = stryMutAct_9fa48("119982") ? false : (stryCov_9fa48("119982"), true);
      const resetRecoveryState = stryMutAct_9fa48("119985") ? options.resetRecoveryState === false : stryMutAct_9fa48("119984") ? false : stryMutAct_9fa48("119983") ? true : (stryCov_9fa48("119983", "119984", "119985"), options.resetRecoveryState !== (stryMutAct_9fa48("119986") ? true : (stryCov_9fa48("119986"), false)));
      if (stryMutAct_9fa48("119988") ? false : stryMutAct_9fa48("119987") ? true : (stryCov_9fa48("119987", "119988"), resetRecoveryState)) {
        if (stryMutAct_9fa48("119989")) {
          {}
        } else {
          stryCov_9fa48("119989");
          this.transactionStateRecovered = stryMutAct_9fa48("119990") ? true : (stryCov_9fa48("119990"), false);
        }
      }
      this.recoverDistributedTransactionStateFromCache();
      const replayPromise = this.resumeRecoveredDistributedTransactions();
      if (stryMutAct_9fa48("119993") ? typeof this.transactionCoordinator.startRecoverySweep !== 'function' : stryMutAct_9fa48("119992") ? false : stryMutAct_9fa48("119991") ? true : (stryCov_9fa48("119991", "119992", "119993"), typeof this.transactionCoordinator.startRecoverySweep === (stryMutAct_9fa48("119994") ? "" : (stryCov_9fa48("119994"), 'function')))) {
        if (stryMutAct_9fa48("119995")) {
          {}
        } else {
          stryCov_9fa48("119995");
          this.transactionCoordinator.startRecoverySweep();
        }
      }
      return replayPromise;
    }
  }

  /**
   * Set the message router for query routing.
   * @param {Object} router - Message router instance.
   */
  setMessageRouter(router) {
    if (stryMutAct_9fa48("119996")) {
      {}
    } else {
      stryCov_9fa48("119996");
      this.messageRouter = router;
      this.queryExecutor.setMessageRouter(router);
    }
  }

  /**
   * Set canonical readiness owner used for serve-routing decisions.
   * @param {Object|null} readinessService
   */
  setControlPlaneReadinessService(readinessService) {
    if (stryMutAct_9fa48("119997")) {
      {}
    } else {
      stryCov_9fa48("119997");
      this.controlPlaneReadinessService = stryMutAct_9fa48("120000") ? readinessService && null : stryMutAct_9fa48("119999") ? false : stryMutAct_9fa48("119998") ? true : (stryCov_9fa48("119998", "119999", "120000"), readinessService || null);
      this.queryExecutor.setControlPlaneReadinessService(this.controlPlaneReadinessService);
    }
  }

  /**
   * Set the default readiness dimension used for routed partition work.
   * @param {string} readinessDimension
   */
  setDefaultRoutingReadinessDimension(readinessDimension) {
    if (stryMutAct_9fa48("120001")) {
      {}
    } else {
      stryCov_9fa48("120001");
      this.defaultRoutingReadinessDimension = stryMutAct_9fa48("120004") ? readinessDimension && CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE : stryMutAct_9fa48("120003") ? false : stryMutAct_9fa48("120002") ? true : (stryCov_9fa48("120002", "120003", "120004"), readinessDimension || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE);
      this.queryExecutor.setDefaultRoutingReadinessDimension(this.defaultRoutingReadinessDimension);
    }
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    if (stryMutAct_9fa48("120005")) {
      {}
    } else {
      stryCov_9fa48("120005");
      this.cdcIntegrationService = service;
      this.tableCreationService.setCDCIntegrationService(service);
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("120006")) {
      {}
    } else {
      stryCov_9fa48("120006");
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Set rebalance coordinator used for table partition provisioning.
   * @param {Object} coordinator - RebalanceCoordinator instance.
   */
  setRebalanceCoordinator(coordinator) {
    if (stryMutAct_9fa48("120007")) {
      {}
    } else {
      stryCov_9fa48("120007");
      this.rebalanceCoordinator = stryMutAct_9fa48("120010") ? coordinator && null : stryMutAct_9fa48("120009") ? false : stryMutAct_9fa48("120008") ? true : (stryCov_9fa48("120008", "120009", "120010"), coordinator || null);
      if (stryMutAct_9fa48("120013") ? this.rebalanceCoordinator.controlPlaneReadinessService : stryMutAct_9fa48("120012") ? false : stryMutAct_9fa48("120011") ? true : (stryCov_9fa48("120011", "120012", "120013"), this.rebalanceCoordinator?.controlPlaneReadinessService)) {
        if (stryMutAct_9fa48("120014")) {
          {}
        } else {
          stryCov_9fa48("120014");
          this.setControlPlaneReadinessService(this.rebalanceCoordinator.controlPlaneReadinessService);
        }
      }
    }
  }

  /**
   * Set initial table partition provisioner callback.
   * @param {Function} provisioner - Provisioning callback.
   */
  setTablePartitionProvisioner(provisioner) {
    if (stryMutAct_9fa48("120015")) {
      {}
    } else {
      stryCov_9fa48("120015");
      this.tableCreationService.setPartitionProvisioner(provisioner);
    }
  }

  /**
   * Set partition split/merge manager integration owner.
   * @param {Object} manager - PartitionSplitMergeManager instance.
   */
  setPartitionSplitMergeManager(manager) {
    if (stryMutAct_9fa48("120016")) {
      {}
    } else {
      stryCov_9fa48("120016");
      this.partitionSplitMergeManager = stryMutAct_9fa48("120019") ? manager && null : stryMutAct_9fa48("120018") ? false : stryMutAct_9fa48("120017") ? true : (stryCov_9fa48("120017", "120018", "120019"), manager || null);
      this.tableCreationService.setPartitionSplitMergeManager(manager);
    }
  }

  /**
   * Set schema migration pipeline.
   * @param {Object|null} pipeline - Migration pipeline adapter.
   */
  setMigrationPipeline(pipeline) {
    if (stryMutAct_9fa48("120020")) {
      {}
    } else {
      stryCov_9fa48("120020");
      this.migrationPipeline = stryMutAct_9fa48("120023") ? pipeline && null : stryMutAct_9fa48("120022") ? false : stryMutAct_9fa48("120021") ? true : (stryCov_9fa48("120021", "120022", "120023"), pipeline || null);
    }
  }

  /**
   * Set schema migration coordinator owner.
   * @param {Object|null} coordinator - Migration coordinator owner.
   */
  setMigrationCoordinator(coordinator) {
    if (stryMutAct_9fa48("120024")) {
      {}
    } else {
      stryCov_9fa48("120024");
      this.migrationCoordinator = stryMutAct_9fa48("120027") ? coordinator && null : stryMutAct_9fa48("120026") ? false : stryMutAct_9fa48("120025") ? true : (stryCov_9fa48("120025", "120026", "120027"), coordinator || null);
      if (stryMutAct_9fa48("120030") ? !this.migrationPipeline && this.migrationAutoWireEnabled || this.migrationCoordinator : stryMutAct_9fa48("120029") ? false : stryMutAct_9fa48("120028") ? true : (stryCov_9fa48("120028", "120029", "120030"), (stryMutAct_9fa48("120032") ? !this.migrationPipeline || this.migrationAutoWireEnabled : stryMutAct_9fa48("120031") ? true : (stryCov_9fa48("120031", "120032"), (stryMutAct_9fa48("120033") ? this.migrationPipeline : (stryCov_9fa48("120033"), !this.migrationPipeline)) && this.migrationAutoWireEnabled)) && this.migrationCoordinator)) {
        if (stryMutAct_9fa48("120034")) {
          {}
        } else {
          stryCov_9fa48("120034");
          this.migrationPipeline = new MigrationPipeline(stryMutAct_9fa48("120035") ? {} : (stryCov_9fa48("120035"), {
            migrationCoordinator: this.migrationCoordinator,
            logger: this.logger
          }));
        }
      }
    }
  }

  /**
   * Shutdown lifecycle-owned query services.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("120036")) {
      {}
    } else {
      stryCov_9fa48("120036");
      if (stryMutAct_9fa48("120039") ? this.transactionCoordinator || typeof this.transactionCoordinator.stopRecoverySweep === 'function' : stryMutAct_9fa48("120038") ? false : stryMutAct_9fa48("120037") ? true : (stryCov_9fa48("120037", "120038", "120039"), this.transactionCoordinator && (stryMutAct_9fa48("120041") ? typeof this.transactionCoordinator.stopRecoverySweep !== 'function' : stryMutAct_9fa48("120040") ? true : (stryCov_9fa48("120040", "120041"), typeof this.transactionCoordinator.stopRecoverySweep === (stryMutAct_9fa48("120042") ? "" : (stryCov_9fa48("120042"), 'function')))))) {
        if (stryMutAct_9fa48("120043")) {
          {}
        } else {
          stryCov_9fa48("120043");
          this.transactionCoordinator.stopRecoverySweep();
        }
      }
      if (stryMutAct_9fa48("120046") ? this.tableCreationService || typeof this.tableCreationService.shutdown === 'function' : stryMutAct_9fa48("120045") ? false : stryMutAct_9fa48("120044") ? true : (stryCov_9fa48("120044", "120045", "120046"), this.tableCreationService && (stryMutAct_9fa48("120048") ? typeof this.tableCreationService.shutdown !== 'function' : stryMutAct_9fa48("120047") ? true : (stryCov_9fa48("120047", "120048"), typeof this.tableCreationService.shutdown === (stryMutAct_9fa48("120049") ? "" : (stryCov_9fa48("120049"), 'function')))))) {
        if (stryMutAct_9fa48("120050")) {
          {}
        } else {
          stryCov_9fa48("120050");
          await this.tableCreationService.shutdown();
        }
      }
    }
  }

  /**
   * Set runtime driver registry.
   * @param {Object} registry - Runtime driver registry.
   */
  setRuntimeDriverRegistry(registry) {
    if (stryMutAct_9fa48("120051")) {
      {}
    } else {
      stryCov_9fa48("120051");
      this.runtimeDriverRegistry = registry;
    }
  }

  /**
   * Set unified runtime lifecycle owner.
   * @param {Object} lifecycle - Service runtime lifecycle.
   */
  setServiceRuntimeLifecycle(lifecycle) {
    if (stryMutAct_9fa48("120052")) {
      {}
    } else {
      stryCov_9fa48("120052");
      this.serviceRuntimeLifecycle = lifecycle;
      this._wireQueryExecutorFactory(lifecycle);
    }
  }

  /**
   * Wire a service-scoped query executor factory into the
   * lifecycle owner so service replicas can query tables
   * through the standard SQL execution path.
   *
   * The factory produces closures that call executeQuery
   * with a session scoped to the service identity.
   *
   * @param {Object} lifecycle - Service runtime lifecycle.
   * @private
   */
  _wireQueryExecutorFactory(lifecycle) {
    if (stryMutAct_9fa48("120053")) {
      {}
    } else {
      stryCov_9fa48("120053");
      if (stryMutAct_9fa48("120056") ? !lifecycle && typeof lifecycle.setQueryExecutorFactory !== 'function' : stryMutAct_9fa48("120055") ? false : stryMutAct_9fa48("120054") ? true : (stryCov_9fa48("120054", "120055", "120056"), (stryMutAct_9fa48("120057") ? lifecycle : (stryCov_9fa48("120057"), !lifecycle)) || (stryMutAct_9fa48("120059") ? typeof lifecycle.setQueryExecutorFactory === 'function' : stryMutAct_9fa48("120058") ? false : (stryCov_9fa48("120058", "120059"), typeof lifecycle.setQueryExecutorFactory !== (stryMutAct_9fa48("120060") ? "" : (stryCov_9fa48("120060"), 'function')))))) {
        if (stryMutAct_9fa48("120061")) {
          {}
        } else {
          stryCov_9fa48("120061");
          return;
        }
      }
      lifecycle.setQueryExecutorFactory(stryMutAct_9fa48("120062") ? () => undefined : (stryCov_9fa48("120062"), serviceId => stryMutAct_9fa48("120063") ? () => undefined : (stryCov_9fa48("120063"), async (sql, params) => this.executeQuery(sql, params, stryMutAct_9fa48("120064") ? {} : (stryCov_9fa48("120064"), {
        sessionId: serviceId
      })))));
    }
  }

  /**
   * Set debug session resolver for callback trace gating.
   * @param {Object} resolver
   */
  setDebugSessionResolver(resolver) {
    if (stryMutAct_9fa48("120065")) {
      {}
    } else {
      stryCov_9fa48("120065");
      this.debugSessionResolver = resolver;
    }
  }

  /**
   * Set trace collector for callback trace streaming.
   * @param {Object} collector
   */
  setTraceCollector(collector) {
    if (stryMutAct_9fa48("120066")) {
      {}
    } else {
      stryCov_9fa48("120066");
      this.traceCollector = collector;
    }
  }

  /**
   * Set wasm executor used by wasm_component callbacks.
   * @param {Object} wasmExecutor - WasmExecutor instance.
   */
  setWasmExecutor(wasmExecutor) {
    if (stryMutAct_9fa48("120067")) {
      {}
    } else {
      stryCov_9fa48("120067");
      this.wasmExecutor = stryMutAct_9fa48("120070") ? wasmExecutor && null : stryMutAct_9fa48("120069") ? false : stryMutAct_9fa48("120068") ? true : (stryCov_9fa48("120068", "120069", "120070"), wasmExecutor || null);
    }
  }

  /**
   * Execute a canonical SqlRequest with execution-mode dispatch.
   *
   * This is the single owning dispatch entrypoint for
   * execution-mode behavior. All adapters (internal, protocol,
   * WASM) should converge here.
   *
   * Requirements: 1.1, 13.1
   * @param {Readonly<Object>} sqlRequest - Frozen SqlRequest object.
   * @return {Promise<Object>} Execution result.
   */
  async executeRequest(sqlRequest) {
    if (stryMutAct_9fa48("120071")) {
      {}
    } else {
      stryCov_9fa48("120071");
      if (stryMutAct_9fa48("120074") ? false : stryMutAct_9fa48("120073") ? true : stryMutAct_9fa48("120072") ? isSqlRequest(sqlRequest) : (stryCov_9fa48("120072", "120073", "120074"), !isSqlRequest(sqlRequest))) {
        if (stryMutAct_9fa48("120075")) {
          {}
        } else {
          stryCov_9fa48("120075");
          throw new Error(ADAPTER_ERROR_MSG.INVALID_SQL_REQUEST);
        }
      }
      const {
        executionMode,
        statement,
        parameters,
        sessionId
      } = sqlRequest;
      this.logger.debug(ADAPTER_LOG_MSG.EXECUTE_REQUEST_START, stryMutAct_9fa48("120076") ? {} : (stryCov_9fa48("120076"), {
        executionMode,
        statement: stryMutAct_9fa48("120077") ? statement : (stryCov_9fa48("120077"), statement.substring(0, 100)),
        sessionId
      }));
      const dispatchStartMs = Date.now();
      try {
        if (stryMutAct_9fa48("120078")) {
          {}
        } else {
          stryCov_9fa48("120078");
          let result;
          switch (executionMode) {
            case EXECUTION_MODE.SQL_STATEMENT:
              if (stryMutAct_9fa48("120079")) {} else {
                stryCov_9fa48("120079");
                result = await this.executeQuery(statement, parameters, stryMutAct_9fa48("120080") ? {} : (stryCov_9fa48("120080"), {
                  sessionId,
                  dialect: sqlRequest.dialect,
                  timeoutMs: sqlRequest.timeoutMs,
                  cancellationToken: stryMutAct_9fa48("120083") ? sqlRequest.cancellationToken && null : stryMutAct_9fa48("120082") ? false : stryMutAct_9fa48("120081") ? true : (stryCov_9fa48("120081", "120082", "120083"), sqlRequest.cancellationToken || null)
                }));
                break;
              }
            case EXECUTION_MODE.PARTITION_CALLBACK:
              if (stryMutAct_9fa48("120084")) {} else {
                stryCov_9fa48("120084");
                result = await this.executePartitionCallback(sqlRequest);
                break;
              }
            case EXECUTION_MODE.STAGE:
              if (stryMutAct_9fa48("120085")) {} else {
                stryCov_9fa48("120085");
                result = await this.executeStageRequest(sqlRequest);
                break;
              }
            case EXECUTION_MODE.PLAN:
              if (stryMutAct_9fa48("120086")) {} else {
                stryCov_9fa48("120086");
                result = await this.executePlanRequest(sqlRequest);
                break;
              }
            default:
              if (stryMutAct_9fa48("120087")) {} else {
                stryCov_9fa48("120087");
                throw new Error(stryMutAct_9fa48("120088") ? `` : (stryCov_9fa48("120088"), `${ADAPTER_ERROR_MSG.UNSUPPORTED_EXECUTION_MODE}${executionMode}`));
              }
          }
          this.logger.debug(ADAPTER_LOG_MSG.EXECUTE_REQUEST_COMPLETE, stryMutAct_9fa48("120089") ? {} : (stryCov_9fa48("120089"), {
            executionMode,
            success: result.success
          }));
          try {
            if (stryMutAct_9fa48("120090")) {
              {}
            } else {
              stryCov_9fa48("120090");
              this.logger.info(METRICS_LOG_TAG.QUERY_DISPATCH, stryMutAct_9fa48("120091") ? {} : (stryCov_9fa48("120091"), {
                executionMode,
                totalDurationMs: stryMutAct_9fa48("120092") ? Date.now() + dispatchStartMs : (stryCov_9fa48("120092"), Date.now() - dispatchStartMs),
                success: stryMutAct_9fa48("120093") ? result?.success && false : (stryCov_9fa48("120093"), (stryMutAct_9fa48("120094") ? result.success : (stryCov_9fa48("120094"), result?.success)) ?? (stryMutAct_9fa48("120095") ? true : (stryCov_9fa48("120095"), false))),
                sessionId
              }));
            }
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("120096")) {
          {}
        } else {
          stryCov_9fa48("120096");
          try {
            if (stryMutAct_9fa48("120097")) {
              {}
            } else {
              stryCov_9fa48("120097");
              this.logger.info(METRICS_LOG_TAG.QUERY_DISPATCH, stryMutAct_9fa48("120098") ? {} : (stryCov_9fa48("120098"), {
                executionMode,
                totalDurationMs: stryMutAct_9fa48("120099") ? Date.now() + dispatchStartMs : (stryCov_9fa48("120099"), Date.now() - dispatchStartMs),
                success: stryMutAct_9fa48("120100") ? true : (stryCov_9fa48("120100"), false),
                sessionId
              }));
            }
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }
          this.logger.error(ADAPTER_LOG_MSG.EXECUTE_REQUEST_FAILED, stryMutAct_9fa48("120101") ? {} : (stryCov_9fa48("120101"), {
            executionMode,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Execute a partition_callback request through a dedicated path.
   *
   * This is the single dispatch target for partition_callback mode.
   * It validates callback-specific fields, resolves target partitions
   * from the select query, and will delegate to
   * Callback_Execution_Host for per-partition batch invocation
   * (wired in subsequent tasks).
   *
   * Requirements: 13.1, 14.1
   * @param {Readonly<Object>} sqlRequest - Frozen SqlRequest object.
   * @return {Promise<Object>} Execution result.
   */
  async executePartitionCallback(sqlRequest) {
    if (stryMutAct_9fa48("120102")) {
      {}
    } else {
      stryCov_9fa48("120102");
      const {
        statement,
        callbackModuleRef,
        callbackExport,
        runtimeKind,
        sessionId
      } = sqlRequest;
      if (stryMutAct_9fa48("120105") ? !callbackModuleRef && !callbackExport : stryMutAct_9fa48("120104") ? false : stryMutAct_9fa48("120103") ? true : (stryCov_9fa48("120103", "120104", "120105"), (stryMutAct_9fa48("120106") ? callbackModuleRef : (stryCov_9fa48("120106"), !callbackModuleRef)) || (stryMutAct_9fa48("120107") ? callbackExport : (stryCov_9fa48("120107"), !callbackExport)))) {
        if (stryMutAct_9fa48("120108")) {
          {}
        } else {
          stryCov_9fa48("120108");
          throw new Error(ADAPTER_ERROR_MSG.PARTITION_CALLBACK_MISSING_FIELDS);
        }
      }
      if (stryMutAct_9fa48("120111") ? false : stryMutAct_9fa48("120110") ? true : stryMutAct_9fa48("120109") ? runtimeKind : (stryCov_9fa48("120109", "120110", "120111"), !runtimeKind)) {
        if (stryMutAct_9fa48("120112")) {
          {}
        } else {
          stryCov_9fa48("120112");
          throw new Error(ADAPTER_ERROR_MSG.PARTITION_CALLBACK_RUNTIME_KIND_REQUIRED);
        }
      }
      this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_DISPATCH, stryMutAct_9fa48("120113") ? {} : (stryCov_9fa48("120113"), {
        statement: stryMutAct_9fa48("120114") ? statement : (stryCov_9fa48("120114"), statement.substring(0, 100)),
        callbackModuleRef,
        callbackExport,
        sessionId
      }));

      // 1. Resolve target partitions and construct per-partition
      // batches via the single planner path.
      const dispatchResult = await this.partitionCallbackDispatcher.dispatch(sqlRequest);

      // 2. Route batches through the single
      // Callback_Execution_Host contract. No parallel
      // callback executor path is allowed.
      const descriptor = stryMutAct_9fa48("120115") ? {} : (stryCov_9fa48("120115"), {
        callbackModuleRef: dispatchResult.callbackModuleRef,
        callbackExport: dispatchResult.callbackExport,
        runtimeKind
      });
      const executionContext = this.createRequestExecutionContext(sqlRequest);
      const handler = await this.resolvePartitionCallbackHandler(sqlRequest, executionContext);
      const wasmExecutor = stryMutAct_9fa48("120118") ? (sqlRequest.wasmExecutor || this.wasmExecutor) && null : stryMutAct_9fa48("120117") ? false : stryMutAct_9fa48("120116") ? true : (stryCov_9fa48("120116", "120117", "120118"), (stryMutAct_9fa48("120120") ? sqlRequest.wasmExecutor && this.wasmExecutor : stryMutAct_9fa48("120119") ? false : (stryCov_9fa48("120119", "120120"), sqlRequest.wasmExecutor || this.wasmExecutor)) || null);
      if (stryMutAct_9fa48("120123") ? runtimeKind !== CALLBACK_RUNTIME_KIND.WASM_COMPONENT : stryMutAct_9fa48("120122") ? false : stryMutAct_9fa48("120121") ? true : (stryCov_9fa48("120121", "120122", "120123"), runtimeKind === CALLBACK_RUNTIME_KIND.WASM_COMPONENT)) {
        if (stryMutAct_9fa48("120124")) {
          {}
        } else {
          stryCov_9fa48("120124");
          if (stryMutAct_9fa48("120127") ? false : stryMutAct_9fa48("120126") ? true : stryMutAct_9fa48("120125") ? wasmExecutor : (stryCov_9fa48("120125", "120126", "120127"), !wasmExecutor)) {
            if (stryMutAct_9fa48("120128")) {
              {}
            } else {
              stryCov_9fa48("120128");
              throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_EXECUTOR_REQUIRED);
            }
          }
          await this.ensureWasmCallbackModuleLoaded(sqlRequest, wasmExecutor);
        }
      }

      // 3. Create callback runtime selector as a strict
      // adapter over unified runtime selection ownership.
      const unifiedRuntimeRegistry = stryMutAct_9fa48("120131") ? (sqlRequest.runtimeDriverRegistry || this.runtimeDriverRegistry) && null : stryMutAct_9fa48("120130") ? false : stryMutAct_9fa48("120129") ? true : (stryCov_9fa48("120129", "120130", "120131"), (stryMutAct_9fa48("120133") ? sqlRequest.runtimeDriverRegistry && this.runtimeDriverRegistry : stryMutAct_9fa48("120132") ? false : (stryCov_9fa48("120132", "120133"), sqlRequest.runtimeDriverRegistry || this.runtimeDriverRegistry)) || null);
      if (stryMutAct_9fa48("120136") ? !sqlRequest.callbackRuntimeDriverRegistry || !unifiedRuntimeRegistry : stryMutAct_9fa48("120135") ? false : stryMutAct_9fa48("120134") ? true : (stryCov_9fa48("120134", "120135", "120136"), (stryMutAct_9fa48("120137") ? sqlRequest.callbackRuntimeDriverRegistry : (stryCov_9fa48("120137"), !sqlRequest.callbackRuntimeDriverRegistry)) && (stryMutAct_9fa48("120138") ? unifiedRuntimeRegistry : (stryCov_9fa48("120138"), !unifiedRuntimeRegistry)))) {
        if (stryMutAct_9fa48("120139")) {
          {}
        } else {
          stryCov_9fa48("120139");
          throw new Error(ADAPTER_ERROR_MSG.CALLBACK_RUNTIME_REGISTRY_REQUIRED);
        }
      }
      const callbackRuntimeRegistry = stryMutAct_9fa48("120142") ? sqlRequest.callbackRuntimeDriverRegistry && createCallbackDriverRegistry({
        runtimeDriverRegistry: unifiedRuntimeRegistry,
        wasmExecutor,
        ociFeatureGateEnabled: Boolean(sqlRequest.ociFeatureGateEnabled)
      }) : stryMutAct_9fa48("120141") ? false : stryMutAct_9fa48("120140") ? true : (stryCov_9fa48("120140", "120141", "120142"), sqlRequest.callbackRuntimeDriverRegistry || createCallbackDriverRegistry(stryMutAct_9fa48("120143") ? {} : (stryCov_9fa48("120143"), {
        runtimeDriverRegistry: unifiedRuntimeRegistry,
        wasmExecutor,
        ociFeatureGateEnabled: Boolean(sqlRequest.ociFeatureGateEnabled)
      })));
      if (stryMutAct_9fa48("120146") ? typeof callbackRuntimeRegistry.hasRuntimeDriverRegistry !== 'function' && !callbackRuntimeRegistry.hasRuntimeDriverRegistry() : stryMutAct_9fa48("120145") ? false : stryMutAct_9fa48("120144") ? true : (stryCov_9fa48("120144", "120145", "120146"), (stryMutAct_9fa48("120148") ? typeof callbackRuntimeRegistry.hasRuntimeDriverRegistry === 'function' : stryMutAct_9fa48("120147") ? false : (stryCov_9fa48("120147", "120148"), typeof callbackRuntimeRegistry.hasRuntimeDriverRegistry !== (stryMutAct_9fa48("120149") ? "" : (stryCov_9fa48("120149"), 'function')))) || (stryMutAct_9fa48("120150") ? callbackRuntimeRegistry.hasRuntimeDriverRegistry() : (stryCov_9fa48("120150"), !callbackRuntimeRegistry.hasRuntimeDriverRegistry())))) {
        if (stryMutAct_9fa48("120151")) {
          {}
        } else {
          stryCov_9fa48("120151");
          throw new Error(ADAPTER_ERROR_MSG.CALLBACK_RUNTIME_REGISTRY_REQUIRED);
        }
      }
      const host = new CallbackExecutionHost(stryMutAct_9fa48("120152") ? {} : (stryCov_9fa48("120152"), {
        budgetEnforcer: stryMutAct_9fa48("120155") ? sqlRequest.budgetEnforcer && null : stryMutAct_9fa48("120154") ? false : stryMutAct_9fa48("120153") ? true : (stryCov_9fa48("120153", "120154", "120155"), sqlRequest.budgetEnforcer || null),
        lineageTracker: stryMutAct_9fa48("120158") ? sqlRequest.lineageTracker && null : stryMutAct_9fa48("120157") ? false : stryMutAct_9fa48("120156") ? true : (stryCov_9fa48("120156", "120157", "120158"), sqlRequest.lineageTracker || null),
        dedupeRegistry: stryMutAct_9fa48("120161") ? sqlRequest.dedupeRegistry && null : stryMutAct_9fa48("120160") ? false : stryMutAct_9fa48("120159") ? true : (stryCov_9fa48("120159", "120160", "120161"), sqlRequest.dedupeRegistry || null),
        cancellationToken: stryMutAct_9fa48("120164") ? sqlRequest.cancellationToken && null : stryMutAct_9fa48("120163") ? false : stryMutAct_9fa48("120162") ? true : (stryCov_9fa48("120162", "120163", "120164"), sqlRequest.cancellationToken || null),
        stageIndex: stryMutAct_9fa48("120167") ? sqlRequest.stageIndex && 0 : stryMutAct_9fa48("120166") ? false : stryMutAct_9fa48("120165") ? true : (stryCov_9fa48("120165", "120166", "120167"), sqlRequest.stageIndex || 0),
        runtimeDriverRegistry: callbackRuntimeRegistry,
        executionContext,
        planDiagnostics: executionContext.getPlanDiagnostics(),
        debugSessionResolver: stryMutAct_9fa48("120170") ? (sqlRequest.debugSessionResolver || this.debugSessionResolver) && null : stryMutAct_9fa48("120169") ? false : stryMutAct_9fa48("120168") ? true : (stryCov_9fa48("120168", "120169", "120170"), (stryMutAct_9fa48("120172") ? sqlRequest.debugSessionResolver && this.debugSessionResolver : stryMutAct_9fa48("120171") ? false : (stryCov_9fa48("120171", "120172"), sqlRequest.debugSessionResolver || this.debugSessionResolver)) || null),
        traceCollector: stryMutAct_9fa48("120175") ? (sqlRequest.traceCollector || this.traceCollector) && null : stryMutAct_9fa48("120174") ? false : stryMutAct_9fa48("120173") ? true : (stryCov_9fa48("120173", "120174", "120175"), (stryMutAct_9fa48("120177") ? sqlRequest.traceCollector && this.traceCollector : stryMutAct_9fa48("120176") ? false : (stryCov_9fa48("120176", "120177"), sqlRequest.traceCollector || this.traceCollector)) || null),
        nodeId: stryMutAct_9fa48("120180") ? (sqlRequest.nodeId || this.nodeId) && null : stryMutAct_9fa48("120179") ? false : stryMutAct_9fa48("120178") ? true : (stryCov_9fa48("120178", "120179", "120180"), (stryMutAct_9fa48("120182") ? sqlRequest.nodeId && this.nodeId : stryMutAct_9fa48("120181") ? false : (stryCov_9fa48("120181", "120182"), sqlRequest.nodeId || this.nodeId)) || null),
        serviceDefinitionId: stryMutAct_9fa48("120185") ? (sqlRequest.serviceDefinitionId || callbackModuleRef) && null : stryMutAct_9fa48("120184") ? false : stryMutAct_9fa48("120183") ? true : (stryCov_9fa48("120183", "120184", "120185"), (stryMutAct_9fa48("120187") ? sqlRequest.serviceDefinitionId && callbackModuleRef : stryMutAct_9fa48("120186") ? false : (stryCov_9fa48("120186", "120187"), sqlRequest.serviceDefinitionId || callbackModuleRef)) || null),
        replicaId: stryMutAct_9fa48("120190") ? sqlRequest.replicaId && null : stryMutAct_9fa48("120189") ? false : stryMutAct_9fa48("120188") ? true : (stryCov_9fa48("120188", "120189", "120190"), sqlRequest.replicaId || null)
      }));
      const hostResult = await host.execute(dispatchResult.batches, descriptor, stryMutAct_9fa48("120191") ? {} : (stryCov_9fa48("120191"), {
        handler,
        serviceDefinitionId: stryMutAct_9fa48("120194") ? (sqlRequest.serviceDefinitionId || callbackModuleRef) && null : stryMutAct_9fa48("120193") ? false : stryMutAct_9fa48("120192") ? true : (stryCov_9fa48("120192", "120193", "120194"), (stryMutAct_9fa48("120196") ? sqlRequest.serviceDefinitionId && callbackModuleRef : stryMutAct_9fa48("120195") ? false : (stryCov_9fa48("120195", "120196"), sqlRequest.serviceDefinitionId || callbackModuleRef)) || null),
        nodeId: stryMutAct_9fa48("120199") ? (sqlRequest.nodeId || this.nodeId) && null : stryMutAct_9fa48("120198") ? false : stryMutAct_9fa48("120197") ? true : (stryCov_9fa48("120197", "120198", "120199"), (stryMutAct_9fa48("120201") ? sqlRequest.nodeId && this.nodeId : stryMutAct_9fa48("120200") ? false : (stryCov_9fa48("120200", "120201"), sqlRequest.nodeId || this.nodeId)) || null),
        replicaId: stryMutAct_9fa48("120204") ? sqlRequest.replicaId && null : stryMutAct_9fa48("120203") ? false : stryMutAct_9fa48("120202") ? true : (stryCov_9fa48("120202", "120203", "120204"), sqlRequest.replicaId || null)
      }));
      this.logger.debug(ADAPTER_LOG_MSG.PARTITION_CALLBACK_COMPLETE, stryMutAct_9fa48("120205") ? {} : (stryCov_9fa48("120205"), {
        success: stryMutAct_9fa48("120208") ? hostResult.state !== 'completed' : stryMutAct_9fa48("120207") ? false : stryMutAct_9fa48("120206") ? true : (stryCov_9fa48("120206", "120207", "120208"), hostResult.state === (stryMutAct_9fa48("120209") ? "" : (stryCov_9fa48("120209"), 'completed'))),
        batchCount: dispatchResult.batches.length,
        processedPartitions: hostResult.processedPartitions,
        callbackModuleRef,
        callbackExport
      }));
      return stryMutAct_9fa48("120210") ? {} : (stryCov_9fa48("120210"), {
        success: stryMutAct_9fa48("120213") ? hostResult.state === 'completed' && hostResult.state === 'failed' : stryMutAct_9fa48("120212") ? false : stryMutAct_9fa48("120211") ? true : (stryCov_9fa48("120211", "120212", "120213"), (stryMutAct_9fa48("120215") ? hostResult.state !== 'completed' : stryMutAct_9fa48("120214") ? false : (stryCov_9fa48("120214", "120215"), hostResult.state === (stryMutAct_9fa48("120216") ? "" : (stryCov_9fa48("120216"), 'completed')))) || (stryMutAct_9fa48("120218") ? hostResult.state !== 'failed' : stryMutAct_9fa48("120217") ? false : (stryCov_9fa48("120217", "120218"), hostResult.state === (stryMutAct_9fa48("120219") ? "" : (stryCov_9fa48("120219"), 'failed'))))),
        batches: dispatchResult.batches,
        callbackModuleRef,
        callbackExport,
        executionMode: EXECUTION_MODE.PARTITION_CALLBACK,
        hostResult
      });
    }
  }

  /**
   * Resolve callback handler for partition_callback execution.
   *
   * For native_js runtime, handler can be passed directly on the
   * request or resolved from the `code` table by callbackModuleRef.
   *
   * @param {Readonly<Object>} sqlRequest
   * @param {ExecutionContext} executionContext
   * @return {Promise<Function|null>}
   * @private
   */
  async resolvePartitionCallbackHandler(sqlRequest, executionContext) {
    if (stryMutAct_9fa48("120220")) {
      {}
    } else {
      stryCov_9fa48("120220");
      if (stryMutAct_9fa48("120223") ? typeof sqlRequest.handler !== 'function' : stryMutAct_9fa48("120222") ? false : stryMutAct_9fa48("120221") ? true : (stryCov_9fa48("120221", "120222", "120223"), typeof sqlRequest.handler === (stryMutAct_9fa48("120224") ? "" : (stryCov_9fa48("120224"), 'function')))) {
        if (stryMutAct_9fa48("120225")) {
          {}
        } else {
          stryCov_9fa48("120225");
          return sqlRequest.handler;
        }
      }
      if (stryMutAct_9fa48("120228") ? sqlRequest.runtimeKind === CALLBACK_RUNTIME_KIND.NATIVE_JS : stryMutAct_9fa48("120227") ? false : stryMutAct_9fa48("120226") ? true : (stryCov_9fa48("120226", "120227", "120228"), sqlRequest.runtimeKind !== CALLBACK_RUNTIME_KIND.NATIVE_JS)) {
        if (stryMutAct_9fa48("120229")) {
          {}
        } else {
          stryCov_9fa48("120229");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("120230")) {
          {}
        } else {
          stryCov_9fa48("120230");
          return await this.loadNativeCallbackHandler(sqlRequest.callbackModuleRef, sqlRequest.callbackExport, stryMutAct_9fa48("120233") ? sqlRequest.sessionId && QUERY_SESSION.DEFAULT : stryMutAct_9fa48("120232") ? false : stryMutAct_9fa48("120231") ? true : (stryCov_9fa48("120231", "120232", "120233"), sqlRequest.sessionId || QUERY_SESSION.DEFAULT), executionContext);
        }
      } catch (_parseErr) {
        if (stryMutAct_9fa48("120234")) {
          {}
        } else {
          stryCov_9fa48("120234");
          return null;
        }
      }
    }
  }

  /**
   * Load and compile a native_js callback handler from code table.
   * @param {string} callbackModuleRef
   * @param {string} callbackExport
   * @param {string} sessionId
   * @param {ExecutionContext} executionContext
   * @return {Promise<Function>}
   * @private
   */
  async loadNativeCallbackHandler(callbackModuleRef, callbackExport, sessionId, executionContext) {
    if (stryMutAct_9fa48("120235")) {
      {}
    } else {
      stryCov_9fa48("120235");
      const codeRow = await this.lookupCallbackCodeRow(callbackModuleRef, sessionId);
      if (stryMutAct_9fa48("120238") ? false : stryMutAct_9fa48("120237") ? true : stryMutAct_9fa48("120236") ? codeRow : (stryCov_9fa48("120236", "120237", "120238"), !codeRow)) {
        if (stryMutAct_9fa48("120239")) {
          {}
        } else {
          stryCov_9fa48("120239");
          throw new Error((stryMutAct_9fa48("120240") ? `` : (stryCov_9fa48("120240"), `${ADAPTER_ERROR_MSG.NATIVE_CALLBACK_MODULE_NOT_FOUND}: `)) + callbackModuleRef);
        }
      }
      const source = codeRow.code_blob;
      if (stryMutAct_9fa48("120243") ? typeof source !== 'string' && !source.trim() : stryMutAct_9fa48("120242") ? false : stryMutAct_9fa48("120241") ? true : (stryCov_9fa48("120241", "120242", "120243"), (stryMutAct_9fa48("120245") ? typeof source === 'string' : stryMutAct_9fa48("120244") ? false : (stryCov_9fa48("120244", "120245"), typeof source !== (stryMutAct_9fa48("120246") ? "" : (stryCov_9fa48("120246"), 'string')))) || (stryMutAct_9fa48("120247") ? source.trim() : (stryCov_9fa48("120247"), !(stryMutAct_9fa48("120248") ? source : (stryCov_9fa48("120248"), source.trim())))))) {
        if (stryMutAct_9fa48("120249")) {
          {}
        } else {
          stryCov_9fa48("120249");
          throw new Error(ADAPTER_ERROR_MSG.NATIVE_CALLBACK_SOURCE_INVALID);
        }
      }
      const compiledExports = this.compileCallbackModuleSource(source, ADAPTER_ERROR_MSG.NATIVE_CALLBACK_COMPILE_FAILED);
      const rawHandler = compiledExports ? compiledExports[callbackExport] : null;
      if (stryMutAct_9fa48("120252") ? typeof rawHandler === 'function' : stryMutAct_9fa48("120251") ? false : stryMutAct_9fa48("120250") ? true : (stryCov_9fa48("120250", "120251", "120252"), typeof rawHandler !== (stryMutAct_9fa48("120253") ? "" : (stryCov_9fa48("120253"), 'function')))) {
        if (stryMutAct_9fa48("120254")) {
          {}
        } else {
          stryCov_9fa48("120254");
          throw new Error((stryMutAct_9fa48("120255") ? `` : (stryCov_9fa48("120255"), `${ADAPTER_ERROR_MSG.NATIVE_CALLBACK_EXPORT_NOT_FOUND}: `)) + callbackExport);
        }
      }
      return stryMutAct_9fa48("120256") ? () => undefined : (stryCov_9fa48("120256"), (batch, descriptor, callbackCtx) => rawHandler(stryMutAct_9fa48("120259") ? callbackCtx && executionContext : stryMutAct_9fa48("120258") ? false : stryMutAct_9fa48("120257") ? true : (stryCov_9fa48("120257", "120258", "120259"), callbackCtx || executionContext), batch, descriptor));
    }
  }

  /**
   * Resolve callback source row from the code table.
   *
   * @param {string} callbackModuleRef
   * @param {string} sessionId
   * @return {Promise<Object|null>}
   * @private
   */
  async lookupCallbackCodeRow(callbackModuleRef, sessionId) {
    if (stryMutAct_9fa48("120260")) {
      {}
    } else {
      stryCov_9fa48("120260");
      const byFunctionId = await this.executeQuery(CODE_LOOKUP_BY_FUNCTION_ID_SQL, stryMutAct_9fa48("120261") ? [] : (stryCov_9fa48("120261"), [callbackModuleRef]), stryMutAct_9fa48("120262") ? {} : (stryCov_9fa48("120262"), {
        sessionId
      }));
      if (stryMutAct_9fa48("120265") ? byFunctionId.rows[0] : stryMutAct_9fa48("120264") ? false : stryMutAct_9fa48("120263") ? true : (stryCov_9fa48("120263", "120264", "120265"), byFunctionId.rows?.[0])) {
        if (stryMutAct_9fa48("120266")) {
          {}
        } else {
          stryCov_9fa48("120266");
          return byFunctionId.rows[0];
        }
      }
      const byFunctionName = await this.executeQuery(CODE_LOOKUP_BY_FUNCTION_NAME_SQL, stryMutAct_9fa48("120267") ? [] : (stryCov_9fa48("120267"), [callbackModuleRef]), stryMutAct_9fa48("120268") ? {} : (stryCov_9fa48("120268"), {
        sessionId
      }));
      return stryMutAct_9fa48("120271") ? byFunctionName.rows?.[0] && null : stryMutAct_9fa48("120270") ? false : stryMutAct_9fa48("120269") ? true : (stryCov_9fa48("120269", "120270", "120271"), (stryMutAct_9fa48("120272") ? byFunctionName.rows[0] : (stryCov_9fa48("120272"), byFunctionName.rows?.[0])) || null);
    }
  }

  /**
   * Compile CommonJS callback source and return module exports object.
   *
   * @param {string} source
   * @param {string} compileErrorPrefix
   * @return {Object}
   * @private
   */
  compileCallbackModuleSource(source, compileErrorPrefix) {
    if (stryMutAct_9fa48("120273")) {
      {}
    } else {
      stryCov_9fa48("120273");
      const module = stryMutAct_9fa48("120274") ? {} : (stryCov_9fa48("120274"), {
        exports: {}
      });
      let evaluated = null;
      try {
        if (stryMutAct_9fa48("120275")) {
          {}
        } else {
          stryCov_9fa48("120275");
          const moduleFactory = new Function(NATIVE_CALLBACK_EXPORTS_ARG, NATIVE_CALLBACK_MODULE_ARG, stryMutAct_9fa48("120276") ? `` : (stryCov_9fa48("120276"), `${source}\n${NATIVE_CALLBACK_RETURN_LINE}`));
          evaluated = moduleFactory(module.exports, module);
        }
      } catch (error) {
        if (stryMutAct_9fa48("120277")) {
          {}
        } else {
          stryCov_9fa48("120277");
          const compileError = new Error(stryMutAct_9fa48("120278") ? `` : (stryCov_9fa48("120278"), `${compileErrorPrefix}: ${error.message}`));
          compileError.cause = error;
          throw compileError;
        }
      }
      return (stryMutAct_9fa48("120281") ? evaluated || typeof evaluated === 'object' : stryMutAct_9fa48("120280") ? false : stryMutAct_9fa48("120279") ? true : (stryCov_9fa48("120279", "120280", "120281"), evaluated && (stryMutAct_9fa48("120283") ? typeof evaluated !== 'object' : stryMutAct_9fa48("120282") ? true : (stryCov_9fa48("120282", "120283"), typeof evaluated === (stryMutAct_9fa48("120284") ? "" : (stryCov_9fa48("120284"), 'object')))))) ? evaluated : module.exports;
    }
  }

  /**
   * Resolve latest module manifest row by artifact pointer.
   *
   * @param {string} callbackModuleRef
   * @param {string} sessionId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveLatestModuleManifestRow(callbackModuleRef, sessionId) {
    if (stryMutAct_9fa48("120285")) {
      {}
    } else {
      stryCov_9fa48("120285");
      const manifestLookup = await this.executeQuery(MODULE_MANIFEST_LOOKUP_BY_ARTIFACT_POINTER_SQL, stryMutAct_9fa48("120286") ? [] : (stryCov_9fa48("120286"), [callbackModuleRef]), stryMutAct_9fa48("120287") ? {} : (stryCov_9fa48("120287"), {
        sessionId
      }));
      return stryMutAct_9fa48("120290") ? manifestLookup.rows?.[0] && null : stryMutAct_9fa48("120289") ? false : stryMutAct_9fa48("120288") ? true : (stryCov_9fa48("120288", "120289", "120290"), (stryMutAct_9fa48("120291") ? manifestLookup.rows[0] : (stryCov_9fa48("120291"), manifestLookup.rows?.[0])) || null);
    }
  }

  /**
   * Parse a JSON-encoded array field with safe fallback.
   *
   * @param {*} rawValue
   * @param {string[]} fallback
   * @return {string[]}
   * @private
   */
  parseJsonArrayField(rawValue, fallback) {
    if (stryMutAct_9fa48("120292")) {
      {}
    } else {
      stryCov_9fa48("120292");
      if (stryMutAct_9fa48("120294") ? false : stryMutAct_9fa48("120293") ? true : (stryCov_9fa48("120293", "120294"), Array.isArray(rawValue))) {
        if (stryMutAct_9fa48("120295")) {
          {}
        } else {
          stryCov_9fa48("120295");
          return stryMutAct_9fa48("120296") ? rawValue : (stryCov_9fa48("120296"), rawValue.filter(stryMutAct_9fa48("120297") ? () => undefined : (stryCov_9fa48("120297"), entry => stryMutAct_9fa48("120300") ? typeof entry !== 'string' : stryMutAct_9fa48("120299") ? false : stryMutAct_9fa48("120298") ? true : (stryCov_9fa48("120298", "120299", "120300"), typeof entry === (stryMutAct_9fa48("120301") ? "" : (stryCov_9fa48("120301"), 'string'))))));
        }
      }
      if (stryMutAct_9fa48("120304") ? typeof rawValue !== 'string' && !rawValue.trim() : stryMutAct_9fa48("120303") ? false : stryMutAct_9fa48("120302") ? true : (stryCov_9fa48("120302", "120303", "120304"), (stryMutAct_9fa48("120306") ? typeof rawValue === 'string' : stryMutAct_9fa48("120305") ? false : (stryCov_9fa48("120305", "120306"), typeof rawValue !== (stryMutAct_9fa48("120307") ? "" : (stryCov_9fa48("120307"), 'string')))) || (stryMutAct_9fa48("120308") ? rawValue.trim() : (stryCov_9fa48("120308"), !(stryMutAct_9fa48("120309") ? rawValue : (stryCov_9fa48("120309"), rawValue.trim())))))) {
        if (stryMutAct_9fa48("120310")) {
          {}
        } else {
          stryCov_9fa48("120310");
          return fallback;
        }
      }
      try {
        if (stryMutAct_9fa48("120311")) {
          {}
        } else {
          stryCov_9fa48("120311");
          const parsed = JSON.parse(rawValue);
          return Array.isArray(parsed) ? stryMutAct_9fa48("120312") ? parsed : (stryCov_9fa48("120312"), parsed.filter(stryMutAct_9fa48("120313") ? () => undefined : (stryCov_9fa48("120313"), entry => stryMutAct_9fa48("120316") ? typeof entry !== 'string' : stryMutAct_9fa48("120315") ? false : stryMutAct_9fa48("120314") ? true : (stryCov_9fa48("120314", "120315", "120316"), typeof entry === (stryMutAct_9fa48("120317") ? "" : (stryCov_9fa48("120317"), 'string')))))) : fallback;
        }
      } catch (_parseErr) {
        if (stryMutAct_9fa48("120318")) {
          {}
        } else {
          stryCov_9fa48("120318");
          return fallback;
        }
      }
    }
  }

  /**
   * Build a validated manifest object for module mirror insertion.
   *
   * @param {Object|null} manifestRow
   * @param {string} runExport
   * @param {string} callbackModuleRef
   * @return {Object}
   * @private
   */
  buildWasmCallbackManifest(manifestRow, runExport, callbackModuleRef) {
    if (stryMutAct_9fa48("120319")) {
      {}
    } else {
      stryCov_9fa48("120319");
      const declaredExports = this.parseJsonArrayField(stryMutAct_9fa48("120320") ? manifestRow.exports : (stryCov_9fa48("120320"), manifestRow?.exports), stryMutAct_9fa48("120321") ? [] : (stryCov_9fa48("120321"), [runExport]));
      const exportsWithRun = declaredExports.includes(runExport) ? declaredExports : stryMutAct_9fa48("120322") ? [] : (stryCov_9fa48("120322"), [...declaredExports, runExport]);
      return stryMutAct_9fa48("120323") ? {} : (stryCov_9fa48("120323"), {
        namespace: stryMutAct_9fa48("120326") ? manifestRow?.namespace && 'examples' : stryMutAct_9fa48("120325") ? false : stryMutAct_9fa48("120324") ? true : (stryCov_9fa48("120324", "120325", "120326"), (stryMutAct_9fa48("120327") ? manifestRow.namespace : (stryCov_9fa48("120327"), manifestRow?.namespace)) || (stryMutAct_9fa48("120328") ? "" : (stryCov_9fa48("120328"), 'examples'))),
        name: stryMutAct_9fa48("120331") ? manifestRow?.name && callbackModuleRef : stryMutAct_9fa48("120330") ? false : stryMutAct_9fa48("120329") ? true : (stryCov_9fa48("120329", "120330", "120331"), (stryMutAct_9fa48("120332") ? manifestRow.name : (stryCov_9fa48("120332"), manifestRow?.name)) || callbackModuleRef),
        version: String(stryMutAct_9fa48("120335") ? manifestRow?.version && '1.0.0' : stryMutAct_9fa48("120334") ? false : stryMutAct_9fa48("120333") ? true : (stryCov_9fa48("120333", "120334", "120335"), (stryMutAct_9fa48("120336") ? manifestRow.version : (stryCov_9fa48("120336"), manifestRow?.version)) || (stryMutAct_9fa48("120337") ? "" : (stryCov_9fa48("120337"), '1.0.0')))),
        digest: stryMutAct_9fa48("120340") ? manifestRow?.digest && ZERO_SHA256_DIGEST : stryMutAct_9fa48("120339") ? false : stryMutAct_9fa48("120338") ? true : (stryCov_9fa48("120338", "120339", "120340"), (stryMutAct_9fa48("120341") ? manifestRow.digest : (stryCov_9fa48("120341"), manifestRow?.digest)) || ZERO_SHA256_DIGEST),
        runExport,
        exports: exportsWithRun,
        dependencies: this.parseJsonArrayField(stryMutAct_9fa48("120342") ? manifestRow.dependencies : (stryCov_9fa48("120342"), manifestRow?.dependencies), stryMutAct_9fa48("120343") ? ["Stryker was here"] : (stryCov_9fa48("120343"), [])),
        capabilities: this.parseJsonArrayField(stryMutAct_9fa48("120344") ? manifestRow.capabilities : (stryCov_9fa48("120344"), manifestRow?.capabilities), stryMutAct_9fa48("120345") ? ["Stryker was here"] : (stryCov_9fa48("120345"), [])),
        sourceReference: stryMutAct_9fa48("120348") ? manifestRow?.source_reference && null : stryMutAct_9fa48("120347") ? false : stryMutAct_9fa48("120346") ? true : (stryCov_9fa48("120346", "120347", "120348"), (stryMutAct_9fa48("120349") ? manifestRow.source_reference : (stryCov_9fa48("120349"), manifestRow?.source_reference)) || null),
        artifactPointer: stryMutAct_9fa48("120352") ? manifestRow?.artifact_pointer && callbackModuleRef : stryMutAct_9fa48("120351") ? false : stryMutAct_9fa48("120350") ? true : (stryCov_9fa48("120350", "120351", "120352"), (stryMutAct_9fa48("120353") ? manifestRow.artifact_pointer : (stryCov_9fa48("120353"), manifestRow?.artifact_pointer)) || callbackModuleRef)
      });
    }
  }

  /**
   * Ensure a wasm_component callback module is loaded into module mirror.
   *
   * @param {Readonly<Object>} sqlRequest
   * @param {Object} wasmExecutor
   * @return {Promise<void>}
   * @private
   */
  async ensureWasmCallbackModuleLoaded(sqlRequest, wasmExecutor) {
    if (stryMutAct_9fa48("120354")) {
      {}
    } else {
      stryCov_9fa48("120354");
      const callbackModuleRef = sqlRequest.callbackModuleRef;
      const moduleMirror = stryMutAct_9fa48("120357") ? wasmExecutor.moduleMirror && null : stryMutAct_9fa48("120356") ? false : stryMutAct_9fa48("120355") ? true : (stryCov_9fa48("120355", "120356", "120357"), wasmExecutor.moduleMirror || null);
      if (stryMutAct_9fa48("120360") ? !moduleMirror && typeof moduleMirror.getModule !== 'function' : stryMutAct_9fa48("120359") ? false : stryMutAct_9fa48("120358") ? true : (stryCov_9fa48("120358", "120359", "120360"), (stryMutAct_9fa48("120361") ? moduleMirror : (stryCov_9fa48("120361"), !moduleMirror)) || (stryMutAct_9fa48("120363") ? typeof moduleMirror.getModule === 'function' : stryMutAct_9fa48("120362") ? false : (stryCov_9fa48("120362", "120363"), typeof moduleMirror.getModule !== (stryMutAct_9fa48("120364") ? "" : (stryCov_9fa48("120364"), 'function')))))) {
        if (stryMutAct_9fa48("120365")) {
          {}
        } else {
          stryCov_9fa48("120365");
          throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_MODULE_MIRROR_REQUIRED);
        }
      }
      const existing = moduleMirror.getModule(callbackModuleRef);
      if (stryMutAct_9fa48("120367") ? false : stryMutAct_9fa48("120366") ? true : (stryCov_9fa48("120366", "120367"), existing)) {
        if (stryMutAct_9fa48("120368")) {
          {}
        } else {
          stryCov_9fa48("120368");
          return;
        }
      }
      const sessionId = stryMutAct_9fa48("120371") ? sqlRequest.sessionId && QUERY_SESSION.DEFAULT : stryMutAct_9fa48("120370") ? false : stryMutAct_9fa48("120369") ? true : (stryCov_9fa48("120369", "120370", "120371"), sqlRequest.sessionId || QUERY_SESSION.DEFAULT);
      const codeRow = await this.lookupCallbackCodeRow(callbackModuleRef, sessionId);
      if (stryMutAct_9fa48("120374") ? false : stryMutAct_9fa48("120373") ? true : stryMutAct_9fa48("120372") ? codeRow : (stryCov_9fa48("120372", "120373", "120374"), !codeRow)) {
        if (stryMutAct_9fa48("120375")) {
          {}
        } else {
          stryCov_9fa48("120375");
          throw new Error((stryMutAct_9fa48("120376") ? `` : (stryCov_9fa48("120376"), `${ADAPTER_ERROR_MSG.NATIVE_CALLBACK_MODULE_NOT_FOUND}: `)) + callbackModuleRef);
        }
      }
      const codeBlob = codeRow.code_blob;
      if (stryMutAct_9fa48("120379") ? typeof codeBlob !== 'string' && !codeBlob.trim() : stryMutAct_9fa48("120378") ? false : stryMutAct_9fa48("120377") ? true : (stryCov_9fa48("120377", "120378", "120379"), (stryMutAct_9fa48("120381") ? typeof codeBlob === 'string' : stryMutAct_9fa48("120380") ? false : (stryCov_9fa48("120380", "120381"), typeof codeBlob !== (stryMutAct_9fa48("120382") ? "" : (stryCov_9fa48("120382"), 'string')))) || (stryMutAct_9fa48("120383") ? codeBlob.trim() : (stryCov_9fa48("120383"), !(stryMutAct_9fa48("120384") ? codeBlob : (stryCov_9fa48("120384"), codeBlob.trim())))))) {
        if (stryMutAct_9fa48("120385")) {
          {}
        } else {
          stryCov_9fa48("120385");
          throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_SOURCE_INVALID);
        }
      }
      const parsedArtifact = parseCallbackModuleArtifact(codeBlob);
      if (stryMutAct_9fa48("120388") ? !parsedArtifact.source && typeof parsedArtifact.source !== 'string' : stryMutAct_9fa48("120387") ? false : stryMutAct_9fa48("120386") ? true : (stryCov_9fa48("120386", "120387", "120388"), (stryMutAct_9fa48("120389") ? parsedArtifact.source : (stryCov_9fa48("120389"), !parsedArtifact.source)) || (stryMutAct_9fa48("120391") ? typeof parsedArtifact.source === 'string' : stryMutAct_9fa48("120390") ? false : (stryCov_9fa48("120390", "120391"), typeof parsedArtifact.source !== (stryMutAct_9fa48("120392") ? "" : (stryCov_9fa48("120392"), 'string')))))) {
        if (stryMutAct_9fa48("120393")) {
          {}
        } else {
          stryCov_9fa48("120393");
          throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_SOURCE_INVALID);
        }
      }
      const compiledExports = this.compileCallbackModuleSource(parsedArtifact.source, ADAPTER_ERROR_MSG.WASM_CALLBACK_COMPILE_FAILED);
      const manifestRow = await this.resolveLatestModuleManifestRow(callbackModuleRef, sessionId);
      const runExport = stryMutAct_9fa48("120396") ? (manifestRow?.run_export || parsedArtifact.runExport) && sqlRequest.callbackExport : stryMutAct_9fa48("120395") ? false : stryMutAct_9fa48("120394") ? true : (stryCov_9fa48("120394", "120395", "120396"), (stryMutAct_9fa48("120398") ? manifestRow?.run_export && parsedArtifact.runExport : stryMutAct_9fa48("120397") ? false : (stryCov_9fa48("120397", "120398"), (stryMutAct_9fa48("120399") ? manifestRow.run_export : (stryCov_9fa48("120399"), manifestRow?.run_export)) || parsedArtifact.runExport)) || sqlRequest.callbackExport);
      const manifest = this.buildWasmCallbackManifest(manifestRow, runExport, callbackModuleRef);
      const rawHandler = compiledExports ? compiledExports[manifest.runExport] : null;
      if (stryMutAct_9fa48("120402") ? typeof rawHandler === 'function' : stryMutAct_9fa48("120401") ? false : stryMutAct_9fa48("120400") ? true : (stryCov_9fa48("120400", "120401", "120402"), typeof rawHandler !== (stryMutAct_9fa48("120403") ? "" : (stryCov_9fa48("120403"), 'function')))) {
        if (stryMutAct_9fa48("120404")) {
          {}
        } else {
          stryCov_9fa48("120404");
          throw new Error((stryMutAct_9fa48("120405") ? `` : (stryCov_9fa48("120405"), `${ADAPTER_ERROR_MSG.WASM_CALLBACK_EXPORT_NOT_FOUND}: `)) + manifest.runExport);
        }
      }
      const moduleEntry = stryMutAct_9fa48("120406") ? {} : (stryCov_9fa48("120406"), {
        version: String(stryMutAct_9fa48("120407") ? codeRow.version && DEFAULT_CODE_VERSION : (stryCov_9fa48("120407"), codeRow.version ?? DEFAULT_CODE_VERSION)),
        wasmBytes: Buffer.from(parsedArtifact.wasmBytes),
        manifest,
        exports: compiledExports
      });
      if (stryMutAct_9fa48("120410") ? typeof moduleMirror.setModule !== 'function' : stryMutAct_9fa48("120409") ? false : stryMutAct_9fa48("120408") ? true : (stryCov_9fa48("120408", "120409", "120410"), typeof moduleMirror.setModule === (stryMutAct_9fa48("120411") ? "" : (stryCov_9fa48("120411"), 'function')))) {
        if (stryMutAct_9fa48("120412")) {
          {}
        } else {
          stryCov_9fa48("120412");
          await moduleMirror.setModule(callbackModuleRef, moduleEntry);
          return;
        }
      }
      if (stryMutAct_9fa48("120415") ? moduleMirror.localCache || typeof moduleMirror.localCache.set === 'function' : stryMutAct_9fa48("120414") ? false : stryMutAct_9fa48("120413") ? true : (stryCov_9fa48("120413", "120414", "120415"), moduleMirror.localCache && (stryMutAct_9fa48("120417") ? typeof moduleMirror.localCache.set !== 'function' : stryMutAct_9fa48("120416") ? true : (stryCov_9fa48("120416", "120417"), typeof moduleMirror.localCache.set === (stryMutAct_9fa48("120418") ? "" : (stryCov_9fa48("120418"), 'function')))))) {
        if (stryMutAct_9fa48("120419")) {
          {}
        } else {
          stryCov_9fa48("120419");
          moduleMirror.localCache.set(callbackModuleRef, stryMutAct_9fa48("120420") ? {} : (stryCov_9fa48("120420"), {
            ...moduleEntry,
            updatedAt: Date.now()
          }));
          return;
        }
      }
      throw new Error(ADAPTER_ERROR_MSG.WASM_CALLBACK_MODULE_MIRROR_REQUIRED);
    }
  }

  /**
   * Build or reuse an execution context for stage/plan dispatch.
   *
   * @param {Readonly<Object>} sqlRequest - Canonical SqlRequest object.
   * @return {ExecutionContext} Execution context instance.
   * @private
   */
  createRequestExecutionContext(sqlRequest) {
    if (stryMutAct_9fa48("120421")) {
      {}
    } else {
      stryCov_9fa48("120421");
      if (stryMutAct_9fa48("120423") ? false : stryMutAct_9fa48("120422") ? true : (stryCov_9fa48("120422", "120423"), sqlRequest.executionContext)) {
        if (stryMutAct_9fa48("120424")) {
          {}
        } else {
          stryCov_9fa48("120424");
          return sqlRequest.executionContext;
        }
      }
      const sessionId = stryMutAct_9fa48("120427") ? sqlRequest.sessionId && QUERY_SESSION.DEFAULT : stryMutAct_9fa48("120426") ? false : stryMutAct_9fa48("120425") ? true : (stryCov_9fa48("120425", "120426", "120427"), sqlRequest.sessionId || QUERY_SESSION.DEFAULT);
      const budgetEnforcer = stryMutAct_9fa48("120430") ? sqlRequest.budgetEnforcer && new BudgetEnforcer(sqlRequest.budgets || {}) : stryMutAct_9fa48("120429") ? false : stryMutAct_9fa48("120428") ? true : (stryCov_9fa48("120428", "120429", "120430"), sqlRequest.budgetEnforcer || new BudgetEnforcer(stryMutAct_9fa48("120433") ? sqlRequest.budgets && {} : stryMutAct_9fa48("120432") ? false : stryMutAct_9fa48("120431") ? true : (stryCov_9fa48("120431", "120432", "120433"), sqlRequest.budgets || {})));
      const cancellationToken = stryMutAct_9fa48("120436") ? sqlRequest.cancellationToken && new CancellationToken() : stryMutAct_9fa48("120435") ? false : stryMutAct_9fa48("120434") ? true : (stryCov_9fa48("120434", "120435", "120436"), sqlRequest.cancellationToken || new CancellationToken());
      const lineageTracker = stryMutAct_9fa48("120439") ? sqlRequest.lineageTracker && new LineageTracker(`${sessionId}-${Date.now()}`) : stryMutAct_9fa48("120438") ? false : stryMutAct_9fa48("120437") ? true : (stryCov_9fa48("120437", "120438", "120439"), sqlRequest.lineageTracker || new LineageTracker(stryMutAct_9fa48("120440") ? `` : (stryCov_9fa48("120440"), `${sessionId}-${Date.now()}`)));
      return new ExecutionContext(stryMutAct_9fa48("120441") ? {} : (stryCov_9fa48("120441"), {
        session: sessionId,
        snapshot: stryMutAct_9fa48("120444") ? sqlRequest.snapshot && {
          mode: DEFAULT_SNAPSHOT_MODE
        } : stryMutAct_9fa48("120443") ? false : stryMutAct_9fa48("120442") ? true : (stryCov_9fa48("120442", "120443", "120444"), sqlRequest.snapshot || (stryMutAct_9fa48("120445") ? {} : (stryCov_9fa48("120445"), {
          mode: DEFAULT_SNAPSHOT_MODE
        }))),
        budgetEnforcer,
        cancellationToken,
        lineageTracker,
        queryExecutor: stryMutAct_9fa48("120446") ? () => undefined : (stryCov_9fa48("120446"), async (query, params) => this.executeQuery(query, params, stryMutAct_9fa48("120447") ? {} : (stryCov_9fa48("120447"), {
          sessionId
        }))),
        resultStream: sqlRequest.resultStream,
        exchangeManager: sqlRequest.exchangeManager,
        dedupeRegistry: sqlRequest.dedupeRegistry,
        planDiagnostics: stryMutAct_9fa48("120450") ? sqlRequest.planDiagnostics && null : stryMutAct_9fa48("120449") ? false : stryMutAct_9fa48("120448") ? true : (stryCov_9fa48("120448", "120449", "120450"), sqlRequest.planDiagnostics || null)
      }));
    }
  }

  /**
   * Execute a stage-mode SqlRequest via the shared stage executor.
   *
   * @param {Readonly<Object>} sqlRequest - Canonical SqlRequest object.
   * @return {Promise<Object>} Stage execution result.
   * @private
   */
  async executeStageRequest(sqlRequest) {
    if (stryMutAct_9fa48("120451")) {
      {}
    } else {
      stryCov_9fa48("120451");
      if (stryMutAct_9fa48("120454") ? typeof sqlRequest.handler === 'function' : stryMutAct_9fa48("120453") ? false : stryMutAct_9fa48("120452") ? true : (stryCov_9fa48("120452", "120453", "120454"), typeof sqlRequest.handler !== (stryMutAct_9fa48("120455") ? "" : (stryCov_9fa48("120455"), 'function')))) {
        if (stryMutAct_9fa48("120456")) {
          {}
        } else {
          stryCov_9fa48("120456");
          throw new Error(ADAPTER_ERROR_MSG.STAGE_HANDLER_REQUIRED);
        }
      }
      const executionContext = this.createRequestExecutionContext(sqlRequest);
      const cancellationToken = stryMutAct_9fa48("120459") ? sqlRequest.cancellationToken && executionContext.getCancellationToken() : stryMutAct_9fa48("120458") ? false : stryMutAct_9fa48("120457") ? true : (stryCov_9fa48("120457", "120458", "120459"), sqlRequest.cancellationToken || executionContext.getCancellationToken());
      const stageOptions = stryMutAct_9fa48("120462") ? sqlRequest.options && null : stryMutAct_9fa48("120461") ? false : stryMutAct_9fa48("120460") ? true : (stryCov_9fa48("120460", "120461", "120462"), sqlRequest.options || null);
      const stageResults = await executeStage(stryMutAct_9fa48("120463") ? {} : (stryCov_9fa48("120463"), {
        query: sqlRequest.statement,
        params: sqlRequest.parameters,
        handler: sqlRequest.handler,
        opts: stageOptions,
        queryExecutor: stryMutAct_9fa48("120464") ? () => undefined : (stryCov_9fa48("120464"), async (query, params) => this.executeQuery(query, params, stryMutAct_9fa48("120465") ? {} : (stryCov_9fa48("120465"), {
          sessionId: sqlRequest.sessionId
        }))),
        cancellationToken,
        executionContext
      }));
      return stryMutAct_9fa48("120466") ? {} : (stryCov_9fa48("120466"), {
        success: stryMutAct_9fa48("120467") ? false : (stryCov_9fa48("120467"), true),
        executionMode: EXECUTION_MODE.STAGE,
        results: stageResults
      });
    }
  }

  /**
   * Execute a plan-mode SqlRequest via the shared plan executor.
   *
   * @param {Readonly<Object>} sqlRequest - Canonical SqlRequest object.
   * @return {Promise<Object>} Plan execution result.
   * @private
   */
  async executePlanRequest(sqlRequest) {
    if (stryMutAct_9fa48("120468")) {
      {}
    } else {
      stryCov_9fa48("120468");
      const plan = stryMutAct_9fa48("120471") ? (sqlRequest.plan || sqlRequest.hints?.plan) && null : stryMutAct_9fa48("120470") ? false : stryMutAct_9fa48("120469") ? true : (stryCov_9fa48("120469", "120470", "120471"), (stryMutAct_9fa48("120473") ? sqlRequest.plan && sqlRequest.hints?.plan : stryMutAct_9fa48("120472") ? false : (stryCov_9fa48("120472", "120473"), sqlRequest.plan || (stryMutAct_9fa48("120474") ? sqlRequest.hints.plan : (stryCov_9fa48("120474"), sqlRequest.hints?.plan)))) || null);
      if (stryMutAct_9fa48("120477") ? !plan && typeof plan !== 'object' : stryMutAct_9fa48("120476") ? false : stryMutAct_9fa48("120475") ? true : (stryCov_9fa48("120475", "120476", "120477"), (stryMutAct_9fa48("120478") ? plan : (stryCov_9fa48("120478"), !plan)) || (stryMutAct_9fa48("120480") ? typeof plan === 'object' : stryMutAct_9fa48("120479") ? false : (stryCov_9fa48("120479", "120480"), typeof plan !== (stryMutAct_9fa48("120481") ? "" : (stryCov_9fa48("120481"), 'object')))))) {
        if (stryMutAct_9fa48("120482")) {
          {}
        } else {
          stryCov_9fa48("120482");
          throw new Error(ADAPTER_ERROR_MSG.PLAN_OBJECT_REQUIRED);
        }
      }
      const executionContext = this.createRequestExecutionContext(sqlRequest);
      const cancellationToken = stryMutAct_9fa48("120485") ? sqlRequest.cancellationToken && executionContext.getCancellationToken() : stryMutAct_9fa48("120484") ? false : stryMutAct_9fa48("120483") ? true : (stryCov_9fa48("120483", "120484", "120485"), sqlRequest.cancellationToken || executionContext.getCancellationToken());
      const planOptions = stryMutAct_9fa48("120488") ? sqlRequest.options && null : stryMutAct_9fa48("120487") ? false : stryMutAct_9fa48("120486") ? true : (stryCov_9fa48("120486", "120487", "120488"), sqlRequest.options || null);
      const planResult = await executePlan(stryMutAct_9fa48("120489") ? {} : (stryCov_9fa48("120489"), {
        plan,
        params: sqlRequest.parameters,
        handler: sqlRequest.handler,
        opts: planOptions,
        queryExecutor: stryMutAct_9fa48("120490") ? () => undefined : (stryCov_9fa48("120490"), async (query, params) => this.executeQuery(query, params, stryMutAct_9fa48("120491") ? {} : (stryCov_9fa48("120491"), {
          sessionId: sqlRequest.sessionId
        }))),
        cancellationToken,
        executionContext
      }));
      return stryMutAct_9fa48("120492") ? {} : (stryCov_9fa48("120492"), {
        success: stryMutAct_9fa48("120493") ? false : (stryCov_9fa48("120493"), true),
        executionMode: EXECUTION_MODE.PLAN,
        result: planResult
      });
    }
  }

  /**
   * Track write activity for managed split diagnostics and request local
   * evaluation only for partitions this node actually owns.
   *
   * Leader-local partition services are the authoritative trigger source for
   * write-driven split evaluation. The SQL coordinator only keeps lightweight
   * diagnostics here and may opportunistically request evaluation when it also
   * owns one of the target partitions.
   *
   * @param {string} tableName - Target table name.
   * @param {Object} writePlan - Distributed write plan.
   * @param {Object} writeResult - Distributed write execution result.
   * @private
   */
  requestManagedSplitEvaluationForWrite(tableName, writePlan, writeResult) {
    if (stryMutAct_9fa48("120494")) {
      {}
    } else {
      stryCov_9fa48("120494");
      const manager = this.partitionSplitMergeManager;
      if (stryMutAct_9fa48("120497") ? (!manager || typeof manager.requestEvaluation !== 'function' || !tableName || this.isSystemTable(tableName)) && writeResult?.success !== true : stryMutAct_9fa48("120496") ? false : stryMutAct_9fa48("120495") ? true : (stryCov_9fa48("120495", "120496", "120497"), (stryMutAct_9fa48("120499") ? (!manager || typeof manager.requestEvaluation !== 'function' || !tableName) && this.isSystemTable(tableName) : stryMutAct_9fa48("120498") ? false : (stryCov_9fa48("120498", "120499"), (stryMutAct_9fa48("120501") ? (!manager || typeof manager.requestEvaluation !== 'function') && !tableName : stryMutAct_9fa48("120500") ? false : (stryCov_9fa48("120500", "120501"), (stryMutAct_9fa48("120503") ? !manager && typeof manager.requestEvaluation !== 'function' : stryMutAct_9fa48("120502") ? false : (stryCov_9fa48("120502", "120503"), (stryMutAct_9fa48("120504") ? manager : (stryCov_9fa48("120504"), !manager)) || (stryMutAct_9fa48("120506") ? typeof manager.requestEvaluation === 'function' : stryMutAct_9fa48("120505") ? false : (stryCov_9fa48("120505", "120506"), typeof manager.requestEvaluation !== (stryMutAct_9fa48("120507") ? "" : (stryCov_9fa48("120507"), 'function')))))) || (stryMutAct_9fa48("120508") ? tableName : (stryCov_9fa48("120508"), !tableName)))) || this.isSystemTable(tableName))) || (stryMutAct_9fa48("120510") ? writeResult?.success === true : stryMutAct_9fa48("120509") ? false : (stryCov_9fa48("120509", "120510"), (stryMutAct_9fa48("120511") ? writeResult.success : (stryCov_9fa48("120511"), writeResult?.success)) !== (stryMutAct_9fa48("120512") ? false : (stryCov_9fa48("120512"), true)))))) {
        if (stryMutAct_9fa48("120513")) {
          {}
        } else {
          stryCov_9fa48("120513");
          return;
        }
      }
      const nowMs = Date.now();
      const lastEvaluationState = stryMutAct_9fa48("120516") ? this.lastWriteSplitEvaluationByTable.get(tableName) && null : stryMutAct_9fa48("120515") ? false : stryMutAct_9fa48("120514") ? true : (stryCov_9fa48("120514", "120515", "120516"), this.lastWriteSplitEvaluationByTable.get(tableName) || null);
      const lastRequestedAtMs = (stryMutAct_9fa48("120519") ? typeof lastEvaluationState !== 'number' : stryMutAct_9fa48("120518") ? false : stryMutAct_9fa48("120517") ? true : (stryCov_9fa48("120517", "120518", "120519"), typeof lastEvaluationState === (stryMutAct_9fa48("120520") ? "" : (stryCov_9fa48("120520"), 'number')))) ? lastEvaluationState : Number(stryMutAct_9fa48("120523") ? lastEvaluationState?.requestedAtMs && 0 : stryMutAct_9fa48("120522") ? false : stryMutAct_9fa48("120521") ? true : (stryCov_9fa48("120521", "120522", "120523"), (stryMutAct_9fa48("120524") ? lastEvaluationState.requestedAtMs : (stryCov_9fa48("120524"), lastEvaluationState?.requestedAtMs)) || 0));
      if (stryMutAct_9fa48("120528") ? nowMs - lastRequestedAtMs >= WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS : stryMutAct_9fa48("120527") ? nowMs - lastRequestedAtMs <= WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS : stryMutAct_9fa48("120526") ? false : stryMutAct_9fa48("120525") ? true : (stryCov_9fa48("120525", "120526", "120527", "120528"), (stryMutAct_9fa48("120529") ? nowMs + lastRequestedAtMs : (stryCov_9fa48("120529"), nowMs - lastRequestedAtMs)) < WRITE_ACTIVITY_SPLIT_EVALUATION_MIN_INTERVAL_MS)) {
        if (stryMutAct_9fa48("120530")) {
          {}
        } else {
          stryCov_9fa48("120530");
          return;
        }
      }
      const partitionIds = (stryMutAct_9fa48("120531") ? writePlan.partitionStatements : (stryCov_9fa48("120531"), writePlan?.partitionStatements)) instanceof Map ? Array.from(writePlan.partitionStatements.keys()) : stryMutAct_9fa48("120532") ? ["Stryker was here"] : (stryCov_9fa48("120532"), []);
      const localLeaderPartitionIds = this.resolveLocalManagedSplitEvaluationPartitionIds(partitionIds);
      this.lastWriteSplitEvaluationByTable.set(tableName, stryMutAct_9fa48("120533") ? {} : (stryCov_9fa48("120533"), {
        requestedAtMs: nowMs,
        partitionIds,
        localLeaderPartitionIds
      }));
      if (stryMutAct_9fa48("120536") ? localLeaderPartitionIds.length !== 0 : stryMutAct_9fa48("120535") ? false : stryMutAct_9fa48("120534") ? true : (stryCov_9fa48("120534", "120535", "120536"), localLeaderPartitionIds.length === 0)) {
        if (stryMutAct_9fa48("120537")) {
          {}
        } else {
          stryCov_9fa48("120537");
          return;
        }
      }
      manager.requestEvaluation(stryMutAct_9fa48("120538") ? {} : (stryCov_9fa48("120538"), {
        reasonCode: stryMutAct_9fa48("120539") ? "" : (stryCov_9fa48("120539"), 'write_activity'),
        tableName,
        partitionIds: localLeaderPartitionIds
      }));
    }
  }

  /**
   * Resolve the subset of requested partitions this node may evaluate for
   * managed split ownership.
   * @param {string[]} partitionIds
   * @return {string[]}
   * @private
   */
  resolveLocalManagedSplitEvaluationPartitionIds(partitionIds = stryMutAct_9fa48("120540") ? ["Stryker was here"] : (stryCov_9fa48("120540"), [])) {
    if (stryMutAct_9fa48("120541")) {
      {}
    } else {
      stryCov_9fa48("120541");
      const requestedPartitionIdSet = new Set(stryMutAct_9fa48("120542") ? partitionIds.map(partitionId => String(partitionId || '')) : (stryCov_9fa48("120542"), partitionIds.map(stryMutAct_9fa48("120543") ? () => undefined : (stryCov_9fa48("120543"), partitionId => String(stryMutAct_9fa48("120546") ? partitionId && '' : stryMutAct_9fa48("120545") ? false : stryMutAct_9fa48("120544") ? true : (stryCov_9fa48("120544", "120545", "120546"), partitionId || (stryMutAct_9fa48("120547") ? "Stryker was here!" : (stryCov_9fa48("120547"), '')))))).filter(Boolean)));
      if (stryMutAct_9fa48("120550") ? requestedPartitionIdSet.size !== 0 : stryMutAct_9fa48("120549") ? false : stryMutAct_9fa48("120548") ? true : (stryCov_9fa48("120548", "120549", "120550"), requestedPartitionIdSet.size === 0)) {
        if (stryMutAct_9fa48("120551")) {
          {}
        } else {
          stryCov_9fa48("120551");
          return stryMutAct_9fa48("120552") ? ["Stryker was here"] : (stryCov_9fa48("120552"), []);
        }
      }
      const localPartitionIds = stryMutAct_9fa48("120553") ? ["Stryker was here"] : (stryCov_9fa48("120553"), []);
      for (const partition of this.listManagedSplitPartitions()) {
        if (stryMutAct_9fa48("120554")) {
          {}
        } else {
          stryCov_9fa48("120554");
          const partitionId = stryMutAct_9fa48("120555") ? (partition?.partition_id ?? partition?.partitionId) && null : (stryCov_9fa48("120555"), (stryMutAct_9fa48("120556") ? partition?.partition_id && partition?.partitionId : (stryCov_9fa48("120556"), (stryMutAct_9fa48("120557") ? partition.partition_id : (stryCov_9fa48("120557"), partition?.partition_id)) ?? (stryMutAct_9fa48("120558") ? partition.partitionId : (stryCov_9fa48("120558"), partition?.partitionId)))) ?? null);
          if (stryMutAct_9fa48("120561") ? !partitionId && !requestedPartitionIdSet.has(partitionId) : stryMutAct_9fa48("120560") ? false : stryMutAct_9fa48("120559") ? true : (stryCov_9fa48("120559", "120560", "120561"), (stryMutAct_9fa48("120562") ? partitionId : (stryCov_9fa48("120562"), !partitionId)) || (stryMutAct_9fa48("120563") ? requestedPartitionIdSet.has(partitionId) : (stryCov_9fa48("120563"), !requestedPartitionIdSet.has(partitionId))))) {
            if (stryMutAct_9fa48("120564")) {
              {}
            } else {
              stryCov_9fa48("120564");
              continue;
            }
          }
          localPartitionIds.push(partitionId);
        }
      }
      return localPartitionIds;
    }
  }

  /**
   * Execute a SQL query.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @param {string} options.sessionId - Session ID for transaction tracking.
   * @return {Promise<Object>} Query result.
   */
  async executeQuery(sql, params = stryMutAct_9fa48("120565") ? ["Stryker was here"] : (stryCov_9fa48("120565"), []), options = {}) {
    if (stryMutAct_9fa48("120566")) {
      {}
    } else {
      stryCov_9fa48("120566");
      const sessionId = stryMutAct_9fa48("120569") ? options.sessionId && QUERY_SESSION.DEFAULT : stryMutAct_9fa48("120568") ? false : stryMutAct_9fa48("120567") ? true : (stryCov_9fa48("120567", "120568", "120569"), options.sessionId || QUERY_SESSION.DEFAULT);
      const cancellationToken = stryMutAct_9fa48("120572") ? options?.cancellationToken && null : stryMutAct_9fa48("120571") ? false : stryMutAct_9fa48("120570") ? true : (stryCov_9fa48("120570", "120571", "120572"), (stryMutAct_9fa48("120573") ? options.cancellationToken : (stryCov_9fa48("120573"), options?.cancellationToken)) || null);
      stryMutAct_9fa48("120575") ? cancellationToken.throwIfCancelled?.() : stryMutAct_9fa48("120574") ? cancellationToken?.throwIfCancelled() : (stryCov_9fa48("120574", "120575"), cancellationToken?.throwIfCancelled?.());
      this.recoverDistributedTransactionStateFromCache();
      if (stryMutAct_9fa48("120577") ? false : stryMutAct_9fa48("120576") ? true : (stryCov_9fa48("120576", "120577"), EXPLAIN_DISTRIBUTED_PREFIX_REGEX.test(sql))) {
        if (stryMutAct_9fa48("120578")) {
          {}
        } else {
          stryCov_9fa48("120578");
          return this.executeExplainDistributed(sql, params, stryMutAct_9fa48("120579") ? {} : (stryCov_9fa48("120579"), {
            sessionId,
            dialect: options.dialect
          }));
        }
      }
      this.logger.debug(QUERY_LOG_MSG.EXECUTING_SQL_QUERY, stryMutAct_9fa48("120580") ? {} : (stryCov_9fa48("120580"), {
        sql: stryMutAct_9fa48("120581") ? sql : (stryCov_9fa48("120581"), sql.substring(0, 100)),
        paramCount: params.length,
        sessionId
      }));
      const queryStartMs = Date.now();

      // Parse the SQL (check cache first)
      let ast;
      try {
        if (stryMutAct_9fa48("120582")) {
          {}
        } else {
          stryCov_9fa48("120582");
          const dialect = options.dialect;
          ast = this.parseCache.get(sql, dialect);
          if (stryMutAct_9fa48("120585") ? false : stryMutAct_9fa48("120584") ? true : stryMutAct_9fa48("120583") ? ast : (stryCov_9fa48("120583", "120584", "120585"), !ast)) {
            if (stryMutAct_9fa48("120586")) {
              {}
            } else {
              stryCov_9fa48("120586");
              const parser = new SQLParser(sql, stryMutAct_9fa48("120587") ? {} : (stryCov_9fa48("120587"), {
                dialect
              }));
              ast = parser.parse();
              this.parseCache.set(sql, dialect, ast);
              ast = this.parseCache.cloneAst(ast);
            }
          }
          // If PG mode produced param mapping, reorder params
          if (stryMutAct_9fa48("120590") ? ast._paramMapping || ast._paramMapping.length > 0 : stryMutAct_9fa48("120589") ? false : stryMutAct_9fa48("120588") ? true : (stryCov_9fa48("120588", "120589", "120590"), ast._paramMapping && (stryMutAct_9fa48("120593") ? ast._paramMapping.length <= 0 : stryMutAct_9fa48("120592") ? ast._paramMapping.length >= 0 : stryMutAct_9fa48("120591") ? true : (stryCov_9fa48("120591", "120592", "120593"), ast._paramMapping.length > 0)))) {
            if (stryMutAct_9fa48("120594")) {
              {}
            } else {
              stryCov_9fa48("120594");
              params = reorderParams(params, ast._paramMapping);
            }
          }
        }
      } catch (parseError) {
        if (stryMutAct_9fa48("120595")) {
          {}
        } else {
          stryCov_9fa48("120595");
          this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, stryMutAct_9fa48("120596") ? {} : (stryCov_9fa48("120596"), {
            sql: stryMutAct_9fa48("120597") ? sql : (stryCov_9fa48("120597"), sql.substring(0, 100)),
            error: parseError.message
          }));
          return stryMutAct_9fa48("120598") ? {} : (stryCov_9fa48("120598"), {
            success: stryMutAct_9fa48("120599") ? true : (stryCov_9fa48("120599"), false),
            error: parseError.message,
            errorCode: QUERY_ERROR_CODE.SYNTAX_ERROR
          });
        }
      }
      const parseEndMs = Date.now();
      stryMutAct_9fa48("120601") ? cancellationToken.throwIfCancelled?.() : stryMutAct_9fa48("120600") ? cancellationToken?.throwIfCancelled() : (stryCov_9fa48("120600", "120601"), cancellationToken?.throwIfCancelled?.());
      try {
        if (stryMutAct_9fa48("120602")) {
          {}
        } else {
          stryCov_9fa48("120602");
          const ingressPressureDecision = this.evaluateQueryIngressPressure(ast, options);
          if (stryMutAct_9fa48("120605") ? ingressPressureDecision || ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER || ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("120604") ? false : stryMutAct_9fa48("120603") ? true : (stryCov_9fa48("120603", "120604", "120605"), ingressPressureDecision && (stryMutAct_9fa48("120607") ? ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER && ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("120606") ? true : (stryCov_9fa48("120606", "120607"), (stryMutAct_9fa48("120609") ? ingressPressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("120608") ? false : (stryCov_9fa48("120608", "120609"), ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) || (stryMutAct_9fa48("120611") ? ingressPressureDecision.action !== PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("120610") ? false : (stryCov_9fa48("120610", "120611"), ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT)))))) {
            if (stryMutAct_9fa48("120612")) {
              {}
            } else {
              stryCov_9fa48("120612");
              this.logger.warn((stryMutAct_9fa48("120615") ? ingressPressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("120614") ? false : stryMutAct_9fa48("120613") ? true : (stryCov_9fa48("120613", "120614", "120615"), ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) ? QUERY_LOG_MSG.QUERY_ADMISSION_DEFERRED : QUERY_LOG_MSG.QUERY_ADMISSION_REJECTED, stryMutAct_9fa48("120616") ? {} : (stryCov_9fa48("120616"), {
                statementType: ast.type,
                pressureAction: ingressPressureDecision.action,
                pressureReason: ingressPressureDecision.reason,
                retryAfterMs: ingressPressureDecision.retryAfterMs,
                workClass: stryMutAct_9fa48("120619") ? options?.workClass && PRESSURE_WORK_CLASS.INTERACTIVE : stryMutAct_9fa48("120618") ? false : stryMutAct_9fa48("120617") ? true : (stryCov_9fa48("120617", "120618", "120619"), (stryMutAct_9fa48("120620") ? options.workClass : (stryCov_9fa48("120620"), options?.workClass)) || PRESSURE_WORK_CLASS.INTERACTIVE)
              }));
              return buildPressureAdmissionFailure(ingressPressureDecision, stryMutAct_9fa48("120621") ? {} : (stryCov_9fa48("120621"), {
                error: (stryMutAct_9fa48("120624") ? ingressPressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("120623") ? false : stryMutAct_9fa48("120622") ? true : (stryCov_9fa48("120622", "120623", "120624"), ingressPressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) ? stryMutAct_9fa48("120625") ? "" : (stryCov_9fa48("120625"), 'query_admission_deferred') : stryMutAct_9fa48("120626") ? "" : (stryCov_9fa48("120626"), 'query_admission_rejected'),
                errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR
              }));
            }
          }

          // Route based on statement type
          let result;
          switch (ast.type) {
            case QUERY_AST_TYPE.SELECT:
              if (stryMutAct_9fa48("120627")) {} else {
                stryCov_9fa48("120627");
                result = await this.executeSelect(ast, params, sessionId, options, sql);
                break;
              }
            case QUERY_AST_TYPE.INSERT:
              if (stryMutAct_9fa48("120628")) {} else {
                stryCov_9fa48("120628");
                result = await this.executeInsert(ast, params, sessionId, options);
                break;
              }
            case QUERY_AST_TYPE.UPDATE:
              if (stryMutAct_9fa48("120629")) {} else {
                stryCov_9fa48("120629");
                result = await this.executeUpdate(ast, params, sessionId, options);
                break;
              }
            case QUERY_AST_TYPE.DELETE:
              if (stryMutAct_9fa48("120630")) {} else {
                stryCov_9fa48("120630");
                result = await this.executeDelete(ast, params, sessionId, options);
                break;
              }
            case QUERY_AST_TYPE.CREATE_TABLE:
              if (stryMutAct_9fa48("120631")) {} else {
                stryCov_9fa48("120631");
                result = await this.executeCreateTable(ast, sessionId);
                break;
              }
            case QUERY_AST_TYPE.ALTER_TABLE:
              if (stryMutAct_9fa48("120632")) {} else {
                stryCov_9fa48("120632");
                result = await this.executeAlterTable(ast, sessionId);
                break;
              }
            case QUERY_AST_TYPE.BEGIN_TRANSACTION:
              if (stryMutAct_9fa48("120633")) {} else {
                stryCov_9fa48("120633");
                return this.handleBeginTransaction(sessionId);
              }
            case QUERY_AST_TYPE.COMMIT:
              if (stryMutAct_9fa48("120634")) {} else {
                stryCov_9fa48("120634");
                return this.handleCommit(sessionId);
              }
            case QUERY_AST_TYPE.ROLLBACK:
              if (stryMutAct_9fa48("120635")) {} else {
                stryCov_9fa48("120635");
                return this.handleRollback(sessionId);
              }
            default:
              if (stryMutAct_9fa48("120636")) {} else {
                stryCov_9fa48("120636");
                throw new Error(stryMutAct_9fa48("120637") ? `` : (stryCov_9fa48("120637"), `${QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX}${ast.type}`));
              }
          }
          const queryEndMs = Date.now();
          try {
            if (stryMutAct_9fa48("120638")) {
              {}
            } else {
              stryCov_9fa48("120638");
              this.logger.info(METRICS_LOG_TAG.QUERY_LIFECYCLE, stryMutAct_9fa48("120639") ? {} : (stryCov_9fa48("120639"), {
                sessionId,
                statementType: ast.type,
                parseDurationMs: stryMutAct_9fa48("120640") ? parseEndMs + queryStartMs : (stryCov_9fa48("120640"), parseEndMs - queryStartMs),
                executionDurationMs: stryMutAct_9fa48("120641") ? queryEndMs + parseEndMs : (stryCov_9fa48("120641"), queryEndMs - parseEndMs),
                totalDurationMs: stryMutAct_9fa48("120642") ? queryEndMs + queryStartMs : (stryCov_9fa48("120642"), queryEndMs - queryStartMs),
                partitionCount: stryMutAct_9fa48("120643") ? result?.partitions?.length && 0 : (stryCov_9fa48("120643"), (stryMutAct_9fa48("120645") ? result.partitions?.length : stryMutAct_9fa48("120644") ? result?.partitions.length : (stryCov_9fa48("120644", "120645"), result?.partitions?.length)) ?? 0),
                rowCount: stryMutAct_9fa48("120646") ? (result?.count ?? result?.changes) && 0 : (stryCov_9fa48("120646"), (stryMutAct_9fa48("120647") ? result?.count && result?.changes : (stryCov_9fa48("120647"), (stryMutAct_9fa48("120648") ? result.count : (stryCov_9fa48("120648"), result?.count)) ?? (stryMutAct_9fa48("120649") ? result.changes : (stryCov_9fa48("120649"), result?.changes)))) ?? 0),
                success: stryMutAct_9fa48("120650") ? result?.success && false : (stryCov_9fa48("120650"), (stryMutAct_9fa48("120651") ? result.success : (stryCov_9fa48("120651"), result?.success)) ?? (stryMutAct_9fa48("120652") ? true : (stryCov_9fa48("120652"), false)))
              }));
            }
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }

          // Strip partition details from results (Requirement 20.10)
          return this.tableCreationService.stripPartitionDetails(result);
        }
      } catch (error) {
        if (stryMutAct_9fa48("120653")) {
          {}
        } else {
          stryCov_9fa48("120653");
          const queryEndMs = Date.now();
          try {
            if (stryMutAct_9fa48("120654")) {
              {}
            } else {
              stryCov_9fa48("120654");
              this.logger.info(METRICS_LOG_TAG.QUERY_LIFECYCLE, stryMutAct_9fa48("120655") ? {} : (stryCov_9fa48("120655"), {
                sessionId,
                statementType: ast.type,
                parseDurationMs: stryMutAct_9fa48("120656") ? parseEndMs + queryStartMs : (stryCov_9fa48("120656"), parseEndMs - queryStartMs),
                executionDurationMs: stryMutAct_9fa48("120657") ? queryEndMs + parseEndMs : (stryCov_9fa48("120657"), queryEndMs - parseEndMs),
                totalDurationMs: stryMutAct_9fa48("120658") ? queryEndMs + queryStartMs : (stryCov_9fa48("120658"), queryEndMs - queryStartMs),
                partitionCount: 0,
                rowCount: 0,
                success: stryMutAct_9fa48("120659") ? true : (stryCov_9fa48("120659"), false)
              }));
            }
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }
          const failureResult = this.buildCaughtQueryExecutionFailure(error);
          this.logger.error(QUERY_LOG_MSG.QUERY_EXECUTION_FAILED, stryMutAct_9fa48("120660") ? {} : (stryCov_9fa48("120660"), {
            sql: stryMutAct_9fa48("120661") ? sql : (stryCov_9fa48("120661"), sql.substring(0, 100)),
            error: failureResult.error,
            errorCode: stryMutAct_9fa48("120664") ? failureResult.errorCode && null : stryMutAct_9fa48("120663") ? false : stryMutAct_9fa48("120662") ? true : (stryCov_9fa48("120662", "120663", "120664"), failureResult.errorCode || null),
            retryAfterMs: Number.isFinite(failureResult.retryAfterMs) ? failureResult.retryAfterMs : null,
            deferRetry: stryMutAct_9fa48("120667") ? failureResult.deferRetry !== true : stryMutAct_9fa48("120666") ? false : stryMutAct_9fa48("120665") ? true : (stryCov_9fa48("120665", "120666", "120667"), failureResult.deferRetry === (stryMutAct_9fa48("120668") ? false : (stryCov_9fa48("120668"), true)))
          }));
          return failureResult;
        }
      }
    }
  }
  evaluateQueryIngressPressure(ast, options = {}) {
    if (stryMutAct_9fa48("120669")) {
      {}
    } else {
      stryCov_9fa48("120669");
      const astType = stryMutAct_9fa48("120672") ? ast?.type && null : stryMutAct_9fa48("120671") ? false : stryMutAct_9fa48("120670") ? true : (stryCov_9fa48("120670", "120671", "120672"), (stryMutAct_9fa48("120673") ? ast.type : (stryCov_9fa48("120673"), ast?.type)) || null);
      const writeStatement = stryMutAct_9fa48("120676") ? (astType === QUERY_AST_TYPE.INSERT || astType === QUERY_AST_TYPE.UPDATE || astType === QUERY_AST_TYPE.DELETE || astType === QUERY_AST_TYPE.CREATE_TABLE) && astType === QUERY_AST_TYPE.ALTER_TABLE : stryMutAct_9fa48("120675") ? false : stryMutAct_9fa48("120674") ? true : (stryCov_9fa48("120674", "120675", "120676"), (stryMutAct_9fa48("120678") ? (astType === QUERY_AST_TYPE.INSERT || astType === QUERY_AST_TYPE.UPDATE || astType === QUERY_AST_TYPE.DELETE) && astType === QUERY_AST_TYPE.CREATE_TABLE : stryMutAct_9fa48("120677") ? false : (stryCov_9fa48("120677", "120678"), (stryMutAct_9fa48("120680") ? (astType === QUERY_AST_TYPE.INSERT || astType === QUERY_AST_TYPE.UPDATE) && astType === QUERY_AST_TYPE.DELETE : stryMutAct_9fa48("120679") ? false : (stryCov_9fa48("120679", "120680"), (stryMutAct_9fa48("120682") ? astType === QUERY_AST_TYPE.INSERT && astType === QUERY_AST_TYPE.UPDATE : stryMutAct_9fa48("120681") ? false : (stryCov_9fa48("120681", "120682"), (stryMutAct_9fa48("120684") ? astType !== QUERY_AST_TYPE.INSERT : stryMutAct_9fa48("120683") ? false : (stryCov_9fa48("120683", "120684"), astType === QUERY_AST_TYPE.INSERT)) || (stryMutAct_9fa48("120686") ? astType !== QUERY_AST_TYPE.UPDATE : stryMutAct_9fa48("120685") ? false : (stryCov_9fa48("120685", "120686"), astType === QUERY_AST_TYPE.UPDATE)))) || (stryMutAct_9fa48("120688") ? astType !== QUERY_AST_TYPE.DELETE : stryMutAct_9fa48("120687") ? false : (stryCov_9fa48("120687", "120688"), astType === QUERY_AST_TYPE.DELETE)))) || (stryMutAct_9fa48("120690") ? astType !== QUERY_AST_TYPE.CREATE_TABLE : stryMutAct_9fa48("120689") ? false : (stryCov_9fa48("120689", "120690"), astType === QUERY_AST_TYPE.CREATE_TABLE)))) || (stryMutAct_9fa48("120692") ? astType !== QUERY_AST_TYPE.ALTER_TABLE : stryMutAct_9fa48("120691") ? false : (stryCov_9fa48("120691", "120692"), astType === QUERY_AST_TYPE.ALTER_TABLE)));
      return this.getPressureGovernor().evaluate(stryMutAct_9fa48("120693") ? {} : (stryCov_9fa48("120693"), {
        workClass: stryMutAct_9fa48("120696") ? options?.workClass && (writeStatement ? PRESSURE_WORK_CLASS.INTERACTIVE : PRESSURE_WORK_CLASS.INTERACTIVE) : stryMutAct_9fa48("120695") ? false : stryMutAct_9fa48("120694") ? true : (stryCov_9fa48("120694", "120695", "120696"), (stryMutAct_9fa48("120697") ? options.workClass : (stryCov_9fa48("120697"), options?.workClass)) || (writeStatement ? PRESSURE_WORK_CLASS.INTERACTIVE : PRESSURE_WORK_CLASS.INTERACTIVE)),
        resourceKeys: stryMutAct_9fa48("120698") ? [] : (stryCov_9fa48("120698"), [writeStatement ? stryMutAct_9fa48("120699") ? "" : (stryCov_9fa48("120699"), 'query-plane:write') : stryMutAct_9fa48("120700") ? "" : (stryCov_9fa48("120700"), 'query-plane:read'), stryMutAct_9fa48("120701") ? `` : (stryCov_9fa48("120701"), `query-plane:statement:${stryMutAct_9fa48("120702") ? String(astType || 'unknown').toUpperCase() : (stryCov_9fa48("120702"), String(stryMutAct_9fa48("120705") ? astType && 'unknown' : stryMutAct_9fa48("120704") ? false : stryMutAct_9fa48("120703") ? true : (stryCov_9fa48("120703", "120704", "120705"), astType || (stryMutAct_9fa48("120706") ? "" : (stryCov_9fa48("120706"), 'unknown')))).toLowerCase())}`)]),
        allowDegrade: stryMutAct_9fa48("120707") ? true : (stryCov_9fa48("120707"), false),
        allowDefer: stryMutAct_9fa48("120710") ? options?.allowPressureDefer === false : stryMutAct_9fa48("120709") ? false : stryMutAct_9fa48("120708") ? true : (stryCov_9fa48("120708", "120709", "120710"), (stryMutAct_9fa48("120711") ? options.allowPressureDefer : (stryCov_9fa48("120711"), options?.allowPressureDefer)) !== (stryMutAct_9fa48("120712") ? true : (stryCov_9fa48("120712"), false))),
        retryAfterMs: stryMutAct_9fa48("120713") ? options.pressureRetryAfterMs : (stryCov_9fa48("120713"), options?.pressureRetryAfterMs)
      }));
    }
  }
  getPressureGovernor() {
    if (stryMutAct_9fa48("120714")) {
      {}
    } else {
      stryCov_9fa48("120714");
      this.pressureGovernor = stryMutAct_9fa48("120717") ? this.pressureGovernor && PressureGovernor.getShared({
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        logger: this.logger
      }) : stryMutAct_9fa48("120716") ? false : stryMutAct_9fa48("120715") ? true : (stryCov_9fa48("120715", "120716", "120717"), this.pressureGovernor || PressureGovernor.getShared(stryMutAct_9fa48("120718") ? {} : (stryCov_9fa48("120718"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        logger: this.logger
      })));
      this.pressureGovernor.configure(stryMutAct_9fa48("120719") ? {} : (stryCov_9fa48("120719"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        logger: this.logger
      }));
      return this.pressureGovernor;
    }
  }

  /**
   * Execute EXPLAIN DISTRIBUTED and return canonical planner output.
   * @param {string} sql - EXPLAIN DISTRIBUTED statement.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Explain options.
   * @param {string} options.sessionId - Session ID.
   * @param {string} options.dialect - SQL dialect.
   * @return {Promise<Object>} Explain result.
   * @private
   */
  async executeExplainDistributed(sql, params = stryMutAct_9fa48("120720") ? ["Stryker was here"] : (stryCov_9fa48("120720"), []), options = {}) {
    if (stryMutAct_9fa48("120721")) {
      {}
    } else {
      stryCov_9fa48("120721");
      const statement = sql.replace(EXPLAIN_DISTRIBUTED_PREFIX_REGEX, stryMutAct_9fa48("120722") ? "Stryker was here!" : (stryCov_9fa48("120722"), ''));
      if (stryMutAct_9fa48("120725") ? false : stryMutAct_9fa48("120724") ? true : stryMutAct_9fa48("120723") ? statement.trim() : (stryCov_9fa48("120723", "120724", "120725"), !(stryMutAct_9fa48("120726") ? statement : (stryCov_9fa48("120726"), statement.trim())))) {
        if (stryMutAct_9fa48("120727")) {
          {}
        } else {
          stryCov_9fa48("120727");
          return stryMutAct_9fa48("120728") ? {} : (stryCov_9fa48("120728"), {
            success: stryMutAct_9fa48("120729") ? true : (stryCov_9fa48("120729"), false),
            error: QUERY_ERROR_MSG.EXPLAIN_DISTRIBUTED_REQUIRES_STATEMENT,
            errorCode: QUERY_ERROR_CODE.SYNTAX_ERROR
          });
        }
      }
      let ast;
      let normalizedParams = params;
      try {
        if (stryMutAct_9fa48("120730")) {
          {}
        } else {
          stryCov_9fa48("120730");
          const parser = new SQLParser(statement, stryMutAct_9fa48("120731") ? {} : (stryCov_9fa48("120731"), {
            dialect: options.dialect
          }));
          ast = parser.parse();
          if (stryMutAct_9fa48("120734") ? ast._paramMapping || ast._paramMapping.length > 0 : stryMutAct_9fa48("120733") ? false : stryMutAct_9fa48("120732") ? true : (stryCov_9fa48("120732", "120733", "120734"), ast._paramMapping && (stryMutAct_9fa48("120737") ? ast._paramMapping.length <= 0 : stryMutAct_9fa48("120736") ? ast._paramMapping.length >= 0 : stryMutAct_9fa48("120735") ? true : (stryCov_9fa48("120735", "120736", "120737"), ast._paramMapping.length > 0)))) {
            if (stryMutAct_9fa48("120738")) {
              {}
            } else {
              stryCov_9fa48("120738");
              normalizedParams = reorderParams(params, ast._paramMapping);
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("120739")) {
          {}
        } else {
          stryCov_9fa48("120739");
          return stryMutAct_9fa48("120740") ? {} : (stryCov_9fa48("120740"), {
            success: stryMutAct_9fa48("120741") ? true : (stryCov_9fa48("120741"), false),
            error: error.message,
            errorCode: QUERY_ERROR_CODE.SYNTAX_ERROR
          });
        }
      }
      const distributedPlan = this.distributedQueryPlanner.planStatement(ast, normalizedParams, stryMutAct_9fa48("120742") ? {} : (stryCov_9fa48("120742"), {
        sessionId: stryMutAct_9fa48("120745") ? options.sessionId && QUERY_SESSION.DEFAULT : stryMutAct_9fa48("120744") ? false : stryMutAct_9fa48("120743") ? true : (stryCov_9fa48("120743", "120744", "120745"), options.sessionId || QUERY_SESSION.DEFAULT),
        explain: stryMutAct_9fa48("120746") ? false : (stryCov_9fa48("120746"), true)
      }));
      if (stryMutAct_9fa48("120749") ? false : stryMutAct_9fa48("120748") ? true : stryMutAct_9fa48("120747") ? distributedPlan : (stryCov_9fa48("120747", "120748", "120749"), !distributedPlan)) {
        if (stryMutAct_9fa48("120750")) {
          {}
        } else {
          stryCov_9fa48("120750");
          return stryMutAct_9fa48("120751") ? {} : (stryCov_9fa48("120751"), {
            success: stryMutAct_9fa48("120752") ? true : (stryCov_9fa48("120752"), false),
            error: stryMutAct_9fa48("120753") ? `` : (stryCov_9fa48("120753"), `${QUERY_ERROR_MSG.UNSUPPORTED_STATEMENT_PREFIX}${ast.type}`),
            errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR
          });
        }
      }
      return stryMutAct_9fa48("120754") ? {} : (stryCov_9fa48("120754"), {
        success: stryMutAct_9fa48("120755") ? false : (stryCov_9fa48("120755"), true),
        operation: QUERY_OPERATION.EXPLAIN_DISTRIBUTED,
        rows: stryMutAct_9fa48("120756") ? [] : (stryCov_9fa48("120756"), [stryMutAct_9fa48("120757") ? {} : (stryCov_9fa48("120757"), {
          plan_id: distributedPlan.planId,
          statement_type: distributedPlan.statementType,
          execution_policy: distributedPlan.executionPolicy,
          table_plans: Array.from(distributedPlan.tablePlans.values()),
          join_plan: distributedPlan.joinPlan,
          merge_plan: distributedPlan.mergePlan,
          diagnostics: distributedPlan.diagnostics
        })]),
        distributedPlan,
        distributedDiagnostics: distributedPlan.diagnostics
      });
    }
  }

  /**
   * Execute a CREATE TABLE statement.
   * Requirements: 20.1, 20.2, 20.3
   * @param {Object} ast - Parsed CREATE TABLE AST.
   * @param {string} _sessionId - Session ID (unused for DDL).
   * @return {Promise<Object>} Creation result.
   * @private
   */
  async executeCreateTable(ast, _sessionId) {
    if (stryMutAct_9fa48("120758")) {
      {}
    } else {
      stryCov_9fa48("120758");
      return this.tableCreationService.createTable(ast);
    }
  }

  /**
   * Execute an ALTER TABLE statement through the migration pipeline.
   * @param {Object} ast - Parsed ALTER TABLE AST.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Migration initiation result.
   * @private
   */
  async executeAlterTable(ast, sessionId) {
    if (stryMutAct_9fa48("120759")) {
      {}
    } else {
      stryCov_9fa48("120759");
      if (stryMutAct_9fa48("120762") ? !this.migrationPipeline && typeof this.migrationPipeline.handleAlterTable !== 'function' : stryMutAct_9fa48("120761") ? false : stryMutAct_9fa48("120760") ? true : (stryCov_9fa48("120760", "120761", "120762"), (stryMutAct_9fa48("120763") ? this.migrationPipeline : (stryCov_9fa48("120763"), !this.migrationPipeline)) || (stryMutAct_9fa48("120765") ? typeof this.migrationPipeline.handleAlterTable === 'function' : stryMutAct_9fa48("120764") ? false : (stryCov_9fa48("120764", "120765"), typeof this.migrationPipeline.handleAlterTable !== (stryMutAct_9fa48("120766") ? "" : (stryCov_9fa48("120766"), 'function')))))) {
        if (stryMutAct_9fa48("120767")) {
          {}
        } else {
          stryCov_9fa48("120767");
          throw new Error(QUERY_ERROR_MSG.MIGRATION_PIPELINE_UNAVAILABLE);
        }
      }
      return this.migrationPipeline.handleAlterTable(ast, sessionId);
    }
  }

  /**
   * Provision initial routable replica for a newly-created table partition.
   * @param {Object} context - Table partition context.
   * @param {string} context.tableId - Table ID.
   * @param {Object} [context.tableMetadata] - Canonical table row snapshot.
   * @param {string} context.partitionId - Partition ID.
   * @param {Object} [context.partitionMetadata] - Canonical partition row
   *   snapshot.
   * @param {number} [context.minimumRoutableReplicaCount] - Minimum ready
   *   replica cohort required before provisioning can continue.
   * @param {string[]} [context.targetNodeIds] - Explicit provisioning target
   *   nodes for split child bootstrapping.
   * @param {Object} [context.admissionConvergence] - Optional previously
   *   probed admission result to reuse for explicit target cohorts.
   * @param {string} [context.routingReadinessDimension] - Optional routing
   *   readiness dimension used while waiting for bootstrap quorum visibility.
   * @return {Promise<void>}
   * @private
   */
  async provisionInitialTablePartition(context) {
    if (stryMutAct_9fa48("120768")) {
      {}
    } else {
      stryCov_9fa48("120768");
      const partitionId = stryMutAct_9fa48("120769") ? context.partitionId : (stryCov_9fa48("120769"), context?.partitionId);
      const requestedReplicaCount = (stryMutAct_9fa48("120772") ? Number.isInteger(context?.replicaCount) || context.replicaCount > 0 : stryMutAct_9fa48("120771") ? false : stryMutAct_9fa48("120770") ? true : (stryCov_9fa48("120770", "120771", "120772"), Number.isInteger(stryMutAct_9fa48("120773") ? context.replicaCount : (stryCov_9fa48("120773"), context?.replicaCount)) && (stryMutAct_9fa48("120776") ? context.replicaCount <= 0 : stryMutAct_9fa48("120775") ? context.replicaCount >= 0 : stryMutAct_9fa48("120774") ? true : (stryCov_9fa48("120774", "120775", "120776"), context.replicaCount > 0)))) ? context.replicaCount : 1;
      const explicitTargetNodeIds = this.normalizeTargetNodeIds(stryMutAct_9fa48("120777") ? context.targetNodeIds : (stryCov_9fa48("120777"), context?.targetNodeIds));
      if (stryMutAct_9fa48("120780") ? false : stryMutAct_9fa48("120779") ? true : stryMutAct_9fa48("120778") ? partitionId : (stryCov_9fa48("120778", "120779", "120780"), !partitionId)) {
        if (stryMutAct_9fa48("120781")) {
          {}
        } else {
          stryCov_9fa48("120781");
          throw new Error(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_PARTITION_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("120784") ? (!this.rebalanceCoordinator || typeof this.rebalanceCoordinator.createOperation !== 'function') && typeof this.rebalanceCoordinator.executeOperation !== 'function' : stryMutAct_9fa48("120783") ? false : stryMutAct_9fa48("120782") ? true : (stryCov_9fa48("120782", "120783", "120784"), (stryMutAct_9fa48("120786") ? !this.rebalanceCoordinator && typeof this.rebalanceCoordinator.createOperation !== 'function' : stryMutAct_9fa48("120785") ? false : (stryCov_9fa48("120785", "120786"), (stryMutAct_9fa48("120787") ? this.rebalanceCoordinator : (stryCov_9fa48("120787"), !this.rebalanceCoordinator)) || (stryMutAct_9fa48("120789") ? typeof this.rebalanceCoordinator.createOperation === 'function' : stryMutAct_9fa48("120788") ? false : (stryCov_9fa48("120788", "120789"), typeof this.rebalanceCoordinator.createOperation !== (stryMutAct_9fa48("120790") ? "" : (stryCov_9fa48("120790"), 'function')))))) || (stryMutAct_9fa48("120792") ? typeof this.rebalanceCoordinator.executeOperation === 'function' : stryMutAct_9fa48("120791") ? false : (stryCov_9fa48("120791", "120792"), typeof this.rebalanceCoordinator.executeOperation !== (stryMutAct_9fa48("120793") ? "" : (stryCov_9fa48("120793"), 'function')))))) {
        if (stryMutAct_9fa48("120794")) {
          {}
        } else {
          stryCov_9fa48("120794");
          throw new Error(QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_COORDINATOR_REQUIRED);
        }
      }
      let targetReplicaCount = (stryMutAct_9fa48("120798") ? explicitTargetNodeIds.length <= 0 : stryMutAct_9fa48("120797") ? explicitTargetNodeIds.length >= 0 : stryMutAct_9fa48("120796") ? false : stryMutAct_9fa48("120795") ? true : (stryCov_9fa48("120795", "120796", "120797", "120798"), explicitTargetNodeIds.length > 0)) ? stryMutAct_9fa48("120799") ? Math.min(1, Math.min(requestedReplicaCount, explicitTargetNodeIds.length)) : (stryCov_9fa48("120799"), Math.max(1, stryMutAct_9fa48("120800") ? Math.max(requestedReplicaCount, explicitTargetNodeIds.length) : (stryCov_9fa48("120800"), Math.min(requestedReplicaCount, explicitTargetNodeIds.length)))) : stryMutAct_9fa48("120801") ? Math.min(1, requestedReplicaCount) : (stryCov_9fa48("120801"), Math.max(1, requestedReplicaCount));
      const hasExplicitMinimumRoutableReplicaCount = stryMutAct_9fa48("120804") ? Number.isInteger(context?.minimumRoutableReplicaCount) || context.minimumRoutableReplicaCount > 0 : stryMutAct_9fa48("120803") ? false : stryMutAct_9fa48("120802") ? true : (stryCov_9fa48("120802", "120803", "120804"), Number.isInteger(stryMutAct_9fa48("120805") ? context.minimumRoutableReplicaCount : (stryCov_9fa48("120805"), context?.minimumRoutableReplicaCount)) && (stryMutAct_9fa48("120808") ? context.minimumRoutableReplicaCount <= 0 : stryMutAct_9fa48("120807") ? context.minimumRoutableReplicaCount >= 0 : stryMutAct_9fa48("120806") ? true : (stryCov_9fa48("120806", "120807", "120808"), context.minimumRoutableReplicaCount > 0)));
      let minimumRoutableReplicaCount = this.resolveMinimumProvisioningReplicaCount(stryMutAct_9fa48("120809") ? context.minimumRoutableReplicaCount : (stryCov_9fa48("120809"), context?.minimumRoutableReplicaCount), targetReplicaCount);
      let enforceEveryProvisioningOperation = stryMutAct_9fa48("120813") ? minimumRoutableReplicaCount < targetReplicaCount : stryMutAct_9fa48("120812") ? minimumRoutableReplicaCount > targetReplicaCount : stryMutAct_9fa48("120811") ? false : stryMutAct_9fa48("120810") ? true : (stryCov_9fa48("120810", "120811", "120812", "120813"), minimumRoutableReplicaCount >= targetReplicaCount);
      const bootstrapTableMetadata = (stryMutAct_9fa48("120816") ? context?.tableMetadata || typeof context.tableMetadata === 'object' : stryMutAct_9fa48("120815") ? false : stryMutAct_9fa48("120814") ? true : (stryCov_9fa48("120814", "120815", "120816"), (stryMutAct_9fa48("120817") ? context.tableMetadata : (stryCov_9fa48("120817"), context?.tableMetadata)) && (stryMutAct_9fa48("120819") ? typeof context.tableMetadata !== 'object' : stryMutAct_9fa48("120818") ? true : (stryCov_9fa48("120818", "120819"), typeof context.tableMetadata === (stryMutAct_9fa48("120820") ? "" : (stryCov_9fa48("120820"), 'object')))))) ? context.tableMetadata : null;
      const bootstrapPartitionMetadata = (stryMutAct_9fa48("120823") ? context?.partitionMetadata || typeof context.partitionMetadata === 'object' : stryMutAct_9fa48("120822") ? false : stryMutAct_9fa48("120821") ? true : (stryCov_9fa48("120821", "120822", "120823"), (stryMutAct_9fa48("120824") ? context.partitionMetadata : (stryCov_9fa48("120824"), context?.partitionMetadata)) && (stryMutAct_9fa48("120826") ? typeof context.partitionMetadata !== 'object' : stryMutAct_9fa48("120825") ? true : (stryCov_9fa48("120825", "120826"), typeof context.partitionMetadata === (stryMutAct_9fa48("120827") ? "" : (stryCov_9fa48("120827"), 'object')))))) ? context.partitionMetadata : null;
      const routingReadinessDimension = (stryMutAct_9fa48("120830") ? typeof context?.routingReadinessDimension === 'string' || context.routingReadinessDimension.length > 0 : stryMutAct_9fa48("120829") ? false : stryMutAct_9fa48("120828") ? true : (stryCov_9fa48("120828", "120829", "120830"), (stryMutAct_9fa48("120832") ? typeof context?.routingReadinessDimension !== 'string' : stryMutAct_9fa48("120831") ? true : (stryCov_9fa48("120831", "120832"), typeof (stryMutAct_9fa48("120833") ? context.routingReadinessDimension : (stryCov_9fa48("120833"), context?.routingReadinessDimension)) === (stryMutAct_9fa48("120834") ? "" : (stryCov_9fa48("120834"), 'string')))) && (stryMutAct_9fa48("120837") ? context.routingReadinessDimension.length <= 0 : stryMutAct_9fa48("120836") ? context.routingReadinessDimension.length >= 0 : stryMutAct_9fa48("120835") ? true : (stryCov_9fa48("120835", "120836", "120837"), context.routingReadinessDimension.length > 0)))) ? context.routingReadinessDimension : stryMutAct_9fa48("120838") ? this.queryExecutor.defaultRoutingReadinessDimension : (stryCov_9fa48("120838"), this.queryExecutor?.defaultRoutingReadinessDimension);
      const timeoutBudget = stryMutAct_9fa48("120841") ? context?.timeoutBudget && this.createControlPlaneTimeoutBudget(this.tablePartitionProvisioningTimeoutMs) : stryMutAct_9fa48("120840") ? false : stryMutAct_9fa48("120839") ? true : (stryCov_9fa48("120839", "120840", "120841"), (stryMutAct_9fa48("120842") ? context.timeoutBudget : (stryCov_9fa48("120842"), context?.timeoutBudget)) || this.createControlPlaneTimeoutBudget(this.tablePartitionProvisioningTimeoutMs));
      let provisionTargetDiagnostics = (stryMutAct_9fa48("120845") ? explicitTargetNodeIds.length !== 0 : stryMutAct_9fa48("120844") ? false : stryMutAct_9fa48("120843") ? true : (stryCov_9fa48("120843", "120844", "120845"), explicitTargetNodeIds.length === 0)) ? this.resolveProvisionTargetNodeIdsWithDiagnostics(targetReplicaCount).diagnostics : null;
      let provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(explicitTargetNodeIds, targetReplicaCount, provisionTargetDiagnostics);
      let admissionConvergence = (stryMutAct_9fa48("120848") ? context?.admissionConvergence || typeof context.admissionConvergence === 'object' : stryMutAct_9fa48("120847") ? false : stryMutAct_9fa48("120846") ? true : (stryCov_9fa48("120846", "120847", "120848"), (stryMutAct_9fa48("120849") ? context.admissionConvergence : (stryCov_9fa48("120849"), context?.admissionConvergence)) && (stryMutAct_9fa48("120851") ? typeof context.admissionConvergence !== 'object' : stryMutAct_9fa48("120850") ? true : (stryCov_9fa48("120850", "120851"), typeof context.admissionConvergence === (stryMutAct_9fa48("120852") ? "" : (stryCov_9fa48("120852"), 'object')))))) ? context.admissionConvergence : null;
      const routableNodeIds = this.getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension);
      if (stryMutAct_9fa48("120856") ? routableNodeIds.length < minimumRoutableReplicaCount : stryMutAct_9fa48("120855") ? routableNodeIds.length > minimumRoutableReplicaCount : stryMutAct_9fa48("120854") ? false : stryMutAct_9fa48("120853") ? true : (stryCov_9fa48("120853", "120854", "120855", "120856"), routableNodeIds.length >= minimumRoutableReplicaCount)) {
        if (stryMutAct_9fa48("120857")) {
          {}
        } else {
          stryCov_9fa48("120857");
          return stryMutAct_9fa48("120858") ? {} : (stryCov_9fa48("120858"), {
            requestedReplicaCount,
            resolvedReplicaCount: targetReplicaCount,
            minimumRoutableReplicaCount,
            routableReplicaCount: routableNodeIds.length
          });
        }
      }
      if (stryMutAct_9fa48("120861") ? explicitTargetNodeIds.length === 0 && enforceEveryProvisioningOperation || provisionTargetNodeIds.length < targetReplicaCount || this.supportsProvisioningAdmissionPrecheck() : stryMutAct_9fa48("120860") ? false : stryMutAct_9fa48("120859") ? true : (stryCov_9fa48("120859", "120860", "120861"), (stryMutAct_9fa48("120863") ? explicitTargetNodeIds.length === 0 || enforceEveryProvisioningOperation : stryMutAct_9fa48("120862") ? true : (stryCov_9fa48("120862", "120863"), (stryMutAct_9fa48("120865") ? explicitTargetNodeIds.length !== 0 : stryMutAct_9fa48("120864") ? true : (stryCov_9fa48("120864", "120865"), explicitTargetNodeIds.length === 0)) && enforceEveryProvisioningOperation)) && (stryMutAct_9fa48("120867") ? provisionTargetNodeIds.length < targetReplicaCount && this.supportsProvisioningAdmissionPrecheck() : stryMutAct_9fa48("120866") ? true : (stryCov_9fa48("120866", "120867"), (stryMutAct_9fa48("120870") ? provisionTargetNodeIds.length >= targetReplicaCount : stryMutAct_9fa48("120869") ? provisionTargetNodeIds.length <= targetReplicaCount : stryMutAct_9fa48("120868") ? false : (stryCov_9fa48("120868", "120869", "120870"), provisionTargetNodeIds.length < targetReplicaCount)) || this.supportsProvisioningAdmissionPrecheck())))) {
        if (stryMutAct_9fa48("120871")) {
          {}
        } else {
          stryCov_9fa48("120871");
          const convergenceResult = await this.waitForProvisionTargetNodeIds(stryMutAct_9fa48("120872") ? {} : (stryCov_9fa48("120872"), {
            partitionId,
            requiredReplicaCount: targetReplicaCount,
            timeoutBudget,
            failOnTimeout: stryMutAct_9fa48("120873") ? true : (stryCov_9fa48("120873"), false),
            maxWaitMs: this.tablePartitionTargetNodeConvergenceTimeoutMs,
            explicitTargetNodeIds,
            allowAdaptiveAdmissionConvergenceWait: stryMutAct_9fa48("120876") ? this.tablePartitionTargetNodeConvergenceTimeoutMs !== QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS : stryMutAct_9fa48("120875") ? false : stryMutAct_9fa48("120874") ? true : (stryCov_9fa48("120874", "120875", "120876"), this.tablePartitionTargetNodeConvergenceTimeoutMs === QUERY_DEFAULTS.TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS)
          }));
          admissionConvergence = stryMutAct_9fa48("120879") ? convergenceResult.admissionProbe && null : stryMutAct_9fa48("120878") ? false : stryMutAct_9fa48("120877") ? true : (stryCov_9fa48("120877", "120878", "120879"), convergenceResult.admissionProbe || null);
          provisionTargetDiagnostics = stryMutAct_9fa48("120882") ? convergenceResult.diagnostics && provisionTargetDiagnostics : stryMutAct_9fa48("120881") ? false : stryMutAct_9fa48("120880") ? true : (stryCov_9fa48("120880", "120881", "120882"), convergenceResult.diagnostics || provisionTargetDiagnostics);
          provisionTargetNodeIds = this.resolveProvisionTargetNodeIdsForContext(explicitTargetNodeIds, targetReplicaCount, provisionTargetDiagnostics);
          const maximumProvisionableReplicaCount = Number.isInteger(stryMutAct_9fa48("120883") ? admissionConvergence.maximumProvisionableReplicaCount : (stryCov_9fa48("120883"), admissionConvergence?.maximumProvisionableReplicaCount)) ? admissionConvergence.maximumProvisionableReplicaCount : provisionTargetNodeIds.length;
          const implicitFallbackMinimumReplicaCount = this.resolveImplicitProvisioningFallbackReplicaCount(targetReplicaCount, stryMutAct_9fa48("120884") ? provisionTargetDiagnostics.activeNodeRowCount : (stryCov_9fa48("120884"), provisionTargetDiagnostics?.activeNodeRowCount));
          if (stryMutAct_9fa48("120887") ? convergenceResult.timedOut && maximumProvisionableReplicaCount > 0 && maximumProvisionableReplicaCount < targetReplicaCount || maximumProvisionableReplicaCount >= implicitFallbackMinimumReplicaCount : stryMutAct_9fa48("120886") ? false : stryMutAct_9fa48("120885") ? true : (stryCov_9fa48("120885", "120886", "120887"), (stryMutAct_9fa48("120889") ? convergenceResult.timedOut && maximumProvisionableReplicaCount > 0 || maximumProvisionableReplicaCount < targetReplicaCount : stryMutAct_9fa48("120888") ? true : (stryCov_9fa48("120888", "120889"), (stryMutAct_9fa48("120891") ? convergenceResult.timedOut || maximumProvisionableReplicaCount > 0 : stryMutAct_9fa48("120890") ? true : (stryCov_9fa48("120890", "120891"), convergenceResult.timedOut && (stryMutAct_9fa48("120894") ? maximumProvisionableReplicaCount <= 0 : stryMutAct_9fa48("120893") ? maximumProvisionableReplicaCount >= 0 : stryMutAct_9fa48("120892") ? true : (stryCov_9fa48("120892", "120893", "120894"), maximumProvisionableReplicaCount > 0)))) && (stryMutAct_9fa48("120897") ? maximumProvisionableReplicaCount >= targetReplicaCount : stryMutAct_9fa48("120896") ? maximumProvisionableReplicaCount <= targetReplicaCount : stryMutAct_9fa48("120895") ? true : (stryCov_9fa48("120895", "120896", "120897"), maximumProvisionableReplicaCount < targetReplicaCount)))) && (stryMutAct_9fa48("120900") ? maximumProvisionableReplicaCount < implicitFallbackMinimumReplicaCount : stryMutAct_9fa48("120899") ? maximumProvisionableReplicaCount > implicitFallbackMinimumReplicaCount : stryMutAct_9fa48("120898") ? true : (stryCov_9fa48("120898", "120899", "120900"), maximumProvisionableReplicaCount >= implicitFallbackMinimumReplicaCount)))) {
            if (stryMutAct_9fa48("120901")) {
              {}
            } else {
              stryCov_9fa48("120901");
              targetReplicaCount = stryMutAct_9fa48("120902") ? Math.min(1, maximumProvisionableReplicaCount) : (stryCov_9fa48("120902"), Math.max(1, maximumProvisionableReplicaCount));
              if (stryMutAct_9fa48("120905") ? false : stryMutAct_9fa48("120904") ? true : stryMutAct_9fa48("120903") ? hasExplicitMinimumRoutableReplicaCount : (stryCov_9fa48("120903", "120904", "120905"), !hasExplicitMinimumRoutableReplicaCount)) {
                if (stryMutAct_9fa48("120906")) {
                  {}
                } else {
                  stryCov_9fa48("120906");
                  minimumRoutableReplicaCount = stryMutAct_9fa48("120907") ? Math.max(minimumRoutableReplicaCount, targetReplicaCount) : (stryCov_9fa48("120907"), Math.min(minimumRoutableReplicaCount, targetReplicaCount));
                }
              }
              enforceEveryProvisioningOperation = stryMutAct_9fa48("120911") ? minimumRoutableReplicaCount < targetReplicaCount : stryMutAct_9fa48("120910") ? minimumRoutableReplicaCount > targetReplicaCount : stryMutAct_9fa48("120909") ? false : stryMutAct_9fa48("120908") ? true : (stryCov_9fa48("120908", "120909", "120910", "120911"), minimumRoutableReplicaCount >= targetReplicaCount);
              this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED, stryMutAct_9fa48("120912") ? {} : (stryCov_9fa48("120912"), {
                partitionId,
                requiredReplicaCount: convergenceResult.requiredReplicaCount,
                resolvedReplicaCount: targetReplicaCount,
                minimumRoutableReplicaCount,
                convergenceTimedOut: stryMutAct_9fa48("120913") ? false : (stryCov_9fa48("120913"), true),
                waitedMs: convergenceResult.waitedMs,
                diagnostics: convergenceResult.diagnostics,
                admissionConvergence
              }));
            }
          }
        }
      }
      const routableNodeIdSet = new Set(routableNodeIds);
      const operationPlanningStartedAtMs = this.nowFn();
      const plannedOperations = stryMutAct_9fa48("120914") ? ["Stryker was here"] : (stryCov_9fa48("120914"), []);
      const createdPlanningOperations = stryMutAct_9fa48("120915") ? ["Stryker was here"] : (stryCov_9fa48("120915"), []);
      const rejectedTargetNodePlans = stryMutAct_9fa48("120916") ? ["Stryker was here"] : (stryCov_9fa48("120916"), []);
      const requiredNewReplicaCount = stryMutAct_9fa48("120917") ? Math.min(0, targetReplicaCount - routableNodeIdSet.size) : (stryCov_9fa48("120917"), Math.max(0, stryMutAct_9fa48("120918") ? targetReplicaCount + routableNodeIdSet.size : (stryCov_9fa48("120918"), targetReplicaCount - routableNodeIdSet.size)));
      const candidateTargetNodeIds = stryMutAct_9fa48("120919") ? ["Stryker was here"] : (stryCov_9fa48("120919"), []);
      const seenCandidateTargetNodeIds = new Set();
      for (const targetNodeId of provisionTargetNodeIds) {
        if (stryMutAct_9fa48("120920")) {
          {}
        } else {
          stryCov_9fa48("120920");
          if (stryMutAct_9fa48("120923") ? routableNodeIdSet.has(targetNodeId) && seenCandidateTargetNodeIds.has(targetNodeId) : stryMutAct_9fa48("120922") ? false : stryMutAct_9fa48("120921") ? true : (stryCov_9fa48("120921", "120922", "120923"), routableNodeIdSet.has(targetNodeId) || seenCandidateTargetNodeIds.has(targetNodeId))) {
            if (stryMutAct_9fa48("120924")) {
              {}
            } else {
              stryCov_9fa48("120924");
              continue;
            }
          }
          seenCandidateTargetNodeIds.add(targetNodeId);
          candidateTargetNodeIds.push(targetNodeId);
        }
      }
      const supportsAdmissionPrecheck = stryMutAct_9fa48("120927") ? typeof this.rebalanceCoordinator.checkProvisioningAdmission !== 'function' : stryMutAct_9fa48("120926") ? false : stryMutAct_9fa48("120925") ? true : (stryCov_9fa48("120925", "120926", "120927"), typeof this.rebalanceCoordinator.checkProvisioningAdmission === (stryMutAct_9fa48("120928") ? "" : (stryCov_9fa48("120928"), 'function')));
      const admittedTargetNodeIds = stryMutAct_9fa48("120929") ? ["Stryker was here"] : (stryCov_9fa48("120929"), []);
      const precheckedTargetNodeIds = new Set();
      if (stryMutAct_9fa48("120932") ? supportsAdmissionPrecheck && admissionConvergence && Array.isArray(admissionConvergence.candidateTargetNodeIds) && Array.isArray(admissionConvergence.admittedTargetNodeIds) || Array.isArray(admissionConvergence.rejectedTargetNodePlans) : stryMutAct_9fa48("120931") ? false : stryMutAct_9fa48("120930") ? true : (stryCov_9fa48("120930", "120931", "120932"), (stryMutAct_9fa48("120934") ? supportsAdmissionPrecheck && admissionConvergence && Array.isArray(admissionConvergence.candidateTargetNodeIds) || Array.isArray(admissionConvergence.admittedTargetNodeIds) : stryMutAct_9fa48("120933") ? true : (stryCov_9fa48("120933", "120934"), (stryMutAct_9fa48("120936") ? supportsAdmissionPrecheck && admissionConvergence || Array.isArray(admissionConvergence.candidateTargetNodeIds) : stryMutAct_9fa48("120935") ? true : (stryCov_9fa48("120935", "120936"), (stryMutAct_9fa48("120938") ? supportsAdmissionPrecheck || admissionConvergence : stryMutAct_9fa48("120937") ? true : (stryCov_9fa48("120937", "120938"), supportsAdmissionPrecheck && admissionConvergence)) && Array.isArray(admissionConvergence.candidateTargetNodeIds))) && Array.isArray(admissionConvergence.admittedTargetNodeIds))) && Array.isArray(admissionConvergence.rejectedTargetNodePlans))) {
        if (stryMutAct_9fa48("120939")) {
          {}
        } else {
          stryCov_9fa48("120939");
          for (const targetNodeId of admissionConvergence.candidateTargetNodeIds) {
            if (stryMutAct_9fa48("120940")) {
              {}
            } else {
              stryCov_9fa48("120940");
              precheckedTargetNodeIds.add(String(stryMutAct_9fa48("120943") ? targetNodeId && '' : stryMutAct_9fa48("120942") ? false : stryMutAct_9fa48("120941") ? true : (stryCov_9fa48("120941", "120942", "120943"), targetNodeId || (stryMutAct_9fa48("120944") ? "Stryker was here!" : (stryCov_9fa48("120944"), '')))));
            }
          }
          admittedTargetNodeIds.push(...(stryMutAct_9fa48("120945") ? admissionConvergence.admittedTargetNodeIds : (stryCov_9fa48("120945"), admissionConvergence.admittedTargetNodeIds.filter(stryMutAct_9fa48("120946") ? () => undefined : (stryCov_9fa48("120946"), targetNodeId => stryMutAct_9fa48("120949") ? typeof targetNodeId === 'string' || targetNodeId.length > 0 : stryMutAct_9fa48("120948") ? false : stryMutAct_9fa48("120947") ? true : (stryCov_9fa48("120947", "120948", "120949"), (stryMutAct_9fa48("120951") ? typeof targetNodeId !== 'string' : stryMutAct_9fa48("120950") ? true : (stryCov_9fa48("120950", "120951"), typeof targetNodeId === (stryMutAct_9fa48("120952") ? "" : (stryCov_9fa48("120952"), 'string')))) && (stryMutAct_9fa48("120955") ? targetNodeId.length <= 0 : stryMutAct_9fa48("120954") ? targetNodeId.length >= 0 : stryMutAct_9fa48("120953") ? true : (stryCov_9fa48("120953", "120954", "120955"), targetNodeId.length > 0))))))));
          rejectedTargetNodePlans.push(...admissionConvergence.rejectedTargetNodePlans);
        }
      }
      for (const targetNodeId of candidateTargetNodeIds) {
        if (stryMutAct_9fa48("120956")) {
          {}
        } else {
          stryCov_9fa48("120956");
          if (stryMutAct_9fa48("120958") ? false : stryMutAct_9fa48("120957") ? true : (stryCov_9fa48("120957", "120958"), precheckedTargetNodeIds.has(targetNodeId))) {
            if (stryMutAct_9fa48("120959")) {
              {}
            } else {
              stryCov_9fa48("120959");
              continue;
            }
          }
          if (stryMutAct_9fa48("120962") ? false : stryMutAct_9fa48("120961") ? true : stryMutAct_9fa48("120960") ? supportsAdmissionPrecheck : (stryCov_9fa48("120960", "120961", "120962"), !supportsAdmissionPrecheck)) {
            if (stryMutAct_9fa48("120963")) {
              {}
            } else {
              stryCov_9fa48("120963");
              admittedTargetNodeIds.push(targetNodeId);
              continue;
            }
          }
          let admissionDecision = null;
          try {
            if (stryMutAct_9fa48("120964")) {
              {}
            } else {
              stryCov_9fa48("120964");
              admissionDecision = await this.rebalanceCoordinator.checkProvisioningAdmission(stryMutAct_9fa48("120965") ? {} : (stryCov_9fa48("120965"), {
                type: OperationType.ADD,
                partitionId,
                entityType: SERVICE_TYPE.PARTITION,
                entityId: partitionId,
                nodeId: targetNodeId
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("120966")) {
              {}
            } else {
              stryCov_9fa48("120966");
              if (stryMutAct_9fa48("120969") ? false : stryMutAct_9fa48("120968") ? true : stryMutAct_9fa48("120967") ? this.isProvisioningAdmissionDeniedError(error) : (stryCov_9fa48("120967", "120968", "120969"), !this.isProvisioningAdmissionDeniedError(error))) {
                if (stryMutAct_9fa48("120970")) {
                  {}
                } else {
                  stryCov_9fa48("120970");
                  throw error;
                }
              }
              admissionDecision = stryMutAct_9fa48("120971") ? {} : (stryCov_9fa48("120971"), {
                allowed: stryMutAct_9fa48("120972") ? true : (stryCov_9fa48("120972"), false),
                admissionResult: stryMutAct_9fa48("120975") ? error.admissionResult && null : stryMutAct_9fa48("120974") ? false : stryMutAct_9fa48("120973") ? true : (stryCov_9fa48("120973", "120974", "120975"), error.admissionResult || null),
                error
              });
            }
          }
          if (stryMutAct_9fa48("120978") ? admissionDecision?.allowed !== true : stryMutAct_9fa48("120977") ? false : stryMutAct_9fa48("120976") ? true : (stryCov_9fa48("120976", "120977", "120978"), (stryMutAct_9fa48("120979") ? admissionDecision.allowed : (stryCov_9fa48("120979"), admissionDecision?.allowed)) === (stryMutAct_9fa48("120980") ? false : (stryCov_9fa48("120980"), true)))) {
            if (stryMutAct_9fa48("120981")) {
              {}
            } else {
              stryCov_9fa48("120981");
              admittedTargetNodeIds.push(targetNodeId);
              continue;
            }
          }
          const rejectionError = (stryMutAct_9fa48("120984") ? admissionDecision?.error || typeof admissionDecision.error === 'object' : stryMutAct_9fa48("120983") ? false : stryMutAct_9fa48("120982") ? true : (stryCov_9fa48("120982", "120983", "120984"), (stryMutAct_9fa48("120985") ? admissionDecision.error : (stryCov_9fa48("120985"), admissionDecision?.error)) && (stryMutAct_9fa48("120987") ? typeof admissionDecision.error !== 'object' : stryMutAct_9fa48("120986") ? true : (stryCov_9fa48("120986", "120987"), typeof admissionDecision.error === (stryMutAct_9fa48("120988") ? "" : (stryCov_9fa48("120988"), 'object')))))) ? admissionDecision.error : (() => {
            if (stryMutAct_9fa48("120989")) {
              {}
            } else {
              stryCov_9fa48("120989");
              const fallbackError = new Error(stryMutAct_9fa48("120990") ? `` : (stryCov_9fa48("120990"), `Provisioning admission denied on ${targetNodeId}`));
              fallbackError.admissionResult = stryMutAct_9fa48("120993") ? admissionDecision?.admissionResult && null : stryMutAct_9fa48("120992") ? false : stryMutAct_9fa48("120991") ? true : (stryCov_9fa48("120991", "120992", "120993"), (stryMutAct_9fa48("120994") ? admissionDecision.admissionResult : (stryCov_9fa48("120994"), admissionDecision?.admissionResult)) || null);
              return fallbackError;
            }
          })();
          const rejection = this.createProvisioningTargetRejection(targetNodeId, rejectionError);
          rejectedTargetNodePlans.push(rejection);
          this.logProvisioningTargetRejection(partitionId, targetNodeId, rejection);
        }
      }
      const maximumPrecheckedProvisionableReplicaCount = stryMutAct_9fa48("120995") ? routableNodeIdSet.size - admittedTargetNodeIds.length : (stryCov_9fa48("120995"), routableNodeIdSet.size + admittedTargetNodeIds.length);
      if (stryMutAct_9fa48("120998") ? supportsAdmissionPrecheck || maximumPrecheckedProvisionableReplicaCount < minimumRoutableReplicaCount : stryMutAct_9fa48("120997") ? false : stryMutAct_9fa48("120996") ? true : (stryCov_9fa48("120996", "120997", "120998"), supportsAdmissionPrecheck && (stryMutAct_9fa48("121001") ? maximumPrecheckedProvisionableReplicaCount >= minimumRoutableReplicaCount : stryMutAct_9fa48("121000") ? maximumPrecheckedProvisionableReplicaCount <= minimumRoutableReplicaCount : stryMutAct_9fa48("120999") ? true : (stryCov_9fa48("120999", "121000", "121001"), maximumPrecheckedProvisionableReplicaCount < minimumRoutableReplicaCount)))) {
        if (stryMutAct_9fa48("121002")) {
          {}
        } else {
          stryCov_9fa48("121002");
          this.throwProvisioningInsufficientTargets(stryMutAct_9fa48("121003") ? {} : (stryCov_9fa48("121003"), {
            partitionId,
            targetReplicaCount,
            minimumRoutableReplicaCount,
            candidateTargetNodeIds: provisionTargetNodeIds,
            existingRoutableNodeIds: stryMutAct_9fa48("121004") ? [] : (stryCov_9fa48("121004"), [...routableNodeIdSet]),
            plannedTargetNodeIds: admittedTargetNodeIds,
            rejectedTargetNodePlans,
            maximumProvisionableReplicaCount: maximumPrecheckedProvisionableReplicaCount
          }));
        }
      }
      for (const targetNodeId of admittedTargetNodeIds) {
        if (stryMutAct_9fa48("121005")) {
          {}
        } else {
          stryCov_9fa48("121005");
          if (stryMutAct_9fa48("121009") ? plannedOperations.length < requiredNewReplicaCount : stryMutAct_9fa48("121008") ? plannedOperations.length > requiredNewReplicaCount : stryMutAct_9fa48("121007") ? false : stryMutAct_9fa48("121006") ? true : (stryCov_9fa48("121006", "121007", "121008", "121009"), plannedOperations.length >= requiredNewReplicaCount)) {
            if (stryMutAct_9fa48("121010")) {
              {}
            } else {
              stryCov_9fa48("121010");
              break;
            }
          }
          try {
            if (stryMutAct_9fa48("121011")) {
              {}
            } else {
              stryCov_9fa48("121011");
              const operation = await this.rebalanceCoordinator.createOperation(stryMutAct_9fa48("121012") ? {} : (stryCov_9fa48("121012"), {
                type: OperationType.ADD,
                partitionId,
                entityType: SERVICE_TYPE.PARTITION,
                entityId: partitionId,
                nodeId: targetNodeId,
                skipProvisioningAdmissionRecheck: precheckedTargetNodeIds.has(targetNodeId),
                controlPlaneMutationWorkClass: CONTROL_PLANE_MUTATION_WORK_CLASS.INTERACTIVE,
                // Initial partition provisioning executes these operations inline
                // below, so skip the redundant coordinator-created dispatch trigger.
                emitOperationCreated: stryMutAct_9fa48("121013") ? true : (stryCov_9fa48("121013"), false)
              }));
              plannedOperations.push(operation);
              const operationCreatedAt = Number(stryMutAct_9fa48("121014") ? operation.createdAt : (stryCov_9fa48("121014"), operation?.createdAt));
              if (stryMutAct_9fa48("121017") ? !Number.isFinite(operationCreatedAt) && operationCreatedAt >= operationPlanningStartedAtMs - 1000 : stryMutAct_9fa48("121016") ? false : stryMutAct_9fa48("121015") ? true : (stryCov_9fa48("121015", "121016", "121017"), (stryMutAct_9fa48("121018") ? Number.isFinite(operationCreatedAt) : (stryCov_9fa48("121018"), !Number.isFinite(operationCreatedAt))) || (stryMutAct_9fa48("121021") ? operationCreatedAt < operationPlanningStartedAtMs - 1000 : stryMutAct_9fa48("121020") ? operationCreatedAt > operationPlanningStartedAtMs - 1000 : stryMutAct_9fa48("121019") ? false : (stryCov_9fa48("121019", "121020", "121021"), operationCreatedAt >= (stryMutAct_9fa48("121022") ? operationPlanningStartedAtMs + 1000 : (stryCov_9fa48("121022"), operationPlanningStartedAtMs - 1000)))))) {
                if (stryMutAct_9fa48("121023")) {
                  {}
                } else {
                  stryCov_9fa48("121023");
                  createdPlanningOperations.push(operation);
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("121024")) {
              {}
            } else {
              stryCov_9fa48("121024");
              if (stryMutAct_9fa48("121027") ? false : stryMutAct_9fa48("121026") ? true : stryMutAct_9fa48("121025") ? this.isProvisioningAdmissionDeniedError(error) : (stryCov_9fa48("121025", "121026", "121027"), !this.isProvisioningAdmissionDeniedError(error))) {
                if (stryMutAct_9fa48("121028")) {
                  {}
                } else {
                  stryCov_9fa48("121028");
                  throw error;
                }
              }
              const rejection = this.createProvisioningTargetRejection(targetNodeId, error);
              rejectedTargetNodePlans.push(rejection);
              this.logProvisioningTargetRejection(partitionId, targetNodeId, rejection);
            }
          }
        }
      }
      const maximumProvisionableReplicaCount = stryMutAct_9fa48("121029") ? routableNodeIdSet.size - plannedOperations.length : (stryCov_9fa48("121029"), routableNodeIdSet.size + plannedOperations.length);
      const implicitFallbackMinimumReplicaCount = this.resolveImplicitProvisioningFallbackReplicaCount(targetReplicaCount, stryMutAct_9fa48("121030") ? provisionTargetDiagnostics.activeNodeRowCount : (stryCov_9fa48("121030"), provisionTargetDiagnostics?.activeNodeRowCount));
      if (stryMutAct_9fa48("121034") ? maximumProvisionableReplicaCount >= minimumRoutableReplicaCount : stryMutAct_9fa48("121033") ? maximumProvisionableReplicaCount <= minimumRoutableReplicaCount : stryMutAct_9fa48("121032") ? false : stryMutAct_9fa48("121031") ? true : (stryCov_9fa48("121031", "121032", "121033", "121034"), maximumProvisionableReplicaCount < minimumRoutableReplicaCount)) {
        if (stryMutAct_9fa48("121035")) {
          {}
        } else {
          stryCov_9fa48("121035");
          if (stryMutAct_9fa48("121038") ? !hasExplicitMinimumRoutableReplicaCount && maximumProvisionableReplicaCount > 0 || maximumProvisionableReplicaCount >= implicitFallbackMinimumReplicaCount : stryMutAct_9fa48("121037") ? false : stryMutAct_9fa48("121036") ? true : (stryCov_9fa48("121036", "121037", "121038"), (stryMutAct_9fa48("121040") ? !hasExplicitMinimumRoutableReplicaCount || maximumProvisionableReplicaCount > 0 : stryMutAct_9fa48("121039") ? true : (stryCov_9fa48("121039", "121040"), (stryMutAct_9fa48("121041") ? hasExplicitMinimumRoutableReplicaCount : (stryCov_9fa48("121041"), !hasExplicitMinimumRoutableReplicaCount)) && (stryMutAct_9fa48("121044") ? maximumProvisionableReplicaCount <= 0 : stryMutAct_9fa48("121043") ? maximumProvisionableReplicaCount >= 0 : stryMutAct_9fa48("121042") ? true : (stryCov_9fa48("121042", "121043", "121044"), maximumProvisionableReplicaCount > 0)))) && (stryMutAct_9fa48("121047") ? maximumProvisionableReplicaCount < implicitFallbackMinimumReplicaCount : stryMutAct_9fa48("121046") ? maximumProvisionableReplicaCount > implicitFallbackMinimumReplicaCount : stryMutAct_9fa48("121045") ? true : (stryCov_9fa48("121045", "121046", "121047"), maximumProvisionableReplicaCount >= implicitFallbackMinimumReplicaCount)))) {
            if (stryMutAct_9fa48("121048")) {
              {}
            } else {
              stryCov_9fa48("121048");
              const previousTargetReplicaCount = targetReplicaCount;
              const previousMinimumRoutableReplicaCount = minimumRoutableReplicaCount;
              targetReplicaCount = stryMutAct_9fa48("121049") ? Math.min(1, maximumProvisionableReplicaCount) : (stryCov_9fa48("121049"), Math.max(1, maximumProvisionableReplicaCount));
              minimumRoutableReplicaCount = targetReplicaCount;
              enforceEveryProvisioningOperation = stryMutAct_9fa48("121053") ? minimumRoutableReplicaCount < targetReplicaCount : stryMutAct_9fa48("121052") ? minimumRoutableReplicaCount > targetReplicaCount : stryMutAct_9fa48("121051") ? false : stryMutAct_9fa48("121050") ? true : (stryCov_9fa48("121050", "121051", "121052", "121053"), minimumRoutableReplicaCount >= targetReplicaCount);
              this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED, stryMutAct_9fa48("121054") ? {} : (stryCov_9fa48("121054"), {
                partitionId,
                requiredReplicaCount: previousTargetReplicaCount,
                resolvedReplicaCount: targetReplicaCount,
                minimumRoutableReplicaCount,
                previousMinimumRoutableReplicaCount,
                planningShortfall: stryMutAct_9fa48("121055") ? false : (stryCov_9fa48("121055"), true),
                existingRoutableNodeIds: stryMutAct_9fa48("121056") ? [] : (stryCov_9fa48("121056"), [...routableNodeIdSet]),
                plannedTargetNodeIds: stryMutAct_9fa48("121057") ? plannedOperations.map(operation => operation?.targetNodeId || operation?.nodeId || null) : (stryCov_9fa48("121057"), plannedOperations.map(stryMutAct_9fa48("121058") ? () => undefined : (stryCov_9fa48("121058"), operation => stryMutAct_9fa48("121061") ? (operation?.targetNodeId || operation?.nodeId) && null : stryMutAct_9fa48("121060") ? false : stryMutAct_9fa48("121059") ? true : (stryCov_9fa48("121059", "121060", "121061"), (stryMutAct_9fa48("121063") ? operation?.targetNodeId && operation?.nodeId : stryMutAct_9fa48("121062") ? false : (stryCov_9fa48("121062", "121063"), (stryMutAct_9fa48("121064") ? operation.targetNodeId : (stryCov_9fa48("121064"), operation?.targetNodeId)) || (stryMutAct_9fa48("121065") ? operation.nodeId : (stryCov_9fa48("121065"), operation?.nodeId)))) || null))).filter(stryMutAct_9fa48("121066") ? () => undefined : (stryCov_9fa48("121066"), nodeId => stryMutAct_9fa48("121069") ? typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("121068") ? false : stryMutAct_9fa48("121067") ? true : (stryCov_9fa48("121067", "121068", "121069"), (stryMutAct_9fa48("121071") ? typeof nodeId !== 'string' : stryMutAct_9fa48("121070") ? true : (stryCov_9fa48("121070", "121071"), typeof nodeId === (stryMutAct_9fa48("121072") ? "" : (stryCov_9fa48("121072"), 'string')))) && (stryMutAct_9fa48("121075") ? nodeId.length <= 0 : stryMutAct_9fa48("121074") ? nodeId.length >= 0 : stryMutAct_9fa48("121073") ? true : (stryCov_9fa48("121073", "121074", "121075"), nodeId.length > 0)))))),
                rejectedTargetNodePlans
              }));
            }
          } else {
            if (stryMutAct_9fa48("121076")) {
              {}
            } else {
              stryCov_9fa48("121076");
              await this.abortProvisioningPlanningOperations(partitionId, createdPlanningOperations, QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_ABORTED_PRE_DISPATCH);
              this.throwProvisioningInsufficientTargets(stryMutAct_9fa48("121077") ? {} : (stryCov_9fa48("121077"), {
                partitionId,
                targetReplicaCount,
                minimumRoutableReplicaCount,
                candidateTargetNodeIds: provisionTargetNodeIds,
                existingRoutableNodeIds: stryMutAct_9fa48("121078") ? [] : (stryCov_9fa48("121078"), [...routableNodeIdSet]),
                plannedTargetNodeIds: stryMutAct_9fa48("121079") ? plannedOperations.map(operation => operation?.targetNodeId || operation?.nodeId || null) : (stryCov_9fa48("121079"), plannedOperations.map(stryMutAct_9fa48("121080") ? () => undefined : (stryCov_9fa48("121080"), operation => stryMutAct_9fa48("121083") ? (operation?.targetNodeId || operation?.nodeId) && null : stryMutAct_9fa48("121082") ? false : stryMutAct_9fa48("121081") ? true : (stryCov_9fa48("121081", "121082", "121083"), (stryMutAct_9fa48("121085") ? operation?.targetNodeId && operation?.nodeId : stryMutAct_9fa48("121084") ? false : (stryCov_9fa48("121084", "121085"), (stryMutAct_9fa48("121086") ? operation.targetNodeId : (stryCov_9fa48("121086"), operation?.targetNodeId)) || (stryMutAct_9fa48("121087") ? operation.nodeId : (stryCov_9fa48("121087"), operation?.nodeId)))) || null))).filter(stryMutAct_9fa48("121088") ? () => undefined : (stryCov_9fa48("121088"), nodeId => stryMutAct_9fa48("121091") ? typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("121090") ? false : stryMutAct_9fa48("121089") ? true : (stryCov_9fa48("121089", "121090", "121091"), (stryMutAct_9fa48("121093") ? typeof nodeId !== 'string' : stryMutAct_9fa48("121092") ? true : (stryCov_9fa48("121092", "121093"), typeof nodeId === (stryMutAct_9fa48("121094") ? "" : (stryCov_9fa48("121094"), 'string')))) && (stryMutAct_9fa48("121097") ? nodeId.length <= 0 : stryMutAct_9fa48("121096") ? nodeId.length >= 0 : stryMutAct_9fa48("121095") ? true : (stryCov_9fa48("121095", "121096", "121097"), nodeId.length > 0)))))),
                rejectedTargetNodePlans,
                maximumProvisionableReplicaCount
              }));
            }
          }
        }
      }
      const bootstrapTopology = this.buildInitialPartitionBootstrapTopology(partitionId, plannedOperations);
      const bootstrapLeaderNodeId = this.resolveInitialPartitionBootstrapLeaderNodeId(partitionId, plannedOperations);
      this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, stryMutAct_9fa48("121098") ? {} : (stryCov_9fa48("121098"), {
        partitionId,
        targetReplicaCount,
        minimumRoutableReplicaCount,
        enforceEveryProvisioningOperation,
        candidateTargetNodeCount: provisionTargetNodeIds.length,
        rejectedTargetNodeCount: rejectedTargetNodePlans.length,
        plannedOperationCount: plannedOperations.length,
        phase: stryMutAct_9fa48("121099") ? "" : (stryCov_9fa48("121099"), 'dispatch_operations'),
        remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, stryMutAct_9fa48("121100") ? {} : (stryCov_9fa48("121100"), {
          now: this.nowFn
        }))
      }));
      const metadataWaitReplicaIds = stryMutAct_9fa48("121101") ? ["Stryker was here"] : (stryCov_9fa48("121101"), []);
      for (const operation of plannedOperations) {
        if (stryMutAct_9fa48("121102")) {
          {}
        } else {
          stryCov_9fa48("121102");
          operation[ReplicaOperationField.REPLICA_IDS] = bootstrapTopology.replicaIds;
          operation[ReplicaOperationField.PEER_ADDRESSES] = bootstrapTopology.peerAddresses;
          const initialStepEntry = (stryMutAct_9fa48("121105") ? Array.isArray(operation.stepsHistory) && operation.stepsHistory.length > 0 && operation.stepsHistory[0] || typeof operation.stepsHistory[0] === 'object' : stryMutAct_9fa48("121104") ? false : stryMutAct_9fa48("121103") ? true : (stryCov_9fa48("121103", "121104", "121105"), (stryMutAct_9fa48("121107") ? Array.isArray(operation.stepsHistory) && operation.stepsHistory.length > 0 || operation.stepsHistory[0] : stryMutAct_9fa48("121106") ? true : (stryCov_9fa48("121106", "121107"), (stryMutAct_9fa48("121109") ? Array.isArray(operation.stepsHistory) || operation.stepsHistory.length > 0 : stryMutAct_9fa48("121108") ? true : (stryCov_9fa48("121108", "121109"), Array.isArray(operation.stepsHistory) && (stryMutAct_9fa48("121112") ? operation.stepsHistory.length <= 0 : stryMutAct_9fa48("121111") ? operation.stepsHistory.length >= 0 : stryMutAct_9fa48("121110") ? true : (stryCov_9fa48("121110", "121111", "121112"), operation.stepsHistory.length > 0)))) && operation.stepsHistory[0])) && (stryMutAct_9fa48("121114") ? typeof operation.stepsHistory[0] !== 'object' : stryMutAct_9fa48("121113") ? true : (stryCov_9fa48("121113", "121114"), typeof operation.stepsHistory[0] === (stryMutAct_9fa48("121115") ? "" : (stryCov_9fa48("121115"), 'object')))))) ? operation.stepsHistory[0] : null;
          if (stryMutAct_9fa48("121117") ? false : stryMutAct_9fa48("121116") ? true : (stryCov_9fa48("121116", "121117"), initialStepEntry)) {
            if (stryMutAct_9fa48("121118")) {
              {}
            } else {
              stryCov_9fa48("121118");
              initialStepEntry[OPERATION_METADATA_KEY.REPLICA_IDS] = bootstrapTopology.replicaIds;
              initialStepEntry[OPERATION_METADATA_KEY.PEER_ADDRESSES] = bootstrapTopology.peerAddresses;
              if (stryMutAct_9fa48("121120") ? false : stryMutAct_9fa48("121119") ? true : (stryCov_9fa48("121119", "121120"), bootstrapTableMetadata)) {
                if (stryMutAct_9fa48("121121")) {
                  {}
                } else {
                  stryCov_9fa48("121121");
                  initialStepEntry[OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA] = bootstrapTableMetadata;
                }
              }
              if (stryMutAct_9fa48("121123") ? false : stryMutAct_9fa48("121122") ? true : (stryCov_9fa48("121122", "121123"), bootstrapPartitionMetadata)) {
                if (stryMutAct_9fa48("121124")) {
                  {}
                } else {
                  stryCov_9fa48("121124");
                  initialStepEntry[OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA] = bootstrapPartitionMetadata;
                }
              }
            }
          }
          if (stryMutAct_9fa48("121126") ? false : stryMutAct_9fa48("121125") ? true : (stryCov_9fa48("121125", "121126"), bootstrapTableMetadata)) {
            if (stryMutAct_9fa48("121127")) {
              {}
            } else {
              stryCov_9fa48("121127");
              operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] = bootstrapTableMetadata;
            }
          }
          if (stryMutAct_9fa48("121129") ? false : stryMutAct_9fa48("121128") ? true : (stryCov_9fa48("121128", "121129"), bootstrapPartitionMetadata)) {
            if (stryMutAct_9fa48("121130")) {
              {}
            } else {
              stryCov_9fa48("121130");
              operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] = bootstrapPartitionMetadata;
            }
          }
          if (stryMutAct_9fa48("121133") ? typeof this.rebalanceCoordinator.dispatchOperation === 'function' || typeof this.rebalanceCoordinator.persistOperationUpdate === 'function' : stryMutAct_9fa48("121132") ? false : stryMutAct_9fa48("121131") ? true : (stryCov_9fa48("121131", "121132", "121133"), (stryMutAct_9fa48("121135") ? typeof this.rebalanceCoordinator.dispatchOperation !== 'function' : stryMutAct_9fa48("121134") ? true : (stryCov_9fa48("121134", "121135"), typeof this.rebalanceCoordinator.dispatchOperation === (stryMutAct_9fa48("121136") ? "" : (stryCov_9fa48("121136"), 'function')))) && (stryMutAct_9fa48("121138") ? typeof this.rebalanceCoordinator.persistOperationUpdate !== 'function' : stryMutAct_9fa48("121137") ? true : (stryCov_9fa48("121137", "121138"), typeof this.rebalanceCoordinator.persistOperationUpdate === (stryMutAct_9fa48("121139") ? "" : (stryCov_9fa48("121139"), 'function')))))) {
            if (stryMutAct_9fa48("121140")) {
              {}
            } else {
              stryCov_9fa48("121140");
              await this.rebalanceCoordinator.persistOperationUpdate(operation);
            }
          }
          const executionResult = (stryMutAct_9fa48("121143") ? typeof this.rebalanceCoordinator.dispatchOperation !== 'function' : stryMutAct_9fa48("121142") ? false : stryMutAct_9fa48("121141") ? true : (stryCov_9fa48("121141", "121142", "121143"), typeof this.rebalanceCoordinator.dispatchOperation === (stryMutAct_9fa48("121144") ? "" : (stryCov_9fa48("121144"), 'function')))) ? await this.rebalanceCoordinator.dispatchOperation(operation) : await this.rebalanceCoordinator.executeOperation(operation);
          if (stryMutAct_9fa48("121147") ? executionResult && executionResult.success === false || executionResult.skipped !== true : stryMutAct_9fa48("121146") ? false : stryMutAct_9fa48("121145") ? true : (stryCov_9fa48("121145", "121146", "121147"), (stryMutAct_9fa48("121149") ? executionResult || executionResult.success === false : stryMutAct_9fa48("121148") ? true : (stryCov_9fa48("121148", "121149"), executionResult && (stryMutAct_9fa48("121151") ? executionResult.success !== false : stryMutAct_9fa48("121150") ? true : (stryCov_9fa48("121150", "121151"), executionResult.success === (stryMutAct_9fa48("121152") ? true : (stryCov_9fa48("121152"), false)))))) && (stryMutAct_9fa48("121154") ? executionResult.skipped === true : stryMutAct_9fa48("121153") ? true : (stryCov_9fa48("121153", "121154"), executionResult.skipped !== (stryMutAct_9fa48("121155") ? false : (stryCov_9fa48("121155"), true)))))) {
            if (stryMutAct_9fa48("121156")) {
              {}
            } else {
              stryCov_9fa48("121156");
              if (stryMutAct_9fa48("121158") ? false : stryMutAct_9fa48("121157") ? true : (stryCov_9fa48("121157", "121158"), enforceEveryProvisioningOperation)) {
                if (stryMutAct_9fa48("121159")) {
                  {}
                } else {
                  stryCov_9fa48("121159");
                  throw new Error(stryMutAct_9fa48("121162") ? executionResult.error && QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DISPATCH_FAILED : stryMutAct_9fa48("121161") ? false : stryMutAct_9fa48("121160") ? true : (stryCov_9fa48("121160", "121161", "121162"), executionResult.error || QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DISPATCH_FAILED));
                }
              }
              continue;
            }
          }
          const replicaId = stryMutAct_9fa48("121165") ? (operation?.replicaId || operation?.replica_id) && null : stryMutAct_9fa48("121164") ? false : stryMutAct_9fa48("121163") ? true : (stryCov_9fa48("121163", "121164", "121165"), (stryMutAct_9fa48("121167") ? operation?.replicaId && operation?.replica_id : stryMutAct_9fa48("121166") ? false : (stryCov_9fa48("121166", "121167"), (stryMutAct_9fa48("121168") ? operation.replicaId : (stryCov_9fa48("121168"), operation?.replicaId)) || (stryMutAct_9fa48("121169") ? operation.replica_id : (stryCov_9fa48("121169"), operation?.replica_id)))) || null);
          if (stryMutAct_9fa48("121172") ? typeof replicaId === 'string' || replicaId.length > 0 : stryMutAct_9fa48("121171") ? false : stryMutAct_9fa48("121170") ? true : (stryCov_9fa48("121170", "121171", "121172"), (stryMutAct_9fa48("121174") ? typeof replicaId !== 'string' : stryMutAct_9fa48("121173") ? true : (stryCov_9fa48("121173", "121174"), typeof replicaId === (stryMutAct_9fa48("121175") ? "" : (stryCov_9fa48("121175"), 'string')))) && (stryMutAct_9fa48("121178") ? replicaId.length <= 0 : stryMutAct_9fa48("121177") ? replicaId.length >= 0 : stryMutAct_9fa48("121176") ? true : (stryCov_9fa48("121176", "121177", "121178"), replicaId.length > 0)))) {
            if (stryMutAct_9fa48("121179")) {
              {}
            } else {
              stryCov_9fa48("121179");
              metadataWaitReplicaIds.push(replicaId);
            }
          }
        }
      }
      const uniqueMetadataWaitReplicaIds = stryMutAct_9fa48("121180") ? [] : (stryCov_9fa48("121180"), [...new Set(metadataWaitReplicaIds)]);
      if (stryMutAct_9fa48("121184") ? uniqueMetadataWaitReplicaIds.length <= 0 : stryMutAct_9fa48("121183") ? uniqueMetadataWaitReplicaIds.length >= 0 : stryMutAct_9fa48("121182") ? false : stryMutAct_9fa48("121181") ? true : (stryCov_9fa48("121181", "121182", "121183", "121184"), uniqueMetadataWaitReplicaIds.length > 0)) {
        if (stryMutAct_9fa48("121185")) {
          {}
        } else {
          stryCov_9fa48("121185");
          if (stryMutAct_9fa48("121187") ? false : stryMutAct_9fa48("121186") ? true : (stryCov_9fa48("121186", "121187"), enforceEveryProvisioningOperation)) {
            if (stryMutAct_9fa48("121188")) {
              {}
            } else {
              stryCov_9fa48("121188");
              this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, stryMutAct_9fa48("121189") ? {} : (stryCov_9fa48("121189"), {
                partitionId,
                phase: stryMutAct_9fa48("121190") ? "" : (stryCov_9fa48("121190"), 'wait_replica_metadata'),
                replicaIds: uniqueMetadataWaitReplicaIds,
                remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, stryMutAct_9fa48("121191") ? {} : (stryCov_9fa48("121191"), {
                  now: this.nowFn
                }))
              }));
              await Promise.all(uniqueMetadataWaitReplicaIds.map(stryMutAct_9fa48("121192") ? () => undefined : (stryCov_9fa48("121192"), replicaId => this.waitForPartitionServiceMetadata(replicaId, timeoutBudget))));
            }
          } else {
            if (stryMutAct_9fa48("121193")) {
              {}
            } else {
              stryCov_9fa48("121193");
              this.logger.debug(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_START, stryMutAct_9fa48("121194") ? {} : (stryCov_9fa48("121194"), {
                partitionId,
                phase: stryMutAct_9fa48("121195") ? "" : (stryCov_9fa48("121195"), 'wait_minimum_replica_metadata'),
                replicaIds: uniqueMetadataWaitReplicaIds,
                minimumRoutableReplicaCount,
                remainingBudgetMs: getRemainingBudgetMs(timeoutBudget, stryMutAct_9fa48("121196") ? {} : (stryCov_9fa48("121196"), {
                  now: this.nowFn
                }))
              }));
              await this.waitForMinimumRoutableReplicaMetadata(partitionId, uniqueMetadataWaitReplicaIds, minimumRoutableReplicaCount, timeoutBudget, routingReadinessDimension);
            }
          }
        }
      }
      await this.waitForRoutablePartitionServiceCount(partitionId, minimumRoutableReplicaCount, timeoutBudget, routingReadinessDimension);
      await this.waitForPartitionLeaderService(partitionId, timeoutBudget, stryMutAct_9fa48("121197") ? {} : (stryCov_9fa48("121197"), {
        partitionMetadata: bootstrapPartitionMetadata,
        bootstrapLeaderNodeId,
        routingReadinessDimension
      }));
      const finalRoutableNodeIds = this.getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension);
      return stryMutAct_9fa48("121198") ? {} : (stryCov_9fa48("121198"), {
        requestedReplicaCount,
        resolvedReplicaCount: targetReplicaCount,
        minimumRoutableReplicaCount,
        routableReplicaCount: finalRoutableNodeIds.length
      });
    }
  }

  /**
   * Return true when one create-operation error was denied by admission.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isProvisioningAdmissionDeniedError(error) {
    if (stryMutAct_9fa48("121199")) {
      {}
    } else {
      stryCov_9fa48("121199");
      if (stryMutAct_9fa48("121202") ? !error && typeof error !== 'object' : stryMutAct_9fa48("121201") ? false : stryMutAct_9fa48("121200") ? true : (stryCov_9fa48("121200", "121201", "121202"), (stryMutAct_9fa48("121203") ? error : (stryCov_9fa48("121203"), !error)) || (stryMutAct_9fa48("121205") ? typeof error === 'object' : stryMutAct_9fa48("121204") ? false : (stryCov_9fa48("121204", "121205"), typeof error !== (stryMutAct_9fa48("121206") ? "" : (stryCov_9fa48("121206"), 'object')))))) {
        if (stryMutAct_9fa48("121207")) {
          {}
        } else {
          stryCov_9fa48("121207");
          return stryMutAct_9fa48("121208") ? true : (stryCov_9fa48("121208"), false);
        }
      }
      const admissionResult = error.admissionResult;
      if (stryMutAct_9fa48("121211") ? !admissionResult && typeof admissionResult !== 'object' : stryMutAct_9fa48("121210") ? false : stryMutAct_9fa48("121209") ? true : (stryCov_9fa48("121209", "121210", "121211"), (stryMutAct_9fa48("121212") ? admissionResult : (stryCov_9fa48("121212"), !admissionResult)) || (stryMutAct_9fa48("121214") ? typeof admissionResult === 'object' : stryMutAct_9fa48("121213") ? false : (stryCov_9fa48("121213", "121214"), typeof admissionResult !== (stryMutAct_9fa48("121215") ? "" : (stryCov_9fa48("121215"), 'object')))))) {
        if (stryMutAct_9fa48("121216")) {
          {}
        } else {
          stryCov_9fa48("121216");
          return stryMutAct_9fa48("121217") ? true : (stryCov_9fa48("121217"), false);
        }
      }
      if (stryMutAct_9fa48("121220") ? admissionResult.allowed !== true : stryMutAct_9fa48("121219") ? false : stryMutAct_9fa48("121218") ? true : (stryCov_9fa48("121218", "121219", "121220"), admissionResult.allowed === (stryMutAct_9fa48("121221") ? false : (stryCov_9fa48("121221"), true)))) {
        if (stryMutAct_9fa48("121222")) {
          {}
        } else {
          stryCov_9fa48("121222");
          return stryMutAct_9fa48("121223") ? true : (stryCov_9fa48("121223"), false);
        }
      }
      return stryMutAct_9fa48("121224") ? false : (stryCov_9fa48("121224"), true);
    }
  }

  /**
   * Normalize one list of admission reason entries to reason-code strings.
   * @param {Array<*>} reasonEntries
   * @return {string[]}
   * @private
   */
  normalizeProvisioningReasonCodes(reasonEntries) {
    if (stryMutAct_9fa48("121225")) {
      {}
    } else {
      stryCov_9fa48("121225");
      if (stryMutAct_9fa48("121228") ? false : stryMutAct_9fa48("121227") ? true : stryMutAct_9fa48("121226") ? Array.isArray(reasonEntries) : (stryCov_9fa48("121226", "121227", "121228"), !Array.isArray(reasonEntries))) {
        if (stryMutAct_9fa48("121229")) {
          {}
        } else {
          stryCov_9fa48("121229");
          return stryMutAct_9fa48("121230") ? ["Stryker was here"] : (stryCov_9fa48("121230"), []);
        }
      }
      const reasonCodes = stryMutAct_9fa48("121231") ? ["Stryker was here"] : (stryCov_9fa48("121231"), []);
      const seenReasonCodes = new Set();
      for (const reasonEntry of reasonEntries) {
        if (stryMutAct_9fa48("121232")) {
          {}
        } else {
          stryCov_9fa48("121232");
          const normalizedReason = String(stryMutAct_9fa48("121235") ? (reasonEntry?.code || reasonEntry?.reason || reasonEntry) && '' : stryMutAct_9fa48("121234") ? false : stryMutAct_9fa48("121233") ? true : (stryCov_9fa48("121233", "121234", "121235"), (stryMutAct_9fa48("121237") ? (reasonEntry?.code || reasonEntry?.reason) && reasonEntry : stryMutAct_9fa48("121236") ? false : (stryCov_9fa48("121236", "121237"), (stryMutAct_9fa48("121239") ? reasonEntry?.code && reasonEntry?.reason : stryMutAct_9fa48("121238") ? false : (stryCov_9fa48("121238", "121239"), (stryMutAct_9fa48("121240") ? reasonEntry.code : (stryCov_9fa48("121240"), reasonEntry?.code)) || (stryMutAct_9fa48("121241") ? reasonEntry.reason : (stryCov_9fa48("121241"), reasonEntry?.reason)))) || reasonEntry)) || (stryMutAct_9fa48("121242") ? "Stryker was here!" : (stryCov_9fa48("121242"), ''))));
          if (stryMutAct_9fa48("121245") ? !normalizedReason && seenReasonCodes.has(normalizedReason) : stryMutAct_9fa48("121244") ? false : stryMutAct_9fa48("121243") ? true : (stryCov_9fa48("121243", "121244", "121245"), (stryMutAct_9fa48("121246") ? normalizedReason : (stryCov_9fa48("121246"), !normalizedReason)) || seenReasonCodes.has(normalizedReason))) {
            if (stryMutAct_9fa48("121247")) {
              {}
            } else {
              stryCov_9fa48("121247");
              continue;
            }
          }
          seenReasonCodes.add(normalizedReason);
          reasonCodes.push(normalizedReason);
          if (stryMutAct_9fa48("121251") ? reasonCodes.length < PROVISIONING_REJECTION_DETAIL_LIMIT : stryMutAct_9fa48("121250") ? reasonCodes.length > PROVISIONING_REJECTION_DETAIL_LIMIT : stryMutAct_9fa48("121249") ? false : stryMutAct_9fa48("121248") ? true : (stryCov_9fa48("121248", "121249", "121250", "121251"), reasonCodes.length >= PROVISIONING_REJECTION_DETAIL_LIMIT)) {
            if (stryMutAct_9fa48("121252")) {
              {}
            } else {
              stryCov_9fa48("121252");
              break;
            }
          }
        }
      }
      return reasonCodes;
    }
  }

  /**
   * Build one structured provisioning rejection payload.
   * @param {string} targetNodeId
   * @param {Error} error
   * @return {Object}
   * @private
   */
  createProvisioningTargetRejection(targetNodeId, error) {
    if (stryMutAct_9fa48("121253")) {
      {}
    } else {
      stryCov_9fa48("121253");
      const admissionResult = stryMutAct_9fa48("121256") ? error?.admissionResult && null : stryMutAct_9fa48("121255") ? false : stryMutAct_9fa48("121254") ? true : (stryCov_9fa48("121254", "121255", "121256"), (stryMutAct_9fa48("121257") ? error.admissionResult : (stryCov_9fa48("121257"), error?.admissionResult)) || null);
      const ineligibleNode = stryMutAct_9fa48("121260") ? admissionResult?.ineligibleNodes?.[0] && null : stryMutAct_9fa48("121259") ? false : stryMutAct_9fa48("121258") ? true : (stryCov_9fa48("121258", "121259", "121260"), (stryMutAct_9fa48("121262") ? admissionResult.ineligibleNodes?.[0] : stryMutAct_9fa48("121261") ? admissionResult?.ineligibleNodes[0] : (stryCov_9fa48("121261", "121262"), admissionResult?.ineligibleNodes?.[0])) || null);
      const blockingReasons = this.normalizeProvisioningReasonCodes(stryMutAct_9fa48("121263") ? admissionResult.blockingReasons : (stryCov_9fa48("121263"), admissionResult?.blockingReasons));
      const reasonCodes = this.normalizeProvisioningReasonCodes(stryMutAct_9fa48("121264") ? ineligibleNode.reasonCodes : (stryCov_9fa48("121264"), ineligibleNode?.reasonCodes));
      return stryMutAct_9fa48("121265") ? {} : (stryCov_9fa48("121265"), {
        targetNodeId,
        decisionType: stryMutAct_9fa48("121268") ? admissionResult?.decisionType && null : stryMutAct_9fa48("121267") ? false : stryMutAct_9fa48("121266") ? true : (stryCov_9fa48("121266", "121267", "121268"), (stryMutAct_9fa48("121269") ? admissionResult.decisionType : (stryCov_9fa48("121269"), admissionResult?.decisionType)) || null),
        blockingReasons,
        reasonCodes,
        nodeSummary: stryMutAct_9fa48("121272") ? ineligibleNode?.nodeSummary && null : stryMutAct_9fa48("121271") ? false : stryMutAct_9fa48("121270") ? true : (stryCov_9fa48("121270", "121271", "121272"), (stryMutAct_9fa48("121273") ? ineligibleNode.nodeSummary : (stryCov_9fa48("121273"), ineligibleNode?.nodeSummary)) || null),
        readinessSnapshot: stryMutAct_9fa48("121276") ? admissionResult?.readinessSnapshots?.[targetNodeId] && null : stryMutAct_9fa48("121275") ? false : stryMutAct_9fa48("121274") ? true : (stryCov_9fa48("121274", "121275", "121276"), (stryMutAct_9fa48("121278") ? admissionResult.readinessSnapshots?.[targetNodeId] : stryMutAct_9fa48("121277") ? admissionResult?.readinessSnapshots[targetNodeId] : (stryCov_9fa48("121277", "121278"), admissionResult?.readinessSnapshots?.[targetNodeId])) || null),
        message: stryMutAct_9fa48("121281") ? error?.message && null : stryMutAct_9fa48("121280") ? false : stryMutAct_9fa48("121279") ? true : (stryCov_9fa48("121279", "121280", "121281"), (stryMutAct_9fa48("121282") ? error.message : (stryCov_9fa48("121282"), error?.message)) || null)
      });
    }
  }

  /**
   * Emit one structured target-rejection warning entry.
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @param {Object} rejection
   * @return {void}
   * @private
   */
  logProvisioningTargetRejection(partitionId, targetNodeId, rejection) {
    if (stryMutAct_9fa48("121283")) {
      {}
    } else {
      stryCov_9fa48("121283");
      this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_REJECTED, stryMutAct_9fa48("121284") ? {} : (stryCov_9fa48("121284"), {
        partitionId,
        targetNodeId,
        decisionType: stryMutAct_9fa48("121287") ? rejection?.decisionType && null : stryMutAct_9fa48("121286") ? false : stryMutAct_9fa48("121285") ? true : (stryCov_9fa48("121285", "121286", "121287"), (stryMutAct_9fa48("121288") ? rejection.decisionType : (stryCov_9fa48("121288"), rejection?.decisionType)) || null),
        blockingReasons: Array.isArray(stryMutAct_9fa48("121289") ? rejection.blockingReasons : (stryCov_9fa48("121289"), rejection?.blockingReasons)) ? rejection.blockingReasons : stryMutAct_9fa48("121290") ? ["Stryker was here"] : (stryCov_9fa48("121290"), []),
        reasonCodes: Array.isArray(stryMutAct_9fa48("121291") ? rejection.reasonCodes : (stryCov_9fa48("121291"), rejection?.reasonCodes)) ? rejection.reasonCodes : stryMutAct_9fa48("121292") ? ["Stryker was here"] : (stryCov_9fa48("121292"), []),
        nodeSummary: stryMutAct_9fa48("121295") ? rejection?.nodeSummary && null : stryMutAct_9fa48("121294") ? false : stryMutAct_9fa48("121293") ? true : (stryCov_9fa48("121293", "121294", "121295"), (stryMutAct_9fa48("121296") ? rejection.nodeSummary : (stryCov_9fa48("121296"), rejection?.nodeSummary)) || null),
        readinessSnapshot: stryMutAct_9fa48("121299") ? rejection?.readinessSnapshot && null : stryMutAct_9fa48("121298") ? false : stryMutAct_9fa48("121297") ? true : (stryCov_9fa48("121297", "121298", "121299"), (stryMutAct_9fa48("121300") ? rejection.readinessSnapshot : (stryCov_9fa48("121300"), rejection?.readinessSnapshot)) || null),
        message: stryMutAct_9fa48("121303") ? rejection?.message && null : stryMutAct_9fa48("121302") ? false : stryMutAct_9fa48("121301") ? true : (stryCov_9fa48("121301", "121302", "121303"), (stryMutAct_9fa48("121304") ? rejection.message : (stryCov_9fa48("121304"), rejection?.message)) || null)
      }));
    }
  }

  /**
   * Summarize rejected target nodes for compact error messages.
   * @param {Object[]} rejectedTargetNodePlans
   * @return {string}
   * @private
   */
  summarizeProvisioningTargetRejections(rejectedTargetNodePlans) {
    if (stryMutAct_9fa48("121305")) {
      {}
    } else {
      stryCov_9fa48("121305");
      if (stryMutAct_9fa48("121308") ? !Array.isArray(rejectedTargetNodePlans) && rejectedTargetNodePlans.length === 0 : stryMutAct_9fa48("121307") ? false : stryMutAct_9fa48("121306") ? true : (stryCov_9fa48("121306", "121307", "121308"), (stryMutAct_9fa48("121309") ? Array.isArray(rejectedTargetNodePlans) : (stryCov_9fa48("121309"), !Array.isArray(rejectedTargetNodePlans))) || (stryMutAct_9fa48("121311") ? rejectedTargetNodePlans.length !== 0 : stryMutAct_9fa48("121310") ? false : (stryCov_9fa48("121310", "121311"), rejectedTargetNodePlans.length === 0)))) {
        if (stryMutAct_9fa48("121312")) {
          {}
        } else {
          stryCov_9fa48("121312");
          return PROVISIONING_REJECTION_SUMMARY_NONE;
        }
      }
      const summaryEntries = stryMutAct_9fa48("121313") ? ["Stryker was here"] : (stryCov_9fa48("121313"), []);
      for (const rejection of rejectedTargetNodePlans) {
        if (stryMutAct_9fa48("121314")) {
          {}
        } else {
          stryCov_9fa48("121314");
          const targetNodeId = String(stryMutAct_9fa48("121317") ? rejection?.targetNodeId && '' : stryMutAct_9fa48("121316") ? false : stryMutAct_9fa48("121315") ? true : (stryCov_9fa48("121315", "121316", "121317"), (stryMutAct_9fa48("121318") ? rejection.targetNodeId : (stryCov_9fa48("121318"), rejection?.targetNodeId)) || (stryMutAct_9fa48("121319") ? "Stryker was here!" : (stryCov_9fa48("121319"), ''))));
          if (stryMutAct_9fa48("121322") ? false : stryMutAct_9fa48("121321") ? true : stryMutAct_9fa48("121320") ? targetNodeId : (stryCov_9fa48("121320", "121321", "121322"), !targetNodeId)) {
            if (stryMutAct_9fa48("121323")) {
              {}
            } else {
              stryCov_9fa48("121323");
              continue;
            }
          }
          const reasonCodes = stryMutAct_9fa48("121324") ? ["Stryker was here"] : (stryCov_9fa48("121324"), []);
          for (const reasonCode of stryMutAct_9fa48("121325") ? [] : (stryCov_9fa48("121325"), [...(Array.isArray(stryMutAct_9fa48("121326") ? rejection.blockingReasons : (stryCov_9fa48("121326"), rejection?.blockingReasons)) ? rejection.blockingReasons : stryMutAct_9fa48("121327") ? ["Stryker was here"] : (stryCov_9fa48("121327"), [])), ...(Array.isArray(stryMutAct_9fa48("121328") ? rejection.reasonCodes : (stryCov_9fa48("121328"), rejection?.reasonCodes)) ? rejection.reasonCodes : stryMutAct_9fa48("121329") ? ["Stryker was here"] : (stryCov_9fa48("121329"), []))])) {
            if (stryMutAct_9fa48("121330")) {
              {}
            } else {
              stryCov_9fa48("121330");
              const normalizedReasonCode = String(stryMutAct_9fa48("121333") ? reasonCode && '' : stryMutAct_9fa48("121332") ? false : stryMutAct_9fa48("121331") ? true : (stryCov_9fa48("121331", "121332", "121333"), reasonCode || (stryMutAct_9fa48("121334") ? "Stryker was here!" : (stryCov_9fa48("121334"), ''))));
              if (stryMutAct_9fa48("121337") ? !normalizedReasonCode && reasonCodes.includes(normalizedReasonCode) : stryMutAct_9fa48("121336") ? false : stryMutAct_9fa48("121335") ? true : (stryCov_9fa48("121335", "121336", "121337"), (stryMutAct_9fa48("121338") ? normalizedReasonCode : (stryCov_9fa48("121338"), !normalizedReasonCode)) || reasonCodes.includes(normalizedReasonCode))) {
                if (stryMutAct_9fa48("121339")) {
                  {}
                } else {
                  stryCov_9fa48("121339");
                  continue;
                }
              }
              reasonCodes.push(normalizedReasonCode);
              if (stryMutAct_9fa48("121343") ? reasonCodes.length < PROVISIONING_REJECTION_DETAIL_LIMIT : stryMutAct_9fa48("121342") ? reasonCodes.length > PROVISIONING_REJECTION_DETAIL_LIMIT : stryMutAct_9fa48("121341") ? false : stryMutAct_9fa48("121340") ? true : (stryCov_9fa48("121340", "121341", "121342", "121343"), reasonCodes.length >= PROVISIONING_REJECTION_DETAIL_LIMIT)) {
                if (stryMutAct_9fa48("121344")) {
                  {}
                } else {
                  stryCov_9fa48("121344");
                  break;
                }
              }
            }
          }
          const reasonSummary = (stryMutAct_9fa48("121348") ? reasonCodes.length <= 0 : stryMutAct_9fa48("121347") ? reasonCodes.length >= 0 : stryMutAct_9fa48("121346") ? false : stryMutAct_9fa48("121345") ? true : (stryCov_9fa48("121345", "121346", "121347", "121348"), reasonCodes.length > 0)) ? reasonCodes.join(stryMutAct_9fa48("121349") ? "" : (stryCov_9fa48("121349"), ',')) : PROVISIONING_REJECTION_REASON_UNKNOWN;
          summaryEntries.push(stryMutAct_9fa48("121350") ? `` : (stryCov_9fa48("121350"), `${targetNodeId}:${reasonSummary}`));
          if (stryMutAct_9fa48("121354") ? summaryEntries.length < PROVISIONING_REJECTION_DETAIL_LIMIT : stryMutAct_9fa48("121353") ? summaryEntries.length > PROVISIONING_REJECTION_DETAIL_LIMIT : stryMutAct_9fa48("121352") ? false : stryMutAct_9fa48("121351") ? true : (stryCov_9fa48("121351", "121352", "121353", "121354"), summaryEntries.length >= PROVISIONING_REJECTION_DETAIL_LIMIT)) {
            if (stryMutAct_9fa48("121355")) {
              {}
            } else {
              stryCov_9fa48("121355");
              break;
            }
          }
        }
      }
      return (stryMutAct_9fa48("121359") ? summaryEntries.length <= 0 : stryMutAct_9fa48("121358") ? summaryEntries.length >= 0 : stryMutAct_9fa48("121357") ? false : stryMutAct_9fa48("121356") ? true : (stryCov_9fa48("121356", "121357", "121358", "121359"), summaryEntries.length > 0)) ? summaryEntries.join(stryMutAct_9fa48("121360") ? "" : (stryCov_9fa48("121360"), '; ')) : PROVISIONING_REJECTION_SUMMARY_NONE;
    }
  }

  /**
   * Throw one canonical insufficient-targets provisioning error.
   * @param {Object} details
   * @return {never}
   * @private
   */
  throwProvisioningInsufficientTargets(details) {
    if (stryMutAct_9fa48("121361")) {
      {}
    } else {
      stryCov_9fa48("121361");
      const rejectionSummary = this.summarizeProvisioningTargetRejections(stryMutAct_9fa48("121362") ? details.rejectedTargetNodePlans : (stryCov_9fa48("121362"), details?.rejectedTargetNodePlans));
      this.logger.error(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS, stryMutAct_9fa48("121363") ? {} : (stryCov_9fa48("121363"), {
        partitionId: stryMutAct_9fa48("121366") ? details?.partitionId && null : stryMutAct_9fa48("121365") ? false : stryMutAct_9fa48("121364") ? true : (stryCov_9fa48("121364", "121365", "121366"), (stryMutAct_9fa48("121367") ? details.partitionId : (stryCov_9fa48("121367"), details?.partitionId)) || null),
        targetReplicaCount: stryMutAct_9fa48("121370") ? details?.targetReplicaCount && null : stryMutAct_9fa48("121369") ? false : stryMutAct_9fa48("121368") ? true : (stryCov_9fa48("121368", "121369", "121370"), (stryMutAct_9fa48("121371") ? details.targetReplicaCount : (stryCov_9fa48("121371"), details?.targetReplicaCount)) || null),
        minimumRoutableReplicaCount: stryMutAct_9fa48("121374") ? details?.minimumRoutableReplicaCount && null : stryMutAct_9fa48("121373") ? false : stryMutAct_9fa48("121372") ? true : (stryCov_9fa48("121372", "121373", "121374"), (stryMutAct_9fa48("121375") ? details.minimumRoutableReplicaCount : (stryCov_9fa48("121375"), details?.minimumRoutableReplicaCount)) || null),
        candidateTargetNodeIds: Array.isArray(stryMutAct_9fa48("121376") ? details.candidateTargetNodeIds : (stryCov_9fa48("121376"), details?.candidateTargetNodeIds)) ? details.candidateTargetNodeIds : stryMutAct_9fa48("121377") ? ["Stryker was here"] : (stryCov_9fa48("121377"), []),
        existingRoutableNodeIds: Array.isArray(stryMutAct_9fa48("121378") ? details.existingRoutableNodeIds : (stryCov_9fa48("121378"), details?.existingRoutableNodeIds)) ? details.existingRoutableNodeIds : stryMutAct_9fa48("121379") ? ["Stryker was here"] : (stryCov_9fa48("121379"), []),
        plannedTargetNodeIds: Array.isArray(stryMutAct_9fa48("121380") ? details.plannedTargetNodeIds : (stryCov_9fa48("121380"), details?.plannedTargetNodeIds)) ? details.plannedTargetNodeIds : stryMutAct_9fa48("121381") ? ["Stryker was here"] : (stryCov_9fa48("121381"), []),
        rejectedTargets: Array.isArray(stryMutAct_9fa48("121382") ? details.rejectedTargetNodePlans : (stryCov_9fa48("121382"), details?.rejectedTargetNodePlans)) ? details.rejectedTargetNodePlans : stryMutAct_9fa48("121383") ? ["Stryker was here"] : (stryCov_9fa48("121383"), []),
        rejectionSummary
      }));
      throw new Error((stryMutAct_9fa48("121384") ? QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX - String(details?.partitionId || '') : (stryCov_9fa48("121384"), QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX + String(stryMutAct_9fa48("121387") ? details?.partitionId && '' : stryMutAct_9fa48("121386") ? false : stryMutAct_9fa48("121385") ? true : (stryCov_9fa48("121385", "121386", "121387"), (stryMutAct_9fa48("121388") ? details.partitionId : (stryCov_9fa48("121388"), details?.partitionId)) || (stryMutAct_9fa48("121389") ? "Stryker was here!" : (stryCov_9fa48("121389"), '')))))) + (stryMutAct_9fa48("121390") ? `` : (stryCov_9fa48("121390"), `: required=${stryMutAct_9fa48("121393") ? details?.minimumRoutableReplicaCount && 0 : stryMutAct_9fa48("121392") ? false : stryMutAct_9fa48("121391") ? true : (stryCov_9fa48("121391", "121392", "121393"), (stryMutAct_9fa48("121394") ? details.minimumRoutableReplicaCount : (stryCov_9fa48("121394"), details?.minimumRoutableReplicaCount)) || 0)}, `)) + (stryMutAct_9fa48("121395") ? `` : (stryCov_9fa48("121395"), `provisionable=${stryMutAct_9fa48("121398") ? details?.maximumProvisionableReplicaCount && 0 : stryMutAct_9fa48("121397") ? false : stryMutAct_9fa48("121396") ? true : (stryCov_9fa48("121396", "121397", "121398"), (stryMutAct_9fa48("121399") ? details.maximumProvisionableReplicaCount : (stryCov_9fa48("121399"), details?.maximumProvisionableReplicaCount)) || 0)}, `)) + (stryMutAct_9fa48("121400") ? `` : (stryCov_9fa48("121400"), `target=${stryMutAct_9fa48("121403") ? details?.targetReplicaCount && 0 : stryMutAct_9fa48("121402") ? false : stryMutAct_9fa48("121401") ? true : (stryCov_9fa48("121401", "121402", "121403"), (stryMutAct_9fa48("121404") ? details.targetReplicaCount : (stryCov_9fa48("121404"), details?.targetReplicaCount)) || 0)}, `)) + (stryMutAct_9fa48("121405") ? `` : (stryCov_9fa48("121405"), `rejected=${rejectionSummary}`)));
    }
  }

  /**
   * Mark provisional planning operations as failed before dispatch.
   * @param {string} partitionId
   * @param {Object[]} operations
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async abortProvisioningPlanningOperations(partitionId, operations, reason) {
    if (stryMutAct_9fa48("121406")) {
      {}
    } else {
      stryCov_9fa48("121406");
      if (stryMutAct_9fa48("121409") ? !Array.isArray(operations) && operations.length === 0 : stryMutAct_9fa48("121408") ? false : stryMutAct_9fa48("121407") ? true : (stryCov_9fa48("121407", "121408", "121409"), (stryMutAct_9fa48("121410") ? Array.isArray(operations) : (stryCov_9fa48("121410"), !Array.isArray(operations))) || (stryMutAct_9fa48("121412") ? operations.length !== 0 : stryMutAct_9fa48("121411") ? false : (stryCov_9fa48("121411", "121412"), operations.length === 0)))) {
        if (stryMutAct_9fa48("121413")) {
          {}
        } else {
          stryCov_9fa48("121413");
          return;
        }
      }
      if (stryMutAct_9fa48("121416") ? !this.rebalanceCoordinator && typeof this.rebalanceCoordinator.failOperation !== 'function' : stryMutAct_9fa48("121415") ? false : stryMutAct_9fa48("121414") ? true : (stryCov_9fa48("121414", "121415", "121416"), (stryMutAct_9fa48("121417") ? this.rebalanceCoordinator : (stryCov_9fa48("121417"), !this.rebalanceCoordinator)) || (stryMutAct_9fa48("121419") ? typeof this.rebalanceCoordinator.failOperation === 'function' : stryMutAct_9fa48("121418") ? false : (stryCov_9fa48("121418", "121419"), typeof this.rebalanceCoordinator.failOperation !== (stryMutAct_9fa48("121420") ? "" : (stryCov_9fa48("121420"), 'function')))))) {
        if (stryMutAct_9fa48("121421")) {
          {}
        } else {
          stryCov_9fa48("121421");
          return;
        }
      }
      this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_ABORT_PENDING, stryMutAct_9fa48("121422") ? {} : (stryCov_9fa48("121422"), {
        partitionId,
        operationCount: operations.length,
        reason
      }));
      for (const operation of operations) {
        if (stryMutAct_9fa48("121423")) {
          {}
        } else {
          stryCov_9fa48("121423");
          if (stryMutAct_9fa48("121426") ? !operation && typeof operation !== 'object' : stryMutAct_9fa48("121425") ? false : stryMutAct_9fa48("121424") ? true : (stryCov_9fa48("121424", "121425", "121426"), (stryMutAct_9fa48("121427") ? operation : (stryCov_9fa48("121427"), !operation)) || (stryMutAct_9fa48("121429") ? typeof operation === 'object' : stryMutAct_9fa48("121428") ? false : (stryCov_9fa48("121428", "121429"), typeof operation !== (stryMutAct_9fa48("121430") ? "" : (stryCov_9fa48("121430"), 'object')))))) {
            if (stryMutAct_9fa48("121431")) {
              {}
            } else {
              stryCov_9fa48("121431");
              continue;
            }
          }
          try {
            if (stryMutAct_9fa48("121432")) {
              {}
            } else {
              stryCov_9fa48("121432");
              await this.rebalanceCoordinator.failOperation(operation, reason, stryMutAct_9fa48("121433") ? {} : (stryCov_9fa48("121433"), {
                logLevel: stryMutAct_9fa48("121434") ? "" : (stryCov_9fa48("121434"), 'warn')
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("121435")) {
              {}
            } else {
              stryCov_9fa48("121435");
              this.logger.error(QUERY_LOG_MSG.TABLE_PARTITION_PROVISION_ABORT_FAILED, stryMutAct_9fa48("121436") ? {} : (stryCov_9fa48("121436"), {
                partitionId,
                operationId: stryMutAct_9fa48("121439") ? operation?.operationId && null : stryMutAct_9fa48("121438") ? false : stryMutAct_9fa48("121437") ? true : (stryCov_9fa48("121437", "121438", "121439"), (stryMutAct_9fa48("121440") ? operation.operationId : (stryCov_9fa48("121440"), operation?.operationId)) || null),
                error: stryMutAct_9fa48("121443") ? error?.message && String(error) : stryMutAct_9fa48("121442") ? false : stryMutAct_9fa48("121441") ? true : (stryCov_9fa48("121441", "121442", "121443"), (stryMutAct_9fa48("121444") ? error.message : (stryCov_9fa48("121444"), error?.message)) || String(error))
              }));
            }
          }
        }
      }
    }
  }

  /**
   * Return true when the coordinator can probe provisioning admission
   * without creating replica_operations rows.
   * @return {boolean}
   * @private
   */
  supportsProvisioningAdmissionPrecheck() {
    if (stryMutAct_9fa48("121445")) {
      {}
    } else {
      stryCov_9fa48("121445");
      return stryMutAct_9fa48("121448") ? !!this.rebalanceCoordinator || typeof this.rebalanceCoordinator.checkProvisioningAdmission === 'function' : stryMutAct_9fa48("121447") ? false : stryMutAct_9fa48("121446") ? true : (stryCov_9fa48("121446", "121447", "121448"), (stryMutAct_9fa48("121449") ? !this.rebalanceCoordinator : (stryCov_9fa48("121449"), !(stryMutAct_9fa48("121450") ? this.rebalanceCoordinator : (stryCov_9fa48("121450"), !this.rebalanceCoordinator)))) && (stryMutAct_9fa48("121452") ? typeof this.rebalanceCoordinator.checkProvisioningAdmission !== 'function' : stryMutAct_9fa48("121451") ? true : (stryCov_9fa48("121451", "121452"), typeof this.rebalanceCoordinator.checkProvisioningAdmission === (stryMutAct_9fa48("121453") ? "" : (stryCov_9fa48("121453"), 'function')))));
    }
  }

  /**
   * Probe provisioning admission for one candidate target cohort.
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {string[]} options.targetNodeIds
   * @return {Promise<Object>}
   * @private
   */
  async probeProvisioningTargetAdmission(options = {}) {
    if (stryMutAct_9fa48("121454")) {
      {}
    } else {
      stryCov_9fa48("121454");
      const partitionId = String(stryMutAct_9fa48("121457") ? options.partitionId && '' : stryMutAct_9fa48("121456") ? false : stryMutAct_9fa48("121455") ? true : (stryCov_9fa48("121455", "121456", "121457"), options.partitionId || (stryMutAct_9fa48("121458") ? "Stryker was here!" : (stryCov_9fa48("121458"), ''))));
      const targetNodeIds = this.normalizeTargetNodeIds(options.targetNodeIds);
      const existingRoutableNodeIds = this.getRoutablePartitionServiceNodeIds(partitionId);
      const routableNodeIdSet = new Set(existingRoutableNodeIds);
      const candidateTargetNodeIds = stryMutAct_9fa48("121459") ? ["Stryker was here"] : (stryCov_9fa48("121459"), []);
      for (const targetNodeId of targetNodeIds) {
        if (stryMutAct_9fa48("121460")) {
          {}
        } else {
          stryCov_9fa48("121460");
          if (stryMutAct_9fa48("121463") ? false : stryMutAct_9fa48("121462") ? true : stryMutAct_9fa48("121461") ? routableNodeIdSet.has(targetNodeId) : (stryCov_9fa48("121461", "121462", "121463"), !routableNodeIdSet.has(targetNodeId))) {
            if (stryMutAct_9fa48("121464")) {
              {}
            } else {
              stryCov_9fa48("121464");
              candidateTargetNodeIds.push(targetNodeId);
            }
          }
        }
      }
      if (stryMutAct_9fa48("121467") ? false : stryMutAct_9fa48("121466") ? true : stryMutAct_9fa48("121465") ? this.supportsProvisioningAdmissionPrecheck() : (stryCov_9fa48("121465", "121466", "121467"), !this.supportsProvisioningAdmissionPrecheck())) {
        if (stryMutAct_9fa48("121468")) {
          {}
        } else {
          stryCov_9fa48("121468");
          return stryMutAct_9fa48("121469") ? {} : (stryCov_9fa48("121469"), {
            existingRoutableNodeIds,
            candidateTargetNodeIds,
            admittedTargetNodeIds: stryMutAct_9fa48("121470") ? [] : (stryCov_9fa48("121470"), [...candidateTargetNodeIds]),
            rejectedTargetNodePlans: stryMutAct_9fa48("121471") ? ["Stryker was here"] : (stryCov_9fa48("121471"), []),
            maximumProvisionableReplicaCount: stryMutAct_9fa48("121472") ? existingRoutableNodeIds.length - candidateTargetNodeIds.length : (stryCov_9fa48("121472"), existingRoutableNodeIds.length + candidateTargetNodeIds.length)
          });
        }
      }
      const admittedTargetNodeIds = stryMutAct_9fa48("121473") ? ["Stryker was here"] : (stryCov_9fa48("121473"), []);
      const rejectedTargetNodePlans = stryMutAct_9fa48("121474") ? ["Stryker was here"] : (stryCov_9fa48("121474"), []);
      for (const targetNodeId of candidateTargetNodeIds) {
        if (stryMutAct_9fa48("121475")) {
          {}
        } else {
          stryCov_9fa48("121475");
          let admissionDecision = null;
          try {
            if (stryMutAct_9fa48("121476")) {
              {}
            } else {
              stryCov_9fa48("121476");
              admissionDecision = await this.rebalanceCoordinator.checkProvisioningAdmission(stryMutAct_9fa48("121477") ? {} : (stryCov_9fa48("121477"), {
                type: OperationType.ADD,
                partitionId,
                entityType: SERVICE_TYPE.PARTITION,
                entityId: partitionId,
                nodeId: targetNodeId
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("121478")) {
              {}
            } else {
              stryCov_9fa48("121478");
              if (stryMutAct_9fa48("121481") ? false : stryMutAct_9fa48("121480") ? true : stryMutAct_9fa48("121479") ? this.isProvisioningAdmissionDeniedError(error) : (stryCov_9fa48("121479", "121480", "121481"), !this.isProvisioningAdmissionDeniedError(error))) {
                if (stryMutAct_9fa48("121482")) {
                  {}
                } else {
                  stryCov_9fa48("121482");
                  throw error;
                }
              }
              admissionDecision = stryMutAct_9fa48("121483") ? {} : (stryCov_9fa48("121483"), {
                allowed: stryMutAct_9fa48("121484") ? true : (stryCov_9fa48("121484"), false),
                admissionResult: stryMutAct_9fa48("121487") ? error.admissionResult && null : stryMutAct_9fa48("121486") ? false : stryMutAct_9fa48("121485") ? true : (stryCov_9fa48("121485", "121486", "121487"), error.admissionResult || null),
                error
              });
            }
          }
          if (stryMutAct_9fa48("121490") ? admissionDecision?.allowed !== true : stryMutAct_9fa48("121489") ? false : stryMutAct_9fa48("121488") ? true : (stryCov_9fa48("121488", "121489", "121490"), (stryMutAct_9fa48("121491") ? admissionDecision.allowed : (stryCov_9fa48("121491"), admissionDecision?.allowed)) === (stryMutAct_9fa48("121492") ? false : (stryCov_9fa48("121492"), true)))) {
            if (stryMutAct_9fa48("121493")) {
              {}
            } else {
              stryCov_9fa48("121493");
              admittedTargetNodeIds.push(targetNodeId);
              continue;
            }
          }
          const rejectionError = (stryMutAct_9fa48("121496") ? admissionDecision?.error || typeof admissionDecision.error === 'object' : stryMutAct_9fa48("121495") ? false : stryMutAct_9fa48("121494") ? true : (stryCov_9fa48("121494", "121495", "121496"), (stryMutAct_9fa48("121497") ? admissionDecision.error : (stryCov_9fa48("121497"), admissionDecision?.error)) && (stryMutAct_9fa48("121499") ? typeof admissionDecision.error !== 'object' : stryMutAct_9fa48("121498") ? true : (stryCov_9fa48("121498", "121499"), typeof admissionDecision.error === (stryMutAct_9fa48("121500") ? "" : (stryCov_9fa48("121500"), 'object')))))) ? admissionDecision.error : (() => {
            if (stryMutAct_9fa48("121501")) {
              {}
            } else {
              stryCov_9fa48("121501");
              const fallbackError = new Error(stryMutAct_9fa48("121502") ? `` : (stryCov_9fa48("121502"), `Provisioning admission denied on ${targetNodeId}`));
              fallbackError.admissionResult = stryMutAct_9fa48("121505") ? admissionDecision?.admissionResult && null : stryMutAct_9fa48("121504") ? false : stryMutAct_9fa48("121503") ? true : (stryCov_9fa48("121503", "121504", "121505"), (stryMutAct_9fa48("121506") ? admissionDecision.admissionResult : (stryCov_9fa48("121506"), admissionDecision?.admissionResult)) || null);
              return fallbackError;
            }
          })();
          rejectedTargetNodePlans.push(this.createProvisioningTargetRejection(targetNodeId, rejectionError));
        }
      }
      return stryMutAct_9fa48("121507") ? {} : (stryCov_9fa48("121507"), {
        existingRoutableNodeIds,
        candidateTargetNodeIds,
        admittedTargetNodeIds,
        rejectedTargetNodePlans,
        maximumProvisionableReplicaCount: stryMutAct_9fa48("121508") ? existingRoutableNodeIds.length - admittedTargetNodeIds.length : (stryCov_9fa48("121508"), existingRoutableNodeIds.length + admittedTargetNodeIds.length)
      });
    }
  }

  /**
   * Probe one child partition bootstrap cohort before split metadata is
   * inserted so managed split can defer instead of creating metadata-only
   * child partitions.
   * @param {Object} options
   * @return {Promise<Object>}
   */
  async probeInitialTablePartitionProvisioning(options = {}) {
    if (stryMutAct_9fa48("121509")) {
      {}
    } else {
      stryCov_9fa48("121509");
      return this.probeProvisioningTargetAdmission(options);
    }
  }

  /**
   * Return active, non-transitioning partitions eligible for split evaluation.
   * @return {Array<Object>} Partition metadata rows.
   */
  listManagedSplitPartitions() {
    if (stryMutAct_9fa48("121510")) {
      {}
    } else {
      stryCov_9fa48("121510");
      if (stryMutAct_9fa48("121513") ? !this.systemCache && typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("121512") ? false : stryMutAct_9fa48("121511") ? true : (stryCov_9fa48("121511", "121512", "121513"), (stryMutAct_9fa48("121514") ? this.systemCache : (stryCov_9fa48("121514"), !this.systemCache)) || (stryMutAct_9fa48("121516") ? typeof this.systemCache.getAll === 'function' : stryMutAct_9fa48("121515") ? false : (stryCov_9fa48("121515", "121516"), typeof this.systemCache.getAll !== (stryMutAct_9fa48("121517") ? "" : (stryCov_9fa48("121517"), 'function')))))) {
        if (stryMutAct_9fa48("121518")) {
          {}
        } else {
          stryCov_9fa48("121518");
          return stryMutAct_9fa48("121519") ? ["Stryker was here"] : (stryCov_9fa48("121519"), []);
        }
      }
      const tables = stryMutAct_9fa48("121522") ? this.systemCache.getAll(TABLES.TABLES) && [] : stryMutAct_9fa48("121521") ? false : stryMutAct_9fa48("121520") ? true : (stryCov_9fa48("121520", "121521", "121522"), this.systemCache.getAll(TABLES.TABLES) || (stryMutAct_9fa48("121523") ? ["Stryker was here"] : (stryCov_9fa48("121523"), [])));
      const partitions = stryMutAct_9fa48("121526") ? this.systemCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("121525") ? false : stryMutAct_9fa48("121524") ? true : (stryCov_9fa48("121524", "121525", "121526"), this.systemCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("121527") ? ["Stryker was here"] : (stryCov_9fa48("121527"), [])));
      const activeVersionByTableId = new Map();
      const blockedTableIds = new Set();
      const deferredTableIds = new Set();
      for (const table of tables) {
        if (stryMutAct_9fa48("121528")) {
          {}
        } else {
          stryCov_9fa48("121528");
          const tableId = stryMutAct_9fa48("121531") ? table.table_id && table.tableId : stryMutAct_9fa48("121530") ? false : stryMutAct_9fa48("121529") ? true : (stryCov_9fa48("121529", "121530", "121531"), table.table_id || table.tableId);
          if (stryMutAct_9fa48("121534") ? false : stryMutAct_9fa48("121533") ? true : stryMutAct_9fa48("121532") ? tableId : (stryCov_9fa48("121532", "121533", "121534"), !tableId)) {
            if (stryMutAct_9fa48("121535")) {
              {}
            } else {
              stryCov_9fa48("121535");
              continue;
            }
          }
          const transition = this.parsePartitionTransition(table);
          if (stryMutAct_9fa48("121538") ? transition || !isRetryableManagedSplitTransition(transition) : stryMutAct_9fa48("121537") ? false : stryMutAct_9fa48("121536") ? true : (stryCov_9fa48("121536", "121537", "121538"), transition && (stryMutAct_9fa48("121539") ? isRetryableManagedSplitTransition(transition) : (stryCov_9fa48("121539"), !isRetryableManagedSplitTransition(transition))))) {
            if (stryMutAct_9fa48("121540")) {
              {}
            } else {
              stryCov_9fa48("121540");
              blockedTableIds.add(tableId);
              continue;
            }
          }
          if (stryMutAct_9fa48("121543") ? transition || !this.isManagedSplitRetryDue(transition) : stryMutAct_9fa48("121542") ? false : stryMutAct_9fa48("121541") ? true : (stryCov_9fa48("121541", "121542", "121543"), transition && (stryMutAct_9fa48("121544") ? this.isManagedSplitRetryDue(transition) : (stryCov_9fa48("121544"), !this.isManagedSplitRetryDue(transition))))) {
            if (stryMutAct_9fa48("121545")) {
              {}
            } else {
              stryCov_9fa48("121545");
              deferredTableIds.add(tableId);
            }
          }
          activeVersionByTableId.set(tableId, this.resolveActivePartitionVersion(table));
        }
      }
      return stryMutAct_9fa48("121546") ? partitions : (stryCov_9fa48("121546"), partitions.filter(partition => {
        if (stryMutAct_9fa48("121547")) {
          {}
        } else {
          stryCov_9fa48("121547");
          const tableId = stryMutAct_9fa48("121550") ? partition.table_id && partition.tableId : stryMutAct_9fa48("121549") ? false : stryMutAct_9fa48("121548") ? true : (stryCov_9fa48("121548", "121549", "121550"), partition.table_id || partition.tableId);
          if (stryMutAct_9fa48("121553") ? (!tableId || blockedTableIds.has(tableId)) && deferredTableIds.has(tableId) : stryMutAct_9fa48("121552") ? false : stryMutAct_9fa48("121551") ? true : (stryCov_9fa48("121551", "121552", "121553"), (stryMutAct_9fa48("121555") ? !tableId && blockedTableIds.has(tableId) : stryMutAct_9fa48("121554") ? false : (stryCov_9fa48("121554", "121555"), (stryMutAct_9fa48("121556") ? tableId : (stryCov_9fa48("121556"), !tableId)) || blockedTableIds.has(tableId))) || deferredTableIds.has(tableId))) {
            if (stryMutAct_9fa48("121557")) {
              {}
            } else {
              stryCov_9fa48("121557");
              return stryMutAct_9fa48("121558") ? true : (stryCov_9fa48("121558"), false);
            }
          }
          if (stryMutAct_9fa48("121561") ? false : stryMutAct_9fa48("121560") ? true : stryMutAct_9fa48("121559") ? this.isLocalManagedSplitLeader(partition) : (stryCov_9fa48("121559", "121560", "121561"), !this.isLocalManagedSplitLeader(partition))) {
            if (stryMutAct_9fa48("121562")) {
              {}
            } else {
              stryCov_9fa48("121562");
              return stryMutAct_9fa48("121563") ? true : (stryCov_9fa48("121563"), false);
            }
          }
          return this.isPartitionVisibleForRouting(partition, stryMutAct_9fa48("121566") ? activeVersionByTableId.get(tableId) && DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("121565") ? false : stryMutAct_9fa48("121564") ? true : (stryCov_9fa48("121564", "121565", "121566"), activeVersionByTableId.get(tableId) || DEFAULT_PARTITION_VERSION));
        }
      }));
    }
  }

  /**
   * Resolve whether a retryable split transition is eligible to run now.
   * Missing retry metadata remains backward-compatible and is treated as due.
   * @param {Object|null} transition
   * @return {boolean}
   * @private
   */
  isManagedSplitRetryDue(transition) {
    if (stryMutAct_9fa48("121567")) {
      {}
    } else {
      stryCov_9fa48("121567");
      const retryMetadata = stryMutAct_9fa48("121569") ? transition.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY] : stryMutAct_9fa48("121568") ? transition?.metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] : (stryCov_9fa48("121568", "121569"), transition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY]);
      const nextAttemptAt = stryMutAct_9fa48("121572") ? retryMetadata?.nextAttemptAt && null : stryMutAct_9fa48("121571") ? false : stryMutAct_9fa48("121570") ? true : (stryCov_9fa48("121570", "121571", "121572"), (stryMutAct_9fa48("121573") ? retryMetadata.nextAttemptAt : (stryCov_9fa48("121573"), retryMetadata?.nextAttemptAt)) || null);
      if (stryMutAct_9fa48("121576") ? false : stryMutAct_9fa48("121575") ? true : stryMutAct_9fa48("121574") ? nextAttemptAt : (stryCov_9fa48("121574", "121575", "121576"), !nextAttemptAt)) {
        if (stryMutAct_9fa48("121577")) {
          {}
        } else {
          stryCov_9fa48("121577");
          return stryMutAct_9fa48("121578") ? false : (stryCov_9fa48("121578"), true);
        }
      }
      const nextAttemptAtMs = Date.parse(nextAttemptAt);
      if (stryMutAct_9fa48("121581") ? false : stryMutAct_9fa48("121580") ? true : stryMutAct_9fa48("121579") ? Number.isFinite(nextAttemptAtMs) : (stryCov_9fa48("121579", "121580", "121581"), !Number.isFinite(nextAttemptAtMs))) {
        if (stryMutAct_9fa48("121582")) {
          {}
        } else {
          stryCov_9fa48("121582");
          return stryMutAct_9fa48("121583") ? false : (stryCov_9fa48("121583"), true);
        }
      }
      return stryMutAct_9fa48("121587") ? nextAttemptAtMs > this.nowFn() : stryMutAct_9fa48("121586") ? nextAttemptAtMs < this.nowFn() : stryMutAct_9fa48("121585") ? false : stryMutAct_9fa48("121584") ? true : (stryCov_9fa48("121584", "121585", "121586", "121587"), nextAttemptAtMs <= this.nowFn());
    }
  }

  /**
   * Execute one managed split for a source partition.
   * @param {string} partitionId - Source partition ID.
   * @param {Object} [executionOptions={}] - Optional workflow execution hints.
   * @return {Promise<Object>} Split orchestration result.
   */
  async executeManagedSplit(partitionId, executionOptions = {}) {
    if (stryMutAct_9fa48("121588")) {
      {}
    } else {
      stryCov_9fa48("121588");
      if (stryMutAct_9fa48("121591") ? !this.managedSplitWorkflow && typeof this.managedSplitWorkflow.execute !== 'function' : stryMutAct_9fa48("121590") ? false : stryMutAct_9fa48("121589") ? true : (stryCov_9fa48("121589", "121590", "121591"), (stryMutAct_9fa48("121592") ? this.managedSplitWorkflow : (stryCov_9fa48("121592"), !this.managedSplitWorkflow)) || (stryMutAct_9fa48("121594") ? typeof this.managedSplitWorkflow.execute === 'function' : stryMutAct_9fa48("121593") ? false : (stryCov_9fa48("121593", "121594"), typeof this.managedSplitWorkflow.execute !== (stryMutAct_9fa48("121595") ? "" : (stryCov_9fa48("121595"), 'function')))))) {
        if (stryMutAct_9fa48("121596")) {
          {}
        } else {
          stryCov_9fa48("121596");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
        }
      }
      return this.managedSplitWorkflow.execute(partitionId, executionOptions);
    }
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
  async buildManagedSplitPlan(partitionInfo, tableName, tableId, primaryKeyColumn) {
    if (stryMutAct_9fa48("121597")) {
      {}
    } else {
      stryCov_9fa48("121597");
      const manager = this.partitionSplitMergeManager;
      if (stryMutAct_9fa48("121600") ? !manager && typeof manager.splitPartition !== 'function' : stryMutAct_9fa48("121599") ? false : stryMutAct_9fa48("121598") ? true : (stryCov_9fa48("121598", "121599", "121600"), (stryMutAct_9fa48("121601") ? manager : (stryCov_9fa48("121601"), !manager)) || (stryMutAct_9fa48("121603") ? typeof manager.splitPartition === 'function' : stryMutAct_9fa48("121602") ? false : (stryCov_9fa48("121602", "121603"), typeof manager.splitPartition !== (stryMutAct_9fa48("121604") ? "" : (stryCov_9fa48("121604"), 'function')))))) {
        if (stryMutAct_9fa48("121605")) {
          {}
        } else {
          stryCov_9fa48("121605");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
        }
      }
      return manager.splitPartition(stryMutAct_9fa48("121606") ? {} : (stryCov_9fa48("121606"), {
        partitionId: stryMutAct_9fa48("121609") ? partitionInfo.partition_id && partitionInfo.partitionId : stryMutAct_9fa48("121608") ? false : stryMutAct_9fa48("121607") ? true : (stryCov_9fa48("121607", "121608", "121609"), partitionInfo.partition_id || partitionInfo.partitionId),
        tableName,
        tableId,
        primaryKeyColumn,
        partitionService: stryMutAct_9fa48("121610") ? {} : (stryCov_9fa48("121610"), {
          executeQuery: async (sql, params = stryMutAct_9fa48("121611") ? ["Stryker was here"] : (stryCov_9fa48("121611"), [])) => {
            if (stryMutAct_9fa48("121612")) {
              {}
            } else {
              stryCov_9fa48("121612");
              const result = await this.queryExecutor.executeOnPartition(stryMutAct_9fa48("121615") ? partitionInfo.partition_id && partitionInfo.partitionId : stryMutAct_9fa48("121614") ? false : stryMutAct_9fa48("121613") ? true : (stryCov_9fa48("121613", "121614", "121615"), partitionInfo.partition_id || partitionInfo.partitionId), sql, params, stryMutAct_9fa48("121616") ? false : (stryCov_9fa48("121616"), true), stryMutAct_9fa48("121617") ? false : (stryCov_9fa48("121617"), true), stryMutAct_9fa48("121618") ? true : (stryCov_9fa48("121618"), false));
              return stryMutAct_9fa48("121619") ? {} : (stryCov_9fa48("121619"), {
                rows: stryMutAct_9fa48("121622") ? result.rows && [] : stryMutAct_9fa48("121621") ? false : stryMutAct_9fa48("121620") ? true : (stryCov_9fa48("121620", "121621", "121622"), result.rows || (stryMutAct_9fa48("121623") ? ["Stryker was here"] : (stryCov_9fa48("121623"), [])))
              });
            }
          },
          getKeyRange: stryMutAct_9fa48("121624") ? () => undefined : (stryCov_9fa48("121624"), () => stryMutAct_9fa48("121625") ? {} : (stryCov_9fa48("121625"), {
            start: stryMutAct_9fa48("121626") ? partitionInfo.partition_key_start && partitionInfo.partitionKeyStart : (stryCov_9fa48("121626"), partitionInfo.partition_key_start ?? partitionInfo.partitionKeyStart),
            end: stryMutAct_9fa48("121627") ? partitionInfo.partition_key_end && partitionInfo.partitionKeyEnd : (stryCov_9fa48("121627"), partitionInfo.partition_key_end ?? partitionInfo.partitionKeyEnd)
          }))
        })
      }));
    }
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
  async startSplitReplicationOnSourcePartition(partitionId, tableId, tableName, transitionMetadata) {
    if (stryMutAct_9fa48("121628")) {
      {}
    } else {
      stryCov_9fa48("121628");
      const serviceInfo = this.queryExecutor.findPartitionService(partitionId);
      if (stryMutAct_9fa48("121631") ? false : stryMutAct_9fa48("121630") ? true : stryMutAct_9fa48("121629") ? serviceInfo : (stryCov_9fa48("121629", "121630", "121631"), !serviceInfo)) {
        if (stryMutAct_9fa48("121632")) {
          {}
        } else {
          stryCov_9fa48("121632");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
        }
      }
      const response = await this.messageRouter.deliver(serviceInfo.address, stryMutAct_9fa48("121633") ? {} : (stryCov_9fa48("121633"), {
        type: PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION,
        partitionId,
        tableId,
        tableName,
        transitionMetadata
      }));
      if (stryMutAct_9fa48("121636") ? !response?.acknowledged && response?.success === false : stryMutAct_9fa48("121635") ? false : stryMutAct_9fa48("121634") ? true : (stryCov_9fa48("121634", "121635", "121636"), (stryMutAct_9fa48("121637") ? response?.acknowledged : (stryCov_9fa48("121637"), !(stryMutAct_9fa48("121638") ? response.acknowledged : (stryCov_9fa48("121638"), response?.acknowledged)))) || (stryMutAct_9fa48("121640") ? response?.success !== false : stryMutAct_9fa48("121639") ? false : (stryCov_9fa48("121639", "121640"), (stryMutAct_9fa48("121641") ? response.success : (stryCov_9fa48("121641"), response?.success)) === (stryMutAct_9fa48("121642") ? true : (stryCov_9fa48("121642"), false)))))) {
        if (stryMutAct_9fa48("121643")) {
          {}
        } else {
          stryCov_9fa48("121643");
          throw new Error(stryMutAct_9fa48("121646") ? response?.error && QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED : stryMutAct_9fa48("121645") ? false : stryMutAct_9fa48("121644") ? true : (stryCov_9fa48("121644", "121645", "121646"), (stryMutAct_9fa48("121647") ? response.error : (stryCov_9fa48("121647"), response?.error)) || QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED));
        }
      }
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
  async waitForTablePartitionMetadata(tableId, partitionId, timeoutBudget = null) {
    if (stryMutAct_9fa48("121648")) {
      {}
    } else {
      stryCov_9fa48("121648");
      const hasTableAndPartitionMetadata = () => {
        if (stryMutAct_9fa48("121649")) {
          {}
        } else {
          stryCov_9fa48("121649");
          const hasPartitionRecord = (stryMutAct_9fa48("121652") ? this.queryExecutor || typeof this.queryExecutor.hasPartitionRecord === 'function' : stryMutAct_9fa48("121651") ? false : stryMutAct_9fa48("121650") ? true : (stryCov_9fa48("121650", "121651", "121652"), this.queryExecutor && (stryMutAct_9fa48("121654") ? typeof this.queryExecutor.hasPartitionRecord !== 'function' : stryMutAct_9fa48("121653") ? true : (stryCov_9fa48("121653", "121654"), typeof this.queryExecutor.hasPartitionRecord === (stryMutAct_9fa48("121655") ? "" : (stryCov_9fa48("121655"), 'function')))))) ? this.queryExecutor.hasPartitionRecord(partitionId) : stryMutAct_9fa48("121656") ? true : (stryCov_9fa48("121656"), false);
          const hasTableRecord = tableId ? this.hasTableMetadata(tableId) : stryMutAct_9fa48("121657") ? false : (stryCov_9fa48("121657"), true);
          return stryMutAct_9fa48("121660") ? hasPartitionRecord || hasTableRecord : stryMutAct_9fa48("121659") ? false : stryMutAct_9fa48("121658") ? true : (stryCov_9fa48("121658", "121659", "121660"), hasPartitionRecord && hasTableRecord);
        }
      };
      if (stryMutAct_9fa48("121662") ? false : stryMutAct_9fa48("121661") ? true : (stryCov_9fa48("121661", "121662"), hasTableAndPartitionMetadata())) {
        if (stryMutAct_9fa48("121663")) {
          {}
        } else {
          stryCov_9fa48("121663");
          return;
        }
      }
      const usesCacheRepairWaits = stryMutAct_9fa48("121666") ? this.cdcIntegrationService && typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' && this.systemCache || typeof this.systemCache.onCacheChange === 'function' : stryMutAct_9fa48("121665") ? false : stryMutAct_9fa48("121664") ? true : (stryCov_9fa48("121664", "121665", "121666"), (stryMutAct_9fa48("121668") ? this.cdcIntegrationService && typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' || this.systemCache : stryMutAct_9fa48("121667") ? true : (stryCov_9fa48("121667", "121668"), (stryMutAct_9fa48("121670") ? this.cdcIntegrationService || typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' : stryMutAct_9fa48("121669") ? true : (stryCov_9fa48("121669", "121670"), this.cdcIntegrationService && (stryMutAct_9fa48("121672") ? typeof this.cdcIntegrationService.waitForCacheUpdate !== 'function' : stryMutAct_9fa48("121671") ? true : (stryCov_9fa48("121671", "121672"), typeof this.cdcIntegrationService.waitForCacheUpdate === (stryMutAct_9fa48("121673") ? "" : (stryCov_9fa48("121673"), 'function')))))) && this.systemCache)) && (stryMutAct_9fa48("121675") ? typeof this.systemCache.onCacheChange !== 'function' : stryMutAct_9fa48("121674") ? true : (stryCov_9fa48("121674", "121675"), typeof this.systemCache.onCacheChange === (stryMutAct_9fa48("121676") ? "" : (stryCov_9fa48("121676"), 'function')))));
      const effectiveBudget = this.allocateControlPlaneTimeoutBudget(stryMutAct_9fa48("121677") ? {} : (stryCov_9fa48("121677"), {
        timeoutBudget,
        requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
        minimumBudgetMs: usesCacheRepairWaits ? TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS : this.tablePartitionProvisioningPollIntervalMs,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
        nestedOperation: stryMutAct_9fa48("121678") ? "" : (stryCov_9fa48("121678"), 'table_partition_metadata_wait'),
        timeoutError: stryMutAct_9fa48("121679") ? QUERY_ERROR_MSG.TABLE_PARTITION_METADATA_TIMEOUT_PREFIX - partitionId : (stryCov_9fa48("121679"), QUERY_ERROR_MSG.TABLE_PARTITION_METADATA_TIMEOUT_PREFIX + partitionId)
      }));
      const waitBudgetMs = getRemainingBudgetMs(effectiveBudget, stryMutAct_9fa48("121680") ? {} : (stryCov_9fa48("121680"), {
        now: this.nowFn
      }));
      if (stryMutAct_9fa48("121682") ? false : stryMutAct_9fa48("121681") ? true : (stryCov_9fa48("121681", "121682"), usesCacheRepairWaits)) {
        if (stryMutAct_9fa48("121683")) {
          {}
        } else {
          stryCov_9fa48("121683");
          const waits = stryMutAct_9fa48("121684") ? [] : (stryCov_9fa48("121684"), [this.cdcIntegrationService.waitForCacheUpdate(TABLES.PARTITIONS, partitionId, stryMutAct_9fa48("121685") ? false : (stryCov_9fa48("121685"), true), stryMutAct_9fa48("121686") ? {} : (stryCov_9fa48("121686"), {
            fallbackPhase: stryMutAct_9fa48("121687") ? "" : (stryCov_9fa48("121687"), 'steady_state'),
            timeoutMs: waitBudgetMs
          }))]);
          if (stryMutAct_9fa48("121689") ? false : stryMutAct_9fa48("121688") ? true : (stryCov_9fa48("121688", "121689"), tableId)) {
            if (stryMutAct_9fa48("121690")) {
              {}
            } else {
              stryCov_9fa48("121690");
              waits.push(this.cdcIntegrationService.waitForCacheUpdate(TABLES.TABLES, tableId, stryMutAct_9fa48("121691") ? false : (stryCov_9fa48("121691"), true), stryMutAct_9fa48("121692") ? {} : (stryCov_9fa48("121692"), {
                fallbackPhase: stryMutAct_9fa48("121693") ? "" : (stryCov_9fa48("121693"), 'steady_state'),
                timeoutMs: waitBudgetMs
              })));
            }
          }
          await Promise.all(waits);
          return;
        }
      }
      await this.waitForCondition(hasTableAndPartitionMetadata, waitBudgetMs, this.tablePartitionProvisioningPollIntervalMs, stryMutAct_9fa48("121694") ? QUERY_ERROR_MSG.TABLE_PARTITION_METADATA_TIMEOUT_PREFIX - partitionId : (stryCov_9fa48("121694"), QUERY_ERROR_MSG.TABLE_PARTITION_METADATA_TIMEOUT_PREFIX + partitionId), stryMutAct_9fa48("121695") ? {} : (stryCov_9fa48("121695"), {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
        nestedOperation: stryMutAct_9fa48("121696") ? "" : (stryCov_9fa48("121696"), 'table_partition_metadata_wait')
      }));
    }
  }

  /**
   * Wait for at least one routable service row for the partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForRoutablePartitionService(partitionId, timeoutBudget = null) {
    if (stryMutAct_9fa48("121697")) {
      {}
    } else {
      stryCov_9fa48("121697");
      await this.waitForRoutablePartitionServiceCount(partitionId, 1, timeoutBudget);
    }
  }

  /**
   * Wait for one partition service row to become visible in local cache.
   * Uses CDC authoritative repair when available.
   * @param {string} replicaId - Partition service replica ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionServiceMetadata(replicaId, timeoutBudget = null) {
    if (stryMutAct_9fa48("121698")) {
      {}
    } else {
      stryCov_9fa48("121698");
      const conditionFn = stryMutAct_9fa48("121699") ? () => undefined : (stryCov_9fa48("121699"), (() => {
        const conditionFn = () => this.hasServiceMetadata(replicaId);
        return conditionFn;
      })());
      if (stryMutAct_9fa48("121701") ? false : stryMutAct_9fa48("121700") ? true : (stryCov_9fa48("121700", "121701"), conditionFn())) {
        if (stryMutAct_9fa48("121702")) {
          {}
        } else {
          stryCov_9fa48("121702");
          return;
        }
      }
      const usesCacheRepairWaits = stryMutAct_9fa48("121705") ? this.cdcIntegrationService && typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' && this.systemCache || typeof this.systemCache.onCacheChange === 'function' : stryMutAct_9fa48("121704") ? false : stryMutAct_9fa48("121703") ? true : (stryCov_9fa48("121703", "121704", "121705"), (stryMutAct_9fa48("121707") ? this.cdcIntegrationService && typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' || this.systemCache : stryMutAct_9fa48("121706") ? true : (stryCov_9fa48("121706", "121707"), (stryMutAct_9fa48("121709") ? this.cdcIntegrationService || typeof this.cdcIntegrationService.waitForCacheUpdate === 'function' : stryMutAct_9fa48("121708") ? true : (stryCov_9fa48("121708", "121709"), this.cdcIntegrationService && (stryMutAct_9fa48("121711") ? typeof this.cdcIntegrationService.waitForCacheUpdate !== 'function' : stryMutAct_9fa48("121710") ? true : (stryCov_9fa48("121710", "121711"), typeof this.cdcIntegrationService.waitForCacheUpdate === (stryMutAct_9fa48("121712") ? "" : (stryCov_9fa48("121712"), 'function')))))) && this.systemCache)) && (stryMutAct_9fa48("121714") ? typeof this.systemCache.onCacheChange !== 'function' : stryMutAct_9fa48("121713") ? true : (stryCov_9fa48("121713", "121714"), typeof this.systemCache.onCacheChange === (stryMutAct_9fa48("121715") ? "" : (stryCov_9fa48("121715"), 'function')))));
      const nestedOperation = stryMutAct_9fa48("121716") ? "" : (stryCov_9fa48("121716"), 'partition_service_metadata_wait');
      const effectiveBudget = this.allocateControlPlaneTimeoutBudget(stryMutAct_9fa48("121717") ? {} : (stryCov_9fa48("121717"), {
        timeoutBudget,
        requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
        minimumBudgetMs: usesCacheRepairWaits ? TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS : this.tablePartitionProvisioningPollIntervalMs,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
        nestedOperation,
        timeoutError: stryMutAct_9fa48("121718") ? QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX - replicaId : (stryCov_9fa48("121718"), QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX + replicaId)
      }));
      const waitBudgetMs = getRemainingBudgetMs(effectiveBudget, stryMutAct_9fa48("121719") ? {} : (stryCov_9fa48("121719"), {
        now: this.nowFn
      }));
      if (stryMutAct_9fa48("121721") ? false : stryMutAct_9fa48("121720") ? true : (stryCov_9fa48("121720", "121721"), usesCacheRepairWaits)) {
        if (stryMutAct_9fa48("121722")) {
          {}
        } else {
          stryCov_9fa48("121722");
          await this.cdcIntegrationService.waitForCacheUpdate(TABLES.SERVICES, replicaId, stryMutAct_9fa48("121723") ? false : (stryCov_9fa48("121723"), true), stryMutAct_9fa48("121724") ? {} : (stryCov_9fa48("121724"), {
            fallbackPhase: stryMutAct_9fa48("121725") ? "" : (stryCov_9fa48("121725"), 'steady_state'),
            timeoutMs: waitBudgetMs
          }));
          if (stryMutAct_9fa48("121727") ? false : stryMutAct_9fa48("121726") ? true : (stryCov_9fa48("121726", "121727"), this.hasServiceMetadata(replicaId))) {
            if (stryMutAct_9fa48("121728")) {
              {}
            } else {
              stryCov_9fa48("121728");
              return;
            }
          }
        }
      }
      await this.waitForCondition(conditionFn, waitBudgetMs, this.tablePartitionProvisioningPollIntervalMs, stryMutAct_9fa48("121729") ? QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX - replicaId : (stryCov_9fa48("121729"), QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX + replicaId), stryMutAct_9fa48("121730") ? {} : (stryCov_9fa48("121730"), {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
        nestedOperation
      }));
    }
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
  async waitForMinimumRoutableReplicaMetadata(partitionId, replicaIds, minimumRoutableReplicaCount, timeoutBudget = null, routingReadinessDimension = stryMutAct_9fa48("121731") ? this.queryExecutor.defaultRoutingReadinessDimension : (stryCov_9fa48("121731"), this.queryExecutor?.defaultRoutingReadinessDimension)) {
    if (stryMutAct_9fa48("121732")) {
      {}
    } else {
      stryCov_9fa48("121732");
      const uniqueReplicaIds = stryMutAct_9fa48("121733") ? [] : (stryCov_9fa48("121733"), [...new Set(stryMutAct_9fa48("121734") ? Array.isArray(replicaIds) ? replicaIds : [] : (stryCov_9fa48("121734"), (Array.isArray(replicaIds) ? replicaIds : stryMutAct_9fa48("121735") ? ["Stryker was here"] : (stryCov_9fa48("121735"), [])).filter(stryMutAct_9fa48("121736") ? () => undefined : (stryCov_9fa48("121736"), replicaId => stryMutAct_9fa48("121739") ? typeof replicaId === 'string' || replicaId.length > 0 : stryMutAct_9fa48("121738") ? false : stryMutAct_9fa48("121737") ? true : (stryCov_9fa48("121737", "121738", "121739"), (stryMutAct_9fa48("121741") ? typeof replicaId !== 'string' : stryMutAct_9fa48("121740") ? true : (stryCov_9fa48("121740", "121741"), typeof replicaId === (stryMutAct_9fa48("121742") ? "" : (stryCov_9fa48("121742"), 'string')))) && (stryMutAct_9fa48("121745") ? replicaId.length <= 0 : stryMutAct_9fa48("121744") ? replicaId.length >= 0 : stryMutAct_9fa48("121743") ? true : (stryCov_9fa48("121743", "121744", "121745"), replicaId.length > 0)))))))]);
      if (stryMutAct_9fa48("121748") ? uniqueReplicaIds.length !== 0 : stryMutAct_9fa48("121747") ? false : stryMutAct_9fa48("121746") ? true : (stryCov_9fa48("121746", "121747", "121748"), uniqueReplicaIds.length === 0)) {
        if (stryMutAct_9fa48("121749")) {
          {}
        } else {
          stryCov_9fa48("121749");
          return;
        }
      }
      for (const replicaId of uniqueReplicaIds) {
        if (stryMutAct_9fa48("121750")) {
          {}
        } else {
          stryCov_9fa48("121750");
          if (stryMutAct_9fa48("121754") ? this.getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension).length < minimumRoutableReplicaCount : stryMutAct_9fa48("121753") ? this.getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension).length > minimumRoutableReplicaCount : stryMutAct_9fa48("121752") ? false : stryMutAct_9fa48("121751") ? true : (stryCov_9fa48("121751", "121752", "121753", "121754"), this.getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension).length >= minimumRoutableReplicaCount)) {
            if (stryMutAct_9fa48("121755")) {
              {}
            } else {
              stryCov_9fa48("121755");
              return;
            }
          }
          try {
            if (stryMutAct_9fa48("121756")) {
              {}
            } else {
              stryCov_9fa48("121756");
              await this.waitForPartitionServiceMetadata(replicaId, timeoutBudget);
            }
          } catch (_error) {
            // Best-effort hydration: aggregate routable-count wait is authoritative.
          }
        }
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
  async waitForRoutablePartitionServiceCount(partitionId, minimumCount, timeoutBudget = null, routingReadinessDimension = stryMutAct_9fa48("121757") ? this.queryExecutor.defaultRoutingReadinessDimension : (stryCov_9fa48("121757"), this.queryExecutor?.defaultRoutingReadinessDimension)) {
    if (stryMutAct_9fa48("121758")) {
      {}
    } else {
      stryCov_9fa48("121758");
      const requiredCount = (stryMutAct_9fa48("121761") ? Number.isInteger(minimumCount) || minimumCount > 0 : stryMutAct_9fa48("121760") ? false : stryMutAct_9fa48("121759") ? true : (stryCov_9fa48("121759", "121760", "121761"), Number.isInteger(minimumCount) && (stryMutAct_9fa48("121764") ? minimumCount <= 0 : stryMutAct_9fa48("121763") ? minimumCount >= 0 : stryMutAct_9fa48("121762") ? true : (stryCov_9fa48("121762", "121763", "121764"), minimumCount > 0)))) ? minimumCount : 1;
      const hasRequiredRoutableCount = stryMutAct_9fa48("121765") ? () => undefined : (stryCov_9fa48("121765"), (() => {
        const hasRequiredRoutableCount = () => stryMutAct_9fa48("121769") ? this.getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension).length < requiredCount : stryMutAct_9fa48("121768") ? this.getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension).length > requiredCount : stryMutAct_9fa48("121767") ? false : stryMutAct_9fa48("121766") ? true : (stryCov_9fa48("121766", "121767", "121768", "121769"), this.getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension).length >= requiredCount);
        return hasRequiredRoutableCount;
      })());
      const checkRoutableCountWithRepair = async () => {
        if (stryMutAct_9fa48("121770")) {
          {}
        } else {
          stryCov_9fa48("121770");
          if (stryMutAct_9fa48("121772") ? false : stryMutAct_9fa48("121771") ? true : (stryCov_9fa48("121771", "121772"), hasRequiredRoutableCount())) {
            if (stryMutAct_9fa48("121773")) {
              {}
            } else {
              stryCov_9fa48("121773");
              return stryMutAct_9fa48("121774") ? false : (stryCov_9fa48("121774"), true);
            }
          }
          return stryMutAct_9fa48("121777") ? (await this.maybeAwaitPartitionRoutingRepair(partitionId, routingReadinessDimension)) || hasRequiredRoutableCount() : stryMutAct_9fa48("121776") ? false : stryMutAct_9fa48("121775") ? true : (stryCov_9fa48("121775", "121776", "121777"), (await this.maybeAwaitPartitionRoutingRepair(partitionId, routingReadinessDimension)) && hasRequiredRoutableCount());
        }
      };
      if (stryMutAct_9fa48("121779") ? false : stryMutAct_9fa48("121778") ? true : (stryCov_9fa48("121778", "121779"), await checkRoutableCountWithRepair())) {
        if (stryMutAct_9fa48("121780")) {
          {}
        } else {
          stryCov_9fa48("121780");
          return;
        }
      }
      const effectiveBudget = this.allocateControlPlaneTimeoutBudget(stryMutAct_9fa48("121781") ? {} : (stryCov_9fa48("121781"), {
        timeoutBudget,
        requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
        minimumBudgetMs: this.tablePartitionProvisioningPollIntervalMs,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
        nestedOperation: stryMutAct_9fa48("121782") ? "" : (stryCov_9fa48("121782"), 'partition_routing_wait'),
        timeoutError: stryMutAct_9fa48("121783") ? QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX - partitionId : (stryCov_9fa48("121783"), QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX + partitionId)
      }));
      await this.waitForCondition(checkRoutableCountWithRepair, getRemainingBudgetMs(effectiveBudget, stryMutAct_9fa48("121784") ? {} : (stryCov_9fa48("121784"), {
        now: this.nowFn
      })), this.tablePartitionProvisioningPollIntervalMs, stryMutAct_9fa48("121785") ? QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX - partitionId : (stryCov_9fa48("121785"), QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX + partitionId), stryMutAct_9fa48("121786") ? {} : (stryCov_9fa48("121786"), {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
        nestedOperation: stryMutAct_9fa48("121787") ? "" : (stryCov_9fa48("121787"), 'partition_routing_wait')
      }));
    }
  }

  /**
   * Await one canonical routing-owner repair when stale readiness evidence
   * filters all active partition services locally.
   * @param {string} partitionId
   * @return {Promise<boolean>}
   * @private
   */
  async maybeAwaitPartitionRoutingRepair(partitionId, routingReadinessDimension = stryMutAct_9fa48("121788") ? this.queryExecutor.defaultRoutingReadinessDimension : (stryCov_9fa48("121788"), this.queryExecutor?.defaultRoutingReadinessDimension)) {
    if (stryMutAct_9fa48("121789")) {
      {}
    } else {
      stryCov_9fa48("121789");
      if (stryMutAct_9fa48("121792") ? (!partitionId || !this.queryExecutor || typeof this.queryExecutor.getPartitionRoutingSnapshot !== 'function') && typeof this.queryExecutor.maybeAwaitDeniedPartitionRoutingRepair !== 'function' : stryMutAct_9fa48("121791") ? false : stryMutAct_9fa48("121790") ? true : (stryCov_9fa48("121790", "121791", "121792"), (stryMutAct_9fa48("121794") ? (!partitionId || !this.queryExecutor) && typeof this.queryExecutor.getPartitionRoutingSnapshot !== 'function' : stryMutAct_9fa48("121793") ? false : (stryCov_9fa48("121793", "121794"), (stryMutAct_9fa48("121796") ? !partitionId && !this.queryExecutor : stryMutAct_9fa48("121795") ? false : (stryCov_9fa48("121795", "121796"), (stryMutAct_9fa48("121797") ? partitionId : (stryCov_9fa48("121797"), !partitionId)) || (stryMutAct_9fa48("121798") ? this.queryExecutor : (stryCov_9fa48("121798"), !this.queryExecutor)))) || (stryMutAct_9fa48("121800") ? typeof this.queryExecutor.getPartitionRoutingSnapshot === 'function' : stryMutAct_9fa48("121799") ? false : (stryCov_9fa48("121799", "121800"), typeof this.queryExecutor.getPartitionRoutingSnapshot !== (stryMutAct_9fa48("121801") ? "" : (stryCov_9fa48("121801"), 'function')))))) || (stryMutAct_9fa48("121803") ? typeof this.queryExecutor.maybeAwaitDeniedPartitionRoutingRepair === 'function' : stryMutAct_9fa48("121802") ? false : (stryCov_9fa48("121802", "121803"), typeof this.queryExecutor.maybeAwaitDeniedPartitionRoutingRepair !== (stryMutAct_9fa48("121804") ? "" : (stryCov_9fa48("121804"), 'function')))))) {
        if (stryMutAct_9fa48("121805")) {
          {}
        } else {
          stryCov_9fa48("121805");
          return stryMutAct_9fa48("121806") ? true : (stryCov_9fa48("121806"), false);
        }
      }
      let routingSnapshot = null;
      try {
        if (stryMutAct_9fa48("121807")) {
          {}
        } else {
          stryCov_9fa48("121807");
          routingSnapshot = this.queryExecutor.getPartitionRoutingSnapshot(partitionId, routingReadinessDimension);
        }
      } catch (_error) {
        if (stryMutAct_9fa48("121808")) {
          {}
        } else {
          stryCov_9fa48("121808");
          return stryMutAct_9fa48("121809") ? true : (stryCov_9fa48("121809"), false);
        }
      }
      try {
        if (stryMutAct_9fa48("121810")) {
          {}
        } else {
          stryCov_9fa48("121810");
          return await this.queryExecutor.maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot);
        }
      } catch (_error) {
        if (stryMutAct_9fa48("121811")) {
          {}
        } else {
          stryCov_9fa48("121811");
          return stryMutAct_9fa48("121812") ? true : (stryCov_9fa48("121812"), false);
        }
      }
    }
  }

  /**
   * Wait for one active leader service row to become visible for the partition.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeaderService(partitionId, timeoutBudget = null, options = {}) {
    if (stryMutAct_9fa48("121813")) {
      {}
    } else {
      stryCov_9fa48("121813");
      const routingReadinessDimension = (stryMutAct_9fa48("121816") ? typeof options?.routingReadinessDimension === 'string' || options.routingReadinessDimension.length > 0 : stryMutAct_9fa48("121815") ? false : stryMutAct_9fa48("121814") ? true : (stryCov_9fa48("121814", "121815", "121816"), (stryMutAct_9fa48("121818") ? typeof options?.routingReadinessDimension !== 'string' : stryMutAct_9fa48("121817") ? true : (stryCov_9fa48("121817", "121818"), typeof (stryMutAct_9fa48("121819") ? options.routingReadinessDimension : (stryCov_9fa48("121819"), options?.routingReadinessDimension)) === (stryMutAct_9fa48("121820") ? "" : (stryCov_9fa48("121820"), 'string')))) && (stryMutAct_9fa48("121823") ? options.routingReadinessDimension.length <= 0 : stryMutAct_9fa48("121822") ? options.routingReadinessDimension.length >= 0 : stryMutAct_9fa48("121821") ? true : (stryCov_9fa48("121821", "121822", "121823"), options.routingReadinessDimension.length > 0)))) ? options.routingReadinessDimension : stryMutAct_9fa48("121824") ? this.queryExecutor.defaultRoutingReadinessDimension : (stryCov_9fa48("121824"), this.queryExecutor?.defaultRoutingReadinessDimension);
      const hasLeaderRoute = () => {
        if (stryMutAct_9fa48("121825")) {
          {}
        } else {
          stryCov_9fa48("121825");
          this.maybeInstallBootstrapLeaderOverlay(partitionId, options);
          if (stryMutAct_9fa48("121828") ? !this.queryExecutor && typeof this.queryExecutor.findPartitionLeaderAddress !== 'function' : stryMutAct_9fa48("121827") ? false : stryMutAct_9fa48("121826") ? true : (stryCov_9fa48("121826", "121827", "121828"), (stryMutAct_9fa48("121829") ? this.queryExecutor : (stryCov_9fa48("121829"), !this.queryExecutor)) || (stryMutAct_9fa48("121831") ? typeof this.queryExecutor.findPartitionLeaderAddress === 'function' : stryMutAct_9fa48("121830") ? false : (stryCov_9fa48("121830", "121831"), typeof this.queryExecutor.findPartitionLeaderAddress !== (stryMutAct_9fa48("121832") ? "" : (stryCov_9fa48("121832"), 'function')))))) {
            if (stryMutAct_9fa48("121833")) {
              {}
            } else {
              stryCov_9fa48("121833");
              return stryMutAct_9fa48("121834") ? true : (stryCov_9fa48("121834"), false);
            }
          }
          const address = this.queryExecutor.findPartitionLeaderAddress(partitionId, routingReadinessDimension);
          return stryMutAct_9fa48("121837") ? typeof address === 'string' || address.length > 0 : stryMutAct_9fa48("121836") ? false : stryMutAct_9fa48("121835") ? true : (stryCov_9fa48("121835", "121836", "121837"), (stryMutAct_9fa48("121839") ? typeof address !== 'string' : stryMutAct_9fa48("121838") ? true : (stryCov_9fa48("121838", "121839"), typeof address === (stryMutAct_9fa48("121840") ? "" : (stryCov_9fa48("121840"), 'string')))) && (stryMutAct_9fa48("121843") ? address.length <= 0 : stryMutAct_9fa48("121842") ? address.length >= 0 : stryMutAct_9fa48("121841") ? true : (stryCov_9fa48("121841", "121842", "121843"), address.length > 0)));
        }
      };
      if (stryMutAct_9fa48("121845") ? false : stryMutAct_9fa48("121844") ? true : (stryCov_9fa48("121844", "121845"), hasLeaderRoute())) {
        if (stryMutAct_9fa48("121846")) {
          {}
        } else {
          stryCov_9fa48("121846");
          return;
        }
      }
      const effectiveBudget = this.allocateControlPlaneTimeoutBudget(stryMutAct_9fa48("121847") ? {} : (stryCov_9fa48("121847"), {
        timeoutBudget,
        requestedBudgetMs: this.tablePartitionProvisioningTimeoutMs,
        minimumBudgetMs: this.tablePartitionProvisioningPollIntervalMs,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
        nestedOperation: stryMutAct_9fa48("121848") ? "" : (stryCov_9fa48("121848"), 'partition_leader_wait'),
        timeoutError: stryMutAct_9fa48("121849") ? QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX - partitionId : (stryCov_9fa48("121849"), QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX + partitionId)
      }));
      await this.waitForCondition(hasLeaderRoute, getRemainingBudgetMs(effectiveBudget, stryMutAct_9fa48("121850") ? {} : (stryCov_9fa48("121850"), {
        now: this.nowFn
      })), this.tablePartitionProvisioningPollIntervalMs, stryMutAct_9fa48("121851") ? QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX - partitionId : (stryCov_9fa48("121851"), QUERY_ERROR_MSG.TABLE_PARTITION_LEADER_TIMEOUT_PREFIX + partitionId), stryMutAct_9fa48("121852") ? {} : (stryCov_9fa48("121852"), {
        timeoutBudget: effectiveBudget,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
        nestedOperation: stryMutAct_9fa48("121853") ? "" : (stryCov_9fa48("121853"), 'partition_leader_wait')
      }));
    }
  }

  /**
   * Check whether table metadata is available in local cache.
   * @param {string} tableId - Table ID.
   * @return {boolean} True when table exists in cache.
   * @private
   */
  hasTableMetadata(tableId) {
    if (stryMutAct_9fa48("121854")) {
      {}
    } else {
      stryCov_9fa48("121854");
      if (stryMutAct_9fa48("121857") ? !tableId && !this.systemCache : stryMutAct_9fa48("121856") ? false : stryMutAct_9fa48("121855") ? true : (stryCov_9fa48("121855", "121856", "121857"), (stryMutAct_9fa48("121858") ? tableId : (stryCov_9fa48("121858"), !tableId)) || (stryMutAct_9fa48("121859") ? this.systemCache : (stryCov_9fa48("121859"), !this.systemCache)))) {
        if (stryMutAct_9fa48("121860")) {
          {}
        } else {
          stryCov_9fa48("121860");
          return stryMutAct_9fa48("121861") ? true : (stryCov_9fa48("121861"), false);
        }
      }
      if (stryMutAct_9fa48("121864") ? typeof this.systemCache.has !== 'function' : stryMutAct_9fa48("121863") ? false : stryMutAct_9fa48("121862") ? true : (stryCov_9fa48("121862", "121863", "121864"), typeof this.systemCache.has === (stryMutAct_9fa48("121865") ? "" : (stryCov_9fa48("121865"), 'function')))) {
        if (stryMutAct_9fa48("121866")) {
          {}
        } else {
          stryCov_9fa48("121866");
          return this.systemCache.has(TABLES.TABLES, tableId);
        }
      }
      if (stryMutAct_9fa48("121869") ? typeof this.systemCache.get !== 'function' : stryMutAct_9fa48("121868") ? false : stryMutAct_9fa48("121867") ? true : (stryCov_9fa48("121867", "121868", "121869"), typeof this.systemCache.get === (stryMutAct_9fa48("121870") ? "" : (stryCov_9fa48("121870"), 'function')))) {
        if (stryMutAct_9fa48("121871")) {
          {}
        } else {
          stryCov_9fa48("121871");
          return Boolean(this.systemCache.get(TABLES.TABLES, tableId));
        }
      }
      if (stryMutAct_9fa48("121874") ? typeof this.systemCache.filter !== 'function' : stryMutAct_9fa48("121873") ? false : stryMutAct_9fa48("121872") ? true : (stryCov_9fa48("121872", "121873", "121874"), typeof this.systemCache.filter === (stryMutAct_9fa48("121875") ? "" : (stryCov_9fa48("121875"), 'function')))) {
        if (stryMutAct_9fa48("121876")) {
          {}
        } else {
          stryCov_9fa48("121876");
          const matches = stryMutAct_9fa48("121877") ? this.systemCache : (stryCov_9fa48("121877"), this.systemCache.filter(TABLES.TABLES, stryMutAct_9fa48("121878") ? () => undefined : (stryCov_9fa48("121878"), row => stryMutAct_9fa48("121881") ? row.table_id !== tableId : stryMutAct_9fa48("121880") ? false : stryMutAct_9fa48("121879") ? true : (stryCov_9fa48("121879", "121880", "121881"), row.table_id === tableId))));
          return stryMutAct_9fa48("121884") ? Array.isArray(matches) || matches.length > 0 : stryMutAct_9fa48("121883") ? false : stryMutAct_9fa48("121882") ? true : (stryCov_9fa48("121882", "121883", "121884"), Array.isArray(matches) && (stryMutAct_9fa48("121887") ? matches.length <= 0 : stryMutAct_9fa48("121886") ? matches.length >= 0 : stryMutAct_9fa48("121885") ? true : (stryCov_9fa48("121885", "121886", "121887"), matches.length > 0)));
        }
      }
      return stryMutAct_9fa48("121888") ? true : (stryCov_9fa48("121888"), false);
    }
  }

  /**
   * Check whether one partition service row is available in local cache.
   * @param {string} replicaId - Partition service replica ID.
   * @return {boolean} True when service row exists in cache.
   * @private
   */
  hasServiceMetadata(replicaId) {
    if (stryMutAct_9fa48("121889")) {
      {}
    } else {
      stryCov_9fa48("121889");
      if (stryMutAct_9fa48("121892") ? !replicaId && !this.systemCache : stryMutAct_9fa48("121891") ? false : stryMutAct_9fa48("121890") ? true : (stryCov_9fa48("121890", "121891", "121892"), (stryMutAct_9fa48("121893") ? replicaId : (stryCov_9fa48("121893"), !replicaId)) || (stryMutAct_9fa48("121894") ? this.systemCache : (stryCov_9fa48("121894"), !this.systemCache)))) {
        if (stryMutAct_9fa48("121895")) {
          {}
        } else {
          stryCov_9fa48("121895");
          return stryMutAct_9fa48("121896") ? true : (stryCov_9fa48("121896"), false);
        }
      }
      if (stryMutAct_9fa48("121899") ? typeof this.systemCache.has !== 'function' : stryMutAct_9fa48("121898") ? false : stryMutAct_9fa48("121897") ? true : (stryCov_9fa48("121897", "121898", "121899"), typeof this.systemCache.has === (stryMutAct_9fa48("121900") ? "" : (stryCov_9fa48("121900"), 'function')))) {
        if (stryMutAct_9fa48("121901")) {
          {}
        } else {
          stryCov_9fa48("121901");
          if (stryMutAct_9fa48("121903") ? false : stryMutAct_9fa48("121902") ? true : (stryCov_9fa48("121902", "121903"), this.systemCache.has(TABLES.SERVICES, replicaId))) {
            if (stryMutAct_9fa48("121904")) {
              {}
            } else {
              stryCov_9fa48("121904");
              return stryMutAct_9fa48("121905") ? false : (stryCov_9fa48("121905"), true);
            }
          }
        }
      }
      if (stryMutAct_9fa48("121908") ? typeof this.systemCache.get !== 'function' : stryMutAct_9fa48("121907") ? false : stryMutAct_9fa48("121906") ? true : (stryCov_9fa48("121906", "121907", "121908"), typeof this.systemCache.get === (stryMutAct_9fa48("121909") ? "" : (stryCov_9fa48("121909"), 'function')))) {
        if (stryMutAct_9fa48("121910")) {
          {}
        } else {
          stryCov_9fa48("121910");
          if (stryMutAct_9fa48("121912") ? false : stryMutAct_9fa48("121911") ? true : (stryCov_9fa48("121911", "121912"), this.systemCache.get(TABLES.SERVICES, replicaId))) {
            if (stryMutAct_9fa48("121913")) {
              {}
            } else {
              stryCov_9fa48("121913");
              return stryMutAct_9fa48("121914") ? false : (stryCov_9fa48("121914"), true);
            }
          }
        }
      }
      if (stryMutAct_9fa48("121917") ? typeof this.systemCache.filter !== 'function' : stryMutAct_9fa48("121916") ? false : stryMutAct_9fa48("121915") ? true : (stryCov_9fa48("121915", "121916", "121917"), typeof this.systemCache.filter === (stryMutAct_9fa48("121918") ? "" : (stryCov_9fa48("121918"), 'function')))) {
        if (stryMutAct_9fa48("121919")) {
          {}
        } else {
          stryCov_9fa48("121919");
          const matches = stryMutAct_9fa48("121920") ? this.systemCache : (stryCov_9fa48("121920"), this.systemCache.filter(TABLES.SERVICES, stryMutAct_9fa48("121921") ? () => undefined : (stryCov_9fa48("121921"), row => stryMutAct_9fa48("121924") ? row.service_id === replicaId && row.replica_id === replicaId : stryMutAct_9fa48("121923") ? false : stryMutAct_9fa48("121922") ? true : (stryCov_9fa48("121922", "121923", "121924"), (stryMutAct_9fa48("121926") ? row.service_id !== replicaId : stryMutAct_9fa48("121925") ? false : (stryCov_9fa48("121925", "121926"), row.service_id === replicaId)) || (stryMutAct_9fa48("121928") ? row.replica_id !== replicaId : stryMutAct_9fa48("121927") ? false : (stryCov_9fa48("121927", "121928"), row.replica_id === replicaId))))));
          if (stryMutAct_9fa48("121931") ? Array.isArray(matches) || matches.length > 0 : stryMutAct_9fa48("121930") ? false : stryMutAct_9fa48("121929") ? true : (stryCov_9fa48("121929", "121930", "121931"), Array.isArray(matches) && (stryMutAct_9fa48("121934") ? matches.length <= 0 : stryMutAct_9fa48("121933") ? matches.length >= 0 : stryMutAct_9fa48("121932") ? true : (stryCov_9fa48("121932", "121933", "121934"), matches.length > 0)))) {
            if (stryMutAct_9fa48("121935")) {
              {}
            } else {
              stryCov_9fa48("121935");
              return stryMutAct_9fa48("121936") ? false : (stryCov_9fa48("121936"), true);
            }
          }
        }
      }
      return stryMutAct_9fa48("121937") ? true : (stryCov_9fa48("121937"), false);
    }
  }

  /**
   * Check whether one partition service row is available and routable.
   * @param {string} replicaId - Partition service replica ID.
   * @return {boolean} True when service row is routable in local cache.
   * @private
   */
  hasRoutableServiceMetadata(replicaId) {
    if (stryMutAct_9fa48("121938")) {
      {}
    } else {
      stryCov_9fa48("121938");
      if (stryMutAct_9fa48("121941") ? !replicaId && !this.systemCache : stryMutAct_9fa48("121940") ? false : stryMutAct_9fa48("121939") ? true : (stryCov_9fa48("121939", "121940", "121941"), (stryMutAct_9fa48("121942") ? replicaId : (stryCov_9fa48("121942"), !replicaId)) || (stryMutAct_9fa48("121943") ? this.systemCache : (stryCov_9fa48("121943"), !this.systemCache)))) {
        if (stryMutAct_9fa48("121944")) {
          {}
        } else {
          stryCov_9fa48("121944");
          return stryMutAct_9fa48("121945") ? true : (stryCov_9fa48("121945"), false);
        }
      }
      const isRoutableService = service => {
        if (stryMutAct_9fa48("121946")) {
          {}
        } else {
          stryCov_9fa48("121946");
          if (stryMutAct_9fa48("121949") ? !service && typeof service !== 'object' : stryMutAct_9fa48("121948") ? false : stryMutAct_9fa48("121947") ? true : (stryCov_9fa48("121947", "121948", "121949"), (stryMutAct_9fa48("121950") ? service : (stryCov_9fa48("121950"), !service)) || (stryMutAct_9fa48("121952") ? typeof service === 'object' : stryMutAct_9fa48("121951") ? false : (stryCov_9fa48("121951", "121952"), typeof service !== (stryMutAct_9fa48("121953") ? "" : (stryCov_9fa48("121953"), 'object')))))) {
            if (stryMutAct_9fa48("121954")) {
              {}
            } else {
              stryCov_9fa48("121954");
              return stryMutAct_9fa48("121955") ? true : (stryCov_9fa48("121955"), false);
            }
          }
          if (stryMutAct_9fa48("121958") ? this.queryExecutor || typeof this.queryExecutor.isRoutablePartitionService === 'function' : stryMutAct_9fa48("121957") ? false : stryMutAct_9fa48("121956") ? true : (stryCov_9fa48("121956", "121957", "121958"), this.queryExecutor && (stryMutAct_9fa48("121960") ? typeof this.queryExecutor.isRoutablePartitionService !== 'function' : stryMutAct_9fa48("121959") ? true : (stryCov_9fa48("121959", "121960"), typeof this.queryExecutor.isRoutablePartitionService === (stryMutAct_9fa48("121961") ? "" : (stryCov_9fa48("121961"), 'function')))))) {
            if (stryMutAct_9fa48("121962")) {
              {}
            } else {
              stryCov_9fa48("121962");
              return this.queryExecutor.isRoutablePartitionService(service);
            }
          }
          return stryMutAct_9fa48("121963") ? true : (stryCov_9fa48("121963"), false);
        }
      };
      const matchesReplicaId = stryMutAct_9fa48("121964") ? () => undefined : (stryCov_9fa48("121964"), (() => {
        const matchesReplicaId = row => stryMutAct_9fa48("121967") ? row?.service_id === replicaId && row?.replica_id === replicaId : stryMutAct_9fa48("121966") ? false : stryMutAct_9fa48("121965") ? true : (stryCov_9fa48("121965", "121966", "121967"), (stryMutAct_9fa48("121969") ? row?.service_id !== replicaId : stryMutAct_9fa48("121968") ? false : (stryCov_9fa48("121968", "121969"), (stryMutAct_9fa48("121970") ? row.service_id : (stryCov_9fa48("121970"), row?.service_id)) === replicaId)) || (stryMutAct_9fa48("121972") ? row?.replica_id !== replicaId : stryMutAct_9fa48("121971") ? false : (stryCov_9fa48("121971", "121972"), (stryMutAct_9fa48("121973") ? row.replica_id : (stryCov_9fa48("121973"), row?.replica_id)) === replicaId)));
        return matchesReplicaId;
      })());
      if (stryMutAct_9fa48("121976") ? typeof this.systemCache.get !== 'function' : stryMutAct_9fa48("121975") ? false : stryMutAct_9fa48("121974") ? true : (stryCov_9fa48("121974", "121975", "121976"), typeof this.systemCache.get === (stryMutAct_9fa48("121977") ? "" : (stryCov_9fa48("121977"), 'function')))) {
        if (stryMutAct_9fa48("121978")) {
          {}
        } else {
          stryCov_9fa48("121978");
          const row = this.systemCache.get(TABLES.SERVICES, replicaId);
          if (stryMutAct_9fa48("121980") ? false : stryMutAct_9fa48("121979") ? true : (stryCov_9fa48("121979", "121980"), isRoutableService(row))) {
            if (stryMutAct_9fa48("121981")) {
              {}
            } else {
              stryCov_9fa48("121981");
              return stryMutAct_9fa48("121982") ? false : (stryCov_9fa48("121982"), true);
            }
          }
        }
      }
      if (stryMutAct_9fa48("121985") ? typeof this.systemCache.filter !== 'function' : stryMutAct_9fa48("121984") ? false : stryMutAct_9fa48("121983") ? true : (stryCov_9fa48("121983", "121984", "121985"), typeof this.systemCache.filter === (stryMutAct_9fa48("121986") ? "" : (stryCov_9fa48("121986"), 'function')))) {
        if (stryMutAct_9fa48("121987")) {
          {}
        } else {
          stryCov_9fa48("121987");
          const matches = stryMutAct_9fa48("121988") ? this.systemCache : (stryCov_9fa48("121988"), this.systemCache.filter(TABLES.SERVICES, stryMutAct_9fa48("121989") ? () => undefined : (stryCov_9fa48("121989"), row => stryMutAct_9fa48("121992") ? matchesReplicaId(row) || isRoutableService(row) : stryMutAct_9fa48("121991") ? false : stryMutAct_9fa48("121990") ? true : (stryCov_9fa48("121990", "121991", "121992"), matchesReplicaId(row) && isRoutableService(row)))));
          return stryMutAct_9fa48("121995") ? Array.isArray(matches) || matches.length > 0 : stryMutAct_9fa48("121994") ? false : stryMutAct_9fa48("121993") ? true : (stryCov_9fa48("121993", "121994", "121995"), Array.isArray(matches) && (stryMutAct_9fa48("121998") ? matches.length <= 0 : stryMutAct_9fa48("121997") ? matches.length >= 0 : stryMutAct_9fa48("121996") ? true : (stryCov_9fa48("121996", "121997", "121998"), matches.length > 0)));
        }
      }
      if (stryMutAct_9fa48("122001") ? typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("122000") ? false : stryMutAct_9fa48("121999") ? true : (stryCov_9fa48("121999", "122000", "122001"), typeof this.systemCache.getAll === (stryMutAct_9fa48("122002") ? "" : (stryCov_9fa48("122002"), 'function')))) {
        if (stryMutAct_9fa48("122003")) {
          {}
        } else {
          stryCov_9fa48("122003");
          const rows = this.systemCache.getAll(TABLES.SERVICES);
          if (stryMutAct_9fa48("122006") ? false : stryMutAct_9fa48("122005") ? true : stryMutAct_9fa48("122004") ? Array.isArray(rows) : (stryCov_9fa48("122004", "122005", "122006"), !Array.isArray(rows))) {
            if (stryMutAct_9fa48("122007")) {
              {}
            } else {
              stryCov_9fa48("122007");
              return stryMutAct_9fa48("122008") ? true : (stryCov_9fa48("122008"), false);
            }
          }
          return stryMutAct_9fa48("122009") ? rows.every(row => matchesReplicaId(row) && isRoutableService(row)) : (stryCov_9fa48("122009"), rows.some(stryMutAct_9fa48("122010") ? () => undefined : (stryCov_9fa48("122010"), row => stryMutAct_9fa48("122013") ? matchesReplicaId(row) || isRoutableService(row) : stryMutAct_9fa48("122012") ? false : stryMutAct_9fa48("122011") ? true : (stryCov_9fa48("122011", "122012", "122013"), matchesReplicaId(row) && isRoutableService(row)))));
        }
      }
      return stryMutAct_9fa48("122014") ? true : (stryCov_9fa48("122014"), false);
    }
  }

  /**
   * Check whether a partition currently has a routable service row.
   * @param {string} partitionId - Partition ID.
   * @return {boolean} True when routable.
   * @private
   */
  hasRoutablePartitionService(partitionId) {
    if (stryMutAct_9fa48("122015")) {
      {}
    } else {
      stryCov_9fa48("122015");
      return stryMutAct_9fa48("122019") ? this.getRoutablePartitionServiceNodeIds(partitionId).length <= 0 : stryMutAct_9fa48("122018") ? this.getRoutablePartitionServiceNodeIds(partitionId).length >= 0 : stryMutAct_9fa48("122017") ? false : stryMutAct_9fa48("122016") ? true : (stryCov_9fa48("122016", "122017", "122018", "122019"), this.getRoutablePartitionServiceNodeIds(partitionId).length > 0);
    }
  }

  /**
   * Get unique node IDs with routable partition services.
   * @param {string} partitionId - Partition ID.
   * @return {Array<string>} Unique node IDs.
   * @private
   */
  getRoutablePartitionServiceNodeIds(partitionId, routingReadinessDimension = undefined) {
    if (stryMutAct_9fa48("122020")) {
      {}
    } else {
      stryCov_9fa48("122020");
      if (stryMutAct_9fa48("122023") ? !this.queryExecutor && typeof this.queryExecutor.getRoutablePartitionServices !== 'function' : stryMutAct_9fa48("122022") ? false : stryMutAct_9fa48("122021") ? true : (stryCov_9fa48("122021", "122022", "122023"), (stryMutAct_9fa48("122024") ? this.queryExecutor : (stryCov_9fa48("122024"), !this.queryExecutor)) || (stryMutAct_9fa48("122026") ? typeof this.queryExecutor.getRoutablePartitionServices === 'function' : stryMutAct_9fa48("122025") ? false : (stryCov_9fa48("122025", "122026"), typeof this.queryExecutor.getRoutablePartitionServices !== (stryMutAct_9fa48("122027") ? "" : (stryCov_9fa48("122027"), 'function')))))) {
        if (stryMutAct_9fa48("122028")) {
          {}
        } else {
          stryCov_9fa48("122028");
          return stryMutAct_9fa48("122029") ? ["Stryker was here"] : (stryCov_9fa48("122029"), []);
        }
      }
      const services = this.queryExecutor.getRoutablePartitionServices(partitionId, routingReadinessDimension);
      const nodeIds = new Set();
      for (const service of services) {
        if (stryMutAct_9fa48("122030")) {
          {}
        } else {
          stryCov_9fa48("122030");
          const nodeId = stryMutAct_9fa48("122033") ? (service?.node_id || service?.nodeId) && null : stryMutAct_9fa48("122032") ? false : stryMutAct_9fa48("122031") ? true : (stryCov_9fa48("122031", "122032", "122033"), (stryMutAct_9fa48("122035") ? service?.node_id && service?.nodeId : stryMutAct_9fa48("122034") ? false : (stryCov_9fa48("122034", "122035"), (stryMutAct_9fa48("122036") ? service.node_id : (stryCov_9fa48("122036"), service?.node_id)) || (stryMutAct_9fa48("122037") ? service.nodeId : (stryCov_9fa48("122037"), service?.nodeId)))) || null);
          if (stryMutAct_9fa48("122040") ? typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("122039") ? false : stryMutAct_9fa48("122038") ? true : (stryCov_9fa48("122038", "122039", "122040"), (stryMutAct_9fa48("122042") ? typeof nodeId !== 'string' : stryMutAct_9fa48("122041") ? true : (stryCov_9fa48("122041", "122042"), typeof nodeId === (stryMutAct_9fa48("122043") ? "" : (stryCov_9fa48("122043"), 'string')))) && (stryMutAct_9fa48("122046") ? nodeId.length <= 0 : stryMutAct_9fa48("122045") ? nodeId.length >= 0 : stryMutAct_9fa48("122044") ? true : (stryCov_9fa48("122044", "122045", "122046"), nodeId.length > 0)))) {
            if (stryMutAct_9fa48("122047")) {
              {}
            } else {
              stryCov_9fa48("122047");
              nodeIds.add(nodeId);
            }
          }
        }
      }
      return stryMutAct_9fa48("122048") ? [] : (stryCov_9fa48("122048"), [...nodeIds]);
    }
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
    if (stryMutAct_9fa48("122049")) {
      {}
    } else {
      stryCov_9fa48("122049");
      if (stryMutAct_9fa48("122052") ? !primaryOverlay || !secondaryOverlay : stryMutAct_9fa48("122051") ? false : stryMutAct_9fa48("122050") ? true : (stryCov_9fa48("122050", "122051", "122052"), (stryMutAct_9fa48("122053") ? primaryOverlay : (stryCov_9fa48("122053"), !primaryOverlay)) && (stryMutAct_9fa48("122054") ? secondaryOverlay : (stryCov_9fa48("122054"), !secondaryOverlay)))) {
        if (stryMutAct_9fa48("122055")) {
          {}
        } else {
          stryCov_9fa48("122055");
          return null;
        }
      }
      if (stryMutAct_9fa48("122058") ? false : stryMutAct_9fa48("122057") ? true : stryMutAct_9fa48("122056") ? primaryOverlay : (stryCov_9fa48("122056", "122057", "122058"), !primaryOverlay)) {
        if (stryMutAct_9fa48("122059")) {
          {}
        } else {
          stryCov_9fa48("122059");
          return secondaryOverlay;
        }
      }
      if (stryMutAct_9fa48("122062") ? false : stryMutAct_9fa48("122061") ? true : stryMutAct_9fa48("122060") ? secondaryOverlay : (stryCov_9fa48("122060", "122061", "122062"), !secondaryOverlay)) {
        if (stryMutAct_9fa48("122063")) {
          {}
        } else {
          stryCov_9fa48("122063");
          return primaryOverlay;
        }
      }
      const mergeServices = partitionId => {
        if (stryMutAct_9fa48("122064")) {
          {}
        } else {
          stryCov_9fa48("122064");
          const mergedServices = stryMutAct_9fa48("122065") ? ["Stryker was here"] : (stryCov_9fa48("122065"), []);
          const seenServiceKeys = new Set();
          for (const overlay of stryMutAct_9fa48("122066") ? [] : (stryCov_9fa48("122066"), [primaryOverlay, secondaryOverlay])) {
            if (stryMutAct_9fa48("122067")) {
              {}
            } else {
              stryCov_9fa48("122067");
              if (stryMutAct_9fa48("122070") ? !overlay && typeof overlay.getServicesForPartition !== 'function' : stryMutAct_9fa48("122069") ? false : stryMutAct_9fa48("122068") ? true : (stryCov_9fa48("122068", "122069", "122070"), (stryMutAct_9fa48("122071") ? overlay : (stryCov_9fa48("122071"), !overlay)) || (stryMutAct_9fa48("122073") ? typeof overlay.getServicesForPartition === 'function' : stryMutAct_9fa48("122072") ? false : (stryCov_9fa48("122072", "122073"), typeof overlay.getServicesForPartition !== (stryMutAct_9fa48("122074") ? "" : (stryCov_9fa48("122074"), 'function')))))) {
                if (stryMutAct_9fa48("122075")) {
                  {}
                } else {
                  stryCov_9fa48("122075");
                  continue;
                }
              }
              const services = overlay.getServicesForPartition(partitionId);
              if (stryMutAct_9fa48("122078") ? false : stryMutAct_9fa48("122077") ? true : stryMutAct_9fa48("122076") ? Array.isArray(services) : (stryCov_9fa48("122076", "122077", "122078"), !Array.isArray(services))) {
                if (stryMutAct_9fa48("122079")) {
                  {}
                } else {
                  stryCov_9fa48("122079");
                  continue;
                }
              }
              for (const service of services) {
                if (stryMutAct_9fa48("122080")) {
                  {}
                } else {
                  stryCov_9fa48("122080");
                  const serviceKey = stryMutAct_9fa48("122083") ? (service?.service_id || service?.replica_id || service?.address) && null : stryMutAct_9fa48("122082") ? false : stryMutAct_9fa48("122081") ? true : (stryCov_9fa48("122081", "122082", "122083"), (stryMutAct_9fa48("122085") ? (service?.service_id || service?.replica_id) && service?.address : stryMutAct_9fa48("122084") ? false : (stryCov_9fa48("122084", "122085"), (stryMutAct_9fa48("122087") ? service?.service_id && service?.replica_id : stryMutAct_9fa48("122086") ? false : (stryCov_9fa48("122086", "122087"), (stryMutAct_9fa48("122088") ? service.service_id : (stryCov_9fa48("122088"), service?.service_id)) || (stryMutAct_9fa48("122089") ? service.replica_id : (stryCov_9fa48("122089"), service?.replica_id)))) || (stryMutAct_9fa48("122090") ? service.address : (stryCov_9fa48("122090"), service?.address)))) || null);
                  if (stryMutAct_9fa48("122093") ? (typeof serviceKey !== 'string' || serviceKey.length === 0) && seenServiceKeys.has(serviceKey) : stryMutAct_9fa48("122092") ? false : stryMutAct_9fa48("122091") ? true : (stryCov_9fa48("122091", "122092", "122093"), (stryMutAct_9fa48("122095") ? typeof serviceKey !== 'string' && serviceKey.length === 0 : stryMutAct_9fa48("122094") ? false : (stryCov_9fa48("122094", "122095"), (stryMutAct_9fa48("122097") ? typeof serviceKey === 'string' : stryMutAct_9fa48("122096") ? false : (stryCov_9fa48("122096", "122097"), typeof serviceKey !== (stryMutAct_9fa48("122098") ? "" : (stryCov_9fa48("122098"), 'string')))) || (stryMutAct_9fa48("122100") ? serviceKey.length !== 0 : stryMutAct_9fa48("122099") ? false : (stryCov_9fa48("122099", "122100"), serviceKey.length === 0)))) || seenServiceKeys.has(serviceKey))) {
                    if (stryMutAct_9fa48("122101")) {
                      {}
                    } else {
                      stryCov_9fa48("122101");
                      continue;
                    }
                  }
                  seenServiceKeys.add(serviceKey);
                  mergedServices.push(service);
                }
              }
            }
          }
          return mergedServices;
        }
      };
      return stryMutAct_9fa48("122102") ? {} : (stryCov_9fa48("122102"), {
        getPartitionById: partitionId => {
          if (stryMutAct_9fa48("122103")) {
            {}
          } else {
            stryCov_9fa48("122103");
            const primaryPartition = (stryMutAct_9fa48("122106") ? typeof primaryOverlay.getPartitionById !== 'function' : stryMutAct_9fa48("122105") ? false : stryMutAct_9fa48("122104") ? true : (stryCov_9fa48("122104", "122105", "122106"), typeof primaryOverlay.getPartitionById === (stryMutAct_9fa48("122107") ? "" : (stryCov_9fa48("122107"), 'function')))) ? primaryOverlay.getPartitionById(partitionId) : null;
            if (stryMutAct_9fa48("122109") ? false : stryMutAct_9fa48("122108") ? true : (stryCov_9fa48("122108", "122109"), primaryPartition)) {
              if (stryMutAct_9fa48("122110")) {
                {}
              } else {
                stryCov_9fa48("122110");
                return primaryPartition;
              }
            }
            return (stryMutAct_9fa48("122113") ? typeof secondaryOverlay.getPartitionById !== 'function' : stryMutAct_9fa48("122112") ? false : stryMutAct_9fa48("122111") ? true : (stryCov_9fa48("122111", "122112", "122113"), typeof secondaryOverlay.getPartitionById === (stryMutAct_9fa48("122114") ? "" : (stryCov_9fa48("122114"), 'function')))) ? secondaryOverlay.getPartitionById(partitionId) : null;
          }
        },
        getServicesForPartition: stryMutAct_9fa48("122115") ? () => undefined : (stryCov_9fa48("122115"), partitionId => mergeServices(partitionId)),
        refreshPartitionRouting: async (partitionId, options = {}) => {
          if (stryMutAct_9fa48("122116")) {
            {}
          } else {
            stryCov_9fa48("122116");
            for (const overlay of stryMutAct_9fa48("122117") ? [] : (stryCov_9fa48("122117"), [primaryOverlay, secondaryOverlay])) {
              if (stryMutAct_9fa48("122118")) {
                {}
              } else {
                stryCov_9fa48("122118");
                if (stryMutAct_9fa48("122121") ? !overlay && typeof overlay.refreshPartitionRouting !== 'function' : stryMutAct_9fa48("122120") ? false : stryMutAct_9fa48("122119") ? true : (stryCov_9fa48("122119", "122120", "122121"), (stryMutAct_9fa48("122122") ? overlay : (stryCov_9fa48("122122"), !overlay)) || (stryMutAct_9fa48("122124") ? typeof overlay.refreshPartitionRouting === 'function' : stryMutAct_9fa48("122123") ? false : (stryCov_9fa48("122123", "122124"), typeof overlay.refreshPartitionRouting !== (stryMutAct_9fa48("122125") ? "" : (stryCov_9fa48("122125"), 'function')))))) {
                  if (stryMutAct_9fa48("122126")) {
                    {}
                  } else {
                    stryCov_9fa48("122126");
                    continue;
                  }
                }
                const refreshed = await overlay.refreshPartitionRouting(partitionId, options);
                if (stryMutAct_9fa48("122129") ? refreshed !== true : stryMutAct_9fa48("122128") ? false : stryMutAct_9fa48("122127") ? true : (stryCov_9fa48("122127", "122128", "122129"), refreshed === (stryMutAct_9fa48("122130") ? false : (stryCov_9fa48("122130"), true)))) {
                  if (stryMutAct_9fa48("122131")) {
                    {}
                  } else {
                    stryCov_9fa48("122131");
                    return stryMutAct_9fa48("122132") ? false : (stryCov_9fa48("122132"), true);
                  }
                }
              }
            }
            return stryMutAct_9fa48("122133") ? true : (stryCov_9fa48("122133"), false);
          }
        }
      });
    }
  }

  /**
   * Resolve authoritative overlay partition metadata by ID.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getAuthoritativeRoutingOverlayPartition(partitionId) {
    if (stryMutAct_9fa48("122134")) {
      {}
    } else {
      stryCov_9fa48("122134");
      const overlayState = this.getAuthoritativeRoutingOverlayEntryState(partitionId);
      return (stryMutAct_9fa48("122137") ? overlayState.partitionState !== 'available' : stryMutAct_9fa48("122136") ? false : stryMutAct_9fa48("122135") ? true : (stryCov_9fa48("122135", "122136", "122137"), overlayState.partitionState === (stryMutAct_9fa48("122138") ? "" : (stryCov_9fa48("122138"), 'available')))) ? overlayState.partition : null;
    }
  }

  /**
   * Resolve authoritative overlay service rows by partition ID.
   * @param {string} partitionId
   * @return {Array<Object>}
   * @private
   */
  getAuthoritativeRoutingOverlayServices(partitionId) {
    if (stryMutAct_9fa48("122139")) {
      {}
    } else {
      stryCov_9fa48("122139");
      return this.getAuthoritativeRoutingOverlayEntryState(partitionId).services;
    }
  }

  /**
   * Resolve one explicit authoritative overlay entry state.
   * @param {string} partitionId
   * @return {Object}
   * @private
   */
  getAuthoritativeRoutingOverlayEntryState(partitionId) {
    if (stryMutAct_9fa48("122140")) {
      {}
    } else {
      stryCov_9fa48("122140");
      const entry = this.authoritativeRoutingOverlayEntries.get(partitionId);
      if (stryMutAct_9fa48("122143") ? !entry && typeof entry !== 'object' : stryMutAct_9fa48("122142") ? false : stryMutAct_9fa48("122141") ? true : (stryCov_9fa48("122141", "122142", "122143"), (stryMutAct_9fa48("122144") ? entry : (stryCov_9fa48("122144"), !entry)) || (stryMutAct_9fa48("122146") ? typeof entry === 'object' : stryMutAct_9fa48("122145") ? false : (stryCov_9fa48("122145", "122146"), typeof entry !== (stryMutAct_9fa48("122147") ? "" : (stryCov_9fa48("122147"), 'object')))))) {
        if (stryMutAct_9fa48("122148")) {
          {}
        } else {
          stryCov_9fa48("122148");
          return Object.freeze(stryMutAct_9fa48("122149") ? {} : (stryCov_9fa48("122149"), {
            state: stryMutAct_9fa48("122150") ? "" : (stryCov_9fa48("122150"), 'missing'),
            partitionState: stryMutAct_9fa48("122151") ? "" : (stryCov_9fa48("122151"), 'unavailable'),
            services: Object.freeze(stryMutAct_9fa48("122152") ? ["Stryker was here"] : (stryCov_9fa48("122152"), []))
          }));
        }
      }
      const services = Object.freeze(Array.isArray(entry.services) ? entry.services : stryMutAct_9fa48("122153") ? ["Stryker was here"] : (stryCov_9fa48("122153"), []));
      if (stryMutAct_9fa48("122156") ? entry.partition || typeof entry.partition === 'object' : stryMutAct_9fa48("122155") ? false : stryMutAct_9fa48("122154") ? true : (stryCov_9fa48("122154", "122155", "122156"), entry.partition && (stryMutAct_9fa48("122158") ? typeof entry.partition !== 'object' : stryMutAct_9fa48("122157") ? true : (stryCov_9fa48("122157", "122158"), typeof entry.partition === (stryMutAct_9fa48("122159") ? "" : (stryCov_9fa48("122159"), 'object')))))) {
        if (stryMutAct_9fa48("122160")) {
          {}
        } else {
          stryCov_9fa48("122160");
          return Object.freeze(stryMutAct_9fa48("122161") ? {} : (stryCov_9fa48("122161"), {
            state: stryMutAct_9fa48("122162") ? "" : (stryCov_9fa48("122162"), 'available'),
            partitionState: stryMutAct_9fa48("122163") ? "" : (stryCov_9fa48("122163"), 'available'),
            partition: entry.partition,
            services
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("122164") ? {} : (stryCov_9fa48("122164"), {
        state: stryMutAct_9fa48("122165") ? "" : (stryCov_9fa48("122165"), 'available'),
        partitionState: stryMutAct_9fa48("122166") ? "" : (stryCov_9fa48("122166"), 'unavailable'),
        services
      }));
    }
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
    if (stryMutAct_9fa48("122167")) {
      {}
    } else {
      stryCov_9fa48("122167");
      if (stryMutAct_9fa48("122170") ? typeof partitionId !== 'string' && partitionId.length === 0 : stryMutAct_9fa48("122169") ? false : stryMutAct_9fa48("122168") ? true : (stryCov_9fa48("122168", "122169", "122170"), (stryMutAct_9fa48("122172") ? typeof partitionId === 'string' : stryMutAct_9fa48("122171") ? false : (stryCov_9fa48("122171", "122172"), typeof partitionId !== (stryMutAct_9fa48("122173") ? "" : (stryCov_9fa48("122173"), 'string')))) || (stryMutAct_9fa48("122175") ? partitionId.length !== 0 : stryMutAct_9fa48("122174") ? false : (stryCov_9fa48("122174", "122175"), partitionId.length === 0)))) {
        if (stryMutAct_9fa48("122176")) {
          {}
        } else {
          stryCov_9fa48("122176");
          return stryMutAct_9fa48("122177") ? true : (stryCov_9fa48("122177"), false);
        }
      }
      const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
      if (stryMutAct_9fa48("122180") ? false : stryMutAct_9fa48("122179") ? true : stryMutAct_9fa48("122178") ? authoritativeControlPlaneView : (stryCov_9fa48("122178", "122179", "122180"), !authoritativeControlPlaneView)) {
        if (stryMutAct_9fa48("122181")) {
          {}
        } else {
          stryCov_9fa48("122181");
          return stryMutAct_9fa48("122182") ? true : (stryCov_9fa48("122182"), false);
        }
      }
      const queryTimeoutMs = (stryMutAct_9fa48("122185") ? Number.isFinite(options.queryTimeoutMs) || options.queryTimeoutMs > 0 : stryMutAct_9fa48("122184") ? false : stryMutAct_9fa48("122183") ? true : (stryCov_9fa48("122183", "122184", "122185"), Number.isFinite(options.queryTimeoutMs) && (stryMutAct_9fa48("122188") ? options.queryTimeoutMs <= 0 : stryMutAct_9fa48("122187") ? options.queryTimeoutMs >= 0 : stryMutAct_9fa48("122186") ? true : (stryCov_9fa48("122186", "122187", "122188"), options.queryTimeoutMs > 0)))) ? options.queryTimeoutMs : this.queryTimeoutMs;
      const [partitionResult, serviceResult] = await Promise.all(stryMutAct_9fa48("122189") ? [] : (stryCov_9fa48("122189"), [authoritativeControlPlaneView.readRows(TABLES.PARTITIONS, stryMutAct_9fa48("122190") ? `` : (stryCov_9fa48("122190"), `SELECT * FROM ${TABLES.PARTITIONS} WHERE ${COLUMN.PARTITION_ID} = ?`), stryMutAct_9fa48("122191") ? [] : (stryCov_9fa48("122191"), [partitionId]), stryMutAct_9fa48("122192") ? {} : (stryCov_9fa48("122192"), {
        allowSqlFallback: stryMutAct_9fa48("122193") ? true : (stryCov_9fa48("122193"), false),
        queryTimeoutMs
      })), authoritativeControlPlaneView.readRows(TABLES.SERVICES, (stryMutAct_9fa48("122194") ? `` : (stryCov_9fa48("122194"), `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.PARTITION_ID} = ? `)) + (stryMutAct_9fa48("122195") ? `` : (stryCov_9fa48("122195"), `AND ${COLUMN.SERVICE_TYPE} = ?`)), stryMutAct_9fa48("122196") ? [] : (stryCov_9fa48("122196"), [partitionId, SERVICE_TYPE.PARTITION]), stryMutAct_9fa48("122197") ? {} : (stryCov_9fa48("122197"), {
        allowSqlFallback: stryMutAct_9fa48("122198") ? true : (stryCov_9fa48("122198"), false),
        queryTimeoutMs
      }))]));
      const partitionRows = Array.isArray(stryMutAct_9fa48("122199") ? partitionResult.rows : (stryCov_9fa48("122199"), partitionResult?.rows)) ? partitionResult.rows : stryMutAct_9fa48("122200") ? ["Stryker was here"] : (stryCov_9fa48("122200"), []);
      const serviceRows = Array.isArray(stryMutAct_9fa48("122201") ? serviceResult.rows : (stryCov_9fa48("122201"), serviceResult?.rows)) ? stryMutAct_9fa48("122202") ? serviceResult.rows : (stryCov_9fa48("122202"), serviceResult.rows.filter(stryMutAct_9fa48("122203") ? () => undefined : (stryCov_9fa48("122203"), service => stryMutAct_9fa48("122206") ? service?.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("122205") ? false : stryMutAct_9fa48("122204") ? true : (stryCov_9fa48("122204", "122205", "122206"), (stryMutAct_9fa48("122207") ? service.service_type : (stryCov_9fa48("122207"), service?.service_type)) === SERVICE_TYPE.PARTITION)))) : stryMutAct_9fa48("122208") ? ["Stryker was here"] : (stryCov_9fa48("122208"), []);
      if (stryMutAct_9fa48("122211") ? partitionRows.length === 0 || serviceRows.length === 0 : stryMutAct_9fa48("122210") ? false : stryMutAct_9fa48("122209") ? true : (stryCov_9fa48("122209", "122210", "122211"), (stryMutAct_9fa48("122213") ? partitionRows.length !== 0 : stryMutAct_9fa48("122212") ? true : (stryCov_9fa48("122212", "122213"), partitionRows.length === 0)) && (stryMutAct_9fa48("122215") ? serviceRows.length !== 0 : stryMutAct_9fa48("122214") ? true : (stryCov_9fa48("122214", "122215"), serviceRows.length === 0)))) {
        if (stryMutAct_9fa48("122216")) {
          {}
        } else {
          stryCov_9fa48("122216");
          this.authoritativeRoutingOverlayEntries.delete(partitionId);
          return stryMutAct_9fa48("122217") ? true : (stryCov_9fa48("122217"), false);
        }
      }
      this.authoritativeRoutingOverlayEntries.set(partitionId, stryMutAct_9fa48("122218") ? {} : (stryCov_9fa48("122218"), {
        partition: stryMutAct_9fa48("122221") ? partitionRows[0] && null : stryMutAct_9fa48("122220") ? false : stryMutAct_9fa48("122219") ? true : (stryCov_9fa48("122219", "122220", "122221"), partitionRows[0] || null),
        services: serviceRows
      }));
      return stryMutAct_9fa48("122222") ? false : (stryCov_9fa48("122222"), true);
    }
  }

  /**
   * Get current partition service rows from the local cache.
   * @param {string} partitionId - Partition ID.
   * @return {Array<Object>} Partition service rows.
   * @private
   */
  getPartitionServiceRows(partitionId) {
    if (stryMutAct_9fa48("122223")) {
      {}
    } else {
      stryCov_9fa48("122223");
      if (stryMutAct_9fa48("122226") ? !partitionId && !this.systemCache : stryMutAct_9fa48("122225") ? false : stryMutAct_9fa48("122224") ? true : (stryCov_9fa48("122224", "122225", "122226"), (stryMutAct_9fa48("122227") ? partitionId : (stryCov_9fa48("122227"), !partitionId)) || (stryMutAct_9fa48("122228") ? this.systemCache : (stryCov_9fa48("122228"), !this.systemCache)))) {
        if (stryMutAct_9fa48("122229")) {
          {}
        } else {
          stryCov_9fa48("122229");
          return stryMutAct_9fa48("122230") ? ["Stryker was here"] : (stryCov_9fa48("122230"), []);
        }
      }
      if (stryMutAct_9fa48("122233") ? typeof this.systemCache.filter !== 'function' : stryMutAct_9fa48("122232") ? false : stryMutAct_9fa48("122231") ? true : (stryCov_9fa48("122231", "122232", "122233"), typeof this.systemCache.filter === (stryMutAct_9fa48("122234") ? "" : (stryCov_9fa48("122234"), 'function')))) {
        if (stryMutAct_9fa48("122235")) {
          {}
        } else {
          stryCov_9fa48("122235");
          const rows = stryMutAct_9fa48("122236") ? this.systemCache : (stryCov_9fa48("122236"), this.systemCache.filter(TABLES.SERVICES, stryMutAct_9fa48("122237") ? () => undefined : (stryCov_9fa48("122237"), service => stryMutAct_9fa48("122240") ? service?.partition_id === partitionId || service?.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("122239") ? false : stryMutAct_9fa48("122238") ? true : (stryCov_9fa48("122238", "122239", "122240"), (stryMutAct_9fa48("122242") ? service?.partition_id !== partitionId : stryMutAct_9fa48("122241") ? true : (stryCov_9fa48("122241", "122242"), (stryMutAct_9fa48("122243") ? service.partition_id : (stryCov_9fa48("122243"), service?.partition_id)) === partitionId)) && (stryMutAct_9fa48("122245") ? service?.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("122244") ? true : (stryCov_9fa48("122244", "122245"), (stryMutAct_9fa48("122246") ? service.service_type : (stryCov_9fa48("122246"), service?.service_type)) === SERVICE_TYPE.PARTITION))))));
          return Array.isArray(rows) ? rows : stryMutAct_9fa48("122247") ? ["Stryker was here"] : (stryCov_9fa48("122247"), []);
        }
      }
      if (stryMutAct_9fa48("122250") ? typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("122249") ? false : stryMutAct_9fa48("122248") ? true : (stryCov_9fa48("122248", "122249", "122250"), typeof this.systemCache.getAll === (stryMutAct_9fa48("122251") ? "" : (stryCov_9fa48("122251"), 'function')))) {
        if (stryMutAct_9fa48("122252")) {
          {}
        } else {
          stryCov_9fa48("122252");
          const rows = this.systemCache.getAll(TABLES.SERVICES);
          if (stryMutAct_9fa48("122255") ? false : stryMutAct_9fa48("122254") ? true : stryMutAct_9fa48("122253") ? Array.isArray(rows) : (stryCov_9fa48("122253", "122254", "122255"), !Array.isArray(rows))) {
            if (stryMutAct_9fa48("122256")) {
              {}
            } else {
              stryCov_9fa48("122256");
              return stryMutAct_9fa48("122257") ? ["Stryker was here"] : (stryCov_9fa48("122257"), []);
            }
          }
          return stryMutAct_9fa48("122258") ? rows : (stryCov_9fa48("122258"), rows.filter(stryMutAct_9fa48("122259") ? () => undefined : (stryCov_9fa48("122259"), service => stryMutAct_9fa48("122262") ? service?.partition_id === partitionId || service?.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("122261") ? false : stryMutAct_9fa48("122260") ? true : (stryCov_9fa48("122260", "122261", "122262"), (stryMutAct_9fa48("122264") ? service?.partition_id !== partitionId : stryMutAct_9fa48("122263") ? true : (stryCov_9fa48("122263", "122264"), (stryMutAct_9fa48("122265") ? service.partition_id : (stryCov_9fa48("122265"), service?.partition_id)) === partitionId)) && (stryMutAct_9fa48("122267") ? service?.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("122266") ? true : (stryCov_9fa48("122266", "122267"), (stryMutAct_9fa48("122268") ? service.service_type : (stryCov_9fa48("122268"), service?.service_type)) === SERVICE_TYPE.PARTITION))))));
        }
      }
      return stryMutAct_9fa48("122269") ? ["Stryker was here"] : (stryCov_9fa48("122269"), []);
    }
  }

  /**
   * Resolve the canonical partition row from cache only, without routing
   * overlay fallbacks.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getCachedPartitionRecord(partitionId) {
    if (stryMutAct_9fa48("122270")) {
      {}
    } else {
      stryCov_9fa48("122270");
      if (stryMutAct_9fa48("122273") ? !partitionId && !this.systemCache : stryMutAct_9fa48("122272") ? false : stryMutAct_9fa48("122271") ? true : (stryCov_9fa48("122271", "122272", "122273"), (stryMutAct_9fa48("122274") ? partitionId : (stryCov_9fa48("122274"), !partitionId)) || (stryMutAct_9fa48("122275") ? this.systemCache : (stryCov_9fa48("122275"), !this.systemCache)))) {
        if (stryMutAct_9fa48("122276")) {
          {}
        } else {
          stryCov_9fa48("122276");
          return null;
        }
      }
      if (stryMutAct_9fa48("122279") ? typeof this.systemCache.get !== 'function' : stryMutAct_9fa48("122278") ? false : stryMutAct_9fa48("122277") ? true : (stryCov_9fa48("122277", "122278", "122279"), typeof this.systemCache.get === (stryMutAct_9fa48("122280") ? "" : (stryCov_9fa48("122280"), 'function')))) {
        if (stryMutAct_9fa48("122281")) {
          {}
        } else {
          stryCov_9fa48("122281");
          const record = this.systemCache.get(TABLES.PARTITIONS, partitionId);
          if (stryMutAct_9fa48("122283") ? false : stryMutAct_9fa48("122282") ? true : (stryCov_9fa48("122282", "122283"), record)) {
            if (stryMutAct_9fa48("122284")) {
              {}
            } else {
              stryCov_9fa48("122284");
              return record;
            }
          }
        }
      }
      if (stryMutAct_9fa48("122287") ? typeof this.systemCache.filter !== 'function' : stryMutAct_9fa48("122286") ? false : stryMutAct_9fa48("122285") ? true : (stryCov_9fa48("122285", "122286", "122287"), typeof this.systemCache.filter === (stryMutAct_9fa48("122288") ? "" : (stryCov_9fa48("122288"), 'function')))) {
        if (stryMutAct_9fa48("122289")) {
          {}
        } else {
          stryCov_9fa48("122289");
          const records = stryMutAct_9fa48("122290") ? this.systemCache : (stryCov_9fa48("122290"), this.systemCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("122291") ? () => undefined : (stryCov_9fa48("122291"), partition => stryMutAct_9fa48("122294") ? partition?.partition_id === partitionId && partition?.partitionId === partitionId : stryMutAct_9fa48("122293") ? false : stryMutAct_9fa48("122292") ? true : (stryCov_9fa48("122292", "122293", "122294"), (stryMutAct_9fa48("122296") ? partition?.partition_id !== partitionId : stryMutAct_9fa48("122295") ? false : (stryCov_9fa48("122295", "122296"), (stryMutAct_9fa48("122297") ? partition.partition_id : (stryCov_9fa48("122297"), partition?.partition_id)) === partitionId)) || (stryMutAct_9fa48("122299") ? partition?.partitionId !== partitionId : stryMutAct_9fa48("122298") ? false : (stryCov_9fa48("122298", "122299"), (stryMutAct_9fa48("122300") ? partition.partitionId : (stryCov_9fa48("122300"), partition?.partitionId)) === partitionId))))));
          if (stryMutAct_9fa48("122303") ? Array.isArray(records) || records.length > 0 : stryMutAct_9fa48("122302") ? false : stryMutAct_9fa48("122301") ? true : (stryCov_9fa48("122301", "122302", "122303"), Array.isArray(records) && (stryMutAct_9fa48("122306") ? records.length <= 0 : stryMutAct_9fa48("122305") ? records.length >= 0 : stryMutAct_9fa48("122304") ? true : (stryCov_9fa48("122304", "122305", "122306"), records.length > 0)))) {
            if (stryMutAct_9fa48("122307")) {
              {}
            } else {
              stryCov_9fa48("122307");
              return records[0];
            }
          }
        }
      }
      if (stryMutAct_9fa48("122310") ? typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("122309") ? false : stryMutAct_9fa48("122308") ? true : (stryCov_9fa48("122308", "122309", "122310"), typeof this.systemCache.getAll === (stryMutAct_9fa48("122311") ? "" : (stryCov_9fa48("122311"), 'function')))) {
        if (stryMutAct_9fa48("122312")) {
          {}
        } else {
          stryCov_9fa48("122312");
          const records = stryMutAct_9fa48("122315") ? this.systemCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("122314") ? false : stryMutAct_9fa48("122313") ? true : (stryCov_9fa48("122313", "122314", "122315"), this.systemCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("122316") ? ["Stryker was here"] : (stryCov_9fa48("122316"), [])));
          return stryMutAct_9fa48("122319") ? records.find(partition => partition?.partition_id === partitionId || partition?.partitionId === partitionId) && null : stryMutAct_9fa48("122318") ? false : stryMutAct_9fa48("122317") ? true : (stryCov_9fa48("122317", "122318", "122319"), records.find(stryMutAct_9fa48("122320") ? () => undefined : (stryCov_9fa48("122320"), partition => stryMutAct_9fa48("122323") ? partition?.partition_id === partitionId && partition?.partitionId === partitionId : stryMutAct_9fa48("122322") ? false : stryMutAct_9fa48("122321") ? true : (stryCov_9fa48("122321", "122322", "122323"), (stryMutAct_9fa48("122325") ? partition?.partition_id !== partitionId : stryMutAct_9fa48("122324") ? false : (stryCov_9fa48("122324", "122325"), (stryMutAct_9fa48("122326") ? partition.partition_id : (stryCov_9fa48("122326"), partition?.partition_id)) === partitionId)) || (stryMutAct_9fa48("122328") ? partition?.partitionId !== partitionId : stryMutAct_9fa48("122327") ? false : (stryCov_9fa48("122327", "122328"), (stryMutAct_9fa48("122329") ? partition.partitionId : (stryCov_9fa48("122329"), partition?.partitionId)) === partitionId))))) || null);
        }
      }
      return null;
    }
  }

  /**
   * Resolve cache-backed routable partition services without overlay help.
   * @param {string} partitionId
   * @return {Object[]}
   * @private
   */
  getCachedRoutablePartitionServiceRows(partitionId) {
    if (stryMutAct_9fa48("122330")) {
      {}
    } else {
      stryCov_9fa48("122330");
      const serviceRows = this.getPartitionServiceRows(partitionId);
      const isRoutableService = service => {
        if (stryMutAct_9fa48("122331")) {
          {}
        } else {
          stryCov_9fa48("122331");
          if (stryMutAct_9fa48("122334") ? !service && typeof service !== 'object' : stryMutAct_9fa48("122333") ? false : stryMutAct_9fa48("122332") ? true : (stryCov_9fa48("122332", "122333", "122334"), (stryMutAct_9fa48("122335") ? service : (stryCov_9fa48("122335"), !service)) || (stryMutAct_9fa48("122337") ? typeof service === 'object' : stryMutAct_9fa48("122336") ? false : (stryCov_9fa48("122336", "122337"), typeof service !== (stryMutAct_9fa48("122338") ? "" : (stryCov_9fa48("122338"), 'object')))))) {
            if (stryMutAct_9fa48("122339")) {
              {}
            } else {
              stryCov_9fa48("122339");
              return stryMutAct_9fa48("122340") ? true : (stryCov_9fa48("122340"), false);
            }
          }
          if (stryMutAct_9fa48("122343") ? this.queryExecutor || typeof this.queryExecutor.isRoutablePartitionService === 'function' : stryMutAct_9fa48("122342") ? false : stryMutAct_9fa48("122341") ? true : (stryCov_9fa48("122341", "122342", "122343"), this.queryExecutor && (stryMutAct_9fa48("122345") ? typeof this.queryExecutor.isRoutablePartitionService !== 'function' : stryMutAct_9fa48("122344") ? true : (stryCov_9fa48("122344", "122345"), typeof this.queryExecutor.isRoutablePartitionService === (stryMutAct_9fa48("122346") ? "" : (stryCov_9fa48("122346"), 'function')))))) {
            if (stryMutAct_9fa48("122347")) {
              {}
            } else {
              stryCov_9fa48("122347");
              return this.queryExecutor.isRoutablePartitionService(service);
            }
          }
          return stryMutAct_9fa48("122348") ? true : (stryCov_9fa48("122348"), false);
        }
      };
      return stryMutAct_9fa48("122349") ? serviceRows : (stryCov_9fa48("122349"), serviceRows.filter(stryMutAct_9fa48("122350") ? () => undefined : (stryCov_9fa48("122350"), service => isRoutableService(service))));
    }
  }

  /**
   * Install one short-lived overlay owner row when fresh partition services are
   * already visible but the canonical partition row is still missing or lacks a
   * leader_node_id.
   * @param {string} partitionId
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  maybeInstallBootstrapLeaderOverlay(partitionId, options = {}) {
    if (stryMutAct_9fa48("122351")) {
      {}
    } else {
      stryCov_9fa48("122351");
      if (stryMutAct_9fa48("122354") ? false : stryMutAct_9fa48("122353") ? true : stryMutAct_9fa48("122352") ? partitionId : (stryCov_9fa48("122352", "122353", "122354"), !partitionId)) {
        if (stryMutAct_9fa48("122355")) {
          {}
        } else {
          stryCov_9fa48("122355");
          return stryMutAct_9fa48("122356") ? true : (stryCov_9fa48("122356"), false);
        }
      }
      const cachedPartition = this.getCachedPartitionRecord(partitionId);
      const cachedLeaderNodeId = stryMutAct_9fa48("122359") ? (cachedPartition?.leader_node_id || cachedPartition?.leaderNodeId) && null : stryMutAct_9fa48("122358") ? false : stryMutAct_9fa48("122357") ? true : (stryCov_9fa48("122357", "122358", "122359"), (stryMutAct_9fa48("122361") ? cachedPartition?.leader_node_id && cachedPartition?.leaderNodeId : stryMutAct_9fa48("122360") ? false : (stryCov_9fa48("122360", "122361"), (stryMutAct_9fa48("122362") ? cachedPartition.leader_node_id : (stryCov_9fa48("122362"), cachedPartition?.leader_node_id)) || (stryMutAct_9fa48("122363") ? cachedPartition.leaderNodeId : (stryCov_9fa48("122363"), cachedPartition?.leaderNodeId)))) || null);
      if (stryMutAct_9fa48("122366") ? typeof cachedLeaderNodeId === 'string' || cachedLeaderNodeId.length > 0 : stryMutAct_9fa48("122365") ? false : stryMutAct_9fa48("122364") ? true : (stryCov_9fa48("122364", "122365", "122366"), (stryMutAct_9fa48("122368") ? typeof cachedLeaderNodeId !== 'string' : stryMutAct_9fa48("122367") ? true : (stryCov_9fa48("122367", "122368"), typeof cachedLeaderNodeId === (stryMutAct_9fa48("122369") ? "" : (stryCov_9fa48("122369"), 'string')))) && (stryMutAct_9fa48("122372") ? cachedLeaderNodeId.length <= 0 : stryMutAct_9fa48("122371") ? cachedLeaderNodeId.length >= 0 : stryMutAct_9fa48("122370") ? true : (stryCov_9fa48("122370", "122371", "122372"), cachedLeaderNodeId.length > 0)))) {
        if (stryMutAct_9fa48("122373")) {
          {}
        } else {
          stryCov_9fa48("122373");
          this.bootstrapRoutingOverlayEntries.delete(partitionId);
          return stryMutAct_9fa48("122374") ? true : (stryCov_9fa48("122374"), false);
        }
      }
      const candidateServiceRows = Array.isArray(stryMutAct_9fa48("122375") ? options.serviceRows : (stryCov_9fa48("122375"), options?.serviceRows)) ? options.serviceRows : null;
      const routableServices = Array.isArray(candidateServiceRows) ? stryMutAct_9fa48("122376") ? candidateServiceRows : (stryCov_9fa48("122376"), candidateServiceRows.filter(service => {
        if (stryMutAct_9fa48("122377")) {
          {}
        } else {
          stryCov_9fa48("122377");
          if (stryMutAct_9fa48("122380") ? !service && typeof service !== 'object' : stryMutAct_9fa48("122379") ? false : stryMutAct_9fa48("122378") ? true : (stryCov_9fa48("122378", "122379", "122380"), (stryMutAct_9fa48("122381") ? service : (stryCov_9fa48("122381"), !service)) || (stryMutAct_9fa48("122383") ? typeof service === 'object' : stryMutAct_9fa48("122382") ? false : (stryCov_9fa48("122382", "122383"), typeof service !== (stryMutAct_9fa48("122384") ? "" : (stryCov_9fa48("122384"), 'object')))))) {
            if (stryMutAct_9fa48("122385")) {
              {}
            } else {
              stryCov_9fa48("122385");
              return stryMutAct_9fa48("122386") ? true : (stryCov_9fa48("122386"), false);
            }
          }
          if (stryMutAct_9fa48("122389") ? this.queryExecutor || typeof this.queryExecutor.isRoutablePartitionService === 'function' : stryMutAct_9fa48("122388") ? false : stryMutAct_9fa48("122387") ? true : (stryCov_9fa48("122387", "122388", "122389"), this.queryExecutor && (stryMutAct_9fa48("122391") ? typeof this.queryExecutor.isRoutablePartitionService !== 'function' : stryMutAct_9fa48("122390") ? true : (stryCov_9fa48("122390", "122391"), typeof this.queryExecutor.isRoutablePartitionService === (stryMutAct_9fa48("122392") ? "" : (stryCov_9fa48("122392"), 'function')))))) {
            if (stryMutAct_9fa48("122393")) {
              {}
            } else {
              stryCov_9fa48("122393");
              return this.queryExecutor.isRoutablePartitionService(service);
            }
          }
          return stryMutAct_9fa48("122394") ? true : (stryCov_9fa48("122394"), false);
        }
      })) : this.getCachedRoutablePartitionServiceRows(partitionId);
      if (stryMutAct_9fa48("122397") ? routableServices.length !== 0 : stryMutAct_9fa48("122396") ? false : stryMutAct_9fa48("122395") ? true : (stryCov_9fa48("122395", "122396", "122397"), routableServices.length === 0)) {
        if (stryMutAct_9fa48("122398")) {
          {}
        } else {
          stryCov_9fa48("122398");
          return stryMutAct_9fa48("122399") ? true : (stryCov_9fa48("122399"), false);
        }
      }
      const hintedLeaderNodeId = String(stryMutAct_9fa48("122402") ? (options?.bootstrapLeaderNodeId || options?.partitionMetadata?.leader_node_id || options?.partitionMetadata?.leaderNodeId) && '' : stryMutAct_9fa48("122401") ? false : stryMutAct_9fa48("122400") ? true : (stryCov_9fa48("122400", "122401", "122402"), (stryMutAct_9fa48("122404") ? (options?.bootstrapLeaderNodeId || options?.partitionMetadata?.leader_node_id) && options?.partitionMetadata?.leaderNodeId : stryMutAct_9fa48("122403") ? false : (stryCov_9fa48("122403", "122404"), (stryMutAct_9fa48("122406") ? options?.bootstrapLeaderNodeId && options?.partitionMetadata?.leader_node_id : stryMutAct_9fa48("122405") ? false : (stryCov_9fa48("122405", "122406"), (stryMutAct_9fa48("122407") ? options.bootstrapLeaderNodeId : (stryCov_9fa48("122407"), options?.bootstrapLeaderNodeId)) || (stryMutAct_9fa48("122409") ? options.partitionMetadata?.leader_node_id : stryMutAct_9fa48("122408") ? options?.partitionMetadata.leader_node_id : (stryCov_9fa48("122408", "122409"), options?.partitionMetadata?.leader_node_id)))) || (stryMutAct_9fa48("122411") ? options.partitionMetadata?.leaderNodeId : stryMutAct_9fa48("122410") ? options?.partitionMetadata.leaderNodeId : (stryCov_9fa48("122410", "122411"), options?.partitionMetadata?.leaderNodeId)))) || (stryMutAct_9fa48("122412") ? "Stryker was here!" : (stryCov_9fa48("122412"), ''))));
      const leaderSelection = resolveBootstrapLeaderSelection(stryMutAct_9fa48("122413") ? {} : (stryCov_9fa48("122413"), {
        services: routableServices,
        hintedLeaderNodeId
      }));
      const leaderNodeId = leaderSelection.leaderNodeId;
      if (stryMutAct_9fa48("122416") ? typeof leaderNodeId !== 'string' && leaderNodeId.length === 0 : stryMutAct_9fa48("122415") ? false : stryMutAct_9fa48("122414") ? true : (stryCov_9fa48("122414", "122415", "122416"), (stryMutAct_9fa48("122418") ? typeof leaderNodeId === 'string' : stryMutAct_9fa48("122417") ? false : (stryCov_9fa48("122417", "122418"), typeof leaderNodeId !== (stryMutAct_9fa48("122419") ? "" : (stryCov_9fa48("122419"), 'string')))) || (stryMutAct_9fa48("122421") ? leaderNodeId.length !== 0 : stryMutAct_9fa48("122420") ? false : (stryCov_9fa48("122420", "122421"), leaderNodeId.length === 0)))) {
        if (stryMutAct_9fa48("122422")) {
          {}
        } else {
          stryCov_9fa48("122422");
          return stryMutAct_9fa48("122423") ? true : (stryCov_9fa48("122423"), false);
        }
      }
      const basePartition = stryMutAct_9fa48("122426") ? cachedPartition && (options?.partitionMetadata && typeof options.partitionMetadata === 'object' ? options.partitionMetadata : {
        partition_id: partitionId
      }) : stryMutAct_9fa48("122425") ? false : stryMutAct_9fa48("122424") ? true : (stryCov_9fa48("122424", "122425", "122426"), cachedPartition || ((stryMutAct_9fa48("122429") ? options?.partitionMetadata || typeof options.partitionMetadata === 'object' : stryMutAct_9fa48("122428") ? false : stryMutAct_9fa48("122427") ? true : (stryCov_9fa48("122427", "122428", "122429"), (stryMutAct_9fa48("122430") ? options.partitionMetadata : (stryCov_9fa48("122430"), options?.partitionMetadata)) && (stryMutAct_9fa48("122432") ? typeof options.partitionMetadata !== 'object' : stryMutAct_9fa48("122431") ? true : (stryCov_9fa48("122431", "122432"), typeof options.partitionMetadata === (stryMutAct_9fa48("122433") ? "" : (stryCov_9fa48("122433"), 'object')))))) ? options.partitionMetadata : stryMutAct_9fa48("122434") ? {} : (stryCov_9fa48("122434"), {
        partition_id: partitionId
      })));
      const nowMs = this.nowFn();
      const overlayPartition = stryMutAct_9fa48("122435") ? {} : (stryCov_9fa48("122435"), {
        ...basePartition,
        partition_id: stryMutAct_9fa48("122438") ? (basePartition?.partition_id || basePartition?.partitionId) && partitionId : stryMutAct_9fa48("122437") ? false : stryMutAct_9fa48("122436") ? true : (stryCov_9fa48("122436", "122437", "122438"), (stryMutAct_9fa48("122440") ? basePartition?.partition_id && basePartition?.partitionId : stryMutAct_9fa48("122439") ? false : (stryCov_9fa48("122439", "122440"), (stryMutAct_9fa48("122441") ? basePartition.partition_id : (stryCov_9fa48("122441"), basePartition?.partition_id)) || (stryMutAct_9fa48("122442") ? basePartition.partitionId : (stryCov_9fa48("122442"), basePartition?.partitionId)))) || partitionId),
        leader_node_id: leaderNodeId,
        created_at: Number.isFinite(stryMutAct_9fa48("122443") ? basePartition?.created_at && basePartition?.createdAt : (stryCov_9fa48("122443"), (stryMutAct_9fa48("122444") ? basePartition.created_at : (stryCov_9fa48("122444"), basePartition?.created_at)) ?? (stryMutAct_9fa48("122445") ? basePartition.createdAt : (stryCov_9fa48("122445"), basePartition?.createdAt)))) ? stryMutAct_9fa48("122446") ? basePartition?.created_at && basePartition?.createdAt : (stryCov_9fa48("122446"), (stryMutAct_9fa48("122447") ? basePartition.created_at : (stryCov_9fa48("122447"), basePartition?.created_at)) ?? (stryMutAct_9fa48("122448") ? basePartition.createdAt : (stryCov_9fa48("122448"), basePartition?.createdAt))) : nowMs,
        updated_at: Number.isFinite(stryMutAct_9fa48("122449") ? basePartition?.updated_at && basePartition?.updatedAt : (stryCov_9fa48("122449"), (stryMutAct_9fa48("122450") ? basePartition.updated_at : (stryCov_9fa48("122450"), basePartition?.updated_at)) ?? (stryMutAct_9fa48("122451") ? basePartition.updatedAt : (stryCov_9fa48("122451"), basePartition?.updatedAt)))) ? stryMutAct_9fa48("122452") ? basePartition?.updated_at && basePartition?.updatedAt : (stryCov_9fa48("122452"), (stryMutAct_9fa48("122453") ? basePartition.updated_at : (stryCov_9fa48("122453"), basePartition?.updated_at)) ?? (stryMutAct_9fa48("122454") ? basePartition.updatedAt : (stryCov_9fa48("122454"), basePartition?.updatedAt))) : nowMs
      });
      this.bootstrapRoutingOverlayEntries.set(partitionId, stryMutAct_9fa48("122455") ? {} : (stryCov_9fa48("122455"), {
        partition: overlayPartition,
        services: routableServices.map(stryMutAct_9fa48("122456") ? () => undefined : (stryCov_9fa48("122456"), service => stryMutAct_9fa48("122457") ? {} : (stryCov_9fa48("122457"), {
          ...service
        }))),
        expiresAtMs: stryMutAct_9fa48("122458") ? nowMs - this.tablePartitionProvisioningTimeoutMs : (stryCov_9fa48("122458"), nowMs + this.tablePartitionProvisioningTimeoutMs)
      }));
      return stryMutAct_9fa48("122459") ? false : (stryCov_9fa48("122459"), true);
    }
  }

  /**
   * Seed short-lived bootstrap routing overlays from system-table snapshots.
   * This bridges restart-time cache gaps until canonical partition metadata
   * converges locally.
   * @param {Object|null} systemTableSnapshots
   * @return {number}
   */
  seedBootstrapRoutingOverlayFromSnapshots(systemTableSnapshots) {
    if (stryMutAct_9fa48("122460")) {
      {}
    } else {
      stryCov_9fa48("122460");
      if (stryMutAct_9fa48("122463") ? !systemTableSnapshots && typeof systemTableSnapshots !== 'object' : stryMutAct_9fa48("122462") ? false : stryMutAct_9fa48("122461") ? true : (stryCov_9fa48("122461", "122462", "122463"), (stryMutAct_9fa48("122464") ? systemTableSnapshots : (stryCov_9fa48("122464"), !systemTableSnapshots)) || (stryMutAct_9fa48("122466") ? typeof systemTableSnapshots === 'object' : stryMutAct_9fa48("122465") ? false : (stryCov_9fa48("122465", "122466"), typeof systemTableSnapshots !== (stryMutAct_9fa48("122467") ? "" : (stryCov_9fa48("122467"), 'object')))))) {
        if (stryMutAct_9fa48("122468")) {
          {}
        } else {
          stryCov_9fa48("122468");
          return 0;
        }
      }
      const partitionRows = Array.isArray(systemTableSnapshots[TABLES.PARTITIONS]) ? systemTableSnapshots[TABLES.PARTITIONS] : stryMutAct_9fa48("122469") ? ["Stryker was here"] : (stryCov_9fa48("122469"), []);
      const serviceRows = Array.isArray(systemTableSnapshots[TABLES.SERVICES]) ? systemTableSnapshots[TABLES.SERVICES] : stryMutAct_9fa48("122470") ? ["Stryker was here"] : (stryCov_9fa48("122470"), []);
      let seededCount = 0;
      for (const partitionRow of partitionRows) {
        if (stryMutAct_9fa48("122471")) {
          {}
        } else {
          stryCov_9fa48("122471");
          const partitionId = String(stryMutAct_9fa48("122474") ? (partitionRow?.partition_id || partitionRow?.partitionId) && '' : stryMutAct_9fa48("122473") ? false : stryMutAct_9fa48("122472") ? true : (stryCov_9fa48("122472", "122473", "122474"), (stryMutAct_9fa48("122476") ? partitionRow?.partition_id && partitionRow?.partitionId : stryMutAct_9fa48("122475") ? false : (stryCov_9fa48("122475", "122476"), (stryMutAct_9fa48("122477") ? partitionRow.partition_id : (stryCov_9fa48("122477"), partitionRow?.partition_id)) || (stryMutAct_9fa48("122478") ? partitionRow.partitionId : (stryCov_9fa48("122478"), partitionRow?.partitionId)))) || (stryMutAct_9fa48("122479") ? "Stryker was here!" : (stryCov_9fa48("122479"), ''))));
          const tableRef = String(stryMutAct_9fa48("122482") ? (partitionRow?.table_name || partitionRow?.tableName || partitionRow?.table_id || partitionRow?.tableId) && '' : stryMutAct_9fa48("122481") ? false : stryMutAct_9fa48("122480") ? true : (stryCov_9fa48("122480", "122481", "122482"), (stryMutAct_9fa48("122484") ? (partitionRow?.table_name || partitionRow?.tableName || partitionRow?.table_id) && partitionRow?.tableId : stryMutAct_9fa48("122483") ? false : (stryCov_9fa48("122483", "122484"), (stryMutAct_9fa48("122486") ? (partitionRow?.table_name || partitionRow?.tableName) && partitionRow?.table_id : stryMutAct_9fa48("122485") ? false : (stryCov_9fa48("122485", "122486"), (stryMutAct_9fa48("122488") ? partitionRow?.table_name && partitionRow?.tableName : stryMutAct_9fa48("122487") ? false : (stryCov_9fa48("122487", "122488"), (stryMutAct_9fa48("122489") ? partitionRow.table_name : (stryCov_9fa48("122489"), partitionRow?.table_name)) || (stryMutAct_9fa48("122490") ? partitionRow.tableName : (stryCov_9fa48("122490"), partitionRow?.tableName)))) || (stryMutAct_9fa48("122491") ? partitionRow.table_id : (stryCov_9fa48("122491"), partitionRow?.table_id)))) || (stryMutAct_9fa48("122492") ? partitionRow.tableId : (stryCov_9fa48("122492"), partitionRow?.tableId)))) || (stryMutAct_9fa48("122493") ? "Stryker was here!" : (stryCov_9fa48("122493"), ''))));
          if (stryMutAct_9fa48("122496") ? (partitionId.length === 0 || tableRef.length === 0) && !this.isSystemTable(tableRef) : stryMutAct_9fa48("122495") ? false : stryMutAct_9fa48("122494") ? true : (stryCov_9fa48("122494", "122495", "122496"), (stryMutAct_9fa48("122498") ? partitionId.length === 0 && tableRef.length === 0 : stryMutAct_9fa48("122497") ? false : (stryCov_9fa48("122497", "122498"), (stryMutAct_9fa48("122500") ? partitionId.length !== 0 : stryMutAct_9fa48("122499") ? false : (stryCov_9fa48("122499", "122500"), partitionId.length === 0)) || (stryMutAct_9fa48("122502") ? tableRef.length !== 0 : stryMutAct_9fa48("122501") ? false : (stryCov_9fa48("122501", "122502"), tableRef.length === 0)))) || (stryMutAct_9fa48("122503") ? this.isSystemTable(tableRef) : (stryCov_9fa48("122503"), !this.isSystemTable(tableRef))))) {
            if (stryMutAct_9fa48("122504")) {
              {}
            } else {
              stryCov_9fa48("122504");
              continue;
            }
          }
          const partitionServiceRows = stryMutAct_9fa48("122505") ? serviceRows : (stryCov_9fa48("122505"), serviceRows.filter(serviceRow => {
            if (stryMutAct_9fa48("122506")) {
              {}
            } else {
              stryCov_9fa48("122506");
              if (stryMutAct_9fa48("122509") ? !serviceRow && typeof serviceRow !== 'object' : stryMutAct_9fa48("122508") ? false : stryMutAct_9fa48("122507") ? true : (stryCov_9fa48("122507", "122508", "122509"), (stryMutAct_9fa48("122510") ? serviceRow : (stryCov_9fa48("122510"), !serviceRow)) || (stryMutAct_9fa48("122512") ? typeof serviceRow === 'object' : stryMutAct_9fa48("122511") ? false : (stryCov_9fa48("122511", "122512"), typeof serviceRow !== (stryMutAct_9fa48("122513") ? "" : (stryCov_9fa48("122513"), 'object')))))) {
                if (stryMutAct_9fa48("122514")) {
                  {}
                } else {
                  stryCov_9fa48("122514");
                  return stryMutAct_9fa48("122515") ? true : (stryCov_9fa48("122515"), false);
                }
              }
              return stryMutAct_9fa48("122518") ? serviceRow.partition_id === partitionId || serviceRow.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("122517") ? false : stryMutAct_9fa48("122516") ? true : (stryCov_9fa48("122516", "122517", "122518"), (stryMutAct_9fa48("122520") ? serviceRow.partition_id !== partitionId : stryMutAct_9fa48("122519") ? true : (stryCov_9fa48("122519", "122520"), serviceRow.partition_id === partitionId)) && (stryMutAct_9fa48("122522") ? serviceRow.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("122521") ? true : (stryCov_9fa48("122521", "122522"), serviceRow.service_type === SERVICE_TYPE.PARTITION)));
            }
          }));
          if (stryMutAct_9fa48("122524") ? false : stryMutAct_9fa48("122523") ? true : (stryCov_9fa48("122523", "122524"), this.maybeInstallBootstrapLeaderOverlay(partitionId, stryMutAct_9fa48("122525") ? {} : (stryCov_9fa48("122525"), {
            partitionMetadata: partitionRow,
            serviceRows: partitionServiceRows
          })))) {
            if (stryMutAct_9fa48("122526")) {
              {}
            } else {
              stryCov_9fa48("122526");
              stryMutAct_9fa48("122527") ? seededCount -= 1 : (stryCov_9fa48("122527"), seededCount += 1);
            }
          }
        }
      }
      return seededCount;
    }
  }

  /**
   * Install a recovery routing overlay entry for a system table
   * partition. This bypasses the strict routability checks in
   * maybeInstallBootstrapLeaderOverlay because during cache
   * recovery after seed restart the cache is empty and no
   * services pass readiness evaluation. The overlay makes the
   * partition discoverable and provides candidate service
   * addresses so the query executor can attempt delivery.
   * @param {string} partitionId
   * @param {string} tableName
   * @param {Array<Object>} serviceRows
   * @return {boolean}
   */
  installRecoveryRoutingOverlayEntry(partitionId, tableName, serviceRows) {
    if (stryMutAct_9fa48("122528")) {
      {}
    } else {
      stryCov_9fa48("122528");
      if (stryMutAct_9fa48("122531") ? !partitionId && !tableName : stryMutAct_9fa48("122530") ? false : stryMutAct_9fa48("122529") ? true : (stryCov_9fa48("122529", "122530", "122531"), (stryMutAct_9fa48("122532") ? partitionId : (stryCov_9fa48("122532"), !partitionId)) || (stryMutAct_9fa48("122533") ? tableName : (stryCov_9fa48("122533"), !tableName)))) {
        if (stryMutAct_9fa48("122534")) {
          {}
        } else {
          stryCov_9fa48("122534");
          return stryMutAct_9fa48("122535") ? true : (stryCov_9fa48("122535"), false);
        }
      }
      if (stryMutAct_9fa48("122538") ? !Array.isArray(serviceRows) && serviceRows.length === 0 : stryMutAct_9fa48("122537") ? false : stryMutAct_9fa48("122536") ? true : (stryCov_9fa48("122536", "122537", "122538"), (stryMutAct_9fa48("122539") ? Array.isArray(serviceRows) : (stryCov_9fa48("122539"), !Array.isArray(serviceRows))) || (stryMutAct_9fa48("122541") ? serviceRows.length !== 0 : stryMutAct_9fa48("122540") ? false : (stryCov_9fa48("122540", "122541"), serviceRows.length === 0)))) {
        if (stryMutAct_9fa48("122542")) {
          {}
        } else {
          stryCov_9fa48("122542");
          return stryMutAct_9fa48("122543") ? true : (stryCov_9fa48("122543"), false);
        }
      }
      const cachedPartition = this.getCachedPartitionRecord(partitionId);
      const cachedLeaderNodeId = stryMutAct_9fa48("122546") ? (cachedPartition?.leader_node_id || cachedPartition?.leaderNodeId) && null : stryMutAct_9fa48("122545") ? false : stryMutAct_9fa48("122544") ? true : (stryCov_9fa48("122544", "122545", "122546"), (stryMutAct_9fa48("122548") ? cachedPartition?.leader_node_id && cachedPartition?.leaderNodeId : stryMutAct_9fa48("122547") ? false : (stryCov_9fa48("122547", "122548"), (stryMutAct_9fa48("122549") ? cachedPartition.leader_node_id : (stryCov_9fa48("122549"), cachedPartition?.leader_node_id)) || (stryMutAct_9fa48("122550") ? cachedPartition.leaderNodeId : (stryCov_9fa48("122550"), cachedPartition?.leaderNodeId)))) || null);
      if (stryMutAct_9fa48("122553") ? typeof cachedLeaderNodeId === 'string' || cachedLeaderNodeId.length > 0 : stryMutAct_9fa48("122552") ? false : stryMutAct_9fa48("122551") ? true : (stryCov_9fa48("122551", "122552", "122553"), (stryMutAct_9fa48("122555") ? typeof cachedLeaderNodeId !== 'string' : stryMutAct_9fa48("122554") ? true : (stryCov_9fa48("122554", "122555"), typeof cachedLeaderNodeId === (stryMutAct_9fa48("122556") ? "" : (stryCov_9fa48("122556"), 'string')))) && (stryMutAct_9fa48("122559") ? cachedLeaderNodeId.length <= 0 : stryMutAct_9fa48("122558") ? cachedLeaderNodeId.length >= 0 : stryMutAct_9fa48("122557") ? true : (stryCov_9fa48("122557", "122558", "122559"), cachedLeaderNodeId.length > 0)))) {
        if (stryMutAct_9fa48("122560")) {
          {}
        } else {
          stryCov_9fa48("122560");
          return stryMutAct_9fa48("122561") ? true : (stryCov_9fa48("122561"), false);
        }
      }
      const nowMs = this.nowFn();
      const overlayPartition = stryMutAct_9fa48("122562") ? {} : (stryCov_9fa48("122562"), {
        partition_id: partitionId,
        table_name: tableName,
        leader_node_id: resolveBootstrapLeaderSelection(stryMutAct_9fa48("122563") ? {} : (stryCov_9fa48("122563"), {
          services: serviceRows
        })).leaderNodeId,
        created_at: nowMs,
        updated_at: nowMs
      });
      this.bootstrapRoutingOverlayEntries.set(partitionId, stryMutAct_9fa48("122564") ? {} : (stryCov_9fa48("122564"), {
        partition: overlayPartition,
        services: serviceRows.map(stryMutAct_9fa48("122565") ? () => undefined : (stryCov_9fa48("122565"), s => stryMutAct_9fa48("122566") ? {} : (stryCov_9fa48("122566"), {
          ...s
        }))),
        expiresAtMs: stryMutAct_9fa48("122567") ? nowMs - this.tablePartitionProvisioningTimeoutMs : (stryCov_9fa48("122567"), nowMs + this.tablePartitionProvisioningTimeoutMs)
      }));
      return stryMutAct_9fa48("122568") ? false : (stryCov_9fa48("122568"), true);
    }
  }

  /**
   * Resolve one bootstrap overlay entry when still valid.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getBootstrapRoutingOverlayEntry(partitionId) {
    if (stryMutAct_9fa48("122569")) {
      {}
    } else {
      stryCov_9fa48("122569");
      const entryState = this.getBootstrapRoutingOverlayEntryState(partitionId);
      return (stryMutAct_9fa48("122572") ? entryState.state !== 'available' : stryMutAct_9fa48("122571") ? false : stryMutAct_9fa48("122570") ? true : (stryCov_9fa48("122570", "122571", "122572"), entryState.state === (stryMutAct_9fa48("122573") ? "" : (stryCov_9fa48("122573"), 'available')))) ? entryState.entry : null;
    }
  }

  /**
   * Resolve one explicit bootstrap overlay entry state.
   * @param {string} partitionId
   * @return {Object}
   * @private
   */
  getBootstrapRoutingOverlayEntryState(partitionId) {
    if (stryMutAct_9fa48("122574")) {
      {}
    } else {
      stryCov_9fa48("122574");
      const entry = this.bootstrapRoutingOverlayEntries.get(partitionId);
      if (stryMutAct_9fa48("122577") ? !entry && typeof entry !== 'object' : stryMutAct_9fa48("122576") ? false : stryMutAct_9fa48("122575") ? true : (stryCov_9fa48("122575", "122576", "122577"), (stryMutAct_9fa48("122578") ? entry : (stryCov_9fa48("122578"), !entry)) || (stryMutAct_9fa48("122580") ? typeof entry === 'object' : stryMutAct_9fa48("122579") ? false : (stryCov_9fa48("122579", "122580"), typeof entry !== (stryMutAct_9fa48("122581") ? "" : (stryCov_9fa48("122581"), 'object')))))) {
        if (stryMutAct_9fa48("122582")) {
          {}
        } else {
          stryCov_9fa48("122582");
          return Object.freeze(stryMutAct_9fa48("122583") ? {} : (stryCov_9fa48("122583"), {
            state: stryMutAct_9fa48("122584") ? "" : (stryCov_9fa48("122584"), 'missing'),
            partitionState: stryMutAct_9fa48("122585") ? "" : (stryCov_9fa48("122585"), 'unavailable'),
            services: Object.freeze(stryMutAct_9fa48("122586") ? ["Stryker was here"] : (stryCov_9fa48("122586"), []))
          }));
        }
      }
      if (stryMutAct_9fa48("122590") ? entry.expiresAtMs > this.nowFn() : stryMutAct_9fa48("122589") ? entry.expiresAtMs < this.nowFn() : stryMutAct_9fa48("122588") ? false : stryMutAct_9fa48("122587") ? true : (stryCov_9fa48("122587", "122588", "122589", "122590"), entry.expiresAtMs <= this.nowFn())) {
        if (stryMutAct_9fa48("122591")) {
          {}
        } else {
          stryCov_9fa48("122591");
          this.bootstrapRoutingOverlayEntries.delete(partitionId);
          return Object.freeze(stryMutAct_9fa48("122592") ? {} : (stryCov_9fa48("122592"), {
            state: stryMutAct_9fa48("122593") ? "" : (stryCov_9fa48("122593"), 'expired'),
            partitionState: stryMutAct_9fa48("122594") ? "" : (stryCov_9fa48("122594"), 'unavailable'),
            services: Object.freeze(stryMutAct_9fa48("122595") ? ["Stryker was here"] : (stryCov_9fa48("122595"), []))
          }));
        }
      }
      const cachedPartition = this.getCachedPartitionRecord(partitionId);
      const cachedLeaderNodeId = stryMutAct_9fa48("122598") ? (cachedPartition?.leader_node_id || cachedPartition?.leaderNodeId) && null : stryMutAct_9fa48("122597") ? false : stryMutAct_9fa48("122596") ? true : (stryCov_9fa48("122596", "122597", "122598"), (stryMutAct_9fa48("122600") ? cachedPartition?.leader_node_id && cachedPartition?.leaderNodeId : stryMutAct_9fa48("122599") ? false : (stryCov_9fa48("122599", "122600"), (stryMutAct_9fa48("122601") ? cachedPartition.leader_node_id : (stryCov_9fa48("122601"), cachedPartition?.leader_node_id)) || (stryMutAct_9fa48("122602") ? cachedPartition.leaderNodeId : (stryCov_9fa48("122602"), cachedPartition?.leaderNodeId)))) || null);
      if (stryMutAct_9fa48("122605") ? typeof cachedLeaderNodeId === 'string' || cachedLeaderNodeId.length > 0 : stryMutAct_9fa48("122604") ? false : stryMutAct_9fa48("122603") ? true : (stryCov_9fa48("122603", "122604", "122605"), (stryMutAct_9fa48("122607") ? typeof cachedLeaderNodeId !== 'string' : stryMutAct_9fa48("122606") ? true : (stryCov_9fa48("122606", "122607"), typeof cachedLeaderNodeId === (stryMutAct_9fa48("122608") ? "" : (stryCov_9fa48("122608"), 'string')))) && (stryMutAct_9fa48("122611") ? cachedLeaderNodeId.length <= 0 : stryMutAct_9fa48("122610") ? cachedLeaderNodeId.length >= 0 : stryMutAct_9fa48("122609") ? true : (stryCov_9fa48("122609", "122610", "122611"), cachedLeaderNodeId.length > 0)))) {
        if (stryMutAct_9fa48("122612")) {
          {}
        } else {
          stryCov_9fa48("122612");
          this.bootstrapRoutingOverlayEntries.delete(partitionId);
          return Object.freeze(stryMutAct_9fa48("122613") ? {} : (stryCov_9fa48("122613"), {
            state: stryMutAct_9fa48("122614") ? "" : (stryCov_9fa48("122614"), 'superseded'),
            partitionState: stryMutAct_9fa48("122615") ? "" : (stryCov_9fa48("122615"), 'unavailable'),
            services: Object.freeze(stryMutAct_9fa48("122616") ? ["Stryker was here"] : (stryCov_9fa48("122616"), []))
          }));
        }
      }
      const services = Object.freeze(Array.isArray(entry.services) ? entry.services : stryMutAct_9fa48("122617") ? ["Stryker was here"] : (stryCov_9fa48("122617"), []));
      if (stryMutAct_9fa48("122620") ? entry.partition || typeof entry.partition === 'object' : stryMutAct_9fa48("122619") ? false : stryMutAct_9fa48("122618") ? true : (stryCov_9fa48("122618", "122619", "122620"), entry.partition && (stryMutAct_9fa48("122622") ? typeof entry.partition !== 'object' : stryMutAct_9fa48("122621") ? true : (stryCov_9fa48("122621", "122622"), typeof entry.partition === (stryMutAct_9fa48("122623") ? "" : (stryCov_9fa48("122623"), 'object')))))) {
        if (stryMutAct_9fa48("122624")) {
          {}
        } else {
          stryCov_9fa48("122624");
          return Object.freeze(stryMutAct_9fa48("122625") ? {} : (stryCov_9fa48("122625"), {
            state: stryMutAct_9fa48("122626") ? "" : (stryCov_9fa48("122626"), 'available'),
            partitionState: stryMutAct_9fa48("122627") ? "" : (stryCov_9fa48("122627"), 'available'),
            partition: entry.partition,
            services,
            entry
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("122628") ? {} : (stryCov_9fa48("122628"), {
        state: stryMutAct_9fa48("122629") ? "" : (stryCov_9fa48("122629"), 'available'),
        partitionState: stryMutAct_9fa48("122630") ? "" : (stryCov_9fa48("122630"), 'unavailable'),
        services,
        entry
      }));
    }
  }

  /**
   * Overlay partition owner row accessor for QueryExecutor.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getBootstrapRoutingOverlayPartition(partitionId) {
    if (stryMutAct_9fa48("122631")) {
      {}
    } else {
      stryCov_9fa48("122631");
      const entryState = this.getBootstrapRoutingOverlayEntryState(partitionId);
      return (stryMutAct_9fa48("122634") ? entryState.partitionState !== 'available' : stryMutAct_9fa48("122633") ? false : stryMutAct_9fa48("122632") ? true : (stryCov_9fa48("122632", "122633", "122634"), entryState.partitionState === (stryMutAct_9fa48("122635") ? "" : (stryCov_9fa48("122635"), 'available')))) ? entryState.partition : null;
    }
  }

  /**
   * Overlay partition services accessor for QueryExecutor.
   * @param {string} partitionId
   * @return {Object[]}
   * @private
   */
  getBootstrapRoutingOverlayServices(partitionId) {
    if (stryMutAct_9fa48("122636")) {
      {}
    } else {
      stryCov_9fa48("122636");
      return this.getBootstrapRoutingOverlayEntryState(partitionId).services;
    }
  }

  /**
   * Resolve fresh bootstrap overlay partitions for one table reference.
   * @param {string|null} tableRef
   * @param {number|null} activePartitionVersion
   * @return {Object[]}
   * @private
   */
  getBootstrapRoutingOverlayPartitionsForTable(tableRef, activePartitionVersion) {
    if (stryMutAct_9fa48("122637")) {
      {}
    } else {
      stryCov_9fa48("122637");
      if (stryMutAct_9fa48("122640") ? typeof tableRef !== 'string' && tableRef.length === 0 : stryMutAct_9fa48("122639") ? false : stryMutAct_9fa48("122638") ? true : (stryCov_9fa48("122638", "122639", "122640"), (stryMutAct_9fa48("122642") ? typeof tableRef === 'string' : stryMutAct_9fa48("122641") ? false : (stryCov_9fa48("122641", "122642"), typeof tableRef !== (stryMutAct_9fa48("122643") ? "" : (stryCov_9fa48("122643"), 'string')))) || (stryMutAct_9fa48("122645") ? tableRef.length !== 0 : stryMutAct_9fa48("122644") ? false : (stryCov_9fa48("122644", "122645"), tableRef.length === 0)))) {
        if (stryMutAct_9fa48("122646")) {
          {}
        } else {
          stryCov_9fa48("122646");
          return stryMutAct_9fa48("122647") ? ["Stryker was here"] : (stryCov_9fa48("122647"), []);
        }
      }
      const partitions = stryMutAct_9fa48("122648") ? ["Stryker was here"] : (stryCov_9fa48("122648"), []);
      for (const partitionId of this.bootstrapRoutingOverlayEntries.keys()) {
        if (stryMutAct_9fa48("122649")) {
          {}
        } else {
          stryCov_9fa48("122649");
          const entryState = this.getBootstrapRoutingOverlayEntryState(partitionId);
          if (stryMutAct_9fa48("122652") ? entryState.partitionState === 'available' : stryMutAct_9fa48("122651") ? false : stryMutAct_9fa48("122650") ? true : (stryCov_9fa48("122650", "122651", "122652"), entryState.partitionState !== (stryMutAct_9fa48("122653") ? "" : (stryCov_9fa48("122653"), 'available')))) {
            if (stryMutAct_9fa48("122654")) {
              {}
            } else {
              stryCov_9fa48("122654");
              continue;
            }
          }
          const partition = entryState.partition;
          if (stryMutAct_9fa48("122657") ? !this.partitionMatchesTableRef(partition, tableRef) && !this.isPartitionVisibleForRouting(partition, activePartitionVersion) : stryMutAct_9fa48("122656") ? false : stryMutAct_9fa48("122655") ? true : (stryCov_9fa48("122655", "122656", "122657"), (stryMutAct_9fa48("122658") ? this.partitionMatchesTableRef(partition, tableRef) : (stryCov_9fa48("122658"), !this.partitionMatchesTableRef(partition, tableRef))) || (stryMutAct_9fa48("122659") ? this.isPartitionVisibleForRouting(partition, activePartitionVersion) : (stryCov_9fa48("122659"), !this.isPartitionVisibleForRouting(partition, activePartitionVersion))))) {
            if (stryMutAct_9fa48("122660")) {
              {}
            } else {
              stryCov_9fa48("122660");
              continue;
            }
          }
          partitions.push(partition);
        }
      }
      return partitions;
    }
  }

  /**
   * Resolve the minimum routable replica cohort required before provisioning
   * can continue.
   * @param {number|undefined|null} requestedMinimumReplicaCount
   * @param {number} targetReplicaCount
   * @return {number}
   * @private
   */
  resolveMinimumProvisioningReplicaCount(requestedMinimumReplicaCount, targetReplicaCount) {
    if (stryMutAct_9fa48("122661")) {
      {}
    } else {
      stryCov_9fa48("122661");
      if (stryMutAct_9fa48("122664") ? !Number.isInteger(requestedMinimumReplicaCount) && requestedMinimumReplicaCount <= 0 : stryMutAct_9fa48("122663") ? false : stryMutAct_9fa48("122662") ? true : (stryCov_9fa48("122662", "122663", "122664"), (stryMutAct_9fa48("122665") ? Number.isInteger(requestedMinimumReplicaCount) : (stryCov_9fa48("122665"), !Number.isInteger(requestedMinimumReplicaCount))) || (stryMutAct_9fa48("122668") ? requestedMinimumReplicaCount > 0 : stryMutAct_9fa48("122667") ? requestedMinimumReplicaCount < 0 : stryMutAct_9fa48("122666") ? false : (stryCov_9fa48("122666", "122667", "122668"), requestedMinimumReplicaCount <= 0)))) {
        if (stryMutAct_9fa48("122669")) {
          {}
        } else {
          stryCov_9fa48("122669");
          return targetReplicaCount;
        }
      }
      return stryMutAct_9fa48("122670") ? Math.min(1, Math.min(requestedMinimumReplicaCount, targetReplicaCount)) : (stryCov_9fa48("122670"), Math.max(1, stryMutAct_9fa48("122671") ? Math.max(requestedMinimumReplicaCount, targetReplicaCount) : (stryCov_9fa48("122671"), Math.min(requestedMinimumReplicaCount, targetReplicaCount))));
    }
  }

  /**
   * Preserve one quorum-sized floor for implicit RF3+ provisioning fallback.
   * Smaller cohorts still degrade to one replica so single-node bootstrap and
   * legacy RF2 owner paths remain backward-compatible.
   * @param {number} requestedReplicaCount
   * @param {number|undefined|null} visibleActiveNodeCount
   * @return {number}
   * @private
   */
  resolveImplicitProvisioningFallbackReplicaCount(requestedReplicaCount, visibleActiveNodeCount) {
    if (stryMutAct_9fa48("122672")) {
      {}
    } else {
      stryCov_9fa48("122672");
      const normalizedReplicaCount = (stryMutAct_9fa48("122675") ? Number.isInteger(requestedReplicaCount) || requestedReplicaCount > 0 : stryMutAct_9fa48("122674") ? false : stryMutAct_9fa48("122673") ? true : (stryCov_9fa48("122673", "122674", "122675"), Number.isInteger(requestedReplicaCount) && (stryMutAct_9fa48("122678") ? requestedReplicaCount <= 0 : stryMutAct_9fa48("122677") ? requestedReplicaCount >= 0 : stryMutAct_9fa48("122676") ? true : (stryCov_9fa48("122676", "122677", "122678"), requestedReplicaCount > 0)))) ? requestedReplicaCount : 1;
      const normalizedVisibleActiveNodeCount = (stryMutAct_9fa48("122681") ? Number.isInteger(visibleActiveNodeCount) || visibleActiveNodeCount > 0 : stryMutAct_9fa48("122680") ? false : stryMutAct_9fa48("122679") ? true : (stryCov_9fa48("122679", "122680", "122681"), Number.isInteger(visibleActiveNodeCount) && (stryMutAct_9fa48("122684") ? visibleActiveNodeCount <= 0 : stryMutAct_9fa48("122683") ? visibleActiveNodeCount >= 0 : stryMutAct_9fa48("122682") ? true : (stryCov_9fa48("122682", "122683", "122684"), visibleActiveNodeCount > 0)))) ? visibleActiveNodeCount : 0;
      if (stryMutAct_9fa48("122687") ? normalizedReplicaCount < 3 && normalizedVisibleActiveNodeCount <= 1 : stryMutAct_9fa48("122686") ? false : stryMutAct_9fa48("122685") ? true : (stryCov_9fa48("122685", "122686", "122687"), (stryMutAct_9fa48("122690") ? normalizedReplicaCount >= 3 : stryMutAct_9fa48("122689") ? normalizedReplicaCount <= 3 : stryMutAct_9fa48("122688") ? false : (stryCov_9fa48("122688", "122689", "122690"), normalizedReplicaCount < 3)) || (stryMutAct_9fa48("122693") ? normalizedVisibleActiveNodeCount > 1 : stryMutAct_9fa48("122692") ? normalizedVisibleActiveNodeCount < 1 : stryMutAct_9fa48("122691") ? false : (stryCov_9fa48("122691", "122692", "122693"), normalizedVisibleActiveNodeCount <= 1)))) {
        if (stryMutAct_9fa48("122694")) {
          {}
        } else {
          stryCov_9fa48("122694");
          return 1;
        }
      }
      return this.calculateQuorumReplicaCount(normalizedReplicaCount);
    }
  }

  /**
   * Wait for the active-node cache to expose enough provisioning targets.
   * @param {Object} options
   * @param {string} options.partitionId
   * @param {number} options.requiredReplicaCount
   * @param {Object} options.timeoutBudget
   * @param {string[]} [options.explicitTargetNodeIds]
   * @param {number} [options.maxWaitMs]
   * @param {boolean} [options.failOnTimeout]
   * @return {Promise<Object>}
   * @private
   */
  async waitForProvisionTargetNodeIds(options = {}) {
    if (stryMutAct_9fa48("122695")) {
      {}
    } else {
      stryCov_9fa48("122695");
      const requiredReplicaCount = (stryMutAct_9fa48("122698") ? Number.isInteger(options.requiredReplicaCount) || options.requiredReplicaCount > 0 : stryMutAct_9fa48("122697") ? false : stryMutAct_9fa48("122696") ? true : (stryCov_9fa48("122696", "122697", "122698"), Number.isInteger(options.requiredReplicaCount) && (stryMutAct_9fa48("122701") ? options.requiredReplicaCount <= 0 : stryMutAct_9fa48("122700") ? options.requiredReplicaCount >= 0 : stryMutAct_9fa48("122699") ? true : (stryCov_9fa48("122699", "122700", "122701"), options.requiredReplicaCount > 0)))) ? options.requiredReplicaCount : 1;
      const partitionId = String(stryMutAct_9fa48("122704") ? options.partitionId && '' : stryMutAct_9fa48("122703") ? false : stryMutAct_9fa48("122702") ? true : (stryCov_9fa48("122702", "122703", "122704"), options.partitionId || (stryMutAct_9fa48("122705") ? "Stryker was here!" : (stryCov_9fa48("122705"), ''))));
      const explicitTargetNodeIds = this.normalizeTargetNodeIds(options.explicitTargetNodeIds);
      let resolution = this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount);
      let resolvedNodeIds = this.resolveProvisionTargetNodeIdsForContext(explicitTargetNodeIds, requiredReplicaCount, resolution.diagnostics);
      let lastDiagnostics = resolution.diagnostics;
      let lastAdmissionProbe = null;
      let timedOut = stryMutAct_9fa48("122706") ? true : (stryCov_9fa48("122706"), false);
      const failOnTimeout = stryMutAct_9fa48("122709") ? options.failOnTimeout === false : stryMutAct_9fa48("122708") ? false : stryMutAct_9fa48("122707") ? true : (stryCov_9fa48("122707", "122708", "122709"), options.failOnTimeout !== (stryMutAct_9fa48("122710") ? true : (stryCov_9fa48("122710"), false)));
      const allowAdaptiveAdmissionConvergenceWait = stryMutAct_9fa48("122713") ? options.allowAdaptiveAdmissionConvergenceWait !== true : stryMutAct_9fa48("122712") ? false : stryMutAct_9fa48("122711") ? true : (stryCov_9fa48("122711", "122712", "122713"), options.allowAdaptiveAdmissionConvergenceWait === (stryMutAct_9fa48("122714") ? false : (stryCov_9fa48("122714"), true)));
      const maxWaitMs = (stryMutAct_9fa48("122717") ? Number.isFinite(options.maxWaitMs) || options.maxWaitMs > 0 : stryMutAct_9fa48("122716") ? false : stryMutAct_9fa48("122715") ? true : (stryCov_9fa48("122715", "122716", "122717"), Number.isFinite(options.maxWaitMs) && (stryMutAct_9fa48("122720") ? options.maxWaitMs <= 0 : stryMutAct_9fa48("122719") ? options.maxWaitMs >= 0 : stryMutAct_9fa48("122718") ? true : (stryCov_9fa48("122718", "122719", "122720"), options.maxWaitMs > 0)))) ? Math.floor(options.maxWaitMs) : this.tablePartitionProvisioningTimeoutMs;
      const effectiveMaxWaitMs = (stryMutAct_9fa48("122723") ? allowAdaptiveAdmissionConvergenceWait && explicitTargetNodeIds.length === 0 && Number.isInteger(lastDiagnostics?.activeNodeRowCount) || lastDiagnostics.activeNodeRowCount >= requiredReplicaCount : stryMutAct_9fa48("122722") ? false : stryMutAct_9fa48("122721") ? true : (stryCov_9fa48("122721", "122722", "122723"), (stryMutAct_9fa48("122725") ? allowAdaptiveAdmissionConvergenceWait && explicitTargetNodeIds.length === 0 || Number.isInteger(lastDiagnostics?.activeNodeRowCount) : stryMutAct_9fa48("122724") ? true : (stryCov_9fa48("122724", "122725"), (stryMutAct_9fa48("122727") ? allowAdaptiveAdmissionConvergenceWait || explicitTargetNodeIds.length === 0 : stryMutAct_9fa48("122726") ? true : (stryCov_9fa48("122726", "122727"), allowAdaptiveAdmissionConvergenceWait && (stryMutAct_9fa48("122729") ? explicitTargetNodeIds.length !== 0 : stryMutAct_9fa48("122728") ? true : (stryCov_9fa48("122728", "122729"), explicitTargetNodeIds.length === 0)))) && Number.isInteger(stryMutAct_9fa48("122730") ? lastDiagnostics.activeNodeRowCount : (stryCov_9fa48("122730"), lastDiagnostics?.activeNodeRowCount)))) && (stryMutAct_9fa48("122733") ? lastDiagnostics.activeNodeRowCount < requiredReplicaCount : stryMutAct_9fa48("122732") ? lastDiagnostics.activeNodeRowCount > requiredReplicaCount : stryMutAct_9fa48("122731") ? true : (stryCov_9fa48("122731", "122732", "122733"), lastDiagnostics.activeNodeRowCount >= requiredReplicaCount)))) ? stryMutAct_9fa48("122734") ? Math.max(this.tablePartitionProvisioningTimeoutMs, Math.max(maxWaitMs, TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS)) : (stryCov_9fa48("122734"), Math.min(this.tablePartitionProvisioningTimeoutMs, stryMutAct_9fa48("122735") ? Math.min(maxWaitMs, TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS) : (stryCov_9fa48("122735"), Math.max(maxWaitMs, TABLE_PARTITION_ADMISSION_CONVERGENCE_WAIT_MS)))) : maxWaitMs;
      const waitTimeoutMs = stryMutAct_9fa48("122736") ? Math.min(this.tablePartitionProvisioningPollIntervalMs, Math.min(effectiveMaxWaitMs, this.tablePartitionProvisioningTimeoutMs)) : (stryCov_9fa48("122736"), Math.max(this.tablePartitionProvisioningPollIntervalMs, stryMutAct_9fa48("122737") ? Math.max(effectiveMaxWaitMs, this.tablePartitionProvisioningTimeoutMs) : (stryCov_9fa48("122737"), Math.min(effectiveMaxWaitMs, this.tablePartitionProvisioningTimeoutMs))));
      const refreshResolution = async () => {
        if (stryMutAct_9fa48("122738")) {
          {}
        } else {
          stryCov_9fa48("122738");
          resolution = this.resolveProvisionTargetNodeIdsWithDiagnostics(requiredReplicaCount);
          lastDiagnostics = resolution.diagnostics;
          resolvedNodeIds = this.resolveProvisionTargetNodeIdsForContext(explicitTargetNodeIds, requiredReplicaCount, lastDiagnostics);
          if (stryMutAct_9fa48("122741") ? !partitionId && !this.supportsProvisioningAdmissionPrecheck() : stryMutAct_9fa48("122740") ? false : stryMutAct_9fa48("122739") ? true : (stryCov_9fa48("122739", "122740", "122741"), (stryMutAct_9fa48("122742") ? partitionId : (stryCov_9fa48("122742"), !partitionId)) || (stryMutAct_9fa48("122743") ? this.supportsProvisioningAdmissionPrecheck() : (stryCov_9fa48("122743"), !this.supportsProvisioningAdmissionPrecheck())))) {
            if (stryMutAct_9fa48("122744")) {
              {}
            } else {
              stryCov_9fa48("122744");
              lastAdmissionProbe = null;
              return stryMutAct_9fa48("122748") ? resolvedNodeIds.length < requiredReplicaCount : stryMutAct_9fa48("122747") ? resolvedNodeIds.length > requiredReplicaCount : stryMutAct_9fa48("122746") ? false : stryMutAct_9fa48("122745") ? true : (stryCov_9fa48("122745", "122746", "122747", "122748"), resolvedNodeIds.length >= requiredReplicaCount);
            }
          }
          lastAdmissionProbe = await this.probeProvisioningTargetAdmission(stryMutAct_9fa48("122749") ? {} : (stryCov_9fa48("122749"), {
            partitionId,
            targetNodeIds: resolvedNodeIds
          }));
          return stryMutAct_9fa48("122753") ? lastAdmissionProbe.maximumProvisionableReplicaCount < requiredReplicaCount : stryMutAct_9fa48("122752") ? lastAdmissionProbe.maximumProvisionableReplicaCount > requiredReplicaCount : stryMutAct_9fa48("122751") ? false : stryMutAct_9fa48("122750") ? true : (stryCov_9fa48("122750", "122751", "122752", "122753"), lastAdmissionProbe.maximumProvisionableReplicaCount >= requiredReplicaCount);
        }
      };
      if (stryMutAct_9fa48("122755") ? false : stryMutAct_9fa48("122754") ? true : (stryCov_9fa48("122754", "122755"), await refreshResolution())) {
        if (stryMutAct_9fa48("122756")) {
          {}
        } else {
          stryCov_9fa48("122756");
          return stryMutAct_9fa48("122757") ? {} : (stryCov_9fa48("122757"), {
            nodeIds: resolvedNodeIds,
            diagnostics: lastDiagnostics,
            admissionProbe: lastAdmissionProbe,
            timedOut,
            requiredReplicaCount,
            waitedMs: 0
          });
        }
      }
      const waitStartedAt = this.nowFn();
      try {
        if (stryMutAct_9fa48("122758")) {
          {}
        } else {
          stryCov_9fa48("122758");
          await this.waitForCondition(refreshResolution, waitTimeoutMs, this.tablePartitionProvisioningPollIntervalMs, stryMutAct_9fa48("122759") ? QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_TIMEOUT_PREFIX - partitionId : (stryCov_9fa48("122759"), QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_TIMEOUT_PREFIX + partitionId), stryMutAct_9fa48("122760") ? {} : (stryCov_9fa48("122760"), {
            timeoutBudget: stryMutAct_9fa48("122763") ? options.timeoutBudget && null : stryMutAct_9fa48("122762") ? false : stryMutAct_9fa48("122761") ? true : (stryCov_9fa48("122761", "122762", "122763"), options.timeoutBudget || null),
            classification: TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
            nestedOperation: TABLE_PARTITION_TARGET_NODE_WAIT
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("122764")) {
          {}
        } else {
          stryCov_9fa48("122764");
          timedOut = stryMutAct_9fa48("122765") ? false : (stryCov_9fa48("122765"), true);
          const timeoutLogPayload = stryMutAct_9fa48("122766") ? {} : (stryCov_9fa48("122766"), {
            partitionId,
            requiredReplicaCount,
            maxWaitMs: waitTimeoutMs,
            requestedMaxWaitMs: maxWaitMs,
            allowAdaptiveAdmissionConvergenceWait,
            waitedMs: stryMutAct_9fa48("122767") ? this.nowFn() + waitStartedAt : (stryCov_9fa48("122767"), this.nowFn() - waitStartedAt),
            diagnostics: lastDiagnostics,
            admissionProbe: lastAdmissionProbe
          });
          if (stryMutAct_9fa48("122769") ? false : stryMutAct_9fa48("122768") ? true : (stryCov_9fa48("122768", "122769"), failOnTimeout)) {
            if (stryMutAct_9fa48("122770")) {
              {}
            } else {
              stryCov_9fa48("122770");
              this.logger.error(QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT, timeoutLogPayload);
              throw error;
            }
          }
          this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT, timeoutLogPayload);
        }
      }
      if (stryMutAct_9fa48("122773") ? lastDiagnostics?.usedDegradedFallback || !timedOut : stryMutAct_9fa48("122772") ? false : stryMutAct_9fa48("122771") ? true : (stryCov_9fa48("122771", "122772", "122773"), (stryMutAct_9fa48("122774") ? lastDiagnostics.usedDegradedFallback : (stryCov_9fa48("122774"), lastDiagnostics?.usedDegradedFallback)) && (stryMutAct_9fa48("122775") ? timedOut : (stryCov_9fa48("122775"), !timedOut)))) {
        if (stryMutAct_9fa48("122776")) {
          {}
        } else {
          stryCov_9fa48("122776");
          this.logger.warn(QUERY_LOG_MSG.TABLE_PARTITION_TARGET_NODE_FALLBACK_USED, stryMutAct_9fa48("122777") ? {} : (stryCov_9fa48("122777"), {
            partitionId,
            requiredReplicaCount,
            diagnostics: lastDiagnostics
          }));
        }
      }
      return stryMutAct_9fa48("122778") ? {} : (stryCov_9fa48("122778"), {
        nodeIds: resolvedNodeIds,
        diagnostics: lastDiagnostics,
        admissionProbe: lastAdmissionProbe,
        timedOut,
        requiredReplicaCount,
        waitedMs: stryMutAct_9fa48("122779") ? this.nowFn() + waitStartedAt : (stryCov_9fa48("122779"), this.nowFn() - waitStartedAt)
      });
    }
  }

  /**
   * Build the explicit bootstrap cohort for initial table partition creation.
   * @param {string} partitionId - Partition ID.
   * @param {Array<Object>} plannedOperations - Planned ADD operations.
   * @return {Object} Replica IDs and peer addresses for the initial cohort.
   * @private
   */
  buildInitialPartitionBootstrapTopology(partitionId, plannedOperations) {
    if (stryMutAct_9fa48("122780")) {
      {}
    } else {
      stryCov_9fa48("122780");
      const addressManager = AddressManager.getInstance();
      const replicaIds = stryMutAct_9fa48("122781") ? ["Stryker was here"] : (stryCov_9fa48("122781"), []);
      const peerAddresses = stryMutAct_9fa48("122782") ? ["Stryker was here"] : (stryCov_9fa48("122782"), []);
      const seenReplicaIds = new Set();
      const currentServices = this.getPartitionServiceRows(partitionId);
      for (const service of currentServices) {
        if (stryMutAct_9fa48("122783")) {
          {}
        } else {
          stryCov_9fa48("122783");
          const serviceReplicaId = stryMutAct_9fa48("122786") ? (service?.service_id || service?.replica_id) && null : stryMutAct_9fa48("122785") ? false : stryMutAct_9fa48("122784") ? true : (stryCov_9fa48("122784", "122785", "122786"), (stryMutAct_9fa48("122788") ? service?.service_id && service?.replica_id : stryMutAct_9fa48("122787") ? false : (stryCov_9fa48("122787", "122788"), (stryMutAct_9fa48("122789") ? service.service_id : (stryCov_9fa48("122789"), service?.service_id)) || (stryMutAct_9fa48("122790") ? service.replica_id : (stryCov_9fa48("122790"), service?.replica_id)))) || null);
          const nodeId = stryMutAct_9fa48("122793") ? (service?.node_id || service?.nodeId) && null : stryMutAct_9fa48("122792") ? false : stryMutAct_9fa48("122791") ? true : (stryCov_9fa48("122791", "122792", "122793"), (stryMutAct_9fa48("122795") ? service?.node_id && service?.nodeId : stryMutAct_9fa48("122794") ? false : (stryCov_9fa48("122794", "122795"), (stryMutAct_9fa48("122796") ? service.node_id : (stryCov_9fa48("122796"), service?.node_id)) || (stryMutAct_9fa48("122797") ? service.nodeId : (stryCov_9fa48("122797"), service?.nodeId)))) || null);
          if (stryMutAct_9fa48("122800") ? typeof serviceReplicaId !== 'string' && serviceReplicaId.length === 0 : stryMutAct_9fa48("122799") ? false : stryMutAct_9fa48("122798") ? true : (stryCov_9fa48("122798", "122799", "122800"), (stryMutAct_9fa48("122802") ? typeof serviceReplicaId === 'string' : stryMutAct_9fa48("122801") ? false : (stryCov_9fa48("122801", "122802"), typeof serviceReplicaId !== (stryMutAct_9fa48("122803") ? "" : (stryCov_9fa48("122803"), 'string')))) || (stryMutAct_9fa48("122805") ? serviceReplicaId.length !== 0 : stryMutAct_9fa48("122804") ? false : (stryCov_9fa48("122804", "122805"), serviceReplicaId.length === 0)))) {
            if (stryMutAct_9fa48("122806")) {
              {}
            } else {
              stryCov_9fa48("122806");
              continue;
            }
          }
          if (stryMutAct_9fa48("122809") ? false : stryMutAct_9fa48("122808") ? true : stryMutAct_9fa48("122807") ? seenReplicaIds.has(serviceReplicaId) : (stryCov_9fa48("122807", "122808", "122809"), !seenReplicaIds.has(serviceReplicaId))) {
            if (stryMutAct_9fa48("122810")) {
              {}
            } else {
              stryCov_9fa48("122810");
              seenReplicaIds.add(serviceReplicaId);
              replicaIds.push(serviceReplicaId);
            }
          }
          if (stryMutAct_9fa48("122813") ? typeof service?.address === 'string' || service.address.length > 0 : stryMutAct_9fa48("122812") ? false : stryMutAct_9fa48("122811") ? true : (stryCov_9fa48("122811", "122812", "122813"), (stryMutAct_9fa48("122815") ? typeof service?.address !== 'string' : stryMutAct_9fa48("122814") ? true : (stryCov_9fa48("122814", "122815"), typeof (stryMutAct_9fa48("122816") ? service.address : (stryCov_9fa48("122816"), service?.address)) === (stryMutAct_9fa48("122817") ? "" : (stryCov_9fa48("122817"), 'string')))) && (stryMutAct_9fa48("122820") ? service.address.length <= 0 : stryMutAct_9fa48("122819") ? service.address.length >= 0 : stryMutAct_9fa48("122818") ? true : (stryCov_9fa48("122818", "122819", "122820"), service.address.length > 0)))) {
            if (stryMutAct_9fa48("122821")) {
              {}
            } else {
              stryCov_9fa48("122821");
              peerAddresses.push(service.address);
              continue;
            }
          }
          if (stryMutAct_9fa48("122824") ? typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("122823") ? false : stryMutAct_9fa48("122822") ? true : (stryCov_9fa48("122822", "122823", "122824"), (stryMutAct_9fa48("122826") ? typeof nodeId !== 'string' : stryMutAct_9fa48("122825") ? true : (stryCov_9fa48("122825", "122826"), typeof nodeId === (stryMutAct_9fa48("122827") ? "" : (stryCov_9fa48("122827"), 'string')))) && (stryMutAct_9fa48("122830") ? nodeId.length <= 0 : stryMutAct_9fa48("122829") ? nodeId.length >= 0 : stryMutAct_9fa48("122828") ? true : (stryCov_9fa48("122828", "122829", "122830"), nodeId.length > 0)))) {
            if (stryMutAct_9fa48("122831")) {
              {}
            } else {
              stryCov_9fa48("122831");
              peerAddresses.push(addressManager.format(nodeId, ENTITY_TYPE.PARTITION, serviceReplicaId));
            }
          }
        }
      }
      for (const operation of plannedOperations) {
        if (stryMutAct_9fa48("122832")) {
          {}
        } else {
          stryCov_9fa48("122832");
          const replicaId = stryMutAct_9fa48("122835") ? operation?.replicaId && null : stryMutAct_9fa48("122834") ? false : stryMutAct_9fa48("122833") ? true : (stryCov_9fa48("122833", "122834", "122835"), (stryMutAct_9fa48("122836") ? operation.replicaId : (stryCov_9fa48("122836"), operation?.replicaId)) || null);
          const nodeId = stryMutAct_9fa48("122839") ? (operation?.targetNodeId || operation?.nodeId) && null : stryMutAct_9fa48("122838") ? false : stryMutAct_9fa48("122837") ? true : (stryCov_9fa48("122837", "122838", "122839"), (stryMutAct_9fa48("122841") ? operation?.targetNodeId && operation?.nodeId : stryMutAct_9fa48("122840") ? false : (stryCov_9fa48("122840", "122841"), (stryMutAct_9fa48("122842") ? operation.targetNodeId : (stryCov_9fa48("122842"), operation?.targetNodeId)) || (stryMutAct_9fa48("122843") ? operation.nodeId : (stryCov_9fa48("122843"), operation?.nodeId)))) || null);
          if (stryMutAct_9fa48("122846") ? typeof replicaId !== 'string' && replicaId.length === 0 : stryMutAct_9fa48("122845") ? false : stryMutAct_9fa48("122844") ? true : (stryCov_9fa48("122844", "122845", "122846"), (stryMutAct_9fa48("122848") ? typeof replicaId === 'string' : stryMutAct_9fa48("122847") ? false : (stryCov_9fa48("122847", "122848"), typeof replicaId !== (stryMutAct_9fa48("122849") ? "" : (stryCov_9fa48("122849"), 'string')))) || (stryMutAct_9fa48("122851") ? replicaId.length !== 0 : stryMutAct_9fa48("122850") ? false : (stryCov_9fa48("122850", "122851"), replicaId.length === 0)))) {
            if (stryMutAct_9fa48("122852")) {
              {}
            } else {
              stryCov_9fa48("122852");
              continue;
            }
          }
          if (stryMutAct_9fa48("122855") ? false : stryMutAct_9fa48("122854") ? true : stryMutAct_9fa48("122853") ? seenReplicaIds.has(replicaId) : (stryCov_9fa48("122853", "122854", "122855"), !seenReplicaIds.has(replicaId))) {
            if (stryMutAct_9fa48("122856")) {
              {}
            } else {
              stryCov_9fa48("122856");
              seenReplicaIds.add(replicaId);
              replicaIds.push(replicaId);
            }
          }
          if (stryMutAct_9fa48("122859") ? typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("122858") ? false : stryMutAct_9fa48("122857") ? true : (stryCov_9fa48("122857", "122858", "122859"), (stryMutAct_9fa48("122861") ? typeof nodeId !== 'string' : stryMutAct_9fa48("122860") ? true : (stryCov_9fa48("122860", "122861"), typeof nodeId === (stryMutAct_9fa48("122862") ? "" : (stryCov_9fa48("122862"), 'string')))) && (stryMutAct_9fa48("122865") ? nodeId.length <= 0 : stryMutAct_9fa48("122864") ? nodeId.length >= 0 : stryMutAct_9fa48("122863") ? true : (stryCov_9fa48("122863", "122864", "122865"), nodeId.length > 0)))) {
            if (stryMutAct_9fa48("122866")) {
              {}
            } else {
              stryCov_9fa48("122866");
              peerAddresses.push(addressManager.format(nodeId, ENTITY_TYPE.PARTITION, replicaId));
            }
          }
        }
      }
      return stryMutAct_9fa48("122867") ? {} : (stryCov_9fa48("122867"), {
        replicaIds,
        peerAddresses: stryMutAct_9fa48("122868") ? [] : (stryCov_9fa48("122868"), [...new Set(peerAddresses)])
      });
    }
  }

  /**
   * Resolve the provisional bootstrap leader node for a freshly-created
   * partition before canonical leader metadata converges.
   * Prefer explicit leader service metadata, then the `-r1` replica, then the
   * first known bootstrap cohort member.
   * @param {string} partitionId
   * @param {Array<Object>} plannedOperations
   * @return {string|null}
   * @private
   */
  resolveInitialPartitionBootstrapLeaderNodeId(partitionId, plannedOperations = stryMutAct_9fa48("122869") ? ["Stryker was here"] : (stryCov_9fa48("122869"), [])) {
    if (stryMutAct_9fa48("122870")) {
      {}
    } else {
      stryCov_9fa48("122870");
      const currentServices = this.getPartitionServiceRows(partitionId);
      const currentLeaderService = currentServices.find(stryMutAct_9fa48("122871") ? () => undefined : (stryCov_9fa48("122871"), service => stryMutAct_9fa48("122874") ? String(service?.raft_role || '').toLowerCase() !== 'leader' : stryMutAct_9fa48("122873") ? false : stryMutAct_9fa48("122872") ? true : (stryCov_9fa48("122872", "122873", "122874"), (stryMutAct_9fa48("122875") ? String(service?.raft_role || '').toUpperCase() : (stryCov_9fa48("122875"), String(stryMutAct_9fa48("122878") ? service?.raft_role && '' : stryMutAct_9fa48("122877") ? false : stryMutAct_9fa48("122876") ? true : (stryCov_9fa48("122876", "122877", "122878"), (stryMutAct_9fa48("122879") ? service.raft_role : (stryCov_9fa48("122879"), service?.raft_role)) || (stryMutAct_9fa48("122880") ? "Stryker was here!" : (stryCov_9fa48("122880"), '')))).toLowerCase())) === (stryMutAct_9fa48("122881") ? "" : (stryCov_9fa48("122881"), 'leader')))));
      const currentLeaderNodeId = stryMutAct_9fa48("122884") ? (currentLeaderService?.node_id || currentLeaderService?.nodeId) && null : stryMutAct_9fa48("122883") ? false : stryMutAct_9fa48("122882") ? true : (stryCov_9fa48("122882", "122883", "122884"), (stryMutAct_9fa48("122886") ? currentLeaderService?.node_id && currentLeaderService?.nodeId : stryMutAct_9fa48("122885") ? false : (stryCov_9fa48("122885", "122886"), (stryMutAct_9fa48("122887") ? currentLeaderService.node_id : (stryCov_9fa48("122887"), currentLeaderService?.node_id)) || (stryMutAct_9fa48("122888") ? currentLeaderService.nodeId : (stryCov_9fa48("122888"), currentLeaderService?.nodeId)))) || null);
      if (stryMutAct_9fa48("122891") ? typeof currentLeaderNodeId === 'string' || currentLeaderNodeId.length > 0 : stryMutAct_9fa48("122890") ? false : stryMutAct_9fa48("122889") ? true : (stryCov_9fa48("122889", "122890", "122891"), (stryMutAct_9fa48("122893") ? typeof currentLeaderNodeId !== 'string' : stryMutAct_9fa48("122892") ? true : (stryCov_9fa48("122892", "122893"), typeof currentLeaderNodeId === (stryMutAct_9fa48("122894") ? "" : (stryCov_9fa48("122894"), 'string')))) && (stryMutAct_9fa48("122897") ? currentLeaderNodeId.length <= 0 : stryMutAct_9fa48("122896") ? currentLeaderNodeId.length >= 0 : stryMutAct_9fa48("122895") ? true : (stryCov_9fa48("122895", "122896", "122897"), currentLeaderNodeId.length > 0)))) {
        if (stryMutAct_9fa48("122898")) {
          {}
        } else {
          stryCov_9fa48("122898");
          return currentLeaderNodeId;
        }
      }
      const currentR1Service = currentServices.find(service => {
        if (stryMutAct_9fa48("122899")) {
          {}
        } else {
          stryCov_9fa48("122899");
          const replicaId = String(stryMutAct_9fa48("122902") ? (service?.service_id || service?.replica_id) && '' : stryMutAct_9fa48("122901") ? false : stryMutAct_9fa48("122900") ? true : (stryCov_9fa48("122900", "122901", "122902"), (stryMutAct_9fa48("122904") ? service?.service_id && service?.replica_id : stryMutAct_9fa48("122903") ? false : (stryCov_9fa48("122903", "122904"), (stryMutAct_9fa48("122905") ? service.service_id : (stryCov_9fa48("122905"), service?.service_id)) || (stryMutAct_9fa48("122906") ? service.replica_id : (stryCov_9fa48("122906"), service?.replica_id)))) || (stryMutAct_9fa48("122907") ? "Stryker was here!" : (stryCov_9fa48("122907"), ''))));
          return (stryMutAct_9fa48("122908") ? /-r1/ : (stryCov_9fa48("122908"), /-r1$/)).test(replicaId);
        }
      });
      const currentR1NodeId = stryMutAct_9fa48("122911") ? (currentR1Service?.node_id || currentR1Service?.nodeId) && null : stryMutAct_9fa48("122910") ? false : stryMutAct_9fa48("122909") ? true : (stryCov_9fa48("122909", "122910", "122911"), (stryMutAct_9fa48("122913") ? currentR1Service?.node_id && currentR1Service?.nodeId : stryMutAct_9fa48("122912") ? false : (stryCov_9fa48("122912", "122913"), (stryMutAct_9fa48("122914") ? currentR1Service.node_id : (stryCov_9fa48("122914"), currentR1Service?.node_id)) || (stryMutAct_9fa48("122915") ? currentR1Service.nodeId : (stryCov_9fa48("122915"), currentR1Service?.nodeId)))) || null);
      if (stryMutAct_9fa48("122918") ? typeof currentR1NodeId === 'string' || currentR1NodeId.length > 0 : stryMutAct_9fa48("122917") ? false : stryMutAct_9fa48("122916") ? true : (stryCov_9fa48("122916", "122917", "122918"), (stryMutAct_9fa48("122920") ? typeof currentR1NodeId !== 'string' : stryMutAct_9fa48("122919") ? true : (stryCov_9fa48("122919", "122920"), typeof currentR1NodeId === (stryMutAct_9fa48("122921") ? "" : (stryCov_9fa48("122921"), 'string')))) && (stryMutAct_9fa48("122924") ? currentR1NodeId.length <= 0 : stryMutAct_9fa48("122923") ? currentR1NodeId.length >= 0 : stryMutAct_9fa48("122922") ? true : (stryCov_9fa48("122922", "122923", "122924"), currentR1NodeId.length > 0)))) {
        if (stryMutAct_9fa48("122925")) {
          {}
        } else {
          stryCov_9fa48("122925");
          return currentR1NodeId;
        }
      }
      const plannedR1Operation = stryMutAct_9fa48("122928") ? plannedOperations.find(operation => {
        const replicaId = String(operation?.replicaId || '');
        return /-r1$/.test(replicaId);
      }) && null : stryMutAct_9fa48("122927") ? false : stryMutAct_9fa48("122926") ? true : (stryCov_9fa48("122926", "122927", "122928"), plannedOperations.find(operation => {
        if (stryMutAct_9fa48("122929")) {
          {}
        } else {
          stryCov_9fa48("122929");
          const replicaId = String(stryMutAct_9fa48("122932") ? operation?.replicaId && '' : stryMutAct_9fa48("122931") ? false : stryMutAct_9fa48("122930") ? true : (stryCov_9fa48("122930", "122931", "122932"), (stryMutAct_9fa48("122933") ? operation.replicaId : (stryCov_9fa48("122933"), operation?.replicaId)) || (stryMutAct_9fa48("122934") ? "Stryker was here!" : (stryCov_9fa48("122934"), ''))));
          return (stryMutAct_9fa48("122935") ? /-r1/ : (stryCov_9fa48("122935"), /-r1$/)).test(replicaId);
        }
      }) || null);
      const plannedR1NodeId = stryMutAct_9fa48("122938") ? (plannedR1Operation?.targetNodeId || plannedR1Operation?.nodeId) && null : stryMutAct_9fa48("122937") ? false : stryMutAct_9fa48("122936") ? true : (stryCov_9fa48("122936", "122937", "122938"), (stryMutAct_9fa48("122940") ? plannedR1Operation?.targetNodeId && plannedR1Operation?.nodeId : stryMutAct_9fa48("122939") ? false : (stryCov_9fa48("122939", "122940"), (stryMutAct_9fa48("122941") ? plannedR1Operation.targetNodeId : (stryCov_9fa48("122941"), plannedR1Operation?.targetNodeId)) || (stryMutAct_9fa48("122942") ? plannedR1Operation.nodeId : (stryCov_9fa48("122942"), plannedR1Operation?.nodeId)))) || null);
      if (stryMutAct_9fa48("122945") ? typeof plannedR1NodeId === 'string' || plannedR1NodeId.length > 0 : stryMutAct_9fa48("122944") ? false : stryMutAct_9fa48("122943") ? true : (stryCov_9fa48("122943", "122944", "122945"), (stryMutAct_9fa48("122947") ? typeof plannedR1NodeId !== 'string' : stryMutAct_9fa48("122946") ? true : (stryCov_9fa48("122946", "122947"), typeof plannedR1NodeId === (stryMutAct_9fa48("122948") ? "" : (stryCov_9fa48("122948"), 'string')))) && (stryMutAct_9fa48("122951") ? plannedR1NodeId.length <= 0 : stryMutAct_9fa48("122950") ? plannedR1NodeId.length >= 0 : stryMutAct_9fa48("122949") ? true : (stryCov_9fa48("122949", "122950", "122951"), plannedR1NodeId.length > 0)))) {
        if (stryMutAct_9fa48("122952")) {
          {}
        } else {
          stryCov_9fa48("122952");
          return plannedR1NodeId;
        }
      }
      const firstCurrentNodeId = stryMutAct_9fa48("122955") ? (currentServices.find(service => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.node_id || currentServices.find(service => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId) && null : stryMutAct_9fa48("122954") ? false : stryMutAct_9fa48("122953") ? true : (stryCov_9fa48("122953", "122954", "122955"), (stryMutAct_9fa48("122957") ? currentServices.find(service => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.node_id && currentServices.find(service => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId : stryMutAct_9fa48("122956") ? false : (stryCov_9fa48("122956", "122957"), (stryMutAct_9fa48("122958") ? currentServices.find(service => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      }).node_id : (stryCov_9fa48("122958"), currentServices.find(service => {
        if (stryMutAct_9fa48("122959")) {
          {}
        } else {
          stryCov_9fa48("122959");
          const nodeId = stryMutAct_9fa48("122962") ? (service?.node_id || service?.nodeId) && null : stryMutAct_9fa48("122961") ? false : stryMutAct_9fa48("122960") ? true : (stryCov_9fa48("122960", "122961", "122962"), (stryMutAct_9fa48("122964") ? service?.node_id && service?.nodeId : stryMutAct_9fa48("122963") ? false : (stryCov_9fa48("122963", "122964"), (stryMutAct_9fa48("122965") ? service.node_id : (stryCov_9fa48("122965"), service?.node_id)) || (stryMutAct_9fa48("122966") ? service.nodeId : (stryCov_9fa48("122966"), service?.nodeId)))) || null);
          return stryMutAct_9fa48("122969") ? typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("122968") ? false : stryMutAct_9fa48("122967") ? true : (stryCov_9fa48("122967", "122968", "122969"), (stryMutAct_9fa48("122971") ? typeof nodeId !== 'string' : stryMutAct_9fa48("122970") ? true : (stryCov_9fa48("122970", "122971"), typeof nodeId === (stryMutAct_9fa48("122972") ? "" : (stryCov_9fa48("122972"), 'string')))) && (stryMutAct_9fa48("122975") ? nodeId.length <= 0 : stryMutAct_9fa48("122974") ? nodeId.length >= 0 : stryMutAct_9fa48("122973") ? true : (stryCov_9fa48("122973", "122974", "122975"), nodeId.length > 0)));
        }
      })?.node_id)) || (stryMutAct_9fa48("122976") ? currentServices.find(service => {
        const nodeId = service?.node_id || service?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      }).nodeId : (stryCov_9fa48("122976"), currentServices.find(service => {
        if (stryMutAct_9fa48("122977")) {
          {}
        } else {
          stryCov_9fa48("122977");
          const nodeId = stryMutAct_9fa48("122980") ? (service?.node_id || service?.nodeId) && null : stryMutAct_9fa48("122979") ? false : stryMutAct_9fa48("122978") ? true : (stryCov_9fa48("122978", "122979", "122980"), (stryMutAct_9fa48("122982") ? service?.node_id && service?.nodeId : stryMutAct_9fa48("122981") ? false : (stryCov_9fa48("122981", "122982"), (stryMutAct_9fa48("122983") ? service.node_id : (stryCov_9fa48("122983"), service?.node_id)) || (stryMutAct_9fa48("122984") ? service.nodeId : (stryCov_9fa48("122984"), service?.nodeId)))) || null);
          return stryMutAct_9fa48("122987") ? typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("122986") ? false : stryMutAct_9fa48("122985") ? true : (stryCov_9fa48("122985", "122986", "122987"), (stryMutAct_9fa48("122989") ? typeof nodeId !== 'string' : stryMutAct_9fa48("122988") ? true : (stryCov_9fa48("122988", "122989"), typeof nodeId === (stryMutAct_9fa48("122990") ? "" : (stryCov_9fa48("122990"), 'string')))) && (stryMutAct_9fa48("122993") ? nodeId.length <= 0 : stryMutAct_9fa48("122992") ? nodeId.length >= 0 : stryMutAct_9fa48("122991") ? true : (stryCov_9fa48("122991", "122992", "122993"), nodeId.length > 0)));
        }
      })?.nodeId)))) || null);
      if (stryMutAct_9fa48("122996") ? typeof firstCurrentNodeId === 'string' || firstCurrentNodeId.length > 0 : stryMutAct_9fa48("122995") ? false : stryMutAct_9fa48("122994") ? true : (stryCov_9fa48("122994", "122995", "122996"), (stryMutAct_9fa48("122998") ? typeof firstCurrentNodeId !== 'string' : stryMutAct_9fa48("122997") ? true : (stryCov_9fa48("122997", "122998"), typeof firstCurrentNodeId === (stryMutAct_9fa48("122999") ? "" : (stryCov_9fa48("122999"), 'string')))) && (stryMutAct_9fa48("123002") ? firstCurrentNodeId.length <= 0 : stryMutAct_9fa48("123001") ? firstCurrentNodeId.length >= 0 : stryMutAct_9fa48("123000") ? true : (stryCov_9fa48("123000", "123001", "123002"), firstCurrentNodeId.length > 0)))) {
        if (stryMutAct_9fa48("123003")) {
          {}
        } else {
          stryCov_9fa48("123003");
          return firstCurrentNodeId;
        }
      }
      const firstPlannedNodeId = stryMutAct_9fa48("123006") ? (plannedOperations.find(operation => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.targetNodeId || plannedOperations.find(operation => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId) && null : stryMutAct_9fa48("123005") ? false : stryMutAct_9fa48("123004") ? true : (stryCov_9fa48("123004", "123005", "123006"), (stryMutAct_9fa48("123008") ? plannedOperations.find(operation => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.targetNodeId && plannedOperations.find(operation => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      })?.nodeId : stryMutAct_9fa48("123007") ? false : (stryCov_9fa48("123007", "123008"), (stryMutAct_9fa48("123009") ? plannedOperations.find(operation => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      }).targetNodeId : (stryCov_9fa48("123009"), plannedOperations.find(operation => {
        if (stryMutAct_9fa48("123010")) {
          {}
        } else {
          stryCov_9fa48("123010");
          const nodeId = stryMutAct_9fa48("123013") ? (operation?.targetNodeId || operation?.nodeId) && null : stryMutAct_9fa48("123012") ? false : stryMutAct_9fa48("123011") ? true : (stryCov_9fa48("123011", "123012", "123013"), (stryMutAct_9fa48("123015") ? operation?.targetNodeId && operation?.nodeId : stryMutAct_9fa48("123014") ? false : (stryCov_9fa48("123014", "123015"), (stryMutAct_9fa48("123016") ? operation.targetNodeId : (stryCov_9fa48("123016"), operation?.targetNodeId)) || (stryMutAct_9fa48("123017") ? operation.nodeId : (stryCov_9fa48("123017"), operation?.nodeId)))) || null);
          return stryMutAct_9fa48("123020") ? typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("123019") ? false : stryMutAct_9fa48("123018") ? true : (stryCov_9fa48("123018", "123019", "123020"), (stryMutAct_9fa48("123022") ? typeof nodeId !== 'string' : stryMutAct_9fa48("123021") ? true : (stryCov_9fa48("123021", "123022"), typeof nodeId === (stryMutAct_9fa48("123023") ? "" : (stryCov_9fa48("123023"), 'string')))) && (stryMutAct_9fa48("123026") ? nodeId.length <= 0 : stryMutAct_9fa48("123025") ? nodeId.length >= 0 : stryMutAct_9fa48("123024") ? true : (stryCov_9fa48("123024", "123025", "123026"), nodeId.length > 0)));
        }
      })?.targetNodeId)) || (stryMutAct_9fa48("123027") ? plannedOperations.find(operation => {
        const nodeId = operation?.targetNodeId || operation?.nodeId || null;
        return typeof nodeId === 'string' && nodeId.length > 0;
      }).nodeId : (stryCov_9fa48("123027"), plannedOperations.find(operation => {
        if (stryMutAct_9fa48("123028")) {
          {}
        } else {
          stryCov_9fa48("123028");
          const nodeId = stryMutAct_9fa48("123031") ? (operation?.targetNodeId || operation?.nodeId) && null : stryMutAct_9fa48("123030") ? false : stryMutAct_9fa48("123029") ? true : (stryCov_9fa48("123029", "123030", "123031"), (stryMutAct_9fa48("123033") ? operation?.targetNodeId && operation?.nodeId : stryMutAct_9fa48("123032") ? false : (stryCov_9fa48("123032", "123033"), (stryMutAct_9fa48("123034") ? operation.targetNodeId : (stryCov_9fa48("123034"), operation?.targetNodeId)) || (stryMutAct_9fa48("123035") ? operation.nodeId : (stryCov_9fa48("123035"), operation?.nodeId)))) || null);
          return stryMutAct_9fa48("123038") ? typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("123037") ? false : stryMutAct_9fa48("123036") ? true : (stryCov_9fa48("123036", "123037", "123038"), (stryMutAct_9fa48("123040") ? typeof nodeId !== 'string' : stryMutAct_9fa48("123039") ? true : (stryCov_9fa48("123039", "123040"), typeof nodeId === (stryMutAct_9fa48("123041") ? "" : (stryCov_9fa48("123041"), 'string')))) && (stryMutAct_9fa48("123044") ? nodeId.length <= 0 : stryMutAct_9fa48("123043") ? nodeId.length >= 0 : stryMutAct_9fa48("123042") ? true : (stryCov_9fa48("123042", "123043", "123044"), nodeId.length > 0)));
        }
      })?.nodeId)))) || null);
      return (stryMutAct_9fa48("123047") ? typeof firstPlannedNodeId === 'string' || firstPlannedNodeId.length > 0 : stryMutAct_9fa48("123046") ? false : stryMutAct_9fa48("123045") ? true : (stryCov_9fa48("123045", "123046", "123047"), (stryMutAct_9fa48("123049") ? typeof firstPlannedNodeId !== 'string' : stryMutAct_9fa48("123048") ? true : (stryCov_9fa48("123048", "123049"), typeof firstPlannedNodeId === (stryMutAct_9fa48("123050") ? "" : (stryCov_9fa48("123050"), 'string')))) && (stryMutAct_9fa48("123053") ? firstPlannedNodeId.length <= 0 : stryMutAct_9fa48("123052") ? firstPlannedNodeId.length >= 0 : stryMutAct_9fa48("123051") ? true : (stryCov_9fa48("123051", "123052", "123053"), firstPlannedNodeId.length > 0)))) ? firstPlannedNodeId : null;
    }
  }

  /**
   * Resolve active node IDs eligible for initial replica provisioning.
   * Prefers local node first to keep early routing local.
   * @param {number} requestedReplicaCount
   * @return {Array<string>} Ordered node IDs.
   * @private
   */
  resolveProvisionTargetNodeIds(requestedReplicaCount) {
    if (stryMutAct_9fa48("123054")) {
      {}
    } else {
      stryCov_9fa48("123054");
      return this.resolveProvisionTargetNodeIdsWithDiagnostics(requestedReplicaCount).nodeIds;
    }
  }

  /**
   * Resolve active node IDs plus eligibility diagnostics.
   * @param {number} requestedReplicaCount
   * @return {{nodeIds: string[], diagnostics: Object}}
   * @private
   */
  resolveProvisionTargetNodeIdsWithDiagnostics(requestedReplicaCount) {
    if (stryMutAct_9fa48("123055")) {
      {}
    } else {
      stryCov_9fa48("123055");
      const desiredReplicaCount = (stryMutAct_9fa48("123058") ? Number.isInteger(requestedReplicaCount) || requestedReplicaCount > 0 : stryMutAct_9fa48("123057") ? false : stryMutAct_9fa48("123056") ? true : (stryCov_9fa48("123056", "123057", "123058"), Number.isInteger(requestedReplicaCount) && (stryMutAct_9fa48("123061") ? requestedReplicaCount <= 0 : stryMutAct_9fa48("123060") ? requestedReplicaCount >= 0 : stryMutAct_9fa48("123059") ? true : (stryCov_9fa48("123059", "123060", "123061"), requestedReplicaCount > 0)))) ? requestedReplicaCount : 1;
      const diagnostics = this.resolveProvisionTargetNodeDiagnostics(desiredReplicaCount);
      let selectedNodeIds = diagnostics.selectedNodeIds;
      if (stryMutAct_9fa48("123064") ? selectedNodeIds.length !== 0 : stryMutAct_9fa48("123063") ? false : stryMutAct_9fa48("123062") ? true : (stryCov_9fa48("123062", "123063", "123064"), selectedNodeIds.length === 0)) {
        if (stryMutAct_9fa48("123065")) {
          {}
        } else {
          stryCov_9fa48("123065");
          selectedNodeIds = stryMutAct_9fa48("123066") ? [] : (stryCov_9fa48("123066"), [this.nodeId]);
        }
      } else if (stryMutAct_9fa48("123069") ? false : stryMutAct_9fa48("123068") ? true : stryMutAct_9fa48("123067") ? selectedNodeIds.includes(this.nodeId) : (stryCov_9fa48("123067", "123068", "123069"), !selectedNodeIds.includes(this.nodeId))) {
        if (stryMutAct_9fa48("123070")) {
          {}
        } else {
          stryCov_9fa48("123070");
          selectedNodeIds = stryMutAct_9fa48("123071") ? [] : (stryCov_9fa48("123071"), [this.nodeId, ...selectedNodeIds]);
        }
      }
      const orderedNodeIds = this.orderProvisionTargetNodeIds(selectedNodeIds);
      const cappedNodeIds = stryMutAct_9fa48("123072") ? orderedNodeIds : (stryCov_9fa48("123072"), orderedNodeIds.slice(0, stryMutAct_9fa48("123073") ? Math.min(1, Math.min(desiredReplicaCount, orderedNodeIds.length)) : (stryCov_9fa48("123073"), Math.max(1, stryMutAct_9fa48("123074") ? Math.max(desiredReplicaCount, orderedNodeIds.length) : (stryCov_9fa48("123074"), Math.min(desiredReplicaCount, orderedNodeIds.length))))));
      return stryMutAct_9fa48("123075") ? {} : (stryCov_9fa48("123075"), {
        nodeIds: cappedNodeIds,
        diagnostics: stryMutAct_9fa48("123076") ? {} : (stryCov_9fa48("123076"), {
          ...diagnostics,
          selectedNodeIds: orderedNodeIds,
          resolvedNodeIds: cappedNodeIds
        })
      });
    }
  }

  /**
   * Order node IDs lexicographically while keeping the local node first.
   * @param {Array<string>} nodeIds
   * @return {Array<string>}
   * @private
   */
  orderProvisionTargetNodeIds(nodeIds) {
    if (stryMutAct_9fa48("123077")) {
      {}
    } else {
      stryCov_9fa48("123077");
      const uniqueNodeIds = stryMutAct_9fa48("123078") ? [] : (stryCov_9fa48("123078"), [...new Set(nodeIds)]);
      stryMutAct_9fa48("123079") ? uniqueNodeIds : (stryCov_9fa48("123079"), uniqueNodeIds.sort(stryMutAct_9fa48("123080") ? () => undefined : (stryCov_9fa48("123080"), (left, right) => left.localeCompare(right))));
      if (stryMutAct_9fa48("123082") ? false : stryMutAct_9fa48("123081") ? true : (stryCov_9fa48("123081", "123082"), uniqueNodeIds.includes(this.nodeId))) {
        if (stryMutAct_9fa48("123083")) {
          {}
        } else {
          stryCov_9fa48("123083");
          uniqueNodeIds.splice(uniqueNodeIds.indexOf(this.nodeId), 1);
          uniqueNodeIds.unshift(this.nodeId);
        }
      }
      return uniqueNodeIds;
    }
  }

  /**
   * Resolve provision-target diagnostics from local cache state.
   * @param {number} requestedReplicaCount
   * @return {Object}
   * @private
   */
  resolveProvisionTargetNodeDiagnostics(requestedReplicaCount) {
    if (stryMutAct_9fa48("123084")) {
      {}
    } else {
      stryCov_9fa48("123084");
      const desiredReplicaCount = (stryMutAct_9fa48("123087") ? Number.isInteger(requestedReplicaCount) || requestedReplicaCount > 0 : stryMutAct_9fa48("123086") ? false : stryMutAct_9fa48("123085") ? true : (stryCov_9fa48("123085", "123086", "123087"), Number.isInteger(requestedReplicaCount) && (stryMutAct_9fa48("123090") ? requestedReplicaCount <= 0 : stryMutAct_9fa48("123089") ? requestedReplicaCount >= 0 : stryMutAct_9fa48("123088") ? true : (stryCov_9fa48("123088", "123089", "123090"), requestedReplicaCount > 0)))) ? requestedReplicaCount : 1;
      if (stryMutAct_9fa48("123093") ? false : stryMutAct_9fa48("123092") ? true : stryMutAct_9fa48("123091") ? this.systemCache : (stryCov_9fa48("123091", "123092", "123093"), !this.systemCache)) {
        if (stryMutAct_9fa48("123094")) {
          {}
        } else {
          stryCov_9fa48("123094");
          return stryMutAct_9fa48("123095") ? {} : (stryCov_9fa48("123095"), {
            requestedReplicaCount: desiredReplicaCount,
            activeNodeRowCount: 0,
            activeServiceRowCount: 0,
            strictNodeIds: stryMutAct_9fa48("123096") ? ["Stryker was here"] : (stryCov_9fa48("123096"), []),
            degradedFallbackNodeIds: stryMutAct_9fa48("123097") ? ["Stryker was here"] : (stryCov_9fa48("123097"), []),
            selectedNodeIds: stryMutAct_9fa48("123098") ? ["Stryker was here"] : (stryCov_9fa48("123098"), []),
            usedDegradedFallback: stryMutAct_9fa48("123099") ? true : (stryCov_9fa48("123099"), false)
          });
        }
      }
      const activeNodeRows = stryMutAct_9fa48("123100") ? ["Stryker was here"] : (stryCov_9fa48("123100"), []);
      const serviceRows = stryMutAct_9fa48("123101") ? ["Stryker was here"] : (stryCov_9fa48("123101"), []);
      if (stryMutAct_9fa48("123104") ? typeof this.systemCache.filter !== 'function' : stryMutAct_9fa48("123103") ? false : stryMutAct_9fa48("123102") ? true : (stryCov_9fa48("123102", "123103", "123104"), typeof this.systemCache.filter === (stryMutAct_9fa48("123105") ? "" : (stryCov_9fa48("123105"), 'function')))) {
        if (stryMutAct_9fa48("123106")) {
          {}
        } else {
          stryCov_9fa48("123106");
          const filteredRows = stryMutAct_9fa48("123107") ? this.systemCache : (stryCov_9fa48("123107"), this.systemCache.filter(TABLES.NODES, nodeRow => {
            if (stryMutAct_9fa48("123108")) {
              {}
            } else {
              stryCov_9fa48("123108");
              const status = stryMutAct_9fa48("123109") ? String(nodeRow?.status || nodeRow?.state || '').toUpperCase() : (stryCov_9fa48("123109"), String(stryMutAct_9fa48("123112") ? (nodeRow?.status || nodeRow?.state) && '' : stryMutAct_9fa48("123111") ? false : stryMutAct_9fa48("123110") ? true : (stryCov_9fa48("123110", "123111", "123112"), (stryMutAct_9fa48("123114") ? nodeRow?.status && nodeRow?.state : stryMutAct_9fa48("123113") ? false : (stryCov_9fa48("123113", "123114"), (stryMutAct_9fa48("123115") ? nodeRow.status : (stryCov_9fa48("123115"), nodeRow?.status)) || (stryMutAct_9fa48("123116") ? nodeRow.state : (stryCov_9fa48("123116"), nodeRow?.state)))) || (stryMutAct_9fa48("123117") ? "Stryker was here!" : (stryCov_9fa48("123117"), '')))).toLowerCase());
              return stryMutAct_9fa48("123120") ? status !== STATUS_ACTIVE : stryMutAct_9fa48("123119") ? false : stryMutAct_9fa48("123118") ? true : (stryCov_9fa48("123118", "123119", "123120"), status === STATUS_ACTIVE);
            }
          }));
          if (stryMutAct_9fa48("123122") ? false : stryMutAct_9fa48("123121") ? true : (stryCov_9fa48("123121", "123122"), Array.isArray(filteredRows))) {
            if (stryMutAct_9fa48("123123")) {
              {}
            } else {
              stryCov_9fa48("123123");
              activeNodeRows.push(...filteredRows);
            }
          }
          const filteredServiceRows = stryMutAct_9fa48("123124") ? this.systemCache : (stryCov_9fa48("123124"), this.systemCache.filter(TABLES.SERVICES, serviceRow => {
            if (stryMutAct_9fa48("123125")) {
              {}
            } else {
              stryCov_9fa48("123125");
              const status = stryMutAct_9fa48("123126") ? String(serviceRow?.status || '').toUpperCase() : (stryCov_9fa48("123126"), String(stryMutAct_9fa48("123129") ? serviceRow?.status && '' : stryMutAct_9fa48("123128") ? false : stryMutAct_9fa48("123127") ? true : (stryCov_9fa48("123127", "123128", "123129"), (stryMutAct_9fa48("123130") ? serviceRow.status : (stryCov_9fa48("123130"), serviceRow?.status)) || (stryMutAct_9fa48("123131") ? "Stryker was here!" : (stryCov_9fa48("123131"), '')))).toLowerCase());
              const nodeId = stryMutAct_9fa48("123134") ? (serviceRow?.node_id || serviceRow?.nodeId) && null : stryMutAct_9fa48("123133") ? false : stryMutAct_9fa48("123132") ? true : (stryCov_9fa48("123132", "123133", "123134"), (stryMutAct_9fa48("123136") ? serviceRow?.node_id && serviceRow?.nodeId : stryMutAct_9fa48("123135") ? false : (stryCov_9fa48("123135", "123136"), (stryMutAct_9fa48("123137") ? serviceRow.node_id : (stryCov_9fa48("123137"), serviceRow?.node_id)) || (stryMutAct_9fa48("123138") ? serviceRow.nodeId : (stryCov_9fa48("123138"), serviceRow?.nodeId)))) || null);
              return stryMutAct_9fa48("123141") ? status === STATUS_ACTIVE && typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("123140") ? false : stryMutAct_9fa48("123139") ? true : (stryCov_9fa48("123139", "123140", "123141"), (stryMutAct_9fa48("123143") ? status === STATUS_ACTIVE || typeof nodeId === 'string' : stryMutAct_9fa48("123142") ? true : (stryCov_9fa48("123142", "123143"), (stryMutAct_9fa48("123145") ? status !== STATUS_ACTIVE : stryMutAct_9fa48("123144") ? true : (stryCov_9fa48("123144", "123145"), status === STATUS_ACTIVE)) && (stryMutAct_9fa48("123147") ? typeof nodeId !== 'string' : stryMutAct_9fa48("123146") ? true : (stryCov_9fa48("123146", "123147"), typeof nodeId === (stryMutAct_9fa48("123148") ? "" : (stryCov_9fa48("123148"), 'string')))))) && (stryMutAct_9fa48("123151") ? nodeId.length <= 0 : stryMutAct_9fa48("123150") ? nodeId.length >= 0 : stryMutAct_9fa48("123149") ? true : (stryCov_9fa48("123149", "123150", "123151"), nodeId.length > 0)));
            }
          }));
          if (stryMutAct_9fa48("123153") ? false : stryMutAct_9fa48("123152") ? true : (stryCov_9fa48("123152", "123153"), Array.isArray(filteredServiceRows))) {
            if (stryMutAct_9fa48("123154")) {
              {}
            } else {
              stryCov_9fa48("123154");
              serviceRows.push(...filteredServiceRows);
            }
          }
        }
      } else if (stryMutAct_9fa48("123157") ? typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("123156") ? false : stryMutAct_9fa48("123155") ? true : (stryCov_9fa48("123155", "123156", "123157"), typeof this.systemCache.getAll === (stryMutAct_9fa48("123158") ? "" : (stryCov_9fa48("123158"), 'function')))) {
        if (stryMutAct_9fa48("123159")) {
          {}
        } else {
          stryCov_9fa48("123159");
          const allRows = this.systemCache.getAll(TABLES.NODES);
          if (stryMutAct_9fa48("123161") ? false : stryMutAct_9fa48("123160") ? true : (stryCov_9fa48("123160", "123161"), Array.isArray(allRows))) {
            if (stryMutAct_9fa48("123162")) {
              {}
            } else {
              stryCov_9fa48("123162");
              for (const nodeRow of allRows) {
                if (stryMutAct_9fa48("123163")) {
                  {}
                } else {
                  stryCov_9fa48("123163");
                  const status = stryMutAct_9fa48("123164") ? String(nodeRow?.status || nodeRow?.state || '').toUpperCase() : (stryCov_9fa48("123164"), String(stryMutAct_9fa48("123167") ? (nodeRow?.status || nodeRow?.state) && '' : stryMutAct_9fa48("123166") ? false : stryMutAct_9fa48("123165") ? true : (stryCov_9fa48("123165", "123166", "123167"), (stryMutAct_9fa48("123169") ? nodeRow?.status && nodeRow?.state : stryMutAct_9fa48("123168") ? false : (stryCov_9fa48("123168", "123169"), (stryMutAct_9fa48("123170") ? nodeRow.status : (stryCov_9fa48("123170"), nodeRow?.status)) || (stryMutAct_9fa48("123171") ? nodeRow.state : (stryCov_9fa48("123171"), nodeRow?.state)))) || (stryMutAct_9fa48("123172") ? "Stryker was here!" : (stryCov_9fa48("123172"), '')))).toLowerCase());
                  if (stryMutAct_9fa48("123175") ? status !== STATUS_ACTIVE : stryMutAct_9fa48("123174") ? false : stryMutAct_9fa48("123173") ? true : (stryCov_9fa48("123173", "123174", "123175"), status === STATUS_ACTIVE)) {
                    if (stryMutAct_9fa48("123176")) {
                      {}
                    } else {
                      stryCov_9fa48("123176");
                      activeNodeRows.push(nodeRow);
                    }
                  }
                }
              }
            }
          }
          const allServiceRows = this.systemCache.getAll(TABLES.SERVICES);
          if (stryMutAct_9fa48("123178") ? false : stryMutAct_9fa48("123177") ? true : (stryCov_9fa48("123177", "123178"), Array.isArray(allServiceRows))) {
            if (stryMutAct_9fa48("123179")) {
              {}
            } else {
              stryCov_9fa48("123179");
              for (const serviceRow of allServiceRows) {
                if (stryMutAct_9fa48("123180")) {
                  {}
                } else {
                  stryCov_9fa48("123180");
                  const status = stryMutAct_9fa48("123181") ? String(serviceRow?.status || '').toUpperCase() : (stryCov_9fa48("123181"), String(stryMutAct_9fa48("123184") ? serviceRow?.status && '' : stryMutAct_9fa48("123183") ? false : stryMutAct_9fa48("123182") ? true : (stryCov_9fa48("123182", "123183", "123184"), (stryMutAct_9fa48("123185") ? serviceRow.status : (stryCov_9fa48("123185"), serviceRow?.status)) || (stryMutAct_9fa48("123186") ? "Stryker was here!" : (stryCov_9fa48("123186"), '')))).toLowerCase());
                  const nodeId = stryMutAct_9fa48("123189") ? (serviceRow?.node_id || serviceRow?.nodeId) && null : stryMutAct_9fa48("123188") ? false : stryMutAct_9fa48("123187") ? true : (stryCov_9fa48("123187", "123188", "123189"), (stryMutAct_9fa48("123191") ? serviceRow?.node_id && serviceRow?.nodeId : stryMutAct_9fa48("123190") ? false : (stryCov_9fa48("123190", "123191"), (stryMutAct_9fa48("123192") ? serviceRow.node_id : (stryCov_9fa48("123192"), serviceRow?.node_id)) || (stryMutAct_9fa48("123193") ? serviceRow.nodeId : (stryCov_9fa48("123193"), serviceRow?.nodeId)))) || null);
                  if (stryMutAct_9fa48("123196") ? status === STATUS_ACTIVE && typeof nodeId === 'string' || nodeId.length > 0 : stryMutAct_9fa48("123195") ? false : stryMutAct_9fa48("123194") ? true : (stryCov_9fa48("123194", "123195", "123196"), (stryMutAct_9fa48("123198") ? status === STATUS_ACTIVE || typeof nodeId === 'string' : stryMutAct_9fa48("123197") ? true : (stryCov_9fa48("123197", "123198"), (stryMutAct_9fa48("123200") ? status !== STATUS_ACTIVE : stryMutAct_9fa48("123199") ? true : (stryCov_9fa48("123199", "123200"), status === STATUS_ACTIVE)) && (stryMutAct_9fa48("123202") ? typeof nodeId !== 'string' : stryMutAct_9fa48("123201") ? true : (stryCov_9fa48("123201", "123202"), typeof nodeId === (stryMutAct_9fa48("123203") ? "" : (stryCov_9fa48("123203"), 'string')))))) && (stryMutAct_9fa48("123206") ? nodeId.length <= 0 : stryMutAct_9fa48("123205") ? nodeId.length >= 0 : stryMutAct_9fa48("123204") ? true : (stryCov_9fa48("123204", "123205", "123206"), nodeId.length > 0)))) {
                    if (stryMutAct_9fa48("123207")) {
                      {}
                    } else {
                      stryCov_9fa48("123207");
                      serviceRows.push(serviceRow);
                    }
                  }
                }
              }
            }
          }
        }
      }
      const activeNodeSeenById = new Set();
      const activeNodeReadinessById = new Map();
      const activeNodeConnectionById = new Map();
      for (const row of activeNodeRows) {
        if (stryMutAct_9fa48("123208")) {
          {}
        } else {
          stryCov_9fa48("123208");
          const nodeId = stryMutAct_9fa48("123211") ? (row?.node_id || row?.nodeId || row?.id) && null : stryMutAct_9fa48("123210") ? false : stryMutAct_9fa48("123209") ? true : (stryCov_9fa48("123209", "123210", "123211"), (stryMutAct_9fa48("123213") ? (row?.node_id || row?.nodeId) && row?.id : stryMutAct_9fa48("123212") ? false : (stryCov_9fa48("123212", "123213"), (stryMutAct_9fa48("123215") ? row?.node_id && row?.nodeId : stryMutAct_9fa48("123214") ? false : (stryCov_9fa48("123214", "123215"), (stryMutAct_9fa48("123216") ? row.node_id : (stryCov_9fa48("123216"), row?.node_id)) || (stryMutAct_9fa48("123217") ? row.nodeId : (stryCov_9fa48("123217"), row?.nodeId)))) || (stryMutAct_9fa48("123218") ? row.id : (stryCov_9fa48("123218"), row?.id)))) || null);
          if (stryMutAct_9fa48("123221") ? typeof nodeId !== 'string' && nodeId.length === 0 : stryMutAct_9fa48("123220") ? false : stryMutAct_9fa48("123219") ? true : (stryCov_9fa48("123219", "123220", "123221"), (stryMutAct_9fa48("123223") ? typeof nodeId === 'string' : stryMutAct_9fa48("123222") ? false : (stryCov_9fa48("123222", "123223"), typeof nodeId !== (stryMutAct_9fa48("123224") ? "" : (stryCov_9fa48("123224"), 'string')))) || (stryMutAct_9fa48("123226") ? nodeId.length !== 0 : stryMutAct_9fa48("123225") ? false : (stryCov_9fa48("123225", "123226"), nodeId.length === 0)))) {
            if (stryMutAct_9fa48("123227")) {
              {}
            } else {
              stryCov_9fa48("123227");
              continue;
            }
          }
          activeNodeSeenById.add(nodeId);
          const leaseExpiry = Number(stryMutAct_9fa48("123228") ? row?.ready_lease_expires_at && row?.readyLeaseExpiresAt : (stryCov_9fa48("123228"), (stryMutAct_9fa48("123229") ? row.ready_lease_expires_at : (stryCov_9fa48("123229"), row?.ready_lease_expires_at)) ?? (stryMutAct_9fa48("123230") ? row.readyLeaseExpiresAt : (stryCov_9fa48("123230"), row?.readyLeaseExpiresAt))));
          const hasReadyLease = Number.isFinite(leaseExpiry);
          const connectionState = stryMutAct_9fa48("123231") ? String(row?.connection_state || row?.connectionState || '').toUpperCase() : (stryCov_9fa48("123231"), String(stryMutAct_9fa48("123234") ? (row?.connection_state || row?.connectionState) && '' : stryMutAct_9fa48("123233") ? false : stryMutAct_9fa48("123232") ? true : (stryCov_9fa48("123232", "123233", "123234"), (stryMutAct_9fa48("123236") ? row?.connection_state && row?.connectionState : stryMutAct_9fa48("123235") ? false : (stryCov_9fa48("123235", "123236"), (stryMutAct_9fa48("123237") ? row.connection_state : (stryCov_9fa48("123237"), row?.connection_state)) || (stryMutAct_9fa48("123238") ? row.connectionState : (stryCov_9fa48("123238"), row?.connectionState)))) || (stryMutAct_9fa48("123239") ? "Stryker was here!" : (stryCov_9fa48("123239"), '')))).toLowerCase());
          const hasConnectionState = stryMutAct_9fa48("123243") ? connectionState.length <= 0 : stryMutAct_9fa48("123242") ? connectionState.length >= 0 : stryMutAct_9fa48("123241") ? false : stryMutAct_9fa48("123240") ? true : (stryCov_9fa48("123240", "123241", "123242", "123243"), connectionState.length > 0);
          const isConnectionReady = stryMutAct_9fa48("123246") ? connectionState === CONNECTION_STATE_CONNECTED && connectionState === CONNECTION_STATE_READY : stryMutAct_9fa48("123245") ? false : stryMutAct_9fa48("123244") ? true : (stryCov_9fa48("123244", "123245", "123246"), (stryMutAct_9fa48("123248") ? connectionState !== CONNECTION_STATE_CONNECTED : stryMutAct_9fa48("123247") ? false : (stryCov_9fa48("123247", "123248"), connectionState === CONNECTION_STATE_CONNECTED)) || (stryMutAct_9fa48("123250") ? connectionState !== CONNECTION_STATE_READY : stryMutAct_9fa48("123249") ? false : (stryCov_9fa48("123249", "123250"), connectionState === CONNECTION_STATE_READY)));
          const connectionEligible = stryMutAct_9fa48("123253") ? !hasConnectionState && isConnectionReady : stryMutAct_9fa48("123252") ? false : stryMutAct_9fa48("123251") ? true : (stryCov_9fa48("123251", "123252", "123253"), (stryMutAct_9fa48("123254") ? hasConnectionState : (stryCov_9fa48("123254"), !hasConnectionState)) || isConnectionReady);
          const isNodeReady = hasReadyLease ? isNodeRecordReady(row, stryMutAct_9fa48("123255") ? {} : (stryCov_9fa48("123255"), {
            requireActiveStatus: stryMutAct_9fa48("123256") ? false : (stryCov_9fa48("123256"), true)
          })) : stryMutAct_9fa48("123257") ? false : (stryCov_9fa48("123257"), true);
          activeNodeReadinessById.set(nodeId, isNodeReady);
          activeNodeConnectionById.set(nodeId, connectionEligible);
        }
      }
      const strictNodeIds = this.orderProvisionTargetNodeIds(stryMutAct_9fa48("123258") ? [...activeNodeReadinessById.entries()].map(([nodeId]) => nodeId) : (stryCov_9fa48("123258"), (stryMutAct_9fa48("123259") ? [] : (stryCov_9fa48("123259"), [...activeNodeReadinessById.entries()])).filter(stryMutAct_9fa48("123260") ? () => undefined : (stryCov_9fa48("123260"), ([nodeId, ready]) => stryMutAct_9fa48("123263") ? ready === true || activeNodeConnectionById.get(nodeId) === true : stryMutAct_9fa48("123262") ? false : stryMutAct_9fa48("123261") ? true : (stryCov_9fa48("123261", "123262", "123263"), (stryMutAct_9fa48("123265") ? ready !== true : stryMutAct_9fa48("123264") ? true : (stryCov_9fa48("123264", "123265"), ready === (stryMutAct_9fa48("123266") ? false : (stryCov_9fa48("123266"), true)))) && (stryMutAct_9fa48("123268") ? activeNodeConnectionById.get(nodeId) !== true : stryMutAct_9fa48("123267") ? true : (stryCov_9fa48("123267", "123268"), activeNodeConnectionById.get(nodeId) === (stryMutAct_9fa48("123269") ? false : (stryCov_9fa48("123269"), true))))))).map(stryMutAct_9fa48("123270") ? () => undefined : (stryCov_9fa48("123270"), ([nodeId]) => nodeId))));
      const strictServiceNodeIds = stryMutAct_9fa48("123271") ? ["Stryker was here"] : (stryCov_9fa48("123271"), []);
      const degradedServiceNodeIds = stryMutAct_9fa48("123272") ? ["Stryker was here"] : (stryCov_9fa48("123272"), []);
      const seenServiceNodeIds = new Set();
      for (const row of serviceRows) {
        if (stryMutAct_9fa48("123273")) {
          {}
        } else {
          stryCov_9fa48("123273");
          const nodeId = stryMutAct_9fa48("123276") ? (row?.node_id || row?.nodeId) && null : stryMutAct_9fa48("123275") ? false : stryMutAct_9fa48("123274") ? true : (stryCov_9fa48("123274", "123275", "123276"), (stryMutAct_9fa48("123278") ? row?.node_id && row?.nodeId : stryMutAct_9fa48("123277") ? false : (stryCov_9fa48("123277", "123278"), (stryMutAct_9fa48("123279") ? row.node_id : (stryCov_9fa48("123279"), row?.node_id)) || (stryMutAct_9fa48("123280") ? row.nodeId : (stryCov_9fa48("123280"), row?.nodeId)))) || null);
          if (stryMutAct_9fa48("123283") ? (typeof nodeId !== 'string' || nodeId.length === 0) && seenServiceNodeIds.has(nodeId) : stryMutAct_9fa48("123282") ? false : stryMutAct_9fa48("123281") ? true : (stryCov_9fa48("123281", "123282", "123283"), (stryMutAct_9fa48("123285") ? typeof nodeId !== 'string' && nodeId.length === 0 : stryMutAct_9fa48("123284") ? false : (stryCov_9fa48("123284", "123285"), (stryMutAct_9fa48("123287") ? typeof nodeId === 'string' : stryMutAct_9fa48("123286") ? false : (stryCov_9fa48("123286", "123287"), typeof nodeId !== (stryMutAct_9fa48("123288") ? "" : (stryCov_9fa48("123288"), 'string')))) || (stryMutAct_9fa48("123290") ? nodeId.length !== 0 : stryMutAct_9fa48("123289") ? false : (stryCov_9fa48("123289", "123290"), nodeId.length === 0)))) || seenServiceNodeIds.has(nodeId))) {
            if (stryMutAct_9fa48("123291")) {
              {}
            } else {
              stryCov_9fa48("123291");
              continue;
            }
          }
          seenServiceNodeIds.add(nodeId);
          if (stryMutAct_9fa48("123294") ? false : stryMutAct_9fa48("123293") ? true : stryMutAct_9fa48("123292") ? activeNodeSeenById.has(nodeId) : (stryCov_9fa48("123292", "123293", "123294"), !activeNodeSeenById.has(nodeId))) {
            if (stryMutAct_9fa48("123295")) {
              {}
            } else {
              stryCov_9fa48("123295");
              strictServiceNodeIds.push(nodeId);
              continue;
            }
          }
          if (stryMutAct_9fa48("123298") ? activeNodeReadinessById.get(nodeId) !== true : stryMutAct_9fa48("123297") ? false : stryMutAct_9fa48("123296") ? true : (stryCov_9fa48("123296", "123297", "123298"), activeNodeReadinessById.get(nodeId) === (stryMutAct_9fa48("123299") ? false : (stryCov_9fa48("123299"), true)))) {
            if (stryMutAct_9fa48("123300")) {
              {}
            } else {
              stryCov_9fa48("123300");
              strictServiceNodeIds.push(nodeId);
              continue;
            }
          }
          if (stryMutAct_9fa48("123303") ? activeNodeConnectionById.get(nodeId) !== true : stryMutAct_9fa48("123302") ? false : stryMutAct_9fa48("123301") ? true : (stryCov_9fa48("123301", "123302", "123303"), activeNodeConnectionById.get(nodeId) === (stryMutAct_9fa48("123304") ? false : (stryCov_9fa48("123304"), true)))) {
            if (stryMutAct_9fa48("123305")) {
              {}
            } else {
              stryCov_9fa48("123305");
              degradedServiceNodeIds.push(nodeId);
            }
          }
        }
      }
      const mergedStrictNodeIds = this.orderProvisionTargetNodeIds(stryMutAct_9fa48("123306") ? [] : (stryCov_9fa48("123306"), [...strictNodeIds, ...strictServiceNodeIds]));
      const strictNodeIdSet = new Set(mergedStrictNodeIds);
      const degradedFallbackNodeIds = this.orderProvisionTargetNodeIds(stryMutAct_9fa48("123307") ? degradedServiceNodeIds : (stryCov_9fa48("123307"), degradedServiceNodeIds.filter(stryMutAct_9fa48("123308") ? () => undefined : (stryCov_9fa48("123308"), nodeId => stryMutAct_9fa48("123309") ? strictNodeIdSet.has(nodeId) : (stryCov_9fa48("123309"), !strictNodeIdSet.has(nodeId))))));
      let selectedNodeIds = mergedStrictNodeIds;
      let usedDegradedFallback = stryMutAct_9fa48("123310") ? true : (stryCov_9fa48("123310"), false);
      if (stryMutAct_9fa48("123313") ? selectedNodeIds.length < desiredReplicaCount || degradedFallbackNodeIds.length > 0 : stryMutAct_9fa48("123312") ? false : stryMutAct_9fa48("123311") ? true : (stryCov_9fa48("123311", "123312", "123313"), (stryMutAct_9fa48("123316") ? selectedNodeIds.length >= desiredReplicaCount : stryMutAct_9fa48("123315") ? selectedNodeIds.length <= desiredReplicaCount : stryMutAct_9fa48("123314") ? true : (stryCov_9fa48("123314", "123315", "123316"), selectedNodeIds.length < desiredReplicaCount)) && (stryMutAct_9fa48("123319") ? degradedFallbackNodeIds.length <= 0 : stryMutAct_9fa48("123318") ? degradedFallbackNodeIds.length >= 0 : stryMutAct_9fa48("123317") ? true : (stryCov_9fa48("123317", "123318", "123319"), degradedFallbackNodeIds.length > 0)))) {
        if (stryMutAct_9fa48("123320")) {
          {}
        } else {
          stryCov_9fa48("123320");
          selectedNodeIds = this.orderProvisionTargetNodeIds(stryMutAct_9fa48("123321") ? [] : (stryCov_9fa48("123321"), [...selectedNodeIds, ...degradedFallbackNodeIds]));
          usedDegradedFallback = stryMutAct_9fa48("123322") ? false : (stryCov_9fa48("123322"), true);
        }
      }
      return stryMutAct_9fa48("123323") ? {} : (stryCov_9fa48("123323"), {
        requestedReplicaCount: desiredReplicaCount,
        activeNodeRowCount: activeNodeRows.length,
        activeServiceRowCount: serviceRows.length,
        strictNodeIds: mergedStrictNodeIds,
        degradedFallbackNodeIds,
        selectedNodeIds,
        usedDegradedFallback
      });
    }
  }

  /**
   * Resolve target nodes for one provisioning context.
   * Explicit targets override readiness-discovered nodes.
   * @param {string[]|undefined|null} explicitTargetNodeIds
   * @param {number} requestedReplicaCount
   * @param {Object|null} [provisionTargetDiagnostics]
   * @return {Array<string>}
   * @private
   */
  resolveProvisionTargetNodeIdsForContext(explicitTargetNodeIds, requestedReplicaCount, provisionTargetDiagnostics = null) {
    if (stryMutAct_9fa48("123324")) {
      {}
    } else {
      stryCov_9fa48("123324");
      const explicitTargets = this.normalizeTargetNodeIds(explicitTargetNodeIds);
      if (stryMutAct_9fa48("123327") ? explicitTargets.length !== 0 : stryMutAct_9fa48("123326") ? false : stryMutAct_9fa48("123325") ? true : (stryCov_9fa48("123325", "123326", "123327"), explicitTargets.length === 0)) {
        if (stryMutAct_9fa48("123328")) {
          {}
        } else {
          stryCov_9fa48("123328");
          const diagnostics = (stryMutAct_9fa48("123331") ? provisionTargetDiagnostics || typeof provisionTargetDiagnostics === 'object' : stryMutAct_9fa48("123330") ? false : stryMutAct_9fa48("123329") ? true : (stryCov_9fa48("123329", "123330", "123331"), provisionTargetDiagnostics && (stryMutAct_9fa48("123333") ? typeof provisionTargetDiagnostics !== 'object' : stryMutAct_9fa48("123332") ? true : (stryCov_9fa48("123332", "123333"), typeof provisionTargetDiagnostics === (stryMutAct_9fa48("123334") ? "" : (stryCov_9fa48("123334"), 'object')))))) ? provisionTargetDiagnostics : this.resolveProvisionTargetNodeIdsWithDiagnostics(requestedReplicaCount).diagnostics;
          const selectedNodeIds = Array.isArray(stryMutAct_9fa48("123335") ? diagnostics.selectedNodeIds : (stryCov_9fa48("123335"), diagnostics?.selectedNodeIds)) ? diagnostics.selectedNodeIds : stryMutAct_9fa48("123336") ? ["Stryker was here"] : (stryCov_9fa48("123336"), []);
          if (stryMutAct_9fa48("123340") ? selectedNodeIds.length <= 0 : stryMutAct_9fa48("123339") ? selectedNodeIds.length >= 0 : stryMutAct_9fa48("123338") ? false : stryMutAct_9fa48("123337") ? true : (stryCov_9fa48("123337", "123338", "123339", "123340"), selectedNodeIds.length > 0)) {
            if (stryMutAct_9fa48("123341")) {
              {}
            } else {
              stryCov_9fa48("123341");
              return selectedNodeIds;
            }
          }
          return this.resolveProvisionTargetNodeIds(requestedReplicaCount);
        }
      }
      return explicitTargets;
    }
  }

  /**
   * Normalize one node-id list to unique non-empty string IDs.
   * @param {Array<string>|undefined|null} targetNodeIds
   * @return {Array<string>}
   * @private
   */
  normalizeTargetNodeIds(targetNodeIds) {
    if (stryMutAct_9fa48("123342")) {
      {}
    } else {
      stryCov_9fa48("123342");
      if (stryMutAct_9fa48("123345") ? false : stryMutAct_9fa48("123344") ? true : stryMutAct_9fa48("123343") ? Array.isArray(targetNodeIds) : (stryCov_9fa48("123343", "123344", "123345"), !Array.isArray(targetNodeIds))) {
        if (stryMutAct_9fa48("123346")) {
          {}
        } else {
          stryCov_9fa48("123346");
          return stryMutAct_9fa48("123347") ? ["Stryker was here"] : (stryCov_9fa48("123347"), []);
        }
      }
      const normalizedNodeIds = stryMutAct_9fa48("123348") ? ["Stryker was here"] : (stryCov_9fa48("123348"), []);
      const seenNodeIds = new Set();
      for (const nodeId of targetNodeIds) {
        if (stryMutAct_9fa48("123349")) {
          {}
        } else {
          stryCov_9fa48("123349");
          const normalizedNodeId = String(stryMutAct_9fa48("123352") ? nodeId && '' : stryMutAct_9fa48("123351") ? false : stryMutAct_9fa48("123350") ? true : (stryCov_9fa48("123350", "123351", "123352"), nodeId || (stryMutAct_9fa48("123353") ? "Stryker was here!" : (stryCov_9fa48("123353"), ''))));
          if (stryMutAct_9fa48("123356") ? normalizedNodeId.length === 0 && seenNodeIds.has(normalizedNodeId) : stryMutAct_9fa48("123355") ? false : stryMutAct_9fa48("123354") ? true : (stryCov_9fa48("123354", "123355", "123356"), (stryMutAct_9fa48("123358") ? normalizedNodeId.length !== 0 : stryMutAct_9fa48("123357") ? false : (stryCov_9fa48("123357", "123358"), normalizedNodeId.length === 0)) || seenNodeIds.has(normalizedNodeId))) {
            if (stryMutAct_9fa48("123359")) {
              {}
            } else {
              stryCov_9fa48("123359");
              continue;
            }
          }
          seenNodeIds.add(normalizedNodeId);
          normalizedNodeIds.push(normalizedNodeId);
        }
      }
      return normalizedNodeIds;
    }
  }

  /**
   * Capture the canonical topology snapshot for one managed split attempt.
   * The workflow reuses this persisted context for admission and child
   * provisioning instead of re-resolving targets mid-attempt.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  captureManagedSplitTopologySnapshot(options = {}) {
    if (stryMutAct_9fa48("123360")) {
      {}
    } else {
      stryCov_9fa48("123360");
      const requiredReplicaCount = (stryMutAct_9fa48("123363") ? Number.isInteger(options.requiredReplicaCount) || options.requiredReplicaCount > 0 : stryMutAct_9fa48("123362") ? false : stryMutAct_9fa48("123361") ? true : (stryCov_9fa48("123361", "123362", "123363"), Number.isInteger(options.requiredReplicaCount) && (stryMutAct_9fa48("123366") ? options.requiredReplicaCount <= 0 : stryMutAct_9fa48("123365") ? options.requiredReplicaCount >= 0 : stryMutAct_9fa48("123364") ? true : (stryCov_9fa48("123364", "123365", "123366"), options.requiredReplicaCount > 0)))) ? options.requiredReplicaCount : 1;
      const provisionTargetDiagnostics = this.resolveProvisionTargetNodeDiagnostics(requiredReplicaCount);
      return stryMutAct_9fa48("123367") ? {} : (stryCov_9fa48("123367"), {
        ...(stryMutAct_9fa48("123370") ? options.baseSnapshot && {} : stryMutAct_9fa48("123369") ? false : stryMutAct_9fa48("123368") ? true : (stryCov_9fa48("123368", "123369", "123370"), options.baseSnapshot || {})),
        capturedAt: new Date(this.nowFn()).toISOString(),
        sourceLeaderNodeId: stryMutAct_9fa48("123373") ? (options.partitionInfo?.leader_node_id || options.partitionInfo?.leaderNodeId) && null : stryMutAct_9fa48("123372") ? false : stryMutAct_9fa48("123371") ? true : (stryCov_9fa48("123371", "123372", "123373"), (stryMutAct_9fa48("123375") ? options.partitionInfo?.leader_node_id && options.partitionInfo?.leaderNodeId : stryMutAct_9fa48("123374") ? false : (stryCov_9fa48("123374", "123375"), (stryMutAct_9fa48("123376") ? options.partitionInfo.leader_node_id : (stryCov_9fa48("123376"), options.partitionInfo?.leader_node_id)) || (stryMutAct_9fa48("123377") ? options.partitionInfo.leaderNodeId : (stryCov_9fa48("123377"), options.partitionInfo?.leaderNodeId)))) || null),
        activePartitionVersion: stryMutAct_9fa48("123380") ? (options.tableInfo?.active_partition_version || options.tableInfo?.activePartitionVersion) && null : stryMutAct_9fa48("123379") ? false : stryMutAct_9fa48("123378") ? true : (stryCov_9fa48("123378", "123379", "123380"), (stryMutAct_9fa48("123382") ? options.tableInfo?.active_partition_version && options.tableInfo?.activePartitionVersion : stryMutAct_9fa48("123381") ? false : (stryCov_9fa48("123381", "123382"), (stryMutAct_9fa48("123383") ? options.tableInfo.active_partition_version : (stryCov_9fa48("123383"), options.tableInfo?.active_partition_version)) || (stryMutAct_9fa48("123384") ? options.tableInfo.activePartitionVersion : (stryCov_9fa48("123384"), options.tableInfo?.activePartitionVersion)))) || null),
        targetPartitionVersion: options.targetVersion,
        requiredReplicaCount,
        sourceRoutableNodeIds: this.normalizeTargetNodeIds(options.sourceRoutableNodeIds),
        discoveredTargetNodeIds: this.normalizeTargetNodeIds(options.discoveredTargetNodeIds),
        candidateTargetNodeIds: this.normalizeTargetNodeIds(options.candidateTargetNodeIds),
        provisionTargetDiagnostics
      });
    }
  }

  /**
   * Estimate bytes for split admission using the canonical storage
   * accounting model when it is available.
   * @param {Object} partitionInfo
   * @return {number}
   * @private
   */
  estimateSplitAdmissionBytes(partitionInfo) {
    if (stryMutAct_9fa48("123385")) {
      {}
    } else {
      stryCov_9fa48("123385");
      const sizeBytes = Number(stryMutAct_9fa48("123386") ? partitionInfo?.size_bytes && partitionInfo?.sizeBytes : (stryCov_9fa48("123386"), (stryMutAct_9fa48("123387") ? partitionInfo.size_bytes : (stryCov_9fa48("123387"), partitionInfo?.size_bytes)) ?? (stryMutAct_9fa48("123388") ? partitionInfo.sizeBytes : (stryCov_9fa48("123388"), partitionInfo?.sizeBytes))));
      const normalizedSizeBytes = (stryMutAct_9fa48("123391") ? Number.isFinite(sizeBytes) || sizeBytes > 0 : stryMutAct_9fa48("123390") ? false : stryMutAct_9fa48("123389") ? true : (stryCov_9fa48("123389", "123390", "123391"), Number.isFinite(sizeBytes) && (stryMutAct_9fa48("123394") ? sizeBytes <= 0 : stryMutAct_9fa48("123393") ? sizeBytes >= 0 : stryMutAct_9fa48("123392") ? true : (stryCov_9fa48("123392", "123393", "123394"), sizeBytes > 0)))) ? sizeBytes : 0;
      const accountingService = stryMutAct_9fa48("123397") ? this.rebalanceCoordinator?.storageAccountingService && null : stryMutAct_9fa48("123396") ? false : stryMutAct_9fa48("123395") ? true : (stryCov_9fa48("123395", "123396", "123397"), (stryMutAct_9fa48("123398") ? this.rebalanceCoordinator.storageAccountingService : (stryCov_9fa48("123398"), this.rebalanceCoordinator?.storageAccountingService)) || null);
      if (stryMutAct_9fa48("123401") ? accountingService || typeof accountingService.estimateReplicaBytes === 'function' : stryMutAct_9fa48("123400") ? false : stryMutAct_9fa48("123399") ? true : (stryCov_9fa48("123399", "123400", "123401"), accountingService && (stryMutAct_9fa48("123403") ? typeof accountingService.estimateReplicaBytes !== 'function' : stryMutAct_9fa48("123402") ? true : (stryCov_9fa48("123402", "123403"), typeof accountingService.estimateReplicaBytes === (stryMutAct_9fa48("123404") ? "" : (stryCov_9fa48("123404"), 'function')))))) {
        if (stryMutAct_9fa48("123405")) {
          {}
        } else {
          stryCov_9fa48("123405");
          const splitAmplificationFactor = stryMutAct_9fa48("123408") ? ConfigurationManager.getInstance().get(STORAGE_CAPACITY_CONFIG_KEY.SPLIT_AMPLIFICATION_FACTOR) && STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR : stryMutAct_9fa48("123407") ? false : stryMutAct_9fa48("123406") ? true : (stryCov_9fa48("123406", "123407", "123408"), ConfigurationManager.getInstance().get(STORAGE_CAPACITY_CONFIG_KEY.SPLIT_AMPLIFICATION_FACTOR) || STORAGE_CAPACITY_DEFAULT.SPLIT_AMPLIFICATION_FACTOR);
          return accountingService.estimateReplicaBytes(stryMutAct_9fa48("123409") ? {} : (stryCov_9fa48("123409"), {
            entityType: SERVICE_TYPE.PARTITION,
            sizeBytes: normalizedSizeBytes,
            amplificationFactor: splitAmplificationFactor
          }));
        }
      }
      return stryMutAct_9fa48("123410") ? Math.min(1, Math.ceil(normalizedSizeBytes)) : (stryCov_9fa48("123410"), Math.max(1, Math.ceil(normalizedSizeBytes)));
    }
  }

  /**
   * Calculate the minimum majority-sized cohort required for a routable Raft
   * partition during split bootstrap.
   * @param {number} replicaCount
   * @return {number}
   * @private
   */
  calculateQuorumReplicaCount(replicaCount) {
    if (stryMutAct_9fa48("123411")) {
      {}
    } else {
      stryCov_9fa48("123411");
      const normalizedReplicaCount = (stryMutAct_9fa48("123414") ? Number.isInteger(replicaCount) || replicaCount > 0 : stryMutAct_9fa48("123413") ? false : stryMutAct_9fa48("123412") ? true : (stryCov_9fa48("123412", "123413", "123414"), Number.isInteger(replicaCount) && (stryMutAct_9fa48("123417") ? replicaCount <= 0 : stryMutAct_9fa48("123416") ? replicaCount >= 0 : stryMutAct_9fa48("123415") ? true : (stryCov_9fa48("123415", "123416", "123417"), replicaCount > 0)))) ? replicaCount : 1;
      return stryMutAct_9fa48("123418") ? Math.floor(normalizedReplicaCount / 2) - 1 : (stryCov_9fa48("123418"), Math.floor(stryMutAct_9fa48("123419") ? normalizedReplicaCount * 2 : (stryCov_9fa48("123419"), normalizedReplicaCount / 2)) + 1);
    }
  }

  /**
   * Get active node IDs from local system cache.
   * Prefers strict readiness and uses degraded service-backed fallback only
   * when strict candidates are insufficient for the requested cohort size.
   * @param {number} requestedReplicaCount
   * @return {Array<string>}
   * @private
   */
  getActiveNodeIdsFromCache(requestedReplicaCount) {
    if (stryMutAct_9fa48("123420")) {
      {}
    } else {
      stryCov_9fa48("123420");
      return this.resolveProvisionTargetNodeDiagnostics(requestedReplicaCount).selectedNodeIds;
    }
  }

  /**
   * Create one control-plane timeout budget.
   * @param {number} configuredBudgetMs
   * @return {Object}
   * @private
   */
  createControlPlaneTimeoutBudget(configuredBudgetMs) {
    if (stryMutAct_9fa48("123421")) {
      {}
    } else {
      stryCov_9fa48("123421");
      return this.controlPlaneTimeoutPolicy.createTopLevelBudget(stryMutAct_9fa48("123422") ? {} : (stryCov_9fa48("123422"), {
        configuredBudgetMs
      }));
    }
  }

  /**
   * Allocate one nested timeout budget from the remaining deadline.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  allocateControlPlaneTimeoutBudget(options = {}) {
    if (stryMutAct_9fa48("123423")) {
      {}
    } else {
      stryCov_9fa48("123423");
      return this.controlPlaneTimeoutPolicy.allocateOrThrow(stryMutAct_9fa48("123424") ? {} : (stryCov_9fa48("123424"), {
        timeoutBudget: stryMutAct_9fa48("123427") ? options.timeoutBudget && null : stryMutAct_9fa48("123426") ? false : stryMutAct_9fa48("123425") ? true : (stryCov_9fa48("123425", "123426", "123427"), options.timeoutBudget || null),
        requestedBudgetMs: options.requestedBudgetMs,
        minimumBudgetMs: stryMutAct_9fa48("123430") ? options.minimumBudgetMs && TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS : stryMutAct_9fa48("123429") ? false : stryMutAct_9fa48("123428") ? true : (stryCov_9fa48("123428", "123429", "123430"), options.minimumBudgetMs || TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS),
        classification: options.classification,
        nestedOperation: options.nestedOperation,
        timeoutError: options.timeoutError
      }));
    }
  }

  /**
   * Wait for a condition with bounded timeout.
   * @param {Function} predicate - Condition callback.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @param {number} intervalMs - Poll interval in milliseconds.
   * @param {string} timeoutError - Timeout error message.
   * @return {Promise<void>}
   * @private
   */
  async waitForCondition(predicate, timeoutMs, intervalMs, timeoutError, timeoutOptions = {}) {
    if (stryMutAct_9fa48("123431")) {
      {}
    } else {
      stryCov_9fa48("123431");
      if (stryMutAct_9fa48("123433") ? false : stryMutAct_9fa48("123432") ? true : (stryCov_9fa48("123432", "123433"), await predicate())) {
        if (stryMutAct_9fa48("123434")) {
          {}
        } else {
          stryCov_9fa48("123434");
          return;
        }
      }
      const effectiveBudget = (stryMutAct_9fa48("123435") ? timeoutOptions.timeoutBudget : (stryCov_9fa48("123435"), timeoutOptions?.timeoutBudget)) ? this.allocateControlPlaneTimeoutBudget(stryMutAct_9fa48("123436") ? {} : (stryCov_9fa48("123436"), {
        timeoutBudget: timeoutOptions.timeoutBudget,
        requestedBudgetMs: timeoutMs,
        minimumBudgetMs: stryMutAct_9fa48("123439") ? timeoutOptions.minimumBudgetMs && TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS : stryMutAct_9fa48("123438") ? false : stryMutAct_9fa48("123437") ? true : (stryCov_9fa48("123437", "123438", "123439"), timeoutOptions.minimumBudgetMs || TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS),
        classification: stryMutAct_9fa48("123442") ? timeoutOptions.classification && TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED : stryMutAct_9fa48("123441") ? false : stryMutAct_9fa48("123440") ? true : (stryCov_9fa48("123440", "123441", "123442"), timeoutOptions.classification || TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED),
        nestedOperation: stryMutAct_9fa48("123445") ? timeoutOptions.nestedOperation && 'wait_for_condition' : stryMutAct_9fa48("123444") ? false : stryMutAct_9fa48("123443") ? true : (stryCov_9fa48("123443", "123444", "123445"), timeoutOptions.nestedOperation || (stryMutAct_9fa48("123446") ? "" : (stryCov_9fa48("123446"), 'wait_for_condition'))),
        timeoutError
      })) : this.createControlPlaneTimeoutBudget(timeoutMs);
      while (stryMutAct_9fa48("123448") ? false : stryMutAct_9fa48("123447") ? false : (stryCov_9fa48("123447", "123448"), true)) {
        if (stryMutAct_9fa48("123449")) {
          {}
        } else {
          stryCov_9fa48("123449");
          if (stryMutAct_9fa48("123451") ? false : stryMutAct_9fa48("123450") ? true : (stryCov_9fa48("123450", "123451"), await predicate())) {
            if (stryMutAct_9fa48("123452")) {
              {}
            } else {
              stryCov_9fa48("123452");
              return;
            }
          }
          const remainingMs = getRemainingBudgetMs(effectiveBudget, stryMutAct_9fa48("123453") ? {} : (stryCov_9fa48("123453"), {
            now: this.nowFn
          }));
          if (stryMutAct_9fa48("123457") ? remainingMs > 0 : stryMutAct_9fa48("123456") ? remainingMs < 0 : stryMutAct_9fa48("123455") ? false : stryMutAct_9fa48("123454") ? true : (stryCov_9fa48("123454", "123455", "123456", "123457"), remainingMs <= 0)) {
            if (stryMutAct_9fa48("123458")) {
              {}
            } else {
              stryCov_9fa48("123458");
              break;
            }
          }
          await this.sleep(stryMutAct_9fa48("123459") ? Math.max(intervalMs, remainingMs) : (stryCov_9fa48("123459"), Math.min(intervalMs, remainingMs)));
        }
      }
      if (stryMutAct_9fa48("123461") ? false : stryMutAct_9fa48("123460") ? true : (stryCov_9fa48("123460", "123461"), await predicate())) {
        if (stryMutAct_9fa48("123462")) {
          {}
        } else {
          stryCov_9fa48("123462");
          return;
        }
      }
      throw createTimeoutBudgetError(stryMutAct_9fa48("123463") ? {} : (stryCov_9fa48("123463"), {
        message: timeoutError,
        budget: effectiveBudget,
        classification: stryMutAct_9fa48("123466") ? timeoutOptions.classification && TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED : stryMutAct_9fa48("123465") ? false : stryMutAct_9fa48("123464") ? true : (stryCov_9fa48("123464", "123465", "123466"), timeoutOptions.classification || TIMEOUT_BUDGET_CLASSIFICATION.ABSOLUTE_DEADLINE_EXHAUSTED),
        nestedOperation: stryMutAct_9fa48("123469") ? timeoutOptions.nestedOperation && 'wait_for_condition' : stryMutAct_9fa48("123468") ? false : stryMutAct_9fa48("123467") ? true : (stryCov_9fa48("123467", "123468", "123469"), timeoutOptions.nestedOperation || (stryMutAct_9fa48("123470") ? "" : (stryCov_9fa48("123470"), 'wait_for_condition'))),
        now: this.nowFn
      }));
    }
  }

  /**
   * Delay helper for provisioning polling loops.
   * @param {number} ms - Delay in milliseconds.
   * @return {Promise<void>}
   * @private
   */
  async sleep(ms) {
    if (stryMutAct_9fa48("123471")) {
      {}
    } else {
      stryCov_9fa48("123471");
      return new Promise(stryMutAct_9fa48("123472") ? () => undefined : (stryCov_9fa48("123472"), resolve => setTimeout(resolve, ms)));
    }
  }

  /**
   * Execute a SELECT statement.
   * @param {Object} ast - Parsed SELECT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSelect(ast, params, sessionId, queryOptions = {}, rawSql = null) {
    if (stryMutAct_9fa48("123473")) {
      {}
    } else {
      stryCov_9fa48("123473");
      // FROM-less SELECT (e.g., SELECT 1, SELECT 1+1) — route to any
      // available partition and let SQLite evaluate the expression.
      if (stryMutAct_9fa48("123476") ? false : stryMutAct_9fa48("123475") ? true : stryMutAct_9fa48("123474") ? ast.from : (stryCov_9fa48("123474", "123475", "123476"), !ast.from)) {
        if (stryMutAct_9fa48("123477")) {
          {}
        } else {
          stryCov_9fa48("123477");
          return this.executeFromlessSelect(ast, params, sessionId);
        }
      }
      const tableName = ast.from.name;
      const tableInfo = this.getTableInfo(tableName);
      const dualWriteMode = this.isDualWriteModeActiveForTable(tableInfo);
      const authoritativeLocalResult = await this.tryExecuteAuthoritativeSystemTableSelect(tableName, ast, rawSql, params, queryOptions);
      if (stryMutAct_9fa48("123479") ? false : stryMutAct_9fa48("123478") ? true : (stryCov_9fa48("123478", "123479"), authoritativeLocalResult)) {
        if (stryMutAct_9fa48("123480")) {
          {}
        } else {
          stryCov_9fa48("123480");
          return authoritativeLocalResult;
        }
      }
      const planningStartTimeMs = Date.now();
      const distributedPlan = this.distributedQueryPlanner.planSelect(ast, params, stryMutAct_9fa48("123481") ? {} : (stryCov_9fa48("123481"), {
        sessionId
      }));
      const planningDurationMs = stryMutAct_9fa48("123482") ? Date.now() + planningStartTimeMs : (stryCov_9fa48("123482"), Date.now() - planningStartTimeMs);
      const rootAlias = stryMutAct_9fa48("123485") ? ast.from.alias && tableName : stryMutAct_9fa48("123484") ? false : stryMutAct_9fa48("123483") ? true : (stryCov_9fa48("123483", "123484", "123485"), ast.from.alias || tableName);
      const rootPlan = stryMutAct_9fa48("123488") ? (distributedPlan.tablePlans.get(rootAlias) || distributedPlan.tablePlans.get(tableName)) && null : stryMutAct_9fa48("123487") ? false : stryMutAct_9fa48("123486") ? true : (stryCov_9fa48("123486", "123487", "123488"), (stryMutAct_9fa48("123490") ? distributedPlan.tablePlans.get(rootAlias) && distributedPlan.tablePlans.get(tableName) : stryMutAct_9fa48("123489") ? false : (stryCov_9fa48("123489", "123490"), distributedPlan.tablePlans.get(rootAlias) || distributedPlan.tablePlans.get(tableName))) || null);
      if (stryMutAct_9fa48("123493") ? !rootPlan && rootPlan.partitions.length === 0 : stryMutAct_9fa48("123492") ? false : stryMutAct_9fa48("123491") ? true : (stryCov_9fa48("123491", "123492", "123493"), (stryMutAct_9fa48("123494") ? rootPlan : (stryCov_9fa48("123494"), !rootPlan)) || (stryMutAct_9fa48("123496") ? rootPlan.partitions.length !== 0 : stryMutAct_9fa48("123495") ? false : (stryCov_9fa48("123495", "123496"), rootPlan.partitions.length === 0)))) {
        if (stryMutAct_9fa48("123497")) {
          {}
        } else {
          stryCov_9fa48("123497");
          return stryMutAct_9fa48("123498") ? {} : (stryCov_9fa48("123498"), {
            success: stryMutAct_9fa48("123499") ? true : (stryCov_9fa48("123499"), false),
            error: stryMutAct_9fa48("123500") ? `` : (stryCov_9fa48("123500"), `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`),
            errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND
          });
        }
      }
      const partitionIds = rootPlan.partitions;
      this.logger.debug(QUERY_LOG_MSG.RESOLVED_PARTITIONS_SELECT, stryMutAct_9fa48("123501") ? {} : (stryCov_9fa48("123501"), {
        tableName,
        totalPartitions: partitionIds.length,
        targetPartitions: partitionIds.length,
        sessionId
      }));
      const preferLeader = this.isSystemTable(tableName);
      for (const join of stryMutAct_9fa48("123504") ? ast.joins && [] : stryMutAct_9fa48("123503") ? false : stryMutAct_9fa48("123502") ? true : (stryCov_9fa48("123502", "123503", "123504"), ast.joins || (stryMutAct_9fa48("123505") ? ["Stryker was here"] : (stryCov_9fa48("123505"), [])))) {
        if (stryMutAct_9fa48("123506")) {
          {}
        } else {
          stryCov_9fa48("123506");
          const joinTableName = stryMutAct_9fa48("123507") ? join.table.name : (stryCov_9fa48("123507"), join.table?.name);
          if (stryMutAct_9fa48("123510") ? false : stryMutAct_9fa48("123509") ? true : stryMutAct_9fa48("123508") ? joinTableName : (stryCov_9fa48("123508", "123509", "123510"), !joinTableName)) {
            if (stryMutAct_9fa48("123511")) {
              {}
            } else {
              stryCov_9fa48("123511");
              continue;
            }
          }
          const joinAlias = stryMutAct_9fa48("123514") ? join.table.alias && joinTableName : stryMutAct_9fa48("123513") ? false : stryMutAct_9fa48("123512") ? true : (stryCov_9fa48("123512", "123513", "123514"), join.table.alias || joinTableName);
          const joinPlan = stryMutAct_9fa48("123517") ? (distributedPlan.tablePlans.get(joinAlias) || distributedPlan.tablePlans.get(joinTableName)) && null : stryMutAct_9fa48("123516") ? false : stryMutAct_9fa48("123515") ? true : (stryCov_9fa48("123515", "123516", "123517"), (stryMutAct_9fa48("123519") ? distributedPlan.tablePlans.get(joinAlias) && distributedPlan.tablePlans.get(joinTableName) : stryMutAct_9fa48("123518") ? false : (stryCov_9fa48("123518", "123519"), distributedPlan.tablePlans.get(joinAlias) || distributedPlan.tablePlans.get(joinTableName))) || null);
          if (stryMutAct_9fa48("123522") ? !joinPlan && joinPlan.partitions.length === 0 : stryMutAct_9fa48("123521") ? false : stryMutAct_9fa48("123520") ? true : (stryCov_9fa48("123520", "123521", "123522"), (stryMutAct_9fa48("123523") ? joinPlan : (stryCov_9fa48("123523"), !joinPlan)) || (stryMutAct_9fa48("123525") ? joinPlan.partitions.length !== 0 : stryMutAct_9fa48("123524") ? false : (stryCov_9fa48("123524", "123525"), joinPlan.partitions.length === 0)))) {
            if (stryMutAct_9fa48("123526")) {
              {}
            } else {
              stryCov_9fa48("123526");
              return stryMutAct_9fa48("123527") ? {} : (stryCov_9fa48("123527"), {
                success: stryMutAct_9fa48("123528") ? true : (stryCov_9fa48("123528"), false),
                error: stryMutAct_9fa48("123529") ? `` : (stryCov_9fa48("123529"), `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${joinTableName}`),
                errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND
              });
            }
          }
        }
      }

      // Execute on resolved partitions
      const executionStartTimeMs = Date.now();
      const deliveryPriority = this.resolveRoutedDeliveryPriority(tableName, queryOptions.deliveryPriority);
      const result = await this.queryExecutor.executeSelect(ast, partitionIds, params, stryMutAct_9fa48("123530") ? {} : (stryCov_9fa48("123530"), {
        preferLeader,
        deliveryPriority,
        distributedPlan,
        routingReadinessDimension: stryMutAct_9fa48("123533") ? queryOptions.routingReadinessDimension && this.defaultRoutingReadinessDimension : stryMutAct_9fa48("123532") ? false : stryMutAct_9fa48("123531") ? true : (stryCov_9fa48("123531", "123532", "123533"), queryOptions.routingReadinessDimension || this.defaultRoutingReadinessDimension),
        timeoutMs: queryOptions.timeoutMs,
        cancellationToken: stryMutAct_9fa48("123536") ? queryOptions.cancellationToken && null : stryMutAct_9fa48("123535") ? false : stryMutAct_9fa48("123534") ? true : (stryCov_9fa48("123534", "123535", "123536"), queryOptions.cancellationToken || null)
      }));
      const executionDurationMs = stryMutAct_9fa48("123537") ? Date.now() + executionStartTimeMs : (stryCov_9fa48("123537"), Date.now() - executionStartTimeMs);
      return stryMutAct_9fa48("123538") ? {} : (stryCov_9fa48("123538"), {
        ...result,
        tableName,
        dualWriteMode,
        distributedPlan,
        distributedDiagnostics: distributedPlan.diagnostics,
        distributedMetrics: stryMutAct_9fa48("123539") ? {} : (stryCov_9fa48("123539"), {
          planningDurationMs,
          executionDurationMs,
          fanout: stryMutAct_9fa48("123542") ? result.distributedMetrics?.fanout && null : stryMutAct_9fa48("123541") ? false : stryMutAct_9fa48("123540") ? true : (stryCov_9fa48("123540", "123541", "123542"), (stryMutAct_9fa48("123543") ? result.distributedMetrics.fanout : (stryCov_9fa48("123543"), result.distributedMetrics?.fanout)) || null),
          mergeDurationMs: stryMutAct_9fa48("123546") ? result.distributedMetrics?.mergeDurationMs && 0 : stryMutAct_9fa48("123545") ? false : stryMutAct_9fa48("123544") ? true : (stryCov_9fa48("123544", "123545", "123546"), (stryMutAct_9fa48("123547") ? result.distributedMetrics.mergeDurationMs : (stryCov_9fa48("123547"), result.distributedMetrics?.mergeDurationMs)) || 0)
        })
      });
    }
  }

  /**
   * Prefer node-local authoritative reads for single-table system-table
   * selects when a local partition replica is available. This avoids routing
   * hot control-plane reads back through the cluster under pressure.
   * @param {string} tableName
   * @param {Object} ast
   * @param {string|null} rawSql
   * @param {Array<*>} params
   * @param {Object} queryOptions
   * @return {Promise<Object|null>}
   * @private
   */
  async tryExecuteAuthoritativeSystemTableSelect(tableName, ast, rawSql, params, queryOptions = {}) {
    if (stryMutAct_9fa48("123548")) {
      {}
    } else {
      stryCov_9fa48("123548");
      const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
      if (stryMutAct_9fa48("123551") ? (!rawSql || !this.isSystemTable(tableName) || !authoritativeControlPlaneView) && Array.isArray(ast?.joins) && ast.joins.length > 0 : stryMutAct_9fa48("123550") ? false : stryMutAct_9fa48("123549") ? true : (stryCov_9fa48("123549", "123550", "123551"), (stryMutAct_9fa48("123553") ? (!rawSql || !this.isSystemTable(tableName)) && !authoritativeControlPlaneView : stryMutAct_9fa48("123552") ? false : (stryCov_9fa48("123552", "123553"), (stryMutAct_9fa48("123555") ? !rawSql && !this.isSystemTable(tableName) : stryMutAct_9fa48("123554") ? false : (stryCov_9fa48("123554", "123555"), (stryMutAct_9fa48("123556") ? rawSql : (stryCov_9fa48("123556"), !rawSql)) || (stryMutAct_9fa48("123557") ? this.isSystemTable(tableName) : (stryCov_9fa48("123557"), !this.isSystemTable(tableName))))) || (stryMutAct_9fa48("123558") ? authoritativeControlPlaneView : (stryCov_9fa48("123558"), !authoritativeControlPlaneView)))) || (stryMutAct_9fa48("123560") ? Array.isArray(ast?.joins) || ast.joins.length > 0 : stryMutAct_9fa48("123559") ? false : (stryCov_9fa48("123559", "123560"), Array.isArray(stryMutAct_9fa48("123561") ? ast.joins : (stryCov_9fa48("123561"), ast?.joins)) && (stryMutAct_9fa48("123564") ? ast.joins.length <= 0 : stryMutAct_9fa48("123563") ? ast.joins.length >= 0 : stryMutAct_9fa48("123562") ? true : (stryCov_9fa48("123562", "123563", "123564"), ast.joins.length > 0)))))) {
        if (stryMutAct_9fa48("123565")) {
          {}
        } else {
          stryCov_9fa48("123565");
          return null;
        }
      }
      const confirmEmptyLocalReadWithOwnerRpc = this.shouldConfirmEmptyAuthoritativeSystemTableRead(tableName, ast);
      const localResult = await authoritativeControlPlaneView.readRows(tableName, rawSql, params, stryMutAct_9fa48("123566") ? {} : (stryCov_9fa48("123566"), {
        allowSqlFallback: stryMutAct_9fa48("123567") ? true : (stryCov_9fa48("123567"), false),
        queryTimeoutMs: stryMutAct_9fa48("123568") ? queryOptions.timeoutMs : (stryCov_9fa48("123568"), queryOptions?.timeoutMs),
        confirmEmptyLocalReadWithOwnerRpc,
        replicaFallbackConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA
      }));
      if (stryMutAct_9fa48("123571") ? false : stryMutAct_9fa48("123570") ? true : stryMutAct_9fa48("123569") ? localResult?.success : (stryCov_9fa48("123569", "123570", "123571"), !(stryMutAct_9fa48("123572") ? localResult.success : (stryCov_9fa48("123572"), localResult?.success)))) {
        if (stryMutAct_9fa48("123573")) {
          {}
        } else {
          stryCov_9fa48("123573");
          return null;
        }
      }
      const partitions = stryMutAct_9fa48("123574") ? this.getTablePartitions(tableName).map(partition => partition?.partition_id) : (stryCov_9fa48("123574"), this.getTablePartitions(tableName).map(stryMutAct_9fa48("123575") ? () => undefined : (stryCov_9fa48("123575"), partition => stryMutAct_9fa48("123576") ? partition.partition_id : (stryCov_9fa48("123576"), partition?.partition_id))).filter(stryMutAct_9fa48("123577") ? () => undefined : (stryCov_9fa48("123577"), partitionId => stryMutAct_9fa48("123580") ? typeof partitionId !== 'string' : stryMutAct_9fa48("123579") ? false : stryMutAct_9fa48("123578") ? true : (stryCov_9fa48("123578", "123579", "123580"), typeof partitionId === (stryMutAct_9fa48("123581") ? "" : (stryCov_9fa48("123581"), 'string'))))));
      return stryMutAct_9fa48("123582") ? {} : (stryCov_9fa48("123582"), {
        ...localResult,
        partitions,
        tableName,
        distributedPlan: null,
        distributedDiagnostics: null,
        distributedMetrics: stryMutAct_9fa48("123583") ? {} : (stryCov_9fa48("123583"), {
          planningDurationMs: 0,
          executionDurationMs: 0,
          fanout: partitions.length,
          mergeDurationMs: 0
        })
      });
    }
  }

  /**
   * Determine whether one system-table read should confirm empty local rows
   * through the authoritative owner lane before accepting the result.
   * @param {string} tableName
   * @param {Object} ast
   * @return {boolean}
   * @private
   */
  shouldConfirmEmptyAuthoritativeSystemTableRead(tableName, ast) {
    if (stryMutAct_9fa48("123584")) {
      {}
    } else {
      stryCov_9fa48("123584");
      const primaryKeyColumns = this.getSystemTablePrimaryKeyColumns(tableName);
      if (stryMutAct_9fa48("123587") ? primaryKeyColumns.length === 1 : stryMutAct_9fa48("123586") ? false : stryMutAct_9fa48("123585") ? true : (stryCov_9fa48("123585", "123586", "123587"), primaryKeyColumns.length !== 1)) {
        if (stryMutAct_9fa48("123588")) {
          {}
        } else {
          stryCov_9fa48("123588");
          return stryMutAct_9fa48("123589") ? true : (stryCov_9fa48("123589"), false);
        }
      }
      const primaryKeyColumn = primaryKeyColumns[0];
      const tableAlias = stryMutAct_9fa48("123592") ? ast?.from?.alias && null : stryMutAct_9fa48("123591") ? false : stryMutAct_9fa48("123590") ? true : (stryCov_9fa48("123590", "123591", "123592"), (stryMutAct_9fa48("123594") ? ast.from?.alias : stryMutAct_9fa48("123593") ? ast?.from.alias : (stryCov_9fa48("123593", "123594"), ast?.from?.alias)) || null);
      const whereClause = stryMutAct_9fa48("123597") ? ast?.where && null : stryMutAct_9fa48("123596") ? false : stryMutAct_9fa48("123595") ? true : (stryCov_9fa48("123595", "123596", "123597"), (stryMutAct_9fa48("123598") ? ast.where : (stryCov_9fa48("123598"), ast?.where)) || null);
      if (stryMutAct_9fa48("123601") ? !whereClause && typeof whereClause !== 'object' : stryMutAct_9fa48("123600") ? false : stryMutAct_9fa48("123599") ? true : (stryCov_9fa48("123599", "123600", "123601"), (stryMutAct_9fa48("123602") ? whereClause : (stryCov_9fa48("123602"), !whereClause)) || (stryMutAct_9fa48("123604") ? typeof whereClause === 'object' : stryMutAct_9fa48("123603") ? false : (stryCov_9fa48("123603", "123604"), typeof whereClause !== (stryMutAct_9fa48("123605") ? "" : (stryCov_9fa48("123605"), 'object')))))) {
        if (stryMutAct_9fa48("123606")) {
          {}
        } else {
          stryCov_9fa48("123606");
          return stryMutAct_9fa48("123607") ? true : (stryCov_9fa48("123607"), false);
        }
      }
      if (stryMutAct_9fa48("123610") ? whereClause.type === 'binary' || whereClause.operator === '=' : stryMutAct_9fa48("123609") ? false : stryMutAct_9fa48("123608") ? true : (stryCov_9fa48("123608", "123609", "123610"), (stryMutAct_9fa48("123612") ? whereClause.type !== 'binary' : stryMutAct_9fa48("123611") ? true : (stryCov_9fa48("123611", "123612"), whereClause.type === (stryMutAct_9fa48("123613") ? "" : (stryCov_9fa48("123613"), 'binary')))) && (stryMutAct_9fa48("123615") ? whereClause.operator !== '=' : stryMutAct_9fa48("123614") ? true : (stryCov_9fa48("123614", "123615"), whereClause.operator === (stryMutAct_9fa48("123616") ? "" : (stryCov_9fa48("123616"), '=')))))) {
        if (stryMutAct_9fa48("123617")) {
          {}
        } else {
          stryCov_9fa48("123617");
          return stryMutAct_9fa48("123620") ? this.isSystemTablePrimaryKeyColumnReference(whereClause.left, tableName, tableAlias, primaryKeyColumn) || this.isBoundSystemTableLookupValue(whereClause.right) : stryMutAct_9fa48("123619") ? false : stryMutAct_9fa48("123618") ? true : (stryCov_9fa48("123618", "123619", "123620"), this.isSystemTablePrimaryKeyColumnReference(whereClause.left, tableName, tableAlias, primaryKeyColumn) && this.isBoundSystemTableLookupValue(whereClause.right));
        }
      }
      if (stryMutAct_9fa48("123623") ? whereClause.type === 'in' || whereClause.negated !== true : stryMutAct_9fa48("123622") ? false : stryMutAct_9fa48("123621") ? true : (stryCov_9fa48("123621", "123622", "123623"), (stryMutAct_9fa48("123625") ? whereClause.type !== 'in' : stryMutAct_9fa48("123624") ? true : (stryCov_9fa48("123624", "123625"), whereClause.type === (stryMutAct_9fa48("123626") ? "" : (stryCov_9fa48("123626"), 'in')))) && (stryMutAct_9fa48("123628") ? whereClause.negated === true : stryMutAct_9fa48("123627") ? true : (stryCov_9fa48("123627", "123628"), whereClause.negated !== (stryMutAct_9fa48("123629") ? false : (stryCov_9fa48("123629"), true)))))) {
        if (stryMutAct_9fa48("123630")) {
          {}
        } else {
          stryCov_9fa48("123630");
          return stryMutAct_9fa48("123633") ? this.isSystemTablePrimaryKeyColumnReference(whereClause.expression, tableName, tableAlias, primaryKeyColumn) && Array.isArray(whereClause.values) && whereClause.values.length > 0 || whereClause.values.every(value => this.isBoundSystemTableLookupValue(value)) : stryMutAct_9fa48("123632") ? false : stryMutAct_9fa48("123631") ? true : (stryCov_9fa48("123631", "123632", "123633"), (stryMutAct_9fa48("123635") ? this.isSystemTablePrimaryKeyColumnReference(whereClause.expression, tableName, tableAlias, primaryKeyColumn) && Array.isArray(whereClause.values) || whereClause.values.length > 0 : stryMutAct_9fa48("123634") ? true : (stryCov_9fa48("123634", "123635"), (stryMutAct_9fa48("123637") ? this.isSystemTablePrimaryKeyColumnReference(whereClause.expression, tableName, tableAlias, primaryKeyColumn) || Array.isArray(whereClause.values) : stryMutAct_9fa48("123636") ? true : (stryCov_9fa48("123636", "123637"), this.isSystemTablePrimaryKeyColumnReference(whereClause.expression, tableName, tableAlias, primaryKeyColumn) && Array.isArray(whereClause.values))) && (stryMutAct_9fa48("123640") ? whereClause.values.length <= 0 : stryMutAct_9fa48("123639") ? whereClause.values.length >= 0 : stryMutAct_9fa48("123638") ? true : (stryCov_9fa48("123638", "123639", "123640"), whereClause.values.length > 0)))) && (stryMutAct_9fa48("123641") ? whereClause.values.some(value => this.isBoundSystemTableLookupValue(value)) : (stryCov_9fa48("123641"), whereClause.values.every(stryMutAct_9fa48("123642") ? () => undefined : (stryCov_9fa48("123642"), value => this.isBoundSystemTableLookupValue(value))))));
        }
      }
      return stryMutAct_9fa48("123643") ? true : (stryCov_9fa48("123643"), false);
    }
  }

  /**
   * Resolve primary-key columns from the canonical system-table schema.
   * @param {string} tableName
   * @return {string[]}
   * @private
   */
  getSystemTablePrimaryKeyColumns(tableName) {
    if (stryMutAct_9fa48("123644")) {
      {}
    } else {
      stryCov_9fa48("123644");
      const schema = getSchemaByTableName(tableName);
      if (stryMutAct_9fa48("123647") ? false : stryMutAct_9fa48("123646") ? true : stryMutAct_9fa48("123645") ? schema : (stryCov_9fa48("123645", "123646", "123647"), !schema)) {
        if (stryMutAct_9fa48("123648")) {
          {}
        } else {
          stryCov_9fa48("123648");
          return stryMutAct_9fa48("123649") ? ["Stryker was here"] : (stryCov_9fa48("123649"), []);
        }
      }
      if (stryMutAct_9fa48("123652") ? Array.isArray(schema.primaryKey) || schema.primaryKey.length > 0 : stryMutAct_9fa48("123651") ? false : stryMutAct_9fa48("123650") ? true : (stryCov_9fa48("123650", "123651", "123652"), Array.isArray(schema.primaryKey) && (stryMutAct_9fa48("123655") ? schema.primaryKey.length <= 0 : stryMutAct_9fa48("123654") ? schema.primaryKey.length >= 0 : stryMutAct_9fa48("123653") ? true : (stryCov_9fa48("123653", "123654", "123655"), schema.primaryKey.length > 0)))) {
        if (stryMutAct_9fa48("123656")) {
          {}
        } else {
          stryCov_9fa48("123656");
          return stryMutAct_9fa48("123657") ? schema.primaryKey : (stryCov_9fa48("123657"), schema.primaryKey.filter(stryMutAct_9fa48("123658") ? () => undefined : (stryCov_9fa48("123658"), columnName => stryMutAct_9fa48("123661") ? typeof columnName === 'string' || columnName.length > 0 : stryMutAct_9fa48("123660") ? false : stryMutAct_9fa48("123659") ? true : (stryCov_9fa48("123659", "123660", "123661"), (stryMutAct_9fa48("123663") ? typeof columnName !== 'string' : stryMutAct_9fa48("123662") ? true : (stryCov_9fa48("123662", "123663"), typeof columnName === (stryMutAct_9fa48("123664") ? "" : (stryCov_9fa48("123664"), 'string')))) && (stryMutAct_9fa48("123667") ? columnName.length <= 0 : stryMutAct_9fa48("123666") ? columnName.length >= 0 : stryMutAct_9fa48("123665") ? true : (stryCov_9fa48("123665", "123666", "123667"), columnName.length > 0))))));
        }
      }
      if (stryMutAct_9fa48("123670") ? false : stryMutAct_9fa48("123669") ? true : stryMutAct_9fa48("123668") ? Array.isArray(schema.columns) : (stryCov_9fa48("123668", "123669", "123670"), !Array.isArray(schema.columns))) {
        if (stryMutAct_9fa48("123671")) {
          {}
        } else {
          stryCov_9fa48("123671");
          return stryMutAct_9fa48("123672") ? ["Stryker was here"] : (stryCov_9fa48("123672"), []);
        }
      }
      return stryMutAct_9fa48("123674") ? schema.columns.map(column => column.name).filter(columnName => typeof columnName === 'string' && columnName.length > 0) : stryMutAct_9fa48("123673") ? schema.columns.filter(column => column?.primaryKey === true).map(column => column.name) : (stryCov_9fa48("123673", "123674"), schema.columns.filter(stryMutAct_9fa48("123675") ? () => undefined : (stryCov_9fa48("123675"), column => stryMutAct_9fa48("123678") ? column?.primaryKey !== true : stryMutAct_9fa48("123677") ? false : stryMutAct_9fa48("123676") ? true : (stryCov_9fa48("123676", "123677", "123678"), (stryMutAct_9fa48("123679") ? column.primaryKey : (stryCov_9fa48("123679"), column?.primaryKey)) === (stryMutAct_9fa48("123680") ? false : (stryCov_9fa48("123680"), true))))).map(stryMutAct_9fa48("123681") ? () => undefined : (stryCov_9fa48("123681"), column => column.name)).filter(stryMutAct_9fa48("123682") ? () => undefined : (stryCov_9fa48("123682"), columnName => stryMutAct_9fa48("123685") ? typeof columnName === 'string' || columnName.length > 0 : stryMutAct_9fa48("123684") ? false : stryMutAct_9fa48("123683") ? true : (stryCov_9fa48("123683", "123684", "123685"), (stryMutAct_9fa48("123687") ? typeof columnName !== 'string' : stryMutAct_9fa48("123686") ? true : (stryCov_9fa48("123686", "123687"), typeof columnName === (stryMutAct_9fa48("123688") ? "" : (stryCov_9fa48("123688"), 'string')))) && (stryMutAct_9fa48("123691") ? columnName.length <= 0 : stryMutAct_9fa48("123690") ? columnName.length >= 0 : stryMutAct_9fa48("123689") ? true : (stryCov_9fa48("123689", "123690", "123691"), columnName.length > 0))))));
    }
  }

  /**
   * Check whether one lookup expression is a literal or a bound parameter.
   * @param {Object|null} expression
   * @return {boolean}
   * @private
   */
  isBoundSystemTableLookupValue(expression) {
    if (stryMutAct_9fa48("123692")) {
      {}
    } else {
      stryCov_9fa48("123692");
      return stryMutAct_9fa48("123695") ? expression?.type === 'literal' && expression?.type === 'parameter' : stryMutAct_9fa48("123694") ? false : stryMutAct_9fa48("123693") ? true : (stryCov_9fa48("123693", "123694", "123695"), (stryMutAct_9fa48("123697") ? expression?.type !== 'literal' : stryMutAct_9fa48("123696") ? false : (stryCov_9fa48("123696", "123697"), (stryMutAct_9fa48("123698") ? expression.type : (stryCov_9fa48("123698"), expression?.type)) === (stryMutAct_9fa48("123699") ? "" : (stryCov_9fa48("123699"), 'literal')))) || (stryMutAct_9fa48("123701") ? expression?.type !== 'parameter' : stryMutAct_9fa48("123700") ? false : (stryCov_9fa48("123700", "123701"), (stryMutAct_9fa48("123702") ? expression.type : (stryCov_9fa48("123702"), expression?.type)) === (stryMutAct_9fa48("123703") ? "" : (stryCov_9fa48("123703"), 'parameter')))));
    }
  }

  /**
   * Check whether one expression references the expected system-table primary
   * key column.
   * @param {Object|null} expression
   * @param {string} tableName
   * @param {string|null} tableAlias
   * @param {string} primaryKeyColumn
   * @return {boolean}
   * @private
   */
  isSystemTablePrimaryKeyColumnReference(expression, tableName, tableAlias, primaryKeyColumn) {
    if (stryMutAct_9fa48("123704")) {
      {}
    } else {
      stryCov_9fa48("123704");
      if (stryMutAct_9fa48("123707") ? !expression && expression.type !== 'column_ref' : stryMutAct_9fa48("123706") ? false : stryMutAct_9fa48("123705") ? true : (stryCov_9fa48("123705", "123706", "123707"), (stryMutAct_9fa48("123708") ? expression : (stryCov_9fa48("123708"), !expression)) || (stryMutAct_9fa48("123710") ? expression.type === 'column_ref' : stryMutAct_9fa48("123709") ? false : (stryCov_9fa48("123709", "123710"), expression.type !== (stryMutAct_9fa48("123711") ? "" : (stryCov_9fa48("123711"), 'column_ref')))))) {
        if (stryMutAct_9fa48("123712")) {
          {}
        } else {
          stryCov_9fa48("123712");
          return stryMutAct_9fa48("123713") ? true : (stryCov_9fa48("123713"), false);
        }
      }
      if (stryMutAct_9fa48("123716") ? expression.column === primaryKeyColumn : stryMutAct_9fa48("123715") ? false : stryMutAct_9fa48("123714") ? true : (stryCov_9fa48("123714", "123715", "123716"), expression.column !== primaryKeyColumn)) {
        if (stryMutAct_9fa48("123717")) {
          {}
        } else {
          stryCov_9fa48("123717");
          return stryMutAct_9fa48("123718") ? true : (stryCov_9fa48("123718"), false);
        }
      }
      return stryMutAct_9fa48("123721") ? (expression.table === null || expression.table === undefined || expression.table === tableName) && expression.table === tableAlias : stryMutAct_9fa48("123720") ? false : stryMutAct_9fa48("123719") ? true : (stryCov_9fa48("123719", "123720", "123721"), (stryMutAct_9fa48("123723") ? (expression.table === null || expression.table === undefined) && expression.table === tableName : stryMutAct_9fa48("123722") ? false : (stryCov_9fa48("123722", "123723"), (stryMutAct_9fa48("123725") ? expression.table === null && expression.table === undefined : stryMutAct_9fa48("123724") ? false : (stryCov_9fa48("123724", "123725"), (stryMutAct_9fa48("123727") ? expression.table !== null : stryMutAct_9fa48("123726") ? false : (stryCov_9fa48("123726", "123727"), expression.table === null)) || (stryMutAct_9fa48("123729") ? expression.table !== undefined : stryMutAct_9fa48("123728") ? false : (stryCov_9fa48("123728", "123729"), expression.table === undefined)))) || (stryMutAct_9fa48("123731") ? expression.table !== tableName : stryMutAct_9fa48("123730") ? false : (stryCov_9fa48("123730", "123731"), expression.table === tableName)))) || (stryMutAct_9fa48("123733") ? expression.table !== tableAlias : stryMutAct_9fa48("123732") ? false : (stryCov_9fa48("123732", "123733"), expression.table === tableAlias)));
    }
  }

  /**
   * Resolve the shared authoritative control-plane read view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (stryMutAct_9fa48("123734")) {
      {}
    } else {
      stryCov_9fa48("123734");
      if (stryMutAct_9fa48("123736") ? false : stryMutAct_9fa48("123735") ? true : (stryCov_9fa48("123735", "123736"), this.authoritativeControlPlaneView)) {
        if (stryMutAct_9fa48("123737")) {
          {}
        } else {
          stryCov_9fa48("123737");
          return this.authoritativeControlPlaneView;
        }
      }
      if (stryMutAct_9fa48("123740") ? false : stryMutAct_9fa48("123739") ? true : stryMutAct_9fa48("123738") ? this.cdcIntegrationService : (stryCov_9fa48("123738", "123739", "123740"), !this.cdcIntegrationService)) {
        if (stryMutAct_9fa48("123741")) {
          {}
        } else {
          stryCov_9fa48("123741");
          return null;
        }
      }
      this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView(stryMutAct_9fa48("123742") ? {} : (stryCov_9fa48("123742"), {
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        messageRouter: this.messageRouter,
        now: this.nowFn
      }));
      return this.authoritativeControlPlaneView;
    }
  }

  /**
   * Execute a SELECT without a FROM clause (e.g., SELECT 1, SELECT 1+1).
   * Routes to any available partition and lets SQLite evaluate the
   * expression directly.
   * @param {Object} ast - Parsed SELECT AST with null from.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeFromlessSelect(ast, params, _sessionId) {
    if (stryMutAct_9fa48("123743")) {
      {}
    } else {
      stryCov_9fa48("123743");
      const allPartitions = stryMutAct_9fa48("123746") ? this.systemCache?.getAll?.(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("123745") ? false : stryMutAct_9fa48("123744") ? true : (stryCov_9fa48("123744", "123745", "123746"), (stryMutAct_9fa48("123748") ? this.systemCache.getAll?.(TABLES.PARTITIONS) : stryMutAct_9fa48("123747") ? this.systemCache?.getAll(TABLES.PARTITIONS) : (stryCov_9fa48("123747", "123748"), this.systemCache?.getAll?.(TABLES.PARTITIONS))) || (stryMutAct_9fa48("123749") ? ["Stryker was here"] : (stryCov_9fa48("123749"), [])));
      if (stryMutAct_9fa48("123752") ? allPartitions.length !== 0 : stryMutAct_9fa48("123751") ? false : stryMutAct_9fa48("123750") ? true : (stryCov_9fa48("123750", "123751", "123752"), allPartitions.length === 0)) {
        if (stryMutAct_9fa48("123753")) {
          {}
        } else {
          stryCov_9fa48("123753");
          return stryMutAct_9fa48("123754") ? {} : (stryCov_9fa48("123754"), {
            success: stryMutAct_9fa48("123755") ? true : (stryCov_9fa48("123755"), false),
            error: QUERY_ERROR_MSG.NO_PARTITIONS_FOR_TABLE,
            errorCode: QUERY_ERROR_CODE.PARTITION_NOT_FOUND
          });
        }
      }
      const targetPartitionId = allPartitions[0].partition_id;
      const cols = ast.columns.map(stryMutAct_9fa48("123756") ? () => undefined : (stryCov_9fa48("123756"), col => this.queryExecutor.buildColumnSQL(col)));
      const sql = stryMutAct_9fa48("123757") ? `` : (stryCov_9fa48("123757"), `SELECT ${cols.join(stryMutAct_9fa48("123758") ? "" : (stryCov_9fa48("123758"), ', '))}`);
      const results = await this.queryExecutor.executeOnPartitions(stryMutAct_9fa48("123759") ? [] : (stryCov_9fa48("123759"), [targetPartitionId]), sql, params, null, stryMutAct_9fa48("123760") ? false : (stryCov_9fa48("123760"), true), stryMutAct_9fa48("123761") ? true : (stryCov_9fa48("123761"), false), stryMutAct_9fa48("123762") ? true : (stryCov_9fa48("123762"), false), stryMutAct_9fa48("123763") ? {} : (stryCov_9fa48("123763"), {
        routingReadinessDimension: this.defaultRoutingReadinessDimension
      }));
      const first = results[0];
      if (stryMutAct_9fa48("123766") ? !first && !first.success : stryMutAct_9fa48("123765") ? false : stryMutAct_9fa48("123764") ? true : (stryCov_9fa48("123764", "123765", "123766"), (stryMutAct_9fa48("123767") ? first : (stryCov_9fa48("123767"), !first)) || (stryMutAct_9fa48("123768") ? first.success : (stryCov_9fa48("123768"), !first.success)))) {
        if (stryMutAct_9fa48("123769")) {
          {}
        } else {
          stryCov_9fa48("123769");
          return stryMutAct_9fa48("123770") ? {} : (stryCov_9fa48("123770"), {
            success: stryMutAct_9fa48("123771") ? true : (stryCov_9fa48("123771"), false),
            error: stryMutAct_9fa48("123774") ? first?.error && QUERY_ERROR_MSG.QUERY_ROUTING_FAILED : stryMutAct_9fa48("123773") ? false : stryMutAct_9fa48("123772") ? true : (stryCov_9fa48("123772", "123773", "123774"), (stryMutAct_9fa48("123775") ? first.error : (stryCov_9fa48("123775"), first?.error)) || QUERY_ERROR_MSG.QUERY_ROUTING_FAILED),
            errorCode: QUERY_ERROR_CODE.INTERNAL_ERROR
          });
        }
      }
      return stryMutAct_9fa48("123776") ? {} : (stryCov_9fa48("123776"), {
        success: stryMutAct_9fa48("123777") ? false : (stryCov_9fa48("123777"), true),
        rows: stryMutAct_9fa48("123780") ? first.rows && [] : stryMutAct_9fa48("123779") ? false : stryMutAct_9fa48("123778") ? true : (stryCov_9fa48("123778", "123779", "123780"), first.rows || (stryMutAct_9fa48("123781") ? ["Stryker was here"] : (stryCov_9fa48("123781"), []))),
        count: stryMutAct_9fa48("123784") ? first.rows?.length && 0 : stryMutAct_9fa48("123783") ? false : stryMutAct_9fa48("123782") ? true : (stryCov_9fa48("123782", "123783", "123784"), (stryMutAct_9fa48("123785") ? first.rows.length : (stryCov_9fa48("123785"), first.rows?.length)) || 0),
        partitions: stryMutAct_9fa48("123786") ? [] : (stryCov_9fa48("123786"), [targetPartitionId]),
        tableName: null,
        distributedPlan: null,
        distributedDiagnostics: null,
        distributedMetrics: stryMutAct_9fa48("123787") ? {} : (stryCov_9fa48("123787"), {
          planningDurationMs: 0,
          executionDurationMs: 0,
          fanout: null,
          mergeDurationMs: 0
        })
      });
    }
  }

  /**
   * Execute an INSERT statement.
   * @param {Object} ast - Parsed INSERT AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @param {Object} [queryOptions={}] - Query execution options.
   * @return {Promise<Object>} Insert result.
   * @private
   */
  async executeInsert(ast, params, sessionId, queryOptions = {}) {
    if (stryMutAct_9fa48("123788")) {
      {}
    } else {
      stryCov_9fa48("123788");
      const tableName = ast.table;
      const tableInfo = this.getTableInfo(tableName);
      const dualWriteMigration = this.getActiveDualWriteMigration(tableInfo);
      const planningStartTimeMs = Date.now();
      const distributedPlan = this.distributedQueryPlanner.planInsert(ast, params, stryMutAct_9fa48("123789") ? {} : (stryCov_9fa48("123789"), {
        sessionId
      }));
      const planningDurationMs = stryMutAct_9fa48("123790") ? Date.now() + planningStartTimeMs : (stryCov_9fa48("123790"), Date.now() - planningStartTimeMs);
      const tablePlan = stryMutAct_9fa48("123793") ? distributedPlan.tablePlans.get(tableName) && null : stryMutAct_9fa48("123792") ? false : stryMutAct_9fa48("123791") ? true : (stryCov_9fa48("123791", "123792", "123793"), distributedPlan.tablePlans.get(tableName) || null);
      if (stryMutAct_9fa48("123796") ? !tablePlan && tablePlan.partitions.length === 0 : stryMutAct_9fa48("123795") ? false : stryMutAct_9fa48("123794") ? true : (stryCov_9fa48("123794", "123795", "123796"), (stryMutAct_9fa48("123797") ? tablePlan : (stryCov_9fa48("123797"), !tablePlan)) || (stryMutAct_9fa48("123799") ? tablePlan.partitions.length !== 0 : stryMutAct_9fa48("123798") ? false : (stryCov_9fa48("123798", "123799"), tablePlan.partitions.length === 0)))) {
        if (stryMutAct_9fa48("123800")) {
          {}
        } else {
          stryCov_9fa48("123800");
          return stryMutAct_9fa48("123801") ? {} : (stryCov_9fa48("123801"), {
            success: stryMutAct_9fa48("123802") ? true : (stryCov_9fa48("123802"), false),
            error: stryMutAct_9fa48("123803") ? `` : (stryCov_9fa48("123803"), `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`),
            errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND
          });
        }
      }
      const writePlan = this.distributedWriteCoordinator.createWritePlan(ast, params, stryMutAct_9fa48("123804") ? {} : (stryCov_9fa48("123804"), {
        sessionId
      }));
      this.addTransitionMirrorParticipants(writePlan, ast, tableInfo);
      const txState = this.transactionCoordinator.getTransaction(sessionId);
      const writePartitions = Array.from(writePlan.partitionStatements.keys());
      if (stryMutAct_9fa48("123806") ? false : stryMutAct_9fa48("123805") ? true : (stryCov_9fa48("123805", "123806"), txState)) {
        if (stryMutAct_9fa48("123807")) {
          {}
        } else {
          stryCov_9fa48("123807");
          const payloadHash = this.createWriteOperationPayloadHash(writePlan, QUERY_AST_TYPE.INSERT);
          const enlistResult = await this.transactionCoordinator.enlistParticipants(sessionId, writePartitions);
          if (stryMutAct_9fa48("123810") ? false : stryMutAct_9fa48("123809") ? true : stryMutAct_9fa48("123808") ? enlistResult.success : (stryCov_9fa48("123808", "123809", "123810"), !enlistResult.success)) {
            if (stryMutAct_9fa48("123811")) {
              {}
            } else {
              stryCov_9fa48("123811");
              return enlistResult;
            }
          }
          await this.transactionCoordinator.recordWriteOperation(sessionId, stryMutAct_9fa48("123812") ? {} : (stryCov_9fa48("123812"), {
            statementType: QUERY_AST_TYPE.INSERT,
            operationId: writePlan.operationId,
            partitionIds: writePartitions,
            idempotencyKey: writePlan.idempotencyKey,
            payloadHash
          }));
        }
      }
      this.logger.debug(QUERY_LOG_MSG.ROUTING_INSERT, stryMutAct_9fa48("123813") ? {} : (stryCov_9fa48("123813"), {
        tableName,
        rowCount: ast.values.length,
        partitionCount: writePlan.partitionStatements.size,
        sessionId
      }));
      let result;
      const executionStartTimeMs = Date.now();
      try {
        if (stryMutAct_9fa48("123814")) {
          {}
        } else {
          stryCov_9fa48("123814");
          const deliveryPriority = this.resolveRoutedDeliveryPriority(tableName, queryOptions.deliveryPriority);
          const writeExecutionOptions = stryMutAct_9fa48("123815") ? {} : (stryCov_9fa48("123815"), {
            sessionId,
            deliveryPriority,
            timeoutMs: queryOptions.timeoutMs,
            cancellationToken: stryMutAct_9fa48("123818") ? queryOptions.cancellationToken && null : stryMutAct_9fa48("123817") ? false : stryMutAct_9fa48("123816") ? true : (stryCov_9fa48("123816", "123817", "123818"), queryOptions.cancellationToken || null),
            routingReadinessDimension: stryMutAct_9fa48("123821") ? queryOptions.routingReadinessDimension && this.defaultRoutingReadinessDimension : stryMutAct_9fa48("123820") ? false : stryMutAct_9fa48("123819") ? true : (stryCov_9fa48("123819", "123820", "123821"), queryOptions.routingReadinessDimension || this.defaultRoutingReadinessDimension)
          });
          if (stryMutAct_9fa48("123823") ? false : stryMutAct_9fa48("123822") ? true : (stryCov_9fa48("123822", "123823"), dualWriteMigration)) {
            if (stryMutAct_9fa48("123824")) {
              {}
            } else {
              stryCov_9fa48("123824");
              writeExecutionOptions.dualWriteMode = stryMutAct_9fa48("123825") ? false : (stryCov_9fa48("123825"), true);
              writeExecutionOptions.migrationId = stryMutAct_9fa48("123828") ? (dualWriteMigration.migration_id || dualWriteMigration.migrationId) && null : stryMutAct_9fa48("123827") ? false : stryMutAct_9fa48("123826") ? true : (stryCov_9fa48("123826", "123827", "123828"), (stryMutAct_9fa48("123830") ? dualWriteMigration.migration_id && dualWriteMigration.migrationId : stryMutAct_9fa48("123829") ? false : (stryCov_9fa48("123829", "123830"), dualWriteMigration.migration_id || dualWriteMigration.migrationId)) || null);
            }
          }
          result = await this.distributedWriteCoordinator.executePlan(writePlan, params, writeExecutionOptions);
        }
      } catch (error) {
        if (stryMutAct_9fa48("123831")) {
          {}
        } else {
          stryCov_9fa48("123831");
          if (stryMutAct_9fa48("123833") ? false : stryMutAct_9fa48("123832") ? true : (stryCov_9fa48("123832", "123833"), txState)) {
            if (stryMutAct_9fa48("123834")) {
              {}
            } else {
              stryCov_9fa48("123834");
              await this.transactionCoordinator.markWriteOperationResult(sessionId, writePlan.operationId, stryMutAct_9fa48("123835") ? {} : (stryCov_9fa48("123835"), {
                success: stryMutAct_9fa48("123836") ? true : (stryCov_9fa48("123836"), false),
                error: error.message,
                retryCount: 0
              }));
            }
          } else if (stryMutAct_9fa48("123839") ? false : stryMutAct_9fa48("123838") ? true : stryMutAct_9fa48("123837") ? WRITE_TRACKING_EXCLUDED_TABLES.has(tableName) : (stryCov_9fa48("123837", "123838", "123839"), !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName))) {
            if (stryMutAct_9fa48("123840")) {
              {}
            } else {
              stryCov_9fa48("123840");
              this.fireNonTransactionalWriteResult(writePlan, QUERY_AST_TYPE.INSERT, stryMutAct_9fa48("123841") ? {} : (stryCov_9fa48("123841"), {
                success: stryMutAct_9fa48("123842") ? true : (stryCov_9fa48("123842"), false),
                error: error.message,
                retryCount: 0
              }));
            }
          }
          throw error;
        }
      }
      const executionDurationMs = stryMutAct_9fa48("123843") ? Date.now() + executionStartTimeMs : (stryCov_9fa48("123843"), Date.now() - executionStartTimeMs);
      if (stryMutAct_9fa48("123845") ? false : stryMutAct_9fa48("123844") ? true : (stryCov_9fa48("123844", "123845"), txState)) {
        if (stryMutAct_9fa48("123846")) {
          {}
        } else {
          stryCov_9fa48("123846");
          await this.transactionCoordinator.markWriteOperationResult(sessionId, writePlan.operationId, result);
        }
      } else if (stryMutAct_9fa48("123849") ? false : stryMutAct_9fa48("123848") ? true : stryMutAct_9fa48("123847") ? WRITE_TRACKING_EXCLUDED_TABLES.has(tableName) : (stryCov_9fa48("123847", "123848", "123849"), !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName))) {
        if (stryMutAct_9fa48("123850")) {
          {}
        } else {
          stryCov_9fa48("123850");
          this.fireNonTransactionalWriteResult(writePlan, QUERY_AST_TYPE.INSERT, result);
          this.requestManagedSplitEvaluationForWrite(tableName, writePlan, result);
        }
      }
      return stryMutAct_9fa48("123851") ? {} : (stryCov_9fa48("123851"), {
        ...result,
        operation: QUERY_OPERATION.INSERT,
        tableName,
        dualWriteMode: stryMutAct_9fa48("123854") ? dualWriteMigration === null : stryMutAct_9fa48("123853") ? false : stryMutAct_9fa48("123852") ? true : (stryCov_9fa48("123852", "123853", "123854"), dualWriteMigration !== null),
        distributedPlan,
        distributedWritePlan: writePlan,
        distributedDiagnostics: distributedPlan.diagnostics,
        distributedMetrics: stryMutAct_9fa48("123855") ? {} : (stryCov_9fa48("123855"), {
          planningDurationMs,
          executionDurationMs,
          retryCount: stryMutAct_9fa48("123858") ? result.retryCount && 0 : stryMutAct_9fa48("123857") ? false : stryMutAct_9fa48("123856") ? true : (stryCov_9fa48("123856", "123857", "123858"), result.retryCount || 0)
        })
      });
    }
  }

  /**
   * Execute an UPDATE statement.
   * @param {Object} ast - Parsed UPDATE AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @param {Object} [queryOptions={}] - Query execution options.
   * @return {Promise<Object>} Update result.
   * @private
   */
  async executeUpdate(ast, params, sessionId, queryOptions = {}) {
    if (stryMutAct_9fa48("123859")) {
      {}
    } else {
      stryCov_9fa48("123859");
      const tableName = ast.table;
      const tableInfo = this.getTableInfo(tableName);
      const dualWriteMigration = this.getActiveDualWriteMigration(tableInfo);
      const planningStartTimeMs = Date.now();
      const distributedPlan = this.distributedQueryPlanner.planUpdate(ast, params, stryMutAct_9fa48("123860") ? {} : (stryCov_9fa48("123860"), {
        sessionId
      }));
      const planningDurationMs = stryMutAct_9fa48("123861") ? Date.now() + planningStartTimeMs : (stryCov_9fa48("123861"), Date.now() - planningStartTimeMs);
      const tablePlan = stryMutAct_9fa48("123864") ? distributedPlan.tablePlans.get(tableName) && null : stryMutAct_9fa48("123863") ? false : stryMutAct_9fa48("123862") ? true : (stryCov_9fa48("123862", "123863", "123864"), distributedPlan.tablePlans.get(tableName) || null);
      if (stryMutAct_9fa48("123867") ? !tablePlan && tablePlan.partitions.length === 0 : stryMutAct_9fa48("123866") ? false : stryMutAct_9fa48("123865") ? true : (stryCov_9fa48("123865", "123866", "123867"), (stryMutAct_9fa48("123868") ? tablePlan : (stryCov_9fa48("123868"), !tablePlan)) || (stryMutAct_9fa48("123870") ? tablePlan.partitions.length !== 0 : stryMutAct_9fa48("123869") ? false : (stryCov_9fa48("123869", "123870"), tablePlan.partitions.length === 0)))) {
        if (stryMutAct_9fa48("123871")) {
          {}
        } else {
          stryCov_9fa48("123871");
          return stryMutAct_9fa48("123872") ? {} : (stryCov_9fa48("123872"), {
            success: stryMutAct_9fa48("123873") ? true : (stryCov_9fa48("123873"), false),
            error: stryMutAct_9fa48("123874") ? `` : (stryCov_9fa48("123874"), `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`),
            errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND
          });
        }
      }
      const partitionIds = tablePlan.partitions;
      const writePlan = this.distributedWriteCoordinator.createWritePlan(ast, params, stryMutAct_9fa48("123875") ? {} : (stryCov_9fa48("123875"), {
        sessionId,
        partitionIds
      }));
      this.addTransitionMirrorParticipants(writePlan, ast, tableInfo);
      const writePartitions = Array.from(writePlan.partitionStatements.keys());
      const txState = this.transactionCoordinator.getTransaction(sessionId);
      if (stryMutAct_9fa48("123877") ? false : stryMutAct_9fa48("123876") ? true : (stryCov_9fa48("123876", "123877"), txState)) {
        if (stryMutAct_9fa48("123878")) {
          {}
        } else {
          stryCov_9fa48("123878");
          const payloadHash = this.createWriteOperationPayloadHash(writePlan, QUERY_AST_TYPE.UPDATE);
          const enlistResult = await this.transactionCoordinator.enlistParticipants(sessionId, writePartitions);
          if (stryMutAct_9fa48("123881") ? false : stryMutAct_9fa48("123880") ? true : stryMutAct_9fa48("123879") ? enlistResult.success : (stryCov_9fa48("123879", "123880", "123881"), !enlistResult.success)) {
            if (stryMutAct_9fa48("123882")) {
              {}
            } else {
              stryCov_9fa48("123882");
              return enlistResult;
            }
          }
          await this.transactionCoordinator.recordWriteOperation(sessionId, stryMutAct_9fa48("123883") ? {} : (stryCov_9fa48("123883"), {
            statementType: QUERY_AST_TYPE.UPDATE,
            operationId: writePlan.operationId,
            partitionIds: writePartitions,
            idempotencyKey: writePlan.idempotencyKey,
            payloadHash
          }));
        }
      }
      this.logger.debug(QUERY_LOG_MSG.ROUTING_UPDATE, stryMutAct_9fa48("123884") ? {} : (stryCov_9fa48("123884"), {
        tableName,
        partitionCount: partitionIds.length,
        sessionId
      }));

      // Execute update on resolved partitions
      let result;
      const executionStartTimeMs = Date.now();
      try {
        if (stryMutAct_9fa48("123885")) {
          {}
        } else {
          stryCov_9fa48("123885");
          const deliveryPriority = this.resolveRoutedDeliveryPriority(tableName, queryOptions.deliveryPriority);
          const writeExecutionOptions = stryMutAct_9fa48("123886") ? {} : (stryCov_9fa48("123886"), {
            sessionId,
            deliveryPriority,
            timeoutMs: queryOptions.timeoutMs,
            cancellationToken: stryMutAct_9fa48("123889") ? queryOptions.cancellationToken && null : stryMutAct_9fa48("123888") ? false : stryMutAct_9fa48("123887") ? true : (stryCov_9fa48("123887", "123888", "123889"), queryOptions.cancellationToken || null),
            routingReadinessDimension: stryMutAct_9fa48("123892") ? queryOptions.routingReadinessDimension && this.defaultRoutingReadinessDimension : stryMutAct_9fa48("123891") ? false : stryMutAct_9fa48("123890") ? true : (stryCov_9fa48("123890", "123891", "123892"), queryOptions.routingReadinessDimension || this.defaultRoutingReadinessDimension)
          });
          if (stryMutAct_9fa48("123894") ? false : stryMutAct_9fa48("123893") ? true : (stryCov_9fa48("123893", "123894"), dualWriteMigration)) {
            if (stryMutAct_9fa48("123895")) {
              {}
            } else {
              stryCov_9fa48("123895");
              writeExecutionOptions.dualWriteMode = stryMutAct_9fa48("123896") ? false : (stryCov_9fa48("123896"), true);
              writeExecutionOptions.migrationId = stryMutAct_9fa48("123899") ? (dualWriteMigration.migration_id || dualWriteMigration.migrationId) && null : stryMutAct_9fa48("123898") ? false : stryMutAct_9fa48("123897") ? true : (stryCov_9fa48("123897", "123898", "123899"), (stryMutAct_9fa48("123901") ? dualWriteMigration.migration_id && dualWriteMigration.migrationId : stryMutAct_9fa48("123900") ? false : (stryCov_9fa48("123900", "123901"), dualWriteMigration.migration_id || dualWriteMigration.migrationId)) || null);
            }
          }
          result = await this.distributedWriteCoordinator.executePlan(writePlan, params, writeExecutionOptions);
        }
      } catch (error) {
        if (stryMutAct_9fa48("123902")) {
          {}
        } else {
          stryCov_9fa48("123902");
          if (stryMutAct_9fa48("123904") ? false : stryMutAct_9fa48("123903") ? true : (stryCov_9fa48("123903", "123904"), txState)) {
            if (stryMutAct_9fa48("123905")) {
              {}
            } else {
              stryCov_9fa48("123905");
              await this.transactionCoordinator.markWriteOperationResult(sessionId, writePlan.operationId, stryMutAct_9fa48("123906") ? {} : (stryCov_9fa48("123906"), {
                success: stryMutAct_9fa48("123907") ? true : (stryCov_9fa48("123907"), false),
                error: error.message,
                retryCount: 0
              }));
            }
          } else if (stryMutAct_9fa48("123910") ? false : stryMutAct_9fa48("123909") ? true : stryMutAct_9fa48("123908") ? WRITE_TRACKING_EXCLUDED_TABLES.has(tableName) : (stryCov_9fa48("123908", "123909", "123910"), !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName))) {
            if (stryMutAct_9fa48("123911")) {
              {}
            } else {
              stryCov_9fa48("123911");
              this.fireNonTransactionalWriteResult(writePlan, QUERY_AST_TYPE.UPDATE, stryMutAct_9fa48("123912") ? {} : (stryCov_9fa48("123912"), {
                success: stryMutAct_9fa48("123913") ? true : (stryCov_9fa48("123913"), false),
                error: error.message,
                retryCount: 0
              }));
            }
          }
          throw error;
        }
      }
      const executionDurationMs = stryMutAct_9fa48("123914") ? Date.now() + executionStartTimeMs : (stryCov_9fa48("123914"), Date.now() - executionStartTimeMs);
      if (stryMutAct_9fa48("123916") ? false : stryMutAct_9fa48("123915") ? true : (stryCov_9fa48("123915", "123916"), txState)) {
        if (stryMutAct_9fa48("123917")) {
          {}
        } else {
          stryCov_9fa48("123917");
          await this.transactionCoordinator.markWriteOperationResult(sessionId, writePlan.operationId, result);
        }
      } else if (stryMutAct_9fa48("123920") ? false : stryMutAct_9fa48("123919") ? true : stryMutAct_9fa48("123918") ? WRITE_TRACKING_EXCLUDED_TABLES.has(tableName) : (stryCov_9fa48("123918", "123919", "123920"), !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName))) {
        if (stryMutAct_9fa48("123921")) {
          {}
        } else {
          stryCov_9fa48("123921");
          this.fireNonTransactionalWriteResult(writePlan, QUERY_AST_TYPE.UPDATE, result);
          this.requestManagedSplitEvaluationForWrite(tableName, writePlan, result);
        }
      }
      return stryMutAct_9fa48("123922") ? {} : (stryCov_9fa48("123922"), {
        ...result,
        tableName,
        dualWriteMode: stryMutAct_9fa48("123925") ? dualWriteMigration === null : stryMutAct_9fa48("123924") ? false : stryMutAct_9fa48("123923") ? true : (stryCov_9fa48("123923", "123924", "123925"), dualWriteMigration !== null),
        distributedPlan,
        distributedWritePlan: writePlan,
        distributedDiagnostics: distributedPlan.diagnostics,
        distributedMetrics: stryMutAct_9fa48("123926") ? {} : (stryCov_9fa48("123926"), {
          planningDurationMs,
          executionDurationMs,
          retryCount: stryMutAct_9fa48("123929") ? result.retryCount && 0 : stryMutAct_9fa48("123928") ? false : stryMutAct_9fa48("123927") ? true : (stryCov_9fa48("123927", "123928", "123929"), result.retryCount || 0)
        })
      });
    }
  }

  /**
   * Execute a DELETE statement.
   * @param {Object} ast - Parsed DELETE AST.
   * @param {Array} params - Query parameters.
   * @param {string} sessionId - Session ID.
   * @param {Object} [queryOptions={}] - Query execution options.
   * @return {Promise<Object>} Delete result.
   * @private
   */
  async executeDelete(ast, params, sessionId, queryOptions = {}) {
    if (stryMutAct_9fa48("123930")) {
      {}
    } else {
      stryCov_9fa48("123930");
      const tableName = ast.table;
      const tableInfo = this.getTableInfo(tableName);
      const dualWriteMigration = this.getActiveDualWriteMigration(tableInfo);
      const planningStartTimeMs = Date.now();
      const distributedPlan = this.distributedQueryPlanner.planDelete(ast, params, stryMutAct_9fa48("123931") ? {} : (stryCov_9fa48("123931"), {
        sessionId
      }));
      const planningDurationMs = stryMutAct_9fa48("123932") ? Date.now() + planningStartTimeMs : (stryCov_9fa48("123932"), Date.now() - planningStartTimeMs);
      const tablePlan = stryMutAct_9fa48("123935") ? distributedPlan.tablePlans.get(tableName) && null : stryMutAct_9fa48("123934") ? false : stryMutAct_9fa48("123933") ? true : (stryCov_9fa48("123933", "123934", "123935"), distributedPlan.tablePlans.get(tableName) || null);
      if (stryMutAct_9fa48("123938") ? !tablePlan && tablePlan.partitions.length === 0 : stryMutAct_9fa48("123937") ? false : stryMutAct_9fa48("123936") ? true : (stryCov_9fa48("123936", "123937", "123938"), (stryMutAct_9fa48("123939") ? tablePlan : (stryCov_9fa48("123939"), !tablePlan)) || (stryMutAct_9fa48("123941") ? tablePlan.partitions.length !== 0 : stryMutAct_9fa48("123940") ? false : (stryCov_9fa48("123940", "123941"), tablePlan.partitions.length === 0)))) {
        if (stryMutAct_9fa48("123942")) {
          {}
        } else {
          stryCov_9fa48("123942");
          return stryMutAct_9fa48("123943") ? {} : (stryCov_9fa48("123943"), {
            success: stryMutAct_9fa48("123944") ? true : (stryCov_9fa48("123944"), false),
            error: stryMutAct_9fa48("123945") ? `` : (stryCov_9fa48("123945"), `${QUERY_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableName}`),
            errorCode: QUERY_ERROR_CODE.TABLE_NOT_FOUND
          });
        }
      }
      const partitionIds = tablePlan.partitions;
      const writePlan = this.distributedWriteCoordinator.createWritePlan(ast, params, stryMutAct_9fa48("123946") ? {} : (stryCov_9fa48("123946"), {
        sessionId,
        partitionIds
      }));
      this.addTransitionMirrorParticipants(writePlan, ast, tableInfo);
      const writePartitions = Array.from(writePlan.partitionStatements.keys());
      const txState = this.transactionCoordinator.getTransaction(sessionId);
      if (stryMutAct_9fa48("123948") ? false : stryMutAct_9fa48("123947") ? true : (stryCov_9fa48("123947", "123948"), txState)) {
        if (stryMutAct_9fa48("123949")) {
          {}
        } else {
          stryCov_9fa48("123949");
          const payloadHash = this.createWriteOperationPayloadHash(writePlan, QUERY_AST_TYPE.DELETE);
          const enlistResult = await this.transactionCoordinator.enlistParticipants(sessionId, writePartitions);
          if (stryMutAct_9fa48("123952") ? false : stryMutAct_9fa48("123951") ? true : stryMutAct_9fa48("123950") ? enlistResult.success : (stryCov_9fa48("123950", "123951", "123952"), !enlistResult.success)) {
            if (stryMutAct_9fa48("123953")) {
              {}
            } else {
              stryCov_9fa48("123953");
              return enlistResult;
            }
          }
          await this.transactionCoordinator.recordWriteOperation(sessionId, stryMutAct_9fa48("123954") ? {} : (stryCov_9fa48("123954"), {
            statementType: QUERY_AST_TYPE.DELETE,
            operationId: writePlan.operationId,
            partitionIds: writePartitions,
            idempotencyKey: writePlan.idempotencyKey,
            payloadHash
          }));
        }
      }
      this.logger.debug(QUERY_LOG_MSG.ROUTING_DELETE, stryMutAct_9fa48("123955") ? {} : (stryCov_9fa48("123955"), {
        tableName,
        partitionCount: partitionIds.length,
        sessionId
      }));

      // Execute delete on resolved partitions
      let result;
      const executionStartTimeMs = Date.now();
      try {
        if (stryMutAct_9fa48("123956")) {
          {}
        } else {
          stryCov_9fa48("123956");
          const deliveryPriority = this.resolveRoutedDeliveryPriority(tableName, queryOptions.deliveryPriority);
          const writeExecutionOptions = stryMutAct_9fa48("123957") ? {} : (stryCov_9fa48("123957"), {
            sessionId,
            deliveryPriority,
            timeoutMs: queryOptions.timeoutMs,
            cancellationToken: stryMutAct_9fa48("123960") ? queryOptions.cancellationToken && null : stryMutAct_9fa48("123959") ? false : stryMutAct_9fa48("123958") ? true : (stryCov_9fa48("123958", "123959", "123960"), queryOptions.cancellationToken || null),
            routingReadinessDimension: stryMutAct_9fa48("123963") ? queryOptions.routingReadinessDimension && this.defaultRoutingReadinessDimension : stryMutAct_9fa48("123962") ? false : stryMutAct_9fa48("123961") ? true : (stryCov_9fa48("123961", "123962", "123963"), queryOptions.routingReadinessDimension || this.defaultRoutingReadinessDimension)
          });
          if (stryMutAct_9fa48("123965") ? false : stryMutAct_9fa48("123964") ? true : (stryCov_9fa48("123964", "123965"), dualWriteMigration)) {
            if (stryMutAct_9fa48("123966")) {
              {}
            } else {
              stryCov_9fa48("123966");
              writeExecutionOptions.dualWriteMode = stryMutAct_9fa48("123967") ? false : (stryCov_9fa48("123967"), true);
              writeExecutionOptions.migrationId = stryMutAct_9fa48("123970") ? (dualWriteMigration.migration_id || dualWriteMigration.migrationId) && null : stryMutAct_9fa48("123969") ? false : stryMutAct_9fa48("123968") ? true : (stryCov_9fa48("123968", "123969", "123970"), (stryMutAct_9fa48("123972") ? dualWriteMigration.migration_id && dualWriteMigration.migrationId : stryMutAct_9fa48("123971") ? false : (stryCov_9fa48("123971", "123972"), dualWriteMigration.migration_id || dualWriteMigration.migrationId)) || null);
            }
          }
          result = await this.distributedWriteCoordinator.executePlan(writePlan, params, writeExecutionOptions);
        }
      } catch (error) {
        if (stryMutAct_9fa48("123973")) {
          {}
        } else {
          stryCov_9fa48("123973");
          if (stryMutAct_9fa48("123975") ? false : stryMutAct_9fa48("123974") ? true : (stryCov_9fa48("123974", "123975"), txState)) {
            if (stryMutAct_9fa48("123976")) {
              {}
            } else {
              stryCov_9fa48("123976");
              await this.transactionCoordinator.markWriteOperationResult(sessionId, writePlan.operationId, stryMutAct_9fa48("123977") ? {} : (stryCov_9fa48("123977"), {
                success: stryMutAct_9fa48("123978") ? true : (stryCov_9fa48("123978"), false),
                error: error.message,
                retryCount: 0
              }));
            }
          } else if (stryMutAct_9fa48("123981") ? false : stryMutAct_9fa48("123980") ? true : stryMutAct_9fa48("123979") ? WRITE_TRACKING_EXCLUDED_TABLES.has(tableName) : (stryCov_9fa48("123979", "123980", "123981"), !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName))) {
            if (stryMutAct_9fa48("123982")) {
              {}
            } else {
              stryCov_9fa48("123982");
              this.fireNonTransactionalWriteResult(writePlan, QUERY_AST_TYPE.DELETE, stryMutAct_9fa48("123983") ? {} : (stryCov_9fa48("123983"), {
                success: stryMutAct_9fa48("123984") ? true : (stryCov_9fa48("123984"), false),
                error: error.message,
                retryCount: 0
              }));
            }
          }
          throw error;
        }
      }
      const executionDurationMs = stryMutAct_9fa48("123985") ? Date.now() + executionStartTimeMs : (stryCov_9fa48("123985"), Date.now() - executionStartTimeMs);
      if (stryMutAct_9fa48("123987") ? false : stryMutAct_9fa48("123986") ? true : (stryCov_9fa48("123986", "123987"), txState)) {
        if (stryMutAct_9fa48("123988")) {
          {}
        } else {
          stryCov_9fa48("123988");
          await this.transactionCoordinator.markWriteOperationResult(sessionId, writePlan.operationId, result);
        }
      } else if (stryMutAct_9fa48("123991") ? false : stryMutAct_9fa48("123990") ? true : stryMutAct_9fa48("123989") ? WRITE_TRACKING_EXCLUDED_TABLES.has(tableName) : (stryCov_9fa48("123989", "123990", "123991"), !WRITE_TRACKING_EXCLUDED_TABLES.has(tableName))) {
        if (stryMutAct_9fa48("123992")) {
          {}
        } else {
          stryCov_9fa48("123992");
          this.fireNonTransactionalWriteResult(writePlan, QUERY_AST_TYPE.DELETE, result);
          this.requestManagedSplitEvaluationForWrite(tableName, writePlan, result);
        }
      }
      return stryMutAct_9fa48("123993") ? {} : (stryCov_9fa48("123993"), {
        ...result,
        tableName,
        dualWriteMode: stryMutAct_9fa48("123996") ? dualWriteMigration === null : stryMutAct_9fa48("123995") ? false : stryMutAct_9fa48("123994") ? true : (stryCov_9fa48("123994", "123995", "123996"), dualWriteMigration !== null),
        distributedPlan,
        distributedWritePlan: writePlan,
        distributedDiagnostics: distributedPlan.diagnostics,
        distributedMetrics: stryMutAct_9fa48("123997") ? {} : (stryCov_9fa48("123997"), {
          planningDurationMs,
          executionDurationMs,
          retryCount: stryMutAct_9fa48("124000") ? result.retryCount && 0 : stryMutAct_9fa48("123999") ? false : stryMutAct_9fa48("123998") ? true : (stryCov_9fa48("123998", "123999", "124000"), result.retryCount || 0)
        })
      });
    }
  }

  /**
   * Recover distributed transaction state from system cache snapshots.
   * @private
   */
  recoverDistributedTransactionStateFromCache() {
    if (stryMutAct_9fa48("124001")) {
      {}
    } else {
      stryCov_9fa48("124001");
      if (stryMutAct_9fa48("124004") ? this.transactionStateRecovered && !this.systemCache : stryMutAct_9fa48("124003") ? false : stryMutAct_9fa48("124002") ? true : (stryCov_9fa48("124002", "124003", "124004"), this.transactionStateRecovered || (stryMutAct_9fa48("124005") ? this.systemCache : (stryCov_9fa48("124005"), !this.systemCache)))) {
        if (stryMutAct_9fa48("124006")) {
          {}
        } else {
          stryCov_9fa48("124006");
          return;
        }
      }
      if (stryMutAct_9fa48("124009") ? typeof this.transactionCoordinator.recoverFromSystemTables === 'function' : stryMutAct_9fa48("124008") ? false : stryMutAct_9fa48("124007") ? true : (stryCov_9fa48("124007", "124008", "124009"), typeof this.transactionCoordinator.recoverFromSystemTables !== (stryMutAct_9fa48("124010") ? "" : (stryCov_9fa48("124010"), 'function')))) {
        if (stryMutAct_9fa48("124011")) {
          {}
        } else {
          stryCov_9fa48("124011");
          this.transactionStateRecovered = stryMutAct_9fa48("124012") ? false : (stryCov_9fa48("124012"), true);
          return;
        }
      }
      const transactions = this.loadSystemTableRows(TABLES.SQL_TRANSACTIONS);
      if (stryMutAct_9fa48("124015") ? transactions.length !== 0 : stryMutAct_9fa48("124014") ? false : stryMutAct_9fa48("124013") ? true : (stryCov_9fa48("124013", "124014", "124015"), transactions.length === 0)) {
        if (stryMutAct_9fa48("124016")) {
          {}
        } else {
          stryCov_9fa48("124016");
          return;
        }
      }
      const participants = this.loadSystemTableRows(TABLES.SQL_TRANSACTION_PARTICIPANTS);
      const writeOperations = this.loadSystemTableRows(TABLES.SQL_WRITE_OPERATIONS);
      this.transactionCoordinator.recoverFromSystemTables(stryMutAct_9fa48("124017") ? {} : (stryCov_9fa48("124017"), {
        transactions,
        participants,
        writeOperations
      }));
      this.transactionStateRecovered = stryMutAct_9fa48("124018") ? false : (stryCov_9fa48("124018"), true);
    }
  }

  /**
   * Replay recovered in-flight distributed transactions, if supported.
   * @return {Promise<Object>} Replay summary.
   * @private
   */
  resumeRecoveredDistributedTransactions() {
    if (stryMutAct_9fa48("124019")) {
      {}
    } else {
      stryCov_9fa48("124019");
      if (stryMutAct_9fa48("124022") ? typeof this.transactionCoordinator.resumeRecoveredTransactions === 'function' : stryMutAct_9fa48("124021") ? false : stryMutAct_9fa48("124020") ? true : (stryCov_9fa48("124020", "124021", "124022"), typeof this.transactionCoordinator.resumeRecoveredTransactions !== (stryMutAct_9fa48("124023") ? "" : (stryCov_9fa48("124023"), 'function')))) {
        if (stryMutAct_9fa48("124024")) {
          {}
        } else {
          stryCov_9fa48("124024");
          const summary = createEmptyTransactionRecoveryReplaySummary();
          this.lastTransactionRecoveryReplayResult = summary;
          return Promise.resolve(summary);
        }
      }
      if (stryMutAct_9fa48("124026") ? false : stryMutAct_9fa48("124025") ? true : (stryCov_9fa48("124025", "124026"), this.transactionRecoveryReplayPromise)) {
        if (stryMutAct_9fa48("124027")) {
          {}
        } else {
          stryCov_9fa48("124027");
          return this.transactionRecoveryReplayPromise;
        }
      }
      this.transactionRecoveryReplayPromise = this.transactionCoordinator.resumeRecoveredTransactions().then(summary => {
        if (stryMutAct_9fa48("124028")) {
          {}
        } else {
          stryCov_9fa48("124028");
          const normalizedSummary = stryMutAct_9fa48("124031") ? summary && createEmptyTransactionRecoveryReplaySummary() : stryMutAct_9fa48("124030") ? false : stryMutAct_9fa48("124029") ? true : (stryCov_9fa48("124029", "124030", "124031"), summary || createEmptyTransactionRecoveryReplaySummary());
          this.lastTransactionRecoveryReplayResult = normalizedSummary;
          return normalizedSummary;
        }
      }).catch(error => {
        if (stryMutAct_9fa48("124032")) {
          {}
        } else {
          stryCov_9fa48("124032");
          this.logger.warn(QUERY_LOG_MSG.DISTRIBUTED_TX_RECOVERY_REPLAY_FAILED, stryMutAct_9fa48("124033") ? {} : (stryCov_9fa48("124033"), {
            error: error.message
          }));
          const summary = stryMutAct_9fa48("124034") ? {} : (stryCov_9fa48("124034"), {
            totalRecovered: 0,
            resumed: 0,
            failed: 1,
            results: stryMutAct_9fa48("124035") ? ["Stryker was here"] : (stryCov_9fa48("124035"), []),
            error: error.message
          });
          this.lastTransactionRecoveryReplayResult = summary;
          return summary;
        }
      }).finally(() => {
        if (stryMutAct_9fa48("124036")) {
          {}
        } else {
          stryCov_9fa48("124036");
          this.transactionRecoveryReplayPromise = null;
        }
      });
      return this.transactionRecoveryReplayPromise;
    }
  }

  /**
   * Await currently running transaction recovery replay, if any.
   * @return {Promise<Object>} Replay summary.
   */
  async waitForDistributedTransactionRecoveryReplay() {
    if (stryMutAct_9fa48("124037")) {
      {}
    } else {
      stryCov_9fa48("124037");
      if (stryMutAct_9fa48("124040") ? false : stryMutAct_9fa48("124039") ? true : stryMutAct_9fa48("124038") ? this.transactionRecoveryReplayPromise : (stryCov_9fa48("124038", "124039", "124040"), !this.transactionRecoveryReplayPromise)) {
        if (stryMutAct_9fa48("124041")) {
          {}
        } else {
          stryCov_9fa48("124041");
          return this.lastTransactionRecoveryReplayResult;
        }
      }
      return this.transactionRecoveryReplayPromise;
    }
  }

  /**
   * Load rows for one table from system cache.
   * @param {string} tableName - System table name.
   * @return {Object[]} Cached rows.
   * @private
   */
  loadSystemTableRows(tableName) {
    if (stryMutAct_9fa48("124042")) {
      {}
    } else {
      stryCov_9fa48("124042");
      if (stryMutAct_9fa48("124045") ? false : stryMutAct_9fa48("124044") ? true : stryMutAct_9fa48("124043") ? this.systemCache : (stryCov_9fa48("124043", "124044", "124045"), !this.systemCache)) {
        if (stryMutAct_9fa48("124046")) {
          {}
        } else {
          stryCov_9fa48("124046");
          return stryMutAct_9fa48("124047") ? ["Stryker was here"] : (stryCov_9fa48("124047"), []);
        }
      }
      if (stryMutAct_9fa48("124050") ? typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("124049") ? false : stryMutAct_9fa48("124048") ? true : (stryCov_9fa48("124048", "124049", "124050"), typeof this.systemCache.getAll === (stryMutAct_9fa48("124051") ? "" : (stryCov_9fa48("124051"), 'function')))) {
        if (stryMutAct_9fa48("124052")) {
          {}
        } else {
          stryCov_9fa48("124052");
          return stryMutAct_9fa48("124055") ? this.systemCache.getAll(tableName) && [] : stryMutAct_9fa48("124054") ? false : stryMutAct_9fa48("124053") ? true : (stryCov_9fa48("124053", "124054", "124055"), this.systemCache.getAll(tableName) || (stryMutAct_9fa48("124056") ? ["Stryker was here"] : (stryCov_9fa48("124056"), [])));
        }
      }
      if (stryMutAct_9fa48("124059") ? typeof this.systemCache.filter !== 'function' : stryMutAct_9fa48("124058") ? false : stryMutAct_9fa48("124057") ? true : (stryCov_9fa48("124057", "124058", "124059"), typeof this.systemCache.filter === (stryMutAct_9fa48("124060") ? "" : (stryCov_9fa48("124060"), 'function')))) {
        if (stryMutAct_9fa48("124061")) {
          {}
        } else {
          stryCov_9fa48("124061");
          return stryMutAct_9fa48("124064") ? this.systemCache.filter(tableName, () => true) && [] : stryMutAct_9fa48("124063") ? false : stryMutAct_9fa48("124062") ? true : (stryCov_9fa48("124062", "124063", "124064"), (stryMutAct_9fa48("124065") ? this.systemCache : (stryCov_9fa48("124065"), this.systemCache.filter(tableName, stryMutAct_9fa48("124066") ? () => undefined : (stryCov_9fa48("124066"), () => stryMutAct_9fa48("124067") ? false : (stryCov_9fa48("124067"), true))))) || (stryMutAct_9fa48("124068") ? ["Stryker was here"] : (stryCov_9fa48("124068"), [])));
        }
      }
      return stryMutAct_9fa48("124069") ? ["Stryker was here"] : (stryCov_9fa48("124069"), []);
    }
  }

  /**
   * Load distributed transaction recovery rows from system cache snapshots.
   * @return {{transactions: Object[], participants: Object[], writeOperations: Object[]}}
   *   Recovery payload.
   * @private
   */
  loadDistributedTransactionRecoveryState() {
    if (stryMutAct_9fa48("124070")) {
      {}
    } else {
      stryCov_9fa48("124070");
      return stryMutAct_9fa48("124071") ? {} : (stryCov_9fa48("124071"), {
        transactions: this.loadSystemTableRows(TABLES.SQL_TRANSACTIONS),
        participants: this.loadSystemTableRows(TABLES.SQL_TRANSACTION_PARTICIPANTS),
        writeOperations: this.loadSystemTableRows(TABLES.SQL_WRITE_OPERATIONS)
      });
    }
  }

  /**
   * Check whether distributed transaction metadata can be persisted through the
   * canonical control-plane mutation ingress.
   * @return {boolean}
   * @private
   */
  canPersistDistributedTransactionState() {
    if (stryMutAct_9fa48("124072")) {
      {}
    } else {
      stryCov_9fa48("124072");
      const gateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("124075") ? typeof gateway?.supportsMutationSubmission !== 'function' : stryMutAct_9fa48("124074") ? false : stryMutAct_9fa48("124073") ? true : (stryCov_9fa48("124073", "124074", "124075"), typeof (stryMutAct_9fa48("124076") ? gateway.supportsMutationSubmission : (stryCov_9fa48("124076"), gateway?.supportsMutationSubmission)) === (stryMutAct_9fa48("124077") ? "" : (stryCov_9fa48("124077"), 'function')))) {
        if (stryMutAct_9fa48("124078")) {
          {}
        } else {
          stryCov_9fa48("124078");
          return gateway.supportsMutationSubmission();
        }
      }
      return Boolean(this.cdcIntegrationService);
    }
  }

  /**
   * Build canonical mutation options for distributed transaction metadata.
   * Transaction state writes are durable-control-plane metadata and must not
   * fail on read-model cache lag under pressure.
   *
   * @param {string} tableName
   * @param {Object} [options={}]
   * @param {string|null} [options.coalescingKey]
   * @param {string} [options.workClass]
   * @return {Object}
   * @private
   */
  buildDistributedTransactionMutationOptions(tableName, options = {}) {
    if (stryMutAct_9fa48("124079")) {
      {}
    } else {
      stryCov_9fa48("124079");
      const mutationOptions = stryMutAct_9fa48("124080") ? {} : (stryCov_9fa48("124080"), {
        workClass: stryMutAct_9fa48("124083") ? options?.workClass && PRESSURE_WORK_CLASS.CRITICAL : stryMutAct_9fa48("124082") ? false : stryMutAct_9fa48("124081") ? true : (stryCov_9fa48("124081", "124082", "124083"), (stryMutAct_9fa48("124084") ? options.workClass : (stryCov_9fa48("124084"), options?.workClass)) || PRESSURE_WORK_CLASS.CRITICAL),
        deliveryPriority: this.resolveRoutedDeliveryPriority(tableName),
        skipCacheWait: stryMutAct_9fa48("124085") ? false : (stryCov_9fa48("124085"), true),
        mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING
      });
      const coalescingKey = (stryMutAct_9fa48("124088") ? typeof options?.coalescingKey !== 'string' : stryMutAct_9fa48("124087") ? false : stryMutAct_9fa48("124086") ? true : (stryCov_9fa48("124086", "124087", "124088"), typeof (stryMutAct_9fa48("124089") ? options.coalescingKey : (stryCov_9fa48("124089"), options?.coalescingKey)) === (stryMutAct_9fa48("124090") ? "" : (stryCov_9fa48("124090"), 'string')))) ? options.coalescingKey : stryMutAct_9fa48("124091") ? "Stryker was here!" : (stryCov_9fa48("124091"), '');
      if (stryMutAct_9fa48("124095") ? coalescingKey.length <= 0 : stryMutAct_9fa48("124094") ? coalescingKey.length >= 0 : stryMutAct_9fa48("124093") ? false : stryMutAct_9fa48("124092") ? true : (stryCov_9fa48("124092", "124093", "124094", "124095"), coalescingKey.length > 0)) {
        if (stryMutAct_9fa48("124096")) {
          {}
        } else {
          stryCov_9fa48("124096");
          mutationOptions.coalescingKey = coalescingKey;
        }
      }
      return mutationOptions;
    }
  }

  /**
   * Persist one distributed transaction row.
   * @param {Object} record - Transaction persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedTransactionRow(record) {
    if (stryMutAct_9fa48("124097")) {
      {}
    } else {
      stryCov_9fa48("124097");
      if (stryMutAct_9fa48("124100") ? false : stryMutAct_9fa48("124099") ? true : stryMutAct_9fa48("124098") ? this.canPersistDistributedTransactionState() : (stryCov_9fa48("124098", "124099", "124100"), !this.canPersistDistributedTransactionState())) {
        if (stryMutAct_9fa48("124101")) {
          {}
        } else {
          stryCov_9fa48("124101");
          return;
        }
      }
      const transactionId = stryMutAct_9fa48("124102") ? String(record?.transactionId || '') : (stryCov_9fa48("124102"), String(stryMutAct_9fa48("124105") ? record?.transactionId && '' : stryMutAct_9fa48("124104") ? false : stryMutAct_9fa48("124103") ? true : (stryCov_9fa48("124103", "124104", "124105"), (stryMutAct_9fa48("124106") ? record.transactionId : (stryCov_9fa48("124106"), record?.transactionId)) || (stryMutAct_9fa48("124107") ? "Stryker was here!" : (stryCov_9fa48("124107"), '')))).trim());
      await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("124108") ? {} : (stryCov_9fa48("124108"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.SQL_TRANSACTIONS,
        row: stryMutAct_9fa48("124109") ? {} : (stryCov_9fa48("124109"), {
          transaction_id: transactionId,
          session_id: record.sessionId,
          status: record.status,
          transaction_epoch: record.transactionEpoch,
          timeout_deadline: record.timeoutDeadline,
          created_at: record.createdAt,
          updated_at: record.updatedAt
        })
      }), this.buildDistributedTransactionMutationOptions(TABLES.SQL_TRANSACTIONS, stryMutAct_9fa48("124110") ? {} : (stryCov_9fa48("124110"), {
        // Durable transaction state must bypass interactive admission
        // pressure, but it still stays on the background transport lane so
        // replica and topology settlement keep the reserved critical queue
        // capacity.
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        coalescingKey: (stryMutAct_9fa48("124114") ? transactionId.length <= 0 : stryMutAct_9fa48("124113") ? transactionId.length >= 0 : stryMutAct_9fa48("124112") ? false : stryMutAct_9fa48("124111") ? true : (stryCov_9fa48("124111", "124112", "124113", "124114"), transactionId.length > 0)) ? stryMutAct_9fa48("124115") ? `` : (stryCov_9fa48("124115"), `sql-transaction:${transactionId}`) : null
      })));
    }
  }

  /**
   * Persist one distributed transaction participant row.
   * @param {Object} record - Participant persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedTransactionParticipantRow(record) {
    if (stryMutAct_9fa48("124116")) {
      {}
    } else {
      stryCov_9fa48("124116");
      if (stryMutAct_9fa48("124119") ? false : stryMutAct_9fa48("124118") ? true : stryMutAct_9fa48("124117") ? this.canPersistDistributedTransactionState() : (stryCov_9fa48("124117", "124118", "124119"), !this.canPersistDistributedTransactionState())) {
        if (stryMutAct_9fa48("124120")) {
          {}
        } else {
          stryCov_9fa48("124120");
          return;
        }
      }
      const participantId = stryMutAct_9fa48("124121") ? String(record?.participantId || '') : (stryCov_9fa48("124121"), String(stryMutAct_9fa48("124124") ? record?.participantId && '' : stryMutAct_9fa48("124123") ? false : stryMutAct_9fa48("124122") ? true : (stryCov_9fa48("124122", "124123", "124124"), (stryMutAct_9fa48("124125") ? record.participantId : (stryCov_9fa48("124125"), record?.participantId)) || (stryMutAct_9fa48("124126") ? "Stryker was here!" : (stryCov_9fa48("124126"), '')))).trim());
      const transactionId = stryMutAct_9fa48("124127") ? String(record?.transactionId || '') : (stryCov_9fa48("124127"), String(stryMutAct_9fa48("124130") ? record?.transactionId && '' : stryMutAct_9fa48("124129") ? false : stryMutAct_9fa48("124128") ? true : (stryCov_9fa48("124128", "124129", "124130"), (stryMutAct_9fa48("124131") ? record.transactionId : (stryCov_9fa48("124131"), record?.transactionId)) || (stryMutAct_9fa48("124132") ? "Stryker was here!" : (stryCov_9fa48("124132"), '')))).trim());
      await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("124133") ? {} : (stryCov_9fa48("124133"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.SQL_TRANSACTION_PARTICIPANTS,
        row: stryMutAct_9fa48("124134") ? {} : (stryCov_9fa48("124134"), {
          participant_id: participantId,
          transaction_id: transactionId,
          partition_id: record.partitionId,
          status: record.status,
          last_error: record.lastError,
          created_at: record.createdAt,
          updated_at: record.updatedAt
        })
      }), this.buildDistributedTransactionMutationOptions(TABLES.SQL_TRANSACTION_PARTICIPANTS, stryMutAct_9fa48("124135") ? {} : (stryCov_9fa48("124135"), {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        coalescingKey: (stryMutAct_9fa48("124139") ? participantId.length <= 0 : stryMutAct_9fa48("124138") ? participantId.length >= 0 : stryMutAct_9fa48("124137") ? false : stryMutAct_9fa48("124136") ? true : (stryCov_9fa48("124136", "124137", "124138", "124139"), participantId.length > 0)) ? stryMutAct_9fa48("124140") ? `` : (stryCov_9fa48("124140"), `sql-transaction-participant:${participantId}`) : null
      })));
    }
  }

  /**
   * Persist one distributed write operation row.
   * @param {Object} record - Write operation persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedWriteOperationRow(record) {
    if (stryMutAct_9fa48("124141")) {
      {}
    } else {
      stryCov_9fa48("124141");
      if (stryMutAct_9fa48("124144") ? false : stryMutAct_9fa48("124143") ? true : stryMutAct_9fa48("124142") ? this.canPersistDistributedTransactionState() : (stryCov_9fa48("124142", "124143", "124144"), !this.canPersistDistributedTransactionState())) {
        if (stryMutAct_9fa48("124145")) {
          {}
        } else {
          stryCov_9fa48("124145");
          return;
        }
      }
      const operationId = stryMutAct_9fa48("124146") ? String(record?.operationId || '') : (stryCov_9fa48("124146"), String(stryMutAct_9fa48("124149") ? record?.operationId && '' : stryMutAct_9fa48("124148") ? false : stryMutAct_9fa48("124147") ? true : (stryCov_9fa48("124147", "124148", "124149"), (stryMutAct_9fa48("124150") ? record.operationId : (stryCov_9fa48("124150"), record?.operationId)) || (stryMutAct_9fa48("124151") ? "Stryker was here!" : (stryCov_9fa48("124151"), '')))).trim());
      const transactionId = stryMutAct_9fa48("124152") ? String(record?.transactionId || '') : (stryCov_9fa48("124152"), String(stryMutAct_9fa48("124155") ? record?.transactionId && '' : stryMutAct_9fa48("124154") ? false : stryMutAct_9fa48("124153") ? true : (stryCov_9fa48("124153", "124154", "124155"), (stryMutAct_9fa48("124156") ? record.transactionId : (stryCov_9fa48("124156"), record?.transactionId)) || (stryMutAct_9fa48("124157") ? "Stryker was here!" : (stryCov_9fa48("124157"), '')))).trim());
      await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("124158") ? {} : (stryCov_9fa48("124158"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.SQL_WRITE_OPERATIONS,
        row: stryMutAct_9fa48("124159") ? {} : (stryCov_9fa48("124159"), {
          operation_id: operationId,
          transaction_id: stryMutAct_9fa48("124162") ? transactionId && null : stryMutAct_9fa48("124161") ? false : stryMutAct_9fa48("124160") ? true : (stryCov_9fa48("124160", "124161", "124162"), transactionId || null),
          statement_type: record.statementType,
          status: record.status,
          idempotency_key: record.idempotencyKey,
          payload_hash: record.payloadHash,
          retry_count: stryMutAct_9fa48("124165") ? record.retryCount && 0 : stryMutAct_9fa48("124164") ? false : stryMutAct_9fa48("124163") ? true : (stryCov_9fa48("124163", "124164", "124165"), record.retryCount || 0),
          last_error: stryMutAct_9fa48("124168") ? record.lastError && null : stryMutAct_9fa48("124167") ? false : stryMutAct_9fa48("124166") ? true : (stryCov_9fa48("124166", "124167", "124168"), record.lastError || null),
          partition_ids: JSON.stringify(stryMutAct_9fa48("124171") ? record.partitionIds && [] : stryMutAct_9fa48("124170") ? false : stryMutAct_9fa48("124169") ? true : (stryCov_9fa48("124169", "124170", "124171"), record.partitionIds || (stryMutAct_9fa48("124172") ? ["Stryker was here"] : (stryCov_9fa48("124172"), [])))),
          created_at: record.createdAt,
          updated_at: record.updatedAt
        })
      }), this.buildDistributedTransactionMutationOptions(TABLES.SQL_WRITE_OPERATIONS, stryMutAct_9fa48("124173") ? {} : (stryCov_9fa48("124173"), {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        coalescingKey: (stryMutAct_9fa48("124177") ? operationId.length <= 0 : stryMutAct_9fa48("124176") ? operationId.length >= 0 : stryMutAct_9fa48("124175") ? false : stryMutAct_9fa48("124174") ? true : (stryCov_9fa48("124174", "124175", "124176", "124177"), operationId.length > 0)) ? stryMutAct_9fa48("124178") ? `` : (stryCov_9fa48("124178"), `sql-write-operation:${operationId}`) : null
      })));
    }
  }

  /**
   * Persist a distributed write operation not associated with a transaction.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @return {Promise<void>}
   * @private
   */
  /**
   * Fire-and-forget: persist only failed non-transactional distributed writes.
   * Successful non-transactional writes are not used by recovery and would
   * otherwise convert high-throughput user traffic into extra control-plane
   * replication on sql_write_operations.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @param {Object} result - Write result.
   * @private
   */
  fireNonTransactionalWriteResult(writePlan, statementType, result) {
    if (stryMutAct_9fa48("124179")) {
      {}
    } else {
      stryCov_9fa48("124179");
      if (stryMutAct_9fa48("124182") ? result?.success !== true : stryMutAct_9fa48("124181") ? false : stryMutAct_9fa48("124180") ? true : (stryCov_9fa48("124180", "124181", "124182"), (stryMutAct_9fa48("124183") ? result.success : (stryCov_9fa48("124183"), result?.success)) === (stryMutAct_9fa48("124184") ? false : (stryCov_9fa48("124184"), true)))) {
        if (stryMutAct_9fa48("124185")) {
          {}
        } else {
          stryCov_9fa48("124185");
          return;
        }
      }
      const now = Date.now();
      this.persistDistributedWriteOperationRow(stryMutAct_9fa48("124186") ? {} : (stryCov_9fa48("124186"), {
        operationId: writePlan.operationId,
        transactionId: null,
        statementType,
        status: WRITE_OPERATION_STATUS.FAILED,
        idempotencyKey: writePlan.idempotencyKey,
        payloadHash: this.createWriteOperationPayloadHash(writePlan, statementType),
        partitionIds: Array.from(writePlan.partitionStatements.keys()),
        retryCount: this.resolveWriteResultRetryCount(result),
        lastError: stryMutAct_9fa48("124189") ? result?.error && null : stryMutAct_9fa48("124188") ? false : stryMutAct_9fa48("124187") ? true : (stryCov_9fa48("124187", "124188", "124189"), (stryMutAct_9fa48("124190") ? result.error : (stryCov_9fa48("124190"), result?.error)) || null),
        createdAt: now,
        updatedAt: now
      })).catch(error => {
        if (stryMutAct_9fa48("124191")) {
          {}
        } else {
          stryCov_9fa48("124191");
          this.logger.warn(QUERY_LOG_MSG.WRITE_OP_PERSIST_FAILED, stryMutAct_9fa48("124192") ? {} : (stryCov_9fa48("124192"), {
            operationId: writePlan.operationId,
            statementType,
            status: WRITE_OPERATION_STATUS.FAILED,
            error: error.message
          }));
        }
      });
    }
  }

  /**
   * Build deterministic payload hash for distributed write persistence.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @return {string} Payload hash.
   * @private
   */
  createWriteOperationPayloadHash(writePlan, statementType) {
    if (stryMutAct_9fa48("124193")) {
      {}
    } else {
      stryCov_9fa48("124193");
      const payload = JSON.stringify(stryMutAct_9fa48("124194") ? {} : (stryCov_9fa48("124194"), {
        operationId: writePlan.operationId,
        statementType,
        partitionIds: stryMutAct_9fa48("124195") ? Array.from(writePlan.partitionStatements.keys()) : (stryCov_9fa48("124195"), Array.from(writePlan.partitionStatements.keys()).sort())
      }));
      return createHash(stryMutAct_9fa48("124196") ? "" : (stryCov_9fa48("124196"), 'sha1')).update(payload).digest(stryMutAct_9fa48("124197") ? "" : (stryCov_9fa48("124197"), 'hex'));
    }
  }

  /**
   * Resolve total retry count from a write result payload.
   * @param {Object} result - Distributed write result.
   * @return {number} Retry count.
   * @private
   */
  resolveWriteResultRetryCount(result) {
    if (stryMutAct_9fa48("124198")) {
      {}
    } else {
      stryCov_9fa48("124198");
      if (stryMutAct_9fa48("124200") ? false : stryMutAct_9fa48("124199") ? true : (stryCov_9fa48("124199", "124200"), Number.isInteger(stryMutAct_9fa48("124201") ? result.retryCount : (stryCov_9fa48("124201"), result?.retryCount)))) {
        if (stryMutAct_9fa48("124202")) {
          {}
        } else {
          stryCov_9fa48("124202");
          return result.retryCount;
        }
      }
      if (stryMutAct_9fa48("124205") ? false : stryMutAct_9fa48("124204") ? true : stryMutAct_9fa48("124203") ? Array.isArray(result?.participantResults) : (stryCov_9fa48("124203", "124204", "124205"), !Array.isArray(stryMutAct_9fa48("124206") ? result.participantResults : (stryCov_9fa48("124206"), result?.participantResults)))) {
        if (stryMutAct_9fa48("124207")) {
          {}
        } else {
          stryCov_9fa48("124207");
          return 0;
        }
      }
      return result.participantResults.reduce((sum, entry) => {
        if (stryMutAct_9fa48("124208")) {
          {}
        } else {
          stryCov_9fa48("124208");
          const attempts = Number.isInteger(entry.attempts) ? entry.attempts : 1;
          return stryMutAct_9fa48("124209") ? sum - Math.max(attempts - 1, 0) : (stryCov_9fa48("124209"), sum + (stryMutAct_9fa48("124210") ? Math.min(attempts - 1, 0) : (stryCov_9fa48("124210"), Math.max(stryMutAct_9fa48("124211") ? attempts + 1 : (stryCov_9fa48("124211"), attempts - 1), 0))));
        }
      }, 0);
    }
  }

  /**
   * Handle BEGIN TRANSACTION.
   * @param {string} sessionId - Session ID for tracking.
   * @return {Object} Transaction result.
   * @private
   */
  handleBeginTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    if (stryMutAct_9fa48("124212")) {
      {}
    } else {
      stryCov_9fa48("124212");
      this.logger.debug(QUERY_LOG_MSG.BEGIN_TRANSACTION, stryMutAct_9fa48("124213") ? {} : (stryCov_9fa48("124213"), {
        sessionId
      }));
      return this.transactionCoordinator.begin(sessionId);
    }
  }

  /**
   * Handle COMMIT.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async handleCommit(sessionId = QUERY_SESSION.DEFAULT) {
    if (stryMutAct_9fa48("124214")) {
      {}
    } else {
      stryCov_9fa48("124214");
      const txState = this.transactionCoordinator.getTransaction(sessionId);
      this.logger.debug(QUERY_LOG_MSG.COMMIT, stryMutAct_9fa48("124215") ? {} : (stryCov_9fa48("124215"), {
        sessionId,
        participants: stryMutAct_9fa48("124218") ? txState?.participants && [] : stryMutAct_9fa48("124217") ? false : stryMutAct_9fa48("124216") ? true : (stryCov_9fa48("124216", "124217", "124218"), (stryMutAct_9fa48("124219") ? txState.participants : (stryCov_9fa48("124219"), txState?.participants)) || (stryMutAct_9fa48("124220") ? ["Stryker was here"] : (stryCov_9fa48("124220"), [])))
      }));
      const result = await this.transactionCoordinator.commit(sessionId);
      if (stryMutAct_9fa48("124223") ? !result.success || !result.errorCode : stryMutAct_9fa48("124222") ? false : stryMutAct_9fa48("124221") ? true : (stryCov_9fa48("124221", "124222", "124223"), (stryMutAct_9fa48("124224") ? result.success : (stryCov_9fa48("124224"), !result.success)) && (stryMutAct_9fa48("124225") ? result.errorCode : (stryCov_9fa48("124225"), !result.errorCode)))) {
        if (stryMutAct_9fa48("124226")) {
          {}
        } else {
          stryCov_9fa48("124226");
          return stryMutAct_9fa48("124227") ? {} : (stryCov_9fa48("124227"), {
            ...result,
            errorCode: QUERY_ERROR_CODE.COMMIT_FAILED,
            error: QUERY_ERROR_MSG.COMMIT_FAILED
          });
        }
      }
      return result;
    }
  }

  /**
   * Handle ROLLBACK.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async handleRollback(sessionId = QUERY_SESSION.DEFAULT) {
    if (stryMutAct_9fa48("124228")) {
      {}
    } else {
      stryCov_9fa48("124228");
      const txState = this.transactionCoordinator.getTransaction(sessionId);
      this.logger.debug(QUERY_LOG_MSG.ROLLBACK, stryMutAct_9fa48("124229") ? {} : (stryCov_9fa48("124229"), {
        sessionId,
        participants: stryMutAct_9fa48("124232") ? txState?.participants && [] : stryMutAct_9fa48("124231") ? false : stryMutAct_9fa48("124230") ? true : (stryCov_9fa48("124230", "124231", "124232"), (stryMutAct_9fa48("124233") ? txState.participants : (stryCov_9fa48("124233"), txState?.participants)) || (stryMutAct_9fa48("124234") ? ["Stryker was here"] : (stryCov_9fa48("124234"), [])))
      }));
      const result = await this.transactionCoordinator.rollback(sessionId);
      if (stryMutAct_9fa48("124237") ? !result.success || !result.errorCode : stryMutAct_9fa48("124236") ? false : stryMutAct_9fa48("124235") ? true : (stryCov_9fa48("124235", "124236", "124237"), (stryMutAct_9fa48("124238") ? result.success : (stryCov_9fa48("124238"), !result.success)) && (stryMutAct_9fa48("124239") ? result.errorCode : (stryCov_9fa48("124239"), !result.errorCode)))) {
        if (stryMutAct_9fa48("124240")) {
          {}
        } else {
          stryCov_9fa48("124240");
          return stryMutAct_9fa48("124241") ? {} : (stryCov_9fa48("124241"), {
            ...result,
            errorCode: QUERY_ERROR_CODE.ROLLBACK_FAILED,
            error: QUERY_ERROR_MSG.ROLLBACK_FAILED
          });
        }
      }
      return result;
    }
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} True if transaction is active.
   */
  hasActiveTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    if (stryMutAct_9fa48("124242")) {
      {}
    } else {
      stryCov_9fa48("124242");
      return this.transactionCoordinator.hasActiveTransaction(sessionId);
    }
  }

  /**
   * Get the partition bound to a transaction.
   * @param {string} sessionId - Session ID.
   * @return {string|null} Partition ID or null.
   */
  getTransactionPartition(sessionId = QUERY_SESSION.DEFAULT) {
    if (stryMutAct_9fa48("124243")) {
      {}
    } else {
      stryCov_9fa48("124243");
      const txState = this.transactionCoordinator.getTransaction(sessionId);
      return stryMutAct_9fa48("124246") ? txState?.participants?.[0] && null : stryMutAct_9fa48("124245") ? false : stryMutAct_9fa48("124244") ? true : (stryCov_9fa48("124244", "124245", "124246"), (stryMutAct_9fa48("124248") ? txState.participants?.[0] : stryMutAct_9fa48("124247") ? txState?.participants[0] : (stryCov_9fa48("124247", "124248"), txState?.participants?.[0])) || null);
    }
  }

  /**
   * Bind a transaction to a partition (on first write).
   * Transactions are routed through message router like all other operations.
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async bindTransactionToPartition(sessionId, partitionId) {
    if (stryMutAct_9fa48("124249")) {
      {}
    } else {
      stryCov_9fa48("124249");
      const result = await this.transactionCoordinator.enlistParticipants(sessionId, stryMutAct_9fa48("124250") ? [] : (stryCov_9fa48("124250"), [partitionId]));
      if (stryMutAct_9fa48("124253") ? false : stryMutAct_9fa48("124252") ? true : stryMutAct_9fa48("124251") ? result.success : (stryCov_9fa48("124251", "124252", "124253"), !result.success)) {
        if (stryMutAct_9fa48("124254")) {
          {}
        } else {
          stryCov_9fa48("124254");
          throw new Error(stryMutAct_9fa48("124257") ? result.error && QUERY_ERROR_MSG.BEGIN_FAILED : stryMutAct_9fa48("124256") ? false : stryMutAct_9fa48("124255") ? true : (stryCov_9fa48("124255", "124256", "124257"), result.error || QUERY_ERROR_MSG.BEGIN_FAILED));
        }
      }
    }
  }

  /**
   * Resolve the routing readiness dimension for transaction control delivery.
   * Priority control-plane partitions must stay routable during recovery so
   * distributed transaction replay can complete even while normal serve traffic
   * is still blocked.
   * @param {string} partitionId - Partition ID.
   * @return {string}
   * @private
   */
  resolveTransactionOperationRoutingReadinessDimension(partitionId) {
    if (stryMutAct_9fa48("124258")) {
      {}
    } else {
      stryCov_9fa48("124258");
      if (stryMutAct_9fa48("124260") ? false : stryMutAct_9fa48("124259") ? true : (stryCov_9fa48("124259", "124260"), isPriorityControlPlanePartition(stryMutAct_9fa48("124261") ? {} : (stryCov_9fa48("124261"), {
        partitionId
      })))) {
        if (stryMutAct_9fa48("124262")) {
          {}
        } else {
          stryCov_9fa48("124262");
          return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
        }
      }
      return stryMutAct_9fa48("124265") ? this.queryExecutor?.defaultRoutingReadinessDimension && CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE : stryMutAct_9fa48("124264") ? false : stryMutAct_9fa48("124263") ? true : (stryCov_9fa48("124263", "124264", "124265"), (stryMutAct_9fa48("124266") ? this.queryExecutor.defaultRoutingReadinessDimension : (stryCov_9fa48("124266"), this.queryExecutor?.defaultRoutingReadinessDimension)) || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE);
    }
  }

  /**
   * Deliver one transaction control operation to a partition service.
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @param {string} operation - Transaction operation.
   * @param {Object} [options] - Delivery options.
   * @param {number} [options.transactionEpoch] - Snapshot epoch.
   * @return {Promise<void>}
   * @private
   */
  async deliverTransactionOperation(sessionId, partitionId, operation, options = {}) {
    if (stryMutAct_9fa48("124267")) {
      {}
    } else {
      stryCov_9fa48("124267");
      const routingReadinessDimension = this.resolveTransactionOperationRoutingReadinessDimension(partitionId);
      const payload = stryMutAct_9fa48("124268") ? {} : (stryCov_9fa48("124268"), {
        type: QUERY_OPERATION.TRANSACTION,
        operation,
        sessionId
      });
      if (stryMutAct_9fa48("124270") ? false : stryMutAct_9fa48("124269") ? true : (stryCov_9fa48("124269", "124270"), Number.isFinite(options.transactionEpoch))) {
        if (stryMutAct_9fa48("124271")) {
          {}
        } else {
          stryCov_9fa48("124271");
          payload.transactionEpoch = Math.floor(options.transactionEpoch);
        }
      }
      const result = await this.queryExecutor.executeOnPartition(partitionId, stryMutAct_9fa48("124272") ? "Stryker was here!" : (stryCov_9fa48("124272"), ''), stryMutAct_9fa48("124273") ? ["Stryker was here"] : (stryCov_9fa48("124273"), []), stryMutAct_9fa48("124274") ? true : (stryCov_9fa48("124274"), false), stryMutAct_9fa48("124275") ? true : (stryCov_9fa48("124275"), false), stryMutAct_9fa48("124276") ? true : (stryCov_9fa48("124276"), false), stryMutAct_9fa48("124277") ? {} : (stryCov_9fa48("124277"), {
        buildRequest: stryMutAct_9fa48("124278") ? () => undefined : (stryCov_9fa48("124278"), () => stryMutAct_9fa48("124279") ? {} : (stryCov_9fa48("124279"), {
          ...payload
        })),
        buildSuccessResult: stryMutAct_9fa48("124280") ? () => undefined : (stryCov_9fa48("124280"), () => stryMutAct_9fa48("124281") ? {} : (stryCov_9fa48("124281"), {
          success: stryMutAct_9fa48("124282") ? false : (stryCov_9fa48("124282"), true)
        })),
        isSuccessfulResponse: stryMutAct_9fa48("124283") ? () => undefined : (stryCov_9fa48("124283"), response => stryMutAct_9fa48("124286") ? response?.acknowledged === true || response?.success === true : stryMutAct_9fa48("124285") ? false : stryMutAct_9fa48("124284") ? true : (stryCov_9fa48("124284", "124285", "124286"), (stryMutAct_9fa48("124288") ? response?.acknowledged !== true : stryMutAct_9fa48("124287") ? true : (stryCov_9fa48("124287", "124288"), (stryMutAct_9fa48("124289") ? response.acknowledged : (stryCov_9fa48("124289"), response?.acknowledged)) === (stryMutAct_9fa48("124290") ? false : (stryCov_9fa48("124290"), true)))) && (stryMutAct_9fa48("124292") ? response?.success !== true : stryMutAct_9fa48("124291") ? true : (stryCov_9fa48("124291", "124292"), (stryMutAct_9fa48("124293") ? response.success : (stryCov_9fa48("124293"), response?.success)) === (stryMutAct_9fa48("124294") ? false : (stryCov_9fa48("124294"), true)))))),
        routingReadinessDimension,
        clearSessionPartitionAffinityOnSuccess: stryMutAct_9fa48("124297") ? operation === QUERY_OPERATION.COMMIT && operation === QUERY_OPERATION.ROLLBACK : stryMutAct_9fa48("124296") ? false : stryMutAct_9fa48("124295") ? true : (stryCov_9fa48("124295", "124296", "124297"), (stryMutAct_9fa48("124299") ? operation !== QUERY_OPERATION.COMMIT : stryMutAct_9fa48("124298") ? false : (stryCov_9fa48("124298", "124299"), operation === QUERY_OPERATION.COMMIT)) || (stryMutAct_9fa48("124301") ? operation !== QUERY_OPERATION.ROLLBACK : stryMutAct_9fa48("124300") ? false : (stryCov_9fa48("124300", "124301"), operation === QUERY_OPERATION.ROLLBACK)))
      }));
      if (stryMutAct_9fa48("124304") ? false : stryMutAct_9fa48("124303") ? true : stryMutAct_9fa48("124302") ? result.success : (stryCov_9fa48("124302", "124303", "124304"), !result.success)) {
        if (stryMutAct_9fa48("124305")) {
          {}
        } else {
          stryCov_9fa48("124305");
          if (stryMutAct_9fa48("124308") ? operation !== QUERY_OPERATION.BEGIN : stryMutAct_9fa48("124307") ? false : stryMutAct_9fa48("124306") ? true : (stryCov_9fa48("124306", "124307", "124308"), operation === QUERY_OPERATION.BEGIN)) {
            if (stryMutAct_9fa48("124309")) {
              {}
            } else {
              stryCov_9fa48("124309");
              throw new Error(stryMutAct_9fa48("124312") ? result.error && QUERY_ERROR_MSG.BEGIN_FAILED : stryMutAct_9fa48("124311") ? false : stryMutAct_9fa48("124310") ? true : (stryCov_9fa48("124310", "124311", "124312"), result.error || QUERY_ERROR_MSG.BEGIN_FAILED));
            }
          }
          if (stryMutAct_9fa48("124315") ? operation !== QUERY_OPERATION.PREPARE : stryMutAct_9fa48("124314") ? false : stryMutAct_9fa48("124313") ? true : (stryCov_9fa48("124313", "124314", "124315"), operation === QUERY_OPERATION.PREPARE)) {
            if (stryMutAct_9fa48("124316")) {
              {}
            } else {
              stryCov_9fa48("124316");
              throw new Error(stryMutAct_9fa48("124319") ? result.error && QUERY_ERROR_MSG.PREPARE_FAILED : stryMutAct_9fa48("124318") ? false : stryMutAct_9fa48("124317") ? true : (stryCov_9fa48("124317", "124318", "124319"), result.error || QUERY_ERROR_MSG.PREPARE_FAILED));
            }
          }
          if (stryMutAct_9fa48("124322") ? operation !== QUERY_OPERATION.COMMIT : stryMutAct_9fa48("124321") ? false : stryMutAct_9fa48("124320") ? true : (stryCov_9fa48("124320", "124321", "124322"), operation === QUERY_OPERATION.COMMIT)) {
            if (stryMutAct_9fa48("124323")) {
              {}
            } else {
              stryCov_9fa48("124323");
              throw new Error(stryMutAct_9fa48("124326") ? result.error && QUERY_ERROR_MSG.COMMIT_FAILED : stryMutAct_9fa48("124325") ? false : stryMutAct_9fa48("124324") ? true : (stryCov_9fa48("124324", "124325", "124326"), result.error || QUERY_ERROR_MSG.COMMIT_FAILED));
            }
          }
          throw new Error(stryMutAct_9fa48("124329") ? result.error && QUERY_ERROR_MSG.ROLLBACK_FAILED : stryMutAct_9fa48("124328") ? false : stryMutAct_9fa48("124327") ? true : (stryCov_9fa48("124327", "124328", "124329"), result.error || QUERY_ERROR_MSG.ROLLBACK_FAILED));
        }
      }
    }
  }

  /**
   * Get partitions for a table.
   *
   * System Cache Lookup:
   * - Uses ONLY the system cache (single source of truth)
   * - No fallbacks or bootstrap directories
   * - System cache populated from bootstrap snapshots
   * - CDC events keep cache synchronized
   * - Throws error if cache not available
   *
   * Requirements: 3.1, 5.1
   * @param {string} tableName - Table name.
   * @return {Array} Array of partition objects.
   * @throws {Error} If system cache is not available.
   * @private
   */
  getTablePartitions(tableName) {
    if (stryMutAct_9fa48("124330")) {
      {}
    } else {
      stryCov_9fa48("124330");
      if (stryMutAct_9fa48("124333") ? false : stryMutAct_9fa48("124332") ? true : stryMutAct_9fa48("124331") ? this.systemCache : (stryCov_9fa48("124331", "124332", "124333"), !this.systemCache)) {
        if (stryMutAct_9fa48("124334")) {
          {}
        } else {
          stryCov_9fa48("124334");
          throw new Error(stryMutAct_9fa48("124335") ? `` : (stryCov_9fa48("124335"), `${QUERY_ERROR_MSG.SYSTEM_CACHE_NOT_AVAILABLE}: ${tableName}`));
        }
      }
      const tableInfo = this.getTableInfo(tableName);
      const tableId = stryMutAct_9fa48("124338") ? (tableInfo?.table_id || tableInfo?.tableId) && null : stryMutAct_9fa48("124337") ? false : stryMutAct_9fa48("124336") ? true : (stryCov_9fa48("124336", "124337", "124338"), (stryMutAct_9fa48("124340") ? tableInfo?.table_id && tableInfo?.tableId : stryMutAct_9fa48("124339") ? false : (stryCov_9fa48("124339", "124340"), (stryMutAct_9fa48("124341") ? tableInfo.table_id : (stryCov_9fa48("124341"), tableInfo?.table_id)) || (stryMutAct_9fa48("124342") ? tableInfo.tableId : (stryCov_9fa48("124342"), tableInfo?.tableId)))) || null);
      const activePartitionVersion = this.resolveActivePartitionVersion(tableInfo);

      // Get partitions from system cache - the single source of truth
      if (stryMutAct_9fa48("124345") ? typeof this.systemCache.filter !== 'function' : stryMutAct_9fa48("124344") ? false : stryMutAct_9fa48("124343") ? true : (stryCov_9fa48("124343", "124344", "124345"), typeof this.systemCache.filter === (stryMutAct_9fa48("124346") ? "" : (stryCov_9fa48("124346"), 'function')))) {
        if (stryMutAct_9fa48("124347")) {
          {}
        } else {
          stryCov_9fa48("124347");
          const directMatches = stryMutAct_9fa48("124350") ? this.systemCache.filter(TABLES.PARTITIONS, partition => this.partitionMatchesTableRef(partition, tableName)) && [] : stryMutAct_9fa48("124349") ? false : stryMutAct_9fa48("124348") ? true : (stryCov_9fa48("124348", "124349", "124350"), (stryMutAct_9fa48("124351") ? this.systemCache : (stryCov_9fa48("124351"), this.systemCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("124352") ? () => undefined : (stryCov_9fa48("124352"), partition => this.partitionMatchesTableRef(partition, tableName))))) || (stryMutAct_9fa48("124353") ? ["Stryker was here"] : (stryCov_9fa48("124353"), [])));
          const visibleDirectMatches = stryMutAct_9fa48("124354") ? directMatches : (stryCov_9fa48("124354"), directMatches.filter(stryMutAct_9fa48("124355") ? () => undefined : (stryCov_9fa48("124355"), partition => this.isPartitionVisibleForRouting(partition, activePartitionVersion))));
          if (stryMutAct_9fa48("124359") ? directMatches.length <= 0 : stryMutAct_9fa48("124358") ? directMatches.length >= 0 : stryMutAct_9fa48("124357") ? false : stryMutAct_9fa48("124356") ? true : (stryCov_9fa48("124356", "124357", "124358", "124359"), directMatches.length > 0)) {
            if (stryMutAct_9fa48("124360")) {
              {}
            } else {
              stryCov_9fa48("124360");
              return visibleDirectMatches;
            }
          }
          const overlayDirectMatches = this.getBootstrapRoutingOverlayPartitionsForTable(tableName, activePartitionVersion);
          if (stryMutAct_9fa48("124363") ? (overlayDirectMatches.length > 0 || !tableId) && tableId === tableName : stryMutAct_9fa48("124362") ? false : stryMutAct_9fa48("124361") ? true : (stryCov_9fa48("124361", "124362", "124363"), (stryMutAct_9fa48("124365") ? overlayDirectMatches.length > 0 && !tableId : stryMutAct_9fa48("124364") ? false : (stryCov_9fa48("124364", "124365"), (stryMutAct_9fa48("124368") ? overlayDirectMatches.length <= 0 : stryMutAct_9fa48("124367") ? overlayDirectMatches.length >= 0 : stryMutAct_9fa48("124366") ? false : (stryCov_9fa48("124366", "124367", "124368"), overlayDirectMatches.length > 0)) || (stryMutAct_9fa48("124369") ? tableId : (stryCov_9fa48("124369"), !tableId)))) || (stryMutAct_9fa48("124371") ? tableId !== tableName : stryMutAct_9fa48("124370") ? false : (stryCov_9fa48("124370", "124371"), tableId === tableName)))) {
            if (stryMutAct_9fa48("124372")) {
              {}
            } else {
              stryCov_9fa48("124372");
              return overlayDirectMatches;
            }
          }
          const tableIdMatches = stryMutAct_9fa48("124375") ? this.systemCache.filter(TABLES.PARTITIONS, partition => this.partitionMatchesTableRef(partition, tableId)) && [] : stryMutAct_9fa48("124374") ? false : stryMutAct_9fa48("124373") ? true : (stryCov_9fa48("124373", "124374", "124375"), (stryMutAct_9fa48("124376") ? this.systemCache : (stryCov_9fa48("124376"), this.systemCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("124377") ? () => undefined : (stryCov_9fa48("124377"), partition => this.partitionMatchesTableRef(partition, tableId))))) || (stryMutAct_9fa48("124378") ? ["Stryker was here"] : (stryCov_9fa48("124378"), [])));
          const visibleTableIdMatches = stryMutAct_9fa48("124379") ? tableIdMatches : (stryCov_9fa48("124379"), tableIdMatches.filter(stryMutAct_9fa48("124380") ? () => undefined : (stryCov_9fa48("124380"), partition => this.isPartitionVisibleForRouting(partition, activePartitionVersion))));
          if (stryMutAct_9fa48("124384") ? visibleTableIdMatches.length <= 0 : stryMutAct_9fa48("124383") ? visibleTableIdMatches.length >= 0 : stryMutAct_9fa48("124382") ? false : stryMutAct_9fa48("124381") ? true : (stryCov_9fa48("124381", "124382", "124383", "124384"), visibleTableIdMatches.length > 0)) {
            if (stryMutAct_9fa48("124385")) {
              {}
            } else {
              stryCov_9fa48("124385");
              return visibleTableIdMatches;
            }
          }
          return this.getBootstrapRoutingOverlayPartitionsForTable(tableId, activePartitionVersion);
        }
      }
      if (stryMutAct_9fa48("124388") ? typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("124387") ? false : stryMutAct_9fa48("124386") ? true : (stryCov_9fa48("124386", "124387", "124388"), typeof this.systemCache.getAll === (stryMutAct_9fa48("124389") ? "" : (stryCov_9fa48("124389"), 'function')))) {
        if (stryMutAct_9fa48("124390")) {
          {}
        } else {
          stryCov_9fa48("124390");
          const all = stryMutAct_9fa48("124393") ? this.systemCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("124392") ? false : stryMutAct_9fa48("124391") ? true : (stryCov_9fa48("124391", "124392", "124393"), this.systemCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("124394") ? ["Stryker was here"] : (stryCov_9fa48("124394"), [])));
          const directMatches = stryMutAct_9fa48("124395") ? all : (stryCov_9fa48("124395"), all.filter(stryMutAct_9fa48("124396") ? () => undefined : (stryCov_9fa48("124396"), partition => this.partitionMatchesTableRef(partition, tableName))));
          const visibleDirectMatches = stryMutAct_9fa48("124397") ? directMatches : (stryCov_9fa48("124397"), directMatches.filter(stryMutAct_9fa48("124398") ? () => undefined : (stryCov_9fa48("124398"), partition => this.isPartitionVisibleForRouting(partition, activePartitionVersion))));
          if (stryMutAct_9fa48("124402") ? directMatches.length <= 0 : stryMutAct_9fa48("124401") ? directMatches.length >= 0 : stryMutAct_9fa48("124400") ? false : stryMutAct_9fa48("124399") ? true : (stryCov_9fa48("124399", "124400", "124401", "124402"), directMatches.length > 0)) {
            if (stryMutAct_9fa48("124403")) {
              {}
            } else {
              stryCov_9fa48("124403");
              return visibleDirectMatches;
            }
          }
          const overlayDirectMatches = this.getBootstrapRoutingOverlayPartitionsForTable(tableName, activePartitionVersion);
          if (stryMutAct_9fa48("124406") ? (overlayDirectMatches.length > 0 || !tableId) && tableId === tableName : stryMutAct_9fa48("124405") ? false : stryMutAct_9fa48("124404") ? true : (stryCov_9fa48("124404", "124405", "124406"), (stryMutAct_9fa48("124408") ? overlayDirectMatches.length > 0 && !tableId : stryMutAct_9fa48("124407") ? false : (stryCov_9fa48("124407", "124408"), (stryMutAct_9fa48("124411") ? overlayDirectMatches.length <= 0 : stryMutAct_9fa48("124410") ? overlayDirectMatches.length >= 0 : stryMutAct_9fa48("124409") ? false : (stryCov_9fa48("124409", "124410", "124411"), overlayDirectMatches.length > 0)) || (stryMutAct_9fa48("124412") ? tableId : (stryCov_9fa48("124412"), !tableId)))) || (stryMutAct_9fa48("124414") ? tableId !== tableName : stryMutAct_9fa48("124413") ? false : (stryCov_9fa48("124413", "124414"), tableId === tableName)))) {
            if (stryMutAct_9fa48("124415")) {
              {}
            } else {
              stryCov_9fa48("124415");
              return overlayDirectMatches;
            }
          }
          const visibleTableIdMatches = stryMutAct_9fa48("124417") ? all.filter(partition => this.isPartitionVisibleForRouting(partition, activePartitionVersion)) : stryMutAct_9fa48("124416") ? all.filter(partition => this.partitionMatchesTableRef(partition, tableId)) : (stryCov_9fa48("124416", "124417"), all.filter(stryMutAct_9fa48("124418") ? () => undefined : (stryCov_9fa48("124418"), partition => this.partitionMatchesTableRef(partition, tableId))).filter(stryMutAct_9fa48("124419") ? () => undefined : (stryCov_9fa48("124419"), partition => this.isPartitionVisibleForRouting(partition, activePartitionVersion))));
          if (stryMutAct_9fa48("124423") ? visibleTableIdMatches.length <= 0 : stryMutAct_9fa48("124422") ? visibleTableIdMatches.length >= 0 : stryMutAct_9fa48("124421") ? false : stryMutAct_9fa48("124420") ? true : (stryCov_9fa48("124420", "124421", "124422", "124423"), visibleTableIdMatches.length > 0)) {
            if (stryMutAct_9fa48("124424")) {
              {}
            } else {
              stryCov_9fa48("124424");
              return visibleTableIdMatches;
            }
          }
          return this.getBootstrapRoutingOverlayPartitionsForTable(tableId, activePartitionVersion);
        }
      }
      throw new Error(stryMutAct_9fa48("124425") ? `` : (stryCov_9fa48("124425"), `${QUERY_ERROR_MSG.SYSTEM_CACHE_UNSUPPORTED}: ${tableName}`));
    }
  }

  /**
   * Determine whether one partition row belongs to a table reference.
   * @param {Object|null} partition
   * @param {string|null} tableRef
   * @return {boolean}
   * @private
   */
  partitionMatchesTableRef(partition, tableRef) {
    if (stryMutAct_9fa48("124426")) {
      {}
    } else {
      stryCov_9fa48("124426");
      if (stryMutAct_9fa48("124429") ? (!partition || typeof partition !== 'object' || typeof tableRef !== 'string') && tableRef.length === 0 : stryMutAct_9fa48("124428") ? false : stryMutAct_9fa48("124427") ? true : (stryCov_9fa48("124427", "124428", "124429"), (stryMutAct_9fa48("124431") ? (!partition || typeof partition !== 'object') && typeof tableRef !== 'string' : stryMutAct_9fa48("124430") ? false : (stryCov_9fa48("124430", "124431"), (stryMutAct_9fa48("124433") ? !partition && typeof partition !== 'object' : stryMutAct_9fa48("124432") ? false : (stryCov_9fa48("124432", "124433"), (stryMutAct_9fa48("124434") ? partition : (stryCov_9fa48("124434"), !partition)) || (stryMutAct_9fa48("124436") ? typeof partition === 'object' : stryMutAct_9fa48("124435") ? false : (stryCov_9fa48("124435", "124436"), typeof partition !== (stryMutAct_9fa48("124437") ? "" : (stryCov_9fa48("124437"), 'object')))))) || (stryMutAct_9fa48("124439") ? typeof tableRef === 'string' : stryMutAct_9fa48("124438") ? false : (stryCov_9fa48("124438", "124439"), typeof tableRef !== (stryMutAct_9fa48("124440") ? "" : (stryCov_9fa48("124440"), 'string')))))) || (stryMutAct_9fa48("124442") ? tableRef.length !== 0 : stryMutAct_9fa48("124441") ? false : (stryCov_9fa48("124441", "124442"), tableRef.length === 0)))) {
        if (stryMutAct_9fa48("124443")) {
          {}
        } else {
          stryCov_9fa48("124443");
          return stryMutAct_9fa48("124444") ? true : (stryCov_9fa48("124444"), false);
        }
      }
      return stryMutAct_9fa48("124447") ? (partition.table_name === tableRef || partition.tableName === tableRef || partition.table_id === tableRef) && partition.tableId === tableRef : stryMutAct_9fa48("124446") ? false : stryMutAct_9fa48("124445") ? true : (stryCov_9fa48("124445", "124446", "124447"), (stryMutAct_9fa48("124449") ? (partition.table_name === tableRef || partition.tableName === tableRef) && partition.table_id === tableRef : stryMutAct_9fa48("124448") ? false : (stryCov_9fa48("124448", "124449"), (stryMutAct_9fa48("124451") ? partition.table_name === tableRef && partition.tableName === tableRef : stryMutAct_9fa48("124450") ? false : (stryCov_9fa48("124450", "124451"), (stryMutAct_9fa48("124453") ? partition.table_name !== tableRef : stryMutAct_9fa48("124452") ? false : (stryCov_9fa48("124452", "124453"), partition.table_name === tableRef)) || (stryMutAct_9fa48("124455") ? partition.tableName !== tableRef : stryMutAct_9fa48("124454") ? false : (stryCov_9fa48("124454", "124455"), partition.tableName === tableRef)))) || (stryMutAct_9fa48("124457") ? partition.table_id !== tableRef : stryMutAct_9fa48("124456") ? false : (stryCov_9fa48("124456", "124457"), partition.table_id === tableRef)))) || (stryMutAct_9fa48("124459") ? partition.tableId !== tableRef : stryMutAct_9fa48("124458") ? false : (stryCov_9fa48("124458", "124459"), partition.tableId === tableRef)));
    }
  }

  /**
   * Get table information.
   * @param {string} tableName - Table name.
   * @return {Object|null} Table info or null.
   * @private
   */
  getTableInfo(tableName) {
    if (stryMutAct_9fa48("124460")) {
      {}
    } else {
      stryCov_9fa48("124460");
      if (stryMutAct_9fa48("124463") ? false : stryMutAct_9fa48("124462") ? true : stryMutAct_9fa48("124461") ? this.systemCache : (stryCov_9fa48("124461", "124462", "124463"), !this.systemCache)) {
        if (stryMutAct_9fa48("124464")) {
          {}
        } else {
          stryCov_9fa48("124464");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("124465")) {
          {}
        } else {
          stryCov_9fa48("124465");
          if (stryMutAct_9fa48("124468") ? typeof this.systemCache.get !== 'function' : stryMutAct_9fa48("124467") ? false : stryMutAct_9fa48("124466") ? true : (stryCov_9fa48("124466", "124467", "124468"), typeof this.systemCache.get === (stryMutAct_9fa48("124469") ? "" : (stryCov_9fa48("124469"), 'function')))) {
            if (stryMutAct_9fa48("124470")) {
              {}
            } else {
              stryCov_9fa48("124470");
              const byPrimaryKey = this.systemCache.get(TABLES.TABLES, tableName);
              if (stryMutAct_9fa48("124472") ? false : stryMutAct_9fa48("124471") ? true : (stryCov_9fa48("124471", "124472"), byPrimaryKey)) {
                if (stryMutAct_9fa48("124473")) {
                  {}
                } else {
                  stryCov_9fa48("124473");
                  return byPrimaryKey;
                }
              }
            }
          }
          if (stryMutAct_9fa48("124476") ? typeof this.systemCache.find !== 'function' : stryMutAct_9fa48("124475") ? false : stryMutAct_9fa48("124474") ? true : (stryCov_9fa48("124474", "124475", "124476"), typeof this.systemCache.find === (stryMutAct_9fa48("124477") ? "" : (stryCov_9fa48("124477"), 'function')))) {
            if (stryMutAct_9fa48("124478")) {
              {}
            } else {
              stryCov_9fa48("124478");
              const found = this.systemCache.find(TABLES.TABLES, stryMutAct_9fa48("124479") ? () => undefined : (stryCov_9fa48("124479"), t => stryMutAct_9fa48("124482") ? t.table_name === tableName && t.tableName === tableName : stryMutAct_9fa48("124481") ? false : stryMutAct_9fa48("124480") ? true : (stryCov_9fa48("124480", "124481", "124482"), (stryMutAct_9fa48("124484") ? t.table_name !== tableName : stryMutAct_9fa48("124483") ? false : (stryCov_9fa48("124483", "124484"), t.table_name === tableName)) || (stryMutAct_9fa48("124486") ? t.tableName !== tableName : stryMutAct_9fa48("124485") ? false : (stryCov_9fa48("124485", "124486"), t.tableName === tableName)))));
              if (stryMutAct_9fa48("124488") ? false : stryMutAct_9fa48("124487") ? true : (stryCov_9fa48("124487", "124488"), found)) {
                if (stryMutAct_9fa48("124489")) {
                  {}
                } else {
                  stryCov_9fa48("124489");
                  return found;
                }
              }
            }
          }
          if (stryMutAct_9fa48("124492") ? typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("124491") ? false : stryMutAct_9fa48("124490") ? true : (stryCov_9fa48("124490", "124491", "124492"), typeof this.systemCache.getAll === (stryMutAct_9fa48("124493") ? "" : (stryCov_9fa48("124493"), 'function')))) {
            if (stryMutAct_9fa48("124494")) {
              {}
            } else {
              stryCov_9fa48("124494");
              const tables = stryMutAct_9fa48("124497") ? this.systemCache.getAll(TABLES.TABLES) && [] : stryMutAct_9fa48("124496") ? false : stryMutAct_9fa48("124495") ? true : (stryCov_9fa48("124495", "124496", "124497"), this.systemCache.getAll(TABLES.TABLES) || (stryMutAct_9fa48("124498") ? ["Stryker was here"] : (stryCov_9fa48("124498"), [])));
              return stryMutAct_9fa48("124501") ? tables.find(table => table.table_name === tableName || table.tableName === tableName || table.table_id === tableName || table.tableId === tableName) && null : stryMutAct_9fa48("124500") ? false : stryMutAct_9fa48("124499") ? true : (stryCov_9fa48("124499", "124500", "124501"), tables.find(stryMutAct_9fa48("124502") ? () => undefined : (stryCov_9fa48("124502"), table => stryMutAct_9fa48("124505") ? (table.table_name === tableName || table.tableName === tableName || table.table_id === tableName) && table.tableId === tableName : stryMutAct_9fa48("124504") ? false : stryMutAct_9fa48("124503") ? true : (stryCov_9fa48("124503", "124504", "124505"), (stryMutAct_9fa48("124507") ? (table.table_name === tableName || table.tableName === tableName) && table.table_id === tableName : stryMutAct_9fa48("124506") ? false : (stryCov_9fa48("124506", "124507"), (stryMutAct_9fa48("124509") ? table.table_name === tableName && table.tableName === tableName : stryMutAct_9fa48("124508") ? false : (stryCov_9fa48("124508", "124509"), (stryMutAct_9fa48("124511") ? table.table_name !== tableName : stryMutAct_9fa48("124510") ? false : (stryCov_9fa48("124510", "124511"), table.table_name === tableName)) || (stryMutAct_9fa48("124513") ? table.tableName !== tableName : stryMutAct_9fa48("124512") ? false : (stryCov_9fa48("124512", "124513"), table.tableName === tableName)))) || (stryMutAct_9fa48("124515") ? table.table_id !== tableName : stryMutAct_9fa48("124514") ? false : (stryCov_9fa48("124514", "124515"), table.table_id === tableName)))) || (stryMutAct_9fa48("124517") ? table.tableId !== tableName : stryMutAct_9fa48("124516") ? false : (stryCov_9fa48("124516", "124517"), table.tableId === tableName))))) || null);
            }
          }
        }
      } catch (_cacheErr) {
        // Cache not available
      }
      return null;
    }
  }

  /**
   * Read schema-migration rows for one table from system cache.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object[]} Matching migration rows.
   * @private
   */
  getTableMigrationsFromCache(tableInfo) {
    if (stryMutAct_9fa48("124518")) {
      {}
    } else {
      stryCov_9fa48("124518");
      if (stryMutAct_9fa48("124521") ? !tableInfo && !this.systemCache : stryMutAct_9fa48("124520") ? false : stryMutAct_9fa48("124519") ? true : (stryCov_9fa48("124519", "124520", "124521"), (stryMutAct_9fa48("124522") ? tableInfo : (stryCov_9fa48("124522"), !tableInfo)) || (stryMutAct_9fa48("124523") ? this.systemCache : (stryCov_9fa48("124523"), !this.systemCache)))) {
        if (stryMutAct_9fa48("124524")) {
          {}
        } else {
          stryCov_9fa48("124524");
          return stryMutAct_9fa48("124525") ? ["Stryker was here"] : (stryCov_9fa48("124525"), []);
        }
      }
      const tableId = stryMutAct_9fa48("124528") ? (tableInfo.table_id || tableInfo.tableId) && null : stryMutAct_9fa48("124527") ? false : stryMutAct_9fa48("124526") ? true : (stryCov_9fa48("124526", "124527", "124528"), (stryMutAct_9fa48("124530") ? tableInfo.table_id && tableInfo.tableId : stryMutAct_9fa48("124529") ? false : (stryCov_9fa48("124529", "124530"), tableInfo.table_id || tableInfo.tableId)) || null);
      const tableName = stryMutAct_9fa48("124533") ? (tableInfo.table_name || tableInfo.tableName) && null : stryMutAct_9fa48("124532") ? false : stryMutAct_9fa48("124531") ? true : (stryCov_9fa48("124531", "124532", "124533"), (stryMutAct_9fa48("124535") ? tableInfo.table_name && tableInfo.tableName : stryMutAct_9fa48("124534") ? false : (stryCov_9fa48("124534", "124535"), tableInfo.table_name || tableInfo.tableName)) || null);
      const matchesTable = row => {
        if (stryMutAct_9fa48("124536")) {
          {}
        } else {
          stryCov_9fa48("124536");
          const rowTableId = stryMutAct_9fa48("124539") ? (row?.table_id || row?.tableId) && null : stryMutAct_9fa48("124538") ? false : stryMutAct_9fa48("124537") ? true : (stryCov_9fa48("124537", "124538", "124539"), (stryMutAct_9fa48("124541") ? row?.table_id && row?.tableId : stryMutAct_9fa48("124540") ? false : (stryCov_9fa48("124540", "124541"), (stryMutAct_9fa48("124542") ? row.table_id : (stryCov_9fa48("124542"), row?.table_id)) || (stryMutAct_9fa48("124543") ? row.tableId : (stryCov_9fa48("124543"), row?.tableId)))) || null);
          const rowTableName = stryMutAct_9fa48("124546") ? (row?.table_name || row?.tableName) && null : stryMutAct_9fa48("124545") ? false : stryMutAct_9fa48("124544") ? true : (stryCov_9fa48("124544", "124545", "124546"), (stryMutAct_9fa48("124548") ? row?.table_name && row?.tableName : stryMutAct_9fa48("124547") ? false : (stryCov_9fa48("124547", "124548"), (stryMutAct_9fa48("124549") ? row.table_name : (stryCov_9fa48("124549"), row?.table_name)) || (stryMutAct_9fa48("124550") ? row.tableName : (stryCov_9fa48("124550"), row?.tableName)))) || null);
          return stryMutAct_9fa48("124553") ? tableId && rowTableId === tableId && tableName && rowTableName === tableName : stryMutAct_9fa48("124552") ? false : stryMutAct_9fa48("124551") ? true : (stryCov_9fa48("124551", "124552", "124553"), (stryMutAct_9fa48("124555") ? tableId || rowTableId === tableId : stryMutAct_9fa48("124554") ? false : (stryCov_9fa48("124554", "124555"), tableId && (stryMutAct_9fa48("124557") ? rowTableId !== tableId : stryMutAct_9fa48("124556") ? true : (stryCov_9fa48("124556", "124557"), rowTableId === tableId)))) || (stryMutAct_9fa48("124559") ? tableName || rowTableName === tableName : stryMutAct_9fa48("124558") ? false : (stryCov_9fa48("124558", "124559"), tableName && (stryMutAct_9fa48("124561") ? rowTableName !== tableName : stryMutAct_9fa48("124560") ? true : (stryCov_9fa48("124560", "124561"), rowTableName === tableName)))));
        }
      };
      if (stryMutAct_9fa48("124564") ? typeof this.systemCache.filter !== 'function' : stryMutAct_9fa48("124563") ? false : stryMutAct_9fa48("124562") ? true : (stryCov_9fa48("124562", "124563", "124564"), typeof this.systemCache.filter === (stryMutAct_9fa48("124565") ? "" : (stryCov_9fa48("124565"), 'function')))) {
        if (stryMutAct_9fa48("124566")) {
          {}
        } else {
          stryCov_9fa48("124566");
          return stryMutAct_9fa48("124569") ? this.systemCache.filter(TABLES.SCHEMA_MIGRATIONS, matchesTable) && [] : stryMutAct_9fa48("124568") ? false : stryMutAct_9fa48("124567") ? true : (stryCov_9fa48("124567", "124568", "124569"), (stryMutAct_9fa48("124570") ? this.systemCache : (stryCov_9fa48("124570"), this.systemCache.filter(TABLES.SCHEMA_MIGRATIONS, matchesTable))) || (stryMutAct_9fa48("124571") ? ["Stryker was here"] : (stryCov_9fa48("124571"), [])));
        }
      }
      if (stryMutAct_9fa48("124574") ? typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("124573") ? false : stryMutAct_9fa48("124572") ? true : (stryCov_9fa48("124572", "124573", "124574"), typeof this.systemCache.getAll === (stryMutAct_9fa48("124575") ? "" : (stryCov_9fa48("124575"), 'function')))) {
        if (stryMutAct_9fa48("124576")) {
          {}
        } else {
          stryCov_9fa48("124576");
          const rows = stryMutAct_9fa48("124579") ? this.systemCache.getAll(TABLES.SCHEMA_MIGRATIONS) && [] : stryMutAct_9fa48("124578") ? false : stryMutAct_9fa48("124577") ? true : (stryCov_9fa48("124577", "124578", "124579"), this.systemCache.getAll(TABLES.SCHEMA_MIGRATIONS) || (stryMutAct_9fa48("124580") ? ["Stryker was here"] : (stryCov_9fa48("124580"), [])));
          return stryMutAct_9fa48("124581") ? rows : (stryCov_9fa48("124581"), rows.filter(matchesTable));
        }
      }
      return stryMutAct_9fa48("124582") ? ["Stryker was here"] : (stryCov_9fa48("124582"), []);
    }
  }

  /**
   * Resolve one active dual-write migration row for a table.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object|null} Active migration row.
   * @private
   */
  getActiveDualWriteMigration(tableInfo) {
    if (stryMutAct_9fa48("124583")) {
      {}
    } else {
      stryCov_9fa48("124583");
      const rows = this.getTableMigrationsFromCache(tableInfo);
      for (const row of rows) {
        if (stryMutAct_9fa48("124584")) {
          {}
        } else {
          stryCov_9fa48("124584");
          const status = stryMutAct_9fa48("124585") ? String(row?.status || row?.current_stage || '') : (stryCov_9fa48("124585"), String(stryMutAct_9fa48("124588") ? (row?.status || row?.current_stage) && '' : stryMutAct_9fa48("124587") ? false : stryMutAct_9fa48("124586") ? true : (stryCov_9fa48("124586", "124587", "124588"), (stryMutAct_9fa48("124590") ? row?.status && row?.current_stage : stryMutAct_9fa48("124589") ? false : (stryCov_9fa48("124589", "124590"), (stryMutAct_9fa48("124591") ? row.status : (stryCov_9fa48("124591"), row?.status)) || (stryMutAct_9fa48("124592") ? row.current_stage : (stryCov_9fa48("124592"), row?.current_stage)))) || (stryMutAct_9fa48("124593") ? "Stryker was here!" : (stryCov_9fa48("124593"), '')))).trim());
          if (stryMutAct_9fa48("124595") ? false : stryMutAct_9fa48("124594") ? true : (stryCov_9fa48("124594", "124595"), DUAL_WRITE_ACTIVE_STATUSES.has(status))) {
            if (stryMutAct_9fa48("124596")) {
              {}
            } else {
              stryCov_9fa48("124596");
              return row;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Resolve whether a table is currently in dual-write mode.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {boolean} True when dual-write migration is active.
   * @private
   */
  isDualWriteModeActiveForTable(tableInfo) {
    if (stryMutAct_9fa48("124597")) {
      {}
    } else {
      stryCov_9fa48("124597");
      return stryMutAct_9fa48("124600") ? this.getActiveDualWriteMigration(tableInfo) === null : stryMutAct_9fa48("124599") ? false : stryMutAct_9fa48("124598") ? true : (stryCov_9fa48("124598", "124599", "124600"), this.getActiveDualWriteMigration(tableInfo) !== null);
    }
  }

  /**
   * Resolve one partition metadata row by partition ID.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Partition metadata row.
   * @private
   */
  getPartitionInfo(partitionId) {
    if (stryMutAct_9fa48("124601")) {
      {}
    } else {
      stryCov_9fa48("124601");
      if (stryMutAct_9fa48("124604") ? !partitionId && !this.systemCache : stryMutAct_9fa48("124603") ? false : stryMutAct_9fa48("124602") ? true : (stryCov_9fa48("124602", "124603", "124604"), (stryMutAct_9fa48("124605") ? partitionId : (stryCov_9fa48("124605"), !partitionId)) || (stryMutAct_9fa48("124606") ? this.systemCache : (stryCov_9fa48("124606"), !this.systemCache)))) {
        if (stryMutAct_9fa48("124607")) {
          {}
        } else {
          stryCov_9fa48("124607");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("124608")) {
          {}
        } else {
          stryCov_9fa48("124608");
          if (stryMutAct_9fa48("124611") ? typeof this.systemCache.get !== 'function' : stryMutAct_9fa48("124610") ? false : stryMutAct_9fa48("124609") ? true : (stryCov_9fa48("124609", "124610", "124611"), typeof this.systemCache.get === (stryMutAct_9fa48("124612") ? "" : (stryCov_9fa48("124612"), 'function')))) {
            if (stryMutAct_9fa48("124613")) {
              {}
            } else {
              stryCov_9fa48("124613");
              const direct = this.systemCache.get(TABLES.PARTITIONS, partitionId);
              if (stryMutAct_9fa48("124615") ? false : stryMutAct_9fa48("124614") ? true : (stryCov_9fa48("124614", "124615"), direct)) {
                if (stryMutAct_9fa48("124616")) {
                  {}
                } else {
                  stryCov_9fa48("124616");
                  return direct;
                }
              }
            }
          }
          if (stryMutAct_9fa48("124619") ? typeof this.systemCache.find !== 'function' : stryMutAct_9fa48("124618") ? false : stryMutAct_9fa48("124617") ? true : (stryCov_9fa48("124617", "124618", "124619"), typeof this.systemCache.find === (stryMutAct_9fa48("124620") ? "" : (stryCov_9fa48("124620"), 'function')))) {
            if (stryMutAct_9fa48("124621")) {
              {}
            } else {
              stryCov_9fa48("124621");
              const found = this.systemCache.find(TABLES.PARTITIONS, stryMutAct_9fa48("124622") ? () => undefined : (stryCov_9fa48("124622"), partition => stryMutAct_9fa48("124625") ? partition.partition_id === partitionId && partition.partitionId === partitionId : stryMutAct_9fa48("124624") ? false : stryMutAct_9fa48("124623") ? true : (stryCov_9fa48("124623", "124624", "124625"), (stryMutAct_9fa48("124627") ? partition.partition_id !== partitionId : stryMutAct_9fa48("124626") ? false : (stryCov_9fa48("124626", "124627"), partition.partition_id === partitionId)) || (stryMutAct_9fa48("124629") ? partition.partitionId !== partitionId : stryMutAct_9fa48("124628") ? false : (stryCov_9fa48("124628", "124629"), partition.partitionId === partitionId)))));
              if (stryMutAct_9fa48("124631") ? false : stryMutAct_9fa48("124630") ? true : (stryCov_9fa48("124630", "124631"), found)) {
                if (stryMutAct_9fa48("124632")) {
                  {}
                } else {
                  stryCov_9fa48("124632");
                  return found;
                }
              }
            }
          }
          if (stryMutAct_9fa48("124635") ? typeof this.systemCache.getAll !== 'function' : stryMutAct_9fa48("124634") ? false : stryMutAct_9fa48("124633") ? true : (stryCov_9fa48("124633", "124634", "124635"), typeof this.systemCache.getAll === (stryMutAct_9fa48("124636") ? "" : (stryCov_9fa48("124636"), 'function')))) {
            if (stryMutAct_9fa48("124637")) {
              {}
            } else {
              stryCov_9fa48("124637");
              const partitions = stryMutAct_9fa48("124640") ? this.systemCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("124639") ? false : stryMutAct_9fa48("124638") ? true : (stryCov_9fa48("124638", "124639", "124640"), this.systemCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("124641") ? ["Stryker was here"] : (stryCov_9fa48("124641"), [])));
              return stryMutAct_9fa48("124644") ? partitions.find(partition => partition.partition_id === partitionId || partition.partitionId === partitionId) && null : stryMutAct_9fa48("124643") ? false : stryMutAct_9fa48("124642") ? true : (stryCov_9fa48("124642", "124643", "124644"), partitions.find(stryMutAct_9fa48("124645") ? () => undefined : (stryCov_9fa48("124645"), partition => stryMutAct_9fa48("124648") ? partition.partition_id === partitionId && partition.partitionId === partitionId : stryMutAct_9fa48("124647") ? false : stryMutAct_9fa48("124646") ? true : (stryCov_9fa48("124646", "124647", "124648"), (stryMutAct_9fa48("124650") ? partition.partition_id !== partitionId : stryMutAct_9fa48("124649") ? false : (stryCov_9fa48("124649", "124650"), partition.partition_id === partitionId)) || (stryMutAct_9fa48("124652") ? partition.partitionId !== partitionId : stryMutAct_9fa48("124651") ? false : (stryCov_9fa48("124651", "124652"), partition.partitionId === partitionId))))) || null);
            }
          }
        }
      } catch (_cacheErr) {
        // Cache not available
      }
      return null;
    }
  }

  /**
   * Determine whether the local node is the persisted leader for one partition.
   * @param {Object|null} partitionInfo - Partition metadata row.
   * @return {boolean} True when the local node owns split orchestration.
   * @private
   */
  isLocalManagedSplitLeader(partitionInfo) {
    if (stryMutAct_9fa48("124653")) {
      {}
    } else {
      stryCov_9fa48("124653");
      if (stryMutAct_9fa48("124656") ? !partitionInfo && !this.nodeId : stryMutAct_9fa48("124655") ? false : stryMutAct_9fa48("124654") ? true : (stryCov_9fa48("124654", "124655", "124656"), (stryMutAct_9fa48("124657") ? partitionInfo : (stryCov_9fa48("124657"), !partitionInfo)) || (stryMutAct_9fa48("124658") ? this.nodeId : (stryCov_9fa48("124658"), !this.nodeId)))) {
        if (stryMutAct_9fa48("124659")) {
          {}
        } else {
          stryCov_9fa48("124659");
          return stryMutAct_9fa48("124660") ? true : (stryCov_9fa48("124660"), false);
        }
      }
      const leaderNodeId = stryMutAct_9fa48("124661") ? (partitionInfo.leader_node_id ?? partitionInfo.leaderNodeId) && null : (stryCov_9fa48("124661"), (stryMutAct_9fa48("124662") ? partitionInfo.leader_node_id && partitionInfo.leaderNodeId : (stryCov_9fa48("124662"), partitionInfo.leader_node_id ?? partitionInfo.leaderNodeId)) ?? null);
      return stryMutAct_9fa48("124665") ? Boolean(leaderNodeId) || leaderNodeId === this.nodeId : stryMutAct_9fa48("124664") ? false : stryMutAct_9fa48("124663") ? true : (stryCov_9fa48("124663", "124664", "124665"), Boolean(leaderNodeId) && (stryMutAct_9fa48("124667") ? leaderNodeId !== this.nodeId : stryMutAct_9fa48("124666") ? true : (stryCov_9fa48("124666", "124667"), leaderNodeId === this.nodeId)));
    }
  }

  /**
   * Parse partition transition metadata from a table row.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object|null} Parsed transition metadata.
   * @private
   */
  parsePartitionTransition(tableInfo) {
    if (stryMutAct_9fa48("124668")) {
      {}
    } else {
      stryCov_9fa48("124668");
      if (stryMutAct_9fa48("124671") ? false : stryMutAct_9fa48("124670") ? true : stryMutAct_9fa48("124669") ? tableInfo : (stryCov_9fa48("124669", "124670", "124671"), !tableInfo)) {
        if (stryMutAct_9fa48("124672")) {
          {}
        } else {
          stryCov_9fa48("124672");
          return null;
        }
      }
      const state = stryMutAct_9fa48("124673") ? (tableInfo.partition_transition_state ?? tableInfo.partitionTransitionState) && null : (stryCov_9fa48("124673"), (stryMutAct_9fa48("124674") ? tableInfo.partition_transition_state && tableInfo.partitionTransitionState : (stryCov_9fa48("124674"), tableInfo.partition_transition_state ?? tableInfo.partitionTransitionState)) ?? null);
      const rawMetadata = stryMutAct_9fa48("124675") ? (tableInfo.partition_transition_metadata ?? tableInfo.partitionTransitionMetadata) && null : (stryCov_9fa48("124675"), (stryMutAct_9fa48("124676") ? tableInfo.partition_transition_metadata && tableInfo.partitionTransitionMetadata : (stryCov_9fa48("124676"), tableInfo.partition_transition_metadata ?? tableInfo.partitionTransitionMetadata)) ?? null);
      if (stryMutAct_9fa48("124679") ? !state && !rawMetadata : stryMutAct_9fa48("124678") ? false : stryMutAct_9fa48("124677") ? true : (stryCov_9fa48("124677", "124678", "124679"), (stryMutAct_9fa48("124680") ? state : (stryCov_9fa48("124680"), !state)) || (stryMutAct_9fa48("124681") ? rawMetadata : (stryCov_9fa48("124681"), !rawMetadata)))) {
        if (stryMutAct_9fa48("124682")) {
          {}
        } else {
          stryCov_9fa48("124682");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("124683")) {
          {}
        } else {
          stryCov_9fa48("124683");
          const metadata = (stryMutAct_9fa48("124686") ? typeof rawMetadata !== 'string' : stryMutAct_9fa48("124685") ? false : stryMutAct_9fa48("124684") ? true : (stryCov_9fa48("124684", "124685", "124686"), typeof rawMetadata === (stryMutAct_9fa48("124687") ? "" : (stryCov_9fa48("124687"), 'string')))) ? JSON.parse(rawMetadata) : rawMetadata;
          return (stryMutAct_9fa48("124690") ? metadata || typeof metadata === 'object' : stryMutAct_9fa48("124689") ? false : stryMutAct_9fa48("124688") ? true : (stryCov_9fa48("124688", "124689", "124690"), metadata && (stryMutAct_9fa48("124692") ? typeof metadata !== 'object' : stryMutAct_9fa48("124691") ? true : (stryCov_9fa48("124691", "124692"), typeof metadata === (stryMutAct_9fa48("124693") ? "" : (stryCov_9fa48("124693"), 'object')))))) ? stryMutAct_9fa48("124694") ? {} : (stryCov_9fa48("124694"), {
            state,
            metadata
          }) : null;
        }
      } catch (_parseErr) {
        if (stryMutAct_9fa48("124695")) {
          {}
        } else {
          stryCov_9fa48("124695");
          return null;
        }
      }
    }
  }

  /**
   * Add post-cutover mirror participants so writes keep the source
   * partition current while caches converge to the new partition set.
   * @param {Object} writePlan - Distributed write plan.
   * @param {Object} ast - Statement AST.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {Object} The mutated write plan.
   * @private
   */
  addTransitionMirrorParticipants(writePlan, ast, tableInfo) {
    if (stryMutAct_9fa48("124696")) {
      {}
    } else {
      stryCov_9fa48("124696");
      const transition = this.parsePartitionTransition(tableInfo);
      if (stryMutAct_9fa48("124699") ? !transition && transition.state !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE : stryMutAct_9fa48("124698") ? false : stryMutAct_9fa48("124697") ? true : (stryCov_9fa48("124697", "124698", "124699"), (stryMutAct_9fa48("124700") ? transition : (stryCov_9fa48("124700"), !transition)) || (stryMutAct_9fa48("124702") ? transition.state === PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE : stryMutAct_9fa48("124701") ? false : (stryCov_9fa48("124701", "124702"), transition.state !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE)))) {
        if (stryMutAct_9fa48("124703")) {
          {}
        } else {
          stryCov_9fa48("124703");
          return writePlan;
        }
      }
      const metadata = stryMutAct_9fa48("124706") ? transition.metadata && {} : stryMutAct_9fa48("124705") ? false : stryMutAct_9fa48("124704") ? true : (stryCov_9fa48("124704", "124705", "124706"), transition.metadata || {});
      const activeVersion = this.resolveActivePartitionVersion(tableInfo);
      const targetVersion = Number(metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]);
      const sourcePartitionId = metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
      if (stryMutAct_9fa48("124709") ? (!sourcePartitionId || !Number.isInteger(targetVersion)) && targetVersion !== activeVersion : stryMutAct_9fa48("124708") ? false : stryMutAct_9fa48("124707") ? true : (stryCov_9fa48("124707", "124708", "124709"), (stryMutAct_9fa48("124711") ? !sourcePartitionId && !Number.isInteger(targetVersion) : stryMutAct_9fa48("124710") ? false : (stryCov_9fa48("124710", "124711"), (stryMutAct_9fa48("124712") ? sourcePartitionId : (stryCov_9fa48("124712"), !sourcePartitionId)) || (stryMutAct_9fa48("124713") ? Number.isInteger(targetVersion) : (stryCov_9fa48("124713"), !Number.isInteger(targetVersion))))) || (stryMutAct_9fa48("124715") ? targetVersion === activeVersion : stryMutAct_9fa48("124714") ? false : (stryCov_9fa48("124714", "124715"), targetVersion !== activeVersion)))) {
        if (stryMutAct_9fa48("124716")) {
          {}
        } else {
          stryCov_9fa48("124716");
          return writePlan;
        }
      }
      this.distributedWriteCoordinator.addMirrorParticipant(writePlan, sourcePartitionId, ast, stryMutAct_9fa48("124717") ? {} : (stryCov_9fa48("124717"), {
        splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.TARGET
      }));
      return writePlan;
    }
  }

  /**
   * Resolve active partition version from table metadata.
   * Missing values default to version 1 for compatibility.
   * @param {Object|null} tableInfo - Table metadata row.
   * @return {number} Active partition-set version.
   * @private
   */
  resolveActivePartitionVersion(tableInfo) {
    if (stryMutAct_9fa48("124718")) {
      {}
    } else {
      stryCov_9fa48("124718");
      const value = stryMutAct_9fa48("124719") ? tableInfo?.active_partition_version && tableInfo?.activePartitionVersion : (stryCov_9fa48("124719"), (stryMutAct_9fa48("124720") ? tableInfo.active_partition_version : (stryCov_9fa48("124720"), tableInfo?.active_partition_version)) ?? (stryMutAct_9fa48("124721") ? tableInfo.activePartitionVersion : (stryCov_9fa48("124721"), tableInfo?.activePartitionVersion)));
      const parsed = Number(value);
      if (stryMutAct_9fa48("124724") ? !Number.isInteger(parsed) && parsed < DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("124723") ? false : stryMutAct_9fa48("124722") ? true : (stryCov_9fa48("124722", "124723", "124724"), (stryMutAct_9fa48("124725") ? Number.isInteger(parsed) : (stryCov_9fa48("124725"), !Number.isInteger(parsed))) || (stryMutAct_9fa48("124728") ? parsed >= DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("124727") ? parsed <= DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("124726") ? false : (stryCov_9fa48("124726", "124727", "124728"), parsed < DEFAULT_PARTITION_VERSION)))) {
        if (stryMutAct_9fa48("124729")) {
          {}
        } else {
          stryCov_9fa48("124729");
          return DEFAULT_PARTITION_VERSION;
        }
      }
      return parsed;
    }
  }

  /**
   * Determine whether a partition row should participate in normal routing.
   * Hidden or non-normal child partitions remain invisible until cutover.
   * @param {Object} partition - Partition metadata row.
   * @param {number} activePartitionVersion - Active partition-set version.
   * @return {boolean} True when the partition is routable for table traffic.
   * @private
   */
  isPartitionVisibleForRouting(partition, activePartitionVersion) {
    if (stryMutAct_9fa48("124730")) {
      {}
    } else {
      stryCov_9fa48("124730");
      const partitionVersion = Number(stryMutAct_9fa48("124731") ? partition?.partition_version && partition?.partitionVersion : (stryCov_9fa48("124731"), (stryMutAct_9fa48("124732") ? partition.partition_version : (stryCov_9fa48("124732"), partition?.partition_version)) ?? (stryMutAct_9fa48("124733") ? partition.partitionVersion : (stryCov_9fa48("124733"), partition?.partitionVersion))));
      const normalizedVersion = (stryMutAct_9fa48("124736") ? Number.isInteger(partitionVersion) || partitionVersion >= DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("124735") ? false : stryMutAct_9fa48("124734") ? true : (stryCov_9fa48("124734", "124735", "124736"), Number.isInteger(partitionVersion) && (stryMutAct_9fa48("124739") ? partitionVersion < DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("124738") ? partitionVersion > DEFAULT_PARTITION_VERSION : stryMutAct_9fa48("124737") ? true : (stryCov_9fa48("124737", "124738", "124739"), partitionVersion >= DEFAULT_PARTITION_VERSION)))) ? partitionVersion : DEFAULT_PARTITION_VERSION;
      if (stryMutAct_9fa48("124742") ? normalizedVersion === activePartitionVersion : stryMutAct_9fa48("124741") ? false : stryMutAct_9fa48("124740") ? true : (stryCov_9fa48("124740", "124741", "124742"), normalizedVersion !== activePartitionVersion)) {
        if (stryMutAct_9fa48("124743")) {
          {}
        } else {
          stryCov_9fa48("124743");
          return stryMutAct_9fa48("124744") ? true : (stryCov_9fa48("124744"), false);
        }
      }
      const state = stryMutAct_9fa48("124745") ? String(partition?.state ?? ACTIVE_PARTITION_STATE).toLowerCase() : (stryCov_9fa48("124745"), String(stryMutAct_9fa48("124746") ? partition?.state && ACTIVE_PARTITION_STATE : (stryCov_9fa48("124746"), (stryMutAct_9fa48("124747") ? partition.state : (stryCov_9fa48("124747"), partition?.state)) ?? ACTIVE_PARTITION_STATE)).toUpperCase());
      return stryMutAct_9fa48("124750") ? state !== ACTIVE_PARTITION_STATE : stryMutAct_9fa48("124749") ? false : stryMutAct_9fa48("124748") ? true : (stryCov_9fa48("124748", "124749", "124750"), state === ACTIVE_PARTITION_STATE);
    }
  }

  /**
   * Check if a table is a system table.
   * @param {string} tableName - Table name.
   * @return {boolean} True if system table.
   * @private
   */
  isSystemTable(tableName) {
    if (stryMutAct_9fa48("124751")) {
      {}
    } else {
      stryCov_9fa48("124751");
      return Object.values(SYSTEM_TABLE_NAME).includes(tableName);
    }
  }

  /**
   * Resolve router delivery priority for one routed table operation.
   * Topology/control-plane tables default to the critical lane. High-volume
   * transaction bookkeeping tables use the background lane so they cannot
   * starve replica operations or startup/rebalance progress.
   * @param {string|null} tableName
   * @param {string|undefined|null} deliveryPriority
   * @return {string|undefined}
   * @private
   */
  resolveRoutedDeliveryPriority(tableName, deliveryPriority) {
    if (stryMutAct_9fa48("124752")) {
      {}
    } else {
      stryCov_9fa48("124752");
      if (stryMutAct_9fa48("124755") ? typeof deliveryPriority === 'string' || deliveryPriority.length > 0 : stryMutAct_9fa48("124754") ? false : stryMutAct_9fa48("124753") ? true : (stryCov_9fa48("124753", "124754", "124755"), (stryMutAct_9fa48("124757") ? typeof deliveryPriority !== 'string' : stryMutAct_9fa48("124756") ? true : (stryCov_9fa48("124756", "124757"), typeof deliveryPriority === (stryMutAct_9fa48("124758") ? "" : (stryCov_9fa48("124758"), 'string')))) && (stryMutAct_9fa48("124761") ? deliveryPriority.length <= 0 : stryMutAct_9fa48("124760") ? deliveryPriority.length >= 0 : stryMutAct_9fa48("124759") ? true : (stryCov_9fa48("124759", "124760", "124761"), deliveryPriority.length > 0)))) {
        if (stryMutAct_9fa48("124762")) {
          {}
        } else {
          stryCov_9fa48("124762");
          return deliveryPriority;
        }
      }
      if (stryMutAct_9fa48("124765") ? false : stryMutAct_9fa48("124764") ? true : stryMutAct_9fa48("124763") ? this.isSystemTable(tableName) : (stryCov_9fa48("124763", "124764", "124765"), !this.isSystemTable(tableName))) {
        if (stryMutAct_9fa48("124766")) {
          {}
        } else {
          stryCov_9fa48("124766");
          return undefined;
        }
      }
      return BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES.has(tableName) ? stryMutAct_9fa48("124767") ? "" : (stryCov_9fa48("124767"), 'background') : stryMutAct_9fa48("124768") ? "" : (stryCov_9fa48("124768"), 'critical');
    }
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    if (stryMutAct_9fa48("124769")) {
      {}
    } else {
      stryCov_9fa48("124769");
      if (stryMutAct_9fa48("124772") ? typeof error?.errorCode === 'string' || error.errorCode.length > 0 : stryMutAct_9fa48("124771") ? false : stryMutAct_9fa48("124770") ? true : (stryCov_9fa48("124770", "124771", "124772"), (stryMutAct_9fa48("124774") ? typeof error?.errorCode !== 'string' : stryMutAct_9fa48("124773") ? true : (stryCov_9fa48("124773", "124774"), typeof (stryMutAct_9fa48("124775") ? error.errorCode : (stryCov_9fa48("124775"), error?.errorCode)) === (stryMutAct_9fa48("124776") ? "" : (stryCov_9fa48("124776"), 'string')))) && (stryMutAct_9fa48("124779") ? error.errorCode.length <= 0 : stryMutAct_9fa48("124778") ? error.errorCode.length >= 0 : stryMutAct_9fa48("124777") ? true : (stryCov_9fa48("124777", "124778", "124779"), error.errorCode.length > 0)))) {
        if (stryMutAct_9fa48("124780")) {
          {}
        } else {
          stryCov_9fa48("124780");
          return error.errorCode;
        }
      }
      if (stryMutAct_9fa48("124783") ? typeof error?.code === 'string' || error.code.length > 0 : stryMutAct_9fa48("124782") ? false : stryMutAct_9fa48("124781") ? true : (stryCov_9fa48("124781", "124782", "124783"), (stryMutAct_9fa48("124785") ? typeof error?.code !== 'string' : stryMutAct_9fa48("124784") ? true : (stryCov_9fa48("124784", "124785"), typeof (stryMutAct_9fa48("124786") ? error.code : (stryCov_9fa48("124786"), error?.code)) === (stryMutAct_9fa48("124787") ? "" : (stryCov_9fa48("124787"), 'string')))) && (stryMutAct_9fa48("124790") ? error.code.length <= 0 : stryMutAct_9fa48("124789") ? error.code.length >= 0 : stryMutAct_9fa48("124788") ? true : (stryCov_9fa48("124788", "124789", "124790"), error.code.length > 0)))) {
        if (stryMutAct_9fa48("124791")) {
          {}
        } else {
          stryCov_9fa48("124791");
          return error.code;
        }
      }
      const message = stryMutAct_9fa48("124792") ? error.message.toUpperCase() : (stryCov_9fa48("124792"), error.message.toLowerCase());
      if (stryMutAct_9fa48("124795") ? message.includes('parse') && message.includes('syntax') : stryMutAct_9fa48("124794") ? false : stryMutAct_9fa48("124793") ? true : (stryCov_9fa48("124793", "124794", "124795"), message.includes(stryMutAct_9fa48("124796") ? "" : (stryCov_9fa48("124796"), 'parse')) || message.includes(stryMutAct_9fa48("124797") ? "" : (stryCov_9fa48("124797"), 'syntax')))) {
        if (stryMutAct_9fa48("124798")) {
          {}
        } else {
          stryCov_9fa48("124798");
          return QUERY_ERROR_CODE.SYNTAX_ERROR;
        }
      }
      if (stryMutAct_9fa48("124800") ? false : stryMutAct_9fa48("124799") ? true : (stryCov_9fa48("124799", "124800"), message.includes(stryMutAct_9fa48("124801") ? "" : (stryCov_9fa48("124801"), 'table not found')))) {
        if (stryMutAct_9fa48("124802")) {
          {}
        } else {
          stryCov_9fa48("124802");
          return QUERY_ERROR_CODE.TABLE_NOT_FOUND;
        }
      }
      if (stryMutAct_9fa48("124804") ? false : stryMutAct_9fa48("124803") ? true : (stryCov_9fa48("124803", "124804"), message.includes(stryMutAct_9fa48("124805") ? "" : (stryCov_9fa48("124805"), 'timeout')))) {
        if (stryMutAct_9fa48("124806")) {
          {}
        } else {
          stryCov_9fa48("124806");
          return QUERY_ERROR_CODE.TIMEOUT;
        }
      }
      return QUERY_ERROR_CODE.INTERNAL_ERROR;
    }
  }

  /**
   * Preserve structured retry metadata when execution surfaces a typed error
   * from a lower layer instead of returning a normalized result object.
   * @param {Error|Object} error
   * @return {Object}
   * @private
   */
  buildCaughtQueryExecutionFailure(error) {
    if (stryMutAct_9fa48("124807")) {
      {}
    } else {
      stryCov_9fa48("124807");
      const result = stryMutAct_9fa48("124808") ? {} : (stryCov_9fa48("124808"), {
        success: stryMutAct_9fa48("124809") ? true : (stryCov_9fa48("124809"), false),
        error: stryMutAct_9fa48("124812") ? error?.message && 'Query execution failed' : stryMutAct_9fa48("124811") ? false : stryMutAct_9fa48("124810") ? true : (stryCov_9fa48("124810", "124811", "124812"), (stryMutAct_9fa48("124813") ? error.message : (stryCov_9fa48("124813"), error?.message)) || (stryMutAct_9fa48("124814") ? "" : (stryCov_9fa48("124814"), 'Query execution failed'))),
        errorCode: this.getErrorCode(error)
      });
      if (stryMutAct_9fa48("124817") ? error?.deferRetry !== true : stryMutAct_9fa48("124816") ? false : stryMutAct_9fa48("124815") ? true : (stryCov_9fa48("124815", "124816", "124817"), (stryMutAct_9fa48("124818") ? error.deferRetry : (stryCov_9fa48("124818"), error?.deferRetry)) === (stryMutAct_9fa48("124819") ? false : (stryCov_9fa48("124819"), true)))) {
        if (stryMutAct_9fa48("124820")) {
          {}
        } else {
          stryCov_9fa48("124820");
          result.deferRetry = stryMutAct_9fa48("124821") ? false : (stryCov_9fa48("124821"), true);
        }
      }
      if (stryMutAct_9fa48("124824") ? Number.isFinite(error?.retryAfterMs) || error.retryAfterMs > 0 : stryMutAct_9fa48("124823") ? false : stryMutAct_9fa48("124822") ? true : (stryCov_9fa48("124822", "124823", "124824"), Number.isFinite(stryMutAct_9fa48("124825") ? error.retryAfterMs : (stryCov_9fa48("124825"), error?.retryAfterMs)) && (stryMutAct_9fa48("124828") ? error.retryAfterMs <= 0 : stryMutAct_9fa48("124827") ? error.retryAfterMs >= 0 : stryMutAct_9fa48("124826") ? true : (stryCov_9fa48("124826", "124827", "124828"), error.retryAfterMs > 0)))) {
        if (stryMutAct_9fa48("124829")) {
          {}
        } else {
          stryCov_9fa48("124829");
          result.retryAfterMs = Math.floor(error.retryAfterMs);
        }
      }
      if (stryMutAct_9fa48("124832") ? typeof error?.pressureAction === 'string' || error.pressureAction.length > 0 : stryMutAct_9fa48("124831") ? false : stryMutAct_9fa48("124830") ? true : (stryCov_9fa48("124830", "124831", "124832"), (stryMutAct_9fa48("124834") ? typeof error?.pressureAction !== 'string' : stryMutAct_9fa48("124833") ? true : (stryCov_9fa48("124833", "124834"), typeof (stryMutAct_9fa48("124835") ? error.pressureAction : (stryCov_9fa48("124835"), error?.pressureAction)) === (stryMutAct_9fa48("124836") ? "" : (stryCov_9fa48("124836"), 'string')))) && (stryMutAct_9fa48("124839") ? error.pressureAction.length <= 0 : stryMutAct_9fa48("124838") ? error.pressureAction.length >= 0 : stryMutAct_9fa48("124837") ? true : (stryCov_9fa48("124837", "124838", "124839"), error.pressureAction.length > 0)))) {
        if (stryMutAct_9fa48("124840")) {
          {}
        } else {
          stryCov_9fa48("124840");
          result.pressureAction = error.pressureAction;
        }
      }
      if (stryMutAct_9fa48("124843") ? typeof error?.pressureReason === 'string' || error.pressureReason.length > 0 : stryMutAct_9fa48("124842") ? false : stryMutAct_9fa48("124841") ? true : (stryCov_9fa48("124841", "124842", "124843"), (stryMutAct_9fa48("124845") ? typeof error?.pressureReason !== 'string' : stryMutAct_9fa48("124844") ? true : (stryCov_9fa48("124844", "124845"), typeof (stryMutAct_9fa48("124846") ? error.pressureReason : (stryCov_9fa48("124846"), error?.pressureReason)) === (stryMutAct_9fa48("124847") ? "" : (stryCov_9fa48("124847"), 'string')))) && (stryMutAct_9fa48("124850") ? error.pressureReason.length <= 0 : stryMutAct_9fa48("124849") ? error.pressureReason.length >= 0 : stryMutAct_9fa48("124848") ? true : (stryCov_9fa48("124848", "124849", "124850"), error.pressureReason.length > 0)))) {
        if (stryMutAct_9fa48("124851")) {
          {}
        } else {
          stryCov_9fa48("124851");
          result.pressureReason = error.pressureReason;
        }
      }
      if (stryMutAct_9fa48("124854") ? error?.pressureSummary || typeof error.pressureSummary === 'object' : stryMutAct_9fa48("124853") ? false : stryMutAct_9fa48("124852") ? true : (stryCov_9fa48("124852", "124853", "124854"), (stryMutAct_9fa48("124855") ? error.pressureSummary : (stryCov_9fa48("124855"), error?.pressureSummary)) && (stryMutAct_9fa48("124857") ? typeof error.pressureSummary !== 'object' : stryMutAct_9fa48("124856") ? true : (stryCov_9fa48("124856", "124857"), typeof error.pressureSummary === (stryMutAct_9fa48("124858") ? "" : (stryCov_9fa48("124858"), 'object')))))) {
        if (stryMutAct_9fa48("124859")) {
          {}
        } else {
          stryCov_9fa48("124859");
          result.pressureSummary = stryMutAct_9fa48("124860") ? {} : (stryCov_9fa48("124860"), {
            ...error.pressureSummary
          });
        }
      }
      if (stryMutAct_9fa48("124862") ? false : stryMutAct_9fa48("124861") ? true : (stryCov_9fa48("124861", "124862"), Array.isArray(stryMutAct_9fa48("124863") ? error.participantFailures : (stryCov_9fa48("124863"), error?.participantFailures)))) {
        if (stryMutAct_9fa48("124864")) {
          {}
        } else {
          stryCov_9fa48("124864");
          result.participantFailures = stryMutAct_9fa48("124865") ? error.participantFailures.map(entry => ({
            ...entry
          })) : (stryCov_9fa48("124865"), error.participantFailures.filter(stryMutAct_9fa48("124866") ? () => undefined : (stryCov_9fa48("124866"), entry => stryMutAct_9fa48("124869") ? entry || typeof entry === 'object' : stryMutAct_9fa48("124868") ? false : stryMutAct_9fa48("124867") ? true : (stryCov_9fa48("124867", "124868", "124869"), entry && (stryMutAct_9fa48("124871") ? typeof entry !== 'object' : stryMutAct_9fa48("124870") ? true : (stryCov_9fa48("124870", "124871"), typeof entry === (stryMutAct_9fa48("124872") ? "" : (stryCov_9fa48("124872"), 'object'))))))).map(stryMutAct_9fa48("124873") ? () => undefined : (stryCov_9fa48("124873"), entry => stryMutAct_9fa48("124874") ? {} : (stryCov_9fa48("124874"), {
            ...entry
          }))));
        }
      }
      if (stryMutAct_9fa48("124877") ? error?.firstFailedParticipant || typeof error.firstFailedParticipant === 'object' : stryMutAct_9fa48("124876") ? false : stryMutAct_9fa48("124875") ? true : (stryCov_9fa48("124875", "124876", "124877"), (stryMutAct_9fa48("124878") ? error.firstFailedParticipant : (stryCov_9fa48("124878"), error?.firstFailedParticipant)) && (stryMutAct_9fa48("124880") ? typeof error.firstFailedParticipant !== 'object' : stryMutAct_9fa48("124879") ? true : (stryCov_9fa48("124879", "124880"), typeof error.firstFailedParticipant === (stryMutAct_9fa48("124881") ? "" : (stryCov_9fa48("124881"), 'object')))))) {
        if (stryMutAct_9fa48("124882")) {
          {}
        } else {
          stryCov_9fa48("124882");
          result.firstFailedParticipant = stryMutAct_9fa48("124883") ? {} : (stryCov_9fa48("124883"), {
            ...error.firstFailedParticipant
          });
        }
      } else if (stryMutAct_9fa48("124886") ? Array.isArray(result.participantFailures) || result.participantFailures.length > 0 : stryMutAct_9fa48("124885") ? false : stryMutAct_9fa48("124884") ? true : (stryCov_9fa48("124884", "124885", "124886"), Array.isArray(result.participantFailures) && (stryMutAct_9fa48("124889") ? result.participantFailures.length <= 0 : stryMutAct_9fa48("124888") ? result.participantFailures.length >= 0 : stryMutAct_9fa48("124887") ? true : (stryCov_9fa48("124887", "124888", "124889"), result.participantFailures.length > 0)))) {
        if (stryMutAct_9fa48("124890")) {
          {}
        } else {
          stryCov_9fa48("124890");
          result.firstFailedParticipant = result.participantFailures[0];
        }
      }
      if (stryMutAct_9fa48("124893") ? typeof error?.reasonCode === 'string' || error.reasonCode.length > 0 : stryMutAct_9fa48("124892") ? false : stryMutAct_9fa48("124891") ? true : (stryCov_9fa48("124891", "124892", "124893"), (stryMutAct_9fa48("124895") ? typeof error?.reasonCode !== 'string' : stryMutAct_9fa48("124894") ? true : (stryCov_9fa48("124894", "124895"), typeof (stryMutAct_9fa48("124896") ? error.reasonCode : (stryCov_9fa48("124896"), error?.reasonCode)) === (stryMutAct_9fa48("124897") ? "" : (stryCov_9fa48("124897"), 'string')))) && (stryMutAct_9fa48("124900") ? error.reasonCode.length <= 0 : stryMutAct_9fa48("124899") ? error.reasonCode.length >= 0 : stryMutAct_9fa48("124898") ? true : (stryCov_9fa48("124898", "124899", "124900"), error.reasonCode.length > 0)))) {
        if (stryMutAct_9fa48("124901")) {
          {}
        } else {
          stryCov_9fa48("124901");
          result.reasonCode = error.reasonCode;
        }
      }
      if (stryMutAct_9fa48("124904") ? typeof error?.participationKind === 'string' || error.participationKind.length > 0 : stryMutAct_9fa48("124903") ? false : stryMutAct_9fa48("124902") ? true : (stryCov_9fa48("124902", "124903", "124904"), (stryMutAct_9fa48("124906") ? typeof error?.participationKind !== 'string' : stryMutAct_9fa48("124905") ? true : (stryCov_9fa48("124905", "124906"), typeof (stryMutAct_9fa48("124907") ? error.participationKind : (stryCov_9fa48("124907"), error?.participationKind)) === (stryMutAct_9fa48("124908") ? "" : (stryCov_9fa48("124908"), 'string')))) && (stryMutAct_9fa48("124911") ? error.participationKind.length <= 0 : stryMutAct_9fa48("124910") ? error.participationKind.length >= 0 : stryMutAct_9fa48("124909") ? true : (stryCov_9fa48("124909", "124910", "124911"), error.participationKind.length > 0)))) {
        if (stryMutAct_9fa48("124912")) {
          {}
        } else {
          stryCov_9fa48("124912");
          result.participationKind = error.participationKind;
        }
      }
      if (stryMutAct_9fa48("124915") ? typeof error?.tableName === 'string' || error.tableName.length > 0 : stryMutAct_9fa48("124914") ? false : stryMutAct_9fa48("124913") ? true : (stryCov_9fa48("124913", "124914", "124915"), (stryMutAct_9fa48("124917") ? typeof error?.tableName !== 'string' : stryMutAct_9fa48("124916") ? true : (stryCov_9fa48("124916", "124917"), typeof (stryMutAct_9fa48("124918") ? error.tableName : (stryCov_9fa48("124918"), error?.tableName)) === (stryMutAct_9fa48("124919") ? "" : (stryCov_9fa48("124919"), 'string')))) && (stryMutAct_9fa48("124922") ? error.tableName.length <= 0 : stryMutAct_9fa48("124921") ? error.tableName.length >= 0 : stryMutAct_9fa48("124920") ? true : (stryCov_9fa48("124920", "124921", "124922"), error.tableName.length > 0)))) {
        if (stryMutAct_9fa48("124923")) {
          {}
        } else {
          stryCov_9fa48("124923");
          result.tableName = error.tableName;
        }
      }
      if (stryMutAct_9fa48("124926") ? typeof error?.failedTable === 'string' || error.failedTable.length > 0 : stryMutAct_9fa48("124925") ? false : stryMutAct_9fa48("124924") ? true : (stryCov_9fa48("124924", "124925", "124926"), (stryMutAct_9fa48("124928") ? typeof error?.failedTable !== 'string' : stryMutAct_9fa48("124927") ? true : (stryCov_9fa48("124927", "124928"), typeof (stryMutAct_9fa48("124929") ? error.failedTable : (stryCov_9fa48("124929"), error?.failedTable)) === (stryMutAct_9fa48("124930") ? "" : (stryCov_9fa48("124930"), 'string')))) && (stryMutAct_9fa48("124933") ? error.failedTable.length <= 0 : stryMutAct_9fa48("124932") ? error.failedTable.length >= 0 : stryMutAct_9fa48("124931") ? true : (stryCov_9fa48("124931", "124932", "124933"), error.failedTable.length > 0)))) {
        if (stryMutAct_9fa48("124934")) {
          {}
        } else {
          stryCov_9fa48("124934");
          result.failedTable = error.failedTable;
        }
      }
      if (stryMutAct_9fa48("124937") ? typeof error?.outcome === 'string' || error.outcome.length > 0 : stryMutAct_9fa48("124936") ? false : stryMutAct_9fa48("124935") ? true : (stryCov_9fa48("124935", "124936", "124937"), (stryMutAct_9fa48("124939") ? typeof error?.outcome !== 'string' : stryMutAct_9fa48("124938") ? true : (stryCov_9fa48("124938", "124939"), typeof (stryMutAct_9fa48("124940") ? error.outcome : (stryCov_9fa48("124940"), error?.outcome)) === (stryMutAct_9fa48("124941") ? "" : (stryCov_9fa48("124941"), 'string')))) && (stryMutAct_9fa48("124944") ? error.outcome.length <= 0 : stryMutAct_9fa48("124943") ? error.outcome.length >= 0 : stryMutAct_9fa48("124942") ? true : (stryCov_9fa48("124942", "124943", "124944"), error.outcome.length > 0)))) {
        if (stryMutAct_9fa48("124945")) {
          {}
        } else {
          stryCov_9fa48("124945");
          result.outcome = error.outcome;
        }
      }
      if (stryMutAct_9fa48("124948") ? typeof error?.backpressured !== 'boolean' : stryMutAct_9fa48("124947") ? false : stryMutAct_9fa48("124946") ? true : (stryCov_9fa48("124946", "124947", "124948"), typeof (stryMutAct_9fa48("124949") ? error.backpressured : (stryCov_9fa48("124949"), error?.backpressured)) === (stryMutAct_9fa48("124950") ? "" : (stryCov_9fa48("124950"), 'boolean')))) {
        if (stryMutAct_9fa48("124951")) {
          {}
        } else {
          stryCov_9fa48("124951");
          result.backpressured = error.backpressured;
        }
      }
      return result;
    }
  }

  /**
   * Parse a SQL statement without executing.
   * @param {string} sql - SQL string.
   * @return {Object} Parsed AST.
   */
  parse(sql) {
    if (stryMutAct_9fa48("124952")) {
      {}
    } else {
      stryCov_9fa48("124952");
      const parser = new SQLParser(sql);
      return parser.parse();
    }
  }

  /**
   * Resolve partitions for a query without executing.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause AST.
   * @return {Array} Partition IDs.
   */
  resolvePartitions(tableName, whereClause) {
    if (stryMutAct_9fa48("124953")) {
      {}
    } else {
      stryCov_9fa48("124953");
      const partitions = this.getTablePartitions(tableName);
      return this.partitionResolver.resolvePartitions(tableName, whereClause, partitions);
    }
  }
}
export { SQLQueryEngine };