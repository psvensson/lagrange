/**
 * ReplicaHandler - Handles replica operations on target node.
 *
 * Simplified from ReplicaLifecycleManager - only handles execution,
 * not tracking (that's the coordinator's job).
 *
 * Requirements: 10.2, 3.1
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
import fs from 'fs';
import path from 'path';
import { AddressManager } from '../address/address-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { STORAGE_DEFAULT } from '../storage/storage-constants.js';
import { NUM, WORKFLOW_STEP } from '../constants/index.js';
import { assertCritical } from '../utils/assert.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { PartitionServiceRowOwner } from '../partition/partition-service-row-owner.js';
import { createSystemMetadataGatewayRequiredError } from '../control-plane/system-metadata-access-error.js';
import { ReplicaStatus } from '../rebalancer/replica-status.js';
import { EXECUTOR_OUTCOME_TYPE } from '../rebalancer/executor-outcome-constants.js';
import { ReplicaOperationMessageType, ReplicaOperationField, ReplicaOperationResponseStatus } from '../rebalancer/replica-operation-constants.js';
import { REPLICA_HANDLER_ADDRESS, REPLICA_HANDLER_DEFAULT, REPLICA_HANDLER_ERROR_MSG, REPLICA_HANDLER_EVENT, REPLICA_HANDLER_LOG_MSG, REPLICA_HANDLER_NUM, REPLICA_HANDLER_PROGRESS, REPLICA_HANDLER_SERVICE, REPLICA_HANDLER_SUBSYSTEM, REPLICA_HANDLER_TYPEOF } from './replica-handler-constants.js';
import { PARTITION_SERVICE_INIT_STAGE } from '../partition/partition-service-constants.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { isNodeRecordReady } from './node-readiness-policy.js';
import { ReplicaCreationProgressReporter } from '../utils/replica-creation-progress-reporter.js';
import { ReplicaStateMachine } from './replica-state-machine.js';
const REPLICA_HANDLER_LITERAL = Object.freeze(stryMutAct_9fa48("93953") ? {} : (stryCov_9fa48("93953"), {
  READY_LEASE_EXPIRES_AT: stryMutAct_9fa48("93954") ? "" : (stryCov_9fa48("93954"), 'ready_lease_expires_at'),
  READYLEASEEXPIRESAT: stryMutAct_9fa48("93955") ? "" : (stryCov_9fa48("93955"), 'readyLeaseExpiresAt'),
  READYLEASEEXPIRESATMS: stryMutAct_9fa48("93956") ? "" : (stryCov_9fa48("93956"), 'readyLeaseExpiresAtMs'),
  READYLEASEEXPIRES: stryMutAct_9fa48("93957") ? "" : (stryCov_9fa48("93957"), 'readyLeaseExpires'),
  VALUE: stryMutAct_9fa48("93958") ? "Stryker was here!" : (stryCov_9fa48("93958"), ''),
  DURABLE_REMOVE_CLEANUP_COMPLETE: stryMutAct_9fa48("93959") ? "" : (stryCov_9fa48("93959"), 'durable_remove_cleanup_complete'),
  ADD: stryMutAct_9fa48("93960") ? "" : (stryCov_9fa48("93960"), 'ADD'),
  REPLICAHANDLER: stryMutAct_9fa48("93961") ? "" : (stryCov_9fa48("93961"), 'ReplicaHandler'),
  READ: stryMutAct_9fa48("93962") ? "" : (stryCov_9fa48("93962"), 'read'),
  SYSTEM_TABLE_QUERY_FAILED: stryMutAct_9fa48("93963") ? "" : (stryCov_9fa48("93963"), 'system table query failed')
}));
const CRITICAL_SYSTEM_PARTITION_IDS = new Set(Object.values(SYSTEM_TABLE_NAME).map(stryMutAct_9fa48("93964") ? () => undefined : (stryCov_9fa48("93964"), tableName => stryMutAct_9fa48("93965") ? `` : (stryCov_9fa48("93965"), `${tableName}-p1`))));
const VOTER_READY_CHECK_INTERVAL_MS = 250;
const METADATA_RESOLUTION_POLL_INTERVAL_MS = 50;
const partitionMetadataMissingError = REPLICA_HANDLER_ERROR_MSG.PARTITION_METADATA_MISSING;
const tableMetadataMissingError = REPLICA_HANDLER_ERROR_MSG.TABLE_METADATA_MISSING;
const PARTITION_METADATA_MISSING_PREFIX = partitionMetadataMissingError(stryMutAct_9fa48("93966") ? "Stryker was here!" : (stryCov_9fa48("93966"), ''));
const TABLE_METADATA_MISSING_PREFIX = tableMetadataMissingError(stryMutAct_9fa48("93967") ? "Stryker was here!" : (stryCov_9fa48("93967"), ''));
const ESTABLISHED_VOTER_ROLES = new Set(stryMutAct_9fa48("93968") ? [] : (stryCov_9fa48("93968"), [RAFT_ROLE.LEADER, RAFT_ROLE.FOLLOWER, RAFT_ROLE.CANDIDATE]));
const SYSTEM_TABLE_HYDRATION_SQL = Object.freeze(stryMutAct_9fa48("93969") ? {} : (stryCov_9fa48("93969"), {
  PARTITION_BY_ID: stryMutAct_9fa48("93970") ? `` : (stryCov_9fa48("93970"), `SELECT * FROM ${SYSTEM_TABLE_NAME.PARTITIONS} WHERE partition_id = ?`),
  TABLE_BY_ID: stryMutAct_9fa48("93971") ? `` : (stryCov_9fa48("93971"), `SELECT * FROM ${SYSTEM_TABLE_NAME.TABLES} WHERE table_id = ?`),
  PARTITION_SERVICES: (stryMutAct_9fa48("93972") ? `` : (stryCov_9fa48("93972"), `SELECT * FROM ${SYSTEM_TABLE_NAME.SERVICES} `)) + (stryMutAct_9fa48("93973") ? "" : (stryCov_9fa48("93973"), 'WHERE partition_id = ? AND service_type = ?'))
}));
function resolveSnapshotStateForTransition(existingStatus, localStatus, targetStatus) {
  if (stryMutAct_9fa48("93974")) {
    {}
  } else {
    stryCov_9fa48("93974");
    if (stryMutAct_9fa48("93976") ? false : stryMutAct_9fa48("93975") ? true : (stryCov_9fa48("93975", "93976"), existingStatus)) {
      if (stryMutAct_9fa48("93977")) {
        {}
      } else {
        stryCov_9fa48("93977");
        return existingStatus;
      }
    }
    if (stryMutAct_9fa48("93980") ? localStatus || localStatus !== targetStatus : stryMutAct_9fa48("93979") ? false : stryMutAct_9fa48("93978") ? true : (stryCov_9fa48("93978", "93979", "93980"), localStatus && (stryMutAct_9fa48("93982") ? localStatus === targetStatus : stryMutAct_9fa48("93981") ? true : (stryCov_9fa48("93981", "93982"), localStatus !== targetStatus)))) {
      if (stryMutAct_9fa48("93983")) {
        {}
      } else {
        stryCov_9fa48("93983");
        return localStatus;
      }
    }
    switch (targetStatus) {
      case ReplicaStatus.CREATING:
        if (stryMutAct_9fa48("93984")) {} else {
          stryCov_9fa48("93984");
          return ReplicaStatus.PENDING;
        }
      case ReplicaStatus.SYNCING:
        if (stryMutAct_9fa48("93985")) {} else {
          stryCov_9fa48("93985");
          return ReplicaStatus.CREATING;
        }
      case ReplicaStatus.ACTIVE:
        if (stryMutAct_9fa48("93986")) {} else {
          stryCov_9fa48("93986");
          return ReplicaStatus.SYNCING;
        }
      case ReplicaStatus.REMOVING:
        if (stryMutAct_9fa48("93987")) {} else {
          stryCov_9fa48("93987");
          return ReplicaStatus.ACTIVE;
        }
      case ReplicaStatus.REMOVED:
        if (stryMutAct_9fa48("93988")) {} else {
          stryCov_9fa48("93988");
          return ReplicaStatus.REMOVING;
        }
      default:
        if (stryMutAct_9fa48("93989")) {} else {
          stryCov_9fa48("93989");
          return stryMutAct_9fa48("93992") ? localStatus && ReplicaStatus.ACTIVE : stryMutAct_9fa48("93991") ? false : stryMutAct_9fa48("93990") ? true : (stryCov_9fa48("93990", "93991", "93992"), localStatus || ReplicaStatus.ACTIVE);
        }
    }
  }
}
function isFreshPartitionBootstrapWindow(partition) {
  if (stryMutAct_9fa48("93993")) {
    {}
  } else {
    stryCov_9fa48("93993");
    if (stryMutAct_9fa48("93996") ? !partition && partition.leader_node_id : stryMutAct_9fa48("93995") ? false : stryMutAct_9fa48("93994") ? true : (stryCov_9fa48("93994", "93995", "93996"), (stryMutAct_9fa48("93997") ? partition : (stryCov_9fa48("93997"), !partition)) || partition.leader_node_id)) {
      if (stryMutAct_9fa48("93998")) {
        {}
      } else {
        stryCov_9fa48("93998");
        return stryMutAct_9fa48("93999") ? true : (stryCov_9fa48("93999"), false);
      }
    }
    return stryMutAct_9fa48("94002") ? Number.isFinite(partition.created_at) && Number.isFinite(partition.updated_at) || partition.created_at === partition.updated_at : stryMutAct_9fa48("94001") ? false : stryMutAct_9fa48("94000") ? true : (stryCov_9fa48("94000", "94001", "94002"), (stryMutAct_9fa48("94004") ? Number.isFinite(partition.created_at) || Number.isFinite(partition.updated_at) : stryMutAct_9fa48("94003") ? true : (stryCov_9fa48("94003", "94004"), Number.isFinite(partition.created_at) && Number.isFinite(partition.updated_at))) && (stryMutAct_9fa48("94006") ? partition.created_at !== partition.updated_at : stryMutAct_9fa48("94005") ? true : (stryCov_9fa48("94005", "94006"), partition.created_at === partition.updated_at)));
  }
}
function hasExplicitReadyLeaseMetadata(nodeRow) {
  if (stryMutAct_9fa48("94007")) {
    {}
  } else {
    stryCov_9fa48("94007");
    return Boolean(stryMutAct_9fa48("94010") ? nodeRow && typeof nodeRow === REPLICA_HANDLER_TYPEOF.OBJECT || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READY_LEASE_EXPIRES_AT) || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESAT) || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESATMS) || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRES) : stryMutAct_9fa48("94009") ? false : stryMutAct_9fa48("94008") ? true : (stryCov_9fa48("94008", "94009", "94010"), (stryMutAct_9fa48("94012") ? nodeRow || typeof nodeRow === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94011") ? true : (stryCov_9fa48("94011", "94012"), nodeRow && (stryMutAct_9fa48("94014") ? typeof nodeRow !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94013") ? true : (stryCov_9fa48("94013", "94014"), typeof nodeRow === REPLICA_HANDLER_TYPEOF.OBJECT)))) && (stryMutAct_9fa48("94016") ? (Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READY_LEASE_EXPIRES_AT) || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESAT) || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESATMS)) && Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRES) : stryMutAct_9fa48("94015") ? true : (stryCov_9fa48("94015", "94016"), (stryMutAct_9fa48("94018") ? (Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READY_LEASE_EXPIRES_AT) || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESAT)) && Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESATMS) : stryMutAct_9fa48("94017") ? false : (stryCov_9fa48("94017", "94018"), (stryMutAct_9fa48("94020") ? Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READY_LEASE_EXPIRES_AT) && Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESAT) : stryMutAct_9fa48("94019") ? false : (stryCov_9fa48("94019", "94020"), Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READY_LEASE_EXPIRES_AT) || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESAT))) || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRESATMS))) || Object.prototype.hasOwnProperty.call(nodeRow, REPLICA_HANDLER_LITERAL.READYLEASEEXPIRES)))));
  }
}
function isReplicaJoinNodeViable(nodeRow, options = {}) {
  if (stryMutAct_9fa48("94021")) {
    {}
  } else {
    stryCov_9fa48("94021");
    if (stryMutAct_9fa48("94024") ? false : stryMutAct_9fa48("94023") ? true : stryMutAct_9fa48("94022") ? nodeRow : (stryCov_9fa48("94022", "94023", "94024"), !nodeRow)) {
      if (stryMutAct_9fa48("94025")) {
        {}
      } else {
        stryCov_9fa48("94025");
        return stryMutAct_9fa48("94026") ? false : (stryCov_9fa48("94026"), true);
      }
    }
    if (stryMutAct_9fa48("94029") ? nodeRow.status === ReplicaStatus.ACTIVE : stryMutAct_9fa48("94028") ? false : stryMutAct_9fa48("94027") ? true : (stryCov_9fa48("94027", "94028", "94029"), nodeRow.status !== ReplicaStatus.ACTIVE)) {
      if (stryMutAct_9fa48("94030")) {
        {}
      } else {
        stryCov_9fa48("94030");
        return stryMutAct_9fa48("94031") ? true : (stryCov_9fa48("94031"), false);
      }
    }
    if (stryMutAct_9fa48("94034") ? false : stryMutAct_9fa48("94033") ? true : stryMutAct_9fa48("94032") ? hasExplicitReadyLeaseMetadata(nodeRow) : (stryCov_9fa48("94032", "94033", "94034"), !hasExplicitReadyLeaseMetadata(nodeRow))) {
      if (stryMutAct_9fa48("94035")) {
        {}
      } else {
        stryCov_9fa48("94035");
        return stryMutAct_9fa48("94036") ? false : (stryCov_9fa48("94036"), true);
      }
    }
    return isNodeRecordReady(nodeRow, stryMutAct_9fa48("94037") ? {} : (stryCov_9fa48("94037"), {
      now: options.now,
      requireActiveStatus: stryMutAct_9fa48("94038") ? false : (stryCov_9fa48("94038"), true)
    }));
  }
} /**
  * ReplicaHandler handles replica creation and removal requests on target nodes.
  * Returns immediately with status, then performs async work.
  */
