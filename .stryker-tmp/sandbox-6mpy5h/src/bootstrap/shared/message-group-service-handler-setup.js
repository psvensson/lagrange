/**
 * Shared setup for MessageGroupServiceHandler.
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
import { LoggingService } from '../../logging/logging-service.js';
import { MessageGroupServiceHandler } from '../../node/message-group-service-handler.js';
import { DependencyError } from '../bootstrap-errors.js';
const MESSAGE_GROUP_HANDLER_SETUP_SUBSYSTEM = stryMutAct_9fa48("29477") ? "" : (stryCov_9fa48("29477"), 'message-group-service-handler-setup');
const LOG_MSG = Object.freeze(stryMutAct_9fa48("29478") ? {} : (stryCov_9fa48("29478"), {
  CREATING: stryMutAct_9fa48("29479") ? "" : (stryCov_9fa48("29479"), 'Creating MessageGroupServiceHandler'),
  CREATED: stryMutAct_9fa48("29480") ? "" : (stryCov_9fa48("29480"), 'MessageGroupServiceHandler created and registered')
}));
const ERROR_MSG = Object.freeze(stryMutAct_9fa48("29481") ? {} : (stryCov_9fa48("29481"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("29482") ? "" : (stryCov_9fa48("29482"), 'nodeId'),
  MESSAGE_ROUTER_REQUIRED: stryMutAct_9fa48("29483") ? "" : (stryCov_9fa48("29483"), 'messageRouter'),
  CDC_INTEGRATION_SERVICE_REQUIRED: stryMutAct_9fa48("29484") ? "" : (stryCov_9fa48("29484"), 'cdcIntegrationService'),
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("29485") ? "" : (stryCov_9fa48("29485"), 'systemTableCache'),
  CREATE_REQUIRED: stryMutAct_9fa48("29486") ? "" : (stryCov_9fa48("29486"), 'createMessageGroupReplica'),
  START_REQUIRED: stryMutAct_9fa48("29487") ? "" : (stryCov_9fa48("29487"), 'startMessageGroupReplica'),
  STOP_REQUIRED: stryMutAct_9fa48("29488") ? "" : (stryCov_9fa48("29488"), 'stopMessageGroupReplica')
}));
class MessageGroupServiceHandlerSetup {
  static create(options) {
    if (stryMutAct_9fa48("29489")) {
      {}
    } else {
      stryCov_9fa48("29489");
      const {
        nodeId,
        messageRouter,
        cdcIntegrationService,
        systemTableCache,
        createMessageGroupReplica,
        startMessageGroupReplica,
        stopMessageGroupReplica,
        resolveLocalMessageGroupReplica,
        rpcClient
      } = options;
      if (stryMutAct_9fa48("29492") ? false : stryMutAct_9fa48("29491") ? true : stryMutAct_9fa48("29490") ? nodeId : (stryCov_9fa48("29490", "29491", "29492"), !nodeId)) {
        if (stryMutAct_9fa48("29493")) {
          {}
        } else {
          stryCov_9fa48("29493");
          throw new DependencyError(stryMutAct_9fa48("29494") ? "" : (stryCov_9fa48("29494"), 'MessageGroupServiceHandlerSetup'), ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("29497") ? false : stryMutAct_9fa48("29496") ? true : stryMutAct_9fa48("29495") ? messageRouter : (stryCov_9fa48("29495", "29496", "29497"), !messageRouter)) {
        if (stryMutAct_9fa48("29498")) {
          {}
        } else {
          stryCov_9fa48("29498");
          throw new DependencyError(stryMutAct_9fa48("29499") ? "" : (stryCov_9fa48("29499"), 'MessageGroupServiceHandlerSetup'), ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("29502") ? false : stryMutAct_9fa48("29501") ? true : stryMutAct_9fa48("29500") ? cdcIntegrationService : (stryCov_9fa48("29500", "29501", "29502"), !cdcIntegrationService)) {
        if (stryMutAct_9fa48("29503")) {
          {}
        } else {
          stryCov_9fa48("29503");
          throw new DependencyError(stryMutAct_9fa48("29504") ? "" : (stryCov_9fa48("29504"), 'MessageGroupServiceHandlerSetup'), ERROR_MSG.CDC_INTEGRATION_SERVICE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("29507") ? false : stryMutAct_9fa48("29506") ? true : stryMutAct_9fa48("29505") ? systemTableCache : (stryCov_9fa48("29505", "29506", "29507"), !systemTableCache)) {
        if (stryMutAct_9fa48("29508")) {
          {}
        } else {
          stryCov_9fa48("29508");
          throw new DependencyError(stryMutAct_9fa48("29509") ? "" : (stryCov_9fa48("29509"), 'MessageGroupServiceHandlerSetup'), ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("29512") ? typeof createMessageGroupReplica === 'function' : stryMutAct_9fa48("29511") ? false : stryMutAct_9fa48("29510") ? true : (stryCov_9fa48("29510", "29511", "29512"), typeof createMessageGroupReplica !== (stryMutAct_9fa48("29513") ? "" : (stryCov_9fa48("29513"), 'function')))) {
        if (stryMutAct_9fa48("29514")) {
          {}
        } else {
          stryCov_9fa48("29514");
          throw new DependencyError(stryMutAct_9fa48("29515") ? "" : (stryCov_9fa48("29515"), 'MessageGroupServiceHandlerSetup'), ERROR_MSG.CREATE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("29518") ? typeof startMessageGroupReplica === 'function' : stryMutAct_9fa48("29517") ? false : stryMutAct_9fa48("29516") ? true : (stryCov_9fa48("29516", "29517", "29518"), typeof startMessageGroupReplica !== (stryMutAct_9fa48("29519") ? "" : (stryCov_9fa48("29519"), 'function')))) {
        if (stryMutAct_9fa48("29520")) {
          {}
        } else {
          stryCov_9fa48("29520");
          throw new DependencyError(stryMutAct_9fa48("29521") ? "" : (stryCov_9fa48("29521"), 'MessageGroupServiceHandlerSetup'), ERROR_MSG.START_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("29524") ? typeof stopMessageGroupReplica === 'function' : stryMutAct_9fa48("29523") ? false : stryMutAct_9fa48("29522") ? true : (stryCov_9fa48("29522", "29523", "29524"), typeof stopMessageGroupReplica !== (stryMutAct_9fa48("29525") ? "" : (stryCov_9fa48("29525"), 'function')))) {
        if (stryMutAct_9fa48("29526")) {
          {}
        } else {
          stryCov_9fa48("29526");
          throw new DependencyError(stryMutAct_9fa48("29527") ? "" : (stryCov_9fa48("29527"), 'MessageGroupServiceHandlerSetup'), ERROR_MSG.STOP_REQUIRED);
        }
      }
      const loggingService = LoggingService.getInstance();
      const logger = loggingService.isInitialized() ? loggingService.forSubsystem(MESSAGE_GROUP_HANDLER_SETUP_SUBSYSTEM) : console;
      logger.info(LOG_MSG.CREATING, stryMutAct_9fa48("29528") ? {} : (stryCov_9fa48("29528"), {
        nodeId
      }));
      const messageGroupServiceHandler = new MessageGroupServiceHandler(stryMutAct_9fa48("29529") ? {} : (stryCov_9fa48("29529"), {
        nodeId,
        systemTableCache,
        cdcIntegrationService,
        createMessageGroupReplica,
        startMessageGroupReplica,
        stopMessageGroupReplica,
        resolveLocalMessageGroupReplica
      }));
      messageGroupServiceHandler.initialize();
      messageGroupServiceHandler.registerWithRouter(messageRouter, stryMutAct_9fa48("29530") ? {} : (stryCov_9fa48("29530"), {
        rpcClient
      }));
      logger.info(LOG_MSG.CREATED, stryMutAct_9fa48("29531") ? {} : (stryCov_9fa48("29531"), {
        nodeId
      }));
      return stryMutAct_9fa48("29532") ? {} : (stryCov_9fa48("29532"), {
        messageGroupServiceHandler
      });
    }
  }
}
export { MessageGroupServiceHandlerSetup };