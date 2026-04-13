/**
 * RuntimeServiceHandlerSetup - Shared runtime service handler creation
 * and configuration used by both BootstrapService and NodeJoiningService.
 *
 * Creates and registers the RuntimeServiceHandler with the message
 * router so the node can receive and execute runtime-service
 * replica operations (ADD/REMOVE/REPLACE).
 *
 * Requirements: 2.1, 3.2, 4.4, 11.2
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
import { RuntimeServiceHandler } from '../../node/runtime-service-handler.js';
import { LoggingService } from '../../logging/logging-service.js';
import { DependencyError } from '../bootstrap-errors.js';
import { SUBSYSTEM } from '../../constants/index.js';
const LOG_MSG = Object.freeze(stryMutAct_9fa48("30541") ? {} : (stryCov_9fa48("30541"), {
  CREATING: stryMutAct_9fa48("30542") ? "" : (stryCov_9fa48("30542"), 'Creating RuntimeServiceHandler'),
  CREATED: stryMutAct_9fa48("30543") ? "" : (stryCov_9fa48("30543"), 'RuntimeServiceHandler created and registered')
}));
const ERROR_MSG = Object.freeze(stryMutAct_9fa48("30544") ? {} : (stryCov_9fa48("30544"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("30545") ? "" : (stryCov_9fa48("30545"), 'nodeId'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("30546") ? "" : (stryCov_9fa48("30546"), 'messageRouter'),
  CDC_INTEGRATION_SERVICE_REQUIRED: stryMutAct_9fa48("30547") ? "" : (stryCov_9fa48("30547"), 'cdcIntegrationService'),
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("30548") ? "" : (stryCov_9fa48("30548"), 'systemTableCache'),
  SERVICE_LIFECYCLE_MANAGER_REQUIRED: stryMutAct_9fa48("30549") ? "" : (stryCov_9fa48("30549"), 'serviceLifecycleManager')
}));
class RuntimeServiceHandlerSetup {
  /**
   * Create and configure runtime service handler.
   *
   * @param {Object} options
   * @param {string} options.nodeId - Node ID (required).
   * @param {Object} options.messageRouter - Message router (required).
   * @param {Object} options.cdcIntegrationService - CDC service (required).
   * @param {Object} options.systemTableCache - Cache (required).
   * @param {Object} options.serviceLifecycleManager - Lifecycle
   *   manager (required).
   * @param {Object} [options.rpcClient] - Optional RPC client.
   * @return {Object} Object containing runtimeServiceHandler.
   * @throws {DependencyError} If required dependencies missing.
   */
  static create(options) {
    if (stryMutAct_9fa48("30550")) {
      {}
    } else {
      stryCov_9fa48("30550");
      const {
        nodeId,
        messageRouter,
        cdcIntegrationService,
        systemTableCache,
        serviceLifecycleManager,
        rpcClient
      } = options;
      if (stryMutAct_9fa48("30553") ? false : stryMutAct_9fa48("30552") ? true : stryMutAct_9fa48("30551") ? nodeId : (stryCov_9fa48("30551", "30552", "30553"), !nodeId)) {
        if (stryMutAct_9fa48("30554")) {
          {}
        } else {
          stryCov_9fa48("30554");
          throw new DependencyError(stryMutAct_9fa48("30555") ? "" : (stryCov_9fa48("30555"), 'RuntimeServiceHandlerSetup'), ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30558") ? false : stryMutAct_9fa48("30557") ? true : stryMutAct_9fa48("30556") ? messageRouter : (stryCov_9fa48("30556", "30557", "30558"), !messageRouter)) {
        if (stryMutAct_9fa48("30559")) {
          {}
        } else {
          stryCov_9fa48("30559");
          throw new DependencyError(stryMutAct_9fa48("30560") ? "" : (stryCov_9fa48("30560"), 'RuntimeServiceHandlerSetup'), ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30563") ? false : stryMutAct_9fa48("30562") ? true : stryMutAct_9fa48("30561") ? cdcIntegrationService : (stryCov_9fa48("30561", "30562", "30563"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("30564")) {
          {}
        } else {
          stryCov_9fa48("30564");
          throw new DependencyError(stryMutAct_9fa48("30565") ? "" : (stryCov_9fa48("30565"), 'RuntimeServiceHandlerSetup'), ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30568") ? false : stryMutAct_9fa48("30567") ? true : stryMutAct_9fa48("30566") ? systemTableCache : (stryCov_9fa48("30566", "30567", "30568"), !systemTableCache)) {
        if (stryMutAct_9fa48("30569")) {
          {}
        } else {
          stryCov_9fa48("30569");
          throw new DependencyError(stryMutAct_9fa48("30570") ? "" : (stryCov_9fa48("30570"), 'RuntimeServiceHandlerSetup'), ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("30573") ? false : stryMutAct_9fa48("30572") ? true : stryMutAct_9fa48("30571") ? serviceLifecycleManager : (stryCov_9fa48("30571", "30572", "30573"), !serviceLifecycleManager)) {
        if (stryMutAct_9fa48("30574")) {
          {}
        } else {
          stryCov_9fa48("30574");
          throw new DependencyError(stryMutAct_9fa48("30575") ? "" : (stryCov_9fa48("30575"), 'RuntimeServiceHandlerSetup'), ERROR_MSG.SERVICE_LIFECYCLE_MANAGER_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.isInitialized() ? loggingService.forSubsystem(SUBSYSTEM.RUNTIME_SERVICE_HANDLER_SETUP) : console;
      logger.info(LOG_MSG.CREATING, stryMutAct_9fa48("30576") ? {} : (stryCov_9fa48("30576"), {
        nodeId
      }));
      const runtimeServiceHandler = new RuntimeServiceHandler(stryMutAct_9fa48("30577") ? {} : (stryCov_9fa48("30577"), {
        nodeId,
        systemTableCache,
        cdcIntegrationService,
        serviceLifecycleManager
      }));
      runtimeServiceHandler.initialize();
      runtimeServiceHandler.registerWithRouter(messageRouter, stryMutAct_9fa48("30578") ? {} : (stryCov_9fa48("30578"), {
        rpcClient
      }));
      logger.info(LOG_MSG.CREATED, stryMutAct_9fa48("30579") ? {} : (stryCov_9fa48("30579"), {
        nodeId
      }));
      return stryMutAct_9fa48("30580") ? {} : (stryCov_9fa48("30580"), {
        runtimeServiceHandler
      });
    }
  }
}
export { RuntimeServiceHandlerSetup };