/**
 * Constants specific to SQL engine service profile factory
 * and validation flows.
 *
 * @module wasm-service/sql-profile-constants
 */

/**
 * Field names used in SQL profile factory operations.
 * @enum {string}
 */
const SQL_PROFILE_FIELD = Object.freeze({
  SERVICE_ID: 'serviceId',
  SERVICE_NAME: 'serviceName',
  SERVICE_PROFILE: 'serviceProfile',
  HANDLER_FUNCTION_ID: 'handlerFunctionId',
  READ_CONSISTENCY: 'readConsistency',
  WRITE_CONSISTENCY: 'writeConsistency',
  REPLICA_COUNT: 'replicaCount',
  SERVICE_PROFILE_META: 'service_profile',
});

/**
 * Error messages for SQL profile operations.
 * @enum {string}
 */
const SQL_PROFILE_ERROR_MSG = Object.freeze({
  MISSING_SERVICE_ID:
    'SQL engine definition requires a serviceId',
  MISSING_SERVICE_NAME:
    'SQL engine definition requires a serviceName',
  INVALID_REPLICA_COUNT:
    'SQL engine replica count must be an odd number >= 3',
});

/**
 * Log messages for SQL profile operations.
 * @enum {string}
 */
const SQL_PROFILE_LOG_MSG = Object.freeze({
  DEFINITION_CREATED: 'SQL engine service definition created',
  ENDPOINT_BUILT:
    'SQL engine endpoint record built',
});

/**
 * Default values for SQL engine service definitions.
 * The handler function ID is null because SQL engine
 * profiles do not require a user-provided handler.
 * @enum {*}
 */
const SQL_PROFILE_DEFAULT = Object.freeze({
  HANDLER_FUNCTION_ID: null,
});

export {
  SQL_PROFILE_FIELD,
  SQL_PROFILE_ERROR_MSG,
  SQL_PROFILE_LOG_MSG,
  SQL_PROFILE_DEFAULT,
};
