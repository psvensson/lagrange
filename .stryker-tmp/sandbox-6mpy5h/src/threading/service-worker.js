/**
 * Service Worker - Worker thread entry point for service execution.
 * Handles service operations in isolated worker threads.
 * Requirements: 2.3, 2.4
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
import { workerData } from 'worker_threads';
import { THREADING_ERROR_MSG, WORKER_OPERATION, WORKER_RESPONSE_STATUS } from './threading-constants.js';

/**
 * Service registry for worker thread.
 * Maps service IDs to their handlers.
 */
const serviceHandlers = new Map();

/**
 * Register a service handler.
 * @param {string} serviceId - The service identifier.
 * @param {Object} handler - The service handler object.
 */
function registerServiceHandler(serviceId, handler) {
  if (stryMutAct_9fa48("152515")) {
    {}
  } else {
    stryCov_9fa48("152515");
    serviceHandlers.set(serviceId, handler);
  }
}

/**
 * Unregister a service handler.
 * @param {string} serviceId - The service identifier.
 * @return {boolean} True if handler was removed.
 */
function unregisterServiceHandler(serviceId) {
  if (stryMutAct_9fa48("152516")) {
    {}
  } else {
    stryCov_9fa48("152516");
    return serviceHandlers.delete(serviceId);
  }
}

/**
 * Get a service handler.
 * @param {string} serviceId - The service identifier.
 * @return {Object|undefined} The service handler or undefined.
 */
function getServiceHandler(serviceId) {
  if (stryMutAct_9fa48("152517")) {
    {}
  } else {
    stryCov_9fa48("152517");
    return serviceHandlers.get(serviceId);
  }
}

/**
 * Execute a service operation.
 * @param {Object} task - The task to execute.
 * @param {string} task.serviceId - The target service ID.
 * @param {string} task.operation - The operation to perform.
 * @param {*} task.data - The operation data.
 * @return {Promise<*>} The operation result.
 */
async function executeOperation(task) {
  if (stryMutAct_9fa48("152518")) {
    {}
  } else {
    stryCov_9fa48("152518");
    const {
      serviceId,
      operation,
      data
    } = task;
    switch (operation) {
      case WORKER_OPERATION.PING:
        if (stryMutAct_9fa48("152519")) {} else {
          stryCov_9fa48("152519");
          return stryMutAct_9fa48("152520") ? {} : (stryCov_9fa48("152520"), {
            status: WORKER_RESPONSE_STATUS.OK,
            serviceId,
            timestamp: Date.now(),
            workerId: stryMutAct_9fa48("152521") ? workerData.workerId : (stryCov_9fa48("152521"), workerData?.workerId)
          });
        }
      case WORKER_OPERATION.GET_STATUS:
        if (stryMutAct_9fa48("152522")) {} else {
          stryCov_9fa48("152522");
          return stryMutAct_9fa48("152523") ? {} : (stryCov_9fa48("152523"), {
            serviceId,
            registered: serviceHandlers.has(serviceId),
            handlerCount: serviceHandlers.size,
            timestamp: Date.now()
          });
        }
      case WORKER_OPERATION.REGISTER:
        if (stryMutAct_9fa48("152524")) {} else {
          stryCov_9fa48("152524");
          registerServiceHandler(serviceId, stryMutAct_9fa48("152527") ? data.handler && {} : stryMutAct_9fa48("152526") ? false : stryMutAct_9fa48("152525") ? true : (stryCov_9fa48("152525", "152526", "152527"), data.handler || {}));
          return stryMutAct_9fa48("152528") ? {} : (stryCov_9fa48("152528"), {
            success: stryMutAct_9fa48("152529") ? false : (stryCov_9fa48("152529"), true),
            serviceId
          });
        }
      case WORKER_OPERATION.UNREGISTER:
        if (stryMutAct_9fa48("152530")) {} else {
          stryCov_9fa48("152530");
          {
            if (stryMutAct_9fa48("152531")) {
              {}
            } else {
              stryCov_9fa48("152531");
              const removed = unregisterServiceHandler(serviceId);
              return stryMutAct_9fa48("152532") ? {} : (stryCov_9fa48("152532"), {
                success: removed,
                serviceId
              });
            }
          }
        }
      default:
        if (stryMutAct_9fa48("152533")) {} else {
          stryCov_9fa48("152533");
          {
            if (stryMutAct_9fa48("152534")) {
              {}
            } else {
              stryCov_9fa48("152534");
              const handler = getServiceHandler(serviceId);
              if (stryMutAct_9fa48("152537") ? false : stryMutAct_9fa48("152536") ? true : stryMutAct_9fa48("152535") ? handler : (stryCov_9fa48("152535", "152536", "152537"), !handler)) {
                if (stryMutAct_9fa48("152538")) {
                  {}
                } else {
                  stryCov_9fa48("152538");
                  throw new Error(THREADING_ERROR_MSG.noHandlerRegistered(serviceId));
                }
              }
              if (stryMutAct_9fa48("152541") ? typeof handler[operation] === 'function' : stryMutAct_9fa48("152540") ? false : stryMutAct_9fa48("152539") ? true : (stryCov_9fa48("152539", "152540", "152541"), typeof handler[operation] !== (stryMutAct_9fa48("152542") ? "" : (stryCov_9fa48("152542"), 'function')))) {
                if (stryMutAct_9fa48("152543")) {
                  {}
                } else {
                  stryCov_9fa48("152543");
                  throw new Error(THREADING_ERROR_MSG.unknownOperation(operation, serviceId));
                }
              }
              return await handler[operation](data);
            }
          }
        }
    }
  }
}

// Export for piscina.
export default executeOperation;

// Also export utilities for testing.
export { registerServiceHandler, unregisterServiceHandler, getServiceHandler, executeOperation };