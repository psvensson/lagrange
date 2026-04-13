/**
 * RebalanceCoordinator - Owns the complete rebalancing workflow.
 *
 * Architecture (per system guidelines):
 * - NO in-memory operations cache - system cache is single source of truth
 * - All reads go through SQL engine (which uses system cache first, then partition)
 * - All writes go through SQL engine to partition leader
 * - CDC events update system cache automatically
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.2
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
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { isCriticalTransportControlPlanePartition as isCriticalTransportControlPlanePartitionTable, isPriorityControlPlanePartition as isPriorityControlPlanePartitionTable } from '../bootstrap/system-partition-classification.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { ControlPlaneReadinessService } from '../control-plane/control-plane-readiness-service.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { readAuthoritativeControlPlaneRows } from '../control-plane/control-plane-system-table-gateway.js';
import { buildPriorityRecoveryOperationAssessment, DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS, resolvePriorityRecoveryActiveNodeCohort, resolveTrackedPriorityRecoveryAdmissionPlan, shouldPriorityRecoveryOperationBlockPlanning } from '../control-plane/priority-recovery-snapshot.js';
import { StartupRecoveryCoordinator } from '../bootstrap/startup-recovery-coordinator.js';
import { PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { getControlPlaneErrorCode, getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { DurableWorkflowCoordinator } from '../workflow/durable-workflow-coordinator.js';
import { OperationLane } from '../workflow/operation-lane.js';
import { WORKFLOW_STEP, NUM, TIME_MS, UNIFIED_SERVICE_TYPE } from '../constants/index.js';
import { SERVICE_TYPE } from '../constants/service.js';
import { assertCritical } from '../utils/assert.js';
import { buildControlPlaneQueryOptions, TIMEOUT_BUDGET_CLASSIFICATION, TIMEOUT_BUDGET_DEFAULT, buildTimeoutClassification, createChildTimeoutBudget, createTopLevelOperationBudget } from '../control-plane/timeout-budget.js';
import { COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE, OPERATION_METADATA_KEY, OperationType, createOperation as createOperationRecord } from './replica-status.js';
import { ReplicaOperationField } from './replica-operation-constants.js';
import { REBALANCE_COORDINATOR_ERROR_MSG, REBALANCE_COORDINATOR_EVENT, REBALANCE_COORDINATOR_LOG_MSG, REBALANCER_CONFIG_KEY, REBALANCER_DEFAULT, REBALANCER_SKIP_REASON, REBALANCER_SUBSYSTEM } from './rebalancer-constants.js';
import { RESERVATION_REASON, RESERVATION_STATUS, STORAGE_CAPACITY_CONFIG_KEY, STORAGE_CAPACITY_DEFAULT } from './storage-capacity-constants.js';
import './executor-outcome-constants.js';
import { ExecutorOutcomeEmitter, OUTCOME_EVENT_NAME } from './executor-outcome-emitter.js';
import { ReplicaOperationRepository } from './replica-operation-repository.js';
import { OperationWorkflowOwner } from './operation-workflow-owner.js';
import { ProvisioningAdmissionPolicy } from './provisioning-admission-policy.js';
import { buildReplicatedServiceBootstrapTopology } from '../service/replicated-service-topology.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */
const SQL = Object.freeze(stryMutAct_9fa48("135471") ? {} : (stryCov_9fa48("135471"), {
  SELECT_OPERATION_BY_ID: stryMutAct_9fa48("135472") ? "" : (stryCov_9fa48("135472"), 'SELECT * FROM replica_operations WHERE operation_id = ?'),
  SELECT_INCOMPLETE_OPERATIONS: stryMutAct_9fa48("135473") ? `` : (stryCov_9fa48("135473"), `SELECT * FROM replica_operations
    WHERE source_node_id = ?
    AND type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
    AND (
      workflow_step IN (?, ?, ?, ?, ?)
      OR (workflow_step = ? AND type = ?)
    )`),
  SELECT_OPERATIONS_BY_PARTITION: stryMutAct_9fa48("135474") ? "" : (stryCov_9fa48("135474"), 'SELECT * FROM replica_operations WHERE partition_id = ?'),
  SELECT_OPERATIONS_BY_ENTITY: stryMutAct_9fa48("135475") ? `` : (stryCov_9fa48("135475"), `SELECT * FROM replica_operations
    WHERE (
      (entity_type = ? AND entity_id = ?)
      OR ((entity_type IS NULL OR entity_type = '') AND partition_id = ?)
    )`),
  SELECT_IN_FLIGHT_FOR_ENTITY_NODE: stryMutAct_9fa48("135476") ? `` : (stryCov_9fa48("135476"), `SELECT * FROM replica_operations
    WHERE partition_id = ? AND target_node_id = ?
    AND (
      (entity_type = ? AND entity_id = ?)
      OR (entity_type IS NULL OR entity_type = '')
    )`),
  SELECT_IN_FLIGHT_BY_TYPE: stryMutAct_9fa48("135477") ? `` : (stryCov_9fa48("135477"), `SELECT * FROM replica_operations 
    WHERE type = ?`),
  INSERT_OPERATION: stryMutAct_9fa48("135478") ? `` : (stryCov_9fa48("135478"), `INSERT INTO replica_operations (
    operation_id, type, partition_id, replica_id, source_node_id, target_node_id,
    status, workflow_step, created_at, updated_at, completed_at, error_message, steps_history,
    entity_type, entity_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  UPDATE_OPERATION: stryMutAct_9fa48("135479") ? `` : (stryCov_9fa48("135479"), `UPDATE replica_operations SET 
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?, 
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ?`),
  SELECT_REPLICA_STATUS: stryMutAct_9fa48("135480") ? "" : (stryCov_9fa48("135480"), 'SELECT status FROM services WHERE service_id = ?'),
  SELECT_REPLICA_BY_PARTITION_NODE: stryMutAct_9fa48("135481") ? `` : (stryCov_9fa48("135481"), `SELECT status FROM services 
    WHERE partition_id = ? AND node_id = ?`),
  SELECT_PARTITION_SERVICES_BY_ENTITY: stryMutAct_9fa48("135482") ? `` : (stryCov_9fa48("135482"), `SELECT * FROM services
    WHERE service_type = ? AND partition_id = ?`),
  SELECT_MESSAGE_GROUP_SERVICES_BY_ENTITY: stryMutAct_9fa48("135483") ? `` : (stryCov_9fa48("135483"), `SELECT * FROM services
    WHERE service_type = ? AND group_id = ?`),
  SELECT_RUNTIME_SERVICES_BY_ENTITY: stryMutAct_9fa48("135484") ? `` : (stryCov_9fa48("135484"), `SELECT * FROM services
    WHERE service_type = ? AND service_id = ?`),
  INSERT_RESERVATION: stryMutAct_9fa48("135485") ? `` : (stryCov_9fa48("135485"), `INSERT INTO storage_reservations (
    reservation_id, operation_id, entity_type, entity_id,
    partition_id, target_node_id, estimated_bytes,
    amplification_factor, status, reason_code,
    created_at, updated_at, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  UPDATE_RESERVATION_STATUS_BY_ID: stryMutAct_9fa48("135486") ? `` : (stryCov_9fa48("135486"), `UPDATE storage_reservations
    SET status = ?, updated_at = ?, released_at = ?
    WHERE reservation_id = ? AND status = ?`),
  SELECT_ACTIVE_RESERVATIONS_BY_OPERATION: stryMutAct_9fa48("135487") ? "" : (stryCov_9fa48("135487"), 'SELECT * FROM storage_reservations WHERE operation_id = ? AND status = ?'),
  SELECT_ACTIVE_RESERVATIONS: stryMutAct_9fa48("135488") ? "" : (stryCov_9fa48("135488"), 'SELECT * FROM storage_reservations WHERE status = ?'),
  SELECT_EXPIRED_ACTIVE_RESERVATIONS: stryMutAct_9fa48("135489") ? "" : (stryCov_9fa48("135489"), 'SELECT * FROM storage_reservations WHERE status = ? AND expires_at <= ?')
}));
const RECENT_INTENT_TTL_MS = 15000;
const INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS = stryMutAct_9fa48("135490") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("135490"), TIME_MS.SECOND * NUM.FIVE);
const REPLICA_ID_SEPARATOR = stryMutAct_9fa48("135491") ? "" : (stryCov_9fa48("135491"), '-r');
const REPLICA_ID_START_INDEX = NUM.ONE;
const DEFAULT_AMPLIFICATION_FACTOR = NUM.ONE;
const CONCURRENT_CREATE_BUDGET_SCOPE = Object.freeze(stryMutAct_9fa48("135492") ? {} : (stryCov_9fa48("135492"), {
  ADD: stryMutAct_9fa48("135493") ? "" : (stryCov_9fa48("135493"), 'add'),
  PRIORITY_ADD: stryMutAct_9fa48("135494") ? "" : (stryCov_9fa48("135494"), 'priority_add'),
  EMERGENCY_PRIORITY_ADD: stryMutAct_9fa48("135495") ? "" : (stryCov_9fa48("135495"), 'emergency_priority_add'),
  REMOVE: stryMutAct_9fa48("135496") ? "" : (stryCov_9fa48("135496"), 'remove')
}));
const CONTROL_PLANE_QUERY_OPTIONS = Object.freeze(stryMutAct_9fa48("135497") ? {} : (stryCov_9fa48("135497"), {
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
}));
const STORAGE_RESERVATION_READ_QUERY_OPTIONS = Object.freeze(stryMutAct_9fa48("135498") ? {} : (stryCov_9fa48("135498"), {
  ...CONTROL_PLANE_QUERY_OPTIONS,
  // Reservation cleanup is an internal recovery path. When the routed
  // authoritative owner is temporarily unavailable, fall back to the local
  // SQL-backed view instead of leaving stale reservations behind.
  allowSqlFallback: stryMutAct_9fa48("135499") ? false : (stryCov_9fa48("135499"), true)
}));
const STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS = Object.freeze(stryMutAct_9fa48("135500") ? {} : (stryCov_9fa48("135500"), {
  readOptions: stryMutAct_9fa48("135501") ? {} : (stryCov_9fa48("135501"), {
    preferOwnerRpcRead: stryMutAct_9fa48("135502") ? false : (stryCov_9fa48("135502"), true),
    requireOwnerRpcRead: stryMutAct_9fa48("135503") ? false : (stryCov_9fa48("135503"), true),
    allowOwnerRpcFallback: stryMutAct_9fa48("135504") ? false : (stryCov_9fa48("135504"), true),
    allowSqlFallback: stryMutAct_9fa48("135505") ? true : (stryCov_9fa48("135505"), false)
  })
}));
const PRIORITY_RECENT_INTENT_TTL_MS = stryMutAct_9fa48("135506") ? TIME_MS.MINUTE / NUM.TWO : (stryCov_9fa48("135506"), TIME_MS.MINUTE * NUM.TWO);

/**
 * RebalanceCoordinator manages the complete rebalancing workflow.
 * Uses SQL engine for all system information access (no in-memory cache).
 */
class RebalanceCoordinator extends EventEmitter {
  /**
   * @return {Object}
   */
  get logger() {
    if (stryMutAct_9fa48("135507")) {
      {}
    } else {
      stryCov_9fa48("135507");
      return this._logger;
    }
  }

  /**
   * Keep coordinator-extracted owners on one logger surface.
   * @param {Object} value
   */
  set logger(value) {
    if (stryMutAct_9fa48("135508")) {
      {}
    } else {
      stryCov_9fa48("135508");
      this._logger = stryMutAct_9fa48("135511") ? value && console : stryMutAct_9fa48("135510") ? false : stryMutAct_9fa48("135509") ? true : (stryCov_9fa48("135509", "135510", "135511"), value || console);
      if (stryMutAct_9fa48("135513") ? false : stryMutAct_9fa48("135512") ? true : (stryCov_9fa48("135512", "135513"), this.executorOutcomeEmitter)) {
        if (stryMutAct_9fa48("135514")) {
          {}
        } else {
          stryCov_9fa48("135514");
          this.executorOutcomeEmitter.logger = this._logger;
        }
      }
      if (stryMutAct_9fa48("135516") ? false : stryMutAct_9fa48("135515") ? true : (stryCov_9fa48("135515", "135516"), this.repository)) {
        if (stryMutAct_9fa48("135517")) {
          {}
        } else {
          stryCov_9fa48("135517");
          this.repository.logger = this._logger;
        }
      }
      if (stryMutAct_9fa48("135519") ? false : stryMutAct_9fa48("135518") ? true : (stryCov_9fa48("135518", "135519"), this.workflowOwner)) {
        if (stryMutAct_9fa48("135520")) {
          {}
        } else {
          stryCov_9fa48("135520");
          this.workflowOwner.logger = this._logger;
        }
      }
      if (stryMutAct_9fa48("135522") ? false : stryMutAct_9fa48("135521") ? true : (stryCov_9fa48("135521", "135522"), this.provisioningAdmissionPolicy)) {
        if (stryMutAct_9fa48("135523")) {
          {}
        } else {
          stryCov_9fa48("135523");
          this.provisioningAdmissionPolicy.logger = this._logger;
        }
      }
    }
  }

  /**
   * Create a new RebalanceCoordinator instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Current node ID.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.messageRouter - MessageRouter instance for delivery.
   * @param {Object} options.tablePolicyService - TablePolicyService for policy lookup.
   * @param {Object} options.sqlQueryEngine - SQL query engine for system table access.
   * @param {Object} [options.storageAccountingService] - Storage capacity
   *   accounting service for replica size estimation.
   * @param {Object} [options.storageAdmissionService] - Storage admission
   *   service for reservation management.
   * @param {Object} [options.cdcGroupPropagationService] - CDC publication owner.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("135524")) {
      {}
    } else {
      stryCov_9fa48("135524");
      super();
      this.nodeId = assertCritical(options.nodeId, REBALANCE_COORDINATOR_ERROR_MSG.NODE_ID_REQUIRED);
      this.systemTableCache = assertCritical(options.systemTableCache, REBALANCE_COORDINATOR_ERROR_MSG.CACHE_REQUIRED);
      this.cdcIntegrationService = assertCritical(options.cdcIntegrationService, REBALANCE_COORDINATOR_ERROR_MSG.CDC_REQUIRED);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("135527") ? options.controlPlaneSystemTableGateway && createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () => this.sqlQueryEngine,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemTableCache,
        getMessageRouter: () => this.messageRouter
      }).controlPlaneSystemTableGateway : stryMutAct_9fa48("135526") ? false : stryMutAct_9fa48("135525") ? true : (stryCov_9fa48("135525", "135526", "135527"), options.controlPlaneSystemTableGateway || createControlPlaneRuntimeBundle(stryMutAct_9fa48("135528") ? {} : (stryCov_9fa48("135528"), {
        nodeId: this.nodeId,
        getSqlQueryEngine: stryMutAct_9fa48("135529") ? () => undefined : (stryCov_9fa48("135529"), () => this.sqlQueryEngine),
        getCdcIntegrationService: stryMutAct_9fa48("135530") ? () => undefined : (stryCov_9fa48("135530"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("135531") ? () => undefined : (stryCov_9fa48("135531"), () => this.systemTableCache),
        getMessageRouter: stryMutAct_9fa48("135532") ? () => undefined : (stryCov_9fa48("135532"), () => this.messageRouter)
      })).controlPlaneSystemTableGateway);
      this.messageRouter = assertCritical(options.messageRouter, REBALANCE_COORDINATOR_ERROR_MSG.ROUTER_MISSING);
      this.tablePolicyService = assertCritical(options.tablePolicyService, REBALANCE_COORDINATOR_ERROR_MSG.POLICY_REQUIRED);
      this.sqlQueryEngine = assertCritical(options.sqlQueryEngine, REBALANCE_COORDINATOR_ERROR_MSG.SQL_ENGINE_REQUIRED);
      this.enableTimeouts = stryMutAct_9fa48("135535") ? options.enableTimeouts === false : stryMutAct_9fa48("135534") ? false : stryMutAct_9fa48("135533") ? true : (stryCov_9fa48("135533", "135534", "135535"), options.enableTimeouts !== (stryMutAct_9fa48("135536") ? true : (stryCov_9fa48("135536"), false)));

      // Optional storage capacity services (Req 4.1, 11.4)
      this.storageAccountingService = stryMutAct_9fa48("135539") ? options.storageAccountingService && null : stryMutAct_9fa48("135538") ? false : stryMutAct_9fa48("135537") ? true : (stryCov_9fa48("135537", "135538", "135539"), options.storageAccountingService || null);
      this.storageAdmissionService = stryMutAct_9fa48("135542") ? options.storageAdmissionService && null : stryMutAct_9fa48("135541") ? false : stryMutAct_9fa48("135540") ? true : (stryCov_9fa48("135540", "135541", "135542"), options.storageAdmissionService || null);
      this.cdcGroupPropagationService = stryMutAct_9fa48("135545") ? options.cdcGroupPropagationService && null : stryMutAct_9fa48("135544") ? false : stryMutAct_9fa48("135543") ? true : (stryCov_9fa48("135543", "135544", "135545"), options.cdcGroupPropagationService || null);
      this.bootstrapReadinessState = stryMutAct_9fa48("135548") ? options.bootstrapReadinessState && null : stryMutAct_9fa48("135547") ? false : stryMutAct_9fa48("135546") ? true : (stryCov_9fa48("135546", "135547", "135548"), options.bootstrapReadinessState || null);
      this.startupRecoveryCoordinator = stryMutAct_9fa48("135551") ? options.startupRecoveryCoordinator && new StartupRecoveryCoordinator({
        readinessState: this.bootstrapReadinessState
      }) : stryMutAct_9fa48("135550") ? false : stryMutAct_9fa48("135549") ? true : (stryCov_9fa48("135549", "135550", "135551"), options.startupRecoveryCoordinator || new StartupRecoveryCoordinator(stryMutAct_9fa48("135552") ? {} : (stryCov_9fa48("135552"), {
        readinessState: this.bootstrapReadinessState
      })));
      this.controlPlaneReadinessService = stryMutAct_9fa48("135555") ? options.controlPlaneReadinessService && new ControlPlaneReadinessService({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        storageAccountingService: this.storageAccountingService,
        cdcIntegrationService: this.cdcIntegrationService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway
      }) : stryMutAct_9fa48("135554") ? false : stryMutAct_9fa48("135553") ? true : (stryCov_9fa48("135553", "135554", "135555"), options.controlPlaneReadinessService || new ControlPlaneReadinessService(stryMutAct_9fa48("135556") ? {} : (stryCov_9fa48("135556"), {
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        storageAccountingService: this.storageAccountingService,
        cdcIntegrationService: this.cdcIntegrationService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway
      })));

      // Configuration (centralized) - Requirements 6.1, 6.4
      const configManager = ConfigurationManager.getInstance();
      this.config = stryMutAct_9fa48("135557") ? {} : (stryCov_9fa48("135557"), {
        pendingTimeoutMs: stryMutAct_9fa48("135560") ? configManager.get(REBALANCER_CONFIG_KEY.PENDING_TIMEOUT_MS) && REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS : stryMutAct_9fa48("135559") ? false : stryMutAct_9fa48("135558") ? true : (stryCov_9fa48("135558", "135559", "135560"), configManager.get(REBALANCER_CONFIG_KEY.PENDING_TIMEOUT_MS) || REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS),
        creatingTimeoutMs: stryMutAct_9fa48("135563") ? configManager.get(REBALANCER_CONFIG_KEY.CREATING_TIMEOUT_MS) && REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS : stryMutAct_9fa48("135562") ? false : stryMutAct_9fa48("135561") ? true : (stryCov_9fa48("135561", "135562", "135563"), configManager.get(REBALANCER_CONFIG_KEY.CREATING_TIMEOUT_MS) || REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS),
        syncingTimeoutMs: stryMutAct_9fa48("135566") ? configManager.get(REBALANCER_CONFIG_KEY.SYNCING_TIMEOUT_MS) && REBALANCER_DEFAULT.COORDINATOR.SYNCING_TIMEOUT_MS : stryMutAct_9fa48("135565") ? false : stryMutAct_9fa48("135564") ? true : (stryCov_9fa48("135564", "135565", "135566"), configManager.get(REBALANCER_CONFIG_KEY.SYNCING_TIMEOUT_MS) || REBALANCER_DEFAULT.COORDINATOR.SYNCING_TIMEOUT_MS),
        removingTimeoutMs: stryMutAct_9fa48("135569") ? configManager.get(REBALANCER_CONFIG_KEY.REMOVING_TIMEOUT_MS) && REBALANCER_DEFAULT.COORDINATOR.REMOVING_TIMEOUT_MS : stryMutAct_9fa48("135568") ? false : stryMutAct_9fa48("135567") ? true : (stryCov_9fa48("135567", "135568", "135569"), configManager.get(REBALANCER_CONFIG_KEY.REMOVING_TIMEOUT_MS) || REBALANCER_DEFAULT.COORDINATOR.REMOVING_TIMEOUT_MS),
        maxConcurrentAdds: stryMutAct_9fa48("135572") ? configManager.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_ADDS) && REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS : stryMutAct_9fa48("135571") ? false : stryMutAct_9fa48("135570") ? true : (stryCov_9fa48("135570", "135571", "135572"), configManager.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_ADDS) || REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS),
        maxConcurrentRemoves: stryMutAct_9fa48("135575") ? configManager.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_REMOVES) && REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_REMOVES : stryMutAct_9fa48("135574") ? false : stryMutAct_9fa48("135573") ? true : (stryCov_9fa48("135573", "135574", "135575"), configManager.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_REMOVES) || REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_REMOVES),
        periodicCheckIntervalMs: stryMutAct_9fa48("135578") ? configManager.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_INTERVAL_MS) && REBALANCER_DEFAULT.COORDINATOR.PERIODIC_CHECK_INTERVAL_MS : stryMutAct_9fa48("135577") ? false : stryMutAct_9fa48("135576") ? true : (stryCov_9fa48("135576", "135577", "135578"), configManager.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_INTERVAL_MS) || REBALANCER_DEFAULT.COORDINATOR.PERIODIC_CHECK_INTERVAL_MS),
        reservationTtlMs: stryMutAct_9fa48("135581") ? configManager.get(STORAGE_CAPACITY_CONFIG_KEY.RESERVATION_TTL_MS) && STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS : stryMutAct_9fa48("135580") ? false : stryMutAct_9fa48("135579") ? true : (stryCov_9fa48("135579", "135580", "135581"), configManager.get(STORAGE_CAPACITY_CONFIG_KEY.RESERVATION_TTL_MS) || STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS)
      });

      // Timeout checking interval
      this.timeoutCheckInterval = null;
      this.timeoutCheckInFlight = stryMutAct_9fa48("135582") ? true : (stryCov_9fa48("135582"), false);
      this.timeoutCheckIntervalMs = REBALANCER_DEFAULT.COORDINATOR.TIMEOUT_CHECK_INTERVAL_MS;
      this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
      this.incompleteOperationQueryEmptyBackoffMs = INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS;

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(REBALANCER_SUBSYSTEM.COORDINATOR) : console;

      // Statistics (local counters only, not cached state)
      this.stats = stryMutAct_9fa48("135583") ? {} : (stryCov_9fa48("135583"), {
        operationsCreated: NUM.ZERO,
        operationsCompleted: NUM.ZERO,
        operationsFailed: NUM.ZERO,
        operationsTimedOut: NUM.ZERO,
        reservationsCreated: NUM.ZERO,
        reservationsReleased: NUM.ZERO,
        reservationsReconciled: NUM.ZERO
      });
      this.operationWorkflowCoordinator = assertCritical(stryMutAct_9fa48("135586") ? options.operationWorkflowCoordinator && new DurableWorkflowCoordinator() : stryMutAct_9fa48("135585") ? false : stryMutAct_9fa48("135584") ? true : (stryCov_9fa48("135584", "135585", "135586"), options.operationWorkflowCoordinator || new DurableWorkflowCoordinator()), REBALANCE_COORDINATOR_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED);
      this.operationLane = stryMutAct_9fa48("135589") ? options.operationLane && new OperationLane({
        name: REBALANCER_SUBSYSTEM.COORDINATOR,
        workflowCoordinator: this.operationWorkflowCoordinator
      }) : stryMutAct_9fa48("135588") ? false : stryMutAct_9fa48("135587") ? true : (stryCov_9fa48("135587", "135588", "135589"), options.operationLane || new OperationLane(stryMutAct_9fa48("135590") ? {} : (stryCov_9fa48("135590"), {
        name: REBALANCER_SUBSYSTEM.COORDINATOR,
        workflowCoordinator: this.operationWorkflowCoordinator
      })));
      this.operationWorkflowRunExclusive = assertCritical((stryMutAct_9fa48("135593") ? typeof this.operationLane.run !== 'function' : stryMutAct_9fa48("135592") ? false : stryMutAct_9fa48("135591") ? true : (stryCov_9fa48("135591", "135592", "135593"), typeof this.operationLane.run === (stryMutAct_9fa48("135594") ? "" : (stryCov_9fa48("135594"), 'function')))) ? this.operationLane.run.bind(this.operationLane) : null, REBALANCE_COORDINATOR_ERROR_MSG.WORKFLOW_COORDINATOR_REQUIRED);
      const workflowInFlightExecutions = assertCritical(this.operationWorkflowCoordinator.inFlightExecutionsByOwnerKey instanceof Map ? this.operationWorkflowCoordinator.inFlightExecutionsByOwnerKey : null, REBALANCE_COORDINATOR_ERROR_MSG.WORKFLOW_COORDINATOR_REGISTRY_REQUIRED);
      this.operationsInCreation = workflowInFlightExecutions;
      this.operationsInExecution = workflowInFlightExecutions;
      this.transactionCoordinator = stryMutAct_9fa48("135597") ? options.transactionCoordinator && null : stryMutAct_9fa48("135596") ? false : stryMutAct_9fa48("135595") ? true : (stryCov_9fa48("135595", "135596", "135597"), options.transactionCoordinator || null);
      this.nowFn = (stryMutAct_9fa48("135600") ? typeof options.nowFn !== 'function' : stryMutAct_9fa48("135599") ? false : stryMutAct_9fa48("135598") ? true : (stryCov_9fa48("135598", "135599", "135600"), typeof options.nowFn === (stryMutAct_9fa48("135601") ? "" : (stryCov_9fa48("135601"), 'function')))) ? options.nowFn : Date.now;
      this.priorityRecoveryActivityStaleGraceMs = Number.isFinite(options.priorityRecoveryActivityStaleGraceMs) ? stryMutAct_9fa48("135602") ? Math.min(NUM.ZERO, Math.floor(options.priorityRecoveryActivityStaleGraceMs)) : (stryCov_9fa48("135602"), Math.max(NUM.ZERO, Math.floor(options.priorityRecoveryActivityStaleGraceMs))) : DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS;
      this.priorityRecoveryAdmissionTracker = stryMutAct_9fa48("135603") ? {} : (stryCov_9fa48("135603"), {
        lastObservedAdmissionPlan: null,
        lastObservedAdmissionPlanAtMs: null
      });
      this.recentOperationIntents = new Map();
      this.replicaOperationTransitionQueue = Promise.resolve();
      this.executorOutcomeEmitter = stryMutAct_9fa48("135606") ? options.executorOutcomeEmitter && new ExecutorOutcomeEmitter({
        logger: this.logger
      }) : stryMutAct_9fa48("135605") ? false : stryMutAct_9fa48("135604") ? true : (stryCov_9fa48("135604", "135605", "135606"), options.executorOutcomeEmitter || new ExecutorOutcomeEmitter(stryMutAct_9fa48("135607") ? {} : (stryCov_9fa48("135607"), {
        logger: this.logger
      })));
      this._boundOutcomeHandler = null;
      this.cacheChangeListener = null;
      this._boundTerminalOperationIntentPruner = null;

      // Repository owns SQL/cache access and row translation (D7.1)
      this.repository = stryMutAct_9fa48("135610") ? options.repository && new ReplicaOperationRepository({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        logger: this.logger,
        emitter: this
      }) : stryMutAct_9fa48("135609") ? false : stryMutAct_9fa48("135608") ? true : (stryCov_9fa48("135608", "135609", "135610"), options.repository || new ReplicaOperationRepository(stryMutAct_9fa48("135611") ? {} : (stryCov_9fa48("135611"), {
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        logger: this.logger,
        emitter: this
      })));

      // Workflow owner owns single-flight keys, step transitions,
      // claim/dispatch progression, and reconciliation (D7.1)
      this.workflowOwner = stryMutAct_9fa48("135614") ? options.workflowOwner && new OperationWorkflowOwner({
        repository: this.repository,
        operationLane: this.operationLane,
        operationWorkflowCoordinator: this.operationWorkflowCoordinator,
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        messageRouter: this.messageRouter,
        tablePolicyService: this.tablePolicyService,
        transactionCoordinator: this.transactionCoordinator,
        logger: this.logger,
        emitter: this,
        config: this.config,
        nodeId: this.nodeId,
        stats: this.stats,
        isShuttingDown: () => this.isShuttingDown,
        isInitialized: () => this.initialized,
        releaseReservationForOperation: op => this.releaseReservationForOperation(op),
        reconcileReservations: () => this.reconcileReservations(),
        allocateCanonicalReplicaId: params => this.allocateCanonicalReplicaId(params),
        getActualReplicaStatus: (...args) => this.getActualReplicaStatus(...args),
        setTimeoutFn: options.setTimeoutFn,
        clearTimeoutFn: options.clearTimeoutFn,
        incompleteOperationQueryEmptyBackoffMs: INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS
      }) : stryMutAct_9fa48("135613") ? false : stryMutAct_9fa48("135612") ? true : (stryCov_9fa48("135612", "135613", "135614"), options.workflowOwner || new OperationWorkflowOwner(stryMutAct_9fa48("135615") ? {} : (stryCov_9fa48("135615"), {
        repository: this.repository,
        operationLane: this.operationLane,
        operationWorkflowCoordinator: this.operationWorkflowCoordinator,
        controlPlaneReadinessService: this.controlPlaneReadinessService,
        messageRouter: this.messageRouter,
        tablePolicyService: this.tablePolicyService,
        transactionCoordinator: this.transactionCoordinator,
        logger: this.logger,
        emitter: this,
        config: this.config,
        nodeId: this.nodeId,
        stats: this.stats,
        isShuttingDown: stryMutAct_9fa48("135616") ? () => undefined : (stryCov_9fa48("135616"), () => this.isShuttingDown),
        isInitialized: stryMutAct_9fa48("135617") ? () => undefined : (stryCov_9fa48("135617"), () => this.initialized),
        releaseReservationForOperation: stryMutAct_9fa48("135618") ? () => undefined : (stryCov_9fa48("135618"), op => this.releaseReservationForOperation(op)),
        reconcileReservations: stryMutAct_9fa48("135619") ? () => undefined : (stryCov_9fa48("135619"), () => this.reconcileReservations()),
        allocateCanonicalReplicaId: stryMutAct_9fa48("135620") ? () => undefined : (stryCov_9fa48("135620"), params => this.allocateCanonicalReplicaId(params)),
        getActualReplicaStatus: stryMutAct_9fa48("135621") ? () => undefined : (stryCov_9fa48("135621"), (...args) => this.getActualReplicaStatus(...args)),
        setTimeoutFn: options.setTimeoutFn,
        clearTimeoutFn: options.clearTimeoutFn,
        incompleteOperationQueryEmptyBackoffMs: INCOMPLETE_OPERATION_EMPTY_QUERY_BACKOFF_MS
      })));

      // Admission policy owns storage/readiness synthesis for provisioning
      // decisions while coordinator remains compatibility facade (D7.1/D7.2).
      this.provisioningAdmissionPolicy = stryMutAct_9fa48("135624") ? options.provisioningAdmissionPolicy && new ProvisioningAdmissionPolicy({
        nodeId: this.nodeId,
        logger: this.logger,
        delegates: {
          getNodeId: () => this.nodeId,
          getControlPlaneReadinessService: () => this.controlPlaneReadinessService,
          getStorageAdmissionService: () => this.storageAdmissionService,
          getStorageAccountingService: () => this.storageAccountingService,
          isCriticalSystemPartition: partitionId => this.isCriticalSystemPartition(partitionId),
          normalizeMoveType: moveType => this.normalizeMoveType(moveType)
        }
      }) : stryMutAct_9fa48("135623") ? false : stryMutAct_9fa48("135622") ? true : (stryCov_9fa48("135622", "135623", "135624"), options.provisioningAdmissionPolicy || new ProvisioningAdmissionPolicy(stryMutAct_9fa48("135625") ? {} : (stryCov_9fa48("135625"), {
        nodeId: this.nodeId,
        logger: this.logger,
        delegates: stryMutAct_9fa48("135626") ? {} : (stryCov_9fa48("135626"), {
          getNodeId: stryMutAct_9fa48("135627") ? () => undefined : (stryCov_9fa48("135627"), () => this.nodeId),
          getControlPlaneReadinessService: stryMutAct_9fa48("135628") ? () => undefined : (stryCov_9fa48("135628"), () => this.controlPlaneReadinessService),
          getStorageAdmissionService: stryMutAct_9fa48("135629") ? () => undefined : (stryCov_9fa48("135629"), () => this.storageAdmissionService),
          getStorageAccountingService: stryMutAct_9fa48("135630") ? () => undefined : (stryCov_9fa48("135630"), () => this.storageAccountingService),
          isCriticalSystemPartition: stryMutAct_9fa48("135631") ? () => undefined : (stryCov_9fa48("135631"), partitionId => this.isCriticalSystemPartition(partitionId)),
          normalizeMoveType: stryMutAct_9fa48("135632") ? () => undefined : (stryCov_9fa48("135632"), moveType => this.normalizeMoveType(moveType))
        })
      })));
      this.isShuttingDown = stryMutAct_9fa48("135633") ? true : (stryCov_9fa48("135633"), false);
      this.initialized = stryMutAct_9fa48("135634") ? true : (stryCov_9fa48("135634"), false);
    }
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    if (stryMutAct_9fa48("135635")) {
      {}
    } else {
      stryCov_9fa48("135635");
      const previousSystemTableCache = this.systemTableCache;
      if (stryMutAct_9fa48("135637") ? false : stryMutAct_9fa48("135636") ? true : (stryCov_9fa48("135636", "135637"), Object.hasOwn(options, stryMutAct_9fa48("135638") ? "" : (stryCov_9fa48("135638"), 'systemTableCache')))) {
        if (stryMutAct_9fa48("135639")) {
          {}
        } else {
          stryCov_9fa48("135639");
          this.systemTableCache = stryMutAct_9fa48("135642") ? options.systemTableCache && null : stryMutAct_9fa48("135641") ? false : stryMutAct_9fa48("135640") ? true : (stryCov_9fa48("135640", "135641", "135642"), options.systemTableCache || null);
        }
      }
      if (stryMutAct_9fa48("135644") ? false : stryMutAct_9fa48("135643") ? true : (stryCov_9fa48("135643", "135644"), Object.hasOwn(options, stryMutAct_9fa48("135645") ? "" : (stryCov_9fa48("135645"), 'cdcIntegrationService')))) {
        if (stryMutAct_9fa48("135646")) {
          {}
        } else {
          stryCov_9fa48("135646");
          this.cdcIntegrationService = stryMutAct_9fa48("135649") ? options.cdcIntegrationService && null : stryMutAct_9fa48("135648") ? false : stryMutAct_9fa48("135647") ? true : (stryCov_9fa48("135647", "135648", "135649"), options.cdcIntegrationService || null);
        }
      }
      if (stryMutAct_9fa48("135651") ? false : stryMutAct_9fa48("135650") ? true : (stryCov_9fa48("135650", "135651"), Object.hasOwn(options, stryMutAct_9fa48("135652") ? "" : (stryCov_9fa48("135652"), 'messageRouter')))) {
        if (stryMutAct_9fa48("135653")) {
          {}
        } else {
          stryCov_9fa48("135653");
          this.messageRouter = stryMutAct_9fa48("135656") ? options.messageRouter && null : stryMutAct_9fa48("135655") ? false : stryMutAct_9fa48("135654") ? true : (stryCov_9fa48("135654", "135655", "135656"), options.messageRouter || null);
        }
      }
      if (stryMutAct_9fa48("135658") ? false : stryMutAct_9fa48("135657") ? true : (stryCov_9fa48("135657", "135658"), Object.hasOwn(options, stryMutAct_9fa48("135659") ? "" : (stryCov_9fa48("135659"), 'tablePolicyService')))) {
        if (stryMutAct_9fa48("135660")) {
          {}
        } else {
          stryCov_9fa48("135660");
          this.tablePolicyService = stryMutAct_9fa48("135663") ? options.tablePolicyService && null : stryMutAct_9fa48("135662") ? false : stryMutAct_9fa48("135661") ? true : (stryCov_9fa48("135661", "135662", "135663"), options.tablePolicyService || null);
        }
      }
      if (stryMutAct_9fa48("135665") ? false : stryMutAct_9fa48("135664") ? true : (stryCov_9fa48("135664", "135665"), Object.hasOwn(options, stryMutAct_9fa48("135666") ? "" : (stryCov_9fa48("135666"), 'sqlQueryEngine')))) {
        if (stryMutAct_9fa48("135667")) {
          {}
        } else {
          stryCov_9fa48("135667");
          this.sqlQueryEngine = stryMutAct_9fa48("135670") ? options.sqlQueryEngine && null : stryMutAct_9fa48("135669") ? false : stryMutAct_9fa48("135668") ? true : (stryCov_9fa48("135668", "135669", "135670"), options.sqlQueryEngine || null);
        }
      }
      if (stryMutAct_9fa48("135672") ? false : stryMutAct_9fa48("135671") ? true : (stryCov_9fa48("135671", "135672"), Object.hasOwn(options, stryMutAct_9fa48("135673") ? "" : (stryCov_9fa48("135673"), 'storageAccountingService')))) {
        if (stryMutAct_9fa48("135674")) {
          {}
        } else {
          stryCov_9fa48("135674");
          this.storageAccountingService = stryMutAct_9fa48("135677") ? options.storageAccountingService && null : stryMutAct_9fa48("135676") ? false : stryMutAct_9fa48("135675") ? true : (stryCov_9fa48("135675", "135676", "135677"), options.storageAccountingService || null);
        }
      }
      if (stryMutAct_9fa48("135679") ? false : stryMutAct_9fa48("135678") ? true : (stryCov_9fa48("135678", "135679"), Object.hasOwn(options, stryMutAct_9fa48("135680") ? "" : (stryCov_9fa48("135680"), 'storageAdmissionService')))) {
        if (stryMutAct_9fa48("135681")) {
          {}
        } else {
          stryCov_9fa48("135681");
          this.storageAdmissionService = stryMutAct_9fa48("135684") ? options.storageAdmissionService && null : stryMutAct_9fa48("135683") ? false : stryMutAct_9fa48("135682") ? true : (stryCov_9fa48("135682", "135683", "135684"), options.storageAdmissionService || null);
        }
      }
      if (stryMutAct_9fa48("135686") ? false : stryMutAct_9fa48("135685") ? true : (stryCov_9fa48("135685", "135686"), Object.hasOwn(options, stryMutAct_9fa48("135687") ? "" : (stryCov_9fa48("135687"), 'cdcGroupPropagationService')))) {
        if (stryMutAct_9fa48("135688")) {
          {}
        } else {
          stryCov_9fa48("135688");
          this.cdcGroupPropagationService = stryMutAct_9fa48("135691") ? options.cdcGroupPropagationService && null : stryMutAct_9fa48("135690") ? false : stryMutAct_9fa48("135689") ? true : (stryCov_9fa48("135689", "135690", "135691"), options.cdcGroupPropagationService || null);
        }
      }
      if (stryMutAct_9fa48("135693") ? false : stryMutAct_9fa48("135692") ? true : (stryCov_9fa48("135692", "135693"), Object.hasOwn(options, stryMutAct_9fa48("135694") ? "" : (stryCov_9fa48("135694"), 'bootstrapReadinessState')))) {
        if (stryMutAct_9fa48("135695")) {
          {}
        } else {
          stryCov_9fa48("135695");
          this.bootstrapReadinessState = stryMutAct_9fa48("135698") ? options.bootstrapReadinessState && null : stryMutAct_9fa48("135697") ? false : stryMutAct_9fa48("135696") ? true : (stryCov_9fa48("135696", "135697", "135698"), options.bootstrapReadinessState || null);
          if (stryMutAct_9fa48("135701") ? this.startupRecoveryCoordinator || typeof this.startupRecoveryCoordinator.syncOwnerDependencies === 'function' : stryMutAct_9fa48("135700") ? false : stryMutAct_9fa48("135699") ? true : (stryCov_9fa48("135699", "135700", "135701"), this.startupRecoveryCoordinator && (stryMutAct_9fa48("135703") ? typeof this.startupRecoveryCoordinator.syncOwnerDependencies !== 'function' : stryMutAct_9fa48("135702") ? true : (stryCov_9fa48("135702", "135703"), typeof this.startupRecoveryCoordinator.syncOwnerDependencies === (stryMutAct_9fa48("135704") ? "" : (stryCov_9fa48("135704"), 'function')))))) {
            if (stryMutAct_9fa48("135705")) {
              {}
            } else {
              stryCov_9fa48("135705");
              this.startupRecoveryCoordinator.syncOwnerDependencies(stryMutAct_9fa48("135706") ? {} : (stryCov_9fa48("135706"), {
                readinessState: this.bootstrapReadinessState
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("135708") ? false : stryMutAct_9fa48("135707") ? true : (stryCov_9fa48("135707", "135708"), Object.hasOwn(options, stryMutAct_9fa48("135709") ? "" : (stryCov_9fa48("135709"), 'startupRecoveryCoordinator')))) {
        if (stryMutAct_9fa48("135710")) {
          {}
        } else {
          stryCov_9fa48("135710");
          this.startupRecoveryCoordinator = stryMutAct_9fa48("135713") ? options.startupRecoveryCoordinator && null : stryMutAct_9fa48("135712") ? false : stryMutAct_9fa48("135711") ? true : (stryCov_9fa48("135711", "135712", "135713"), options.startupRecoveryCoordinator || null);
        }
      }
      if (stryMutAct_9fa48("135715") ? false : stryMutAct_9fa48("135714") ? true : (stryCov_9fa48("135714", "135715"), Object.hasOwn(options, stryMutAct_9fa48("135716") ? "" : (stryCov_9fa48("135716"), 'controlPlaneReadinessService')))) {
        if (stryMutAct_9fa48("135717")) {
          {}
        } else {
          stryCov_9fa48("135717");
          this.controlPlaneReadinessService = stryMutAct_9fa48("135720") ? options.controlPlaneReadinessService && null : stryMutAct_9fa48("135719") ? false : stryMutAct_9fa48("135718") ? true : (stryCov_9fa48("135718", "135719", "135720"), options.controlPlaneReadinessService || null);
        }
      }
      if (stryMutAct_9fa48("135722") ? false : stryMutAct_9fa48("135721") ? true : (stryCov_9fa48("135721", "135722"), Object.hasOwn(options, stryMutAct_9fa48("135723") ? "" : (stryCov_9fa48("135723"), 'transactionCoordinator')))) {
        if (stryMutAct_9fa48("135724")) {
          {}
        } else {
          stryCov_9fa48("135724");
          this.transactionCoordinator = stryMutAct_9fa48("135727") ? options.transactionCoordinator && null : stryMutAct_9fa48("135726") ? false : stryMutAct_9fa48("135725") ? true : (stryCov_9fa48("135725", "135726", "135727"), options.transactionCoordinator || null);
        }
      }
      if (stryMutAct_9fa48("135730") ? this.repository || typeof this.repository.syncOwnerDependencies === 'function' : stryMutAct_9fa48("135729") ? false : stryMutAct_9fa48("135728") ? true : (stryCov_9fa48("135728", "135729", "135730"), this.repository && (stryMutAct_9fa48("135732") ? typeof this.repository.syncOwnerDependencies !== 'function' : stryMutAct_9fa48("135731") ? true : (stryCov_9fa48("135731", "135732"), typeof this.repository.syncOwnerDependencies === (stryMutAct_9fa48("135733") ? "" : (stryCov_9fa48("135733"), 'function')))))) {
        if (stryMutAct_9fa48("135734")) {
          {}
        } else {
          stryCov_9fa48("135734");
          this.repository.syncOwnerDependencies(stryMutAct_9fa48("135735") ? {} : (stryCov_9fa48("135735"), {
            systemTableCache: this.systemTableCache,
            cdcIntegrationService: this.cdcIntegrationService,
            controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
            controlPlaneReadinessService: this.controlPlaneReadinessService,
            logger: this.logger
          }));
        }
      }
      if (stryMutAct_9fa48("135737") ? false : stryMutAct_9fa48("135736") ? true : (stryCov_9fa48("135736", "135737"), this.workflowOwner)) {
        if (stryMutAct_9fa48("135738")) {
          {}
        } else {
          stryCov_9fa48("135738");
          this.workflowOwner.controlPlaneReadinessService = this.controlPlaneReadinessService;
          this.workflowOwner.messageRouter = this.messageRouter;
          this.workflowOwner.tablePolicyService = this.tablePolicyService;
          this.workflowOwner.transactionCoordinator = this.transactionCoordinator;
        }
      }
      if (stryMutAct_9fa48("135741") ? this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.syncOwnerDependencies === 'function' : stryMutAct_9fa48("135740") ? false : stryMutAct_9fa48("135739") ? true : (stryCov_9fa48("135739", "135740", "135741"), this.controlPlaneReadinessService && (stryMutAct_9fa48("135743") ? typeof this.controlPlaneReadinessService.syncOwnerDependencies !== 'function' : stryMutAct_9fa48("135742") ? true : (stryCov_9fa48("135742", "135743"), typeof this.controlPlaneReadinessService.syncOwnerDependencies === (stryMutAct_9fa48("135744") ? "" : (stryCov_9fa48("135744"), 'function')))))) {
        if (stryMutAct_9fa48("135745")) {
          {}
        } else {
          stryCov_9fa48("135745");
          this.controlPlaneReadinessService.syncOwnerDependencies(stryMutAct_9fa48("135746") ? {} : (stryCov_9fa48("135746"), {
            systemTableCache: this.systemTableCache,
            cacheMutationTarget: this.systemTableCache,
            messageRouter: this.messageRouter,
            cdcIntegrationService: this.cdcIntegrationService,
            storageAccountingService: this.storageAccountingService,
            cdcGroupPropagationService: this.cdcGroupPropagationService,
            controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway
          }));
        }
      }
      if (stryMutAct_9fa48("135749") ? this.initialized || previousSystemTableCache !== this.systemTableCache : stryMutAct_9fa48("135748") ? false : stryMutAct_9fa48("135747") ? true : (stryCov_9fa48("135747", "135748", "135749"), this.initialized && (stryMutAct_9fa48("135751") ? previousSystemTableCache === this.systemTableCache : stryMutAct_9fa48("135750") ? true : (stryCov_9fa48("135750", "135751"), previousSystemTableCache !== this.systemTableCache)))) {
        if (stryMutAct_9fa48("135752")) {
          {}
        } else {
          stryCov_9fa48("135752");
          this.unbindSystemTableCacheListener(previousSystemTableCache);
          this.bindSystemTableCacheListener();
        }
      }
    }
  }

  /**
   * Bind coordinator cache-change observation to the current cache.
   * @private
   */
  bindSystemTableCacheListener() {
    if (stryMutAct_9fa48("135753")) {
      {}
    } else {
      stryCov_9fa48("135753");
      if (stryMutAct_9fa48("135756") ? !this.systemTableCache && typeof this.systemTableCache.onCacheChange !== 'function' : stryMutAct_9fa48("135755") ? false : stryMutAct_9fa48("135754") ? true : (stryCov_9fa48("135754", "135755", "135756"), (stryMutAct_9fa48("135757") ? this.systemTableCache : (stryCov_9fa48("135757"), !this.systemTableCache)) || (stryMutAct_9fa48("135759") ? typeof this.systemTableCache.onCacheChange === 'function' : stryMutAct_9fa48("135758") ? false : (stryCov_9fa48("135758", "135759"), typeof this.systemTableCache.onCacheChange !== (stryMutAct_9fa48("135760") ? "" : (stryCov_9fa48("135760"), 'function')))))) {
        if (stryMutAct_9fa48("135761")) {
          {}
        } else {
          stryCov_9fa48("135761");
          return;
        }
      }
      if (stryMutAct_9fa48("135764") ? false : stryMutAct_9fa48("135763") ? true : stryMutAct_9fa48("135762") ? this.cacheChangeListener : (stryCov_9fa48("135762", "135763", "135764"), !this.cacheChangeListener)) {
        if (stryMutAct_9fa48("135765")) {
          {}
        } else {
          stryCov_9fa48("135765");
          this.cacheChangeListener = (tableName, operation, record) => {
            if (stryMutAct_9fa48("135766")) {
              {}
            } else {
              stryCov_9fa48("135766");
              this.handleObservedReplicaStateChange(tableName, operation, record);
            }
          };
        }
      }
      this.systemTableCache.onCacheChange(this.cacheChangeListener);
    }
  }

  /**
   * Remove coordinator cache-change observation from one cache.
   * @param {Object|null} systemTableCache
   * @private
   */
  unbindSystemTableCacheListener(systemTableCache = this.systemTableCache) {
    if (stryMutAct_9fa48("135767")) {
      {}
    } else {
      stryCov_9fa48("135767");
      if (stryMutAct_9fa48("135770") ? (!this.cacheChangeListener || !systemTableCache) && typeof systemTableCache.offCacheChange !== 'function' : stryMutAct_9fa48("135769") ? false : stryMutAct_9fa48("135768") ? true : (stryCov_9fa48("135768", "135769", "135770"), (stryMutAct_9fa48("135772") ? !this.cacheChangeListener && !systemTableCache : stryMutAct_9fa48("135771") ? false : (stryCov_9fa48("135771", "135772"), (stryMutAct_9fa48("135773") ? this.cacheChangeListener : (stryCov_9fa48("135773"), !this.cacheChangeListener)) || (stryMutAct_9fa48("135774") ? systemTableCache : (stryCov_9fa48("135774"), !systemTableCache)))) || (stryMutAct_9fa48("135776") ? typeof systemTableCache.offCacheChange === 'function' : stryMutAct_9fa48("135775") ? false : (stryCov_9fa48("135775", "135776"), typeof systemTableCache.offCacheChange !== (stryMutAct_9fa48("135777") ? "" : (stryCov_9fa48("135777"), 'function')))))) {
        if (stryMutAct_9fa48("135778")) {
          {}
        } else {
          stryCov_9fa48("135778");
          return;
        }
      }
      systemTableCache.offCacheChange(this.cacheChangeListener);
    }
  }

  /**
   * Bind terminal-operation events to recent-intent cache pruning.
   * @private
   */
  bindTerminalOperationIntentPruner() {
    if (stryMutAct_9fa48("135779")) {
      {}
    } else {
      stryCov_9fa48("135779");
      if (stryMutAct_9fa48("135782") ? false : stryMutAct_9fa48("135781") ? true : stryMutAct_9fa48("135780") ? this._boundTerminalOperationIntentPruner : (stryCov_9fa48("135780", "135781", "135782"), !this._boundTerminalOperationIntentPruner)) {
        if (stryMutAct_9fa48("135783")) {
          {}
        } else {
          stryCov_9fa48("135783");
          this._boundTerminalOperationIntentPruner = (payload = {}) => {
            if (stryMutAct_9fa48("135784")) {
              {}
            } else {
              stryCov_9fa48("135784");
              this.pruneRecentOperationIntentsForOperation(stryMutAct_9fa48("135785") ? payload.operation : (stryCov_9fa48("135785"), payload?.operation));
            }
          };
        }
      }
      this.on(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, this._boundTerminalOperationIntentPruner);
      this.on(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED, this._boundTerminalOperationIntentPruner);
    }
  }

  /**
   * Remove terminal-operation recent-intent pruning listeners.
   * @private
   */
  unbindTerminalOperationIntentPruner() {
    if (stryMutAct_9fa48("135786")) {
      {}
    } else {
      stryCov_9fa48("135786");
      if (stryMutAct_9fa48("135789") ? false : stryMutAct_9fa48("135788") ? true : stryMutAct_9fa48("135787") ? this._boundTerminalOperationIntentPruner : (stryCov_9fa48("135787", "135788", "135789"), !this._boundTerminalOperationIntentPruner)) {
        if (stryMutAct_9fa48("135790")) {
          {}
        } else {
          stryCov_9fa48("135790");
          return;
        }
      }
      this.removeListener(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, this._boundTerminalOperationIntentPruner);
      this.removeListener(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED, this._boundTerminalOperationIntentPruner);
    }
  }

  /**
   * Initialize the coordinator.
   */
  initialize() {
    if (stryMutAct_9fa48("135791")) {
      {}
    } else {
      stryCov_9fa48("135791");
      if (stryMutAct_9fa48("135793") ? false : stryMutAct_9fa48("135792") ? true : (stryCov_9fa48("135792", "135793"), this.initialized)) {
        if (stryMutAct_9fa48("135794")) {
          {}
        } else {
          stryCov_9fa48("135794");
          return;
        }
      }
      this.isShuttingDown = stryMutAct_9fa48("135795") ? true : (stryCov_9fa48("135795"), false);

      // Subscribe to executor outcome events through the emitter.
      // Outcomes are routed through the owner-key reconcile queue so
      // the coordinator remains the single writer for workflow fields.
      this._boundOutcomeHandler = stryMutAct_9fa48("135796") ? () => undefined : (stryCov_9fa48("135796"), outcome => this.handleExecutorOutcome(outcome));
      this.executorOutcomeEmitter.on(OUTCOME_EVENT_NAME, this._boundOutcomeHandler);
      this.bindSystemTableCacheListener();
      this.bindTerminalOperationIntentPruner();
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.INITIALIZED, stryMutAct_9fa48("135797") ? {} : (stryCov_9fa48("135797"), {
        nodeId: this.nodeId,
        config: this.config
      }));

      // Start timeout checking
      if (stryMutAct_9fa48("135799") ? false : stryMutAct_9fa48("135798") ? true : (stryCov_9fa48("135798", "135799"), this.enableTimeouts)) {
        if (stryMutAct_9fa48("135800")) {
          {}
        } else {
          stryCov_9fa48("135800");
          this.startTimeoutChecking();
        }
      }
      this.initialized = stryMutAct_9fa48("135801") ? false : (stryCov_9fa48("135801"), true);
    }
  }

  /**
   * Start periodic timeout checking.
   * @private
   */
  startTimeoutChecking() {
    if (stryMutAct_9fa48("135802")) {
      {}
    } else {
      stryCov_9fa48("135802");
      if (stryMutAct_9fa48("135804") ? false : stryMutAct_9fa48("135803") ? true : (stryCov_9fa48("135803", "135804"), this.timeoutCheckInterval)) {
        if (stryMutAct_9fa48("135805")) {
          {}
        } else {
          stryCov_9fa48("135805");
          return;
        }
      }
      this.timeoutCheckInterval = setInterval(() => {
        if (stryMutAct_9fa48("135806")) {
          {}
        } else {
          stryCov_9fa48("135806");
          if (stryMutAct_9fa48("135809") ? this.isShuttingDown && this.timeoutCheckInFlight === true : stryMutAct_9fa48("135808") ? false : stryMutAct_9fa48("135807") ? true : (stryCov_9fa48("135807", "135808", "135809"), this.isShuttingDown || (stryMutAct_9fa48("135811") ? this.timeoutCheckInFlight !== true : stryMutAct_9fa48("135810") ? false : (stryCov_9fa48("135810", "135811"), this.timeoutCheckInFlight === (stryMutAct_9fa48("135812") ? false : (stryCov_9fa48("135812"), true)))))) {
            if (stryMutAct_9fa48("135813")) {
              {}
            } else {
              stryCov_9fa48("135813");
              return;
            }
          }
          this.timeoutCheckInFlight = stryMutAct_9fa48("135814") ? false : (stryCov_9fa48("135814"), true);
          void this.checkTimeouts().catch(error => {
            if (stryMutAct_9fa48("135815")) {
              {}
            } else {
              stryCov_9fa48("135815");
              this.logQueryOperationsFailure(error);
            }
          }).finally(() => {
            if (stryMutAct_9fa48("135816")) {
              {}
            } else {
              stryCov_9fa48("135816");
              this.timeoutCheckInFlight = stryMutAct_9fa48("135817") ? true : (stryCov_9fa48("135817"), false);
            }
          });
        }
      }, this.timeoutCheckIntervalMs);
      // Unref to allow process exit when this is the only timer
      this.timeoutCheckInterval.unref();
    }
  }

  /**
   * Stop periodic timeout checking.
   * @private
   */
  stopTimeoutChecking() {
    if (stryMutAct_9fa48("135818")) {
      {}
    } else {
      stryCov_9fa48("135818");
      if (stryMutAct_9fa48("135820") ? false : stryMutAct_9fa48("135819") ? true : (stryCov_9fa48("135819", "135820"), this.timeoutCheckInterval)) {
        if (stryMutAct_9fa48("135821")) {
          {}
        } else {
          stryCov_9fa48("135821");
          clearInterval(this.timeoutCheckInterval);
          this.timeoutCheckInterval = null;
        }
      }
      this.timeoutCheckInFlight = stryMutAct_9fa48("135822") ? true : (stryCov_9fa48("135822"), false);
    }
  }

  /**
   * Query an operation by ID using SQL engine.
   * Per system guidelines: all system information access via SQL engine.
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation or null if not found.
   * @private
   */
  async queryOperationById(operationId) {
    if (stryMutAct_9fa48("135823")) {
      {}
    } else {
      stryCov_9fa48("135823");
      return this.repository.queryOperationById(operationId);
    }
  }

  /**
   * Query incomplete operations using SQL engine.
   * @readModel COORDINATOR_TIMEOUT_QUERY — READ_MODEL_SOURCE.RECOVERY_SQL
   * @param {Object} [options={}]
   * @param {boolean} [options.preferAuthoritativeRead]
   * @return {Promise<Array<Object>>} Array of incomplete operations.
   * @private
   */
  async queryIncompleteOperations(options = {}) {
    if (stryMutAct_9fa48("135824")) {
      {}
    } else {
      stryCov_9fa48("135824");
      const preferAuthoritativeRead = stryMutAct_9fa48("135827") ? options.preferAuthoritativeRead !== true : stryMutAct_9fa48("135826") ? false : stryMutAct_9fa48("135825") ? true : (stryCov_9fa48("135825", "135826", "135827"), options.preferAuthoritativeRead === (stryMutAct_9fa48("135828") ? false : (stryCov_9fa48("135828"), true)));
      if (stryMutAct_9fa48("135831") ? !preferAuthoritativeRead || this.isLocalRouterBackpressured(options) : stryMutAct_9fa48("135830") ? false : stryMutAct_9fa48("135829") ? true : (stryCov_9fa48("135829", "135830", "135831"), (stryMutAct_9fa48("135832") ? preferAuthoritativeRead : (stryCov_9fa48("135832"), !preferAuthoritativeRead)) && this.isLocalRouterBackpressured(options))) {
        if (stryMutAct_9fa48("135833")) {
          {}
        } else {
          stryCov_9fa48("135833");
          return this.queryCachedIncompleteOperations();
        }
      }
      return this.repository.queryIncompleteOperations(stryMutAct_9fa48("135834") ? {} : (stryCov_9fa48("135834"), {
        preferAuthoritativeRead
      }));
    }
  }

  /**
   * Query only the cache-visible incomplete operations.
   * This keeps cache-bound observation semantics explicit instead of exposing
   * cache-empty fallback tuning on the general repository API.
   *
   * @return {Promise<Array<Object>>}
   * @private
   */
  async queryCachedIncompleteOperations() {
    if (stryMutAct_9fa48("135835")) {
      {}
    } else {
      stryCov_9fa48("135835");
      if (stryMutAct_9fa48("135838") ? typeof this.repository?.queryCachedIncompleteOperations !== 'function' : stryMutAct_9fa48("135837") ? false : stryMutAct_9fa48("135836") ? true : (stryCov_9fa48("135836", "135837", "135838"), typeof (stryMutAct_9fa48("135839") ? this.repository.queryCachedIncompleteOperations : (stryCov_9fa48("135839"), this.repository?.queryCachedIncompleteOperations)) === (stryMutAct_9fa48("135840") ? "" : (stryCov_9fa48("135840"), 'function')))) {
        if (stryMutAct_9fa48("135841")) {
          {}
        } else {
          stryCov_9fa48("135841");
          return this.repository.queryCachedIncompleteOperations();
        }
      }
      return this.repository.queryIncompleteOperations(stryMutAct_9fa48("135842") ? {} : (stryCov_9fa48("135842"), {
        skipSqlFallbackWhenCacheEmpty: stryMutAct_9fa48("135843") ? false : (stryCov_9fa48("135843"), true)
      }));
    }
  }

  /**
   * Merge cache-visible and authoritative incomplete operation sets.
   * Authoritative rows win when both sources contain the same operation ID.
   *
   * Cache observation boundaries can lag individual rows. Timeout/recovery
   * loops must not stall just because one local cache snapshot only contains a
   * subset of the owner-authoritative in-flight operations.
   *
   * @param {Array<Object>} cachedIncompleteOps
   * @param {Array<Object>} authoritativeIncompleteOps
   * @return {Array<Object>}
   * @private
   */
  mergeIncompleteOperations(cachedIncompleteOps = stryMutAct_9fa48("135844") ? ["Stryker was here"] : (stryCov_9fa48("135844"), []), authoritativeIncompleteOps = stryMutAct_9fa48("135845") ? ["Stryker was here"] : (stryCov_9fa48("135845"), [])) {
    if (stryMutAct_9fa48("135846")) {
      {}
    } else {
      stryCov_9fa48("135846");
      const mergedByOperationId = new Map();
      for (const operation of cachedIncompleteOps) {
        if (stryMutAct_9fa48("135847")) {
          {}
        } else {
          stryCov_9fa48("135847");
          if (stryMutAct_9fa48("135850") ? false : stryMutAct_9fa48("135849") ? true : stryMutAct_9fa48("135848") ? operation?.operationId : (stryCov_9fa48("135848", "135849", "135850"), !(stryMutAct_9fa48("135851") ? operation.operationId : (stryCov_9fa48("135851"), operation?.operationId)))) {
            if (stryMutAct_9fa48("135852")) {
              {}
            } else {
              stryCov_9fa48("135852");
              continue;
            }
          }
          mergedByOperationId.set(operation.operationId, operation);
        }
      }
      for (const operation of authoritativeIncompleteOps) {
        if (stryMutAct_9fa48("135853")) {
          {}
        } else {
          stryCov_9fa48("135853");
          if (stryMutAct_9fa48("135856") ? false : stryMutAct_9fa48("135855") ? true : stryMutAct_9fa48("135854") ? operation?.operationId : (stryCov_9fa48("135854", "135855", "135856"), !(stryMutAct_9fa48("135857") ? operation.operationId : (stryCov_9fa48("135857"), operation?.operationId)))) {
            if (stryMutAct_9fa48("135858")) {
              {}
            } else {
              stryCov_9fa48("135858");
              continue;
            }
          }
          mergedByOperationId.set(operation.operationId, operation);
        }
      }
      return stryMutAct_9fa48("135859") ? [...mergedByOperationId.values()] : (stryCov_9fa48("135859"), (stryMutAct_9fa48("135860") ? [] : (stryCov_9fa48("135860"), [...mergedByOperationId.values()])).sort((left, right) => {
        if (stryMutAct_9fa48("135861")) {
          {}
        } else {
          stryCov_9fa48("135861");
          const leftUpdatedAt = stryMutAct_9fa48("135864") ? Number(left?.updatedAt) && NUM.ZERO : stryMutAct_9fa48("135863") ? false : stryMutAct_9fa48("135862") ? true : (stryCov_9fa48("135862", "135863", "135864"), Number(stryMutAct_9fa48("135865") ? left.updatedAt : (stryCov_9fa48("135865"), left?.updatedAt)) || NUM.ZERO);
          const rightUpdatedAt = stryMutAct_9fa48("135868") ? Number(right?.updatedAt) && NUM.ZERO : stryMutAct_9fa48("135867") ? false : stryMutAct_9fa48("135866") ? true : (stryCov_9fa48("135866", "135867", "135868"), Number(stryMutAct_9fa48("135869") ? right.updatedAt : (stryCov_9fa48("135869"), right?.updatedAt)) || NUM.ZERO);
          if (stryMutAct_9fa48("135872") ? leftUpdatedAt === rightUpdatedAt : stryMutAct_9fa48("135871") ? false : stryMutAct_9fa48("135870") ? true : (stryCov_9fa48("135870", "135871", "135872"), leftUpdatedAt !== rightUpdatedAt)) {
            if (stryMutAct_9fa48("135873")) {
              {}
            } else {
              stryCov_9fa48("135873");
              return stryMutAct_9fa48("135874") ? leftUpdatedAt + rightUpdatedAt : (stryCov_9fa48("135874"), leftUpdatedAt - rightUpdatedAt);
            }
          }
          return String(stryMutAct_9fa48("135877") ? left?.operationId && '' : stryMutAct_9fa48("135876") ? false : stryMutAct_9fa48("135875") ? true : (stryCov_9fa48("135875", "135876", "135877"), (stryMutAct_9fa48("135878") ? left.operationId : (stryCov_9fa48("135878"), left?.operationId)) || (stryMutAct_9fa48("135879") ? "Stryker was here!" : (stryCov_9fa48("135879"), '')))).localeCompare(String(stryMutAct_9fa48("135882") ? right?.operationId && '' : stryMutAct_9fa48("135881") ? false : stryMutAct_9fa48("135880") ? true : (stryCov_9fa48("135880", "135881", "135882"), (stryMutAct_9fa48("135883") ? right.operationId : (stryCov_9fa48("135883"), right?.operationId)) || (stryMutAct_9fa48("135884") ? "Stryker was here!" : (stryCov_9fa48("135884"), '')))));
        }
      }));
    }
  }

  /**
   * Check for existing in-flight operation for entity/node combination.
   * Prevents duplicate operations (deduplication).
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {string} partitionId - Partition ID compatibility key.
   * @param {string} targetNodeId - Target node ID.
   * @param {string} entityType - Entity type (partition/message_group).
   * @param {string} entityId - Entity ID.
   * @return {Promise<Object|null>} Existing operation or null.
   * @private
   */
  async queryExistingInFlightOperation(partitionId, targetNodeId, entityType, entityId, move, options = {}) {
    if (stryMutAct_9fa48("135885")) {
      {}
    } else {
      stryCov_9fa48("135885");
      return this.repository.queryExistingInFlightOperation(partitionId, targetNodeId, entityType, entityId, move, this.operationMatchesMoveIntent.bind(this), options);
    }
  }

  /**
   * Convert database row to Operation object.
   * @param {Object} row - Database row.
   * @return {Object} Operation object.
   * @private
   */
  rowToOperation(row) {
    if (stryMutAct_9fa48("135886")) {
      {}
    } else {
      stryCov_9fa48("135886");
      return this.repository.rowToOperation(row);
    }
  }

  /**
   * Determine whether an operation has reached its terminal workflow step.
   * Falls back to status when workflow data is incomplete.
   * @param {Object} operation - Operation row or payload.
   * @return {boolean} True when terminal.
   * @private
   */
  isOperationTerminal(operation) {
    if (stryMutAct_9fa48("135887")) {
      {}
    } else {
      stryCov_9fa48("135887");
      return this.repository.isOperationTerminal(operation);
    }
  }

  /**
   * Resolve the canonical owner node for one operation lifecycle.
   * Source node owns operation progression. Legacy rows may fall back to
   * target node ownership when source is unavailable.
   * @param {Object} operation
   * @return {string|null}
   * @private
   */
  resolveOperationOwnerNodeId(operation) {
    if (stryMutAct_9fa48("135888")) {
      {}
    } else {
      stryCov_9fa48("135888");
      return this.repository.resolveOperationOwnerNodeId(operation);
    }
  }

  /**
   * Return true when this coordinator owns operation lifecycle progression.
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isOperationLocallyOwned(operation) {
    if (stryMutAct_9fa48("135889")) {
      {}
    } else {
      stryCov_9fa48("135889");
      return this.repository.isOperationLocallyOwned(operation);
    }
  }

  /**
   * Resolve source replica ID for REPLACE operations.
   * @param {Object} operation - Operation payload.
   * @return {string|null} Source replica ID or null.
   * @private
   */
  getReplaceSourceReplicaId(operation) {
    if (stryMutAct_9fa48("135890")) {
      {}
    } else {
      stryCov_9fa48("135890");
      return this.repository.getReplaceSourceReplicaId(operation);
    }
  }

  /**
   * Check whether a REPLACE operation is in source-removal phase.
   * @param {Object} operation - Operation payload.
   * @return {boolean} True when REPLACE should remove the source replica.
   * @private
   */
  isReplaceRemovePhase(operation) {
    if (stryMutAct_9fa48("135891")) {
      {}
    } else {
      stryCov_9fa48("135891");
      return this.repository.isReplaceRemovePhase(operation);
    }
  }

  /**
   * Check whether a REPLACE operation is dispatching/reconciling source
   * removal (ACTIVE/STOPPING).
   * @param {Object} operation - Operation payload.
   * @return {boolean} True when REPLACE is in source-removal dispatch phase.
   * @private
   */
  isReplaceRemoveDispatchPhase(operation) {
    if (stryMutAct_9fa48("135892")) {
      {}
    } else {
      stryCov_9fa48("135892");
      return this.repository.isReplaceRemoveDispatchPhase(operation);
    }
  }

  /**
   * Resolve target replica ID for REPLACE operations.
   * @param {Object} operation - Operation record.
   * @return {string|null} Target replacement replica ID.
   * @private
   */
  getReplaceTargetReplicaId(operation) {
    if (stryMutAct_9fa48("135893")) {
      {}
    } else {
      stryCov_9fa48("135893");
      return this.repository.getReplaceTargetReplicaId(operation);
    }
  }

  /**
   * Get service rows for an entity.
   * @readModel COORDINATOR_ENTITY_SERVICES —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} params - Lookup parameters.
   * @param {string} params.partitionId - Partition ID.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Array<Object>} Matching services rows.
   * @private
   */
  getEntityServiceRows({
    partitionId,
    entityType,
    entityId
  }) {
    if (stryMutAct_9fa48("135894")) {
      {}
    } else {
      stryCov_9fa48("135894");
      return this.repository.getEntityServiceRows(stryMutAct_9fa48("135895") ? {} : (stryCov_9fa48("135895"), {
        partitionId,
        entityType,
        entityId
      }));
    }
  }

  /**
   * Read entity service rows from the authoritative services owner path.
   * Falls back to an empty list when the authoritative read is unavailable.
   * @readModel COORDINATOR_ENTITY_SERVICES_AUTHORITATIVE —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getAuthoritativeEntityServiceRows({
    partitionId,
    entityType,
    entityId
  }) {
    if (stryMutAct_9fa48("135896")) {
      {}
    } else {
      stryCov_9fa48("135896");
      let sql = SQL.SELECT_PARTITION_SERVICES_BY_ENTITY;
      let params = stryMutAct_9fa48("135897") ? [] : (stryCov_9fa48("135897"), [stryMutAct_9fa48("135900") ? entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("135899") ? false : stryMutAct_9fa48("135898") ? true : (stryCov_9fa48("135898", "135899", "135900"), entityType || SERVICE_TYPE.PARTITION), stryMutAct_9fa48("135903") ? partitionId && entityId : stryMutAct_9fa48("135902") ? false : stryMutAct_9fa48("135901") ? true : (stryCov_9fa48("135901", "135902", "135903"), partitionId || entityId)]);
      if (stryMutAct_9fa48("135906") ? entityType !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("135905") ? false : stryMutAct_9fa48("135904") ? true : (stryCov_9fa48("135904", "135905", "135906"), entityType === SERVICE_TYPE.MESSAGE_GROUP)) {
        if (stryMutAct_9fa48("135907")) {
          {}
        } else {
          stryCov_9fa48("135907");
          sql = SQL.SELECT_MESSAGE_GROUP_SERVICES_BY_ENTITY;
          params = stryMutAct_9fa48("135908") ? [] : (stryCov_9fa48("135908"), [entityType, entityId]);
        }
      } else if (stryMutAct_9fa48("135911") ? entityType !== UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE : stryMutAct_9fa48("135910") ? false : stryMutAct_9fa48("135909") ? true : (stryCov_9fa48("135909", "135910", "135911"), entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE)) {
        if (stryMutAct_9fa48("135912")) {
          {}
        } else {
          stryCov_9fa48("135912");
          sql = SQL.SELECT_RUNTIME_SERVICES_BY_ENTITY;
          params = stryMutAct_9fa48("135913") ? [] : (stryCov_9fa48("135913"), [entityType, entityId]);
        }
      }
      const result = await readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.SERVICES, sql, params, CONTROL_PLANE_QUERY_OPTIONS);
      if (stryMutAct_9fa48("135916") ? !result.success && !Array.isArray(result.rows) : stryMutAct_9fa48("135915") ? false : stryMutAct_9fa48("135914") ? true : (stryCov_9fa48("135914", "135915", "135916"), (stryMutAct_9fa48("135917") ? result.success : (stryCov_9fa48("135917"), !result.success)) || (stryMutAct_9fa48("135918") ? Array.isArray(result.rows) : (stryCov_9fa48("135918"), !Array.isArray(result.rows))))) {
        if (stryMutAct_9fa48("135919")) {
          {}
        } else {
          stryCov_9fa48("135919");
          return stryMutAct_9fa48("135920") ? ["Stryker was here"] : (stryCov_9fa48("135920"), []);
        }
      }
      return result.rows;
    }
  }

  /**
   * Get in-flight operation rows for an entity.
   * @readModel COORDINATOR_ENTITY_IN_FLIGHT —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} params - Lookup parameters.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Array<Object>} Matching in-flight operations.
   * @private
   */
  getEntityInFlightOperationRows({
    entityType,
    entityId
  }) {
    if (stryMutAct_9fa48("135921")) {
      {}
    } else {
      stryCov_9fa48("135921");
      return this.repository.getEntityInFlightOperationRows(stryMutAct_9fa48("135922") ? {} : (stryCov_9fa48("135922"), {
        entityType,
        entityId
      }));
    }
  }

  /**
   * Read one replica_operations row from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {string} operationId
   * @return {Object|null}
   * @private
   */
  getReplicaOperationRowFromCache(operationId) {
    if (stryMutAct_9fa48("135923")) {
      {}
    } else {
      stryCov_9fa48("135923");
      return this.repository.getReplicaOperationRowFromCache(operationId);
    }
  }

  /**
   * Filter replica_operations rows from the cache observation boundary.
   * Returns null when the cache cannot answer the request.
   * @param {Function} predicate
   * @return {Object[]|null}
   * @private
   */
  filterReplicaOperationRowsFromCache(predicate) {
    if (stryMutAct_9fa48("135924")) {
      {}
    } else {
      stryCov_9fa48("135924");
      return this.repository.filterReplicaOperationRowsFromCache(predicate);
    }
  }

  /**
   * Return true when one operation can advance from observed replica
   * progress. Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isObservedProgressOperationCandidate(operation) {
    if (stryMutAct_9fa48("135925")) {
      {}
    } else {
      stryCov_9fa48("135925");
      return this.workflowOwner.isObservedProgressOperationCandidate(operation);
    }
  }

  /**
   * Filter candidate operation ids for one observed services row.
   * Delegates to workflow owner (D7.1).
   * @param {Object} serviceRow
   * @param {string} cacheOperation
   * @return {string[]}
   * @private
   */
  findObservedProgressOperationIds(serviceRow, cacheOperation) {
    if (stryMutAct_9fa48("135926")) {
      {}
    } else {
      stryCov_9fa48("135926");
      return this.workflowOwner.findObservedProgressOperationIds(serviceRow, cacheOperation);
    }
  }

  /**
   * Reconcile one observed replica-progress event.
   * Delegates to workflow owner (D7.1).
   * @param {string} operationId
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileObservedProgressOperation(operationId) {
    if (stryMutAct_9fa48("135927")) {
      {}
    } else {
      stryCov_9fa48("135927");
      return this.workflowOwner.reconcileObservedProgressOperation(operationId);
    }
  }

  /**
   * Observe services cache progress and re-enter the owner lane.
   * Delegates to workflow owner (D7.1).
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Object} record
   * @return {void}
   * @private
   */
  handleObservedReplicaStateChange(tableName, cacheOperation, record) {
    if (stryMutAct_9fa48("135928")) {
      {}
    } else {
      stryCov_9fa48("135928");
      return this.workflowOwner.handleObservedReplicaStateChange(tableName, cacheOperation, record);
    }
  }

  /**
   * Resolve in-flight replica IDs for an entity from authoritative SQL.
   * Single read-model path — no cache fallback.
   * @readModel COORDINATOR_OPERATION_DEDUP —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} params - Lookup parameters.
   * @param {string} params.partitionId - Partition ID compatibility key.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @return {Promise<Set<string>>} In-flight replica IDs.
   * @private
   */
  async getEntityInFlightReplicaIds({
    partitionId,
    entityType,
    entityId
  }) {
    if (stryMutAct_9fa48("135929")) {
      {}
    } else {
      stryCov_9fa48("135929");
      return this.repository.getEntityInFlightReplicaIds(stryMutAct_9fa48("135930") ? {} : (stryCov_9fa48("135930"), {
        partitionId,
        entityType,
        entityId
      }));
    }
  }

  /**
   * Allocate canonical replica ID for ADD/REPLACE create phase.
   * Canonical format mirrors bootstrap replicas: `${entityId}-rN`.
   * @param {Object} params - Allocation parameters.
   * @param {string} params.partitionId - Partition ID.
   * @param {string} params.entityType - Entity type.
   * @param {string} params.entityId - Entity ID.
   * @param {Array<string>} [params.excludeReplicaIds] - IDs that cannot be
   *   selected (e.g., REPLACE source replica during create phase).
   * @return {Promise<string>} Allocated canonical replica ID.
   * @private
   */
  async allocateCanonicalReplicaId({
    partitionId,
    entityType,
    entityId,
    excludeReplicaIds = stryMutAct_9fa48("135931") ? ["Stryker was here"] : (stryCov_9fa48("135931"), [])
  }) {
    if (stryMutAct_9fa48("135932")) {
      {}
    } else {
      stryCov_9fa48("135932");
      const usedReplicaIds = new Set();
      const serviceRows = this.getEntityServiceRows(stryMutAct_9fa48("135933") ? {} : (stryCov_9fa48("135933"), {
        partitionId,
        entityType,
        entityId
      }));
      const authoritativeServiceRows = await this.getAuthoritativeEntityServiceRows(stryMutAct_9fa48("135934") ? {} : (stryCov_9fa48("135934"), {
        partitionId,
        entityType,
        entityId
      }));
      const inFlightReplicaIds = await this.getEntityInFlightReplicaIds(stryMutAct_9fa48("135935") ? {} : (stryCov_9fa48("135935"), {
        partitionId,
        entityType,
        entityId
      }));
      for (const row of serviceRows) {
        if (stryMutAct_9fa48("135936")) {
          {}
        } else {
          stryCov_9fa48("135936");
          const replicaId = stryMutAct_9fa48("135939") ? row?.service_id && row?.replica_id : stryMutAct_9fa48("135938") ? false : stryMutAct_9fa48("135937") ? true : (stryCov_9fa48("135937", "135938", "135939"), (stryMutAct_9fa48("135940") ? row.service_id : (stryCov_9fa48("135940"), row?.service_id)) || (stryMutAct_9fa48("135941") ? row.replica_id : (stryCov_9fa48("135941"), row?.replica_id)));
          if (stryMutAct_9fa48("135944") ? typeof replicaId === 'string' || replicaId.length > 0 : stryMutAct_9fa48("135943") ? false : stryMutAct_9fa48("135942") ? true : (stryCov_9fa48("135942", "135943", "135944"), (stryMutAct_9fa48("135946") ? typeof replicaId !== 'string' : stryMutAct_9fa48("135945") ? true : (stryCov_9fa48("135945", "135946"), typeof replicaId === (stryMutAct_9fa48("135947") ? "" : (stryCov_9fa48("135947"), 'string')))) && (stryMutAct_9fa48("135950") ? replicaId.length <= 0 : stryMutAct_9fa48("135949") ? replicaId.length >= 0 : stryMutAct_9fa48("135948") ? true : (stryCov_9fa48("135948", "135949", "135950"), replicaId.length > 0)))) {
            if (stryMutAct_9fa48("135951")) {
              {}
            } else {
              stryCov_9fa48("135951");
              usedReplicaIds.add(replicaId);
            }
          }
        }
      }
      for (const row of authoritativeServiceRows) {
        if (stryMutAct_9fa48("135952")) {
          {}
        } else {
          stryCov_9fa48("135952");
          const replicaId = stryMutAct_9fa48("135955") ? row?.service_id && row?.replica_id : stryMutAct_9fa48("135954") ? false : stryMutAct_9fa48("135953") ? true : (stryCov_9fa48("135953", "135954", "135955"), (stryMutAct_9fa48("135956") ? row.service_id : (stryCov_9fa48("135956"), row?.service_id)) || (stryMutAct_9fa48("135957") ? row.replica_id : (stryCov_9fa48("135957"), row?.replica_id)));
          if (stryMutAct_9fa48("135960") ? typeof replicaId === 'string' || replicaId.length > 0 : stryMutAct_9fa48("135959") ? false : stryMutAct_9fa48("135958") ? true : (stryCov_9fa48("135958", "135959", "135960"), (stryMutAct_9fa48("135962") ? typeof replicaId !== 'string' : stryMutAct_9fa48("135961") ? true : (stryCov_9fa48("135961", "135962"), typeof replicaId === (stryMutAct_9fa48("135963") ? "" : (stryCov_9fa48("135963"), 'string')))) && (stryMutAct_9fa48("135966") ? replicaId.length <= 0 : stryMutAct_9fa48("135965") ? replicaId.length >= 0 : stryMutAct_9fa48("135964") ? true : (stryCov_9fa48("135964", "135965", "135966"), replicaId.length > 0)))) {
            if (stryMutAct_9fa48("135967")) {
              {}
            } else {
              stryCov_9fa48("135967");
              usedReplicaIds.add(replicaId);
            }
          }
        }
      }
      for (const replicaId of inFlightReplicaIds) {
        if (stryMutAct_9fa48("135968")) {
          {}
        } else {
          stryCov_9fa48("135968");
          usedReplicaIds.add(replicaId);
        }
      }
      for (const replicaId of excludeReplicaIds) {
        if (stryMutAct_9fa48("135969")) {
          {}
        } else {
          stryCov_9fa48("135969");
          if (stryMutAct_9fa48("135972") ? typeof replicaId === 'string' || replicaId.length > 0 : stryMutAct_9fa48("135971") ? false : stryMutAct_9fa48("135970") ? true : (stryCov_9fa48("135970", "135971", "135972"), (stryMutAct_9fa48("135974") ? typeof replicaId !== 'string' : stryMutAct_9fa48("135973") ? true : (stryCov_9fa48("135973", "135974"), typeof replicaId === (stryMutAct_9fa48("135975") ? "" : (stryCov_9fa48("135975"), 'string')))) && (stryMutAct_9fa48("135978") ? replicaId.length <= 0 : stryMutAct_9fa48("135977") ? replicaId.length >= 0 : stryMutAct_9fa48("135976") ? true : (stryCov_9fa48("135976", "135977", "135978"), replicaId.length > 0)))) {
            if (stryMutAct_9fa48("135979")) {
              {}
            } else {
              stryCov_9fa48("135979");
              usedReplicaIds.add(replicaId);
            }
          }
        }
      }
      const canonicalPrefix = stryMutAct_9fa48("135980") ? `` : (stryCov_9fa48("135980"), `${entityId}${REPLICA_ID_SEPARATOR}`);
      let candidateIndex = REPLICA_ID_START_INDEX;
      while (stryMutAct_9fa48("135982") ? false : stryMutAct_9fa48("135981") ? false : (stryCov_9fa48("135981", "135982"), true)) {
        if (stryMutAct_9fa48("135983")) {
          {}
        } else {
          stryCov_9fa48("135983");
          const candidateReplicaId = stryMutAct_9fa48("135984") ? `` : (stryCov_9fa48("135984"), `${canonicalPrefix}${candidateIndex}`);
          if (stryMutAct_9fa48("135987") ? false : stryMutAct_9fa48("135986") ? true : stryMutAct_9fa48("135985") ? usedReplicaIds.has(candidateReplicaId) : (stryCov_9fa48("135985", "135986", "135987"), !usedReplicaIds.has(candidateReplicaId))) {
            if (stryMutAct_9fa48("135988")) {
              {}
            } else {
              stryCov_9fa48("135988");
              return candidateReplicaId;
            }
          }
          stryMutAct_9fa48("135989") ? candidateIndex-- : (stryCov_9fa48("135989"), candidateIndex++);
        }
      }
    }
  }

  /**
   * Normalize one move type to canonical upper-case enum representation.
   * @param {string} moveType
   * @return {string|null}
   * @private
   */
  normalizeMoveType(moveType) {
    if (stryMutAct_9fa48("135990")) {
      {}
    } else {
      stryCov_9fa48("135990");
      if (stryMutAct_9fa48("135993") ? typeof moveType === 'string' : stryMutAct_9fa48("135992") ? false : stryMutAct_9fa48("135991") ? true : (stryCov_9fa48("135991", "135992", "135993"), typeof moveType !== (stryMutAct_9fa48("135994") ? "" : (stryCov_9fa48("135994"), 'string')))) {
        if (stryMutAct_9fa48("135995")) {
          {}
        } else {
          stryCov_9fa48("135995");
          return null;
        }
      }
      const normalized = stryMutAct_9fa48("135996") ? moveType.toLowerCase() : (stryCov_9fa48("135996"), moveType.toUpperCase());
      if (stryMutAct_9fa48("135999") ? normalized.length !== NUM.ZERO : stryMutAct_9fa48("135998") ? false : stryMutAct_9fa48("135997") ? true : (stryCov_9fa48("135997", "135998", "135999"), normalized.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("136000")) {
          {}
        } else {
          stryCov_9fa48("136000");
          return null;
        }
      }
      return normalized;
    }
  }

  /**
   * Build a stable in-memory idempotency key for a move intent.
   * @param {Object} move - Move specification.
   * @param {string} entityType - Canonical entity type.
   * @param {string} entityId - Canonical entity ID.
   * @return {string} Intent key.
   * @private
   */
  buildOperationIntentKey(move, entityType, entityId) {
    if (stryMutAct_9fa48("136001")) {
      {}
    } else {
      stryCov_9fa48("136001");
      const normalizedType = stryMutAct_9fa48("136004") ? this.normalizeMoveType(move?.type) && '' : stryMutAct_9fa48("136003") ? false : stryMutAct_9fa48("136002") ? true : (stryCov_9fa48("136002", "136003", "136004"), this.normalizeMoveType(stryMutAct_9fa48("136005") ? move.type : (stryCov_9fa48("136005"), move?.type)) || (stryMutAct_9fa48("136006") ? "Stryker was here!" : (stryCov_9fa48("136006"), '')));
      const targetNodeId = stryMutAct_9fa48("136009") ? move?.nodeId && '' : stryMutAct_9fa48("136008") ? false : stryMutAct_9fa48("136007") ? true : (stryCov_9fa48("136007", "136008", "136009"), (stryMutAct_9fa48("136010") ? move.nodeId : (stryCov_9fa48("136010"), move?.nodeId)) || (stryMutAct_9fa48("136011") ? "Stryker was here!" : (stryCov_9fa48("136011"), '')));
      const replicaIntent = (stryMutAct_9fa48("136014") ? normalizedType === OperationType.REMOVE && normalizedType === OperationType.REPLACE : stryMutAct_9fa48("136013") ? false : stryMutAct_9fa48("136012") ? true : (stryCov_9fa48("136012", "136013", "136014"), (stryMutAct_9fa48("136016") ? normalizedType !== OperationType.REMOVE : stryMutAct_9fa48("136015") ? false : (stryCov_9fa48("136015", "136016"), normalizedType === OperationType.REMOVE)) || (stryMutAct_9fa48("136018") ? normalizedType !== OperationType.REPLACE : stryMutAct_9fa48("136017") ? false : (stryCov_9fa48("136017", "136018"), normalizedType === OperationType.REPLACE)))) ? stryMutAct_9fa48("136021") ? move?.replicaId && '' : stryMutAct_9fa48("136020") ? false : stryMutAct_9fa48("136019") ? true : (stryCov_9fa48("136019", "136020", "136021"), (stryMutAct_9fa48("136022") ? move.replicaId : (stryCov_9fa48("136022"), move?.replicaId)) || (stryMutAct_9fa48("136023") ? "Stryker was here!" : (stryCov_9fa48("136023"), ''))) : stryMutAct_9fa48("136024") ? "Stryker was here!" : (stryCov_9fa48("136024"), '');
      return stryMutAct_9fa48("136025") ? `` : (stryCov_9fa48("136025"), `${entityType}:${entityId}:${normalizedType}:${targetNodeId}:${replicaIntent}`);
    }
  }

  /**
   * Critical system partitions allow only one add-like recovery lifecycle in
   * flight. Use one broader key so target-node churn or authoritative entity
   * read misses cannot mint a second PENDING replacement for the same entity.
   *
   * @param {string|null} normalizedMoveType
   * @param {string} partitionId
   * @param {string} entityType
   * @param {string} entityId
   * @return {string|null}
   * @private
   */
  buildCriticalAddLikeIntentKey(move, normalizedMoveType, partitionId, entityType, entityId) {
    if (stryMutAct_9fa48("136026")) {
      {}
    } else {
      stryCov_9fa48("136026");
      if (stryMutAct_9fa48("136029") ? (move?.enforceConcurrentOperationBudget !== true || normalizedMoveType !== OperationType.ADD && normalizedMoveType !== OperationType.REPLACE) && !this.isCriticalSystemPartition(partitionId) : stryMutAct_9fa48("136028") ? false : stryMutAct_9fa48("136027") ? true : (stryCov_9fa48("136027", "136028", "136029"), (stryMutAct_9fa48("136031") ? move?.enforceConcurrentOperationBudget !== true && normalizedMoveType !== OperationType.ADD && normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136030") ? false : (stryCov_9fa48("136030", "136031"), (stryMutAct_9fa48("136033") ? move?.enforceConcurrentOperationBudget === true : stryMutAct_9fa48("136032") ? false : (stryCov_9fa48("136032", "136033"), (stryMutAct_9fa48("136034") ? move.enforceConcurrentOperationBudget : (stryCov_9fa48("136034"), move?.enforceConcurrentOperationBudget)) !== (stryMutAct_9fa48("136035") ? false : (stryCov_9fa48("136035"), true)))) || (stryMutAct_9fa48("136037") ? normalizedMoveType !== OperationType.ADD || normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136036") ? false : (stryCov_9fa48("136036", "136037"), (stryMutAct_9fa48("136039") ? normalizedMoveType === OperationType.ADD : stryMutAct_9fa48("136038") ? true : (stryCov_9fa48("136038", "136039"), normalizedMoveType !== OperationType.ADD)) && (stryMutAct_9fa48("136041") ? normalizedMoveType === OperationType.REPLACE : stryMutAct_9fa48("136040") ? true : (stryCov_9fa48("136040", "136041"), normalizedMoveType !== OperationType.REPLACE)))))) || (stryMutAct_9fa48("136042") ? this.isCriticalSystemPartition(partitionId) : (stryCov_9fa48("136042"), !this.isCriticalSystemPartition(partitionId))))) {
        if (stryMutAct_9fa48("136043")) {
          {}
        } else {
          stryCov_9fa48("136043");
          return null;
        }
      }
      return stryMutAct_9fa48("136044") ? `` : (stryCov_9fa48("136044"), `${entityType}:${entityId}:critical_add_like`);
    }
  }

  /**
   * Determine whether an in-flight operation matches a new move intent.
   * @param {Object} operation - Existing operation.
   * @param {Object} move - New move request.
   * @param {string} entityType - Canonical entity type.
   * @param {string} entityId - Canonical entity ID.
   * @return {boolean} True when intents match.
   * @private
   */
  operationMatchesMoveIntent(operation, move, entityType, entityId) {
    if (stryMutAct_9fa48("136045")) {
      {}
    } else {
      stryCov_9fa48("136045");
      if (stryMutAct_9fa48("136048") ? !operation && !move : stryMutAct_9fa48("136047") ? false : stryMutAct_9fa48("136046") ? true : (stryCov_9fa48("136046", "136047", "136048"), (stryMutAct_9fa48("136049") ? operation : (stryCov_9fa48("136049"), !operation)) || (stryMutAct_9fa48("136050") ? move : (stryCov_9fa48("136050"), !move)))) {
        if (stryMutAct_9fa48("136051")) {
          {}
        } else {
          stryCov_9fa48("136051");
          return stryMutAct_9fa48("136052") ? true : (stryCov_9fa48("136052"), false);
        }
      }
      const operationType = stryMutAct_9fa48("136055") ? this.normalizeMoveType(operation.type) && '' : stryMutAct_9fa48("136054") ? false : stryMutAct_9fa48("136053") ? true : (stryCov_9fa48("136053", "136054", "136055"), this.normalizeMoveType(operation.type) || (stryMutAct_9fa48("136056") ? "Stryker was here!" : (stryCov_9fa48("136056"), '')));
      const moveType = stryMutAct_9fa48("136059") ? this.normalizeMoveType(move.type) && '' : stryMutAct_9fa48("136058") ? false : stryMutAct_9fa48("136057") ? true : (stryCov_9fa48("136057", "136058", "136059"), this.normalizeMoveType(move.type) || (stryMutAct_9fa48("136060") ? "Stryker was here!" : (stryCov_9fa48("136060"), '')));
      if (stryMutAct_9fa48("136063") ? operationType === moveType : stryMutAct_9fa48("136062") ? false : stryMutAct_9fa48("136061") ? true : (stryCov_9fa48("136061", "136062", "136063"), operationType !== moveType)) {
        if (stryMutAct_9fa48("136064")) {
          {}
        } else {
          stryCov_9fa48("136064");
          return stryMutAct_9fa48("136065") ? true : (stryCov_9fa48("136065"), false);
        }
      }
      if (stryMutAct_9fa48("136068") ? operation.targetNodeId === move.nodeId : stryMutAct_9fa48("136067") ? false : stryMutAct_9fa48("136066") ? true : (stryCov_9fa48("136066", "136067", "136068"), operation.targetNodeId !== move.nodeId)) {
        if (stryMutAct_9fa48("136069")) {
          {}
        } else {
          stryCov_9fa48("136069");
          return stryMutAct_9fa48("136070") ? true : (stryCov_9fa48("136070"), false);
        }
      }
      if (stryMutAct_9fa48("136073") ? (operation.entityType || SERVICE_TYPE.PARTITION) === entityType : stryMutAct_9fa48("136072") ? false : stryMutAct_9fa48("136071") ? true : (stryCov_9fa48("136071", "136072", "136073"), (stryMutAct_9fa48("136076") ? operation.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("136075") ? false : stryMutAct_9fa48("136074") ? true : (stryCov_9fa48("136074", "136075", "136076"), operation.entityType || SERVICE_TYPE.PARTITION)) !== entityType)) {
        if (stryMutAct_9fa48("136077")) {
          {}
        } else {
          stryCov_9fa48("136077");
          return stryMutAct_9fa48("136078") ? true : (stryCov_9fa48("136078"), false);
        }
      }
      if (stryMutAct_9fa48("136081") ? (operation.entityId || operation.partitionId) === entityId : stryMutAct_9fa48("136080") ? false : stryMutAct_9fa48("136079") ? true : (stryCov_9fa48("136079", "136080", "136081"), (stryMutAct_9fa48("136084") ? operation.entityId && operation.partitionId : stryMutAct_9fa48("136083") ? false : stryMutAct_9fa48("136082") ? true : (stryCov_9fa48("136082", "136083", "136084"), operation.entityId || operation.partitionId)) !== entityId)) {
        if (stryMutAct_9fa48("136085")) {
          {}
        } else {
          stryCov_9fa48("136085");
          return stryMutAct_9fa48("136086") ? true : (stryCov_9fa48("136086"), false);
        }
      }
      if (stryMutAct_9fa48("136089") ? moveType !== OperationType.REMOVE : stryMutAct_9fa48("136088") ? false : stryMutAct_9fa48("136087") ? true : (stryCov_9fa48("136087", "136088", "136089"), moveType === OperationType.REMOVE)) {
        if (stryMutAct_9fa48("136090")) {
          {}
        } else {
          stryCov_9fa48("136090");
          return stryMutAct_9fa48("136093") ? operation.replicaId !== move.replicaId : stryMutAct_9fa48("136092") ? false : stryMutAct_9fa48("136091") ? true : (stryCov_9fa48("136091", "136092", "136093"), operation.replicaId === move.replicaId);
        }
      }
      if (stryMutAct_9fa48("136096") ? moveType !== OperationType.REPLACE : stryMutAct_9fa48("136095") ? false : stryMutAct_9fa48("136094") ? true : (stryCov_9fa48("136094", "136095", "136096"), moveType === OperationType.REPLACE)) {
        if (stryMutAct_9fa48("136097")) {
          {}
        } else {
          stryCov_9fa48("136097");
          return stryMutAct_9fa48("136100") ? this.getReplaceSourceReplicaId(operation) !== move.replicaId : stryMutAct_9fa48("136099") ? false : stryMutAct_9fa48("136098") ? true : (stryCov_9fa48("136098", "136099", "136100"), this.getReplaceSourceReplicaId(operation) === move.replicaId);
        }
      }
      return stryMutAct_9fa48("136101") ? false : (stryCov_9fa48("136101"), true);
    }
  }

  /**
   * Get a recently remembered operation intent.
   * @param {string} dedupeKey - Intent key.
   * @return {Object|null} Cached operation or null.
   * @private
   */
  async getRecentOperationIntent(dedupeKey) {
    if (stryMutAct_9fa48("136102")) {
      {}
    } else {
      stryCov_9fa48("136102");
      const cached = this.recentOperationIntents.get(dedupeKey);
      if (stryMutAct_9fa48("136105") ? false : stryMutAct_9fa48("136104") ? true : stryMutAct_9fa48("136103") ? cached : (stryCov_9fa48("136103", "136104", "136105"), !cached)) {
        if (stryMutAct_9fa48("136106")) {
          {}
        } else {
          stryCov_9fa48("136106");
          return null;
        }
      }
      if (stryMutAct_9fa48("136110") ? cached.expiresAt > Date.now() : stryMutAct_9fa48("136109") ? cached.expiresAt < Date.now() : stryMutAct_9fa48("136108") ? false : stryMutAct_9fa48("136107") ? true : (stryCov_9fa48("136107", "136108", "136109", "136110"), cached.expiresAt <= Date.now())) {
        if (stryMutAct_9fa48("136111")) {
          {}
        } else {
          stryCov_9fa48("136111");
          this.recentOperationIntents.delete(dedupeKey);
          return null;
        }
      }
      const cachedOperation = cached.operation;
      if (stryMutAct_9fa48("136114") ? !cachedOperation && this.isOperationTerminal(cachedOperation) : stryMutAct_9fa48("136113") ? false : stryMutAct_9fa48("136112") ? true : (stryCov_9fa48("136112", "136113", "136114"), (stryMutAct_9fa48("136115") ? cachedOperation : (stryCov_9fa48("136115"), !cachedOperation)) || this.isOperationTerminal(cachedOperation))) {
        if (stryMutAct_9fa48("136116")) {
          {}
        } else {
          stryCov_9fa48("136116");
          this.recentOperationIntents.delete(dedupeKey);
          return null;
        }
      }
      const cachedOperationId = cachedOperation.operationId;
      if (stryMutAct_9fa48("136119") ? typeof cachedOperationId !== 'string' && cachedOperationId.length === NUM.ZERO : stryMutAct_9fa48("136118") ? false : stryMutAct_9fa48("136117") ? true : (stryCov_9fa48("136117", "136118", "136119"), (stryMutAct_9fa48("136121") ? typeof cachedOperationId === 'string' : stryMutAct_9fa48("136120") ? false : (stryCov_9fa48("136120", "136121"), typeof cachedOperationId !== (stryMutAct_9fa48("136122") ? "" : (stryCov_9fa48("136122"), 'string')))) || (stryMutAct_9fa48("136124") ? cachedOperationId.length !== NUM.ZERO : stryMutAct_9fa48("136123") ? false : (stryCov_9fa48("136123", "136124"), cachedOperationId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("136125")) {
          {}
        } else {
          stryCov_9fa48("136125");
          this.recentOperationIntents.delete(dedupeKey);
          return null;
        }
      }
      let cacheVisibleOperation = null;
      try {
        if (stryMutAct_9fa48("136126")) {
          {}
        } else {
          stryCov_9fa48("136126");
          cacheVisibleOperation = await this.queryOperationById(cachedOperationId);
        }
      } catch (error) {
        if (stryMutAct_9fa48("136127")) {
          {}
        } else {
          stryCov_9fa48("136127");
          this.logger.debug(stryMutAct_9fa48("136128") ? "" : (stryCov_9fa48("136128"), 'Failed to refresh recent operation intent from cache-visible state'), stryMutAct_9fa48("136129") ? {} : (stryCov_9fa48("136129"), {
            operationId: cachedOperationId,
            dedupeKey,
            error: stryMutAct_9fa48("136132") ? error?.message && String(error) : stryMutAct_9fa48("136131") ? false : stryMutAct_9fa48("136130") ? true : (stryCov_9fa48("136130", "136131", "136132"), (stryMutAct_9fa48("136133") ? error.message : (stryCov_9fa48("136133"), error?.message)) || String(error))
          }));
        }
      }
      if (stryMutAct_9fa48("136136") ? cacheVisibleOperation || this.isOperationTerminal(cacheVisibleOperation) : stryMutAct_9fa48("136135") ? false : stryMutAct_9fa48("136134") ? true : (stryCov_9fa48("136134", "136135", "136136"), cacheVisibleOperation && this.isOperationTerminal(cacheVisibleOperation))) {
        if (stryMutAct_9fa48("136137")) {
          {}
        } else {
          stryCov_9fa48("136137");
          this.pruneRecentOperationIntentsForOperation(cacheVisibleOperation);
          return null;
        }
      }
      const operationForMissReuse = (stryMutAct_9fa48("136140") ? cacheVisibleOperation || !this.isOperationTerminal(cacheVisibleOperation) : stryMutAct_9fa48("136139") ? false : stryMutAct_9fa48("136138") ? true : (stryCov_9fa48("136138", "136139", "136140"), cacheVisibleOperation && (stryMutAct_9fa48("136141") ? this.isOperationTerminal(cacheVisibleOperation) : (stryCov_9fa48("136141"), !this.isOperationTerminal(cacheVisibleOperation))))) ? cacheVisibleOperation : cachedOperation;
      const authoritativeOperation = await this.repository.queryAuthoritativeOperationById(cachedOperationId, stryMutAct_9fa48("136142") ? {} : (stryCov_9fa48("136142"), {
        requireOwnerRpcRead: stryMutAct_9fa48("136143") ? false : (stryCov_9fa48("136143"), true)
      }));
      if (stryMutAct_9fa48("136146") ? false : stryMutAct_9fa48("136145") ? true : stryMutAct_9fa48("136144") ? authoritativeOperation : (stryCov_9fa48("136144", "136145", "136146"), !authoritativeOperation)) {
        if (stryMutAct_9fa48("136147")) {
          {}
        } else {
          stryCov_9fa48("136147");
          if (stryMutAct_9fa48("136149") ? false : stryMutAct_9fa48("136148") ? true : (stryCov_9fa48("136148", "136149"), this.shouldReuseRecentOperationIntentOnAuthoritativeMiss(operationForMissReuse))) {
            if (stryMutAct_9fa48("136150")) {
              {}
            } else {
              stryCov_9fa48("136150");
              this.rememberOperationIntent(dedupeKey, operationForMissReuse);
              return operationForMissReuse;
            }
          }
          this.recentOperationIntents.delete(dedupeKey);
          return null;
        }
      }
      if (stryMutAct_9fa48("136152") ? false : stryMutAct_9fa48("136151") ? true : (stryCov_9fa48("136151", "136152"), this.isOperationTerminal(authoritativeOperation))) {
        if (stryMutAct_9fa48("136153")) {
          {}
        } else {
          stryCov_9fa48("136153");
          this.pruneRecentOperationIntentsForOperation(authoritativeOperation);
          return null;
        }
      }
      this.rememberOperationIntent(dedupeKey, authoritativeOperation);
      return authoritativeOperation;
    }
  }

  /**
   * Remember a recently created/reused operation intent.
   * @param {string} dedupeKey - Intent key.
   * @param {Object} operation - Operation payload.
   * @private
   */
  rememberOperationIntent(dedupeKey, operation) {
    if (stryMutAct_9fa48("136154")) {
      {}
    } else {
      stryCov_9fa48("136154");
      if (stryMutAct_9fa48("136157") ? !operation && this.isOperationTerminal(operation) : stryMutAct_9fa48("136156") ? false : stryMutAct_9fa48("136155") ? true : (stryCov_9fa48("136155", "136156", "136157"), (stryMutAct_9fa48("136158") ? operation : (stryCov_9fa48("136158"), !operation)) || this.isOperationTerminal(operation))) {
        if (stryMutAct_9fa48("136159")) {
          {}
        } else {
          stryCov_9fa48("136159");
          this.recentOperationIntents.delete(dedupeKey);
          return;
        }
      }
      this.recentOperationIntents.set(dedupeKey, stryMutAct_9fa48("136160") ? {} : (stryCov_9fa48("136160"), {
        operation,
        expiresAt: stryMutAct_9fa48("136161") ? Date.now() - this.getRecentOperationIntentTtlMs(operation) : (stryCov_9fa48("136161"), Date.now() + this.getRecentOperationIntentTtlMs(operation))
      }));
    }
  }

  /**
   * Remember one operation under one or more intent keys.
   * @param {string[]|Set<string>} intentKeys
   * @param {Object} operation
   * @private
   */
  rememberOperationIntents(intentKeys, operation) {
    if (stryMutAct_9fa48("136162")) {
      {}
    } else {
      stryCov_9fa48("136162");
      const keys = Array.isArray(intentKeys) ? intentKeys : Array.from(stryMutAct_9fa48("136165") ? intentKeys && [] : stryMutAct_9fa48("136164") ? false : stryMutAct_9fa48("136163") ? true : (stryCov_9fa48("136163", "136164", "136165"), intentKeys || (stryMutAct_9fa48("136166") ? ["Stryker was here"] : (stryCov_9fa48("136166"), []))));
      for (const key of keys) {
        if (stryMutAct_9fa48("136167")) {
          {}
        } else {
          stryCov_9fa48("136167");
          if (stryMutAct_9fa48("136170") ? typeof key !== 'string' && key.length === NUM.ZERO : stryMutAct_9fa48("136169") ? false : stryMutAct_9fa48("136168") ? true : (stryCov_9fa48("136168", "136169", "136170"), (stryMutAct_9fa48("136172") ? typeof key === 'string' : stryMutAct_9fa48("136171") ? false : (stryCov_9fa48("136171", "136172"), typeof key !== (stryMutAct_9fa48("136173") ? "" : (stryCov_9fa48("136173"), 'string')))) || (stryMutAct_9fa48("136175") ? key.length !== NUM.ZERO : stryMutAct_9fa48("136174") ? false : (stryCov_9fa48("136174", "136175"), key.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("136176")) {
              {}
            } else {
              stryCov_9fa48("136176");
              continue;
            }
          }
          this.rememberOperationIntent(key, operation);
        }
      }
    }
  }

  /**
   * Reused create-intent rows may still be the correct in-flight operation
   * while remaining stuck at PENDING because the first owner-side handoff was
   * deferred or missed. Re-arm those rows through the canonical owner path so
   * later planning retries do not keep returning one limbo operation forever.
   *
   * @param {Object|null} operation
   * @param {Object} [options={}]
   * @param {boolean} [options.shouldEmitOperationCreated]
   * @return {Promise<Object|null>}
   * @private
   */
  async maybeRearmReusedPendingOperation(operation, options = {}) {
    if (stryMutAct_9fa48("136177")) {
      {}
    } else {
      stryCov_9fa48("136177");
      if (stryMutAct_9fa48("136180") ? (options.shouldEmitOperationCreated === false || !operation || this.isOperationTerminal(operation)) && operation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("136179") ? false : stryMutAct_9fa48("136178") ? true : (stryCov_9fa48("136178", "136179", "136180"), (stryMutAct_9fa48("136182") ? (options.shouldEmitOperationCreated === false || !operation) && this.isOperationTerminal(operation) : stryMutAct_9fa48("136181") ? false : (stryCov_9fa48("136181", "136182"), (stryMutAct_9fa48("136184") ? options.shouldEmitOperationCreated === false && !operation : stryMutAct_9fa48("136183") ? false : (stryCov_9fa48("136183", "136184"), (stryMutAct_9fa48("136186") ? options.shouldEmitOperationCreated !== false : stryMutAct_9fa48("136185") ? false : (stryCov_9fa48("136185", "136186"), options.shouldEmitOperationCreated === (stryMutAct_9fa48("136187") ? true : (stryCov_9fa48("136187"), false)))) || (stryMutAct_9fa48("136188") ? operation : (stryCov_9fa48("136188"), !operation)))) || this.isOperationTerminal(operation))) || (stryMutAct_9fa48("136190") ? operation.workflowStep === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("136189") ? false : (stryCov_9fa48("136189", "136190"), operation.workflowStep !== WORKFLOW_STEP.PENDING)))) {
        if (stryMutAct_9fa48("136191")) {
          {}
        } else {
          stryCov_9fa48("136191");
          return operation;
        }
      }
      await this.armCoordinatorCreatedOperationProgress(operation);
      return operation;
    }
  }

  /**
   * Drop cached create-intent entries that point at one terminal operation.
   * This keeps failed/completed priority recovery rows from suppressing the
   * next required operation while cache/owner reads are under pressure.
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  pruneRecentOperationIntentsForOperation(operation) {
    if (stryMutAct_9fa48("136192")) {
      {}
    } else {
      stryCov_9fa48("136192");
      const operationId = stryMutAct_9fa48("136193") ? String(operation?.operationId || operation?.operation_id || '') : (stryCov_9fa48("136193"), String(stryMutAct_9fa48("136196") ? (operation?.operationId || operation?.operation_id) && '' : stryMutAct_9fa48("136195") ? false : stryMutAct_9fa48("136194") ? true : (stryCov_9fa48("136194", "136195", "136196"), (stryMutAct_9fa48("136198") ? operation?.operationId && operation?.operation_id : stryMutAct_9fa48("136197") ? false : (stryCov_9fa48("136197", "136198"), (stryMutAct_9fa48("136199") ? operation.operationId : (stryCov_9fa48("136199"), operation?.operationId)) || (stryMutAct_9fa48("136200") ? operation.operation_id : (stryCov_9fa48("136200"), operation?.operation_id)))) || (stryMutAct_9fa48("136201") ? "Stryker was here!" : (stryCov_9fa48("136201"), '')))).trim());
      if (stryMutAct_9fa48("136204") ? operationId.length !== NUM.ZERO : stryMutAct_9fa48("136203") ? false : stryMutAct_9fa48("136202") ? true : (stryCov_9fa48("136202", "136203", "136204"), operationId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("136205")) {
          {}
        } else {
          stryCov_9fa48("136205");
          return;
        }
      }
      for (const [dedupeKey, entry] of this.recentOperationIntents.entries()) {
        if (stryMutAct_9fa48("136206")) {
          {}
        } else {
          stryCov_9fa48("136206");
          if (stryMutAct_9fa48("136209") ? String(entry?.operation?.operationId || '').trim() === operationId : stryMutAct_9fa48("136208") ? false : stryMutAct_9fa48("136207") ? true : (stryCov_9fa48("136207", "136208", "136209"), (stryMutAct_9fa48("136210") ? String(entry?.operation?.operationId || '') : (stryCov_9fa48("136210"), String(stryMutAct_9fa48("136213") ? entry?.operation?.operationId && '' : stryMutAct_9fa48("136212") ? false : stryMutAct_9fa48("136211") ? true : (stryCov_9fa48("136211", "136212", "136213"), (stryMutAct_9fa48("136215") ? entry.operation?.operationId : stryMutAct_9fa48("136214") ? entry?.operation.operationId : (stryCov_9fa48("136214", "136215"), entry?.operation?.operationId)) || (stryMutAct_9fa48("136216") ? "Stryker was here!" : (stryCov_9fa48("136216"), '')))).trim())) !== operationId)) {
            if (stryMutAct_9fa48("136217")) {
              {}
            } else {
              stryCov_9fa48("136217");
              continue;
            }
          }
          this.recentOperationIntents.delete(dedupeKey);
        }
      }
    }
  }

  /**
   * Extend recent-intent retention for priority control-plane partitions so
   * transient owner-read misses do not create a new PENDING operation every
   * few seconds while the original one is still the intended recovery op.
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getRecentOperationIntentTtlMs(operation) {
    if (stryMutAct_9fa48("136218")) {
      {}
    } else {
      stryCov_9fa48("136218");
      const partitionId = stryMutAct_9fa48("136219") ? String(operation?.partitionId || operation?.entityId || '') : (stryCov_9fa48("136219"), String(stryMutAct_9fa48("136222") ? (operation?.partitionId || operation?.entityId) && '' : stryMutAct_9fa48("136221") ? false : stryMutAct_9fa48("136220") ? true : (stryCov_9fa48("136220", "136221", "136222"), (stryMutAct_9fa48("136224") ? operation?.partitionId && operation?.entityId : stryMutAct_9fa48("136223") ? false : (stryCov_9fa48("136223", "136224"), (stryMutAct_9fa48("136225") ? operation.partitionId : (stryCov_9fa48("136225"), operation?.partitionId)) || (stryMutAct_9fa48("136226") ? operation.entityId : (stryCov_9fa48("136226"), operation?.entityId)))) || (stryMutAct_9fa48("136227") ? "Stryker was here!" : (stryCov_9fa48("136227"), '')))).trim());
      if (stryMutAct_9fa48("136230") ? !partitionId && !this.isPriorityControlPlanePartition(partitionId) : stryMutAct_9fa48("136229") ? false : stryMutAct_9fa48("136228") ? true : (stryCov_9fa48("136228", "136229", "136230"), (stryMutAct_9fa48("136231") ? partitionId : (stryCov_9fa48("136231"), !partitionId)) || (stryMutAct_9fa48("136232") ? this.isPriorityControlPlanePartition(partitionId) : (stryCov_9fa48("136232"), !this.isPriorityControlPlanePartition(partitionId))))) {
        if (stryMutAct_9fa48("136233")) {
          {}
        } else {
          stryCov_9fa48("136233");
          return RECENT_INTENT_TTL_MS;
        }
      }
      const configuredPendingTimeoutMs = (stryMutAct_9fa48("136236") ? Number.isFinite(this.config?.pendingTimeoutMs) || this.config.pendingTimeoutMs > NUM.ZERO : stryMutAct_9fa48("136235") ? false : stryMutAct_9fa48("136234") ? true : (stryCov_9fa48("136234", "136235", "136236"), Number.isFinite(stryMutAct_9fa48("136237") ? this.config.pendingTimeoutMs : (stryCov_9fa48("136237"), this.config?.pendingTimeoutMs)) && (stryMutAct_9fa48("136240") ? this.config.pendingTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("136239") ? this.config.pendingTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("136238") ? true : (stryCov_9fa48("136238", "136239", "136240"), this.config.pendingTimeoutMs > NUM.ZERO)))) ? Math.floor(this.config.pendingTimeoutMs) : RECENT_INTENT_TTL_MS;
      return stryMutAct_9fa48("136241") ? Math.min(RECENT_INTENT_TTL_MS, PRIORITY_RECENT_INTENT_TTL_MS, configuredPendingTimeoutMs * NUM.FOUR) : (stryCov_9fa48("136241"), Math.max(RECENT_INTENT_TTL_MS, PRIORITY_RECENT_INTENT_TTL_MS, stryMutAct_9fa48("136242") ? configuredPendingTimeoutMs / NUM.FOUR : (stryCov_9fa48("136242"), configuredPendingTimeoutMs * NUM.FOUR)));
    }
  }

  /**
   * Resolve the workflow-timeout window that defines how long a missing
   * recent intent is still credible as an in-flight recovery operation.
   * Once a cached priority operation has aged past its own step timeout,
   * reusing it on authoritative misses suppresses the fresh recovery op that
   * the planner now needs to mint.
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getRecentOperationMissReuseBudgetMs(operation) {
    if (stryMutAct_9fa48("136243")) {
      {}
    } else {
      stryCov_9fa48("136243");
      const workflowStep = stryMutAct_9fa48("136244") ? String(operation?.workflowStep || '') : (stryCov_9fa48("136244"), String(stryMutAct_9fa48("136247") ? operation?.workflowStep && '' : stryMutAct_9fa48("136246") ? false : stryMutAct_9fa48("136245") ? true : (stryCov_9fa48("136245", "136246", "136247"), (stryMutAct_9fa48("136248") ? operation.workflowStep : (stryCov_9fa48("136248"), operation?.workflowStep)) || (stryMutAct_9fa48("136249") ? "Stryker was here!" : (stryCov_9fa48("136249"), '')))).trim());
      if (stryMutAct_9fa48("136252") ? workflowStep !== WORKFLOW_STEP.CREATING : stryMutAct_9fa48("136251") ? false : stryMutAct_9fa48("136250") ? true : (stryCov_9fa48("136250", "136251", "136252"), workflowStep === WORKFLOW_STEP.CREATING)) {
        if (stryMutAct_9fa48("136253")) {
          {}
        } else {
          stryCov_9fa48("136253");
          return this.config.creatingTimeoutMs;
        }
      }
      if (stryMutAct_9fa48("136256") ? workflowStep !== WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("136255") ? false : stryMutAct_9fa48("136254") ? true : (stryCov_9fa48("136254", "136255", "136256"), workflowStep === WORKFLOW_STEP.SYNCING)) {
        if (stryMutAct_9fa48("136257")) {
          {}
        } else {
          stryCov_9fa48("136257");
          return this.config.syncingTimeoutMs;
        }
      }
      if (stryMutAct_9fa48("136260") ? workflowStep === WORKFLOW_STEP.STOPPING && workflowStep === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("136259") ? false : stryMutAct_9fa48("136258") ? true : (stryCov_9fa48("136258", "136259", "136260"), (stryMutAct_9fa48("136262") ? workflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("136261") ? false : (stryCov_9fa48("136261", "136262"), workflowStep === WORKFLOW_STEP.STOPPING)) || (stryMutAct_9fa48("136264") ? workflowStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("136263") ? false : (stryCov_9fa48("136263", "136264"), workflowStep === WORKFLOW_STEP.ACTIVE)))) {
        if (stryMutAct_9fa48("136265")) {
          {}
        } else {
          stryCov_9fa48("136265");
          return this.config.removingTimeoutMs;
        }
      }
      return this.config.pendingTimeoutMs;
    }
  }

  /**
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getOperationAgeMs(operation) {
    if (stryMutAct_9fa48("136266")) {
      {}
    } else {
      stryCov_9fa48("136266");
      const updatedAt = Number(stryMutAct_9fa48("136267") ? operation.updatedAt : (stryCov_9fa48("136267"), operation?.updatedAt));
      const createdAt = Number(stryMutAct_9fa48("136268") ? operation.createdAt : (stryCov_9fa48("136268"), operation?.createdAt));
      const startedAt = (stryMutAct_9fa48("136271") ? Number.isFinite(updatedAt) || updatedAt > NUM.ZERO : stryMutAct_9fa48("136270") ? false : stryMutAct_9fa48("136269") ? true : (stryCov_9fa48("136269", "136270", "136271"), Number.isFinite(updatedAt) && (stryMutAct_9fa48("136274") ? updatedAt <= NUM.ZERO : stryMutAct_9fa48("136273") ? updatedAt >= NUM.ZERO : stryMutAct_9fa48("136272") ? true : (stryCov_9fa48("136272", "136273", "136274"), updatedAt > NUM.ZERO)))) ? updatedAt : createdAt;
      if (stryMutAct_9fa48("136277") ? !Number.isFinite(startedAt) && startedAt <= NUM.ZERO : stryMutAct_9fa48("136276") ? false : stryMutAct_9fa48("136275") ? true : (stryCov_9fa48("136275", "136276", "136277"), (stryMutAct_9fa48("136278") ? Number.isFinite(startedAt) : (stryCov_9fa48("136278"), !Number.isFinite(startedAt))) || (stryMutAct_9fa48("136281") ? startedAt > NUM.ZERO : stryMutAct_9fa48("136280") ? startedAt < NUM.ZERO : stryMutAct_9fa48("136279") ? false : (stryCov_9fa48("136279", "136280", "136281"), startedAt <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("136282")) {
          {}
        } else {
          stryCov_9fa48("136282");
          return NUM.ZERO;
        }
      }
      return stryMutAct_9fa48("136283") ? Math.min(NUM.ZERO, Date.now() - startedAt) : (stryCov_9fa48("136283"), Math.max(NUM.ZERO, stryMutAct_9fa48("136284") ? Date.now() + startedAt : (stryCov_9fa48("136284"), Date.now() - startedAt)));
    }
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldReuseRecentOperationIntentOnAuthoritativeMiss(operation) {
    if (stryMutAct_9fa48("136285")) {
      {}
    } else {
      stryCov_9fa48("136285");
      if (stryMutAct_9fa48("136288") ? !operation && this.isOperationTerminal(operation) : stryMutAct_9fa48("136287") ? false : stryMutAct_9fa48("136286") ? true : (stryCov_9fa48("136286", "136287", "136288"), (stryMutAct_9fa48("136289") ? operation : (stryCov_9fa48("136289"), !operation)) || this.isOperationTerminal(operation))) {
        if (stryMutAct_9fa48("136290")) {
          {}
        } else {
          stryCov_9fa48("136290");
          return stryMutAct_9fa48("136291") ? true : (stryCov_9fa48("136291"), false);
        }
      }
      const partitionId = stryMutAct_9fa48("136292") ? String(operation.partitionId || operation.entityId || '') : (stryCov_9fa48("136292"), String(stryMutAct_9fa48("136295") ? (operation.partitionId || operation.entityId) && '' : stryMutAct_9fa48("136294") ? false : stryMutAct_9fa48("136293") ? true : (stryCov_9fa48("136293", "136294", "136295"), (stryMutAct_9fa48("136297") ? operation.partitionId && operation.entityId : stryMutAct_9fa48("136296") ? false : (stryCov_9fa48("136296", "136297"), operation.partitionId || operation.entityId)) || (stryMutAct_9fa48("136298") ? "Stryker was here!" : (stryCov_9fa48("136298"), '')))).trim());
      if (stryMutAct_9fa48("136301") ? partitionId.length === NUM.ZERO && !this.isPriorityControlPlanePartition(partitionId) : stryMutAct_9fa48("136300") ? false : stryMutAct_9fa48("136299") ? true : (stryCov_9fa48("136299", "136300", "136301"), (stryMutAct_9fa48("136303") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("136302") ? false : (stryCov_9fa48("136302", "136303"), partitionId.length === NUM.ZERO)) || (stryMutAct_9fa48("136304") ? this.isPriorityControlPlanePartition(partitionId) : (stryCov_9fa48("136304"), !this.isPriorityControlPlanePartition(partitionId))))) {
        if (stryMutAct_9fa48("136305")) {
          {}
        } else {
          stryCov_9fa48("136305");
          return stryMutAct_9fa48("136306") ? true : (stryCov_9fa48("136306"), false);
        }
      }
      const reuseBudgetMs = this.getRecentOperationMissReuseBudgetMs(operation);
      if (stryMutAct_9fa48("136309") ? !Number.isFinite(reuseBudgetMs) && reuseBudgetMs <= NUM.ZERO : stryMutAct_9fa48("136308") ? false : stryMutAct_9fa48("136307") ? true : (stryCov_9fa48("136307", "136308", "136309"), (stryMutAct_9fa48("136310") ? Number.isFinite(reuseBudgetMs) : (stryCov_9fa48("136310"), !Number.isFinite(reuseBudgetMs))) || (stryMutAct_9fa48("136313") ? reuseBudgetMs > NUM.ZERO : stryMutAct_9fa48("136312") ? reuseBudgetMs < NUM.ZERO : stryMutAct_9fa48("136311") ? false : (stryCov_9fa48("136311", "136312", "136313"), reuseBudgetMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("136314")) {
          {}
        } else {
          stryCov_9fa48("136314");
          return stryMutAct_9fa48("136315") ? true : (stryCov_9fa48("136315"), false);
        }
      }
      return stryMutAct_9fa48("136319") ? this.getOperationAgeMs(operation) >= reuseBudgetMs : stryMutAct_9fa48("136318") ? this.getOperationAgeMs(operation) <= reuseBudgetMs : stryMutAct_9fa48("136317") ? false : stryMutAct_9fa48("136316") ? true : (stryCov_9fa48("136316", "136317", "136318", "136319"), this.getOperationAgeMs(operation) < reuseBudgetMs);
    }
  }

  /**
   * Prune expired recent operation intents.
   * @private
   */
  pruneExpiredOperationIntents() {
    if (stryMutAct_9fa48("136320")) {
      {}
    } else {
      stryCov_9fa48("136320");
      const now = Date.now();
      for (const [key, entry] of this.recentOperationIntents.entries()) {
        if (stryMutAct_9fa48("136321")) {
          {}
        } else {
          stryCov_9fa48("136321");
          if (stryMutAct_9fa48("136324") ? !entry && entry.expiresAt <= now : stryMutAct_9fa48("136323") ? false : stryMutAct_9fa48("136322") ? true : (stryCov_9fa48("136322", "136323", "136324"), (stryMutAct_9fa48("136325") ? entry : (stryCov_9fa48("136325"), !entry)) || (stryMutAct_9fa48("136328") ? entry.expiresAt > now : stryMutAct_9fa48("136327") ? entry.expiresAt < now : stryMutAct_9fa48("136326") ? false : (stryCov_9fa48("136326", "136327", "136328"), entry.expiresAt <= now)))) {
            if (stryMutAct_9fa48("136329")) {
              {}
            } else {
              stryCov_9fa48("136329");
              this.recentOperationIntents.delete(key);
            }
          }
        }
      }
    }
  }

  /**
   * Build one operation single-flight key for shared workflow coordination.
   * @param {string} scope - Lock scope prefix.
   * @param {string} key - Scope-specific key.
   * @return {string} Single-flight owner key.
   * @private
   */
  buildOperationSingleFlightKey(scope, key) {
    if (stryMutAct_9fa48("136330")) {
      {}
    } else {
      stryCov_9fa48("136330");
      return this.workflowOwner.buildOperationSingleFlightKey(scope, key);
    }
  }

  /**
   * Build create-operation single-flight key.
   * @param {string} dedupeKey - Move-intent dedupe key.
   * @return {string}
   * @private
   */
  getCreateOperationSingleFlightKey(dedupeKey) {
    if (stryMutAct_9fa48("136331")) {
      {}
    } else {
      stryCov_9fa48("136331");
      return this.workflowOwner.getCreateOperationSingleFlightKey(dedupeKey);
    }
  }

  /**
   * Build the shared single-flight key for concurrent create-budget checks.
   * @param {string} scope
   * @return {string}
   * @private
   */
  getCreateBudgetSingleFlightKey(scope) {
    if (stryMutAct_9fa48("136332")) {
      {}
    } else {
      stryCov_9fa48("136332");
      return this.workflowOwner.getCreateBudgetSingleFlightKey(scope);
    }
  }

  /**
   * Build execute-operation single-flight key.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getExecuteOperationSingleFlightKey(operationId) {
    if (stryMutAct_9fa48("136333")) {
      {}
    } else {
      stryCov_9fa48("136333");
      return this.workflowOwner.getExecuteOperationSingleFlightKey(operationId);
    }
  }

  /**
   * Build the shared owner-key single-flight gate for one persisted
   * operation.
   * @param {string} operationId - Operation ID.
   * @return {string}
   * @private
   */
  getOperationOwnerSingleFlightKey(operationId) {
    if (stryMutAct_9fa48("136334")) {
      {}
    } else {
      stryCov_9fa48("136334");
      return this.workflowOwner.getOperationOwnerSingleFlightKey(operationId);
    }
  }

  /**
   * Claim a PENDING operation for dispatch by transitioning it to
   * SENDING through the coordinator-owned workflow path.
   *
   * This is the single-owner replacement for the direct
   * cdcIntegrationService.updateSystemTableRow call that previously
   * lived in ReplicaDispatchService.claimPendingDispatch.
   *
   * Design reference: §2 — dispatch claim routed through coordinator.
   *
   * @param {string} operationId - The operation to claim.
   * @return {Promise<Object|null>} The claimed operation in SENDING
   *   state, or null if the claim could not be acquired (operation
   *   not found, not PENDING, or not locally owned).
   */
  async claimDispatchTransition(operationId) {
    if (stryMutAct_9fa48("136335")) {
      {}
    } else {
      stryCov_9fa48("136335");
      return this.workflowOwner.claimDispatchTransition(operationId);
    }
  }

  /**
   * Dispatch one operation through the coordinator-owned single-flight lane.
   * This is the canonical owner entry point for PENDING dispatch and any
   * retry of an already-claimed SENDING operation.
   *
   * Accepts either an operation id, a SQL row, or a canonical operation
   * payload. Callers that carry extra in-memory metadata (for example initial
   * bootstrap peer lists) should pass the canonical operation object so that
   * this owner path can preserve it.
   *
   * @param {string|Object} operationInput - Operation id or payload.
   * @return {Promise<Object>} Execution result or typed skip.
   */
  async dispatchOperation(operationInput) {
    if (stryMutAct_9fa48("136336")) {
      {}
    } else {
      stryCov_9fa48("136336");
      return this.workflowOwner.dispatchOperation(operationInput);
    }
  }

  /**
   * Normalize one topology mutation work class for coordinator callers.
   * Background work is deferable; interactive/critical work keeps its current
   * caller-visible behavior.
   *
   * @param {Object} move
   * @return {string}
   * @private
   */
  normalizeControlPlaneMutationWorkClass(move) {
    if (stryMutAct_9fa48("136337")) {
      {}
    } else {
      stryCov_9fa48("136337");
      return this.provisioningAdmissionPolicy.normalizeControlPlaneMutationWorkClass(move);
    }
  }

  /**
   * Build an admission result for local control-plane mutation unhealthiness.
   * @param {Object} blocker
   * @return {Object}
   * @private
   */
  buildLocalControlPlaneMutationAdmissionResult(blocker) {
    if (stryMutAct_9fa48("136338")) {
      {}
    } else {
      stryCov_9fa48("136338");
      return this.provisioningAdmissionPolicy.buildLocalControlPlaneMutationAdmissionResult(blocker);
    }
  }

  /**
   * Defer optional background topology mutation when the local control-plane
   * mutation contract is not currently healthy.
   * @param {Object} move
   * @return {void}
   * @private
   */
  assertLocalControlPlaneMutationReady(move) {
    if (stryMutAct_9fa48("136339")) {
      {}
    } else {
      stryCov_9fa48("136339");
      return this.provisioningAdmissionPolicy.assertLocalControlPlaneMutationReady(move);
    }
  }

  /**
   * Resolve the current published membership epoch, when available.
   * @return {number|null}
   * @private
   */
  getCurrentPublishedMembershipEpoch() {
    if (stryMutAct_9fa48("136340")) {
      {}
    } else {
      stryCov_9fa48("136340");
      if (stryMutAct_9fa48("136343") ? !this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getCurrentPublishedMembershipEpochSync !== 'function' : stryMutAct_9fa48("136342") ? false : stryMutAct_9fa48("136341") ? true : (stryCov_9fa48("136341", "136342", "136343"), (stryMutAct_9fa48("136344") ? this.controlPlaneReadinessService : (stryCov_9fa48("136344"), !this.controlPlaneReadinessService)) || (stryMutAct_9fa48("136346") ? typeof this.controlPlaneReadinessService.getCurrentPublishedMembershipEpochSync === 'function' : stryMutAct_9fa48("136345") ? false : (stryCov_9fa48("136345", "136346"), typeof this.controlPlaneReadinessService.getCurrentPublishedMembershipEpochSync !== (stryMutAct_9fa48("136347") ? "" : (stryCov_9fa48("136347"), 'function')))))) {
        if (stryMutAct_9fa48("136348")) {
          {}
        } else {
          stryCov_9fa48("136348");
          return null;
        }
      }
      return this.controlPlaneReadinessService.getCurrentPublishedMembershipEpochSync(this.nodeId, Date.now());
    }
  }

  /**
   * Reject stale epoch-bound placement requests after membership cutover.
   * @param {Object} move
   * @return {void}
   * @private
   */
  assertMembershipPublicationEpoch(move) {
    if (stryMutAct_9fa48("136349")) {
      {}
    } else {
      stryCov_9fa48("136349");
      const requestedEpoch = Number(stryMutAct_9fa48("136350") ? move.membershipPublicationEpoch : (stryCov_9fa48("136350"), move?.membershipPublicationEpoch));
      if (stryMutAct_9fa48("136353") ? !Number.isInteger(requestedEpoch) && requestedEpoch < 0 : stryMutAct_9fa48("136352") ? false : stryMutAct_9fa48("136351") ? true : (stryCov_9fa48("136351", "136352", "136353"), (stryMutAct_9fa48("136354") ? Number.isInteger(requestedEpoch) : (stryCov_9fa48("136354"), !Number.isInteger(requestedEpoch))) || (stryMutAct_9fa48("136357") ? requestedEpoch >= 0 : stryMutAct_9fa48("136356") ? requestedEpoch <= 0 : stryMutAct_9fa48("136355") ? false : (stryCov_9fa48("136355", "136356", "136357"), requestedEpoch < 0)))) {
        if (stryMutAct_9fa48("136358")) {
          {}
        } else {
          stryCov_9fa48("136358");
          return;
        }
      }
      const currentEpoch = this.getCurrentPublishedMembershipEpoch();
      if (stryMutAct_9fa48("136361") ? !Number.isInteger(currentEpoch) && currentEpoch === requestedEpoch : stryMutAct_9fa48("136360") ? false : stryMutAct_9fa48("136359") ? true : (stryCov_9fa48("136359", "136360", "136361"), (stryMutAct_9fa48("136362") ? Number.isInteger(currentEpoch) : (stryCov_9fa48("136362"), !Number.isInteger(currentEpoch))) || (stryMutAct_9fa48("136364") ? currentEpoch !== requestedEpoch : stryMutAct_9fa48("136363") ? false : (stryCov_9fa48("136363", "136364"), currentEpoch === requestedEpoch)))) {
        if (stryMutAct_9fa48("136365")) {
          {}
        } else {
          stryCov_9fa48("136365");
          return;
        }
      }
      const error = new Error((stryMutAct_9fa48("136366") ? `` : (stryCov_9fa48("136366"), `Stale placement plan for published membership epoch ${requestedEpoch}; `)) + (stryMutAct_9fa48("136367") ? `` : (stryCov_9fa48("136367"), `current epoch is ${currentEpoch}`)));
      error.rebalanceSkipReason = REBALANCER_SKIP_REASON.MEMBERSHIP_EPOCH_CHANGED;
      error.requestedMembershipPublicationEpoch = requestedEpoch;
      error.currentMembershipPublicationEpoch = currentEpoch;
      throw error;
    }
  }

  /**
   * Create an operation record (persisted via SQL engine).
   * Includes deduplication check to prevent duplicate operations.
   * Requirements: 2.2, 2.3
   *
   * @param {Object} move - Move specification.
   * @param {string} move.type - Operation type: 'ADD', 'REMOVE', or 'REPLACE'.
   * @param {string} move.partitionId - Target partition ID.
   * @param {string} [move.entityType] - Entity type for canonical operations.
   * @param {string} [move.entityId] - Entity ID for canonical operations.
   * @param {string} move.nodeId - Target node ID.
   * @param {string} [move.replicaId] - Replica ID (for REMOVE operations).
   * @param {boolean} [move.emitOperationCreated] - Emit the local
   *   coordinator-created dispatch trigger after persistence.
   * @param {boolean} [move.skipProvisioningAdmissionRecheck] - Reuse an
   *   immediately preceding admitted provisioning probe for this target.
   * @return {Promise<Object>} Created or existing operation record.
   */
  async createOperation(move) {
    if (stryMutAct_9fa48("136368")) {
      {}
    } else {
      stryCov_9fa48("136368");
      if (stryMutAct_9fa48("136371") ? this.isShuttingDown && !this.initialized : stryMutAct_9fa48("136370") ? false : stryMutAct_9fa48("136369") ? true : (stryCov_9fa48("136369", "136370", "136371"), this.isShuttingDown || (stryMutAct_9fa48("136372") ? this.initialized : (stryCov_9fa48("136372"), !this.initialized)))) {
        if (stryMutAct_9fa48("136373")) {
          {}
        } else {
          stryCov_9fa48("136373");
          throw new Error(stryMutAct_9fa48("136374") ? "" : (stryCov_9fa48("136374"), 'RebalanceCoordinator is shutting down'));
        }
      }
      this.assertLocalControlPlaneMutationReady(move);
      const entityType = stryMutAct_9fa48("136377") ? move.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("136376") ? false : stryMutAct_9fa48("136375") ? true : (stryCov_9fa48("136375", "136376", "136377"), move.entityType || SERVICE_TYPE.PARTITION);
      const entityId = stryMutAct_9fa48("136380") ? move.entityId && move.partitionId : stryMutAct_9fa48("136379") ? false : stryMutAct_9fa48("136378") ? true : (stryCov_9fa48("136378", "136379", "136380"), move.entityId || move.partitionId);
      const partitionId = stryMutAct_9fa48("136383") ? move.partitionId && entityId : stryMutAct_9fa48("136382") ? false : stryMutAct_9fa48("136381") ? true : (stryCov_9fa48("136381", "136382", "136383"), move.partitionId || entityId);
      const normalizedMoveType = this.normalizeMoveType(stryMutAct_9fa48("136384") ? move.type : (stryCov_9fa48("136384"), move?.type));
      const shouldEmitOperationCreated = stryMutAct_9fa48("136387") ? move?.emitOperationCreated === false : stryMutAct_9fa48("136386") ? false : stryMutAct_9fa48("136385") ? true : (stryCov_9fa48("136385", "136386", "136387"), (stryMutAct_9fa48("136388") ? move.emitOperationCreated : (stryCov_9fa48("136388"), move?.emitOperationCreated)) !== (stryMutAct_9fa48("136389") ? true : (stryCov_9fa48("136389"), false)));
      const dedupeKey = this.buildOperationIntentKey(move, entityType, entityId);
      const criticalAddLikeIntentKey = this.buildCriticalAddLikeIntentKey(move, normalizedMoveType, partitionId, entityType, entityId);
      const createOperationIntentKey = stryMutAct_9fa48("136392") ? criticalAddLikeIntentKey && dedupeKey : stryMutAct_9fa48("136391") ? false : stryMutAct_9fa48("136390") ? true : (stryCov_9fa48("136390", "136391", "136392"), criticalAddLikeIntentKey || dedupeKey);
      const singleFlightKey = this.getCreateOperationSingleFlightKey(createOperationIntentKey);
      this.pruneExpiredOperationIntents();
      const recentOperation = await this.getRecentOperationIntent(dedupeKey);
      if (stryMutAct_9fa48("136394") ? false : stryMutAct_9fa48("136393") ? true : (stryCov_9fa48("136393", "136394"), recentOperation)) {
        if (stryMutAct_9fa48("136395")) {
          {}
        } else {
          stryCov_9fa48("136395");
          return this.maybeRearmReusedPendingOperation(recentOperation, stryMutAct_9fa48("136396") ? {} : (stryCov_9fa48("136396"), {
            shouldEmitOperationCreated
          }));
        }
      }
      if (stryMutAct_9fa48("136399") ? criticalAddLikeIntentKey || criticalAddLikeIntentKey !== dedupeKey : stryMutAct_9fa48("136398") ? false : stryMutAct_9fa48("136397") ? true : (stryCov_9fa48("136397", "136398", "136399"), criticalAddLikeIntentKey && (stryMutAct_9fa48("136401") ? criticalAddLikeIntentKey === dedupeKey : stryMutAct_9fa48("136400") ? true : (stryCov_9fa48("136400", "136401"), criticalAddLikeIntentKey !== dedupeKey)))) {
        if (stryMutAct_9fa48("136402")) {
          {}
        } else {
          stryCov_9fa48("136402");
          const recentCriticalOperation = await this.getRecentOperationIntent(criticalAddLikeIntentKey);
          if (stryMutAct_9fa48("136404") ? false : stryMutAct_9fa48("136403") ? true : (stryCov_9fa48("136403", "136404"), recentCriticalOperation)) {
            if (stryMutAct_9fa48("136405")) {
              {}
            } else {
              stryCov_9fa48("136405");
              this.rememberOperationIntents(stryMutAct_9fa48("136406") ? [] : (stryCov_9fa48("136406"), [dedupeKey, criticalAddLikeIntentKey]), recentCriticalOperation);
              return this.maybeRearmReusedPendingOperation(recentCriticalOperation, stryMutAct_9fa48("136407") ? {} : (stryCov_9fa48("136407"), {
                shouldEmitOperationCreated
              }));
            }
          }
        }
      }
      const existingPromise = this.operationsInCreation.get(singleFlightKey);
      if (stryMutAct_9fa48("136409") ? false : stryMutAct_9fa48("136408") ? true : (stryCov_9fa48("136408", "136409"), existingPromise)) {
        if (stryMutAct_9fa48("136410")) {
          {}
        } else {
          stryCov_9fa48("136410");
          return existingPromise;
        }
      }
      return this.operationWorkflowRunExclusive(singleFlightKey, stryMutAct_9fa48("136411") ? () => undefined : (stryCov_9fa48("136411"), () => this.createOperationInternal(move)));
    }
  }

  /**
   * Probe provisioning admission without persisting replica_operations rows.
   * Callers should use this before creating storage-increasing operations when
   * they need an all-or-nothing planning decision.
   *
   * @param {Object} move - Move specification.
   * @param {string} move.type - Operation type.
   * @param {string} move.partitionId - Target partition ID.
   * @param {string} [move.entityType] - Canonical entity type.
   * @param {string} [move.entityId] - Canonical entity ID.
   * @param {string} [move.nodeId] - Target node ID.
   * @param {string} [move.sourceNodeId] - Optional replace source node.
   * @return {Promise<Object>} Admission decision payload.
   */
  async checkProvisioningAdmission(move) {
    if (stryMutAct_9fa48("136412")) {
      {}
    } else {
      stryCov_9fa48("136412");
      return this.provisioningAdmissionPolicy.checkProvisioningAdmission(move);
    }
  }

  /**
   * Create an operation record after in-memory dedupe lock acquisition.
   * @param {Object} move - Move specification.
   * @return {Promise<Object>} Created or existing operation record.
   * @private
   */
  async createOperationInternal(move) {
    if (stryMutAct_9fa48("136413")) {
      {}
    } else {
      stryCov_9fa48("136413");
      this.assertMembershipPublicationEpoch(move);
      const normalizedMoveType = this.normalizeMoveType(stryMutAct_9fa48("136414") ? move.type : (stryCov_9fa48("136414"), move?.type));
      const shouldEmitOperationCreated = stryMutAct_9fa48("136417") ? move?.emitOperationCreated === false : stryMutAct_9fa48("136416") ? false : stryMutAct_9fa48("136415") ? true : (stryCov_9fa48("136415", "136416", "136417"), (stryMutAct_9fa48("136418") ? move.emitOperationCreated : (stryCov_9fa48("136418"), move?.emitOperationCreated)) !== (stryMutAct_9fa48("136419") ? true : (stryCov_9fa48("136419"), false)));
      const entityType = stryMutAct_9fa48("136422") ? move.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("136421") ? false : stryMutAct_9fa48("136420") ? true : (stryCov_9fa48("136420", "136421", "136422"), move.entityType || SERVICE_TYPE.PARTITION);
      const entityId = stryMutAct_9fa48("136425") ? move.entityId && move.partitionId : stryMutAct_9fa48("136424") ? false : stryMutAct_9fa48("136423") ? true : (stryCov_9fa48("136423", "136424", "136425"), move.entityId || move.partitionId);
      const partitionId = stryMutAct_9fa48("136428") ? move.partitionId && entityId : stryMutAct_9fa48("136427") ? false : stryMutAct_9fa48("136426") ? true : (stryCov_9fa48("136426", "136427", "136428"), move.partitionId || entityId);
      const normalizedMove = normalizedMoveType ? stryMutAct_9fa48("136429") ? {} : (stryCov_9fa48("136429"), {
        ...move,
        type: normalizedMoveType
      }) : move;
      const dedupeKey = this.buildOperationIntentKey(move, entityType, entityId);
      const criticalAddLikeIntentKey = this.buildCriticalAddLikeIntentKey(move, normalizedMoveType, partitionId, entityType, entityId);
      const sourceNodeId = (stryMutAct_9fa48("136432") ? normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136431") ? false : stryMutAct_9fa48("136430") ? true : (stryCov_9fa48("136430", "136431", "136432"), normalizedMoveType === OperationType.REPLACE)) ? stryMutAct_9fa48("136435") ? move.sourceNodeId && this.nodeId : stryMutAct_9fa48("136434") ? false : stryMutAct_9fa48("136433") ? true : (stryCov_9fa48("136433", "136434", "136435"), move.sourceNodeId || this.nodeId) : this.nodeId;

      // Deduplication: check for existing in-flight operation
      const existing = await this.queryExistingInFlightOperation(partitionId, move.nodeId, entityType, entityId, normalizedMove, STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS);
      if (stryMutAct_9fa48("136437") ? false : stryMutAct_9fa48("136436") ? true : (stryCov_9fa48("136436", "136437"), existing)) {
        if (stryMutAct_9fa48("136438")) {
          {}
        } else {
          stryCov_9fa48("136438");
          this.rememberOperationIntents(stryMutAct_9fa48("136439") ? [] : (stryCov_9fa48("136439"), [dedupeKey, criticalAddLikeIntentKey]), existing);
          this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.DUPLICATE_OPERATION, stryMutAct_9fa48("136440") ? {} : (stryCov_9fa48("136440"), {
            existingOperationId: existing.operationId,
            partitionId: partitionId,
            targetNodeId: move.nodeId,
            type: stryMutAct_9fa48("136443") ? normalizedMoveType && move.type : stryMutAct_9fa48("136442") ? false : stryMutAct_9fa48("136441") ? true : (stryCov_9fa48("136441", "136442", "136443"), normalizedMoveType || move.type),
            entityType: entityType,
            entityId: entityId
          }));
          return this.maybeRearmReusedPendingOperation(existing, stryMutAct_9fa48("136444") ? {} : (stryCov_9fa48("136444"), {
            shouldEmitOperationCreated
          }));
        }
      }
      if (stryMutAct_9fa48("136446") ? false : stryMutAct_9fa48("136445") ? true : (stryCov_9fa48("136445", "136446"), criticalAddLikeIntentKey)) {
        if (stryMutAct_9fa48("136447")) {
          {}
        } else {
          stryCov_9fa48("136447");
          const recentCriticalOperation = await this.getRecentOperationIntent(criticalAddLikeIntentKey);
          if (stryMutAct_9fa48("136449") ? false : stryMutAct_9fa48("136448") ? true : (stryCov_9fa48("136448", "136449"), recentCriticalOperation)) {
            if (stryMutAct_9fa48("136450")) {
              {}
            } else {
              stryCov_9fa48("136450");
              this.rememberOperationIntents(stryMutAct_9fa48("136451") ? [] : (stryCov_9fa48("136451"), [dedupeKey, criticalAddLikeIntentKey]), recentCriticalOperation);
              return this.maybeRearmReusedPendingOperation(recentCriticalOperation, stryMutAct_9fa48("136452") ? {} : (stryCov_9fa48("136452"), {
                shouldEmitOperationCreated
              }));
            }
          }
        }
      }
      await this.ensureNoConflictingInFlightReplaceForRemove(stryMutAct_9fa48("136453") ? {} : (stryCov_9fa48("136453"), {
        move,
        normalizedMoveType,
        entityType,
        entityId,
        partitionId
      }));
      await this.ensureCriticalPartitionCreateLaneAvailable(stryMutAct_9fa48("136454") ? {} : (stryCov_9fa48("136454"), {
        move,
        normalizedMoveType,
        entityType,
        entityId,
        partitionId
      }));
      if (stryMutAct_9fa48("136456") ? false : stryMutAct_9fa48("136455") ? true : (stryCov_9fa48("136455", "136456"), this.shouldEnforceConcurrentOperationBudget(move, normalizedMoveType))) {
        if (stryMutAct_9fa48("136457")) {
          {}
        } else {
          stryCov_9fa48("136457");
          return this.runConcurrentCreateBudgetGate(normalizedMoveType, stryMutAct_9fa48("136458") ? {} : (stryCov_9fa48("136458"), {
            partitionId,
            entityType,
            entityId
          }), stryMutAct_9fa48("136459") ? () => undefined : (stryCov_9fa48("136459"), async () => this.createOperationRecordInternal(stryMutAct_9fa48("136460") ? {} : (stryCov_9fa48("136460"), {
            move,
            normalizedMove,
            normalizedMoveType,
            shouldEmitOperationCreated,
            entityType,
            entityId,
            partitionId,
            dedupeKey,
            criticalAddLikeIntentKey,
            sourceNodeId
          }))));
        }
      }
      return this.createOperationRecordInternal(stryMutAct_9fa48("136461") ? {} : (stryCov_9fa48("136461"), {
        move,
        normalizedMove,
        normalizedMoveType,
        shouldEmitOperationCreated,
        entityType,
        entityId,
        partitionId,
        dedupeKey,
        criticalAddLikeIntentKey,
        sourceNodeId
      }));
    }
  }

  /**
   * Build canonical bootstrap topology for create dispatch.
   * Message-group operations fail closed when canonical topology is missing.
   * Partition operations derive topology when visible, but tolerate cache lag
   * so explicit bootstrap hints or local restore paths can still proceed.
   *
   * @param {Object} context
   * @return {{replicaIds: string[], peerAddresses: string[]}|null}
   * @private
   */
  buildOperationBootstrapTopology(context) {
    if (stryMutAct_9fa48("136462")) {
      {}
    } else {
      stryCov_9fa48("136462");
      const {
        normalizedMoveType,
        entityType,
        entityId,
        excludeReplicaIds,
        partitionId,
        targetNodeId,
        targetReplicaId
      } = context;
      if (stryMutAct_9fa48("136465") ? entityType !== SERVICE_TYPE.MESSAGE_GROUP && entityType !== SERVICE_TYPE.PARTITION && normalizedMoveType !== OperationType.ADD && normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136464") ? false : stryMutAct_9fa48("136463") ? true : (stryCov_9fa48("136463", "136464", "136465"), (stryMutAct_9fa48("136467") ? entityType !== SERVICE_TYPE.MESSAGE_GROUP || entityType !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("136466") ? false : (stryCov_9fa48("136466", "136467"), (stryMutAct_9fa48("136469") ? entityType === SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("136468") ? true : (stryCov_9fa48("136468", "136469"), entityType !== SERVICE_TYPE.MESSAGE_GROUP)) && (stryMutAct_9fa48("136471") ? entityType === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("136470") ? true : (stryCov_9fa48("136470", "136471"), entityType !== SERVICE_TYPE.PARTITION)))) || (stryMutAct_9fa48("136473") ? normalizedMoveType !== OperationType.ADD || normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136472") ? false : (stryCov_9fa48("136472", "136473"), (stryMutAct_9fa48("136475") ? normalizedMoveType === OperationType.ADD : stryMutAct_9fa48("136474") ? true : (stryCov_9fa48("136474", "136475"), normalizedMoveType !== OperationType.ADD)) && (stryMutAct_9fa48("136477") ? normalizedMoveType === OperationType.REPLACE : stryMutAct_9fa48("136476") ? true : (stryCov_9fa48("136476", "136477"), normalizedMoveType !== OperationType.REPLACE)))))) {
        if (stryMutAct_9fa48("136478")) {
          {}
        } else {
          stryCov_9fa48("136478");
          return null;
        }
      }
      const serviceRows = this.repository.getEntityServiceRows(stryMutAct_9fa48("136479") ? {} : (stryCov_9fa48("136479"), {
        partitionId,
        entityType,
        entityId
      }));
      if (stryMutAct_9fa48("136482") ? !Array.isArray(serviceRows) && serviceRows.length === NUM.ZERO : stryMutAct_9fa48("136481") ? false : stryMutAct_9fa48("136480") ? true : (stryCov_9fa48("136480", "136481", "136482"), (stryMutAct_9fa48("136483") ? Array.isArray(serviceRows) : (stryCov_9fa48("136483"), !Array.isArray(serviceRows))) || (stryMutAct_9fa48("136485") ? serviceRows.length !== NUM.ZERO : stryMutAct_9fa48("136484") ? false : (stryCov_9fa48("136484", "136485"), serviceRows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("136486")) {
          {}
        } else {
          stryCov_9fa48("136486");
          if (stryMutAct_9fa48("136489") ? entityType !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("136488") ? false : stryMutAct_9fa48("136487") ? true : (stryCov_9fa48("136487", "136488", "136489"), entityType === SERVICE_TYPE.PARTITION)) {
            if (stryMutAct_9fa48("136490")) {
              {}
            } else {
              stryCov_9fa48("136490");
              return null;
            }
          }
          throw new Error(stryMutAct_9fa48("136491") ? `` : (stryCov_9fa48("136491"), `Cannot create ${entityType} operation for ${entityId} without existing canonical topology`));
        }
      }
      const topology = buildReplicatedServiceBootstrapTopology(stryMutAct_9fa48("136492") ? {} : (stryCov_9fa48("136492"), {
        serviceType: entityType,
        serviceRows,
        excludeReplicaIds,
        targetReplicaId,
        targetNodeId
      }));
      const replicaIds = stryMutAct_9fa48("136495") ? topology?.replicaIds && [] : stryMutAct_9fa48("136494") ? false : stryMutAct_9fa48("136493") ? true : (stryCov_9fa48("136493", "136494", "136495"), (stryMutAct_9fa48("136496") ? topology.replicaIds : (stryCov_9fa48("136496"), topology?.replicaIds)) || (stryMutAct_9fa48("136497") ? ["Stryker was here"] : (stryCov_9fa48("136497"), [])));
      const peerAddresses = stryMutAct_9fa48("136500") ? topology?.peerAddresses && [] : stryMutAct_9fa48("136499") ? false : stryMutAct_9fa48("136498") ? true : (stryCov_9fa48("136498", "136499", "136500"), (stryMutAct_9fa48("136501") ? topology.peerAddresses : (stryCov_9fa48("136501"), topology?.peerAddresses)) || (stryMutAct_9fa48("136502") ? ["Stryker was here"] : (stryCov_9fa48("136502"), [])));
      if (stryMutAct_9fa48("136505") ? replicaIds.length <= NUM.ONE && peerAddresses.length < replicaIds.length : stryMutAct_9fa48("136504") ? false : stryMutAct_9fa48("136503") ? true : (stryCov_9fa48("136503", "136504", "136505"), (stryMutAct_9fa48("136508") ? replicaIds.length > NUM.ONE : stryMutAct_9fa48("136507") ? replicaIds.length < NUM.ONE : stryMutAct_9fa48("136506") ? false : (stryCov_9fa48("136506", "136507", "136508"), replicaIds.length <= NUM.ONE)) || (stryMutAct_9fa48("136511") ? peerAddresses.length >= replicaIds.length : stryMutAct_9fa48("136510") ? peerAddresses.length <= replicaIds.length : stryMutAct_9fa48("136509") ? false : (stryCov_9fa48("136509", "136510", "136511"), peerAddresses.length < replicaIds.length)))) {
        if (stryMutAct_9fa48("136512")) {
          {}
        } else {
          stryCov_9fa48("136512");
          if (stryMutAct_9fa48("136515") ? entityType !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("136514") ? false : stryMutAct_9fa48("136513") ? true : (stryCov_9fa48("136513", "136514", "136515"), entityType === SERVICE_TYPE.PARTITION)) {
            if (stryMutAct_9fa48("136516")) {
              {}
            } else {
              stryCov_9fa48("136516");
              return null;
            }
          }
          throw new Error(stryMutAct_9fa48("136517") ? `` : (stryCov_9fa48("136517"), `Canonical topology for ${entityType} ${entityId} is incomplete`));
        }
      }
      return stryMutAct_9fa48("136518") ? {} : (stryCov_9fa48("136518"), {
        replicaIds,
        peerAddresses
      });
    }
  }

  /**
   * Create and persist one operation after dedupe checks pass.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createOperationRecordInternal(context) {
    if (stryMutAct_9fa48("136519")) {
      {}
    } else {
      stryCov_9fa48("136519");
      const {
        move,
        normalizedMove,
        normalizedMoveType,
        shouldEmitOperationCreated,
        entityType,
        entityId,
        partitionId,
        dedupeKey,
        criticalAddLikeIntentKey,
        sourceNodeId
      } = context;
      const operationId = uuidv4();
      const sourceReplicaId = (stryMutAct_9fa48("136522") ? normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136521") ? false : stryMutAct_9fa48("136520") ? true : (stryCov_9fa48("136520", "136521", "136522"), normalizedMoveType === OperationType.REPLACE)) ? stryMutAct_9fa48("136525") ? move.replicaId && null : stryMutAct_9fa48("136524") ? false : stryMutAct_9fa48("136523") ? true : (stryCov_9fa48("136523", "136524", "136525"), move.replicaId || null) : null;
      let operationReplicaId = stryMutAct_9fa48("136528") ? move.replicaId && null : stryMutAct_9fa48("136527") ? false : stryMutAct_9fa48("136526") ? true : (stryCov_9fa48("136526", "136527", "136528"), move.replicaId || null);
      if (stryMutAct_9fa48("136531") ? move?.skipProvisioningAdmissionRecheck === true : stryMutAct_9fa48("136530") ? false : stryMutAct_9fa48("136529") ? true : (stryCov_9fa48("136529", "136530", "136531"), (stryMutAct_9fa48("136532") ? move.skipProvisioningAdmissionRecheck : (stryCov_9fa48("136532"), move?.skipProvisioningAdmissionRecheck)) !== (stryMutAct_9fa48("136533") ? false : (stryCov_9fa48("136533"), true)))) {
        if (stryMutAct_9fa48("136534")) {
          {}
        } else {
          stryCov_9fa48("136534");
          await this.ensureProvisioningAdmissionAllowed(stryMutAct_9fa48("136535") ? {} : (stryCov_9fa48("136535"), {
            move: normalizedMove,
            entityType,
            entityId,
            partitionId,
            sourceNodeId
          }));
        }
      }
      if (stryMutAct_9fa48("136538") ? normalizedMoveType === OperationType.ADD || !operationReplicaId : stryMutAct_9fa48("136537") ? false : stryMutAct_9fa48("136536") ? true : (stryCov_9fa48("136536", "136537", "136538"), (stryMutAct_9fa48("136540") ? normalizedMoveType !== OperationType.ADD : stryMutAct_9fa48("136539") ? true : (stryCov_9fa48("136539", "136540"), normalizedMoveType === OperationType.ADD)) && (stryMutAct_9fa48("136541") ? operationReplicaId : (stryCov_9fa48("136541"), !operationReplicaId)))) {
        if (stryMutAct_9fa48("136542")) {
          {}
        } else {
          stryCov_9fa48("136542");
          operationReplicaId = await this.allocateCanonicalReplicaId(stryMutAct_9fa48("136543") ? {} : (stryCov_9fa48("136543"), {
            partitionId,
            entityType,
            entityId
          }));
        }
      } else if (stryMutAct_9fa48("136546") ? normalizedMoveType === OperationType.REPLACE || !operationReplicaId || operationReplicaId === sourceReplicaId : stryMutAct_9fa48("136545") ? false : stryMutAct_9fa48("136544") ? true : (stryCov_9fa48("136544", "136545", "136546"), (stryMutAct_9fa48("136548") ? normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136547") ? true : (stryCov_9fa48("136547", "136548"), normalizedMoveType === OperationType.REPLACE)) && (stryMutAct_9fa48("136550") ? !operationReplicaId && operationReplicaId === sourceReplicaId : stryMutAct_9fa48("136549") ? true : (stryCov_9fa48("136549", "136550"), (stryMutAct_9fa48("136551") ? operationReplicaId : (stryCov_9fa48("136551"), !operationReplicaId)) || (stryMutAct_9fa48("136553") ? operationReplicaId !== sourceReplicaId : stryMutAct_9fa48("136552") ? false : (stryCov_9fa48("136552", "136553"), operationReplicaId === sourceReplicaId)))))) {
        if (stryMutAct_9fa48("136554")) {
          {}
        } else {
          stryCov_9fa48("136554");
          operationReplicaId = await this.allocateCanonicalReplicaId(stryMutAct_9fa48("136555") ? {} : (stryCov_9fa48("136555"), {
            partitionId,
            entityType,
            entityId,
            excludeReplicaIds: sourceReplicaId ? stryMutAct_9fa48("136556") ? [] : (stryCov_9fa48("136556"), [sourceReplicaId]) : stryMutAct_9fa48("136557") ? ["Stryker was here"] : (stryCov_9fa48("136557"), [])
          }));
        }
      }

      // Create operation using the helper from replica-status.js
      const operation = createOperationRecord(stryMutAct_9fa48("136558") ? {} : (stryCov_9fa48("136558"), {
        operationId,
        type: stryMutAct_9fa48("136561") ? normalizedMoveType && move.type : stryMutAct_9fa48("136560") ? false : stryMutAct_9fa48("136559") ? true : (stryCov_9fa48("136559", "136560", "136561"), normalizedMoveType || move.type),
        partitionId: partitionId,
        sourceNodeId,
        targetNodeId: move.nodeId,
        replicaId: operationReplicaId,
        sourceReplicaId,
        membershipPublicationEpoch: move.membershipPublicationEpoch
      }));
      operation.entityType = entityType;
      operation.entityId = entityId;
      const bootstrapTopology = this.buildOperationBootstrapTopology(stryMutAct_9fa48("136562") ? {} : (stryCov_9fa48("136562"), {
        normalizedMoveType,
        entityType,
        entityId,
        excludeReplicaIds: (stryMutAct_9fa48("136565") ? normalizedMoveType === OperationType.REPLACE && typeof sourceReplicaId === 'string' || sourceReplicaId.length > NUM.ZERO : stryMutAct_9fa48("136564") ? false : stryMutAct_9fa48("136563") ? true : (stryCov_9fa48("136563", "136564", "136565"), (stryMutAct_9fa48("136567") ? normalizedMoveType === OperationType.REPLACE || typeof sourceReplicaId === 'string' : stryMutAct_9fa48("136566") ? true : (stryCov_9fa48("136566", "136567"), (stryMutAct_9fa48("136569") ? normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136568") ? true : (stryCov_9fa48("136568", "136569"), normalizedMoveType === OperationType.REPLACE)) && (stryMutAct_9fa48("136571") ? typeof sourceReplicaId !== 'string' : stryMutAct_9fa48("136570") ? true : (stryCov_9fa48("136570", "136571"), typeof sourceReplicaId === (stryMutAct_9fa48("136572") ? "" : (stryCov_9fa48("136572"), 'string')))))) && (stryMutAct_9fa48("136575") ? sourceReplicaId.length <= NUM.ZERO : stryMutAct_9fa48("136574") ? sourceReplicaId.length >= NUM.ZERO : stryMutAct_9fa48("136573") ? true : (stryCov_9fa48("136573", "136574", "136575"), sourceReplicaId.length > NUM.ZERO)))) ? stryMutAct_9fa48("136576") ? [] : (stryCov_9fa48("136576"), [sourceReplicaId]) : stryMutAct_9fa48("136577") ? ["Stryker was here"] : (stryCov_9fa48("136577"), []),
        partitionId,
        targetNodeId: move.nodeId,
        targetReplicaId: operationReplicaId
      }));
      if (stryMutAct_9fa48("136580") ? bootstrapTopology || operation.stepsHistory.length > NUM.ZERO : stryMutAct_9fa48("136579") ? false : stryMutAct_9fa48("136578") ? true : (stryCov_9fa48("136578", "136579", "136580"), bootstrapTopology && (stryMutAct_9fa48("136583") ? operation.stepsHistory.length <= NUM.ZERO : stryMutAct_9fa48("136582") ? operation.stepsHistory.length >= NUM.ZERO : stryMutAct_9fa48("136581") ? true : (stryCov_9fa48("136581", "136582", "136583"), operation.stepsHistory.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("136584")) {
          {}
        } else {
          stryCov_9fa48("136584");
          operation[ReplicaOperationField.REPLICA_IDS] = bootstrapTopology.replicaIds;
          operation[ReplicaOperationField.PEER_ADDRESSES] = bootstrapTopology.peerAddresses;
          operation.stepsHistory[NUM.ZERO][OPERATION_METADATA_KEY.REPLICA_IDS] = bootstrapTopology.replicaIds;
          operation.stepsHistory[NUM.ZERO][OPERATION_METADATA_KEY.PEER_ADDRESSES] = bootstrapTopology.peerAddresses;
        }
      }

      // Capture readiness snapshot for the target node at creation time
      // (Req 4.2 — persist readiness snapshot with decisions)
      const readinessDecisionDimension = this.resolveOperationReadinessDecisionDimension(partitionId);
      const targetReadiness = this.controlPlaneReadinessService.getNodeReadinessSync(move.nodeId, stryMutAct_9fa48("136585") ? {} : (stryCov_9fa48("136585"), {
        decisionDimension: readinessDecisionDimension
      }));
      const readinessSnapshot = ControlPlaneReadinessService.compactSnapshotSummary(targetReadiness, readinessDecisionDimension);
      if (stryMutAct_9fa48("136588") ? readinessSnapshot || operation.stepsHistory.length > NUM.ZERO : stryMutAct_9fa48("136587") ? false : stryMutAct_9fa48("136586") ? true : (stryCov_9fa48("136586", "136587", "136588"), readinessSnapshot && (stryMutAct_9fa48("136591") ? operation.stepsHistory.length <= NUM.ZERO : stryMutAct_9fa48("136590") ? operation.stepsHistory.length >= NUM.ZERO : stryMutAct_9fa48("136589") ? true : (stryCov_9fa48("136589", "136590", "136591"), operation.stepsHistory.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("136592")) {
          {}
        } else {
          stryCov_9fa48("136592");
          operation.stepsHistory[NUM.ZERO][OPERATION_METADATA_KEY.READINESS_SNAPSHOT] = readinessSnapshot;
        }
      }
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.CREATE_OPERATION, stryMutAct_9fa48("136593") ? {} : (stryCov_9fa48("136593"), {
        operationId,
        type: stryMutAct_9fa48("136596") ? normalizedMoveType && move.type : stryMutAct_9fa48("136595") ? false : stryMutAct_9fa48("136594") ? true : (stryCov_9fa48("136594", "136595", "136596"), normalizedMoveType || move.type),
        partitionId: partitionId,
        targetNodeId: move.nodeId,
        entityType: entityType,
        entityId: entityId
      }));

      // Persist via SQL engine (writes to partition leader)
      const inserted = await this.persistNewOperation(operation);
      if (stryMutAct_9fa48("136599") ? false : stryMutAct_9fa48("136598") ? true : stryMutAct_9fa48("136597") ? inserted : (stryCov_9fa48("136597", "136598", "136599"), !inserted)) {
        if (stryMutAct_9fa48("136600")) {
          {}
        } else {
          stryCov_9fa48("136600");
          const existingAfterInsert = await this.queryExistingInFlightOperation(partitionId, move.nodeId, entityType, entityId, normalizedMove, STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS);
          if (stryMutAct_9fa48("136602") ? false : stryMutAct_9fa48("136601") ? true : (stryCov_9fa48("136601", "136602"), existingAfterInsert)) {
            if (stryMutAct_9fa48("136603")) {
              {}
            } else {
              stryCov_9fa48("136603");
              this.rememberOperationIntents(stryMutAct_9fa48("136604") ? [] : (stryCov_9fa48("136604"), [dedupeKey, criticalAddLikeIntentKey]), existingAfterInsert);
              return this.maybeRearmReusedPendingOperation(existingAfterInsert, stryMutAct_9fa48("136605") ? {} : (stryCov_9fa48("136605"), {
                shouldEmitOperationCreated
              }));
            }
          }
        }
      }
      stryMutAct_9fa48("136606") ? this.stats.operationsCreated-- : (stryCov_9fa48("136606"), this.stats.operationsCreated++);
      this.rememberOperationIntents(stryMutAct_9fa48("136607") ? [] : (stryCov_9fa48("136607"), [dedupeKey, criticalAddLikeIntentKey]), operation);

      // Create storage reservation atomically (Req 4.1)
      await this.createReservationForOperation(operation);
      if (stryMutAct_9fa48("136609") ? false : stryMutAct_9fa48("136608") ? true : (stryCov_9fa48("136608", "136609"), shouldEmitOperationCreated)) {
        if (stryMutAct_9fa48("136610")) {
          {}
        } else {
          stryCov_9fa48("136610");
          this.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, stryMutAct_9fa48("136611") ? {} : (stryCov_9fa48("136611"), {
            operation
          }));
          await this.armCoordinatorCreatedOperationProgress(operation);
        }
      }
      return operation;
    }
  }

  /**
   * Newly created locally owned operations should not depend solely on cache
   * visibility or external listeners before leaving PENDING. Prime the
   * owner-side transition lane best-effort while keeping dispatch ownership on
   * the canonical event/read-model paths.
   *
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  async armCoordinatorCreatedOperationProgress(operation) {
    if (stryMutAct_9fa48("136612")) {
      {}
    } else {
      stryCov_9fa48("136612");
      if (stryMutAct_9fa48("136615") ? !operation?.operationId && typeof this.workflowOwner?.armCoordinatorCreatedOperation !== 'function' : stryMutAct_9fa48("136614") ? false : stryMutAct_9fa48("136613") ? true : (stryCov_9fa48("136613", "136614", "136615"), (stryMutAct_9fa48("136616") ? operation?.operationId : (stryCov_9fa48("136616"), !(stryMutAct_9fa48("136617") ? operation.operationId : (stryCov_9fa48("136617"), operation?.operationId)))) || (stryMutAct_9fa48("136619") ? typeof this.workflowOwner?.armCoordinatorCreatedOperation === 'function' : stryMutAct_9fa48("136618") ? false : (stryCov_9fa48("136618", "136619"), typeof (stryMutAct_9fa48("136620") ? this.workflowOwner.armCoordinatorCreatedOperation : (stryCov_9fa48("136620"), this.workflowOwner?.armCoordinatorCreatedOperation)) !== (stryMutAct_9fa48("136621") ? "" : (stryCov_9fa48("136621"), 'function')))))) {
        if (stryMutAct_9fa48("136622")) {
          {}
        } else {
          stryCov_9fa48("136622");
          return stryMutAct_9fa48("136623") ? true : (stryCov_9fa48("136623"), false);
        }
      }
      try {
        if (stryMutAct_9fa48("136624")) {
          {}
        } else {
          stryCov_9fa48("136624");
          return await this.workflowOwner.armCoordinatorCreatedOperation(operation);
        }
      } catch (error) {
        if (stryMutAct_9fa48("136625")) {
          {}
        } else {
          stryCov_9fa48("136625");
          this.logger.warn(stryMutAct_9fa48("136626") ? "" : (stryCov_9fa48("136626"), 'Failed to prime coordinator-created operation progress'), stryMutAct_9fa48("136627") ? {} : (stryCov_9fa48("136627"), {
            operationId: operation.operationId,
            partitionId: stryMutAct_9fa48("136630") ? operation.partitionId && null : stryMutAct_9fa48("136629") ? false : stryMutAct_9fa48("136628") ? true : (stryCov_9fa48("136628", "136629", "136630"), operation.partitionId || null),
            workflowStep: stryMutAct_9fa48("136633") ? operation.workflowStep && null : stryMutAct_9fa48("136632") ? false : stryMutAct_9fa48("136631") ? true : (stryCov_9fa48("136631", "136632", "136633"), operation.workflowStep || null),
            error: stryMutAct_9fa48("136636") ? error?.message && String(error) : stryMutAct_9fa48("136635") ? false : stryMutAct_9fa48("136634") ? true : (stryCov_9fa48("136634", "136635", "136636"), (stryMutAct_9fa48("136637") ? error.message : (stryCov_9fa48("136637"), error?.message)) || String(error))
          }));
          return stryMutAct_9fa48("136638") ? true : (stryCov_9fa48("136638"), false);
        }
      }
    }
  }

  /**
   * Determine whether this create request should enforce coordinator-level
   * concurrent operation budgets.
   * @param {Object} move
   * @param {string|null} normalizedMoveType
   * @return {boolean}
   * @private
   */
  shouldEnforceConcurrentOperationBudget(move, normalizedMoveType) {
    if (stryMutAct_9fa48("136639")) {
      {}
    } else {
      stryCov_9fa48("136639");
      if (stryMutAct_9fa48("136642") ? move?.enforceConcurrentOperationBudget === true : stryMutAct_9fa48("136641") ? false : stryMutAct_9fa48("136640") ? true : (stryCov_9fa48("136640", "136641", "136642"), (stryMutAct_9fa48("136643") ? move.enforceConcurrentOperationBudget : (stryCov_9fa48("136643"), move?.enforceConcurrentOperationBudget)) !== (stryMutAct_9fa48("136644") ? false : (stryCov_9fa48("136644"), true)))) {
        if (stryMutAct_9fa48("136645")) {
          {}
        } else {
          stryCov_9fa48("136645");
          return stryMutAct_9fa48("136646") ? true : (stryCov_9fa48("136646"), false);
        }
      }
      return stryMutAct_9fa48("136649") ? (normalizedMoveType === OperationType.ADD || normalizedMoveType === OperationType.REPLACE) && normalizedMoveType === OperationType.REMOVE : stryMutAct_9fa48("136648") ? false : stryMutAct_9fa48("136647") ? true : (stryCov_9fa48("136647", "136648", "136649"), (stryMutAct_9fa48("136651") ? normalizedMoveType === OperationType.ADD && normalizedMoveType === OperationType.REPLACE : stryMutAct_9fa48("136650") ? false : (stryCov_9fa48("136650", "136651"), (stryMutAct_9fa48("136653") ? normalizedMoveType !== OperationType.ADD : stryMutAct_9fa48("136652") ? false : (stryCov_9fa48("136652", "136653"), normalizedMoveType === OperationType.ADD)) || (stryMutAct_9fa48("136655") ? normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136654") ? false : (stryCov_9fa48("136654", "136655"), normalizedMoveType === OperationType.REPLACE)))) || (stryMutAct_9fa48("136657") ? normalizedMoveType !== OperationType.REMOVE : stryMutAct_9fa48("136656") ? false : (stryCov_9fa48("136656", "136657"), normalizedMoveType === OperationType.REMOVE)));
    }
  }

  /**
   * Critical system partitions admit only one add-like workflow at a time.
   * This prevents multiple replacement learners from racing ahead of the
   * source-removal phase and creating temporary 5-voter critical groups.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureCriticalPartitionCreateLaneAvailable(context) {
    if (stryMutAct_9fa48("136658")) {
      {}
    } else {
      stryCov_9fa48("136658");
      const normalizedMoveType = stryMutAct_9fa48("136659") ? context.normalizedMoveType : (stryCov_9fa48("136659"), context?.normalizedMoveType);
      if (stryMutAct_9fa48("136662") ? context?.move?.enforceConcurrentOperationBudget === true : stryMutAct_9fa48("136661") ? false : stryMutAct_9fa48("136660") ? true : (stryCov_9fa48("136660", "136661", "136662"), (stryMutAct_9fa48("136664") ? context.move?.enforceConcurrentOperationBudget : stryMutAct_9fa48("136663") ? context?.move.enforceConcurrentOperationBudget : (stryCov_9fa48("136663", "136664"), context?.move?.enforceConcurrentOperationBudget)) !== (stryMutAct_9fa48("136665") ? false : (stryCov_9fa48("136665"), true)))) {
        if (stryMutAct_9fa48("136666")) {
          {}
        } else {
          stryCov_9fa48("136666");
          return;
        }
      }
      if (stryMutAct_9fa48("136669") ? normalizedMoveType !== OperationType.ADD || normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136668") ? false : stryMutAct_9fa48("136667") ? true : (stryCov_9fa48("136667", "136668", "136669"), (stryMutAct_9fa48("136671") ? normalizedMoveType === OperationType.ADD : stryMutAct_9fa48("136670") ? true : (stryCov_9fa48("136670", "136671"), normalizedMoveType !== OperationType.ADD)) && (stryMutAct_9fa48("136673") ? normalizedMoveType === OperationType.REPLACE : stryMutAct_9fa48("136672") ? true : (stryCov_9fa48("136672", "136673"), normalizedMoveType !== OperationType.REPLACE)))) {
        if (stryMutAct_9fa48("136674")) {
          {}
        } else {
          stryCov_9fa48("136674");
          return;
        }
      }
      if (stryMutAct_9fa48("136677") ? false : stryMutAct_9fa48("136676") ? true : stryMutAct_9fa48("136675") ? this.isCriticalSystemPartition(context?.partitionId) : (stryCov_9fa48("136675", "136676", "136677"), !this.isCriticalSystemPartition(stryMutAct_9fa48("136678") ? context.partitionId : (stryCov_9fa48("136678"), context?.partitionId)))) {
        if (stryMutAct_9fa48("136679")) {
          {}
        } else {
          stryCov_9fa48("136679");
          return;
        }
      }
      const existingOperations = await this.repository.getOperationsByEntityAuthoritative(stryMutAct_9fa48("136682") ? context?.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("136681") ? false : stryMutAct_9fa48("136680") ? true : (stryCov_9fa48("136680", "136681", "136682"), (stryMutAct_9fa48("136683") ? context.entityType : (stryCov_9fa48("136683"), context?.entityType)) || SERVICE_TYPE.PARTITION), stryMutAct_9fa48("136686") ? context?.entityId && context?.partitionId : stryMutAct_9fa48("136685") ? false : stryMutAct_9fa48("136684") ? true : (stryCov_9fa48("136684", "136685", "136686"), (stryMutAct_9fa48("136687") ? context.entityId : (stryCov_9fa48("136687"), context?.entityId)) || (stryMutAct_9fa48("136688") ? context.partitionId : (stryCov_9fa48("136688"), context?.partitionId))));
      let conflictingOperation = null;
      for (const operation of existingOperations) {
        if (stryMutAct_9fa48("136689")) {
          {}
        } else {
          stryCov_9fa48("136689");
          if (stryMutAct_9fa48("136692") ? !operation && this.isOperationTerminal(operation) : stryMutAct_9fa48("136691") ? false : stryMutAct_9fa48("136690") ? true : (stryCov_9fa48("136690", "136691", "136692"), (stryMutAct_9fa48("136693") ? operation : (stryCov_9fa48("136693"), !operation)) || this.isOperationTerminal(operation))) {
            if (stryMutAct_9fa48("136694")) {
              {}
            } else {
              stryCov_9fa48("136694");
              continue;
            }
          }
          if (stryMutAct_9fa48("136697") ? false : stryMutAct_9fa48("136696") ? true : stryMutAct_9fa48("136695") ? this.isConcurrentAddBudgetOperation(operation) : (stryCov_9fa48("136695", "136696", "136697"), !this.isConcurrentAddBudgetOperation(operation))) {
            if (stryMutAct_9fa48("136698")) {
              {}
            } else {
              stryCov_9fa48("136698");
              continue;
            }
          }
          if (stryMutAct_9fa48("136700") ? false : stryMutAct_9fa48("136699") ? true : (stryCov_9fa48("136699", "136700"), await this.shouldIgnoreCriticalAddBudgetOperation(operation))) {
            if (stryMutAct_9fa48("136701")) {
              {}
            } else {
              stryCov_9fa48("136701");
              continue;
            }
          }
          conflictingOperation = operation;
          break;
        }
      }
      if (stryMutAct_9fa48("136704") ? false : stryMutAct_9fa48("136703") ? true : stryMutAct_9fa48("136702") ? conflictingOperation : (stryCov_9fa48("136702", "136703", "136704"), !conflictingOperation)) {
        if (stryMutAct_9fa48("136705")) {
          {}
        } else {
          stryCov_9fa48("136705");
          return;
        }
      }
      throw this.createConcurrentOperationBudgetError(normalizedMoveType, 1, stryMutAct_9fa48("136706") ? {} : (stryCov_9fa48("136706"), {
        message: (stryMutAct_9fa48("136707") ? "" : (stryCov_9fa48("136707"), 'Critical partition ')) + (stryMutAct_9fa48("136708") ? `` : (stryCov_9fa48("136708"), `${context.partitionId} already has an add-like operation `)) + (stryMutAct_9fa48("136709") ? "" : (stryCov_9fa48("136709"), 'in flight')),
        conflictingOperationId: conflictingOperation.operationId
      }));
    }
  }

  /**
   * Priority recovery rows that already satisfy spread or no longer target the
   * current eligible cohort must not keep blocking the next add-like action.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async shouldIgnoreCriticalAddBudgetOperation(operation) {
    if (stryMutAct_9fa48("136710")) {
      {}
    } else {
      stryCov_9fa48("136710");
      if (stryMutAct_9fa48("136713") ? (!operation || !isPriorityControlPlanePartitionTable({
        partitionId: operation.partitionId
      })) && typeof this.workflowOwner?.getPriorityRecoveryPlanningSnapshotForOperation !== 'function' : stryMutAct_9fa48("136712") ? false : stryMutAct_9fa48("136711") ? true : (stryCov_9fa48("136711", "136712", "136713"), (stryMutAct_9fa48("136715") ? !operation && !isPriorityControlPlanePartitionTable({
        partitionId: operation.partitionId
      }) : stryMutAct_9fa48("136714") ? false : (stryCov_9fa48("136714", "136715"), (stryMutAct_9fa48("136716") ? operation : (stryCov_9fa48("136716"), !operation)) || (stryMutAct_9fa48("136717") ? isPriorityControlPlanePartitionTable({
        partitionId: operation.partitionId
      }) : (stryCov_9fa48("136717"), !isPriorityControlPlanePartitionTable(stryMutAct_9fa48("136718") ? {} : (stryCov_9fa48("136718"), {
        partitionId: operation.partitionId
      })))))) || (stryMutAct_9fa48("136720") ? typeof this.workflowOwner?.getPriorityRecoveryPlanningSnapshotForOperation === 'function' : stryMutAct_9fa48("136719") ? false : (stryCov_9fa48("136719", "136720"), typeof (stryMutAct_9fa48("136721") ? this.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation : (stryCov_9fa48("136721"), this.workflowOwner?.getPriorityRecoveryPlanningSnapshotForOperation)) !== (stryMutAct_9fa48("136722") ? "" : (stryCov_9fa48("136722"), 'function')))))) {
        if (stryMutAct_9fa48("136723")) {
          {}
        } else {
          stryCov_9fa48("136723");
          return stryMutAct_9fa48("136724") ? true : (stryCov_9fa48("136724"), false);
        }
      }
      const planningSnapshot = await this.workflowOwner.getPriorityRecoveryPlanningSnapshotForOperation(operation);
      if (stryMutAct_9fa48("136727") ? !planningSnapshot && typeof planningSnapshot !== 'object' : stryMutAct_9fa48("136726") ? false : stryMutAct_9fa48("136725") ? true : (stryCov_9fa48("136725", "136726", "136727"), (stryMutAct_9fa48("136728") ? planningSnapshot : (stryCov_9fa48("136728"), !planningSnapshot)) || (stryMutAct_9fa48("136730") ? typeof planningSnapshot === 'object' : stryMutAct_9fa48("136729") ? false : (stryCov_9fa48("136729", "136730"), typeof planningSnapshot !== (stryMutAct_9fa48("136731") ? "" : (stryCov_9fa48("136731"), 'object')))))) {
        if (stryMutAct_9fa48("136732")) {
          {}
        } else {
          stryCov_9fa48("136732");
          return stryMutAct_9fa48("136733") ? true : (stryCov_9fa48("136733"), false);
        }
      }
      const assessment = buildPriorityRecoveryOperationAssessment(stryMutAct_9fa48("136734") ? {} : (stryCov_9fa48("136734"), {
        operation,
        priorityPartitionSummary: stryMutAct_9fa48("136737") ? planningSnapshot.priorityPartitionSummary && null : stryMutAct_9fa48("136736") ? false : stryMutAct_9fa48("136735") ? true : (stryCov_9fa48("136735", "136736", "136737"), planningSnapshot.priorityPartitionSummary || null),
        effectiveEligibleNodeIds: resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds
      }));
      return stryMutAct_9fa48("136738") ? shouldPriorityRecoveryOperationBlockPlanning(assessment) : (stryCov_9fa48("136738"), !shouldPriorityRecoveryOperationBlockPlanning(assessment));
    }
  }

  /**
   * Prevent conflicting REMOVE scheduling while a REPLACE workflow already
   * owns the same source/target replica lifecycle.
   *
   * This guard uses authoritative operation rows to avoid cache-staleness
   * races where planner-side pending-move tracking can lag behind a REPLACE
   * transition and allow an overlapping REMOVE to be created.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureNoConflictingInFlightReplaceForRemove(context) {
    if (stryMutAct_9fa48("136739")) {
      {}
    } else {
      stryCov_9fa48("136739");
      if (stryMutAct_9fa48("136742") ? context?.normalizedMoveType === OperationType.REMOVE : stryMutAct_9fa48("136741") ? false : stryMutAct_9fa48("136740") ? true : (stryCov_9fa48("136740", "136741", "136742"), (stryMutAct_9fa48("136743") ? context.normalizedMoveType : (stryCov_9fa48("136743"), context?.normalizedMoveType)) !== OperationType.REMOVE)) {
        if (stryMutAct_9fa48("136744")) {
          {}
        } else {
          stryCov_9fa48("136744");
          return;
        }
      }
      const replicaId = stryMutAct_9fa48("136745") ? String(context?.move?.replicaId || '') : (stryCov_9fa48("136745"), String(stryMutAct_9fa48("136748") ? context?.move?.replicaId && '' : stryMutAct_9fa48("136747") ? false : stryMutAct_9fa48("136746") ? true : (stryCov_9fa48("136746", "136747", "136748"), (stryMutAct_9fa48("136750") ? context.move?.replicaId : stryMutAct_9fa48("136749") ? context?.move.replicaId : (stryCov_9fa48("136749", "136750"), context?.move?.replicaId)) || (stryMutAct_9fa48("136751") ? "Stryker was here!" : (stryCov_9fa48("136751"), '')))).trim());
      if (stryMutAct_9fa48("136754") ? replicaId.length !== NUM.ZERO : stryMutAct_9fa48("136753") ? false : stryMutAct_9fa48("136752") ? true : (stryCov_9fa48("136752", "136753", "136754"), replicaId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("136755")) {
          {}
        } else {
          stryCov_9fa48("136755");
          return;
        }
      }
      const operations = await this.repository.getOperationsByEntityAuthoritative(stryMutAct_9fa48("136758") ? context?.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("136757") ? false : stryMutAct_9fa48("136756") ? true : (stryCov_9fa48("136756", "136757", "136758"), (stryMutAct_9fa48("136759") ? context.entityType : (stryCov_9fa48("136759"), context?.entityType)) || SERVICE_TYPE.PARTITION), stryMutAct_9fa48("136762") ? context?.entityId && context?.partitionId : stryMutAct_9fa48("136761") ? false : stryMutAct_9fa48("136760") ? true : (stryCov_9fa48("136760", "136761", "136762"), (stryMutAct_9fa48("136763") ? context.entityId : (stryCov_9fa48("136763"), context?.entityId)) || (stryMutAct_9fa48("136764") ? context.partitionId : (stryCov_9fa48("136764"), context?.partitionId))));
      const conflictingOperation = operations.find(operation => {
        if (stryMutAct_9fa48("136765")) {
          {}
        } else {
          stryCov_9fa48("136765");
          if (stryMutAct_9fa48("136768") ? (!operation || this.isOperationTerminal(operation)) && operation.type !== OperationType.REPLACE : stryMutAct_9fa48("136767") ? false : stryMutAct_9fa48("136766") ? true : (stryCov_9fa48("136766", "136767", "136768"), (stryMutAct_9fa48("136770") ? !operation && this.isOperationTerminal(operation) : stryMutAct_9fa48("136769") ? false : (stryCov_9fa48("136769", "136770"), (stryMutAct_9fa48("136771") ? operation : (stryCov_9fa48("136771"), !operation)) || this.isOperationTerminal(operation))) || (stryMutAct_9fa48("136773") ? operation.type === OperationType.REPLACE : stryMutAct_9fa48("136772") ? false : (stryCov_9fa48("136772", "136773"), operation.type !== OperationType.REPLACE)))) {
            if (stryMutAct_9fa48("136774")) {
              {}
            } else {
              stryCov_9fa48("136774");
              return stryMutAct_9fa48("136775") ? true : (stryCov_9fa48("136775"), false);
            }
          }
          if (stryMutAct_9fa48("136778") ? operation.operationId !== context?.move?.operationId : stryMutAct_9fa48("136777") ? false : stryMutAct_9fa48("136776") ? true : (stryCov_9fa48("136776", "136777", "136778"), operation.operationId === (stryMutAct_9fa48("136780") ? context.move?.operationId : stryMutAct_9fa48("136779") ? context?.move.operationId : (stryCov_9fa48("136779", "136780"), context?.move?.operationId)))) {
            if (stryMutAct_9fa48("136781")) {
              {}
            } else {
              stryCov_9fa48("136781");
              return stryMutAct_9fa48("136782") ? true : (stryCov_9fa48("136782"), false);
            }
          }
          const replaceSourceReplicaId = this.getReplaceSourceReplicaId(operation);
          const replaceTargetReplicaId = this.getReplaceTargetReplicaId(operation);
          return stryMutAct_9fa48("136785") ? replicaId === replaceSourceReplicaId && replicaId === replaceTargetReplicaId : stryMutAct_9fa48("136784") ? false : stryMutAct_9fa48("136783") ? true : (stryCov_9fa48("136783", "136784", "136785"), (stryMutAct_9fa48("136787") ? replicaId !== replaceSourceReplicaId : stryMutAct_9fa48("136786") ? false : (stryCov_9fa48("136786", "136787"), replicaId === replaceSourceReplicaId)) || (stryMutAct_9fa48("136789") ? replicaId !== replaceTargetReplicaId : stryMutAct_9fa48("136788") ? false : (stryCov_9fa48("136788", "136789"), replicaId === replaceTargetReplicaId)));
        }
      });
      if (stryMutAct_9fa48("136792") ? false : stryMutAct_9fa48("136791") ? true : stryMutAct_9fa48("136790") ? conflictingOperation : (stryCov_9fa48("136790", "136791", "136792"), !conflictingOperation)) {
        if (stryMutAct_9fa48("136793")) {
          {}
        } else {
          stryCov_9fa48("136793");
          return;
        }
      }
      throw this.createConflictingOperationInFlightError(stryMutAct_9fa48("136794") ? context.normalizedMoveType : (stryCov_9fa48("136794"), context?.normalizedMoveType), replicaId, conflictingOperation);
    }
  }

  /**
   * Serialize create admission through one add-like or remove-like budget lane.
   * @param {string|null} normalizedMoveType
   * @param {Object} [budgetContext={}]
   * @param {Function} executionFactory
   * @return {Promise<*>}
   * @private
   */
  async runConcurrentCreateBudgetGate(normalizedMoveType, budgetContext = {}, executionFactory) {
    if (stryMutAct_9fa48("136795")) {
      {}
    } else {
      stryCov_9fa48("136795");
      const scope = this.resolveConcurrentCreateBudgetScope(normalizedMoveType, budgetContext);
      return this.operationWorkflowRunExclusive(this.getCreateBudgetSingleFlightKey(scope), async () => {
        if (stryMutAct_9fa48("136796")) {
          {}
        } else {
          stryCov_9fa48("136796");
          await this.ensureConcurrentOperationBudgetAllowed(normalizedMoveType, budgetContext);
          return executionFactory();
        }
      });
    }
  }

  /**
   * Keep emergency priority recovery admission off the ordinary create-budget
   * single-flight lane so unrelated add scheduling cannot head-of-line block
   * the control-plane partitions that publish and execute recovery itself.
   * @param {string|null} normalizedMoveType
   * @param {Object} [budgetContext={}]
   * @return {string}
   * @private
   */
  resolveConcurrentCreateBudgetScope(normalizedMoveType, budgetContext = {}) {
    if (stryMutAct_9fa48("136797")) {
      {}
    } else {
      stryCov_9fa48("136797");
      if (stryMutAct_9fa48("136800") ? normalizedMoveType !== OperationType.REMOVE : stryMutAct_9fa48("136799") ? false : stryMutAct_9fa48("136798") ? true : (stryCov_9fa48("136798", "136799", "136800"), normalizedMoveType === OperationType.REMOVE)) {
        if (stryMutAct_9fa48("136801")) {
          {}
        } else {
          stryCov_9fa48("136801");
          return CONCURRENT_CREATE_BUDGET_SCOPE.REMOVE;
        }
      }
      if (stryMutAct_9fa48("136804") ? false : stryMutAct_9fa48("136803") ? true : stryMutAct_9fa48("136802") ? this.shouldUsePriorityConcurrentAddLane(normalizedMoveType, budgetContext) : (stryCov_9fa48("136802", "136803", "136804"), !this.shouldUsePriorityConcurrentAddLane(normalizedMoveType, budgetContext))) {
        if (stryMutAct_9fa48("136805")) {
          {}
        } else {
          stryCov_9fa48("136805");
          return CONCURRENT_CREATE_BUDGET_SCOPE.ADD;
        }
      }
      const priorityRecoveryAdmissionPlan = this.getPriorityRecoveryAdmissionPlan();
      if (stryMutAct_9fa48("136808") ? priorityRecoveryAdmissionPlan.usesEmergencyPriorityOverflow(budgetContext?.partitionId) !== true : stryMutAct_9fa48("136807") ? false : stryMutAct_9fa48("136806") ? true : (stryCov_9fa48("136806", "136807", "136808"), priorityRecoveryAdmissionPlan.usesEmergencyPriorityOverflow(stryMutAct_9fa48("136809") ? budgetContext.partitionId : (stryCov_9fa48("136809"), budgetContext?.partitionId)) === (stryMutAct_9fa48("136810") ? false : (stryCov_9fa48("136810"), true)))) {
        if (stryMutAct_9fa48("136811")) {
          {}
        } else {
          stryCov_9fa48("136811");
          return CONCURRENT_CREATE_BUDGET_SCOPE.EMERGENCY_PRIORITY_ADD;
        }
      }
      return CONCURRENT_CREATE_BUDGET_SCOPE.PRIORITY_ADD;
    }
  }

  /**
   * Critical system partitions must not be starved behind the empty-cache
   * observation backoff. The backoff guards cache freshness, but it should
   * not suppress control-plane recovery operations that already run through
   * the strict critical-partition create lane.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldBypassConcurrentBudgetEmptyBackoff(normalizedMoveType, options = {}) {
    if (stryMutAct_9fa48("136812")) {
      {}
    } else {
      stryCov_9fa48("136812");
      if (stryMutAct_9fa48("136815") ? normalizedMoveType !== OperationType.ADD && normalizedMoveType !== OperationType.REPLACE || normalizedMoveType !== OperationType.REMOVE : stryMutAct_9fa48("136814") ? false : stryMutAct_9fa48("136813") ? true : (stryCov_9fa48("136813", "136814", "136815"), (stryMutAct_9fa48("136817") ? normalizedMoveType !== OperationType.ADD || normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136816") ? true : (stryCov_9fa48("136816", "136817"), (stryMutAct_9fa48("136819") ? normalizedMoveType === OperationType.ADD : stryMutAct_9fa48("136818") ? true : (stryCov_9fa48("136818", "136819"), normalizedMoveType !== OperationType.ADD)) && (stryMutAct_9fa48("136821") ? normalizedMoveType === OperationType.REPLACE : stryMutAct_9fa48("136820") ? true : (stryCov_9fa48("136820", "136821"), normalizedMoveType !== OperationType.REPLACE)))) && (stryMutAct_9fa48("136823") ? normalizedMoveType === OperationType.REMOVE : stryMutAct_9fa48("136822") ? true : (stryCov_9fa48("136822", "136823"), normalizedMoveType !== OperationType.REMOVE)))) {
        if (stryMutAct_9fa48("136824")) {
          {}
        } else {
          stryCov_9fa48("136824");
          return stryMutAct_9fa48("136825") ? true : (stryCov_9fa48("136825"), false);
        }
      }
      const partitionId = stryMutAct_9fa48("136826") ? String(options.partitionId || '') : (stryCov_9fa48("136826"), String(stryMutAct_9fa48("136829") ? options.partitionId && '' : stryMutAct_9fa48("136828") ? false : stryMutAct_9fa48("136827") ? true : (stryCov_9fa48("136827", "136828", "136829"), options.partitionId || (stryMutAct_9fa48("136830") ? "Stryker was here!" : (stryCov_9fa48("136830"), '')))).trim());
      if (stryMutAct_9fa48("136833") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("136832") ? false : stryMutAct_9fa48("136831") ? true : (stryCov_9fa48("136831", "136832", "136833"), partitionId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("136834")) {
          {}
        } else {
          stryCov_9fa48("136834");
          return stryMutAct_9fa48("136835") ? true : (stryCov_9fa48("136835"), false);
        }
      }
      return this.isCriticalSystemPartition(partitionId);
    }
  }

  /**
   * Priority control-plane partitions must re-check authoritative in-flight
   * counts when cache-sourced budget admission is saturated.
   * Cache lag is expected during recovery and must not strand spread progress.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldPreferAuthoritativeConcurrentBudgetCheck(normalizedMoveType, options = {}) {
    if (stryMutAct_9fa48("136836")) {
      {}
    } else {
      stryCov_9fa48("136836");
      if (stryMutAct_9fa48("136839") ? options.preferAuthoritativeCount !== true : stryMutAct_9fa48("136838") ? false : stryMutAct_9fa48("136837") ? true : (stryCov_9fa48("136837", "136838", "136839"), options.preferAuthoritativeCount === (stryMutAct_9fa48("136840") ? false : (stryCov_9fa48("136840"), true)))) {
        if (stryMutAct_9fa48("136841")) {
          {}
        } else {
          stryCov_9fa48("136841");
          return stryMutAct_9fa48("136842") ? false : (stryCov_9fa48("136842"), true);
        }
      }
      if (stryMutAct_9fa48("136845") ? normalizedMoveType !== OperationType.ADD && normalizedMoveType !== OperationType.REPLACE || normalizedMoveType !== OperationType.REMOVE : stryMutAct_9fa48("136844") ? false : stryMutAct_9fa48("136843") ? true : (stryCov_9fa48("136843", "136844", "136845"), (stryMutAct_9fa48("136847") ? normalizedMoveType !== OperationType.ADD || normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136846") ? true : (stryCov_9fa48("136846", "136847"), (stryMutAct_9fa48("136849") ? normalizedMoveType === OperationType.ADD : stryMutAct_9fa48("136848") ? true : (stryCov_9fa48("136848", "136849"), normalizedMoveType !== OperationType.ADD)) && (stryMutAct_9fa48("136851") ? normalizedMoveType === OperationType.REPLACE : stryMutAct_9fa48("136850") ? true : (stryCov_9fa48("136850", "136851"), normalizedMoveType !== OperationType.REPLACE)))) && (stryMutAct_9fa48("136853") ? normalizedMoveType === OperationType.REMOVE : stryMutAct_9fa48("136852") ? true : (stryCov_9fa48("136852", "136853"), normalizedMoveType !== OperationType.REMOVE)))) {
        if (stryMutAct_9fa48("136854")) {
          {}
        } else {
          stryCov_9fa48("136854");
          return stryMutAct_9fa48("136855") ? true : (stryCov_9fa48("136855"), false);
        }
      }
      const partitionId = stryMutAct_9fa48("136856") ? String(options.partitionId || '') : (stryCov_9fa48("136856"), String(stryMutAct_9fa48("136859") ? options.partitionId && '' : stryMutAct_9fa48("136858") ? false : stryMutAct_9fa48("136857") ? true : (stryCov_9fa48("136857", "136858", "136859"), options.partitionId || (stryMutAct_9fa48("136860") ? "Stryker was here!" : (stryCov_9fa48("136860"), '')))).trim());
      if (stryMutAct_9fa48("136863") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("136862") ? false : stryMutAct_9fa48("136861") ? true : (stryCov_9fa48("136861", "136862", "136863"), partitionId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("136864")) {
          {}
        } else {
          stryCov_9fa48("136864");
          return stryMutAct_9fa48("136865") ? true : (stryCov_9fa48("136865"), false);
        }
      }
      return this.isPriorityControlPlanePartition(partitionId);
    }
  }

  /**
   * Priority control-plane spread must not stall behind unrelated add/replace
   * workflows. Keep priority add/replace operations on a dedicated count lane
   * while preserving the configured maxConcurrentAdds bound.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {boolean}
   * @private
   */
  shouldUsePriorityConcurrentAddLane(normalizedMoveType, options = {}) {
    if (stryMutAct_9fa48("136866")) {
      {}
    } else {
      stryCov_9fa48("136866");
      if (stryMutAct_9fa48("136869") ? normalizedMoveType !== OperationType.ADD || normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136868") ? false : stryMutAct_9fa48("136867") ? true : (stryCov_9fa48("136867", "136868", "136869"), (stryMutAct_9fa48("136871") ? normalizedMoveType === OperationType.ADD : stryMutAct_9fa48("136870") ? true : (stryCov_9fa48("136870", "136871"), normalizedMoveType !== OperationType.ADD)) && (stryMutAct_9fa48("136873") ? normalizedMoveType === OperationType.REPLACE : stryMutAct_9fa48("136872") ? true : (stryCov_9fa48("136872", "136873"), normalizedMoveType !== OperationType.REPLACE)))) {
        if (stryMutAct_9fa48("136874")) {
          {}
        } else {
          stryCov_9fa48("136874");
          return stryMutAct_9fa48("136875") ? true : (stryCov_9fa48("136875"), false);
        }
      }
      const partitionId = stryMutAct_9fa48("136876") ? String(options.partitionId || '') : (stryCov_9fa48("136876"), String(stryMutAct_9fa48("136879") ? options.partitionId && '' : stryMutAct_9fa48("136878") ? false : stryMutAct_9fa48("136877") ? true : (stryCov_9fa48("136877", "136878", "136879"), options.partitionId || (stryMutAct_9fa48("136880") ? "Stryker was here!" : (stryCov_9fa48("136880"), '')))).trim());
      if (stryMutAct_9fa48("136883") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("136882") ? false : stryMutAct_9fa48("136881") ? true : (stryCov_9fa48("136881", "136882", "136883"), partitionId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("136884")) {
          {}
        } else {
          stryCov_9fa48("136884");
          return stryMutAct_9fa48("136885") ? true : (stryCov_9fa48("136885"), false);
        }
      }
      return this.isPriorityControlPlanePartition(partitionId);
    }
  }

  /**
   * Critical transport/system-table partitions own publication and
   * replica-operation convergence for the rest of the control plane. During
   * active priority recovery they must retain one extra add-like slot so
   * ordinary priority system tables cannot consume the whole priority lane.
   * @param {string|null} partitionId
   * @return {boolean}
   * @private
   */
  isEmergencyPriorityControlPlanePartition(partitionId) {
    if (stryMutAct_9fa48("136886")) {
      {}
    } else {
      stryCov_9fa48("136886");
      return isCriticalTransportControlPlanePartitionTable(stryMutAct_9fa48("136887") ? {} : (stryCov_9fa48("136887"), {
        partitionId
      }));
    }
  }

  /**
   * Resolve the latest cluster publication row when available.
   * @return {Object|null}
   * @private
   */
  getLatestMembershipPublicationRow() {
    if (stryMutAct_9fa48("136888")) {
      {}
    } else {
      stryCov_9fa48("136888");
      const publicationService = stryMutAct_9fa48("136889") ? this.controlPlaneReadinessService.membershipPublicationService : (stryCov_9fa48("136889"), this.controlPlaneReadinessService?.membershipPublicationService);
      let publicationRow = null;
      if (stryMutAct_9fa48("136892") ? publicationService || typeof publicationService.getLatestClusterPublicationSync === 'function' : stryMutAct_9fa48("136891") ? false : stryMutAct_9fa48("136890") ? true : (stryCov_9fa48("136890", "136891", "136892"), publicationService && (stryMutAct_9fa48("136894") ? typeof publicationService.getLatestClusterPublicationSync !== 'function' : stryMutAct_9fa48("136893") ? true : (stryCov_9fa48("136893", "136894"), typeof publicationService.getLatestClusterPublicationSync === (stryMutAct_9fa48("136895") ? "" : (stryCov_9fa48("136895"), 'function')))))) {
        if (stryMutAct_9fa48("136896")) {
          {}
        } else {
          stryCov_9fa48("136896");
          publicationRow = publicationService.getLatestClusterPublicationSync();
        }
      } else if (stryMutAct_9fa48("136899") ? publicationService || typeof publicationService.getLatestPublicationRowSync === 'function' : stryMutAct_9fa48("136898") ? false : stryMutAct_9fa48("136897") ? true : (stryCov_9fa48("136897", "136898", "136899"), publicationService && (stryMutAct_9fa48("136901") ? typeof publicationService.getLatestPublicationRowSync !== 'function' : stryMutAct_9fa48("136900") ? true : (stryCov_9fa48("136900", "136901"), typeof publicationService.getLatestPublicationRowSync === (stryMutAct_9fa48("136902") ? "" : (stryCov_9fa48("136902"), 'function')))))) {
        if (stryMutAct_9fa48("136903")) {
          {}
        } else {
          stryCov_9fa48("136903");
          publicationRow = publicationService.getLatestPublicationRowSync();
        }
      }
      return (stryMutAct_9fa48("136906") ? publicationRow || typeof publicationRow === 'object' : stryMutAct_9fa48("136905") ? false : stryMutAct_9fa48("136904") ? true : (stryCov_9fa48("136904", "136905", "136906"), publicationRow && (stryMutAct_9fa48("136908") ? typeof publicationRow !== 'object' : stryMutAct_9fa48("136907") ? true : (stryCov_9fa48("136907", "136908"), typeof publicationRow === (stryMutAct_9fa48("136909") ? "" : (stryCov_9fa48("136909"), 'object')))))) ? publicationRow : null;
    }
  }

  /**
   * Priority recovery remains active while the latest membership publication
   * summary still reports unsatisfied spread. A short stale grace window keeps
   * recovery admission active when publication summary reads are transiently
   * unavailable under load.
   * @return {boolean}
   * @private
   */
  getPriorityRecoveryAdmissionPlan() {
    if (stryMutAct_9fa48("136910")) {
      {}
    } else {
      stryCov_9fa48("136910");
      return resolveTrackedPriorityRecoveryAdmissionPlan(stryMutAct_9fa48("136911") ? {} : (stryCov_9fa48("136911"), {
        tracker: this.priorityRecoveryAdmissionTracker,
        publicationRow: this.getLatestMembershipPublicationRow(),
        nowMs: this.nowFn(),
        staleGraceMs: this.priorityRecoveryActivityStaleGraceMs,
        maxConcurrentAdds: this.config.maxConcurrentAdds,
        isPriorityPartition: stryMutAct_9fa48("136912") ? () => undefined : (stryCov_9fa48("136912"), partitionId => this.isPriorityControlPlanePartition(partitionId)),
        isEmergencyPriorityPartition: stryMutAct_9fa48("136913") ? () => undefined : (stryCov_9fa48("136913"), partitionId => this.isEmergencyPriorityControlPlanePartition(partitionId))
      }));
    }
  }
  isGlobalPriorityControlPlaneRecoveryActive() {
    if (stryMutAct_9fa48("136914")) {
      {}
    } else {
      stryCov_9fa48("136914");
      return stryMutAct_9fa48("136917") ? this.getPriorityRecoveryAdmissionPlan().recoveryActive !== true : stryMutAct_9fa48("136916") ? false : stryMutAct_9fa48("136915") ? true : (stryCov_9fa48("136915", "136916", "136917"), this.getPriorityRecoveryAdmissionPlan().recoveryActive === (stryMutAct_9fa48("136918") ? false : (stryCov_9fa48("136918"), true)));
    }
  }

  /**
   * Return true when emergency transport partitions are currently part of the
   * unresolved priority spread set. This keeps the emergency reservation
   * narrow: ordinary priority tables should not be hard-blocked at limit 1
   * when only ordinary priority partitions remain unresolved.
   *
   * Uses the same stale-grace semantics as global recovery activation so
   * transient summary read gaps do not flap reservation behavior.
   *
   * @return {boolean}
   * @private
   */
  isEmergencyPriorityControlPlaneRecoveryActive() {
    if (stryMutAct_9fa48("136919")) {
      {}
    } else {
      stryCov_9fa48("136919");
      return stryMutAct_9fa48("136922") ? this.getPriorityRecoveryAdmissionPlan().emergencyRecoveryActive !== true : stryMutAct_9fa48("136921") ? false : stryMutAct_9fa48("136920") ? true : (stryCov_9fa48("136920", "136921", "136922"), this.getPriorityRecoveryAdmissionPlan().emergencyRecoveryActive === (stryMutAct_9fa48("136923") ? false : (stryCov_9fa48("136923"), true)));
    }
  }

  /**
   * Keep one shared add slot free for priority recovery while publication
   * spread remains unsatisfied.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getReservedPriorityRecoveryAddSlots(options = {}) {
    if (stryMutAct_9fa48("136924")) {
      {}
    } else {
      stryCov_9fa48("136924");
      return this.getPriorityRecoveryAdmissionPlan().getReservedNonPrioritySlots(options.partitionId, stryMutAct_9fa48("136925") ? "" : (stryCov_9fa48("136925"), 'add'));
    }
  }

  /**
   * Resolve the effective add budget for non-priority scheduling after
   * reserving capacity for priority recovery.
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getConcurrentAddBudgetLimit(options = {}) {
    if (stryMutAct_9fa48("136926")) {
      {}
    } else {
      stryCov_9fa48("136926");
      return stryMutAct_9fa48("136927") ? Math.min(NUM.ZERO, this.config.maxConcurrentAdds - this.getReservedPriorityRecoveryAddSlots(options)) : (stryCov_9fa48("136927"), Math.max(NUM.ZERO, stryMutAct_9fa48("136928") ? this.config.maxConcurrentAdds + this.getReservedPriorityRecoveryAddSlots(options) : (stryCov_9fa48("136928"), this.config.maxConcurrentAdds - this.getReservedPriorityRecoveryAddSlots(options))));
    }
  }

  /**
   * Resolve the effective priority-lane add budget.
   * During active recovery, emergency transport partitions may use one extra
   * slot above the ordinary priority limit, while ordinary priority tables
   * preserve that slot instead of consuming it first.
   *
   * @param {Object} [options={}]
   * @return {number}
   * @private
   */
  getPriorityConcurrentAddBudgetLimit(options = {}) {
    if (stryMutAct_9fa48("136929")) {
      {}
    } else {
      stryCov_9fa48("136929");
      return this.getPriorityRecoveryAdmissionPlan().getPriorityAddBudgetLimit(options.partitionId);
    }
  }

  /**
   * Enforce configured maxConcurrentAdds/maxConcurrentRemoves before persisting
   * a newly scheduled operation.
   * @param {string|null} normalizedMoveType
   * @param {Object} [options={}]
   * @return {Promise<void>}
   * @private
   */
  async ensureConcurrentOperationBudgetAllowed(normalizedMoveType, options = {}) {
    if (stryMutAct_9fa48("136930")) {
      {}
    } else {
      stryCov_9fa48("136930");
      const bypassEmptyQueryDelay = this.shouldBypassConcurrentBudgetEmptyBackoff(normalizedMoveType, options);
      const preferAuthoritativeCount = this.shouldPreferAuthoritativeConcurrentBudgetCheck(normalizedMoveType, options);
      if (stryMutAct_9fa48("136933") ? normalizedMoveType === OperationType.ADD && normalizedMoveType === OperationType.REPLACE : stryMutAct_9fa48("136932") ? false : stryMutAct_9fa48("136931") ? true : (stryCov_9fa48("136931", "136932", "136933"), (stryMutAct_9fa48("136935") ? normalizedMoveType !== OperationType.ADD : stryMutAct_9fa48("136934") ? false : (stryCov_9fa48("136934", "136935"), normalizedMoveType === OperationType.ADD)) || (stryMutAct_9fa48("136937") ? normalizedMoveType !== OperationType.REPLACE : stryMutAct_9fa48("136936") ? false : (stryCov_9fa48("136936", "136937"), normalizedMoveType === OperationType.REPLACE)))) {
        if (stryMutAct_9fa48("136938")) {
          {}
        } else {
          stryCov_9fa48("136938");
          const usePriorityConcurrentAddLane = this.shouldUsePriorityConcurrentAddLane(normalizedMoveType, options);
          const concurrentAddLimit = usePriorityConcurrentAddLane ? this.getPriorityConcurrentAddBudgetLimit(options) : this.getConcurrentAddBudgetLimit(options);
          const canStart = usePriorityConcurrentAddLane ? await this.canStartPriorityAddOperation(stryMutAct_9fa48("136939") ? {} : (stryCov_9fa48("136939"), {
            bypassEmptyQueryDelay,
            preferAuthoritativeCount,
            partitionId: options.partitionId
          })) : await this.canStartAddOperation(stryMutAct_9fa48("136940") ? {} : (stryCov_9fa48("136940"), {
            bypassEmptyQueryDelay,
            preferAuthoritativeCount,
            partitionId: options.partitionId
          }));
          if (stryMutAct_9fa48("136942") ? false : stryMutAct_9fa48("136941") ? true : (stryCov_9fa48("136941", "136942"), canStart)) {
            if (stryMutAct_9fa48("136943")) {
              {}
            } else {
              stryCov_9fa48("136943");
              return;
            }
          }
          throw this.createConcurrentOperationBudgetError(normalizedMoveType, concurrentAddLimit);
        }
      }
      if (stryMutAct_9fa48("136946") ? normalizedMoveType !== OperationType.REMOVE : stryMutAct_9fa48("136945") ? false : stryMutAct_9fa48("136944") ? true : (stryCov_9fa48("136944", "136945", "136946"), normalizedMoveType === OperationType.REMOVE)) {
        if (stryMutAct_9fa48("136947")) {
          {}
        } else {
          stryCov_9fa48("136947");
          const canStart = await this.canStartRemoveOperation(stryMutAct_9fa48("136948") ? {} : (stryCov_9fa48("136948"), {
            bypassEmptyQueryDelay,
            preferAuthoritativeCount
          }));
          if (stryMutAct_9fa48("136950") ? false : stryMutAct_9fa48("136949") ? true : (stryCov_9fa48("136949", "136950"), canStart)) {
            if (stryMutAct_9fa48("136951")) {
              {}
            } else {
              stryCov_9fa48("136951");
              return;
            }
          }
          throw this.createConcurrentOperationBudgetError(normalizedMoveType, this.config.maxConcurrentRemoves);
        }
      }
    }
  }

  /**
   * Build a typed concurrent-budget error for rebalancer callers.
   * @param {string|null} normalizedMoveType
   * @param {number} limit
   * @return {Error}
   * @private
   */
  createConcurrentOperationBudgetError(normalizedMoveType, limit, options = {}) {
    if (stryMutAct_9fa48("136952")) {
      {}
    } else {
      stryCov_9fa48("136952");
      const error = new Error(stryMutAct_9fa48("136955") ? options.message && `Concurrent ${String(normalizedMoveType || 'operation').toLowerCase()} ` + `budget exceeded at limit ${limit}` : stryMutAct_9fa48("136954") ? false : stryMutAct_9fa48("136953") ? true : (stryCov_9fa48("136953", "136954", "136955"), options.message || (stryMutAct_9fa48("136956") ? `` : (stryCov_9fa48("136956"), `Concurrent ${stryMutAct_9fa48("136957") ? String(normalizedMoveType || 'operation').toUpperCase() : (stryCov_9fa48("136957"), String(stryMutAct_9fa48("136960") ? normalizedMoveType && 'operation' : stryMutAct_9fa48("136959") ? false : stryMutAct_9fa48("136958") ? true : (stryCov_9fa48("136958", "136959", "136960"), normalizedMoveType || (stryMutAct_9fa48("136961") ? "" : (stryCov_9fa48("136961"), 'operation')))).toLowerCase())} `)) + (stryMutAct_9fa48("136962") ? `` : (stryCov_9fa48("136962"), `budget exceeded at limit ${limit}`))));
      error.rebalanceSkipReason = REBALANCER_SKIP_REASON.BUDGET_EXCEEDED;
      error.operationType = stryMutAct_9fa48("136965") ? normalizedMoveType && null : stryMutAct_9fa48("136964") ? false : stryMutAct_9fa48("136963") ? true : (stryCov_9fa48("136963", "136964", "136965"), normalizedMoveType || null);
      error.limit = limit;
      if (stryMutAct_9fa48("136967") ? false : stryMutAct_9fa48("136966") ? true : (stryCov_9fa48("136966", "136967"), options.conflictingOperationId)) {
        if (stryMutAct_9fa48("136968")) {
          {}
        } else {
          stryCov_9fa48("136968");
          error.conflictingOperationId = options.conflictingOperationId;
        }
      }
      return error;
    }
  }

  /**
   * Build a typed conflict error for overlapping operation lifecycles.
   * @param {string|null} normalizedMoveType
   * @param {string} replicaId
   * @param {Object} conflictingOperation
   * @return {Error}
   * @private
   */
  createConflictingOperationInFlightError(normalizedMoveType, replicaId, conflictingOperation) {
    if (stryMutAct_9fa48("136969")) {
      {}
    } else {
      stryCov_9fa48("136969");
      const operationTypeText = stryMutAct_9fa48("136970") ? String(normalizedMoveType || 'operation').toUpperCase() : (stryCov_9fa48("136970"), String(stryMutAct_9fa48("136973") ? normalizedMoveType && 'operation' : stryMutAct_9fa48("136972") ? false : stryMutAct_9fa48("136971") ? true : (stryCov_9fa48("136971", "136972", "136973"), normalizedMoveType || (stryMutAct_9fa48("136974") ? "" : (stryCov_9fa48("136974"), 'operation')))).toLowerCase());
      const error = new Error((stryMutAct_9fa48("136975") ? `` : (stryCov_9fa48("136975"), `${REBALANCE_COORDINATOR_ERROR_MSG.CONFLICTING_OPERATION_IN_FLIGHT} `)) + (stryMutAct_9fa48("136976") ? `` : (stryCov_9fa48("136976"), `${replicaId}: ${operationTypeText} conflicts with `)) + (stryMutAct_9fa48("136977") ? `` : (stryCov_9fa48("136977"), `${String(stryMutAct_9fa48("136980") ? conflictingOperation?.type && 'unknown' : stryMutAct_9fa48("136979") ? false : stryMutAct_9fa48("136978") ? true : (stryCov_9fa48("136978", "136979", "136980"), (stryMutAct_9fa48("136981") ? conflictingOperation.type : (stryCov_9fa48("136981"), conflictingOperation?.type)) || (stryMutAct_9fa48("136982") ? "" : (stryCov_9fa48("136982"), 'unknown'))))} `)) + (stryMutAct_9fa48("136983") ? `` : (stryCov_9fa48("136983"), `${String(stryMutAct_9fa48("136986") ? conflictingOperation?.operationId && 'unknown' : stryMutAct_9fa48("136985") ? false : stryMutAct_9fa48("136984") ? true : (stryCov_9fa48("136984", "136985", "136986"), (stryMutAct_9fa48("136987") ? conflictingOperation.operationId : (stryCov_9fa48("136987"), conflictingOperation?.operationId)) || (stryMutAct_9fa48("136988") ? "" : (stryCov_9fa48("136988"), 'unknown'))))}`)));
      error.rebalanceSkipReason = REBALANCER_SKIP_REASON.CONFLICTING_OPERATION_IN_FLIGHT;
      error.operationType = stryMutAct_9fa48("136991") ? normalizedMoveType && null : stryMutAct_9fa48("136990") ? false : stryMutAct_9fa48("136989") ? true : (stryCov_9fa48("136989", "136990", "136991"), normalizedMoveType || null);
      error.replicaId = replicaId;
      error.conflictingOperationId = stryMutAct_9fa48("136994") ? conflictingOperation?.operationId && null : stryMutAct_9fa48("136993") ? false : stryMutAct_9fa48("136992") ? true : (stryCov_9fa48("136992", "136993", "136994"), (stryMutAct_9fa48("136995") ? conflictingOperation.operationId : (stryCov_9fa48("136995"), conflictingOperation?.operationId)) || null);
      return error;
    }
  }

  /**
   * Ensure storage admission approves one storage-increasing workflow.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureProvisioningAdmissionAllowed(context) {
    if (stryMutAct_9fa48("136996")) {
      {}
    } else {
      stryCov_9fa48("136996");
      return this.provisioningAdmissionPolicy.ensureProvisioningAdmissionAllowed(context);
    }
  }

  /**
   * Evaluate storage admission for one storage-increasing move.
   * @param {Object} context
   * @return {Promise<Object>} Normalized evaluation output.
   * @private
   */
  async evaluateProvisioningAdmission(context) {
    if (stryMutAct_9fa48("136997")) {
      {}
    } else {
      stryCov_9fa48("136997");
      return this.provisioningAdmissionPolicy.evaluateProvisioningAdmission(context);
    }
  }

  /**
   * Estimate replica bytes for admission decisions.
   * @param {string} entityType
   * @return {number}
   * @private
   */
  estimateProvisioningAdmissionBytes(entityType) {
    if (stryMutAct_9fa48("136998")) {
      {}
    } else {
      stryCov_9fa48("136998");
      return this.provisioningAdmissionPolicy.estimateProvisioningAdmissionBytes(entityType);
    }
  }

  /**
   * Verify admission and accounting owners are available for storage-increasing moves.
   * @param {string} moveType
   * @return {void}
   * @private
   */
  assertProvisioningAdmissionDependencies(moveType) {
    if (stryMutAct_9fa48("136999")) {
      {}
    } else {
      stryCov_9fa48("136999");
      return this.provisioningAdmissionPolicy.assertProvisioningAdmissionDependencies(moveType);
    }
  }

  /**
   * Build a typed admission-denied error for coordinator callers.
   * @param {Object} move
   * @param {Object} admissionResult
   * @return {Error}
   * @private
   */
  createProvisioningAdmissionError(move, admissionResult) {
    if (stryMutAct_9fa48("137000")) {
      {}
    } else {
      stryCov_9fa48("137000");
      return this.provisioningAdmissionPolicy.createProvisioningAdmissionError(move, admissionResult);
    }
  }

  /**
   * Persist a new operation via SQL engine.
   *
   * OWNERSHIP BOUNDARY: RebalanceCoordinator is the sole writer for
   * steady-state replica_operations rows (ADD/REMOVE/REPLACE).
   * BootstrapAPI owns a separate domain for MOVE_REPLICA handoff
   * and MOVE_ASSIGNMENT reservation rows created during node join.
   * The two domains are distinguished by operation type and creation
   * context. See BootstrapAPI.insertMoveReplicaHandoffOperation for
   * the bootstrap-side boundary contract.
   *
   * @readModel COORDINATOR_OPERATION_PERSIST —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} operation - Operation to persist.
   * @return {Promise<boolean>} True when row inserted, false when ignored.
   * @private
   */
  async persistNewOperation(operation) {
    if (stryMutAct_9fa48("137001")) {
      {}
    } else {
      stryCov_9fa48("137001");
      return this.repository.persistNewOperation(operation);
    }
  }

  /**
   * Update an existing operation via SQL engine.
   * @param {Object} operation - Operation to update.
   * @return {Promise<void>}
   * @private
   */
  async persistOperationUpdate(operation, options = {}) {
    if (stryMutAct_9fa48("137002")) {
      {}
    } else {
      stryCov_9fa48("137002");
      return this.runReplicaOperationTransitionExclusive(stryMutAct_9fa48("137003") ? () => undefined : (stryCov_9fa48("137003"), () => this.repository.persistOperationUpdate(operation, options)), stryMutAct_9fa48("137004") ? {} : (stryCov_9fa48("137004"), {
        operation
      }));
    }
  }

  /**
   * Wait for replica_operations cache visibility after SQL persistence.
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async waitForReplicaOperationCacheVisibility(operation) {
    if (stryMutAct_9fa48("137005")) {
      {}
    } else {
      stryCov_9fa48("137005");
      return this.repository.waitForReplicaOperationCacheVisibility(operation);
    }
  }

  /**
   * Execute operation mutation SQL with retry for transient leader gaps.
   * @param {string} sql - SQL statement.
   * @param {Array<*>} params - Statement parameters.
   * @return {Promise<Object>} SQL query result.
   * @private
   */
  async executeOperationMutationWithRetry(sql, params, options = {}) {
    if (stryMutAct_9fa48("137006")) {
      {}
    } else {
      stryCov_9fa48("137006");
      return this.repository.executeOperationMutationWithRetry(sql, params, options);
    }
  }

  /**
   * Check whether operation persist error is transient and retryable.
   * @param {string} errorMessage - SQL error message.
   * @return {boolean} True when retry should be attempted.
   * @private
   */
  isRetryableOperationPersistError(errorMessage) {
    if (stryMutAct_9fa48("137007")) {
      {}
    } else {
      stryCov_9fa48("137007");
      return this.repository.isRetryableOperationPersistError(errorMessage);
    }
  }

  /**
   * Delay helper for operation mutation retry loop.
   * @param {number} delayMs - Delay duration in milliseconds.
   * @return {Promise<void>}
   * @private
   */
  async waitForOperationPersistRetry(delayMs) {
    if (stryMutAct_9fa48("137008")) {
      {}
    } else {
      stryCov_9fa48("137008");
      return this.repository.waitForOperationPersistRetry(delayMs);
    }
  }

  /**
   * Build query options for one owner-managed mutation.
   * Coordinator writes must not inherit the default SQL session.
   * @param {Object} [options={}] - Mutation routing options.
   * @return {Object}
   * @private
   */
  buildOperationMutationQueryOptions(options = {}) {
    if (stryMutAct_9fa48("137009")) {
      {}
    } else {
      stryCov_9fa48("137009");
      return this.repository.buildOperationMutationQueryOptions(options);
    }
  }

  /**
   * Resolve the SQL session for one owner-managed mutation.
   * @param {Object} [options={}] - Mutation routing options.
   * @return {string}
   * @private
   */
  resolveOperationMutationSessionId(options = {}) {
    if (stryMutAct_9fa48("137010")) {
      {}
    } else {
      stryCov_9fa48("137010");
      return this.repository.resolveOperationMutationSessionId(options);
    }
  }

  // --- Reservation lifecycle (Req 4.1, 4.2, 4.3, 4.4, 4.5) ---

  /**
   * Check whether an operation type increases storage on the target node.
   * Only ADD and REPLACE operations require reservations.
   * @param {string} operationType - Operation type.
   * @return {boolean}
   * @private
   */
  isStorageIncreasingOperation(operationType) {
    if (stryMutAct_9fa48("137011")) {
      {}
    } else {
      stryCov_9fa48("137011");
      return stryMutAct_9fa48("137014") ? operationType === OperationType.ADD && operationType === OperationType.REPLACE : stryMutAct_9fa48("137013") ? false : stryMutAct_9fa48("137012") ? true : (stryCov_9fa48("137012", "137013", "137014"), (stryMutAct_9fa48("137016") ? operationType !== OperationType.ADD : stryMutAct_9fa48("137015") ? false : (stryCov_9fa48("137015", "137016"), operationType === OperationType.ADD)) || (stryMutAct_9fa48("137018") ? operationType !== OperationType.REPLACE : stryMutAct_9fa48("137017") ? false : (stryCov_9fa48("137017", "137018"), operationType === OperationType.REPLACE)));
    }
  }

  /**
   * Map operation type to reservation reason code.
   * @param {string} operationType - Operation type.
   * @return {string} Reservation reason code.
   * @private
   */
  getReservationReasonCode(operationType) {
    if (stryMutAct_9fa48("137019")) {
      {}
    } else {
      stryCov_9fa48("137019");
      if (stryMutAct_9fa48("137022") ? operationType !== OperationType.REPLACE : stryMutAct_9fa48("137021") ? false : stryMutAct_9fa48("137020") ? true : (stryCov_9fa48("137020", "137021", "137022"), operationType === OperationType.REPLACE)) {
        if (stryMutAct_9fa48("137023")) {
          {}
        } else {
          stryCov_9fa48("137023");
          return RESERVATION_REASON.REPLACE_REPLICA;
        }
      }
      return RESERVATION_REASON.ADD_REPLICA;
    }
  }

  /**
   * Resolve mutation change counts from SQL-engine responses.
   * @param {Object} result - SQL query result.
   * @return {number|null} Number of changed rows, or null when unavailable.
   * @private
   */
  extractMutationChangeCount(result) {
    if (stryMutAct_9fa48("137024")) {
      {}
    } else {
      stryCov_9fa48("137024");
      return this.repository.extractMutationChangeCount(result);
    }
  }

  /**
   * Transition one active reservation row by its canonical primary key.
   * @param {string} reservationId - Reservation primary key.
   * @param {string} nextStatus - Target reservation status.
   * @param {number} now - Transition timestamp.
   * @return {Promise<Object>} Transition result.
   * @private
   */
  async transitionActiveReservationById(reservationId, nextStatus, now, options = {}) {
    if (stryMutAct_9fa48("137025")) {
      {}
    } else {
      stryCov_9fa48("137025");
      const result = await this.executeOperationMutationWithRetry(SQL.UPDATE_RESERVATION_STATUS_BY_ID, stryMutAct_9fa48("137026") ? [] : (stryCov_9fa48("137026"), [nextStatus, now, now, reservationId, RESERVATION_STATUS.ACTIVE]), stryMutAct_9fa48("137027") ? {} : (stryCov_9fa48("137027"), {
        ownerId: stryMutAct_9fa48("137030") ? options.ownerId && reservationId : stryMutAct_9fa48("137029") ? false : stryMutAct_9fa48("137028") ? true : (stryCov_9fa48("137028", "137029", "137030"), options.ownerId || reservationId),
        sessionId: options.sessionId
      }));
      if (stryMutAct_9fa48("137033") ? false : stryMutAct_9fa48("137032") ? true : stryMutAct_9fa48("137031") ? result.success : (stryCov_9fa48("137031", "137032", "137033"), !result.success)) {
        if (stryMutAct_9fa48("137034")) {
          {}
        } else {
          stryCov_9fa48("137034");
          return stryMutAct_9fa48("137035") ? {} : (stryCov_9fa48("137035"), {
            success: stryMutAct_9fa48("137036") ? true : (stryCov_9fa48("137036"), false),
            changed: stryMutAct_9fa48("137037") ? true : (stryCov_9fa48("137037"), false),
            error: stryMutAct_9fa48("137040") ? result.error && null : stryMutAct_9fa48("137039") ? false : stryMutAct_9fa48("137038") ? true : (stryCov_9fa48("137038", "137039", "137040"), result.error || null)
          });
        }
      }
      const changeCount = this.extractMutationChangeCount(result);
      return stryMutAct_9fa48("137041") ? {} : (stryCov_9fa48("137041"), {
        success: stryMutAct_9fa48("137042") ? false : (stryCov_9fa48("137042"), true),
        changed: stryMutAct_9fa48("137045") ? changeCount === null && changeCount > NUM.ZERO : stryMutAct_9fa48("137044") ? false : stryMutAct_9fa48("137043") ? true : (stryCov_9fa48("137043", "137044", "137045"), (stryMutAct_9fa48("137047") ? changeCount !== null : stryMutAct_9fa48("137046") ? false : (stryCov_9fa48("137046", "137047"), changeCount === null)) || (stryMutAct_9fa48("137050") ? changeCount <= NUM.ZERO : stryMutAct_9fa48("137049") ? changeCount >= NUM.ZERO : stryMutAct_9fa48("137048") ? false : (stryCov_9fa48("137048", "137049", "137050"), changeCount > NUM.ZERO))),
        changeCount
      });
    }
  }

  /**
   * Create a storage reservation atomically with operation creation.
   * Delegates size estimation to the accounting service.
   * Requirements: 4.1
   *
   * @param {Object} operation - The persisted operation record.
   * @return {Promise<void>}
   * @private
   */
  async createReservationForOperation(operation, options = {}) {
    if (stryMutAct_9fa48("137051")) {
      {}
    } else {
      stryCov_9fa48("137051");
      if (stryMutAct_9fa48("137054") ? false : stryMutAct_9fa48("137053") ? true : stryMutAct_9fa48("137052") ? this.isStorageIncreasingOperation(operation.type) : (stryCov_9fa48("137052", "137053", "137054"), !this.isStorageIncreasingOperation(operation.type))) {
        if (stryMutAct_9fa48("137055")) {
          {}
        } else {
          stryCov_9fa48("137055");
          return;
        }
      }
      assertCritical(stryMutAct_9fa48("137058") ? this.storageAccountingService || typeof this.storageAccountingService.estimateReplicaBytes === 'function' : stryMutAct_9fa48("137057") ? false : stryMutAct_9fa48("137056") ? true : (stryCov_9fa48("137056", "137057", "137058"), this.storageAccountingService && (stryMutAct_9fa48("137060") ? typeof this.storageAccountingService.estimateReplicaBytes !== 'function' : stryMutAct_9fa48("137059") ? true : (stryCov_9fa48("137059", "137060"), typeof this.storageAccountingService.estimateReplicaBytes === (stryMutAct_9fa48("137061") ? "" : (stryCov_9fa48("137061"), 'function'))))), REBALANCE_COORDINATOR_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED);
      const estimatedBytes = this.storageAccountingService.estimateReplicaBytes(stryMutAct_9fa48("137062") ? {} : (stryCov_9fa48("137062"), {
        entityType: stryMutAct_9fa48("137065") ? operation.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("137064") ? false : stryMutAct_9fa48("137063") ? true : (stryCov_9fa48("137063", "137064", "137065"), operation.entityType || SERVICE_TYPE.PARTITION),
        sizeBytes: NUM.ZERO
      }));
      const now = Date.now();
      const reservationId = stryMutAct_9fa48("137066") ? `` : (stryCov_9fa48("137066"), `res-${operation.operationId}`);
      const expiresAt = stryMutAct_9fa48("137067") ? now - this.config.reservationTtlMs : (stryCov_9fa48("137067"), now + this.config.reservationTtlMs);
      const result = await this.executeOperationMutationWithRetry(SQL.INSERT_RESERVATION, stryMutAct_9fa48("137068") ? [] : (stryCov_9fa48("137068"), [reservationId, operation.operationId, stryMutAct_9fa48("137071") ? operation.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("137070") ? false : stryMutAct_9fa48("137069") ? true : (stryCov_9fa48("137069", "137070", "137071"), operation.entityType || SERVICE_TYPE.PARTITION), stryMutAct_9fa48("137074") ? operation.entityId && operation.partitionId : stryMutAct_9fa48("137073") ? false : stryMutAct_9fa48("137072") ? true : (stryCov_9fa48("137072", "137073", "137074"), operation.entityId || operation.partitionId), operation.partitionId, operation.targetNodeId, estimatedBytes, DEFAULT_AMPLIFICATION_FACTOR, RESERVATION_STATUS.ACTIVE, this.getReservationReasonCode(operation.type), now, now, expiresAt]), stryMutAct_9fa48("137075") ? {} : (stryCov_9fa48("137075"), {
        ownerId: operation.operationId,
        sessionId: options.sessionId
      }));
      if (stryMutAct_9fa48("137078") ? false : stryMutAct_9fa48("137077") ? true : stryMutAct_9fa48("137076") ? result.success : (stryCov_9fa48("137076", "137077", "137078"), !result.success)) {
        if (stryMutAct_9fa48("137079")) {
          {}
        } else {
          stryCov_9fa48("137079");
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_CREATE_FAILED, stryMutAct_9fa48("137080") ? {} : (stryCov_9fa48("137080"), {
            operationId: operation.operationId,
            reservationId,
            error: result.error
          }));
          return;
        }
      }
      stryMutAct_9fa48("137081") ? this.stats.reservationsCreated-- : (stryCov_9fa48("137081"), this.stats.reservationsCreated++);
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_CREATED, stryMutAct_9fa48("137082") ? {} : (stryCov_9fa48("137082"), {
        reservationId,
        operationId: operation.operationId,
        targetNodeId: operation.targetNodeId,
        estimatedBytes,
        expiresAt
      }));
      this.emit(REBALANCE_COORDINATOR_EVENT.RESERVATION_CREATED, stryMutAct_9fa48("137083") ? {} : (stryCov_9fa48("137083"), {
        reservationId,
        operationId: operation.operationId,
        targetNodeId: operation.targetNodeId,
        estimatedBytes
      }));
    }
  }

  /**
   * Release the storage reservation tied to an operation.
   * Called on terminal outcomes (completed, failed, cancelled).
   * Requirements: 4.3
   *
   * @param {Object} operation - The terminal operation record.
   * @return {Promise<void>}
   * @private
   */
  async releaseReservationForOperation(operation) {
    if (stryMutAct_9fa48("137084")) {
      {}
    } else {
      stryCov_9fa48("137084");
      if (stryMutAct_9fa48("137087") ? false : stryMutAct_9fa48("137086") ? true : stryMutAct_9fa48("137085") ? this.isStorageIncreasingOperation(operation.type) : (stryCov_9fa48("137085", "137086", "137087"), !this.isStorageIncreasingOperation(operation.type))) {
        if (stryMutAct_9fa48("137088")) {
          {}
        } else {
          stryCov_9fa48("137088");
          return;
        }
      }
      const activeResult = await readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS, SQL.SELECT_ACTIVE_RESERVATIONS_BY_OPERATION, stryMutAct_9fa48("137089") ? [] : (stryCov_9fa48("137089"), [operation.operationId, RESERVATION_STATUS.ACTIVE]), STORAGE_RESERVATION_READ_QUERY_OPTIONS);
      if (stryMutAct_9fa48("137092") ? false : stryMutAct_9fa48("137091") ? true : stryMutAct_9fa48("137090") ? activeResult.success : (stryCov_9fa48("137090", "137091", "137092"), !activeResult.success)) {
        if (stryMutAct_9fa48("137093")) {
          {}
        } else {
          stryCov_9fa48("137093");
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED, stryMutAct_9fa48("137094") ? {} : (stryCov_9fa48("137094"), {
            operationId: operation.operationId,
            error: activeResult.error
          }));
          return;
        }
      }
      const now = Date.now();
      let releasedCount = NUM.ZERO;
      const rows = Array.isArray(activeResult.rows) ? activeResult.rows : stryMutAct_9fa48("137095") ? ["Stryker was here"] : (stryCov_9fa48("137095"), []);
      for (const row of rows) {
        if (stryMutAct_9fa48("137096")) {
          {}
        } else {
          stryCov_9fa48("137096");
          const transition = await this.transitionActiveReservationById(row.reservation_id, RESERVATION_STATUS.RELEASED, now);
          if (stryMutAct_9fa48("137099") ? false : stryMutAct_9fa48("137098") ? true : stryMutAct_9fa48("137097") ? transition.success : (stryCov_9fa48("137097", "137098", "137099"), !transition.success)) {
            if (stryMutAct_9fa48("137100")) {
              {}
            } else {
              stryCov_9fa48("137100");
              this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED, stryMutAct_9fa48("137101") ? {} : (stryCov_9fa48("137101"), {
                operationId: operation.operationId,
                reservationId: row.reservation_id,
                error: transition.error
              }));
              continue;
            }
          }
          if (stryMutAct_9fa48("137103") ? false : stryMutAct_9fa48("137102") ? true : (stryCov_9fa48("137102", "137103"), transition.changed)) {
            if (stryMutAct_9fa48("137104")) {
              {}
            } else {
              stryCov_9fa48("137104");
              stryMutAct_9fa48("137105") ? releasedCount-- : (stryCov_9fa48("137105"), releasedCount++);
            }
          }
        }
      }
      if (stryMutAct_9fa48("137109") ? releasedCount > NUM.ZERO : stryMutAct_9fa48("137108") ? releasedCount < NUM.ZERO : stryMutAct_9fa48("137107") ? false : stryMutAct_9fa48("137106") ? true : (stryCov_9fa48("137106", "137107", "137108", "137109"), releasedCount <= NUM.ZERO)) {
        if (stryMutAct_9fa48("137110")) {
          {}
        } else {
          stryCov_9fa48("137110");
          return;
        }
      }
      stryMutAct_9fa48("137111") ? this.stats.reservationsReleased -= releasedCount : (stryCov_9fa48("137111"), this.stats.reservationsReleased += releasedCount);
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASED, stryMutAct_9fa48("137112") ? {} : (stryCov_9fa48("137112"), {
        operationId: operation.operationId,
        releasedCount
      }));
      this.emit(REBALANCE_COORDINATOR_EVENT.RESERVATION_RELEASED, stryMutAct_9fa48("137113") ? {} : (stryCov_9fa48("137113"), {
        operationId: operation.operationId
      }));
    }
  }

  /**
   * Reconcile stale and orphan reservations.
   * - Expire active reservations past their TTL.
   * - Release active reservations whose operations are terminal.
   * Called during startup recovery and periodically.
   * Requirements: 4.4, 12.3
   *
   * @return {Promise<Object>} Reconciliation result counts.
   */
  async reconcileReservations() {
    if (stryMutAct_9fa48("137114")) {
      {}
    } else {
      stryCov_9fa48("137114");
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_START);
      const now = Date.now();
      let expired = NUM.ZERO;
      let orphansReleased = NUM.ZERO;

      // 1. Expire reservations past TTL, keyed by reservation_id.
      const staleResult = await readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS, SQL.SELECT_EXPIRED_ACTIVE_RESERVATIONS, stryMutAct_9fa48("137115") ? [] : (stryCov_9fa48("137115"), [RESERVATION_STATUS.ACTIVE, now]), STORAGE_RESERVATION_READ_QUERY_OPTIONS);
      if (stryMutAct_9fa48("137118") ? staleResult.success || Array.isArray(staleResult.rows) : stryMutAct_9fa48("137117") ? false : stryMutAct_9fa48("137116") ? true : (stryCov_9fa48("137116", "137117", "137118"), staleResult.success && Array.isArray(staleResult.rows))) {
        if (stryMutAct_9fa48("137119")) {
          {}
        } else {
          stryCov_9fa48("137119");
          for (const row of staleResult.rows) {
            if (stryMutAct_9fa48("137120")) {
              {}
            } else {
              stryCov_9fa48("137120");
              const transition = await this.transitionActiveReservationById(row.reservation_id, RESERVATION_STATUS.EXPIRED, now);
              if (stryMutAct_9fa48("137123") ? false : stryMutAct_9fa48("137122") ? true : stryMutAct_9fa48("137121") ? transition.success : (stryCov_9fa48("137121", "137122", "137123"), !transition.success)) {
                if (stryMutAct_9fa48("137124")) {
                  {}
                } else {
                  stryCov_9fa48("137124");
                  this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED, stryMutAct_9fa48("137125") ? {} : (stryCov_9fa48("137125"), {
                    operationId: row.operation_id,
                    reservationId: row.reservation_id,
                    error: transition.error
                  }));
                  continue;
                }
              }
              if (stryMutAct_9fa48("137127") ? false : stryMutAct_9fa48("137126") ? true : (stryCov_9fa48("137126", "137127"), transition.changed)) {
                if (stryMutAct_9fa48("137128")) {
                  {}
                } else {
                  stryCov_9fa48("137128");
                  stryMutAct_9fa48("137129") ? expired-- : (stryCov_9fa48("137129"), expired++);
                }
              }
            }
          }
        }
      } else if (stryMutAct_9fa48("137132") ? false : stryMutAct_9fa48("137131") ? true : stryMutAct_9fa48("137130") ? staleResult.success : (stryCov_9fa48("137130", "137131", "137132"), !staleResult.success)) {
        if (stryMutAct_9fa48("137133")) {
          {}
        } else {
          stryCov_9fa48("137133");
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED, stryMutAct_9fa48("137134") ? {} : (stryCov_9fa48("137134"), {
            operationId: null,
            reservationId: null,
            error: staleResult.error
          }));
        }
      }
      if (stryMutAct_9fa48("137138") ? expired <= NUM.ZERO : stryMutAct_9fa48("137137") ? expired >= NUM.ZERO : stryMutAct_9fa48("137136") ? false : stryMutAct_9fa48("137135") ? true : (stryCov_9fa48("137135", "137136", "137137", "137138"), expired > NUM.ZERO)) {
        if (stryMutAct_9fa48("137139")) {
          {}
        } else {
          stryCov_9fa48("137139");
          this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_EXPIRED, stryMutAct_9fa48("137140") ? {} : (stryCov_9fa48("137140"), {
            count: expired
          }));
        }
      }

      // 2. Release orphan reservations (operation is terminal)
      const activeResult = await readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS, SQL.SELECT_ACTIVE_RESERVATIONS, stryMutAct_9fa48("137141") ? [] : (stryCov_9fa48("137141"), [RESERVATION_STATUS.ACTIVE]), STORAGE_RESERVATION_READ_QUERY_OPTIONS);
      if (stryMutAct_9fa48("137144") ? activeResult.success || activeResult.rows : stryMutAct_9fa48("137143") ? false : stryMutAct_9fa48("137142") ? true : (stryCov_9fa48("137142", "137143", "137144"), activeResult.success && activeResult.rows)) {
        if (stryMutAct_9fa48("137145")) {
          {}
        } else {
          stryCov_9fa48("137145");
          for (const row of activeResult.rows) {
            if (stryMutAct_9fa48("137146")) {
              {}
            } else {
              stryCov_9fa48("137146");
              const op = await this.queryOperationById(row.operation_id);
              const isTerminal = stryMutAct_9fa48("137149") ? !op && this.isOperationTerminal(op) : stryMutAct_9fa48("137148") ? false : stryMutAct_9fa48("137147") ? true : (stryCov_9fa48("137147", "137148", "137149"), (stryMutAct_9fa48("137150") ? op : (stryCov_9fa48("137150"), !op)) || this.isOperationTerminal(op));
              if (stryMutAct_9fa48("137152") ? false : stryMutAct_9fa48("137151") ? true : (stryCov_9fa48("137151", "137152"), isTerminal)) {
                if (stryMutAct_9fa48("137153")) {
                  {}
                } else {
                  stryCov_9fa48("137153");
                  const transition = await this.transitionActiveReservationById(row.reservation_id, RESERVATION_STATUS.RELEASED, now);
                  if (stryMutAct_9fa48("137156") ? false : stryMutAct_9fa48("137155") ? true : stryMutAct_9fa48("137154") ? transition.success : (stryCov_9fa48("137154", "137155", "137156"), !transition.success)) {
                    if (stryMutAct_9fa48("137157")) {
                      {}
                    } else {
                      stryCov_9fa48("137157");
                      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED, stryMutAct_9fa48("137158") ? {} : (stryCov_9fa48("137158"), {
                        operationId: row.operation_id,
                        reservationId: row.reservation_id,
                        error: transition.error
                      }));
                      continue;
                    }
                  }
                  if (stryMutAct_9fa48("137160") ? false : stryMutAct_9fa48("137159") ? true : (stryCov_9fa48("137159", "137160"), transition.changed)) {
                    if (stryMutAct_9fa48("137161")) {
                      {}
                    } else {
                      stryCov_9fa48("137161");
                      stryMutAct_9fa48("137162") ? orphansReleased-- : (stryCov_9fa48("137162"), orphansReleased++);
                      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_ORPHAN, stryMutAct_9fa48("137163") ? {} : (stryCov_9fa48("137163"), {
                        reservationId: row.reservation_id,
                        operationId: row.operation_id
                      }));
                    }
                  }
                }
              }
            }
          }
        }
      }
      stryMutAct_9fa48("137164") ? this.stats.reservationsReconciled -= expired + orphansReleased : (stryCov_9fa48("137164"), this.stats.reservationsReconciled += stryMutAct_9fa48("137165") ? expired - orphansReleased : (stryCov_9fa48("137165"), expired + orphansReleased));
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RECONCILE_COMPLETED, stryMutAct_9fa48("137166") ? {} : (stryCov_9fa48("137166"), {
        expired,
        orphansReleased
      }));
      this.emit(REBALANCE_COORDINATOR_EVENT.RESERVATION_RECONCILED, stryMutAct_9fa48("137167") ? {} : (stryCov_9fa48("137167"), {
        expired,
        orphansReleased
      }));
      return stryMutAct_9fa48("137168") ? {} : (stryCov_9fa48("137168"), {
        expired,
        orphansReleased
      });
    }
  }

  /**
   * Execute an operation (ADD or REMOVE).
   * Uses MessageRouter delivery to the target node.
   * Requirements: 2.1
   *
   * @param {Object} operation - Operation to execute.
   * @return {Promise<Object>} Execution result.
   */
  async executeOperation(operation) {
    if (stryMutAct_9fa48("137169")) {
      {}
    } else {
      stryCov_9fa48("137169");
      return this.workflowOwner.executeOperation(operation);
    }
  }

  /**
   * Resolve an operation id from one supported caller payload.
   * @param {string|Object} operationInput - Operation id, row, or payload.
   * @return {string|null}
   * @private
   */
  getOperationIdFromInput(operationInput) {
    if (stryMutAct_9fa48("137170")) {
      {}
    } else {
      stryCov_9fa48("137170");
      return this.workflowOwner.getOperationIdFromInput(operationInput);
    }
  }

  /**
   * Normalize one dispatch input to a canonical operation object.
   * @param {string|Object} operationInput - Operation id, row, or payload.
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveDispatchOperation(operationInput) {
    if (stryMutAct_9fa48("137171")) {
      {}
    } else {
      stryCov_9fa48("137171");
      return this.workflowOwner.resolveDispatchOperation(operationInput);
    }
  }

  /**
   * Execute one dispatch attempt after ownership serialization.
   * Delegates to workflow owner (D7.1).
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   * @private
   */
  async dispatchOperationInternal(operationInput) {
    if (stryMutAct_9fa48("137172")) {
      {}
    } else {
      stryCov_9fa48("137172");
      return this.workflowOwner.dispatchOperationInternal(operationInput);
    }
  }

  /**
   * Execute operation body once per operation ID.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {Promise<Object>}
   * @private
   */
  async executeOperationInternal(operation) {
    if (stryMutAct_9fa48("137173")) {
      {}
    } else {
      stryCov_9fa48("137173");
      return this.workflowOwner.executeOperationInternal(operation);
    }
  }

  /**
   * Execute a step transition atomically.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @param {string} step
   * @param {string} reason
   * @param {Function} persistFn
   * @return {Promise<void>}
   * @private
   */
  async executeAtomicTransition(operation, step, reason, persistFn) {
    if (stryMutAct_9fa48("137174")) {
      {}
    } else {
      stryCov_9fa48("137174");
      return this.workflowOwner.executeAtomicTransition(operation, step, reason, persistFn);
    }
  }

  /**
   * Serialize replica_operations step transitions.
   * @param {Function} executionFactory
   * @return {Promise<*>}
   * @private
   */
  runReplicaOperationTransitionExclusive(executionFactory, options = {}) {
    if (stryMutAct_9fa48("137175")) {
      {}
    } else {
      stryCov_9fa48("137175");
      return this.repository.runReplicaOperationTransitionExclusive(executionFactory, options);
    }
  }

  /**
   * Update operation workflow step.
   * Requirements: 4.3
   *
   * @param {Object} operation - Operation to update.
   * @param {string} step - New workflow step.
   * @return {Promise<void>}
   */
  async updateStep(operation, step, reason) {
    if (stryMutAct_9fa48("137176")) {
      {}
    } else {
      stryCov_9fa48("137176");
      return this.workflowOwner.updateStep(operation, step, reason);
    }
  }

  /**
   * Complete an operation successfully.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async completeOperation(operation) {
    if (stryMutAct_9fa48("137177")) {
      {}
    } else {
      stryCov_9fa48("137177");
      return this.workflowOwner.completeOperation(operation);
    }
  }

  /**
   * Get safety validation error for REMOVE operations, if any.
   * Critical system partition removes are blocked until a replacement
   * replica is voter-ready and routable.
   * @readModel COORDINATOR_SAFETY_CHECK —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} operation - Operation to validate.
   * @return {Promise<string|null>} Error message or null when safe.
   * @private
   */
  async getRemoveSafetyError(operation) {
    if (stryMutAct_9fa48("137178")) {
      {}
    } else {
      stryCov_9fa48("137178");
      return this.workflowOwner.getRemoveSafetyError(operation);
    }
  }

  /**
   * Evaluate safety error for a move intent.
   * Delegates to workflow owner (D7.1).
   * @param {Object} move
   * @return {Promise<string|null>}
   */
  async getMoveSafetyError(move) {
    if (stryMutAct_9fa48("137179")) {
      {}
    } else {
      stryCov_9fa48("137179");
      return this.workflowOwner.getMoveSafetyError(move);
    }
  }

  /**
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  isCriticalSystemPartition(partitionId) {
    if (stryMutAct_9fa48("137180")) {
      {}
    } else {
      stryCov_9fa48("137180");
      return this.workflowOwner.isCriticalSystemPartition(partitionId);
    }
  }

  /**
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  isPriorityControlPlanePartition(partitionId) {
    if (stryMutAct_9fa48("137181")) {
      {}
    } else {
      stryCov_9fa48("137181");
      return isPriorityControlPlanePartitionTable(stryMutAct_9fa48("137182") ? {} : (stryCov_9fa48("137182"), {
        partitionId
      }));
    }
  }

  /**
   * Resolve the readiness dimension used for operation-scoped snapshots.
   * Critical system partition recovery paths must remain routable while
   * publication is converging; ordinary entities keep strict repair gating.
   *
   * @param {string|null} partitionId
   * @return {string}
   * @private
   */
  resolveOperationReadinessDecisionDimension(partitionId = null) {
    if (stryMutAct_9fa48("137183")) {
      {}
    } else {
      stryCov_9fa48("137183");
      if (stryMutAct_9fa48("137185") ? false : stryMutAct_9fa48("137184") ? true : (stryCov_9fa48("137184", "137185"), this.isCriticalSystemPartition(partitionId))) {
        if (stryMutAct_9fa48("137186")) {
          {}
        } else {
          stryCov_9fa48("137186");
          return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
        }
      }
      return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
    }
  }

  /**
   * @param {Object} replicaRow
   * @return {boolean}
   * @private
   */
  isVoterReadyRoutableReplica(replicaRow) {
    if (stryMutAct_9fa48("137187")) {
      {}
    } else {
      stryCov_9fa48("137187");
      return this.workflowOwner.isVoterReadyRoutableReplica(replicaRow);
    }
  }

  /**
   * @param {Object} replicaRow
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isOperationReplicaRow(replicaRow, operation) {
    if (stryMutAct_9fa48("137188")) {
      {}
    } else {
      stryCov_9fa48("137188");
      return this.workflowOwner.isOperationReplicaRow(replicaRow, operation);
    }
  }

  /**
   * @param {string} partitionId
   * @return {Promise<number>}
   * @private
   */
  async getCriticalMinReplicaCount(partitionId) {
    if (stryMutAct_9fa48("137189")) {
      {}
    } else {
      stryCov_9fa48("137189");
      return this.workflowOwner.getCriticalMinReplicaCount(partitionId);
    }
  }

  /**
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  isNodeReadyForRouting(nodeId) {
    if (stryMutAct_9fa48("137190")) {
      {}
    } else {
      stryCov_9fa48("137190");
      return this.workflowOwner.isNodeReadyForRouting(nodeId);
    }
  }

  /**
   * Fail an operation.
   * Requirements: 6.2
   *
   * @param {Object} operation - Operation to fail.
   * @param {string} errorMessage - Error message.
   * @param {Object} [options] - Failure logging options.
   * @param {string} [options.logLevel] - Log level for failure event.
   * @param {string} [options.logMessage] - Log message override.
   * @param {Object} [options.stepMetadata] - FAILED step metadata.
   * @return {Promise<void>}
   */
  async failOperation(operation, errorMessage, options = {}) {
    if (stryMutAct_9fa48("137191")) {
      {}
    } else {
      stryCov_9fa48("137191");
      return this.workflowOwner.failOperation(operation, errorMessage, options);
    }
  }

  /**
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @private
   */
  ensureOperationWorkflow(operation) {
    if (stryMutAct_9fa48("137192")) {
      {}
    } else {
      stryCov_9fa48("137192");
      return this.workflowOwner.ensureOperationWorkflow(operation);
    }
  }

  /**
   * Delegates to workflow owner (D7.1).
   * @param {string} previousStep
   * @param {string} nextStep
   * @return {string}
   * @private
   */
  resolveTransitionReason(previousStep, nextStep) {
    if (stryMutAct_9fa48("137193")) {
      {}
    } else {
      stryCov_9fa48("137193");
      return this.workflowOwner.resolveTransitionReason(previousStep, nextStep);
    }
  }

  /**
   * @param {string} errorMessage
   * @return {boolean}
   * @private
   */
  isSafetyPolicyFailure(errorMessage) {
    if (stryMutAct_9fa48("137194")) {
      {}
    } else {
      stryCov_9fa48("137194");
      return this.workflowOwner.isSafetyPolicyFailure(errorMessage);
    }
  }

  /**
   * @param {*} errorLike
   * @param {string} fallbackMessage
   * @return {string}
   * @private
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    if (stryMutAct_9fa48("137195")) {
      {}
    } else {
      stryCov_9fa48("137195");
      return this.workflowOwner.normalizeErrorMessage(errorLike, fallbackMessage);
    }
  }

  /**
   * Check for timed out operations.
   * Queries operations via SQL engine (no in-memory cache).
   * Requirements: 6.2
   * @private
   */
  async checkTimeouts() {
    if (stryMutAct_9fa48("137196")) {
      {}
    } else {
      stryCov_9fa48("137196");
      if (stryMutAct_9fa48("137199") ? false : stryMutAct_9fa48("137198") ? true : stryMutAct_9fa48("137197") ? this.workflowOwner : (stryCov_9fa48("137197", "137198", "137199"), !this.workflowOwner)) {
        if (stryMutAct_9fa48("137200")) {
          {}
        } else {
          stryCov_9fa48("137200");
          return;
        }
      }
      return this.workflowOwner.checkTimeouts();
    }
  }

  /**
   * @param {string} step
   * @return {number}
   * @private
   */
  getTimeoutForStep(step, operation = null) {
    if (stryMutAct_9fa48("137201")) {
      {}
    } else {
      stryCov_9fa48("137201");
      return this.workflowOwner.getTimeoutForStep(step, operation);
    }
  }

  /**
   * @param {Object} operation
   * @param {number} now
   * @return {Promise<void>}
   */
  async reconcileTimeoutOperation(operation, now) {
    if (stryMutAct_9fa48("137202")) {
      {}
    } else {
      stryCov_9fa48("137202");
      return this.workflowOwner.reconcileTimeoutOperation(operation, now);
    }
  }

  /**
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileOperationProgress(operation) {
    if (stryMutAct_9fa48("137203")) {
      {}
    } else {
      stryCov_9fa48("137203");
      return this.workflowOwner.reconcileOperationProgress(operation);
    }
  }

  /**
   * Handle an executor outcome event by routing it through the
   * owner-key reconcile queue. This is the only entry point for
   * executor outcomes into the coordinator — no direct mutation.
   *
   * The outcome is enqueued via `runExclusive` keyed by operationId
   * so that at most one reconcile runs per operation at a time.
   *
   * @param {Object} outcome - Frozen executor outcome payload.
   */
  handleExecutorOutcome(outcome) {
    if (stryMutAct_9fa48("137204")) {
      {}
    } else {
      stryCov_9fa48("137204");
      return this.workflowOwner.handleExecutorOutcome(outcome);
    }
  }

  /**
   * Reconcile a single executor outcome.
   * Delegates to workflow owner (D7.1).
   * @param {Object} outcome
   * @return {Promise<boolean>}
   */
  async reconcileExecutorOutcome(outcome) {
    if (stryMutAct_9fa48("137205")) {
      {}
    } else {
      stryCov_9fa48("137205");
      return this.workflowOwner.reconcileExecutorOutcome(outcome);
    }
  }

  /**
   * Handle node recovery - process incomplete operations.
   * Requirements: 7.1, 7.2, 7.3
   * @readModel COORDINATOR_RECOVERY_QUERY — READ_MODEL_SOURCE.RECOVERY_SQL
   *
   * This method is called when a node restarts to handle operations that
   * were in progress when the node went down.
   *
   * @return {Promise<Object>} Recovery result with counts.
   */
  async handleRecovery() {
    if (stryMutAct_9fa48("137206")) {
      {}
    } else {
      stryCov_9fa48("137206");
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START, stryMutAct_9fa48("137207") ? {} : (stryCov_9fa48("137207"), {
        nodeId: this.nodeId
      }));
      const result = stryMutAct_9fa48("137208") ? {} : (stryCov_9fa48("137208"), {
        totalIncomplete: NUM.ZERO,
        markedFailed: NUM.ZERO,
        reconciled: NUM.ZERO,
        errors: stryMutAct_9fa48("137209") ? ["Stryker was here"] : (stryCov_9fa48("137209"), [])
      });
      const incompleteOps = await this.queryIncompleteOperations(stryMutAct_9fa48("137210") ? {} : (stryCov_9fa48("137210"), {
        preferAuthoritativeRead: stryMutAct_9fa48("137211") ? false : (stryCov_9fa48("137211"), true)
      }));
      result.totalIncomplete = incompleteOps.length;
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND, stryMutAct_9fa48("137212") ? {} : (stryCov_9fa48("137212"), {
        count: incompleteOps.length,
        nodeId: this.nodeId
      }));
      for (const op of incompleteOps) {
        if (stryMutAct_9fa48("137213")) {
          {}
        } else {
          stryCov_9fa48("137213");
          if (stryMutAct_9fa48("137216") ? false : stryMutAct_9fa48("137215") ? true : stryMutAct_9fa48("137214") ? this.isOperationLocallyOwned(op) : (stryCov_9fa48("137214", "137215", "137216"), !this.isOperationLocallyOwned(op))) {
            if (stryMutAct_9fa48("137217")) {
              {}
            } else {
              stryCov_9fa48("137217");
              continue;
            }
          }
          const originalStep = op.workflowStep;
          const singleFlightKey = this.getOperationOwnerSingleFlightKey(op.operationId);
          try {
            if (stryMutAct_9fa48("137218")) {
              {}
            } else {
              stryCov_9fa48("137218");
              await this.operationWorkflowRunExclusive(singleFlightKey, stryMutAct_9fa48("137219") ? () => undefined : (stryCov_9fa48("137219"), () => this.reconcileRecoveryOperation(op)));
            }
          } catch (error) {
            if (stryMutAct_9fa48("137220")) {
              {}
            } else {
              stryCov_9fa48("137220");
              result.errors.push(stryMutAct_9fa48("137221") ? {} : (stryCov_9fa48("137221"), {
                operationId: op.operationId,
                error: error.message
              }));
              this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, stryMutAct_9fa48("137222") ? {} : (stryCov_9fa48("137222"), {
                operationId: op.operationId,
                workflowStep: originalStep,
                partitionId: op.partitionId,
                error: error.message
              }));
              continue;
            }
          }
          if (stryMutAct_9fa48("137225") ? this.isPreSyncStep(originalStep) && originalStep === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("137224") ? false : stryMutAct_9fa48("137223") ? true : (stryCov_9fa48("137223", "137224", "137225"), this.isPreSyncStep(originalStep) || (stryMutAct_9fa48("137227") ? originalStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("137226") ? false : (stryCov_9fa48("137226", "137227"), originalStep === WORKFLOW_STEP.STOPPING)))) {
            if (stryMutAct_9fa48("137228")) {
              {}
            } else {
              stryCov_9fa48("137228");
              stryMutAct_9fa48("137229") ? result.markedFailed-- : (stryCov_9fa48("137229"), result.markedFailed++);
            }
          } else if (stryMutAct_9fa48("137232") ? originalStep !== WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("137231") ? false : stryMutAct_9fa48("137230") ? true : (stryCov_9fa48("137230", "137231", "137232"), originalStep === WORKFLOW_STEP.SYNCING)) {
            if (stryMutAct_9fa48("137233")) {
              {}
            } else {
              stryCov_9fa48("137233");
              stryMutAct_9fa48("137234") ? result.reconciled-- : (stryCov_9fa48("137234"), result.reconciled++);
            }
          }
        }
      }
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED, stryMutAct_9fa48("137235") ? {} : (stryCov_9fa48("137235"), {
        nodeId: this.nodeId,
        ...result
      }));
      const reservationResult = await this.reconcileReservations();
      result.reservationsExpired = reservationResult.expired;
      result.reservationsOrphansReleased = reservationResult.orphansReleased;
      this.emit(REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED, result);
      return result;
    }
  }

  /**
   * @param {string} step
   * @return {boolean}
   * @private
   */
  isPreSyncStep(step) {
    if (stryMutAct_9fa48("137236")) {
      {}
    } else {
      stryCov_9fa48("137236");
      return this.workflowOwner.isPreSyncStep(step);
    }
  }

  /**
   * @param {Object} op
   * @return {Promise<void>}
   */
  async reconcileRecoveryOperation(op) {
    if (stryMutAct_9fa48("137237")) {
      {}
    } else {
      stryCov_9fa48("137237");
      return this.workflowOwner.reconcileRecoveryOperation(op);
    }
  }

  /**
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async reconcileSyncingOperation(operation) {
    if (stryMutAct_9fa48("137238")) {
      {}
    } else {
      stryCov_9fa48("137238");
      return this.workflowOwner.reconcileSyncingOperation(operation);
    }
  }

  /**
   * Resolve observed replica status from the local services cache boundary.
   * This is only used after authoritative service reads miss, so owner-path
   * progression can converge on exact observed target rows instead of timing
   * out behind stale visibility.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {string|null}
   * @private
   */
  getObservedReplicaStatusFromCache(replicaId, partitionId, targetNodeId) {
    if (stryMutAct_9fa48("137239")) {
      {}
    } else {
      stryCov_9fa48("137239");
      return this.repository.getObservedReplicaStatusFromCache(replicaId, partitionId, targetNodeId);
    }
  }

  /**
   * Get actual replica status via SQL engine.
   * Per system guidelines: all system information access via SQL engine.
   * Requirements: 7.3
   * @readModel COORDINATOR_REPLICA_STATUS_RECONCILE —
   *   READ_MODEL_SOURCE.RECOVERY_SQL
   *
   * @param {string} replicaId - Replica ID.
   * @param {string} partitionId - Partition ID.
   * @param {string} targetNodeId - Target node ID.
   * @return {Promise<string|null>} Replica status or null if not found.
   * @private
   */
  async getActualReplicaStatus(replicaId, partitionId, targetNodeId) {
    if (stryMutAct_9fa48("137240")) {
      {}
    } else {
      stryCov_9fa48("137240");
      return this.repository.getActualReplicaStatus(replicaId, partitionId, targetNodeId);
    }
  }

  /**
   * Emit a typed divergence event when cache and authoritative replica
   * status differ during recovery reconciliation.
   * @param {string} replicaId - Replica service ID.
   * @param {string|null} authoritativeStatus - Status from SQL.
   * @param {string} reason - SQL_RECONCILIATION_REASON value.
   * @private
   */
  emitReplicaStatusDivergence(replicaId, authoritativeStatus, reason) {
    if (stryMutAct_9fa48("137241")) {
      {}
    } else {
      stryCov_9fa48("137241");
      return this.repository.emitReplicaStatusDivergence(replicaId, authoritativeStatus, reason);
    }
  }

  /**
   * Get an operation by ID via SQL engine.
   *
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation or null if not found.
   */
  async getOperation(operationId) {
    if (stryMutAct_9fa48("137242")) {
      {}
    } else {
      stryCov_9fa48("137242");
      return this.queryOperationById(operationId);
    }
  }

  /**
   * Get all operations via SQL engine.
   * Note: This queries the database, not an in-memory cache.
   *
   * @return {Promise<Array<Object>>} Array of all operations.
   */
  async getAllOperations() {
    if (stryMutAct_9fa48("137243")) {
      {}
    } else {
      stryCov_9fa48("137243");
      return this.repository.getAllOperations();
    }
  }

  /**
   * Get operations by partition ID via SQL engine.
   *
   * @param {string} partitionId - Partition ID.
   * @return {Promise<Array<Object>>} Array of operations for the partition.
   */
  async getOperationsByPartition(partitionId) {
    if (stryMutAct_9fa48("137244")) {
      {}
    } else {
      stryCov_9fa48("137244");
      return this.getOperationsByEntity(SERVICE_TYPE.PARTITION, partitionId);
    }
  }

  /**
   * Get operations by canonical entity identity via SQL engine.
   *
   * @param {string} entityType - Entity type.
   * @param {string} entityId - Entity ID.
   * @return {Promise<Array<Object>>} Array of operations for the entity.
   */
  async getOperationsByEntity(entityType, entityId) {
    if (stryMutAct_9fa48("137245")) {
      {}
    } else {
      stryCov_9fa48("137245");
      return this.repository.getOperationsByEntity(entityType, entityId);
    }
  }

  /**
   * Get in-flight operations (not completed or failed) via SQL engine.
   *
   * @return {Promise<Array<Object>>} Array of in-flight operations.
   */
  async getInFlightOperations() {
    if (stryMutAct_9fa48("137246")) {
      {}
    } else {
      stryCov_9fa48("137246");
      return this.queryIncompleteOperations();
    }
  }

  /**
   * Get count of concurrent ADD operations via SQL engine.
   *
   * @return {Promise<number>} Count of concurrent ADD operations.
   */
  async getConcurrentAddCount(options = {}) {
    if (stryMutAct_9fa48("137247")) {
      {}
    } else {
      stryCov_9fa48("137247");
      const inFlight = await this.queryIncompleteOperations(options);
      return stryMutAct_9fa48("137248") ? inFlight.length : (stryCov_9fa48("137248"), inFlight.filter(stryMutAct_9fa48("137249") ? () => undefined : (stryCov_9fa48("137249"), operation => this.isConcurrentAddBudgetOperation(operation))).length);
    }
  }

  /**
   * Build add/replace in-flight counts for ordinary-priority,
   * emergency-priority, and non-priority lanes.
   * @param {Array<Object>} operations
   * @return {{
   *   priorityCount:number,
   *   ordinaryPriorityCount:number,
   *   emergencyPriorityCount:number,
   *   nonPriorityCount:number,
   * }}
   * @private
   */
  buildConcurrentAddCountByPriorityClass(operations = stryMutAct_9fa48("137250") ? ["Stryker was here"] : (stryCov_9fa48("137250"), [])) {
    if (stryMutAct_9fa48("137251")) {
      {}
    } else {
      stryCov_9fa48("137251");
      let ordinaryPriorityCount = NUM.ZERO;
      let emergencyPriorityCount = NUM.ZERO;
      let nonPriorityCount = NUM.ZERO;
      for (const operation of operations) {
        if (stryMutAct_9fa48("137252")) {
          {}
        } else {
          stryCov_9fa48("137252");
          if (stryMutAct_9fa48("137255") ? false : stryMutAct_9fa48("137254") ? true : stryMutAct_9fa48("137253") ? this.isConcurrentAddBudgetOperation(operation) : (stryCov_9fa48("137253", "137254", "137255"), !this.isConcurrentAddBudgetOperation(operation))) {
            if (stryMutAct_9fa48("137256")) {
              {}
            } else {
              stryCov_9fa48("137256");
              continue;
            }
          }
          const partitionId = stryMutAct_9fa48("137257") ? String(operation.partitionId || operation.entityId || '') : (stryCov_9fa48("137257"), String(stryMutAct_9fa48("137260") ? (operation.partitionId || operation.entityId) && '' : stryMutAct_9fa48("137259") ? false : stryMutAct_9fa48("137258") ? true : (stryCov_9fa48("137258", "137259", "137260"), (stryMutAct_9fa48("137262") ? operation.partitionId && operation.entityId : stryMutAct_9fa48("137261") ? false : (stryCov_9fa48("137261", "137262"), operation.partitionId || operation.entityId)) || (stryMutAct_9fa48("137263") ? "Stryker was here!" : (stryCov_9fa48("137263"), '')))).trim());
          if (stryMutAct_9fa48("137266") ? partitionId.length > NUM.ZERO || this.isPriorityControlPlanePartition(partitionId) : stryMutAct_9fa48("137265") ? false : stryMutAct_9fa48("137264") ? true : (stryCov_9fa48("137264", "137265", "137266"), (stryMutAct_9fa48("137269") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("137268") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("137267") ? true : (stryCov_9fa48("137267", "137268", "137269"), partitionId.length > NUM.ZERO)) && this.isPriorityControlPlanePartition(partitionId))) {
            if (stryMutAct_9fa48("137270")) {
              {}
            } else {
              stryCov_9fa48("137270");
              if (stryMutAct_9fa48("137272") ? false : stryMutAct_9fa48("137271") ? true : (stryCov_9fa48("137271", "137272"), this.isEmergencyPriorityControlPlanePartition(partitionId))) {
                if (stryMutAct_9fa48("137273")) {
                  {}
                } else {
                  stryCov_9fa48("137273");
                  stryMutAct_9fa48("137274") ? emergencyPriorityCount -= NUM.ONE : (stryCov_9fa48("137274"), emergencyPriorityCount += NUM.ONE);
                }
              } else {
                if (stryMutAct_9fa48("137275")) {
                  {}
                } else {
                  stryCov_9fa48("137275");
                  stryMutAct_9fa48("137276") ? ordinaryPriorityCount -= NUM.ONE : (stryCov_9fa48("137276"), ordinaryPriorityCount += NUM.ONE);
                }
              }
              continue;
            }
          }
          stryMutAct_9fa48("137277") ? nonPriorityCount -= NUM.ONE : (stryCov_9fa48("137277"), nonPriorityCount += NUM.ONE);
        }
      }
      return stryMutAct_9fa48("137278") ? {} : (stryCov_9fa48("137278"), {
        priorityCount: stryMutAct_9fa48("137279") ? ordinaryPriorityCount - emergencyPriorityCount : (stryCov_9fa48("137279"), ordinaryPriorityCount + emergencyPriorityCount),
        ordinaryPriorityCount,
        emergencyPriorityCount,
        nonPriorityCount
      });
    }
  }

  /**
   * Resolve add/replace in-flight counts grouped by priority lane.
   * @param {Object} [options={}]
   * @return {Promise<{priorityCount:number, nonPriorityCount:number}>}
   * @private
   */
  async getConcurrentAddCountByPriorityClass(options = {}) {
    if (stryMutAct_9fa48("137280")) {
      {}
    } else {
      stryCov_9fa48("137280");
      const inFlight = await this.queryIncompleteOperations(options);
      return this.buildConcurrentAddCountByPriorityClass(inFlight);
    }
  }

  /**
   * Return true when one operation still consumes add-budget capacity.
   * REPLACE operations in source-removal dispatch (ACTIVE/STOPPING) are
   * remove-phase work and must not block new add/replace scheduling.
   *
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isConcurrentAddBudgetOperation(operation) {
    if (stryMutAct_9fa48("137281")) {
      {}
    } else {
      stryCov_9fa48("137281");
      if (stryMutAct_9fa48("137284") ? !operation && typeof operation !== 'object' : stryMutAct_9fa48("137283") ? false : stryMutAct_9fa48("137282") ? true : (stryCov_9fa48("137282", "137283", "137284"), (stryMutAct_9fa48("137285") ? operation : (stryCov_9fa48("137285"), !operation)) || (stryMutAct_9fa48("137287") ? typeof operation === 'object' : stryMutAct_9fa48("137286") ? false : (stryCov_9fa48("137286", "137287"), typeof operation !== (stryMutAct_9fa48("137288") ? "" : (stryCov_9fa48("137288"), 'object')))))) {
        if (stryMutAct_9fa48("137289")) {
          {}
        } else {
          stryCov_9fa48("137289");
          return stryMutAct_9fa48("137290") ? true : (stryCov_9fa48("137290"), false);
        }
      }
      const type = stryMutAct_9fa48("137291") ? String(operation.type || '').toLowerCase() : (stryCov_9fa48("137291"), String(stryMutAct_9fa48("137294") ? operation.type && '' : stryMutAct_9fa48("137293") ? false : stryMutAct_9fa48("137292") ? true : (stryCov_9fa48("137292", "137293", "137294"), operation.type || (stryMutAct_9fa48("137295") ? "Stryker was here!" : (stryCov_9fa48("137295"), '')))).toUpperCase());
      if (stryMutAct_9fa48("137298") ? type !== OperationType.ADD : stryMutAct_9fa48("137297") ? false : stryMutAct_9fa48("137296") ? true : (stryCov_9fa48("137296", "137297", "137298"), type === OperationType.ADD)) {
        if (stryMutAct_9fa48("137299")) {
          {}
        } else {
          stryCov_9fa48("137299");
          return stryMutAct_9fa48("137300") ? false : (stryCov_9fa48("137300"), true);
        }
      }
      if (stryMutAct_9fa48("137303") ? type === OperationType.REPLACE : stryMutAct_9fa48("137302") ? false : stryMutAct_9fa48("137301") ? true : (stryCov_9fa48("137301", "137302", "137303"), type !== OperationType.REPLACE)) {
        if (stryMutAct_9fa48("137304")) {
          {}
        } else {
          stryCov_9fa48("137304");
          return stryMutAct_9fa48("137305") ? true : (stryCov_9fa48("137305"), false);
        }
      }
      return stryMutAct_9fa48("137306") ? this.isReplaceRemoveDispatchPhase(operation) : (stryCov_9fa48("137306"), !this.isReplaceRemoveDispatchPhase(operation));
    }
  }

  /**
   * Get count of concurrent REMOVE operations via SQL engine.
   *
   * @return {Promise<number>} Count of concurrent REMOVE operations.
   */
  async getConcurrentRemoveCount(options = {}) {
    if (stryMutAct_9fa48("137307")) {
      {}
    } else {
      stryCov_9fa48("137307");
      return this.repository.getConcurrentRemoveCount(options);
    }
  }

  /**
   * Execute a replica_operations read with a local authoritative fast-path
   * when this node hosts the local leader replica for that system partition.
   * Falls back to the routed SQL engine otherwise.
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Promise<Object>}
   * @private
   */
  async executeReplicaOperationsRead(sql, params = stryMutAct_9fa48("137308") ? ["Stryker was here"] : (stryCov_9fa48("137308"), [])) {
    if (stryMutAct_9fa48("137309")) {
      {}
    } else {
      stryCov_9fa48("137309");
      return this.repository.executeReplicaOperationsRead(sql, params);
    }
  }

  /**
   * Check if we can start a new ADD operation.
   *
   * @param {Object} [options={}]
   * @param {boolean} [options.preferAuthoritativeCount]
   * @return {Promise<boolean>} True if we can start a new ADD operation.
   */
  async canStartAddOperation(options = {}) {
    if (stryMutAct_9fa48("137310")) {
      {}
    } else {
      stryCov_9fa48("137310");
      if (stryMutAct_9fa48("137312") ? false : stryMutAct_9fa48("137311") ? true : (stryCov_9fa48("137311", "137312"), this.isLocalRouterBackpressured(options))) {
        if (stryMutAct_9fa48("137313")) {
          {}
        } else {
          stryCov_9fa48("137313");
          return stryMutAct_9fa48("137314") ? true : (stryCov_9fa48("137314"), false);
        }
      }
      const concurrentAddLimit = this.getConcurrentAddBudgetLimit(options);
      if (stryMutAct_9fa48("137318") ? concurrentAddLimit > NUM.ZERO : stryMutAct_9fa48("137317") ? concurrentAddLimit < NUM.ZERO : stryMutAct_9fa48("137316") ? false : stryMutAct_9fa48("137315") ? true : (stryCov_9fa48("137315", "137316", "137317", "137318"), concurrentAddLimit <= NUM.ZERO)) {
        if (stryMutAct_9fa48("137319")) {
          {}
        } else {
          stryCov_9fa48("137319");
          return stryMutAct_9fa48("137320") ? true : (stryCov_9fa48("137320"), false);
        }
      }
      const cachedCount = stryMutAct_9fa48("137321") ? (await this.queryCachedIncompleteOperations()).length : (stryCov_9fa48("137321"), (await this.queryCachedIncompleteOperations()).filter(stryMutAct_9fa48("137322") ? () => undefined : (stryCov_9fa48("137322"), operation => this.isConcurrentAddBudgetOperation(operation))).length);
      if (stryMutAct_9fa48("137326") ? cachedCount <= NUM.ZERO : stryMutAct_9fa48("137325") ? cachedCount >= NUM.ZERO : stryMutAct_9fa48("137324") ? false : stryMutAct_9fa48("137323") ? true : (stryCov_9fa48("137323", "137324", "137325", "137326"), cachedCount > NUM.ZERO)) {
        if (stryMutAct_9fa48("137327")) {
          {}
        } else {
          stryCov_9fa48("137327");
          this.clearEmptyIncompleteOperationQueryDelay();
          if (stryMutAct_9fa48("137331") ? cachedCount >= concurrentAddLimit : stryMutAct_9fa48("137330") ? cachedCount <= concurrentAddLimit : stryMutAct_9fa48("137329") ? false : stryMutAct_9fa48("137328") ? true : (stryCov_9fa48("137328", "137329", "137330", "137331"), cachedCount < concurrentAddLimit)) {
            if (stryMutAct_9fa48("137332")) {
              {}
            } else {
              stryCov_9fa48("137332");
              return stryMutAct_9fa48("137333") ? false : (stryCov_9fa48("137333"), true);
            }
          }
          if (stryMutAct_9fa48("137336") ? options?.preferAuthoritativeCount === true : stryMutAct_9fa48("137335") ? false : stryMutAct_9fa48("137334") ? true : (stryCov_9fa48("137334", "137335", "137336"), (stryMutAct_9fa48("137337") ? options.preferAuthoritativeCount : (stryCov_9fa48("137337"), options?.preferAuthoritativeCount)) !== (stryMutAct_9fa48("137338") ? false : (stryCov_9fa48("137338"), true)))) {
            if (stryMutAct_9fa48("137339")) {
              {}
            } else {
              stryCov_9fa48("137339");
              return stryMutAct_9fa48("137340") ? true : (stryCov_9fa48("137340"), false);
            }
          }
          const authoritativeCount = await this.getConcurrentAddCount(stryMutAct_9fa48("137341") ? {} : (stryCov_9fa48("137341"), {
            partitionId: options.partitionId,
            preferAuthoritativeRead: stryMutAct_9fa48("137342") ? false : (stryCov_9fa48("137342"), true)
          }));
          if (stryMutAct_9fa48("137345") ? authoritativeCount !== NUM.ZERO : stryMutAct_9fa48("137344") ? false : stryMutAct_9fa48("137343") ? true : (stryCov_9fa48("137343", "137344", "137345"), authoritativeCount === NUM.ZERO)) {
            if (stryMutAct_9fa48("137346")) {
              {}
            } else {
              stryCov_9fa48("137346");
              this.markEmptyIncompleteOperationQueryAt();
            }
          } else {
            if (stryMutAct_9fa48("137347")) {
              {}
            } else {
              stryCov_9fa48("137347");
              this.clearEmptyIncompleteOperationQueryDelay();
            }
          }
          return stryMutAct_9fa48("137351") ? authoritativeCount >= concurrentAddLimit : stryMutAct_9fa48("137350") ? authoritativeCount <= concurrentAddLimit : stryMutAct_9fa48("137349") ? false : stryMutAct_9fa48("137348") ? true : (stryCov_9fa48("137348", "137349", "137350", "137351"), authoritativeCount < concurrentAddLimit);
        }
      }
      const bypassEmptyQueryDelay = stryMutAct_9fa48("137354") ? options?.bypassEmptyQueryDelay !== true : stryMutAct_9fa48("137353") ? false : stryMutAct_9fa48("137352") ? true : (stryCov_9fa48("137352", "137353", "137354"), (stryMutAct_9fa48("137355") ? options.bypassEmptyQueryDelay : (stryCov_9fa48("137355"), options?.bypassEmptyQueryDelay)) === (stryMutAct_9fa48("137356") ? false : (stryCov_9fa48("137356"), true)));
      if (stryMutAct_9fa48("137359") ? !bypassEmptyQueryDelay || this.shouldDelayEmptyIncompleteOperationQuery() : stryMutAct_9fa48("137358") ? false : stryMutAct_9fa48("137357") ? true : (stryCov_9fa48("137357", "137358", "137359"), (stryMutAct_9fa48("137360") ? bypassEmptyQueryDelay : (stryCov_9fa48("137360"), !bypassEmptyQueryDelay)) && this.shouldDelayEmptyIncompleteOperationQuery())) {
        if (stryMutAct_9fa48("137361")) {
          {}
        } else {
          stryCov_9fa48("137361");
          return stryMutAct_9fa48("137362") ? true : (stryCov_9fa48("137362"), false);
        }
      }
      const count = await this.getConcurrentAddCount(stryMutAct_9fa48("137363") ? {} : (stryCov_9fa48("137363"), {
        partitionId: options.partitionId
      }));
      if (stryMutAct_9fa48("137366") ? count !== NUM.ZERO : stryMutAct_9fa48("137365") ? false : stryMutAct_9fa48("137364") ? true : (stryCov_9fa48("137364", "137365", "137366"), count === NUM.ZERO)) {
        if (stryMutAct_9fa48("137367")) {
          {}
        } else {
          stryCov_9fa48("137367");
          this.markEmptyIncompleteOperationQueryAt();
        }
      } else {
        if (stryMutAct_9fa48("137368")) {
          {}
        } else {
          stryCov_9fa48("137368");
          this.clearEmptyIncompleteOperationQueryDelay();
        }
      }
      return stryMutAct_9fa48("137372") ? count >= concurrentAddLimit : stryMutAct_9fa48("137371") ? count <= concurrentAddLimit : stryMutAct_9fa48("137370") ? false : stryMutAct_9fa48("137369") ? true : (stryCov_9fa48("137369", "137370", "137371", "137372"), count < concurrentAddLimit);
    }
  }

  /**
   * Check whether one priority add/replace can start.
   * Priority partitions use a dedicated count lane so unrelated non-priority
   * workflows cannot exhaust the spread-recovery scheduling budget.
   *
   * @param {Object} [options={}]
   * @param {boolean} [options.preferAuthoritativeCount]
   * @return {Promise<boolean>}
   */
  async canStartPriorityAddOperation(options = {}) {
    if (stryMutAct_9fa48("137373")) {
      {}
    } else {
      stryCov_9fa48("137373");
      if (stryMutAct_9fa48("137375") ? false : stryMutAct_9fa48("137374") ? true : (stryCov_9fa48("137374", "137375"), this.isLocalRouterBackpressured(options))) {
        if (stryMutAct_9fa48("137376")) {
          {}
        } else {
          stryCov_9fa48("137376");
          return stryMutAct_9fa48("137377") ? true : (stryCov_9fa48("137377"), false);
        }
      }
      const priorityRecoveryAdmissionPlan = this.getPriorityRecoveryAdmissionPlan();
      const maximumPriorityConcurrentAddLimit = priorityRecoveryAdmissionPlan.emergencyPriorityAddBudgetLimit;
      if (stryMutAct_9fa48("137381") ? maximumPriorityConcurrentAddLimit > NUM.ZERO : stryMutAct_9fa48("137380") ? maximumPriorityConcurrentAddLimit < NUM.ZERO : stryMutAct_9fa48("137379") ? false : stryMutAct_9fa48("137378") ? true : (stryCov_9fa48("137378", "137379", "137380", "137381"), maximumPriorityConcurrentAddLimit <= NUM.ZERO)) {
        if (stryMutAct_9fa48("137382")) {
          {}
        } else {
          stryCov_9fa48("137382");
          return stryMutAct_9fa48("137383") ? true : (stryCov_9fa48("137383"), false);
        }
      }
      const isPriorityCountsAdmitted = (counts = {}) => {
        if (stryMutAct_9fa48("137384")) {
          {}
        } else {
          stryCov_9fa48("137384");
          return stryMutAct_9fa48("137387") ? priorityRecoveryAdmissionPlan.evaluatePriorityAddAdmission(options.partitionId, counts).allowed !== true : stryMutAct_9fa48("137386") ? false : stryMutAct_9fa48("137385") ? true : (stryCov_9fa48("137385", "137386", "137387"), priorityRecoveryAdmissionPlan.evaluatePriorityAddAdmission(options.partitionId, counts).allowed === (stryMutAct_9fa48("137388") ? false : (stryCov_9fa48("137388"), true)));
        }
      };
      const cachedCounts = this.buildConcurrentAddCountByPriorityClass(await this.queryCachedIncompleteOperations());
      const cachedTotalCount = stryMutAct_9fa48("137389") ? cachedCounts.priorityCount - cachedCounts.nonPriorityCount : (stryCov_9fa48("137389"), cachedCounts.priorityCount + cachedCounts.nonPriorityCount);
      if (stryMutAct_9fa48("137393") ? cachedTotalCount <= NUM.ZERO : stryMutAct_9fa48("137392") ? cachedTotalCount >= NUM.ZERO : stryMutAct_9fa48("137391") ? false : stryMutAct_9fa48("137390") ? true : (stryCov_9fa48("137390", "137391", "137392", "137393"), cachedTotalCount > NUM.ZERO)) {
        if (stryMutAct_9fa48("137394")) {
          {}
        } else {
          stryCov_9fa48("137394");
          this.clearEmptyIncompleteOperationQueryDelay();
          if (stryMutAct_9fa48("137396") ? false : stryMutAct_9fa48("137395") ? true : (stryCov_9fa48("137395", "137396"), isPriorityCountsAdmitted(cachedCounts))) {
            if (stryMutAct_9fa48("137397")) {
              {}
            } else {
              stryCov_9fa48("137397");
              return stryMutAct_9fa48("137398") ? false : (stryCov_9fa48("137398"), true);
            }
          }
          if (stryMutAct_9fa48("137401") ? options?.preferAuthoritativeCount === true : stryMutAct_9fa48("137400") ? false : stryMutAct_9fa48("137399") ? true : (stryCov_9fa48("137399", "137400", "137401"), (stryMutAct_9fa48("137402") ? options.preferAuthoritativeCount : (stryCov_9fa48("137402"), options?.preferAuthoritativeCount)) !== (stryMutAct_9fa48("137403") ? false : (stryCov_9fa48("137403"), true)))) {
            if (stryMutAct_9fa48("137404")) {
              {}
            } else {
              stryCov_9fa48("137404");
              return stryMutAct_9fa48("137405") ? true : (stryCov_9fa48("137405"), false);
            }
          }
          const authoritativeCounts = await this.getConcurrentAddCountByPriorityClass(stryMutAct_9fa48("137406") ? {} : (stryCov_9fa48("137406"), {
            partitionId: options.partitionId,
            preferAuthoritativeRead: stryMutAct_9fa48("137407") ? false : (stryCov_9fa48("137407"), true)
          }));
          const authoritativeTotalCount = stryMutAct_9fa48("137408") ? authoritativeCounts.priorityCount - authoritativeCounts.nonPriorityCount : (stryCov_9fa48("137408"), authoritativeCounts.priorityCount + authoritativeCounts.nonPriorityCount);
          if (stryMutAct_9fa48("137411") ? authoritativeTotalCount !== NUM.ZERO : stryMutAct_9fa48("137410") ? false : stryMutAct_9fa48("137409") ? true : (stryCov_9fa48("137409", "137410", "137411"), authoritativeTotalCount === NUM.ZERO)) {
            if (stryMutAct_9fa48("137412")) {
              {}
            } else {
              stryCov_9fa48("137412");
              this.markEmptyIncompleteOperationQueryAt();
            }
          } else {
            if (stryMutAct_9fa48("137413")) {
              {}
            } else {
              stryCov_9fa48("137413");
              this.clearEmptyIncompleteOperationQueryDelay();
            }
          }
          return isPriorityCountsAdmitted(authoritativeCounts);
        }
      }
      const bypassEmptyQueryDelay = stryMutAct_9fa48("137416") ? options?.bypassEmptyQueryDelay !== true : stryMutAct_9fa48("137415") ? false : stryMutAct_9fa48("137414") ? true : (stryCov_9fa48("137414", "137415", "137416"), (stryMutAct_9fa48("137417") ? options.bypassEmptyQueryDelay : (stryCov_9fa48("137417"), options?.bypassEmptyQueryDelay)) === (stryMutAct_9fa48("137418") ? false : (stryCov_9fa48("137418"), true)));
      if (stryMutAct_9fa48("137421") ? !bypassEmptyQueryDelay || this.shouldDelayEmptyIncompleteOperationQuery() : stryMutAct_9fa48("137420") ? false : stryMutAct_9fa48("137419") ? true : (stryCov_9fa48("137419", "137420", "137421"), (stryMutAct_9fa48("137422") ? bypassEmptyQueryDelay : (stryCov_9fa48("137422"), !bypassEmptyQueryDelay)) && this.shouldDelayEmptyIncompleteOperationQuery())) {
        if (stryMutAct_9fa48("137423")) {
          {}
        } else {
          stryCov_9fa48("137423");
          return stryMutAct_9fa48("137424") ? true : (stryCov_9fa48("137424"), false);
        }
      }
      const counts = await this.getConcurrentAddCountByPriorityClass(stryMutAct_9fa48("137425") ? {} : (stryCov_9fa48("137425"), {
        partitionId: options.partitionId
      }));
      const totalCount = stryMutAct_9fa48("137426") ? counts.priorityCount - counts.nonPriorityCount : (stryCov_9fa48("137426"), counts.priorityCount + counts.nonPriorityCount);
      if (stryMutAct_9fa48("137429") ? totalCount !== NUM.ZERO : stryMutAct_9fa48("137428") ? false : stryMutAct_9fa48("137427") ? true : (stryCov_9fa48("137427", "137428", "137429"), totalCount === NUM.ZERO)) {
        if (stryMutAct_9fa48("137430")) {
          {}
        } else {
          stryCov_9fa48("137430");
          this.markEmptyIncompleteOperationQueryAt();
        }
      } else {
        if (stryMutAct_9fa48("137431")) {
          {}
        } else {
          stryCov_9fa48("137431");
          this.clearEmptyIncompleteOperationQueryDelay();
        }
      }
      return isPriorityCountsAdmitted(counts);
    }
  }

  /**
   * Check if we can start a new REMOVE operation.
   *
   * @param {Object} [options={}]
   * @param {boolean} [options.preferAuthoritativeCount]
   * @return {Promise<boolean>} True if we can start a new REMOVE operation.
   */
  async canStartRemoveOperation(options = {}) {
    if (stryMutAct_9fa48("137432")) {
      {}
    } else {
      stryCov_9fa48("137432");
      if (stryMutAct_9fa48("137434") ? false : stryMutAct_9fa48("137433") ? true : (stryCov_9fa48("137433", "137434"), this.isLocalRouterBackpressured(options))) {
        if (stryMutAct_9fa48("137435")) {
          {}
        } else {
          stryCov_9fa48("137435");
          return stryMutAct_9fa48("137436") ? true : (stryCov_9fa48("137436"), false);
        }
      }
      const cachedCount = stryMutAct_9fa48("137437") ? (await this.queryCachedIncompleteOperations()).length : (stryCov_9fa48("137437"), (await this.queryCachedIncompleteOperations()).filter(stryMutAct_9fa48("137438") ? () => undefined : (stryCov_9fa48("137438"), operation => stryMutAct_9fa48("137441") ? operation?.type !== OperationType.REMOVE : stryMutAct_9fa48("137440") ? false : stryMutAct_9fa48("137439") ? true : (stryCov_9fa48("137439", "137440", "137441"), (stryMutAct_9fa48("137442") ? operation.type : (stryCov_9fa48("137442"), operation?.type)) === OperationType.REMOVE))).length);
      if (stryMutAct_9fa48("137446") ? cachedCount <= NUM.ZERO : stryMutAct_9fa48("137445") ? cachedCount >= NUM.ZERO : stryMutAct_9fa48("137444") ? false : stryMutAct_9fa48("137443") ? true : (stryCov_9fa48("137443", "137444", "137445", "137446"), cachedCount > NUM.ZERO)) {
        if (stryMutAct_9fa48("137447")) {
          {}
        } else {
          stryCov_9fa48("137447");
          this.clearEmptyIncompleteOperationQueryDelay();
          if (stryMutAct_9fa48("137451") ? cachedCount >= this.config.maxConcurrentRemoves : stryMutAct_9fa48("137450") ? cachedCount <= this.config.maxConcurrentRemoves : stryMutAct_9fa48("137449") ? false : stryMutAct_9fa48("137448") ? true : (stryCov_9fa48("137448", "137449", "137450", "137451"), cachedCount < this.config.maxConcurrentRemoves)) {
            if (stryMutAct_9fa48("137452")) {
              {}
            } else {
              stryCov_9fa48("137452");
              return stryMutAct_9fa48("137453") ? false : (stryCov_9fa48("137453"), true);
            }
          }
          if (stryMutAct_9fa48("137456") ? options?.preferAuthoritativeCount === true : stryMutAct_9fa48("137455") ? false : stryMutAct_9fa48("137454") ? true : (stryCov_9fa48("137454", "137455", "137456"), (stryMutAct_9fa48("137457") ? options.preferAuthoritativeCount : (stryCov_9fa48("137457"), options?.preferAuthoritativeCount)) !== (stryMutAct_9fa48("137458") ? false : (stryCov_9fa48("137458"), true)))) {
            if (stryMutAct_9fa48("137459")) {
              {}
            } else {
              stryCov_9fa48("137459");
              return stryMutAct_9fa48("137460") ? true : (stryCov_9fa48("137460"), false);
            }
          }
          const authoritativeCount = await this.getConcurrentRemoveCount(stryMutAct_9fa48("137461") ? {} : (stryCov_9fa48("137461"), {
            preferAuthoritativeRead: stryMutAct_9fa48("137462") ? false : (stryCov_9fa48("137462"), true)
          }));
          if (stryMutAct_9fa48("137465") ? authoritativeCount !== NUM.ZERO : stryMutAct_9fa48("137464") ? false : stryMutAct_9fa48("137463") ? true : (stryCov_9fa48("137463", "137464", "137465"), authoritativeCount === NUM.ZERO)) {
            if (stryMutAct_9fa48("137466")) {
              {}
            } else {
              stryCov_9fa48("137466");
              this.markEmptyIncompleteOperationQueryAt();
            }
          } else {
            if (stryMutAct_9fa48("137467")) {
              {}
            } else {
              stryCov_9fa48("137467");
              this.clearEmptyIncompleteOperationQueryDelay();
            }
          }
          return stryMutAct_9fa48("137471") ? authoritativeCount >= this.config.maxConcurrentRemoves : stryMutAct_9fa48("137470") ? authoritativeCount <= this.config.maxConcurrentRemoves : stryMutAct_9fa48("137469") ? false : stryMutAct_9fa48("137468") ? true : (stryCov_9fa48("137468", "137469", "137470", "137471"), authoritativeCount < this.config.maxConcurrentRemoves);
        }
      }
      const bypassEmptyQueryDelay = stryMutAct_9fa48("137474") ? options?.bypassEmptyQueryDelay !== true : stryMutAct_9fa48("137473") ? false : stryMutAct_9fa48("137472") ? true : (stryCov_9fa48("137472", "137473", "137474"), (stryMutAct_9fa48("137475") ? options.bypassEmptyQueryDelay : (stryCov_9fa48("137475"), options?.bypassEmptyQueryDelay)) === (stryMutAct_9fa48("137476") ? false : (stryCov_9fa48("137476"), true)));
      if (stryMutAct_9fa48("137479") ? !bypassEmptyQueryDelay || this.shouldDelayEmptyIncompleteOperationQuery() : stryMutAct_9fa48("137478") ? false : stryMutAct_9fa48("137477") ? true : (stryCov_9fa48("137477", "137478", "137479"), (stryMutAct_9fa48("137480") ? bypassEmptyQueryDelay : (stryCov_9fa48("137480"), !bypassEmptyQueryDelay)) && this.shouldDelayEmptyIncompleteOperationQuery())) {
        if (stryMutAct_9fa48("137481")) {
          {}
        } else {
          stryCov_9fa48("137481");
          return stryMutAct_9fa48("137482") ? true : (stryCov_9fa48("137482"), false);
        }
      }
      const count = await this.getConcurrentRemoveCount();
      if (stryMutAct_9fa48("137485") ? count !== NUM.ZERO : stryMutAct_9fa48("137484") ? false : stryMutAct_9fa48("137483") ? true : (stryCov_9fa48("137483", "137484", "137485"), count === NUM.ZERO)) {
        if (stryMutAct_9fa48("137486")) {
          {}
        } else {
          stryCov_9fa48("137486");
          this.markEmptyIncompleteOperationQueryAt();
        }
      } else {
        if (stryMutAct_9fa48("137487")) {
          {}
        } else {
          stryCov_9fa48("137487");
          this.clearEmptyIncompleteOperationQueryDelay();
        }
      }
      return stryMutAct_9fa48("137491") ? count >= this.config.maxConcurrentRemoves : stryMutAct_9fa48("137490") ? count <= this.config.maxConcurrentRemoves : stryMutAct_9fa48("137489") ? false : stryMutAct_9fa48("137488") ? true : (stryCov_9fa48("137488", "137489", "137490", "137491"), count < this.config.maxConcurrentRemoves);
    }
  }

  /**
   * Delay authoritative empty-owner scans until the cache has had one bounded
   * chance to observe local replica_operations rows. An empty cache is not
   * proof of zero operations; it is only a reason to wait briefly.
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  shouldDelayEmptyIncompleteOperationQuery(now = Date.now()) {
    if (stryMutAct_9fa48("137492")) {
      {}
    } else {
      stryCov_9fa48("137492");
      const wfOwner = this.workflowOwner;
      if (stryMutAct_9fa48("137495") ? !wfOwner && wfOwner.incompleteOperationQueryEmptyBackoffMs <= NUM.ZERO : stryMutAct_9fa48("137494") ? false : stryMutAct_9fa48("137493") ? true : (stryCov_9fa48("137493", "137494", "137495"), (stryMutAct_9fa48("137496") ? wfOwner : (stryCov_9fa48("137496"), !wfOwner)) || (stryMutAct_9fa48("137499") ? wfOwner.incompleteOperationQueryEmptyBackoffMs > NUM.ZERO : stryMutAct_9fa48("137498") ? wfOwner.incompleteOperationQueryEmptyBackoffMs < NUM.ZERO : stryMutAct_9fa48("137497") ? false : (stryCov_9fa48("137497", "137498", "137499"), wfOwner.incompleteOperationQueryEmptyBackoffMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("137500")) {
          {}
        } else {
          stryCov_9fa48("137500");
          return stryMutAct_9fa48("137501") ? true : (stryCov_9fa48("137501"), false);
        }
      }
      if (stryMutAct_9fa48("137505") ? wfOwner.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO : stryMutAct_9fa48("137504") ? wfOwner.lastEmptyIncompleteOperationQueryAtMs < NUM.ZERO : stryMutAct_9fa48("137503") ? false : stryMutAct_9fa48("137502") ? true : (stryCov_9fa48("137502", "137503", "137504", "137505"), wfOwner.lastEmptyIncompleteOperationQueryAtMs <= NUM.ZERO)) {
        if (stryMutAct_9fa48("137506")) {
          {}
        } else {
          stryCov_9fa48("137506");
          wfOwner.lastEmptyIncompleteOperationQueryAtMs = now;
          return stryMutAct_9fa48("137507") ? false : (stryCov_9fa48("137507"), true);
        }
      }
      if (stryMutAct_9fa48("137511") ? now - wfOwner.lastEmptyIncompleteOperationQueryAtMs >= wfOwner.incompleteOperationQueryEmptyBackoffMs : stryMutAct_9fa48("137510") ? now - wfOwner.lastEmptyIncompleteOperationQueryAtMs <= wfOwner.incompleteOperationQueryEmptyBackoffMs : stryMutAct_9fa48("137509") ? false : stryMutAct_9fa48("137508") ? true : (stryCov_9fa48("137508", "137509", "137510", "137511"), (stryMutAct_9fa48("137512") ? now + wfOwner.lastEmptyIncompleteOperationQueryAtMs : (stryCov_9fa48("137512"), now - wfOwner.lastEmptyIncompleteOperationQueryAtMs)) < wfOwner.incompleteOperationQueryEmptyBackoffMs)) {
        if (stryMutAct_9fa48("137513")) {
          {}
        } else {
          stryCov_9fa48("137513");
          return stryMutAct_9fa48("137514") ? false : (stryCov_9fa48("137514"), true);
        }
      }
      wfOwner.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
      return stryMutAct_9fa48("137515") ? true : (stryCov_9fa48("137515"), false);
    }
  }

  /**
   * Record one bounded empty-owner scan observation timestamp.
   * @param {number} [now=Date.now()]
   * @return {void}
   * @private
   */
  markEmptyIncompleteOperationQueryAt(now = Date.now()) {
    if (stryMutAct_9fa48("137516")) {
      {}
    } else {
      stryCov_9fa48("137516");
      if (stryMutAct_9fa48("137518") ? false : stryMutAct_9fa48("137517") ? true : (stryCov_9fa48("137517", "137518"), this.workflowOwner)) {
        if (stryMutAct_9fa48("137519")) {
          {}
        } else {
          stryCov_9fa48("137519");
          this.workflowOwner.lastEmptyIncompleteOperationQueryAtMs = now;
        }
      }
    }
  }

  /**
   * Clear bounded empty-owner scan deferral once local work is observed.
   * @return {void}
   * @private
   */
  clearEmptyIncompleteOperationQueryDelay() {
    if (stryMutAct_9fa48("137520")) {
      {}
    } else {
      stryCov_9fa48("137520");
      if (stryMutAct_9fa48("137522") ? false : stryMutAct_9fa48("137521") ? true : (stryCov_9fa48("137521", "137522"), this.workflowOwner)) {
        if (stryMutAct_9fa48("137523")) {
          {}
        } else {
          stryCov_9fa48("137523");
          this.workflowOwner.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
        }
      }
    }
  }

  /**
   * Return true when the local router reports bounded outbound pressure and
   * non-critical scheduling should reuse existing observations instead of
   * issuing more routed control-plane reads.
   * @return {boolean}
   * @private
   */
  isLocalRouterBackpressured(options = {}) {
    if (stryMutAct_9fa48("137524")) {
      {}
    } else {
      stryCov_9fa48("137524");
      return stryMutAct_9fa48("137527") ? this.getLocalRouterPressureDecision(options).action === PRESSURE_GOVERNOR_ACTION.ALLOW : stryMutAct_9fa48("137526") ? false : stryMutAct_9fa48("137525") ? true : (stryCov_9fa48("137525", "137526", "137527"), this.getLocalRouterPressureDecision(options).action !== PRESSURE_GOVERNOR_ACTION.ALLOW);
    }
  }

  /**
   * Resolve one canonical local transport-pressure decision for coordinator
   * admission reads.
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  getLocalRouterPressureDecision(options = {}) {
    if (stryMutAct_9fa48("137528")) {
      {}
    } else {
      stryCov_9fa48("137528");
      const partitionId = stryMutAct_9fa48("137529") ? String(options.partitionId || '') : (stryCov_9fa48("137529"), String(stryMutAct_9fa48("137532") ? options.partitionId && '' : stryMutAct_9fa48("137531") ? false : stryMutAct_9fa48("137530") ? true : (stryCov_9fa48("137530", "137531", "137532"), options.partitionId || (stryMutAct_9fa48("137533") ? "Stryker was here!" : (stryCov_9fa48("137533"), '')))).trim());
      const criticalPressureBypass = stryMutAct_9fa48("137536") ? partitionId.length > NUM.ZERO || this.isPriorityControlPlanePartition(partitionId) : stryMutAct_9fa48("137535") ? false : stryMutAct_9fa48("137534") ? true : (stryCov_9fa48("137534", "137535", "137536"), (stryMutAct_9fa48("137539") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("137538") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("137537") ? true : (stryCov_9fa48("137537", "137538", "137539"), partitionId.length > NUM.ZERO)) && this.isPriorityControlPlanePartition(partitionId));
      return PressureGovernor.getShared(stryMutAct_9fa48("137540") ? {} : (stryCov_9fa48("137540"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter
      })).evaluate(stryMutAct_9fa48("137541") ? {} : (stryCov_9fa48("137541"), {
        workClass: criticalPressureBypass ? PRESSURE_WORK_CLASS.CRITICAL : PRESSURE_WORK_CLASS.BACKGROUND,
        resourceKeys: stryMutAct_9fa48("137542") ? [] : (stryCov_9fa48("137542"), [criticalPressureBypass ? stryMutAct_9fa48("137543") ? "" : (stryCov_9fa48("137543"), 'control-plane:rebalancer:operations') : stryMutAct_9fa48("137544") ? "" : (stryCov_9fa48("137544"), 'rebalancer:operations')])
      }));
    }
  }

  /**
   * Log one replica-operation query failure with severity aligned to whether
   * the control plane requested deferral/retry.
   * @param {Error|Object} error
   * @param {Object} [context={}]
   * @private
   */
  logQueryOperationsFailure(error, context = {}) {
    if (stryMutAct_9fa48("137545")) {
      {}
    } else {
      stryCov_9fa48("137545");
      const participantFailures = Array.isArray(stryMutAct_9fa48("137546") ? error.participantFailures : (stryCov_9fa48("137546"), error?.participantFailures)) ? stryMutAct_9fa48("137548") ? error.participantFailures.slice(NUM.ZERO, NUM.THREE) : stryMutAct_9fa48("137547") ? error.participantFailures.filter(entry => entry && typeof entry === 'object') : (stryCov_9fa48("137547", "137548"), error.participantFailures.filter(stryMutAct_9fa48("137549") ? () => undefined : (stryCov_9fa48("137549"), entry => stryMutAct_9fa48("137552") ? entry || typeof entry === 'object' : stryMutAct_9fa48("137551") ? false : stryMutAct_9fa48("137550") ? true : (stryCov_9fa48("137550", "137551", "137552"), entry && (stryMutAct_9fa48("137554") ? typeof entry !== 'object' : stryMutAct_9fa48("137553") ? true : (stryCov_9fa48("137553", "137554"), typeof entry === (stryMutAct_9fa48("137555") ? "" : (stryCov_9fa48("137555"), 'object'))))))).slice(NUM.ZERO, NUM.THREE)) : stryMutAct_9fa48("137556") ? ["Stryker was here"] : (stryCov_9fa48("137556"), []);
      const firstFailedParticipant = (stryMutAct_9fa48("137559") ? error?.firstFailedParticipant || typeof error.firstFailedParticipant === 'object' : stryMutAct_9fa48("137558") ? false : stryMutAct_9fa48("137557") ? true : (stryCov_9fa48("137557", "137558", "137559"), (stryMutAct_9fa48("137560") ? error.firstFailedParticipant : (stryCov_9fa48("137560"), error?.firstFailedParticipant)) && (stryMutAct_9fa48("137562") ? typeof error.firstFailedParticipant !== 'object' : stryMutAct_9fa48("137561") ? true : (stryCov_9fa48("137561", "137562"), typeof error.firstFailedParticipant === (stryMutAct_9fa48("137563") ? "" : (stryCov_9fa48("137563"), 'object')))))) ? error.firstFailedParticipant : (stryMutAct_9fa48("137567") ? participantFailures.length <= NUM.ZERO : stryMutAct_9fa48("137566") ? participantFailures.length >= NUM.ZERO : stryMutAct_9fa48("137565") ? false : stryMutAct_9fa48("137564") ? true : (stryCov_9fa48("137564", "137565", "137566", "137567"), participantFailures.length > NUM.ZERO)) ? participantFailures[NUM.ZERO] : null;
      const tableName = (stryMutAct_9fa48("137570") ? typeof error?.tableName === 'string' || error.tableName.length > NUM.ZERO : stryMutAct_9fa48("137569") ? false : stryMutAct_9fa48("137568") ? true : (stryCov_9fa48("137568", "137569", "137570"), (stryMutAct_9fa48("137572") ? typeof error?.tableName !== 'string' : stryMutAct_9fa48("137571") ? true : (stryCov_9fa48("137571", "137572"), typeof (stryMutAct_9fa48("137573") ? error.tableName : (stryCov_9fa48("137573"), error?.tableName)) === (stryMutAct_9fa48("137574") ? "" : (stryCov_9fa48("137574"), 'string')))) && (stryMutAct_9fa48("137577") ? error.tableName.length <= NUM.ZERO : stryMutAct_9fa48("137576") ? error.tableName.length >= NUM.ZERO : stryMutAct_9fa48("137575") ? true : (stryCov_9fa48("137575", "137576", "137577"), error.tableName.length > NUM.ZERO)))) ? error.tableName : (stryMutAct_9fa48("137580") ? typeof firstFailedParticipant?.failedTable !== 'string' : stryMutAct_9fa48("137579") ? false : stryMutAct_9fa48("137578") ? true : (stryCov_9fa48("137578", "137579", "137580"), typeof (stryMutAct_9fa48("137581") ? firstFailedParticipant.failedTable : (stryCov_9fa48("137581"), firstFailedParticipant?.failedTable)) === (stryMutAct_9fa48("137582") ? "" : (stryCov_9fa48("137582"), 'string')))) ? firstFailedParticipant.failedTable : null;
      const payload = stryMutAct_9fa48("137583") ? {} : (stryCov_9fa48("137583"), {
        ...context,
        queryDurationMs: Number.isFinite(stryMutAct_9fa48("137584") ? context.queryDurationMs : (stryCov_9fa48("137584"), context?.queryDurationMs)) ? stryMutAct_9fa48("137585") ? Math.min(NUM.ZERO, Math.floor(context.queryDurationMs)) : (stryCov_9fa48("137585"), Math.max(NUM.ZERO, Math.floor(context.queryDurationMs))) : null,
        rowCount: Number.isFinite(stryMutAct_9fa48("137586") ? context.rowCount : (stryCov_9fa48("137586"), context?.rowCount)) ? stryMutAct_9fa48("137587") ? Math.min(NUM.ZERO, Math.floor(context.rowCount)) : (stryCov_9fa48("137587"), Math.max(NUM.ZERO, Math.floor(context.rowCount))) : null,
        backpressured: (stryMutAct_9fa48("137590") ? typeof context?.backpressured !== 'boolean' : stryMutAct_9fa48("137589") ? false : stryMutAct_9fa48("137588") ? true : (stryCov_9fa48("137588", "137589", "137590"), typeof (stryMutAct_9fa48("137591") ? context.backpressured : (stryCov_9fa48("137591"), context?.backpressured)) === (stryMutAct_9fa48("137592") ? "" : (stryCov_9fa48("137592"), 'boolean')))) ? context.backpressured : (stryMutAct_9fa48("137595") ? typeof this.isLocalRouterBackpressured !== 'function' : stryMutAct_9fa48("137594") ? false : stryMutAct_9fa48("137593") ? true : (stryCov_9fa48("137593", "137594", "137595"), typeof this.isLocalRouterBackpressured === (stryMutAct_9fa48("137596") ? "" : (stryCov_9fa48("137596"), 'function')))) ? this.isLocalRouterBackpressured() : stryMutAct_9fa48("137597") ? true : (stryCov_9fa48("137597"), false),
        error: stryMutAct_9fa48("137600") ? (error?.message || error?.error) && null : stryMutAct_9fa48("137599") ? false : stryMutAct_9fa48("137598") ? true : (stryCov_9fa48("137598", "137599", "137600"), (stryMutAct_9fa48("137602") ? error?.message && error?.error : stryMutAct_9fa48("137601") ? false : (stryCov_9fa48("137601", "137602"), (stryMutAct_9fa48("137603") ? error.message : (stryCov_9fa48("137603"), error?.message)) || (stryMutAct_9fa48("137604") ? error.error : (stryCov_9fa48("137604"), error?.error)))) || null),
        nodeId: this.nodeId,
        code: stryMutAct_9fa48("137607") ? getControlPlaneErrorCode(error) && null : stryMutAct_9fa48("137606") ? false : stryMutAct_9fa48("137605") ? true : (stryCov_9fa48("137605", "137606", "137607"), getControlPlaneErrorCode(error) || null),
        retryAfterMs: getControlPlaneRetryAfterMs(error),
        tableName,
        participantFailures,
        firstFailedParticipant
      });
      if (stryMutAct_9fa48("137609") ? false : stryMutAct_9fa48("137608") ? true : (stryCov_9fa48("137608", "137609"), isRetryableControlPlaneError(error))) {
        if (stryMutAct_9fa48("137610")) {
          {}
        } else {
          stryCov_9fa48("137610");
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, payload);
          return;
        }
      }
      this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, payload);
    }
  }

  /**
   * Get coordinator statistics.
   *
   * @return {Promise<Object>} Statistics object.
   */
  async getStats() {
    if (stryMutAct_9fa48("137611")) {
      {}
    } else {
      stryCov_9fa48("137611");
      const inFlightOps = await this.getInFlightOperations();
      const allOps = await this.getAllOperations();
      return stryMutAct_9fa48("137612") ? {} : (stryCov_9fa48("137612"), {
        ...this.stats,
        inFlightOperations: inFlightOps.length,
        totalOperations: allOps.length
      });
    }
  }

  /**
   * Shutdown the coordinator.
   *
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("137613")) {
      {}
    } else {
      stryCov_9fa48("137613");
      if (stryMutAct_9fa48("137615") ? false : stryMutAct_9fa48("137614") ? true : (stryCov_9fa48("137614", "137615"), this.isShuttingDown)) {
        if (stryMutAct_9fa48("137616")) {
          {}
        } else {
          stryCov_9fa48("137616");
          return;
        }
      }
      this.isShuttingDown = stryMutAct_9fa48("137617") ? false : (stryCov_9fa48("137617"), true);
      this.initialized = stryMutAct_9fa48("137618") ? true : (stryCov_9fa48("137618"), false);
      this.stopTimeoutChecking();

      // Unsubscribe from executor outcome events.
      if (stryMutAct_9fa48("137621") ? this._boundOutcomeHandler || this.executorOutcomeEmitter : stryMutAct_9fa48("137620") ? false : stryMutAct_9fa48("137619") ? true : (stryCov_9fa48("137619", "137620", "137621"), this._boundOutcomeHandler && this.executorOutcomeEmitter)) {
        if (stryMutAct_9fa48("137622")) {
          {}
        } else {
          stryCov_9fa48("137622");
          this.executorOutcomeEmitter.removeListener(OUTCOME_EVENT_NAME, this._boundOutcomeHandler);
          this._boundOutcomeHandler = null;
        }
      }
      if (stryMutAct_9fa48("137625") ? this.cacheChangeListener || typeof this.systemTableCache?.offCacheChange === 'function' : stryMutAct_9fa48("137624") ? false : stryMutAct_9fa48("137623") ? true : (stryCov_9fa48("137623", "137624", "137625"), this.cacheChangeListener && (stryMutAct_9fa48("137627") ? typeof this.systemTableCache?.offCacheChange !== 'function' : stryMutAct_9fa48("137626") ? true : (stryCov_9fa48("137626", "137627"), typeof (stryMutAct_9fa48("137628") ? this.systemTableCache.offCacheChange : (stryCov_9fa48("137628"), this.systemTableCache?.offCacheChange)) === (stryMutAct_9fa48("137629") ? "" : (stryCov_9fa48("137629"), 'function')))))) {
        if (stryMutAct_9fa48("137630")) {
          {}
        } else {
          stryCov_9fa48("137630");
          this.unbindSystemTableCacheListener();
          this.cacheChangeListener = null;
        }
      }
      if (stryMutAct_9fa48("137632") ? false : stryMutAct_9fa48("137631") ? true : (stryCov_9fa48("137631", "137632"), this._boundTerminalOperationIntentPruner)) {
        if (stryMutAct_9fa48("137633")) {
          {}
        } else {
          stryCov_9fa48("137633");
          this.unbindTerminalOperationIntentPruner();
          this._boundTerminalOperationIntentPruner = null;
        }
      }
      let inFlightOperationCount = NUM.ZERO;
      try {
        if (stryMutAct_9fa48("137634")) {
          {}
        } else {
          stryCov_9fa48("137634");
          const inFlightOps = await this.getInFlightOperations();
          inFlightOperationCount = inFlightOps.length;
        }
      } catch (error) {
        if (stryMutAct_9fa48("137635")) {
          {}
        } else {
          stryCov_9fa48("137635");
          this.logger.debug(stryMutAct_9fa48("137636") ? "" : (stryCov_9fa48("137636"), 'Skipping in-flight operation count during coordinator shutdown'), stryMutAct_9fa48("137637") ? {} : (stryCov_9fa48("137637"), {
            nodeId: this.nodeId,
            error: error.message
          }));
        }
      }
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.SHUTDOWN, stryMutAct_9fa48("137638") ? {} : (stryCov_9fa48("137638"), {
        nodeId: this.nodeId,
        inFlightOperations: inFlightOperationCount
      }));
      this.operationsInCreation.clear();
      this.recentOperationIntents.clear();
      if (stryMutAct_9fa48("137641") ? typeof this.workflowOwner?.shutdown !== 'function' : stryMutAct_9fa48("137640") ? false : stryMutAct_9fa48("137639") ? true : (stryCov_9fa48("137639", "137640", "137641"), typeof (stryMutAct_9fa48("137642") ? this.workflowOwner.shutdown : (stryCov_9fa48("137642"), this.workflowOwner?.shutdown)) === (stryMutAct_9fa48("137643") ? "" : (stryCov_9fa48("137643"), 'function')))) {
        if (stryMutAct_9fa48("137644")) {
          {}
        } else {
          stryCov_9fa48("137644");
          this.workflowOwner.shutdown();
        }
      }
      this.emit(REBALANCE_COORDINATOR_EVENT.SHUTDOWN);
    }
  }
}
export { RebalanceCoordinator };