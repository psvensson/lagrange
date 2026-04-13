/**
 * ReplicaDispatchService - Replica operation dispatch and message
 * forwarding. Extracted from ControlPlaneService.
 * Requirements: 8.5, 8.6
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
import { compareNodeHeartbeatWatermarks, getNodeHeartbeatWatermark, wasNodeRecordReadyWhenWritten } from '../node/node-readiness-policy.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from './control-plane-readiness-constants.js';
import { ControlPlaneReadinessService } from './control-plane-readiness-service.js';
import { getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from './control-plane-error-classification.js';
import { createControlPlaneRuntimeBundle } from './control-plane-runtime-bundle.js';
import { OperationType, OPERATION_METADATA_KEY, getOperationMetadataObject, getOperationMetadataStringArray, isCoordinatorOwnedOperationType } from '../rebalancer/replica-status.js';
import { ReplicaOperationField } from '../rebalancer/replica-operation-constants.js';
import { REBALANCE_COORDINATOR_EVENT } from '../rebalancer/rebalancer-constants.js';
import { COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, STATE, STRING, TYPEOF, WORKFLOW_STEP } from '../constants/index.js';
import { assertCritical } from '../utils/assert.js';
import { ControlPlaneMessageType, ControlPlaneField, CONTROL_PLANE_ALLOWED_STATES, CONTROL_PLANE_CONFIG_KEY, DEFAULT_READY_LEASE_MS, CONTROL_PLANE_EVENT, getControlPlaneMessageRequiredTables } from './control-plane-constants.js';
import { DISPATCH_ERROR_MSG, DISPATCH_DEFAULT, DISPATCH_EVENT, DISPATCH_LOG_MSG, DISPATCH_QUEUE_NAME, DISPATCH_STATE, DISPATCH_SUBSYSTEM } from './replica-dispatch-service-constants.js';
import { PRESSURE_WORK_CLASS } from './pressure-governor.js';
import { unwrapRowReadResult } from './owners/system-metadata-owner-base.js';
import { shouldUseAuthoritativePriorityRecoveryRediscovery } from './priority-recovery-snapshot.js';
import { OwnerKeyReconcileQueue } from '../workflow/owner-key-reconcile-queue.js';
import { RECONCILE_REASON } from '../workflow/reconcile-queue-constants.js';
const REPLICA_DISPATCH_SERVICE_LITERAL = Object.freeze(stryMutAct_9fa48("72467") ? {} : (stryCov_9fa48("72467"), {
  AUTHORITATIVE: stryMutAct_9fa48("72468") ? "" : (stryCov_9fa48("72468"), "authoritative"),
  AUTHORITATIVE_PRIORITY_RECOVERY_RETRY: stryMutAct_9fa48("72469") ? "" : (stryCov_9fa48("72469"), "authoritative_priority_recovery_retry"),
  BACKGROUND: stryMutAct_9fa48("72470") ? "" : (stryCov_9fa48("72470"), "background"),
  CLOSED: stryMutAct_9fa48("72471") ? "" : (stryCov_9fa48("72471"), "closed"),
  CONNECTION_TO_NODE: stryMutAct_9fa48("72472") ? "" : (stryCov_9fa48("72472"), "Connection to node"),
  CONTROL_PLANE_READINESS_REFRESH_TIMEOUT: stryMutAct_9fa48("72473") ? "" : (stryCov_9fa48("72473"), "CONTROL_PLANE_READINESS_REFRESH_TIMEOUT"),
  COORDINATOR_DOT_EVENT: stryMutAct_9fa48("72474") ? "" : (stryCov_9fa48("72474"), "coordinator.event"),
  CRITICAL: stryMutAct_9fa48("72475") ? "" : (stryCov_9fa48("72475"), "critical"),
  DEFERRED_RETRY_PENDING: stryMutAct_9fa48("72476") ? "" : (stryCov_9fa48("72476"), "deferred_retry_pending"),
  DELETE: stryMutAct_9fa48("72477") ? "" : (stryCov_9fa48("72477"), "DELETE"),
  DISPATCH_UNSUCCESSFUL: stryMutAct_9fa48("72478") ? "" : (stryCov_9fa48("72478"), "dispatch_unsuccessful"),
  DUPLICATE_READY_TRIGGER: stryMutAct_9fa48("72479") ? "" : (stryCov_9fa48("72479"), "duplicate_ready_trigger"),
  EMPTY_STRING: stryMutAct_9fa48("72480") ? "Stryker was here!" : (stryCov_9fa48("72480"), ""),
  ERROR: stryMutAct_9fa48("72481") ? "" : (stryCov_9fa48("72481"), "error"),
  FAILED_TO_FORWARD_WRITE_TO_LEADER: stryMutAct_9fa48("72482") ? "" : (stryCov_9fa48("72482"), "Failed to forward write to leader"),
  FOUR: 4,
  MEMBERSHIP_PUBLICATION_OWNER_DISPATCH_RETRY: stryMutAct_9fa48("72483") ? "" : (stryCov_9fa48("72483"), "membership_publication_owner_dispatch_retry"),
  MESSAGE_DASH_GROUP_INGRESS_READINESS_UNAVAILABLE: stryMutAct_9fa48("72484") ? "" : (stryCov_9fa48("72484"), "message-group ingress readiness unavailable"),
  MESSAGE_TIMEOUT: stryMutAct_9fa48("72485") ? "" : (stryCov_9fa48("72485"), "Message timeout"),
  NO_CONNECTION_TO_NODE: stryMutAct_9fa48("72486") ? "" : (stryCov_9fa48("72486"), "No connection to node"),
  NODE_ROW_MISSING: stryMutAct_9fa48("72487") ? "" : (stryCov_9fa48("72487"), "NODE_ROW_MISSING"),
  NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED: stryMutAct_9fa48("72488") ? "" : (stryCov_9fa48("72488"), "NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED"),
  QUERY_ROUTING_FAILED: stryMutAct_9fa48("72489") ? "" : (stryCov_9fa48("72489"), "Query routing failed"),
  REPLICADISPATCHSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY: stryMutAct_9fa48("72490") ? "" : (stryCov_9fa48("72490"), "ReplicaDispatchService requires controlPlaneSystemTableGateway"),
  SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK: stryMutAct_9fa48("72491") ? "" : (stryCov_9fa48("72491"), "SELECT * FROM nodes WHERE node_id = ?"),
  SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK: stryMutAct_9fa48("72492") ? "" : (stryCov_9fa48("72492"), "SELECT * FROM replica_operations WHERE operation_id = ?"),
  STALE_AGAINST_EXISTING_ROW: stryMutAct_9fa48("72493") ? "" : (stryCov_9fa48("72493"), "stale_against_existing_row"),
  STALE_OR_DUPLICATE_ENQUEUE: stryMutAct_9fa48("72494") ? "" : (stryCov_9fa48("72494"), "stale_or_duplicate_enqueue"),
  TARGET_NODE_NOT_READY: stryMutAct_9fa48("72495") ? "" : (stryCov_9fa48("72495"), "target_node_not_ready"),
  THIRTY_ONE: 31,
  UNKNOWN: stryMutAct_9fa48("72496") ? "" : (stryCov_9fa48("72496"), "unknown"),
  UNSUPPORTED_DISPATCH_CONTROL_MESSAGE: stryMutAct_9fa48("72497") ? "" : (stryCov_9fa48("72497"), "unsupported_dispatch_control_message"),
  ZERO: 0
}));
const DISPATCH_READINESS_ERROR_CODE = Object.freeze(stryMutAct_9fa48("72498") ? {} : (stryCov_9fa48("72498"), {
  TARGET_NODE_NOT_READY: stryMutAct_9fa48("72499") ? "" : (stryCov_9fa48("72499"), 'TARGET_NODE_NOT_READY'),
  TARGET_NODE_READINESS_REFRESH_FAILED: stryMutAct_9fa48("72500") ? "" : (stryCov_9fa48("72500"), 'TARGET_NODE_READINESS_REFRESH_FAILED')
}));
const DISPATCH_READINESS_ERROR_REASON = Object.freeze(stryMutAct_9fa48("72501") ? {} : (stryCov_9fa48("72501"), {
  AUTHORITATIVE_NODE_ROW_VISIBILITY_LAG: stryMutAct_9fa48("72502") ? "" : (stryCov_9fa48("72502"), 'authoritative_node_row_visibility_lag'),
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE: stryMutAct_9fa48("72503") ? "" : (stryCov_9fa48("72503"), 'authoritative_row_source_unavailable'),
  TARGET_NODE_READINESS_REFRESH_FAILED: stryMutAct_9fa48("72504") ? "" : (stryCov_9fa48("72504"), 'target_node_readiness_refresh_failed'),
  UNKNOWN: stryMutAct_9fa48("72505") ? "" : (stryCov_9fa48("72505"), 'unknown_error')
}));
const DISPATCH_READINESS_MESSAGE = Object.freeze(stryMutAct_9fa48("72506") ? {} : (stryCov_9fa48("72506"), {
  CONTROL_PLANE_LEADER_NOT_READY: stryMutAct_9fa48("72507") ? "" : (stryCov_9fa48("72507"), 'Control-plane leader is not ready')
}));
class ReplicaDispatchService extends EventEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.messageRouter - MessageRouter instance.
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.rebalanceCoordinator - Rebalance coordinator.
   * @param {Object} [options.storageAccountingService] - Storage accounting owner.
   * @param {Object} [options.cdcGroupPropagationService] - CDC publication owner.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("72508")) {
      {}
    } else {
      stryCov_9fa48("72508");
      super();
      this.nodeId = stryMutAct_9fa48("72511") ? options.nodeId && null : stryMutAct_9fa48("72510") ? false : stryMutAct_9fa48("72509") ? true : (stryCov_9fa48("72509", "72510", "72511"), options.nodeId || null);
      this.messageRouter = stryMutAct_9fa48("72514") ? options.messageRouter && null : stryMutAct_9fa48("72513") ? false : stryMutAct_9fa48("72512") ? true : (stryCov_9fa48("72512", "72513", "72514"), options.messageRouter || null);
      this.cdcIntegrationService = stryMutAct_9fa48("72517") ? options.cdcIntegrationService && null : stryMutAct_9fa48("72516") ? false : stryMutAct_9fa48("72515") ? true : (stryCov_9fa48("72515", "72516", "72517"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("72520") ? options.controlPlaneSystemTableGateway && (this.cdcIntegrationService || options.sqlQueryEngine || options.systemTableCache || this.messageRouter ? createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        sqlQueryEngine: options.sqlQueryEngine || null,
        systemTableCache: options.systemTableCache || null,
        messageRouter: this.messageRouter
      }).controlPlaneSystemTableGateway : null) : stryMutAct_9fa48("72519") ? false : stryMutAct_9fa48("72518") ? true : (stryCov_9fa48("72518", "72519", "72520"), options.controlPlaneSystemTableGateway || ((stryMutAct_9fa48("72523") ? (this.cdcIntegrationService || options.sqlQueryEngine || options.systemTableCache) && this.messageRouter : stryMutAct_9fa48("72522") ? false : stryMutAct_9fa48("72521") ? true : (stryCov_9fa48("72521", "72522", "72523"), (stryMutAct_9fa48("72525") ? (this.cdcIntegrationService || options.sqlQueryEngine) && options.systemTableCache : stryMutAct_9fa48("72524") ? false : (stryCov_9fa48("72524", "72525"), (stryMutAct_9fa48("72527") ? this.cdcIntegrationService && options.sqlQueryEngine : stryMutAct_9fa48("72526") ? false : (stryCov_9fa48("72526", "72527"), this.cdcIntegrationService || options.sqlQueryEngine)) || options.systemTableCache)) || this.messageRouter)) ? createControlPlaneRuntimeBundle(stryMutAct_9fa48("72528") ? {} : (stryCov_9fa48("72528"), {
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        sqlQueryEngine: stryMutAct_9fa48("72531") ? options.sqlQueryEngine && null : stryMutAct_9fa48("72530") ? false : stryMutAct_9fa48("72529") ? true : (stryCov_9fa48("72529", "72530", "72531"), options.sqlQueryEngine || null),
        systemTableCache: stryMutAct_9fa48("72534") ? options.systemTableCache && null : stryMutAct_9fa48("72533") ? false : stryMutAct_9fa48("72532") ? true : (stryCov_9fa48("72532", "72533", "72534"), options.systemTableCache || null),
        messageRouter: this.messageRouter
      })).controlPlaneSystemTableGateway : null));
      this.systemTableCache = stryMutAct_9fa48("72537") ? options.systemTableCache && null : stryMutAct_9fa48("72536") ? false : stryMutAct_9fa48("72535") ? true : (stryCov_9fa48("72535", "72536", "72537"), options.systemTableCache || null);
      this.nodesOwner = stryMutAct_9fa48("72540") ? options.nodesOwner && null : stryMutAct_9fa48("72539") ? false : stryMutAct_9fa48("72538") ? true : (stryCov_9fa48("72538", "72539", "72540"), options.nodesOwner || null);
      this.servicesOwner = stryMutAct_9fa48("72543") ? options.servicesOwner && null : stryMutAct_9fa48("72542") ? false : stryMutAct_9fa48("72541") ? true : (stryCov_9fa48("72541", "72542", "72543"), options.servicesOwner || null);
      this.replicaOperationsOwner = stryMutAct_9fa48("72546") ? options.replicaOperationsOwner && null : stryMutAct_9fa48("72545") ? false : stryMutAct_9fa48("72544") ? true : (stryCov_9fa48("72544", "72545", "72546"), options.replicaOperationsOwner || null);
      this.rebalanceCoordinator = stryMutAct_9fa48("72549") ? options.rebalanceCoordinator && null : stryMutAct_9fa48("72548") ? false : stryMutAct_9fa48("72547") ? true : (stryCov_9fa48("72547", "72548", "72549"), options.rebalanceCoordinator || null);
      this.storageAccountingService = stryMutAct_9fa48("72552") ? (options.storageAccountingService || this.rebalanceCoordinator?.storageAccountingService) && null : stryMutAct_9fa48("72551") ? false : stryMutAct_9fa48("72550") ? true : (stryCov_9fa48("72550", "72551", "72552"), (stryMutAct_9fa48("72554") ? options.storageAccountingService && this.rebalanceCoordinator?.storageAccountingService : stryMutAct_9fa48("72553") ? false : (stryCov_9fa48("72553", "72554"), options.storageAccountingService || (stryMutAct_9fa48("72555") ? this.rebalanceCoordinator.storageAccountingService : (stryCov_9fa48("72555"), this.rebalanceCoordinator?.storageAccountingService)))) || null);
      this.cdcGroupPropagationService = stryMutAct_9fa48("72558") ? (options.cdcGroupPropagationService || this.rebalanceCoordinator?.cdcGroupPropagationService) && null : stryMutAct_9fa48("72557") ? false : stryMutAct_9fa48("72556") ? true : (stryCov_9fa48("72556", "72557", "72558"), (stryMutAct_9fa48("72560") ? options.cdcGroupPropagationService && this.rebalanceCoordinator?.cdcGroupPropagationService : stryMutAct_9fa48("72559") ? false : (stryCov_9fa48("72559", "72560"), options.cdcGroupPropagationService || (stryMutAct_9fa48("72561") ? this.rebalanceCoordinator.cdcGroupPropagationService : (stryCov_9fa48("72561"), this.rebalanceCoordinator?.cdcGroupPropagationService)))) || null);
      this.controlPlaneReadinessService = stryMutAct_9fa48("72564") ? options.controlPlaneReadinessService && new ControlPlaneReadinessService({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        nodesOwner: this.nodesOwner,
        servicesOwner: this.servicesOwner,
        messageRouter: this.messageRouter,
        storageAccountingService: this.storageAccountingService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway
      }) : stryMutAct_9fa48("72563") ? false : stryMutAct_9fa48("72562") ? true : (stryCov_9fa48("72562", "72563", "72564"), options.controlPlaneReadinessService || new ControlPlaneReadinessService(stryMutAct_9fa48("72565") ? {} : (stryCov_9fa48("72565"), {
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        nodesOwner: this.nodesOwner,
        servicesOwner: this.servicesOwner,
        messageRouter: this.messageRouter,
        storageAccountingService: this.storageAccountingService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway
      })));
      this.messageGroupServices = new Set();
      this.messageGroupHandlers = new Map();
      this.directDispatchServiceAddress = null;
      this.directDispatchServiceHandler = null;
      this.dispatchInFlight = new Set();
      this.retryInFlightNodes = new Set();
      this.nodeStateUpdateWatermarks = new Map();
      this.nodeReadyRetryWatermarks = new Map();
      this.dispatchFailureSignaturesByOperationId = new Map();
      this.operationDispatchDeferredRetries = new Map();
      this.nodeStateUpdateDeferredRetries = new Map();
      this.nodeStateUpdateQueueAssignments = new Map();
      this.nextNodeStateUpdateQueueIndex = NUM.ZERO;
      this.cacheChangeListener = null;
      this.coordinatorOperationCreatedListener = null;
      this.state = DISPATCH_STATE.CREATED;
      this.setTimeoutFn = (stryMutAct_9fa48("72568") ? typeof options.setTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("72567") ? false : stryMutAct_9fa48("72566") ? true : (stryCov_9fa48("72566", "72567", "72568"), typeof options.setTimeoutFn === TYPEOF.FUNCTION)) ? options.setTimeoutFn : setTimeout;
      this.clearTimeoutFn = (stryMutAct_9fa48("72571") ? typeof options.clearTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("72570") ? false : stryMutAct_9fa48("72569") ? true : (stryCov_9fa48("72569", "72570", "72571"), typeof options.clearTimeoutFn === TYPEOF.FUNCTION)) ? options.clearTimeoutFn : clearTimeout;
      const config = ConfigurationManager.getInstance();
      this.readyLeaseMs = stryMutAct_9fa48("72574") ? config.get(CONTROL_PLANE_CONFIG_KEY.READY_LEASE_MS) && DEFAULT_READY_LEASE_MS : stryMutAct_9fa48("72573") ? false : stryMutAct_9fa48("72572") ? true : (stryCov_9fa48("72572", "72573", "72574"), config.get(CONTROL_PLANE_CONFIG_KEY.READY_LEASE_MS) || DEFAULT_READY_LEASE_MS);
      this.nodeStateUpdateQueryTimeoutMs = stryMutAct_9fa48("72575") ? Math.min(NUM.ONE, Math.floor(this.readyLeaseMs / NUM.THREE)) : (stryCov_9fa48("72575"), Math.max(NUM.ONE, Math.floor(stryMutAct_9fa48("72576") ? this.readyLeaseMs * NUM.THREE : (stryCov_9fa48("72576"), this.readyLeaseMs / NUM.THREE))));
      this.nodeStateUpdateRetryAfterMs = this.normalizeNodeStateUpdateRetryAfterMs(options.nodeStateUpdateRetryAfterMs);
      this.operationDispatchRetryAfterMs = this.normalizeOperationDispatchRetryAfterMs(options.operationDispatchRetryAfterMs);
      this.operationDispatchQueueShardCount = this.normalizeOperationDispatchQueueShardCount(options.operationDispatchQueueShardCount);
      this.dispatchReadinessRefreshTimeoutMs = this.normalizeDispatchReadinessRefreshTimeoutMs(options.dispatchReadinessRefreshTimeoutMs);
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(DISPATCH_SUBSYSTEM) : console;
      this.operationDispatchQueues = Array.from(stryMutAct_9fa48("72577") ? {} : (stryCov_9fa48("72577"), {
        length: this.operationDispatchQueueShardCount
      }), (_unused, shardIndex) => {
        if (stryMutAct_9fa48("72578")) {
          {}
        } else {
          stryCov_9fa48("72578");
          return new OwnerKeyReconcileQueue(stryMutAct_9fa48("72579") ? {} : (stryCov_9fa48("72579"), {
            name: this.buildOperationDispatchQueueName(shardIndex),
            reconcileFn: stryMutAct_9fa48("72580") ? () => undefined : (stryCov_9fa48("72580"), (ownerKey, _reasons, context) => this.reconcileOperationDispatch(ownerKey, context))
          }));
        }
      });
      this.operationDispatchQueue = this.buildOperationDispatchQueueFacade();
      this.nodeStateUpdateQueueShardCount = this.normalizeNodeStateUpdateQueueShardCount(options.nodeStateUpdateQueueShardCount);
      this.nodeStateUpdateQueues = Array.from(stryMutAct_9fa48("72581") ? {} : (stryCov_9fa48("72581"), {
        length: this.nodeStateUpdateQueueShardCount
      }), (_unused, shardIndex) => {
        if (stryMutAct_9fa48("72582")) {
          {}
        } else {
          stryCov_9fa48("72582");
          return new OwnerKeyReconcileQueue(stryMutAct_9fa48("72583") ? {} : (stryCov_9fa48("72583"), {
            name: this.buildNodeStateUpdateQueueName(shardIndex),
            reconcileFn: stryMutAct_9fa48("72584") ? () => undefined : (stryCov_9fa48("72584"), (ownerKey, _reasons, context) => this.reconcileNodeStateUpdate(ownerKey, context))
          }));
        }
      });
      // Keep the first shard exposed for compatibility with existing diagnostics.
      this.nodeStateUpdateQueue = this.nodeStateUpdateQueues[NUM.ZERO];
      this.nodeReadyRetryQueue = new OwnerKeyReconcileQueue(stryMutAct_9fa48("72585") ? {} : (stryCov_9fa48("72585"), {
        name: DISPATCH_QUEUE_NAME.NODE_READY,
        reconcileFn: stryMutAct_9fa48("72586") ? () => undefined : (stryCov_9fa48("72586"), (ownerKey, _reasons, context) => this.reconcileNodeReadyRetry(ownerKey, context))
      }));
    }
  }

  /**
   * Initialize the dispatch service.
   * Transitions: CREATED → INITIALIZED
   */
  initialize() {
    if (stryMutAct_9fa48("72587")) {
      {}
    } else {
      stryCov_9fa48("72587");
      assertCritical(this.nodeId, DISPATCH_ERROR_MSG.MISSING_NODE_ID);
      assertCritical(this.messageRouter, DISPATCH_ERROR_MSG.MISSING_ROUTER);
      assertCritical(this.systemTableCache, DISPATCH_ERROR_MSG.MISSING_CACHE);
      assertCritical(stryMutAct_9fa48("72590") ? typeof this.systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("72589") ? false : stryMutAct_9fa48("72588") ? true : (stryCov_9fa48("72588", "72589", "72590"), typeof this.systemTableCache.get === TYPEOF.FUNCTION), DISPATCH_ERROR_MSG.MISSING_CACHE_GET);
      assertCritical(stryMutAct_9fa48("72593") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("72592") ? false : stryMutAct_9fa48("72591") ? true : (stryCov_9fa48("72591", "72592", "72593"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION), DISPATCH_ERROR_MSG.MISSING_CACHE_GET_ALL);
      assertCritical(this.cdcIntegrationService, DISPATCH_ERROR_MSG.MISSING_CDC);
      assertCritical(this.rebalanceCoordinator, DISPATCH_ERROR_MSG.MISSING_COORDINATOR);
      this.state = DISPATCH_STATE.INITIALIZED;
      this.logger.info(DISPATCH_LOG_MSG.INITIALIZED, stryMutAct_9fa48("72594") ? {} : (stryCov_9fa48("72594"), {
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("72597") ? this.systemTableCache || typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("72596") ? false : stryMutAct_9fa48("72595") ? true : (stryCov_9fa48("72595", "72596", "72597"), this.systemTableCache && (stryMutAct_9fa48("72599") ? typeof this.systemTableCache.onCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("72598") ? true : (stryCov_9fa48("72598", "72599"), typeof this.systemTableCache.onCacheChange === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("72600")) {
          {}
        } else {
          stryCov_9fa48("72600");
          this.cacheChangeListener = (tableName, operation, record) => {
            if (stryMutAct_9fa48("72601")) {
              {}
            } else {
              stryCov_9fa48("72601");
              this.handleCacheNodeChange(tableName, operation, record);
            }
          };
          this.systemTableCache.onCacheChange(this.cacheChangeListener);
        }
      }
      if (stryMutAct_9fa48("72604") ? this.messageRouter || typeof this.messageRouter.register === TYPEOF.FUNCTION : stryMutAct_9fa48("72603") ? false : stryMutAct_9fa48("72602") ? true : (stryCov_9fa48("72602", "72603", "72604"), this.messageRouter && (stryMutAct_9fa48("72606") ? typeof this.messageRouter.register !== TYPEOF.FUNCTION : stryMutAct_9fa48("72605") ? true : (stryCov_9fa48("72605", "72606"), typeof this.messageRouter.register === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("72607")) {
          {}
        } else {
          stryCov_9fa48("72607");
          this.directDispatchServiceAddress = this.buildDirectDispatchServiceAddress(this.nodeId);
          if (stryMutAct_9fa48("72609") ? false : stryMutAct_9fa48("72608") ? true : (stryCov_9fa48("72608", "72609"), this.directDispatchServiceAddress)) {
            if (stryMutAct_9fa48("72610")) {
              {}
            } else {
              stryCov_9fa48("72610");
              this.directDispatchServiceHandler = async (envelope = {}) => {
                if (stryMutAct_9fa48("72611")) {
                  {}
                } else {
                  stryCov_9fa48("72611");
                  const payload = stryMutAct_9fa48("72614") ? envelope?.payload && {} : stryMutAct_9fa48("72613") ? false : stryMutAct_9fa48("72612") ? true : (stryCov_9fa48("72612", "72613", "72614"), (stryMutAct_9fa48("72615") ? envelope.payload : (stryCov_9fa48("72615"), envelope?.payload)) || {});
                  if (stryMutAct_9fa48("72618") ? payload.type === ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH : stryMutAct_9fa48("72617") ? false : stryMutAct_9fa48("72616") ? true : (stryCov_9fa48("72616", "72617", "72618"), payload.type !== ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH)) {
                    if (stryMutAct_9fa48("72619")) {
                      {}
                    } else {
                      stryCov_9fa48("72619");
                      return stryMutAct_9fa48("72620") ? {} : (stryCov_9fa48("72620"), {
                        acknowledged: stryMutAct_9fa48("72621") ? true : (stryCov_9fa48("72621"), false),
                        error: REPLICA_DISPATCH_SERVICE_LITERAL.UNSUPPORTED_DISPATCH_CONTROL_MESSAGE
                      });
                    }
                  }
                  await this.handleReplicaOperationDispatch(payload);
                  return stryMutAct_9fa48("72622") ? {} : (stryCov_9fa48("72622"), {
                    acknowledged: stryMutAct_9fa48("72623") ? false : (stryCov_9fa48("72623"), true)
                  });
                }
              };
              this.messageRouter.register(this.directDispatchServiceAddress, this.directDispatchServiceHandler);
            }
          }
        }
      }
      if (stryMutAct_9fa48("72626") ? this.rebalanceCoordinator || typeof this.rebalanceCoordinator.on === TYPEOF.FUNCTION : stryMutAct_9fa48("72625") ? false : stryMutAct_9fa48("72624") ? true : (stryCov_9fa48("72624", "72625", "72626"), this.rebalanceCoordinator && (stryMutAct_9fa48("72628") ? typeof this.rebalanceCoordinator.on !== TYPEOF.FUNCTION : stryMutAct_9fa48("72627") ? true : (stryCov_9fa48("72627", "72628"), typeof this.rebalanceCoordinator.on === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("72629")) {
          {}
        } else {
          stryCov_9fa48("72629");
          this.coordinatorOperationCreatedListener = (event = {}) => {
            if (stryMutAct_9fa48("72630")) {
              {}
            } else {
              stryCov_9fa48("72630");
              this.handleCoordinatorOperationCreated(event.operation).catch(error => {
                if (stryMutAct_9fa48("72631")) {
                  {}
                } else {
                  stryCov_9fa48("72631");
                  this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_FAILED, stryMutAct_9fa48("72632") ? {} : (stryCov_9fa48("72632"), {
                    operationId: stryMutAct_9fa48("72634") ? event.operation?.operationId : stryMutAct_9fa48("72633") ? event?.operation.operationId : (stryCov_9fa48("72633", "72634"), event?.operation?.operationId),
                    error: error.message,
                    source: REPLICA_DISPATCH_SERVICE_LITERAL.COORDINATOR_DOT_EVENT
                  }));
                }
              });
            }
          };
          this.rebalanceCoordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, this.coordinatorOperationCreatedListener);
        }
      }
    }
  }

  /**
   * Attach a message group service for dispatch handling.
   * @param {Object} messageGroupService - MessageGroupService instance.
   */
  attachMessageGroupService(messageGroupService) {
    if (stryMutAct_9fa48("72635")) {
      {}
    } else {
      stryCov_9fa48("72635");
      if (stryMutAct_9fa48("72637") ? false : stryMutAct_9fa48("72636") ? true : (stryCov_9fa48("72636", "72637"), this.messageGroupServices.has(messageGroupService))) {
        if (stryMutAct_9fa48("72638")) {
          {}
        } else {
          stryCov_9fa48("72638");
          return;
        }
      }
      const onMessageReceived = event => {
        if (stryMutAct_9fa48("72639")) {
          {}
        } else {
          stryCov_9fa48("72639");
          this.handleMessageReceived(messageGroupService, event).catch(error => {
            if (stryMutAct_9fa48("72640")) {
              {}
            } else {
              stryCov_9fa48("72640");
              this.logger.error(DISPATCH_LOG_MSG.MESSAGE_HANDLING_FAILED, stryMutAct_9fa48("72641") ? {} : (stryCov_9fa48("72641"), {
                error: error.message,
                groupId: messageGroupService.groupId
              }));
            }
          });
        }
      };
      const onCdcApplied = event => {
        if (stryMutAct_9fa48("72642")) {
          {}
        } else {
          stryCov_9fa48("72642");
          this.handleCdcApplied(messageGroupService, event).catch(error => {
            if (stryMutAct_9fa48("72643")) {
              {}
            } else {
              stryCov_9fa48("72643");
              this.logger.error(DISPATCH_LOG_MSG.CDC_HANDLING_FAILED, stryMutAct_9fa48("72644") ? {} : (stryCov_9fa48("72644"), {
                error: error.message,
                groupId: messageGroupService.groupId
              }));
            }
          });
        }
      };
      messageGroupService.on(CONTROL_PLANE_EVENT.MESSAGE_RECEIVED, onMessageReceived);
      messageGroupService.on(CONTROL_PLANE_EVENT.CDC_APPLIED, onCdcApplied);
      this.messageGroupServices.add(messageGroupService);
      this.messageGroupHandlers.set(messageGroupService, stryMutAct_9fa48("72645") ? {} : (stryCov_9fa48("72645"), {
        onMessageReceived,
        onCdcApplied
      }));
    }
  }

  /**
   * Handle incoming messages from the message group.
   * @param {Object} mgService - Message group service.
   * @param {Object} event - Message received event.
   * @private
   */
  async handleMessageReceived(mgService, event) {
    if (stryMutAct_9fa48("72646")) {
      {}
    } else {
      stryCov_9fa48("72646");
      const payload = stryMutAct_9fa48("72647") ? event.payload : (stryCov_9fa48("72647"), event?.payload);
      const messageId = stryMutAct_9fa48("72648") ? event.messageId : (stryCov_9fa48("72648"), event?.messageId);
      if (stryMutAct_9fa48("72651") ? !payload && !this.isControlMessage(payload) : stryMutAct_9fa48("72650") ? false : stryMutAct_9fa48("72649") ? true : (stryCov_9fa48("72649", "72650", "72651"), (stryMutAct_9fa48("72652") ? payload : (stryCov_9fa48("72652"), !payload)) || (stryMutAct_9fa48("72653") ? this.isControlMessage(payload) : (stryCov_9fa48("72653"), !this.isControlMessage(payload))))) {
        if (stryMutAct_9fa48("72654")) {
          {}
        } else {
          stryCov_9fa48("72654");
          return;
        }
      }
      const requiredTables = this.resolveControlPlaneMessageRequiredTables(payload);

      // NODE_STATE_UPDATE is idempotent, but it still produces shared metadata
      // writes. Only process it locally when this replica is already ready to
      // carry that write set through the canonical metadata ingress path.
      if (stryMutAct_9fa48("72657") ? payload.type !== ControlPlaneMessageType.NODE_STATE_UPDATE : stryMutAct_9fa48("72656") ? false : stryMutAct_9fa48("72655") ? true : (stryCov_9fa48("72655", "72656", "72657"), payload.type === ControlPlaneMessageType.NODE_STATE_UPDATE)) {
        if (stryMutAct_9fa48("72658")) {
          {}
        } else {
          stryCov_9fa48("72658");
          const ingressReadiness = this.resolveMessageGroupIngressReadiness(mgService, requiredTables);
          if (stryMutAct_9fa48("72661") ? ingressReadiness.ready === true : stryMutAct_9fa48("72660") ? false : stryMutAct_9fa48("72659") ? true : (stryCov_9fa48("72659", "72660", "72661"), ingressReadiness.ready !== (stryMutAct_9fa48("72662") ? false : (stryCov_9fa48("72662"), true)))) {
            if (stryMutAct_9fa48("72663")) {
              {}
            } else {
              stryCov_9fa48("72663");
              await this.forwardToLeader(mgService, payload, stryMutAct_9fa48("72664") ? {} : (stryCov_9fa48("72664"), {
                requiredTables,
                ingressReadiness
              }));
              if (stryMutAct_9fa48("72667") ? messageId || typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION : stryMutAct_9fa48("72666") ? false : stryMutAct_9fa48("72665") ? true : (stryCov_9fa48("72665", "72666", "72667"), messageId && (stryMutAct_9fa48("72669") ? typeof mgService.acknowledgeMessage !== TYPEOF.FUNCTION : stryMutAct_9fa48("72668") ? true : (stryCov_9fa48("72668", "72669"), typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION)))) {
                if (stryMutAct_9fa48("72670")) {
                  {}
                } else {
                  stryCov_9fa48("72670");
                  await mgService.acknowledgeMessage(messageId);
                }
              }
              return;
            }
          }
          this.enqueueNodeStateUpdate(payload);
          if (stryMutAct_9fa48("72673") ? messageId || typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION : stryMutAct_9fa48("72672") ? false : stryMutAct_9fa48("72671") ? true : (stryCov_9fa48("72671", "72672", "72673"), messageId && (stryMutAct_9fa48("72675") ? typeof mgService.acknowledgeMessage !== TYPEOF.FUNCTION : stryMutAct_9fa48("72674") ? true : (stryCov_9fa48("72674", "72675"), typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("72676")) {
              {}
            } else {
              stryCov_9fa48("72676");
              await mgService.acknowledgeMessage(messageId);
            }
          }
          return;
        }
      }
      if (stryMutAct_9fa48("72679") ? false : stryMutAct_9fa48("72678") ? true : stryMutAct_9fa48("72677") ? mgService.isLeaderReplica() : (stryCov_9fa48("72677", "72678", "72679"), !mgService.isLeaderReplica())) {
        if (stryMutAct_9fa48("72680")) {
          {}
        } else {
          stryCov_9fa48("72680");
          await this.forwardToLeader(mgService, payload);
          return;
        }
      }
      if (stryMutAct_9fa48("72683") ? payload.type !== ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH : stryMutAct_9fa48("72682") ? false : stryMutAct_9fa48("72681") ? true : (stryCov_9fa48("72681", "72682", "72683"), payload.type === ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH)) {
        if (stryMutAct_9fa48("72684")) {
          {}
        } else {
          stryCov_9fa48("72684");
          await this.handleReplicaOperationDispatch(payload);
        }
      }
      if (stryMutAct_9fa48("72687") ? messageId || typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION : stryMutAct_9fa48("72686") ? false : stryMutAct_9fa48("72685") ? true : (stryCov_9fa48("72685", "72686", "72687"), messageId && (stryMutAct_9fa48("72689") ? typeof mgService.acknowledgeMessage !== TYPEOF.FUNCTION : stryMutAct_9fa48("72688") ? true : (stryCov_9fa48("72688", "72689"), typeof mgService.acknowledgeMessage === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("72690")) {
          {}
        } else {
          stryCov_9fa48("72690");
          await mgService.acknowledgeMessage(messageId);
        }
      }
    }
  }
  resolveControlPlaneMessageRequiredTables(payload) {
    if (stryMutAct_9fa48("72691")) {
      {}
    } else {
      stryCov_9fa48("72691");
      return getControlPlaneMessageRequiredTables(stryMutAct_9fa48("72692") ? payload.type : (stryCov_9fa48("72692"), payload?.type));
    }
  }
  resolveMessageGroupIngressReadiness(mgService, requiredTables = stryMutAct_9fa48("72693") ? ["Stryker was here"] : (stryCov_9fa48("72693"), [])) {
    if (stryMutAct_9fa48("72694")) {
      {}
    } else {
      stryCov_9fa48("72694");
      if (stryMutAct_9fa48("72697") ? !mgService && typeof mgService.getMetadataIngressReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("72696") ? false : stryMutAct_9fa48("72695") ? true : (stryCov_9fa48("72695", "72696", "72697"), (stryMutAct_9fa48("72698") ? mgService : (stryCov_9fa48("72698"), !mgService)) || (stryMutAct_9fa48("72700") ? typeof mgService.getMetadataIngressReadiness === TYPEOF.FUNCTION : stryMutAct_9fa48("72699") ? false : (stryCov_9fa48("72699", "72700"), typeof mgService.getMetadataIngressReadiness !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("72701")) {
          {}
        } else {
          stryCov_9fa48("72701");
          return stryMutAct_9fa48("72702") ? {} : (stryCov_9fa48("72702"), {
            ready: stryMutAct_9fa48("72703") ? true : (stryCov_9fa48("72703"), false),
            reason: REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_DASH_GROUP_INGRESS_READINESS_UNAVAILABLE
          });
        }
      }
      return mgService.getMetadataIngressReadiness(stryMutAct_9fa48("72704") ? {} : (stryCov_9fa48("72704"), {
        requiredTables
      }));
    }
  }

  /**
   * Handle CDC events for replica operation dispatch.
   * @param {Object} mgService - Message group service.
   * @param {Object} event - CDC event.
   * @private
   */
  async handleCdcApplied(_mgService, event) {
    if (stryMutAct_9fa48("72705")) {
      {}
    } else {
      stryCov_9fa48("72705");
      if (stryMutAct_9fa48("72708") ? event?.tableName !== SYSTEM_TABLE_NAME.NODES : stryMutAct_9fa48("72707") ? false : stryMutAct_9fa48("72706") ? true : (stryCov_9fa48("72706", "72707", "72708"), (stryMutAct_9fa48("72709") ? event.tableName : (stryCov_9fa48("72709"), event?.tableName)) === SYSTEM_TABLE_NAME.NODES)) {
        if (stryMutAct_9fa48("72710")) {
          {}
        } else {
          stryCov_9fa48("72710");
          const nodeRow = stryMutAct_9fa48("72711") ? event.data : (stryCov_9fa48("72711"), event?.data);
          const nodeId = this.getNodeIdFromRecord(nodeRow);
          if (stryMutAct_9fa48("72713") ? false : stryMutAct_9fa48("72712") ? true : (stryCov_9fa48("72712", "72713"), nodeId)) {
            if (stryMutAct_9fa48("72714")) {
              {}
            } else {
              stryCov_9fa48("72714");
              this.nodeReadyRetryQueue.enqueue(nodeId, RECONCILE_REASON.NODES_CDC_READY, stryMutAct_9fa48("72715") ? {} : (stryCov_9fa48("72715"), {
                nodeRow
              }));
            }
          }
          return;
        }
      }
      if (stryMutAct_9fa48("72718") ? event?.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS : stryMutAct_9fa48("72717") ? false : stryMutAct_9fa48("72716") ? true : (stryCov_9fa48("72716", "72717", "72718"), (stryMutAct_9fa48("72719") ? event.tableName : (stryCov_9fa48("72719"), event?.tableName)) !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)) {
        if (stryMutAct_9fa48("72720")) {
          {}
        } else {
          stryCov_9fa48("72720");
          return;
        }
      }
      this.enqueueReplicaOperationRow(stryMutAct_9fa48("72721") ? event.data : (stryCov_9fa48("72721"), event?.data), stryMutAct_9fa48("72722") ? {} : (stryCov_9fa48("72722"), {
        pendingReason: RECONCILE_REASON.CDC_OPERATION_PENDING,
        replaceActiveReason: RECONCILE_REASON.CDC_REPLACE_ACTIVE
      }));
    }
  }

  /**
   * Handle local coordinator operation-created events.
   * This provides a deterministic dispatch trigger when CDC fan-out is delayed.
   * @param {Object} operation - RebalanceCoordinator operation object.
   * @return {Promise<void>}
   * @private
   */
  async handleCoordinatorOperationCreated(operation) {
    if (stryMutAct_9fa48("72723")) {
      {}
    } else {
      stryCov_9fa48("72723");
      if (stryMutAct_9fa48("72726") ? !operation && !operation.operationId : stryMutAct_9fa48("72725") ? false : stryMutAct_9fa48("72724") ? true : (stryCov_9fa48("72724", "72725", "72726"), (stryMutAct_9fa48("72727") ? operation : (stryCov_9fa48("72727"), !operation)) || (stryMutAct_9fa48("72728") ? operation.operationId : (stryCov_9fa48("72728"), !operation.operationId)))) {
        if (stryMutAct_9fa48("72729")) {
          {}
        } else {
          stryCov_9fa48("72729");
          return;
        }
      }
      if (stryMutAct_9fa48("72732") ? operation.workflowStep === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("72731") ? false : stryMutAct_9fa48("72730") ? true : (stryCov_9fa48("72730", "72731", "72732"), operation.workflowStep !== WORKFLOW_STEP.PENDING)) {
        if (stryMutAct_9fa48("72733")) {
          {}
        } else {
          stryCov_9fa48("72733");
          return;
        }
      }
      if (stryMutAct_9fa48("72736") ? false : stryMutAct_9fa48("72735") ? true : stryMutAct_9fa48("72734") ? this.isReplicaOperationLocallyOwned(operation) : (stryCov_9fa48("72734", "72735", "72736"), !this.isReplicaOperationLocallyOwned(operation))) {
        if (stryMutAct_9fa48("72737")) {
          {}
        } else {
          stryCov_9fa48("72737");
          await this.sendDirectDispatchWakeup(operation);
          return;
        }
      }
      this.operationDispatchQueue.enqueue(operation.operationId, RECONCILE_REASON.COORDINATOR_OPERATION_CREATED, stryMutAct_9fa48("72738") ? {} : (stryCov_9fa48("72738"), {
        row: this.buildOperationRowFromCoordinator(operation)
      }));
    }
  }

  /**
   * Build the direct router address used to wake one replica-operation owner.
   * @param {string} nodeId
   * @return {string|null}
   * @private
   */
  buildDirectDispatchServiceAddress(nodeId) {
    if (stryMutAct_9fa48("72739")) {
      {}
    } else {
      stryCov_9fa48("72739");
      const normalizedNodeId = stryMutAct_9fa48("72740") ? String(nodeId || '') : (stryCov_9fa48("72740"), String(stryMutAct_9fa48("72743") ? nodeId && '' : stryMutAct_9fa48("72742") ? false : stryMutAct_9fa48("72741") ? true : (stryCov_9fa48("72741", "72742", "72743"), nodeId || (stryMutAct_9fa48("72744") ? "Stryker was here!" : (stryCov_9fa48("72744"), '')))).trim());
      if (stryMutAct_9fa48("72747") ? normalizedNodeId.length !== NUM.ZERO : stryMutAct_9fa48("72746") ? false : stryMutAct_9fa48("72745") ? true : (stryCov_9fa48("72745", "72746", "72747"), normalizedNodeId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("72748")) {
          {}
        } else {
          stryCov_9fa48("72748");
          return null;
        }
      }
      return stryMutAct_9fa48("72749") ? `` : (stryCov_9fa48("72749"), `${normalizedNodeId}/service/replica-dispatch`);
    }
  }

  /**
   * Resolve the current owner node for one replica operation.
   * @param {Object} operation
   * @return {string|null}
   * @private
   */
  resolveReplicaOperationOwnerNodeId(operation) {
    if (stryMutAct_9fa48("72750")) {
      {}
    } else {
      stryCov_9fa48("72750");
      if (stryMutAct_9fa48("72753") ? this.rebalanceCoordinator || typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId === TYPEOF.FUNCTION : stryMutAct_9fa48("72752") ? false : stryMutAct_9fa48("72751") ? true : (stryCov_9fa48("72751", "72752", "72753"), this.rebalanceCoordinator && (stryMutAct_9fa48("72755") ? typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId !== TYPEOF.FUNCTION : stryMutAct_9fa48("72754") ? true : (stryCov_9fa48("72754", "72755"), typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("72756")) {
          {}
        } else {
          stryCov_9fa48("72756");
          return this.rebalanceCoordinator.resolveOperationOwnerNodeId(operation);
        }
      }
      return stryMutAct_9fa48("72759") ? (operation?.targetNodeId || operation?.target_node_id) && null : stryMutAct_9fa48("72758") ? false : stryMutAct_9fa48("72757") ? true : (stryCov_9fa48("72757", "72758", "72759"), (stryMutAct_9fa48("72761") ? operation?.targetNodeId && operation?.target_node_id : stryMutAct_9fa48("72760") ? false : (stryCov_9fa48("72760", "72761"), (stryMutAct_9fa48("72762") ? operation.targetNodeId : (stryCov_9fa48("72762"), operation?.targetNodeId)) || (stryMutAct_9fa48("72763") ? operation.target_node_id : (stryCov_9fa48("72763"), operation?.target_node_id)))) || null);
    }
  }

  /**
   * Send one best-effort direct owner wake-up when a newly created operation
   * is owned by another node and CDC/cache visibility may lag.
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async sendDirectDispatchWakeup(operation) {
    if (stryMutAct_9fa48("72764")) {
      {}
    } else {
      stryCov_9fa48("72764");
      if (stryMutAct_9fa48("72767") ? (!operation?.operationId || !this.messageRouter) && typeof this.messageRouter.deliver !== TYPEOF.FUNCTION : stryMutAct_9fa48("72766") ? false : stryMutAct_9fa48("72765") ? true : (stryCov_9fa48("72765", "72766", "72767"), (stryMutAct_9fa48("72769") ? !operation?.operationId && !this.messageRouter : stryMutAct_9fa48("72768") ? false : (stryCov_9fa48("72768", "72769"), (stryMutAct_9fa48("72770") ? operation?.operationId : (stryCov_9fa48("72770"), !(stryMutAct_9fa48("72771") ? operation.operationId : (stryCov_9fa48("72771"), operation?.operationId)))) || (stryMutAct_9fa48("72772") ? this.messageRouter : (stryCov_9fa48("72772"), !this.messageRouter)))) || (stryMutAct_9fa48("72774") ? typeof this.messageRouter.deliver === TYPEOF.FUNCTION : stryMutAct_9fa48("72773") ? false : (stryCov_9fa48("72773", "72774"), typeof this.messageRouter.deliver !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("72775")) {
          {}
        } else {
          stryCov_9fa48("72775");
          return;
        }
      }
      const operationRow = this.buildOperationRowFromCoordinator(operation);
      const ownerNodeId = this.resolveReplicaOperationOwnerNodeId(operation);
      const targetAddress = this.buildDirectDispatchServiceAddress(ownerNodeId);
      if (stryMutAct_9fa48("72778") ? false : stryMutAct_9fa48("72777") ? true : stryMutAct_9fa48("72776") ? targetAddress : (stryCov_9fa48("72776", "72777", "72778"), !targetAddress)) {
        if (stryMutAct_9fa48("72779")) {
          {}
        } else {
          stryCov_9fa48("72779");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("72780")) {
          {}
        } else {
          stryCov_9fa48("72780");
          await this.messageRouter.deliver(targetAddress, stryMutAct_9fa48("72781") ? {} : (stryCov_9fa48("72781"), {
            type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
            [ControlPlaneField.OPERATION_ID]: operation.operationId,
            [ControlPlaneField.OPERATION_ROW]: operationRow
          }));
        }
      } catch (_error) {
        // Best-effort wake-up only. CDC/cache visibility remains the fallback.
      }
    }
  }

  /**
   * Enqueue one node-state update onto the dedicated owner-key lane.
   * This keeps heartbeat acknowledgements decoupled from the system-table
   * writer under sustained load while still coalescing to the latest
   * watermark per node.
   * @param {Object} payload - Node state update payload.
   * @return {boolean}
   * @private
   */
  enqueueNodeStateUpdate(payload) {
    if (stryMutAct_9fa48("72782")) {
      {}
    } else {
      stryCov_9fa48("72782");
      const nodeId = stryMutAct_9fa48("72783") ? payload[ControlPlaneField.NODE_ID] : (stryCov_9fa48("72783"), payload?.[ControlPlaneField.NODE_ID]);
      const state = stryMutAct_9fa48("72784") ? payload[ControlPlaneField.STATE] : (stryCov_9fa48("72784"), payload?.[ControlPlaneField.STATE]);
      if (stryMutAct_9fa48("72787") ? !nodeId && !state : stryMutAct_9fa48("72786") ? false : stryMutAct_9fa48("72785") ? true : (stryCov_9fa48("72785", "72786", "72787"), (stryMutAct_9fa48("72788") ? nodeId : (stryCov_9fa48("72788"), !nodeId)) || (stryMutAct_9fa48("72789") ? state : (stryCov_9fa48("72789"), !state)))) {
        if (stryMutAct_9fa48("72790")) {
          {}
        } else {
          stryCov_9fa48("72790");
          return stryMutAct_9fa48("72791") ? true : (stryCov_9fa48("72791"), false);
        }
      }
      if (stryMutAct_9fa48("72794") ? false : stryMutAct_9fa48("72793") ? true : stryMutAct_9fa48("72792") ? CONTROL_PLANE_ALLOWED_STATES.includes(state) : (stryCov_9fa48("72792", "72793", "72794"), !CONTROL_PLANE_ALLOWED_STATES.includes(state))) {
        if (stryMutAct_9fa48("72795")) {
          {}
        } else {
          stryCov_9fa48("72795");
          return stryMutAct_9fa48("72796") ? true : (stryCov_9fa48("72796"), false);
        }
      }
      const nextWatermark = this.getNodeStateUpdateWatermark(payload);
      const previousWatermark = stryMutAct_9fa48("72799") ? this.nodeStateUpdateWatermarks.get(nodeId) && null : stryMutAct_9fa48("72798") ? false : stryMutAct_9fa48("72797") ? true : (stryCov_9fa48("72797", "72798", "72799"), this.nodeStateUpdateWatermarks.get(nodeId) || null);
      if (stryMutAct_9fa48("72802") ? false : stryMutAct_9fa48("72801") ? true : stryMutAct_9fa48("72800") ? this.isNodeStateUpdateWatermarkNewer(previousWatermark, nextWatermark) : (stryCov_9fa48("72800", "72801", "72802"), !this.isNodeStateUpdateWatermarkNewer(previousWatermark, nextWatermark))) {
        if (stryMutAct_9fa48("72803")) {
          {}
        } else {
          stryCov_9fa48("72803");
          this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_SKIPPED, stryMutAct_9fa48("72804") ? {} : (stryCov_9fa48("72804"), {
            nodeId,
            reason: REPLICA_DISPATCH_SERVICE_LITERAL.STALE_OR_DUPLICATE_ENQUEUE
          }));
          return stryMutAct_9fa48("72805") ? true : (stryCov_9fa48("72805"), false);
        }
      }
      if (stryMutAct_9fa48("72807") ? false : stryMutAct_9fa48("72806") ? true : (stryCov_9fa48("72806", "72807"), nextWatermark)) {
        if (stryMutAct_9fa48("72808")) {
          {}
        } else {
          stryCov_9fa48("72808");
          this.nodeStateUpdateWatermarks.set(nodeId, nextWatermark);
        }
      }
      if (stryMutAct_9fa48("72810") ? false : stryMutAct_9fa48("72809") ? true : (stryCov_9fa48("72809", "72810"), this.replaceDeferredNodeStateUpdatePayload(nodeId, payload))) {
        if (stryMutAct_9fa48("72811")) {
          {}
        } else {
          stryCov_9fa48("72811");
          this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, stryMutAct_9fa48("72812") ? {} : (stryCov_9fa48("72812"), {
            nodeId,
            reason: REPLICA_DISPATCH_SERVICE_LITERAL.DEFERRED_RETRY_PENDING
          }));
          return stryMutAct_9fa48("72813") ? true : (stryCov_9fa48("72813"), false);
        }
      }
      const nodeStateUpdateQueue = this.resolveNodeStateUpdateQueue(nodeId);
      const enqueued = nodeStateUpdateQueue.enqueue(nodeId, RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE, stryMutAct_9fa48("72814") ? {} : (stryCov_9fa48("72814"), {
        payload
      }));
      this.logger.debug(DISPATCH_LOG_MSG.ENQUEUE_NODE_STATE_UPDATE, stryMutAct_9fa48("72815") ? {} : (stryCov_9fa48("72815"), {
        nodeId,
        enqueued
      }));
      return enqueued;
    }
  }

  /**
   * Handle NODE_STATE_UPDATE messages.
   * @param {Object} payload - Node state update payload.
   * @private
   */
  async handleNodeStateUpdate(payload) {
    if (stryMutAct_9fa48("72816")) {
      {}
    } else {
      stryCov_9fa48("72816");
      const nodeId = payload[ControlPlaneField.NODE_ID];
      const state = payload[ControlPlaneField.STATE];
      const payloadNodeRow = payload[ControlPlaneField.NODE_ROW];
      const isHeartbeatOnly = this.isHeartbeatOnlyNodeStateUpdate(payload);
      const nodeRow = (stryMutAct_9fa48("72819") ? payloadNodeRow || typeof payloadNodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("72818") ? false : stryMutAct_9fa48("72817") ? true : (stryCov_9fa48("72817", "72818", "72819"), payloadNodeRow && (stryMutAct_9fa48("72821") ? typeof payloadNodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("72820") ? true : (stryCov_9fa48("72820", "72821"), typeof payloadNodeRow === TYPEOF.OBJECT)))) ? payloadNodeRow : null;
      if (stryMutAct_9fa48("72824") ? !nodeId && !state : stryMutAct_9fa48("72823") ? false : stryMutAct_9fa48("72822") ? true : (stryCov_9fa48("72822", "72823", "72824"), (stryMutAct_9fa48("72825") ? nodeId : (stryCov_9fa48("72825"), !nodeId)) || (stryMutAct_9fa48("72826") ? state : (stryCov_9fa48("72826"), !state)))) {
        if (stryMutAct_9fa48("72827")) {
          {}
        } else {
          stryCov_9fa48("72827");
          return;
        }
      }
      if (stryMutAct_9fa48("72830") ? false : stryMutAct_9fa48("72829") ? true : stryMutAct_9fa48("72828") ? CONTROL_PLANE_ALLOWED_STATES.includes(state) : (stryCov_9fa48("72828", "72829", "72830"), !CONTROL_PLANE_ALLOWED_STATES.includes(state))) {
        if (stryMutAct_9fa48("72831")) {
          {}
        } else {
          stryCov_9fa48("72831");
          return;
        }
      }
      const existing = await this.getNodeRow(nodeId);
      const payloadWatermark = this.getNodeStateUpdateWatermark(payload);
      const now = Date.now();
      const existingConnectionState = stryMutAct_9fa48("72832") ? String(existing?.[COLUMN.CONNECTION_STATE] || '').toUpperCase() : (stryCov_9fa48("72832"), String(stryMutAct_9fa48("72835") ? existing?.[COLUMN.CONNECTION_STATE] && '' : stryMutAct_9fa48("72834") ? false : stryMutAct_9fa48("72833") ? true : (stryCov_9fa48("72833", "72834", "72835"), (stryMutAct_9fa48("72836") ? existing[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("72836"), existing?.[COLUMN.CONNECTION_STATE])) || (stryMutAct_9fa48("72837") ? "Stryker was here!" : (stryCov_9fa48("72837"), '')))).toLowerCase());
      const existingReadyLeaseExpiresAt = Number(stryMutAct_9fa48("72838") ? existing[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("72838"), existing?.[COLUMN.READY_LEASE_EXPIRES_AT]));
      const requestedHeartbeatAt = Number(payload[ControlPlaneField.HEARTBEAT_AT]);
      // Apply-time liveness timestamp prevents delayed messages from
      // immediately writing an already-stale heartbeat.
      const heartbeatAt = Number.isFinite(requestedHeartbeatAt) ? stryMutAct_9fa48("72839") ? Math.min(requestedHeartbeatAt, now) : (stryCov_9fa48("72839"), Math.max(requestedHeartbeatAt, now)) : now;
      const requestedLeaseExpiry = payload[ControlPlaneField.READY_LEASE_EXPIRES_AT];
      const promotedToReadyFromConnected = stryMutAct_9fa48("72842") ? state === STATE.CONNECTED && existingConnectionState === STATE.READY && Number.isFinite(existingReadyLeaseExpiresAt) || existingReadyLeaseExpiresAt > now : stryMutAct_9fa48("72841") ? false : stryMutAct_9fa48("72840") ? true : (stryCov_9fa48("72840", "72841", "72842"), (stryMutAct_9fa48("72844") ? state === STATE.CONNECTED && existingConnectionState === STATE.READY || Number.isFinite(existingReadyLeaseExpiresAt) : stryMutAct_9fa48("72843") ? true : (stryCov_9fa48("72843", "72844"), (stryMutAct_9fa48("72846") ? state === STATE.CONNECTED || existingConnectionState === STATE.READY : stryMutAct_9fa48("72845") ? true : (stryCov_9fa48("72845", "72846"), (stryMutAct_9fa48("72848") ? state !== STATE.CONNECTED : stryMutAct_9fa48("72847") ? true : (stryCov_9fa48("72847", "72848"), state === STATE.CONNECTED)) && (stryMutAct_9fa48("72850") ? existingConnectionState !== STATE.READY : stryMutAct_9fa48("72849") ? true : (stryCov_9fa48("72849", "72850"), existingConnectionState === STATE.READY)))) && Number.isFinite(existingReadyLeaseExpiresAt))) && (stryMutAct_9fa48("72853") ? existingReadyLeaseExpiresAt <= now : stryMutAct_9fa48("72852") ? existingReadyLeaseExpiresAt >= now : stryMutAct_9fa48("72851") ? true : (stryCov_9fa48("72851", "72852", "72853"), existingReadyLeaseExpiresAt > now)));
      const nextState = promotedToReadyFromConnected ? STATE.READY : state;
      const readyLeaseExpiresAt = (stryMutAct_9fa48("72856") ? nextState !== STATE.READY : stryMutAct_9fa48("72855") ? false : stryMutAct_9fa48("72854") ? true : (stryCov_9fa48("72854", "72855", "72856"), nextState === STATE.READY)) ? (stryMutAct_9fa48("72859") ? Number.isFinite(requestedLeaseExpiry) || requestedLeaseExpiry > heartbeatAt : stryMutAct_9fa48("72858") ? false : stryMutAct_9fa48("72857") ? true : (stryCov_9fa48("72857", "72858", "72859"), Number.isFinite(requestedLeaseExpiry) && (stryMutAct_9fa48("72862") ? requestedLeaseExpiry <= heartbeatAt : stryMutAct_9fa48("72861") ? requestedLeaseExpiry >= heartbeatAt : stryMutAct_9fa48("72860") ? true : (stryCov_9fa48("72860", "72861", "72862"), requestedLeaseExpiry > heartbeatAt)))) ? requestedLeaseExpiry : stryMutAct_9fa48("72863") ? heartbeatAt - this.readyLeaseMs : (stryCov_9fa48("72863"), heartbeatAt + this.readyLeaseMs) : null;
      const existingWatermark = getNodeHeartbeatWatermark(existing);
      const effectiveReadyWatermark = stryMutAct_9fa48("72864") ? {} : (stryCov_9fa48("72864"), {
        lastHeartbeat: heartbeatAt,
        readyLeaseExpiresAt,
        connectionState: nextState
      });
      const staleCheckWatermark = (stryMutAct_9fa48("72867") ? state !== STATE.READY : stryMutAct_9fa48("72866") ? false : stryMutAct_9fa48("72865") ? true : (stryCov_9fa48("72865", "72866", "72867"), state === STATE.READY)) ? effectiveReadyWatermark : payloadWatermark;
      if (stryMutAct_9fa48("72870") ? false : stryMutAct_9fa48("72869") ? true : stryMutAct_9fa48("72868") ? this.isNodeStateUpdateWatermarkNewer(existingWatermark, staleCheckWatermark) : (stryCov_9fa48("72868", "72869", "72870"), !this.isNodeStateUpdateWatermarkNewer(existingWatermark, staleCheckWatermark))) {
        if (stryMutAct_9fa48("72871")) {
          {}
        } else {
          stryCov_9fa48("72871");
          if (stryMutAct_9fa48("72874") ? state === STATE.READY && !isHeartbeatOnly || wasNodeRecordReadyWhenWritten(existing, {
            requireActiveStatus: true
          }) : stryMutAct_9fa48("72873") ? false : stryMutAct_9fa48("72872") ? true : (stryCov_9fa48("72872", "72873", "72874"), (stryMutAct_9fa48("72876") ? state === STATE.READY || !isHeartbeatOnly : stryMutAct_9fa48("72875") ? true : (stryCov_9fa48("72875", "72876"), (stryMutAct_9fa48("72878") ? state !== STATE.READY : stryMutAct_9fa48("72877") ? true : (stryCov_9fa48("72877", "72878"), state === STATE.READY)) && (stryMutAct_9fa48("72879") ? isHeartbeatOnly : (stryCov_9fa48("72879"), !isHeartbeatOnly)))) && wasNodeRecordReadyWhenWritten(existing, stryMutAct_9fa48("72880") ? {} : (stryCov_9fa48("72880"), {
            requireActiveStatus: stryMutAct_9fa48("72881") ? false : (stryCov_9fa48("72881"), true)
          })))) {
            if (stryMutAct_9fa48("72882")) {
              {}
            } else {
              stryCov_9fa48("72882");
              this.enqueueMembershipPublicationReconcile(RECONCILE_REASON.NODE_STATE_UPDATE_READY, stryMutAct_9fa48("72883") ? {} : (stryCov_9fa48("72883"), {
                nodeId,
                state: STATE.READY,
                nodeRow: existing
              }));
              this.nodeReadyRetryQueue.enqueue(nodeId, RECONCILE_REASON.NODE_STATE_UPDATE_READY, stryMutAct_9fa48("72884") ? {} : (stryCov_9fa48("72884"), {
                nodeRow: existing
              }));
              await this.acknowledgeMembershipPublicationForNode(nodeId);
            }
          }
          this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_SKIPPED, stryMutAct_9fa48("72885") ? {} : (stryCov_9fa48("72885"), {
            nodeId,
            reason: REPLICA_DISPATCH_SERVICE_LITERAL.STALE_AGAINST_EXISTING_ROW
          }));
          return;
        }
      }
      const baseRow = this.buildNodeStateUpdateRow(stryMutAct_9fa48("72886") ? {} : (stryCov_9fa48("72886"), {
        nodeId,
        nodeRow,
        existing,
        nextState,
        heartbeatAt,
        readyLeaseExpiresAt,
        payloadNodeAddress: payload[ControlPlaneField.NODE_ADDRESS],
        payload,
        isHeartbeatOnly
      }));
      const updateResult = await this.getControlPlaneSystemTableGateway().updateSystemTableRow(SYSTEM_TABLE_NAME.NODES, stryMutAct_9fa48("72887") ? {} : (stryCov_9fa48("72887"), {
        [COLUMN.NODE_ID]: nodeId
      }), baseRow, this.buildNodeStateUpdateWriteOptions(nodeId, nextState, isHeartbeatOnly));
      const updateAffectedRows = Number(stryMutAct_9fa48("72889") ? updateResult.partitionResult?.affectedRows : stryMutAct_9fa48("72888") ? updateResult?.partitionResult.affectedRows : (stryCov_9fa48("72888", "72889"), updateResult?.partitionResult?.affectedRows));
      if (stryMutAct_9fa48("72892") ? updateAffectedRows !== NUM.ZERO : stryMutAct_9fa48("72891") ? false : stryMutAct_9fa48("72890") ? true : (stryCov_9fa48("72890", "72891", "72892"), updateAffectedRows === NUM.ZERO)) {
        if (stryMutAct_9fa48("72893")) {
          {}
        } else {
          stryCov_9fa48("72893");
          const bootstrapped = await this.tryBootstrapMissingNodeStateUpdateRow(nodeId, nextState, baseRow, existing, isHeartbeatOnly);
          if (stryMutAct_9fa48("72896") ? false : stryMutAct_9fa48("72895") ? true : stryMutAct_9fa48("72894") ? bootstrapped : (stryCov_9fa48("72894", "72895", "72896"), !bootstrapped)) {
            if (stryMutAct_9fa48("72897")) {
              {}
            } else {
              stryCov_9fa48("72897");
              throw await this.resolveMissingNodeRowUpdateError(nodeId, existing);
            }
          }
        }
      }
      if (stryMutAct_9fa48("72900") ? nextState === STATE.READY || !isHeartbeatOnly : stryMutAct_9fa48("72899") ? false : stryMutAct_9fa48("72898") ? true : (stryCov_9fa48("72898", "72899", "72900"), (stryMutAct_9fa48("72902") ? nextState !== STATE.READY : stryMutAct_9fa48("72901") ? true : (stryCov_9fa48("72901", "72902"), nextState === STATE.READY)) && (stryMutAct_9fa48("72903") ? isHeartbeatOnly : (stryCov_9fa48("72903"), !isHeartbeatOnly)))) {
        if (stryMutAct_9fa48("72904")) {
          {}
        } else {
          stryCov_9fa48("72904");
          this.enqueueMembershipPublicationReconcile(RECONCILE_REASON.NODE_STATE_UPDATE_READY, stryMutAct_9fa48("72905") ? {} : (stryCov_9fa48("72905"), {
            nodeId,
            state: nextState,
            nodeRow: stryMutAct_9fa48("72906") ? {} : (stryCov_9fa48("72906"), {
              ...existing,
              [COLUMN.NODE_ID]: nodeId,
              ...baseRow
            })
          }));
          this.nodeReadyRetryQueue.enqueue(nodeId, RECONCILE_REASON.NODE_STATE_UPDATE_READY, stryMutAct_9fa48("72907") ? {} : (stryCov_9fa48("72907"), {
            nodeRow: stryMutAct_9fa48("72908") ? {} : (stryCov_9fa48("72908"), {
              ...existing,
              [COLUMN.NODE_ID]: nodeId,
              ...baseRow
            })
          }));
          await this.acknowledgeMembershipPublicationForNode(nodeId);
          return;
        }
      }
      this.clearNodeReadyRetryWatermark(nodeId);
    }
  }

  /**
   * Build the persisted NODE_STATE_UPDATE row shape.
   * Heartbeat-only updates intentionally avoid mutating payload participation
   * fields such as utilization and resource budgets.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object|null} options.nodeRow
   * @param {Object|null} options.existing
   * @param {string} options.nextState
   * @param {number} options.heartbeatAt
   * @param {number|null} options.readyLeaseExpiresAt
   * @param {string} [options.payloadNodeAddress]
   * @param {Object} options.payload
   * @param {boolean} options.isHeartbeatOnly
   * @return {Object}
   * @private
   */
  buildNodeStateUpdateRow(options) {
    if (stryMutAct_9fa48("72909")) {
      {}
    } else {
      stryCov_9fa48("72909");
      const {
        nodeId,
        nodeRow,
        existing,
        nextState,
        heartbeatAt,
        readyLeaseExpiresAt,
        payloadNodeAddress,
        payload,
        isHeartbeatOnly
      } = stryMutAct_9fa48("72912") ? options && {} : stryMutAct_9fa48("72911") ? false : stryMutAct_9fa48("72910") ? true : (stryCov_9fa48("72910", "72911", "72912"), options || {});
      const baseNodeAddress = stryMutAct_9fa48("72915") ? (payloadNodeAddress || nodeRow?.[COLUMN.NODE_ADDRESS] || existing?.[COLUMN.NODE_ADDRESS]) && STRING.UNKNOWN : stryMutAct_9fa48("72914") ? false : stryMutAct_9fa48("72913") ? true : (stryCov_9fa48("72913", "72914", "72915"), (stryMutAct_9fa48("72917") ? (payloadNodeAddress || nodeRow?.[COLUMN.NODE_ADDRESS]) && existing?.[COLUMN.NODE_ADDRESS] : stryMutAct_9fa48("72916") ? false : (stryCov_9fa48("72916", "72917"), (stryMutAct_9fa48("72919") ? payloadNodeAddress && nodeRow?.[COLUMN.NODE_ADDRESS] : stryMutAct_9fa48("72918") ? false : (stryCov_9fa48("72918", "72919"), payloadNodeAddress || (stryMutAct_9fa48("72920") ? nodeRow[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("72920"), nodeRow?.[COLUMN.NODE_ADDRESS])))) || (stryMutAct_9fa48("72921") ? existing[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("72921"), existing?.[COLUMN.NODE_ADDRESS])))) || STRING.UNKNOWN);
      if (stryMutAct_9fa48("72924") ? isHeartbeatOnly !== true : stryMutAct_9fa48("72923") ? false : stryMutAct_9fa48("72922") ? true : (stryCov_9fa48("72922", "72923", "72924"), isHeartbeatOnly === (stryMutAct_9fa48("72925") ? false : (stryCov_9fa48("72925"), true)))) {
        if (stryMutAct_9fa48("72926")) {
          {}
        } else {
          stryCov_9fa48("72926");
          return stryMutAct_9fa48("72927") ? {} : (stryCov_9fa48("72927"), {
            [COLUMN.NODE_ID]: nodeId,
            [COLUMN.NODE_ADDRESS]: baseNodeAddress,
            [COLUMN.CONNECTION_STATE]: nextState,
            [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
            [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt
          });
        }
      }
      const payloadCapabilities = stryMutAct_9fa48("72928") ? payload[ControlPlaneField.CAPABILITIES] : (stryCov_9fa48("72928"), payload?.[ControlPlaneField.CAPABILITIES]);
      const capabilities = Array.isArray(payloadCapabilities) ? JSON.stringify(payloadCapabilities) : (stryMutAct_9fa48("72931") ? typeof payloadCapabilities !== TYPEOF.STRING : stryMutAct_9fa48("72930") ? false : stryMutAct_9fa48("72929") ? true : (stryCov_9fa48("72929", "72930", "72931"), typeof payloadCapabilities === TYPEOF.STRING)) ? payloadCapabilities : stryMutAct_9fa48("72934") ? existing?.[COLUMN.CAPABILITIES] && STRING.EMPTY_JSON_ARRAY : stryMutAct_9fa48("72933") ? false : stryMutAct_9fa48("72932") ? true : (stryCov_9fa48("72932", "72933", "72934"), (stryMutAct_9fa48("72935") ? existing[COLUMN.CAPABILITIES] : (stryCov_9fa48("72935"), existing?.[COLUMN.CAPABILITIES])) || STRING.EMPTY_JSON_ARRAY);
      return stryMutAct_9fa48("72936") ? {} : (stryCov_9fa48("72936"), {
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.NODE_ADDRESS]: baseNodeAddress,
        [COLUMN.CPU_CORES]: Number.isFinite(stryMutAct_9fa48("72937") ? nodeRow[COLUMN.CPU_CORES] : (stryCov_9fa48("72937"), nodeRow?.[COLUMN.CPU_CORES])) ? nodeRow[COLUMN.CPU_CORES] : stryMutAct_9fa48("72940") ? existing?.[COLUMN.CPU_CORES] && NUM.ZERO : stryMutAct_9fa48("72939") ? false : stryMutAct_9fa48("72938") ? true : (stryCov_9fa48("72938", "72939", "72940"), (stryMutAct_9fa48("72941") ? existing[COLUMN.CPU_CORES] : (stryCov_9fa48("72941"), existing?.[COLUMN.CPU_CORES])) || NUM.ZERO),
        [COLUMN.MEMORY_MB]: Number.isFinite(stryMutAct_9fa48("72942") ? nodeRow[COLUMN.MEMORY_MB] : (stryCov_9fa48("72942"), nodeRow?.[COLUMN.MEMORY_MB])) ? nodeRow[COLUMN.MEMORY_MB] : stryMutAct_9fa48("72945") ? existing?.[COLUMN.MEMORY_MB] && NUM.ZERO : stryMutAct_9fa48("72944") ? false : stryMutAct_9fa48("72943") ? true : (stryCov_9fa48("72943", "72944", "72945"), (stryMutAct_9fa48("72946") ? existing[COLUMN.MEMORY_MB] : (stryCov_9fa48("72946"), existing?.[COLUMN.MEMORY_MB])) || NUM.ZERO),
        [COLUMN.DISK_GB]: Number.isFinite(stryMutAct_9fa48("72947") ? nodeRow[COLUMN.DISK_GB] : (stryCov_9fa48("72947"), nodeRow?.[COLUMN.DISK_GB])) ? nodeRow[COLUMN.DISK_GB] : stryMutAct_9fa48("72950") ? existing?.[COLUMN.DISK_GB] && NUM.ZERO : stryMutAct_9fa48("72949") ? false : stryMutAct_9fa48("72948") ? true : (stryCov_9fa48("72948", "72949", "72950"), (stryMutAct_9fa48("72951") ? existing[COLUMN.DISK_GB] : (stryCov_9fa48("72951"), existing?.[COLUMN.DISK_GB])) || NUM.ZERO),
        [COLUMN.CPU_USAGE_PERCENT]: Number.isFinite(stryMutAct_9fa48("72952") ? nodeRow[COLUMN.CPU_USAGE_PERCENT] : (stryCov_9fa48("72952"), nodeRow?.[COLUMN.CPU_USAGE_PERCENT])) ? nodeRow[COLUMN.CPU_USAGE_PERCENT] : stryMutAct_9fa48("72955") ? existing?.[COLUMN.CPU_USAGE_PERCENT] && NUM.ZERO : stryMutAct_9fa48("72954") ? false : stryMutAct_9fa48("72953") ? true : (stryCov_9fa48("72953", "72954", "72955"), (stryMutAct_9fa48("72956") ? existing[COLUMN.CPU_USAGE_PERCENT] : (stryCov_9fa48("72956"), existing?.[COLUMN.CPU_USAGE_PERCENT])) || NUM.ZERO),
        [COLUMN.MEMORY_USAGE_PERCENT]: Number.isFinite(stryMutAct_9fa48("72957") ? nodeRow[COLUMN.MEMORY_USAGE_PERCENT] : (stryCov_9fa48("72957"), nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT])) ? nodeRow[COLUMN.MEMORY_USAGE_PERCENT] : stryMutAct_9fa48("72960") ? existing?.[COLUMN.MEMORY_USAGE_PERCENT] && NUM.ZERO : stryMutAct_9fa48("72959") ? false : stryMutAct_9fa48("72958") ? true : (stryCov_9fa48("72958", "72959", "72960"), (stryMutAct_9fa48("72961") ? existing[COLUMN.MEMORY_USAGE_PERCENT] : (stryCov_9fa48("72961"), existing?.[COLUMN.MEMORY_USAGE_PERCENT])) || NUM.ZERO),
        [COLUMN.DISK_USAGE_PERCENT]: Number.isFinite(stryMutAct_9fa48("72962") ? nodeRow[COLUMN.DISK_USAGE_PERCENT] : (stryCov_9fa48("72962"), nodeRow?.[COLUMN.DISK_USAGE_PERCENT])) ? nodeRow[COLUMN.DISK_USAGE_PERCENT] : stryMutAct_9fa48("72965") ? existing?.[COLUMN.DISK_USAGE_PERCENT] && NUM.ZERO : stryMutAct_9fa48("72964") ? false : stryMutAct_9fa48("72963") ? true : (stryCov_9fa48("72963", "72964", "72965"), (stryMutAct_9fa48("72966") ? existing[COLUMN.DISK_USAGE_PERCENT] : (stryCov_9fa48("72966"), existing?.[COLUMN.DISK_USAGE_PERCENT])) || NUM.ZERO),
        [COLUMN.STATUS]: (stryMutAct_9fa48("72969") ? nextState !== STATE.READY : stryMutAct_9fa48("72968") ? false : stryMutAct_9fa48("72967") ? true : (stryCov_9fa48("72967", "72968", "72969"), nextState === STATE.READY)) ? SERVICE_STATUS.ACTIVE : (stryMutAct_9fa48("72972") ? typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING || nodeRow[COLUMN.STATUS].length > NUM.ZERO : stryMutAct_9fa48("72971") ? false : stryMutAct_9fa48("72970") ? true : (stryCov_9fa48("72970", "72971", "72972"), (stryMutAct_9fa48("72974") ? typeof nodeRow?.[COLUMN.STATUS] !== TYPEOF.STRING : stryMutAct_9fa48("72973") ? true : (stryCov_9fa48("72973", "72974"), typeof (stryMutAct_9fa48("72975") ? nodeRow[COLUMN.STATUS] : (stryCov_9fa48("72975"), nodeRow?.[COLUMN.STATUS])) === TYPEOF.STRING)) && (stryMutAct_9fa48("72978") ? nodeRow[COLUMN.STATUS].length <= NUM.ZERO : stryMutAct_9fa48("72977") ? nodeRow[COLUMN.STATUS].length >= NUM.ZERO : stryMutAct_9fa48("72976") ? true : (stryCov_9fa48("72976", "72977", "72978"), nodeRow[COLUMN.STATUS].length > NUM.ZERO)))) ? nodeRow[COLUMN.STATUS] : stryMutAct_9fa48("72981") ? existing?.[COLUMN.STATUS] && SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("72980") ? false : stryMutAct_9fa48("72979") ? true : (stryCov_9fa48("72979", "72980", "72981"), (stryMutAct_9fa48("72982") ? existing[COLUMN.STATUS] : (stryCov_9fa48("72982"), existing?.[COLUMN.STATUS])) || SERVICE_STATUS.ACTIVE),
        [COLUMN.CONNECTION_STATE]: nextState,
        [COLUMN.CAPABILITIES]: capabilities,
        [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
        [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt,
        ...this.resolveNodeStateUpdateBudgetFields(nodeRow)
      });
    }
  }

  /**
   * Detect heartbeat-only NODE_STATE_UPDATEs and avoid durable participation
   * mutation side effects on the receiving path.
   * @param {Object} payload
   * @return {boolean}
   * @private
   */
  isHeartbeatOnlyNodeStateUpdate(payload) {
    if (stryMutAct_9fa48("72983")) {
      {}
    } else {
      stryCov_9fa48("72983");
      return stryMutAct_9fa48("72986") ? payload?.[ControlPlaneField.HEARTBEAT_ONLY] !== true : stryMutAct_9fa48("72985") ? false : stryMutAct_9fa48("72984") ? true : (stryCov_9fa48("72984", "72985", "72986"), (stryMutAct_9fa48("72987") ? payload[ControlPlaneField.HEARTBEAT_ONLY] : (stryCov_9fa48("72987"), payload?.[ControlPlaneField.HEARTBEAT_ONLY])) === (stryMutAct_9fa48("72988") ? false : (stryCov_9fa48("72988"), true)));
    }
  }

  /**
   * Bootstrap one missing node row from a NODE_STATE_UPDATE payload when
   * startup registration visibility lags behind steady-state updates.
   *
   * @param {string} nodeId
   * @param {string} nextState
   * @param {Object} baseRow
   * @param {Object} existing
   * @return {Promise<boolean>}
   * @private
   */
  async tryBootstrapMissingNodeStateUpdateRow(nodeId, nextState, baseRow, existing, isHeartbeatOnly) {
    if (stryMutAct_9fa48("72989")) {
      {}
    } else {
      stryCov_9fa48("72989");
      if (stryMutAct_9fa48("72992") ? !baseRow && typeof baseRow !== TYPEOF.OBJECT : stryMutAct_9fa48("72991") ? false : stryMutAct_9fa48("72990") ? true : (stryCov_9fa48("72990", "72991", "72992"), (stryMutAct_9fa48("72993") ? baseRow : (stryCov_9fa48("72993"), !baseRow)) || (stryMutAct_9fa48("72995") ? typeof baseRow === TYPEOF.OBJECT : stryMutAct_9fa48("72994") ? false : (stryCov_9fa48("72994", "72995"), typeof baseRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("72996")) {
          {}
        } else {
          stryCov_9fa48("72996");
          return stryMutAct_9fa48("72997") ? true : (stryCov_9fa48("72997"), false);
        }
      }
      if (stryMutAct_9fa48("73000") ? existing[COLUMN.NODE_ID] : stryMutAct_9fa48("72999") ? false : stryMutAct_9fa48("72998") ? true : (stryCov_9fa48("72998", "72999", "73000"), existing?.[COLUMN.NODE_ID])) {
        if (stryMutAct_9fa48("73001")) {
          {}
        } else {
          stryCov_9fa48("73001");
          return stryMutAct_9fa48("73002") ? true : (stryCov_9fa48("73002"), false);
        }
      }
      if (stryMutAct_9fa48("73005") ? nextState !== STATE.CONNECTED || nextState !== STATE.READY : stryMutAct_9fa48("73004") ? false : stryMutAct_9fa48("73003") ? true : (stryCov_9fa48("73003", "73004", "73005"), (stryMutAct_9fa48("73007") ? nextState === STATE.CONNECTED : stryMutAct_9fa48("73006") ? true : (stryCov_9fa48("73006", "73007"), nextState !== STATE.CONNECTED)) && (stryMutAct_9fa48("73009") ? nextState === STATE.READY : stryMutAct_9fa48("73008") ? true : (stryCov_9fa48("73008", "73009"), nextState !== STATE.READY)))) {
        if (stryMutAct_9fa48("73010")) {
          {}
        } else {
          stryCov_9fa48("73010");
          return stryMutAct_9fa48("73011") ? true : (stryCov_9fa48("73011"), false);
        }
      }
      const nodeAddress = stryMutAct_9fa48("73012") ? String(baseRow?.[COLUMN.NODE_ADDRESS] || '') : (stryCov_9fa48("73012"), String(stryMutAct_9fa48("73015") ? baseRow?.[COLUMN.NODE_ADDRESS] && '' : stryMutAct_9fa48("73014") ? false : stryMutAct_9fa48("73013") ? true : (stryCov_9fa48("73013", "73014", "73015"), (stryMutAct_9fa48("73016") ? baseRow[COLUMN.NODE_ADDRESS] : (stryCov_9fa48("73016"), baseRow?.[COLUMN.NODE_ADDRESS])) || (stryMutAct_9fa48("73017") ? "Stryker was here!" : (stryCov_9fa48("73017"), '')))).trim());
      if (stryMutAct_9fa48("73020") ? nodeAddress.length === NUM.ZERO && nodeAddress === STRING.UNKNOWN : stryMutAct_9fa48("73019") ? false : stryMutAct_9fa48("73018") ? true : (stryCov_9fa48("73018", "73019", "73020"), (stryMutAct_9fa48("73022") ? nodeAddress.length !== NUM.ZERO : stryMutAct_9fa48("73021") ? false : (stryCov_9fa48("73021", "73022"), nodeAddress.length === NUM.ZERO)) || (stryMutAct_9fa48("73024") ? nodeAddress !== STRING.UNKNOWN : stryMutAct_9fa48("73023") ? false : (stryCov_9fa48("73023", "73024"), nodeAddress === STRING.UNKNOWN)))) {
        if (stryMutAct_9fa48("73025")) {
          {}
        } else {
          stryCov_9fa48("73025");
          return stryMutAct_9fa48("73026") ? true : (stryCov_9fa48("73026"), false);
        }
      }
      const gateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("73029") ? typeof gateway.upsertSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("73028") ? false : stryMutAct_9fa48("73027") ? true : (stryCov_9fa48("73027", "73028", "73029"), typeof gateway.upsertSystemTableRow !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("73030")) {
          {}
        } else {
          stryCov_9fa48("73030");
          return stryMutAct_9fa48("73031") ? true : (stryCov_9fa48("73031"), false);
        }
      }
      try {
        if (stryMutAct_9fa48("73032")) {
          {}
        } else {
          stryCov_9fa48("73032");
          const upsertResult = await gateway.upsertSystemTableRow(SYSTEM_TABLE_NAME.NODES, baseRow, this.buildNodeStateUpdateWriteOptions(nodeId, nextState, isHeartbeatOnly));
          if (stryMutAct_9fa48("73035") ? upsertResult?.success !== false : stryMutAct_9fa48("73034") ? false : stryMutAct_9fa48("73033") ? true : (stryCov_9fa48("73033", "73034", "73035"), (stryMutAct_9fa48("73036") ? upsertResult.success : (stryCov_9fa48("73036"), upsertResult?.success)) === (stryMutAct_9fa48("73037") ? true : (stryCov_9fa48("73037"), false)))) {
            if (stryMutAct_9fa48("73038")) {
              {}
            } else {
              stryCov_9fa48("73038");
              const upsertError = new Error((stryMutAct_9fa48("73039") ? `` : (stryCov_9fa48("73039"), `Failed to bootstrap missing node row from NODE_STATE_UPDATE: `)) + String(stryMutAct_9fa48("73042") ? upsertResult.error && DISPATCH_READINESS_ERROR_REASON.UNKNOWN : stryMutAct_9fa48("73041") ? false : stryMutAct_9fa48("73040") ? true : (stryCov_9fa48("73040", "73041", "73042"), upsertResult.error || DISPATCH_READINESS_ERROR_REASON.UNKNOWN)));
              upsertError.code = stryMutAct_9fa48("73045") ? upsertResult.error && REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED : stryMutAct_9fa48("73044") ? false : stryMutAct_9fa48("73043") ? true : (stryCov_9fa48("73043", "73044", "73045"), upsertResult.error || REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED);
              if (stryMutAct_9fa48("73048") ? upsertResult.deferRetry !== true : stryMutAct_9fa48("73047") ? false : stryMutAct_9fa48("73046") ? true : (stryCov_9fa48("73046", "73047", "73048"), upsertResult.deferRetry === (stryMutAct_9fa48("73049") ? false : (stryCov_9fa48("73049"), true)))) {
                if (stryMutAct_9fa48("73050")) {
                  {}
                } else {
                  stryCov_9fa48("73050");
                  upsertError.deferRetry = stryMutAct_9fa48("73051") ? false : (stryCov_9fa48("73051"), true);
                  upsertError.retryAfterMs = Number.isFinite(upsertResult.retryAfterMs) ? upsertResult.retryAfterMs : this.nodeStateUpdateRetryAfterMs;
                }
              }
              throw upsertError;
            }
          }
          this.logger.info(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_BOOTSTRAP_UPSERTED, stryMutAct_9fa48("73052") ? {} : (stryCov_9fa48("73052"), {
            nodeId,
            state: nextState
          }));
          return stryMutAct_9fa48("73053") ? false : (stryCov_9fa48("73053"), true);
        }
      } catch (error) {
        if (stryMutAct_9fa48("73054")) {
          {}
        } else {
          stryCov_9fa48("73054");
          if (stryMutAct_9fa48("73057") ? error?.deferRetry === true && isRetryableControlPlaneError(error) : stryMutAct_9fa48("73056") ? false : stryMutAct_9fa48("73055") ? true : (stryCov_9fa48("73055", "73056", "73057"), (stryMutAct_9fa48("73059") ? error?.deferRetry !== true : stryMutAct_9fa48("73058") ? false : (stryCov_9fa48("73058", "73059"), (stryMutAct_9fa48("73060") ? error.deferRetry : (stryCov_9fa48("73060"), error?.deferRetry)) === (stryMutAct_9fa48("73061") ? false : (stryCov_9fa48("73061"), true)))) || isRetryableControlPlaneError(error))) {
            if (stryMutAct_9fa48("73062")) {
              {}
            } else {
              stryCov_9fa48("73062");
              error.deferRetry = stryMutAct_9fa48("73063") ? false : (stryCov_9fa48("73063"), true);
              error.retryAfterMs = Number.isFinite(stryMutAct_9fa48("73064") ? error.retryAfterMs : (stryCov_9fa48("73064"), error?.retryAfterMs)) ? error.retryAfterMs : this.nodeStateUpdateRetryAfterMs;
            }
          }
          throw error;
        }
      }
    }
  }

  /**
   * Extract durable startup-owned storage-budget fields from one node-state
   * payload. Heartbeat-only NODE_STATE_UPDATE messages omit these fields, so
   * this preserves budget ownership without letting routine heartbeats clear it.
   * @param {Object|null} nodeRow
   * @return {Object}
   * @private
   */
  resolveNodeStateUpdateBudgetFields(nodeRow) {
    if (stryMutAct_9fa48("73065")) {
      {}
    } else {
      stryCov_9fa48("73065");
      if (stryMutAct_9fa48("73068") ? !nodeRow && typeof nodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("73067") ? false : stryMutAct_9fa48("73066") ? true : (stryCov_9fa48("73066", "73067", "73068"), (stryMutAct_9fa48("73069") ? nodeRow : (stryCov_9fa48("73069"), !nodeRow)) || (stryMutAct_9fa48("73071") ? typeof nodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("73070") ? false : (stryCov_9fa48("73070", "73071"), typeof nodeRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("73072")) {
          {}
        } else {
          stryCov_9fa48("73072");
          return {};
        }
      }
      const budgetFields = {};
      const storageBudgetBytes = Number(stryMutAct_9fa48("73073") ? nodeRow[COLUMN.STORAGE_BUDGET_BYTES] : (stryCov_9fa48("73073"), nodeRow?.[COLUMN.STORAGE_BUDGET_BYTES]));
      if (stryMutAct_9fa48("73076") ? Number.isFinite(storageBudgetBytes) || storageBudgetBytes > NUM.ZERO : stryMutAct_9fa48("73075") ? false : stryMutAct_9fa48("73074") ? true : (stryCov_9fa48("73074", "73075", "73076"), Number.isFinite(storageBudgetBytes) && (stryMutAct_9fa48("73079") ? storageBudgetBytes <= NUM.ZERO : stryMutAct_9fa48("73078") ? storageBudgetBytes >= NUM.ZERO : stryMutAct_9fa48("73077") ? true : (stryCov_9fa48("73077", "73078", "73079"), storageBudgetBytes > NUM.ZERO)))) {
        if (stryMutAct_9fa48("73080")) {
          {}
        } else {
          stryCov_9fa48("73080");
          budgetFields[COLUMN.STORAGE_BUDGET_BYTES] = Math.floor(storageBudgetBytes);
        }
      }
      const storageBudgetSource = stryMutAct_9fa48("73081") ? nodeRow[COLUMN.STORAGE_BUDGET_SOURCE] : (stryCov_9fa48("73081"), nodeRow?.[COLUMN.STORAGE_BUDGET_SOURCE]);
      if (stryMutAct_9fa48("73084") ? typeof storageBudgetSource === TYPEOF.STRING || storageBudgetSource.length > NUM.ZERO : stryMutAct_9fa48("73083") ? false : stryMutAct_9fa48("73082") ? true : (stryCov_9fa48("73082", "73083", "73084"), (stryMutAct_9fa48("73086") ? typeof storageBudgetSource !== TYPEOF.STRING : stryMutAct_9fa48("73085") ? true : (stryCov_9fa48("73085", "73086"), typeof storageBudgetSource === TYPEOF.STRING)) && (stryMutAct_9fa48("73089") ? storageBudgetSource.length <= NUM.ZERO : stryMutAct_9fa48("73088") ? storageBudgetSource.length >= NUM.ZERO : stryMutAct_9fa48("73087") ? true : (stryCov_9fa48("73087", "73088", "73089"), storageBudgetSource.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("73090")) {
          {}
        } else {
          stryCov_9fa48("73090");
          budgetFields[COLUMN.STORAGE_BUDGET_SOURCE] = storageBudgetSource;
        }
      }
      const storageBudgetUpdatedAt = Number(stryMutAct_9fa48("73091") ? nodeRow[COLUMN.STORAGE_BUDGET_UPDATED_AT] : (stryCov_9fa48("73091"), nodeRow?.[COLUMN.STORAGE_BUDGET_UPDATED_AT]));
      if (stryMutAct_9fa48("73094") ? Number.isFinite(storageBudgetUpdatedAt) || storageBudgetUpdatedAt > NUM.ZERO : stryMutAct_9fa48("73093") ? false : stryMutAct_9fa48("73092") ? true : (stryCov_9fa48("73092", "73093", "73094"), Number.isFinite(storageBudgetUpdatedAt) && (stryMutAct_9fa48("73097") ? storageBudgetUpdatedAt <= NUM.ZERO : stryMutAct_9fa48("73096") ? storageBudgetUpdatedAt >= NUM.ZERO : stryMutAct_9fa48("73095") ? true : (stryCov_9fa48("73095", "73096", "73097"), storageBudgetUpdatedAt > NUM.ZERO)))) {
        if (stryMutAct_9fa48("73098")) {
          {}
        } else {
          stryCov_9fa48("73098");
          budgetFields[COLUMN.STORAGE_BUDGET_UPDATED_AT] = Math.floor(storageBudgetUpdatedAt);
        }
      }
      return budgetFields;
    }
  }

  /**
   * Resolve the canonical system-table gateway for dispatch writes.
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("73099")) {
      {}
    } else {
      stryCov_9fa48("73099");
      assertCritical(this.controlPlaneSystemTableGateway, REPLICA_DISPATCH_SERVICE_LITERAL.REPLICADISPATCHSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY);
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Handle dispatch requests for replica operations.
   * @param {Object} payload - Dispatch payload.
   * @private
   */
  async handleReplicaOperationDispatch(payload) {
    if (stryMutAct_9fa48("73100")) {
      {}
    } else {
      stryCov_9fa48("73100");
      const operationRow = (stryMutAct_9fa48("73103") ? payload?.[ControlPlaneField.OPERATION_ROW] || typeof payload[ControlPlaneField.OPERATION_ROW] === TYPEOF.OBJECT : stryMutAct_9fa48("73102") ? false : stryMutAct_9fa48("73101") ? true : (stryCov_9fa48("73101", "73102", "73103"), (stryMutAct_9fa48("73104") ? payload[ControlPlaneField.OPERATION_ROW] : (stryCov_9fa48("73104"), payload?.[ControlPlaneField.OPERATION_ROW])) && (stryMutAct_9fa48("73106") ? typeof payload[ControlPlaneField.OPERATION_ROW] !== TYPEOF.OBJECT : stryMutAct_9fa48("73105") ? true : (stryCov_9fa48("73105", "73106"), typeof payload[ControlPlaneField.OPERATION_ROW] === TYPEOF.OBJECT)))) ? payload[ControlPlaneField.OPERATION_ROW] : null;
      const operationId = stryMutAct_9fa48("73109") ? (payload[ControlPlaneField.OPERATION_ID] || operationRow?.operation_id) && null : stryMutAct_9fa48("73108") ? false : stryMutAct_9fa48("73107") ? true : (stryCov_9fa48("73107", "73108", "73109"), (stryMutAct_9fa48("73111") ? payload[ControlPlaneField.OPERATION_ID] && operationRow?.operation_id : stryMutAct_9fa48("73110") ? false : (stryCov_9fa48("73110", "73111"), payload[ControlPlaneField.OPERATION_ID] || (stryMutAct_9fa48("73112") ? operationRow.operation_id : (stryCov_9fa48("73112"), operationRow?.operation_id)))) || null);
      if (stryMutAct_9fa48("73115") ? false : stryMutAct_9fa48("73114") ? true : stryMutAct_9fa48("73113") ? operationId : (stryCov_9fa48("73113", "73114", "73115"), !operationId)) {
        if (stryMutAct_9fa48("73116")) {
          {}
        } else {
          stryCov_9fa48("73116");
          return;
        }
      }
      this.operationDispatchQueue.enqueue(operationId, RECONCILE_REASON.MESSAGE_DISPATCH_REQUEST, operationRow ? stryMutAct_9fa48("73117") ? {} : (stryCov_9fa48("73117"), {
        row: operationRow
      }) : undefined);
    }
  }

  /**
   * Dispatch an operation record to its target node.
   * @param {Object} row - Replica operation row.
   * @private
   */
  async dispatchOperationRow(row) {
    if (stryMutAct_9fa48("73118")) {
      {}
    } else {
      stryCov_9fa48("73118");
      if (stryMutAct_9fa48("73121") ? !row && !row.operation_id : stryMutAct_9fa48("73120") ? false : stryMutAct_9fa48("73119") ? true : (stryCov_9fa48("73119", "73120", "73121"), (stryMutAct_9fa48("73122") ? row : (stryCov_9fa48("73122"), !row)) || (stryMutAct_9fa48("73123") ? row.operation_id : (stryCov_9fa48("73123"), !row.operation_id)))) {
        if (stryMutAct_9fa48("73124")) {
          {}
        } else {
          stryCov_9fa48("73124");
          return;
        }
      }
      if (stryMutAct_9fa48("73127") ? false : stryMutAct_9fa48("73126") ? true : stryMutAct_9fa48("73125") ? isCoordinatorOwnedOperationType(row.type) : (stryCov_9fa48("73125", "73126", "73127"), !isCoordinatorOwnedOperationType(row.type))) {
        if (stryMutAct_9fa48("73128")) {
          {}
        } else {
          stryCov_9fa48("73128");
          return;
        }
      }
      if (stryMutAct_9fa48("73131") ? false : stryMutAct_9fa48("73130") ? true : stryMutAct_9fa48("73129") ? this.rebalanceCoordinator : (stryCov_9fa48("73129", "73130", "73131"), !this.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("73132")) {
          {}
        } else {
          stryCov_9fa48("73132");
          return;
        }
      }
      if (stryMutAct_9fa48("73134") ? false : stryMutAct_9fa48("73133") ? true : (stryCov_9fa48("73133", "73134"), this.dispatchInFlight.has(row.operation_id))) {
        if (stryMutAct_9fa48("73135")) {
          {}
        } else {
          stryCov_9fa48("73135");
          return;
        }
      }
      const operationId = row.operation_id;
      if (stryMutAct_9fa48("73138") ? false : stryMutAct_9fa48("73137") ? true : stryMutAct_9fa48("73136") ? this.isReplicaOperationLocallyOwned(row) : (stryCov_9fa48("73136", "73137", "73138"), !this.isReplicaOperationLocallyOwned(row))) {
        if (stryMutAct_9fa48("73139")) {
          {}
        } else {
          stryCov_9fa48("73139");
          this.clearDeferredOperationDispatchRetry(operationId);
          return;
        }
      }
      const targetNodeId = row.target_node_id;
      const rowOperation = this.buildOperationFromRow(row);
      const dispatchReadiness = await this.captureDispatchReadiness(targetNodeId);
      if (stryMutAct_9fa48("73141") ? false : stryMutAct_9fa48("73140") ? true : (stryCov_9fa48("73140", "73141"), dispatchReadiness.error)) {
        if (stryMutAct_9fa48("73142")) {
          {}
        } else {
          stryCov_9fa48("73142");
          const readinessError = this.buildDispatchReadinessRefreshFailureError(targetNodeId, dispatchReadiness);
          this.recordDispatchFailure(stryMutAct_9fa48("73143") ? {} : (stryCov_9fa48("73143"), {
            operationId,
            targetNodeId,
            workflowStep: stryMutAct_9fa48("73146") ? row.workflow_step && null : stryMutAct_9fa48("73145") ? false : stryMutAct_9fa48("73144") ? true : (stryCov_9fa48("73144", "73145", "73146"), row.workflow_step || null),
            skipped: stryMutAct_9fa48("73147") ? false : (stryCov_9fa48("73147"), true),
            reason: DISPATCH_READINESS_ERROR_REASON.TARGET_NODE_READINESS_REFRESH_FAILED,
            error: readinessError.message,
            readinessSnapshot: dispatchReadiness.snapshot
          }));
          if (stryMutAct_9fa48("73149") ? false : stryMutAct_9fa48("73148") ? true : (stryCov_9fa48("73148", "73149"), this.deferOperationDispatchRetry(operationId, readinessError, row))) {
            if (stryMutAct_9fa48("73150")) {
              {}
            } else {
              stryCov_9fa48("73150");
              return;
            }
          }
          throw readinessError;
        }
      }
      if (stryMutAct_9fa48("73153") ? false : stryMutAct_9fa48("73152") ? true : stryMutAct_9fa48("73151") ? dispatchReadiness.ready : (stryCov_9fa48("73151", "73152", "73153"), !dispatchReadiness.ready)) {
        if (stryMutAct_9fa48("73154")) {
          {}
        } else {
          stryCov_9fa48("73154");
          const readinessError = this.buildDispatchNotReadyError(targetNodeId, dispatchReadiness);
          this.recordDispatchFailure(stryMutAct_9fa48("73155") ? {} : (stryCov_9fa48("73155"), {
            operationId,
            targetNodeId,
            workflowStep: stryMutAct_9fa48("73158") ? row.workflow_step && null : stryMutAct_9fa48("73157") ? false : stryMutAct_9fa48("73156") ? true : (stryCov_9fa48("73156", "73157", "73158"), row.workflow_step || null),
            skipped: stryMutAct_9fa48("73159") ? false : (stryCov_9fa48("73159"), true),
            reason: REPLICA_DISPATCH_SERVICE_LITERAL.TARGET_NODE_NOT_READY,
            error: readinessError.message,
            readinessSnapshot: dispatchReadiness.snapshot
          }));
          if (stryMutAct_9fa48("73161") ? false : stryMutAct_9fa48("73160") ? true : (stryCov_9fa48("73160", "73161"), this.deferOperationDispatchRetry(operationId, readinessError, row))) {
            if (stryMutAct_9fa48("73162")) {
              {}
            } else {
              stryCov_9fa48("73162");
              return;
            }
          }
          return;
        }
      }
      this.dispatchInFlight.add(operationId);
      try {
        if (stryMutAct_9fa48("73163")) {
          {}
        } else {
          stryCov_9fa48("73163");
          let dispatchResult = null;
          if (stryMutAct_9fa48("73166") ? typeof this.rebalanceCoordinator.dispatchOperation !== TYPEOF.FUNCTION : stryMutAct_9fa48("73165") ? false : stryMutAct_9fa48("73164") ? true : (stryCov_9fa48("73164", "73165", "73166"), typeof this.rebalanceCoordinator.dispatchOperation === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("73167")) {
              {}
            } else {
              stryCov_9fa48("73167");
              dispatchResult = await this.rebalanceCoordinator.dispatchOperation(rowOperation);
            }
          } else {
            if (stryMutAct_9fa48("73168")) {
              {}
            } else {
              stryCov_9fa48("73168");
              const claimedOperation = await this.rebalanceCoordinator.claimDispatchTransition(operationId);
              if (stryMutAct_9fa48("73171") ? false : stryMutAct_9fa48("73170") ? true : stryMutAct_9fa48("73169") ? claimedOperation : (stryCov_9fa48("73169", "73170", "73171"), !claimedOperation)) {
                if (stryMutAct_9fa48("73172")) {
                  {}
                } else {
                  stryCov_9fa48("73172");
                  this.logger.debug(DISPATCH_LOG_MSG.CLAIM_SKIPPED, stryMutAct_9fa48("73173") ? {} : (stryCov_9fa48("73173"), {
                    operationId,
                    nodeId: this.nodeId
                  }));
                  return;
                }
              }
              const operation = stryMutAct_9fa48("73174") ? {} : (stryCov_9fa48("73174"), {
                ...claimedOperation
              });
              if (stryMutAct_9fa48("73177") ? !Array.isArray(operation.stepsHistory) || Array.isArray(rowOperation.stepsHistory) : stryMutAct_9fa48("73176") ? false : stryMutAct_9fa48("73175") ? true : (stryCov_9fa48("73175", "73176", "73177"), (stryMutAct_9fa48("73178") ? Array.isArray(operation.stepsHistory) : (stryCov_9fa48("73178"), !Array.isArray(operation.stepsHistory))) && Array.isArray(rowOperation.stepsHistory))) {
                if (stryMutAct_9fa48("73179")) {
                  {}
                } else {
                  stryCov_9fa48("73179");
                  operation.stepsHistory = rowOperation.stepsHistory;
                }
              }
              if (stryMutAct_9fa48("73182") ? !Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]) || Array.isArray(rowOperation[ReplicaOperationField.REPLICA_IDS]) : stryMutAct_9fa48("73181") ? false : stryMutAct_9fa48("73180") ? true : (stryCov_9fa48("73180", "73181", "73182"), (stryMutAct_9fa48("73183") ? Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]) : (stryCov_9fa48("73183"), !Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]))) && Array.isArray(rowOperation[ReplicaOperationField.REPLICA_IDS]))) {
                if (stryMutAct_9fa48("73184")) {
                  {}
                } else {
                  stryCov_9fa48("73184");
                  operation[ReplicaOperationField.REPLICA_IDS] = rowOperation[ReplicaOperationField.REPLICA_IDS];
                }
              }
              if (stryMutAct_9fa48("73187") ? !Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]) || Array.isArray(rowOperation[ReplicaOperationField.PEER_ADDRESSES]) : stryMutAct_9fa48("73186") ? false : stryMutAct_9fa48("73185") ? true : (stryCov_9fa48("73185", "73186", "73187"), (stryMutAct_9fa48("73188") ? Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]) : (stryCov_9fa48("73188"), !Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]))) && Array.isArray(rowOperation[ReplicaOperationField.PEER_ADDRESSES]))) {
                if (stryMutAct_9fa48("73189")) {
                  {}
                } else {
                  stryCov_9fa48("73189");
                  operation[ReplicaOperationField.PEER_ADDRESSES] = rowOperation[ReplicaOperationField.PEER_ADDRESSES];
                }
              }
              dispatchResult = await this.rebalanceCoordinator.executeOperation(operation);
            }
          }
          if (stryMutAct_9fa48("73192") ? !dispatchResult && dispatchResult.success !== true : stryMutAct_9fa48("73191") ? false : stryMutAct_9fa48("73190") ? true : (stryCov_9fa48("73190", "73191", "73192"), (stryMutAct_9fa48("73193") ? dispatchResult : (stryCov_9fa48("73193"), !dispatchResult)) || (stryMutAct_9fa48("73195") ? dispatchResult.success === true : stryMutAct_9fa48("73194") ? false : (stryCov_9fa48("73194", "73195"), dispatchResult.success !== (stryMutAct_9fa48("73196") ? false : (stryCov_9fa48("73196"), true)))))) {
            if (stryMutAct_9fa48("73197")) {
              {}
            } else {
              stryCov_9fa48("73197");
              if (stryMutAct_9fa48("73199") ? false : stryMutAct_9fa48("73198") ? true : (stryCov_9fa48("73198", "73199"), this.deferOperationDispatchRetry(operationId, dispatchResult, row))) {
                if (stryMutAct_9fa48("73200")) {
                  {}
                } else {
                  stryCov_9fa48("73200");
                  return;
                }
              }
              this.recordDispatchFailure(stryMutAct_9fa48("73201") ? {} : (stryCov_9fa48("73201"), {
                operationId,
                targetNodeId,
                workflowStep: stryMutAct_9fa48("73204") ? row.workflow_step && null : stryMutAct_9fa48("73203") ? false : stryMutAct_9fa48("73202") ? true : (stryCov_9fa48("73202", "73203", "73204"), row.workflow_step || null),
                skipped: stryMutAct_9fa48("73207") ? dispatchResult?.skipped !== true : stryMutAct_9fa48("73206") ? false : stryMutAct_9fa48("73205") ? true : (stryCov_9fa48("73205", "73206", "73207"), (stryMutAct_9fa48("73208") ? dispatchResult.skipped : (stryCov_9fa48("73208"), dispatchResult?.skipped)) === (stryMutAct_9fa48("73209") ? false : (stryCov_9fa48("73209"), true))),
                reason: stryMutAct_9fa48("73212") ? dispatchResult?.reason && REPLICA_DISPATCH_SERVICE_LITERAL.DISPATCH_UNSUCCESSFUL : stryMutAct_9fa48("73211") ? false : stryMutAct_9fa48("73210") ? true : (stryCov_9fa48("73210", "73211", "73212"), (stryMutAct_9fa48("73213") ? dispatchResult.reason : (stryCov_9fa48("73213"), dispatchResult?.reason)) || REPLICA_DISPATCH_SERVICE_LITERAL.DISPATCH_UNSUCCESSFUL),
                error: stryMutAct_9fa48("73216") ? dispatchResult?.error && null : stryMutAct_9fa48("73215") ? false : stryMutAct_9fa48("73214") ? true : (stryCov_9fa48("73214", "73215", "73216"), (stryMutAct_9fa48("73217") ? dispatchResult.error : (stryCov_9fa48("73217"), dispatchResult?.error)) || null),
                readinessSnapshot: dispatchReadiness.snapshot
              }));
              return;
            }
          }
          this.clearDeferredOperationDispatchRetry(operationId);
          this.dispatchFailureSignaturesByOperationId.delete(operationId);
          this.emit(DISPATCH_EVENT.OPERATION_DISPATCHED, stryMutAct_9fa48("73218") ? {} : (stryCov_9fa48("73218"), {
            operationId,
            targetNodeId,
            readinessSnapshot: dispatchReadiness.snapshot
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("73219")) {
          {}
        } else {
          stryCov_9fa48("73219");
          if (stryMutAct_9fa48("73221") ? false : stryMutAct_9fa48("73220") ? true : (stryCov_9fa48("73220", "73221"), this.deferOperationDispatchRetry(operationId, error, row))) {
            if (stryMutAct_9fa48("73222")) {
              {}
            } else {
              stryCov_9fa48("73222");
              return;
            }
          }
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("73223")) {
          {}
        } else {
          stryCov_9fa48("73223");
          this.dispatchInFlight.delete(operationId);
        }
      }
    }
  }

  /**
   * Build one retryable readiness-gate error for dispatch.
   * @param {string} targetNodeId
   * @param {string} message
   * @param {string} code
   * @param {number|null|undefined} retryAfterMs
   * @param {Error|null} [cause=null]
   * @return {Error}
   * @private
   */
  buildDispatchReadinessGateError(targetNodeId, message, code, retryAfterMs, cause = null) {
    if (stryMutAct_9fa48("73224")) {
      {}
    } else {
      stryCov_9fa48("73224");
      const error = new Error(message);
      error.code = code;
      error.targetNodeId = stryMutAct_9fa48("73227") ? targetNodeId && null : stryMutAct_9fa48("73226") ? false : stryMutAct_9fa48("73225") ? true : (stryCov_9fa48("73225", "73226", "73227"), targetNodeId || null);
      error.deferRetry = stryMutAct_9fa48("73228") ? false : (stryCov_9fa48("73228"), true);
      error.retryAfterMs = (stryMutAct_9fa48("73231") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("73230") ? false : stryMutAct_9fa48("73229") ? true : (stryCov_9fa48("73229", "73230", "73231"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("73234") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("73233") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("73232") ? true : (stryCov_9fa48("73232", "73233", "73234"), retryAfterMs > NUM.ZERO)))) ? retryAfterMs : this.operationDispatchRetryAfterMs;
      if (stryMutAct_9fa48("73236") ? false : stryMutAct_9fa48("73235") ? true : (stryCov_9fa48("73235", "73236"), cause)) {
        if (stryMutAct_9fa48("73237")) {
          {}
        } else {
          stryCov_9fa48("73237");
          error.cause = cause;
        }
      }
      return error;
    }
  }

  /**
   * Build one readiness-refresh failure error.
   * @param {string} targetNodeId
   * @param {Object} dispatchReadiness
   * @return {Error}
   * @private
   */
  buildDispatchReadinessRefreshFailureError(targetNodeId, dispatchReadiness) {
    if (stryMutAct_9fa48("73238")) {
      {}
    } else {
      stryCov_9fa48("73238");
      const originalError = stryMutAct_9fa48("73239") ? dispatchReadiness.error : (stryCov_9fa48("73239"), dispatchReadiness?.error);
      const originalMessage = (stryMutAct_9fa48("73242") ? typeof originalError?.message === TYPEOF.STRING || originalError.message.length > NUM.ZERO : stryMutAct_9fa48("73241") ? false : stryMutAct_9fa48("73240") ? true : (stryCov_9fa48("73240", "73241", "73242"), (stryMutAct_9fa48("73244") ? typeof originalError?.message !== TYPEOF.STRING : stryMutAct_9fa48("73243") ? true : (stryCov_9fa48("73243", "73244"), typeof (stryMutAct_9fa48("73245") ? originalError.message : (stryCov_9fa48("73245"), originalError?.message)) === TYPEOF.STRING)) && (stryMutAct_9fa48("73248") ? originalError.message.length <= NUM.ZERO : stryMutAct_9fa48("73247") ? originalError.message.length >= NUM.ZERO : stryMutAct_9fa48("73246") ? true : (stryCov_9fa48("73246", "73247", "73248"), originalError.message.length > NUM.ZERO)))) ? originalError.message : String(stryMutAct_9fa48("73251") ? originalError && DISPATCH_READINESS_ERROR_REASON.UNKNOWN : stryMutAct_9fa48("73250") ? false : stryMutAct_9fa48("73249") ? true : (stryCov_9fa48("73249", "73250", "73251"), originalError || DISPATCH_READINESS_ERROR_REASON.UNKNOWN));
      const code = (stryMutAct_9fa48("73254") ? typeof originalError?.code === TYPEOF.STRING || originalError.code.length > NUM.ZERO : stryMutAct_9fa48("73253") ? false : stryMutAct_9fa48("73252") ? true : (stryCov_9fa48("73252", "73253", "73254"), (stryMutAct_9fa48("73256") ? typeof originalError?.code !== TYPEOF.STRING : stryMutAct_9fa48("73255") ? true : (stryCov_9fa48("73255", "73256"), typeof (stryMutAct_9fa48("73257") ? originalError.code : (stryCov_9fa48("73257"), originalError?.code)) === TYPEOF.STRING)) && (stryMutAct_9fa48("73260") ? originalError.code.length <= NUM.ZERO : stryMutAct_9fa48("73259") ? originalError.code.length >= NUM.ZERO : stryMutAct_9fa48("73258") ? true : (stryCov_9fa48("73258", "73259", "73260"), originalError.code.length > NUM.ZERO)))) ? originalError.code : DISPATCH_READINESS_ERROR_CODE.TARGET_NODE_READINESS_REFRESH_FAILED;
      return this.buildDispatchReadinessGateError(targetNodeId, (stryMutAct_9fa48("73261") ? `` : (stryCov_9fa48("73261"), `Target node ${stryMutAct_9fa48("73264") ? targetNodeId && REPLICA_DISPATCH_SERVICE_LITERAL.UNKNOWN : stryMutAct_9fa48("73263") ? false : stryMutAct_9fa48("73262") ? true : (stryCov_9fa48("73262", "73263", "73264"), targetNodeId || REPLICA_DISPATCH_SERVICE_LITERAL.UNKNOWN)} readiness refresh failed: `)) + originalMessage, code, stryMutAct_9fa48("73265") ? dispatchReadiness.retryAfterMs : (stryCov_9fa48("73265"), dispatchReadiness?.retryAfterMs), originalError);
    }
  }

  /**
   * Build one target-not-ready error.
   * @param {string} targetNodeId
   * @param {Object} dispatchReadiness
   * @return {Error}
   * @private
   */
  buildDispatchNotReadyError(targetNodeId, dispatchReadiness) {
    if (stryMutAct_9fa48("73266")) {
      {}
    } else {
      stryCov_9fa48("73266");
      return this.buildDispatchReadinessGateError(targetNodeId, stryMutAct_9fa48("73267") ? `` : (stryCov_9fa48("73267"), `Target node ${stryMutAct_9fa48("73270") ? targetNodeId && REPLICA_DISPATCH_SERVICE_LITERAL.UNKNOWN : stryMutAct_9fa48("73269") ? false : stryMutAct_9fa48("73268") ? true : (stryCov_9fa48("73268", "73269", "73270"), targetNodeId || REPLICA_DISPATCH_SERVICE_LITERAL.UNKNOWN)} is not ready for dispatch`), DISPATCH_READINESS_ERROR_CODE.TARGET_NODE_NOT_READY, stryMutAct_9fa48("73271") ? dispatchReadiness.retryAfterMs : (stryCov_9fa48("73271"), dispatchReadiness?.retryAfterMs));
    }
  }

  /**
   * Retry dispatches for operations targeting a ready node.
   * Re-enters the canonical per-operation queue so ready-node retries cannot
   * create a second inline dispatch owner path.
   * @param {string} nodeId - Ready node ID.
   * @return {Promise<void>}
   * @private
   */
  async retryPendingDispatchesForNode(nodeId) {
    if (stryMutAct_9fa48("73272")) {
      {}
    } else {
      stryCov_9fa48("73272");
      if (stryMutAct_9fa48("73275") ? !nodeId && this.retryInFlightNodes.has(nodeId) : stryMutAct_9fa48("73274") ? false : stryMutAct_9fa48("73273") ? true : (stryCov_9fa48("73273", "73274", "73275"), (stryMutAct_9fa48("73276") ? nodeId : (stryCov_9fa48("73276"), !nodeId)) || this.retryInFlightNodes.has(nodeId))) {
        if (stryMutAct_9fa48("73277")) {
          {}
        } else {
          stryCov_9fa48("73277");
          return;
        }
      }
      this.retryInFlightNodes.add(nodeId);
      try {
        if (stryMutAct_9fa48("73278")) {
          {}
        } else {
          stryCov_9fa48("73278");
          const dispatchRows = await this.getDispatchRetryRowsForNode(nodeId);
          if (stryMutAct_9fa48("73281") ? dispatchRows.length !== NUM.ZERO : stryMutAct_9fa48("73280") ? false : stryMutAct_9fa48("73279") ? true : (stryCov_9fa48("73279", "73280", "73281"), dispatchRows.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("73282")) {
              {}
            } else {
              stryCov_9fa48("73282");
              return;
            }
          }
          this.logger.info(DISPATCH_LOG_MSG.RETRY_PENDING_READY_NODE, stryMutAct_9fa48("73283") ? {} : (stryCov_9fa48("73283"), {
            nodeId,
            pendingCount: dispatchRows.length
          }));
          for (const row of dispatchRows) {
            if (stryMutAct_9fa48("73284")) {
              {}
            } else {
              stryCov_9fa48("73284");
              if (stryMutAct_9fa48("73287") ? false : stryMutAct_9fa48("73286") ? true : stryMutAct_9fa48("73285") ? row?.operation_id : (stryCov_9fa48("73285", "73286", "73287"), !(stryMutAct_9fa48("73288") ? row.operation_id : (stryCov_9fa48("73288"), row?.operation_id)))) {
                if (stryMutAct_9fa48("73289")) {
                  {}
                } else {
                  stryCov_9fa48("73289");
                  continue;
                }
              }
              this.operationDispatchQueue.enqueue(row.operation_id, RECONCILE_REASON.NODE_READY_DISPATCH_RETRY, stryMutAct_9fa48("73290") ? {} : (stryCov_9fa48("73290"), {
                row
              }));
            }
          }
        }
      } finally {
        if (stryMutAct_9fa48("73291")) {
          {}
        } else {
          stryCov_9fa48("73291");
          this.retryInFlightNodes.delete(nodeId);
        }
      }
    }
  }

  /**
   * Read dispatch-retry replica_operations for one target node.
   * Uses SystemTableCache first, then falls back to the authoritative
   * repository owner path when unresolved priority recovery indicates cache
   * visibility may be lagging.
   * @param {string} nodeId - Target node ID.
   * @return {Promise<Array<Object>>} Dispatchable operation rows.
   * @private
   */
  async getDispatchRetryRowsForNode(nodeId) {
    if (stryMutAct_9fa48("73292")) {
      {}
    } else {
      stryCov_9fa48("73292");
      const membershipPublicationService = this.resolveMembershipPublicationService();
      if (stryMutAct_9fa48("73295") ? membershipPublicationService || typeof membershipPublicationService.getDispatchRetryRowsForNode === TYPEOF.FUNCTION : stryMutAct_9fa48("73294") ? false : stryMutAct_9fa48("73293") ? true : (stryCov_9fa48("73293", "73294", "73295"), membershipPublicationService && (stryMutAct_9fa48("73297") ? typeof membershipPublicationService.getDispatchRetryRowsForNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("73296") ? true : (stryCov_9fa48("73296", "73297"), typeof membershipPublicationService.getDispatchRetryRowsForNode === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("73298")) {
          {}
        } else {
          stryCov_9fa48("73298");
          try {
            if (stryMutAct_9fa48("73299")) {
              {}
            } else {
              stryCov_9fa48("73299");
              const dispatchRows = await membershipPublicationService.getDispatchRetryRowsForNode(nodeId);
              return Array.isArray(dispatchRows) ? dispatchRows : stryMutAct_9fa48("73300") ? ["Stryker was here"] : (stryCov_9fa48("73300"), []);
            }
          } catch (error) {
            if (stryMutAct_9fa48("73301")) {
              {}
            } else {
              stryCov_9fa48("73301");
              this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_LOOKUP_FAILED, stryMutAct_9fa48("73302") ? {} : (stryCov_9fa48("73302"), {
                nodeId,
                error: stryMutAct_9fa48("73305") ? error?.message && String(error) : stryMutAct_9fa48("73304") ? false : stryMutAct_9fa48("73303") ? true : (stryCov_9fa48("73303", "73304", "73305"), (stryMutAct_9fa48("73306") ? error.message : (stryCov_9fa48("73306"), error?.message)) || String(error)),
                path: REPLICA_DISPATCH_SERVICE_LITERAL.MEMBERSHIP_PUBLICATION_OWNER_DISPATCH_RETRY
              }));
            }
          }
        }
      }
      const cacheRows = (stryMutAct_9fa48("73309") ? this.replicaOperationsOwner || typeof this.replicaOperationsOwner.listReplicaOperationsFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("73308") ? false : stryMutAct_9fa48("73307") ? true : (stryCov_9fa48("73307", "73308", "73309"), this.replicaOperationsOwner && (stryMutAct_9fa48("73311") ? typeof this.replicaOperationsOwner.listReplicaOperationsFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("73310") ? true : (stryCov_9fa48("73310", "73311"), typeof this.replicaOperationsOwner.listReplicaOperationsFromCache === TYPEOF.FUNCTION)))) ? stryMutAct_9fa48("73314") ? (await this.replicaOperationsOwner.listReplicaOperationsFromCache()).rows && [] : stryMutAct_9fa48("73313") ? false : stryMutAct_9fa48("73312") ? true : (stryCov_9fa48("73312", "73313", "73314"), (await this.replicaOperationsOwner.listReplicaOperationsFromCache()).rows || (stryMutAct_9fa48("73315") ? ["Stryker was here"] : (stryCov_9fa48("73315"), []))) : this.getSystemTableRowsFromCache(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS);
      const dispatchRows = stryMutAct_9fa48("73316") ? cacheRows : (stryCov_9fa48("73316"), cacheRows.filter(row => {
        if (stryMutAct_9fa48("73317")) {
          {}
        } else {
          stryCov_9fa48("73317");
          return stryMutAct_9fa48("73320") ? isCoordinatorOwnedOperationType(row?.type) && this.isReplicaOperationLocallyOwned(row) && row?.target_node_id === nodeId || row?.workflow_step === WORKFLOW_STEP.PENDING || row?.workflow_step === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73319") ? false : stryMutAct_9fa48("73318") ? true : (stryCov_9fa48("73318", "73319", "73320"), (stryMutAct_9fa48("73322") ? isCoordinatorOwnedOperationType(row?.type) && this.isReplicaOperationLocallyOwned(row) || row?.target_node_id === nodeId : stryMutAct_9fa48("73321") ? true : (stryCov_9fa48("73321", "73322"), (stryMutAct_9fa48("73324") ? isCoordinatorOwnedOperationType(row?.type) || this.isReplicaOperationLocallyOwned(row) : stryMutAct_9fa48("73323") ? true : (stryCov_9fa48("73323", "73324"), isCoordinatorOwnedOperationType(stryMutAct_9fa48("73325") ? row.type : (stryCov_9fa48("73325"), row?.type)) && this.isReplicaOperationLocallyOwned(row))) && (stryMutAct_9fa48("73327") ? row?.target_node_id !== nodeId : stryMutAct_9fa48("73326") ? true : (stryCov_9fa48("73326", "73327"), (stryMutAct_9fa48("73328") ? row.target_node_id : (stryCov_9fa48("73328"), row?.target_node_id)) === nodeId)))) && (stryMutAct_9fa48("73330") ? row?.workflow_step === WORKFLOW_STEP.PENDING && row?.workflow_step === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73329") ? true : (stryCov_9fa48("73329", "73330"), (stryMutAct_9fa48("73332") ? row?.workflow_step !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("73331") ? false : (stryCov_9fa48("73331", "73332"), (stryMutAct_9fa48("73333") ? row.workflow_step : (stryCov_9fa48("73333"), row?.workflow_step)) === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("73335") ? row?.workflow_step !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73334") ? false : (stryCov_9fa48("73334", "73335"), (stryMutAct_9fa48("73336") ? row.workflow_step : (stryCov_9fa48("73336"), row?.workflow_step)) === WORKFLOW_STEP.SENDING)))));
        }
      }));
      if (stryMutAct_9fa48("73340") ? dispatchRows.length <= NUM.ZERO : stryMutAct_9fa48("73339") ? dispatchRows.length >= NUM.ZERO : stryMutAct_9fa48("73338") ? false : stryMutAct_9fa48("73337") ? true : (stryCov_9fa48("73337", "73338", "73339", "73340"), dispatchRows.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("73341")) {
          {}
        } else {
          stryCov_9fa48("73341");
          return dispatchRows;
        }
      }
      if (stryMutAct_9fa48("73344") ? false : stryMutAct_9fa48("73343") ? true : stryMutAct_9fa48("73342") ? await this.shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId) : (stryCov_9fa48("73342", "73343", "73344"), !(await this.shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId)))) {
        if (stryMutAct_9fa48("73345")) {
          {}
        } else {
          stryCov_9fa48("73345");
          return dispatchRows;
        }
      }
      return this.getAuthoritativeDispatchRetryRowsForNode(nodeId);
    }
  }

  /**
   * Compatibility alias for older tests/callers. Ready-node retry now
   * re-enters both PENDING and SENDING rows, but the historical method name
   * is kept to avoid a second compatibility seam.
   *
   * @param {string} nodeId
   * @return {Promise<Array<Object>>}
   */
  async getPendingReplicaOpsForNode(nodeId) {
    if (stryMutAct_9fa48("73346")) {
      {}
    } else {
      stryCov_9fa48("73346");
      return this.getDispatchRetryRowsForNode(nodeId);
    }
  }

  /**
   * Decide whether ready-node retry should bypass cache-only rediscovery for
   * unresolved priority control-plane recovery.
   * @param {string} nodeId
   * @return {Promise<boolean>}
   * @private
   */
  async shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId) {
    if (stryMutAct_9fa48("73347")) {
      {}
    } else {
      stryCov_9fa48("73347");
      const readinessService = this.controlPlaneReadinessService;
      if (stryMutAct_9fa48("73350") ? !readinessService && typeof readinessService !== TYPEOF.OBJECT : stryMutAct_9fa48("73349") ? false : stryMutAct_9fa48("73348") ? true : (stryCov_9fa48("73348", "73349", "73350"), (stryMutAct_9fa48("73351") ? readinessService : (stryCov_9fa48("73351"), !readinessService)) || (stryMutAct_9fa48("73353") ? typeof readinessService === TYPEOF.OBJECT : stryMutAct_9fa48("73352") ? false : (stryCov_9fa48("73352", "73353"), typeof readinessService !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("73354")) {
          {}
        } else {
          stryCov_9fa48("73354");
          return stryMutAct_9fa48("73355") ? true : (stryCov_9fa48("73355"), false);
        }
      }
      try {
        if (stryMutAct_9fa48("73356")) {
          {}
        } else {
          stryCov_9fa48("73356");
          return shouldUseAuthoritativePriorityRecoveryRediscovery(nodeId, stryMutAct_9fa48("73357") ? {} : (stryCov_9fa48("73357"), {
            cacheVisible: stryMutAct_9fa48("73358") ? true : (stryCov_9fa48("73358"), false),
            publicationConvergence: await this.resolvePriorityRecoveryPublicationConvergence(readinessService, nodeId)
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("73359")) {
          {}
        } else {
          stryCov_9fa48("73359");
          this.logger.warn(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_REFRESH_FAILED, stryMutAct_9fa48("73360") ? {} : (stryCov_9fa48("73360"), {
            nodeId,
            error: stryMutAct_9fa48("73363") ? error?.message && String(error) : stryMutAct_9fa48("73362") ? false : stryMutAct_9fa48("73361") ? true : (stryCov_9fa48("73361", "73362", "73363"), (stryMutAct_9fa48("73364") ? error.message : (stryCov_9fa48("73364"), error?.message)) || String(error))
          }));
          return stryMutAct_9fa48("73365") ? true : (stryCov_9fa48("73365"), false);
        }
      }
    }
  }

  /**
   * Resolve one publication-convergence snapshot for priority-recovery
   * rediscovery.
   * @param {Object} readinessService
   * @param {string} nodeId
   * @return {Promise<Object|null>}
   * @private
   */
  async resolvePriorityRecoveryPublicationConvergence(readinessService, nodeId) {
    if (stryMutAct_9fa48("73366")) {
      {}
    } else {
      stryCov_9fa48("73366");
      if (stryMutAct_9fa48("73369") ? typeof readinessService.getMembershipPublicationDiagnosticsSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("73368") ? false : stryMutAct_9fa48("73367") ? true : (stryCov_9fa48("73367", "73368", "73369"), typeof readinessService.getMembershipPublicationDiagnosticsSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("73370")) {
          {}
        } else {
          stryCov_9fa48("73370");
          const syncDiagnostics = readinessService.getMembershipPublicationDiagnosticsSync(nodeId, Date.now());
          if (stryMutAct_9fa48("73372") ? false : stryMutAct_9fa48("73371") ? true : (stryCov_9fa48("73371", "73372"), syncDiagnostics)) {
            if (stryMutAct_9fa48("73373")) {
              {}
            } else {
              stryCov_9fa48("73373");
              return syncDiagnostics;
            }
          }
        }
      }
      if (stryMutAct_9fa48("73376") ? typeof readinessService.getMembershipPublicationDiagnostics !== TYPEOF.FUNCTION : stryMutAct_9fa48("73375") ? false : stryMutAct_9fa48("73374") ? true : (stryCov_9fa48("73374", "73375", "73376"), typeof readinessService.getMembershipPublicationDiagnostics === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("73377")) {
          {}
        } else {
          stryCov_9fa48("73377");
          return readinessService.getMembershipPublicationDiagnostics(nodeId, Date.now());
        }
      }
      return null;
    }
  }

  /**
   * Read dispatch-retry operations through the canonical repository owner path
   * when cache coverage is missing under priority recovery.
   * @param {string} nodeId
   * @return {Promise<Array<Object>>}
   * @private
   */
  async getAuthoritativeDispatchRetryRowsForNode(nodeId) {
    if (stryMutAct_9fa48("73378")) {
      {}
    } else {
      stryCov_9fa48("73378");
      const repository = stryMutAct_9fa48("73381") ? this.rebalanceCoordinator?.repository && null : stryMutAct_9fa48("73380") ? false : stryMutAct_9fa48("73379") ? true : (stryCov_9fa48("73379", "73380", "73381"), (stryMutAct_9fa48("73382") ? this.rebalanceCoordinator.repository : (stryCov_9fa48("73382"), this.rebalanceCoordinator?.repository)) || null);
      if (stryMutAct_9fa48("73385") ? !repository && typeof repository.queryIncompleteOperations !== TYPEOF.FUNCTION : stryMutAct_9fa48("73384") ? false : stryMutAct_9fa48("73383") ? true : (stryCov_9fa48("73383", "73384", "73385"), (stryMutAct_9fa48("73386") ? repository : (stryCov_9fa48("73386"), !repository)) || (stryMutAct_9fa48("73388") ? typeof repository.queryIncompleteOperations === TYPEOF.FUNCTION : stryMutAct_9fa48("73387") ? false : (stryCov_9fa48("73387", "73388"), typeof repository.queryIncompleteOperations !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("73389")) {
          {}
        } else {
          stryCov_9fa48("73389");
          return stryMutAct_9fa48("73390") ? ["Stryker was here"] : (stryCov_9fa48("73390"), []);
        }
      }
      try {
        if (stryMutAct_9fa48("73391")) {
          {}
        } else {
          stryCov_9fa48("73391");
          const operations = await repository.queryIncompleteOperations(stryMutAct_9fa48("73392") ? {} : (stryCov_9fa48("73392"), {
            preferAuthoritativeRead: stryMutAct_9fa48("73393") ? false : (stryCov_9fa48("73393"), true)
          }));
          if (stryMutAct_9fa48("73396") ? !Array.isArray(operations) && operations.length === NUM.ZERO : stryMutAct_9fa48("73395") ? false : stryMutAct_9fa48("73394") ? true : (stryCov_9fa48("73394", "73395", "73396"), (stryMutAct_9fa48("73397") ? Array.isArray(operations) : (stryCov_9fa48("73397"), !Array.isArray(operations))) || (stryMutAct_9fa48("73399") ? operations.length !== NUM.ZERO : stryMutAct_9fa48("73398") ? false : (stryCov_9fa48("73398", "73399"), operations.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("73400")) {
              {}
            } else {
              stryCov_9fa48("73400");
              return stryMutAct_9fa48("73401") ? ["Stryker was here"] : (stryCov_9fa48("73401"), []);
            }
          }
          return stryMutAct_9fa48("73402") ? operations.map(operation => this.buildOperationRowFromCoordinator(operation)) : (stryCov_9fa48("73402"), operations.filter(operation => {
            if (stryMutAct_9fa48("73403")) {
              {}
            } else {
              stryCov_9fa48("73403");
              return stryMutAct_9fa48("73406") ? isCoordinatorOwnedOperationType(operation?.type) && this.isReplicaOperationLocallyOwned(operation) && operation?.targetNodeId === nodeId || operation?.workflowStep === WORKFLOW_STEP.PENDING || operation?.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73405") ? false : stryMutAct_9fa48("73404") ? true : (stryCov_9fa48("73404", "73405", "73406"), (stryMutAct_9fa48("73408") ? isCoordinatorOwnedOperationType(operation?.type) && this.isReplicaOperationLocallyOwned(operation) || operation?.targetNodeId === nodeId : stryMutAct_9fa48("73407") ? true : (stryCov_9fa48("73407", "73408"), (stryMutAct_9fa48("73410") ? isCoordinatorOwnedOperationType(operation?.type) || this.isReplicaOperationLocallyOwned(operation) : stryMutAct_9fa48("73409") ? true : (stryCov_9fa48("73409", "73410"), isCoordinatorOwnedOperationType(stryMutAct_9fa48("73411") ? operation.type : (stryCov_9fa48("73411"), operation?.type)) && this.isReplicaOperationLocallyOwned(operation))) && (stryMutAct_9fa48("73413") ? operation?.targetNodeId !== nodeId : stryMutAct_9fa48("73412") ? true : (stryCov_9fa48("73412", "73413"), (stryMutAct_9fa48("73414") ? operation.targetNodeId : (stryCov_9fa48("73414"), operation?.targetNodeId)) === nodeId)))) && (stryMutAct_9fa48("73416") ? operation?.workflowStep === WORKFLOW_STEP.PENDING && operation?.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73415") ? true : (stryCov_9fa48("73415", "73416"), (stryMutAct_9fa48("73418") ? operation?.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("73417") ? false : (stryCov_9fa48("73417", "73418"), (stryMutAct_9fa48("73419") ? operation.workflowStep : (stryCov_9fa48("73419"), operation?.workflowStep)) === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("73421") ? operation?.workflowStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73420") ? false : (stryCov_9fa48("73420", "73421"), (stryMutAct_9fa48("73422") ? operation.workflowStep : (stryCov_9fa48("73422"), operation?.workflowStep)) === WORKFLOW_STEP.SENDING)))));
            }
          }).map(stryMutAct_9fa48("73423") ? () => undefined : (stryCov_9fa48("73423"), operation => this.buildOperationRowFromCoordinator(operation))));
        }
      } catch (error) {
        if (stryMutAct_9fa48("73424")) {
          {}
        } else {
          stryCov_9fa48("73424");
          this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_LOOKUP_FAILED, stryMutAct_9fa48("73425") ? {} : (stryCov_9fa48("73425"), {
            nodeId,
            error: stryMutAct_9fa48("73428") ? error?.message && String(error) : stryMutAct_9fa48("73427") ? false : stryMutAct_9fa48("73426") ? true : (stryCov_9fa48("73426", "73427", "73428"), (stryMutAct_9fa48("73429") ? error.message : (stryCov_9fa48("73429"), error?.message)) || String(error)),
            path: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE_PRIORITY_RECOVERY_RETRY
          }));
          return stryMutAct_9fa48("73430") ? ["Stryker was here"] : (stryCov_9fa48("73430"), []);
        }
      }
    }
  }

  /**
   * Check whether one replica operation row is owned by this node.
   * Ready-node retries must only re-enter operations through the canonical
   * owner, even though replica_operations rows are globally replicated.
   * @param {Object} operation - Replica operation row or object.
   * @return {boolean}
   * @private
   */
  isReplicaOperationLocallyOwned(operation) {
    if (stryMutAct_9fa48("73431")) {
      {}
    } else {
      stryCov_9fa48("73431");
      if (stryMutAct_9fa48("73434") ? !operation && typeof operation !== TYPEOF.OBJECT : stryMutAct_9fa48("73433") ? false : stryMutAct_9fa48("73432") ? true : (stryCov_9fa48("73432", "73433", "73434"), (stryMutAct_9fa48("73435") ? operation : (stryCov_9fa48("73435"), !operation)) || (stryMutAct_9fa48("73437") ? typeof operation === TYPEOF.OBJECT : stryMutAct_9fa48("73436") ? false : (stryCov_9fa48("73436", "73437"), typeof operation !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("73438")) {
          {}
        } else {
          stryCov_9fa48("73438");
          return stryMutAct_9fa48("73439") ? true : (stryCov_9fa48("73439"), false);
        }
      }
      if (stryMutAct_9fa48("73442") ? this.rebalanceCoordinator || typeof this.rebalanceCoordinator.isOperationLocallyOwned === TYPEOF.FUNCTION : stryMutAct_9fa48("73441") ? false : stryMutAct_9fa48("73440") ? true : (stryCov_9fa48("73440", "73441", "73442"), this.rebalanceCoordinator && (stryMutAct_9fa48("73444") ? typeof this.rebalanceCoordinator.isOperationLocallyOwned !== TYPEOF.FUNCTION : stryMutAct_9fa48("73443") ? true : (stryCov_9fa48("73443", "73444"), typeof this.rebalanceCoordinator.isOperationLocallyOwned === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("73445")) {
          {}
        } else {
          stryCov_9fa48("73445");
          return this.rebalanceCoordinator.isOperationLocallyOwned(operation);
        }
      }
      if (stryMutAct_9fa48("73448") ? this.rebalanceCoordinator || typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId === TYPEOF.FUNCTION : stryMutAct_9fa48("73447") ? false : stryMutAct_9fa48("73446") ? true : (stryCov_9fa48("73446", "73447", "73448"), this.rebalanceCoordinator && (stryMutAct_9fa48("73450") ? typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId !== TYPEOF.FUNCTION : stryMutAct_9fa48("73449") ? true : (stryCov_9fa48("73449", "73450"), typeof this.rebalanceCoordinator.resolveOperationOwnerNodeId === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("73451")) {
          {}
        } else {
          stryCov_9fa48("73451");
          return stryMutAct_9fa48("73454") ? this.rebalanceCoordinator.resolveOperationOwnerNodeId(operation) !== this.nodeId : stryMutAct_9fa48("73453") ? false : stryMutAct_9fa48("73452") ? true : (stryCov_9fa48("73452", "73453", "73454"), this.rebalanceCoordinator.resolveOperationOwnerNodeId(operation) === this.nodeId);
        }
      }
      return stryMutAct_9fa48("73457") ? String(operation?.sourceNodeId || operation?.source_node_id || REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING) !== this.nodeId : stryMutAct_9fa48("73456") ? false : stryMutAct_9fa48("73455") ? true : (stryCov_9fa48("73455", "73456", "73457"), String(stryMutAct_9fa48("73460") ? (operation?.sourceNodeId || operation?.source_node_id) && REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING : stryMutAct_9fa48("73459") ? false : stryMutAct_9fa48("73458") ? true : (stryCov_9fa48("73458", "73459", "73460"), (stryMutAct_9fa48("73462") ? operation?.sourceNodeId && operation?.source_node_id : stryMutAct_9fa48("73461") ? false : (stryCov_9fa48("73461", "73462"), (stryMutAct_9fa48("73463") ? operation.sourceNodeId : (stryCov_9fa48("73463"), operation?.sourceNodeId)) || (stryMutAct_9fa48("73464") ? operation.source_node_id : (stryCov_9fa48("73464"), operation?.source_node_id)))) || REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING)) === this.nodeId);
    }
  }

  /**
   * Retry pending dispatches for a ready node while deduping duplicate
   * triggers for the same heartbeat row.
   * @param {Object} options - Retry trigger details.
   * @param {string} options.nodeId - Target node ID.
   * @param {Object} [options.nodeRow] - Candidate nodes row.
   * @param {string} [options.source] - Trigger source for diagnostics.
   * @return {Promise<boolean>} True when retry path was executed.
   * @private
   */
  async retryPendingDispatchesForReadyNode(options = {}) {
    if (stryMutAct_9fa48("73465")) {
      {}
    } else {
      stryCov_9fa48("73465");
      const nodeId = options.nodeId;
      if (stryMutAct_9fa48("73468") ? !nodeId && !this.isNodeReady(nodeId) : stryMutAct_9fa48("73467") ? false : stryMutAct_9fa48("73466") ? true : (stryCov_9fa48("73466", "73467", "73468"), (stryMutAct_9fa48("73469") ? nodeId : (stryCov_9fa48("73469"), !nodeId)) || (stryMutAct_9fa48("73470") ? this.isNodeReady(nodeId) : (stryCov_9fa48("73470"), !this.isNodeReady(nodeId))))) {
        if (stryMutAct_9fa48("73471")) {
          {}
        } else {
          stryCov_9fa48("73471");
          this.clearNodeReadyRetryWatermark(nodeId);
          return stryMutAct_9fa48("73472") ? true : (stryCov_9fa48("73472"), false);
        }
      }
      const nodeRow = (stryMutAct_9fa48("73475") ? options.nodeRow || typeof options.nodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("73474") ? false : stryMutAct_9fa48("73473") ? true : (stryCov_9fa48("73473", "73474", "73475"), options.nodeRow && (stryMutAct_9fa48("73477") ? typeof options.nodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("73476") ? true : (stryCov_9fa48("73476", "73477"), typeof options.nodeRow === TYPEOF.OBJECT)))) ? options.nodeRow : await this.getNodeRow(nodeId);
      if (stryMutAct_9fa48("73480") ? nodeRow || !wasNodeRecordReadyWhenWritten(nodeRow, {
        requireActiveStatus: true
      }) : stryMutAct_9fa48("73479") ? false : stryMutAct_9fa48("73478") ? true : (stryCov_9fa48("73478", "73479", "73480"), nodeRow && (stryMutAct_9fa48("73481") ? wasNodeRecordReadyWhenWritten(nodeRow, {
        requireActiveStatus: true
      }) : (stryCov_9fa48("73481"), !wasNodeRecordReadyWhenWritten(nodeRow, stryMutAct_9fa48("73482") ? {} : (stryCov_9fa48("73482"), {
        requireActiveStatus: stryMutAct_9fa48("73483") ? false : (stryCov_9fa48("73483"), true)
      })))))) {
        if (stryMutAct_9fa48("73484")) {
          {}
        } else {
          stryCov_9fa48("73484");
          return stryMutAct_9fa48("73485") ? true : (stryCov_9fa48("73485"), false);
        }
      }
      if (stryMutAct_9fa48("73488") ? false : stryMutAct_9fa48("73487") ? true : stryMutAct_9fa48("73486") ? this.shouldRetryNodeReadyWatermark(nodeId, nodeRow) : (stryCov_9fa48("73486", "73487", "73488"), !this.shouldRetryNodeReadyWatermark(nodeId, nodeRow))) {
        if (stryMutAct_9fa48("73489")) {
          {}
        } else {
          stryCov_9fa48("73489");
          this.logger.debug(DISPATCH_LOG_MSG.RETRY_READY_TRIGGER_SKIPPED, stryMutAct_9fa48("73490") ? {} : (stryCov_9fa48("73490"), {
            nodeId,
            source: stryMutAct_9fa48("73493") ? options.source && null : stryMutAct_9fa48("73492") ? false : stryMutAct_9fa48("73491") ? true : (stryCov_9fa48("73491", "73492", "73493"), options.source || null),
            reason: REPLICA_DISPATCH_SERVICE_LITERAL.DUPLICATE_READY_TRIGGER
          }));
          return stryMutAct_9fa48("73494") ? true : (stryCov_9fa48("73494"), false);
        }
      }
      await this.retryPendingDispatchesForNode(nodeId);
      return stryMutAct_9fa48("73495") ? false : (stryCov_9fa48("73495"), true);
    }
  }

  /**
   * Reconcile callback for the operation dispatch queue.
   * Resolves the operation row and dispatches or executes it.
   * @param {string} operationId - The operation to reconcile.
   * @param {Object} [context] - Context from the enqueue call.
   * @private
   */
  async reconcileOperationDispatch(operationId, context) {
    if (stryMutAct_9fa48("73496")) {
      {}
    } else {
      stryCov_9fa48("73496");
      if (stryMutAct_9fa48("73499") ? false : stryMutAct_9fa48("73498") ? true : stryMutAct_9fa48("73497") ? this.rebalanceCoordinator : (stryCov_9fa48("73497", "73498", "73499"), !this.rebalanceCoordinator)) {
        if (stryMutAct_9fa48("73500")) {
          {}
        } else {
          stryCov_9fa48("73500");
          return;
        }
      }
      let row = stryMutAct_9fa48("73503") ? context?.row && null : stryMutAct_9fa48("73502") ? false : stryMutAct_9fa48("73501") ? true : (stryCov_9fa48("73501", "73502", "73503"), (stryMutAct_9fa48("73504") ? context.row : (stryCov_9fa48("73504"), context?.row)) || null);
      if (stryMutAct_9fa48("73507") ? false : stryMutAct_9fa48("73506") ? true : stryMutAct_9fa48("73505") ? row : (stryCov_9fa48("73505", "73506", "73507"), !row)) {
        if (stryMutAct_9fa48("73508")) {
          {}
        } else {
          stryCov_9fa48("73508");
          row = await this.getReplicaOperationRow(operationId);
        }
      }
      if (stryMutAct_9fa48("73511") ? !row && !row.operation_id : stryMutAct_9fa48("73510") ? false : stryMutAct_9fa48("73509") ? true : (stryCov_9fa48("73509", "73510", "73511"), (stryMutAct_9fa48("73512") ? row : (stryCov_9fa48("73512"), !row)) || (stryMutAct_9fa48("73513") ? row.operation_id : (stryCov_9fa48("73513"), !row.operation_id)))) {
        if (stryMutAct_9fa48("73514")) {
          {}
        } else {
          stryCov_9fa48("73514");
          this.clearDeferredOperationDispatchRetry(operationId);
          return;
        }
      }
      if (stryMutAct_9fa48("73517") ? false : stryMutAct_9fa48("73516") ? true : stryMutAct_9fa48("73515") ? isCoordinatorOwnedOperationType(row.type) : (stryCov_9fa48("73515", "73516", "73517"), !isCoordinatorOwnedOperationType(row.type))) {
        if (stryMutAct_9fa48("73518")) {
          {}
        } else {
          stryCov_9fa48("73518");
          this.clearDeferredOperationDispatchRetry(operationId);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("73519")) {
          {}
        } else {
          stryCov_9fa48("73519");
          if (stryMutAct_9fa48("73522") ? row.type === OperationType.REPLACE || row.workflow_step === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("73521") ? false : stryMutAct_9fa48("73520") ? true : (stryCov_9fa48("73520", "73521", "73522"), (stryMutAct_9fa48("73524") ? row.type !== OperationType.REPLACE : stryMutAct_9fa48("73523") ? true : (stryCov_9fa48("73523", "73524"), row.type === OperationType.REPLACE)) && (stryMutAct_9fa48("73526") ? row.workflow_step !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("73525") ? true : (stryCov_9fa48("73525", "73526"), row.workflow_step === WORKFLOW_STEP.ACTIVE)))) {
            if (stryMutAct_9fa48("73527")) {
              {}
            } else {
              stryCov_9fa48("73527");
              this.clearDeferredOperationDispatchRetry(operationId);
              const operation = this.buildOperationFromRow(row);
              if (stryMutAct_9fa48("73530") ? typeof this.rebalanceCoordinator.dispatchOperation !== TYPEOF.FUNCTION : stryMutAct_9fa48("73529") ? false : stryMutAct_9fa48("73528") ? true : (stryCov_9fa48("73528", "73529", "73530"), typeof this.rebalanceCoordinator.dispatchOperation === TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("73531")) {
                  {}
                } else {
                  stryCov_9fa48("73531");
                  await this.rebalanceCoordinator.dispatchOperation(operation);
                }
              } else {
                if (stryMutAct_9fa48("73532")) {
                  {}
                } else {
                  stryCov_9fa48("73532");
                  await this.rebalanceCoordinator.executeOperation(operation);
                }
              }
              return;
            }
          }
          if (stryMutAct_9fa48("73535") ? row.workflow_step !== WORKFLOW_STEP.PENDING || row.workflow_step !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73534") ? false : stryMutAct_9fa48("73533") ? true : (stryCov_9fa48("73533", "73534", "73535"), (stryMutAct_9fa48("73537") ? row.workflow_step === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("73536") ? true : (stryCov_9fa48("73536", "73537"), row.workflow_step !== WORKFLOW_STEP.PENDING)) && (stryMutAct_9fa48("73539") ? row.workflow_step === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73538") ? true : (stryCov_9fa48("73538", "73539"), row.workflow_step !== WORKFLOW_STEP.SENDING)))) {
            if (stryMutAct_9fa48("73540")) {
              {}
            } else {
              stryCov_9fa48("73540");
              this.clearDeferredOperationDispatchRetry(operationId);
              return;
            }
          }
          await this.dispatchOperationRow(row);
        }
      } catch (error) {
        if (stryMutAct_9fa48("73541")) {
          {}
        } else {
          stryCov_9fa48("73541");
          if (stryMutAct_9fa48("73543") ? false : stryMutAct_9fa48("73542") ? true : (stryCov_9fa48("73542", "73543"), this.deferOperationDispatchRetry(operationId, error, row))) {
            if (stryMutAct_9fa48("73544")) {
              {}
            } else {
              stryCov_9fa48("73544");
              return;
            }
          }
          throw error;
        }
      }
    }
  }

  /**
   * Reconcile callback for the node-ready retry queue.
   * Checks readiness and retries pending dispatches for the node.
   * @param {string} nodeId - The node to reconcile.
   * @param {Object} [context] - Context from the enqueue call.
   * @private
   */
  async reconcileNodeReadyRetry(nodeId, context) {
    if (stryMutAct_9fa48("73545")) {
      {}
    } else {
      stryCov_9fa48("73545");
      const nodeRow = stryMutAct_9fa48("73548") ? context?.nodeRow && null : stryMutAct_9fa48("73547") ? false : stryMutAct_9fa48("73546") ? true : (stryCov_9fa48("73546", "73547", "73548"), (stryMutAct_9fa48("73549") ? context.nodeRow : (stryCov_9fa48("73549"), context?.nodeRow)) || null);
      await this.retryPendingDispatchesForReadyNode(stryMutAct_9fa48("73550") ? {} : (stryCov_9fa48("73550"), {
        nodeId,
        nodeRow
      }));
    }
  }

  /**
   * Reconcile callback for the node-state update queue.
   * Applies the latest queued payload for one node.
   * @param {string} nodeId - The node to reconcile.
   * @param {Object} [context] - Context from the enqueue call.
   * @return {Promise<void>}
   * @private
   */
  async reconcileNodeStateUpdate(nodeId, context) {
    if (stryMutAct_9fa48("73551")) {
      {}
    } else {
      stryCov_9fa48("73551");
      const payload = stryMutAct_9fa48("73554") ? context?.payload && null : stryMutAct_9fa48("73553") ? false : stryMutAct_9fa48("73552") ? true : (stryCov_9fa48("73552", "73553", "73554"), (stryMutAct_9fa48("73555") ? context.payload : (stryCov_9fa48("73555"), context?.payload)) || null);
      if (stryMutAct_9fa48("73558") ? !payload && payload[ControlPlaneField.NODE_ID] !== nodeId : stryMutAct_9fa48("73557") ? false : stryMutAct_9fa48("73556") ? true : (stryCov_9fa48("73556", "73557", "73558"), (stryMutAct_9fa48("73559") ? payload : (stryCov_9fa48("73559"), !payload)) || (stryMutAct_9fa48("73561") ? payload[ControlPlaneField.NODE_ID] === nodeId : stryMutAct_9fa48("73560") ? false : (stryCov_9fa48("73560", "73561"), payload[ControlPlaneField.NODE_ID] !== nodeId)))) {
        if (stryMutAct_9fa48("73562")) {
          {}
        } else {
          stryCov_9fa48("73562");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("73563")) {
          {}
        } else {
          stryCov_9fa48("73563");
          await this.handleNodeStateUpdate(payload);
          this.clearDeferredNodeStateUpdateRetry(nodeId);
        }
      } catch (error) {
        if (stryMutAct_9fa48("73564")) {
          {}
        } else {
          stryCov_9fa48("73564");
          if (stryMutAct_9fa48("73567") ? false : stryMutAct_9fa48("73566") ? true : stryMutAct_9fa48("73565") ? this.shouldDeferNodeStateUpdateRetry(error) : (stryCov_9fa48("73565", "73566", "73567"), !this.shouldDeferNodeStateUpdateRetry(error))) {
            if (stryMutAct_9fa48("73568")) {
              {}
            } else {
              stryCov_9fa48("73568");
              throw error;
            }
          }
          const retryAfterMs = this.deferNodeStateUpdateRetry(nodeId, payload, error);
          this.logger.info(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, stryMutAct_9fa48("73569") ? {} : (stryCov_9fa48("73569"), {
            nodeId,
            retryAfterMs,
            error: error.message,
            errorCode: stryMutAct_9fa48("73572") ? error?.code && null : stryMutAct_9fa48("73571") ? false : stryMutAct_9fa48("73570") ? true : (stryCov_9fa48("73570", "73571", "73572"), (stryMutAct_9fa48("73573") ? error.code : (stryCov_9fa48("73573"), error?.code)) || null)
          }));
        }
      }
    }
  }

  /**
   * Handle cache updates and retry dispatch when key rows become available.
   * @param {string} tableName - Updated table name.
   * @param {string|Object} operationOrRecord - Operation or updated row.
   * @param {Object} [recordInput] - Updated row.
   * @private
   */
  handleCacheNodeChange(tableName, operationOrRecord, recordInput) {
    if (stryMutAct_9fa48("73574")) {
      {}
    } else {
      stryCov_9fa48("73574");
      const operation = (stryMutAct_9fa48("73577") ? typeof operationOrRecord !== TYPEOF.STRING : stryMutAct_9fa48("73576") ? false : stryMutAct_9fa48("73575") ? true : (stryCov_9fa48("73575", "73576", "73577"), typeof operationOrRecord === TYPEOF.STRING)) ? operationOrRecord : null;
      const record = stryMutAct_9fa48("73580") ? recordInput && operationOrRecord : stryMutAct_9fa48("73579") ? false : stryMutAct_9fa48("73578") ? true : (stryCov_9fa48("73578", "73579", "73580"), recordInput || operationOrRecord);
      if (stryMutAct_9fa48("73583") ? false : stryMutAct_9fa48("73582") ? true : stryMutAct_9fa48("73581") ? record : (stryCov_9fa48("73581", "73582", "73583"), !record)) {
        if (stryMutAct_9fa48("73584")) {
          {}
        } else {
          stryCov_9fa48("73584");
          return;
        }
      }
      if (stryMutAct_9fa48("73587") ? tableName !== SYSTEM_TABLE_NAME.NODES : stryMutAct_9fa48("73586") ? false : stryMutAct_9fa48("73585") ? true : (stryCov_9fa48("73585", "73586", "73587"), tableName === SYSTEM_TABLE_NAME.NODES)) {
        if (stryMutAct_9fa48("73588")) {
          {}
        } else {
          stryCov_9fa48("73588");
          const nodeId = this.getNodeIdFromRecord(record);
          if (stryMutAct_9fa48("73591") ? false : stryMutAct_9fa48("73590") ? true : stryMutAct_9fa48("73589") ? nodeId : (stryCov_9fa48("73589", "73590", "73591"), !nodeId)) {
            if (stryMutAct_9fa48("73592")) {
              {}
            } else {
              stryCov_9fa48("73592");
              return;
            }
          }
          this.nodeReadyRetryQueue.enqueue(nodeId, RECONCILE_REASON.NODES_CACHE_READY, stryMutAct_9fa48("73593") ? {} : (stryCov_9fa48("73593"), {
            nodeRow: record
          }));
          return;
        }
      }
      if (stryMutAct_9fa48("73596") ? tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS : stryMutAct_9fa48("73595") ? false : stryMutAct_9fa48("73594") ? true : (stryCov_9fa48("73594", "73595", "73596"), tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)) {
        if (stryMutAct_9fa48("73597")) {
          {}
        } else {
          stryCov_9fa48("73597");
          if (stryMutAct_9fa48("73600") ? operation !== REPLICA_DISPATCH_SERVICE_LITERAL.DELETE : stryMutAct_9fa48("73599") ? false : stryMutAct_9fa48("73598") ? true : (stryCov_9fa48("73598", "73599", "73600"), operation === REPLICA_DISPATCH_SERVICE_LITERAL.DELETE)) {
            if (stryMutAct_9fa48("73601")) {
              {}
            } else {
              stryCov_9fa48("73601");
              return;
            }
          }
          this.enqueueReplicaOperationRow(record, stryMutAct_9fa48("73602") ? {} : (stryCov_9fa48("73602"), {
            pendingReason: RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_PENDING,
            replaceActiveReason: RECONCILE_REASON.REPLICA_OPERATIONS_CACHE_REPLACE_ACTIVE
          }));
          return;
        }
      }
      if (stryMutAct_9fa48("73605") ? tableName === SYSTEM_TABLE_NAME.SERVICES : stryMutAct_9fa48("73604") ? false : stryMutAct_9fa48("73603") ? true : (stryCov_9fa48("73603", "73604", "73605"), tableName !== SYSTEM_TABLE_NAME.SERVICES)) {
        if (stryMutAct_9fa48("73606")) {
          {}
        } else {
          stryCov_9fa48("73606");
          return;
        }
      }
      const nodeId = this.getNodeIdFromRecord(record);
      const status = stryMutAct_9fa48("73609") ? (record?.[COLUMN.STATUS] || record?.status) && null : stryMutAct_9fa48("73608") ? false : stryMutAct_9fa48("73607") ? true : (stryCov_9fa48("73607", "73608", "73609"), (stryMutAct_9fa48("73611") ? record?.[COLUMN.STATUS] && record?.status : stryMutAct_9fa48("73610") ? false : (stryCov_9fa48("73610", "73611"), (stryMutAct_9fa48("73612") ? record[COLUMN.STATUS] : (stryCov_9fa48("73612"), record?.[COLUMN.STATUS])) || (stryMutAct_9fa48("73613") ? record.status : (stryCov_9fa48("73613"), record?.status)))) || null);
      if (stryMutAct_9fa48("73616") ? (!nodeId || status !== SERVICE_STATUS.ACTIVE) && !this.isNodeReady(nodeId) : stryMutAct_9fa48("73615") ? false : stryMutAct_9fa48("73614") ? true : (stryCov_9fa48("73614", "73615", "73616"), (stryMutAct_9fa48("73618") ? !nodeId && status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("73617") ? false : (stryCov_9fa48("73617", "73618"), (stryMutAct_9fa48("73619") ? nodeId : (stryCov_9fa48("73619"), !nodeId)) || (stryMutAct_9fa48("73621") ? status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("73620") ? false : (stryCov_9fa48("73620", "73621"), status !== SERVICE_STATUS.ACTIVE)))) || (stryMutAct_9fa48("73622") ? this.isNodeReady(nodeId) : (stryCov_9fa48("73622"), !this.isNodeReady(nodeId))))) {
        if (stryMutAct_9fa48("73623")) {
          {}
        } else {
          stryCov_9fa48("73623");
          return;
        }
      }
      this.nodeReadyRetryQueue.enqueue(nodeId, RECONCILE_REASON.SERVICES_CACHE_ACTIVE);
    }
  }

  /**
   * Enqueue a locally owned replica operation row for dispatch reconciliation.
   * Cache and CDC visibility can arrive on different nodes or at different
   * times, so both paths must converge on the same local-owner gate. SENDING
   * rows remain replayable because retryable dispatch failures deliberately
   * park persisted workflow state in SENDING until the owner re-arms it.
   * @param {Object} row - Replica operation row.
   * @param {Object} reasons - Reconcile reason overrides.
   * @param {string} reasons.pendingReason - Reason for pending rows.
   * @param {string} reasons.replaceActiveReason - Reason for active REPLACE rows.
   * @return {boolean} True when a reconcile item was enqueued.
   * @private
   */
  enqueueReplicaOperationRow(row, reasons) {
    if (stryMutAct_9fa48("73624")) {
      {}
    } else {
      stryCov_9fa48("73624");
      if (stryMutAct_9fa48("73627") ? !row && !row.operation_id : stryMutAct_9fa48("73626") ? false : stryMutAct_9fa48("73625") ? true : (stryCov_9fa48("73625", "73626", "73627"), (stryMutAct_9fa48("73628") ? row : (stryCov_9fa48("73628"), !row)) || (stryMutAct_9fa48("73629") ? row.operation_id : (stryCov_9fa48("73629"), !row.operation_id)))) {
        if (stryMutAct_9fa48("73630")) {
          {}
        } else {
          stryCov_9fa48("73630");
          return stryMutAct_9fa48("73631") ? true : (stryCov_9fa48("73631"), false);
        }
      }
      if (stryMutAct_9fa48("73634") ? !isCoordinatorOwnedOperationType(row.type) && !this.isReplicaOperationLocallyOwned(row) : stryMutAct_9fa48("73633") ? false : stryMutAct_9fa48("73632") ? true : (stryCov_9fa48("73632", "73633", "73634"), (stryMutAct_9fa48("73635") ? isCoordinatorOwnedOperationType(row.type) : (stryCov_9fa48("73635"), !isCoordinatorOwnedOperationType(row.type))) || (stryMutAct_9fa48("73636") ? this.isReplicaOperationLocallyOwned(row) : (stryCov_9fa48("73636"), !this.isReplicaOperationLocallyOwned(row))))) {
        if (stryMutAct_9fa48("73637")) {
          {}
        } else {
          stryCov_9fa48("73637");
          return stryMutAct_9fa48("73638") ? true : (stryCov_9fa48("73638"), false);
        }
      }
      if (stryMutAct_9fa48("73641") ? row.type === OperationType.REPLACE || row.workflow_step === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("73640") ? false : stryMutAct_9fa48("73639") ? true : (stryCov_9fa48("73639", "73640", "73641"), (stryMutAct_9fa48("73643") ? row.type !== OperationType.REPLACE : stryMutAct_9fa48("73642") ? true : (stryCov_9fa48("73642", "73643"), row.type === OperationType.REPLACE)) && (stryMutAct_9fa48("73645") ? row.workflow_step !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("73644") ? true : (stryCov_9fa48("73644", "73645"), row.workflow_step === WORKFLOW_STEP.ACTIVE)))) {
        if (stryMutAct_9fa48("73646")) {
          {}
        } else {
          stryCov_9fa48("73646");
          this.operationDispatchQueue.enqueue(row.operation_id, reasons.replaceActiveReason, stryMutAct_9fa48("73647") ? {} : (stryCov_9fa48("73647"), {
            row
          }));
          return stryMutAct_9fa48("73648") ? false : (stryCov_9fa48("73648"), true);
        }
      }
      if (stryMutAct_9fa48("73651") ? row.workflow_step !== WORKFLOW_STEP.PENDING || row.workflow_step !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73650") ? false : stryMutAct_9fa48("73649") ? true : (stryCov_9fa48("73649", "73650", "73651"), (stryMutAct_9fa48("73653") ? row.workflow_step === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("73652") ? true : (stryCov_9fa48("73652", "73653"), row.workflow_step !== WORKFLOW_STEP.PENDING)) && (stryMutAct_9fa48("73655") ? row.workflow_step === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("73654") ? true : (stryCov_9fa48("73654", "73655"), row.workflow_step !== WORKFLOW_STEP.SENDING)))) {
        if (stryMutAct_9fa48("73656")) {
          {}
        } else {
          stryCov_9fa48("73656");
          return stryMutAct_9fa48("73657") ? true : (stryCov_9fa48("73657"), false);
        }
      }
      this.operationDispatchQueue.enqueue(row.operation_id, reasons.pendingReason, stryMutAct_9fa48("73658") ? {} : (stryCov_9fa48("73658"), {
        row
      }));
      return stryMutAct_9fa48("73659") ? false : (stryCov_9fa48("73659"), true);
    }
  }

  /**
   * Resolve node id from a system row shape.
   * @param {Object} record - Row object.
   * @return {string|null} Node ID.
   * @private
   */
  getNodeIdFromRecord(record) {
    if (stryMutAct_9fa48("73660")) {
      {}
    } else {
      stryCov_9fa48("73660");
      return stryMutAct_9fa48("73663") ? (record?.[COLUMN.NODE_ID] || record?.node_id || record?.id) && null : stryMutAct_9fa48("73662") ? false : stryMutAct_9fa48("73661") ? true : (stryCov_9fa48("73661", "73662", "73663"), (stryMutAct_9fa48("73665") ? (record?.[COLUMN.NODE_ID] || record?.node_id) && record?.id : stryMutAct_9fa48("73664") ? false : (stryCov_9fa48("73664", "73665"), (stryMutAct_9fa48("73667") ? record?.[COLUMN.NODE_ID] && record?.node_id : stryMutAct_9fa48("73666") ? false : (stryCov_9fa48("73666", "73667"), (stryMutAct_9fa48("73668") ? record[COLUMN.NODE_ID] : (stryCov_9fa48("73668"), record?.[COLUMN.NODE_ID])) || (stryMutAct_9fa48("73669") ? record.node_id : (stryCov_9fa48("73669"), record?.node_id)))) || (stryMutAct_9fa48("73670") ? record.id : (stryCov_9fa48("73670"), record?.id)))) || null);
    }
  }

  /**
   * Clear cached ready-trigger watermark for one node.
   * @param {string} nodeId - Node ID.
   * @private
   */
  clearNodeReadyRetryWatermark(nodeId) {
    if (stryMutAct_9fa48("73671")) {
      {}
    } else {
      stryCov_9fa48("73671");
      if (stryMutAct_9fa48("73674") ? false : stryMutAct_9fa48("73673") ? true : stryMutAct_9fa48("73672") ? nodeId : (stryCov_9fa48("73672", "73673", "73674"), !nodeId)) {
        if (stryMutAct_9fa48("73675")) {
          {}
        } else {
          stryCov_9fa48("73675");
          return;
        }
      }
      this.nodeReadyRetryWatermarks.delete(nodeId);
    }
  }

  /**
   * Build a comparable watermark for one ready row.
   * @param {Object} nodeRow - Nodes row candidate.
   * @return {Object|null} Comparable watermark or null when unavailable.
   * @private
   */
  getNodeReadyRetryWatermark(nodeRow) {
    if (stryMutAct_9fa48("73676")) {
      {}
    } else {
      stryCov_9fa48("73676");
      const heartbeatAt = Number(stryMutAct_9fa48("73679") ? nodeRow?.[COLUMN.LAST_HEARTBEAT] && nodeRow?.last_heartbeat : stryMutAct_9fa48("73678") ? false : stryMutAct_9fa48("73677") ? true : (stryCov_9fa48("73677", "73678", "73679"), (stryMutAct_9fa48("73680") ? nodeRow[COLUMN.LAST_HEARTBEAT] : (stryCov_9fa48("73680"), nodeRow?.[COLUMN.LAST_HEARTBEAT])) || (stryMutAct_9fa48("73681") ? nodeRow.last_heartbeat : (stryCov_9fa48("73681"), nodeRow?.last_heartbeat))));
      const readyLeaseExpiresAt = Number(stryMutAct_9fa48("73684") ? nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] && nodeRow?.ready_lease_expires_at : stryMutAct_9fa48("73683") ? false : stryMutAct_9fa48("73682") ? true : (stryCov_9fa48("73682", "73683", "73684"), (stryMutAct_9fa48("73685") ? nodeRow[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("73685"), nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT])) || (stryMutAct_9fa48("73686") ? nodeRow.ready_lease_expires_at : (stryCov_9fa48("73686"), nodeRow?.ready_lease_expires_at))));
      if (stryMutAct_9fa48("73689") ? !Number.isFinite(heartbeatAt) && !Number.isFinite(readyLeaseExpiresAt) : stryMutAct_9fa48("73688") ? false : stryMutAct_9fa48("73687") ? true : (stryCov_9fa48("73687", "73688", "73689"), (stryMutAct_9fa48("73690") ? Number.isFinite(heartbeatAt) : (stryCov_9fa48("73690"), !Number.isFinite(heartbeatAt))) || (stryMutAct_9fa48("73691") ? Number.isFinite(readyLeaseExpiresAt) : (stryCov_9fa48("73691"), !Number.isFinite(readyLeaseExpiresAt))))) {
        if (stryMutAct_9fa48("73692")) {
          {}
        } else {
          stryCov_9fa48("73692");
          return null;
        }
      }
      return stryMutAct_9fa48("73693") ? {} : (stryCov_9fa48("73693"), {
        heartbeatAt,
        readyLeaseExpiresAt
      });
    }
  }

  /**
   * Compare two ready-row watermarks for monotonic retry progression.
   * @param {Object|null} previous - Previous watermark.
   * @param {Object|null} next - Next watermark.
   * @return {boolean} True when next watermark is newer.
   * @private
   */
  isNodeReadyRetryWatermarkNewer(previous, next) {
    if (stryMutAct_9fa48("73694")) {
      {}
    } else {
      stryCov_9fa48("73694");
      if (stryMutAct_9fa48("73697") ? false : stryMutAct_9fa48("73696") ? true : stryMutAct_9fa48("73695") ? previous : (stryCov_9fa48("73695", "73696", "73697"), !previous)) {
        if (stryMutAct_9fa48("73698")) {
          {}
        } else {
          stryCov_9fa48("73698");
          return stryMutAct_9fa48("73699") ? false : (stryCov_9fa48("73699"), true);
        }
      }
      if (stryMutAct_9fa48("73702") ? false : stryMutAct_9fa48("73701") ? true : stryMutAct_9fa48("73700") ? next : (stryCov_9fa48("73700", "73701", "73702"), !next)) {
        if (stryMutAct_9fa48("73703")) {
          {}
        } else {
          stryCov_9fa48("73703");
          return stryMutAct_9fa48("73704") ? false : (stryCov_9fa48("73704"), true);
        }
      }
      if (stryMutAct_9fa48("73708") ? next.readyLeaseExpiresAt <= previous.readyLeaseExpiresAt : stryMutAct_9fa48("73707") ? next.readyLeaseExpiresAt >= previous.readyLeaseExpiresAt : stryMutAct_9fa48("73706") ? false : stryMutAct_9fa48("73705") ? true : (stryCov_9fa48("73705", "73706", "73707", "73708"), next.readyLeaseExpiresAt > previous.readyLeaseExpiresAt)) {
        if (stryMutAct_9fa48("73709")) {
          {}
        } else {
          stryCov_9fa48("73709");
          return stryMutAct_9fa48("73710") ? false : (stryCov_9fa48("73710"), true);
        }
      }
      if (stryMutAct_9fa48("73714") ? next.readyLeaseExpiresAt >= previous.readyLeaseExpiresAt : stryMutAct_9fa48("73713") ? next.readyLeaseExpiresAt <= previous.readyLeaseExpiresAt : stryMutAct_9fa48("73712") ? false : stryMutAct_9fa48("73711") ? true : (stryCov_9fa48("73711", "73712", "73713", "73714"), next.readyLeaseExpiresAt < previous.readyLeaseExpiresAt)) {
        if (stryMutAct_9fa48("73715")) {
          {}
        } else {
          stryCov_9fa48("73715");
          return stryMutAct_9fa48("73716") ? true : (stryCov_9fa48("73716"), false);
        }
      }
      if (stryMutAct_9fa48("73720") ? next.heartbeatAt <= previous.heartbeatAt : stryMutAct_9fa48("73719") ? next.heartbeatAt >= previous.heartbeatAt : stryMutAct_9fa48("73718") ? false : stryMutAct_9fa48("73717") ? true : (stryCov_9fa48("73717", "73718", "73719", "73720"), next.heartbeatAt > previous.heartbeatAt)) {
        if (stryMutAct_9fa48("73721")) {
          {}
        } else {
          stryCov_9fa48("73721");
          return stryMutAct_9fa48("73722") ? false : (stryCov_9fa48("73722"), true);
        }
      }
      if (stryMutAct_9fa48("73726") ? next.heartbeatAt >= previous.heartbeatAt : stryMutAct_9fa48("73725") ? next.heartbeatAt <= previous.heartbeatAt : stryMutAct_9fa48("73724") ? false : stryMutAct_9fa48("73723") ? true : (stryCov_9fa48("73723", "73724", "73725", "73726"), next.heartbeatAt < previous.heartbeatAt)) {
        if (stryMutAct_9fa48("73727")) {
          {}
        } else {
          stryCov_9fa48("73727");
          return stryMutAct_9fa48("73728") ? true : (stryCov_9fa48("73728"), false);
        }
      }
      return stryMutAct_9fa48("73729") ? true : (stryCov_9fa48("73729"), false);
    }
  }

  /**
   * Check and record ready-trigger watermark for deduped retry scheduling.
   * @param {string} nodeId - Node ID.
   * @param {Object} nodeRow - Nodes row candidate.
   * @return {boolean} True when retry should run for this trigger.
   * @private
   */
  shouldRetryNodeReadyWatermark(nodeId, nodeRow) {
    if (stryMutAct_9fa48("73730")) {
      {}
    } else {
      stryCov_9fa48("73730");
      const next = this.getNodeReadyRetryWatermark(nodeRow);
      const previous = stryMutAct_9fa48("73733") ? this.nodeReadyRetryWatermarks.get(nodeId) && null : stryMutAct_9fa48("73732") ? false : stryMutAct_9fa48("73731") ? true : (stryCov_9fa48("73731", "73732", "73733"), this.nodeReadyRetryWatermarks.get(nodeId) || null);
      if (stryMutAct_9fa48("73736") ? false : stryMutAct_9fa48("73735") ? true : stryMutAct_9fa48("73734") ? this.isNodeReadyRetryWatermarkNewer(previous, next) : (stryCov_9fa48("73734", "73735", "73736"), !this.isNodeReadyRetryWatermarkNewer(previous, next))) {
        if (stryMutAct_9fa48("73737")) {
          {}
        } else {
          stryCov_9fa48("73737");
          return stryMutAct_9fa48("73738") ? true : (stryCov_9fa48("73738"), false);
        }
      }
      this.nodeReadyRetryWatermarks.set(nodeId, next);
      return stryMutAct_9fa48("73739") ? false : (stryCov_9fa48("73739"), true);
    }
  }

  /**
   * Build a comparable watermark from one NODE_STATE_UPDATE payload.
   * @param {Object} payload - Control-plane node-state payload.
   * @return {Object|null}
   * @private
   */
  getNodeStateUpdateWatermark(payload) {
    if (stryMutAct_9fa48("73740")) {
      {}
    } else {
      stryCov_9fa48("73740");
      if (stryMutAct_9fa48("73743") ? !payload && typeof payload !== TYPEOF.OBJECT : stryMutAct_9fa48("73742") ? false : stryMutAct_9fa48("73741") ? true : (stryCov_9fa48("73741", "73742", "73743"), (stryMutAct_9fa48("73744") ? payload : (stryCov_9fa48("73744"), !payload)) || (stryMutAct_9fa48("73746") ? typeof payload === TYPEOF.OBJECT : stryMutAct_9fa48("73745") ? false : (stryCov_9fa48("73745", "73746"), typeof payload !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("73747")) {
          {}
        } else {
          stryCov_9fa48("73747");
          return null;
        }
      }
      const payloadNodeRow = payload[ControlPlaneField.NODE_ROW];
      const watermarkRow = (stryMutAct_9fa48("73750") ? payloadNodeRow || typeof payloadNodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("73749") ? false : stryMutAct_9fa48("73748") ? true : (stryCov_9fa48("73748", "73749", "73750"), payloadNodeRow && (stryMutAct_9fa48("73752") ? typeof payloadNodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("73751") ? true : (stryCov_9fa48("73751", "73752"), typeof payloadNodeRow === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("73753") ? {} : (stryCov_9fa48("73753"), {
        ...payloadNodeRow
      }) : {};
      const heartbeatAt = Number(payload[ControlPlaneField.HEARTBEAT_AT]);
      const readyLeaseExpiresAt = Number(payload[ControlPlaneField.READY_LEASE_EXPIRES_AT]);
      if (stryMutAct_9fa48("73755") ? false : stryMutAct_9fa48("73754") ? true : (stryCov_9fa48("73754", "73755"), Number.isFinite(heartbeatAt))) {
        if (stryMutAct_9fa48("73756")) {
          {}
        } else {
          stryCov_9fa48("73756");
          watermarkRow[COLUMN.LAST_HEARTBEAT] = heartbeatAt;
        }
      }
      if (stryMutAct_9fa48("73758") ? false : stryMutAct_9fa48("73757") ? true : (stryCov_9fa48("73757", "73758"), Number.isFinite(readyLeaseExpiresAt))) {
        if (stryMutAct_9fa48("73759")) {
          {}
        } else {
          stryCov_9fa48("73759");
          watermarkRow[COLUMN.READY_LEASE_EXPIRES_AT] = readyLeaseExpiresAt;
        }
      }
      if (stryMutAct_9fa48("73762") ? typeof payload[ControlPlaneField.STATE] !== TYPEOF.STRING : stryMutAct_9fa48("73761") ? false : stryMutAct_9fa48("73760") ? true : (stryCov_9fa48("73760", "73761", "73762"), typeof payload[ControlPlaneField.STATE] === TYPEOF.STRING)) {
        if (stryMutAct_9fa48("73763")) {
          {}
        } else {
          stryCov_9fa48("73763");
          watermarkRow[COLUMN.CONNECTION_STATE] = payload[ControlPlaneField.STATE];
        }
      }
      const watermark = getNodeHeartbeatWatermark(watermarkRow);
      if (stryMutAct_9fa48("73766") ? false : stryMutAct_9fa48("73765") ? true : stryMutAct_9fa48("73764") ? watermark : (stryCov_9fa48("73764", "73765", "73766"), !watermark)) {
        if (stryMutAct_9fa48("73767")) {
          {}
        } else {
          stryCov_9fa48("73767");
          return null;
        }
      }
      if (stryMutAct_9fa48("73770") ? watermark.lastHeartbeat === null && watermark.readyLeaseExpiresAt === null || watermark.connectionState === null : stryMutAct_9fa48("73769") ? false : stryMutAct_9fa48("73768") ? true : (stryCov_9fa48("73768", "73769", "73770"), (stryMutAct_9fa48("73772") ? watermark.lastHeartbeat === null || watermark.readyLeaseExpiresAt === null : stryMutAct_9fa48("73771") ? true : (stryCov_9fa48("73771", "73772"), (stryMutAct_9fa48("73774") ? watermark.lastHeartbeat !== null : stryMutAct_9fa48("73773") ? true : (stryCov_9fa48("73773", "73774"), watermark.lastHeartbeat === null)) && (stryMutAct_9fa48("73776") ? watermark.readyLeaseExpiresAt !== null : stryMutAct_9fa48("73775") ? true : (stryCov_9fa48("73775", "73776"), watermark.readyLeaseExpiresAt === null)))) && (stryMutAct_9fa48("73778") ? watermark.connectionState !== null : stryMutAct_9fa48("73777") ? true : (stryCov_9fa48("73777", "73778"), watermark.connectionState === null)))) {
        if (stryMutAct_9fa48("73779")) {
          {}
        } else {
          stryCov_9fa48("73779");
          return null;
        }
      }
      return watermark;
    }
  }

  /**
   * Accept only forward node-state watermark progression.
   * @param {Object|null} previous - Previous watermark.
   * @param {Object|null} next - Candidate watermark.
   * @return {boolean}
   * @private
   */
  isNodeStateUpdateWatermarkNewer(previous, next) {
    if (stryMutAct_9fa48("73780")) {
      {}
    } else {
      stryCov_9fa48("73780");
      if (stryMutAct_9fa48("73783") ? false : stryMutAct_9fa48("73782") ? true : stryMutAct_9fa48("73781") ? previous : (stryCov_9fa48("73781", "73782", "73783"), !previous)) {
        if (stryMutAct_9fa48("73784")) {
          {}
        } else {
          stryCov_9fa48("73784");
          return stryMutAct_9fa48("73785") ? false : (stryCov_9fa48("73785"), true);
        }
      }
      if (stryMutAct_9fa48("73788") ? false : stryMutAct_9fa48("73787") ? true : stryMutAct_9fa48("73786") ? next : (stryCov_9fa48("73786", "73787", "73788"), !next)) {
        if (stryMutAct_9fa48("73789")) {
          {}
        } else {
          stryCov_9fa48("73789");
          return stryMutAct_9fa48("73790") ? false : (stryCov_9fa48("73790"), true);
        }
      }
      if (stryMutAct_9fa48("73793") ? previous.lastHeartbeat === null || next.lastHeartbeat !== null : stryMutAct_9fa48("73792") ? false : stryMutAct_9fa48("73791") ? true : (stryCov_9fa48("73791", "73792", "73793"), (stryMutAct_9fa48("73795") ? previous.lastHeartbeat !== null : stryMutAct_9fa48("73794") ? true : (stryCov_9fa48("73794", "73795"), previous.lastHeartbeat === null)) && (stryMutAct_9fa48("73797") ? next.lastHeartbeat === null : stryMutAct_9fa48("73796") ? true : (stryCov_9fa48("73796", "73797"), next.lastHeartbeat !== null)))) {
        if (stryMutAct_9fa48("73798")) {
          {}
        } else {
          stryCov_9fa48("73798");
          return stryMutAct_9fa48("73799") ? false : (stryCov_9fa48("73799"), true);
        }
      }
      if (stryMutAct_9fa48("73802") ? previous.lastHeartbeat !== null || next.lastHeartbeat === null : stryMutAct_9fa48("73801") ? false : stryMutAct_9fa48("73800") ? true : (stryCov_9fa48("73800", "73801", "73802"), (stryMutAct_9fa48("73804") ? previous.lastHeartbeat === null : stryMutAct_9fa48("73803") ? true : (stryCov_9fa48("73803", "73804"), previous.lastHeartbeat !== null)) && (stryMutAct_9fa48("73806") ? next.lastHeartbeat !== null : stryMutAct_9fa48("73805") ? true : (stryCov_9fa48("73805", "73806"), next.lastHeartbeat === null)))) {
        if (stryMutAct_9fa48("73807")) {
          {}
        } else {
          stryCov_9fa48("73807");
          return stryMutAct_9fa48("73808") ? true : (stryCov_9fa48("73808"), false);
        }
      }
      if (stryMutAct_9fa48("73811") ? previous.readyLeaseExpiresAt === null || next.readyLeaseExpiresAt !== null : stryMutAct_9fa48("73810") ? false : stryMutAct_9fa48("73809") ? true : (stryCov_9fa48("73809", "73810", "73811"), (stryMutAct_9fa48("73813") ? previous.readyLeaseExpiresAt !== null : stryMutAct_9fa48("73812") ? true : (stryCov_9fa48("73812", "73813"), previous.readyLeaseExpiresAt === null)) && (stryMutAct_9fa48("73815") ? next.readyLeaseExpiresAt === null : stryMutAct_9fa48("73814") ? true : (stryCov_9fa48("73814", "73815"), next.readyLeaseExpiresAt !== null)))) {
        if (stryMutAct_9fa48("73816")) {
          {}
        } else {
          stryCov_9fa48("73816");
          return stryMutAct_9fa48("73817") ? false : (stryCov_9fa48("73817"), true);
        }
      }
      if (stryMutAct_9fa48("73820") ? previous.readyLeaseExpiresAt !== null || next.readyLeaseExpiresAt === null : stryMutAct_9fa48("73819") ? false : stryMutAct_9fa48("73818") ? true : (stryCov_9fa48("73818", "73819", "73820"), (stryMutAct_9fa48("73822") ? previous.readyLeaseExpiresAt === null : stryMutAct_9fa48("73821") ? true : (stryCov_9fa48("73821", "73822"), previous.readyLeaseExpiresAt !== null)) && (stryMutAct_9fa48("73824") ? next.readyLeaseExpiresAt !== null : stryMutAct_9fa48("73823") ? true : (stryCov_9fa48("73823", "73824"), next.readyLeaseExpiresAt === null)))) {
        if (stryMutAct_9fa48("73825")) {
          {}
        } else {
          stryCov_9fa48("73825");
          return stryMutAct_9fa48("73826") ? true : (stryCov_9fa48("73826"), false);
        }
      }
      return stryMutAct_9fa48("73830") ? compareNodeHeartbeatWatermarks(previous, next) <= REPLICA_DISPATCH_SERVICE_LITERAL.ZERO : stryMutAct_9fa48("73829") ? compareNodeHeartbeatWatermarks(previous, next) >= REPLICA_DISPATCH_SERVICE_LITERAL.ZERO : stryMutAct_9fa48("73828") ? false : stryMutAct_9fa48("73827") ? true : (stryCov_9fa48("73827", "73828", "73829", "73830"), compareNodeHeartbeatWatermarks(previous, next) > REPLICA_DISPATCH_SERVICE_LITERAL.ZERO);
    }
  }

  /**
   * Normalize operation-dispatch queue shard count to a safe positive integer.
   * One blocked operation reconcile must not head-of-line block unrelated
   * operation ids on the same node.
   *
   * @param {*} value - Candidate shard count.
   * @return {number}
   * @private
   */
  normalizeOperationDispatchQueueShardCount(value) {
    if (stryMutAct_9fa48("73831")) {
      {}
    } else {
      stryCov_9fa48("73831");
      const numeric = Number(value);
      if (stryMutAct_9fa48("73834") ? false : stryMutAct_9fa48("73833") ? true : stryMutAct_9fa48("73832") ? Number.isFinite(numeric) : (stryCov_9fa48("73832", "73833", "73834"), !Number.isFinite(numeric))) {
        if (stryMutAct_9fa48("73835")) {
          {}
        } else {
          stryCov_9fa48("73835");
          return DISPATCH_DEFAULT.OPERATION_DISPATCH_QUEUE_SHARD_COUNT;
        }
      }
      return stryMutAct_9fa48("73836") ? Math.min(NUM.ONE, Math.floor(numeric)) : (stryCov_9fa48("73836"), Math.max(NUM.ONE, Math.floor(numeric)));
    }
  }

  /**
   * Normalize node-state queue shard count to a safe positive integer.
   * @param {*} value - Candidate shard count.
   * @return {number}
   * @private
   */
  normalizeNodeStateUpdateQueueShardCount(value) {
    if (stryMutAct_9fa48("73837")) {
      {}
    } else {
      stryCov_9fa48("73837");
      const numeric = Number(value);
      if (stryMutAct_9fa48("73840") ? false : stryMutAct_9fa48("73839") ? true : stryMutAct_9fa48("73838") ? Number.isFinite(numeric) : (stryCov_9fa48("73838", "73839", "73840"), !Number.isFinite(numeric))) {
        if (stryMutAct_9fa48("73841")) {
          {}
        } else {
          stryCov_9fa48("73841");
          return REPLICA_DISPATCH_SERVICE_LITERAL.FOUR;
        }
      }
      return stryMutAct_9fa48("73842") ? Math.min(NUM.ONE, Math.floor(numeric)) : (stryCov_9fa48("73842"), Math.max(NUM.ONE, Math.floor(numeric)));
    }
  }

  /**
   * Normalize one retry-after default for deferred node-state retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeNodeStateUpdateRetryAfterMs(value) {
    if (stryMutAct_9fa48("73843")) {
      {}
    } else {
      stryCov_9fa48("73843");
      const numeric = Number(value);
      if (stryMutAct_9fa48("73846") ? !Number.isFinite(numeric) && numeric <= NUM.ZERO : stryMutAct_9fa48("73845") ? false : stryMutAct_9fa48("73844") ? true : (stryCov_9fa48("73844", "73845", "73846"), (stryMutAct_9fa48("73847") ? Number.isFinite(numeric) : (stryCov_9fa48("73847"), !Number.isFinite(numeric))) || (stryMutAct_9fa48("73850") ? numeric > NUM.ZERO : stryMutAct_9fa48("73849") ? numeric < NUM.ZERO : stryMutAct_9fa48("73848") ? false : (stryCov_9fa48("73848", "73849", "73850"), numeric <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("73851")) {
          {}
        } else {
          stryCov_9fa48("73851");
          return DISPATCH_DEFAULT.NODE_STATE_UPDATE_RETRY_AFTER_MS;
        }
      }
      return stryMutAct_9fa48("73852") ? Math.min(NUM.ONE, Math.floor(numeric)) : (stryCov_9fa48("73852"), Math.max(NUM.ONE, Math.floor(numeric)));
    }
  }

  /**
   * Normalize one retry-after default for deferred replica dispatch retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeOperationDispatchRetryAfterMs(value) {
    if (stryMutAct_9fa48("73853")) {
      {}
    } else {
      stryCov_9fa48("73853");
      const numeric = Number(value);
      if (stryMutAct_9fa48("73856") ? !Number.isFinite(numeric) && numeric <= NUM.ZERO : stryMutAct_9fa48("73855") ? false : stryMutAct_9fa48("73854") ? true : (stryCov_9fa48("73854", "73855", "73856"), (stryMutAct_9fa48("73857") ? Number.isFinite(numeric) : (stryCov_9fa48("73857"), !Number.isFinite(numeric))) || (stryMutAct_9fa48("73860") ? numeric > NUM.ZERO : stryMutAct_9fa48("73859") ? numeric < NUM.ZERO : stryMutAct_9fa48("73858") ? false : (stryCov_9fa48("73858", "73859", "73860"), numeric <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("73861")) {
          {}
        } else {
          stryCov_9fa48("73861");
          return DISPATCH_DEFAULT.OPERATION_DISPATCH_RETRY_AFTER_MS;
        }
      }
      return stryMutAct_9fa48("73862") ? Math.min(NUM.ONE, Math.floor(numeric)) : (stryCov_9fa48("73862"), Math.max(NUM.ONE, Math.floor(numeric)));
    }
  }

  /**
   * Keep dispatch readiness refresh bounded so one slow authoritative read
   * cannot head-of-line block the owner queue while sync recovery evidence is
   * already available locally.
   *
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeDispatchReadinessRefreshTimeoutMs(value) {
    if (stryMutAct_9fa48("73863")) {
      {}
    } else {
      stryCov_9fa48("73863");
      const numeric = Number(value);
      if (stryMutAct_9fa48("73866") ? Number.isFinite(numeric) || numeric > NUM.ZERO : stryMutAct_9fa48("73865") ? false : stryMutAct_9fa48("73864") ? true : (stryCov_9fa48("73864", "73865", "73866"), Number.isFinite(numeric) && (stryMutAct_9fa48("73869") ? numeric <= NUM.ZERO : stryMutAct_9fa48("73868") ? numeric >= NUM.ZERO : stryMutAct_9fa48("73867") ? true : (stryCov_9fa48("73867", "73868", "73869"), numeric > NUM.ZERO)))) {
        if (stryMutAct_9fa48("73870")) {
          {}
        } else {
          stryCov_9fa48("73870");
          return stryMutAct_9fa48("73871") ? Math.min(NUM.ONE, Math.floor(numeric)) : (stryCov_9fa48("73871"), Math.max(NUM.ONE, Math.floor(numeric)));
        }
      }
      return stryMutAct_9fa48("73872") ? Math.min(this.operationDispatchRetryAfterMs, DISPATCH_DEFAULT.OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS) : (stryCov_9fa48("73872"), Math.max(this.operationDispatchRetryAfterMs, DISPATCH_DEFAULT.OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS));
    }
  }

  /**
   * @param {*} errorLike
   * @return {number}
   * @private
   */
  resolveOperationDispatchRetryAfterMs(errorLike) {
    if (stryMutAct_9fa48("73873")) {
      {}
    } else {
      stryCov_9fa48("73873");
      const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
      if (stryMutAct_9fa48("73876") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("73875") ? false : stryMutAct_9fa48("73874") ? true : (stryCov_9fa48("73874", "73875", "73876"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("73879") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("73878") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("73877") ? true : (stryCov_9fa48("73877", "73878", "73879"), retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("73880")) {
          {}
        } else {
          stryCov_9fa48("73880");
          return stryMutAct_9fa48("73881") ? Math.min(NUM.ONE, Math.floor(retryAfterMs)) : (stryCov_9fa48("73881"), Math.max(NUM.ONE, Math.floor(retryAfterMs)));
        }
      }
      return this.operationDispatchRetryAfterMs;
    }
  }

  /**
   * @param {string} nodeId
   * @param {number} timeoutMs
   * @return {Error}
   * @private
   */
  buildDispatchReadinessRefreshTimeoutError(nodeId, timeoutMs) {
    if (stryMutAct_9fa48("73882")) {
      {}
    } else {
      stryCov_9fa48("73882");
      const error = new Error((stryMutAct_9fa48("73883") ? "" : (stryCov_9fa48("73883"), 'Message timeout while refreshing readiness for dispatch target ')) + String(stryMutAct_9fa48("73886") ? nodeId && 'unknown' : stryMutAct_9fa48("73885") ? false : stryMutAct_9fa48("73884") ? true : (stryCov_9fa48("73884", "73885", "73886"), nodeId || (stryMutAct_9fa48("73887") ? "" : (stryCov_9fa48("73887"), 'unknown')))) + (stryMutAct_9fa48("73888") ? "" : (stryCov_9fa48("73888"), ' after ')) + String(timeoutMs) + (stryMutAct_9fa48("73889") ? "" : (stryCov_9fa48("73889"), 'ms')));
      error.code = REPLICA_DISPATCH_SERVICE_LITERAL.CONTROL_PLANE_READINESS_REFRESH_TIMEOUT;
      error.retryAfterMs = this.operationDispatchRetryAfterMs;
      error.deferRetry = stryMutAct_9fa48("73890") ? false : (stryCov_9fa48("73890"), true);
      error.targetNodeId = stryMutAct_9fa48("73893") ? nodeId && null : stryMutAct_9fa48("73892") ? false : stryMutAct_9fa48("73891") ? true : (stryCov_9fa48("73891", "73892", "73893"), nodeId || null);
      return error;
    }
  }

  /**
   * Bound one authoritative readiness refresh so dispatch progression can fall
   * back to the already-visible sync snapshot instead of stalling indefinitely.
   *
   * @param {string} nodeId
   * @param {string} decisionDimension
   * @return {Promise<Object|null>}
   * @private
   */
  async getBoundedDispatchReadiness(nodeId, decisionDimension) {
    if (stryMutAct_9fa48("73894")) {
      {}
    } else {
      stryCov_9fa48("73894");
      if (stryMutAct_9fa48("73897") ? typeof this.controlPlaneReadinessService.getNodeReadiness === TYPEOF.FUNCTION : stryMutAct_9fa48("73896") ? false : stryMutAct_9fa48("73895") ? true : (stryCov_9fa48("73895", "73896", "73897"), typeof this.controlPlaneReadinessService.getNodeReadiness !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("73898")) {
          {}
        } else {
          stryCov_9fa48("73898");
          return null;
        }
      }
      const timeoutMs = this.dispatchReadinessRefreshTimeoutMs;
      if (stryMutAct_9fa48("73901") ? !Number.isFinite(timeoutMs) && timeoutMs <= NUM.ZERO : stryMutAct_9fa48("73900") ? false : stryMutAct_9fa48("73899") ? true : (stryCov_9fa48("73899", "73900", "73901"), (stryMutAct_9fa48("73902") ? Number.isFinite(timeoutMs) : (stryCov_9fa48("73902"), !Number.isFinite(timeoutMs))) || (stryMutAct_9fa48("73905") ? timeoutMs > NUM.ZERO : stryMutAct_9fa48("73904") ? timeoutMs < NUM.ZERO : stryMutAct_9fa48("73903") ? false : (stryCov_9fa48("73903", "73904", "73905"), timeoutMs <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("73906")) {
          {}
        } else {
          stryCov_9fa48("73906");
          return this.controlPlaneReadinessService.getNodeReadiness(nodeId, stryMutAct_9fa48("73907") ? {} : (stryCov_9fa48("73907"), {
            allowAuthoritativeRefresh: stryMutAct_9fa48("73908") ? false : (stryCov_9fa48("73908"), true),
            decisionDimension,
            maxCachedAgeMs: NUM.ZERO
          }));
        }
      }
      let timeoutHandle = null;
      try {
        if (stryMutAct_9fa48("73909")) {
          {}
        } else {
          stryCov_9fa48("73909");
          return await Promise.race(stryMutAct_9fa48("73910") ? [] : (stryCov_9fa48("73910"), [this.controlPlaneReadinessService.getNodeReadiness(nodeId, stryMutAct_9fa48("73911") ? {} : (stryCov_9fa48("73911"), {
            allowAuthoritativeRefresh: stryMutAct_9fa48("73912") ? false : (stryCov_9fa48("73912"), true),
            decisionDimension,
            maxCachedAgeMs: NUM.ZERO
          })), new Promise((_resolve, reject) => {
            if (stryMutAct_9fa48("73913")) {
              {}
            } else {
              stryCov_9fa48("73913");
              timeoutHandle = this.setTimeoutFn(() => {
                if (stryMutAct_9fa48("73914")) {
                  {}
                } else {
                  stryCov_9fa48("73914");
                  reject(this.buildDispatchReadinessRefreshTimeoutError(nodeId, timeoutMs));
                }
              }, timeoutMs);
            }
          })]));
        }
      } finally {
        if (stryMutAct_9fa48("73915")) {
          {}
        } else {
          stryCov_9fa48("73915");
          if (stryMutAct_9fa48("73917") ? false : stryMutAct_9fa48("73916") ? true : (stryCov_9fa48("73916", "73917"), timeoutHandle)) {
            if (stryMutAct_9fa48("73918")) {
              {}
            } else {
              stryCov_9fa48("73918");
              this.clearTimeoutFn(timeoutHandle);
            }
          }
        }
      }
    }
  }

  /**
   * Defer one retryable operation-dispatch failure onto the existing owner queue.
   * @param {string} operationId
   * @param {*} errorLike
   * @param {Object|null} [row=null]
   * @return {boolean}
   * @private
   */
  deferOperationDispatchRetry(operationId, errorLike, row = null) {
    if (stryMutAct_9fa48("73919")) {
      {}
    } else {
      stryCov_9fa48("73919");
      if (stryMutAct_9fa48("73922") ? !operationId && !isRetryableControlPlaneError(errorLike) : stryMutAct_9fa48("73921") ? false : stryMutAct_9fa48("73920") ? true : (stryCov_9fa48("73920", "73921", "73922"), (stryMutAct_9fa48("73923") ? operationId : (stryCov_9fa48("73923"), !operationId)) || (stryMutAct_9fa48("73924") ? isRetryableControlPlaneError(errorLike) : (stryCov_9fa48("73924"), !isRetryableControlPlaneError(errorLike))))) {
        if (stryMutAct_9fa48("73925")) {
          {}
        } else {
          stryCov_9fa48("73925");
          return stryMutAct_9fa48("73926") ? true : (stryCov_9fa48("73926"), false);
        }
      }
      const retryAfterMs = this.resolveOperationDispatchRetryAfterMs(errorLike);
      const desiredAttemptAt = stryMutAct_9fa48("73927") ? Date.now() - retryAfterMs : (stryCov_9fa48("73927"), Date.now() + retryAfterMs);
      const errorMessage = stryMutAct_9fa48("73930") ? (errorLike?.message || errorLike?.error) && null : stryMutAct_9fa48("73929") ? false : stryMutAct_9fa48("73928") ? true : (stryCov_9fa48("73928", "73929", "73930"), (stryMutAct_9fa48("73932") ? errorLike?.message && errorLike?.error : stryMutAct_9fa48("73931") ? false : (stryCov_9fa48("73931", "73932"), (stryMutAct_9fa48("73933") ? errorLike.message : (stryCov_9fa48("73933"), errorLike?.message)) || (stryMutAct_9fa48("73934") ? errorLike.error : (stryCov_9fa48("73934"), errorLike?.error)))) || null);
      const existing = this.operationDispatchDeferredRetries.get(operationId);
      if (stryMutAct_9fa48("73936") ? false : stryMutAct_9fa48("73935") ? true : (stryCov_9fa48("73935", "73936"), existing)) {
        if (stryMutAct_9fa48("73937")) {
          {}
        } else {
          stryCov_9fa48("73937");
          existing.errorMessage = errorMessage;
          if (stryMutAct_9fa48("73939") ? false : stryMutAct_9fa48("73938") ? true : (stryCov_9fa48("73938", "73939"), row)) {
            if (stryMutAct_9fa48("73940")) {
              {}
            } else {
              stryCov_9fa48("73940");
              existing.row = this.cloneDeferredOperationDispatchRow(row);
            }
          }
          if (stryMutAct_9fa48("73944") ? desiredAttemptAt >= existing.nextAttemptAt : stryMutAct_9fa48("73943") ? desiredAttemptAt <= existing.nextAttemptAt : stryMutAct_9fa48("73942") ? false : stryMutAct_9fa48("73941") ? true : (stryCov_9fa48("73941", "73942", "73943", "73944"), desiredAttemptAt < existing.nextAttemptAt)) {
            if (stryMutAct_9fa48("73945")) {
              {}
            } else {
              stryCov_9fa48("73945");
              if (stryMutAct_9fa48("73947") ? false : stryMutAct_9fa48("73946") ? true : (stryCov_9fa48("73946", "73947"), existing.timeoutHandle)) {
                if (stryMutAct_9fa48("73948")) {
                  {}
                } else {
                  stryCov_9fa48("73948");
                  this.clearTimeoutFn(existing.timeoutHandle);
                }
              }
              existing.nextAttemptAt = desiredAttemptAt;
              existing.timeoutHandle = this.armDeferredOperationDispatchRetry(operationId, retryAfterMs);
            }
          }
          return stryMutAct_9fa48("73949") ? false : (stryCov_9fa48("73949"), true);
        }
      }
      const deferredRetry = stryMutAct_9fa48("73950") ? {} : (stryCov_9fa48("73950"), {
        errorMessage,
        nextAttemptAt: desiredAttemptAt,
        row: row ? this.cloneDeferredOperationDispatchRow(row) : null,
        timeoutHandle: this.armDeferredOperationDispatchRetry(operationId, retryAfterMs)
      });
      this.operationDispatchDeferredRetries.set(operationId, deferredRetry);
      this.logger.info(DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED, stryMutAct_9fa48("73951") ? {} : (stryCov_9fa48("73951"), {
        nodeId: this.nodeId,
        operationId,
        retryAfterMs,
        error: errorMessage
      }));
      return stryMutAct_9fa48("73952") ? false : (stryCov_9fa48("73952"), true);
    }
  }

  /**
   * @param {string} operationId
   * @param {number} delayMs
   * @return {*}
   * @private
   */
  armDeferredOperationDispatchRetry(operationId, delayMs) {
    if (stryMutAct_9fa48("73953")) {
      {}
    } else {
      stryCov_9fa48("73953");
      return this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("73954")) {
          {}
        } else {
          stryCov_9fa48("73954");
          const deferredRetry = this.operationDispatchDeferredRetries.get(operationId);
          if (stryMutAct_9fa48("73957") ? false : stryMutAct_9fa48("73956") ? true : stryMutAct_9fa48("73955") ? deferredRetry : (stryCov_9fa48("73955", "73956", "73957"), !deferredRetry)) {
            if (stryMutAct_9fa48("73958")) {
              {}
            } else {
              stryCov_9fa48("73958");
              return;
            }
          }
          this.operationDispatchDeferredRetries.delete(operationId);
          const row = (stryMutAct_9fa48("73959") ? deferredRetry.row : (stryCov_9fa48("73959"), deferredRetry?.row)) ? this.cloneDeferredOperationDispatchRow(deferredRetry.row) : null;
          this.operationDispatchQueue.enqueue(operationId, RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH, row ? stryMutAct_9fa48("73960") ? {} : (stryCov_9fa48("73960"), {
            row
          }) : undefined);
          this.logger.debug(DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED_RETRY, stryMutAct_9fa48("73961") ? {} : (stryCov_9fa48("73961"), {
            nodeId: this.nodeId,
            operationId,
            retryAfterMs: delayMs
          }));
        }
      }, delayMs);
    }
  }

  /**
   * Preserve one dispatchable replica_operations row across deferred retries so
   * direct wake-up payloads can survive until cache visibility converges.
   * @param {Object|null} row
   * @return {Object|null}
   * @private
   */
  cloneDeferredOperationDispatchRow(row) {
    if (stryMutAct_9fa48("73962")) {
      {}
    } else {
      stryCov_9fa48("73962");
      if (stryMutAct_9fa48("73965") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("73964") ? false : stryMutAct_9fa48("73963") ? true : (stryCov_9fa48("73963", "73964", "73965"), (stryMutAct_9fa48("73966") ? row : (stryCov_9fa48("73966"), !row)) || (stryMutAct_9fa48("73968") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("73967") ? false : (stryCov_9fa48("73967", "73968"), typeof row !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("73969")) {
          {}
        } else {
          stryCov_9fa48("73969");
          return null;
        }
      }
      return stryMutAct_9fa48("73970") ? {} : (stryCov_9fa48("73970"), {
        ...row
      });
    }
  }

  /**
   * @param {string} operationId
   * @return {void}
   * @private
   */
  clearDeferredOperationDispatchRetry(operationId) {
    if (stryMutAct_9fa48("73971")) {
      {}
    } else {
      stryCov_9fa48("73971");
      const deferredRetry = this.operationDispatchDeferredRetries.get(operationId);
      if (stryMutAct_9fa48("73974") ? false : stryMutAct_9fa48("73973") ? true : stryMutAct_9fa48("73972") ? deferredRetry : (stryCov_9fa48("73972", "73973", "73974"), !deferredRetry)) {
        if (stryMutAct_9fa48("73975")) {
          {}
        } else {
          stryCov_9fa48("73975");
          return;
        }
      }
      if (stryMutAct_9fa48("73977") ? false : stryMutAct_9fa48("73976") ? true : (stryCov_9fa48("73976", "73977"), deferredRetry.timeoutHandle)) {
        if (stryMutAct_9fa48("73978")) {
          {}
        } else {
          stryCov_9fa48("73978");
          this.clearTimeoutFn(deferredRetry.timeoutHandle);
        }
      }
      this.operationDispatchDeferredRetries.delete(operationId);
    }
  }

  /**
   * Build canonical write options for NODE_STATE_UPDATE persistence.
   * @param {string} nodeId
   * @param {string} nextState
   * @param {boolean} [isHeartbeatOnly=false]
   * @return {Object}
   * @private
   */
  buildNodeStateUpdateWriteOptions(nodeId, nextState, isHeartbeatOnly = stryMutAct_9fa48("73979") ? true : (stryCov_9fa48("73979"), false)) {
    if (stryMutAct_9fa48("73980")) {
      {}
    } else {
      stryCov_9fa48("73980");
      const isReady = stryMutAct_9fa48("73983") ? nextState !== STATE.READY : stryMutAct_9fa48("73982") ? false : stryMutAct_9fa48("73981") ? true : (stryCov_9fa48("73981", "73982", "73983"), nextState === STATE.READY);
      const isHeartbeatOnlyUpdate = stryMutAct_9fa48("73986") ? isHeartbeatOnly !== true : stryMutAct_9fa48("73985") ? false : stryMutAct_9fa48("73984") ? true : (stryCov_9fa48("73984", "73985", "73986"), isHeartbeatOnly === (stryMutAct_9fa48("73987") ? false : (stryCov_9fa48("73987"), true)));
      return stryMutAct_9fa48("73988") ? {} : (stryCov_9fa48("73988"), {
        allowCoalescing: stryMutAct_9fa48("73989") ? false : (stryCov_9fa48("73989"), true),
        allowPressureDefer: stryMutAct_9fa48("73992") ? isHeartbeatOnlyUpdate && !isReady : stryMutAct_9fa48("73991") ? false : stryMutAct_9fa48("73990") ? true : (stryCov_9fa48("73990", "73991", "73992"), isHeartbeatOnlyUpdate || (stryMutAct_9fa48("73993") ? isReady : (stryCov_9fa48("73993"), !isReady))),
        coalescingKey: stryMutAct_9fa48("73994") ? `` : (stryCov_9fa48("73994"), `node-state:${nodeId}`),
        deliveryPriority: (stryMutAct_9fa48("73997") ? isHeartbeatOnlyUpdate && !isReady : stryMutAct_9fa48("73996") ? false : stryMutAct_9fa48("73995") ? true : (stryCov_9fa48("73995", "73996", "73997"), isHeartbeatOnlyUpdate || (stryMutAct_9fa48("73998") ? isReady : (stryCov_9fa48("73998"), !isReady)))) ? REPLICA_DISPATCH_SERVICE_LITERAL.BACKGROUND : REPLICA_DISPATCH_SERVICE_LITERAL.CRITICAL,
        pressureRetryAfterMs: this.nodeStateUpdateRetryAfterMs,
        queryTimeoutMs: this.nodeStateUpdateQueryTimeoutMs,
        skipCacheWait: stryMutAct_9fa48("73999") ? false : (stryCov_9fa48("73999"), true),
        workClass: (stryMutAct_9fa48("74002") ? isHeartbeatOnlyUpdate && !isReady : stryMutAct_9fa48("74001") ? false : stryMutAct_9fa48("74000") ? true : (stryCov_9fa48("74000", "74001", "74002"), isHeartbeatOnlyUpdate || (stryMutAct_9fa48("74003") ? isReady : (stryCov_9fa48("74003"), !isReady)))) ? PRESSURE_WORK_CLASS.BACKGROUND : PRESSURE_WORK_CLASS.CRITICAL
      });
    }
  }
  resolveMembershipPublicationService() {
    if (stryMutAct_9fa48("74004")) {
      {}
    } else {
      stryCov_9fa48("74004");
      const readinessService = this.controlPlaneReadinessService;
      if (stryMutAct_9fa48("74007") ? !readinessService && typeof readinessService !== TYPEOF.OBJECT : stryMutAct_9fa48("74006") ? false : stryMutAct_9fa48("74005") ? true : (stryCov_9fa48("74005", "74006", "74007"), (stryMutAct_9fa48("74008") ? readinessService : (stryCov_9fa48("74008"), !readinessService)) || (stryMutAct_9fa48("74010") ? typeof readinessService === TYPEOF.OBJECT : stryMutAct_9fa48("74009") ? false : (stryCov_9fa48("74009", "74010"), typeof readinessService !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("74011")) {
          {}
        } else {
          stryCov_9fa48("74011");
          return null;
        }
      }
      const membershipPublicationService = readinessService.membershipPublicationService;
      return (stryMutAct_9fa48("74014") ? membershipPublicationService || typeof membershipPublicationService === TYPEOF.OBJECT : stryMutAct_9fa48("74013") ? false : stryMutAct_9fa48("74012") ? true : (stryCov_9fa48("74012", "74013", "74014"), membershipPublicationService && (stryMutAct_9fa48("74016") ? typeof membershipPublicationService !== TYPEOF.OBJECT : stryMutAct_9fa48("74015") ? true : (stryCov_9fa48("74015", "74016"), typeof membershipPublicationService === TYPEOF.OBJECT)))) ? membershipPublicationService : null;
    }
  }

  /**
   * READY node-state updates must re-enter the canonical publication owner
   * queue so cluster publication convergence advances through the durable
   * control-plane writer rather than only via later read-time repair.
   *
   * @param {string} reason
   * @param {Object} [context={}]
   * @return {boolean}
   * @private
   */
  enqueueMembershipPublicationReconcile(reason, context = {}) {
    if (stryMutAct_9fa48("74017")) {
      {}
    } else {
      stryCov_9fa48("74017");
      const membershipPublicationService = this.resolveMembershipPublicationService();
      if (stryMutAct_9fa48("74020") ? !membershipPublicationService && typeof membershipPublicationService.enqueueClusterMembershipReconcile !== TYPEOF.FUNCTION : stryMutAct_9fa48("74019") ? false : stryMutAct_9fa48("74018") ? true : (stryCov_9fa48("74018", "74019", "74020"), (stryMutAct_9fa48("74021") ? membershipPublicationService : (stryCov_9fa48("74021"), !membershipPublicationService)) || (stryMutAct_9fa48("74023") ? typeof membershipPublicationService.enqueueClusterMembershipReconcile === TYPEOF.FUNCTION : stryMutAct_9fa48("74022") ? false : (stryCov_9fa48("74022", "74023"), typeof membershipPublicationService.enqueueClusterMembershipReconcile !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("74024")) {
          {}
        } else {
          stryCov_9fa48("74024");
          return stryMutAct_9fa48("74025") ? true : (stryCov_9fa48("74025"), false);
        }
      }
      membershipPublicationService.enqueueClusterMembershipReconcile(reason, context);
      return stryMutAct_9fa48("74026") ? false : (stryCov_9fa48("74026"), true);
    }
  }
  async acknowledgeMembershipPublicationForNode(nodeId) {
    if (stryMutAct_9fa48("74027")) {
      {}
    } else {
      stryCov_9fa48("74027");
      const membershipPublicationService = this.resolveMembershipPublicationService();
      if (stryMutAct_9fa48("74030") ? !membershipPublicationService && typeof membershipPublicationService.acknowledgeMembershipPublicationForNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("74029") ? false : stryMutAct_9fa48("74028") ? true : (stryCov_9fa48("74028", "74029", "74030"), (stryMutAct_9fa48("74031") ? membershipPublicationService : (stryCov_9fa48("74031"), !membershipPublicationService)) || (stryMutAct_9fa48("74033") ? typeof membershipPublicationService.acknowledgeMembershipPublicationForNode === TYPEOF.FUNCTION : stryMutAct_9fa48("74032") ? false : (stryCov_9fa48("74032", "74033"), typeof membershipPublicationService.acknowledgeMembershipPublicationForNode !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("74034")) {
          {}
        } else {
          stryCov_9fa48("74034");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("74035")) {
          {}
        } else {
          stryCov_9fa48("74035");
          return await membershipPublicationService.acknowledgeMembershipPublicationForNode(nodeId);
        }
      } catch (error) {
        if (stryMutAct_9fa48("74036")) {
          {}
        } else {
          stryCov_9fa48("74036");
          this.logger.warn(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_ACK_FAILED, stryMutAct_9fa48("74037") ? {} : (stryCov_9fa48("74037"), {
            nodeId,
            error: stryMutAct_9fa48("74040") ? error?.message && String(error) : stryMutAct_9fa48("74039") ? false : stryMutAct_9fa48("74038") ? true : (stryCov_9fa48("74038", "74039", "74040"), (stryMutAct_9fa48("74041") ? error.message : (stryCov_9fa48("74041"), error?.message)) || String(error))
          }));
          return null;
        }
      }
    }
  }

  /**
   * Determine whether one node-state write failure should be retried through
   * the owner queue instead of surfacing as a terminal reconcile error.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  shouldDeferNodeStateUpdateRetry(error) {
    if (stryMutAct_9fa48("74042")) {
      {}
    } else {
      stryCov_9fa48("74042");
      if (stryMutAct_9fa48("74045") ? false : stryMutAct_9fa48("74044") ? true : stryMutAct_9fa48("74043") ? error : (stryCov_9fa48("74043", "74044", "74045"), !error)) {
        if (stryMutAct_9fa48("74046")) {
          {}
        } else {
          stryCov_9fa48("74046");
          return stryMutAct_9fa48("74047") ? true : (stryCov_9fa48("74047"), false);
        }
      }
      if (stryMutAct_9fa48("74050") ? error?.deferRetry !== true : stryMutAct_9fa48("74049") ? false : stryMutAct_9fa48("74048") ? true : (stryCov_9fa48("74048", "74049", "74050"), (stryMutAct_9fa48("74051") ? error.deferRetry : (stryCov_9fa48("74051"), error?.deferRetry)) === (stryMutAct_9fa48("74052") ? false : (stryCov_9fa48("74052"), true)))) {
        if (stryMutAct_9fa48("74053")) {
          {}
        } else {
          stryCov_9fa48("74053");
          return stryMutAct_9fa48("74054") ? false : (stryCov_9fa48("74054"), true);
        }
      }
      if (stryMutAct_9fa48("74057") ? error?.code !== REPLICA_DISPATCH_SERVICE_LITERAL.NODE_ROW_MISSING : stryMutAct_9fa48("74056") ? false : stryMutAct_9fa48("74055") ? true : (stryCov_9fa48("74055", "74056", "74057"), (stryMutAct_9fa48("74058") ? error.code : (stryCov_9fa48("74058"), error?.code)) === REPLICA_DISPATCH_SERVICE_LITERAL.NODE_ROW_MISSING)) {
        if (stryMutAct_9fa48("74059")) {
          {}
        } else {
          stryCov_9fa48("74059");
          return stryMutAct_9fa48("74060") ? false : (stryCov_9fa48("74060"), true);
        }
      }
      if (stryMutAct_9fa48("74063") ? Number.isFinite(error?.retryAfterMs) || error.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("74062") ? false : stryMutAct_9fa48("74061") ? true : (stryCov_9fa48("74061", "74062", "74063"), Number.isFinite(stryMutAct_9fa48("74064") ? error.retryAfterMs : (stryCov_9fa48("74064"), error?.retryAfterMs)) && (stryMutAct_9fa48("74067") ? error.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("74066") ? error.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("74065") ? true : (stryCov_9fa48("74065", "74066", "74067"), error.retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("74068")) {
          {}
        } else {
          stryCov_9fa48("74068");
          return stryMutAct_9fa48("74069") ? false : (stryCov_9fa48("74069"), true);
        }
      }
      if (stryMutAct_9fa48("74071") ? false : stryMutAct_9fa48("74070") ? true : (stryCov_9fa48("74070", "74071"), isRetryableControlPlaneError(error))) {
        if (stryMutAct_9fa48("74072")) {
          {}
        } else {
          stryCov_9fa48("74072");
          return stryMutAct_9fa48("74073") ? false : (stryCov_9fa48("74073"), true);
        }
      }
      const message = stryMutAct_9fa48("74076") ? error?.message && String(error) : stryMutAct_9fa48("74075") ? false : stryMutAct_9fa48("74074") ? true : (stryCov_9fa48("74074", "74075", "74076"), (stryMutAct_9fa48("74077") ? error.message : (stryCov_9fa48("74077"), error?.message)) || String(error));
      if (stryMutAct_9fa48("74080") ? typeof this.cdcIntegrationService?.isTransientCdcError === TYPEOF.FUNCTION || this.cdcIntegrationService.isTransientCdcError(message) : stryMutAct_9fa48("74079") ? false : stryMutAct_9fa48("74078") ? true : (stryCov_9fa48("74078", "74079", "74080"), (stryMutAct_9fa48("74082") ? typeof this.cdcIntegrationService?.isTransientCdcError !== TYPEOF.FUNCTION : stryMutAct_9fa48("74081") ? true : (stryCov_9fa48("74081", "74082"), typeof (stryMutAct_9fa48("74083") ? this.cdcIntegrationService.isTransientCdcError : (stryCov_9fa48("74083"), this.cdcIntegrationService?.isTransientCdcError)) === TYPEOF.FUNCTION)) && this.cdcIntegrationService.isTransientCdcError(message))) {
        if (stryMutAct_9fa48("74084")) {
          {}
        } else {
          stryCov_9fa48("74084");
          return stryMutAct_9fa48("74085") ? false : (stryCov_9fa48("74085"), true);
        }
      }
      return stryMutAct_9fa48("74088") ? (message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CLOSED) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.QUERY_ROUTING_FAILED) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER)) && message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_TIMEOUT) : stryMutAct_9fa48("74087") ? false : stryMutAct_9fa48("74086") ? true : (stryCov_9fa48("74086", "74087", "74088"), (stryMutAct_9fa48("74090") ? (message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CLOSED) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.QUERY_ROUTING_FAILED)) && message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER) : stryMutAct_9fa48("74089") ? false : (stryCov_9fa48("74089", "74090"), (stryMutAct_9fa48("74092") ? (message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CLOSED) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.NO_CONNECTION_TO_NODE)) && message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.QUERY_ROUTING_FAILED) : stryMutAct_9fa48("74091") ? false : (stryCov_9fa48("74091", "74092"), (stryMutAct_9fa48("74094") ? message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CLOSED) && message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) : stryMutAct_9fa48("74093") ? false : (stryCov_9fa48("74093", "74094"), (stryMutAct_9fa48("74096") ? message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CONNECTION_TO_NODE) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CLOSED) : stryMutAct_9fa48("74095") ? false : (stryCov_9fa48("74095", "74096"), message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CONNECTION_TO_NODE) && message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CLOSED))) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.NO_CONNECTION_TO_NODE))) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.QUERY_ROUTING_FAILED))) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER))) || message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_TIMEOUT));
    }
  }

  /**
   * Resolve one retry delay for deferred node-state writes.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveNodeStateUpdateRetryAfterMs(error) {
    if (stryMutAct_9fa48("74097")) {
      {}
    } else {
      stryCov_9fa48("74097");
      if (stryMutAct_9fa48("74100") ? Number.isFinite(error?.retryAfterMs) || error.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("74099") ? false : stryMutAct_9fa48("74098") ? true : (stryCov_9fa48("74098", "74099", "74100"), Number.isFinite(stryMutAct_9fa48("74101") ? error.retryAfterMs : (stryCov_9fa48("74101"), error?.retryAfterMs)) && (stryMutAct_9fa48("74104") ? error.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("74103") ? error.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("74102") ? true : (stryCov_9fa48("74102", "74103", "74104"), error.retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("74105")) {
          {}
        } else {
          stryCov_9fa48("74105");
          return stryMutAct_9fa48("74106") ? Math.min(NUM.ONE, Math.floor(error.retryAfterMs)) : (stryCov_9fa48("74106"), Math.max(NUM.ONE, Math.floor(error.retryAfterMs)));
        }
      }
      return this.nodeStateUpdateRetryAfterMs;
    }
  }

  /**
   * Store the latest node-state payload and arm one deferred retry timer.
   * @param {string} nodeId
   * @param {Object} payload
   * @param {Error} error
   * @return {number}
   * @private
   */
  deferNodeStateUpdateRetry(nodeId, payload, error) {
    if (stryMutAct_9fa48("74107")) {
      {}
    } else {
      stryCov_9fa48("74107");
      if (stryMutAct_9fa48("74110") ? !nodeId && !payload : stryMutAct_9fa48("74109") ? false : stryMutAct_9fa48("74108") ? true : (stryCov_9fa48("74108", "74109", "74110"), (stryMutAct_9fa48("74111") ? nodeId : (stryCov_9fa48("74111"), !nodeId)) || (stryMutAct_9fa48("74112") ? payload : (stryCov_9fa48("74112"), !payload)))) {
        if (stryMutAct_9fa48("74113")) {
          {}
        } else {
          stryCov_9fa48("74113");
          return this.nodeStateUpdateRetryAfterMs;
        }
      }
      const retryAfterMs = this.resolveNodeStateUpdateRetryAfterMs(error);
      const desiredAttemptAt = stryMutAct_9fa48("74114") ? Date.now() - retryAfterMs : (stryCov_9fa48("74114"), Date.now() + retryAfterMs);
      const existing = this.nodeStateUpdateDeferredRetries.get(nodeId);
      if (stryMutAct_9fa48("74116") ? false : stryMutAct_9fa48("74115") ? true : (stryCov_9fa48("74115", "74116"), existing)) {
        if (stryMutAct_9fa48("74117")) {
          {}
        } else {
          stryCov_9fa48("74117");
          existing.payload = payload;
          existing.errorMessage = stryMutAct_9fa48("74120") ? error?.message && null : stryMutAct_9fa48("74119") ? false : stryMutAct_9fa48("74118") ? true : (stryCov_9fa48("74118", "74119", "74120"), (stryMutAct_9fa48("74121") ? error.message : (stryCov_9fa48("74121"), error?.message)) || null);
          if (stryMutAct_9fa48("74125") ? desiredAttemptAt >= existing.nextAttemptAt : stryMutAct_9fa48("74124") ? desiredAttemptAt <= existing.nextAttemptAt : stryMutAct_9fa48("74123") ? false : stryMutAct_9fa48("74122") ? true : (stryCov_9fa48("74122", "74123", "74124", "74125"), desiredAttemptAt < existing.nextAttemptAt)) {
            if (stryMutAct_9fa48("74126")) {
              {}
            } else {
              stryCov_9fa48("74126");
              if (stryMutAct_9fa48("74128") ? false : stryMutAct_9fa48("74127") ? true : (stryCov_9fa48("74127", "74128"), existing.timeoutHandle)) {
                if (stryMutAct_9fa48("74129")) {
                  {}
                } else {
                  stryCov_9fa48("74129");
                  this.clearTimeoutFn(existing.timeoutHandle);
                }
              }
              existing.nextAttemptAt = desiredAttemptAt;
              existing.timeoutHandle = this.armDeferredNodeStateUpdateRetry(nodeId, retryAfterMs);
            }
          }
          return retryAfterMs;
        }
      }
      const deferredRetry = stryMutAct_9fa48("74130") ? {} : (stryCov_9fa48("74130"), {
        payload,
        nextAttemptAt: desiredAttemptAt,
        errorMessage: stryMutAct_9fa48("74133") ? error?.message && null : stryMutAct_9fa48("74132") ? false : stryMutAct_9fa48("74131") ? true : (stryCov_9fa48("74131", "74132", "74133"), (stryMutAct_9fa48("74134") ? error.message : (stryCov_9fa48("74134"), error?.message)) || null),
        timeoutHandle: null
      });
      deferredRetry.timeoutHandle = this.armDeferredNodeStateUpdateRetry(nodeId, retryAfterMs);
      this.nodeStateUpdateDeferredRetries.set(nodeId, deferredRetry);
      return retryAfterMs;
    }
  }

  /**
   * Arm the deferred retry timer for one node-state update owner key.
   * @param {string} nodeId
   * @param {number} delayMs
   * @return {*}
   * @private
   */
  armDeferredNodeStateUpdateRetry(nodeId, delayMs) {
    if (stryMutAct_9fa48("74135")) {
      {}
    } else {
      stryCov_9fa48("74135");
      return this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("74136")) {
          {}
        } else {
          stryCov_9fa48("74136");
          const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
          if (stryMutAct_9fa48("74139") ? false : stryMutAct_9fa48("74138") ? true : stryMutAct_9fa48("74137") ? deferredRetry : (stryCov_9fa48("74137", "74138", "74139"), !deferredRetry)) {
            if (stryMutAct_9fa48("74140")) {
              {}
            } else {
              stryCov_9fa48("74140");
              return;
            }
          }
          this.nodeStateUpdateDeferredRetries.delete(nodeId);
          this.resolveNodeStateUpdateQueue(nodeId).enqueue(nodeId, RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE, stryMutAct_9fa48("74141") ? {} : (stryCov_9fa48("74141"), {
            payload: deferredRetry.payload
          }));
          this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED_RETRY, stryMutAct_9fa48("74142") ? {} : (stryCov_9fa48("74142"), {
            nodeId,
            retryAfterMs: delayMs
          }));
        }
      }, delayMs);
    }
  }

  /**
   * Replace the deferred retry payload for one node without scheduling another
   * immediate write attempt.
   * @param {string} nodeId
   * @param {Object} payload
   * @return {boolean}
   * @private
   */
  replaceDeferredNodeStateUpdatePayload(nodeId, payload) {
    if (stryMutAct_9fa48("74143")) {
      {}
    } else {
      stryCov_9fa48("74143");
      const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
      if (stryMutAct_9fa48("74146") ? false : stryMutAct_9fa48("74145") ? true : stryMutAct_9fa48("74144") ? deferredRetry : (stryCov_9fa48("74144", "74145", "74146"), !deferredRetry)) {
        if (stryMutAct_9fa48("74147")) {
          {}
        } else {
          stryCov_9fa48("74147");
          return stryMutAct_9fa48("74148") ? true : (stryCov_9fa48("74148"), false);
        }
      }
      deferredRetry.payload = payload;
      return stryMutAct_9fa48("74149") ? false : (stryCov_9fa48("74149"), true);
    }
  }

  /**
   * Cancel and clear one deferred node-state retry slot.
   * @param {string} nodeId
   * @private
   */
  clearDeferredNodeStateUpdateRetry(nodeId) {
    if (stryMutAct_9fa48("74150")) {
      {}
    } else {
      stryCov_9fa48("74150");
      const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
      if (stryMutAct_9fa48("74153") ? false : stryMutAct_9fa48("74152") ? true : stryMutAct_9fa48("74151") ? deferredRetry : (stryCov_9fa48("74151", "74152", "74153"), !deferredRetry)) {
        if (stryMutAct_9fa48("74154")) {
          {}
        } else {
          stryCov_9fa48("74154");
          return;
        }
      }
      if (stryMutAct_9fa48("74156") ? false : stryMutAct_9fa48("74155") ? true : (stryCov_9fa48("74155", "74156"), deferredRetry.timeoutHandle)) {
        if (stryMutAct_9fa48("74157")) {
          {}
        } else {
          stryCov_9fa48("74157");
          this.clearTimeoutFn(deferredRetry.timeoutHandle);
        }
      }
      this.nodeStateUpdateDeferredRetries.delete(nodeId);
    }
  }

  /**
   * Build one queue name for an operation-dispatch shard.
   * @param {number} shardIndex - Zero-based shard index.
   * @return {string}
   * @private
   */
  buildOperationDispatchQueueName(shardIndex) {
    if (stryMutAct_9fa48("74158")) {
      {}
    } else {
      stryCov_9fa48("74158");
      if (stryMutAct_9fa48("74162") ? this.operationDispatchQueueShardCount > NUM.ONE : stryMutAct_9fa48("74161") ? this.operationDispatchQueueShardCount < NUM.ONE : stryMutAct_9fa48("74160") ? false : stryMutAct_9fa48("74159") ? true : (stryCov_9fa48("74159", "74160", "74161", "74162"), this.operationDispatchQueueShardCount <= NUM.ONE)) {
        if (stryMutAct_9fa48("74163")) {
          {}
        } else {
          stryCov_9fa48("74163");
          return DISPATCH_QUEUE_NAME.OPERATION;
        }
      }
      return stryMutAct_9fa48("74164") ? `` : (stryCov_9fa48("74164"), `${DISPATCH_QUEUE_NAME.OPERATION}-${shardIndex}`);
    }
  }

  /**
   * Resolve one reconcile shard for an operation-dispatch owner key.
   * Distinct operation ids may progress concurrently, while each owner key
   * still remains single-flight inside its assigned shard.
   *
   * @param {string} ownerKey - Operation owner key.
   * @return {OwnerKeyReconcileQueue}
   * @private
   */
  resolveOperationDispatchQueue(ownerKey) {
    if (stryMutAct_9fa48("74165")) {
      {}
    } else {
      stryCov_9fa48("74165");
      if (stryMutAct_9fa48("74168") ? !Array.isArray(this.operationDispatchQueues) && this.operationDispatchQueues.length <= NUM.ONE : stryMutAct_9fa48("74167") ? false : stryMutAct_9fa48("74166") ? true : (stryCov_9fa48("74166", "74167", "74168"), (stryMutAct_9fa48("74169") ? Array.isArray(this.operationDispatchQueues) : (stryCov_9fa48("74169"), !Array.isArray(this.operationDispatchQueues))) || (stryMutAct_9fa48("74172") ? this.operationDispatchQueues.length > NUM.ONE : stryMutAct_9fa48("74171") ? this.operationDispatchQueues.length < NUM.ONE : stryMutAct_9fa48("74170") ? false : (stryCov_9fa48("74170", "74171", "74172"), this.operationDispatchQueues.length <= NUM.ONE)))) {
        if (stryMutAct_9fa48("74173")) {
          {}
        } else {
          stryCov_9fa48("74173");
          return (stryMutAct_9fa48("74176") ? Array.isArray(this.operationDispatchQueues) || this.operationDispatchQueues.length === NUM.ONE : stryMutAct_9fa48("74175") ? false : stryMutAct_9fa48("74174") ? true : (stryCov_9fa48("74174", "74175", "74176"), Array.isArray(this.operationDispatchQueues) && (stryMutAct_9fa48("74178") ? this.operationDispatchQueues.length !== NUM.ONE : stryMutAct_9fa48("74177") ? true : (stryCov_9fa48("74177", "74178"), this.operationDispatchQueues.length === NUM.ONE)))) ? this.operationDispatchQueues[NUM.ZERO] : this.operationDispatchQueue;
        }
      }
      const normalizedOwnerKey = (stryMutAct_9fa48("74181") ? typeof ownerKey !== TYPEOF.STRING : stryMutAct_9fa48("74180") ? false : stryMutAct_9fa48("74179") ? true : (stryCov_9fa48("74179", "74180", "74181"), typeof ownerKey === TYPEOF.STRING)) ? ownerKey : String(stryMutAct_9fa48("74184") ? ownerKey && '' : stryMutAct_9fa48("74183") ? false : stryMutAct_9fa48("74182") ? true : (stryCov_9fa48("74182", "74183", "74184"), ownerKey || (stryMutAct_9fa48("74185") ? "Stryker was here!" : (stryCov_9fa48("74185"), ''))));
      let hash = NUM.ZERO;
      for (const char of normalizedOwnerKey) {
        if (stryMutAct_9fa48("74186")) {
          {}
        } else {
          stryCov_9fa48("74186");
          hash = (stryMutAct_9fa48("74187") ? hash * REPLICA_DISPATCH_SERVICE_LITERAL.THIRTY_ONE - char.charCodeAt(NUM.ZERO) : (stryCov_9fa48("74187"), (stryMutAct_9fa48("74188") ? hash / REPLICA_DISPATCH_SERVICE_LITERAL.THIRTY_ONE : (stryCov_9fa48("74188"), hash * REPLICA_DISPATCH_SERVICE_LITERAL.THIRTY_ONE)) + char.charCodeAt(NUM.ZERO))) >>> NUM.ZERO;
        }
      }
      const queueIndex = stryMutAct_9fa48("74189") ? hash * this.operationDispatchQueues.length : (stryCov_9fa48("74189"), hash % this.operationDispatchQueues.length);
      return this.operationDispatchQueues[queueIndex];
    }
  }

  /**
   * Expose one compatibility queue facade while routing distinct operation ids
   * across dedicated shards under the hood.
   *
   * Tests and diagnostics still observe `operationDispatchQueue`, but one
   * slow operation reconcile can no longer stall every other owner key.
   *
   * @return {Object}
   * @private
   */
  buildOperationDispatchQueueFacade() {
    if (stryMutAct_9fa48("74190")) {
      {}
    } else {
      stryCov_9fa48("74190");
      return stryMutAct_9fa48("74191") ? {} : (stryCov_9fa48("74191"), {
        enqueue: stryMutAct_9fa48("74192") ? () => undefined : (stryCov_9fa48("74192"), (ownerKey, reason, context, options) => this.resolveOperationDispatchQueue(ownerKey).enqueue(ownerKey, reason, context, options)),
        shutdown: () => {
          if (stryMutAct_9fa48("74193")) {
            {}
          } else {
            stryCov_9fa48("74193");
            for (const queue of this.operationDispatchQueues) {
              if (stryMutAct_9fa48("74194")) {
                {}
              } else {
                stryCov_9fa48("74194");
                queue.shutdown();
              }
            }
          }
        },
        get size() {
          if (stryMutAct_9fa48("74195")) {
            {}
          } else {
            stryCov_9fa48("74195");
            return this.operationDispatchQueues.reduce(stryMutAct_9fa48("74196") ? () => undefined : (stryCov_9fa48("74196"), (sum, queue) => stryMutAct_9fa48("74197") ? sum - queue.size : (stryCov_9fa48("74197"), sum + queue.size)), NUM.ZERO);
          }
        },
        get draining() {
          if (stryMutAct_9fa48("74198")) {
            {}
          } else {
            stryCov_9fa48("74198");
            return stryMutAct_9fa48("74199") ? this.operationDispatchQueues.every(queue => queue.draining === true) : (stryCov_9fa48("74199"), this.operationDispatchQueues.some(stryMutAct_9fa48("74200") ? () => undefined : (stryCov_9fa48("74200"), queue => stryMutAct_9fa48("74203") ? queue.draining !== true : stryMutAct_9fa48("74202") ? false : stryMutAct_9fa48("74201") ? true : (stryCov_9fa48("74201", "74202", "74203"), queue.draining === (stryMutAct_9fa48("74204") ? false : (stryCov_9fa48("74204"), true))))));
          }
        },
        operationDispatchQueues: this.operationDispatchQueues
      });
    }
  }

  /**
   * Build one queue name for a node-state update shard.
   * @param {number} shardIndex - Zero-based shard index.
   * @return {string}
   * @private
   */
  buildNodeStateUpdateQueueName(shardIndex) {
    if (stryMutAct_9fa48("74205")) {
      {}
    } else {
      stryCov_9fa48("74205");
      if (stryMutAct_9fa48("74209") ? this.nodeStateUpdateQueueShardCount > NUM.ONE : stryMutAct_9fa48("74208") ? this.nodeStateUpdateQueueShardCount < NUM.ONE : stryMutAct_9fa48("74207") ? false : stryMutAct_9fa48("74206") ? true : (stryCov_9fa48("74206", "74207", "74208", "74209"), this.nodeStateUpdateQueueShardCount <= NUM.ONE)) {
        if (stryMutAct_9fa48("74210")) {
          {}
        } else {
          stryCov_9fa48("74210");
          return DISPATCH_QUEUE_NAME.NODE_STATE_UPDATE;
        }
      }
      return stryMutAct_9fa48("74211") ? `` : (stryCov_9fa48("74211"), `${DISPATCH_QUEUE_NAME.NODE_STATE_UPDATE}-${shardIndex}`);
    }
  }

  /**
   * Resolve one node-state update reconcile shard for a node.
   * Assignments are stable for process lifetime to preserve owner-key ordering.
   * @param {string} nodeId - Node ID.
   * @return {OwnerKeyReconcileQueue}
   * @private
   */
  resolveNodeStateUpdateQueue(nodeId) {
    if (stryMutAct_9fa48("74212")) {
      {}
    } else {
      stryCov_9fa48("74212");
      if (stryMutAct_9fa48("74215") ? !Array.isArray(this.nodeStateUpdateQueues) && this.nodeStateUpdateQueues.length <= NUM.ONE : stryMutAct_9fa48("74214") ? false : stryMutAct_9fa48("74213") ? true : (stryCov_9fa48("74213", "74214", "74215"), (stryMutAct_9fa48("74216") ? Array.isArray(this.nodeStateUpdateQueues) : (stryCov_9fa48("74216"), !Array.isArray(this.nodeStateUpdateQueues))) || (stryMutAct_9fa48("74219") ? this.nodeStateUpdateQueues.length > NUM.ONE : stryMutAct_9fa48("74218") ? this.nodeStateUpdateQueues.length < NUM.ONE : stryMutAct_9fa48("74217") ? false : (stryCov_9fa48("74217", "74218", "74219"), this.nodeStateUpdateQueues.length <= NUM.ONE)))) {
        if (stryMutAct_9fa48("74220")) {
          {}
        } else {
          stryCov_9fa48("74220");
          return this.nodeStateUpdateQueue;
        }
      }
      const assignedQueueIndex = this.nodeStateUpdateQueueAssignments.get(nodeId);
      if (stryMutAct_9fa48("74222") ? false : stryMutAct_9fa48("74221") ? true : (stryCov_9fa48("74221", "74222"), Number.isFinite(assignedQueueIndex))) {
        if (stryMutAct_9fa48("74223")) {
          {}
        } else {
          stryCov_9fa48("74223");
          return this.nodeStateUpdateQueues[assignedQueueIndex];
        }
      }
      const queueIndex = stryMutAct_9fa48("74224") ? this.nextNodeStateUpdateQueueIndex * this.nodeStateUpdateQueues.length : (stryCov_9fa48("74224"), this.nextNodeStateUpdateQueueIndex % this.nodeStateUpdateQueues.length);
      stryMutAct_9fa48("74225") ? this.nextNodeStateUpdateQueueIndex -= NUM.ONE : (stryCov_9fa48("74225"), this.nextNodeStateUpdateQueueIndex += NUM.ONE);
      this.nodeStateUpdateQueueAssignments.set(nodeId, queueIndex);
      return this.nodeStateUpdateQueues[queueIndex];
    }
  }

  /**
   * Build an Operation object from a replica_operations row.
   * @param {Object} row - Replica operation row.
   * @return {Object} Operation object.
   * @private
   */
  buildOperationFromRow(row) {
    if (stryMutAct_9fa48("74226")) {
      {}
    } else {
      stryCov_9fa48("74226");
      const stepsHistory = row.steps_history ? JSON.parse(row.steps_history) : stryMutAct_9fa48("74227") ? ["Stryker was here"] : (stryCov_9fa48("74227"), []);
      const operation = stryMutAct_9fa48("74228") ? {} : (stryCov_9fa48("74228"), {
        operationId: row.operation_id,
        type: row.type,
        partitionId: row.partition_id,
        entityType: stryMutAct_9fa48("74231") ? row[COLUMN.ENTITY_TYPE] && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("74230") ? false : stryMutAct_9fa48("74229") ? true : (stryCov_9fa48("74229", "74230", "74231"), row[COLUMN.ENTITY_TYPE] || SERVICE_TYPE.PARTITION),
        entityId: stryMutAct_9fa48("74234") ? row[COLUMN.ENTITY_ID] && row.partition_id : stryMutAct_9fa48("74233") ? false : stryMutAct_9fa48("74232") ? true : (stryCov_9fa48("74232", "74233", "74234"), row[COLUMN.ENTITY_ID] || row.partition_id),
        replicaId: row.replica_id,
        sourceNodeId: row.source_node_id,
        targetNodeId: row.target_node_id,
        status: row.status,
        workflowStep: row.workflow_step,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        errorMessage: row.error_message,
        stepsHistory
      });
      const replicaIds = getOperationMetadataStringArray(stepsHistory, OPERATION_METADATA_KEY.REPLICA_IDS);
      if (stryMutAct_9fa48("74238") ? replicaIds.length <= NUM.ZERO : stryMutAct_9fa48("74237") ? replicaIds.length >= NUM.ZERO : stryMutAct_9fa48("74236") ? false : stryMutAct_9fa48("74235") ? true : (stryCov_9fa48("74235", "74236", "74237", "74238"), replicaIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("74239")) {
          {}
        } else {
          stryCov_9fa48("74239");
          operation[ReplicaOperationField.REPLICA_IDS] = replicaIds;
        }
      }
      const peerAddresses = getOperationMetadataStringArray(stepsHistory, OPERATION_METADATA_KEY.PEER_ADDRESSES);
      if (stryMutAct_9fa48("74243") ? peerAddresses.length <= NUM.ZERO : stryMutAct_9fa48("74242") ? peerAddresses.length >= NUM.ZERO : stryMutAct_9fa48("74241") ? false : stryMutAct_9fa48("74240") ? true : (stryCov_9fa48("74240", "74241", "74242", "74243"), peerAddresses.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("74244")) {
          {}
        } else {
          stryCov_9fa48("74244");
          operation[ReplicaOperationField.PEER_ADDRESSES] = peerAddresses;
        }
      }
      const bootstrapTableMetadata = getOperationMetadataObject(stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA);
      if (stryMutAct_9fa48("74246") ? false : stryMutAct_9fa48("74245") ? true : (stryCov_9fa48("74245", "74246"), bootstrapTableMetadata)) {
        if (stryMutAct_9fa48("74247")) {
          {}
        } else {
          stryCov_9fa48("74247");
          operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] = bootstrapTableMetadata;
        }
      }
      const bootstrapPartitionMetadata = getOperationMetadataObject(stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA);
      if (stryMutAct_9fa48("74249") ? false : stryMutAct_9fa48("74248") ? true : (stryCov_9fa48("74248", "74249"), bootstrapPartitionMetadata)) {
        if (stryMutAct_9fa48("74250")) {
          {}
        } else {
          stryCov_9fa48("74250");
          operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] = bootstrapPartitionMetadata;
        }
      }
      return operation;
    }
  }

  /**
   * Convert a coordinator operation object to replica_operations row shape.
   * @param {Object} operation - RebalanceCoordinator operation object.
   * @return {Object} Row-like object compatible with dispatchOperationRow.
   * @private
   */
  buildOperationRowFromCoordinator(operation) {
    if (stryMutAct_9fa48("74251")) {
      {}
    } else {
      stryCov_9fa48("74251");
      let stepsHistory = operation.stepsHistory;
      if (stryMutAct_9fa48("74254") ? typeof stepsHistory === TYPEOF.STRING : stryMutAct_9fa48("74253") ? false : stryMutAct_9fa48("74252") ? true : (stryCov_9fa48("74252", "74253", "74254"), typeof stepsHistory !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("74255")) {
          {}
        } else {
          stryCov_9fa48("74255");
          stepsHistory = Array.isArray(stepsHistory) ? JSON.stringify(stepsHistory) : STRING.EMPTY_JSON_ARRAY;
        }
      }
      return stryMutAct_9fa48("74256") ? {} : (stryCov_9fa48("74256"), {
        operation_id: operation.operationId,
        type: operation.type,
        partition_id: operation.partitionId,
        replica_id: operation.replicaId,
        source_node_id: operation.sourceNodeId,
        target_node_id: operation.targetNodeId,
        status: operation.status,
        workflow_step: operation.workflowStep,
        created_at: operation.createdAt,
        updated_at: operation.updatedAt,
        completed_at: operation.completedAt,
        error_message: operation.errorMessage,
        steps_history: stepsHistory,
        [COLUMN.ENTITY_TYPE]: operation.entityType,
        [COLUMN.ENTITY_ID]: operation.entityId
      });
    }
  }

  /**
   * Dispatch is internal control-plane progression, so readiness gating uses
   * recovery eligibility to avoid deadlocking on publication convergence.
   *
   * @return {string}
   * @private
   */
  resolveDispatchReadinessDecisionDimension() {
    if (stryMutAct_9fa48("74257")) {
      {}
    } else {
      stryCov_9fa48("74257");
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
  }

  /**
   * Check readiness eligibility for one decision dimension.
   * Falls back to repairEligible only when legacy snapshots do not expose
   * controlPlaneRecoveryEligible explicitly.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   * @private
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    if (stryMutAct_9fa48("74258")) {
      {}
    } else {
      stryCov_9fa48("74258");
      const dimensions = (stryMutAct_9fa48("74261") ? readiness?.dimensions || typeof readiness.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("74260") ? false : stryMutAct_9fa48("74259") ? true : (stryCov_9fa48("74259", "74260", "74261"), (stryMutAct_9fa48("74262") ? readiness.dimensions : (stryCov_9fa48("74262"), readiness?.dimensions)) && (stryMutAct_9fa48("74264") ? typeof readiness.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("74263") ? true : (stryCov_9fa48("74263", "74264"), typeof readiness.dimensions === TYPEOF.OBJECT)))) ? readiness.dimensions : null;
      if (stryMutAct_9fa48("74267") ? false : stryMutAct_9fa48("74266") ? true : stryMutAct_9fa48("74265") ? dimensions : (stryCov_9fa48("74265", "74266", "74267"), !dimensions)) {
        if (stryMutAct_9fa48("74268")) {
          {}
        } else {
          stryCov_9fa48("74268");
          return stryMutAct_9fa48("74269") ? true : (stryCov_9fa48("74269"), false);
        }
      }
      if (stryMutAct_9fa48("74272") ? dimensions[decisionDimension] !== true : stryMutAct_9fa48("74271") ? false : stryMutAct_9fa48("74270") ? true : (stryCov_9fa48("74270", "74271", "74272"), dimensions[decisionDimension] === (stryMutAct_9fa48("74273") ? false : (stryCov_9fa48("74273"), true)))) {
        if (stryMutAct_9fa48("74274")) {
          {}
        } else {
          stryCov_9fa48("74274");
          return stryMutAct_9fa48("74275") ? false : (stryCov_9fa48("74275"), true);
        }
      }
      if (stryMutAct_9fa48("74278") ? decisionDimension === CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("74277") ? false : stryMutAct_9fa48("74276") ? true : (stryCov_9fa48("74276", "74277", "74278"), decisionDimension !== CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)) {
        if (stryMutAct_9fa48("74279")) {
          {}
        } else {
          stryCov_9fa48("74279");
          return stryMutAct_9fa48("74280") ? true : (stryCov_9fa48("74280"), false);
        }
      }
      if (stryMutAct_9fa48("74282") ? false : stryMutAct_9fa48("74281") ? true : (stryCov_9fa48("74281", "74282"), Object.hasOwn(dimensions, decisionDimension))) {
        if (stryMutAct_9fa48("74283")) {
          {}
        } else {
          stryCov_9fa48("74283");
          return stryMutAct_9fa48("74284") ? true : (stryCov_9fa48("74284"), false);
        }
      }
      return stryMutAct_9fa48("74287") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true : stryMutAct_9fa48("74286") ? false : stryMutAct_9fa48("74285") ? true : (stryCov_9fa48("74285", "74286", "74287"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === (stryMutAct_9fa48("74288") ? false : (stryCov_9fa48("74288"), true)));
    }
  }

  /**
   * Allow control-plane recovery dispatch to reuse the already visible sync
   * readiness snapshot when the bounded authoritative refresh path fails for a
   * retryable reason. This keeps critical recovery progressing under transient
   * control-plane pressure without widening dispatch eligibility beyond the
   * canonical recovery-eligible snapshot already in hand.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @param {Error|Object|null} error
   * @return {boolean}
   * @private
   */
  shouldUseSyncDispatchReadinessFallback(readiness, decisionDimension, error) {
    if (stryMutAct_9fa48("74289")) {
      {}
    } else {
      stryCov_9fa48("74289");
      if (stryMutAct_9fa48("74292") ? decisionDimension === CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("74291") ? false : stryMutAct_9fa48("74290") ? true : (stryCov_9fa48("74290", "74291", "74292"), decisionDimension !== CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)) {
        if (stryMutAct_9fa48("74293")) {
          {}
        } else {
          stryCov_9fa48("74293");
          return stryMutAct_9fa48("74294") ? true : (stryCov_9fa48("74294"), false);
        }
      }
      if (stryMutAct_9fa48("74297") ? false : stryMutAct_9fa48("74296") ? true : stryMutAct_9fa48("74295") ? this.isReadinessDimensionSatisfied(readiness, decisionDimension) : (stryCov_9fa48("74295", "74296", "74297"), !this.isReadinessDimensionSatisfied(readiness, decisionDimension))) {
        if (stryMutAct_9fa48("74298")) {
          {}
        } else {
          stryCov_9fa48("74298");
          return stryMutAct_9fa48("74299") ? true : (stryCov_9fa48("74299"), false);
        }
      }
      if (stryMutAct_9fa48("74302") ? false : stryMutAct_9fa48("74301") ? true : stryMutAct_9fa48("74300") ? isRetryableControlPlaneError(error) : (stryCov_9fa48("74300", "74301", "74302"), !isRetryableControlPlaneError(error))) {
        if (stryMutAct_9fa48("74303")) {
          {}
        } else {
          stryCov_9fa48("74303");
          return stryMutAct_9fa48("74304") ? true : (stryCov_9fa48("74304"), false);
        }
      }
      return stryMutAct_9fa48("74305") ? false : (stryCov_9fa48("74305"), true);
    }
  }

  /**
   * Check whether a node is ready for internal topology dispatch work.
   * Dispatch is an internal topology consumer and gates on repairEligible
   * only (Req 4.2). Serve-only dimensions do not block dispatch.
   * @readModel DISPATCH_NODE_READINESS — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId - Node ID.
   * @return {boolean} True if node is ready.
   * @private
   */
  isNodeReady(nodeId) {
    if (stryMutAct_9fa48("74306")) {
      {}
    } else {
      stryCov_9fa48("74306");
      if (stryMutAct_9fa48("74309") ? !nodeId && typeof this.controlPlaneReadinessService.getNodeReadinessSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("74308") ? false : stryMutAct_9fa48("74307") ? true : (stryCov_9fa48("74307", "74308", "74309"), (stryMutAct_9fa48("74310") ? nodeId : (stryCov_9fa48("74310"), !nodeId)) || (stryMutAct_9fa48("74312") ? typeof this.controlPlaneReadinessService.getNodeReadinessSync === TYPEOF.FUNCTION : stryMutAct_9fa48("74311") ? false : (stryCov_9fa48("74311", "74312"), typeof this.controlPlaneReadinessService.getNodeReadinessSync !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("74313")) {
          {}
        } else {
          stryCov_9fa48("74313");
          return stryMutAct_9fa48("74314") ? true : (stryCov_9fa48("74314"), false);
        }
      }
      const decisionDimension = this.resolveDispatchReadinessDecisionDimension();
      const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("74315") ? {} : (stryCov_9fa48("74315"), {
        decisionDimension: decisionDimension
      }));
      return this.isReadinessDimensionSatisfied(readiness, decisionDimension);
    }
  }

  /**
   * Capture readiness snapshot for a dispatch decision.
   * Returns both the ready/not-ready verdict and the compact
   * snapshot summary for persistence in diagnostics.
   *
   * @param {string} nodeId - Target node ID.
   * @return {Promise<{
   *   ready: boolean,
   *   snapshot: Object|null,
   *   retryAfterMs: number|null,
   *   error?: Error,
   * }>}
   * @private
   */
  async captureDispatchReadiness(nodeId) {
    if (stryMutAct_9fa48("74316")) {
      {}
    } else {
      stryCov_9fa48("74316");
      if (stryMutAct_9fa48("74319") ? false : stryMutAct_9fa48("74318") ? true : stryMutAct_9fa48("74317") ? nodeId : (stryCov_9fa48("74317", "74318", "74319"), !nodeId)) {
        if (stryMutAct_9fa48("74320")) {
          {}
        } else {
          stryCov_9fa48("74320");
          return this.buildDispatchReadinessResult(null, null, stryMutAct_9fa48("74321") ? {} : (stryCov_9fa48("74321"), {
            ready: stryMutAct_9fa48("74322") ? true : (stryCov_9fa48("74322"), false),
            snapshot: null,
            retryAfterMs: null
          }));
        }
      }
      const decisionDimension = this.resolveDispatchReadinessDecisionDimension();
      let readiness = null;
      if (stryMutAct_9fa48("74325") ? typeof this.controlPlaneReadinessService.getNodeReadinessSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("74324") ? false : stryMutAct_9fa48("74323") ? true : (stryCov_9fa48("74323", "74324", "74325"), typeof this.controlPlaneReadinessService.getNodeReadinessSync === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("74326")) {
          {}
        } else {
          stryCov_9fa48("74326");
          readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("74327") ? {} : (stryCov_9fa48("74327"), {
            decisionDimension
          }));
        }
      }
      if (stryMutAct_9fa48("74330") ? typeof this.controlPlaneReadinessService.getNodeReadiness !== TYPEOF.FUNCTION : stryMutAct_9fa48("74329") ? false : stryMutAct_9fa48("74328") ? true : (stryCov_9fa48("74328", "74329", "74330"), typeof this.controlPlaneReadinessService.getNodeReadiness === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("74331")) {
          {}
        } else {
          stryCov_9fa48("74331");
          try {
            if (stryMutAct_9fa48("74332")) {
              {}
            } else {
              stryCov_9fa48("74332");
              const authoritativeReadiness = await this.getBoundedDispatchReadiness(nodeId, decisionDimension);
              if (stryMutAct_9fa48("74335") ? authoritativeReadiness || typeof authoritativeReadiness === TYPEOF.OBJECT : stryMutAct_9fa48("74334") ? false : stryMutAct_9fa48("74333") ? true : (stryCov_9fa48("74333", "74334", "74335"), authoritativeReadiness && (stryMutAct_9fa48("74337") ? typeof authoritativeReadiness !== TYPEOF.OBJECT : stryMutAct_9fa48("74336") ? true : (stryCov_9fa48("74336", "74337"), typeof authoritativeReadiness === TYPEOF.OBJECT)))) {
                if (stryMutAct_9fa48("74338")) {
                  {}
                } else {
                  stryCov_9fa48("74338");
                  readiness = authoritativeReadiness;
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("74339")) {
              {}
            } else {
              stryCov_9fa48("74339");
              if (stryMutAct_9fa48("74341") ? false : stryMutAct_9fa48("74340") ? true : (stryCov_9fa48("74340", "74341"), this.shouldUseSyncDispatchReadinessFallback(readiness, decisionDimension, error))) {
                if (stryMutAct_9fa48("74342")) {
                  {}
                } else {
                  stryCov_9fa48("74342");
                  const retryAfterMs = (stryMutAct_9fa48("74345") ? Number.isFinite(readiness?.retryAfterMs) || readiness.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("74344") ? false : stryMutAct_9fa48("74343") ? true : (stryCov_9fa48("74343", "74344", "74345"), Number.isFinite(stryMutAct_9fa48("74346") ? readiness.retryAfterMs : (stryCov_9fa48("74346"), readiness?.retryAfterMs)) && (stryMutAct_9fa48("74349") ? readiness.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("74348") ? readiness.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("74347") ? true : (stryCov_9fa48("74347", "74348", "74349"), readiness.retryAfterMs > NUM.ZERO)))) ? Math.floor(readiness.retryAfterMs) : null;
                  return this.buildDispatchReadinessResult(readiness, decisionDimension, stryMutAct_9fa48("74350") ? {} : (stryCov_9fa48("74350"), {
                    ready: stryMutAct_9fa48("74351") ? false : (stryCov_9fa48("74351"), true),
                    retryAfterMs
                  }));
                }
              }
              return this.buildDispatchReadinessResult(readiness, decisionDimension, stryMutAct_9fa48("74352") ? {} : (stryCov_9fa48("74352"), {
                ready: stryMutAct_9fa48("74353") ? true : (stryCov_9fa48("74353"), false),
                retryAfterMs: this.resolveOperationDispatchRetryAfterMs(error),
                error
              }));
            }
          }
        }
      }
      return this.buildDispatchReadinessResult(readiness, decisionDimension);
    }
  }

  /**
   * Build one dispatch-readiness result object.
   * @param {Object|null} readiness
   * @param {string|null} decisionDimension
   * @param {Object} [overrides={}]
   * @return {{
   *   ready: boolean,
   *   snapshot: Object|null,
   *   retryAfterMs: number|null,
   *   error?: Error,
   * }}
   * @private
   */
  buildDispatchReadinessResult(readiness, decisionDimension, overrides = {}) {
    if (stryMutAct_9fa48("74354")) {
      {}
    } else {
      stryCov_9fa48("74354");
      const snapshot = Object.prototype.hasOwnProperty.call(overrides, stryMutAct_9fa48("74355") ? "" : (stryCov_9fa48("74355"), 'snapshot')) ? overrides.snapshot : ControlPlaneReadinessService.compactSnapshotSummary(readiness, decisionDimension);
      const retryAfterMs = Object.prototype.hasOwnProperty.call(overrides, stryMutAct_9fa48("74356") ? "" : (stryCov_9fa48("74356"), 'retryAfterMs')) ? overrides.retryAfterMs : (stryMutAct_9fa48("74359") ? Number.isFinite(readiness?.retryAfterMs) || readiness.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("74358") ? false : stryMutAct_9fa48("74357") ? true : (stryCov_9fa48("74357", "74358", "74359"), Number.isFinite(stryMutAct_9fa48("74360") ? readiness.retryAfterMs : (stryCov_9fa48("74360"), readiness?.retryAfterMs)) && (stryMutAct_9fa48("74363") ? readiness.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("74362") ? readiness.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("74361") ? true : (stryCov_9fa48("74361", "74362", "74363"), readiness.retryAfterMs > NUM.ZERO)))) ? Math.floor(readiness.retryAfterMs) : null;
      const result = stryMutAct_9fa48("74364") ? {} : (stryCov_9fa48("74364"), {
        ready: Object.prototype.hasOwnProperty.call(overrides, stryMutAct_9fa48("74365") ? "" : (stryCov_9fa48("74365"), 'ready')) ? overrides.ready : this.isReadinessDimensionSatisfied(readiness, decisionDimension),
        snapshot,
        retryAfterMs
      });
      if (stryMutAct_9fa48("74367") ? false : stryMutAct_9fa48("74366") ? true : (stryCov_9fa48("74366", "74367"), Object.prototype.hasOwnProperty.call(overrides, REPLICA_DISPATCH_SERVICE_LITERAL.ERROR))) {
        if (stryMutAct_9fa48("74368")) {
          {}
        } else {
          stryCov_9fa48("74368");
          result.error = overrides.error;
        }
      }
      return result;
    }
  }

  /**
   * Emit one dispatch failure diagnostic and dedupe exact repeats.
   * @param {Object} payload
   * @return {void}
   * @private
   */
  recordDispatchFailure(payload = {}) {
    if (stryMutAct_9fa48("74369")) {
      {}
    } else {
      stryCov_9fa48("74369");
      const operationId = stryMutAct_9fa48("74372") ? payload.operationId && null : stryMutAct_9fa48("74371") ? false : stryMutAct_9fa48("74370") ? true : (stryCov_9fa48("74370", "74371", "74372"), payload.operationId || null);
      if (stryMutAct_9fa48("74375") ? false : stryMutAct_9fa48("74374") ? true : stryMutAct_9fa48("74373") ? operationId : (stryCov_9fa48("74373", "74374", "74375"), !operationId)) {
        if (stryMutAct_9fa48("74376")) {
          {}
        } else {
          stryCov_9fa48("74376");
          return;
        }
      }
      const signature = JSON.stringify(stryMutAct_9fa48("74377") ? {} : (stryCov_9fa48("74377"), {
        skipped: stryMutAct_9fa48("74380") ? payload.skipped !== true : stryMutAct_9fa48("74379") ? false : stryMutAct_9fa48("74378") ? true : (stryCov_9fa48("74378", "74379", "74380"), payload.skipped === (stryMutAct_9fa48("74381") ? false : (stryCov_9fa48("74381"), true))),
        reason: stryMutAct_9fa48("74384") ? payload.reason && null : stryMutAct_9fa48("74383") ? false : stryMutAct_9fa48("74382") ? true : (stryCov_9fa48("74382", "74383", "74384"), payload.reason || null),
        error: stryMutAct_9fa48("74387") ? payload.error && null : stryMutAct_9fa48("74386") ? false : stryMutAct_9fa48("74385") ? true : (stryCov_9fa48("74385", "74386", "74387"), payload.error || null),
        readinessSnapshot: stryMutAct_9fa48("74390") ? payload.readinessSnapshot && null : stryMutAct_9fa48("74389") ? false : stryMutAct_9fa48("74388") ? true : (stryCov_9fa48("74388", "74389", "74390"), payload.readinessSnapshot || null)
      }));
      if (stryMutAct_9fa48("74393") ? this.dispatchFailureSignaturesByOperationId.get(operationId) !== signature : stryMutAct_9fa48("74392") ? false : stryMutAct_9fa48("74391") ? true : (stryCov_9fa48("74391", "74392", "74393"), this.dispatchFailureSignaturesByOperationId.get(operationId) === signature)) {
        if (stryMutAct_9fa48("74394")) {
          {}
        } else {
          stryCov_9fa48("74394");
          return;
        }
      }
      this.dispatchFailureSignaturesByOperationId.set(operationId, signature);
      const eventPayload = stryMutAct_9fa48("74395") ? {} : (stryCov_9fa48("74395"), {
        operationId,
        targetNodeId: stryMutAct_9fa48("74398") ? payload.targetNodeId && null : stryMutAct_9fa48("74397") ? false : stryMutAct_9fa48("74396") ? true : (stryCov_9fa48("74396", "74397", "74398"), payload.targetNodeId || null),
        workflowStep: stryMutAct_9fa48("74401") ? payload.workflowStep && null : stryMutAct_9fa48("74400") ? false : stryMutAct_9fa48("74399") ? true : (stryCov_9fa48("74399", "74400", "74401"), payload.workflowStep || null),
        skipped: stryMutAct_9fa48("74404") ? payload.skipped !== true : stryMutAct_9fa48("74403") ? false : stryMutAct_9fa48("74402") ? true : (stryCov_9fa48("74402", "74403", "74404"), payload.skipped === (stryMutAct_9fa48("74405") ? false : (stryCov_9fa48("74405"), true))),
        reason: stryMutAct_9fa48("74408") ? payload.reason && null : stryMutAct_9fa48("74407") ? false : stryMutAct_9fa48("74406") ? true : (stryCov_9fa48("74406", "74407", "74408"), payload.reason || null),
        error: stryMutAct_9fa48("74411") ? payload.error && null : stryMutAct_9fa48("74410") ? false : stryMutAct_9fa48("74409") ? true : (stryCov_9fa48("74409", "74410", "74411"), payload.error || null),
        readinessSnapshot: stryMutAct_9fa48("74414") ? payload.readinessSnapshot && null : stryMutAct_9fa48("74413") ? false : stryMutAct_9fa48("74412") ? true : (stryCov_9fa48("74412", "74413", "74414"), payload.readinessSnapshot || null)
      });
      this.logger.warn(DISPATCH_LOG_MSG.DISPATCH_FAILED, stryMutAct_9fa48("74415") ? {} : (stryCov_9fa48("74415"), {
        nodeId: this.nodeId,
        ...eventPayload
      }));
      this.emit(DISPATCH_EVENT.OPERATION_FAILED, eventPayload);
    }
  }

  /**
   * Check if target node has an active handler for the entity type.
   * @readModel DISPATCH_HANDLER_CHECK — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId - Target node ID.
   * @param {string} entityType - Entity type from the operation.
   * @return {Promise<boolean>} True if a matching active service
   *   exists.
   * @private
   */
  async hasHandlerOnTarget(nodeId, entityType) {
    if (stryMutAct_9fa48("74416")) {
      {}
    } else {
      stryCov_9fa48("74416");
      const serviceRows = (stryMutAct_9fa48("74419") ? this.servicesOwner || typeof this.servicesOwner.listServicesFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("74418") ? false : stryMutAct_9fa48("74417") ? true : (stryCov_9fa48("74417", "74418", "74419"), this.servicesOwner && (stryMutAct_9fa48("74421") ? typeof this.servicesOwner.listServicesFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("74420") ? true : (stryCov_9fa48("74420", "74421"), typeof this.servicesOwner.listServicesFromCache === TYPEOF.FUNCTION)))) ? stryMutAct_9fa48("74424") ? (await this.servicesOwner.listServicesFromCache()).rows && [] : stryMutAct_9fa48("74423") ? false : stryMutAct_9fa48("74422") ? true : (stryCov_9fa48("74422", "74423", "74424"), (await this.servicesOwner.listServicesFromCache()).rows || (stryMutAct_9fa48("74425") ? ["Stryker was here"] : (stryCov_9fa48("74425"), []))) : this.getSystemTableRowsFromCache(SYSTEM_TABLE_NAME.SERVICES);
      return stryMutAct_9fa48("74426") ? serviceRows.every(row => {
        return row?.[COLUMN.NODE_ID] === nodeId && row?.[COLUMN.SERVICE_TYPE] === entityType && row?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
      }) : (stryCov_9fa48("74426"), serviceRows.some(row => {
        if (stryMutAct_9fa48("74427")) {
          {}
        } else {
          stryCov_9fa48("74427");
          return stryMutAct_9fa48("74430") ? row?.[COLUMN.NODE_ID] === nodeId && row?.[COLUMN.SERVICE_TYPE] === entityType || row?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("74429") ? false : stryMutAct_9fa48("74428") ? true : (stryCov_9fa48("74428", "74429", "74430"), (stryMutAct_9fa48("74432") ? row?.[COLUMN.NODE_ID] === nodeId || row?.[COLUMN.SERVICE_TYPE] === entityType : stryMutAct_9fa48("74431") ? true : (stryCov_9fa48("74431", "74432"), (stryMutAct_9fa48("74434") ? row?.[COLUMN.NODE_ID] !== nodeId : stryMutAct_9fa48("74433") ? true : (stryCov_9fa48("74433", "74434"), (stryMutAct_9fa48("74435") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("74435"), row?.[COLUMN.NODE_ID])) === nodeId)) && (stryMutAct_9fa48("74437") ? row?.[COLUMN.SERVICE_TYPE] !== entityType : stryMutAct_9fa48("74436") ? true : (stryCov_9fa48("74436", "74437"), (stryMutAct_9fa48("74438") ? row[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("74438"), row?.[COLUMN.SERVICE_TYPE])) === entityType)))) && (stryMutAct_9fa48("74440") ? row?.[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("74439") ? true : (stryCov_9fa48("74439", "74440"), (stryMutAct_9fa48("74441") ? row[COLUMN.STATUS] : (stryCov_9fa48("74441"), row?.[COLUMN.STATUS])) === SERVICE_STATUS.ACTIVE)));
        }
      }));
    }
  }

  /**
   * Read a node row from SystemTableCache.
   * @param {string} nodeId - Node ID.
   * @return {Promise<Object>} Node row or empty object.
   * @private
   */
  async getNodeRow(nodeId) {
    if (stryMutAct_9fa48("74442")) {
      {}
    } else {
      stryCov_9fa48("74442");
      if (stryMutAct_9fa48("74445") ? this.nodesOwner || typeof this.nodesOwner.getNodeFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("74444") ? false : stryMutAct_9fa48("74443") ? true : (stryCov_9fa48("74443", "74444", "74445"), this.nodesOwner && (stryMutAct_9fa48("74447") ? typeof this.nodesOwner.getNodeFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("74446") ? true : (stryCov_9fa48("74446", "74447"), typeof this.nodesOwner.getNodeFromCache === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("74448")) {
          {}
        } else {
          stryCov_9fa48("74448");
          const result = await this.nodesOwner.getNodeFromCache(nodeId);
          return stryMutAct_9fa48("74451") ? unwrapRowReadResult(result) && {} : stryMutAct_9fa48("74450") ? false : stryMutAct_9fa48("74449") ? true : (stryCov_9fa48("74449", "74450", "74451"), unwrapRowReadResult(result) || {});
        }
      }
      return stryMutAct_9fa48("74454") ? this.getSystemTableRowFromCache(SYSTEM_TABLE_NAME.NODES, nodeId) && {} : stryMutAct_9fa48("74453") ? false : stryMutAct_9fa48("74452") ? true : (stryCov_9fa48("74452", "74453", "74454"), this.getSystemTableRowFromCache(SYSTEM_TABLE_NAME.NODES, nodeId) || {});
    }
  }

  /**
   * Read one authoritative node row directly from the control-plane gateway.
   * This lets restart recovery distinguish a genuinely missing node row from a
   * transiently unavailable authoritative path.
   * @param {string} nodeId
   * @return {Promise<Object>}
   * @private
   */
  async getAuthoritativeNodeRow(nodeId) {
    if (stryMutAct_9fa48("74455")) {
      {}
    } else {
      stryCov_9fa48("74455");
      const gateway = this.getControlPlaneSystemTableGateway();
      let result = null;
      if (stryMutAct_9fa48("74458") ? typeof gateway.readAuthoritativeRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("74457") ? false : stryMutAct_9fa48("74456") ? true : (stryCov_9fa48("74456", "74457", "74458"), typeof gateway.readAuthoritativeRows === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("74459")) {
          {}
        } else {
          stryCov_9fa48("74459");
          result = await gateway.readAuthoritativeRows(SYSTEM_TABLE_NAME.NODES, REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK, stryMutAct_9fa48("74460") ? [] : (stryCov_9fa48("74460"), [nodeId]), stryMutAct_9fa48("74461") ? {} : (stryCov_9fa48("74461"), {
            owner: DISPATCH_SUBSYSTEM
          }));
        }
      } else if (stryMutAct_9fa48("74464") ? typeof gateway.executeRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("74463") ? false : stryMutAct_9fa48("74462") ? true : (stryCov_9fa48("74462", "74463", "74464"), typeof gateway.executeRead === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("74465")) {
          {}
        } else {
          stryCov_9fa48("74465");
          result = await gateway.executeRead(stryMutAct_9fa48("74466") ? {} : (stryCov_9fa48("74466"), {
            tableName: SYSTEM_TABLE_NAME.NODES,
            sql: REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK,
            params: stryMutAct_9fa48("74467") ? [] : (stryCov_9fa48("74467"), [nodeId]),
            strategy: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE
          }), stryMutAct_9fa48("74468") ? {} : (stryCov_9fa48("74468"), {
            owner: DISPATCH_SUBSYSTEM
          }));
        }
      } else if (stryMutAct_9fa48("74471") ? typeof gateway.readRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("74470") ? false : stryMutAct_9fa48("74469") ? true : (stryCov_9fa48("74469", "74470", "74471"), typeof gateway.readRows === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("74472")) {
          {}
        } else {
          stryCov_9fa48("74472");
          result = await gateway.readRows(SYSTEM_TABLE_NAME.NODES, REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK, stryMutAct_9fa48("74473") ? [] : (stryCov_9fa48("74473"), [nodeId]), stryMutAct_9fa48("74474") ? {} : (stryCov_9fa48("74474"), {
            owner: DISPATCH_SUBSYSTEM
          }));
        }
      }
      if (stryMutAct_9fa48("74477") ? result?.success !== false : stryMutAct_9fa48("74476") ? false : stryMutAct_9fa48("74475") ? true : (stryCov_9fa48("74475", "74476", "74477"), (stryMutAct_9fa48("74478") ? result.success : (stryCov_9fa48("74478"), result?.success)) === (stryMutAct_9fa48("74479") ? true : (stryCov_9fa48("74479"), false)))) {
        if (stryMutAct_9fa48("74480")) {
          {}
        } else {
          stryCov_9fa48("74480");
          return stryMutAct_9fa48("74481") ? {} : (stryCov_9fa48("74481"), {
            success: stryMutAct_9fa48("74482") ? true : (stryCov_9fa48("74482"), false),
            error: stryMutAct_9fa48("74485") ? result.error && DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE : stryMutAct_9fa48("74484") ? false : stryMutAct_9fa48("74483") ? true : (stryCov_9fa48("74483", "74484", "74485"), result.error || DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE),
            deferRetry: stryMutAct_9fa48("74488") ? result.deferRetry === true && result.error === DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE : stryMutAct_9fa48("74487") ? false : stryMutAct_9fa48("74486") ? true : (stryCov_9fa48("74486", "74487", "74488"), (stryMutAct_9fa48("74490") ? result.deferRetry !== true : stryMutAct_9fa48("74489") ? false : (stryCov_9fa48("74489", "74490"), result.deferRetry === (stryMutAct_9fa48("74491") ? false : (stryCov_9fa48("74491"), true)))) || (stryMutAct_9fa48("74493") ? result.error !== DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE : stryMutAct_9fa48("74492") ? false : (stryCov_9fa48("74492", "74493"), result.error === DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE))),
            retryAfterMs: Number.isFinite(result.retryAfterMs) ? result.retryAfterMs : this.nodeStateUpdateRetryAfterMs
          });
        }
      }
      const rows = Array.isArray(stryMutAct_9fa48("74494") ? result.rows : (stryCov_9fa48("74494"), result?.rows)) ? result.rows : Array.isArray(result) ? result : stryMutAct_9fa48("74495") ? ["Stryker was here"] : (stryCov_9fa48("74495"), []);
      const row = stryMutAct_9fa48("74498") ? rows[0] && null : stryMutAct_9fa48("74497") ? false : stryMutAct_9fa48("74496") ? true : (stryCov_9fa48("74496", "74497", "74498"), rows[0] || null);
      return stryMutAct_9fa48("74499") ? {} : (stryCov_9fa48("74499"), {
        success: stryMutAct_9fa48("74500") ? false : (stryCov_9fa48("74500"), true),
        row
      });
    }
  }

  /**
   * Classify a zero-row NODE_STATE_UPDATE write miss.
   * Previously known nodes may be temporarily invisible while authoritative
   * control-plane recovery is still converging, so misses remain retryable
   * through the owner queue when authoritative visibility lags.
   * @param {string} nodeId
   * @param {Object} existing
   * @return {Promise<Error>}
   * @private
   */
  async resolveMissingNodeRowUpdateError(nodeId, existing) {
    if (stryMutAct_9fa48("74501")) {
      {}
    } else {
      stryCov_9fa48("74501");
      const error = this.buildMissingNodeRowError(nodeId);
      if (stryMutAct_9fa48("74504") ? !existing && !existing[COLUMN.NODE_ID] : stryMutAct_9fa48("74503") ? false : stryMutAct_9fa48("74502") ? true : (stryCov_9fa48("74502", "74503", "74504"), (stryMutAct_9fa48("74505") ? existing : (stryCov_9fa48("74505"), !existing)) || (stryMutAct_9fa48("74506") ? existing[COLUMN.NODE_ID] : (stryCov_9fa48("74506"), !existing[COLUMN.NODE_ID])))) {
        if (stryMutAct_9fa48("74507")) {
          {}
        } else {
          stryCov_9fa48("74507");
          return error;
        }
      }
      try {
        if (stryMutAct_9fa48("74508")) {
          {}
        } else {
          stryCov_9fa48("74508");
          const authoritativeNodeRow = await this.getAuthoritativeNodeRow(nodeId);
          if (stryMutAct_9fa48("74511") ? authoritativeNodeRow?.success !== true : stryMutAct_9fa48("74510") ? false : stryMutAct_9fa48("74509") ? true : (stryCov_9fa48("74509", "74510", "74511"), (stryMutAct_9fa48("74512") ? authoritativeNodeRow.success : (stryCov_9fa48("74512"), authoritativeNodeRow?.success)) === (stryMutAct_9fa48("74513") ? false : (stryCov_9fa48("74513"), true)))) {
            if (stryMutAct_9fa48("74514")) {
              {}
            } else {
              stryCov_9fa48("74514");
              if (stryMutAct_9fa48("74517") ? authoritativeNodeRow.row[COLUMN.NODE_ID] : stryMutAct_9fa48("74516") ? false : stryMutAct_9fa48("74515") ? true : (stryCov_9fa48("74515", "74516", "74517"), authoritativeNodeRow.row?.[COLUMN.NODE_ID])) {
                if (stryMutAct_9fa48("74518")) {
                  {}
                } else {
                  stryCov_9fa48("74518");
                  this.applyRetryableNodeRowUpdateError(error, DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_NODE_ROW_VISIBILITY_LAG, this.nodeStateUpdateRetryAfterMs);
                }
              }
              return error;
            }
          }
          if (stryMutAct_9fa48("74521") ? authoritativeNodeRow?.deferRetry !== true : stryMutAct_9fa48("74520") ? false : stryMutAct_9fa48("74519") ? true : (stryCov_9fa48("74519", "74520", "74521"), (stryMutAct_9fa48("74522") ? authoritativeNodeRow.deferRetry : (stryCov_9fa48("74522"), authoritativeNodeRow?.deferRetry)) === (stryMutAct_9fa48("74523") ? false : (stryCov_9fa48("74523"), true)))) {
            if (stryMutAct_9fa48("74524")) {
              {}
            } else {
              stryCov_9fa48("74524");
              this.applyRetryableNodeRowUpdateError(error, stryMutAct_9fa48("74527") ? authoritativeNodeRow.error && DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE : stryMutAct_9fa48("74526") ? false : stryMutAct_9fa48("74525") ? true : (stryCov_9fa48("74525", "74526", "74527"), authoritativeNodeRow.error || DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE), authoritativeNodeRow.retryAfterMs);
            }
          }
          return error;
        }
      } catch (readError) {
        if (stryMutAct_9fa48("74528")) {
          {}
        } else {
          stryCov_9fa48("74528");
          const readMessage = stryMutAct_9fa48("74531") ? readError?.message && String(readError) : stryMutAct_9fa48("74530") ? false : stryMutAct_9fa48("74529") ? true : (stryCov_9fa48("74529", "74530", "74531"), (stryMutAct_9fa48("74532") ? readError.message : (stryCov_9fa48("74532"), readError?.message)) || String(readError));
          if (stryMutAct_9fa48("74535") ? (readError?.deferRetry === true || typeof this.cdcIntegrationService?.isTransientCdcError === TYPEOF.FUNCTION && this.cdcIntegrationService.isTransientCdcError(readMessage)) && readMessage.includes(DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE) : stryMutAct_9fa48("74534") ? false : stryMutAct_9fa48("74533") ? true : (stryCov_9fa48("74533", "74534", "74535"), (stryMutAct_9fa48("74537") ? readError?.deferRetry === true && typeof this.cdcIntegrationService?.isTransientCdcError === TYPEOF.FUNCTION && this.cdcIntegrationService.isTransientCdcError(readMessage) : stryMutAct_9fa48("74536") ? false : (stryCov_9fa48("74536", "74537"), (stryMutAct_9fa48("74539") ? readError?.deferRetry !== true : stryMutAct_9fa48("74538") ? false : (stryCov_9fa48("74538", "74539"), (stryMutAct_9fa48("74540") ? readError.deferRetry : (stryCov_9fa48("74540"), readError?.deferRetry)) === (stryMutAct_9fa48("74541") ? false : (stryCov_9fa48("74541"), true)))) || (stryMutAct_9fa48("74543") ? typeof this.cdcIntegrationService?.isTransientCdcError === TYPEOF.FUNCTION || this.cdcIntegrationService.isTransientCdcError(readMessage) : stryMutAct_9fa48("74542") ? false : (stryCov_9fa48("74542", "74543"), (stryMutAct_9fa48("74545") ? typeof this.cdcIntegrationService?.isTransientCdcError !== TYPEOF.FUNCTION : stryMutAct_9fa48("74544") ? true : (stryCov_9fa48("74544", "74545"), typeof (stryMutAct_9fa48("74546") ? this.cdcIntegrationService.isTransientCdcError : (stryCov_9fa48("74546"), this.cdcIntegrationService?.isTransientCdcError)) === TYPEOF.FUNCTION)) && this.cdcIntegrationService.isTransientCdcError(readMessage))))) || readMessage.includes(DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE))) {
            if (stryMutAct_9fa48("74547")) {
              {}
            } else {
              stryCov_9fa48("74547");
              this.applyRetryableNodeRowUpdateError(error, stryMutAct_9fa48("74550") ? readError?.code && DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE : stryMutAct_9fa48("74549") ? false : stryMutAct_9fa48("74548") ? true : (stryCov_9fa48("74548", "74549", "74550"), (stryMutAct_9fa48("74551") ? readError.code : (stryCov_9fa48("74551"), readError?.code)) || DISPATCH_READINESS_ERROR_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE), Number.isFinite(stryMutAct_9fa48("74552") ? readError.retryAfterMs : (stryCov_9fa48("74552"), readError?.retryAfterMs)) ? readError.retryAfterMs : this.nodeStateUpdateRetryAfterMs);
            }
          }
          return error;
        }
      }
    }
  }

  /**
   * Apply one retryable node-row update classification.
   * @param {Error} error
   * @param {string} reasonCode
   * @param {number|null|undefined} retryAfterMs
   * @return {Error}
   * @private
   */
  applyRetryableNodeRowUpdateError(error, reasonCode, retryAfterMs) {
    if (stryMutAct_9fa48("74553")) {
      {}
    } else {
      stryCov_9fa48("74553");
      error.deferRetry = stryMutAct_9fa48("74554") ? false : (stryCov_9fa48("74554"), true);
      error.retryAfterMs = retryAfterMs;
      error.reasonCode = reasonCode;
      return error;
    }
  }

  /**
   * Build one typed missing-node-row error for steady-state updates.
   * @param {string} nodeId
   * @return {Error}
   * @private
   */
  buildMissingNodeRowError(nodeId) {
    if (stryMutAct_9fa48("74555")) {
      {}
    } else {
      stryCov_9fa48("74555");
      const error = new Error(stryMutAct_9fa48("74556") ? `` : (stryCov_9fa48("74556"), `${DISPATCH_ERROR_MSG.NODE_ROW_MISSING}: ${nodeId}`));
      error.code = REPLICA_DISPATCH_SERVICE_LITERAL.NODE_ROW_MISSING;
      error.nodeId = nodeId;
      return error;
    }
  }

  /**
   * Read one authoritative replica_operations row directly from the control-
   * plane gateway. Dispatch retries use this to recover when owner-local cache
   * visibility lags behind the persisted operation row.
   * @param {string} operationId
   * @return {Promise<Object|null>}
   * @private
   */
  async getAuthoritativeReplicaOperationRow(operationId) {
    if (stryMutAct_9fa48("74557")) {
      {}
    } else {
      stryCov_9fa48("74557");
      const authoritativeOperationQuery = (stryMutAct_9fa48("74560") ? this.rebalanceCoordinator?.repository || typeof this.rebalanceCoordinator.repository.queryAuthoritativeOperationById === TYPEOF.FUNCTION : stryMutAct_9fa48("74559") ? false : stryMutAct_9fa48("74558") ? true : (stryCov_9fa48("74558", "74559", "74560"), (stryMutAct_9fa48("74561") ? this.rebalanceCoordinator.repository : (stryCov_9fa48("74561"), this.rebalanceCoordinator?.repository)) && (stryMutAct_9fa48("74563") ? typeof this.rebalanceCoordinator.repository.queryAuthoritativeOperationById !== TYPEOF.FUNCTION : stryMutAct_9fa48("74562") ? true : (stryCov_9fa48("74562", "74563"), typeof this.rebalanceCoordinator.repository.queryAuthoritativeOperationById === TYPEOF.FUNCTION)))) ? this.rebalanceCoordinator.repository.queryAuthoritativeOperationById.bind(this.rebalanceCoordinator.repository) : null;
      if (stryMutAct_9fa48("74565") ? false : stryMutAct_9fa48("74564") ? true : (stryCov_9fa48("74564", "74565"), authoritativeOperationQuery)) {
        if (stryMutAct_9fa48("74566")) {
          {}
        } else {
          stryCov_9fa48("74566");
          const authoritativeOperation = await authoritativeOperationQuery(operationId, stryMutAct_9fa48("74567") ? {} : (stryCov_9fa48("74567"), {
            requireOwnerRpcRead: stryMutAct_9fa48("74568") ? true : (stryCov_9fa48("74568"), false)
          }));
          if (stryMutAct_9fa48("74570") ? false : stryMutAct_9fa48("74569") ? true : (stryCov_9fa48("74569", "74570"), authoritativeOperation)) {
            if (stryMutAct_9fa48("74571")) {
              {}
            } else {
              stryCov_9fa48("74571");
              return this.buildOperationRowFromCoordinator(authoritativeOperation);
            }
          }
          return null;
        }
      }
      const gateway = this.controlPlaneSystemTableGateway;
      if (stryMutAct_9fa48("74574") ? (!operationId || !gateway) && typeof gateway !== TYPEOF.OBJECT : stryMutAct_9fa48("74573") ? false : stryMutAct_9fa48("74572") ? true : (stryCov_9fa48("74572", "74573", "74574"), (stryMutAct_9fa48("74576") ? !operationId && !gateway : stryMutAct_9fa48("74575") ? false : (stryCov_9fa48("74575", "74576"), (stryMutAct_9fa48("74577") ? operationId : (stryCov_9fa48("74577"), !operationId)) || (stryMutAct_9fa48("74578") ? gateway : (stryCov_9fa48("74578"), !gateway)))) || (stryMutAct_9fa48("74580") ? typeof gateway === TYPEOF.OBJECT : stryMutAct_9fa48("74579") ? false : (stryCov_9fa48("74579", "74580"), typeof gateway !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("74581")) {
          {}
        } else {
          stryCov_9fa48("74581");
          return null;
        }
      }
      let result = null;
      if (stryMutAct_9fa48("74584") ? typeof gateway.readAuthoritativeRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("74583") ? false : stryMutAct_9fa48("74582") ? true : (stryCov_9fa48("74582", "74583", "74584"), typeof gateway.readAuthoritativeRows === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("74585")) {
          {}
        } else {
          stryCov_9fa48("74585");
          result = await gateway.readAuthoritativeRows(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK, stryMutAct_9fa48("74586") ? [] : (stryCov_9fa48("74586"), [operationId]), stryMutAct_9fa48("74587") ? {} : (stryCov_9fa48("74587"), {
            owner: DISPATCH_SUBSYSTEM
          }));
        }
      } else if (stryMutAct_9fa48("74590") ? typeof gateway.executeRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("74589") ? false : stryMutAct_9fa48("74588") ? true : (stryCov_9fa48("74588", "74589", "74590"), typeof gateway.executeRead === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("74591")) {
          {}
        } else {
          stryCov_9fa48("74591");
          result = await gateway.executeRead(stryMutAct_9fa48("74592") ? {} : (stryCov_9fa48("74592"), {
            tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
            sql: REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK,
            params: stryMutAct_9fa48("74593") ? [] : (stryCov_9fa48("74593"), [operationId]),
            strategy: REPLICA_DISPATCH_SERVICE_LITERAL.AUTHORITATIVE
          }), stryMutAct_9fa48("74594") ? {} : (stryCov_9fa48("74594"), {
            owner: DISPATCH_SUBSYSTEM
          }));
        }
      } else if (stryMutAct_9fa48("74597") ? typeof gateway.readRows !== TYPEOF.FUNCTION : stryMutAct_9fa48("74596") ? false : stryMutAct_9fa48("74595") ? true : (stryCov_9fa48("74595", "74596", "74597"), typeof gateway.readRows === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("74598")) {
          {}
        } else {
          stryCov_9fa48("74598");
          result = await gateway.readRows(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, REPLICA_DISPATCH_SERVICE_LITERAL.SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK, stryMutAct_9fa48("74599") ? [] : (stryCov_9fa48("74599"), [operationId]), stryMutAct_9fa48("74600") ? {} : (stryCov_9fa48("74600"), {
            owner: DISPATCH_SUBSYSTEM
          }));
        }
      }
      if (stryMutAct_9fa48("74603") ? result?.success !== false : stryMutAct_9fa48("74602") ? false : stryMutAct_9fa48("74601") ? true : (stryCov_9fa48("74601", "74602", "74603"), (stryMutAct_9fa48("74604") ? result.success : (stryCov_9fa48("74604"), result?.success)) === (stryMutAct_9fa48("74605") ? true : (stryCov_9fa48("74605"), false)))) {
        if (stryMutAct_9fa48("74606")) {
          {}
        } else {
          stryCov_9fa48("74606");
          return null;
        }
      }
      const rows = Array.isArray(stryMutAct_9fa48("74607") ? result.rows : (stryCov_9fa48("74607"), result?.rows)) ? result.rows : Array.isArray(result) ? result : stryMutAct_9fa48("74608") ? ["Stryker was here"] : (stryCov_9fa48("74608"), []);
      return stryMutAct_9fa48("74611") ? rows[REPLICA_DISPATCH_SERVICE_LITERAL.ZERO] && null : stryMutAct_9fa48("74610") ? false : stryMutAct_9fa48("74609") ? true : (stryCov_9fa48("74609", "74610", "74611"), rows[REPLICA_DISPATCH_SERVICE_LITERAL.ZERO] || null);
    }
  }

  /**
   * Get a replica operation row from cache, with authoritative fallback when
   * the persisted row is still invisible to the local cache.
   * @readModel DISPATCH_OPERATION_LOOKUP — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} operationId - Operation ID.
   * @return {Promise<Object|null>} Operation row or null.
   * @private
   */
  async getReplicaOperationRow(operationId) {
    if (stryMutAct_9fa48("74612")) {
      {}
    } else {
      stryCov_9fa48("74612");
      if (stryMutAct_9fa48("74615") ? this.replicaOperationsOwner || typeof this.replicaOperationsOwner.getReplicaOperationFromCache === TYPEOF.FUNCTION : stryMutAct_9fa48("74614") ? false : stryMutAct_9fa48("74613") ? true : (stryCov_9fa48("74613", "74614", "74615"), this.replicaOperationsOwner && (stryMutAct_9fa48("74617") ? typeof this.replicaOperationsOwner.getReplicaOperationFromCache !== TYPEOF.FUNCTION : stryMutAct_9fa48("74616") ? true : (stryCov_9fa48("74616", "74617"), typeof this.replicaOperationsOwner.getReplicaOperationFromCache === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("74618")) {
          {}
        } else {
          stryCov_9fa48("74618");
          const result = await this.replicaOperationsOwner.getReplicaOperationFromCache(operationId);
          const cachedRow = unwrapRowReadResult(result);
          if (stryMutAct_9fa48("74620") ? false : stryMutAct_9fa48("74619") ? true : (stryCov_9fa48("74619", "74620"), cachedRow)) {
            if (stryMutAct_9fa48("74621")) {
              {}
            } else {
              stryCov_9fa48("74621");
              return cachedRow;
            }
          }
          return this.getAuthoritativeReplicaOperationRow(operationId);
        }
      }
      const cachedRow = stryMutAct_9fa48("74624") ? this.getSystemTableRowFromCache(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId) && null : stryMutAct_9fa48("74623") ? false : stryMutAct_9fa48("74622") ? true : (stryCov_9fa48("74622", "74623", "74624"), this.getSystemTableRowFromCache(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId) || null);
      if (stryMutAct_9fa48("74626") ? false : stryMutAct_9fa48("74625") ? true : (stryCov_9fa48("74625", "74626"), cachedRow)) {
        if (stryMutAct_9fa48("74627")) {
          {}
        } else {
          stryCov_9fa48("74627");
          return cachedRow;
        }
      }
      return this.getAuthoritativeReplicaOperationRow(operationId);
    }
  }

  /**
   * Read one row from SystemTableCache if key access is available.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key.
   * @return {Object|null} Cached row or null.
   * @private
   */
  getSystemTableRowFromCache(tableName, key) {
    if (stryMutAct_9fa48("74628")) {
      {}
    } else {
      stryCov_9fa48("74628");
      return stryMutAct_9fa48("74631") ? this.systemTableCache.get(tableName, key) && null : stryMutAct_9fa48("74630") ? false : stryMutAct_9fa48("74629") ? true : (stryCov_9fa48("74629", "74630", "74631"), this.systemTableCache.get(tableName, key) || null);
    }
  }

  /**
   * Read all rows from SystemTableCache if table scans are available.
   * @param {string} tableName - System table name.
   * @return {Array<Object>|null} Cached rows or null when unavailable.
   * @private
   */
  getSystemTableRowsFromCache(tableName) {
    if (stryMutAct_9fa48("74632")) {
      {}
    } else {
      stryCov_9fa48("74632");
      const rows = this.systemTableCache.getAll(tableName);
      return Array.isArray(rows) ? rows : stryMutAct_9fa48("74633") ? ["Stryker was here"] : (stryCov_9fa48("74633"), []);
    }
  }

  /**
   * Forward control message to the current leader.
   * @param {Object} mgService - Message group service.
   * @param {Object} payload - Control message payload.
   * @private
   */
  async forwardToLeader(mgService, payload, options = {}) {
    if (stryMutAct_9fa48("74634")) {
      {}
    } else {
      stryCov_9fa48("74634");
      const requiredTables = Array.isArray(options.requiredTables) ? stryMutAct_9fa48("74635") ? [] : (stryCov_9fa48("74635"), [...new Set(stryMutAct_9fa48("74636") ? options.requiredTables : (stryCov_9fa48("74636"), options.requiredTables.filter(stryMutAct_9fa48("74637") ? () => undefined : (stryCov_9fa48("74637"), tableName => stryMutAct_9fa48("74640") ? typeof tableName === TYPEOF.STRING || tableName.length > NUM.ZERO : stryMutAct_9fa48("74639") ? false : stryMutAct_9fa48("74638") ? true : (stryCov_9fa48("74638", "74639", "74640"), (stryMutAct_9fa48("74642") ? typeof tableName !== TYPEOF.STRING : stryMutAct_9fa48("74641") ? true : (stryCov_9fa48("74641", "74642"), typeof tableName === TYPEOF.STRING)) && (stryMutAct_9fa48("74645") ? tableName.length <= NUM.ZERO : stryMutAct_9fa48("74644") ? tableName.length >= NUM.ZERO : stryMutAct_9fa48("74643") ? true : (stryCov_9fa48("74643", "74644", "74645"), tableName.length > NUM.ZERO)))))))]) : stryMutAct_9fa48("74646") ? ["Stryker was here"] : (stryCov_9fa48("74646"), []);
      if (stryMutAct_9fa48("74650") ? requiredTables.length <= NUM.ZERO : stryMutAct_9fa48("74649") ? requiredTables.length >= NUM.ZERO : stryMutAct_9fa48("74648") ? false : stryMutAct_9fa48("74647") ? true : (stryCov_9fa48("74647", "74648", "74649", "74650"), requiredTables.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("74651")) {
          {}
        } else {
          stryCov_9fa48("74651");
          const readiness = stryMutAct_9fa48("74654") ? options.ingressReadiness && this.resolveMessageGroupIngressReadiness(mgService, requiredTables) : stryMutAct_9fa48("74653") ? false : stryMutAct_9fa48("74652") ? true : (stryCov_9fa48("74652", "74653", "74654"), options.ingressReadiness || this.resolveMessageGroupIngressReadiness(mgService, requiredTables));
          if (stryMutAct_9fa48("74657") ? typeof mgService?.forwardMetadataIngressPayloadToLeader === TYPEOF.FUNCTION : stryMutAct_9fa48("74656") ? false : stryMutAct_9fa48("74655") ? true : (stryCov_9fa48("74655", "74656", "74657"), typeof (stryMutAct_9fa48("74658") ? mgService.forwardMetadataIngressPayloadToLeader : (stryCov_9fa48("74658"), mgService?.forwardMetadataIngressPayloadToLeader)) !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("74659")) {
              {}
            } else {
              stryCov_9fa48("74659");
              throw this.buildIngressReadinessError(readiness, DISPATCH_ERROR_MSG.METADATA_FORWARD_PATH_UNAVAILABLE);
            }
          }
          await mgService.forwardMetadataIngressPayloadToLeader(payload, stryMutAct_9fa48("74660") ? {} : (stryCov_9fa48("74660"), {
            requiredTables,
            forwardedByNodeId: this.nodeId
          }));
          return;
        }
      }
      const leaderId = mgService.getLeaderId();
      if (stryMutAct_9fa48("74663") ? false : stryMutAct_9fa48("74662") ? true : stryMutAct_9fa48("74661") ? leaderId : (stryCov_9fa48("74661", "74662", "74663"), !leaderId)) {
        if (stryMutAct_9fa48("74664")) {
          {}
        } else {
          stryCov_9fa48("74664");
          const readiness = stryMutAct_9fa48("74667") ? options.ingressReadiness && this.resolveMessageGroupIngressReadiness(mgService, requiredTables) : stryMutAct_9fa48("74666") ? false : stryMutAct_9fa48("74665") ? true : (stryCov_9fa48("74665", "74666", "74667"), options.ingressReadiness || this.resolveMessageGroupIngressReadiness(mgService, requiredTables));
          throw this.buildIngressReadinessError(readiness, DISPATCH_READINESS_MESSAGE.CONTROL_PLANE_LEADER_NOT_READY);
        }
      }
      const forwardedBy = Array.isArray(payload[ControlPlaneField.FORWARDED_BY]) ? payload[ControlPlaneField.FORWARDED_BY] : payload[ControlPlaneField.FORWARDED_BY] ? stryMutAct_9fa48("74668") ? [] : (stryCov_9fa48("74668"), [payload[ControlPlaneField.FORWARDED_BY]]) : stryMutAct_9fa48("74669") ? ["Stryker was here"] : (stryCov_9fa48("74669"), []);
      if (stryMutAct_9fa48("74671") ? false : stryMutAct_9fa48("74670") ? true : (stryCov_9fa48("74670", "74671"), forwardedBy.includes(this.nodeId))) {
        if (stryMutAct_9fa48("74672")) {
          {}
        } else {
          stryCov_9fa48("74672");
          return;
        }
      }
      const leaderAddress = mgService.buildPeerAddress(leaderId);
      const forwardedPayload = stryMutAct_9fa48("74673") ? {} : (stryCov_9fa48("74673"), {
        ...payload,
        [ControlPlaneField.FORWARDED_BY]: stryMutAct_9fa48("74674") ? [] : (stryCov_9fa48("74674"), [...forwardedBy, this.nodeId])
      });
      await mgService.sendMessage(leaderAddress, forwardedPayload);
    }
  }

  /**
   * Build one ingress-readiness error.
   * @param {Object|null} readiness
   * @param {string} fallbackMessage
   * @return {Error}
   * @private
   */
  buildIngressReadinessError(readiness, fallbackMessage) {
    if (stryMutAct_9fa48("74675")) {
      {}
    } else {
      stryCov_9fa48("74675");
      const error = new Error(stryMutAct_9fa48("74678") ? readiness?.reason && fallbackMessage : stryMutAct_9fa48("74677") ? false : stryMutAct_9fa48("74676") ? true : (stryCov_9fa48("74676", "74677", "74678"), (stryMutAct_9fa48("74679") ? readiness.reason : (stryCov_9fa48("74679"), readiness?.reason)) || fallbackMessage));
      if (stryMutAct_9fa48("74682") ? Number.isFinite(readiness?.retryAfterMs) || readiness.retryAfterMs > NUM.ZERO : stryMutAct_9fa48("74681") ? false : stryMutAct_9fa48("74680") ? true : (stryCov_9fa48("74680", "74681", "74682"), Number.isFinite(stryMutAct_9fa48("74683") ? readiness.retryAfterMs : (stryCov_9fa48("74683"), readiness?.retryAfterMs)) && (stryMutAct_9fa48("74686") ? readiness.retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("74685") ? readiness.retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("74684") ? true : (stryCov_9fa48("74684", "74685", "74686"), readiness.retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("74687")) {
          {}
        } else {
          stryCov_9fa48("74687");
          error.deferRetry = stryMutAct_9fa48("74688") ? false : (stryCov_9fa48("74688"), true);
          error.retryAfterMs = readiness.retryAfterMs;
        }
      }
      return error;
    }
  }

  /**
   * Check if a payload is a control-plane message.
   * @param {Object} payload - Message payload.
   * @return {boolean} True if control-plane message.
   * @private
   */
  isControlMessage(payload) {
    if (stryMutAct_9fa48("74689")) {
      {}
    } else {
      stryCov_9fa48("74689");
      return Object.values(ControlPlaneMessageType).includes(stryMutAct_9fa48("74690") ? payload.type : (stryCov_9fa48("74690"), payload?.type));
    }
  }

  /**
   * Stop the dispatch service.
   */
  stop() {
    if (stryMutAct_9fa48("74691")) {
      {}
    } else {
      stryCov_9fa48("74691");
      if (stryMutAct_9fa48("74694") ? this.directDispatchServiceAddress && this.messageRouter || typeof this.messageRouter.unregister === TYPEOF.FUNCTION : stryMutAct_9fa48("74693") ? false : stryMutAct_9fa48("74692") ? true : (stryCov_9fa48("74692", "74693", "74694"), (stryMutAct_9fa48("74696") ? this.directDispatchServiceAddress || this.messageRouter : stryMutAct_9fa48("74695") ? true : (stryCov_9fa48("74695", "74696"), this.directDispatchServiceAddress && this.messageRouter)) && (stryMutAct_9fa48("74698") ? typeof this.messageRouter.unregister !== TYPEOF.FUNCTION : stryMutAct_9fa48("74697") ? true : (stryCov_9fa48("74697", "74698"), typeof this.messageRouter.unregister === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("74699")) {
          {}
        } else {
          stryCov_9fa48("74699");
          this.messageRouter.unregister(this.directDispatchServiceAddress);
        }
      }
      this.directDispatchServiceHandler = null;
      this.directDispatchServiceAddress = null;
      if (stryMutAct_9fa48("74702") ? this.coordinatorOperationCreatedListener && this.rebalanceCoordinator || typeof this.rebalanceCoordinator.off === TYPEOF.FUNCTION : stryMutAct_9fa48("74701") ? false : stryMutAct_9fa48("74700") ? true : (stryCov_9fa48("74700", "74701", "74702"), (stryMutAct_9fa48("74704") ? this.coordinatorOperationCreatedListener || this.rebalanceCoordinator : stryMutAct_9fa48("74703") ? true : (stryCov_9fa48("74703", "74704"), this.coordinatorOperationCreatedListener && this.rebalanceCoordinator)) && (stryMutAct_9fa48("74706") ? typeof this.rebalanceCoordinator.off !== TYPEOF.FUNCTION : stryMutAct_9fa48("74705") ? true : (stryCov_9fa48("74705", "74706"), typeof this.rebalanceCoordinator.off === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("74707")) {
          {}
        } else {
          stryCov_9fa48("74707");
          this.rebalanceCoordinator.off(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, this.coordinatorOperationCreatedListener);
        }
      }
      this.coordinatorOperationCreatedListener = null;
      if (stryMutAct_9fa48("74710") ? this.cacheChangeListener && this.systemTableCache || typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION : stryMutAct_9fa48("74709") ? false : stryMutAct_9fa48("74708") ? true : (stryCov_9fa48("74708", "74709", "74710"), (stryMutAct_9fa48("74712") ? this.cacheChangeListener || this.systemTableCache : stryMutAct_9fa48("74711") ? true : (stryCov_9fa48("74711", "74712"), this.cacheChangeListener && this.systemTableCache)) && (stryMutAct_9fa48("74714") ? typeof this.systemTableCache.offCacheChange !== TYPEOF.FUNCTION : stryMutAct_9fa48("74713") ? true : (stryCov_9fa48("74713", "74714"), typeof this.systemTableCache.offCacheChange === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("74715")) {
          {}
        } else {
          stryCov_9fa48("74715");
          this.systemTableCache.offCacheChange(this.cacheChangeListener);
        }
      }
      this.cacheChangeListener = null;
      for (const [mgService, handlers] of this.messageGroupHandlers) {
        if (stryMutAct_9fa48("74716")) {
          {}
        } else {
          stryCov_9fa48("74716");
          mgService.off(CONTROL_PLANE_EVENT.MESSAGE_RECEIVED, handlers.onMessageReceived);
          mgService.off(CONTROL_PLANE_EVENT.CDC_APPLIED, handlers.onCdcApplied);
        }
      }
      this.messageGroupHandlers.clear();
      this.messageGroupServices.clear();
      this.dispatchInFlight.clear();
      this.retryInFlightNodes.clear();
      this.nodeStateUpdateWatermarks.clear();
      this.nodeReadyRetryWatermarks.clear();
      for (const operationId of this.operationDispatchDeferredRetries.keys()) {
        if (stryMutAct_9fa48("74717")) {
          {}
        } else {
          stryCov_9fa48("74717");
          this.clearDeferredOperationDispatchRetry(operationId);
        }
      }
      for (const nodeId of this.nodeStateUpdateDeferredRetries.keys()) {
        if (stryMutAct_9fa48("74718")) {
          {}
        } else {
          stryCov_9fa48("74718");
          this.clearDeferredNodeStateUpdateRetry(nodeId);
        }
      }
      this.nodeStateUpdateQueueAssignments.clear();
      this.nextNodeStateUpdateQueueIndex = NUM.ZERO;
      if (stryMutAct_9fa48("74721") ? Array.isArray(this.operationDispatchQueues) || this.operationDispatchQueues.length > NUM.ZERO : stryMutAct_9fa48("74720") ? false : stryMutAct_9fa48("74719") ? true : (stryCov_9fa48("74719", "74720", "74721"), Array.isArray(this.operationDispatchQueues) && (stryMutAct_9fa48("74724") ? this.operationDispatchQueues.length <= NUM.ZERO : stryMutAct_9fa48("74723") ? this.operationDispatchQueues.length >= NUM.ZERO : stryMutAct_9fa48("74722") ? true : (stryCov_9fa48("74722", "74723", "74724"), this.operationDispatchQueues.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("74725")) {
          {}
        } else {
          stryCov_9fa48("74725");
          for (const operationDispatchQueue of this.operationDispatchQueues) {
            if (stryMutAct_9fa48("74726")) {
              {}
            } else {
              stryCov_9fa48("74726");
              operationDispatchQueue.shutdown();
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("74727")) {
          {}
        } else {
          stryCov_9fa48("74727");
          this.operationDispatchQueue.shutdown();
        }
      }
      for (const nodeStateUpdateQueue of this.nodeStateUpdateQueues) {
        if (stryMutAct_9fa48("74728")) {
          {}
        } else {
          stryCov_9fa48("74728");
          nodeStateUpdateQueue.shutdown();
        }
      }
      this.nodeReadyRetryQueue.shutdown();
      this.state = DISPATCH_STATE.STOPPED;
      this.logger.info(DISPATCH_LOG_MSG.STOPPED, stryMutAct_9fa48("74729") ? {} : (stryCov_9fa48("74729"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Get the current state.
   * @return {string} Current lifecycle state.
   */
  getState() {
    if (stryMutAct_9fa48("74730")) {
      {}
    } else {
      stryCov_9fa48("74730");
      return this.state;
    }
  }
}
export { ReplicaDispatchService };