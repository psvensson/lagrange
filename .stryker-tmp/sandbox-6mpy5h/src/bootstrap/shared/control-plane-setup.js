/**
 * ControlPlaneSetup - Shared control plane service creation
 * and configuration.
 *
 * This component extracts the common control plane setup logic
 * used by both BootstrapService and NodeJoiningService. It
 * handles:
 * - Creating the RebalanceCoordinator instance
 * - Creating decomposed control plane services directly
 * - Initializing the services
 * - Attaching message group services
 * - Registering the node with the control plane
 * - Starting the local heartbeat
 *
 * Requirements: 3.3 - Shared Control_Plane_Setup component
 *
 * @module bootstrap/shared/control-plane-setup
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
import { HeartbeatService } from '../../control-plane/heartbeat-service.js';
import { LeaseService } from '../../control-plane/lease-service.js';
import { EndpointService } from '../../control-plane/endpoint-service.js';
import { registerControlPlaneSystemTableGateway } from '../../control-plane/control-plane-gateway-registry.js';
import { createControlPlaneRuntimeBundle } from '../../control-plane/control-plane-runtime-bundle.js';
import { createSystemMetadataOwners } from '../../control-plane/owners/index.js';
import { ReplicaDispatchService } from '../../control-plane/replica-dispatch-service.js';
import { ControlPlaneReadinessService } from '../../control-plane/control-plane-readiness-service.js';
import { MembershipPublicationCoordinator } from '../../control-plane/membership-publication-coordinator.js';
import { StartupRecoveryCoordinator } from '../startup-recovery-coordinator.js';
import { RebalanceCoordinator } from '../../rebalancer/rebalance-coordinator.js';
import { StorageAdmissionService } from '../../rebalancer/storage-admission-service.js';
import { StorageCapacityAccountingService } from '../../rebalancer/storage-capacity-accounting-service.js';
import { ExecutorOutcomeEmitter } from '../../rebalancer/executor-outcome-emitter.js';
import { NodeService } from '../../node/node-service.js';
import { LoggingService } from '../../logging/logging-service.js';
import { DependencyError } from '../bootstrap-errors.js';
import { SUBSYSTEM } from '../../constants/index.js';

/**
 * Subsystem identifier for logging.
 */
const CONTROL_PLANE_SETUP_SUBSYSTEM = SUBSYSTEM.CONTROL_PLANE_SETUP;

/**
 * Log messages for ControlPlaneSetup.
 */
const LOG_MSG = Object.freeze(stryMutAct_9fa48("28315") ? {} : (stryCov_9fa48("28315"), {
  CREATING: stryMutAct_9fa48("28316") ? "" : (stryCov_9fa48("28316"), 'Creating control plane services'),
  CREATED: stryMutAct_9fa48("28317") ? "" : (stryCov_9fa48("28317"), 'Control plane services created successfully'),
  COORDINATOR_CREATED: stryMutAct_9fa48("28318") ? "" : (stryCov_9fa48("28318"), 'RebalanceCoordinator created'),
  ATTACHING_MESSAGE_GROUPS: stryMutAct_9fa48("28319") ? "" : (stryCov_9fa48("28319"), 'Attaching message group services'),
  REGISTERING_NODE: stryMutAct_9fa48("28320") ? "" : (stryCov_9fa48("28320"), 'Registering node with control plane'),
  NODE_REGISTERED: stryMutAct_9fa48("28321") ? "" : (stryCov_9fa48("28321"), 'Node registered with control plane'),
  HEARTBEAT_STARTED: stryMutAct_9fa48("28322") ? "" : (stryCov_9fa48("28322"), 'Local heartbeat started'),
  REGISTRATION_FAILED: stryMutAct_9fa48("28323") ? "" : (stryCov_9fa48("28323"), 'Control plane node registration failed')
}));

/**
 * Error messages for ControlPlaneSetup.
 */
