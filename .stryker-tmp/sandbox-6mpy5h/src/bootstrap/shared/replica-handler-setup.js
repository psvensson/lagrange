/**
 * ReplicaHandlerSetup - Shared replica handler creation and configuration.
 *
 * This component extracts the common replica handler setup logic used by both
 * BootstrapService and NodeJoiningService. It handles:
 * - Creating the ReplicaStateMachine instance
 * - Creating the ReplicaHandler instance
 * - Starting the timeout checker for the state machine
 *
 * Requirements: 3.2 - Shared Replica_Handler_Setup component
 *
 * @module bootstrap/shared/replica-handler-setup
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
import { ReplicaHandler } from '../../node/replica-handler.js';
import { ReplicaStateMachine } from '../../node/replica-state-machine.js';
import { LoggingService } from '../../logging/logging-service.js';
import { DependencyError } from '../bootstrap-errors.js';
import { SUBSYSTEM } from '../../constants/index.js';

/**
 * Subsystem identifier for logging.
 */
const REPLICA_HANDLER_SETUP_SUBSYSTEM = SUBSYSTEM.REPLICA_HANDLER_SETUP;

/**
 * Log messages for ReplicaHandlerSetup.
 */
const LOG_MSG = Object.freeze(stryMutAct_9fa48("30402") ? {} : (stryCov_9fa48("30402"), {
  CREATING: stryMutAct_9fa48("30403") ? "" : (stryCov_9fa48("30403"), 'Creating ReplicaHandler and ReplicaStateMachine'),
  CREATED: stryMutAct_9fa48("30404") ? "" : (stryCov_9fa48("30404"), 'ReplicaHandler and ReplicaStateMachine created successfully'),
  STATE_MACHINE_STARTED: stryMutAct_9fa48("30405") ? "" : (stryCov_9fa48("30405"), 'ReplicaStateMachine timeout checker started')
}));

/**
 * Error messages for ReplicaHandlerSetup.
 */
