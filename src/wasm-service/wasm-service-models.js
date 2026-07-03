import {STRING, SERVICE_PROFILE} from '../constants/index.js';
import {RUNTIME_FIELD} from '../constants/runtime.js';
import {
  TIMER_STATUS,
  DEFAULT_RESOURCE_BUDGET,
  WASM_SERVICE_DEFAULT,
  WASM_SERVICE_DEFINITION_STATUS,
} from './wasm-service-constants.js';
import {
  applyRuntimeDefaults,
  applyLegacyDefaults,
} from './runtime-legacy-mapping.js';

/**
 * Column name constants for service_definitions table.
 * @enum {string}
 */
const SD_COL = Object.freeze({
  SERVICE_ID: 'service_id',
  SERVICE_NAME: 'service_name',
  SERVICE_PROFILE: 'service_profile',
  HANDLER_FUNCTION_ID: 'handler_function_id',
  READ_CONSISTENCY: 'read_consistency',
  WRITE_CONSISTENCY: 'write_consistency',
  READ_LOCALITY: 'read_locality',
  REPLICA_COUNT: 'replica_count',
  PROTOCOL: 'protocol',
  RESOURCE_BUDGET: 'resource_budget',
  SAFETY_INTERVAL_MS: 'safety_interval_ms',
  RUNTIME_KIND: RUNTIME_FIELD.RUNTIME_KIND,
  RUNTIME_REF: RUNTIME_FIELD.RUNTIME_REF,
  RUNTIME_CONFIG: RUNTIME_FIELD.RUNTIME_CONFIG,
  STATUS: 'status',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
});

/**
 * Canonical column order for service_definitions rows.
 * This list is the single source of truth for row serialization
 * and SQL INSERT projection in meta command handlers.
 * @type {ReadonlyArray<string>}
 */
const SERVICE_DEFINITION_COLUMN_LIST = Object.freeze([
  SD_COL.SERVICE_ID,
  SD_COL.SERVICE_NAME,
  SD_COL.SERVICE_PROFILE,
  SD_COL.HANDLER_FUNCTION_ID,
  SD_COL.READ_CONSISTENCY,
  SD_COL.WRITE_CONSISTENCY,
  SD_COL.READ_LOCALITY,
  SD_COL.REPLICA_COUNT,
  SD_COL.PROTOCOL,
  SD_COL.RESOURCE_BUDGET,
  SD_COL.SAFETY_INTERVAL_MS,
  SD_COL.RUNTIME_KIND,
  SD_COL.RUNTIME_REF,
  SD_COL.RUNTIME_CONFIG,
  SD_COL.STATUS,
  SD_COL.CREATED_AT,
  SD_COL.UPDATED_AT,
]);

/**
 * Field name constants for ResourceBudget objects.
 * @enum {string}
 */
const RB_FIELD = Object.freeze({
  CPU_TIME_LIMIT_MS: 'cpuTimeLimitMs',
  MEMORY_LIMIT_BYTES: 'memoryLimitBytes',
  SESSION_SIZE_LIMIT_BYTES: 'sessionSizeLimitBytes',
  SERVICE_SIZE_LIMIT_BYTES: 'serviceSizeLimitBytes',
});

/**
 * Field name constants for TimerEntry objects.
 * @enum {string}
 */
const TE_FIELD = Object.freeze({
  TIMER_ID: 'timerId',
  SERVICE_ID: 'serviceId',
  DELAY_MS: 'delayMs',
  FIRE_AT: 'fireAt',
  PAYLOAD: 'payload',
  STATUS: 'status',
  CREATED_AT: 'createdAt',
});

/**
 * Serialize a ResourceBudget object to a JSON string.
 * @param {Object} budget - ResourceBudget object.
 * @return {string} JSON string representation.
 */
