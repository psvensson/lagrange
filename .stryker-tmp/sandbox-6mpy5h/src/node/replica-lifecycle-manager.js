/**
 * Replica Lifecycle Manager - Handles CREATE_REPLICA and REMOVE_REPLICA messages.
 * Manages the lifecycle of partition replicas on a node.
 *
 * NOTE: This class delegates to ReplicaHandler for execution and tracking.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9,
 *               10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16,
 *               10.17, 10.18, 10.19, 10.26, 10.27, 10.28, 10.29
 *               1.1, 1.2 (simplified architecture)
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
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { SERVICE_TYPE, TYPEOF } from '../constants/index.js';
import { STORAGE_DEFAULT } from '../storage/storage-constants.js';
import { assertCritical } from '../utils/assert.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { REPLICA_LIFECYCLE_ACK_STATUS, REPLICA_LIFECYCLE_DEFAULT, REPLICA_LIFECYCLE_ERROR_MSG, REPLICA_LIFECYCLE_EVENT, REPLICA_LIFECYCLE_LOG_MSG, REPLICA_LIFECYCLE_MESSAGE_TYPE, REPLICA_LIFECYCLE_NUM, REPLICA_LIFECYCLE_PENDING_STATUS, REPLICA_LIFECYCLE_STATUS, REPLICA_LIFECYCLE_SUBSYSTEM, REPLICA_LIFECYCLE_VALID_TRANSITIONS } from './replica-lifecycle-constants.js';
import { ReplicaHandler } from './replica-handler.js';

/**
 * Replica status values for lifecycle management.
 */
const ReplicaStatus = REPLICA_LIFECYCLE_STATUS;

/**
 * Valid status transitions for replica lifecycle.
 * Key: current status, Value: array of valid next statuses.
 */
const VALID_STATUS_TRANSITIONS = REPLICA_LIFECYCLE_VALID_TRANSITIONS;

/**
 * Message types for replica lifecycle operations.
 */
const MessageType = REPLICA_LIFECYCLE_MESSAGE_TYPE;

/**
 * ACK status values.
 */
const AckStatus = REPLICA_LIFECYCLE_ACK_STATUS;
function guardedMutationApplied(result) {
  if (stryMutAct_9fa48("95528")) {
    {}
  } else {
    stryCov_9fa48("95528");
    if (stryMutAct_9fa48("95531") ? result?.success !== false : stryMutAct_9fa48("95530") ? false : stryMutAct_9fa48("95529") ? true : (stryCov_9fa48("95529", "95530", "95531"), (stryMutAct_9fa48("95532") ? result.success : (stryCov_9fa48("95532"), result?.success)) === (stryMutAct_9fa48("95533") ? true : (stryCov_9fa48("95533"), false)))) {
      if (stryMutAct_9fa48("95534")) {
        {}
      } else {
        stryCov_9fa48("95534");
        return stryMutAct_9fa48("95535") ? true : (stryCov_9fa48("95535"), false);
      }
    }
    const affectedRows = Number(stryMutAct_9fa48("95537") ? result.partitionResult?.affectedRows : stryMutAct_9fa48("95536") ? result?.partitionResult.affectedRows : (stryCov_9fa48("95536", "95537"), result?.partitionResult?.affectedRows));
    return stryMutAct_9fa48("95540") ? !Number.isFinite(affectedRows) && affectedRows > REPLICA_LIFECYCLE_NUM.ZERO : stryMutAct_9fa48("95539") ? false : stryMutAct_9fa48("95538") ? true : (stryCov_9fa48("95538", "95539", "95540"), (stryMutAct_9fa48("95541") ? Number.isFinite(affectedRows) : (stryCov_9fa48("95541"), !Number.isFinite(affectedRows))) || (stryMutAct_9fa48("95544") ? affectedRows <= REPLICA_LIFECYCLE_NUM.ZERO : stryMutAct_9fa48("95543") ? affectedRows >= REPLICA_LIFECYCLE_NUM.ZERO : stryMutAct_9fa48("95542") ? false : (stryCov_9fa48("95542", "95543", "95544"), affectedRows > REPLICA_LIFECYCLE_NUM.ZERO)));
  }
}
function buildObservedReplicaWhereClause(service) {
  if (stryMutAct_9fa48("95545")) {
    {}
  } else {
    stryCov_9fa48("95545");
    const whereClause = stryMutAct_9fa48("95546") ? {} : (stryCov_9fa48("95546"), {
      service_id: service.service_id
    });
    if (stryMutAct_9fa48("95549") ? typeof service?.node_id === TYPEOF.STRING || service.node_id.length > 0 : stryMutAct_9fa48("95548") ? false : stryMutAct_9fa48("95547") ? true : (stryCov_9fa48("95547", "95548", "95549"), (stryMutAct_9fa48("95551") ? typeof service?.node_id !== TYPEOF.STRING : stryMutAct_9fa48("95550") ? true : (stryCov_9fa48("95550", "95551"), typeof (stryMutAct_9fa48("95552") ? service.node_id : (stryCov_9fa48("95552"), service?.node_id)) === TYPEOF.STRING)) && (stryMutAct_9fa48("95555") ? service.node_id.length <= 0 : stryMutAct_9fa48("95554") ? service.node_id.length >= 0 : stryMutAct_9fa48("95553") ? true : (stryCov_9fa48("95553", "95554", "95555"), service.node_id.length > 0)))) {
      if (stryMutAct_9fa48("95556")) {
        {}
      } else {
        stryCov_9fa48("95556");
        whereClause.node_id = service.node_id;
      }
    }
    if (stryMutAct_9fa48("95559") ? typeof service?.status === TYPEOF.STRING || service.status.length > 0 : stryMutAct_9fa48("95558") ? false : stryMutAct_9fa48("95557") ? true : (stryCov_9fa48("95557", "95558", "95559"), (stryMutAct_9fa48("95561") ? typeof service?.status !== TYPEOF.STRING : stryMutAct_9fa48("95560") ? true : (stryCov_9fa48("95560", "95561"), typeof (stryMutAct_9fa48("95562") ? service.status : (stryCov_9fa48("95562"), service?.status)) === TYPEOF.STRING)) && (stryMutAct_9fa48("95565") ? service.status.length <= 0 : stryMutAct_9fa48("95564") ? service.status.length >= 0 : stryMutAct_9fa48("95563") ? true : (stryCov_9fa48("95563", "95564", "95565"), service.status.length > 0)))) {
      if (stryMutAct_9fa48("95566")) {
        {}
      } else {
        stryCov_9fa48("95566");
        whereClause.status = service.status;
      }
    }
    if (stryMutAct_9fa48("95568") ? false : stryMutAct_9fa48("95567") ? true : (stryCov_9fa48("95567", "95568"), Number.isFinite(stryMutAct_9fa48("95569") ? service.updated_at : (stryCov_9fa48("95569"), service?.updated_at)))) {
      if (stryMutAct_9fa48("95570")) {
        {}
      } else {
        stryCov_9fa48("95570");
        whereClause.updated_at = service.updated_at;
      }
    }
    return whereClause;
  }
}

/**
 * ReplicaLifecycleManager handles CREATE_REPLICA and REMOVE_REPLICA messages.
 * It manages the complete lifecycle of partition replicas on a node.
 *
 * When replicaHandler is set, this class delegates to it for actual execution.
 * The replicaHandler owns local replica state tracking in the new architecture.
 */
