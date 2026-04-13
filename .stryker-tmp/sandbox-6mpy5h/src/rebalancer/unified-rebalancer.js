/**
 * Unified Rebalancer - Manages replica placement for partitions and message groups.
 * Uses the same algorithm for all scenarios, driven by policies.
 * Operates fully autonomously - operators never manually specify replica placement.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.10
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
import { EventEmitter } from 'events';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { getPartitionRowFromCache, isCriticalTransportControlPlanePartition as isCriticalTransportControlPlanePartitionTable, isPriorityControlPlanePartition, isSystemTablePartition } from '../bootstrap/system-partition-classification.js';
import { isBackgroundWorkReadySnapshot as isBackgroundWorkLifecycleReadySnapshot } from '../bootstrap/traffic-readiness-utils.js';
import { StartupRecoveryCoordinator } from '../bootstrap/startup-recovery-coordinator.js';
import { MovePlanner } from './move-planner.js';
import { StoragePressureBehavior } from './storage-pressure-behavior.js';
import { COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE, OperationType, ReplicaStatus, TERMINAL_STATUSES, isReplaceRemoveDispatchPhase, TERMINAL_STATUS_SQL_CLAUSE, isCoordinatorOwnedOperationType, isTerminalStep, isValidWorkflowStep } from './replica-status.js';
import { assertCritical } from '../utils/assert.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { ControlPlaneReadinessService } from '../control-plane/control-plane-readiness-service.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { isNodeReadyWithConnection, isNodeReadyWithTransport, isNodeReadyLeaseExplicitlyCleared, isNodeRecordReady, wasNodeRecordReadyWhenWritten } from '../node/node-readiness-policy.js';
import { PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { getLocalControlPlaneMutationReadinessBlocker } from '../control-plane/control-plane-mutation-readiness.js';
import { buildPriorityRecoveryOperationAssessment, buildPriorityRecoveryBlockedPartitions, DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS, hasPriorityRecoverySpreadGap, resolvePriorityRecoveryActiveNodeCohort, resolveTrackedPriorityRecoveryAdmissionPlan, shouldPriorityRecoveryOperationBlockPlanning } from '../control-plane/priority-recovery-snapshot.js';
import { CONTROL_PLANE_PUBLICATION_STATUS } from '../control-plane/control-plane-publication-merge.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { LIFECYCLE_PHASE } from '../bootstrap/lifecycle-controller-constants.js';
import { REBALANCER_CONFIG_KEY, REBALANCER_DEFAULT, REBALANCER_DEFAULT_POLICY, REBALANCER_ENTITY_TYPE, REBALANCER_ERROR_MSG, REBALANCER_EVENT, REBALANCER_LOG_MSG, REBALANCER_MOVE_TYPE, REBALANCER_NODE_STATUS, REBALANCER_QUEUE_NAME, REBALANCER_SKIP_REASON, REBALANCER_SUBSYSTEM, REBALANCER_TRIGGER, READINESS_SKIP_DETAIL, STABILIZATION_RESET_TRIGGER } from './rebalancer-constants.js';
import { CLUSTER_READINESS_TIMEOUT_MS } from '../constants/cdc-lifecycle-constants.js';
import { COLUMN, ENDPOINT_STATUS, META_SERVICE_ID, NUM, STATE, SERVICE_STATUS, TABLES, TRANSPORT_TYPE, TYPEOF, WORKFLOW_STEP } from '../constants/index.js';
import { ENDPOINT_SYNC_HEALTH } from '../runtime/endpoint-sync-constants.js';
import { normalizeNodeRow, normalizeNodeEndpointRow, normalizeServiceEndpointRow, normalizeServiceRow } from '../control-plane/system-row-normalizers.js';
import { OwnerKeyReconcileQueue } from '../workflow/owner-key-reconcile-queue.js';
import { RECONCILE_REASON } from '../workflow/reconcile-queue-constants.js';
import { adjustToOddCount, getNextOddCount, getPreviousOddCount, isOddReplicaCount } from './odd-replica-count.js';
import { isReplicaOperationInFlight, isReplicaOperationStale, normalizeReplicaOperationRecord } from './replica-operation-liveness.js';
const UNIFIED_REBALANCER_LITERAL = Object.freeze(stryMutAct_9fa48("141943") ? {} : (stryCov_9fa48("141943"), {
  ADMISSION_DENIED: stryMutAct_9fa48("141944") ? "" : (stryCov_9fa48("141944"), "admission_denied"),
  BACKGROUND: stryMutAct_9fa48("141945") ? "" : (stryCov_9fa48("141945"), "background"),
  BOOTSTRAPREADINESSSTATE: stryMutAct_9fa48("141946") ? "" : (stryCov_9fa48("141946"), "bootstrapReadinessState"),
  CDCINTEGRATIONSERVICE: stryMutAct_9fa48("141947") ? "" : (stryCov_9fa48("141947"), "cdcIntegrationService"),
  CRITICAL: stryMutAct_9fa48("141948") ? "" : (stryCov_9fa48("141948"), "critical"),
  EMPTY_STRING: stryMutAct_9fa48("141949") ? "Stryker was here!" : (stryCov_9fa48("141949"), ""),
  FUNCTION: stryMutAct_9fa48("141950") ? "" : (stryCov_9fa48("141950"), "function"),
  MESSAGEROUTER: stryMutAct_9fa48("141951") ? "" : (stryCov_9fa48("141951"), "messageRouter"),
  MOVE: stryMutAct_9fa48("141952") ? "" : (stryCov_9fa48("141952"), "move"),
  NODES: stryMutAct_9fa48("141953") ? "" : (stryCov_9fa48("141953"), "nodes"),
  NUMBER: stryMutAct_9fa48("141954") ? "" : (stryCov_9fa48("141954"), "number"),
  ONE: 1,
  ONE_POINT_FIVE: 1.5,
  READ: stryMutAct_9fa48("141955") ? "" : (stryCov_9fa48("141955"), "read"),
  REBALANCECOORDINATOR: stryMutAct_9fa48("141956") ? "" : (stryCov_9fa48("141956"), "rebalanceCoordinator"),
  REBALANCER_COLON_SCHEDULE: stryMutAct_9fa48("141957") ? "" : (stryCov_9fa48("141957"), "rebalancer:schedule"),
  SCHEDULED: stryMutAct_9fa48("141958") ? "" : (stryCov_9fa48("141958"), "scheduled"),
  SERVICES: stryMutAct_9fa48("141959") ? "" : (stryCov_9fa48("141959"), "services"),
  SQLQUERYENGINE: stryMutAct_9fa48("141960") ? "" : (stryCov_9fa48("141960"), "sqlQueryEngine"),
  STARTUPRECOVERYCOORDINATOR: stryMutAct_9fa48("141961") ? "" : (stryCov_9fa48("141961"), "startupRecoveryCoordinator"),
  SYSTEMTABLECACHE: stryMutAct_9fa48("141962") ? "" : (stryCov_9fa48("141962"), "systemTableCache"),
  TABLEPOLICYSERVICE: stryMutAct_9fa48("141963") ? "" : (stryCov_9fa48("141963"), "tablePolicyService"),
  THOUSAND: 1000,
  TWO: 2,
  UPDATE: stryMutAct_9fa48("141964") ? "" : (stryCov_9fa48("141964"), "UPDATE"),
  ZERO: 0
}));
const EntityType = REBALANCER_ENTITY_TYPE;
const TriggerType = REBALANCER_TRIGGER;
const MoveType = REBALANCER_MOVE_TYPE;
const NodeStatus = REBALANCER_NODE_STATUS;
const DEFAULT_TABLE_POLICY = REBALANCER_DEFAULT_POLICY.TABLE;
const DEFAULT_MESSAGE_GROUP_POLICY = REBALANCER_DEFAULT_POLICY.MESSAGE_GROUP;
const SQL_BUDGET = Object.freeze(stryMutAct_9fa48("141965") ? {} : (stryCov_9fa48("141965"), {
  SELECT_REBALANCE_BUDGET: stryMutAct_9fa48("141966") ? "" : (stryCov_9fa48("141966"), 'SELECT config_value FROM config WHERE config_key = ? LIMIT 1'),
  SELECT_IN_FLIGHT_COUNT: stryMutAct_9fa48("141967") ? `` : (stryCov_9fa48("141967"), `SELECT COUNT(*) AS total_count FROM replica_operations
     WHERE type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
     AND status NOT IN (${TERMINAL_STATUS_SQL_CLAUSE})`)
}));
const PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS = Object.freeze(stryMutAct_9fa48("141968") ? {} : (stryCov_9fa48("141968"), {
  preferAuthoritativeCount: stryMutAct_9fa48("141969") ? false : (stryCov_9fa48("141969"), true),
  bypassEmptyQueryDelay: stryMutAct_9fa48("141970") ? false : (stryCov_9fa48("141970"), true)
}));
const PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT = 3;
const CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON = Object.freeze(stryMutAct_9fa48("141971") ? {} : (stryCov_9fa48("141971"), {
  NODE_READY_LEASE_INCOMPLETE: stryMutAct_9fa48("141972") ? "" : (stryCov_9fa48("141972"), 'node_ready_lease_incomplete'),
  TRANSITIONAL_NODE_MEMBERSHIP: stryMutAct_9fa48("141973") ? "" : (stryCov_9fa48("141973"), 'transitional_node_membership'),
  TRANSPORT_MEMBERSHIP_EXCEEDS_NODES_CACHE: stryMutAct_9fa48("141974") ? "" : (stryCov_9fa48("141974"), 'transport_membership_exceeds_nodes_cache'),
  ENDPOINT_VISIBILITY_INCOMPLETE: stryMutAct_9fa48("141975") ? "" : (stryCov_9fa48("141975"), 'endpoint_visibility_incomplete'),
  TOPOLOGY_OPERATIONS_IN_FLIGHT: stryMutAct_9fa48("141976") ? "" : (stryCov_9fa48("141976"), 'topology_operations_in_flight')
}));
const TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE = Object.freeze(stryMutAct_9fa48("141977") ? {} : (stryCov_9fa48("141977"), {
  CACHE: stryMutAct_9fa48("141978") ? "" : (stryCov_9fa48("141978"), 'cache'),
  AUTHORITATIVE: stryMutAct_9fa48("141979") ? "" : (stryCov_9fa48("141979"), 'authoritative')
}));
const REBALANCER_RUNTIME_REASON = Object.freeze(stryMutAct_9fa48("141980") ? {} : (stryCov_9fa48("141980"), {
  NODE_BECAME_READY: stryMutAct_9fa48("141981") ? "" : (stryCov_9fa48("141981"), 'node_became_ready'),
  NODE_FAILED: stryMutAct_9fa48("141982") ? "" : (stryCov_9fa48("141982"), 'node_failed'),
  NODE_LEFT_READY: stryMutAct_9fa48("141983") ? "" : (stryCov_9fa48("141983"), 'node_left_ready'),
  NOT_LEADER: stryMutAct_9fa48("141984") ? "" : (stryCov_9fa48("141984"), 'not_leader'),
  NO_AVAILABLE_NODES: stryMutAct_9fa48("141985") ? "" : (stryCov_9fa48("141985"), 'no_available_nodes'),
  NO_CHANGES_NEEDED: stryMutAct_9fa48("141986") ? "" : (stryCov_9fa48("141986"), 'no_changes_needed'),
  SHUTDOWN_IN_PROGRESS: stryMutAct_9fa48("141987") ? "" : (stryCov_9fa48("141987"), 'shutdown_in_progress')
}));

/**
 * UnifiedRebalancer manages replica placement for both partitions and message groups.
 * Each partition/message group leader runs its own rebalancer instance.
 * Leaders make independent decisions that converge to optimal state.
 *
 * NOTE: This class delegates operation execution to RebalanceCoordinator.
 */
class UnifiedRebalancer extends EventEmitter {
  /**
   * Create a new UnifiedRebalancer instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.entityId - Partition ID or message group ID.
   * @param {string} options.entityType - 'partition' or 'message_group'.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.tablePolicyService - TablePolicyService for policy lookup.
   * @param {string} options.nodeId - Current node ID.
   * @param {Object} options.rebalanceCoordinator - RebalanceCoordinator for operation execution.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("141988")) {
      {}
    } else {
      stryCov_9fa48("141988");
      super();
      this.entityId = assertCritical(options.entityId, REBALANCER_ERROR_MSG.ENTITY_ID_REQUIRED);
      this.entityType = assertCritical(options.entityType, REBALANCER_ERROR_MSG.ENTITY_TYPE_REQUIRED);
      this.systemTableCache = assertCritical(options.systemTableCache, REBALANCER_ERROR_MSG.CACHE_REQUIRED);
      this.cdcIntegrationService = assertCritical(options.cdcIntegrationService, REBALANCER_ERROR_MSG.CDC_REQUIRED);
      this.tablePolicyService = assertCritical(options.tablePolicyService, REBALANCER_ERROR_MSG.POLICY_REQUIRED);
      this.nodeId = assertCritical(options.nodeId, REBALANCER_ERROR_MSG.NODE_ID_REQUIRED);
      this.messageRouter = assertCritical(options.messageRouter, REBALANCER_ERROR_MSG.ROUTER_REQUIRED);
      this.sqlQueryEngine = stryMutAct_9fa48("141991") ? options.sqlQueryEngine && null : stryMutAct_9fa48("141990") ? false : stryMutAct_9fa48("141989") ? true : (stryCov_9fa48("141989", "141990", "141991"), options.sqlQueryEngine || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("141994") ? options.controlPlaneSystemTableGateway && createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () => this.sqlQueryEngine,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemTableCache,
        getMessageRouter: () => this.messageRouter
      }).controlPlaneSystemTableGateway : stryMutAct_9fa48("141993") ? false : stryMutAct_9fa48("141992") ? true : (stryCov_9fa48("141992", "141993", "141994"), options.controlPlaneSystemTableGateway || createControlPlaneRuntimeBundle(stryMutAct_9fa48("141995") ? {} : (stryCov_9fa48("141995"), {
        nodeId: this.nodeId,
        getSqlQueryEngine: stryMutAct_9fa48("141996") ? () => undefined : (stryCov_9fa48("141996"), () => this.sqlQueryEngine),
        getCdcIntegrationService: stryMutAct_9fa48("141997") ? () => undefined : (stryCov_9fa48("141997"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("141998") ? () => undefined : (stryCov_9fa48("141998"), () => this.systemTableCache),
        getMessageRouter: stryMutAct_9fa48("141999") ? () => undefined : (stryCov_9fa48("141999"), () => this.messageRouter)
      })).controlPlaneSystemTableGateway);

      // RebalanceCoordinator for delegated operation execution (Requirements 2.5)
      this.rebalanceCoordinator = assertCritical(options.rebalanceCoordinator, REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED);
      this.nowFn = (stryMutAct_9fa48("142002") ? typeof options.nowFn !== UNIFIED_REBALANCER_LITERAL.FUNCTION : stryMutAct_9fa48("142001") ? false : stryMutAct_9fa48("142000") ? true : (stryCov_9fa48("142000", "142001", "142002"), typeof options.nowFn === UNIFIED_REBALANCER_LITERAL.FUNCTION)) ? options.nowFn : Date.now;

      // Leadership state
      this.isLeader = stryMutAct_9fa48("142003") ? true : (stryCov_9fa48("142003"), false);

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.periodicCheckIntervalMs = stryMutAct_9fa48("142006") ? config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_INTERVAL_MS) && REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_INTERVAL_MS : stryMutAct_9fa48("142005") ? false : stryMutAct_9fa48("142004") ? true : (stryCov_9fa48("142004", "142005", "142006"), config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_INTERVAL_MS) || REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_INTERVAL_MS);
      this.periodicCheckJitterMs = stryMutAct_9fa48("142009") ? config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_JITTER_MS) && REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_JITTER_MS : stryMutAct_9fa48("142008") ? false : stryMutAct_9fa48("142007") ? true : (stryCov_9fa48("142007", "142008", "142009"), config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_JITTER_MS) || REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_JITTER_MS);
      this.criticalCheckDelayMs = stryMutAct_9fa48("142012") ? config.get(REBALANCER_CONFIG_KEY.CRITICAL_CHECK_DELAY_MS) && REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS : stryMutAct_9fa48("142011") ? false : stryMutAct_9fa48("142010") ? true : (stryCov_9fa48("142010", "142011", "142012"), config.get(REBALANCER_CONFIG_KEY.CRITICAL_CHECK_DELAY_MS) || REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS);
      this.maxConcurrentMoves = stryMutAct_9fa48("142015") ? config.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_MOVES) && REBALANCER_DEFAULT.UNIFIED.MAX_CONCURRENT_MOVES : stryMutAct_9fa48("142014") ? false : stryMutAct_9fa48("142013") ? true : (stryCov_9fa48("142013", "142014", "142015"), config.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_MOVES) || REBALANCER_DEFAULT.UNIFIED.MAX_CONCURRENT_MOVES);
      this.moveTimeoutMs = stryMutAct_9fa48("142018") ? config.get(REBALANCER_CONFIG_KEY.MOVE_TIMEOUT_MS) && REBALANCER_DEFAULT.UNIFIED.MOVE_TIMEOUT_MS : stryMutAct_9fa48("142017") ? false : stryMutAct_9fa48("142016") ? true : (stryCov_9fa48("142016", "142017", "142018"), config.get(REBALANCER_CONFIG_KEY.MOVE_TIMEOUT_MS) || REBALANCER_DEFAULT.UNIFIED.MOVE_TIMEOUT_MS);
      this.moveBatchSize = stryMutAct_9fa48("142021") ? config.get(REBALANCER_CONFIG_KEY.MOVE_BATCH_SIZE) && REBALANCER_DEFAULT.UNIFIED.MOVE_BATCH_SIZE : stryMutAct_9fa48("142020") ? false : stryMutAct_9fa48("142019") ? true : (stryCov_9fa48("142019", "142020", "142021"), config.get(REBALANCER_CONFIG_KEY.MOVE_BATCH_SIZE) || REBALANCER_DEFAULT.UNIFIED.MOVE_BATCH_SIZE);
      this.interBatchDelayMs = stryMutAct_9fa48("142024") ? config.get(REBALANCER_CONFIG_KEY.INTER_BATCH_DELAY_MS) && REBALANCER_DEFAULT.UNIFIED.INTER_BATCH_DELAY_MS : stryMutAct_9fa48("142023") ? false : stryMutAct_9fa48("142022") ? true : (stryCov_9fa48("142022", "142023", "142024"), config.get(REBALANCER_CONFIG_KEY.INTER_BATCH_DELAY_MS) || REBALANCER_DEFAULT.UNIFIED.INTER_BATCH_DELAY_MS);
      this.rebalanceBudget = stryMutAct_9fa48("142027") ? config.get(REBALANCER_CONFIG_KEY.REBALANCE_BUDGET) && REBALANCER_DEFAULT.UNIFIED.REBALANCE_BUDGET : stryMutAct_9fa48("142026") ? false : stryMutAct_9fa48("142025") ? true : (stryCov_9fa48("142025", "142026", "142027"), config.get(REBALANCER_CONFIG_KEY.REBALANCE_BUDGET) || REBALANCER_DEFAULT.UNIFIED.REBALANCE_BUDGET);
      this.criticalBudgetMultiplier = REBALANCER_DEFAULT.UNIFIED.CRITICAL_BUDGET_MULTIPLIER;
      this.nodeCpuThreshold = stryMutAct_9fa48("142030") ? config.get(REBALANCER_CONFIG_KEY.NODE_CPU_THRESHOLD) && REBALANCER_DEFAULT.UNIFIED.NODE_CPU_THRESHOLD : stryMutAct_9fa48("142029") ? false : stryMutAct_9fa48("142028") ? true : (stryCov_9fa48("142028", "142029", "142030"), config.get(REBALANCER_CONFIG_KEY.NODE_CPU_THRESHOLD) || REBALANCER_DEFAULT.UNIFIED.NODE_CPU_THRESHOLD);
      this.nodeMemoryThreshold = stryMutAct_9fa48("142033") ? config.get(REBALANCER_CONFIG_KEY.NODE_MEMORY_THRESHOLD) && REBALANCER_DEFAULT.UNIFIED.NODE_MEMORY_THRESHOLD : stryMutAct_9fa48("142032") ? false : stryMutAct_9fa48("142031") ? true : (stryCov_9fa48("142031", "142032", "142033"), config.get(REBALANCER_CONFIG_KEY.NODE_MEMORY_THRESHOLD) || REBALANCER_DEFAULT.UNIFIED.NODE_MEMORY_THRESHOLD);
      this.nodeDiskThreshold = stryMutAct_9fa48("142036") ? config.get(REBALANCER_CONFIG_KEY.NODE_DISK_THRESHOLD) && REBALANCER_DEFAULT.UNIFIED.NODE_DISK_THRESHOLD : stryMutAct_9fa48("142035") ? false : stryMutAct_9fa48("142034") ? true : (stryCov_9fa48("142034", "142035", "142036"), config.get(REBALANCER_CONFIG_KEY.NODE_DISK_THRESHOLD) || REBALANCER_DEFAULT.UNIFIED.NODE_DISK_THRESHOLD);
      this.priorityRecoveryActivityStaleGraceMs = Number.isFinite(options.priorityRecoveryActivityStaleGraceMs) ? stryMutAct_9fa48("142037") ? Math.min(NUM.ZERO, Math.floor(options.priorityRecoveryActivityStaleGraceMs)) : (stryCov_9fa48("142037"), Math.max(NUM.ZERO, Math.floor(options.priorityRecoveryActivityStaleGraceMs))) : DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS;
      this.priorityRecoveryAdmissionTracker = stryMutAct_9fa48("142038") ? {} : (stryCov_9fa48("142038"), {
        lastObservedAdmissionPlan: null,
        lastObservedAdmissionPlanAtMs: null
      });
      this.enableReadinessPing = stryMutAct_9fa48("142041") ? config.get(REBALANCER_CONFIG_KEY.READINESS_PING_ENABLED) && REBALANCER_DEFAULT.UNIFIED.READINESS_PING_ENABLED : stryMutAct_9fa48("142040") ? false : stryMutAct_9fa48("142039") ? true : (stryCov_9fa48("142039", "142040", "142041"), config.get(REBALANCER_CONFIG_KEY.READINESS_PING_ENABLED) || REBALANCER_DEFAULT.UNIFIED.READINESS_PING_ENABLED);
      this.readinessPingTimeoutMs = stryMutAct_9fa48("142044") ? config.get(REBALANCER_CONFIG_KEY.READINESS_PING_TIMEOUT_MS) && REBALANCER_DEFAULT.UNIFIED.READINESS_PING_TIMEOUT_MS : stryMutAct_9fa48("142043") ? false : stryMutAct_9fa48("142042") ? true : (stryCov_9fa48("142042", "142043", "142044"), config.get(REBALANCER_CONFIG_KEY.READINESS_PING_TIMEOUT_MS) || REBALANCER_DEFAULT.UNIFIED.READINESS_PING_TIMEOUT_MS);

      // Stabilization period configuration (Requirements 2.1)
      const configuredStabilization = config.get(REBALANCER_CONFIG_KEY.STABILIZATION_PERIOD_MS);
      this.minStabilizationMs = REBALANCER_DEFAULT.UNIFIED.MIN_STABILIZATION_MS;
      this.maxStabilizationMs = REBALANCER_DEFAULT.UNIFIED.MAX_STABILIZATION_MS;
      this.defaultStabilizationMs = REBALANCER_DEFAULT.UNIFIED.DEFAULT_STABILIZATION_MS;
      // Clamp to valid range [1000ms, 10000ms] with default 1000ms
      this.stabilizationPeriodMs = this.clampStabilizationPeriod(stryMutAct_9fa48("142045") ? configuredStabilization && this.defaultStabilizationMs : (stryCov_9fa48("142045"), configuredStabilization ?? this.defaultStabilizationMs));
      this.systemPartitionStartDelayMs = this.resolveNonNegativeMs(config.get(REBALANCER_CONFIG_KEY.SYSTEM_PARTITION_START_DELAY_MS), REBALANCER_DEFAULT.UNIFIED.SYSTEM_PARTITION_START_DELAY_MS);
      this.userPartitionStartDelayMs = this.resolveNonNegativeMs(config.get(REBALANCER_CONFIG_KEY.USER_PARTITION_START_DELAY_MS), REBALANCER_DEFAULT.UNIFIED.USER_PARTITION_START_DELAY_MS);
      // Per-entity random offset spreads start-delay eligibility across
      // the jitter window so all system partitions don't become eligible
      // simultaneously (thundering herd prevention).
      this.rebalanceStartAtMs = stryMutAct_9fa48("142046") ? Date.now() - Math.floor(Math.random() * this.periodicCheckJitterMs) : (stryCov_9fa48("142046"), Date.now() + Math.floor(stryMutAct_9fa48("142047") ? Math.random() / this.periodicCheckJitterMs : (stryCov_9fa48("142047"), Math.random() * this.periodicCheckJitterMs)));

      // Stabilization state
      // Initialize to current time so rebalancer waits for stabilization period
      // before first check (prevents premature rebalancing during bootstrap)
      this.lastStateChangeTime = Date.now();
      this.stabilizationTimer = null;

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED) : console;

      // State
      this.lastRebalanceTime = null;
      this.rebalanceCount = UNIFIED_REBALANCER_LITERAL.ZERO;
      this.lastDegradedTargetSignal = null;
      this.lastSuboptimalSignal = null;

      // Scheduler state
      this.scheduledCheck = null;
      this.currentInterval = this.periodicCheckIntervalMs;
      this.maxInterval = stryMutAct_9fa48("142048") ? this.periodicCheckIntervalMs / UNIFIED_REBALANCER_LITERAL.TWO : (stryCov_9fa48("142048"), this.periodicCheckIntervalMs * UNIFIED_REBALANCER_LITERAL.TWO);

      // Storage capacity services.
      this.storageAdmissionService = stryMutAct_9fa48("142051") ? (options.storageAdmissionService || this.rebalanceCoordinator?.storageAdmissionService) && null : stryMutAct_9fa48("142050") ? false : stryMutAct_9fa48("142049") ? true : (stryCov_9fa48("142049", "142050", "142051"), (stryMutAct_9fa48("142053") ? options.storageAdmissionService && this.rebalanceCoordinator?.storageAdmissionService : stryMutAct_9fa48("142052") ? false : (stryCov_9fa48("142052", "142053"), options.storageAdmissionService || (stryMutAct_9fa48("142054") ? this.rebalanceCoordinator.storageAdmissionService : (stryCov_9fa48("142054"), this.rebalanceCoordinator?.storageAdmissionService)))) || null);
      this.storageAccountingService = stryMutAct_9fa48("142057") ? (options.storageAccountingService || this.rebalanceCoordinator?.storageAccountingService) && null : stryMutAct_9fa48("142056") ? false : stryMutAct_9fa48("142055") ? true : (stryCov_9fa48("142055", "142056", "142057"), (stryMutAct_9fa48("142059") ? options.storageAccountingService && this.rebalanceCoordinator?.storageAccountingService : stryMutAct_9fa48("142058") ? false : (stryCov_9fa48("142058", "142059"), options.storageAccountingService || (stryMutAct_9fa48("142060") ? this.rebalanceCoordinator.storageAccountingService : (stryCov_9fa48("142060"), this.rebalanceCoordinator?.storageAccountingService)))) || null);
      this.managesStoragePressureBehavior = stryMutAct_9fa48("142061") ? options.storagePressureBehavior : (stryCov_9fa48("142061"), !options.storagePressureBehavior);
      this.storagePressureBehavior = stryMutAct_9fa48("142064") ? options.storagePressureBehavior && (this.storageAccountingService ? new StoragePressureBehavior({
        accountingService: this.storageAccountingService
      }) : null) : stryMutAct_9fa48("142063") ? false : stryMutAct_9fa48("142062") ? true : (stryCov_9fa48("142062", "142063", "142064"), options.storagePressureBehavior || (this.storageAccountingService ? new StoragePressureBehavior(stryMutAct_9fa48("142065") ? {} : (stryCov_9fa48("142065"), {
        accountingService: this.storageAccountingService
      })) : null));
      this.cdcGroupPropagationService = stryMutAct_9fa48("142068") ? (options.cdcGroupPropagationService || this.rebalanceCoordinator?.cdcGroupPropagationService) && null : stryMutAct_9fa48("142067") ? false : stryMutAct_9fa48("142066") ? true : (stryCov_9fa48("142066", "142067", "142068"), (stryMutAct_9fa48("142070") ? options.cdcGroupPropagationService && this.rebalanceCoordinator?.cdcGroupPropagationService : stryMutAct_9fa48("142069") ? false : (stryCov_9fa48("142069", "142070"), options.cdcGroupPropagationService || (stryMutAct_9fa48("142071") ? this.rebalanceCoordinator.cdcGroupPropagationService : (stryCov_9fa48("142071"), this.rebalanceCoordinator?.cdcGroupPropagationService)))) || null);
      this.bootstrapReadinessState = stryMutAct_9fa48("142074") ? (options.bootstrapReadinessState || this.rebalanceCoordinator?.bootstrapReadinessState) && null : stryMutAct_9fa48("142073") ? false : stryMutAct_9fa48("142072") ? true : (stryCov_9fa48("142072", "142073", "142074"), (stryMutAct_9fa48("142076") ? options.bootstrapReadinessState && this.rebalanceCoordinator?.bootstrapReadinessState : stryMutAct_9fa48("142075") ? false : (stryCov_9fa48("142075", "142076"), options.bootstrapReadinessState || (stryMutAct_9fa48("142077") ? this.rebalanceCoordinator.bootstrapReadinessState : (stryCov_9fa48("142077"), this.rebalanceCoordinator?.bootstrapReadinessState)))) || null);
      this.startupRecoveryCoordinator = stryMutAct_9fa48("142080") ? (options.startupRecoveryCoordinator || this.rebalanceCoordinator?.startupRecoveryCoordinator) && new StartupRecoveryCoordinator({
        readinessState: this.bootstrapReadinessState
      }) : stryMutAct_9fa48("142079") ? false : stryMutAct_9fa48("142078") ? true : (stryCov_9fa48("142078", "142079", "142080"), (stryMutAct_9fa48("142082") ? options.startupRecoveryCoordinator && this.rebalanceCoordinator?.startupRecoveryCoordinator : stryMutAct_9fa48("142081") ? false : (stryCov_9fa48("142081", "142082"), options.startupRecoveryCoordinator || (stryMutAct_9fa48("142083") ? this.rebalanceCoordinator.startupRecoveryCoordinator : (stryCov_9fa48("142083"), this.rebalanceCoordinator?.startupRecoveryCoordinator)))) || new StartupRecoveryCoordinator(stryMutAct_9fa48("142084") ? {} : (stryCov_9fa48("142084"), {
        readinessState: this.bootstrapReadinessState
      })));
      this.controlPlaneReadinessService = stryMutAct_9fa48("142087") ? options.controlPlaneReadinessService && new ControlPlaneReadinessService({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        storageAccountingService: this.storageAccountingService,
        cdcIntegrationService: this.cdcIntegrationService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway
      }) : stryMutAct_9fa48("142086") ? false : stryMutAct_9fa48("142085") ? true : (stryCov_9fa48("142085", "142086", "142087"), options.controlPlaneReadinessService || new ControlPlaneReadinessService(stryMutAct_9fa48("142088") ? {} : (stryCov_9fa48("142088"), {
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        storageAccountingService: this.storageAccountingService,
        cdcIntegrationService: this.cdcIntegrationService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway
      })));

      // Cluster readiness gate (optional, for bootstrap-lifecycle-hardening)
      // When provided, defers first planning cycle until cluster is ready.
      this.clusterReadinessSignal = stryMutAct_9fa48("142091") ? options.clusterReadinessSignal && null : stryMutAct_9fa48("142090") ? false : stryMutAct_9fa48("142089") ? true : (stryCov_9fa48("142089", "142090", "142091"), options.clusterReadinessSignal || null);
      this.clusterReadinessConfirmed = stryMutAct_9fa48("142092") ? this.clusterReadinessSignal : (stryCov_9fa48("142092"), !this.clusterReadinessSignal);
      this.clusterReadinessStartMs = null;
      this.clusterReadinessTimeoutMs = CLUSTER_READINESS_TIMEOUT_MS;

      // Planning is delegated to MovePlanner (single-path planning).
      this.movePlanner = new MovePlanner(stryMutAct_9fa48("142093") ? {} : (stryCov_9fa48("142093"), {
        entityId: this.entityId,
        entityType: this.entityType,
        moveStateProvider: this,
        storageAdmissionService: this.storageAdmissionService,
        accountingService: this.storageAccountingService,
        storagePressureBehavior: this.storagePressureBehavior,
        strictOwnerDependencies: stryMutAct_9fa48("142094") ? false : (stryCov_9fa48("142094"), true)
      }));
      this.syncOwnerDependenciesFromCoordinator(this.rebalanceCoordinator);
      this.isShuttingDown = stryMutAct_9fa48("142095") ? true : (stryCov_9fa48("142095"), false);
      this.initialized = stryMutAct_9fa48("142096") ? true : (stryCov_9fa48("142096"), false);
      this.rebalanceCheckQueue = new OwnerKeyReconcileQueue(stryMutAct_9fa48("142097") ? {} : (stryCov_9fa48("142097"), {
        name: stryMutAct_9fa48("142098") ? `` : (stryCov_9fa48("142098"), `${REBALANCER_QUEUE_NAME.REBALANCE_CHECK}:${this.entityId}`),
        reconcileFn: stryMutAct_9fa48("142099") ? () => undefined : (stryCov_9fa48("142099"), (_ownerKey, reasons) => this.reconcileRebalanceCheck(reasons))
      }));
    }
  }

  /**
   * Initialize the rebalancer.
   */
  initialize() {
    if (stryMutAct_9fa48("142100")) {
      {}
    } else {
      stryCov_9fa48("142100");
      if (stryMutAct_9fa48("142102") ? false : stryMutAct_9fa48("142101") ? true : (stryCov_9fa48("142101", "142102"), this.initialized)) {
        if (stryMutAct_9fa48("142103")) {
          {}
        } else {
          stryCov_9fa48("142103");
          return;
        }
      }
      this.isShuttingDown = stryMutAct_9fa48("142104") ? true : (stryCov_9fa48("142104"), false);
      this.logger.info(REBALANCER_LOG_MSG.INITIALIZED, stryMutAct_9fa48("142105") ? {} : (stryCov_9fa48("142105"), {
        entityId: this.entityId,
        entityType: this.entityType,
        nodeId: this.nodeId,
        usingCoordinator: stryMutAct_9fa48("142106") ? !this.rebalanceCoordinator : (stryCov_9fa48("142106"), !(stryMutAct_9fa48("142107") ? this.rebalanceCoordinator : (stryCov_9fa48("142107"), !this.rebalanceCoordinator)))
      }));
      this.initialized = stryMutAct_9fa48("142108") ? false : (stryCov_9fa48("142108"), true);
    }
  }

  /**
   * Set the RebalanceCoordinator for delegated operation execution.
   * Requirements: 2.5
   * @param {Object} coordinator - RebalanceCoordinator instance.
   */
  setRebalanceCoordinator(coordinator) {
    if (stryMutAct_9fa48("142109")) {
      {}
    } else {
      stryCov_9fa48("142109");
      this.rebalanceCoordinator = coordinator;
      this.syncOwnerDependenciesFromCoordinator(coordinator);
      this.logger.info(REBALANCER_LOG_MSG.COORDINATOR_SET, stryMutAct_9fa48("142110") ? {} : (stryCov_9fa48("142110"), {
        entityId: this.entityId,
        entityType: this.entityType,
        hasCoordinator: stryMutAct_9fa48("142111") ? !coordinator : (stryCov_9fa48("142111"), !(stryMutAct_9fa48("142112") ? coordinator : (stryCov_9fa48("142112"), !coordinator)))
      }));
    }
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    if (stryMutAct_9fa48("142113")) {
      {}
    } else {
      stryCov_9fa48("142113");
      if (stryMutAct_9fa48("142115") ? false : stryMutAct_9fa48("142114") ? true : (stryCov_9fa48("142114", "142115"), Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.SYSTEMTABLECACHE))) {
        if (stryMutAct_9fa48("142116")) {
          {}
        } else {
          stryCov_9fa48("142116");
          this.systemTableCache = stryMutAct_9fa48("142119") ? options.systemTableCache && null : stryMutAct_9fa48("142118") ? false : stryMutAct_9fa48("142117") ? true : (stryCov_9fa48("142117", "142118", "142119"), options.systemTableCache || null);
        }
      }
      if (stryMutAct_9fa48("142121") ? false : stryMutAct_9fa48("142120") ? true : (stryCov_9fa48("142120", "142121"), Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.CDCINTEGRATIONSERVICE))) {
        if (stryMutAct_9fa48("142122")) {
          {}
        } else {
          stryCov_9fa48("142122");
          this.cdcIntegrationService = stryMutAct_9fa48("142125") ? options.cdcIntegrationService && null : stryMutAct_9fa48("142124") ? false : stryMutAct_9fa48("142123") ? true : (stryCov_9fa48("142123", "142124", "142125"), options.cdcIntegrationService || null);
        }
      }
      if (stryMutAct_9fa48("142127") ? false : stryMutAct_9fa48("142126") ? true : (stryCov_9fa48("142126", "142127"), Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.TABLEPOLICYSERVICE))) {
        if (stryMutAct_9fa48("142128")) {
          {}
        } else {
          stryCov_9fa48("142128");
          this.tablePolicyService = stryMutAct_9fa48("142131") ? options.tablePolicyService && null : stryMutAct_9fa48("142130") ? false : stryMutAct_9fa48("142129") ? true : (stryCov_9fa48("142129", "142130", "142131"), options.tablePolicyService || null);
        }
      }
      if (stryMutAct_9fa48("142133") ? false : stryMutAct_9fa48("142132") ? true : (stryCov_9fa48("142132", "142133"), Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.MESSAGEROUTER))) {
        if (stryMutAct_9fa48("142134")) {
          {}
        } else {
          stryCov_9fa48("142134");
          this.messageRouter = stryMutAct_9fa48("142137") ? options.messageRouter && null : stryMutAct_9fa48("142136") ? false : stryMutAct_9fa48("142135") ? true : (stryCov_9fa48("142135", "142136", "142137"), options.messageRouter || null);
        }
      }
      if (stryMutAct_9fa48("142139") ? false : stryMutAct_9fa48("142138") ? true : (stryCov_9fa48("142138", "142139"), Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.SQLQUERYENGINE))) {
        if (stryMutAct_9fa48("142140")) {
          {}
        } else {
          stryCov_9fa48("142140");
          this.sqlQueryEngine = stryMutAct_9fa48("142143") ? options.sqlQueryEngine && null : stryMutAct_9fa48("142142") ? false : stryMutAct_9fa48("142141") ? true : (stryCov_9fa48("142141", "142142", "142143"), options.sqlQueryEngine || null);
        }
      }
      if (stryMutAct_9fa48("142145") ? false : stryMutAct_9fa48("142144") ? true : (stryCov_9fa48("142144", "142145"), Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.BOOTSTRAPREADINESSSTATE))) {
        if (stryMutAct_9fa48("142146")) {
          {}
        } else {
          stryCov_9fa48("142146");
          this.bootstrapReadinessState = stryMutAct_9fa48("142149") ? options.bootstrapReadinessState && null : stryMutAct_9fa48("142148") ? false : stryMutAct_9fa48("142147") ? true : (stryCov_9fa48("142147", "142148", "142149"), options.bootstrapReadinessState || null);
          if (stryMutAct_9fa48("142152") ? this.startupRecoveryCoordinator || typeof this.startupRecoveryCoordinator.syncOwnerDependencies === TYPEOF.FUNCTION : stryMutAct_9fa48("142151") ? false : stryMutAct_9fa48("142150") ? true : (stryCov_9fa48("142150", "142151", "142152"), this.startupRecoveryCoordinator && (stryMutAct_9fa48("142154") ? typeof this.startupRecoveryCoordinator.syncOwnerDependencies !== TYPEOF.FUNCTION : stryMutAct_9fa48("142153") ? true : (stryCov_9fa48("142153", "142154"), typeof this.startupRecoveryCoordinator.syncOwnerDependencies === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("142155")) {
              {}
            } else {
              stryCov_9fa48("142155");
              this.startupRecoveryCoordinator.syncOwnerDependencies(stryMutAct_9fa48("142156") ? {} : (stryCov_9fa48("142156"), {
                readinessState: this.bootstrapReadinessState
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("142158") ? false : stryMutAct_9fa48("142157") ? true : (stryCov_9fa48("142157", "142158"), Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.STARTUPRECOVERYCOORDINATOR))) {
        if (stryMutAct_9fa48("142159")) {
          {}
        } else {
          stryCov_9fa48("142159");
          this.startupRecoveryCoordinator = stryMutAct_9fa48("142162") ? options.startupRecoveryCoordinator && null : stryMutAct_9fa48("142161") ? false : stryMutAct_9fa48("142160") ? true : (stryCov_9fa48("142160", "142161", "142162"), options.startupRecoveryCoordinator || null);
        }
      }
      if (stryMutAct_9fa48("142165") ? this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.syncOwnerDependencies === TYPEOF.FUNCTION : stryMutAct_9fa48("142164") ? false : stryMutAct_9fa48("142163") ? true : (stryCov_9fa48("142163", "142164", "142165"), this.controlPlaneReadinessService && (stryMutAct_9fa48("142167") ? typeof this.controlPlaneReadinessService.syncOwnerDependencies !== TYPEOF.FUNCTION : stryMutAct_9fa48("142166") ? true : (stryCov_9fa48("142166", "142167"), typeof this.controlPlaneReadinessService.syncOwnerDependencies === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("142168")) {
          {}
        } else {
          stryCov_9fa48("142168");
          this.controlPlaneReadinessService.syncOwnerDependencies(stryMutAct_9fa48("142169") ? {} : (stryCov_9fa48("142169"), {
            systemTableCache: this.systemTableCache,
            cacheMutationTarget: this.systemTableCache,
            messageRouter: this.messageRouter,
            cdcIntegrationService: this.cdcIntegrationService
          }));
        }
      }
      if (stryMutAct_9fa48("142171") ? false : stryMutAct_9fa48("142170") ? true : (stryCov_9fa48("142170", "142171"), Object.hasOwn(options, UNIFIED_REBALANCER_LITERAL.REBALANCECOORDINATOR))) {
        if (stryMutAct_9fa48("142172")) {
          {}
        } else {
          stryCov_9fa48("142172");
          this.setRebalanceCoordinator(stryMutAct_9fa48("142175") ? options.rebalanceCoordinator && null : stryMutAct_9fa48("142174") ? false : stryMutAct_9fa48("142173") ? true : (stryCov_9fa48("142173", "142174", "142175"), options.rebalanceCoordinator || null));
          return;
        }
      }
      this.syncOwnerDependenciesFromCoordinator(this.rebalanceCoordinator);
    }
  }

  /**
   * Synchronize owner-scoped dependencies from coordinator.
   * @param {Object|null} coordinator
   * @private
   */
  syncOwnerDependenciesFromCoordinator(coordinator) {
    if (stryMutAct_9fa48("142176")) {
      {}
    } else {
      stryCov_9fa48("142176");
      if (stryMutAct_9fa48("142179") ? !coordinator && typeof coordinator !== TYPEOF.OBJECT : stryMutAct_9fa48("142178") ? false : stryMutAct_9fa48("142177") ? true : (stryCov_9fa48("142177", "142178", "142179"), (stryMutAct_9fa48("142180") ? coordinator : (stryCov_9fa48("142180"), !coordinator)) || (stryMutAct_9fa48("142182") ? typeof coordinator === TYPEOF.OBJECT : stryMutAct_9fa48("142181") ? false : (stryCov_9fa48("142181", "142182"), typeof coordinator !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("142183")) {
          {}
        } else {
          stryCov_9fa48("142183");
          return;
        }
      }
      if (stryMutAct_9fa48("142185") ? false : stryMutAct_9fa48("142184") ? true : (stryCov_9fa48("142184", "142185"), coordinator.storageAdmissionService)) {
        if (stryMutAct_9fa48("142186")) {
          {}
        } else {
          stryCov_9fa48("142186");
          this.storageAdmissionService = coordinator.storageAdmissionService;
        }
      }
      if (stryMutAct_9fa48("142188") ? false : stryMutAct_9fa48("142187") ? true : (stryCov_9fa48("142187", "142188"), coordinator.storageAccountingService)) {
        if (stryMutAct_9fa48("142189")) {
          {}
        } else {
          stryCov_9fa48("142189");
          this.storageAccountingService = coordinator.storageAccountingService;
        }
      }
      if (stryMutAct_9fa48("142191") ? false : stryMutAct_9fa48("142190") ? true : (stryCov_9fa48("142190", "142191"), coordinator.cdcGroupPropagationService)) {
        if (stryMutAct_9fa48("142192")) {
          {}
        } else {
          stryCov_9fa48("142192");
          this.cdcGroupPropagationService = coordinator.cdcGroupPropagationService;
        }
      }
      if (stryMutAct_9fa48("142194") ? false : stryMutAct_9fa48("142193") ? true : (stryCov_9fa48("142193", "142194"), coordinator.bootstrapReadinessState)) {
        if (stryMutAct_9fa48("142195")) {
          {}
        } else {
          stryCov_9fa48("142195");
          this.bootstrapReadinessState = coordinator.bootstrapReadinessState;
        }
      }
      if (stryMutAct_9fa48("142197") ? false : stryMutAct_9fa48("142196") ? true : (stryCov_9fa48("142196", "142197"), coordinator.startupRecoveryCoordinator)) {
        if (stryMutAct_9fa48("142198")) {
          {}
        } else {
          stryCov_9fa48("142198");
          this.startupRecoveryCoordinator = coordinator.startupRecoveryCoordinator;
        }
      } else if (stryMutAct_9fa48("142201") ? this.startupRecoveryCoordinator || typeof this.startupRecoveryCoordinator.syncOwnerDependencies === TYPEOF.FUNCTION : stryMutAct_9fa48("142200") ? false : stryMutAct_9fa48("142199") ? true : (stryCov_9fa48("142199", "142200", "142201"), this.startupRecoveryCoordinator && (stryMutAct_9fa48("142203") ? typeof this.startupRecoveryCoordinator.syncOwnerDependencies !== TYPEOF.FUNCTION : stryMutAct_9fa48("142202") ? true : (stryCov_9fa48("142202", "142203"), typeof this.startupRecoveryCoordinator.syncOwnerDependencies === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("142204")) {
          {}
        } else {
          stryCov_9fa48("142204");
          this.startupRecoveryCoordinator.syncOwnerDependencies(stryMutAct_9fa48("142205") ? {} : (stryCov_9fa48("142205"), {
            readinessState: this.bootstrapReadinessState
          }));
        }
      }
      if (stryMutAct_9fa48("142207") ? false : stryMutAct_9fa48("142206") ? true : (stryCov_9fa48("142206", "142207"), coordinator.controlPlaneReadinessService)) {
        if (stryMutAct_9fa48("142208")) {
          {}
        } else {
          stryCov_9fa48("142208");
          this.controlPlaneReadinessService = coordinator.controlPlaneReadinessService;
        }
      }
      if (stryMutAct_9fa48("142211") ? this.managesStoragePressureBehavior || this.storageAccountingService : stryMutAct_9fa48("142210") ? false : stryMutAct_9fa48("142209") ? true : (stryCov_9fa48("142209", "142210", "142211"), this.managesStoragePressureBehavior && this.storageAccountingService)) {
        if (stryMutAct_9fa48("142212")) {
          {}
        } else {
          stryCov_9fa48("142212");
          this.storagePressureBehavior = new StoragePressureBehavior(stryMutAct_9fa48("142213") ? {} : (stryCov_9fa48("142213"), {
            accountingService: this.storageAccountingService
          }));
        }
      }
      if (stryMutAct_9fa48("142215") ? false : stryMutAct_9fa48("142214") ? true : (stryCov_9fa48("142214", "142215"), this.movePlanner)) {
        if (stryMutAct_9fa48("142216")) {
          {}
        } else {
          stryCov_9fa48("142216");
          this.movePlanner.storageAdmissionService = this.storageAdmissionService;
          this.movePlanner.accountingService = this.storageAccountingService;
          this.movePlanner.storagePressureBehavior = this.storagePressureBehavior;
        }
      }
    }
  }

  /**
   * Set leadership status.
   * @param {boolean} isLeader - Whether this instance is the leader.
   */
  setLeader(isLeader) {
    if (stryMutAct_9fa48("142217")) {
      {}
    } else {
      stryCov_9fa48("142217");
      if (stryMutAct_9fa48("142219") ? false : stryMutAct_9fa48("142218") ? true : (stryCov_9fa48("142218", "142219"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("142220")) {
          {}
        } else {
          stryCov_9fa48("142220");
          this.isLeader = stryMutAct_9fa48("142221") ? true : (stryCov_9fa48("142221"), false);
          this.cancelScheduledCheck();
          this.cancelStabilizationTimer();
          return;
        }
      }
      const wasLeader = this.isLeader;
      this.isLeader = isLeader;
      if (stryMutAct_9fa48("142224") ? isLeader || !wasLeader : stryMutAct_9fa48("142223") ? false : stryMutAct_9fa48("142222") ? true : (stryCov_9fa48("142222", "142223", "142224"), isLeader && (stryMutAct_9fa48("142225") ? wasLeader : (stryCov_9fa48("142225"), !wasLeader)))) {
        if (stryMutAct_9fa48("142226")) {
          {}
        } else {
          stryCov_9fa48("142226");
          this.logger.info(REBALANCER_LOG_MSG.LEADER_START, stryMutAct_9fa48("142227") ? {} : (stryCov_9fa48("142227"), {
            entityId: this.entityId,
            entityType: this.entityType
          }));
          this.scheduleNextCheck(this.getLeadershipStartDelayMs());
        }
      } else if (stryMutAct_9fa48("142230") ? !isLeader || wasLeader : stryMutAct_9fa48("142229") ? false : stryMutAct_9fa48("142228") ? true : (stryCov_9fa48("142228", "142229", "142230"), (stryMutAct_9fa48("142231") ? isLeader : (stryCov_9fa48("142231"), !isLeader)) && wasLeader)) {
        if (stryMutAct_9fa48("142232")) {
          {}
        } else {
          stryCov_9fa48("142232");
          this.logger.info(REBALANCER_LOG_MSG.LEADER_STOP, stryMutAct_9fa48("142233") ? {} : (stryCov_9fa48("142233"), {
            entityId: this.entityId,
            entityType: this.entityType
          }));
          this.cancelScheduledCheck();
          this.cancelStabilizationTimer();
        }
      }
    }
  }

  /**
   * Get the policy for this entity.
   * @return {Promise<Object>} The applicable policy.
   */
  async getPolicy() {
    if (stryMutAct_9fa48("142234")) {
      {}
    } else {
      stryCov_9fa48("142234");
      if (stryMutAct_9fa48("142237") ? this.entityType !== EntityType.MESSAGE_GROUP : stryMutAct_9fa48("142236") ? false : stryMutAct_9fa48("142235") ? true : (stryCov_9fa48("142235", "142236", "142237"), this.entityType === EntityType.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("142238")) {
          {}
        } else {
          stryCov_9fa48("142238");
          return this.getMessageGroupPolicy();
        }
      }
      if (stryMutAct_9fa48("142241") ? this.entityType !== EntityType.RUNTIME_SERVICE : stryMutAct_9fa48("142240") ? false : stryMutAct_9fa48("142239") ? true : (stryCov_9fa48("142239", "142240", "142241"), this.entityType === EntityType.RUNTIME_SERVICE)) {
        if (stryMutAct_9fa48("142242")) {
          {}
        } else {
          stryCov_9fa48("142242");
          return this.getRuntimeServicePolicy();
        }
      }
      return this.getTablePolicy();
    }
  }

  /**
   * Get table policy for a partition.
   * Uses TablePolicyService for policy lookup.
   * @return {Promise<Object>} Table policy.
   */
  async getTablePolicy() {
    if (stryMutAct_9fa48("142243")) {
      {}
    } else {
      stryCov_9fa48("142243");
      return this.tablePolicyService.getPolicyForPartition(this.entityId);
    }
  }

  /**
   * Get message group policy.
   * @return {Object} Message group policy.
   */
  getMessageGroupPolicy() {
    if (stryMutAct_9fa48("142244")) {
      {}
    } else {
      stryCov_9fa48("142244");
      // Delegate to TablePolicyService for canonical validation/merge
      return this.tablePolicyService.getMessageGroupPolicy(this.entityId);
    }
  }

  /**
   * Get runtime service policy.
   * Returns the default runtime service placement policy.
   * @return {Object} Runtime service policy.
   */
  getRuntimeServicePolicy() {
    if (stryMutAct_9fa48("142245")) {
      {}
    } else {
      stryCov_9fa48("142245");
      return stryMutAct_9fa48("142246") ? {} : (stryCov_9fa48("142246"), {
        ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE
      });
    }
  }

  /**
   * Clamp stabilization period to valid range [1000ms, 10000ms].
   * @param {number} value - Configured stabilization period.
   * @return {number} Clamped stabilization period.
   */
  clampStabilizationPeriod(value) {
    if (stryMutAct_9fa48("142247")) {
      {}
    } else {
      stryCov_9fa48("142247");
      if (stryMutAct_9fa48("142250") ? typeof value !== UNIFIED_REBALANCER_LITERAL.NUMBER && isNaN(value) : stryMutAct_9fa48("142249") ? false : stryMutAct_9fa48("142248") ? true : (stryCov_9fa48("142248", "142249", "142250"), (stryMutAct_9fa48("142252") ? typeof value === UNIFIED_REBALANCER_LITERAL.NUMBER : stryMutAct_9fa48("142251") ? false : (stryCov_9fa48("142251", "142252"), typeof value !== UNIFIED_REBALANCER_LITERAL.NUMBER)) || isNaN(value))) {
        if (stryMutAct_9fa48("142253")) {
          {}
        } else {
          stryCov_9fa48("142253");
          return this.defaultStabilizationMs;
        }
      }
      return stryMutAct_9fa48("142254") ? Math.min(this.minStabilizationMs, Math.min(this.maxStabilizationMs, value)) : (stryCov_9fa48("142254"), Math.max(this.minStabilizationMs, stryMutAct_9fa48("142255") ? Math.max(this.maxStabilizationMs, value) : (stryCov_9fa48("142255"), Math.min(this.maxStabilizationMs, value))));
    }
  }

  /**
   * Resolve non-negative millisecond value with fallback.
   * @param {*} value - Candidate config value.
   * @param {number} fallback - Fallback milliseconds.
   * @return {number} Non-negative milliseconds.
   */
  resolveNonNegativeMs(value, fallback) {
    if (stryMutAct_9fa48("142256")) {
      {}
    } else {
      stryCov_9fa48("142256");
      if (stryMutAct_9fa48("142259") ? typeof value === UNIFIED_REBALANCER_LITERAL.NUMBER && Number.isFinite(value) || value >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142258") ? false : stryMutAct_9fa48("142257") ? true : (stryCov_9fa48("142257", "142258", "142259"), (stryMutAct_9fa48("142261") ? typeof value === UNIFIED_REBALANCER_LITERAL.NUMBER || Number.isFinite(value) : stryMutAct_9fa48("142260") ? true : (stryCov_9fa48("142260", "142261"), (stryMutAct_9fa48("142263") ? typeof value !== UNIFIED_REBALANCER_LITERAL.NUMBER : stryMutAct_9fa48("142262") ? true : (stryCov_9fa48("142262", "142263"), typeof value === UNIFIED_REBALANCER_LITERAL.NUMBER)) && Number.isFinite(value))) && (stryMutAct_9fa48("142266") ? value < UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142265") ? value > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142264") ? true : (stryCov_9fa48("142264", "142265", "142266"), value >= UNIFIED_REBALANCER_LITERAL.ZERO)))) {
        if (stryMutAct_9fa48("142267")) {
          {}
        } else {
          stryCov_9fa48("142267");
          return Math.floor(value);
        }
      }
      return fallback;
    }
  }

  /**
   * Whether this rebalancer manages a system table partition.
   * @return {boolean}
   */
  isSystemPartitionEntity() {
    if (stryMutAct_9fa48("142268")) {
      {}
    } else {
      stryCov_9fa48("142268");
      if (stryMutAct_9fa48("142271") ? this.entityType === EntityType.PARTITION : stryMutAct_9fa48("142270") ? false : stryMutAct_9fa48("142269") ? true : (stryCov_9fa48("142269", "142270", "142271"), this.entityType !== EntityType.PARTITION)) {
        if (stryMutAct_9fa48("142272")) {
          {}
        } else {
          stryCov_9fa48("142272");
          return stryMutAct_9fa48("142273") ? true : (stryCov_9fa48("142273"), false);
        }
      }
      const partitionRow = getPartitionRowFromCache(this.systemTableCache, this.entityId);
      return isSystemTablePartition(stryMutAct_9fa48("142274") ? {} : (stryCov_9fa48("142274"), {
        partitionId: this.entityId,
        partitionRow
      }));
    }
  }

  /**
   * Resolve the readiness decision dimension for node-level rebalancer gates.
   * Critical system partitions must continue converging while publication
   * membership is still closing ACK_PENDING; ordinary entities remain strict.
   *
   * @return {string}
   * @private
   */
  resolveNodeReadinessDecisionDimension() {
    if (stryMutAct_9fa48("142275")) {
      {}
    } else {
      stryCov_9fa48("142275");
      if (stryMutAct_9fa48("142277") ? false : stryMutAct_9fa48("142276") ? true : (stryCov_9fa48("142276", "142277"), this.isSystemPartitionEntity())) {
        if (stryMutAct_9fa48("142278")) {
          {}
        } else {
          stryCov_9fa48("142278");
          return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
        }
      }
      return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
    }
  }

  /**
   * Evaluate readiness eligibility for one decision dimension.
   * Falls back to repairEligible only when older snapshots do not yet expose
   * controlPlaneRecoveryEligible explicitly.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   * @private
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    if (stryMutAct_9fa48("142279")) {
      {}
    } else {
      stryCov_9fa48("142279");
      const dimensions = (stryMutAct_9fa48("142282") ? readiness?.dimensions || typeof readiness.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("142281") ? false : stryMutAct_9fa48("142280") ? true : (stryCov_9fa48("142280", "142281", "142282"), (stryMutAct_9fa48("142283") ? readiness.dimensions : (stryCov_9fa48("142283"), readiness?.dimensions)) && (stryMutAct_9fa48("142285") ? typeof readiness.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("142284") ? true : (stryCov_9fa48("142284", "142285"), typeof readiness.dimensions === TYPEOF.OBJECT)))) ? readiness.dimensions : null;
      if (stryMutAct_9fa48("142288") ? false : stryMutAct_9fa48("142287") ? true : stryMutAct_9fa48("142286") ? dimensions : (stryCov_9fa48("142286", "142287", "142288"), !dimensions)) {
        if (stryMutAct_9fa48("142289")) {
          {}
        } else {
          stryCov_9fa48("142289");
          return stryMutAct_9fa48("142290") ? true : (stryCov_9fa48("142290"), false);
        }
      }
      if (stryMutAct_9fa48("142293") ? dimensions[decisionDimension] !== true : stryMutAct_9fa48("142292") ? false : stryMutAct_9fa48("142291") ? true : (stryCov_9fa48("142291", "142292", "142293"), dimensions[decisionDimension] === (stryMutAct_9fa48("142294") ? false : (stryCov_9fa48("142294"), true)))) {
        if (stryMutAct_9fa48("142295")) {
          {}
        } else {
          stryCov_9fa48("142295");
          return stryMutAct_9fa48("142296") ? false : (stryCov_9fa48("142296"), true);
        }
      }
      if (stryMutAct_9fa48("142299") ? decisionDimension === CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("142298") ? false : stryMutAct_9fa48("142297") ? true : (stryCov_9fa48("142297", "142298", "142299"), decisionDimension !== CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)) {
        if (stryMutAct_9fa48("142300")) {
          {}
        } else {
          stryCov_9fa48("142300");
          return stryMutAct_9fa48("142301") ? true : (stryCov_9fa48("142301"), false);
        }
      }
      if (stryMutAct_9fa48("142303") ? false : stryMutAct_9fa48("142302") ? true : (stryCov_9fa48("142302", "142303"), Object.hasOwn(dimensions, decisionDimension))) {
        if (stryMutAct_9fa48("142304")) {
          {}
        } else {
          stryCov_9fa48("142304");
          return stryMutAct_9fa48("142305") ? true : (stryCov_9fa48("142305"), false);
        }
      }
      return stryMutAct_9fa48("142308") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true : stryMutAct_9fa48("142307") ? false : stryMutAct_9fa48("142306") ? true : (stryCov_9fa48("142306", "142307", "142308"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === (stryMutAct_9fa48("142309") ? false : (stryCov_9fa48("142309"), true)));
    }
  }

  /**
   * Whether this entity is one of the startup-critical control-plane
   * partitions that should converge ahead of ordinary workload rebalancing.
   * @return {boolean}
   */
  isControlPlanePriorityPartition() {
    if (stryMutAct_9fa48("142310")) {
      {}
    } else {
      stryCov_9fa48("142310");
      if (stryMutAct_9fa48("142313") ? this.entityType === EntityType.PARTITION : stryMutAct_9fa48("142312") ? false : stryMutAct_9fa48("142311") ? true : (stryCov_9fa48("142311", "142312", "142313"), this.entityType !== EntityType.PARTITION)) {
        if (stryMutAct_9fa48("142314")) {
          {}
        } else {
          stryCov_9fa48("142314");
          return stryMutAct_9fa48("142315") ? true : (stryCov_9fa48("142315"), false);
        }
      }
      const partitionRow = getPartitionRowFromCache(this.systemTableCache, this.entityId);
      return isPriorityControlPlanePartition(stryMutAct_9fa48("142316") ? {} : (stryCov_9fa48("142316"), {
        partitionId: this.entityId,
        partitionRow
      }));
    }
  }

  /**
   * Resolve the minimum number of ACTIVE nodes that must satisfy readiness
   * before this entity may continue critical topology spread.
   *
   * Priority control-plane partitions converge against a quorum target during
   * startup so one flapping joiner does not stall every other priority table.
   *
   * @param {number} activeNodeCount
   * @return {number}
   * @private
   */
  resolveCriticalSystemRequiredHealthyNodeCount(activeNodeCount) {
    if (stryMutAct_9fa48("142317")) {
      {}
    } else {
      stryCov_9fa48("142317");
      const normalizedActiveNodeCount = (stryMutAct_9fa48("142320") ? Number.isInteger(activeNodeCount) || activeNodeCount > NUM.ZERO : stryMutAct_9fa48("142319") ? false : stryMutAct_9fa48("142318") ? true : (stryCov_9fa48("142318", "142319", "142320"), Number.isInteger(activeNodeCount) && (stryMutAct_9fa48("142323") ? activeNodeCount <= NUM.ZERO : stryMutAct_9fa48("142322") ? activeNodeCount >= NUM.ZERO : stryMutAct_9fa48("142321") ? true : (stryCov_9fa48("142321", "142322", "142323"), activeNodeCount > NUM.ZERO)))) ? activeNodeCount : NUM.ZERO;
      if (stryMutAct_9fa48("142326") ? normalizedActiveNodeCount !== NUM.ZERO : stryMutAct_9fa48("142325") ? false : stryMutAct_9fa48("142324") ? true : (stryCov_9fa48("142324", "142325", "142326"), normalizedActiveNodeCount === NUM.ZERO)) {
        if (stryMutAct_9fa48("142327")) {
          {}
        } else {
          stryCov_9fa48("142327");
          return NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("142330") ? false : stryMutAct_9fa48("142329") ? true : stryMutAct_9fa48("142328") ? this.isControlPlanePriorityPartition() : (stryCov_9fa48("142328", "142329", "142330"), !this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("142331")) {
          {}
        } else {
          stryCov_9fa48("142331");
          return normalizedActiveNodeCount;
        }
      }
      const targetReplicaCount = this.getPriorityControlPlaneTargetReplicaCount();
      const quorumTarget = stryMutAct_9fa48("142332") ? Math.min(NUM.ONE, Math.floor(targetReplicaCount / NUM.TWO) + NUM.ONE) : (stryCov_9fa48("142332"), Math.max(NUM.ONE, stryMutAct_9fa48("142333") ? Math.floor(targetReplicaCount / NUM.TWO) - NUM.ONE : (stryCov_9fa48("142333"), Math.floor(stryMutAct_9fa48("142334") ? targetReplicaCount * NUM.TWO : (stryCov_9fa48("142334"), targetReplicaCount / NUM.TWO)) + NUM.ONE)));
      return stryMutAct_9fa48("142335") ? Math.max(quorumTarget, normalizedActiveNodeCount) : (stryCov_9fa48("142335"), Math.min(quorumTarget, normalizedActiveNodeCount));
    }
  }

  /**
   * Resolve the quorum-sized distinct-node target for priority control-plane
   * spread. Non-system entities may resume once priority partitions have
   * escaped single-node concentration, even if the final spread target is
   * still converging.
   *
   * @param {number} readyNodeCount
   * @return {number}
   * @private
   */
  resolvePriorityControlPlaneQuorumDistinctNodeCount(readyNodeCount) {
    if (stryMutAct_9fa48("142336")) {
      {}
    } else {
      stryCov_9fa48("142336");
      const normalizedReadyNodeCount = (stryMutAct_9fa48("142339") ? Number.isInteger(readyNodeCount) || readyNodeCount > NUM.ZERO : stryMutAct_9fa48("142338") ? false : stryMutAct_9fa48("142337") ? true : (stryCov_9fa48("142337", "142338", "142339"), Number.isInteger(readyNodeCount) && (stryMutAct_9fa48("142342") ? readyNodeCount <= NUM.ZERO : stryMutAct_9fa48("142341") ? readyNodeCount >= NUM.ZERO : stryMutAct_9fa48("142340") ? true : (stryCov_9fa48("142340", "142341", "142342"), readyNodeCount > NUM.ZERO)))) ? readyNodeCount : NUM.ZERO;
      if (stryMutAct_9fa48("142345") ? normalizedReadyNodeCount !== NUM.ZERO : stryMutAct_9fa48("142344") ? false : stryMutAct_9fa48("142343") ? true : (stryCov_9fa48("142343", "142344", "142345"), normalizedReadyNodeCount === NUM.ZERO)) {
        if (stryMutAct_9fa48("142346")) {
          {}
        } else {
          stryCov_9fa48("142346");
          return NUM.ZERO;
        }
      }
      const quorumTarget = stryMutAct_9fa48("142347") ? Math.min(NUM.ONE, Math.floor(PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT / NUM.TWO) + NUM.ONE) : (stryCov_9fa48("142347"), Math.max(NUM.ONE, stryMutAct_9fa48("142348") ? Math.floor(PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT / NUM.TWO) - NUM.ONE : (stryCov_9fa48("142348"), Math.floor(stryMutAct_9fa48("142349") ? PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT * NUM.TWO : (stryCov_9fa48("142349"), PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT / NUM.TWO)) + NUM.ONE)));
      return stryMutAct_9fa48("142350") ? Math.max(quorumTarget, normalizedReadyNodeCount) : (stryCov_9fa48("142350"), Math.min(quorumTarget, normalizedReadyNodeCount));
    }
  }

  /**
   * Resolve the configured voter target for this priority control-plane
   * partition from the canonical partitions owner row.
   *
   * @return {number}
   * @private
   */
  getPriorityControlPlaneTargetReplicaCount() {
    if (stryMutAct_9fa48("142351")) {
      {}
    } else {
      stryCov_9fa48("142351");
      if (stryMutAct_9fa48("142354") ? false : stryMutAct_9fa48("142353") ? true : stryMutAct_9fa48("142352") ? this.isControlPlanePriorityPartition() : (stryCov_9fa48("142352", "142353", "142354"), !this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("142355")) {
          {}
        } else {
          stryCov_9fa48("142355");
          return PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT;
        }
      }
      const partitionRow = getPartitionRowFromCache(this.systemTableCache, this.entityId);
      const configuredReplicaCount = Number(stryMutAct_9fa48("142356") ? partitionRow?.replica_count && partitionRow?.replicaCount : (stryCov_9fa48("142356"), (stryMutAct_9fa48("142357") ? partitionRow.replica_count : (stryCov_9fa48("142357"), partitionRow?.replica_count)) ?? (stryMutAct_9fa48("142358") ? partitionRow.replicaCount : (stryCov_9fa48("142358"), partitionRow?.replicaCount))));
      if (stryMutAct_9fa48("142361") ? Number.isFinite(configuredReplicaCount) || configuredReplicaCount > NUM.ZERO : stryMutAct_9fa48("142360") ? false : stryMutAct_9fa48("142359") ? true : (stryCov_9fa48("142359", "142360", "142361"), Number.isFinite(configuredReplicaCount) && (stryMutAct_9fa48("142364") ? configuredReplicaCount <= NUM.ZERO : stryMutAct_9fa48("142363") ? configuredReplicaCount >= NUM.ZERO : stryMutAct_9fa48("142362") ? true : (stryCov_9fa48("142362", "142363", "142364"), configuredReplicaCount > NUM.ZERO)))) {
        if (stryMutAct_9fa48("142365")) {
          {}
        } else {
          stryCov_9fa48("142365");
          return Math.floor(configuredReplicaCount);
        }
      }
      return PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT;
    }
  }

  /**
   * Resolve the short retry cadence used while startup-critical control-plane
   * partitions wait on gating conditions.
   * @return {number}
   */
  getPriorityRetryDelayMs() {
    if (stryMutAct_9fa48("142366")) {
      {}
    } else {
      stryCov_9fa48("142366");
      const configuredDelayMs = (stryMutAct_9fa48("142369") ? Number.isFinite(this.criticalCheckDelayMs) || this.criticalCheckDelayMs > NUM.ZERO : stryMutAct_9fa48("142368") ? false : stryMutAct_9fa48("142367") ? true : (stryCov_9fa48("142367", "142368", "142369"), Number.isFinite(this.criticalCheckDelayMs) && (stryMutAct_9fa48("142372") ? this.criticalCheckDelayMs <= NUM.ZERO : stryMutAct_9fa48("142371") ? this.criticalCheckDelayMs >= NUM.ZERO : stryMutAct_9fa48("142370") ? true : (stryCov_9fa48("142370", "142371", "142372"), this.criticalCheckDelayMs > NUM.ZERO)))) ? Math.floor(this.criticalCheckDelayMs) : REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
      return stryMutAct_9fa48("142373") ? Math.min(UNIFIED_REBALANCER_LITERAL.THOUSAND, configuredDelayMs) : (stryCov_9fa48("142373"), Math.max(UNIFIED_REBALANCER_LITERAL.THOUSAND, configuredDelayMs));
    }
  }

  /**
   * Resolve the first scheduler delay after leadership activation.
   * Priority control-plane partitions should begin checking quickly instead
   * of inheriting the ordinary 60s+ periodic cadence.
   * @return {number}
   */
  getLeadershipStartDelayMs() {
    if (stryMutAct_9fa48("142374")) {
      {}
    } else {
      stryCov_9fa48("142374");
      if (stryMutAct_9fa48("142376") ? false : stryMutAct_9fa48("142375") ? true : (stryCov_9fa48("142375", "142376"), this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("142377")) {
          {}
        } else {
          stryCov_9fa48("142377");
          return stryMutAct_9fa48("142378") ? Math.min(UNIFIED_REBALANCER_LITERAL.ONE, Math.floor(Math.random() * this.getPriorityRetryDelayMs())) : (stryCov_9fa48("142378"), Math.max(UNIFIED_REBALANCER_LITERAL.ONE, Math.floor(stryMutAct_9fa48("142379") ? Math.random() / this.getPriorityRetryDelayMs() : (stryCov_9fa48("142379"), Math.random() * this.getPriorityRetryDelayMs()))));
        }
      }
      // Stagger initial check with per-entity random offset to avoid
      // thundering herd when many partitions become leaders at once
      // (e.g. during bootstrap or rolling restarts).
      const initialJitter = Math.floor(stryMutAct_9fa48("142380") ? Math.random() / this.periodicCheckIntervalMs : (stryCov_9fa48("142380"), Math.random() * this.periodicCheckIntervalMs));
      return stryMutAct_9fa48("142381") ? this.periodicCheckIntervalMs - initialJitter : (stryCov_9fa48("142381"), this.periodicCheckIntervalMs + initialJitter);
    }
  }

  /**
   * Schedule a follow-up check using the priority control-plane cadence when
   * this entity owns startup-critical control-plane work.
   * @param {number|null} [delayMs]
   */
  schedulePriorityAwareCheck(delayMs = null) {
    if (stryMutAct_9fa48("142382")) {
      {}
    } else {
      stryCov_9fa48("142382");
      if (stryMutAct_9fa48("142384") ? false : stryMutAct_9fa48("142383") ? true : (stryCov_9fa48("142383", "142384"), this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("142385")) {
          {}
        } else {
          stryCov_9fa48("142385");
          this.scheduleNextCheck(this.getPriorityRetryDelayMs());
          return;
        }
      }
      this.scheduleNextCheck(delayMs);
    }
  }

  /**
   * Resolve start delay before rebalancing is eligible.
   * @return {number} Delay in milliseconds.
   */
  getRebalanceStartDelayMs() {
    if (stryMutAct_9fa48("142386")) {
      {}
    } else {
      stryCov_9fa48("142386");
      if (stryMutAct_9fa48("142389") ? this.entityType === EntityType.PARTITION : stryMutAct_9fa48("142388") ? false : stryMutAct_9fa48("142387") ? true : (stryCov_9fa48("142387", "142388", "142389"), this.entityType !== EntityType.PARTITION)) {
        if (stryMutAct_9fa48("142390")) {
          {}
        } else {
          stryCov_9fa48("142390");
          return UNIFIED_REBALANCER_LITERAL.ZERO;
        }
      }
      if (stryMutAct_9fa48("142392") ? false : stryMutAct_9fa48("142391") ? true : (stryCov_9fa48("142391", "142392"), this.isSystemPartitionEntity())) {
        if (stryMutAct_9fa48("142393")) {
          {}
        } else {
          stryCov_9fa48("142393");
          return this.systemPartitionStartDelayMs;
        }
      }
      return this.userPartitionStartDelayMs;
    }
  }

  /**
   * Milliseconds remaining until this entity is eligible for rebalancing.
   * @param {number} [nowMs=Date.now()] - Current timestamp.
   * @return {number} Remaining milliseconds, or 0 if eligible.
   */
  getTimeUntilRebalanceStartEligible(nowMs = Date.now()) {
    if (stryMutAct_9fa48("142394")) {
      {}
    } else {
      stryCov_9fa48("142394");
      const delayMs = this.getRebalanceStartDelayMs();
      if (stryMutAct_9fa48("142398") ? delayMs > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142397") ? delayMs < UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142396") ? false : stryMutAct_9fa48("142395") ? true : (stryCov_9fa48("142395", "142396", "142397", "142398"), delayMs <= UNIFIED_REBALANCER_LITERAL.ZERO)) {
        if (stryMutAct_9fa48("142399")) {
          {}
        } else {
          stryCov_9fa48("142399");
          return UNIFIED_REBALANCER_LITERAL.ZERO;
        }
      }
      const elapsed = stryMutAct_9fa48("142400") ? nowMs + this.rebalanceStartAtMs : (stryCov_9fa48("142400"), nowMs - this.rebalanceStartAtMs);
      const remaining = stryMutAct_9fa48("142401") ? delayMs + elapsed : (stryCov_9fa48("142401"), delayMs - elapsed);
      return (stryMutAct_9fa48("142405") ? remaining <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142404") ? remaining >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142403") ? false : stryMutAct_9fa48("142402") ? true : (stryCov_9fa48("142402", "142403", "142404", "142405"), remaining > UNIFIED_REBALANCER_LITERAL.ZERO)) ? remaining : UNIFIED_REBALANCER_LITERAL.ZERO;
    }
  }

  /**
   * Check if stabilization period has elapsed since last state change.
   * Requirements: 2.2, 2.3
   * @return {boolean} True if stable (no recent state changes).
   */
  isStabilized() {
    if (stryMutAct_9fa48("142406")) {
      {}
    } else {
      stryCov_9fa48("142406");
      if (stryMutAct_9fa48("142409") ? false : stryMutAct_9fa48("142408") ? true : stryMutAct_9fa48("142407") ? this.lastStateChangeTime : (stryCov_9fa48("142407", "142408", "142409"), !this.lastStateChangeTime)) {
        if (stryMutAct_9fa48("142410")) {
          {}
        } else {
          stryCov_9fa48("142410");
          return stryMutAct_9fa48("142411") ? false : (stryCov_9fa48("142411"), true);
        }
      }
      const elapsed = stryMutAct_9fa48("142412") ? Date.now() + this.lastStateChangeTime : (stryCov_9fa48("142412"), Date.now() - this.lastStateChangeTime);
      return stryMutAct_9fa48("142416") ? elapsed < this.stabilizationPeriodMs : stryMutAct_9fa48("142415") ? elapsed > this.stabilizationPeriodMs : stryMutAct_9fa48("142414") ? false : stryMutAct_9fa48("142413") ? true : (stryCov_9fa48("142413", "142414", "142415", "142416"), elapsed >= this.stabilizationPeriodMs);
    }
  }

  /**
   * Record a state change and reset stabilization timer.
   * Requirements: 2.5
   * @param {string} reason - Reason for state change.
   */
  recordStateChange(reason) {
    if (stryMutAct_9fa48("142417")) {
      {}
    } else {
      stryCov_9fa48("142417");
      if (stryMutAct_9fa48("142419") ? false : stryMutAct_9fa48("142418") ? true : (stryCov_9fa48("142418", "142419"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("142420")) {
          {}
        } else {
          stryCov_9fa48("142420");
          return;
        }
      }
      this.lastStateChangeTime = Date.now();
      this.logger.debug(REBALANCER_LOG_MSG.STABILIZATION_RESET, stryMutAct_9fa48("142421") ? {} : (stryCov_9fa48("142421"), {
        entityId: this.entityId,
        reason,
        stabilizationPeriodMs: this.stabilizationPeriodMs
      }));

      // Any previously scheduled periodic or stabilization check now represents
      // stale topology evidence. Replace them with one fresh stabilization timer.
      this.cancelScheduledCheck();
      this.cancelStabilizationTimer();

      // Schedule check after stabilization period
      if (stryMutAct_9fa48("142423") ? false : stryMutAct_9fa48("142422") ? true : (stryCov_9fa48("142422", "142423"), this.isLeader)) {
        if (stryMutAct_9fa48("142424")) {
          {}
        } else {
          stryCov_9fa48("142424");
          this.stabilizationTimer = setTimeout(() => {
            if (stryMutAct_9fa48("142425")) {
              {}
            } else {
              stryCov_9fa48("142425");
              this.stabilizationTimer = null;
              this.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
            }
          }, this.stabilizationPeriodMs);
        }
      }
    }
  }

  /**
   * Get the current stabilization period in milliseconds.
   * @return {number} Stabilization period.
   */
  getStabilizationPeriodMs() {
    if (stryMutAct_9fa48("142426")) {
      {}
    } else {
      stryCov_9fa48("142426");
      return this.stabilizationPeriodMs;
    }
  }

  /**
   * Get the time remaining until stabilization completes.
   * @return {number} Milliseconds remaining, or 0 if already stable.
   */
  getTimeUntilStabilized() {
    if (stryMutAct_9fa48("142427")) {
      {}
    } else {
      stryCov_9fa48("142427");
      if (stryMutAct_9fa48("142430") ? false : stryMutAct_9fa48("142429") ? true : stryMutAct_9fa48("142428") ? this.lastStateChangeTime : (stryCov_9fa48("142428", "142429", "142430"), !this.lastStateChangeTime)) {
        if (stryMutAct_9fa48("142431")) {
          {}
        } else {
          stryCov_9fa48("142431");
          return UNIFIED_REBALANCER_LITERAL.ZERO;
        }
      }
      const elapsed = stryMutAct_9fa48("142432") ? Date.now() + this.lastStateChangeTime : (stryCov_9fa48("142432"), Date.now() - this.lastStateChangeTime);
      const remaining = stryMutAct_9fa48("142433") ? this.stabilizationPeriodMs + elapsed : (stryCov_9fa48("142433"), this.stabilizationPeriodMs - elapsed);
      return stryMutAct_9fa48("142434") ? Math.min(UNIFIED_REBALANCER_LITERAL.ZERO, remaining) : (stryCov_9fa48("142434"), Math.max(UNIFIED_REBALANCER_LITERAL.ZERO, remaining));
    }
  }

  /**
   * Validate and adjust replica count to be odd.
   * @param {number} count - Desired replica count.
   * @param {Object} policy - Policy with min/max constraints.
   * @return {number} Valid odd replica count.
   */
  validateReplicaCount(count, policy) {
    if (stryMutAct_9fa48("142435")) {
      {}
    } else {
      stryCov_9fa48("142435");
      return this.movePlanner.validateReplicaCount(count, policy);
    }
  }

  /**
   * Calculate target replica count based on policy and current state.
   * Supports growing/shrinking in odd increments (3→5→7 or 7→5→3).
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {number} Target replica count.
   */
  calculateTargetReplicaCount(currentReplicas, policy) {
    if (stryMutAct_9fa48("142436")) {
      {}
    } else {
      stryCov_9fa48("142436");
      return this.movePlanner.calculateTargetReplicaCount(currentReplicas, policy);
    }
  }

  /**
   * Get desired replica target from policy.
   * @param {Object} policy - Applicable policy.
   * @return {number} Desired policy target.
   */
  getPolicyTargetReplicaCount(policy) {
    if (stryMutAct_9fa48("142437")) {
      {}
    } else {
      stryCov_9fa48("142437");
      return this.movePlanner.getPolicyTargetReplicaCount(policy);
    }
  }

  /**
   * Get actionable target based on currently available ready nodes.
   * @param {Object} policy - Applicable policy.
   * @param {Array<Object>} availableNodes - Ready nodes.
   * @return {number} Actionable target for current topology.
   */
  getActionableTargetReplicaCount(policy, availableNodes) {
    if (stryMutAct_9fa48("142438")) {
      {}
    } else {
      stryCov_9fa48("142438");
      return this.movePlanner.getActionableTargetReplicaCount(policy, availableNodes);
    }
  }

  /**
   * Resolve the latest membership publication row, regardless of status.
   * @return {Object|null}
   * @private
   */
  getLatestMembershipPublicationRow() {
    if (stryMutAct_9fa48("142439")) {
      {}
    } else {
      stryCov_9fa48("142439");
      const readinessService = this.controlPlaneReadinessService;
      const publicationService = stryMutAct_9fa48("142440") ? readinessService.membershipPublicationService : (stryCov_9fa48("142440"), readinessService?.membershipPublicationService);
      let publicationRow = null;
      if (stryMutAct_9fa48("142443") ? publicationService || typeof publicationService.getLatestClusterPublicationSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142442") ? false : stryMutAct_9fa48("142441") ? true : (stryCov_9fa48("142441", "142442", "142443"), publicationService && (stryMutAct_9fa48("142445") ? typeof publicationService.getLatestClusterPublicationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142444") ? true : (stryCov_9fa48("142444", "142445"), typeof publicationService.getLatestClusterPublicationSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("142446")) {
          {}
        } else {
          stryCov_9fa48("142446");
          publicationRow = publicationService.getLatestClusterPublicationSync();
        }
      } else if (stryMutAct_9fa48("142449") ? publicationService || typeof publicationService.getLatestPublicationRowSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142448") ? false : stryMutAct_9fa48("142447") ? true : (stryCov_9fa48("142447", "142448", "142449"), publicationService && (stryMutAct_9fa48("142451") ? typeof publicationService.getLatestPublicationRowSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142450") ? true : (stryCov_9fa48("142450", "142451"), typeof publicationService.getLatestPublicationRowSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("142452")) {
          {}
        } else {
          stryCov_9fa48("142452");
          publicationRow = publicationService.getLatestPublicationRowSync();
        }
      }
      return (stryMutAct_9fa48("142455") ? publicationRow || typeof publicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("142454") ? false : stryMutAct_9fa48("142453") ? true : (stryCov_9fa48("142453", "142454", "142455"), publicationRow && (stryMutAct_9fa48("142457") ? typeof publicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("142456") ? true : (stryCov_9fa48("142456", "142457"), typeof publicationRow === TYPEOF.OBJECT)))) ? publicationRow : null;
    }
  }

  /**
   * Resolve the latest published membership row when available.
   * @return {Object|null}
   * @private
   */
  getLatestPublishedMembershipRow() {
    if (stryMutAct_9fa48("142458")) {
      {}
    } else {
      stryCov_9fa48("142458");
      const readinessService = this.controlPlaneReadinessService;
      const publicationService = stryMutAct_9fa48("142459") ? readinessService.membershipPublicationService : (stryCov_9fa48("142459"), readinessService?.membershipPublicationService);
      const latestPublicationRow = this.getLatestMembershipPublicationRow();
      const publishedPublicationRow = this.getPublishedMembershipRowFallback(publicationService);
      return this.selectPublishedMembershipRow(latestPublicationRow, publishedPublicationRow);
    }
  }

  /**
   * Resolve one published-publication fallback row from the publication owner.
   * @param {Object|null} publicationService
   * @return {Object|null}
   * @private
   */
  getPublishedMembershipRowFallback(publicationService) {
    if (stryMutAct_9fa48("142460")) {
      {}
    } else {
      stryCov_9fa48("142460");
      if (stryMutAct_9fa48("142463") ? publicationService || typeof publicationService.getLatestPublishedClusterPublicationSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142462") ? false : stryMutAct_9fa48("142461") ? true : (stryCov_9fa48("142461", "142462", "142463"), publicationService && (stryMutAct_9fa48("142465") ? typeof publicationService.getLatestPublishedClusterPublicationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142464") ? true : (stryCov_9fa48("142464", "142465"), typeof publicationService.getLatestPublishedClusterPublicationSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("142466")) {
          {}
        } else {
          stryCov_9fa48("142466");
          return publicationService.getLatestPublishedClusterPublicationSync();
        }
      }
      if (stryMutAct_9fa48("142469") ? publicationService || typeof publicationService.getLatestPublishedPublicationRowSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142468") ? false : stryMutAct_9fa48("142467") ? true : (stryCov_9fa48("142467", "142468", "142469"), publicationService && (stryMutAct_9fa48("142471") ? typeof publicationService.getLatestPublishedPublicationRowSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142470") ? true : (stryCov_9fa48("142470", "142471"), typeof publicationService.getLatestPublishedPublicationRowSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("142472")) {
          {}
        } else {
          stryCov_9fa48("142472");
          return publicationService.getLatestPublishedPublicationRowSync();
        }
      }
      return null;
    }
  }

  /**
   * Choose one published membership row when available.
   * @param {Object|null} latestPublicationRow
   * @param {Object|null} publishedPublicationRow
   * @return {Object|null}
   * @private
   */
  selectPublishedMembershipRow(latestPublicationRow, publishedPublicationRow) {
    if (stryMutAct_9fa48("142473")) {
      {}
    } else {
      stryCov_9fa48("142473");
      const candidateRow = (stryMutAct_9fa48("142476") ? String(latestPublicationRow?.status || '').toUpperCase() !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("142475") ? false : stryMutAct_9fa48("142474") ? true : (stryCov_9fa48("142474", "142475", "142476"), (stryMutAct_9fa48("142477") ? String(latestPublicationRow?.status || '').toLowerCase() : (stryCov_9fa48("142477"), String(stryMutAct_9fa48("142480") ? latestPublicationRow?.status && '' : stryMutAct_9fa48("142479") ? false : stryMutAct_9fa48("142478") ? true : (stryCov_9fa48("142478", "142479", "142480"), (stryMutAct_9fa48("142481") ? latestPublicationRow.status : (stryCov_9fa48("142481"), latestPublicationRow?.status)) || (stryMutAct_9fa48("142482") ? "Stryker was here!" : (stryCov_9fa48("142482"), '')))).toUpperCase())) === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) ? latestPublicationRow : publishedPublicationRow;
      return (stryMutAct_9fa48("142485") ? String(candidateRow?.status || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING).toUpperCase() !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("142484") ? false : stryMutAct_9fa48("142483") ? true : (stryCov_9fa48("142483", "142484", "142485"), (stryMutAct_9fa48("142486") ? String(candidateRow?.status || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING).toLowerCase() : (stryCov_9fa48("142486"), String(stryMutAct_9fa48("142489") ? candidateRow?.status && UNIFIED_REBALANCER_LITERAL.EMPTY_STRING : stryMutAct_9fa48("142488") ? false : stryMutAct_9fa48("142487") ? true : (stryCov_9fa48("142487", "142488", "142489"), (stryMutAct_9fa48("142490") ? candidateRow.status : (stryCov_9fa48("142490"), candidateRow?.status)) || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING)).toUpperCase())) === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) ? candidateRow : null;
    }
  }

  /**
   * Global priority control-plane recovery remains active while the latest
   * publication row still reports spread unsatisfied.
   * @return {boolean}
   * @private
   */
  isGlobalPriorityControlPlaneRecoveryActive() {
    if (stryMutAct_9fa48("142491")) {
      {}
    } else {
      stryCov_9fa48("142491");
      return stryMutAct_9fa48("142494") ? this.getPriorityRecoveryAdmissionPlan().recoveryActive !== true : stryMutAct_9fa48("142493") ? false : stryMutAct_9fa48("142492") ? true : (stryCov_9fa48("142492", "142493", "142494"), this.getPriorityRecoveryAdmissionPlan().recoveryActive === (stryMutAct_9fa48("142495") ? false : (stryCov_9fa48("142495"), true)));
    }
  }

  /**
   * Critical transport partitions own publication and replica-operation
   * convergence for the rest of the control plane.
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isEmergencyPriorityControlPlanePartition(partitionId) {
    if (stryMutAct_9fa48("142496")) {
      {}
    } else {
      stryCov_9fa48("142496");
      return isCriticalTransportControlPlanePartitionTable(stryMutAct_9fa48("142497") ? {} : (stryCov_9fa48("142497"), {
        partitionId
      }));
    }
  }

  /**
   * Resolve the current priority-recovery admission plan from membership
   * publication state so move-budget reservation follows the same canonical
   * recovery summary as coordinator add admission.
   * @return {Object}
   * @private
   */
  getPriorityRecoveryAdmissionPlan() {
    if (stryMutAct_9fa48("142498")) {
      {}
    } else {
      stryCov_9fa48("142498");
      return resolveTrackedPriorityRecoveryAdmissionPlan(stryMutAct_9fa48("142499") ? {} : (stryCov_9fa48("142499"), {
        tracker: this.priorityRecoveryAdmissionTracker,
        publicationRow: this.getLatestMembershipPublicationRow(),
        nowMs: this.nowFn(),
        staleGraceMs: this.priorityRecoveryActivityStaleGraceMs,
        maxConcurrentAdds: this.maxConcurrentMoves,
        isPriorityPartition: stryMutAct_9fa48("142500") ? () => undefined : (stryCov_9fa48("142500"), partitionId => isPriorityControlPlanePartition(stryMutAct_9fa48("142501") ? {} : (stryCov_9fa48("142501"), {
          partitionId
        }))),
        isEmergencyPriorityPartition: stryMutAct_9fa48("142502") ? () => undefined : (stryCov_9fa48("142502"), partitionId => this.isEmergencyPriorityControlPlanePartition(partitionId))
      }));
    }
  }

  /**
   * Priority control-plane partitions participate directly in the global
   * recovery phase tracked from membership publication state.
   * @return {boolean}
   * @private
   */
  isPriorityControlPlaneRecoveryActive() {
    if (stryMutAct_9fa48("142503")) {
      {}
    } else {
      stryCov_9fa48("142503");
      if (stryMutAct_9fa48("142506") ? false : stryMutAct_9fa48("142505") ? true : stryMutAct_9fa48("142504") ? this.isControlPlanePriorityPartition() : (stryCov_9fa48("142504", "142505", "142506"), !this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("142507")) {
          {}
        } else {
          stryCov_9fa48("142507");
          return stryMutAct_9fa48("142508") ? true : (stryCov_9fa48("142508"), false);
        }
      }
      return this.isGlobalPriorityControlPlaneRecoveryActive();
    }
  }

  /**
   * Reserve one global move slot for priority recovery while non-priority
   * system partitions are still sharing the global rebalance budget.
   * @return {number}
   * @private
   */
  getReservedPriorityRecoveryMoveSlots() {
    if (stryMutAct_9fa48("142509")) {
      {}
    } else {
      stryCov_9fa48("142509");
      if (stryMutAct_9fa48("142512") ? !this.isSystemPartitionEntity() && this.isControlPlanePriorityPartition() : stryMutAct_9fa48("142511") ? false : stryMutAct_9fa48("142510") ? true : (stryCov_9fa48("142510", "142511", "142512"), (stryMutAct_9fa48("142513") ? this.isSystemPartitionEntity() : (stryCov_9fa48("142513"), !this.isSystemPartitionEntity())) || this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("142514")) {
          {}
        } else {
          stryCov_9fa48("142514");
          return NUM.ZERO;
        }
      }
      return this.getPriorityRecoveryAdmissionPlan().getReservedNonPrioritySlots(this.entityId, UNIFIED_REBALANCER_LITERAL.MOVE);
    }
  }

  /**
   * During active priority control-plane recovery we must not deadlock by
   * filtering candidate nodes to the last published active membership set.
   * All other placement continues to use published membership as steady-state
   * topology truth.
   * @return {boolean}
   * @private
   */
  shouldConstrainAvailableNodesToPublishedMembership() {
    if (stryMutAct_9fa48("142515")) {
      {}
    } else {
      stryCov_9fa48("142515");
      if (stryMutAct_9fa48("142518") ? false : stryMutAct_9fa48("142517") ? true : stryMutAct_9fa48("142516") ? this.isControlPlanePriorityPartition() : (stryCov_9fa48("142516", "142517", "142518"), !this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("142519")) {
          {}
        } else {
          stryCov_9fa48("142519");
          return stryMutAct_9fa48("142520") ? false : (stryCov_9fa48("142520"), true);
        }
      }
      return stryMutAct_9fa48("142521") ? this.isPriorityControlPlaneRecoveryActive() : (stryCov_9fa48("142521"), !this.isPriorityControlPlaneRecoveryActive());
    }
  }

  /**
   * Resolve the steady-state published active-node set when available.
   * @return {Set<string>|null}
   * @private
   */
  getPublishedActiveNodeIdSet() {
    if (stryMutAct_9fa48("142522")) {
      {}
    } else {
      stryCov_9fa48("142522");
      const publicationRow = this.getLatestPublishedMembershipRow();
      if (stryMutAct_9fa48("142525") ? false : stryMutAct_9fa48("142524") ? true : stryMutAct_9fa48("142523") ? publicationRow : (stryCov_9fa48("142523", "142524", "142525"), !publicationRow)) {
        if (stryMutAct_9fa48("142526")) {
          {}
        } else {
          stryCov_9fa48("142526");
          return null;
        }
      }
      const nodeIds = Array.isArray(publicationRow.publishedActiveNodeIds) ? publicationRow.publishedActiveNodeIds : Array.isArray(publicationRow.published_active_node_ids) ? publicationRow.published_active_node_ids : stryMutAct_9fa48("142527") ? ["Stryker was here"] : (stryCov_9fa48("142527"), []);
      return new Set(stryMutAct_9fa48("142528") ? nodeIds : (stryCov_9fa48("142528"), nodeIds.filter(stryMutAct_9fa48("142529") ? () => undefined : (stryCov_9fa48("142529"), nodeId => stryMutAct_9fa48("142532") ? typeof nodeId === TYPEOF.STRING || nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142531") ? false : stryMutAct_9fa48("142530") ? true : (stryCov_9fa48("142530", "142531", "142532"), (stryMutAct_9fa48("142534") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("142533") ? true : (stryCov_9fa48("142533", "142534"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("142537") ? nodeId.length <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142536") ? nodeId.length >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142535") ? true : (stryCov_9fa48("142535", "142536", "142537"), nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO)))))));
    }
  }

  /**
   * Filter cache-backed nodes through canonical readiness, optionally
   * constraining membership to a caller-provided node-id set.
   *
   * @param {Set<string>|null} constrainedNodeIds
   * @return {Array<Object>}
   * @private
   */
  getAvailableNodesConstrainedToNodeIds(constrainedNodeIds = null) {
    if (stryMutAct_9fa48("142538")) {
      {}
    } else {
      stryCov_9fa48("142538");
      let effectiveNodeIds = constrainedNodeIds instanceof Set ? new Set(constrainedNodeIds) : null;
      const startupAuthorityNodeIds = this.getStartupAuthorityNodeIdSet();
      if (stryMutAct_9fa48("142541") ? startupAuthorityNodeIds instanceof Set || startupAuthorityNodeIds.size > NUM.ZERO : stryMutAct_9fa48("142540") ? false : stryMutAct_9fa48("142539") ? true : (stryCov_9fa48("142539", "142540", "142541"), startupAuthorityNodeIds instanceof Set && (stryMutAct_9fa48("142544") ? startupAuthorityNodeIds.size <= NUM.ZERO : stryMutAct_9fa48("142543") ? startupAuthorityNodeIds.size >= NUM.ZERO : stryMutAct_9fa48("142542") ? true : (stryCov_9fa48("142542", "142543", "142544"), startupAuthorityNodeIds.size > NUM.ZERO)))) {
        if (stryMutAct_9fa48("142545")) {
          {}
        } else {
          stryCov_9fa48("142545");
          if (stryMutAct_9fa48("142547") ? false : stryMutAct_9fa48("142546") ? true : (stryCov_9fa48("142546", "142547"), effectiveNodeIds instanceof Set)) {
            if (stryMutAct_9fa48("142548")) {
              {}
            } else {
              stryCov_9fa48("142548");
              effectiveNodeIds = new Set(stryMutAct_9fa48("142549") ? [...effectiveNodeIds] : (stryCov_9fa48("142549"), (stryMutAct_9fa48("142550") ? [] : (stryCov_9fa48("142550"), [...effectiveNodeIds])).filter(stryMutAct_9fa48("142551") ? () => undefined : (stryCov_9fa48("142551"), nodeId => startupAuthorityNodeIds.has(nodeId)))));
            }
          } else {
            if (stryMutAct_9fa48("142552")) {
              {}
            } else {
              stryCov_9fa48("142552");
              effectiveNodeIds = startupAuthorityNodeIds;
            }
          }
        }
      }
      const readinessDecisionDimension = this.resolveNodeReadinessDecisionDimension();
      return stryMutAct_9fa48("142553") ? this.systemTableCache : (stryCov_9fa48("142553"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.NODES, node => {
        if (stryMutAct_9fa48("142554")) {
          {}
        } else {
          stryCov_9fa48("142554");
          const nodeId = stryMutAct_9fa48("142557") ? node?.node_id && null : stryMutAct_9fa48("142556") ? false : stryMutAct_9fa48("142555") ? true : (stryCov_9fa48("142555", "142556", "142557"), (stryMutAct_9fa48("142558") ? node.node_id : (stryCov_9fa48("142558"), node?.node_id)) || null);
          if (stryMutAct_9fa48("142561") ? false : stryMutAct_9fa48("142560") ? true : stryMutAct_9fa48("142559") ? nodeId : (stryCov_9fa48("142559", "142560", "142561"), !nodeId)) {
            if (stryMutAct_9fa48("142562")) {
              {}
            } else {
              stryCov_9fa48("142562");
              return stryMutAct_9fa48("142563") ? true : (stryCov_9fa48("142563"), false);
            }
          }
          if (stryMutAct_9fa48("142566") ? effectiveNodeIds instanceof Set || !effectiveNodeIds.has(nodeId) : stryMutAct_9fa48("142565") ? false : stryMutAct_9fa48("142564") ? true : (stryCov_9fa48("142564", "142565", "142566"), effectiveNodeIds instanceof Set && (stryMutAct_9fa48("142567") ? effectiveNodeIds.has(nodeId) : (stryCov_9fa48("142567"), !effectiveNodeIds.has(nodeId))))) {
            if (stryMutAct_9fa48("142568")) {
              {}
            } else {
              stryCov_9fa48("142568");
              return stryMutAct_9fa48("142569") ? true : (stryCov_9fa48("142569"), false);
            }
          }
          if (stryMutAct_9fa48("142572") ? startupAuthorityNodeIds instanceof Set || startupAuthorityNodeIds.has(nodeId) : stryMutAct_9fa48("142571") ? false : stryMutAct_9fa48("142570") ? true : (stryCov_9fa48("142570", "142571", "142572"), startupAuthorityNodeIds instanceof Set && startupAuthorityNodeIds.has(nodeId))) {
            if (stryMutAct_9fa48("142573")) {
              {}
            } else {
              stryCov_9fa48("142573");
              return stryMutAct_9fa48("142574") ? false : (stryCov_9fa48("142574"), true);
            }
          }
          const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("142575") ? {} : (stryCov_9fa48("142575"), {
            decisionDimension: readinessDecisionDimension
          }));
          return this.isReadinessDimensionSatisfied(readiness, readinessDecisionDimension);
        }
      }));
    }
  }
  getStartupAuthorityNodeIdSet() {
    if (stryMutAct_9fa48("142576")) {
      {}
    } else {
      stryCov_9fa48("142576");
      if (stryMutAct_9fa48("142579") ? false : stryMutAct_9fa48("142578") ? true : stryMutAct_9fa48("142577") ? this.isSystemPartitionEntity() : (stryCov_9fa48("142577", "142578", "142579"), !this.isSystemPartitionEntity())) {
        if (stryMutAct_9fa48("142580")) {
          {}
        } else {
          stryCov_9fa48("142580");
          return null;
        }
      }
      const readinessService = this.controlPlaneReadinessService;
      if (stryMutAct_9fa48("142583") ? !readinessService && typeof readinessService.getStartupAuthoritySnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142582") ? false : stryMutAct_9fa48("142581") ? true : (stryCov_9fa48("142581", "142582", "142583"), (stryMutAct_9fa48("142584") ? readinessService : (stryCov_9fa48("142584"), !readinessService)) || (stryMutAct_9fa48("142586") ? typeof readinessService.getStartupAuthoritySnapshotSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142585") ? false : (stryCov_9fa48("142585", "142586"), typeof readinessService.getStartupAuthoritySnapshotSync !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("142587")) {
          {}
        } else {
          stryCov_9fa48("142587");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("142588")) {
          {}
        } else {
          stryCov_9fa48("142588");
          const startupAuthority = readinessService.getStartupAuthoritySnapshotSync(this.nodeId, Date.now());
          const nodeIds = Array.isArray(stryMutAct_9fa48("142589") ? startupAuthority.canonicalStartupNodeIds : (stryCov_9fa48("142589"), startupAuthority?.canonicalStartupNodeIds)) ? stryMutAct_9fa48("142590") ? startupAuthority.canonicalStartupNodeIds : (stryCov_9fa48("142590"), startupAuthority.canonicalStartupNodeIds.filter(stryMutAct_9fa48("142591") ? () => undefined : (stryCov_9fa48("142591"), nodeId => stryMutAct_9fa48("142594") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("142593") ? false : stryMutAct_9fa48("142592") ? true : (stryCov_9fa48("142592", "142593", "142594"), (stryMutAct_9fa48("142596") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("142595") ? true : (stryCov_9fa48("142595", "142596"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("142599") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("142598") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("142597") ? true : (stryCov_9fa48("142597", "142598", "142599"), nodeId.length > NUM.ZERO)))))) : stryMutAct_9fa48("142600") ? ["Stryker was here"] : (stryCov_9fa48("142600"), []);
          return (stryMutAct_9fa48("142604") ? nodeIds.length <= NUM.ZERO : stryMutAct_9fa48("142603") ? nodeIds.length >= NUM.ZERO : stryMutAct_9fa48("142602") ? false : stryMutAct_9fa48("142601") ? true : (stryCov_9fa48("142601", "142602", "142603", "142604"), nodeIds.length > NUM.ZERO)) ? new Set(nodeIds) : null;
        }
      } catch (_error) {
        if (stryMutAct_9fa48("142605")) {
          {}
        } else {
          stryCov_9fa48("142605");
          return null;
        }
      }
    }
  }

  /**
   * Apply policy to determine if rebalancing is needed.
   * @param {Object} policy - Policy to apply.
   * @return {Object} Rebalancing decision with reason.
   */
  applyPolicy(policy) {
    if (stryMutAct_9fa48("142606")) {
      {}
    } else {
      stryCov_9fa48("142606");
      return this.movePlanner.applyPolicy(policy);
    }
  }

  /**
   * Get all available nodes from the cache.
   * @readModel REBALANCE_AVAILABLE_NODES — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>} Array of active nodes.
   */
  getAvailableNodes() {
    if (stryMutAct_9fa48("142607")) {
      {}
    } else {
      stryCov_9fa48("142607");
      const publishedActiveNodeIds = this.shouldConstrainAvailableNodesToPublishedMembership() ? this.getPublishedActiveNodeIdSet() : null;
      return this.getAvailableNodesConstrainedToNodeIds(publishedActiveNodeIds);
    }
  }

  /**
   * Return one blocker summary when critical system-partition rebalancing
   * should wait for cluster topology convergence.
   *
   * A joining or restarting cluster should not start background system-table
   * redistribution while nodes are still progressing through non-terminal
   * membership states, while endpoint publication is incomplete, or while
   * control-plane topology operations are still in flight. Hard failures
   * remain actionable and do not block.
   *
   * @return {Object|null}
   * @private
   */
  getCriticalSystemTopologySettlingBlocker() {
    if (stryMutAct_9fa48("142608")) {
      {}
    } else {
      stryCov_9fa48("142608");
      if (stryMutAct_9fa48("142611") ? false : stryMutAct_9fa48("142610") ? true : stryMutAct_9fa48("142609") ? this.isSystemPartitionEntity() : (stryCov_9fa48("142609", "142610", "142611"), !this.isSystemPartitionEntity())) {
        if (stryMutAct_9fa48("142612")) {
          {}
        } else {
          stryCov_9fa48("142612");
          return null;
        }
      }
      const nodeRows = (stryMutAct_9fa48("142615") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("142614") ? false : stryMutAct_9fa48("142613") ? true : (stryCov_9fa48("142613", "142614", "142615"), typeof (stryMutAct_9fa48("142616") ? this.systemTableCache.getAll : (stryCov_9fa48("142616"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? this.systemTableCache.getAll(SYSTEM_TABLE_NAME.NODES) : stryMutAct_9fa48("142617") ? ["Stryker was here"] : (stryCov_9fa48("142617"), []);
      if (stryMutAct_9fa48("142620") ? !Array.isArray(nodeRows) && nodeRows.length === UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142619") ? false : stryMutAct_9fa48("142618") ? true : (stryCov_9fa48("142618", "142619", "142620"), (stryMutAct_9fa48("142621") ? Array.isArray(nodeRows) : (stryCov_9fa48("142621"), !Array.isArray(nodeRows))) || (stryMutAct_9fa48("142623") ? nodeRows.length !== UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142622") ? false : (stryCov_9fa48("142622", "142623"), nodeRows.length === UNIFIED_REBALANCER_LITERAL.ZERO)))) {
        if (stryMutAct_9fa48("142624")) {
          {}
        } else {
          stryCov_9fa48("142624");
          return null;
        }
      }
      let hasTransitionalNode = stryMutAct_9fa48("142625") ? true : (stryCov_9fa48("142625"), false);
      let hasFailedNode = stryMutAct_9fa48("142626") ? true : (stryCov_9fa48("142626"), false);
      const bypassPriorityStartupReadiness = this.shouldBypassLocalPriorityControlPlaneStartupReadiness();
      const readinessDecisionDimension = this.resolveNodeReadinessDecisionDimension();
      const activeMembershipNodeIds = stryMutAct_9fa48("142627") ? ["Stryker was here"] : (stryCov_9fa48("142627"), []);
      const activeNodeIds = stryMutAct_9fa48("142628") ? ["Stryker was here"] : (stryCov_9fa48("142628"), []);
      const unreadyNodeIds = stryMutAct_9fa48("142629") ? ["Stryker was here"] : (stryCov_9fa48("142629"), []);
      for (const nodeRow of nodeRows) {
        if (stryMutAct_9fa48("142630")) {
          {}
        } else {
          stryCov_9fa48("142630");
          const normalizedNode = normalizeNodeRow(nodeRow);
          const {
            status,
            nodeId
          } = normalizedNode;
          if (stryMutAct_9fa48("142633") ? false : stryMutAct_9fa48("142632") ? true : stryMutAct_9fa48("142631") ? status : (stryCov_9fa48("142631", "142632", "142633"), !status)) {
            if (stryMutAct_9fa48("142634")) {
              {}
            } else {
              stryCov_9fa48("142634");
              continue;
            }
          }
          if (stryMutAct_9fa48("142637") ? status !== NodeStatus.FAILED : stryMutAct_9fa48("142636") ? false : stryMutAct_9fa48("142635") ? true : (stryCov_9fa48("142635", "142636", "142637"), status === NodeStatus.FAILED)) {
            if (stryMutAct_9fa48("142638")) {
              {}
            } else {
              stryCov_9fa48("142638");
              hasFailedNode = stryMutAct_9fa48("142639") ? false : (stryCov_9fa48("142639"), true);
              continue;
            }
          }
          if (stryMutAct_9fa48("142642") ? status !== NodeStatus.ACTIVE && nodeId.length === UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142641") ? false : stryMutAct_9fa48("142640") ? true : (stryCov_9fa48("142640", "142641", "142642"), (stryMutAct_9fa48("142644") ? status === NodeStatus.ACTIVE : stryMutAct_9fa48("142643") ? false : (stryCov_9fa48("142643", "142644"), status !== NodeStatus.ACTIVE)) || (stryMutAct_9fa48("142646") ? nodeId.length !== UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142645") ? false : (stryCov_9fa48("142645", "142646"), nodeId.length === UNIFIED_REBALANCER_LITERAL.ZERO)))) {
            if (stryMutAct_9fa48("142647")) {
              {}
            } else {
              stryCov_9fa48("142647");
              hasTransitionalNode = stryMutAct_9fa48("142648") ? false : (stryCov_9fa48("142648"), true);
              if (stryMutAct_9fa48("142652") ? nodeId.length <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142651") ? nodeId.length >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142650") ? false : stryMutAct_9fa48("142649") ? true : (stryCov_9fa48("142649", "142650", "142651", "142652"), nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO)) {
                if (stryMutAct_9fa48("142653")) {
                  {}
                } else {
                  stryCov_9fa48("142653");
                  unreadyNodeIds.push(nodeId);
                }
              }
              continue;
            }
          }
          activeMembershipNodeIds.push(nodeId);
          const readiness = (stryMutAct_9fa48("142656") ? this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.getNodeReadinessSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142655") ? false : stryMutAct_9fa48("142654") ? true : (stryCov_9fa48("142654", "142655", "142656"), this.controlPlaneReadinessService && (stryMutAct_9fa48("142658") ? typeof this.controlPlaneReadinessService.getNodeReadinessSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142657") ? true : (stryCov_9fa48("142657", "142658"), typeof this.controlPlaneReadinessService.getNodeReadinessSync === TYPEOF.FUNCTION)))) ? this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("142659") ? {} : (stryCov_9fa48("142659"), {
            allowStaleOnCacheChange: stryMutAct_9fa48("142660") ? true : (stryCov_9fa48("142660"), false)
          })) : null;
          const nodeMembershipReady = this.isReadinessDimensionSatisfied(readiness, readinessDecisionDimension);
          const localPriorityStartupLeaseClear = stryMutAct_9fa48("142663") ? bypassPriorityStartupReadiness && nodeId === this.nodeId || isNodeReadyLeaseExplicitlyCleared(nodeRow, {
            requireActiveStatus: true
          }) : stryMutAct_9fa48("142662") ? false : stryMutAct_9fa48("142661") ? true : (stryCov_9fa48("142661", "142662", "142663"), (stryMutAct_9fa48("142665") ? bypassPriorityStartupReadiness || nodeId === this.nodeId : stryMutAct_9fa48("142664") ? true : (stryCov_9fa48("142664", "142665"), bypassPriorityStartupReadiness && (stryMutAct_9fa48("142667") ? nodeId !== this.nodeId : stryMutAct_9fa48("142666") ? true : (stryCov_9fa48("142666", "142667"), nodeId === this.nodeId)))) && isNodeReadyLeaseExplicitlyCleared(nodeRow, stryMutAct_9fa48("142668") ? {} : (stryCov_9fa48("142668"), {
            requireActiveStatus: stryMutAct_9fa48("142669") ? false : (stryCov_9fa48("142669"), true)
          })));
          if (stryMutAct_9fa48("142671") ? false : stryMutAct_9fa48("142670") ? true : (stryCov_9fa48("142670", "142671"), localPriorityStartupLeaseClear)) {
            if (stryMutAct_9fa48("142672")) {
              {}
            } else {
              stryCov_9fa48("142672");
              activeNodeIds.push(nodeId);
              continue;
            }
          }
          if (stryMutAct_9fa48("142675") ? false : stryMutAct_9fa48("142674") ? true : stryMutAct_9fa48("142673") ? nodeMembershipReady : (stryCov_9fa48("142673", "142674", "142675"), !nodeMembershipReady)) {
            if (stryMutAct_9fa48("142676")) {
              {}
            } else {
              stryCov_9fa48("142676");
              hasTransitionalNode = stryMutAct_9fa48("142677") ? false : (stryCov_9fa48("142677"), true);
              unreadyNodeIds.push(nodeId);
              continue;
            }
          }
          activeNodeIds.push(nodeId);
        }
      }
      if (stryMutAct_9fa48("142680") ? hasTransitionalNode || !hasFailedNode : stryMutAct_9fa48("142679") ? false : stryMutAct_9fa48("142678") ? true : (stryCov_9fa48("142678", "142679", "142680"), hasTransitionalNode && (stryMutAct_9fa48("142681") ? hasFailedNode : (stryCov_9fa48("142681"), !hasFailedNode)))) {
        if (stryMutAct_9fa48("142682")) {
          {}
        } else {
          stryCov_9fa48("142682");
          const requiredHealthyNodeCount = this.resolveCriticalSystemRequiredHealthyNodeCount(activeMembershipNodeIds.length);
          const hasRequiredHealthyNodes = stryMutAct_9fa48("142686") ? activeNodeIds.length < requiredHealthyNodeCount : stryMutAct_9fa48("142685") ? activeNodeIds.length > requiredHealthyNodeCount : stryMutAct_9fa48("142684") ? false : stryMutAct_9fa48("142683") ? true : (stryCov_9fa48("142683", "142684", "142685", "142686"), activeNodeIds.length >= requiredHealthyNodeCount);
          if (stryMutAct_9fa48("142689") ? this.isControlPlanePriorityPartition() || hasRequiredHealthyNodes : stryMutAct_9fa48("142688") ? false : stryMutAct_9fa48("142687") ? true : (stryCov_9fa48("142687", "142688", "142689"), this.isControlPlanePriorityPartition() && hasRequiredHealthyNodes)) {
            // Priority spread may proceed once quorum is ready; additional ACTIVE
            // nodes can still be converging without stalling every priority table.
          } else {
            if (stryMutAct_9fa48("142690")) {
              {}
            } else {
              stryCov_9fa48("142690");
              return Object.freeze(stryMutAct_9fa48("142691") ? {} : (stryCov_9fa48("142691"), {
                reason: (stryMutAct_9fa48("142695") ? unreadyNodeIds.length <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142694") ? unreadyNodeIds.length >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142693") ? false : stryMutAct_9fa48("142692") ? true : (stryCov_9fa48("142692", "142693", "142694", "142695"), unreadyNodeIds.length > UNIFIED_REBALANCER_LITERAL.ZERO)) ? CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.NODE_READY_LEASE_INCOMPLETE : CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TRANSITIONAL_NODE_MEMBERSHIP,
                unreadyNodeIds: Object.freeze(stryMutAct_9fa48("142696") ? [] : (stryCov_9fa48("142696"), [...unreadyNodeIds])),
                requiredHealthyNodeCount,
                healthyNodeCount: activeNodeIds.length,
                activeMembershipNodeCount: activeMembershipNodeIds.length
              }));
            }
          }
        }
      }
      const connectedNodeIds = this.resolveConnectedClusterNodeIds();
      if (stryMutAct_9fa48("142700") ? connectedNodeIds.size <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142699") ? connectedNodeIds.size >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("142698") ? false : stryMutAct_9fa48("142697") ? true : (stryCov_9fa48("142697", "142698", "142699", "142700"), connectedNodeIds.size > UNIFIED_REBALANCER_LITERAL.ZERO)) {
        if (stryMutAct_9fa48("142701")) {
          {}
        } else {
          stryCov_9fa48("142701");
          const knownNodeIds = new Set(stryMutAct_9fa48("142702") ? nodeRows.map(nodeRow => {
            return normalizeNodeRow(nodeRow).nodeId;
          }) : (stryCov_9fa48("142702"), nodeRows.map(nodeRow => {
            if (stryMutAct_9fa48("142703")) {
              {}
            } else {
              stryCov_9fa48("142703");
              return normalizeNodeRow(nodeRow).nodeId;
            }
          }).filter(stryMutAct_9fa48("142704") ? () => undefined : (stryCov_9fa48("142704"), nodeId => stryMutAct_9fa48("142707") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("142706") ? false : stryMutAct_9fa48("142705") ? true : (stryCov_9fa48("142705", "142706", "142707"), (stryMutAct_9fa48("142709") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("142708") ? true : (stryCov_9fa48("142708", "142709"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("142712") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("142711") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("142710") ? true : (stryCov_9fa48("142710", "142711", "142712"), nodeId.length > NUM.ZERO)))))));
          const requiredHealthyNodeCount = this.resolveCriticalSystemRequiredHealthyNodeCount(activeMembershipNodeIds.length);
          const hasRequiredHealthyNodes = stryMutAct_9fa48("142716") ? activeNodeIds.length < requiredHealthyNodeCount : stryMutAct_9fa48("142715") ? activeNodeIds.length > requiredHealthyNodeCount : stryMutAct_9fa48("142714") ? false : stryMutAct_9fa48("142713") ? true : (stryCov_9fa48("142713", "142714", "142715", "142716"), activeNodeIds.length >= requiredHealthyNodeCount);
          const publishedActiveNodeIds = (stryMutAct_9fa48("142719") ? this.isControlPlanePriorityPartition() || hasRequiredHealthyNodes : stryMutAct_9fa48("142718") ? false : stryMutAct_9fa48("142717") ? true : (stryCov_9fa48("142717", "142718", "142719"), this.isControlPlanePriorityPartition() && hasRequiredHealthyNodes)) ? this.getPublishedActiveNodeIdSet() : null;
          for (const connectedNodeId of connectedNodeIds) {
            if (stryMutAct_9fa48("142720")) {
              {}
            } else {
              stryCov_9fa48("142720");
              if (stryMutAct_9fa48("142722") ? false : stryMutAct_9fa48("142721") ? true : (stryCov_9fa48("142721", "142722"), knownNodeIds.has(connectedNodeId))) {
                if (stryMutAct_9fa48("142723")) {
                  {}
                } else {
                  stryCov_9fa48("142723");
                  continue;
                }
              }
              if (stryMutAct_9fa48("142726") ? publishedActiveNodeIds || !publishedActiveNodeIds.has(connectedNodeId) : stryMutAct_9fa48("142725") ? false : stryMutAct_9fa48("142724") ? true : (stryCov_9fa48("142724", "142725", "142726"), publishedActiveNodeIds && (stryMutAct_9fa48("142727") ? publishedActiveNodeIds.has(connectedNodeId) : (stryCov_9fa48("142727"), !publishedActiveNodeIds.has(connectedNodeId))))) {
                if (stryMutAct_9fa48("142728")) {
                  {}
                } else {
                  stryCov_9fa48("142728");
                  continue;
                }
              }
              return Object.freeze(stryMutAct_9fa48("142729") ? {} : (stryCov_9fa48("142729"), {
                reason: CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TRANSPORT_MEMBERSHIP_EXCEEDS_NODES_CACHE,
                connectedNodeId
              }));
            }
          }
        }
      }
      const endpointVisibility = this.evaluateCriticalSystemEndpointVisibility(activeNodeIds, stryMutAct_9fa48("142730") ? {} : (stryCov_9fa48("142730"), {
        requiredReadyNodeCount: (stryMutAct_9fa48("142733") ? this.isControlPlanePriorityPartition() || activeNodeIds.length > NUM.ZERO : stryMutAct_9fa48("142732") ? false : stryMutAct_9fa48("142731") ? true : (stryCov_9fa48("142731", "142732", "142733"), this.isControlPlanePriorityPartition() && (stryMutAct_9fa48("142736") ? activeNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("142735") ? activeNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("142734") ? true : (stryCov_9fa48("142734", "142735", "142736"), activeNodeIds.length > NUM.ZERO)))) ? stryMutAct_9fa48("142737") ? Math.min(NUM.ONE, Math.min(activeNodeIds.length, this.getPriorityControlPlaneTargetReplicaCount())) : (stryCov_9fa48("142737"), Math.max(NUM.ONE, stryMutAct_9fa48("142738") ? Math.max(activeNodeIds.length, this.getPriorityControlPlaneTargetReplicaCount()) : (stryCov_9fa48("142738"), Math.min(activeNodeIds.length, this.getPriorityControlPlaneTargetReplicaCount())))) : activeNodeIds.length
      }));
      if (stryMutAct_9fa48("142741") ? endpointVisibility.ready === true : stryMutAct_9fa48("142740") ? false : stryMutAct_9fa48("142739") ? true : (stryCov_9fa48("142739", "142740", "142741"), endpointVisibility.ready !== (stryMutAct_9fa48("142742") ? false : (stryCov_9fa48("142742"), true)))) {
        if (stryMutAct_9fa48("142743")) {
          {}
        } else {
          stryCov_9fa48("142743");
          return Object.freeze(stryMutAct_9fa48("142744") ? {} : (stryCov_9fa48("142744"), {
            reason: CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.ENDPOINT_VISIBILITY_INCOMPLETE,
            ...endpointVisibility
          }));
        }
      }
      const inFlightTopologyOperations = this.collectCriticalSystemInFlightReplicaOperations(activeNodeIds, stryMutAct_9fa48("142745") ? {} : (stryCov_9fa48("142745"), {
        // Topology settling should only wait on in-flight operations that
        // mutate this same entity. Unrelated critical-system operations must
        // not serialize every other partition behind one active move.
        scopeToEntity: stryMutAct_9fa48("142746") ? false : (stryCov_9fa48("142746"), true)
      }));
      if (stryMutAct_9fa48("142750") ? inFlightTopologyOperations.count <= NUM.ZERO : stryMutAct_9fa48("142749") ? inFlightTopologyOperations.count >= NUM.ZERO : stryMutAct_9fa48("142748") ? false : stryMutAct_9fa48("142747") ? true : (stryCov_9fa48("142747", "142748", "142749", "142750"), inFlightTopologyOperations.count > NUM.ZERO)) {
        if (stryMutAct_9fa48("142751")) {
          {}
        } else {
          stryCov_9fa48("142751");
          return Object.freeze(stryMutAct_9fa48("142752") ? {} : (stryCov_9fa48("142752"), {
            reason: CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT,
            activeNodeIds: Object.freeze(stryMutAct_9fa48("142753") ? [] : (stryCov_9fa48("142753"), [...activeNodeIds])),
            inFlightReplicaOperations: inFlightTopologyOperations.count,
            inFlightReplicaOperationDetails: inFlightTopologyOperations.details,
            inFlightReplicaOperationsSource: stryMutAct_9fa48("142756") ? inFlightTopologyOperations.source && null : stryMutAct_9fa48("142755") ? false : stryMutAct_9fa48("142754") ? true : (stryCov_9fa48("142754", "142755", "142756"), inFlightTopologyOperations.source || null)
          }));
        }
      }
      return null;
    }
  }

  /**
   * Return true when critical system-partition rebalancing should wait for
   * topology convergence.
   *
   * @return {boolean}
   * @private
   */
  isCriticalSystemTopologySettling() {
    if (stryMutAct_9fa48("142757")) {
      {}
    } else {
      stryCov_9fa48("142757");
      return stryMutAct_9fa48("142760") ? this.getCriticalSystemTopologySettlingBlocker() === null : stryMutAct_9fa48("142759") ? false : stryMutAct_9fa48("142758") ? true : (stryCov_9fa48("142758", "142759", "142760"), this.getCriticalSystemTopologySettlingBlocker() !== null);
    }
  }

  /**
   * Revalidate in-flight topology blockers with authoritative entity
   * operations to avoid stale cache observations deadlocking planning.
   *
   * @param {Object|null} blocker
   * @return {Promise<Object|null>}
   * @private
   */
  async revalidateCriticalSystemTopologySettlingBlocker(blocker) {
    if (stryMutAct_9fa48("142761")) {
      {}
    } else {
      stryCov_9fa48("142761");
      if (stryMutAct_9fa48("142764") ? !blocker && blocker.reason !== CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT : stryMutAct_9fa48("142763") ? false : stryMutAct_9fa48("142762") ? true : (stryCov_9fa48("142762", "142763", "142764"), (stryMutAct_9fa48("142765") ? blocker : (stryCov_9fa48("142765"), !blocker)) || (stryMutAct_9fa48("142767") ? blocker.reason === CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT : stryMutAct_9fa48("142766") ? false : (stryCov_9fa48("142766", "142767"), blocker.reason !== CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT)))) {
        if (stryMutAct_9fa48("142768")) {
          {}
        } else {
          stryCov_9fa48("142768");
          return blocker;
        }
      }
      if (stryMutAct_9fa48("142771") ? !this.rebalanceCoordinator && typeof this.rebalanceCoordinator.getOperationsByEntity !== TYPEOF.FUNCTION : stryMutAct_9fa48("142770") ? false : stryMutAct_9fa48("142769") ? true : (stryCov_9fa48("142769", "142770", "142771"), (stryMutAct_9fa48("142772") ? this.rebalanceCoordinator : (stryCov_9fa48("142772"), !this.rebalanceCoordinator)) || (stryMutAct_9fa48("142774") ? typeof this.rebalanceCoordinator.getOperationsByEntity === TYPEOF.FUNCTION : stryMutAct_9fa48("142773") ? false : (stryCov_9fa48("142773", "142774"), typeof this.rebalanceCoordinator.getOperationsByEntity !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("142775")) {
          {}
        } else {
          stryCov_9fa48("142775");
          return blocker;
        }
      }
      let entityOperations = stryMutAct_9fa48("142776") ? ["Stryker was here"] : (stryCov_9fa48("142776"), []);
      try {
        if (stryMutAct_9fa48("142777")) {
          {}
        } else {
          stryCov_9fa48("142777");
          entityOperations = await this.rebalanceCoordinator.getOperationsByEntity(this.entityType, this.entityId);
        }
      } catch (error) {
        if (stryMutAct_9fa48("142778")) {
          {}
        } else {
          stryCov_9fa48("142778");
          this.logger.warn(REBALANCER_LOG_MSG.REVALIDATE_TOPOLOGY_BLOCKER_FAILED, stryMutAct_9fa48("142779") ? {} : (stryCov_9fa48("142779"), {
            entityId: this.entityId,
            entityType: this.entityType,
            reason: stryMutAct_9fa48("142782") ? blocker.reason && null : stryMutAct_9fa48("142781") ? false : stryMutAct_9fa48("142780") ? true : (stryCov_9fa48("142780", "142781", "142782"), blocker.reason || null),
            error: stryMutAct_9fa48("142785") ? error?.message && String(error) : stryMutAct_9fa48("142784") ? false : stryMutAct_9fa48("142783") ? true : (stryCov_9fa48("142783", "142784", "142785"), (stryMutAct_9fa48("142786") ? error.message : (stryCov_9fa48("142786"), error?.message)) || String(error))
          }));
          return blocker;
        }
      }
      const activeNodeIds = new Set(stryMutAct_9fa48("142787") ? Array.isArray(blocker.activeNodeIds) ? blocker.activeNodeIds : [] : (stryCov_9fa48("142787"), (Array.isArray(blocker.activeNodeIds) ? blocker.activeNodeIds : stryMutAct_9fa48("142788") ? ["Stryker was here"] : (stryCov_9fa48("142788"), [])).filter(stryMutAct_9fa48("142789") ? () => undefined : (stryCov_9fa48("142789"), nodeId => stryMutAct_9fa48("142792") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("142791") ? false : stryMutAct_9fa48("142790") ? true : (stryCov_9fa48("142790", "142791", "142792"), (stryMutAct_9fa48("142794") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("142793") ? true : (stryCov_9fa48("142793", "142794"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("142797") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("142796") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("142795") ? true : (stryCov_9fa48("142795", "142796", "142797"), nodeId.length > NUM.ZERO)))))));
      const inFlightDetails = stryMutAct_9fa48("142798") ? ["Stryker was here"] : (stryCov_9fa48("142798"), []);
      const nowMs = Date.now();
      for (const operation of entityOperations) {
        if (stryMutAct_9fa48("142799")) {
          {}
        } else {
          stryCov_9fa48("142799");
          if (stryMutAct_9fa48("142802") ? !this.isTopologySettlingInFlightOperation(operation, {
            nowMs
          }) && !this.isOperationForEntity(operation) : stryMutAct_9fa48("142801") ? false : stryMutAct_9fa48("142800") ? true : (stryCov_9fa48("142800", "142801", "142802"), (stryMutAct_9fa48("142803") ? this.isTopologySettlingInFlightOperation(operation, {
            nowMs
          }) : (stryCov_9fa48("142803"), !this.isTopologySettlingInFlightOperation(operation, stryMutAct_9fa48("142804") ? {} : (stryCov_9fa48("142804"), {
            nowMs
          })))) || (stryMutAct_9fa48("142805") ? this.isOperationForEntity(operation) : (stryCov_9fa48("142805"), !this.isOperationForEntity(operation))))) {
            if (stryMutAct_9fa48("142806")) {
              {}
            } else {
              stryCov_9fa48("142806");
              continue;
            }
          }
          const priorityAssessment = await this.getPriorityRecoveryPlanningAssessment(operation);
          if (stryMutAct_9fa48("142809") ? priorityAssessment || !shouldPriorityRecoveryOperationBlockPlanning(priorityAssessment) : stryMutAct_9fa48("142808") ? false : stryMutAct_9fa48("142807") ? true : (stryCov_9fa48("142807", "142808", "142809"), priorityAssessment && (stryMutAct_9fa48("142810") ? shouldPriorityRecoveryOperationBlockPlanning(priorityAssessment) : (stryCov_9fa48("142810"), !shouldPriorityRecoveryOperationBlockPlanning(priorityAssessment))))) {
            if (stryMutAct_9fa48("142811")) {
              {}
            } else {
              stryCov_9fa48("142811");
              continue;
            }
          }
          const detail = this.buildCriticalSystemInFlightReplicaOperationDetail(operation);
          if (stryMutAct_9fa48("142814") ? false : stryMutAct_9fa48("142813") ? true : stryMutAct_9fa48("142812") ? detail.targetNodeId : (stryCov_9fa48("142812", "142813", "142814"), !detail.targetNodeId)) {
            if (stryMutAct_9fa48("142815")) {
              {}
            } else {
              stryCov_9fa48("142815");
              continue;
            }
          }
          if (stryMutAct_9fa48("142818") ? activeNodeIds.size > NUM.ZERO || !activeNodeIds.has(detail.targetNodeId) : stryMutAct_9fa48("142817") ? false : stryMutAct_9fa48("142816") ? true : (stryCov_9fa48("142816", "142817", "142818"), (stryMutAct_9fa48("142821") ? activeNodeIds.size <= NUM.ZERO : stryMutAct_9fa48("142820") ? activeNodeIds.size >= NUM.ZERO : stryMutAct_9fa48("142819") ? true : (stryCov_9fa48("142819", "142820", "142821"), activeNodeIds.size > NUM.ZERO)) && (stryMutAct_9fa48("142822") ? activeNodeIds.has(detail.targetNodeId) : (stryCov_9fa48("142822"), !activeNodeIds.has(detail.targetNodeId))))) {
            if (stryMutAct_9fa48("142823")) {
              {}
            } else {
              stryCov_9fa48("142823");
              continue;
            }
          }
          inFlightDetails.push(detail);
        }
      }
      if (stryMutAct_9fa48("142826") ? inFlightDetails.length !== NUM.ZERO : stryMutAct_9fa48("142825") ? false : stryMutAct_9fa48("142824") ? true : (stryCov_9fa48("142824", "142825", "142826"), inFlightDetails.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("142827")) {
          {}
        } else {
          stryCov_9fa48("142827");
          return null;
        }
      }
      return Object.freeze(stryMutAct_9fa48("142828") ? {} : (stryCov_9fa48("142828"), {
        ...blocker,
        inFlightReplicaOperations: inFlightDetails.length,
        inFlightReplicaOperationDetails: Object.freeze(inFlightDetails),
        inFlightReplicaOperationsSource: TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE.AUTHORITATIVE
      }));
    }
  }

  /**
   * Resolve the current priority-recovery planning assessment for one
   * in-flight operation when it belongs to the startup-critical control-plane
   * lane.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async getPriorityRecoveryPlanningAssessment(operation) {
    if (stryMutAct_9fa48("142829")) {
      {}
    } else {
      stryCov_9fa48("142829");
      const partitionId = stryMutAct_9fa48("142832") ? (operation?.partitionId || operation?.partition_id) && null : stryMutAct_9fa48("142831") ? false : stryMutAct_9fa48("142830") ? true : (stryCov_9fa48("142830", "142831", "142832"), (stryMutAct_9fa48("142834") ? operation?.partitionId && operation?.partition_id : stryMutAct_9fa48("142833") ? false : (stryCov_9fa48("142833", "142834"), (stryMutAct_9fa48("142835") ? operation.partitionId : (stryCov_9fa48("142835"), operation?.partitionId)) || (stryMutAct_9fa48("142836") ? operation.partition_id : (stryCov_9fa48("142836"), operation?.partition_id)))) || null);
      if (stryMutAct_9fa48("142839") ? false : stryMutAct_9fa48("142838") ? true : stryMutAct_9fa48("142837") ? isPriorityControlPlanePartition({
        partitionId
      }) : (stryCov_9fa48("142837", "142838", "142839"), !isPriorityControlPlanePartition(stryMutAct_9fa48("142840") ? {} : (stryCov_9fa48("142840"), {
        partitionId
      })))) {
        if (stryMutAct_9fa48("142841")) {
          {}
        } else {
          stryCov_9fa48("142841");
          return null;
        }
      }
      const readinessService = this.controlPlaneReadinessService;
      if (stryMutAct_9fa48("142844") ? !readinessService && typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("142843") ? false : stryMutAct_9fa48("142842") ? true : (stryCov_9fa48("142842", "142843", "142844"), (stryMutAct_9fa48("142845") ? readinessService : (stryCov_9fa48("142845"), !readinessService)) || (stryMutAct_9fa48("142847") ? typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !== TYPEOF.FUNCTION || typeof readinessService.getMembershipPublicationPlanningSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("142846") ? false : (stryCov_9fa48("142846", "142847"), (stryMutAct_9fa48("142849") ? typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION || typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("142848") ? true : (stryCov_9fa48("142848", "142849"), (stryMutAct_9fa48("142851") ? typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort === TYPEOF.FUNCTION : stryMutAct_9fa48("142850") ? true : (stryCov_9fa48("142850", "142851"), typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION)) && (stryMutAct_9fa48("142853") ? typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort === TYPEOF.FUNCTION : stryMutAct_9fa48("142852") ? true : (stryCov_9fa48("142852", "142853"), typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !== TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("142855") ? typeof readinessService.getMembershipPublicationPlanningSnapshot === TYPEOF.FUNCTION : stryMutAct_9fa48("142854") ? true : (stryCov_9fa48("142854", "142855"), typeof readinessService.getMembershipPublicationPlanningSnapshot !== TYPEOF.FUNCTION)))))) {
        if (stryMutAct_9fa48("142856")) {
          {}
        } else {
          stryCov_9fa48("142856");
          return null;
        }
      }
      const publicationNodeId = stryMutAct_9fa48("142859") ? (operation?.targetNodeId || operation?.target_node_id || operation?.sourceNodeId || operation?.source_node_id) && this.nodeId : stryMutAct_9fa48("142858") ? false : stryMutAct_9fa48("142857") ? true : (stryCov_9fa48("142857", "142858", "142859"), (stryMutAct_9fa48("142861") ? (operation?.targetNodeId || operation?.target_node_id || operation?.sourceNodeId) && operation?.source_node_id : stryMutAct_9fa48("142860") ? false : (stryCov_9fa48("142860", "142861"), (stryMutAct_9fa48("142863") ? (operation?.targetNodeId || operation?.target_node_id) && operation?.sourceNodeId : stryMutAct_9fa48("142862") ? false : (stryCov_9fa48("142862", "142863"), (stryMutAct_9fa48("142865") ? operation?.targetNodeId && operation?.target_node_id : stryMutAct_9fa48("142864") ? false : (stryCov_9fa48("142864", "142865"), (stryMutAct_9fa48("142866") ? operation.targetNodeId : (stryCov_9fa48("142866"), operation?.targetNodeId)) || (stryMutAct_9fa48("142867") ? operation.target_node_id : (stryCov_9fa48("142867"), operation?.target_node_id)))) || (stryMutAct_9fa48("142868") ? operation.sourceNodeId : (stryCov_9fa48("142868"), operation?.sourceNodeId)))) || (stryMutAct_9fa48("142869") ? operation.source_node_id : (stryCov_9fa48("142869"), operation?.source_node_id)))) || this.nodeId);
      const observedAt = Date.now();
      let planningSnapshot = null;
      if (stryMutAct_9fa48("142872") ? typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("142871") ? false : stryMutAct_9fa48("142870") ? true : (stryCov_9fa48("142870", "142871", "142872"), typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("142873")) {
          {}
        } else {
          stryCov_9fa48("142873");
          planningSnapshot = await readinessService.getMembershipPublicationPlanningAnswerBestEffort(publicationNodeId, observedAt);
        }
      } else if (stryMutAct_9fa48("142876") ? typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("142875") ? false : stryMutAct_9fa48("142874") ? true : (stryCov_9fa48("142874", "142875", "142876"), typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("142877")) {
          {}
        } else {
          stryCov_9fa48("142877");
          planningSnapshot = await readinessService.getMembershipPublicationPlanningSnapshotBestEffort(publicationNodeId, observedAt);
        }
      } else {
        if (stryMutAct_9fa48("142878")) {
          {}
        } else {
          stryCov_9fa48("142878");
          planningSnapshot = await readinessService.getMembershipPublicationPlanningSnapshot(publicationNodeId, observedAt);
        }
      }
      if (stryMutAct_9fa48("142881") ? !planningSnapshot && typeof planningSnapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("142880") ? false : stryMutAct_9fa48("142879") ? true : (stryCov_9fa48("142879", "142880", "142881"), (stryMutAct_9fa48("142882") ? planningSnapshot : (stryCov_9fa48("142882"), !planningSnapshot)) || (stryMutAct_9fa48("142884") ? typeof planningSnapshot === TYPEOF.OBJECT : stryMutAct_9fa48("142883") ? false : (stryCov_9fa48("142883", "142884"), typeof planningSnapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("142885")) {
          {}
        } else {
          stryCov_9fa48("142885");
          return null;
        }
      }
      return buildPriorityRecoveryOperationAssessment(stryMutAct_9fa48("142886") ? {} : (stryCov_9fa48("142886"), {
        operation,
        priorityPartitionSummary: stryMutAct_9fa48("142889") ? planningSnapshot.priorityPartitionSummary && null : stryMutAct_9fa48("142888") ? false : stryMutAct_9fa48("142887") ? true : (stryCov_9fa48("142887", "142888", "142889"), planningSnapshot.priorityPartitionSummary || null),
        effectiveEligibleNodeIds: resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds
      }));
    }
  }

  /**
   * Resolve a synchronous priority-recovery planning assessment for topology
   * blocker filtering.
   *
   * @param {Object} operation
   * @param {Object} options
   * @param {number} [options.observedAt]
   * @return {Object|null}
   * @private
   */
  getPriorityRecoveryPlanningAssessmentSync(operation, options = {}) {
    if (stryMutAct_9fa48("142890")) {
      {}
    } else {
      stryCov_9fa48("142890");
      const partitionId = stryMutAct_9fa48("142893") ? (operation?.partitionId || operation?.partition_id) && null : stryMutAct_9fa48("142892") ? false : stryMutAct_9fa48("142891") ? true : (stryCov_9fa48("142891", "142892", "142893"), (stryMutAct_9fa48("142895") ? operation?.partitionId && operation?.partition_id : stryMutAct_9fa48("142894") ? false : (stryCov_9fa48("142894", "142895"), (stryMutAct_9fa48("142896") ? operation.partitionId : (stryCov_9fa48("142896"), operation?.partitionId)) || (stryMutAct_9fa48("142897") ? operation.partition_id : (stryCov_9fa48("142897"), operation?.partition_id)))) || null);
      if (stryMutAct_9fa48("142900") ? false : stryMutAct_9fa48("142899") ? true : stryMutAct_9fa48("142898") ? isPriorityControlPlanePartition({
        partitionId
      }) : (stryCov_9fa48("142898", "142899", "142900"), !isPriorityControlPlanePartition(stryMutAct_9fa48("142901") ? {} : (stryCov_9fa48("142901"), {
        partitionId
      })))) {
        if (stryMutAct_9fa48("142902")) {
          {}
        } else {
          stryCov_9fa48("142902");
          return null;
        }
      }
      const readinessService = this.controlPlaneReadinessService;
      if (stryMutAct_9fa48("142905") ? !readinessService && typeof readinessService.getPriorityRecoveryPlanningAnswerSync !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningAnswerSync !== TYPEOF.FUNCTION && typeof readinessService.getPriorityRecoveryPlanningSnapshotSync !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningSnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142904") ? false : stryMutAct_9fa48("142903") ? true : (stryCov_9fa48("142903", "142904", "142905"), (stryMutAct_9fa48("142906") ? readinessService : (stryCov_9fa48("142906"), !readinessService)) || (stryMutAct_9fa48("142908") ? typeof readinessService.getPriorityRecoveryPlanningAnswerSync !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningAnswerSync !== TYPEOF.FUNCTION && typeof readinessService.getPriorityRecoveryPlanningSnapshotSync !== TYPEOF.FUNCTION || typeof readinessService.getMembershipPublicationPlanningSnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142907") ? false : (stryCov_9fa48("142907", "142908"), (stryMutAct_9fa48("142910") ? typeof readinessService.getPriorityRecoveryPlanningAnswerSync !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningAnswerSync !== TYPEOF.FUNCTION || typeof readinessService.getPriorityRecoveryPlanningSnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142909") ? true : (stryCov_9fa48("142909", "142910"), (stryMutAct_9fa48("142912") ? typeof readinessService.getPriorityRecoveryPlanningAnswerSync !== TYPEOF.FUNCTION || typeof readinessService.getMembershipPublicationPlanningAnswerSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142911") ? true : (stryCov_9fa48("142911", "142912"), (stryMutAct_9fa48("142914") ? typeof readinessService.getPriorityRecoveryPlanningAnswerSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142913") ? true : (stryCov_9fa48("142913", "142914"), typeof readinessService.getPriorityRecoveryPlanningAnswerSync !== TYPEOF.FUNCTION)) && (stryMutAct_9fa48("142916") ? typeof readinessService.getMembershipPublicationPlanningAnswerSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142915") ? true : (stryCov_9fa48("142915", "142916"), typeof readinessService.getMembershipPublicationPlanningAnswerSync !== TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("142918") ? typeof readinessService.getPriorityRecoveryPlanningSnapshotSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142917") ? true : (stryCov_9fa48("142917", "142918"), typeof readinessService.getPriorityRecoveryPlanningSnapshotSync !== TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("142920") ? typeof readinessService.getMembershipPublicationPlanningSnapshotSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142919") ? true : (stryCov_9fa48("142919", "142920"), typeof readinessService.getMembershipPublicationPlanningSnapshotSync !== TYPEOF.FUNCTION)))))) {
        if (stryMutAct_9fa48("142921")) {
          {}
        } else {
          stryCov_9fa48("142921");
          return null;
        }
      }
      const publicationNodeId = stryMutAct_9fa48("142924") ? (operation?.targetNodeId || operation?.target_node_id || operation?.sourceNodeId || operation?.source_node_id) && this.nodeId : stryMutAct_9fa48("142923") ? false : stryMutAct_9fa48("142922") ? true : (stryCov_9fa48("142922", "142923", "142924"), (stryMutAct_9fa48("142926") ? (operation?.targetNodeId || operation?.target_node_id || operation?.sourceNodeId) && operation?.source_node_id : stryMutAct_9fa48("142925") ? false : (stryCov_9fa48("142925", "142926"), (stryMutAct_9fa48("142928") ? (operation?.targetNodeId || operation?.target_node_id) && operation?.sourceNodeId : stryMutAct_9fa48("142927") ? false : (stryCov_9fa48("142927", "142928"), (stryMutAct_9fa48("142930") ? operation?.targetNodeId && operation?.target_node_id : stryMutAct_9fa48("142929") ? false : (stryCov_9fa48("142929", "142930"), (stryMutAct_9fa48("142931") ? operation.targetNodeId : (stryCov_9fa48("142931"), operation?.targetNodeId)) || (stryMutAct_9fa48("142932") ? operation.target_node_id : (stryCov_9fa48("142932"), operation?.target_node_id)))) || (stryMutAct_9fa48("142933") ? operation.sourceNodeId : (stryCov_9fa48("142933"), operation?.sourceNodeId)))) || (stryMutAct_9fa48("142934") ? operation.source_node_id : (stryCov_9fa48("142934"), operation?.source_node_id)))) || this.nodeId);
      const observedAt = Number.isFinite(options.observedAt) ? Math.floor(options.observedAt) : Date.now();
      let planningSnapshot = null;
      if (stryMutAct_9fa48("142937") ? typeof readinessService.getPriorityRecoveryPlanningAnswerSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142936") ? false : stryMutAct_9fa48("142935") ? true : (stryCov_9fa48("142935", "142936", "142937"), typeof readinessService.getPriorityRecoveryPlanningAnswerSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("142938")) {
          {}
        } else {
          stryCov_9fa48("142938");
          planningSnapshot = readinessService.getPriorityRecoveryPlanningAnswerSync(publicationNodeId, observedAt);
        }
      } else if (stryMutAct_9fa48("142941") ? typeof readinessService.getMembershipPublicationPlanningAnswerSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142940") ? false : stryMutAct_9fa48("142939") ? true : (stryCov_9fa48("142939", "142940", "142941"), typeof readinessService.getMembershipPublicationPlanningAnswerSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("142942")) {
          {}
        } else {
          stryCov_9fa48("142942");
          planningSnapshot = readinessService.getMembershipPublicationPlanningAnswerSync(publicationNodeId, observedAt);
        }
      } else if (stryMutAct_9fa48("142945") ? typeof readinessService.getPriorityRecoveryPlanningSnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142944") ? false : stryMutAct_9fa48("142943") ? true : (stryCov_9fa48("142943", "142944", "142945"), typeof readinessService.getPriorityRecoveryPlanningSnapshotSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("142946")) {
          {}
        } else {
          stryCov_9fa48("142946");
          planningSnapshot = readinessService.getPriorityRecoveryPlanningSnapshotSync(publicationNodeId, observedAt);
        }
      } else if (stryMutAct_9fa48("142949") ? typeof readinessService.getMembershipPublicationPlanningSnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142948") ? false : stryMutAct_9fa48("142947") ? true : (stryCov_9fa48("142947", "142948", "142949"), typeof readinessService.getMembershipPublicationPlanningSnapshotSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("142950")) {
          {}
        } else {
          stryCov_9fa48("142950");
          planningSnapshot = readinessService.getMembershipPublicationPlanningSnapshotSync(publicationNodeId, observedAt);
        }
      }
      if (stryMutAct_9fa48("142953") ? !planningSnapshot && typeof planningSnapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("142952") ? false : stryMutAct_9fa48("142951") ? true : (stryCov_9fa48("142951", "142952", "142953"), (stryMutAct_9fa48("142954") ? planningSnapshot : (stryCov_9fa48("142954"), !planningSnapshot)) || (stryMutAct_9fa48("142956") ? typeof planningSnapshot === TYPEOF.OBJECT : stryMutAct_9fa48("142955") ? false : (stryCov_9fa48("142955", "142956"), typeof planningSnapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("142957")) {
          {}
        } else {
          stryCov_9fa48("142957");
          return null;
        }
      }
      return buildPriorityRecoveryOperationAssessment(stryMutAct_9fa48("142958") ? {} : (stryCov_9fa48("142958"), {
        operation,
        priorityPartitionSummary: stryMutAct_9fa48("142961") ? planningSnapshot.priorityPartitionSummary && null : stryMutAct_9fa48("142960") ? false : stryMutAct_9fa48("142959") ? true : (stryCov_9fa48("142959", "142960", "142961"), planningSnapshot.priorityPartitionSummary || null),
        effectiveEligibleNodeIds: resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds
      }));
    }
  }

  /**
   * Return a blocker summary when non-system entities should yield until the
   * startup-critical control-plane partitions are spread across ready nodes.
   *
   * This keeps user/data-plane rebalancing from consuming the global
   * rebalancer budget while the seed is still the only owner of the control
   * plane write path.
   *
   * @return {Object|null}
   * @private
   */
  getControlPlanePrioritySpreadBlocker() {
    if (stryMutAct_9fa48("142962")) {
      {}
    } else {
      stryCov_9fa48("142962");
      if (stryMutAct_9fa48("142964") ? false : stryMutAct_9fa48("142963") ? true : (stryCov_9fa48("142963", "142964"), this.isSystemPartitionEntity())) {
        if (stryMutAct_9fa48("142965")) {
          {}
        } else {
          stryCov_9fa48("142965");
          return null;
        }
      }
      const readinessService = this.controlPlaneReadinessService;
      const observedAt = Date.now();
      let planningSnapshot = null;
      if (stryMutAct_9fa48("142968") ? false : stryMutAct_9fa48("142967") ? true : stryMutAct_9fa48("142966") ? readinessService : (stryCov_9fa48("142966", "142967", "142968"), !readinessService)) {
        if (stryMutAct_9fa48("142969")) {
          {}
        } else {
          stryCov_9fa48("142969");
          return null;
        }
      }
      if (stryMutAct_9fa48("142972") ? typeof readinessService.getMembershipPublicationPlanningAnswerSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142971") ? false : stryMutAct_9fa48("142970") ? true : (stryCov_9fa48("142970", "142971", "142972"), typeof readinessService.getMembershipPublicationPlanningAnswerSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("142973")) {
          {}
        } else {
          stryCov_9fa48("142973");
          planningSnapshot = readinessService.getMembershipPublicationPlanningAnswerSync(this.nodeId, observedAt);
        }
      } else if (stryMutAct_9fa48("142976") ? readinessService || typeof readinessService.getMembershipPublicationPlanningSnapshotSync === TYPEOF.FUNCTION : stryMutAct_9fa48("142975") ? false : stryMutAct_9fa48("142974") ? true : (stryCov_9fa48("142974", "142975", "142976"), readinessService && (stryMutAct_9fa48("142978") ? typeof readinessService.getMembershipPublicationPlanningSnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("142977") ? true : (stryCov_9fa48("142977", "142978"), typeof readinessService.getMembershipPublicationPlanningSnapshotSync === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("142979")) {
          {}
        } else {
          stryCov_9fa48("142979");
          planningSnapshot = readinessService.getMembershipPublicationPlanningSnapshotSync(this.nodeId, observedAt);
        }
      } else {
        if (stryMutAct_9fa48("142980")) {
          {}
        } else {
          stryCov_9fa48("142980");
          return null;
        }
      }
      let priorityPartitionSummary = stryMutAct_9fa48("142981") ? (planningSnapshot?.priorityPartitionSummary ?? planningSnapshot?.priority_partition_summary) && null : (stryCov_9fa48("142981"), (stryMutAct_9fa48("142982") ? planningSnapshot?.priorityPartitionSummary && planningSnapshot?.priority_partition_summary : (stryCov_9fa48("142982"), (stryMutAct_9fa48("142983") ? planningSnapshot.priorityPartitionSummary : (stryCov_9fa48("142983"), planningSnapshot?.priorityPartitionSummary)) ?? (stryMutAct_9fa48("142984") ? planningSnapshot.priority_partition_summary : (stryCov_9fa48("142984"), planningSnapshot?.priority_partition_summary)))) ?? null);
      if (stryMutAct_9fa48("142987") ? false : stryMutAct_9fa48("142986") ? true : stryMutAct_9fa48("142985") ? priorityPartitionSummary : (stryCov_9fa48("142985", "142986", "142987"), !priorityPartitionSummary)) {
        if (stryMutAct_9fa48("142988")) {
          {}
        } else {
          stryCov_9fa48("142988");
          return null;
        }
      }
      if (stryMutAct_9fa48("142991") ? false : stryMutAct_9fa48("142990") ? true : stryMutAct_9fa48("142989") ? hasPriorityRecoverySpreadGap(priorityPartitionSummary) : (stryCov_9fa48("142989", "142990", "142991"), !hasPriorityRecoverySpreadGap(priorityPartitionSummary))) {
        if (stryMutAct_9fa48("142992")) {
          {}
        } else {
          stryCov_9fa48("142992");
          return null;
        }
      }
      const planningPublishedActiveNodeIds = new Set(stryMutAct_9fa48("142993") ? Array.isArray(planningSnapshot?.publishedActiveNodeIds) ? planningSnapshot.publishedActiveNodeIds : Array.isArray(planningSnapshot?.published_active_node_ids) ? planningSnapshot.published_active_node_ids : [] : (stryCov_9fa48("142993"), (Array.isArray(stryMutAct_9fa48("142994") ? planningSnapshot.publishedActiveNodeIds : (stryCov_9fa48("142994"), planningSnapshot?.publishedActiveNodeIds)) ? planningSnapshot.publishedActiveNodeIds : Array.isArray(stryMutAct_9fa48("142995") ? planningSnapshot.published_active_node_ids : (stryCov_9fa48("142995"), planningSnapshot?.published_active_node_ids)) ? planningSnapshot.published_active_node_ids : stryMutAct_9fa48("142996") ? ["Stryker was here"] : (stryCov_9fa48("142996"), [])).filter(stryMutAct_9fa48("142997") ? () => undefined : (stryCov_9fa48("142997"), nodeId => stryMutAct_9fa48("143000") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("142999") ? false : stryMutAct_9fa48("142998") ? true : (stryCov_9fa48("142998", "142999", "143000"), (stryMutAct_9fa48("143002") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("143001") ? true : (stryCov_9fa48("143001", "143002"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("143005") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("143004") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("143003") ? true : (stryCov_9fa48("143003", "143004", "143005"), nodeId.length > NUM.ZERO)))))));
      const readyNodes = (stryMutAct_9fa48("143009") ? planningPublishedActiveNodeIds.size <= NUM.ZERO : stryMutAct_9fa48("143008") ? planningPublishedActiveNodeIds.size >= NUM.ZERO : stryMutAct_9fa48("143007") ? false : stryMutAct_9fa48("143006") ? true : (stryCov_9fa48("143006", "143007", "143008", "143009"), planningPublishedActiveNodeIds.size > NUM.ZERO)) ? this.getAvailableNodesConstrainedToNodeIds(planningPublishedActiveNodeIds) : this.getAvailableNodes();
      const readyNodeIds = new Set(stryMutAct_9fa48("143010") ? readyNodes.map(node => node?.node_id || node?.nodeId || '') : (stryCov_9fa48("143010"), readyNodes.map(stryMutAct_9fa48("143011") ? () => undefined : (stryCov_9fa48("143011"), node => stryMutAct_9fa48("143014") ? (node?.node_id || node?.nodeId) && '' : stryMutAct_9fa48("143013") ? false : stryMutAct_9fa48("143012") ? true : (stryCov_9fa48("143012", "143013", "143014"), (stryMutAct_9fa48("143016") ? node?.node_id && node?.nodeId : stryMutAct_9fa48("143015") ? false : (stryCov_9fa48("143015", "143016"), (stryMutAct_9fa48("143017") ? node.node_id : (stryCov_9fa48("143017"), node?.node_id)) || (stryMutAct_9fa48("143018") ? node.nodeId : (stryCov_9fa48("143018"), node?.nodeId)))) || (stryMutAct_9fa48("143019") ? "Stryker was here!" : (stryCov_9fa48("143019"), ''))))).filter(Boolean)));
      const requiredDistinctNodeCount = stryMutAct_9fa48("143020") ? Math.max(NUM.THREE, readyNodeIds.size) : (stryCov_9fa48("143020"), Math.min(NUM.THREE, readyNodeIds.size));
      if (stryMutAct_9fa48("143024") ? requiredDistinctNodeCount > NUM.ONE : stryMutAct_9fa48("143023") ? requiredDistinctNodeCount < NUM.ONE : stryMutAct_9fa48("143022") ? false : stryMutAct_9fa48("143021") ? true : (stryCov_9fa48("143021", "143022", "143023", "143024"), requiredDistinctNodeCount <= NUM.ONE)) {
        if (stryMutAct_9fa48("143025")) {
          {}
        } else {
          stryCov_9fa48("143025");
          return null;
        }
      }
      const requiredQuorumDistinctNodeCount = this.resolvePriorityControlPlaneQuorumDistinctNodeCount(requiredDistinctNodeCount);
      const blockedPartitions = stryMutAct_9fa48("143026") ? buildPriorityRecoveryBlockedPartitions(priorityPartitionSummary).map(partition => Object.freeze({
        partitionId: String(partition?.partitionId || ''),
        readyReplicaCount: Number.isFinite(partition?.readyReplicaCount) ? partition.readyReplicaCount : null,
        readyDistinctNodeCount: Number.isFinite(partition?.readyDistinctNodeCount) ? partition.readyDistinctNodeCount : null,
        spreadGap: Number.isFinite(partition?.spreadGap) ? partition.spreadGap : null
      })) : (stryCov_9fa48("143026"), buildPriorityRecoveryBlockedPartitions(priorityPartitionSummary).map(stryMutAct_9fa48("143027") ? () => undefined : (stryCov_9fa48("143027"), partition => Object.freeze(stryMutAct_9fa48("143028") ? {} : (stryCov_9fa48("143028"), {
        partitionId: String(stryMutAct_9fa48("143031") ? partition?.partitionId && '' : stryMutAct_9fa48("143030") ? false : stryMutAct_9fa48("143029") ? true : (stryCov_9fa48("143029", "143030", "143031"), (stryMutAct_9fa48("143032") ? partition.partitionId : (stryCov_9fa48("143032"), partition?.partitionId)) || (stryMutAct_9fa48("143033") ? "Stryker was here!" : (stryCov_9fa48("143033"), '')))),
        readyReplicaCount: Number.isFinite(stryMutAct_9fa48("143034") ? partition.readyReplicaCount : (stryCov_9fa48("143034"), partition?.readyReplicaCount)) ? partition.readyReplicaCount : null,
        readyDistinctNodeCount: Number.isFinite(stryMutAct_9fa48("143035") ? partition.readyDistinctNodeCount : (stryCov_9fa48("143035"), partition?.readyDistinctNodeCount)) ? partition.readyDistinctNodeCount : null,
        spreadGap: Number.isFinite(stryMutAct_9fa48("143036") ? partition.spreadGap : (stryCov_9fa48("143036"), partition?.spreadGap)) ? partition.spreadGap : null
      })))).filter(stryMutAct_9fa48("143037") ? () => undefined : (stryCov_9fa48("143037"), partition => stryMutAct_9fa48("143041") ? partition.partitionId.length <= NUM.ZERO : stryMutAct_9fa48("143040") ? partition.partitionId.length >= NUM.ZERO : stryMutAct_9fa48("143039") ? false : stryMutAct_9fa48("143038") ? true : (stryCov_9fa48("143038", "143039", "143040", "143041"), partition.partitionId.length > NUM.ZERO))));
      const quorumBlockedPartitions = stryMutAct_9fa48("143042") ? blockedPartitions : (stryCov_9fa48("143042"), blockedPartitions.filter(partition => {
        if (stryMutAct_9fa48("143043")) {
          {}
        } else {
          stryCov_9fa48("143043");
          return stryMutAct_9fa48("143046") ? !Number.isFinite(partition.readyDistinctNodeCount) && partition.readyDistinctNodeCount < requiredQuorumDistinctNodeCount : stryMutAct_9fa48("143045") ? false : stryMutAct_9fa48("143044") ? true : (stryCov_9fa48("143044", "143045", "143046"), (stryMutAct_9fa48("143047") ? Number.isFinite(partition.readyDistinctNodeCount) : (stryCov_9fa48("143047"), !Number.isFinite(partition.readyDistinctNodeCount))) || (stryMutAct_9fa48("143050") ? partition.readyDistinctNodeCount >= requiredQuorumDistinctNodeCount : stryMutAct_9fa48("143049") ? partition.readyDistinctNodeCount <= requiredQuorumDistinctNodeCount : stryMutAct_9fa48("143048") ? false : (stryCov_9fa48("143048", "143049", "143050"), partition.readyDistinctNodeCount < requiredQuorumDistinctNodeCount)));
        }
      }));
      if (stryMutAct_9fa48("143053") ? quorumBlockedPartitions.length !== NUM.ZERO : stryMutAct_9fa48("143052") ? false : stryMutAct_9fa48("143051") ? true : (stryCov_9fa48("143051", "143052", "143053"), quorumBlockedPartitions.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("143054")) {
          {}
        } else {
          stryCov_9fa48("143054");
          return null;
        }
      }
      return Object.freeze(stryMutAct_9fa48("143055") ? {} : (stryCov_9fa48("143055"), {
        requiredDistinctNodeCount,
        requiredQuorumDistinctNodeCount,
        blockedPartitions: Object.freeze(quorumBlockedPartitions)
      }));
    }
  }

  /**
   * Resolve live cluster peers from the message router plus the local node.
   * When transport shows peers that the nodes table does not yet publish,
   * system-topology background work should continue to treat the cluster as
   * settling.
   * @return {Set<string>}
   * @private
   */
  resolveConnectedClusterNodeIds() {
    if (stryMutAct_9fa48("143056")) {
      {}
    } else {
      stryCov_9fa48("143056");
      const connectedNodeIds = new Set();
      if (stryMutAct_9fa48("143059") ? typeof this.nodeId === TYPEOF.STRING || this.nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143058") ? false : stryMutAct_9fa48("143057") ? true : (stryCov_9fa48("143057", "143058", "143059"), (stryMutAct_9fa48("143061") ? typeof this.nodeId !== TYPEOF.STRING : stryMutAct_9fa48("143060") ? true : (stryCov_9fa48("143060", "143061"), typeof this.nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("143064") ? this.nodeId.length <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143063") ? this.nodeId.length >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143062") ? true : (stryCov_9fa48("143062", "143063", "143064"), this.nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO)))) {
        if (stryMutAct_9fa48("143065")) {
          {}
        } else {
          stryCov_9fa48("143065");
          connectedNodeIds.add(this.nodeId);
        }
      }
      const peers = (stryMutAct_9fa48("143068") ? typeof this.messageRouter?.getConnectedNodes !== TYPEOF.FUNCTION : stryMutAct_9fa48("143067") ? false : stryMutAct_9fa48("143066") ? true : (stryCov_9fa48("143066", "143067", "143068"), typeof (stryMutAct_9fa48("143069") ? this.messageRouter.getConnectedNodes : (stryCov_9fa48("143069"), this.messageRouter?.getConnectedNodes)) === TYPEOF.FUNCTION)) ? this.messageRouter.getConnectedNodes() : stryMutAct_9fa48("143070") ? ["Stryker was here"] : (stryCov_9fa48("143070"), []);
      for (const peerNodeId of peers) {
        if (stryMutAct_9fa48("143071")) {
          {}
        } else {
          stryCov_9fa48("143071");
          if (stryMutAct_9fa48("143074") ? typeof peerNodeId === TYPEOF.STRING || peerNodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143073") ? false : stryMutAct_9fa48("143072") ? true : (stryCov_9fa48("143072", "143073", "143074"), (stryMutAct_9fa48("143076") ? typeof peerNodeId !== TYPEOF.STRING : stryMutAct_9fa48("143075") ? true : (stryCov_9fa48("143075", "143076"), typeof peerNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("143079") ? peerNodeId.length <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143078") ? peerNodeId.length >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143077") ? true : (stryCov_9fa48("143077", "143078", "143079"), peerNodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO)))) {
            if (stryMutAct_9fa48("143080")) {
              {}
            } else {
              stryCov_9fa48("143080");
              connectedNodeIds.add(peerNodeId);
            }
          }
        }
      }
      return connectedNodeIds;
    }
  }

  /**
   * Return one endpoint visibility summary for ACTIVE cluster members.
   * @param {string[]} activeNodeIds
   * @param {Object} [options={}]
   * @param {number} [options.requiredReadyNodeCount]
   * @return {{
   *   ready: boolean,
   *   missingNodeEndpointNodeIds: string[],
   *   missingPostgresWireNodeIds: string[],
   *   endpointReadyNodeCount: number,
   *   requiredReadyNodeCount: number,
   *   endpointReadyNodeIds: string[],
   * }}
   * @private
   */
  evaluateCriticalSystemEndpointVisibility(activeNodeIds = stryMutAct_9fa48("143081") ? ["Stryker was here"] : (stryCov_9fa48("143081"), []), options = {}) {
    if (stryMutAct_9fa48("143082")) {
      {}
    } else {
      stryCov_9fa48("143082");
      const requiredNodeIds = Array.isArray(activeNodeIds) ? stryMutAct_9fa48("143083") ? [] : (stryCov_9fa48("143083"), [...new Set(stryMutAct_9fa48("143084") ? activeNodeIds : (stryCov_9fa48("143084"), activeNodeIds.filter(stryMutAct_9fa48("143085") ? () => undefined : (stryCov_9fa48("143085"), nodeId => stryMutAct_9fa48("143088") ? typeof nodeId === TYPEOF.STRING || nodeId.length > 0 : stryMutAct_9fa48("143087") ? false : stryMutAct_9fa48("143086") ? true : (stryCov_9fa48("143086", "143087", "143088"), (stryMutAct_9fa48("143090") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("143089") ? true : (stryCov_9fa48("143089", "143090"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("143093") ? nodeId.length <= 0 : stryMutAct_9fa48("143092") ? nodeId.length >= 0 : stryMutAct_9fa48("143091") ? true : (stryCov_9fa48("143091", "143092", "143093"), nodeId.length > 0)))))))]) : stryMutAct_9fa48("143094") ? ["Stryker was here"] : (stryCov_9fa48("143094"), []);
      const configuredRequiredReadyNodeCount = (stryMutAct_9fa48("143097") ? Number.isInteger(options?.requiredReadyNodeCount) || options.requiredReadyNodeCount > NUM.ZERO : stryMutAct_9fa48("143096") ? false : stryMutAct_9fa48("143095") ? true : (stryCov_9fa48("143095", "143096", "143097"), Number.isInteger(stryMutAct_9fa48("143098") ? options.requiredReadyNodeCount : (stryCov_9fa48("143098"), options?.requiredReadyNodeCount)) && (stryMutAct_9fa48("143101") ? options.requiredReadyNodeCount <= NUM.ZERO : stryMutAct_9fa48("143100") ? options.requiredReadyNodeCount >= NUM.ZERO : stryMutAct_9fa48("143099") ? true : (stryCov_9fa48("143099", "143100", "143101"), options.requiredReadyNodeCount > NUM.ZERO)))) ? options.requiredReadyNodeCount : requiredNodeIds.length;
      const requiredReadyNodeCount = (stryMutAct_9fa48("143105") ? requiredNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("143104") ? requiredNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("143103") ? false : stryMutAct_9fa48("143102") ? true : (stryCov_9fa48("143102", "143103", "143104", "143105"), requiredNodeIds.length > NUM.ZERO)) ? stryMutAct_9fa48("143106") ? Math.min(NUM.ONE, Math.min(requiredNodeIds.length, configuredRequiredReadyNodeCount)) : (stryCov_9fa48("143106"), Math.max(NUM.ONE, stryMutAct_9fa48("143107") ? Math.max(requiredNodeIds.length, configuredRequiredReadyNodeCount) : (stryCov_9fa48("143107"), Math.min(requiredNodeIds.length, configuredRequiredReadyNodeCount)))) : NUM.ZERO;
      if (stryMutAct_9fa48("143110") ? requiredNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("143109") ? false : stryMutAct_9fa48("143108") ? true : (stryCov_9fa48("143108", "143109", "143110"), requiredNodeIds.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("143111")) {
          {}
        } else {
          stryCov_9fa48("143111");
          return Object.freeze(stryMutAct_9fa48("143112") ? {} : (stryCov_9fa48("143112"), {
            ready: stryMutAct_9fa48("143113") ? true : (stryCov_9fa48("143113"), false),
            missingNodeEndpointNodeIds: stryMutAct_9fa48("143114") ? ["Stryker was here"] : (stryCov_9fa48("143114"), []),
            missingPostgresWireNodeIds: stryMutAct_9fa48("143115") ? ["Stryker was here"] : (stryCov_9fa48("143115"), []),
            endpointReadyNodeCount: NUM.ZERO,
            requiredReadyNodeCount,
            endpointReadyNodeIds: stryMutAct_9fa48("143116") ? ["Stryker was here"] : (stryCov_9fa48("143116"), [])
          }));
        }
      }
      const nodeEndpointRows = (stryMutAct_9fa48("143119") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("143118") ? false : stryMutAct_9fa48("143117") ? true : (stryCov_9fa48("143117", "143118", "143119"), typeof (stryMutAct_9fa48("143120") ? this.systemTableCache.getAll : (stryCov_9fa48("143120"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) : stryMutAct_9fa48("143121") ? ["Stryker was here"] : (stryCov_9fa48("143121"), []);
      const serviceEndpointRows = (stryMutAct_9fa48("143124") ? typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("143123") ? false : stryMutAct_9fa48("143122") ? true : (stryCov_9fa48("143122", "143123", "143124"), typeof (stryMutAct_9fa48("143125") ? this.systemTableCache.getAll : (stryCov_9fa48("143125"), this.systemTableCache?.getAll)) === TYPEOF.FUNCTION)) ? this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS) : stryMutAct_9fa48("143126") ? ["Stryker was here"] : (stryCov_9fa48("143126"), []);
      const visibleNodeEndpointNodeIds = new Set();
      const visiblePostgresWireNodeIds = new Set();
      for (const row of nodeEndpointRows) {
        if (stryMutAct_9fa48("143127")) {
          {}
        } else {
          stryCov_9fa48("143127");
          const normalizedRow = normalizeNodeEndpointRow(row);
          const {
            nodeId,
            status,
            transportType
          } = normalizedRow;
          if (stryMutAct_9fa48("143130") ? (!nodeId || status !== String(ENDPOINT_STATUS.ACTIVE).toLowerCase()) && transportType !== String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() : stryMutAct_9fa48("143129") ? false : stryMutAct_9fa48("143128") ? true : (stryCov_9fa48("143128", "143129", "143130"), (stryMutAct_9fa48("143132") ? !nodeId && status !== String(ENDPOINT_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("143131") ? false : (stryCov_9fa48("143131", "143132"), (stryMutAct_9fa48("143133") ? nodeId : (stryCov_9fa48("143133"), !nodeId)) || (stryMutAct_9fa48("143135") ? status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("143134") ? false : (stryCov_9fa48("143134", "143135"), status !== (stryMutAct_9fa48("143136") ? String(ENDPOINT_STATUS.ACTIVE).toUpperCase() : (stryCov_9fa48("143136"), String(ENDPOINT_STATUS.ACTIVE).toLowerCase())))))) || (stryMutAct_9fa48("143138") ? transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() : stryMutAct_9fa48("143137") ? false : (stryCov_9fa48("143137", "143138"), transportType !== (stryMutAct_9fa48("143139") ? String(TRANSPORT_TYPE.WEBSOCKET).toUpperCase() : (stryCov_9fa48("143139"), String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase())))))) {
            if (stryMutAct_9fa48("143140")) {
              {}
            } else {
              stryCov_9fa48("143140");
              continue;
            }
          }
          visibleNodeEndpointNodeIds.add(nodeId);
        }
      }
      for (const row of serviceEndpointRows) {
        if (stryMutAct_9fa48("143141")) {
          {}
        } else {
          stryCov_9fa48("143141");
          const normalizedRow = normalizeServiceEndpointRow(row);
          const {
            nodeId,
            serviceId,
            healthStatus
          } = normalizedRow;
          if (stryMutAct_9fa48("143144") ? (!nodeId || serviceId !== META_SERVICE_ID.POSTGRES_WIRE) && healthStatus !== String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase() : stryMutAct_9fa48("143143") ? false : stryMutAct_9fa48("143142") ? true : (stryCov_9fa48("143142", "143143", "143144"), (stryMutAct_9fa48("143146") ? !nodeId && serviceId !== META_SERVICE_ID.POSTGRES_WIRE : stryMutAct_9fa48("143145") ? false : (stryCov_9fa48("143145", "143146"), (stryMutAct_9fa48("143147") ? nodeId : (stryCov_9fa48("143147"), !nodeId)) || (stryMutAct_9fa48("143149") ? serviceId === META_SERVICE_ID.POSTGRES_WIRE : stryMutAct_9fa48("143148") ? false : (stryCov_9fa48("143148", "143149"), serviceId !== META_SERVICE_ID.POSTGRES_WIRE)))) || (stryMutAct_9fa48("143151") ? healthStatus === String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase() : stryMutAct_9fa48("143150") ? false : (stryCov_9fa48("143150", "143151"), healthStatus !== (stryMutAct_9fa48("143152") ? String(ENDPOINT_SYNC_HEALTH.HEALTHY).toUpperCase() : (stryCov_9fa48("143152"), String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase())))))) {
            if (stryMutAct_9fa48("143153")) {
              {}
            } else {
              stryCov_9fa48("143153");
              continue;
            }
          }
          visiblePostgresWireNodeIds.add(nodeId);
        }
      }
      const missingNodeEndpointNodeIds = stryMutAct_9fa48("143154") ? requiredNodeIds : (stryCov_9fa48("143154"), requiredNodeIds.filter(stryMutAct_9fa48("143155") ? () => undefined : (stryCov_9fa48("143155"), nodeId => stryMutAct_9fa48("143156") ? visibleNodeEndpointNodeIds.has(nodeId) : (stryCov_9fa48("143156"), !visibleNodeEndpointNodeIds.has(nodeId)))));
      const missingPostgresWireNodeIds = stryMutAct_9fa48("143157") ? requiredNodeIds : (stryCov_9fa48("143157"), requiredNodeIds.filter(stryMutAct_9fa48("143158") ? () => undefined : (stryCov_9fa48("143158"), nodeId => stryMutAct_9fa48("143159") ? visiblePostgresWireNodeIds.has(nodeId) : (stryCov_9fa48("143159"), !visiblePostgresWireNodeIds.has(nodeId)))));
      const endpointReadyNodeIds = stryMutAct_9fa48("143160") ? requiredNodeIds : (stryCov_9fa48("143160"), requiredNodeIds.filter(stryMutAct_9fa48("143161") ? () => undefined : (stryCov_9fa48("143161"), nodeId => stryMutAct_9fa48("143164") ? visibleNodeEndpointNodeIds.has(nodeId) || visiblePostgresWireNodeIds.has(nodeId) : stryMutAct_9fa48("143163") ? false : stryMutAct_9fa48("143162") ? true : (stryCov_9fa48("143162", "143163", "143164"), visibleNodeEndpointNodeIds.has(nodeId) && visiblePostgresWireNodeIds.has(nodeId)))));
      return Object.freeze(stryMutAct_9fa48("143165") ? {} : (stryCov_9fa48("143165"), {
        ready: stryMutAct_9fa48("143169") ? endpointReadyNodeIds.length < requiredReadyNodeCount : stryMutAct_9fa48("143168") ? endpointReadyNodeIds.length > requiredReadyNodeCount : stryMutAct_9fa48("143167") ? false : stryMutAct_9fa48("143166") ? true : (stryCov_9fa48("143166", "143167", "143168", "143169"), endpointReadyNodeIds.length >= requiredReadyNodeCount),
        missingNodeEndpointNodeIds,
        missingPostgresWireNodeIds,
        endpointReadyNodeCount: endpointReadyNodeIds.length,
        requiredReadyNodeCount,
        endpointReadyNodeIds
      }));
    }
  }

  /**
   * Normalize one in-flight replica operation for topology diagnostics.
   * @param {Object} row
   * @return {Object}
   * @private
   */
  buildCriticalSystemInFlightReplicaOperationDetail(row) {
    if (stryMutAct_9fa48("143170")) {
      {}
    } else {
      stryCov_9fa48("143170");
      const operationId = stryMutAct_9fa48("143173") ? (row?.operation_id || row?.operationId) && null : stryMutAct_9fa48("143172") ? false : stryMutAct_9fa48("143171") ? true : (stryCov_9fa48("143171", "143172", "143173"), (stryMutAct_9fa48("143175") ? row?.operation_id && row?.operationId : stryMutAct_9fa48("143174") ? false : (stryCov_9fa48("143174", "143175"), (stryMutAct_9fa48("143176") ? row.operation_id : (stryCov_9fa48("143176"), row?.operation_id)) || (stryMutAct_9fa48("143177") ? row.operationId : (stryCov_9fa48("143177"), row?.operationId)))) || null);
      const type = stryMutAct_9fa48("143180") ? row?.type && null : stryMutAct_9fa48("143179") ? false : stryMutAct_9fa48("143178") ? true : (stryCov_9fa48("143178", "143179", "143180"), (stryMutAct_9fa48("143181") ? row.type : (stryCov_9fa48("143181"), row?.type)) || null);
      const partitionId = stryMutAct_9fa48("143184") ? (row?.partition_group_id || row?.partitionGroupId || row?.partition_id || row?.partitionId) && null : stryMutAct_9fa48("143183") ? false : stryMutAct_9fa48("143182") ? true : (stryCov_9fa48("143182", "143183", "143184"), (stryMutAct_9fa48("143186") ? (row?.partition_group_id || row?.partitionGroupId || row?.partition_id) && row?.partitionId : stryMutAct_9fa48("143185") ? false : (stryCov_9fa48("143185", "143186"), (stryMutAct_9fa48("143188") ? (row?.partition_group_id || row?.partitionGroupId) && row?.partition_id : stryMutAct_9fa48("143187") ? false : (stryCov_9fa48("143187", "143188"), (stryMutAct_9fa48("143190") ? row?.partition_group_id && row?.partitionGroupId : stryMutAct_9fa48("143189") ? false : (stryCov_9fa48("143189", "143190"), (stryMutAct_9fa48("143191") ? row.partition_group_id : (stryCov_9fa48("143191"), row?.partition_group_id)) || (stryMutAct_9fa48("143192") ? row.partitionGroupId : (stryCov_9fa48("143192"), row?.partitionGroupId)))) || (stryMutAct_9fa48("143193") ? row.partition_id : (stryCov_9fa48("143193"), row?.partition_id)))) || (stryMutAct_9fa48("143194") ? row.partitionId : (stryCov_9fa48("143194"), row?.partitionId)))) || null);
      const targetNodeId = String(stryMutAct_9fa48("143197") ? (row?.target_node_id || row?.targetNodeId) && '' : stryMutAct_9fa48("143196") ? false : stryMutAct_9fa48("143195") ? true : (stryCov_9fa48("143195", "143196", "143197"), (stryMutAct_9fa48("143199") ? row?.target_node_id && row?.targetNodeId : stryMutAct_9fa48("143198") ? false : (stryCov_9fa48("143198", "143199"), (stryMutAct_9fa48("143200") ? row.target_node_id : (stryCov_9fa48("143200"), row?.target_node_id)) || (stryMutAct_9fa48("143201") ? row.targetNodeId : (stryCov_9fa48("143201"), row?.targetNodeId)))) || (stryMutAct_9fa48("143202") ? "Stryker was here!" : (stryCov_9fa48("143202"), ''))));
      const status = stryMutAct_9fa48("143205") ? (row?.status || String(row?.status || '').toLowerCase()) && null : stryMutAct_9fa48("143204") ? false : stryMutAct_9fa48("143203") ? true : (stryCov_9fa48("143203", "143204", "143205"), (stryMutAct_9fa48("143207") ? row?.status && String(row?.status || '').toLowerCase() : stryMutAct_9fa48("143206") ? false : (stryCov_9fa48("143206", "143207"), (stryMutAct_9fa48("143208") ? row.status : (stryCov_9fa48("143208"), row?.status)) || (stryMutAct_9fa48("143209") ? String(row?.status || '').toUpperCase() : (stryCov_9fa48("143209"), String(stryMutAct_9fa48("143212") ? row?.status && '' : stryMutAct_9fa48("143211") ? false : stryMutAct_9fa48("143210") ? true : (stryCov_9fa48("143210", "143211", "143212"), (stryMutAct_9fa48("143213") ? row.status : (stryCov_9fa48("143213"), row?.status)) || (stryMutAct_9fa48("143214") ? "Stryker was here!" : (stryCov_9fa48("143214"), '')))).toLowerCase())))) || null);
      const workflowStep = stryMutAct_9fa48("143217") ? (row?.workflow_step || row?.workflowStep) && null : stryMutAct_9fa48("143216") ? false : stryMutAct_9fa48("143215") ? true : (stryCov_9fa48("143215", "143216", "143217"), (stryMutAct_9fa48("143219") ? row?.workflow_step && row?.workflowStep : stryMutAct_9fa48("143218") ? false : (stryCov_9fa48("143218", "143219"), (stryMutAct_9fa48("143220") ? row.workflow_step : (stryCov_9fa48("143220"), row?.workflow_step)) || (stryMutAct_9fa48("143221") ? row.workflowStep : (stryCov_9fa48("143221"), row?.workflowStep)))) || null);
      return Object.freeze(stryMutAct_9fa48("143222") ? {} : (stryCov_9fa48("143222"), {
        operationId,
        type,
        partitionId,
        targetNodeId,
        status,
        workflowStep
      }));
    }
  }

  /**
   * Return non-terminal replica operations that still indicate topology churn
   * for already-ACTIVE nodes.
   * @param {string[]} activeNodeIds
   * @return {{count:number,details:Object[]}}
   * @private
   */
  collectCriticalSystemInFlightReplicaOperations(activeNodeIds = stryMutAct_9fa48("143223") ? ["Stryker was here"] : (stryCov_9fa48("143223"), []), options = {}) {
    if (stryMutAct_9fa48("143224")) {
      {}
    } else {
      stryCov_9fa48("143224");
      const requiredNodeIds = new Set(stryMutAct_9fa48("143225") ? Array.isArray(activeNodeIds) ? activeNodeIds : [] : (stryCov_9fa48("143225"), (Array.isArray(activeNodeIds) ? activeNodeIds : stryMutAct_9fa48("143226") ? ["Stryker was here"] : (stryCov_9fa48("143226"), [])).filter(stryMutAct_9fa48("143227") ? () => undefined : (stryCov_9fa48("143227"), nodeId => stryMutAct_9fa48("143230") ? typeof nodeId === TYPEOF.STRING || nodeId.length > 0 : stryMutAct_9fa48("143229") ? false : stryMutAct_9fa48("143228") ? true : (stryCov_9fa48("143228", "143229", "143230"), (stryMutAct_9fa48("143232") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("143231") ? true : (stryCov_9fa48("143231", "143232"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("143235") ? nodeId.length <= 0 : stryMutAct_9fa48("143234") ? nodeId.length >= 0 : stryMutAct_9fa48("143233") ? true : (stryCov_9fa48("143233", "143234", "143235"), nodeId.length > 0)))))));
      const scopeToEntity = stryMutAct_9fa48("143238") ? options.scopeToEntity !== true : stryMutAct_9fa48("143237") ? false : stryMutAct_9fa48("143236") ? true : (stryCov_9fa48("143236", "143237", "143238"), options.scopeToEntity === (stryMutAct_9fa48("143239") ? false : (stryCov_9fa48("143239"), true)));
      if (stryMutAct_9fa48("143242") ? requiredNodeIds.size === NUM.ZERO && typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("143241") ? false : stryMutAct_9fa48("143240") ? true : (stryCov_9fa48("143240", "143241", "143242"), (stryMutAct_9fa48("143244") ? requiredNodeIds.size !== NUM.ZERO : stryMutAct_9fa48("143243") ? false : (stryCov_9fa48("143243", "143244"), requiredNodeIds.size === NUM.ZERO)) || (stryMutAct_9fa48("143246") ? typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("143245") ? false : (stryCov_9fa48("143245", "143246"), typeof (stryMutAct_9fa48("143247") ? this.systemTableCache.getAll : (stryCov_9fa48("143247"), this.systemTableCache?.getAll)) !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143248")) {
          {}
        } else {
          stryCov_9fa48("143248");
          return Object.freeze(stryMutAct_9fa48("143249") ? {} : (stryCov_9fa48("143249"), {
            count: NUM.ZERO,
            details: Object.freeze(stryMutAct_9fa48("143250") ? ["Stryker was here"] : (stryCov_9fa48("143250"), [])),
            source: null
          }));
        }
      }
      const rows = stryMutAct_9fa48("143253") ? this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) && [] : stryMutAct_9fa48("143252") ? false : stryMutAct_9fa48("143251") ? true : (stryCov_9fa48("143251", "143252", "143253"), this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || (stryMutAct_9fa48("143254") ? ["Stryker was here"] : (stryCov_9fa48("143254"), [])));
      const nowMs = Date.now();
      const details = stryMutAct_9fa48("143255") ? ["Stryker was here"] : (stryCov_9fa48("143255"), []);
      for (const row of rows) {
        if (stryMutAct_9fa48("143256")) {
          {}
        } else {
          stryCov_9fa48("143256");
          if (stryMutAct_9fa48("143259") ? false : stryMutAct_9fa48("143258") ? true : stryMutAct_9fa48("143257") ? this.isTopologySettlingInFlightOperation(row, {
            nowMs
          }) : (stryCov_9fa48("143257", "143258", "143259"), !this.isTopologySettlingInFlightOperation(row, stryMutAct_9fa48("143260") ? {} : (stryCov_9fa48("143260"), {
            nowMs
          })))) {
            if (stryMutAct_9fa48("143261")) {
              {}
            } else {
              stryCov_9fa48("143261");
              continue;
            }
          }
          if (stryMutAct_9fa48("143264") ? scopeToEntity || !this.isOperationForEntity(row) : stryMutAct_9fa48("143263") ? false : stryMutAct_9fa48("143262") ? true : (stryCov_9fa48("143262", "143263", "143264"), scopeToEntity && (stryMutAct_9fa48("143265") ? this.isOperationForEntity(row) : (stryCov_9fa48("143265"), !this.isOperationForEntity(row))))) {
            if (stryMutAct_9fa48("143266")) {
              {}
            } else {
              stryCov_9fa48("143266");
              continue;
            }
          }
          const priorityAssessment = this.getPriorityRecoveryPlanningAssessmentSync(row, stryMutAct_9fa48("143267") ? {} : (stryCov_9fa48("143267"), {
            observedAt: nowMs
          }));
          if (stryMutAct_9fa48("143270") ? priorityAssessment || !shouldPriorityRecoveryOperationBlockPlanning(priorityAssessment) : stryMutAct_9fa48("143269") ? false : stryMutAct_9fa48("143268") ? true : (stryCov_9fa48("143268", "143269", "143270"), priorityAssessment && (stryMutAct_9fa48("143271") ? shouldPriorityRecoveryOperationBlockPlanning(priorityAssessment) : (stryCov_9fa48("143271"), !shouldPriorityRecoveryOperationBlockPlanning(priorityAssessment))))) {
            if (stryMutAct_9fa48("143272")) {
              {}
            } else {
              stryCov_9fa48("143272");
              continue;
            }
          }
          const detail = this.buildCriticalSystemInFlightReplicaOperationDetail(row);
          const {
            targetNodeId
          } = detail;
          if (stryMutAct_9fa48("143275") ? !targetNodeId && !requiredNodeIds.has(targetNodeId) : stryMutAct_9fa48("143274") ? false : stryMutAct_9fa48("143273") ? true : (stryCov_9fa48("143273", "143274", "143275"), (stryMutAct_9fa48("143276") ? targetNodeId : (stryCov_9fa48("143276"), !targetNodeId)) || (stryMutAct_9fa48("143277") ? requiredNodeIds.has(targetNodeId) : (stryCov_9fa48("143277"), !requiredNodeIds.has(targetNodeId))))) {
            if (stryMutAct_9fa48("143278")) {
              {}
            } else {
              stryCov_9fa48("143278");
              continue;
            }
          }
          details.push(detail);
        }
      }
      return Object.freeze(stryMutAct_9fa48("143279") ? {} : (stryCov_9fa48("143279"), {
        count: details.length,
        details: Object.freeze(details),
        source: TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE.CACHE
      }));
    }
  }

  /**
   * Return one local readiness snapshot when critical system-partition
   * planning should wait for this leader to become serve-eligible.
   *
   * Background redistribution of seed-hosted system partitions fans out many
   * control-plane reads and writes. During join/restart convergence, a leader
   * that is not yet serve-eligible should not initiate that background work,
   * even though repair-eligible topology operations remain valid elsewhere.
   *
   * @return {Object|null}
   * @private
   */
  getCriticalSystemLocalServeReadinessBlocker() {
    if (stryMutAct_9fa48("143280")) {
      {}
    } else {
      stryCov_9fa48("143280");
      if (stryMutAct_9fa48("143283") ? (!this.isSystemPartitionEntity() || !this.controlPlaneReadinessService) && typeof this.controlPlaneReadinessService.getNodeReadinessSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("143282") ? false : stryMutAct_9fa48("143281") ? true : (stryCov_9fa48("143281", "143282", "143283"), (stryMutAct_9fa48("143285") ? !this.isSystemPartitionEntity() && !this.controlPlaneReadinessService : stryMutAct_9fa48("143284") ? false : (stryCov_9fa48("143284", "143285"), (stryMutAct_9fa48("143286") ? this.isSystemPartitionEntity() : (stryCov_9fa48("143286"), !this.isSystemPartitionEntity())) || (stryMutAct_9fa48("143287") ? this.controlPlaneReadinessService : (stryCov_9fa48("143287"), !this.controlPlaneReadinessService)))) || (stryMutAct_9fa48("143289") ? typeof this.controlPlaneReadinessService.getNodeReadinessSync === TYPEOF.FUNCTION : stryMutAct_9fa48("143288") ? false : (stryCov_9fa48("143288", "143289"), typeof this.controlPlaneReadinessService.getNodeReadinessSync !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143290")) {
          {}
        } else {
          stryCov_9fa48("143290");
          return null;
        }
      }
      if (stryMutAct_9fa48("143292") ? false : stryMutAct_9fa48("143291") ? true : (stryCov_9fa48("143291", "143292"), this.shouldBypassLocalPriorityControlPlaneStartupReadiness())) {
        if (stryMutAct_9fa48("143293")) {
          {}
        } else {
          stryCov_9fa48("143293");
          return null;
        }
      }
      const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(this.nodeId, stryMutAct_9fa48("143294") ? {} : (stryCov_9fa48("143294"), {
        allowStaleOnCacheChange: stryMutAct_9fa48("143295") ? true : (stryCov_9fa48("143295"), false)
      }));
      if (stryMutAct_9fa48("143298") ? !readiness?.dimensions && readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true : stryMutAct_9fa48("143297") ? false : stryMutAct_9fa48("143296") ? true : (stryCov_9fa48("143296", "143297", "143298"), (stryMutAct_9fa48("143299") ? readiness?.dimensions : (stryCov_9fa48("143299"), !(stryMutAct_9fa48("143300") ? readiness.dimensions : (stryCov_9fa48("143300"), readiness?.dimensions)))) || (stryMutAct_9fa48("143302") ? readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== true : stryMutAct_9fa48("143301") ? false : (stryCov_9fa48("143301", "143302"), readiness.dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === (stryMutAct_9fa48("143303") ? false : (stryCov_9fa48("143303"), true)))))) {
        if (stryMutAct_9fa48("143304")) {
          {}
        } else {
          stryCov_9fa48("143304");
          return null;
        }
      }
      return readiness;
    }
  }

  /**
   * Return one local readiness snapshot when background topology mutation
   * should wait for the local metadata publication contract to recover.
   *
   * @return {Object|null}
   * @private
   */
  getLocalControlPlaneMutationReadinessBlocker() {
    if (stryMutAct_9fa48("143305")) {
      {}
    } else {
      stryCov_9fa48("143305");
      const requiredDimensions = this.shouldBypassLocalPriorityControlPlaneStartupReadiness() ? stryMutAct_9fa48("143306") ? [] : (stryCov_9fa48("143306"), [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]) : null;
      return getLocalControlPlaneMutationReadinessBlocker(stryMutAct_9fa48("143307") ? {} : (stryCov_9fa48("143307"), {
        nodeId: this.nodeId,
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        requiredDimensions,
        requirePublishedConvergence: stryMutAct_9fa48("143308") ? this.isControlPlanePriorityPartition() : (stryCov_9fa48("143308"), !this.isControlPlanePriorityPartition())
      }));
    }
  }

  /**
   * Return the latest bootstrap readiness snapshot when available.
   *
   * @return {Object|null}
   * @private
   */
  getBootstrapReadinessSnapshot() {
    if (stryMutAct_9fa48("143309")) {
      {}
    } else {
      stryCov_9fa48("143309");
      if (stryMutAct_9fa48("143312") ? this.startupRecoveryCoordinator || typeof this.startupRecoveryCoordinator.getSnapshot === TYPEOF.FUNCTION : stryMutAct_9fa48("143311") ? false : stryMutAct_9fa48("143310") ? true : (stryCov_9fa48("143310", "143311", "143312"), this.startupRecoveryCoordinator && (stryMutAct_9fa48("143314") ? typeof this.startupRecoveryCoordinator.getSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("143313") ? true : (stryCov_9fa48("143313", "143314"), typeof this.startupRecoveryCoordinator.getSnapshot === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143315")) {
          {}
        } else {
          stryCov_9fa48("143315");
          return this.startupRecoveryCoordinator.getSnapshot();
        }
      }
      if (stryMutAct_9fa48("143318") ? false : stryMutAct_9fa48("143317") ? true : stryMutAct_9fa48("143316") ? this.bootstrapReadinessState : (stryCov_9fa48("143316", "143317", "143318"), !this.bootstrapReadinessState)) {
        if (stryMutAct_9fa48("143319")) {
          {}
        } else {
          stryCov_9fa48("143319");
          return null;
        }
      }
      return (stryMutAct_9fa48("143322") ? typeof this.bootstrapReadinessState.evaluate !== TYPEOF.FUNCTION : stryMutAct_9fa48("143321") ? false : stryMutAct_9fa48("143320") ? true : (stryCov_9fa48("143320", "143321", "143322"), typeof this.bootstrapReadinessState.evaluate === TYPEOF.FUNCTION)) ? this.bootstrapReadinessState.evaluate() : (stryMutAct_9fa48("143325") ? typeof this.bootstrapReadinessState.getSnapshot !== TYPEOF.FUNCTION : stryMutAct_9fa48("143324") ? false : stryMutAct_9fa48("143323") ? true : (stryCov_9fa48("143323", "143324", "143325"), typeof this.bootstrapReadinessState.getSnapshot === TYPEOF.FUNCTION)) ? this.bootstrapReadinessState.getSnapshot() : null;
    }
  }

  /**
   * Check whether lifecycle has opened background work for this entity.
   *
   * @param {Object|null} snapshot - Bootstrap readiness snapshot.
   * @return {boolean}
   * @private
   */
  isBootstrapReadinessOpenForBackgroundWork(snapshot) {
    if (stryMutAct_9fa48("143326")) {
      {}
    } else {
      stryCov_9fa48("143326");
      const startupAuthority = this.getStartupAuthoritySnapshot();
      if (stryMutAct_9fa48("143329") ? this.startupRecoveryCoordinator || typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION : stryMutAct_9fa48("143328") ? false : stryMutAct_9fa48("143327") ? true : (stryCov_9fa48("143327", "143328", "143329"), this.startupRecoveryCoordinator && (stryMutAct_9fa48("143331") ? typeof this.startupRecoveryCoordinator.evaluate !== TYPEOF.FUNCTION : stryMutAct_9fa48("143330") ? true : (stryCov_9fa48("143330", "143331"), typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143332")) {
          {}
        } else {
          stryCov_9fa48("143332");
          return stryMutAct_9fa48("143335") ? this.startupRecoveryCoordinator.evaluate({
            partitionId: this.entityId,
            snapshot,
            startupAuthority
          }).backgroundWorkReady !== true : stryMutAct_9fa48("143334") ? false : stryMutAct_9fa48("143333") ? true : (stryCov_9fa48("143333", "143334", "143335"), this.startupRecoveryCoordinator.evaluate(stryMutAct_9fa48("143336") ? {} : (stryCov_9fa48("143336"), {
            partitionId: this.entityId,
            snapshot,
            startupAuthority
          })).backgroundWorkReady === (stryMutAct_9fa48("143337") ? false : (stryCov_9fa48("143337"), true)));
        }
      }
      return isBackgroundWorkLifecycleReadySnapshot(snapshot, stryMutAct_9fa48("143338") ? {} : (stryCov_9fa48("143338"), {
        partitionId: this.entityId
      }));
    }
  }

  /**
   * Priority control-plane partitions may recover through the local seed's
   * startup quarantine once lifecycle has opened metadata publication, even
   * before the seed becomes serve-eligible again.
   *
   * @return {boolean}
   * @private
   */
  shouldBypassLocalPriorityControlPlaneStartupReadiness() {
    if (stryMutAct_9fa48("143339")) {
      {}
    } else {
      stryCov_9fa48("143339");
      const startupAuthority = this.getStartupAuthoritySnapshot();
      if (stryMutAct_9fa48("143342") ? this.startupRecoveryCoordinator || typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION : stryMutAct_9fa48("143341") ? false : stryMutAct_9fa48("143340") ? true : (stryCov_9fa48("143340", "143341", "143342"), this.startupRecoveryCoordinator && (stryMutAct_9fa48("143344") ? typeof this.startupRecoveryCoordinator.evaluate !== TYPEOF.FUNCTION : stryMutAct_9fa48("143343") ? true : (stryCov_9fa48("143343", "143344"), typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143345")) {
          {}
        } else {
          stryCov_9fa48("143345");
          return stryMutAct_9fa48("143348") ? this.startupRecoveryCoordinator.evaluate({
            partitionId: this.entityId,
            startupAuthority
          }).shouldBypassLocalPriorityControlPlaneStartupReadiness !== true : stryMutAct_9fa48("143347") ? false : stryMutAct_9fa48("143346") ? true : (stryCov_9fa48("143346", "143347", "143348"), this.startupRecoveryCoordinator.evaluate(stryMutAct_9fa48("143349") ? {} : (stryCov_9fa48("143349"), {
            partitionId: this.entityId,
            startupAuthority
          })).shouldBypassLocalPriorityControlPlaneStartupReadiness === (stryMutAct_9fa48("143350") ? false : (stryCov_9fa48("143350"), true)));
        }
      }
      if (stryMutAct_9fa48("143353") ? false : stryMutAct_9fa48("143352") ? true : stryMutAct_9fa48("143351") ? this.isControlPlanePriorityPartition() : (stryCov_9fa48("143351", "143352", "143353"), !this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("143354")) {
          {}
        } else {
          stryCov_9fa48("143354");
          return stryMutAct_9fa48("143355") ? true : (stryCov_9fa48("143355"), false);
        }
      }
      const snapshot = this.getBootstrapReadinessSnapshot();
      if (stryMutAct_9fa48("143358") ? false : stryMutAct_9fa48("143357") ? true : stryMutAct_9fa48("143356") ? this.isBootstrapReadinessOpenForBackgroundWork(snapshot) : (stryCov_9fa48("143356", "143357", "143358"), !this.isBootstrapReadinessOpenForBackgroundWork(snapshot))) {
        if (stryMutAct_9fa48("143359")) {
          {}
        } else {
          stryCov_9fa48("143359");
          return stryMutAct_9fa48("143360") ? true : (stryCov_9fa48("143360"), false);
        }
      }
      return stryMutAct_9fa48("143361") ? snapshot?.ready === true && snapshot?.phase === LIFECYCLE_PHASE.TRAFFIC_READY : (stryCov_9fa48("143361"), !(stryMutAct_9fa48("143364") ? snapshot?.ready === true || snapshot?.phase === LIFECYCLE_PHASE.TRAFFIC_READY : stryMutAct_9fa48("143363") ? false : stryMutAct_9fa48("143362") ? true : (stryCov_9fa48("143362", "143363", "143364"), (stryMutAct_9fa48("143366") ? snapshot?.ready !== true : stryMutAct_9fa48("143365") ? true : (stryCov_9fa48("143365", "143366"), (stryMutAct_9fa48("143367") ? snapshot.ready : (stryCov_9fa48("143367"), snapshot?.ready)) === (stryMutAct_9fa48("143368") ? false : (stryCov_9fa48("143368"), true)))) && (stryMutAct_9fa48("143370") ? snapshot?.phase !== LIFECYCLE_PHASE.TRAFFIC_READY : stryMutAct_9fa48("143369") ? true : (stryCov_9fa48("143369", "143370"), (stryMutAct_9fa48("143371") ? snapshot.phase : (stryCov_9fa48("143371"), snapshot?.phase)) === LIFECYCLE_PHASE.TRAFFIC_READY)))));
    }
  }
  getStartupAuthoritySnapshot() {
    if (stryMutAct_9fa48("143372")) {
      {}
    } else {
      stryCov_9fa48("143372");
      const readinessService = this.controlPlaneReadinessService;
      if (stryMutAct_9fa48("143375") ? !readinessService && typeof readinessService.getStartupAuthoritySnapshotSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("143374") ? false : stryMutAct_9fa48("143373") ? true : (stryCov_9fa48("143373", "143374", "143375"), (stryMutAct_9fa48("143376") ? readinessService : (stryCov_9fa48("143376"), !readinessService)) || (stryMutAct_9fa48("143378") ? typeof readinessService.getStartupAuthoritySnapshotSync === TYPEOF.FUNCTION : stryMutAct_9fa48("143377") ? false : (stryCov_9fa48("143377", "143378"), typeof readinessService.getStartupAuthoritySnapshotSync !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143379")) {
          {}
        } else {
          stryCov_9fa48("143379");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("143380")) {
          {}
        } else {
          stryCov_9fa48("143380");
          return readinessService.getStartupAuthoritySnapshotSync(this.nodeId, Date.now());
        }
      } catch (_error) {
        if (stryMutAct_9fa48("143381")) {
          {}
        } else {
          stryCov_9fa48("143381");
          return null;
        }
      }
    }
  }

  /**
   * Return one bootstrap lifecycle snapshot when critical system-partition
   * planning should wait for the lifecycle owner to open background work.
   *
   * `BootstrapReadinessState` is the canonical owner for startup/join/traffic
   * lifecycle. Most system redistribution should wait for `TRAFFIC_READY`,
   * but the priority control-plane partitions are allowed once metadata
   * publication is open because they are required to complete restart/join
   * convergence under load.
   *
   * @return {Object|null}
   * @private
   */
  getCriticalSystemTrafficReadinessBlocker() {
    if (stryMutAct_9fa48("143382")) {
      {}
    } else {
      stryCov_9fa48("143382");
      if (stryMutAct_9fa48("143385") ? !this.isSystemPartitionEntity() && !this.bootstrapReadinessState : stryMutAct_9fa48("143384") ? false : stryMutAct_9fa48("143383") ? true : (stryCov_9fa48("143383", "143384", "143385"), (stryMutAct_9fa48("143386") ? this.isSystemPartitionEntity() : (stryCov_9fa48("143386"), !this.isSystemPartitionEntity())) || (stryMutAct_9fa48("143387") ? this.bootstrapReadinessState : (stryCov_9fa48("143387"), !this.bootstrapReadinessState)))) {
        if (stryMutAct_9fa48("143388")) {
          {}
        } else {
          stryCov_9fa48("143388");
          return null;
        }
      }
      const snapshot = this.getBootstrapReadinessSnapshot();
      if (stryMutAct_9fa48("143391") ? !snapshot && typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("143390") ? false : stryMutAct_9fa48("143389") ? true : (stryCov_9fa48("143389", "143390", "143391"), (stryMutAct_9fa48("143392") ? snapshot : (stryCov_9fa48("143392"), !snapshot)) || (stryMutAct_9fa48("143394") ? typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("143393") ? false : (stryCov_9fa48("143393", "143394"), typeof snapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("143395")) {
          {}
        } else {
          stryCov_9fa48("143395");
          return null;
        }
      }
      if (stryMutAct_9fa48("143397") ? false : stryMutAct_9fa48("143396") ? true : (stryCov_9fa48("143396", "143397"), this.isBootstrapReadinessOpenForBackgroundWork(snapshot))) {
        if (stryMutAct_9fa48("143398")) {
          {}
        } else {
          stryCov_9fa48("143398");
          return null;
        }
      }
      return snapshot;
    }
  }

  /**
   * Check if a node is ready to receive replica operations.
   * @param {string} nodeId - Node ID.
   * @return {Promise<boolean>} True if ready.
   */
  async isNodeReady(nodeId) {
    if (stryMutAct_9fa48("143399")) {
      {}
    } else {
      stryCov_9fa48("143399");
      const readinessDecisionDimension = this.resolveNodeReadinessDecisionDimension();
      const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("143400") ? {} : (stryCov_9fa48("143400"), {
        decisionDimension: readinessDecisionDimension
      }));
      if (stryMutAct_9fa48("143403") ? false : stryMutAct_9fa48("143402") ? true : stryMutAct_9fa48("143401") ? this.isReadinessDimensionSatisfied(readiness, readinessDecisionDimension) : (stryCov_9fa48("143401", "143402", "143403"), !this.isReadinessDimensionSatisfied(readiness, readinessDecisionDimension))) {
        if (stryMutAct_9fa48("143404")) {
          {}
        } else {
          stryCov_9fa48("143404");
          return stryMutAct_9fa48("143405") ? true : (stryCov_9fa48("143405"), false);
        }
      }

      // Delegate transport-level checks (connection, outbound queue, and
      // optional ping) to the canonical readiness policy owner.
      return isNodeReadyWithTransport(stryMutAct_9fa48("143406") ? {} : (stryCov_9fa48("143406"), {
        nodeId,
        systemTableCache: this.systemTableCache,
        messageRouter: this.messageRouter,
        requireOutboundQueue: stryMutAct_9fa48("143407") ? false : (stryCov_9fa48("143407"), true),
        enableReadinessPing: this.enableReadinessPing,
        readinessPingTimeoutMs: this.readinessPingTimeoutMs
      }));
    }
  }

  /**
   * Thin adapter: check transport-level reachability for a node.
   * Delegates to node-readiness-policy isNodeReadyWithTransport with
   * rebalancer-specific defaults (outbound queue required, no ping).
   * Kept for API compatibility; the main readiness path (isNodeReady)
   * calls the policy owner directly.
   * @param {string} nodeId - Node ID.
   * @return {boolean} True when transport is ready.
   */
  isTransportReady(nodeId) {
    if (stryMutAct_9fa48("143408")) {
      {}
    } else {
      stryCov_9fa48("143408");
      const router = this.messageRouter;
      if (stryMutAct_9fa48("143411") ? !router && typeof router.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("143410") ? false : stryMutAct_9fa48("143409") ? true : (stryCov_9fa48("143409", "143410", "143411"), (stryMutAct_9fa48("143412") ? router : (stryCov_9fa48("143412"), !router)) || (stryMutAct_9fa48("143414") ? typeof router.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("143413") ? false : (stryCov_9fa48("143413", "143414"), typeof router.getConnectionState !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143415")) {
          {}
        } else {
          stryCov_9fa48("143415");
          return stryMutAct_9fa48("143416") ? true : (stryCov_9fa48("143416"), false);
        }
      }
      if (stryMutAct_9fa48("143419") ? router.getConnectionState(nodeId) === STATE.CONNECTED : stryMutAct_9fa48("143418") ? false : stryMutAct_9fa48("143417") ? true : (stryCov_9fa48("143417", "143418", "143419"), router.getConnectionState(nodeId) !== STATE.CONNECTED)) {
        if (stryMutAct_9fa48("143420")) {
          {}
        } else {
          stryCov_9fa48("143420");
          return stryMutAct_9fa48("143421") ? true : (stryCov_9fa48("143421"), false);
        }
      }
      if (stryMutAct_9fa48("143424") ? typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION || !router.isOutboundQueueAvailable(nodeId) : stryMutAct_9fa48("143423") ? false : stryMutAct_9fa48("143422") ? true : (stryCov_9fa48("143422", "143423", "143424"), (stryMutAct_9fa48("143426") ? typeof router.isOutboundQueueAvailable !== TYPEOF.FUNCTION : stryMutAct_9fa48("143425") ? true : (stryCov_9fa48("143425", "143426"), typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION)) && (stryMutAct_9fa48("143427") ? router.isOutboundQueueAvailable(nodeId) : (stryCov_9fa48("143427"), !router.isOutboundQueueAvailable(nodeId))))) {
        if (stryMutAct_9fa48("143428")) {
          {}
        } else {
          stryCov_9fa48("143428");
          return stryMutAct_9fa48("143429") ? true : (stryCov_9fa48("143429"), false);
        }
      }
      return stryMutAct_9fa48("143430") ? false : (stryCov_9fa48("143430"), true);
    }
  }

  /**
   * Thin adapter: perform an optional readiness ping via the policy
   * owner. Composes isNodeReadyWithTransport with ping enabled and
   * rebalancer-specific timeout.
   * Kept for API compatibility; the main readiness path (isNodeReady)
   * calls the policy owner directly.
   * @param {string} nodeId - Node ID.
   * @return {Promise<boolean>} True when ping succeeds.
   */
  async checkReadinessPing(nodeId) {
    if (stryMutAct_9fa48("143431")) {
      {}
    } else {
      stryCov_9fa48("143431");
      const router = this.messageRouter;
      if (stryMutAct_9fa48("143434") ? !router && typeof router.pingNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("143433") ? false : stryMutAct_9fa48("143432") ? true : (stryCov_9fa48("143432", "143433", "143434"), (stryMutAct_9fa48("143435") ? router : (stryCov_9fa48("143435"), !router)) || (stryMutAct_9fa48("143437") ? typeof router.pingNode === TYPEOF.FUNCTION : stryMutAct_9fa48("143436") ? false : (stryCov_9fa48("143436", "143437"), typeof router.pingNode !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143438")) {
          {}
        } else {
          stryCov_9fa48("143438");
          return stryMutAct_9fa48("143439") ? false : (stryCov_9fa48("143439"), true);
        }
      }
      const pingTimeout = Number.isFinite(this.readinessPingTimeoutMs) ? this.readinessPingTimeoutMs : NUM.ZERO;
      return router.pingNode(nodeId, pingTimeout);
    }
  }

  /**
   * Determine the specific readiness skip reason for a node.
   * Checks each readiness dimension in order and returns the first
   * failing reason, preserving granularity for diagnostics
   * (Requirement 5.3, Design D6.3).
   *
   * @param {string} nodeId - Node ID.
   * @return {Promise<string|null>} Skip detail from
   *   READINESS_SKIP_DETAIL, or null when node is ready.
   */
  async getNodeReadinessSkipReason(nodeId) {
    if (stryMutAct_9fa48("143440")) {
      {}
    } else {
      stryCov_9fa48("143440");
      if (stryMutAct_9fa48("143442") ? false : stryMutAct_9fa48("143441") ? true : (stryCov_9fa48("143441", "143442"), await this.isNodeReady(nodeId))) {
        if (stryMutAct_9fa48("143443")) {
          {}
        } else {
          stryCov_9fa48("143443");
          return null;
        }
      }
      const readinessDecisionDimension = this.resolveNodeReadinessDecisionDimension();
      const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("143444") ? {} : (stryCov_9fa48("143444"), {
        decisionDimension: readinessDecisionDimension
      }));
      if (stryMutAct_9fa48("143447") ? false : stryMutAct_9fa48("143446") ? true : stryMutAct_9fa48("143445") ? this.isReadinessDimensionSatisfied(readiness, readinessDecisionDimension) : (stryCov_9fa48("143445", "143446", "143447"), !this.isReadinessDimensionSatisfied(readiness, readinessDecisionDimension))) {
        if (stryMutAct_9fa48("143448")) {
          {}
        } else {
          stryCov_9fa48("143448");
          // Determine whether the rejection is lease or status.
          const nodeRow = this.systemTableCache.get(TABLES.NODES, nodeId);
          if (stryMutAct_9fa48("143451") ? false : stryMutAct_9fa48("143450") ? true : stryMutAct_9fa48("143449") ? nodeRow : (stryCov_9fa48("143449", "143450", "143451"), !nodeRow)) {
            if (stryMutAct_9fa48("143452")) {
              {}
            } else {
              stryCov_9fa48("143452");
              return READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE;
            }
          }
          if (stryMutAct_9fa48("143455") ? nodeRow.status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("143454") ? false : stryMutAct_9fa48("143453") ? true : (stryCov_9fa48("143453", "143454", "143455"), nodeRow.status !== SERVICE_STATUS.ACTIVE)) {
            if (stryMutAct_9fa48("143456")) {
              {}
            } else {
              stryCov_9fa48("143456");
              return READINESS_SKIP_DETAIL.STATUS_NOT_ACTIVE;
            }
          }
          const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
          if (stryMutAct_9fa48("143459") ? !Number.isFinite(leaseExpiry) && leaseExpiry <= Date.now() : stryMutAct_9fa48("143458") ? false : stryMutAct_9fa48("143457") ? true : (stryCov_9fa48("143457", "143458", "143459"), (stryMutAct_9fa48("143460") ? Number.isFinite(leaseExpiry) : (stryCov_9fa48("143460"), !Number.isFinite(leaseExpiry))) || (stryMutAct_9fa48("143463") ? leaseExpiry > Date.now() : stryMutAct_9fa48("143462") ? leaseExpiry < Date.now() : stryMutAct_9fa48("143461") ? false : (stryCov_9fa48("143461", "143462", "143463"), leaseExpiry <= Date.now())))) {
            if (stryMutAct_9fa48("143464")) {
              {}
            } else {
              stryCov_9fa48("143464");
              return READINESS_SKIP_DETAIL.LEASE_EXPIRED;
            }
          }
          return READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE;
        }
      }

      // Record-level checks passed; check transport dimensions.
      const router = this.messageRouter;
      if (stryMutAct_9fa48("143467") ? !router && typeof router.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("143466") ? false : stryMutAct_9fa48("143465") ? true : (stryCov_9fa48("143465", "143466", "143467"), (stryMutAct_9fa48("143468") ? router : (stryCov_9fa48("143468"), !router)) || (stryMutAct_9fa48("143470") ? typeof router.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("143469") ? false : (stryCov_9fa48("143469", "143470"), typeof router.getConnectionState !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143471")) {
          {}
        } else {
          stryCov_9fa48("143471");
          return READINESS_SKIP_DETAIL.CONNECTION_DOWN;
        }
      }
      if (stryMutAct_9fa48("143474") ? router.getConnectionState(nodeId) === STATE.CONNECTED : stryMutAct_9fa48("143473") ? false : stryMutAct_9fa48("143472") ? true : (stryCov_9fa48("143472", "143473", "143474"), router.getConnectionState(nodeId) !== STATE.CONNECTED)) {
        if (stryMutAct_9fa48("143475")) {
          {}
        } else {
          stryCov_9fa48("143475");
          return READINESS_SKIP_DETAIL.CONNECTION_DOWN;
        }
      }
      if (stryMutAct_9fa48("143478") ? typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION || !router.isOutboundQueueAvailable(nodeId) : stryMutAct_9fa48("143477") ? false : stryMutAct_9fa48("143476") ? true : (stryCov_9fa48("143476", "143477", "143478"), (stryMutAct_9fa48("143480") ? typeof router.isOutboundQueueAvailable !== TYPEOF.FUNCTION : stryMutAct_9fa48("143479") ? true : (stryCov_9fa48("143479", "143480"), typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION)) && (stryMutAct_9fa48("143481") ? router.isOutboundQueueAvailable(nodeId) : (stryCov_9fa48("143481"), !router.isOutboundQueueAvailable(nodeId))))) {
        if (stryMutAct_9fa48("143482")) {
          {}
        } else {
          stryCov_9fa48("143482");
          return READINESS_SKIP_DETAIL.OUTBOUND_QUEUE_UNAVAILABLE;
        }
      }
      if (stryMutAct_9fa48("143485") ? this.enableReadinessPing || typeof router.pingNode === TYPEOF.FUNCTION : stryMutAct_9fa48("143484") ? false : stryMutAct_9fa48("143483") ? true : (stryCov_9fa48("143483", "143484", "143485"), this.enableReadinessPing && (stryMutAct_9fa48("143487") ? typeof router.pingNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("143486") ? true : (stryCov_9fa48("143486", "143487"), typeof router.pingNode === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143488")) {
          {}
        } else {
          stryCov_9fa48("143488");
          const pingTimeout = Number.isFinite(this.readinessPingTimeoutMs) ? this.readinessPingTimeoutMs : NUM.ZERO;
          const ok = await router.pingNode(nodeId, pingTimeout);
          if (stryMutAct_9fa48("143491") ? false : stryMutAct_9fa48("143490") ? true : stryMutAct_9fa48("143489") ? ok : (stryCov_9fa48("143489", "143490", "143491"), !ok)) {
            if (stryMutAct_9fa48("143492")) {
              {}
            } else {
              stryCov_9fa48("143492");
              return READINESS_SKIP_DETAIL.PING_FAILED;
            }
          }
        }
      }
      return READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE;
    }
  }

  /**
   * Get current replicas for this entity.
   * @readModel REBALANCE_CURRENT_REPLICAS — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>} Array of replica objects.
   */
  getCurrentReplicas() {
    if (stryMutAct_9fa48("143493")) {
      {}
    } else {
      stryCov_9fa48("143493");
      if (stryMutAct_9fa48("143496") ? this.entityType !== EntityType.MESSAGE_GROUP : stryMutAct_9fa48("143495") ? false : stryMutAct_9fa48("143494") ? true : (stryCov_9fa48("143494", "143495", "143496"), this.entityType === EntityType.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("143497")) {
          {}
        } else {
          stryCov_9fa48("143497");
          return stryMutAct_9fa48("143498") ? this.systemTableCache : (stryCov_9fa48("143498"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, service => {
            if (stryMutAct_9fa48("143499")) {
              {}
            } else {
              stryCov_9fa48("143499");
              const normalizedService = normalizeServiceRow(service);
              return stryMutAct_9fa48("143502") ? normalizedService.groupId === this.entityId || normalizedService.serviceType === EntityType.MESSAGE_GROUP : stryMutAct_9fa48("143501") ? false : stryMutAct_9fa48("143500") ? true : (stryCov_9fa48("143500", "143501", "143502"), (stryMutAct_9fa48("143504") ? normalizedService.groupId !== this.entityId : stryMutAct_9fa48("143503") ? true : (stryCov_9fa48("143503", "143504"), normalizedService.groupId === this.entityId)) && (stryMutAct_9fa48("143506") ? normalizedService.serviceType !== EntityType.MESSAGE_GROUP : stryMutAct_9fa48("143505") ? true : (stryCov_9fa48("143505", "143506"), normalizedService.serviceType === EntityType.MESSAGE_GROUP)));
            }
          }));
        }
      }

      // For runtime services, match by service_type and service_id
      // that equals or is prefixed by the entity (definition) ID.
      if (stryMutAct_9fa48("143509") ? this.entityType !== EntityType.RUNTIME_SERVICE : stryMutAct_9fa48("143508") ? false : stryMutAct_9fa48("143507") ? true : (stryCov_9fa48("143507", "143508", "143509"), this.entityType === EntityType.RUNTIME_SERVICE)) {
        if (stryMutAct_9fa48("143510")) {
          {}
        } else {
          stryCov_9fa48("143510");
          return stryMutAct_9fa48("143511") ? this.systemTableCache : (stryCov_9fa48("143511"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, service => {
            if (stryMutAct_9fa48("143512")) {
              {}
            } else {
              stryCov_9fa48("143512");
              const normalizedService = normalizeServiceRow(service);
              return stryMutAct_9fa48("143515") ? normalizedService.serviceType === EntityType.RUNTIME_SERVICE || normalizedService.serviceId === this.entityId : stryMutAct_9fa48("143514") ? false : stryMutAct_9fa48("143513") ? true : (stryCov_9fa48("143513", "143514", "143515"), (stryMutAct_9fa48("143517") ? normalizedService.serviceType !== EntityType.RUNTIME_SERVICE : stryMutAct_9fa48("143516") ? true : (stryCov_9fa48("143516", "143517"), normalizedService.serviceType === EntityType.RUNTIME_SERVICE)) && (stryMutAct_9fa48("143519") ? normalizedService.serviceId !== this.entityId : stryMutAct_9fa48("143518") ? true : (stryCov_9fa48("143518", "143519"), normalizedService.serviceId === this.entityId)));
            }
          }));
        }
      }

      // For partitions, get services with matching partition_id
      return stryMutAct_9fa48("143520") ? this.systemTableCache : (stryCov_9fa48("143520"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, service => {
        if (stryMutAct_9fa48("143521")) {
          {}
        } else {
          stryCov_9fa48("143521");
          const normalizedService = normalizeServiceRow(service);
          return stryMutAct_9fa48("143524") ? normalizedService.partitionId === this.entityId || normalizedService.serviceType === EntityType.PARTITION : stryMutAct_9fa48("143523") ? false : stryMutAct_9fa48("143522") ? true : (stryCov_9fa48("143522", "143523", "143524"), (stryMutAct_9fa48("143526") ? normalizedService.partitionId !== this.entityId : stryMutAct_9fa48("143525") ? true : (stryCov_9fa48("143525", "143526"), normalizedService.partitionId === this.entityId)) && (stryMutAct_9fa48("143528") ? normalizedService.serviceType !== EntityType.PARTITION : stryMutAct_9fa48("143527") ? true : (stryCov_9fa48("143527", "143528"), normalizedService.serviceType === EntityType.PARTITION)));
        }
      }));
    }
  }

  /**
   * Check if an operation row targets this rebalancer entity.
   * @param {Object} operation - replica_operations row.
   * @return {boolean} True when operation matches this entity.
   * @private
   */
  isOperationForEntity(operation) {
    if (stryMutAct_9fa48("143529")) {
      {}
    } else {
      stryCov_9fa48("143529");
      const entityType = stryMutAct_9fa48("143532") ? (operation?.entity_type || operation?.entityType) && EntityType.PARTITION : stryMutAct_9fa48("143531") ? false : stryMutAct_9fa48("143530") ? true : (stryCov_9fa48("143530", "143531", "143532"), (stryMutAct_9fa48("143534") ? operation?.entity_type && operation?.entityType : stryMutAct_9fa48("143533") ? false : (stryCov_9fa48("143533", "143534"), (stryMutAct_9fa48("143535") ? operation.entity_type : (stryCov_9fa48("143535"), operation?.entity_type)) || (stryMutAct_9fa48("143536") ? operation.entityType : (stryCov_9fa48("143536"), operation?.entityType)))) || EntityType.PARTITION);
      const entityId = stryMutAct_9fa48("143539") ? (operation?.entity_id || operation?.entityId || operation?.partition_group_id || operation?.partitionGroupId || operation?.partition_id || operation?.partitionId) && null : stryMutAct_9fa48("143538") ? false : stryMutAct_9fa48("143537") ? true : (stryCov_9fa48("143537", "143538", "143539"), (stryMutAct_9fa48("143541") ? (operation?.entity_id || operation?.entityId || operation?.partition_group_id || operation?.partitionGroupId || operation?.partition_id) && operation?.partitionId : stryMutAct_9fa48("143540") ? false : (stryCov_9fa48("143540", "143541"), (stryMutAct_9fa48("143543") ? (operation?.entity_id || operation?.entityId || operation?.partition_group_id || operation?.partitionGroupId) && operation?.partition_id : stryMutAct_9fa48("143542") ? false : (stryCov_9fa48("143542", "143543"), (stryMutAct_9fa48("143545") ? (operation?.entity_id || operation?.entityId || operation?.partition_group_id) && operation?.partitionGroupId : stryMutAct_9fa48("143544") ? false : (stryCov_9fa48("143544", "143545"), (stryMutAct_9fa48("143547") ? (operation?.entity_id || operation?.entityId) && operation?.partition_group_id : stryMutAct_9fa48("143546") ? false : (stryCov_9fa48("143546", "143547"), (stryMutAct_9fa48("143549") ? operation?.entity_id && operation?.entityId : stryMutAct_9fa48("143548") ? false : (stryCov_9fa48("143548", "143549"), (stryMutAct_9fa48("143550") ? operation.entity_id : (stryCov_9fa48("143550"), operation?.entity_id)) || (stryMutAct_9fa48("143551") ? operation.entityId : (stryCov_9fa48("143551"), operation?.entityId)))) || (stryMutAct_9fa48("143552") ? operation.partition_group_id : (stryCov_9fa48("143552"), operation?.partition_group_id)))) || (stryMutAct_9fa48("143553") ? operation.partitionGroupId : (stryCov_9fa48("143553"), operation?.partitionGroupId)))) || (stryMutAct_9fa48("143554") ? operation.partition_id : (stryCov_9fa48("143554"), operation?.partition_id)))) || (stryMutAct_9fa48("143555") ? operation.partitionId : (stryCov_9fa48("143555"), operation?.partitionId)))) || null);
      return stryMutAct_9fa48("143558") ? entityType === this.entityType || entityId === this.entityId : stryMutAct_9fa48("143557") ? false : stryMutAct_9fa48("143556") ? true : (stryCov_9fa48("143556", "143557", "143558"), (stryMutAct_9fa48("143560") ? entityType !== this.entityType : stryMutAct_9fa48("143559") ? true : (stryCov_9fa48("143559", "143560"), entityType === this.entityType)) && (stryMutAct_9fa48("143562") ? entityId !== this.entityId : stryMutAct_9fa48("143561") ? true : (stryCov_9fa48("143561", "143562"), entityId === this.entityId)));
    }
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isTrackedInFlightOperation(operation) {
    if (stryMutAct_9fa48("143563")) {
      {}
    } else {
      stryCov_9fa48("143563");
      const operationType = stryMutAct_9fa48("143566") ? (operation?.type || operation?.operation_type || operation?.operationType) && null : stryMutAct_9fa48("143565") ? false : stryMutAct_9fa48("143564") ? true : (stryCov_9fa48("143564", "143565", "143566"), (stryMutAct_9fa48("143568") ? (operation?.type || operation?.operation_type) && operation?.operationType : stryMutAct_9fa48("143567") ? false : (stryCov_9fa48("143567", "143568"), (stryMutAct_9fa48("143570") ? operation?.type && operation?.operation_type : stryMutAct_9fa48("143569") ? false : (stryCov_9fa48("143569", "143570"), (stryMutAct_9fa48("143571") ? operation.type : (stryCov_9fa48("143571"), operation?.type)) || (stryMutAct_9fa48("143572") ? operation.operation_type : (stryCov_9fa48("143572"), operation?.operation_type)))) || (stryMutAct_9fa48("143573") ? operation.operationType : (stryCov_9fa48("143573"), operation?.operationType)))) || null);
      if (stryMutAct_9fa48("143576") ? operationType || !isCoordinatorOwnedOperationType(operationType) : stryMutAct_9fa48("143575") ? false : stryMutAct_9fa48("143574") ? true : (stryCov_9fa48("143574", "143575", "143576"), operationType && (stryMutAct_9fa48("143577") ? isCoordinatorOwnedOperationType(operationType) : (stryCov_9fa48("143577"), !isCoordinatorOwnedOperationType(operationType))))) {
        if (stryMutAct_9fa48("143578")) {
          {}
        } else {
          stryCov_9fa48("143578");
          return stryMutAct_9fa48("143579") ? true : (stryCov_9fa48("143579"), false);
        }
      }
      const status = stryMutAct_9fa48("143580") ? String(operation?.status || '').toUpperCase() : (stryCov_9fa48("143580"), String(stryMutAct_9fa48("143583") ? operation?.status && '' : stryMutAct_9fa48("143582") ? false : stryMutAct_9fa48("143581") ? true : (stryCov_9fa48("143581", "143582", "143583"), (stryMutAct_9fa48("143584") ? operation.status : (stryCov_9fa48("143584"), operation?.status)) || (stryMutAct_9fa48("143585") ? "Stryker was here!" : (stryCov_9fa48("143585"), '')))).toLowerCase());
      if (stryMutAct_9fa48("143587") ? false : stryMutAct_9fa48("143586") ? true : (stryCov_9fa48("143586", "143587"), TERMINAL_STATUSES.includes(status))) {
        if (stryMutAct_9fa48("143588")) {
          {}
        } else {
          stryCov_9fa48("143588");
          return stryMutAct_9fa48("143589") ? true : (stryCov_9fa48("143589"), false);
        }
      }
      const workflowStep = stryMutAct_9fa48("143590") ? (operation?.workflowStep ?? operation?.workflow_step) && null : (stryCov_9fa48("143590"), (stryMutAct_9fa48("143591") ? operation?.workflowStep && operation?.workflow_step : (stryCov_9fa48("143591"), (stryMutAct_9fa48("143592") ? operation.workflowStep : (stryCov_9fa48("143592"), operation?.workflowStep)) ?? (stryMutAct_9fa48("143593") ? operation.workflow_step : (stryCov_9fa48("143593"), operation?.workflow_step)))) ?? null);
      if (stryMutAct_9fa48("143596") ? typeof operationType === TYPEOF.STRING && typeof workflowStep === TYPEOF.STRING || workflowStep.length > NUM.ZERO : stryMutAct_9fa48("143595") ? false : stryMutAct_9fa48("143594") ? true : (stryCov_9fa48("143594", "143595", "143596"), (stryMutAct_9fa48("143598") ? typeof operationType === TYPEOF.STRING || typeof workflowStep === TYPEOF.STRING : stryMutAct_9fa48("143597") ? true : (stryCov_9fa48("143597", "143598"), (stryMutAct_9fa48("143600") ? typeof operationType !== TYPEOF.STRING : stryMutAct_9fa48("143599") ? true : (stryCov_9fa48("143599", "143600"), typeof operationType === TYPEOF.STRING)) && (stryMutAct_9fa48("143602") ? typeof workflowStep !== TYPEOF.STRING : stryMutAct_9fa48("143601") ? true : (stryCov_9fa48("143601", "143602"), typeof workflowStep === TYPEOF.STRING)))) && (stryMutAct_9fa48("143605") ? workflowStep.length <= NUM.ZERO : stryMutAct_9fa48("143604") ? workflowStep.length >= NUM.ZERO : stryMutAct_9fa48("143603") ? true : (stryCov_9fa48("143603", "143604", "143605"), workflowStep.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("143606")) {
          {}
        } else {
          stryCov_9fa48("143606");
          if (stryMutAct_9fa48("143608") ? false : stryMutAct_9fa48("143607") ? true : (stryCov_9fa48("143607", "143608"), isTerminalStep(operationType, workflowStep))) {
            if (stryMutAct_9fa48("143609")) {
              {}
            } else {
              stryCov_9fa48("143609");
              return stryMutAct_9fa48("143610") ? true : (stryCov_9fa48("143610"), false);
            }
          }
          if (stryMutAct_9fa48("143612") ? false : stryMutAct_9fa48("143611") ? true : (stryCov_9fa48("143611", "143612"), isValidWorkflowStep(operationType, workflowStep))) {
            if (stryMutAct_9fa48("143613")) {
              {}
            } else {
              stryCov_9fa48("143613");
              return stryMutAct_9fa48("143614") ? false : (stryCov_9fa48("143614"), true);
            }
          }
        }
      }
      return stryMutAct_9fa48("143615") ? false : (stryCov_9fa48("143615"), true);
    }
  }

  /**
   * @param {Object} operation
   * @param {Object} options
   * @return {boolean}
   * @private
   */
  isTopologySettlingInFlightOperation(operation, options = {}) {
    if (stryMutAct_9fa48("143616")) {
      {}
    } else {
      stryCov_9fa48("143616");
      const nowMs = Number.isFinite(options.nowMs) ? Math.floor(options.nowMs) : Date.now();
      const normalizedOperation = normalizeReplicaOperationRecord(operation, stryMutAct_9fa48("143617") ? {} : (stryCov_9fa48("143617"), {
        nowMs
      }));
      if (stryMutAct_9fa48("143620") ? false : stryMutAct_9fa48("143619") ? true : stryMutAct_9fa48("143618") ? isReplicaOperationInFlight(normalizedOperation) : (stryCov_9fa48("143618", "143619", "143620"), !isReplicaOperationInFlight(normalizedOperation))) {
        if (stryMutAct_9fa48("143621")) {
          {}
        } else {
          stryCov_9fa48("143621");
          return stryMutAct_9fa48("143622") ? true : (stryCov_9fa48("143622"), false);
        }
      }
      if (stryMutAct_9fa48("143625") ? false : stryMutAct_9fa48("143624") ? true : stryMutAct_9fa48("143623") ? this.isTopologyBlockingInFlightOperation(normalizedOperation) : (stryCov_9fa48("143623", "143624", "143625"), !this.isTopologyBlockingInFlightOperation(normalizedOperation))) {
        if (stryMutAct_9fa48("143626")) {
          {}
        } else {
          stryCov_9fa48("143626");
          return stryMutAct_9fa48("143627") ? true : (stryCov_9fa48("143627"), false);
        }
      }
      return stryMutAct_9fa48("143628") ? isReplicaOperationStale(normalizedOperation, {
        nowMs
      }) : (stryCov_9fa48("143628"), !isReplicaOperationStale(normalizedOperation, stryMutAct_9fa48("143629") ? {} : (stryCov_9fa48("143629"), {
        nowMs
      })));
    }
  }

  /**
   * Get in-flight replica operations for this entity.
   * @readModel REBALANCE_IN_FLIGHT_OPERATIONS —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>} Array of replica_operations rows in-flight.
   */
  getInFlightOperations() {
    if (stryMutAct_9fa48("143630")) {
      {}
    } else {
      stryCov_9fa48("143630");
      return stryMutAct_9fa48("143631") ? this.systemTableCache : (stryCov_9fa48("143631"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operation => {
        if (stryMutAct_9fa48("143632")) {
          {}
        } else {
          stryCov_9fa48("143632");
          if (stryMutAct_9fa48("143635") ? false : stryMutAct_9fa48("143634") ? true : stryMutAct_9fa48("143633") ? this.isTrackedInFlightOperation(operation) : (stryCov_9fa48("143633", "143634", "143635"), !this.isTrackedInFlightOperation(operation))) {
            if (stryMutAct_9fa48("143636")) {
              {}
            } else {
              stryCov_9fa48("143636");
              return stryMutAct_9fa48("143637") ? true : (stryCov_9fa48("143637"), false);
            }
          }
          return this.isOperationForEntity(operation);
        }
      }));
    }
  }

  /**
   * @param {Object} operation
   * @return {string}
   * @private
   */
  getNormalizedOperationType(operation) {
    if (stryMutAct_9fa48("143638")) {
      {}
    } else {
      stryCov_9fa48("143638");
      return stryMutAct_9fa48("143639") ? String(operation?.type || operation?.operation_type || operation?.operationType || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING).toLowerCase() : (stryCov_9fa48("143639"), String(stryMutAct_9fa48("143642") ? (operation?.type || operation?.operation_type || operation?.operationType) && UNIFIED_REBALANCER_LITERAL.EMPTY_STRING : stryMutAct_9fa48("143641") ? false : stryMutAct_9fa48("143640") ? true : (stryCov_9fa48("143640", "143641", "143642"), (stryMutAct_9fa48("143644") ? (operation?.type || operation?.operation_type) && operation?.operationType : stryMutAct_9fa48("143643") ? false : (stryCov_9fa48("143643", "143644"), (stryMutAct_9fa48("143646") ? operation?.type && operation?.operation_type : stryMutAct_9fa48("143645") ? false : (stryCov_9fa48("143645", "143646"), (stryMutAct_9fa48("143647") ? operation.type : (stryCov_9fa48("143647"), operation?.type)) || (stryMutAct_9fa48("143648") ? operation.operation_type : (stryCov_9fa48("143648"), operation?.operation_type)))) || (stryMutAct_9fa48("143649") ? operation.operationType : (stryCov_9fa48("143649"), operation?.operationType)))) || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING)).toUpperCase());
    }
  }

  /**
   * @param {Object} operation
   * @return {string}
   * @private
   */
  getNormalizedOperationWorkflowStep(operation) {
    if (stryMutAct_9fa48("143650")) {
      {}
    } else {
      stryCov_9fa48("143650");
      return stryMutAct_9fa48("143651") ? String(operation?.workflowStep ?? operation?.workflow_step ?? UNIFIED_REBALANCER_LITERAL.EMPTY_STRING).toLowerCase() : (stryCov_9fa48("143651"), String(stryMutAct_9fa48("143652") ? (operation?.workflowStep ?? operation?.workflow_step) && UNIFIED_REBALANCER_LITERAL.EMPTY_STRING : (stryCov_9fa48("143652"), (stryMutAct_9fa48("143653") ? operation?.workflowStep && operation?.workflow_step : (stryCov_9fa48("143653"), (stryMutAct_9fa48("143654") ? operation.workflowStep : (stryCov_9fa48("143654"), operation?.workflowStep)) ?? (stryMutAct_9fa48("143655") ? operation.workflow_step : (stryCov_9fa48("143655"), operation?.workflow_step)))) ?? UNIFIED_REBALANCER_LITERAL.EMPTY_STRING)).toUpperCase());
    }
  }

  /**
   * REPLACE operations in ACTIVE/STOPPING are source-removal phase work:
   * add-side topology has already converged and these rows must not suppress
   * new add-like planning for other targets.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isReplaceRemoveDispatchPhaseOperation(operation) {
    if (stryMutAct_9fa48("143656")) {
      {}
    } else {
      stryCov_9fa48("143656");
      return isReplaceRemoveDispatchPhase(operation);
    }
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isTopologyBlockingInFlightOperation(operation) {
    if (stryMutAct_9fa48("143657")) {
      {}
    } else {
      stryCov_9fa48("143657");
      return stryMutAct_9fa48("143658") ? this.isReplaceRemoveDispatchPhaseOperation(operation) : (stryCov_9fa48("143658"), !this.isReplaceRemoveDispatchPhaseOperation(operation));
    }
  }

  /**
   * Return in-flight operations that still represent topology-shaping work.
   * REPLACE source-removal phase rows are excluded to avoid planner deadlock.
   *
   * @return {Array<Object>}
   */
  getTopologyBlockingInFlightOperations() {
    if (stryMutAct_9fa48("143659")) {
      {}
    } else {
      stryCov_9fa48("143659");
      return stryMutAct_9fa48("143660") ? this.getInFlightOperations() : (stryCov_9fa48("143660"), this.getInFlightOperations().filter(stryMutAct_9fa48("143661") ? () => undefined : (stryCov_9fa48("143661"), operation => this.isTopologyBlockingInFlightOperation(operation))));
    }
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isAddLikeInFlightOperation(operation) {
    if (stryMutAct_9fa48("143662")) {
      {}
    } else {
      stryCov_9fa48("143662");
      const operationType = this.getNormalizedOperationType(operation);
      if (stryMutAct_9fa48("143665") ? operationType !== OperationType.ADD : stryMutAct_9fa48("143664") ? false : stryMutAct_9fa48("143663") ? true : (stryCov_9fa48("143663", "143664", "143665"), operationType === OperationType.ADD)) {
        if (stryMutAct_9fa48("143666")) {
          {}
        } else {
          stryCov_9fa48("143666");
          return stryMutAct_9fa48("143667") ? false : (stryCov_9fa48("143667"), true);
        }
      }
      if (stryMutAct_9fa48("143670") ? operationType === OperationType.REPLACE : stryMutAct_9fa48("143669") ? false : stryMutAct_9fa48("143668") ? true : (stryCov_9fa48("143668", "143669", "143670"), operationType !== OperationType.REPLACE)) {
        if (stryMutAct_9fa48("143671")) {
          {}
        } else {
          stryCov_9fa48("143671");
          return stryMutAct_9fa48("143672") ? true : (stryCov_9fa48("143672"), false);
        }
      }
      return stryMutAct_9fa48("143673") ? this.isReplaceRemoveDispatchPhaseOperation(operation) : (stryCov_9fa48("143673"), !this.isReplaceRemoveDispatchPhaseOperation(operation));
    }
  }

  /**
   * Resolve pressure and delivery options for authoritative budget reads.
   * Startup-critical and critical system partitions must keep these reads on
   * the critical path so transport pressure does not strand control-plane
   * spread behind background gating queries.
   *
   * @return {Object} Gateway query options.
   */
  getBudgetQueryOptions() {
    if (stryMutAct_9fa48("143674")) {
      {}
    } else {
      stryCov_9fa48("143674");
      const criticalQuery = stryMutAct_9fa48("143677") ? this.isControlPlanePriorityPartition() && this.isCriticalSystemPartition() : stryMutAct_9fa48("143676") ? false : stryMutAct_9fa48("143675") ? true : (stryCov_9fa48("143675", "143676", "143677"), this.isControlPlanePriorityPartition() || this.isCriticalSystemPartition());
      return stryMutAct_9fa48("143678") ? {} : (stryCov_9fa48("143678"), {
        controlPlaneOperationKind: UNIFIED_REBALANCER_LITERAL.READ,
        workClass: criticalQuery ? PRESSURE_WORK_CLASS.CRITICAL : PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: stryMutAct_9fa48("143681") ? criticalQuery === true : stryMutAct_9fa48("143680") ? false : stryMutAct_9fa48("143679") ? true : (stryCov_9fa48("143679", "143680", "143681"), criticalQuery !== (stryMutAct_9fa48("143682") ? false : (stryCov_9fa48("143682"), true))),
        deliveryPriority: criticalQuery ? UNIFIED_REBALANCER_LITERAL.CRITICAL : UNIFIED_REBALANCER_LITERAL.BACKGROUND
      });
    }
  }

  /**
     * Query the configured rebalance budget from authoritative config.
     * Returns the constructor-provided default when the config row
     * is absent or unparseable — this is a default, not a mixed read model.
     *
     * @readModel REBALANCE_CONFIGURED_BUDGET — READ_MODEL_SOURCE.AUTHORITATIVE_SQL
     * @return {Promise<number>} Configured rebalance budget.
     */
  async getConfiguredRebalanceBudget() {
    if (stryMutAct_9fa48("143683")) {
      {}
    } else {
      stryCov_9fa48("143683");
      const result = await this.controlPlaneSystemTableGateway.executeQuery(SQL_BUDGET.SELECT_REBALANCE_BUDGET, stryMutAct_9fa48("143684") ? [] : (stryCov_9fa48("143684"), [REBALANCER_CONFIG_KEY.REBALANCE_BUDGET]), stryMutAct_9fa48("143685") ? {} : (stryCov_9fa48("143685"), {
        controlPlaneTableName: SYSTEM_TABLE_NAME.CONFIG,
        ...this.getBudgetQueryOptions()
      }));
      if (stryMutAct_9fa48("143688") ? (!result.success || !result.rows) && result.rows.length === UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143687") ? false : stryMutAct_9fa48("143686") ? true : (stryCov_9fa48("143686", "143687", "143688"), (stryMutAct_9fa48("143690") ? !result.success && !result.rows : stryMutAct_9fa48("143689") ? false : (stryCov_9fa48("143689", "143690"), (stryMutAct_9fa48("143691") ? result.success : (stryCov_9fa48("143691"), !result.success)) || (stryMutAct_9fa48("143692") ? result.rows : (stryCov_9fa48("143692"), !result.rows)))) || (stryMutAct_9fa48("143694") ? result.rows.length !== UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143693") ? false : (stryCov_9fa48("143693", "143694"), result.rows.length === UNIFIED_REBALANCER_LITERAL.ZERO)))) {
        if (stryMutAct_9fa48("143695")) {
          {}
        } else {
          stryCov_9fa48("143695");
          return this.rebalanceBudget;
        }
      }
      const parsed = Number(result.rows[0].config_value);
      return (stryMutAct_9fa48("143698") ? Number.isFinite(parsed) || parsed > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143697") ? false : stryMutAct_9fa48("143696") ? true : (stryCov_9fa48("143696", "143697", "143698"), Number.isFinite(parsed) && (stryMutAct_9fa48("143701") ? parsed <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143700") ? parsed >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143699") ? true : (stryCov_9fa48("143699", "143700", "143701"), parsed > UNIFIED_REBALANCER_LITERAL.ZERO)))) ? parsed : this.rebalanceBudget;
    }
  }

  /**
     * Query the global in-flight operation count via authoritative SQL.
     *
     * @readModel REBALANCE_GLOBAL_BUDGET — READ_MODEL_SOURCE.AUTHORITATIVE_SQL
     * @return {Promise<number>} In-flight operation count.
     */
  async getGlobalInFlightOperationCount() {
    if (stryMutAct_9fa48("143702")) {
      {}
    } else {
      stryCov_9fa48("143702");
      const result = await this.controlPlaneSystemTableGateway.executeQuery(SQL_BUDGET.SELECT_IN_FLIGHT_COUNT, stryMutAct_9fa48("143703") ? ["Stryker was here"] : (stryCov_9fa48("143703"), []), stryMutAct_9fa48("143704") ? {} : (stryCov_9fa48("143704"), {
        controlPlaneTableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        ...this.getBudgetQueryOptions()
      }));
      if (stryMutAct_9fa48("143707") ? (!result.success || !result.rows) && result.rows.length === UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143706") ? false : stryMutAct_9fa48("143705") ? true : (stryCov_9fa48("143705", "143706", "143707"), (stryMutAct_9fa48("143709") ? !result.success && !result.rows : stryMutAct_9fa48("143708") ? false : (stryCov_9fa48("143708", "143709"), (stryMutAct_9fa48("143710") ? result.success : (stryCov_9fa48("143710"), !result.success)) || (stryMutAct_9fa48("143711") ? result.rows : (stryCov_9fa48("143711"), !result.rows)))) || (stryMutAct_9fa48("143713") ? result.rows.length !== UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143712") ? false : (stryCov_9fa48("143712", "143713"), result.rows.length === UNIFIED_REBALANCER_LITERAL.ZERO)))) {
        if (stryMutAct_9fa48("143714")) {
          {}
        } else {
          stryCov_9fa48("143714");
          return UNIFIED_REBALANCER_LITERAL.ZERO;
        }
      }
      const parsed = Number(result.rows[0].total_count);
      return (stryMutAct_9fa48("143717") ? Number.isFinite(parsed) || parsed >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143716") ? false : stryMutAct_9fa48("143715") ? true : (stryCov_9fa48("143715", "143716", "143717"), Number.isFinite(parsed) && (stryMutAct_9fa48("143720") ? parsed < UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143719") ? parsed > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143718") ? true : (stryCov_9fa48("143718", "143719", "143720"), parsed >= UNIFIED_REBALANCER_LITERAL.ZERO)))) ? parsed : UNIFIED_REBALANCER_LITERAL.ZERO;
    }
  }

  /**
   * Return true when one move set contains add-like work that can advance
   * priority control-plane spread.
   * @param {Array<Object>} moves
   * @return {boolean}
   * @private
   */
  hasPriorityBudgetBypassCandidateMove(moves = stryMutAct_9fa48("143721") ? ["Stryker was here"] : (stryCov_9fa48("143721"), [])) {
    if (stryMutAct_9fa48("143722")) {
      {}
    } else {
      stryCov_9fa48("143722");
      if (stryMutAct_9fa48("143725") ? !Array.isArray(moves) && moves.length === NUM.ZERO : stryMutAct_9fa48("143724") ? false : stryMutAct_9fa48("143723") ? true : (stryCov_9fa48("143723", "143724", "143725"), (stryMutAct_9fa48("143726") ? Array.isArray(moves) : (stryCov_9fa48("143726"), !Array.isArray(moves))) || (stryMutAct_9fa48("143728") ? moves.length !== NUM.ZERO : stryMutAct_9fa48("143727") ? false : (stryCov_9fa48("143727", "143728"), moves.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("143729")) {
          {}
        } else {
          stryCov_9fa48("143729");
          return stryMutAct_9fa48("143730") ? true : (stryCov_9fa48("143730"), false);
        }
      }
      return stryMutAct_9fa48("143731") ? moves.every(move => move?.type === MoveType.ADD || move?.type === MoveType.REPLACE) : (stryCov_9fa48("143731"), moves.some(stryMutAct_9fa48("143732") ? () => undefined : (stryCov_9fa48("143732"), move => stryMutAct_9fa48("143735") ? move?.type === MoveType.ADD && move?.type === MoveType.REPLACE : stryMutAct_9fa48("143734") ? false : stryMutAct_9fa48("143733") ? true : (stryCov_9fa48("143733", "143734", "143735"), (stryMutAct_9fa48("143737") ? move?.type !== MoveType.ADD : stryMutAct_9fa48("143736") ? false : (stryCov_9fa48("143736", "143737"), (stryMutAct_9fa48("143738") ? move.type : (stryCov_9fa48("143738"), move?.type)) === MoveType.ADD)) || (stryMutAct_9fa48("143740") ? move?.type !== MoveType.REPLACE : stryMutAct_9fa48("143739") ? false : (stryCov_9fa48("143739", "143740"), (stryMutAct_9fa48("143741") ? move.type : (stryCov_9fa48("143741"), move?.type)) === MoveType.REPLACE))))));
    }
  }

  /**
   * Priority control-plane spread must not deadlock behind unrelated in-flight
   * operations that saturate the global move budget. Use the coordinator's
   * dedicated priority add lane to decide whether one recovery move may still
   * proceed.
   *
   * @param {Array<Object>} moves
   * @return {Promise<boolean>}
   * @private
   */
  async canBypassGlobalBudgetForPriorityRecovery(moves = stryMutAct_9fa48("143742") ? ["Stryker was here"] : (stryCov_9fa48("143742"), [])) {
    if (stryMutAct_9fa48("143743")) {
      {}
    } else {
      stryCov_9fa48("143743");
      if (stryMutAct_9fa48("143746") ? false : stryMutAct_9fa48("143745") ? true : stryMutAct_9fa48("143744") ? this.isControlPlanePriorityPartition() : (stryCov_9fa48("143744", "143745", "143746"), !this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("143747")) {
          {}
        } else {
          stryCov_9fa48("143747");
          return stryMutAct_9fa48("143748") ? true : (stryCov_9fa48("143748"), false);
        }
      }
      if (stryMutAct_9fa48("143751") ? false : stryMutAct_9fa48("143750") ? true : stryMutAct_9fa48("143749") ? this.hasPriorityBudgetBypassCandidateMove(moves) : (stryCov_9fa48("143749", "143750", "143751"), !this.hasPriorityBudgetBypassCandidateMove(moves))) {
        if (stryMutAct_9fa48("143752")) {
          {}
        } else {
          stryCov_9fa48("143752");
          return stryMutAct_9fa48("143753") ? true : (stryCov_9fa48("143753"), false);
        }
      }
      if (stryMutAct_9fa48("143756") ? !this.rebalanceCoordinator && typeof this.rebalanceCoordinator.canStartPriorityAddOperation !== TYPEOF.FUNCTION : stryMutAct_9fa48("143755") ? false : stryMutAct_9fa48("143754") ? true : (stryCov_9fa48("143754", "143755", "143756"), (stryMutAct_9fa48("143757") ? this.rebalanceCoordinator : (stryCov_9fa48("143757"), !this.rebalanceCoordinator)) || (stryMutAct_9fa48("143759") ? typeof this.rebalanceCoordinator.canStartPriorityAddOperation === TYPEOF.FUNCTION : stryMutAct_9fa48("143758") ? false : (stryCov_9fa48("143758", "143759"), typeof this.rebalanceCoordinator.canStartPriorityAddOperation !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("143760")) {
          {}
        } else {
          stryCov_9fa48("143760");
          return stryMutAct_9fa48("143761") ? true : (stryCov_9fa48("143761"), false);
        }
      }
      const allowed = await this.rebalanceCoordinator.canStartPriorityAddOperation(stryMutAct_9fa48("143762") ? {} : (stryCov_9fa48("143762"), {
        ...PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
        partitionId: this.entityId
      }));
      return stryMutAct_9fa48("143765") ? allowed !== true : stryMutAct_9fa48("143764") ? false : stryMutAct_9fa48("143763") ? true : (stryCov_9fa48("143763", "143764", "143765"), allowed === (stryMutAct_9fa48("143766") ? false : (stryCov_9fa48("143766"), true)));
    }
  }

  /**
   * Check whether this rebalancer targets a critical system partition.
   * @return {boolean} True when entity is a critical system partition.
   * @private
   */
  isCriticalSystemPartition() {
    if (stryMutAct_9fa48("143767")) {
      {}
    } else {
      stryCov_9fa48("143767");
      return this.isSystemPartitionEntity();
    }
  }

  /**
   * Get healthy replicas (excluding failed or removed).
   * @param {Array<Object>} replicas - All replicas.
   * @return {Array<Object>} Healthy replicas only.
   */
  getHealthyReplicas(replicas) {
    if (stryMutAct_9fa48("143768")) {
      {}
    } else {
      stryCov_9fa48("143768");
      const activeReplicas = stryMutAct_9fa48("143769") ? replicas : (stryCov_9fa48("143769"), replicas.filter(replica => {
        if (stryMutAct_9fa48("143770")) {
          {}
        } else {
          stryCov_9fa48("143770");
          const status = stryMutAct_9fa48("143773") ? replica.status && ReplicaStatus.ACTIVE : stryMutAct_9fa48("143772") ? false : stryMutAct_9fa48("143771") ? true : (stryCov_9fa48("143771", "143772", "143773"), replica.status || ReplicaStatus.ACTIVE);
          return stryMutAct_9fa48("143776") ? status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("143775") ? false : stryMutAct_9fa48("143774") ? true : (stryCov_9fa48("143774", "143775", "143776"), status === ReplicaStatus.ACTIVE);
        }
      }));

      // Align critical-partition health semantics with coordinator safety checks:
      // consider only routable non-learner replicas on ready nodes as healthy.
      if (stryMutAct_9fa48("143779") ? false : stryMutAct_9fa48("143778") ? true : stryMutAct_9fa48("143777") ? this.isCriticalSystemPartition() : (stryCov_9fa48("143777", "143778", "143779"), !this.isCriticalSystemPartition())) {
        if (stryMutAct_9fa48("143780")) {
          {}
        } else {
          stryCov_9fa48("143780");
          return activeReplicas;
        }
      }
      const readyNodeIds = new Set(this.getAvailableNodes().map(stryMutAct_9fa48("143781") ? () => undefined : (stryCov_9fa48("143781"), node => node.node_id)));
      return stryMutAct_9fa48("143782") ? activeReplicas : (stryCov_9fa48("143782"), activeReplicas.filter(replica => {
        if (stryMutAct_9fa48("143783")) {
          {}
        } else {
          stryCov_9fa48("143783");
          if (stryMutAct_9fa48("143786") ? !replica?.node_id && !replica?.address : stryMutAct_9fa48("143785") ? false : stryMutAct_9fa48("143784") ? true : (stryCov_9fa48("143784", "143785", "143786"), (stryMutAct_9fa48("143787") ? replica?.node_id : (stryCov_9fa48("143787"), !(stryMutAct_9fa48("143788") ? replica.node_id : (stryCov_9fa48("143788"), replica?.node_id)))) || (stryMutAct_9fa48("143789") ? replica?.address : (stryCov_9fa48("143789"), !(stryMutAct_9fa48("143790") ? replica.address : (stryCov_9fa48("143790"), replica?.address)))))) {
            if (stryMutAct_9fa48("143791")) {
              {}
            } else {
              stryCov_9fa48("143791");
              return stryMutAct_9fa48("143792") ? true : (stryCov_9fa48("143792"), false);
            }
          }
          const role = (stryMutAct_9fa48("143795") ? typeof replica.raft_role !== 'string' : stryMutAct_9fa48("143794") ? false : stryMutAct_9fa48("143793") ? true : (stryCov_9fa48("143793", "143794", "143795"), typeof replica.raft_role === (stryMutAct_9fa48("143796") ? "" : (stryCov_9fa48("143796"), 'string')))) ? stryMutAct_9fa48("143797") ? replica.raft_role.toUpperCase() : (stryCov_9fa48("143797"), replica.raft_role.toLowerCase()) : null;
          if (stryMutAct_9fa48("143800") ? !role && role === RAFT_ROLE.LEARNER : stryMutAct_9fa48("143799") ? false : stryMutAct_9fa48("143798") ? true : (stryCov_9fa48("143798", "143799", "143800"), (stryMutAct_9fa48("143801") ? role : (stryCov_9fa48("143801"), !role)) || (stryMutAct_9fa48("143803") ? role !== RAFT_ROLE.LEARNER : stryMutAct_9fa48("143802") ? false : (stryCov_9fa48("143802", "143803"), role === RAFT_ROLE.LEARNER)))) {
            if (stryMutAct_9fa48("143804")) {
              {}
            } else {
              stryCov_9fa48("143804");
              return stryMutAct_9fa48("143805") ? true : (stryCov_9fa48("143805"), false);
            }
          }
          return readyNodeIds.has(replica.node_id);
        }
      }));
    }
  }

  /**
   * Calculate target state based on policy.
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @return {Object} Target state with replica count and placement.
   */
  async calculateTargetState(currentReplicas, policy) {
    if (stryMutAct_9fa48("143806")) {
      {}
    } else {
      stryCov_9fa48("143806");
      return this.movePlanner.calculateTargetState(currentReplicas, policy);
    }
  }

  /**
   * Calculate optimal placement for message groups.
   * Ensures every node has at least one local replica.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Message group policy.
   * @return {Object} Target placement state.
   */
  calculateMessageGroupPlacement(nodes, targetCount, policy) {
    if (stryMutAct_9fa48("143807")) {
      {}
    } else {
      stryCov_9fa48("143807");
      return this.movePlanner.calculateMessageGroupPlacement(nodes, targetCount, policy);
    }
  }

  /**
   * Calculate optimal placement for partitions.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Table policy.
   * @return {Object} Target placement state.
   */
  calculatePartitionPlacement(nodes, targetCount, policy) {
    if (stryMutAct_9fa48("143808")) {
      {}
    } else {
      stryCov_9fa48("143808");
      return this.movePlanner.calculatePartitionPlacement(nodes, targetCount, policy);
    }
  }

  /**
   * Sort nodes by current load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Available nodes.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesByLoad(nodes) {
    if (stryMutAct_9fa48("143809")) {
      {}
    } else {
      stryCov_9fa48("143809");
      return this.movePlanner.sortNodesByLoad(nodes);
    }
  }

  /**
   * Sort nodes by suitability based on policy constraints.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {Object} policy - Policy with placement constraints.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesBySuitability(nodes, policy) {
    if (stryMutAct_9fa48("143810")) {
      {}
    } else {
      stryCov_9fa48("143810");
      return this.movePlanner.sortNodesBySuitability(nodes, policy);
    }
  }

  /**
   * Calculate node load score.
   * @param {Object} node - Node object.
   * @return {number} Load score (0-300, lower is better).
   */
  calculateNodeLoad(node) {
    if (stryMutAct_9fa48("143811")) {
      {}
    } else {
      stryCov_9fa48("143811");
      return this.movePlanner.calculateNodeLoad(node);
    }
  }

  /**
   * Calculate moves needed to reach target state.
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} targetState - Target state.
   * @return {Array<Object>} Array of move operations.
   */
  calculateMoves(currentReplicas, targetState) {
    if (stryMutAct_9fa48("143812")) {
      {}
    } else {
      stryCov_9fa48("143812");
      return this.movePlanner.calculateMoves(currentReplicas, targetState);
    }
  }

  /**
   * Build one skipped move result.
   * @param {string} reason
   * @param {Object|null} move
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildSkippedMoveResult(reason, move, extra = {}) {
    if (stryMutAct_9fa48("143813")) {
      {}
    } else {
      stryCov_9fa48("143813");
      return stryMutAct_9fa48("143814") ? {} : (stryCov_9fa48("143814"), {
        success: stryMutAct_9fa48("143815") ? true : (stryCov_9fa48("143815"), false),
        skipped: stryMutAct_9fa48("143816") ? false : (stryCov_9fa48("143816"), true),
        reason,
        operation: stryMutAct_9fa48("143817") ? move.type : (stryCov_9fa48("143817"), move?.type),
        nodeId: stryMutAct_9fa48("143818") ? move.nodeId : (stryCov_9fa48("143818"), move?.nodeId),
        replicaId: stryMutAct_9fa48("143819") ? move.replicaId : (stryCov_9fa48("143819"), move?.replicaId),
        ...extra
      });
    }
  }

  /**
   * Build one rebalancer result.
   * @param {boolean} success
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildRebalanceResult(success, extra = {}) {
    if (stryMutAct_9fa48("143820")) {
      {}
    } else {
      stryCov_9fa48("143820");
      return stryMutAct_9fa48("143821") ? {} : (stryCov_9fa48("143821"), {
        success,
        ...extra
      });
    }
  }

  /**
   * Resolve one operation type for a move.
   * @param {string} moveType
   * @return {string}
   * @private
   */
  resolveCoordinatorOperationType(moveType) {
    if (stryMutAct_9fa48("143822")) {
      {}
    } else {
      stryCov_9fa48("143822");
      if (stryMutAct_9fa48("143825") ? moveType !== MoveType.ADD : stryMutAct_9fa48("143824") ? false : stryMutAct_9fa48("143823") ? true : (stryCov_9fa48("143823", "143824", "143825"), moveType === MoveType.ADD)) {
        if (stryMutAct_9fa48("143826")) {
          {}
        } else {
          stryCov_9fa48("143826");
          return OperationType.ADD;
        }
      }
      if (stryMutAct_9fa48("143829") ? moveType !== MoveType.REMOVE : stryMutAct_9fa48("143828") ? false : stryMutAct_9fa48("143827") ? true : (stryCov_9fa48("143827", "143828", "143829"), moveType === MoveType.REMOVE)) {
        if (stryMutAct_9fa48("143830")) {
          {}
        } else {
          stryCov_9fa48("143830");
          return OperationType.REMOVE;
        }
      }
      if (stryMutAct_9fa48("143833") ? moveType !== MoveType.REPLACE : stryMutAct_9fa48("143832") ? false : stryMutAct_9fa48("143831") ? true : (stryCov_9fa48("143831", "143832", "143833"), moveType === MoveType.REPLACE)) {
        if (stryMutAct_9fa48("143834")) {
          {}
        } else {
          stryCov_9fa48("143834");
          return OperationType.REPLACE;
        }
      }
      throw new Error(stryMutAct_9fa48("143835") ? `` : (stryCov_9fa48("143835"), `Unsupported move type: ${moveType}`));
    }
  }

  /**
   * Execute a single move operation via the coordinator.
   * Requirements: 2.5
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   */
  async executeMove(move) {
    if (stryMutAct_9fa48("143836")) {
      {}
    } else {
      stryCov_9fa48("143836");
      if (stryMutAct_9fa48("143838") ? false : stryMutAct_9fa48("143837") ? true : (stryCov_9fa48("143837", "143838"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("143839")) {
          {}
        } else {
          stryCov_9fa48("143839");
          return this.buildSkippedMoveResult(REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS, move);
        }
      }
      this.logger.info(REBALANCER_LOG_MSG.EXECUTE_MOVE, stryMutAct_9fa48("143840") ? {} : (stryCov_9fa48("143840"), {
        entityId: this.entityId,
        entityType: this.entityType,
        moveType: move.type,
        nodeId: move.nodeId,
        reason: move.reason,
        usingCoordinator: stryMutAct_9fa48("143841") ? !this.rebalanceCoordinator : (stryCov_9fa48("143841"), !(stryMutAct_9fa48("143842") ? this.rebalanceCoordinator : (stryCov_9fa48("143842"), !this.rebalanceCoordinator)))
      }));
      try {
        if (stryMutAct_9fa48("143843")) {
          {}
        } else {
          stryCov_9fa48("143843");
          if (stryMutAct_9fa48("143846") ? move.nodeId : stryMutAct_9fa48("143845") ? false : stryMutAct_9fa48("143844") ? true : (stryCov_9fa48("143844", "143845", "143846"), move?.nodeId)) {
            if (stryMutAct_9fa48("143847")) {
              {}
            } else {
              stryCov_9fa48("143847");
              const skipDetail = await this.getNodeReadinessSkipReason(move.nodeId);
              if (stryMutAct_9fa48("143850") ? skipDetail === null : stryMutAct_9fa48("143849") ? false : stryMutAct_9fa48("143848") ? true : (stryCov_9fa48("143848", "143849", "143850"), skipDetail !== null)) {
                if (stryMutAct_9fa48("143851")) {
                  {}
                } else {
                  stryCov_9fa48("143851");
                  this.logger.debug(REBALANCER_LOG_MSG.SKIP_UNREADY_NODE, stryMutAct_9fa48("143852") ? {} : (stryCov_9fa48("143852"), {
                    entityId: this.entityId,
                    nodeId: move.nodeId,
                    moveType: move.type,
                    skipDetail
                  }));
                  return this.buildSkippedMoveResult(REBALANCER_SKIP_REASON.NODE_NOT_READY, move, stryMutAct_9fa48("143853") ? {} : (stryCov_9fa48("143853"), {
                    skipDetail
                  }));
                }
              }
            }
          }
          if (stryMutAct_9fa48("143856") ? false : stryMutAct_9fa48("143855") ? true : stryMutAct_9fa48("143854") ? this.rebalanceCoordinator : (stryCov_9fa48("143854", "143855", "143856"), !this.rebalanceCoordinator)) {
            if (stryMutAct_9fa48("143857")) {
              {}
            } else {
              stryCov_9fa48("143857");
              throw new Error(REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED);
            }
          }
          const outcome = await this.executeMoveViaCoordinator(move);
          if (stryMutAct_9fa48("143860") ? outcome?.skipped !== true : stryMutAct_9fa48("143859") ? false : stryMutAct_9fa48("143858") ? true : (stryCov_9fa48("143858", "143859", "143860"), (stryMutAct_9fa48("143861") ? outcome.skipped : (stryCov_9fa48("143861"), outcome?.skipped)) === (stryMutAct_9fa48("143862") ? false : (stryCov_9fa48("143862"), true)))) {
            if (stryMutAct_9fa48("143863")) {
              {}
            } else {
              stryCov_9fa48("143863");
              const admissionBlockingReasonCodes = Array.isArray(stryMutAct_9fa48("143865") ? outcome.admission?.blockingReasons : stryMutAct_9fa48("143864") ? outcome?.admission.blockingReasons : (stryCov_9fa48("143864", "143865"), outcome?.admission?.blockingReasons)) ? stryMutAct_9fa48("143866") ? outcome.admission.blockingReasons.map(reason => String(reason?.code || reason?.reason || reason || '').trim()) : (stryCov_9fa48("143866"), outcome.admission.blockingReasons.map(stryMutAct_9fa48("143867") ? () => undefined : (stryCov_9fa48("143867"), reason => stryMutAct_9fa48("143868") ? String(reason?.code || reason?.reason || reason || '') : (stryCov_9fa48("143868"), String(stryMutAct_9fa48("143871") ? (reason?.code || reason?.reason || reason) && '' : stryMutAct_9fa48("143870") ? false : stryMutAct_9fa48("143869") ? true : (stryCov_9fa48("143869", "143870", "143871"), (stryMutAct_9fa48("143873") ? (reason?.code || reason?.reason) && reason : stryMutAct_9fa48("143872") ? false : (stryCov_9fa48("143872", "143873"), (stryMutAct_9fa48("143875") ? reason?.code && reason?.reason : stryMutAct_9fa48("143874") ? false : (stryCov_9fa48("143874", "143875"), (stryMutAct_9fa48("143876") ? reason.code : (stryCov_9fa48("143876"), reason?.code)) || (stryMutAct_9fa48("143877") ? reason.reason : (stryCov_9fa48("143877"), reason?.reason)))) || reason)) || (stryMutAct_9fa48("143878") ? "Stryker was here!" : (stryCov_9fa48("143878"), '')))).trim()))).filter(stryMutAct_9fa48("143879") ? () => undefined : (stryCov_9fa48("143879"), reason => stryMutAct_9fa48("143883") ? reason.length <= NUM.ZERO : stryMutAct_9fa48("143882") ? reason.length >= NUM.ZERO : stryMutAct_9fa48("143881") ? false : stryMutAct_9fa48("143880") ? true : (stryCov_9fa48("143880", "143881", "143882", "143883"), reason.length > NUM.ZERO)))) : stryMutAct_9fa48("143884") ? ["Stryker was here"] : (stryCov_9fa48("143884"), []);
              this.logger.info(REBALANCER_LOG_MSG.MOVE_SKIPPED, stryMutAct_9fa48("143885") ? {} : (stryCov_9fa48("143885"), {
                entityId: this.entityId,
                entityType: this.entityType,
                moveType: move.type,
                nodeId: move.nodeId,
                replicaId: stryMutAct_9fa48("143888") ? move.replicaId && null : stryMutAct_9fa48("143887") ? false : stryMutAct_9fa48("143886") ? true : (stryCov_9fa48("143886", "143887", "143888"), move.replicaId || null),
                reason: stryMutAct_9fa48("143891") ? outcome.reason && null : stryMutAct_9fa48("143890") ? false : stryMutAct_9fa48("143889") ? true : (stryCov_9fa48("143889", "143890", "143891"), outcome.reason || null),
                error: stryMutAct_9fa48("143894") ? outcome.error && null : stryMutAct_9fa48("143893") ? false : stryMutAct_9fa48("143892") ? true : (stryCov_9fa48("143892", "143893", "143894"), outcome.error || null),
                admissionDecisionType: stryMutAct_9fa48("143897") ? outcome?.admission?.decisionType && null : stryMutAct_9fa48("143896") ? false : stryMutAct_9fa48("143895") ? true : (stryCov_9fa48("143895", "143896", "143897"), (stryMutAct_9fa48("143899") ? outcome.admission?.decisionType : stryMutAct_9fa48("143898") ? outcome?.admission.decisionType : (stryCov_9fa48("143898", "143899"), outcome?.admission?.decisionType)) || null),
                admissionReason: stryMutAct_9fa48("143902") ? outcome?.admission?.reason && null : stryMutAct_9fa48("143901") ? false : stryMutAct_9fa48("143900") ? true : (stryCov_9fa48("143900", "143901", "143902"), (stryMutAct_9fa48("143904") ? outcome.admission?.reason : stryMutAct_9fa48("143903") ? outcome?.admission.reason : (stryCov_9fa48("143903", "143904"), outcome?.admission?.reason)) || null),
                admissionBlockingReasonCodes
              }));
            }
          }
          return outcome;
        }
      } catch (error) {
        if (stryMutAct_9fa48("143905")) {
          {}
        } else {
          stryCov_9fa48("143905");
          this.logger.error(REBALANCER_LOG_MSG.MOVE_FAILED, stryMutAct_9fa48("143906") ? {} : (stryCov_9fa48("143906"), {
            entityId: this.entityId,
            moveType: move.type,
            nodeId: move.nodeId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Execute a move via the RebalanceCoordinator.
   * The coordinator owns operation state tracking.
   * Requirements: 2.5
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   * @private
   */
  async executeMoveViaCoordinator(move) {
    if (stryMutAct_9fa48("143907")) {
      {}
    } else {
      stryCov_9fa48("143907");
      if (stryMutAct_9fa48("143909") ? false : stryMutAct_9fa48("143908") ? true : (stryCov_9fa48("143908", "143909"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("143910")) {
          {}
        } else {
          stryCov_9fa48("143910");
          return this.buildSkippedMoveResult(REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS, move);
        }
      }
      const safetyError = await this.rebalanceCoordinator.getMoveSafetyError(stryMutAct_9fa48("143911") ? {} : (stryCov_9fa48("143911"), {
        ...move,
        partitionId: stryMutAct_9fa48("143914") ? move.partitionId && this.entityId : stryMutAct_9fa48("143913") ? false : stryMutAct_9fa48("143912") ? true : (stryCov_9fa48("143912", "143913", "143914"), move.partitionId || this.entityId),
        entityType: stryMutAct_9fa48("143917") ? move.entityType && this.entityType : stryMutAct_9fa48("143916") ? false : stryMutAct_9fa48("143915") ? true : (stryCov_9fa48("143915", "143916", "143917"), move.entityType || this.entityType),
        entityId: stryMutAct_9fa48("143920") ? move.entityId && this.entityId : stryMutAct_9fa48("143919") ? false : stryMutAct_9fa48("143918") ? true : (stryCov_9fa48("143918", "143919", "143920"), move.entityId || this.entityId)
      }));
      if (stryMutAct_9fa48("143922") ? false : stryMutAct_9fa48("143921") ? true : (stryCov_9fa48("143921", "143922"), safetyError)) {
        if (stryMutAct_9fa48("143923")) {
          {}
        } else {
          stryCov_9fa48("143923");
          this.logger.debug(REBALANCER_LOG_MSG.MOVE_BLOCKED_BY_SAFETY_POLICY, stryMutAct_9fa48("143924") ? {} : (stryCov_9fa48("143924"), {
            entityId: this.entityId,
            entityType: this.entityType,
            partitionId: this.entityId,
            moveType: move.type,
            nodeId: move.nodeId,
            replicaId: move.replicaId,
            error: safetyError
          }));
          return this.buildSkippedMoveResult(REBALANCER_SKIP_REASON.SAFETY_BLOCKED, move, stryMutAct_9fa48("143925") ? {} : (stryCov_9fa48("143925"), {
            error: safetyError
          }));
        }
      }
      const operationType = this.resolveCoordinatorOperationType(move.type);
      const operationRequest = stryMutAct_9fa48("143926") ? {} : (stryCov_9fa48("143926"), {
        type: operationType,
        partitionId: this.entityId,
        entityType: this.entityType,
        entityId: this.entityId,
        nodeId: move.nodeId,
        replicaId: move.replicaId,
        sourceNodeId: move.sourceNodeId,
        enforceConcurrentOperationBudget: stryMutAct_9fa48("143927") ? false : (stryCov_9fa48("143927"), true)
      });
      const membershipPublicationEpoch = Number.isInteger(stryMutAct_9fa48("143928") ? move.membershipPublicationEpoch : (stryCov_9fa48("143928"), move?.membershipPublicationEpoch)) ? move.membershipPublicationEpoch : this.resolvePublishedMembershipPlanningEpoch();
      if (stryMutAct_9fa48("143931") ? Number.isInteger(membershipPublicationEpoch) || membershipPublicationEpoch >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143930") ? false : stryMutAct_9fa48("143929") ? true : (stryCov_9fa48("143929", "143930", "143931"), Number.isInteger(membershipPublicationEpoch) && (stryMutAct_9fa48("143934") ? membershipPublicationEpoch < UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143933") ? membershipPublicationEpoch > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("143932") ? true : (stryCov_9fa48("143932", "143933", "143934"), membershipPublicationEpoch >= UNIFIED_REBALANCER_LITERAL.ZERO)))) {
        if (stryMutAct_9fa48("143935")) {
          {}
        } else {
          stryCov_9fa48("143935");
          operationRequest.membershipPublicationEpoch = membershipPublicationEpoch;
        }
      }
      if (stryMutAct_9fa48("143938") ? move.controlPlaneMutationWorkClass : stryMutAct_9fa48("143937") ? false : stryMutAct_9fa48("143936") ? true : (stryCov_9fa48("143936", "143937", "143938"), move?.controlPlaneMutationWorkClass)) {
        if (stryMutAct_9fa48("143939")) {
          {}
        } else {
          stryCov_9fa48("143939");
          operationRequest.controlPlaneMutationWorkClass = move.controlPlaneMutationWorkClass;
        }
      }

      // Create operation record via coordinator.
      // Periodic planning already gates on local mutation readiness before
      // enqueueing moves, so direct move execution should only opt into
      // background mutation gating when the caller explicitly requests it.
      let operation = null;
      try {
        if (stryMutAct_9fa48("143940")) {
          {}
        } else {
          stryCov_9fa48("143940");
          operation = await this.rebalanceCoordinator.createOperation(operationRequest);
        }
      } catch (error) {
        if (stryMutAct_9fa48("143941")) {
          {}
        } else {
          stryCov_9fa48("143941");
          if (stryMutAct_9fa48("143944") ? error.rebalanceSkipReason : stryMutAct_9fa48("143943") ? false : stryMutAct_9fa48("143942") ? true : (stryCov_9fa48("143942", "143943", "143944"), error?.rebalanceSkipReason)) {
            if (stryMutAct_9fa48("143945")) {
              {}
            } else {
              stryCov_9fa48("143945");
              return this.buildSkippedMoveResult(error.rebalanceSkipReason, move);
            }
          }
          if (stryMutAct_9fa48("143948") ? error.admissionResult : stryMutAct_9fa48("143947") ? false : stryMutAct_9fa48("143946") ? true : (stryCov_9fa48("143946", "143947", "143948"), error?.admissionResult)) {
            if (stryMutAct_9fa48("143949")) {
              {}
            } else {
              stryCov_9fa48("143949");
              return this.buildSkippedMoveResult(stryMutAct_9fa48("143952") ? error.admissionResult.decisionType && UNIFIED_REBALANCER_LITERAL.ADMISSION_DENIED : stryMutAct_9fa48("143951") ? false : stryMutAct_9fa48("143950") ? true : (stryCov_9fa48("143950", "143951", "143952"), error.admissionResult.decisionType || UNIFIED_REBALANCER_LITERAL.ADMISSION_DENIED), move, stryMutAct_9fa48("143953") ? {} : (stryCov_9fa48("143953"), {
                admission: error.admissionResult
              }));
            }
          }
          throw error;
        }
      }
      return stryMutAct_9fa48("143954") ? {} : (stryCov_9fa48("143954"), {
        ...this.buildRebalanceResult(stryMutAct_9fa48("143955") ? false : (stryCov_9fa48("143955"), true), stryMutAct_9fa48("143956") ? {} : (stryCov_9fa48("143956"), {
          replicaId: stryMutAct_9fa48("143959") ? move.replicaId && operation.replicaId : stryMutAct_9fa48("143958") ? false : stryMutAct_9fa48("143957") ? true : (stryCov_9fa48("143957", "143958", "143959"), move.replicaId || operation.replicaId),
          nodeId: move.nodeId,
          operationId: operation.operationId,
          operation: move.type,
          status: UNIFIED_REBALANCER_LITERAL.SCHEDULED
        }))
      });
    }
  }

  /**
   * Check if a replica has a pending move operation.
   * @param {string} replicaId - Replica ID to check.
   * @return {boolean} True if replica has pending move.
   */
  hasPendingMove(replicaId) {
    if (stryMutAct_9fa48("143960")) {
      {}
    } else {
      stryCov_9fa48("143960");
      const inFlightOps = this.getInFlightOperations();
      if (stryMutAct_9fa48("143963") ? inFlightOps.every(op => op.replica_id === replicaId) : stryMutAct_9fa48("143962") ? false : stryMutAct_9fa48("143961") ? true : (stryCov_9fa48("143961", "143962", "143963"), inFlightOps.some(stryMutAct_9fa48("143964") ? () => undefined : (stryCov_9fa48("143964"), op => stryMutAct_9fa48("143967") ? op.replica_id !== replicaId : stryMutAct_9fa48("143966") ? false : stryMutAct_9fa48("143965") ? true : (stryCov_9fa48("143965", "143966", "143967"), op.replica_id === replicaId))))) {
        if (stryMutAct_9fa48("143968")) {
          {}
        } else {
          stryCov_9fa48("143968");
          return stryMutAct_9fa48("143969") ? false : (stryCov_9fa48("143969"), true);
        }
      }
      return stryMutAct_9fa48("143970") ? true : (stryCov_9fa48("143970"), false);
    }
  }

  /**
   * Check if a node has a pending ADD move for this entity.
   * @param {string} nodeId - Node ID to check.
   * @return {boolean} True if node has pending ADD move.
   */
  hasPendingAddForNode(nodeId) {
    if (stryMutAct_9fa48("143971")) {
      {}
    } else {
      stryCov_9fa48("143971");
      const inFlightOps = this.getTopologyBlockingInFlightOperations();
      if (stryMutAct_9fa48("143974") ? inFlightOps.every(op => op.target_node_id === nodeId && this.isAddLikeInFlightOperation(op)) : stryMutAct_9fa48("143973") ? false : stryMutAct_9fa48("143972") ? true : (stryCov_9fa48("143972", "143973", "143974"), inFlightOps.some(stryMutAct_9fa48("143975") ? () => undefined : (stryCov_9fa48("143975"), op => stryMutAct_9fa48("143978") ? op.target_node_id === nodeId || this.isAddLikeInFlightOperation(op) : stryMutAct_9fa48("143977") ? false : stryMutAct_9fa48("143976") ? true : (stryCov_9fa48("143976", "143977", "143978"), (stryMutAct_9fa48("143980") ? op.target_node_id !== nodeId : stryMutAct_9fa48("143979") ? true : (stryCov_9fa48("143979", "143980"), op.target_node_id === nodeId)) && this.isAddLikeInFlightOperation(op)))))) {
        if (stryMutAct_9fa48("143981")) {
          {}
        } else {
          stryCov_9fa48("143981");
          return stryMutAct_9fa48("143982") ? false : (stryCov_9fa48("143982"), true);
        }
      }
      return stryMutAct_9fa48("143983") ? true : (stryCov_9fa48("143983"), false);
    }
  }

  /**
   * Group moves by target node ID.
   * @param {Array<Object>} moves - Move operations.
   * @return {Map<string|null, Array<Object>>} Grouped moves by node ID.
   * @private
   */
  groupMovesByTargetNode(moves) {
    if (stryMutAct_9fa48("143984")) {
      {}
    } else {
      stryCov_9fa48("143984");
      const grouped = new Map();
      for (const move of moves) {
        if (stryMutAct_9fa48("143985")) {
          {}
        } else {
          stryCov_9fa48("143985");
          const nodeId = stryMutAct_9fa48("143988") ? move?.nodeId && null : stryMutAct_9fa48("143987") ? false : stryMutAct_9fa48("143986") ? true : (stryCov_9fa48("143986", "143987", "143988"), (stryMutAct_9fa48("143989") ? move.nodeId : (stryCov_9fa48("143989"), move?.nodeId)) || null);
          if (stryMutAct_9fa48("143992") ? false : stryMutAct_9fa48("143991") ? true : stryMutAct_9fa48("143990") ? grouped.has(nodeId) : (stryCov_9fa48("143990", "143991", "143992"), !grouped.has(nodeId))) {
            if (stryMutAct_9fa48("143993")) {
              {}
            } else {
              stryCov_9fa48("143993");
              grouped.set(nodeId, stryMutAct_9fa48("143994") ? ["Stryker was here"] : (stryCov_9fa48("143994"), []));
            }
          }
          grouped.get(nodeId).push(move);
        }
      }
      return grouped;
    }
  }

  /**
   * Execute move operations with per-node batching and backpressure.
   * @param {Array<Object>} moves - Move operations.
   * @return {Promise<Array<Object>>} Execution results.
   * @private
   */
  async executeRebalancingMoves(moves) {
    if (stryMutAct_9fa48("143995")) {
      {}
    } else {
      stryCov_9fa48("143995");
      if (stryMutAct_9fa48("143997") ? false : stryMutAct_9fa48("143996") ? true : (stryCov_9fa48("143996", "143997"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("143998")) {
          {}
        } else {
          stryCov_9fa48("143998");
          return stryMutAct_9fa48("143999") ? ["Stryker was here"] : (stryCov_9fa48("143999"), []);
        }
      }
      const results = stryMutAct_9fa48("144000") ? ["Stryker was here"] : (stryCov_9fa48("144000"), []);
      const batchSize = (stryMutAct_9fa48("144003") ? Number.isFinite(this.moveBatchSize) || this.moveBatchSize > 0 : stryMutAct_9fa48("144002") ? false : stryMutAct_9fa48("144001") ? true : (stryCov_9fa48("144001", "144002", "144003"), Number.isFinite(this.moveBatchSize) && (stryMutAct_9fa48("144006") ? this.moveBatchSize <= 0 : stryMutAct_9fa48("144005") ? this.moveBatchSize >= 0 : stryMutAct_9fa48("144004") ? true : (stryCov_9fa48("144004", "144005", "144006"), this.moveBatchSize > 0)))) ? Math.floor(this.moveBatchSize) : 1;
      const interBatchDelayMs = (stryMutAct_9fa48("144009") ? Number.isFinite(this.interBatchDelayMs) || this.interBatchDelayMs > 0 : stryMutAct_9fa48("144008") ? false : stryMutAct_9fa48("144007") ? true : (stryCov_9fa48("144007", "144008", "144009"), Number.isFinite(this.interBatchDelayMs) && (stryMutAct_9fa48("144012") ? this.interBatchDelayMs <= 0 : stryMutAct_9fa48("144011") ? this.interBatchDelayMs >= 0 : stryMutAct_9fa48("144010") ? true : (stryCov_9fa48("144010", "144011", "144012"), this.interBatchDelayMs > 0)))) ? this.interBatchDelayMs : 0;
      const readinessByNodeId = new Map();
      const getSkipReasonCached = async nodeId => {
        if (stryMutAct_9fa48("144013")) {
          {}
        } else {
          stryCov_9fa48("144013");
          if (stryMutAct_9fa48("144016") ? false : stryMutAct_9fa48("144015") ? true : stryMutAct_9fa48("144014") ? nodeId : (stryCov_9fa48("144014", "144015", "144016"), !nodeId)) {
            if (stryMutAct_9fa48("144017")) {
              {}
            } else {
              stryCov_9fa48("144017");
              return null;
            }
          }
          if (stryMutAct_9fa48("144019") ? false : stryMutAct_9fa48("144018") ? true : (stryCov_9fa48("144018", "144019"), readinessByNodeId.has(nodeId))) {
            if (stryMutAct_9fa48("144020")) {
              {}
            } else {
              stryCov_9fa48("144020");
              return readinessByNodeId.get(nodeId);
            }
          }
          const skipDetail = await this.getNodeReadinessSkipReason(nodeId);
          readinessByNodeId.set(nodeId, skipDetail);
          return skipDetail;
        }
      };
      const movesToExecute = stryMutAct_9fa48("144021") ? ["Stryker was here"] : (stryCov_9fa48("144021"), []);
      const blockedAddNodeIds = new Set();
      for (const move of moves) {
        if (stryMutAct_9fa48("144022")) {
          {}
        } else {
          stryCov_9fa48("144022");
          if (stryMutAct_9fa48("144024") ? false : stryMutAct_9fa48("144023") ? true : (stryCov_9fa48("144023", "144024"), this.isShuttingDown)) {
            if (stryMutAct_9fa48("144025")) {
              {}
            } else {
              stryCov_9fa48("144025");
              return results;
            }
          }
          if (stryMutAct_9fa48("144028") ? move?.type === MoveType.ADD || move?.type === MoveType.REPLACE || move?.nodeId : stryMutAct_9fa48("144027") ? false : stryMutAct_9fa48("144026") ? true : (stryCov_9fa48("144026", "144027", "144028"), (stryMutAct_9fa48("144030") ? move?.type === MoveType.ADD && move?.type === MoveType.REPLACE : stryMutAct_9fa48("144029") ? true : (stryCov_9fa48("144029", "144030"), (stryMutAct_9fa48("144032") ? move?.type !== MoveType.ADD : stryMutAct_9fa48("144031") ? false : (stryCov_9fa48("144031", "144032"), (stryMutAct_9fa48("144033") ? move.type : (stryCov_9fa48("144033"), move?.type)) === MoveType.ADD)) || (stryMutAct_9fa48("144035") ? move?.type !== MoveType.REPLACE : stryMutAct_9fa48("144034") ? false : (stryCov_9fa48("144034", "144035"), (stryMutAct_9fa48("144036") ? move.type : (stryCov_9fa48("144036"), move?.type)) === MoveType.REPLACE)))) && (stryMutAct_9fa48("144037") ? move.nodeId : (stryCov_9fa48("144037"), move?.nodeId)))) {
            if (stryMutAct_9fa48("144038")) {
              {}
            } else {
              stryCov_9fa48("144038");
              const skipDetail = await getSkipReasonCached(move.nodeId);
              if (stryMutAct_9fa48("144041") ? skipDetail === null : stryMutAct_9fa48("144040") ? false : stryMutAct_9fa48("144039") ? true : (stryCov_9fa48("144039", "144040", "144041"), skipDetail !== null)) {
                if (stryMutAct_9fa48("144042")) {
                  {}
                } else {
                  stryCov_9fa48("144042");
                  blockedAddNodeIds.add(move.nodeId);
                }
              }
            }
          }
        }
      }
      for (const move of moves) {
        if (stryMutAct_9fa48("144043")) {
          {}
        } else {
          stryCov_9fa48("144043");
          if (stryMutAct_9fa48("144045") ? false : stryMutAct_9fa48("144044") ? true : (stryCov_9fa48("144044", "144045"), this.isShuttingDown)) {
            if (stryMutAct_9fa48("144046")) {
              {}
            } else {
              stryCov_9fa48("144046");
              return results;
            }
          }
          const isDeferrableRemove = stryMutAct_9fa48("144049") ? move?.type === MoveType.REMOVE && move?.reason !== 'replica_failed' || move?.standaloneSafe !== true : stryMutAct_9fa48("144048") ? false : stryMutAct_9fa48("144047") ? true : (stryCov_9fa48("144047", "144048", "144049"), (stryMutAct_9fa48("144051") ? move?.type === MoveType.REMOVE || move?.reason !== 'replica_failed' : stryMutAct_9fa48("144050") ? true : (stryCov_9fa48("144050", "144051"), (stryMutAct_9fa48("144053") ? move?.type !== MoveType.REMOVE : stryMutAct_9fa48("144052") ? true : (stryCov_9fa48("144052", "144053"), (stryMutAct_9fa48("144054") ? move.type : (stryCov_9fa48("144054"), move?.type)) === MoveType.REMOVE)) && (stryMutAct_9fa48("144056") ? move?.reason === 'replica_failed' : stryMutAct_9fa48("144055") ? true : (stryCov_9fa48("144055", "144056"), (stryMutAct_9fa48("144057") ? move.reason : (stryCov_9fa48("144057"), move?.reason)) !== (stryMutAct_9fa48("144058") ? "" : (stryCov_9fa48("144058"), 'replica_failed')))))) && (stryMutAct_9fa48("144060") ? move?.standaloneSafe === true : stryMutAct_9fa48("144059") ? true : (stryCov_9fa48("144059", "144060"), (stryMutAct_9fa48("144061") ? move.standaloneSafe : (stryCov_9fa48("144061"), move?.standaloneSafe)) !== (stryMutAct_9fa48("144062") ? false : (stryCov_9fa48("144062"), true)))));
          if (stryMutAct_9fa48("144065") ? blockedAddNodeIds.size > UNIFIED_REBALANCER_LITERAL.ZERO || isDeferrableRemove : stryMutAct_9fa48("144064") ? false : stryMutAct_9fa48("144063") ? true : (stryCov_9fa48("144063", "144064", "144065"), (stryMutAct_9fa48("144068") ? blockedAddNodeIds.size <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144067") ? blockedAddNodeIds.size >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144066") ? true : (stryCov_9fa48("144066", "144067", "144068"), blockedAddNodeIds.size > UNIFIED_REBALANCER_LITERAL.ZERO)) && isDeferrableRemove)) {
            if (stryMutAct_9fa48("144069")) {
              {}
            } else {
              stryCov_9fa48("144069");
              results.push(stryMutAct_9fa48("144070") ? {} : (stryCov_9fa48("144070"), {
                success: stryMutAct_9fa48("144071") ? true : (stryCov_9fa48("144071"), false),
                skipped: stryMutAct_9fa48("144072") ? false : (stryCov_9fa48("144072"), true),
                reason: REBALANCER_SKIP_REASON.AWAITING_READY_ADD_CAPACITY,
                operation: move.type,
                nodeId: move.nodeId,
                replicaId: move.replicaId
              }));
              continue;
            }
          }
          movesToExecute.push(move);
        }
      }
      const groupedMoves = this.groupMovesByTargetNode(movesToExecute);
      for (const [nodeId, nodeMoves] of groupedMoves.entries()) {
        if (stryMutAct_9fa48("144073")) {
          {}
        } else {
          stryCov_9fa48("144073");
          if (stryMutAct_9fa48("144075") ? false : stryMutAct_9fa48("144074") ? true : (stryCov_9fa48("144074", "144075"), this.isShuttingDown)) {
            if (stryMutAct_9fa48("144076")) {
              {}
            } else {
              stryCov_9fa48("144076");
              break;
            }
          }
          if (stryMutAct_9fa48("144078") ? false : stryMutAct_9fa48("144077") ? true : (stryCov_9fa48("144077", "144078"), nodeId)) {
            if (stryMutAct_9fa48("144079")) {
              {}
            } else {
              stryCov_9fa48("144079");
              const skipDetail = await getSkipReasonCached(nodeId);
              if (stryMutAct_9fa48("144082") ? skipDetail === null : stryMutAct_9fa48("144081") ? false : stryMutAct_9fa48("144080") ? true : (stryCov_9fa48("144080", "144081", "144082"), skipDetail !== null)) {
                if (stryMutAct_9fa48("144083")) {
                  {}
                } else {
                  stryCov_9fa48("144083");
                  this.logger.debug(REBALANCER_LOG_MSG.SKIP_BATCH_UNREADY, stryMutAct_9fa48("144084") ? {} : (stryCov_9fa48("144084"), {
                    entityId: this.entityId,
                    nodeId,
                    moveCount: nodeMoves.length,
                    skipDetail
                  }));
                  for (const move of nodeMoves) {
                    if (stryMutAct_9fa48("144085")) {
                      {}
                    } else {
                      stryCov_9fa48("144085");
                      results.push(stryMutAct_9fa48("144086") ? {} : (stryCov_9fa48("144086"), {
                        success: stryMutAct_9fa48("144087") ? true : (stryCov_9fa48("144087"), false),
                        skipped: stryMutAct_9fa48("144088") ? false : (stryCov_9fa48("144088"), true),
                        reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
                        skipDetail,
                        operation: move.type,
                        nodeId: move.nodeId,
                        replicaId: move.replicaId
                      }));
                    }
                  }
                  continue;
                }
              }
            }
          }
          for (let i = UNIFIED_REBALANCER_LITERAL.ZERO; stryMutAct_9fa48("144091") ? i >= nodeMoves.length : stryMutAct_9fa48("144090") ? i <= nodeMoves.length : stryMutAct_9fa48("144089") ? false : (stryCov_9fa48("144089", "144090", "144091"), i < nodeMoves.length); stryMutAct_9fa48("144092") ? i -= batchSize : (stryCov_9fa48("144092"), i += batchSize)) {
            if (stryMutAct_9fa48("144093")) {
              {}
            } else {
              stryCov_9fa48("144093");
              if (stryMutAct_9fa48("144095") ? false : stryMutAct_9fa48("144094") ? true : (stryCov_9fa48("144094", "144095"), this.isShuttingDown)) {
                if (stryMutAct_9fa48("144096")) {
                  {}
                } else {
                  stryCov_9fa48("144096");
                  break;
                }
              }
              const batch = stryMutAct_9fa48("144097") ? nodeMoves : (stryCov_9fa48("144097"), nodeMoves.slice(i, stryMutAct_9fa48("144098") ? i - batchSize : (stryCov_9fa48("144098"), i + batchSize)));
              const batchResults = await Promise.all(batch.map(move => {
                if (stryMutAct_9fa48("144099")) {
                  {}
                } else {
                  stryCov_9fa48("144099");
                  return this.executeMove(move);
                }
              }));
              results.push(...batchResults);
              if (stryMutAct_9fa48("144101") ? false : stryMutAct_9fa48("144100") ? true : (stryCov_9fa48("144100", "144101"), nodeId)) {
                if (stryMutAct_9fa48("144102")) {
                  {}
                } else {
                  stryCov_9fa48("144102");
                  const midBatchSkip = await this.getNodeReadinessSkipReason(nodeId);
                  if (stryMutAct_9fa48("144105") ? midBatchSkip === null : stryMutAct_9fa48("144104") ? false : stryMutAct_9fa48("144103") ? true : (stryCov_9fa48("144103", "144104", "144105"), midBatchSkip !== null)) {
                    if (stryMutAct_9fa48("144106")) {
                      {}
                    } else {
                      stryCov_9fa48("144106");
                      this.logger.debug(REBALANCER_LOG_MSG.NODE_DISCONNECTED_BATCH, stryMutAct_9fa48("144107") ? {} : (stryCov_9fa48("144107"), {
                        entityId: this.entityId,
                        nodeId,
                        remainingMoves: stryMutAct_9fa48("144108") ? nodeMoves.length + (i + batch.length) : (stryCov_9fa48("144108"), nodeMoves.length - (stryMutAct_9fa48("144109") ? i - batch.length : (stryCov_9fa48("144109"), i + batch.length))),
                        skipDetail: midBatchSkip
                      }));
                      const remainingMoves = stryMutAct_9fa48("144110") ? nodeMoves : (stryCov_9fa48("144110"), nodeMoves.slice(stryMutAct_9fa48("144111") ? i - batch.length : (stryCov_9fa48("144111"), i + batch.length)));
                      for (const move of remainingMoves) {
                        if (stryMutAct_9fa48("144112")) {
                          {}
                        } else {
                          stryCov_9fa48("144112");
                          results.push(stryMutAct_9fa48("144113") ? {} : (stryCov_9fa48("144113"), {
                            success: stryMutAct_9fa48("144114") ? true : (stryCov_9fa48("144114"), false),
                            skipped: stryMutAct_9fa48("144115") ? false : (stryCov_9fa48("144115"), true),
                            reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
                            skipDetail: midBatchSkip,
                            operation: move.type,
                            nodeId: move.nodeId,
                            replicaId: move.replicaId
                          }));
                        }
                      }
                      break;
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("144118") ? interBatchDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO || i + batchSize < nodeMoves.length : stryMutAct_9fa48("144117") ? false : stryMutAct_9fa48("144116") ? true : (stryCov_9fa48("144116", "144117", "144118"), (stryMutAct_9fa48("144121") ? interBatchDelayMs <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144120") ? interBatchDelayMs >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144119") ? true : (stryCov_9fa48("144119", "144120", "144121"), interBatchDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO)) && (stryMutAct_9fa48("144124") ? i + batchSize >= nodeMoves.length : stryMutAct_9fa48("144123") ? i + batchSize <= nodeMoves.length : stryMutAct_9fa48("144122") ? true : (stryCov_9fa48("144122", "144123", "144124"), (stryMutAct_9fa48("144125") ? i - batchSize : (stryCov_9fa48("144125"), i + batchSize)) < nodeMoves.length)))) {
                if (stryMutAct_9fa48("144126")) {
                  {}
                } else {
                  stryCov_9fa48("144126");
                  await new Promise(stryMutAct_9fa48("144127") ? () => undefined : (stryCov_9fa48("144127"), resolve => setTimeout(resolve, interBatchDelayMs)));
                }
              }
            }
          }
        }
      }
      return results;
    }
  }

  /**
   * Main rebalancing entry point.
   * @param {string} trigger - What triggered the rebalance.
   * @param {Object} policy - Optional policy override.
   * @return {Promise<Object>} Rebalancing result.
   */
  async rebalance(trigger = TriggerType.PERIODIC, policy = null) {
    if (stryMutAct_9fa48("144128")) {
      {}
    } else {
      stryCov_9fa48("144128");
      if (stryMutAct_9fa48("144130") ? false : stryMutAct_9fa48("144129") ? true : (stryCov_9fa48("144129", "144130"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("144131")) {
          {}
        } else {
          stryCov_9fa48("144131");
          return this.buildRebalanceResult(stryMutAct_9fa48("144132") ? true : (stryCov_9fa48("144132"), false), stryMutAct_9fa48("144133") ? {} : (stryCov_9fa48("144133"), {
            skipped: stryMutAct_9fa48("144134") ? false : (stryCov_9fa48("144134"), true),
            reason: REBALANCER_RUNTIME_REASON.SHUTDOWN_IN_PROGRESS
          }));
        }
      }
      if (stryMutAct_9fa48("144137") ? false : stryMutAct_9fa48("144136") ? true : stryMutAct_9fa48("144135") ? this.isLeader : (stryCov_9fa48("144135", "144136", "144137"), !this.isLeader)) {
        if (stryMutAct_9fa48("144138")) {
          {}
        } else {
          stryCov_9fa48("144138");
          this.logger.debug(REBALANCER_LOG_MSG.NOT_LEADER_SKIP, stryMutAct_9fa48("144139") ? {} : (stryCov_9fa48("144139"), {
            entityId: this.entityId
          }));
          return this.buildRebalanceResult(stryMutAct_9fa48("144140") ? true : (stryCov_9fa48("144140"), false), stryMutAct_9fa48("144141") ? {} : (stryCov_9fa48("144141"), {
            reason: REBALANCER_RUNTIME_REASON.NOT_LEADER
          }));
        }
      }
      const effectivePolicy = stryMutAct_9fa48("144144") ? policy && (await this.getPolicy()) : stryMutAct_9fa48("144143") ? false : stryMutAct_9fa48("144142") ? true : (stryCov_9fa48("144142", "144143", "144144"), policy || (await this.getPolicy()));
      const currentReplicas = this.getCurrentReplicas();
      const availableNodes = this.getAvailableNodes();
      if (stryMutAct_9fa48("144147") ? availableNodes.length !== UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144146") ? false : stryMutAct_9fa48("144145") ? true : (stryCov_9fa48("144145", "144146", "144147"), availableNodes.length === UNIFIED_REBALANCER_LITERAL.ZERO)) {
        if (stryMutAct_9fa48("144148")) {
          {}
        } else {
          stryCov_9fa48("144148");
          this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, stryMutAct_9fa48("144149") ? {} : (stryCov_9fa48("144149"), {
            entityId: this.entityId,
            entityType: this.entityType
          }));
          return this.buildRebalanceResult(stryMutAct_9fa48("144150") ? true : (stryCov_9fa48("144150"), false), stryMutAct_9fa48("144151") ? {} : (stryCov_9fa48("144151"), {
            reason: REBALANCER_RUNTIME_REASON.NO_AVAILABLE_NODES
          }));
        }
      }
      const targetState = await this.movePlanner.calculateTargetState(currentReplicas, effectivePolicy);
      const planningMembershipPublicationEpoch = this.resolvePublishedMembershipPlanningEpoch();
      const moves = await this.movePlanner.applyPressureGating(this.movePlanner.calculateMoves(currentReplicas, targetState));
      if (stryMutAct_9fa48("144154") ? moves.length !== UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144153") ? false : stryMutAct_9fa48("144152") ? true : (stryCov_9fa48("144152", "144153", "144154"), moves.length === UNIFIED_REBALANCER_LITERAL.ZERO)) {
        if (stryMutAct_9fa48("144155")) {
          {}
        } else {
          stryCov_9fa48("144155");
          this.logger.debug(REBALANCER_LOG_MSG.NO_REBALANCE_NEEDED, stryMutAct_9fa48("144156") ? {} : (stryCov_9fa48("144156"), {
            entityId: this.entityId,
            currentCount: currentReplicas.length,
            targetCount: targetState.targetReplicaCount
          }));
          return this.buildRebalanceResult(stryMutAct_9fa48("144157") ? false : (stryCov_9fa48("144157"), true), stryMutAct_9fa48("144158") ? {} : (stryCov_9fa48("144158"), {
            moves: stryMutAct_9fa48("144159") ? ["Stryker was here"] : (stryCov_9fa48("144159"), []),
            reason: REBALANCER_RUNTIME_REASON.NO_CHANGES_NEEDED
          }));
        }
      }
      let availableBudget = this.maxConcurrentMoves;
      try {
        if (stryMutAct_9fa48("144160")) {
          {}
        } else {
          stryCov_9fa48("144160");
          const configuredBudget = await this.getConfiguredRebalanceBudget();
          const inFlightCount = await this.getGlobalInFlightOperationCount();
          const isCritical = this.movePlanner.isCriticalState(currentReplicas, effectivePolicy, availableNodes);
          const effectiveBudget = isCritical ? stryMutAct_9fa48("144161") ? configuredBudget / this.criticalBudgetMultiplier : (stryCov_9fa48("144161"), configuredBudget * this.criticalBudgetMultiplier) : configuredBudget;
          const reservedPriorityRecoveryMoveSlots = this.getReservedPriorityRecoveryMoveSlots();
          availableBudget = stryMutAct_9fa48("144162") ? Math.min(NUM.ZERO, effectiveBudget - inFlightCount - reservedPriorityRecoveryMoveSlots) : (stryCov_9fa48("144162"), Math.max(NUM.ZERO, stryMutAct_9fa48("144163") ? effectiveBudget - inFlightCount + reservedPriorityRecoveryMoveSlots : (stryCov_9fa48("144163"), (stryMutAct_9fa48("144164") ? effectiveBudget + inFlightCount : (stryCov_9fa48("144164"), effectiveBudget - inFlightCount)) - reservedPriorityRecoveryMoveSlots)));
          if (stryMutAct_9fa48("144168") ? availableBudget > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144167") ? availableBudget < UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144166") ? false : stryMutAct_9fa48("144165") ? true : (stryCov_9fa48("144165", "144166", "144167", "144168"), availableBudget <= UNIFIED_REBALANCER_LITERAL.ZERO)) {
            if (stryMutAct_9fa48("144169")) {
              {}
            } else {
              stryCov_9fa48("144169");
              const priorityBudgetBypass = await this.canBypassGlobalBudgetForPriorityRecovery(moves);
              if (stryMutAct_9fa48("144172") ? priorityBudgetBypass !== true : stryMutAct_9fa48("144171") ? false : stryMutAct_9fa48("144170") ? true : (stryCov_9fa48("144170", "144171", "144172"), priorityBudgetBypass === (stryMutAct_9fa48("144173") ? false : (stryCov_9fa48("144173"), true)))) {
                if (stryMutAct_9fa48("144174")) {
                  {}
                } else {
                  stryCov_9fa48("144174");
                  availableBudget = NUM.ONE;
                }
              } else {
                if (stryMutAct_9fa48("144175")) {
                  {}
                } else {
                  stryCov_9fa48("144175");
                  return this.buildRebalanceResult(stryMutAct_9fa48("144176") ? false : (stryCov_9fa48("144176"), true), stryMutAct_9fa48("144177") ? {} : (stryCov_9fa48("144177"), {
                    skipped: stryMutAct_9fa48("144178") ? false : (stryCov_9fa48("144178"), true),
                    reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
                    moves: stryMutAct_9fa48("144179") ? ["Stryker was here"] : (stryCov_9fa48("144179"), [])
                  }));
                }
              }
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("144180")) {
          {}
        } else {
          stryCov_9fa48("144180");
          this.logger.warn(REBALANCER_LOG_MSG.REBALANCE_ERROR, stryMutAct_9fa48("144181") ? {} : (stryCov_9fa48("144181"), {
            entityId: this.entityId,
            error: error.message
          }));
          return this.buildRebalanceResult(stryMutAct_9fa48("144182") ? true : (stryCov_9fa48("144182"), false), stryMutAct_9fa48("144183") ? {} : (stryCov_9fa48("144183"), {
            skipped: stryMutAct_9fa48("144184") ? false : (stryCov_9fa48("144184"), true),
            reason: REBALANCER_SKIP_REASON.BUDGET_QUERY_FAILED,
            moves: stryMutAct_9fa48("144185") ? ["Stryker was here"] : (stryCov_9fa48("144185"), [])
          }));
        }
      }
      this.logger.info(REBALANCER_LOG_MSG.START_REBALANCE, stryMutAct_9fa48("144186") ? {} : (stryCov_9fa48("144186"), {
        entityId: this.entityId,
        entityType: this.entityType,
        trigger,
        moveCount: moves.length,
        currentCount: currentReplicas.length,
        targetCount: targetState.targetReplicaCount
      }));
      const moveLimit = stryMutAct_9fa48("144187") ? Math.min(0, Math.min(this.maxConcurrentMoves, availableBudget)) : (stryCov_9fa48("144187"), Math.max(0, stryMutAct_9fa48("144188") ? Math.max(this.maxConcurrentMoves, availableBudget) : (stryCov_9fa48("144188"), Math.min(this.maxConcurrentMoves, availableBudget))));
      const limitedMoves = stryMutAct_9fa48("144189") ? moves.map(move => {
        if (!Number.isInteger(planningMembershipPublicationEpoch) || planningMembershipPublicationEpoch < 0) {
          return move;
        }
        return {
          ...move,
          membershipPublicationEpoch: planningMembershipPublicationEpoch
        };
      }) : (stryCov_9fa48("144189"), moves.slice(0, moveLimit).map(move => {
        if (stryMutAct_9fa48("144190")) {
          {}
        } else {
          stryCov_9fa48("144190");
          if (stryMutAct_9fa48("144193") ? !Number.isInteger(planningMembershipPublicationEpoch) && planningMembershipPublicationEpoch < 0 : stryMutAct_9fa48("144192") ? false : stryMutAct_9fa48("144191") ? true : (stryCov_9fa48("144191", "144192", "144193"), (stryMutAct_9fa48("144194") ? Number.isInteger(planningMembershipPublicationEpoch) : (stryCov_9fa48("144194"), !Number.isInteger(planningMembershipPublicationEpoch))) || (stryMutAct_9fa48("144197") ? planningMembershipPublicationEpoch >= 0 : stryMutAct_9fa48("144196") ? planningMembershipPublicationEpoch <= 0 : stryMutAct_9fa48("144195") ? false : (stryCov_9fa48("144195", "144196", "144197"), planningMembershipPublicationEpoch < 0)))) {
            if (stryMutAct_9fa48("144198")) {
              {}
            } else {
              stryCov_9fa48("144198");
              return move;
            }
          }
          return stryMutAct_9fa48("144199") ? {} : (stryCov_9fa48("144199"), {
            ...move,
            membershipPublicationEpoch: planningMembershipPublicationEpoch
          });
        }
      }));
      const results = await this.executeRebalancingMoves(limitedMoves);
      this.lastRebalanceTime = Date.now();
      stryMutAct_9fa48("144200") ? this.rebalanceCount-- : (stryCov_9fa48("144200"), this.rebalanceCount++);
      this.emit(REBALANCER_EVENT.REBALANCE_COMPLETE, stryMutAct_9fa48("144201") ? {} : (stryCov_9fa48("144201"), {
        entityId: this.entityId,
        entityType: this.entityType,
        trigger,
        results
      }));
      return this.buildRebalanceResult(stryMutAct_9fa48("144202") ? false : (stryCov_9fa48("144202"), true), stryMutAct_9fa48("144203") ? {} : (stryCov_9fa48("144203"), {
        moves: results,
        trigger,
        timestamp: this.lastRebalanceTime
      }));
    }
  }

  /**
   * Resolve the published membership epoch used to bind a planning pass.
   * @return {number|null}
   * @private
   */
  resolvePublishedMembershipPlanningEpoch() {
    if (stryMutAct_9fa48("144204")) {
      {}
    } else {
      stryCov_9fa48("144204");
      const readinessService = this.controlPlaneReadinessService;
      if (stryMutAct_9fa48("144207") ? !readinessService && typeof readinessService.getCurrentPublishedMembershipEpochSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("144206") ? false : stryMutAct_9fa48("144205") ? true : (stryCov_9fa48("144205", "144206", "144207"), (stryMutAct_9fa48("144208") ? readinessService : (stryCov_9fa48("144208"), !readinessService)) || (stryMutAct_9fa48("144210") ? typeof readinessService.getCurrentPublishedMembershipEpochSync === TYPEOF.FUNCTION : stryMutAct_9fa48("144209") ? false : (stryCov_9fa48("144209", "144210"), typeof readinessService.getCurrentPublishedMembershipEpochSync !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("144211")) {
          {}
        } else {
          stryCov_9fa48("144211");
          return null;
        }
      }
      return readinessService.getCurrentPublishedMembershipEpochSync(this.nodeId, Date.now());
    }
  }

  /**
   * Schedule the next periodic check.
   */
  scheduleNextCheck(overrideDelayMs = null) {
    if (stryMutAct_9fa48("144212")) {
      {}
    } else {
      stryCov_9fa48("144212");
      if (stryMutAct_9fa48("144215") ? !this.isLeader && this.isShuttingDown : stryMutAct_9fa48("144214") ? false : stryMutAct_9fa48("144213") ? true : (stryCov_9fa48("144213", "144214", "144215"), (stryMutAct_9fa48("144216") ? this.isLeader : (stryCov_9fa48("144216"), !this.isLeader)) || this.isShuttingDown)) {
        if (stryMutAct_9fa48("144217")) {
          {}
        } else {
          stryCov_9fa48("144217");
          return;
        }
      }
      this.cancelScheduledCheck();
      let delay = null;
      if (stryMutAct_9fa48("144220") ? typeof overrideDelayMs === UNIFIED_REBALANCER_LITERAL.NUMBER && Number.isFinite(overrideDelayMs) || overrideDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144219") ? false : stryMutAct_9fa48("144218") ? true : (stryCov_9fa48("144218", "144219", "144220"), (stryMutAct_9fa48("144222") ? typeof overrideDelayMs === UNIFIED_REBALANCER_LITERAL.NUMBER || Number.isFinite(overrideDelayMs) : stryMutAct_9fa48("144221") ? true : (stryCov_9fa48("144221", "144222"), (stryMutAct_9fa48("144224") ? typeof overrideDelayMs !== UNIFIED_REBALANCER_LITERAL.NUMBER : stryMutAct_9fa48("144223") ? true : (stryCov_9fa48("144223", "144224"), typeof overrideDelayMs === UNIFIED_REBALANCER_LITERAL.NUMBER)) && Number.isFinite(overrideDelayMs))) && (stryMutAct_9fa48("144227") ? overrideDelayMs <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144226") ? overrideDelayMs >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144225") ? true : (stryCov_9fa48("144225", "144226", "144227"), overrideDelayMs > UNIFIED_REBALANCER_LITERAL.ZERO)))) {
        if (stryMutAct_9fa48("144228")) {
          {}
        } else {
          stryCov_9fa48("144228");
          delay = stryMutAct_9fa48("144229") ? Math.min(UNIFIED_REBALANCER_LITERAL.THOUSAND, Math.floor(overrideDelayMs)) : (stryCov_9fa48("144229"), Math.max(UNIFIED_REBALANCER_LITERAL.THOUSAND, Math.floor(overrideDelayMs)));
        }
      } else {
        if (stryMutAct_9fa48("144230")) {
          {}
        } else {
          stryCov_9fa48("144230");
          // Add jitter: ±25% of interval to spread load
          const jitter = stryMutAct_9fa48("144231") ? this.periodicCheckJitterMs * (Math.random() - 0.5) / 2 : (stryCov_9fa48("144231"), (stryMutAct_9fa48("144232") ? this.periodicCheckJitterMs / (Math.random() - 0.5) : (stryCov_9fa48("144232"), this.periodicCheckJitterMs * (stryMutAct_9fa48("144233") ? Math.random() + 0.5 : (stryCov_9fa48("144233"), Math.random() - 0.5)))) * 2);
          delay = stryMutAct_9fa48("144234") ? Math.min(UNIFIED_REBALANCER_LITERAL.THOUSAND, this.currentInterval + jitter) : (stryCov_9fa48("144234"), Math.max(UNIFIED_REBALANCER_LITERAL.THOUSAND, stryMutAct_9fa48("144235") ? this.currentInterval - jitter : (stryCov_9fa48("144235"), this.currentInterval + jitter)));
        }
      }
      this.scheduledCheck = setTimeout(() => {
        if (stryMutAct_9fa48("144236")) {
          {}
        } else {
          stryCov_9fa48("144236");
          this.scheduledCheck = null;
          this.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
        }
      }, delay);
      this.logger.debug(REBALANCER_LOG_MSG.SCHEDULE_NEXT, stryMutAct_9fa48("144237") ? {} : (stryCov_9fa48("144237"), {
        entityId: this.entityId,
        delayMs: Math.round(delay)
      }));
    }
  }

  /**
   * Cancel any scheduled check.
   */
  cancelScheduledCheck() {
    if (stryMutAct_9fa48("144238")) {
      {}
    } else {
      stryCov_9fa48("144238");
      if (stryMutAct_9fa48("144240") ? false : stryMutAct_9fa48("144239") ? true : (stryCov_9fa48("144239", "144240"), this.scheduledCheck)) {
        if (stryMutAct_9fa48("144241")) {
          {}
        } else {
          stryCov_9fa48("144241");
          clearTimeout(this.scheduledCheck);
          this.scheduledCheck = null;
        }
      }
    }
  }

  /**
   * Cancel any pending stabilization check.
   */
  cancelStabilizationTimer() {
    if (stryMutAct_9fa48("144242")) {
      {}
    } else {
      stryCov_9fa48("144242");
      if (stryMutAct_9fa48("144244") ? false : stryMutAct_9fa48("144243") ? true : (stryCov_9fa48("144243", "144244"), this.stabilizationTimer)) {
        if (stryMutAct_9fa48("144245")) {
          {}
        } else {
          stryCov_9fa48("144245");
          clearTimeout(this.stabilizationTimer);
          this.stabilizationTimer = null;
        }
      }
    }
  }

  /**
   * Enqueue one typed rebalance reconcile through the owner queue.
   * Timers and live events must share this ingress so progression remains
   * single-flight per entity.
   *
   * @param {string} reason
   * @private
   */
  enqueueRebalanceCheck(reason = RECONCILE_REASON.PERIODIC_CHECK) {
    if (stryMutAct_9fa48("144246")) {
      {}
    } else {
      stryCov_9fa48("144246");
      if (stryMutAct_9fa48("144249") ? !this.isLeader && this.isShuttingDown : stryMutAct_9fa48("144248") ? false : stryMutAct_9fa48("144247") ? true : (stryCov_9fa48("144247", "144248", "144249"), (stryMutAct_9fa48("144250") ? this.isLeader : (stryCov_9fa48("144250"), !this.isLeader)) || this.isShuttingDown)) {
        if (stryMutAct_9fa48("144251")) {
          {}
        } else {
          stryCov_9fa48("144251");
          return stryMutAct_9fa48("144252") ? true : (stryCov_9fa48("144252"), false);
        }
      }
      return this.rebalanceCheckQueue.enqueue(this.entityId, reason);
    }
  }

  /**
   * Increase the periodic check interval without exceeding the configured cap.
   * @param {number} multiplier
   * @return {number}
   * @private
   */
  increaseCurrentInterval(multiplier) {
    if (stryMutAct_9fa48("144253")) {
      {}
    } else {
      stryCov_9fa48("144253");
      this.currentInterval = stryMutAct_9fa48("144254") ? Math.max(this.currentInterval * multiplier, this.maxInterval) : (stryCov_9fa48("144254"), Math.min(stryMutAct_9fa48("144255") ? this.currentInterval / multiplier : (stryCov_9fa48("144255"), this.currentInterval * multiplier), this.maxInterval));
      return this.currentInterval;
    }
  }

  /**
   * Resolve the logged follow-up delay for gates that use the priority-aware
   * scheduler.
   * @param {number} scheduleDelayMs
   * @return {number}
   * @private
   */
  getPriorityAwareDelayMs(scheduleDelayMs) {
    if (stryMutAct_9fa48("144256")) {
      {}
    } else {
      stryCov_9fa48("144256");
      if (stryMutAct_9fa48("144258") ? false : stryMutAct_9fa48("144257") ? true : (stryCov_9fa48("144257", "144258"), this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("144259")) {
          {}
        } else {
          stryCov_9fa48("144259");
          return this.getPriorityRetryDelayMs();
        }
      }
      return scheduleDelayMs;
    }
  }

  /**
   * Retryable control-plane failures must preserve this entity's reconcile
   * cadence. Priority recovery stays on the short loop, while ordinary
   * entities back off only as far as the transient failure requests.
   * @param {*} error
   * @return {number}
   * @private
   */
  getRetryableFailureRetryDelayMs(error) {
    if (stryMutAct_9fa48("144260")) {
      {}
    } else {
      stryCov_9fa48("144260");
      const retryAfterMs = getControlPlaneRetryAfterMs(error);
      if (stryMutAct_9fa48("144262") ? false : stryMutAct_9fa48("144261") ? true : (stryCov_9fa48("144261", "144262"), this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("144263")) {
          {}
        } else {
          stryCov_9fa48("144263");
          return stryMutAct_9fa48("144264") ? Math.min(this.getPriorityRetryDelayMs(), Number.isFinite(retryAfterMs) && retryAfterMs > UNIFIED_REBALANCER_LITERAL.ZERO ? Math.floor(retryAfterMs) : UNIFIED_REBALANCER_LITERAL.ZERO) : (stryCov_9fa48("144264"), Math.max(this.getPriorityRetryDelayMs(), (stryMutAct_9fa48("144267") ? Number.isFinite(retryAfterMs) || retryAfterMs > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144266") ? false : stryMutAct_9fa48("144265") ? true : (stryCov_9fa48("144265", "144266", "144267"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("144270") ? retryAfterMs <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144269") ? retryAfterMs >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144268") ? true : (stryCov_9fa48("144268", "144269", "144270"), retryAfterMs > UNIFIED_REBALANCER_LITERAL.ZERO)))) ? Math.floor(retryAfterMs) : UNIFIED_REBALANCER_LITERAL.ZERO));
        }
      }
      if (stryMutAct_9fa48("144273") ? Number.isFinite(retryAfterMs) || retryAfterMs > UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144272") ? false : stryMutAct_9fa48("144271") ? true : (stryCov_9fa48("144271", "144272", "144273"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("144276") ? retryAfterMs <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144275") ? retryAfterMs >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144274") ? true : (stryCov_9fa48("144274", "144275", "144276"), retryAfterMs > UNIFIED_REBALANCER_LITERAL.ZERO)))) {
        if (stryMutAct_9fa48("144277")) {
          {}
        } else {
          stryCov_9fa48("144277");
          return stryMutAct_9fa48("144278") ? Math.min(UNIFIED_REBALANCER_LITERAL.THOUSAND, Math.floor(retryAfterMs)) : (stryCov_9fa48("144278"), Math.max(UNIFIED_REBALANCER_LITERAL.THOUSAND, Math.floor(retryAfterMs)));
        }
      }
      return this.increaseCurrentInterval(UNIFIED_REBALANCER_LITERAL.ONE_POINT_FIVE);
    }
  }

  /**
   * Keep periodic reconciliation alive after retryable control-plane failures
   * so one transient scheduling/persist error cannot strand recovery until an
   * unrelated CDC event arrives.
   * @param {*} error
   * @return {boolean}
   * @private
   */
  handleRetryableCheckRebalanceFailure(error) {
    if (stryMutAct_9fa48("144279")) {
      {}
    } else {
      stryCov_9fa48("144279");
      if (stryMutAct_9fa48("144282") ? false : stryMutAct_9fa48("144281") ? true : stryMutAct_9fa48("144280") ? isRetryableControlPlaneError(error) : (stryCov_9fa48("144280", "144281", "144282"), !isRetryableControlPlaneError(error))) {
        if (stryMutAct_9fa48("144283")) {
          {}
        } else {
          stryCov_9fa48("144283");
          return stryMutAct_9fa48("144284") ? true : (stryCov_9fa48("144284"), false);
        }
      }
      if (stryMutAct_9fa48("144286") ? false : stryMutAct_9fa48("144285") ? true : (stryCov_9fa48("144285", "144286"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("144287")) {
          {}
        } else {
          stryCov_9fa48("144287");
          return stryMutAct_9fa48("144288") ? false : (stryCov_9fa48("144288"), true);
        }
      }
      this.scheduleNextCheck(this.getRetryableFailureRetryDelayMs(error));
      return stryMutAct_9fa48("144289") ? false : (stryCov_9fa48("144289"), true);
    }
  }

  /**
   * Evaluate cluster readiness gating before the first planning pass.
   * Returns one deferred-check closure when rebalance planning must wait.
   * @return {{apply: Function}|null}
   * @private
   */
  evaluateClusterReadinessBlocker() {
    if (stryMutAct_9fa48("144290")) {
      {}
    } else {
      stryCov_9fa48("144290");
      if (stryMutAct_9fa48("144292") ? false : stryMutAct_9fa48("144291") ? true : (stryCov_9fa48("144291", "144292"), this.clusterReadinessConfirmed)) {
        if (stryMutAct_9fa48("144293")) {
          {}
        } else {
          stryCov_9fa48("144293");
          return null;
        }
      }
      const now = Date.now();
      if (stryMutAct_9fa48("144296") ? this.clusterReadinessStartMs !== null : stryMutAct_9fa48("144295") ? false : stryMutAct_9fa48("144294") ? true : (stryCov_9fa48("144294", "144295", "144296"), this.clusterReadinessStartMs === null)) {
        if (stryMutAct_9fa48("144297")) {
          {}
        } else {
          stryCov_9fa48("144297");
          this.clusterReadinessStartMs = now;
        }
      }
      const result = this.clusterReadinessSignal.evaluate(stryMutAct_9fa48("144298") ? {} : (stryCov_9fa48("144298"), {
        partitionServices: new Map(),
        messageGroupServices: new Map(),
        cdcSubscriptionsActive: stryMutAct_9fa48("144299") ? false : (stryCov_9fa48("144299"), true)
      }));
      if (stryMutAct_9fa48("144301") ? false : stryMutAct_9fa48("144300") ? true : (stryCov_9fa48("144300", "144301"), result.ready)) {
        if (stryMutAct_9fa48("144302")) {
          {}
        } else {
          stryCov_9fa48("144302");
          this.clusterReadinessConfirmed = stryMutAct_9fa48("144303") ? false : (stryCov_9fa48("144303"), true);
          this.logger.info(REBALANCER_LOG_MSG.CLUSTER_READINESS_CONFIRMED, stryMutAct_9fa48("144304") ? {} : (stryCov_9fa48("144304"), {
            entityId: this.entityId
          }));
          return null;
        }
      }
      const elapsed = stryMutAct_9fa48("144305") ? now + this.clusterReadinessStartMs : (stryCov_9fa48("144305"), now - this.clusterReadinessStartMs);
      if (stryMutAct_9fa48("144309") ? elapsed < this.clusterReadinessTimeoutMs : stryMutAct_9fa48("144308") ? elapsed > this.clusterReadinessTimeoutMs : stryMutAct_9fa48("144307") ? false : stryMutAct_9fa48("144306") ? true : (stryCov_9fa48("144306", "144307", "144308", "144309"), elapsed >= this.clusterReadinessTimeoutMs)) {
        if (stryMutAct_9fa48("144310")) {
          {}
        } else {
          stryCov_9fa48("144310");
          this.clusterReadinessConfirmed = stryMutAct_9fa48("144311") ? false : (stryCov_9fa48("144311"), true);
          this.logger.warn(REBALANCER_LOG_MSG.CLUSTER_READINESS_TIMEOUT, stryMutAct_9fa48("144312") ? {} : (stryCov_9fa48("144312"), {
            entityId: this.entityId,
            elapsedMs: elapsed,
            unmetConditions: result.unmetConditions
          }));
          return null;
        }
      }
      return stryMutAct_9fa48("144313") ? {} : (stryCov_9fa48("144313"), {
        apply: () => {
          if (stryMutAct_9fa48("144314")) {
            {}
          } else {
            stryCov_9fa48("144314");
            this.logger.info(REBALANCER_LOG_MSG.CLUSTER_NOT_READY, stryMutAct_9fa48("144315") ? {} : (stryCov_9fa48("144315"), {
              entityId: this.entityId,
              unmetConditions: result.unmetConditions
            }));
            this.schedulePriorityAwareCheck();
          }
        }
      });
    }
  }

  /**
   * Evaluate startup and readiness gates before running one rebalance pass.
   * Returns one deferred-check closure when planning must wait.
   * @return {Promise<{apply: Function}|null>}
   * @private
   */
  async getCheckRebalanceBlocker() {
    if (stryMutAct_9fa48("144316")) {
      {}
    } else {
      stryCov_9fa48("144316");
      const clusterReadinessBlocker = this.evaluateClusterReadinessBlocker();
      if (stryMutAct_9fa48("144318") ? false : stryMutAct_9fa48("144317") ? true : (stryCov_9fa48("144317", "144318"), clusterReadinessBlocker)) {
        if (stryMutAct_9fa48("144319")) {
          {}
        } else {
          stryCov_9fa48("144319");
          return clusterReadinessBlocker;
        }
      }
      const timeUntilRebalanceEligibleMs = this.getTimeUntilRebalanceStartEligible();
      if (stryMutAct_9fa48("144323") ? timeUntilRebalanceEligibleMs <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144322") ? timeUntilRebalanceEligibleMs >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144321") ? false : stryMutAct_9fa48("144320") ? true : (stryCov_9fa48("144320", "144321", "144322", "144323"), timeUntilRebalanceEligibleMs > UNIFIED_REBALANCER_LITERAL.ZERO)) {
        if (stryMutAct_9fa48("144324")) {
          {}
        } else {
          stryCov_9fa48("144324");
          return stryMutAct_9fa48("144325") ? {} : (stryCov_9fa48("144325"), {
            apply: () => {
              if (stryMutAct_9fa48("144326")) {
                {}
              } else {
                stryCov_9fa48("144326");
                this.logger.debug(REBALANCER_LOG_MSG.WAIT_START_DELAY, stryMutAct_9fa48("144327") ? {} : (stryCov_9fa48("144327"), {
                  entityId: this.entityId,
                  entityType: this.entityType,
                  remainingMs: timeUntilRebalanceEligibleMs,
                  isSystemPartition: this.isSystemPartitionEntity()
                }));
                this.scheduleNextCheck(timeUntilRebalanceEligibleMs);
              }
            }
          });
        }
      }
      if (stryMutAct_9fa48("144330") ? false : stryMutAct_9fa48("144329") ? true : stryMutAct_9fa48("144328") ? this.isStabilized() : (stryCov_9fa48("144328", "144329", "144330"), !this.isStabilized())) {
        if (stryMutAct_9fa48("144331")) {
          {}
        } else {
          stryCov_9fa48("144331");
          return stryMutAct_9fa48("144332") ? {} : (stryCov_9fa48("144332"), {
            apply: () => {
              if (stryMutAct_9fa48("144333")) {
                {}
              } else {
                stryCov_9fa48("144333");
                this.logger.debug(REBALANCER_LOG_MSG.WAIT_STABILIZATION, stryMutAct_9fa48("144334") ? {} : (stryCov_9fa48("144334"), {
                  entityId: this.entityId,
                  timeUntilStabilized: this.getTimeUntilStabilized()
                }));
                this.schedulePriorityAwareCheck();
              }
            }
          });
        }
      }
      const topologySettlingBlocker = await this.revalidateCriticalSystemTopologySettlingBlocker(this.getCriticalSystemTopologySettlingBlocker());
      if (stryMutAct_9fa48("144336") ? false : stryMutAct_9fa48("144335") ? true : (stryCov_9fa48("144335", "144336"), topologySettlingBlocker)) {
        if (stryMutAct_9fa48("144337")) {
          {}
        } else {
          stryCov_9fa48("144337");
          const scheduleDelayMs = this.increaseCurrentInterval(1.25);
          const delayMs = this.getPriorityAwareDelayMs(scheduleDelayMs);
          return stryMutAct_9fa48("144338") ? {} : (stryCov_9fa48("144338"), {
            apply: () => {
              if (stryMutAct_9fa48("144339")) {
                {}
              } else {
                stryCov_9fa48("144339");
                this.logger.info(REBALANCER_LOG_MSG.WAIT_TOPOLOGY_SETTLING, stryMutAct_9fa48("144340") ? {} : (stryCov_9fa48("144340"), {
                  entityId: this.entityId,
                  entityType: this.entityType,
                  delayMs,
                  blockerReason: stryMutAct_9fa48("144343") ? topologySettlingBlocker.reason && null : stryMutAct_9fa48("144342") ? false : stryMutAct_9fa48("144341") ? true : (stryCov_9fa48("144341", "144342", "144343"), topologySettlingBlocker.reason || null),
                  unreadyNodeIds: Array.isArray(topologySettlingBlocker.unreadyNodeIds) ? stryMutAct_9fa48("144344") ? [] : (stryCov_9fa48("144344"), [...topologySettlingBlocker.unreadyNodeIds]) : stryMutAct_9fa48("144345") ? ["Stryker was here"] : (stryCov_9fa48("144345"), []),
                  missingNodeEndpointNodeIds: Array.isArray(topologySettlingBlocker.missingNodeEndpointNodeIds) ? stryMutAct_9fa48("144346") ? [] : (stryCov_9fa48("144346"), [...topologySettlingBlocker.missingNodeEndpointNodeIds]) : stryMutAct_9fa48("144347") ? ["Stryker was here"] : (stryCov_9fa48("144347"), []),
                  missingPostgresWireNodeIds: Array.isArray(topologySettlingBlocker.missingPostgresWireNodeIds) ? stryMutAct_9fa48("144348") ? [] : (stryCov_9fa48("144348"), [...topologySettlingBlocker.missingPostgresWireNodeIds]) : stryMutAct_9fa48("144349") ? ["Stryker was here"] : (stryCov_9fa48("144349"), []),
                  endpointReadyNodeCount: Number.isFinite(topologySettlingBlocker.endpointReadyNodeCount) ? topologySettlingBlocker.endpointReadyNodeCount : null,
                  requiredReadyNodeCount: Number.isFinite(topologySettlingBlocker.requiredReadyNodeCount) ? topologySettlingBlocker.requiredReadyNodeCount : null,
                  inFlightReplicaOperations: Number.isFinite(topologySettlingBlocker.inFlightReplicaOperations) ? topologySettlingBlocker.inFlightReplicaOperations : null,
                  inFlightReplicaOperationsSource: stryMutAct_9fa48("144352") ? topologySettlingBlocker.inFlightReplicaOperationsSource && null : stryMutAct_9fa48("144351") ? false : stryMutAct_9fa48("144350") ? true : (stryCov_9fa48("144350", "144351", "144352"), topologySettlingBlocker.inFlightReplicaOperationsSource || null)
                }));
                this.schedulePriorityAwareCheck(scheduleDelayMs);
              }
            }
          });
        }
      }
      const trafficReadinessBlocker = this.getCriticalSystemTrafficReadinessBlocker();
      if (stryMutAct_9fa48("144354") ? false : stryMutAct_9fa48("144353") ? true : (stryCov_9fa48("144353", "144354"), trafficReadinessBlocker)) {
        if (stryMutAct_9fa48("144355")) {
          {}
        } else {
          stryCov_9fa48("144355");
          const scheduleDelayMs = this.increaseCurrentInterval(1.25);
          const delayMs = this.getPriorityAwareDelayMs(scheduleDelayMs);
          return stryMutAct_9fa48("144356") ? {} : (stryCov_9fa48("144356"), {
            apply: () => {
              if (stryMutAct_9fa48("144357")) {
                {}
              } else {
                stryCov_9fa48("144357");
                this.logger.info(REBALANCER_LOG_MSG.WAIT_TRAFFIC_READY, stryMutAct_9fa48("144358") ? {} : (stryCov_9fa48("144358"), {
                  entityId: this.entityId,
                  entityType: this.entityType,
                  nodeId: this.nodeId,
                  delayMs,
                  readinessPhase: stryMutAct_9fa48("144361") ? trafficReadinessBlocker.phase && null : stryMutAct_9fa48("144360") ? false : stryMutAct_9fa48("144359") ? true : (stryCov_9fa48("144359", "144360", "144361"), trafficReadinessBlocker.phase || null),
                  readinessReady: stryMutAct_9fa48("144364") ? trafficReadinessBlocker.ready !== true : stryMutAct_9fa48("144363") ? false : stryMutAct_9fa48("144362") ? true : (stryCov_9fa48("144362", "144363", "144364"), trafficReadinessBlocker.ready === (stryMutAct_9fa48("144365") ? false : (stryCov_9fa48("144365"), true))),
                  reasonCodes: Array.isArray(trafficReadinessBlocker.reasons) ? stryMutAct_9fa48("144366") ? [] : (stryCov_9fa48("144366"), [...trafficReadinessBlocker.reasons]) : stryMutAct_9fa48("144367") ? ["Stryker was here"] : (stryCov_9fa48("144367"), []),
                  stableElapsedMs: Number.isFinite(trafficReadinessBlocker.stableElapsedMs) ? trafficReadinessBlocker.stableElapsedMs : null,
                  stableWindowMs: Number.isFinite(trafficReadinessBlocker.stableWindowMs) ? trafficReadinessBlocker.stableWindowMs : null
                }));
                this.schedulePriorityAwareCheck(scheduleDelayMs);
              }
            }
          });
        }
      }
      const localServeReadinessBlocker = this.getCriticalSystemLocalServeReadinessBlocker();
      if (stryMutAct_9fa48("144369") ? false : stryMutAct_9fa48("144368") ? true : (stryCov_9fa48("144368", "144369"), localServeReadinessBlocker)) {
        if (stryMutAct_9fa48("144370")) {
          {}
        } else {
          stryCov_9fa48("144370");
          const scheduleDelayMs = this.increaseCurrentInterval(1.25);
          const delayMs = this.getPriorityAwareDelayMs(scheduleDelayMs);
          return stryMutAct_9fa48("144371") ? {} : (stryCov_9fa48("144371"), {
            apply: () => {
              if (stryMutAct_9fa48("144372")) {
                {}
              } else {
                stryCov_9fa48("144372");
                this.logger.info(REBALANCER_LOG_MSG.WAIT_LOCAL_SERVE_READINESS, stryMutAct_9fa48("144373") ? {} : (stryCov_9fa48("144373"), {
                  entityId: this.entityId,
                  entityType: this.entityType,
                  nodeId: this.nodeId,
                  delayMs,
                  reasonCodes: Array.isArray(localServeReadinessBlocker.reasons) ? stryMutAct_9fa48("144374") ? localServeReadinessBlocker.reasons.map(reason => String(reason?.code || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING)) : (stryCov_9fa48("144374"), localServeReadinessBlocker.reasons.map(stryMutAct_9fa48("144375") ? () => undefined : (stryCov_9fa48("144375"), reason => String(stryMutAct_9fa48("144378") ? reason?.code && UNIFIED_REBALANCER_LITERAL.EMPTY_STRING : stryMutAct_9fa48("144377") ? false : stryMutAct_9fa48("144376") ? true : (stryCov_9fa48("144376", "144377", "144378"), (stryMutAct_9fa48("144379") ? reason.code : (stryCov_9fa48("144379"), reason?.code)) || UNIFIED_REBALANCER_LITERAL.EMPTY_STRING)))).filter(Boolean)) : stryMutAct_9fa48("144380") ? ["Stryker was here"] : (stryCov_9fa48("144380"), [])
                }));
                this.schedulePriorityAwareCheck(scheduleDelayMs);
              }
            }
          });
        }
      }
      const localMutationReadinessBlocker = this.getLocalControlPlaneMutationReadinessBlocker();
      if (stryMutAct_9fa48("144382") ? false : stryMutAct_9fa48("144381") ? true : (stryCov_9fa48("144381", "144382"), localMutationReadinessBlocker)) {
        if (stryMutAct_9fa48("144383")) {
          {}
        } else {
          stryCov_9fa48("144383");
          const scheduleDelayMs = this.increaseCurrentInterval(1.25);
          const delayMs = this.getPriorityAwareDelayMs(scheduleDelayMs);
          return stryMutAct_9fa48("144384") ? {} : (stryCov_9fa48("144384"), {
            apply: () => {
              if (stryMutAct_9fa48("144385")) {
                {}
              } else {
                stryCov_9fa48("144385");
                this.logger.info(REBALANCER_LOG_MSG.WAIT_LOCAL_MUTATION_READINESS, stryMutAct_9fa48("144386") ? {} : (stryCov_9fa48("144386"), {
                  entityId: this.entityId,
                  entityType: this.entityType,
                  nodeId: this.nodeId,
                  delayMs,
                  failedDimensions: Array.isArray(localMutationReadinessBlocker.failedDimensions) ? stryMutAct_9fa48("144387") ? [] : (stryCov_9fa48("144387"), [...localMutationReadinessBlocker.failedDimensions]) : stryMutAct_9fa48("144388") ? ["Stryker was here"] : (stryCov_9fa48("144388"), []),
                  reasonCodes: Array.isArray(localMutationReadinessBlocker.reasonCodes) ? stryMutAct_9fa48("144389") ? [] : (stryCov_9fa48("144389"), [...localMutationReadinessBlocker.reasonCodes]) : stryMutAct_9fa48("144390") ? ["Stryker was here"] : (stryCov_9fa48("144390"), [])
                }));
                this.schedulePriorityAwareCheck(scheduleDelayMs);
              }
            }
          });
        }
      }
      const controlPlanePriorityBlocker = this.getControlPlanePrioritySpreadBlocker();
      if (stryMutAct_9fa48("144392") ? false : stryMutAct_9fa48("144391") ? true : (stryCov_9fa48("144391", "144392"), controlPlanePriorityBlocker)) {
        if (stryMutAct_9fa48("144393")) {
          {}
        } else {
          stryCov_9fa48("144393");
          const blockedPartitions = stryMutAct_9fa48("144396") ? controlPlanePriorityBlocker.blockedPartitions && [] : stryMutAct_9fa48("144395") ? false : stryMutAct_9fa48("144394") ? true : (stryCov_9fa48("144394", "144395", "144396"), controlPlanePriorityBlocker.blockedPartitions || (stryMutAct_9fa48("144397") ? ["Stryker was here"] : (stryCov_9fa48("144397"), [])));
          const largestSpreadGap = blockedPartitions.reduce(stryMutAct_9fa48("144398") ? () => undefined : (stryCov_9fa48("144398"), (largestGap, partition) => stryMutAct_9fa48("144399") ? Math.min(largestGap, Number(partition?.spreadGap) || NUM.ZERO) : (stryCov_9fa48("144399"), Math.max(largestGap, stryMutAct_9fa48("144402") ? Number(partition?.spreadGap) && NUM.ZERO : stryMutAct_9fa48("144401") ? false : stryMutAct_9fa48("144400") ? true : (stryCov_9fa48("144400", "144401", "144402"), Number(stryMutAct_9fa48("144403") ? partition.spreadGap : (stryCov_9fa48("144403"), partition?.spreadGap)) || NUM.ZERO)))), NUM.ZERO);
          return stryMutAct_9fa48("144404") ? {} : (stryCov_9fa48("144404"), {
            apply: () => {
              if (stryMutAct_9fa48("144405")) {
                {}
              } else {
                stryCov_9fa48("144405");
                this.logger.info(REBALANCER_LOG_MSG.WAIT_CONTROL_PLANE_PRIORITY, stryMutAct_9fa48("144406") ? {} : (stryCov_9fa48("144406"), {
                  entityId: this.entityId,
                  entityType: this.entityType,
                  delayMs: this.getPriorityRetryDelayMs(),
                  requiredDistinctNodeCount: controlPlanePriorityBlocker.requiredDistinctNodeCount,
                  blockedPartitionCount: blockedPartitions.length,
                  largestSpreadGap,
                  blockedPartitions: blockedPartitions.map(stryMutAct_9fa48("144407") ? () => undefined : (stryCov_9fa48("144407"), partition => stryMutAct_9fa48("144408") ? {} : (stryCov_9fa48("144408"), {
                    partitionId: partition.partitionId,
                    readyReplicaCount: partition.readyReplicaCount,
                    readyDistinctNodeCount: partition.readyDistinctNodeCount,
                    spreadGap: partition.spreadGap
                  })))
                }));
                this.scheduleNextCheck(this.getPriorityRetryDelayMs());
              }
            }
          });
        }
      }
      const transportPressure = this.getTransportPressureSummary();
      if (stryMutAct_9fa48("144411") ? transportPressure?.backpressured !== true : stryMutAct_9fa48("144410") ? false : stryMutAct_9fa48("144409") ? true : (stryCov_9fa48("144409", "144410", "144411"), (stryMutAct_9fa48("144412") ? transportPressure.backpressured : (stryCov_9fa48("144412"), transportPressure?.backpressured)) === (stryMutAct_9fa48("144413") ? false : (stryCov_9fa48("144413"), true)))) {
        if (stryMutAct_9fa48("144414")) {
          {}
        } else {
          stryCov_9fa48("144414");
          const isPriorityPartition = this.isControlPlanePriorityPartition();
          const scheduleDelayMs = isPriorityPartition ? this.currentInterval : this.increaseCurrentInterval(1.5);
          const delayMs = isPriorityPartition ? this.getPriorityRetryDelayMs() : scheduleDelayMs;
          return stryMutAct_9fa48("144415") ? {} : (stryCov_9fa48("144415"), {
            apply: () => {
              if (stryMutAct_9fa48("144416")) {
                {}
              } else {
                stryCov_9fa48("144416");
                this.logger.info(REBALANCER_LOG_MSG.WAIT_TRANSPORT_BACKPRESSURE, stryMutAct_9fa48("144417") ? {} : (stryCov_9fa48("144417"), {
                  entityId: this.entityId,
                  entityType: this.entityType,
                  saturatedNodeCount: transportPressure.saturatedNodeCount,
                  totalPending: transportPressure.totalPending,
                  maxPendingUtilization: transportPressure.maxPendingUtilization,
                  delayMs
                }));
                this.schedulePriorityAwareCheck(scheduleDelayMs);
              }
            }
          });
        }
      }
      return null;
    }
  }

  /**
   * Update rebalance cadence after one evaluation/execution pass.
   * @param {boolean} needsRebalance
   * @return {Promise<boolean>} Whether to force a priority retry cadence.
   * @private
   */
  async advanceCheckCadence(needsRebalance) {
    if (stryMutAct_9fa48("144418")) {
      {}
    } else {
      stryCov_9fa48("144418");
      let forcePriorityRetry = stryMutAct_9fa48("144419") ? true : (stryCov_9fa48("144419"), false);
      if (stryMutAct_9fa48("144421") ? false : stryMutAct_9fa48("144420") ? true : (stryCov_9fa48("144420", "144421"), needsRebalance)) {
        if (stryMutAct_9fa48("144422")) {
          {}
        } else {
          stryCov_9fa48("144422");
          const rebalanceResult = await this.rebalance(TriggerType.PERIODIC);
          const executedMoveCount = this.countExecutedMoves(rebalanceResult);
          if (stryMutAct_9fa48("144426") ? executedMoveCount <= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144425") ? executedMoveCount >= UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144424") ? false : stryMutAct_9fa48("144423") ? true : (stryCov_9fa48("144423", "144424", "144425", "144426"), executedMoveCount > UNIFIED_REBALANCER_LITERAL.ZERO)) {
            if (stryMutAct_9fa48("144427")) {
              {}
            } else {
              stryCov_9fa48("144427");
              this.currentInterval = this.isControlPlanePriorityPartition() ? this.getPriorityRetryDelayMs() : this.periodicCheckIntervalMs;
            }
          } else if (stryMutAct_9fa48("144429") ? false : stryMutAct_9fa48("144428") ? true : (stryCov_9fa48("144428", "144429"), this.isControlPlanePriorityPartition())) {
            if (stryMutAct_9fa48("144430")) {
              {}
            } else {
              stryCov_9fa48("144430");
              this.currentInterval = this.getPriorityRetryDelayMs();
              forcePriorityRetry = stryMutAct_9fa48("144431") ? false : (stryCov_9fa48("144431"), true);
            }
          } else {
            if (stryMutAct_9fa48("144432")) {
              {}
            } else {
              stryCov_9fa48("144432");
              this.increaseCurrentInterval(UNIFIED_REBALANCER_LITERAL.ONE_POINT_FIVE);
            }
          }
          return forcePriorityRetry;
        }
      }
      if (stryMutAct_9fa48("144434") ? false : stryMutAct_9fa48("144433") ? true : (stryCov_9fa48("144433", "144434"), this.isControlPlanePriorityPartition())) {
        if (stryMutAct_9fa48("144435")) {
          {}
        } else {
          stryCov_9fa48("144435");
          this.currentInterval = this.getPriorityRetryDelayMs();
        }
      } else {
        if (stryMutAct_9fa48("144436")) {
          {}
        } else {
          stryCov_9fa48("144436");
          this.increaseCurrentInterval(UNIFIED_REBALANCER_LITERAL.ONE_POINT_FIVE);
        }
      }
      return forcePriorityRetry;
    }
  }

  /**
   * Perform a rebalance check.
   * Requirements: 2.2, 2.3, 2.4
   * @return {Promise<void>}
   */
  async checkRebalance() {
    if (stryMutAct_9fa48("144437")) {
      {}
    } else {
      stryCov_9fa48("144437");
      if (stryMutAct_9fa48("144440") ? !this.isLeader && this.isShuttingDown : stryMutAct_9fa48("144439") ? false : stryMutAct_9fa48("144438") ? true : (stryCov_9fa48("144438", "144439", "144440"), (stryMutAct_9fa48("144441") ? this.isLeader : (stryCov_9fa48("144441"), !this.isLeader)) || this.isShuttingDown)) {
        if (stryMutAct_9fa48("144442")) {
          {}
        } else {
          stryCov_9fa48("144442");
          return;
        }
      }
      let forcePriorityRetry = stryMutAct_9fa48("144443") ? true : (stryCov_9fa48("144443"), false);
      try {
        if (stryMutAct_9fa48("144444")) {
          {}
        } else {
          stryCov_9fa48("144444");
          const blocker = await this.getCheckRebalanceBlocker();
          if (stryMutAct_9fa48("144446") ? false : stryMutAct_9fa48("144445") ? true : (stryCov_9fa48("144445", "144446"), blocker)) {
            if (stryMutAct_9fa48("144447")) {
              {}
            } else {
              stryCov_9fa48("144447");
              blocker.apply();
              return;
            }
          }

          // Re-evaluate state after stabilization (Requirement 2.4)
          const needsRebalance = await this.evaluateState();
          forcePriorityRetry = await this.advanceCheckCadence(needsRebalance);
        }
      } catch (error) {
        if (stryMutAct_9fa48("144448")) {
          {}
        } else {
          stryCov_9fa48("144448");
          this.logger.error(REBALANCER_LOG_MSG.REBALANCE_ERROR, stryMutAct_9fa48("144449") ? {} : (stryCov_9fa48("144449"), {
            entityId: this.entityId,
            error: error.message
          }));
          if (stryMutAct_9fa48("144451") ? false : stryMutAct_9fa48("144450") ? true : (stryCov_9fa48("144450", "144451"), this.handleRetryableCheckRebalanceFailure(error))) {
            if (stryMutAct_9fa48("144452")) {
              {}
            } else {
              stryCov_9fa48("144452");
              return;
            }
          }
          throw error;
        }
      }

      // Schedule next check
      if (stryMutAct_9fa48("144455") ? false : stryMutAct_9fa48("144454") ? true : stryMutAct_9fa48("144453") ? this.isShuttingDown : (stryCov_9fa48("144453", "144454", "144455"), !this.isShuttingDown)) {
        if (stryMutAct_9fa48("144456")) {
          {}
        } else {
          stryCov_9fa48("144456");
          if (stryMutAct_9fa48("144458") ? false : stryMutAct_9fa48("144457") ? true : (stryCov_9fa48("144457", "144458"), forcePriorityRetry)) {
            if (stryMutAct_9fa48("144459")) {
              {}
            } else {
              stryCov_9fa48("144459");
              this.scheduleNextCheck(this.getPriorityRetryDelayMs());
            }
          } else {
            if (stryMutAct_9fa48("144460")) {
              {}
            } else {
              stryCov_9fa48("144460");
              this.scheduleNextCheck();
            }
          }
        }
      }
    }
  }

  /**
   * Return the local router's outbound pressure summary when available.
   * @return {Object|null}
   * @private
   */
  getTransportPressureSummary() {
    if (stryMutAct_9fa48("144461")) {
      {}
    } else {
      stryCov_9fa48("144461");
      return PressureGovernor.getShared(stryMutAct_9fa48("144462") ? {} : (stryCov_9fa48("144462"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter
      })).getPressureSummary(stryMutAct_9fa48("144463") ? [] : (stryCov_9fa48("144463"), [UNIFIED_REBALANCER_LITERAL.REBALANCER_COLON_SCHEDULE]));
    }
  }

  /**
   * Count moves that actually scheduled work (not skipped/deferred).
   * @param {Object} rebalanceResult - Result from rebalance().
   * @return {number} Number of actionable moves.
   * @private
   */
  countExecutedMoves(rebalanceResult) {
    if (stryMutAct_9fa48("144464")) {
      {}
    } else {
      stryCov_9fa48("144464");
      if (stryMutAct_9fa48("144467") ? !rebalanceResult && !Array.isArray(rebalanceResult.moves) : stryMutAct_9fa48("144466") ? false : stryMutAct_9fa48("144465") ? true : (stryCov_9fa48("144465", "144466", "144467"), (stryMutAct_9fa48("144468") ? rebalanceResult : (stryCov_9fa48("144468"), !rebalanceResult)) || (stryMutAct_9fa48("144469") ? Array.isArray(rebalanceResult.moves) : (stryCov_9fa48("144469"), !Array.isArray(rebalanceResult.moves))))) {
        if (stryMutAct_9fa48("144470")) {
          {}
        } else {
          stryCov_9fa48("144470");
          return UNIFIED_REBALANCER_LITERAL.ZERO;
        }
      }
      return stryMutAct_9fa48("144471") ? rebalanceResult.moves.length : (stryCov_9fa48("144471"), rebalanceResult.moves.filter(move => {
        if (stryMutAct_9fa48("144472")) {
          {}
        } else {
          stryCov_9fa48("144472");
          if (stryMutAct_9fa48("144475") ? !move && move.skipped : stryMutAct_9fa48("144474") ? false : stryMutAct_9fa48("144473") ? true : (stryCov_9fa48("144473", "144474", "144475"), (stryMutAct_9fa48("144476") ? move : (stryCov_9fa48("144476"), !move)) || move.skipped)) {
            if (stryMutAct_9fa48("144477")) {
              {}
            } else {
              stryCov_9fa48("144477");
              return stryMutAct_9fa48("144478") ? true : (stryCov_9fa48("144478"), false);
            }
          }
          return stryMutAct_9fa48("144481") ? move.success === false : stryMutAct_9fa48("144480") ? false : stryMutAct_9fa48("144479") ? true : (stryCov_9fa48("144479", "144480", "144481"), move.success !== (stryMutAct_9fa48("144482") ? true : (stryCov_9fa48("144482"), false)));
        }
      }).length);
    }
  }

  /**
   * Evaluate if rebalancing is needed.
   * @return {Promise<boolean>} True if rebalancing is needed.
   */
  async evaluateState() {
    if (stryMutAct_9fa48("144483")) {
      {}
    } else {
      stryCov_9fa48("144483");
      const currentReplicas = this.getCurrentReplicas();
      const policy = await this.getPolicy();
      const availableNodes = this.getAvailableNodes();
      const assessment = this.movePlanner.assessState(currentReplicas, policy, availableNodes);
      const {
        actionableTarget,
        critical,
        criticalReason,
        desiredTarget,
        healthyReplicas,
        suboptimal
      } = assessment;
      this.logger.debug(REBALANCER_LOG_MSG.EVALUATING_STATE, stryMutAct_9fa48("144484") ? {} : (stryCov_9fa48("144484"), {
        entityId: this.entityId,
        entityType: this.entityType,
        currentReplicaCount: currentReplicas.length,
        availableNodeCount: availableNodes.length,
        hasCache: stryMutAct_9fa48("144485") ? !this.systemTableCache : (stryCov_9fa48("144485"), !(stryMutAct_9fa48("144486") ? this.systemTableCache : (stryCov_9fa48("144486"), !this.systemTableCache))),
        targetReplicaCount: desiredTarget,
        actionableTargetReplicaCount: actionableTarget
      }));

      // Skip rebalancing if cache appears unpopulated (no nodes known)
      // This prevents newly joined nodes from making incorrect decisions
      // before their cache is synchronized with the cluster state
      if (stryMutAct_9fa48("144489") ? availableNodes.length !== UNIFIED_REBALANCER_LITERAL.ZERO : stryMutAct_9fa48("144488") ? false : stryMutAct_9fa48("144487") ? true : (stryCov_9fa48("144487", "144488", "144489"), availableNodes.length === UNIFIED_REBALANCER_LITERAL.ZERO)) {
        if (stryMutAct_9fa48("144490")) {
          {}
        } else {
          stryCov_9fa48("144490");
          this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, stryMutAct_9fa48("144491") ? {} : (stryCov_9fa48("144491"), {
            entityId: this.entityId,
            entityType: this.entityType
          }));
          this.lastSuboptimalSignal = null;
          return stryMutAct_9fa48("144492") ? true : (stryCov_9fa48("144492"), false);
        }
      }
      if (stryMutAct_9fa48("144495") ? availableNodes.length < desiredTarget || healthyReplicas.length >= actionableTarget : stryMutAct_9fa48("144494") ? false : stryMutAct_9fa48("144493") ? true : (stryCov_9fa48("144493", "144494", "144495"), (stryMutAct_9fa48("144498") ? availableNodes.length >= desiredTarget : stryMutAct_9fa48("144497") ? availableNodes.length <= desiredTarget : stryMutAct_9fa48("144496") ? true : (stryCov_9fa48("144496", "144497", "144498"), availableNodes.length < desiredTarget)) && (stryMutAct_9fa48("144501") ? healthyReplicas.length < actionableTarget : stryMutAct_9fa48("144500") ? healthyReplicas.length > actionableTarget : stryMutAct_9fa48("144499") ? true : (stryCov_9fa48("144499", "144500", "144501"), healthyReplicas.length >= actionableTarget)))) {
        if (stryMutAct_9fa48("144502")) {
          {}
        } else {
          stryCov_9fa48("144502");
          const degradedSignal = this.buildDegradedTargetSignal(availableNodes, desiredTarget, actionableTarget, healthyReplicas.length);
          if (stryMutAct_9fa48("144505") ? this.lastDegradedTargetSignal === degradedSignal : stryMutAct_9fa48("144504") ? false : stryMutAct_9fa48("144503") ? true : (stryCov_9fa48("144503", "144504", "144505"), this.lastDegradedTargetSignal !== degradedSignal)) {
            if (stryMutAct_9fa48("144506")) {
              {}
            } else {
              stryCov_9fa48("144506");
              this.lastDegradedTargetSignal = degradedSignal;
              this.logger.info(REBALANCER_LOG_MSG.DEGRADED_TARGET, stryMutAct_9fa48("144507") ? {} : (stryCov_9fa48("144507"), {
                entityId: this.entityId,
                entityType: this.entityType,
                availableNodeCount: availableNodes.length,
                desiredTargetReplicaCount: desiredTarget,
                actionableTargetReplicaCount: actionableTarget,
                healthyReplicaCount: healthyReplicas.length
              }));
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("144508")) {
          {}
        } else {
          stryCov_9fa48("144508");
          this.lastDegradedTargetSignal = null;
        }
      }

      // Critical checks - trigger immediate rebalancing
      if (stryMutAct_9fa48("144510") ? false : stryMutAct_9fa48("144509") ? true : (stryCov_9fa48("144509", "144510"), critical)) {
        if (stryMutAct_9fa48("144511")) {
          {}
        } else {
          stryCov_9fa48("144511");
          this.lastSuboptimalSignal = null;
          this.logger.warn(REBALANCER_LOG_MSG.CRITICAL_STATE, stryMutAct_9fa48("144512") ? {} : (stryCov_9fa48("144512"), {
            entityId: this.entityId,
            entityType: this.entityType,
            reason: criticalReason
          }));
          return stryMutAct_9fa48("144513") ? false : (stryCov_9fa48("144513"), true);
        }
      }

      // Opportunistic checks - can wait for periodic schedule
      if (stryMutAct_9fa48("144515") ? false : stryMutAct_9fa48("144514") ? true : (stryCov_9fa48("144514", "144515"), suboptimal)) {
        if (stryMutAct_9fa48("144516")) {
          {}
        } else {
          stryCov_9fa48("144516");
          const suboptimalSignal = this.buildSuboptimalSignal(availableNodes, desiredTarget, actionableTarget, healthyReplicas.length);
          if (stryMutAct_9fa48("144519") ? this.lastSuboptimalSignal === suboptimalSignal : stryMutAct_9fa48("144518") ? false : stryMutAct_9fa48("144517") ? true : (stryCov_9fa48("144517", "144518", "144519"), this.lastSuboptimalSignal !== suboptimalSignal)) {
            if (stryMutAct_9fa48("144520")) {
              {}
            } else {
              stryCov_9fa48("144520");
              this.lastSuboptimalSignal = suboptimalSignal;
              this.logger.info(REBALANCER_LOG_MSG.SUBOPTIMAL_STATE, stryMutAct_9fa48("144521") ? {} : (stryCov_9fa48("144521"), {
                entityId: this.entityId,
                entityType: this.entityType,
                availableNodeCount: availableNodes.length,
                desiredTargetReplicaCount: desiredTarget,
                actionableTargetReplicaCount: actionableTarget,
                healthyReplicaCount: healthyReplicas.length
              }));
            }
          }
          return stryMutAct_9fa48("144522") ? false : (stryCov_9fa48("144522"), true);
        }
      }
      this.lastSuboptimalSignal = null;
      return stryMutAct_9fa48("144523") ? true : (stryCov_9fa48("144523"), false);
    }
  }

  /**
   * Build a stable signal for degraded-target logging dedupe.
   * @param {Array<Object>} availableNodes - Ready nodes currently visible.
   * @param {number} desiredTarget - Policy target replica count.
   * @param {number} actionableTarget - Target constrained by ready topology.
   * @param {number} healthyReplicaCount - Current healthy replica count.
   * @return {string} Stable topology signal.
   * @private
   */
  buildDegradedTargetSignal(availableNodes, desiredTarget, actionableTarget, healthyReplicaCount) {
    if (stryMutAct_9fa48("144524")) {
      {}
    } else {
      stryCov_9fa48("144524");
      const nodeSignature = stryMutAct_9fa48("144526") ? availableNodes.map(node => node?.node_id || node?.id || '').sort().join(',') : stryMutAct_9fa48("144525") ? availableNodes.map(node => node?.node_id || node?.id || '').filter(Boolean).join(',') : (stryCov_9fa48("144525", "144526"), availableNodes.map(stryMutAct_9fa48("144527") ? () => undefined : (stryCov_9fa48("144527"), node => stryMutAct_9fa48("144530") ? (node?.node_id || node?.id) && '' : stryMutAct_9fa48("144529") ? false : stryMutAct_9fa48("144528") ? true : (stryCov_9fa48("144528", "144529", "144530"), (stryMutAct_9fa48("144532") ? node?.node_id && node?.id : stryMutAct_9fa48("144531") ? false : (stryCov_9fa48("144531", "144532"), (stryMutAct_9fa48("144533") ? node.node_id : (stryCov_9fa48("144533"), node?.node_id)) || (stryMutAct_9fa48("144534") ? node.id : (stryCov_9fa48("144534"), node?.id)))) || (stryMutAct_9fa48("144535") ? "Stryker was here!" : (stryCov_9fa48("144535"), ''))))).filter(Boolean).sort().join(stryMutAct_9fa48("144536") ? "" : (stryCov_9fa48("144536"), ',')));
      return (stryMutAct_9fa48("144537") ? `` : (stryCov_9fa48("144537"), `${nodeSignature}|${desiredTarget}|${actionableTarget}|`)) + (stryMutAct_9fa48("144538") ? `` : (stryCov_9fa48("144538"), `${healthyReplicaCount}`));
    }
  }

  /**
   * Build a stable signal for suboptimal-state logging dedupe.
   * @param {Array<Object>} availableNodes - Ready nodes currently visible.
   * @param {number} desiredTarget - Policy target replica count.
   * @param {number} actionableTarget - Target constrained by ready topology.
   * @param {number} healthyReplicaCount - Current healthy replica count.
   * @return {string} Stable suboptimal-state signal.
   * @private
   */
  buildSuboptimalSignal(availableNodes, desiredTarget, actionableTarget, healthyReplicaCount) {
    if (stryMutAct_9fa48("144539")) {
      {}
    } else {
      stryCov_9fa48("144539");
      const nodeSignature = stryMutAct_9fa48("144541") ? availableNodes.map(node => node?.node_id || node?.id || '').sort().join(',') : stryMutAct_9fa48("144540") ? availableNodes.map(node => node?.node_id || node?.id || '').filter(Boolean).join(',') : (stryCov_9fa48("144540", "144541"), availableNodes.map(stryMutAct_9fa48("144542") ? () => undefined : (stryCov_9fa48("144542"), node => stryMutAct_9fa48("144545") ? (node?.node_id || node?.id) && '' : stryMutAct_9fa48("144544") ? false : stryMutAct_9fa48("144543") ? true : (stryCov_9fa48("144543", "144544", "144545"), (stryMutAct_9fa48("144547") ? node?.node_id && node?.id : stryMutAct_9fa48("144546") ? false : (stryCov_9fa48("144546", "144547"), (stryMutAct_9fa48("144548") ? node.node_id : (stryCov_9fa48("144548"), node?.node_id)) || (stryMutAct_9fa48("144549") ? node.id : (stryCov_9fa48("144549"), node?.id)))) || (stryMutAct_9fa48("144550") ? "Stryker was here!" : (stryCov_9fa48("144550"), ''))))).filter(Boolean).sort().join(stryMutAct_9fa48("144551") ? "" : (stryCov_9fa48("144551"), ',')));
      return (stryMutAct_9fa48("144552") ? `` : (stryCov_9fa48("144552"), `${nodeSignature}|${desiredTarget}|${actionableTarget}|`)) + (stryMutAct_9fa48("144553") ? `` : (stryCov_9fa48("144553"), `${healthyReplicaCount}`));
    }
  }

  /**
   * Check if current state is critical (requires immediate action).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is critical.
   */
  isCriticalState(replicas, policy, availableNodes = null) {
    if (stryMutAct_9fa48("144554")) {
      {}
    } else {
      stryCov_9fa48("144554");
      return this.movePlanner.isCriticalState(replicas, policy, availableNodes);
    }
  }

  /**
   * Get the reason for critical state.
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {string} Reason description.
   */
  getCriticalReason(replicas, policy, availableNodes = null) {
    if (stryMutAct_9fa48("144555")) {
      {}
    } else {
      stryCov_9fa48("144555");
      return this.movePlanner.getCriticalReason(replicas, policy, availableNodes);
    }
  }

  /**
   * Check if current state is suboptimal (can be improved).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is suboptimal.
   */
  isSuboptimalState(replicas, policy, availableNodes = null) {
    if (stryMutAct_9fa48("144556")) {
      {}
    } else {
      stryCov_9fa48("144556");
      return this.movePlanner.isSuboptimalState(replicas, policy, availableNodes);
    }
  }

  /**
   * Check if multiple replicas are on the same node.
   * @param {Array<Object>} replicas - Replicas to check.
   * @return {boolean} True if duplicates exist.
   */
  hasMultipleReplicasOnSameNode(replicas) {
    if (stryMutAct_9fa48("144557")) {
      {}
    } else {
      stryCov_9fa48("144557");
      return this.movePlanner.hasMultipleReplicasOnSameNode(replicas);
    }
  }

  /**
   * Get nodes that don't have a local replica.
   * @param {Array<Object>} replicas - Current replicas.
   * @return {Array<string>} Node IDs without local replicas.
   */
  getNodesWithoutLocalReplica(replicas) {
    if (stryMutAct_9fa48("144558")) {
      {}
    } else {
      stryCov_9fa48("144558");
      return this.movePlanner.getNodesWithoutLocalReplica(replicas);
    }
  }

  /**
   * Trigger immediate check (called by CDC event handlers).
   * @param {string} reason - Reason for immediate check.
   */
  triggerImmediateCheck(reason) {
    if (stryMutAct_9fa48("144559")) {
      {}
    } else {
      stryCov_9fa48("144559");
      if (stryMutAct_9fa48("144562") ? !this.isLeader && this.isShuttingDown : stryMutAct_9fa48("144561") ? false : stryMutAct_9fa48("144560") ? true : (stryCov_9fa48("144560", "144561", "144562"), (stryMutAct_9fa48("144563") ? this.isLeader : (stryCov_9fa48("144563"), !this.isLeader)) || this.isShuttingDown)) {
        if (stryMutAct_9fa48("144564")) {
          {}
        } else {
          stryCov_9fa48("144564");
          return;
        }
      }
      this.logger.info(REBALANCER_LOG_MSG.IMMEDIATE_TRIGGER, stryMutAct_9fa48("144565") ? {} : (stryCov_9fa48("144565"), {
        entityId: this.entityId,
        entityType: this.entityType,
        reason
      }));
      const reconcileReason = this.mapTriggerReason(reason);
      this.enqueueRebalanceCheck(reconcileReason);
    }
  }

  /**
   * Map a trigger reason string to a typed RECONCILE_REASON constant.
   * @param {string} reason - The trigger reason.
   * @return {string} A RECONCILE_REASON constant.
   * @private
   */
  mapTriggerReason(reason) {
    if (stryMutAct_9fa48("144566")) {
      {}
    } else {
      stryCov_9fa48("144566");
      switch (reason) {
        case REBALANCER_RUNTIME_REASON.NODE_BECAME_READY:
          if (stryMutAct_9fa48("144567")) {} else {
            stryCov_9fa48("144567");
            return RECONCILE_REASON.NODE_BECAME_READY;
          }
        case REBALANCER_RUNTIME_REASON.NODE_LEFT_READY:
          if (stryMutAct_9fa48("144568")) {} else {
            stryCov_9fa48("144568");
            return RECONCILE_REASON.NODE_LEFT_READY;
          }
        case REBALANCER_RUNTIME_REASON.NODE_FAILED:
          if (stryMutAct_9fa48("144569")) {} else {
            stryCov_9fa48("144569");
            return RECONCILE_REASON.NODE_FAILED;
          }
        default:
          if (stryMutAct_9fa48("144570")) {} else {
            stryCov_9fa48("144570");
            return RECONCILE_REASON.PERIODIC_CHECK;
          }
      }
    }
  }

  /**
   * Reconcile callback for the rebalance check queue.
   * Cancels any pending scheduled check and runs checkRebalance.
   * @param {Array<string>} _reasons - Accumulated reason codes.
   * @private
   */
  async reconcileRebalanceCheck(_reasons) {
    if (stryMutAct_9fa48("144571")) {
      {}
    } else {
      stryCov_9fa48("144571");
      this.cancelScheduledCheck();
      this.cancelStabilizationTimer();
      await this.checkRebalance();
    }
  }

  /**
   * Handle node state change notification from CDC.
   * Called by CDCIntegrationService when a node's state changes.
   * Emits 'nodeStateChange' event and optionally 'rebalanceNeeded' event.
   * @param {string} nodeId - The node ID.
   * @param {string} oldState - The previous state.
   * @param {string} newState - The new state.
   */
  onNodeStateChange(nodeId, oldState, newState) {
    if (stryMutAct_9fa48("144572")) {
      {}
    } else {
      stryCov_9fa48("144572");
      // Always emit nodeStateChange event for observability
      this.emit(REBALANCER_EVENT.NODE_STATE_CHANGE, stryMutAct_9fa48("144573") ? {} : (stryCov_9fa48("144573"), {
        nodeId,
        oldState,
        newState,
        timestamp: Date.now()
      }));

      // Non-leaders still emit events but don't trigger rebalancing
      if (stryMutAct_9fa48("144576") ? false : stryMutAct_9fa48("144575") ? true : stryMutAct_9fa48("144574") ? this.isLeader : (stryCov_9fa48("144574", "144575", "144576"), !this.isLeader)) {
        if (stryMutAct_9fa48("144577")) {
          {}
        } else {
          stryCov_9fa48("144577");
          return;
        }
      }
      this.logger.debug(REBALANCER_LOG_MSG.NODE_STATE_CHANGE, stryMutAct_9fa48("144578") ? {} : (stryCov_9fa48("144578"), {
        entityId: this.entityId,
        nodeId,
        oldState,
        newState
      }));
      const rebalanceDecision = this.resolveNodeStateChangeRebalanceDecision(oldState, newState);
      if (stryMutAct_9fa48("144580") ? false : stryMutAct_9fa48("144579") ? true : (stryCov_9fa48("144579", "144580"), rebalanceDecision.needed)) {
        if (stryMutAct_9fa48("144581")) {
          {}
        } else {
          stryCov_9fa48("144581");
          // Record state change to reset stabilization timer
          if (stryMutAct_9fa48("144583") ? false : stryMutAct_9fa48("144582") ? true : (stryCov_9fa48("144582", "144583"), rebalanceDecision.stabilizationTrigger)) {
            if (stryMutAct_9fa48("144584")) {
              {}
            } else {
              stryCov_9fa48("144584");
              this.recordStateChange(rebalanceDecision.stabilizationTrigger);
            }
          }

          // Emit rebalanceNeeded event for observability
          this.emit(REBALANCER_EVENT.REBALANCE_NEEDED, stryMutAct_9fa48("144585") ? {} : (stryCov_9fa48("144585"), {
            nodeId,
            oldState,
            newState,
            reason: rebalanceDecision.reason,
            timestamp: Date.now()
          }));
          this.triggerImmediateCheck(rebalanceDecision.reason);
        }
      }
    }
  }

  /**
   * Resolve one node-state-change rebalance decision.
   * @param {string} oldState
   * @param {string} newState
   * @return {{
   *   needed: boolean,
   *   reason: string|null,
   *   stabilizationTrigger: string|null,
   * }}
   * @private
   */
  resolveNodeStateChangeRebalanceDecision(oldState, newState) {
    if (stryMutAct_9fa48("144586")) {
      {}
    } else {
      stryCov_9fa48("144586");
      if (stryMutAct_9fa48("144589") ? newState !== NodeStatus.FAILED : stryMutAct_9fa48("144588") ? false : stryMutAct_9fa48("144587") ? true : (stryCov_9fa48("144587", "144588", "144589"), newState === NodeStatus.FAILED)) {
        if (stryMutAct_9fa48("144590")) {
          {}
        } else {
          stryCov_9fa48("144590");
          return stryMutAct_9fa48("144591") ? {} : (stryCov_9fa48("144591"), {
            needed: stryMutAct_9fa48("144592") ? false : (stryCov_9fa48("144592"), true),
            reason: REBALANCER_RUNTIME_REASON.NODE_FAILED,
            stabilizationTrigger: STABILIZATION_RESET_TRIGGER.NODE_FAILED
          });
        }
      } else if (stryMutAct_9fa48("144595") ? newState === NodeStatus.ACTIVE || oldState !== NodeStatus.ACTIVE : stryMutAct_9fa48("144594") ? false : stryMutAct_9fa48("144593") ? true : (stryCov_9fa48("144593", "144594", "144595"), (stryMutAct_9fa48("144597") ? newState !== NodeStatus.ACTIVE : stryMutAct_9fa48("144596") ? true : (stryCov_9fa48("144596", "144597"), newState === NodeStatus.ACTIVE)) && (stryMutAct_9fa48("144599") ? oldState === NodeStatus.ACTIVE : stryMutAct_9fa48("144598") ? true : (stryCov_9fa48("144598", "144599"), oldState !== NodeStatus.ACTIVE)))) {
        if (stryMutAct_9fa48("144600")) {
          {}
        } else {
          stryCov_9fa48("144600");
          return stryMutAct_9fa48("144601") ? {} : (stryCov_9fa48("144601"), {
            needed: stryMutAct_9fa48("144602") ? false : (stryCov_9fa48("144602"), true),
            reason: REBALANCER_RUNTIME_REASON.NODE_BECAME_READY,
            stabilizationTrigger: STABILIZATION_RESET_TRIGGER.NODE_JOINED
          });
        }
      } else if (stryMutAct_9fa48("144605") ? oldState === NodeStatus.ACTIVE || newState !== NodeStatus.ACTIVE : stryMutAct_9fa48("144604") ? false : stryMutAct_9fa48("144603") ? true : (stryCov_9fa48("144603", "144604", "144605"), (stryMutAct_9fa48("144607") ? oldState !== NodeStatus.ACTIVE : stryMutAct_9fa48("144606") ? true : (stryCov_9fa48("144606", "144607"), oldState === NodeStatus.ACTIVE)) && (stryMutAct_9fa48("144609") ? newState === NodeStatus.ACTIVE : stryMutAct_9fa48("144608") ? true : (stryCov_9fa48("144608", "144609"), newState !== NodeStatus.ACTIVE)))) {
        if (stryMutAct_9fa48("144610")) {
          {}
        } else {
          stryCov_9fa48("144610");
          return stryMutAct_9fa48("144611") ? {} : (stryCov_9fa48("144611"), {
            needed: stryMutAct_9fa48("144612") ? false : (stryCov_9fa48("144612"), true),
            reason: REBALANCER_RUNTIME_REASON.NODE_LEFT_READY,
            stabilizationTrigger: STABILIZATION_RESET_TRIGGER.NODE_LEFT
          });
        }
      }
      return stryMutAct_9fa48("144613") ? {} : (stryCov_9fa48("144613"), {
        needed: stryMutAct_9fa48("144614") ? true : (stryCov_9fa48("144614"), false),
        reason: null,
        stabilizationTrigger: null
      });
    }
  }

  /**
   * Check if a CDC event is critical.
   * @param {Object} event - CDC event.
   * @return {boolean} True if event is critical.
   */
  isCriticalCDCEvent(event) {
    if (stryMutAct_9fa48("144615")) {
      {}
    } else {
      stryCov_9fa48("144615");
      // Node failure is critical
      if (stryMutAct_9fa48("144618") ? event.tableName === UNIFIED_REBALANCER_LITERAL.NODES && event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE || event.data?.status === NodeStatus.FAILED : stryMutAct_9fa48("144617") ? false : stryMutAct_9fa48("144616") ? true : (stryCov_9fa48("144616", "144617", "144618"), (stryMutAct_9fa48("144620") ? event.tableName === UNIFIED_REBALANCER_LITERAL.NODES || event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE : stryMutAct_9fa48("144619") ? true : (stryCov_9fa48("144619", "144620"), (stryMutAct_9fa48("144622") ? event.tableName !== UNIFIED_REBALANCER_LITERAL.NODES : stryMutAct_9fa48("144621") ? true : (stryCov_9fa48("144621", "144622"), event.tableName === UNIFIED_REBALANCER_LITERAL.NODES)) && (stryMutAct_9fa48("144624") ? event.operation !== UNIFIED_REBALANCER_LITERAL.UPDATE : stryMutAct_9fa48("144623") ? true : (stryCov_9fa48("144623", "144624"), event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE)))) && (stryMutAct_9fa48("144626") ? event.data?.status !== NodeStatus.FAILED : stryMutAct_9fa48("144625") ? true : (stryCov_9fa48("144625", "144626"), (stryMutAct_9fa48("144627") ? event.data.status : (stryCov_9fa48("144627"), event.data?.status)) === NodeStatus.FAILED)))) {
        if (stryMutAct_9fa48("144628")) {
          {}
        } else {
          stryCov_9fa48("144628");
          return this.affectsMyReplicas(event);
        }
      }

      // Service failure is critical
      if (stryMutAct_9fa48("144631") ? event.tableName === UNIFIED_REBALANCER_LITERAL.SERVICES && event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE || event.data?.status === ReplicaStatus.FAILED : stryMutAct_9fa48("144630") ? false : stryMutAct_9fa48("144629") ? true : (stryCov_9fa48("144629", "144630", "144631"), (stryMutAct_9fa48("144633") ? event.tableName === UNIFIED_REBALANCER_LITERAL.SERVICES || event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE : stryMutAct_9fa48("144632") ? true : (stryCov_9fa48("144632", "144633"), (stryMutAct_9fa48("144635") ? event.tableName !== UNIFIED_REBALANCER_LITERAL.SERVICES : stryMutAct_9fa48("144634") ? true : (stryCov_9fa48("144634", "144635"), event.tableName === UNIFIED_REBALANCER_LITERAL.SERVICES)) && (stryMutAct_9fa48("144637") ? event.operation !== UNIFIED_REBALANCER_LITERAL.UPDATE : stryMutAct_9fa48("144636") ? true : (stryCov_9fa48("144636", "144637"), event.operation === UNIFIED_REBALANCER_LITERAL.UPDATE)))) && (stryMutAct_9fa48("144639") ? event.data?.status !== ReplicaStatus.FAILED : stryMutAct_9fa48("144638") ? true : (stryCov_9fa48("144638", "144639"), (stryMutAct_9fa48("144640") ? event.data.status : (stryCov_9fa48("144640"), event.data?.status)) === ReplicaStatus.FAILED)))) {
        if (stryMutAct_9fa48("144641")) {
          {}
        } else {
          stryCov_9fa48("144641");
          return stryMutAct_9fa48("144644") ? (event.data?.partition_id === this.entityId || event.data?.group_id === this.entityId) && this.entityType === EntityType.RUNTIME_SERVICE && event.data?.service_id === this.entityId : stryMutAct_9fa48("144643") ? false : stryMutAct_9fa48("144642") ? true : (stryCov_9fa48("144642", "144643", "144644"), (stryMutAct_9fa48("144646") ? event.data?.partition_id === this.entityId && event.data?.group_id === this.entityId : stryMutAct_9fa48("144645") ? false : (stryCov_9fa48("144645", "144646"), (stryMutAct_9fa48("144648") ? event.data?.partition_id !== this.entityId : stryMutAct_9fa48("144647") ? false : (stryCov_9fa48("144647", "144648"), (stryMutAct_9fa48("144649") ? event.data.partition_id : (stryCov_9fa48("144649"), event.data?.partition_id)) === this.entityId)) || (stryMutAct_9fa48("144651") ? event.data?.group_id !== this.entityId : stryMutAct_9fa48("144650") ? false : (stryCov_9fa48("144650", "144651"), (stryMutAct_9fa48("144652") ? event.data.group_id : (stryCov_9fa48("144652"), event.data?.group_id)) === this.entityId)))) || (stryMutAct_9fa48("144654") ? this.entityType === EntityType.RUNTIME_SERVICE || event.data?.service_id === this.entityId : stryMutAct_9fa48("144653") ? false : (stryCov_9fa48("144653", "144654"), (stryMutAct_9fa48("144656") ? this.entityType !== EntityType.RUNTIME_SERVICE : stryMutAct_9fa48("144655") ? true : (stryCov_9fa48("144655", "144656"), this.entityType === EntityType.RUNTIME_SERVICE)) && (stryMutAct_9fa48("144658") ? event.data?.service_id !== this.entityId : stryMutAct_9fa48("144657") ? true : (stryCov_9fa48("144657", "144658"), (stryMutAct_9fa48("144659") ? event.data.service_id : (stryCov_9fa48("144659"), event.data?.service_id)) === this.entityId)))));
        }
      }
      return stryMutAct_9fa48("144660") ? true : (stryCov_9fa48("144660"), false);
    }
  }

  /**
   * Check if an event affects this entity's replicas.
   * @param {Object} event - CDC event.
   * @return {boolean} True if event affects our replicas.
   */
  affectsMyReplicas(event) {
    if (stryMutAct_9fa48("144661")) {
      {}
    } else {
      stryCov_9fa48("144661");
      const replicas = this.getCurrentReplicas();
      const nodeId = stryMutAct_9fa48("144662") ? event.data.node_id : (stryCov_9fa48("144662"), event.data?.node_id);
      if (stryMutAct_9fa48("144665") ? false : stryMutAct_9fa48("144664") ? true : stryMutAct_9fa48("144663") ? nodeId : (stryCov_9fa48("144663", "144664", "144665"), !nodeId)) {
        if (stryMutAct_9fa48("144666")) {
          {}
        } else {
          stryCov_9fa48("144666");
          return stryMutAct_9fa48("144667") ? true : (stryCov_9fa48("144667"), false);
        }
      }

      // Filter out replicas without node_id (defensive check)
      return stryMutAct_9fa48("144668") ? replicas.every(r => r && r.node_id === nodeId) : (stryCov_9fa48("144668"), replicas.some(stryMutAct_9fa48("144669") ? () => undefined : (stryCov_9fa48("144669"), r => stryMutAct_9fa48("144672") ? r || r.node_id === nodeId : stryMutAct_9fa48("144671") ? false : stryMutAct_9fa48("144670") ? true : (stryCov_9fa48("144670", "144671", "144672"), r && (stryMutAct_9fa48("144674") ? r.node_id !== nodeId : stryMutAct_9fa48("144673") ? true : (stryCov_9fa48("144673", "144674"), r.node_id === nodeId))))));
    }
  }

  /**
   * Get rebalancer statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    if (stryMutAct_9fa48("144675")) {
      {}
    } else {
      stryCov_9fa48("144675");
      const stats = stryMutAct_9fa48("144676") ? {} : (stryCov_9fa48("144676"), {
        entityId: this.entityId,
        entityType: this.entityType,
        isLeader: this.isLeader,
        lastRebalanceTime: this.lastRebalanceTime,
        rebalanceCount: this.rebalanceCount,
        currentInterval: this.currentInterval,
        initialized: this.initialized,
        usingCoordinator: stryMutAct_9fa48("144677") ? !this.rebalanceCoordinator : (stryCov_9fa48("144677"), !(stryMutAct_9fa48("144678") ? this.rebalanceCoordinator : (stryCov_9fa48("144678"), !this.rebalanceCoordinator)))
      });

      // Coordinator stats are fetched asynchronously via getStatsAsync()
      // This method returns basic stats synchronously for backward compatibility

      return stats;
    }
  }

  /**
   * Get rebalancer statistics including coordinator stats (async).
   * @return {Promise<Object>} Statistics object with coordinator stats.
   */
  async getStatsAsync() {
    if (stryMutAct_9fa48("144679")) {
      {}
    } else {
      stryCov_9fa48("144679");
      const stats = this.getStats();

      // Include coordinator stats if available
      if (stryMutAct_9fa48("144682") ? this.rebalanceCoordinator || this.rebalanceCoordinator.getStats : stryMutAct_9fa48("144681") ? false : stryMutAct_9fa48("144680") ? true : (stryCov_9fa48("144680", "144681", "144682"), this.rebalanceCoordinator && this.rebalanceCoordinator.getStats)) {
        if (stryMutAct_9fa48("144683")) {
          {}
        } else {
          stryCov_9fa48("144683");
          const coordStats = await this.rebalanceCoordinator.getStats();
          stats.coordinatorStats = stryMutAct_9fa48("144684") ? {} : (stryCov_9fa48("144684"), {
            inFlightOperations: coordStats.inFlightOperations,
            operationsCreated: coordStats.operationsCreated,
            operationsCompleted: coordStats.operationsCompleted,
            operationsFailed: coordStats.operationsFailed
          });
        }
      }
      return stats;
    }
  }

  /**
   * Shutdown the rebalancer.
   */
  shutdown() {
    if (stryMutAct_9fa48("144685")) {
      {}
    } else {
      stryCov_9fa48("144685");
      this.isShuttingDown = stryMutAct_9fa48("144686") ? false : (stryCov_9fa48("144686"), true);
      this.isLeader = stryMutAct_9fa48("144687") ? true : (stryCov_9fa48("144687"), false);
      this.cancelScheduledCheck();
      this.rebalanceCheckQueue.shutdown();
      this.cancelStabilizationTimer();
      this.lastStateChangeTime = null;
      this.initialized = stryMutAct_9fa48("144688") ? true : (stryCov_9fa48("144688"), false);
      this.logger.info(REBALANCER_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("144689") ? {} : (stryCov_9fa48("144689"), {
        entityId: this.entityId,
        entityType: this.entityType
      }));
    }
  }
}
export { UnifiedRebalancer, EntityType, TriggerType, MoveType, ReplicaStatus, NodeStatus, DEFAULT_TABLE_POLICY, DEFAULT_MESSAGE_GROUP_POLICY, isOddReplicaCount, adjustToOddCount, getNextOddCount, getPreviousOddCount };