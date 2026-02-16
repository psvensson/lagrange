/**
 * Factory for creating SQL engine service definitions with
 * correct defaults. SQL engine profiles reuse the replicated
 * WASM service infrastructure but do not require a
 * user-provided handler function.
 *
 * @module wasm-service/sql-profile-factory
 */

import {
  SERVICE_PROFILE,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {SQL_ENGINE_RUNTIME_KIND} from '../constants/runtime.js';
import {
  SQL_ENGINE_PROFILE,
  WASM_SERVICE_DEFAULT,
} from './wasm-service-constants.js';
import {
  SQL_PROFILE_DEFAULT,
  SQL_PROFILE_ERROR_MSG,
} from './sql-profile-constants.js';

/**
 * Create a service definition configured for the SQL engine
 * profile. Applies SQL-specific defaults for consistency
 * modes and sets the handler function ID to null.
 *
 * @param {Object} options - Definition options.
 * @param {string} options.serviceId - Unique service ID.
 * @param {string} options.serviceName - Human-readable name.
 * @param {number} [options.replicaCount] - Odd number >= 3.
 * @param {string} [options.readConsistency] - Read mode.
 * @param {string} [options.writeConsistency] - Write mode.
 * @param {Object} [options.resourceBudget] - Budget limits.
 * @param {number} [options.safetyIntervalMs] - Safety ms.
 * @return {Object} A service definition object with
 *   SQL_ENGINE profile defaults applied.
 * @throws {Error} If serviceId or serviceName is missing.
 */
function createSqlEngineDefinition(options) {
  if (!options.serviceId) {
    throw new Error(SQL_PROFILE_ERROR_MSG.MISSING_SERVICE_ID);
  }
  if (!options.serviceName) {
    throw new Error(
      SQL_PROFILE_ERROR_MSG.MISSING_SERVICE_NAME,
    );
  }

  return {
    serviceId: options.serviceId,
    serviceName: options.serviceName,
    serviceProfile: SERVICE_PROFILE.SQL_ENGINE,
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    handlerFunctionId: SQL_PROFILE_DEFAULT.HANDLER_FUNCTION_ID,
    runtimeKind: SQL_ENGINE_RUNTIME_KIND,
    runtimeRef: null,
    runtimeConfig: null,
    readConsistency:
      options.readConsistency ??
      SQL_ENGINE_PROFILE.DEFAULT_READ_CONSISTENCY,
    writeConsistency:
      options.writeConsistency ??
      SQL_ENGINE_PROFILE.DEFAULT_WRITE_CONSISTENCY,
    replicaCount:
      options.replicaCount ??
      WASM_SERVICE_DEFAULT.REPLICA_COUNT,
    resourceBudget: options.resourceBudget ?? {},
    safetyIntervalMs:
      options.safetyIntervalMs ??
      WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
  };
}

/**
 * Check whether a service definition uses the SQL engine
 * profile.
 *
 * @param {Object} definition - Service definition object.
 * @return {boolean} True if the definition has the
 *   SQL_ENGINE service profile.
 */
function isSqlEngineProfile(definition) {
  return definition.serviceProfile ===
    SERVICE_PROFILE.SQL_ENGINE;
}

export {createSqlEngineDefinition, isSqlEngineProfile};
