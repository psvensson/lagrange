/**
 * Meta-service routing and availability checking.
 * Provides a single function to check whether a meta-service
 * leader is routable, and returns a structured unavailable
 * error when it is not.
 *
 * Requirements: 1.4, 1.5
 * @module wasm-service/meta-service-router
 */

import {TABLES} from '../constants/tables.js';
import {COLUMN} from '../constants/columns.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {isMetaService} from './meta-service-lifecycle.js';

const META_ROUTER_ERROR_CODE = Object.freeze({
  META_SERVICE_UNAVAILABLE: 'META_SERVICE_UNAVAILABLE',
  INVALID_META_SERVICE: 'INVALID_META_SERVICE',
});

const META_ROUTER_ERROR_MSG = Object.freeze({
  NO_LEADER: 'Meta-service leader is not routable',
  NOT_META_SERVICE: 'Service ID is not a recognized meta-service',
  CACHE_REQUIRED: 'System table cache is required',
});

/**
 * Checks if the given meta-service has a routable leader.
 *
 * @param {Object} systemTableCache - The system table cache.
 * @param {string} serviceId - The meta-service ID to check.
 * @return {{available: boolean, leaderAddress?: string,
 *   error?: string}} Availability result.
 * @throws {Error} If systemTableCache is missing.
 */
function checkMetaServiceAvailability(systemTableCache, serviceId) {
  if (!systemTableCache) {
    throw new Error(META_ROUTER_ERROR_MSG.CACHE_REQUIRED);
  }
  if (!isMetaService(serviceId)) {
    return {
      available: false,
      error: META_ROUTER_ERROR_MSG.NOT_META_SERVICE,
    };
  }
  const services = systemTableCache.getAll(TABLES.SERVICES) || [];
  const leader = services.find(
    (s) => s[COLUMN.SERVICE_ID] === serviceId &&
           s[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
           s[COLUMN.ADDRESS],
  );
  if (leader) {
    return {available: true, leaderAddress: leader[COLUMN.ADDRESS]};
  }
  return {available: false, error: META_ROUTER_ERROR_MSG.NO_LEADER};
}

/**
 * Routes a command to a meta-service leader if available.
 *
 * @param {Object} systemTableCache - The system table cache.
 * @param {string} serviceId - The meta-service ID.
 * @param {string} command - The command name.
 * @param {Object} payload - The command payload.
 * @return {{success: boolean, leaderAddress?: string,
 *   serviceId?: string, command?: string, payload?: Object,
 *   error?: string, code?: string}} Routing result.
 */
function routeToMetaService(
  systemTableCache, serviceId, command, payload,
) {
  if (!isMetaService(serviceId)) {
    return {
      success: false,
      error: META_ROUTER_ERROR_MSG.NOT_META_SERVICE,
      code: META_ROUTER_ERROR_CODE.INVALID_META_SERVICE,
    };
  }
  const availability = checkMetaServiceAvailability(
    systemTableCache, serviceId,
  );
  if (!availability.available) {
    return {
      success: false,
      error: availability.error,
      code: META_ROUTER_ERROR_CODE.META_SERVICE_UNAVAILABLE,
    };
  }
  return {
    success: true,
    leaderAddress: availability.leaderAddress,
    serviceId,
    command,
    payload,
  };
}

export {
  META_ROUTER_ERROR_CODE,
  META_ROUTER_ERROR_MSG,
  checkMetaServiceAvailability,
  routeToMetaService,
};