class ReplicaHandler extends EventEmitter {
  /**
  * Create a new ReplicaHandler.
  * @param {Object} options - Configuration options.
  * @param {string} options.nodeId - Node ID hosting this handler.
  * @param {Object} options.systemTableCache - Read-only system table cache.
  * @param {Object} options.cdcIntegrationService - CDC integration service.
  * @param {Object} options.rpcClient - RPC client for responses.
  * @param {Function} options.createPartitionService - Factory for creating partitions.
  * @param {string} options.dataDir - Base data directory for partition storage.
  * @param {Object} [options.replicaStateMachine] - Replica lifecycle state machine.
  */
  constructor(options = {}) {
    if (stryMutAct_9fa48("94039")) {
      {}
    } else {
      stryCov_9fa48("94039");
      super();
      this.nodeId = stryMutAct_9fa48("94042") ? options.nodeId && REPLICA_HANDLER_DEFAULT.NODE_ID : stryMutAct_9fa48("94041") ? false : stryMutAct_9fa48("94040") ? true : (stryCov_9fa48("94040", "94041", "94042"), options.nodeId || REPLICA_HANDLER_DEFAULT.NODE_ID);
      this.systemTableCache = stryMutAct_9fa48("94045") ? options.systemTableCache && null : stryMutAct_9fa48("94044") ? false : stryMutAct_9fa48("94043") ? true : (stryCov_9fa48("94043", "94044", "94045"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("94048") ? options.cdcIntegrationService && null : stryMutAct_9fa48("94047") ? false : stryMutAct_9fa48("94046") ? true : (stryCov_9fa48("94046", "94047", "94048"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("94051") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("94050") ? false : stryMutAct_9fa48("94049") ? true : (stryCov_9fa48("94049", "94050", "94051"), options.controlPlaneSystemTableGateway || null);
      this.partitionServiceRowOwner = null;
      this.rpcClient = stryMutAct_9fa48("94054") ? options.rpcClient && null : stryMutAct_9fa48("94053") ? false : stryMutAct_9fa48("94052") ? true : (stryCov_9fa48("94052", "94053", "94054"), options.rpcClient || null);
      this.createPartitionService = stryMutAct_9fa48("94057") ? options.createPartitionService && null : stryMutAct_9fa48("94056") ? false : stryMutAct_9fa48("94055") ? true : (stryCov_9fa48("94055", "94056", "94057"), options.createPartitionService || null);
      this.dataDir = stryMutAct_9fa48("94060") ? options.dataDir && REPLICA_HANDLER_DEFAULT.DATA_DIR : stryMutAct_9fa48("94059") ? false : stryMutAct_9fa48("94058") ? true : (stryCov_9fa48("94058", "94059", "94060"), options.dataDir || REPLICA_HANDLER_DEFAULT.DATA_DIR);
      assertCritical(this.systemTableCache, REPLICA_HANDLER_ERROR_MSG.CACHE_NOT_AVAILABLE);
      assertCritical(stryMutAct_9fa48("94063") ? typeof this.systemTableCache.filter !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94062") ? false : stryMutAct_9fa48("94061") ? true : (stryCov_9fa48("94061", "94062", "94063"), typeof this.systemTableCache.filter === REPLICA_HANDLER_TYPEOF.FUNCTION), REPLICA_HANDLER_ERROR_MSG.CACHE_MISSING_FILTER);
      assertCritical(this.cdcIntegrationService, REPLICA_HANDLER_ERROR_MSG.CDC_REQUIRED);
      assertCritical(this.createPartitionService, REPLICA_HANDLER_ERROR_MSG.CREATE_PARTITION_SERVICE_REQUIRED);
      this.replicaStateMachine = stryMutAct_9fa48("94066") ? options.replicaStateMachine && new ReplicaStateMachine({
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway
      }) : stryMutAct_9fa48("94065") ? false : stryMutAct_9fa48("94064") ? true : (stryCov_9fa48("94064", "94065", "94066"), options.replicaStateMachine || new ReplicaStateMachine(stryMutAct_9fa48("94067") ? {} : (stryCov_9fa48("94067"), {
        nodeId: this.nodeId,
        cdcIntegrationService: this.cdcIntegrationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway
      }))); // Track live service references by replica_id (needed for shutdown, voter-readiness)
      this.localServices = new Map(); // Backward-compatible replica metadata map used by lifecycle tests.
      this.localReplicas = new Map(); // Track in-progress operations by operationId
      this.inProgressOperations = new Map();
      this.operationTasks = new Set();
      this.shuttingDown = stryMutAct_9fa48("94068") ? true : (stryCov_9fa48("94068"), false);
      this.shutdownPromise = null;
      this.hydratedMetadataByPartitionId = new Map(); // Executor outcome emitter — replaces direct replica_operations writes.
      // The coordinator subscribes to outcomes via this emitter (Task 3.2).
      this.executorOutcomeEmitter = stryMutAct_9fa48("94071") ? options.executorOutcomeEmitter && null : stryMutAct_9fa48("94070") ? false : stryMutAct_9fa48("94069") ? true : (stryCov_9fa48("94069", "94070", "94071"), options.executorOutcomeEmitter || null); // Configuration
      const config = ConfigurationManager.getInstance();
      this.syncTimeoutMs = stryMutAct_9fa48("94074") ? config.get(CONFIG_KEY.REPLICA_HANDLER_SYNC_TIMEOUT_MS) && REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS : stryMutAct_9fa48("94073") ? false : stryMutAct_9fa48("94072") ? true : (stryCov_9fa48("94072", "94073", "94074"), config.get(CONFIG_KEY.REPLICA_HANDLER_SYNC_TIMEOUT_MS) || REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS); // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(REPLICA_HANDLER_SUBSYSTEM) : console; // One-line staged progress reporting for dynamic replica creation.
      this.creationProgressReporter = new ReplicaCreationProgressReporter(stryMutAct_9fa48("94075") ? {} : (stryCov_9fa48("94075"), {
        logger: this.logger,
        formatLine: stryMutAct_9fa48("94076") ? () => undefined : (stryCov_9fa48("94076"), (progress, status, error) => this.formatReplicaCreationProgressLine(progress, status, error)),
        buildContext: stryMutAct_9fa48("94077") ? () => undefined : (stryCov_9fa48("94077"), (progress, status, error) => this.buildReplicaCreationProgressContext(progress, status, error))
      }));
      this.creationProgressByReplica = new Map();
      this.initialized = stryMutAct_9fa48("94078") ? true : (stryCov_9fa48("94078"), false);
    }
  } /**
    * Initialize the replica handler.
    */
  initialize() {
    if (stryMutAct_9fa48("94079")) {
      {}
    } else {
      stryCov_9fa48("94079");
      if (stryMutAct_9fa48("94081") ? false : stryMutAct_9fa48("94080") ? true : (stryCov_9fa48("94080", "94081"), this.initialized)) {
        if (stryMutAct_9fa48("94082")) {
          {}
        } else {
          stryCov_9fa48("94082");
          return;
        }
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.INITIALIZING, stryMutAct_9fa48("94083") ? {} : (stryCov_9fa48("94083"), {
        nodeId: this.nodeId,
        dataDir: this.dataDir
      }));
      this.initialized = stryMutAct_9fa48("94084") ? false : (stryCov_9fa48("94084"), true);
    }
  } /**
    * Start staged one-line progress reporting for replica creation.
    * @param {Object} details - Initial progress details.
    * @return {Object} Progress context.
    * @private
    */
  startReplicaCreationProgress(details) {
    if (stryMutAct_9fa48("94085")) {
      {}
    } else {
      stryCov_9fa48("94085");
      const progress = this.creationProgressReporter.start(stryMutAct_9fa48("94086") ? {} : (stryCov_9fa48("94086"), {
        ...details,
        stage: PARTITION_SERVICE_INIT_STAGE.STARTING,
        peerTotal: stryMutAct_9fa48("94087") ? Math.min(NUM.ZERO, details.peerTotal || NUM.ZERO) : (stryCov_9fa48("94087"), Math.max(NUM.ZERO, stryMutAct_9fa48("94090") ? details.peerTotal && NUM.ZERO : stryMutAct_9fa48("94089") ? false : stryMutAct_9fa48("94088") ? true : (stryCov_9fa48("94088", "94089", "94090"), details.peerTotal || NUM.ZERO))),
        peerJoined: NUM.ZERO
      }));
      if (stryMutAct_9fa48("94093") ? progress || progress.replicaId : stryMutAct_9fa48("94092") ? false : stryMutAct_9fa48("94091") ? true : (stryCov_9fa48("94091", "94092", "94093"), progress && progress.replicaId)) {
        if (stryMutAct_9fa48("94094")) {
          {}
        } else {
          stryCov_9fa48("94094");
          this.creationProgressByReplica.set(progress.replicaId, progress);
        }
      }
      return progress;
    }
  } /**
    * Update replica creation progress with stage callback data.
    * @param {Object|null} progress - Progress context.
    * @param {Object} stageEvent - Stage event payload.
    * @private
    */
  updateReplicaCreationProgress(progress, stageEvent) {
    if (stryMutAct_9fa48("94095")) {
      {}
    } else {
      stryCov_9fa48("94095");
      if (stryMutAct_9fa48("94098") ? !progress && !stageEvent : stryMutAct_9fa48("94097") ? false : stryMutAct_9fa48("94096") ? true : (stryCov_9fa48("94096", "94097", "94098"), (stryMutAct_9fa48("94099") ? progress : (stryCov_9fa48("94099"), !progress)) || (stryMutAct_9fa48("94100") ? stageEvent : (stryCov_9fa48("94100"), !stageEvent)))) {
        if (stryMutAct_9fa48("94101")) {
          {}
        } else {
          stryCov_9fa48("94101");
          return;
        }
      }
      const update = {};
      if (stryMutAct_9fa48("94103") ? false : stryMutAct_9fa48("94102") ? true : (stryCov_9fa48("94102", "94103"), stageEvent.stage)) {
        if (stryMutAct_9fa48("94104")) {
          {}
        } else {
          stryCov_9fa48("94104");
          update.stage = stageEvent.stage;
        }
      }
      if (stryMutAct_9fa48("94106") ? false : stryMutAct_9fa48("94105") ? true : (stryCov_9fa48("94105", "94106"), Number.isFinite(stageEvent.peerTotal))) {
        if (stryMutAct_9fa48("94107")) {
          {}
        } else {
          stryCov_9fa48("94107");
          update.peerTotal = stryMutAct_9fa48("94108") ? Math.min(NUM.ZERO, stageEvent.peerTotal) : (stryCov_9fa48("94108"), Math.max(NUM.ZERO, stageEvent.peerTotal));
        }
      }
      if (stryMutAct_9fa48("94110") ? false : stryMutAct_9fa48("94109") ? true : (stryCov_9fa48("94109", "94110"), Number.isFinite(stageEvent.peerJoined))) {
        if (stryMutAct_9fa48("94111")) {
          {}
        } else {
          stryCov_9fa48("94111");
          update.peerJoined = stryMutAct_9fa48("94112") ? Math.min(NUM.ZERO, stageEvent.peerJoined) : (stryCov_9fa48("94112"), Math.max(NUM.ZERO, stageEvent.peerJoined));
        }
      }
      if (stryMutAct_9fa48("94114") ? false : stryMutAct_9fa48("94113") ? true : (stryCov_9fa48("94113", "94114"), stageEvent.peerId)) {
        if (stryMutAct_9fa48("94115")) {
          {}
        } else {
          stryCov_9fa48("94115");
          update.peerId = stageEvent.peerId;
        }
      }
      if (stryMutAct_9fa48("94117") ? false : stryMutAct_9fa48("94116") ? true : (stryCov_9fa48("94116", "94117"), stageEvent.partitionId)) {
        if (stryMutAct_9fa48("94118")) {
          {}
        } else {
          stryCov_9fa48("94118");
          update.partitionId = stageEvent.partitionId;
        }
      }
      this.creationProgressReporter.update(progress, update);
    }
  } /**
    * Complete replica creation progress reporting.
    * @param {Object|null} progress - Progress context.
    * @param {string} finalStage - Final stage label.
    * @private
    */
  finishReplicaCreationProgress(progress, finalStage = ReplicaStatus.ACTIVE) {
    if (stryMutAct_9fa48("94119")) {
      {}
    } else {
      stryCov_9fa48("94119");
      this.creationProgressReporter.finish(progress, stryMutAct_9fa48("94120") ? {} : (stryCov_9fa48("94120"), {
        stage: finalStage
      }));
      this.clearReplicaCreationProgress(progress);
    }
  } /**
    * Fail replica creation progress reporting.
    * @param {Object|null} progress - Progress context.
    * @param {Error|string|null} error - Failure reason.
    * @param {string} finalStage - Final stage label.
    * @private
    */
  failReplicaCreationProgress(progress, error, finalStage = ReplicaStatus.FAILED) {
    if (stryMutAct_9fa48("94121")) {
      {}
    } else {
      stryCov_9fa48("94121");
      this.creationProgressReporter.fail(progress, error, stryMutAct_9fa48("94122") ? {} : (stryCov_9fa48("94122"), {
        stage: finalStage
      }));
      this.clearReplicaCreationProgress(progress);
    }
  } /**
    * Remove progress context tracking for a replica.
    * @param {Object|null} progress - Progress context.
    * @private
    */
  clearReplicaCreationProgress(progress) {
    if (stryMutAct_9fa48("94123")) {
      {}
    } else {
      stryCov_9fa48("94123");
      if (stryMutAct_9fa48("94126") ? progress || progress.replicaId : stryMutAct_9fa48("94125") ? false : stryMutAct_9fa48("94124") ? true : (stryCov_9fa48("94124", "94125", "94126"), progress && progress.replicaId)) {
        if (stryMutAct_9fa48("94127")) {
          {}
        } else {
          stryCov_9fa48("94127");
          this.creationProgressByReplica.delete(progress.replicaId);
        }
      }
    }
  } /**
    * Track one detached async replica operation so shutdown can await it.
    * @param {Promise<*>} taskPromise
    * @return {Promise<*>}
    * @private
    */
  registerOperationTask(taskPromise) {
    if (stryMutAct_9fa48("94128")) {
      {}
    } else {
      stryCov_9fa48("94128");
      let trackedTask = null;
      trackedTask = Promise.resolve(taskPromise).finally(() => {
        if (stryMutAct_9fa48("94129")) {
          {}
        } else {
          stryCov_9fa48("94129");
          this.operationTasks.delete(trackedTask);
        }
      });
      this.operationTasks.add(trackedTask);
      return trackedTask;
    }
  } /**
    * Throw when the replica handler is shutting down.
    * @return {void}
    * @private
    */
  throwIfShuttingDown() {
    if (stryMutAct_9fa48("94130")) {
      {}
    } else {
      stryCov_9fa48("94130");
      if (stryMutAct_9fa48("94132") ? false : stryMutAct_9fa48("94131") ? true : (stryCov_9fa48("94131", "94132"), this.shuttingDown)) {
        if (stryMutAct_9fa48("94133")) {
          {}
        } else {
          stryCov_9fa48("94133");
          throw new Error(REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN);
        }
      }
    }
  } /**
    * Format staged replica creation progress line.
    * @param {Object} progress - Progress context.
    * @param {string|null} status - Optional terminal status.
    * @param {Error|string|null} error - Optional error.
    * @return {string} Formatted line.
    * @private
    */
  formatReplicaCreationProgressLine(progress, status, error) {
    if (stryMutAct_9fa48("94134")) {
      {}
    } else {
      stryCov_9fa48("94134");
      const spinner = stryMutAct_9fa48("94137") ? progress.spinnerFrame && REPLICA_HANDLER_PROGRESS.SPINNER_IDLE : stryMutAct_9fa48("94136") ? false : stryMutAct_9fa48("94135") ? true : (stryCov_9fa48("94135", "94136", "94137"), progress.spinnerFrame || REPLICA_HANDLER_PROGRESS.SPINNER_IDLE);
      const peerTotal = Number.isFinite(progress.peerTotal) ? progress.peerTotal : NUM.ZERO;
      const peerJoined = Number.isFinite(progress.peerJoined) ? progress.peerJoined : NUM.ZERO;
      const countPendingReplica = stryMutAct_9fa48("94140") ? !status || !this.localServices.has(progress.replicaId) : stryMutAct_9fa48("94139") ? false : stryMutAct_9fa48("94138") ? true : (stryCov_9fa48("94138", "94139", "94140"), (stryMutAct_9fa48("94141") ? status : (stryCov_9fa48("94141"), !status)) && (stryMutAct_9fa48("94142") ? this.localServices.has(progress.replicaId) : (stryCov_9fa48("94142"), !this.localServices.has(progress.replicaId))));
      const localReplicas = stryMutAct_9fa48("94143") ? this.localServices.size - (countPendingReplica ? NUM.ONE : NUM.ZERO) : (stryCov_9fa48("94143"), this.localServices.size + (countPendingReplica ? NUM.ONE : NUM.ZERO));
      const statusText = status ? stryMutAct_9fa48("94144") ? `` : (stryCov_9fa48("94144"), ` status=${status}`) : stryMutAct_9fa48("94145") ? "Stryker was here!" : (stryCov_9fa48("94145"), '');
      const errorText = error ? stryMutAct_9fa48("94146") ? `` : (stryCov_9fa48("94146"), ` error=${this.formatReplicaCreationError(error)}`) : stryMutAct_9fa48("94147") ? "Stryker was here!" : (stryCov_9fa48("94147"), '');
      return (stryMutAct_9fa48("94148") ? `` : (stryCov_9fa48("94148"), `${REPLICA_HANDLER_PROGRESS.PREFIX} ${spinner} `)) + (stryMutAct_9fa48("94149") ? `` : (stryCov_9fa48("94149"), `service=${progress.partitionId} replica=${progress.replicaId} `)) + (stryMutAct_9fa48("94150") ? `` : (stryCov_9fa48("94150"), `type=${REPLICA_HANDLER_SERVICE.TYPE} stage=${progress.stage} `)) + (stryMutAct_9fa48("94151") ? `` : (stryCov_9fa48("94151"), `peers=${peerJoined}/${peerTotal} local_replicas=${localReplicas}`)) + (stryMutAct_9fa48("94152") ? `` : (stryCov_9fa48("94152"), `${statusText}${errorText}`));
    }
  } /**
    * Build structured fallback context for progress logs.
    * @param {Object} progress - Progress context.
    * @param {string|null} status - Optional terminal status.
    * @param {Error|string|null} error - Optional error.
    * @return {Object} Structured context.
    * @private
    */
  buildReplicaCreationProgressContext(progress, status = null, error = null) {
    if (stryMutAct_9fa48("94153")) {
      {}
    } else {
      stryCov_9fa48("94153");
      const context = stryMutAct_9fa48("94154") ? {} : (stryCov_9fa48("94154"), {
        nodeId: this.nodeId,
        partitionId: progress.partitionId,
        replicaId: progress.replicaId,
        stage: progress.stage,
        peerTotal: progress.peerTotal,
        peerJoined: progress.peerJoined,
        localReplicas: this.localServices.size
      });
      if (stryMutAct_9fa48("94156") ? false : stryMutAct_9fa48("94155") ? true : (stryCov_9fa48("94155", "94156"), status)) {
        if (stryMutAct_9fa48("94157")) {
          {}
        } else {
          stryCov_9fa48("94157");
          context.status = status;
        }
      }
      if (stryMutAct_9fa48("94159") ? false : stryMutAct_9fa48("94158") ? true : (stryCov_9fa48("94158", "94159"), error)) {
        if (stryMutAct_9fa48("94160")) {
          {}
        } else {
          stryCov_9fa48("94160");
          context.error = this.formatReplicaCreationError(error);
        }
      }
      return context;
    }
  } /**
    * Normalize error values for progress output.
    * @param {Error|string|null} error - Error value.
    * @return {string} Error message.
    * @private
    */
  formatReplicaCreationError(error) {
    if (stryMutAct_9fa48("94161")) {
      {}
    } else {
      stryCov_9fa48("94161");
      if (stryMutAct_9fa48("94164") ? false : stryMutAct_9fa48("94163") ? true : stryMutAct_9fa48("94162") ? error : (stryCov_9fa48("94162", "94163", "94164"), !error)) {
        if (stryMutAct_9fa48("94165")) {
          {}
        } else {
          stryCov_9fa48("94165");
          return REPLICA_HANDLER_LITERAL.VALUE;
        }
      }
      return (stryMutAct_9fa48("94168") ? typeof error !== TYPEOF.STRING : stryMutAct_9fa48("94167") ? false : stryMutAct_9fa48("94166") ? true : (stryCov_9fa48("94166", "94167", "94168"), typeof error === TYPEOF.STRING)) ? error : error.message;
    }
  }
  buildReplicaOperationResponse(status, fields = {}) {
    if (stryMutAct_9fa48("94169")) {
      {}
    } else {
      stryCov_9fa48("94169");
      return stryMutAct_9fa48("94170") ? {} : (stryCov_9fa48("94170"), {
        status,
        ...fields
      });
    }
  } /**
    * Handle incoming message (called by message router).
    * @param {Object} envelope - Message envelope.
    * @return {Promise<Object>} Response.
    */
  async handleMessage(envelope) {
    if (stryMutAct_9fa48("94171")) {
      {}
    } else {
      stryCov_9fa48("94171");
      const {
        payload,
        correlationId
      } = envelope;
      const type = stryMutAct_9fa48("94172") ? payload[ReplicaOperationField.TYPE] : (stryCov_9fa48("94172"), payload?.[ReplicaOperationField.TYPE]);
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.MESSAGE_RECEIVED, stryMutAct_9fa48("94173") ? {} : (stryCov_9fa48("94173"), {
        type,
        correlationId,
        operationId: stryMutAct_9fa48("94174") ? payload.operationId : (stryCov_9fa48("94174"), payload?.operationId)
      }));
      let response;
      if (stryMutAct_9fa48("94177") ? type !== ReplicaOperationMessageType.CREATE_REPLICA : stryMutAct_9fa48("94176") ? false : stryMutAct_9fa48("94175") ? true : (stryCov_9fa48("94175", "94176", "94177"), type === ReplicaOperationMessageType.CREATE_REPLICA)) {
        if (stryMutAct_9fa48("94178")) {
          {}
        } else {
          stryCov_9fa48("94178");
          response = await this.handleCreateReplica(payload);
        }
      } else if (stryMutAct_9fa48("94181") ? type !== ReplicaOperationMessageType.REMOVE_REPLICA : stryMutAct_9fa48("94180") ? false : stryMutAct_9fa48("94179") ? true : (stryCov_9fa48("94179", "94180", "94181"), type === ReplicaOperationMessageType.REMOVE_REPLICA)) {
        if (stryMutAct_9fa48("94182")) {
          {}
        } else {
          stryCov_9fa48("94182");
          response = await this.handleRemoveReplica(payload);
        }
      } else {
        if (stryMutAct_9fa48("94183")) {
          {}
        } else {
          stryCov_9fa48("94183");
          const unknownMessageType = REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE;
          response = this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("94184") ? {} : (stryCov_9fa48("94184"), {
            error: unknownMessageType(type)
          }));
        }
      } // Include correlationId in response for RPC matching
      return stryMutAct_9fa48("94185") ? {} : (stryCov_9fa48("94185"), {
        ...response,
        correlationId
      });
    }
  } /**
    * Handle CREATE_REPLICA request.
    * Returns immediately with 'initiated', then does async work.
    * Implements idempotency per Requirements 10.2.
    * @param {Object} request - CREATE_REPLICA request.
    * @return {Promise<Object>} Response.
    */
  async handleCreateReplica(request) {
    if (stryMutAct_9fa48("94186")) {
      {}
    } else {
      stryCov_9fa48("94186");
      const operationId = stryMutAct_9fa48("94187") ? request[ReplicaOperationField.OPERATION_ID] : (stryCov_9fa48("94187"), request?.[ReplicaOperationField.OPERATION_ID]);
      const partitionId = stryMutAct_9fa48("94188") ? request[ReplicaOperationField.PARTITION_ID] : (stryCov_9fa48("94188"), request?.[ReplicaOperationField.PARTITION_ID]);
      const replicaId = stryMutAct_9fa48("94189") ? request[ReplicaOperationField.REPLICA_ID] : (stryCov_9fa48("94189"), request?.[ReplicaOperationField.REPLICA_ID]);
      const bootstrapReplicaIds = Array.isArray(stryMutAct_9fa48("94190") ? request[ReplicaOperationField.REPLICA_IDS] : (stryCov_9fa48("94190"), request?.[ReplicaOperationField.REPLICA_IDS])) ? request[ReplicaOperationField.REPLICA_IDS] : stryMutAct_9fa48("94191") ? ["Stryker was here"] : (stryCov_9fa48("94191"), []);
      const bootstrapPeerAddresses = Array.isArray(stryMutAct_9fa48("94192") ? request[ReplicaOperationField.PEER_ADDRESSES] : (stryCov_9fa48("94192"), request?.[ReplicaOperationField.PEER_ADDRESSES])) ? request[ReplicaOperationField.PEER_ADDRESSES] : stryMutAct_9fa48("94193") ? ["Stryker was here"] : (stryCov_9fa48("94193"), []);
      const bootstrapTableMetadata = (stryMutAct_9fa48("94196") ? request?.[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] || typeof request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94195") ? false : stryMutAct_9fa48("94194") ? true : (stryCov_9fa48("94194", "94195", "94196"), (stryMutAct_9fa48("94197") ? request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] : (stryCov_9fa48("94197"), request?.[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA])) && (stryMutAct_9fa48("94199") ? typeof request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94198") ? true : (stryCov_9fa48("94198", "94199"), typeof request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] === REPLICA_HANDLER_TYPEOF.OBJECT)))) ? request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] : null;
      const bootstrapPartitionMetadata = (stryMutAct_9fa48("94202") ? request?.[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] || typeof request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94201") ? false : stryMutAct_9fa48("94200") ? true : (stryCov_9fa48("94200", "94201", "94202"), (stryMutAct_9fa48("94203") ? request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] : (stryCov_9fa48("94203"), request?.[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA])) && (stryMutAct_9fa48("94205") ? typeof request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94204") ? true : (stryCov_9fa48("94204", "94205"), typeof request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] === REPLICA_HANDLER_TYPEOF.OBJECT)))) ? request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] : null;
      const tableName = stryMutAct_9fa48("94208") ? request?.tableName && null : stryMutAct_9fa48("94207") ? false : stryMutAct_9fa48("94206") ? true : (stryCov_9fa48("94206", "94207", "94208"), (stryMutAct_9fa48("94209") ? request.tableName : (stryCov_9fa48("94209"), request?.tableName)) || null);
      this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_REQUEST, stryMutAct_9fa48("94210") ? {} : (stryCov_9fa48("94210"), {
        operationId,
        partitionId,
        replicaId,
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("94213") ? (!operationId || !partitionId) && !replicaId : stryMutAct_9fa48("94212") ? false : stryMutAct_9fa48("94211") ? true : (stryCov_9fa48("94211", "94212", "94213"), (stryMutAct_9fa48("94215") ? !operationId && !partitionId : stryMutAct_9fa48("94214") ? false : (stryCov_9fa48("94214", "94215"), (stryMutAct_9fa48("94216") ? operationId : (stryCov_9fa48("94216"), !operationId)) || (stryMutAct_9fa48("94217") ? partitionId : (stryCov_9fa48("94217"), !partitionId)))) || (stryMutAct_9fa48("94218") ? replicaId : (stryCov_9fa48("94218"), !replicaId)))) {
        if (stryMutAct_9fa48("94219")) {
          {}
        } else {
          stryCov_9fa48("94219");
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_MISSING_FIELDS, stryMutAct_9fa48("94220") ? {} : (stryCov_9fa48("94220"), {
            operationId,
            partitionId,
            replicaId,
            nodeId: this.nodeId
          }));
          return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("94221") ? {} : (stryCov_9fa48("94221"), {
            error: REPLICA_HANDLER_ERROR_MSG.CREATE_REQUIRED_FIELDS,
            nodeId: this.nodeId
          }));
        }
      } // Check idempotency - existing replica
      const existingReplica = this.getLocalReplica(replicaId);
      if (stryMutAct_9fa48("94223") ? false : stryMutAct_9fa48("94222") ? true : (stryCov_9fa48("94222", "94223"), existingReplica)) {
        if (stryMutAct_9fa48("94224")) {
          {}
        } else {
          stryCov_9fa48("94224");
          if (stryMutAct_9fa48("94227") ? existingReplica.status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("94226") ? false : stryMutAct_9fa48("94225") ? true : (stryCov_9fa48("94225", "94226", "94227"), existingReplica.status === ReplicaStatus.ACTIVE)) {
            if (stryMutAct_9fa48("94228")) {
              {}
            } else {
              stryCov_9fa48("94228");
              this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_ALREADY_ACTIVE, stryMutAct_9fa48("94229") ? {} : (stryCov_9fa48("94229"), {
                replicaId: existingReplica.replicaId,
                nodeId: this.nodeId
              }));
              return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.ALREADY_EXISTS, stryMutAct_9fa48("94230") ? {} : (stryCov_9fa48("94230"), {
                replicaId: existingReplica.replicaId,
                nodeId: this.nodeId
              }));
            }
          }
          if (stryMutAct_9fa48("94233") ? (existingReplica.status === ReplicaStatus.PENDING || existingReplica.status === ReplicaStatus.CREATING) && existingReplica.status === ReplicaStatus.SYNCING : stryMutAct_9fa48("94232") ? false : stryMutAct_9fa48("94231") ? true : (stryCov_9fa48("94231", "94232", "94233"), (stryMutAct_9fa48("94235") ? existingReplica.status === ReplicaStatus.PENDING && existingReplica.status === ReplicaStatus.CREATING : stryMutAct_9fa48("94234") ? false : (stryCov_9fa48("94234", "94235"), (stryMutAct_9fa48("94237") ? existingReplica.status !== ReplicaStatus.PENDING : stryMutAct_9fa48("94236") ? false : (stryCov_9fa48("94236", "94237"), existingReplica.status === ReplicaStatus.PENDING)) || (stryMutAct_9fa48("94239") ? existingReplica.status !== ReplicaStatus.CREATING : stryMutAct_9fa48("94238") ? false : (stryCov_9fa48("94238", "94239"), existingReplica.status === ReplicaStatus.CREATING)))) || (stryMutAct_9fa48("94241") ? existingReplica.status !== ReplicaStatus.SYNCING : stryMutAct_9fa48("94240") ? false : (stryCov_9fa48("94240", "94241"), existingReplica.status === ReplicaStatus.SYNCING)))) {
            if (stryMutAct_9fa48("94242")) {
              {}
            } else {
              stryCov_9fa48("94242");
              this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_IN_PROGRESS, stryMutAct_9fa48("94243") ? {} : (stryCov_9fa48("94243"), {
                replicaId: existingReplica.replicaId,
                status: existingReplica.status,
                nodeId: this.nodeId
              }));
              return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("94244") ? {} : (stryCov_9fa48("94244"), {
                replicaId: existingReplica.replicaId,
                nodeId: this.nodeId
              }));
            }
          }
        }
      } // Check idempotency - in-progress operation
      if (stryMutAct_9fa48("94246") ? false : stryMutAct_9fa48("94245") ? true : (stryCov_9fa48("94245", "94246"), this.inProgressOperations.has(operationId))) {
        if (stryMutAct_9fa48("94247")) {
          {}
        } else {
          stryCov_9fa48("94247");
          this.logger.info(REPLICA_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, stryMutAct_9fa48("94248") ? {} : (stryCov_9fa48("94248"), {
            operationId,
            nodeId: this.nodeId
          }));
          return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("94249") ? {} : (stryCov_9fa48("94249"), {
            operationId,
            nodeId: this.nodeId
          }));
        }
      } // Track in-progress operation
      this.setLocalReplica(replicaId, stryMutAct_9fa48("94250") ? {} : (stryCov_9fa48("94250"), {
        replicaId,
        partitionId,
        tableName,
        status: ReplicaStatus.PENDING
      }));
      this.inProgressOperations.set(operationId, stryMutAct_9fa48("94251") ? {} : (stryCov_9fa48("94251"), {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        replicaId,
        partitionId,
        tableName,
        startedAt: Date.now()
      })); // Start async creation after ACK has returned.
      this.registerOperationTask(new Promise(resolve => {
        if (stryMutAct_9fa48("94252")) {
          {}
        } else {
          stryCov_9fa48("94252");
          setImmediate(() => {
            if (stryMutAct_9fa48("94253")) {
              {}
            } else {
              stryCov_9fa48("94253");
              if (stryMutAct_9fa48("94255") ? false : stryMutAct_9fa48("94254") ? true : (stryCov_9fa48("94254", "94255"), this.shuttingDown)) {
                if (stryMutAct_9fa48("94256")) {
                  {}
                } else {
                  stryCov_9fa48("94256");
                  this.inProgressOperations.delete(operationId);
                  this.localServices.delete(replicaId);
                  this.localReplicas.delete(replicaId);
                  resolve();
                  return;
                }
              }
              resolve(this.createReplicaAsync(stryMutAct_9fa48("94257") ? {} : (stryCov_9fa48("94257"), {
                operationId,
                partitionId,
                replicaId,
                bootstrapReplicaIds,
                bootstrapPeerAddresses,
                bootstrapTableMetadata,
                bootstrapPartitionMetadata
              })).catch(error => {
                if (stryMutAct_9fa48("94258")) {
                  {}
                } else {
                  stryCov_9fa48("94258");
                  this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_CREATE_FAILED, stryMutAct_9fa48("94259") ? {} : (stryCov_9fa48("94259"), {
                    operationId,
                    replicaId,
                    error: error.message,
                    stack: error.stack
                  }));
                }
              }));
            }
          });
        }
      }));
      return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.INITIATED, stryMutAct_9fa48("94260") ? {} : (stryCov_9fa48("94260"), {
        operationId,
        replicaId,
        nodeId: this.nodeId
      }));
    }
  } /**
    * Async replica creation - reports progress via CDC.
    * @param {Object} request - Creation request.
    * @return {Promise<void>}
    * @private
    */
  async createReplicaAsync(request) {
    if (stryMutAct_9fa48("94261")) {
      {}
    } else {
      stryCov_9fa48("94261");
      const {
        operationId,
        partitionId,
        replicaId,
        bootstrapReplicaIds,
        bootstrapPeerAddresses,
        bootstrapTableMetadata,
        bootstrapPartitionMetadata
      } = request;
      const progress = this.startReplicaCreationProgress(stryMutAct_9fa48("94262") ? {} : (stryCov_9fa48("94262"), {
        partitionId,
        replicaId,
        peerTotal: NUM.ZERO
      }));
      let partitionService = null;
      try {
        if (stryMutAct_9fa48("94263")) {
          {}
        } else {
          stryCov_9fa48("94263");
          this.throwIfShuttingDown();
          await this.updateReplicaStatus(replicaId, ReplicaStatus.PENDING, stryMutAct_9fa48("94264") ? {} : (stryCov_9fa48("94264"), {
            partitionId
          }));
          this.throwIfShuttingDown();
          await this.updateReplicaStatus(replicaId, ReplicaStatus.CREATING, stryMutAct_9fa48("94265") ? {} : (stryCov_9fa48("94265"), {
            partitionId
          }));
          this.applyBootstrapMetadataPayload(stryMutAct_9fa48("94266") ? {} : (stryCov_9fa48("94266"), {
            partitionId,
            bootstrapTableMetadata,
            bootstrapPartitionMetadata
          }));
          this.updateReplicaCreationProgress(progress, stryMutAct_9fa48("94267") ? {} : (stryCov_9fa48("94267"), {
            stage: REPLICA_HANDLER_PROGRESS.STAGE_RESOLVING_CONTEXT
          }));
          const context = await this.resolveReplicaContextWithRetry(partitionId, replicaId, stryMutAct_9fa48("94268") ? {} : (stryCov_9fa48("94268"), {
            bootstrapReplicaIds,
            bootstrapPeerAddresses,
            bootstrapTableMetadata,
            bootstrapPartitionMetadata
          }));
          this.throwIfShuttingDown();
          const {
            tableName,
            tableId,
            schema,
            keyRange,
            leaderAddress,
            replicaIds,
            peerAddresses,
            existingReplicaCount
          } = context; // Generate database path
          const dbPath = this.getPartitionDbPath(partitionId, replicaId); // Determine if this replica is joining an already-established Raft group.
          // Provisional sibling service rows alone are not enough; fresh partition
          // bring-up must bootstrap voters until a leader or active voter exists.
          const isJoiningExistingGroup = stryMutAct_9fa48("94272") ? existingReplicaCount <= 0 : stryMutAct_9fa48("94271") ? existingReplicaCount >= 0 : stryMutAct_9fa48("94270") ? false : stryMutAct_9fa48("94269") ? true : (stryCov_9fa48("94269", "94270", "94271", "94272"), existingReplicaCount > 0);
          this.updateReplicaCreationProgress(progress, stryMutAct_9fa48("94273") ? {} : (stryCov_9fa48("94273"), {
            peerTotal: Array.isArray(replicaIds) ? stryMutAct_9fa48("94274") ? Math.min(NUM.ZERO, replicaIds.length - NUM.ONE) : (stryCov_9fa48("94274"), Math.max(NUM.ZERO, stryMutAct_9fa48("94275") ? replicaIds.length + NUM.ONE : (stryCov_9fa48("94275"), replicaIds.length - NUM.ONE))) : NUM.ZERO
          }));
          partitionService = await this.createPartitionService(stryMutAct_9fa48("94276") ? {} : (stryCov_9fa48("94276"), {
            partitionId,
            tableId,
            tableName,
            schema,
            keyRange,
            replicaId,
            replicaIds,
            peerAddresses: stryMutAct_9fa48("94279") ? peerAddresses && [] : stryMutAct_9fa48("94278") ? false : stryMutAct_9fa48("94277") ? true : (stryCov_9fa48("94277", "94278", "94279"), peerAddresses || (stryMutAct_9fa48("94280") ? ["Stryker was here"] : (stryCov_9fa48("94280"), []))),
            // Pass unified peer addresses for routing
            nodeId: this.nodeId,
            dbPath,
            leaderAddress,
            isJoiningExistingGroup,
            // Start as learner if joining existing group
            suppressLifecycleLogs: stryMutAct_9fa48("94281") ? false : (stryCov_9fa48("94281"), true),
            onInitializationStage: stryMutAct_9fa48("94282") ? () => undefined : (stryCov_9fa48("94282"), stageEvent => this.updateReplicaCreationProgress(progress, stageEvent))
          }));
          if (stryMutAct_9fa48("94285") ? this.shuttingDown || typeof partitionService.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94284") ? false : stryMutAct_9fa48("94283") ? true : (stryCov_9fa48("94283", "94284", "94285"), this.shuttingDown && (stryMutAct_9fa48("94287") ? typeof partitionService.shutdown !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94286") ? true : (stryCov_9fa48("94286", "94287"), typeof partitionService.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("94288")) {
              {}
            } else {
              stryCov_9fa48("94288");
              await partitionService.shutdown();
            }
          }
          this.throwIfShuttingDown(); // Store service reference in localServices
          this.localServices.set(replicaId, partitionService);
          this.setLocalReplica(replicaId, stryMutAct_9fa48("94289") ? {} : (stryCov_9fa48("94289"), {
            replicaId,
            partitionId,
            tableName,
            service: partitionService
          })); // Emit syncing outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_SYNCING, operationId, WORKFLOW_STEP.SYNCING, stryMutAct_9fa48("94290") ? {} : (stryCov_9fa48("94290"), {
            replicaId
          }));
          this.updateReplicaCreationProgress(progress, stryMutAct_9fa48("94291") ? {} : (stryCov_9fa48("94291"), {
            stage: ReplicaStatus.SYNCING
          }));
          await this.updateReplicaStatus(replicaId, ReplicaStatus.SYNCING, stryMutAct_9fa48("94292") ? {} : (stryCov_9fa48("94292"), {
            partitionId
          })); // Sync from leader if address provided
          const service = this.localServices.get(replicaId);
          if (stryMutAct_9fa48("94295") ? service || leaderAddress : stryMutAct_9fa48("94294") ? false : stryMutAct_9fa48("94293") ? true : (stryCov_9fa48("94293", "94294", "94295"), service && leaderAddress)) {
            if (stryMutAct_9fa48("94296")) {
              {}
            } else {
              stryCov_9fa48("94296");
              if (stryMutAct_9fa48("94299") ? typeof service.syncFromLeader !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94298") ? false : stryMutAct_9fa48("94297") ? true : (stryCov_9fa48("94297", "94298", "94299"), typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("94300")) {
                  {}
                } else {
                  stryCov_9fa48("94300");
                  await service.syncFromLeader(leaderAddress);
                }
              }
            }
          }
          this.throwIfShuttingDown();
          if (stryMutAct_9fa48("94302") ? false : stryMutAct_9fa48("94301") ? true : (stryCov_9fa48("94301", "94302"), this.shouldGateActivationOnVoterReadiness(partitionId, operationId, isJoiningExistingGroup))) {
            if (stryMutAct_9fa48("94303")) {
              {}
            } else {
              stryCov_9fa48("94303");
              this.updateReplicaCreationProgress(progress, stryMutAct_9fa48("94304") ? {} : (stryCov_9fa48("94304"), {
                stage: REPLICA_HANDLER_PROGRESS.STAGE_WAITING_VOTER_READY
              }));
              await this.waitForVoterReadyActivation(replicaId, partitionId);
            }
          } // Emit active outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_ACTIVE, operationId, WORKFLOW_STEP.ACTIVE, stryMutAct_9fa48("94305") ? {} : (stryCov_9fa48("94305"), {
            replicaId
          }));
          await this.updateReplicaStatus(replicaId, ReplicaStatus.ACTIVE, stryMutAct_9fa48("94306") ? {} : (stryCov_9fa48("94306"), {
            partitionId
          }));
          this.finishReplicaCreationProgress(progress, ReplicaStatus.ACTIVE); // Clean up in-progress tracking
          if (stryMutAct_9fa48("94308") ? false : stryMutAct_9fa48("94307") ? true : (stryCov_9fa48("94307", "94308"), operationId)) {
            if (stryMutAct_9fa48("94309")) {
              {}
            } else {
              stryCov_9fa48("94309");
              this.inProgressOperations.delete(operationId);
            }
          }
          this.logger.info(REPLICA_HANDLER_LOG_MSG.CREATE_COMPLETED, stryMutAct_9fa48("94310") ? {} : (stryCov_9fa48("94310"), {
            operationId,
            replicaId,
            partitionId,
            nodeId: this.nodeId
          }));
          this.emit(REPLICA_HANDLER_EVENT.CREATED, stryMutAct_9fa48("94311") ? {} : (stryCov_9fa48("94311"), {
            operationId,
            replicaId,
            partitionId,
            nodeId: this.nodeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("94312")) {
          {}
        } else {
          stryCov_9fa48("94312");
          if (stryMutAct_9fa48("94314") ? false : stryMutAct_9fa48("94313") ? true : (stryCov_9fa48("94313", "94314"), this.shuttingDown)) {
            if (stryMutAct_9fa48("94315")) {
              {}
            } else {
              stryCov_9fa48("94315");
              this.clearReplicaCreationProgress(progress);
              if (stryMutAct_9fa48("94318") ? partitionService || typeof partitionService.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94317") ? false : stryMutAct_9fa48("94316") ? true : (stryCov_9fa48("94316", "94317", "94318"), partitionService && (stryMutAct_9fa48("94320") ? typeof partitionService.shutdown !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94319") ? true : (stryCov_9fa48("94319", "94320"), typeof partitionService.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION)))) {
                if (stryMutAct_9fa48("94321")) {
                  {}
                } else {
                  stryCov_9fa48("94321");
                  try {
                    if (stryMutAct_9fa48("94322")) {
                      {}
                    } else {
                      stryCov_9fa48("94322");
                      await partitionService.shutdown();
                    }
                  } catch (_shutdownErr) {// Best-effort shutdown only.
                  }
                }
              }
              if (stryMutAct_9fa48("94324") ? false : stryMutAct_9fa48("94323") ? true : (stryCov_9fa48("94323", "94324"), operationId)) {
                if (stryMutAct_9fa48("94325")) {
                  {}
                } else {
                  stryCov_9fa48("94325");
                  this.inProgressOperations.delete(operationId);
                }
              }
              this.localServices.delete(replicaId);
              this.localReplicas.delete(replicaId);
              return;
            }
          }
          this.failReplicaCreationProgress(progress, error);
          this.logger.error(REPLICA_HANDLER_LOG_MSG.CREATE_FAILED, stryMutAct_9fa48("94326") ? {} : (stryCov_9fa48("94326"), {
            operationId,
            replicaId,
            partitionId,
            error: error.message,
            stack: error.stack
          })); // Emit failed outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.REPLICA_CREATE_FAILED, operationId, WORKFLOW_STEP.FAILED, stryMutAct_9fa48("94327") ? {} : (stryCov_9fa48("94327"), {
            replicaId,
            errorMessage: error.message
          }));
          await this.updateReplicaStatus(replicaId, ReplicaStatus.FAILED, stryMutAct_9fa48("94328") ? {} : (stryCov_9fa48("94328"), {
            partitionId,
            errorMessage: error.message
          }));
          this.setLocalReplica(replicaId, stryMutAct_9fa48("94329") ? {} : (stryCov_9fa48("94329"), {
            replicaId,
            partitionId,
            status: ReplicaStatus.FAILED
          })); // Clean up in-progress tracking
          if (stryMutAct_9fa48("94331") ? false : stryMutAct_9fa48("94330") ? true : (stryCov_9fa48("94330", "94331"), operationId)) {
            if (stryMutAct_9fa48("94332")) {
              {}
            } else {
              stryCov_9fa48("94332");
              this.inProgressOperations.delete(operationId);
            }
          }
          this.emit(REPLICA_HANDLER_EVENT.CREATION_FAILED, stryMutAct_9fa48("94333") ? {} : (stryCov_9fa48("94333"), {
            operationId,
            replicaId,
            partitionId,
            error: error.message,
            nodeId: this.nodeId
          }));
          throw error;
        }
      }
    }
  } /**
    * Handle REMOVE_REPLICA request.
    * Returns immediately with 'initiated', then does async work.
    * Implements idempotency per Requirements 10.2.
    * @param {Object} request - REMOVE_REPLICA request.
    * @return {Promise<Object>} Response.
    */
  async handleRemoveReplica(request) {
    if (stryMutAct_9fa48("94334")) {
      {}
    } else {
      stryCov_9fa48("94334");
      const operationId = stryMutAct_9fa48("94335") ? request[ReplicaOperationField.OPERATION_ID] : (stryCov_9fa48("94335"), request?.[ReplicaOperationField.OPERATION_ID]);
      const partitionId = stryMutAct_9fa48("94336") ? request[ReplicaOperationField.PARTITION_ID] : (stryCov_9fa48("94336"), request?.[ReplicaOperationField.PARTITION_ID]);
      const replicaId = stryMutAct_9fa48("94337") ? request[ReplicaOperationField.REPLICA_ID] : (stryCov_9fa48("94337"), request?.[ReplicaOperationField.REPLICA_ID]);
      const reason = stryMutAct_9fa48("94338") ? request[ReplicaOperationField.REASON] : (stryCov_9fa48("94338"), request?.[ReplicaOperationField.REASON]);
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_REQUEST, stryMutAct_9fa48("94339") ? {} : (stryCov_9fa48("94339"), {
        operationId,
        partitionId,
        replicaId,
        reason,
        nodeId: this.nodeId
      }));
      if (stryMutAct_9fa48("94342") ? (!operationId || !partitionId) && !replicaId : stryMutAct_9fa48("94341") ? false : stryMutAct_9fa48("94340") ? true : (stryCov_9fa48("94340", "94341", "94342"), (stryMutAct_9fa48("94344") ? !operationId && !partitionId : stryMutAct_9fa48("94343") ? false : (stryCov_9fa48("94343", "94344"), (stryMutAct_9fa48("94345") ? operationId : (stryCov_9fa48("94345"), !operationId)) || (stryMutAct_9fa48("94346") ? partitionId : (stryCov_9fa48("94346"), !partitionId)))) || (stryMutAct_9fa48("94347") ? replicaId : (stryCov_9fa48("94347"), !replicaId)))) {
        if (stryMutAct_9fa48("94348")) {
          {}
        } else {
          stryCov_9fa48("94348");
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_MISSING_FIELDS, stryMutAct_9fa48("94349") ? {} : (stryCov_9fa48("94349"), {
            operationId,
            partitionId,
            replicaId,
            nodeId: this.nodeId
          }));
          return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("94350") ? {} : (stryCov_9fa48("94350"), {
            error: REPLICA_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
            nodeId: this.nodeId
          }));
        }
      } // Check if replica exists
      const replica = this.getLocalReplica(replicaId);
      if (stryMutAct_9fa48("94353") ? false : stryMutAct_9fa48("94352") ? true : stryMutAct_9fa48("94351") ? replica : (stryCov_9fa48("94351", "94352", "94353"), !replica)) {
        if (stryMutAct_9fa48("94354")) {
          {}
        } else {
          stryCov_9fa48("94354");
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_NOT_FOUND, stryMutAct_9fa48("94355") ? {} : (stryCov_9fa48("94355"), {
            replicaId,
            nodeId: this.nodeId
          }));
          return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.NOT_FOUND, stryMutAct_9fa48("94356") ? {} : (stryCov_9fa48("94356"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      } // Check idempotency - already removing
      if (stryMutAct_9fa48("94359") ? replica.status !== ReplicaStatus.REMOVING : stryMutAct_9fa48("94358") ? false : stryMutAct_9fa48("94357") ? true : (stryCov_9fa48("94357", "94358", "94359"), replica.status === ReplicaStatus.REMOVING)) {
        if (stryMutAct_9fa48("94360")) {
          {}
        } else {
          stryCov_9fa48("94360");
          this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS, stryMutAct_9fa48("94361") ? {} : (stryCov_9fa48("94361"), {
            replicaId,
            nodeId: this.nodeId
          }));
          return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("94362") ? {} : (stryCov_9fa48("94362"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      } // Check idempotency - already removed
      if (stryMutAct_9fa48("94365") ? replica.status !== ReplicaStatus.REMOVED : stryMutAct_9fa48("94364") ? false : stryMutAct_9fa48("94363") ? true : (stryCov_9fa48("94363", "94364", "94365"), replica.status === ReplicaStatus.REMOVED)) {
        if (stryMutAct_9fa48("94366")) {
          {}
        } else {
          stryCov_9fa48("94366");
          try {
            if (stryMutAct_9fa48("94367")) {
              {}
            } else {
              stryCov_9fa48("94367");
              await this.reconcileRemovedReplicaCleanup(replicaId, partitionId);
            }
          } catch (error) {
            if (stryMutAct_9fa48("94368")) {
              {}
            } else {
              stryCov_9fa48("94368");
              this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, stryMutAct_9fa48("94369") ? {} : (stryCov_9fa48("94369"), {
                operationId,
                replicaId,
                partitionId,
                error: error.message,
                stack: error.stack
              }));
              return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.ERROR, stryMutAct_9fa48("94370") ? {} : (stryCov_9fa48("94370"), {
                error: error.message,
                replicaId,
                nodeId: this.nodeId
              }));
            }
          }
          this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED, stryMutAct_9fa48("94371") ? {} : (stryCov_9fa48("94371"), {
            replicaId,
            nodeId: this.nodeId
          }));
          return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.COMPLETED, stryMutAct_9fa48("94372") ? {} : (stryCov_9fa48("94372"), {
            replicaId,
            nodeId: this.nodeId
          }));
        }
      } // Check idempotency - in-progress operation
      if (stryMutAct_9fa48("94374") ? false : stryMutAct_9fa48("94373") ? true : (stryCov_9fa48("94373", "94374"), this.inProgressOperations.has(operationId))) {
        if (stryMutAct_9fa48("94375")) {
          {}
        } else {
          stryCov_9fa48("94375");
          this.logger.info(REPLICA_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, stryMutAct_9fa48("94376") ? {} : (stryCov_9fa48("94376"), {
            operationId,
            nodeId: this.nodeId
          }));
          return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.IN_PROGRESS, stryMutAct_9fa48("94377") ? {} : (stryCov_9fa48("94377"), {
            operationId,
            nodeId: this.nodeId
          }));
        }
      } // Track in-progress operation
      this.inProgressOperations.set(operationId, stryMutAct_9fa48("94378") ? {} : (stryCov_9fa48("94378"), {
        type: ReplicaOperationMessageType.REMOVE_REPLICA,
        replicaId,
        partitionId,
        startedAt: Date.now()
      }));
      this.setLocalReplica(replicaId, stryMutAct_9fa48("94379") ? {} : (stryCov_9fa48("94379"), {
        replicaId,
        partitionId,
        status: ReplicaStatus.REMOVING,
        service: stryMutAct_9fa48("94382") ? replica.service && this.getTrackedService(replicaId) : stryMutAct_9fa48("94381") ? false : stryMutAct_9fa48("94380") ? true : (stryCov_9fa48("94380", "94381", "94382"), replica.service || this.getTrackedService(replicaId))
      })); // Start async removal after ACK has returned.
      this.registerOperationTask(new Promise(resolve => {
        if (stryMutAct_9fa48("94383")) {
          {}
        } else {
          stryCov_9fa48("94383");
          setImmediate(() => {
            if (stryMutAct_9fa48("94384")) {
              {}
            } else {
              stryCov_9fa48("94384");
              if (stryMutAct_9fa48("94386") ? false : stryMutAct_9fa48("94385") ? true : (stryCov_9fa48("94385", "94386"), this.shuttingDown)) {
                if (stryMutAct_9fa48("94387")) {
                  {}
                } else {
                  stryCov_9fa48("94387");
                  this.inProgressOperations.delete(operationId);
                  resolve();
                  return;
                }
              }
              resolve(this.removeReplicaAsync(stryMutAct_9fa48("94388") ? {} : (stryCov_9fa48("94388"), {
                operationId,
                partitionId,
                replicaId,
                reason
              })).catch(error => {
                if (stryMutAct_9fa48("94389")) {
                  {}
                } else {
                  stryCov_9fa48("94389");
                  this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED, stryMutAct_9fa48("94390") ? {} : (stryCov_9fa48("94390"), {
                    operationId,
                    replicaId,
                    error: error.message,
                    stack: error.stack
                  }));
                }
              }));
            }
          });
        }
      }));
      return this.buildReplicaOperationResponse(ReplicaOperationResponseStatus.INITIATED, stryMutAct_9fa48("94391") ? {} : (stryCov_9fa48("94391"), {
        operationId,
        replicaId,
        nodeId: this.nodeId
      }));
    }
  } /**
    * Reconcile durable cleanup for replicas already marked REMOVED locally.
    * This keeps idempotent REMOVE retries from leaving stale service rows
    * routable after the local replica is already gone.
    * @param {string} replicaId
    * @param {string} partitionId
    * @return {Promise<boolean>} True when stale cleanup work ran.
    * @private
    */
  async reconcileRemovedReplicaCleanup(replicaId, partitionId) {
    if (stryMutAct_9fa48("94392")) {
      {}
    } else {
      stryCov_9fa48("94392");
      const cachedServiceRow = stryMutAct_9fa48("94395") ? this.systemTableCache?.get?.(SYSTEM_TABLE_NAME.SERVICES, replicaId) && null : stryMutAct_9fa48("94394") ? false : stryMutAct_9fa48("94393") ? true : (stryCov_9fa48("94393", "94394", "94395"), (stryMutAct_9fa48("94397") ? this.systemTableCache.get?.(SYSTEM_TABLE_NAME.SERVICES, replicaId) : stryMutAct_9fa48("94396") ? this.systemTableCache?.get(SYSTEM_TABLE_NAME.SERVICES, replicaId) : (stryCov_9fa48("94396", "94397"), this.systemTableCache?.get?.(SYSTEM_TABLE_NAME.SERVICES, replicaId))) || null);
      const trackedService = this.getTrackedService(replicaId);
      if (stryMutAct_9fa48("94400") ? !cachedServiceRow || !trackedService : stryMutAct_9fa48("94399") ? false : stryMutAct_9fa48("94398") ? true : (stryCov_9fa48("94398", "94399", "94400"), (stryMutAct_9fa48("94401") ? cachedServiceRow : (stryCov_9fa48("94401"), !cachedServiceRow)) && (stryMutAct_9fa48("94402") ? trackedService : (stryCov_9fa48("94402"), !trackedService)))) {
        if (stryMutAct_9fa48("94403")) {
          {}
        } else {
          stryCov_9fa48("94403");
          this.localServices.delete(replicaId);
          this.setLocalReplica(replicaId, stryMutAct_9fa48("94404") ? {} : (stryCov_9fa48("94404"), {
            replicaId,
            partitionId,
            status: ReplicaStatus.REMOVED,
            service: null
          }));
          if (stryMutAct_9fa48("94407") ? typeof this.replicaStateMachine?.completeDurableRemoval !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94406") ? false : stryMutAct_9fa48("94405") ? true : (stryCov_9fa48("94405", "94406", "94407"), typeof (stryMutAct_9fa48("94408") ? this.replicaStateMachine.completeDurableRemoval : (stryCov_9fa48("94408"), this.replicaStateMachine?.completeDurableRemoval)) === REPLICA_HANDLER_TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("94409")) {
              {}
            } else {
              stryCov_9fa48("94409");
              this.replicaStateMachine.completeDurableRemoval(replicaId, stryMutAct_9fa48("94410") ? {} : (stryCov_9fa48("94410"), {
                partitionId,
                nodeId: this.nodeId,
                reason: REPLICA_HANDLER_LITERAL.DURABLE_REMOVE_CLEANUP_COMPLETE,
                serviceId: replicaId
              }));
            }
          }
          return stryMutAct_9fa48("94411") ? true : (stryCov_9fa48("94411"), false);
        }
      }
      await this.getPartitionServiceRowOwner().removeReplica(stryMutAct_9fa48("94412") ? {} : (stryCov_9fa48("94412"), {
        partitionId,
        replicaId,
        nodeId: this.nodeId
      }));
      this.localServices.delete(replicaId);
      this.setLocalReplica(replicaId, stryMutAct_9fa48("94413") ? {} : (stryCov_9fa48("94413"), {
        replicaId,
        partitionId,
        status: ReplicaStatus.REMOVED,
        service: null
      }));
      if (stryMutAct_9fa48("94416") ? typeof this.replicaStateMachine?.completeDurableRemoval !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94415") ? false : stryMutAct_9fa48("94414") ? true : (stryCov_9fa48("94414", "94415", "94416"), typeof (stryMutAct_9fa48("94417") ? this.replicaStateMachine.completeDurableRemoval : (stryCov_9fa48("94417"), this.replicaStateMachine?.completeDurableRemoval)) === REPLICA_HANDLER_TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("94418")) {
          {}
        } else {
          stryCov_9fa48("94418");
          this.replicaStateMachine.completeDurableRemoval(replicaId, stryMutAct_9fa48("94419") ? {} : (stryCov_9fa48("94419"), {
            partitionId,
            nodeId: this.nodeId,
            reason: REPLICA_HANDLER_LITERAL.DURABLE_REMOVE_CLEANUP_COMPLETE,
            serviceId: replicaId
          }));
        }
      }
      return stryMutAct_9fa48("94420") ? false : (stryCov_9fa48("94420"), true);
    }
  } /**
    * Async replica removal - reports progress via CDC.
    * @param {Object} request - Removal request.
    * @return {Promise<void>}
    * @private
    */
  async removeReplicaAsync(request) {
    if (stryMutAct_9fa48("94421")) {
      {}
    } else {
      stryCov_9fa48("94421");
      const {
        operationId,
        partitionId,
        replicaId,
        reason
      } = request;
      try {
        if (stryMutAct_9fa48("94422")) {
          {}
        } else {
          stryCov_9fa48("94422");
          this.throwIfShuttingDown(); // Update status to removing (via CDC)
          await this.updateReplicaStatus(replicaId, ReplicaStatus.REMOVING, stryMutAct_9fa48("94423") ? {} : (stryCov_9fa48("94423"), {
            partitionId
          })); // Get the replica service
          const service = this.getTrackedService(replicaId); // Graceful shutdown of service
          if (stryMutAct_9fa48("94426") ? service || typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94425") ? false : stryMutAct_9fa48("94424") ? true : (stryCov_9fa48("94424", "94425", "94426"), service && (stryMutAct_9fa48("94428") ? typeof service.shutdown !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94427") ? true : (stryCov_9fa48("94427", "94428"), typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("94429")) {
              {}
            } else {
              stryCov_9fa48("94429");
              this.logger.debug(REPLICA_HANDLER_LOG_MSG.GRACEFUL_SHUTDOWN, stryMutAct_9fa48("94430") ? {} : (stryCov_9fa48("94430"), {
                replicaId,
                nodeId: this.nodeId
              }));
              await service.shutdown();
            }
          } // Clean up local resources (SQLite files)
          await this.cleanupReplicaResources(partitionId, replicaId); // Delete service row from services table
          try {
            if (stryMutAct_9fa48("94431")) {
              {}
            } else {
              stryCov_9fa48("94431");
              await this.getPartitionServiceRowOwner().removeReplica(stryMutAct_9fa48("94432") ? {} : (stryCov_9fa48("94432"), {
                partitionId,
                replicaId,
                nodeId: this.nodeId
              }));
            }
          } catch (deleteError) {
            if (stryMutAct_9fa48("94433")) {
              {}
            } else {
              stryCov_9fa48("94433");
              this.logger.warn(REPLICA_HANDLER_LOG_MSG.DELETE_SERVICE_ROW_FAILED, stryMutAct_9fa48("94434") ? {} : (stryCov_9fa48("94434"), {
                replicaId,
                error: deleteError.message
              }));
              throw deleteError;
            }
          }
          if (stryMutAct_9fa48("94437") ? typeof this.replicaStateMachine?.completeDurableRemoval !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94436") ? false : stryMutAct_9fa48("94435") ? true : (stryCov_9fa48("94435", "94436", "94437"), typeof (stryMutAct_9fa48("94438") ? this.replicaStateMachine.completeDurableRemoval : (stryCov_9fa48("94438"), this.replicaStateMachine?.completeDurableRemoval)) === REPLICA_HANDLER_TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("94439")) {
              {}
            } else {
              stryCov_9fa48("94439");
              this.replicaStateMachine.completeDurableRemoval(replicaId, stryMutAct_9fa48("94440") ? {} : (stryCov_9fa48("94440"), {
                partitionId,
                nodeId: this.nodeId,
                reason: REPLICA_HANDLER_LITERAL.DURABLE_REMOVE_CLEANUP_COMPLETE,
                serviceId: replicaId
              }));
            }
          } // Remove from local service tracking
          this.localServices.delete(replicaId);
          this.setLocalReplica(replicaId, stryMutAct_9fa48("94441") ? {} : (stryCov_9fa48("94441"), {
            replicaId,
            partitionId,
            status: ReplicaStatus.REMOVED,
            service: null
          })); // Clean up in-progress tracking
          if (stryMutAct_9fa48("94443") ? false : stryMutAct_9fa48("94442") ? true : (stryCov_9fa48("94442", "94443"), operationId)) {
            if (stryMutAct_9fa48("94444")) {
              {}
            } else {
              stryCov_9fa48("94444");
              this.inProgressOperations.delete(operationId);
            }
          } // Emit removed outcome only after source-row cleanup is durable.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED, operationId, WORKFLOW_STEP.REMOVED, stryMutAct_9fa48("94445") ? {} : (stryCov_9fa48("94445"), {
            replicaId
          }));
          this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_COMPLETED, stryMutAct_9fa48("94446") ? {} : (stryCov_9fa48("94446"), {
            operationId,
            replicaId,
            partitionId,
            reason,
            nodeId: this.nodeId
          }));
          this.emit(REPLICA_HANDLER_EVENT.REMOVED, stryMutAct_9fa48("94447") ? {} : (stryCov_9fa48("94447"), {
            operationId,
            replicaId,
            partitionId,
            reason,
            nodeId: this.nodeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("94448")) {
          {}
        } else {
          stryCov_9fa48("94448");
          if (stryMutAct_9fa48("94450") ? false : stryMutAct_9fa48("94449") ? true : (stryCov_9fa48("94449", "94450"), this.shuttingDown)) {
            if (stryMutAct_9fa48("94451")) {
              {}
            } else {
              stryCov_9fa48("94451");
              if (stryMutAct_9fa48("94453") ? false : stryMutAct_9fa48("94452") ? true : (stryCov_9fa48("94452", "94453"), operationId)) {
                if (stryMutAct_9fa48("94454")) {
                  {}
                } else {
                  stryCov_9fa48("94454");
                  this.inProgressOperations.delete(operationId);
                }
              }
              return;
            }
          }
          this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, stryMutAct_9fa48("94455") ? {} : (stryCov_9fa48("94455"), {
            operationId,
            replicaId,
            partitionId,
            error: error.message,
            stack: error.stack
          })); // Emit failed outcome — coordinator will transition workflow.
          this.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED, operationId, WORKFLOW_STEP.FAILED, stryMutAct_9fa48("94456") ? {} : (stryCov_9fa48("94456"), {
            replicaId,
            errorMessage: error.message
          }));
          await this.updateReplicaStatus(replicaId, ReplicaStatus.FAILED, stryMutAct_9fa48("94457") ? {} : (stryCov_9fa48("94457"), {
            partitionId,
            errorMessage: error.message
          }));
          this.setLocalReplica(replicaId, stryMutAct_9fa48("94458") ? {} : (stryCov_9fa48("94458"), {
            replicaId,
            partitionId,
            status: ReplicaStatus.FAILED
          })); // Clean up in-progress tracking
          if (stryMutAct_9fa48("94460") ? false : stryMutAct_9fa48("94459") ? true : (stryCov_9fa48("94459", "94460"), operationId)) {
            if (stryMutAct_9fa48("94461")) {
              {}
            } else {
              stryCov_9fa48("94461");
              this.inProgressOperations.delete(operationId);
            }
          }
          this.emit(REPLICA_HANDLER_EVENT.REMOVAL_FAILED, stryMutAct_9fa48("94462") ? {} : (stryCov_9fa48("94462"), {
            operationId,
            replicaId,
            partitionId,
            error: error.message,
            nodeId: this.nodeId
          }));
          throw error;
        }
      }
    }
  } /**
    * Update replica status through the replica lifecycle state machine.
    * The state machine owns services-table lifecycle persistence.
    * @param {string} replicaId - Replica ID.
    * @param {string} newStatus - New status.
    * @param {Object} additionalData - Additional data to update.
    * @return {Promise<void>}
    * @private
    */
  async updateReplicaStatus(replicaId, newStatus, additionalData = {}) {
    if (stryMutAct_9fa48("94463")) {
      {}
    } else {
      stryCov_9fa48("94463");
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS, stryMutAct_9fa48("94464") ? {} : (stryCov_9fa48("94464"), {
        replicaId,
        newStatus,
        nodeId: this.nodeId
      }));
      try {
        if (stryMutAct_9fa48("94465")) {
          {}
        } else {
          stryCov_9fa48("94465");
          const existing = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
          const partitionId = (stryMutAct_9fa48("94468") ? additionalData.partitionId === undefined : stryMutAct_9fa48("94467") ? false : stryMutAct_9fa48("94466") ? true : (stryCov_9fa48("94466", "94467", "94468"), additionalData.partitionId !== undefined)) ? additionalData.partitionId : stryMutAct_9fa48("94471") ? existing?.partition_id && null : stryMutAct_9fa48("94470") ? false : stryMutAct_9fa48("94469") ? true : (stryCov_9fa48("94469", "94470", "94471"), (stryMutAct_9fa48("94472") ? existing.partition_id : (stryCov_9fa48("94472"), existing?.partition_id)) || null);
          const localService = this.getTrackedService(replicaId);
          const localReplica = this.getLocalReplica(replicaId);
          const previousLocalStatus = stryMutAct_9fa48("94475") ? localReplica?.status && null : stryMutAct_9fa48("94474") ? false : stryMutAct_9fa48("94473") ? true : (stryCov_9fa48("94473", "94474", "94475"), (stryMutAct_9fa48("94476") ? localReplica.status : (stryCov_9fa48("94476"), localReplica?.status)) || null);
          this.setLocalReplica(replicaId, stryMutAct_9fa48("94477") ? {} : (stryCov_9fa48("94477"), {
            replicaId,
            partitionId,
            status: newStatus,
            service: localService
          }));
          const trackedState = stryMutAct_9fa48("94480") ? this.replicaStateMachine?.getState?.(replicaId) && null : stryMutAct_9fa48("94479") ? false : stryMutAct_9fa48("94478") ? true : (stryCov_9fa48("94478", "94479", "94480"), (stryMutAct_9fa48("94482") ? this.replicaStateMachine.getState?.(replicaId) : stryMutAct_9fa48("94481") ? this.replicaStateMachine?.getState(replicaId) : (stryCov_9fa48("94481", "94482"), this.replicaStateMachine?.getState?.(replicaId))) || null);
          if (stryMutAct_9fa48("94485") ? !trackedState && newStatus !== ReplicaStatus.PENDING && typeof this.replicaStateMachine?.registerReplicaSnapshot === REPLICA_HANDLER_TYPEOF.FUNCTION || existing || localReplica : stryMutAct_9fa48("94484") ? false : stryMutAct_9fa48("94483") ? true : (stryCov_9fa48("94483", "94484", "94485"), (stryMutAct_9fa48("94487") ? !trackedState && newStatus !== ReplicaStatus.PENDING || typeof this.replicaStateMachine?.registerReplicaSnapshot === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94486") ? true : (stryCov_9fa48("94486", "94487"), (stryMutAct_9fa48("94489") ? !trackedState || newStatus !== ReplicaStatus.PENDING : stryMutAct_9fa48("94488") ? true : (stryCov_9fa48("94488", "94489"), (stryMutAct_9fa48("94490") ? trackedState : (stryCov_9fa48("94490"), !trackedState)) && (stryMutAct_9fa48("94492") ? newStatus === ReplicaStatus.PENDING : stryMutAct_9fa48("94491") ? true : (stryCov_9fa48("94491", "94492"), newStatus !== ReplicaStatus.PENDING)))) && (stryMutAct_9fa48("94494") ? typeof this.replicaStateMachine?.registerReplicaSnapshot !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94493") ? true : (stryCov_9fa48("94493", "94494"), typeof (stryMutAct_9fa48("94495") ? this.replicaStateMachine.registerReplicaSnapshot : (stryCov_9fa48("94495"), this.replicaStateMachine?.registerReplicaSnapshot)) === REPLICA_HANDLER_TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("94497") ? existing && localReplica : stryMutAct_9fa48("94496") ? true : (stryCov_9fa48("94496", "94497"), existing || localReplica)))) {
            if (stryMutAct_9fa48("94498")) {
              {}
            } else {
              stryCov_9fa48("94498");
              this.replicaStateMachine.registerReplicaSnapshot(replicaId, stryMutAct_9fa48("94499") ? {} : (stryCov_9fa48("94499"), {
                partitionId,
                nodeId: stryMutAct_9fa48("94502") ? existing?.node_id && this.nodeId : stryMutAct_9fa48("94501") ? false : stryMutAct_9fa48("94500") ? true : (stryCov_9fa48("94500", "94501", "94502"), (stryMutAct_9fa48("94503") ? existing.node_id : (stryCov_9fa48("94503"), existing?.node_id)) || this.nodeId),
                state: resolveSnapshotStateForTransition(stryMutAct_9fa48("94504") ? existing.status : (stryCov_9fa48("94504"), existing?.status), previousLocalStatus, newStatus),
                serviceId: stryMutAct_9fa48("94507") ? existing?.service_id && replicaId : stryMutAct_9fa48("94506") ? false : stryMutAct_9fa48("94505") ? true : (stryCov_9fa48("94505", "94506", "94507"), (stryMutAct_9fa48("94508") ? existing.service_id : (stryCov_9fa48("94508"), existing?.service_id)) || replicaId),
                serviceType: stryMutAct_9fa48("94511") ? existing?.service_type && REPLICA_HANDLER_SERVICE.TYPE : stryMutAct_9fa48("94510") ? false : stryMutAct_9fa48("94509") ? true : (stryCov_9fa48("94509", "94510", "94511"), (stryMutAct_9fa48("94512") ? existing.service_type : (stryCov_9fa48("94512"), existing?.service_type)) || REPLICA_HANDLER_SERVICE.TYPE),
                serviceAddress: stryMutAct_9fa48("94515") ? existing?.address && this.buildTrackedServiceAddress(replicaId) : stryMutAct_9fa48("94514") ? false : stryMutAct_9fa48("94513") ? true : (stryCov_9fa48("94513", "94514", "94515"), (stryMutAct_9fa48("94516") ? existing.address : (stryCov_9fa48("94516"), existing?.address)) || this.buildTrackedServiceAddress(replicaId))
              }));
            }
          }
          const transitionResult = await Promise.resolve(this.replicaStateMachine.transition(replicaId, newStatus, stryMutAct_9fa48("94517") ? {} : (stryCov_9fa48("94517"), {
            partitionId,
            nodeId: stryMutAct_9fa48("94520") ? existing?.node_id && this.nodeId : stryMutAct_9fa48("94519") ? false : stryMutAct_9fa48("94518") ? true : (stryCov_9fa48("94518", "94519", "94520"), (stryMutAct_9fa48("94521") ? existing.node_id : (stryCov_9fa48("94521"), existing?.node_id)) || this.nodeId),
            errorMessage: additionalData.errorMessage,
            serviceId: stryMutAct_9fa48("94524") ? existing?.service_id && replicaId : stryMutAct_9fa48("94523") ? false : stryMutAct_9fa48("94522") ? true : (stryCov_9fa48("94522", "94523", "94524"), (stryMutAct_9fa48("94525") ? existing.service_id : (stryCov_9fa48("94525"), existing?.service_id)) || replicaId),
            serviceType: stryMutAct_9fa48("94528") ? existing?.service_type && REPLICA_HANDLER_SERVICE.TYPE : stryMutAct_9fa48("94527") ? false : stryMutAct_9fa48("94526") ? true : (stryCov_9fa48("94526", "94527", "94528"), (stryMutAct_9fa48("94529") ? existing.service_type : (stryCov_9fa48("94529"), existing?.service_type)) || REPLICA_HANDLER_SERVICE.TYPE),
            serviceAddress: stryMutAct_9fa48("94532") ? existing?.address && this.buildTrackedServiceAddress(replicaId) : stryMutAct_9fa48("94531") ? false : stryMutAct_9fa48("94530") ? true : (stryCov_9fa48("94530", "94531", "94532"), (stryMutAct_9fa48("94533") ? existing.address : (stryCov_9fa48("94533"), existing?.address)) || this.buildTrackedServiceAddress(replicaId))
          })));
          if (stryMutAct_9fa48("94536") ? transitionResult !== false : stryMutAct_9fa48("94535") ? false : stryMutAct_9fa48("94534") ? true : (stryCov_9fa48("94534", "94535", "94536"), transitionResult === (stryMutAct_9fa48("94537") ? true : (stryCov_9fa48("94537"), false)))) {
            if (stryMutAct_9fa48("94538")) {
              {}
            } else {
              stryCov_9fa48("94538");
              throw new Error(stryMutAct_9fa48("94539") ? `` : (stryCov_9fa48("94539"), `Replica state transition rejected for ${replicaId}: ${newStatus}`));
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("94540")) {
          {}
        } else {
          stryCov_9fa48("94540");
          this.logger.error(REPLICA_HANDLER_LOG_MSG.UPDATE_STATUS_FAILED, stryMutAct_9fa48("94541") ? {} : (stryCov_9fa48("94541"), {
            replicaId,
            newStatus,
            error: error.message
          }));
          throw error;
        }
      }
    }
  } /**
    * Determine whether activation should be gated on voter readiness.
    * Critical partitions gate activation for explicit ADD operations. When ADD
    * metadata is not yet visible, we only gate if there is an in-flight paired
    * REMOVE for the same partition.
    * @param {string} partitionId - Partition ID.
    * @param {string} operationId - Replica operation ID.
    * @param {boolean} [isJoiningExistingGroup=false] - Whether this replica is
    * joining an existing Raft group.
    * @return {boolean} True when voter-ready activation is required.
    * @private
    */
  shouldGateActivationOnVoterReadiness(partitionId, operationId, isJoiningExistingGroup = stryMutAct_9fa48("94542") ? true : (stryCov_9fa48("94542"), false)) {
    if (stryMutAct_9fa48("94543")) {
      {}
    } else {
      stryCov_9fa48("94543");
      if (stryMutAct_9fa48("94546") ? typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING && !CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId) : stryMutAct_9fa48("94545") ? false : stryMutAct_9fa48("94544") ? true : (stryCov_9fa48("94544", "94545", "94546"), (stryMutAct_9fa48("94548") ? typeof partitionId === REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94547") ? false : (stryCov_9fa48("94547", "94548"), typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING)) || (stryMutAct_9fa48("94549") ? CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId) : (stryCov_9fa48("94549"), !CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId))))) {
        if (stryMutAct_9fa48("94550")) {
          {}
        } else {
          stryCov_9fa48("94550");
          return stryMutAct_9fa48("94551") ? true : (stryCov_9fa48("94551"), false);
        }
      }
      if (stryMutAct_9fa48("94554") ? !this.systemTableCache && typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94553") ? false : stryMutAct_9fa48("94552") ? true : (stryCov_9fa48("94552", "94553", "94554"), (stryMutAct_9fa48("94555") ? this.systemTableCache : (stryCov_9fa48("94555"), !this.systemTableCache)) || (stryMutAct_9fa48("94557") ? typeof this.systemTableCache.get === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94556") ? false : (stryCov_9fa48("94556", "94557"), typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("94558")) {
          {}
        } else {
          stryCov_9fa48("94558");
          return stryMutAct_9fa48("94559") ? true : (stryCov_9fa48("94559"), false);
        }
      }
      if (stryMutAct_9fa48("94562") ? false : stryMutAct_9fa48("94561") ? true : stryMutAct_9fa48("94560") ? operationId : (stryCov_9fa48("94560", "94561", "94562"), !operationId)) {
        if (stryMutAct_9fa48("94563")) {
          {}
        } else {
          stryCov_9fa48("94563");
          return stryMutAct_9fa48("94566") ? isJoiningExistingGroup || this.hasInFlightCriticalRemove(partitionId) : stryMutAct_9fa48("94565") ? false : stryMutAct_9fa48("94564") ? true : (stryCov_9fa48("94564", "94565", "94566"), isJoiningExistingGroup && this.hasInFlightCriticalRemove(partitionId));
        }
      }
      const operationRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId);
      if (stryMutAct_9fa48("94569") ? false : stryMutAct_9fa48("94568") ? true : stryMutAct_9fa48("94567") ? operationRow : (stryCov_9fa48("94567", "94568", "94569"), !operationRow)) {
        if (stryMutAct_9fa48("94570")) {
          {}
        } else {
          stryCov_9fa48("94570");
          return stryMutAct_9fa48("94573") ? isJoiningExistingGroup || this.hasInFlightCriticalRemove(partitionId) : stryMutAct_9fa48("94572") ? false : stryMutAct_9fa48("94571") ? true : (stryCov_9fa48("94571", "94572", "94573"), isJoiningExistingGroup && this.hasInFlightCriticalRemove(partitionId));
        }
      }
      const operationType = (stryMutAct_9fa48("94576") ? typeof operationRow.type !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94575") ? false : stryMutAct_9fa48("94574") ? true : (stryCov_9fa48("94574", "94575", "94576"), typeof operationRow.type === REPLICA_HANDLER_TYPEOF.STRING)) ? stryMutAct_9fa48("94577") ? operationRow.type.toLowerCase() : (stryCov_9fa48("94577"), operationRow.type.toUpperCase()) : null;
      if (stryMutAct_9fa48("94580") ? false : stryMutAct_9fa48("94579") ? true : stryMutAct_9fa48("94578") ? operationType : (stryCov_9fa48("94578", "94579", "94580"), !operationType)) {
        if (stryMutAct_9fa48("94581")) {
          {}
        } else {
          stryCov_9fa48("94581");
          return stryMutAct_9fa48("94582") ? true : (stryCov_9fa48("94582"), false);
        }
      }
      return stryMutAct_9fa48("94585") ? operationType !== REPLICA_HANDLER_LITERAL.ADD : stryMutAct_9fa48("94584") ? false : stryMutAct_9fa48("94583") ? true : (stryCov_9fa48("94583", "94584", "94585"), operationType === REPLICA_HANDLER_LITERAL.ADD);
    }
  } /**
    * Check whether a critical partition has an in-flight REMOVE operation.
    * @param {string} partitionId - Partition ID.
    * @return {boolean} True when a non-terminal REMOVE exists.
    * @private
    */
  hasInFlightCriticalRemove(partitionId) {
    if (stryMutAct_9fa48("94586")) {
      {}
    } else {
      stryCov_9fa48("94586");
      if (stryMutAct_9fa48("94589") ? !this.systemTableCache && typeof this.systemTableCache.filter !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94588") ? false : stryMutAct_9fa48("94587") ? true : (stryCov_9fa48("94587", "94588", "94589"), (stryMutAct_9fa48("94590") ? this.systemTableCache : (stryCov_9fa48("94590"), !this.systemTableCache)) || (stryMutAct_9fa48("94592") ? typeof this.systemTableCache.filter === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94591") ? false : (stryCov_9fa48("94591", "94592"), typeof this.systemTableCache.filter !== REPLICA_HANDLER_TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("94593")) {
          {}
        } else {
          stryCov_9fa48("94593");
          return stryMutAct_9fa48("94594") ? true : (stryCov_9fa48("94594"), false);
        }
      }
      const removeOperations = stryMutAct_9fa48("94595") ? this.systemTableCache : (stryCov_9fa48("94595"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, stryMutAct_9fa48("94596") ? () => undefined : (stryCov_9fa48("94596"), row => stryMutAct_9fa48("94599") ? row?.partition_id === partitionId && typeof row?.type === REPLICA_HANDLER_TYPEOF.STRING || row.type.toUpperCase() === 'REMOVE' : stryMutAct_9fa48("94598") ? false : stryMutAct_9fa48("94597") ? true : (stryCov_9fa48("94597", "94598", "94599"), (stryMutAct_9fa48("94601") ? row?.partition_id === partitionId || typeof row?.type === REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94600") ? true : (stryCov_9fa48("94600", "94601"), (stryMutAct_9fa48("94603") ? row?.partition_id !== partitionId : stryMutAct_9fa48("94602") ? true : (stryCov_9fa48("94602", "94603"), (stryMutAct_9fa48("94604") ? row.partition_id : (stryCov_9fa48("94604"), row?.partition_id)) === partitionId)) && (stryMutAct_9fa48("94606") ? typeof row?.type !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94605") ? true : (stryCov_9fa48("94605", "94606"), typeof (stryMutAct_9fa48("94607") ? row.type : (stryCov_9fa48("94607"), row?.type)) === REPLICA_HANDLER_TYPEOF.STRING)))) && (stryMutAct_9fa48("94609") ? row.type.toUpperCase() !== 'REMOVE' : stryMutAct_9fa48("94608") ? true : (stryCov_9fa48("94608", "94609"), (stryMutAct_9fa48("94610") ? row.type.toLowerCase() : (stryCov_9fa48("94610"), row.type.toUpperCase())) === (stryMutAct_9fa48("94611") ? "" : (stryCov_9fa48("94611"), 'REMOVE'))))))));
      return stryMutAct_9fa48("94612") ? removeOperations.every(row => {
        const status = typeof row?.status === REPLICA_HANDLER_TYPEOF.STRING ? row.status.toLowerCase() : null;
        return status !== ReplicaStatus.ACTIVE && status !== ReplicaStatus.REMOVED && status !== ReplicaStatus.FAILED;
      }) : (stryCov_9fa48("94612"), removeOperations.some(row => {
        if (stryMutAct_9fa48("94613")) {
          {}
        } else {
          stryCov_9fa48("94613");
          const status = (stryMutAct_9fa48("94616") ? typeof row?.status !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94615") ? false : stryMutAct_9fa48("94614") ? true : (stryCov_9fa48("94614", "94615", "94616"), typeof (stryMutAct_9fa48("94617") ? row.status : (stryCov_9fa48("94617"), row?.status)) === REPLICA_HANDLER_TYPEOF.STRING)) ? stryMutAct_9fa48("94618") ? row.status.toUpperCase() : (stryCov_9fa48("94618"), row.status.toLowerCase()) : null;
          return stryMutAct_9fa48("94621") ? status !== ReplicaStatus.ACTIVE && status !== ReplicaStatus.REMOVED || status !== ReplicaStatus.FAILED : stryMutAct_9fa48("94620") ? false : stryMutAct_9fa48("94619") ? true : (stryCov_9fa48("94619", "94620", "94621"), (stryMutAct_9fa48("94623") ? status !== ReplicaStatus.ACTIVE || status !== ReplicaStatus.REMOVED : stryMutAct_9fa48("94622") ? true : (stryCov_9fa48("94622", "94623"), (stryMutAct_9fa48("94625") ? status === ReplicaStatus.ACTIVE : stryMutAct_9fa48("94624") ? true : (stryCov_9fa48("94624", "94625"), status !== ReplicaStatus.ACTIVE)) && (stryMutAct_9fa48("94627") ? status === ReplicaStatus.REMOVED : stryMutAct_9fa48("94626") ? true : (stryCov_9fa48("94626", "94627"), status !== ReplicaStatus.REMOVED)))) && (stryMutAct_9fa48("94629") ? status === ReplicaStatus.FAILED : stryMutAct_9fa48("94628") ? true : (stryCov_9fa48("94628", "94629"), status !== ReplicaStatus.FAILED)));
        }
      }));
    }
  } /**
    * Wait for replica to become non-learner and routable.
    * @param {string} replicaId - Replica ID.
    * @param {string} partitionId - Partition ID.
    * @return {Promise<void>}
    * @private
    */
  async waitForVoterReadyActivation(replicaId, partitionId) {
    if (stryMutAct_9fa48("94630")) {
      {}
    } else {
      stryCov_9fa48("94630");
      this.logger.info(REPLICA_HANDLER_LOG_MSG.WAITING_VOTER_READY, stryMutAct_9fa48("94631") ? {} : (stryCov_9fa48("94631"), {
        replicaId,
        partitionId,
        timeoutMs: this.syncTimeoutMs,
        nodeId: this.nodeId
      }));
      this.throwIfShuttingDown();
      const deadline = stryMutAct_9fa48("94632") ? Date.now() - this.syncTimeoutMs : (stryCov_9fa48("94632"), Date.now() + this.syncTimeoutMs);
      while (stryMutAct_9fa48("94635") ? Date.now() > deadline : stryMutAct_9fa48("94634") ? Date.now() < deadline : stryMutAct_9fa48("94633") ? false : (stryCov_9fa48("94633", "94634", "94635"), Date.now() <= deadline)) {
        if (stryMutAct_9fa48("94636")) {
          {}
        } else {
          stryCov_9fa48("94636");
          this.throwIfShuttingDown();
          if (stryMutAct_9fa48("94638") ? false : stryMutAct_9fa48("94637") ? true : (stryCov_9fa48("94637", "94638"), this.isReplicaVoterReady(replicaId))) {
            if (stryMutAct_9fa48("94639")) {
              {}
            } else {
              stryCov_9fa48("94639");
              this.logger.info(REPLICA_HANDLER_LOG_MSG.VOTER_READY_ACTIVATED, stryMutAct_9fa48("94640") ? {} : (stryCov_9fa48("94640"), {
                replicaId,
                partitionId,
                nodeId: this.nodeId
              }));
              return;
            }
          }
          await new Promise(resolve => {
            if (stryMutAct_9fa48("94641")) {
              {}
            } else {
              stryCov_9fa48("94641");
              setTimeout(resolve, VOTER_READY_CHECK_INTERVAL_MS);
            }
          });
        }
      }
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.VOTER_READY_TIMEOUT, stryMutAct_9fa48("94642") ? {} : (stryCov_9fa48("94642"), {
        replicaId,
        partitionId,
        timeoutMs: this.syncTimeoutMs,
        nodeId: this.nodeId
      }));
      throw new Error(stryMutAct_9fa48("94643") ? `` : (stryCov_9fa48("94643"), `Replica ${replicaId} did not become voter-ready within ${this.syncTimeoutMs}ms`));
    }
  } /**
    * Check if a local replica is voter-ready and routable.
    * @param {string} replicaId - Replica ID.
    * @return {boolean} True when replica is non-learner with routable address.
    * @private
    */
  isReplicaVoterReady(replicaId) {
    if (stryMutAct_9fa48("94644")) {
      {}
    } else {
      stryCov_9fa48("94644");
      const normalizedRole = this.getTrackedReplicaRole(replicaId);
      if (stryMutAct_9fa48("94647") ? !normalizedRole && normalizedRole === RAFT_ROLE.LEARNER : stryMutAct_9fa48("94646") ? false : stryMutAct_9fa48("94645") ? true : (stryCov_9fa48("94645", "94646", "94647"), (stryMutAct_9fa48("94648") ? normalizedRole : (stryCov_9fa48("94648"), !normalizedRole)) || (stryMutAct_9fa48("94650") ? normalizedRole !== RAFT_ROLE.LEARNER : stryMutAct_9fa48("94649") ? false : (stryCov_9fa48("94649", "94650"), normalizedRole === RAFT_ROLE.LEARNER)))) {
        if (stryMutAct_9fa48("94651")) {
          {}
        } else {
          stryCov_9fa48("94651");
          return stryMutAct_9fa48("94652") ? true : (stryCov_9fa48("94652"), false);
        }
      }
      const serviceRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      if (stryMutAct_9fa48("94655") ? !serviceRow && !serviceRow.address : stryMutAct_9fa48("94654") ? false : stryMutAct_9fa48("94653") ? true : (stryCov_9fa48("94653", "94654", "94655"), (stryMutAct_9fa48("94656") ? serviceRow : (stryCov_9fa48("94656"), !serviceRow)) || (stryMutAct_9fa48("94657") ? serviceRow.address : (stryCov_9fa48("94657"), !serviceRow.address)))) {
        if (stryMutAct_9fa48("94658")) {
          {}
        } else {
          stryCov_9fa48("94658");
          return stryMutAct_9fa48("94659") ? true : (stryCov_9fa48("94659"), false);
        }
      }
      if (stryMutAct_9fa48("94662") ? (serviceRow.status === ReplicaStatus.FAILED || serviceRow.status === ReplicaStatus.REMOVING) && serviceRow.status === ReplicaStatus.REMOVED : stryMutAct_9fa48("94661") ? false : stryMutAct_9fa48("94660") ? true : (stryCov_9fa48("94660", "94661", "94662"), (stryMutAct_9fa48("94664") ? serviceRow.status === ReplicaStatus.FAILED && serviceRow.status === ReplicaStatus.REMOVING : stryMutAct_9fa48("94663") ? false : (stryCov_9fa48("94663", "94664"), (stryMutAct_9fa48("94666") ? serviceRow.status !== ReplicaStatus.FAILED : stryMutAct_9fa48("94665") ? false : (stryCov_9fa48("94665", "94666"), serviceRow.status === ReplicaStatus.FAILED)) || (stryMutAct_9fa48("94668") ? serviceRow.status !== ReplicaStatus.REMOVING : stryMutAct_9fa48("94667") ? false : (stryCov_9fa48("94667", "94668"), serviceRow.status === ReplicaStatus.REMOVING)))) || (stryMutAct_9fa48("94670") ? serviceRow.status !== ReplicaStatus.REMOVED : stryMutAct_9fa48("94669") ? false : (stryCov_9fa48("94669", "94670"), serviceRow.status === ReplicaStatus.REMOVED)))) {
        if (stryMutAct_9fa48("94671")) {
          {}
        } else {
          stryCov_9fa48("94671");
          return stryMutAct_9fa48("94672") ? true : (stryCov_9fa48("94672"), false);
        }
      }
      return stryMutAct_9fa48("94673") ? false : (stryCov_9fa48("94673"), true);
    }
  } /**
    * Update replica operation workflow step via CDC.
    * @param {string} operationId - Operation ID.
    * @param {string} workflowStep - Workflow step name.
    * @param {Object} [options={}] - Optional data for updates.
    * @param {string} [options.replicaId] - Replica ID to set if missing.
    * @param {string} [options.errorMessage] - Error message for failures.
    * @return {Promise<void>}
    * @private
    */ /**
       * Emit a typed executor outcome instead of writing to
       * replica_operations directly. The coordinator consumes these
       * outcomes through the owner-key reconcile queue.
       *
       * @param {string} outcomeType - EXECUTOR_OUTCOME_TYPE value.
       * @param {string} operationId - Replica operation ID.
       * @param {string} workflowStep - WORKFLOW_STEP the executor reached.
       * @param {Object} [options] - Optional replicaId, errorMessage.
       */
  emitExecutorOutcome(outcomeType, operationId, workflowStep, options = {}) {
    if (stryMutAct_9fa48("94674")) {
      {}
    } else {
      stryCov_9fa48("94674");
      if (stryMutAct_9fa48("94676") ? false : stryMutAct_9fa48("94675") ? true : (stryCov_9fa48("94675", "94676"), this.executorOutcomeEmitter)) {
        if (stryMutAct_9fa48("94677")) {
          {}
        } else {
          stryCov_9fa48("94677");
          this.executorOutcomeEmitter.emitOutcome(outcomeType, operationId, workflowStep, options);
        }
      }
    }
  } /**
    * Resolve replica context with retry for transient metadata propagation lag.
    * @param {string} partitionId - Partition ID.
    * @param {string} replicaId - Replica ID.
    * @return {Promise<Object>} Resolved metadata.
    * @private
    */
  async resolveReplicaContextWithRetry(partitionId, replicaId, options = {}) {
    if (stryMutAct_9fa48("94678")) {
      {}
    } else {
      stryCov_9fa48("94678");
      this.throwIfShuttingDown();
      const deadline = stryMutAct_9fa48("94679") ? Date.now() - this.syncTimeoutMs : (stryCov_9fa48("94679"), Date.now() + this.syncTimeoutMs);
      let metadataWaitLogged = stryMutAct_9fa48("94680") ? true : (stryCov_9fa48("94680"), false);
      let lastError = null;
      let metadataHydrationCount = NUM.ZERO;
      while (stryMutAct_9fa48("94683") ? Date.now() > deadline : stryMutAct_9fa48("94682") ? Date.now() < deadline : stryMutAct_9fa48("94681") ? false : (stryCov_9fa48("94681", "94682", "94683"), Date.now() <= deadline)) {
        if (stryMutAct_9fa48("94684")) {
          {}
        } else {
          stryCov_9fa48("94684");
          this.throwIfShuttingDown();
          try {
            if (stryMutAct_9fa48("94685")) {
              {}
            } else {
              stryCov_9fa48("94685");
              const context = this.resolveReplicaContext(partitionId, replicaId, options);
              this.clearHydratedMetadataSnapshot(partitionId);
              return context;
            }
          } catch (error) {
            if (stryMutAct_9fa48("94686")) {
              {}
            } else {
              stryCov_9fa48("94686");
              if (stryMutAct_9fa48("94689") ? false : stryMutAct_9fa48("94688") ? true : stryMutAct_9fa48("94687") ? this.isTransientMetadataResolutionError(error) : (stryCov_9fa48("94687", "94688", "94689"), !this.isTransientMetadataResolutionError(error))) {
                if (stryMutAct_9fa48("94690")) {
                  {}
                } else {
                  stryCov_9fa48("94690");
                  this.clearHydratedMetadataSnapshot(partitionId);
                  throw error;
                }
              }
              lastError = error;
              stryMutAct_9fa48("94691") ? metadataHydrationCount -= await this.hydrateMetadataFromAuthority(partitionId) : (stryCov_9fa48("94691"), metadataHydrationCount += await this.hydrateMetadataFromAuthority(partitionId));
              if (stryMutAct_9fa48("94694") ? false : stryMutAct_9fa48("94693") ? true : stryMutAct_9fa48("94692") ? metadataWaitLogged : (stryCov_9fa48("94692", "94693", "94694"), !metadataWaitLogged)) {
                if (stryMutAct_9fa48("94695")) {
                  {}
                } else {
                  stryCov_9fa48("94695");
                  this.logger.info(REPLICA_HANDLER_LOG_MSG.WAITING_METADATA_PROPAGATION, stryMutAct_9fa48("94696") ? {} : (stryCov_9fa48("94696"), {
                    partitionId,
                    replicaId,
                    timeoutMs: this.syncTimeoutMs,
                    hydratedRows: metadataHydrationCount,
                    nodeId: this.nodeId
                  }));
                  metadataWaitLogged = stryMutAct_9fa48("94697") ? false : (stryCov_9fa48("94697"), true);
                }
              }
            }
          }
          await new Promise(resolve => {
            if (stryMutAct_9fa48("94698")) {
              {}
            } else {
              stryCov_9fa48("94698");
              setTimeout(resolve, METADATA_RESOLUTION_POLL_INTERVAL_MS);
            }
          });
        }
      }
      this.clearHydratedMetadataSnapshot(partitionId);
      throw stryMutAct_9fa48("94701") ? lastError && new Error(partitionMetadataMissingError(partitionId)) : stryMutAct_9fa48("94700") ? false : stryMutAct_9fa48("94699") ? true : (stryCov_9fa48("94699", "94700", "94701"), lastError || new Error(partitionMetadataMissingError(partitionId)));
    }
  } /**
    * Check whether replica context resolution error can be retried.
    * @param {Error} error - Resolution error.
    * @return {boolean} True when error is a transient metadata visibility miss.
    * @private
    */
  isTransientMetadataResolutionError(error) {
    if (stryMutAct_9fa48("94702")) {
      {}
    } else {
      stryCov_9fa48("94702");
      const message = (stryMutAct_9fa48("94705") ? typeof error?.message !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94704") ? false : stryMutAct_9fa48("94703") ? true : (stryCov_9fa48("94703", "94704", "94705"), typeof (stryMutAct_9fa48("94706") ? error.message : (stryCov_9fa48("94706"), error?.message)) === REPLICA_HANDLER_TYPEOF.STRING)) ? error.message : stryMutAct_9fa48("94707") ? "Stryker was here!" : (stryCov_9fa48("94707"), '');
      return stryMutAct_9fa48("94710") ? message.startsWith(PARTITION_METADATA_MISSING_PREFIX) && message.startsWith(TABLE_METADATA_MISSING_PREFIX) : stryMutAct_9fa48("94709") ? false : stryMutAct_9fa48("94708") ? true : (stryCov_9fa48("94708", "94709", "94710"), (stryMutAct_9fa48("94711") ? message.endsWith(PARTITION_METADATA_MISSING_PREFIX) : (stryCov_9fa48("94711"), message.startsWith(PARTITION_METADATA_MISSING_PREFIX))) || (stryMutAct_9fa48("94712") ? message.endsWith(TABLE_METADATA_MISSING_PREFIX) : (stryCov_9fa48("94712"), message.startsWith(TABLE_METADATA_MISSING_PREFIX))));
    }
  } /**
    * Resolve replica metadata from the system table cache.
    * @param {string} partitionId - Partition ID.
    * @param {string} replicaId - Replica ID.
    * @return {Object} Resolved metadata.
    * @private
    */
  resolveReplicaContext(partitionId, replicaId, options = {}) {
    if (stryMutAct_9fa48("94713")) {
      {}
    } else {
      stryCov_9fa48("94713");
      if (stryMutAct_9fa48("94716") ? false : stryMutAct_9fa48("94715") ? true : stryMutAct_9fa48("94714") ? this.systemTableCache : (stryCov_9fa48("94714", "94715", "94716"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("94717")) {
          {}
        } else {
          stryCov_9fa48("94717");
          throw new Error(REPLICA_HANDLER_ERROR_MSG.CACHE_NOT_AVAILABLE);
        }
      }
      if (stryMutAct_9fa48("94720") ? typeof this.systemTableCache.filter === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94719") ? false : stryMutAct_9fa48("94718") ? true : (stryCov_9fa48("94718", "94719", "94720"), typeof this.systemTableCache.filter !== REPLICA_HANDLER_TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("94721")) {
          {}
        } else {
          stryCov_9fa48("94721");
          throw new Error(REPLICA_HANDLER_ERROR_MSG.CACHE_MISSING_FILTER);
        }
      }
      const payloadPartition = this.normalizeBootstrapPartitionMetadata(partitionId, options.bootstrapPartitionMetadata);
      const payloadTable = this.normalizeBootstrapTableMetadata(stryMutAct_9fa48("94724") ? payloadPartition?.table_id && null : stryMutAct_9fa48("94723") ? false : stryMutAct_9fa48("94722") ? true : (stryCov_9fa48("94722", "94723", "94724"), (stryMutAct_9fa48("94725") ? payloadPartition.table_id : (stryCov_9fa48("94725"), payloadPartition?.table_id)) || null), options.bootstrapTableMetadata);
      const hydratedMetadata = this.getHydratedMetadataSnapshot(partitionId);
      const partition = stryMutAct_9fa48("94728") ? (this.systemTableCache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) || payloadPartition || hydratedMetadata?.partitionRow) && null : stryMutAct_9fa48("94727") ? false : stryMutAct_9fa48("94726") ? true : (stryCov_9fa48("94726", "94727", "94728"), (stryMutAct_9fa48("94730") ? (this.systemTableCache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) || payloadPartition) && hydratedMetadata?.partitionRow : stryMutAct_9fa48("94729") ? false : (stryCov_9fa48("94729", "94730"), (stryMutAct_9fa48("94732") ? this.systemTableCache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) && payloadPartition : stryMutAct_9fa48("94731") ? false : (stryCov_9fa48("94731", "94732"), this.systemTableCache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) || payloadPartition)) || (stryMutAct_9fa48("94733") ? hydratedMetadata.partitionRow : (stryCov_9fa48("94733"), hydratedMetadata?.partitionRow)))) || null);
      if (stryMutAct_9fa48("94736") ? false : stryMutAct_9fa48("94735") ? true : stryMutAct_9fa48("94734") ? partition : (stryCov_9fa48("94734", "94735", "94736"), !partition)) {
        if (stryMutAct_9fa48("94737")) {
          {}
        } else {
          stryCov_9fa48("94737");
          const partitionMetadataMissing = REPLICA_HANDLER_ERROR_MSG.PARTITION_METADATA_MISSING;
          throw new Error(partitionMetadataMissing(partitionId));
        }
      }
      const table = stryMutAct_9fa48("94740") ? (this.systemTableCache.get(SYSTEM_TABLE_NAME.TABLES, partition.table_id) || payloadTable || hydratedMetadata?.tableRow) && null : stryMutAct_9fa48("94739") ? false : stryMutAct_9fa48("94738") ? true : (stryCov_9fa48("94738", "94739", "94740"), (stryMutAct_9fa48("94742") ? (this.systemTableCache.get(SYSTEM_TABLE_NAME.TABLES, partition.table_id) || payloadTable) && hydratedMetadata?.tableRow : stryMutAct_9fa48("94741") ? false : (stryCov_9fa48("94741", "94742"), (stryMutAct_9fa48("94744") ? this.systemTableCache.get(SYSTEM_TABLE_NAME.TABLES, partition.table_id) && payloadTable : stryMutAct_9fa48("94743") ? false : (stryCov_9fa48("94743", "94744"), this.systemTableCache.get(SYSTEM_TABLE_NAME.TABLES, partition.table_id) || payloadTable)) || (stryMutAct_9fa48("94745") ? hydratedMetadata.tableRow : (stryCov_9fa48("94745"), hydratedMetadata?.tableRow)))) || null);
      if (stryMutAct_9fa48("94748") ? false : stryMutAct_9fa48("94747") ? true : stryMutAct_9fa48("94746") ? table : (stryCov_9fa48("94746", "94747", "94748"), !table)) {
        if (stryMutAct_9fa48("94749")) {
          {}
        } else {
          stryCov_9fa48("94749");
          const tableMetadataMissing = REPLICA_HANDLER_ERROR_MSG.TABLE_METADATA_MISSING;
          throw new Error(tableMetadataMissing(partition.table_id));
        }
      }
      let schema = null;
      try {
        if (stryMutAct_9fa48("94750")) {
          {}
        } else {
          stryCov_9fa48("94750");
          schema = (stryMutAct_9fa48("94753") ? typeof table.schema_definition !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94752") ? false : stryMutAct_9fa48("94751") ? true : (stryCov_9fa48("94751", "94752", "94753"), typeof table.schema_definition === REPLICA_HANDLER_TYPEOF.STRING)) ? JSON.parse(table.schema_definition) : table.schema_definition;
        }
      } catch (error) {
        if (stryMutAct_9fa48("94754")) {
          {}
        } else {
          stryCov_9fa48("94754");
          const schemaParseFailed = REPLICA_HANDLER_ERROR_MSG.SCHEMA_PARSE_FAILED;
          throw new Error(schemaParseFailed(error.message));
        }
      }
      const keyRange = stryMutAct_9fa48("94755") ? {} : (stryCov_9fa48("94755"), {
        start: stryMutAct_9fa48("94758") ? partition.partition_key_start && null : stryMutAct_9fa48("94757") ? false : stryMutAct_9fa48("94756") ? true : (stryCov_9fa48("94756", "94757", "94758"), partition.partition_key_start || null),
        end: stryMutAct_9fa48("94761") ? partition.partition_key_end && null : stryMutAct_9fa48("94760") ? false : stryMutAct_9fa48("94759") ? true : (stryCov_9fa48("94759", "94760", "94761"), partition.partition_key_end || null)
      });
      const cachedServices = stryMutAct_9fa48("94762") ? this.systemTableCache : (stryCov_9fa48("94762"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, stryMutAct_9fa48("94763") ? () => undefined : (stryCov_9fa48("94763"), service => stryMutAct_9fa48("94766") ? service.partition_id === partitionId || service.service_type === REPLICA_HANDLER_SERVICE.TYPE : stryMutAct_9fa48("94765") ? false : stryMutAct_9fa48("94764") ? true : (stryCov_9fa48("94764", "94765", "94766"), (stryMutAct_9fa48("94768") ? service.partition_id !== partitionId : stryMutAct_9fa48("94767") ? true : (stryCov_9fa48("94767", "94768"), service.partition_id === partitionId)) && (stryMutAct_9fa48("94770") ? service.service_type !== REPLICA_HANDLER_SERVICE.TYPE : stryMutAct_9fa48("94769") ? true : (stryCov_9fa48("94769", "94770"), service.service_type === REPLICA_HANDLER_SERVICE.TYPE))))));
      const services = this.mergeHydratedServices(cachedServices, stryMutAct_9fa48("94773") ? hydratedMetadata?.serviceRows && [] : stryMutAct_9fa48("94772") ? false : stryMutAct_9fa48("94771") ? true : (stryCov_9fa48("94771", "94772", "94773"), (stryMutAct_9fa48("94774") ? hydratedMetadata.serviceRows : (stryCov_9fa48("94774"), hydratedMetadata?.serviceRows)) || (stryMutAct_9fa48("94775") ? ["Stryker was here"] : (stryCov_9fa48("94775"), []))));
      const now = Date.now();
      const addressManager = AddressManager.getInstance();
      const replicaIds = stryMutAct_9fa48("94776") ? ["Stryker was here"] : (stryCov_9fa48("94776"), []);
      const peerAddresses = stryMutAct_9fa48("94777") ? ["Stryker was here"] : (stryCov_9fa48("94777"), []);
      const seenReplicaIds = new Set();
      const requestedReplicaIds = Array.isArray(options.bootstrapReplicaIds) ? stryMutAct_9fa48("94778") ? options.bootstrapReplicaIds : (stryCov_9fa48("94778"), options.bootstrapReplicaIds.filter(stryMutAct_9fa48("94779") ? () => undefined : (stryCov_9fa48("94779"), value => stryMutAct_9fa48("94782") ? typeof value === REPLICA_HANDLER_TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("94781") ? false : stryMutAct_9fa48("94780") ? true : (stryCov_9fa48("94780", "94781", "94782"), (stryMutAct_9fa48("94784") ? typeof value !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94783") ? true : (stryCov_9fa48("94783", "94784"), typeof value === REPLICA_HANDLER_TYPEOF.STRING)) && (stryMutAct_9fa48("94787") ? value.length <= NUM.ZERO : stryMutAct_9fa48("94786") ? value.length >= NUM.ZERO : stryMutAct_9fa48("94785") ? true : (stryCov_9fa48("94785", "94786", "94787"), value.length > NUM.ZERO)))))) : stryMutAct_9fa48("94788") ? ["Stryker was here"] : (stryCov_9fa48("94788"), []);
      const requestedPeerAddresses = Array.isArray(options.bootstrapPeerAddresses) ? stryMutAct_9fa48("94789") ? options.bootstrapPeerAddresses : (stryCov_9fa48("94789"), options.bootstrapPeerAddresses.filter(stryMutAct_9fa48("94790") ? () => undefined : (stryCov_9fa48("94790"), value => stryMutAct_9fa48("94793") ? typeof value === REPLICA_HANDLER_TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("94792") ? false : stryMutAct_9fa48("94791") ? true : (stryCov_9fa48("94791", "94792", "94793"), (stryMutAct_9fa48("94795") ? typeof value !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94794") ? true : (stryCov_9fa48("94794", "94795"), typeof value === REPLICA_HANDLER_TYPEOF.STRING)) && (stryMutAct_9fa48("94798") ? value.length <= NUM.ZERO : stryMutAct_9fa48("94797") ? value.length >= NUM.ZERO : stryMutAct_9fa48("94796") ? true : (stryCov_9fa48("94796", "94797", "94798"), value.length > NUM.ZERO)))))) : stryMutAct_9fa48("94799") ? ["Stryker was here"] : (stryCov_9fa48("94799"), []); // Count only established voters from sibling services. Freshly staged
      // rows in pending/creating/syncing states do not imply an existing group.
      const establishedExistingReplicaIds = new Set();
      const isViableJoinService = service => {
        if (stryMutAct_9fa48("94800")) {
          {}
        } else {
          stryCov_9fa48("94800");
          if (stryMutAct_9fa48("94803") ? !service?.node_id && typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94802") ? false : stryMutAct_9fa48("94801") ? true : (stryCov_9fa48("94801", "94802", "94803"), (stryMutAct_9fa48("94804") ? service?.node_id : (stryCov_9fa48("94804"), !(stryMutAct_9fa48("94805") ? service.node_id : (stryCov_9fa48("94805"), service?.node_id)))) || (stryMutAct_9fa48("94807") ? typeof this.systemTableCache.get === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("94806") ? false : (stryCov_9fa48("94806", "94807"), typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("94808")) {
              {}
            } else {
              stryCov_9fa48("94808");
              return stryMutAct_9fa48("94809") ? false : (stryCov_9fa48("94809"), true);
            }
          }
          return isReplicaJoinNodeViable(this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, service.node_id), stryMutAct_9fa48("94810") ? {} : (stryCov_9fa48("94810"), {
            now
          }));
        }
      };
      for (const service of services) {
        if (stryMutAct_9fa48("94811")) {
          {}
        } else {
          stryCov_9fa48("94811");
          const serviceReplicaId = stryMutAct_9fa48("94814") ? service.service_id && service.replica_id : stryMutAct_9fa48("94813") ? false : stryMutAct_9fa48("94812") ? true : (stryCov_9fa48("94812", "94813", "94814"), service.service_id || service.replica_id);
          if (stryMutAct_9fa48("94817") ? false : stryMutAct_9fa48("94816") ? true : stryMutAct_9fa48("94815") ? serviceReplicaId : (stryCov_9fa48("94815", "94816", "94817"), !serviceReplicaId)) {
            if (stryMutAct_9fa48("94818")) {
              {}
            } else {
              stryCov_9fa48("94818");
              continue;
            }
          }
          if (stryMutAct_9fa48("94821") ? false : stryMutAct_9fa48("94820") ? true : stryMutAct_9fa48("94819") ? seenReplicaIds.has(serviceReplicaId) : (stryCov_9fa48("94819", "94820", "94821"), !seenReplicaIds.has(serviceReplicaId))) {
            if (stryMutAct_9fa48("94822")) {
              {}
            } else {
              stryCov_9fa48("94822");
              seenReplicaIds.add(serviceReplicaId);
              replicaIds.push(serviceReplicaId);
            }
          }
          const isEstablishedVoter = stryMutAct_9fa48("94825") ? service.status === ReplicaStatus.ACTIVE || ESTABLISHED_VOTER_ROLES.has(service.raft_role) : stryMutAct_9fa48("94824") ? false : stryMutAct_9fa48("94823") ? true : (stryCov_9fa48("94823", "94824", "94825"), (stryMutAct_9fa48("94827") ? service.status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("94826") ? true : (stryCov_9fa48("94826", "94827"), service.status === ReplicaStatus.ACTIVE)) && ESTABLISHED_VOTER_ROLES.has(service.raft_role));
          if (stryMutAct_9fa48("94830") ? serviceReplicaId !== replicaId && isEstablishedVoter || isViableJoinService(service) : stryMutAct_9fa48("94829") ? false : stryMutAct_9fa48("94828") ? true : (stryCov_9fa48("94828", "94829", "94830"), (stryMutAct_9fa48("94832") ? serviceReplicaId !== replicaId || isEstablishedVoter : stryMutAct_9fa48("94831") ? true : (stryCov_9fa48("94831", "94832"), (stryMutAct_9fa48("94834") ? serviceReplicaId === replicaId : stryMutAct_9fa48("94833") ? true : (stryCov_9fa48("94833", "94834"), serviceReplicaId !== replicaId)) && isEstablishedVoter)) && isViableJoinService(service))) {
            if (stryMutAct_9fa48("94835")) {
              {}
            } else {
              stryCov_9fa48("94835");
              establishedExistingReplicaIds.add(serviceReplicaId);
            }
          }
          const peerAddress = stryMutAct_9fa48("94838") ? service.address && addressManager.format(service.node_id, REPLICA_HANDLER_SERVICE.TYPE, serviceReplicaId) : stryMutAct_9fa48("94837") ? false : stryMutAct_9fa48("94836") ? true : (stryCov_9fa48("94836", "94837", "94838"), service.address || addressManager.format(service.node_id, REPLICA_HANDLER_SERVICE.TYPE, serviceReplicaId));
          if (stryMutAct_9fa48("94841") ? false : stryMutAct_9fa48("94840") ? true : stryMutAct_9fa48("94839") ? peerAddresses.includes(peerAddress) : (stryCov_9fa48("94839", "94840", "94841"), !peerAddresses.includes(peerAddress))) {
            if (stryMutAct_9fa48("94842")) {
              {}
            } else {
              stryCov_9fa48("94842");
              peerAddresses.push(peerAddress);
            }
          }
        }
      }
      if (stryMutAct_9fa48("94845") ? replicaId || !seenReplicaIds.has(replicaId) : stryMutAct_9fa48("94844") ? false : stryMutAct_9fa48("94843") ? true : (stryCov_9fa48("94843", "94844", "94845"), replicaId && (stryMutAct_9fa48("94846") ? seenReplicaIds.has(replicaId) : (stryCov_9fa48("94846"), !seenReplicaIds.has(replicaId))))) {
        if (stryMutAct_9fa48("94847")) {
          {}
        } else {
          stryCov_9fa48("94847");
          replicaIds.push(replicaId);
          seenReplicaIds.add(replicaId);
          const selfAddress = addressManager.format(this.nodeId, REPLICA_HANDLER_SERVICE.TYPE, replicaId);
          if (stryMutAct_9fa48("94850") ? false : stryMutAct_9fa48("94849") ? true : stryMutAct_9fa48("94848") ? peerAddresses.includes(selfAddress) : (stryCov_9fa48("94848", "94849", "94850"), !peerAddresses.includes(selfAddress))) {
            if (stryMutAct_9fa48("94851")) {
              {}
            } else {
              stryCov_9fa48("94851");
              peerAddresses.push(selfAddress);
            }
          }
        }
      }
      let leaderAddress = null;
      const canonicalLeaderNodeId = (stryMutAct_9fa48("94854") ? typeof partition.leader_node_id === 'string' || partition.leader_node_id.length > 0 : stryMutAct_9fa48("94853") ? false : stryMutAct_9fa48("94852") ? true : (stryCov_9fa48("94852", "94853", "94854"), (stryMutAct_9fa48("94856") ? typeof partition.leader_node_id !== 'string' : stryMutAct_9fa48("94855") ? true : (stryCov_9fa48("94855", "94856"), typeof partition.leader_node_id === (stryMutAct_9fa48("94857") ? "" : (stryCov_9fa48("94857"), 'string')))) && (stryMutAct_9fa48("94860") ? partition.leader_node_id.length <= 0 : stryMutAct_9fa48("94859") ? partition.leader_node_id.length >= 0 : stryMutAct_9fa48("94858") ? true : (stryCov_9fa48("94858", "94859", "94860"), partition.leader_node_id.length > 0)))) ? partition.leader_node_id : null;
      const leaderService = canonicalLeaderNodeId ? services.find(stryMutAct_9fa48("94861") ? () => undefined : (stryCov_9fa48("94861"), service => stryMutAct_9fa48("94864") ? service.node_id === canonicalLeaderNodeId && service.status === ReplicaStatus.ACTIVE || isViableJoinService(service) : stryMutAct_9fa48("94863") ? false : stryMutAct_9fa48("94862") ? true : (stryCov_9fa48("94862", "94863", "94864"), (stryMutAct_9fa48("94866") ? service.node_id === canonicalLeaderNodeId || service.status === ReplicaStatus.ACTIVE : stryMutAct_9fa48("94865") ? true : (stryCov_9fa48("94865", "94866"), (stryMutAct_9fa48("94868") ? service.node_id !== canonicalLeaderNodeId : stryMutAct_9fa48("94867") ? true : (stryCov_9fa48("94867", "94868"), service.node_id === canonicalLeaderNodeId)) && (stryMutAct_9fa48("94870") ? service.status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("94869") ? true : (stryCov_9fa48("94869", "94870"), service.status === ReplicaStatus.ACTIVE)))) && isViableJoinService(service)))) : null;
      const isFreshBootstrapPartition = isFreshPartitionBootstrapWindow(partition);
      if (stryMutAct_9fa48("94872") ? false : stryMutAct_9fa48("94871") ? true : (stryCov_9fa48("94871", "94872"), isFreshBootstrapPartition)) {
        if (stryMutAct_9fa48("94873")) {
          {}
        } else {
          stryCov_9fa48("94873");
          for (const requestedReplicaId of requestedReplicaIds) {
            if (stryMutAct_9fa48("94874")) {
              {}
            } else {
              stryCov_9fa48("94874");
              if (stryMutAct_9fa48("94877") ? false : stryMutAct_9fa48("94876") ? true : stryMutAct_9fa48("94875") ? seenReplicaIds.has(requestedReplicaId) : (stryCov_9fa48("94875", "94876", "94877"), !seenReplicaIds.has(requestedReplicaId))) {
                if (stryMutAct_9fa48("94878")) {
                  {}
                } else {
                  stryCov_9fa48("94878");
                  seenReplicaIds.add(requestedReplicaId);
                  replicaIds.push(requestedReplicaId);
                }
              }
            }
          }
          for (const requestedPeerAddress of requestedPeerAddresses) {
            if (stryMutAct_9fa48("94879")) {
              {}
            } else {
              stryCov_9fa48("94879");
              if (stryMutAct_9fa48("94882") ? false : stryMutAct_9fa48("94881") ? true : stryMutAct_9fa48("94880") ? peerAddresses.includes(requestedPeerAddress) : (stryCov_9fa48("94880", "94881", "94882"), !peerAddresses.includes(requestedPeerAddress))) {
                if (stryMutAct_9fa48("94883")) {
                  {}
                } else {
                  stryCov_9fa48("94883");
                  peerAddresses.push(requestedPeerAddress);
                }
              }
            }
          }
        }
      } // Fresh CREATE TABLE provisioning dispatches replica creation before the
      // partition row has a persisted leader_node_id. A single sibling leader
      // must not force later members of that first cohort into learner mode.
      const hasViableLeader = stryMutAct_9fa48("94886") ? !isFreshBootstrapPartition || Boolean(leaderService) : stryMutAct_9fa48("94885") ? false : stryMutAct_9fa48("94884") ? true : (stryCov_9fa48("94884", "94885", "94886"), (stryMutAct_9fa48("94887") ? isFreshBootstrapPartition : (stryCov_9fa48("94887"), !isFreshBootstrapPartition)) && Boolean(leaderService));
      if (stryMutAct_9fa48("94889") ? false : stryMutAct_9fa48("94888") ? true : (stryCov_9fa48("94888", "94889"), leaderService)) {
        if (stryMutAct_9fa48("94890")) {
          {}
        } else {
          stryCov_9fa48("94890");
          leaderAddress = stryMutAct_9fa48("94893") ? leaderService.address && addressManager.format(leaderService.node_id, REPLICA_HANDLER_SERVICE.TYPE, leaderService.service_id) : stryMutAct_9fa48("94892") ? false : stryMutAct_9fa48("94891") ? true : (stryCov_9fa48("94891", "94892", "94893"), leaderService.address || addressManager.format(leaderService.node_id, REPLICA_HANDLER_SERVICE.TYPE, leaderService.service_id));
        }
      }
      return stryMutAct_9fa48("94894") ? {} : (stryCov_9fa48("94894"), {
        tableId: partition.table_id,
        tableName: table.table_name,
        schema,
        keyRange,
        leaderAddress,
        replicaIds,
        peerAddresses,
        existingReplicaCount: isFreshBootstrapPartition ? NUM.ZERO : hasViableLeader ? stryMutAct_9fa48("94895") ? Math.min(NUM.ONE, establishedExistingReplicaIds.size) : (stryCov_9fa48("94895"), Math.max(NUM.ONE, establishedExistingReplicaIds.size)) : NUM.ZERO
      });
    }
  } /**
    * Hydrate replica metadata from authoritative system-table SQL queries.
    * This covers cases where local cache propagation lags behind the operation.
    * @param {string} partitionId - Partition ID.
    * @return {Promise<number>} Number of hydrated rows.
    * @private
    */
  async hydrateMetadataFromAuthority(partitionId) {
    if (stryMutAct_9fa48("94896")) {
      {}
    } else {
      stryCov_9fa48("94896");
      if (stryMutAct_9fa48("94899") ? (!partitionId || typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING) && partitionId.length === NUM.ZERO : stryMutAct_9fa48("94898") ? false : stryMutAct_9fa48("94897") ? true : (stryCov_9fa48("94897", "94898", "94899"), (stryMutAct_9fa48("94901") ? !partitionId && typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94900") ? false : (stryCov_9fa48("94900", "94901"), (stryMutAct_9fa48("94902") ? partitionId : (stryCov_9fa48("94902"), !partitionId)) || (stryMutAct_9fa48("94904") ? typeof partitionId === REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94903") ? false : (stryCov_9fa48("94903", "94904"), typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING)))) || (stryMutAct_9fa48("94906") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("94905") ? false : (stryCov_9fa48("94905", "94906"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("94907")) {
          {}
        } else {
          stryCov_9fa48("94907");
          return NUM.ZERO;
        }
      }
      const gateway = this.getControlPlaneSystemTableGateway();
      if (stryMutAct_9fa48("94910") ? false : stryMutAct_9fa48("94909") ? true : stryMutAct_9fa48("94908") ? gateway : (stryCov_9fa48("94908", "94909", "94910"), !gateway)) {
        if (stryMutAct_9fa48("94911")) {
          {}
        } else {
          stryCov_9fa48("94911");
          return NUM.ZERO;
        }
      }
      let hydratedRows = NUM.ZERO;
      try {
        if (stryMutAct_9fa48("94912")) {
          {}
        } else {
          stryCov_9fa48("94912");
          const partitionRows = await this.querySystemTableRows(gateway, SYSTEM_TABLE_NAME.PARTITIONS, SYSTEM_TABLE_HYDRATION_SQL.PARTITION_BY_ID, stryMutAct_9fa48("94913") ? [] : (stryCov_9fa48("94913"), [partitionId]));
          const partitionRow = stryMutAct_9fa48("94916") ? partitionRows[NUM.ZERO] && null : stryMutAct_9fa48("94915") ? false : stryMutAct_9fa48("94914") ? true : (stryCov_9fa48("94914", "94915", "94916"), partitionRows[NUM.ZERO] || null);
          const tableId = stryMutAct_9fa48("94919") ? partitionRow?.table_id && null : stryMutAct_9fa48("94918") ? false : stryMutAct_9fa48("94917") ? true : (stryCov_9fa48("94917", "94918", "94919"), (stryMutAct_9fa48("94920") ? partitionRow.table_id : (stryCov_9fa48("94920"), partitionRow?.table_id)) || null);
          let tableRow = null;
          if (stryMutAct_9fa48("94923") ? typeof tableId === REPLICA_HANDLER_TYPEOF.STRING || tableId.length > NUM.ZERO : stryMutAct_9fa48("94922") ? false : stryMutAct_9fa48("94921") ? true : (stryCov_9fa48("94921", "94922", "94923"), (stryMutAct_9fa48("94925") ? typeof tableId !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94924") ? true : (stryCov_9fa48("94924", "94925"), typeof tableId === REPLICA_HANDLER_TYPEOF.STRING)) && (stryMutAct_9fa48("94928") ? tableId.length <= NUM.ZERO : stryMutAct_9fa48("94927") ? tableId.length >= NUM.ZERO : stryMutAct_9fa48("94926") ? true : (stryCov_9fa48("94926", "94927", "94928"), tableId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("94929")) {
              {}
            } else {
              stryCov_9fa48("94929");
              const tableRows = await this.querySystemTableRows(gateway, SYSTEM_TABLE_NAME.TABLES, SYSTEM_TABLE_HYDRATION_SQL.TABLE_BY_ID, stryMutAct_9fa48("94930") ? [] : (stryCov_9fa48("94930"), [tableId]));
              tableRow = stryMutAct_9fa48("94933") ? tableRows[NUM.ZERO] && null : stryMutAct_9fa48("94932") ? false : stryMutAct_9fa48("94931") ? true : (stryCov_9fa48("94931", "94932", "94933"), tableRows[NUM.ZERO] || null);
            }
          }
          const serviceRows = await this.querySystemTableRows(gateway, SYSTEM_TABLE_NAME.SERVICES, SYSTEM_TABLE_HYDRATION_SQL.PARTITION_SERVICES, stryMutAct_9fa48("94934") ? [] : (stryCov_9fa48("94934"), [partitionId, REPLICA_HANDLER_SERVICE.TYPE]));
          this.setHydratedMetadataSnapshot(partitionId, stryMutAct_9fa48("94935") ? {} : (stryCov_9fa48("94935"), {
            partitionRow,
            tableRow,
            serviceRows
          }));
          stryMutAct_9fa48("94936") ? hydratedRows -= partitionRow ? NUM.ONE : NUM.ZERO : (stryCov_9fa48("94936"), hydratedRows += partitionRow ? NUM.ONE : NUM.ZERO);
          stryMutAct_9fa48("94937") ? hydratedRows -= tableRow ? NUM.ONE : NUM.ZERO : (stryCov_9fa48("94937"), hydratedRows += tableRow ? NUM.ONE : NUM.ZERO);
          stryMutAct_9fa48("94938") ? hydratedRows -= serviceRows.length : (stryCov_9fa48("94938"), hydratedRows += serviceRows.length);
          if (stryMutAct_9fa48("94942") ? hydratedRows <= NUM.ZERO : stryMutAct_9fa48("94941") ? hydratedRows >= NUM.ZERO : stryMutAct_9fa48("94940") ? false : stryMutAct_9fa48("94939") ? true : (stryCov_9fa48("94939", "94940", "94941", "94942"), hydratedRows > NUM.ZERO)) {
            if (stryMutAct_9fa48("94943")) {
              {}
            } else {
              stryCov_9fa48("94943");
              this.logger.debug(REPLICA_HANDLER_LOG_MSG.HYDRATED_METADATA_FROM_QUERY, stryMutAct_9fa48("94944") ? {} : (stryCov_9fa48("94944"), {
                partitionId,
                hydratedRows,
                nodeId: this.nodeId
              }));
            }
          }
          return hydratedRows;
        }
      } catch (error) {
        if (stryMutAct_9fa48("94945")) {
          {}
        } else {
          stryCov_9fa48("94945");
          this.logger.debug(REPLICA_HANDLER_LOG_MSG.METADATA_HYDRATION_QUERY_FAILED, stryMutAct_9fa48("94946") ? {} : (stryCov_9fa48("94946"), {
            partitionId,
            error: error.message,
            nodeId: this.nodeId
          }));
          return NUM.ZERO;
        }
      }
    }
  } /**
    * Apply bootstrap metadata payload rows into the local cache before context
    * resolution retries. This avoids waiting for eventual CDC visibility when
    * the coordinator already knows the canonical rows.
    * @param {Object} options
    * @param {string} options.partitionId
    * @param {Object|null} options.bootstrapTableMetadata
    * @param {Object|null} options.bootstrapPartitionMetadata
    * @return {void}
    * @private
    */
  applyBootstrapMetadataPayload(options = {}) {
    if (stryMutAct_9fa48("94947")) {
      {}
    } else {
      stryCov_9fa48("94947");
      const partitionRow = this.normalizeBootstrapPartitionMetadata(options.partitionId, options.bootstrapPartitionMetadata);
      const tableRow = this.normalizeBootstrapTableMetadata(stryMutAct_9fa48("94950") ? partitionRow?.table_id && null : stryMutAct_9fa48("94949") ? false : stryMutAct_9fa48("94948") ? true : (stryCov_9fa48("94948", "94949", "94950"), (stryMutAct_9fa48("94951") ? partitionRow.table_id : (stryCov_9fa48("94951"), partitionRow?.table_id)) || null), options.bootstrapTableMetadata);
      this.setHydratedMetadataSnapshot(options.partitionId, stryMutAct_9fa48("94952") ? {} : (stryCov_9fa48("94952"), {
        partitionRow,
        tableRow
      }));
    }
  } /**
    * Normalize bootstrap table metadata from a CREATE_REPLICA payload.
    * @param {string|null} expectedTableId
    * @param {Object|null} tableRow
    * @return {Object|null}
    * @private
    */
  normalizeBootstrapTableMetadata(expectedTableId, tableRow) {
    if (stryMutAct_9fa48("94953")) {
      {}
    } else {
      stryCov_9fa48("94953");
      if (stryMutAct_9fa48("94956") ? !tableRow && typeof tableRow !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94955") ? false : stryMutAct_9fa48("94954") ? true : (stryCov_9fa48("94954", "94955", "94956"), (stryMutAct_9fa48("94957") ? tableRow : (stryCov_9fa48("94957"), !tableRow)) || (stryMutAct_9fa48("94959") ? typeof tableRow === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94958") ? false : (stryCov_9fa48("94958", "94959"), typeof tableRow !== REPLICA_HANDLER_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("94960")) {
          {}
        } else {
          stryCov_9fa48("94960");
          return null;
        }
      }
      const tableId = stryMutAct_9fa48("94963") ? (tableRow.table_id || tableRow.tableId) && null : stryMutAct_9fa48("94962") ? false : stryMutAct_9fa48("94961") ? true : (stryCov_9fa48("94961", "94962", "94963"), (stryMutAct_9fa48("94965") ? tableRow.table_id && tableRow.tableId : stryMutAct_9fa48("94964") ? false : (stryCov_9fa48("94964", "94965"), tableRow.table_id || tableRow.tableId)) || null);
      if (stryMutAct_9fa48("94968") ? typeof tableId !== REPLICA_HANDLER_TYPEOF.STRING && tableId.length === NUM.ZERO : stryMutAct_9fa48("94967") ? false : stryMutAct_9fa48("94966") ? true : (stryCov_9fa48("94966", "94967", "94968"), (stryMutAct_9fa48("94970") ? typeof tableId === REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("94969") ? false : (stryCov_9fa48("94969", "94970"), typeof tableId !== REPLICA_HANDLER_TYPEOF.STRING)) || (stryMutAct_9fa48("94972") ? tableId.length !== NUM.ZERO : stryMutAct_9fa48("94971") ? false : (stryCov_9fa48("94971", "94972"), tableId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("94973")) {
          {}
        } else {
          stryCov_9fa48("94973");
          return null;
        }
      }
      if (stryMutAct_9fa48("94976") ? expectedTableId || tableId !== expectedTableId : stryMutAct_9fa48("94975") ? false : stryMutAct_9fa48("94974") ? true : (stryCov_9fa48("94974", "94975", "94976"), expectedTableId && (stryMutAct_9fa48("94978") ? tableId === expectedTableId : stryMutAct_9fa48("94977") ? true : (stryCov_9fa48("94977", "94978"), tableId !== expectedTableId)))) {
        if (stryMutAct_9fa48("94979")) {
          {}
        } else {
          stryCov_9fa48("94979");
          return null;
        }
      }
      return stryMutAct_9fa48("94980") ? {} : (stryCov_9fa48("94980"), {
        ...tableRow,
        table_id: tableId
      });
    }
  } /**
    * Normalize bootstrap partition metadata from a CREATE_REPLICA payload.
    * @param {string} expectedPartitionId
    * @param {Object|null} partitionRow
    * @return {Object|null}
    * @private
    */
  normalizeBootstrapPartitionMetadata(expectedPartitionId, partitionRow) {
    if (stryMutAct_9fa48("94981")) {
      {}
    } else {
      stryCov_9fa48("94981");
      if (stryMutAct_9fa48("94984") ? !partitionRow && typeof partitionRow !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94983") ? false : stryMutAct_9fa48("94982") ? true : (stryCov_9fa48("94982", "94983", "94984"), (stryMutAct_9fa48("94985") ? partitionRow : (stryCov_9fa48("94985"), !partitionRow)) || (stryMutAct_9fa48("94987") ? typeof partitionRow === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("94986") ? false : (stryCov_9fa48("94986", "94987"), typeof partitionRow !== REPLICA_HANDLER_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("94988")) {
          {}
        } else {
          stryCov_9fa48("94988");
          return null;
        }
      }
      const partitionId = stryMutAct_9fa48("94991") ? (partitionRow.partition_id || partitionRow.partitionId) && null : stryMutAct_9fa48("94990") ? false : stryMutAct_9fa48("94989") ? true : (stryCov_9fa48("94989", "94990", "94991"), (stryMutAct_9fa48("94993") ? partitionRow.partition_id && partitionRow.partitionId : stryMutAct_9fa48("94992") ? false : (stryCov_9fa48("94992", "94993"), partitionRow.partition_id || partitionRow.partitionId)) || null);
      const tableId = stryMutAct_9fa48("94996") ? (partitionRow.table_id || partitionRow.tableId) && null : stryMutAct_9fa48("94995") ? false : stryMutAct_9fa48("94994") ? true : (stryCov_9fa48("94994", "94995", "94996"), (stryMutAct_9fa48("94998") ? partitionRow.table_id && partitionRow.tableId : stryMutAct_9fa48("94997") ? false : (stryCov_9fa48("94997", "94998"), partitionRow.table_id || partitionRow.tableId)) || null);
      if (stryMutAct_9fa48("95001") ? (partitionId !== expectedPartitionId || typeof tableId !== REPLICA_HANDLER_TYPEOF.STRING) && tableId.length === NUM.ZERO : stryMutAct_9fa48("95000") ? false : stryMutAct_9fa48("94999") ? true : (stryCov_9fa48("94999", "95000", "95001"), (stryMutAct_9fa48("95003") ? partitionId !== expectedPartitionId && typeof tableId !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("95002") ? false : (stryCov_9fa48("95002", "95003"), (stryMutAct_9fa48("95005") ? partitionId === expectedPartitionId : stryMutAct_9fa48("95004") ? false : (stryCov_9fa48("95004", "95005"), partitionId !== expectedPartitionId)) || (stryMutAct_9fa48("95007") ? typeof tableId === REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("95006") ? false : (stryCov_9fa48("95006", "95007"), typeof tableId !== REPLICA_HANDLER_TYPEOF.STRING)))) || (stryMutAct_9fa48("95009") ? tableId.length !== NUM.ZERO : stryMutAct_9fa48("95008") ? false : (stryCov_9fa48("95008", "95009"), tableId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("95010")) {
          {}
        } else {
          stryCov_9fa48("95010");
          return null;
        }
      }
      return stryMutAct_9fa48("95011") ? {} : (stryCov_9fa48("95011"), {
        ...partitionRow,
        partition_id: partitionId,
        table_id: tableId
      });
    }
  } /**
    * Execute a system-table query and normalize result to row array.
    * @param {ControlPlaneSystemTableGateway} gateway - Canonical read ingress.
    * @param {string} tableName - System table name.
    * @param {string} sql - Query text.
    * @param {Array<*>} params - Positional params.
    * @return {Promise<Array<Object>>}
    * @private
    */
  async querySystemTableRows(gateway, tableName, sql, params = stryMutAct_9fa48("95012") ? ["Stryker was here"] : (stryCov_9fa48("95012"), [])) {
    if (stryMutAct_9fa48("95013")) {
      {}
    } else {
      stryCov_9fa48("95013");
      if (stryMutAct_9fa48("95016") ? false : stryMutAct_9fa48("95015") ? true : stryMutAct_9fa48("95014") ? gateway : (stryCov_9fa48("95014", "95015", "95016"), !gateway)) {
        if (stryMutAct_9fa48("95017")) {
          {}
        } else {
          stryCov_9fa48("95017");
          throw createSystemMetadataGatewayRequiredError(stryMutAct_9fa48("95018") ? {} : (stryCov_9fa48("95018"), {
            serviceName: REPLICA_HANDLER_LITERAL.REPLICAHANDLER,
            tableName,
            operation: REPLICA_HANDLER_LITERAL.READ
          }));
        }
      }
      const result = await gateway.readRows(tableName, sql, params, stryMutAct_9fa48("95019") ? {} : (stryCov_9fa48("95019"), {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        allowPressureDefer: stryMutAct_9fa48("95020") ? false : (stryCov_9fa48("95020"), true)
      }));
      if (stryMutAct_9fa48("95023") ? result.success !== false : stryMutAct_9fa48("95022") ? false : stryMutAct_9fa48("95021") ? true : (stryCov_9fa48("95021", "95022", "95023"), result.success === (stryMutAct_9fa48("95024") ? true : (stryCov_9fa48("95024"), false)))) {
        if (stryMutAct_9fa48("95025")) {
          {}
        } else {
          stryCov_9fa48("95025");
          throw new Error(stryMutAct_9fa48("95028") ? result.error && REPLICA_HANDLER_LITERAL.SYSTEM_TABLE_QUERY_FAILED : stryMutAct_9fa48("95027") ? false : stryMutAct_9fa48("95026") ? true : (stryCov_9fa48("95026", "95027", "95028"), result.error || REPLICA_HANDLER_LITERAL.SYSTEM_TABLE_QUERY_FAILED));
        }
      }
      return Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("95029") ? ["Stryker was here"] : (stryCov_9fa48("95029"), []);
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("95030")) {
      {}
    } else {
      stryCov_9fa48("95030");
      if (stryMutAct_9fa48("95032") ? false : stryMutAct_9fa48("95031") ? true : (stryCov_9fa48("95031", "95032"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("95033")) {
          {}
        } else {
          stryCov_9fa48("95033");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("95034") ? {} : (stryCov_9fa48("95034"), {
        nodeId: this.nodeId,
        getSqlQueryEngine: stryMutAct_9fa48("95035") ? () => undefined : (stryCov_9fa48("95035"), () => this.getMetadataSqlQueryEngine()),
        getCdcIntegrationService: stryMutAct_9fa48("95036") ? () => undefined : (stryCov_9fa48("95036"), () => this.cdcIntegrationService),
        getSystemTableCache: stryMutAct_9fa48("95037") ? () => undefined : (stryCov_9fa48("95037"), () => this.systemTableCache)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }
  getPartitionServiceRowOwner() {
    if (stryMutAct_9fa48("95038")) {
      {}
    } else {
      stryCov_9fa48("95038");
      if (stryMutAct_9fa48("95040") ? false : stryMutAct_9fa48("95039") ? true : (stryCov_9fa48("95039", "95040"), this.partitionServiceRowOwner)) {
        if (stryMutAct_9fa48("95041")) {
          {}
        } else {
          stryCov_9fa48("95041");
          return this.partitionServiceRowOwner;
        }
      }
      this.partitionServiceRowOwner = new PartitionServiceRowOwner(stryMutAct_9fa48("95042") ? {} : (stryCov_9fa48("95042"), {
        systemTableWriter: this.getControlPlaneSystemTableGateway()
      }));
      return this.partitionServiceRowOwner;
    }
  } /**
    * @return {Object|null}
    * @private
    */
  getMetadataSqlQueryEngine() {
    if (stryMutAct_9fa48("95043")) {
      {}
    } else {
      stryCov_9fa48("95043");
      if (stryMutAct_9fa48("95046") ? this.cdcIntegrationService.sqlQueryEngine : stryMutAct_9fa48("95045") ? false : stryMutAct_9fa48("95044") ? true : (stryCov_9fa48("95044", "95045", "95046"), this.cdcIntegrationService?.sqlQueryEngine)) {
        if (stryMutAct_9fa48("95047")) {
          {}
        } else {
          stryCov_9fa48("95047");
          return this.cdcIntegrationService.sqlQueryEngine;
        }
      }
      if (stryMutAct_9fa48("95050") ? typeof this.cdcIntegrationService?.executeSQL !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95049") ? false : stryMutAct_9fa48("95048") ? true : (stryCov_9fa48("95048", "95049", "95050"), typeof (stryMutAct_9fa48("95051") ? this.cdcIntegrationService.executeSQL : (stryCov_9fa48("95051"), this.cdcIntegrationService?.executeSQL)) === REPLICA_HANDLER_TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("95052")) {
          {}
        } else {
          stryCov_9fa48("95052");
          return stryMutAct_9fa48("95053") ? {} : (stryCov_9fa48("95053"), {
            executeQuery: (sql, params = stryMutAct_9fa48("95054") ? ["Stryker was here"] : (stryCov_9fa48("95054"), [])) => {
              if (stryMutAct_9fa48("95055")) {
                {}
              } else {
                stryCov_9fa48("95055");
                return this.cdcIntegrationService.executeSQL(sql, params);
              }
            }
          });
        }
      }
      return null;
    }
  } /**
    * @param {string} partitionId
    * @return {Object|null}
    * @private
    */
  getHydratedMetadataSnapshot(partitionId) {
    if (stryMutAct_9fa48("95056")) {
      {}
    } else {
      stryCov_9fa48("95056");
      if (stryMutAct_9fa48("95059") ? typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("95058") ? false : stryMutAct_9fa48("95057") ? true : (stryCov_9fa48("95057", "95058", "95059"), (stryMutAct_9fa48("95061") ? typeof partitionId === REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("95060") ? false : (stryCov_9fa48("95060", "95061"), typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING)) || (stryMutAct_9fa48("95063") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("95062") ? false : (stryCov_9fa48("95062", "95063"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("95064")) {
          {}
        } else {
          stryCov_9fa48("95064");
          return null;
        }
      }
      return stryMutAct_9fa48("95067") ? this.hydratedMetadataByPartitionId.get(partitionId) && null : stryMutAct_9fa48("95066") ? false : stryMutAct_9fa48("95065") ? true : (stryCov_9fa48("95065", "95066", "95067"), this.hydratedMetadataByPartitionId.get(partitionId) || null);
    }
  } /**
    * @param {string} partitionId
    * @param {Object} snapshot
    * @return {void}
    * @private
    */
  setHydratedMetadataSnapshot(partitionId, snapshot = {}) {
    if (stryMutAct_9fa48("95068")) {
      {}
    } else {
      stryCov_9fa48("95068");
      if (stryMutAct_9fa48("95071") ? typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("95070") ? false : stryMutAct_9fa48("95069") ? true : (stryCov_9fa48("95069", "95070", "95071"), (stryMutAct_9fa48("95073") ? typeof partitionId === REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("95072") ? false : (stryCov_9fa48("95072", "95073"), typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING)) || (stryMutAct_9fa48("95075") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("95074") ? false : (stryCov_9fa48("95074", "95075"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("95076")) {
          {}
        } else {
          stryCov_9fa48("95076");
          return;
        }
      }
      const existingSnapshot = stryMutAct_9fa48("95079") ? this.getHydratedMetadataSnapshot(partitionId) && {} : stryMutAct_9fa48("95078") ? false : stryMutAct_9fa48("95077") ? true : (stryCov_9fa48("95077", "95078", "95079"), this.getHydratedMetadataSnapshot(partitionId) || {});
      const serviceRows = Array.isArray(snapshot.serviceRows) ? stryMutAct_9fa48("95080") ? snapshot.serviceRows : (stryCov_9fa48("95080"), snapshot.serviceRows.filter(stryMutAct_9fa48("95081") ? () => undefined : (stryCov_9fa48("95081"), row => stryMutAct_9fa48("95084") ? row || typeof row === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95083") ? false : stryMutAct_9fa48("95082") ? true : (stryCov_9fa48("95082", "95083", "95084"), row && (stryMutAct_9fa48("95086") ? typeof row !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95085") ? true : (stryCov_9fa48("95085", "95086"), typeof row === REPLICA_HANDLER_TYPEOF.OBJECT)))))) : stryMutAct_9fa48("95089") ? existingSnapshot.serviceRows && [] : stryMutAct_9fa48("95088") ? false : stryMutAct_9fa48("95087") ? true : (stryCov_9fa48("95087", "95088", "95089"), existingSnapshot.serviceRows || (stryMutAct_9fa48("95090") ? ["Stryker was here"] : (stryCov_9fa48("95090"), [])));
      this.hydratedMetadataByPartitionId.set(partitionId, stryMutAct_9fa48("95091") ? {} : (stryCov_9fa48("95091"), {
        partitionRow: stryMutAct_9fa48("95094") ? (snapshot.partitionRow || existingSnapshot.partitionRow) && null : stryMutAct_9fa48("95093") ? false : stryMutAct_9fa48("95092") ? true : (stryCov_9fa48("95092", "95093", "95094"), (stryMutAct_9fa48("95096") ? snapshot.partitionRow && existingSnapshot.partitionRow : stryMutAct_9fa48("95095") ? false : (stryCov_9fa48("95095", "95096"), snapshot.partitionRow || existingSnapshot.partitionRow)) || null),
        tableRow: stryMutAct_9fa48("95099") ? (snapshot.tableRow || existingSnapshot.tableRow) && null : stryMutAct_9fa48("95098") ? false : stryMutAct_9fa48("95097") ? true : (stryCov_9fa48("95097", "95098", "95099"), (stryMutAct_9fa48("95101") ? snapshot.tableRow && existingSnapshot.tableRow : stryMutAct_9fa48("95100") ? false : (stryCov_9fa48("95100", "95101"), snapshot.tableRow || existingSnapshot.tableRow)) || null),
        serviceRows
      }));
    }
  } /**
    * @param {string} partitionId
    * @return {void}
    * @private
    */
  clearHydratedMetadataSnapshot(partitionId) {
    if (stryMutAct_9fa48("95102")) {
      {}
    } else {
      stryCov_9fa48("95102");
      if (stryMutAct_9fa48("95105") ? typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("95104") ? false : stryMutAct_9fa48("95103") ? true : (stryCov_9fa48("95103", "95104", "95105"), (stryMutAct_9fa48("95107") ? typeof partitionId === REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("95106") ? false : (stryCov_9fa48("95106", "95107"), typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING)) || (stryMutAct_9fa48("95109") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("95108") ? false : (stryCov_9fa48("95108", "95109"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("95110")) {
          {}
        } else {
          stryCov_9fa48("95110");
          return;
        }
      }
      this.hydratedMetadataByPartitionId.delete(partitionId);
    }
  } /**
    * @param {Array<Object>} cachedRows
    * @param {Array<Object>} hydratedRows
    * @return {Array<Object>}
    * @private
    */
  mergeHydratedServices(cachedRows = stryMutAct_9fa48("95111") ? ["Stryker was here"] : (stryCov_9fa48("95111"), []), hydratedRows = stryMutAct_9fa48("95112") ? ["Stryker was here"] : (stryCov_9fa48("95112"), [])) {
    if (stryMutAct_9fa48("95113")) {
      {}
    } else {
      stryCov_9fa48("95113");
      const mergedRows = new Map();
      for (const row of Array.isArray(cachedRows) ? cachedRows : stryMutAct_9fa48("95114") ? ["Stryker was here"] : (stryCov_9fa48("95114"), [])) {
        if (stryMutAct_9fa48("95115")) {
          {}
        } else {
          stryCov_9fa48("95115");
          const serviceId = stryMutAct_9fa48("95118") ? row?.service_id && row?.replica_id : stryMutAct_9fa48("95117") ? false : stryMutAct_9fa48("95116") ? true : (stryCov_9fa48("95116", "95117", "95118"), (stryMutAct_9fa48("95119") ? row.service_id : (stryCov_9fa48("95119"), row?.service_id)) || (stryMutAct_9fa48("95120") ? row.replica_id : (stryCov_9fa48("95120"), row?.replica_id)));
          if (stryMutAct_9fa48("95123") ? typeof serviceId === REPLICA_HANDLER_TYPEOF.STRING || serviceId.length > NUM.ZERO : stryMutAct_9fa48("95122") ? false : stryMutAct_9fa48("95121") ? true : (stryCov_9fa48("95121", "95122", "95123"), (stryMutAct_9fa48("95125") ? typeof serviceId !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("95124") ? true : (stryCov_9fa48("95124", "95125"), typeof serviceId === REPLICA_HANDLER_TYPEOF.STRING)) && (stryMutAct_9fa48("95128") ? serviceId.length <= NUM.ZERO : stryMutAct_9fa48("95127") ? serviceId.length >= NUM.ZERO : stryMutAct_9fa48("95126") ? true : (stryCov_9fa48("95126", "95127", "95128"), serviceId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("95129")) {
              {}
            } else {
              stryCov_9fa48("95129");
              mergedRows.set(serviceId, row);
            }
          }
        }
      }
      for (const row of Array.isArray(hydratedRows) ? hydratedRows : stryMutAct_9fa48("95130") ? ["Stryker was here"] : (stryCov_9fa48("95130"), [])) {
        if (stryMutAct_9fa48("95131")) {
          {}
        } else {
          stryCov_9fa48("95131");
          const serviceId = stryMutAct_9fa48("95134") ? row?.service_id && row?.replica_id : stryMutAct_9fa48("95133") ? false : stryMutAct_9fa48("95132") ? true : (stryCov_9fa48("95132", "95133", "95134"), (stryMutAct_9fa48("95135") ? row.service_id : (stryCov_9fa48("95135"), row?.service_id)) || (stryMutAct_9fa48("95136") ? row.replica_id : (stryCov_9fa48("95136"), row?.replica_id)));
          if (stryMutAct_9fa48("95139") ? typeof serviceId === REPLICA_HANDLER_TYPEOF.STRING || serviceId.length > NUM.ZERO : stryMutAct_9fa48("95138") ? false : stryMutAct_9fa48("95137") ? true : (stryCov_9fa48("95137", "95138", "95139"), (stryMutAct_9fa48("95141") ? typeof serviceId !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("95140") ? true : (stryCov_9fa48("95140", "95141"), typeof serviceId === REPLICA_HANDLER_TYPEOF.STRING)) && (stryMutAct_9fa48("95144") ? serviceId.length <= NUM.ZERO : stryMutAct_9fa48("95143") ? serviceId.length >= NUM.ZERO : stryMutAct_9fa48("95142") ? true : (stryCov_9fa48("95142", "95143", "95144"), serviceId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("95145")) {
              {}
            } else {
              stryCov_9fa48("95145");
              mergedRows.set(serviceId, row);
            }
          }
        }
      }
      return Array.from(mergedRows.values());
    }
  } /**
    * Clean up local resources for a replica.
    * @param {string} partitionId - Partition ID.
    * @param {string} replicaId - Replica ID.
    * @return {Promise<void>}
    * @private
    */
  async cleanupReplicaResources(partitionId, replicaId) {
    if (stryMutAct_9fa48("95146")) {
      {}
    } else {
      stryCov_9fa48("95146");
      const dbPath = this.getPartitionDbPath(partitionId, replicaId);
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.CLEANUP_RESOURCES, stryMutAct_9fa48("95147") ? {} : (stryCov_9fa48("95147"), {
        replicaId,
        partitionId,
        dbPath,
        nodeId: this.nodeId
      }));
      try {
        if (stryMutAct_9fa48("95148")) {
          {}
        } else {
          stryCov_9fa48("95148");
          // Remove SQLite database file
          if (stryMutAct_9fa48("95150") ? false : stryMutAct_9fa48("95149") ? true : (stryCov_9fa48("95149", "95150"), fs.existsSync(dbPath))) {
            if (stryMutAct_9fa48("95151")) {
              {}
            } else {
              stryCov_9fa48("95151");
              fs.unlinkSync(dbPath);
              this.logger.debug(REPLICA_HANDLER_LOG_MSG.REMOVED_DB_FILE, stryMutAct_9fa48("95152") ? {} : (stryCov_9fa48("95152"), {
                dbPath
              }));
            }
          } // Remove WAL and SHM files if they exist
          const walPath = stryMutAct_9fa48("95153") ? `` : (stryCov_9fa48("95153"), `${dbPath}-wal`);
          const shmPath = stryMutAct_9fa48("95154") ? `` : (stryCov_9fa48("95154"), `${dbPath}-shm`);
          if (stryMutAct_9fa48("95156") ? false : stryMutAct_9fa48("95155") ? true : (stryCov_9fa48("95155", "95156"), fs.existsSync(walPath))) {
            if (stryMutAct_9fa48("95157")) {
              {}
            } else {
              stryCov_9fa48("95157");
              fs.unlinkSync(walPath);
            }
          }
          if (stryMutAct_9fa48("95159") ? false : stryMutAct_9fa48("95158") ? true : (stryCov_9fa48("95158", "95159"), fs.existsSync(shmPath))) {
            if (stryMutAct_9fa48("95160")) {
              {}
            } else {
              stryCov_9fa48("95160");
              fs.unlinkSync(shmPath);
            }
          } // Try to remove partition directory if empty
          const partitionDir = path.dirname(dbPath);
          try {
            if (stryMutAct_9fa48("95161")) {
              {}
            } else {
              stryCov_9fa48("95161");
              const files = fs.readdirSync(partitionDir);
              if (stryMutAct_9fa48("95164") ? files.length !== REPLICA_HANDLER_NUM.ZERO : stryMutAct_9fa48("95163") ? false : stryMutAct_9fa48("95162") ? true : (stryCov_9fa48("95162", "95163", "95164"), files.length === REPLICA_HANDLER_NUM.ZERO)) {
                if (stryMutAct_9fa48("95165")) {
                  {}
                } else {
                  stryCov_9fa48("95165");
                  fs.rmdirSync(partitionDir);
                  this.logger.debug(REPLICA_HANDLER_LOG_MSG.REMOVED_EMPTY_DIR, stryMutAct_9fa48("95166") ? {} : (stryCov_9fa48("95166"), {
                    partitionDir
                  }));
                }
              }
            }
          } catch (dirError) {
            if (stryMutAct_9fa48("95167")) {
              {}
            } else {
              stryCov_9fa48("95167");
              this.logger.warn(REPLICA_HANDLER_LOG_MSG.CLEANUP_FAILED, stryMutAct_9fa48("95168") ? {} : (stryCov_9fa48("95168"), {
                replicaId,
                dbPath,
                error: dirError.message
              }));
              throw dirError;
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("95169")) {
          {}
        } else {
          stryCov_9fa48("95169");
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.CLEANUP_FAILED, stryMutAct_9fa48("95170") ? {} : (stryCov_9fa48("95170"), {
            replicaId,
            dbPath,
            error: error.message
          }));
          throw error;
        }
      }
    }
  } /**
    * Get the database path for a partition replica.
    * @param {string} partitionId - Partition ID.
    * @param {string} replicaId - Replica ID.
    * @return {string} Database file path.
    * @private
    */
  getPartitionDbPath(partitionId, replicaId) {
    if (stryMutAct_9fa48("95171")) {
      {}
    } else {
      stryCov_9fa48("95171");
      return path.join(this.dataDir, STORAGE_DEFAULT.PARTITIONS_DIRNAME, partitionId, stryMutAct_9fa48("95172") ? `` : (stryCov_9fa48("95172"), `${replicaId}${STORAGE_DEFAULT.DB_EXT}`));
    }
  } /**
    * Get local replica by ID.
    * Reads from System_Table_Cache and merges with local service reference.
    * @param {string} replicaId - Replica ID.
    * @return {Object|null} Local replica info or null.
    */
  getLocalReplica(replicaId) {
    if (stryMutAct_9fa48("95173")) {
      {}
    } else {
      stryCov_9fa48("95173");
      const localReplica = this.localReplicas.get(replicaId);
      if (stryMutAct_9fa48("95176") ? localReplica || typeof localReplica === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95175") ? false : stryMutAct_9fa48("95174") ? true : (stryCov_9fa48("95174", "95175", "95176"), localReplica && (stryMutAct_9fa48("95178") ? typeof localReplica !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95177") ? true : (stryCov_9fa48("95177", "95178"), typeof localReplica === REPLICA_HANDLER_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("95179")) {
          {}
        } else {
          stryCov_9fa48("95179");
          const trackedService = this.getTrackedService(replicaId);
          if (stryMutAct_9fa48("95182") ? false : stryMutAct_9fa48("95181") ? true : stryMutAct_9fa48("95180") ? localReplica.replicaId : (stryCov_9fa48("95180", "95181", "95182"), !localReplica.replicaId)) {
            if (stryMutAct_9fa48("95183")) {
              {}
            } else {
              stryCov_9fa48("95183");
              localReplica.replicaId = replicaId;
            }
          }
          if (stryMutAct_9fa48("95186") ? localReplica.service !== undefined : stryMutAct_9fa48("95185") ? false : stryMutAct_9fa48("95184") ? true : (stryCov_9fa48("95184", "95185", "95186"), localReplica.service === undefined)) {
            if (stryMutAct_9fa48("95187")) {
              {}
            } else {
              stryCov_9fa48("95187");
              localReplica.service = trackedService;
            }
          } else if (stryMutAct_9fa48("95190") ? !localReplica.service || trackedService : stryMutAct_9fa48("95189") ? false : stryMutAct_9fa48("95188") ? true : (stryCov_9fa48("95188", "95189", "95190"), (stryMutAct_9fa48("95191") ? localReplica.service : (stryCov_9fa48("95191"), !localReplica.service)) && trackedService)) {
            if (stryMutAct_9fa48("95192")) {
              {}
            } else {
              stryCov_9fa48("95192");
              localReplica.service = trackedService;
            }
          }
          return localReplica;
        }
      } // Read from cache (single source of truth for replica state)
      const cacheEntry = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      const service = this.getTrackedService(replicaId); // Check if this replica belongs to this node
      if (stryMutAct_9fa48("95195") ? !cacheEntry && cacheEntry.node_id !== this.nodeId : stryMutAct_9fa48("95194") ? false : stryMutAct_9fa48("95193") ? true : (stryCov_9fa48("95193", "95194", "95195"), (stryMutAct_9fa48("95196") ? cacheEntry : (stryCov_9fa48("95196"), !cacheEntry)) || (stryMutAct_9fa48("95198") ? cacheEntry.node_id === this.nodeId : stryMutAct_9fa48("95197") ? false : (stryCov_9fa48("95197", "95198"), cacheEntry.node_id !== this.nodeId)))) {
        if (stryMutAct_9fa48("95199")) {
          {}
        } else {
          stryCov_9fa48("95199");
          // Compatibility fallback for legacy tests that seed in-memory local replicas
          // directly on the lifecycle manager.
          if (stryMutAct_9fa48("95202") ? service && typeof service === REPLICA_HANDLER_TYPEOF.OBJECT || service.status : stryMutAct_9fa48("95201") ? false : stryMutAct_9fa48("95200") ? true : (stryCov_9fa48("95200", "95201", "95202"), (stryMutAct_9fa48("95204") ? service || typeof service === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95203") ? true : (stryCov_9fa48("95203", "95204"), service && (stryMutAct_9fa48("95206") ? typeof service !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95205") ? true : (stryCov_9fa48("95205", "95206"), typeof service === REPLICA_HANDLER_TYPEOF.OBJECT)))) && service.status)) {
            if (stryMutAct_9fa48("95207")) {
              {}
            } else {
              stryCov_9fa48("95207");
              const compatibilityService = stryMutAct_9fa48("95210") ? service.service && (typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION || typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION ? service : null) : stryMutAct_9fa48("95209") ? false : stryMutAct_9fa48("95208") ? true : (stryCov_9fa48("95208", "95209", "95210"), service.service || ((stryMutAct_9fa48("95213") ? typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION && typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95212") ? false : stryMutAct_9fa48("95211") ? true : (stryCov_9fa48("95211", "95212", "95213"), (stryMutAct_9fa48("95215") ? typeof service.shutdown !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95214") ? false : (stryCov_9fa48("95214", "95215"), typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION)) || (stryMutAct_9fa48("95217") ? typeof service.syncFromLeader !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95216") ? false : (stryCov_9fa48("95216", "95217"), typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION)))) ? service : null));
              return stryMutAct_9fa48("95218") ? {} : (stryCov_9fa48("95218"), {
                replicaId: stryMutAct_9fa48("95221") ? service.replicaId && replicaId : stryMutAct_9fa48("95220") ? false : stryMutAct_9fa48("95219") ? true : (stryCov_9fa48("95219", "95220", "95221"), service.replicaId || replicaId),
                partitionId: stryMutAct_9fa48("95224") ? service.partitionId && null : stryMutAct_9fa48("95223") ? false : stryMutAct_9fa48("95222") ? true : (stryCov_9fa48("95222", "95223", "95224"), service.partitionId || null),
                tableName: stryMutAct_9fa48("95227") ? service.tableName && null : stryMutAct_9fa48("95226") ? false : stryMutAct_9fa48("95225") ? true : (stryCov_9fa48("95225", "95226", "95227"), service.tableName || null),
                status: service.status,
                service: compatibilityService
              });
            }
          }
          return null;
        }
      } // Merge cache state with local service reference
      return stryMutAct_9fa48("95228") ? {} : (stryCov_9fa48("95228"), {
        replicaId: stryMutAct_9fa48("95231") ? cacheEntry.service_id && cacheEntry.replica_id : stryMutAct_9fa48("95230") ? false : stryMutAct_9fa48("95229") ? true : (stryCov_9fa48("95229", "95230", "95231"), cacheEntry.service_id || cacheEntry.replica_id),
        partitionId: cacheEntry.partition_id,
        tableName: null,
        // Not stored in services table
        status: cacheEntry.status,
        service: stryMutAct_9fa48("95234") ? service && null : stryMutAct_9fa48("95233") ? false : stryMutAct_9fa48("95232") ? true : (stryCov_9fa48("95232", "95233", "95234"), service || null)
      });
    }
  } /**
    * Get all local replicas.
    * Reads from System_Table_Cache filtered by node_id.
    * @return {Array<Object>} Array of local replica info.
    */
  getAllLocalReplicas() {
    if (stryMutAct_9fa48("95235")) {
      {}
    } else {
      stryCov_9fa48("95235");
      const replicasById = new Map();
      const localServices = stryMutAct_9fa48("95236") ? this.systemTableCache : (stryCov_9fa48("95236"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, stryMutAct_9fa48("95237") ? () => undefined : (stryCov_9fa48("95237"), row => stryMutAct_9fa48("95240") ? row.node_id !== this.nodeId : stryMutAct_9fa48("95239") ? false : stryMutAct_9fa48("95238") ? true : (stryCov_9fa48("95238", "95239", "95240"), row.node_id === this.nodeId))));
      for (const cacheEntry of localServices) {
        if (stryMutAct_9fa48("95241")) {
          {}
        } else {
          stryCov_9fa48("95241");
          const replicaId = stryMutAct_9fa48("95244") ? cacheEntry.service_id && cacheEntry.replica_id : stryMutAct_9fa48("95243") ? false : stryMutAct_9fa48("95242") ? true : (stryCov_9fa48("95242", "95243", "95244"), cacheEntry.service_id || cacheEntry.replica_id);
          const tracked = this.localReplicas.get(replicaId);
          replicasById.set(replicaId, stryMutAct_9fa48("95245") ? {} : (stryCov_9fa48("95245"), {
            replicaId,
            partitionId: cacheEntry.partition_id,
            tableName: stryMutAct_9fa48("95248") ? tracked?.tableName && null : stryMutAct_9fa48("95247") ? false : stryMutAct_9fa48("95246") ? true : (stryCov_9fa48("95246", "95247", "95248"), (stryMutAct_9fa48("95249") ? tracked.tableName : (stryCov_9fa48("95249"), tracked?.tableName)) || null),
            status: stryMutAct_9fa48("95252") ? tracked?.status && cacheEntry.status : stryMutAct_9fa48("95251") ? false : stryMutAct_9fa48("95250") ? true : (stryCov_9fa48("95250", "95251", "95252"), (stryMutAct_9fa48("95253") ? tracked.status : (stryCov_9fa48("95253"), tracked?.status)) || cacheEntry.status),
            service: this.getTrackedService(replicaId)
          }));
        }
      }
      for (const [replicaId, trackedReplica] of this.localReplicas.entries()) {
        if (stryMutAct_9fa48("95254")) {
          {}
        } else {
          stryCov_9fa48("95254");
          if (stryMutAct_9fa48("95257") ? false : stryMutAct_9fa48("95256") ? true : stryMutAct_9fa48("95255") ? replicasById.has(replicaId) : (stryCov_9fa48("95255", "95256", "95257"), !replicasById.has(replicaId))) {
            if (stryMutAct_9fa48("95258")) {
              {}
            } else {
              stryCov_9fa48("95258");
              replicasById.set(replicaId, stryMutAct_9fa48("95259") ? {} : (stryCov_9fa48("95259"), {
                replicaId: stryMutAct_9fa48("95262") ? trackedReplica?.replicaId && replicaId : stryMutAct_9fa48("95261") ? false : stryMutAct_9fa48("95260") ? true : (stryCov_9fa48("95260", "95261", "95262"), (stryMutAct_9fa48("95263") ? trackedReplica.replicaId : (stryCov_9fa48("95263"), trackedReplica?.replicaId)) || replicaId),
                partitionId: stryMutAct_9fa48("95266") ? trackedReplica?.partitionId && null : stryMutAct_9fa48("95265") ? false : stryMutAct_9fa48("95264") ? true : (stryCov_9fa48("95264", "95265", "95266"), (stryMutAct_9fa48("95267") ? trackedReplica.partitionId : (stryCov_9fa48("95267"), trackedReplica?.partitionId)) || null),
                tableName: stryMutAct_9fa48("95270") ? trackedReplica?.tableName && null : stryMutAct_9fa48("95269") ? false : stryMutAct_9fa48("95268") ? true : (stryCov_9fa48("95268", "95269", "95270"), (stryMutAct_9fa48("95271") ? trackedReplica.tableName : (stryCov_9fa48("95271"), trackedReplica?.tableName)) || null),
                status: stryMutAct_9fa48("95274") ? trackedReplica?.status && null : stryMutAct_9fa48("95273") ? false : stryMutAct_9fa48("95272") ? true : (stryCov_9fa48("95272", "95273", "95274"), (stryMutAct_9fa48("95275") ? trackedReplica.status : (stryCov_9fa48("95275"), trackedReplica?.status)) || null),
                service: this.getTrackedService(replicaId)
              }));
            }
          }
        }
      }
      return Array.from(replicasById.values());
    }
  } /**
    * Register an existing replica (created during bootstrap).
    * Stores only the service reference in localServices.
    * This method is idempotent - duplicate registrations are ignored.
    * @param {Object} replicaInfo - Replica information.
    * @param {string} replicaInfo.replicaId - Unique replica identifier.
    * @param {string} replicaInfo.partitionId - Partition identifier.
    * @param {string} replicaInfo.tableName - Table name.
    * @param {string} [replicaInfo.status] - Replica status (default: 'active').
    * @param {Object} [replicaInfo.service] - Partition service instance.
    */
  registerExistingReplica(replicaInfo) {
    if (stryMutAct_9fa48("95276")) {
      {}
    } else {
      stryCov_9fa48("95276");
      const {
        replicaId,
        service
      } = replicaInfo; // Idempotent: no error on duplicate registration
      if (stryMutAct_9fa48("95278") ? false : stryMutAct_9fa48("95277") ? true : (stryCov_9fa48("95277", "95278"), this.localReplicas.has(replicaId))) {
        if (stryMutAct_9fa48("95279")) {
          {}
        } else {
          stryCov_9fa48("95279");
          this.logger.debug(REPLICA_HANDLER_LOG_MSG.ALREADY_REGISTERED, stryMutAct_9fa48("95280") ? {} : (stryCov_9fa48("95280"), {
            replicaId,
            nodeId: this.nodeId
          }));
          return;
        }
      }
      this.setLocalReplica(replicaId, stryMutAct_9fa48("95281") ? {} : (stryCov_9fa48("95281"), {
        replicaId,
        partitionId: stryMutAct_9fa48("95284") ? replicaInfo.partitionId && null : stryMutAct_9fa48("95283") ? false : stryMutAct_9fa48("95282") ? true : (stryCov_9fa48("95282", "95283", "95284"), replicaInfo.partitionId || null),
        tableName: stryMutAct_9fa48("95287") ? replicaInfo.tableName && null : stryMutAct_9fa48("95286") ? false : stryMutAct_9fa48("95285") ? true : (stryCov_9fa48("95285", "95286", "95287"), replicaInfo.tableName || null),
        status: stryMutAct_9fa48("95290") ? replicaInfo.status && ReplicaStatus.ACTIVE : stryMutAct_9fa48("95289") ? false : stryMutAct_9fa48("95288") ? true : (stryCov_9fa48("95288", "95289", "95290"), replicaInfo.status || ReplicaStatus.ACTIVE),
        service: stryMutAct_9fa48("95293") ? service && null : stryMutAct_9fa48("95292") ? false : stryMutAct_9fa48("95291") ? true : (stryCov_9fa48("95291", "95292", "95293"), service || null)
      }));

      // Store service reference when provided
      if (stryMutAct_9fa48("95295") ? false : stryMutAct_9fa48("95294") ? true : (stryCov_9fa48("95294", "95295"), service)) {
        if (stryMutAct_9fa48("95296")) {
          {}
        } else {
          stryCov_9fa48("95296");
          this.localServices.set(replicaId, service);
        }
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REGISTERED_REPLICA, stryMutAct_9fa48("95297") ? {} : (stryCov_9fa48("95297"), {
        replicaId,
        partitionId: replicaInfo.partitionId,
        tableName: replicaInfo.tableName,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Aggregate pending-request tracker telemetry from local replica services.
   * @return {Object}
   * @private
   */
  getPendingRequestTrackerAggregate() {
    if (stryMutAct_9fa48("95298")) {
      {}
    } else {
      stryCov_9fa48("95298");
      const aggregate = stryMutAct_9fa48("95299") ? {} : (stryCov_9fa48("95299"), {
        pendingCount: NUM.ZERO,
        maxPendingRequests: NUM.ZERO,
        availableCapacity: NUM.ZERO,
        saturationPercent: NUM.ZERO,
        trackedTotal: NUM.ZERO,
        resolvedTotal: NUM.ZERO,
        rejectedTotal: NUM.ZERO,
        timedOutTotal: NUM.ZERO,
        staleCleanedTotal: NUM.ZERO,
        backpressureRejectTotal: NUM.ZERO,
        maxPendingObserved: NUM.ZERO,
        replicaCountWithTracker: NUM.ZERO
      });
      for (const service of this.localServices.values()) {
        if (stryMutAct_9fa48("95300")) {
          {}
        } else {
          stryCov_9fa48("95300");
          if (stryMutAct_9fa48("95303") ? !service && typeof service.getStats !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95302") ? false : stryMutAct_9fa48("95301") ? true : (stryCov_9fa48("95301", "95302", "95303"), (stryMutAct_9fa48("95304") ? service : (stryCov_9fa48("95304"), !service)) || (stryMutAct_9fa48("95306") ? typeof service.getStats === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95305") ? false : (stryCov_9fa48("95305", "95306"), typeof service.getStats !== REPLICA_HANDLER_TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("95307")) {
              {}
            } else {
              stryCov_9fa48("95307");
              continue;
            }
          }
          let serviceStats = null;
          try {
            if (stryMutAct_9fa48("95308")) {
              {}
            } else {
              stryCov_9fa48("95308");
              serviceStats = service.getStats();
            }
          } catch (_error) {
            if (stryMutAct_9fa48("95309")) {
              {}
            } else {
              stryCov_9fa48("95309");
              continue;
            }
          }
          const tracker = stryMutAct_9fa48("95310") ? serviceStats.pendingRequestTracker : (stryCov_9fa48("95310"), serviceStats?.pendingRequestTracker);
          if (stryMutAct_9fa48("95313") ? !tracker && typeof tracker !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95312") ? false : stryMutAct_9fa48("95311") ? true : (stryCov_9fa48("95311", "95312", "95313"), (stryMutAct_9fa48("95314") ? tracker : (stryCov_9fa48("95314"), !tracker)) || (stryMutAct_9fa48("95316") ? typeof tracker === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95315") ? false : (stryCov_9fa48("95315", "95316"), typeof tracker !== REPLICA_HANDLER_TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("95317")) {
              {}
            } else {
              stryCov_9fa48("95317");
              continue;
            }
          }
          stryMutAct_9fa48("95318") ? aggregate.replicaCountWithTracker -= NUM.ONE : (stryCov_9fa48("95318"), aggregate.replicaCountWithTracker += NUM.ONE);
          stryMutAct_9fa48("95319") ? aggregate.pendingCount -= Number.isFinite(tracker.pendingCount) ? tracker.pendingCount : NUM.ZERO : (stryCov_9fa48("95319"), aggregate.pendingCount += Number.isFinite(tracker.pendingCount) ? tracker.pendingCount : NUM.ZERO);
          stryMutAct_9fa48("95320") ? aggregate.maxPendingRequests -= Number.isFinite(tracker.maxPendingRequests) ? tracker.maxPendingRequests : NUM.ZERO : (stryCov_9fa48("95320"), aggregate.maxPendingRequests += Number.isFinite(tracker.maxPendingRequests) ? tracker.maxPendingRequests : NUM.ZERO);
          stryMutAct_9fa48("95321") ? aggregate.availableCapacity -= Number.isFinite(tracker.availableCapacity) ? tracker.availableCapacity : NUM.ZERO : (stryCov_9fa48("95321"), aggregate.availableCapacity += Number.isFinite(tracker.availableCapacity) ? tracker.availableCapacity : NUM.ZERO);
          stryMutAct_9fa48("95322") ? aggregate.trackedTotal -= Number.isFinite(tracker.trackedTotal) ? tracker.trackedTotal : NUM.ZERO : (stryCov_9fa48("95322"), aggregate.trackedTotal += Number.isFinite(tracker.trackedTotal) ? tracker.trackedTotal : NUM.ZERO);
          stryMutAct_9fa48("95323") ? aggregate.resolvedTotal -= Number.isFinite(tracker.resolvedTotal) ? tracker.resolvedTotal : NUM.ZERO : (stryCov_9fa48("95323"), aggregate.resolvedTotal += Number.isFinite(tracker.resolvedTotal) ? tracker.resolvedTotal : NUM.ZERO);
          stryMutAct_9fa48("95324") ? aggregate.rejectedTotal -= Number.isFinite(tracker.rejectedTotal) ? tracker.rejectedTotal : NUM.ZERO : (stryCov_9fa48("95324"), aggregate.rejectedTotal += Number.isFinite(tracker.rejectedTotal) ? tracker.rejectedTotal : NUM.ZERO);
          stryMutAct_9fa48("95325") ? aggregate.timedOutTotal -= Number.isFinite(tracker.timedOutTotal) ? tracker.timedOutTotal : NUM.ZERO : (stryCov_9fa48("95325"), aggregate.timedOutTotal += Number.isFinite(tracker.timedOutTotal) ? tracker.timedOutTotal : NUM.ZERO);
          stryMutAct_9fa48("95326") ? aggregate.staleCleanedTotal -= Number.isFinite(tracker.staleCleanedTotal) ? tracker.staleCleanedTotal : NUM.ZERO : (stryCov_9fa48("95326"), aggregate.staleCleanedTotal += Number.isFinite(tracker.staleCleanedTotal) ? tracker.staleCleanedTotal : NUM.ZERO);
          stryMutAct_9fa48("95327") ? aggregate.backpressureRejectTotal -= Number.isFinite(tracker.backpressureRejectTotal) ? tracker.backpressureRejectTotal : NUM.ZERO : (stryCov_9fa48("95327"), aggregate.backpressureRejectTotal += Number.isFinite(tracker.backpressureRejectTotal) ? tracker.backpressureRejectTotal : NUM.ZERO);
          aggregate.maxPendingObserved = stryMutAct_9fa48("95328") ? Math.min(aggregate.maxPendingObserved, Number.isFinite(tracker.maxPendingObserved) ? tracker.maxPendingObserved : NUM.ZERO) : (stryCov_9fa48("95328"), Math.max(aggregate.maxPendingObserved, Number.isFinite(tracker.maxPendingObserved) ? tracker.maxPendingObserved : NUM.ZERO));
        }
      }
      if (stryMutAct_9fa48("95332") ? aggregate.maxPendingRequests <= NUM.ZERO : stryMutAct_9fa48("95331") ? aggregate.maxPendingRequests >= NUM.ZERO : stryMutAct_9fa48("95330") ? false : stryMutAct_9fa48("95329") ? true : (stryCov_9fa48("95329", "95330", "95331", "95332"), aggregate.maxPendingRequests > NUM.ZERO)) {
        if (stryMutAct_9fa48("95333")) {
          {}
        } else {
          stryCov_9fa48("95333");
          aggregate.saturationPercent = Math.round(stryMutAct_9fa48("95334") ? aggregate.pendingCount / aggregate.maxPendingRequests / NUM.HUNDRED : (stryCov_9fa48("95334"), (stryMutAct_9fa48("95335") ? aggregate.pendingCount * aggregate.maxPendingRequests : (stryCov_9fa48("95335"), aggregate.pendingCount / aggregate.maxPendingRequests)) * NUM.HUNDRED));
        }
      }
      return aggregate;
    }
  }

  /**
   * Get handler statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    if (stryMutAct_9fa48("95336")) {
      {}
    } else {
      stryCov_9fa48("95336");
      const pendingRequestTracker = this.getPendingRequestTrackerAggregate();
      return stryMutAct_9fa48("95337") ? {} : (stryCov_9fa48("95337"), {
        nodeId: this.nodeId,
        initialized: this.initialized,
        localReplicaCount: this.localReplicas.size,
        inProgressOperationCount: this.inProgressOperations.size,
        pendingRequestTracker
      });
    }
  }

  /**
   * Register this handler with a message router.
   * Registers at ${nodeId}/service/replica-handler address.
   * Requirements: 3.1
   * @param {Object} messageRouter - Message router instance.
   * @param {Object} [options={}] - Registration options.
   * @param {Object} [options.rpcClient] - RPC client for response handling.
   */
  registerWithRouter(messageRouter, options = {}) {
    if (stryMutAct_9fa48("95338")) {
      {}
    } else {
      stryCov_9fa48("95338");
      if (stryMutAct_9fa48("95341") ? false : stryMutAct_9fa48("95340") ? true : stryMutAct_9fa48("95339") ? messageRouter : (stryCov_9fa48("95339", "95340", "95341"), !messageRouter)) {
        if (stryMutAct_9fa48("95342")) {
          {}
        } else {
          stryCov_9fa48("95342");
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.NO_MESSAGE_ROUTER);
          return;
        }
      }
      const handlerAddress = (stryMutAct_9fa48("95343") ? `` : (stryCov_9fa48("95343"), `${this.nodeId}/${REPLICA_HANDLER_ADDRESS.SERVICE_SEGMENT}/`)) + (stryMutAct_9fa48("95344") ? `` : (stryCov_9fa48("95344"), `${REPLICA_HANDLER_ADDRESS.HANDLER_ID}`));

      // Store RPC client if provided
      if (stryMutAct_9fa48("95346") ? false : stryMutAct_9fa48("95345") ? true : (stryCov_9fa48("95345", "95346"), options.rpcClient)) {
        if (stryMutAct_9fa48("95347")) {
          {}
        } else {
          stryCov_9fa48("95347");
          this.rpcClient = options.rpcClient;
        }
      }

      // Create handler that wraps handleMessage
      const routerHandler = async envelope => {
        if (stryMutAct_9fa48("95348")) {
          {}
        } else {
          stryCov_9fa48("95348");
          const response = await this.handleMessage(envelope);

          // If RPC client is available, also notify it of the response
          // This handles the case where the coordinator is on the same node
          if (stryMutAct_9fa48("95351") ? this.rpcClient || response.correlationId : stryMutAct_9fa48("95350") ? false : stryMutAct_9fa48("95349") ? true : (stryCov_9fa48("95349", "95350", "95351"), this.rpcClient && response.correlationId)) {
            if (stryMutAct_9fa48("95352")) {
              {}
            } else {
              stryCov_9fa48("95352");
              this.rpcClient.handleResponse(response.correlationId, response);
            }
          }
          return stryMutAct_9fa48("95353") ? {} : (stryCov_9fa48("95353"), {
            acknowledged: stryMutAct_9fa48("95354") ? false : (stryCov_9fa48("95354"), true),
            ...response
          });
        }
      };
      messageRouter.register(handlerAddress, routerHandler);
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REGISTERED_ROUTER, stryMutAct_9fa48("95355") ? {} : (stryCov_9fa48("95355"), {
        address: handlerAddress,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Unregister this handler from a message router.
   * @param {Object} messageRouter - Message router instance.
   */
  unregisterFromRouter(messageRouter) {
    if (stryMutAct_9fa48("95356")) {
      {}
    } else {
      stryCov_9fa48("95356");
      if (stryMutAct_9fa48("95359") ? false : stryMutAct_9fa48("95358") ? true : stryMutAct_9fa48("95357") ? messageRouter : (stryCov_9fa48("95357", "95358", "95359"), !messageRouter)) {
        if (stryMutAct_9fa48("95360")) {
          {}
        } else {
          stryCov_9fa48("95360");
          return;
        }
      }
      const handlerAddress = (stryMutAct_9fa48("95361") ? `` : (stryCov_9fa48("95361"), `${this.nodeId}/${REPLICA_HANDLER_ADDRESS.SERVICE_SEGMENT}/`)) + (stryMutAct_9fa48("95362") ? `` : (stryCov_9fa48("95362"), `${REPLICA_HANDLER_ADDRESS.HANDLER_ID}`));
      messageRouter.unregister(handlerAddress);
      this.logger.info(REPLICA_HANDLER_LOG_MSG.UNREGISTERED_ROUTER, stryMutAct_9fa48("95363") ? {} : (stryCov_9fa48("95363"), {
        address: handlerAddress,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Shutdown the replica handler.
   */
  async shutdown() {
    if (stryMutAct_9fa48("95364")) {
      {}
    } else {
      stryCov_9fa48("95364");
      if (stryMutAct_9fa48("95366") ? false : stryMutAct_9fa48("95365") ? true : (stryCov_9fa48("95365", "95366"), this.shutdownPromise)) {
        if (stryMutAct_9fa48("95367")) {
          {}
        } else {
          stryCov_9fa48("95367");
          return this.shutdownPromise;
        }
      }
      this.shutdownPromise = (async () => {
        if (stryMutAct_9fa48("95368")) {
          {}
        } else {
          stryCov_9fa48("95368");
          this.logger.info(REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("95369") ? {} : (stryCov_9fa48("95369"), {
            nodeId: this.nodeId
          }));
          this.shuttingDown = stryMutAct_9fa48("95370") ? false : (stryCov_9fa48("95370"), true);
          for (const progress of this.creationProgressByReplica.values()) {
            if (stryMutAct_9fa48("95371")) {
              {}
            } else {
              stryCov_9fa48("95371");
              this.creationProgressReporter.fail(progress, REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("95372") ? {} : (stryCov_9fa48("95372"), {
                stage: ReplicaStatus.FAILED
              }));
            }
          }
          await Promise.allSettled(stryMutAct_9fa48("95373") ? [] : (stryCov_9fa48("95373"), [...this.operationTasks]));
          const servicesToShutdown = new Set(stryMutAct_9fa48("95374") ? [] : (stryCov_9fa48("95374"), [...this.localServices.values(), ...(stryMutAct_9fa48("95375") ? [...this.localReplicas.values()].map(replica => replica?.service) : (stryCov_9fa48("95375"), (stryMutAct_9fa48("95376") ? [] : (stryCov_9fa48("95376"), [...this.localReplicas.values()])).map(stryMutAct_9fa48("95377") ? () => undefined : (stryCov_9fa48("95377"), replica => stryMutAct_9fa48("95378") ? replica.service : (stryCov_9fa48("95378"), replica?.service))).filter(Boolean)))]));
          for (const service of servicesToShutdown) {
            if (stryMutAct_9fa48("95379")) {
              {}
            } else {
              stryCov_9fa48("95379");
              try {
                if (stryMutAct_9fa48("95380")) {
                  {}
                } else {
                  stryCov_9fa48("95380");
                  if (stryMutAct_9fa48("95383") ? typeof service.shutdown !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95382") ? false : stryMutAct_9fa48("95381") ? true : (stryCov_9fa48("95381", "95382", "95383"), typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION)) {
                    if (stryMutAct_9fa48("95384")) {
                      {}
                    } else {
                      stryCov_9fa48("95384");
                      await service.shutdown();
                    }
                  }
                }
              } catch (error) {
                if (stryMutAct_9fa48("95385")) {
                  {}
                } else {
                  stryCov_9fa48("95385");
                  this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, stryMutAct_9fa48("95386") ? {} : (stryCov_9fa48("95386"), {
                    nodeId: this.nodeId,
                    error: error.message
                  }));
                }
              }
            }
          }
          this.creationProgressByReplica.clear();
          this.inProgressOperations.clear();
          this.localServices.clear();
          this.localReplicas.clear();
          this.initialized = stryMutAct_9fa48("95387") ? true : (stryCov_9fa48("95387"), false);
          this.emit(REPLICA_HANDLER_EVENT.SHUTDOWN, stryMutAct_9fa48("95388") ? {} : (stryCov_9fa48("95388"), {
            nodeId: this.nodeId
          }));
        }
      })();
      return this.shutdownPromise;
    }
  }

  /**
   * Get service reference for a replica from local tracking.
   * @param {string} replicaId - Replica ID.
   * @return {Object|null} Service instance or null.
   * @private
   */
  getTrackedService(replicaId) {
    if (stryMutAct_9fa48("95389")) {
      {}
    } else {
      stryCov_9fa48("95389");
      const service = this.localServices.get(replicaId);
      if (stryMutAct_9fa48("95391") ? false : stryMutAct_9fa48("95390") ? true : (stryCov_9fa48("95390", "95391"), service)) {
        if (stryMutAct_9fa48("95392")) {
          {}
        } else {
          stryCov_9fa48("95392");
          return service;
        }
      }
      const trackedReplica = this.localReplicas.get(replicaId);
      if (stryMutAct_9fa48("95395") ? !trackedReplica && typeof trackedReplica !== REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95394") ? false : stryMutAct_9fa48("95393") ? true : (stryCov_9fa48("95393", "95394", "95395"), (stryMutAct_9fa48("95396") ? trackedReplica : (stryCov_9fa48("95396"), !trackedReplica)) || (stryMutAct_9fa48("95398") ? typeof trackedReplica === REPLICA_HANDLER_TYPEOF.OBJECT : stryMutAct_9fa48("95397") ? false : (stryCov_9fa48("95397", "95398"), typeof trackedReplica !== REPLICA_HANDLER_TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("95399")) {
          {}
        } else {
          stryCov_9fa48("95399");
          return null;
        }
      }
      if (stryMutAct_9fa48("95401") ? false : stryMutAct_9fa48("95400") ? true : (stryCov_9fa48("95400", "95401"), trackedReplica.service)) {
        if (stryMutAct_9fa48("95402")) {
          {}
        } else {
          stryCov_9fa48("95402");
          return trackedReplica.service;
        }
      }
      if (stryMutAct_9fa48("95405") ? typeof trackedReplica.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION && typeof trackedReplica.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95404") ? false : stryMutAct_9fa48("95403") ? true : (stryCov_9fa48("95403", "95404", "95405"), (stryMutAct_9fa48("95407") ? typeof trackedReplica.shutdown !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95406") ? false : (stryCov_9fa48("95406", "95407"), typeof trackedReplica.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION)) || (stryMutAct_9fa48("95409") ? typeof trackedReplica.syncFromLeader !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95408") ? false : (stryCov_9fa48("95408", "95409"), typeof trackedReplica.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("95410")) {
          {}
        } else {
          stryCov_9fa48("95410");
          return trackedReplica;
        }
      }
      return null;
    }
  }

  /**
   * Get normalized raft role from the locally tracked service owner.
   * @param {string} replicaId - Replica ID.
   * @return {string|null} Lower-cased raft role or null.
   * @private
   */
  getTrackedReplicaRole(replicaId) {
    if (stryMutAct_9fa48("95411")) {
      {}
    } else {
      stryCov_9fa48("95411");
      const service = this.getTrackedService(replicaId);
      if (stryMutAct_9fa48("95414") ? false : stryMutAct_9fa48("95413") ? true : stryMutAct_9fa48("95412") ? service : (stryCov_9fa48("95412", "95413", "95414"), !service)) {
        if (stryMutAct_9fa48("95415")) {
          {}
        } else {
          stryCov_9fa48("95415");
          return null;
        }
      }
      const role = (stryMutAct_9fa48("95418") ? typeof service.getRole !== REPLICA_HANDLER_TYPEOF.FUNCTION : stryMutAct_9fa48("95417") ? false : stryMutAct_9fa48("95416") ? true : (stryCov_9fa48("95416", "95417", "95418"), typeof service.getRole === REPLICA_HANDLER_TYPEOF.FUNCTION)) ? service.getRole() : service.role;
      return (stryMutAct_9fa48("95421") ? typeof role !== REPLICA_HANDLER_TYPEOF.STRING : stryMutAct_9fa48("95420") ? false : stryMutAct_9fa48("95419") ? true : (stryCov_9fa48("95419", "95420", "95421"), typeof role === REPLICA_HANDLER_TYPEOF.STRING)) ? stryMutAct_9fa48("95422") ? role.toUpperCase() : (stryCov_9fa48("95422"), role.toLowerCase()) : null;
    }
  }

  /**
   * Build the canonical service address for a tracked replica.
   * @param {string} replicaId - Replica ID.
   * @return {string} Formatted address.
   * @private
   */
  buildTrackedServiceAddress(replicaId) {
    if (stryMutAct_9fa48("95423")) {
      {}
    } else {
      stryCov_9fa48("95423");
      const addressManager = AddressManager.getInstance();
      return addressManager.format(this.nodeId, REPLICA_HANDLER_SERVICE.TYPE, replicaId);
    }
  }

  /**
   * Update local replica metadata while preserving existing fields.
   * @param {string} replicaId - Replica ID.
   * @param {Object} updates - Fields to merge.
   * @return {Object} Updated local replica metadata.
   * @private
   */
  setLocalReplica(replicaId, updates) {
    if (stryMutAct_9fa48("95424")) {
      {}
    } else {
      stryCov_9fa48("95424");
      const existing = stryMutAct_9fa48("95427") ? this.localReplicas.get(replicaId) && {} : stryMutAct_9fa48("95426") ? false : stryMutAct_9fa48("95425") ? true : (stryCov_9fa48("95425", "95426", "95427"), this.localReplicas.get(replicaId) || {});
      const merged = stryMutAct_9fa48("95428") ? {} : (stryCov_9fa48("95428"), {
        ...existing,
        ...updates,
        replicaId: stryMutAct_9fa48("95431") ? (updates.replicaId || existing.replicaId) && replicaId : stryMutAct_9fa48("95430") ? false : stryMutAct_9fa48("95429") ? true : (stryCov_9fa48("95429", "95430", "95431"), (stryMutAct_9fa48("95433") ? updates.replicaId && existing.replicaId : stryMutAct_9fa48("95432") ? false : (stryCov_9fa48("95432", "95433"), updates.replicaId || existing.replicaId)) || replicaId)
      });
      this.localReplicas.set(replicaId, merged);
      return merged;
    }
  }
}
export { ReplicaHandler };