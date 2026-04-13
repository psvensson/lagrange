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
import os from 'os';
import { CONFIG_KEY } from '../config/config-constants.js';
const THREADING_SUBSYSTEM = stryMutAct_9fa48("152544") ? "" : (stryCov_9fa48("152544"), 'threading');
const THREADING_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("152545") ? {} : (stryCov_9fa48("152545"), {
  MIN_THREADS: CONFIG_KEY.WORKER_MIN_THREADS,
  MAX_THREADS: CONFIG_KEY.WORKER_MAX_THREADS,
  IDLE_TIMEOUT_MS: CONFIG_KEY.WORKER_IDLE_TIMEOUT_MS
}));
const THREADING_DEFAULT = Object.freeze(stryMutAct_9fa48("152546") ? {} : (stryCov_9fa48("152546"), {
  MIN_THREADS: 2,
  MAX_THREADS: os.cpus().length,
  IDLE_TIMEOUT_MS: 30000
}));
const THREADING_EVENT = Object.freeze(stryMutAct_9fa48("152547") ? {} : (stryCov_9fa48("152547"), {
  POOL_ERROR: stryMutAct_9fa48("152548") ? "" : (stryCov_9fa48("152548"), 'poolError'),
  SERVICE_REGISTERED: stryMutAct_9fa48("152549") ? "" : (stryCov_9fa48("152549"), 'serviceRegistered'),
  SERVICE_UNREGISTERED: stryMutAct_9fa48("152550") ? "" : (stryCov_9fa48("152550"), 'serviceUnregistered')
}));
const THREADING_LOG_MSG = Object.freeze(stryMutAct_9fa48("152551") ? {} : (stryCov_9fa48("152551"), {
  POOL_ERROR: stryMutAct_9fa48("152552") ? "" : (stryCov_9fa48("152552"), 'Worker pool error'),
  INITIALIZED: stryMutAct_9fa48("152553") ? "" : (stryCov_9fa48("152553"), 'Service thread manager initialized'),
  OPERATION_COMPLETED: stryMutAct_9fa48("152554") ? "" : (stryCov_9fa48("152554"), 'Service operation completed'),
  OPERATION_FAILED: stryMutAct_9fa48("152555") ? "" : (stryCov_9fa48("152555"), 'Service operation failed'),
  SERVICE_REGISTERED: stryMutAct_9fa48("152556") ? "" : (stryCov_9fa48("152556"), 'Service registered'),
  SERVICE_UNREGISTERED: stryMutAct_9fa48("152557") ? "" : (stryCov_9fa48("152557"), 'Service unregistered'),
  SERVICE_REGISTRATION_FAILED: stryMutAct_9fa48("152558") ? "" : (stryCov_9fa48("152558"), 'Service registration failed'),
  SERVICE_UNREGISTRATION_FAILED: stryMutAct_9fa48("152559") ? "" : (stryCov_9fa48("152559"), 'Service unregistration failed'),
  SHUTDOWN_START: stryMutAct_9fa48("152560") ? "" : (stryCov_9fa48("152560"), 'Shutting down service thread manager'),
  SHUTDOWN_UNREGISTER_ERROR: stryMutAct_9fa48("152561") ? "" : (stryCov_9fa48("152561"), 'Error unregistering service during shutdown'),
  SHUTDOWN_COMPLETE: stryMutAct_9fa48("152562") ? "" : (stryCov_9fa48("152562"), 'Service thread manager shutdown complete')
}));
const THREADING_ERROR_MSG = Object.freeze(stryMutAct_9fa48("152563") ? {} : (stryCov_9fa48("152563"), {
  NOT_INITIALIZED: stryMutAct_9fa48("152564") ? "" : (stryCov_9fa48("152564"), 'ServiceThreadManager not initialized'),
  serviceAlreadyRegistered: stryMutAct_9fa48("152565") ? () => undefined : (stryCov_9fa48("152565"), serviceId => stryMutAct_9fa48("152566") ? `` : (stryCov_9fa48("152566"), `Service already registered: ${serviceId}`)),
  serviceNotFound: stryMutAct_9fa48("152567") ? () => undefined : (stryCov_9fa48("152567"), serviceId => stryMutAct_9fa48("152568") ? `` : (stryCov_9fa48("152568"), `Service not found: ${serviceId}`)),
  noHandlerRegistered: stryMutAct_9fa48("152569") ? () => undefined : (stryCov_9fa48("152569"), serviceId => stryMutAct_9fa48("152570") ? `` : (stryCov_9fa48("152570"), `No handler registered for service: ${serviceId}`)),
  unknownOperation: stryMutAct_9fa48("152571") ? () => undefined : (stryCov_9fa48("152571"), (operation, serviceId) => stryMutAct_9fa48("152572") ? `` : (stryCov_9fa48("152572"), `Unknown operation: ${operation} for service: ${serviceId}`))
}));
const THREADING_HEALTH_STATUS = Object.freeze(stryMutAct_9fa48("152573") ? {} : (stryCov_9fa48("152573"), {
  HEALTHY: stryMutAct_9fa48("152574") ? "" : (stryCov_9fa48("152574"), 'healthy'),
  UNHEALTHY: stryMutAct_9fa48("152575") ? "" : (stryCov_9fa48("152575"), 'unhealthy')
}));
const SERVICE_STATUS = Object.freeze(stryMutAct_9fa48("152576") ? {} : (stryCov_9fa48("152576"), {
  PENDING: stryMutAct_9fa48("152577") ? "" : (stryCov_9fa48("152577"), 'pending'),
  STARTING: stryMutAct_9fa48("152578") ? "" : (stryCov_9fa48("152578"), 'starting'),
  RUNNING: stryMutAct_9fa48("152579") ? "" : (stryCov_9fa48("152579"), 'running'),
  STOPPING: stryMutAct_9fa48("152580") ? "" : (stryCov_9fa48("152580"), 'stopping'),
  STOPPED: stryMutAct_9fa48("152581") ? "" : (stryCov_9fa48("152581"), 'stopped'),
  FAILED: stryMutAct_9fa48("152582") ? "" : (stryCov_9fa48("152582"), 'failed')
}));
const WORKER_OPERATION = Object.freeze(stryMutAct_9fa48("152583") ? {} : (stryCov_9fa48("152583"), {
  PING: stryMutAct_9fa48("152584") ? "" : (stryCov_9fa48("152584"), 'ping'),
  GET_STATUS: stryMutAct_9fa48("152585") ? "" : (stryCov_9fa48("152585"), 'getStatus'),
  REGISTER: stryMutAct_9fa48("152586") ? "" : (stryCov_9fa48("152586"), 'register'),
  UNREGISTER: stryMutAct_9fa48("152587") ? "" : (stryCov_9fa48("152587"), 'unregister')
}));
const WORKER_RESPONSE_STATUS = Object.freeze(stryMutAct_9fa48("152588") ? {} : (stryCov_9fa48("152588"), {
  OK: stryMutAct_9fa48("152589") ? "" : (stryCov_9fa48("152589"), 'ok')
}));
export { SERVICE_STATUS, THREADING_CONFIG_KEY, THREADING_DEFAULT, THREADING_ERROR_MSG, THREADING_HEALTH_STATUS, THREADING_EVENT, THREADING_LOG_MSG, THREADING_SUBSYSTEM, WORKER_OPERATION, WORKER_RESPONSE_STATUS };