class ReplicaLifecycleManager extends EventEmitter {
  /**
   * Create a new ReplicaLifecycleManager.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID hosting this manager.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {Object} options.messageGroupService - Message group service for routing.
   * @param {Function} options.createPartitionService - Factory for creating partitions.
   * @param {string} options.dataDir - Base data directory for partition storage.
   * @param {Object} options.replicaStateMachine - Replica state machine instance.
   * @param {Object} options.replicaHandler - ReplicaHandler instance for delegation
   *   (new simplified architecture - Requirements 1.1, 1.2).
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("95571")) {
      {}
    } else {
      stryCov_9fa48("95571");
      super();
      this.nodeId = stryMutAct_9fa48("95574") ? options.nodeId && REPLICA_LIFECYCLE_DEFAULT.UNKNOWN_NODE_ID : stryMutAct_9fa48("95573") ? false : stryMutAct_9fa48("95572") ? true : (stryCov_9fa48("95572", "95573", "95574"), options.nodeId || REPLICA_LIFECYCLE_DEFAULT.UNKNOWN_NODE_ID);
      this.systemTableCache = stryMutAct_9fa48("95577") ? options.systemTableCache && null : stryMutAct_9fa48("95576") ? false : stryMutAct_9fa48("95575") ? true : (stryCov_9fa48("95575", "95576", "95577"), options.systemTableCache || null);
      this.cdcIntegrationService = stryMutAct_9fa48("95580") ? options.cdcIntegrationService && null : stryMutAct_9fa48("95579") ? false : stryMutAct_9fa48("95578") ? true : (stryCov_9fa48("95578", "95579", "95580"), options.cdcIntegrationService || null);
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("95583") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("95582") ? false : stryMutAct_9fa48("95581") ? true : (stryCov_9fa48("95581", "95582", "95583"), options.controlPlaneSystemTableGateway || null);
      this.messageGroupService = stryMutAct_9fa48("95586") ? options.messageGroupService && null : stryMutAct_9fa48("95585") ? false : stryMutAct_9fa48("95584") ? true : (stryCov_9fa48("95584", "95585", "95586"), options.messageGroupService || null);
      this.createPartitionService = stryMutAct_9fa48("95589") ? options.createPartitionService && null : stryMutAct_9fa48("95588") ? false : stryMutAct_9fa48("95587") ? true : (stryCov_9fa48("95587", "95588", "95589"), options.createPartitionService || null);
      this.dataDir = stryMutAct_9fa48("95592") ? options.dataDir && REPLICA_LIFECYCLE_DEFAULT.DATA_DIR : stryMutAct_9fa48("95591") ? false : stryMutAct_9fa48("95590") ? true : (stryCov_9fa48("95590", "95591", "95592"), options.dataDir || REPLICA_LIFECYCLE_DEFAULT.DATA_DIR);
      this.replicaStateMachine = stryMutAct_9fa48("95595") ? options.replicaStateMachine && null : stryMutAct_9fa48("95594") ? false : stryMutAct_9fa48("95593") ? true : (stryCov_9fa48("95593", "95594", "95595"), options.replicaStateMachine || null);
      this.replicaHandler = stryMutAct_9fa48("95598") ? options.replicaHandler && null : stryMutAct_9fa48("95597") ? false : stryMutAct_9fa48("95596") ? true : (stryCov_9fa48("95596", "95597", "95598"), options.replicaHandler || null);

      // Track pending operations by request_id
      this.pendingOperations = new Map();
      this.ownsReplicaHandler = stryMutAct_9fa48("95599") ? true : (stryCov_9fa48("95599"), false);
      this.shutdownPromise = null;
      assertCritical(stryMutAct_9fa48("95602") ? this.replicaHandler && this.createPartitionService : stryMutAct_9fa48("95601") ? false : stryMutAct_9fa48("95600") ? true : (stryCov_9fa48("95600", "95601", "95602"), this.replicaHandler || this.createPartitionService), REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
      if (stryMutAct_9fa48("95605") ? false : stryMutAct_9fa48("95604") ? true : stryMutAct_9fa48("95603") ? this.replicaHandler : (stryCov_9fa48("95603", "95604", "95605"), !this.replicaHandler)) {
        if (stryMutAct_9fa48("95606")) {
          {}
        } else {
          stryCov_9fa48("95606");
          this.replicaHandler = new ReplicaHandler(stryMutAct_9fa48("95607") ? {} : (stryCov_9fa48("95607"), {
            nodeId: this.nodeId,
            systemTableCache: this.systemTableCache,
            cdcIntegrationService: this.cdcIntegrationService,
            controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
            createPartitionService: this.createPartitionService,
            dataDir: this.dataDir
          }));
          this.ownsReplicaHandler = stryMutAct_9fa48("95608") ? false : (stryCov_9fa48("95608"), true);
        }
      }
      // Backward-compatible test hook: mirrors handler-owned local replica metadata map.
      this.localReplicas = stryMutAct_9fa48("95611") ? (this.replicaHandler.localReplicas || this.replicaHandler.localServices) && new Map() : stryMutAct_9fa48("95610") ? false : stryMutAct_9fa48("95609") ? true : (stryCov_9fa48("95609", "95610", "95611"), (stryMutAct_9fa48("95613") ? this.replicaHandler.localReplicas && this.replicaHandler.localServices : stryMutAct_9fa48("95612") ? false : (stryCov_9fa48("95612", "95613"), this.replicaHandler.localReplicas || this.replicaHandler.localServices)) || new Map());

      // Configuration
      const config = ConfigurationManager.getInstance();
      this.operationTimeoutMs = stryMutAct_9fa48("95616") ? config.get(CONFIG_KEY.LIFECYCLE_OPERATION_TIMEOUT_MS) && REPLICA_LIFECYCLE_DEFAULT.OPERATION_TIMEOUT_MS : stryMutAct_9fa48("95615") ? false : stryMutAct_9fa48("95614") ? true : (stryCov_9fa48("95614", "95615", "95616"), config.get(CONFIG_KEY.LIFECYCLE_OPERATION_TIMEOUT_MS) || REPLICA_LIFECYCLE_DEFAULT.OPERATION_TIMEOUT_MS);
      this.syncTimeoutMs = stryMutAct_9fa48("95619") ? config.get(CONFIG_KEY.LIFECYCLE_SYNC_TIMEOUT_MS) && REPLICA_LIFECYCLE_DEFAULT.SYNC_TIMEOUT_MS : stryMutAct_9fa48("95618") ? false : stryMutAct_9fa48("95617") ? true : (stryCov_9fa48("95617", "95618", "95619"), config.get(CONFIG_KEY.LIFECYCLE_SYNC_TIMEOUT_MS) || REPLICA_LIFECYCLE_DEFAULT.SYNC_TIMEOUT_MS);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(REPLICA_LIFECYCLE_SUBSYSTEM) : console;
      this.initialized = stryMutAct_9fa48("95620") ? true : (stryCov_9fa48("95620"), false);
    }
  }

  /**
   * Initialize the replica lifecycle manager.
   */
  initialize() {
    if (stryMutAct_9fa48("95621")) {
      {}
    } else {
      stryCov_9fa48("95621");
      if (stryMutAct_9fa48("95623") ? false : stryMutAct_9fa48("95622") ? true : (stryCov_9fa48("95622", "95623"), this.initialized)) {
        if (stryMutAct_9fa48("95624")) {
          {}
        } else {
          stryCov_9fa48("95624");
          return;
        }
      }
      this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.INITIALIZING, stryMutAct_9fa48("95625") ? {} : (stryCov_9fa48("95625"), {
        nodeId: this.nodeId,
        dataDir: this.dataDir,
        usingReplicaHandler: stryMutAct_9fa48("95626") ? !this.replicaHandler : (stryCov_9fa48("95626"), !(stryMutAct_9fa48("95627") ? this.replicaHandler : (stryCov_9fa48("95627"), !this.replicaHandler)))
      }));
      if (stryMutAct_9fa48("95630") ? this.replicaHandler || typeof this.replicaHandler.initialize === TYPEOF.FUNCTION : stryMutAct_9fa48("95629") ? false : stryMutAct_9fa48("95628") ? true : (stryCov_9fa48("95628", "95629", "95630"), this.replicaHandler && (stryMutAct_9fa48("95632") ? typeof this.replicaHandler.initialize !== TYPEOF.FUNCTION : stryMutAct_9fa48("95631") ? true : (stryCov_9fa48("95631", "95632"), typeof this.replicaHandler.initialize === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("95633")) {
          {}
        } else {
          stryCov_9fa48("95633");
          this.replicaHandler.initialize();
        }
      }

      // Register message handlers with message group service
      if (stryMutAct_9fa48("95635") ? false : stryMutAct_9fa48("95634") ? true : (stryCov_9fa48("95634", "95635"), this.messageGroupService)) {
        if (stryMutAct_9fa48("95636")) {
          {}
        } else {
          stryCov_9fa48("95636");
          this.registerMessageHandlers();
        }
      }
      this.initialized = stryMutAct_9fa48("95637") ? false : (stryCov_9fa48("95637"), true);
      this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.INITIALIZED, stryMutAct_9fa48("95638") ? {} : (stryCov_9fa48("95638"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Set the ReplicaHandler for delegated execution.
   * When set, operations are delegated to the handler.
   * Requirements: 1.1, 1.2
   * @param {Object} handler - ReplicaHandler instance.
   */
  setReplicaHandler(handler) {
    if (stryMutAct_9fa48("95639")) {
      {}
    } else {
      stryCov_9fa48("95639");
      assertCritical(handler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
      this.replicaHandler = handler;
      this.ownsReplicaHandler = stryMutAct_9fa48("95640") ? true : (stryCov_9fa48("95640"), false);
      this.localReplicas = stryMutAct_9fa48("95643") ? (handler.localReplicas || handler.localServices) && new Map() : stryMutAct_9fa48("95642") ? false : stryMutAct_9fa48("95641") ? true : (stryCov_9fa48("95641", "95642", "95643"), (stryMutAct_9fa48("95645") ? handler.localReplicas && handler.localServices : stryMutAct_9fa48("95644") ? false : (stryCov_9fa48("95644", "95645"), handler.localReplicas || handler.localServices)) || new Map());
      this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.HANDLER_SET, stryMutAct_9fa48("95646") ? {} : (stryCov_9fa48("95646"), {
        nodeId: this.nodeId,
        hasHandler: stryMutAct_9fa48("95647") ? false : (stryCov_9fa48("95647"), true)
      }));
      if (stryMutAct_9fa48("95650") ? typeof handler.initialize !== TYPEOF.FUNCTION : stryMutAct_9fa48("95649") ? false : stryMutAct_9fa48("95648") ? true : (stryCov_9fa48("95648", "95649", "95650"), typeof handler.initialize === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("95651")) {
          {}
        } else {
          stryCov_9fa48("95651");
          handler.initialize();
        }
      }
    }
  }

  /**
   * Register message handlers with the message group service.
   * Note: Message routing is now handled via transport registration
   * at the ${nodeId}/lifecycle address. This method does not register
   * handlers directly.
   * @private
   */
  registerMessageHandlers() {
    if (stryMutAct_9fa48("95652")) {
      {}
    } else {
      stryCov_9fa48("95652");
      if (stryMutAct_9fa48("95655") ? false : stryMutAct_9fa48("95654") ? true : stryMutAct_9fa48("95653") ? this.messageGroupService : (stryCov_9fa48("95653", "95654", "95655"), !this.messageGroupService)) {
        if (stryMutAct_9fa48("95656")) {
          {}
        } else {
          stryCov_9fa48("95656");
          this.logger.warn(REPLICA_LIFECYCLE_LOG_MSG.NO_MESSAGE_GROUP);
          return;
        }
      }

      // Message handlers are now registered via transport at ${nodeId}/lifecycle/manager
      // The bootstrap/joining services register the transport handler that calls
      // handleCreateReplica and handleRemoveReplica directly.
      this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.HANDLERS_REGISTERED, stryMutAct_9fa48("95657") ? {} : (stryCov_9fa48("95657"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Validate a status transition.
   * @param {string} currentStatus - Current replica status.
   * @param {string} newStatus - Proposed new status.
   * @return {boolean} True if transition is valid.
   */
  isValidTransition(currentStatus, newStatus) {
    if (stryMutAct_9fa48("95658")) {
      {}
    } else {
      stryCov_9fa48("95658");
      // Any state can transition to FAILED
      if (stryMutAct_9fa48("95661") ? newStatus !== ReplicaStatus.FAILED : stryMutAct_9fa48("95660") ? false : stryMutAct_9fa48("95659") ? true : (stryCov_9fa48("95659", "95660", "95661"), newStatus === ReplicaStatus.FAILED)) {
        if (stryMutAct_9fa48("95662")) {
          {}
        } else {
          stryCov_9fa48("95662");
          return stryMutAct_9fa48("95663") ? false : (stryCov_9fa48("95663"), true);
        }
      }
      const validNextStates = stryMutAct_9fa48("95666") ? VALID_STATUS_TRANSITIONS[currentStatus] && [] : stryMutAct_9fa48("95665") ? false : stryMutAct_9fa48("95664") ? true : (stryCov_9fa48("95664", "95665", "95666"), VALID_STATUS_TRANSITIONS[currentStatus] || (stryMutAct_9fa48("95667") ? ["Stryker was here"] : (stryCov_9fa48("95667"), [])));
      return validNextStates.includes(newStatus);
    }
  }

  /**
   * Update replica status with validation.
   * @param {string} replicaId - Replica ID.
   * @param {string} newStatus - New status.
   * @param {Object} additionalData - Additional data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateReplicaStatus(replicaId, newStatus, additionalData = {}) {
    if (stryMutAct_9fa48("95668")) {
      {}
    } else {
      stryCov_9fa48("95668");
      const replica = this.replicaHandler.getLocalReplica(replicaId);
      const currentStatus = stryMutAct_9fa48("95671") ? replica?.status && ReplicaStatus.STARTING : stryMutAct_9fa48("95670") ? false : stryMutAct_9fa48("95669") ? true : (stryCov_9fa48("95669", "95670", "95671"), (stryMutAct_9fa48("95672") ? replica.status : (stryCov_9fa48("95672"), replica?.status)) || ReplicaStatus.STARTING);

      // Validate transition
      if (stryMutAct_9fa48("95675") ? false : stryMutAct_9fa48("95674") ? true : stryMutAct_9fa48("95673") ? this.isValidTransition(currentStatus, newStatus) : (stryCov_9fa48("95673", "95674", "95675"), !this.isValidTransition(currentStatus, newStatus))) {
        if (stryMutAct_9fa48("95676")) {
          {}
        } else {
          stryCov_9fa48("95676");
          this.logger.error(REPLICA_LIFECYCLE_LOG_MSG.INVALID_TRANSITION, stryMutAct_9fa48("95677") ? {} : (stryCov_9fa48("95677"), {
            replicaId,
            currentStatus,
            newStatus,
            nodeId: this.nodeId
          }));
          throw new Error(REPLICA_LIFECYCLE_ERROR_MSG.invalidTransition(currentStatus, newStatus));
        }
      }
      this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.STATUS_UPDATE, stryMutAct_9fa48("95678") ? {} : (stryCov_9fa48("95678"), {
        replicaId,
        currentStatus,
        newStatus,
        nodeId: this.nodeId
      }));

      // Update local tracking
      if (stryMutAct_9fa48("95680") ? false : stryMutAct_9fa48("95679") ? true : (stryCov_9fa48("95679", "95680"), replica)) {
        if (stryMutAct_9fa48("95681")) {
          {}
        } else {
          stryCov_9fa48("95681");
          replica.status = newStatus;
        }
      }

      // Update via CDC using UPDATE (not upsert/INSERT OR REPLACE)
      // The seed node already inserted the row with all fields before sending
      // CREATE_REPLICA. Using INSERT OR REPLACE would overwrite the entire row
      // and lose fields like partition_id, raft_role, created_at, etc.
      if (stryMutAct_9fa48("95684") ? this.cdcIntegrationService && this.controlPlaneSystemTableGateway : stryMutAct_9fa48("95683") ? false : stryMutAct_9fa48("95682") ? true : (stryCov_9fa48("95682", "95683", "95684"), this.cdcIntegrationService || this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("95685")) {
          {}
        } else {
          stryCov_9fa48("95685");
          const result = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("95686") ? {} : (stryCov_9fa48("95686"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
            tableName: SYSTEM_TABLE_NAME.SERVICES,
            whereClause: stryMutAct_9fa48("95687") ? {} : (stryCov_9fa48("95687"), {
              service_id: replicaId
            }),
            data: stryMutAct_9fa48("95688") ? {} : (stryCov_9fa48("95688"), {
              status: newStatus,
              updated_at: Date.now(),
              ...additionalData
            })
          }), stryMutAct_9fa48("95689") ? {} : (stryCov_9fa48("95689"), {
            workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
            deliveryPriority: stryMutAct_9fa48("95690") ? "" : (stryCov_9fa48("95690"), 'critical')
          }));
          if (stryMutAct_9fa48("95693") ? result || result.success === false : stryMutAct_9fa48("95692") ? false : stryMutAct_9fa48("95691") ? true : (stryCov_9fa48("95691", "95692", "95693"), result && (stryMutAct_9fa48("95695") ? result.success !== false : stryMutAct_9fa48("95694") ? true : (stryCov_9fa48("95694", "95695"), result.success === (stryMutAct_9fa48("95696") ? true : (stryCov_9fa48("95696"), false)))))) {
            if (stryMutAct_9fa48("95697")) {
              {}
            } else {
              stryCov_9fa48("95697");
              this.logger.error(REPLICA_LIFECYCLE_LOG_MSG.CDC_UPDATE_FAILED, stryMutAct_9fa48("95698") ? {} : (stryCov_9fa48("95698"), {
                replicaId,
                newStatus,
                error: result.error
              }));
              throw new Error(REPLICA_LIFECYCLE_ERROR_MSG.statusUpdateFailed(result.error));
            }
          }
        }
      }
      this.emit(REPLICA_LIFECYCLE_EVENT.STATUS_CHANGED, stryMutAct_9fa48("95699") ? {} : (stryCov_9fa48("95699"), {
        replicaId,
        previousStatus: currentStatus,
        newStatus,
        nodeId: this.nodeId
      }));
      return stryMutAct_9fa48("95700") ? {} : (stryCov_9fa48("95700"), {
        success: stryMutAct_9fa48("95701") ? false : (stryCov_9fa48("95701"), true),
        previousStatus: currentStatus,
        newStatus
      });
    }
  }

  /**
   * Handle CREATE_REPLICA message.
   * Implements idempotent operation handling per Requirements 9.1, 9.2.
   * When replicaHandler is set, delegates to it (Requirements 1.1, 1.2).
   * @param {Object} message - CREATE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   */
  async handleCreateReplica(message) {
    if (stryMutAct_9fa48("95702")) {
      {}
    } else {
      stryCov_9fa48("95702");
      const {
        request_id: requestId,
        partition_id: partitionId,
        table_name: tableName,
        replica_id: replicaId,
        leader_address: _leaderAddress,
        key_range: _keyRange,
        schema: _schema
      } = message;
      this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.CREATE_REQUEST, stryMutAct_9fa48("95703") ? {} : (stryCov_9fa48("95703"), {
        requestId,
        partitionId,
        replicaId,
        tableName,
        nodeId: this.nodeId,
        usingReplicaHandler: stryMutAct_9fa48("95704") ? !this.replicaHandler : (stryCov_9fa48("95704"), !(stryMutAct_9fa48("95705") ? this.replicaHandler : (stryCov_9fa48("95705"), !this.replicaHandler)))
      }));
      assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
      return this.delegateCreateToHandler(message);
    }
  }

  /**
   * Delegate CREATE_REPLICA to ReplicaHandler.
   * Requirements: 1.1, 1.2
   * @param {Object} message - CREATE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async delegateCreateToHandler(message) {
    if (stryMutAct_9fa48("95706")) {
      {}
    } else {
      stryCov_9fa48("95706");
      const {
        request_id: requestId,
        partition_id: partitionId,
        replica_id: replicaId,
        table_name: tableName,
        table_id: tableId,
        schema,
        key_range: keyRange,
        leader_address: leaderAddress,
        replica_ids: replicaIds,
        peer_addresses: peerAddresses
      } = message;

      // Convert message format for handler
      const handlerRequest = stryMutAct_9fa48("95707") ? {} : (stryCov_9fa48("95707"), {
        operationId: requestId,
        partitionId,
        replicaId,
        tableName,
        tableId,
        schema,
        keyRange,
        leaderAddress,
        replicaIds,
        peerAddresses: stryMutAct_9fa48("95710") ? peerAddresses && [] : stryMutAct_9fa48("95709") ? false : stryMutAct_9fa48("95708") ? true : (stryCov_9fa48("95708", "95709", "95710"), peerAddresses || (stryMutAct_9fa48("95711") ? ["Stryker was here"] : (stryCov_9fa48("95711"), [])))
      });
      const response = await this.replicaHandler.handleCreateReplica(handlerRequest);

      // Convert response format for lifecycle acknowledgments
      return stryMutAct_9fa48("95712") ? {} : (stryCov_9fa48("95712"), {
        type: MessageType.CREATE_REPLICA_ACK,
        request_id: requestId,
        status: response.status,
        replica_id: response.replicaId,
        node_id: this.nodeId
      });
    }
  }

  /**
   * Handle REMOVE_REPLICA message.
   * Implements idempotent operation handling per Requirements 9.3, 9.4.
   * When replicaHandler is set, delegates to it (Requirements 1.1, 1.2).
   * @param {Object} message - REMOVE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   */
  async handleRemoveReplica(message) {
    if (stryMutAct_9fa48("95713")) {
      {}
    } else {
      stryCov_9fa48("95713");
      const {
        request_id: requestId,
        partition_id: partitionId,
        replica_id: replicaId,
        reason
      } = message;
      this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.REMOVE_REQUEST, stryMutAct_9fa48("95714") ? {} : (stryCov_9fa48("95714"), {
        requestId,
        partitionId,
        replicaId,
        reason,
        nodeId: this.nodeId,
        usingReplicaHandler: stryMutAct_9fa48("95715") ? !this.replicaHandler : (stryCov_9fa48("95715"), !(stryMutAct_9fa48("95716") ? this.replicaHandler : (stryCov_9fa48("95716"), !this.replicaHandler)))
      }));
      assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
      return this.delegateRemoveToHandler(message);
    }
  }

  /**
   * Delegate REMOVE_REPLICA to ReplicaHandler.
   * Requirements: 1.1, 1.2
   * @param {Object} message - REMOVE_REPLICA message.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async delegateRemoveToHandler(message) {
    if (stryMutAct_9fa48("95717")) {
      {}
    } else {
      stryCov_9fa48("95717");
      const {
        request_id: requestId,
        partition_id: partitionId,
        replica_id: replicaId,
        reason
      } = message;

      // Convert message format for handler
      const handlerRequest = stryMutAct_9fa48("95718") ? {} : (stryCov_9fa48("95718"), {
        operationId: requestId,
        partitionId,
        replicaId,
        reason
      });
      const response = await this.replicaHandler.handleRemoveReplica(handlerRequest);

      // Convert response format for lifecycle acknowledgments
      return stryMutAct_9fa48("95719") ? {} : (stryCov_9fa48("95719"), {
        type: MessageType.REMOVE_REPLICA_ACK,
        request_id: requestId,
        status: response.status,
        replica_id: response.replicaId,
        node_id: this.nodeId
      });
    }
  }

  /**
   * Sync Raft log from leader.
   * @param {string} replicaId - Replica ID.
   * @param {string} leaderAddress - Leader address.
   * @return {Promise<void>}
   * @private
   */
  async syncRaftLog(replicaId, leaderAddress) {
    if (stryMutAct_9fa48("95720")) {
      {}
    } else {
      stryCov_9fa48("95720");
      this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.RAFT_SYNC_START, stryMutAct_9fa48("95721") ? {} : (stryCov_9fa48("95721"), {
        replicaId,
        leaderAddress,
        nodeId: this.nodeId
      }));
      const replica = this.replicaHandler.getLocalReplica(replicaId);
      if (stryMutAct_9fa48("95724") ? !replica && !replica.service : stryMutAct_9fa48("95723") ? false : stryMutAct_9fa48("95722") ? true : (stryCov_9fa48("95722", "95723", "95724"), (stryMutAct_9fa48("95725") ? replica : (stryCov_9fa48("95725"), !replica)) || (stryMutAct_9fa48("95726") ? replica.service : (stryCov_9fa48("95726"), !replica.service)))) {
        if (stryMutAct_9fa48("95727")) {
          {}
        } else {
          stryCov_9fa48("95727");
          throw new Error(REPLICA_LIFECYCLE_ERROR_MSG.replicaServiceMissing(replicaId));
        }
      }

      // The actual sync is handled by the Raft implementation
      // This is a placeholder for the sync coordination
      if (stryMutAct_9fa48("95730") ? typeof replica.service.syncFromLeader !== TYPEOF.FUNCTION : stryMutAct_9fa48("95729") ? false : stryMutAct_9fa48("95728") ? true : (stryCov_9fa48("95728", "95729", "95730"), typeof replica.service.syncFromLeader === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("95731")) {
          {}
        } else {
          stryCov_9fa48("95731");
          await replica.service.syncFromLeader(leaderAddress);
        }
      }
      this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.RAFT_SYNC_COMPLETE, stryMutAct_9fa48("95732") ? {} : (stryCov_9fa48("95732"), {
        replicaId,
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Clean up local resources for a replica.
   * @param {string} partitionId - Partition ID.
   * @param {string} replicaId - Replica ID.
   * @return {Promise<void>}
   * @private
   */
  async cleanupReplicaResources(partitionId, replicaId) {
    if (stryMutAct_9fa48("95733")) {
      {}
    } else {
      stryCov_9fa48("95733");
      const dbPath = this.getPartitionDbPath(partitionId, replicaId);
      this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.CLEANUP_RESOURCES, stryMutAct_9fa48("95734") ? {} : (stryCov_9fa48("95734"), {
        replicaId,
        partitionId,
        dbPath,
        nodeId: this.nodeId
      }));
      try {
        if (stryMutAct_9fa48("95735")) {
          {}
        } else {
          stryCov_9fa48("95735");
          // Remove SQLite database file
          if (stryMutAct_9fa48("95737") ? false : stryMutAct_9fa48("95736") ? true : (stryCov_9fa48("95736", "95737"), fs.existsSync(dbPath))) {
            if (stryMutAct_9fa48("95738")) {
              {}
            } else {
              stryCov_9fa48("95738");
              fs.unlinkSync(dbPath);
              this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.REMOVED_DB_FILE, stryMutAct_9fa48("95739") ? {} : (stryCov_9fa48("95739"), {
                dbPath
              }));
            }
          }

          // Remove WAL and SHM files if they exist
          const walPath = stryMutAct_9fa48("95740") ? `` : (stryCov_9fa48("95740"), `${dbPath}-wal`);
          const shmPath = stryMutAct_9fa48("95741") ? `` : (stryCov_9fa48("95741"), `${dbPath}-shm`);
          if (stryMutAct_9fa48("95743") ? false : stryMutAct_9fa48("95742") ? true : (stryCov_9fa48("95742", "95743"), fs.existsSync(walPath))) {
            if (stryMutAct_9fa48("95744")) {
              {}
            } else {
              stryCov_9fa48("95744");
              fs.unlinkSync(walPath);
            }
          }
          if (stryMutAct_9fa48("95746") ? false : stryMutAct_9fa48("95745") ? true : (stryCov_9fa48("95745", "95746"), fs.existsSync(shmPath))) {
            if (stryMutAct_9fa48("95747")) {
              {}
            } else {
              stryCov_9fa48("95747");
              fs.unlinkSync(shmPath);
            }
          }

          // Try to remove partition directory if empty
          const partitionDir = path.dirname(dbPath);
          try {
            if (stryMutAct_9fa48("95748")) {
              {}
            } else {
              stryCov_9fa48("95748");
              const files = fs.readdirSync(partitionDir);
              if (stryMutAct_9fa48("95751") ? files.length !== REPLICA_LIFECYCLE_NUM.ZERO : stryMutAct_9fa48("95750") ? false : stryMutAct_9fa48("95749") ? true : (stryCov_9fa48("95749", "95750", "95751"), files.length === REPLICA_LIFECYCLE_NUM.ZERO)) {
                if (stryMutAct_9fa48("95752")) {
                  {}
                } else {
                  stryCov_9fa48("95752");
                  fs.rmdirSync(partitionDir);
                  this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.REMOVED_EMPTY_DIR, stryMutAct_9fa48("95753") ? {} : (stryCov_9fa48("95753"), {
                    partitionDir
                  }));
                }
              }
            }
          } catch (dirError) {
            if (stryMutAct_9fa48("95754")) {
              {}
            } else {
              stryCov_9fa48("95754");
              this.logger.warn(REPLICA_LIFECYCLE_LOG_MSG.CLEANUP_FAILED, stryMutAct_9fa48("95755") ? {} : (stryCov_9fa48("95755"), {
                replicaId,
                dbPath,
                error: dirError.message
              }));
              throw dirError;
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("95756")) {
          {}
        } else {
          stryCov_9fa48("95756");
          this.logger.warn(REPLICA_LIFECYCLE_LOG_MSG.CLEANUP_FAILED, stryMutAct_9fa48("95757") ? {} : (stryCov_9fa48("95757"), {
            replicaId,
            dbPath,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Get the database path for a partition replica.
   * @param {string} partitionId - Partition ID.
   * @param {string} replicaId - Replica ID.
   * @return {string} Database file path.
   * @private
   */
  getPartitionDbPath(partitionId, replicaId) {
    if (stryMutAct_9fa48("95758")) {
      {}
    } else {
      stryCov_9fa48("95758");
      return path.join(this.dataDir, STORAGE_DEFAULT.PARTITIONS_DIRNAME, partitionId, stryMutAct_9fa48("95759") ? `` : (stryCov_9fa48("95759"), `${replicaId}${STORAGE_DEFAULT.DB_EXT}`));
    }
  }

  /**
   * Handle node recovery - clean up orphaned replicas.
   * Called when a node recovers after a failure.
   * @return {Promise<void>}
   */
  async handleNodeRecovery() {
    if (stryMutAct_9fa48("95760")) {
      {}
    } else {
      stryCov_9fa48("95760");
      this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_START, stryMutAct_9fa48("95761") ? {} : (stryCov_9fa48("95761"), {
        nodeId: this.nodeId
      }));
      assertCritical(this.systemTableCache, REPLICA_LIFECYCLE_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE);

      // Query services table for replicas on this node in transitional states
      const services = stryMutAct_9fa48("95762") ? this.systemTableCache : (stryCov_9fa48("95762"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, stryMutAct_9fa48("95763") ? () => undefined : (stryCov_9fa48("95763"), service => stryMutAct_9fa48("95766") ? service.node_id === this.nodeId && service.service_type === SERVICE_TYPE.PARTITION || [ReplicaStatus.STARTING, ReplicaStatus.SYNCING, ReplicaStatus.STOPPING].includes(service.status) : stryMutAct_9fa48("95765") ? false : stryMutAct_9fa48("95764") ? true : (stryCov_9fa48("95764", "95765", "95766"), (stryMutAct_9fa48("95768") ? service.node_id === this.nodeId || service.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("95767") ? true : (stryCov_9fa48("95767", "95768"), (stryMutAct_9fa48("95770") ? service.node_id !== this.nodeId : stryMutAct_9fa48("95769") ? true : (stryCov_9fa48("95769", "95770"), service.node_id === this.nodeId)) && (stryMutAct_9fa48("95772") ? service.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("95771") ? true : (stryCov_9fa48("95771", "95772"), service.service_type === SERVICE_TYPE.PARTITION)))) && (stryMutAct_9fa48("95773") ? [] : (stryCov_9fa48("95773"), [ReplicaStatus.STARTING, ReplicaStatus.SYNCING, ReplicaStatus.STOPPING])).includes(service.status)))));
      this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_FOUND, stryMutAct_9fa48("95774") ? {} : (stryCov_9fa48("95774"), {
        count: services.length,
        nodeId: this.nodeId
      }));
      for (const service of services) {
        if (stryMutAct_9fa48("95775")) {
          {}
        } else {
          stryCov_9fa48("95775");
          const {
            service_id: serviceId,
            partition_id: partitionId,
            status
          } = service;
          this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_PROCESSING, stryMutAct_9fa48("95776") ? {} : (stryCov_9fa48("95776"), {
            replicaId: serviceId,
            partitionId,
            status,
            nodeId: this.nodeId
          }));
          try {
            if (stryMutAct_9fa48("95777")) {
              {}
            } else {
              stryCov_9fa48("95777");
              if (stryMutAct_9fa48("95780") ? status === ReplicaStatus.STARTING && status === ReplicaStatus.SYNCING : stryMutAct_9fa48("95779") ? false : stryMutAct_9fa48("95778") ? true : (stryCov_9fa48("95778", "95779", "95780"), (stryMutAct_9fa48("95782") ? status !== ReplicaStatus.STARTING : stryMutAct_9fa48("95781") ? false : (stryCov_9fa48("95781", "95782"), status === ReplicaStatus.STARTING)) || (stryMutAct_9fa48("95784") ? status !== ReplicaStatus.SYNCING : stryMutAct_9fa48("95783") ? false : (stryCov_9fa48("95783", "95784"), status === ReplicaStatus.SYNCING)))) {
                if (stryMutAct_9fa48("95785")) {
                  {}
                } else {
                  stryCov_9fa48("95785");
                  // Mark 'starting'/'syncing' replicas as 'failed'
                  const failResult = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("95786") ? {} : (stryCov_9fa48("95786"), {
                    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
                    tableName: SYSTEM_TABLE_NAME.SERVICES,
                    whereClause: buildObservedReplicaWhereClause(service),
                    data: stryMutAct_9fa48("95787") ? {} : (stryCov_9fa48("95787"), {
                      status: ReplicaStatus.FAILED,
                      error_message: REPLICA_LIFECYCLE_ERROR_MSG.RECOVERY_CLEANUP_ERROR
                    })
                  }), stryMutAct_9fa48("95788") ? {} : (stryCov_9fa48("95788"), {
                    workClass: PRESSURE_WORK_CLASS.CRITICAL,
                    deliveryPriority: stryMutAct_9fa48("95789") ? "" : (stryCov_9fa48("95789"), 'critical')
                  }));
                  if (stryMutAct_9fa48("95792") ? false : stryMutAct_9fa48("95791") ? true : stryMutAct_9fa48("95790") ? guardedMutationApplied(failResult) : (stryCov_9fa48("95790", "95791", "95792"), !guardedMutationApplied(failResult))) {
                    if (stryMutAct_9fa48("95793")) {
                      {}
                    } else {
                      stryCov_9fa48("95793");
                      this.logger.debug(stryMutAct_9fa48("95794") ? "" : (stryCov_9fa48("95794"), 'Skipped stale replica recovery failure update'), stryMutAct_9fa48("95795") ? {} : (stryCov_9fa48("95795"), {
                        replicaId: serviceId,
                        partitionId,
                        status,
                        nodeId: this.nodeId
                      }));
                      continue;
                    }
                  }

                  // Clean up local resources
                  await this.cleanupReplicaResources(partitionId, serviceId);
                  this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_MARKED_FAILED, stryMutAct_9fa48("95796") ? {} : (stryCov_9fa48("95796"), {
                    replicaId: serviceId,
                    previousStatus: status,
                    nodeId: this.nodeId
                  }));
                }
              } else if (stryMutAct_9fa48("95799") ? status !== ReplicaStatus.STOPPING : stryMutAct_9fa48("95798") ? false : stryMutAct_9fa48("95797") ? true : (stryCov_9fa48("95797", "95798", "95799"), status === ReplicaStatus.STOPPING)) {
                if (stryMutAct_9fa48("95800")) {
                  {}
                } else {
                  stryCov_9fa48("95800");
                  // Complete removal for 'stopping' replicas
                  const stopResult = await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("95801") ? {} : (stryCov_9fa48("95801"), {
                    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
                    tableName: SYSTEM_TABLE_NAME.SERVICES,
                    whereClause: buildObservedReplicaWhereClause(service),
                    data: stryMutAct_9fa48("95802") ? {} : (stryCov_9fa48("95802"), {
                      status: ReplicaStatus.STOPPED
                    })
                  }), stryMutAct_9fa48("95803") ? {} : (stryCov_9fa48("95803"), {
                    workClass: PRESSURE_WORK_CLASS.CRITICAL,
                    deliveryPriority: stryMutAct_9fa48("95804") ? "" : (stryCov_9fa48("95804"), 'critical')
                  }));
                  if (stryMutAct_9fa48("95807") ? false : stryMutAct_9fa48("95806") ? true : stryMutAct_9fa48("95805") ? guardedMutationApplied(stopResult) : (stryCov_9fa48("95805", "95806", "95807"), !guardedMutationApplied(stopResult))) {
                    if (stryMutAct_9fa48("95808")) {
                      {}
                    } else {
                      stryCov_9fa48("95808");
                      this.logger.debug(stryMutAct_9fa48("95809") ? "" : (stryCov_9fa48("95809"), 'Skipped stale replica recovery stop update'), stryMutAct_9fa48("95810") ? {} : (stryCov_9fa48("95810"), {
                        replicaId: serviceId,
                        partitionId,
                        nodeId: this.nodeId
                      }));
                      continue;
                    }
                  }
                  await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("95811") ? {} : (stryCov_9fa48("95811"), {
                    operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
                    tableName: SYSTEM_TABLE_NAME.SERVICES,
                    whereClause: stryMutAct_9fa48("95812") ? {} : (stryCov_9fa48("95812"), {
                      service_id: serviceId,
                      status: ReplicaStatus.STOPPED
                    })
                  }), stryMutAct_9fa48("95813") ? {} : (stryCov_9fa48("95813"), {
                    workClass: PRESSURE_WORK_CLASS.CRITICAL,
                    deliveryPriority: stryMutAct_9fa48("95814") ? "" : (stryCov_9fa48("95814"), 'critical')
                  }));

                  // Clean up local resources
                  await this.cleanupReplicaResources(partitionId, serviceId);
                  this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_COMPLETED_REMOVAL, stryMutAct_9fa48("95815") ? {} : (stryCov_9fa48("95815"), {
                    replicaId: serviceId,
                    nodeId: this.nodeId
                  }));
                }
              }
            }
          } catch (error) {
            if (stryMutAct_9fa48("95816")) {
              {}
            } else {
              stryCov_9fa48("95816");
              this.logger.error(REPLICA_LIFECYCLE_LOG_MSG.RECOVERY_FAILED, stryMutAct_9fa48("95817") ? {} : (stryCov_9fa48("95817"), {
                replicaId: serviceId,
                status,
                error: error.message,
                nodeId: this.nodeId
              }));
              throw error;
            }
          }
        }
      }
      this.emit(REPLICA_LIFECYCLE_EVENT.RECOVERY_COMPLETE, stryMutAct_9fa48("95818") ? {} : (stryCov_9fa48("95818"), {
        nodeId: this.nodeId,
        orphanedCount: services.length
      }));
    }
  }

  /**
   * Get pending operation by request ID.
   * @param {string} requestId - Request ID.
   * @return {Object|null} Pending operation or null.
   */
  getPendingOperation(requestId) {
    if (stryMutAct_9fa48("95819")) {
      {}
    } else {
      stryCov_9fa48("95819");
      return stryMutAct_9fa48("95822") ? this.pendingOperations.get(requestId) && null : stryMutAct_9fa48("95821") ? false : stryMutAct_9fa48("95820") ? true : (stryCov_9fa48("95820", "95821", "95822"), this.pendingOperations.get(requestId) || null);
    }
  }

  /**
   * Get all pending operations.
   * @return {Array<Object>} Array of pending operations.
   */
  getAllPendingOperations() {
    if (stryMutAct_9fa48("95823")) {
      {}
    } else {
      stryCov_9fa48("95823");
      return Array.from(this.pendingOperations.entries()).map(stryMutAct_9fa48("95824") ? () => undefined : (stryCov_9fa48("95824"), ([id, op]) => stryMutAct_9fa48("95825") ? {} : (stryCov_9fa48("95825"), {
        requestId: id,
        ...op
      })));
    }
  }

  /**
   * Clean up expired pending operations.
   * @param {number} maxAgeMs - Maximum age in milliseconds.
   */
  cleanupExpiredOperations(maxAgeMs = REPLICA_LIFECYCLE_DEFAULT.EXPIRED_OPERATION_MAX_AGE_MS) {
    if (stryMutAct_9fa48("95826")) {
      {}
    } else {
      stryCov_9fa48("95826");
      const now = Date.now();
      const expiredIds = stryMutAct_9fa48("95827") ? ["Stryker was here"] : (stryCov_9fa48("95827"), []);
      for (const [requestId, op] of this.pendingOperations) {
        if (stryMutAct_9fa48("95828")) {
          {}
        } else {
          stryCov_9fa48("95828");
          const age = stryMutAct_9fa48("95829") ? now + op.startedAt : (stryCov_9fa48("95829"), now - op.startedAt);
          if (stryMutAct_9fa48("95832") ? age > maxAgeMs || op.status === REPLICA_LIFECYCLE_PENDING_STATUS.COMPLETED || op.status === REPLICA_LIFECYCLE_PENDING_STATUS.FAILED : stryMutAct_9fa48("95831") ? false : stryMutAct_9fa48("95830") ? true : (stryCov_9fa48("95830", "95831", "95832"), (stryMutAct_9fa48("95835") ? age <= maxAgeMs : stryMutAct_9fa48("95834") ? age >= maxAgeMs : stryMutAct_9fa48("95833") ? true : (stryCov_9fa48("95833", "95834", "95835"), age > maxAgeMs)) && (stryMutAct_9fa48("95837") ? op.status === REPLICA_LIFECYCLE_PENDING_STATUS.COMPLETED && op.status === REPLICA_LIFECYCLE_PENDING_STATUS.FAILED : stryMutAct_9fa48("95836") ? true : (stryCov_9fa48("95836", "95837"), (stryMutAct_9fa48("95839") ? op.status !== REPLICA_LIFECYCLE_PENDING_STATUS.COMPLETED : stryMutAct_9fa48("95838") ? false : (stryCov_9fa48("95838", "95839"), op.status === REPLICA_LIFECYCLE_PENDING_STATUS.COMPLETED)) || (stryMutAct_9fa48("95841") ? op.status !== REPLICA_LIFECYCLE_PENDING_STATUS.FAILED : stryMutAct_9fa48("95840") ? false : (stryCov_9fa48("95840", "95841"), op.status === REPLICA_LIFECYCLE_PENDING_STATUS.FAILED)))))) {
            if (stryMutAct_9fa48("95842")) {
              {}
            } else {
              stryCov_9fa48("95842");
              expiredIds.push(requestId);
            }
          }
        }
      }
      for (const id of expiredIds) {
        if (stryMutAct_9fa48("95843")) {
          {}
        } else {
          stryCov_9fa48("95843");
          this.pendingOperations.delete(id);
        }
      }
      if (stryMutAct_9fa48("95847") ? expiredIds.length <= REPLICA_LIFECYCLE_NUM.ZERO : stryMutAct_9fa48("95846") ? expiredIds.length >= REPLICA_LIFECYCLE_NUM.ZERO : stryMutAct_9fa48("95845") ? false : stryMutAct_9fa48("95844") ? true : (stryCov_9fa48("95844", "95845", "95846", "95847"), expiredIds.length > REPLICA_LIFECYCLE_NUM.ZERO)) {
        if (stryMutAct_9fa48("95848")) {
          {}
        } else {
          stryCov_9fa48("95848");
          this.logger.debug(REPLICA_LIFECYCLE_LOG_MSG.EXPIRED_OPERATIONS_CLEANED, stryMutAct_9fa48("95849") ? {} : (stryCov_9fa48("95849"), {
            count: expiredIds.length,
            nodeId: this.nodeId
          }));
        }
      }
    }
  }

  /**
   * Register an existing replica (created during bootstrap).
   * This method is idempotent - duplicate registrations are ignored.
   * When replicaHandler is set, delegates to it.
   * @param {Object} replicaInfo - Replica information.
   * @param {string} replicaInfo.replicaId - Unique replica identifier.
   * @param {string} replicaInfo.partitionId - Partition identifier.
   * @param {string} replicaInfo.tableName - Table name.
   * @param {string} [replicaInfo.status] - Replica status (default: 'active').
   * @param {Object} [replicaInfo.service] - Partition service instance.
   */
  registerExistingReplica(replicaInfo) {
    if (stryMutAct_9fa48("95850")) {
      {}
    } else {
      stryCov_9fa48("95850");
      assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
      this.replicaHandler.registerExistingReplica(replicaInfo);
    }
  }

  /**
   * Get local replica by ID.
   * When replicaHandler is set, delegates to it.
   * @param {string} replicaId - Replica ID.
   * @return {Object|null} Local replica info or null.
   */
  getLocalReplica(replicaId) {
    if (stryMutAct_9fa48("95851")) {
      {}
    } else {
      stryCov_9fa48("95851");
      assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
      return this.replicaHandler.getLocalReplica(replicaId);
    }
  }

  /**
   * Get all local replicas.
   * When replicaHandler is set, delegates to it.
   * @return {Array<Object>} Array of local replica info.
   */
  getAllLocalReplicas() {
    if (stryMutAct_9fa48("95852")) {
      {}
    } else {
      stryCov_9fa48("95852");
      assertCritical(this.replicaHandler, REPLICA_LIFECYCLE_ERROR_MSG.REPLICA_HANDLER_REQUIRED);
      return this.replicaHandler.getAllLocalReplicas();
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("95853")) {
      {}
    } else {
      stryCov_9fa48("95853");
      if (stryMutAct_9fa48("95855") ? false : stryMutAct_9fa48("95854") ? true : (stryCov_9fa48("95854", "95855"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("95856")) {
          {}
        } else {
          stryCov_9fa48("95856");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("95857") ? {} : (stryCov_9fa48("95857"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("95858") ? () => undefined : (stryCov_9fa48("95858"), () => this.cdcIntegrationService)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }

  /**
   * Check if manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("95859")) {
      {}
    } else {
      stryCov_9fa48("95859");
      return this.initialized;
    }
  }

  /**
   * Get manager statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    if (stryMutAct_9fa48("95860")) {
      {}
    } else {
      stryCov_9fa48("95860");
      let handlerStats = null;
      if (stryMutAct_9fa48("95863") ? this.replicaHandler || typeof this.replicaHandler.getStats === TYPEOF.FUNCTION : stryMutAct_9fa48("95862") ? false : stryMutAct_9fa48("95861") ? true : (stryCov_9fa48("95861", "95862", "95863"), this.replicaHandler && (stryMutAct_9fa48("95865") ? typeof this.replicaHandler.getStats !== TYPEOF.FUNCTION : stryMutAct_9fa48("95864") ? true : (stryCov_9fa48("95864", "95865"), typeof this.replicaHandler.getStats === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("95866")) {
          {}
        } else {
          stryCov_9fa48("95866");
          handlerStats = this.replicaHandler.getStats();
        }
      }
      const localReplicaCount = handlerStats ? handlerStats.localReplicaCount : (stryMutAct_9fa48("95869") ? this.replicaHandler || typeof this.replicaHandler.getAllLocalReplicas === TYPEOF.FUNCTION : stryMutAct_9fa48("95868") ? false : stryMutAct_9fa48("95867") ? true : (stryCov_9fa48("95867", "95868", "95869"), this.replicaHandler && (stryMutAct_9fa48("95871") ? typeof this.replicaHandler.getAllLocalReplicas !== TYPEOF.FUNCTION : stryMutAct_9fa48("95870") ? true : (stryCov_9fa48("95870", "95871"), typeof this.replicaHandler.getAllLocalReplicas === TYPEOF.FUNCTION)))) ? this.replicaHandler.getAllLocalReplicas().length : 0;
      const stats = stryMutAct_9fa48("95872") ? {} : (stryCov_9fa48("95872"), {
        nodeId: this.nodeId,
        initialized: this.initialized,
        localReplicaCount,
        pendingOperationCount: this.pendingOperations.size,
        usingReplicaHandler: stryMutAct_9fa48("95873") ? !this.replicaHandler : (stryCov_9fa48("95873"), !(stryMutAct_9fa48("95874") ? this.replicaHandler : (stryCov_9fa48("95874"), !this.replicaHandler)))
      });

      // Include handler stats if available
      if (stryMutAct_9fa48("95876") ? false : stryMutAct_9fa48("95875") ? true : (stryCov_9fa48("95875", "95876"), handlerStats)) {
        if (stryMutAct_9fa48("95877")) {
          {}
        } else {
          stryCov_9fa48("95877");
          stats.handlerStats = stryMutAct_9fa48("95878") ? {} : (stryCov_9fa48("95878"), {
            inProgressOperationCount: handlerStats.inProgressOperationCount
          });
        }
      }
      return stats;
    }
  }

  /**
   * Shutdown the replica lifecycle manager.
   */
  async shutdown() {
    if (stryMutAct_9fa48("95879")) {
      {}
    } else {
      stryCov_9fa48("95879");
      if (stryMutAct_9fa48("95881") ? false : stryMutAct_9fa48("95880") ? true : (stryCov_9fa48("95880", "95881"), this.shutdownPromise)) {
        if (stryMutAct_9fa48("95882")) {
          {}
        } else {
          stryCov_9fa48("95882");
          return this.shutdownPromise;
        }
      }
      this.shutdownPromise = (async () => {
        if (stryMutAct_9fa48("95883")) {
          {}
        } else {
          stryCov_9fa48("95883");
          this.logger.info(REPLICA_LIFECYCLE_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("95884") ? {} : (stryCov_9fa48("95884"), {
            nodeId: this.nodeId
          }));
          this.pendingOperations.clear();
          this.initialized = stryMutAct_9fa48("95885") ? true : (stryCov_9fa48("95885"), false);
          if (stryMutAct_9fa48("95888") ? this.replicaHandler || typeof this.replicaHandler.shutdown === TYPEOF.FUNCTION : stryMutAct_9fa48("95887") ? false : stryMutAct_9fa48("95886") ? true : (stryCov_9fa48("95886", "95887", "95888"), this.replicaHandler && (stryMutAct_9fa48("95890") ? typeof this.replicaHandler.shutdown !== TYPEOF.FUNCTION : stryMutAct_9fa48("95889") ? true : (stryCov_9fa48("95889", "95890"), typeof this.replicaHandler.shutdown === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("95891")) {
              {}
            } else {
              stryCov_9fa48("95891");
              try {
                if (stryMutAct_9fa48("95892")) {
                  {}
                } else {
                  stryCov_9fa48("95892");
                  await this.replicaHandler.shutdown();
                }
              } catch (error) {
                if (stryMutAct_9fa48("95893")) {
                  {}
                } else {
                  stryCov_9fa48("95893");
                  this.logger.warn(stryMutAct_9fa48("95894") ? "" : (stryCov_9fa48("95894"), 'Failed to shut down delegated replica handler'), stryMutAct_9fa48("95895") ? {} : (stryCov_9fa48("95895"), {
                    nodeId: this.nodeId,
                    error: error.message
                  }));
                }
              }
            }
          }
          this.emit(REPLICA_LIFECYCLE_EVENT.SHUTDOWN, stryMutAct_9fa48("95896") ? {} : (stryCov_9fa48("95896"), {
            nodeId: this.nodeId
          }));
        }
      })();
      return this.shutdownPromise;
    }
  }
}
export { ReplicaLifecycleManager, ReplicaStatus, VALID_STATUS_TRANSITIONS, MessageType, AckStatus };