const ERROR_MSG = Object.freeze(stryMutAct_9fa48("30406") ? {} : (stryCov_9fa48("30406"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("30407") ? "" : (stryCov_9fa48("30407"), 'nodeId'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("30408") ? "" : (stryCov_9fa48("30408"), 'messageRouter'),
  CDC_INTEGRATION_SERVICE_REQUIRED: stryMutAct_9fa48("30409") ? "" : (stryCov_9fa48("30409"), 'cdcIntegrationService'),
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("30410") ? "" : (stryCov_9fa48("30410"), 'systemTableCache'),
  CREATE_PARTITION_SERVICE_REQUIRED: stryMutAct_9fa48("30411") ? "" : (stryCov_9fa48("30411"), 'createPartitionService')
}));

/**
 * Shared replica handler setup used by both bootstrap paths.
 * Provides a static factory method to create and configure ReplicaHandler
 * and ReplicaStateMachine.
 */
class ReplicaHandlerSetup {
  /**
   * Create and configure replica handler and state machine.
   *
   * This method handles the complete setup of ReplicaHandler including:
   * - Creating the ReplicaStateMachine with CDC integration
   * - Starting the timeout checker for transitional state monitoring
   * - Creating the ReplicaHandler with all required dependencies
   * - Initializing the handler
   * - Registering the handler with the message router
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.messageRouter - Message router for registration (required).
   * @param {Object} options.cdcIntegrationService - CDC integration service (required).
   * @param {Object} options.systemTableCache - System table cache (required).
   * @param {Function} options.createPartitionService - Factory for creating partitions (required).
   * @param {string} options.dataDir - Base data directory for partition storage.
   * @param {Object} options.rpcClient - Optional RPC client for responses.
   * @return {Object} Object containing replicaHandler and replicaStateMachine.
   * @throws {DependencyError} If required dependencies are not provided.
   */
  static create(options) {
    if (stryMutAct_9fa48("30412")) {
      {}
    } else {
      stryCov_9fa48("30412");
      const {
        nodeId,
        messageRouter,
        cdcIntegrationService,
        systemTableCache,
        createPartitionService,
        dataDir,
        rpcClient
      } = options;

      // Validate required dependencies
      if (stryMutAct_9fa48("30415") ? false : stryMutAct_9fa48("30414") ? true : stryMutAct_9fa48("30413") ? nodeId : (stryCov_9fa48("30413", "30414", "30415"), !nodeId)) {
        if (stryMutAct_9fa48("30416")) {
          {}
        } else {
          stryCov_9fa48("30416");
          throw new DependencyError(stryMutAct_9fa48("30417") ? "" : (stryCov_9fa48("30417"), 'ReplicaHandlerSetup'), ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30420") ? false : stryMutAct_9fa48("30419") ? true : stryMutAct_9fa48("30418") ? messageRouter : (stryCov_9fa48("30418", "30419", "30420"), !messageRouter)) {
        if (stryMutAct_9fa48("30421")) {
          {}
        } else {
          stryCov_9fa48("30421");
          throw new DependencyError(stryMutAct_9fa48("30422") ? "" : (stryCov_9fa48("30422"), 'ReplicaHandlerSetup'), ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30425") ? false : stryMutAct_9fa48("30424") ? true : stryMutAct_9fa48("30423") ? cdcIntegrationService : (stryCov_9fa48("30423", "30424", "30425"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("30426")) {
          {}
        } else {
          stryCov_9fa48("30426");
          throw new DependencyError(stryMutAct_9fa48("30427") ? "" : (stryCov_9fa48("30427"), 'ReplicaHandlerSetup'), ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30430") ? false : stryMutAct_9fa48("30429") ? true : stryMutAct_9fa48("30428") ? systemTableCache : (stryCov_9fa48("30428", "30429", "30430"), !systemTableCache)) {
        if (stryMutAct_9fa48("30431")) {
          {}
        } else {
          stryCov_9fa48("30431");
          throw new DependencyError(stryMutAct_9fa48("30432") ? "" : (stryCov_9fa48("30432"), 'ReplicaHandlerSetup'), ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30435") ? false : stryMutAct_9fa48("30434") ? true : stryMutAct_9fa48("30433") ? createPartitionService : (stryCov_9fa48("30433", "30434", "30435"), !createPartitionService)) {
        if (stryMutAct_9fa48("30436")) {
          {}
        } else {
          stryCov_9fa48("30436");
          throw new DependencyError(stryMutAct_9fa48("30437") ? "" : (stryCov_9fa48("30437"), 'ReplicaHandlerSetup'), ERROR_MSG.CREATE_PARTITION_SERVICE_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.isInitialized() ? loggingService.forSubsystem(REPLICA_HANDLER_SETUP_SUBSYSTEM) : console;
      logger.info(LOG_MSG.CREATING, stryMutAct_9fa48("30438") ? {} : (stryCov_9fa48("30438"), {
        nodeId,
        hasDataDir: stryMutAct_9fa48("30439") ? !dataDir : (stryCov_9fa48("30439"), !(stryMutAct_9fa48("30440") ? dataDir : (stryCov_9fa48("30440"), !dataDir))),
        hasRpcClient: stryMutAct_9fa48("30441") ? !rpcClient : (stryCov_9fa48("30441"), !(stryMutAct_9fa48("30442") ? rpcClient : (stryCov_9fa48("30442"), !rpcClient)))
      }));

      // Create ReplicaStateMachine for tracking replica lifecycle states
      const replicaStateMachine = new ReplicaStateMachine(stryMutAct_9fa48("30443") ? {} : (stryCov_9fa48("30443"), {
        nodeId,
        cdcIntegrationService
      }));

      // Start the timeout checker for transitional state monitoring
      replicaStateMachine.startTimeoutChecker();
      logger.debug(LOG_MSG.STATE_MACHINE_STARTED, stryMutAct_9fa48("30444") ? {} : (stryCov_9fa48("30444"), {
        nodeId
      }));

      // Create ReplicaHandler for CREATE_REPLICA/REMOVE_REPLICA execution
      const replicaHandler = new ReplicaHandler(stryMutAct_9fa48("30445") ? {} : (stryCov_9fa48("30445"), {
        nodeId,
        systemTableCache,
        cdcIntegrationService,
        replicaStateMachine,
        createPartitionService,
        dataDir
      }));

      // Initialize the handler
      replicaHandler.initialize();

      // Register with message router for receiving replica operation messages
      replicaHandler.registerWithRouter(messageRouter, stryMutAct_9fa48("30446") ? {} : (stryCov_9fa48("30446"), {
        rpcClient
      }));
      logger.info(LOG_MSG.CREATED, stryMutAct_9fa48("30447") ? {} : (stryCov_9fa48("30447"), {
        nodeId,
        hasDataDir: stryMutAct_9fa48("30448") ? !dataDir : (stryCov_9fa48("30448"), !(stryMutAct_9fa48("30449") ? dataDir : (stryCov_9fa48("30449"), !dataDir))),
        hasRpcClient: stryMutAct_9fa48("30450") ? !rpcClient : (stryCov_9fa48("30450"), !(stryMutAct_9fa48("30451") ? rpcClient : (stryCov_9fa48("30451"), !rpcClient)))
      }));
      return stryMutAct_9fa48("30452") ? {} : (stryCov_9fa48("30452"), {
        replicaHandler,
        replicaStateMachine
      });
    }
  }
}
export { ReplicaHandlerSetup };