const ERROR_MSG = Object.freeze(stryMutAct_9fa48("28324") ? {} : (stryCov_9fa48("28324"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("28325") ? "" : (stryCov_9fa48("28325"), 'nodeId'),
  NODE_ADDRESS_REQUIRED: stryMutAct_9fa48("28326") ? "" : (stryCov_9fa48("28326"), 'nodeAddress'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("28327") ? "" : (stryCov_9fa48("28327"), 'messageRouter'),
  CDC_INTEGRATION_SERVICE_REQUIRED: stryMutAct_9fa48("28328") ? "" : (stryCov_9fa48("28328"), 'cdcIntegrationService'),
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("28329") ? "" : (stryCov_9fa48("28329"), 'systemTableCache'),
  TABLE_POLICY_SERVICE_REQUIRED: stryMutAct_9fa48("28330") ? "" : (stryCov_9fa48("28330"), 'tablePolicyService'),
  TRANSACTION_COORDINATOR_REQUIRED: stryMutAct_9fa48("28331") ? "" : (stryCov_9fa48("28331"), 'transactionCoordinator')
}));

/**
 * Shared control plane setup used by both bootstrap paths.
 * Creates decomposed control plane services directly.
 */
class ControlPlaneSetup {
  /**
   * Create and configure decomposed control plane services.
   *
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (required).
   * @param {string} options.nodeAddress - Node address (required).
   * @param {Object} options.messageRouter - Message router (required).
   * @param {Object} options.cdcIntegrationService - CDC service.
   * @param {Object} [options.cdcGroupPropagationService] - CDC publication owner.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.tablePolicyService - Table policy service.
   * @param {Map} options.messageGroupServices - MG services to attach.
   * @param {Object} options.rebalanceCoordinator - Optional existing
   *   rebalance coordinator.
   * @return {Promise<Object>} Object containing heartbeatService,
   *   leaseService, endpointService, dispatchService, and
   *   rebalanceCoordinator.
   * @throws {DependencyError} If required dependencies missing.
   */
  static async create(options) {
    if (stryMutAct_9fa48("28332")) {
      {}
    } else {
      stryCov_9fa48("28332");
      const {
        nodeId,
        nodeAddress,
        advertisedNodeWsAddress,
        messageRouter,
        cdcIntegrationService,
        systemTableCache,
        tablePolicyService,
        messageGroupServices,
        rebalanceCoordinator: existingCoordinator,
        cdcGroupPropagationService,
        bootstrapReadinessState
      } = options;

      // Validate required dependencies
      if (stryMutAct_9fa48("28335") ? false : stryMutAct_9fa48("28334") ? true : stryMutAct_9fa48("28333") ? nodeId : (stryCov_9fa48("28333", "28334", "28335"), !nodeId)) {
        if (stryMutAct_9fa48("28336")) {
          {}
        } else {
          stryCov_9fa48("28336");
          throw new DependencyError(stryMutAct_9fa48("28337") ? "" : (stryCov_9fa48("28337"), 'ControlPlaneSetup'), ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("28340") ? false : stryMutAct_9fa48("28339") ? true : stryMutAct_9fa48("28338") ? nodeAddress : (stryCov_9fa48("28338", "28339", "28340"), !nodeAddress)) {
        if (stryMutAct_9fa48("28341")) {
          {}
        } else {
          stryCov_9fa48("28341");
          throw new DependencyError(stryMutAct_9fa48("28342") ? "" : (stryCov_9fa48("28342"), 'ControlPlaneSetup'), ERROR_MSG.NODE_ADDRESS_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("28345") ? false : stryMutAct_9fa48("28344") ? true : stryMutAct_9fa48("28343") ? messageRouter : (stryCov_9fa48("28343", "28344", "28345"), !messageRouter)) {
        if (stryMutAct_9fa48("28346")) {
          {}
        } else {
          stryCov_9fa48("28346");
          throw new DependencyError(stryMutAct_9fa48("28347") ? "" : (stryCov_9fa48("28347"), 'ControlPlaneSetup'), ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("28350") ? false : stryMutAct_9fa48("28349") ? true : stryMutAct_9fa48("28348") ? cdcIntegrationService : (stryCov_9fa48("28348", "28349", "28350"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("28351")) {
          {}
        } else {
          stryCov_9fa48("28351");
          throw new DependencyError(stryMutAct_9fa48("28352") ? "" : (stryCov_9fa48("28352"), 'ControlPlaneSetup'), ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("28355") ? false : stryMutAct_9fa48("28354") ? true : stryMutAct_9fa48("28353") ? systemTableCache : (stryCov_9fa48("28353", "28354", "28355"), !systemTableCache)) {
        if (stryMutAct_9fa48("28356")) {
          {}
        } else {
          stryCov_9fa48("28356");
          throw new DependencyError(stryMutAct_9fa48("28357") ? "" : (stryCov_9fa48("28357"), 'ControlPlaneSetup'), ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("28360") ? false : stryMutAct_9fa48("28359") ? true : stryMutAct_9fa48("28358") ? tablePolicyService : (stryCov_9fa48("28358", "28359", "28360"), !tablePolicyService)) {
        if (stryMutAct_9fa48("28361")) {
          {}
        } else {
          stryCov_9fa48("28361");
          throw new DependencyError(stryMutAct_9fa48("28362") ? "" : (stryCov_9fa48("28362"), 'ControlPlaneSetup'), ERROR_MSG.TABLE_POLICY_SERVICE_REQUIRED);
        }
      }
      const transactionCoordinator = stryMutAct_9fa48("28365") ? (existingCoordinator?.transactionCoordinator || cdcIntegrationService.sqlQueryEngine?.transactionCoordinator) && null : stryMutAct_9fa48("28364") ? false : stryMutAct_9fa48("28363") ? true : (stryCov_9fa48("28363", "28364", "28365"), (stryMutAct_9fa48("28367") ? existingCoordinator?.transactionCoordinator && cdcIntegrationService.sqlQueryEngine?.transactionCoordinator : stryMutAct_9fa48("28366") ? false : (stryCov_9fa48("28366", "28367"), (stryMutAct_9fa48("28368") ? existingCoordinator.transactionCoordinator : (stryCov_9fa48("28368"), existingCoordinator?.transactionCoordinator)) || (stryMutAct_9fa48("28369") ? cdcIntegrationService.sqlQueryEngine.transactionCoordinator : (stryCov_9fa48("28369"), cdcIntegrationService.sqlQueryEngine?.transactionCoordinator)))) || null);
      if (stryMutAct_9fa48("28372") ? !transactionCoordinator && typeof transactionCoordinator.begin !== 'function' : stryMutAct_9fa48("28371") ? false : stryMutAct_9fa48("28370") ? true : (stryCov_9fa48("28370", "28371", "28372"), (stryMutAct_9fa48("28373") ? transactionCoordinator : (stryCov_9fa48("28373"), !transactionCoordinator)) || (stryMutAct_9fa48("28375") ? typeof transactionCoordinator.begin === 'function' : stryMutAct_9fa48("28374") ? false : (stryCov_9fa48("28374", "28375"), typeof transactionCoordinator.begin !== (stryMutAct_9fa48("28376") ? "" : (stryCov_9fa48("28376"), 'function')))))) {
        if (stryMutAct_9fa48("28377")) {
          {}
        } else {
          stryCov_9fa48("28377");
          throw new DependencyError(stryMutAct_9fa48("28378") ? "" : (stryCov_9fa48("28378"), 'ControlPlaneSetup'), ERROR_MSG.TRANSACTION_COORDINATOR_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.forSubsystem(CONTROL_PLANE_SETUP_SUBSYSTEM);
      logger.info(LOG_MSG.CREATING, stryMutAct_9fa48("28379") ? {} : (stryCov_9fa48("28379"), {
        nodeId,
        nodeAddress,
        advertisedNodeWsAddress,
        hasMessageGroupServices: stryMutAct_9fa48("28380") ? !messageGroupServices : (stryCov_9fa48("28380"), !(stryMutAct_9fa48("28381") ? messageGroupServices : (stryCov_9fa48("28381"), !messageGroupServices))),
        messageGroupCount: messageGroupServices ? messageGroupServices.size : 0
      }));
      const controlPlaneRuntimeBundle = createControlPlaneRuntimeBundle(stryMutAct_9fa48("28382") ? {} : (stryCov_9fa48("28382"), {
        nodeId,
        cdcIntegrationService,
        systemTableCache,
        messageRouter
      }));
      const controlPlaneSystemTableGateway = controlPlaneRuntimeBundle.controlPlaneSystemTableGateway;
      registerControlPlaneSystemTableGateway(controlPlaneSystemTableGateway);

      // Create or use existing RebalanceCoordinator
      let rebalanceCoordinator = existingCoordinator;
      let storageAccountingService = stryMutAct_9fa48("28385") ? rebalanceCoordinator?.storageAccountingService && null : stryMutAct_9fa48("28384") ? false : stryMutAct_9fa48("28383") ? true : (stryCov_9fa48("28383", "28384", "28385"), (stryMutAct_9fa48("28386") ? rebalanceCoordinator.storageAccountingService : (stryCov_9fa48("28386"), rebalanceCoordinator?.storageAccountingService)) || null);
      if (stryMutAct_9fa48("28389") ? false : stryMutAct_9fa48("28388") ? true : stryMutAct_9fa48("28387") ? storageAccountingService : (stryCov_9fa48("28387", "28388", "28389"), !storageAccountingService)) {
        if (stryMutAct_9fa48("28390")) {
          {}
        } else {
          stryCov_9fa48("28390");
          storageAccountingService = new StorageCapacityAccountingService(stryMutAct_9fa48("28391") ? {} : (stryCov_9fa48("28391"), {
            systemTableCache,
            sqlQueryEngine: controlPlaneRuntimeBundle.sqlQueryEngine,
            controlPlaneSystemTableGateway
          }));
        }
      }
      let controlPlaneReadinessService = stryMutAct_9fa48("28394") ? rebalanceCoordinator?.controlPlaneReadinessService && null : stryMutAct_9fa48("28393") ? false : stryMutAct_9fa48("28392") ? true : (stryCov_9fa48("28392", "28393", "28394"), (stryMutAct_9fa48("28395") ? rebalanceCoordinator.controlPlaneReadinessService : (stryCov_9fa48("28395"), rebalanceCoordinator?.controlPlaneReadinessService)) || null);
      if (stryMutAct_9fa48("28398") ? false : stryMutAct_9fa48("28397") ? true : stryMutAct_9fa48("28396") ? controlPlaneReadinessService : (stryCov_9fa48("28396", "28397", "28398"), !controlPlaneReadinessService)) {
        if (stryMutAct_9fa48("28399")) {
          {}
        } else {
          stryCov_9fa48("28399");
          controlPlaneReadinessService = new ControlPlaneReadinessService(stryMutAct_9fa48("28400") ? {} : (stryCov_9fa48("28400"), {
            nodeId,
            systemTableCache,
            cacheMutationTarget: systemTableCache,
            messageRouter,
            storageAccountingService,
            cdcIntegrationService,
            cdcGroupPropagationService: stryMutAct_9fa48("28403") ? cdcGroupPropagationService && null : stryMutAct_9fa48("28402") ? false : stryMutAct_9fa48("28401") ? true : (stryCov_9fa48("28401", "28402", "28403"), cdcGroupPropagationService || null),
            controlPlaneSystemTableGateway,
            strictOwnerDependencies: stryMutAct_9fa48("28404") ? false : (stryCov_9fa48("28404"), true)
          }));
        }
      }
      let storageAdmissionService = stryMutAct_9fa48("28407") ? rebalanceCoordinator?.storageAdmissionService && null : stryMutAct_9fa48("28406") ? false : stryMutAct_9fa48("28405") ? true : (stryCov_9fa48("28405", "28406", "28407"), (stryMutAct_9fa48("28408") ? rebalanceCoordinator.storageAdmissionService : (stryCov_9fa48("28408"), rebalanceCoordinator?.storageAdmissionService)) || null);
      if (stryMutAct_9fa48("28411") ? false : stryMutAct_9fa48("28410") ? true : stryMutAct_9fa48("28409") ? storageAdmissionService : (stryCov_9fa48("28409", "28410", "28411"), !storageAdmissionService)) {
        if (stryMutAct_9fa48("28412")) {
          {}
        } else {
          stryCov_9fa48("28412");
          storageAdmissionService = new StorageAdmissionService(stryMutAct_9fa48("28413") ? {} : (stryCov_9fa48("28413"), {
            nodeId,
            accountingService: storageAccountingService,
            systemTableCache,
            cacheMutationTarget: systemTableCache,
            messageRouter,
            cdcIntegrationService,
            cdcGroupPropagationService: stryMutAct_9fa48("28416") ? cdcGroupPropagationService && null : stryMutAct_9fa48("28415") ? false : stryMutAct_9fa48("28414") ? true : (stryCov_9fa48("28414", "28415", "28416"), cdcGroupPropagationService || null),
            controlPlaneReadinessService
          }));
        }
      }
      const startupRecoveryCoordinator = stryMutAct_9fa48("28419") ? rebalanceCoordinator?.startupRecoveryCoordinator && new StartupRecoveryCoordinator({
        readinessState: bootstrapReadinessState || null
      }) : stryMutAct_9fa48("28418") ? false : stryMutAct_9fa48("28417") ? true : (stryCov_9fa48("28417", "28418", "28419"), (stryMutAct_9fa48("28420") ? rebalanceCoordinator.startupRecoveryCoordinator : (stryCov_9fa48("28420"), rebalanceCoordinator?.startupRecoveryCoordinator)) || new StartupRecoveryCoordinator(stryMutAct_9fa48("28421") ? {} : (stryCov_9fa48("28421"), {
        readinessState: stryMutAct_9fa48("28424") ? bootstrapReadinessState && null : stryMutAct_9fa48("28423") ? false : stryMutAct_9fa48("28422") ? true : (stryCov_9fa48("28422", "28423", "28424"), bootstrapReadinessState || null)
      })));
      if (stryMutAct_9fa48("28427") ? false : stryMutAct_9fa48("28426") ? true : stryMutAct_9fa48("28425") ? rebalanceCoordinator : (stryCov_9fa48("28425", "28426", "28427"), !rebalanceCoordinator)) {
        if (stryMutAct_9fa48("28428")) {
          {}
        } else {
          stryCov_9fa48("28428");
          const executorOutcomeEmitter = new ExecutorOutcomeEmitter(stryMutAct_9fa48("28429") ? {} : (stryCov_9fa48("28429"), {
            logger
          }));
          rebalanceCoordinator = new RebalanceCoordinator(stryMutAct_9fa48("28430") ? {} : (stryCov_9fa48("28430"), {
            nodeId,
            systemTableCache,
            cdcIntegrationService,
            messageRouter,
            tablePolicyService,
            sqlQueryEngine: controlPlaneRuntimeBundle.sqlQueryEngine,
            transactionCoordinator,
            storageAccountingService,
            storageAdmissionService,
            controlPlaneReadinessService,
            cdcGroupPropagationService: stryMutAct_9fa48("28433") ? cdcGroupPropagationService && null : stryMutAct_9fa48("28432") ? false : stryMutAct_9fa48("28431") ? true : (stryCov_9fa48("28431", "28432", "28433"), cdcGroupPropagationService || null),
            bootstrapReadinessState: stryMutAct_9fa48("28436") ? bootstrapReadinessState && null : stryMutAct_9fa48("28435") ? false : stryMutAct_9fa48("28434") ? true : (stryCov_9fa48("28434", "28435", "28436"), bootstrapReadinessState || null),
            startupRecoveryCoordinator,
            controlPlaneSystemTableGateway,
            executorOutcomeEmitter
          }));
          rebalanceCoordinator.initialize();
          logger.debug(LOG_MSG.COORDINATOR_CREATED, stryMutAct_9fa48("28437") ? {} : (stryCov_9fa48("28437"), {
            nodeId
          }));
        }
      }
      if (stryMutAct_9fa48("28440") ? false : stryMutAct_9fa48("28439") ? true : stryMutAct_9fa48("28438") ? rebalanceCoordinator.storageAccountingService : (stryCov_9fa48("28438", "28439", "28440"), !rebalanceCoordinator.storageAccountingService)) {
        if (stryMutAct_9fa48("28441")) {
          {}
        } else {
          stryCov_9fa48("28441");
          rebalanceCoordinator.storageAccountingService = storageAccountingService;
        }
      }
      if (stryMutAct_9fa48("28444") ? false : stryMutAct_9fa48("28443") ? true : stryMutAct_9fa48("28442") ? rebalanceCoordinator.storageAdmissionService : (stryCov_9fa48("28442", "28443", "28444"), !rebalanceCoordinator.storageAdmissionService)) {
        if (stryMutAct_9fa48("28445")) {
          {}
        } else {
          stryCov_9fa48("28445");
          rebalanceCoordinator.storageAdmissionService = storageAdmissionService;
        }
      }
      if (stryMutAct_9fa48("28448") ? false : stryMutAct_9fa48("28447") ? true : stryMutAct_9fa48("28446") ? rebalanceCoordinator.controlPlaneReadinessService : (stryCov_9fa48("28446", "28447", "28448"), !rebalanceCoordinator.controlPlaneReadinessService)) {
        if (stryMutAct_9fa48("28449")) {
          {}
        } else {
          stryCov_9fa48("28449");
          rebalanceCoordinator.controlPlaneReadinessService = controlPlaneReadinessService;
        }
      }
      if (stryMutAct_9fa48("28452") ? false : stryMutAct_9fa48("28451") ? true : stryMutAct_9fa48("28450") ? rebalanceCoordinator.controlPlaneSystemTableGateway : (stryCov_9fa48("28450", "28451", "28452"), !rebalanceCoordinator.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("28453")) {
          {}
        } else {
          stryCov_9fa48("28453");
          rebalanceCoordinator.controlPlaneSystemTableGateway = controlPlaneSystemTableGateway;
        }
      }
      if (stryMutAct_9fa48("28456") ? !rebalanceCoordinator.bootstrapReadinessState || bootstrapReadinessState : stryMutAct_9fa48("28455") ? false : stryMutAct_9fa48("28454") ? true : (stryCov_9fa48("28454", "28455", "28456"), (stryMutAct_9fa48("28457") ? rebalanceCoordinator.bootstrapReadinessState : (stryCov_9fa48("28457"), !rebalanceCoordinator.bootstrapReadinessState)) && bootstrapReadinessState)) {
        if (stryMutAct_9fa48("28458")) {
          {}
        } else {
          stryCov_9fa48("28458");
          rebalanceCoordinator.bootstrapReadinessState = bootstrapReadinessState;
        }
      }
      if (stryMutAct_9fa48("28461") ? false : stryMutAct_9fa48("28460") ? true : stryMutAct_9fa48("28459") ? rebalanceCoordinator.startupRecoveryCoordinator : (stryCov_9fa48("28459", "28460", "28461"), !rebalanceCoordinator.startupRecoveryCoordinator)) {
        if (stryMutAct_9fa48("28462")) {
          {}
        } else {
          stryCov_9fa48("28462");
          rebalanceCoordinator.startupRecoveryCoordinator = startupRecoveryCoordinator;
        }
      } else if (stryMutAct_9fa48("28465") ? typeof rebalanceCoordinator.startupRecoveryCoordinator.syncOwnerDependencies !== 'function' : stryMutAct_9fa48("28464") ? false : stryMutAct_9fa48("28463") ? true : (stryCov_9fa48("28463", "28464", "28465"), typeof rebalanceCoordinator.startupRecoveryCoordinator.syncOwnerDependencies === (stryMutAct_9fa48("28466") ? "" : (stryCov_9fa48("28466"), 'function')))) {
        if (stryMutAct_9fa48("28467")) {
          {}
        } else {
          stryCov_9fa48("28467");
          rebalanceCoordinator.startupRecoveryCoordinator.syncOwnerDependencies(stryMutAct_9fa48("28468") ? {} : (stryCov_9fa48("28468"), {
            readinessState: stryMutAct_9fa48("28471") ? bootstrapReadinessState && null : stryMutAct_9fa48("28470") ? false : stryMutAct_9fa48("28469") ? true : (stryCov_9fa48("28469", "28470", "28471"), bootstrapReadinessState || null)
          }));
        }
      }
      if (stryMutAct_9fa48("28474") ? !rebalanceCoordinator.cdcGroupPropagationService || cdcGroupPropagationService : stryMutAct_9fa48("28473") ? false : stryMutAct_9fa48("28472") ? true : (stryCov_9fa48("28472", "28473", "28474"), (stryMutAct_9fa48("28475") ? rebalanceCoordinator.cdcGroupPropagationService : (stryCov_9fa48("28475"), !rebalanceCoordinator.cdcGroupPropagationService)) && cdcGroupPropagationService)) {
        if (stryMutAct_9fa48("28476")) {
          {}
        } else {
          stryCov_9fa48("28476");
          rebalanceCoordinator.cdcGroupPropagationService = cdcGroupPropagationService;
        }
      }
      if (stryMutAct_9fa48("28479") ? false : stryMutAct_9fa48("28478") ? true : stryMutAct_9fa48("28477") ? rebalanceCoordinator.transactionCoordinator : (stryCov_9fa48("28477", "28478", "28479"), !rebalanceCoordinator.transactionCoordinator)) {
        if (stryMutAct_9fa48("28480")) {
          {}
        } else {
          stryCov_9fa48("28480");
          rebalanceCoordinator.transactionCoordinator = transactionCoordinator;
        }
      }
      const systemMetadataOwners = createSystemMetadataOwners(stryMutAct_9fa48("28481") ? {} : (stryCov_9fa48("28481"), {
        controlPlaneSystemTableGateway,
        systemTableCache
      }));
      const membershipPublicationService = new MembershipPublicationCoordinator(stryMutAct_9fa48("28482") ? {} : (stryCov_9fa48("28482"), {
        nodeId,
        systemTableCache,
        cdcIntegrationService,
        controlPlaneReadinessService,
        replicaOperationRepository: stryMutAct_9fa48("28485") ? rebalanceCoordinator?.repository && null : stryMutAct_9fa48("28484") ? false : stryMutAct_9fa48("28483") ? true : (stryCov_9fa48("28483", "28484", "28485"), (stryMutAct_9fa48("28486") ? rebalanceCoordinator.repository : (stryCov_9fa48("28486"), rebalanceCoordinator?.repository)) || null),
        controlPlanePublicationsOwner: systemMetadataOwners.controlPlanePublicationsOwner
      }));
      if (stryMutAct_9fa48("28489") ? false : stryMutAct_9fa48("28488") ? true : stryMutAct_9fa48("28487") ? controlPlaneReadinessService.nodesOwner : (stryCov_9fa48("28487", "28488", "28489"), !controlPlaneReadinessService.nodesOwner)) {
        if (stryMutAct_9fa48("28490")) {
          {}
        } else {
          stryCov_9fa48("28490");
          controlPlaneReadinessService.nodesOwner = systemMetadataOwners.nodesOwner;
        }
      }
      if (stryMutAct_9fa48("28493") ? false : stryMutAct_9fa48("28492") ? true : stryMutAct_9fa48("28491") ? controlPlaneReadinessService.servicesOwner : (stryCov_9fa48("28491", "28492", "28493"), !controlPlaneReadinessService.servicesOwner)) {
        if (stryMutAct_9fa48("28494")) {
          {}
        } else {
          stryCov_9fa48("28494");
          controlPlaneReadinessService.servicesOwner = systemMetadataOwners.servicesOwner;
        }
      }
      if (stryMutAct_9fa48("28497") ? typeof controlPlaneReadinessService.syncOwnerDependencies !== 'function' : stryMutAct_9fa48("28496") ? false : stryMutAct_9fa48("28495") ? true : (stryCov_9fa48("28495", "28496", "28497"), typeof controlPlaneReadinessService.syncOwnerDependencies === (stryMutAct_9fa48("28498") ? "" : (stryCov_9fa48("28498"), 'function')))) {
        if (stryMutAct_9fa48("28499")) {
          {}
        } else {
          stryCov_9fa48("28499");
          controlPlaneReadinessService.syncOwnerDependencies(stryMutAct_9fa48("28500") ? {} : (stryCov_9fa48("28500"), {
            systemTableCache,
            cacheMutationTarget: systemTableCache,
            messageRouter,
            cdcIntegrationService,
            membershipPublicationService
          }));
        }
      }

      // Create decomposed control plane services
      const heartbeatService = new HeartbeatService(stryMutAct_9fa48("28501") ? {} : (stryCov_9fa48("28501"), {
        nodeId,
        nodeAddress,
        advertisedNodeWsAddress,
        cdcIntegrationService,
        systemTableCache,
        controlPlaneSystemTableGateway,
        verifyReporterVisibilityOnSuccess: stryMutAct_9fa48("28502") ? false : (stryCov_9fa48("28502"), true)
      }));
      heartbeatService.initialize();
      controlPlaneReadinessService.heartbeatService = heartbeatService;
      const leaseService = new LeaseService(stryMutAct_9fa48("28503") ? {} : (stryCov_9fa48("28503"), {
        nodeId,
        nodeLeaseOwner: heartbeatService,
        systemTableCache,
        sqlQueryEngine: controlPlaneRuntimeBundle.sqlQueryEngine,
        messageRouter,
        controlPlaneSystemTableGateway
      }));
      leaseService.initialize();
      const endpointService = new EndpointService(stryMutAct_9fa48("28504") ? {} : (stryCov_9fa48("28504"), {
        nodeId,
        serviceEndpointsOwner: systemMetadataOwners.serviceEndpointsOwner,
        controlPlaneSystemTableGateway
      }));
      endpointService.initialize();
      const dispatchService = new ReplicaDispatchService(stryMutAct_9fa48("28505") ? {} : (stryCov_9fa48("28505"), {
        nodeId,
        messageRouter,
        cdcIntegrationService,
        systemTableCache,
        rebalanceCoordinator,
        sqlQueryEngine: controlPlaneRuntimeBundle.sqlQueryEngine,
        controlPlaneReadinessService,
        storageAccountingService,
        cdcGroupPropagationService: stryMutAct_9fa48("28508") ? cdcGroupPropagationService && null : stryMutAct_9fa48("28507") ? false : stryMutAct_9fa48("28506") ? true : (stryCov_9fa48("28506", "28507", "28508"), cdcGroupPropagationService || null),
        controlPlaneSystemTableGateway,
        nodesOwner: systemMetadataOwners.nodesOwner,
        servicesOwner: systemMetadataOwners.servicesOwner,
        replicaOperationsOwner: systemMetadataOwners.replicaOperationsOwner
      }));
      dispatchService.initialize();

      // Attach message group services if provided
      if (stryMutAct_9fa48("28511") ? messageGroupServices || messageGroupServices.size > 0 : stryMutAct_9fa48("28510") ? false : stryMutAct_9fa48("28509") ? true : (stryCov_9fa48("28509", "28510", "28511"), messageGroupServices && (stryMutAct_9fa48("28514") ? messageGroupServices.size <= 0 : stryMutAct_9fa48("28513") ? messageGroupServices.size >= 0 : stryMutAct_9fa48("28512") ? true : (stryCov_9fa48("28512", "28513", "28514"), messageGroupServices.size > 0)))) {
        if (stryMutAct_9fa48("28515")) {
          {}
        } else {
          stryCov_9fa48("28515");
          logger.debug(LOG_MSG.ATTACHING_MESSAGE_GROUPS, stryMutAct_9fa48("28516") ? {} : (stryCov_9fa48("28516"), {
            nodeId,
            count: messageGroupServices.size
          }));
          for (const mgs of messageGroupServices.values()) {
            if (stryMutAct_9fa48("28517")) {
              {}
            } else {
              stryCov_9fa48("28517");
              dispatchService.attachMessageGroupService(mgs);
              leaseService.messageGroupServices.add(mgs);
            }
          }
        }
      }
      logger.info(LOG_MSG.CREATED, stryMutAct_9fa48("28518") ? {} : (stryCov_9fa48("28518"), {
        nodeId,
        nodeAddress,
        messageGroupCount: messageGroupServices ? messageGroupServices.size : 0
      }));
      return stryMutAct_9fa48("28519") ? {} : (stryCov_9fa48("28519"), {
        heartbeatService,
        leaseService,
        endpointService,
        dispatchService,
        rebalanceCoordinator,
        membershipPublicationService,
        systemMetadataOwners
      });
    }
  }

  /**
   * Register a node with the control plane and start heartbeat.
   *
   * @param {Object} options - Configuration options.
   * @param {Object} options.heartbeatService - Heartbeat service.
   * @param {string} options.nodeAddress - Node address.
   * @return {Promise<void>}
   * @throws {Error} If registration fails.
   */
  static async registerNode(options) {
    if (stryMutAct_9fa48("28520")) {
      {}
    } else {
      stryCov_9fa48("28520");
      const {
        heartbeatService,
        nodeAddress
      } = options;
      if (stryMutAct_9fa48("28523") ? false : stryMutAct_9fa48("28522") ? true : stryMutAct_9fa48("28521") ? heartbeatService : (stryCov_9fa48("28521", "28522", "28523"), !heartbeatService)) {
        if (stryMutAct_9fa48("28524")) {
          {}
        } else {
          stryCov_9fa48("28524");
          return;
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.forSubsystem(CONTROL_PLANE_SETUP_SUBSYSTEM);
      const nodeId = heartbeatService.nodeId;
      logger.info(LOG_MSG.REGISTERING_NODE, stryMutAct_9fa48("28525") ? {} : (stryCov_9fa48("28525"), {
        nodeId,
        nodeAddress
      }));
      try {
        if (stryMutAct_9fa48("28526")) {
          {}
        } else {
          stryCov_9fa48("28526");
          const stats = await NodeService.getInstance().getNodeStats();
          await heartbeatService.sendHeartbeat(stryMutAct_9fa48("28527") ? {} : (stryCov_9fa48("28527"), {
            cpu: stryMutAct_9fa48("28528") ? {} : (stryCov_9fa48("28528"), {
              count: stryMutAct_9fa48("28529") ? stats.cpu.count : (stryCov_9fa48("28529"), stats.cpu?.count),
              usagePercent: stryMutAct_9fa48("28530") ? stats.cpu.usagePercent : (stryCov_9fa48("28530"), stats.cpu?.usagePercent)
            }),
            memory: stryMutAct_9fa48("28531") ? {} : (stryCov_9fa48("28531"), {
              totalBytes: stryMutAct_9fa48("28532") ? stats.memory.totalBytes : (stryCov_9fa48("28532"), stats.memory?.totalBytes),
              usagePercent: stryMutAct_9fa48("28533") ? stats.memory.usagePercent : (stryCov_9fa48("28533"), stats.memory?.usagePercent)
            }),
            diskGb: stats.diskGb,
            diskUsagePercent: stats.diskUsagePercent
          }));
          logger.debug(LOG_MSG.NODE_REGISTERED, stryMutAct_9fa48("28534") ? {} : (stryCov_9fa48("28534"), {
            nodeId,
            nodeAddress
          }));
          heartbeatService.start(stryMutAct_9fa48("28535") ? {} : (stryCov_9fa48("28535"), {
            nodeAddress,
            getStats: stryMutAct_9fa48("28536") ? () => undefined : (stryCov_9fa48("28536"), () => NodeService.getInstance().getNodeStats())
          }));
          logger.debug(LOG_MSG.HEARTBEAT_STARTED, stryMutAct_9fa48("28537") ? {} : (stryCov_9fa48("28537"), {
            nodeId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("28538")) {
          {}
        } else {
          stryCov_9fa48("28538");
          logger.error(LOG_MSG.REGISTRATION_FAILED, stryMutAct_9fa48("28539") ? {} : (stryCov_9fa48("28539"), {
            nodeId,
            nodeAddress,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }
}
export { ControlPlaneSetup };