function serializeResourceBudget(budget) {
  const obj = {
    [RB_FIELD.CPU_TIME_LIMIT_MS]:
      budget[RB_FIELD.CPU_TIME_LIMIT_MS] ??
      DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS,
    [RB_FIELD.MEMORY_LIMIT_BYTES]:
      budget[RB_FIELD.MEMORY_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES,
    [RB_FIELD.SESSION_SIZE_LIMIT_BYTES]:
      budget[RB_FIELD.SESSION_SIZE_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES,
    [RB_FIELD.SERVICE_SIZE_LIMIT_BYTES]:
      budget[RB_FIELD.SERVICE_SIZE_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES,
  };
  return JSON.stringify(obj);
}

/**
 * Deserialize a JSON string to a ResourceBudget object.
 * @param {string} json - JSON string representation.
 * @return {Object} ResourceBudget object.
 */
function deserializeResourceBudget(json) {
  const parsed = JSON.parse(json);
  return {
    [RB_FIELD.CPU_TIME_LIMIT_MS]:
      parsed[RB_FIELD.CPU_TIME_LIMIT_MS] ??
      DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS,
    [RB_FIELD.MEMORY_LIMIT_BYTES]:
      parsed[RB_FIELD.MEMORY_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES,
    [RB_FIELD.SESSION_SIZE_LIMIT_BYTES]:
      parsed[RB_FIELD.SESSION_SIZE_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES,
    [RB_FIELD.SERVICE_SIZE_LIMIT_BYTES]:
      parsed[RB_FIELD.SERVICE_SIZE_LIMIT_BYTES] ??
      DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES,
  };
}

/**
 * Serialize a ServiceDefinition object to a table row object.
 * The resource_budget field is JSON-encoded.
 * @param {Object} definition - ServiceDefinition object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeServiceDefinition(definition) {
  const runtimeAware = applyRuntimeDefaults(definition);
  const compat = applyLegacyDefaults(runtimeAware);
  const now = Date.now();
  return {
    [SD_COL.SERVICE_ID]: compat.serviceId,
    [SD_COL.SERVICE_NAME]: compat.serviceName,
    [SD_COL.SERVICE_PROFILE]:
      compat.serviceProfile ??
      SERVICE_PROFILE.DEFAULT,
    [SD_COL.HANDLER_FUNCTION_ID]: compat.handlerFunctionId,
    [SD_COL.READ_CONSISTENCY]:
      compat.readConsistency ??
      WASM_SERVICE_DEFAULT.READ_CONSISTENCY,
    [SD_COL.WRITE_CONSISTENCY]:
      compat.writeConsistency ??
      WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY,
    [SD_COL.READ_LOCALITY]:
      compat.readLocality ??
      WASM_SERVICE_DEFAULT.READ_LOCALITY,
    [SD_COL.REPLICA_COUNT]:
      compat.replicaCount ??
      WASM_SERVICE_DEFAULT.REPLICA_COUNT,
    [SD_COL.PROTOCOL]:
      compat.protocol ??
      WASM_SERVICE_DEFAULT.PROTOCOL,
    [SD_COL.RESOURCE_BUDGET]: serializeResourceBudget(
      compat.resourceBudget || {},
    ),
    [SD_COL.SAFETY_INTERVAL_MS]:
      compat.safetyIntervalMs ??
      WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
    [SD_COL.RUNTIME_KIND]: compat.runtimeKind ?? null,
    [SD_COL.RUNTIME_REF]: compat.runtimeRef ?? null,
    [SD_COL.RUNTIME_CONFIG]: compat.runtimeConfig ?? null,
    [SD_COL.STATUS]:
      compat.status ??
      WASM_SERVICE_DEFINITION_STATUS.ACTIVE,
    [SD_COL.CREATED_AT]: compat.createdAt ?? now,
    [SD_COL.UPDATED_AT]: compat.updatedAt ?? now,
  };
}

/**
 * Deserialize a table row to a ServiceDefinition object.
 * The resource_budget field is parsed from JSON.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} ServiceDefinition object with camelCase keys.
 */
function deserializeServiceDefinition(row) {
  const budgetJson = row[SD_COL.RESOURCE_BUDGET] ||
    STRING.EMPTY_JSON_OBJECT;
  const raw = {
    serviceId: row[SD_COL.SERVICE_ID],
    serviceName: row[SD_COL.SERVICE_NAME],
    serviceProfile:
      row[SD_COL.SERVICE_PROFILE] ??
      SERVICE_PROFILE.DEFAULT,
    handlerFunctionId: row[SD_COL.HANDLER_FUNCTION_ID],
    readConsistency:
      row[SD_COL.READ_CONSISTENCY] ??
      WASM_SERVICE_DEFAULT.READ_CONSISTENCY,
    writeConsistency:
      row[SD_COL.WRITE_CONSISTENCY] ??
      WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY,
    readLocality:
      row[SD_COL.READ_LOCALITY] ??
      WASM_SERVICE_DEFAULT.READ_LOCALITY,
    replicaCount:
      row[SD_COL.REPLICA_COUNT] ??
      WASM_SERVICE_DEFAULT.REPLICA_COUNT,
    protocol:
      row[SD_COL.PROTOCOL] ??
      WASM_SERVICE_DEFAULT.PROTOCOL,
    resourceBudget: deserializeResourceBudget(budgetJson),
    safetyIntervalMs:
      row[SD_COL.SAFETY_INTERVAL_MS] ??
      WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
    runtimeKind: row[SD_COL.RUNTIME_KIND] ?? null,
    runtimeRef: row[SD_COL.RUNTIME_REF] ?? null,
    runtimeConfig: row[SD_COL.RUNTIME_CONFIG] ?? null,
    status:
      row[SD_COL.STATUS] ??
      WASM_SERVICE_DEFINITION_STATUS.ACTIVE,
    createdAt: row[SD_COL.CREATED_AT] ?? 0,
    updatedAt: row[SD_COL.UPDATED_AT] ?? 0,
  };
  return applyRuntimeDefaults(raw);
}

/**
 * Serialize a TimerEntry object to a JSON string.
 * @param {Object} entry - TimerEntry object.
 * @return {string} JSON string for Raft log storage.
 */
function serializeTimerEntry(entry) {
  const obj = {
    [TE_FIELD.TIMER_ID]: entry[TE_FIELD.TIMER_ID],
    [TE_FIELD.SERVICE_ID]: entry[TE_FIELD.SERVICE_ID],
    [TE_FIELD.DELAY_MS]: entry[TE_FIELD.DELAY_MS] ?? 0,
    [TE_FIELD.FIRE_AT]: entry[TE_FIELD.FIRE_AT] ?? 0,
    [TE_FIELD.PAYLOAD]:
      entry[TE_FIELD.PAYLOAD] ?? {},
    [TE_FIELD.STATUS]:
      entry[TE_FIELD.STATUS] ?? TIMER_STATUS.ACTIVE,
    [TE_FIELD.CREATED_AT]:
      entry[TE_FIELD.CREATED_AT] ?? 0,
  };
  return JSON.stringify(obj);
}

/**
 * Deserialize a JSON string to a TimerEntry object.
 * @param {string} json - JSON string from Raft log.
 * @return {Object} TimerEntry object.
 */
function deserializeTimerEntry(json) {
  const parsed = JSON.parse(json);
  return {
    [TE_FIELD.TIMER_ID]: parsed[TE_FIELD.TIMER_ID],
    [TE_FIELD.SERVICE_ID]: parsed[TE_FIELD.SERVICE_ID],
    [TE_FIELD.DELAY_MS]:
      parsed[TE_FIELD.DELAY_MS] ?? 0,
    [TE_FIELD.FIRE_AT]:
      parsed[TE_FIELD.FIRE_AT] ?? 0,
    [TE_FIELD.PAYLOAD]:
      parsed[TE_FIELD.PAYLOAD] ?? {},
    [TE_FIELD.STATUS]:
      parsed[TE_FIELD.STATUS] ?? TIMER_STATUS.ACTIVE,
    [TE_FIELD.CREATED_AT]:
      parsed[TE_FIELD.CREATED_AT] ?? 0,
  };
}

export {
  SD_COL,
  SERVICE_DEFINITION_COLUMN_LIST,
  RB_FIELD,
  TE_FIELD,
  serializeResourceBudget,
  deserializeResourceBudget,
  serializeServiceDefinition,
  deserializeServiceDefinition,
  serializeTimerEntry,
  deserializeTimerEntry,
};
